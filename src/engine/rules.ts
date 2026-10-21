// Deterministic privacy rules. Each finding is backed by captured, masked evidence; nothing is inferred by a model.
//   A  Sensitive data in requests     (high)    protected data sent where the policy does not allow it
//   B  Sensitive data in logs         (high)    protected data written to console or log files
//   C  Transaction type exposure      (medium)  wallet RPC sends that reveal transparent recipients or senders
//   D  Third-party data flows         (medium)  requests to hosts the policy has not approved
// Spending keys and seed phrases are critical wherever they appear.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { destinationFor, type Policy } from './policy.ts';
import type { CaptureEvent, Finding, MaskedHit, RuleId, ScenarioResult, Severity } from './types.ts';
import type { DataClass } from '../zcash/identifiers.ts';

const RULE_NAME: Record<RuleId, string> = {
  A: 'Sensitive data in requests',
  B: 'Sensitive data in logs',
  C: 'Transaction type and public exposure',
  D: 'Third-party data flows',
};

const NOUN: Record<DataClass, [string, string]> = {
  address: ['Address', 'address'], amount: ['Amount', 'amount'], memo: ['Memo', 'memo'],
  txid: ['Transaction ID', 'transaction ID'], 'viewing-key': ['Viewing key', 'viewing key'],
  'spending-key': ['Spending key', 'spending key'], 'seed-phrase': ['Seed phrase', 'seed phrase'],
};
const ORDER: DataClass[] = ['seed-phrase', 'spending-key', 'viewing-key', 'address', 'amount', 'memo', 'txid'];

export function listClasses(cs: DataClass[]): string {
  const s = ORDER.filter(c => cs.includes(c)).map((c, i) => NOUN[c][i ? 1 : 0]);
  return s.length <= 1 ? s.join('') : s.slice(0, -1).join(', ') + ' and ' + s[s.length - 1];
}

type Category = 'analytics' | 'error monitoring' | 'RPC provider' | 'price API' | 'CDN' | 'third party';
export function categorize(host: string): Category {
  const h = host.toLowerCase();
  if (/segment|mixpanel|amplitude|posthog|google-analytics|googletagmanager|plausible|heap|analytics|telemetry|matomo/.test(h)) return 'analytics';
  if (/sentry|bugsnag|rollbar|datadog|honeybadger|errors?\.|logrocket|newrelic/.test(h)) return 'error monitoring';
  if (/lightwalletd|rpc|zec\.rocks|zcash|infura|alchemy|blockchair|node/.test(h)) return 'RPC provider';
  if (/coingecko|coinmarketcap|kraken|binance|price|rates|exchange/.test(h)) return 'price API';
  if (/cdn|fonts\.|jsdelivr|unpkg|cloudflare/.test(h)) return 'CDN';
  return 'third party';
}
const article = (c: string) => (/^[aeiou]/i.test(c) && !/^(RPC|API)/.test(c) ? 'an ' : 'a ') + c;

const REFS = {
  privacy: { label: 'Zcash privacy recommendations', url: 'https://zcash.readthedocs.io/en/latest/rtd_pages/privacy_recommendations_best_practices.html' },
  pools: { label: 'Addresses and value pools', url: 'https://zcash.readthedocs.io/en/latest/rtd_pages/addresses.html' },
  zip316: { label: 'ZIP 316: Unified addresses', url: 'https://zips.z.cash/zip-0316' },
  rpc: { label: 'z_sendmany privacy policies', url: 'https://zcash.github.io/rpc/z_sendmany.html' },
};

