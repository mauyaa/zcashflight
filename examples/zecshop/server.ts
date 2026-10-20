// ZecShop: a small Zcash checkout. It works, and it leaks, on purpose.
// Every leak is a realistic mistake; ZcashFlight's job is to find each one with evidence.

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { startMockWallet } from './mock/zallet.ts';
import { wallet } from './lib/wallet.ts';
import { track } from './lib/analytics.ts';
import { reportError } from './lib/errors.ts';
import { zecPrice } from './lib/prices.ts';
import { refund } from './lib/refund.ts';
import { sweep } from './server/broadcast.ts';
import { log } from './lib/log.ts';
import { CUSTOMER, customerPays, mine } from './lib/regtest.ts';

const PORT = Number(process.env.PORT ?? 4600);
const CATALOG: Record<string, { name: string; zats: number }> = {
  'sticker-pack': { name: 'Shielded sticker pack', zats: 5_000_000 },
  'hoodie': { name: 'Zebra hoodie', zats: 20_000_000 },
};

export interface Order {
  id: string; number: number; amount: string; payTo: string; memo: string; paymentRequest: string;
  unifiedAddress?: string; transparentAddress?: string;
  status: 'pending' | 'paid' | 'failed' | 'refunded';
}
const orders = new Map<string, Order>();
let next = 4471;

async function body(req: IncomingMessage): Promise<any> {
  let s = '';
  for await (const c of req) s += c;
  return s ? JSON.parse(s) : {};
}
function send(res: ServerResponse, code: number, data: unknown) {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(data));
}

type Route = [string, RegExp, (req: IncomingMessage, m: RegExpExecArray) => Promise<[number, unknown]>];
const routes: Route[] = [
  ['GET', /^\/health$/, async () => [200, { ok: true }]],

  // Customer checks out: create an order and a fresh address to pay to.
  ['POST', /^\/api\/checkout$/, async req => {
    const b = await body(req);
    const zats = (b.items ?? []).reduce((t: number, i: any) => t + (CATALOG[i.sku]?.zats ?? 0) * (i.qty ?? 1), 0);
    const amount = (zats / 1e8).toFixed(2);
    const usd = await zecPrice();
    const recipient = await wallet.newAddress();
    const number = next++;
    const memo = `Order ${number} · paid by ${b.name ?? 'guest'}`;
    // A ZIP 321 payment request: what the checkout page shows as a QR code and a "pay with wallet" link
    const paymentRequest = `zcash:${recipient}?amount=${amount}&memo=${Buffer.from(memo).toString('base64url')}&message=${encodeURIComponent(`ZecShop order ${number}`)}`;
    const order: Order = {
      id: randomUUID(), number, amount, payTo: recipient, memo, paymentRequest,
      unifiedAddress: b.refund_address, transparentAddress: b.legacy_refund_address, status: 'pending',
    };
    orders.set(order.id, order);
    track('checkout', { payment_request: paymentRequest });
    log.info(`order ${number} created`);
    return [201, { order_id: order.id, number, pay_to: recipient, amount_zec: amount, payment_request: paymentRequest, usd: usd ? +(usd * +amount).toFixed(2) : null }];
  }],

  // The wallet saw the payment: move funds to cold storage.
  ['POST', /^\/api\/orders\/([\w-]+)\/paid$/, async (_req, m) => {
    const o = orders.get(m[1]);
    if (!o) return [404, { error: 'no such order' }];
    o.status = 'paid';
    await sweep(o);
    return [200, { status: o.status }];
  }],

  // Fulfilment failed: refund the customer.
  ['POST', /^\/api\/orders\/([\w-]+)\/fail$/, async (_req, m) => {
    const o = orders.get(m[1]);
    if (!o) return [404, { error: 'no such order' }];
    o.status = 'failed';
    await refund(o);
    o.status = 'refunded';
    return [200, { status: o.status }];
  }],

  // Order status asks the wallet, which sometimes times out.
  ['GET', /^\/api\/orders\/([\w-]+)$/, async (req, m) => {
    const o = orders.get(m[1]);
    if (!o) return [404, { error: 'no such order' }];
    try {
      if (new URL(req.url!, 'http://x').searchParams.get('simulate') === 'timeout') throw new Error('wallet RPC timed out after 30s');
      return [200, { status: o.status }];
    } catch (err) {
      reportError(err as Error, { memo: o.memo });
      return [504, { error: 'wallet unavailable, try again' }];
    }
  }],


  // Regtest test harness, not part of the shop: the customer's wallet pays the order for real.
  ...(CUSTOMER ? [['POST', /^\/regtest\/pay\/([\w-]+)$/, async (_req: IncomingMessage, m: RegExpExecArray) => {
    const o = orders.get(m[1]);
    if (!o) return [404, { error: 'no such order' }];
    return [200, { txid: await customerPays(o.payTo, o.amount, o.memo) }];
  }] as Route, ['POST', /^\/regtest\/mine$/, async () => { await mine(3); return [200, { mined: 3 }]; }] as Route] : []),
];

createServer(async (req, res) => {
  const path = new URL(req.url!, 'http://x').pathname;
  for (const [method, re, fn] of routes) {
    const m = re.exec(path);
    if (m && req.method === method) {
      try { const [code, data] = await fn(req, m); return send(res, code, data); }
      catch (e) { log.error(`unhandled: ${(e as Error).message}`); return send(res, 500, { error: 'internal' }); }
    }
  }
  send(res, 404, { error: 'not found' });
}).listen(PORT, '127.0.0.1', async () => {
  if (process.env.WALLET_MOCK !== '0') await startMockWallet();
  console.log(`ZecShop on http://127.0.0.1:${PORT}`);
});
