// The whole loop in one command, for a first look or a screen recording:
// scan ZecShop → five leaks → apply the real code fixes → scan again → all closed → restore the sample.
//   npm run demo

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const shop = join(root, 'examples', 'zecshop');
const cli = (...a: string[]) => spawnSync(process.execPath, [join(root, 'bin', 'zcashflight.js'), ...a, '--dir', shop], { stdio: 'inherit' }).status;
const fixes = (m: string) => spawnSync(process.execPath, [join(shop, 'scripts', 'fixes.ts'), m], { stdio: 'inherit' });
const say = (s: string) => console.log(`\n\x1b[1m── ${s}\x1b[0m\n`);

fixes('reset');
say('1. Scan ZecShop as shipped');
const first = cli('run', '--ci');
say('2. Apply the fixes (real code changes in lib/ and server/)');
fixes('apply');
say('3. Scan again: the same scenarios, the same rules');
const second = cli('run', '--ci', '--report', join(shop, '.zcashflight', 'report.html'));
say('4. Compare');
cli('compare');
fixes('reset');
console.log(`\nCI gate: before fixes exit ${first} (fails the build), after fixes exit ${second} (passes).`);
console.log(`Report: ${join(shop, '.zcashflight', 'report.html')}\nDashboard: npm run ui`);
process.exitCode = first === 1 && second === 0 ? 0 : 1;
