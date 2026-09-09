// UIUX-SETTINGS-CONTROLLER-TRUTH-TESTS-GROK-001
// Independent test lane: shipped Settings Controls copy must tell the truth about
// keyboard, gamepad, and touch routes for Pause vs Mission Log.
//
// Contract (Settings + live BINDINGS + modality truth):
//   1. Pause and Mission Log are separate rows / verbs (not conflated).
//   2. Keyboard interface shortcut labels derive from live BINDINGS where applicable.
//   3. Gamepad documents Start → Pause → Mission Log (no direct Mission Log button).
//   4. Touch documents a dedicated Log (Mission Log) button, separate from Pause.
//
// Does not edit production. Run:
//   node test/settings-controller-label-truth.test.mjs
// Adjacent checks (not modified by this lane):
//   npm run check:controls-discoverability
//   node scripts/check-gamepad-mission-log-reachability.mjs

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { BINDINGS } from '../src/ui/bindings.js';
import { CONTROL_SHORTCUTS } from '../src/ui/screens/settings.js';

const SETTINGS_SRC = readFileSync(
  fileURLToPath(new URL('../src/ui/screens/settings.js', import.meta.url)),
  'utf8',
);
const TOUCH_SRC = readFileSync(
  fileURLToPath(new URL('../src/systems/touch.js', import.meta.url)),
  'utf8',
);
const GAMEPAD_SRC = readFileSync(
  fileURLToPath(new URL('../src/systems/gamepad.js', import.meta.url)),
  'utf8',
);

const failures = [];
const passes = [];

function check(name, fn) {
  try {
    fn();
    passes.push(name);
  } catch (err) {
    failures.push({
      name,
      message: err && err.message ? err.message : String(err),
    });
  }
}

function byLabel(label) {
  return CONTROL_SHORTCUTS.find((row) => row.label === label);
}

// ── 1. Pause separated from Mission Log ─────────────────────────────────────

check('CONTROL_SHORTCUTS is a frozen non-empty roster', () => {
  assert.ok(Array.isArray(CONTROL_SHORTCUTS), 'CONTROL_SHORTCUTS must be an array');
  assert.ok(CONTROL_SHORTCUTS.length >= 2, 'roster must include at least Pause and Mission Log');
  assert.ok(Object.isFrozen(CONTROL_SHORTCUTS), 'roster must be frozen for a stable contract');
});

check('Mission Log and Pause are distinct shortcut rows', () => {
  const missionLog = byLabel('Mission Log');
  const pause = byLabel('Pause');
  assert.ok(missionLog, 'Mission Log row must exist');
  assert.ok(pause, 'Pause row must exist');
  assert.notEqual(missionLog, pause, 'rows must be distinct objects');
  assert.notEqual(missionLog.key, pause.key, 'keyboard keys must not collapse Pause into Mission Log');
  assert.notEqual(missionLog.label, pause.label, 'labels must stay separate');
});

check('Pause row documents pause menu only (not Mission Log as the key)', () => {
  const pause = byLabel('Pause');
  assert.equal(pause.key, 'Esc / P', 'Pause is UI-owned Esc/P, not a BINDINGS key');
  assert.match(pause.note, /pause menu/i, 'Pause note must describe the pause menu');
  assert.doesNotMatch(
    pause.note,
    /mission log/i,
    'Pause note must not rebrand Pause as Mission Log',
  );
  assert.doesNotMatch(
    pause.key,
    /mission|log|J/i,
    'Pause key column must not list the Mission Log binding',
  );
});

check('Mission Log row is not the Pause key', () => {
  const missionLog = byLabel('Mission Log');
  assert.notEqual(missionLog.key, 'Esc / P', 'Mission Log must not share the Pause key column');
  assert.doesNotMatch(missionLog.key, /Esc|Start|Options/i, 'Mission Log key column is keyboard/touch, not Start/Esc');
});

// ── 2. Keyboard labels from live BINDINGS ───────────────────────────────────

