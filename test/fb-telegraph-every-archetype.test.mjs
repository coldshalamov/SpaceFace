import test from 'node:test';
import assert from 'node:assert/strict';

import { ENEMY_TYPES } from '../src/data/enemies.js';
import { TELEGRAPH_FORCE_CHANNELS, forceChannelForTelegraphKind } from '../src/data/palettes.js';
import { ADDITIONAL_ACTION_VFX_RECIPES } from '../src/render/vfx/actionEventRecipes.js';
import { telegraphWord } from '../src/systems/survivalResults.js';
import { makeEnemySpawnSpec } from '../src/systems/combat.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { swarmDoctrineStamp } from '../src/data/swarmMode.js';
import { leftoverTelegraphKind } from '../src/ui/threatHalo.js';
import { ContactKind, ObjectiveKind } from '../src/ai/contracts.js';
import { ActivityKind, RulesOfEngagement } from '../src/ai/doctrine.js';
import { CombatDoctrineRuntime } from '../src/ai/combatDoctrine.js';

// FB-016 — every enemy archetype carries a telegraph block so intent is readable before the
// shot. The block is {bark, line, cue}; the cue must resolve in the presentation recipes
// (the action-VFX receipt whitelist AND the threat-halo force-channel map), and every cue
// names the physical problem the hull poses — never a generic "enemy approaching".

const TELEGRAPH_VFX_KINDS = Object.keys(ADDITIONAL_ACTION_VFX_RECIPES['ai:telegraph'].variants);

test('FB-016: every roster row carries a telegraph block with bark, line and cue', () => {
  assert.equal(ENEMY_TYPES.length, 19, 'roster size pin — extend this test when rows are added');
  for (const def of ENEMY_TYPES) {
    const t = def.telegraph;
    assert.ok(t && typeof t === 'object', `${def.id} has no telegraph block`);
    assert.ok(typeof t.bark === 'string' && t.bark.length > 0, `${def.id} telegraph has no bark`);
    assert.ok(typeof t.line === 'string' && t.line.length > 20,
      `${def.id} telegraph line must name the physical problem, not a token`);
    assert.ok(typeof t.cue === 'string' && t.cue.length > 0, `${def.id} telegraph has no cue`);
  }
});

test('FB-016: every authored cue resolves in the presentation recipes', () => {
  for (const def of ENEMY_TYPES) {
    const cue = def.telegraph.cue;
    assert.ok(TELEGRAPH_VFX_KINDS.includes(cue),
      `${def.id} cue '${cue}' is not in the ai:telegraph VFX whitelist — it would emit to nothing`);
    assert.ok(forceChannelForTelegraphKind(cue) !== null,
      `${def.id} cue '${cue}' has no force channel — the halo cannot announce it`);
    assert.notEqual(telegraphWord(cue), 'Incoming fire',
      `${def.id} cue '${cue}' falls back to the generic death-report word`);
  }
});

test('FB-016: cues are not one-size-fits-all — the roster speaks several distinct problems', () => {
  const cues = new Set(ENEMY_TYPES.map((def) => def.telegraph.cue));
  assert.ok(cues.size >= 6, `only ${cues.size} distinct cues across 19 rows — reuse is not readability`);
});

test('FB-016: combat.js copies the telegraph block and cue onto every spawn path', () => {
  for (const def of ENEMY_TYPES) {
    const spec = makeEnemySpawnSpec(def.id, 2, { x: 0, z: 0 });
    assert.ok(spec.data.telegraph, `${def.id} spawn spec drops the telegraph block`);
    assert.equal(spec.data.telegraph.cue, def.telegraph.cue, `${def.id} cue survives spawn`);
    assert.equal(spec.data.telegraph.line, def.telegraph.line, `${def.id} line survives spawn`);
    assert.equal(spec.data.ai.approachTelegraph, def.telegraph.cue,
      `${def.id} cue must reach ai.approachTelegraph so ambientPredation announces it`);
  }
});

test('FB-016: spawned cues keep their channel mapping on the entity (halo + VFX consumers)', () => {
  for (const def of ENEMY_TYPES) {
    const spec = makeEnemySpawnSpec(def.id, 2, { x: 0, z: 0 });
    const kind = spec.data.ai.approachTelegraph;
    assert.ok(Object.hasOwn(TELEGRAPH_FORCE_CHANNELS, kind),
      `${def.id} spawned approach telegraph '${kind}' has no channel`);
  }
});

