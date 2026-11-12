import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { queuePhysicsImpulse } from '../src/core/physicsAuthority.js';
import { FIELD_FLAGS } from '../src/data/fields.js';
import { createFieldKernel, fieldContainsPoint } from '../src/core/fields/fieldKernel.js';
import { KILNBACK as C, KILNBACK_ENEMY as R, KILNBACK_CASK_IDS, kilnbackPointPose, kilnbackCoolant } from '../src/data/kilnback.js';
import { ENEMY_TYPES } from '../src/data/enemies.js';
import { kilnbackPhysicalBody, kilnbackCaskSocket } from '../src/data/kilnbackBody.js';
import { kilnback, kilnbackEncounter } from '../src/systems/kilnback.js';
import { kilnbackDecision } from '../src/ai/kilnback.js';
import { authorizeAIEngagement } from '../src/ai/engagementAuthority.js';
import { fields } from '../src/systems/fields.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { normalizeActivity } from '../src/ai/doctrine.js';
import { getCombatKernel } from '../src/combat/kernel.js';
import { scalarHitToDamagePacket } from '../src/combat/damage.js';

// Focused construction through ordinary ship/native/combat helpers. The separate production
// route test uses the actual registered enemy factory and authored encounter admission.
function kilnbackFixtureSpec(pos = { x: 0, z: 0 }) {
  const spec = makeShipEntitySpec(R.shipId, { team: 1, factionId: R.factionId, pos });
  Object.assign(spec, { hull: R.hull, hullMax: R.hull, armorHp: R.armor, armorMax: R.armor,
    armorFlat: R.armorFlat, shield: R.shield, shieldMax: R.shield, shieldRegenRate: R.shieldRegen,
    cap: R.cap, capMax: R.cap, capRegen: R.capRegen, maxSpeed: R.maxSpeed, thrust: R.accel,
    turnRate: R.turnRate, radius: R.collisionRadius, mass: R.mass, physicsBody: kilnbackPhysicalBody() });
  Object.assign(spec.data, { lootTableId: R.id, shipClass: R.shipClass, weapons: [], fittings: [], miningBeam: null,
    ai: { archetype: R.aiArchetype, combatDoctrineId: R.combatDoctrineId,
      activity: normalizeActivity({ kind: R.aiDoctrine.defaultActivity, startedTick: 0 }), roe: R.aiDoctrine.roe,
      motive: 'industrial_interdiction', engagementTrigger: 'furnace_lane', zoneId: 'fixture:kilnback',
      approachTelegraph: R.telegraph.line, noFireResponseWindowS: 1 } });
  return spec;
}

function fixture(native = null, bearing = 0) {
  const oldFlag = FIELD_FLAGS.enabled; FIELD_FLAGS.enabled = true;
  const ph = { name: 'physics', init() { this._sg02 = native; } };
  const sim = createSimulation({ seed: 83, systems: [ph, fields, { name: 'scissorwake', serialize() { return { introduced: true }; } }, kilnback] });
  const s = sim.state, helpers = sim.registry.ctx.helpers;
  s.settings.gameplay.physicsBackend = native ? 'rapier-dynamic' : 'legacy';
  s.mode = 'flight'; s.tick = 120; s.simTime = 2; s.world.currentSectorId = C.sectorId;
  const player = helpers.spawnEntity({ type: 'ship', team: 0, hull: 1000, hullMax: 1000, shield: 0,
    radius: 4, mass: 40, pos: { x: Math.cos(bearing) * 90, z: Math.sin(bearing) * 90 },
    physicsBody: { schemaVersion: 1, dynamic: true, shape: 'ball', radius: 4, mass: 40, inertiaY: 80 }, data: {} });
  s.playerId = player.id; player.isPlayer = true;
  const caster = helpers.spawnEntity(kilnbackFixtureSpec());
  caster.data.encounter = { id: 'fixture:kilnback' }; // the actual director stamps this authored relation
  caster.rot = bearing;
  const system = sim.registry.get('kilnback'), field = sim.registry.get('fields');
  const row = system.bind(caster, 'fixture'); native?.syncFromEntities(s.entityList);
  const tick = () => {
    s.tick++; s.simTime = s.tick / 60;
    system.update(1 / 60, s); field.update(1 / 60, s);
    if (native) { native.syncFromEntities(s.entityList); native.step(1 / 60, s.tick); }
  };
  const damage = (entity, amount, pos = entity.pos) => {
    const packet = scalarHitToDamagePacket({ damage: amount, damageType: 'kinetic', pos: { ...pos } });
    return getCombatKernel(sim.registry.ctx).routeDamage({ attackerId: player.id, targetId: entity.id, packet });
  };
  const until = (condition, cap = 450) => { let n = 0; while (!condition() && n++ < cap) tick();
    assert.ok(condition(), `source phase ${row.phase} did not reach the bounded test target`); };
  const close = () => { system.destroy(); field.destroy?.(); sim.dispose(); FIELD_FLAGS.enabled = oldFlag; };
  return { sim, s, player, caster, system, field, row, tick, until, damage, helpers, close };
}

