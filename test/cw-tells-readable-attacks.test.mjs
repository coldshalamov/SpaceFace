// CW-TELLS — every attack readable before it lands (INV-21 items 3 and 5).
//
// Item 3: the tell clock holds the design's 0.6 s floor (design/overhaul/03_COMBAT.md §9),
// every doctrine that publishes an engine_flare attackLine paints its committed lane (not
// only interceptor_flyby/brawler_commit), every live attack cue kind lands a HUD chip, and a
// pack never paints a wall of wedges (nearest N, corridors first).
//
// Item 5: the Enemy Mind's facts become player-facing tells — a pure mapper decides which
// verbs speak, the HUD chips them, the presentation orchestrator emits one cue per
// player-aimed decision, and a seeded 4-ship wing produces flank/bait/punish reads within
// 20 s. Non-fodder Swarm elites may run the mind; fodder, sheet-less bosses and specialist
// hulls stay held.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';

import {
  CombatDoctrineId,
  CombatDoctrineRuntime,
  DOCTRINE_TELEGRAPH_TICKS,
  SWARM_TELL_FLOOR_TICKS,
} from '../src/ai/combatDoctrine.js';
import { committedAttackLaneReceipt } from '../src/render/vfx/actionEventRecipes.js';
import { ActionVfx } from '../src/render/actionVfx.js';
import { createTacticalAISystem } from '../src/systems/tacticalAI.js';
import { doctrineTellKind } from '../src/ui/hud.js';
import { TELEGRAPH_CUE_TICKS } from '../src/ui/threatHalo.js';
import {
  COMBAT_TELEGRAPH_FLOOR_TICKS,
  grammarForDoctrine,
  validateCombatChoreography,
} from '../src/presentation/combatChoreography.js';
import { enemyMindTell } from '../src/presentation/enemyMindTells.js';
import { getPresentationRecipe, validatePresentationRecipes } from '../src/presentation/cueRecipes.js';
import { presentationOrchestrator } from '../src/systems/presentationOrchestrator.js';
import {
  enemyMindDirectiveInput,
  swarmEliteMindHull,
  SPECIALIST_DOCTRINES,
} from '../src/ai/enemyMind/adapter.js';
import { createEnemyMindPort } from '../src/ai/enemyMind/port.js';
import { createEnemyMindState } from '../src/ai/enemyMind/runtime.js';
import { ContactKind } from '../src/ai/contracts.js';

const TICK_MS = 1000 / 60;

// ═══ Item 3 — the tell clock ═════════════════════════════════════════════════════════════

test('CW-TELLS 3: the tell clock reads the design\'s 0.6 s floor in every owner', () => {
  // The owner's sentence (03_COMBAT §9): every attack telegraphs ≥ 0.6 s. One clock, four
  // owners — the doctrine beat, the Swarm floor, the halo cue and the choreography stage.
  assert.equal(DOCTRINE_TELEGRAPH_TICKS, 36, 'the doctrine beat is 36 fixed ticks (0.6 s)');
  assert.equal(SWARM_TELL_FLOOR_TICKS, 36, 'the Swarm floor is the same 0.6 s');
  assert.equal(TELEGRAPH_CUE_TICKS, DOCTRINE_TELEGRAPH_TICKS, 'the halo cue reads the doctrine clock');
  assert.equal(COMBAT_TELEGRAPH_FLOOR_TICKS, DOCTRINE_TELEGRAPH_TICKS,
    'the choreography telegraph stage reads the same floor');
  assert.equal(Math.round(DOCTRINE_TELEGRAPH_TICKS * TICK_MS), 600);
  const choreography = validateCombatChoreography();
  assert.equal(choreography.ok, true, `choreography issues: ${choreography.issues.join('; ')}`);
  for (const doctrineId of ['interceptor_flyby', 'brawler_commit', 'detonator_run']) {
    assert.equal(grammarForDoctrine(doctrineId).telegraphTicks, 36,
      `${doctrineId} telegraph stage holds the 0.6 s floor`);
  }
});