function remediation(rule: RuleId, cat: string, classes: DataClass[], fields: string[]): Finding['remediation'] {
  // A ZIP 321 request is one value: name the field that carries it, not its address/amount/memo parts
  const zip = fields.some(x => /\[zip321/.test(x));
  const named = [...new Set(fields.map(x => x.replace(/\[zip321[^\]]*\]\.\w+$/, '')))];
  const f = named.length ? named.map(x => '`' + x + '`').join(', ') + (zip ? ' (a ZIP 321 payment request: who is paid, how much, and the memo)' : '') : 'the protected fields';
  const secret = classes.some(c => c === 'spending-key' || c === 'seed-phrase' || c === 'viewing-key');
  if (secret) return {
    summary: 'Treat this key material as compromised: rotate it, then remove every code path that can serialise it.',
    steps: ['Generate new keys and move test funds; the exposed key can no longer be trusted.', `Remove ${f} from this code path entirely; keys should never be serialised outside the wallet.`, 'Add this scenario to CI so the regression is caught before merge.'],
    refs: [REFS.privacy],
  };
  if (rule === 'A' && cat === 'analytics') return {
    summary: 'Send event names, not payment data.',
    steps: [`Drop ${f} from the analytics payload.`, 'If you need conversion numbers, count them on your server without identifiers.', 'Re-run ZcashFlight to confirm the event no longer carries protected fields.'],
    refs: [REFS.privacy],
  };
  if (rule === 'A' && cat === 'error monitoring') return {
    summary: 'Scrub error reports before they leave the app.',
    steps: [`Remove ${f} from the error context.`, 'Add a scrubbing hook (e.g. Sentry beforeSend) that strips Zcash identifiers, memos and amounts.', 'Attach your own random correlation ID instead, so you can still debug.'],
    refs: [REFS.privacy],
  };
  if (rule === 'A') return {
    summary: 'Only send protected data to destinations your policy approves, and only what they need.',
    steps: [`Remove ${f} from this request, or route it through an approved destination.`, 'If this destination genuinely needs the data, add it to destinations: in zcashflight.yml with an explicit purpose.'],
    refs: [REFS.privacy],
  };
  if (rule === 'B') return {
    summary: 'Log what happened, not who or how much.',
    steps: [`Stop interpolating ${f} into log lines.`, 'Log a locally generated correlation ID; keep the txid ↔ ID mapping out of logs.', 'Add a logger redaction rule for Zcash identifiers as a second line of defence.'],
    refs: [REFS.privacy],
  };
  if (rule === 'C') return {
    summary: 'Keep funds in the shielded pool end to end.',
    steps: ['Send to the customer\'s unified (or Sapling/Orchard) address, never a transparent one.', 'Pass privacyPolicy "FullPrivacy" to z_sendmany so the wallet refuses revealing transactions.', 'Reject transparent refund addresses at input validation.'],
    refs: [REFS.pools, REFS.zip316, REFS.rpc],
  };
  return {
    summary: 'Every third-party call reveals that something happened, and when.',
    steps: [`Move this ${cat} call off the user's path: fetch on a schedule on your server and cache it.`, 'If the call must stay, add the host to destinations: with a purpose so the exposure is a documented decision.'],
    refs: [REFS.privacy],
  };
}

function sev(rule: RuleId, classes: DataClass[]): Severity {
  if (classes.some(c => c === 'spending-key' || c === 'seed-phrase')) return 'critical';
  if (classes.includes('viewing-key')) return 'high';
  return rule === 'A' || rule === 'B' ? 'high' : 'medium';
}

function snippetAt(root: string, at?: Finding['at']): string | undefined {
  if (!at) return undefined;
  try { return readFileSync(resolve(root, at.file), 'utf8').split(/\r?\n/)[at.line - 1]?.trim(); } catch { return undefined; }
}

/** The line to fix: the frame where a protected field is handed over by name, else (for wallet sends)
 *  the first caller outside the RPC client, else where the request left. */
function origin(root: string, g: Group, fields: string[]): Pick<Finding, 'at' | 'stack' | 'snippet'> {
  const stack = g.stack ?? (g.at ? [g.at] : []);
  if (!stack.length) return {};
  // A field's own name, and for a ZIP 321 request the name of the field that carried the whole request
  const keys = [...new Set(fields.flatMap(f => {
    const seg = f.split(/[.[\]]/).filter(Boolean), z = seg.findIndex(x => x.startsWith('zip321'));
    return z > 0 ? [seg[z - 1], seg[seg.length - 1]] : [seg[seg.length - 1] ?? ''];
  }).filter(k => k.length > 2))];
  const lines = stack.map(l => snippetAt(root, l) ?? '');
  let i = g.rule === 'C' ? stack.findIndex(l => l.file !== stack[0].file) : -1;
  if (i === -1 && keys.length) i = lines.findIndex(s => keys.some(k => new RegExp(`\\b${k.replace(/[^\w]/g, '')}\\b`).test(s)));
  if (i === -1) i = 0;
  // Source literals can contain secrets that were masked at capture. Keep source
  // text in memory for blame selection; never copy it into persisted findings.
  return { at: stack[i], stack };
}

function scenarioOf(e: CaptureEvent, scenarios: ScenarioResult[]): { name: string; step?: string } {
  // The scenario whose window contains the event; else the last one started before it (late fire-and-forget traffic).
  // Windows are back to back, so a containment test comes first: an event at the end of one step is not the next one's.
  let hit = scenarios.find(s => e.t >= s.window[0] && (!s.window[1] || e.t <= s.window[1]));
  if (!hit) for (const s of scenarios) if (e.t >= s.window[0] - 5) hit = s;
  if (!hit) return { name: scenarios[0]?.name ?? 'capture' };
  return { name: hit.name };
}

interface Group { rule: RuleId; dest: string; cat: string; events: CaptureEvent[]; hits: MaskedHit[]; classes: Set<DataClass>; scenario: string; at?: CaptureEvent['at']; stack?: CaptureEvent['stack'] }

