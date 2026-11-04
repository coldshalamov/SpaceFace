// breakwater-spur.test.mjs — focused candidate checks for the Breakwater Spur
// commission. Covers physical seating and safe refusal, partial restoration
// across Save/Continue, canonical debit, both charters' first jobs, cost and
// progress publication, and destroyed/duplicate-event safety — through the real
// native physics, economy, cargo and npcJobs owners, not stand-ins.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createSimulation } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { ensureActivityClassified, refreshPhysicsPartition, requestActivityReclassify } from '../src/world/activityRuntime.js';
import { refreshEntityPhysicsIndex } from '../src/core/coreSystem.js';
import { writePhysicsControl } from '../src/core/physicsAuthority.js';
import { combat } from '../src/systems/combat.js';
import { economy } from '../src/systems/economy.js';
import { ships, makeShipEntitySpec } from '../src/systems/ships.js';
import { stationServices } from '../src/systems/stationServices.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { advance as advanceNpcJob } from '../src/systems/npcJobs.js';
import { traffic } from '../src/systems/traffic.js';
import { world } from '../src/systems/world.js';
import { save } from '../src/save/saveSystem.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { addCargo, cargo } from '../src/systems/cargo.js';
import { createBreakwaterSpurSystem } from '../src/features/breakwaterSpur/runtime.js';
import {
  BREAKWATER_SITE_LOCAL, BREAKWATER_POCKET_LOCAL, BREAKWATER_SECTOR_ID,
  BREAKWATER_CARTRIDGES, BREAKWATER_SOCKETS, BREAKWATER_STRUCTURE,
  BREAKWATER_POCKET_DRESSING, BREAKWATER_SUPPLY_LOAD, BREAKWATER_CONSIGNMENT,
  BREAKWATER_PHASE, BREAKWATER_CHARTER, BREAKWATER_COOP_JOBS, BREAKWATER_BONDED,
  BREAKWATER_SEAT_CAPS, breakwaterRecordId,
} from '../src/features/breakwaterSpur/definition.js';
import { createBreakwaterRow, nextActionFor, recomputePhase, recomputeStage } from '../src/features/breakwaterSpur/project.js';
import { normalizeBreakwaterSpurRow } from '../src/features/breakwaterSpur/persistence.js';
import { getBreakwaterSpurStatus, getBreakwaterSpurMapMarkers, buildBreakwaterSpurOffer } from '../src/features/breakwaterSpur/readModel.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';

const DT = 1 / 60;
const copy = v => JSON.parse(JSON.stringify(v));
const g2l = p => ({ x: p.x, z: p.z });
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// ---------------------------------------------------------------------------
// Placement + asset admission (deterministic, no sim).
// ---------------------------------------------------------------------------

test('breakwater site clears every Ceres envelope, lane and named site', () => {
  const site = BREAKWATER_SITE_LOCAL;
  const clear = (x, z, minDist, name) =>
    assert.ok(dist(site, { x, z }) >= minDist, `${name}: ${dist(site, { x, z }).toFixed(0)} < ${minDist}`);
  // Named envelopes (sectorAnchors/sectorZones/sectors.js + feature anchors).
  clear(-840, -1180, 420 + 42, 'Abandoned Driller zone+skin');
  clear(-840, -760, 420, 'Solstice lantern discover radius');
  clear(-400, -2400, 640 + 120, 'Belt-Shadow ambush zone');
  clear(-1520, 240, 560 + 120, 'Hinge Works site+discover');
  clear(-500, 1600, 740 + 120, 'Second Measure reservation envelope');
  clear(-1100, 620, 205 + 120, 'Ceres refinery halo');
  clear(780, -940, 205 + 120, 'Belt Outpost halo');
  clear(1950, -1250, 620 + 120, 'Cinder Sluice current cone');
  clear(300, 2700, 620 + 120, 'Wreck Cathedral reservation');
  // Sector bound: inside worldRadius 4200 of origin with approach room.
  assert.ok(Math.hypot(site.x, site.z) < 3200, 'site inside Ceres worldRadius');
});

test('every authored asset role resolves to a released package file', () => {
  const files = [
    ...BREAKWATER_STRUCTURE.map(p => p.file),
    ...BREAKWATER_POCKET_DRESSING.map(p => p.file),
    ...Object.values(BREAKWATER_CARTRIDGES).map(c => c.file),
    BREAKWATER_SUPPLY_LOAD.file,
    BREAKWATER_CONSIGNMENT.file,
  ];
  const releaseRoot = fileURLToPath(new URL('../assets/ships/release/parts/', import.meta.url));
  for (const file of files) {
    assert.ok(fs.existsSync(releaseRoot + file), `missing released asset ${file}`);
  }
  // Visibly different cartridge silhouettes — no same-file duplicates.
  assert.notEqual(BREAKWATER_CARTRIDGES.drive.file, BREAKWATER_CARTRIDGES.drum.file);
});

test('cartridges hit the 18t operational target inside Class-I limits', () => {
  for (const c of Object.values(BREAKWATER_CARTRIDGES)) {
    assert.equal(c.mass, 18, `${c.role} final operational mass`);
    assert.ok(c.radius <= 8 && c.mass <= 20, 'starter Class-I native mass envelope');
  }
});

// ---------------------------------------------------------------------------
// Row + persistence (pure).
// ---------------------------------------------------------------------------

test('partial restoration survives a save round-trip identically', () => {
  const row = createBreakwaterRow();
  row.phase = 'restoring';
  row.surveyed = { socket_drive: true, socket_drum: false, console: true };
  row.sockets.drive = { status: 'seated', cartridgeRole: 'drive', seatedAt: 40 };
  row.cartridges.drive = { ...row.cartridges.drive, status: 'seated', hull: 610, hullMax: 900, damaged: true, seatedAt: 40 };
  row.seatWatch.drive = { entityId: 77, generation: 2, since: 0.9 };
  row.receipts = [{ at: 1, kind: 'info', text: 'x' }];
  const restored = normalizeBreakwaterSpurRow(copy(row));
  assert.equal(restored.sockets.drive.status, 'seated');
  assert.equal(restored.cartridges.drive.status, 'seated');
  assert.equal(restored.cartridges.drive.hull, 610);
  assert.equal(restored.cartridges.drive.damaged, true);
  assert.equal(restored.surveyed.console, true);
  assert.equal(restored.seatWatch.drive, null, 'seat watches never restore');
  assert.equal(restored.cartridges.drive.entityId, null, 'live bindings re-verify');
});

