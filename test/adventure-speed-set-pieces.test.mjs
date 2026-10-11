import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { missions } from '../src/systems/missions.js';
import { combat } from '../src/systems/combat.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { createTacticalAISystem } from '../src/systems/tacticalAI.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { weapons } from '../src/systems/weapons.js';
import { actions } from '../src/systems/actions.js';
import { WEAPONS } from '../src/data/weapons.js';
import { tetherGameplay, isAttachable } from '../src/systems/tetherGameplay.js';
import { addCargo, sellableCargoQuantity } from '../src/systems/cargo.js';
import { getCombatKernel } from '../src/combat/kernel.js';
import { serializeCombatState } from '../src/combat/persistence.js';
import { save } from '../src/save/saveSystem.js';
import { adventureSpeedOfferFor } from '../src/data/adventureSpeedContracts.js';
import { raceGateGlobals } from '../src/data/raceLevels.js';
import { gateApproach } from '../src/systems/racingGeometry.js';
import { stepAdventureSpeed } from '../src/missions/adventureSpeedRuntime.js';
import { thermalShelterFor } from '../src/missions/adventureSpeedSetPieces.js';

const clone = value => JSON.parse(JSON.stringify(value));
const gateEvent = (gateIndex, elapsedS, finished = false) => ({ gateIndex, elapsedS, finished, lap: 0 });

function fixture(id = 'speed_helios_cold_chain', systems = []) {
  const sim = createSimulation({ seed: 91026, systems: [combat, missions, ...systems], updateOrder: [] });
  const state = sim.state, host = sim.registry.get('missions'), offer = adventureSpeedOfferFor(id);
  state.mode = 'flight'; state.simTime = 100; state.world.currentSectorId = offer.params.courseSectorId;
  state.settings.gameplay.tutorialHints = false; state.onboarding = { active: false, finished: true };
  state.player.cargo = { items: {}, capVolume: 40, usedVolume: 0, usedMass: 0 };
  const player = sim.spawn({ type: 'ship', isPlayer: true, team: 0, pos: { x: 0, z: 0 },
    radius: 8, mass: 100, hull: 100, hullMax: 100, collides: true,
    data: systems.includes(weapons) ? { weapons: [{ ...WEAPONS.find(row => row.id === 'wpn_autocannon_s'),
      defId: 'wpn_autocannon_s', slotIndex: 0 }] } : null,
    physicsBody: { schemaVersion: 1, dynamic: true, shape: 'ball', radius: 8, mass: 100, inertiaY: 3200 } });
  state.playerId = player.id;
  const grants = [], delivered = [];
  sim.bus.on('economy:grantCredits', row => grants.push(row));
  sim.bus.on('cargo:delivered', row => delivered.push(row));
  const accept = () => {
    host.ensureBoard(offer.stationId);
    assert.equal(host.acceptMission(offer.id), true);
    const mission = state.missions.active.find(m => m.params?.adventureSpeedId === id);
    mission.params.raceStartSimS = 100; mission.params.gridUntilSimS = 100;
    return mission;
  };
  const drive = mission => host._driveRace(mission, state.missions.active.indexOf(mission), state);
  return { sim, state, host, offer, player, grants, delivered, accept, drive,
    close() { host._adventureSpeedSetPieces?.dispose(); sim.dispose(); } };
}

function crossPlayerGate(h, m, seconds = 1) {
  const p = m.params, gates = raceGateGlobals(p), gate = gates[p.nextGate], a = gateApproach(gates, p.nextGate);
  h.state.simTime += seconds;
  p.planeSample = { x: gate.x - a.nx * 10, z: gate.z - a.nz * 10 };
  p.planeSampleSimS = h.state.simTime - 0.1;
  h.player.pos.set(gate.x + a.nx * 10, 0, gate.z + a.nz * 10);
  h.player.vel.set(a.nx * 200, 0, a.nz * 200);
  h.drive(m);
}

