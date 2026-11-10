// INF-006 through INF-014 (SpaceFace_100_INFERENCE_Tasks.md tasks 6-14).
// Focused deterministic unit coverage for the smallest complete result of each task.
// No headed browser, no goldens, no sim-clock dependence.
import assert from 'node:assert/strict';
import { test } from 'node:test';

// --- INF-006: bounded combat framing -------------------------------------------------
import {
  COMPOSITION_THREAT_STICK_CLOSER,
  COMPOSITION_THREAT_STICK_S,
  COMPOSITION_ZOOM_MAX,
  CONTEXT_ZOOM_MAX,
  resolveChaseComposition,
  resolveThreatZoomBias,
} from '../src/render/camera.js';

const FOV = 50;
const ASPECT = 16 / 9;
const TILT = 60;

function ship(id, x, z, extra = {}) {
  return {
    id,
    type: 'ship',
    alive: true,
    hull: 100,
    hullMax: 100,
    team: 1,
    pos: { x, z },
    vel: { x: 0, z: 0 },
    radius: 6,
    data: { encounter: { id: 'inf-006-test' } },
    ...extra,
  };
}

function playerShip() {
  return ship(1, 0, 0, { team: 0, radius: 7 });
}

function combatState(player, others = []) {
  const entities = new Map([[player.id, player], ...others.map((o) => [o.id, o])]);
  return {
    playerId: player.id,
    mode: 'flight',
    simTime: 0,
    tick: 0,
    entities,
    entityList: [player, ...others],
    player: { flybyFocus: { active: false, targetId: null } },
  };
}

function chaseView(overrides = {}) {
  return { dt: 1 / 60, fov: FOV, aspect: ASPECT, tiltDeg: TILT, maxZoom: COMPOSITION_ZOOM_MAX, ...overrides };
}

test('INF-006: relevant hostile is framed with the player', () => {
  const player = playerShip();
  const attacker = ship(2, 200, 0, { data: { encounter: { id: 'x' }, combat: { targetId: 1 } } });
  const state = combatState(player, [attacker]);
  const sticky = { id: null, remainS: 0, wasActive: false };
  const out = resolveChaseComposition(state, player, { x: 0, z: 0 }, chaseView(), {}, null, sticky);
  assert.equal(out.composedThreatId, 2);
  assert.equal(out.hasActiveAttacker, true);
  assert.ok(out.minZoom > 0, 'an active attacker earns a fit floor so the fight stays in frame');
  assert.ok(out.zoomBias >= 0 && out.zoomBias <= CONTEXT_ZOOM_MAX, 'zoom bias stays bounded');
  assert.equal(sticky.id, 2, 'the composed threat is held for hysteresis');
});

test('INF-006: reacquisition does not ping-pong between equidistant attackers', () => {
  const player = playerShip();
  const a = ship(2, 200, 0, { data: { encounter: { id: 'x' }, combat: { targetId: 1 } } });
  const b = ship(3, -200, 0, { data: { encounter: { id: 'x' }, combat: { targetId: 1 } } });
  const state = combatState(player, [a, b]);
  const sticky = { id: null, remainS: 0, wasActive: false };
  const view = chaseView();
  let first = null;
  for (let i = 0; i < 60; i++) {
    const out = resolveChaseComposition(state, player, { x: 0, z: 0 }, view, {}, null, sticky);
    if (first == null) first = out.composedThreatId;
    assert.equal(out.composedThreatId, first, `frame ${i} must hold the same focus`);
  }
});

