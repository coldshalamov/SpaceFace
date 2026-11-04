import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { queuePhysicsImpulse, writePhysicsControl } from '../src/core/physicsAuthority.js';
import { ships, makeShipEntitySpec } from '../src/systems/ships.js';
import { combat } from '../src/systems/combat.js';
import { collisionConsequences } from '../src/systems/collisionConsequences.js';
import { economy } from '../src/systems/economy.js';
import { save } from '../src/save/saveSystem.js';
import { scanner } from '../src/systems/scanner.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';
import { getCombatKernel } from '../src/combat/kernel.js';
import { serializeCombatState, restoreCombatState } from '../src/combat/persistence.js';
import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';
import { snapshotFeatureMaps, applyFeatureConfigToMaps, restoreFeatureMaps } from '../src/data/featureFlags.js';
import { createCounterweightCircuitSystem } from '../src/features/counterweightCircuit/runtime.js';
import { venueAnchorGlobal, venueGlobalPos } from '../src/features/counterweightCircuit/physical.js';
import { COUNTERWEIGHT_EVENT_BY_ID, VENUE_SECTOR_ID } from '../src/features/counterweightCircuit/definition.js';
import { ghostPoseAt } from '../src/features/counterweightCircuit/ghost.js';
import { freshEventRecord } from '../src/features/counterweightCircuit/scoring.js';

let previousFlags;
test.before(() => { previousFlags = snapshotFeatureMaps(); applyFeatureConfigToMaps(PRODUCTION_FEATURES); });
test.after(() => restoreFeatureMaps(previousFlags));

const DT = 1 / 60;
const okay = (r) => assert.equal(r?.ok, true, r?.reason || JSON.stringify(r));

async function fixture({ seed = 8206, playerX = 40, withSave = false } = {}) {
  const circuit = createCounterweightCircuitSystem();
  const sim = createSimulation({
    seed,
    systems: [ships, economy, physics, combat, collisionConsequences, scanner, tetherGameplay, ...(withSave ? [save] : []), circuit],
  });
  const s = sim.state;
  s.mode = 'flight';
  s.world.currentSectorId = VENUE_SECTOR_ID;
  s.input.actions ||= {};
  s.settings.gameplay.physicsBackend = 'rapier-dynamic';
  s.ui.docked = false;
  const anchor = venueAnchorGlobal();
  sim.registry.get('ships').newGame();
  const player = sim.spawn(makeShipEntitySpec('ship_kestrel', {
    isPlayer: true, player: s.player,
    pos: { x: anchor.x + playerX, z: anchor.z }, fittings: [],
  }));
  s.playerId = player.id;
  const owner = sim.registry.get('counterweightCircuit');
  const native = sim.registry.get('physics');
  const kernel = getCombatKernel(owner.ctx);
  const offers = [];
  sim.bus.on('counterweightCircuit:offer', (o) => offers.push(o));
  function tick(count = 1, control = null) {
    for (let i = 0; i < count; i++) {
      s.tick++; s.simTime = s.tick * DT;
      if (control) control();
      native.update(DT, s);
      sim.registry.get('combat').update(DT, s);
      sim.registry.get('collisionConsequences').update(DT, s);
      sim.registry.get('tetherGameplay').update(DT, s);
      owner.update(DT, s);
    }
  }
  await native.prepareBackend(s);
  native.update(DT, s);
  tick(3);
  const row = () => s.world.counterweightCircuit;
  const attach = (entity) => {
    const r = kernel.attachments.create({
      defId: 'tether_standard', ownerId: player.id, targetId: entity.id,
      sourceWorld: { ...player.pos }, targetWorld: { ...entity.pos },
    });
    okay(r);
    return r.attachment;
  };
  const near = (entity, dx = 30, dz = 0) => {
    player.pos.set(entity.pos.x + dx, 0, entity.pos.z + dz);
    player.vel.set(0, 0, 0);
    native.update(DT, s);
  };
  const acceptPresentation = () => {
    const attempt = owner._attempt(), admission = s.counterweightCircuitView.admission;
    tick(3);
    sim.bus.emit('counterweightCircuit:presentationReady', { attemptId: attempt.attemptId,
      generation: admission.generation, bodies: admission.bodies.map(({ id, generation }) => ({ id, generation })) });
    tick(1);
    assert.equal(attempt.admissionPending, false, 'fixture supplies a presentation receipt after native admission');
  };
  return { sim, s, owner, native, kernel, player, tick, row, attach, near, offers, anchor, acceptPresentation };
}