export function evaluate(events: CaptureEvent[], policy: Policy, scenarios: ScenarioResult[]): Finding[] {
  const groups = new Map<string, Group>();
  const add = (rule: RuleId, dest: string, cat: string, e: CaptureEvent, hits: MaskedHit[], cls: DataClass[]) => {
    const loc = e.stack?.length ? e.stack.map(l => `${l.file}:${l.line}`).join('<') : e.at ? `${e.at.file}:${e.at.line}` : (e.fields ?? []).join(',');
    const key = [rule, dest, loc].join('|');
    let g = groups.get(key);
    if (!g) groups.set(key, g = { rule, dest, cat, events: [], hits: [], classes: new Set(), scenario: scenarioOf(e, scenarios).name, at: e.at, stack: e.stack });
    g.events.push(e);
    for (const h of hits) if (!g.hits.some(x => x.path === h.path)) g.hits.push(h);
    cls.forEach(c => g.classes.add(c));
  };

  for (const e of events) {
    if (e.type === 'request' && e.host) {
      const dest = destinationFor(policy, e.host);
      const bad = e.hits.filter(h => policy.protect.includes(h.cls) && !dest?.allow.includes(h.cls));
      if (bad.length) add('A', e.host, categorize(e.host), e, bad, bad.map(h => h.cls));
      if (e.rpc && policy.transactions.shieldedOnly) {
        const revealing = /^(AllowRevealed|AllowFullyTransparent|NoPrivacy|AllowLinkingAccountAddresses)/.test(e.rpc.privacyPolicy ?? '');
        const toT = e.rpc.toPools.some(p => p === 'transparent' || p === 'tex');
        // Shielding (transparent coinbase into a shielded address) is what Zcash recommends, not an exposure
        const shielding = e.rpc.method === 'z_shieldcoinbase' && !toT;
        const fromT = e.rpc.fromPool === 'transparent' && !shielding;
        if (toT || fromT || revealing) {
          const hs = e.hits.filter(h => h.cls === 'address' && (h.pool === 'transparent' || h.pool === 'tex'));
          add('C', e.host, 'wallet', e, hs, ['address']);
        }
      }
      if (!dest && !e.loopback && !bad.length) add('D', e.host, categorize(e.host), e, [], []);
    }
    if (e.type === 'log') {
      const src = policy.logs.find(l => l.path === e.source);
      const bad = e.hits.filter(h => policy.protect.includes(h.cls) && !src?.allow.includes(h.cls));
      if (bad.length) add('B', e.source ?? 'log', 'log', e, bad, bad.map(h => h.cls));
    }
  }

  const findings: Finding[] = [];
  for (const g of groups.values()) {
    const classes = ORDER.filter(c => g.classes.has(c));
    const first = g.events[0];
    const fields = [...new Set(g.events.flatMap(e => e.fields ?? []))].slice(0, 12);
    const evFields = [...new Set(g.hits.map(h => h.path.replace(/^body\./, '')))];
    let title: string;
    if (g.rule === 'A') title = `${listClasses(classes)} sent to ${g.cat === 'third party' ? g.dest : g.cat}`;
    else if (g.rule === 'B') title = `${listClasses(classes)} written to ${g.dest.startsWith('console.') ? 'the console log' : 'a log'}`;
    else if (g.rule === 'C') title = first.rpc?.toPools.some(p => p === 'transparent' || p === 'tex') ? 'Payment sent to a transparent address' : 'Transaction may reveal sender or amount';
    else title = `${cap(g.scenario)} activity revealed to ${article(g.cat)}`;
    const step = scenarios.find(s => s.name === g.scenario)?.steps[0]?.request;
    const sample = first.type === 'log' ? (first.line ?? '') : `${first.method} ${first.url}`;
    findings.push({
      id: createHash('sha256').update([g.rule, g.dest, (g.stack ?? (g.at ? [g.at] : [])).map(l => l.file + ':' + (l.fn ?? '')).join('<'), classes.join(',')].join('|')).digest('hex').slice(0, 10),
      rule: g.rule, ruleName: RULE_NAME[g.rule], severity: sev(g.rule, classes),
      title, classes, destination: g.dest, scenario: g.scenario, step,
      occurrences: g.events.length, firstSeq: first.seq,
      evidence: g.hits.slice(0, 12), sample, fields: g.rule === 'D' || g.rule === 'A' ? fields : undefined,
      ...origin(policy.root, g, evFields),
      remediation: remediation(g.rule, g.cat, classes, g.rule === 'D' ? fields : evFields),
      repro: [
        `zcashflight run --scenario ${g.scenario}`,
        ...(step ? [`Scenario step: ${step}`] : []),
        g.rule === 'B' ? `Observed in ${g.dest}` : `Observed: ${first.method} ${first.url}`,
      ],
    });
  }
  const rank: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  return findings.sort((a, b) => rank[a.severity] - rank[b.severity] || a.firstSeq - b.firstSeq);
}

function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }
