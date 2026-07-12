#!/usr/bin/env node

import { fileURLToPath } from 'node:url';

import { runReleaseSoakCli } from './lib/releaseSoakCli.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const result = await runReleaseSoakCli({
  runtime: 'electron',
  root: ROOT,
  argv: process.argv.slice(2),
});
process.exitCode = result.exitCode;
