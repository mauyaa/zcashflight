// Reports for people (Markdown, HTML) and for tools (SARIF for GitHub code scanning, JSON).
// Every value in a report comes from the run file, which only ever held masked evidence.

import type { Comparison, Finding, Run } from './types.ts';
import { REPO } from '../meta.ts';
import { LOGO } from '../brand.ts';
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

const SEV_ICON: Record<Finding['severity'], string> = { critical: '🟥', high: '🟧', medium: '🟨', low: '⬜' };
const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC';
const code = (s: string) => s.replace(/`([^`]+)`/g, '<code>$1</code>');
const loc = (f: Finding) => f.at ? `${f.at.file}:${f.at.line}` : '';

export function headline(run: Run, cmp?: Comparison): string {
  if (run.status !== 'complete' || run.scenarios.some(s => !s.ok)) return `Run ${run.n} did not complete: ${run.error ?? 'a scenario failed'}`;
  if (cmp?.verdict === 'incomplete') return `Run ${run.n}: comparison unavailable because a run did not complete.`;
  if (!run.findings.length) return cmp && cmp.closed.length ? `${cmp.closed.length === 1 ? 'The leak is' : `All ${cmp.closed.length} leaks`} closed. No leaks detected in these tests.` : 'No leaks detected in these tests.';
  const n = run.findings.length;
  return `${n} privacy ${n === 1 ? 'leak' : 'leaks'} found` + (cmp?.added.length ? `, ${cmp.added.length} new since run ${cmp.from}` : '') + '.';
}

export function markdown(run: Run, cmp?: Comparison): string {
  const L: string[] = [];
  L.push(`## ZcashFlight · ${run.app}`, '', `**${headline(run, cmp)}**`, '');
  L.push(`Run ${run.n} · ${run.network} · ${when(run.finishedAt)} · fingerprint \`${run.fingerprint}\` · ${plural(run.stats.requests, 'request')}, ${plural(run.stats.logs, 'log line')}, ${run.stats.sinkholed} kept off the network`, '');
  if (cmp && cmp.from) {
    L.push(`Compared with run ${cmp.from}: **${cmp.closed.length} closed**, ${cmp.open.length} still open, **${cmp.added.length} new**.`, '');
    if (cmp.closed.length) L.push(...cmp.closed.map(f => `- ~~${f.title}~~ closed`), '');
  }
  if (run.findings.length) {
    L.push('| | Finding | Rule | Where | Code |', '|---|---|---|---|---|');
    for (const f of run.findings) L.push(`| ${SEV_ICON[f.severity]} ${f.severity} | ${f.title}${cmp?.added.some(a => a.id === f.id) ? ' **(new)**' : ''} | ${f.rule} · ${f.ruleName} | \`${f.destination}\` | \`${loc(f)}\` |`);
    L.push('');
    for (const f of run.findings) {
      L.push(`<details><summary><b>${esc(f.title)}</b> · ${f.severity} · <code>${esc(loc(f))}</code></summary>`, '');
      L.push(`Scenario **${f.scenario}**, ${f.occurrences} occurrence${f.occurrences === 1 ? '' : 's'}. Evidence is masked.`, '', '```');
      L.push(f.sample);
      for (const e of f.evidence) L.push(`${e.path}: ${e.masked}   (${e.kind}, ${e.proof === 'checksum' ? 'checksum-verified' : e.proof === 'wordlist' ? 'BIP-39 wordlist' : e.proof === 'zip321' ? 'valid ZIP 321 payment request' : 'by field name'})`);
      L.push('```');
      if (f.snippet) L.push('', `\`${loc(f)}\``, '```', f.snippet, '```');
      L.push('', `**Fix:** ${f.remediation.summary}`, ...f.remediation.steps.map(s => `- ${s}`), '');
      if (f.remediation.refs.length) L.push(`**Read:** ${f.remediation.refs.map(r => `[${r.label}](${r.url})`).join(' · ')}`, '');
      L.push(`**Reproduce:** ${f.repro.map(r => '`' + r + '`').join(' → ')}`, '', '</details>', '');
    }
  }
  const unread = run.coverage.uninspected ?? [];
  if (unread.length) L.push('**Not inspected in this run** (coverage gaps, not findings):', '', ...unread.map(u => `- ${u.count} ${u.what} to \`${u.destination}\`: ${u.reason} (${u.scenarios.join(', ')})`), '');
  L.push('**Tested:** ' + run.coverage.tested.join(' · '), '', '**Not tested:**', '', ...run.coverage.notTested.slice(unread.length).map(t => `- ${t}`), '');
  L.push('<sub>ZcashFlight checks observable application behaviour in these tests. It does not decrypt transactions, deanonymise users, or certify that an app is private in all circumstances.</sub>');
  return L.join('\n');
}

