// A stand-in for zallet's JSON-RPC on testnet port 18232, so ZecShop runs without a node.
// It answers the calls ZecShop makes with the shapes zcashd/zallet return. No funds, no keys.
// To use a real wallet, point WALLET_RPC at a zallet/zcashd regtest node and set WALLET_MOCK=0.

import { createServer } from 'node:http';

// Synthetic testnet values: valid encodings, random payloads, unspendable.
const ADDRESS = 'utest1dh7ukkzyx28wg7kny2qddsnu5yh43726fa5rk4nuyy0p0haa6ey5k7xmmhk3a2dsdaptj07l6qhy9u9ng3lzyuwkjj9frvspzmhznrszpqttf3w7umhgwcs7e3lrsjj8lex42ew4dsetvu3vl28ucxa7d9p4yx67jlxyfqfel4rqnslcr2';
const TXIDS = ['b78cb1fe9f7191acefa6f221fe535421972594ff507a54640c3217e4e5a61ab8', '3c0e5f2a9d41b7c86e2fa013d95b4c7718e6a02f4d9c3b51e70a8f6d2c49b1e5'];
let op = 0;
const ops = new Map<string, string>();

export function startMockWallet(port = Number(new URL(process.env.WALLET_RPC ?? 'http://127.0.0.1:18232').port)): Promise<void> {
  return new Promise(resolve => {
    const srv = createServer(async (req, res) => {
      let s = '';
      for await (const c of req) s += c;
      const { id, method, params } = JSON.parse(s || '{}');
      let result: unknown = null;
      if (method === 'z_getaddressforaccount') result = { account: 0, diversifier_index: op, address: ADDRESS, receiver_types: ['p2pkh', 'sapling', 'orchard'] };
      else if (method === 'z_sendmany') { const o = `opid-${String(++op).padStart(4, '0')}`; ops.set(o, TXIDS[(op - 1) % TXIDS.length]); result = o; }
      else if (method === 'z_getoperationresult') result = (params?.[0] ?? []).map((o: string) => ({ id: o, status: 'success', result: { txid: ops.get(o) } }));
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', id, result, error: null }));
    });
    srv.on('error', () => resolve()); // a wallet is already listening there
    srv.listen(port, '127.0.0.1', () => resolve());
    srv.unref();
  });
}