test('INF-006: dead or distant contacts drop immediately instead of staying sticky', () => {
  const player = playerShip();
  // Passive contact far beyond any composition range, preseeded as the held focus.
  const far = ship(9, 5000, 0);
  const state = combatState(player, [far]);
  const sticky = { id: 9, remainS: COMPOSITION_THREAT_STICK_S, wasActive: false };
  const out = resolveChaseComposition(state, player, { x: 0, z: 0 }, chaseView(), {}, null, sticky);
  assert.notEqual(out.composedThreatId, 9, 'an irrelevant distant contact is never retained');
  assert.equal(sticky.id, null, 'the sticky hold is released, not held to expiry');
  // A meaningfully closer challenger still breaks the hold immediately.
  const near = ship(2, 120, 0, { data: { encounter: { id: 'x' }, combat: { targetId: 1 } } });
  const mid = ship(4, 400, 0);
  const state2 = combatState(player, [near, mid]);
  const sticky2 = { id: 4, remainS: COMPOSITION_THREAT_STICK_S, wasActive: false };
  const out2 = resolveChaseComposition(state2, player, { x: 0, z: 0 }, chaseView(), {}, null, sticky2);
  assert.equal(out2.composedThreatId, 2, 'a decisively closer attacker takes focus at once');
});

test('INF-006: manual zoom intent and established constraints are preserved', () => {
  const player = playerShip();
  const attacker = ship(2, 350, 120, { data: { encounter: { id: 'x' }, combat: { targetId: 1 } } });
  const state = combatState(player, [attacker]);
  const out = resolveChaseComposition(
    state, player, { x: 0, z: 0 }, chaseView({ maxZoom: 55 }), {}, null,
    { id: null, remainS: 0, wasActive: false },
  );
  assert.ok(out.minZoom <= 55, `manual ceiling wins (got ${out.minZoom})`);
  assert.ok(out.minZoom <= COMPOSITION_ZOOM_MAX, 'composition never exceeds its headroom');
  assert.ok(resolveThreatZoomBias(100000, true) <= CONTEXT_ZOOM_MAX, 'threat bias is capped');
  assert.ok(COMPOSITION_THREAT_STICK_CLOSER < 1, 'hysteresis demands a decisively closer challenger');
});

// --- INF-007: first-boot motion choice -----------------------------------------------
import {
  MOTION_CHOICE_COPY,
  hasExplicitMotionChoice,
  maybePromptMotionChoice,
  motionPromptSettled,
  recordMotionChoice,
  shouldPromptMotionChoice,
} from '../src/ui/accessibility.js';

test('INF-007: fresh profile with OS reduced-motion is asked once', () => {
  const settings = {};
  assert.equal(shouldPromptMotionChoice(settings, true), true);
  assert.equal(shouldPromptMotionChoice(settings, false), false, 'no OS request means no prompt');
  assert.equal(recordMotionChoice(settings, 'reduce'), 'reduce');
  assert.equal(settings.accessibility.motionPreference, 'reduce');
  assert.equal(settings.accessibility.motionPrompted, true);
  assert.equal(settings.video.motionReduce, true, 'the existing runtime contract is synced');
  assert.equal(shouldPromptMotionChoice(settings, true), false, 'the prompt never reopens');
});

test('INF-007: explicit prior choices and migration are preserved', () => {
  assert.equal(shouldPromptMotionChoice({ accessibility: { motionPreference: 'reduce' } }, true), false);
  assert.equal(shouldPromptMotionChoice({ accessibility: { motionPreference: 'system' } }, true), false);
  // PQ-210.07 reconciliation: the shipped DEFAULTS carry motionPreference 'full' and
  // video.motionReduce, so an unmarked 'full' is the silent default, not a stored answer —
  // it must not settle the ask. An explicitly chosen Full carries the motionAsked marker.
  assert.equal(shouldPromptMotionChoice({ accessibility: { motionPreference: 'full' } }, true), true,
    'unmarked Full is the silent default: the one-time ask must fire');
  assert.equal(shouldPromptMotionChoice({ accessibility: { motionPreference: 'full', motionAsked: true } }, true), false,
    'a marked Full is a stored answer: never re-asked');
  // Migrated profile: key-presence alone cannot prove a choice (the defaults carry the same
  // keys), so an unmarked legacy profile is asked once and settles when it answers.
  const migrated = { video: { motionReduce: true } };
  assert.equal(hasExplicitMotionChoice(migrated), false);
  assert.equal(shouldPromptMotionChoice(migrated, true), true);
  const migratedAnswered = { video: { motionReduce: true }, accessibility: { motionAsked: true } };
  assert.equal(shouldPromptMotionChoice(migratedAnswered, true), false);
  assert.equal(motionPromptSettled({ accessibility: { motionPrompted: true } }), true);
  const full = {};
  assert.equal(recordMotionChoice(full, 'full'), 'full');
  assert.equal(full.video.motionReduce, false);
});

