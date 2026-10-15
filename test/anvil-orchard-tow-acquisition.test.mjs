import test from 'node:test';
import { register } from 'node:module';

// uiRoot's real DOM command handler is module-private. This test-only loader exposes
// that unchanged function, without patching game source or reproducing its behavior.
// register is supported by the repository's Node >=22.12 engine floor.
register('data:text/javascript,' + encodeURIComponent(`
export async function load(url, context, next) {
  const result = await next(url, context);
  if (url.endsWith('/src/ui/uiRoot.js')) return { ...result,
    source: String(result.source) + '\\nexport { cycleTargetComponent as orchardRouteCycleComponent };\\n' };
  return result;
}`), import.meta.url);
const { cycleTarget, orchardRouteCycleComponent } = await import('../src/ui/uiRoot.js');

import { mining } from '../src/systems/mining.js';
import { cargo } from '../src/systems/cargo.js';
import { combat } from '../src/systems/combat.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';
import { input, applyFlightKeyEvent } from '../src/systems/input.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { planetRuntime } from '../src/systems/planetRuntime.js';
import { PLANET_FLAGS, PLANET_SITE } from '../src/data/planets.js';
import { world } from '../src/systems/world.js';
import assert from 'node:assert/strict';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { fields } from '../src/systems/fields.js';
import { asteroidSites } from '../src/systems/asteroidSites.js';
import { environmentalMachinery } from '../src/systems/environmentalMachinery.js';
import { FIELD_FLAGS } from '../src/data/fields.js';
import { ANVIL_ORCHARD, createOrchardRecord } from '../src/data/anvilOrchard.js';
import { ORCHARD_GEOMETRY } from '../src/data/anvilOrchardBody.js';
import { anvilOrchardGustGeometry } from '../src/data/environmentalMachinery.js';
import { applyFrameOrigin, snapFrameOrigin } from '../src/core/coordinates.js';
import { makeShipEntitySpec, fittingsFromDefaultModules } from '../src/systems/ships.js';
import { SHIPS } from '../src/data/ships.js';
import { MODULES } from '../src/data/modules.js';
import { ATTACHMENT_DEFS } from '../src/data/combatDefs.js';
import { readPhysicsTelemetry } from '../src/core/physicsAuthority.js';
import { resolvePropulsionProfile } from '../src/core/flight/propulsionCatalog.js';

const worldRecords = { name: 'world', init(ctx) { this.state = ctx.state; },
  upsertWorldRecord: world.upsertWorldRecord };
const SOCKET = 1;

function worldPodSocket(frame) {
  const slot = ORCHARD_GEOMETRY.pods[SOCKET];
  const c = Math.cos(frame.rot), s = Math.sin(frame.rot);
  return {
    x: frame.pos.x + c * slot.pos.x - s * slot.pos.z,
    z: frame.pos.z + s * slot.pos.x + c * slot.pos.z,
  };
}

function rotateFromAxis(axis, angle) {
  return {
    x: Math.cos(angle) * axis.x - Math.sin(angle) * axis.z,
    z: Math.sin(angle) * axis.x + Math.cos(angle) * axis.z,
  };
}