test('CW-TELLS 3: the adventure doctrine machine holds the flare for the full 36-tick beat', () => {
  const contact = (x = 400) => ({
    id: 1, kind: ContactKind.SHIP, alive: true, valid: true, visible: true, ageTicks: 0,
    hostile: true, confidence: 1, threat: 0.9, pos: { x, z: 0 }, vel: { x: 0, z: 0 },
    operationalMassBand: 'medium', mobilityBand: 'high', cargoBand: 'empty',
    tetherabilityBand: 'good', tags: [],
  });
  const perceive = () => ({
    self: {
      id: 2, team: 1, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
      combatDoctrineId: 'interceptor_flyby',
      activity: { kind: 'attack_run', reason: 'cw_tells', anchor: { x: 0, z: 0 }, leashRadius: 2600, preferredRange: 180, startedTick: 0 },
      roe: 'weapons_free',
    },
    contacts: [contact()], events: [],
  });
  const directive = Object.freeze({
    tick: 0, squadId: 'cw', memberId: 2, role: 'striker', tactic: 'standoff_focus',
    focusTargetId: 1,
    objective: Object.freeze({ kind: 'focus', targetId: 1, reason: 'cw_tells' }),
    formation: null, order: null, authority: null, roe: 'weapons_free',
  });
  const runtime = new CombatDoctrineRuntime({ seed: 47 });
  const flare = runtime.update({
    tick: 0, entityId: 'wasp', doctrineId: CombatDoctrineId.INTERCEPTOR_FLYBY,
    perception: perceive(), directive,
  });
  assert.equal(flare.phase, 'engine_flare');
  assert.equal(flare.telegraph.durationTicks, 36);
  const at35 = runtime.update({
    tick: 35, entityId: 'wasp', doctrineId: CombatDoctrineId.INTERCEPTOR_FLYBY,
    perception: perceive(), directive,
  });
  assert.equal(at35.phase, 'engine_flare', 'the cue is still up one tick before the floor');
  const at36 = runtime.update({
    tick: 36, entityId: 'wasp', doctrineId: CombatDoctrineId.INTERCEPTOR_FLYBY,
    perception: perceive(), directive,
  });
  assert.equal(at36.phase, 'strike', 'the pass commits exactly at the 0.6 s floor');
});

// ═══ Item 3 — every live attack cue kind lands a HUD chip ═════════════════════════════════

// The kinds the action VFX whitelist resolves (src/render/vfx/actionEventRecipes.js) plus the
// swarm sheet's pack_call. attackRun/alphaStrike are legacy-compat kinds whose writer was
// deleted with the old AI module — no live emitter, so they stay chip-less by design.
const LIVE_ATTACK_CUE_KINDS = Object.freeze([
  'engine_flare', 'attach_spool', 'weapon_charge', 'detonator_fuse', 'shield_lance',
  'wake_mines', 'field_spool', 'pd_curtain', 'sensor_ghost', 'broadside_charge',
  'swarmer_vent', 'broadside_desperation', 'pirate_stalk', 'scan_sweep',
  'return_fire_warning', 'furnace_preheat', 'mothlight_iris', 'lawful_interdict',
  'pack_call',
]);

test('CW-TELLS 3: every live attack cue kind maps to a HUD chip', () => {
  for (const kind of LIVE_ATTACK_CUE_KINDS) {
    const tellId = doctrineTellKind({ kind });
    assert.ok(tellId, `cue kind "${kind}" must land a HUD tell chip`);
    const hint = doctrineTellHintFor(tellId);
    assert.ok(hint, `tell ${tellId} must carry a player decision sentence`);
  }
  // The receipt's own probe: the two named gaps close.
  assert.equal(doctrineTellKind({ kind: 'broadside_charge', doctrineId: 'capital_broadside' }), 'BROADSIDE');
  assert.equal(doctrineTellKind({ kind: 'engine_flare', doctrineId: 'swarm_pack' }), 'FLYBY',
    'the most common Swarm cue keeps its FLYBY chip');
});

// doctrineTellHintFor reads the hint table through the same source the HUD ships — the tell
// id must exist in DOCTRINE_TELL_HINT. The HUD module keeps the table module-private, so the
// source is checked once here (the same auditable-source pattern as m1-player-tell-hud).
const hudSource = readFileSync(new URL('../src/ui/hud.js', import.meta.url), 'utf8');
function doctrineTellHintFor(tellId) {
  const match = hudSource.match(new RegExp(`^  ${tellId}: '([^']+)'`, 'm'));
  return match ? match[1] : null;
}

// ═══ Item 3 — every engine_flare doctrine paints its committed lane ═══════════════════════

function laneFixture({ doctrineId = 'swarm_pack', tick = 60, durationTicks = 36 } = {}) {
  const attacker = { id: 2, occupantGeneration: 7, type: 'ship', alive: true,
    pos: { x: 20, z: 30 }, vel: { x: 0, z: 0 }, rot: 0.25, radius: 10, data: {} };
  const player = { id: 1, occupantGeneration: 3, type: 'ship', alive: true,
    pos: { x: 250, z: 30 }, vel: { x: 0, z: 0 }, rot: 0, radius: 8, data: {} };
  const state = { tick, simTime: tick / 60, playerId: 1,
    entities: new Map([[1, player], [2, attacker]]), settings: { video: {} } };
  // The exact shape tacticalAI ships for a non-corridor doctrine: attackLine, no aimCommit,
  // no generations (tacticalAI adds those only for interceptor_flyby/brawler_commit).
  const cue = { entityId: 2, targetId: 1, doctrineId, phase: 'engine_flare', kind: 'engine_flare',
    tick, durationTicks, bossStage: 0, turretEdge: 0,
    attackLine: { origin: { x: 20, z: 30 }, heading: 0.25, dir: { x: Math.cos(0.25), z: Math.sin(0.25) },
      range: 480, halfWidth: 32 } };
  return { state, attacker, player, cue };
}

