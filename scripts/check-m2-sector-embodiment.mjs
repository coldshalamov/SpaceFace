// check-m2-sector-embodiment.mjs — M2-C3 offscreen consequence embodiment gate.
// Runs focused unit tests + a thin invariant pass over the pure kernel + adapter.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SECTORS, dangerIndex } from '../src/data/sectors.js';
import { FACTION_META } from '../src/data/factions.js';
import { createGameState } from '../src/core/gameState.js';
import {
  buildSectorGraph,
  createSectorField,
  stepSectorField,
} from '../src/systems/dangerModel.js';
import { sectorSim } from '../src/systems/sectorSim.js';
import {
  projectFieldEmbodiment,
  filterNewEmbodimentIntents,
  proposedRecordId,
  embodimentDigest,
  stableSerialize,
  EMBODIMENT_KIND,
  EMBODIMENT_SCHEMA_ID,
} from '../src/sim/sector/embodiment.js';
import { stableRecordId } from '../src/world/worldRecords.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function runNodeTest() {
  const r = spawnSync(
    process.execPath,
    ['--test', 'test/m2-sector-embodiment.test.mjs'],
    { cwd: root, encoding: 'utf8' },
  );
  process.stdout.write(r.stdout || '');
  process.stderr.write(r.stderr || '');
  assert.equal(r.status, 0, 'm2-sector-embodiment unit tests must pass');
}

function checkPureInvariants() {
  assert.equal(SECTORS.length, 24, 'must cover 24 stable sectors');
  const graph = buildSectorGraph(SECTORS);
  const ownerBySector = Object.create(null);
  for (const s of SECTORS) ownerBySector[s.id] = s.factionId;
  const seed = 42;
  const field = stepSectorField({
    graph,
    field: createSectorField({ graph, factionMeta: FACTION_META, ownerBySector, seed }),
    factionMeta: FACTION_META,
    ownerBySector,
    seed,
    dtDays: 2,
  });
  const sectorIds = SECTORS.map((s) => s.id).sort((a, b) => a.localeCompare(b));
  const byId = new Map(SECTORS.map((s) => [s.id, s]));
  const a = projectFieldEmbodiment({
    field, sectorIds, seed, sectorsById: byId,
    baseDangerFor: (id) => dangerIndex(byId.get(id)),
  });
  const b = projectFieldEmbodiment({
    field, sectorIds: sectorIds.slice().reverse(), seed, sectorsById: byId,
    baseDangerFor: (id) => dangerIndex(byId.get(id)),
  });
  assert.equal(a.digest, b.digest, 'seeded ordering must not depend on input order');
  assert.equal(Object.keys(a.bySector).length, 24);
  assert.equal(filterNewEmbodimentIntents(a.intents, a.intents.map((i) => i.intentId)).length, 0);
  assert.equal(
    proposedRecordId(seed, 'sector_ceres_belt', 'convoy', 'k'),
    stableRecordId(seed, 'sector_ceres_belt', 'convoy', 'k'),
    'durable record identity compatibility',
  );
}

function checkAdapterIdempotency() {
  const state = createGameState(42);
  state.meta.seed = 42;
  state.world.currentSectorId = 'sector_helios_prime';
  for (const s of SECTORS) state.world.sectors[s.id] = { ...s, owner: s.factionId };
  const emitLog = [];
  const bus = { emit(e, p) { emitLog.push({ e, p }); }, on() {}, off() {} };
  sectorSim.state = state;
  sectorSim.bus = bus;
  sectorSim.helpers = {};
  sectorSim.registry = {
    get(n) {
      if (n === 'factions') return { addOffscreenTension() {}, contestedSectorFor() { return null; } };
      if (n === 'automation') return { offscreenRiskPass() { return 0; } };
      return null;
    },
  };
  sectorSim.newGame();
  sectorSim._advanceModel(1, 'check');
  const first = emitLog.filter((x) => x.e === 'sectorsim:embodiment').length;
  assert.equal(first, 1);
  emitLog.length = 0;
  sectorSim._onSectorEnter({ sectorId: 'sector_ceres_belt', continuous: true, noTeleport: true });
  assert.equal(emitLog.filter((x) => x.e === 'sectorsim:embodiment').length, 0);
  assert.equal(emitLog.filter((x) => x.e === 'economy:applyTradePressure').length, 0);
}


function checkPayloadBoundDigest() {
  const base = {
    schemaId: EMBODIMENT_SCHEMA_ID,
    schemaVersion: 1,
    intentId: 'ei_check_payload',
    sectorId: 'sector_helios_prime',
    kind: EMBODIMENT_KIND.TRAFFIC_DENSITY,
    epochKey: 4,
    epochDays: 1,
    source: 'sector_field',
    proposedRecordId: null,
    proposedRecordKind: null,
    identityKey: 'traffic_density:core',
    payload: { a: 1, b: { z: 2, y: 3 }, c: [1, 2] },
  };
  const reordered = {
    ...base,
    payload: { c: [1, 2], b: { y: 3, z: 2 }, a: 1 },
  };
  assert.equal(stableSerialize(base.payload), stableSerialize(reordered.payload));
  assert.equal(embodimentDigest([base]), embodimentDigest([reordered]), 'key-order independent');
  const changed = {
    ...base,
    payload: { a: 1, b: { z: 2, y: 9 }, c: [1, 2] },
  };
  assert.notEqual(
    embodimentDigest([base]),
    embodimentDigest([changed]),
    'nested payload change must diverge digest under same intent ids',
  );
}

let n = 0;
runNodeTest();
n++;
console.log('ok   m2-embodiment — unit suite');
checkPureInvariants();
n++;
console.log('ok   m2-embodiment — pure invariants (24 sectors, digest, record ids)');
checkAdapterIdempotency();
n++;
console.log('ok   m2-embodiment — adapter continuous idempotency');
checkPayloadBoundDigest();
n++;
console.log('ok   m2-embodiment — payload-bound digest (key-order + nested)');
console.log(`\n${n} ok, 0 fail`);
console.log('M2-C3 sector embodiment checks OK');