test('INF-007: the choice explains both options and is headless-safe', () => {
  for (const key of ['title', 'body', 'fullLabel', 'reduceLabel']) {
    assert.ok(typeof MOTION_CHOICE_COPY[key] === 'string' && MOTION_CHOICE_COPY[key].length > 0, key);
  }
  // No document in this harness: the driver must decline instead of throwing.
  assert.equal(maybePromptMotionChoice({}, null, true), false);
});

// --- INF-008: stunt wave-planning lifecycle ------------------------------------------
import { stuntGrammar } from '../src/systems/stuntGrammar.js';

function stuntBus() {
  const handlers = new Map();
  return {
    handlers,
    emitted: [],
    on(event, fn) {
      if (!handlers.has(event)) handlers.set(event, []);
      handlers.get(event).push(fn);
      return () => {};
    },
    emit(event, payload) { this.emitted.push({ event, payload }); },
  };
}

function stuntState() {
  return {
    playerId: 1,
    tick: 0,
    simTime: 0,
    entities: new Map(),
    run: { kind: 'adventure', phase: 'active', seed: 4242, wave: 3 },
    stunts: null,
  };
}

test('INF-008: run:wavePlanned reaches the combo transition exactly once', () => {
  const bus = stuntBus();
  const state = stuntState();
  const system = Object.create(stuntGrammar);
  system.init({ state, bus });
  try {
    const planned = bus.handlers.get('run:wavePlanned') || [];
    assert.equal(planned.length, 1, 'the intended lifecycle is connected exactly once');
    assert.equal((bus.handlers.get('run:waveCleared') || []).length, 1);
    const before = state.stunts.combo.nextBankId;
    for (const fn of planned) fn({ tick: 10 });
    assert.ok(state.stunts && state.stunts.combo, 'the combo survives the planning event');
    const styleBanked = bus.emitted.filter((e) => e.event === 'stunt:styleBanked');
    assert.equal(styleBanked.length, 0, 'no duplicate banking from a quiet planning event');
    for (const fn of planned) fn({ tick: 11 });
    assert.equal(
      bus.emitted.filter((e) => e.event === 'stunt:styleBanked').length, 0,
      'a repeat planning event still banks nothing twice',
    );
    assert.equal(state.stunts.combo.nextBankId, before, 'no bank ids are minted by planning');
  } finally {
    system.destroy();
  }
});

// --- INF-009: muzzle discharge flow ----------------------------------------------------
import { WeaponDischargePool } from '../src/render/forceLanguage/weaponDischargePool.js';

function dischargeHarness() {
  const seen = [];
  const pool = Object.create(WeaponDischargePool.prototype);
  pool.time = 0;
  pool.descriptor = new Float32Array(24);
  pool.color = { r: 1, g: 1, b: 1 };
  pool.opacity = 1;
  pool.style = 0;
  pool.batch = { add: (d) => seen.push(Array.from(d)) };
  return { pool, seen };
}

function sourceSlot(overrides = {}) {
  return {
    alive: true, role: 0, age: 0, life: 0.1, angle: 0, pitch: 0, seed: 0.3, opacity: 1,
    source: 'machined-burst', variant: 'autocannon',
    ...overrides,
  };
}

