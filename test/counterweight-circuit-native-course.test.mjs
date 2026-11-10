import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createSimulation } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { writePhysicsControl } from '../src/core/physicsAuthority.js';
import { ships, makeShipEntitySpec } from '../src/systems/ships.js';
import { combat } from '../src/systems/combat.js';
import { collisionConsequences } from '../src/systems/collisionConsequences.js';
import { economy } from '../src/systems/economy.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';
import { lineProgression } from '../src/systems/lineProgression.js';
import { world } from '../src/systems/world.js';
import { getCombatKernel } from '../src/combat/kernel.js';
import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';
import { snapshotFeatureMaps, applyFeatureConfigToMaps, restoreFeatureMaps } from '../src/data/featureFlags.js';
import { createCounterweightCircuitSystem } from '../src/features/counterweightCircuit/runtime.js';
import { venueGlobalPos } from '../src/features/counterweightCircuit/physical.js';
import { receiverFootprint, receiverContainsFootprint, cradleFit } from '../src/features/counterweightCircuit/course.js';
import { VENUE_SECTOR_ID } from '../src/features/counterweightCircuit/definition.js';
import { freshEventRecord } from '../src/features/counterweightCircuit/scoring.js';

const DT = 1 / 60;
const ARTIFACTS = new URL('../.devshots/finish/integration-2026-11-04/circuit-final-feasibility/', import.meta.url);
let flags;
test.before(() => {
  mkdirSync(ARTIFACTS, { recursive: true });
  flags = snapshotFeatureMaps(); applyFeatureConfigToMaps(PRODUCTION_FEATURES);
});
test.after(() => restoreFeatureMaps(flags));
const point = b => ({ x: b.pos.x, z: b.pos.z, vx: b.vel.x, vz: b.vel.z, rot: b.rot, spin: b.angVel, hull: b.hull });
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// Only initial spawn sets a pose. Every subsequent pilot movement is a bounded
// force/torque request; only tetherGameplay creates, reels and cuts our Line.
async function fixture(eventId, playerLocal = { x: 225, z: 0 }) {
  const sim = createSimulation({ seed: 8206, systems: [ships, economy, physics, combat, collisionConsequences,
    tetherGameplay, lineProgression, createCounterweightCircuitSystem()] });
  const s = sim.state;
  s.mode = 'flight'; s.world.currentSectorId = VENUE_SECTOR_ID; s.ui.docked = false;
  s.input.actions ||= {}; s.settings.gameplay.physicsBackend = 'rapier-dynamic';
  sim.registry.get('ships').newGame();
  const owned = s.player.ownedShips[s.player.activeShipIndex || 0];
  const p = sim.spawn(makeShipEntitySpec(owned.defId, { isPlayer: true, player: s.player,
    pos: venueGlobalPos(playerLocal), fittings: owned.fittings }));
  s.playerId = p.id;
  const native = sim.registry.get('physics'), owner = sim.registry.get('counterweightCircuit');
  const kernel = getCombatKernel(owner.ctx);
  const frameOwner = { bus: sim.bus };
  const events = [], samples = [], lineage = [];
  for (const name of ['tether:latched', 'tether:broken', 'tether:latchDenied', 'combat:damage', 'economy:creditsGranted'])
    sim.bus.on(name, e => events.push({ at: s.simTime, name, ...e }));
  world._tickFrameOrigin.call(frameOwner, s);
  await native.prepareBackend(s);
  let latest, attempt, priorLeg = -1, priorStable = '';
  const physical = owner._physical(), observe = physical.observe;
  physical.observe = (...args) => { latest = observe(...args); return latest; };
  function tick(control) {
    s.tick++; s.simTime = s.tick * DT;
    control?.();
    world._tickFrameOrigin.call(frameOwner, s);
    native.update(DT, s);
    for (const id of ['combat', 'collisionConsequences', 'tetherGameplay', 'lineProgression', 'counterweightCircuit'])
      sim.registry.get(id).update(DT, s);
    if (attempt) {
      const stable = Object.entries(latest?.receivers || {}).filter(([, r]) => r.stable).map(([k]) => k).join(',');
      if (s.tick % 120 === 0 || priorLeg !== attempt.fsm.legIndex || priorStable !== stable) {
        samples.push({ at: s.simTime, leg: attempt.fsm.legIndex, pilot: point(p),
          bodies: Object.fromEntries([...bodies].map(([k, b]) => [k, point(b)])),
          lines: latest?.lines, receivers: latest?.receivers, mem: structuredClone(attempt.fsm.mem),
          ...(priorLeg !== attempt.fsm.legIndex ? { observation: structuredClone(latest) } : {}) });
      }
      priorLeg = attempt.fsm.legIndex; priorStable = stable;
    }
  }
  tick(); tick(); tick();
  const row = s.world.counterweightCircuit;
  for (const id of ['soft_berth', 'long_arm', 'clean_sling', 'fragile_freight', 'split_decision'])
    if (id !== eventId) row.records[id] = { ...freshEventRecord(), completions: 1 };
  assert.equal(owner._startAttempt(eventId, false), true);
  attempt = owner._attempt();
  const bodies = new Map(attempt.cohort), creditsBefore = s.player.credits;
  tick(); tick(); tick();
  const originals = [...bodies].map(([role, b]) => ({ role, id: b.id, generation: b.occupantGeneration,
    record: b.data.worldRecordId, mass: native._sg02.records.get(b.id)?.body.mass() }));
  const admission = s.counterweightCircuitView.admission;
  sim.bus.emit('counterweightCircuit:presentationReady', { attemptId: attempt.attemptId,
    generation: admission.generation, bodies: admission.bodies.map(({ id, generation }) => ({ id, generation })) });
  tick(); assert.equal(attempt.admissionPending, false);
  function pilot(goal, { speed = 7, accel = 5, goalVel = { x: 0, z: 0 } } = {}) {
    const model = p.data.derived.flightModel;
    assert.ok(accel <= Math.min(model.mainAccel, model.reverseAccel, model.strafeAccel), 'pilot force stays within the fitted drive');
    assert.ok(2 <= model.angularAccel, 'pilot torque stays within the fitted drive');
    const dx = goal.x - p.pos.x, dz = goal.z - p.pos.z, d = Math.hypot(dx, dz);
    const desired = Math.min(speed, d * 1.2, Math.sqrt(2 * accel * d));
    const ax = (dx / Math.max(d, .001) * desired + goalVel.x - p.vel.x) * 2;
    const az = (dz / Math.max(d, .001) * desired + goalVel.z - p.vel.z) * 2;
    const scale = Math.min(1, accel / Math.max(.001, Math.hypot(ax, az)));
    const inertia = p.physicsBody?.inertiaY || p.mass;
    writePhysicsControl(p, { source: 'circuit-native-pilot', force: { x: ax * scale * p.mass, y: 0, z: az * scale * p.mass },
      torque: { x: 0, y: Math.max(-2, Math.min(2, -p.rot * 4 - p.angVel * 4)) * inertia, z: 0 },
      maxSpeed: speed + Math.hypot(goalVel.x, goalVel.z) });
  }
  function latch(body) {
    s.player.targetId = body.id;
    s.input.aimWorld = { x: body.pos.x, z: body.pos.z }; s.input.aimIntentActive = true;
    s.input.actions.tetherFire = true; tick(); s.input.actions.tetherFire = false;
    const line = kernel.attachments.listForEntity(body.id).find(l => l.state === 'active' && l.ownerId === p.id);
    assert.ok(line, `actual latch failed: ${JSON.stringify(events.slice(-4))}`);
    lineage.push({ at: s.simTime, id: line.id, defId: line.defId, ownerId: line.ownerId,
      ownerGeneration: line.ownerGeneration, targetId: line.targetId, targetGeneration: line.targetGeneration,
      restLength: line.restLength });
    return line;
  }
  function cut() {
    events.push({ at: s.simTime, name: 'probe:cutIntent', pilot: point(p),
      loads: Object.fromEntries([...bodies].filter(([, b]) => b.physicsBody.dynamic).map(([k, b]) => [k, point(b)])) });
    s.input.actions.reelDelta = 0; s.input.actions.massline = { cut: true }; tick(); s.input.actions.massline = null;
  }
  function navigate(goal, speed = 18, seconds = 30) {
    for (let i = 0; i < seconds / DT && distance(p.pos, goal) > 2 && owner._attempt(); i++)
      tick(() => pilot(goal, { speed }));
    assert.ok(distance(p.pos, goal) <= 2, `pilot navigation obstructed: ${JSON.stringify({ pilot: point(p), goal })}`);
  }
  function report(extra = {}) {
    const result = { eventId, backend: s.settings.gameplay.physicsBackend, shift: attempt.shift,
      frameOrigin: { ...s.world.frameOrigin }, frameOriginSeq: s.world.frameOriginSeq,
      fit: owned.fittings, pilotMass: p.mass, originals, phase: attempt.fsm.phase, leg: attempt.fsm.legIndex,
      fsm: attempt.fsm, result: row.lastResult, record: row.records[eventId], creditsBefore, creditsAfter: s.player.credits,
      final: Object.fromEntries([...bodies].map(([k, b]) => [k, { ...point(b), footprint: b.data.counterweightRole?.startsWith('load')
        ? receiverFootprint(b, bodies.get(eventId === 'split_decision' ? (k === 'load_a' ? 'shelf_a' : 'shelf_b') : eventId === 'moving_berth' ? 'barge' : 'cradle')) : undefined }])),
      nativeBodies: Object.fromEntries([...bodies].map(([k, b]) => {
        const body = native._sg02.records.get(b.id)?.body;
        return [k, body ? { position: body.translation(), velocity: body.linvel(), spin: body.angvel(), sleeping: body.isSleeping() } : null];
      })),
      latest, events, lineage, samples, ...extra };
    writeFileSync(new URL(`${eventId}.json`, ARTIFACTS), JSON.stringify(result, null, 2));
    return result;
  }
  return { sim, s, p, owner, native, kernel, row, attempt, bodies, tick, pilot, latch, cut, navigate, report,
    latest: () => latest, live: () => owner._attempt() === attempt };
}