for (const bearing of [0, Math.PI / 2, Math.PI, -Math.PI / 2])
  test(`full non-flash warning before real heat from bearing ${bearing}`, () => {
    const h = fixture(null, bearing);
    try {
      const cues = []; h.sim.bus.on('kilnback:phase', p => cues.push(p));
      h.tick(); assert.equal(h.row.phase, 'preheat', JSON.stringify(authorizeAIEngagement({ state: h.s,
        self: h.caster, target: h.player, objectiveReason: 'combat_doctrine:brawler_commit:commit' }))); const start = h.row.phaseStartTick;
      h.until(() => h.s.tick >= start + C.preheatTicks - 1);
      assert.equal(h.player.hull, 1000); assert.equal(h.field._kernel.list().filter(f => f.thermal).length, 0);
      h.tick(); assert.equal(h.row.phase, 'burn'); assert.ok(h.player.hull < 1000);
      assert.equal(cues[0].phase, 'preheat'); assert.equal(h.row.pulse, 1);
      assert.equal(kilnbackCoolant(h.row), 5);
    } finally { h.close(); }
  });

test('six committed lanes are directional, expire and cannot refresh empty coolant', () => {
  const h = fixture();
  try {
    const seen = []; h.sim.bus.on('fields:thermalCreated', p => { if (p.kind === 'burn') seen.push(p); });
    h.tick(); h.until(() => h.row.phase === 'burn');
    const first = h.field._kernel.list().find(f => f.thermal?.kind === 'burn');
    assert.equal(fieldContainsPoint(first, -30, 0), false);
    const direction = { ...first.dir }; h.caster.rot = Math.PI / 2;
    assert.deepEqual(first.dir, direction, 'expelled lane cannot track a rotating hull');
    h.until(() => h.row.phase !== 'burn');
    assert.equal(seen.length, 6); assert.ok(seen.some(p => p.dir.z > .9));
    for (const id of KILNBACK_CASK_IDS) h.row.casks[id].coolant = 0;
    h.until(() => h.row.phase !== 'vent');
    assert.equal(h.row.phase, 'retreat'); const count = seen.length;
    for (let i = 0; i < 180; i++) h.tick(); assert.equal(seen.length, count);
    assert.equal(h.field._kernel.list().filter(f => f.thermal).length, 0);
    const d = kilnbackDecision({ entityId: h.caster.id, maneuver: { kind: 'intercept' }, fire: true }, h.s);
    assert.equal(d.maneuver.kind, 'retreat'); assert.equal(d.fire, false);
  } finally { h.close(); }
});

