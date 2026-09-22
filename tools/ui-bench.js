// ui-bench.js — the 2D UI workbench: mount a real screen over a frozen still, click everything,
// read what each control asked for. No boot, no simulation, no renderer startup.
//
// Looking is `node scripts/ui-bench.mjs --shot=<id>` (docs/UI_VISUAL_ITERATION.md). The page
// mounts the same screen module the game mounts, with a real GameState, over one of the
// committed backdrops. `--walk` tries every control. Live behaviour for a screen this page
// cannot mount stays with `ui-look`.

import { createGameState } from '../src/core/gameState.js';
import { injectHudCss } from '../src/ui/views/hudStyles.js';
import { BACKDROPS, resolveShot, UI_BENCH_SHOTS } from '../scripts/lib/uiBenchCatalog.mjs';

window.__BENCH_READY = false;
window.__BENCH_OVERLAY = '';
window.__BENCH_LAST_DISABLED = false;

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
  station: () => import('../src/ui/station/stationScreen.js').then((m) => m.stationScreen),
  ship: () => import('../src/ui/ship/shipScreen.js').then((m) => m.shipScreen),
  galaxyMap: () => import('../src/ui/galaxyMap.js').then((m) => m.galaxyMapScreen),
  drill: () => import('../src/ui/asteroid/asteroidScreen.js').then((m) => m.asteroidScreen),
  localmap: () => import('../src/ui/screens/localmap.js').then((m) => m.localmapScreen),
  starmap: () => import('../src/ui/screens/starmap.js').then((m) => m.starmapScreen),
});

