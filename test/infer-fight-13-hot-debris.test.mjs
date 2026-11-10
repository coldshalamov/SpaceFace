// FIGHT-13 — fresh capital debris is dangerous for its first seconds, then it is
// salvage. Seed 4242 throughout; sim clock only, no wall time.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { makeEntity } from '../src/core/entity.js';
import { COMBAT_FLAGS } from '../src/data/featureFlags.js';
import { collisionConsequences } from '../src/systems/collisionConsequences.js';
import {
  CAPITAL_HOT_DEBRIS_LAW,
  hotDebrisContactScale,
  isCapitalHotDebris,
  resetPendingSlams,
  spawnFracturePieces,
} from '../src/systems/hullFracture.js';

const SEED = 4242;
const T0 = 500;
const CAPITAL_MASS = 800; // >= capital band floor (aiPorts 'capital' starts at 700)
const MEDIUM_MASS = 45;

function bootHarness(seed = SEED) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.tick = 500;
  state.simTime = T0;
  state.world.currentSectorId = 'sector-test';
  const bus = createBus();
  const helpers = {
    spawnEntity(spec) {
      const entity = makeEntity(spec);
      entity.id = state.nextEntityId++;
      entity.alive = true;
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
  return { state, bus, helpers };
}

function bootSystem(h) {
  const applied = [];
  const consequences = Object.create(collisionConsequences);
  consequences.init({
    state: h.state,
    bus: h.bus,
    helpers: h.helpers,
    registry: {
      get: (id) => (id === 'combat' ? {
        kernel: {
          routeDamage(packet) {
            applied.push(packet);
            return { ok: true };
          },
        },
      } : null),
    },
  });
  return { consequences, applied };
}

function makeShip(h, { mass = 40, radius = 12, vx = 0, vz = 0 } = {}) {
  return h.helpers.spawnEntity({
    type: 'ship', team: 1,
    pos: { x: 0, z: 0 }, vel: { x: vx, z: vz }, angVel: 0.1,
    radius, mass, hull: 80, hullMax: 100,
    data: { defId: 'ship_test' },
  });
}

function fractureCapital(h, mass, vel = { x: 30, z: 0 }) {
  const victim = makeShip(h, { mass, radius: 24, vx: vel.x, vz: vel.z });
  const out = spawnFracturePieces(
    { state: h.state, helpers: h.helpers, bus: h.bus },
    {
      victimId: victim.id,
      tick: h.state.tick,
      pos: { x: victim.pos.x, z: victim.pos.z },
      vel: { x: victim.vel.x, z: victim.vel.z },
      angVel: victim.angVel,
      mass,
      radius: 24,
    },
  );
  assert.ok(out && out.pieces.length === 2, 'authored split still yields exactly two pieces');
  return out.pieces;
}

// A hard contact so the kernel authors real debris-surface damage for the target ship.
const CONTACT = {
  pos: { x: 5, z: 0 }, normal: { x: 1, z: 0 },
  preSolveClosingSpeed: 60, tick: 500, kind: 'contact',
};

function strike(consequences, victim, fragment, simTime) {
  consequences.state.simTime = simTime;
  consequences._resolveTarget(victim, fragment, CONTACT, 40000, 500, null, false, false);
}

function kineticOf(applied, index) {
  const arg = applied[index];
  assert.ok(arg && arg.packet, 'a damage packet must have been routed');
  return Number(arg.packet.channels.kinetic) || 0;
}

describe('FIGHT-13 hot capital debris (seed 4242)', { concurrency: false }, () => {
  const previousFlag = COMBAT_FLAGS.weaponImpulseConsequences;
  COMBAT_FLAGS.weaponImpulseConsequences = true;
  process.on('exit', () => { COMBAT_FLAGS.weaponImpulseConsequences = previousFlag; });

  it('a capital kill fractures into two stamped-hot pieces on the authored window', () => {
    resetPendingSlams();
    const h = bootHarness();
    const { consequences } = bootSystem(h);
    try {
      const pieces = fractureCapital(h, CAPITAL_MASS);
      assert.equal(pieces.length, 2, 'fragment counts are untouched');
      for (const piece of pieces) {
        assert.equal(piece.type, 'wreck');
        assert.equal(isCapitalHotDebris(piece), true, 'capital fragments carry the hot stamp');
        assert.equal(piece.data.debrisHotT0, T0, 'hot window starts on the sim clock');
        assert.equal(piece.data.debrisHotWindowS, CAPITAL_HOT_DEBRIS_LAW.windowS);
      }
      // Same seed, same seam: the hot stamp changes no authored choice.
      const runSeam = () => {
        const g = bootHarness();
        const victim = makeShip(g, { mass: CAPITAL_MASS, radius: 24, vx: 30 });
        const out = spawnFracturePieces(
          { state: g.state, helpers: g.helpers, bus: g.bus },
          { victimId: victim.id, tick: g.state.tick, pos: { x: 0, z: 0 },
            vel: { x: 30, z: 0 }, angVel: 0.1, mass: CAPITAL_MASS, radius: 24 },
        );
        return out && out.seam && out.seam.id;
      };
      assert.equal(runSeam(), runSeam(), 'same seed must pick the same seam');
    } finally {
      consequences.destroy();
      h.bus.clear();
      resetPendingSlams();
    }
  });

  it('contact scale is full at birth, decays over the window, and is none after', () => {
    resetPendingSlams();
    const h = bootHarness();
    const { consequences } = bootSystem(h);
    try {
      const [fragment] = fractureCapital(h, CAPITAL_MASS);
      const span = CAPITAL_HOT_DEBRIS_LAW.windowS;
      const fresh = hotDebrisContactScale(fragment, T0);
      const mid = hotDebrisContactScale(fragment, T0 + span / 2);
      const edge = hotDebrisContactScale(fragment, T0 + span);
      const late = hotDebrisContactScale(fragment, T0 + span + 1);
      assert.equal(fresh, 1, 'a fresh fragment deals full contact damage');
      assert.ok(mid > 0 && mid < fresh, `damage decays inside the window (mid=${mid})`);
      assert.ok(Math.abs(mid - 0.5) < 1e-9, `linear decay pins the midpoint (mid=${mid})`);
      assert.equal(edge, 0, 'an expired fragment deals none');
      assert.equal(late, 0, 'a long-settled fragment deals none');
    } finally {
      consequences.destroy();
      h.bus.clear();
      resetPendingSlams();
    }
  });

  it('a settled fragment is cold even inside its window; lesser hulls never run hot', () => {
    resetPendingSlams();
    const h = bootHarness();
    const { consequences } = bootSystem(h);
    try {
      const [fragment] = fractureCapital(h, CAPITAL_MASS);
      fragment.vel.x = 0;
      fragment.vel.z = 0;
      assert.equal(hotDebrisContactScale(fragment, T0 + 1), 0,
        'a settled fragment deals none even inside the window');
      const [medium] = fractureCapital(h, MEDIUM_MASS);
      assert.equal(isCapitalHotDebris(medium), false, 'lesser hulls carry no hot stamp');
      assert.equal(hotDebrisContactScale(medium, T0), 1, 'ordinary debris keeps its authored damage');
    } finally {
      consequences.destroy();
      h.bus.clear();
      resetPendingSlams();
    }
  });

  it('the live contact path routes decaying damage while hot and none while cold', () => {
    resetPendingSlams();
    const h = bootHarness();
    const { consequences, applied } = bootSystem(h);
    try {
      const [fragment] = fractureCapital(h, CAPITAL_MASS);
      const span = CAPITAL_HOT_DEBRIS_LAW.windowS;
      const victim = makeShip(h, { mass: 40 });

      strike(consequences, victim, fragment, T0);
      const freshDamage = kineticOf(applied, 0);
      assert.ok(freshDamage > 0, 'a fresh capital fragment deals contact damage');

      strike(consequences, victim, fragment, T0 + span / 2);
      const midDamage = kineticOf(applied, 1);
      assert.ok(midDamage > 0 && midDamage < freshDamage,
        `routed damage decays over the window (fresh=${freshDamage} mid=${midDamage})`);

      const beforeExpired = applied.length;
      strike(consequences, victim, fragment, T0 + span);
      assert.equal(applied.length, beforeExpired, 'an expired fragment routes no damage');

      const beforeSettled = applied.length;
      fragment.vel.x = 0;
      fragment.vel.z = 0;
      strike(consequences, victim, fragment, T0 + 1);
      assert.equal(applied.length, beforeSettled, 'a settled fragment routes no damage');
    } finally {
      consequences.destroy();
      h.bus.clear();
      resetPendingSlams();
    }
  });
});
