// Refunds go back to the address the customer gave at checkout.

import { wallet, MERCHANT_ADDRESS } from './wallet.ts';
import type { Order } from '../server.ts';

export async function refund(order: Order): Promise<string> {
  // Older checkouts collected a transparent address, so prefer it when present.
  const to = order.transparentAddress ?? order.unifiedAddress!;
  return wallet.send(MERCHANT_ADDRESS, to, order.amount, order.transparentAddress ? null : `Refund for order ${order.number}`, 'AllowRevealedRecipients');
}
