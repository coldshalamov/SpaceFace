import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { SECTORS } from '../src/data/sectors.js';
import {
  effectiveRegionalSecurity,
  regionalEcology,
  regionalEcologyReadout,
} from '../src/systems/regionalEcology.js';

// WF-16 sector-state memory: an OPEN aftermath cause is a wound the sector itself can read.
// While open it leans the sector's danger/law state; the remedy job (or the board exhausting
// the offer) closes the wound and the sector settles. Derived — no new save state.

const SEED = 4242;
const SECTOR_ID = 'sector_ceres_belt';
const OTHER_SECTOR_ID = 'sector_io_reach';

function makeState(seed = SEED) {
  return {
    meta: { seed },
    simTime: 240,
    mode: 'flight',
    playerId: 1,
    player: { heat: 0 },
    entities: new Map([[1, { id: 1, type: 'ship', isPlayer: true, pos: { x: 0, z: 0 } }]]),
    world: {
      currentSectorId: SECTOR_ID,
      sectors: Object.fromEntries(SECTORS.map((sector) => [sector.id, sector])),
      activeSector: { stations: [], fields: [], hazards: [], pois: [], gates: [] },
    },
  };
}

function makeHarness(seed = SEED) {
  const state = makeState(seed);
  const bus = createBus();
  const log = [];
  const emit = bus.emit;
  bus.emit = (name, payload) => {
    log.push({ name, payload });
    return emit(name, payload);
  };
  const system = Object.create(regionalEcology);
  system.init({ state, bus, helpers: {} });
  system.newGame();
  return { state, bus, log, system };
}

function sectorRow(id = SECTOR_ID) {
  return SECTORS.find((row) => row.id === id);
}

function openCause(fingerprint, consequenceKind, sectorId = SECTOR_ID) {
  return {
    fingerprint,
    sectorId,
    motiveId: 'predation',
    consequenceKind,
    status: 'open',
  };
}

test('an open aftermath wound leans the sector dangerous and thins law until remedied', () => {
  const { state, bus } = makeHarness();
  const sector = sectorRow();
  bus.emit('sector:enter', { sectorId: sector.id, sector });
  const baseline = regionalEcologyReadout(state, sector.id);
  assert.equal(baseline.wound.danger, 0);
  assert.equal(baseline.wound.law, 0);

  bus.emit('aftermath:causeRecorded', openCause('efp_ceres_wound_1', 'security'));
  const wounded = regionalEcologyReadout(state, sector.id);
  assert.ok(Math.abs(wounded.danger.effective - (baseline.danger.effective + 0.045)) < 1e-9);
  assert.ok(Math.abs(wounded.law.effective - (baseline.law.effective - 0.035)) < 1e-9);
  assert.deepEqual(wounded.wound, { danger: 0.045, law: 0.035, causes: 1 });
  // The world reads the wound through the same readout the law/predation planners use.
  assert.equal(effectiveRegionalSecurity(state, sector.id, sector.security), wounded.law.effective);

  // The player-healed read: the remedy job closes the wound and the sector settles exactly.
  bus.emit('aftermath:remedied', { fingerprint: 'efp_ceres_wound_1' });
  const healed = regionalEcologyReadout(state, sector.id);
  assert.equal(healed.danger.effective, baseline.danger.effective);
  assert.equal(healed.law.effective, baseline.law.effective);
  assert.deepEqual(healed.wound, { danger: 0, law: 0, causes: 0 });
});

test('wound pressure is bounded so a pile of stale wounds cannot max the sector', () => {
  const { state, bus } = makeHarness();
  const sector = sectorRow();
  bus.emit('sector:enter', { sectorId: sector.id, sector });
  const baseline = regionalEcologyReadout(state, sector.id);
  for (let i = 0; i < 6; i++) {
    bus.emit('aftermath:causeRecorded', openCause(`efp_ceres_pile_${i}`, 'security'));
  }
  const wounded = regionalEcologyReadout(state, sector.id);
  assert.ok(Math.abs(wounded.wound.danger - 0.12) < 1e-9, 'danger lift caps at 0.12');
  assert.ok(Math.abs(wounded.wound.law - 0.10) < 1e-9, 'law thin caps at 0.10');
  assert.equal(wounded.wound.causes, 6);
  assert.ok(wounded.danger.effective > baseline.danger.effective);
  assert.ok(wounded.law.effective >= 0 && wounded.danger.effective <= 1);
});