function completedOriginals(f, result, reward) {
  assert.equal(result.phase, 'complete');
  assert.equal(result.record.completions, 1);
  assert.equal(result.record.paid, true);
  assert.equal(result.creditsAfter - result.creditsBefore, reward);
  assert.equal(result.result.timeS, result.fsm.finishedAt - result.fsm.armedAt);
  assert.ok(result.result.arrivalSpeed <= 4);
  for (const def of f.attempt.def.bodies.filter(b => b.kind === 'load')) {
    const body = f.bodies.get(def.role), original = result.originals.find(b => b.role === def.role);
    const observation = result.latest.bodies[def.role];
    assert.equal(observation.id, original.id);
    assert.equal(observation.occupantGeneration, original.generation);
    assert.equal(body.data.worldRecordId, original.record);
    assert.equal(original.mass, 18);
    assert.equal(body.hull, body.hullMax, 'canonical collision condition stays intact');
    assert.ok(result.lineage.some(l => l.targetId === original.id && l.targetGeneration === original.generation));
  }
}

test('Split Decision original native loads: pilot-only two-load parking', async () => {
  const f = await fixture('split_decision');
  const load = f.bodies.get('load_a'), shelf = f.bodies.get('shelf_a');
  // Clear the venue derrick and both waiting originals before lining either.
  f.navigate(venueGlobalPos({ x: 330, z: 0 }));
  f.navigate({ x: load.pos.x + 100, z: load.pos.z });
  f.navigate({ x: load.pos.x + 80, z: load.pos.z + 80 * (shelf.pos.z - load.pos.z) / (shelf.pos.x - load.pos.x) });
  f.latch(load);
  let cut = false, dwell = 0;
  for (let i = 0; i < 5400 && f.live(); i++) {
    f.tick(() => f.pilot({ x: shelf.pos.x + (cut ? -15 : 6), z: shelf.pos.z + (cut ? -60 : 0) }, { speed: 6 }));
    if (!cut && load.pos.x > shelf.pos.x - 70 && load.vel.x > 1) { f.cut(); cut = true; }
    dwell = f.latest()?.receivers['load_a:shelf_a']?.stable ? dwell + DT : 0;
    if (cut && dwell >= 1.5) break;
  }
  if (dwell < 1.5) {
    const result = f.report({ cut, dwell });
    assert.fail(JSON.stringify({ cut, dwell, final: result.final, latest: result.latest?.receivers }));
  }
  const second = f.bodies.get('load_b'), secondShelf = f.bodies.get('shelf_b');
  f.navigate({ x: second.pos.x + 60, z: shelf.pos.z - 60 });
  f.navigate({ x: second.pos.x + 80, z: second.pos.z + 80 * (secondShelf.pos.z - second.pos.z) / (secondShelf.pos.x - second.pos.x) });
  f.latch(second);
  let secondCut = false;
  for (let i = 0; i < 5400 && f.live(); i++) {
    f.tick(() => f.pilot({ x: secondShelf.pos.x + (secondCut ? -15 : 6), z: secondShelf.pos.z + (secondCut ? -60 : 0) }, { speed: 6 }));
    if (!secondCut && second.pos.x > secondShelf.pos.x - 70 && second.vel.x > 1) { f.cut(); secondCut = true; }
  }
  const result = f.report({ cut, dwell, secondCut });
  assert.equal(result.phase, 'complete', JSON.stringify({ cut, dwell, secondCut, final: result.final, latest: result.latest?.receivers }));
  completedOriginals(f, result, 60);
  assert.equal(result.fsm.mem.attachSeen.load_a, true);
  assert.equal(result.fsm.mem.attachSeen.load_b, true);
  assert.ok(result.fsm.mem.dwellS.parkAll >= 1.2);
  assert.equal(result.latest.receivers['load_a:shelf_a'].supportContact, true);
  assert.equal(result.latest.receivers['load_b:shelf_b'].supportContact, true);
});

