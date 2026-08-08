// Packet T03 — contract tests for Massline target scoring (intent / obstruction / ownership).
//
// The rung-07 module (scoreMasslineTarget / rankMasslineTargets) already carried range, closing
// geometry (swing), mass and hostility. T03 extends it with the three remaining roadmap axes —
// player intent, obstruction, ownership — as STRICTLY OPT-IN inputs, and this suite pins:
//   • the legacy path stays byte-identical when no T03 axis is supplied (§1 hard-coded scores);
//   • exact-target selection under clutter (§5);
//   • immediate reversal — intent is a pure function of the current call, and a full reversal
//     outweighs both the latched tiebreak and the painted-target bonus (§3);
//   • obstruction and ownership GATES ('blocked' / 'protected'), ally damping (§4);
//   • no locked-weapon aim coupling, structurally and behaviorally (§7).
//
// Self-contained fixtures; no live catalog imports. No wall clock, no ambient RNG, no DOM.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  scoreMasslineTarget,
  rankMasslineTargets,
  stabilizeMasslineSelection,
} from '../src/combat/masslineTargetScoring.js';

const P = () => ({ pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } });
const T = (id, x, z, { vx = 0, vz = 0, mass = 500 } = {}) => ({
  id, pos: { x, z }, vel: { x: vx, z: vz }, mass, radius: 10,
});

// ── §1 legacy byte-compatibility ───────────────────────────────────────────────────────────────

test('T03 §1: with no T03 axis supplied, scores are byte-identical to rung 07', () => {
  // Hard-coded EXPECTED values, captured from the rung-07 implementation before the T03 change
  // and copied here BY HAND. If any of these move, the legacy path changed — that is a defect,
  // not a test to update casually: rung-08 consumers rely on this exact behavior.
  const cases = [
    [T('a', 234, 0, { vz: 90 }), { hostile: true }, 1, 'clean'],
    [T('b', 100, 0, { vz: 80 }), {}, 0.8035042735042736, 'clean'],
    [T('c', 100, 0, { vz: 80 }), { currentlyLatched: true }, 0.8835042735042735, 'clean'],
    [T('d', 370, 0, { vx: -10, mass: 30 }), {}, 0.06000000000000001, 'poor'],
  ];
  for (const [target, opts, score, rating] of cases) {
    const r = scoreMasslineTarget(P(), target, opts);
    assert.equal(r.score, score, `${target.id} legacy score exact`);
    assert.equal(r.rating, rating, `${target.id} legacy rating`);
    assert.ok(!('intent' in r.reasons) && !('ownership' in r.reasons),
      'no T03 reason fields appear on the legacy path');
    // Opt-in reachAllowance must be absent-equivalent: zero / omitted leave scores byte-identical.
    const zeroAllowance = scoreMasslineTarget(P(), target, { ...opts, reachAllowance: 0 });
    assert.equal(zeroAllowance.score, score, `${target.id} reachAllowance:0 is legacy-identical`);
    assert.equal(zeroAllowance.rating, rating);
  }
});

// ── §1b reach-allowance membrane (T04 surface-reach opt-in) ───────────────────────────────────