const BINDING_SHORTCUTS = Object.freeze([
  ['Dock / interact', 'dock'],
  ['Mission Log', 'missionLog'],
  ['Local Map', 'localmap'],
  ['Star Map', 'starmap'],
  ['Codex', 'codex'],
  ['Tech Tree', 'techTree'],
  ['Cargo Hold', 'cargo'],
  ['Comms Log', 'comms'],
  ['Drill / asteroid base', 'drill'],
  ['Claim / open base', 'claimBase'],
]);

check('interface shortcut keys match live BINDINGS labels', () => {
  for (const [label, action] of BINDING_SHORTCUTS) {
    const row = byLabel(label);
    assert.ok(row, `missing CONTROL_SHORTCUTS row: ${label}`);
    assert.ok(BINDINGS[action], `BINDINGS.${action} must exist`);
    assert.equal(
      row.key,
      BINDINGS[action].label,
      `${label} key must equal BINDINGS.${action}.label (live registry)`,
    );
  }
});

check('settings source wires those rows through BINDINGS.*.label (not hard-coded letters)', () => {
  for (const [, action] of BINDING_SHORTCUTS) {
    assert.match(
      SETTINGS_SRC,
      new RegExp(`BINDINGS\\.${action}\\.label`),
      `settings.js must reference BINDINGS.${action}.label for the fixed-shortcut roster`,
    );
  }
  // Pause stays UI-owned (Esc/P) — must not pretend to come from BINDINGS.
  assert.doesNotMatch(
    SETTINGS_SRC,
    /label:\s*'Pause'[\s\S]{0,80}BINDINGS\./,
    'Pause row must not derive its key from BINDINGS',
  );
  assert.match(
    SETTINGS_SRC,
    /label:\s*'Pause',\s*key:\s*'Esc \/ P'/,
    'Pause key must remain the documented Esc / P pair',
  );
});

// ── 3. Gamepad: Start → Pause → Mission Log (no direct Mission Log button) ──

const ROUTE = 'Start → Pause → Mission Log';

check('Mission Log note documents the truthful gamepad route through Pause', () => {
  const missionLog = byLabel('Mission Log');
  assert.match(
    missionLog.note,
    /gamepad:\s*Start → Pause → Mission Log/,
    'Mission Log note must state gamepad: Start → Pause → Mission Log',
  );
  assert.match(missionLog.note, /Start → Pause → Mission Log/, 'route arrow chain must be present');
});

check('Settings gamepad layout blurb uses the same Start → Pause → Mission Log route', () => {
  assert.match(
    SETTINGS_SRC,
    /Start → Pause → Mission Log/,
    'gamepad default-layout copy must include Start → Pause → Mission Log',
  );
  assert.match(
    SETTINGS_SRC,
    /Default layout:[\s\S]*Start → Pause → Mission Log/,
    'Default layout paragraph must end on the truthful Mission Log route',
  );
});

check('Settings does not claim a direct gamepad Mission Log button / Start-opens-log', () => {
  // Legacy conflation that the Settings diff intentionally removed.
  assert.doesNotMatch(
    SETTINGS_SRC,
    /Start pause\/log/i,
    'must not claim Start is pause/log (direct log open)',
  );
  assert.doesNotMatch(
    SETTINGS_SRC,
    /Start opens (the )?Mission Log/i,
    'must not claim Start opens Mission Log directly',
  );
  // Reject face/shoulder-button direct-log phrasing. The positive Pause hop is asserted above
  // against both the exported row and the rendered default-layout paragraph.
  assert.doesNotMatch(
    SETTINGS_SRC,
    /\b(View|Y|X|A|B|LB|RB|LT|RT|R3|L3)\b\s*(?:button\s*)?(?:opens?|→|=|:)\s*Mission Log/i,
    'must not bind Mission Log directly to a face/shoulder button',
  );
  // No exported gamepad missionLog action in the Settings surface.
  assert.doesNotMatch(
    SETTINGS_SRC,
    /gp\.actions\.missionLog|actions\.missionLog.*gamepad|gamepad.*missionLog\s*:/i,
    'Settings must not invent a direct gamepad missionLog action',
  );
});

