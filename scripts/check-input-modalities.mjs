// check-input-modalities.mjs — guards the input-modality contract (goal P1-12).
//
// SpaceFace supports THREE input modalities merged into one state.input: keyboard+mouse (always on),
// gamepad (navigator.getGamepads poller), and touch (virtual dual-stick + buttons for touchscreens).
// A modality can be silently dropped by a refactor that removes an import or a merge line — the
// player would just find controls dead with no error. This check pins the contract:
//   1. gamepad.js + touch.js exist and export their factory functions.
//   2. input.js imports BOTH factories and creates both in init.
//   3. input.js merges BOTH modalities' axes/actions in update() (grep for the merge lines).
//   4. saveSystem normalizes the settings.controls.gamepad + .touch objects (so a loaded save can't
//      crash the settings UI or the tick loops).
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

// 1. Both modality modules exist + export their factories.
assert.ok(existsSync(join(ROOT, 'src/systems/gamepad.js')), 'src/systems/gamepad.js must exist (gamepad modality)');
assert.ok(existsSync(join(ROOT, 'src/systems/touch.js')), 'src/systems/touch.js must exist (touch modality)');

const gamepadSrc = read('src/systems/gamepad.js');
const touchSrc = read('src/systems/touch.js');
assert.match(gamepadSrc, /export function createGamepad/, 'gamepad.js must export createGamepad');
assert.match(touchSrc, /export function createTouch/, 'touch.js must export createTouch');
assert.match(gamepadSrc, /mine:\s*\['l2'\]/, 'gamepad.js must map LT/L2 to the mining action');
assert.match(gamepadSrc, /countermeasure:\s*\['r3'\]/, 'gamepad.js must map R3 to the countermeasure action');
assert.doesNotMatch(gamepadSrc, /fire:\s*\[[^\]]*accept/, 'gamepad A/Cross should be dock/activate, not a second fire trigger');

// 2. input.js imports + creates both.
const inputSrc = read('src/systems/input.js');
assert.match(inputSrc, /import \{ createGamepad \} from '\.\/gamepad\.js'/, 'input.js must import createGamepad');
assert.match(inputSrc, /import \{ createTouch \} from '\.\/touch\.js'/, 'input.js must import createTouch');
assert.match(inputSrc, /this\.gamepad = createGamepad\(ctx\)/, 'input.js init must create the gamepad');
assert.match(inputSrc, /this\.touch = createTouch\(ctx\)/, 'input.js init must create the touch layer');
assert.match(inputSrc, /ctx\.touch = this\.touch/, 'input.js must expose touch on ctx (for Settings + UI)');

