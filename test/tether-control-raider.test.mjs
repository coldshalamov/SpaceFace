import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CombatDoctrineId,
  CombatDoctrineRuntime,
  DOCTRINE_TELEGRAPH_TICKS,
} from '../src/ai/combatDoctrine.js';
import { ContactKind, ObjectiveKind } from '../src/ai/contracts.js';
import { ENEMY_TYPES } from '../src/data/enemies.js';
import { ENCOUNTERS, NAMED_CAPTAINS } from '../src/data/encounters.js';
import {
  resolveTetherControlContest,
  TETHER_CONTROL_CONTEST_TICKS,
  TETHER_CONTROL_DISPLACE_WU,
  TETHER_CONTROL_OUTMASS_RATIO,
} from '../src/systems/masslineThreats.js';
import {
  resolveTetherControlRaiderTelegraph,
  TETHER_CONTROL_RAIDER_TELEGRAPH,
} from '../src/systems/masslineSnares.js';

test('seeded characterization: raider has approach, telegraph, attack, contest, and recovery', () => {
  const trace = raiderTrace();
  assert.deepEqual(trace.map((row) => row.phase), [
    'flank',
    'spool_cue',
    'spool_cue',
    'attach_window',
    'control',
    'escape',
    'reform',
    'flank',
  ]);
  assert.equal(trace[1].telegraph.kind, 'attach_spool');
  assert.equal(trace[1].telegraph.durationTicks, DOCTRINE_TELEGRAPH_TICKS);
  assert.equal(trace[2].allowedActionId, null, 'the whole telegraph stays non-attacking');
  assert.equal(trace[3].allowedActionId, 'action_attach');
  assert.equal(trace[4].allowedActionId, 'action_reel');
  assert.equal(trace[4].contestKind, 'tether-control-contest');
  assert.equal(trace[5].outcome, 'line_lost');
});

test('counter proof: displacement, anchor-break, and outmass each resolve the bounded contest', () => {
  const active = resolveTetherControlContest(baseContest({ tick: 130 }));
  assert.equal(active.active, true);
  assert.equal(active.outcome, null);

  const displaced = resolveTetherControlContest(baseContest({
    tick: 131,
    raider: { pos: { x: TETHER_CONTROL_DISPLACE_WU + 1, z: 0 } },
  }));
  assert.equal(displaced.active, false);
  assert.equal(displaced.counter, 'displacement');
  assert.equal(displaced.outcome, 'displaced');

  const anchorBreak = resolveTetherControlContest(baseContest({
    tick: 132,
    attachment: { state: 'broken' },
  }));
  assert.equal(anchorBreak.active, false);
  assert.equal(anchorBreak.counter, 'anchor-break');
  assert.equal(anchorBreak.outcome, 'anchor_break');

  const outmass = resolveTetherControlContest(baseContest({
    tick: 133,
    target: { mass: 80 * TETHER_CONTROL_OUTMASS_RATIO + 1 },
  }));
  assert.equal(outmass.active, false);
  assert.equal(outmass.counter, 'outmass');
  assert.equal(outmass.outcome, 'outmassed');

  const timeout = resolveTetherControlContest(baseContest({ tick: 100 + TETHER_CONTROL_CONTEST_TICKS }));
  assert.equal(timeout.active, false);
  assert.equal(timeout.counter, null);
  assert.equal(timeout.outcome, 'raider_control');
});

test('contest records are deterministic and safe to serialize mid-contest', () => {
  const first = raiderTrace();
  const second = raiderTrace();
  assert.deepEqual(first, second);

  const record = resolveTetherControlContest(baseContest({ tick: 144 }));
  const restored = JSON.parse(JSON.stringify(record));
  assert.deepEqual(restored, record, 'contest record is plain save-safe data');
  assert.equal(restored.active, true);
  assert.equal(restored.startedTick, 100);
});

test('telegraph stays legible under reduced motion and reduced flash', () => {
  const full = resolveTetherControlRaiderTelegraph();
  const reduced = resolveTetherControlRaiderTelegraph({ motionReduce: true, flashReduce: true });
  assert.equal(full.kind, TETHER_CONTROL_RAIDER_TELEGRAPH.kind);
  assert.equal(full.cue, 'attach_spool');
  assert.equal(full.structuralRead, true);
  assert.ok(full.pulseHz > 0);
  assert.equal(reduced.structuralRead, true);
  assert.equal(reduced.pulseHz, 0, 'reduced motion keeps a steady shape instead of pulsing');
  assert.ok(reduced.opacity > 0);
  assert.ok(reduced.opacity < full.opacity, 'reduced flash dims without deleting the cue');
  assert.match(reduced.caption, /Enemy Massline/);
});