function laneRows(owner) {
  const kind = owner.batch.attributes[1];
  const rows = [];
  for (let i = 0; i < owner.batch.count; i++) if (kind.getX(i) === 7) rows.push(i);
  return rows;
}

test('CW-TELLS 3: a swarm_pack engine-flare telegraph carries a validated committed lane', () => {
  const { state, cue } = laneFixture({});
  const lane = committedAttackLaneReceipt('ai:telegraph', cue, state);
  assert.ok(lane, 'the same payload the renderer refused before must resolve now');
  assert.equal(lane.aimCommit, null, 'a non-corridor doctrine has no frozen fire solution');
  assert.equal(lane.bearing, 0.25, 'the lane is the telegraph\'s own attackLine heading');
  assert.equal(lane.range, 480);
  assert.ok(Math.abs(lane.capRad - Math.atan2(32, 480)) < 1e-12,
    'the wedge is the line\'s own angular half-width');
  assert.equal(lane.untilTick, cue.tick + 36, 'the lane lives the cue window it promised');
  assert.equal(lane.sourceGeneration, 7);
  assert.equal(lane.targetGeneration, 3);
  // Fail-closed stays fail-closed: no line, dead source, dead target, junk geometry.
  assert.equal(committedAttackLaneReceipt('ai:telegraph', { ...cue, attackLine: null }, state), null);
  assert.equal(committedAttackLaneReceipt('ai:telegraph', { ...cue, kind: 'weapon_charge' }, state), null);
  const deadSource = laneFixture({});
  deadSource.attacker.alive = false;
  assert.equal(committedAttackLaneReceipt('ai:telegraph', cue, deadSource.state), null);
  const deadTarget = laneFixture({});
  deadTarget.player.alive = false;
  assert.equal(committedAttackLaneReceipt('ai:telegraph', cue, deadTarget.state), null);
  const thinLine = laneFixture({});
  assert.equal(committedAttackLaneReceipt('ai:telegraph',
    { ...cue, attackLine: { ...cue.attackLine, halfWidth: 0 } }, thinLine.state), null);
});

test('CW-TELLS 3: the corridor receipt keeps the interceptor/brawler contract unchanged', () => {
  const { state, cue } = laneFixture({ doctrineId: 'interceptor_flyby' });
  const corridorCue = { ...cue, sourceGeneration: 7, targetGeneration: 3,
    aimCommit: { bearing: 0.25, capRad: 0.2, untilTick: 330 } };
  const lane = committedAttackLaneReceipt('ai:telegraph', corridorCue, state);
  assert.ok(lane, 'the frozen-solution path still resolves');
  assert.equal(lane.aimCommit.capRad, 0.2);
  assert.equal(lane.untilTick, 330);
  assert.equal(committedAttackLaneReceipt('ai:telegraph', { ...corridorCue, sourceGeneration: 8 }, state), null,
    'a recycled shooter cannot paint the old corridor');
  assert.equal(committedAttackLaneReceipt('ai:telegraph', { ...corridorCue, aimCommit: null }, state), null,
    'the corridor doctrines still require their stamped fire solution');
});

