import { createTitleFrame, TITLE_PLATE_SRC } from '../views/menuFrames.js';
// Main Menu / title screen (ARCHITECTURE §1.3 step 6, §5; design/specs/09).
// The sheet's title line (design/frontend/direction/DIRECTION_SHEET.md, title screen): the starter
// hull in its hangar fills the frame, the game's name enormous top-left, a column of words down the
// left edge, the version in fine print. Built on the frontend kit (styles/kit.css, src/ui/kit/);
// this file owns no CSS. Continue is enabled iff a save exists, shows the exact latest slot metadata,
// and loads that displayed slot so players trust resume before committing to a load.
// Browser, Electron dev, and packaged desktop all arrive here through the same player route.
// The title picture is an authored still (assets/ui/backdrops/backdrop-title.jpg): the approved
// "Field at dusk" shot, pre-rendered at cutscene quality. A photograph that never changes should
// not own a render loop — and a still this good should not pay a live 3D scene's load and compile
// cost to approximate itself.

import { CREDITS } from '../../data/credits.js';
import { requestCodexTab } from './codex.js';
import { coreText } from '../localizedCoreCopy.js';
import { requestQuit } from '../quitGame.js';
import { IS_DEV } from '../../core/devMode.js';
import { el, words, settle, stamp, reducedMotion, cue } from '../kit/index.js';

const LS_PREFIX = 'sf.save.';
const MENU_BACKDROP_SRC = TITLE_PLATE_SRC;
// spec2/03 §3: the still begins its slow drift after this much idle time. Input re-arms the window.
const ATTRACT_IDLE_MS = 12_000;

function getManager(ctx) {
  if (ctx && ctx.screenManager) return ctx.screenManager;
  if (ctx && ctx.screens && ctx.screens.pushScreen) return ctx.screens;
  const ui = ctx && ctx.registry && ctx.registry.get && ctx.registry.get('ui');
  if (ui && ui.screenManager) return ui.screenManager;
  if (ui && ui.manager) return ui.manager;
  return null;
}
function screenReady(ctx, id) {
  const mgr = getManager(ctx);
  return !!(!mgr || typeof mgr.hasScreen !== 'function' || mgr.hasScreen(id));
}
// aria-disabled only (kit spec 6.5): the word stays in the DOM flow and clickable so a refused pick
// sounds deny; the legacy utton:disabled opacity never applies to a word.
function setDisabled(button, disabled, title) {
  if (!button) return;
  if (disabled) button.setAttribute('aria-disabled', 'true');
  else button.removeAttribute('aria-disabled');
  button.title = title || '';
}
function isDisabled(button) { return button.getAttribute('aria-disabled') === 'true'; }
function setScreenButtonReady(button, ctx, id, label) {
  if (!button) return;
  const ready = screenReady(ctx, id);
  setDisabled(button, !ready, ready ? '' : label + ' is initializing');
}
function pushWhenReady(ctx, id, label) {
  if (!screenReady(ctx, id)) {
    if (ctx && ctx.bus && ctx.bus.emit) {
      ctx.bus.emit('toast', { text: label + ' is initializing - try again in a moment', kind: 'info', ttl: 2200 });
    }
    return;
  }
  nav(ctx, 'pushScreen', id);
}
function nav(ctx, method, arg) {
  const mgr = getManager(ctx);
  if (mgr && typeof mgr[method] === 'function') { mgr[method](arg); return; }
  ctx.bus.emit('ui:' + method, { id: arg });
}

