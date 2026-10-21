// Reference app for leak channels: each route sends the same synthetic Zcash address (or txid) to an
// analytics endpoint through a different channel. Values come from synth, so nothing real is used.
// Run by test/channels.test.ts with test/fixtures/channels/zcashflight.yml (sinkhole on).
import http from 'node:http';
import { gzipSync } from 'node:zlib';
import { synth } from '../../../src/zcash/synth.ts';

const ADDR = synth.unifiedAddress('channels');
const TXID = synth.txid('channels');
const A = 'https://analytics.example.com/track';
const ev = { event: 'checkout', address: ADDR };
const PORT = Number(process.env.PORT ?? 4700);

const routes: Record<string, () => Promise<void> | void> = {
  '/control-json': () => fetch(A, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(ev) }).then(() => {}),
  '/base64-body': () => fetch(A, { method: 'POST', body: 'data=' + Buffer.from(JSON.stringify(ev)).toString('base64') }).then(() => {}),
  '/gzip-body': () => new Promise<void>(r => {
    const q = http.request('http://analytics.example.com/track', { method: 'POST', headers: { 'content-encoding': 'gzip', 'content-type': 'application/json' } }, s => { s.resume(); s.on('end', r); });
    q.end(gzipSync(JSON.stringify(ev)));
  }),
  '/formdata': () => { const f = new FormData(); f.append('address', ADDR); return fetch(A, { method: 'POST', body: f }).then(() => {}); },
  '/blob': () => fetch(A, { method: 'POST', body: new Blob([JSON.stringify(ev)]) }).then(() => {}),
  '/batch-array': () => fetch(A, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ batch: [1, 2, 3, 4, 5, 6].map(i => i === 6 ? ev : { event: 'view' + i }) }) }).then(() => {}),
  '/query-string': () => fetch(A + '?addr=' + encodeURIComponent(ADDR)).then(() => {}),
  '/stdout-write': () => { process.stdout.write(JSON.stringify({ level: 30, msg: 'paid', txid: TXID }) + '\n'); },
  '/console-log': () => { console.log('paid txid', TXID); },

  // Bodies ZcashFlight must read, or else report as uninspected (zcashflight.uninspected.yml)
  '/stream-body': () => fetch(A, { method: 'POST', body: new Blob([JSON.stringify(ev)]).stream(), duplex: 'half' } as RequestInit).then(() => {}),
  '/async-iterable-body': () => fetch(A, { method: 'POST', body: (async function* () { yield new TextEncoder().encode(JSON.stringify(ev)); })() as any, duplex: 'half' } as RequestInit).then(() => {}),
  '/oversized-blob': () => fetch(A, { method: 'POST', body: new Blob([JSON.stringify(ev), ' '.repeat(6 * 1024 * 1024)]) }).then(() => {}),
  '/gzip-bomb': () => fetch(A, { method: 'POST', headers: { 'content-encoding': 'gzip', 'content-type': 'application/json' }, body: gzipSync(Buffer.alloc(8 * 1024 * 1024, 0x20)) }).then(() => {}),
  '/binary-body': () => fetch(A, { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: new Uint8Array(Array.from({ length: 64 }, (_, i) => (i * 37 + 128) % 256)) }).then(() => {}),
};

http.createServer(async (req, res) => {
  if (req.url === '/health') return res.end('ok');
  const fn = routes[req.url ?? ''];
  if (!fn) { res.statusCode = 404; return res.end(); }
  try { await fn(); res.end('done'); } catch (e) { res.statusCode = 500; res.end(String(e)); }
}).listen(PORT, '127.0.0.1');