test('thermal delivery loads real sealed packs, loses only spoiled units, then delivers survivors once', () => {
  const h = fixture(); try {
    assert.equal(addCargo(h.state, 'cmdty_medical', 3), 3);
    const m = h.accept();
    assert.equal(h.state.player.cargo.items.cmdty_medical, 11);
    assert.equal(sellableCargoQuantity(h.state, 'cmdty_medical'), 3);
    assert.equal(m.params.raceLease, false, 'ordinary approach remains ambient');
    crossPlayerGate(h, m);
    assert.equal(m.params.raceLease, true);
    h.player.flags.boosting = true;
    h.state.simTime += 14; h.drive(m);
    const spoiled = m.params.adventureSpeedState.spoiledUnits;
    assert.ok(spoiled > 0 && spoiled < 8);
    assert.equal(h.state.player.cargo.items.cmdty_medical, 11 - spoiled);
    assert.equal(m.params.sealedDelivered, 0, 'spoilage is not a delivered pack');
    assert.equal(h.delivered.length, 0);
    h.player.flags.boosting = false;
    // Physical cover cools the payload; it is not an abstract mission timer reset.
    h.sim.spawn({ type: 'asteroid', pos: { x: h.player.pos.x - 60, z: h.player.pos.z },
      radius: 40, mass: 1e6, hull: 100, collides: true });
    h.state.simTime += 4; h.drive(m);
    assert.ok(m.params.payloadTemperature < 75);
    assert.match(m.params.adventureSpeedHint, /COOLING/);
    while (m.status === 'active' && m.params.nextGate < m.params.gates.length) crossPlayerGate(h, m);
    assert.equal(m.status, 'completed'); assert.equal(m.params.raceLease, false);
    assert.equal(h.state.player.cargo.items.cmdty_medical, 3, 'personal supplies survive');
    assert.equal(h.delivered.length, 1);
    assert.equal(h.delivered[0].qty, 8 - m.params.adventureSpeedState.spoiledUnits);
    assert.equal(h.grants.length, 1); assert.ok(h.grants[0].amount > 0);
    h.host._completeMission(m, -1); assert.equal(h.grants.length, 1);
    assert.equal(h.state.missions.adventureSpeedCompleted.speed_helios_cold_chain, true);
  } finally { h.close(); }
});

test('thermal temperature is partition independent; shelter direction and solid eligibility are real', () => {
  function integrate(parts) {
    const p = adventureSpeedOfferFor('speed_helios_cold_chain').params; p.raceStartSimS = 100;
    let out = stepAdventureSpeed(p, { events: [gateEvent(0, 0)], simTime: 100,
      setPiece: { cargoUnits: 8, sheltered: false, burning: true } });
    Object.assign(p, out.patch);
    for (let i = 1; i <= parts; i++) {
      out = stepAdventureSpeed(p, { simTime: 100 + 20 * i / parts,
        setPiece: { cargoUnits: 8 - p.adventureSpeedState.spoiledUnits, sheltered: false, burning: true } });
      Object.assign(p, out.patch);
    }
    return p.adventureSpeedState;
  }
  const coarse = integrate(1), fixed = integrate(1200);
  assert.ok(Math.abs(coarse.quality - fixed.quality) < 1e-6);
  assert.equal(coarse.spoiledUnits, fixed.spoiledUnits);
  const h = fixture(); try {
    const c = h.offer.params.adventureSpeed.thermal;
    const rock = h.sim.spawn({ type: 'asteroid', pos: { x: 0, z: 0 }, radius: 40, hull: 100 });
    h.player.pos.set(60, 0, 0); assert.equal(thermalShelterFor(h.state, h.player, c).id, rock.id);
    h.player.pos.set(-60, 0, 0); assert.equal(thermalShelterFor(h.state, h.player, c), null);
    h.player.pos.set(60, 0, 60); assert.equal(thermalShelterFor(h.state, h.player, c), null);
    h.player.pos.set(60, 0, 0); rock.collides = false;
    assert.equal(thermalShelterFor(h.state, h.player, c), null);
  } finally { h.close(); }
});

