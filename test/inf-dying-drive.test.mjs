// inf-dying-drive — the engine glow tells you a ship is dying.
//
// The drive already names the maneuver and the faction; the missing word was how close the
// ship is to death. The hull truth the sim owns (e.hull / e.hullMax) now reaches the plume:
// below the fail band the bell cools toward ember, below critical it sputters on its own
// deterministic phase — a crowd never sputters in unison, and no ambient randomness exists.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveDyingDrive,
  applyDyingDriveToSlot,
  DRIVE_DYING_INTACT,
  DRIVE_HULL_FAIL_FRAC,
  DRIVE_HULL_CRITICAL_FRAC,
} from '../src/render/thruster/systems/dyingDrive.js';
import { FamilyProductionFleet } from '../src/render/thruster/systems/familyFleet.js';
import { PlumeSlotPool } from '../src/render/thruster/systems/continuousPlume.js';
import { PlasmaStreamSystem } from '../src/render/thruster/systems/plasmaStream.js';
import { KESTREL_MAIN_PLUME_RECIPE } from '../src/render/thruster/recipes/kestrelRecipes.js';
import * as THREE from 'three';
import { entityVitalsOf } from '../scripts/lib/simWorkerHost.mjs';
import { createReadModel, applySpawnInfos, applyEntityVitals } from '../scripts/lib/simReadModel.mjs';
import { vfx } from '../src/render/vfx.js';

test('an intact or unknown hull reads intact — the drive keeps its maneuver heat', () => {
  assert.equal(resolveDyingDrive(1), DRIVE_DYING_INTACT);
  assert.equal(resolveDyingDrive(0.5), DRIVE_DYING_INTACT);
  assert.equal(resolveDyingDrive(DRIVE_HULL_FAIL_FRAC), DRIVE_DYING_INTACT, 'the fail band boundary is intact');
  assert.equal(resolveDyingDrive(NaN), DRIVE_DYING_INTACT, 'no hull fields: set dressing never gutters');
  assert.equal(resolveDyingDrive(undefined), DRIVE_DYING_INTACT);
  assert.equal(resolveDyingDrive(1.4), DRIVE_DYING_INTACT, 'out-of-range hull clamps intact');
});

test('a failing hull gutters progressively; a critical hull sputters hard', () => {
  const failing = resolveDyingDrive(0.3, 0, 0);
  assert.ok(Math.abs(failing.fail - 0.25) < 1e-9, "fail grows linearly down the band");
  assert.ok(failing.cool > 0 && failing.cool < 0.3, 'failing: a cool, not a blackout');
  assert.ok(failing.dim > 0.5, 'failing: the bell still reads');
  const critical = resolveDyingDrive(0.05, 0, 0);
  assert.equal(critical.fail, (DRIVE_HULL_FAIL_FRAC - 0.05) / DRIVE_HULL_FAIL_FRAC);
  assert.ok(critical.cool > failing.cool, 'critical cools harder');
  assert.ok(critical.sputter > failing.sputter, 'critical sputters harder');
  assert.ok(critical.turbulenceAdd > failing.turbulenceAdd, 'a dying bell spits harder');
});

test('the sputter is deterministic per ship and de-phased across a crowd', () => {
  const a = resolveDyingDrive(0.08, 0.31, 0.25);
  const b = resolveDyingDrive(0.08, 0.31, 0.25);
  assert.deepEqual(a, b, 'the same ship phase answers the same way');
  const c = resolveDyingDrive(0.08, 0.31, 0.75);
  assert.notEqual(a.sputter, c.sputter, 'another ship on another phase misses its own beats');
});

test('the slot application leans ember — red outlives blue — and never goes black', () => {
  const dying = resolveDyingDrive(0.04, 0.2, 0.5);
  const slot = { color: [1.0, 0.9, 0.85], turbulence: 0.2 };
  applyDyingDriveToSlot(slot, dying);
  assert.ok(slot.color[0] > slot.color[1] && slot.color[1] > slot.color[2], 'the picture cools toward ember');
  assert.ok(slot.color[0] > 0.15, 'never black');
  assert.ok(slot.turbulence > 0.2, 'turbulence rises');
  const intact = { color: [0.5, 0.5, 0.5], turbulence: 0.1 };
  applyDyingDriveToSlot(intact, DRIVE_DYING_INTACT);
  assert.deepEqual(intact.color, [0.5, 0.5, 0.5], 'an intact answer is a no-op');
  applyDyingDriveToSlot(null, dying); // no slot: no throw
});

