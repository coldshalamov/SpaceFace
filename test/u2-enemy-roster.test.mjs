// U2 enemy-roster (asset-experience-program §5): the assassin and duel champion doctrine
// machines, their enemy defs, and the gated encounters that place them. The prison transfer
// reuses the convoy/escort/predation seams — the warden is an escort_screen custody bound to
// the barge, and the barge is a lawful carrier whose crack is a crime.
import assert from 'node:assert/strict';
import test from 'node:test';

import { ContactKind, ObjectiveKind } from '../src/ai/contracts.js';
import { ActivityKind, RulesOfEngagement } from '../src/ai/doctrine.js';
import { CombatDoctrineId, CombatDoctrineRuntime } from '../src/ai/combatDoctrine.js';
import { ENEMY_TYPES } from '../src/data/enemies.js';
import { ENCOUNTERS } from '../src/data/encounters/index.generated.js';
import { makeEnemySpawnSpec } from '../src/systems/combat.js';

const ENEMY = new Map(ENEMY_TYPES.map((entry) => [entry.id, entry]));

test('u2 roster defs: typed identities, honest carriers, spawnable rows', () => {
  for (const id of ['enemy_assassin', 'enemy_duel_champion', 'npc_prison_barge', 'prison_warden_escort']) {
    assert(ENEMY.get(id), `${id} must be registered in ENEMY_TYPES`);
  }
  assert.equal(ENEMY.get('enemy_assassin').combatDoctrineId, 'assassin_mark');
  assert.equal(ENEMY.get('enemy_assassin').telegraph.cue, 'assassin_mark');
  assert.equal(ENEMY.get('enemy_assassin').rareSpecialist, true);
  assert.equal(ENEMY.get('enemy_duel_champion').combatDoctrineId, 'duel_champion');
  assert.equal(ENEMY.get('enemy_duel_champion').telegraph.cue, 'duel_challenge');
  // The escort is a lawful custody screen — the same machine the convoy wardens fly, SCN-bound.
  assert.equal(ENEMY.get('prison_warden_escort').combatDoctrineId, 'escort_screen');
  assert.equal(ENEMY.get('prison_warden_escort').factionLawful, true);
  assert.equal(ENEMY.get('prison_warden_escort').factionId, 'faction_scn');
  // The barge is a slow lawful carrier: no doctrine, and cracking it is a crime.
  const barge = ENEMY.get('npc_prison_barge');
  assert.equal(barge.combatDoctrineId, null);
  assert.equal(barge.illegalToKill, true);
  assert.equal(barge.factionId, 'faction_scn');
  assert.equal(barge.aiArchetype, 'fleeing_trader');
  // Every row spawns through the same path the director uses.
  for (const id of ['enemy_assassin', 'enemy_duel_champion', 'npc_prison_barge', 'prison_warden_escort']) {
    const def = ENEMY.get(id);
    const spec = makeEnemySpawnSpec(id, def.levelRange[0], { x: 20, z: -5 });
    assert(spec && spec.data, `${id} must spawn a live spec`);
    assert.equal(spec.data.ai.combatDoctrineId ?? null, def.combatDoctrineId ?? null, `${id} spawn preserves doctrine id`);
  }
});

test('assassin_mark: shadows cold, cues once, spends a single window, withdraws', () => {
  const runtime = new CombatDoctrineRuntime({ seed: 41 });
  const entityId = 'u2_assassin';
  const frame = (x) => perception([shipContact(1, { x, mobilityBand: 'high', threat: 0.8 })], {
    id: entityId, combatDoctrineId: CombatDoctrineId.ASSASSIN_MARK,
  });
  const update = (tick, x) => runtime.update({
    tick, entityId, doctrineId: CombatDoctrineId.ASSASSIN_MARK,
    perception: frame(x), directive: baseDirective(),
  });

  // Outside the shadow band the stalk holds: no cue, no fire.
  let r = update(0, 700);
  assert.equal(r.phase, 'shadow');
  assert.equal(r.fireWindow, false, 'the stalk never fires');
  r = update(40, 700);
  assert.equal(r.phase, 'shadow', 'a patient assassin holds off the lock band');
  assert.equal(r.fireWindow, false);

  // Inside the band the mark locks — the cue telegraphs once.
  r = update(60, 500);
  assert.equal(r.phase, 'mark_cue');
  assert.equal(r.telegraph && r.telegraph.kind, 'assassin_mark');
  assert.equal(r.fireWindow, false, 'the cue is still cold');

  // Thirty telegraph ticks later the single committed pass opens.
  r = update(90, 500);
  assert.equal(r.phase, 'strike');
  assert.equal(r.fireWindow, true, 'strike is the only gun window the doctrine owns');
  assert.equal(r.allowedActionId, 'action_burst');

  // The pass closes into its band; its 60-tick clock starts there, not at cue entry.
  r = update(110, 150);
  assert.equal(r.phase, 'strike');
  r = update(170, 150);
  assert.equal(r.phase, 'withdraw', 'the mark resolves and the hull leaves');
  assert.equal(r.fireWindow, false, 'the assassin never flies a second pass on the mark');

  // The withdraw leg ends on the clock when the mark keeps closing; reform re-marks fresh.
  r = update(320, 150);
  assert.equal(r.phase, 'reform');
  r = update(365, 150);
  assert.equal(r.phase, 'shadow', 'a still-living target can only be re-marked on a new cycle');
  assert.equal(r.cycle, 1, 're-marking is a fresh contract, not a wheel-back');
});

