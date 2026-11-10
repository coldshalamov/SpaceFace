// detonator_fuse — a lit dart IS the ordnance: the threat instrument cannot refuse it for an
// empty gun rack, and its announce must live for the whole armed window, not die at the end of
// the 30-tick cue beat while the commit run is still inbound. These tests pin the readable
// contract end to end: the doctrine declares the armed-window duration, the halo admits the
// weaponless hull while the fuse is lit or the blast ring is live, a missed run retires the
// announce on egress, the death ledger still pairs inside the window, and the lock panel names
// the payload before any delivered status.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CombatDoctrineId,
  CombatDoctrineRuntime,
  DETONATOR_TELEGRAPH_TICKS,
  DOCTRINE_TELEGRAPH_TICKS,
} from '../src/ai/combatDoctrine.js';
import { ContactKind, ObjectiveKind } from '../src/ai/contracts.js';
import { ActivityKind, RulesOfEngagement } from '../src/ai/doctrine.js';
import {
  createThreatHalo,
  detonatorFuseThreat,
  pairLeftoverDeathTelegraph,
} from '../src/ui/threatHalo.js';
import { targetConditionReadout } from '../src/ui/targetCondition.js';
import { ENEMY_TYPES } from '../src/data/enemies.js';

const DART_DEF = ENEMY_TYPES.find((e) => e.id === 'detonator_dart');

// ── the doctrine declares the armed window, not just the cue beat ──────────────

function dartPerception(targetX, selfX = 0, selfOverrides = {}) {
  return {
    self: {
      id: 2,
      team: 1,
      pos: { x: selfX, z: 0 },
      vel: { x: selfOverrides.vx ?? 0, z: selfOverrides.vz ?? 0 },
      rot: selfOverrides.rot ?? 0,
      hullFraction: selfOverrides.hullFraction ?? 1,
      heatFraction: 0,
      combatDoctrineId: CombatDoctrineId.DETONATOR_RUN,
      activity: {
        kind: ActivityKind.ATTACK_RUN,
        reason: 'detonator_test',
        anchor: { x: 0, z: 0 },
        leashRadius: 2600,
        preferredRange: 60,
        startedTick: 0,
      },
      roe: RulesOfEngagement.WEAPONS_FREE,
    },
    contacts: [{
      id: 1,
      kind: ContactKind.SHIP,
      alive: true, valid: true, visible: true,
      hostile: true, confidence: 1, threat: 1,
      pos: { x: targetX, z: 0 },
      vel: { x: 0, z: 0 },
      mobilityBand: 'medium', operationalMassBand: 'medium',
      cargoBand: 'empty', tetherabilityBand: 'good',
      tags: [],
    }],
    events: [],
  };
}

function dartDirective() {
  return Object.freeze({
    tick: 0, squadId: 'fixture', memberId: 2, role: 'striker', tactic: 'standoff_focus',
    focusTargetId: 1,
    objective: Object.freeze({ kind: ObjectiveKind.FOCUS, targetId: 1, reason: 'fixture' }),
    formation: Object.freeze({
      kind: 'wedge', slot: Object.freeze({ x: 0, z: 0 }), velocity: Object.freeze({ x: 0, z: 0 }),
      bound: 170, breakFormation: false, breakReason: null,
    }),
  });
}

test('the fuse announce declares the whole armed window — cue beat plus the longest commit', () => {
  const runtime = new CombatDoctrineRuntime({ seed: 11 });
  const directive = dartDirective();
  runtime.update({ tick: 0, entityId: 2, doctrineId: CombatDoctrineId.DETONATOR_RUN, perception: dartPerception(800), directive });
  const r = runtime.update({ tick: 2, entityId: 2, doctrineId: CombatDoctrineId.DETONATOR_RUN, perception: dartPerception(220), directive });
  assert.equal(r.phase, 'fuse_cue');
  assert.equal(r.telegraph.kind, 'detonator_fuse');
  assert.ok(r.telegraph.durationTicks > DOCTRINE_TELEGRAPH_TICKS,
    'a 30-tick announce dies mid-commit while the dart is still live ordnance');
  assert.equal(r.telegraph.durationTicks, DETONATOR_TELEGRAPH_TICKS,
    'the declare is the armed window the halo/vfx consumers read — fuse cue + max commit');
  // And the duration rides the ai:telegraph emit verbatim (tacticalAI passes it through).
  assert.equal(r.telegraphStarted, true, 'the announce still publishes once on entry');
});

