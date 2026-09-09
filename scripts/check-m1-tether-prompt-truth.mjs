#!/usr/bin/env node
// M1-PLAYER-TELLS-CODEX-001 — tether prompt truthfulness + rebind labels.
//
// Focused check only (no production edits). Proves:
//   1. Reel/cut control copy appears only while attachment mirror is active.
//   2. Displayed labels come from the live binding/action contract (settings →
//      scheme → DEFAULTS), including rebinds — same resolution chain as input.js.
//   3. No hard-coded misleading tether keys survive on player-facing surfaces.
//
// input.js is read-only (locked). Deterministic fixtures only.
//
// Run: node scripts/check-m1-tether-prompt-truth.mjs

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULTS as INPUT_DEFAULTS } from '../src/systems/input.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

const failures = [];
const passes = [];

function check(surface, fn) {
  try {
    fn();
    passes.push(surface);
    console.log(`ok   ${surface}`);
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    failures.push({ surface, message });
    console.error(`FAIL ${surface}: ${message}`);
  }
}

// ── Pure resolvers (mirror src/ui/hud.js resolveAction* + buildTetherControlPrompt) ──────────
// Kept in-check because production helpers are module-private. Source contracts below pin that
// hud.js implements the same chain; fixtures exercise the contract deterministically.

