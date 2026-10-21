#!/usr/bin/env node
// Installed from npm, the package ships the compiled build (dist/) and no sources.
// In a checkout, the TypeScript sources run directly (Node strips types natively from 22.18 / 23.6), so a stale
// dist/ from an earlier build is never picked up by mistake. ZCASHFLIGHT_DIST=1 forces the build, to test it.
import { existsSync } from 'node:fs';

const src = new URL('../src/cli/main.ts', import.meta.url);
const dist = new URL('../dist/cli/main.js', import.meta.url);
const useDist = process.env.ZCASHFLIGHT_DIST === '1' || !existsSync(src);
const { main } = await import((useDist ? dist : src).href);
process.exitCode = await main();
