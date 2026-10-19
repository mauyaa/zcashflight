// Switch ZecShop between its seeded (leaky) code and its fixed code.
//   node scripts/fixes.ts apply   copy fixes/  over lib/ and server/
//   node scripts/fixes.ts reset   copy seeded/ over lib/ and server/
// The diff between seeded/ and fixes/ is exactly what a developer would change after reading the findings.

import { cpSync, existsSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(dirname(fileURLToPath(import.meta.url)));
const mode = process.argv[2];
if (mode !== 'apply' && mode !== 'reset') { console.error('usage: fixes.ts apply|reset'); process.exit(2); }
const from = join(here, mode === 'apply' ? 'fixes' : 'seeded');

const changed: string[] = [];
(function copy(d: string) {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) { copy(p); continue; }
    const rel = p.slice(from.length + 1);
    mkdirSync(dirname(join(here, rel)), { recursive: true });
    cpSync(p, join(here, rel));
    changed.push(rel.replace(/\\/g, '/'));
  }
})(from);

mkdirSync(join(here, 'data'), { recursive: true });
if (!existsSync(join(here, 'data', 'rates.json'))) writeFileSync(join(here, 'data', 'rates.json'), JSON.stringify({ zec_usd: 41.2, refreshed: 'by scheduled job' }, null, 2) + '\n');
console.log(`${mode === 'apply' ? 'Applied fixes to' : 'Restored seeded leaks in'}: ${changed.join(', ')}`);
