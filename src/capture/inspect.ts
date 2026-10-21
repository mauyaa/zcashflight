// Turns one raw observation (an outbound request or a log line) into a masked CaptureEvent.
// This is the only place raw values are handled; what it returns is safe to write to disk.

import { scanBody, scanUrl, scanText, scanValue, uniqueHits, type Hit } from '../zcash/detect.ts';
import { classifyToken, type Pool } from '../zcash/identifiers.ts';
import { maskHit, maskString } from '../engine/mask.ts';
import type { CaptureEvent, Location, RpcCall } from '../engine/types.ts';
import { isIP } from 'node:net';
import { realpathSync } from 'node:fs';
import type { Uninspected } from './body.ts';

const SENSITIVE_HEADERS = /^(authorization|cookie|x-api-key|proxy-authorization)$/i;
const MAX_LINE = 400;

export interface RawRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
  via: CaptureEvent['via'];
  stack?: Location[];
  sinkholed?: boolean;
  contentType?: string;        // when the body was re-encoded for scanning (FormData is scanned as JSON)
  decoded?: string;            // content-encoding or form decoding that was undone before scanning
  uninspected?: Uninspected[]; // parts of this request ZcashFlight could not read
}

let seq = 0;
export function nextSeq(): number { return ++seq; }

export function isLoopback(host: string): boolean {
  let h = host.toLowerCase();
  if (h.startsWith('[')) h = h.slice(1, h.indexOf(']'));
  else if (isIP(h) !== 6) h = h.replace(/:\d+$/, '');
  return h === 'localhost' || h === '::1' || (isIP(h) === 4 && h.startsWith('127.'));
}

export function inspectRequest(r: RawRequest, key: string): CaptureEvent {
  const stack = r.stack ?? [];
  let host = '';
  try { host = new URL(r.url).host.toLowerCase(); } catch { /* relative or bad url */ }
  const ct = r.contentType ?? Object.entries(r.headers).find(([k]) => k.toLowerCase() === 'content-type')?.[1] ?? '';
  const headerHits: Hit[] = [];
  for (const [k, v] of Object.entries(r.headers)) {
    if (SENSITIVE_HEADERS.test(k)) continue; // credentials are never inspected or recorded
    headerHits.push(...scanText(String(v), `header.${k.toLowerCase()}`));
  }
  // a body that had to be decoded first says so in its evidence path: body[gzip].address, body[form-data].address
  const tag = r.decoded === 'multipart/form-data' ? 'form-data' : r.decoded;
  const bodyHits = scanBody(r.body, ct).map(h => tag && h.path.startsWith('body') ? { ...h, path: `body[${tag}]` + h.path.slice(4) } : h);
  const hits = uniqueHits([...scanUrl(r.url), ...headerHits, ...bodyHits]);
  return {
    seq: nextSeq(), t: Date.now(), type: 'request',
    method: r.method.toUpperCase(), url: maskedUrl(r.url, hits), host, loopback: isLoopback(host),
    headers: Object.keys(r.headers).map(k => k.toLowerCase()),
    fields: bodyFields(r.body, ct)?.map(p => maskString(p, [...hits, ...scanText(p)])),
    bytes: Buffer.byteLength(r.body),
    sinkholed: r.sinkholed, via: r.via,
    ...(r.decoded ? { decoded: r.decoded } : {}),
    ...(r.uninspected?.length ? { uninspected: r.uninspected } : {}),
    rpc: parseRpc(r.body),
    hits: hits.map(h => maskHit(h, key)),
    ...(stack.length ? { at: stack[0], stack } : {}),
  };
}

export function inspectLog(source: string, text: string, key: string, stack: Location[] = []): CaptureEvent | null {
  const hits = uniqueHits(parseStructuredLog(text) ?? scanText(text, 'log'));
  return {
    seq: nextSeq(), t: Date.now(), type: 'log', source,
    line: truncate(maskedLog(text, hits)),
    hits: hits.map(h => maskHit(h, key)),
    ...(stack.length ? { at: stack[0], stack } : {}),
  };
}

// Normalise URL encoding before masking, and never retain URL credentials.
function maskedUrl(raw: string, hits: Hit[]): string {
  try {
    const u = new URL(raw);
    u.username = ''; u.password = '';
    const decode = (s: string) => { try { return decodeURIComponent(s); } catch { return s; } };
    u.pathname = maskString(decode(u.pathname), hits);
    const query = [...u.searchParams];
    u.search = '';
    for (const [k, v] of query) u.searchParams.append(maskString(k, hits), maskString(v, hits));
    u.hash = maskString(decode(u.hash), hits);
    return u.href;
  } catch { return maskString(raw, hits); }
}

// JSON escapes and numeric spellings (e.g. 1e-8) differ from decoded hit values.
// Mask decoded leaves, then serialize, so escaped secrets cannot survive.
function maskedLog(text: string, hits: Hit[]): string {
  try {
    const value = JSON.parse(text);
    const walk = (v: any): any => {
      if (Array.isArray(v)) return v.map(walk);
      if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [maskString(k, hits), walk(x)]));
      if (typeof v === 'string' || typeof v === 'number') {
        const s = String(v), masked = maskString(s, hits);
        return masked === s ? v : masked;
      }
      return v;
    };
    return JSON.stringify(walk(value));
  } catch { return maskString(text, hits); }
}

