// ui-bench.js — the 2D UI workbench: mount a real screen over a frozen still, click everything,
// read what each control asked for. No boot, no simulation, no renderer.
//
// WHY: looking at a screen in the real game costs a 30 s boot and lands you in one state, so the
// only cheap feedback an agent had was the code — which is how UI work turns into blind restyling.
// This page mounts the same screen module the game mounts, with a real `GameState` and the real
// kit stylesheets, over a still you can point at any capture. Reload resets. Nothing here is
// evidence about the LIVE route: it is a bench for composition, type, spacing, hover/focus and
// "what does this control do". Live acceptance stays with `ui-look` / `ui:stills` (see
// docs/UI_VISUAL_ITERATION.md, and src/ui/AGENTS.md §Seeing the UI).
//
// Usage:  node scripts/ui-bench.mjs            (starts the server, prints the URL)
//         http://127.0.0.1:<port>/tools/ui-bench.html?screen=pause
//         ?screen=pause&bg=.devshots/ui-stills/flight.png   — any still as the held world

import { createGameState } from '../src/core/gameState.js';
import { injectHudCss } from '../src/ui/views/hudStyles.js';

/** Screens this bench can mount. A screen that needs a live run (docking, a Crucible run) is
 *  listed as unavailable on purpose: better an honest hole than a fake that looks finished. */
const SCREENS = Object.freeze({
  mainMenu: () => import('../src/ui/screens/mainMenu.js').then((m) => m.mainMenuScreen),
  motionAsk: () => import('../src/ui/screens/motionAsk.js').then((m) => m.motionAskScreen),
  newGame: () => import('../src/ui/screens/newGame.js').then((m) => m.newGameScreen),
  pause: () => import('../src/ui/screens/pause.js').then((m) => m.pauseScreen),
  settings: () => import('../src/ui/screens/settings.js').then((m) => m.settingsScreen),
  saveLoad: () => import('../src/ui/screens/saveLoad.js').then((m) => m.saveLoadScreen),
  help: () => import('../src/ui/screens/help.js').then((m) => m.helpScreen),
  codex: () => import('../src/ui/screens/codex.js').then((m) => m.codexScreen),
  missionLog: () => import('../src/ui/screens/missionLog.js').then((m) => m.missionLogScreen),
  credits: () => import('../src/ui/screens/credits.js').then((m) => m.creditsScreen),
  achievements: () => import('../src/ui/screens/achievements.js').then((m) => m.achievementsScreen),
  gameOver: () => import('../src/ui/screens/gameOver.js').then((m) => m.gameOverScreen),
  techTree: () => import('../src/ui/screens/techTree.js').then((m) => m.techTreeScreen),
  range: () => import('../src/ui/screens/range.js').then((m) => m.rangeScreen),
  footprint: () => import('../src/ui/screens/footprint.js').then((m) => m.footprintScreen),
  automation: () => import('../src/ui/screens/automationPanel.js').then((m) => m.automationScreen),
  base: () => import('../src/ui/screens/base.js').then((m) => m.baseScreen),
  crucible: () => import('../src/ui/screens/crucible.js').then((m) => m.crucibleScreen),
  crucibleDraft: () => import('../src/ui/screens/crucibleDraft.js').then((m) => m.crucibleDraftScreen),
  crucibleRefit: () => import('../src/ui/screens/crucibleDraft.js').then((m) => m.crucibleRefitScreen),
  crucibleResults: () => import('../src/ui/screens/crucible.js').then((m) => m.crucibleResultsScreen),
  replay: () => import('../src/ui/screens/replay.js').then((m) => m.replayScreen),
  clips: () => import('../src/ui/screens/clips.js').then((m) => m.clipsScreen),
  sandbox: () => import('../src/ui/screens/sandbox.js').then((m) => m.sandboxScreen),
});

/** The flight HUD is not a .mount() screen; it is the always-mounted overlay createHud() builds
 *  into #hud. The bench mounts it through the same module the game does, over the frozen still,
 *  with a real GameState and the real kit/deckplate sheets — so --shot=flight frames the true
 *  instrument, not a mock. */

