// SF-CLOUD-13 campaign runner. Families, the 500-trace search, and the four
// honest strategies share one report. Production economy files are not edited.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { probeFamilies } from './families.mjs';
import { runSearch } from './search.mjs';
import { runStrategies } from './strategies.mjs';
import { BASE_COMMIT, REVIEWED_HEAD, restoreFeatureMaps } from './runtime.mjs';
import { admitFamilyEvidence, critique, playerVisibleSummary } from './reportEvidence.mjs';

export const CAMPAIGN_ID = 'SF-CLOUD-13';

export function runCampaign(options = {}) {
  const seed = (Number(options.seed) >>> 0) || 1845;
  const sequences = Math.max(1, Math.floor(Number(options.sequences) || 500));
  const receiptPath = options.receiptPath || null;
  try {
    const families = probeFamilies(seed).map(admitFamilyEvidence);
    const search = runSearch({
      seed: seed + 11,
      sequences,
      receiptPath: receiptPath ? receiptPath.replace(/\.json$/i, '.search.json') : null,
    });
    const strategies = runStrategies(seed + 23);
    const critiqueReport = critique(families, search, strategies);
    const exploits = families.filter((family) => family.status === 'exploit').map((family) => family.id);
    const clean = families.filter((family) => family.status === 'clean').map((family) => family.id);
    const testedNotBroken = families.filter((family) => family.status === 'tested-not-broken').map((family) => family.id);
    const unavailable = families.filter((family) => family.status === 'unavailable').map((family) => family.id);
    const report = {
      campaign: CAMPAIGN_ID,
      seed,
      sequences,
      status: critiqueReport.holds ? 'integration-ready' : 'partial',
      playerVisible: playerVisibleSummary(critiqueReport.confirmed),
      evidenceScope: 'Writer settlements and observed scenarios, not complete player routes or exhaustive economy safety.',
      exploits,
      clean,
      testedNotBroken,
      unavailable,
      families: families.map((family) => ({
        id: family.id,
        status: family.status,
        reportedStatus: family.reportedStatus || family.status,
        evidence: family.evidence || null,
        summary: family.summary,
        traces: family.traces,
        controls: family.controls,
      })),
      baseCommit: BASE_COMMIT,
      reviewedHead: REVIEWED_HEAD,
      publishHead: null,
      publishHeadNote: 'Production owners are integrated; this is a fresh runtime observation.',
      commands: [
        'node --test tools/economic-redteam/test.mjs tools/economic-redteam/evidence.test.mjs',
        'node tools/economic-redteam/cli.mjs --seed 1845 --sequences 500',
      ],
      testResult: 'not_run_by_cli',
      search: {
        seed: search.seed,
        sequences: search.sequences,
        sequencesCompleted: search.sequencesCompleted,
        coverage: search.coverage,
        commandCoverage: search.commandCoverage,
        findingCount: search.findings.length,
        mutationCount: search.mutations.length,
        findings: search.findings.slice(0, 20),
        mutations: search.mutations.slice(0, 8),
        heldOutSeeds: search.heldOutSeeds,
        heldOutRuns: search.heldOutRuns,
        reset: search.reset,
        resumable: search.resumable,
        stopped: search.stopped,
        walletWrites: search.walletWrites,
      },
      strategies,
      critique: critiqueReport,
      integration: {
        productionEdits: false,
        withheld: ['src/systems/economy.js', 'src/systems/cargo.js'],
        patch: 'tools/economic-redteam/FIX.patch',
        adapter: 'tools/economic-redteam/ADAPTER.md',
      },
    };
    if (options.outPath) {
      mkdirSync(dirname(options.outPath), { recursive: true });
      writeFileSync(options.outPath, `${JSON.stringify(report, null, 2)}\n`);
    }
    return report;
  } finally {
    restoreFeatureMaps();
  }
}
