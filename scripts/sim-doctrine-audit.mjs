import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CombatDoctrineRuntime } from '../src/ai/combatDoctrine.js';
import { normalizeFactionBehaviorProfile } from '../src/ai/factionBehavior.js';
import { SquadCommander } from '../src/ai/squad.js';
import { FACTION_DOCTRINES, sampleFactionBehavior } from '../src/data/factionDoctrines.js';
import { FACTION_KITS } from '../src/data/factions/index.js';

const EXPECTED_FACTION_COUNT = 14;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EVIDENCE_PATH = resolve(ROOT, '.devshots', 'depth-program-d1-doctrine-matrix.json');
const SEED = 0xd1_47a;
const SAMPLE_COUNT = 64;
const RANGE_SCALE = 600;
const FORMATIONS = Object.freeze(['line', 'ring', 'wedge']);
const TOLERANCE = Object.freeze({
  pursuit: 0.04,
  preferredRange: 0.04,
  liveFormation: 0.05,
  retreat: 0.04,
});

const kitIds = FACTION_KITS.map((kit) => kit.id);
assert.equal(kitIds.length, EXPECTED_FACTION_COUNT,
  `doctrine audit canon changed: expected ${EXPECTED_FACTION_COUNT}, found ${kitIds.length}`);
assert.deepEqual(Object.keys(FACTION_DOCTRINES).sort(), [...kitIds].sort(),
  'every and only registered FACTION_KITS must own a doctrine profile');

const summaries = FACTION_KITS.map((kit) => summarize(kit));
const matrix = summaries.map((left) => summaries.map((right) => (
  left.factionId === right.factionId ? 0 : chebyshevDistance(axisDistances(left, right))
)));
const collisions = [];
let closestPair = null;
for (let leftIndex = 0; leftIndex < summaries.length; leftIndex++) {
  for (let rightIndex = leftIndex + 1; rightIndex < summaries.length; rightIndex++) {
    const axes = axisDistances(summaries[leftIndex], summaries[rightIndex]);
    const normalizedDistance = chebyshevDistance(axes);
    const pair = {
      left: summaries[leftIndex].factionId,
      right: summaries[rightIndex].factionId,
      normalizedDistance,
      axes,
    };
    if (!closestPair || pair.normalizedDistance < closestPair.normalizedDistance) closestPair = pair;
    if (Object.entries(TOLERANCE).every(([axis, tolerance]) => axes[axis] <= tolerance)) {
      collisions.push(pair);
    }
  }
}
const pairCount = summaries.length * (summaries.length - 1) / 2;
const report = {
  schema: 'spaceface.depth-program-d1.doctrine-matrix.v1',
  seed: SEED,
  sampleCount: SAMPLE_COUNT,
  perAxisTolerances: TOLERANCE,
  summaries,
  matrix: matrix.map((distances, index) => ({
    factionId: summaries[index].factionId,
    distances: distances.map((value) => rounded(value)),
  })),
  pairCount,
  closestPair: {
    ...closestPair,
    normalizedDistance: rounded(closestPair.normalizedDistance),
    axes: Object.fromEntries(Object.entries(closestPair.axes).map(([axis, value]) => [axis, rounded(value)])),
  },
  collisions,
};
mkdirSync(dirname(EVIDENCE_PATH), { recursive: true });
writeFileSync(EVIDENCE_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

console.log(`Doctrine distinctness audit: ${summaries.length} factions x ${SAMPLE_COUNT} deterministic samples`);
console.table(summaries.map((row) => ({
  faction: row.short,
  pursuit: fixed(row.pursuit, 3),
  preferredRange: fixed(row.preferredRange, 1),
  formation: formationLabel(row.formations),
  retreat: fixed(row.retreat, 3),
  squadFormation: row.consumer.squadFormation,
  squadRetreat: row.consumer.squadRetreat,
  combatRange: fixed(row.consumer.combatRange, 1),
})));
printDistanceMatrix(summaries, matrix);
assert.deepEqual(collisions, [], `doctrine pairs within all axis tolerances: ${JSON.stringify(collisions)}`);
console.log(`Doctrine distinctness OK: ${pairCount} pairs exceed tolerance on at least one axis.`);
console.log(`Durable evidence: ${EVIDENCE_PATH}`);

function summarize(kit) {
  const first = sampleFactionBehavior(kit.id, SEED, SAMPLE_COUNT);
  const replay = sampleFactionBehavior(kit.id, SEED, SAMPLE_COUNT);
  assert.equal(first.length, SAMPLE_COUNT, `${kit.id} must define a complete sampled doctrine`);
  assert.deepEqual(replay, first, `${kit.id} doctrine sampling must replay exactly`);
  const profiles = first.map((row) => normalizeFactionBehaviorProfile(row));
  assert.equal(profiles.every(Boolean), true, `${kit.id} produced an incomplete normalized profile`);
  const formations = Object.fromEntries(FORMATIONS.map((formation) => [formation, 0]));
  for (const profile of profiles) formations[profile.liveFormation]++;
  const consumer = exerciseProductionConsumers(kit.id, profiles[0]);
  return Object.freeze({
    factionId: kit.id,
    short: String(kit.short || kit.id.replace(/^faction_/, '')).slice(0, 11),
    pursuit: mean(profiles.map((profile) => profile.pursuitCommitment)),
    preferredRange: mean(profiles.map((profile) => profile.preferredRange)),
    formations: Object.freeze(Object.fromEntries(FORMATIONS.map((formation) => [
      formation,
      formations[formation] / profiles.length,
    ]))),
    retreat: mean(profiles.map((profile) => profile.retreatHullFraction)),
    consumer,
  });
}

function exerciseProductionConsumers(factionId, profile) {
  const entityId = 10;
  const squadId = `doctrine_audit_${factionId}`;
  const commander = new SquadCommander({ seed: SEED });
  commander.registerSquad({
    id: squadId,
    faction: factionId,
    doctrine: 'balanced',
    formation: 'line',
    factionBehavior: profile,
    members: [{
      id: entityId,
      capabilities: ['drive', 'weapon', 'sensor', 'ranged', 'disable'],
      combatDoctrineId: profile.combatDoctrineId,
    }],
  });
  const highHull = perception(entityId, profile, 0.99);
  const ready = commander.update(squadId, 100, new Map([[entityId, highHull]]));
  const squadFormation = ready.directives.get(entityId).formation.kind;
  assert.equal(squadFormation, profile.liveFormation, `${factionId} formation did not reach SquadCommander`);
  const lowHull = perception(entityId, profile, Math.max(0, profile.retreatHullFraction - 0.01));
  const retreat = commander.update(squadId, 101, new Map([[entityId, lowHull]]));
  assert.equal(retreat.tactic, 'fighting_retreat', `${factionId} retreat did not reach SquadCommander`);

  const combat = new CombatDoctrineRuntime({ seed: SEED }).update({
    tick: 100,
    entityId,
    doctrineId: profile.combatDoctrineId,
    perception: highHull,
    directive: ready.directives.get(entityId),
  });
  assert.equal(combat.preferredRange, profile.preferredRange,
    `${factionId} preferred range did not reach CombatDoctrineRuntime`);
  return Object.freeze({
    squadFormation,
    squadRetreat: retreat.tactic,
    combatRange: combat.preferredRange,
  });
}

function axisDistances(left, right) {
  return Object.freeze({
    pursuit: Math.abs(left.pursuit - right.pursuit),
    preferredRange: Math.abs(left.preferredRange - right.preferredRange) / RANGE_SCALE,
    liveFormation: FORMATIONS.reduce((sum, formation) => (
      sum + Math.abs(left.formations[formation] - right.formations[formation])
    ), 0) / 2,
    retreat: Math.abs(left.retreat - right.retreat),
  });
}

function chebyshevDistance(axes) {
  return Math.max(...Object.entries(TOLERANCE).map(([axis, tolerance]) => axes[axis] / tolerance));
}

function printDistanceMatrix(rows, matrix) {
  const width = 11;
  console.log('Pairwise normalized Chebyshev distance matrix (axis delta / tolerance; every off-diagonal must be > 1):');
  console.log(`${''.padEnd(width)} ${rows.map((row) => row.short.padStart(width)).join(' ')}`);
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const cells = matrix[rowIndex].map((value) => fixed(value, 2).padStart(width));
    console.log(`${rows[rowIndex].short.padEnd(width)} ${cells.join(' ')}`);
  }
}

