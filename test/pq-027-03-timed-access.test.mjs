// PQ-027.03 — timed access. The Ceres hangar door is a readable window: open,
// closing telegraph, locked bite. The player shoves a wreck into the mouth
// and the jam holds a full-burn reinforcement for ≥ 20 s. Mass, not a spawn lock.
import assert from 'node:assert/strict';
import test from 'node:test';

import { bootRealPath, writeRealPathInput } from '../scripts/lib/bench/realPath.mjs';
import { writePhysicsControl } from '../src/core/physicsAuthority.js';
import { FIELD_FLAGS } from '../src/data/fields.js';
import { hazardHints } from '../src/data/hazardLanguage.js';
import {
  APERTURE_CYCLE,
  APERTURE_DIR,
  APERTURE_EXIT_ALONG,
  APERTURE_HOLD_FIELD,
  APERTURE_ID,
  APERTURE_INTERIOR_DIR,
  APERTURE_JAM_HOLD_S,
  APERTURE_PINCH_FIELD,
  APERTURE_SECTOR_ID,
  apertureAlong,
  aperturePhase,
  aperturePoint,
  isApertureOccupant,
  pointInsideApertureMouth,
} from '../src/data/environmentalMachinery.js';
import { environmentalMachinery } from '../src/systems/environmentalMachinery.js';
import { fields } from '../src/systems/fields.js';
import { terrainAnchors } from '../src/systems/terrainAnchors.js';

const LONG = { timeout: 180_000 };
const SEED = 2703;
const PROFILE_ID = 'production';
const PLAYER_HULL_ID = 'ship_kestrel';
const REINFORCE_HULL_ID = 'ship_wasp';
const HOLD_TICKS = Math.round(APERTURE_JAM_HOLD_S * 60);
const OPEN_TICKS = 300;
const RAM_TICKS = 48;
const EXIT_ROT = Math.atan2(APERTURE_DIR.z, APERTURE_DIR.x);
const INTERIOR_ROT = Math.atan2(APERTURE_INTERIOR_DIR.z, APERTURE_INTERIOR_DIR.x);
const LAUNCH_FORCE = 640;

function playerRamPose() {
  return aperturePoint(38, 4);
}

function playerWatchPose() {
  return aperturePoint(-8, 48);
}

function wreckPose() {
  return aperturePoint(18, 0);
}

function reinforcementPose() {
  return aperturePoint(-48, 0);
}

function spawnPlayerWreck(host, pos) {
  return host.runtime.spawn({
    type: 'wreck',
    pos: { x: pos.x, z: pos.z },
    vel: { x: 0, z: 0 },
    radius: 24,
    mass: 1100,
    collides: true,
    hull: 400,
    hullMax: 400,
    physicsBody: {
      schemaVersion: 1,
      radius: 24,
      mass: 1100,
      inertiaY: 400,
      dynamic: true,
      ccd: true,
      material: 'debris',
      revision: 0,
    },
    data: { apertureJamHull: true, playerShove: true },
  });
}

test('PQ-027.03 the hangar window is a schedule a player can read', () => {
  assert.equal(aperturePhase(1).phase, 'open');
  assert.ok(aperturePhase(1).remainingS > 10, 'open names how long the bay still launches');
  assert.equal(aperturePhase(1).fieldStrengthScale, 0);

  const closingAt = APERTURE_CYCLE.openS + 0.4;
  assert.equal(aperturePhase(closingAt).phase, 'closing');
  assert.equal(aperturePhase(closingAt).fieldActive, true);
  assert.equal(aperturePhase(closingAt).fieldStrengthScale, 0, 'closing telegraphs with no force');
  assert.ok(aperturePhase(closingAt).remainingS > 0);

  const lockedAt = APERTURE_CYCLE.openS + APERTURE_CYCLE.closingS + 0.4;
  assert.equal(aperturePhase(lockedAt).phase, 'locked');
  assert.equal(aperturePhase(lockedAt).fieldStrengthScale, 1);
  assert.ok(aperturePhase(lockedAt).remainingS > 0);

  const jamStart = 8;
  const jammed = aperturePhase(jamStart, { occupied: true, jammedAtS: jamStart });
  assert.equal(jammed.phase, 'jam');
  assert.ok(jammed.remainingS >= APERTURE_JAM_HOLD_S);
  const stillHeld = aperturePhase(jamStart + APERTURE_JAM_HOLD_S - 0.05, {
    occupied: false,
    jammedAtS: jamStart,
  });
  assert.equal(stillHeld.phase, 'jam');
  const released = aperturePhase(jamStart + APERTURE_JAM_HOLD_S + 0.05, {
    occupied: false,
    jammedAtS: jamStart,
  });
  assert.equal(released.phase, 'open');
  assert.notEqual(APERTURE_HOLD_FIELD.kind, 'radiation');
  assert.notEqual(APERTURE_PINCH_FIELD.kind, 'radiation');
});

