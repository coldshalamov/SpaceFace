import test from 'node:test';
import assert from 'node:assert/strict';

import { SECTORS } from '../src/data/sectors.js';
import { programSeedFor, uniqueWreckById, validateUniqueWreckRegistry } from '../src/data/uniqueWrecks.js';
import {
  ASHFALL_BURN_CENTER_GLOBAL,
  ASHFALL_BURN_CORE_RADIUS,
  ASHFALL_BURN_EBB_INTENSITY_SCALE,
  ASHFALL_BURN_ENVELOPE_RADIUS,
  ASHFALL_BURN_HAZARD_ID,
  ASHFALL_BURN_ORBIT_RADIUS,
  ASHFALL_BURN_SECTOR_ID,
  ASHFALL_BURN_SURGE_PERIOD_S,
  ASHFALL_BURN_VENT_WINDOW_S,
  ashfallBurnCoreAt,
  ashfallBurnPhaseOffsetS,
  ashfallBurnProgramSeed,
  ashfallBurnSurgeAt,
  movingHazardTick,
} from '../src/data/environmentalMachinery.js';
import { movingRadiationGate } from '../src/core/uniqueWreckComplications.js';
import { world } from '../src/systems/world.js';

// Ashfall Roaming Burn (WF-03): the sector's charted `moving` radiation storm finally moves,
// and the ISC Lighthouse survey window is the burn's vent on the same clock heart.
// Proof seed: 4242 (derived program seed and the createSimulation seed both pin it).

const LIGHTHOUSE_ID = 'wreck_isc_lighthouse';
const PROOF_SEED = 4242;

function fakeState(simTime, programSeed) {
  return {
    simTime,
    player: { uniqueWrecks: { programSeed } },
    meta: { seed: PROOF_SEED },
  };
}

test('authored wiring: sector hazard, burn law, and Lighthouse window share one contract', () => {
  const ashfall = SECTORS.find((s) => s.id === ASHFALL_BURN_SECTOR_ID);
  assert.ok(ashfall, 'sector_ashfall_reach must exist');
  const hazard = (ashfall.hazards || []).find((h) => h.id === ASHFALL_BURN_HAZARD_ID);
  assert.ok(hazard, 'ashfall must author hazard_ashfall_burn by id');
  assert.equal(hazard.moving, true, 'the burn must stay authored moving');
  assert.equal(hazard.type, 'radiation');
  assert.equal(hazard.radius, ASHFALL_BURN_ENVELOPE_RADIUS, 'charted radius is the roam envelope');

  const def = uniqueWreckById(LIGHTHOUSE_ID);
  assert.ok(def, 'Lighthouse wreck must exist');
  assert.equal(def.hazardContext.periodS, ASHFALL_BURN_SURGE_PERIOD_S, 'survey gate period is the burn beat');
  assert.equal(def.hazardContext.openWindowS, ASHFALL_BURN_VENT_WINDOW_S, 'survey gate window is the vent');

  const validation = validateUniqueWreckRegistry();
  assert.equal(validation.ok, true, `unique wreck registry must validate: ${validation.errors.join('; ')}`);
});

test('law on seed 4242: the core roams inside the envelope and vents on the beat', () => {
  const programSeed = programSeedFor(PROOF_SEED);
  assert.equal(ashfallBurnProgramSeed(fakeState(0, programSeed)), programSeed);

  const step = 0.25;
  const total = 3 * ASHFALL_BURN_SURGE_PERIOD_S * 2; // 108 s: multiple roam laps and beats
  let minX = Infinity;
  let maxX = -Infinity;
  let ventSamples = 0;
  let samples = 0;
  let sawVent = false;
  let sawRoar = false;
  for (let t = 0; t < total; t += step) {
    const core = ashfallBurnCoreAt(t, programSeed);
    const coreDistance = Math.hypot(
      core.x - ASHFALL_BURN_CENTER_GLOBAL.x,
      core.z - ASHFALL_BURN_CENTER_GLOBAL.z,
    );
    assert.ok(
      coreDistance + ASHFALL_BURN_CORE_RADIUS <= ASHFALL_BURN_ENVELOPE_RADIUS + 1e-6,
      `core at t=${t} escapes the roam envelope: ${coreDistance + ASHFALL_BURN_CORE_RADIUS}`,
    );
    minX = Math.min(minX, core.x);
    maxX = Math.max(maxX, core.x);

    const surge = ashfallBurnSurgeAt(t, programSeed);
    assert.ok(surge.venting === (surge.intensityScale === ASHFALL_BURN_EBB_INTENSITY_SCALE));
    if (surge.venting) {
      sawVent = true;
      ventSamples += 1;
      assert.ok(surge.remainingS > 0 && surge.remainingS <= ASHFALL_BURN_VENT_WINDOW_S + 1e-9);
    } else {
      sawRoar = true;
      assert.equal(surge.intensityScale, 1, 'roar keeps the authored intensity');
    }
    samples += 1;
  }
  assert.ok(sawVent && sawRoar, 'the beat must both vent and roar across the window');
  const roamSpan = maxX - minX;
  assert.ok(
    roamSpan > 1.8 * ASHFALL_BURN_ORBIT_RADIUS,
    `core must actually roam (span ${roamSpan.toFixed(1)} WU over the window)`,
  );
  const ventFraction = ventSamples / samples;
  const expected = ASHFALL_BURN_VENT_WINDOW_S / ASHFALL_BURN_SURGE_PERIOD_S;
  assert.ok(
    Math.abs(ventFraction - expected) < 0.05,
    `vent fraction ${ventFraction.toFixed(3)} must match the authored window share ${expected.toFixed(3)}`,
  );
});