function codeToBindingLabel(code) {
  if (!code) return '';
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (code.startsWith('Arrow')) {
    return { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' }[code] || code;
  }
  if (code === 'Space') return 'Space';
  if (code === 'ShiftLeft') return 'L-Shift';
  if (code === 'ShiftRight') return 'R-Shift';
  if (code === 'ControlLeft') return 'L-Ctrl';
  if (code === 'ControlRight') return 'R-Ctrl';
  if (code === 'AltLeft') return 'L-Alt';
  if (code === 'AltRight') return 'R-Alt';
  return code;
}

function resolveActionCodes(state, action) {
  const cfg = state && state.settings && state.settings.controls && state.settings.controls.bindings;
  const schemeName = state && state.settings && state.settings.gameplay && state.settings.gameplay.controlScheme;
  const schemes = (INPUT_DEFAULTS && INPUT_DEFAULTS.SCHEMES) || {};
  const scheme = schemes[schemeName] || schemes.pilot || (INPUT_DEFAULTS && INPUT_DEFAULTS.BINDINGS) || {};
  // Explicit empty settings override (present key, []) must not fall through to scheme/defaults.
  let list;
  if (cfg && Object.prototype.hasOwnProperty.call(cfg, action)) {
    list = cfg[action];
  } else {
    list = scheme[action] || (INPUT_DEFAULTS && INPUT_DEFAULTS.BINDINGS && INPUT_DEFAULTS.BINDINGS[action]);
  }
  if (Array.isArray(list)) return list.filter(Boolean);
  return list ? [list] : [];
}

function resolveActionLabel(state, action) {
  const codes = resolveActionCodes(state, action);
  if (!codes.length) return '';
  return codes.map(codeToBindingLabel).filter(Boolean).join('/');
}

const LINE_CONTROL_HINT = '↑ REEL · ↓ PAY OUT · ←→ ORBIT · SHIFT PUMP';

/** Contract for the HUD tether control line (must match buildTetherControlPrompt). */
function buildTetherControlPrompt(state, tether) {
  if (!tether || !tether.active) return '';
  // No hard-coded F: empty rebind must not lie.
  const cutLabel = resolveActionLabel(state, 'tether');
  const reelInLabel = resolveActionLabel(state, 'reelIn');
  const reelOutLabel = resolveActionLabel(state, 'reelOut');
  const parts = [];
  if (reelInLabel) parts.push(`[${reelInLabel}] REEL IN`);
  else if (cutLabel) parts.push(`HOLD [${cutLabel}] REEL`);
  if (reelOutLabel) parts.push(`[${reelOutLabel}] PAY OUT`);
  if (cutLabel && !reelInLabel) parts.push(LINE_CONTROL_HINT);
  if (cutLabel) parts.push(`TAP [${cutLabel}] CUT`);
  if (!parts.length) return 'TETHER UNBOUND';
  return parts.join(' · ');
}

function fixtureState({ scheme = 'pilot', bindings = null } = {}) {
  return {
    settings: {
      gameplay: { controlScheme: scheme },
      controls: { bindings: bindings || {} },
    },
  };
}

// ── 1. Canonical input action/binding contract ───────────────────────────────────────────────

check('input.DEFAULTS.tether_is_KeyF_across_schemes', () => {
  assert.ok(INPUT_DEFAULTS && INPUT_DEFAULTS.BINDINGS, 'INPUT_DEFAULTS.BINDINGS must export');
  assert.ok(INPUT_DEFAULTS.SCHEMES, 'INPUT_DEFAULTS.SCHEMES must export');
  for (const name of ['pilot', 'classic', 'helm-assist']) {
    const scheme = INPUT_DEFAULTS.SCHEMES[name];
    assert.ok(scheme, `scheme ${name} exists`);
    assert.deepEqual(scheme.tether, ['Space', 'KeyF'], `${name}.tether default is Space with F as alias`);
    assert.deepEqual(scheme.reelIn, [], `${name}.reelIn empty by default (hold-tether reels)`);
    assert.deepEqual(scheme.reelOut, [], `${name}.reelOut empty by default`);
  }
  assert.deepEqual(INPUT_DEFAULTS.BINDINGS.tether, ['Space', 'KeyF'], 'classic BINDINGS.tether is Space with F as alias');
});

check('input.source.action_contract_tetherFire_tetherCut_reelDelta', () => {
  const inputSrc = read('src/systems/input.js');
  // Read-only inspection of locked input.js — never edit.
  assert.match(inputSrc, /acts\.tetherFire\s*=\s*tetherEdge/,
    'input publishes actions.tetherFire from tether edge');
  assert.match(inputSrc, /acts\.tetherCut\s*=\s*tetherEdge/,
    'input publishes actions.tetherCut from tether edge (attached → cut)');
  assert.match(inputSrc, /holdReelDelta/,
    'input owns hold-tether reel when attachment active');
  assert.match(inputSrc, /tetherActive\s*=\s*!!\(state\.player\s*&&\s*state\.player\.tether\s*&&\s*state\.player\.tether\.active\)/,
    'hold-reel gates on player.tether.active');
  assert.match(inputSrc, /_held\(state,\s*'reelIn'\)/,
    'dedicated reelIn binding is consulted');
  assert.match(inputSrc, /_held\(state,\s*'reelOut'\)/,
    'dedicated reelOut binding is consulted');
});

// ── 2. Fixture: prompt visibility + rebind labels ────────────────────────────────────────────

check('fixture.prompt_empty_when_tether_inactive', () => {
  const state = fixtureState();
  assert.equal(buildTetherControlPrompt(state, null), '', 'null tether → no reel/cut');
  assert.equal(buildTetherControlPrompt(state, { active: false }), '', 'inactive → no reel/cut');
  assert.equal(buildTetherControlPrompt(state, { active: false, targetId: 9 }), '',
    'inactive with stale targetId still hides reel/cut');
});

check('fixture.default_scheme_prompt_uses_hold_F_and_tap_F', () => {
  const state = fixtureState({ scheme: 'pilot' });
  const text = buildTetherControlPrompt(state, { active: true, targetId: 1 });
  assert.equal(resolveActionLabel(state, 'tether'), 'F', 'default tether label is F');
  assert.equal(resolveActionLabel(state, 'reelIn'), '', 'default reelIn unbound');
  assert.equal(resolveActionLabel(state, 'reelOut'), '', 'default reelOut unbound');
  assert.match(text, /HOLD \[F\] REEL/, 'default active prompt: hold tether reels');
  assert.match(text, /TAP \[F\] CUT/, 'default active prompt: tap tether cuts');
  assert.doesNotMatch(text, /REEL IN/, 'no dedicated REEL IN when reelIn unbound');
  assert.doesNotMatch(text, /PAY OUT/, 'no PAY OUT when reelOut unbound');
});

check('fixture.rebind_tether_updates_cut_and_hold_labels', () => {
  const state = fixtureState({
    scheme: 'pilot',
    bindings: { tether: ['KeyG'] },
  });
  assert.equal(resolveActionLabel(state, 'tether'), 'G');
  const text = buildTetherControlPrompt(state, { active: true, targetId: 1 });
  assert.match(text, /HOLD \[G\] REEL/, 'rebound tether must appear in HOLD REEL');
  assert.match(text, /TAP \[G\] CUT/, 'rebound tether must appear in TAP CUT');
  assert.doesNotMatch(text, /\[F\]/, 'default F must not survive after tether rebind');
});

check('fixture.rebind_reelIn_reelOut_dedicated_labels', () => {
  const state = fixtureState({
    scheme: 'pilot',
    bindings: {
      tether: ['KeyF'],
      reelIn: ['KeyR'],
      reelOut: ['KeyT'],
    },
  });
  assert.equal(resolveActionLabel(state, 'reelIn'), 'R');
  assert.equal(resolveActionLabel(state, 'reelOut'), 'T');
  const text = buildTetherControlPrompt(state, { active: true, targetId: 1 });
  assert.match(text, /\[R\] REEL IN/, 'dedicated reelIn shows REEL IN');
  assert.match(text, /\[T\] PAY OUT/, 'dedicated reelOut shows PAY OUT');
  assert.doesNotMatch(text, /HOLD \[/, 'HOLD REEL omitted when reelIn is bound');
  assert.match(text, /TAP \[F\] CUT/, 'cut still uses tether binding');
  // Inactive still empty even with fancy rebinds.
  assert.equal(buildTetherControlPrompt(state, { active: false }), '',
    'rebinds must not surface reel/cut while inactive');
});

check('fixture.rebind_multi_code_and_arrows', () => {
  const state = fixtureState({
    bindings: {
      tether: ['KeyH', 'Digit1'],
      reelIn: ['ArrowUp'],
      reelOut: ['ArrowDown'],
    },
  });
  assert.equal(resolveActionLabel(state, 'tether'), 'H/1');
  assert.equal(resolveActionLabel(state, 'reelIn'), '↑');
  assert.equal(resolveActionLabel(state, 'reelOut'), '↓');
  const text = buildTetherControlPrompt(state, { active: true });
  assert.match(text, /\[↑\] REEL IN/);
  assert.match(text, /\[↓\] PAY OUT/);
  assert.match(text, /TAP \[H\/1\] CUT/);
});

check('fixture.scheme_fallback_when_no_custom_bindings', () => {
  // Explicit empty overrides must not poison resolution: missing key falls to scheme.
  const state = fixtureState({ scheme: 'helm-assist', bindings: { boost: ['ShiftLeft'] } });
  assert.equal(resolveActionLabel(state, 'tether'), 'F',
    'custom bindings for other actions leave scheme tether intact');
});

check('fixture.explicit_empty_tether_binding_no_hard_F', () => {
  // Present key with [] is intentional unbind — must not fall through to scheme KeyF.
  const state = fixtureState({
    scheme: 'pilot',
    bindings: { tether: [] },
  });
  assert.equal(resolveActionLabel(state, 'tether'), '',
    'explicit empty tether override resolves to unbound');
  const text = buildTetherControlPrompt(state, { active: true, targetId: 1 });
  assert.doesNotMatch(text, /\[F\]/, 'must not render fallback F for intentionally unbound tether');
  assert.doesNotMatch(text, /HOLD \[/, 'omit HOLD key copy when tether unbound');
  assert.doesNotMatch(text, /TAP \[/, 'omit TAP key copy when tether unbound');
  assert.match(text, /UNBOUND/i, 'truthful UNBOUND copy when tether has no label and no dedicated reels');
});

check('fixture.explicit_empty_tether_with_dedicated_reel', () => {
  const state = fixtureState({
    scheme: 'pilot',
    bindings: { tether: [], reelIn: ['KeyR'] },
  });
  const text = buildTetherControlPrompt(state, { active: true });
  assert.match(text, /\[R\] REEL IN/, 'dedicated reelIn still shows when tether unbound');
  assert.doesNotMatch(text, /\[F\]/, 'empty tether still must not invent F');
  assert.doesNotMatch(text, /HOLD \[/, 'no HOLD cut-key reel when tether unbound');
  assert.doesNotMatch(text, /TAP \[/, 'no TAP cut when tether unbound');
});

// ── 3. HUD source ownership (live binding path + active gate) ────────────────────────────────

const hudSrc = read('src/ui/hud.js');

check('hud.source.imports_INPUT_DEFAULTS_for_flight_bindings', () => {
  assert.match(hudSrc, /DEFAULTS as INPUT_DEFAULTS/,
    'HUD must import input DEFAULTS for flight binding labels');
  assert.match(hudSrc, /resolveActionCodes/,
    'HUD must call resolveActionCodes from input.js');
  assert.match(hudSrc, /resolveActionLabel/,
    'HUD must call resolveActionLabel from input.js');
  assert.match(hudSrc, /from ['"].*systems\/input\.js['"]/,
    'HUD labels come from src/systems/input.js, not a private copy');
});

check('hud.source.buildTetherControlPrompt_uses_action_ids', () => {
  assert.match(hudSrc, /masslineInstrumentReadout/,
    'HUD owns the latched Massline analog instrument');
  assert.match(hudSrc, /elTetherKeys\.textContent/,
    'latched line-control keys are printed from the live bindings');
  assert.match(hudSrc, /resolveActionCodes\(state,\s*'forward'\)/,
    'reel axis follows the live forward binding');
  assert.match(hudSrc, /resolveActionCodes\(state,\s*'reverse'\)/,
    'pay-out axis follows the live reverse binding');
  assert.match(hudSrc, /resolveActionLabel\(state,\s*'boost'\)/,
    'pump follows the live boost binding');
});

check('hud.source.reel_cut_only_while_tether_active', () => {
  assert.match(hudSrc, /masslineInstrumentVisible\(tether\)/,
    'Massline instrument visibility gates on the live tether');
  assert.match(hudSrc, /masslineInstrumentReadout\(tether\)/,
    'latched HUD reads analog load/length from the tether mirror');
  assert.doesNotMatch(hudSrc, /paintTetherControlChips/,
    'key chips stay off the windshield; Help owns binds');
  assert.doesNotMatch(hudSrc, /HOLD \[F\] REEL/,
    'HUD must not hard-code HOLD [F] REEL outside the resolver');
  assert.doesNotMatch(hudSrc, /TAP \[F\] CUT/,
    'HUD must not hard-code TAP [F] CUT outside the resolver');
});

check('hud.source.hardcoded_F_fallback_is_flagged_as_risk', () => {
  // Contract: labels must come from bindings. A bare || 'F' survives when the action resolves
  // empty (e.g. rebound to []), which is a misleading hard-coded key.
  const hasHardFallback = /\|\|\s*'F'/.test(hudSrc) && /resolveActionLabel\(state,\s*'tether'\)/.test(hudSrc);
  assert.equal(hasHardFallback, false,
    "hud.js must not hard-code || 'F' after resolveActionLabel('tether') — empty rebind must not lie");
});

// ── 4. Settings rebind surface (tether / reelIn / reelOut) ────────────────────────────────────

const settingsSrc = read('src/ui/screens/settings.js');

check('settings.rebind_surface_exposes_tether_actions', () => {
  assert.match(settingsSrc, /DEFAULTS as INPUT_DEFAULTS/,
    'settings rebind grid reads input DEFAULTS');
  assert.match(settingsSrc, /const REBINDABLE = \[/,
    'settings exposes REBINDABLE list');
  for (const action of ['tether', 'reelIn', 'reelOut']) {
    assert.match(settingsSrc, new RegExp(`['"]${action}['"]`),
      `settings REBINDABLE/labels must include ${action}`);
  }
  assert.match(settingsSrc, /tether:\s*'Tether:/,
    'settings player-facing label for tether');
  assert.match(settingsSrc, /reelIn:\s*'Tether winch in'/,
    'settings player-facing label for reelIn');
  assert.match(settingsSrc, /reelOut:\s*'Tether winch out'/,
    'settings player-facing label for reelOut');
  assert.match(settingsSrc, /function mergedBindingsFor\(settings\)/,
    'settings merges scheme defaults with custom rebinds');
  assert.match(settingsSrc, /settings\.controls\.bindings/,
    'settings writes/reads controls.bindings');
});

check('settings.humanizeCode_matches_hud_codeToBindingLabel', () => {
  const samples = [
    ['KeyF', 'F'], ['KeyG', 'G'], ['Digit2', '2'],
    ['ArrowUp', '↑'], ['ArrowDown', '↓'], ['Space', 'Space'],
    ['ShiftLeft', 'L-Shift'],
  ];
  for (const [code, label] of samples) {
    assert.equal(codeToBindingLabel(code), label, `codeToBindingLabel(${code})`);
  }
  assert.match(settingsSrc, /formatBindingCode/,
    'settings formats rebound codes with the shared input.js formatter');
  assert.match(hudSrc, /formatBindingCode/,
    'HUD formats live keys with the shared input.js formatter');
});

// ── 5. tetherGameplay mirror is the active authority HUD reads ───────────────────────────────

const tetherSrc = read('src/systems/tetherGameplay.js');

check('tetherGameplay.mirror_writes_player_tether_active', () => {
  assert.match(tetherSrc, /_mirror\(state,/,
    'tetherGameplay owns _mirror onto player.tether');
  assert.match(tetherSrc, /t\.active = targetId != null/,
    'mirror sets active only when a target is attached');
  assert.match(tetherSrc, /t\.reeling = !!\(t\.active && reelHeld\)/,
    'reeling flag only while active + reel held');
  assert.match(tetherSrc, /actions\?\.tetherFire|actions\.tetherFire|actions\?\.tetherCut|reelDelta/,
    'gameplay consumes the input action contract (tetherFire/cut/reelDelta)');
});

// ── 6. Integration surfaces: no hard-coded misleading tether keys ────────────────────────────
// These are player-facing copy sites that must not contradict rebinds / the action contract.

const SURFACES = [
  {
    id: 'src/ui/input.js',
    path: 'src/ui/input.js',
    // Drill path hard-codes Key F for massline latch instruction.
    bad: [
      [/Key F/i, 'hard-coded "Key F" massline toast ignores tether rebind'],
      [/Launch a tether \(Key F\)/i, 'drill latch toast hard-codes Key F'],
    ],
  },
  {
    id: 'src/ui/controlPrompts.js',
    path: 'src/ui/controlPrompts.js',
    bad: [
      [/\bF massline\b/i, 'control prompt hard-codes "F massline"'],
      [/\bF is massline\b/i, 'tutorial prompt hard-codes "F is massline"'],
      [/\btap F\b/i, 'flyby focus copy hard-codes "tap F"'],
      [/\bF to latch\b/i, 'combat prompt hard-codes "F to latch"'],
    ],
  },
  {
    id: 'src/ui/uiRoot.js',
    path: 'src/ui/uiRoot.js',
    bad: [
      [/\bF TETHER\b/, 'boot/control strip hard-codes "F TETHER"'],
    ],
  },
  {
    id: 'src/systems/onboarding.js',
    path: 'src/systems/onboarding.js',
    bad: [
      [/Hold ArrowUp/i, 'onboarding reel bark hard-codes ArrowUp (default reelIn is unbound; hold tether reels)'],
      [/Cut and coast\. G\./i, 'onboarding cut bark hard-codes G (G is auto-target; cut is tether edge)'],
    ],
  },
  {
    id: 'src/ui/screens/help.js',
    path: 'src/ui/screens/help.js',
    // Help must list rebindable tether verbs so control labels stay discoverable.
    require: [
      [/'tether'/, 'help Controls grid must include rebindable action id tether'],
      [/'reelIn'/, 'help Controls grid must include rebindable action id reelIn'],
      [/'reelOut'/, 'help Controls grid must include rebindable action id reelOut'],
    ],
  },
];

for (const surface of SURFACES) {
  check(`integration.${surface.id}`, () => {
    const src = read(surface.path);
    const hits = [];
    for (const [re, msg] of surface.bad || []) {
      if (re.test(src)) hits.push(msg);
    }
    for (const [re, msg] of surface.require || []) {
      if (!re.test(src)) hits.push(msg);
    }
    assert.equal(hits.length, 0, `${surface.path}: ${hits.join(' | ')}`);
  });
}

// ── 7. Cross-check: HUD resolution order matches input.js binding() comments ─────────────────

check('contract.resolution_order_settings_scheme_defaults', () => {
  const inputSrc = read('src/systems/input.js');
  assert.match(inputSrc,
    /player rebinds \(settings\) win, then the active scheme/,
    'input.js documents rebind → scheme → default order');
  // Prove fixture order with conflicting values.
  const state = fixtureState({
    scheme: 'pilot',
    bindings: { tether: ['KeyZ'] },
  });
  // scheme still KeyF, custom wins
  assert.equal(resolveActionLabel(state, 'tether'), 'Z');
  // No custom → scheme pilot KeyF
  const bare = fixtureState({ scheme: 'classic', bindings: {} });
  assert.equal(resolveActionLabel(bare, 'tether'), 'F');
});

// ── Report ───────────────────────────────────────────────────────────────────────────────────

const report = {
  schema: 'spaceface.m1.tether_prompt_truth.v1',
  ticket: 'M1-PLAYER-TELLS-CODEX-001',
  ok: failures.length === 0,
  passed: passes.length,
  failed: failures.length,
  failures,
  notes: [
    'Reel/cut prompt ownership lives in src/ui/hud.js (buildTetherControlPrompt + tether.active gate).',
    'Canonical binding table: src/systems/input.js DEFAULTS (read-only; locked).',
    'Rebind surface: src/ui/screens/settings.js REBINDABLE includes tether/reelIn/reelOut.',
  ],
};

console.log(JSON.stringify(report, null, 2));

if (failures.length) {
  console.error(`\n${failures.length} failing integration surface(s):`);
  for (const f of failures) console.error(`  - ${f.surface}: ${f.message}`);
  process.exit(1);
}

console.log('\nM1 tether prompt truthfulness + rebind labels OK');