test('PQ-027.03 closing telegraphs a zero-strength door before the bite', () => {
  const events = [];
  const fieldBag = {
    byId: Object.create(null),
    registerEnvironmental(spec) { this.byId[spec.id] = { ...spec }; return this.byId[spec.id]; },
    updateExternal(id, patch) { Object.assign(this.byId[id], patch); return this.byId[id]; },
    unregisterExternal(id) { const had = !!this.byId[id]; delete this.byId[id]; return had; },
    hasExternal(id) { return !!this.byId[id]; },
  };
  const closingAt = APERTURE_CYCLE.openS + 0.4;
  const state = {
    mode: 'flight', tick: Math.round(closingAt * 60), simTime: closingAt, playerId: 1, entityList: [],
    world: { currentSectorId: APERTURE_SECTOR_ID },
    entities: new Map([[1, {
      id: 1, type: 'ship', alive: true, pos: aperturePoint(0, 0),
    }]]),
    sites: { worldOrder: [], worldById: {} },
  };
  const bus = { on() { return () => {}; }, emit(name, payload) { events.push({ name, payload }); } };
  const system = Object.create(environmentalMachinery);
  const previous = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;
  try {
    system.init({
      state, bus,
      registry: { get(name) { return name === 'fields' ? fieldBag : null; } },
    });
    system.update(1 / 60, state);
    const hold = fieldBag.byId[APERTURE_HOLD_FIELD.id];
    assert.ok(hold, 'closing registers the door volume');
    assert.equal(hold.strength, 0, 'closing is a telegraph, not a bite');
    const clock = events.find((entry) => (
      entry.name === 'environmentalMachinery:phaseChanged' && entry.payload && entry.payload.siteId === APERTURE_ID
    ));
    assert.ok(clock, 'the window speaks remaining time');
    assert.equal(clock.payload.phase, 'closing');
    assert.ok(clock.payload.remainingS > 0);
    const enter = events.find((entry) => entry.name === 'hazard:enter' && entry.payload && entry.payload.zoneId === APERTURE_ID);
    assert.ok(enter, 'standing in the mouth during closing is readable');
    assert.equal(enter.payload.phase, 'closing');
    assert.ok(enter.payload.remainingS > 0);
  } finally {
    system.destroy();
    FIELD_FLAGS.enabled = previous;
  }
});

function burnOut(reinforcement) {
  writePhysicsControl(reinforcement, {
    source: 'npc-flight-v3',
    mode: 'thrust',
    force: { x: APERTURE_DIR.x * LAUNCH_FORCE, y: 0, z: APERTURE_DIR.z * LAUNCH_FORCE },
    maxSpeed: Infinity,
  });
}

