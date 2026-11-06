// Focused staged fixture: the actual authored one-off, native collisions and public Line owner.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { world as worldSystem } from '../src/systems/world.js';
import { tetherGameplay, isAttachable } from '../src/systems/tetherGameplay.js';
import { getCombatKernel } from '../src/combat/kernel.js';
import { WORLD_ONE_OFFS } from '../src/data/worldOneOffs.js';
import { SECTORS } from '../src/data/sectors.js';
import { VX_FREE_DRIVE_RESERVATION_DISCS, VX_FREE_DRIVE_STRUCTURES } from '../src/data/vxFreeDriveRing.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';
import { fittingsFromDefaultModules, getDerivedStats } from '../src/systems/ships.js';
import { towClassMassFor } from '../src/systems/shipCapabilities.js';
import { RESIDENCY_TIER } from '../src/data/sectorCoordinates.js';
import { isForceableFieldBody, fieldBodyProfile } from '../src/core/fields/fieldReadModel.js';
import { fieldAffectsBody, fieldContainsPoint } from '../src/core/fields/fieldKernel.js';
import { STARTER_FIELD_MACHINE, killMachineFieldCenter, killMachineFieldDir, killMachinePhase } from '../src/data/environmentalMachinery.js';
import { environmentalMachinery } from '../src/systems/environmentalMachinery.js';
import { combat } from '../src/systems/combat.js';

const ID = 'oneoff_cracker_loose_ore_tub', SECTOR = 'sector_helios_prime', DT = 1 / 60;
const sector = SECTORS.find(s => s.id === SECTOR);
function setup() {
  const sim = createSimulation({ seed: 4242, systems: [combat], updateOrder: [] });
  sim.state.mode = 'flight'; sim.state.world.currentSectorId = SECTOR;
  const world = Object.create(worldSystem); world.init(sim.registry.ctx);
  const active = { pois: [], stations: [], gates: [], dressing: [], enemies: [] };
  world._spawnWorldOneOffs(sector, active);
  const body = sim.state.entityList.find(e => e.data?.oneOffId === ID);
  assert.ok(body, 'authored body materialized');
  return { sim, world, active, body };
}

test('fixture: loaded tub placement, starter fit, native shove and Line move the same body', async () => {
  const h = setup(), { sim, body } = h;
  let native = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: DT });
  try {
    const spec = WORLD_ONE_OFFS.find(row => row.id === ID);
    assert.equal(spec.placeId, 'place_ore_bulk_container');
    assert.equal(body.mass, 24); assert.equal(body.radius, 12);
    assert.ok(VX_FREE_DRIVE_RESERVATION_DISCS.some(d => Math.hypot(d.localPos.x - 1020, d.localPos.z - 80) + body.radius <= d.radius));
    for (const structure of VX_FREE_DRIVE_STRUCTURES) {
      assert.ok(Math.hypot(structure.localPos.x - 1020, structure.localPos.z - 80) > structure.radius + body.radius,
        `starting tub clears ${structure.id}`);
    }
    const fittings = fittingsFromDefaultModules(NEW_GAME.shipId, NEW_GAME.fittedModules.slice());
    const derived = getDerivedStats(NEW_GAME.shipId, fittings, null);
    assert.ok(towClassMassFor(derived) > body.mass);
    const player = sim.spawn({ type: 'ship', isPlayer: true, team: 0,
      pos: { x: body.pos.x - 23, z: body.pos.z }, vel: { x: 30, z: 0 },
      radius: 8, mass: derived.operationalMass || derived.mass, hull: 100, hullMax: 100, collides: true,
      fittings, derived, data: { derived },
      physicsBody: { schemaVersion: 1, dynamic: true, shape: 'ball', radius: 8, mass: derived.operationalMass || derived.mass, inertiaY: 1000 } });
    sim.state.playerId = player.id; sim.helpers.combatPhysics = native;
    native.syncFromEntities([player, body]);
    const start = body.pos.x;
    for (let i = 0; i < 60; i++) native.step(DT, i + 1);
    assert.ok(body.pos.x > start + 1, `native hull shove moves tub: ${body.pos.x - start}`);
    // Stage an approach to this same native entity, then fire the ordinary tether input.
    native.dispose();
    player.pos.x = body.pos.x - 45; player.pos.z = body.pos.z;
    player.vel.set(0, 0, 0); body.vel.set(0, 0, 0);
    native = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: DT });
    sim.helpers.combatPhysics = native;
    native.syncFromEntities([player, body]);
    const tether = Object.create(tetherGameplay); tether.init(sim.registry.ctx);
    assert.equal(isAttachable(body, player.id, sim.state), true);
    sim.state.input.tetherMode = 'nearest';
    sim.state.input.actions = { tetherFire: true, tetherCut: false, reelDelta: 0 };
    const denied = []; sim.bus.on('tether:latchDenied', row => denied.push(row));
    tether.update(DT, sim.state); sim.state.input.actions.tetherFire = false;
    const kernel = getCombatKernel(sim.registry.ctx);
    const line = kernel.attachments.listForEntity(body.id).find(row => row.state === 'active');
    assert.ok(line, JSON.stringify(denied));
    const towStart = body.pos.x;
    for (let tick = 1; tick <= 180; tick++) {
      // Fixture propulsion: impulse on the player only; the actual native Line moves the tub.
      native.applyImpulse({ entityId: player.id, impulse: { x: -player.mass * 0.12, z: 0 } });
      sim.state.tick++; sim.state.simTime += DT;
      native.step(DT, tick); kernel.attachments.updateTelemetryAndBreak();
    }
    assert.ok(body.pos.x < towStart - 1, `Line moves the same tub: ${body.pos.x - towStart}`);
  } finally { native.dispose(); sim.dispose(); }
});

