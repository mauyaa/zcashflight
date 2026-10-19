// End to end: run the real ZecShop app under ZcashFlight, fix it, and verify.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { loadPolicy } from '../src/engine/policy.ts';
import { runPolicy, scanFiles } from '../src/engine/runner.ts';
import { compareRuns } from '../src/engine/store.ts';
import { sarif } from '../src/engine/report.ts';

const SRC = fileURLToPath(new URL('../examples/zecshop', import.meta.url));
const work = mkdtempSync(join(tmpdir(), 'zf-zecshop-'));
cpSync(SRC, work, { recursive: true, filter: s => !/[\\/](\.zcashflight|logs|data)([\\/]|$)/.test(s) });
const fixes = (m: string) => spawnSync(process.execPath, [join(work, 'scripts', 'fixes.ts'), m], { cwd: work });
const policy = () => loadPolicy(join(work, 'zcashflight.yml'));
// raw synthetic values ZecShop handles; none may appear in anything ZcashFlight stores
const RAW = ['utest1vnnewz8teentaw5l4z4925nun89', 'tmUSebGk2Dd7sxQUKFauzR6V6zc51AgWzhs', 'b78cb1fe9f7191acefa6f221fe535421972594ff507a54640c3217e4e5a61ab8', 'paid by Amina', 'utest1dh7ukkzyx28wg7kny2qddsnu5yh'];

test('ZecShop: finds the five seeded leaks, fixes close them, nothing raw is stored', { timeout: 120000 }, async () => {
  fixes('reset');
  const before = await runPolicy(policy());
  assert.equal(before.status, 'complete');
  assert.deepEqual(before.findings.map(f => `${f.rule} ${f.title}`).sort(), [
    'A Address and amount sent to analytics', 'A Memo sent to error monitoring', 'B Transaction ID written to a log',
    'C Payment sent to a transparent address', 'D Checkout activity revealed to a price API',
  ]);
  const where = Object.fromEntries(before.findings.map(f => [f.rule + f.destination, `${f.at?.file}:${f.at?.line}`]));
  assert.equal(where['Aanalytics.example.com'], 'server.ts:56');
  assert.equal(where['Blogs/server.log'], 'server/broadcast.ts:9');
  assert.match(where['C127.0.0.1:18232'], /^lib\/refund\.ts:/);
  assert.equal(before.stats.sinkholed, before.stats.external, 'every third-party request was kept off the network');

  const again = await runPolicy(policy());
  assert.equal(again.fingerprint, before.fingerprint, 'repeat runs are consistent');

  fixes('apply');
  const after = await runPolicy(policy());
  assert.equal(after.findings.length, 0);
  const cmp = compareRuns(before, after);
  assert.equal(cmp.verdict, 'clean');
  assert.equal(cmp.closed.length, 5);

  const stored = readdirSync(join(work, '.zcashflight', 'runs')).map(f => readFileSync(join(work, '.zcashflight', 'runs', f), 'utf8')).join('');
  for (const r of RAW) assert.ok(!stored.includes(r), `raw value stored: ${r}`);
  assert.equal(readdirSync(join(work, '.zcashflight', 'tmp')).length, 0, 'capture files are deleted after each run');
  assert.equal((sarif(before) as any).runs[0].results.length, 5);
  fixes('reset');
});

test('offline scan of a HAR export uses the same rules', () => {
  const har = join(work, 'capture.har');
  const ua = 'utest1vnnewz8teentaw5l4z4925nun89mlq32zwvu9hel4ym5zcqx8u4xnrpdu2349jn0w7ydwpl34lnfp7092fzlu3vjm5yp7fj8rctyhknk9rw0ssqc2rez4n62slnguv0quwgthu0t65kd844pug7y666c4vqj8p6u6dh2plmkck2sdkw2s8';
  spawnSync(process.execPath, ['-e', `require('fs').writeFileSync(${JSON.stringify(har)}, JSON.stringify({log:{entries:[{startedDateTime:new Date().toISOString(),request:{method:'POST',url:'https://www.google-analytics.com/collect',headers:[],postData:{mimeType:'application/json',text:JSON.stringify({wallet:${JSON.stringify(ua)}})}}}]}}))`]);
  const run = scanFiles(policy(), [har]);
  assert.equal(run.findings[0]?.title, 'Address sent to analytics');
  assert.ok(!JSON.stringify(run).includes(ua.slice(12, 60)));
});

test.after(() => rmSync(work, { recursive: true, force: true }));
