import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { createDamageRouter } from '../src/combat/damage.js';
import { createCombatCatalog } from '../src/combat/runtime.js';
import { MASSLINE2_FLAGS } from '../src/data/featureFlags.js';
import { masslineThrow, selfSlingBonusDv } from '../src/systems/masslineThrow.js';
import { rateRelease, tetherGameplay } from '../src/systems/tetherGameplay.js';

// CV-THROW — a throw is a decision the player made. The solver may NAME the release and predict
// the meeting; it may never steer the released hull or synthesize the contact. After the cut the
// hull is ballistics: no impulse, no position writes, no invented damage, no meeting receipt.
// What it hits is physics' answer, and the release validation receipt reports the divergence.

const DT = 1 / 60;
const SEEDS = [4242, 8008];

test('the release read still names the swing — taut tangent rates razor, radial and tow do not', () => {
  const state = pairState({ phase: 'loaded', tangential: true });
  const razor = rateRelease(state, 2);
  assert.equal(razor.technique, 'swing');
  assert.equal(razor.classification, 'razor');
  assert.ok(razor.releaseScore >= 0.85);
  assert.ok(Math.abs(razor.tangentialSpeed) >= 25);

  state.entities.get(2).vel.x = 80;
  state.entities.get(2).vel.z = 60;
  const radial = rateRelease(state, 2);
  assert.equal(radial.technique, 'radial', 'a tow that runs away from the player is not a swing');
  assert.notEqual(radial.classification, 'razor');

  state.entities.get(2).vel.x = 0;
  state.entities.get(2).vel.z = 40 + 10;
  const slow = rateRelease(state, 2);
  assert.equal(slow.technique, 'tow', 'a slow swing reads as a tow, not a release');
  assert.equal(slow.classification, 'messy');
});

test('a taut release leaves the hull on ballistics — no impulse, no rewrite, no invented contact', () => {
  for (const seed of SEEDS) {
    const outcome = drive(seed, 'tethered-hull');
    assert.equal(outcome.cutReason, 'tether_cut');
    assert.equal(outcome.broke, 0, 'the line is cut, not snapped');
    assert.equal(outcome.draws, 0, `seed ${seed} rolls nothing`);
    assert.equal(outcome.impulseCalls, 0, `seed ${seed}: nobody impulsed the hull after release`);
    assert.equal(outcome.damageCalls, 0, `seed ${seed}: nobody synthesized a contact`);
    assert.equal(outcome.meetings.length, 0, `seed ${seed}: no meeting receipt exists`);
    assert.equal(outcome.runtimeMeeting, undefined, 'no live meeting was ever armed');
    assert.equal(outcome.lastMeeting, undefined, 'no committed meeting receipt exists');
    assert.equal(outcome.enemyAlive, true, `seed ${seed}: the hull dies to real contact, not to the release`);
    assert.equal(outcome.enemyHull, 150);
    assert.equal(outcome.enemyShield, 110);
    assert.equal(outcome.rockAlive, true);
    assert.equal(outcome.playerAlive, true);
    assert.equal(outcome.covertEvents.length, 0,
      `seed ${seed}: no physics:impact / combat:damage / entity:killed / tether:whipImpact is emitted in a no-contact run`);
    assert.equal(outcome.queuedImpulses, 0,
      `seed ${seed}: nothing queues a physics command on any body after the cut`);
    assert.equal(outcome.velTrail.every((v) => v.x === 0 && v.z === 120), true,
      `seed ${seed}: the hull keeps the velocity the swing earned — nothing steers it`);
    assert.equal(outcome.posTrail.every((p) => p.x === 120 && p.z === 0), true,
      `seed ${seed}: the system never writes the hull's position`);
    assert.equal(outcome.unmoved, true,
      `seed ${seed}: no body — rock, station, heavy, or player — is repositioned to meet the throw`);
    assert.equal(outcome.releaseRead.classification, 'razor',
      'the release is still named at the cut — prediction survives, steering does not');
  }
});

test('a killable body on the exit ray still does not turn prediction into steering', () => {
  // In the tethered-hull layout the asteroid sits at (120, 50), dead ahead of the released
  // hull's (0, 120) exit ray — exactly the geometry the old meeting would have steered into.
  const outcome = drive(4242, 'tethered-hull');
  assert.equal(outcome.impulseCalls, 0, 'the hull is not impulsed toward the rock');
  assert.equal(outcome.enemyAlive, true, 'no synthetic collision scores the meeting');
  assert.equal(outcome.rockAlive, true);
  assert.equal(outcome.meetings.length, 0);
  assert.equal(outcome.velTrail.every((v) => v.x === 0 && v.z === 120), true);
});