test('a re-announced run restarts the window — the cue is per-pass, not one-shot-per-hull', () => {
  const runtime = new CombatDoctrineRuntime({ seed: 11 });
  const directive = dartDirective();
  runtime.update({ tick: 0, entityId: 2, doctrineId: CombatDoctrineId.DETONATOR_RUN, perception: dartPerception(800), directive });
  runtime.update({ tick: 2, entityId: 2, doctrineId: CombatDoctrineId.DETONATOR_RUN, perception: dartPerception(220), directive });
  runtime.update({ tick: 34, entityId: 2, doctrineId: CombatDoctrineId.DETONATOR_RUN, perception: dartPerception(90), directive });
  // Overshoot → breakaway → reform → ingress → fresh fuse cue at tick 460.
  runtime.update({ tick: 120, entityId: 2, doctrineId: CombatDoctrineId.DETONATOR_RUN, perception: dartPerception(-160, 0, { vx: 150 }), directive });
  runtime.update({ tick: 400, entityId: 2, doctrineId: CombatDoctrineId.DETONATOR_RUN, perception: dartPerception(-160, 0, { vx: 150 }), directive });
  runtime.update({ tick: 452, entityId: 2, doctrineId: CombatDoctrineId.DETONATOR_RUN, perception: dartPerception(-160, 0), directive });
  const r = runtime.update({ tick: 460, entityId: 2, doctrineId: CombatDoctrineId.DETONATOR_RUN, perception: dartPerception(-160, 0), directive });
  assert.equal(r.phase, 'fuse_cue');
  assert.equal(r.telegraph.kind, 'detonator_fuse');
  assert.equal(r.telegraph.durationTicks, DETONATOR_TELEGRAPH_TICKS, 'every pass re-announces the full window');
});

// ── the admission predicate ────────────────────────────────────────────────────

test('detonatorFuseThreat — a lit cue or a fused hull inside its own blast ring counts as a shot', () => {
  const spec = { ...DART_DEF.detonator };
  const dart = { data: { detonator: spec } };
  const band = spec.triggerRange + spec.blastRadius;
  assert.equal(detonatorFuseThreat(dart, null, band * band), true,
    'a fused hull inside trigger+blast can hurt the player the moment anything trips it');
  assert.equal(detonatorFuseThreat(dart, null, (band + 40) * (band + 40)), false,
    'beyond the ring an un-announced fused hull keeps the ordinary gate');
  assert.equal(detonatorFuseThreat(dart, { kind: 'detonator_fuse' }, 900 * 900), true,
    'the announced run marks the hull from anywhere the halo covers');
  assert.equal(detonatorFuseThreat({ data: {} }, { kind: 'detonator_fuse' }, 900 * 900), true,
    'the live cue kind alone carries the threat — the spec is not required');
  assert.equal(detonatorFuseThreat({ data: {} }, { kind: 'engine_flare' }, 900 * 900), false,
    'other telegraph kinds on a weaponless hull stay quiet — the admission is fuse-shaped');
  assert.equal(detonatorFuseThreat({ data: { detonator: spec } }, { kind: 'engine_flare' }, (band + 40) * (band + 40)), false,
    'a fused hull beyond its ring under a non-fuse cue stays quiet too');
  assert.equal(detonatorFuseThreat({ data: { detonator: null } }, null, 10 * 10), false,
    'a null spec is not a warhead');
});

// ── the halo end to end ────────────────────────────────────────────────────────

function mockDocument() {
  const elements = [];
  const fakeElement = (tag) => {
    const el = {
      tagName: String(tag || 'div').toUpperCase(),
      className: '',
      attributes: {},
      style: {},
      children: [],
      innerHTML: '',
      parentNode: null,
      setAttribute(k, v) { this.attributes[k] = String(v); },
      removeAttribute(k) { delete this.attributes[k]; },
      getAttribute(k) { return this.attributes[k]; },
      appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
      removeChild(child) {
        const idx = this.children.indexOf(child);
        if (idx >= 0) this.children.splice(idx, 1);
        child.parentNode = null;
      },
    };
    elements.push(el);
    return el;
  };
  return { elements, document: { createElement: fakeElement } };
}

function arcSlots(mock) {
  return mock.elements.filter((el) => String(el.className).includes('sf-threat-halo__slot--arc'));
}

function visibleArcs(mock) {
  return arcSlots(mock).filter((el) => el.style.display === 'block');
}