/** Screens that exist but need the running game (a docked berth, a live sector, a hull render). */
const NEEDS_THE_GAME = Object.freeze({
  station: 'needs a live docked berth (renderer + station app)',
  ship: 'needs a live hull to inspect',
  chart: 'needs the live sector geography',
  'crucible-door': 'needs the arena stage',
  flight: 'the HUD needs a live picture — use `npm run ui:stills -- --world --headed --only=flight`',
  crucibleHud: 'the Crucible run HUD needs a live picture — use `npm run ui:stills -- --world --headed --only=flight`',
});

const screensEl = document.getElementById('screens');
const hudEl = document.getElementById('hud');
const picker = document.getElementById('bench-picker');
const intentEl = document.getElementById('bench-intent');
const stillInput = document.getElementById('bench-still');
const bgEl = document.getElementById('bench-bg');

const params = new URLSearchParams(location.search);
const log = [];
const stack = [];

function note(line) {
  log.push(line);
  if (log.length > 200) log.shift();
  intentEl.textContent = log.slice(-14).join('\n');
}

/** The state the screens read. A real GameState from the game's own factory, then seeded with the
 *  situation the screens have to draw (a tracked contract, a waypoint, a save, some cargo). */
function seededState() {
  const state = createGameState(47);
  state.mode = 'flight';
  state.meta.seed = 47;
  state.meta.lastSavedAt = '2026-09-15T20:57:46.000Z';
  state.save.currentSlot = 'quick';
  state.ui.trackedMissionId = 'mission_helios_run';
  state.missions.active = [{
    id: 'mission_helios_run',
    status: 'active',
    type: 'cargo_delivery',
    title: 'Contract 47-A: Mass Variance Sample',
    objectiveProgress: 0,
    objectiveTarget: 1,
    deadline_s: 900,
    destStationName: 'Helios Gate',
  }];
  state.nav.waypoint = {
    label: 'Beacon 419 WU', pos: { x: 420, z: -180 }, sectorId: 'sector_helios', stationId: 'station_helios',
  };
  state.world.currentSectorId = 'sector_helios';
  state.ui.docked = false;
  // A hull the instruments can read. Empty GameState has playerId 0 and no entity, so the
  // cluster paints "NO DATA" and the power rail stays an empty div until the first frame.
  const hull = {
    id: 0, type: 'ship', alive: true, team: 1, radius: 12,
    pos: { x: 0, y: 0, z: 0 }, vel: { x: 46, y: 0, z: 18 }, angVel: 0,
    hull: 86, hullMax: 100, shield: 64, shieldMax: 100, armorHp: 20, armorMax: 30,
    cap: 80, capMax: 100, energy: 80, energyMax: 100, maxSpeed: 180,
    boost: { energy: 70, max: 100, dashCost: 28, dashImpulse: 0, dashCdT: 0 },
    data: {
      defId: 'ship_kestrel', callsign: 'KESTREL',
      weapons: [{ id: 'bench-cannon', _heat: 22, heatMax: 100 }],
    },
  };
  state.playerId = 0;
  state.entities.set(0, hull);
  state.entityList = [hull];
  return state;
}

const state = seededState();

/** Bus + manager stubs: every intent a control emits is logged, and the ones the bench can honour
 *  (push/pop/replace a screen) actually navigate here, so the bench walks like the game does. */
