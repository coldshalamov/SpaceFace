// INFERENCE WORLD-47: "The Vesta foundry runs a slag-pour side event you can watch from the lane"
//
// Contract: `planStationSideEvents` for the foundry (station type 'fab' / 'foundry') can pick
// the cosmetic slag-pour kind (`slag_pour`), that kind requests no spawn slot (budget 0 —
// never a combat ship), no non-foundry station type can schedule it, the render grammar
// carries a matching profile with a distinct trajectory and accent, and on seed 4242 the
// live director-to-VFX pipeline produces its VFX record on schedule.

import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { createBus } from '../src/core/eventBus.js';
import { planStationSideEvents, SIDE_EVENTS, SIDE_EVENT_IDS } from '../src/data/stationSideEvents.js';
import {
  createStationSideEventVfxFrameScratch,
  resolveStationSideEventVfxProfile,
  writeStationSideEventVfxFrame,
} from '../src/render/stationSideEventVfx.js';
import { resolveStationArmArticulation } from '../src/render/infrastructureMotion.js';
import { vfx } from '../src/render/vfx.js';
import { stationSideEventDirector } from '../src/systems/stationSideEventDirector.js';

const NON_FOUNDRY_TYPES = ['trade_hub', 'refinery', 'mining', 'military', 'blackmarket', 'research'];