test('cover blocks a real lane, local coolant prevents furnace heat without damage', () => {
  const h = fixture();
  try {
    h.tick(); h.until(() => h.row.phase === 'burn');
    const before = h.player.hull;
    const rock = h.helpers.spawnEntity({ type: 'asteroid', hull: 300, radius: 12, pos: { x: 55, z: 0 },
      physicsBody: { schemaVersion: 1, dynamic: false, shape: 'ball', radius: 12, mass: 500 }, data: {} });
    for (let i = 0; i < 15; i++) h.tick(); assert.equal(h.player.hull, before);
    h.helpers.removeEntity(rock.id);
    const coolant = h.field.registerThermal({ id: 'fixture:coolant', kind: 'well', center: { ...h.player.pos },
      radius: 90, durationS: 4, thermal: { family: 'kilnback', kind: 'coolant', sourceKey: h.row.key } });
    assert.ok(coolant); assert.equal(coolant.thermal.damagePerSecond, 0);
    for (let i = 0; i < 15; i++) h.tick(); assert.equal(h.player.hull, before);
    assert.equal(h.field.thermalPointCooled(h.player.pos), true);
  } finally { h.close(); }
});

test('real cask hit severs one part; rotating point velocity, mass and one coolant receipt survive repeated restore', () => {
  const h = fixture();
  try {
    h.caster.vel.x = 17; h.caster.vel.z = -3; h.caster.angVel = .5;
    const location = kilnbackPointPose(h.caster, kilnbackCaskSocket('cask_port'));
    assert.equal(h.damage(h.caster, 45, location).ok, true);
    assert.equal(h.row.casks.cask_port.status, 'releasing'); assert.equal(h.caster.mass, 165);
    h.tick(); const cask = h.system._find(h.row.key, 'cask_port'); assert.ok(cask);
    assert.equal(cask.mass, 15); assert.ok(Math.abs(cask.vel.x - location.vx) < 1e-9);
    assert.ok(Math.abs(cask.vel.z - location.vz) < 1e-9);
    let patches = 0; h.sim.bus.on('kilnback:coolantReleased', () => patches++);
    assert.equal(h.damage(cask, 100).ok, true); assert.equal(patches, 1);
    const saved = h.system.serialize(), fieldsSaved = h.field.serialize();
    h.system.deserialize(saved); h.field.deserialize(fieldsSaved); h.system.afterContinue();
    h.system.deserialize(saved); h.field.deserialize(fieldsSaved); h.system.afterContinue();
    const row = h.system._actors.get(h.row.key);
    assert.equal(row.casks.cask_port.coolant, 0); assert.equal(row.casks.cask_port.status, 'spent');
    h.sim.bus.emit('entity:killed', { id: cask.id }); assert.equal(patches, 1);
    assert.equal(h.field._kernel.list().filter(f => f.thermal?.kind === 'coolant').length, 1);
    h.tick(); assert.equal(h.system._find(h.row.key, 'cask_port'), null);
  } finally { h.close(); }
});

test('save during burn resumes remaining pulses once and keeps finite stock', () => {
  const h = fixture();
  try {
    h.tick(); h.until(() => h.row.phase === 'burn' && h.row.pulse >= 3);
    const saved = h.system.serialize(), fieldSaved = h.field.serialize(), originalAttack = h.row.attack;
    h.system.deserialize(saved); h.field.deserialize(fieldSaved); h.system.afterContinue();
    h.system.deserialize(saved); h.field.deserialize(fieldSaved); h.system.afterContinue();
    const row = h.system._actors.get(h.row.key); const ids = [];
    h.sim.bus.on('fields:thermalCreated', p => { if (p.kind === 'burn') ids.push(p.fieldId); });
    h.until(() => row.phase !== 'burn');
    assert.equal(row.attack, originalAttack); assert.equal(row.pulse, 6); assert.equal(ids.length, 3);
    assert.equal(new Set(ids).size, 3); assert.equal(kilnbackCoolant(row), 5);
    h.system.newGame(); assert.equal(h.system.serialize().actors.length, 0);
    assert.equal(h.system.serialize().introduced, false);
  } finally { h.close(); }
});