test('fixture: canonical Cracker surge registers a field eligible for the tub', () => {
  const { sim, body } = setup();
  try {
    const machine = STARTER_FIELD_MACHINE, phase = killMachinePhase(machine, 3);
    assert.equal(phase.phase, 'surge');
    let field;
    const adapter = Object.create(environmentalMachinery);
    adapter.state = sim.state; adapter._killFieldStrength = new Map();
    adapter._fieldsSystem = () => ({ registerEnvironmental: f => { field = f; }, hasExternal: () => false });
    adapter._upsertKillMachineFields(machine, phase);
    assert.ok(field); assert.ok(field.strength > 0);
    assert.equal(isForceableFieldBody(body), true);
    assert.equal(fieldAffectsBody(field, fieldBodyProfile(body, sim.state)), true);
    const center = killMachineFieldCenter(machine, machine.fields[0]);
    const dir = killMachineFieldDir(machine, machine.fields[0]);
    assert.equal(fieldContainsPoint(field, center.x + dir.x * 50, center.z + dir.z * 50), true);
  } finally { sim.dispose(); }
});

test('fixture: moved and destroyed tub retain finite world-record custody', () => {
  const h = setup(), { body, world, sim } = h;
  const recordId = body.data.worldRecordId;
  body.pos.x += 210; body.pos.z += 80;
  const moved = { x: body.pos.x, z: body.pos.z };
  world._captureSectorDurableRecords(SECTOR, { reason: 'loose-tub-fixture' });
  const records = JSON.parse(JSON.stringify(sim.state.world.records));
  assert.equal(records.byId[recordId].pos.x, moved.x);
  const restored = setup();
  try {
    // Remove the fixture's initial actors before applying the captured world to a fresh owner.
    restored.sim.dispose();
    const fresh = createSimulation({ seed: 4242, systems: [], updateOrder: [] });
    fresh.state.mode = 'flight';
    const w = Object.create(worldSystem); w.init(fresh.registry.ctx);
    w.deserialize({ currentSectorId: SECTOR, coordinateSchema: 'global_v1', discovery: {}, records });
    const active = { pois: [], stations: [], gates: [], dressing: [], enemies: [] };
    w._rematerializeSectorRecords(SECTOR, active, RESIDENCY_TIER.FULL, { restoreDurableRecords: true });
    w._spawnWorldOneOffs(sector, active);
    const matches = fresh.state.entityList.filter(e => e.data?.worldRecordId === recordId && e.alive !== false);
    assert.equal(matches.length, 1); assert.equal(matches[0].pos.x, moved.x); assert.equal(matches[0].pos.z, moved.z);
    matches[0].alive = false;
    fresh.bus.emit('entity:killed', { id: matches[0].id, type: 'wreck' });
    assert.equal(fresh.state.world.records.byId[recordId].outcome, 'destroyed');
    const tombstones = JSON.parse(JSON.stringify(fresh.state.world.records));
    const after = createSimulation({ seed: 4242, systems: [], updateOrder: [] });
    after.state.mode = 'flight';
    const wa = Object.create(worldSystem); wa.init(after.registry.ctx);
    wa.deserialize({ currentSectorId: SECTOR, coordinateSchema: 'global_v1', discovery: {}, records: tombstones });
    const activeAfter = { pois: [], stations: [], gates: [], dressing: [], enemies: [] };
    wa._rematerializeSectorRecords(SECTOR, activeAfter, RESIDENCY_TIER.FULL, { restoreDurableRecords: true });
    wa._spawnWorldOneOffs(sector, activeAfter);
    assert.equal(after.state.entityList.filter(e => e.data?.worldRecordId === recordId && e.alive !== false).length, 0);
    after.dispose(); fresh.dispose();
  } finally { sim.dispose(); }
});
