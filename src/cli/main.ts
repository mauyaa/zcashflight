// zcashflight: privacy tests for Zcash apps.

import { writeFileSync, existsSync, readFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { resolve, join, dirname, basename } from 'node:path';
import { findPolicy, loadPolicy, defaultPolicy, PolicyError, type Policy } from '../engine/policy.ts';
import { runPolicy, scanFiles, type Progress } from '../engine/runner.ts';
import { listRuns, getRun, compareRuns, loadBaseline, stateDir } from '../engine/store.ts';
import { markdown, html, sarif, headline } from '../engine/report.ts';
import { startProxy } from '../capture/proxy.ts';
import { runKey } from '../engine/mask.ts';
import { synth } from '../zcash/synth.ts';
import { VERSION, REPO } from '../meta.ts';
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
import type { Finding, Run } from '../engine/types.ts';

const tty = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code: string) => (s: string) => tty ? `\x1b[${code}m${s}\x1b[0m` : s;
const dim = c('2'), bold = c('1'), red = c('38;5;209'), lime = c('38;5;193'), yellow = c('33');

function args(argv: string[]) {
  const pos: string[] = [], flags: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      if (v !== undefined) flags[k] = v;
      else if (argv[i + 1] && !argv[i + 1].startsWith('--') && !['ci', 'json', 'no-open', 'help'].includes(k)) flags[k] = argv[++i];
      else flags[k] = true;
    } else pos.push(a);
  }
  return { pos, flags };
}

function policyFor(dir: string): Policy {
  const f = findPolicy(dir);
  if (!f) throw new PolicyError(`no zcashflight.yml in ${dir}. Run \`zcashflight init\` to create one.`);
  return loadPolicy(f);
}

const SEV: Record<Finding['severity'], (s: string) => string> = { critical: red, high: red, medium: yellow, low: dim };

function printRun(run: Run, prev?: Run) {
  const cmp = prev ? compareRuns(prev, run) : undefined;
  console.log('');
  console.log(run.findings.length ? bold(red(headline(run, cmp))) : bold(lime(headline(run, cmp))));
  console.log(dim(`run ${run.n} · ${run.network} · ${plural(run.stats.requests, 'request')}, ${plural(run.stats.logs, 'log line')} · ${run.stats.sinkholed} kept off the network · fingerprint ${run.fingerprint}`));
  if (run.error) console.log(yellow(run.error));
  console.log('');
  for (const f of run.findings) {
    const isNew = cmp?.added.some(a => a.id === f.id);
    console.log(`  ${SEV[f.severity](f.severity.padEnd(8))} ${bold(f.title)}${isNew ? red('  new') : ''}`);
    console.log(dim(`           ${f.rule} · to ${f.destination}${f.at ? ` · ${f.at.file}:${f.at.line}` : ''}`));
    for (const e of f.evidence.slice(0, 3)) console.log(`           ${dim(e.path + ':')} ${red(e.masked)} ${dim(`(${e.proof === 'checksum' ? 'checksum ✓' : e.proof})`)}`);
    console.log(`           ${lime('fix')} ${f.remediation.summary}`);
    console.log('');
  }
  if (cmp?.closed.length) { for (const f of cmp.closed) console.log(`  ${lime('closed  ')} ${dim(f.title)}`); console.log(''); }
  console.log(dim('  tested:     ' + run.coverage.tested.join(' · ')));
  console.log(dim('  not tested: ' + run.coverage.notTested.join(' · ')));
  console.log('');
}

function progress(): (p: Progress) => void {
  let last = '';
  return p => {
    let line = '';
    if (p.type === 'phase') line = { starting: `starting ${p.detail}`, ready: 'app is up, collector listening', scenarios: 'running scenarios', evaluating: 'evaluating rules', done: '' }[p.phase];
    else if (p.type === 'step') line = `${p.scenario}: ${p.request} → ${p.status ?? 'no answer'}`;
    else if (p.type === 'captured') { if (tty) process.stdout.write(`\r${dim(`  listening · ${plural(p.requests, 'request')} · ${plural(p.logs, 'log line')}`)}\x1b[K`); return; }
    else if (p.type === 'error') line = yellow(p.message) + (p.detail ? '\n' + dim(p.detail.split('\n').map(l => '    ' + l).join('\n')) : '');
    if (line && line !== last) { if (tty) process.stdout.write('\r\x1b[K'); console.log(dim('  › ') + line); last = line; }
  };
}