test('a slack or radial cut throws nothing and books nothing', () => {
  for (const release of ['slack', 'radial']) {
    const outcome = drive(4242, 'tethered-hull', { release, ticks: 30 });
    assert.equal(outcome.meetings.length, 0, `${release}: no meeting receipt`);
    assert.equal(outcome.impulseCalls, 0, `${release}: no steering impulse`);
    assert.equal(outcome.damageCalls, 0, `${release}: no synthesized damage`);
    assert.equal(outcome.enemyAlive, true, `${release}: the hull lives`);
    assert.equal(outcome.releaseRead.classification, 'messy',
      `${release}: the release read says so honestly`);
  }
});

test('the release earns no free speed — selfSlingBonusDv stays zero', () => {
  assert.equal(selfSlingBonusDv(160, 1, true), 0, 'the cut adds nothing the swing did not earn');
  assert.equal(selfSlingBonusDv(160, 1, false), 0);
});

function drive(seed, layout, options = {}) {
  const prevEnabled = MASSLINE2_FLAGS.enabled;
  const prevThrow = MASSLINE2_FLAGS.throw;
  MASSLINE2_FLAGS.enabled = true;
  MASSLINE2_FLAGS.throw = true;
  const built = buildWorld(seed, layout, options.release || 'tangent');
  const meetings = [];
  const broke = [];
  const rated = [];
  const covertEvents = [];
  built.bus.on('massline:tangentMeeting', (payload) => meetings.push(payload));
  built.bus.on('tether:broke', (payload) => broke.push(payload));
  built.bus.on('tether:releaseRated', (payload) => rated.push(payload));
  for (const name of ['physics:impact', 'combat:damage', 'entity:killed', 'tether:whipImpact']) {
    built.bus.on(name, (payload) => covertEvents.push({ name, payload }));
  }
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
    const velTrail = [];
    const posTrail = [];
    // A "meet halfway" steering path would write any body, not only the thrown hull — trail them
    // all, and poll the physics-authority queue so a covert impulse cannot hide in a side channel.
    const bodyTrails = new Map(built.state.entityList.map((entity) => [entity.id, {
      vel: { x: entity.vel ? entity.vel.x : 0, z: entity.vel ? entity.vel.z : 0 },
      pos: { x: entity.pos.x, z: entity.pos.z },
    }]));
    let queuedImpulses = 0;
    for (let i = 0; i < ticks; i++) {
      throwSystem.update(DT, built.state);
      velTrail.push({ x: built.enemy.vel.x, z: built.enemy.vel.z });
      posTrail.push({ x: built.enemy.pos.x, z: built.enemy.pos.z });
      for (const entity of built.state.entityList) {
        const command = consumePhysicsCommand(entity);
        if (command) queuedImpulses += command.impulses.length + command.torqueImpulses.length;
      }
      built.state.tick += 1;
      built.state.simTime += DT;
    }
    const unmoved = built.state.entityList.every((entity) => {
      const start = bodyTrails.get(entity.id);
      return entity.pos.x === start.pos.x && entity.pos.z === start.pos.z
        && (entity.vel ? entity.vel.x : 0) === start.vel.x
        && (entity.vel ? entity.vel.z : 0) === start.vel.z;
    });
    const subtree = built.state.massline2 && built.state.massline2.throw || {};
    return {
      draws: built.draws,
      impulseCalls: built.impulseCalls,
      damageCalls: built.damageCalls,
      meetings,
      covertEvents,
      queuedImpulses,
      unmoved,
      broke: broke.length,
      velTrail,
      posTrail,
      enemyAlive: built.enemy.alive !== false,
      enemyHull: built.enemy.hull,
      enemyShield: built.enemy.shield,
      playerAlive: built.player.alive !== false,
      rockAlive: built.rock.alive !== false,
      cutReason: built.cutReason,
      releaseRead: rated[0] || {},
      runtimeMeeting: subtree.tangentMeeting,
      lastMeeting: subtree.lastTangentMeeting,
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
    // slack means the pair is actually inside the line's rest length, not merely labelled.
    pos: release === 'slack' ? { x: 60, z: 0 }
      : layout === 'anchor-swing' ? { x: 100, z: 170 } : { x: 120, z: 0 },
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
  const harness = {
    state,
    bus,
    player,
    enemy,
    rock,
    heavy: layout === 'anchor-swing' ? heavy : null,
    tetherTargetId: tetherTarget.id,
    impulseCalls: 0,
    damageCalls: 0,
    get draws() { return counter.n; },
    cutReason: null,
    physics: {
      applyImpulse({ entityId, impulse }) {
        harness.impulseCalls += 1;
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
        if (name === 'combat') {
          return {
            kernel: {
              routeDamage(args) {
                harness.damageCalls += 1;
                return router.routeDamage(args);
              },
            },
          };
        }
        return null;
      },
    },
  };
  return harness;
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