const listeners = new Map();
const bus = {
  on(key, fn) {
    if (!listeners.has(key)) listeners.set(key, new Set());
    listeners.get(key).add(fn);
    return () => listeners.get(key)?.delete(fn);
  },
  emit(key, payload = {}) {
    if (key === 'ui:pushScreen' && payload && payload.id) { void goto(payload.id); return; }
    if (key === 'ui:popScreen') { void back(); return; }
    if (key === 'ui:replaceScreen' && payload && payload.id) { stack.length = 0; void goto(payload.id); return; }
    const shape = payload && typeof payload === 'object' ? Object.keys(payload).slice(0, 4).join(', ') : '';
    note(`${key}(${shape})`);
    for (const fn of listeners.get(key) || []) fn(payload);
  },
};
const manager = {
  pushScreen(id) { void goto(id); },
  popScreen() { void back(); },
  replaceScreen(id) { stack.length = 0; void goto(id); },
  closeAll() { stack.length = 0; screensEl.innerHTML = ''; },
  hasScreen() { return stack.length > 0; },
  isOpen(id) { return stack.includes(id); },
  top() { return stack[stack.length - 1] || null; },
};
/** A filled flight record so --shot=crucibleResults is the plate a player sees, not the empty. */
const BENCH_CRUCIBLE_RESULT = Object.freeze({
  outcome: 'defeat', seed: 4242, arenaId: 'helios_core', ruleset: 'swarm',
  wave: 6, deepestWave: 6, wavesCleared: 5, kills: 31, score: 1240, credits: 88, xp: 640, level: 4,
  picks: [
    { verb: 'Volume', defId: 'wpn_autocannon_m', wave: 2 },
    { verb: 'Pierce', defId: 'wpn_railgun_m', wave: 4 },
    { verb: 'Screen', defId: 'wpn_flak_turret_s', wave: 6 },
  ],
  headline: 'Reaver Corsair killed you on wave 6 from AFT with its Heavy Autocannon M, through the hull.',
  buildName: 'Volume Pierce Screen',
  buildCode: 'VOL · PRC · SCR',
  death: {
    causeText: 'Reaver Corsair killed you from astern with a Heavy Autocannon M, through the hull.',
    telegraphName: 'cannon spool', telegraphLeadMs: 420,
    counterplay: 'The tell was the barrel glow — break astern before the burst.',
  },
  moments: [
    { text: 'Best chain 24 on round 4.' },
    { text: 'Round 6 did the heavy lifting — 11 kills.' },
    { text: 'Hardest hit: 18 from Heavy Autocannon M.' },
  ],
  defeat: {
    attacker: 'Reaver Corsair', faction: 'Crimson Reach', weapon: 'Heavy Autocannon M',
    direction: 'AFT', dominantLayer: 'hull', cause: 'Reaver Corsair · Crimson Reach · hull breach',
    fatalSummary: 'Final hit from Reaver Corsair · aft hull breach.',
    vitalsPct: { shield: 0, armor: 0, hull: 0 },
  },
  damageTrail: [
    { attackerId: 9, weaponId: 'wpn_autocannon_m', amount: 18.4, type: 'kinetic' },
    { attackerId: 11, weaponId: 'wpn_pulse_laser_m', amount: 12.2, type: 'energy' },
    { attackerId: 9, weaponId: 'wpn_autocannon_m', amount: 18.4, type: 'kinetic' },
    { attackerId: null, weaponId: null, amount: 7.1, type: 'collision' },
    { attackerId: 9, weaponId: 'wpn_autocannon_m', amount: 17.9, type: 'kinetic' },
  ],
});

const registry = {
  get(name) {
    if (name === 'ui') return { screenManager: manager, manager };
    if (name === 'survivalResults') return { lastResult: () => BENCH_CRUCIBLE_RESULT };
    return null;
  },
};

let current = null;
let currentScreen = null;

