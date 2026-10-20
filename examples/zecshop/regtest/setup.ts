// Prepares a Z3 regtest wallet (Zebra + Zallet) for ZecShop and writes zcashflight.regtest.yml.
//   node regtest/setup.ts            (from examples/zecshop, with the Z3 regtest stack running)
// It creates three accounts in the wallet (customer, merchant, cold storage), mines regtest coinbase to the
// customer's transparent receiver, shields it, and gives the merchant a few notes to spend from.
// Everything happens on a private regtest chain: no real funds, no network peers.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WALLET = process.env.ZALLET_RPC ?? 'http://127.0.0.1:50232';
const ZEBRA = process.env.ZEBRA_RPC ?? 'http://127.0.0.1:29232';
const USER = process.env.RPC_USER ?? 'zebra', PASS = process.env.RPC_PASSWORD ?? 'zebra';  // Z3 regtest defaults
const AUTH = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function rpc<T = any>(url: string, method: string, params: unknown[] = []): Promise<T> {
  let r: Response;
  try {
    r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: AUTH }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  } catch {
    throw new Error(`cannot reach ${url}. Start the Z3 regtest stack first (see regtest/README.md).`);
  }
  const j = await r.json();
  if (j.error) throw new Error(`${method}: ${j.error.message}`);
  return j.result as T;
}
const wallet = <T = any>(m: string, p?: unknown[]) => rpc<T>(WALLET, m, p);

async function synced() {
  for (let i = 0; i < 240; i++) {
    const s = await wallet('getwalletstatus');
    if (s.fully_synced_height >= s.node_tip.height) return;
    await sleep(500);
  }
  throw new Error('the wallet did not catch up with Zebra');
}
async function mine(n: number) { await rpc(ZEBRA, 'generate', [n]); await synced(); }
async function finish(opid: string): Promise<string> {
  for (let i = 0; i < 240; i++) {
    const [r] = await wallet('z_getoperationresult', [[opid]]);
    if (r?.status === 'success') return r.result.txid ?? r.result.txids?.[0];
    if (r?.status === 'failed') throw new Error(r.error?.message ?? 'operation failed');
    await sleep(500);
  }
  throw new Error('operation timed out');
}
async function account(name: string): Promise<string> {
  const all: { name?: string; account_uuid: string }[] = await wallet('z_listaccounts');
  return all.find(a => a.name === name)?.account_uuid ?? (await wallet('z_getnewaccount', [name])).account_uuid;
}
const address = async (acct: string, receivers?: string[]) => (await wallet('z_getaddressforaccount', receivers ? [acct, receivers] : [acct])).address as string;
const shielded = async (acct: string) => {
  const b = await wallet('z_getbalanceforaccount', [acct]);
  return Object.entries(b.pools as Record<string, { valueZat: number }>).filter(([p]) => p !== 'transparent').reduce((t, [, v]) => t + v.valueZat, 0);
};

console.log('ZecShop regtest setup');
await synced();
const customer = await account('zecshop-customer'), merchant = await account('zecshop-merchant'), cold = await account('zecshop-cold-storage');
// Reuse the customer's first address that has a transparent receiver, so the miner address stays the same
// across runs; derive one only the first time.
async function stableAddress(acct: string): Promise<string> {
  const all: { account_uuid: string; addresses?: { ua?: string }[] }[] = await wallet('z_listaccounts');
  for (const a of all.find(x => x.account_uuid === acct)?.addresses ?? []) {
    if (a.ua && (await wallet('z_listunifiedreceivers', [a.ua])).p2pkh) return a.ua;
  }
  return address(acct);                                            // Orchard + Sapling + transparent receivers
}
const customerUA = await stableAddress(customer);
const customerT = (await wallet('z_listunifiedreceivers', [customerUA])).p2pkh as string;
console.log(`  accounts ready; the customer's transparent receiver is ${customerT.slice(0, 8)}…`);

if (await shielded(customer) < 5e8) {
  // New coinbase is immature for 100 blocks, so check the block itself rather than the wallet balance
  await mine(1);
  const tip = await rpc<number>(ZEBRA, 'getblockcount');
  const block = await rpc(ZEBRA, 'getblock', [String(tip), 2]);
  const payees = (block.tx?.[0]?.vout ?? []).flatMap((o: any) => o.scriptPubKey?.addresses ?? []);
  if (!payees.includes(customerT)) {
    console.error(`\nZebra is not mining to this wallet. In the z3 folder, set the miner address and restart Zebra:\n` +
      `  ZEBRA_MINING__MINER_ADDRESS=${customerT}   (in .env.regtest)\n  docker compose --env-file .env.regtest up -d zebra\nthen run this script again.`);
    process.exit(2);
  }
  console.log('  mining 101 blocks so the coinbase matures…');
  await mine(101);
  const op = await wallet('z_shieldcoinbase', [customerT, customerUA, null, 20]);
  console.log(`  shielding ${op.shieldingValue} ZEC into the customer's Orchard receiver…`);
  await finish(op.opid);
  await mine(3);                                                  // ZIP 315: the wallet's own outputs need 3 confirmations
}

// The merchant gets eight 1 ZEC notes, so sweeps and refunds always have confirmed funds to spend.
if (await shielded(merchant) < 2e8) {
  const outs = await Promise.all([0, 1, 2, 3, 4, 5, 6, 7].map(async () => ({ address: await address(merchant, ['orchard']), amount: 1 })));
  await finish(await wallet('z_sendmany', [customerUA, outs, 1, null, 'FullPrivacy']));
  await mine(10);                                                 // ZIP 315: funds from another account need 10 confirmations
  console.log('  merchant float: 8 notes of 1 ZEC');
}

const env = {
  WALLET_RPC: WALLET, ZEBRA_RPC: ZEBRA, WALLET_RPC_USER: USER, WALLET_RPC_PASSWORD: PASS,
  MERCHANT_ACCOUNT: merchant, MERCHANT_ADDRESS: await address(merchant, ['orchard']),
  COLD_STORAGE: await address(cold, ['orchard']), REGTEST_CUSTOMER_ADDRESS: customerUA,
};
const tpl = readFileSync(join(HERE, 'zcashflight.regtest.template.yml'), 'utf8');
const out = tpl
  .replace(/\{\{(\w+)\}\}/g, (_, k) => (env as any)[k] ?? (k === 'CUSTOMER_UA' ? customerUA : k === 'CUSTOMER_TADDR' ? customerT : `{{${k}}}`))
  .replace('{{WALLET_HOST}}', new URL(WALLET).host).replace('{{ZEBRA_HOST}}', new URL(ZEBRA).host);
writeFileSync(join(HERE, '..', 'zcashflight.regtest.yml'), out);
console.log(`  customer: ${(await shielded(customer)) / 1e8} ZEC shielded · merchant: ${(await shielded(merchant)) / 1e8} ZEC shielded`);
console.log('\nWrote zcashflight.regtest.yml. Next:\n  zcashflight run --policy zcashflight.regtest.yml');
