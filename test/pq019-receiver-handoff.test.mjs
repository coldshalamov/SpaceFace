// PQ-019B seam (d) — physical receiver prepare / commit / abort.
//
// The claim under test: the only system that can physically consume the capsule does so exactly
// once, keyed by a terminal receipt, and never during prepare. An aborted or interrupted handoff
// costs nothing, and a delivery the physical world did not earn cannot be claimed at all.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { physics } from '../src/core/physics.js';
import { world } from '../src/systems/world.js';
import { heistFacilities, RECEIVER_FACILITY_IDS } from '../src/systems/heistFacilities.js';
import { PQ019_CAPSULE, PQ019_HEIST_SECTOR_ID } from '../src/data/heistFacilities.js';

const RECEIPT = 'heist:receipt:1abc2def';
const SCHEDULE = 'pq019b-receiver';

function boot(seed = 19019) {
  const bus = createBus();
  const sim = createSimulation({ seed, bus, systems: [physics, world, heistFacilities] });
  const { state } = sim;
  state.mode = 'flight';
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 12, mass: 24,
    hull: 100, hullMax: 100, collides: true,
  });
  state.playerId = player.id;
  const events = [];
  for (const name of ['heist:receiverPrepared', 'heist:receiverCommitted', 'heist:receiverAborted']) {
    bus.on(name, (payload) => events.push({ name, payload }));
  }
  sim.registry.get('world').enterSector(PQ019_HEIST_SECTOR_ID);
  return { sim, state, bus, player, events, system: sim.registry.get('heistFacilities') };
}

function roleEntities(state, role) {
  return state.entityList.filter((e) => e?.alive !== false && e.data?.heistFacilityRole === role);
}

/** Entity vectors are SimVector3 instances; compare components, not prototypes. */
function xz(v) {
  return { x: v.x, z: v.z };
}

/** Launch the capsule and give it a real custody contact at `facilityId`. */
function launchAndContact(t, facilityId = 'fence_receiver') {
  t.system.requestLaunchSchedule({ scheduleId: SCHEDULE, launchAtSimT: t.state.simTime });
  t.sim.step(SIM_DT);
  const capsule = t.state.entities.get(t.state.heistFacilities.capsuleEntityId);
  assert.ok(capsule, 'the fixture must launch a real capsule');
  const head = roleEntities(t.state, `${facilityId}_head`)[0];
  assert.ok(head, `${facilityId} must have a physical head`);
  t.bus.emit('physics:impact', {
    tick: t.state.tick + 5, aId: capsule.id, bId: head.id, dp: 50,
    pos: { x: head.pos.x, z: head.pos.z },
  });
  assert.ok(
    t.state.heistFacilities.candidateReceipts.some((r) => r.facilityId === facilityId),
    'the fixture must record a real custody candidate',
  );
  return { capsule, head };
}

function goodPrepare(overrides = {}) {
  return {
    receiptId: RECEIPT,
    facilityId: 'fence_receiver',
    payloadStableId: PQ019_CAPSULE.stableId,
    ...overrides,
  };
}

// ── prepare reserves, and consumes nothing ──────────────────────────────────────────────────────

test('prepare reserves the capsule without consuming it or paying anyone', () => {
  const t = boot();
  const { capsule } = launchAndContact(t);
  const before = { pos: xz(capsule.pos), vel: xz(capsule.vel), hull: capsule.hull };

  const out = t.system.prepareReceiverHandoff(goodPrepare());
  assert.equal(out.prepared, true);
  assert.equal(out.handoff.status, 'prepared');
  assert.equal(out.handoff.facilityId, 'fence_receiver');
  assert.equal(out.handoff.capsuleEntityId, capsule.id);
  assert.ok(out.handoff.custodyReceiptId, 'the physical contact is cited in the reservation');

  // The capsule is untouched: alive, physical, and exactly where it was.
  const live = t.state.entities.get(capsule.id);
  assert.equal(live.alive, true);
  assert.equal(live.collides, true);
  assert.deepEqual(xz(live.pos), before.pos);
  assert.deepEqual(xz(live.vel), before.vel);
  assert.equal(live.hull, before.hull);
  assert.equal(live.data.receiverHandoffReceiptId, RECEIPT, 'only a reservation mark is written');
  assert.equal(t.state.heistFacilities.capsuleEntityId, capsule.id);
  assert.equal(t.events.filter((e) => e.name === 'heist:receiverCommitted').length, 0,
    'prepare must never emit a commit');
});

test('prepare is idempotent per receipt and refuses a competing one', () => {
  const t = boot();
  launchAndContact(t);
  const first = t.system.prepareReceiverHandoff(goodPrepare());
  for (let i = 0; i < 4; i++) {
    const again = t.system.prepareReceiverHandoff(goodPrepare());
    assert.equal(again.prepared, true);
    assert.equal(again.resumed, true);
    assert.equal(again.handoff, first.handoff);
  }
  const competing = t.system.prepareReceiverHandoff(goodPrepare({ receiptId: 'heist:receipt:other' }));
  assert.equal(competing.prepared, false);
  assert.equal(competing.reason, 'handoff_in_progress');
});

