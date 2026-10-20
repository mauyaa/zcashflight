// JSON-RPC client for zallet / zcashd. The only destination allowed to see addresses, amounts and memos.
// By default it talks to the bundled mock (mock/zallet.ts). With WALLET_MOCK=0 it talks to a real wallet:
// see docs/guides/regtest.md for running ZecShop against Zebra + Zallet on a local regtest network.

const RPC = process.env.WALLET_RPC ?? 'http://127.0.0.1:18232';
const AUTH = process.env.WALLET_RPC_USER
  ? 'Basic ' + Buffer.from(`${process.env.WALLET_RPC_USER}:${process.env.WALLET_RPC_PASSWORD ?? ''}`).toString('base64')
  : undefined;
let id = 0;

async function call<T>(method: string, params: unknown[] = []): Promise<T> {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(AUTH ? { authorization: AUTH } : {}) },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
  });
  const j = await res.json();
  if (j.error) throw new Error(`${method}: ${j.error.message}`);
  return j.result as T;
}

/** The shop's own account: an account UUID on a real wallet, account 0 on the mock. */
export const MERCHANT_ACCOUNT = process.env.MERCHANT_ACCOUNT ?? 0;
/** Where the shop spends from: one of its own unified addresses. */
export const MERCHANT_ADDRESS = process.env.MERCHANT_ADDRESS ?? 'ANY_UA_ACCOUNT_0';
export const COLD_STORAGE = process.env.COLD_STORAGE ?? 'utest1446c86f4tmpz000c87af9h74upc929fy2jtvgsfqu64ns4mrlchs6g6c5vxye5q0ay4e5vt3rfrnefp2uevvp35y2259crgl70g50ckrcr0ch6uf2qrz3e8tecvqucagay9zpkp35t4sz69kqsezmwgklnlqd44q3rj02tvqax9qahwsdf';

export const wallet = {
  /** A fresh shielded-only (Orchard) unified address for the next order. */
  async newAddress(): Promise<string> {
    return (await call<{ address: string }>('z_getaddressforaccount', [MERCHANT_ACCOUNT, ['orchard']])).address;
  },
  /** z_sendmany, then wait for the operation to finish and return its txid. */
  async send(from: string, to: string, amount: string, memo: string | null, privacyPolicy = 'FullPrivacy'): Promise<string> {
    const out: Record<string, unknown> = { address: to, amount: Number(amount) };
    if (memo) out.memo = Buffer.from(memo, 'utf8').toString('hex');
    const opid = await call<string>('z_sendmany', [from, [out], 1, null, privacyPolicy]);
    for (const until = Date.now() + 120_000; Date.now() < until;) {
      const [r] = await call<{ status: string; result?: { txid: string }; error?: { message: string } }[]>('z_getoperationresult', [[opid]]);
      if (r?.status === 'success' && r.result) return r.result.txid;
      if (r?.status === 'failed') throw new Error(`z_sendmany: ${r.error?.message ?? 'failed'}`);
      await new Promise(res => setTimeout(res, 500));
    }
    throw new Error('z_sendmany: timed out waiting for the operation');
  },
};