// A finite filled pod is the fixture boundary. Opening, acquisition, escape and payout
// then use ordinary owner ticks; the feedback pilot emits keyboard transitions only.
// This headless focused composition does not establish browser affordance or player feel.
test('raw latch, steering and payout reach maximum capital tow from the authored Orchard', async () => {
  const wasEnabled = FIELD_FLAGS.enabled, wasPlanetEnabled = PLANET_FLAGS.enabled;
  PLANET_FLAGS.enabled = true;
  FIELD_FLAGS.enabled = true;
  const sim = createSimulation({
    seed: 20261012,
    systems: [worldRecords, asteroidSites, input, flightV3, fields, planetRuntime, physics, environmentalMachinery, combat, tetherGameplay, cargo, mining],
  });
  let native = null;
  try {
    const state = sim.state;
    state.mode = 'flight';
    state.world.currentSectorId = ANVIL_ORCHARD.sectorId;
    state.sites.anvilOrchard = createOrchardRecord(0);
    state.settings.gameplay.physicsBackend = 'rapier-dynamic';

    const worker = sim.spawn({
      type: 'ship', isPlayer: false, pos: { x: 14000, z: 9000 }, radius: 8, mass: 24, hull: 100,
      data: {
        defId: 'ship_kestrel', fittings: [], anvilSlingWitness: true,
        itinerary: { kind: 'anvil_work', role: 'collector', phase: 'collect' },
      },
    });
    const planet = sim.registry.get('planetRuntime');
    planet.update(SIM_DT, state);
    const frame = state.entities.get(state.planet.orchardFrameId);
    assert.ok(frame, 'ordinary planet adapter authors the frame');
    assert.ok(Math.abs(Math.hypot(frame.pos.x-state.planet.center.x, frame.pos.z-state.planet.center.z)
      - (PLANET_SITE.bands.skim + PLANET_SITE.bands.sling)/2) < 1e-8);
    applyFrameOrigin(state, snapFrameOrigin(worker.pos, {}));

    const leviathan = SHIPS.find(def => def.id === 'ship_leviathan');
    const capitalSpool = MODULES.find(def => def.id === 'mod_massline_spool_l');
    const standardTether = ATTACHMENT_DEFS.find(def => def.id === 'tether_standard');
    assert.ok(leviathan && capitalSpool && standardTether);
    assert.equal(leviathan.collisionRadius, 45, 'use the catalog Leviathan hull');
    const fittings = fittingsFromDefaultModules(leviathan.id, [capitalSpool.id]);
    const spoolLength = standardTether.maxLength * capitalSpool.mods.tetherSpoolMult;
    assert.equal(spoolLength, 2340, 'derive the capital spool ceiling from the catalog');

    const geometry = anvilOrchardGustGeometry(frame);
    const escapeAngle = 0.65;
    const escapeDir = rotateFromAxis(geometry.dir, escapeAngle);
    const podSocket = worldPodSocket(frame);
    const tug = sim.spawn(makeShipEntitySpec(leviathan.id, {
      isPlayer: true,
      fittings,
      pos: { x: podSocket.x + escapeDir.x * 120, z: podSocket.z + escapeDir.z * 120 },
      // The test flies a normal forward-thrust escape, so the capital torch points along it.
      rot: Math.atan2(escapeDir.z, escapeDir.x),
    }));
    state.playerId = tug.id;
    const propulsionProfile = resolvePropulsionProfile(tug, state);
    assert.ok(propulsionProfile.mainAccel > 0, 'the fitted Leviathan publishes a usable drive ceiling');

    const physicsFacade = sim.registry.get('physics');
    assert.equal(await physicsFacade.prepareBackend(state), true);
    if (physicsFacade._sg02Init) await physicsFacade._sg02Init;
    native = physicsFacade._sg02;
    assert.ok(native);
    // Initial native roster setup only; all release and tether motion uses ordinary sim.step.
    native.syncFromEntities(state.entityList);
    assert.ok(native.records.has(frame.id) && native.records.has(worker.id) && native.records.has(tug.id));
    assert.equal(native.records.get(tug.id).spec.radius, leviathan.collisionRadius);

    const machine = sim.registry.get('environmentalMachinery');
    const fieldSystem = sim.registry.get('fields');
    const planetWell = fieldSystem.kernelList().find(field => field.id === state.planet.fieldId);
    assert.ok(planetWell, 'canonical planet field is registered');
    for (const key of ['radius','strength','falloff','innerRadius','innerSoft'])
      assert.equal(planetWell[key], PLANET_SITE.field[key], `unchanged canonical ${key}`);
    assert.deepEqual(planetWell.center, state.planet.center);
    const platform = ORCHARD_GEOMETRY.parts.find(part => part.id === 'safe-platform');
    assert.ok(platform);
    for (const [x,z] of platform.points) {
      const px = frame.pos.x + Math.cos(frame.rot)*x - Math.sin(frame.rot)*z;
      const pz = frame.pos.z + Math.sin(frame.rot)*x + Math.cos(frame.rot)*z;
      assert.ok(Math.hypot(px-state.planet.center.x,pz-state.planet.center.z) > PLANET_SITE.bands.skim,
        'authored service slab itself is outside the heating band');
    }
    assert.equal(machine.acceptOrchardNewPod(worker, {
      frame, socket: SOCKET, qty: ANVIL_ORCHARD.unitsPerPod, commodityId: ANVIL_ORCHARD.commodityId,
    }), ANVIL_ORCHARD.unitsPerPod);
    const lotId = state.sites.anvilOrchard.sockets[SOCKET].lotId;
    const pod = [...state.entities.values()].find(entity => entity?.data?.orchardKind === 'pod'
      && entity.data.worldRecordId === lotId);
    assert.ok(pod && native.records.has(pod.id));


    const keys = sim.registry.get('input');
    for(let i=0;i<state.entityList.length && state.player.targetId!==frame.id;i++) cycleTarget(state,1,sim.bus);
    assert.equal(state.player.targetId,frame.id);
    for(let i=0;i<4 && state.ui.componentSelection?.componentId!==`orchard_socket_${SOCKET}`;i++)
      orchardRouteCycleComponent(state,1,sim.bus);
    assert.equal(state.ui.componentSelection.componentId,`orchard_socket_${SOCKET}`);
    applyFlightKeyEvent(keys,{code:'KeyB',pressed:true});
    for (let i=0; i<35 && state.sites.anvilOrchard.sockets[SOCKET].status !== 'drifting'; i++) sim.step();
    assert.equal(state.sites.anvilOrchard.sockets[SOCKET].status,'drifting',JSON.stringify({slot:state.sites.anvilOrchard.sockets[SOCKET],act:pod.activity,frame:frame.activity,ready:physicsFacade.readOrchardPodReady(pod,state)}));
    applyFlightKeyEvent(keys,{code:'KeyB',pressed:false});
    assert.ok(physicsFacade.readOrchardPodReady(pod,state));

    const press = (code, pressed) => applyFlightKeyEvent(keys,{code,pressed});
    const denials=[]; sim.bus.on('tether:latchDenied', event=>denials.push(event));
    press('ControlLeft',true); press('KeyF',true); sim.step();
    press('ControlLeft',false); press('KeyF',false); sim.step();
    const line = Object.values(state.combat.attachments.byId).find(a=>a.state==='active' && a.targetId===pod.id);
    assert.ok(line,JSON.stringify({denials,acquisition:state.masslineAcquisition,tether:state.tether}));
    const initialLength=line.restLength;
    assert.ok(initialLength>50 && initialLength<200);
    let minPodRadius=Infinity, minHullRadius=Infinity, maxHeat=0, maxDrive=0;
    for(let i=0;i<5000 && line.restLength < spoolLength-0.01;i++) {
      const center=state.planet.center;
      const podRadius=Math.hypot(pod.pos.x-center.x,pod.pos.z-center.z);

      press('KeyW',true);
      const error=Math.atan2(Math.sin(Math.atan2(escapeDir.z,escapeDir.x)-tug.rot),Math.cos(Math.atan2(escapeDir.z,escapeDir.x)-tug.rot));
      const turn=error-tug.angVel*0.4;
      press('ArrowLeft',turn < -0.035); press('ArrowRight',turn > 0.035);
      press('BracketRight',podRadius>PLANET_SITE.bands.sling);
      sim.step();
      minPodRadius=Math.min(minPodRadius,Math.hypot(pod.pos.x-center.x,pod.pos.z-center.z)-pod.radius);
      minHullRadius=Math.min(minHullRadius,Math.hypot(tug.pos.x-center.x,tug.pos.z-center.z)-tug.radius);
      const drive=readPhysicsTelemetry(tug);
      assert.equal(drive.tick,state.tick);
      maxDrive=Math.max(maxDrive,Math.hypot(drive.force.x,drive.force.z)/drive.mass);
      assert.ok(maxDrive<=propulsionProfile.mainAccel+1e-4);
      assert.ok(native.getAttachmentTelemetry({attachmentId:line.id,tick:state.tick}));
      maxHeat=Math.max(maxHeat,state.planet.ships[pod.id]?.heat||0);

      assert.equal(pod.alive,true);
      assert.equal(line.state,'active');
    }
    console.log('ACQUIRED_MAX_TOW',JSON.stringify({tick:state.tick,initialLength,rest:line.restLength,minPodRadius,minHullRadius,maxHeat,maxDrive}));
    assert.ok(line.restLength>=spoolLength-0.01);
    assert.ok(minPodRadius>PLANET_SITE.bands.skim);
    assert.ok(minHullRadius>PLANET_SITE.bands.skim);
    assert.ok(maxDrive>0);
    assert.equal(maxHeat,0);
    assert.equal(state.sites.anvilOrchard.sourceRemaining,44);
    assert.equal(state.sites.anvilOrchard.lots.find(l=>l.id===lotId)?.outcome,'retained');
    assert.equal(state.sites.anvilOrchard.sockets[SOCKET].status,'drifting');
    assert.equal(pod.data.amount,4);
  } finally {
    sim.dispose();
    native?.dispose?.();
    FIELD_FLAGS.enabled = wasEnabled; PLANET_FLAGS.enabled = wasPlanetEnabled;
  }
});
