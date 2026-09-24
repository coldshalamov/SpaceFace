import test from 'node:test';
import assert from 'node:assert/strict';

import { ENEMY_DOCTRINE_OVERRIDES } from '../src/data/combatDefs.js';
import { ContactKind, ObjectiveKind } from '../src/ai/contracts.js';
import { ActivityKind, RulesOfEngagement } from '../src/ai/doctrine.js';
import { CombatDoctrineRuntime, CombatDoctrineId } from '../src/ai/combatDoctrine.js';
import { createCombatKernel } from '../src/combat/kernel.js';
import { createCombatCatalog } from '../src/combat/runtime.js';
import { validateCombatCatalog } from '../src/combat/validate.js';
import { readCombatTrace } from '../src/combat/trace.js';

// INF-030 — the mine-layer's drop line is a real drift-bomb pass now.
//
// mine_layer_wake always staged a visible run (flank → wake_mines telegraph → mine_drop →
// disengage → reform) but the release verb never existed: mine_drop allowed a gun burst. Now
// the phase allows action_drop_bomb, whose dropBomb effect releases through the shared
// bombs.drop seam — same physical rules, same attribution, same cooldowns and world caps as
// the player's own bay. The jackal was already admitted to this doctrine by the fight-identity
// overrides; this test pins that the pilot, the phase, and the verb line up.

function perception(selfOverrides = {}, contactOverrides = {}) {
  return {
    self: {
      id: 2,
      team: 1,
      pos: { x: 0, z: 0 },
      vel: { x: 60, z: 0 },
      rot: 0,
      combatDoctrineId: CombatDoctrineId.MINE_LAYER_WAKE,
      activity: {
        kind: ActivityKind.ATTACK_RUN,
        reason: 'inf-030',
        anchor: { x: 0, z: 0 },
        leashRadius: 2600,
        preferredRange: 180,
        startedTick: 0,
      },
      roe: RulesOfEngagement.WEAPONS_FREE,
      ...selfOverrides,
    },
    contacts: [
      {
        id: 1,
        kind: ContactKind.SHIP,
        alive: true,
        valid: true,
        visible: true,
        ageTicks: 0,
        hostile: true,
        confidence: 1,
        threat: 0.8,
        pos: { x: 300, z: 0 },
        vel: { x: 0, z: 0 },
        mobilityBand: 'high',
        cargoBand: 'valuable',
        tethered: false,
        operationalMassBand: 'light',
        tetherabilityBand: 'good',
        tags: [],
        ...contactOverrides,
      },
    ],
    events: [],
  };
}

function directive() {
  return Object.freeze({
    tick: 0,
    squadId: 'fixture',
    memberId: 2,
    role: 'area_denial',
    tactic: 'seed_the_exit',
    focusTargetId: 1,
    objective: Object.freeze({ kind: ObjectiveKind.ENGAGE, targetId: 1, reason: 'fixture' }),
    formation: Object.freeze({
      kind: 'wedge', slot: Object.freeze({ x: 0, z: 0 }), velocity: Object.freeze({ x: 0, z: 0 }),
      bound: 170, breakFormation: false, breakReason: null,
    }),
  });
}

test('the wake run telegraphs, drops exactly one verb, then recovers', () => {
  const runtime = new CombatDoctrineRuntime({ seed: 47 });
  const run = (tick) => runtime.update({
    tick, entityId: 2, doctrineId: CombatDoctrineId.MINE_LAYER_WAKE,
    perception: perception(), directive: directive(),
  });
  assert.equal(run(0).phase, 'wake_cue', 'in-range flank closes into the warning immediately');
  const cue = run(1);
  assert.equal(cue.phase, 'wake_cue', 'the flank closes into the authored warning');
  assert.equal(cue.telegraph.kind, 'wake_mines');
  assert.equal(cue.allowedActionId, null, 'the warning never carries a verb');
  const drop = run(31);
  assert.equal(drop.phase, 'mine_drop', 'the telegraph releases the drop line on schedule');
  assert.equal(drop.allowedActionId, 'action_drop_bomb', 'mine_drop allows the mine verb, not guns');
  const egress = run(101);
  assert.equal(egress.phase, 'disengage', 'the line exits after its drop window');
  assert.equal(egress.allowedActionId, null, 'egress carries no verb: the recovery interval');
  let tick = 101;
  let cycled = null;
  while (tick < 3000) {
    tick += 25;
    const snapshot = run(tick);
    if (snapshot.phase === 'flank' && snapshot.cycle >= 1) { cycled = snapshot; break; }
  }
  assert.ok(cycled, 'the cycle repeats: one bomb per pass at most');
  assert.equal(cycled.allowedActionId, null, 'the fresh flank carries no verb yet');
});