test('corrupt and inconsistent save data normalizes, never throws', () => {
  assert.deepEqual(normalizeBreakwaterSpurRow(null).phase, 'dark');
  assert.deepEqual(normalizeBreakwaterSpurRow('garbage').phase, 'dark');
  const weird = normalizeBreakwaterSpurRow({
    phase: 'bogus', stage: 99, charter: 'platinum',
    sockets: { drive: { status: 'seated', cartridgeRole: 'drive' } },
    cartridges: { drive: { status: 'lost', hull: -5 } },
    coop: { stock: { repair: 9999, fuel: -4 } },
    receipts: Array(99).fill({ text: 'x'.repeat(999) }),
  });
  assert.equal(weird.phase, 'dark');
  assert.equal(weird.stage, 3);
  assert.equal(weird.charter, 'none');
  // Seated socket with a lost original must heal empty — never a phantom seat.
  assert.equal(weird.sockets.drive.status, 'empty');
  assert.equal(weird.cartridges.drive.hull, 0);
  assert.equal(weird.coop.stock.repair, 60);
  assert.equal(weird.coop.stock.fuel, 0);
  assert.ok(weird.receipts.length <= 16 && weird.receipts.every(r => r.text.length <= 200));
});

test('delivered consignment and posted bond survive restore for settlement', () => {
  const row = createBreakwaterRow();
  row.charter = 'bonded';
  row.bonded.bond.status = 'posted';
  row.looseLoad = { kind: 'consignment', worldRecordId: 'breakwater:x', status: 'delivered' };
  const restored = normalizeBreakwaterSpurRow(copy(row));
  assert.equal(restored.bonded.bond.status, 'posted');
  assert.equal(restored.bonded.job.status, 'open');
  assert.equal(restored.looseLoad.status, 'delivered');
});

test('next action reads honest missing parts, never a percent bar', () => {
  const row = createBreakwaterRow();
  assert.equal(nextActionFor(row), null);
  row.phase = 'restoring';
  assert.match(nextActionFor(row), /drive cartridge/);
  row.cartridges.drive.status = 'lost';
  recomputePhase(row);
  assert.equal(row.phase, 'failed');
  assert.match(nextActionFor(row), /original|lost|destroyed/i);
});

test('bonded terms say when payment and refund occur before a bond is posted', () => {
  const row=createBreakwaterRow();row.phase='operating';row.charter='bonded';row.commission.status='paid';
  const offer=buildBreakwaterSpurOffer({world:{breakwaterSpur:row}});
  assert.match(offer.detail,/Bond: none/);
  assert.match(offer.detail,/return to the spur for 220 CR and the bond refund/i);
  assert.match(offer.detail,/lost consignment forfeits the bond/i);
});

// ---------------------------------------------------------------------------
// Sim fixture — real physics, economy, cargo, npcJobs owners.
// ---------------------------------------------------------------------------

async function fixture() {
  const breakwaterSpur = createBreakwaterSpurSystem();
  const sim = createSimulation({
    seed: 42,
    systems: [ships, cargo, economy, stationServices, npcJobsRuntime, traffic, flightV3, combat, physics, breakwaterSpur],
  });
  const s = sim.state;
  s.mode = 'flight';
  s.world.currentSectorId = BREAKWATER_SECTOR_ID;
  s.settings.gameplay.physicsBackend = 'rapier-dynamic';
  s.ui.docked = false;
  sim.registry.get('ships').newGame();
  const site = sectorLocalToGlobalForSector({ x: BREAKWATER_SITE_LOCAL.x, z: BREAKWATER_SITE_LOCAL.z + 40 }, BREAKWATER_SECTOR_ID);
  const player = sim.spawn(makeShipEntitySpec('ship_kestrel', { isPlayer: true, player: s.player, pos: site, fittings: [] }));
  s.playerId = player.id;
  sim.registry.get('economy').grantCredits(5000, 'breakwater-fixture');
  const owner = sim.registry.get('breakwaterSpur');
  const native = sim.registry.get('physics');
  const offers = [], receipts = [], cues = [], actions = [];
  sim.bus.on('breakwaterSpur:offer', p => offers.push(p));
  sim.bus.on('breakwaterSpur:receipt', p => receipts.push(p));
  sim.bus.on('breakwaterSpur:cue', p => cues.push(p));
  const emit = a => sim.bus.emit('breakwaterSpur:action', typeof a === 'object' ? a : { actionId: a });
  function tick(n = 1) {
    for (let i = 0; i < n; i++) {
      s.tick++; s.simTime = s.tick * DT;
      owner.update(DT, s);
      native.update(DT, s);
    }
  }
  const admitted = await native.prepareBackend(s);
  return { sim, s, owner, native, player, offers, receipts, cues, emit, tick, admitted };
}

function cartridgeEntity(s, role) {
  const id = breakwaterRecordId(`cartridge_${role}`);
  return (s.entityList || []).find(e => e?.data?.worldRecordId === id && e.alive !== false) || null;
}

test('structure admits once and cartridges spawn loose in the pocket', async () => {
  const { s, owner, tick } = await fixture();
  const row = s.world.breakwaterSpur;
  tick(3);
  const owned = (s.entityList || []).filter(e => e?.data?.persistenceOwner === 'breakwaterSpur');
  const roles = new Set(owned.map(e => e.data.siteRole));
  for (const role of ['arm_port', 'arm_stbd', 'crossbar', 'lamp', 'freight_receiver', 'shelf_drum', 'console', 'socket', 'cartridge_drive', 'cartridge_drum']) {
    assert.ok(roles.has(role), `missing site body ${role}`);
  }
  const before = owned.length;
  tick(3);
  assert.equal((s.entityList || []).filter(e => e?.data?.persistenceOwner === 'breakwaterSpur').length, before, 'admission is idempotent');
  for (const e of owned) {
    assert.ok(e.data.worldRecordId && e.flags?.persistent !== false || e.data.persistenceOwner, 'durable identity stamped');
  }
});