function drivePilot(body, goal, { speed = 7, accel = 5 } = {}) {
  const dx = goal.x - body.pos.x, dz = goal.z - body.pos.z, distance = Math.hypot(dx, dz);
  const desired = Math.min(speed, distance * 1.2, Math.sqrt(2 * accel * distance));
  const ax = (dx / Math.max(distance, .001) * desired - body.vel.x) * 2;
  const az = (dz / Math.max(distance, .001) * desired - body.vel.z) * 2;
  const scale = Math.min(1, accel / Math.max(.001, Math.hypot(ax, az)));
  writePhysicsControl(body, { source: 'counterweight-integrated-test',
    force: { x: ax * scale * body.mass, y: 0, z: az * scale * body.mass },
    torque: { x: 0, y: -body.angVel * (body.physicsBody?.inertiaY || body.mass) * 4, z: 0 }, maxSpeed: speed });
}

test('native pilot-only Soft Berth settles the accepted award and selected PB', async () => {
  const { s, owner, player, tick, row, attach, kernel, acceptPresentation } = await fixture({ playerX: 235 });
  row().settings.ghostEnabled = true;
  const before = s.player.credits;
  assert.equal(owner._startAttempt('soft_berth', false), true);
  acceptPresentation();
  const attempt = owner._attempt(), load = attempt.cohort.get('load'), cradle = attempt.cohort.get('cradle');
  const identity = { id: load.id, generation: load.occupantGeneration, record: load.data.worldRecordId };
  const line = attach(load), physical = owner._physical(), observe = physical.observe;
  let cut = false, taut = false;
  physical.observe = (...args) => { const obs = observe(...args); taut ||= obs.lines.some(l => l.id === line.id && l.taut); return obs; };
  for (let i = 0; i < 5200 && owner._attempt(); i++) {
    tick(1, () => drivePilot(player, { x: cradle.pos.x + 6, z: cradle.pos.z + (cut ? -16 : 0) }));
    if (!cut && load.pos.x > cradle.pos.x - 38 && load.vel.x > 1 && load.vel.x <= 4) {
      assert.equal(kernel.attachments.cut(line.id, player.id, 'tether_cut').ok, true); cut = true;
    }
  }
  physical.observe = observe;
  assert.equal(taut, true, 'the native rope actually carried tension');
  assert.equal(cut, true, 'the original line received an accepted player cut');
  assert.deepEqual({ id: load.id, generation: load.occupantGeneration, record: load.data.worldRecordId }, identity);
  assert.equal(owner._attempt(), null, 'the observed receiver completed the owner FSM');
  assert.equal(row().lastResult.outcome, 'complete');
  assert.equal(row().lastResult.rewardCr, COUNTERWEIGHT_EVENT_BY_ID.soft_berth.rewardCr);
  assert.equal(s.player.credits, before + row().lastResult.rewardCr);
  assert.equal(row().records.soft_berth.paid, true);
  assert.ok(row().ghost.soft_berth?.samples?.length >= 8, 'the actual ranked PB retains a relative ghost');
  assert.equal(row().ghost.soft_berth.samples[0], 0);
  assert.ok(ghostPoseAt(row().ghost.soft_berth, row().ghost.soft_berth.durationS / 2), 'the selected PB has a playable relative pose');
  const next = await fixture({ seed: 8207 });
  next.row().settings.ghostEnabled = true;
  next.row().ghost.soft_berth = structuredClone(row().ghost.soft_berth);
  assert.equal(next.owner._startAttempt('soft_berth', true), true);
  next.acceptPresentation();
  assert.equal(next.s.counterweightCircuitGhost?.eventId, 'soft_berth');
  assert.equal(next.s.counterweightCircuitGhost?.tape.samples[0], 0);
  next.owner._cancelAttempt('cancelled');
});

