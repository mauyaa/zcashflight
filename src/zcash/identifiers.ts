// Recognises Zcash identifiers by their real encodings, not by look-alike patterns.
// An address only counts when its HRP/version bytes and checksum are valid, which keeps false positives low.

import { bech32Decode, base58CheckDecode, convertBits } from './encoding.ts';

export type Network = 'mainnet' | 'testnet' | 'regtest';
export type DataClass = 'address' | 'amount' | 'memo' | 'txid' | 'viewing-key' | 'spending-key' | 'seed-phrase';
export type Pool = 'shielded' | 'transparent' | 'unified' | 'tex';

export interface Identifier {
  cls: DataClass;
  kind: string;          // e.g. 'unified-address', 'sapling-address', 'transparent-p2pkh'
  network?: Network;
  pool?: Pool;
  proof: 'checksum' | 'context' | 'wordlist';
}

interface Bech32Kind { cls: DataClass; kind: string; network: Network; pool?: Pool; variant: 'bech32' | 'bech32m'; bytes?: number }

const BECH32: Record<string, Bech32Kind> = {};
function reg(hrps: [string, Network][], k: Omit<Bech32Kind, 'network'>) {
  for (const [h, network] of hrps) BECH32[h] = { ...k, network };
}
// ZIP-316 unified addresses / viewing keys (Bech32m)
reg([['u', 'mainnet'], ['utest', 'testnet'], ['uregtest', 'regtest']], { cls: 'address', kind: 'unified-address', pool: 'unified', variant: 'bech32m' });
reg([['uview', 'mainnet'], ['uviewtest', 'testnet'], ['uviewregtest', 'regtest']], { cls: 'viewing-key', kind: 'unified-full-viewing-key', variant: 'bech32m' });
reg([['uivk', 'mainnet'], ['uivktest', 'testnet'], ['uivkregtest', 'regtest']], { cls: 'viewing-key', kind: 'unified-incoming-viewing-key', variant: 'bech32m' });
// ZIP-320 TEX addresses (Bech32m): transparent-source-only, still a public address
reg([['tex', 'mainnet'], ['textest', 'testnet'], ['texregtest', 'regtest']], { cls: 'address', kind: 'tex-address', pool: 'tex', variant: 'bech32m', bytes: 20 });
// Sapling (Bech32)
reg([['zs', 'mainnet'], ['ztestsapling', 'testnet'], ['zregtestsapling', 'regtest']], { cls: 'address', kind: 'sapling-address', pool: 'shielded', variant: 'bech32', bytes: 43 });
reg([['zxviews', 'mainnet'], ['zxviewtestsapling', 'testnet'], ['zxviewregtestsapling', 'regtest']], { cls: 'viewing-key', kind: 'sapling-extended-full-viewing-key', variant: 'bech32' });
reg([['zivks', 'mainnet'], ['zivktestsapling', 'testnet'], ['zivkregtestsapling', 'regtest']], { cls: 'viewing-key', kind: 'sapling-incoming-viewing-key', variant: 'bech32' });
reg([['secret-extended-key-main', 'mainnet'], ['secret-extended-key-test', 'testnet'], ['secret-extended-key-regtest', 'regtest']], { cls: 'spending-key', kind: 'sapling-extended-spending-key', variant: 'bech32' });

interface B58Kind { prefix: number[]; len: number; cls: DataClass; kind: string; network: Network; pool?: Pool }
const B58: B58Kind[] = [
  { prefix: [0x1c, 0xb8], len: 22, cls: 'address', kind: 'transparent-p2pkh', network: 'mainnet', pool: 'transparent' },
  { prefix: [0x1c, 0xbd], len: 22, cls: 'address', kind: 'transparent-p2sh', network: 'mainnet', pool: 'transparent' },
  { prefix: [0x1d, 0x25], len: 22, cls: 'address', kind: 'transparent-p2pkh', network: 'testnet', pool: 'transparent' },
  { prefix: [0x1c, 0xba], len: 22, cls: 'address', kind: 'transparent-p2sh', network: 'testnet', pool: 'transparent' },
  { prefix: [0x16, 0x9a], len: 66, cls: 'address', kind: 'sprout-address', network: 'mainnet', pool: 'shielded' },
  { prefix: [0x16, 0xb6], len: 66, cls: 'address', kind: 'sprout-address', network: 'testnet', pool: 'shielded' },
  { prefix: [0xab, 0x36], len: 34, cls: 'spending-key', kind: 'sprout-spending-key', network: 'mainnet' },
  { prefix: [0xac, 0x08], len: 34, cls: 'spending-key', kind: 'sprout-spending-key', network: 'testnet' },
  { prefix: [0x80], len: 33, cls: 'spending-key', kind: 'transparent-private-key', network: 'mainnet' },
  { prefix: [0x80], len: 34, cls: 'spending-key', kind: 'transparent-private-key', network: 'mainnet' },
  { prefix: [0xef], len: 33, cls: 'spending-key', kind: 'transparent-private-key', network: 'testnet' },
  { prefix: [0xef], len: 34, cls: 'spending-key', kind: 'transparent-private-key', network: 'testnet' },
];

/** Classify one token. Returns null unless it is a well-formed Zcash identifier. */
export function classifyToken(token: string): Identifier | null {
  const sep = token.lastIndexOf('1');
  if (sep > 0) {
    const k = BECH32[token.slice(0, sep).toLowerCase()];
    if (k) {
      const d = bech32Decode(token);
      if (d && d.variant === k.variant) {
        const bytes = convertBits(d.data, 5, 8, false);
        if (bytes && (k.bytes ? bytes.length === k.bytes : bytes.length >= 32)) {
          return { cls: k.cls, kind: k.kind, network: k.network, pool: k.pool, proof: 'checksum' };
        }
      }
    }
  }
  if (/^[1-9A-HJ-NP-Za-km-z]{30,110}$/.test(token)) {
    const p = base58CheckDecode(token);
    if (p) for (const k of B58) {
      if (p.length === k.len && k.prefix.every((b, i) => p[i] === b)) {
        if (k.kind === 'transparent-private-key' && k.len === 34 && p[33] !== 0x01) continue;
        return { cls: k.cls, kind: k.kind, network: k.network, pool: k.pool, proof: 'checksum' };
      }
    }
  }
  return null;
}

export const DATA_CLASS_LABEL: Record<DataClass, string> = {
  'address': 'addresses',
  'amount': 'amounts',
  'memo': 'memos',
  'txid': 'transaction IDs',
  'viewing-key': 'viewing keys',
  'spending-key': 'spending keys',
  'seed-phrase': 'seed phrases',
};