function writeOut(run: Run, fmt: string, out: string | undefined, prev?: Run) {
  const cmp = prev ? compareRuns(prev, run) : undefined;
  const body = fmt === 'html' ? html(run, cmp) : fmt === 'sarif' ? JSON.stringify(sarif(run), null, 2) : fmt === 'json' ? JSON.stringify(run, null, 2) : markdown(run, cmp);
  if (out) { mkdirSync(dirname(resolve(out)), { recursive: true }); writeFileSync(out, body); console.log(dim(`  wrote ${out}`)); }
  else console.log(body);
}

/** CI gate: new findings at or above the threshold fail the build; accepted ones in zcashflight.baseline.json do not. */
function gate(run: Run, root: string, failOn: string): number {
  if (run.status !== 'complete') return 2;
  const order = ['low', 'medium', 'high', 'critical'];
  const min = order.indexOf(failOn);
  const accepted = new Set((loadBaseline(root)?.accepted ?? []).map(a => a.id));
  return run.findings.some(f => order.indexOf(f.severity) >= min && !accepted.has(f.id)) ? 1 : 0;
}

const HELP = `
${bold('zcashflight')} ${dim(VERSION)} — privacy tests for Zcash apps. Privacy should be verified, not merely promised.

  ${bold('zcashflight run')}               start the app, run its scenarios, report what leaked
      --scenario <name>           run one scenario
      --ci                        exit 1 on findings at/above --fail-on (default medium), 2 if the run is incomplete
      --sarif <file>              also write SARIF for GitHub code scanning
      --report <file>             also write an HTML or Markdown report (by extension)
  ${bold('zcashflight scan')} <files…>      inspect a HAR export or log files offline
  ${bold('zcashflight compare')} [a] [b]    what closed, what is still open, what is new
  ${bold('zcashflight report')} [n]         --format md|html|sarif|json  --out <file>
  ${bold('zcashflight ui')}                 open the local dashboard (127.0.0.1 only)   --port 4610
  ${bold('zcashflight proxy')}              local proxy for non-Node apps (HTTP_PROXY / HTTPS_PROXY)  --port 4601
  ${bold('zcashflight init')}               write a starter zcashflight.yml
  ${bold('zcashflight synth')}              print synthetic testnet identifiers with valid checksums
  ${bold('zcashflight list')}               past runs

  --dir <path>   project folder (default: current folder)
`;

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const [cmd = 'help', ...rest] = argv;
  const { pos, flags } = args(rest);
  const dir = resolve(String(flags.dir ?? process.cwd()));
  try {
    switch (cmd) {
      case 'run': {
        const p = policyFor(dir);
        const prev = getRun(p.root);
        console.log(`${bold('zcashflight')} ${dim('·')} ${p.app.name} ${dim(`· ${p.scenarios.length} scenario${p.scenarios.length === 1 ? "" : "s"} · protecting ${p.protect.length} kinds of data`)}`);
        const run = await runPolicy(p, { scenario: flags.scenario as string, onProgress: progress() });
        if (tty) process.stdout.write('\r\x1b[K');
        printRun(run, prev);
        const cmp = prev ? compareRuns(prev, run) : undefined;
        if (flags.sarif) writeOut(run, 'sarif', String(flags.sarif));
        if (flags.report) writeOut(run, String(flags.report).endsWith('.html') ? 'html' : 'md', String(flags.report), prev);
        if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown(run, cmp) + '\n');
        return flags.ci ? gate(run, p.root, String(flags['fail-on'] ?? 'medium')) : run.status !== 'complete' ? 2 : 0;
      }
      case 'scan': {
        if (!pos.length) throw new PolicyError('usage: zcashflight scan <file.har | file.log>…');
        const f = findPolicy(dir);
        const p = f ? loadPolicy(f) : defaultPolicy(dir);
        const run = scanFiles(p, pos.map(x => resolve(x)));
        printRun(run);
        if (flags.sarif) writeOut(run, 'sarif', String(flags.sarif));
        return flags.ci ? gate(run, p.root, String(flags['fail-on'] ?? 'medium')) : 0;
      }
      case 'compare': {
        const root = (findPolicy(dir) ? policyFor(dir).root : dir);
        const runs = listRuns(root);
        const b = pos[1] ? getRun(root, +pos[1]) : pos[0] ? getRun(root, +pos[0] + 1) ?? runs[runs.length - 1] : runs[runs.length - 1];
        const a = pos[0] ? getRun(root, +pos[0]) : runs[runs.length - 2];
        if (!b) throw new PolicyError('no runs yet. Try `zcashflight run`.');
        const cmp = compareRuns(a, b);
        console.log(`\nrun ${cmp.from || '—'} → run ${cmp.to}: ${bold(cmp.verdict)}`);
        for (const f of cmp.closed) console.log(`  ${lime('closed')}  ${f.title}`);
        for (const f of cmp.open) console.log(`  ${yellow('open  ')}  ${f.title}`);
        for (const f of cmp.added) console.log(`  ${red('new   ')}  ${f.title}`);
        console.log('');
        return cmp.verdict === 'incomplete' ? 2 : cmp.verdict === 'regressed' ? 1 : 0;
      }
      case 'report': {
        const root = findPolicy(dir) ? policyFor(dir).root : dir;
        const runs = listRuns(root);
        const run = pos[0] ? getRun(root, +pos[0]) : runs[runs.length - 1];
        if (!run) throw new PolicyError('no runs yet. Try `zcashflight run`.');
        const prev = runs.filter(r => r.n < run.n).pop();
        writeOut(run, String(flags.format ?? (String(flags.out ?? '').endsWith('.html') ? 'html' : 'md')), flags.out as string | undefined, prev);
        return 0;
      }
      case 'list': {
        const root = findPolicy(dir) ? policyFor(dir).root : dir;
        for (const r of listRuns(root)) console.log(`  ${String(r.n).padStart(3)}  ${dim(r.finishedAt.slice(0, 16).replace('T', ' '))}  ${r.findings.length ? red(plural(r.findings.length, 'leak').padEnd(8)) : lime('clean   ')}  ${dim(r.status)}  ${dim(r.fingerprint)}`);
        return 0;
      }
      case 'ui': {
        const { startServer } = await import('../server/server.ts');
        const port = Number(flags.port ?? 4610);
        let url: string;
        try { url = await startServer({ dir, port }); } catch (e: any) {
          if (e?.code !== 'EADDRINUSE') throw e;
          console.error(red('error: ') + `port ${port} is already in use. A dashboard may already be open at http://127.0.0.1:${port}/; otherwise run \`zcashflight ui --port ${port + 1}\`.`);
          return 2;
        }
        console.log(`${bold('zcashflight')} dashboard on ${lime(url)} ${dim('(this machine only)')}`);
        if (!flags['no-open']) openBrowser(url);
        await new Promise(() => {});
        return 0;
      }
      case 'proxy': {
        const root = findPolicy(dir) ? policyFor(dir).root : dir;
        const p = findPolicy(dir) ? policyFor(dir) : defaultPolicy(dir);
        const out = join(stateDir(root), 'tmp', `proxy-${Date.now()}.ndjson`);
        const key = runKey();
        let n = 0;
        const px = await startProxy({ port: Number(flags.port ?? 4601), out, key, sinkhole: p.sinkhole, onEvent: e => { n++; if (tty) process.stdout.write(`\r${dim(`  ${n} requests · last ${e.method} ${e.host}`)}\x1b[K`); } });
        console.log(`${bold('zcashflight proxy')} on http://127.0.0.1:${px.port}\n${dim(`  HTTP_PROXY=http://127.0.0.1:${px.port} HTTPS_PROXY=http://127.0.0.1:${px.port} <your app>`)}\n${dim('  Ctrl+C to stop and evaluate.')}`);
        await new Promise<void>(r => process.once('SIGINT', () => r()));
        px.close();
        if (tty) process.stdout.write('\r\x1b[K');
        printRun(existsSync(out) ? scanFiles(p, [out]) : scanFiles(p, []));
        return 0;
      }
      case 'init': {
        const f = join(dir, 'zcashflight.yml');
        if (existsSync(f) && !flags.force) throw new PolicyError(`${f} already exists (use --force to overwrite)`);
        let start = 'node server.js', name = basename(resolve(dir));
        try { const pk = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')); if (pk.scripts?.start) start = 'npm start'; if (typeof pk.name === 'string') name = pk.name; } catch { /* no package.json */ }
        name = name.replace(/[^A-Za-z0-9._ -]/g, '').trim() || 'my-app';
        writeFileSync(f, INIT.replace('{{start}}', start).replace('{{name}}', name).replace('{{ua}}', synth.unifiedAddress('init')).replace('{{repo}}', REPO));
        console.log(`wrote ${f}\n${dim('  edit app.start, app.url, destinations: and scenarios:, then run `zcashflight run`')}`);
        return 0;
      }
      case 'synth': {
        const net = flags.mainnet ? 'main' : 'test';
        const seed = String(flags.seed ?? 'zcashflight');
        const rows: [string, string][] = [
          ['unified address', synth.unifiedAddress(seed, net)], ['sapling address', synth.saplingAddress(seed, net)],
          ['transparent address', synth.transparentAddress(seed, net)], ['TEX address', synth.texAddress(seed, net)],
          ['unified viewing key', synth.unifiedViewingKey(seed, net)], ['sapling spending key', synth.saplingSpendingKey(seed, net)],
          ['txid', synth.txid(seed)], ['seed phrase', synth.seedPhrase(seed)],
        ];
        if (flags.json) console.log(JSON.stringify(Object.fromEntries(rows), null, 2));
        else { console.log(dim('Synthetic values: valid encodings, random payloads, no keys exist for them. Never send funds to them.\n')); for (const [k, v] of rows) console.log(`${dim(k.padEnd(22))} ${v}`); }
        return 0;
      }
      case 'version': case '--version': case '-v': console.log(VERSION); return 0;
      default: console.log(HELP); return cmd === 'help' || cmd === '--help' || cmd === '-h' ? 0 : 2;
    }
  } catch (e: any) {
    if (e instanceof PolicyError || e?.name === 'YamlError') { console.error(red('error: ') + e.message); return 2; }
    throw e;
  }
}

