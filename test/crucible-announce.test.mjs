// CRU-019 — the Survival run has a voice: waves announce themselves, the boss arrives, authored
// counter-hints reach the player once, and a starved wave admits it was not a clear.
//
// Guard trap this file defends against: liveSurvivalRun() rejects any run object that fails
// validateRunState (which rejects UNKNOWN keys as well as missing ones). A hand-rolled run literal
// would make every "strict no-op" assertion pass for entirely the wrong reason. So the run is built
// with the real createRunState(), and the FIRST test proves the happy path is loud before any test
// asserts silence.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import {
  MAX_LINES_PER_WAVE,
  bossArrivalLine,
  hintTextFor,
  survivalAnnounce,
  waveOpeningLine,
} from '../src/systems/survivalAnnounce.js';

const ARENA = 'helios_core';
const SEED = 7;

/** Every emission that becomes a player-facing line. A finite-ttl alert is a voice line downstream. */
const LINE_EVENTS = new Set(['voice:say', 'alert']);

function boot({ kind = 'survival', phase = 'active', wave = 0, run: runOverride } = {}) {
  const state = createGameState(SEED);
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) {
      emitted.push({ event, payload });
      raw.emit(event, payload);
    },
  };
  if (runOverride !== undefined) {
    state.run = runOverride;
  } else {
    const run = createRunState({ kind, seed: SEED });
    run.arenaId = ARENA;
    run.phase = phase;
    run.wave = wave;
    state.run = run;
  }
  survivalAnnounce.init({ state, bus, helpers: {} });
  return {
    state,
    bus,
    emitted,
    lines: () => emitted.filter((e) => LINE_EVENTS.has(e.event)),
    texts: () => emitted.filter((e) => LINE_EVENTS.has(e.event)).map((e) => e.payload.text),
    reset: () => { emitted.length = 0; },
  };
}

function planFor(wave) {
  const plan = planWave({
    seed: SEED, arenaId: ARENA, wave, act: 0, difficulty: 1, mutators: [], buildSummary: null,
  });
  assert.equal(plan.ok, undefined === plan.ok ? plan.ok : plan.ok, 'plan shape');
  assert.notEqual(plan.ok, false, `wave ${wave} must plan`);
  return plan;
}

/** Drive a wave from planned → started, as survivalRun does. */
function openWave(h, wave, plan = planFor(wave)) {
  if (h.state.run && typeof h.state.run === 'object' && !Array.isArray(h.state.run)) {
    h.state.run.wave = wave;
  }
  h.bus.emit('run:wavePlanned', { wave, plan });
  h.bus.emit('run:waveStarted', { wave, tick: 1 });
  return plan;
}

function materialize(h, wave, pkg, admitted = pkg.count) {
  h.bus.emit('run:waveMaterialized', {
    wave,
    role: pkg.role,
    enemyId: pkg.enemyId,
    gateGroup: pkg.gateGroup,
    requested: pkg.count,
    admitted,
    rejected: pkg.count - admitted,
  });
}

// ── 0. The happy path is LOUD. Everything below depends on this. ────────────────────────────────

test('a live survival run announces its wave — the guard is not swallowing everything', () => {
  const h = boot();
  openWave(h, 1);
  const lines = h.lines();
  assert.ok(lines.length > 0, 'wave start must produce at least one player-facing line');
  assert.equal(lines[0].event, 'voice:say');
  assert.match(lines[0].payload.text, /^Wave 1\./);
  survivalAnnounce.destroy();
});

// ── 1. Strict no-op outside a live survival run ─────────────────────────────────────────────────

test('strict no-op: absent, malformed, non-survival, and inactive runs stay silent', () => {
  for (const [label, opts] of [
    ['absent', { run: null }],
    ['malformed object', { run: { kind: 'survival', phase: 'active' } }],
    ['primitive', { run: 7 }],
    ['array', { run: [] }],
    ['unknown key', { run: (() => { const r = createRunState({ kind: 'survival', seed: SEED }); r.phase = 'active'; r.bogus = 1; return r; })() }],
    ['non-survival', { kind: 'adventure' }],
    ['inactive phase', { phase: 'inactive' }],
  ]) {
    const h = boot(opts);
    openWave(h, 1);
    materialize(h, 1, { role: 'control', enemyId: 'mine_layer_jackal', gateGroup: 'nw', count: 1 });
    h.bus.emit('run:waveCleared', { wave: 1, requested: 6, admitted: 6, starved: false });
    h.bus.emit('run:levelUp', { level: 2, previousLevel: 1 });
    assert.equal(h.lines().length, 0, `${label} run must be silent`);
    survivalAnnounce.destroy();
  }
});

