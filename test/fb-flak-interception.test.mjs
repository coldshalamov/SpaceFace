/**
 * FB-018 — the PD-screen escort's flak battery is a real point-defense channel, not decor.
 *
 * Before this packet the servo loop only ever read `data.fittings` for a PD module; enemy
 * mounts live on `data.weapons`, so the escort's authored `intercepts: true` flak never fired
 * a single defensive shot. These pins run the production `countermeasures.update` seam on the
 * real `makeEnemySpawnSpec('pd_screen_escort')` row:
 *
 *   1. A hostile missile inside the flak envelope is destroyed, with a `pds:intercept`
 *      receipt carrying the weapon channel's source + weaponId.
 *   2. The authored chance is a real roll: a losing roll still spends the shot (cap charged,
 *      projectile survives) — the screen is honest, never a guaranteed wall.
 *   3. The authored cadence gates re-fire: a second projectile inside `interceptCooldownS`
 *      leaks through untouched.
 *   4. The authored turret arc is real coverage: a projectile abeam the 180° arc is safe.
 *   5. Own-side rounds are never intercepted (team + ownerId filters).
 *   6. The screen is saturable: PD-role actors spend recovery charges, so a missile wave
 *      that outlasts two quick kills leaks the third inside the recovery window.
 *
 * RUN: `node --test test/fb-flak-interception.test.mjs`
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { countermeasures } from '../src/systems/countermeasures.js';
import { makeEnemySpawnSpec } from '../src/systems/combat.js';
import { PD_SCREEN_MAX_INTERCEPTS, PD_SCREEN_RECOVERY_TICKS } from '../src/ai/pdScreen.js';

const DT = 1 / 60;

function makeWorld({ rng = () => 0 } = {}) {
  const bus = createBus();
  const spec = makeEnemySpawnSpec('pd_screen_escort', 6, { x: 0, z: 0 });
  const ship = {
    id: 'escort_1', type: 'ship', alive: true, team: 1,
    pos: { x: 0, z: 0 }, rot: 0,
    cap: spec.cap, capMax: spec.capMax,
    hull: spec.hull, hullMax: spec.hullMax,
    data: spec.data,
  };
  const state = {
    mode: 'flight', tick: 0, simTime: 0,
    entities: new Map([[ship.id, ship]]),
    entityList: [ship],
    input: {}, rng,
  };
  const receipts = [];
  bus.on('pds:intercept', (p) => receipts.push(p));
  countermeasures.init({ state, bus, helpers: {}, registry: null });
  return { state, bus, ship, receipts };
}

let nextProjectileId = 0;
function missile(world, { x = 120, z = 0, team = 0, ownerId = 'raider_9', kind = 'missile' } = {}) {
  const p = {
    id: `proj_${nextProjectileId++}`, type: 'projectile', alive: true,
    team, ownerId, pos: { x, z }, vel: { x: -240, z: 0 },
    data: { kind },
  };
  world.state.entities.set(p.id, p);
  world.state.entityList.push(p);
  return p;
}

function step(world, ticks = 1) {
  for (let i = 0; i < ticks; i++) {
    world.state.tick += 1;
    world.state.simTime += DT;
    countermeasures.update(DT, world.state);
  }
}

test('FB-018: escort flak battery kills a hostile missile in its envelope and receipts it', () => {
  const world = makeWorld();
  const m = missile(world);
  step(world);
  assert.equal(m.alive, false, 'missile inside the flak ring must be destroyed');
  assert.equal(world.receipts.length, 1);
  const r = world.receipts[0];
  assert.equal(r.source, 'weapon', 'the kill must come from the weapon channel, not a module');
  assert.equal(r.weaponId, 'wpn_flak_turret_s');
  assert.equal(r.shipId, 'escort_1');
  assert.equal(r.missile, true);
  assert.equal(world.ship.cap, 189, 'the intercept charges the weapon\'s authored energyCost');
  assert.ok(world.ship.data.pds.weaponCooldownT > 0, 'battery commits its authored cadence');
});

test('FB-018: the authored chance is a real roll — a losing roll spends the shot and leaks the missile', () => {
  const world = makeWorld({ rng: () => 0.99 }); // above interceptChance 0.6
  const m = missile(world);
  step(world);
  assert.equal(m.alive, true, 'a rolled miss never retires the projectile');
  assert.equal(world.receipts.length, 0, 'a miss emits no intercept receipt');
  assert.equal(world.ship.cap, 189, 'the shot is still paid for — chance is not a refund');
  assert.ok(world.ship.data.pds.weaponCooldownT > 0, 'the cadence was committed by the shot');
});

test('FB-018: cadence gates the battery — a second missile inside the cooldown leaks', () => {
  const world = makeWorld();
  step(world);
  const first = missile(world);
  step(world);
  assert.equal(first.alive, false);
  const second = missile(world);
  step(world, 6); // 0.1 s — inside interceptCooldownS 0.5
  assert.equal(second.alive, true, 'the battery cannot answer inside its authored cadence');
  step(world, 30); // now past the 0.5 s window
  assert.equal(second.alive, false, 'the battery re-fires once the cadence clears');
});

test('FB-018: the turret arc is the honest coverage — a missile abeam the arc is safe', () => {
  const world = makeWorld();
  const m = missile(world, { x: -120, z: 0 }); // dead astern; flak arc is 180° about the nose
  step(world);
  assert.equal(m.alive, true, 'astern shots are outside the authored turret arc');
  assert.equal(world.receipts.length, 0);
  assert.equal(world.ship.cap, 190, 'no shot was spent on a target the mount cannot bear on');
});

test('FB-018: own-side rounds are never intercepted', () => {
  const world = makeWorld();
  const friendly = missile(world, { team: 1, ownerId: 'wingmate_2', kind: 'bolt' });
  const own = missile(world, { team: 0, ownerId: 'escort_1', kind: 'bolt' });
  step(world);
  assert.equal(friendly.alive, true, 'a same-team round is not a threat');
  assert.equal(own.alive, true, 'the escort never shoots its own fire');
  assert.equal(world.receipts.length, 0);
});

test('FB-018: the screen saturates — the third missile inside the recovery window leaks', () => {
  const world = makeWorld();
  step(world);
  const a = missile(world);
  step(world);                                   // kill 1 — charge 1 spent
  assert.equal(a.alive, false);
  step(world, 30);                               // cadence clears (0.5 s), inside recovery 45
  const b = missile(world);
  step(world);                                   // kill 2 — charge 2 spent, screen saturated
  assert.equal(b.alive, false);
  const leaked = missile(world);
  step(world);                                   // activeIntercepts = max → gate holds
  assert.equal(leaked.alive, true,
    `the ${PD_SCREEN_MAX_INTERCEPTS}-charge ledger makes the screen saturable, never perfect`);
  assert.equal(world.receipts.length, 2);
  step(world, PD_SCREEN_RECOVERY_TICKS);         // recovery + cadence both clear in this window
  assert.equal(leaked.alive, false, 'a recovered charge kills the missile that leaked');
  const late = missile(world);
  step(world);                                   // saturated again — the window closed
  assert.equal(late.alive, true);
  step(world, PD_SCREEN_RECOVERY_TICKS);
  assert.equal(late.alive, false, 'the screen recovers in bounded windows, not instantly');
});