test('CW-TELLS 3: the production stack emits a lane and a FLYBY chip for a swarm_pack flare', () => {
  const { state, attacker, player } = laneFixture({});
  const events = [];
  state.meta = { seed: 47 };
  state.player = { heat: 0 };
  state.combat = { trace: { events: [] } };
  attacker.team = 1;
  attacker.data = { ai: {
    passive: false, lawful: false, forcePlayerTarget: true, hostileTeams: [2],
    motive: 'cargo_extortion', engagementTrigger: 'explicit_refusal',
    zoneId: 'zone_cw_tells', approachTelegraph: 'engine_flare',
    combatDoctrineId: CombatDoctrineId.SWARM_PACK,
    activity: { kind: 'attack_run', reason: 'cw_tells', anchor: { x: 0, z: 0 },
      leashRadius: 2600, preferredRange: 180, startedTick: 0 },
    roe: 'weapons_free',
  }, intent: {}, weapons: [{ projSpeed: 420 }] };
  player.team = 2;
  const activity = attacker.data.ai.activity;
  const tactical = createTacticalAISystem({ seed: 47, config: { trace: { enabled: false } },
    sensors: { frameFor(id, tick) {
      const self = state.entities.get(id);
      return { tick, self: { id, team: 1, pos: self.pos, vel: { x: 0, z: 0 }, rot: self.rot,
        radius: 12, hullFraction: 1, energyFraction: 1, heatFraction: 0, disabled: false,
        tethered: false, capabilities: ['drive', 'sensor', 'weapon'], subsystemFractions: {},
        activity, roe: 'weapons_free', combatDoctrineId: CombatDoctrineId.SWARM_PACK },
        contacts: [{ id: 1, kind: 'ship', team: 2, classification: 'live_hostile',
          pos: player.pos, vel: player.vel, radius: 12, confidence: 1, threat: 0.9,
          hostile: true, alive: true, valid: true, visible: true, tags: ['armed'] }],
        events: [] };
    } },
    roster: { listSquads() {
      return [{ id: 'cw_fixture', doctrine: 'scavenger', faction: 'fixture', formation: 'wedge',
        members: [{ id: 2, capabilities: ['drive', 'sensor', 'weapon'],
          combatDoctrineId: CombatDoctrineId.SWARM_PACK }] }];
    } },
    maneuver: { request() { return true; } },
    actionPortFactory: () => ({ list: () => [{ id: 'action_burst', tags: ['attack'], range: 700,
      preferredRange: 220, targetKinds: ['ship'] }], canStart: () => ({ ok: true }),
      start: () => ({}), status: () => 'running', interrupt: () => true }) });
  const out = new ActionVfx(new THREE.Scene());
  const bus = { emit(name, p) { events.push({ name, p }); out.emit(name, p, state); } };
  try {
    state.tick = 0; state.simTime = 0;
    tactical.init({ state, bus, helpers: {} });
    tactical.update(1 / 60, state);
    const sent = events.find((e) => e.name === 'ai:telegraph' && e.p.entityId === 2);
    assert.ok(sent, 'the production decision emits the swarm_pack cue');
    assert.equal(sent.p.kind, 'engine_flare');
    assert.equal(sent.p.doctrineId, 'swarm_pack');
    assert.ok(sent.p.attackLine, 'the payload publishes a real attack line');
    assert.equal(sent.p.aimCommit, undefined, 'no corridor stamp for a non-corridor doctrine');
    assert.equal(committedAttackLaneReceipt('ai:telegraph', sent.p, state).aimCommit, null,
      'the receipt resolves the lane from the payload the stack actually ships');
    assert.equal(doctrineTellKind(sent.p), 'FLYBY', 'the HUD chip the cue already promised');
    state.tick = 1; state.simTime = 1 / 60;
    out.update(state);
    assert.ok(laneRows(out).length >= 1, 'the pooled geometry carries the warned lane');
  } finally {
    out.dispose();
  }
});

test('CW-TELLS 3: a corridor-less lane lives its cue window and cancels on an abort phase', () => {
  const { state, cue } = laneFixture({});
  const out = new ActionVfx(new THREE.Scene());
  try {
    assert.equal(out.emit('ai:telegraph', cue, state), true);
    state.tick = 61; state.simTime = 61 / 60; out.update(state);
    assert.equal(laneRows(out).length, 1, 'the lane draws for its cue window');
    // The strike beat keeps the promise up; the pass itself is the read once it flies.
    out.emit('ai:doctrinePhase', { entityId: 2, targetId: 1, doctrineId: 'swarm_pack',
      phase: 'strike', attackLine: cue.attackLine, tick: 96 }, state);
    state.tick = 96; state.simTime = 96 / 60; out.update(state);
    assert.equal(laneRows(out).length, 1, 'the attack beat keeps the announced lane');
    // Any other phase (abort, egress, cancellation) kills it immediately.
    out.emit('ai:doctrinePhase', { entityId: 2, targetId: 1, doctrineId: 'swarm_pack',
      phase: 'extend', attackLine: null, tick: 100 }, state);
    state.tick = 100; state.simTime = 100 / 60; out.update(state);
    assert.equal(laneRows(out).length, 0, 'an aborted run cancels its lane at once');
    // Without a phase receipt, the cue window still retires the wedge on its own clock.
    const fresh = laneFixture({ tick: 200 });
    out.emit('ai:telegraph', fresh.cue, fresh.state);
    fresh.state.tick = 237; fresh.state.simTime = 237 / 60; out.update(fresh.state);
    assert.equal(laneRows(out).length, 0, 'the lane dies with its own untilTick');
  } finally {
    out.dispose();
  }
});

