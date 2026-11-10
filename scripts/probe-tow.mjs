// Compact probe of the anvil-orchard-tow scenario: latch the released pod, fly the escape,
// log tug/pod radii, rest length and measured force to find why the payout never engages.
import { PLANET_FLAGS, PLANET_SITE } from '../src/data/planets.js';
import { FIELD_FLAGS } from '../src/data/fields.js';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { world } from '../src/systems/world.js';
import { asteroidSites } from '../src/systems/asteroidSites.js';
import { input, applyFlightKeyEvent } from '../src/systems/input.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { fields } from '../src/systems/fields.js';
import { planetRuntime } from '../src/systems/planetRuntime.js';
import { physics } from '../src/core/physics.js';
import { environmentalMachinery } from '../src/systems/environmentalMachinery.js';
import { combat } from '../src/systems/combat.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';
import { cargo } from '../src/systems/cargo.js';
import { mining } from '../src/systems/mining.js';
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

const worldRecords = { name: 'world', init(ctx) { this.state = ctx.state; }, upsertWorldRecord: world.upsertWorldRecord };
PLANET_FLAGS.enabled = true; FIELD_FLAGS.enabled = true;
const sim = createSimulation({ seed: 20261012, systems: [worldRecords, asteroidSites, input, flightV3, fields, planetRuntime, physics, environmentalMachinery, combat, tetherGameplay, cargo, mining] });
const state = sim.state;
state.mode = 'flight';
state.world.currentSectorId = ANVIL_ORCHARD.sectorId;
state.sites.anvilOrchard = createOrchardRecord(0);
state.settings.gameplay.physicsBackend = 'rapier-dynamic';
const worker = sim.spawn({ type: 'ship', isPlayer: false, pos: { x: 14000, z: 9000 }, radius: 8, mass: 24, hull: 100,
  data: { defId: 'ship_kestrel', fittings: [], anvilSlingWitness: true, itinerary: { kind: 'anvil_work', role: 'collector', phase: 'collect' } } });
const planet = sim.registry.get('planetRuntime');
planet.update(SIM_DT, state);
const frame = state.entities.get(state.planet.orchardFrameId);
applyFrameOrigin(state, snapFrameOrigin(worker.pos, {}));
const leviathan = SHIPS.find((d) => d.id === 'ship_leviathan');
const capitalSpool = MODULES.find((d) => d.id === 'mod_massline_spool_l');
const fittings = fittingsFromDefaultModules(leviathan.id, [capitalSpool.id]);
const geometry = anvilOrchardGustGeometry(frame);
const escapeDir = { x: Math.cos(0.65) * geometry.dir.x - Math.sin(0.65) * geometry.dir.z,
  z: Math.sin(0.65) * geometry.dir.x + Math.cos(0.65) * geometry.dir.z };
const slot = ORCHARD_GEOMETRY.pods[1];
const c = Math.cos(frame.rot), s = Math.sin(frame.rot);
const sock = { x: frame.pos.x + c * slot.pos.x - s * slot.pos.z, z: frame.pos.z + s * slot.pos.x + c * slot.pos.z };
const tug = sim.spawn(makeShipEntitySpec(leviathan.id, { isPlayer: true, fittings,
  pos: { x: sock.x + escapeDir.x * 120, z: sock.z + escapeDir.z * 120 }, rot: Math.atan2(escapeDir.z, escapeDir.x) }));
state.playerId = tug.id;
const profile = resolvePropulsionProfile(tug, state);
console.log('mainAccel', profile.mainAccel, 'tetherSpoolMult', tug.data?.derived?.tetherSpoolMult);
const physicsFacade = sim.registry.get('physics');
await physicsFacade.prepareBackend(state);
if (physicsFacade._sg02Init) await physicsFacade._sg02Init;
const native = physicsFacade._sg02;
native.syncFromEntities(state.entityList);
const machine = sim.registry.get('environmentalMachinery');
machine.acceptOrchardNewPod(worker, { frame, socket: 1, qty: ANVIL_ORCHARD.unitsPerPod, commodityId: ANVIL_ORCHARD.commodityId });
const lotId = state.sites.anvilOrchard.sockets[1].lotId;
const pod = [...state.entities.values()].find((e) => e?.data?.orchardKind === 'pod' && e.data.worldRecordId === lotId);
console.log('pod', JSON.stringify({ id: pod.id, mass: pod.mass, radius: pod.radius }));
// release the pod like the test does (KeyB needs component selection — do it via socket status)
state.sites.anvilOrchard.sockets[1].status = 'drifting';
const keys = sim.registry.get('input');
const press = (code, pressed) => applyFlightKeyEvent(keys, { code, pressed });
const denials = [];
sim.bus.on('tether:latchDenied', (e) => denials.push(e));
sim.bus.on('tether:lineControlDenied', (e) => denials.push({ line: e.reason }));
press('ControlLeft', true); press('KeyF', true); sim.step();
press('ControlLeft', false); press('KeyF', false); sim.step();
const line = Object.values(state.combat.attachments.byId).find((a) => a.state === 'active' && a.targetId === pod.id);
console.log('line', line ? JSON.stringify({ id: line.id, rest: line.restLength }) : 'NONE', 'denials', JSON.stringify(denials));
if (!line) { sim.dispose(); native?.dispose?.(); process.exit(1); }
const center = state.planet.center;
for (let i = 0; i < 1200; i++) {
  const podRadius = Math.hypot(pod.pos.x - center.x, pod.pos.z - center.z);
  press('KeyW', true);
  const error = Math.atan2(Math.sin(Math.atan2(escapeDir.z, escapeDir.x) - tug.rot), Math.cos(Math.atan2(escapeDir.z, escapeDir.x) - tug.rot));
  const turn = error - tug.angVel * 0.4;
  press('ArrowLeft', turn < -0.035); press('ArrowRight', turn > 0.035);
  press('BracketRight', podRadius > PLANET_SITE.bands.sling);
  sim.step();
  if (i % 60 === 0) {
    const drive = readPhysicsTelemetry(tug);
    const dist = Math.hypot(pod.pos.x - tug.pos.x, pod.pos.z - tug.pos.z);
    console.log(`t${state.tick} podR=${podRadius.toFixed(0)} tugR=${Math.hypot(tug.pos.x - center.x, tug.pos.z - center.z).toFixed(0)} rest=${line.restLength.toFixed(1)} dist=${dist.toFixed(0)} drive=${(Math.hypot(drive.force.x, drive.force.z) / drive.mass).toFixed(2)} tension=${(line.lastTension || 0).toFixed(0)} reelDelta=${state.input?.actions?.reelDelta}`);
  }
}
sim.dispose(); native?.dispose?.();