function haloHarness() {
  const mock = mockDocument();
  const oldDoc = globalThis.document;
  const realPerf = globalThis.performance;
  globalThis.document = mock.document;
  let nowMs = 1000;
  globalThis.performance = { now: () => nowMs };
  const handlers = new Map();
  const bus = {
    on(name, fn) {
      const list = handlers.get(name) || [];
      list.push(fn);
      handlers.set(name, list);
      return () => {};
    },
    emit(name, payload) { for (const fn of handlers.get(name) || []) fn(payload); },
  };
  const halo = createThreatHalo(mock.document.createElement('div'), bus);
  const player = { id: 'player', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  const dart = {
    id: 7, type: 'ship', team: 1, alive: true,
    pos: { x: 900, z: 0 }, vel: { x: 0, z: 0 },
    data: {
      encounter: true,
      weapons: [],
      detonator: { ...DART_DEF.detonator },
      ai: { combatDoctrineId: 'detonator_run' },
    },
  };
  const state = { tick: 0, simTime: 0, playerId: player.id, entityList: [player, dart] };
  const offscreen = (world, out) => { out.x = 640 + world.x; out.y = 360; out.onScreen = false; return out; };
  const restore = () => { halo.destroy(); globalThis.document = oldDoc; globalThis.performance = realPerf; };
  const tick = (n) => { nowMs += n; };
  return { mock, bus, halo, player, dart, state, offscreen, restore, tick };
}

test('a weaponless dart keeps its edge mark for the whole armed window, then egress retires it', () => {
  const h = haloHarness();
  try {
    // Beyond the blast ring, unlit: an empty gun rack earns no mark (gate unchanged).
    h.halo.update(h.player, h.state, h.offscreen);
    assert.equal(visibleArcs(h.mock).length, 0,
      'an unlit weaponless hull offscreen stays invisible — no blanket unarmed admission');

    // Fuse lights at tick 0 (the doctrine now declares the whole armed window).
    h.bus.emit('ai:telegraph', {
      entityId: 7, targetId: 'player', doctrineId: 'detonator_run',
      phase: 'fuse_cue', kind: 'detonator_fuse', durationTicks: DETONATOR_TELEGRAPH_TICKS, tick: 0,
    });
    h.bus.emit('ai:doctrinePhase', { entityId: 7, doctrineId: 'detonator_run', phase: 'fuse_cue', tick: 0 });
    h.halo.update(h.player, h.state, h.offscreen);
    let marks = visibleArcs(h.mock);
    assert.equal(marks.length, 1, 'the lit dart earns the edge mark a gun rack would');
    assert.equal(marks[0].attributes['data-telegraph-kind'], 'detonator_fuse');
    assert.equal(marks[0].attributes['aria-label'], 'DETONATOR — FUSE LIT',
      'the mark names the danger class, not "UNKNOWN — ATTACKING"');

    // The commit run is still inbound well past the old 30-tick beat — the mark stays lit.
    h.state.tick = 100;
    h.bus.emit('ai:doctrinePhase', { entityId: 7, doctrineId: 'detonator_run', phase: 'commit', tick: 32 });
    h.tick(300); // past slot grace so the fresh attributes repaint
    h.halo.update(h.player, h.state, h.offscreen);
    marks = visibleArcs(h.mock);
    assert.equal(marks.length, 1, 'commit is still armed — the announce cannot die mid-run');
    assert.equal(marks[0].attributes['data-telegraph-kind'], 'detonator_fuse');

    // The run misses: breakaway retires the announce immediately, not at window end.
    h.bus.emit('ai:doctrinePhase', { entityId: 7, doctrineId: 'detonator_run', phase: 'breakaway', tick: 140 });
    h.tick(300);
    h.halo.update(h.player, h.state, h.offscreen);
    assert.equal(visibleArcs(h.mock).length, 0,
      'a breakaway dart beyond its blast ring stops reading as announced ordnance');
  } finally {
    h.restore();
  }
});

test('a fused hull inside its own blast ring holds the mark even after the announce retires', () => {
  const h = haloHarness();
  try {
    // Parked just inside trigger+blast — no announce at all — the physics alone is the threat.
    h.dart.pos.x = DART_DEF.detonator.triggerRange + DART_DEF.detonator.blastRadius - 20;
    h.halo.update(h.player, h.state, h.offscreen);
    assert.equal(visibleArcs(h.mock).length, 1,
      'a fused hull inside its own ring is a live bomb whether or not it announced');

    // Egress at the same distance: the announce dies but the ring is still hot.
    h.bus.emit('ai:telegraph', {
      entityId: 7, targetId: 'player', doctrineId: 'detonator_run',
      phase: 'fuse_cue', kind: 'detonator_fuse', durationTicks: DETONATOR_TELEGRAPH_TICKS, tick: 0,
    });
    h.halo.update(h.player, h.state, h.offscreen);
    h.bus.emit('ai:doctrinePhase', { entityId: 7, doctrineId: 'detonator_run', phase: 'breakaway', tick: 40 });
    h.tick(300);
    h.halo.update(h.player, h.state, h.offscreen);
    const marks = visibleArcs(h.mock);
    assert.equal(marks.length, 1, 'inside the blast ring a missed dart is still the bomb it carries');
    assert.equal(marks[0].attributes['data-telegraph-kind'], undefined,
      'the retired announce no longer paints the telegraph pulse — the mark is proximity truth');
  } finally {
    h.restore();
  }
});

test('a foreign doctrine phase or foreign entity cannot retire the dart fuse cue', () => {
  const h = haloHarness();
  try {
    h.bus.emit('ai:telegraph', {
      entityId: 7, targetId: 'player', doctrineId: 'detonator_run',
      phase: 'fuse_cue', kind: 'detonator_fuse', durationTicks: DETONATOR_TELEGRAPH_TICKS, tick: 0,
    });
    h.halo.update(h.player, h.state, h.offscreen);
    assert.equal(visibleArcs(h.mock).length, 1);
    // Another hull's breakaway does nothing.
    h.bus.emit('ai:doctrinePhase', { entityId: 99, doctrineId: 'detonator_run', phase: 'breakaway', tick: 10 });
    h.halo.update(h.player, h.state, h.offscreen);
    assert.equal(visibleArcs(h.mock).length, 1, 'a foreign egress cannot retire this fuse');
    // The same hull under another doctrine does nothing either.
    h.bus.emit('ai:doctrinePhase', { entityId: 7, doctrineId: 'brawler_commit', phase: 'egress', tick: 12 });
    h.halo.update(h.player, h.state, h.offscreen);
    assert.equal(visibleArcs(h.mock).length, 1, 'the drop keys on the detonator doctrine only');
    // The window still expires on its own when nothing else speaks.
    h.state.tick = DETONATOR_TELEGRAPH_TICKS + 30;
    h.tick(300);
    h.halo.update(h.player, h.state, h.offscreen);
    assert.equal(visibleArcs(h.mock).length, 0, 'a cue that outlives its window retires by expiry');
  } finally {
    h.restore();
  }
});

// ── the death-pair ledger ─────────────────────────────────────────────────────

test('a dart that kills inside its armed window pairs its fuse cue — a stale one does not', () => {
  const tg = { entityId: 7, kind: 'detonator_fuse', durationTicks: DETONATOR_TELEGRAPH_TICKS, tick: 0 };
  const paired = pairLeftoverDeathTelegraph({ tick: 90, killerId: 7 }, [tg]);
  assert.ok(paired, 'a commit-run pop at +90 exceeds the one-shot 60-tick lead but is inside the declare');
  assert.equal(paired.kind, 'detonator_fuse');
  assert.equal(paired.leadTicks, 90);
  assert.equal(pairLeftoverDeathTelegraph({ tick: 20, killerId: 7 }, [tg]), null,
    'same-breath kills never pair — the announce must precede the death by the minimum lead');
  const staleUntil = DETONATOR_TELEGRAPH_TICKS + 90;
  assert.equal(pairLeftoverDeathTelegraph({ tick: staleUntil, killerId: 7 }, [tg]), null,
    'a death long after the window closed does not borrow the stale announce');
});

// ── the lock-panel standing fact ──────────────────────────────────────────────

test('targetConditionReadout names the fused hull before any delivered status', () => {
  const dart = {
    id: 7, type: 'ship', alive: true, mass: 20, pos: { x: 0, z: 0 },
    data: { detonator: { ...DART_DEF.detonator } },
  };
  const state = { tick: 0, combat: { entities: {} } };
  const row = targetConditionReadout(state, dart);
  assert.ok(row, 'a fused hull prints a condition row even with no delivered combat runtime');
  assert.equal(row.warhead, true);
  assert.ok(row.text.includes('WARHEAD · PROXIMITY FUSED'));

  // A combat-runtime dart keeps the fact ahead of delivered conditions.
  state.combat.entities['7'] = {
    statuses: {}, subsystems: {}, blockedActionTags: [],
    capabilities: { weapon: false }, multipliers: {},
  };
  const armed = targetConditionReadout(state, dart);
  assert.ok(armed.text.startsWith('WARHEAD · PROXIMITY FUSED'),
    'the warhead fact leads the row — it answers "what kills me" first');

  // A clean hull still answers null — the row stays reserved for real facts.
  const clean = { id: 9, type: 'ship', alive: true, mass: 20, pos: { x: 0, z: 0 }, data: {} };
  assert.equal(targetConditionReadout(state, clean), null);
});