async function goto(id) {
  if (id === 'flight' || id === 'crucibleHud') {
    screensEl.innerHTML = '';
    document.body.classList.add('k-screen-top');
    document.body.dataset.kScreen = id;
    try {
      if (id === 'crucibleHud') await mountCrucibleHud();
      else await mountFlightHud();
      current = id; currentScreen = null;
      stack.push(id);
      if (stack.length > 6) stack.shift();
      picker.value = id;
    } catch (error) {
      showBroken(id, `HUD mount threw: ${error && error.message ? error.message : String(error)}`);
    }
    return;
  }
  const loader = SCREENS[id];
  if (!loader) {
    showBroken(id, NEEDS_THE_GAME[id] || 'no bench loader for this surface');
    return;
  }
  screensEl.innerHTML = '';
  document.body.classList.add('k-screen-top');
  document.body.dataset.kScreen = id;
  const root = document.createElement('div');
  screensEl.appendChild(root);
  try {
    const screen = await loader();
    const ctx = { state, bus, screenManager: manager, registry, writeStorePage() {}, publishStoreStill() {} };
    screen.mount(root, ctx);
    screen.onShow?.(ctx);
    currentScreen = screen;
    current = id;
    stack.push(id);
    if (stack.length > 6) stack.shift();
    picker.value = id;
    note(`— ${id} mounted (${id === 'pause' ? 'held world' : 'bench state'})`);
  } catch (error) {
    showBroken(id, `mount threw: ${error && error.message ? error.message : String(error)}`);
  }
}

/** Mount the always-on flight HUD into #hud (the bench page carries the node) over the held
 *  still. Runs the real createHud + createAlerts, ticks one frame, and proves the alert/annunc
 *  lane by raising one persistent status and one warn floor through the same events the sim uses. */
async function mountFlightHud(opts = {}) {
  const hudRoot = document.getElementById('hud');
  const [{ createHud }, { createAlerts }] = await Promise.all([
    import('../src/ui/hud.js'),
    import('../src/ui/alerts.js'),
  ]);
  const ctx = {
    state, bus,
    screenManager: manager, registry,
    helpers: { worldToScreen: () => ({ x: 960, y: 540, onScreen: true }) },
    writeStorePage() {}, publishStoreStill() {},
  };
  // createHud wipes #hud. Alerts have to mount after that wipe or the warn floor has no host.
  const hud = createHud(ctx, null);
  let alertsRoot = document.getElementById('alerts');
  if (!alertsRoot) {
    alertsRoot = document.createElement('div');
    alertsRoot.id = 'alerts';
    hudRoot.appendChild(alertsRoot);
  }
  const alerts = createAlerts(ctx);
  hudRoot.dataset.threat = hudRoot.dataset.threat || 'contact';
  document.body.classList.remove('sf-swarm-flight');
  // One persistent affordance + one warning through the live event path, so the annunciator is
  // lit in the frame rather than judged empty. In-run swarm is never in a berth — skip the dock cue.
  if (opts.dockCue !== false) bus.emit('dock:range', { inRange: true });
  bus.emit('voice:surface', { id: 'alert:incoming', channel: 'alert', priority: 80, kind: 'warn', text: 'TAKING FIRE', ttl: 30 });
  try {
    if (typeof hud.forceRefresh === 'function') hud.forceRefresh();
    if (typeof hud.frame === 'function') {
      for (let i = 0; i < 8; i++) hud.frame(1 / 60);
    }
    if (alerts && typeof alerts.tick === 'function') alerts.tick();
  } catch (error) {
    note(`HUD frame: ${error && error.message ? error.message : String(error)}`);
  }
  window.__benchHud = hud;
    // A single frame renders the "now"; the instruments' reactive writes (lamina fill, bar
    // segments, gauge fraction) settle on the driven frames the live route runs. A bench still
    // proves composition, type, material and light; ui-look proves the reactions on the live route.
    note('— flight HUD mounted (createHud) + dock status + warn floor lit');
}

