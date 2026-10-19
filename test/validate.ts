// npm run validate — the PRD's success criteria, measured:
//   every seeded exposure detected · no findings on look-alikes · no raw value survives masking.

import { CASES, runCase } from './cases.ts';

const out = CASES.map(runCase);
const pos = out.filter(o => o.c.expect), neg = out.filter(o => !o.c.expect);
const w = Math.max(...CASES.map(c => c.name.length));
for (const o of out) {
  const want = o.c.expect ? `${o.c.expect.rule}${o.c.expect.severity ? '/' + o.c.expect.severity : ''}` : 'none';
  const got = o.findings.map(f => `${f.rule}/${f.severity}`).join(',') || 'none';
  console.log(`${o.pass && !o.leakedRaw ? 'PASS' : 'FAIL'}  ${o.c.name.padEnd(w)}  expect ${want.padEnd(12)} got ${got}${o.leakedRaw ? '  RAW VALUE LEAKED' : ''}`);
}
const det = pos.filter(o => o.pass).length, fp = neg.filter(o => !o.pass).length, raw = out.filter(o => o.leakedRaw).length;
console.log(`\ndetected ${det}/${pos.length} seeded exposures · ${fp}/${neg.length} false positives · ${raw} raw values stored`);
process.exitCode = det === pos.length && fp === 0 && raw === 0 ? 0 : 1;
