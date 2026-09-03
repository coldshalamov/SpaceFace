// Main Menu / title screen (ARCHITECTURE §1.3 step 6, §5; design/specs/09).
// New Game / Continue / Load / Settings. Continue is enabled iff a save exists, shows
// the exact latest slot metadata, and loads that displayed slot so players trust resume before
// committing to a load.
// Browser, Electron dev, and packaged desktop all arrive here through the same player route.

import { requestCodexTab } from './codex.js';
import { coreText } from '../localizedCoreCopy.js';
import { requestQuit } from '../quitGame.js';
import { IS_DEV } from '../../core/devMode.js';

const STYLE_ID = 'sf-main-menu-style';
const LS_PREFIX = 'sf.save.';
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
function setScreenButtonReady(button, ctx, id, label) {
  if (!button) return;
  const ready = screenReady(ctx, id);
  button.disabled = !ready;
  button.title = ready ? '' : label + ' is initializing';
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
function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  // Title-specific behavior styles only. The shared menu fascia (plate, buttons, headings,
  // save-summary readout, title lockup) lives in styles/menu.css — previously a copy of that
  // whole block was pasted here and into every other menu screen.
  s.textContent = `
  /* First-show stagger-in (spec2/03 §3): ledger rows slide in from the left 90ms
     apart, first show only. Reduced-motion users get the global ~0ms compression,
     which lands these fill-forwards rows on their visible end state. */
  .sf-menu.sf-stagger .sf-col > button { opacity:0; transform:translateX(-10px);
    animation:sf-stagger-in .3s cubic-bezier(.2,.8,.2,1) forwards; }
  .sf-menu.sf-stagger .sf-col > button:nth-child(1) { animation-delay:0ms; }
  .sf-menu.sf-stagger .sf-col > button:nth-child(2) { animation-delay:90ms; }
  .sf-menu.sf-stagger .sf-col > button:nth-child(3) { animation-delay:180ms; }
  .sf-menu.sf-stagger .sf-col > button:nth-child(4) { animation-delay:270ms; }
  .sf-menu.sf-stagger .sf-col > button:nth-child(5) { animation-delay:360ms; }
  @keyframes sf-stagger-in { to { opacity:1; transform:translateX(0); } }
  /* CONTINUE fade-to-game + location label (spec2/03 §3). The veil mounts on #ui-root, outside
     the .sf-menu token scope, so it carries its own fascia-matched type/color. */
  .sf-continue-fade { position:fixed; inset:0; z-index:1900; background:#000; opacity:0;
    pointer-events:auto; transition:opacity 1s ease; display:flex; align-items:flex-end;
    justify-content:flex-start; padding:0 0 36px 36px; }
  .sf-continue-fade.open { opacity:1; }
  .sf-continue-fade__loc { font-family:"IBM Plex Mono","Consolas",ui-monospace,monospace;
    letter-spacing:.06em; font-size:12px; color:#93a6b3; text-transform:uppercase;
    border-left:1px solid rgba(148,178,205,.35); padding-left:12px; }
  `;
  document.head.appendChild(s);
}
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function button(label) { const b = document.createElement('button'); b.className = 'sf-btn'; b.textContent = label; return b; }

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

let refs = null;

