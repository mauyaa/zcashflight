// Reads what an outbound request body actually contains, within fixed limits, without changing what the
// app sends. Whatever cannot be read is returned as an "uninspected" note instead of being treated as clean.
// Bytes read here stay in memory: only the masked event built from them is ever written.

import { gunzipSync, inflateSync, inflateRawSync, brotliDecompressSync } from 'node:zlib';

export const MAX_BODY = 5 * 1024 * 1024;       // per body, compressed and decompressed
const MAX_LABEL = 60;

export interface Uninspected { what: string; reason: string }
export interface BodyText { text: string; contentType?: string; uninspected: Uninspected[]; decoded?: string }

const utf8 = new TextDecoder('utf-8', { fatal: true });
const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;
const label = (s: string) => s.length > MAX_LABEL ? s.slice(0, MAX_LABEL) + '…' : s;

/** Undo a declared content-encoding (or gzip / zlib recognised by their headers), then require UTF-8 text. */
export function bytesToText(input: Buffer, headers: Record<string, string> = {}, truncated = false): BodyText {
  const out: BodyText = { text: '', uninspected: [] };
  if (truncated) out.uninspected.push({ what: 'request body', reason: `over ${mb(MAX_BODY)}; only the first ${mb(MAX_BODY)} was checked` });
  const declared = (headers['content-encoding'] ?? '').toLowerCase().trim();
  let data = input;
  if (declared && declared !== 'identity') {
    const r = decompress(input, declared, true);
    if ('error' in r) { out.uninspected.push({ what: `${declared}-encoded request body`, reason: r.error }); return out; }
    data = r.data; out.decoded = declared;
  } else if (input.length > 2 && input[0] === 0x1f && input[1] === 0x8b) {
    // gzip magic bytes (RFC 1952) without a header: decode if it really is gzip, otherwise read as-is
    const r = decompress(input, 'gzip', false);
    if ('data' in r) { data = r.data; out.decoded = 'gzip'; }
    else if (r.error.startsWith('decompresses to more')) { out.uninspected.push({ what: 'gzip request body', reason: r.error }); return out; }
  } else if (input.length > 2 && (input[0] & 0x0f) === 8 && (input[0] >> 4) <= 7 && ((input[0] << 8) | input[1]) % 31 === 0) {
    // zlib header (RFC 1950): checksum-valid CMF/FLG bytes; plain text that only looks like one is read as-is
    const r = decompress(input, 'deflate', false);
    if ('data' in r) { data = r.data; out.decoded = 'deflate'; }
  }
  try { out.text = utf8.decode(data); }
  catch {
    // Binary (protobuf, msgpack, images): identifiers stored as ASCII inside are still checked
    out.text = data.toString('latin1');
    out.uninspected.push({ what: 'request body', reason: `binary (${data.length} bytes); only text-like identifiers inside were checked` });
  }
  return out;
}

function decompress(buf: Buffer, enc: string, declared: boolean): { data: Buffer } | { error: string } {
  if (buf.length > MAX_BODY) return { error: `compressed body over ${mb(MAX_BODY)}` };
  const opts = { maxOutputLength: MAX_BODY };
  try {
    if (enc === 'gzip' || enc === 'x-gzip') return { data: gunzipSync(buf, opts) };
    if (enc === 'deflate') { try { return { data: inflateSync(buf, opts) }; } catch (e: any) { if (e?.code === 'ERR_BUFFER_TOO_LARGE') throw e; return { data: inflateRawSync(buf, opts) }; } }
    if (enc === 'br') return { data: brotliDecompressSync(buf, opts) };
    return { error: `unsupported content-encoding "${label(enc)}"` };
  } catch (e: any) {
    if (e?.code === 'ERR_BUFFER_TOO_LARGE' || e instanceof RangeError) return { error: `decompresses to more than ${mb(MAX_BODY)}` };
    return { error: declared ? `malformed ${enc} data` : 'not valid compressed data' };
  }
}

/** Read up to MAX_BODY bytes from a web stream, then stop (cancelling the rest of this branch only). */
export async function readCapped(stream: ReadableStream<Uint8Array>): Promise<{ data: Buffer; truncated: boolean }> {
  const reader = stream.getReader(), chunks: Buffer[] = [];
  let size = 0, truncated = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const c = Buffer.from(value);
      if (size + c.length > MAX_BODY) { chunks.push(c.subarray(0, MAX_BODY - size)); size = MAX_BODY; truncated = true; break; }
      chunks.push(c); size += c.length;
    }
  } finally {
    if (truncated) await reader.cancel().catch(() => {}); else reader.releaseLock();
  }
  return { data: Buffer.concat(chunks), truncated };
}

