// A local forward proxy for apps that are not Node: set HTTP_PROXY / HTTPS_PROXY to it.
// Plain HTTP requests are inspected in full. HTTPS (CONNECT) is not decrypted: the proxy records
// the destination host only, which is still enough for third-party data-flow checks (rule D).

import http from 'node:http';
import net from 'node:net';
import { appendFileSync } from 'node:fs';
import { inspectRequest, isLoopback, nextSeq } from './inspect.ts';
import type { CaptureEvent } from '../engine/types.ts';

export interface ProxyOptions { port?: number; out: string; key: string; sinkhole: boolean; onEvent?: (e: CaptureEvent) => void }

export function startProxy(o: ProxyOptions): Promise<{ port: number; close: () => void }> {
  const emit = (e: CaptureEvent) => { appendFileSync(o.out, JSON.stringify(e) + '\n'); o.onEvent?.(e); };

  const server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = Buffer.concat(chunks);
    const url = req.url ?? '/';
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) if (v != null && !/^proxy-/i.test(k)) headers[k] = String(v);
    let host = '';
    try { host = new URL(url).host; } catch { host = req.headers.host ?? ''; }
    const sink = o.sinkhole && !isLoopback(host);
    emit(inspectRequest({ method: req.method ?? 'GET', url, headers, body: body.toString('utf8'), via: 'proxy', sinkholed: sink }, o.key));
    if (sink) { res.writeHead(202, { 'content-type': 'application/json', 'x-zcashflight': 'sinkhole' }); res.end('{}'); return; }
    const up = http.request(url, { method: req.method, headers }, r => { res.writeHead(r.statusCode ?? 502, r.headers); r.pipe(res); });
    up.on('error', () => { res.writeHead(502); res.end(); });
    up.end(body);
  });

  server.on('connect', (req, socket, head) => {
    const target = req.url ?? '';
    const [h, p] = target.split(':');
    const sink = o.sinkhole && !isLoopback(target);
    emit({ seq: nextSeq(), t: Date.now(), type: 'request', method: 'CONNECT', url: `https://${target}/`, host: target.replace(/:443$/, ''),
      loopback: isLoopback(target), via: 'proxy', sinkholed: sink, hits: [], fields: undefined });
    if (sink) { socket.end('HTTP/1.1 403 Blocked by ZcashFlight sinkhole\r\n\r\n'); return; }
    const up = net.connect(Number(p ?? 443), h, () => { socket.write('HTTP/1.1 200 Connection Established\r\n\r\n'); up.write(head); up.pipe(socket); socket.pipe(up); });
    up.on('error', () => socket.destroy());
    socket.on('error', () => up.destroy());
  });

  return new Promise(resolve => server.listen(o.port ?? 0, '127.0.0.1', () => {
    resolve({ port: (server.address() as net.AddressInfo).port, close: () => server.close() });
  }));
}