function readSaveIndex(ctx) {
  const sys = ctx.registry && ctx.registry.get && ctx.registry.get('save');
  if (sys) {
    if (typeof sys.listSlots === 'function') { try { return normalizeSlots(sys.listSlots()); } catch (e) {} }
    if (sys.index && typeof sys.index === 'object') { try { return normalizeSlots(sys.index); } catch (e) {} }
  }
  try {
    if (typeof localStorage !== 'undefined') {
      const idxRaw = localStorage.getItem(LS_PREFIX + 'index');
      if (idxRaw) { try { return normalizeSlots(JSON.parse(idxRaw)); } catch (e) {} }
      const out = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith(LS_PREFIX) || k === LS_PREFIX + 'index') continue;
        const slot = k.slice(LS_PREFIX.length);
        try {
          const env = JSON.parse(localStorage.getItem(k));
          const data = env && env.data;
          const player = data && data.player;
          const ownedShips = player && Array.isArray(player.ownedShips) ? player.ownedShips : [];
          const owned = ownedShips[(player && player.activeShipIndex) || 0] || null;
          out[slot] = {
            slot,
            savedAt: (env && env.savedAt) || (data && data.meta && data.meta.lastSavedAt) || '',
            playtimeS: (env && env.playtimeS) || (data && data.meta && data.meta.playtimeS) || 0,
            credits: player && player.credits,
            sectorName: '',
            shipName: owned && owned.defId,
          };
        } catch (e) {}
      }
      return out;
    }
  } catch (e) {}
  return {};
}

function normalizeSlots(idx) {
  if (!idx) return {};
  const out = {};
  if (Array.isArray(idx)) {
    for (const item of idx) if (item && item.slot != null) out[String(item.slot)] = Object.assign({ slot: String(item.slot) }, item);
    return out;
  }
  for (const slot in idx) if (idx[slot]) out[slot] = Object.assign({ slot }, idx[slot]);
  return out;
}

function isOccupied(meta) {
  return !!meta && (meta.savedAt || meta.lastSavedAt || meta.playtimeS != null);
}

function latestSave(slots) {
  let best = null;
  let bestScore = -Infinity;
  for (const slot in (slots || {})) {
    const meta = slots[slot];
    if (!isOccupied(meta)) continue;
    const when = meta.savedAt || meta.lastSavedAt || '';
    const savedAtScore = Date.parse(when) || 0;
    const playtimeS = Number(meta.playtimeS);
    const playtimeScore = Number.isFinite(playtimeS) ? playtimeS : 0;
    const score = savedAtScore || playtimeScore;
    if (score >= bestScore) { bestScore = score; best = { slot, meta }; }
  }
  return best;
}

function slotLabel(id) {
  if (id === 'quick' || id === 'autosave' || id === 'auto') return id.charAt(0).toUpperCase() + id.slice(1);
  return 'Slot ' + id;
}

function fmtPlaytime(playtimeS) {
  const s = Number(playtimeS);
  if (!Number.isFinite(s) || s < 0) return '';
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  return h > 0 ? (h + 'h ' + (m % 60) + 'm played') : (m + 'm played');
}

function fmtCredits(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  return Math.round(n).toLocaleString('en-US') + ' CR';
}

