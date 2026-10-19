// Masking happens where data is captured, before anything is written or displayed.
// Secrets (keys, seeds) are fully redacted; identifiers keep just enough to be recognisable.

import { createHmac, randomBytes } from 'node:crypto';
import { scanText, type Hit } from '../zcash/detect.ts';
import type { MaskedHit } from './types.ts';

export function runKey(): string { return randomBytes(32).toString('hex'); }

export function maskValue(h: Pick<Hit, 'cls' | 'value' | 'kind'>): string {
  const v = h.value;
  switch (h.cls) {
    case 'spending-key': return '[redacted spending key]';
    case 'seed-phrase': return '[redacted seed phrase]';
    case 'viewing-key': { const s = v.lastIndexOf('1'); return (s > 0 ? v.slice(0, s + 1) : '') + '…[redacted]'; }
    case 'amount': return '••••';
    case 'memo': return `•••• (${[...v].length} chars)`;
    case 'txid': return v.slice(0, 4) + '…' + v.slice(-4);
    case 'address': {
      const s = v.lastIndexOf('1');
      const head = h.kind.startsWith('transparent') || s < 0 ? v.slice(0, 4) : v.slice(0, s + 3);
      return head + '…' + v.slice(-4);
    }
  }
}

export function maskHit(h: Hit, key: string): MaskedHit {
  return {
    cls: h.cls, kind: h.kind, network: h.network, pool: h.pool, proof: h.proof, path: maskString(h.path, scanText(h.path)),
    masked: maskValue(h),
    ref: createHmac('sha256', key).update(h.cls + ':' + h.value).digest('hex').slice(0, 8),
  };
}

/** Replace every hit's raw value inside a string with its masked form. Longest first, so substrings cannot survive. */
export function maskString(s: string, hits: Hit[]): string {
  let out = s;
  for (const h of [...hits].sort((a, b) => b.value.length - a.value.length)) {
    if (!h.value) continue;
    const m = maskValue(h);
    if (/^[\d.]+$/.test(h.value)) {
      // a bare number only counts on its own: never inside another number, a version or an IP address
      out = out.replace(new RegExp(`(?<![\\w.])${h.value.replace(/\./g, '\\.')}(?![\\w.]|\\.\\d)`, 'g'), m);
      continue;
    }
    out = out.split(h.value).join(m);
    try { const enc = encodeURIComponent(h.value); if (enc !== h.value) out = out.split(enc).join(m); } catch { /* ignore */ }
  }
  return out;
}
