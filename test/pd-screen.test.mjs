/**
 * W04 point-defense screen — target/priority/cap contracts + doctrine distinction.
 * Honest v1: priority-targeting + saturation (no projectile intercept kill seam on weapons).
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { ContactKind } from '../src/ai/contracts.js';
import {
  isPdScreenActor,
  resolvePdCharge,
  selectPdInterceptTarget,
  selectBalancedTarget,
  scorePdThreat,
  ensurePdSaturation,
  pdSaturationAllows,
  beginPdIntercept,
  recoverPdSaturation,
  PD_SCREEN_DEFAULT_RADIUS,
  PD_SCREEN_MAX_INTERCEPTS,
  PD_SCREEN_RECOVERY_TICKS,
} from '../src/ai/pdScreen.js';
import { applyPdScreenTargetPolicy, applyAIFiringIntent } from '../src/systems/aiFireIntent.js';
import { createSimulation } from '../src/core/sim.js';
import { createTacticalAISystem } from '../src/systems/tacticalAI.js';
import { ObjectiveKind } from '../src/ai/contracts.js';

function makeContacts() {
  // Charge at origin. Threats at different ranges.
  return [
    {
      id: 'far_hostile',
      kind: ContactKind.SHIP,
      pos: { x: 900, z: 0 },
      alive: true, valid: true, visible: true, hostile: true, threat: 0.8,
    },
    {
      id: 'near_hostile_outside',
      kind: ContactKind.SHIP,
      pos: { x: PD_SCREEN_DEFAULT_RADIUS + 40, z: 0 },
      alive: true, valid: true, visible: true, hostile: true, threat: 0.5,
    },
    {
      id: 'inside_hostile',
      kind: ContactKind.SHIP,
      pos: { x: 80, z: 0 },
      alive: true, valid: true, visible: true, hostile: true, threat: 0.4,
    },
    {
      id: 'inside_missile',
      kind: ContactKind.PROJECTILE,
      pos: { x: 60, z: 10 },
      alive: true, valid: true, visible: true, hostile: true, threat: 0.9,
    },
    {
      id: 'friendly_ship',
      kind: ContactKind.SHIP,
      pos: { x: 50, z: 0 },
      alive: true, valid: true, visible: true, hostile: false, threat: 0,
    },
  ];
}

test('target/priority: inside-screen threats beat outside; missiles beat ships inside', () => {
  const chargePos = { x: 0, z: 0 };
  const selfPos = { x: -40, z: 0 };
  const contacts = makeContacts();
  const missileScore = scorePdThreat(contacts.find((c) => c.id === 'inside_missile'), chargePos, PD_SCREEN_DEFAULT_RADIUS, selfPos);
  const insideShip = scorePdThreat(contacts.find((c) => c.id === 'inside_hostile'), chargePos, PD_SCREEN_DEFAULT_RADIUS, selfPos);
  const outside = scorePdThreat(contacts.find((c) => c.id === 'near_hostile_outside'), chargePos, PD_SCREEN_DEFAULT_RADIUS, selfPos);
  assert.ok(missileScore > insideShip, 'missile inside screen > ship inside');
  assert.ok(insideShip > outside, 'ship inside > ship outside');

  const selected = selectPdInterceptTarget({
    self: { id: 'pd', pos: selfPos },
    charge: { id: 'ward', pos: chargePos },
    contacts,
  });
  assert.ok(selected);
  assert.equal(selected.targetId, 'inside_missile');
  assert.equal(selected.inside, true);
  assert.equal(selected.kind, ContactKind.PROJECTILE);
});

test('saturation cap blocks further intercepts until recovery', () => {
  const sat = {
    activeIntercepts: 0,
    lastReleaseTick: 0,
    maxIntercepts: PD_SCREEN_MAX_INTERCEPTS,
    recoveryTicks: PD_SCREEN_RECOVERY_TICKS,
  };
  assert.equal(pdSaturationAllows(sat, 10), true);
  beginPdIntercept(sat, 10);
  beginPdIntercept(sat, 11);
  assert.equal(sat.activeIntercepts, PD_SCREEN_MAX_INTERCEPTS);
  assert.equal(pdSaturationAllows(sat, 12), false);

  const selectedWhileFull = selectPdInterceptTarget({
    self: { id: 'pd', pos: { x: 0, z: 0 } },
    charge: { id: 'w', pos: { x: 0, z: 0 } },
    contacts: makeContacts(),
    saturation: sat,
    tick: 12,
  });
  assert.equal(selectedWhileFull, null);

  // After recovery window, slots free up.
  recoverPdSaturation(sat, 12 + PD_SCREEN_RECOVERY_TICKS);
  assert.ok(sat.activeIntercepts < PD_SCREEN_MAX_INTERCEPTS);
  assert.equal(pdSaturationAllows(sat, 12 + PD_SCREEN_RECOVERY_TICKS), true);
});

test('doctrine distinction: PD prioritizes screen interior; balanced prioritizes nearest ship', () => {
  const contacts = makeContacts();
  const selfPos = { x: 850, z: 0 }; // near the far hostile
  const charge = { id: 'ward', pos: { x: 0, z: 0 } };
  const pd = selectPdInterceptTarget({
    self: { id: 'pd', pos: selfPos },
    charge,
    contacts,
  });
  const balanced = selectBalancedTarget(contacts, selfPos);
  assert.ok(pd);
  assert.ok(balanced);
  // Under identical contact set, PD still picks the inside-screen missile (protect the charge),
  // while balanced picks the nearest hostile ship to self (far_hostile at x=900).
  assert.equal(pd.targetId, 'inside_missile');
  assert.equal(balanced.targetId, 'far_hostile');
  assert.notEqual(pd.targetId, balanced.targetId, 'PD and balanced must diverge under identical inputs');
});

test('isPdScreenActor detects pd_screen_escort role', () => {
  assert.equal(isPdScreenActor({ data: { lootTableId: 'pd_screen_escort' } }), true);
  assert.equal(isPdScreenActor({ data: { lootTableId: 'mine_layer_jackal' } }), false);
  assert.equal(isPdScreenActor({ data: { pdScreen: true } }), true);
});

test('applyPdScreenTargetPolicy wires charge + saturation on live entities', () => {
  const sim = createSimulation({ seed: 404, systems: [] });
  const { state } = sim;
  state.mode = 'flight';
  const ward = sim.spawn({
    type: 'ship', team: 1, pos: { x: 0, z: 0 }, radius: 16, hull: 200, hullMax: 200,
    data: { ai: { squadId: 's1', encounterRole: 'leader' } },
  });
  const pd = sim.spawn({
    type: 'ship', team: 1, pos: { x: -50, z: 0 }, radius: 18, hull: 200, hullMax: 200,
    data: {
      lootTableId: 'pd_screen_escort',
      ai: { squadId: 's1', escortTargetId: ward.id, activity: { kind: 'screen' }, roe: 'defensive' },
      weapons: [{ defId: 'wpn_flak_turret_s', projSpeed: 600 }],
    },
  });
  const threat = sim.spawn({
    type: 'ship', team: 0, pos: { x: 100, z: 0 }, radius: 12, hull: 80, hullMax: 80,
    data: { ai: { archetype: 'pirate' } },
  });
  state.playerId = threat.id;
  state.tick = 30;

  const charge = resolvePdCharge(pd, state);
  assert.equal(charge.id, ward.id);

  const targetId = applyPdScreenTargetPolicy(pd, state);
  assert.equal(targetId, threat.id);
  assert.equal(pd.data.pdScreenRuntime.lastTargetId, threat.id);
  assert.equal(pd.data.pdScreenRuntime.chargeId, ward.id);
  assert.ok(pd.data.pdScreenRuntime.activeIntercepts >= 1);
});

test('determinism: identical contacts/seeds yield identical PD selection', () => {
  const contacts = makeContacts();
  const a = selectPdInterceptTarget({
    self: { id: 'pd', pos: { x: -10, z: 0 } },
    charge: { id: 'w', pos: { x: 0, z: 0 } },
    contacts,
    tick: 5,
  });
  const b = selectPdInterceptTarget({
    self: { id: 'pd', pos: { x: -10, z: 0 } },
    charge: { id: 'w', pos: { x: 0, z: 0 } },
    contacts,
    tick: 5,
  });
  assert.deepEqual(a, b);
});

test('applyAIFiringIntent sets combat.targetId via PD policy for pd_screen_escort', () => {
  const sim = createSimulation({ seed: 77, systems: [] });
  const { state } = sim;
  // Geometry: PD and threat share an open lane; charge sits off-axis so FF lane stays clear.
  const ward = sim.spawn({
    type: 'ship', team: 1, pos: { x: 0, z: 120 }, radius: 16, hull: 200, hullMax: 200,
    data: { ai: { squadId: 'sq' } },
  });
  const pd = sim.spawn({
    type: 'ship', team: 1, pos: { x: 0, z: 0 }, radius: 18, hull: 200, hullMax: 200,
    data: {
      lootTableId: 'pd_screen_escort',
      ai: {
        squadId: 'sq',
        escortTargetId: ward.id,
        activity: { kind: 'screen', reason: 'pd' },
        roe: 'weapons_free',
        motive: 'screen',
        engagementTrigger: 'authorized_hostile_spawn',
      },
      weapons: [{ defId: 'wpn_flak_turret_s', projSpeed: 600 }],
      intent: {},
      combat: {},
    },
  });
  const threat = sim.spawn({
    type: 'ship', team: 0, pos: { x: 120, z: 0 }, radius: 12, hull: 80, hullMax: 80, data: {},
  });
  state.playerId = threat.id;
  state.tick = 100;

  applyAIFiringIntent({
    entityId: pd.id,
    directive: {
      objective: { kind: ObjectiveKind.SCREEN, targetId: null, reason: 'pd_screen' },
    },
    combatDoctrine: { fireWindow: true, doctrineId: 'interceptor_flyby', phase: 'strike' },
  }, state);

  assert.equal(pd.data.combat.targetId, threat.id);
  assert.equal(pd.data.combat.pdScreen, true);
  assert.equal(pd.data.intent.fire, true);
});
