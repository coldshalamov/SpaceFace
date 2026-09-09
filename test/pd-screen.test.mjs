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
  releasePdIntercept,
} from '../src/ai/pdScreen.js';
import { applyPdScreenTargetPolicy, applyAIFiringIntent } from '../src/systems/aiFireIntent.js';
import { authorizeAIEngagement } from '../src/ai/engagementAuthority.js';
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
      pos: { x: 360, z: 0 },
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
  const missileScore = scorePdThreat(contacts.find((c) => c.id === 'inside_missile'), chargePos, 320, selfPos);
  const insideShip = scorePdThreat(contacts.find((c) => c.id === 'inside_hostile'), chargePos, 320, selfPos);
  const outside = scorePdThreat(contacts.find((c) => c.id === 'near_hostile_outside'), chargePos, 320, selfPos);
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

test('screen radius is independently pinned at 320 on both sides and remains finite at extremes', () => {
  const selectAt = (x) => selectPdInterceptTarget({
    self: { id: 'pd', pos: { x: 0, z: 0 } },
    charge: { id: 'ward', pos: { x: 0, z: 0 } },
    contacts: [{
      id: `threat_${x}`,
      kind: ContactKind.SHIP,
      pos: { x, z: 0 },
      alive: true, valid: true, visible: true, hostile: true, threat: 1,
    }],
  });

  assert.equal(selectAt(320).inside, true);
  assert.equal(selectAt(320.000001).inside, false);
  const extreme = scorePdThreat({
    id: 'finite_extreme', kind: ContactKind.PROJECTILE,
    pos: { x: Number.MAX_VALUE, z: 0 }, alive: true, valid: true, hostile: true,
  }, { x: 0, z: 0 }, 320, { x: 0, z: 0 });
  assert.equal(Number.isFinite(extreme), true);
});