test('T03 §1b: reachAllowance extends the gate only; comfort still uses raw distance/maxRange', () => {
  // Independent hard-coded bounds: maxRange 390, allowance 20 → reach limit 410.
  const maxRange = 390;
  const allowance = 20;
  // At maxRange + allowance: eligible (gate open).
  const atBound = scoreMasslineTarget(P(), T('at', 410, 0, { vz: 60 }), {
    maxRange, reachAllowance: allowance,
  });
  assert.notEqual(atBound.rating, 'out', 'at maxRange+allowance must be in range');
  assert.ok(atBound.score > 0);
  // Comfort uses raw distance/maxRange (410/390 > 1 → clamped) — not (410-20)/390.
  const comfortAt = atBound.reasons.range;
  const noAllowanceBeyond = scoreMasslineTarget(P(), T('far', 410, 0, { vz: 60 }), { maxRange });
  assert.equal(noAllowanceBeyond.rating, 'out', 'without allowance, center 410 is out');
  assert.equal(noAllowanceBeyond.reasons.gate, 'out of range');
  // Beyond maxRange+allowance: still out.
  const beyond = scoreMasslineTarget(P(), T('beyond', 410.001, 0, { vz: 60 }), {
    maxRange, reachAllowance: allowance,
  });
  assert.equal(beyond.rating, 'out');
  assert.equal(beyond.reasons.gate, 'out of range');
  // rankMasslineTargets resolves reachAllowanceOf per candidate.
  const ranked = rankMasslineTargets(P(), [
    { ...T('small', 400, 0, { vz: 60 }), radius: 0 },
    { ...T('big', 400, 0, { vz: 60 }), radius: 20 },
  ], {
    maxRange,
    reachAllowanceOf: (t) => Math.max(0, Number(t.radius) || 0),
  });
  assert.equal(ranked.find((r) => r.id === 'small').rating, 'out', 'radius 0 at 400 is out of 390');
  assert.notEqual(ranked.find((r) => r.id === 'big').rating, 'out', 'radius 20 at 400 is in (390+20)');
  // Pin that comfort at a mid-range target is unchanged by a large unused allowance.
  const mid = scoreMasslineTarget(P(), T('mid', 200, 0, { vz: 60 }), { maxRange });
  const midAllow = scoreMasslineTarget(P(), T('mid', 200, 0, { vz: 60 }), {
    maxRange, reachAllowance: 50,
  });
  assert.equal(mid.reasons.range, midAllow.reasons.range, 'allowance must not alter range comfort');
  assert.equal(mid.score, midAllow.score);
  assert.ok(Number.isFinite(comfortAt));
});

// ── §2 intent alignment ────────────────────────────────────────────────────────────────────────

test('T03 §2: a target along the intent vector outscores an identical target opposite it', () => {
  const toward = T('tw', 200, 0, { vz: 60 });
  const away = T('aw', -200, 0, { vz: 60 });
  const intentDir = { x: 1, z: 0 };
  const st = scoreMasslineTarget(P(), toward, { intentDir });
  const sa = scoreMasslineTarget(P(), away, { intentDir });
  assert.ok(st.score > sa.score, `toward ${st.score} must beat away ${sa.score}`);
  assert.equal(st.reasons.intent, 1, 'exactly toward = alignment 1');
  assert.equal(sa.reasons.intent, 0, 'exactly opposite = alignment 0');
  // Orthogonal reads the neutral midpoint — both sides of the axis pinned.
  const ortho = scoreMasslineTarget(P(), T('or', 0, 200, { vx: 60 }), { intentDir });
  assert.equal(ortho.reasons.intent, 0.5, 'orthogonal = alignment 0.5');
  // A zero-length or garbage intent vector falls back to the legacy path entirely.
  const none = scoreMasslineTarget(P(), toward, { intentDir: { x: 0, z: 0 } });
  assert.ok(!('intent' in none.reasons), 'zero intent vector = legacy path');
  const nan = scoreMasslineTarget(P(), toward, { intentDir: { x: NaN, z: NaN } });
  assert.ok(!('intent' in nan.reasons), 'non-finite intent vector = legacy path');
});

// ── §3 immediate reversal ──────────────────────────────────────────────────────────────────────

test('T03 §3: flipping the intent vector flips the ranking on the very next call — latch and paint cannot hold it', () => {
  const east = T('east', 250, 0, { vz: 60 });
  const west = T('west', -250, 0, { vz: 60 });
  const optsEast = {
    intentDir: { x: 1, z: 0 },
    // The stickiest possible loser: currently latched AND painted.
    isLatched: (t) => t.id === 'west',
    preferredId: 'west',
  };
  const rankedEast = rankMasslineTargets(P(), [east, west], optsEast);
  // Full-opposition alignment swing is W_INTENT (0.25), which must beat latched 0.08 + preferred
  // 0.15 (= 0.23) — the constant sizing is itself the contract here.
  assert.equal(rankedEast[0].id, 'east', 'intent east wins even against latch + paint');

  const rankedWest = rankMasslineTargets(P(), [east, west], { ...optsEast, intentDir: { x: -1, z: 0 } });
  assert.equal(rankedWest[0].id, 'west', 'reversed intent wins immediately on the next call');

  // Purity of reversal: the two calls used identical inputs except intentDir — no hidden state.
  const again = rankMasslineTargets(P(), [east, west], optsEast);
  assert.equal(again[0].id, 'east', 'no hysteresis: repeating the first call repeats its answer');
});

