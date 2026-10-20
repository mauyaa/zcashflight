// The before/after proof on a real Zcash regtest chain (Zebra + Zallet via Z3):
//   1. ZecShop as shipped: ZcashFlight must find the leaks and fail the CI gate (exit 1)
//   2. apply the code fixes
//   3. the same scenarios again: the gate must pass (exit 0)
// Payments, sweeps and refunds are real transactions built by Zallet and mined by Zebra.
//   npm run regtest            (from the repository root, with the Z3 regtest stack running)

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHOP = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(SHOP, '..', '..', 'bin', 'zcashflight.js');
const ZEBRA = process.env.ZEBRA_RPC ?? 'http://127.0.0.1:29232';
const AUTH = 'Basic ' + Buffer.from(`${process.env.RPC_USER ?? 'zebra'}:${process.env.RPC_PASSWORD ?? 'zebra'}`).toString('base64');

const node = (args: string[], quiet = false) => spawnSync(process.execPath, args, { cwd: SHOP, stdio: quiet ? 'pipe' : 'inherit', encoding: 'utf8' });
async function height(): Promise<number> {
  const r = await fetch(ZEBRA, { method: 'POST', headers: { 'content-type': 'application/json', authorization: AUTH }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getblockcount', params: [] }) });
  return (await r.json()).result;
}
async function txsSince(from: number): Promise<number> {
  let n = 0;
  for (let h = from + 1; h <= await height(); h++) {
    const r = await fetch(ZEBRA, { method: 'POST', headers: { 'content-type': 'application/json', authorization: AUTH }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getblock', params: [String(h), 1] }) });
    n += Math.max(0, ((await r.json()).result?.tx?.length ?? 1) - 1);   // not counting coinbase
  }
  return n;
}
const step = (s: string) => console.log(`\n\x1b[1m── ${s}\x1b[0m\n`);

step('0. Prepare the regtest wallet');
if (node(['regtest/setup.ts']).status !== 0) process.exit(2);
const start = await height();

step('1. ZecShop as shipped, against Zebra + Zallet');
node(['scripts/fixes.ts', 'reset'], true);
const before = node([CLI, 'run', '--policy', 'zcashflight.regtest.yml', '--ci']).status;

step('2. Apply the fixes (real code changes in lib/ and server/)');
node(['scripts/fixes.ts', 'apply']);

step('3. The same scenarios again');
const after = node([CLI, 'run', '--policy', 'zcashflight.regtest.yml', '--ci']).status;
node(['scripts/fixes.ts', 'reset'], true);

const end = await height();
console.log(`\nRegtest chain: blocks ${start + 1}–${end}, ${await txsSince(start)} non-coinbase transactions built by Zallet and mined by Zebra during this proof.`);
console.log(`CI gate: before fixes exit ${before}${before === 1 ? ' (fails the build)' : ''}, after fixes exit ${after}${after === 0 ? ' (passes)' : ''}.`);
process.exit(before === 1 && after === 0 ? 0 : 1);