test('FB-016: seed-4242 Crucible wave 3 emits >=3 distinct ai:telegraph payloads', () => {
  const plan = planWave({ seed: 4242, arenaId: 'helios_core', wave: 3 });
  assert.ok(plan && Array.isArray(plan.schedule) && plan.schedule.length >= 2,
    'the seeded wave 3 plan must schedule real spawn groups');
  // Materialize exactly what the wave scheduler fields — same spawn-spec path + doctrine stamp
  // waveMaterialization runs.
  const roster = [];
  for (const entry of plan.schedule) {
    for (let i = 0; i < entry.count; i++) {
      const spec = makeEnemySpawnSpec(entry.enemyId, 2, { x: 520 + roster.length * 24, z: 0 });
      const stamp = swarmDoctrineStamp(entry.enemyId, { swarm: false, champion: false });
      if (stamp) spec.data.ai.combatDoctrineId = stamp;
      roster.push({ id: `wave3_${spec.data.enemyId}_${roster.length}`, spec });
    }
  }
  assert.ok(roster.length >= 3, 'wave 3 must field at least three bodies');

  // Each hull's ambient approach telegraph is an ai:telegraph emission (ambientPredation
  // publishes it when the run begins); each doctrine charge telegraph is a second. The
  // payload the feed receives is (entityId, kind) — distinctness guards feed dedup collapse.
  const payloads = new Set();
  const kinds = new Set();
  const player = shipContact(1, { x: 400, mobilityBand: 'low', threat: 0.9 });
  for (const { id, spec } of roster) {
    if (spec.data.ai.approachTelegraph) {
      payloads.add(`${id}|${spec.data.ai.approachTelegraph}`);
      kinds.add(spec.data.ai.approachTelegraph);
    }
    const runtime = new CombatDoctrineRuntime({ seed: 4242 });
    for (let tick = 0; tick <= 400; tick += 1) {
      const result = runtime.update({
        tick, entityId: id, doctrineId: spec.data.ai.combatDoctrineId,
        perception: perception([player], { id }), directive: baseDirective(),
      });
      if (result.telegraphStarted && result.telegraph) {
        payloads.add(`${id}|${result.telegraph.kind}`);
        kinds.add(result.telegraph.kind);
      }
    }
  }
  assert.ok(payloads.size >= 3,
    `wave 3 must put at least three distinct telegraph payloads on the feed (got ${payloads.size})`);
  assert.ok(kinds.size >= 2,
    `wave 3's roster must speak more than one warning (got ${[...kinds].join(',')})`);
  for (const kind of kinds) {
    assert.equal(leftoverTelegraphKind({ kind }), kind,
      `wave-3 kind '${kind}' must paint on the threat halo`);
    assert.ok(TELEGRAPH_VFX_KINDS.includes(kind), `wave-3 kind '${kind}' must resolve in VFX`);
  }
});

function perception(contactsValue, selfOverrides = {}) {
  return {
    self: {
      ...selfOverrides,
      id: selfOverrides.id ?? 2,
      team: 1,
      pos: { x: selfOverrides.x ?? 0, z: selfOverrides.z ?? 0 },
      vel: { x: selfOverrides.vx ?? 0, z: selfOverrides.vz ?? 0 },
      rot: 0,
      combatDoctrineId: selfOverrides.combatDoctrineId || null,
      activity: {
        kind: selfOverrides.activity || ActivityKind.ATTACK_RUN,
        reason: 'fb016_wave3',
        anchor: { x: 0, z: 0 },
        leashRadius: 2600,
        preferredRange: 180,
        startedTick: 0,
      },
      roe: selfOverrides.roe || RulesOfEngagement.WEAPONS_FREE,
    },
    contacts: contactsValue,
    events: [],
  };
}

function shipContact(id, values = {}) {
  return {
    id,
    kind: ContactKind.SHIP,
    alive: true,
    valid: true,
    visible: true,
    ageTicks: 0,
    hostile: true,
    confidence: 1,
    threat: values.threat ?? 0.7,
    pos: { x: values.x ?? 400, z: values.z ?? 0 },
    vel: { x: 0, z: 0 },
    tethered: false,
    operationalMassBand: 'medium',
    mobilityBand: values.mobilityBand || 'medium',
    cargoBand: 'empty',
    tetherabilityBand: 'good',
    tags: [],
  };
}

function baseDirective() {
  return Object.freeze({
    tick: 0,
    squadId: 'fb016',
    memberId: 2,
    role: 'striker',
    tactic: 'standoff_focus',
    focusTargetId: 1,
    objective: Object.freeze({ kind: ObjectiveKind.FOCUS, targetId: 1, reason: 'fb016' }),
    formation: Object.freeze({
      kind: 'wedge', slot: Object.freeze({ x: 0, z: 0 }), velocity: Object.freeze({ x: 0, z: 0 }),
      bound: 170, breakFormation: false, breakReason: null,
    }),
  });
}