test('a handoff the physical world did not earn cannot be prepared', () => {
  const t = boot();
  // Launched, but never touched anything.
  t.system.requestLaunchSchedule({ scheduleId: SCHEDULE, launchAtSimT: t.state.simTime });
  t.sim.step(SIM_DT);
  const noContact = t.system.prepareReceiverHandoff(goodPrepare());
  assert.equal(noContact.prepared, false);
  assert.equal(noContact.reason, 'no_custody_contact',
    'a delivery cannot be claimed without a real contact');

  // Contact at the CATCHER does not authorize a handoff at the FENCE.
  launchAndContact(t, 'lawful_catcher');
  assert.equal(t.system.prepareReceiverHandoff(goodPrepare()).reason, 'no_custody_contact');
  assert.equal(t.system.prepareReceiverHandoff(goodPrepare({ facilityId: 'lawful_catcher' })).prepared, true);
});

test('prepare refuses malformed requests, non-receiver facilities, and a foreign payload', () => {
  const t = boot();
  launchAndContact(t);
  for (const bad of [
    {}, goodPrepare({ receiptId: '' }), goodPrepare({ receiptId: null }),
    goodPrepare({ facilityId: 'heist_launcher' }), goodPrepare({ facilityId: 'not_a_facility' }),
    goodPrepare({ facilityId: null }), goodPrepare({ payloadStableId: 'some_other_pod' }),
  ]) {
    const out = t.system.prepareReceiverHandoff(bad);
    assert.equal(out.prepared, false, JSON.stringify(bad));
    assert.equal(out.reason, 'invalid_handoff', JSON.stringify(bad));
  }
  assert.equal(t.system.receiverHandoff(), null, 'a refused prepare reserves nothing');
  assert.deepEqual([...RECEIVER_FACILITY_IDS].sort(), ['fence_receiver', 'lawful_catcher']);
});

test('prepare on an absent payload is a stable refusal, not a fabricated reservation', () => {
  const t = boot();
  const out = t.system.prepareReceiverHandoff(goodPrepare());
  assert.equal(out.prepared, false);
  assert.equal(out.reason, 'payload_absent');
  assert.equal(t.system.receiverHandoff(), null);
});

// ── commit is exactly once ──────────────────────────────────────────────────────────────────────

test('commit consumes the capsule exactly once', () => {
  const t = boot();
  const { capsule } = launchAndContact(t);
  t.system.prepareReceiverHandoff(goodPrepare());

  const out = t.system.commitReceiverHandoff(RECEIPT);
  assert.equal(out.committed, true);
  assert.equal(out.receipt.consumedEntityId, capsule.id);
  assert.equal(out.receipt.effectId, `pq019b:receiverCommit:${RECEIPT}`);
  t.sim.step(SIM_DT);
  assert.equal(roleEntities(t.state, 'cargo_capsule').length, 0, 'the payload is consumed');
  assert.equal(t.state.heistFacilities.capsuleEntityId, null);

  for (let i = 0; i < 4; i++) {
    const again = t.system.commitReceiverHandoff(RECEIPT);
    assert.equal(again.committed, false);
    assert.equal(again.reason, 'already_committed');
  }
  assert.equal(t.events.filter((e) => e.name === 'heist:receiverCommitted').length, 1);
});

test('commit refuses a receipt that did not reserve the payload', () => {
  const t = boot();
  launchAndContact(t);
  assert.equal(t.system.commitReceiverHandoff(RECEIPT).reason, 'not_prepared');
  t.system.prepareReceiverHandoff(goodPrepare());
  assert.equal(t.system.commitReceiverHandoff('heist:receipt:someoneelse').reason, 'receipt_mismatch');
  assert.equal(roleEntities(t.state, 'cargo_capsule').length, 1, 'nothing was consumed');
});

test('a payload destroyed between prepare and commit fails closed', () => {
  const t = boot();
  const { capsule } = launchAndContact(t);
  t.system.prepareReceiverHandoff(goodPrepare());
  t.sim.registry.ctx.helpers.removeEntity(capsule.id);
  t.sim.step(SIM_DT);

  const out = t.system.commitReceiverHandoff(RECEIPT);
  assert.equal(out.committed, false);
  assert.equal(out.reason, 'payload_absent');
  assert.equal(out.handoff.status, 'aborted');
  // Spent: a retry cannot resurrect the delivery.
  assert.equal(t.system.commitReceiverHandoff(RECEIPT).reason, 'not_prepared');
  assert.equal(t.events.filter((e) => e.name === 'heist:receiverCommitted').length, 0);
});

// ── abort restores ──────────────────────────────────────────────────────────────────────────────

