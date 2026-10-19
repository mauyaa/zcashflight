// After payment, sweep the order's funds to cold storage.
// The log says that it happened, with the order number, never the txid.

import { wallet, MERCHANT_ACCOUNT, COLD_STORAGE } from '../lib/wallet.ts';
import { log } from '../lib/log.ts';
import type { Order } from '../server.ts';

export async function sweep(order: Order): Promise<void> {
  await wallet.send(MERCHANT_ACCOUNT, COLD_STORAGE, order.amount, `sweep ${order.number}`);
  log.debug(`broadcast ok order=${order.number}`);
}
