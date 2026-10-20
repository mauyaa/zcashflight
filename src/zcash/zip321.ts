// ZIP 321 payment request URIs (https://zips.z.cash/zip-0321), parsed strictly as the spec requires.
// A leaked payment request discloses who is paid, how much and the memo in one string, so ZcashFlight
// reports each of those fields separately. URIs that fail the grammar or the semantic rules are not
// treated as payment requests (their addresses are still found by the ordinary token scan).

import { classifyToken, type Identifier } from './identifiers.ts';

export interface Payment {
  index: number;          // paramindex; 0 for the unindexed payment
  address: string;
  id: Identifier;         // checksum-verified classification of the address
  amount?: string;        // decimal ZEC, exactly as written
  memo?: string;          // base64url, exactly as written (never decoded into stored output)
  memoBytes?: number;     // decoded length, at most 512
  label?: string;
  message?: string;
}
export type Parsed = { ok: true; payments: Payment[] } | { ok: false; error: string };

const ADDRESS = /^[A-Za-z0-9]+$/;                       // zcashaddress = 1*( ALPHA / DIGIT )
const AMOUNT = /^\d+(?:\.\d{1,8})?$/;                    // 1*DIGIT [ "." 1*8DIGIT ]
const BASE64URL = /^[A-Za-z0-9_-]*$/;                    // padding and +/ are not accepted
const QCHAR = /^(?:[A-Za-z0-9\-._~!$'()*+,;:@]|%[0-9A-Fa-f]{2})*$/;
const PARAM = /^([A-Za-z][A-Za-z0-9+-]*)(?:\.([1-9][0-9]{0,3}))?(?:=(.*))?$/s;
const MAX_ZEC = 21_000_000;

const fail = (error: string): Parsed => ({ ok: false, error });

function zec(amount: string): number {
  const [whole, frac = ''] = amount.split('.');
  return Number(whole.replace(/^0+(?=\d)/, '')) + Number('0.' + (frac || '0'));
}

function base64urlBytes(s: string): number | null {
  if (s.length % 4 === 1) return null;                   // impossible length for base64
  return Math.floor((s.length * 6) / 8);
}

function decodeQchar(s: string): string {
  try { return decodeURIComponent(s); } catch { return s; }
}

/** Parse one `zcash:` URI. Rejects anything the ZIP says MUST NOT be accepted. */
export function parsePaymentRequest(uri: string): Parsed {
  if (!/^zcash:/i.test(uri)) return fail('not a zcash: URI');
  const rest = uri.slice(6);
  if (rest.startsWith('//')) return fail('ZIP 321 URIs have no authority component ("//")');
  const q = rest.indexOf('?');
  const head = q === -1 ? rest : rest.slice(0, q);
  const query = q === -1 ? '' : rest.slice(q + 1);
  if (!head && q === -1) return fail('no address and no parameters');

  const byIndex = new Map<number, Map<string, string>>();
  const put = (i: number, k: string, v: string) => {
    const m = byIndex.get(i) ?? new Map<string, string>();
    if (m.has(k)) return false;
    m.set(k, v); byIndex.set(i, m); return true;
  };

  if (head) {
    if (!ADDRESS.test(head)) return fail('the address contains characters the grammar does not allow');
    put(0, 'address', head);
  }
  for (const part of query ? query.split('&') : []) {
    if (!part) continue;                                 // zcashparam may be empty
    const m = PARAM.exec(part);
    if (!m) return fail(`malformed parameter "${part.split('=')[0]}"`);
    const [, name, idx, value] = m;
    const i = idx ? Number(idx) : 0;
    const shown = name + (idx ? '.' + idx : '');
    switch (name) {
      case 'address': if (value === undefined || !ADDRESS.test(value)) return fail(`invalid ${shown}`); break;
      case 'amount': if (value === undefined || !AMOUNT.test(value)) return fail(`invalid ${shown}: use decimal ZEC with at most 8 decimals`); break;
      case 'memo': case 'req-asset': if (value === undefined || !BASE64URL.test(value)) return fail(`invalid ${shown}: must be base64url without padding`); break;
      case 'label': case 'message': if (value === undefined || !QCHAR.test(value)) return fail(`invalid ${shown}`); break;
      default:
        if (name.startsWith('req-')) return fail(`unsupported required parameter "${name}"`);
        if (value !== undefined && !QCHAR.test(value)) return fail(`invalid ${shown}`);
        continue;                                        // unknown optional parameters are ignored
    }
    if (!put(i, name, value)) return fail(`duplicate ${shown}`);
  }

  const payments: Payment[] = [];
  for (const i of [...byIndex.keys()].sort((a, b) => a - b)) {
    const m = byIndex.get(i)!;
    const address = m.get('address');
    if (!address) return fail(`parameters at index ${i || '(none)'} have no address`);
    const id = classifyToken(address);
    if (!id || id.cls !== 'address') return fail(`${address.slice(0, 12)}… is not a valid Zcash address`);
    if (id.kind === 'sprout-address') return fail('Sprout addresses are not allowed in payment requests');
    if (m.has('amount') && m.has('req-asset')) return fail(`index ${i}: amount and req-asset together`);
    const amount = m.get('amount');
    if (amount !== undefined && zec(amount) > MAX_ZEC) return fail(`amount above ${MAX_ZEC} ZEC`);
    const memo = m.get('memo');
    let memoBytes: number | undefined;
    if (memo !== undefined) {
      if (id.pool === 'transparent' || id.pool === 'tex') return fail('a memo for a transparent address makes the whole request invalid');
      const n = base64urlBytes(memo);
      if (n === null || n > 512) return fail('memo longer than 512 bytes');
      memoBytes = n;
    }
    const label = m.get('label'), message = m.get('message');
    payments.push({ index: i, address, id, amount, memo, memoBytes, label: label && decodeQchar(label), message: message && decodeQchar(message) });
  }
  return payments.length ? { ok: true, payments } : fail('no payment');
}

/** Every valid payment request inside a piece of text, with where it starts. */
export function findPaymentRequests(text: string): { uri: string; at: number; payments: Payment[] }[] {
  const out: { uri: string; at: number; payments: Payment[] }[] = [];
  for (const m of text.matchAll(/zcash:[A-Za-z0-9\-._~!$'()*+,;:@%?&=/]+/gi)) {
    // URIs are often followed by punctuation in prose or logs; retry without it
    for (const uri of [m[0], m[0].replace(/[.,;:!)'"]+$/, '')]) {
      const p = parsePaymentRequest(uri);
      if (p.ok) { out.push({ uri, at: m.index!, payments: p.payments }); break; }
    }
  }
  return out;
}
