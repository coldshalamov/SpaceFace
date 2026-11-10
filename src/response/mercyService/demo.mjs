// Executable Mercy Service receipt. Fixed seed, one 60 Hz witness run.
// node src/response/mercyService/demo.mjs

import { MERCY_DT, boardIncidents, report, runIncident, validateCatalog } from './index.js';

const errors = validateCatalog();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

const started = performance.now();
const out = runIncident({ seed: 80611, id: 'ms_pod_traffic', policy: 'tether-berth', ticks: 1800 });
const wallMs = performance.now() - started;
const card = report(out.rt);
const grant = card.intents.find((row) => row.type === 'economy:grantCredits');

const receipt = {
  campaign: 'SF-CLOUD-08',
  incident: card.id,
  policy: card.resolvedOrder,
  phase: card.phase,
  outcome: card.outcome,
  deliveredTo: card.deliveredTo,
  simTime: Number(card.simTime.toFixed(3)),
  ticks: card.tick,
  dt: MERCY_DT,
  survivorsCredit: grant ? grant.amount : 0,
  peakTension: Number(card.peakTension.toFixed(2)),
  arrest: Number(card.arrest.toFixed(2)),
  trace: card.trace,
  bodySteps: card.stats.bodySteps,
  maxBodiesPerTick: card.stats.maxBodiesThisTick,
  wallMs: Number(wallMs.toFixed(2)),
  board: boardIncidents().length,
  catalogErrors: errors.length,
};

console.log(JSON.stringify(receipt, null, 2));
if (card.phase !== 'aftermath' || !(grant && grant.amount > 0)) process.exit(1);
