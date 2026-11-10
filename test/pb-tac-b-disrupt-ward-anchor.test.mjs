// PB-TAC-B (SF-047 + SF-048 + SF-049) — the three counterplay deepeners:
//   SF-047  the disruptor's collapse is a committed, interruptible working interval;
//   SF-048  the escort's ward is sticky per-carrier custody with a leashed dart;
//   SF-049  the anchor's snare zone arms only across the telegraphed commit and dies on recovery.
// Each test names the behavior the OLD code got wrong; all clockwork is sim ticks.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { applySpecialistCounterplay } from '../src/ai/specialistCounterplay.js';
import {
  CombatDoctrineId,
  CombatDoctrineRuntime,
} from '../src/ai/combatDoctrine.js';
import { ContactKind, ObjectiveKind } from '../src/ai/contracts.js';
import { fields } from '../src/systems/fields.js';
import { FIELD_FLAGS } from '../src/data/fields.js';

// ── SF-047 ──────────────────────────────────────────────────────────────────────────────────────

function ghostFixture(hull = null) {
  const ghost = {
    id: 'ghost', alive: true, type: 'ship', team: 1,
    pos: { x: 40, z: 0 },
    data: { enemyTypeId: 'quiet_ghost' },
  };
  if (hull != null) {
    ghost.hull = hull;
    ghost.hullMax = hull;
    ghost.shield = 0;
  }
  return ghost;
}

function loneState(...entities) {
  const list = entities.filter(Boolean);
  return {
    playerId: list[0] && list[0].id,
    entities: new Map(list.map((e) => [e.id, e])),
    entityList: list,
  };
}

function runVerb(state, specialist, phase, tick, ports) {
  return applySpecialistCounterplay({
    state,
    specialist,
    enemyId: specialist.data.enemyTypeId,
    doctrinePhase: phase,
    tick,
    attachments: ports.attachments || null,
    fields: ports.fields || null,
  });
}

test('SF-047 the collapse is a working interval, not an instant aura', () => {
  const ghost = ghostFixture();
  const state = loneState(ghost);
  const fired = [];
  const ports = { fields: { disruptNear() { fired.push(1); return 1; } } };

  // OLD behavior fired the collapse on the first fire_window tick. Now the charge telegraph
  // only ACQUIRES: no port is touched, and the early window still touches nothing.
  assert.equal(runVerb(state, ghost, 'charge_cue', 100, ports), null, 'acquire at the telegraph');
  assert.equal(fired.length, 0);
  assert.equal(runVerb(state, ghost, 'fire_window', 110, ports), null, 'the wind-up must elapse');
  assert.equal(fired.length, 0, 'the owner received no disruption request yet');

  // Deadline (36t) reached inside the fire window: the owner finally gets the request and its
  // count is the only success claim.
  const landed = runVerb(state, ghost, 'fire_window', 136, ports);
  assert.equal(landed && landed.verb, 'disrupt_field');
  assert.equal(landed.ok, true);
  assert.equal(landed.count, 1);
  assert.equal(fired.length, 1);
});

test('SF-047 a hit on the working ghost kills the pass into the full cooldown', () => {
  const ghost = ghostFixture(100);
  const state = loneState(ghost);
  const fired = [];
  const ports = { fields: { disruptNear() { fired.push(1); return 1; } } };

  assert.equal(runVerb(state, ghost, 'charge_cue', 100, ports), null);
  ghost.hull = 88; // damage taken during the wind-up
  assert.equal(runVerb(state, ghost, 'fire_window', 104, ports), null, 'the pass dies on damage');
  assert.equal(fired.length, 0, 'the interrupted ghost collapses nothing');

  // Even past the deadline the pass is dead: the interrupt costs the full disrupt cooldown.
  assert.equal(runVerb(state, ghost, 'fire_window', 150, ports), null, 'cooldown holds');
  assert.equal(fired.length, 0);
  // After the cooldown a fresh telegraph commits a new pass.
  assert.equal(runVerb(state, ghost, 'charge_cue', 240, ports), null);
  const landed = runVerb(state, ghost, 'fire_window', 276, ports);
  assert.equal(landed && landed.ok, true, 'a fresh committed pass lands');
  assert.equal(fired.length, 1);
});