check('runtime gamepad map supports Pause-only Start, not missionLog', () => {
  // Ground Settings copy against the shipped gamepad ACTION_MAP comments / verbs.
  assert.match(
    GAMEPAD_SRC,
    /Menu\s*\/\s*Start\s*->\s*pause/i,
    'gamepad.js must map Start/Menu to pause',
  );
  assert.doesNotMatch(
    GAMEPAD_SRC,
    /missionLog\s*:/,
    'gamepad.js must not expose a missionLog action (route is Pause menu)',
  );
});

// ── 4. Touch-label truth ────────────────────────────────────────────────────

check('Settings touch copy lists dedicated Log (Mission Log) and separate Pause', () => {
  assert.match(
    SETTINGS_SRC,
    /Log \(Mission Log\)/,
    'touch blurb must name Log as Mission Log (player-facing touch label truth)',
  );
  assert.match(
    SETTINGS_SRC,
    /buttons = fire, mine, boost, dock, Map, Log \(Mission Log\), Star, Pause/,
    'touch blurb must list Dock/Map/Log/Star/Pause as dedicated buttons',
  );
  // Touch has a direct Log button — unlike gamepad — and Pause stays separate.
  const touchBlurbMatch = SETTINGS_SRC.match(
    /Virtual sticks:[\s\S]*?Auto-enabled on touch devices\./,
  );
  assert.ok(touchBlurbMatch, 'touch virtual-sticks paragraph must exist');
  const touchBlurb = touchBlurbMatch[0];
  assert.match(touchBlurb, /Log \(Mission Log\)/, 'touch paragraph must include Log (Mission Log)');
  assert.match(touchBlurb, /\bPause\b/, 'touch paragraph must include Pause as its own button');
  assert.doesNotMatch(
    touchBlurb,
    /Start → Pause → Mission Log/,
    'touch must not reuse the gamepad Start→Pause→Log route (touch has a direct Log button)',
  );
});

check('touch runtime exposes missionLog + pause as separate actions/labels', () => {
  assert.match(
    TOUCH_SRC,
    /data-act="missionLog"[^>]*>Log</,
    'touch overlay Mission Log control must be labeled Log',
  );
  assert.match(
    TOUCH_SRC,
    /aria-label="Open Mission Log"/,
    'touch Log button accessible name must be Open Mission Log',
  );
  assert.match(
    TOUCH_SRC,
    /data-act="pause"[^>]*>Pause</,
    'touch overlay must expose a separate Pause button',
  );
  assert.match(
    TOUCH_SRC,
    /action === 'missionLog'/,
    'touch system must treat missionLog as a first-class action',
  );
});

// ── 5. Cross-modality consistency inside Settings source comments ───────────

check('Settings comments document modality truth (keyboard BINDINGS / gamepad route / no direct pad log)', () => {
  assert.match(
    SETTINGS_SRC,
    /Pause is Esc\/P \(UI-owned, not in BINDINGS\)/,
    'comment must state Pause is UI-owned Esc/P',
  );
  assert.match(
    SETTINGS_SRC,
    /gamepad has no direct Mission Log button/,
    'comment must state there is no direct gamepad Mission Log button',
  );
  assert.match(
    SETTINGS_SRC,
    /Start opens Pause, then choose Mission Log/,
    'comment must describe the Start → Pause → choose Mission Log route',
  );
  assert.match(
    SETTINGS_SRC,
    /Mission Log is chosen from the Pause menu \(no direct gamepad missionLog action\)/,
    'gamepad layout comment must forbid a direct missionLog action',
  );
});

// ── Report ──────────────────────────────────────────────────────────────────

const total = passes.length + failures.length;
console.log(`settings-controller-label-truth: ${passes.length}/${total} passed`);
for (const name of passes) console.log(`  ok  ${name}`);
if (failures.length) {
  console.log('');
  for (const f of failures) {
    console.log(`  FAIL ${f.name}`);
    console.log(`       ${f.message}`);
  }
  console.log('');
  console.log('MISMATCH: Settings/controller labels do not match the Pause vs Mission Log truth contract.');
  process.exit(1);
}

console.log('settings-controller-label-truth: all assertions green');
