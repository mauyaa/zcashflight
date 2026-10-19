// Error reporting, Sentry-style: the error plus whatever context helps debugging.

const DSN = 'https://errors.example.io/api/42/store/';

export function reportError(err: Error, extra: Record<string, unknown> = {}) {
  fetch(DSN, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: err.message, level: 'error', extra }),
  }).catch(() => {});
}