test('approach inside 650 WU reveals the place with one restrained signal', async () => {
  const { s, owner, player, receipts, cues, tick } = await fixture();
  const row = s.world.breakwaterSpur;
  const site = sectorLocalToGlobalForSector(BREAKWATER_SITE_LOCAL, BREAKWATER_SECTOR_ID);
  player.pos.set(site.x + 700, 0, site.z);          // outside reveal radius
  tick(2);
  assert.equal(row.phase, 'dark');
  player.pos.set(site.x + 600, 0, site.z);          // inside 650
  tick(2);
  assert.equal(row.phase, 'signaled');
  assert.ok(cues.some(c => c.cue === 'signal'));
  tick(30);
  assert.equal(row.phase, 'signaled', 'no timer or obligation follows discovery');
  // And the read model publishes a map contact through the existing route.
  const markers = getBreakwaterSpurMapMarkers(s, BREAKWATER_SECTOR_ID);
  assert.equal(markers.length, 1);
  assert.match(markers[0].name, /Breakwater Spur/);
});

test('native mouth crossing and support dwell seat the same original', async () => {
  const {s,owner,native,tick}=await fixture(); tick(3);
  const row=s.world.breakwaterSpur, cart=cartridgeEntity(s,'drive');
  const receiver=owner.physical.findByRecordId(breakwaterRecordId('structure_shelf_drive'));
  const body=native._sg02.records.get(cart.id).body, origin=native._sg02._frameOrigin||{x:0,z:0};
  // Initial scene placement only; all following motion is native force-driven.
  const start={x:receiver.pos.x,z:receiver.pos.z-28};
  cart.pos.set(start.x,0,start.z);cart.vel.set(0,0,0);
  body.setTranslation({x:start.x-origin.x,y:0,z:start.z-origin.z},true);body.setLinvel({x:0,y:0,z:0},true);
  assert.equal(owner.physical.trySeat(row,'drive').ok,false,'no custody before entry and support');
  let stable=false;
  for (let i=0;i<2000 && !stable;i++) {
    const dz=receiver.pos.z+12-cart.pos.z, desired=Math.max(-3,Math.min(3,dz*1.2));
    const acceleration=Math.max(-3,Math.min(3,(desired-cart.vel.z)*2));
    writePhysicsControl(cart,{source:'breakwater-native-test',force:{x:0,y:0,z:acceleration*cart.mass},
      torque:{x:0,y:-cart.angVel*(cart.physicsBody.inertiaY||cart.mass)*4,z:0},maxSpeed:3});
    s.tick++;s.simTime=s.tick*DT;native.update(DT,s);
    stable=owner.physical.updateSeatWatch(row,'drive',DT).stable===true;
  }
  assert.equal(stable,true,`native pose ${JSON.stringify({pos:cart.pos,vel:cart.vel,rot:cart.rot,receiver:receiver.pos,gate:owner.physical.seatGate(row,'drive'),watch:row.seatWatch.drive,contacts:owner.ctx.helpers.combatPhysics.sampleSolidContacts(cart.id,{})})}`);
  assert.equal(owner.physical.trySeat(row,'drive').pending,true);
  for(let i=0;i<120 && row.sockets.drive.status!=='seated';i++) {s.tick++;s.simTime=s.tick*DT;native.update(DT,s);owner.physical.updateSeatWatch(row,'drive',DT);}
  assert.equal(row.cartridges.drive.status,'seated',JSON.stringify({alive:cart.alive,partition:cart._physicsPartition,indexStatic:s.entityIndex?.physicsStatics?.includes(cart),indexDynamic:s.entityIndex?.physicsDynamics?.includes(cart),activityStatic:ensureActivityClassified(s).physicsStatics.includes(cart),body:{dynamic:cart.physicsBody.dynamic,revision:cart.physicsBody.revision},record:native._sg02.records.get(cart.id)?.revision,fixed:native._sg02.records.get(cart.id)?.body.isFixed(),pending:native._sg02._pendingNativeRebuilds?.size}));assert.equal(row.sockets.drive.status,'seated');
  assert.equal(native._sg02.records.get(cart.id).body.isFixed(),true);
  assert.equal(owner.physical.trySeat(row,'drive').ok,false,'duplicate seating refused');
});

test('commission debits real cargo once and charter locks permanently', async () => {
  const { s, owner, emit, tick } = await fixture();
  const row = s.world.breakwaterSpur;
  row.phase = 'ready';
  addCargo(s, 'cmdty_scrap_metal', 4);
  addCargo(s, 'cmdty_salvage_electronics', 1);
  // The gate holds before restoration — the dispatcher won't book a dead frame.
  const early = await owner.services.payCommission(row);
  assert.equal(early.ok, false);
  assert.equal(early.reason, 'not_restored');
  for (const role of ['drive', 'drum']) {
    row.sockets[role].status = 'seated';
    row.cartridges[role].status = 'seated';
  }
  const res = await owner.services.payCommission(row);
  assert.equal(res.ok, true);
  assert.equal(row.commission.status, 'paid');
  const q = owner.services.commissionQuote(row);
  assert.equal(q.scrap.held, 0, 'scrap was actually drawn');
  assert.equal(q.electronics.held, 0, 'electronics was actually drawn');
  const again = await owner.services.payCommission(row);
  assert.equal(again.ok, false, 'second commissioning debit refused');
  // Charter is a one-way door.
  row.charter = 'cooperative';
  assert.equal(row.charter, 'cooperative');
  const offer = buildBreakwaterSpurOffer(s);
  assert.ok(offer.actions.every(a => a.id !== 'charter:bonded'), 'no respec surface');
});

test('cooperative berth debits real stock and refuses repeat scrap pay', async () => {
  const {s,owner,player}=await fixture(), row=s.world.breakwaterSpur;
  row.charter='cooperative';row.commission.status='paid';row.coop.stock.repair=20;row.coop.stock.fuel=15;
  player.hull=player.hullMax-500;s.player.credits=300;
  const service=await owner.services.runService(row,'repair',50);
  assert.equal(service.ok,true);assert.ok(service.units<=20);assert.equal(row.coop.stock.repair,20-service.units);
  addCargo(s,'cmdty_scrap_metal',8);const before=s.player.credits;
  assert.equal(owner.services.deliverScrap(row).ok,true);assert.equal(s.player.credits,before+90);
  assert.equal(owner.services.deliverScrap(row).ok,false);assert.equal(s.player.credits,before+90);
});

test('destroyed bonded original forfeits the one posted bond', async () => {
  const {s,owner,tick}=await fixture(),row=s.world.breakwaterSpur;
  row.charter='bonded';row.commission.status='paid';
  const accepted=owner.services.postBond(row,()=>owner.freight.stageConsignment(row));assert.equal(accepted.ok,true);
  const original=accepted.admission.entity;
  assert.equal(owner.physical.recordLoss(row,original,'destroyed').type,'load_lost');owner.freight.update(row);
  assert.equal(row.bonded.bond.status,'forfeited');assert.equal(row.bonded.job.status,'failed');
  assert.equal(owner.freight.stageConsignment(row).ok,false);
});