test('native taut orbit and player cut advance the real Long Arm owner FSM', async () => {
  const { owner, player, tick, attach, kernel, acceptPresentation } = await fixture({ playerX: 220 });
  assert.equal(owner._startAttempt('long_arm', true), true);
  acceptPresentation();
  const attempt = owner._attempt(), load = attempt.cohort.get('load'), counterweight = attempt.cohort.get('counterweight');
  const line = attach(load); let waypoint = 1, loadedFrames = 0;
  const physical = owner._physical(), observe = physical.observe;
  physical.observe = (...args) => { const obs = observe(...args); if (obs.lines.some(l => l.id === line.id && l.taut)) loadedFrames++; return obs; };
  try {
    for (let i = 0; i < 2400 && owner._attempt() && attempt.fsm.legIndex < 2; i++) {
      const theta = Math.PI + waypoint * .35;
      const goal = { x: counterweight.pos.x + 200 * Math.cos(theta), z: counterweight.pos.z + 200 * Math.sin(theta) };
      if (Math.hypot(player.pos.x - goal.x, player.pos.z - goal.z) < 22) waypoint++;
      tick(1, () => drivePilot(player, goal, { speed: 26, accel: 8 }));
    }
    assert.ok(loadedFrames > 0, 'actual native tension entered the owner observation');
    assert.equal(attempt.fsm.legIndex, 2, `same-line native swing: ${JSON.stringify(attempt.fsm.mem.sweepRad)}`);
    assert.equal(kernel.attachments.cut(line.id, player.id, 'tether_cut').ok, true);
    tick(1);
    assert.equal(attempt.fsm.legIndex, 3, 'canonical player cut advances to the gate');
  } finally { physical.observe = observe; owner._cancelAttempt('cancelled'); }
});

test('venue materializes once with durable identities and the registrar offers', async () => {
  const { s, owner, player, tick, row, anchor } = await fixture();
  tick(30);
  assert.equal(row().venueSpawned, true);
  const fixtures = s.entityList.filter((e) => e.data?.persistenceOwner === 'counterweightCircuit' && e.data.counterweightVenue);
  assert.ok(fixtures.length >= 8, `venue fixtures materialized (${fixtures.length})`);
  const ids = new Set(fixtures.map((e) => e.data.worldRecordId));
  assert.equal(ids.size, fixtures.length, 'one durable identity each');
  tick(60);
  const after = s.entityList.filter((e) => e.data?.counterweightVenue);
  assert.equal(after.length, fixtures.length, 'no duplicate venue bodies');
  // Registrar deck offer fires while the pilot stands close.
  assert.ok(s.entityList.some((e) => e.data?.counterweightVenueRole === 'registrar'));
});

test('registrar session keeps the chosen page, rejects stale choices and rearms only on exit', async () => {
  const { s, sim, player, tick, anchor } = await fixture();
  const first = s.counterweightCircuitOffer;
  const choose = (offer, action, eventId) => sim.bus.emit('counterweightCircuit:action', {
    action, eventId, offerId: offer.id, generation: offer.generation,
  });
  assert.equal(first.id, 'counterweight:registrar');
  choose(first, 'events');
  const courses = s.counterweightCircuitOffer;
  tick(120);
  assert.equal(s.counterweightCircuitOffer.id, 'counterweight:events');
  choose(first, 'records');
  assert.equal(s.counterweightCircuitOffer.id, 'counterweight:events', 'old page cannot retake ownership');
  choose(courses, 'preview', 'soft_berth');
  const preview = s.counterweightCircuitOffer;
  tick(120);
  assert.equal(s.counterweightCircuitOffer.id, 'counterweight:preview:soft_berth');
  choose(preview, 'close');
  tick(120);
  assert.equal(s.counterweightCircuitOffer, null, 'leaving the deck stays dismissed');
  player.pos.set(anchor.x + 5000, 0, anchor.z); tick(1);
  player.pos.set(anchor.x + 40, 0, anchor.z); tick(2);
  assert.equal(s.counterweightCircuitOffer.id, 'counterweight:registrar');
  choose(first, 'events');
  assert.equal(s.counterweightCircuitOffer.id, 'counterweight:registrar', 'old session cannot act in new session');
});

test('admission cannot arm or count a partial or stale presentation receipt', async () => {
  const { s, sim, owner, tick, row, near } = await fixture();
  assert.equal(owner._startAttempt('soft_berth', false), true);
  const attempt = owner._attempt(), admission = s.counterweightCircuitView.admission;
  near(attempt.cohort.get('load'), 60, 0); tick(10);
  assert.equal(attempt.fsm.phase, 'staged');
  assert.equal(row().records.soft_berth?.attempts || 0, 0);
  const receipt = { attemptId: attempt.attemptId, generation: admission.generation,
    bodies: admission.bodies.map(({ id, generation }) => ({ id, generation })) };
  sim.bus.emit('counterweightCircuit:presentationReady', { ...receipt, bodies: receipt.bodies.slice(0, -1) });
  tick(1); assert.equal(attempt.admissionPending, true);
  sim.bus.emit('counterweightCircuit:presentationReady', { ...receipt, generation: receipt.generation - 1 });
  tick(1); assert.equal(attempt.admissionPending, true);
  sim.bus.emit('counterweightCircuit:presentationReady', receipt);
  tick(2);
  assert.equal(attempt.admissionPending, false);
  assert.equal(row().records.soft_berth.attempts, 1);
});