test('Moving Berth original native load: pilot-only relative-speed delivery', async () => {
  const f = await fixture('moving_berth');
  const load = f.bodies.get('load'), barge = f.bodies.get('barge');
  const waypoint = f.attempt.def.bodies.find(b => b.role === 'barge').itinerary.waypoints[2];
  const intercept = venueGlobalPos({ x: waypoint.x + f.attempt.shift.x, z: waypoint.z + f.attempt.shift.z });
  const dx = intercept.x - load.pos.x, dz = intercept.z - load.pos.z, d = Math.hypot(dx, dz);
  const pickup = { x: load.pos.x + 80 * dx / d, z: load.pos.z + 80 * dz / d };
  f.navigate({ x: load.pos.x - 70, z: load.pos.z - 65 }, 26);
  f.navigate({ x: pickup.x, z: load.pos.z - 65 }, 26);
  f.navigate(pickup, 26);
  f.latch(load);
  let cut = false;
  for (let i = 0; i < 6000 && f.live(); i++) {
    f.tick(() => f.pilot({ x: intercept.x + (cut ? -20 : 6), z: intercept.z + (cut ? 90 : 0) }, { speed: 11 }));
    if (!cut && load.pos.x > intercept.x - 70 && load.vel.x > 1) {
      f.cut(); cut = true;
    }
  }
  const result = f.report({ cut });
  assert.equal(result.phase, 'complete', JSON.stringify({ cut, final: result.final, latest: result.latest?.receivers }));
  completedOriginals(f, result, 60);
  assert.ok(result.fsm.mem.dwellS['load:barge'] >= 1.5);
  assert.equal(result.latest.receivers['load:barge'].supportContact, true);
  assert.ok(Math.hypot(load.vel.x, load.vel.z) > 4 && Math.hypot(barge.vel.x, barge.vel.z) > 4,
    'the seated originals remain in native motion while relative speed is low');
});

