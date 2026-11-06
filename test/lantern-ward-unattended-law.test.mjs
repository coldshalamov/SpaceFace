import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createSimulation } from '../src/core/sim.js';
import { PRODUCTION_INIT_ORDER, PRODUCTION_UPDATE_ORDER } from '../src/runtime/authoritativeSystemManifest.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { physics } from '../src/core/physics.js';
import { combat } from '../src/systems/combat.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';
import { world } from '../src/systems/world.js';
import { queuePhysicsImpulse } from '../src/core/physicsAuthority.js';
import {
  restoreLanternWard, lanternWardCompletionReceipt, lanternWardStatus,
} from '../src/systems/lanternWardWork.js';
import {
  LANTERN_WARD_RECORD_IDS as IDS,
} from '../src/data/lanternWardHardware.js';
import { LANTERN_WARD_BODY_CONTRACTS as C, lanternWardPoint } from '../src/data/lanternWardLayout.js';
import { lanternWardSceneryProxy } from '../src/world/lanternWardDressing.js';
import { captureEntityRecord, spawnSpecFromRecord } from '../src/world/worldRecords.js';
const DT = 1 / 60, SECTOR = 'sector_helios_prime', anchor = { x: 1680, z: -820 };

async function nativeHarness(seed = 47, restored = null, playerAt = { x: 1590, z: -520 }, withLaw = false) {
  const state = createGameState(seed); state.mode = 'flight'; state.world.currentSectorId = SECTOR;
  const recordOwner = { name: 'world', init(ctx) { this.state = ctx.state; }, upsertWorldRecord: world.upsertWorldRecord };
  const modules = { flightSlot: flightV3, physics, combat, npcJobsRuntime, spawnBudget, world: recordOwner, ...(withLaw ? { lawSecurity } : {}) };
  const sim = createSimulation({ state, seed,
    systems: PRODUCTION_INIT_ORDER.filter(id => modules[id]).map(id => modules[id]),
    updateOrder: PRODUCTION_UPDATE_ORDER.filter(id => modules[id]).map(id => modules[id]),
  });
  const player = sim.spawn({ type: 'ship', team: 0, alive: true, isPlayer: true,
    pos: { ...playerAt }, vel: { x: 0, z: 0 }, radius: 12, mass: 100,
    hull: 100, hullMax: 100, flags: { persistent: true }, data: {} });
  state.playerId = player.id;
  if (restored) {
    state.simTime = restored.simTime;
    state.world.records = { byId: {} };
    for (const record of restored.records) {
      state.world.records.byId[record.recordId] = structuredClone(record);
      const spec = spawnSpecFromRecord(record);
      if (spec) sim.spawn(spec);
    }
  }
  for (const key of ['serviceCutNorth', 'serviceCutSouth']) {
    sim.spawn({ type: 'payload', alive: true, team: 2, pos: lanternWardPoint(anchor, key),
      vel: { x: 0, z: 0 }, radius: C.service_cheek.radius, mass: 1e6, hull: 1e6,
      collides: true, physicsBody: { schemaVersion: 1, dynamic: false,
        mass: 1e6, radius: C.service_cheek.radius, shape: 'compound', material: 'prop',
        collisionProxyManifest: lanternWardSceneryProxy('service_cheek') }, data: {} });
  }
  await sim.registry.get('physics').prepareBackend(state);
  const owner = sim.registry.get('npcJobsRuntime');
  if (restored) restoreLanternWard(owner, restored.ward);
  const events = [];
  sim.bus.on('lanternWard:serviceCommitted', e => events.push(e));
  const actor = role => state.entityList.find(e => e.alive && e.data?.worldRecordId === IDS[role]);
  const run = (n, each = null) => { for (let i = 0; i < n; i++) { each?.(i); sim.step(); } };
  run(10);
  return { sim, state, owner, player, events, actor, run };
}


