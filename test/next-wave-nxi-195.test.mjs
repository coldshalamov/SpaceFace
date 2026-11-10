// NXI-195 — the player action cue survives the parent (NXB-049) overlap policy.
//
// The exact three-event overlap: a massline release answer (the player's committed action),
// a massline threat (the immediate hazard), and a doctrine aftermath (secondary aftermath)
// landing in the same short interval. Done sentence: "Secondary aftermath cannot displace
// both action confirmation and danger information." — with the boundary that the fix must
// come from the reservation policy, not from raising every cue to maximum priority.
//
// Harness mimics test/pq023-corridor-cues.test.mjs (the arbitration owner's focused gate):
// the real presentationOrchestrator over a recording bus. No rng is consumed on this path
// (seed pinned anyway per wave convention).

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CUE_LANE_BUDGETS,
  CUE_LANE_CRITICAL_RESERVE,
  isCriticalCue,
  laneBudgetReason,
} from '../src/presentation/cueArbitration.js';
import {
  PRESENTATION_RECIPES,
  getPresentationRecipe,
  validatePresentationRecipes,
} from '../src/presentation/cueRecipes.js';
import { presentationOrchestrator } from '../src/systems/presentationOrchestrator.js';

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
    suppressed() { return this.emitted.filter((e) => e.type === 'presentation:cueSuppressed').map((e) => e.payload); },
  };
}

function makeState(tick = 4242) {
  return {
    seed: 4242,
    tick,
    simTime: tick / 60,
    playerId: 1,
    entities: new Map([[1, { id: 1, pos: { x: 0, y: 0, z: 0 } }]]),
  };
}

function bootOrchestrator(tick = 4242) {
  const bus = makeBus();
  const state = makeState(tick);
  presentationOrchestrator.init({ state, bus });
  return { bus, state };
}

// The three events of the packet's overlap, emitted through the same _emitCue path the live
// subscriptions use (releaseRated / massline threat / doctrine cycle).
function emitAftermath(i = 0) {
  return presentationOrchestrator._emitCue('combat.doctrine.aftermath',
    { sourceId: 700 + i, targetId: 800 + i },
    { sourceEvent: 'combat:doctrineAftermath', sequence: `aftermath-${i}` });
}

function emitReleaseAnswer() {
  return presentationOrchestrator._emitCue('tether.release.clean',
    { targetId: 900 },
    { sourceEvent: 'tether:releaseRated', material: 'massline', magnitude: 60, tags: ['release', 'clean'] });
}

function emitHazardCue() {
  return presentationOrchestrator._emitCue('massline.threat',
    { sourceId: 500, targetId: 1 },
    { sourceEvent: 'massline:threat', material: 'massline', magnitude: 1, tags: ['threat'] });
}

test('NXI-195: the exact three-event overlap lands whole in one tick, in every arrival order', () => {
  const orders = [
    ['aftermath', 'release', 'hazard'],
    ['release', 'hazard', 'aftermath'],
    ['hazard', 'aftermath', 'release'],
  ];
  for (const order of orders) {
    const { bus } = bootOrchestrator();
    try {
      for (const step of order) {
        if (step === 'aftermath') assert.equal(emitAftermath(), true);
        if (step === 'release') assert.equal(emitReleaseAnswer(), true);
        if (step === 'hazard') assert.equal(emitHazardCue(), true);
      }
      const ids = bus.cues().map((c) => c.id);
      assert.ok(ids.includes('combat.doctrine.aftermath'), `${order}: aftermath must land`);
      assert.ok(ids.includes('tether.release.clean'), `${order}: the player release answer must land`);
      assert.ok(ids.includes('massline.threat'), `${order}: the immediate hazard cue must land`);
      assert.equal(bus.suppressed().length, 0, `${order}: the exact overlap must not suppress anything`);
    } finally {
      presentationOrchestrator.dispose();
    }
  }
});

