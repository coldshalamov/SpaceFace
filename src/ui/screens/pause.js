import { createPauseFrame } from '../views/menuFrames.js';
// Pause menu (ARCHITECTURE §5.4, design/specs/09). Opened by ESC in flight.
// The sheet's line (design/frontend/direction/DIRECTION_SHEET.md, pause, amended by Task B §1.4):
// the world held, not hidden — the frozen game at 0 % scrim; "Paused" at screen-title size top-left;
// the flight brief as one sentence beneath it; the actions as a column of words down the left edge;
// the HUD dims to 38 % rather than disappearing. Photo mode (§1.7) is a sub-state of this screen:
// the pause root goes invisible under body.k-photo while the stack (and the sim pause) is unchanged.
// Built on the frontend kit (styles/kit.css, src/ui/kit/); this file owns no CSS.
// ScreenManager owns aggregate pause/resume events and the time-effects request. This screen owns
// only pause-mode presentation and navigation intents.

import { confirm } from '../confirm.js';
import { BINDINGS } from '../bindings.js';
import { SECTORS } from '../../data/sectors.js';
import { MAP_FOCUS, mapHandoffAction, openGalaxyMap } from '../mapAuthority.js';
import { coreText } from '../localizedCoreCopy.js';
import { requestQuit } from '../quitGame.js';
import { IS_DEV } from '../../core/devMode.js';
import { el, words, settle, cue } from '../kit/index.js';

const SECTOR_BY_ID = new Map(SECTORS.map((s) => [s.id, s]));
/** The photo-mode hint fades after this long (Task B §1.7: two seconds). */
const PHOTO_HINT_MS = 2000;

/** Find the screen manager regardless of where uiRoot exposed it. Screens navigate
 *  by asking the manager to push/pop/replace; if it is not reachable we degrade to
 *  emitting ui:* navigation events that uiRoot can also honour. */
function getManager(ctx) {
  if (ctx && ctx.screenManager) return ctx.screenManager;
  if (ctx && ctx.screens && ctx.screens.pushScreen) return ctx.screens;
  const ui = ctx && ctx.registry && ctx.registry.get && ctx.registry.get('ui');
  if (ui && ui.screenManager) return ui.screenManager;
  if (ui && ui.manager) return ui.manager;
  return null;
}

function nav(ctx, method, arg) {
  const mgr = getManager(ctx);
  if (mgr && typeof mgr[method] === 'function') { mgr[method](arg); return; }
  // Fallback: let uiRoot handle navigation via events.
  ctx.bus.emit('ui:' + method, { id: arg });
}

