// Checksummed encodings used by Zcash identifiers.
// Bech32 (BIP-173) for Sapling, Bech32m (BIP-350) for Unified/TEX, Base58Check for transparent.
// Unified encodings are longer than the BIP-173 90-character limit (ZIP-316), so no length cap is applied.

import { createHash } from 'node:crypto';

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const BECH32_CONST = 1;
const BECH32M_CONST = 0x2bc830a3;

function polymod(values: number[]): number {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk ^= GEN[i];
  }
  return chk >>> 0;
}

function hrpExpand(hrp: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) >> 5);
  out.push(0);
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) & 31);
  return out;
}

export type Bech32Variant = 'bech32' | 'bech32m';
export interface Bech32Decoded { hrp: string; variant: Bech32Variant; data: number[] }

export function bech32Decode(str: string): Bech32Decoded | null {
  if (str !== str.toLowerCase() && str !== str.toUpperCase()) return null;
  const s = str.toLowerCase();
  const pos = s.lastIndexOf('1');
  if (pos < 1 || pos + 7 > s.length) return null;
  const hrp = s.slice(0, pos);
  const data: number[] = [];
  for (const c of s.slice(pos + 1)) {
    const d = CHARSET.indexOf(c);
    if (d === -1) return null;
    data.push(d);
  }
  const pm = polymod(hrpExpand(hrp).concat(data));
  const variant: Bech32Variant | null = pm === BECH32_CONST ? 'bech32' : pm === BECH32M_CONST ? 'bech32m' : null;
  if (!variant) return null;
  return { hrp, variant, data: data.slice(0, -6) };
}

export function bech32Encode(hrp: string, data: number[], variant: Bech32Variant): string {
  const values = hrpExpand(hrp).concat(data, [0, 0, 0, 0, 0, 0]);
  const pm = polymod(values) ^ (variant === 'bech32m' ? BECH32M_CONST : BECH32_CONST);
  let out = hrp + '1';
  for (const d of data) out += CHARSET[d];
  for (let i = 0; i < 6; i++) out += CHARSET[(pm >>> (5 * (5 - i))) & 31];
  return out;
}

export function convertBits(data: ArrayLike<number>, from: number, to: number, pad: boolean): number[] | null {
  let acc = 0, bits = 0;
  const out: number[] = [];
  const maxv = (1 << to) - 1;
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    if (v < 0 || v >> from) return null;
    acc = (acc << from) | v;
    bits += from;
    while (bits >= to) { bits -= to; out.push((acc >> bits) & maxv); }
  }
  if (pad) { if (bits) out.push((acc << (to - bits)) & maxv); }
  else if (bits >= from || ((acc << (to - bits)) & maxv)) return null;
  return out;
}

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function sha256d(b: Uint8Array): Buffer {
  return createHash('sha256').update(createHash('sha256').update(b).digest()).digest();
}

/** Returns the payload (version bytes included) when the checksum is valid. */
export function base58CheckDecode(str: string): Uint8Array | null {
  let n = 0n;
  for (const c of str) {
    const d = B58.indexOf(c);
    if (d === -1) return null;
    n = n * 58n + BigInt(d);
  }
  const bytes: number[] = [];
  while (n > 0n) { bytes.unshift(Number(n & 0xffn)); n >>= 8n; }
  for (const c of str) { if (c === '1') bytes.unshift(0); else break; }
  if (bytes.length < 5) return null;
  const raw = Uint8Array.from(bytes);
  const payload = raw.slice(0, -4);
  const sum = sha256d(payload).subarray(0, 4);
  for (let i = 0; i < 4; i++) if (sum[i] !== raw[raw.length - 4 + i]) return null;
  return payload;
}

export function base58CheckEncode(payload: Uint8Array): string {
  const raw = Buffer.concat([Buffer.from(payload), sha256d(payload).subarray(0, 4)]);
  let n = BigInt('0x' + (raw.toString('hex') || '0'));
  let out = '';
  while (n > 0n) { out = B58[Number(n % 58n)] + out; n /= 58n; }
  for (const b of raw) { if (b === 0) out = '1' + out; else break; }
  return out;
}