test('CW-TELLS 3: a pack never paints a wall of wedges — nearest N draw, corridors first', () => {
  const tick = 60;
  const state = { tick, simTime: tick / 60, playerId: 1, settings: { video: {} },
    entities: new Map() };
  const player = { id: 1, occupantGeneration: 3, type: 'ship', alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 8, data: {} };
  state.entities.set(1, player);
  const attackers = [];
  for (let index = 0; index < 6; index++) {
    const attacker = { id: 10 + index, occupantGeneration: 20 + index, type: 'ship', alive: true,
      pos: { x: 100 + index * 150, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 10, data: {} };
    state.entities.set(attacker.id, attacker);
    attackers.push(attacker);
  }
  const cueFor = (attacker, cueTick = tick) => ({ entityId: attacker.id, targetId: 1, doctrineId: 'swarm_pack',
    phase: 'engine_flare', kind: 'engine_flare', tick: cueTick, durationTicks: 36, bossStage: 0, turretEdge: 0,
    attackLine: { origin: { x: attacker.pos.x, z: 0 }, heading: Math.PI, dir: { x: -1, z: 0 },
      range: 480, halfWidth: 32 } });
  const out = new ActionVfx(new THREE.Scene());
  try {
    for (const attacker of attackers) assert.equal(out.emit('ai:telegraph', cueFor(attacker), state), true);
    state.tick = tick + 1; state.simTime = state.tick / 60;
    out.update(state);
    const drawn = laneRows(out);
    assert.equal(drawn.length, 4, 'six simultaneous pack lanes draw only the nearest four');
    // Nearest-first: the closest attackers keep their wedges, the far wall does not paint.
    const origins = drawn.map((row) => out.batch.attributes[0].getX(row)).sort((a, b) => a - b);
    for (let index = 0; index < 4; index++) {
      assert.ok(Math.abs(origins[index] - (100 + index * 150)) < 1e-6,
        'the admitted lanes are the player-nearest');
    }

    // A frozen fire corridor (aimCommit) is never displaced by pack traffic.
    const corridorTick = 400;
    const corridorState = { tick: corridorTick, simTime: corridorTick / 60, playerId: 1, settings: { video: {} },
      entities: new Map(state.entities) };
    const distantPack = attackers.slice(0, 5);
    for (const attacker of distantPack) {
      assert.equal(out.emit('ai:telegraph', cueFor(attacker, corridorTick), corridorState), true);
    }
    const interceptor = { id: 2, occupantGeneration: 7, type: 'ship', alive: true,
      pos: { x: 4000, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 10, data: {} };
    corridorState.entities.set(2, interceptor);
    const corridorCue = { entityId: 2, targetId: 1, doctrineId: 'interceptor_flyby',
      phase: 'engine_flare', kind: 'engine_flare', tick: corridorTick, durationTicks: 36,
      sourceGeneration: 7, targetGeneration: 3,
      attackLine: { origin: { x: 4000, z: 0 }, heading: Math.PI, dir: { x: -1, z: 0 }, range: 480, halfWidth: 32 },
      aimCommit: { bearing: Math.PI, capRad: 0.2, untilTick: 700 } };
    assert.equal(out.emit('ai:telegraph', corridorCue, corridorState), true);
    corridorState.tick = corridorTick + 1; corridorState.simTime = corridorState.tick / 60;
    out.update(corridorState);
    const rows = laneRows(out);
    assert.equal(rows.length, 4, 'one corridor plus the nearest three pack lanes');
    const hasOrigin = (x) => rows.some((row) => Math.abs(out.batch.attributes[0].getX(row) - x) < 1e-6);
    assert.ok(hasOrigin(4000), 'the far corridor always draws');
    assert.ok(hasOrigin(100) && hasOrigin(250) && hasOrigin(400),
      'the remaining budget goes to the nearest pack lanes');
    assert.ok(!hasOrigin(550) && !hasOrigin(700), 'the far pack wall does not paint');
  } finally {
    out.dispose();
  }
});

// ═══ Item 5 — the Enemy Mind becomes legible ══════════════════════════════════════════════

test('CW-TELLS 5: the mind\'s facts map to distinct tells through the pure mapper', () => {
  const chip = (fact) => enemyMindTell(fact)?.tellId || null;
  assert.equal(chip({ kind: 'decision', verb: 'flank_left' }), 'FLANK');
  assert.equal(chip({ kind: 'decision', verb: 'flank_right' }), 'FLANK');
  assert.equal(chip({ kind: 'decision', verb: 'bait' }), 'BAIT');
  assert.equal(chip({ kind: 'decision', verb: 'punish' }), 'PUNISH');
  assert.equal(chip({ kind: 'decision', verb: 'cover' }), 'COVER');
  assert.equal(chip({ kind: 'decision', verb: 'withdraw' }), 'PEEL');
  assert.equal(chip({ kind: 'decision', verb: 'panic' }), 'PEEL');
  assert.equal(chip({ kind: 'decision', verb: 'press' }), null,
    'the ordinary state of a fight is not a tell');
  assert.equal(chip({ kind: 'decision', verb: 'regroup' }), null);
  assert.equal(chip({ kind: 'phase', verb: 'flank_left' }), null,
    'phase and pursuit-read facts stay supporting evidence');
  assert.equal(chip({ kind: 'pursuit_read', verb: 'punish' }), null);
  assert.equal(chip({ kind: 'mistake', verb: 'press', reason: 'overcommitted_under_pressure' }), 'PUNISH',
    'the readable mistake earns its exploit tell');
  assert.equal(chip({ kind: 'mistake', verb: 'press', reason: 'unknown' }), null);
  // Each tell id lands a distinct HUD chip + hint through the same family.
  for (const verb of ['flank_left', 'bait', 'punish', 'cover', 'withdraw']) {
    const tellId = chip({ kind: 'decision', verb });
    assert.equal(doctrineTellKind({ kind: 'mind_decision', verb }), tellId);
    assert.ok(tellId && doctrineTellHintFor(tellId), `the ${verb} tell carries a chip and a sentence`);
  }
  assert.equal(doctrineTellKind({ kind: 'mind_mistake', verb: 'press', reason: 'overcommitted_under_pressure' }),
    'PUNISH', 'a mind mistake rides the same chip path');
  assert.equal(new Set(['FLANK', 'BAIT', 'PUNISH', 'COVER', 'PEEL']).size, 5,
    'every surfaced verb is a distinct cue');
});

function makeBus() {
  const handlers = new Map();
  const emitted = [];
  return {
    emitted,
    on(type, fn) {
      if (!handlers.has(type)) handlers.set(type, []);
      handlers.get(type).push(fn);
      return () => {};
    },
    emit(type, payload) {
      emitted.push({ type, payload });
      for (const fn of handlers.get(type) || []) fn(payload);
    },
    cues() { return this.emitted.filter((e) => e.type === 'presentation:cue').map((e) => e.payload); },
  };
}

test('CW-TELLS 5: a player-aimed mind decision emits one combat.mind.tell cue with its sentence', () => {
  assert.ok(getPresentationRecipe('combat.mind.tell'), 'the cue family has a recipe');
  assert.equal(validatePresentationRecipes().ok, true);
  const bus = makeBus();
  const state = { tick: 100, simTime: 100 / 60, playerId: 1,
    entities: new Map([
      [1, { id: 1, pos: { x: 0, y: 0, z: 0 } }],
      [2, { id: 2, pos: { x: 220, y: 0, z: 40 }, alive: true }],
    ]) };
  presentationOrchestrator.init({ state, bus });
  const fact = { kind: 'decision', entityId: 2, targetId: 1, verb: 'flank_left',
    phase: 'tell', tick: 100, simTime: 100 / 60, sequence: 1, serial: 1, startedAt: 100 / 60 };
  assert.equal(presentationOrchestrator._onEnemyMindTell('decision', fact), true);
  const cues = bus.cues();
  assert.equal(cues.length, 1);
  assert.equal(cues[0].id, 'combat.mind.tell');
  assert.equal(cues[0].sourceEvent, 'ai:mind:decision');
  assert.equal(cues[0].sourceId, 2);
  assert.equal(cues[0].accessibilityText, 'It is sliding to your flank — a crossfire is opening.');
  assert.ok(cues[0].tags.includes('mind') && cues[0].tags.includes('FLANK'));
  // A held plan does not chatter: the same verb inside the dedupe window stays quiet.
  assert.equal(presentationOrchestrator._onEnemyMindTell('decision',
    { ...fact, sequence: 2, serial: 2, tick: 110 }), false);
  assert.equal(bus.cues().length, 1);
  // A different decision speaks at once.
  assert.equal(presentationOrchestrator._onEnemyMindTell('decision',
    { ...fact, verb: 'punish', sequence: 3, serial: 3, tick: 111 }), true);
  assert.equal(bus.cues().length, 2);
  // A mind plan aimed at an NPC is sim life, not a player tell.
  assert.equal(presentationOrchestrator._onEnemyMindTell('decision',
    { ...fact, targetId: 9, sequence: 4, serial: 4 }), false);
  // The ordinary verbs never speak.
  assert.equal(presentationOrchestrator._onEnemyMindTell('decision',
    { ...fact, verb: 'press', sequence: 5, serial: 5 }), false);
  assert.equal(bus.cues().length, 2);
});

// ── the seeded 4-ship Adventure wing ──────────────────────────────────────────────────────

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

const WING_PILOTS = Object.freeze(['p1', 'p2', 'p3', 'p4']);
const WING_SLOT = { p1: { x: 0, z: 60 }, p2: { x: -90, z: 70 }, p3: { x: 90, z: 70 }, p4: { x: 0, z: 160 } };

/**
 * A 4-pilot Adventure wing fighting one quarry. Three scripted pressure phases, each of which
 * feeds the mind a real read (deterministic fixture state, real Enemy Mind cognition):
 *   A (0..300)    — the quarry holds position and shoots at p1: targeted pressure, full support.
 *   B (300..900)  — p2 is hurt and pressed; the quarry visibly chases p2 (its contact targetId
 *                   and its velocity both say so) while p2 breaks off: the visible pursuit read
 *                   every other pilot can punish.
 *   C (900..1200) — the quarry returns its attention to p1.
 */
function wingFrame(tick, { id, hull, incoming }) {
  const phase = tick < 300 ? 'A' : tick < 900 ? 'B' : 'C';
  const quarryPos = phase === 'B'
    ? { x: -40 + Math.sin(tick / 80) * 20, z: -120 }
    : { x: Math.sin(tick / 110) * 40, z: -240 };
  const quarryVel = { x: 0, z: 0 };
  if (phase === 'B') {
    const dx = WING_SLOT.p2.x - quarryPos.x, dz = WING_SLOT.p2.z - quarryPos.z;
    const len = Math.hypot(dx, dz) || 1;
    quarryVel.x = (dx / len) * 42; quarryVel.z = (dz / len) * 42;
  }
  const quarryTarget = phase === 'B' ? 'p2' : 'p1';
  const contacts = [
    { id: 't1', kind: ContactKind.SHIP, hostile: true, alive: true, valid: true, visible: true,
      ageTicks: 0, confidence: 1, team: 0, pos: quarryPos, vel: quarryVel, targetId: quarryTarget },
  ];
  for (const other of WING_PILOTS) {
    if (other === id) continue;
    const hurt = phase === 'B' && other === 'p2';
    contacts.push({ id: other, kind: ContactKind.SHIP, hostile: false, alive: true, valid: true,
      visible: true, ageTicks: 0, confidence: 1, team: 1,
      pos: { x: WING_SLOT[other].x, z: WING_SLOT[other].z + (hurt ? Math.min(180, (tick - 300) * 0.4) : 0) },
      vel: hurt ? { x: 0, z: 24 } : { x: -4, z: 2 }, targetId: null });
  }
  if (incoming) {
    contacts.push({ id: `shot-${id}`, kind: 'projectile', hostile: true, alive: true, valid: true,
      visible: true, ageTicks: 0, confidence: 1,
      pos: { x: WING_SLOT[id].x, z: WING_SLOT[id].z + 100 }, vel: { x: 0, z: -160 }, targetId: null });
  }
  return {
    tick,
    self: { id, team: 1, pos: { x: WING_SLOT[id].x, z: WING_SLOT[id].z },
      vel: { x: -3, z: 1 }, rot: Math.PI, radius: 14,
      hullFraction: hull, energyFraction: 0.6, heatFraction: 0.25,
      disabled: false, tumbling: false, tethered: false },
    contacts, events: [],
  };
}

const WING_DIRECTIVE = Object.freeze({
  objective: Object.freeze({ kind: 'engage', targetId: 't1', targetObserved: true }),
  formation: Object.freeze({ slot: Object.freeze({ x: 0, z: 0 }),
    velocity: Object.freeze({ x: 0, z: 0 }), bound: 140 }),
});

function flyWing4(seed, seconds = 20) {
  const facts = [];
  const state = { rng: rng(seed), simTime: 0, enemyMind: createEnemyMindState() };
  const port = createEnemyMindPort({
    stateProvider: () => state,
    emit: (event, payload) => { if (payload.kind === 'decision') facts.push(payload); },
    config: { enabled: true, profile: 'crew' },
  });
  const roster = [{ id: 'wing', members: WING_PILOTS.map((id) => ({ id, alive: true, combatDoctrineId: null })) }];
  for (let tick = 1; tick <= seconds * 60; tick++) {
    state.simTime = tick / 60;
    const perceptions = new Map();
    const directives = new Map();
    const phase = tick < 300 ? 'A' : tick < 900 ? 'B' : 'C';
    for (const id of WING_PILOTS) {
      const hull = phase === 'B' && id === 'p2' ? 0.3 : 1;
      const incoming = phase === 'B' && (id === 'p1' || id === 'p2');
      perceptions.set(id, wingFrame(tick, { id, hull, incoming }));
      directives.set(id, WING_DIRECTIVE);
    }
    port.update({ tick, roster, perceptionsByEntity: perceptions, directivesByEntity: directives });
  }
  return facts;
}

test('CW-TELLS 5: a seeded 4-ship Adventure wing produces flank, bait and punish within 20 s', () => {
  const facts = flyWing4(20261119);
  assert.ok(facts.length > 20, `the wing must actually think (got ${facts.length} decisions)`);
  const verbs = new Set(facts.map((fact) => fact.verb));
  assert.ok(verbs.has('flank_left') || verbs.has('flank_right'),
    `a wingmate must read the crossfire lane (verbs: ${[...verbs].join(',')})`);
  assert.ok(verbs.has('bait'), 'a cunning pilot must offer the chase');
  assert.ok(verbs.has('punish'), 'someone must read the visible pursuit and cut across it');
  // Each surfaced read is a distinct player cue through the same chip family.
  const chips = new Set();
  for (const verb of ['flank_left', 'flank_right', 'bait', 'punish']) {
    if (!verbs.has(verb)) continue;
    const tellId = doctrineTellKind({ kind: 'mind_decision', verb });
    assert.ok(tellId, `${verb} lands a chip`);
    chips.add(tellId);
  }
  assert.deepEqual([...chips].sort(), ['BAIT', 'FLANK', 'PUNISH']);
  // Determinism: the same seed flies the same decisions.
  const again = flyWing4(20261119);
  assert.deepEqual(again.map((f) => `${f.tick}:${f.entityId}:${f.verb}`).slice(0, 40),
    facts.map((f) => `${f.tick}:${f.entityId}:${f.verb}`).slice(0, 40));
});

// ── Swarm elite admission ─────────────────────────────────────────────────────────────────

const ENGAGE_DIRECTIVE = Object.freeze({
  combatDoctrineId: 'swarm_pack',
  objective: Object.freeze({ kind: 'engage', targetId: 1, targetObserved: true }),
});

function selfPerception(overrides = {}) {
  return { self: { combatDoctrineId: 'swarm_pack', moraleImmune: true, arenaPursuit: true,
    swarmTellFloor: true, bodyDodge: true, ...overrides } };
}

test('CW-TELLS 5: non-fodder Swarm elites run the mind; fodder, bosses and specialists stay held', () => {
  // A sheet-named elite (arena pursuer with a character row above fodder) keeps its objective.
  const elite = enemyMindDirectiveInput(ENGAGE_DIRECTIVE, selfPerception());
  assert.equal(elite.objective.kind, 'engage', 'the elite runs the mind, not the hold');
  assert.equal(swarmEliteMindHull(selfPerception()), true);
  // Fodder (the sheet's fodder bit is mirrored as bodyDodge === false) stays held.
  assert.equal(swarmEliteMindHull(selfPerception({ bodyDodge: false })), false);
  assert.equal(enemyMindDirectiveInput(ENGAGE_DIRECTIVE, selfPerception({ bodyDodge: false })).objective.kind,
    'hold', 'fodder exists to be thrown — it stays a doctrine-only clock');
  // Hulls without a character row (the bosses) keep the authored hold.
  assert.equal(swarmEliteMindHull(selfPerception({ swarmTellFloor: false })), false);
  assert.equal(enemyMindDirectiveInput(ENGAGE_DIRECTIVE, selfPerception({ swarmTellFloor: false })).objective.kind,
    'hold', 'a sheet-less boss keeps its bespoke control');
  // Specialist doctrines keep their reserved control even on an elite hull. The directive's
  // assigned doctrine outranks the perception's, so the specialist case carries it there.
  const specialistDirective = { ...ENGAGE_DIRECTIVE, combatDoctrineId: 'escort_screen' };
  const specialist = enemyMindDirectiveInput(specialistDirective, selfPerception());
  assert.equal(specialist.objective.kind, 'hold',
    `specialist hulls keep their authored verbs (${[...SPECIALIST_DOCTRINES].slice(0, 3).join(', ')}…)`);
  // Adventure morale-immune hulls (no arena pursuit) are untouched by the elite cut.
  assert.equal(enemyMindDirectiveInput(ENGAGE_DIRECTIVE,
    selfPerception({ arenaPursuit: false, swarmTellFloor: false })).objective.kind, 'hold');
  // An ordinary adventure hull keeps running the mind as before.
  assert.equal(enemyMindDirectiveInput(ENGAGE_DIRECTIVE, { self: { combatDoctrineId: 'swarm_pack' } })
    .objective.kind, 'engage');
  // The hold rewrite still yields to an explicit retreat order, for everyone.
  assert.equal(enemyMindDirectiveInput(
    { ...ENGAGE_DIRECTIVE, objective: { kind: 'retreat' } }, selfPerception({ bodyDodge: false }))
    .objective.kind, 'retreat');
});