test('thermal failure recalls only its own load and reload/retry cannot replenish a hot active load', () => {
  const h = fixture(); try {
    addCargo(h.state, 'cmdty_medical', 3); const m = h.accept(); crossPlayerGate(h, m);
    h.player.flags.boosting = true; h.state.simTime += 14; h.drive(m);
    const saved = clone(h.host.serialize()), pressure = clone(m.params.adventureSpeedState);
    h.host.deserialize(saved);
    const loaded = h.state.missions.active.find(row => row.id === m.id);
    assert.deepEqual(loaded.params.adventureSpeedState, pressure);
    const remaining = loaded.params.sealedRemaining;
    h.drive(loaded); assert.equal(loaded.params.sealedRemaining, remaining, 'same-tick reload never spoils twice');
    h.state.simTime += 30; h.drive(loaded);
    assert.equal(loaded.status, 'failed'); assert.equal(h.grants.length, 0);
    assert.equal(h.state.player.cargo.items.cmdty_medical, 3);
    const retry = h.accept(); assert.notEqual(retry.id, m.id);
    assert.equal(retry.params.adventureSpeedState, undefined);
    h.host.abandonMission(retry.id);
    assert.equal(h.state.player.cargo.items.cmdty_medical, 3);
  } finally { h.close(); }
});

test('rescue reducer denies detached or fast handoff and never accepts player-only gates', () => {
  const p = adventureSpeedOfferFor('speed_tethys_lifeline').params; p.raceStartSimS = 100;
  const all = p.gates.map((_, i) => gateEvent(i, i, i === p.gates.length - 1));
  const detached = stepAdventureSpeed(p, { events: all, simTime: 110,
    setPiece: { attached: false, towedWU: 200, podSpeed: 0, playerSpeed: 0 } });
  assert.equal(detached.outcome, 'active'); assert.equal(detached.patch.adventureSpeedState.lastGate, -1);
  const fast = stepAdventureSpeed(p, { events: all, simTime: 110,
    setPiece: { attached: true, towedWU: 200, podSpeed: 65.1, playerSpeed: 20 } });
  assert.equal(fast.reason, 'speed_handoff_too_fast');
  const finished = stepAdventureSpeed(p, { events: all, simTime: 110,
    setPiece: { attached: true, towedWU: 200, podSpeed: 65, playerSpeed: 65 } });
  assert.equal(finished.outcome, 'complete');
  assert.equal(finished.finishedEvent.elapsedS, p.gates.length - 1);
});