/** JSON-lines loggers (pino, winston json): keep field names as context for amounts and memos. */
function parseStructuredLog(text: string): Hit[] | null {
  const t = text.trim();
  try { return scanValue(JSON.parse(t), 'log'); } catch { return null; }
}

function truncate(s: string): string { return s.length > MAX_LINE ? s.slice(0, MAX_LINE) + '…' : s; }

function bodyFields(body: string, ct: string): string[] | undefined {
  const t = body.trim();
  if (!t) return undefined;
  try {
    if (/json/.test(ct) || /^[[{]/.test(t)) {
      const out: string[] = [];
      const walk = (v: unknown, p: string) => {
        if (v && typeof v === 'object' && !Array.isArray(v)) for (const [k, x] of Object.entries(v)) walk(x, p ? `${p}.${k}` : k);
        else if (Array.isArray(v)) v.slice(0, 3).forEach((x, i) => walk(x, `${p}[${i}]`));
        else out.push(p);
      };
      walk(JSON.parse(t), '');
      return out.slice(0, 40);
    }
  } catch { /* fall through */ }
  if (/^[\w.%-]+=/.test(t)) return [...new URLSearchParams(t).keys()].slice(0, 40);
  return undefined;
}

// zcashd / zallet JSON-RPC methods that move funds, and how their recipients are passed.
const SEND_METHODS = new Set(['z_sendmany', 'sendtoaddress', 'sendmany', 'z_shieldcoinbase', 'z_mergetoaddress', 'z_sendfromaccount']);

function poolOf(addr: unknown): Pool | 'unknown' {
  if (typeof addr !== 'string') return 'unknown';
  return classifyToken(addr)?.pool ?? (addr === 'ANY_TADDR' ? 'transparent' : 'unknown');
}

export function parseRpc(body: string): RpcCall | undefined {
  const t = body.trim();
  if (!t.startsWith('{')) return undefined;
  let j: any;
  try { j = JSON.parse(t); } catch { return undefined; }
  if (!j || typeof j.method !== 'string' || !SEND_METHODS.has(j.method)) return undefined;
  const p = Array.isArray(j.params) ? j.params : [];
  const call: RpcCall = { method: j.method, toPools: [] };
  switch (j.method) {
    case 'z_sendmany':
      // z_sendmany "fromaddress" [{"address": ..., "amount": ...}] minconf fee "privacyPolicy"
      call.fromPool = poolOf(p[0]);
      call.toPools = Array.isArray(p[1]) ? p[1].map((o: any) => poolOf(o?.address)) : [];
      if (typeof p[4] === 'string') call.privacyPolicy = /^(FullPrivacy|LegacyCompat|AllowRevealedAmounts|AllowRevealedRecipients|AllowRevealedSenders|AllowFullyTransparent|AllowLinkingAccountAddresses|NoPrivacy)$/.test(p[4]) ? p[4] : '[unrecognised policy]';
      break;
    case 'sendtoaddress': call.fromPool = 'transparent'; call.toPools = [poolOf(p[0])]; break;
    case 'sendmany': call.fromPool = 'transparent'; call.toPools = Object.keys(p[1] ?? {}).map(poolOf); break;
    case 'z_shieldcoinbase': call.fromPool = 'transparent'; call.toPools = [poolOf(p[1])]; break;
    case 'z_mergetoaddress': call.fromPool = 'unknown'; call.toPools = [poolOf(p[1])]; break;
    default: call.toPools = [];
  }
  return call;
}

const realCache = new Map<string, string>();
function real(p: string): string {
  let v = realCache.get(p);
  if (v === undefined) { try { v = realpathSync.native(p); } catch { v = p; } realCache.set(p, v); }
  return v;
}

/** Where in the app's own code did this happen? Project frames only (no node_modules, no ZcashFlight), innermost first. */
export function locate(stack: string | undefined, root: string, skip: RegExp, max = 5): Location[] {
  if (!stack) return [];
  const norm = (p: string) => p.replace(/\\/g, '/');
  // macOS temp folders are symlinks (/var -> /private/var) and stack frames carry the real path, so accept both spellings
  const roots = [...new Set([root, real(root)].map(p => norm(p).replace(/\/$/, '') + '/'))];
  const out: Location[] = [];
  for (const line of stack.split('\n').slice(1)) {
    // file:///tmp/app/x.ts (POSIX) and file:///C:/app/x.ts (Windows): keep the path's own leading slash
    const m = /at (?:(.+?) \()?(?:file:\/\/)?(.+?):(\d+):(\d+)\)?$/.exec(line.trim());
    if (!m) continue;
    let file = norm(decodeURIComponent(m[2]));
    if (/^\/[A-Za-z]:\//.test(file)) file = file.slice(1);
    const r = roots.find(x => file.toLowerCase().startsWith(x.toLowerCase()));
    if (!r || /node_modules|^node:/.test(file) || skip.test(file)) continue;
    const fn = m[1]?.replace(/^async /, '').replace(/^Object\./, '');
    out.push({ file: file.slice(r.length), line: +m[3], col: +m[4], ...(fn && fn !== '<anonymous>' ? { fn } : {}) });
    if (out.length >= max) break;
  }
  return out;
}
