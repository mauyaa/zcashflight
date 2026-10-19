// Refunds go back to the address the customer gave at checkout.

import { wallet, MERCHANT_ACCOUNT } from './wallet.ts';
import type { Order } from '../server.ts';

export async function refund(order: Order): Promise<string> {
  // Older checkouts collected a transparent address, so prefer it when present.
  const to = order.transparentAddress ?? order.unifiedAddress!;
  return wallet.send(MERCHANT_ACCOUNT, to, order.amount, `Refund for order ${order.number}`, 'AllowRevealedRecipients');
}
