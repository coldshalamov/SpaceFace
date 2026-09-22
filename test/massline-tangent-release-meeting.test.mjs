import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createDamageRouter } from '../src/combat/damage.js';
import { createCombatCatalog } from '../src/combat/runtime.js';
import { MASSLINE2_FLAGS } from '../src/data/featureFlags.js';
import {
  TANGENT_MEETING_MAX_SPEED,
  masslineThrow,
  planTangentReleaseMeeting,
  selfSlingBonusDv,
} from '../src/systems/masslineThrow.js';
import {
  TANGENT_RELEASE_MIN_SPEED,
  TANGENT_RELEASE_MIN_TANGENCY,
  assessTangentRelease,
  tetherGameplay,
} from '../src/systems/tetherGameplay.js';

const DT = 1 / 60;
const SEEDS = [4242, 8008];

test('a taut tangent release is the swing, and a slack, radial, or slow cut is not', () => {
  const state = pairState({ phase: 'loaded', tangential: true });
  const release = assessTangentRelease(state, 2);
  assert.ok(release, 'a tight tangential cut is the release');
  assert.equal(release.taut, true);
  assert.ok(release.tangency >= TANGENT_RELEASE_MIN_TANGENCY);
  assert.ok(Math.abs(release.tangentialSpeed) >= TANGENT_RELEASE_MIN_SPEED);

  state.player.tether.phase = 'slack';
  assert.equal(assessTangentRelease(state, 2), null, 'a slack line is not a tangent release');

  state.player.tether.phase = 'overload';
  assert.equal(assessTangentRelease(state, 2).phase, 'overload', 'overload is still a rope, not a snap');

  state.player.tether.phase = 'loaded';
  state.entities.get(2).vel.x = 80;
  state.entities.get(2).vel.z = 40;
  state.entities.get(1).vel.x = 0;
  state.entities.get(1).vel.z = 40;
  assert.equal(assessTangentRelease(state, 2), null, 'a radial tow is not at the tangent');

  state.entities.get(2).vel.x = 0;
  state.entities.get(2).vel.z = 40 + 10;
  assert.equal(assessTangentRelease(state, 2), null, 'a slow swing is not the release');
});

test('the same taut release kills a lighter hull on both seeds without a rock on the ray', () => {
  const seen = [];
  for (const seed of SEEDS) {
    const outcome = drive(seed, 'tethered-hull');
    seen.push(outcome);
    assert.equal(outcome.draws, 0, `seed ${seed} does not roll the meeting`);
    assert.equal(outcome.hullId, 2, `seed ${seed} sends the lighter hull`);
    assert.equal(outcome.bodyId, 1, `seed ${seed} meets the coupled body, not the rock on the exit ray`);
    assert.notEqual(outcome.bodyId, 4);
    assert.equal(outcome.killed, true, `seed ${seed} meeting is lethal`);
    assert.equal(outcome.playerAlive, true);
    assert.equal(outcome.rockAlive, true, `seed ${seed} leaves the exit-ray rock alone`);
    assert.ok(outcome.closingSpeed > 0 && outcome.closingSpeed <= TANGENT_MEETING_MAX_SPEED);
    assert.equal(outcome.cutReason, 'tether_cut');
    assert.equal(outcome.broke, 0, 'the line is cut, not snapped');
    assert.equal(outcome.meeting.heat, undefined);
    assert.equal(outcome.meeting.stamina, undefined);
    assert.equal(outcome.meeting.breakTimer, undefined);
    assert.ok(Math.abs(outcome.aimX) > Math.abs(outcome.aimZ), 'the hull is aimed at the body, not along the tangent');
  }
  assert.equal(seen[0].bodyId, seen[1].bodyId);
  assert.equal(seen[0].hullId, seen[1].hullId);
  assert.equal(selfSlingBonusDv(seen[0].closingSpeed, 1, true), 0, 'the meeting is not a free speed bonus');
});