test('native compound removes its part before admitting detached mass, and a physical shove burns the caster back', async () => {
  const native = await createSg02DynamicBodyOwner({ publishTelemetry: false }); const h = fixture(native);
  try {
    const before = native.records.get(h.caster.id); assert.ok(before);
    assert.equal(h.system.sever(h.row.key, 'cask_port').ok, true);
    h.system._materialize(h.row); assert.equal(h.system._find(h.row.key, 'cask_port'), null);
    native.syncFromEntities(h.s.entityList); h.system._materialize(h.row);
    const cask = h.system._find(h.row.key, 'cask_port'); assert.ok(cask);
    assert.equal(native.records.get(h.caster.id).proxyId, kilnbackPhysicalBody(['cask_starboard'], 1).collisionProxyManifest.id);
    assert.equal(h.caster.mass + cask.mass, 180);
    native.syncFromEntities(h.s.entityList); h.tick(); h.until(() => h.row.phase === 'burn');
    const startVitals = h.caster.hull + h.caster.armorHp, startX = h.caster.pos.x;
    queuePhysicsImpulse(h.caster, { x: h.caster.mass * 120, z: 0 });
    let burnback = 0; h.sim.bus.on('fields:thermalHit', p => { if (p.selfBurn) burnback++; });
    for (let i = 0; i < 24; i++) h.tick();
    assert.ok(h.caster.pos.x > startX + 14, 'only native momentum moved the caster into its expelled lane');
    assert.ok(h.caster.hull + h.caster.armorHp < startVitals); assert.ok(burnback > 0);
  } finally { h.close(); native.dispose(); }
});

test('encounter adapter spawns one caster and refuses a second live furnace', () => {
  const h = fixture();
  try {
    h.helpers.removeEntity(h.caster.id); h.s.simTime = C.earliestSeconds;
    const live = { id: 'fixture:normal-director', plan: { ships: [] }, data: {}, ids: [] };
    let spawned = 0, aborted = null;
    const director = { now: () => h.s.simTime, spawnShips(l) {
      const e = h.helpers.spawnEntity(kilnbackFixtureSpec());
      l.ids.push(e.id); spawned++; return [e.id]; }, say() {}, abort(_l, reason) { aborted = reason; } };
    kilnbackEncounter.fire(director, live, h.s);
    assert.equal(spawned, 1); assert.equal(aborted, null); assert.equal(live.phase, 'conflict');
    kilnbackEncounter.fire(director, { ...live, id: 'duplicate' }, h.s);
    assert.equal(spawned, 1); assert.equal(aborted, 'kilnback_already_live');
    const original = h.s.entityList.find(e => e.alive && e.data?.lootTableId === C.enemyId);
    h.helpers.removeEntity(original.id); kilnbackEncounter.fire(director, { ...live, id: 'repeat' }, h.s);
    assert.equal(spawned, 1); assert.equal(aborted, 'kilnback_introduction_complete');
  } finally { h.close(); }
});

test('ordinary fields keep their prior shape and invalid/infinite thermal recipes fail closed', () => {
  assert.equal(ENEMY_TYPES.find(e => e.id === R.id), R, 'live roster shares the canonical finite furnace recipe');
  const kernel = createFieldKernel();
  assert.equal(Object.hasOwn(kernel.register({ id: 'ordinary', kind: 'well', durationS: 4 }), 'thermal'), false);
  const h = fixture();
  try {
    assert.equal(h.field.registerThermal({ id: 'bad', radius: 90, durationS: Infinity,
      thermal: { family: 'kilnback', kind: 'burn', sourceKey: 'bad' } }), null);
    assert.equal(h.field.registerThermal({ id: 'bad', radius: 90, durationS: 4,
      thermal: { family: 'invented', kind: 'burn', sourceKey: 'bad' } }), null);
  } finally { h.close(); }
});


test('lethal hull damage removes original cask mass before core wreck capture', () => {
  const h = fixture();
  try {
    let massAtKill = null;
    h.sim.bus.on('entity:killed', p => { if (p.id === h.caster.id) massAtKill = h.caster.mass; });
    assert.equal(h.damage(h.caster, 1000).ok, true);
    assert.equal(massAtKill, 150); assert.equal(h.row.phase, 'lost');
    h.tick();
    const casks = KILNBACK_CASK_IDS.map(id => h.system._find(h.row.key, id));
    assert.ok(casks.every(Boolean)); assert.equal(casks.reduce((sum, e) => sum + e.mass, massAtKill), 180);
    assert.equal(casks.filter(e => e.data.salvagePool.cmdty_fuel_cells === 1).length, 1);
    h.sim.bus.emit('entity:killed', { id: h.caster.id }); h.tick();
    assert.equal(h.s.entityList.filter(e => e.alive && e.data?.kilnbackCaskId).length, 2);
  } finally { h.close(); }
});