test('public Massline physically tows the rescue pod through the authored route and survives actor remapping', async () => {
  const h = fixture('speed_tethys_lifeline');
  const native = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: 1 / 60 });
  h.sim.helpers.combatPhysics = native;
  const tether = Object.create(tetherGameplay); tether.init(h.sim.registry.ctx);
  try {
    let m = h.accept(); h.drive(m);
    let pod = h.state.entities.get(m.params.rescueTargetId);
    assert.ok(pod); assert.equal(isAttachable(pod, h.player.id, h.state), true);
    assert.equal(pod.data.packagedPropFile, 'places/place_47a_rescue_capsule.glb');
    h.state.player.tether = { active: true, targetId: pod.id, attachmentId: 'fake' };
    crossPlayerGate(h, m);
    assert.equal(m.params.nextGate, 0, 'a player crossing plus a tether mirror does not move the pod');
    const gates = raceGateGlobals(m.params), a = gateApproach(gates, 0);
    h.player.pos.set(pod.pos.x + a.nx * 45, 0, pod.pos.z + a.nz * 45);
    h.player.vel.set(0, 0, 0);
    native.syncFromEntities(h.state.entityList);
    h.state.input.tetherMode = 'nearest'; h.state.input.actions = { tetherFire: true, tetherCut: false, reelDelta: 0 };
    const denied = []; h.sim.bus.on('tether:latchDenied', row => denied.push(row));
    tether.update(1 / 60, h.state); h.state.input.actions.tetherFire = false;
    const kernel = getCombatKernel(h.sim.registry.ctx);
    let line = kernel.attachments.listForEntity(pod.id).find(row => row.state === 'active');
    assert.ok(line, JSON.stringify(denied));
    assert.ok(native.getAttachmentTelemetry({ attachmentId: line.id, physicsHandle: line.physicsHandle }));
    let remapped = false;
    for (let tick = 0; tick < 18000 && m.status === 'active'; tick++) {
      const index = Math.min(m.params.nextGate, gates.length - 1), gate = gates[index], normal = gateApproach(gates, index);
      const dx = gate.x + normal.nx * 100 - h.player.pos.x, dz = gate.z + normal.nz * 100 - h.player.pos.z;
      const distance = Math.hypot(dx, dz), cruise = index >= gates.length - 2 ? 30 : 75;
      const wanted = Math.min(cruise, distance * 1.5), gain = 0.06;
      native.applyImpulse({ entityId: h.player.id, impulse: {
        x: ((distance ? dx / distance * wanted : 0) - h.player.vel.x) * h.player.mass * gain,
        z: ((distance ? dz / distance * wanted : 0) - h.player.vel.z) * h.player.mass * gain } });
      h.state.tick++; h.state.simTime += 1 / 60;
      native.step(1 / 60, h.state.tick); kernel.attachments.updateTelemetryAndBreak(); h.drive(m);
      if (!remapped && m.params.nextGate >= 2 && m.status === 'active') {
        assert.ok(m.params.rescueTowedWU >= 30, 'only measured loaded motion earns tow distance');
        const saver = Object.assign(Object.create(save), { state: h.state, bus: h.sim.bus,
          helpers: h.sim.helpers, registry: h.sim.registry });
        const snapshot = clone({ entities: saver._serializeEntities(), combat: serializeCombatState(h.state), missions: h.host.serialize() });
        assert.equal(snapshot.entities.persistent.filter(e => e.data?.speedRescueMissionId === m.id).length, 1);
        const oldId = pod.id, remap = new Map();
        h.sim.bus.emit('save:restoring');
        h.sim.helpers.removeEntity(oldId, { immediate: true });
        // Sector regeneration can occupy an old runtime id before persistent actors return.
        const occupant = h.sim.spawn({ id: oldId, type: 'fx', pos: { x: 0, z: 0 },
          physicsBody: false, collides: false });
        saver._spawnPersistentEntities(snapshot.entities.persistent, remap);
        h.host.deserialize(snapshot.missions); saver._restoreCombat(snapshot.combat, remap);
        native.syncFromEntities(h.state.entityList); kernel.attachments.reconcilePhysics();
        h.sim.bus.emit('save:loaded');
        m = h.state.missions.active.find(row => row.id === m.id); h.drive(m);
        pod = h.state.entities.get(m.params.rescueTargetId);
        assert.ok(pod); assert.notEqual(pod.id, oldId);
        assert.equal(h.state.entityList.filter(e => e.alive && e.data?.speedRescueMissionId === m.id).length, 1);
        line = kernel.attachments.listForEntity(pod.id).find(row => row.state === 'active');
        assert.ok(line, 'the saved native Massline rebinds to the restored pod');
        assert.ok(native.getAttachmentTelemetry({ attachmentId: line.id, physicsHandle: line.physicsHandle }));
        h.sim.helpers.removeEntity(occupant.id, { immediate: true });
        remapped = true;
      }
    }
    assert.equal(m.status, 'completed', JSON.stringify({ nextGate: m.params.nextGate,
      hint: m.params.adventureSpeedHint, pos: pod.pos, tow: m.params.rescueTowedWU }));
    assert.equal(remapped, true); assert.equal(h.grants.length, 1);
    assert.equal(h.state.entities.has(pod.id), false, 'handoff retires its actor');
    assert.equal(kernel.attachments.listForEntity(pod.id).some(row => row.state === 'active'), false);
    assert.equal(m.params.raceLease, false);
  } finally { native.dispose(); tether.destroy?.(); h.close(); }
});