/** The flight HUD is not a .mount() screen; it is the always-mounted overlay createHud() builds
 *  into #hud. The bench mounts it through the same module the game does, over the frozen still,
 *  with a real GameState and the real kit/deckplate sheets — so --shot=flight frames the true
 *  instrument, not a mock. */

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
  state.ui.dockedStationId = null;
  state.player.credits = 18400;
  state.player.ownedShips = [{ defId: 'ship_kestrel' }];
  state.player.activeShipIndex = 0;
  // A hull the instruments can read. Empty GameState has playerId 0 and no entity, so the
  // cluster paints "NO DATA" and the power rail stays an empty div until the first frame.
  const hull = {
    id: 0, type: 'ship', alive: true, team: 1, radius: 12,
    pos: { x: 0, y: 0, z: 0 }, vel: { x: 46, y: 0, z: 18 }, angVel: 0,
    hull: 86, hullMax: 100, shield: 64, shieldMax: 100, armorHp: 20, armorMax: 30,
    cap: 80, capMax: 100, energy: 80, energyMax: 100, maxSpeed: 180, fuel: 62, fuelMax: 100,
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

/** Gauntlet at the wave-30 refit: Continue is legal, Extract still ends the run.
 *  Swarm is not this state — Continue stays off unless ruleset is scored. */
function seedGauntletRefit(gameState) {
  const ships = gameState.player && gameState.player.ownedShips;
  const ship = Array.isArray(ships) ? ships[0] : null;
  if (ship) ship.fittings = ['wpn_autocannon_m', 'wpn_pulse_laser_s'];
  const ruleset = params.get('ruleset') === 'swarm' ? 'swarm' : 'scored';
  gameState.run = {
    kind: 'survival',
    phase: 'refit',
    ruleset,
    wave: 30,
    score: 4820,
    credits: 240,
    arenaId: 'helios_core',
    seed: 4242,
  };
}

function closeTopScreen(next) {
  screensEl.innerHTML = '';
  currentScreen = null;
  current = next;
  if (stack.length && stack[stack.length - 1] === 'crucibleRefit') stack.pop();
}

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
    if (key === 'ui:closeScreen' && payload && payload.id && manager.top() === payload.id) {
      note('ui:closeScreen(' + payload.id + ')');
      closeTopScreen('closed');
      return;
    }
    if (key === 'run:refitCloseRequested' && current === 'crucibleRefit') {
      note('run:refitCloseRequested()');
      closeTopScreen('closed');
      return;
    }
    if (key === 'run:extractionRequested' && current === 'crucibleRefit') {
      note('run:extractionRequested()');
      if (state.run && state.run.kind === 'survival') state.run.phase = 'ended';
      closeTopScreen('ended');
      return;
    }
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

function applyBackdrop(shot) {
  const fromQuery = params.get('bg');
  if (fromQuery) {
    bgEl.src = fromQuery;
    stillInput.value = fromQuery;
    return;
  }
  bgEl.src = BACKDROPS[shot.backdrop] || BACKDROPS.title;
}

function clearOverlayHost() {
  const host = document.getElementById('ui-root');
  if (host) host.replaceChildren();
}

async function finishShot(shot) {
  try {
    if (!document.getElementById('bench-broken')) {
      if (shot.tab) document.querySelector(`#screens [data-nav="${shot.tab}"]`)?.click();
      if (shot.focus) {
        const want = String(shot.focus).toUpperCase();
        const button = [...screensEl.querySelectorAll('button')].find((el) => (el.textContent || '').toUpperCase().includes(want));
        button?.click();
      }
      if (shot.overlay) await openOverlay(shot.overlay);
    }
  } catch (error) {
    showBroken(shot.screen || shot.id, `mount threw: ${error && error.message ? error.message : String(error)}`);
  }
  try { await document.fonts.ready; } catch { /* fonts are best-effort */ }
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  window.__BENCH_READY = true;
}

async function goto(rawId) {
  window.__BENCH_READY = false;
  window.__BENCH_OVERLAY = '';
  const shot = resolveShot(rawId) || { id: rawId, screen: rawId, backdrop: 'title' };
  const id = shot.screen;
  applyBackdrop(shot);
  clearOverlayHost();
  try {
    if (id === 'flight' || id === 'crucibleHud') {
      screensEl.innerHTML = '';
      state.ui.docked = false;
      state.ui.dockedStationId = null;
      document.body.classList.add('k-screen-top');
      document.body.dataset.kScreen = id;
      if (id === 'crucibleHud') await mountCrucibleHud();
      else await mountFlightHud();
      current = id;
      currentScreen = null;
    } else {
      const loader = SCREENS[id];
      if (!loader) {
        showBroken(id, 'no bench loader for this surface');
        await finishShot(shot);
        return;
      }
      hudEl.innerHTML = '';
      screensEl.innerHTML = '';
      document.body.classList.add('k-screen-top');
      document.body.dataset.kScreen = id;
      const root = document.createElement('div');
      if (id === 'station') {
        root.dataset.screen = 'station';
        state.ui.docked = true;
        state.ui.dockedStationId = 'station_helios';
      } else {
        state.ui.docked = false;
        state.ui.dockedStationId = null;
      }
      screensEl.appendChild(root);
      if (id === 'crucibleRefit') seedGauntletRefit(state);
      const screen = await loader();
      const ctx = { state, bus, screenManager: manager, registry, writeStorePage() {}, publishStoreStill() {} };
      screen.mount(root, ctx);
      screen.onShow?.(ctx);
      currentScreen = screen;
      current = id;
      note(`— ${id} mounted`);
    }
    stack.push(id);
    if (stack.length > 6) stack.shift();
    if ([...picker.options].some((option) => option.value === rawId)) picker.value = rawId;
  } catch (error) {
    showBroken(id, `mount threw: ${error && error.message ? error.message : String(error)}`);
  }
  await finishShot(shot);
}

async function openOverlay(kind) {
  const ctx = { state, bus, screenManager: manager, registry, writeStorePage() {}, publishStoreStill() {} };
  if (kind === 'comms') {
    const contact = {
      id: 7, type: 'ship', alive: true, team: 2, radius: 14,
      pos: { x: 80, y: 0, z: 40 }, vel: { x: 0, y: 0, z: 0 },
      data: { callsign: 'HAULER 12', trafficRole: 'hauler', ai: { passive: true, archetype: 'fleeing_trader' } },
    };
    state.player.targetId = 7;
    state.entities.set(7, contact);
    if (!state.entityList.some((entity) => entity.id === 7)) state.entityList.push(contact);
    const { createCommsRadial } = await import('../src/ui/commsRadial.js');
    createCommsRadial(ctx);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', bubbles: true, cancelable: true }));
    const fan = document.getElementById('sf-commsfan');
    window.__BENCH_OVERLAY = fan && !fan.hidden ? 'comms open' : 'comms did not open (no hail on this still)';
    return;
  }
  if (kind === 'wingman') {
    state.automation = { fleet: [{ id: 2, name: 'WING 2' }, { id: 3, name: 'WING 3' }] };
    const { createWingmanRadial } = await import('../src/ui/wingmanRadial.js');
    const radial = createWingmanRadial(ctx);
    radial.open?.(2);
    const node = document.getElementById('sf-wingman-radial');
    window.__BENCH_OVERLAY = node && !node.hidden ? 'wingman open' : 'wingman did not open';
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
  hudEl.innerHTML = '';
  const panel = document.createElement('div');
  panel.id = 'bench-broken';
  panel.innerHTML = `<strong>${id} is not mountable in the bench</strong>${why}. `
    + 'Live route: <code>node scripts/ui-look.mjs --only=' + id + '</code>.';
  screensEl.appendChild(panel);
  note(`— ${id}: NOT MOUNTABLE (${why})`);
}

for (const shot of UI_BENCH_SHOTS) {
  const option = document.createElement('option');
  option.value = shot.id;
  option.textContent = shot.id === shot.screen ? shot.id : `${shot.id} — ${shot.screen}`;
  picker.appendChild(option);
}
picker.addEventListener('change', () => { stack.length = 0; void goto(picker.value); });

stillInput.addEventListener('change', () => {
  const value = stillInput.value.trim();
  bgEl.src = value || BACKDROPS.title;
});

// Click intents: the bench listens at the capture phase, so every control on the screen reports
// what it asked for even if the screen navigates immediately afterwards.
document.addEventListener('click', (event) => {
  const control = event.target.closest?.('button, [data-action], .k-row, .k-tile');
  const host = document.getElementById('ui-root');
  if (!control || !(screensEl.contains(control) || hudEl.contains(control) || host?.contains(control))) return;
  const label = (control.getAttribute('aria-label') || control.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
  const action = control.dataset.action || '';
  note(`${current || 'screen'} · click "${label}"${action ? ` [${action}]` : ''}`);
}, true);

// HUD stylesheet, so the bench can show HUD chrome over the still when a screen expects it.
injectHudCss();

void goto(params.get('screen') || 'pause');

function labelOf(el) {
  return (el.getAttribute('aria-label') || el.innerText || el.dataset.action || '')
    .trim().replace(/\s+/g, ' ').slice(0, 48);
}

function shownRect(el) {
  const rect = el.getBoundingClientRect();
  if (rect.width < 8 || rect.height < 8) return null;
  const style = styleOf(el);
  if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return null;
  return rect;
}

function benchRoots() {
  return [screensEl, hudEl, document.getElementById('ui-root')].filter(Boolean);
}

function visibleControls() {
  const seen = new Set();
  const found = [];
  for (const root of benchRoots()) {
    for (const el of root.querySelectorAll('button, a, [role="tab"], [role="button"], input, select, summary, [data-action]')) {
      if (seen.has(el) || el.closest('#bench-bar, #bench-broken, #bench-intent')) continue;
      if (!shownRect(el)) continue;
      seen.add(el);
      found.push(el);
    }
  }
  return found;
}

function popupCount() {
  let count = 0;
  for (const el of document.querySelectorAll('[role="tooltip"], [role="dialog"], [role="menu"], [data-tooltip]')) {
    if (el.closest('#bench-bar, #bench-intent')) continue;
    if (el.hidden) continue;
    if (shownRect(el)) count += 1;
  }
  return count;
}

function scrollHold(el) {
  const rect = el.getBoundingClientRect();
  for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
    const style = styleOf(node);
    const scrolls = /auto|scroll/.test(`${style.overflowY} ${style.overflowX}`);
    const clips = /hidden|clip/.test(`${style.overflowY} ${style.overflowX} ${style.overflow}`);
    if (!scrolls && !clips) continue;
    const host = node.getBoundingClientRect();
    const outside = rect.bottom > host.bottom + 4 || rect.top < host.top - 4
      || rect.right > host.right + 4 || rect.left < host.left - 4;
    if (!outside) continue;
    if (scrolls && (node.scrollHeight > node.clientHeight + 8 || node.scrollWidth > node.clientWidth + 8)) return { kind: 'scrolled', host: node };
    if (clips) return { kind: 'clipped', host: node };
  }
  return null;
}

/* ---------------------------------------------------------------------------
   The picture audit (2026-09-22). The control-only audit below reported "no
   overlapping controls" on station-market while "14 / YOU PAY / PER UNIT" sat
   on top of the body paragraph, and on chart while three panels of text were
   stacked illegibly in the bottom-left corner. It could not see either, because
   it only ever measured `visibleControls()` — buttons and inputs. Most of what
   a player reads is not a control.

   These four passes measure GLYPHS. A Range over each text node returns one
   rect per line box, tight to the type, so a wrapped paragraph is six small
   boxes rather than one tall one: a panel that only lands on its last line is
   caught, and a column standing beside it is not falsely accused.
   --------------------------------------------------------------------------- */

let styleCache = new WeakMap();
function styleOf(el) {
  let style = styleCache.get(el);
  if (!style) { style = getComputedStyle(el); styleCache.set(el, style); }
  return style;
}

function nameOf(el) {
  const id = el.id ? "#" + el.id : "";
  const cls = typeof el.className === "string" && el.className.trim()
    ? "." + el.className.trim().split(/[ \t]+/)[0] : "";
  return el.tagName.toLowerCase() + id + cls;
}

const AUDIT_CAP = 6;

function alphaOf(color) {
  const parts = String(color).match(/[\d.]+/g);
  if (!parts) return 0;
  if (parts.length < 4) return /transparent/i.test(color) ? 0 : 1;
  return Number(parts[3]);
}

// Text that is present for a screen reader and drawn for nobody. It still has a client rect, so
// without this an accessible name listing every tile on the Crucible door reads as five collisions.
function screenReaderOnly(style) {
  if (/inset\(\s*50%/.test(style.clipPath || '')) return true;
  if (/rect\(0(px)?[,\s]/.test(style.clip || '')) return true;
  return false;
}

function fadedOut(el) {
  for (let node = el; node && node !== document.body; node = node.parentElement) {
    const style = styleOf(node);
    if (style.display === 'none' || style.visibility === 'hidden') return true;
    if (Number(style.opacity) < 0.06) return true;
    if (screenReaderOnly(style)) return true;
    // A closed <details> still gives its content client rects in Chromium, so a collapsed "Quote
    // breakdown" read as six rows of type cut off by the panel below it. The reader sees a summary.
    if (node.parentElement && node.parentElement.tagName === 'DETAILS'
      && !node.parentElement.open && node.tagName !== 'SUMMARY') return true;
  }
  return false;
}

function unionRect(rects) {
  let left = Infinity; let top = Infinity; let right = -Infinity; let bottom = -Infinity;
  for (const r of rects) {
    left = Math.min(left, r.left); top = Math.min(top, r.top);
    right = Math.max(right, r.right); bottom = Math.max(bottom, r.bottom);
  }
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

// Every run of rendered type in the interface, with its per-line boxes.
function textRuns() {
  const runs = [];
  for (const root of benchRoots()) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = (node.nodeValue || '').replace(/\s+/g, ' ').trim();
      if (text.length < 2) continue;
      const host = node.parentElement;
      if (!host || host.closest('#bench-bar, #bench-broken, #bench-intent')) continue;
      if (fadedOut(host)) continue;
      const style = styleOf(host);
      if (alphaOf(style.color) < 0.06) continue;           // spacing tricks and sr-only labels
      const range = document.createRange();
      range.selectNodeContents(node);
      const rects = [];
      for (const rect of range.getClientRects()) {
        if (rect.width >= 4 && rect.height >= 4) rects.push(rect);
      }
      if (!rects.length) continue;
      const box = unionRect(rects);
      // A run scrolled out of the panel that holds it is not on screen, so it cannot collide with
      // anything that is. Its rect still exists, which is how an adventure prompt 250px below the
      // market's scroll viewport read as five collisions with the trade console drawn over it.
      // severedType still sees these -- being unreachable is its own finding.
      runs.push({ host, text, rects, box, offstage: scrolledOutOfView(host, box) });
    }
  }
  return runs;
}

// True when the run sits outside the visible rect of the nearest ancestor that scrolls or clips.
function scrolledOutOfView(host, box) {
  for (let node = host.parentElement; node && node !== document.body; node = node.parentElement) {
    const style = styleOf(node);
    if (!/auto|scroll|hidden|clip/.test(`${style.overflow} ${style.overflowX} ${style.overflowY}`)) continue;
    const view = node.getBoundingClientRect();
    if (box.top >= view.bottom - 2 || box.bottom <= view.top + 2) return true;
    if (box.left >= view.right - 2 || box.right <= view.left + 2) return true;
  }
  return false;
}

function intersectArea(a, b) {
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return (w > 2 && h > 2) ? w * h : 0;
}

// A line box is taller than its ink: half the leading sits above the caps and half below the
// baseline. A 56px number stacked over its 10px legend therefore "overlaps" it by a few pixels of
// empty space, which accused every hero-and-label pair on shipworks. Shrink each box toward its
// ink before asking whether two runs collide.
function inkBox(rect) {
  // Proportional, with no ceiling. A 6px cap is right for body copy and useless for a 120px screen
  // title, whose leading alone is 20px -- the Crucible door's name "collided" with the blurb under
  // it on nothing but empty space.
  const trim = rect.height * 0.18;
  return {
    left: rect.left, right: rect.right,
    top: rect.top + trim, bottom: rect.bottom - trim,
    width: rect.width, height: Math.max(1, rect.height - trim * 2),
  };
}

function commonAncestor(a, b) {
  for (let node = a; node; node = node.parentElement) if (node.contains(b)) return node;
  return document.body;
}

// An opaque plate between two runs means the top one is a panel sitting over the other, not two
// lines of type fighting for the same pixels. A modal over a screen must not read as a defect.
function plateBetween(host, stopAt) {
  for (let node = host; node && node !== stopAt; node = node.parentElement) {
    const style = styleOf(node);
    // A rendered plate (a nine-slice PNG) hides what is behind it. A GRADIENT does not: almost
    // every panel in this tree paints a gradient, so treating background-image as a shield excused
    // every collision on the chart, where three semi-transparent panels sit on each other in the
    // bottom-left corner and the type smears together.
    if (/url\(/.test(style.backgroundImage)) return true;
    // 0.97, not 0.85: panels in this tree sit around 0.9, and type underneath a 0.9 plate still
    // shows through as a smear. That smear is the defect, not the exception to it.
    if (alphaOf(style.backgroundColor) >= 0.97) return true;
    if (style.backdropFilter && style.backdropFilter !== 'none') return true;
    if (node.matches('[role="dialog"], [aria-modal="true"]')) return true;
  }
  return false;
}

function shortText(text) {
  return text.length > 34 ? text.slice(0, 33) + '…' : text;
}

// 1. Type landing on type. Always a defect: nobody can read either one.
function tangledType(runs) {
  const found = [];
  // A 96px grid. A market with 47 commodities is ~400 runs, and comparing all of them pairwise
  // walked the DOM 80,000 times and timed the page out; only type sharing a cell can collide.
  const grid = new Map();
  const CELL = 96;
  runs.forEach((run, index) => {
    for (let cx = Math.floor(run.box.left / CELL); cx <= Math.floor(run.box.right / CELL); cx += 1) {
      for (let cy = Math.floor(run.box.top / CELL); cy <= Math.floor(run.box.bottom / CELL); cy += 1) {
        const key = cx + ":" + cy;
        const bucket = grid.get(key) || [];
        bucket.push(index);
        grid.set(key, bucket);
      }
    }
  });
  const tried = new Set();
  const pairs = [];
  for (const bucket of grid.values()) {
    for (let bi = 0; bi < bucket.length; bi += 1) {
      for (let bj = bi + 1; bj < bucket.length; bj += 1) {
        const key = bucket[bi] + ":" + bucket[bj];
        if (tried.has(key)) continue;
        tried.add(key);
        pairs.push([bucket[bi], bucket[bj]]);
      }
    }
  }
  for (const [i, j] of pairs) {
    if (found.length >= AUDIT_CAP) break;
    {
      const a = runs[i];
      const b = runs[j];
      if (a.offstage || b.offstage) continue;
      if (a.host === b.host || a.host.contains(b.host) || b.host.contains(a.host)) continue;
      // The same string twice in the same place is a drawing technique -- a stroke copy behind the
      // face for legibility over a bright scene, which is how alerts.js prints TAKING FIRE. You can
      // still read it, so it is not a collision.
      if (a.text === b.text) continue;
      if (!intersectArea(a.box, b.box)) continue;
      const shared = commonAncestor(a.host, b.host);
      if (plateBetween(a.host, shared) || plateBetween(b.host, shared)) continue;
      let worst = 0;
      let smallest = Infinity;
      for (const raw of a.rects) {
        const ra = inkBox(raw);
        for (const rawB of b.rects) {
          const rb = inkBox(rawB);
          const area = intersectArea(ra, rb);
          if (area <= worst) continue;
          worst = area;
          smallest = Math.min(ra.width * ra.height, rb.width * rb.height);
        }
      }
      if (!worst || worst < smallest * 0.22) continue;
      found.push('"' + shortText(a.text) + '" is printed on top of "' + shortText(b.text) + '"');
    }
  }
  return found;
}

// 2. Type nobody can see at all, because something opaque is drawn over it. elementsFromPoint
//    returns the whole stack, deepest first, so only what sits ABOVE the type can accuse it —
//    asking elementFromPoint for the single topmost element blamed the page wrapper for every
//    line in the HUD.
function buriedType(runs) {
  const found = [];
  for (const run of runs) {
    if (found.length >= AUDIT_CAP) break;
    if (run.offstage) continue;
    let samples = 0;
    let buried = 0;
    let culprit = null;
    const probe = run.rects.length > 2 ? [run.rects[0], run.rects[run.rects.length - 1]] : run.rects;
    for (const rect of probe) {
      for (const fx of [0.3, 0.7]) {
        const x = rect.left + rect.width * fx;
        const y = rect.top + rect.height * 0.5;
        if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) continue;
        samples += 1;
        const stack = document.elementsFromPoint(x, y);
        const mine = stack.findIndex((el) => el === run.host || run.host.contains(el));
        if (mine < 0) continue;
        let cover = null;
        const frame = window.innerWidth * window.innerHeight;
        for (let k = 0; k < mine && !cover; k += 1) {
          const el = stack[k];
          if (el.contains(run.host)) continue;
          // A layer the size of the whole frame is atmosphere — a vignette, a scrim, a grade pass.
          // sf-gloc-vignette accused every line on the flight deck of being invisible.
          const box = el.getBoundingClientRect();
          if (box.width * box.height >= frame * 0.9) continue;
          const style = styleOf(el);
          if (style.backgroundImage !== "none" || alphaOf(style.backgroundColor) >= 0.85) cover = el;
        }
        if (!cover) continue;
        buried += 1;
        culprit = culprit || cover;
      }
    }
    if (samples < 2 || buried < samples * 0.8) continue;
    const name = labelOf(culprit) || nameOf(culprit);
    found.push(String.fromCharCode(34) + shortText(run.text) + String.fromCharCode(34) + " is buried under " + name);
  }
  return found;
}

// 3. Type running past the edge of the box that holds it, with no way to scroll to it. scrollHold
//    already separates a genuinely scrollable list from a panel that simply cuts its contents off;
//    a row below the fold of a scroller is reachable and is not a defect.
function severedType(runs) {
  const found = [];
  for (const run of runs) {
    if (found.length >= AUDIT_CAP) break;
    // Text truncated with an ellipsis is deliberately shortened and SAYS so; the reader can see
    // there is more. That is a content decision, not a panel eating its own copy.
    if (/ellipsis/.test(styleOf(run.host).textOverflow || '')) continue;
    const held = scrollHold(run.host);
    if (!held || held.kind !== "clipped") continue;
    found.push(String.fromCharCode(34) + shortText(run.text) + String.fromCharCode(34) + " is cut off by its own panel");
  }
  return found;
}

// 4. A painted box with nothing in it. The title screen's left rail, the flight deck's right bar
//    and the market's price chart were all holes of this shape — a plate that draws and says
//    nothing. Leaves only: a gauge track holds a fill, and that fill is content.
function deadBoxes() {
  const found = [];
  for (const root of benchRoots()) {
    for (const el of root.querySelectorAll('div, section, aside, figure, span, li')) {
      if (found.length >= AUDIT_CAP) break;
      if (el.closest('#bench-bar, #bench-broken, #bench-intent')) continue;
      const rect = shownRect(el);
      if (!rect || rect.width < 56 || rect.height < 28) continue;
      if (rect.width * rect.height < 5000) continue;
      if ((el.innerText || '').trim().length) continue;
      if (el.querySelector('img, svg, canvas, video, picture, input, button')) continue;
      if (el.childElementCount) continue;                  // a track with a fill is a drawn shape
      const style = styleOf(el);
      if (style.backgroundImage !== 'none') continue;      // a plate with art on it is content
      const painted = alphaOf(style.backgroundColor) >= 0.2
        || (parseFloat(style.borderTopWidth) > 0 && alphaOf(style.borderTopColor) >= 0.2);
      if (!painted) continue;
      found.push(nameOf(el) + ' — a ' + Math.round(rect.width) + '×' + Math.round(rect.height)
        + 'px box at ' + Math.round(rect.left) + ',' + Math.round(rect.top) + ' is painted and empty');
    }
  }
  return found;
}

// Hit-testing has to follow paint order, and `#ui-root` is `pointer-events:none` by design
// (ARCHITECTURE §1.2), so without this shim every sample would fall straight through the
// interface to the canvas and every line of type would read as buried.
function pictureAudit() {
  styleCache = new WeakMap();
  const shim = document.createElement('style');
  shim.textContent = '#ui-root, #ui-root *, #screens, #screens *, #hud, #hud * { pointer-events: auto !important; }';
  document.head.appendChild(shim);
  try {
    const runs = textRuns();
    return {
      tangled: tangledType(runs),
      buried: buriedType(runs),
      severed: severedType(runs),
      dead: deadBoxes(),
    };
  } finally {
    shim.remove();
  }
}

function layoutAudit() {
  const controls = [];
  for (const el of visibleControls()) {
    controls.push({ el, rect: el.getBoundingClientRect(), label: labelOf(el) || el.tagName });
  }
  const overlaps = [];
  for (let i = 0; i < controls.length && overlaps.length < 6; i += 1) {
    for (let j = i + 1; j < controls.length && overlaps.length < 6; j += 1) {
      const a = controls[i];
      const b = controls[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const menuA = a.el.closest('[role="menu"], #sf-commsfan, #sf-wingman-radial');
      if (menuA && menuA.contains(b.el)) continue;
      const width = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left);
      const height = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top);
      if (width <= 8 || height <= 8) continue;
      const smaller = (a.rect.width * a.rect.height) <= (b.rect.width * b.rect.height) ? a : b;
      const larger = smaller === a ? b : a;
      const cx = smaller.rect.left + smaller.rect.width / 2;
      const cy = smaller.rect.top + smaller.rect.height / 2;
      const centerInside = cx >= larger.rect.left && cx <= larger.rect.right && cy >= larger.rect.top && cy <= larger.rect.bottom;
      if (!centerInside) continue;
      if (width * height < smaller.rect.width * smaller.rect.height * 0.5) continue;
      const top = document.elementFromPoint(cx, cy);
      const topIsSmaller = top && (smaller.el === top || smaller.el.contains(top));
      if (topIsSmaller) continue;
      const topIsLarger = top && (larger.el === top || larger.el.contains(top));
      if (!topIsLarger) continue;
      overlaps.push(`"${a.label}" overlaps "${b.label}" (${Math.round(width)}×${Math.round(height)}px)`);
    }
  }
  const clipped = [];
  for (const root of benchRoots()) {
    for (const el of root.querySelectorAll('button, a, h1, h2, h3, label')) {
      if (clipped.length >= 6 || el.closest('#bench-bar, #bench-broken')) continue;
      const text = (el.innerText || '').trim().replace(/\s+/g, ' ');
      if (text.length < 2) continue;
      const style = styleOf(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      if (!/hidden|clip/.test(`${style.overflow} ${style.overflowX} ${style.overflowY}`)) continue;
      if (el.scrollWidth > el.clientWidth + 16 || el.scrollHeight > el.clientHeight + 16) clipped.push(`"${text.slice(0, 42)}" is cut off`);
    }
  }
  const offscreen = [];
  const scrolledGroups = new Map();
  for (const row of controls) {
    const held = scrollHold(row.el);
    const rect = row.rect;
    const outside = rect.top > window.innerHeight - 4 || rect.bottom < 4
      || rect.left > window.innerWidth - 4 || rect.right < 4;
    if (!outside && !(held && held.kind === 'clipped')) continue;
    if (held && held.kind === 'scrolled') {
      const bucket = scrolledGroups.get(held.host) || [];
      bucket.push(row.label);
      scrolledGroups.set(held.host, bucket);
      continue;
    }
    if (offscreen.length < 6) offscreen.push(`"${row.label}" is outside the frame`);
  }
  // A control below the fold of a list that genuinely scrolls is reachable, so it is not offscreen.
  // This used to report any scrolled group of four or fewer, which accused the factions dossier's
  // relations rail of losing its rows when they were one flick away. Text that is clipped with no
  // way to reach it is a different finding, and severedType makes it.
  scrolledGroups.clear();
  return { overlaps, clipped, offscreen, ...pictureAudit() };
}

function controlAction(index, kind) {
  const el = visibleControls()[index];
  if (!el) return '';
  window.__BENCH_LAST_DISABLED = !!(el.disabled || el.getAttribute('aria-disabled') === 'true');
  if (window.__BENCH_LAST_DISABLED) return labelOf(el);
  if (kind === 'hover') {
    el.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  } else {
    el.focus();
    el.click();
  }
  return labelOf(el);
}

// Probes and `scripts/ui-bench.mjs` read this. `report` is the layout pass; `controls` is the walk.
window.BENCH = {
  goto,
  state,
  get log() { return log.slice(); },
  get screen() { return current; },
  screens: Object.keys(SCREENS),
  controls() {
    return visibleControls().map((el, index) => ({ index, label: labelOf(el) }));
  },
  hover(index) { return controlAction(index, 'hover'); },
  click(index) { return controlAction(index, 'click'); },
  signature() {
    const text = `${screensEl.innerText || ''}\n${hudEl.innerText || ''}`.replace(/\s+/g, ' ').slice(0, 5000);
    return {
      screen: current,
      text,
      popup: popupCount(),
      log: log.slice(-4).join(' | '),
      disabled: window.__BENCH_LAST_DISABLED === true,
    };
  },
  report() {
    const broken = document.getElementById('bench-broken');
    return {
      broken: broken ? broken.innerText.replace(/\s+/g, ' ').trim().slice(0, 240) : '',
      overlay: window.__BENCH_OVERLAY || '',
      ...layoutAudit(),
    };
  },
};
