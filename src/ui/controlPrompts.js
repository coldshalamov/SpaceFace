import { BINDINGS } from './bindings.js';
import {
  formatBindingCode,
  resolveActionCodes,
  resolveActionLabel,
  MOUSE_ACTION_LABELS,
} from '../systems/input.js';

function defaultPromptState(scheme) {
  return {
    settings: {
      gameplay: { controlScheme: scheme || 'pilot' },
      controls: { bindings: null },
    },
  };
}

function promptKey(state, action) {
  if (action === 'boost') {
    const codes = resolveActionCodes(state, action);
    if (codes.length && codes.every((c) => String(c).startsWith('Shift'))) return 'Shift';
  }
  return resolveActionLabel(state, action, { arrows: 'word' });
}

function firstKey(state, action) {
  const code = resolveActionCodes(state, action)[0];
  return code ? formatBindingCode(code, { arrows: 'word' }) : '';
}

function pairKeys(state, leftAction, rightAction) {
  return `${firstKey(state, leftAction)} ${firstKey(state, rightAction)}`.trim();
}

function schemeOf(state) {
  const s = state && state.settings && state.settings.gameplay && state.settings.gameplay.controlScheme;
  return (s === 'classic' || s === 'helm-assist' || s === 'pilot') ? s : 'pilot';
}

function buildKbmPrompts(state) {
  const scheme = schemeOf(state);
  const forward = promptKey(state, 'forward');
  const forwardFirst = firstKey(state, 'forward');
  const forwardSecond = formatBindingCode(resolveActionCodes(state, 'forward')[1], { arrows: 'word' });
  const reverse = promptKey(state, 'reverse');
  const brake = promptKey(state, 'brake');
  const yaw = pairKeys(state, 'yawLeft', 'yawRight');
  const strafe = pairKeys(state, 'strafeLeft', 'strafeRight');
  const fire = promptKey(state, 'fire') || MOUSE_ACTION_LABELS.fire;
  const mine = MOUSE_ACTION_LABELS.mine;
  const tether = promptKey(state, 'tether');
  const boost = promptKey(state, 'boost');
  const autoFire = promptKey(state, 'autoFire');
  const counter = promptKey(state, 'countermeasure');
  const seed = promptKey(state, 'deployMassSeed');
  const beam = promptKey(state, 'siteBeam');
  const maps = `${BINDINGS.localmap.label} local map  •  ${BINDINGS.starmap.label} star map  •  ${BINDINGS.missionLog.label} log  •  ${BINDINGS.codex.label} codex  •  ${BINDINGS.cargo.label} cargo  •  ${BINDINGS.comms.label} comms`;
  const mapChart = `${BINDINGS.localmap.label} map  •  ${BINDINGS.starmap.label} chart`;

  const classic = {
    flight: `${forward} thrust  •  ${brake} or ${reverse} brake  •  ${yaw} steer  •  Mouse aim  •  ${fire} fire  •  ${tether} Massline  •  ${seed} anchor seed  •  ${mine} mine  •  ${beam} selected Site beam  •  ${boost} boost  •  ${counter} countermeasure  •  Tab target  •  ${maps}`,
    mining: `${mine} hold to mine  •  ${beam} beam selected Site  •  Release to cool  •  Fly through cargo drift  •  ${BINDINGS.drill.label} drill view  •  Tab next signal`,
    combat: `${fire} fire  •  ${tether} Massline  •  Mouse aim at target  •  Tab cycle hostiles  •  ${counter} countermeasure  •  ${autoFire} auto-target  •  ${boost} boost to dodge`,
    station: `${BINDINGS.dock.label} dock  •  Hub: arrow keys change tabs  •  Enter/Space act  •  ${BINDINGS.dock.label}/Esc undock`,
    gate: `${BINDINGS.starmap.label} open Star Map  •  Select destination  •  Jump to travel between systems`,
    tutorialFlight: `Follow the yellow nav arrow to the bad reading. ${forwardSecond ? `${forwardFirst} / ${forwardSecond}` : forwardFirst} thrusts, ${yaw} steer, and the mouse aims.`,
    tutorialMine: `The Hitch is armed: ${fire} fires the Pulse Laser S. Hold ${mine} on the marked rock to mine the mass reading, then collect the drift.`,
    tutorialDock: `Follow the cyan station arrow. Press ${BINDINGS.dock.label} at the dock prompt. Bring the discrepancy back before someone edits it out.`,
    firstFlight: `${forwardFirst} thrusts. ${yaw} steer. Mouse aims.`,
    firstCombat: `Fire with ${fire}. ${tether} controls the Massline. ${autoFire} toggles auto-target.`,
    firstStation: `Review Departure Check before ${BINDINGS.dock.label} or Escape undocks.`,
    firstGate: `Open the Star Map (${BINDINGS.starmap.label}). Plot a gate route.`,
  };

  if (scheme === 'helm-assist') {
    return {
      ...classic,
      flight: `Mouse steer+aim  •  ${forwardFirst} thrust  •  ${brake} or ${reverse} brake  •  ${strafe} strafe  •  ${fire} fire  •  ${mine} mine  •  ${boost} boost  •  ${tether} Massline  •  ${seed} anchor seed  •  ${autoFire} auto-target  •  Draw with pointer to fly; pause to clutch  •  Tab target  •  ${mapChart}`,
      combat: `${autoFire} auto-target (guns track lock)  •  Draw with pointer to fly; pause to clutch  •  ${tether} Massline  •  ${fire} fire  •  ${brake} or ${reverse} brake`,
      tutorialFlight: `Follow the yellow nav arrow. Nose follows the mouse — ${forwardFirst} thrusts, ${brake} or ${reverse} brakes, ${tether} controls the Massline.`,
      firstFlight: `Nose follows the mouse. ${forwardFirst} thrusts. ${brake} or ${reverse} brakes to a stop.`,
      firstCombat: `${autoFire} toggles auto-target. Guns track lock.`,
    };
  }
  if (scheme === 'pilot') {
    return {
      ...classic,
      flight: `${forwardFirst} thrust  •  ${brake} or ${reverse} brake  •  ${yaw} turn  •  Mouse aim  •  ${fire} fire  •  ${autoFire} auto-target  •  Draw with pointer to fly; pause to clutch  •  ${tether} Massline  •  ${seed} anchor seed  •  ${boost} boost  •  Tab target  •  ${mapChart}`,
      combat: `${autoFire} auto-target (guns track lock)  •  Draw with pointer to fly; pause to clutch  •  ${tether} Massline  •  ${fire} fire`,
      tutorialFlight: `Follow the yellow nav arrow. ${forwardFirst} thrusts; ${brake} or ${reverse} brakes; ${yaw.replace(' ', '/')} turns; mouse aims; ${tether} controls the Massline.`,
      firstFlight: `${forwardFirst} thrusts. ${brake} or ${reverse} brakes to a stop. ${yaw} turn. Mouse aims.`,
      firstCombat: `${autoFire} toggles auto-target. Guns track lock.`,
    };
  }
  return classic;
}