export const mainMenuScreen = {
  id: 'mainMenu',

  mount(rootEl, ctx) {
    injectStyle();
    rootEl.innerHTML = '';
    rootEl.classList.add('panel', 'sf-menu', 'sf-menu-narrow', 'sf-menu--bare');
    // Diegetic fascia stamp (styles/menu.css .sf-menu::before reads it).
    rootEl.dataset.stamp = 'PUBLIC TERMINAL / SPACEFACE';

    // First-show stagger-in (spec2/03 §3): items fade up 90ms apart, first show only.
    if (!mainMenuScreen._staggeredOnce) {
      rootEl.classList.add('sf-stagger');
      mainMenuScreen._staggeredOnce = true;
      // Drop the stagger class after the animation so re-shows aren't re-animated.
      setTimeout(() => rootEl.classList.remove('sf-stagger'), 900);
    }

    rootEl.appendChild(el('h1', 'sf-title-logo', 'SPACEFACE'));
    rootEl.appendChild(el('div', 'sf-title-tag', 'CONTRACT 47-A REMAINS OPEN'));

    const saveSummary = el('div', 'sf-menu-save-summary', 'Checking saves...');
    rootEl.appendChild(saveSummary);

    const col = el('div', 'sf-col');
    rootEl.appendChild(col);

    const bNew = button(coreText('newGame'));
    const bContinue = button(coreText('continue'));
    bContinue.classList.add('sf-btn--primary');
    const bLoad = button(coreText('loadGame'));
    const bSettings = button(coreText('settings'));
    col.appendChild(bNew); col.appendChild(bContinue); col.appendChild(bLoad); col.appendChild(bSettings);

    // "Crucible" — the scored ten-wave Survival run (PQ-133 §12.2: direct main-menu entry). It
    // launches through the ordinary New Game path and never touches the Adventure save. This is a
    // NORMAL menu entry, not the dev-only Sandbox tier.
    const bCrucible = button('Crucible');
    col.appendChild(bCrucible);
    bCrucible.addEventListener('click', () => pushWhenReady(ctx, 'crucible', 'Crucible'));

    // "Signal Archive" — opens the Codex on its Archive tab, where all four authored intro cinematics
    // replay from poster cards. (Replaces the old single-clip "Watch Intro Cinematic".)
    const bArchive = button(coreText('signalArchive'));
    col.appendChild(bArchive);
    bArchive.addEventListener('click', () => { requestCodexTab('Archive'); pushWhenReady(ctx, 'codex', 'Signal Archive'); });

    // "Sandbox" — DEV ONLY. A testing harness for reaching mid-game features (weapons, drilling,
    // sectors) without playing for an hour. Stripped from production builds via IS_DEV (which folds
    // to false when __SPACEFACE_PRODUCTION__ is defined). See src/ui/screens/sandbox.js.
    let bSandbox = null;
    if (IS_DEV) {
      bSandbox = button('Sandbox');
      col.appendChild(bSandbox);
      bSandbox.addEventListener('click', () => pushWhenReady(ctx, 'sandbox', 'Sandbox'));
    }

    bNew.addEventListener('click', () => pushWhenReady(ctx, 'newGame', 'New Game'));
    bContinue.addEventListener('click', () => {
      const latest = latestSave(readSaveIndex(ctx));
      if (!latest) {
        this._render(ctx);
        return;
      }
      // CONTINUE = 1s black-to-game fade with the location name bottom-left (spec2/03 §3). The load
      // proceeds underneath the veil; the fade lifts when the sector is live.
      const loc = (latest.meta && (latest.meta.sectorName || latest.meta.sectorSummary)) || 'HELIOS BELT';
      this._showContinueFade(ctx, String(loc).toUpperCase());
      ctx.bus.emit('game:load', { slot: latest.slot });
    });
    bLoad.addEventListener('click', () => pushWhenReady(ctx, 'saveLoad', 'Load Game'));
    bSettings.addEventListener('click', () => pushWhenReady(ctx, 'settings', 'Settings'));

    const bQuit = button(coreText('quitGame'));
    bQuit.setAttribute('aria-label', 'Quit Game');
    bQuit.addEventListener('click', () => requestQuit(ctx));
    col.appendChild(bQuit);

    refs = { bNew, bContinue, bLoad, bSettings, saveSummary, bSandbox, bQuit, bCrucible };
    this._render(ctx);
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
      refs.bContinue.disabled = true;
      refs.saveSummary.classList.remove('has-save');
      refs.saveSummary.textContent = 'Checking saves...';
      refs.bContinue.title = 'Checking saves';
      return;
    }
    const latest = latestSave(readSaveIndex(ctx));
    refs.bContinue.disabled = !latest;
    refs.saveSummary.classList.toggle('has-save', !!latest);
    if (latest) {
      const summary = saveSummaryText(latest.slot, latest.meta);
      refs.saveSummary.textContent = coreText('continueSummary', { summary });
      refs.bContinue.title = 'Load ' + summary;
    } else {
      refs.saveSummary.textContent = coreText('noSave');
      refs.bContinue.title = 'No save found yet';
    }
  },

  onShow(ctx) {
    this._render(ctx);
    if (refs && refs.bContinue && !refs.bContinue.disabled) try { refs.bContinue.focus(); } catch (e) {}
    this._startIdleAttract(ctx);
  },
  onHide() {
    this._stopIdleAttract();
  },
  refresh(ctx) { this._render(ctx); },

  // 12s idle attract (spec2/03 §3): after 12s of no input at the title, the camera drifts through a
  // live background sector (render-only — the sim stays frozen, timeScale 0). Any input resets it.
  _startIdleAttract(ctx) {
    this._stopIdleAttract();
    if (!ctx || !ctx.state) return;
    const state = ctx.state;
    let idleStartedAtMs = null;
    let drifting = false;
    const reducedMotion = () => !!(
      state.settings && state.settings.video && state.settings.video.motionReduce
    );
    const reset = () => {
      idleStartedAtMs = null;
      if (drifting) this._setAttractDrift(state, false);
      drifting = false;
    };
    this._attractState = state;
    this._attractReset = reset;
    if (typeof window !== 'undefined') {
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
          const nowMs = Number.isFinite(frameNowMs) ? frameNowMs : Date.now();
          if (idleStartedAtMs == null) idleStartedAtMs = nowMs;
          if (reducedMotion()) {
            idleStartedAtMs = nowMs;
            if (drifting) mainMenuScreen._setAttractDrift(state, false);
            drifting = false;
          } else if (nowMs - idleStartedAtMs >= ATTRACT_IDLE_MS && !drifting) {
            drifting = true;
            mainMenuScreen._setAttractDrift(state, true);
          }
          mainMenuScreen._attractRaf = requestAnimationFrame(tick);
        })
      : null;
  },
  _stopIdleAttract() {
    const reset = this._attractReset;
    const state = this._attractState;
    this._attractReset = null;
    this._attractState = null;
    if (this._attractRaf && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this._attractRaf);
      this._attractRaf = null;
    }
    if (reset && typeof window !== 'undefined') {
      window.removeEventListener('keydown', reset);
      window.removeEventListener('pointerdown', reset);
      window.removeEventListener('mousemove', reset);
      window.removeEventListener('wheel', reset);
    }
    if (this._attractVisibilityReset && typeof document !== 'undefined' && document.removeEventListener) {
      document.removeEventListener('visibilitychange', this._attractVisibilityReset);
    }
    this._attractVisibilityReset = null;
    // Best-effort: clear the drift flag on whatever render/camera the app exposes.
    try {
      const sf = !state && typeof window !== 'undefined' && window.SF;
      const st = state || (sf && sf.state);
      if (st && st.render) this._setAttractDrift(st, false);
    } catch (e) { /* non-critical */ }
  },
  // Nudge the camera controller into a slow render-only drift orbit. timeScale stays 0 (no sim).
  _setAttractDrift(state, on) {
    const cam = state.render && state.render.cameraCtrl;
    if (!cam) return;
    if (on) {
      if (typeof cam.setAttract === 'function') cam.setAttract(true);
      else if (cam.attract != null) cam.attract = true;
    } else {
      if (typeof cam.setAttract === 'function') cam.setAttract(false);
      else if (cam.attract != null) cam.attract = false;
    }
  },

  // CONTINUE: 1s black-to-game fade with the location name bottom-left (spec2/03 §3).
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
    fade.querySelector('.sf-continue-fade__loc').textContent = locationName || 'HELIOS BELT';
    // Force reflow so the transition runs from 0 → 1.
    void fade.offsetWidth;
    fade.classList.add('open');
    // Lift the veil once the sector is live (mode === flight) or after a hard 4s cap.
    const start = Date.now();
    const lift = () => {
      const live = ctx && ctx.state && ctx.state.mode === 'flight';
      if (live || Date.now() - start > 4000) {
        fade.classList.remove('open');
        setTimeout(() => { if (fade.parentNode) fade.remove(); }, 1100);
        return;
      }
      setTimeout(lift, 120);
    };
    setTimeout(lift, 200);
  },
};
