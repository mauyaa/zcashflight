// Product analytics. Fire-and-forget, so checkout never waits on it.
// Event names only: payment data (addresses, amounts, memos) never goes to analytics.

const ENDPOINT = 'https://analytics.example.com/v1/track';

export function track(event: string, _props: Record<string, unknown> = {}) {
  fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ event }),
  }).catch(() => {});
}