function perception(entityId, profile, hullFraction) {
  return {
    self: {
      id: entityId,
      team: 1,
      pos: { x: 0, z: 0 },
      vel: { x: 0, z: 0 },
      rot: 0,
      radius: 12,
      hullFraction,
      energyFraction: 1,
      heatFraction: 0,
      disabled: false,
      tethered: false,
      capabilities: ['drive', 'weapon', 'sensor', 'ranged', 'disable'],
      activity: { kind: 'attack_run', reason: 'doctrine_audit', startedTick: 0 },
      roe: 'weapons_free',
      combatDoctrineId: profile.combatDoctrineId,
      factionBehavior: profile,
    },
    contacts: [{
      id: 1,
      kind: 'ship',
      team: 0,
      classification: 'ship',
      pos: { x: 700, z: 0 },
      vel: { x: 0, z: 0 },
      radius: 12,
      alive: true,
      valid: true,
      visible: true,
      confidence: 1,
      threat: 0.9,
      hostile: true,
      tethered: false,
      disabled: false,
      operationalMassBand: 'medium',
      mobilityBand: 'medium',
      cargoBand: 'valuable',
      tetherabilityBand: 'good',
      tags: [],
    }],
    events: [],
  };
}

function formationLabel(distribution) {
  return FORMATIONS
    .filter((formation) => distribution[formation] > 0)
    .map((formation) => `${formation}:${fixed(distribution[formation], 2)}`)
    .join(' ');
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function fixed(value, digits) {
  return Number(value).toFixed(digits);
}

function rounded(value) {
  return Math.round(Number(value) * 1e6) / 1e6;
}
