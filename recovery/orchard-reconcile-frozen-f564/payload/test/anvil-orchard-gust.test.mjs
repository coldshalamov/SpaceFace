import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { fields } from '../src/systems/fields.js';
import { planetRuntime } from '../src/systems/planetRuntime.js';
import { traffic } from '../src/systems/traffic.js';
import { world } from '../src/systems/world.js';
import { environmentalMachinery } from '../src/systems/environmentalMachinery.js';
import { save } from '../src/save/saveSystem.js';
import { PLANET_FLAGS, PLANET_SITE } from '../src/data/planets.js';
import { FIELD_FLAGS } from '../src/data/fields.js';
import { ANVIL_ORCHARD, orchardPhase } from '../src/data/anvilOrchard.js';
import { ORCHARD_GEOMETRY } from '../src/data/anvilOrchardBody.js';
import { SHIPS } from '../src/data/ships.js';
import { MODULES } from '../src/data/modules.js';
import { ATTACHMENT_DEFS } from '../src/data/combatDefs.js';
import {
  ANVIL_ORCHARD_GUST_PROFILE, anvilOrchardGustGeometry,
} from '../src/data/environmentalMachinery.js';
import { isOrchardFrame } from '../src/data/anvilOrchardIdentity.js';
import { sampleFieldAcceleration } from '../src/core/fields/fieldKernel.js';
import { fieldHud } from '../src/ui/fieldHud.js';

const trafficWork = { ...traffic, update(dt, state) { this._stepAnvilWork(dt, state); } };
const worldRecords = {
  name: 'world', init(ctx) { this.state = ctx.state; }, upsertWorldRecord: world.upsertWorldRecord,
};
function boot({ withSave = false, deferredBackend = false } = {}) {
  PLANET_FLAGS.enabled = true;
  FIELD_FLAGS.enabled = true;
  const systems = [worldRecords, trafficWork, fields, planetRuntime, flightV3, environmentalMachinery, physics];
  if (withSave) systems.push(save);
  // Keep the harness's relevant step sequence production-relative: machinery schedules before
  // fields samples, and planet residency is updated before physics solves.
  const updateOrder = [environmentalMachinery, fields, planetRuntime, flightV3, physics];
  if (withSave) updateOrder.push(save);
  const sim = createSimulation({ seed: 424214, systems, updateOrder });
  const state = sim.state;
  state.mode = 'flight';
  state.world.currentSectorId = PLANET_SITE.sectorId;
  state.sites = {};
  state.settings.gameplay.physicsBackend = deferredBackend ? 'custom' : 'rapier-dynamic';
  sim.step();
  return { sim, state, fields: sim.registry.get('fields'), env: sim.registry.get('environmentalMachinery'), planet: sim.registry.get('planetRuntime'), physics: sim.registry.get('physics'), save: sim.registry.get('save') };
}
function close(t) {
  t.sim.dispose();
  PLANET_FLAGS.enabled = false;
  FIELD_FLAGS.enabled = false;
}
function liveFrame(state) {
  return [...state.entities.values()].find(entity => entity?.alive !== false && isOrchardFrame(entity));
}
function canonicalPull(fieldsSys) {
  return fieldsSys.kernelList().find(field => field.id === `${PLANET_SITE.id}_pull`);
}
function forceReceipt(fieldsSys, entity, state, list = fieldsSys.kernelList()) {
  const profile = fieldsSys._profileFor(entity, state);
  return sampleFieldAcceleration(entity.pos, entity.vel, list, state.simTime, profile, { ax: 0, az: 0 });
}

