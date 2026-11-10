// PQ-027.03 — a jammed Ceres hangar aperture holds a full-burn reinforcement for ≥ 20 s.
// The stuffed hull occupies the mouth; an inward cone moves mass. Not a spawn-flag aura.
// Skip capture.
import assert from 'node:assert/strict';
import test from 'node:test';

import { FIELD_FLAGS } from '../src/data/fields.js';
import {
  APERTURE_CYCLE,
  APERTURE_DIR,
  APERTURE_EXIT_ALONG,
  APERTURE_HOLD_FIELD,
  APERTURE_JAM_HOLD_S,
  APERTURE_PINCH_FIELD,
  APERTURE_SEAT_SPEED,
  APERTURE_SECTOR_ID,
  apertureAlong,
  aperturePhase,
  aperturePoint,
  isApertureOccupant,
  pointInsideApertureMouth,
} from '../src/data/environmentalMachinery.js';
import { environmentalMachinery } from '../src/systems/environmentalMachinery.js';
import { terrainAnchors } from '../src/systems/terrainAnchors.js';
import { fields } from '../src/systems/fields.js';
import { bootRealPath } from '../scripts/lib/bench/realPath.mjs';
import { normalizeField, sampleFieldAcceleration } from '../src/core/fields/fieldKernel.js';
import { writePhysicsControl } from '../src/core/physicsAuthority.js';

const LONG = { timeout: 180_000 };
const PLAYER_HULL_ID = 'ship_kestrel';
const REINFORCE_HULL_ID = 'ship_wasp';
const HOLD_TICKS = Math.round(APERTURE_JAM_HOLD_S * 60);
const OPEN_TICKS = 300;
const EXIT_ROT = Math.atan2(APERTURE_DIR.z, APERTURE_DIR.x);
const LAUNCH_FORCE = 640;

function jamWreck() {
  return {
    pos: aperturePoint(0, 0),
    radius: 26,
    mass: 9000,
    dynamic: false,
    data: { apertureJamHull: true },
  };
}

function reinforcementPose() {
  return aperturePoint(-48, 0);
}

function playerPose() {
  return aperturePoint(-8, 48);
}

test('the hangar door locks on a schedule and a stuffed hull jams the open window', () => {
  assert.equal(aperturePhase(1).phase, 'open');
  assert.equal(aperturePhase(1).fieldStrengthScale, 0);
  assert.equal(aperturePhase(APERTURE_CYCLE.openS + 0.4).phase, 'closing');
  assert.equal(aperturePhase(APERTURE_CYCLE.openS + 0.4).fieldActive, true);
  assert.equal(aperturePhase(APERTURE_CYCLE.openS + 0.4).fieldStrengthScale, 0);
  const lockedAt = APERTURE_CYCLE.openS + APERTURE_CYCLE.closingS + 0.4;
  assert.equal(aperturePhase(lockedAt).phase, 'locked');
  assert.equal(aperturePhase(lockedAt).fieldStrengthScale, 1);

  const jamStart = 8;
  const jammed = aperturePhase(jamStart, { occupied: true, jammedAtS: jamStart });
  assert.equal(jammed.phase, 'jam');
  assert.equal(jammed.fieldStrengthScale, 1);
  const stillHeld = aperturePhase(jamStart + APERTURE_JAM_HOLD_S - 0.05, {
    occupied: false,
    jammedAtS: jamStart,
  });
  assert.equal(stillHeld.phase, 'jam', 'the jam hold lasts 20 s after the wreck seats');
  const released = aperturePhase(jamStart + APERTURE_JAM_HOLD_S + 0.05, {
    occupied: false,
    jammedAtS: jamStart,
  });
  assert.equal(released.phase, 'open', 'after 20 s the open window can launch again');

  assert.equal(pointInsideApertureMouth(aperturePoint(0, 0)), true);
  assert.equal(pointInsideApertureMouth(aperturePoint(-56, 0)), false);
  assert.equal(isApertureOccupant({
    type: 'asteroid', alive: true, collides: true, pos: aperturePoint(0, 0),
  }), true);
  assert.equal(isApertureOccupant({
    type: 'asteroid', alive: true, collides: true, pos: aperturePoint(0, 0),
    data: { aperturePlugId: 'x' },
  }), false);
  assert.equal(isApertureOccupant({
    type: 'ship', alive: true, collides: true, pos: aperturePoint(0, 0),
    vel: { x: APERTURE_DIR.x * 40, z: APERTURE_DIR.z * 40 },
  }), false, 'a launching fighter is traffic, not a jammed hull');
  assert.equal(isApertureOccupant({
    type: 'wreck', alive: true, collides: true, pos: aperturePoint(0, 0),
  }), true);
  assert.equal(isApertureOccupant({
    type: 'ship', alive: true, collides: true, pos: aperturePoint(0, 0),
    vel: { x: APERTURE_SEAT_SPEED + 1, z: 0 },
  }), false,
  'a ship in the mouth with speed > APERTURE_SEAT_SPEED is not an occupant');

  const hold = normalizeField({ ...APERTURE_HOLD_FIELD });
  const inside = aperturePoint(-48, 0);
  const accel = sampleFieldAcceleration(inside, { x: 0, z: 0 }, [hold], 1, {
    mass: 16, type: 'ship', marked: false,
  }, { ax: 0, az: 0 });
  const inward = accel.ax * APERTURE_HOLD_FIELD.dir.x + accel.az * APERTURE_HOLD_FIELD.dir.z;
  assert.ok(inward > 40, `hold cone must shove reinforcements into the bay (got ${inward.toFixed(1)})`);
});