test('the survey gate and the burn vent never disagree (gate.allowed === burn.venting)', () => {
  const def = uniqueWreckById(LIGHTHOUSE_ID);
  const record = { wreckId: LIGHTHOUSE_ID };
  const seeds = [
    programSeedFor(PROOF_SEED),
    programSeedFor(777),
    programSeedFor(99),
    12345,
    1,
  ];
  const step = 0.25;
  const total = ASHFALL_BURN_SURGE_PERIOD_S * 5;
  let compared = 0;
  for (const programSeed of seeds) {
    for (let t = 0; t < total; t += step) {
      const gate = movingRadiationGate(fakeState(t, programSeed), record, def);
      const surge = ashfallBurnSurgeAt(t, programSeed);
      assert.equal(
        gate.allowed,
        surge.venting,
        `gate/burn disagreement at t=${t} seed=${programSeed}: gate.allowed=${gate.allowed} venting=${surge.venting}`,
      );
      if (!gate.allowed) {
        const reopenIn = gate.nextOpenAt - t;
        assert.ok(
          Math.abs(reopenIn - surge.remainingS) < 0.01,
          `gate reopen and vent end must agree (${reopenIn} vs ${surge.remainingS})`,
        );
      }
      compared += 1;
    }
  }
  assert.ok(compared >= 1500, `alignment sweep must be dense, got ${compared} comparisons`);
});

function tickHarness({ simTime, playerAt }) {
  const system = Object.create(world);
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    pos: { x: playerAt.x, z: playerAt.z },
    hull: 100,
    hullMax: 100,
    shield: 0,
    shieldMax: 0,
    flags: {},
  };
  // Rows exactly as _spawnHazards stamps them: authored local->global center, charted radius.
  const movingRow = {
    id: ASHFALL_BURN_HAZARD_ID,
    type: 'radiation',
    center: { x: ASHFALL_BURN_CENTER_GLOBAL.x, z: ASHFALL_BURN_CENTER_GLOBAL.z },
    radius: ASHFALL_BURN_ENVELOPE_RADIUS,
    intensity: 0.8,
    moving: true,
  };
  const staticRow = {
    id: 'hazard_ashfall_debris',
    type: 'debris',
    center: { x: ASHFALL_BURN_CENTER_GLOBAL.x + 3000, z: ASHFALL_BURN_CENTER_GLOBAL.z + 1000 },
    radius: 800,
    intensity: 0.5,
  };
  const state = {
    playerId: 1,
    simTime,
    entities: new Map([[1, player]]),
    // state.player.uniqueWrecks.programSeed is what the runtime writes (systems/uniqueWrecks
    // _ensureState) and what the survey gate + burn law both resolve.
    player: { uniqueWrecks: { programSeed: programSeedFor(PROOF_SEED) } },
    world: { activeSector: { hazards: [movingRow, staticRow] } },
    meta: { seed: PROOF_SEED },
  };
  const events = [];
  system.state = state;
  system.bus = { emit(event, payload) { events.push({ event, payload }); } };
  system.registry = null;
  system.helpers = {};
  system._hazardSet = new Set();
  system._hazardNextSet = new Set();
  system._tickHazards(1, state);
  return { system, player, movingRow, staticRow, events };
}

