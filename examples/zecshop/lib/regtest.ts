// Regtest test harness only. It plays the customer's wallet and mines blocks, so a scenario can make a
// real shielded payment on a local Zebra + Zallet regtest network. It is not part of the shop: the routes
// that use it exist only when REGTEST_CUSTOMER_ADDRESS is set (see regtest/README.md).
// Zallet follows ZIP 315: the wallet's own outputs (change) are spendable after 3 confirmations,
// funds received from elsewhere after 10, so the harness mines accordingly.

import { wallet } from './wallet.ts';

const ZEBRA = process.env.ZEBRA_RPC ?? 'http://127.0.0.1:29232';
const AUTH = 'Basic ' + Buffer.from(`${process.env.WALLET_RPC_USER ?? ''}:${process.env.WALLET_RPC_PASSWORD ?? ''}`).toString('base64');
export const CUSTOMER = process.env.REGTEST_CUSTOMER_ADDRESS;

async function rpc<T>(url: string, method: string, params: unknown[] = []): Promise<T> {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: AUTH }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  const j = await r.json();
  if (j.error) throw new Error(`${method}: ${j.error.message}`);
  return j.result as T;
}

/** Mine blocks on Zebra, then wait until the wallet has scanned them. */
export async function mine(n = 1): Promise<void> {
  await rpc(ZEBRA, 'generate', [n]);
  const wallet = process.env.WALLET_RPC!;
  for (const until = Date.now() + 60_000; Date.now() < until;) {
    const s = await rpc<{ node_tip: { height: number }; fully_synced_height: number }>(wallet, 'getwalletstatus');
    if (s.fully_synced_height >= s.node_tip.height) return;
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('wallet did not catch up with the node');
}

/** The customer pays the order from their own account in the same wallet, then a block confirms it. */
export async function customerPays(to: string, amount: string, memo: string): Promise<string> {
  const txid = await wallet.send(CUSTOMER!, to, amount, memo);
  await mine(1);
  return txid;
}