test('saturation cap is two charges with exact 44/45/46 recovery bounds', () => {
  const initialized = ensurePdSaturation({ data: {} });
  assert.equal(initialized.maxIntercepts, 2);
  assert.equal(initialized.recoveryTicks, 45);

  const sat = {
    activeIntercepts: 0,
    lastReleaseTick: 100,
  };
  assert.equal(beginPdIntercept(sat, 100), true, 'first charge is available');
  assert.equal(beginPdIntercept(sat, 101), true, 'second charge is available');
  assert.equal(beginPdIntercept(sat, 102), false, 'third charge is blocked');
  assert.equal(sat.activeIntercepts, 2);
  assert.equal(pdSaturationAllows(sat, 102), false);

  const selectedWhileFull = selectPdInterceptTarget({
    self: { id: 'pd', pos: { x: 0, z: 0 } },
    charge: { id: 'w', pos: { x: 0, z: 0 } },
    contacts: makeContacts(),
    saturation: sat,
    tick: 144,
  });
  assert.equal(selectedWhileFull, null);

  recoverPdSaturation(sat, 144);
  assert.equal(sat.activeIntercepts, 2, '44 ticks does not recover a charge');
  recoverPdSaturation(sat, 145);
  assert.equal(sat.activeIntercepts, 1, '45 ticks recovers exactly one charge');
  recoverPdSaturation(sat, 146);
  assert.equal(sat.activeIntercepts, 1, '46 ticks does not double-recover');

  sat.activeIntercepts = 2;
  releasePdIntercept(sat, 200);
  assert.equal(sat.activeIntercepts, 1, 'an authoritative early-release receipt frees one charge');
  assert.equal(sat.lastReleaseTick, 200);

  const huge = { activeIntercepts: 2, lastReleaseTick: Number.MAX_SAFE_INTEGER - 45 };
  recoverPdSaturation(huge, Number.MAX_SAFE_INTEGER);
  assert.equal(huge.activeIntercepts, 1, 'safe-integer extreme ticks preserve the 45-tick boundary');
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
      ai: {
        squadId: 's1', escortTargetId: ward.id,
        activity: { kind: 'screen' }, roe: 'defensive', forcePlayerTarget: true,
      },
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

test('PD fire composes with final engagement authority and denies missing zone metadata', () => {
  const h = livePdFixture();
  delete h.pd.data.ai.zoneId;
  assert.deepEqual(authorizeAIEngagement({
    state: h.state,
    self: h.pd,
    target: h.threat,
    tick: h.state.tick,
    objectiveReason: 'combat_doctrine:interceptor_flyby:strike',
  }), { ok: false, reason: 'zoneId' });

  applyAIFiringIntent(pdDecision(h.pd.id, h.threat.id), h.state);
  assert.equal(h.pd.data.intent.fire, false, 'PD target selection cannot override final authority denial');
});

test('saturated live PD emits no fire intent, then recovers at the exact tick', () => {
  const h = livePdFixture();
  h.pd.data.pdScreenRuntime = {
    activeIntercepts: 2,
    lastReleaseTick: 100,
    maxIntercepts: 2,
    recoveryTicks: 45,
    lastTargetId: h.threat.id,
  };

  h.state.tick = 144;
  applyAIFiringIntent(pdDecision(h.pd.id, h.threat.id), h.state);
  assert.equal(h.pd.data.intent.fire, false, 'saturation gates the actual fire bit at 44 ticks');

  h.state.tick = 145;
  applyAIFiringIntent(pdDecision(h.pd.id, h.threat.id), h.state);
  assert.equal(h.pd.data.intent.fire, true, 'one recovered charge reopens the authorized fire path at 45 ticks');
});

test('live target death/change consumes first and second charges; the third waits for recovery', () => {
  const h = livePdFixture();
  applyAIFiringIntent(pdDecision(h.pd.id, h.threat.id), h.state);
  assert.equal(h.pd.data.intent.fire, true);
  assert.equal(h.pd.data.pdScreenRuntime.activeIntercepts, 1);

  h.threat.alive = false;
  const second = spawnThreat(h.sim, 121, 0);
  h.state.tick = 101;
  applyAIFiringIntent(pdDecision(h.pd.id, second.id), h.state);
  assert.equal(h.pd.data.intent.fire, true);
  assert.equal(h.pd.data.combat.targetId, second.id);
  assert.equal(h.pd.data.pdScreenRuntime.activeIntercepts, 2);

  second.alive = false;
  const third = spawnThreat(h.sim, 119, 4);
  h.state.tick = 102;
  applyAIFiringIntent(pdDecision(h.pd.id, third.id), h.state);
  assert.equal(h.pd.data.intent.fire, false, 'third acquisition cannot fall back to the directive target');
  assert.equal(h.pd.data.pdScreenRuntime.activeIntercepts, 2);
});

test('PD accepts hostile-owner projectiles and rejects ownerless or neutral team mismatches', () => {
  const hostile = livePdFixture();
  const projectile = hostile.sim.spawn({
    type: 'projectile', team: hostile.threat.team, ownerId: hostile.threat.id,
    pos: { x: 60, z: 0 }, vel: { x: -200, z: 0 }, radius: 2, data: {},
  });
  applyAIFiringIntent(pdDecision(hostile.pd.id, null), hostile.state);
  assert.equal(hostile.pd.data.intent.fire, true);
  assert.equal(hostile.pd.data.combat.targetId, projectile.id);

  const ownerless = livePdFixture({ includeThreat: false });
  ownerless.sim.spawn({
    type: 'projectile', team: 0, ownerId: null,
    pos: { x: 60, z: 0 }, vel: { x: -200, z: 0 }, radius: 2, data: {},
  });
  applyAIFiringIntent(pdDecision(ownerless.pd.id, null), ownerless.state);
  assert.equal(ownerless.pd.data.intent.fire, false, 'ownerless team mismatch is not authored hostility');

  const neutral = livePdFixture({ threatTeam: 2 });
  applyAIFiringIntent(pdDecision(neutral.pd.id, neutral.threat.id), neutral.state);
  assert.equal(neutral.pd.data.intent.fire, false, 'raw neutral team mismatch cannot broaden hostility');
});

test('authorized live PD runs are byte-identical under fixed ticks', () => {
  const run = () => {
    const h = livePdFixture();
    const trace = [];
    for (const tick of [100, 101, 144, 145, 146]) {
      h.state.tick = tick;
      applyAIFiringIntent(pdDecision(h.pd.id, h.threat.id), h.state);
      trace.push({
        tick,
        intent: { ...h.pd.data.intent },
        combat: { ...h.pd.data.combat },
        saturation: { ...h.pd.data.pdScreenRuntime },
      });
    }
    return JSON.stringify(trace);
  };
  assert.equal(run(), run());
});

function livePdFixture({ includeThreat = true, threatTeam = 0 } = {}) {
  const sim = createSimulation({ seed: 77, systems: [] });
  const { state } = sim;
  state.mode = 'flight';
  state.tick = 100;
  state.simTime = 700;
  state.world.currentSectorId = 'sector_ceres_belt';
  const ward = sim.spawn({
    type: 'ship', team: 1, pos: { x: 0, z: 120 }, radius: 16, hull: 200, hullMax: 200,
    data: { ai: { squadId: 'sq', encounterRole: 'leader' } },
  });
  state.playerId = ward.id;
  const pd = sim.spawn({
    type: 'ship', team: 1, pos: { x: 0, z: 0 }, radius: 18, hull: 200, hullMax: 200,
    data: {
      lootTableId: 'pd_screen_escort',
      ai: {
        passive: false,
        squadId: 'sq',
        escortTargetId: ward.id,
        activity: {
          kind: 'screen', reason: 'pd_fixture', anchor: { x: 0, z: 0 },
          leashRadius: 2600, startedTick: 0,
        },
        roe: 'weapons_free',
        motive: 'assigned_interdiction',
        engagementTrigger: 'authorized_hostile_spawn',
        zoneId: 'zone_pd_fixture',
        approachTelegraph: 'engine_flare',
        noFireResponseWindowS: 1,
        combatDoctrineId: 'interceptor_flyby',
      },
      weapons: [{ defId: 'wpn_flak_turret_s', projSpeed: 600 }],
      intent: {},
      combat: {},
    },
  });
  const threat = includeThreat ? spawnThreat(sim, 120, 0, threatTeam) : null;
  return { sim, state, ward, pd, threat };
}

function spawnThreat(sim, x, z, team = 0) {
  return sim.spawn({
    type: 'ship', team, pos: { x, z }, radius: 12, hull: 80, hullMax: 80,
    data: { ai: { passive: team === 2 } },
  });
}

function pdDecision(entityId, targetId) {
  return {
    entityId,
    directive: {
      tactic: 'pd_screen',
      objective: {
        kind: ObjectiveKind.SCREEN,
        targetId,
        reason: 'combat_doctrine:interceptor_flyby:strike',
      },
    },
    // Visible fire stays closed until SG-03 admits the strike action (aiFireIntent admittedFireWindow).
    action: { actionId: 'action_burst' },
    combatDoctrine: { fireWindow: true, doctrineId: 'interceptor_flyby', phase: 'strike' },
  };
}