test('a swing on a heavy anchor still kills the nearby lighter hull on both seeds', () => {
  const seen = [];
  for (const seed of SEEDS) {
    const outcome = drive(seed, 'anchor-swing');
    seen.push(outcome);
    assert.equal(outcome.draws, 0, `seed ${seed} does not roll the anchor meeting`);
    assert.equal(outcome.hullId, 2, `seed ${seed} skips the closer hull the collision law cannot kill`);
    assert.equal(outcome.bodyId, 3, `seed ${seed} meets the anchor that was held, not the rock ahead`);
    assert.notEqual(outcome.bodyId, 4);
    assert.equal(outcome.killed, true, `seed ${seed} anchor meeting is lethal`);
    assert.equal(outcome.heavyAlive, true);
    assert.equal(outcome.heavyHull, 720);
    assert.equal(outcome.rockAlive, true);
    assert.equal(outcome.playerAlive, true);
    assert.equal(outcome.broke, 0);
  }
  assert.deepEqual(
    seen.map((row) => [row.hullId, row.bodyId, row.killed]),
    [[2, 3, true], [2, 3, true]],
  );
});

test('a slack cut and a radial cut leave the lighter hull alive', () => {
  for (const phase of ['slack', 'radial']) {
    const outcome = drive(4242, 'tethered-hull', { release: phase, ticks: 30 });
    assert.equal(outcome.killed, false, `${phase} does not invent a meeting`);
    assert.equal(outcome.meeting, null);
    assert.equal(outcome.enemyAlive, true);
  }
});

function drive(seed, layout, options = {}) {
  const prevEnabled = MASSLINE2_FLAGS.enabled;
  const prevThrow = MASSLINE2_FLAGS.throw;
  MASSLINE2_FLAGS.enabled = true;
  MASSLINE2_FLAGS.throw = true;
  const built = buildWorld(seed, layout, options.release || 'tangent');
  const meetings = [];
  const broke = [];
  built.bus.on('massline:tangentMeeting', (payload) => meetings.push(payload));
  built.bus.on('tether:broke', (payload) => broke.push(payload));
  const throwSystem = Object.create(masslineThrow);
  const tether = Object.create(tetherGameplay);
  try {
    throwSystem.init({
      state: built.state,
      bus: built.bus,
      helpers: { combatPhysics: built.physics },
      registry: built.registry,
    });
    tether.bus = built.bus;
    tether._active = { attachmentId: 'line', targetId: built.tetherTargetId };
    tether._pendingCut = null;
    const cut = tether._cutActive(
      { cut: (_id, _owner, reason) => { built.cutReason = reason; return { ok: true }; } },
      built.state,
      built.player,
      0,
    );
    assert.equal(cut, true);
    if (built.state.player.tether) built.state.player.tether.active = false;
    const ticks = options.ticks || 180;
    let aimX = 0;
    let aimZ = 0;
    for (let i = 0; i < ticks && built.enemy.alive !== false; i++) {
      throwSystem.update(DT, built.state);
      aimX = built.enemy.vel.x;
      aimZ = built.enemy.vel.z;
      built.state.tick += 1;
      built.state.simTime += DT;
    }
    const meeting = meetings[0] || null;
    return {
      draws: built.draws,
      hullId: meeting ? meeting.hullId : null,
      bodyId: meeting ? meeting.bodyId : null,
      killed: built.enemy.alive === false && !!(meeting && meeting.killed),
      playerAlive: built.player.alive !== false,
      rockAlive: built.rock.alive !== false,
      heavyAlive: built.heavy ? built.heavy.alive !== false : true,
      heavyHull: built.heavy ? built.heavy.hull : null,
      enemyAlive: built.enemy.alive !== false,
      closingSpeed: meeting ? meeting.closingSpeed : 0,
      cutReason: built.cutReason,
      broke: broke.length,
      meeting,
      aimX,
      aimZ,
    };
  } finally {
    throwSystem.destroy();
    MASSLINE2_FLAGS.enabled = prevEnabled;
    MASSLINE2_FLAGS.throw = prevThrow;
  }
}