test('enemy Massline is specialist-only and has three rare gated placements', () => {
  assert.deepEqual(
    ENEMY_TYPES.filter((entry) => entry.combatDoctrineId === CombatDoctrineId.TETHER_CONTROL_RAIDER)
      .map((entry) => entry.id),
    ['tether_control_raider'],
  );
  const specialist = ENEMY_TYPES.find((entry) => entry.id === 'tether_control_raider');
  assert.equal(specialist.rareSpecialist, true);
  assert.equal(specialist.counterHint, 'displace_break_anchor_or_outmass');

  const vane = NAMED_CAPTAINS.find((entry) => entry.id === 'cap_vane_ash');
  assert.equal(vane.archetype, 'tether_control_raider');
  assert.equal(vane.combatDoctrineId, CombatDoctrineId.TETHER_CONTROL_RAIDER);

  const placements = [
    ENCOUNTERS.tether_control_raider_ambush,
    ENCOUNTERS.tether_control_raider_wake,
    ENCOUNTERS.tether_control_raider_hunter,
  ];
  assert.equal(placements.length, 3);
  for (const shape of placements) {
    assert.equal(shape.rare, true);
    assert.equal(shape.squad.anchorArchetype, 'tether_control_raider');
    assert.ok(shape.gates.minSectorTier >= 3);
    assert.ok(shape.gates.maxSecurity <= 0.6);
    assert.ok(shape.gates.storyBeatMin >= 1);
  }
});

function raiderTrace() {
  const runtime = new CombatDoctrineRuntime({ seed: 905 });
  const frames = [
    [0, [shipContact(320, { tethered: true })]],
    [8, [shipContact(120, { tethered: true })]],
    [37, [shipContact(112, { tethered: true })]],
    [38, [shipContact(112, { tethered: true }), tetherContact('enemy_att', 'raider', 'player')]],
    [45, [shipContact(112, { tethered: true }), tetherContact('enemy_att', 'raider', 'player')]],
    [46, [shipContact(145, { tethered: true })]],
    [136, [shipContact(720, { tethered: true })]],
    [181, [shipContact(720, { tethered: true })]],
  ];
  return frames.map(([tick, contacts]) => runtime.update({
    tick,
    entityId: 'raider',
    doctrineId: CombatDoctrineId.TETHER_CONTROL_RAIDER,
    perception: perception(contacts),
    directive: baseDirective(),
  }));
}

function baseContest(overrides = {}) {
  const raider = {
    id: 'raider',
    alive: true,
    mass: 80,
    pos: { x: 0, z: 0 },
    ...(overrides.raider || {}),
  };
  const target = {
    id: 'player',
    alive: true,
    mass: 80,
    pos: { x: 80, z: 0 },
    ...(overrides.target || {}),
  };
  const attachment = {
    id: 'att_enemy',
    state: 'active',
    ownerId: raider.id,
    targetId: target.id,
    ...(overrides.attachment || {}),
  };
  return {
    tick: overrides.tick ?? 120,
    contest: {
      startedTick: 100,
      actorId: raider.id,
      targetId: target.id,
      attachmentId: attachment.id,
      anchor: { x: 0, z: 0 },
    },
    raider,
    target,
    attachment,
  };
}

function perception(contactsValue) {
  return {
    self: {
      id: 'raider',
      team: 1,
      pos: { x: 0, z: 0 },
      vel: { x: 0, z: 0 },
      rot: 0,
      activity: {
        kind: 'attack_run',
        reason: 'tether_control_raider_test',
        anchor: { x: 0, z: 0 },
        leashRadius: 2800,
        preferredRange: 260,
        startedTick: 0,
      },
      roe: 'weapons_free',
    },
    contacts: contactsValue,
    events: [],
  };
}

function shipContact(x, values = {}) {
  return {
    id: 'player',
    kind: ContactKind.SHIP,
    alive: true,
    valid: true,
    visible: true,
    hostile: true,
    confidence: 1,
    threat: 0.8,
    pos: { x, z: 0 },
    vel: { x: 0, z: 0 },
    tethered: values.tethered ?? false,
    operationalMassBand: values.operationalMassBand || 'heavy',
    mobilityBand: values.mobilityBand || 'medium',
    cargoBand: values.cargoBand || 'rich',
    tetherabilityBand: values.tetherabilityBand || 'poor',
    tags: [],
  };
}

function tetherContact(id, ownerId, targetId, tags = ['massline', 'owned_by_self']) {
  return {
    id,
    attachmentId: id,
    kind: ContactKind.TETHER,
    ownerId,
    targetId,
    hostile: true,
    confidence: 1,
    pos: { x: 50, z: 0 },
    vel: { x: 0, z: 0 },
    tags,
  };
}

function baseDirective() {
  return Object.freeze({
    objective: Object.freeze({ kind: ObjectiveKind.FOCUS, targetId: 'player', reason: 'fixture' }),
    formation: Object.freeze({ breakFormation: false }),
  });
}