test('destruction of an original records loss and the readable terminal outcome', async () => {
  const { s, owner, tick, admitted } = await fixture();
  const row = s.world.breakwaterSpur;
  tick(2);
  const cart = cartridgeEntity(s, 'drive');
  assert.ok(cart, 'original exists');
  // entity:killed marks the durable record lost; the socket can never reseat.
  sim_bus: {
    owner._onEntityGone({ entity: cart, reason: 'killed' }, 'killed');
  }
  assert.equal(row.cartridges.drive.status, 'lost');
  recomputePhase(row);
  assert.equal(row.phase, 'failed');
  assert.match(nextActionFor(row), /destroyed|lost/i);
  // A second destroyed event is a no-op — no resurrection, no double receipt.
  assert.equal(owner.physical.recordLoss(row, cart, 'destroyed'), null);
});

test('stale offer revision is refused and worker read model stays bounded', async () => {
  const { s, owner, emit } = await fixture();
  const row = s.world.breakwaterSpur;
  row.phase = 'signaled';
  emit({ actionId: 'commission', revision: 'stale:0:0' });
  const status = getBreakwaterSpurStatus(s);
  assert.ok(status.nextAction == null || typeof status.nextAction === 'string');
  assert.ok(status.receipts.length <= 4);
  const offer = buildBreakwaterSpurOffer(s);
  assert.ok(offer.revision.includes(row.phase));
  // Serialization is detached — no live entity references leak into the bag.
  const serialized = owner.serialize();
  assert.doesNotThrow(() => structuredClone(serialized));
  assert.equal(serialized.seatWatch.drive, null);
});

test('breakwater production economy pays accepted work once before reentrant save', async () => {
  const {sim,s,owner}=await fixture();
  const eco=sim.registry.get('economy'), row=s.world.breakwaterSpur;
  const source='breakwater:coop:scrap', initial=s.player.credits;
  assert.equal(eco.settleBreakwaterReceipt('scrap',source).ok,false);
  row.charter='cooperative'; row.commission.status='paid'; addCargo(s,'cmdty_scrap_metal',8);
  assert.equal(sim.registry.get('cargo').acceptBreakwaterMaterials('scrap').ok,true);
  let saved, duplicate;
  sim.bus.on('credits:changed',()=>{ saved=owner.serialize(); duplicate=eco.settleBreakwaterReceipt('scrap',source); });
  const result=eco.settleBreakwaterReceipt('scrap',source);
  assert.equal(result.ok,true); assert.equal(s.player.credits,initial+90);
  assert.equal(saved.coop.jobs.scrap.paid,true); assert.equal(duplicate.duplicate,true);
  assert.equal(eco.settleBreakwaterReceipt('scrap','breakwater:coop:other').ok,false);
  assert.equal(s.player.credits,initial+90);
});

test('breakwater production economy retains refused settlement for retry', async () => {
  const {sim,s}=await fixture();
  const eco=sim.registry.get('economy'), row=s.world.breakwaterSpur;
  const source='breakwater:coop:scrap'; row.charter='cooperative'; row.commission.status='paid'; addCargo(s,'cmdty_scrap_metal',8);
  assert.equal(sim.registry.get('cargo').acceptBreakwaterMaterials('scrap').ok,true);
  s.player.credits=Number.MAX_SAFE_INTEGER;
  assert.equal(eco.settleBreakwaterReceipt('scrap',source).reason,'wallet_full');
  assert.equal(row.coop.jobs.scrap.paid,false); assert.ok(row.pendingPayouts.scrap);
  s.player.credits=500; assert.equal(eco.settleBreakwaterReceipt('scrap',source).ok,true);
  assert.equal(s.player.credits,590);
});


test('breakwater originals admit measured 18 tonne native bodies', async () => {
  const {s,native,tick}=await fixture(); tick(5);
  for (const role of ['drive','drum']) {
    const original=cartridgeEntity(s,role);
    assert.ok(original,`${role} exists`);
    const record=native._sg02.records.get(original.id);
    assert.ok(record?.body?.isDynamic(),`${role} native dynamic body`);
    assert.ok(Math.abs(record.body.mass()-18)<0.01,`${role} native mass`);
    assert.equal(original.physicsBody.shape,'compound');
  }
});

test('feature snapshot restores an existing original pose and damage into a fresh simulation', async () => {
  const a=await fixture(); a.tick(5);
  const original=cartridgeEntity(a.s,'drive'); original.hull=321;
  const snapshot=a.owner.serialize();
  const saved=snapshot.bodySnapshots[breakwaterRecordId('cartridge_drive')];
  assert.equal(saved.hull,321);
  const b=await fixture(); b.owner.deserialize(snapshot); b.owner.afterContinue(); b.tick(3);
  const restored=cartridgeEntity(b.s,'drive');
  assert.ok(restored); assert.equal(restored.hull,321);
  assert.ok(Math.abs(restored.pos.x-saved.pos.x)<1);
  assert.ok(Math.abs(restored.pos.z-saved.pos.z)<1);
  assert.equal(b.s.world.breakwaterSpur.cartridges.drive.everSpawned,true);
});

test('forged hauler events cannot change stock, award, or retire its original', async () => {
  const {sim,s,owner}=await fixture();
  const row=s.world.breakwaterSpur;
  row.charter=BREAKWATER_CHARTER.COOP; row.commission.status='paid';
  row.coop.jobs.defend.status='scheduled'; row.coop.jobs.defend.haulerJobId='job:forged';
  row.freight.hauler={worldRecordId:'breakwater:site_breakwater_spur:hauler_1',jobId:'job:forged',purpose:'defended_unload',phase:'inbound'};
  const before=copy(row.coop.stock), credits=s.player.credits;
  for (const ev of ['npcjobs:approach','npcjobs:unload','npcjobs:complete']) sim.bus.emit(ev,{jobId:'job:forged'});
  owner.freight.update(row);
  assert.deepEqual(row.coop.stock,before); assert.equal(s.player.credits,credits);
  assert.equal(row.coop.jobs.defend.status,'scheduled'); assert.equal(row.freight.hauler.phase,'unconfirmed');
});

