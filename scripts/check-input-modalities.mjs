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

function ok(label) {
  console.log(`ok   ${label}`);
}

function installLoggedAsserts() {
  for (const method of ['ok', 'equal', 'notEqual', 'deepEqual', 'match', 'doesNotMatch', 'throws', 'doesNotThrow']) {
    if (typeof assert[method] !== 'function') continue;
    const orig = assert[method].bind(assert);
    assert[method] = (...args) => {
      const out = orig(...args);
      const msg = [...args].reverse().find((a) => typeof a === 'string') || `assert.${method}`;
      ok(msg);
      return out;
    };
  }
}
installLoggedAsserts();

// 1. Both modality modules exist + export their factories.
assert.ok(existsSync(join(ROOT, 'src/systems/gamepad.js')), 'src/systems/gamepad.js must exist (gamepad modality)');
assert.ok(existsSync(join(ROOT, 'src/systems/touch.js')), 'src/systems/touch.js must exist (touch modality)');

const gamepadSrc = read('src/systems/gamepad.js');
const touchSrc = read('src/systems/touch.js');
assert.match(gamepadSrc, /export function createGamepad/, 'gamepad.js must export createGamepad');
assert.match(touchSrc, /export function createTouch/, 'touch.js must export createTouch');
assert.match(gamepadSrc, /mine:\s*\['l2'\]/, 'gamepad.js must map LT/L2 to the mining action');
assert.match(gamepadSrc, /countermeasure:\s*\['r3'\]/, 'gamepad.js must map R3 to the countermeasure action');
assert.match(gamepadSrc, /tabPrev:\s*\['l1'\]/, 'gamepad LB/L1 must expose station tab-previous UI intent');
assert.match(gamepadSrc, /tabNext:\s*\['r1'\]/, 'gamepad RB/R1 must expose station tab-next UI intent');
assert.doesNotMatch(gamepadSrc, /fire:\s*\[[^\]]*accept/, 'gamepad A/Cross should be dock/activate, not a second fire trigger');

// 2. input.js imports + creates both.
const inputSrc = read('src/systems/input.js');
const stylesSrc = read('styles/ui.css');
const gameStateSrc = read('src/core/gameState.js');
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
assert.match(inputSrc, /const arrowYaw/, 'Input must explicitly route bare left/right arrows to yaw');
assert.match(inputSrc, /const arrowStrafe/, 'Input must explicitly route W/forward + left/right arrows to strafe');
assert.match(inputSrc, /arrowYaw\s*=\s*!up/, 'Arrow yaw must only apply when forward thrust is not held');
assert.match(inputSrc, /arrowStrafe\s*=\s*up/, 'Arrow strafe must apply while forward thrust is held');
assert.match(inputSrc, /this\._heldExcept\(state, 'yawRight', 'ArrowRight'\)/,
  'Classic yaw bindings must exclude ArrowRight so W+ArrowRight can strafe instead');
assert.match(inputSrc, /this\._heldExcept\(state, 'yawLeft', 'ArrowLeft'\)/,
  'Classic yaw bindings must exclude ArrowLeft so W+ArrowLeft can strafe instead');
assert.match(inputSrc, /syncPointerScreen\(this\.state, e\.clientX, e\.clientY\)/,
  'pointer movement must update state.input.pointerScreen immediately so the software reticle tracks the OS cursor');
assert.match(stylesSrc, /body\.sf-flight-cursor[\s\S]*cursor:\s*none/,
  'flight cursor mode must hide the OS cursor so the software bullseye is the cursor');
assert.match(inputSrc, /G auto-target/,
  'input.js header must describe G as auto-target, not legacy auto-fire');
assert.match(inputSrc, /F tether/,
  'input.js header must describe F as tether latch/cut');
assert.match(inputSrc, /autopursuit:\s*\[\]/,
  'G must remain auto-target-only; autopursuit is held by MMB so arrow pilots keep flight control');
