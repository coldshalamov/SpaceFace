import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { makeEntity } from '../src/core/entity.js';
import { createCombatKernel } from '../src/combat/kernel.js';
import { createSg02DynamicBodyOwner, createSg02CombatPhysicsPort } from '../src/core/sg02DynamicBodyOwner.js';
import { makeShipEntitySpec, ships as shipsProto } from '../src/systems/ships.js';
import { cargo as cargoProto } from '../src/systems/cargo.js';
import { tetherGameplay as tetherProto } from '../src/systems/tetherGameplay.js';
import { shipjack as shipjackProto } from '../src/systems/shipjack.js';
import { captureReadiness, normalizeShipjack, vesselForEntity, queryShipjack } from '../src/shipjack/model.js';
import { traffic as trafficProto } from '../src/systems/traffic.js';
import { npcJobsRuntime as npcJobsProto } from '../src/systems/npcJobsRuntime.js';
import { hash32 } from '../src/core/rng.js';

async function runtime() {
  const state = createGameState(4242), bus = createBus(), slots = new Map();
  state.mode = 'flight'; state.world.currentSectorId = 'sector_runtime_fixture';
  state.player.ownedShips = [{ defId: 'ship_kestrel', fittings: [], fittedInstances: {} }];
  state.player.activeShipIndex = 0;
  const player = makeEntity(makeShipEntitySpec('ship_kestrel', { isPlayer: true, player: state.player }));
  const target = makeEntity(makeShipEntitySpec('ship_wasp', { team: 2, pos: { x: 65, z: 0 } }));
  player.id = 1; target.id = 2; player.occupantGeneration = 1; target.occupantGeneration = 2;
  player.hull = 61; target.hull = 45; target.shield = 0; target.data.shipjackUncrewed = true;
  state.entities = new Map([[1, player], [2, target]]); state.entityList = [player, target]; state.playerId = 1;
  let nextId = 10;
  const helpers = {
    getEntity: id => state.entities.get(id),
    spawnEntity(spec) {
      const entity = makeEntity(spec); entity.id = ++nextId; entity.occupantGeneration = nextId;
      state.entities.set(entity.id, entity); state.entityList.push(entity);
      bus.emit('entity:spawned', { id: entity.id, type: entity.type, entity });
      return entity;
    },
    removeEntity(id) {
      const entity = state.entities.get(id); state.entities.delete(id);
      state.entityList = state.entityList.filter(item => item.id !== id);
      bus.emit('entity:destroyed', { id, type: entity?.type, entity });
    },
  };
  const native = await createSg02DynamicBodyOwner({ fixedDt: 1 / 60 });
  native.syncFromEntities(state.entityList);
  helpers.combatPhysics = createSg02CombatPhysicsPort(native);
  const registry = { get: name => slots.get(name) || null };
  const ctx = { state, bus, helpers, registry };
  const kernel = createCombatKernel(ctx); slots.set('actions', { kernel }); slots.set('combat', { kernel });
  const ships = Object.create(shipsProto); ships.init(ctx); slots.set('ships', ships);
  const cargo = Object.create(cargoProto); cargo.init(ctx); slots.set('cargo', cargo);
  const tether = Object.create(tetherProto); tether.init(ctx); slots.set('tetherGameplay', tether);
  const system = Object.create(shipjackProto); system.init(ctx); slots.set('shipjack', system);
  const step = seconds => {
    for (let i = 0; i < Math.ceil(seconds * 60); i++) {
      state.tick++; state.simTime = state.tick / 60;
      kernel.prePhysics(1 / 60); system.update(1 / 60, state); kernel.postPhysics();
    }
  };
  const command = (action, entity = target) => system.command({ action, targetId: entity.id, generation: entity.data.shipjackGeneration });
  const dispose = () => { system.destroy(); kernel.dispose(); native.dispose(); };
  return { state, bus, system, kernel, native, player, target, tether, helpers, ships, step, command, dispose, ctx, slots };
}

function capture(rt) {
  assert.equal(rt.command('scan').ok, true);
  assert.equal(rt.command('hail').ok, true);
  rt.step(1.6);
  assert.equal(rt.command('port').ok, true);
  rt.step(1.3);
  assert.equal(rt.command('helm').ok, true);
  assert.equal(rt.state.playerId, rt.player.id, 'custody admission itself never swaps the pilot');
  assert.equal(rt.command('transfer').ok, true);
  rt.step(2.1);
  assert.equal(rt.state.playerId, rt.target.id);
}

