import { BINDINGS } from './bindings.js';

const KBM_PROMPTS = Object.freeze({
  flight: `W/Up thrust  •  A D steer  •  Mouse aim  •  LMB/Space fire  •  RMB mine  •  Shift boost  •  X countermeasure  •  Tab target  •  ${BINDINGS.localmap.label} local map  •  ${BINDINGS.starmap.label} star map  •  ${BINDINGS.missionLog.label} log  •  ${BINDINGS.codex.label} codex  •  ${BINDINGS.cargo.label} cargo  •  ${BINDINGS.comms.label} comms`,
  mining: `RMB hold to mine  •  Release to cool  •  Fly through cargo drift  •  ${BINDINGS.drill.label} drill view  •  Tab next signal`,
  combat: 'LMB/Space fire  •  Mouse aim at target  •  Tab cycle hostiles  •  X countermeasure  •  G auto-target  •  Shift boost to dodge',
  station: `${BINDINGS.dock.label} dock  •  Hub: arrow keys change tabs  •  Enter/Space act  •  ${BINDINGS.dock.label}/Esc undock`,
  gate: `${BINDINGS.starmap.label} open Star Map  •  Select destination  •  Jump to travel between systems`,
  tutorialFlight: 'Follow the yellow nav arrow to the bad reading. W / Up thrusts, A D / arrows steer, and the mouse aims.',
  tutorialMine: 'The Kestrel is armed: LMB or Space fires the Pulse Laser S. Hold RMB on the marked rock to mine the mass reading, then collect the drift.',
  tutorialDock: `Follow the cyan station arrow. Press ${BINDINGS.dock.label} at the dock prompt. Bring the discrepancy back before someone edits it out.`,
  firstFlight: `W/Up to thrust, A D/arrows to steer, Mouse to aim, LMB/Space fires the Pulse Laser S, RMB mines marked rocks, Shift boosts, ${BINDINGS.localmap.label} opens the local map, ${BINDINGS.starmap.label} opens the star map, ${BINDINGS.missionLog.label} opens the Mission Log, ${BINDINGS.dock.label} docks.`,
  firstCombat: 'Hostile detected! LMB or Space to fire. G toggles auto-target — guns lock hostiles while you steer with the mouse.',
  firstStation: `Stations offer repairs, trading, upgrades, and mission boards. Press ${BINDINGS.dock.label} to dock; inside the hub, arrow keys change tabs, Enter/Space acts, and Departure Check shows what needs attention before ${BINDINGS.dock.label}/Escape undocks.`,
  firstGate: `Jump gates connect star systems. Open the Star Map (${BINDINGS.starmap.label}) to plot a jump route.`,
});

const GAMEPAD_PROMPTS = Object.freeze({
  flight: 'Left stick fly  •  Right stick aim  •  RT fire  •  LT mine  •  RB boost  •  LB brake  •  R3 countermeasure  •  A dock  •  X target  •  View star map  •  Y codex  •  Start pause/log',
  mining: 'LT hold to mine  •  Release to cool  •  Fly through cargo drift  •  X next signal',
  combat: 'RT fire  •  Right stick aim at target  •  X cycle targets  •  R3 countermeasure  •  RB boost to dodge  •  Start pause',
  station: 'A dock  •  Hub: LB/RB tabs  •  D-pad/left stick focus  •  A act  •  B undock',
  gate: 'View open Star Map  •  Select destination  •  Jump to travel between systems',
  tutorialFlight: 'Follow the yellow nav arrow to the bad reading. Left stick flies and right stick aims.',
  tutorialMine: 'The Kestrel is armed: RT fires the Pulse Laser S. Hold LT on the marked rock to mine the mass reading, then collect the drift.',
  tutorialDock: 'Follow the cyan station arrow. Press A at the dock prompt. Bring the discrepancy back before someone edits it out.',
  firstFlight: 'Left stick flies, right stick aims, RT fires the Pulse Laser S, LT mines marked rocks, RB boosts, View opens the star map, Start opens pause/log, and A docks.',
  firstCombat: 'Hostile detected! RT to fire. Hold right-stick aim on a target to lock on. X cycles targets.',
  firstStation: 'Stations offer repairs, trading, upgrades, and mission boards. Press A to dock; inside the hub, LB/RB changes tabs, D-pad or left stick moves focus, A acts, and Departure Check shows what needs attention before B undocks.',
  firstGate: 'Jump gates connect star systems. Press View to open the Star Map and plot a jump route.',
});