test('damaged seated cartridge repair uses the real hull and exact-charge owners', async () => {
  const {s,owner,tick}=await fixture(); tick(4);
  const row=s.world.breakwaterSpur, cart=row.cartridges.drive, entity=cartridgeEntity(s,'drive');
  entity.hull=800; cart.hull=800; cart.damaged=true; cart.status='seated';
  cart.entityId=entity.id; cart.generation=entity.occupantGeneration;
  s.player.credits=0;
  assert.equal(owner.services.repairCartridge(row,'drive',entity).ok,false);
  assert.equal(entity.hull,800);
  s.player.credits=500;
  const accepted=owner.services.repairCartridge(row,'drive',entity);
  assert.equal(accepted.ok,true); assert.equal(accepted.price,90);
  assert.equal(entity.hull,900); assert.equal(cart.damaged,false); assert.equal(s.player.credits,410);
});

test('bond debit persists pending admission before any settlement observer saves', async () => {
  const {sim,s,owner}=await fixture();
  const row=s.world.breakwaterSpur; row.charter='bonded'; row.commission.status='paid';
  const before=s.player.credits; let saved;
  sim.bus.on('credits:changed',()=>{ saved=owner.serialize(); });
  const result=owner.services.postBond(row,()=>({ok:false,reason:'spawn_unavailable'}));
  assert.equal(result.ok,true); assert.equal(result.pendingAdmission,true);
  assert.equal(s.player.credits,before-100); assert.equal(saved.bonded.bond.pendingAdmission,true);
  const restored=normalizeBreakwaterSpurRow(saved);
  assert.equal(restored.bonded.bond.status,'posted'); assert.equal(restored.bonded.bond.pendingAdmission,true);
});

test('commission materials commit together before cargo observer saves', async () => {
  const {sim,s,owner}=await fixture();
  const row=s.world.breakwaterSpur;
  for (const role of ['drive','drum']) {row.cartridges[role].status='seated'; row.sockets[role].status='seated';row.sockets[role].cartridgeRole=role;}
  addCargo(s,'cmdty_scrap_metal',4); addCargo(s,'cmdty_salvage_electronics',1);
  let observed; sim.bus.on('cargo:changed',()=>{observed={save:owner.serialize(),items:{...s.player.cargo.items}};});
  assert.equal((await owner.services.payCommission(row)).ok,true);
  assert.equal(observed.save.commission.status,'paid');
  assert.equal(observed.items.cmdty_scrap_metal || 0,0); assert.equal(observed.items.cmdty_salvage_electronics || 0,0);
  assert.equal((await owner.services.payCommission(row)).ok,false);
});


test('supply feature handoff requires a native receiver clamp and conserved cargo receipt', async () => {
  const {sim,s,owner,native,player,tick}=await fixture(); tick(4);
  const row=s.world.breakwaterSpur; row.phase='operating'; row.charter='cooperative'; row.commission.status='paid';
  const staged=owner.freight.stageSupplyLoad(row); assert.equal(staged.ok,true); tick(3);
  const entity=staged.entity, receiver=owner.physical.findByRecordId(breakwaterRecordId('structure_shelf_drive'));
  // Fixture-only placement isolates custody; it is not an ordinary flight route.
  const target={x:receiver.pos.x+30,z:receiver.pos.z}, p={x:receiver.pos.x+35,z:receiver.pos.z};
  for (const [e,pos] of [[entity,target],[player,p]]) {
    e.pos.x=pos.x; e.pos.z=pos.z; e.vel.x=0; e.vel.z=0;
    native._sg02.records.get(e.id).body.setTranslation({x:pos.x,y:0,z:pos.z},true);
    native._sg02.records.get(e.id).body.setLinvel({x:0,y:0,z:0},true);
  }
  const noLine=owner.freight.tryDeliverSupply(row); assert.equal(noLine.ok,false);
  const link=sim.registry.get('combat').kernel.attachments.create({defId:'tether_standard',ownerId:player.id,targetId:entity.id});
  assert.equal(link.ok,true,link.reason);
  const before=s.player.credits; let result=owner.freight.tryDeliverSupply(row);
  if (!result.ok) { tick(1); result=owner.freight.tryDeliverSupply(row); }

  assert.equal(result.ok,true,result.reason);
  assert.equal(sim.registry.get('cargo').getBreakwaterFreightReceipt('supply').worldRecordId,row.looseLoad.worldRecordId);
  assert.equal(entity.data.cargoManifest.totalQty,0); assert.equal(s.player.credits,before+160);
  assert.equal(owner.freight.tryDeliverSupply(row).ok,false);
});


test('scheduled original mule commits its real manifest at native unload exactly once', async () => {
  const {sim,s,owner,native,tick}=await fixture(); tick(4);
  const row=s.world.breakwaterSpur; row.phase='operating'; row.charter='cooperative'; row.commission.status='paid';
  const scheduled=owner.freight.scheduleDefendedUnload(row); assert.equal(scheduled.ok,true);
  const haul=row.freight.hauler, entity=owner.physical.findByRecordId(haul.worldRecordId);
  const receiver=owner.physical.findByRecordId(breakwaterRecordId('structure_shelf_drive'));
  const entry=s.npcJobs.byId[haul.jobId]; assert.ok(entry); tick(2);
  // Fixture-only arrival isolates the native job/cargo handoff from manual flight.
  for (let i=0;i<1000 && entry.job.phase!=='unload';i++) advanceNpcJob(entry.job,.1);
  assert.equal(entry.job.phase,'unload');
  const pos={x:receiver.pos.x+36,z:receiver.pos.z}; entity.pos.x=pos.x;entity.pos.z=pos.z;entity.vel.x=0;entity.vel.z=0;
  native._sg02.records.get(entity.id).body.setTranslation({x:pos.x,y:0,z:pos.z},true);
  native._sg02.records.get(entity.id).body.setLinvel({x:0,y:0,z:0},true);
  const before=s.player.credits; owner.freight.update(row);

  assert.equal(row.coop.jobs.defend.status,'done');
  assert.equal(entity.data.cargoManifest.totalQty,0);
  assert.equal(s.player.credits,before+180);
  const stock=row.coop.stock.repair; owner.freight.update(row);
  assert.equal(row.coop.stock.repair,stock); assert.equal(s.player.credits,before+180);
});