test('a fresh run cannot consume an earlier run\'s admission receipt', async () => {
  const { s, sim, owner, tick } = await fixture();
  owner._startAttempt('soft_berth', true);
  const previous = s.counterweightCircuitView;
  const oldReceipt = { attemptId: previous.attemptId, generation: previous.admission.generation,
    bodies: previous.admission.bodies.map(({ id, generation }) => ({ id, generation })) };
  owner.newGame(); tick(3);
  assert.equal(owner._startAttempt('soft_berth', true), true);
  const next = owner._attempt();
  assert.notEqual(next.admissionGeneration, oldReceipt.generation);
  sim.bus.emit('counterweightCircuit:presentationReady', oldReceipt); tick(3);
  assert.equal(next.admissionPending, true);
  assert.equal(next.presentationReady, false);
});

test('partial cohort creation rolls back without recording an attempt', async () => {
  const { s, owner, row } = await fixture();
  const helpers = owner.ctx.helpers, spawn = helpers.spawnEntity;
  let calls = 0;
  helpers.spawnEntity = spec => (++calls === 2 ? null : spawn(spec));
  try {
    assert.equal(owner._startAttempt('soft_berth', false), false);
    assert.equal(owner._attempt(), null);
    assert.equal(row().records.soft_berth?.attempts || 0, 0);
    const remnants = s.entityList.filter(e => e.data?.counterweightAttempt != null);
    assert.ok(remnants.every(e => e.data.counterweightRetired), 'any spawned partial body was retired');
  } finally { helpers.spawnEntity = spawn; }
});

test('Fragile Freight exposes all baffles and identifies the current passage', async () => {
  const { s, owner, tick, acceptPresentation } = await fixture();
  assert.equal(owner._startAttempt('fragile_freight', true), true);
  acceptPresentation();
  const attempt = owner._attempt();
  attempt.fsm.legIndex = 2; // Isolate the presentation projection for the second authored gate.
  tick(40);
  const gates = s.counterweightCircuitView.marks.filter(mark => mark.shape === 'gate');
  assert.deepEqual(gates.map(g => g.gateId), ['baffle_a', 'baffle_b', 'baffle_c']);
  assert.deepEqual(gates.filter(g => g.active).map(g => g.gateId), ['baffle_b']);
  assert.match(s.counterweightCircuitOffer.detail, /Pass above the second baffle/);
});

test('an away-from-registrar result remains readable and can be dismissed', async () => {
  const { s, sim, owner, player, tick, anchor, acceptPresentation } = await fixture();
  owner._startAttempt('soft_berth', true); acceptPresentation();
  player.pos.set(anchor.x + 600, 0, anchor.z); tick(1);
  owner._cancelAttempt('cancelled'); tick(2);
  let offer = s.counterweightCircuitOffer;
  assert.equal(offer.id, 'counterweight:result');
  sim.bus.emit('counterweightCircuit:action', { action: 'menu', offerId: offer.id, generation: offer.generation });
  offer = s.counterweightCircuitOffer;
  assert.match(offer.detail, /Return to the registrar/);
  sim.bus.emit('counterweightCircuit:action', { action: 'close', offerId: offer.id, generation: offer.generation });
  tick(2); assert.equal(s.counterweightCircuitOffer, null);
});