test('Orchard gust follows the saved phase through Continue and sector return without touching the Anvil well', async () => {
  const t = boot({ withSave: true });
  try {
    const frame = liveFrame(t.state);
    assert.ok(frame);
    const anchorTick = t.state.sites.anvilOrchard.phaseAnchorTick;
    const geometry = anvilOrchardGustGeometry(frame, { center: { x: 0, z: 0 }, dir: { x: 1, z: 0 } });
    const player = t.sim.spawn({ type: 'ship', pos: { x: geometry.center.x + geometry.dir.x * 190,
      z: geometry.center.z + geometry.dir.z * 190 }, radius: 8, hull: 100, data: {} });
    t.state.playerId = player.id;
    assert.equal(await t.physics.prepareBackend(t.state), true);
    assert.ok(t.physics.readOrchardFramePose(frame), 'the forecast fixture starts with a settled native owner');
    const hud = Object.create(fieldHud);
    hud._orchardGeometry = { center: { x: 0, z: 0 }, dir: { x: 1, z: 0 } };
    hud._orchardPhaseOut = {};
    const canonical = canonicalPull(t.fields);
    assert.ok(canonical, 'the canonical planet well is registered by planetRuntime');
    const canonicalBefore = { id: canonical.id, center: { ...canonical.center }, dir: { ...canonical.dir },
      strength: canonical.strength, radius: canonical.radius, innerRadius: canonical.innerRadius,
      innerSoft: canonical.innerSoft, falloff: canonical.falloff };
    const gustId = ANVIL_ORCHARD_GUST_PROFILE.id;
    assert.equal(t.fields.hasExternal(gustId), false, 'calm does not register a local effect');

    // Keep the real core clock, registered systems and persisted phase projection. Jumping the
    // test clock avoids 719 no-op ticks; the scheduler still crosses its actual 719/720 gates.
    t.state.tick = anchorTick + 718;
    t.state.simTime = t.state.tick / 60;
    t.sim.step();
    assert.equal(t.state.tick, anchorTick + 719);
    assert.deepEqual(orchardPhase(t.state.sites.anvilOrchard, t.state.tick), { phase: 'forecast', remainingTicks: 1 });
    assert.equal(t.fields.hasExternal(gustId), false, 'the last forecast tick has no force field');
    const forecast = hud._resolveEnvironmental(t.state, t.state.simTime);
    assert.equal(forecast.phase, 'forecast');
    assert.equal(forecast.remainingTicks, 1);
    assert.ok(forecast.localStrength > 0 && forecast.localStrength < ANVIL_ORCHARD_GUST_PROFILE.strength,
      'forecast reads the kernel-sampled local acceleration, not the nominal peak as a per-point force');
    assert.equal(hud._resolve(null, t.state.simTime, forecast).text.includes('FORECAST 1s'), true);
    assert.equal(hud._resolve(null, t.state.simTime, forecast).text.includes('WU/s²'), true);
    player.pos.x = geometry.center.x + 450 * Math.cos(1.25) * geometry.dir.x - 450 * Math.sin(1.25) * geometry.dir.z;
    player.pos.z = geometry.center.z + 450 * Math.sin(1.25) * geometry.dir.x + 450 * Math.cos(1.25) * geometry.dir.z;
    const safePocket = hud._resolveEnvironmental(t.state, t.state.simTime);
    assert.ok(safePocket, 'the bounded nearby observer still shows the planning clock outside the force wedge');
    assert.equal(safePocket.localStrength, 0, 'the safe pocket forecast reports zero local field acceleration');
    assert.ok(hud._resolve(null, t.state.simTime, safePocket).text.includes('FORECAST 1s'));

    const envelope = JSON.parse(JSON.stringify(t.save.serialize('orchard-gust-continue-719')));
    delete envelope.checksum;
    assert.equal(t.save.loadEnvelope(envelope), true, 'the normal Save/Continue loader accepts the saved boundary');
    assert.equal(t.physics._nativeRestorePending, false);
    assert.ok(t.physics.readOrchardFramePose(liveFrame(t.state)), 'ordinary Anvil field exposure cannot invalidate the restored source frame');
    assert.equal(liveFrame(t.state).physicsBody.anchorRecoil, false);
    assert.equal(t.state.sites.anvilOrchard.phaseAnchorTick, anchorTick);
    assert.deepEqual(orchardPhase(t.state.sites.anvilOrchard, t.state.tick), { phase: 'forecast', remainingTicks: 1 });
    t.sim.step();
    assert.equal(t.state.tick, anchorTick + 720);
    assert.deepEqual(orchardPhase(t.state.sites.anvilOrchard, t.state.tick), { phase: 'gust', remainingTicks: 300 });
    assert.equal(t.fields.hasExternal(gustId), true, 'the first gust tick registers the cone');
    const livePlayer = t.state.entities.get(player.id) || t.sim.spawn({ type: 'ship', isPlayer: true,
      pos: { x: geometry.center.x + geometry.dir.x * 190, z: geometry.center.z + geometry.dir.z * 190 },
      radius: 8, hull: 100, data: {} });
    t.state.playerId = livePlayer.id;
    livePlayer.pos.x = geometry.center.x + geometry.dir.x * 190;
    livePlayer.pos.z = geometry.center.z + geometry.dir.z * 190;
    const activeHud = hud._resolveEnvironmental(t.state, t.state.simTime);
    assert.equal(activeHud.phase, 'gust');
    assert.equal(activeHud.remainingTicks, 300);
    assert.ok(activeHud.localStrength > 0 && activeHud.localStrength < ANVIL_ORCHARD_GUST_PROFILE.strength,
      'active HUD samples local acceleration from the same registered kernel field');
    const field = t.fields.kernelList().find(item => item.id === gustId);
    assert.ok(field);
    assert.equal(field.tag, 'environmental');
    assert.equal(field.kind, 'cone');
    assert.equal(field.center.x, frame.pos.x);
    assert.equal(field.center.z, frame.pos.z);
    assert.equal(field.strength, ANVIL_ORCHARD_GUST_PROFILE.strength);
    assert.deepEqual({ id: canonicalPull(t.fields).id, center: canonicalPull(t.fields).center,
      dir: canonicalPull(t.fields).dir, strength: canonicalPull(t.fields).strength,
      radius: canonicalPull(t.fields).radius, innerRadius: canonicalPull(t.fields).innerRadius,
      innerSoft: canonicalPull(t.fields).innerSoft, falloff: canonicalPull(t.fields).falloff }, canonicalBefore,
    'the single canonical Anvil well is byte-for-byte unchanged by the Orchard gust');

    t.state.world.currentSectorId = 'sector_test_elsewhere';
    t.sim.step();
    assert.equal(t.fields.hasExternal(gustId), false, 'sector departure unregisters the local gust');
    const anchorAfterLeave = t.state.sites.anvilOrchard.phaseAnchorTick;
    const frameCount = t.state.entityList.filter(entity => entity?.alive !== false
      && entity.data?.worldRecordId === ORCHARD_GEOMETRY.worldRecordId).length;
    t.state.world.currentSectorId = ANVIL_ORCHARD.sectorId;
    t.sim.step();
    assert.equal(t.state.sites.anvilOrchard.phaseAnchorTick, anchorAfterLeave);
    assert.equal(t.fields.hasExternal(gustId), true, 'reentry resumes the current gust from its durable anchor');
    assert.equal(t.state.entityList.filter(entity => entity?.alive !== false
      && entity.data?.worldRecordId === ORCHARD_GEOMETRY.worldRecordId).length, frameCount,
    'reentry keeps the existing single frame and cannot duplicate its field');
    assert.equal(t.fields.kernelList().filter(item => item.id === gustId).length, 1);
  } finally { close(t); }
});