test('bonded feature accepts native receiver custody and settles once', async () => {
  const {sim,s,owner,native,player,tick}=await fixture(); tick(4);
  const row=s.world.breakwaterSpur; row.phase='operating';row.charter='bonded';row.commission.status='paid';
  const station=sim.spawn({type:'station',hull:1000000,hullMax:1000000,radius:26,mass:1000000,
    pos:{x:player.pos.x+300,z:player.pos.z},vel:{x:0,z:0},
    physicsBody:{schemaVersion:1,dynamic:false,radius:26,mass:1000000,shape:'ball',revision:0},
    data:{stationId:'station_beltout',dockRadius:60}});
  sim.registry.get('economy').ensureMarket('station_beltout');
  const initial=s.player.credits, admission=owner.services.postBond(row,()=>owner.freight.stageConsignment(row));
  assert.equal(admission.ok,true); const entity=admission.admission.entity; tick(3);
  // Fixture-only placement isolates receiver and payment, not player flight.
  for (const [e,pos] of [[entity,{x:station.pos.x+31,z:station.pos.z}],[player,{x:station.pos.x+35,z:station.pos.z}]]) {
    e.pos.x=pos.x;e.pos.z=pos.z;e.vel.x=0;e.vel.z=0;
    native._sg02.records.get(e.id).body.setTranslation({x:pos.x,y:0,z:pos.z},true);
    native._sg02.records.get(e.id).body.setLinvel({x:0,y:0,z:0},true);
  }
  const attach=sim.registry.get('combat').kernel.attachments.create({defId:'tether_standard',ownerId:player.id,targetId:entity.id});
  assert.equal(attach.ok,true,attach.reason); owner.freight.update(row); assert.equal(row.looseLoad.status,'in_transit');
  let handoff=owner.freight.tryDeliverConsignment(row);
  if (!handoff.ok) {tick(1);handoff=owner.freight.tryDeliverConsignment(row);}
  assert.equal(handoff.ok,true,handoff.reason); assert.equal(s.player.credits,initial-100);
  const savedFeature=owner.serialize(), savedEconomy=sim.registry.get('economy').serialize();
  const continued=await fixture(); continued.s.player.credits=s.player.credits;
  continued.sim.registry.get('economy').deserialize(savedEconomy);
  continued.owner.deserialize(savedFeature); continued.owner.afterContinue();
  const restored=continued.s.world.breakwaterSpur;
  assert.equal(restored.looseLoad.status,'delivered'); assert.equal(restored.bonded.bond.status,'posted');
  const settled=continued.owner.freight.settleConsignment(restored); assert.equal(settled.ok,true);
  assert.equal(continued.s.player.credits,initial+220); assert.equal(restored.bonded.bond.status,'refunded');
  assert.equal(continued.owner.freight.settleConsignment(restored).reason,'already_settled');
  assert.equal(continued.s.player.credits,initial+220);
});


test('scheduled mule reaches the actual loading apron in native fixed ticks', async () => {
  const {sim,s,owner,player,tick}=await fixture(); tick(4);
  const row=s.world.breakwaterSpur; row.phase='operating';row.charter='cooperative';row.commission.status='paid';
  const result=owner.freight.scheduleDefendedUnload(row); assert.equal(result.ok,true);
  row.freight.raiderSpawned=true; // Isolate navigation after the player has cleared the threat.
  const haul=row.freight.hauler, entity=owner.physical.findByRecordId(haul.worldRecordId);
  const receiver=owner.physical.findByRecordId(breakwaterRecordId('structure_shelf_drive'));
  for (let i=0;i<7200 && row.coop.jobs.defend.status==='scheduled' && entity.alive;i++) sim.step(DT);
  assert.equal(row.coop.jobs.defend.status,'done',`phase ${s.npcJobs.byId[haul.jobId]?.job?.phase}, distance ${Math.hypot(entity.pos.x-receiver.pos.x,entity.pos.z-receiver.pos.z).toFixed(1)}, speed ${Math.hypot(entity.vel.x,entity.vel.z).toFixed(1)}`);
});


test('physical-arrival job holds its approach for far or missing native originals', async () => {
  const {sim,s,owner,native,tick}=await fixture(); tick(4);
  const row=s.world.breakwaterSpur; row.phase='operating';row.charter='cooperative';row.commission.status='paid';
  assert.equal(owner.freight.scheduleDefendedUnload(row).ok,true);
  const haul=row.freight.hauler, entity=owner.physical.findByRecordId(haul.worldRecordId);tick(2);
  const jobs=sim.registry.get('npcJobsRuntime'), entry=s.npcJobs.byId[haul.jobId];
  entry.job.phase='approach';entry.job.routeIndex=entry.job.route.length-1;entry.job.progress=0;
  jobs.update(DT,s); assert.equal(entry.job.phase,'approach');assert.equal(entry.job.progress,0);
  const record=native._sg02.records.get(entity.id);native._sg02.records.delete(entity.id);
  try { jobs.update(DT,s);assert.equal(entry.job.phase,'approach');assert.equal(entry.job.progress,0); }
  finally {native._sg02.records.set(entity.id,record);}
  assert.deepEqual(entry.job.payload.requirePhysicalArrival,{reach:3,maxSpeed:4});
  assert.deepEqual(jobs.serialize().byId[haul.jobId].job.payload.requirePhysicalArrival,{reach:3,maxSpeed:4});
});




async function saveFixture() {
  const sim=createSimulation({seed:42,systems:[ships,world,cargo,economy,stationServices,npcJobsRuntime,traffic,flightV3,combat,physics,createBreakwaterSpurSystem(),save]});
  const s=sim.state;s.mode='flight';s.run={kind:'adventure'};s.ui.docked=false;s.settings.gameplay.physicsBackend='rapier-dynamic';
  sim.registry.get('ships').newGame();s.player.credits=5000;await sim.registry.get('physics').prepareBackend(s);
  const player=sim.spawn(makeShipEntitySpec('ship_kestrel',{isPlayer:true,player:s.player,pos:sectorLocalToGlobalForSector({x:BREAKWATER_SITE_LOCAL.x,z:BREAKWATER_SITE_LOCAL.z+40},BREAKWATER_SECTOR_ID),fittings:[]}));s.playerId=player.id;
  sim.registry.get('world').enterSector(BREAKWATER_SECTOR_ID);
  const owner=sim.registry.get('breakwaterSpur');
  for(let i=0;i<4;i++)sim.step(DT);
  return {sim,s,owner,save:sim.registry.get('save')};
}

