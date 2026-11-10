import test from 'node:test';
import assert from 'node:assert/strict';
import { createProductionCapitalBossEncounters } from '../src/systems/capitalBossRuntime.js';
import { createCapitalBossFight, stepCapitalBossFight, restoreCapitalBossFight } from '../src/combat/capitalBossScore.js';
import { capitalOrderKey, shapeCapitalBossManeuverRequest } from '../src/ai/capitalBossOrders.js';
import { makeEnemySpawnSpec, combat } from '../src/systems/combat.js';
import { IRON_KRAKEN_PROFILES } from '../src/data/ironKraken.js';
import { IRON_KRAKEN_HEAVY } from '../src/data/encounters/capital-boss/iron-kraken.js';

const clone = value => JSON.parse(JSON.stringify(value));
const angle = value => Math.atan2(Math.sin(value), Math.cos(value));
const DT = 1 / 60;

function scoreFixture() {
  const profile = IRON_KRAKEN_PROFILES.heavy;
  const boss = { id: 2, pos: { x: 0, z: 0 }, rot: 0, radius: profile.coreRadius,
    hull: profile.hull, hullMax: profile.hull, alive: true, disabled: [] };
  const target = { id: 1, pos: { x: 200, z: 0 }, radius: 14, hull: 1000, hullMax: 1000, alive: true };
  const fight = createCapitalBossFight({ encounterId: profile.scoreId, fightId: 'test:kraken_motion', bossId: 2, targetId: 1 });
  let tick = 0, active = true, order = null;
  return { boss, target, fight, get order() { return order; }, set active(value) { active = value; },
    observation() { return { tick, simTime: tick * DT, active, boss, target }; },
    step() {
      const out = stepCapitalBossFight(fight, this.observation());
      tick++;
      const latest = out.findLast(command => command.type === 'order');
      if (latest) order = latest;
      return out;
    } };
}

test('the score swims toward range, brakes before lock, and holds a real recovery before repositioning', () => {
  const h = scoreFixture();
  for (let i = 0; i < 45; i++) h.step();
  assert.ok(h.order.velocity.x > 30, 'intro issues an approach velocity through the normal helm');
  assert.equal(h.order.brake, false);
  h.target.pos = { x: IRON_KRAKEN_HEAVY.score.transitMotion.preferredRange, z: 0 };
  h.step();
  assert.ok(Math.abs(h.order.velocity.x) < 1e-8);
  assert.ok(h.order.velocity.z > 10, 'a stationary pilot still sees a broad lateral swim');
  while (h.fight.clock < 105) h.step();
  assert.equal(h.order.brake, true, 'arrival settles before its next committed warning');
  while (h.fight.phase !== 'tell') h.step();
  assert.equal(h.order.velocity, undefined);
  assert.equal(h.order.brake, true);
  while (h.fight.phase !== 'recovery') h.step();
  assert.deepEqual(h.fight.recovery, { beatId: 'arm_rake', startedAt: h.fight.clock - 1,
    durationTicks: 150, heading: 0, cancelled: false });
  for (let i = 0; i < 58; i++) { h.step(); assert.equal(h.order.brake, true); }
  for (let i = 0; i < 26; i++) h.step();
  assert.equal(h.order.brake, false);
  assert.ok(h.order.velocity.z > 10, 'late recovery repositions with the shell still visibly vulnerable');
  while (h.fight.nextAt - h.fight.clock > 20) h.step();
  assert.equal(h.order.brake, true, 'settle phase cannot drag the following attack footprint');
  while (h.fight.phase === 'recovery') h.step();
  assert.equal(h.fight.recovery, null);
});

test('recovery intent survives JSON restore; disable, suspend and terminal cancel swimming and stale mechanisms', () => {
  const h = scoreFixture();
  while (h.fight.phase !== 'recovery') h.step();
  for (let i = 0; i < 86; i++) h.step();
  const saved = clone(h.fight), restored = restoreCapitalBossFight(saved);
  for (let i = 0; i < 8; i++) {
    const expected = stepCapitalBossFight(restored, clone(h.observation()));
    assert.deepEqual(h.step(), expected, 'no hidden pose clock or private movement memory is needed');
  }
  h.boss.disabled = ['subsystem_drive']; h.step();
  assert.equal(h.order.brake, true);
  assert.equal(h.order.velocity, undefined);
  h.boss.disabled = []; h.active = false; h.step();
  assert.equal(h.fight.recovery, null);
  assert.equal(h.order.brake, true);
  assert.equal(h.order.velocity, undefined);
  h.active = true; h.step();
  assert.equal(h.fight.cast, null, 'resumption earns its full warning, never resumes a partly fired burst');
  h.boss.alive = false; h.step();
  assert.equal(h.fight.terminal, 'victory');
  assert.equal(h.fight.recovery, null);
  assert.equal(h.order.brake, true);
  assert.throws(() => restoreCapitalBossFight({ ...saved, recovery: { ...saved.recovery, heading: NaN } }), /recovery/);
  const legacy = clone(saved); delete legacy.recovery;
  assert.equal(restoreCapitalBossFight(legacy).recovery, null, 'old saves do not invent a mechanism phase');
});