test('the fleet record carries the hull truth from the drive read', () => {
  // _makeShipRecord defaults intact; setShipDrive copies the read's hullFrac.
  const holder = { socketsPerShip: 1, _allocCount: 0, families: [null] };
  const ship = FamilyProductionFleet.prototype._makeShipRecord.call(holder);
  assert.equal(ship.hullFrac, 1, 'a ship without a read yet reads intact');
  assert.equal(ship.sputterPhase, 0, 'the sputter clock starts still');
  FamilyProductionFleet.prototype.setShipDrive.call(null, ship, { drive: 1, hullFrac: 0.22 });
  assert.equal(ship.hullFrac, 0.22, 'the dying tell rides the drive signals');
  FamilyProductionFleet.prototype.setShipDrive.call(null, ship, { drive: 1 });
  assert.equal(ship.hullFrac, 1, 'a read without hull fields restores intact');
});

test('actual pooled slot resets color and keeps turbulence without flashing under either preference', () => {
  const pool = new PlumeSlotPool(KESTREL_MAIN_PLUME_RECIPE);
  const sample = (frac, time, flags = {}) => {
    pool.update(1, null, flags, 1, 0, { hullFrac: frac, sputterPhase: time, entityId: 17 });
    return { color: [...pool.slots[0].color], turbulence: pool.slots[0].turbulence };
  };
  const intact = sample(1, 0);
  const hurt = sample(.05, 0, { reducedFlash: true });
  const repeated = sample(.05, 50, { reducedFlash: true });
  assert.deepEqual(repeated.color, hurt.color);
  assert.ok(Math.abs(repeated.turbulence - hurt.turbulence) < 1e-6);
  assert.ok(hurt.color[2] < intact.color[2]);
  assert.ok(hurt.turbulence > intact.turbulence);
  const reducedA = sample(.05, 0, { reducedMotion: true });
  const reducedB = sample(.05, 10, { reducedMotion: true });
  assert.deepEqual(reducedA.color, reducedB.color);
  assert.ok(Math.abs(reducedA.turbulence - reducedB.turbulence) < 1e-6);
});

test('actual player stream applies hull dimming each frame and restores healthy radiance', () => {
  const stream = new PlasmaStreamSystem(THREE); stream.attach(new THREE.Scene());
  const ship = { id: 9, hull: 100, hullMax: 100 }, socket = [{ x: 0, y: 0, z: 0, ax: 1, ay: 0, az: 0 }];
  const drive = { drive: 1, throttle: 1 };
  for (let i = 0; i < 80; i++) stream.update(1/60, socket, drive, { reducedFlash: true }, ship, 1);
  const healthy = stream._throats[0].material.uniforms.uRadiance.value;
  ship.hull = 5;
  stream.update(1/60, socket, drive, { reducedFlash: true }, ship, 1);
  const hurt = stream._throats[0].material.uniforms.uRadiance.value;
  stream.update(1/60, socket, drive, { reducedFlash: true }, ship, 8);
  assert.ok(hurt < healthy);
  assert.ok(Math.abs(stream._throats[0].material.uniforms.uRadiance.value - hurt) < 1e-4);
  ship.hull = 100;
  stream.update(1/60, socket, drive, { reducedFlash: true }, ship, 9);
  assert.ok(stream._throats[0].material.uniforms.uRadiance.value > hurt);
  stream.dispose();
});

test('worker vitals reach the family drive read with canonical simulation time', () => {
  const model = createReadModel();
  applySpawnInfos(model, [{ entityId: 42, type: 'ship', occupantGeneration: 1, vitals: { hull: 100, hullMax: 100 } }]);
  applyEntityVitals(model, [[42, entityVitalsOf({ type: 'ship', hull: 9, hullMax: 100 })]]);
  const entity = model.entities.get(42);
  const holder = { state: { playerId: 1, simTime: 23 }, _actuatorsFor: () => null, _rcsScaleFor: () => 1 };
  const drive = vfx._engineDriveFor.call(holder, entity, {});
  assert.equal(drive.hullFrac, .09);
  assert.equal(drive.simTime, 23);
  const fleetShip = {};
  FamilyProductionFleet.prototype.setShipDrive.call(null, fleetShip, drive);
  assert.equal(fleetShip.hullFrac, .09);
  assert.equal(fleetShip.sputterPhase, 23);
});