test('real scan, crew passage, stable port, custody and vulnerable crossing operate both hulls and reverse', async () => {
  const rt = await runtime();
  try {
    capture(rt);
    const prize = vesselForEntity(rt.state, rt.target);
    assert.equal(prize.title, 'disputed', 'accepted crew passage does not grant legal title');
    assert.equal(rt.state.entities.get(rt.player.id), rt.player);
    assert.equal(rt.player.hull, 61); assert.equal(rt.target.hull, 45);
    assert.equal(rt.command('transfer', rt.player).ok, false, 'the return approach must establish its own dwell');
    rt.step(1.6);
    assert.equal(rt.command('transfer', rt.player).ok, true);
    rt.step(2.1);
    assert.equal(rt.state.playerId, rt.player.id);
    assert.equal(rt.state.player.ownedShips.length, 2);
    assert.equal(rt.player.hull, 61); assert.equal(rt.target.hull, 45);
    assert.ok(queryShipjack(rt.state,rt.target.id).actions.some(row=>row.action==='tow'),'reverse handoff must leave a public tow route for the retained prize');
  } finally { rt.dispose(); }
});

test('live distress marks the actual hull without falsely invoking defeated-player recovery', async()=>{
  const rt=await runtime();
  try{
    let wreckRecoveryRequests=0;
    rt.bus.on('player:recoveryRequested',()=>wreckRecoveryRequests++);
    const result=rt.system.command({action:'distress'});
    assert.equal(result.ok,true);
    assert.match(result.reason,/No rescue tow has accepted/);
    assert.equal(wreckRecoveryRequests,0);
    assert.equal(vesselForEntity(rt.state,rt.player).beacon,true);
    assert.equal(rt.state.playerId,rt.player.id);
    assert.equal(rt.player.hull,61);
  }finally{rt.dispose();}
});

test('remote parked hull survives normalized save, sector reentry twice and source drive damage without cloning', async () => {
  const rt = await runtime();
  try {
    rt.helpers.disableShipjackSubsystem({ entityId: 1, subsystemId: 'subsystem_drive' });
    rt.step(1 / 60);
    capture(rt);
    const old = vesselForEntity(rt.state, rt.player), vesselId = old.vesselId;
    rt.system.parkSector();
    assert.equal(rt.state.entities.has(rt.player.id), false);
    assert.equal(old.location.kind, 'remote');
    rt.state.player.shipjack = normalizeShipjack(JSON.parse(JSON.stringify(rt.state.player.shipjack)));
    rt.state.shipjack = rt.state.player.shipjack;
    rt.system.enterSector(); rt.system.enterSector();
    const materialized = rt.state.entityList.filter(e => e.data?.vesselId === vesselId);
    assert.equal(materialized.length, 1);
    assert.equal(materialized[0].hull, 61);
    assert.equal(rt.state.combat.entities[materialized[0].id].subsystems.subsystem_drive.destroyed, true);
    assert.equal(rt.state.player.ownedShips.length, 2);
    rt.state.player.targetId = materialized[0].id;
    assert.equal(rt.system.navigate(vesselId).ok, true, 'persistent ship retains a real retrieval route');
  } finally { rt.dispose(); }
});

test('capture readiness consumes real Massline mirror and shutdown capability; recycled endpoint invalidates leverage', async () => {
  const rt = await runtime();
  try {
    rt.target.data.shipjackUncrewed = false;
    assert.equal(rt.command('scan').ok, true);
    assert.equal(rt.command('probe').ok, true);
    const result = rt.helpers.requestShipjackShutdown({ actorId: 1, targetId: 2, durationTicks: 360 });
    assert.equal(result.ok, true); rt.step(1 / 60);
    const attachment = rt.kernel.attachments.create({ defId: 'tether_standard', ownerId: 1, targetId: 2 });
    assert.equal(attachment.ok, true);
    const record = Object.values(rt.state.combat.attachments.byId).find(row => row.state === 'active');
    assert.ok(record);
    rt.tether._active = { targetId: 2, attachmentId: record.id };
    rt.tether._mirror(rt.state, 2, 0, 65, 'latched');
    assert.equal(captureReadiness(rt.state, rt.target).ready, true);
    rt.target.occupantGeneration++;
    const stale = captureReadiness(rt.state, rt.target);
    assert.equal(stale.ready, false, 'a stale display mirror cannot authorize a new occupant');
    assert.equal(stale.tethered, false);
  } finally { rt.dispose(); }
});