test('abort releases the reservation and leaves the capsule exactly as it was', () => {
  const t = boot();
  const { capsule } = launchAndContact(t);
  const before = { pos: xz(capsule.pos), vel: xz(capsule.vel), hull: capsule.hull };
  t.system.prepareReceiverHandoff(goodPrepare());

  const out = t.system.abortReceiverHandoff(RECEIPT, 'outcome_changed');
  assert.equal(out.aborted, true);
  assert.equal(out.restoredEntityId, capsule.id);

  const live = t.state.entities.get(capsule.id);
  assert.equal(live.alive, true);
  assert.equal(live.collides, true);
  assert.deepEqual(xz(live.pos), before.pos);
  assert.deepEqual(xz(live.vel), before.vel);
  assert.equal(live.hull, before.hull);
  assert.equal(live.data.receiverHandoffReceiptId, undefined, 'the reservation mark is cleared');
  assert.equal(t.system.receiverHandoff(), null);

  // ...and the payload can be handed to a different receipt afterwards. Abort must be free.
  const second = t.system.prepareReceiverHandoff(goodPrepare({ receiptId: 'heist:receipt:second' }));
  assert.equal(second.prepared, true);
  assert.equal(t.system.commitReceiverHandoff('heist:receipt:second').committed, true);
});

test('abort is idempotent, cannot be done by a foreign receipt, and cannot undo a commit', () => {
  const t = boot();
  launchAndContact(t);
  assert.equal(t.system.abortReceiverHandoff(RECEIPT).reason, 'not_prepared');
  t.system.prepareReceiverHandoff(goodPrepare());
  assert.equal(t.system.abortReceiverHandoff('heist:receipt:other').reason, 'receipt_mismatch');
  assert.equal(t.system.abortReceiverHandoff(RECEIPT).aborted, true);
  assert.equal(t.system.abortReceiverHandoff(RECEIPT).reason, 'not_prepared');

  t.system.prepareReceiverHandoff(goodPrepare());
  t.system.commitReceiverHandoff(RECEIPT);
  assert.equal(t.system.abortReceiverHandoff(RECEIPT).aborted, false);
  assert.equal(t.system.abortReceiverHandoff(RECEIPT).reason, 'already_committed');
});

// ── interruption between prepare and commit ─────────────────────────────────────────────────────

test('a crash between prepare and commit resumes deterministically, never into a double consume', () => {
  const t = boot();
  launchAndContact(t);
  const prepared = t.system.prepareReceiverHandoff(goodPrepare()).handoff;
  assert.equal(prepared.status, 'prepared');

  // Same process, retried handoff: prepare resumes the SAME reservation, commit still happens once.
  const resumedPrepare = t.system.prepareReceiverHandoff(goodPrepare());
  assert.equal(resumedPrepare.handoff, prepared);
  assert.equal(t.system.commitReceiverHandoff(RECEIPT).committed, true);
  assert.equal(t.system.commitReceiverHandoff(RECEIPT).committed, false);

  // A genuinely new process: this owner's state is not in the save capture plan and the capsule is a
  // transient entity, so BOTH are gone after a load. The refusal is stable and identical every time
  // - which is exactly why the durable answer lives in the arbiter's effect journal, not here.
  const reloaded = boot();
  const first = reloaded.system.commitReceiverHandoff(RECEIPT);
  const second = reloaded.system.commitReceiverHandoff(RECEIPT);
  assert.equal(first.committed, false);
  assert.equal(first.reason, 'not_prepared');
  assert.deepEqual(second, first);
  assert.equal(reloaded.events.filter((e) => e.name === 'heist:receiverCommitted').length, 0);
});

test('the handoff record is created only on a real prepare', () => {
  const t = boot();
  assert.equal(t.state.heistFacilities.receiverHandoff, undefined,
    'no key may materialize on the ordinary facility path');
  t.sim.step(SIM_DT);
  assert.equal(t.state.heistFacilities.receiverHandoff, undefined);
  t.system.prepareReceiverHandoff(goodPrepare()); // denied: payload absent
  assert.equal(t.state.heistFacilities.receiverHandoff, undefined, 'a denial reserves nothing');
});

test('the receiver never pays, never touches player cargo, and never mutates sector ownership', () => {
  const t = boot();
  const paid = [];
  for (const name of ['economy:reward', 'credits:changed', 'cargo:changed', 'mission:complete']) {
    t.bus.on(name, (p) => paid.push({ name, p }));
  }
  const creditsBefore = t.state.player.credits;
  const cargoBefore = JSON.stringify(t.state.player.cargo?.items || {});

  launchAndContact(t);
  t.system.prepareReceiverHandoff(goodPrepare());
  t.system.commitReceiverHandoff(RECEIPT);

  assert.deepEqual(paid, [], 'settlement belongs to the mission owner, not the receiver');
  assert.equal(t.state.player.credits, creditsBefore);
  assert.equal(JSON.stringify(t.state.player.cargo?.items || {}), cargoBefore,
    'playerCargoMutationCountForCapsule == 0');
});