function openBrowser(url: string) {
  import('node:child_process').then(({ spawn }) => {
    const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
    try { spawn(cmd[0] as string, cmd[1] as string[], { stdio: 'ignore', detached: true }).unref(); } catch { /* print only */ }
  });
}

const INIT = `# ZcashFlight policy. Reference: {{repo}}/blob/main/docs/reference/policy.md
version: 1
network: testnet

app:
  name: {{name}}
  start: {{start}}          # how to start the app; ZcashFlight starts and stops it
  url: http://127.0.0.1:3000
  ready: /                  # polled until it answers
  # proxy: true             # also route HTTP(S)_PROXY through ZcashFlight (for non-Node apps)

# What must never leave the app. Viewing keys, spending keys and seed phrases are always protected.
protect:
  - addresses
  - amounts
  - memos
  - transaction IDs
  - viewing keys
  - spending keys
  - seed phrases

# Approved destinations, and which protected data each genuinely needs. Anything else is reported.
destinations:
  - host: 127.0.0.1:18232
    purpose: Wallet RPC (zallet / zcashd)
    allow: [addresses, amounts, memos, transaction IDs]

logs: []                    # log files to inspect, e.g. [logs/app.log]

transactions:
  shielded_only: true

sinkhole: true              # answer third-party requests locally during tests

scenarios:
  - name: smoke
    steps:
      - request: GET /
  # - name: checkout
  #   steps:
  #     - request: POST /api/checkout
  #       json: { address: {{ua}}, amount: 0.1 }
  #       save: { order: id }
  #     - request: GET /api/orders/{{order}}

not_tested:
  - Network metadata such as IP address and request timing at the transport layer
`;
