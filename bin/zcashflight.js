#!/usr/bin/env node
// Runs the compiled build when installed from npm (dist/), or the TypeScript sources directly in a checkout.
// Node strips TypeScript types natively from 22.18 / 23.6, so a checkout needs no build step.
import { existsSync } from 'node:fs';

const dist = new URL('../dist/cli/main.js', import.meta.url);
const { main } = await import(existsSync(dist) ? dist.href : new URL('../src/cli/main.ts', import.meta.url).href);
process.exitCode = await main();
