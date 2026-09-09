import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { formatEvidenceIssue } from '../src/contracts/evidenceSchemas.js';
import { scanEvidenceTree } from './lib/alphaEvidenceChecker.mjs';

function usage(message) {
  const prefix = message ? `ERROR ${message}\n` : '';
  return `${prefix}Usage: node scripts/check-alpha-evidence.mjs [--self-test | --root <directory>]`;
}

function parseArgs(argv) {
  if (argv.includes('--self-test')) {
    if (argv.length !== 1) throw new Error('--self-test cannot be combined with other arguments');
    return { selfTest: true, scanRoot: null };
  }
  if (argv.length === 0) return { selfTest: false, scanRoot: '.devshots/alpha' };
  if (argv.length === 2 && argv[0] === '--root' && argv[1]) {
    return { selfTest: false, scanRoot: argv[1] };
  }
  throw new Error('expected no arguments, --self-test, or --root <directory>');
}

export async function runAlphaEvidenceCli(argv = process.argv.slice(2), options = {}) {
  const stdout = options.stdout || console.log;
  const stderr = options.stderr || console.error;
  const repoRoot = path.resolve(options.repoRoot || process.cwd());

  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (error) {
    stderr(usage(error.message));
    return 2;
  }

  if (parsed.selfTest) {
    const { runAlphaEvidenceContractTests } = await import('../test/alpha-evidence-checker.test.mjs');
    await runAlphaEvidenceContractTests();
    return 0;
  }

  const result = await scanEvidenceTree({
    repoRoot,
    scanRoot: path.resolve(repoRoot, parsed.scanRoot),
  });
  if (result.ok) {
    stdout(`PASS alpha evidence scan: ${result.recordCount} record(s) under ${result.root}`);
    return 0;
  }

  stderr(`FAIL alpha evidence scan: ${result.issueCount} issue(s) across ${result.recordCount} record(s)`);
  result.issues.forEach((entry) => stderr(formatEvidenceIssue(entry)));
  return 1;
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
if (isMain) {
  process.exitCode = await runAlphaEvidenceCli();
}