const autoTargetAssistSrc = read('src/systems/autoTargetAssist.js');
const autoTargetModeSrc = read('src/combat/autoTargetMode.js');
const registrySrc = read('src/core/registry.js');
const mainSrc = read('src/main.js');
assert.doesNotMatch(inputSrc, /ui:targetNearestHostileToPlayer/,
  'lead-owned input.js must not own auto-target hostile acquisition');
assert.match(autoTargetModeSrc, /ui:targetNearestHostileToPlayer/,
  'autoTargetMode must request the hostile nearest the player');
assert.match(autoTargetModeSrc, /quiet:\s*true/,
  'autoTargetMode must keep quietly refreshing nearest-hostile lock while active');
assert.match(autoTargetModeSrc, /inp\.autoFire[\s\S]*cursorAngle[\s\S]*inp\.turnIntent/,
  'auto-target must steer the ship toward the cursor while weapons aim at the locked hostile');
assert.match(autoTargetModeSrc, /inp\.autoFire = !inp\.autoFire/,
  'auto-target toggle must always flip auto-target without autopursuit guards');
assert.match(autoTargetAssistSrc, /toggleAutoTarget/,
  'autoTargetAssist shell must delegate auto-target toggle to autoTargetMode');
assert.doesNotMatch(autoTargetAssistSrc, /autopursuitHeld/,
  'autoTargetAssist auto-target toggle must not be gated on MMB/autopursuit state');
assert.match(registrySrc, /input,\s*autoTargetAssist,\s*scanner/,
  'registry UPDATE_ORDER must run autoTargetAssist immediately after input');
assert.match(registrySrc, /input, autoTargetAssist/,
  'registry SYSTEMS init must call autoTargetAssist.init for auto-target capture listeners');
assert.match(registrySrc, /destroy\(\)/,
  'registry must expose destroy() so capture-phase listeners do not stack on re-init');
assert.match(autoTargetAssistSrc, /if \(this\._onKeyDown\) this\.destroy\(\)/,
  'autoTargetAssist.init must tear down prior listeners before re-attaching');
assert.match(mainSrc, /registry\.destroy\(\)/,
  'main.js must call registry.destroy on teardown so capture-phase auto-target listeners do not leak');
assert.match(mainSrc, /resetCombatInputMode/,
  'main.js must reset auto-target state on new game / loaded game entry');

// 4. saveSystem normalizes both settings.controls objects (so a legacy/partial save can't crash).
const saveSrc = read('src/save/saveSystem.js');
assert.match(saveSrc, /s\.controls\.gamepad/, 'saveSystem must normalize settings.controls.gamepad');
assert.match(saveSrc, /s\.controls\.touch/, 'saveSystem must normalize settings.controls.touch');
assert.match(gameStateSrc, /controlScheme:\s*'pilot'/,
  'new game defaults must make the pilot keyboard-flight/mouse-target scheme explicit');
assert.match(saveSrc, /const DEFAULT_CONTROL_SCHEME = 'pilot'/,
  'saveSystem must normalize restored control schemes to the pilot default');
assert.match(saveSrc, /VALID_CONTROL_SCHEMES = new Set\(\['pilot', 'helm-assist', 'classic'\]\)/,
  'saveSystem must whitelist every shipped control scheme');
assert.match(saveSrc, /controlSchemeV2[\s\S]*DEFAULT_CONTROL_SCHEME[\s\S]*VALID_CONTROL_SCHEMES\.has\(s\.gameplay\.controlScheme\)/,
  'saveSystem must migrate old ambient helm-assist saves while preserving explicit v2 choices');
assert.match(saveSrc, /controlScheme:\s*s\.gameplay && s\.gameplay\.controlScheme/,
  'profile settings snapshots must persist explicit control-scheme choices');

// 5. Settings UI exposes toggles for both (so the player can enable/disable each).
const settingsSrc = read('src/ui/screens/settings.js');
const weaponsSrc = read('src/systems/weapons.js');
const uiRootSrc = read('src/ui/uiRoot.js');
const uiInputSrc = read('src/ui/input.js');
const helpSrc = read('src/ui/screens/help.js');
const promptSrc = read('src/ui/controlPrompts.js');
const screenManagerSrc = read('src/ui/screenManager.js');
const localmapSrc = read('src/ui/screens/localmap.js');
assert.match(uiRootSrc, /function targetNearestHostileToPlayer/,
  'UI root must implement player-nearest hostile selection for auto-target');
