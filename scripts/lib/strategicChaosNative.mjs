// Child-process adapter for the existing production B12 instrument. No injected
// systems, tapes, options, fabricated receipts, or replacement simulation.
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { B12_POLICY, auditB12Report } from './strategicChaosEvidence.mjs';

export async function runNativeB12(root, destination) {
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const sourceCommit = git('rev-parse', 'HEAD');
  const sourceTree = git('rev-parse', 'HEAD^{tree}');
  const status = () => git('status', '--porcelain', '--untracked-files=normal', '--', '.', ':(exclude).devshots/strategic-chaos');
  const dirty = status();
  // Dirty trees still produce useful diagnostics, but are never mislabeled as exact-commit evidence.
  const { pathToFileURL } = await import('node:url');
  const native = await import(pathToFileURL(resolve(root, 'src/testing/lab/proofSixtySeconds.js')).href);
  const policy = {
    scenarioId: native.PROOF_SCENARIO_ID, seeds: [...native.PROOF_SEEDS],
    required: native.PROOF_REQUIRED_BEATS, hardCapS: native.PROOF_HARD_CAP_S,
    beats: native.SIXTY_SECOND_BEATS.map(beat => beat.id),
  };
  if (JSON.stringify(policy) !== JSON.stringify(B12_POLICY)) {
    throw new Error('B12 owner contract changed. Reconcile the adapter with the owner; do not silently lower the gate.');
  }
  const suite = await native.runProofSixtySecondsSuite();
  const audit = auditB12Report(suite);
  const headUnchanged = git('rev-parse', 'HEAD') === sourceCommit;
  const cleanAtEnd = !status();
  const unchanged = !dirty && cleanAtEnd && headUnchanged ? true : null;
  const report = {
    schema: 'spaceface.strategicChaosNativeRun.v1',
    source: { commit: sourceCommit, tree: sourceTree, dirty: !!dirty, cleanAtEnd, headUnchanged, unchanged, exactCommitEvidence: unchanged === true },
    execution: 'existing proofSixtySeconds.runProofSixtySecondsSuite; default production-owner setup and tape',
    acceptanceGranted: false,
    setupLimits: 'The existing Ceres proof fixture is not a natural new-player encounter or rendered player-truth run.',
    audit, suite,
  };
  if (!headUnchanged || (!dirty && !cleanAtEnd)) {
    audit.verdict = 'INCOMPLETE';
    audit.errors.push({ path: 'source', message: 'Source changed during execution.' });
  }
  writeFileSync(destination, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  if (audit.verdict === 'INCOMPLETE') return 2;
  if (dirty) return 4;
  return audit.verdict === 'PASS' ? 0 : 1;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [root, destination] = process.argv.slice(2);
  if (!root || !destination) { console.error('Internal adapter requires repository root and output file.'); process.exitCode = 2; }
  else runNativeB12(root, destination).then(code => { process.exitCode = code; }).catch(error => {
    console.error(`B12 execution blocked: ${error.message}`); process.exitCode = 2;
  });
}