const TEXTY = /^(text\/|application\/(json|x-www-form-urlencoded|xml|javascript|ld\+json|x-ndjson)|$)/i;

/** A fetch() body of any kind. Never consumes the caller's body: Blobs and FormData are re-readable,
 *  and a stream is read from a tee branch (`replace` is what fetch should send instead). */
export async function readFetchBody(b: unknown, headers: Record<string, string>, sinkholed: boolean): Promise<{ body: BodyText; replace?: ReadableStream; pending?: Promise<BodyText> }> {
  if (b == null) return { body: { text: '', uninspected: [] } };
  if (typeof b === 'string') return { body: { text: b, uninspected: [] } };
  if (b instanceof URLSearchParams) return { body: { text: b.toString(), contentType: 'application/x-www-form-urlencoded', uninspected: [] } };
  if (b instanceof ArrayBuffer) return { body: bytesToText(Buffer.from(b), headers) };
  if (ArrayBuffer.isView(b)) return { body: bytesToText(Buffer.from(b.buffer, b.byteOffset, b.byteLength), headers) };
  if (typeof Blob !== 'undefined' && b instanceof Blob) {
    if (b.size > MAX_BODY) return { body: { text: '', uninspected: [{ what: `request body (Blob${b.type ? ', ' + label(b.type) : ''})`, reason: `over ${mb(MAX_BODY)}` }] } };
    const t = bytesToText(Buffer.from(await b.arrayBuffer()), headers);
    return { body: { ...t, contentType: b.type || undefined } };
  }
  if (typeof FormData !== 'undefined' && b instanceof FormData) return { body: await readFormData(b) };
  if (typeof ReadableStream !== 'undefined' && b instanceof ReadableStream) {
    if (b.locked) return { body: { text: '', uninspected: [{ what: 'request body (ReadableStream)', reason: 'already locked by another reader' }] } };
    if (sinkholed) {
      // Not sent anywhere: the sinkhole answers instead, so the stream can be read directly
      const { data, truncated } = await readCapped(b);
      return { body: bytesToText(data, headers, truncated) };
    }
    // Really sent: fetch gets one tee branch and starts at once; the other is read alongside it, so a
    // streaming client that waits on the server is never held up by inspection
    const [send, look] = b.tee();
    const pending = readCapped(look).then(({ data, truncated }) => bytesToText(data, headers, truncated),
      () => ({ text: '', uninspected: [{ what: 'request body (ReadableStream)', reason: 'the stream failed while being read' }] }));
    return { body: { text: '', uninspected: [] }, replace: send, pending };
  }
  const ctor = (b as any)?.constructor?.name;
  const kind = ctor && ctor !== 'Object' ? ctor
    : typeof (b as any)?.[Symbol.asyncIterator] === 'function' ? 'async iterable'
    : typeof (b as any)?.[Symbol.iterator] === 'function' ? 'iterable' : typeof b;
  return { body: { text: '', uninspected: [{ what: `request body (${label(String(kind))})`, reason: 'a body type ZcashFlight cannot read' }] } };
}

async function readFormData(f: FormData): Promise<BodyText> {
  const fields: Record<string, string | string[]> = {}, uninspected: Uninspected[] = [];
  let total = 0;
  for (const [name, v] of f.entries()) {
    let text: string | null = null;
    if (typeof v === 'string') text = v;
    else {
      const file = v as File, what = `FormData file "${label(name)}"${file.type ? ` (${label(file.type)})` : ''}`;
      if (file.size > MAX_BODY - total) { uninspected.push({ what, reason: `over ${mb(MAX_BODY)}` }); continue; }
      if (!TEXTY.test(file.type)) { uninspected.push({ what, reason: 'binary file' }); continue; }
      try { text = utf8.decode(Buffer.from(await file.arrayBuffer())); } catch { uninspected.push({ what, reason: 'not UTF-8 text' }); continue; }
    }
    total += Buffer.byteLength(text);
    if (total > MAX_BODY) { uninspected.push({ what: `FormData field "${label(name)}"`, reason: `form over ${mb(MAX_BODY)}` }); break; }
    const prev = fields[name];
    fields[name] = prev === undefined ? text : Array.isArray(prev) ? [...prev, text] : [prev, text];
  }
  // Scanned as JSON so each value keeps its field name (body.<name>) as context
  return { text: JSON.stringify(fields), contentType: 'application/json', uninspected, decoded: 'multipart/form-data' };
}
