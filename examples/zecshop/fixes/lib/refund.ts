// Refunds go back to the customer's unified address and stay shielded.
// FullPrivacy makes the wallet refuse any transaction that would reveal the recipient or amount.

import { wallet, MERCHANT_ADDRESS } from './wallet.ts';
import type { Order } from '../server.ts';

export async function refund(order: Order): Promise<string> {
  if (!order.unifiedAddress) throw new Error(`order ${order.number}: no shielded refund address on file`);
  return wallet.send(MERCHANT_ADDRESS, order.unifiedAddress, order.amount, `Refund for order ${order.number}`, 'FullPrivacy');
}