test('INF-009: default-kit muzzle flow evolves on the effect clock, then stops cleanly', () => {
  const { pool, seen } = dischargeHarness();
  const slot = sourceSlot();
  pool._strip(slot, 0, 0, 0, 2, 0.5);
  const fresh = seen[seen.length - 1][16];
  assert.ok(fresh > 0, `discharge flow is live during the shot (got ${fresh})`);
  slot.age = 0.02;
  pool._strip(slot, 0, 0, 0, 2, 0.5);
  const mid = seen[seen.length - 1][16];
  assert.notEqual(mid, fresh, 'the flow evolves from the shot, not a static shape');
  slot.age = 0.09;
  pool._strip(slot, 0, 0, 0, 2, 0.5);
  const late = seen[seen.length - 1][16];
  assert.ok(late < fresh, `the envelope decays across the shot (${late} < ${fresh})`);
  slot.age = 0.1;
  pool._strip(slot, 0, 0, 0, 2, 0.5);
  assert.equal(seen[seen.length - 1][16], 0, 'the flow reaches zero when the shot ends');
  const impact = sourceSlot({ role: 1, source: null });
  pool._strip(impact, 0, 0, 0, 2, 0.5);
  assert.equal(seen[seen.length - 1][16], 0, 'impact strips keep the untouched path');
  const otherFamily = sourceSlot({ source: 'rail-shear' });
  pool._strip(otherFamily, 0, 0, 0, 2, 0.5);
  assert.equal(seen[seen.length - 1][16], 0, 'only the default-kit family changes in this unit');
});

test('INF-009: starter pulse-bolt (split-aperture) flow evolves, then stops cleanly', () => {
  // The shipped starter gun is wpn_pulse_laser_s (STARTER_WEAPON_ID): energy damage maps it to
  // the pulse-bolt variant, whose source is split-aperture — the family a fresh profile fires.
  const { pool, seen } = dischargeHarness();
  const slot = sourceSlot({ source: 'split-aperture', variant: 'pulse-bolt' });
  pool._strip(slot, 0, 0, 0, 2, 0.5);
  const fresh = seen[seen.length - 1][16];
  assert.ok(fresh > 0, `starter muzzle flow is live during the shot (got ${fresh})`);
  slot.age = 0.02;
  pool._strip(slot, 0, 0, 0, 2, 0.5);
  assert.notEqual(seen[seen.length - 1][16], fresh, 'the flow evolves from the shot');
  slot.age = 0.09;
  pool._strip(slot, 0, 0, 0, 2, 0.5);
  const late = seen[seen.length - 1][16];
  assert.ok(late < fresh, `the envelope decays across the shot (${late} < ${fresh})`);
  const impact = sourceSlot({ role: 1, source: 'split-aperture', variant: 'pulse-bolt' });
  pool._strip(impact, 0, 0, 0, 2, 0.5);
  assert.equal(seen[seen.length - 1][16], 0, 'impact strips keep the untouched path');
  const dim = sourceSlot({ source: 'split-aperture', variant: 'pulse-bolt', opacity: 0.2 });
  pool._strip(dim, 0, 0, 0, 2, 0.5);
  assert.ok(seen[seen.length - 1][16] < fresh, 'reduced flash scales the flow down');
});

// --- INF-010: Crucible retry -----------------------------------------------------------
import {
  buildCrucibleRetryRequest,
  normalizeCrucibleRuleset,
} from '../src/ui/crucibleLaunch.js';

test('INF-010: retry preserves seed and kit without touching campaign state', () => {
  assert.equal(buildCrucibleRetryRequest(null, 'scored'), null, 'no prior run returns to setup');
  const setup = {
    seed: 4242, hullId: 'hull_test', arenaId: 'helios_core', ruleset: 'scored',
    loadout: [{ slotIndex: 0, defId: 'wpn_a' }, { slotIndex: 1, defId: 'wpn_b' }],
  };
  const retry = buildCrucibleRetryRequest(setup, 'scored');
  assert.equal(retry.setup.seed, 4242);
  assert.equal(retry.setup.hullId, 'hull_test');
  assert.deepEqual(retry.setup.loadout, setup.loadout);
  assert.equal(retry.ruleset, normalizeCrucibleRuleset('scored'));
  setup.loadout[0].defId = 'mutated';
  assert.equal(retry.setup.loadout[0].defId, 'wpn_a', 'the snapshot cannot silently change');
  assert.ok(!('credits' in retry.setup) && !('player' in retry.setup), 'no campaign possessions ride along');
});

