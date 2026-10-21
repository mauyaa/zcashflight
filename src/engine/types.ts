// Shapes shared by the collector, the rule engine, the store and the dashboard.
// Capture events are masked at the source: raw sensitive values never reach these structures.

import type { DataClass, Network, Pool } from '../zcash/identifiers.ts';

export interface MaskedHit {
  cls: DataClass;
  kind: string;
  network?: Network;
  pool?: Pool;
  proof: 'checksum' | 'context' | 'wordlist' | 'zip321';
  path: string;
  decoded?: 'base64';  // found inside a base64-encoded value (the encoded value is masked as a whole)
  masked: string;  // safe-to-display form, e.g. "utest1c9…k3fz" or "[redacted seed phrase]"
  ref: string;     // keyed hash with a per-run key: links repeats of one value inside a run, unlinkable across runs
}

export interface Location { file: string; line: number; col: number; fn?: string }

export interface RpcCall {
  method: string;
  fromPool?: Pool | 'unknown';
  toPools: (Pool | 'unknown')[];
  privacyPolicy?: string;
}

export interface CaptureEvent {
  seq: number;
  t: number;
  type: 'request' | 'log';
  // request
  method?: string;
  url?: string;          // masked
  host?: string;
  loopback?: boolean;
  headers?: string[];    // header names only
  fields?: string[];     // body field paths transmitted (names, not values)
  bytes?: number;
  sinkholed?: boolean;
  via?: 'fetch' | 'http' | 'proxy' | 'har';
  decoded?: string;      // encoding undone before scanning: gzip, deflate, br, multipart/form-data
  uninspected?: { what: string; reason: string }[];  // parts ZcashFlight could not read: reported, never treated as clean
  rpc?: RpcCall;
  // log
  source?: string;       // 'console.debug' or a log file path
  line?: string;         // masked log text, truncated
  // both
  hits: MaskedHit[];
  at?: Location;          // innermost project frame: where the data left
  stack?: Location[];     // project frames, innermost first: who passed it there
}

export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type RuleId = 'A' | 'B' | 'C' | 'D';

export interface Finding {
  id: string;            // stable across runs: rule + destination + code location + classes
  rule: RuleId;
  ruleName: string;
  severity: Severity;
  title: string;         // "Address and amount sent to analytics"
  classes: DataClass[];
  destination: string;   // host, or log source
  scenario: string;
  step?: string;
  occurrences: number;
  firstSeq: number;
  evidence: MaskedHit[];
  sample: string;        // one masked request line or log line
  fields?: string[];
  at?: Location;
  stack?: Location[];
  snippet?: string;      // the source line at `at`, read locally
  remediation: { summary: string; steps: string[]; refs: { label: string; url: string }[] };
  repro: string[];
}

export interface ScenarioResult {
  name: string;
  description?: string;
  ok: boolean;
  steps: { request: string; status: number | null; ok: boolean; ms: number; error?: string }[];
  window: [number, number];
}

export interface Run {
  version: 1;
  n: number;
  id: string;
  startedAt: string;
  finishedAt: string;
  app: string;
  network: string;
  policyHash: string;
  protect: DataClass[];
  status: 'complete' | 'incomplete' | 'failed';
  error?: string;
  scenarios: ScenarioResult[];
  stats: { requests: number; external: number; sinkholed: number; logs: number; hosts: string[] };
  // tested / notTested: what reports show. uninspected: traffic that was seen but could not be read
  // (never counted as clean; fails the CI gate under `strict: true`). channels: what was actually observed.
  findings: Finding[];
  coverage: {
    tested: string[];
    notTested: string[];
    uninspected?: { what: string; reason: string; destination: string; count: number; scenarios: string[] }[];
    channels?: { name: string; count: number }[];
  };
  fingerprint: string;
}

export interface Comparison {
  from: number;
  to: number;
  closed: Finding[];
  open: Finding[];
  added: Finding[];
  verdict: 'clean' | 'improved' | 'regressed' | 'unchanged' | 'incomplete';
}