test('the jackal is admitted to the wake doctrine', () => {
  assert.equal(ENEMY_DOCTRINE_OVERRIDES.mine_layer_jackal, 'mine_layer_wake');
});

test('the production catalog validates with the mine verb armed', () => {
  const catalog = createCombatCatalog();
  const def = catalog.actions.get('action_drop_bomb');
  assert.ok(def, 'the def exists');
  assert.equal(def.effects[0].type, 'dropBomb');
  assert.equal(def.effects[0].payloadId, 'bomb_goo', 'one existing payload, not a new warhead');
  const result = validateCombatCatalog(catalog);
  assert.deepEqual(result.errors, [], `catalog clean: ${result.errors.join('; ')}`);
});

function makeNpc(id, team) {
  return {
    id, type: 'ship', alive: true, team,
    pos: { x: id === 1 ? 300 : 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 14,
    mass: 58, hull: 200, hullMax: 200, cap: 240, capMax: 240,
    flags: {}, data: {},
  };
}

function makeState() {
  const player = makeNpc(1, 0);
  const npc = makeNpc(2, 1);
  return {
    tick: 0,
    simTime: 0,
    playerId: 1,
    entities: new Map([[1, player], [2, npc]]),
    entityList: [player, npc],
    combat: {},
    world: { currentSectorId: 'sector_helios_prime' },
  };
}

function makeKernel(state, bombs) {
  const bus = { on() { return () => {}; }, emit() {} };
  return createCombatKernel({
    state, bus, helpers: {},
    registry: bombs ? { get(name) { return name === 'bombs' ? bombs : null; } } : null,
  });
}

test('the kernel releases one attributed goo bomb through the shared seam', () => {
  const calls = [];
  const bombs = { drop: (owner, payloadId) => { calls.push({ ownerId: owner.id, payloadId }); return { id: 900 }; } };
  const state = makeState();
  const kernel = makeKernel(state, bombs);
  const requested = kernel.actions.requestAction({ actionId: 'action_drop_bomb', actorId: 2, targetId: 1, source: 'ai' });
  assert.equal(requested.ok, true);
  kernel.prePhysics(1 / 60);
  assert.deepEqual(calls, [{ ownerId: 2, payloadId: 'bomb_goo' }], 'one release, NPC-attributed, existing payload');
  const effects = readCombatTrace(state.combat).events.filter((e) => e.kind === 'action.effect' && e.effectType === 'dropBomb');
  assert.equal(effects.length, 1);
  assert.equal(effects[0].actorId, 2);
  // The action cooldown holds even if the phase re-enters early: one bomb per pass.
  // (Requests only queue; the cooldown rejects at advance time.)
  kernel.actions.requestAction({ actionId: 'action_drop_bomb', actorId: 2, targetId: 1, source: 'ai' });
  state.tick = 5;
  kernel.prePhysics(1 / 60);
  assert.deepEqual(calls, [{ ownerId: 2, payloadId: 'bomb_goo' }], 'no second release inside the cooldown');
  const denied = readCombatTrace(state.combat).events.filter((e) => e.kind === 'action.rejected');
  assert.equal(denied.length, 1);
  assert.ok(String(denied[0].reason).startsWith('cooldown'), `bounded, got ${denied[0].reason}`);
});

test('the verb fails closed with no bombs service', () => {
  const state = makeState();
  const kernel = makeKernel(state, null);
  kernel.actions.requestAction({ actionId: 'action_drop_bomb', actorId: 2, targetId: 1, source: 'ai' });
  kernel.prePhysics(1 / 60);
  const rejected = readCombatTrace(state.combat).events.filter((e) => e.kind === 'action.effectRejected' && e.effectType === 'dropBomb');
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].reason, 'bomb_service_unavailable');
});
