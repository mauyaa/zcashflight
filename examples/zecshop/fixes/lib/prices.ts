// ZEC/USD for the receipt, read from a local cache.
// A scheduled job refreshes data/rates.json, so no third party learns when a checkout happens.

import { readFileSync } from 'node:fs';

export async function zecPrice(): Promise<number | null> {
  try { return JSON.parse(readFileSync('data/rates.json', 'utf8')).zec_usd ?? null; }
  catch { return null; }
}