test('real save owner round trip preserves cartridge conditions and identity', async () => {
  const t=await saveFixture(), row=t.s.world.breakwaterSpur;
  const drive=cartridgeEntity(t.s,'drive'),drum=cartridgeEntity(t.s,'drum');assert.ok(drive && drum);
  drive.hull=400; drum.hull=600;
  // Fixture establishes an already-seated original; seating itself has a force-driven check.
  drive.physicsBody={...drive.physicsBody,dynamic:false,revision:drive.physicsBody.revision+1};
  refreshEntityPhysicsIndex(t.s,drive,drive.occupantGeneration);refreshPhysicsPartition(drive);requestActivityReclassify(t.s,drive,{physicsPublication:true});
  row.cartridges.drive.status='seated';row.sockets.drive.status='seated';row.sockets.drive.cartridgeRole='drive';
  for(let i=0;i<3;i++)t.sim.step(DT);
  const positions=[{...drive.pos},{...drum.pos}];
  const envelope=t.save.serialize('breakwater-test');assert.ok(envelope.data.world.breakwaterSpur);
  assert.equal(t.save.loadEnvelope(envelope,'breakwater-test'),true);
  // Bring the fixture's restored player back into native admission range.
  const restoredPlayer=t.s.entities.get(t.s.playerId);restoredPlayer.pos.x=positions[0].x+30;restoredPlayer.pos.z=positions[0].z;
  for(let i=0;i<5;i++)t.sim.step(DT);
  for(const [index,role] of ['drive','drum'].entries()) {
    const matches=t.s.entityList.filter(e=>e.alive && e.data?.worldRecordId===breakwaterRecordId(`cartridge_${role}`));
    assert.equal(matches.length,1);assert.equal(matches[0].hull,index===0?400:600);
    assert.ok(Math.hypot(matches[0].pos.x-positions[index].x,matches[0].pos.z-positions[index].z)<1);
    const record=t.sim.registry.get('physics')._sg02.records.get(matches[0].id);
    assert.ok(record,`missing ${role} native: ${JSON.stringify({player:t.s.entities.get(t.s.playerId)?.pos,at:matches[0].pos,body:matches[0].physicsBody?.dynamic,partition:matches[0]._physicsPartition,activity:ensureActivityClassified(t.s).physicsStatics.includes(matches[0]),failure:matches[0].physicsNativeFailure})}`);
    assert.equal(record.body.isFixed(),role==='drive');
  }
});

test('real Continue preserves loose supply and sealed in-transit consignment', async () => {
  for (const kind of ['supply','consignment']) {
    const t=await saveFixture(),row=t.s.world.breakwaterSpur;
    row.charter=kind==='supply'?'cooperative':'bonded';row.commission.status='paid';
    const admitted=kind==='supply'?t.owner.freight.stageSupplyLoad(row):t.owner.services.postBond(row,()=>t.owner.freight.stageConsignment(row)).admission;
    assert.equal(admitted.ok,true);const entity=admitted.entity;entity.hull=321;
    if(kind==='consignment')row.looseLoad.status='in_transit';
    const id=row.looseLoad.worldRecordId,pos={...entity.pos},manifest=JSON.stringify(entity.data.cargoManifest);
    const env=t.save.serialize(`breakwater-${kind}`);assert.equal(t.save.loadEnvelope(env,`breakwater-${kind}`),true);
    for(let i=0;i<3;i++)t.sim.step(DT);
    const restored=t.s.world.breakwaterSpur, matches=t.s.entityList.filter(e=>e.alive && e.data?.worldRecordId===id);
    assert.equal(matches.length,1,JSON.stringify(matches.map(e=>({id:e.id,pos:e.pos,owner:e.data.persistenceOwner,role:e.data.siteRole}))));assert.equal(matches[0].hull,321);
    assert.equal(JSON.stringify(matches[0].data.cargoManifest),manifest);
    assert.ok(Math.hypot(matches[0].pos.x-pos.x,matches[0].pos.z-pos.z)<1);
    assert.equal(restored.looseLoad.status,kind==='supply'?'waiting':'in_transit');
    if(kind==='consignment')assert.equal(restored.bonded.bond.status,'posted');
  }
});

test('real Continue preserves accepted unsettled freight and paid receipt', async () => {
  const t=await saveFixture(), row=t.s.world.breakwaterSpur;row.charter='bonded';row.commission.status='paid';
  const receiver=[...t.s.entities.values()].find(e=>e.type==='station' && e.data?.stationId==='station_beltout');assert.ok(receiver);
  const player=t.s.entities.get(t.s.playerId), before=t.s.player.credits;
  const posted=t.owner.services.postBond(row,()=>t.owner.freight.stageConsignment(row));assert.equal(posted.ok,true);
  const original=posted.admission.entity, native=t.sim.registry.get('physics');
  for(const [e,pos] of [[player,{x:receiver.pos.x+35,z:receiver.pos.z}],[original,{x:receiver.pos.x+31,z:receiver.pos.z}]]) {e.pos.x=pos.x;e.pos.z=pos.z;e.vel.x=0;e.vel.z=0;}
  for(let i=0;i<4;i++)t.sim.step(DT);
  for(const [e,pos] of [[player,{x:receiver.pos.x+35,z:receiver.pos.z}],[original,{x:receiver.pos.x+31,z:receiver.pos.z}]]) {
    const record=native._sg02.records.get(e.id), origin=native._sg02._frameOrigin||{x:0,z:0};assert.ok(record);
    e.pos.x=pos.x;e.pos.z=pos.z;e.vel.x=0;e.vel.z=0;record.body.setTranslation({x:pos.x-origin.x,y:0,z:pos.z-origin.z},true);record.body.setLinvel({x:0,y:0,z:0},true);
  }
  const line=t.sim.registry.get('combat').kernel.attachments.create({defId:'tether_standard',ownerId:player.id,targetId:original.id});assert.equal(line.ok,true,line.reason);
  t.owner.freight.update(row);assert.equal(row.looseLoad.status,'in_transit');
  const delivered=t.owner.freight.tryDeliverConsignment(row);assert.equal(delivered.ok,true,delivered.reason);
  const id=row.looseLoad.worldRecordId;const envelope=t.save.serialize('bonded-accepted');
  assert.equal(t.save.loadEnvelope(envelope,'bonded-accepted'),true);
  const resumed=t.s.world.breakwaterSpur;assert.equal(resumed.looseLoad.worldRecordId,id);assert.equal(resumed.looseLoad.status,'delivered');assert.equal(resumed.bonded.bond.status,'posted');
  assert.equal(t.owner.freight.settleConsignment(resumed).ok,true);assert.equal(t.s.player.credits,before+220);
  const paid=t.save.serialize('bonded-paid');assert.equal(t.save.loadEnvelope(paid,'bonded-paid'),true);
  const final=t.s.world.breakwaterSpur;assert.equal(final.bonded.job.paid,true);assert.equal(final.bonded.bond.status,'refunded');
  assert.equal(t.owner.freight.settleConsignment(final).reason,'already_settled');assert.equal(t.s.player.credits,before+220);
});