test('authored evacuated recovery has no pilot to accelerate or be deputized and its drive damage is real', async () => {
  const rt = await runtime();
  try {
    rt.state.world.currentSectorId = 'sector_helios_prime';
    rt.helpers.spawnEntity({ type: 'station', pos: { x: 600, z: 300 }, radius: 80,
      data: { stationId: 'station_helios' }, flags: { persistent: true } });
    rt.system.enterSector();
    const emptySeat = rt.state.entityList.find(e => e.data?.shipjackEncounterId === 'black_flag_empty_seat');
    assert.ok(emptySeat, 'the ordinary sector-enter path creates the authored craft');
    assert.equal(emptySeat.data.ai, null, 'an evacuated hull is not an eligible law responder or AI pilot');
    assert.equal(emptySeat.shieldRegenRate, 0, 'an isolated recovery hull cannot regenerate a boarding barrier');
    assert.equal(emptySeat.data.shipjackUncrewed, true);
    const velocity = { ...emptySeat.vel };
    rt.step(1 / 60);
    assert.equal(rt.state.combat.entities[emptySeat.id].subsystems.subsystem_drive.destroyed, true);
    assert.deepEqual({ ...emptySeat.vel }, velocity, 'canonical disable never rewrites momentum');
    assert.equal(emptySeat.shield, 0);
  } finally { rt.dispose(); }
});

test('ordinary spawned cutter relinquishes its real job and traffic roster; parked reentry cannot reclaim or destroy it', async () => {
  const rt = await runtime();
  let traffic;
  try {
    rt.helpers.removeEntity(rt.target.id); // This case supplies its own ordinary traffic target.
    const jobs = Object.create(npcJobsProto); jobs.init(rt.ctx); rt.slots.set('npcJobsRuntime', jobs);
    traffic = Object.create(trafficProto); traffic.init(rt.ctx); rt.slots.set('traffic', traffic);
    const sectorId = rt.state.world.currentSectorId;
    const angle = ((hash32(4242, 'salvor_spawn', sectorId, 0) >>> 0) / 0xffffffff) * Math.PI * 2;
    const home = { id: 900, pos: { x: 65 - Math.cos(angle) * 100, z: -Math.sin(angle) * 100 }, data: { stationId: 'station_fixture' } };
    const spawned = traffic._spawnGeneralSalvorNear(home, sectorId, 0);
    assert.ok(spawned?.entity, 'ordinary traffic creates a real working cutter');
    const cutter = spawned.entity;
    cutter.data.shipjackUncrewed = true; cutter.shield = 0;
    const manifest = cutter.data.cargoManifest;
    const jobId = rt.helpers.npcJobs.assign(cutter, { kind: 'hauler', sectorId,
      route: [{ id: 'origin', pos: { x: 65, z: 0 } }, { id: 'dest', pos: { x: 400, z: 0 } }], speed: 30 });
    assert.ok(jobId);
    const claim = rt.helpers.npcJobs.claimControl(jobId, { holder: 'fixture', claimId: 'fixture-control', reason: 'capture-test' });
    assert.equal(claim.granted, true);
    assert.equal(rt.command('scan', cutter).ok, true);
    const vessel = vesselForEntity(rt.state, cutter);
    const rel = traffic.relinquishVessel(cutter.id, vessel.vesselId);
    assert.equal(rel.ok, true);
    assert.equal(rt.helpers.npcJobs.get(jobId), null);
    assert.equal(rt.helpers.npcJobs.controlClaim(jobId), null);
    assert.equal(rt.state.traffic.freighters.some(row => row.id === cutter.id), false);
    assert.equal(traffic._active.includes(cutter.id), false);
    assert.equal(cutter.data.cargoManifest, manifest, 'the finite original cargo object remains aboard');
    assert.equal(cutter.alive, true);
    assert.equal(rt.command('hail', cutter).ok, true); rt.step(1.6);
    assert.equal(rt.command('port', cutter).ok, true); rt.step(1.3);
    assert.equal(rt.command('helm', cutter).ok, true);
    assert.equal(rt.command('transfer', cutter).ok, true); rt.step(2.1);
    assert.equal(rt.state.playerId, cutter.id);
    // Leave it again, then exercise the actual traffic hard-exit and generic re-adoption paths.
    assert.equal(rt.command('transfer', rt.player).ok, false); rt.step(1.6);
    assert.equal(rt.command('transfer', rt.player).ok, true); rt.step(2.1);
    assert.equal(rt.state.playerId, rt.player.id);
    traffic._adoptRematerializedTraffic(sectorId, []);
    assert.equal(rt.state.traffic.freighters.some(row => row.id === cutter.id), false);
    traffic._cleanup();
    assert.equal(cutter.alive, true, 'the former traffic cleanup cannot destroy retained property');
    assert.equal(cutter.data.cargoManifest, manifest);
    assert.equal(traffic.relinquishVessel(cutter.id, vessel.vesselId).relinquished, false);
  } finally { traffic?.destroy(); rt.dispose(); }
});
