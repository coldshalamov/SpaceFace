// NXI-063 — announce the capital opening once per real transition.
// The vulnerable window follows the weapon battery's live subsystem state through a stable
// transition id ('opening:subsystem_weapon'). Repeated damage while the opening is already
// open emits no additional opening cue and no additional subsystem transition event — cues and
// rewards are deduplicated on the transition, not on the hit count. A genuine new transition
// (recovery, then a fresh disable) announces again, exactly once.
import test from 'node:test';
import assert from 'node:assert/strict';

import { CombatDoctrineRuntime } from '../src/ai/combatDoctrine.js';
import { ContactKind, ObjectiveKind } from '../src/ai/contracts.js';
import { ShipUtilitySelector } from '../src/ai/shipDecision.js';
import { recomputeCombatantModifiers } from '../src/combat/subsystems.js';

const SEED = 4242;
const DOCTRINE = 'capital_broadside';

const HOSTILE = {
  id: 'pilot', kind: ContactKind.SHIP, alive: true, valid: true, visible: true, hostile: true,
  confidence: 1, threat: 1, pos: { x: 180, z: 0 }, vel: { x: 0, z: 0 },
};
const ACTION_DEFS = [
  { id: 'action_burst', tags: ['attack'], preferredRange: 200, targetKinds: [ContactKind.SHIP] },
];
const DIRECTIVE = {
  objective: { kind: ObjectiveKind.FOCUS, targetId: 'pilot', reason: 'combat_doctrine:capital_broadside:broadside_fire' },
  formation: { slot: { x: 0, z: 0 }, velocity: { x: 0, z: 0 }, bound: 170 },
  tactic: 'standoff_focus',
};

function makeCapital() {
  return {
    id: 'maw',
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    hullFraction: 0.9, // hull stays healthy the whole fight — the opening is not an HP gate
    alive: true,
    roe: 'weapons_free',
    activity: { kind: 'attack_run', startedTick: 0 },
    capabilities: [],
    data: { subsystems: { subsystem_weapon: { effectiveDisabled: false, destroyed: false } } },
  };
}

function disableBattery(self) {
  self.data.subsystems.subsystem_weapon.effectiveDisabled = true;
  self.data.subsystems.subsystem_weapon.destroyed = true;
}

function restoreBattery(self) {
  self.data.subsystems.subsystem_weapon.effectiveDisabled = false;
  self.data.subsystems.subsystem_weapon.destroyed = false;
}

test('NXI-063: repeated damage while the capital is already vulnerable emits no extra cue or reward', () => {
  const runtime = new CombatDoctrineRuntime({ seed: SEED });
  const selector = new ShipUtilitySelector();
  const self = makeCapital();
  const perception = { self, contacts: [HOSTILE] };
  const update = (tick) => runtime.update({ tick, entityId: 'maw', doctrineId: DOCTRINE, perception });

  // Healthy battery: window closed, nothing announced.
  const closed = update(40);
  assert.equal(closed.openingOpen, false);
  assert.equal(closed.openingCue, null);
  assert.equal(closed.openingTransitionId, null);

  // The battery goes down: the real opening announces once.
  disableBattery(self);
  const opened = update(41);
  assert.equal(opened.openingOpen, true);
  assert.equal(opened.openingCue, 'combat.subsystem.weapon.disabled');
  assert.equal(opened.openingTransitionId, 'opening:subsystem_weapon');
  assert.equal(opened.fireWindow, false, 'the capital cannot fire while its battery is the opening');

  // Repeated hits on the already-dead battery: every doctrine update reports the window open
  // but announces nothing — the stable transition id deduplicates the cue, not the hit count.
  let openCues = 1;
  for (let tick = 42; tick <= 55; tick++) {
    const snap = update(tick);
    assert.equal(snap.openingOpen, true, `tick ${tick}: still open`);
    assert.equal(snap.openingCue, null, `tick ${tick}: repeated damage emits no new opening cue`);
    assert.equal(snap.openingTransitionId, 'opening:subsystem_weapon',
      `tick ${tick}: the same transition keeps its id`);
    openCues += snap.openingCue ? 1 : 0;
    // The ship decision path consumes the same snapshot without re-emitting anything.
    const selected = selector.select({
      tick, entityId: 'maw', perception, directive: DIRECTIVE,
      actionDefs: ACTION_DEFS, combatDoctrine: snap,
    });
    assert.ok(selected, `tick ${tick}: the doctrine still steers the ship while open`);
    assert.equal(selected.cue, undefined, `tick ${tick}: select does not re-emit the cue`);
  }
  assert.equal(openCues, 1, 'one transition produced exactly one opening cue');

  // The event/reward side is transition-gated the same way: the subsystem-disabled bus event
  // fires on the effective-disabled edge only — pounding the dead battery emits nothing more.
  const events = [];
  const ctx = {
    state: { tick: 60, combat: {} },
    catalog: { subsystems: new Map(), statuses: new Map() },
    bus: { emit: (name, payload) => events.push({ name, payload }) },
  };
  const combatRuntime = {
    subsystems: { subsystem_weapon: { destroyed: true, effectiveDisabled: false } },
    statuses: {},
    baseCapabilities: {},
  };
  recomputeCombatantModifiers(ctx, { id: 'maw' }, combatRuntime);
  assert.equal(events.length, 1, 'the disable edge emits once');
  assert.equal(events[0].name, 'combat:subsystemDisabled');
  assert.equal(events[0].payload.subsystemId, 'subsystem_weapon');
  for (let tick = 61; tick <= 66; tick++) {
    ctx.state.tick = tick;
    recomputeCombatantModifiers(ctx, { id: 'maw' }, combatRuntime); // repeated damage, still dead
  }
  assert.equal(events.length, 1, 'repeated damage on the dead battery earns no extra event');

  // Genuine recovery is a new transition and announces once — then stays quiet.
  restoreBattery(self);
  const recovered = update(70);
  assert.equal(recovered.openingOpen, false);
  assert.equal(recovered.openingCue, 'combat.subsystem.restored');
  assert.equal(recovered.openingTransitionId, null);
  const stillClosed = update(71);
  assert.equal(stillClosed.openingCue, null, 'the restore cue does not repeat');

  // A fresh disable after recovery is a real new transition — it announces again, exactly once.
  disableBattery(self);
  const reopened = update(72);
  assert.equal(reopened.openingOpen, true);
  assert.equal(reopened.openingCue, 'combat.subsystem.weapon.disabled',
    'a new disable transition announces again');
  const stillOpen = update(73);
  assert.equal(stillOpen.openingCue, null, 'and again does not repeat while held open');
});