function buildWorld(seed, layout, release) {
  const tangential = release !== 'radial';
  const phase = release === 'slack' ? 'slack' : 'loaded';
  const player = ship({
    id: 1, mass: 40, hull: 200, shield: 80, radius: 12, team: 0,
    pos: { x: 0, z: 0 },
    vel: tangential ? { x: 0, z: layout === 'anchor-swing' ? 90 : 40 } : { x: 40, z: 0 },
  });
  const enemy = ship({
    id: 2, mass: 16, hull: 150, shield: 110, radius: 14, team: 1,
    pos: layout === 'anchor-swing' ? { x: 100, z: 170 } : { x: 120, z: 0 },
    vel: tangential
      ? { x: 0, z: layout === 'anchor-swing' ? 0 : 120 }
      : { x: 120, z: 0 },
  });
  const station = {
    id: 3, type: 'station', alive: true, mass: 2000, radius: 40, team: 2,
    pos: { x: 100, z: 0 }, vel: { x: 0, z: 0 },
    hull: 4000, hullMax: 4000,
  };
  const rock = {
    id: 4, type: 'asteroid', alive: true, mass: 80, radius: 18,
    pos: layout === 'anchor-swing' ? { x: 0, z: 220 } : { x: 120, z: 50 },
    vel: { x: 0, z: 0 },
  };
  const heavy = ship({
    id: 5, mass: 200, hull: 720, shield: 300, radius: 22, team: 1,
    pos: { x: 100, z: 30 }, vel: { x: 0, z: 0 },
  });
  const tetherTarget = layout === 'anchor-swing' ? station : enemy;
  const ordered = seed === 4242
    ? [rock, heavy, station, enemy, player]
    : [player, enemy, station, rock, heavy];
  const counter = { n: 0 };
  const entities = new Map(ordered.map((entity) => [entity.id, entity]));
  const state = {
    tick: 10,
    simTime: 10 / 60,
    mode: 'flight',
    playerId: 1,
    seed,
    rng: () => { counter.n += 1; return seed === 4242 ? 0.2 : 0.8; },
    settings: { gameplay: { difficulty: 'veteran' } },
    entities,
    entityList: ordered.slice(),
    player: {
      tether: {
        active: true,
        targetId: tetherTarget.id,
        attachmentId: 'line',
        phase,
        restLength: 120,
        strain: 0.4,
        load: 0.55,
      },
    },
  };
  planTangentReleaseMeeting(state, assessTangentRelease(state, tetherTarget.id));
  const bus = createBus();
  const router = createDamageRouter({
    state,
    catalog: createCombatCatalog(),
    bus,
    helpers: {},
  }, { schedule: () => {} }, {
    onKill(target, killerId) {
      target.alive = false;
      bus.emit('entity:killed', { id: target.id, killerId, type: target.type });
    },
  });
  return {
    state,
    bus,
    player,
    enemy,
    rock,
    heavy: layout === 'anchor-swing' ? heavy : null,
    tetherTargetId: tetherTarget.id,
    get draws() { return counter.n; },
    cutReason: null,
    physics: {
      applyImpulse({ entityId, impulse }) {
        const entity = entities.get(entityId);
        if (!entity || !entity.vel || !impulse) return false;
        const mass = entity.mass || 1;
        entity.vel.x += impulse.x / mass;
        entity.vel.z += impulse.z / mass;
        return true;
      },
    },
    registry: {
      get(name) {
        if (name === 'combat') return { kernel: { routeDamage: router } };
        return null;
      },
    },
  };
}

function pairState({ phase, tangential }) {
  const player = ship({
    id: 1, mass: 40, hull: 200, shield: 0, radius: 12, team: 0,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 40 },
  });
  const enemy = ship({
    id: 2, mass: 16, hull: 150, shield: 110, radius: 14, team: 1,
    pos: { x: 120, z: 0 }, vel: tangential ? { x: 0, z: 120 } : { x: 80, z: 40 },
  });
  return {
    playerId: 1,
    entities: new Map([[1, player], [2, enemy]]),
    player: {
      tether: { active: true, targetId: 2, phase, restLength: 120, strain: 0.4, load: 0.55 },
    },
  };
}

function ship(spec) {
  return {
    id: spec.id,
    type: 'ship',
    alive: true,
    mass: spec.mass,
    hull: spec.hull,
    hullMax: spec.hull,
    shield: spec.shield,
    shieldMax: spec.shield,
    armorHp: 0,
    armorMax: 0,
    armorFlat: 0,
    radius: spec.radius,
    team: spec.team,
    pos: { x: spec.pos.x, z: spec.pos.z },
    vel: { x: spec.vel.x, z: spec.vel.z },
  };
}
