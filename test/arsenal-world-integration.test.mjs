import assert from 'node:assert/strict';
import test from 'node:test';
import { createSimulation } from '../src/core/sim.js';
import { createNodeProductionSystemLookup } from '../src/runtime/nodeSystemFactoryTable.js';
import { environmentMaterials, addEnvironmentHeat } from '../src/systems/environmentMaterials.js';
import { environmentSurfaceData } from '../src/data/environmentMaterials.js';
import { save } from '../src/save/saveSystem.js';
import { world } from '../src/systems/world.js';
import { MIGRATIONS } from '../src/save/migrations.js';
import { CURRENT_VERSION } from '../src/data/saveVersion.js';
import { combat } from '../src/systems/combat.js';
import { insertAsteroidFieldRock } from '../src/world/asteroidField.js';
import { queryPhysicalBodies } from '../src/combat/physicalEffects.js';

function harness() {
  const sim = createSimulation({ seed: 4242, systems: [environmentMaterials, save] });
  sim.state.mode = 'flight';
  const player = sim.spawn({ type: 'ship', pos: { x: -300, z: 0 }, radius: 6,
    hull: 100, hullMax: 100, flags: {}, data: { defId: 'ship_kestrel', fittings: [] } });
  sim.state.playerId = player.id;
  return sim;
}

test('the Node production runtime contains the same physical material owner as the browser', () => {
  assert.equal(createNodeProductionSystemLookup().get('environmentMaterials'), environmentMaterials);
});

test('a real save envelope restores a pending fracture and partial heat before simulation resumes', () => {
  const sim = harness();
  try {
    const crystal = sim.spawn({ type: 'asteroid', pos: { x: 300, z: 0 }, radius: 20,
      hull: 100, hullMax: 100, flags: { persistent: true },
      data: environmentSurfaceData('crystal', { typeId: 'ast_crystalline', yieldU: 20 }) });
    const metal = sim.spawn({ type: 'asteroid', pos: { x: 700, z: 0 }, radius: 20,
      hull: 100, hullMax: 100, flags: { persistent: true },
      data: environmentSurfaceData('metal', { typeId: 'ast_metallic' }) });
    addEnvironmentHeat(sim.state, crystal, 48, { actorId: sim.state.playerId });
    addEnvironmentHeat(sim.state, metal, 17);
    const owner = sim.registry.get('save');
    const envelope = JSON.parse(JSON.stringify(owner.serialize('arsenal-test')));
    assert.equal(envelope.version, CURRENT_VERSION);
    assert.equal(envelope.data.environmentMaterials.reactions.length, 1);
    sim.state.materialReactions = [];
    sim.registry.get('environmentMaterials').update(1 / 60);
    assert.equal(owner.loadEnvelope(envelope, 'arsenal-test'), true);
    assert.equal(sim.state.materialReactions.length, 1, 'the real restore dispatcher retained the work');
    const restoredMetal = sim.state.entityList.find(e => e.alive && e.data?.material === 'metal');
    assert.equal(restoredMetal.data.materialCondition.heat, 17);
    sim.registry.get('environmentMaterials').update(1 / 60);
    assert.equal(sim.state.entityList.filter(e => e.alive && e.data?.materialFragment).length, 4);
    assert.equal(sim.state.materialReactions.length, 0);
  } finally { sim.dispose(); }
});

test('saving partial heat writes the durable resource record before world is serialized', () => {
  const sim = harness();
  try {
    const worldOwner = Object.create(world);
    worldOwner.state = sim.state;
    const originalGet = sim.registry.get.bind(sim.registry);
    sim.registry.get = name => name === 'world' ? worldOwner : originalGet(name);
    const rock = sim.spawn({ type: 'asteroid', pos: { x: 300, z: 0 }, radius: 20,
      hull: 100, hullMax: 100, data: environmentSurfaceData('crystal', {
        typeId: 'ast_crystalline', fieldId: 'arsenal-test', asteroidSlotId: '1',
        homeSectorId: 'sector_helios_prime', oreHP: 100, yieldU: 20,
      }) });
    addEnvironmentHeat(sim.state, rock, 24);
    const data = sim.registry.get('save').serializeData();
    const records = Object.values(data.world.resourceBodies.byId);
    const record = records.find(r => r.material === 'crystal');
    assert.ok(record, 'the first save, without a preliminary material snapshot, includes the record');
    assert.equal(record.materialCondition.heat, 24);
  } finally { sim.dispose(); }
});