// ── §4 obstruction and ownership ───────────────────────────────────────────────────────────────

test('T03 §4: obstruction gates to blocked; own/station gate to protected; ally is damped but eligible', () => {
  const clear = T('clear', 200, 0, { vz: 60 });
  const walled = T('walled', 200, 0, { vz: 60 });
  const ranked = rankMasslineTargets(P(), [clear, walled], {
    isObstructed: (t) => t.id === 'walled',
  });
  assert.equal(ranked[0].id, 'clear');
  const blockedRec = ranked.find((r) => r.id === 'walled');
  assert.equal(blockedRec.score, 0);
  assert.equal(blockedRec.rating, 'blocked');

  for (const kind of ['own', 'station']) {
    const rec = scoreMasslineTarget(P(), clear, { ownership: kind });
    assert.equal(rec.score, 0, `${kind} must gate`);
    assert.equal(rec.rating, 'protected', `${kind} rating`);
  }

  const hostile = scoreMasslineTarget(P(), clear, { ownership: 'hostile' });
  const neutral = scoreMasslineTarget(P(), clear, { ownership: 'neutral' });
  const ally = scoreMasslineTarget(P(), clear, { ownership: 'ally' });
  assert.equal(hostile.score, neutral.score, 'ownership multiplier is 1 for hostile and neutral');
  assert.ok(ally.score > 0, 'an ally stays eligible (rescue/tow)');
  // Both sides of the damping constant: exactly ALLY_FACTOR (0.35) of the undamped score.
  assert.ok(Math.abs(ally.score - neutral.score * 0.35) < 1e-12,
    `ally must score exactly 0.35x (got ${ally.score} vs ${neutral.score * 0.35})`);
  // A protected gate wins over obstruction in reporting (most actionable reason first).
  const both = scoreMasslineTarget(P(), clear, { ownership: 'station', obstructed: true });
  assert.equal(both.rating, 'protected');
});

test('T03 §4b: an exact hint cannot force a gated record ahead of a physically eligible candidate', () => {
  const records = [
    { id: 'blocked-focus', score: 0, rating: 'blocked', reasons: { gate: 'obstructed' } },
    { id: 'clear-anchor', score: 0.61, rating: 'good', reasons: {} },
  ];
  const selected = stabilizeMasslineSelection(records, null, 4, { forceId: 'blocked-focus' });
  assert.equal(selected.selected?.id, 'clear-anchor',
    'forceId is priority among eligible records, never permission to bypass a physical gate');

  const denialOnly = stabilizeMasslineSelection([records[0]], null, 4, { forceId: 'blocked-focus' });
  assert.equal(denialOnly.selected?.id, 'blocked-focus',
    'when no eligible record exists the gated record remains available for a readable denial');
});

// ── §5 exact-target clutter ────────────────────────────────────────────────────────────────────

test('T03 §5: intent picks the exact target out of near-identical clutter, deterministically', () => {
  // Seven near-identical targets on a ring, each moving TANGENTIALLY to its own bearing so every
  // one of them has identical swing/mass/range factors — true clutter, distinguishable only by
  // intent, paint, or the id tiebreak.
  const ring = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    ring.push(T(`ring_${i}`, Math.cos(a) * 220, Math.sin(a) * 220,
      { vx: -Math.sin(a) * 60, vz: Math.cos(a) * 60 }));
  }
  const want = 3;
  const wx = Math.cos((want / 7) * Math.PI * 2);
  const wz = Math.sin((want / 7) * Math.PI * 2);
  const opts = { intentDir: { x: wx, z: wz } };
  for (let run = 0; run < 3; run++) {
    const ranked = rankMasslineTargets(P(), ring, opts);
    assert.equal(ranked[0].id, `ring_${want}`, `run ${run}: intent selects the exact target`);
  }
  // Painted target wins among the clutter when intent is ambiguous (no vector).
  const painted = rankMasslineTargets(P(), ring, { preferredId: 'ring_5' });
  assert.equal(painted[0].id, 'ring_5', 'preferredId wins without an intent vector');
  // But painting can never resurrect a gated target.
  const paintedBlocked = rankMasslineTargets(P(), ring, {
    preferredId: 'ring_5', isObstructed: (t) => t.id === 'ring_5',
  });
  assert.notEqual(paintedBlocked[0].id, 'ring_5', 'a blocked target cannot be painted back in');
  assert.equal(paintedBlocked.find((r) => r.id === 'ring_5').rating, 'blocked');
});