test('economy settles only the owner-authorized award and makes reentrant replay harmless', async () => {
  const { s, sim, owner, row } = await fixture();
  const economyOwner = sim.registry.get('economy'), before = s.player.credits;
  assert.equal(economyOwner.settleCounterweightResult('soft_berth', 9).ok, false);
  const record = row().records.soft_berth = { ...freshEventRecord(), completions: 1,
    lastAttemptKey: 'soft_berth:9', pendingReward: { eventId: 'soft_berth', attemptId: 9 },
    lastResult: { eventId: 'soft_berth', outcome: 'complete', practice: false, rewardStatus: 'pending' } };
  row().lastResult = record.lastResult;
  let callbackState;
  sim.bus.on('credits:changed', () => {
    callbackState = { paid: record.paid, credits: s.player.credits, saved: owner.serialize(),
      replay: economyOwner.settleCounterweightResult('soft_berth', 9) };
  });
  const result = economyOwner.settleCounterweightResult('soft_berth', 9);
  assert.equal(result.ok, true);
  assert.equal(result.creditedCr, COUNTERWEIGHT_EVENT_BY_ID.soft_berth.rewardCr);
  assert.equal(s.player.credits, before + result.creditedCr);
  assert.equal(callbackState.paid, true);
  assert.equal(callbackState.saved.records.soft_berth.paid, true);
  assert.equal(callbackState.credits, s.player.credits);
  assert.equal(callbackState.replay.ok, true);
  assert.equal(callbackState.replay.duplicate, true, 'a completed award returns its original receipt');
  assert.equal(record.lastResult.rewardCr, result.creditedCr);
});

test('a full wallet leaves a first award pending across save and pays after retry', async () => {
  const { s, sim, owner, row, tick } = await fixture();
  const economyOwner = sim.registry.get('economy');
  const record = row().records.soft_berth = { ...freshEventRecord(), completions: 1,
    lastAttemptKey: 'soft_berth:11', pendingReward: { eventId: 'soft_berth', attemptId: 11 },
    lastResult: { eventId: 'soft_berth', outcome: 'complete', practice: false, rewardStatus: 'pending' } };
  row().lastResult = record.lastResult;
  s.player.credits = Number.MAX_SAFE_INTEGER;
  assert.deepEqual(economyOwner.settleCounterweightResult('soft_berth', 11), { ok: false, reason: 'wallet_full' });
  assert.equal(record.paid, false);
  assert.ok(record.pendingReward);
  const save = owner.serialize();
  owner.deserialize(save);
  assert.ok(row().records.soft_berth.pendingReward, 'accepted completion retains pending award across save normalization');
  s.player.credits = 500;
  tick(330);
  assert.equal(row().records.soft_berth.paid, true);
  assert.equal(s.player.credits, 500 + COUNTERWEIGHT_EVENT_BY_ID.soft_berth.rewardCr);
});

test('accepted result settles its reward through economy (injected receiver witness)', async () => {
  const { s, owner, tick, near, acceptPresentation } = await fixture();
  const before = s.player.credits;
  owner._startAttempt('soft_berth', false); acceptPresentation();
  const attempt = owner._attempt(), load = attempt.cohort.get('load'), cradle = attempt.cohort.get('cradle');
  near(load, 60, 0); tick(2);
  assert.equal(attempt.fsm.phase, 'running');
  // This isolates owner result/settlement wiring; it does not claim a native tow or seat.
  attempt.fsm.legIndex = 1;
  attempt.fsm.mem.dwellS['load:cradle'] = 1.2;
  const physical = owner._physical(), observe = physical.observe;
  physical.observe = (...args) => {
    const obs = observe(...args);
    obs.receivers['load:cradle'] = { bodyId: load.id, bodyGeneration: load.occupantGeneration,
      receiverId: cradle.id, receiverGeneration: cradle.occupantGeneration, stable: true, relativeSpeed: 1 };
    return obs;
  };
  try { tick(1); } finally { physical.observe = observe; }
  const result = s.world.counterweightCircuit.lastResult;
  assert.equal(result.outcome, 'complete');
  assert.equal(result.rewardCr, COUNTERWEIGHT_EVENT_BY_ID.soft_berth.rewardCr);
  assert.equal(s.player.credits, before + result.rewardCr);
  assert.equal(s.world.counterweightCircuit.records.soft_berth.paid, true);
});

test('destroyed practice load fails — never a win during cleanup', async () => {
  const { s, owner, tick, near, acceptPresentation } = await fixture();
  owner._startAttempt('soft_berth', true);
  acceptPresentation();
  const attempt = owner._attempt();
  const load = attempt.cohort.get('load');
  near(load, 60, 0);
  tick(5);
  assert.equal(attempt.fsm.phase, 'running');
  load.hull = 0;
  load.alive = false;
  tick(3);
  assert.equal(owner._attempt(), null, 'attempt closed');
  const rec = s.world.counterweightCircuit.records.soft_berth;
  assert.equal(rec.completions || 0, 0, 'no completion from a wreck');
  assert.equal(s.world.counterweightCircuit.lastResult.outcome, 'failed');
});