test('NXI-195: aftermath-noise saturation cannot displace both the release answer and the danger information', () => {
  const { bus } = bootOrchestrator();
  try {
    // Secondary aftermath traffic: distinct damage pairs plus the player hit — all voiced on
    // audio.combat_aftermath. Two distinct pairs + the hit exactly fill the audio general pool
    // (CUE_LANE_BUDGETS.audio - CUE_LANE_CRITICAL_RESERVE.audio = 3) before the player's cues
    // arrive: the worst arrival order the streaming policy allows.
    assert.equal(presentationOrchestrator._emitCue('combat.damage.applied',
      { sourceId: 300, targetId: 400 }, { sourceEvent: 'combat:damaged', sequence: 'pair-a' }), true);
    assert.equal(presentationOrchestrator._emitCue('combat.damage.applied',
      { sourceId: 301, targetId: 401 }, { sourceEvent: 'combat:damaged', sequence: 'pair-b' }), true);
    assert.equal(presentationOrchestrator._emitCue('combat.player.hit',
      { sourceId: 310, targetId: 1 }, { sourceEvent: 'combat:playerHit' }), true);

    // The player's release answer and the immediate hazard arrive after the noise; the doctrine
    // aftermath (critical) lands among them.
    emitReleaseAnswer();
    assert.equal(emitAftermath(), true);
    emitHazardCue();

    const landed = bus.cues().map((c) => c.id);
    const suppressed = bus.suppressed();
    // The done sentence: the danger information survives — so aftermath can never take both.
    assert.ok(landed.includes('massline.threat'),
      'the immediate hazard cue must survive aftermath saturation');
    const lostBoth = !landed.includes('tether.release.clean') && !landed.includes('massline.threat');
    assert.equal(lostBoth, false, 'aftermath must not displace both the action confirmation and the danger information');
    // The degradation, when it happens, is the policy's flavor behavior: lane_budget, never
    // silence, and only flavor-class cues are dropped.
    for (const s of suppressed) {
      assert.ok(String(s.reason).startsWith('lane_budget:'),
        `suppression must name its lane, got ${s.reason}`);
      assert.notEqual(s.id, 'massline.threat', 'the danger information is never a suppression victim here');
    }
  } finally {
    presentationOrchestrator.dispose();
  }
});

test('NXI-195: the guarantee comes from the reservation policy, not from blanket promotion', () => {
  // The "do not" boundary: the release answer and the aftermath stay flavor-class — the policy,
  // not a maximum-priority stamp, is what protects the overlap.
  const release = getPresentationRecipe('tether.release.clean');
  const razor = getPresentationRecipe('tether.release.razor');
  const threat = getPresentationRecipe('massline.threat');
  const aftermath = getPresentationRecipe('combat.doctrine.aftermath');
  assert.equal(isCriticalCue({ id: 'tether.release.clean' }, release), false,
    'the release answer must not be raised to the critical tier to buy survival');
  assert.equal(isCriticalCue({ id: 'tether.release.razor' }, razor), false);
  assert.equal(isCriticalCue({ id: 'massline.threat' }, threat), true,
    'the immediate hazard cue holds the reserved tier');
  // Importance stays a graded ladder, not a wall of maxima.
  assert.ok(release.importance < 1 && razor.importance < 1 && aftermath.importance < 1);
  // The reserve still exists and still excludes flavor, exactly as the parent landed it.
  assert.equal(CUE_LANE_CRITICAL_RESERVE.audio, 3);
  assert.equal(
    laneBudgetReason({ audio: 'audio.tether_release' }, false,
      { audio: CUE_LANE_BUDGETS.audio - CUE_LANE_CRITICAL_RESERVE.audio }),
    'lane_budget:audio',
    'flavor still degrades at the general-pool boundary',
  );
  assert.equal(validatePresentationRecipes(PRESENTATION_RECIPES).ok, true);
});
