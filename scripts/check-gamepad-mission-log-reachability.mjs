// check-gamepad-mission-log-reachability.mjs
//
// Deterministic contract check: a gamepad-only player can reach the Mission Log from flight
// using only shipped actions. Because src/ui/input.js and src/systems/input.js are owned by the
// lead, this route cannot add a direct gamepad Mission Log binding from here; the allowed product
// contract is Start → Pause → Mission Log. This check proves:
//   1. The gamepad layer exposes a Pause action, not a direct Mission Log action.
//   2. The Pause menu exposes Mission Log as a focusable button and focuses Resume on open.
//   3. Modal controller navigation (move focus + activate + cancel/back) is wired.
//   4. Control prompts and Help state the truthful two-step route, not "Start opens log".
//   5. The Mission Log screen can be dismissed, returning the player to Pause (then flight).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const uiInputSrc = read('src/ui/input.js');
const pauseSrc = read('src/ui/screens/pause.js');
const helpSrc = read('src/ui/screens/help.js');
const promptsSrc = read('src/ui/controlPrompts.js');
const screenManagerSrc = read('src/ui/screenManager.js');
const missionLogSrc = read('src/ui/screens/missionLog.js');

// 1. Gamepad mapping: Start is pause, and there is no direct Mission Log gamepad action.
assert.match(
  uiInputSrc,
  /gp\.actions\.pause[\s\S]*?screenManager\.pushScreen\('pause'\)/,
  'gamepad Start/Options must open the Pause screen'
);
assert.doesNotMatch(
  uiInputSrc,
  /gp\.actions\.missionLog/,
  'gamepad must not expose a direct missionLog action (route goes through Pause)'
);

// 2. Pause menu exposes Mission Log as a button, and onShow focuses the first item (Resume).
const missionLogButtonPattern = /mk\('Mission Log \(' \+ BINDINGS\.missionLog\.label \+ '\)'/;
assert.match(
  pauseSrc,
  missionLogButtonPattern,
  'pause menu must expose a Mission Log button'
);
assert.match(
  pauseSrc,
  /onShow\(ctx\)[\s\S]*?els\.bResume\.focus\(\)/,
  'pause menu must focus Resume on show so controller navigation starts deterministically'
);

// 3. Deterministic focus order: Resume is the first button, Mission Log appears before Help/Main Menu.
const resumeIdx = pauseSrc.indexOf("mk('Resume'");
const missionLogIdx = pauseSrc.search(missionLogButtonPattern);
assert.ok(resumeIdx >= 0, 'pause menu must contain a Resume button');
assert.ok(missionLogIdx > resumeIdx,
  'Mission Log button must be reachable by navigating down from Resume');

// 4. Controller modal navigation primitives exist in the UI input layer and screen manager.
assert.match(
  uiInputSrc,
  /function moveFocus/,
  'UI input must expose controller focus movement'
);
assert.match(
  uiInputSrc,
  /function activateFocused/,
  'UI input must expose controller activation (A/Cross)'
);
assert.match(
  uiInputSrc,
  /gp\.actions\.accept[\s\S]*?activateFocused/,
  'gamepad A/Cross must activate the focused Pause menu item'
);
assert.match(
  uiInputSrc,
  /gp\.actions\.cancel[\s\S]*?screenManager\.popScreen\(\)/,
  'gamepad B/Circle must pop back from the Pause stack'
);
assert.match(
  screenManagerSrc,
  /function _focusableInside/,
  'ScreenManager must enumerate focusable elements for modal navigation'
);
assert.match(
  screenManagerSrc,
  /function _ensureFocusIn/,
  'ScreenManager must keep focus trapped inside the active modal'
);

// 5. Truthful player-facing copy: the route is Start → Pause → Mission Log, never "Start opens log".
assert.match(
  promptsSrc,
  /Start → Pause → Mission Log/,
  'gamepad flight prompt must state the truthful Start → Pause → Mission Log route'
);
assert.match(
  promptsSrc,
  /flight: 'Left stick fly.*Start → Pause → Mission Log'/,
  'full gamepad flight prompt must teach the two-step Mission Log route'
);
assert.match(
  promptsSrc,
  /firstFlight: 'Left stick flies\. Right stick aims\.'/,
  'one-shot first-flight prompt should stay focused on the immediate flight verb instead of duplicating log navigation'
);
assert.doesNotMatch(
  promptsSrc,
  /Start opens pause\/log/,
  'gamepad prompts must not claim Start directly opens the Mission Log'
);
assert.match(
  helpSrc,
  /Start \/ Options → Pause → Mission Log/,
  'Help Controls must document the truthful gamepad route through Pause'
);

// 6. Back returns correctly from Mission Log to Pause (and then Pause to flight).
assert.match(
  missionLogSrc,
  /class="sf-mlog-close"/,
  'Mission Log must expose a visible Close button'
);
assert.match(
  missionLogSrc,
  /onKey[\s\S]*?mgr\.popScreen\(\)/,
  'Mission Log must pop back to Pause on its close key'
);
assert.match(
  missionLogSrc,
  /BINDINGS\.missionLog\.label/,
  'Mission Log close hint must use the live binding registry'
);

// Surface any out-of-scope stale copy without failing this reachability check.
const settingsSrc = read('src/ui/screens/settings.js');
if (settingsSrc.includes('Start pause/log')) {
  console.warn('note settings.js still contains "Start pause/log"; update out-of-scope to match the truthful route');
}

console.log('ok gamepad mission log reachability');
