// Proxy mode with a real non-Node app (Python, standard library only): plain HTTP bodies are inspected in full;
// an HTTPS request is an encrypted CONNECT tunnel, so it is reported as uninspected with its host, never as clean.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { readdirSync, readFileSync, rmSync } from 'node:fs';
import { loadPolicy } from '../src/engine/policy.ts';
import { runPolicy } from '../src/engine/runner.ts';
import { synth } from '../src/zcash/synth.ts';

const DIR = join(import.meta.dirname, 'fixtures', 'proxy-python');
const python = ['python3', 'python', 'py'].find(p => spawnSync(p, ['-c', 'import sys; sys.exit(0 if sys.version_info >= (3, 8) else 1)']).status === 0);

test('proxy mode: a Python app’s plain HTTP leak is found; its HTTPS request is reported as uninspected', { skip: python ? false : 'no Python 3 interpreter on this machine', timeout: 60000 }, async () => {
  rmSync(join(DIR, '.zcashflight'), { recursive: true, force: true });
  const policy = loadPolicy(join(DIR, 'zcashflight.yml'));
  policy.app.start = `${python} app.py`;
  const run = await runPolicy(policy);
  assert.equal(run.status, 'complete', run.error);
  assert.equal(run.findings.length, 1);
  const f = run.findings[0];
  assert.equal(f.scenario, 'plain-http');
  assert.ok(f.evidence.some(e => e.path === 'body.address' && e.proof === 'checksum'));
  assert.equal(f.at, undefined, 'a proxy capture has no stack, so no code location is claimed');
  assert.deepEqual(run.coverage.uninspected?.map(u => [u.what, u.destination, u.scenarios.join()]), [['HTTPS request (CONNECT tunnel)', 'analytics.example.com', 'https']]);
  assert.ok(run.coverage.tested.some(t => t.includes('local proxy (2)')));
  const ua = synth.unifiedAddress('proxy-python');
  const stored = readdirSync(join(DIR, '.zcashflight', 'runs')).map(n => readFileSync(join(DIR, '.zcashflight', 'runs', n), 'utf8')).join('');
  assert.ok(!stored.includes(ua), 'raw address stored');
});