/** Flight HUD plus the Crucible run readout, in the swarm state the demo plays. */
async function mountCrucibleHud() {
  await mountFlightHud({ dockCue: false });
  document.body.classList.add('sf-swarm-flight');
  const run = state.run || (state.run = {});
  run.kind = 'survival';
  run.phase = 'active';
  run.ruleset = 'swarm';
  run.arenaId = 'helios_core';
  run.wave = 4;
  run.score = 1860;
  run.credits = 240;
  run.xp = 920;
  run.level = 3;
  run.threatBudget = 12;
  run.spawnedThreat = 12;
  run.resolvedThreat = 7;
  const { survivalHud } = await import('../src/ui/survivalHud.js');
  survivalHud.init({ state, bus });
  survivalHud._waveProgress = { wave: 4, remainingTicks: 32 * 60, durationTicks: 60 * 60 };
  survivalHud._chain = 18;
  survivalHud._chainBest = 24;
  survivalHud._objective = 'ELITE';
  survivalHud.update(1 / 60, state);
  const hudRoot = document.getElementById('hud');
  if (hudRoot) hudRoot.dataset.threat = 'near';
  try { window.__benchHud?.frame?.(1 / 60); } catch { /* composition still; live route owns reactions */ }
  const crun = document.querySelector('.sf-crun');
  note('— crucible HUD mounted (flight cluster + survival readout, swarm)'
    + ` · crun ${crun ? (crun.hidden ? 'hidden' : 'live') : 'missing'}`
    + ` · run ${run.kind}/${run.phase}`);
}

async function back() {
  stack.pop();
  const previous = stack[stack.length - 1];
  if (previous && previous !== current) { stack.pop(); await goto(previous); }
  else if (current) await goto(current);
}

function showBroken(id, why) {
  screensEl.innerHTML = '';
  const panel = document.createElement('div');
  panel.id = 'bench-broken';
  panel.innerHTML = `<strong>${id} is not mountable in the bench</strong>${why}. `
    + 'Use the live route instead: <code>node scripts/ui-look.mjs --only=' + id + '</code>'
    + ' or <code>npm run ui:stills -- --only=' + id + '</code>.';
  screensEl.appendChild(panel);
  note(`— ${id}: NOT MOUNTABLE (${why})`);
}

// The picker lists what the bench can mount, and says what it cannot.
{
  const opt = document.createElement('option');
  opt.value = 'flight';
  opt.textContent = 'flight — HUD';
  picker.appendChild(opt);
  const cru = document.createElement('option');
  cru.value = 'crucibleHud';
  cru.textContent = 'crucibleHud — in-run HUD';
  picker.appendChild(cru);
}
for (const id of Object.keys(SCREENS).sort()) {
  const option = document.createElement('option');
  option.value = id;
  option.textContent = id;
  picker.appendChild(option);
}
for (const [id, why] of Object.entries(NEEDS_THE_GAME)) {
  const option = document.createElement('option');
  option.value = id;
  option.textContent = `${id} — live only`;
  option.dataset.live = '1';
  picker.appendChild(option);
}
picker.addEventListener('change', () => { stack.length = 0; void goto(picker.value); });

// A still behind the panel: any capture the agent already has, or the committed title backdrop.
// The flight HUD judges against the WORLD, so its default still is the last flight capture.
const still = params.get('bg')
  || ((params.get('screen') === 'flight' || params.get('screen') === 'crucibleHud' || params.get('screen') === 'crucibleResults')
    ? '../assets/ui/backdrops/backdrop-crucible-door.jpg'
    : '../assets/ui/backdrops/backdrop-title.jpg');
bgEl.src = still;
stillInput.value = params.get('bg') || '';
stillInput.addEventListener('change', () => {
  const value = stillInput.value.trim();
  bgEl.src = value || '../assets/ui/backdrops/backdrop-title.jpg';
});

// Click intents: the bench listens at the capture phase, so every control on the screen reports
// what it asked for even if the screen navigates immediately afterwards.
document.addEventListener('click', (event) => {
  const control = event.target.closest?.('button, [data-action], .k-row, .k-tile');
  if (!control || !screensEl.contains(control)) return;
  const label = (control.getAttribute('aria-label') || control.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
  const action = control.dataset.action || '';
  note(`${current || 'screen'} · click "${label}"${action ? ` [${action}]` : ''}`);
}, true);

// HUD stylesheet, so the bench can show HUD chrome over the still when a screen expects it.
injectHudCss();

void goto(params.get('screen') || 'pause');

// Handy for probes: the bench exposes what it mounted and what was clicked.
window.BENCH = { goto, state, get log() { return log.slice(); }, get screen() { return current; }, screens: Object.keys(SCREENS) };
