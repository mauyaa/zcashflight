// Error reporting, Sentry-style. Context is scrubbed before it leaves:
// memos, addresses and amounts are dropped; a random correlation id keeps reports debuggable.

import { randomUUID } from 'node:crypto';

const DSN = 'https://errors.example.io/api/42/store/';
const PRIVATE = /^(memo|address|recipient|amount|txid|.*_address)$/i;

export function reportError(err: Error, extra: Record<string, unknown> = {}) {
  const safe = Object.fromEntries(Object.entries(extra).filter(([k]) => !PRIVATE.test(k)));
  fetch(DSN, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: err.message, level: 'error', extra: { ...safe, correlation: randomUUID() } }),
  }).catch(() => {});
}