function makeHarness({ seed = 4242 } = {}) {
  const scene = new THREE.Scene();
  const player = {
    id: 'player',
    type: 'ship',
    alive: true,
    team: 0,
    pos: { x: -480, z: 720 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 8,
  };
  const station = {
    id: 'station_forge',
    type: 'station',
    alive: true,
    pos: { x: -480, z: 720 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 60,
    dockRadius: 80,
    data: {
      stationId: 'station_forge',
      stationTypeId: 'fab',
      dockRadius: 80,
      size: 'M',
    },
  };
  const entities = new Map([[player.id, player], [station.id, station]]);
  const entityList = [player, station];
  const state = {
    mode: 'flight',
    tick: 0,
    simTime: 0,
    playerId: player.id,
    player: { targetId: null, tether: { active: false }, flags: {} },
    meta: { seed },
    world: { currentSectorId: 'sector_vesta_forge' },
    entities,
    entityList,
    settings: {
      video: {
        particleQuality: 'high',
        motionReduce: false,
        flashReduce: false,
        energyMaterials: false,
        engineTrails: false,
        bloom: true,
      },
      accessibility: { flashReduce: false },
    },
    input: { turnIntent: 0 },
    render: { scene },
    ui: { radarRange: 4000 },
    combat: { attachments: { byId: {} }, beams: [] },
    content: {},
  };
  const bus = createBus();
  const system = Object.create(vfx);
  system.init({ state, bus, helpers: { player: () => player } });
  const director = Object.create(stationSideEventDirector);
  director.init({ state, bus, helpers: {} });
  return { bus, director, player, state, station, system };
}

test('slag_pour is a foundry-specific cosmetic side event', () => {
  const def = SIDE_EVENTS.slag_pour;
  assert.ok(def, 'slag_pour exists in the side-event catalog');
  assert.ok(SIDE_EVENT_IDS.includes('slag_pour'), 'slag_pour is in the stable id order');
  assert.equal(def.budget, 0, 'slag pour requests no spawn slot (never a launched combat ship)');
  assert.ok(def.affinity && (def.affinity.includes('fab') || def.affinity.includes('foundry')),
    'slag_pour has affinity for foundry/fab');
  for (const nonFoundry of ['military', 'trade_hub', 'research', 'blackmarket']) {
    assert.equal(def.affinity.includes(nonFoundry), false,
      `slag_pour must not be scheduled at ${nonFoundry}`);
  }
});

test('planStationSideEvents for the foundry picks slag_pour, and non-foundry station types never do', () => {
  // Positive branch: on seed 4242 the Vesta foundry schedules slag_pour
  const vestaSchedule = planStationSideEvents(4242, 'sector_vesta_forge', 0, 'station_forge', 'fab');
  const pourItem = vestaSchedule.find((item) => item.kind === 'slag_pour');
  assert.ok(pourItem, 'Vesta foundry on seed 4242 must schedule a slag_pour event');
  assert.equal(pourItem.budget, 0, 'scheduled slag_pour is cosmetic (budget 0)');
  assert.ok(pourItem.delay > 0, 'slag_pour has an ascending positive delay');

  // Across diverse seeds, the foundry picks slag_pour
  let sawSlagPour = false;
  for (let seed = 0; seed < 60; seed++) {
    const schedule = planStationSideEvents(seed, 'sector_vesta_forge', 0, 'station_forge', 'fab');
    if (schedule.some((item) => item.kind === 'slag_pour')) sawSlagPour = true;
  }
  assert.ok(sawSlagPour, 'foundry schedule can pick slag_pour across seeds');

  // Negative/quiet branch: non-foundry stations never schedule slag_pour
  for (const typeId of NON_FOUNDRY_TYPES) {
    for (let seed = 0; seed < 60; seed++) {
      const kinds = planStationSideEvents(seed, 'sector_test', 0, 'station_x', typeId).map((i) => i.kind);
      assert.ok(kinds.every((kind) => kind !== 'slag_pour'),
        `${typeId} must not schedule a foundry slag-pour side event`);
    }
  }
});

test('the slag_pour render grammar carries a matching profile and draws a viscous slag run', () => {
  const profile = resolveStationSideEventVfxProfile('slag_pour');
  assert.ok(profile, 'slag_pour has a render profile (a null profile would draw nothing)');
  assert.ok(Object.isFrozen(profile), 'slag_pour profile is immutable');
  assert.equal(profile.id, 'slag_pour');
  assert.ok(profile.silhouette && profile.silhouette.length > 0, 'slag_pour has a distinct silhouette');
  assert.ok(profile.trajectory && profile.trajectory.length > 0, 'slag_pour has a distinct trajectory');
  assert.ok(profile.accent && profile.accent.length > 0, 'slag_pour has a distinct accent');

  const articulation = resolveStationArmArticulation('slag_pour');
  assert.ok(articulation, 'slag_pour provides station hardware articulation');
  assert.ok(articulation.amplitude > 0, 'slag_pour arm articulation has positive amplitude');

  const scratch = createStationSideEventVfxFrameScratch();

  // Reduced motion: stable operation pose preserved across time
  const earlyReduced = writeStationSideEventVfxFrame(
    profile, 2, 50, -480, 720, -480, 900, -480, 720, 0, true, scratch,
  );
  const pose = { x: earlyReduced.x, z: earlyReduced.z, dirX: earlyReduced.dirX, dirZ: earlyReduced.dirZ };
  const lateReduced = writeStationSideEventVfxFrame(
    profile, 25, 50, -480, 720, -480, 900, -480, 720, 0, true, scratch,
  );
  assert.strictEqual(earlyReduced, scratch, 'writer reuses scratch object');
  assert.strictEqual(lateReduced, scratch, 'writer reuses scratch object');
  assert.deepEqual(
    { x: lateReduced.x, z: lateReduced.z, dirX: lateReduced.dirX, dirZ: lateReduced.dirZ },
    pose,
    'reduced motion must preserve a stable operation pose',
  );
  assert.ok(lateReduced.emitStep > 0, 'reduced motion retains low-cadence readability cues');

  // Normal motion: slag run moves outward along the channel
  const earlyNormal = writeStationSideEventVfxFrame(
    profile, 5, 50, -480, 720, -480, 900, -480, 720, 0, false, scratch,
  );
  const earlyNormalPose = { x: earlyNormal.x, z: earlyNormal.z };
  const lateNormal = writeStationSideEventVfxFrame(
    profile, 30, 50, -480, 720, -480, 900, -480, 720, 0, false, scratch,
  );
  assert.notDeepEqual(
    { x: lateNormal.x, z: lateNormal.z },
    earlyNormalPose,
    'normal motion advances the slag stream down the channel',
  );
  assert.ok(lateNormal.emitStep > 0, 'normal motion emits at cadence');
});

test('on seed 4242 the Vesta foundry schedules slag_pour and produces its VFX record on schedule', () => {
  const harness = makeHarness({ seed: 4242 });
  const fired = [];
  harness.bus.on('station:sideEvent', (p) => fired.push(p));

  // Advance simulation to the scheduled slag_pour time (~148.4s)
  for (let t = 0; t <= 160; t++) {
    harness.state.simTime = t;
    harness.state.tick = t * 60;
    harness.director.update(1, harness.state);
    harness.system.update(1);
  }

  const pourEvent = fired.find((e) => e.kind === 'slag_pour');
  assert.ok(pourEvent, 'station:sideEvent must fire for slag_pour on schedule');
  assert.equal(pourEvent.stationId, 'station_forge');
  assert.equal(pourEvent.budget, 0);

  // The VFX consumer accepted and holds the active VFX record
  const record = harness.system._stationSideEventSlots.find(
    (slot) => slot.alive && slot.kind === 'slag_pour',
  );
  assert.ok(record, 'the VFX system must produce an active VFX record for slag_pour');
  assert.equal(record.stationId, 'station_forge');
  assert.ok(record.duration > 0, 'record has valid duration');
  assert.ok(Number.isFinite(record.fromX) && Number.isFinite(record.fromZ));
  assert.ok(Number.isFinite(record.toX) && Number.isFinite(record.toZ));

  harness.director.destroy();
  harness.system.destroy();
});