export function sarif(run: Run): object {
  const rules = ['A', 'B', 'C', 'D'].map(id => {
    const f = run.findings.find(x => x.rule === id);
    return { id: `ZF-${id}`, name: f?.ruleName ?? { A: 'Sensitive data in requests', B: 'Sensitive data in logs', C: 'Transaction type and public exposure', D: 'Third-party data flows' }[id], helpUri: `${REPO}/blob/main/docs/reference/rules.md#rule-${id.toLowerCase()}` };
  });
  const level = (s: Finding['severity']) => s === 'critical' || s === 'high' ? 'error' : s === 'medium' ? 'warning' : 'note';
  return {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json', version: '2.1.0',
    runs: [{
      tool: { driver: { name: 'ZcashFlight', informationUri: REPO, rules, notifications: [{ id: 'ZF-COVERAGE', name: 'Uninspected traffic', shortDescription: { text: 'Traffic ZcashFlight saw but could not read. A coverage gap, not a finding.' } }] } },
      // Coverage gaps are tool notifications, never results: they are not vulnerabilities and must not look like them
      invocations: [{
        executionSuccessful: run.status === 'complete',
        toolExecutionNotifications: (run.coverage.uninspected ?? []).map(u => ({
          descriptor: { id: 'ZF-COVERAGE' }, level: 'warning',
          message: { text: `Not inspected: ${u.count} ${u.what} to ${u.destination} (${u.reason}) in ${u.scenarios.join(', ')}` },
        })),
      }],
      results: run.findings.map(f => ({
        ruleId: `ZF-${f.rule}`, level: level(f.severity),
        message: { text: `${f.title} (${f.destination}). ${f.remediation.summary}` },
        partialFingerprints: { zcashflight: f.id },
        locations: f.at ? [{ physicalLocation: { artifactLocation: { uri: f.at.file }, region: { startLine: f.at.line, startColumn: f.at.col } } }] : [],
      })),
    }],
  };
}

