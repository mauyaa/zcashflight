// Loaded into the app under test with `node --import`. Observes outbound requests and console output,
// masks them in-process, and appends masked events to the run's capture file.
// With the sinkhole on, requests to non-local hosts are answered locally and never reach the network.

import http from 'node:http';
import https from 'node:https';
import { appendFileSync } from 'node:fs';
import { format } from 'node:util';
import { fileURLToPath, urlToHttpOptions } from 'node:url';
import { syncBuiltinESMExports } from 'node:module';
import { inspectLog, inspectRequest, isLoopback, locate, type RawRequest } from './inspect.ts';
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
  for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    const orig = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      emit(inspectLog(`console.${level}`, format(...args), KEY, where()));
      orig(...args);
    };
  }

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
      let body = '';
      const b = init?.body;
      if (typeof b === 'string') body = b;
      else if (b instanceof URLSearchParams) { body = b.toString(); headers['content-type'] ??= 'application/x-www-form-urlencoded'; }
      else if (b instanceof ArrayBuffer) body = Buffer.from(b).toString('utf8');
      else if (ArrayBuffer.isView(b)) body = Buffer.from(b.buffer, b.byteOffset, b.byteLength).toString('utf8');
      else if (b == null && req && req.body) { try { body = await req.clone().text(); } catch { body = ''; } }
      else if (b != null) body = '[unreadable body: ' + (b?.constructor?.name ?? typeof b) + ']';
      let host = '';
      try { host = new URL(url).host; } catch { /* relative */ }
      const sink = SINKHOLE && host && !isLoopback(host);
      emit(inspectRequest({ method, url, headers, body, via: 'fetch', stack: at, sinkholed: !!sink }, KEY));
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
      const chunks: Buffer[] = [];
      const w = req.write.bind(req), e = req.end.bind(req);
      req.write = ((c: any, ...r: any[]) => { if (c && typeof c !== 'function') chunks.push(Buffer.from(c)); return w(c, ...r); }) as any;
      req.end = ((c: any, ...r: any[]) => {
        if (c && typeof c !== 'function') chunks.push(Buffer.from(c));
        for (const [k, v] of Object.entries(req.getHeaders())) headers[k] ??= String(v);
        const raw: RawRequest = { method, url: url.href, headers, body: Buffer.concat(chunks).toString('utf8'), via: 'http', stack: at, sinkholed: !!sink };
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