test('Finale original native load: same-Line swing, release gate, reacquire and soft berth', async () => {
  const f = await fixture('counterweight_finale', { x: 220, z: 0 });
  const load = f.bodies.get('load'), anchor = f.bodies.get('counterweight'), cradle = f.bodies.get('cradle');
  const gate = f.attempt.def.gate.absPos;
  const firstLine = f.latch(load);
  let waypoint = 1, cut = false, reacquired = false, reposition = true;
  for (let i = 0; i < 14400 && f.live(); i++) {
    const leg = f.attempt.fsm.legIndex;
    if (leg < 2) {
      const theta = Math.PI + waypoint * .35;
      const goal = { x: anchor.pos.x + 200 * Math.cos(theta), z: anchor.pos.z + 200 * Math.sin(theta) };
      if (distance(f.p.pos, goal) < 22) waypoint++;
      f.tick(() => f.pilot(goal, { speed: 26, accel: 8 }));
      continue;
    }
    if (leg === 2) {
      if (load.pos.x < gate.x - 55) reposition = false;
      else if (load.pos.x > gate.x + 10) reposition = true;
      f.s.input.actions.reelDelta = 0;
      f.tick(() => f.pilot(reposition ? { x: gate.x - 100, z: gate.z + 50 } : { x: gate.x + 65, z: gate.z + 50 },
        { speed: 7, accel: 5 }));
      const crossingS = (gate.x - load.pos.x) / load.vel.x;
      const crossingZ = load.pos.z + load.vel.z * crossingS;
      const berthProjection = load.pos.z + load.vel.z * (cradle.pos.x - load.pos.x) / load.vel.x;
      if (!cut && load.pos.x < gate.x && load.pos.x > gate.x - 50 && Math.abs(crossingZ - gate.z) < 20
        && Math.abs(berthProjection - cradle.pos.z) < 10 && Math.abs(load.vel.z) < .3
        && crossingS > 0 && crossingS < 5 && load.vel.x > 2) {
        f.cut(); cut = true;
      }
      continue;
    }
    if (leg === 3) {
      f.tick(() => f.pilot({ x: load.pos.x - 80, z: load.pos.z }, { speed: 20, goalVel: load.vel }));
      continue;
    }
    if (leg === 4 && !reacquired) {
      if (distance(f.p.pos, { x: load.pos.x - 80, z: load.pos.z }) > 4) {
        f.tick(() => f.pilot({ x: load.pos.x - 80, z: load.pos.z }, { speed: 20, goalVel: load.vel }));
        continue;
      }
      const nextLine = f.latch(load); assert.notEqual(nextLine.id, firstLine.id);
      reacquired = true; f.s.input.actions.reelDelta = 0;
      continue;
    }
    // Keep the reacquired Line: its rearward component brakes the payload,
    // while native rail contact (never the pilot's arrival) establishes seating.
    f.tick(() => f.pilot({ x: cradle.pos.x + 6, z: cradle.pos.z }, { speed: 6 }));
  }
  const result = f.report({ firstLine: firstLine.id, cut, reacquired });
  assert.equal(result.phase, 'complete', JSON.stringify({ cut, reacquired, leg: result.leg, final: result.final, latest: result.latest?.receivers }));
  completedOriginals(f, result, 150);
  assert.equal(result.fsm.mem.swingLine.load, firstLine.id);
  assert.ok(result.fsm.mem.sweepRad.load >= 1.75);
  assert.ok(result.fsm.mem.dwellS['load:cradle'] >= 1.2);
  const support = result.latest.receivers['load:cradle'];
  assert.equal(support.supportWitness, true);
  assert.ok(result.samples.some(s => s.receivers?.['load:cradle']?.supportContact), 'an actual native back contact precedes the dwell');
  assert.ok(support.supportContact || support.supportGapWu <= .15 && support.supportContactAgeS <= 1.5,
    'only the existing tiny native settling gap may bridge the last contact');
  assert.equal(result.lineage.length, 2);
  const crossing = result.samples.find(s => s.leg === 4).observation.bodies.load;
  assert.ok(crossing.prevPos.x < gate.x && crossing.pos.x >= gate.x, 'the original crosses the native gate after its cut');
  const swing = result.samples.find(s => s.leg === 2);
  assert.ok(swing.lines.some(l => l.id === firstLine.id && l.taut), 'the measured sweep ends on the same taut Line');
});