test('rescue loss, abort and loaded missing pod never mint a replacement or pay a reward', () => {
  const h = fixture('speed_tethys_lifeline'); try {
    const m = h.accept(); h.drive(m); const pod = h.state.entities.get(m.params.rescueTargetId);
    assert.ok(pod); h.sim.helpers.removeEntity(pod.id, { immediate: true });
    h.host.deserialize(clone(h.host.serialize())); h.sim.bus.emit('save:loaded');
    const loaded = h.state.missions.active.find(row => row.id === m.id); h.drive(loaded);
    assert.equal(loaded.status, 'failed'); assert.equal(h.grants.length, 0);
    assert.equal(h.state.entityList.some(e => e.data?.speedRescueMissionId === m.id), false);
    const retry = h.accept(); h.drive(retry);
    const replacement = h.state.entities.get(retry.params.rescueTargetId); assert.ok(replacement);
    assert.notEqual(replacement.id, pod.id);
    h.host.abandonMission(retry.id);
    assert.equal(h.state.entities.has(replacement.id), false);
    assert.equal(h.grants.length, 0);
  } finally { h.close(); }
});

test('a listening Corsair detects real weapon reports, then production tactical AI drives and fires it', async () => {
  const h = fixture('speed_veil_listener', [aiPorts, createTacticalAISystem(), actions, flightV3, weapons]);
  const native = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: 1 / 60 });
  h.sim.helpers.combatPhysics = native;
  try {
    const m = h.accept(); crossPlayerGate(h, m); h.player.vel.set(0, 0, 0);
    const hunter = h.state.entities.get(m.params.listenerTargetId); assert.ok(hunter);
    assert.equal(hunter.data.lootTableId, 'corsair_raider');
    const heat = h.state.player.heat;
    native.syncFromEntities(h.state.entityList);
    h.state.physicsRuntime = { diagnostics: { backend: 'rapier-dynamic', sg02Ready: true } };
    const fire = []; h.sim.bus.on('combat:fire', row => fire.push(row));
    h.player.cap = h.player.capMax = 10000;
    h.state.input.actions = {}; h.state.input.aimAngle = 0; h.state.input.fire = false;
    function tick({ shooting = false, boosting = false, ai = true } = {}) {
      h.sim.registry.get('core').preStep(1 / 60, h.state);
      h.state.spatialHash.rebuild(h.state.entityList);
      h.state.input.fire = shooting; h.state.input.boost = boosting;
      if (ai) {
        h.sim.registry.get('tacticalAI').update(1 / 60, h.state);
        h.sim.registry.get('actions').update(1 / 60, h.state);
        h.sim.registry.get(flightV3.name).update(1 / 60, h.state);
        h.sim.registry.get('aiPorts').update(1 / 60, h.state);
      }
      h.sim.registry.get('weapons').update(1 / 60, h.state);
      if (ai) {
        native.step(1 / 60, h.state.tick);
      }
      h.drive(m);
    }
    for (let i = 0; i < 120; i++) tick();
    assert.equal(m.params.listenerState.exposure, 0);
    assert.equal(hunter.data.ai.passive, true);
    assert.equal(fire.some(row => row.ownerId === hunter.id), false);
    const quietPos = { x: hunter.pos.x, z: hunter.pos.z };
    for (let i = 0; i < 360 && !m.params.listenerState.detected; i++) tick({ shooting: true });
    assert.ok(fire.some(row => row.ownerId === h.player.id), 'weapon owner admitted actual shots');
    assert.equal(m.params.listenerState.detected, true, JSON.stringify({ listener: m.params.listenerState,
      nextGate: m.params.nextGate, status: m.status, player: h.player.pos, hunter: hunter.pos, shots: fire.length }));
    assert.equal(hunter.data.ai.passive, false); assert.equal(hunter.data.ai.roe, 'weapons_free');
    for (let i = 0; i < 600 && !fire.some(row => row.ownerId === hunter.id); i++) tick({ shooting: true });
    assert.equal(hunter.data.combat.targetId, h.player.id, JSON.stringify({ label: 'tactical AI selected the pilot',
      ai: hunter.data.ai, combat: hunter.data.combat, intent: hunter.data.intent, listener: m.params.listenerState,
      pos: hunter.pos, player: h.player.pos, shots: fire.filter(row => row.ownerId === hunter.id) }));
    assert.ok(Math.hypot(hunter.pos.x - quietPos.x, hunter.pos.z - quietPos.z) > 10, 'native flight moved the hunter');
    assert.ok(fire.some(row => row.ownerId === hunter.id), 'existing combat weapon owner fired the hunter');
    assert.equal(h.state.player.heat, heat, 'engine noise never invents a crime');
    // A quiet detour must actually create separation before the search can lapse.
    h.player.pos.set(hunter.pos.x + 1000, 0, hunter.pos.z); h.player.vel.set(0, 0, 0);
    for (let i = 0; i < 600; i++) tick({ ai: false });
    assert.equal(m.params.listenerState.detected, false); assert.equal(hunter.data.ai.passive, true);
    assert.equal(hunter.data.intent.moveZ, 0); assert.equal(hunter.data.intent.moveX, 0);
    assert.equal(hunter.data.intent.fire, false);
    assert.match(m.params.adventureSpeedHint, /LISTENER 0%/);
    h.host.abandonMission(m.id); assert.equal(h.state.entities.has(hunter.id), false);
    assert.equal(h.grants.length, 0);
  } finally { native.dispose(); h.close(); }
});