test('Latch native propulsion feeds live hull and sim time into its actual plume pool', async () => {
  const [{createSimulation}, {createSg02DynamicBodyOwner}, {latchBodySpec,LATCH_RADIUS},
    {bindLatchNative}, {stepLatchPropulsion}, {LATCH_GEOMETRY}, {createLatchNineVisualDriver,createLatchNinePlumeBatch},
    {ContinuousPlumeSystem}, {resolveThrusterRecipes}] = await Promise.all([
    import('../src/core/sim.js'), import('../src/core/sg02DynamicBodyOwner.js'),
    import('../src/data/latchNineBody.js'), import('../src/core/latchNineNative.js'),
    import('../src/systems/latchNinePropulsion.js'), import('../src/data/latchNineGeometry.js'),
    import('../src/render/latchNineVisuals.js'), import('../src/render/thruster/systems/continuousPlume.js'),
    import('../src/render/thruster/recipes/registry.js'),
  ]);
  const sim=createSimulation({seed:9,systems:[]}), s=sim.state;
  s.mode='flight';s.world.currentSectorId='sector_tethys_junction';s.render={scene:new THREE.Scene()};
  const e=sim.spawn({type:'prop',hull:100,hullMax:100,mass:140,radius:LATCH_RADIUS,pos:{x:0,z:0},vel:{x:0,z:0},rot:0,angVel:0,collides:true,physicsBody:latchBodySpec(),data:{role:'latch_nine',placeId:'place_latch_nine',latchNineService:{stationId:'station_tethys',sectorId:'sector_tethys_junction',box:{minX:19,maxX:21,minZ:-1,maxZ:1}}}});
  const root=new THREE.Group();root.userData.latchNineAuthoredSource={assetId:'SF_PLACE_LATCH_NINE',file:'places/place_latch_nine.glb'};
  for(const paddle of LATCH_GEOMETRY.paddles){const node=new THREE.Group();node.name=`MOTION_LATCH_PADDLE_${paddle.id.toUpperCase()}`;root.add(node);}
  for(const thruster of LATCH_GEOMETRY.thrusters){const socket=new THREE.Group();socket.name=thruster.node;root.add(socket);
    for(let i=0;i<3;i++){const mesh=new THREE.Mesh(new THREE.BoxGeometry(.1,.1,.1),new THREE.MeshStandardMaterial({emissive:0xffffff}));mesh.name=`HOOK_LATCH_THRUSTER_${thruster.id}_glow_${i}`;root.add(mesh);}}
  e.mesh=new THREE.Group();e.mesh.add(root);s.render.scene.add(e.mesh);s.render.scene.updateMatrixWorld(true);
  const native=await createSg02DynamicBodyOwner({mode:'rapier-dynamic'});native.syncFromEntities(s.entityList);assert.ok(bindLatchNative(native,native.records.get(e.id)));
  const driver=createLatchNineVisualDriver(root,e);assert.ok(driver.activate(e));
  const plume=new ContinuousPlumeSystem(THREE,resolveThrusterRecipes('engine_industrial').main,{maxSockets:8,distortionEnabled:false});
  const batch=createLatchNinePlumeBatch(plume,THREE.Vector3);
  try {
    for(let i=0;i<10;i++){native.step(1/60);stepLatchPropulsion(s,e,1/60);s.render.scene.updateMatrixWorld(true);driver.update(e,{});}
    assert.ok(batch.update(s,0,{reducedFlash:true})>0);
    const slot=batch.slots.find(row=>row.signals.throttle>0), healthy=[...plume.pool.slots[0].color];
    e.hull=8;s.simTime=.02;assert.ok(batch.update(s,0,{reducedFlash:true})>0);
    const damaged=[...plume.pool.slots[0].color];
    assert.equal(slot.signals.entityId,e.id);assert.equal(slot.signals.hullFrac,.08);assert.equal(slot.signals.sputterPhase,.02);
    assert.ok(damaged[2]<healthy[2]);
    s.simTime=.04;batch.update(s,0,{reducedFlash:true});assert.deepEqual([...plume.pool.slots[0].color],damaged);
    e.hullMax=undefined;batch.update(s,0,{reducedFlash:true});assert.equal(slot.signals.hullFrac,1);
    assert.deepEqual([...plume.pool.slots[0].color],healthy);
  } finally {batch.dispose();driver.dispose();native.dispose();sim.dispose();}
});
