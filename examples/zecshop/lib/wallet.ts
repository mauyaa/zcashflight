// JSON-RPC client for zallet / zcashd. The only destination allowed to see addresses, amounts and memos.

const RPC = process.env.WALLET_RPC ?? 'http://127.0.0.1:18232';
let id = 0;

async function call<T>(method: string, params: unknown[] = []): Promise<T> {
  const res = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) });
  const j = await res.json();
  if (j.error) throw new Error(`${method}: ${j.error.message}`);
  return j.result as T;
}

export const wallet = {
  async newAddress(): Promise<string> {
    return (await call<{ address: string }>('z_getaddressforaccount', [0])).address;
  },
  /** z_sendmany, then wait for the operation to report its txid. */
  async send(from: string, to: string, amount: string, memo: string, privacyPolicy = 'FullPrivacy'): Promise<string> {
    const memoHex = Buffer.from(memo, 'utf8').toString('hex');
    const opid = await call<string>('z_sendmany', [from, [{ address: to, amount: Number(amount), memo: memoHex }], 1, null, privacyPolicy]);
    const [r] = await call<{ result: { txid: string } }[]>('z_getoperationresult', [[opid]]);
    return r.result.txid;
  },
};

export const MERCHANT_ACCOUNT = 'ANY_UA_ACCOUNT_0';
export const COLD_STORAGE = 'utest1446c86f4tmpz000c87af9h74upc929fy2jtvgsfqu64ns4mrlchs6g6c5vxye5q0ay4e5vt3rfrnefp2uevvp35y2259crgl70g50ckrcr0ch6uf2qrz3e8tecvqucagay9zpkp35t4sz69kqsezmwgklnlqd44q3rj02tvqax9qahwsdf';
