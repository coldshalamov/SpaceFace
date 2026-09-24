import test from 'node:test';
import assert from 'node:assert/strict';

import { scalarHitToDamagePacket } from '../src/combat/damage.js';
import { combat, makeEnemySpawnSpec } from '../src/systems/combat.js';

// INF-025: the Mirrorjaw Foreman is a positioning problem. Its mirror prow sheds head-on
// fire (x0.25) while its exposed stern takes bonus damage (x1.6); flanks route neutrally.
// Circling or baiting a pass and shooting the stern changes the outcome materially —
// face-tanking does not. The committed ram + slow recovery turn it pairs with already
// lives in the brawler_commit doctrine and its engine_flare telegraph.

function vec(x, z) {
  return {
    x, y: 0, z,
    copy(other) { this.x = other.x; this.y = other.y || 0; this.z = other.z; return this; },
  };
}

function makeForeman() {
  return {
    id: 2,
    type: 'ship',
    alive: true,
    team: 1,
    pos: vec(0, 0),
    prevPos: vec(0, 0),
    vel: vec(0, 0),
    rot: 0,
    flags: {},
    data: {
      defId: 'mirrorjaw_foreman',
      directionalArmor: { frontArcDeg: 150, frontMult: 0.25, rearArcDeg: 150, rearMult: 1.6 },
    },
    hull: 1000,
    hullMax: 1000,
    armorHp: 0,
    armorMax: 0,
    shield: 0,
    shieldMax: 0,
    cap: 240,
    capMax: 240,
  };
}

function makeState() {
  const foreman = makeForeman();
  const shooter = {
    id: 9,
    type: 'ship',
    alive: true,
    team: 0,
    pos: vec(0, 80),
    data: { defId: 'ship_kestrel' },
  };
  return {
    tick: 300,
    simTime: 5,
    playerId: 1,
    meta: { seed: 47 },
    settings: { gameplay: { difficulty: 'standard' } },
    content: {},
    input: { actions: {} },
    player: { credits: 0 },
    entities: new Map([[2, foreman], [9, shooter]]),
    entityList: [foreman, shooter],
    world: { currentSectorId: 'sector_helios_prime' },
  };
}

function initCombat(state) {
  const bus = { on() { return () => {}; }, emit() {} };
  combat.init({ state, bus, helpers: {}, registry: { get() { return null; } } });
  return combat.ensureKernel();
}

function shoot(kernel, hitPos) {
  return kernel.routeDamage({
    attackerId: 9,
    targetId: 2,
    packet: scalarHitToDamagePacket({
      damage: 100,
      damageType: 'kinetic',
      pos: hitPos,
      subsystemShare: 0,
    }),
    origin: { kind: 'test', id: 'inf-025-directional' },
  });
}

test('head-on fire sheds off the mirror prow', () => {
  const route = initCombat(makeState());
  const result = shoot(route, { x: 100, z: 0 });
  assert.equal(result.ok, true);
  assert.equal(result.directionalArc, 'front');
  assert.equal(result.directionalFactor, 0.25);
  assert.equal(result.hullDamage, 25);
});

test('stern fire punishes through the exposed machinery', () => {
  const route = initCombat(makeState());
  const result = shoot(route, { x: -100, z: 0 });
  assert.equal(result.ok, true);
  assert.equal(result.directionalArc, 'rear');
  assert.equal(result.directionalFactor, 1.6);
  assert.equal(result.hullDamage, 160);
});

test('flank fire routes neutrally and circling beats face-tanking', () => {
  const route = initCombat(makeState());
  const flank = shoot(route, { x: 0, z: 100 });
  assert.equal(flank.directionalArc, null);
  assert.equal(flank.directionalFactor, 1);
  assert.equal(flank.hullDamage, 100);

  const front = shoot(initCombat(makeState()), { x: 100, z: 0 });
  const rear = shoot(initCombat(makeState()), { x: -100, z: 0 });
  assert.ok(rear.totalApplied > flank.totalApplied, 'stern beats flank');
  assert.ok(flank.totalApplied > front.totalApplied, 'flank beats face-tanking');
  assert.ok(Math.abs(rear.totalApplied / front.totalApplied - 6.4) < 1e-9, 'rear/front ratio is exactly 1.6/0.25');
});

test('directionless packets and ordinary hulls route exactly as before', () => {
  const route = initCombat(makeState());
  // No hit position and no attacker position to read a direction from.
  const state = makeState();
  state.entities.get(9).pos = null;
  const routeNoDir = initCombat(state);
  const neutral = routeNoDir.routeDamage({
    attackerId: 9,
    targetId: 2,
    packet: scalarHitToDamagePacket({ damage: 100, damageType: 'kinetic', subsystemShare: 0 }),
    origin: { kind: 'test', id: 'inf-025-neutral' },
  });
  assert.equal(neutral.ok, true);
  assert.equal(neutral.directionalArc, null);
  assert.equal(neutral.directionalFactor, 1);
  assert.equal(neutral.hullDamage, 100);

  // A hull with no directionalArmor authoring is untouched by the gate.
  const plainState = makeState();
  delete plainState.entities.get(2).data.directionalArmor;
  const plainRoute = initCombat(plainState);
  const plain = shoot(plainRoute, { x: 100, z: 0 });
  assert.equal(plain.hullDamage, 100);
  assert.equal(plain.directionalArc, null);
  void route;
});

test('facing geometry is deterministic: the same pass always yields the same damage', () => {
  const first = shoot(initCombat(makeState()), { x: -70, z: 70 });
  const second = shoot(initCombat(makeState()), { x: -70, z: 70 });
  assert.deepEqual(
    { applied: first.totalApplied, hull: first.after.hull, arc: first.directionalArc },
    { applied: second.totalApplied, hull: second.after.hull, arc: second.directionalArc },
  );
});

test('the foreman spawn spec carries its prow/stern split and names it in the telegraph', () => {
  const spec = makeEnemySpawnSpec('mirrorjaw_foreman', 4, { x: 0, z: 0 });
  assert.deepEqual(spec.data.directionalArmor, {
    frontArcDeg: 150,
    frontMult: 0.25,
    rearArcDeg: 150,
    rearMult: 1.6,
  });
  assert.ok(
    String(spec.data.telegraph && spec.data.telegraph.line).includes('stern'),
    'the commit bark names the weak side so the defense is never unexplained',
  );
  assert.ok(
    String(spec.data.counterHint).includes('stern'),
    'the counter hint teaches the cross-and-flank answer',
  );
});