test('strict no-op: a run that goes non-survival mid-wave stops talking', () => {
  const h = boot();
  openWave(h, 1);
  h.reset();
  h.state.run.kind = 'adventure';
  h.bus.emit('run:waveCleared', { wave: 1, requested: 6, admitted: 6, starved: false });
  assert.equal(h.lines().length, 0);
  survivalAnnounce.destroy();
});

// ── 2. A wave start announces exactly once ──────────────────────────────────────────────────────

test('a wave start announces exactly once, however many times the event repeats', () => {
  const h = boot();
  const plan = planFor(3);
  h.state.run.wave = 3;
  h.bus.emit('run:wavePlanned', { wave: 3, plan });
  h.bus.emit('run:waveStarted', { wave: 3, tick: 1 });
  h.bus.emit('run:waveStarted', { wave: 3, tick: 2 });
  h.bus.emit('run:waveStarted', { wave: 3, tick: 3 });
  const openers = h.texts().filter((t) => t.startsWith('Wave 3.'));
  assert.equal(openers.length, 1, 'one opener per wave');
  survivalAnnounce.destroy();
});

test('the opener describes THIS wave: real counts, real bearings, real objective', () => {
  const h = boot();
  const plan = openWave(h, 5);
  const text = h.texts()[0];
  const bodies = plan.packages.reduce((n, p) => n + p.count, 0);
  assert.match(text, /^Wave 5\. /);
  assert.match(text, /hostiles from the /, 'must say where they come from');
  assert.ok(!/undefined|NaN|\[object/.test(text), 'no leaked internals');
  // The spoken count is the plan's real body count.
  assert.ok(text.includes(waveOpeningLine(5, plan).slice(8)), 'line is a pure function of the plan');
  assert.equal(waveOpeningLine(5, plan), text, 'deterministic');
  assert.equal(plan.objective.kind, 'elite_hunt');
  assert.match(text, /Kill the elite and clear the rest\.$/);
  assert.ok(bodies > 0);
  survivalAnnounce.destroy();
});

test('a stale plan can never describe the wrong wave', () => {
  const h = boot();
  h.bus.emit('run:wavePlanned', { wave: 2, plan: planFor(2) });
  h.state.run.wave = 4;
  h.bus.emit('run:waveStarted', { wave: 4, tick: 1 });
  assert.equal(h.lines().length, 0, 'no plan for wave 4 → no opener, never wave 2s copy');
  survivalAnnounce.destroy();
});

test('waveOpeningLine is pure and returns null on junk', () => {
  assert.equal(waveOpeningLine(1, null), null);
  assert.equal(waveOpeningLine(0, planFor(1)), null);
  assert.equal(waveOpeningLine(1, { packages: [] }), null);
  const plan = planFor(1);
  assert.equal(waveOpeningLine(1, plan), waveOpeningLine(1, plan));
});

// ── 3. counterHint: once per archetype per run ──────────────────────────────────────────────────

test('an authored counterHint fires the first time an archetype appears, and never again', () => {
  const h = boot();
  const jackal = { role: 'control', enemyId: 'mine_layer_jackal', gateGroup: 'nw', count: 1 };

  openWave(h, 7);
  materialize(h, 7, jackal);
  const first = h.texts().filter((t) => t.startsWith('Mine-Layer Jackal:'));
  assert.equal(first.length, 1, 'taught on first sight');
  assert.match(first[0], /Salts your wake/);

  // Again in the same wave.
  materialize(h, 7, jackal);
  assert.equal(h.texts().filter((t) => t.startsWith('Mine-Layer Jackal:')).length, 1);

  // And again in a later wave.
  h.bus.emit('run:waveCleared', { wave: 7, requested: 9, admitted: 9, starved: false });
  h.bus.emit('run:transitioned', { previousPhase: 'cleanup', phase: 'wave_intro', reason: 'x' });
  openWave(h, 8);
  materialize(h, 8, jackal);
  assert.equal(h.texts().filter((t) => t.startsWith('Mine-Layer Jackal:')).length, 1, 'never repeated');
  survivalAnnounce.destroy();
});

test('a hint fires only when a body was actually admitted', () => {
  const h = boot();
  openWave(h, 7);
  materialize(h, 7, { role: 'control', enemyId: 'mine_layer_jackal', gateGroup: 'nw', count: 2 }, 0);
  assert.equal(h.texts().filter((t) => t.startsWith('Mine-Layer Jackal:')).length, 0);
  survivalAnnounce.destroy();
});

test('at most one archetype is taught per wave, and the crowded-out one still gets its turn later', () => {
  const h = boot();
  openWave(h, 9);
  materialize(h, 9, { role: 'support', enemyId: 'pd_screen_escort', gateGroup: 'nw', count: 2 });
  materialize(h, 9, { role: 'reach', enemyId: 'quiet_ghost', gateGroup: 'se', count: 1 });
  const hintsW9 = h.texts().filter((t) => /^(Point-Defense Screen|Quiet Ghost):/.test(t));
  assert.equal(hintsW9.length, 1, 'one lesson per wave');
  assert.match(hintsW9[0], /^Point-Defense Screen:/);

  h.bus.emit('run:transitioned', { previousPhase: 'cleanup', phase: 'wave_intro', reason: 'x' });
  openWave(h, 10);
  materialize(h, 10, { role: 'reach', enemyId: 'quiet_ghost', gateGroup: 'se', count: 1 });
  assert.equal(h.texts().filter((t) => t.startsWith('Quiet Ghost:')).length, 1, 'not lost, just deferred');
  survivalAnnounce.destroy();
});

test('a raw snake_case token is never printed at the player', () => {
  for (const id of ['mine_layer_jackal', 'pd_screen_escort', 'quiet_ghost', 'tether_control_raider', 'field_anchor_controller', 'dreadnought_boss']) {
    const text = hintTextFor(id);
    assert.ok(text, `${id} must resolve to prose`);
    assert.ok(!/_/.test(text), `${id} leaked a token: ${text}`);
    assert.match(text, /\.$/, `${id} must be a sentence`);
  }
  // An archetype with no authored hint says nothing at all.
  assert.equal(hintTextFor('wasp_swarmer'), null);
  assert.equal(hintTextFor('nope_not_a_ship'), null);
});

test("the boss's authored counterHint restates its telegraph, so the arrival consumes it", () => {
  const h = boot();
  const boss = { role: 'elite', enemyId: 'dreadnought_boss', gateGroup: 'nw', count: 1 };
  openWave(h, 10);
  materialize(h, 10, boss);
  assert.equal(h.texts().filter((t) => t.startsWith("Dreadnought 'Iron Maw':")).length, 0,
    'no near-duplicate hint on top of the arrival line');
  survivalAnnounce.destroy();
});

// ── 4. The boss wave announces distinctly ───────────────────────────────────────────────────────

test('the wave-10 boss gets its authored telegraph, a danger alert, and a camera beat', () => {
  const h = boot();
  const plan = openWave(h, 10);
  assert.equal(plan.objective.kind, 'boss');
  h.reset();
  materialize(h, 10, { role: 'elite', enemyId: 'dreadnought_boss', gateGroup: 'nw', count: 1 });

  const alerts = h.emitted.filter((e) => e.event === 'alert');
  assert.equal(alerts.length, 1, 'exactly one arrival alert');
  assert.equal(alerts[0].payload.sev, 'danger');
  assert.equal(alerts[0].payload.text, bossArrivalLine('dreadnought_boss'));
  assert.match(alerts[0].payload.text, /Iron Maw is rolling broadside/, 'the authored telegraph, verbatim');
  // Finite ttl only: alerts.js sends Infinity/null to the persistent pill path and nothing on the
  // bus can clear that pill by key.
  assert.ok(Number.isFinite(alerts[0].payload.ttl) && alerts[0].payload.ttl > 0);

  const shakes = h.emitted.filter((e) => e.event === 'camera:shake');
  assert.equal(shakes.length, 1);
  assert.ok(shakes[0].payload.amount >= 0.2 && shakes[0].payload.amount <= 0.9, 'within combat precedent');

  // Only once, however many batches land.
  materialize(h, 10, { role: 'elite', enemyId: 'dreadnought_boss', gateGroup: 'nw', count: 1 });
  assert.equal(h.emitted.filter((e) => e.event === 'alert').length, 1);
  assert.equal(h.emitted.filter((e) => e.event === 'camera:shake').length, 1);
  survivalAnnounce.destroy();
});

test('an ordinary wave never borrows the boss beat', () => {
  const h = boot();
  openWave(h, 5);
  h.reset();
  materialize(h, 5, { role: 'elite', enemyId: 'dreadnought_boss', gateGroup: 'nw', count: 1 });
  assert.equal(h.emitted.filter((e) => e.event === 'camera:shake').length, 0,
    'objective.kind is elite_hunt, not boss');
  assert.equal(h.emitted.filter((e) => e.event === 'alert').length, 0);
  survivalAnnounce.destroy();
});

test('a boss the cap never admitted produces no arrival', () => {
  const h = boot();
  openWave(h, 10);
  h.reset();
  materialize(h, 10, { role: 'elite', enemyId: 'dreadnought_boss', gateGroup: 'nw', count: 1 }, 0);
  assert.equal(h.lines().length, 0);
  assert.equal(h.emitted.filter((e) => e.event === 'camera:shake').length, 0);
  survivalAnnounce.destroy();
});

// ── 5. Cleared, starved, level-up ───────────────────────────────────────────────────────────────

test('a cleared wave is marked, with the real body count', () => {
  const h = boot();
  openWave(h, 2);
  h.reset();
  h.bus.emit('run:waveCleared', { wave: 2, requested: 8, admitted: 8, starved: false });
  const texts = h.texts();
  assert.equal(texts.length, 1);
  assert.equal(texts[0], 'Wave 2 clear. Eight down.');
  h.bus.emit('run:waveCleared', { wave: 2, requested: 8, admitted: 8, starved: false });
  assert.equal(h.texts().length, 1, 'marked once');
  survivalAnnounce.destroy();
});

test('a STARVED wave says so, and never says "clear"', () => {
  const h = boot();
  openWave(h, 4);
  h.reset();
  h.bus.emit('run:waveCleared', { wave: 4, requested: 10, admitted: 0, starved: true });
  const texts = h.texts();
  assert.equal(texts.length, 1);
  assert.equal(texts[0], 'Wave 4 closed empty. Nothing reached the field. That was not a clear.');
  assert.ok(!/^Wave \d+ clear\./.test(texts[0]), 'must never read as the cleared line');
  assert.match(texts[0], /not a clear/, 'must say plainly that it was not one');
  survivalAnnounce.destroy();
});

test('a level-up is marked once', () => {
  const h = boot();
  openWave(h, 1);
  h.reset();
  h.bus.emit('run:levelUp', { level: 3, previousLevel: 2 });
  assert.deepEqual(h.texts(), ['Level 3.']);
  survivalAnnounce.destroy();
});

// ── 6. Nothing after the run ends ───────────────────────────────────────────────────────────────

test('nothing is emitted after run:ended', () => {
  const h = boot();
  openWave(h, 6);
  h.bus.emit('run:ended', { outcome: 'defeat', reason: 'player_death' });
  h.reset();
  openWave(h, 7);
  materialize(h, 7, { role: 'control', enemyId: 'mine_layer_jackal', gateGroup: 'nw', count: 1 });
  h.bus.emit('run:waveCleared', { wave: 7, requested: 9, admitted: 9, starved: false });
  h.bus.emit('run:levelUp', { level: 4, previousLevel: 3 });
  assert.equal(h.lines().length, 0, 'the net is closed');
  assert.equal(h.emitted.filter((e) => e.event === 'camera:shake').length, 0);
  survivalAnnounce.destroy();
});

test('victory is terminal too, even though it emits no run:ended', () => {
  const h = boot();
  openWave(h, 10);
  h.bus.emit('run:transitioned', { previousPhase: 'cleanup', phase: 'victory', reason: 'act_complete' });
  h.reset();
  materialize(h, 10, { role: 'elite', enemyId: 'dreadnought_boss', gateGroup: 'nw', count: 1 });
  h.bus.emit('run:levelUp', { level: 5, previousLevel: 4 });
  assert.equal(h.lines().length, 0, 'a won run stops talking');
  survivalAnnounce.destroy();
});

test('a fresh run:started reopens the net and forgets what it taught', () => {
  const h = boot();
  openWave(h, 7);
  materialize(h, 7, { role: 'control', enemyId: 'mine_layer_jackal', gateGroup: 'nw', count: 1 });
  h.bus.emit('run:ended', { outcome: 'defeat', reason: 'player_death' });
  h.bus.emit('run:started', { kind: 'survival', phase: 'loadout' });
  h.reset();
  openWave(h, 7);
  materialize(h, 7, { role: 'control', enemyId: 'mine_layer_jackal', gateGroup: 'nw', count: 1 });
  assert.equal(h.texts().filter((t) => t.startsWith('Mine-Layer Jackal:')).length, 1,
    'a new run teaches again');
  survivalAnnounce.destroy();
});

// ── 7. The per-wave count is bounded ────────────────────────────────────────────────────────────

test('the per-wave line count is hard-bounded under a flood of events', () => {
  const h = boot();
  openWave(h, 9);
  // Everything at once: many archetypes, repeated materializations, level-ups, clears.
  for (let i = 0; i < 40; i++) {
    for (const enemyId of ['pd_screen_escort', 'quiet_ghost', 'mine_layer_jackal', 'tether_control_raider', 'field_anchor_controller', 'dreadnought_boss', 'wasp_swarmer']) {
      materialize(h, 9, { role: 'reach', enemyId, gateGroup: 'nw', count: 3 });
    }
    h.bus.emit('run:levelUp', { level: 2 + i, previousLevel: 1 + i });
    h.bus.emit('run:waveCleared', { wave: 9, requested: 9, admitted: 9, starved: false });
  }
  const count = h.lines().length;
  assert.ok(count <= MAX_LINES_PER_WAVE, `wave 9 produced ${count} lines, bound is ${MAX_LINES_PER_WAVE}`);
  survivalAnnounce.destroy();
});

test('the boss wave stays inside the bound with every beat firing', () => {
  const h = boot();
  openWave(h, 10);
  materialize(h, 10, { role: 'elite', enemyId: 'dreadnought_boss', gateGroup: 'nw', count: 1 });
  materialize(h, 10, { role: 'mass', enemyId: 'mine_layer_jackal', gateGroup: 'se', count: 2 });
  h.bus.emit('run:levelUp', { level: 9, previousLevel: 8 });
  h.bus.emit('run:waveCleared', { wave: 10, requested: 7, admitted: 7, starved: false });
  const texts = h.texts();
  assert.ok(texts.length <= MAX_LINES_PER_WAVE, `boss wave produced ${texts.length}`);
  assert.ok(texts.length >= 4, 'the boss wave should actually be loud');
  // Every distinct beat is present and distinct.
  assert.equal(new Set(texts).size, texts.length, 'no line repeats');
  survivalAnnounce.destroy();
});

test('each line carries a distinct voice id so the arbiter cannot collapse them', () => {
  const h = boot();
  openWave(h, 7);
  materialize(h, 7, { role: 'control', enemyId: 'mine_layer_jackal', gateGroup: 'nw', count: 1 });
  h.bus.emit('run:levelUp', { level: 2, previousLevel: 1 });
  h.bus.emit('run:waveCleared', { wave: 7, requested: 9, admitted: 9, starved: false });
  const ids = h.emitted.filter((e) => e.event === 'voice:say').map((e) => e.payload.id);
  assert.ok(ids.length >= 3);
  assert.ok(ids.every((id) => typeof id === 'string' && id.length > 0), 'every line has an id');
  assert.equal(new Set(ids).size, ids.length, 'ids are distinct — a repeat would REPLACE the floor');
  survivalAnnounce.destroy();
});

test('every line uses a real voiceArbiter channel and a finite ttl', () => {
  const h = boot();
  openWave(h, 10);
  materialize(h, 10, { role: 'elite', enemyId: 'dreadnought_boss', gateGroup: 'nw', count: 1 });
  materialize(h, 10, { role: 'mass', enemyId: 'quiet_ghost', gateGroup: 'se', count: 1 });
  h.bus.emit('run:waveCleared', { wave: 10, requested: 7, admitted: 7, starved: false });
  for (const e of h.emitted.filter((x) => x.event === 'voice:say')) {
    assert.ok(['objective', 'tutorial', 'alert', 'info'].includes(e.payload.channel), `bad channel ${e.payload.channel}`);
    assert.ok(Number.isFinite(e.payload.ttl) && e.payload.ttl > 0, 'finite ttl');
    assert.ok(typeof e.payload.text === 'string' && e.payload.text.length > 0);
    assert.ok(!/!/.test(e.payload.text), 'no exclamation marks in the combat net');
  }
  survivalAnnounce.destroy();
});

// ── 8. Copy sanity across the whole authored ten-wave block ─────────────────────────────────────

test('all ten waves produce clean, distinct, deterministic openers', () => {
  const seen = new Set();
  for (let wave = 1; wave <= 10; wave++) {
    const plan = planFor(wave);
    const line = waveOpeningLine(wave, plan);
    assert.ok(line, `wave ${wave} must open`);
    assert.equal(line, waveOpeningLine(wave, plan), 'deterministic');
    assert.match(line, new RegExp(`^Wave ${wave}\\. `));
    assert.match(line, /\.$/);
    assert.ok(!/undefined|NaN|null|\[object|_/.test(line), `wave ${wave} leaked internals: ${line}`);
    assert.ok(!/!/.test(line), 'no exclamation marks');
    assert.ok(line.length < 160, `wave ${wave} opener too long: ${line.length}`);
    seen.add(line);
  }
  assert.equal(seen.size, 10, 'each wave says something of its own');
});