// ── §6 determinism and purity ──────────────────────────────────────────────────────────────────

test('T03 §6: identical calls are byte-identical; inputs are never mutated; extremes stay finite', () => {
  const targets = [T('a', 200, 0, { vz: 60 }), T('b', 0, 200, { vx: 60 })];
  const opts = { intentDir: { x: 0.6, z: 0.8 }, preferredId: 'b', ownershipOf: () => 'neutral' };
  const snapT = JSON.stringify(targets);
  const r1 = JSON.stringify(rankMasslineTargets(P(), targets, opts));
  const r2 = JSON.stringify(rankMasslineTargets(P(), targets, opts));
  assert.equal(r1, r2, 'identical calls identical results');
  assert.equal(JSON.stringify(targets), snapT, 'candidates unmutated');

  // Extreme magnitudes: a target at 1e308 is out of range (gated), never NaN.
  const far = scoreMasslineTarget(P(), T('far', 1e308, 1e308), {});
  assert.equal(far.rating, 'out');
  assert.equal(far.score, 0);
  // A non-finite intent with an in-range target: legacy path, finite score.
  const r = scoreMasslineTarget(P(), T('x', 200, 0, { vz: 60 }), { intentDir: { x: Infinity, z: 0 } });
  assert.ok(Number.isFinite(r.score));
});

// ── §7 no locked-weapon aim coupling ───────────────────────────────────────────────────────────

test('T03 §7: weapon-aim style inputs are structurally absent and behaviorally inert', () => {
  const target = T('t', 200, 0, { vz: 60 });
  const base = JSON.stringify(scoreMasslineTarget(P(), target, { intentDir: { x: 1, z: 0 } }));
  const polluted = JSON.stringify(scoreMasslineTarget(P(), target, {
    intentDir: { x: 1, z: 0 },
    weaponAim: { x: -1, z: 0 }, lockOnId: 'someone', crosshair: { x: 5, z: 5 }, aimPoint: { x: 9, z: 9 },
  }));
  assert.equal(polluted, base, 'unknown aim-flavored opts change nothing');

  const src = readFileSync(new URL('../src/combat/masslineTargetScoring.js', import.meta.url), 'utf8');
  for (const banned of ['weaponAim', 'lockOn', 'crosshair', 'aimPoint', 'state.player.targetId']) {
    // The module may not even MENTION an aim seam outside this suite's own vocabulary.
    assert.ok(!src.includes(banned), `module source must not reference ${banned}`);
  }
});

// ── §8 purity statics ──────────────────────────────────────────────────────────────────────────

test('T03 §8: module source is clock-free, RNG-free, DOM-free, NUL-free', () => {
  const src = readFileSync(new URL('../src/combat/masslineTargetScoring.js', import.meta.url), 'utf8');
  for (const banned of ['Math.random', 'Date.now', 'performance.now', 'new Date(', 'setTimeout',
    'setInterval', "from 'three'", 'document.', 'window.']) {
    assert.ok(!src.includes(banned), `source must not contain ${banned}`);
  }
  assert.equal(src.split(String.fromCharCode(0)).length - 1, 0, 'no raw NUL bytes');
});

// ── §9 consumer discipline ─────────────────────────────────────────────────────────────────────

// The module specifier as it appears inside an import/export-from/dynamic-import/require. Matching
// the SPECIFIER (a quoted string in a module-resolution position) rather than the bare filename is
// the whole point: this assertion is about the module GRAPH, not about who is allowed to say the
// word. See the note on the test below.
const SCORING_SPECIFIER = String.raw`['"][^'"]*masslineTargetScoring(?:\.js)?['"]`;
const IMPORT_FORMS = [
  // `import ... from '<spec>'` and `export ... from '<spec>'` (incl. multi-line binding lists).
  new RegExp(String.raw`\bfrom\s*${SCORING_SPECIFIER}`),
  // Bare side-effect import: `import '<spec>'`.
  new RegExp(String.raw`\bimport\s*${SCORING_SPECIFIER}`),
  // Dynamic import and CJS require.
  new RegExp(String.raw`\bimport\s*\(\s*${SCORING_SPECIFIER}`),
  new RegExp(String.raw`\brequire\s*\(\s*${SCORING_SPECIFIER}`),
];

