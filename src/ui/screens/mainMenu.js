// Main Menu / title screen (ARCHITECTURE §1.3 step 6, §5; design/specs/09).
// The sheet's title line (design/frontend/direction/DIRECTION_SHEET.md, title screen): the starter
// hull in its hangar fills the frame, the game's name enormous top-left, a column of words down the
// left edge, the version in fine print. Built on the frontend kit (styles/kit.css, src/ui/kit/);
// this file owns no CSS. Continue is enabled iff a save exists, shows the exact latest slot metadata,
// and loads that displayed slot so players trust resume before committing to a load.
// Browser, Electron dev, and packaged desktop all arrive here through the same player route.

import { requestCodexTab } from './codex.js';
import { coreText } from '../localizedCoreCopy.js';
import { requestQuit } from '../quitGame.js';
import { IS_DEV } from '../../core/devMode.js';
import { NEW_GAME } from '../../data/newGameDefaults.js';
import { createShipPreviewMount, dockInteriorIdForArchetype } from '../shipPreviewMount.js';
import { el, words, settle, stamp, reducedMotion } from '../kit/index.js';

const LS_PREFIX = 'sf.save.';
// Sheet: the hull drifts, it does not spin. ≈ 3.4° per second.
const HULL_DRIFT_RAD_PER_S = 0.06;
const HULL_ZOOM = 1.25;

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

function motionReduced(ctx) {
  const video = ctx && ctx.state && ctx.state.settings && ctx.state.settings.video;
  return reducedMotion() || !!(video && video.motionReduce);
}

let refs = null;

