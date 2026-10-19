// Offline inputs: a HAR exported from browser DevTools (for web wallets and checkout pages),
// or any log file. Each is inspected exactly like live capture, so the same rules apply.

import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { inspectLog, inspectRequest } from './inspect.ts';
import type { CaptureEvent } from '../engine/types.ts';

export function importHar(file: string, key: string): CaptureEvent[] {
  const har = JSON.parse(readFileSync(file, 'utf8'));
  const entries: any[] = har?.log?.entries ?? [];
  return entries.map(en => {
    const r = en.request ?? {};
    const headers: Record<string, string> = {};
    for (const h of r.headers ?? []) if (!h.name.startsWith(':')) headers[h.name.toLowerCase()] = String(h.value);
    if (r.postData?.mimeType) headers['content-type'] ??= r.postData.mimeType;
    const e = inspectRequest({ method: r.method ?? 'GET', url: r.url ?? '', headers, body: r.postData?.text ?? '', via: 'har' }, key);
    const t = Date.parse(en.startedDateTime);
    if (!Number.isNaN(t)) e.t = t;
    return e;
  });
}

export function importLog(file: string, key: string, source = basename(file)): CaptureEvent[] {
  return readFileSync(file, 'utf8').split(/\r?\n/).filter(l => l.trim())
    .map(l => inspectLog(source, l, key)).filter((e): e is CaptureEvent => !!e);
}
