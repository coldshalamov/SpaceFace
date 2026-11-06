// inf-tacticalai-lane-scans — F1(a) for the tactical owner: the fixed-step tactical AI walked
// the WHOLE entity universe two to three times per tick (the incoming-mass cue runs every
// tick before the quiet latch; the body-launcher walk runs on the decision and maintain
// paths), and in a crowded Crucible round that universe is hundreds of rocks, wrecks and FX
// that can never be a launcher or a thrown body. Both walks now ride the entity index lanes
// the code already prefers, with the predicate shared verbatim by both paths:
//   incoming mass — the physics-owned body lane (physicsBodies: exactly the entities whose
//   pose the physics owns) with the same speed/type/tumbling/dynamic law; the one class a
//   body lane cannot carry is the schema's own opt-out (physicsBody === false scripted
//   presentation movers), which is the point: a body the physics does not own is not a
//   thrown body the warning owes the pilot. An unready index falls back to the same
//   universe walk, so minimal states keep today's exact behavior;
//   body launchers — a launcher is a ship (isBodyLauncherEnemy is ship-only), so the enemy
//   walk rides the shipLike lane, the fallback keeps the map walk, and both admit the same
//   hulls.
// The parity proof: identical populations through the index path and the fallback path
// produce identical telegraph streams and identical launches.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { normalizeActivity } from '../src/ai/doctrine.js';
import { emitIncomingMassCue, stepHostileBodyLaunches } from '../src/systems/tacticalAI.js';

const DT = 1 / 60;

function ship(id, team, x, ai = null) {
  return { id, type: 'ship', team, alive: true, pos: { x, z: 0 }, vel: { x: 0, z: 0 },
    radius: 10, mass: 50, hull: 100, hullMax: 100, shield: 0, shieldMax: 0,
    armor: 0, armorMax: 0, rot: 0, collides: true,
    physicsBody: { mass: 50, dynamic: true }, data: { ...(ai ? { ai } : {}), intent: {}, combat: {} } };
}

/** A live dynamic body closing on the pilot at warning speed (the pilot sits at +300). */
function rock(id, x, vx = 160, extra = {}) {
  return { id, type: 'asteroid', alive: true, pos: { x, z: 0 }, vel: { x: vx, z: 0 },
    radius: 8, mass: 60, collides: true, physicsBody: { dynamic: true, mass: 60 },
    data: {}, ...extra };
}

/** The launcher doctrine runtime the tactical owner keeps. */
function launcherEnemy(x) {
  const enemy = ship('launcher', 1, x, { passive: false, lawful: false, forcePlayerTarget: true,
    hostileTeams: [0], motive: 'assigned_interdiction', engagementTrigger: 'authorized_hostile_spawn',
    zoneId: 'sector_hostile_zone', approachTelegraph: 'engine_flare', noFireResponseWindowS: 1,
    combatDoctrineId: 'brawler_commit', roe: 'weapons_free',
    activity: normalizeActivity({ kind: 'attack_run', reason: 'fixture', anchor: { x: 0, z: 0 },
      leashRadius: 2200, startedTick: 0 }) });
  enemy.data.weapons = [{ defId: 'wpn_concussion_cannon_m' }];
  return enemy;
}

function doctrineFor(enemyId) {
  return { byEntity: new Map([[enemyId,
    { doctrineId: 'brawler_commit', phase: 'commit', targetId: 'player' }]]) };
}

/**
 * One population, two index postures: `ready` builds the lanes exactly as the entity index
 * maintains them (physicsBodies = shouldSync bodies, shipLike = ships), `null` leaves a
 * bare state so the walker takes the universe fallback. Everything else is identical.
 */
function boot({ ready }) {
  const player = ship('player', 0, 300);
  const enemy = launcherEnemy(0);
  const thrown = rock('thrown', 160);          // fast, dynamic, closing
  const slow = rock('slow', 200, 30);          // below the warning speed
  const projectile = { id: 'proj', type: 'projectile', alive: true, pos: { x: 150, z: 0 },
    vel: { x: 200, z: 0 }, radius: 2, mass: 1, collides: true, physicsBody: false, data: {} };
  const entities = [player, enemy, thrown, slow, projectile];
  const state = { tick: 100, simTime: 100 / 60, mode: 'flight', playerId: player.id,
    player: { heat: 0 }, world: { currentSectorId: 'sector_ceres_belt' }, meta: { seed: 4242 },
    entities: new Map(entities.map((e) => [e.id, e])), entityList: [...entities],
    combat: { beams: [], entities: {}, threatTables: new Map() } };
  if (ready) {
    // The lanes as appendEntityIndex/syncEntityIndexEntity maintain them: every body-owned
    // entity rides physicsBodies (statics included — the per-body dynamic check excludes
    // them), ships ride shipLike, non-entities never enter any lane.
    state.entityIndex = { __spacefaceEntityIndexV1: true, ready: true, version: 1,
      physicsBodies: entities.filter((e) => e.physicsBody !== false),
      shipLike: entities.filter((e) => e.type === 'ship') };
  }
  const events = [];
  const bus = createBus();
  bus.on('ai:telegraph', (e) => events.push(structuredClone(e)));
  return { state, player, enemy, thrown, bus, events, runtime: new Map(),
    doctrine: doctrineFor(enemy.id) };
}