function prettyId(id) {
  return String(id || '')
    .replace(/^(mission|station|sector|cmdty|ship)_/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function missionId(m) {
  return m && (m.id != null ? m.id : m.missionId);
}

function missionTitle(m) {
  return (m && (m.title || m.name)) || prettyId(m && m.type) || 'Contract';
}

function fmtTime(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return h + 'h ' + m + 'm';
  if (m > 0) return m + 'm';
  return s + 's';
}

function missionProgress(m) {
  const prog = Math.max(0, Number(m && m.objectiveProgress) || 0);
  const tgt = Math.max(1, Number(m && m.objectiveTarget) || 1);
  return Math.min(100, Math.round((prog / tgt) * 100)) + '% complete';
}

function deadlineText(state, mission) {
  const deadline = Number(mission && mission.deadline_s);
  const now = Number(state && state.simTime) || 0;
  if (!Number.isFinite(deadline) || deadline <= now) return '';
  return ' · ' + fmtTime(deadline - now) + ' left';
}

function missionDestination(m) {
  return (m && (m.destName || m.destStationName || m.stationName)) ||
    prettyId(m && (m.destStationId || m.destSectorId || m.dest)) || 'the objective';
}

function missionCommodity(m) {
  const id = m && m.params && m.params.cmdtyId;
  return id ? prettyId(id) : 'cargo';
}

function missionNextStep(m) {
  const dest = missionDestination(m);
  switch (m && m.type) {
    case 'cargo_delivery':
    case 'passenger_transport':
    case 'escort':
    case 'smuggling_run':
    case 'salvage_retrieval':
      return 'Next: resume, follow tracked nav to ' + dest + ', then dock to resolve the handoff.';
    case 'bulk_trade':
      return 'Next: buy or carry ' + missionCommodity(m) + ', then sell into the tracked destination market.';
    case 'mining_quota':
      return 'Next: mine ' + missionCommodity(m) + ', keep cargo room open, then follow the tracker for payout.';
    case 'bounty_hunt':
    case 'patrol_clear':
      return 'Next: resume, follow tracked nav, and expect combat before the timer runs down.';
    case 'recon_scan':
      return 'Next: resume, follow tracked nav, and scan each marked site.';
    default:
      return 'Next: resume and follow the tracked objective; Mission Log (' + BINDINGS.missionLog.label + ') has the details.';
  }
}

function waypointText(wp) {
  if (!wp) return '';
  return wp.label || wp.reason || wp.stationName || prettyId(wp.stationId || wp.sectorId || wp.kind) || 'Nav marker set';
}

function sectorDisplayName(sectorId, fallback) {
  if (fallback) return String(fallback);
  const sector = sectorId ? SECTOR_BY_ID.get(sectorId) : null;
  return (sector && sector.name) || prettyId(sectorId);
}

function routeCommitment(state, wp) {
  const currentSectorId = state && state.world && state.world.currentSectorId || null;
  const targetSectorId = wp && wp.sectorId || null;
  const hasLocalFix = !!(wp && wp.pos);
  const targetSectorName = targetSectorId ? sectorDisplayName(targetSectorId, wp && wp.sectorName) : '';
  if (targetSectorId && !hasLocalFix && (!currentSectorId || targetSectorId !== currentSectorId)) {
    return { kind: 'inter-system', objectiveLabel: 'INTER-SYSTEM ROUTE', targetSectorName };
  }
  if (hasLocalFix || (targetSectorId && currentSectorId && targetSectorId === currentSectorId)) {
    return { kind: 'local', objectiveLabel: 'LOCAL ROUTE', targetSectorName };
  }
  return { kind: 'nav', objectiveLabel: 'NAV SET', targetSectorName: '' };
}

export function pauseMapAction(state) {
  const wp = state && state.nav && state.nav.waypoint;
  if (!wp) return null;
  const commitment = routeCommitment(state, wp);
  const currentSectorId = state && state.world && state.world.currentSectorId || null;
  if (commitment.kind !== 'inter-system') {
    const place = commitment.targetSectorName ? ' in ' + commitment.targetSectorName : ' in this system';
    const hint = commitment.kind === 'local'
      ? 'Open Local Map (' + BINDINGS.localmap.label + ') for the live marker' + place + '; no jump route is required.'
      : 'Open Local Map (' + BINDINGS.localmap.label + ') for the live marker in this system.';
    // One public map surface: galaxyMap + LOCAL focus (not dual-primary localmap/starmap).
    const handoff = mapHandoffAction({
      focus: MAP_FOCUS.LOCAL,
      label: 'Local Map (' + BINDINGS.localmap.label + ')',
      title: 'Open Local Map',
      body: hint,
      sectorId: wp.sectorId || currentSectorId || null,
      stationId: wp.stationId || null,
      pos: wp.pos || null,
      missionId: wp.missionId || null,
      source: 'pause',
    });
    return {
      ...handoff,
      hint,
      commitment: commitment.kind,
      objectiveLabel: commitment.objectiveLabel,
    };
  }
  const target = commitment.targetSectorName ? ' to ' + commitment.targetSectorName : '';
  const hint = 'Open Star Map (' + BINDINGS.starmap.label + ') to review the inter-system route' + target + ' before committing a jump.';
  // Inter-system review still uses the same galaxyMap surface with GALAXY focus.
  const handoff = mapHandoffAction({
    focus: MAP_FOCUS.GALAXY,
    label: 'Star Map (' + BINDINGS.starmap.label + ')',
    title: 'Open Star Map',
    body: hint,
    sectorId: wp.sectorId || null,
    stationId: wp.stationId || null,
    pos: null,
    missionId: wp.missionId || null,
    source: 'pause',
  });
  return {
    ...handoff,
    hint,
    commitment: commitment.kind,
    objectiveLabel: commitment.objectiveLabel,
  };
}

/** Open the pause map review CTA through mapAuthority (never pushScreen localmap|starmap). */
function openPauseMapReview(ctx, mapAction) {
  if (!mapAction) return false;
  return openGalaxyMap(ctx, {
    focus: mapAction.focus,
    sectorId: mapAction.sectorId,
    stationId: mapAction.stationId,
    pos: mapAction.pos,
    missionId: mapAction.missionId,
    label: mapAction.label,
    source: (mapAction.source) || 'pause',
  });
}

function routeNextText(mapAction) {
  if (!mapAction) return 'resume and follow the current marker; open the map if the route gets muddy.';
  if (mapAction.commitment === 'inter-system') {
    return mapAction.hint + ' Resume after the destination sector looks right.';
  }
  if (mapAction.commitment === 'local') {
    return mapAction.hint + ' Resume and fly the marker in-system.';
  }
  return 'resume and follow the current marker; ' + mapAction.hint;
}

function slotLabel(id) {
  if (!id) return '';
  if (id === 'quick' || id === 'autosave' || id === 'auto') return id.charAt(0).toUpperCase() + id.slice(1);
  return 'Slot ' + id;
}

function fmtSavedAt(value) {
  if (!value) return '';
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleString();
}

function saveLine(state) {
  // A Crucible run is ephemeral by contract and saving is refused for it (PQ-133 ruling 2).
  // Telling the player to press F5 here would be instructing them to attempt the one thing the
  // save system now blocks.
  const run = state && state.run;
  if (run && run.phase !== 'inactive' && (run.kind === 'survival' || run.kind === 'lab')) {
    return 'This run is not saved. Leaving the arena ends it; your campaign save is untouched.';
  }
  const slot = state && state.save && state.save.currentSlot;
  const savedAt = state && state.meta && state.meta.lastSavedAt;
  const savedWhen = fmtSavedAt(savedAt);
  if (savedWhen) {
    return 'Saved ' + savedWhen + (slot ? ' to ' + slotLabel(slot) : '') + '. F5 quick-saves; F9 loads quick.';
  }
  if (slot) {
    return 'Loaded ' + slotLabel(slot) + ', but no save has landed this session. Use Save or F5 before quitting.';
  }
  return 'Unsaved run. Use Save or F5 before quitting; autosaves fire after dock, undock, sector entry, and completed jobs.';
}

export function pauseStatusLines(state) {
  const active = (state && state.missions && Array.isArray(state.missions.active) ? state.missions.active : [])
    .filter((m) => m && (!m.status || m.status === 'active'));
  const trackedId = state && state.ui && state.ui.trackedMissionId;
  const tracked = trackedId ? active.find((m) => missionId(m) === trackedId) : null;
  if (tracked) {
    return {
      objective: 'TRACKED · ' + missionTitle(tracked) + ' · ' + missionProgress(tracked) + deadlineText(state, tracked),
      next: missionNextStep(tracked),
      save: saveLine(state),
    };
  }
  if (active.length) {
    const candidate = active[0];
    return {
      objective: 'UNTRACKED CONTRACT · ' + missionTitle(candidate) + ' · ' + missionProgress(candidate) + deadlineText(state, candidate),
      next: 'Next: open Mission Log (' + BINDINGS.missionLog.label + '), Track Nav on a contract, then resume with a clear marker.',
      save: saveLine(state),
    };
  }
  const wp = state && state.nav && state.nav.waypoint;
  if (wp) {
    const mapAction = pauseMapAction(state);
    return {
      objective: ((mapAction && mapAction.objectiveLabel) || 'NAV SET') + ' · ' + waypointText(wp),
      next: 'Next: ' + routeNextText(mapAction),
      save: saveLine(state),
    };
  }
  return {
    objective: 'NO ACTIVE CONTRACT',
    next: 'Next: dock at a station, open Missions or the Bar, accept + track work, then undock.',
    save: saveLine(state),
  };
}

export function pauseExitConfirmBody(state, target = 'menu') {
  const lines = pauseStatusLines(state);
  const opening = target === 'load'
    ? 'Opening Load lets you review slots; choosing one will replace the current session.'
    : 'Returning to main menu closes the current session.';
  const loss = target === 'load'
    ? 'If you complete a load, unsaved progress is lost.'
    : 'Unsaved progress will be lost.';
  return opening + ' Current objective: ' + lines.objective + '. ' + lines.next +
    ' Save status: ' + lines.save + ' ' + loss;
}

let els = null;

function renderFlightBrief(ctx) {
  if (!els || !els.briefObjective) return;
  const lines = pauseStatusLines(ctx && ctx.state);
  els.briefObjective.textContent = lines.objective;
  els.briefNext.textContent = lines.next;
  els.briefSave.textContent = lines.save;
}

/* ---------- photo mode (Task B §1.7, sheet moment 12) ---------- */

let photo = null;

function photoHintText() {
  // No photo/pause binding is registered in bindings.js; Esc is the modal-close key uiInput owns.
  return 'Esc to return';
}

/** Enter photo mode: the pause root goes invisible, body.k-photo hides the HUD (kit.css), one fine
 *  hint fades out after two seconds. The screen stack — and so the sim pause — is untouched. */
function enterPhoto(rootEl, ctx) {
  if (photo) return;
  const hint = el('p', 'k-fine sf-photo-hint', photoHintText());
  hint.setAttribute('role', 'status');
  // Inside #screens (z-index 100, the pause root's parent) so the hint paints over the world canvas;
  // a body child at z-auto would sit under it.
  (rootEl.parentElement || document.body).appendChild(hint);
  settle(hint, { from: 'bottom', state: 'photo-hint' });
  const onKey = (ev) => {
    if (ev.key !== 'Escape') return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    exitPhoto(rootEl, ctx);
  };
  // Capture phase on window: runs ahead of uiInput's document-level handler, which would otherwise
  // pop the pause screen (and unpause the sim) on the same Esc.
  window.addEventListener('keydown', onKey, true);
  const fade = setTimeout(() => { if (photo && photo.hint === hint) hint.classList.add('k-out'); }, PHOTO_HINT_MS);
  document.body.classList.add('k-photo');
  rootEl.style.visibility = 'hidden';
  rootEl.setAttribute('aria-hidden', 'true');
  photo = { hint, onKey, fade, rootEl };
  cue('open');
}

function exitPhoto(rootEl, ctx) {
  if (!photo) return;
  clearTimeout(photo.fade);
  window.removeEventListener('keydown', photo.onKey, true);
  if (photo.hint && photo.hint.parentNode) photo.hint.parentNode.removeChild(photo.hint);
  document.body.classList.remove('k-photo');
  const root = photo.rootEl || rootEl;
  root.style.removeProperty('visibility');
  root.removeAttribute('aria-hidden');
  photo = null;
  cue('close');
  if (els && els.bResume) try { els.bResume.focus(); } catch (e) {}
  renderFlightBrief(ctx);
}

export const pauseScreen = {
  id: 'pause',

  mount(rootEl, ctx) {
    rootEl.innerHTML = '';
    rootEl.classList.remove('panel', 'sf-menu', 'sf-menu-narrow');
    rootEl.classList.add('k-screen', 'k-screen--stage');
    delete rootEl.dataset.stamp;

    const { title, briefObjective, briefNext, briefSave } = createPauseFrame(rootEl, {
      titleText: coreText('paused'), briefLabel: coreText('flightBrief'),
    });

    // .k-stage — the actions as one column of words. `mk` keeps the legacy shape the checks read
    // (label, handler) and appends a kit word to the column; `words()` is built once at the end.
    const stage = el('section', 'k-stage');
    const items = [];
    const handlers = new Map();
    const mk = (label, fn, opts = {}) => {
      const action = 'pause-' + items.length;
      items.push({ label, action, primary: !!opts.primary, danger: !!opts.danger });
      handlers.set(action, { fn, dev: !!opts.dev });
      return action;
    };
    const resumeAction = mk(coreText('resume'), () => this._resume(ctx), { primary: true });
    mk(coreText('settings'), () => nav(ctx, 'pushScreen', 'settings'));
    mk(coreText('save'), () => nav(ctx, 'pushScreen', 'saveLoad'));
    // Load discards unsaved current progress after a slot is chosen — confirm with the live run context first.
    mk(coreText('load'), async () => {
      const ok = await confirm({
        title: 'Open load screen?',
        body: pauseExitConfirmBody(ctx && ctx.state, 'load'),
        confirmLabel: 'Open Load', danger: true,
      });
      if (ok) nav(ctx, 'pushScreen', 'saveLoad');
    });
    mk(coreText('missionLog', { key: BINDINGS.missionLog.label }), () => nav(ctx, 'pushScreen', 'missionLog'));
    // THE SHIP (F2 in flight; SCREENS_B §1.2 route wiring). From pause the same instrument opens
    // with its pause-menu entry; the key case lives in the flight-only key router.
    mk('My Ship', () => nav(ctx, 'pushScreen', 'ship'));
    // Operations = the Automation ops board (drones / traders / outposts / fleet). Reachable from
    // pause anywhere in flight — fleet orders are a flight-time action ("recall to cash out"), so
    // the pause route fits better than a docked-only station tab (GDD 2.0 §12 keeps automation at
    // UI-polish scope this cycle; a first-class station tab would be promotion).
    mk(coreText('operations'), () => nav(ctx, 'pushScreen', 'automation'));
    const mapAction = pauseMapAction(ctx && ctx.state);
    if (mapAction) mk('Review ' + mapAction.label, () => openPauseMapReview(ctx, mapAction));
    mk(coreText('helpControls'), () => nav(ctx, 'pushScreen', 'help'));
    mk(coreText('codex'), () => nav(ctx, 'pushScreen', 'codex'));
    // Photo mode (Task B §1.7): everything gone but the world; Esc returns here.
    mk('Photo', () => enterPhoto(rootEl, ctx));
    // DEV ONLY — Sandbox testing harness (grant weapon now, spawn enemy now, etc.). IS_DEV-gated so
    // it never appears in packaged builds. Same screen as the main-menu Sandbox button.
    if (IS_DEV) mk('Sandbox', () => nav(ctx, 'pushScreen', 'sandbox'), { dev: true });
    // Main Menu discards the current session entirely — confirm with the live run context first.
    mk(coreText('mainMenu'), async () => {
      const ok = await confirm({
        title: 'Return to main menu?',
        body: pauseExitConfirmBody(ctx && ctx.state, 'menu'),
        confirmLabel: 'Main Menu', danger: true,
      });
      if (ok) this._toMenu(ctx);
    }, { danger: true });

    mk(coreText('quitGame'), async () => {
      const lines = pauseStatusLines(ctx && ctx.state);
      const ok = await confirm({
        title: 'Quit game?',
        body: 'Quitting closes the game. ' + lines.save + ' ' + lines.next + ' Unsaved progress will be lost.',
        confirmLabel: coreText('quitGame'), danger: true,
      });
      if (ok) requestQuit(ctx);
    }, { danger: true });

    // Recorded choice: the task table says menu size, but thirteen menu-size words under the title
    // and the three-line brief run past a 1080-tall frame (Main menu and Quit fell below the fold in
    // the 1920x1080 capture). Emph is the next size down on the words scale; every word stays in
    // frame at every width.
    const list = words(items, {
      size: 'emph',
      ariaLabel: 'Pause',
      onPick: (action) => { const h = handlers.get(action); if (h) h.fn(); },
    });
    for (const [action, h] of handlers) {
      if (h.dev) list.querySelector(`[data-action="${action}"]`)?.classList.add('k-38');
    }
    stage.appendChild(list);
    rootEl.appendChild(stage);

    // .k-fine — the resume key. check-ui-screen-imports allows the literal on this screen.
    rootEl.appendChild(el('p', 'k-fine', 'Esc resumes'));

    const bResume = list.querySelector(`[data-action="${resumeAction}"]`);
    els = { bResume, title, stage, briefObjective, briefNext, briefSave };
    renderFlightBrief(ctx);
  },

  _resume(ctx) {
    if (ctx.state.mode === 'paused') ctx.state.mode = 'flight';
    nav(ctx, 'popScreen');
  },

  _toMenu(ctx) {
    if (ctx && ctx.bus && typeof ctx.bus.emit === 'function') {
      ctx.bus.emit('game:exitToMenu', { source: 'pause' });
    } else {
      ctx.state.mode = 'menu';
    }
    const mgr = getManager(ctx);
    if (mgr) {
      if (mgr.closeAll) mgr.closeAll();
      if (mgr.replaceScreen) mgr.replaceScreen('mainMenu');
      else if (mgr.pushScreen) mgr.pushScreen('mainMenu');
    } else {
      nav(ctx, 'replaceScreen', 'mainMenu');
    }
  },

  onShow(ctx) {
    if (ctx.state.mode === 'flight') ctx.state.mode = 'paused';
    renderFlightBrief(ctx);
    if (els) {
      if (els.title) settle(els.title, { from: 'left', state: 'pause-title' });
      if (els.stage) settle(els.stage, { from: 'left', delay: 60, state: 'pause-words' });
      if (els.bResume) try { els.bResume.focus(); } catch (e) {}
    }
    // The world behind the pause is the live flight picture, not a mount of its own: the frame is
    // ready as soon as the words are (KIT_SPEC §11.7 capture contract).
    if (els && els.title && els.title.parentElement) els.title.parentElement.dataset.kReady = '1';
    cue('open');
  },

  onHide(ctx) {
    // Leaving the stack while in photo mode (a bus-driven exit) must not strand body.k-photo.
    if (photo) exitPhoto(photo.rootEl, ctx);
    cue('close');
  },
  refresh(ctx) { renderFlightBrief(ctx); },
};