test('three Orchard wedge positions and an outside point agree with the actual kernel and native impulse', async () => {
  const t = boot({ deferredBackend: true });
  try {
    const state = t.state;
    const frame = liveFrame(state);
    assert.ok(frame);
    const geom = anvilOrchardGustGeometry(frame, { center: { x: 0, z: 0 }, dir: { x: 1, z: 0 } });
    const makePoint = (r, angle) => ({ x: geom.center.x + r * (Math.cos(angle) * geom.dir.x - Math.sin(angle) * geom.dir.z),
      z: geom.center.z + r * (Math.sin(angle) * geom.dir.x + Math.cos(angle) * geom.dir.z) });
    const anchorTick = state.sites.anvilOrchard.phaseAnchorTick;
    // Use the ordinary Anvil resident producer before native acquisition, as on the gameplay
    // route; the finite frame owner must start from its accepted, exact source/row pair.
    const collector = state.entities.get(state.planet.witnessId);
    collector.pos.x = state.planet.center.x + 960;
    collector.pos.z = state.planet.center.z;
    collector.vel.x = 0;
    collector.vel.z = 70;
    collector.data.itinerary.phase = 'collect';
    t.planet._tickShips(SIM_DT, state, state.planet, PLANET_SITE);
    const observer = t.sim.spawn({ type: 'ship', isPlayer: true, collides: false, physicsBody: false,
      pos: makePoint(220, 0), hull: 100 });
    state.playerId = observer.id;
    state.settings.gameplay.physicsBackend = 'rapier-dynamic';
    assert.equal(await t.physics.prepareBackend(state), true);
    if (t.physics._sg02Init) await t.physics._sg02Init;
    t.physics._syncSg02DynamicAuthorityEntities(state);
    assert.ok(t.physics.readOrchardFramePose(frame), 'the normal registered route owns the exact live Orchard frame');
    state.tick = anchorTick + 718;
    state.simTime = state.tick / 60;
    t.sim.step();
    assert.equal(state.tick, anchorTick + 719);
    assert.equal(t.fields.hasExternal(ANVIL_ORCHARD_GUST_PROFILE.id), false,
      'tick 719 is the final forecast tick even when reached after save restore');
    t.sim.step();
    assert.equal(state.tick, anchorTick + 720);
    assert.equal(t.fields.hasExternal(ANVIL_ORCHARD_GUST_PROFILE.id), true);
    const points = [makePoint(155, 0), makePoint(235, 0.2), makePoint(320, -0.3), makePoint(230, 1.25)];
    const leviathanDef = SHIPS.find(ship => ship.id === 'ship_leviathan');
    const capitalSpool = MODULES.find(module => module.id === 'mod_massline_spool_l');
    const standardTether = ATTACHMENT_DEFS.find(def => def.id === 'tether_standard');
    assert.ok(leviathanDef && capitalSpool && standardTether);
    assert.equal(leviathanDef.collisionRadius, 45, 'the test uses the catalogued Leviathan hull radius');
    const capitalSpoolMax = standardTether.maxLength * capitalSpool.mods.tetherSpoolMult;
    assert.equal(capitalSpoolMax, 2340, 'the test derives the full-capital-spool line from catalog data');
    const bodies = [
      t.sim.spawn({ type: 'ship', pos: points[0], vel: { x: 0, z: 0 }, rot: 0,
        radius: leviathanDef.collisionRadius, mass: leviathanDef.mass,
        hull: leviathanDef.hull, hullMax: leviathanDef.hull, collides: true,
        physicsBody: { schemaVersion: 1, dynamic: true, shape: 'ball', radius: leviathanDef.collisionRadius,
          mass: leviathanDef.mass, inertiaY: 1000, ccd: true, material: 'ship', revision: 1 },
        data: { defId: leviathanDef.id, combatProfileId: 'combat_profile_standard_ship' } }),
      t.sim.spawn({ type: 'wreck', pos: points[1], vel: { x: 0, z: 0 }, radius: 6, mass: 30,
        hull: 100, collides: true,
        physicsBody: { schemaVersion: 1, dynamic: true, shape: 'ball', radius: 6, mass: 30, inertiaY: 20, ccd: false, material: 'debris', revision: 1 }, data: {} }),
      t.sim.spawn({ type: 'payload', pos: points[2], vel: { x: 0, z: 0 }, radius: ORCHARD_GEOMETRY.pod.radius,
        mass: ORCHARD_GEOMETRY.pod.mass, hull: 100, collides: true,
        physicsBody: { schemaVersion: 1, dynamic: true, shape: 'ball', radius: ORCHARD_GEOMETRY.pod.radius,
          mass: ORCHARD_GEOMETRY.pod.mass, inertiaY: 16.2, ccd: true, material: 'pod', revision: 1 },
        data: { releasedCargoTestBody: true } }),
      t.sim.spawn({ type: 'wreck', pos: points[3], vel: { x: 0, z: 0 }, radius: 6, mass: 30,
        hull: 100, collides: true,
        physicsBody: { schemaVersion: 1, dynamic: true, shape: 'ball', radius: 6, mass: 30, inertiaY: 20, ccd: false, material: 'debris', revision: 1 }, data: {} }),
    ];
    assert.deepEqual(points.slice(0, 3).map(point => t.fields.kernelList().some(field => field.id === ANVIL_ORCHARD_GUST_PROFILE.id
      && sampleFieldAcceleration(point, null, [field], state.simTime, { type: 'wreck', mass: 30 }, { ax: 0, az: 0 }).ax !== 0)),
    [true, true, true]);
    assert.equal(Math.hypot(...Object.values(sampleFieldAcceleration(points[3], null,
      [t.fields.kernelList().find(field => field.id === ANVIL_ORCHARD_GUST_PROFILE.id)], state.simTime,
      { type: 'wreck', mass: 30 }, { ax: 0, az: 0 }))), 0,
    'the chosen outside route is outside this authored wedge');

    // A deliberately narrow safe-hold/escape route: the real radius-45 Leviathan and released
    // Orchard pod are aligned with the gust axis on the outside of the field; the deployed
    // capital spool is at its actual 2340-WU ceiling. This says nothing about other line angles
    // or atmospheric heat, which remain under their existing owners.
    const leviathanRadius = leviathanDef.collisionRadius;
    const holdShip = { x: geom.center.x + geom.dir.x * (ANVIL_ORCHARD_GUST_PROFILE.radius + leviathanRadius + capitalSpoolMax),
      z: geom.center.z + geom.dir.z * (ANVIL_ORCHARD_GUST_PROFILE.radius + leviathanRadius + capitalSpoolMax) };
    const holdPod = { x: holdShip.x - geom.dir.x * capitalSpoolMax,
      z: holdShip.z - geom.dir.z * capitalSpoolMax };
    assert.equal(bodies[0].radius, leviathanRadius);
    assert.equal(bodies[2].type, 'payload');
    assert.equal(bodies[2].radius, ORCHARD_GEOMETRY.pod.radius);
    assert.equal(bodies[2].physicsBody.mass, ORCHARD_GEOMETRY.pod.mass);
    assert.ok(Math.hypot(holdShip.x - holdPod.x, holdShip.z - holdPod.z) <= capitalSpoolMax);
    assert.ok(Math.hypot(holdPod.x - geom.center.x, holdPod.z - geom.center.z) > ANVIL_ORCHARD_GUST_PROFILE.radius);
    assert.equal(Math.hypot(...Object.values(sampleFieldAcceleration(holdShip, { x: 0, z: 0 },
      [t.fields.kernelList().find(field => field.id === ANVIL_ORCHARD_GUST_PROFILE.id)], state.simTime,
      { id: bodies[0].id, type: 'ship', mass: leviathanDef.mass }, { ax: 0, az: 0 }))), 0);
    assert.equal(Math.hypot(...Object.values(sampleFieldAcceleration(holdPod, { x: 0, z: 0 },
      [t.fields.kernelList().find(field => field.id === ANVIL_ORCHARD_GUST_PROFILE.id)], state.simTime,
      { id: bodies[2].id, type: 'payload', mass: ORCHARD_GEOMETRY.pod.mass }, { ax: 0, az: 0 }))), 0);

    state.settings.gameplay.physicsBackend = 'rapier-dynamic';
    t.physics._syncSg02DynamicAuthorityEntities(state);
    assert.ok(bodies.every(entity => t.physics._sg02?.records.has(entity.id)),
      `all four sample bodies are resident in the actual dynamic Rapier owner (${JSON.stringify({ ids: bodies.map(e => e.id), owner: !!t.physics._sg02, pending: [...(t.physics._sg02?._pendingNativeRebuilds?.values?.() || [])].map(p => [p.entity?.id, p.error?.message]) })})`);
    // The direct scheduler call above proves the one lifecycle owner. Now take one production
    // fixed step so fields samples its registered cone and sends its impulse through Rapier.
    const before = bodies.map(entity => ({ x: entity.vel.x, z: entity.vel.z }));
    const predicted = bodies.map(entity => forceReceipt(t.fields, entity, state));
    t.sim.step();
    for (let i = 0; i < bodies.length; i++) {
      const observed = { x: bodies[i].vel.x - before[i].x, z: bodies[i].vel.z - before[i].z };
      assert.ok(Math.hypot(predicted[i].ax, predicted[i].az) > 1e-8, `body ${i} has a real kernel impulse sample`);
      assert.ok(Math.abs(observed.x - predicted[i].ax * SIM_DT) < 0.02,
        `body ${i} x native Δv matches the kernel (${observed.x} vs ${predicted[i].ax * SIM_DT})`);
      assert.ok(Math.abs(observed.z - predicted[i].az * SIM_DT) < 0.02,
        `body ${i} z native Δv matches the kernel (${observed.z} vs ${predicted[i].az * SIM_DT})`);
    }
  } finally { close(t); }
});