export function html(run: Run, cmp?: Comparison): string {
  const rows = run.findings.map(f => `
  <article class="f">
    <header><h3>${esc(f.title)}</h3><span class="sev ${f.severity}">${f.severity}</span></header>
    <p class="meta">Rule ${f.rule} · ${esc(f.ruleName)} · to <code>${esc(f.destination)}</code> · scenario ${esc(f.scenario)} · ${f.occurrences}×</p>
    <pre class="ev">${esc(f.sample)}\n${f.evidence.map(e => `${esc(e.path)}: <b>${esc(e.masked)}</b>  <i>${esc(e.kind)} · ${e.proof}</i>`).join('\n')}</pre>
    ${f.snippet ? `<p class="lbl"><code>${esc(loc(f))}</code></p><pre class="ev">${esc(f.snippet)}</pre>` : ''}
    <p class="fix"><b>Fix.</b> ${esc(f.remediation.summary)}</p><ul>${f.remediation.steps.map(s => `<li>${code(esc(s))}</li>`).join('')}</ul>
    ${f.remediation.refs.length ? `<p class="meta">Read: ${f.remediation.refs.map(r => `<a href="${esc(r.url)}" rel="noreferrer">${esc(r.label)}</a>`).join(' · ')}</p>` : ''}
    <p class="meta">Reproduce: ${f.repro.map(r => `<code>${esc(r)}</code>`).join(' → ')}</p>
  </article>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ZcashFlight report · ${esc(run.app)} · run ${run.n}</title>
<style>
/* Tokens: concept palette (documented exception) on screen; the design system's Product Light tokens for light mode and print. */
:root{--color-bg:#111c27;--color-surface:rgba(238,241,234,.04);--color-surface-raised:rgba(238,241,234,.07);--color-border:rgba(238,241,234,.12);--color-border-strong:rgba(238,241,234,.4);
--color-text-primary:#eef1ea;--color-text-secondary:rgba(238,241,234,.7);--color-text-muted:rgba(238,241,234,.55);--color-accent:#dcf5a6;--color-destructive-text:#ff7d64;--color-track:#4a7a77;color-scheme:dark}
@media (prefers-color-scheme:light){:root{--color-bg:#ffffff;--color-surface:#f8fafc;--color-surface-raised:#f1f5f9;--color-border:#e2e8f0;--color-border-strong:#94a3b8;
--color-text-primary:#1e293b;--color-text-secondary:rgba(30,41,59,.7);--color-text-muted:rgba(30,41,59,.62);--color-accent:#0055ff;--color-destructive-text:#b13600;--color-track:#94a3b8;color-scheme:light}}
@media print{:root{--color-bg:#ffffff;--color-surface:#f8fafc;--color-surface-raised:#f1f5f9;--color-border:#e2e8f0;--color-border-strong:#94a3b8;--color-text-primary:#1e293b;--color-text-secondary:rgba(30,41,59,.75);--color-text-muted:rgba(30,41,59,.62);--color-accent:#0055ff;--color-destructive-text:#b13600;--color-track:#94a3b8}.f{break-inside:avoid}}
*{box-sizing:border-box}
body{margin:0;background:var(--color-bg);color:var(--color-text-primary);font:16px/1.6 'Instrument Sans',Inter,system-ui,-apple-system,sans-serif;letter-spacing:-.01em;-webkit-font-smoothing:antialiased}
main{max-width:900px;margin:0 auto;padding:48px 24px 96px}
.word{display:block;height:20px;width:auto;color:var(--color-text-primary)}
.eyebrow{font-size:12px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--color-accent);margin:48px 0 8px}
h1{font-weight:600;font-size:clamp(2rem,5vw,2.75rem);line-height:1.1;letter-spacing:-.025em;margin:0 0 16px;text-wrap:balance}
h3{font-weight:600;font-size:1.375rem;line-height:1.35;letter-spacing:-.01em;margin:0}
p{margin:0}
.meta{color:var(--color-text-secondary);font-size:14px;line-height:1.5;margin:8px 0}
.lbl{color:var(--color-text-muted);font-size:12px;font-weight:500;margin:16px 0 8px}
code,pre{font-family:ui-monospace,'JetBrains Mono',SFMono-Regular,Menlo,monospace;font-size:13px;letter-spacing:0}
pre.ev{background:var(--color-surface);border:1px solid var(--color-border);border-radius:12px;padding:12px 16px;white-space:pre-wrap;word-break:break-word;color:var(--color-text-secondary);line-height:1.7;margin:8px 0}
pre.ev b{color:var(--color-destructive-text);font-weight:500} pre.ev i{color:var(--color-text-muted);font-style:normal}
.f{border-top:1px solid var(--color-border);padding:32px 0}
.f header{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.sev{display:inline-flex;align-items:center;height:24px;padding:0 8px;border-radius:100px;font-size:12px;font-weight:500;border:1px solid var(--color-border-strong);color:var(--color-text-secondary);text-transform:capitalize}
.sev.critical,.sev.high{color:var(--color-destructive-text);border-color:currentColor}
ul{color:var(--color-text-secondary);padding-left:20px;margin:8px 0}
li{margin:4px 0}
a{color:var(--color-accent);text-underline-offset:3px}
.fix{margin-top:16px}
.gap{border-left:2px solid #d9a441;padding:4px 0 4px 16px;margin:8px 0 24px}.gap h4{font-weight:600;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#d9a441;margin:0 0 6px}.gap p{color:var(--color-text-muted);font-size:13px;margin:0 0 8px}.gap div{color:var(--color-text-secondary);font-size:14px;margin:4px 0}
.cov{display:grid;grid-template-columns:1fr 1fr;gap:24px;border-top:1px solid var(--color-border);padding-top:32px;margin-top:8px}
.cov h4{font-weight:600;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--color-text-muted);margin:0 0 8px}
.cov div div{color:var(--color-text-secondary);font-size:14px;margin:4px 0}
.ok{color:var(--color-accent)} small{color:var(--color-text-muted);font-size:12px;line-height:1.5;display:block;margin-top:32px}
@media (max-width:640px){.cov{grid-template-columns:1fr}main{padding:32px 16px 64px}}
</style></head><body><main>
<svg class="word" viewBox="0 0 ${LOGO.width} ${LOGO.height}" role="img" aria-label="ZcashFlight"><path fill="${LOGO.markFill}" transform="${LOGO.markTransform}" d="${LOGO.mark}"/><path fill="currentColor" d="${LOGO.letters}"/></svg>
<p class="eyebrow">Privacy report</p>
<h1 class="${run.findings.length ? '' : 'ok'}">${esc(headline(run, cmp))}</h1>
<p class="meta">${esc(run.app)} · run ${run.n} · ${esc(run.network)} · ${esc(when(run.finishedAt))} · fingerprint <code>${esc(run.fingerprint)}</code></p>
<p class="meta">${plural(run.stats.requests, 'request')} and ${plural(run.stats.logs, 'log line')} inspected on this machine · ${run.stats.sinkholed} third-party requests kept off the network · hosts: ${run.stats.hosts.map(h => `<code>${esc(h)}</code>`).join(', ') || 'none'}</p>
${cmp && cmp.from ? `<p class="meta">Compared with run ${cmp.from}: <b>${cmp.closed.length} closed</b>, ${cmp.open.length} still open, <b>${cmp.added.length} new</b>.${cmp.closed.length ? ' Closed: ' + cmp.closed.map(f => `<s>${esc(f.title)}</s>`).join(' · ') : ''}</p>` : ''}
${rows}
${(run.coverage.uninspected ?? []).length ? `<section class="gap"><h4>Not inspected in this run</h4><p>Coverage gaps, not findings: ZcashFlight saw this traffic but could not read it.</p>${run.coverage.uninspected!.map(u => `<div>${u.count} ${esc(u.what)} to <code>${esc(u.destination)}</code>: ${esc(u.reason)}</div>`).join('')}</section>` : ''}
<section class="cov"><div><h4>Tested</h4>${run.coverage.tested.map(t => `<div>${esc(t)}</div>`).join('')}</div><div><h4>Not tested</h4>${run.coverage.notTested.slice((run.coverage.uninspected ?? []).length).map(t => `<div>${esc(t)}</div>`).join('')}</div></section>
<p><small>All values above were masked where they were captured; raw payloads were never written to disk. ZcashFlight checks observable application behaviour in these tests. It does not decrypt transactions, deanonymise users, or certify that an app is private in all circumstances.</small></p>
</main></body></html>`;
}