test('listener exposure persists, a killed hunter stays cleared, and final transfer still pays once', () => {
  const h = fixture('speed_veil_listener'); try {
    let m = h.accept(); crossPlayerGate(h, m); const hunter = h.state.entities.get(m.params.listenerTargetId);
    h.player.flags.boosting = true;
    for (let i = 0; i < 6; i++) { h.state.simTime += 1; h.drive(m); }
    assert.equal(m.params.listenerState.detected, true);
    const before = clone(m.params.listenerState); h.host.deserialize(clone(h.host.serialize()));
    h.sim.bus.emit('save:loaded'); m = h.state.missions.active.find(row => row.id === m.id); h.drive(m);
    assert.deepEqual(m.params.listenerState, before);
    assert.equal(h.state.entityList.filter(e => e.data?.speedHunterMissionId === m.id).length, 1);
    hunter.hull = 0; h.sim.bus.emit('entity:killed', { targetId: hunter.id });
    h.sim.helpers.removeEntity(hunter.id, { immediate: true }); h.drive(m);
    assert.equal(m.params.listenerCleared, true); assert.match(m.params.adventureSpeedHint, /HUNTER DISABLED/);
    h.host.deserialize(clone(h.host.serialize())); h.sim.bus.emit('save:loaded');
    m = h.state.missions.active.find(row => row.id === m.id); h.player.flags.boosting = false;
    while (m.params.nextGate < m.params.gates.length - 1) crossPlayerGate(h, m);
    const p = m.params, gates = raceGateGlobals(p), gate = gates.at(-1), normal = gateApproach(gates, gates.length - 1);
    h.state.simTime += 1; p.planeSample = { x: gate.x - normal.nx * 10, z: gate.z - normal.nz * 10 };
    p.planeSampleSimS = h.state.simTime - 0.1; h.player.pos.set(gate.x + normal.nx * 10, 0, gate.z + normal.nz * 10);
    h.player.vel.set(normal.nx * 100, 0, normal.nz * 100); h.drive(m);
    assert.equal(m.status, 'completed'); assert.equal(h.grants.length, 1);
    assert.equal(h.state.entityList.some(e => e.data?.speedHunterMissionId === m.id), false);
    assert.equal(h.state.missions.adventureSpeedCompleted.speed_veil_listener, true);
  } finally { h.close(); }
});