const TOUCH_PROMPTS = Object.freeze({
  flight: 'Left stick fly  •  Right stick aim  •  Fire button  •  Mine button  •  Boost button  •  Dock/Map/Log/Star/Pause buttons',
  mining: 'Mine button hold to mine  •  Release to cool  •  Fly through cargo drift  •  Touch target controls for signals',
  combat: 'Fire button  •  Right stick aim at target  •  Boost button to dodge',
  station: 'Dock button docks near stations  •  Hub: tap tabs/actions  •  Tap Undock when ready',
  gate: 'Star button opens Star Map  •  Select destination  •  Jump to travel between systems',
  tutorialFlight: 'Follow the yellow nav arrow to the bad reading. Left stick flies and right stick aims.',
  tutorialMine: 'The Kestrel is armed: Fire shoots the Pulse Laser S. Hold Mine on the marked rock to mine the mass reading, then collect the drift.',
  tutorialDock: 'Follow the cyan station arrow. Tap Dock when the station prompt appears. Bring the discrepancy back before someone edits it out.',
  firstFlight: 'Left stick flies, right stick aims, Fire shoots, Mine mines marked rocks, Boost dashes, Dock works at station prompts, Map opens the local map, Log opens the Mission Log, Star opens the star map, and Pause opens the menu.',
  firstCombat: 'Hostile detected! Fire to shoot. Hold right-stick aim on a target to lock on.',
  firstStation: 'Stations offer repairs, trading, upgrades, and mission boards. Tap Dock to enter; inside the hub, tap tabs and actions directly, then tap Undock when Departure Check looks safe.',
  firstGate: 'Jump gates connect star systems. Tap Star to open the Star Map and plot a jump route.',
});

// HELM ASSIST (GDD §4.1, the 2.0 default scheme) — kbm copy for "the nose follows the mouse".
// Only keys whose copy mentions movement are overridden; everything else falls through to the
// classic table. Keep verbs honest: don't promise mechanics that haven't shipped.
const KBM_HELM_OVERRIDES = Object.freeze({
  flight: `Mouse steer+aim  •  W thrust  •  S reverse  •  A D strafe  •  Space brake  •  LMB fire  •  RMB mine  •  Shift boost  •  F massline  •  MMB course/pursue  •  G combat computer  •  Tab target  •  ${BINDINGS.localmap.label} map  •  ${BINDINGS.starmap.label} chart`,
  combat: 'G combat computer (guns lead)  •  MMB pursue locked ship  •  F massline (soft latch; flyby focus expands it)  •  LMB fire  •  Space brake',
  tutorialFlight: 'Follow the yellow nav arrow. Nose follows the mouse — W thrusts, Space brakes. F is massline.',
  firstFlight: `Nose follows the mouse. W thrust, Space brake, Shift boost. F massline, G combat computer, MMB set course/pursue when targeted. ${BINDINGS.dock.label} docks.`,
  firstCombat: 'Hostile! G = combat computer (guns track). MMB pursues. At high speed a FLYBY FOCUS window opens — tap F to latch.',
});

// PILOT (the default scheme) — keyboard flies, mouse fights. Same override-only policy as helm.
const KBM_PILOT_OVERRIDES = Object.freeze({
  flight: `W thrust  •  A D turn  •  Space brake  •  Mouse aim  •  LMB fire  •  MMB pursue/course  •  G combat computer  •  F massline  •  Shift boost  •  Tab target  •  ${BINDINGS.localmap.label} map  •  ${BINDINGS.starmap.label} chart`,
  combat: 'MMB pursue locked ship  •  G combat computer  •  F massline (flyby focus expands latch)  •  LMB fire  •  flight keys break pursuit',
  tutorialFlight: 'Follow the yellow nav arrow. W thrusts; A/D turn; Space brakes; mouse aims; F is massline.',
  firstFlight: `W thrust, Space brake, A/D turn. Mouse aims. MMB pursue or set course to stations. G combat computer. F massline. ${BINDINGS.dock.label} docks.`,
  firstCombat: 'Lock target → MMB pursue. G combat computer for gun lead. High-speed pass triggers FLYBY FOCUS — F to latch.',
});

// Active kbm scheme — uiRoot keeps this current from settings (boot + settings:changed).
let _kbmScheme = 'pilot';
export function setPromptScheme(scheme) {
  _kbmScheme = (scheme === 'classic' || scheme === 'helm-assist' || scheme === 'pilot') ? scheme : 'pilot';
}

export const CONTROL_PROMPTS = Object.freeze({
  kbm: KBM_PROMPTS,
  gamepad: GAMEPAD_PROMPTS,
  touch: TOUCH_PROMPTS,
});

export function currentPromptModality(ctx = {}) {
  const touchConnected = !!(ctx.touch && typeof ctx.touch.isConnected === 'function' && ctx.touch.isConnected());
  const gamepadConnected = !!(ctx.gamepad && typeof ctx.gamepad.isConnected === 'function' && ctx.gamepad.isConnected());
  if (touchConnected && gamepadConnected) {
    return ((ctx.gamepad.lastActiveMs || 0) >= (ctx.touch.lastActiveMs || 0)) ? 'gamepad' : 'touch';
  }
  if (gamepadConnected) return 'gamepad';
  if (touchConnected) return 'touch';
  return 'kbm';
}

export function controlPrompt(key, modality = 'kbm') {
  if (modality === 'kbm' || !CONTROL_PROMPTS[modality]) {
    if (_kbmScheme === 'helm-assist' && KBM_HELM_OVERRIDES[key]) return KBM_HELM_OVERRIDES[key];
    if (_kbmScheme === 'pilot' && KBM_PILOT_OVERRIDES[key]) return KBM_PILOT_OVERRIDES[key];
  }
  const prompts = CONTROL_PROMPTS[modality] || CONTROL_PROMPTS.kbm;
  return prompts[key] || CONTROL_PROMPTS.kbm[key] || '';
}