// --- INF-011: acquisition hysteresis -----------------------------------------------------
import { stabilizeMasslineSelection } from '../src/combat/masslineTargetScoring.js';

function ranked(scores) {
  // Best-first, like the real rankMasslineTargets sort the stabilizer consumes.
  return Object.entries(scores)
    .map(([id, score]) => ({ id, score, rating: score > 0 ? 'good' : 'out' }))
    .sort((x, y) => y.score - x.score || (x.id < y.id ? -1 : 1));
}

test('INF-011: the cue holds until a challenger is decisively better', () => {
  const first = stabilizeMasslineSelection(ranked({ a: 0.5 }), null, 100);
  assert.equal(first.selected.id, 'a');
  const kept = stabilizeMasslineSelection(ranked({ a: 0.5, b: 0.53 }), first.memory, 100.05);
  assert.equal(kept.selected.id, 'a', 'a marginal lead does not flicker the cue');
  const held = stabilizeMasslineSelection(ranked({ a: 0.5, b: 0.62 }), kept.memory, 100.1);
  assert.equal(held.selected.id, 'a', 'the hold bridges the 200 ms window');
  assert.equal(held.memory.challengerId, 'b', 'the decisive challenger is tracked while it waits');
  const stillHeld = stabilizeMasslineSelection(ranked({ a: 0.5, b: 0.53 }), held.memory, 100.5);
  assert.equal(stillHeld.selected.id, 'a', 'a marginal challenger never wins, even after the hold');
  const switched = stabilizeMasslineSelection(ranked({ a: 0.5, b: 0.62 }), held.memory, 100.35);
  assert.equal(switched.selected.id, 'b', 'a decisive challenger wins after the hold');
});

test('INF-011: dead, out-of-range, or disallowed bodies drop at once', () => {
  const memory = { selectedId: 'a', selectedSince: 100, challengerId: null, challengerSince: null };
  const dropped = stabilizeMasslineSelection(ranked({ a: 0, b: 0.4 }), memory, 100.05);
  assert.equal(dropped.selected.id, 'b', 'an invalid body never stays sticky');
  const gone = stabilizeMasslineSelection(ranked({ b: 0.4 }), memory, 100.05);
  assert.equal(gone.selected.id, 'b', 'a vanished body releases immediately');
  const forced = stabilizeMasslineSelection(ranked({ a: 0.5, b: 0.51 }), memory, 100.05, { forceId: 'b' });
  assert.equal(forced.selected.id, 'b', 'an exact lease still switches without lag');
});

// --- INF-012: self-sling vs payload throw readout -----------------------------------------
import {
  masslineHud,
  resolveReleaseCue,
} from '../src/ui/masslineHud.js';

function fakeEl() {
  return {
    style: { setProperty() {} },
    textContent: '',
    classList: { toggle() {} },
    setAttribute() {},
  };
}

function fakeDom() {
  return { throwEl: fakeEl(), throwLabel: fakeEl(), selfEl: fakeEl(), selfLabel: fakeEl() };
}

const w2sCenter = () => ({ x: 720, y: 450, onScreen: true });

test('INF-012: shape and label name the exit owner', () => {
  const self = resolveReleaseCue({ x: 100, y: 100, onScreen: true }, { kind: 'self', onSolution: true });
  const thrown = resolveReleaseCue({ x: 100, y: 100, onScreen: true }, { kind: 'throw', onSolution: true });
  assert.match(self.ariaLabel, /self-sling/);
  assert.match(thrown.ariaLabel, /throw/);
  assert.notEqual(self.ariaLabel, thrown.ariaLabel, 'the two exits never share one cue');
});