test('locked events refuse start until progression is earned', async () => {
  const { owner } = await fixture();
  assert.equal(owner._startAttempt('counterweight_finale', false), false, 'finale locked');
  assert.equal(owner._startAttempt('moving_berth', false), false, 'moving berth locked');
  assert.equal(owner._startAttempt('soft_berth', false), true, 'open event starts');
  owner._cancelAttempt('test_done');
});

test('attempt state serializes; interrupted restore marks unconfirmed', async () => {
  const { s, owner, tick, near, acceptPresentation } = await fixture();
  owner._startAttempt('soft_berth', false);
  acceptPresentation();
  const attempt = owner._attempt();
  near(attempt.cohort.get('load'), 60, 0);
  tick(5);
  const saved = owner.serialize();
  assert.equal(saved.attempt.eventId, 'soft_berth');
  assert.equal(saved.attempt.fsm.phase, 'running');
  // A second sim restores the section — cohort bodies did not travel with the
  // envelope, so the attempt must be marked unconfirmed, never inferred a win.
  const sim2 = createSimulation({ seed: 8207, systems: [ships, economy, physics, combat, createCounterweightCircuitSystem()] });
  const s2 = sim2.state;
  s2.mode = 'flight';
  s2.world.currentSectorId = VENUE_SECTOR_ID;
  const owner2 = sim2.registry.get('counterweightCircuit');
  owner2.deserialize(saved);
  owner2.afterContinue();
  assert.equal(owner2._attempt(), null, 'missing cohort → interrupted, not resumed');
  assert.equal(s2.world.counterweightCircuit.lastResult?.reason, 'interrupted_unconfirmed');
});

test('restored bodies alone do not prove native or line continuity', async () => {
  const { s, sim, owner, tick, near, acceptPresentation } = await fixture();
  const credits = s.player.credits;
  owner._startAttempt('soft_berth', false); acceptPresentation();
  const attempt = owner._attempt();
  near(attempt.cohort.get('load'), 60, 0); tick(5);
  const saved = owner.serialize();
  assert.equal(saved.attempt.cohort.length, COUNTERWEIGHT_EVENT_BY_ID.soft_berth.bodies.length);
  sim.bus.emit('save:restoring'); owner.deserialize(saved); sim.bus.emit('save:loaded');
  assert.equal(owner._attempt(), null);
  assert.equal(s.world.counterweightCircuit.lastResult.reason, 'interrupted_unconfirmed');
  assert.equal(s.world.counterweightCircuit.lastResult.reasonDetail, 'continuity_unconfirmed');
  assert.equal(s.player.credits, credits);
  assert.equal(s.world.counterweightCircuit.records.soft_berth.completions, 0);
});

test('a truncated saved role list cannot make a partial cohort complete', async () => {
  const { s, sim, owner, tick, near, acceptPresentation } = await fixture();
  owner._startAttempt('soft_berth', false); acceptPresentation();
  near(owner._attempt().cohort.get('load'), 60, 0); tick(3);
  const saved = owner.serialize(); saved.attempt.cohort = ['load'];
  sim.bus.emit('save:restoring'); owner.deserialize(saved); sim.bus.emit('save:loaded');
  assert.equal(owner._attempt(), null);
  assert.equal(s.world.counterweightCircuit.lastResult.reason, 'interrupted_unconfirmed');
  assert.equal(s.world.counterweightCircuit.lastResult.reasonDetail, 'cohort_missing');
  assert.equal(s.world.counterweightCircuit.records.soft_berth.completions, 0);
});

test('canonical save envelope restores a live attempt as unconfirmed, never as a win', async () => {
  const { s, sim, owner, tick, near, acceptPresentation } = await fixture({ withSave: true });
  const before = s.player.credits;
  owner._startAttempt('soft_berth', false); acceptPresentation();
  near(owner._attempt().cohort.get('load'), 60, 0); tick(5);
  const saver = sim.registry.get('save');
  const envelope = JSON.parse(JSON.stringify(saver.serialize('counterweight-live')));
  assert.equal(envelope.data.world.counterweightCircuit.attempt.eventId, 'soft_berth');
  assert.equal(saver.loadEnvelope(envelope, 'counterweight-live'), true);
  tick(5);
  assert.equal(owner._attempt(), null);
  assert.equal(s.world.counterweightCircuit.lastResult?.reason, 'interrupted_unconfirmed');
  assert.equal(s.world.counterweightCircuit.records.soft_berth.completions, 0);
  assert.equal(s.player.credits, before);
});