test('receiver pocket containment keeps the real keeper and mouth boundaries', () => {
  const bounds = cradleFit(32), [lo] = bounds.keeperRanges[0];
  // A corner past the keeper's side may occupy the real deeper pocket. The
  // sloped edge reaches the keeper band exactly at its front face.
  const polygon = [
    { x: lo - 1, z: bounds.backZ - 1 }, { x: lo + 1, z: bounds.backZ - 1 },
    { x: lo - 1, z: bounds.backZ + 1 },
  ];
  const footprint = { minX: lo - 1, maxX: lo + 1, minZ: bounds.backZ - 1,
    maxZ: bounds.backZ + 1, polygon };
  assert.equal(receiverContainsFootprint(bounds, footprint), true);
  assert.equal(receiverContainsFootprint(bounds, { ...footprint, polygon: polygon.map(p => ({ x: p.x + 1, z: p.z })) }), false,
    'the same corner inside the keeper band intersects its solid face');
  assert.equal(receiverContainsFootprint(bounds, { ...footprint, minZ: bounds.mouthZ - 1 }), false,
    'partial mouth entry is not full containment');
  assert.equal(receiverContainsFootprint(bounds, { ...footprint, maxZ: bounds.spineZ + 1 }), false,
    'the outer pocket still ends at the real rear spine');
});