test('SF-047 a displaced working ghost loses the pass like a hit one', () => {
  const ghost = ghostFixture();
  const state = loneState(ghost);
  const fired = [];
  const ports = { fields: { disruptNear() { fired.push(1); return 1; } } };

  assert.equal(runVerb(state, ghost, 'charge_cue', 100, ports), null);
  ghost.pos.x += 121; // shoved past the hold radius
  assert.equal(runVerb(state, ghost, 'fire_window', 112, ports), null);
  assert.equal(fired.length, 0);
  assert.equal(ghost.data._disruptWork, undefined, 'the working record resolved');
});

test('SF-047 a fire window that closes without landing still costs the ghost', () => {
  const ghost = ghostFixture();
  const state = loneState(ghost);
  const ports = { fields: { disruptNear() { return 1; } } };

  assert.equal(runVerb(state, ghost, 'charge_cue', 100, ports), null);
  // The doctrine's closing_interrupt retreat ends the window: the dangling work must resolve
  // here, not linger or land on some later unrelated fire window.
  assert.equal(runVerb(state, ghost, 'reset', 118, ports), null);
  assert.equal(ghost.data._disruptWork, undefined);
  assert.equal(ghost.data._pq140LastVerbTick, 118, 'the interrupt burns the disrupt cooldown');
  assert.equal(runVerb(state, ghost, 'fire_window', 200, ports), null, 'cooldown still holding');
});

// ── SF-048 ──────────────────────────────────────────────────────────────────────────────────────

function escortContact(id, x, cargoBand, hostile = false) {
  return {
    id,
    kind: ContactKind.SHIP,
    alive: true,
    valid: true,
    visible: true,
    hostile,
    confidence: 1,
    threat: hostile ? 0.5 : 0.1,
    pos: { x, z: 0 },
    vel: { x: 0, z: 0 },
    tethered: false,
    tags: [],
    cargoBand,
  };
}

function escortFixture() {
  const world = {
    selfPos: { x: 0, z: 0 },
    threatX: 900,
    friendlies: [
      { id: 9, x: 150, cargoBand: 'empty' },     // the nearest ally — a dry fighter
      { id: 10, x: 400, cargoBand: 'valuable' }, // the actual carrier, farther out
    ],
    threatVisible: true,
  };
  const perception = () => ({
    self: {
      id: 2,
      team: 1,
      pos: { ...world.selfPos },
      vel: { x: 0, z: 0 },
      rot: 0,
      activity: {
        kind: 'screen', reason: 'fixture', anchor: { ...world.selfPos },
        leashRadius: 2600, preferredRange: 150, startedTick: 0,
      },
      roe: 'weapons_free',
    },
    contacts: [
      ...(world.threatVisible ? [escortContact(1, world.threatX, 'empty', true)] : []),
      ...world.friendlies.map((f) => escortContact(f.id, f.x, f.cargoBand, false)),
    ],
    events: [],
  });
  const directive = Object.freeze({
    objective: Object.freeze({ kind: ObjectiveKind.SCREEN, targetId: 1, reason: 'fixture' }),
    formation: Object.freeze({ breakFormation: false }),
  });
  return { world, perception, directive };
}

test('SF-048 the escort binds custody to the actual carrier, not the nearest ally', () => {
  const { world, perception, directive } = escortFixture();
  const runtime = new CombatDoctrineRuntime({ seed: 4801 });
  let hold = null;
  for (let tick = 0; tick <= 150; tick++) {
    const snap = runtime.update({
      tick, entityId: 2, doctrineId: CombatDoctrineId.ESCORT_SCREEN,
      perception: perception(), directive,
    });
    if (snap && snap.phase === 'screen_hold') hold = snap;
  }
  assert.ok(hold, 'the screen reaches hold');
  // OLD behavior: ward = nearest visible friendly (the dry fighter at 150), so the screen point
  // sat at x=310 — in FRONT of the fighter, behind the freight. Custody binds the carrier.
  const record = runtime.inspect(2);
  assert.equal(record.custodyTargetId, 10, 'custody binds the valuable carrier');
  assert.ok(hold.flightPoint.x > 400, 'the screen point sits on the carrier→threat side');
});

