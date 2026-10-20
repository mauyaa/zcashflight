// zcashflight.yml: what must stay private, where it may go, and how to exercise the app.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { parseYaml } from './yaml.ts';
import type { DataClass } from '../zcash/identifiers.ts';

export const ALL_CLASSES: DataClass[] = ['address', 'amount', 'memo', 'txid', 'viewing-key', 'spending-key', 'seed-phrase'];
/** Keys and seeds are always protected: no policy can allow them to leave. */
export const ALWAYS_PROTECTED: DataClass[] = ['viewing-key', 'spending-key', 'seed-phrase'];

const ALIASES: Record<string, DataClass> = {
  address: 'address', addresses: 'address', recipient: 'address', recipients: 'address',
  amount: 'amount', amounts: 'amount', value: 'amount', values: 'amount',
  memo: 'memo', memos: 'memo',
  txid: 'txid', txids: 'txid', 'transaction id': 'txid', 'transaction ids': 'txid',
  'viewing key': 'viewing-key', 'viewing keys': 'viewing-key', 'viewing-key': 'viewing-key', 'viewing-keys': 'viewing-key',
  'spending key': 'spending-key', 'spending keys': 'spending-key', 'spending-key': 'spending-key', 'private keys': 'spending-key',
  'seed phrase': 'seed-phrase', 'seed phrases': 'seed-phrase', 'seed-phrase': 'seed-phrase', seeds: 'seed-phrase', mnemonic: 'seed-phrase',
};

export interface Destination { host: string; purpose?: string; allow: DataClass[] }
export interface Step { method: string; path: string; json?: unknown; headers?: Record<string, string>; expect?: number; save?: Record<string, string>; timeoutMs?: number }
export interface Scenario { name: string; description?: string; steps: Step[] }
export interface LogSource { path: string; allow: DataClass[] }

export interface Policy {
  file: string;            // absolute path of zcashflight.yml
  root: string;            // project root
  hash: string;            // content hash, recorded with each run
  network: string;         // label for reports: testnet, regtest, mainnet
  app: { name: string; start?: string; url: string; ready: string; env: Record<string, string>; timeoutMs: number; proxy: boolean };
  protect: DataClass[];
  destinations: Destination[];
  logs: LogSource[];
  transactions: { shieldedOnly: boolean };
  sinkhole: boolean;
  scenarios: Scenario[];
  notTested: string[];     // honest coverage notes shown in every report
}

export class PolicyError extends Error {}

export function toClass(s: unknown): DataClass {
  const c = ALIASES[String(s).trim().toLowerCase()];
  if (!c) throw new PolicyError(`unknown data class "${s}". Use one of: addresses, amounts, memos, transaction IDs, viewing keys, spending keys, seed phrases`);
  return c;
}
const classes = (v: unknown): DataClass[] => v == null ? [] : (Array.isArray(v) ? v : [v]).map(toClass);

export function findPolicy(dir: string): string | null {
  for (const n of ['zcashflight.yml', 'zcashflight.yaml']) {
    const p = resolve(dir, n);
    if (existsSync(p)) return p;
  }
  return null;
}

/** With no zcashflight.yml: protect everything, approve nothing. Used by offline scans. */
export function defaultPolicy(dir: string): Policy {
  return loadPolicy(resolve(dir, 'zcashflight.yml'), `app:\n  name: ${JSON.stringify(dir.split(/[\\/]/).pop() || 'app')}\n`);
}

export function loadPolicy(file: string, source?: string): Policy {
  const text = source ?? readFileSync(file, 'utf8');
  const y = (parseYaml(text) ?? {}) as Record<string, any>;
  const root = resolve(dirname(file), y.app?.root ?? '.');
  const app = y.app ?? {};
  const url = String(app.url ?? 'http://127.0.0.1:3000');
  const protect = y.protect == null ? [...ALL_CLASSES] : classes(y.protect);
  for (const c of ALWAYS_PROTECTED) if (!protect.includes(c)) protect.push(c);
  const destinations: Destination[] = (y.destinations ?? []).map((d: any) => {
    if (!d?.host) throw new PolicyError('each destination needs a host');
    const allow = classes(d.allow).filter(c => !ALWAYS_PROTECTED.includes(c));
    return { host: String(d.host).toLowerCase(), purpose: d.purpose, allow };
  });
  const logs: LogSource[] = (y.logs ?? []).map((l: any) => typeof l === 'string' ? { path: l, allow: [] } : { path: String(l.path), allow: classes(l.allow).filter(c => !ALWAYS_PROTECTED.includes(c)) });
  const scenarios: Scenario[] = (y.scenarios ?? []).map((s: any, i: number) => ({
    name: String(s.name ?? `scenario-${i + 1}`),
    description: s.description,
    steps: (s.steps ?? []).map((st: any) => {
      const m = /^(GET|POST|PUT|PATCH|DELETE)\s+(\S+)$/i.exec(String(st.request ?? ''));
      if (!m) throw new PolicyError(`scenario "${s.name}": step needs request: "METHOD /path"`);
      return { method: m[1].toUpperCase(), path: m[2], json: st.json, headers: st.headers, expect: st.expect, save: st.save, timeoutMs: st.timeout_ms === undefined ? undefined : Number(st.timeout_ms) };
    }),
  }));
  return {
    file, root,
    hash: createHash('sha256').update(text).digest('hex').slice(0, 12),
    network: String(y.network ?? 'testnet'),
    app: {
      name: String(app.name ?? 'app'), start: app.start, url,
      ready: String(app.ready ?? '/'), env: Object.fromEntries(Object.entries(app.env ?? {}).map(([k, v]) => [k, String(v)])),
      timeoutMs: Number(app.timeout_ms ?? 15000),
      proxy: app.proxy === true,
    },
    protect, destinations, logs,
    transactions: { shieldedOnly: y.transactions?.shielded_only !== false },
    sinkhole: y.sinkhole !== false,
    scenarios,
    notTested: (y.not_tested ?? ['Network metadata such as IP address and request timing at the transport layer']).map(String),
  };
}

/** Host match: exact, "*.example.com" wildcard, or host without port. */
export function destinationFor(p: Policy, host: string): Destination | undefined {
  const h = host.toLowerCase(), bare = h.replace(/:\d+$/, '');
  return p.destinations.find(d => d.host === h || d.host === bare || (d.host.startsWith('*.') && bare.endsWith(d.host.slice(1))));
}

const LABEL: Record<DataClass, string> = {
  address: 'addresses', amount: 'amounts', memo: 'memos', txid: 'transaction IDs',
  'viewing-key': 'viewing keys', 'spending-key': 'spending keys', 'seed-phrase': 'seed phrases',
};

/** Rewrite only the protect: list, leaving the rest of the file (comments included) untouched. */
export function writeProtect(file: string, protect: DataClass[]): void {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  const start = lines.findIndex(l => /^protect:/.test(l));
  const block = ['protect:', ...ALL_CLASSES.filter(c => protect.includes(c) || ALWAYS_PROTECTED.includes(c)).map(c => `  - ${LABEL[c]}`)];
  if (start === -1) { lines.push('', ...block); }
  else {
    let end = start + 1;
    while (end < lines.length && (/^\s+-/.test(lines[end]) || /^\s+#/.test(lines[end]) || (lines[end].trim() === '' && /^\s+-/.test(lines[end + 1] ?? '')))) end++;
    lines.splice(start, end - start, ...block);
  }
  writeFileSync(file, lines.join('\n'));
}