test('INF-012: arming the throw swaps the cue without overlap or stale targets', () => {
  const dom = fakeDom();
  const entities = new Map();
  const state = { entities };
  // Armed: the throw diamond shows, the self chevron hides.
  const armedThrow = {
    armed: true,
    solution: { valid: true, onSolution: true, errorRad: 0, tolRad: 0.1, interceptAngle: 0 },
    selfSolution: { onSolution: true, errorRad: 0, tolRad: 0.1, targetId: 7, targetPos: { x: 10, z: 20 } },
    releaseTarget: { kind: 'point', pos: { x: 50, z: 60 } },
  };
  masslineHud._updateThrowMark(dom, armedThrow, state, w2sCenter);
  masslineHud._updateSelfMark(dom, armedThrow, state, w2sCenter);
  assert.equal(dom.throwEl.style.display, 'block');
  assert.equal(dom.selfEl.style.display, 'none');
  // Merely latched: the self chevron shows, the throw diamond hides.
  const latchedSelf = { ...armedThrow, armed: false, solution: { valid: false } };
  masslineHud._updateThrowMark(dom, latchedSelf, state, w2sCenter);
  masslineHud._updateSelfMark(dom, latchedSelf, state, w2sCenter);
  assert.equal(dom.throwEl.style.display, 'none');
  assert.equal(dom.selfEl.style.display, 'block');
  assert.match(dom.selfLabel.textContent, /RELEASE|ALIGN/, 'the chevron carries its own live label');
});

// --- INF-013: relative-mass interpretation --------------------------------------------------
import { resolveMassInterpretation } from '../src/ui/masslineHud.js';

test('INF-013: the readout names which body moves from live masses', () => {
  assert.equal(resolveMassInterpretation(3000, 500).key, 'likely-payload');
  assert.equal(resolveMassInterpretation(3000, 500).short, 'PAYLOAD');
  assert.equal(resolveMassInterpretation(400, 3000).key, 'likely-anchor');
  assert.equal(resolveMassInterpretation(400, 3000).short, 'ANCHOR');
  assert.equal(resolveMassInterpretation(800, 1000).key, 'comparable');
  // Cargo and fitting changes move the read: a loaded hold turns the same rock into a payload.
  assert.equal(resolveMassInterpretation(3200, 1000).key, 'likely-payload');
  assert.equal(resolveMassInterpretation(null, 1000), null);
  assert.equal(resolveMassInterpretation(800, 0), null);
  const anchor = resolveMassInterpretation(400, 3000);
  assert.match(anchor.title, /immovable/, 'a heavy body is never promised immovable');
});

// --- INF-014: line-load warning ---------------------------------------------------------------
import { resolveLineLoadWarning } from '../src/ui/masslineHud.js';

test('INF-014: tightening reads differently from steady towing, without chatter', () => {
  assert.equal(resolveLineLoadWarning(0.8, 0, false), true, 'high steady load warns');
  assert.equal(resolveLineLoadWarning(0.3, 0, false), false, 'safe towing stays quiet');
  assert.equal(resolveLineLoadWarning(0.65, 0.6, false), true, 'a fast-tightening turn warns early');
  assert.equal(resolveLineLoadWarning(0.65, 0, false), false, 'the same load held steady stays quiet');
  assert.equal(resolveLineLoadWarning(0.6, -1, true), true, 'hysteresis holds the warning to 0.5');
  assert.equal(resolveLineLoadWarning(0.4, 0, true), false, 'a relaxed line clears it');
  assert.equal(resolveLineLoadWarning(0.51, 0, true), true, 'no chatter just above the release band');
  assert.equal(resolveLineLoadWarning(NaN, 0, false), false);
});
