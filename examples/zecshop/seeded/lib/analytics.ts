// Product analytics. Fire-and-forget, so checkout never waits on it.

const ENDPOINT = 'https://analytics.example.com/v1/track';

export function track(event: string, props: Record<string, unknown> = {}) {
  fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ event, props, ts: Date.now() }),
  }).catch(() => {});
}