assert.match(uiRootSrc, /ui:targetNearestHostileToPlayer[\s\S]*quiet[\s\S]*targetNearestHostileToPlayer/,
  'UI root must route quiet player-target refreshes without toast spam');
assert.match(uiRootSrc, /isHostileToPlayer[\s\S]*bestD2/,
  'auto-target must filter hostiles and rank by distance to the player');
assert.match(uiRootSrc, /cycleTarget[\s\S]*isHostileToPlayer/,
  'Tab target cycle must advance only among nearby hostile contacts');
assert.match(uiRootSrc, /isScannerHostileLock[\s\S]*quiet\) return/,
  'quiet auto-target refresh must keep a live Tab lock instead of re-picking nearest');
assert.match(weaponsSrc, /SCANNER_CONTACT_RANGE/,
  'auto-target selected lock must use scanner range, not weapon range only');
assert.match(uiRootSrc, /bus && !quiet/,
  'quiet cursor-target refreshes must not emit target toasts every tick');
assert.match(settingsSrc, /Gamepad enabled/, 'Settings must expose a Gamepad enabled toggle');
assert.match(settingsSrc, /Touch controls/, 'Settings must expose a Touch controls toggle');
assert.match(settingsSrc, /s\.gameplay\.controlScheme \|\| 'pilot'/,
  'Settings must display pilot as the default control scheme');
assert.match(settingsSrc, /\['pilot', 'Pilot \(keyboard steers, mouse aims\)'\]/,
  'Settings must expose the pilot keyboard-flight/mouse-target control scheme');
assert.match(settingsSrc, /function controlSchemeFor\(settings\)[\s\S]*INPUT_DEFAULTS\.SCHEMES/,
  'Settings rebind defaults must come from the active input control scheme');
assert.match(settingsSrc, /const \{ base, live \} = mergedBindingsFor\(s\)/,
  'Settings rebind grid must display scheme defaults overlaid with saved overrides');
assert.match(settingsSrc, /const schemeBase = base \|\| schemeBindingsFor\(s\)/,
  'Settings key capture must preserve the selected scheme secondary bindings');
assert.match(settingsSrc, /controlSchemeV2[\s\S]*this\._render\(ctx\)/,
  'Settings must redraw the rebind grid immediately when the control scheme changes');
assert.doesNotMatch(settingsSrc, /for \(const a in DEFAULT_BINDINGS\) live\[a\]/,
  'Settings must not seed the rebind grid only from the legacy/global binding table');
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
assert.match(promptSrc, /opens the Mission Log/, 'Keyboard first-flight hint must teach the objective-home shortcut before the player docks');
assert.match(promptSrc, /LT mine/, 'Gamepad flight hints must advertise LT/L2 mining');
assert.match(promptSrc, /A dock/, 'Gamepad flight hints must advertise A/Cross docking');
assert.match(promptSrc, /R3 countermeasure/, 'Gamepad flight/combat hints must advertise R3 countermeasure');
assert.match(promptSrc, /Start pause\/log/, 'Gamepad flight hints must surface the Mission Log route through Pause');
assert.match(promptSrc, /Start opens pause\/log/, 'Gamepad first-flight hint must teach the controller path to Mission Log');
assert.match(settingsSrc, /Start pause\/log/, 'Gamepad settings copy must match the shipped Start pause/log route');
assert.match(promptSrc, /Mine button/, 'Touch flight hints must advertise the touch mining button');
assert.match(touchSrc, /data-act="localmap"/, 'Touch overlay must expose a Local Map menu button');
assert.match(touchSrc, /data-act="missionLog"/, 'Touch overlay must expose a Mission Log menu button');
assert.match(touchSrc, /data-act="starmap"/, 'Touch overlay must expose a Star Map menu button');
assert.match(touchSrc, /data-act="dock"/, 'Touch overlay must expose a Dock button for the first station handoff');
assert.match(touchSrc, /data-act="pause"/, 'Touch overlay must expose a Pause button');
assert.match(touchSrc, /_btnPulse/, 'Touch buttons must queue one-shot pressed edges for quick taps');
assert.match(touchSrc, /this\._btnPulse\[act\] = true/, 'Touch button touchstart must queue a pressed pulse');
assert.match(touchSrc, /bus\.emit\('touch:uiAction', \{ action: act \}\)/,
  'Touch menu buttons must emit immediate UI intents for tap-only actions');