async function runBay({ playerShove, ticks }) {
  const previousFields = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;
  const origin = reinforcementPose();
  const host = await bootRealPath({
    seed: SEED,
    profileId: PROFILE_ID,
    systems: [
      'actions',
      'flightV3',
      environmentalMachinery,
      fields,
      hazardHints,
      terrainAnchors,
      'physics',
    ],
    hulls: [{
      hullId: PLAYER_HULL_ID,
      pos: playerShove ? playerRamPose() : playerWatchPose(),
      rot: INTERIOR_ROT,
      isPlayer: true,
      factionId: 'faction_free',
    }, {
      hullId: REINFORCE_HULL_ID,
      pos: origin,
      rot: EXIT_ROT,
      team: 1,
      factionId: 'faction_dmc',
    }],
  });
  try {
    host.state.world = host.state.world || {};
    host.state.world.currentSectorId = APERTURE_SECTOR_ID;
    host.state.simTime = 1;
    const phases = [];
    host.bus.on('environmentalMachinery:phaseChanged', (payload) => {
      if (payload && payload.siteId === APERTURE_ID) phases.push(payload);
    });
    host.step(1, {
      before({ state }) {
        state.world.currentSectorId = APERTURE_SECTOR_ID;
        state.simTime = 1;
      },
    });
    const wreck = playerShove ? spawnPlayerWreck(host, wreckPose()) : null;
    if (wreck) {
      host.step(1, {
        before({ state }) {
          state.world.currentSectorId = APERTURE_SECTOR_ID;
          state.simTime = 1;
        },
      });
    }
    const reinforcement = host.hulls[1];
    reinforcement.data = reinforcement.data || {};
    reinforcement.data.intent = { throttle: 1, moveZ: 1, aimAngle: EXIT_ROT };
    reinforcement.data.reinforcement = true;
    const bodies = wreck ? [host.player, wreck, reinforcement] : [host.player, reinforcement];
    host.assertBodies(bodies, playerShove ? 'player jam bodies' : 'open bay bodies');
    let wreckSeated = false;
    let playerHitWreck = false;
    const wreckAlong0 = wreck ? apertureAlong(wreck.pos) : null;
    if (wreck) {
      host.step(RAM_TICKS, {
        before({ state }) {
          state.world.currentSectorId = APERTURE_SECTOR_ID;
          state.simTime = 1;
          writeRealPathInput(state, { moveZ: 1 });
        },
        after() {
          const dx = wreck.pos.x - host.player.pos.x;
          const dz = wreck.pos.z - host.player.pos.z;
          const limit = (wreck.radius || 0) + (host.player.radius || 0) + 2;
          if (dx * dx + dz * dz <= limit * limit) playerHitWreck = true;
          if (pointInsideApertureMouth(wreck.pos) || isApertureOccupant(wreck)) {
            wreckSeated = true;
            if (playerHitWreck) return false;
          }
        },
      });
      host.step(18, {
        before({ state }) {
          state.world.currentSectorId = APERTURE_SECTOR_ID;
          state.simTime = 1;
          writeRealPathInput(state, { brake: true });
        },
      });
    }
    host.step(1, {
      before({ state }) {
        state.world.currentSectorId = APERTURE_SECTOR_ID;
        state.simTime = 1;
        writeRealPathInput(state, { brake: true });
        burnOut(reinforcement);
      },
    });
    let crossedAt = null;
    let minAlong = apertureAlong(reinforcement.pos);
    let maxAlong = minAlong;
    host.step(ticks, {
      before({ state }) {
        state.world.currentSectorId = APERTURE_SECTOR_ID;
        state.simTime = 1;
        writeRealPathInput(state, { brake: true });
        burnOut(reinforcement);
      },
      after({ index }) {
        const along = apertureAlong(reinforcement.pos);
        minAlong = Math.min(minAlong, along);
        maxAlong = Math.max(maxAlong, along);
        if (crossedAt == null && along >= APERTURE_EXIT_ALONG) {
          crossedAt = (index + 1) / 60;
          return false;
        }
        return undefined;
      },
    });
    const machinery = host.runtime.getSystem('environmentalMachinery');
    const aperture = machinery && typeof machinery.diagnostics === 'function'
      ? machinery.diagnostics(host.state).aperture
      : null;
    const read = host.state.ui && host.state.ui.hazardRead;
    return {
      crossedAt,
      minAlong,
      maxAlong,
      along: apertureAlong(reinforcement.pos),
      alive: reinforcement.alive !== false,
      wreckSeated,
      playerHitWreck,
      wreckAlong0,
      wreckAlong: wreck ? apertureAlong(wreck.pos) : null,
      wreckInMouth: wreck ? pointInsideApertureMouth(wreck.pos) : false,
      wreckOccupant: wreck ? isApertureOccupant(wreck) : false,
      jammed: aperture && aperture.phase === 'jam',
      remainingS: aperture && aperture.remainingS,
      phase: aperture && aperture.phase,
      hazardPhase: read && read.phase,
      hazardRemainingS: read && read.remainingS,
      phaseEvents: phases.slice(),
      proof: host.proof(),
    };
  } finally {
    host.dispose();
    FIELD_FLAGS.enabled = previousFields;
  }
}

test('PQ-027.03 seed 2703 the player shoves a wreck in; the jam holds 20 s', LONG, async () => {
  const open = await runBay({ playerShove: false, ticks: OPEN_TICKS });
  assert.equal(open.proof.backend, 'rapier-dynamic');
  assert.ok(open.crossedAt != null && open.crossedAt < 5,
    `open bay must launch (crossed at ${open.crossedAt}, along=${open.along.toFixed(1)}, max=${open.maxAlong.toFixed(1)})`);

  const jammed = await runBay({ playerShove: true, ticks: HOLD_TICKS });
  console.log([
    `PQ-027.03 seed=${SEED}`,
    `playerHit=${jammed.playerHitWreck}`,
    `wreckSeated=${jammed.wreckSeated}`,
    `wreckAlong0=${Number(jammed.wreckAlong0).toFixed(2)}`,
    `wreckAlong=${Number(jammed.wreckAlong).toFixed(2)}`,
    `occupant=${jammed.wreckOccupant}`,
    `phase=${jammed.phase}`,
    `remainingS=${Number(jammed.remainingS).toFixed(2)}`,
    `holdAlong=${jammed.along.toFixed(2)}`,
    `maxAlong=${jammed.maxAlong.toFixed(2)}`,
    `openCrossed=${open.crossedAt && open.crossedAt.toFixed(2)}`,
    `backend=${jammed.proof.backend}`,
  ].join(' '));

  assert.equal(jammed.proof.backend, 'rapier-dynamic');
  assert.equal(jammed.playerHitWreck, true, 'the player\'s hull starts the jam');
  assert.equal(jammed.wreckSeated, true, 'the shove seats the wreck in the mouth');
  assert.equal(jammed.jammed, true);
  assert.ok(jammed.remainingS >= APERTURE_JAM_HOLD_S - 0.05, `jam window readable (${jammed.remainingS})`);
  assert.equal(jammed.crossedAt, null,
    `jam must hold the reinforcement inside for 20 s (along=${jammed.along.toFixed(1)}, max=${jammed.maxAlong.toFixed(1)})`);
  assert.ok(jammed.along < APERTURE_EXIT_ALONG,
    `reinforcement stayed in the bay (${jammed.along.toFixed(1)} < ${APERTURE_EXIT_ALONG})`);
});