test('runtime registers the hold cone from occupancy during the open window', () => {
  const events = [];
  const fieldBag = {
    byId: Object.create(null),
    registerEnvironmental(spec) { this.byId[spec.id] = { ...spec }; return this.byId[spec.id]; },
    updateExternal(id, patch) { Object.assign(this.byId[id], patch); return this.byId[id]; },
    unregisterExternal(id) { const had = !!this.byId[id]; delete this.byId[id]; return had; },
    hasExternal(id) { return !!this.byId[id]; },
  };
  const wreck = {
    id: 9, type: 'asteroid', alive: true, collides: true, pos: aperturePoint(0, 0),
  };
  const state = {
    mode: 'flight', tick: 480, simTime: 8, playerId: 1, entityList: [wreck],
    world: { currentSectorId: APERTURE_SECTOR_ID },
    entities: new Map([[1, {
      id: 1, type: 'ship', alive: true, pos: playerPose(),
    }]]),
    sites: { worldOrder: [], worldById: {} },
  };
  const bus = {
    on() { return () => {}; },
    emit(name, payload) { events.push({ name, payload }); },
  };
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
    assert.ok(hold, 'jam during the open window still registers the hold cone');
    assert.equal(hold.kind, 'cone');
    assert.ok(hold.strength > 0, 'jam writes force, not a spawn lock');
    assert.ok(fieldBag.byId[APERTURE_PINCH_FIELD.id], 'jam also pinches the mouth shut');
    assert.equal(events.some((entry) => entry.name === 'environmentalMachinery:ensureAperturePlug'), false,
      'the stuffed hull is the door; do not stack a second plug on it');
    assert.equal(system.diagnostics(state).aperture.phase, 'jam');

    state.entityList = [];
    state.simTime = 8 + APERTURE_JAM_HOLD_S + 0.2;
    state.tick = Math.round(state.simTime * 60);
    system.update(1 / 60, state);
    assert.equal(fieldBag.byId[APERTURE_HOLD_FIELD.id], undefined, 'the hold ends after 20 s without occupancy');
  } finally {
    system.destroy();
    FIELD_FLAGS.enabled = previous;
  }
});

async function runBay({ jam, ticks }) {
  const previousFields = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;
  const origin = reinforcementPose();
  const host = await bootRealPath({
    seed: 2703,
    systems: [
      'actions',
      environmentalMachinery,
      fields,
      'physics',
      terrainAnchors,
    ],
    hulls: [{
      hullId: PLAYER_HULL_ID,
      pos: playerPose(),
      rot: 0,
      isPlayer: true,
      factionId: 'faction_free',
    }],
  });
  try {
    host.state.world = host.state.world || {};
    host.state.world.currentSectorId = APERTURE_SECTOR_ID;
    host.state.simTime = 1;
    if (jam) host.spawnObstacle(jamWreck());
    const reinforcement = host.spawnShip({
      hullId: REINFORCE_HULL_ID,
      pos: origin,
      rot: EXIT_ROT,
      team: 1,
      factionId: 'faction_dmc',
    });
    reinforcement.data = reinforcement.data || {};
    reinforcement.data.intent = { throttle: 1, moveZ: 1, aimAngle: EXIT_ROT };
    reinforcement.data.reinforcement = true;
    host.step(1, {
      before({ state }) {
        state.world.currentSectorId = APERTURE_SECTOR_ID;
        state.simTime = 1;
        writePhysicsControl(reinforcement, {
          source: 'npc-flight-v3',
          mode: 'thrust',
          force: { x: APERTURE_DIR.x * LAUNCH_FORCE, y: 0, z: APERTURE_DIR.z * LAUNCH_FORCE },
          maxSpeed: Infinity,
        });
      },
    });
    host.assertBodies([host.player, reinforcement], jam ? 'jammed bay bodies' : 'open bay bodies');
    let crossedAt = null;
    let minAlong = apertureAlong(reinforcement.pos);
    let maxAlong = minAlong;
    host.step(ticks, {
      before({ state }) {
        state.world.currentSectorId = APERTURE_SECTOR_ID;
        state.simTime = 1;
        writePhysicsControl(reinforcement, {
          source: 'npc-flight-v3',
          mode: 'thrust',
          force: { x: APERTURE_DIR.x * LAUNCH_FORCE, y: 0, z: APERTURE_DIR.z * LAUNCH_FORCE },
          maxSpeed: Infinity,
        });
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
    return {
      crossedAt,
      minAlong,
      maxAlong,
      along: apertureAlong(reinforcement.pos),
      alive: reinforcement.alive !== false,
    };
  } finally {
    host.dispose();
    FIELD_FLAGS.enabled = previousFields;
  }
}

test('a jammed aperture holds a full-burn reinforcement for 20 s; the open door does not', LONG, async () => {
  const open = await runBay({ jam: false, ticks: OPEN_TICKS });
  assert.ok(open.crossedAt != null && open.crossedAt < 5,
    `open bay must launch the reinforcement (crossed at ${open.crossedAt}, along=${open.along.toFixed(1)}, max=${open.maxAlong.toFixed(1)})`);

  const jammed = await runBay({ jam: true, ticks: HOLD_TICKS });
  assert.equal(jammed.crossedAt, null,
    `jam must hold the reinforcement inside for 20 s (along=${jammed.along.toFixed(1)}, max=${jammed.maxAlong.toFixed(1)})`);
  assert.ok(jammed.along < APERTURE_EXIT_ALONG,
    `reinforcement stayed in the bay (${jammed.along.toFixed(1)} < ${APERTURE_EXIT_ALONG})`);
  console.log(`PQ-027.03 jammed hold ${APERTURE_JAM_HOLD_S}s along=${jammed.along.toFixed(2)} max=${jammed.maxAlong.toFixed(2)}; open crossed at ${open.crossedAt.toFixed(2)}s`);
});