function titleCaseWords(s) {
  return String(s).split(/[\s_]+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function shipLabel(id) {
  if (!id) return '';
  return titleCaseWords(String(id).replace(/^ship_/, ''));
}

function saveSummaryText(slot, meta) {
  // Scan order: which save, how fresh, where, who, what next. ' · ' separators (house style)
  // instead of hyphens so save fields never read as one hyphenated run-on.
  const parts = [slotLabel(slot)];
  const when = meta && (meta.savedAt || meta.lastSavedAt);
  if (when) {
    const d = new Date(when);
    if (Number.isFinite(d.getTime())) parts.push('saved ' + d.toLocaleString());
  }
  if (meta && meta.recoveryAvailable) parts.push('Recovery copy');
  if (meta && meta.sectorName) parts.push(meta.sectorName);
  if (meta && meta.shipName) parts.push(shipLabel(meta.shipName));
  const objective = objectiveSummaryText(meta);
  if (objective) parts.push(objective);
  const playtime = fmtPlaytime(meta && meta.playtimeS);
  if (playtime) parts.push(playtime);
  const credits = fmtCredits(meta && meta.credits);
  if (credits) parts.push(credits);
  return parts.filter(Boolean).join(' · ');
}

function objectiveSummaryText(meta) {
  if (!meta) return '';
  return meta.objectiveSummary || meta.navObjectiveSummary || meta.missionSummary || meta.storySummary || '';
}

/** Version payload is bundled credits `{ version }` plus a build hash when the host can name one:
 * Electron's preload bridge answers from the shell's resolved release identity; a statically
 * served packaged bundle carries its receipt at the web root. Title and pause share this string. */
export function leftoverVersionToken(payload) {
  if (!payload || typeof payload.version !== 'string') return '';
  return payload.version.trim();
}

export function leftoverBuildToken(payload) {
  if (!payload || typeof payload.build !== 'string') return '';
  return payload.build.trim();
}

export function leftoverVersionLabel(payload) {
  const version = leftoverVersionToken(payload);
  if (!version) return 'SpaceFace';
  const build = leftoverBuildToken(payload);
  return 'SpaceFace v' + version + (build ? ' · ' + build : '');
}

export function applyLeftoverVersionText(target, payload) {
  if (!target) return '';
  const version = leftoverVersionToken(payload);
  if (!version) return target.textContent || '';
  const label = leftoverVersionLabel(payload);
  target.textContent = label;
  return label;
}

const RELEASE_RECEIPT_URL = 'spaceface-release-build.json';
let versionPayloadPromise = null;

/** Test seam: the resolved payload is session-cached so screens never refetch per mount. */
export function resetLeftoverVersionCache() {
  versionPayloadPromise = null;
}

export function loadLeftoverVersionPayload() {
  if (!versionPayloadPromise) versionPayloadPromise = resolveLeftoverVersionPayload();
  return versionPayloadPromise;
}

async function resolveLeftoverVersionPayload() {
  const base = { version: leftoverVersionToken(CREDITS), build: '' };
  try {
    const shell = globalThis.window && globalThis.window.spacefaceShell;
    if (shell && typeof shell.buildInfo === 'function') {
      const info = await shell.buildInfo();
      const build = leftoverBuildToken(info);
      if (build) return { version: leftoverVersionToken(info) || base.version, build: build.slice(0, 32) };
    }
  } catch (e) {}
  try {
    if (typeof fetch === 'function') {
      const res = await fetch(RELEASE_RECEIPT_URL, { cache: 'no-store' });
      if (res && res.ok) {
        const receiptData = await res.json();
        const digest = receiptData && receiptData.output && receiptData.output.digest;
        if (typeof digest === 'string' && /^[0-9a-f]{16,64}$/i.test(digest)) {
          return { ...base, build: digest.slice(0, 12) };
        }
      }
    }
  } catch (e) {}
  return base;
}

export function paintLeftoverVersion(target, stillCurrent) {
  if (!target) return Promise.resolve('');
  return loadLeftoverVersionPayload().then((payload) => {
    if (typeof stillCurrent === 'function' && !stillCurrent(target)) return '';
    return applyLeftoverVersionText(target, payload);
  });
}

let refs = null;

export const mainMenuScreen = {
  id: 'mainMenu',

  // The title stands on the authored "Field at dusk" still — it declares no `stage`, so the
  // ScreenManager never writes state.ui.stageRequest and no second scene is assembled on the
  // renderer. The live title-field stage this replaced loaded eight place GLBs plus the hull and
  // compiled its own pipelines while the menu was already open, then faded the plate out: the
  // menu stall and the "same scene rendered twice" pop both came from that path, and its held
  // brown frame is what flashed during Continue's handoff. The pre-rendered still is the same
  // approved picture at zero frame cost.

  mount(rootEl, ctx) {
    rootEl.innerHTML = '';
    rootEl.classList.add('k-screen', 'k-screen--stage');
    rootEl.dataset.kReady = '0';

    const { backdrop, title, stage, status } = createTitleFrame(rootEl);

    // The words. Visible words follow the sheet; the accessible names keep the game's core copy
    // (coreText) so every route that finds "New Game" / "Continue" / "Quit Game" still does.
    const items = [
      { action: 'continue', label: coreText('continue'), sub: 'Checking saves...', current: true },
      { action: 'newGame', label: coreText('newGame') },
      { action: 'load', label: 'Load' },
      // "Crucible" — the scored ten-wave Survival run (PQ-133 §12.2: direct main-menu entry). It
      // launches through the ordinary New Game path and never touches the Adventure save.
      { action: 'crucible', label: 'Crucible' },
      // "Archive" — opens the Codex on its Archive tab, where the authored intro cinematics replay.
      { action: 'archive', label: 'Archive' },
      { action: 'settings', label: coreText('settings') },
    ];
    // "Sandbox" — DEV ONLY. A testing harness for reaching mid-game features without playing for
    // an hour. Stripped from production builds via IS_DEV. See src/ui/screens/sandbox.js.
    if (IS_DEV) items.push({ action: 'sandbox', label: 'Sandbox' });
    items.push({ action: 'quit', label: 'Quit', danger: true });

    // THE LEGEND RAIL — the one piece of hardware the POSTER register carries
    // (approved/frames/frame-title-v2.png; approved/kit-notes.md §7). `.fh-rail` is the kit's own
    // class and its material is the produced `plate.poster.rail` nine-slice, so this is a rendered
    // object with thickness and a lit edge rather than a styled div. Decorative: the words in
    // front of it carry every name and every route.
    const rail = el('div', 'of-title-rail fh-rail');
    rail.setAttribute('aria-hidden', 'true');
    stage.appendChild(rail);

    const list = words(items, {
      ariaLabel: 'Title menu',
      onPick: (action) => this._pick(ctx, action),
    });
    stage.appendChild(list);

    const byAction = (action) => list.querySelector('[data-action="' + action + '"]');
    const bContinue = byAction('continue');
    const bNew = byAction('newGame');
    const bLoad = byAction('load');
    const bCrucible = byAction('crucible');
    const bArchive = byAction('archive');
    const bSettings = byAction('settings');
    const bSandbox = byAction('sandbox');
    const bQuit = byAction('quit');
    bLoad.setAttribute('aria-label', coreText('loadGame'));
    bArchive.setAttribute('aria-label', coreText('signalArchive'));
    bQuit.setAttribute('aria-label', coreText('quitGame'));
    if (bSandbox) bSandbox.classList.add('k-38');
    // The save summary rides Continue's sub line. `.sf-menu-save-summary` / `has-save` are inert
    // hooks the boot and title-continue checks query; kit.css styles the sub line.
    const saveSummary = bContinue.parentElement.querySelector('.k-word-sub');
    saveSummary.classList.add('sf-menu-save-summary');

    // The fine line: "SpaceFace v0.0.0 · " then the Credits word (Task B §1.6). The version text
    // lives in its own span so _loadVersion can rewrite it without touching the word.
    const version = el('div', 'k-fine');
    version.dataset.role = 'version';
    // The build light: the produced `light.dot.good.on` render, the frame's own corner detail.
    // Decorative — the build string beside it is the information.
    const buildLight = el('span', 'fh-light');
    buildLight.dataset.colour = 'good';
    buildLight.setAttribute('aria-hidden', 'true');
    version.appendChild(buildLight);
    const versionText = el('span', '', leftoverVersionLabel(CREDITS));
    version.appendChild(versionText);
    version.appendChild(el('span', '', ' · '));
    const bCredits = el('button', 'k-word k-word--fine', 'Credits');
    bCredits.type = 'button';
    bCredits.dataset.action = 'credits';
    bCredits.addEventListener('click', () => { cue('confirm'); this._pick(ctx, 'credits'); });
    version.appendChild(bCredits);
    // PQ-033.03: Achievements rides the same fine line as Credits — a quiet word, not a menu row.
    version.appendChild(el('span', '', ' · '));
    const bAchievements = el('button', 'k-word k-word--fine', 'Achievements');
    bAchievements.type = 'button';
    bAchievements.dataset.action = 'achievements';
    bAchievements.addEventListener('click', () => { cue('confirm'); this._pick(ctx, 'achievements'); });
    version.appendChild(bAchievements);
    rootEl.appendChild(version);

    refs = {
      root: rootEl, backdrop, title, list, version, versionText, bCredits, bAchievements, saveSummary, status,
      bNew, bContinue, bLoad, bSettings, bSandbox, bQuit, bCrucible, bArchive,
      buttons: [bContinue, bNew, bLoad, bCrucible, bArchive, bSettings, bSandbox, bQuit].filter(Boolean),
    };

    // data-k-ready is the capture seam's "photograph me" signal. With no `stage` on this screen
    // the authored still IS the picture the title was designed around, so this root raises it when
    // that still has decoded — and also when it cannot load, because a missing backdrop is the
    // final picture then, not a pending stage.
    rootEl.dataset.kReady = '0';
    const plate = new Image();
    plate.decoding = 'async';
    const markReady = () => { rootEl.dataset.kReady = '1'; };
    plate.onload = markReady;
    plate.onerror = markReady;
    plate.src = MENU_BACKDROP_SRC;
    if (plate.complete && plate.naturalWidth > 0) markReady();

    // Continue follows the save store the moment it settles, not the next periodic refresh: the
    // shared-store sync and a completed save both re-read the index.
    this._offBus = [];
    if (ctx && ctx.bus && typeof ctx.bus.on === 'function') {
      for (const evt of ['save:store-synced', 'save:completed']) {
        const off = ctx.bus.on(evt, () => { if (refs) this._render(ctx); });
        if (typeof off === 'function') this._offBus.push(off);
      }
    }

    this._render(ctx);
  },

  _pick(ctx, action) {
    switch (action) {
      case 'continue': {
        const latest = latestSave(readSaveIndex(ctx));
        if (!latest) {
          this._render(ctx);
          return;
        }
        // CONTINUE = black veil with the location name bottom-left (spec2/03 §3). The load proceeds
        // underneath the veil; the veil lifts when the sector is live.
        const loc = (latest.meta && (latest.meta.sectorName || latest.meta.sectorSummary)) || 'Helios Belt';
        this._showContinueFade(ctx, String(loc));
        ctx.bus.emit('game:load', { slot: latest.slot });
        return;
      }
      case 'newGame': pushWhenReady(ctx, 'newGame', 'New Game'); return;
      case 'load': pushWhenReady(ctx, 'saveLoad', 'Load Game'); return;
      case 'crucible': pushWhenReady(ctx, 'crucible', 'Crucible'); return;
      case 'archive': requestCodexTab('Archive'); pushWhenReady(ctx, 'codex', 'Signal Archive'); return;
      case 'settings': pushWhenReady(ctx, 'settings', 'Settings'); return;
      case 'credits': pushWhenReady(ctx, 'credits', 'Credits'); return;
      case 'achievements': pushWhenReady(ctx, 'achievements', 'Achievements'); return;
      case 'sandbox': pushWhenReady(ctx, 'sandbox', 'Sandbox'); return;
      case 'quit': requestQuit(ctx); return;
      default: return;
    }
  },

  _render(ctx) {
    if (!refs) return;
    setScreenButtonReady(refs.bNew, ctx, 'newGame', 'New Game');
    setScreenButtonReady(refs.bLoad, ctx, 'saveLoad', 'Load Game');
    setScreenButtonReady(refs.bSettings, ctx, 'settings', 'Settings');
    if (refs.bSandbox) setScreenButtonReady(refs.bSandbox, ctx, 'sandbox', 'Sandbox');
    if (refs.bCrucible) setScreenButtonReady(refs.bCrucible, ctx, 'crucible', 'Crucible');
    const sys = ctx.registry && ctx.registry.get && ctx.registry.get('save');
    if (sys && typeof sys.isSharedStoreSyncPending === 'function' && sys.isSharedStoreSyncPending()) {
      setDisabled(refs.bContinue, true, 'Checking saves');
      refs.saveSummary.classList.remove('has-save');
      refs.saveSummary.textContent = 'Checking saves...';
      if (refs.status) refs.status.textContent = 'Checking saves';
      this._syncCurrent();
      return;
    }
    const latest = latestSave(readSaveIndex(ctx));
    refs.saveSummary.classList.toggle('has-save', !!latest);
    if (latest) {
      const summary = saveSummaryText(latest.slot, latest.meta);
      refs.saveSummary.textContent = coreText('continueSummary', { summary });
      setDisabled(refs.bContinue, false, 'Load ' + summary);
      if (refs.status) refs.status.textContent = 'Save ready';
    } else {
      refs.saveSummary.textContent = coreText('noSave');
      setDisabled(refs.bContinue, true, 'No save found yet');
      if (refs.status) refs.status.textContent = 'No save';
    }
    this._syncCurrent();
  },

  // The default word (Continue when it can load, else New Game) carries aria-current and the
  // list's single Tab stop; the kit's roving focus takes over once focus is inside the list.
  _syncCurrent() {
    if (!refs) return;
    const target = refs.buttons.find((b) => !isDisabled(b)) || null;
    for (const b of refs.buttons) {
      const current = b === target;
      if (current) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
      b.tabIndex = current ? 0 : -1;
    }
  },

  onShow(ctx) {
    this._render(ctx);
    this._arrived = false;
    this._ctx = ctx;
    // The still is already on the wall, so the words arrive at once (reduced motion included).
    this._hold();
    this._arrive();
    if (refs) {
      const target = refs.buttons.find((b) => !isDisabled(b));
      if (target) try { target.focus(); } catch (e) {}
    }
    this._loadVersion();
    this._startIdleAttract({ state: ctx && ctx.state, rootEl: refs && refs.root });
  },
  onHide() { this._stopIdleAttract(); },
  refresh(ctx) { this._render(ctx); },

  dispose() {
    this._stopIdleAttract();
    for (const off of this._offBus || []) { try { off(); } catch (_) {} }
    this._offBus = [];
    refs = null;
  },

  // The idle attract (spec2/03 §3, MAP_OVERHAUL_BRIEF "cinematic still + idle drift"): after
  // ATTRACT_IDLE_MS without input the authored still itself begins a slow drift — `data-attract`
  // on the screen root arms a compositor-cheap transform on `.k-world--plate` (kit.css). This is
  // the still breathing, not a second scene: no renderer, no stage, no camera. Any input re-arms
  // the idle window; reduced motion never lets it arm at all.
  _startIdleAttract({ state, rootEl } = {}) {
    this._stopIdleAttract();
    if (!rootEl || !rootEl.dataset) return;
    const motionReduced = () => !!(
      (state && state.settings && state.settings.video && state.settings.video.motionReduce)
      || reducedMotion()
    );
    let idleStartedAtMs = null;
    let drifting = false;
    const setDrift = (on) => {
      drifting = on;
      if (on) rootEl.dataset.attract = '1'; else delete rootEl.dataset.attract;
    };
    const reset = () => { idleStartedAtMs = null; if (drifting) setDrift(false); };
    this._attractRoot = rootEl;
    this._attractReset = reset;
    const session = (this._attractSession = {});
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('keydown', reset);
      window.addEventListener('pointerdown', reset);
      window.addEventListener('mousemove', reset);
      window.addEventListener('wheel', reset);
    }
    if (typeof document !== 'undefined' && document.addEventListener) {
      this._attractVisibilityReset = reset;
      document.addEventListener('visibilitychange', reset);
    }
    this._attractRaf = (typeof requestAnimationFrame === 'function')
      ? requestAnimationFrame(function tick(frameNowMs) {
          // A dispatched tick can outlive a stop() — refuse to re-arm from a dead session.
          if (mainMenuScreen._attractSession !== session) return;
          const nowMs = Number.isFinite(frameNowMs) ? frameNowMs : Date.now();
          if (idleStartedAtMs == null) idleStartedAtMs = nowMs;
          if (motionReduced()) {
            idleStartedAtMs = nowMs;
            if (drifting) setDrift(false);
          } else if (nowMs - idleStartedAtMs >= ATTRACT_IDLE_MS && !drifting) {
            setDrift(true);
          }
          mainMenuScreen._attractRaf = requestAnimationFrame(tick);
        })
      : null;
  },
  _stopIdleAttract() {
    const reset = this._attractReset;
    this._attractReset = null;
    if (this._attractRaf && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this._attractRaf);
      this._attractRaf = null;
    }
    if (reset && typeof window !== 'undefined' && window.removeEventListener) {
      window.removeEventListener('keydown', reset);
      window.removeEventListener('pointerdown', reset);
      window.removeEventListener('mousemove', reset);
      window.removeEventListener('wheel', reset);
    }
    if (this._attractVisibilityReset && typeof document !== 'undefined' && document.removeEventListener) {
      document.removeEventListener('visibilitychange', this._attractVisibilityReset);
      this._attractVisibilityReset = null;
    }
    const root = this._attractRoot;
    this._attractRoot = null;
    this._attractSession = null;
    if (root && root.dataset && root.dataset.attract) delete root.dataset.attract;
  },

  // Arrival (sheet: "the menu arrives after the hull"): the title settles from the top, then the
  // words stamp in 60 ms apart. Once per show; reduced motion shows everything at once (kit motion).
  _arrive() {
    if (this._arrived || !refs) return;
    this._arrived = true;
    try {
      settle(refs.title, { from: 'top', state: 'title:arrive' });
      stamp(refs.list.children, { gap: 60, state: 'title:arrive' });
    } catch (e) {
      console.warn('[mainMenu] arrival motion skipped', e);
    }
  },

  // The pre-arrival state (the kit's own `.k-in` start pose, which settle/stamp then release).
  // Reduced motion never holds: everything is simply there.
  _hold() {
    if (!refs || reducedMotion()) return;
    refs.title.classList.add('k-in', 'k-in--top');
    for (const li of refs.list.children) li.classList.add('k-in', 'k-in--stamp');
  },

  // Version in fine print. The leftover payload is bundled credits; pause paints the same string.
  _loadVersion() {
    if (!refs) return;
    const target = refs.versionText;
    void paintLeftoverVersion(target, () => refs && refs.versionText === target);
  },

  // CONTINUE: the black veil with the location name bottom-left (spec2/03 §3). It mounts on
  // #ui-root, above the title; styles/ui.css owns its look. The load runs underneath it.
  _showContinueFade(ctx, locationName) {
    if (typeof document === 'undefined') return;
    let fade = document.querySelector('.sf-continue-fade');
    if (!fade) {
      fade = document.createElement('div');
      fade.className = 'sf-continue-fade';
      const loc = document.createElement('div');
      loc.className = 'sf-continue-fade__loc';
      fade.appendChild(loc);
      (document.getElementById('ui-root') || document.body).appendChild(fade);
    }
    fade.querySelector('.sf-continue-fade__loc').textContent = locationName || 'Helios Belt';
    // Force reflow so the transition runs from 0 → 1.
    void fade.offsetWidth;
    fade.classList.add('open');
    // Lift the veil once the sector is live — that means a real flight frame has been presented,
    // not just mode === 'flight': the mode flag lands one commit before the first draw, and the
    // canvas still holds the frozen menu-era picture then. Lifting on the flag alone was the
    // "brown frame" flash. The 4s cap stays as the failsafe if no present ever arrives.
    const frameCount = () => {
      const info = ctx && ctx.state && ctx.state.render
        && ctx.state.render.renderer && ctx.state.render.renderer.info;
      // Three's presented-frame counter lives at info.render.frame (info.frame does not exist).
      const frame = info && info.render && info.render.frame;
      return Number.isFinite(frame) ? frame : null;
    };
    const frameAtClick = frameCount();
    const start = Date.now();
    const lift = () => {
      const live = ctx && ctx.state && ctx.state.mode === 'flight';
      const presented = frameAtClick == null || (frameCount() != null && frameCount() > frameAtClick);
      if ((live && presented) || Date.now() - start > 4000) {
        fade.classList.remove('open');
        setTimeout(() => { if (fade.parentNode) fade.remove(); }, 1100);
        return;
      }
      setTimeout(lift, 120);
    };
    setTimeout(lift, 200);
  },
};
