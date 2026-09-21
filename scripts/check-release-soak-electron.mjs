#!/usr/bin/env node

import { fileURLToPath } from 'node:url';

import { runReleaseSoakCli } from './lib/releaseSoakCli.mjs';
import os from 'node:os';

try { os.setPriority(os.constants.priority.PRIORITY_LOW); } catch { /* best effort: background compute yields to the game */ }

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const result = await runReleaseSoakCli({
  runtime: 'electron',
  root: ROOT,
  argv: process.argv.slice(2),
});
process.exitCode = result.exitCode;