test('SF-048 custody is sticky and rebinds only when the carrier fails', () => {
  const { world, perception, directive } = escortFixture();
  const runtime = new CombatDoctrineRuntime({ seed: 4802 });
  const step = (tick) => runtime.update({
    tick, entityId: 2, doctrineId: CombatDoctrineId.ESCORT_SCREEN,
    perception: perception(), directive,
  });
  for (let tick = 0; tick <= 150; tick++) step(tick);
  assert.equal(runtime.inspect(2).custodyTargetId, 10);

  // A nearer empty hull appears: custody does NOT wander — the escort visibly stays on ITS carrier.
  world.friendlies.push({ id: 11, x: 40, cargoBand: 'empty' });
  step(151);
  assert.equal(runtime.inspect(2).custodyTargetId, 10, 'sticky across a nearer empty ally');

  // The carrier dies: custody rebinds to the next actual carrier (the light hauler), never the
  // dry fighter.
  world.friendlies = world.friendlies.filter((f) => f.id !== 10);
  world.friendlies.push({ id: 12, x: 600, cargoBand: 'light' });
  step(152);
  assert.equal(runtime.inspect(2).custodyTargetId, 12, 'rebinds to the next carrier on death');

  // The load is delivered (band flattens to empty) with no other carrier: custody fails closed
  // to the plain nearest-friendly ward.
  world.friendlies = [{ id: 11, x: 40, cargoBand: 'empty' }, { id: 12, x: 600, cargoBand: 'empty' }];
  step(153);
  assert.equal(runtime.inspect(2).custodyTargetId, 11, 'no carriers left: nearest friendly');
});

test('SF-048 the dart is leashed to the custody carrier', () => {
  const { world, perception, directive } = escortFixture();
  const runtime = new CombatDoctrineRuntime({ seed: 4803 });
  const step = (tick) => runtime.update({
    tick, entityId: 2, doctrineId: CombatDoctrineId.ESCORT_SCREEN,
    perception: perception(), directive,
  });
  let holdTick = null;
  for (let tick = 0; tick <= 150; tick++) {
    const snap = step(tick);
    if (snap && snap.phase === 'screen_hold' && holdTick == null) holdTick = tick;
  }
  assert.ok(holdTick != null, 'reached hold');
  // The threat breaches the carrier's ring: the dart flies.
  world.threatX = 500; // within 260 of the carrier at 400
  let darted = false;
  let tick = holdTick + 1;
  for (; tick <= holdTick + 60; tick++) {
    const snap = step(tick);
    if (snap && snap.phase === 'shield_dart') { darted = true; break; }
  }
  assert.ok(darted, 'a breach draws the dart');
  // The chase drags the screen beyond leash range of its carrier: it must break off NOW, not
  // after the authored 36t dart clock (OLD behavior).
  world.selfPos = { x: 900, z: 0 };
  const next = step(tick + 1);
  assert.equal(next.phase, 'screen_hold', 'the leash ends the chase past 420 wu from the ward');
});

// ── SF-049 ──────────────────────────────────────────────────────────────────────────────────────

function anchorFixture() {
  const previous = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;
  const bus = createBus();
  const anchor = {
    id: 21, type: 'ship', alive: true, team: 1, pos: { x: 400, z: 0 },
    data: {
      enemyTypeId: 'field_anchor_controller',
      fieldAnchor: { defKey: 'anchorSnare', spinupTicks: 45, radius: 235, strength: 185, damping: 3.2 },
    },
  };
  const state = {
    tick: 1000, simTime: 20, playerId: 1, mode: 'flight',
    entities: new Map([[21, anchor]]),
    entityList: [anchor],
    fields: null,
  };
  fields.init({ state, bus, helpers: {}, registry: null });
  const cleanup = () => {
    FIELD_FLAGS.enabled = previous;
    if (typeof fields.destroy === 'function') fields.destroy();
  };
  return { anchor, state, cleanup };
}

function snareStrength(state) {
  const rec = Object.values(state.fields.anchored || {})[0];
  const field = rec && fields._kernel.get(rec.fieldId);
  return field ? field.strength : null;
}