export const mainMenuScreen = {
  id: 'mainMenu',

  mount(rootEl, ctx) {
    rootEl.innerHTML = '';
    rootEl.classList.add('k-screen', 'k-screen--stage');
    rootEl.dataset.kReady = '0';

    // The hull in its hangar: the kit's world canvas, 150vw wide and shifted left so the mount's
    // centred hull lands right of centre, behind the words (kit.css .k-world).
    const canvas = el('canvas', 'k-world');
    canvas.setAttribute('aria-hidden', 'true');
    rootEl.appendChild(canvas);

    const title = el('header', 'k-title');
    title.appendChild(el('h1', 'k-display k-t-name', 'SpaceFace'));
    title.appendChild(el('p', 'k-t-emph k-62', 'Contract 47-A remains open'));
    rootEl.appendChild(title);

    const stage = el('div', 'k-stage');
    rootEl.appendChild(stage);

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

    const version = el('div', 'k-fine', 'SpaceFace');
    version.dataset.role = 'version';
    rootEl.appendChild(version);

    refs = {
      root: rootEl, canvas, title, list, version, saveSummary,
      bNew, bContinue, bLoad, bSettings, bSandbox, bQuit, bCrucible, bArchive,
      buttons: [bContinue, bNew, bLoad, bCrucible, bArchive, bSettings, bSandbox, bQuit].filter(Boolean),
    };

    // The starter hull in the accepted hangar bay. Every archetype currently resolves to the
    // reviewed neutral bay (shipPreviewMount DOCK_INTERIOR_BY_ARCHETYPE is empty), so the starter's
    // home station needs no lookup here. No WebGL: the words still render over nothing painted.
    this.mount3d = null;
    try {
      this.mount3d = createShipPreviewMount(canvas, {
        dockId: dockInteriorIdForArchetype(null),
        authoredShips: true,
        authoredWarmup: true,
        fastPreview: false,
        allowFastFallback: false,
        // The words arrive on the first frame (the sheet: after the hull begins). data-k-ready,
        // the capture seam's "photograph me" signal, waits for the authored hull itself: a frame of
        // hangar with the placeholder body would be an honest DOM and a missing picture.
        onFirstFrame: () => {
          this._hullFramed = true;
          this._arrive();
          if (this.mount3d && this.mount3d.getAssetState() === 'authored') rootEl.dataset.kReady = '1';
        },
        onAssetSettled: ({ state }) => {
          if (state === 'authored') rootEl.dataset.kReady = '1';
        },
      });
    } catch (e) {
      rootEl.dataset.kReady = '0';
      console.warn('[mainMenu] hull mount unavailable; the title renders without it', e);
    }
    this._onResize = () => { if (this.mount3d) try { this.mount3d.resize(); } catch (_) {} };
    if (typeof window !== 'undefined') window.addEventListener('resize', this._onResize);

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
      this._syncCurrent();
      return;
    }
    const latest = latestSave(readSaveIndex(ctx));
    refs.saveSummary.classList.toggle('has-save', !!latest);
    if (latest) {
      const summary = saveSummaryText(latest.slot, latest.meta);
      refs.saveSummary.textContent = coreText('continueSummary', { summary });
      setDisabled(refs.bContinue, false, 'Load ' + summary);
    } else {
      refs.saveSummary.textContent = coreText('noSave');
      setDisabled(refs.bContinue, true, 'No save found yet');
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
    if (this.mount3d) {
      try {
        this.mount3d.setActive(true);
        this.mount3d.show(NEW_GAME.shipId, { rotating: false, fittings: NEW_GAME.fittedModules, isPlayer: true });
        this.mount3d.setZoom(HULL_ZOOM);
      } catch (e) {
        console.warn('[mainMenu] hull show failed; the title renders without it', e);
      }
      // On a re-show the mount's first frame has already fired (the def id is unchanged).
      if (this._hullFramed) this._arrive();
      this._startDrift(ctx);
    } else {
      // No hull: the words still arrive.
      this._arrive();
    }
    if (refs) {
      const target = refs.buttons.find((b) => !isDisabled(b));
      if (target) try { target.focus(); } catch (e) {}
    }
    this._loadVersion();
  },
  onHide() {
    this._stopDrift();
    if (this.mount3d) try { this.mount3d.setActive(false); } catch (_) {}
  },
  refresh(ctx) { this._render(ctx); },

  dispose() {
    this._stopDrift();
    if (typeof window !== 'undefined' && this._onResize) window.removeEventListener('resize', this._onResize);
    this._onResize = null;
    for (const off of this._offBus || []) { try { off(); } catch (_) {} }
    this._offBus = [];
    if (this.mount3d) { try { this.mount3d.dispose(); } catch (_) {} this.mount3d = null; }
    refs = null;
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

  // The hull drifts ≈ 3.4° per second while the title is up; never under reduced motion.
  _startDrift(ctx) {
    this._stopDrift();
    if (!this.mount3d || motionReduced(ctx) || typeof requestAnimationFrame !== 'function') {
      if (this.mount3d) try { this.mount3d.frame(); } catch (_) {}
      return;
    }
    let last = null;
    const tick = (nowMs) => {
      if (!this.mount3d) { this._driftRaf = 0; return; }
      const now = Number.isFinite(nowMs) ? nowMs : performance.now();
      const dt = last == null ? 0 : Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      if (motionReduced(this._ctx)) { this._driftRaf = 0; return; }
      try { this.mount3d.rotateBy(dt * HULL_DRIFT_RAD_PER_S); } catch (_) {}
      this._driftRaf = requestAnimationFrame(tick);
    };
    this._driftRaf = requestAnimationFrame(tick);
  },
  _stopDrift() {
    if (this._driftRaf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this._driftRaf);
    this._driftRaf = 0;
  },

  // Version in fine print. The server serves the repo root, so package.json is reachable in the
  // browser and in Electron; anything else leaves the name alone.
  _loadVersion() {
    if (!refs || typeof fetch !== 'function') return;
    const target = refs.version;
    fetch('/package.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => {
        if (p && typeof p.version === 'string' && refs && refs.version === target) target.textContent = 'SpaceFace v' + p.version;
      })
      .catch(() => {});
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