// 3. input.js merges BOTH modalities in update(). We check for the merge lines by the axis/action
//    references — these are the evidence the modality is actually read, not just created.
assert.match(inputSrc, /gp\.axes\.leftX/, 'input.js must merge gamepad left stick (gp.axes.leftX)');
assert.match(inputSrc, /gp\.actions\.fire/, 'input.js must merge gamepad fire action');
assert.match(inputSrc, /gp\.actions\.mine/, 'input.js must merge gamepad mine action');
assert.match(inputSrc, /this\._m2 \|\| gpMine \|\| tpMine/, 'input.js must route gamepad mine to fireGroup 2');
assert.match(inputSrc, /tp\.axes\.leftX/, 'input.js must merge touch left stick (tp.axes.leftX)');
assert.match(inputSrc, /tp\.actions\.fire/, 'input.js must merge touch fire action');
assert.match(inputSrc, /tp\.actions\.mine/, 'input.js must merge touch mine action (fireGroup 2)');
assert.match(inputSrc, /touchActive/, 'input.js must gate the touch merge on touchActive');
assert.match(inputSrc, /document\.getElementById\('gl-canvas'\)/, 'input.js must bind gameplay pointer capture to the WebGL canvas');
assert.match(inputSrc, /pointerSurface\.addEventListener\('mousedown'/, 'input.js must not use a window-wide gameplay mousedown listener');
assert.match(inputSrc, /isUiCommandTarget/, 'input.js must reject UI command targets before recording gameplay input');
assert.match(inputSrc, /ui-modal-open/, 'input.js must suppress gameplay input while modal UI owns focus');
assert.match(inputSrc, /inp\.brake/, 'input.js must publish deliberate brake intent for reverse/brake controls');

// 4. saveSystem normalizes both settings.controls objects (so a legacy/partial save can't crash).
const saveSrc = read('src/save/saveSystem.js');
assert.match(saveSrc, /s\.controls\.gamepad/, 'saveSystem must normalize settings.controls.gamepad');
assert.match(saveSrc, /s\.controls\.touch/, 'saveSystem must normalize settings.controls.touch');

// 5. Settings UI exposes toggles for both (so the player can enable/disable each).
const settingsSrc = read('src/ui/screens/settings.js');
const uiRootSrc = read('src/ui/uiRoot.js');
const uiInputSrc = read('src/ui/input.js');
const helpSrc = read('src/ui/screens/help.js');
const promptSrc = read('src/ui/controlPrompts.js');
const screenManagerSrc = read('src/ui/screenManager.js');
assert.match(settingsSrc, /Gamepad enabled/, 'Settings must expose a Gamepad enabled toggle');
assert.match(settingsSrc, /Touch controls/, 'Settings must expose a Touch controls toggle');
assert.doesNotMatch(settingsSrc, /rowToggle\('Touch controls'/, 'Touch controls must use a tri-state Auto/On/Off control, not the boolean toggle helper');
assert.match(settingsSrc, /touchModeLabel/, 'Touch controls must render Auto/On/Off labels');
assert.match(settingsSrc, /aria-pressed', mode === 'auto' \? 'mixed'/, 'Touch Auto state must use valid aria-pressed=mixed');
assert.match(touchSrc, /should !== this\._enabledByAuto \|\| this\.active !== should/, 'Touch auto-detect must reconcile the current overlay when returning from manual On/Off');
assert.match(touchSrc, /if \(on == null\) this\.autoDetect\(\);\s*else this\.setEnabled\(\!\!on\)/, 'Touch persistEnabled(null) must return to auto-detect immediately');
assert.match(touchSrc, /typeof navigator !== 'undefined'/, 'Touch auto-detect must guard navigator for headless Node harnesses');
assert.match(touchSrc, /Number\(win\.innerWidth\)/, 'Touch auto-detect must read dimensions from the guarded window object');
assert.match(uiRootSrc, /controlPrompt\('flight', 'kbm'\)/, 'UI root must source keyboard flight hints from controlPrompts.js');
assert.match(uiRootSrc, /controlPrompt\('flight', 'gamepad'\)/, 'UI root must source gamepad flight hints from controlPrompts.js');
assert.match(promptSrc, /RMB mine/, 'Keyboard flight hints must describe the mining control as mining, not sampling');
assert.match(promptSrc, /LT mine/, 'Gamepad flight hints must advertise LT/L2 mining');
assert.match(promptSrc, /A dock/, 'Gamepad flight hints must advertise A/Cross docking');
assert.match(promptSrc, /R3 countermeasure/, 'Gamepad flight/combat hints must advertise R3 countermeasure');
assert.match(promptSrc, /Mine button/, 'Touch flight hints must advertise the touch mining button');
assert.match(helpSrc, /Mine beam[\s\S]*LT \/ L2/, 'Help Controls must document gamepad mining');
assert.match(helpSrc, /Countermeasure[\s\S]*R3/, 'Help Controls must document gamepad countermeasure');
assert.match(helpSrc, /Dock \/ activate[\s\S]*A \/ X \(when prompted\)/, 'Help Controls must document gamepad dock/activate');
assert.match(uiInputSrc, /gp\.actions\.accept[\s\S]*dockInRange[\s\S]*doDock\(\)/,
  'UI input must let gamepad A/Cross dock when the dock prompt is active');
assert.match(uiInputSrc, /case BINDINGS\.dock\.key:\s*case BINDINGS\.dock\.label:\s*case 'Enter':/,
  'UI input must route the live dock key, visible dock label, and Enter to the dock action');
assert.match(uiInputSrc, /top === 'starmap'[\s\S]*gp\.actions\.map[\s\S]*screenManager\.popScreen\(\)/,
  'UI input must let gamepad View/Select close the Star Map after opening it');
assert.match(screenManagerSrc, /state\.mode === 'menu' && stack\.length === 1 && top\(\) === 'mainMenu'/,
  'ScreenManager must treat the root title menu as a locked modal route');
assert.match(uiInputSrc, /key === 'Escape'[\s\S]*screenManager\.locked[\s\S]*if \(locked\) return;[\s\S]*def && def\.id === 'station'[\s\S]*undock\(\)/,
  'Keyboard Escape must honor ScreenManager.locked() before popping so the root title menu cannot vanish');

console.log('Input modalities OK — keyboard+mouse (always) + gamepad (getGamepads) + touch (virtual sticks) all wired + merged + normalized.');