test('an ignored seven-minute watch uses native clearing, carries the original and earns no player service', async () => {
  const h = await nativeHarness(7631);
  try {
    const lamp = h.actor('lamp'), mast = h.actor('obstruction'), cradle = h.actor('cradle');
    const originalMast = { ...mast.pos };
    h.run(25000);
    assert.equal(lanternWardStatus(h.owner).ignored, false);
    assert.equal(h.events.length, 0);
    assert.ok(Math.hypot(mast.pos.x - originalMast.x, mast.pos.z - originalMast.z) < 1);
    for (let i = 0; i < 18000 && !h.events.length; i++) h.sim.step();
    const status = lanternWardStatus(h.owner);
    console.log('LANTERN_UNATTENDED', JSON.stringify({ simTime: h.state.simTime, status,
      lamp: lamp.pos, mast: mast.pos, cradle: cradle.pos, tug: h.actor('tug')?.pos }));
    assert.equal(status.installed, true);
    assert.equal(status.ignored, true);
    assert.equal(h.actor('lamp'), lamp);
    assert.equal(h.actor('cradle'), cradle);
    assert.equal(h.events.length, 1);
    const receipt = lanternWardCompletionReceipt(h.owner, h.events[0].receiptId);
    assert.equal(receipt.playerHelped, false);
    assert.equal(receipt.method, 'crew_installation');
    assert.ok(Math.hypot(mast.pos.x - originalMast.x, mast.pos.z - originalMast.z) > 30);
  } finally { h.sim.dispose(); }
});

test('actual stolen cradle invokes existing witness law once; local borrowing stays legal', async () => {
  const h = await nativeHarness(7632, null, { x: 1580, z: -520 }, true);
  try {
    h.state.world.sectors[SECTOR] = { id: SECTOR, factionId: 'faction_scn', security: .9, tier: 0 };
    h.sim.spawn({ type: 'station', team: 2, factionId: 'faction_scn', pos: { x: 1280, z: -420 }, radius: 42,
      data: { stationId: 'station_helios', dockRadius: 72, factionId: 'faction_scn' } });
    const witness = h.sim.spawn({ type: 'ship', team: 2, factionId: 'faction_scn',
      pos: { x: 1450, z: -450 }, radius: 9, hull: 100, hullMax: 100,
      data: { worldRecordId: 'test:existing-patrol', ai: { lawful: true, archetype: 'patrol_lawman' } } });
    const reports = [];
    h.sim.bus.on('law:reportIncidentReceipt', r => { if(r.reportId?.startsWith('lantern-ward:theft:')) reports.push(r); });
    h.run(5);
    const cradle = h.actor('cradle'), lamp = h.actor('lamp'), service = h.sim.registry.get('combat').kernel.attachments;
    const line = service.create({ defId: 'tether_standard', ownerId: h.player.id, targetId: cradle.id,
      sourceWorld: { ...h.player.pos, y: 0 }, targetWorld: { ...cradle.pos, y: 0 } });
    assert.equal(line.ok, true); h.run(2);
    assert.equal(lanternWardStatus(h.owner).history.borrowed, true);
    assert.equal(reports.length, 0, 'taking the local cradle is not theft');
    const target = { x: 1320, z: -520 };
    for (let i=0; i<9000 && reports.length===0; i++) {
      const p=h.player, dx=target.x-p.pos.x, dz=target.z-p.pos.z, d=Math.hypot(dx,dz), k=Math.min(8,d*.7)/Math.max(d,1e-9);
      queuePhysicsImpulse(p,{x:p.mass*Math.max(-.06,Math.min(.06,dx*k-p.vel.x)),z:p.mass*Math.max(-.06,Math.min(.06,dz*k-p.vel.z))},{tick:h.state.tick,tag:'bounded_player_tow'});
      service.reel(line.attachment.id,-7*DT,28); h.sim.step();
    }
    console.log('LANTERN_WITNESSED_THEFT',JSON.stringify({simTime:h.state.simTime,cradle:cradle.pos,witness:witness.pos,reports,status:lanternWardStatus(h.owner)}));
    assert.equal(reports.length,1);
    assert.equal(reports[0].accepted,true);
    assert.equal(reports[0].validatedWitnessedTheft,true);
    assert.equal(reports[0].payloadStableId,IDS.cradle);
    assert.equal(reports[0].stationId,'station_helios');
    assert.ok(reports[0].witnessCount>=1);
    h.run(180);
    assert.equal(reports.length,1,'continued towing cannot report/pay the same theft twice');
    assert.equal(h.actor('cradle'),cradle); assert.equal(h.actor('lamp'),lamp);
    assert.equal(lanternWardStatus(h.owner).history.cradleStolen,true);
    const saved = captureEntityRecord(cradle,{sectorId:SECTOR,tick:h.state.tick,simTime:h.state.simTime});
    assert.equal(spawnSpecFromRecord(saved).data.lanternWardCustody.holder,'player');
  } finally { h.sim.dispose(); }
});