function ticks(h, n, fn) {
  for (let i = 0; i < n; i++) {
    h.state.tick += 1;
    h.state.simTime = h.state.tick * DT;
    fn(h);
  }
}

test('the cue reads the same threat through the body lane and through the universe fallback', () => {
  const lane = boot({ ready: true });
  const map = boot({ ready: null });
  const run = (h) => ticks(h, 3, (h) => emitIncomingMassCue(h.state, h.bus));
  run(lane);
  run(map);
  assert.equal(lane.events.length, 3, 'the lane-ready state still warns');
  assert.deepEqual(lane.events, map.events,
    'identical populations, identical telegraph streams — the lane carries the threat');
  assert(lane.events.every((e) => e.entityId === 'thrown' && e.phase === 'incoming_mass'));

  // The excluded kinds stay excluded on the lane path: a fast projectile never becomes the
  // threat even though the predicate keeps it honest, and a slow rock never warns.
  assert.ok(!lane.events.some((e) => e.entityId === 'proj'));
  assert.ok(!lane.events.some((e) => e.entityId === 'slow'));
});

test('a scripted presentation mover (physicsBody:false) is not a thrown body on the lane path', () => {
  const lane = boot({ ready: true });
  const scripted = { id: 'scripted', type: 'debris', alive: true, pos: { x: 160, z: 0 },
    vel: { x: 300, z: 0 }, radius: 6, mass: 10, collides: true, physicsBody: false, data: {} };
  lane.state.entities.set(scripted.id, scripted);
  ticks(lane, 2, (h) => emitIncomingMassCue(h.state, h.bus));
  assert.ok(lane.events.every((e) => e.entityId !== 'scripted'),
    'the schema opt-out keeps scripted movers off the physics-owned lane — and off the warning');
  // A real thrown body on the same state still warns.
  assert.ok(lane.events.length >= 2, 'the lane walk still sees the physics-owned threat');
});

test('the launcher walk arms through the shipLike lane exactly as through the map', () => {
  const boot2 = (ready) => {
    const h = boot({ ready });
    // A throwable wreck within reach and laws (slow enough to grab, inside REACH and TARGET).
    const wreck = { id: 'grab', type: 'wreck', alive: true, pos: { x: 60, z: 0 },
      vel: { x: 0, z: 0 }, radius: 8, mass: 60, hull: 1000, collides: true,
      physicsBody: { dynamic: true, mass: 60 }, data: {} };
    h.state.entities.set(wreck.id, wreck);
    h.state.entityList.push(wreck);
    if (ready) {
      h.state.entityIndex.physicsBodies.push(wreck);
      h.state.entityIndex.shipLike = h.state.entityIndex.shipLike.filter((e) => e.id !== 'player');
      h.state.entityIndex.shipLike.push(h.state.entities.get('player'));
    }
    return h;
  };
  const lane = boot2(true);
  const map = boot2(null);
  const run = (h) => ticks(h, 1, (h) => stepHostileBodyLaunches(h.state, h.bus, h.runtime, h.doctrine));
  run(lane);
  run(map);
  const tele = (h) => h.events.filter((e) => e.phase === 'body_launch');
  assert.equal(tele(lane).length, 1, 'the lane path arms the windup');
  assert.deepEqual(tele(lane), tele(map), 'the lane admits exactly the hull the map admits');
  assert.equal(tele(lane)[0].entityId, 'launcher');

  // Both paths commit the same launch against the same body on the authored windup clock.
  const fire = (h) => {
    h.runtime.get('launcher').fireTick = h.state.tick;
    ticks(h, 1, (h) => stepHostileBodyLaunches(h.state, h.bus, h.runtime, h.doctrine));
    return consumePhysicsCommand(h.state.entities.get('grab'))
      ?.impulses.map((v) => ({ x: Math.round(v.x), z: Math.round(v.z) })) || [];
  };
  const laneImpulse = fire(lane);
  const mapImpulse = fire(map);
  assert.ok(laneImpulse.length >= 1, 'the lane path launches the thrown body');
  assert.deepEqual(laneImpulse, mapImpulse, 'the same hull, the same intercept impulse');
});

test('an unready index falls back to the universe walk without changing a minimal state', () => {
  const map = boot({ ready: null });
  const before = map.events.length;
  ticks(map, 1, (h) => emitIncomingMassCue(h.state, h.bus));
  assert.equal(map.events.length, before + 1, 'the fallback still warns');
  assert.equal(map.state.entityIndex, undefined, 'no index was fabricated on the bare state');
});