test('world tick: the burn row moves, breathes, and bites; static rows are untouched', () => {
  const programSeed = programSeedFor(PROOF_SEED);
  const phaseS = ashfallBurnPhaseOffsetS(programSeed);
  const ventT = (ASHFALL_BURN_SURGE_PERIOD_S - phaseS) % ASHFALL_BURN_SURGE_PERIOD_S; // phaseTime 0 -> venting
  const roarT = ventT + ASHFALL_BURN_SURGE_PERIOD_S / 2 + 1; // deep in the roar half

  for (const [t, expectVent] of [[ventT, true], [roarT, false]]) {
    const surge = ashfallBurnSurgeAt(t, programSeed);
    assert.equal(surge.venting, expectVent, `fixture t=${t} must be ${expectVent ? 'venting' : 'roaring'}`);
    const core = ashfallBurnCoreAt(t, programSeed);
    const { player, movingRow, staticRow, events } = tickHarness({ simTime: t, playerAt: core });

    // The live row now carries the roaming core, not the charted envelope.
    assert.ok(Math.abs(movingRow.center.x - core.x) < 1e-6 && Math.abs(movingRow.center.z - core.z) < 1e-6,
      'tick must stamp the law core onto the live row');
    assert.equal(movingRow.radius, ASHFALL_BURN_CORE_RADIUS, 'live burn body is the core radius');
    assert.equal(movingRow.intensityScale, expectVent ? ASHFALL_BURN_EBB_INTENSITY_SCALE : 1);

    // The player stands in the core: the burn bites at the vented or roaring rate.
    const expectedDamage = 0.8 * (expectVent ? ASHFALL_BURN_EBB_INTENSITY_SCALE : 1) * 6 * 1;
    assert.ok(
      Math.abs((100 - player.hull) - expectedDamage) < 1e-6,
      `damage at t=${t}: got ${100 - player.hull}, expected ${expectedDamage}`,
    );

    // Static row untouched by the moving law.
    assert.equal(staticRow.radius, 800);
    assert.equal(staticRow.intensityScale, undefined);
    assert.equal(staticRow.center.x, ASHFALL_BURN_CENTER_GLOBAL.x + 3000);

    // Enter language reports the intensity the player actually feels.
    const enter = events.find((row) => row.event === 'hazard:enter' && row.payload.zoneType === 'radiation');
    assert.ok(enter, 'radiation hazard:enter must fire inside the core');
    assert.ok(Math.abs(enter.payload.intensity - 0.8 * (expectVent ? ASHFALL_BURN_EBB_INTENSITY_SCALE : 1)) < 1e-9);
  }
});

test('a blocked Lighthouse ping speaks the vent once per surge beat, in-sector only', () => {
  const mkSystem = (simTime) => {
    const system = Object.create(world);
    system.state = {
      simTime,
      world: { currentSectorId: ASHFALL_BURN_SECTOR_ID },
      meta: { seed: PROOF_SEED },
    };
    const events = [];
    system.bus = { emit(event, payload) { events.push({ event, payload }); } };
    system._burnVentToastAtS = -Infinity;
    return { system, events };
  };

  // First blocked ping in the burn sector: one vent toast, naming the wait.
  let { system, events } = mkSystem(100);
  system._onUniqueWreckScanBlocked({
    reason: 'moving_radiation_window',
    sectorId: ASHFALL_BURN_SECTOR_ID,
    nextOpenAt: 105,
  });
  const toasts = events.filter((row) => row.event === 'toast');
  assert.equal(toasts.length, 1, 'the first blocked ping must speak the vent');
  assert.match(toasts[0].payload.text, /vents in ~5s/);

  // Immediate re-ping inside the same beat: throttled, no toast spam.
  system._onUniqueWreckScanBlocked({
    reason: 'moving_radiation_window',
    sectorId: ASHFALL_BURN_SECTOR_ID,
    nextOpenAt: 105,
  });
  assert.equal(events.filter((row) => row.event === 'toast').length, 1, 'one toast per surge beat');

  // After a full beat the next blocked ping may speak again.
  const later = mkSystem(100 + ASHFALL_BURN_SURGE_PERIOD_S + 0.5);
  later.system._onUniqueWreckScanBlocked({
    reason: 'moving_radiation_window',
    sectorId: ASHFALL_BURN_SECTOR_ID,
    nextOpenAt: 124,
  });
  assert.equal(later.events.filter((row) => row.event === 'toast').length, 1, 'throttle releases after a beat');

  // Other sectors and other block reasons stay silent.
  const elsewhere = mkSystem(400);
  elsewhere.system._onUniqueWreckScanBlocked({
    reason: 'moving_radiation_window',
    sectorId: 'sector_vesta_forge',
    nextOpenAt: 405,
  });
  elsewhere.system._onUniqueWreckScanBlocked({
    reason: 'some_other_gate',
    sectorId: ASHFALL_BURN_SECTOR_ID,
    nextOpenAt: 405,
  });
  assert.equal(elsewhere.events.filter((row) => row.event === 'toast').length, 0);
});

test('the authored phase mirror equals the survey gate derivation on seed 4242', () => {
  const programSeed = programSeedFor(PROOF_SEED);
  // The gate derives its phase from core/uniqueWreckComplications.deterministicTimer with the
  // same inputs; the alignment sweep above proves the outcome, and this pins the raw number.
  const def = uniqueWreckById(LIGHTHOUSE_ID);
  const record = { wreckId: LIGHTHOUSE_ID };
  const t = 0;
  const gate = movingRadiationGate(fakeState(t, programSeed), record, def);
  const phaseTime = ((t + ashfallBurnPhaseOffsetS(programSeed)) % ASHFALL_BURN_SURGE_PERIOD_S
    + ASHFALL_BURN_SURGE_PERIOD_S) % ASHFALL_BURN_SURGE_PERIOD_S;
  assert.equal(gate.allowed, phaseTime < ASHFALL_BURN_VENT_WINDOW_S);
  assert.equal(
    Math.round(gate.phase * 1000) / 1000,
    Math.round((phaseTime / ASHFALL_BURN_SURGE_PERIOD_S) * 1000) / 1000,
  );
});
