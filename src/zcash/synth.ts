// Synthetic Zcash identifiers for seeding privacy tests.
// They carry valid encodings and checksums, so detectors treat them like real ones,
// but their payloads are random bytes: no key exists for them and no funds can ever reach them.

import { createHash } from 'node:crypto';
import { bech32Encode, base58CheckEncode, convertBits } from './encoding.ts';
import { BIP39_ENGLISH } from './bip39-english.ts';

function bytes(seed: string, n: number): Uint8Array {
  const out = new Uint8Array(n);
  let block = createHash('sha256').update('zcashflight-synth:' + seed).digest();
  for (let i = 0; i < n; i++) {
    if (i && i % 32 === 0) block = createHash('sha256').update(block).digest();
    out[i] = block[i % 32];
  }
  return out;
}

function b32(hrp: string, payload: Uint8Array, variant: 'bech32' | 'bech32m'): string {
  return bech32Encode(hrp, convertBits(payload, 8, 5, true)!, variant);
}

export const synth = {
  unifiedAddress: (seed = 'ua', net: 'test' | 'main' = 'test') => b32(net === 'test' ? 'utest' : 'u', bytes(seed, 107), 'bech32m'),
  saplingAddress: (seed = 'zs', net: 'test' | 'main' = 'test') => b32(net === 'test' ? 'ztestsapling' : 'zs', bytes(seed, 43), 'bech32'),
  texAddress: (seed = 'tex', net: 'test' | 'main' = 'test') => b32(net === 'test' ? 'textest' : 'tex', bytes(seed, 20), 'bech32m'),
  transparentAddress: (seed = 't', net: 'test' | 'main' = 'test') =>
    base58CheckEncode(Uint8Array.from([...(net === 'test' ? [0x1d, 0x25] : [0x1c, 0xb8]), ...bytes(seed, 20)])),
  unifiedViewingKey: (seed = 'ufvk', net: 'test' | 'main' = 'test') => b32(net === 'test' ? 'uviewtest' : 'uview', bytes(seed, 192), 'bech32m'),
  saplingSpendingKey: (seed = 'extsk', net: 'test' | 'main' = 'test') =>
    b32(net === 'test' ? 'secret-extended-key-test' : 'secret-extended-key-main', bytes(seed, 169), 'bech32'),
  transparentPrivateKey: (seed = 'wif', net: 'test' | 'main' = 'test') =>
    base58CheckEncode(Uint8Array.from([net === 'test' ? 0xef : 0x80, ...bytes(seed, 32), 0x01])),
  txid: (seed = 'txid') => Buffer.from(bytes(seed, 32)).toString('hex'),
  seedPhrase: (seed = 'seed', words = 24) => {
    const b = bytes(seed, words * 2);
    return Array.from({ length: words }, (_, i) => BIP39_ENGLISH[((b[2 * i] << 8) | b[2 * i + 1]) % 2048]).join(' ');
  },
};
