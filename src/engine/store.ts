// Runs live next to the project in .zcashflight/runs/NNNN.json. Local files only; nothing is uploaded.
// Every stored value is already masked, so a run file is safe to attach to an issue or a PR.

import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Comparison, Finding, Run } from './types.ts';

export function stateDir(root: string): string {
  const d = join(root, '.zcashflight');
  mkdirSync(join(d, 'runs'), { recursive: true });
  mkdirSync(join(d, 'tmp'), { recursive: true });
  const gi = join(d, '.gitignore');
  if (!existsSync(gi)) writeFileSync(gi, '# ZcashFlight local state. Run files hold masked evidence only.\ntmp/\n');
  return d;
}

export function listRuns(root: string): Run[] {
  const d = join(root, '.zcashflight', 'runs');
  if (!existsSync(d)) return [];
  return readdirSync(d).filter(f => /^\d{4,}\.json$/.test(f)).sort()
    .map(f => { try { return JSON.parse(readFileSync(join(d, f), 'utf8')) as Run; } catch { return null; } })
    .filter((r): r is Run => !!r);
}

export function nextRunNumber(root: string): number {
  const runs = listRuns(root);
  return runs.length ? runs[runs.length - 1].n + 1 : 1;
}

export function saveRun(root: string, run: Run): string {
  const f = join(stateDir(root), 'runs', String(run.n).padStart(4, '0') + '.json');
  writeFileSync(f, JSON.stringify(run, null, 2));
  return f;
}

export function getRun(root: string, n?: number): Run | undefined {
  const runs = listRuns(root);
  return n == null ? runs[runs.length - 1] : runs.find(r => r.n === n);
}

/** The last run of the same app before run n (or the latest one). Runs of another policy in the same
 *  folder, such as a mock and a regtest policy, are never compared with each other. */
export function previousRun(root: string, app: string, before = Infinity): Run | undefined {
  return listRuns(root).filter(r => r.app === app && r.n < before).pop();
}

/** Compare two runs by stable finding id. */
export function compareRuns(a: Run | undefined, b: Run): Comparison {
  if (b.status !== 'complete' || b.scenarios.some(s => !s.ok) || (a && (a.status !== 'complete' || a.scenarios.some(s => !s.ok)))) {
    return { from: a?.n ?? 0, to: b.n, closed: [], open: a?.findings ?? [], added: [], verdict: 'incomplete' };
  }
  const before = new Map((a?.findings ?? []).map(f => [f.id, f]));
  const after = new Map(b.findings.map(f => [f.id, f]));
  const closed: Finding[] = [], open: Finding[] = [], added: Finding[] = [];
  for (const [id, f] of before) (after.has(id) ? open : closed).push(after.get(id) ?? f);
  for (const [id, f] of after) if (!before.has(id)) added.push(f);
  const verdict: Comparison['verdict'] = !b.findings.length ? 'clean' : added.length ? 'regressed' : closed.length ? 'improved' : 'unchanged';
  return { from: a?.n ?? 0, to: b.n, closed, open, added, verdict };
}

export interface Baseline { accepted: { id: string; title: string; reason?: string }[] }

export function loadBaseline(root: string): Baseline | null {
  const f = join(root, 'zcashflight.baseline.json');
  if (!existsSync(f)) return null;
  return JSON.parse(readFileSync(f, 'utf8'));
}