test('one original intact cask uses explicit existing cargo acceptance; decline/loss cannot mint a replacement', () => {
  const h = fixture();
  try {
    h.system.sever(h.row.key, 'cask_port'); h.system.sever(h.row.key, 'cask_starboard'); h.tick();
    const cask = h.system._find(h.row.key, 'cask_port');
    assert.equal(cask.data.salvagePool.cmdty_fuel_cells, 1);
    const event = { pickupId: cask.id, collectorId: h.player.id, commodityId: 'cmdty_fuel_cells', amount: 1 };
    h.sim.bus.emit('pickup:collected', event); event.acceptedAmount = 0; event.rejectedAmount = 1;
    h.system.serialize(); assert.equal(h.row.rewardClaimed, false); assert.equal(cask.alive, true);
    const accepted = { ...event, acceptedAmount: 1, rejectedAmount: 0 };
    h.sim.bus.emit('pickup:collected', accepted);
    const saved = h.system.serialize(); assert.equal(h.row.rewardClaimed, true);
    assert.equal(cask.alive, false); assert.equal(h.row.casks.cask_port.status, 'collected');
    h.system.deserialize(saved); h.system.afterContinue(); h.tick();
    assert.equal(h.system._find(h.row.key, 'cask_port'), null);
    assert.deepEqual(h.system._find(h.row.key, 'cask_starboard').data.salvagePool, {});
    const remaining = h.system._find(h.row.key, 'cask_starboard'); h.helpers.removeEntity(remaining.id); h.tick();
    assert.equal(h.system._find(h.row.key, 'cask_starboard'), null);
    assert.equal(h.system.serialize().actors[0].casks.cask_starboard.status, 'destroyed');
  } finally { h.close(); }
});

test('thermal save capacity keeps finite lanes and presentation never becomes a generic force tool', () => {
  const h = fixture();
  try {
    for (let i = 0; i < 36; i++) h.field._kernel.register({ id: `a:${i}`, kind: 'well', createdAt: h.s.simTime, durationS: 500 });
    h.tick(); h.until(() => h.row.phase === 'burn');
    const lanes = h.field.thermalFieldsForSource(h.row.key, h.caster.occupantGeneration);
    assert.equal(lanes.length, 1); assert.ok(lanes[0].expireAt > h.s.simTime);
    assert.ok(h.field.serialize().fields.some(f => f.id === lanes[0].id));
    assert.equal(h.s.fields.active.some(f => f.id === lanes[0].id), false);
    h.system.sever(h.row.key, 'cask_port'); h.system.sever(h.row.key, 'cask_starboard'); h.tick();
    assert.equal(h.row.phase, 'retreat'); assert.equal(h.row.pulse, 1);
  } finally { h.close(); }
});


test('a reused source life cannot inherit the finite attack or cask custody', () => {
  const h = fixture();
  try {
    h.tick(); const attack = h.row.attack; h.caster.occupantGeneration++;
    h.tick(); assert.equal(h.row.attack, attack);
    assert.equal(h.system._find(h.row.key), null); assert.equal(h.system.bind(h.caster), null);
  } finally { h.close(); }
});


test('a future restored burn enters a quiet vent before any new full warning', () => {
  const h = fixture();
  try {
    const saved = h.system.serialize(); saved.actors[0].phase = 'burn'; saved.actors[0].phaseStartTick = h.s.tick + 100;
    h.system.deserialize(saved); h.system.afterContinue(); h.tick();
    assert.equal(h.system.serialize().actors[0].phase, 'vent');
    assert.equal(h.field._kernel.list().filter(f => f.thermal).length, 0); assert.equal(h.player.hull, 1000);
  } finally { h.close(); }
});