assert.match(touchSrc, /\['fire', 'mine', 'boost', 'dock', 'localmap', 'missionLog', 'starmap', 'pause'\]/,
  'Touch tick must compute pressed/released edges for flight and menu buttons');
assert.match(touchSrc, /pressed: pulse \|\| \(held && !prev\)/,
  'Touch tick must consume queued pulses as pressed edges');
assert.match(uiInputSrc, /bus\.on\('touch:uiAction'[\s\S]*routeTouchUiAction\(action\)/,
  'UI input must listen for immediate touch menu intents');
assert.match(uiInputSrc, /function routeTouchUiAction\(action\)/,
  'UI input must centralize touch menu routing through shared modal and flight guards');
assert.match(uiInputSrc, /action === 'dock'[\s\S]*dockInRange[\s\S]*doDock\(\)/,
  'UI input must route the touch Dock button through the shared docking path');
assert.match(uiInputSrc, /touchActionPressed\('missionLog'\)[\s\S]*openScreenFromTouch\('missionLog'\)/,
  'UI input must route the touch Log button to the shared Mission Log screen');
assert.match(uiInputSrc, /touchActionPressed\('localmap'\)[\s\S]*openScreenFromTouch\('localmap'\)/,
  'UI input must route the touch Map button to the shared Local Map screen');
assert.match(uiInputSrc, /touchActionPressed\('starmap'\)[\s\S]*openScreenFromTouch\('starmap'\)/,
  'UI input must route the touch Star button to the shared Star Map screen');
assert.match(uiInputSrc, /touchActionPressed\('pause'\)[\s\S]*openScreenFromTouch\('pause'\)/,
  'UI input must route the touch Pause button to the shared Pause screen');
assert.match(localmapSrc, /<button class="lm-close" type="button" aria-label="Close Local Map">Close \(\$\{localMapKey\}\)<\/button>/,
  'Local Map must keep a visible close button with a concrete assistive label for touch-opened map recovery');
assert.match(localmapSrc, /press \$\{localMapKey\} or Esc to close/,
  'Local Map header must keep teaching keyboard close recovery');
assert.match(localmapSrc, /key === BINDINGS\.localmap\.key/,
  'Local Map key close handler must keep reading the shared binding registry');
assert.match(promptSrc, /Dock\/Map\/Log\/Star\/Pause buttons/, 'Touch flight hints must match the actual touch menu buttons');
assert.match(promptSrc, /Tap Dock when the station prompt appears/, 'Touch tutorial docking copy must teach the touch Dock button');
assert.match(promptSrc, /Log opens the Mission Log/, 'Touch first-flight hint must teach the objective-home button');
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

// 6. Controller parity for the docked station rail: LB/RB should cycle the same authored tablist
// that keyboard navigation and mouse clicks use, without inventing another station route.
assert.match(uiInputSrc, /function cycleStationTab\(dir\)/, 'UI input must support cycling docked station tabs from gamepad');
assert.match(uiInputSrc, /root\.dataset\.screen !== 'station'/, 'station tab cycling must only run on the station screen');
assert.match(uiInputSrc, /gp\.actions\.tabPrev[\s\S]*cycleStationTab\(-1\)/, 'station hub must support LB/L1 previous-tab cycling');
assert.match(uiInputSrc, /gp\.actions\.tabNext[\s\S]*cycleStationTab\(1\)/, 'station hub must support RB/R1 next-tab cycling');

console.log('Input modalities OK — keyboard+mouse + gamepad + touch are wired, normalized, and station controller tab parity is guarded.');