test('T03 §9: only the sanctioned consumers import this module', () => {
  // The rung-07 check script and the T04 tether latch are the sanctioned importers. A new importer
  // appearing is a wiring decision for T04+, not an accident this suite lets pass.
  const allowed = new Set([
    'scripts/check-massline-target-scoring.mjs',
    // T04 (w2/t04-latch-eligibility): the tether latch is the first sanctioned runtime consumer
    // of the T03 axes — eligibility + ranking with readable denial reasons.
    'src/systems/tetherGameplay.js',
  ]);
  // src/combat/autoTargetMode.js was sanctioned for rung 08's pickMasslineAutoTarget(). That picker
  // wrote the GUN variable (state.player.targetId) from a LATCH decision, was never called from
  // src/, and has been deleted; scored acquisition is owned by the tether itself. Its entry is
  // REMOVED rather than left as a dormant permission, because the gunnery module is the one file
  // whose re-coupling this module's header (masslineTargetScoring.js:39-41) forbids by name:
  // "a locked gun must never steer massline target choice".
  //
  // DETECTOR, and why it is not a substring scan. This assertion used to fire on any file whose
  // text contained the string "masslineTargetScoring", which made it red on two comments that only
  // CITE the module as documentation — src/data/massSeed.js:48 ("… masslineTargetScoring.js,
  // MASSIVE_ANCHOR_MIN_MASS = 1800") and src/systems/massSeed.js:215 ("Massline scoring contract
  // seam (…)"). Neither imports anything; both are exactly the kind of cross-reference that makes
  // this contract legible, and the suite was punishing them. It matches import/export-from/dynamic
  // import/require specifiers now, which is what "imports this module" means. The allowlist and the
  // failure it produces for a real new importer are unchanged.
  const found = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      const st = statSync(p);
      if (st.isDirectory()) { if (!/node_modules|\.git/.test(p)) walk(p); continue; }
      if (!/\.(js|mjs)$/.test(name)) continue;
      if (p.endsWith('masslineTargetScoring.js')) continue;
      const text = readFileSync(p, 'utf8');
      if (IMPORT_FORMS.some((re) => re.test(text))) {
        found.push(relative(root, p).replace(/\\/g, '/'));
      }
    }
  };
  const root = fileURLToPath(new URL('..', import.meta.url));
  walk(join(root, 'src'));
  walk(join(root, 'scripts'));
  for (const f of found) {
    assert.ok(allowed.has(f), `unsanctioned importer: ${f}`);
  }
  // Non-vacuity: the detector must still SEE the sanctioned importers. A regex that matched nothing
  // would pass this test forever.
  assert.ok(found.includes('src/systems/tetherGameplay.js'),
    'detector must find the live latch importer');
  assert.ok(found.includes('scripts/check-massline-target-scoring.mjs'),
    'detector must find the rung-07 check script');
  // And it must not be reading prose: both massSeed files cite the module by path in a comment.
  assert.ok(!found.includes('src/data/massSeed.js') && !found.includes('src/systems/massSeed.js'),
    'a comment citing the module by path is not an import');
});

// ── §10 paint beats latch alone (round-3 gap: §3 only ever tested them combined) ───────────────

test('T03 §10: an explicit painted target beats latch stickiness with no intent vector in play', () => {
  const a = T('aa', 200, 0, { vz: 60 });
  const b = T('bb', -200, 0, { vz: -60 });
  // Symmetric candidates; aa holds the latch (+0.08), bb holds the paint (+0.15).
  const ranked = rankMasslineTargets(P(), [a, b], {
    isLatched: (t) => t.id === 'aa',
    preferredId: 'bb',
  });
  assert.equal(ranked[0].id, 'bb', 'paint (0.15) must beat the latched tiebreak (0.08)');
  // Both sides of the constant ordering: latch alone still beats a clean tie.
  const latchedOnly = rankMasslineTargets(P(), [a, b], { isLatched: (t) => t.id === 'aa' });
  assert.equal(latchedOnly[0].id, 'aa', 'latch alone wins a symmetric tie');
});