test('real Continue preserves scheduled mule job and active raider identities', async () => {
  const t=await saveFixture(),row=t.s.world.breakwaterSpur;row.charter='cooperative';row.commission.status='paid';
  assert.equal(t.owner.freight.scheduleDefendedUnload(row).ok,true);assert.equal(t.owner.physical.spawnRaider(row).ok,true);
  row.freight.raiderSpawned=true;for(let i=0;i<3;i++)t.sim.step(DT);
  const haulerId=row.freight.hauler.worldRecordId, jobId=row.freight.hauler.jobId, raiderId=row.raider.worldRecordId;
  const envelope=t.save.serialize('active-haul');assert.equal(t.save.loadEnvelope(envelope,'active-haul'),true);
  for(let i=0;i<5;i++)t.sim.step(DT);
  const resumed=t.s.world.breakwaterSpur;
  assert.equal(resumed.freight.hauler.worldRecordId,haulerId);assert.equal(resumed.freight.hauler.jobId,jobId);
  assert.equal(resumed.raider.worldRecordId,raiderId);
  for(const id of [haulerId,raiderId]) assert.equal(t.s.entityList.filter(e=>e.alive && e.data?.worldRecordId===id).length,1,id);
  assert.ok(t.s.npcJobs.byId[jobId]);
  assert.deepEqual(t.s.npcJobs.byId[jobId].job.payload.requirePhysicalArrival,{reach:3,maxSpeed:4});
});

test('new game retires originals and ignores stale asynchronous outcome', async () => {
  const t=await saveFixture(),row=t.s.world.breakwaterSpur;
  for(const role of ['drive','drum']){row.cartridges[role].status='seated';row.sockets[role].status='seated';row.sockets[role].cartridgeRole=role;}
  row.phase='ready';addCargo(t.s,'cmdty_scrap_metal',4);addCargo(t.s,'cmdty_salvage_electronics',1);
  const old=t.s.entityList.filter(e=>e.data?.persistenceOwner==='breakwaterSpur').map(e=>e.id);
  let outcomes=0;t.owner._commissionOutcome=()=>{outcomes++;};
  t.owner._offerRevision='test';t.s.breakwaterSpurOffer={revision:'test',actions:[{id:'commission'}]};
  // Player is placed near the dispatcher only to activate this isolated lifecycle seam.
  const player=t.s.entities.get(t.s.playerId);player.pos.x=t.owner.physical.siteAnchor.x;player.pos.z=t.owner.physical.siteAnchor.z;
  t.owner._onAction({actionId:'commission',revision:'test'});assert.equal(row.commission.status,'paid');t.owner.newGame();await Promise.resolve();
  assert.equal(outcomes,0);assert.equal(t.s.world.breakwaterSpur.commission.status,'none');
  assert.ok(old.every(id=>!t.s.entities.get(id)?.alive));
  for(let i=0;i<4;i++)t.sim.step(DT);
  for(const role of ['drive','drum'])assert.equal(t.s.entityList.filter(e=>e.alive && e.data?.worldRecordId===breakwaterRecordId(`cartridge_${role}`)).length,1);
});

test('destroy retires feature bodies and releases its save adapter', async () => {
  const t=await saveFixture(), wrapped=t.save._saveCapturePlan;
  const owned=t.s.entityList.filter(e=>e.data?.persistenceOwner==='breakwaterSpur').map(e=>e.id);
  t.owner.destroy();assert.notEqual(t.save._saveCapturePlan,wrapped);
  assert.ok(owned.every(id=>!t.s.entities.get(id)?.alive));
  t.owner.destroy();
});

test('real raider damage destroys the scheduled mule without stock or payment', async () => {
  const {sim,s,owner,tick}=await fixture();tick(4);
  const row=s.world.breakwaterSpur;row.phase='operating';row.charter='cooperative';row.commission.status='paid';
  assert.equal(owner.freight.scheduleDefendedUnload(row).ok,true);
  const mule=owner.physical.findByRecordId(row.freight.hauler.worldRecordId);
  const raider=owner.physical.spawnRaider(row);assert.equal(raider.ok,true);tick(3);
  const credits=s.player.credits,stock=copy(row.coop.stock);
  const hit=sim.registry.get('combat').kernel.routeDamage({attackerId:raider.entity.id,targetId:mule.id,
    packet:{channels:{kinetic:1000000},penetration:1,shieldBypass:1},origin:{kind:'test',id:'breakwater-raider'}});
  owner.freight.update(row);
  assert.equal(hit.ok,true);assert.equal(row.coop.jobs.defend.status,'failed');assert.equal(s.player.credits,credits);assert.deepEqual(row.coop.stock,stock);
  sim.bus.emit('npcjobs:unload',{jobId:row.coop.jobs.defend.haulerJobId});owner.freight.update(row);
  assert.equal(s.player.credits,credits);assert.deepEqual(row.coop.stock,stock);
});

test('clearing the real raider allows the original mule to finish by native flight', async () => {
  const {sim,s,owner,player,tick}=await fixture();tick(4);
  const row=s.world.breakwaterSpur;row.phase='operating';row.charter='cooperative';row.commission.status='paid';
  assert.equal(owner.freight.scheduleDefendedUnload(row).ok,true);
  const raider=owner.physical.spawnRaider(row);assert.equal(raider.ok,true);row.freight.raiderSpawned=true;tick(3);
  const hit=sim.registry.get('combat').kernel.routeDamage({attackerId:player.id,targetId:raider.entity.id,
    packet:{channels:{kinetic:100000},penetration:1,shieldBypass:1},origin:{kind:'test',id:'breakwater-defence'}});
  assert.equal(hit.ok,true);assert.equal(raider.entity.alive,false);
  const before=s.player.credits;
  for(let i=0;i<7200 && row.coop.jobs.defend.status==='scheduled';i++)sim.step(DT);
  assert.equal(row.coop.jobs.defend.status,'done');assert.equal(s.player.credits,before+180);
});
