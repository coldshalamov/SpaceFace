// PQ-151.02 — corrupt ports wash a hot pod's papers for a cut.
// Docking at an outlaw berth is the verb. A later customs cone stays clean.
// Reputation with the port's faction pays the cut down. Heat is not bought off.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { COMMODITIES } from '../src/data/commodities.js';
import {
  canLaunderSalvageAtStation,
  CLASSIFIED_SALVAGE_COMMODITY_ID,
  COMMON_SALVAGE_COMMODITY_ID,
  launderCutCredits,
  launderedSalvageCommodityId,
} from '../src/data/salvageLegality.js';
import { economy } from '../src/systems/economy.js';
import { heat } from '../src/systems/heat.js';
import {
  CUSTOMS_SCAN_DWELL_S,
  CUSTOMS_SCAN_HALF_ANGLE,
  CUSTOMS_SCAN_RANGE,
  lawSecurity,
} from '../src/systems/lawSecurity.js';
import {
  isJettisonedCargoPod,
  lootShards,
  spawnJettisonedCargoPod,
} from '../src/systems/lootShards.js';
import { pirateDisguise } from '../src/systems/pirateDisguise.js';

const SEED = 15120;
const CONTRABAND_ID = 'cmdty_narcotics';
const CONTRABAND = COMMODITIES.find((row) => row.id === CONTRABAND_ID);
const LAWFUL_STATION = 'station_helios';
const OUTLAW_STATION = 'station_smuggler';
const POD_UNITS = 8;
const START_CREDITS = 5000;

function shipSpec(extra = {}) {
  return {
    type: 'ship',
    team: extra.team != null ? extra.team : 0,
    pos: extra.pos || { x: 0, z: 0 },
    vel: extra.vel || { x: 0, z: 0 },
    rot: extra.rot != null ? extra.rot : 0,
    angVel: 0,
    radius: extra.radius || 14,
    mass: extra.mass || 18,
    hull: extra.hull != null ? extra.hull : 120,
    hullMax: extra.hullMax != null ? extra.hullMax : 120,
    collides: extra.collides !== false,
    factionId: extra.factionId || 'player',
    flags: {},
    data: extra.data || { defId: extra.defId || 'ship_kestrel' },
  };
}

function boot(seed, extra = {}) {
  const sim = createSimulation({
    seed,
    bus: createBus(),
    systems: [economy, lootShards, pirateDisguise, lawSecurity, heat],
  });
  const { state } = sim;
  state.mode = 'flight';
  state.player.credits = extra.credits != null ? extra.credits : START_CREDITS;
  state.player.heat = extra.heat != null ? extra.heat : 0;
  if (extra.quietRep != null) {
    state.factions.faction_quiet = { rep: extra.quietRep };
  }
  const player = sim.spawn(shipSpec({ pos: extra.playerPos || { x: 0, z: 0 } }));
  state.playerId = player.id;
  const scans = [];
  const launders = [];
  const charges = [];
  sim.bus.on('contraband:scanned', (p) => scans.push(p));
  sim.bus.on('cargo:laundered', (p) => launders.push(p));
  sim.bus.on('credits:changed', (p) => charges.push(p));
  return { sim, state, player, scans, launders, charges };
}

function spawnPod(t, spec = {}) {
  const pod = spawnJettisonedCargoPod(t.state, {
    pos: spec.pos || { x: 12, z: 8 },
    vel: { x: 0, z: 0 },
    commodityId: spec.commodityId || CONTRABAND_ID,
    amount: spec.amount != null ? spec.amount : POD_UNITS,
    unitMass: spec.unitMass != null ? spec.unitMass : CONTRABAND.massPerU,
    ownerId: spec.ownerId != null ? spec.ownerId : t.player.id,
    factionId: 'player',
  }, t.sim.helpers);
  assert.ok(pod, 'spawnJettisonedCargoPod must return a body');
  return pod;
}

function spawnScanner(t, extra = {}) {
  return t.sim.spawn(shipSpec({
    team: 2,
    pos: extra.pos || { x: 0, z: 0 },
    rot: extra.rot != null ? extra.rot : 0,
    radius: 14,
    mass: 400,
    hull: 200,
    hullMax: 200,
    factionId: 'faction_scn',
    defId: 'customs_cutter',
    data: {
      customsScanner: true,
      defId: 'customs_cutter',
      customsScanCone: extra.cone || {
        heading: 0,
        halfAngle: CUSTOMS_SCAN_HALF_ANGLE,
        range: CUSTOMS_SCAN_RANGE,
        dwellS: CUSTOMS_SCAN_DWELL_S,
      },
    },
  }));
}

function teleport(entity, x, z) {
  entity.pos.x = x;
  entity.pos.z = z;
  if (entity.prevPos) {
    entity.prevPos.x = x;
    entity.prevPos.z = z;
  }
  entity.vel.x = 0;
  entity.vel.z = 0;
}

function dwellCone(t, pod) {
  teleport(t.player, 420, 380);
  spawnScanner(t);
  teleport(pod, 65, 28);
  const ticks = Math.ceil((CUSTOMS_SCAN_DWELL_S + 0.25) / SIM_DT);
  for (let i = 0; i < ticks; i++) t.sim.step();
}

function cleanup(t) {
  t.sim.dispose();
}

test('outlaw port is a real launder station; Helios is not', () => {
  assert.equal(canLaunderSalvageAtStation(OUTLAW_STATION), true);
  assert.equal(canLaunderSalvageAtStation(LAWFUL_STATION), false);
  assert.equal(launderedSalvageCommodityId(CLASSIFIED_SALVAGE_COMMODITY_ID, OUTLAW_STATION), COMMON_SALVAGE_COMMODITY_ID);
  assert.equal(launderedSalvageCommodityId(CONTRABAND_ID, OUTLAW_STATION), CONTRABAND_ID);
});