const GAMEPAD_PROMPTS = Object.freeze({
  flight: 'Left stick fly  •  Right stick aim  •  RT fire  •  LT mine / selected Site beam  •  RB boost  •  LB brake  •  R3 countermeasure  •  A/Cross Massline (dock/accept when prompted)  •  X target  •  View star map  •  Y codex  •  Start → Pause → Mission Log',
  mining: 'LT hold to mine  •  Release to cool  •  Fly through cargo drift  •  X next signal',
  combat: 'RT fire  •  Right stick aim at target  •  X cycle targets  •  R3 countermeasure  •  RB boost to dodge  •  Start pause',
  station: 'A dock  •  Hub: LB/RB tabs  •  D-pad/left stick focus  •  A act  •  B undock',
  gate: 'View open Star Map  •  Select destination  •  Jump to travel between systems',
  tutorialFlight: 'Follow the yellow nav arrow to the bad reading. Left stick flies and right stick aims.',
  tutorialMine: 'The Hitch is armed: RT fires the Pulse Laser S. Hold LT on the marked rock to mine the mass reading, then collect the drift.',
  tutorialDock: 'Follow the cyan station arrow. Press A at the dock prompt. Bring the discrepancy back before someone edits it out.',
  firstFlight: 'Left stick flies. Right stick aims.',
  firstCombat: 'Fire with RT. X cycles targets.',
  firstStation: 'Review Departure Check before B undocks.',
  firstGate: 'Open the Star Map with View. Plot a gate route.',
});

const TOUCH_PROMPTS = Object.freeze({
  flight: 'Left stick fly  •  Right stick aim  •  Fire button  •  Mine button  •  Boost button  •  Dock/Map/Log/Star/Pause buttons',
  mining: 'Mine button hold to mine  •  Release to cool  •  Fly through cargo drift  •  Touch target controls for signals',
  combat: 'Fire button  •  Right stick aim at target  •  Boost button to dodge',
  station: 'Dock button docks near stations  •  Hub: tap tabs/actions  •  Tap Undock when ready',
  gate: 'Star button opens Star Map  •  Select destination  •  Jump to travel between systems',
  tutorialFlight: 'Follow the yellow nav arrow to the bad reading. Left stick flies and right stick aims.',
  tutorialMine: 'The Hitch is armed: Fire shoots the Pulse Laser S. Hold Mine on the marked rock to mine the mass reading, then collect the drift.',
  tutorialDock: 'Follow the cyan station arrow. Tap Dock when the station prompt appears. Bring the discrepancy back before someone edits it out.',
  firstFlight: 'Left stick flies. Right stick aims.',
  firstCombat: 'Tap Fire. Aim with the right stick.',
  firstStation: 'Review Departure Check, then tap Undock.',
  firstGate: 'Tap Star. Plot a gate route.',
});

// Active kbm scheme — uiRoot keeps this current from settings (boot + settings:changed).
let _kbmScheme = 'pilot';
let _promptState = null;

export function setPromptScheme(scheme) {
  _kbmScheme = (scheme === 'classic' || scheme === 'helm-assist' || scheme === 'pilot') ? scheme : 'pilot';
}

/** Live bindings pointer so a remap re-labels every prompt without a restart. */
export function setPromptBindings(state) {
  _promptState = state || null;
}

export const CONTROL_PROMPTS = Object.freeze({
  kbm: buildKbmPrompts(defaultPromptState('classic')),
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

export function controlPrompt(key, modality = 'kbm', state = null) {
  if (modality === 'kbm' || !CONTROL_PROMPTS[modality]) {
    const live = state || _promptState || defaultPromptState(_kbmScheme);
    const built = buildKbmPrompts(live);
    if (built[key]) return built[key];
  }
  const prompts = CONTROL_PROMPTS[modality] || CONTROL_PROMPTS.kbm;
  return prompts[key] || CONTROL_PROMPTS.kbm[key] || '';
}