test('SF-049 the zone arms only through the owner, and a re-arm restarts the spinup', () => {
  const { anchor, state, cleanup } = anchorFixture();
  try {
    const fieldId = fields._registerAnchoredField(anchor);
    assert.ok(fieldId, 'spawn-time registration is the hull-equipment contract');
    // Spawn contract: armed by default, biting after the authored spinup.
    fields._syncAnchoredFields(state, state.fields);
    state.tick = 1020;
    fields._syncAnchoredFields(state, state.fields);
    assert.equal(snareStrength(state), 0, 'still spinning up');
    state.tick = 1046;
    fields._syncAnchoredFields(state, state.fields);
    assert.equal(snareStrength(state), 185, 'the spawn contract holds without a doctrine');

    // SF-049: the doctrine cycle disarms off-hold legs — the zone is inert while the controller
    // flies its approach or its recovery.
    const off = fields.setAnchorArmed(state, anchor.id, false, 1046);
    assert.equal(off.armed, false, 'the owner confirms the disarm');
    state.tick = 1100;
    fields._syncAnchoredFields(state, state.fields);
    assert.equal(snareStrength(state), 0, 'no pull outside the committed cycle');

    // The telegraphed commit re-arms with a FRESH spinup from the arm tick.
    const on = fields.setAnchorArmed(state, anchor.id, true, 1100);
    assert.equal(on.armed, true);
    assert.equal(on.activateTick, 1145, 're-arm restarts the authored spinup');
    state.tick = 1130;
    fields._syncAnchoredFields(state, state.fields);
    assert.equal(snareStrength(state), 0, 'the wind-up is real: no bite during the spinup');
    state.tick = 1145;
    fields._syncAnchoredFields(state, state.fields);
    assert.equal(snareStrength(state), 185, 'the zone bites after the telegraphed wind-up');

    // Idempotent: holding the arm request must not re-spin the well every decision tick.
    const again = fields.setAnchorArmed(state, anchor.id, true, 1140);
    assert.equal(again.activateTick, 1145, 'an already-armed well is not re-spun');

    // Refusal: no well, no confirmation.
    assert.equal(fields.setAnchorArmed(state, 999, true, 1150), null);
  } finally {
    cleanup();
  }
});

test('SF-049 the verb drives the arena cycle through the owner', () => {
  const { anchor, state, cleanup } = anchorFixture();
  try {
    fields._registerAnchoredField(anchor);
    const player = { id: 1, alive: true, team: 0, pos: { x: 300, z: 0 } };
    state.entities.set(1, player);
    state.entityList.push(player);
    const ports = { fields };

    // Approach leg: the zone is down even though the well is registered.
    const approach = runVerb(state, anchor, 'approach', 1000, ports);
    assert.equal(approach && approach.armed, false, 'the approach leg disarms the zone');
    fields._syncAnchoredFields(state, state.fields);
    assert.equal(snareStrength(state), 0);

    // The telegraphed commit arms with the hull's authored spinup.
    const spool = runVerb(state, anchor, 'field_spool', 1010, ports);
    assert.equal(spool && spool.verb, 'snare_field');
    assert.equal(spool.armed, true);
    assert.equal(spool.activateTick, 1055, '45t authored spinup from the arm tick');
    assert.equal(spool.active, false, 'not yet biting during the wind-up');
    fields._syncAnchoredFields(state, state.fields);
    assert.equal(snareStrength(state), 0, 'no pull while the wind-up runs');

    // The hold keeps the arm WITHOUT re-spinning it.
    const hold = runVerb(state, anchor, 'anchor_hold', 1030, ports);
    assert.equal(hold.activateTick, 1055, 'hold does not restart the spinup');
    state.tick = 1056;
    fields._syncAnchoredFields(state, state.fields);
    assert.equal(snareStrength(state), 185, 'the zone bites once the hold is live');

    // Recovery kills the zone again — one bite per committed cycle.
    const recover = runVerb(state, anchor, 'recover', 1060, ports);
    assert.equal(recover.armed, false);
    fields._syncAnchoredFields(state, state.fields);
    assert.equal(snareStrength(state), 0);
  } finally {
    cleanup();
  }
});
