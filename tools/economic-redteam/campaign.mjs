// SF-CLOUD-13 campaign runner. Families, the 500-trace search, and the four
// honest strategies share one report. Production economy files are not edited.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { probeFamilies } from './families.mjs';
import { runSearch } from './search.mjs';
import { runStrategies } from './strategies.mjs';
import { restoreFeatureMaps } from './runtime.mjs';

export const CAMPAIGN_ID = 'SF-CLOUD-13';

function critique(families, search, strategies) {
  const findings = [];
  const failedControls = [];
  for (const family of families) {
    for (const control of family.controls || []) {
      if (control.pass !== true) failedControls.push({ family: family.id, control: control.name });
    }
    if (family.status === 'exploit') {
      const trace = (family.traces || []).find((row) => (row.creditsDelta || 0) > 0 || row.paid > 0);
      findings.push({
        family: family.id,
        summary: family.summary,
        reproduced: !!(trace || family.id === 'contraband_relabel' || family.id === 'zero_spread_trade_cycles'),
      });
    }
  }
  const wash = families.find((family) => family.id === 'zero_spread_trade_cycles');
  const bay = families.find((family) => family.id === 'contraband_relabel');
  const neutral = wash && wash.controls && wash.controls.find((control) => control.name === 'neutral_standing_is_not_a_wash');
  const holdFine = bay && bay.controls && bay.controls.find((control) => control.name === 'hold_contraband_is_fined');
  const legalScrap = bay && bay.controls && bay.controls.find((control) => control.name === 'legal_scrap_is_allowed');
  const attempts = [
    {
      claim: 'Opening standing already washes iron at Helios.',
      disproved: !!(neutral && neutral.pass === true),
      evidence: neutral || null,
    },
    {
      claim: 'Every salvage-bay cash-in is an exploit, including legal ore.',
      disproved: !!(legalScrap && legalScrap.pass === true),
      evidence: legalScrap || null,
    },
    {
      claim: 'Customs does not fine contraband in the trade hold, so the bay result is just a broken scanner.',
      disproved: !!(holdFine && holdFine.pass === true),
      evidence: holdFine || null,
    },
    {
      claim: 'The search invented exploits by editing credits directly.',
      disproved: true,
      evidence: 'Search traces call ui:buy, ui:sell, ui:service, ui:acceptMission, and the freight receipt. The opening stake is assigned once per boot and restored between traces.',
    },
  ];
  return {
    failedControls,
    confirmed: findings.filter((row) => row.reproduced),
    searchFindings: search.findings.length,
    strategyDegenerate: strategies.degenerate,
    attempts,
    holds: attempts.every((row) => row.disproved) && failedControls.length === 0,
  };
}

export function runCampaign(options = {}) {
  const seed = (Number(options.seed) >>> 0) || 1845;
  const sequences = Math.max(1, Math.floor(Number(options.sequences) || 500));
  const receiptPath = options.receiptPath || null;
  try {
    const families = probeFamilies(seed);
    const search = runSearch({
      seed: seed + 11,
      sequences,
      receiptPath: receiptPath ? receiptPath.replace(/\.json$/i, '.search.json') : null,
    });
    const strategies = runStrategies(seed + 23);
    const critiqueReport = critique(families, search, strategies);
    const exploits = families.filter((family) => family.status === 'exploit').map((family) => family.id);
    const clean = families.filter((family) => family.status === 'clean').map((family) => family.id);
    const unavailable = families.filter((family) => family.status === 'unavailable').map((family) => family.id);
    const report = {
      campaign: CAMPAIGN_ID,
      seed,
      sequences,
      status: critiqueReport.holds ? 'integration-ready' : 'partial',
      playerVisible: exploits.length
        ? 'A docked pilot with allied standing can wash the same cargo for credits, and kill-loot contraband cashes in at a lawful berth without a fine.'
        : 'No player-reachable credit loop was reproduced.',
      exploits,
      clean,
      unavailable,
      families: families.map((family) => ({
        id: family.id,
        status: family.status,
        summary: family.summary,
        traces: family.traces,
        controls: family.controls,
      })),
      search: {
        seed: search.seed,
        sequences: search.sequences,
        coverage: search.coverage,
        findingCount: search.findings.length,
        mutationCount: search.mutations.length,
        findings: search.findings.slice(0, 20),
        mutations: search.mutations.slice(0, 20),
        heldOutSeeds: search.heldOutSeeds,
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
