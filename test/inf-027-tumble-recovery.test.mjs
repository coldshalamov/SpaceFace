import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeSensorFrame } from '../src/ai/contracts.js';
import { isRecovering } from '../src/combat/tumbleStatus.js';
import { createCombatCatalog } from '../src/combat/runtime.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { tumbleStates } from '../src/systems/tumbleStates.js';

// INF-027 — a forced tumble ends in stabilization, not in full tactics.
//
// While the tumble status is live the helm is decontrolled (INF-021). When it runs its natural
// course the ship now damps residual spin, answers a fraction of its thrust with silent guns
// for 0.9 s, then returns to tactics — so the opening has a recognizable end instead of an
// instant snap back to full attack. Hitstun stacking and cap rules live in _beginFromImpulse
// and are untouched by this transition.

const DT = 1 / 60;

function makeNpc() {
  return {
    id: 2,
    type: 'ship',
    alive: true,
    team: 1,
    pos: { x: 0, z: 0 },
    prevPos: { x: 0, z: 0 },
    vel: { x: 20, z: 0 },
    rot: 0,
    angVel: 1.5,
    radius: 14,
    mass: 60,
    hull: 100,
    hullMax: 120,
    armorHp: 0,
    armorMax: 0,
    shield: 0,
    shieldMax: 0,
    cap: 100,
    capMax: 160,
    flags: {},
    data: { intent: { fire: true, moveX: 1, moveZ: 0.5, boost: false, brake: false } },
  };
}

// Tumble status runs until simTime 10.0; the combat kernel is absent on purpose so the
// status fixture stays put and each update tick exercises exactly one transition.
function makeState(npc, simTime) {
  return {
    mode: 'flight',
    tick: 600,
    simTime,
    playerId: 1,
    entities: new Map([[2, npc]]),
    entityList: [npc],
    combat: {
      entities: {
        2: {
          statuses: {
            status_tumbling: {
              id: 'status_tumbling',
              data: { kind: 'weapon_tumble', startedAt: 9.0, until: 10.0 },
            },
          },
        },
      },
    },
  };
}

// Minimal combat kernel: the real catalog (profiles, subsystems) plus a status table that
// actually clears, so duration_elapsed fires once per tumble exactly like production.
function makeKernel() {
  return {
    catalog: createCombatCatalog(),
    statuses: {
      schedule(victim, runtime, def) {
        runtime.statuses = runtime.statuses || {};
        runtime.statuses[def.id] = { id: def.id, data: def.data };
        return { ok: true };
      },
      clear(victim, runtime, id) {
        if (runtime && runtime.statuses) delete runtime.statuses[id];
        return true;
      },
    },
  };
}

function drive(state) {
  const events = [];
  const bus = {
    on() { return () => {}; },
    emit(event, payload) { events.push({ event, payload }); },
  };
  const combatSystem = { kernel: makeKernel() };
  tumbleStates.init({ state, bus, helpers: {}, registry: { get(name) { return name === 'combat' ? combatSystem : null; } } });
  try {
    tumbleStates.update(DT, state);
  } finally {
    tumbleStates.destroy();
  }
  return events;
}

test('tumble end opens a stabilization window instead of snapping to tactics', () => {
  const npc = makeNpc();
  const state = makeState(npc, 10.0);
  const events = drive(state);
  assert.equal(npc.data.recoveringUntil, 10.9);
  assert.equal(isRecovering(state, npc), true);
  const end = events.find((e) => e.event === 'massline:tumbleEnd');
  assert.ok(end, 'the end of the opening still announces');
  assert.equal(end.payload.recoverUntil, 10.9);
  const recovering = events.find((e) => e.event === 'massline:recovering');
  assert.deepEqual(recovering.payload, { victimId: 2, recoverUntil: 10.9 });
});

test('stabilization damps spin, disrupts thrust, and holds fire', () => {
  const npc = makeNpc();
  const state = makeState(npc, 10.0);
  drive(state);
  // Fresh AI intent for the recovery tick: a full attack run resumes upstream.
  npc.data.intent = { fire: true, moveX: 1, moveZ: 0.5, boost: true, brake: false };
  state.simTime = 10.5;
  drive(state);
  assert.equal(npc.data.intent.fire, false, 'guns stay silent while stabilizing');
  assert.equal(npc.data.intent.moveX, 0.35, 'disrupted thrust answers at a fraction');
  assert.equal(npc.data.intent.moveZ, 0.175);
  assert.equal(npc.data.intent.boost, false);
  const command = consumePhysicsCommand(npc);
  assert.equal(command.control.mode, 'tumbling', 'residual spin keeps damping, not drifting');
});

test('the window closes recognizably and tactics resume at full authority', () => {
  const npc = makeNpc();
  const state = makeState(npc, 10.0);
  drive(state);
  state.simTime = 10.89;
  assert.equal(isRecovering(state, npc), true, 'still stabilizing just inside');
  state.simTime = 11.0;
  const events = drive(state);
  assert.equal(isRecovering(state, npc), false);
  assert.equal(npc.data.recoveringUntil, undefined, 'the marker clears so nothing strands');
  const recovered = events.find((e) => e.event === 'massline:recovered');
  assert.deepEqual(recovered.payload, { victimId: 2 });
  // Full authority downstream: the next intent passes through unscaled.
  npc.data.intent = { fire: true, moveX: 1, moveZ: 0.5, boost: false, brake: false };
  state.simTime = 11.05;
  drive(state);
  assert.equal(npc.data.intent.moveX, 1, 'thrust returns whole after the beat');
  assert.equal(npc.data.intent.fire, true, 'guns decide for themselves again');
});

test('the player never stabilizes: no window, no events', () => {
  const npc = makeNpc();
  npc.id = 1;
  const state = makeState(npc, 10.0);
  state.entities = new Map([[1, npc]]);
  state.entityList = [npc];
  state.combat = { entities: { 1: state.combat.entities[2] } };
  const events = drive(state);
  assert.equal(npc.data.recoveringUntil, undefined);
  assert.equal(events.some((e) => e.event === 'massline:recovering'), false);
  assert.equal(isRecovering(state, npc), false);
});

test('the sensor frame carries recovery like any other helm fact', () => {
  const frame = normalizeSensorFrame({
    tick: 10,
    self: { id: 2, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, recovering: true },
    contacts: [],
    events: [],
  }, 2, 10);
  assert.equal(frame.self.recovering, true);
  const steady = normalizeSensorFrame({
    tick: 10,
    self: { id: 2, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } },
    contacts: [],
    events: [],
  }, 2, 10);
  assert.equal(steady.self.recovering, false, 'frames without the flag read as fully engaged');
});