test('v14 saves gain an empty reaction queue and an existing v15 queue survives repeated migration', () => {
  const migrate = MIGRATIONS.find(row => row.from === 14 && row.to === 15).fn;
  const old = { player: { credits: 123 } };
  migrate(old);
  assert.deepEqual(old.environmentMaterials, { reactions: [], blasts: [] });
  const current = { environmentMaterials: { reactions: [{ id: 7 }], blasts: [{ sourceId: 9 }] } };
  migrate(current); migrate(current);
  assert.deepEqual(current.environmentMaterials, { reactions: [{ id: 7 }], blasts: [{ sourceId: 9 }] });
});

test('a beam stops visually and physically at the first surface, not the nearest body center', () => {
  const sim = harness();
  try {
    const rock = sim.spawn({ type: 'asteroid', pos: { x: 80, z: 0 }, radius: 30, collides: true });
    sim.spawn({ type: 'ship', pos: { x: 60, z: 0 }, radius: 5, team: 2, hull: 100, collides: true });
    const beam = { from: { x: 0, z: 0 }, to: { x: 200, z: 0 },
      ownerId: sim.state.playerId, dpsThisTick: 2, dmgType: 'kinetic' };
    sim.state.combat.beams = [beam];
    const hits = [];
    const host = { helpers: sim.helpers, bus: sim.bus, onHit: hit => hits.push(hit), playerIsDockProtected: () => false };
    combat._applyBeamDamage.call(host, sim.state);
    assert.equal(hits.length, 1);
    assert.equal(hits[0].targetId, rock.id, 'the large rock intercepts before the nearer-center small hull');
    assert.ok(Math.abs(beam.to.x - 47.8) < 1e-6);
    assert.deepEqual(hits[0].pos, beam.to);
  } finally { sim.dispose(); }
});

test('a crowded beam ray admits only its foreground cover, including compact optic grammar', () => {
  const sim = harness();
  try {
    const foreground = insertAsteroidFieldRock(sim.state, { pos: { x: 50, z: 0 }, radius: 8,
      hull: 100, data: { opticMaterial: 'diamond' } });
    for (let i = 0; i < 12; i++) insertAsteroidFieldRock(sim.state, {
      pos: { x: 400 + i * 12, z: 0 }, radius: 3, hull: 100,
    });
    sim.spawn({ type: 'ship', pos: { x: 100, z: 0 }, radius: 5, team: 2, hull: 100, collides: true });
    const beam = { from: { x: 0, z: 0 }, to: { x: 1000, z: 0 },
      ownerId: sim.state.playerId, dpsThisTick: 2, dmgType: 'energy' };
    sim.state.combat.beams = [beam];
    const hits = [], opticContacts = [];
    const off = sim.bus.on('optic:beamContact', req => { opticContacts.push(req.targetId); req.handled = true; });
    combat._applyBeamDamage.call({ helpers: sim.helpers, bus: sim.bus,
      onHit: hit => hits.push(hit), playerIsDockProtected: () => false }, sim.state);
    off();
    assert.deepEqual(opticContacts, [foreground.id]);
    assert.equal(hits.length, 0, 'the optic contact consumes the ray before hull damage');
    assert.ok(Math.abs(beam.to.x - 39.8) < 1e-6);
    assert.equal(sim.state.world.asteroidField.rocks.length, 12, 'all rocks behind cover remain compact');
    assert.ok(sim.state.entities.get(foreground.id), 'only the winning recipient is promoted');
  } finally { sim.dispose(); }
});

test('compact cover still occludes a beam when the shared promotion budget is spent', () => {
  const sim = harness();
  try {
    for (let i = 0; i < 12; i++) insertAsteroidFieldRock(sim.state, {
      pos: { x: 400 + i * 12, z: 100 }, radius: 3, hull: 100,
    });
    queryPhysicalBodies(sim.state, { x: 470, z: 100 }, 100, sim.helpers);
    const foreground = insertAsteroidFieldRock(sim.state, { pos: { x: 50, z: 0 }, radius: 8, hull: 100 });
    sim.spawn({ type: 'ship', pos: { x: 100, z: 0 }, radius: 5, team: 2, hull: 100, collides: true });
    const beam = { from: { x: 0, z: 0 }, to: { x: 200, z: 0 },
      ownerId: sim.state.playerId, dpsThisTick: 2, dmgType: 'kinetic' };
    sim.state.combat.beams = [beam];
    const hits = [];
    combat._applyBeamDamage.call({ helpers: sim.helpers, bus: sim.bus,
      onHit: hit => hits.push(hit), playerIsDockProtected: () => false }, sim.state);
    assert.equal(hits.length, 0, 'no recipient behind unadmitted cover takes damage');
    assert.ok(Math.abs(beam.to.x - 39.8) < 1e-6);
    assert.ok(sim.state.world.asteroidField.byId.has(foreground.id));
    assert.equal(sim.state.entities.has(foreground.id), false, 'the shared budget is never bypassed');
  } finally { sim.dispose(); }
});
