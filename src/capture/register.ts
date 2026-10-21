// Loaded into the app under test with `node --import`. Observes outbound requests and console output,
// masks them in-process, and appends masked events to the run's capture file.
// With the sinkhole on, requests to non-local hosts are answered locally and never reach the network.

import http from 'node:http';
import fs from 'node:fs';
import https from 'node:https';
import { appendFileSync } from 'node:fs';
import { format } from 'node:util';
import { fileURLToPath, urlToHttpOptions } from 'node:url';
import { syncBuiltinESMExports } from 'node:module';
import { inspectLog, inspectRequest, isLoopback, locate, type RawRequest } from './inspect.ts';
import { bytesToText, readFetchBody, readCapped, MAX_BODY } from './body.ts';
import type { CaptureEvent } from '../engine/types.ts';

const OUT = process.env.ZCASHFLIGHT_OUT;
const KEY = process.env.ZCASHFLIGHT_KEY ?? '';
const ROOT = process.env.ZCASHFLIGHT_ROOT ?? process.cwd();
const SINKHOLE = process.env.ZCASHFLIGHT_SINKHOLE === '1';
const SELF = new RegExp(fileURLToPath(new URL('..', import.meta.url)).replace(/\\/g, '/').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

function emit(e: CaptureEvent | null) {
  if (!e || !OUT) return;
  try { appendFileSync(OUT, JSON.stringify(e) + '\n'); } catch { /* the app must keep working even if capture fails */ }
}
const where = () => locate(new Error().stack, ROOT, SELF);

if (OUT) {
  /* ---------- console ---------- */
  // console.* writes through process.stdout/stderr: `writing` stops those lines being counted twice
  let writing = 0;
  for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    const orig = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      emit(inspectLog(`console.${level}`, format(...args), KEY, where()));
      writing++;
      try { orig(...args); } finally { writing--; }
    };
  }

  /* ---------- process.stdout / stderr, and raw writes to fd 1 / 2 (pino's sonic-boom and other raw writers) ---------- */
  // ZcashFlight inspects these lines; the app's own output still goes to its stdout unchanged.
  const MAX_PARTIAL = 64 * 1024;
  const partial: Record<'stdout' | 'stderr', string> = { stdout: '', stderr: '' };
  const capture = (name: 'stdout' | 'stderr', chunk: unknown, enc?: unknown) => {
    if (writing) return;
    let text: string;
    try { text = typeof chunk === 'string' ? chunk : Buffer.from(chunk as any).toString(typeof enc === 'string' && Buffer.isEncoding(enc) ? enc : 'utf8'); } catch { return; }
    const lines = (partial[name] + text).split(/\r?\n/);
    partial[name] = lines.pop() ?? '';
    if (partial[name].length > MAX_PARTIAL) { lines.push(partial[name]); partial[name] = ''; }
    for (const line of lines) if (line.trim()) emit(inspectLog(`process.${name}`, line, KEY, where()));
  };
  for (const name of ['stdout', 'stderr'] as const) {
    const stream = process[name], orig = stream.write;
    stream.write = function (this: unknown, chunk: any, ...rest: any[]) {
      capture(name, chunk, typeof rest[0] === 'string' ? rest[0] : undefined);
      writing++;
      try { return (orig as any).call(this, chunk, ...rest); } finally { writing--; }
    } as typeof stream.write;
  }
  const fdName = (fd: unknown) => fd === 1 ? 'stdout' as const : fd === 2 ? 'stderr' as const : null;
  const asBytes = (d: any) => typeof d === 'string' ? d : ArrayBuffer.isView(d) ? Buffer.from(d.buffer, d.byteOffset, d.byteLength) : null;
  const origWriteSync = fs.writeSync, origWrite = fs.write;
  (fs as any).writeSync = function (this: unknown, fd: any, data: any, ...rest: any[]) {
    const n = fdName(fd), b = n && asBytes(data);
    if (n && b != null) capture(n, b, typeof rest[1] === 'string' ? rest[1] : undefined);
    writing++;
    try { return (origWriteSync as any).call(this, fd, data, ...rest); } finally { writing--; }
  };
  (fs as any).write = function (this: unknown, fd: any, data: any, ...rest: any[]) {
    const n = fdName(fd), b = n && asBytes(data);
    if (n && b != null) capture(n, b);
    writing++;
    try { return (origWrite as any).call(this, fd, data, ...rest); } finally { writing--; }
  };
  process.on('exit', () => { for (const n of ['stdout', 'stderr'] as const) if (partial[n].trim()) emit(inspectLog(`process.${n}`, partial[n], KEY, [])); });

  /* ---------- fetch ---------- */
  const origFetch = globalThis.fetch;
  if (origFetch) {
    globalThis.fetch = async function (this: unknown, input: any, init?: any) {
      const at = where();
      const req = input instanceof Request ? input : null;
      const url = String(req ? req.url : input instanceof URL ? input.href : input);
      const method = String(init?.method ?? req?.method ?? 'GET');
      const headers: Record<string, string> = {};
      new Headers(init?.headers ?? req?.headers ?? {}).forEach((v, k) => { headers[k] = v; });
      let host = '';
      try { host = new URL(url).host; } catch { /* relative */ }
      const sink = SINKHOLE && host && !isLoopback(host);
      const b = init?.body;
      let read: Awaited<ReturnType<typeof readFetchBody>>;
      try {
        if (b == null && req?.body) {
          // a Request with its own body: read a clone, so the original is still sent untouched
          const { data, truncated } = await readCapped(req.clone().body!);
          read = { body: bytesToText(data, headers, truncated) };
        } else read = await readFetchBody(b, headers, !!sink);
      } catch (e: any) {
        read = { body: { text: '', uninspected: [{ what: 'request body', reason: `could not be read (${String(e?.name ?? 'error')})` }] } };
      }
      const record = (t: typeof read.body) => emit(inspectRequest({ method, url, headers, body: t.text, contentType: t.contentType, decoded: t.decoded, uninspected: t.uninspected, via: 'fetch', stack: at, sinkholed: !!sink }, KEY));
      if (read.pending) read.pending.then(record); else record(read.body);
      if (read.replace) init = { ...init, body: read.replace };
      if (sink) return new Response('{}', { status: 202, headers: { 'content-type': 'application/json', 'x-zcashflight': 'sinkhole' } });
      // Native fetch follows redirects internally, bypassing this hook. In sinkhole
      // mode return redirects to the caller instead of allowing an unseen network hop.
      const response = await origFetch.call(this, input, SINKHOLE ? { ...init, redirect: 'manual' } : init);
      if (SINKHOLE && [301, 302, 303, 307, 308].includes(response.status) && response.headers.has('location') && (init?.redirect ?? req?.redirect ?? 'follow') !== 'manual') {
        await response.body?.cancel();
        throw new TypeError('ZcashFlight sinkhole blocked an automatic redirect; use redirect: "manual" and fetch the destination explicitly.');
      }
      return response;
    } as typeof fetch;
  }

  /* ---------- http / https ---------- */
  let sinkPort = 0;
  const origHttpRequest = http.request;
  if (SINKHOLE) {
    const srv = http.createServer((q, s) => { q.resume(); q.on('end', () => { s.writeHead(202, { 'content-type': 'application/json', 'x-zcashflight': 'sinkhole' }); s.end('{}'); }); });
    await new Promise<void>((resolve, reject) => {
      srv.once('error', reject);
      srv.listen(0, '127.0.0.1', () => { sinkPort = (srv.address() as any).port; resolve(); });
    });
    srv.unref();
  }

  function patch(mod: typeof http | typeof https, proto: 'http:' | 'https:') {
    const orig = mod.request;
    const wrapped = function (this: unknown, ...args: any[]) {
      const at = where();
      let url: URL, opts: any = {}, cb: any;
      if (typeof args[0] === 'string' || args[0] instanceof URL) {
        url = new URL(String(args[0]));
        if (typeof args[1] === 'function') cb = args[1]; else { opts = args[1] ?? {}; cb = args[2]; }
        opts = { ...urlToHttpOptions(url), ...opts };
      } else {
        opts = args[0] ?? {}; cb = args[1];
      }
      const hostname = opts.hostname ?? opts.host ?? 'localhost';
      const host = hostname.includes(':') && !hostname.startsWith('[') ? `[${hostname}]` : hostname;
      const port = opts.port ? `:${opts.port}` : '';
      url = new URL(`${opts.protocol ?? proto}//${host}${port}${opts.path ?? '/'}`);
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(opts.headers ?? {})) headers[k.toLowerCase()] = String(v);
      const method = String(opts.method ?? 'GET');
      const sink = SINKHOLE && sinkPort && !isLoopback(url.host);
      const req = sink
        ? origHttpRequest({ host: '127.0.0.1', port: sinkPort, path: url.pathname + url.search, method, headers }, cb)
        : orig.apply(this, args as any);
      // keep up to MAX_BODY of what is written, in memory only; the request itself is untouched
      const chunks: Buffer[] = [];
      let size = 0, truncated = false;
      const keep = (c: any, enc?: unknown) => {
        if (c == null || typeof c === 'function' || truncated) return;
        const buf = typeof c === 'string' ? Buffer.from(c, typeof enc === 'string' && Buffer.isEncoding(enc) ? enc : 'utf8') : Buffer.from(c);
        if (size + buf.length > MAX_BODY) { chunks.push(buf.subarray(0, MAX_BODY - size)); size = MAX_BODY; truncated = true; return; }
        chunks.push(buf); size += buf.length;
      };
      const w = req.write.bind(req), e = req.end.bind(req);
      req.write = ((c: any, ...r: any[]) => { keep(c, r[0]); return w(c, ...r); }) as any;
      req.end = ((c: any, ...r: any[]) => {
        keep(c, r[0]);
        for (const [k, v] of Object.entries(req.getHeaders())) headers[k] ??= String(v);
        const t = bytesToText(Buffer.concat(chunks), headers, truncated);
        const raw: RawRequest = { method, url: url.href, headers, body: t.text, decoded: t.decoded, uninspected: t.uninspected, via: 'http', stack: at, sinkholed: !!sink };
        emit(inspectRequest(raw, KEY));
        return e(c, ...r);
      }) as any;
      return req;
    };
    (mod as any).request = wrapped;
    (mod as any).get = function (...a: any[]) { const r = (wrapped as any)(...a); r.end(); return r; };
  }
  patch(http, 'http:');
  patch(https, 'https:');
  syncBuiltinESMExports(); // keep `import { request } from 'node:http'` in sync with the patch
}
