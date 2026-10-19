// Compile src/**/*.ts to dist/**/*.js for npm installs (Node will not strip types inside node_modules).
// Uses Node's own type stripper, so there is still no compiler dependency.

import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const src = join(root, 'src'), out = join(root, 'dist');
rmSync(out, { recursive: true, force: true });
let n = 0;
(function walk(d: string) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    if (!f.endsWith('.ts')) continue;
    const js = stripTypeScriptTypes(readFileSync(p, 'utf8'), { mode: 'strip' })
      .replace(/(from\s+['"]\.{1,2}\/[^'"]+)\.ts(['"])/g, '$1.js$2')
      .replace(/(import\(\s*['"]\.{1,2}\/[^'"]+)\.ts(['"])/g, '$1.js$2')
      .replace(/(new URL\(\s*['"]\.{1,2}\/[^'"]+)\.ts(['"])/g, '$1.js$2');
    const target = join(out, relative(src, p)).replace(/\.ts$/, '.js');
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, js);
    n++;
  }
})(src);
console.log(`built ${n} files into dist/`);