test('duel_champion: squares to the ring, announces, bounded exchanges, peels every pass', () => {
  const runtime = new CombatDoctrineRuntime({ seed: 43 });
  const entityId = 'u2_champion';
  const frame = (x) => perception([shipContact(1, { x, operationalMassBand: 'heavy', threat: 0.9 })], {
    id: entityId, combatDoctrineId: CombatDoctrineId.DUEL_CHAMPION,
  });
  const update = (tick, x) => runtime.update({
    tick, entityId, doctrineId: CombatDoctrineId.DUEL_CHAMPION,
    perception: frame(x), directive: baseDirective(),
  });

  // Already inside the ring the square resolves immediately into the announced challenge.
  let r = update(0, 280);
  assert.equal(r.phase, 'challenge_cue');
  assert.equal(r.telegraph && r.telegraph.kind, 'duel_challenge');
  assert.equal(r.fireWindow, false, 'the challenge is not a gun');

  r = update(30, 280);
  assert.equal(r.phase, 'exchange');
  assert.equal(r.fireWindow, true, 'the exchange is the only bounded fire beat');
  assert.equal(r.allowedActionId, 'action_burst');

  // The exchange's clock arms inside its band; the spend ends in the authored peel, not a grind.
  r = update(60, 180);
  assert.equal(r.phase, 'exchange');
  r = update(126, 180);
  assert.equal(r.phase, 'peel', 'every exchange is answered by a peel back to the ring');
  assert.equal(r.fireWindow, false);

  // The peel is the rule-bound reset: it re-squares for the next round on a fresh cycle.
  r = update(168, 180);
  assert.equal(r.phase, 'square');
  assert.equal(r.cycle, 1, 'the duel continues as rounds, not one relentless press');
});

test('u2 encounters register gated shapes wired to the roster', () => {
  for (const id of ['grudge_mark', 'ash_pin_champion', 'prison_transfer']) {
    assert(ENCOUNTERS[id], `${id} must be in the built encounter catalog`);
  }
  const grudge = ENCOUNTERS.grudge_mark;
  assert.equal(grudge.script, 'ambush');
  assert.equal(grudge.squad.anchorArchetype, 'enemy_assassin');
  assert(grudge.gates.sectorIds.includes('sector_sker_haven'), 'assassin holds Reach grudge territory');
  assert(grudge.squad.archetypes.every((a) => ENEMY.has(a)), 'assassin squad rows must resolve to enemy defs');

  const duel = ENCOUNTERS.ash_pin_champion;
  assert.equal(duel.squad.anchorArchetype, 'enemy_duel_champion');
  assert.deepEqual(duel.choices.map((c) => c.id), ['accept', 'run'], 'the ring only asks: fight or leave');
  assert.equal(duel.timeoutChoice, 'accept', 'a champion reads silence as acceptance');
  assert(duel.gates.sectorIds.includes('sector_sker_haven'));

  const convoy = ENCOUNTERS.prison_transfer;
  assert.equal(convoy.script, 'convoy');
  assert.deepEqual(convoy.civilian.archetypes, ['npc_prison_barge']);
  assert.deepEqual(convoy.escort.archetypes, ['prison_warden_escort']);
  assert.equal(convoy.escort.factionId, 'faction_scn', 'the transfer screen answers to Concord');
  assert.equal(convoy.predation.enabled, true, 'the raider pack actually works the crack');
  assert(convoy.gates.sectorIds.includes('sector_dione_lane'), 'the transfer runs the Dione corridor');
  assert(convoy.gates.sectorIds.includes('sector_sker_haven'), 'the route ends at Sker');
  assert(convoy.squad.archetypes.concat(convoy.civilian.archetypes, convoy.escort.archetypes)
    .every((a) => ENEMY.has(a)), 'every convoy row must resolve to an enemy def');
});

// ── fixture helpers (mirrors test/combat-doctrines.test.mjs) ──────────────────
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
        reason: 'u2_roster_test',
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
    alive: values.alive ?? true,
    valid: values.valid ?? true,
    visible: values.visible ?? true,
    ageTicks: values.ageTicks ?? 0,
    hostile: values.hostile ?? true,
    confidence: values.confidence ?? 1,
    threat: values.threat ?? 0.7,
    pos: { x: values.x ?? 400, z: values.z ?? 0 },
    vel: { x: values.vx ?? 0, z: values.vz ?? 0 },
    tethered: values.tethered ?? false,
    operationalMassBand: values.operationalMassBand || 'medium',
    mobilityBand: values.mobilityBand || 'medium',
    cargoBand: values.cargoBand || 'empty',
    tetherabilityBand: values.tetherabilityBand || 'good',
    tags: values.tags || [],
  };
}

function baseDirective() {
  return Object.freeze({
    tick: 0,
    squadId: 'fixture',
    memberId: 2,
    role: 'striker',
    tactic: 'standoff_focus',
    focusTargetId: 1,
    objective: Object.freeze({ kind: ObjectiveKind.FOCUS, targetId: 1, reason: 'fixture' }),
    formation: Object.freeze({
      kind: 'wedge', slot: Object.freeze({ x: 0, z: 0 }), velocity: Object.freeze({ x: 0, z: 0 }),
      bound: 170, breakFormation: false, breakReason: null,
    }),
  });
}