test(`seed ${SEED}: a hot pod is still scanned if you never dock the outlaw port`, () => {
  const t = boot(SEED);
  try {
    const pod = spawnPod(t);
    assert.equal(pod.data.legality, 'contraband');
    dwellCone(t, pod);
    assert.equal(pod.data.customsScanned, true);
    assert.equal(t.scans.length, 1);
    assert.equal(t.scans[0].source, 'customs_scan_cone');
    assert.equal(t.launders.length, 0);
  } finally {
    cleanup(t);
  }
});

test(`seed ${SEED}: outlaw dock washes the pod; later scan is clean; ledger records the cut`, () => {
  const t = boot(SEED);
  try {
    const expectedCut = launderCutCredits(CONTRABAND_ID, POD_UNITS, 0);
    assert.equal(expectedCut, 616, 'seed 15120 / 8 narcotics / Quiet 0 → 616 cr cut');

    const pod = spawnPod(t);
    assert.equal(isJettisonedCargoPod(pod), true);
    assert.equal(pod.data.legality, 'contraband');
    const heatBefore = t.state.player.heat;

    t.sim.bus.emit('dock:docked', { stationId: OUTLAW_STATION });

    assert.equal(pod.data.laundered, true);
    assert.equal(pod.data.legality, 'legal');
    assert.equal(pod.data.commodityId, CONTRABAND_ID);
    assert.equal(pod.data.launderedAtStationId, OUTLAW_STATION);
    assert.equal(t.launders.length, 1);
    assert.equal(t.launders[0].accepted, true);
    assert.equal(t.launders[0].source, 'pirateDisguise');
    assert.equal(t.launders[0].cut, expectedCut);
    assert.deepEqual(t.launders[0].podIds, [pod.id]);

    const ledger = t.state.player.launderLedger;
    assert.ok(Array.isArray(ledger) && ledger.length === 1, 'launder ledger records the cut');
    assert.equal(ledger[0].side, 'launder');
    assert.equal(ledger[0].cut, expectedCut);
    assert.equal(ledger[0].stationId, OUTLAW_STATION);
    assert.equal(t.state.player.credits, START_CREDITS - expectedCut);
    assert.ok(t.charges.some((p) => p.reason === 'launder:cut' && p.delta === -expectedCut));
    assert.equal(t.state.player.heat, heatBefore, 'paying the cut must not buy off WANTED');

    dwellCone(t, pod);
    assert.notEqual(pod.data.customsScanned, true, 'washed papers must not lock the cone');
    assert.equal(t.scans.length, 0, 'later customs cone stays clean');
  } finally {
    cleanup(t);
  }
});

test(`seed ${SEED}: a lawful dock does not wash the pod`, () => {
  const t = boot(SEED);
  try {
    const pod = spawnPod(t);
    t.sim.bus.emit('dock:docked', { stationId: LAWFUL_STATION });
    assert.equal(pod.data.laundered, undefined);
    assert.equal(pod.data.legality, 'contraband');
    assert.equal(t.launders.length, 0);
    assert.equal(t.state.player.credits, START_CREDITS);
    dwellCone(t, pod);
    assert.equal(pod.data.customsScanned, true);
    assert.equal(t.scans.length, 1);
  } finally {
    cleanup(t);
  }
});

test(`seed ${SEED}: Quiet standing pays the cut down`, () => {
  const t = boot(SEED, { quietRep: 700 });
  try {
    const cheap = launderCutCredits(CONTRABAND_ID, POD_UNITS, 700);
    const full = launderCutCredits(CONTRABAND_ID, POD_UNITS, 0);
    assert.ok(cheap < full, `high standing cut ${cheap} must be below Neutral ${full}`);
    assert.equal(cheap, 308);

    const pod = spawnPod(t);
    t.sim.bus.emit('dock:launder', { stationId: OUTLAW_STATION });
    assert.equal(t.launders[0].accepted, true);
    assert.equal(t.launders[0].cut, cheap);
    assert.equal(t.launders[0].reputation, 700);
    assert.equal(t.state.player.credits, START_CREDITS - cheap);
    assert.equal(pod.data.legality, 'legal');
  } finally {
    cleanup(t);
  }
});

test(`seed ${SEED}: short credits leave the pod hot`, () => {
  const t = boot(SEED, { credits: 10 });
  try {
    const pod = spawnPod(t);
    t.sim.bus.emit('dock:docked', { stationId: OUTLAW_STATION });
    assert.equal(t.launders[0].accepted, false);
    assert.equal(t.launders[0].reason, 'short');
    assert.equal(pod.data.legality, 'contraband');
    assert.equal(pod.data.laundered, undefined);
    assert.equal(t.state.player.credits, 10);
    dwellCone(t, pod);
    assert.equal(pod.data.customsScanned, true);
  } finally {
    cleanup(t);
  }
});

test(`seed ${SEED}: classified salvage remaps through the existing helper`, () => {
  const t = boot(SEED);
  try {
    const classified = COMMODITIES.find((row) => row.id === CLASSIFIED_SALVAGE_COMMODITY_ID);
    const pod = spawnPod(t, {
      commodityId: CLASSIFIED_SALVAGE_COMMODITY_ID,
      unitMass: classified.massPerU,
    });
    assert.equal(pod.data.legality, 'restricted');
    t.sim.bus.emit('dock:docked', { stationId: OUTLAW_STATION });
    assert.equal(pod.data.laundered, true);
    assert.equal(pod.data.commodityId, COMMON_SALVAGE_COMMODITY_ID);
    assert.equal(pod.data.legality, 'legal');
  } finally {
    cleanup(t);
  }
});
