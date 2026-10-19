// A plain file logger, like most apps have.

import { appendFileSync, mkdirSync } from 'node:fs';

mkdirSync('logs', { recursive: true });
const write = (level: string) => (msg: string) => appendFileSync('logs/server.log', `${new Date().toISOString()} ${level} ${msg}\n`);
export const log = { debug: write('DEBUG'), info: write('INFO'), error: write('ERROR') };
