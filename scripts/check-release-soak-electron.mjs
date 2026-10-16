#!/usr/bin/env node

import { fileURLToPath } from 'node:url';

import { runReleaseSoakCli } from './lib/releaseSoakCli.mjs';
import os from 'node:os';

const soakPriority = process.env.SF_SOAK_PRIORITY ?? 'low';
if (soakPriority === 'normal') {
  os.setPriority(os.constants.priority.PRIORITY_NORMAL);
} else if (soakPriority === 'low') {
  try { os.setPriority(os.constants.priority.PRIORITY_LOW); } catch { /* best effort: background compute yields to the game */ }
} else {
  throw new Error('SF_SOAK_PRIORITY must be low or normal');
}

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const result = await runReleaseSoakCli({
  runtime: 'electron',
  root: ROOT,
  argv: process.argv.slice(2),
});
process.exitCode = result.exitCode;