test('committed Kraken heading controls real torque, preserves normalization and does not change other capital helms', () => {
  const spec = makeEnemySpawnSpec(IRON_KRAKEN_PROFILES.heavy.enemyId, 1, { x: 0, z: 0 });
  const actor = { ...spec, id: 2, rot: -.6, angVel: 0, vel: { x: 0, z: 0 } };
  const order = { scoreOwnsAttacks: true, heading: .4, forward: 1, brake: false, phase: 'active' };
  const state = { entities: new Map([[actor.id, actor]]), capitalBossEncounters: {
    orders: { [capitalOrderKey(actor.id)]: order } } };
  const request = { entityId: actor.id, targetHeading: -2, torqueYaw: -1,
    forceLocal: { forward: .1, right: -.8 }, brake: true, boost: true };
  Object.defineProperty(request, 'normalizedProbe', { value: true, enumerable: false });
  const result = shapeCapitalBossManeuverRequest(request, state);
  assert.ok(result.torqueYaw > 0, 'positive locked bearing reaches the physical yaw channel');
  assert.equal(result.targetHeading, .4);
  assert.equal(result.forceLocal.forward, 1);
  assert.equal(result.forceLocal.right, 0);
  assert.equal(result.boost, false);
  assert.equal(result.normalizedProbe, true);
  assert.equal(Object.keys(result).includes('normalizedProbe'), false);
  assert.equal(request.torqueYaw, -1, 'the tactical cached request is never mutated');
  actor.rot = .4; actor.angVel = .8;
  assert.ok(shapeCapitalBossManeuverRequest(request, state).torqueYaw < 0, 'real angular momentum is braked near the bearing');
  actor.data = { lootTableId: 'not_a_kraken' };
  const unchanged = shapeCapitalBossManeuverRequest(request, state);
  assert.equal(unchanged.torqueYaw, -1, 'the existing capital actors retain their helm contract');
  assert.equal(unchanged.boost, true);
});

test('the native tactical port overrides the shared flight owner and moves the Rapier body on the authored clock', async () => {
  const { bootRealPath, OPEN_SPACE_BOUNDS } = await import('../scripts/lib/bench/realPath.mjs');
  const profile = IRON_KRAKEN_PROFILES.heavy;
  const capital = createProductionCapitalBossEncounters();
  const h = await bootRealPath({ seed: 74231, bounds: OPEN_SPACE_BOUNDS,
    // Combat initializes the capability/damage ports before the score. The steering chain
    // follows production order: tactical intent, action gates, Flight V3, then aiPorts.
    // Omitting Flight V3 would miss a neutral NPC control overwriting the capital's helm.
    systems: [combat, capital, 'tacticalAI', 'actions', 'flightV3', 'aiPorts', 'weapons'],
    hulls: [{ hullId: 'ship_kestrel', isPlayer: true, pos: { x: 0, z: 0 }, team: 0 }],
    prepareState({ state }) {
      state.world.currentSectorId = 'kraken_test_room';
      state.missions.active.push({ id: 'test:kraken_native', status: 'active', destSectorId: 'kraken_test_room' });
    } });
  try {
    const spec = makeEnemySpawnSpec(profile.enemyId, 1, { x: -230, z: 0 });
    spec.rot = .65;
    spec.data.ai.forcePlayerTarget = true; spec.data.ai.huntPlayer = true;
    spec.data.ai.spawnContext = 'encounter'; spec.data.ai.moraleImmune = true;
    const boss = h.runtime.spawn(spec);
    h.bus.emit('capitalBoss:start', { fightId: 'test:kraken_native', encounterId: profile.scoreId,
      bossId: boss.id, targetId: h.player.id });
    h.step(1); h.assertBodies([boss, h.player], 'Kraken encounter');
    assert.equal(h.proof().backend, 'rapier-dynamic');
    const start = { x: boss.pos.x, z: boss.pos.z, rot: boss.rot };
    h.step(80);
    assert.ok(boss.pos.x > start.x + 10, `live approach must move: ${boss.pos.x - start.x}`);
    const facePlayer = Math.atan2(h.player.pos.z - boss.pos.z, h.player.pos.x - boss.pos.x);
    assert.ok(Math.abs(angle(facePlayer - boss.rot)) < .3,
      `physical hull faces the pilot instead of merely its render mesh: ${boss.rot}`);
    const fight = h.state.capitalBossEncounters.fights['test:kraken_native'];
    for (let i = 0; i < 240 && fight.phase !== 'tell'; i++) h.step(1);
    assert.equal(fight.phase, 'tell');
    h.step(36);
    assert.ok(Math.hypot(boss.vel.x, boss.vel.z) < 8, 'the real body settles before the locked warning fires');
    for (let i = 0; i < 1000 && !(fight.cast?.beatId === 'siphon_jet' && fight.phase === 'active'); i++) h.step(1);
    assert.equal(fight.cast?.beatId, 'siphon_jet');
    assert.equal(fight.phase, 'active');
    const heading = fight.cast.heading, locked = clone(fight.cast.shapes);
    const jetStart = { x: boss.pos.x, z: boss.pos.z };
    h.step(35);
    const along = (boss.pos.x - jetStart.x) * Math.cos(heading) + (boss.pos.z - jetStart.z) * Math.sin(heading);
    const side = -(boss.pos.x - jetStart.x) * Math.sin(heading) + (boss.pos.z - jetStart.z) * Math.cos(heading);
    assert.ok(along > 12, `the active siphon produces actual forward travel: ${along}`);
    assert.ok(Math.abs(side) < profile.coreRadius * .3, `the lunge stays on its committed bearing: ${side}`);
    assert.deepEqual(fight.cast.shapes, locked, 'physics displacement does not move the warning or damage region');
    while (fight.phase !== 'recovery') h.step(1);
    h.step(59);
    assert.ok(Math.hypot(boss.vel.x, boss.vel.z) < 8, 'recovery visibly spends the burst momentum');
    assert.equal(h.state.capitalBossEncounters.orders[capitalOrderKey(boss.id)].brake, true);
  } finally { h.dispose(); }
});