test('an exhausted cause closes its wound instead of pressing the sector forever', () => {
  const { state, bus, log } = makeHarness();
  const sector = sectorRow();
  bus.emit('sector:enter', { sectorId: sector.id, sector });
  const baseline = regionalEcologyReadout(state, sector.id);
  bus.emit('aftermath:causeRecorded', openCause('efp_ceres_stale_1', 'security'));
  assert.ok(regionalEcologyReadout(state, sector.id).wound.danger > 0);

  bus.emit('aftermath:causeExhausted', { fingerprint: 'efp_ceres_stale_1' });
  const settled = regionalEcologyReadout(state, sector.id);
  assert.equal(settled.wound.danger, 0);
  assert.equal(settled.law.effective, baseline.law.effective);
  assert.ok(log.some((entry) => entry.name === 'regionalEcology:changed'
    && entry.payload.cause && entry.payload.cause.kind === 'aftermath_exhausted'));
});

test('wound pressure stays in the wounded sector', () => {
  const { state, bus } = makeHarness();
  bus.emit('sector:enter', { sectorId: SECTOR_ID, sector: sectorRow() });
  bus.emit('sector:enter', { sectorId: OTHER_SECTOR_ID, sector: sectorRow(OTHER_SECTOR_ID) });
  const otherBaseline = regionalEcologyReadout(state, OTHER_SECTOR_ID);
  bus.emit('aftermath:causeRecorded', openCause('efp_ceres_only_1', 'security', SECTOR_ID));
  const otherAfter = regionalEcologyReadout(state, OTHER_SECTOR_ID);
  assert.equal(otherAfter.danger.effective, otherBaseline.danger.effective);
  assert.equal(otherAfter.law.effective, otherBaseline.law.effective);
  assert.deepEqual(otherAfter.wound, { danger: 0, law: 0, causes: 0 });
  const home = regionalEcologyReadout(state, SECTOR_ID);
  assert.ok(home.wound.danger > 0, 'the wounded sector still reads its own wound');
});

test('unknown consequence kinds count as unresolved but carry no wound pressure', () => {
  const { state, bus } = makeHarness();
  const sector = sectorRow();
  bus.emit('sector:enter', { sectorId: sector.id, sector });
  const baseline = regionalEcologyReadout(state, sector.id);
  bus.emit('aftermath:causeRecorded', openCause('efp_ceres_unknown_1', 'unclassified'));
  const readout = regionalEcologyReadout(state, sector.id);
  assert.equal(readout.danger.effective, baseline.danger.effective);
  assert.equal(readout.law.effective, baseline.law.effective);
  assert.equal(readout.encounters.unresolvedCauses, 1);
  assert.equal(readout.wound.causes, 1);
});

test('wound pressure survives a save round-trip deterministically', () => {
  const harness = makeHarness();
  const sector = sectorRow();
  harness.bus.emit('sector:enter', { sectorId: sector.id, sector });
  harness.bus.emit('aftermath:causeRecorded', openCause('efp_ceres_save_1', 'security'));
  harness.bus.emit('aftermath:causeRecorded', openCause('efp_ceres_save_2', 'distress'));
  const before = regionalEcologyReadout(harness.state, sector.id);

  const saved = harness.system.serialize();
  const loaded = makeHarness();
  loaded.system.deserialize(saved);
  loaded.bus.emit('sector:enter', { sectorId: sector.id, sector });
  const after = regionalEcologyReadout(loaded.state, sector.id);
  assert.deepEqual(after.wound, before.wound);
  assert.equal(after.danger.effective, before.danger.effective);
  assert.equal(after.law.effective, before.law.effective);
  assert.deepEqual(loaded.system.serialize(), saved);
});
