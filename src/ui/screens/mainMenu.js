// Main Menu / title screen (ARCHITECTURE §1.3 step 6, §5; design/specs/09).
// Field Hardware POSTER: uiStage `title-field` (Hitch on the dusk pad) plus produced kit
// hardware — logotype, legend rail, selected-row plate, status strip, build light.
// This file owns no CSS. Continue is enabled iff a save exists, shows the exact latest slot
// metadata, and loads that displayed slot so players trust resume before committing to a load.
import { createTitleFrame } from '../views/menuFrames.js';
import { injectDeckplate } from '../deckplate/index.js';
import { CREDITS } from '../../data/credits.js';
import { NEW_GAME } from '../../data/newGameDefaults.js';
import { shipDisplayName } from '../../data/ships.js';
import { requestCodexTab } from '../codexRequests.js';
import { coreText } from '../localizedCoreCopy.js';
import { canQuit, requestQuit } from '../quitGame.js';
import { IS_DEV } from '../../core/devMode.js';
import { el, words, settle, stamp, reducedMotion, cue } from '../kit/index.js';
import { isSaveSlotId, selectLatestOccupiedSlot } from '../../save/saveSlotIdentity.js';
import { isTitleSaveReadFailure, saveErrorText } from '../saveFeedback.js';
import { injectOrreryScreens } from '../orrery/screenLayouts.js';
import { isPhoneLayout } from '../../systems/mobile/model.js';
import { injectTitleDoorsLayouts } from '../orrery/titleDoorsLayouts.js';
import { shouldOfferFirstLight, applyFirstLightPreset } from '../accessibility.js';
import { laneWriteSetting } from '../../core/simLaneCommands.js';
import { confirm, dismissConfirm, isConfirmOpen } from '../confirm.js';
import {
  applyLeftoverVersionText,
  leftoverBuildToken,
  leftoverVersionDisplay,
  leftoverVersionLabel,
  leftoverVersionToken,
  loadLeftoverVersionPayload,
  paintLeftoverVersion,
  resetLeftoverVersionCache,
} from '../releaseIdentity.js';

export {
  applyLeftoverVersionText,
  leftoverBuildToken,
  leftoverVersionDisplay,
  leftoverVersionLabel,
  leftoverVersionToken,
  loadLeftoverVersionPayload,
  paintLeftoverVersion,
  resetLeftoverVersionCache,
} from '../releaseIdentity.js';

const LS_PREFIX = 'sf.save.';

// ---------------------------------------------------------------------------------------------------
// Row 473 — the first-light offer.
//
// The title is the one screen every player sees before they know the game has settings at all, so it
// is the honest place to ask once whether they would like the calmer, larger, captioned cut. It rides
// the SHARED confirmation surface (ORRERY: no bespoke dialog, no new stylesheet) and it is offered,
// never applied: `firstLightOffered` records the question, `firstLightChoice` records the answer.
// ---------------------------------------------------------------------------------------------------
export const FIRST_LIGHT_OFFER = Object.freeze({
  title: 'Comfort preset',
  // Play is the primary verb — the calm cut is the offer beside it, never the gate on playing.
  body: 'Play as-is, or start with calmer motion, reduced flashing, high contrast, larger text and backed captions. Settings > Access has them any time.',
  confirmLabel: 'Play',
  cancelLabel: 'Turn on comfort preset',
  cancelValue: 'calm',
  dismissValue: 'play',
  danger: false,
});

/** The accessibility subtree, created on demand (a settings tree without one still gets offered). */
function accessibilityOf(settings) {
  if (!settings || typeof settings !== 'object') return {};
  if (!settings.accessibility || typeof settings.accessibility !== 'object') settings.accessibility = {};
  return settings.accessibility;
}

/** True when the loading shell still owns the screen. "Fully hidden" means display:none — the
 *  `hidden` class is added at fade start, while the shell is still the only thing visible. */
function bootOverlayBlocksMenu() {
  if (typeof document === 'undefined' || !document || typeof document.getElementById !== 'function') return false;
  const overlay = document.getElementById('boot-overlay');
  if (!overlay) return false;
  return !overlay.style || overlay.style.display !== 'none';
}

/** The manager keeps exactly one screen on top; anything else means this menu is not current. */
function menuIsCurrent(ctx) {
  const mgr = getManager(ctx);
  if (!mgr || typeof mgr.top !== 'function') return true;
  return mgr.top() === 'mainMenu';
}

function rootElement() {
  if (typeof document === 'undefined' || !document) return null;
  return document.documentElement || null;
}

/** Worker-lane parity: the accessibility subtree is copied wholesale, exactly like the motion ask. */
function mirrorAccessibility(ctx, settings) {
  const state = ctx && ctx.state;
  if (!state || !settings || !settings.accessibility) return;
  laneWriteSetting(state, 'settings.accessibility', { ...settings.accessibility });
}

function publishAccessibilityChange(ctx, key, value) {
  const bus = ctx && ctx.bus;
  if (!bus || typeof bus.emit !== 'function') return;
  bus.emit('settings:changed', { section: 'accessibility', key, value });
}

/** Show or hide Continue's row on the dial, and re-seat the dial when it changes. */
function bContinueRow(r, show) {
  const li = r && r.bContinue && r.bContinue.closest ? r.bContinue.closest('li') : null;
  if (!li || li.hidden === !show) return;
  li.hidden = !show;
  if (arcRail) arcRail.layout();
}
/** The attention lamp's listeners, released when the screen unmounts. */
let detachLamp = null;
/** ORRERY: the verbs ride the rim of the emblem's dial (design/frontend/ORRERY.md §6 Title). */
let arcRail = null;
// The dial's face is drawn in its own line language (arcRail drawFace); the raster emblem is the
// loading ring's (bootRing.js).
// spec2/03 §3: the still begins its slow drift after this much idle time. Input re-arms the window.
const ATTRACT_IDLE_MS = 6_000;

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
  setDisabled(button, !ready, ready ? '' : label + ' is still loading');
}
function pushWhenReady(ctx, id, label) {
  if (!screenReady(ctx, id)) {
    if (ctx && ctx.bus && ctx.bus.emit) {
      ctx.bus.emit('toast', { text: label + ' is still loading — try again in a moment', kind: 'info', ttl: 2200 });
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
    // Index cards only: the menu's per-render read must never touch blob bytes. The save
    // system republishes the validated merged index under 'save:slotsValidated' (re-render
    // below) — a stale card in that window costs the same click-time revalidation Continue
    // always does.
    if (typeof sys.listSlotsIndexCards === 'function') { try { return normalizeSlots(sys.listSlotsIndexCards()); } catch (e) {} }
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
        if (!isSaveSlotId(slot)) continue;
        try {
          const env = JSON.parse(localStorage.getItem(k));
          if (!env || (env.fmt !== 'spaceface-save' && env.fmt !== 'spaceface-save-gz')) continue;
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
    for (const item of idx) {
      if (!item || item.slot == null) continue;
      const slot = String(item.slot);
      if (isSaveSlotId(slot)) out[slot] = Object.assign({ slot }, item);
    }
    return out;
  }
  for (const slot in idx) if (isSaveSlotId(slot) && idx[slot]) out[slot] = Object.assign({ slot }, idx[slot]);
  return out;
}

export function presentTitleContinueLoadFailure(target, payload) {
  if (!target || !isTitleSaveReadFailure(payload)) return false;
  target.setAttribute('role', 'alert');
  target.setAttribute('aria-live', 'assertive');
  target.setAttribute('aria-atomic', 'true');
  target.textContent = saveErrorText(payload);
  return true;
}

export function clearTitleContinueLoadFailure(target) {
  if (!target) return;
  target.removeAttribute('role');
  target.removeAttribute('aria-live');
  target.removeAttribute('aria-atomic');
}

/**
 * Clear the title-owned Continue failure presentation when the player retries or leaves the
 * title. The save event stream also contains routine write/index updates, so this state must not
 * be inferred from whichever text a normal render most recently wrote.
 */
export function clearTitleContinueLoadFailureState(currentRefs) {
  if (!currentRefs) return;
  currentRefs.titleContinueFailure = null;
  clearTitleContinueLoadFailure(currentRefs.saveSummary);
  clearTitleContinueLoadFailure(currentRefs.status);
}

/** Reapply a classified Continue failure after a routine title render rewrites its copy. */
export function reapplyTitleContinueLoadFailure(currentRefs) {
  const payload = currentRefs && currentRefs.titleContinueFailure;
  if (!payload) return false;
  const target = currentRefs.status || currentRefs.saveSummary;
  return presentTitleContinueLoadFailure(target, payload);
}

export function handleTitleContinueLoadFailure(ctx, currentRefs, payload) {
  const mgr = getManager(ctx);
  if (mgr && typeof mgr.top === 'function' && mgr.top() !== 'mainMenu') return false;
  // The Continue note is intentionally clipped by the desktop arc rail. The title eyebrow is the
  // existing visible ORRERY status line, so a failed Continue stays in the title composition rather
  // than disappearing into an accessibility-only note or relying on a transient global toast.
  const target = currentRefs && (currentRefs.status || currentRefs.saveSummary);
  const presented = presentTitleContinueLoadFailure(target, payload);
  if (presented && currentRefs) currentRefs.titleContinueFailure = { ...payload };
  return presented;
}

function latestSave(slots) {
  const slot = selectLatestOccupiedSlot(slots);
  if (!slot || !slots || !slots[slot]) return null;
  return { slot, meta: slots[slot] };
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
  if (meta && meta.shipName) parts.push(shipDisplayName(meta.shipName));
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

/** The door that holds focus on arrival: Continue when a save exists, else the Swarm door — the
 *  fastest way into the fight for a stranger (one press to round 1). */
export function titlePrimaryAction(hasSave) {
  return hasSave ? 'continue' : 'swarm';
}

/**
 * TITLE-02 — the title is two doors, the two ways to play, and nothing that reads as unfinished
 * (design/overhaul/08_INTERFACE.md §2, ledger A3/A11/A12). Each door says what it is in one line;
 * the button's accessible name stays the core copy (Swarm / New Game / Continue) so every route,
 * probe and screen reader that looks for those words still finds them.
 */
export const TITLE_DOORS = Object.freeze({
  swarm: Object.freeze({ kicker: 'Arcade runs', name: 'Swarm', line: 'Survive the horde in Madame Kiln’s Foundry', go: 'Play' }),
  adventure: Object.freeze({ kicker: 'Open world', name: 'Adventure', line: 'Start as hired labour in the Helios harbour', go: 'New game', goSaved: 'Continue' }),
});

/** The one line under the name. */
export const TITLE_STRAPLINE = 'A space brawler where everything has mass.';

/** The lab verbs: practice and test surfaces that are not finished player modes. Reachable from the
 *  title only behind the dev switch (titleLabOpen); their screens and systems are unchanged. */
export const TITLE_LAB_ACTIONS = Object.freeze(['swarmSetup', 'archive', 'circuits', 'sandbox', 'physics']);

/** The dev switch for the lab verbs: a dev build AND an explicit ask (`?titleLab=1`, or
 *  localStorage `sf.titleLab` = '1'). A player build never shows them. */
export function titleLabOpen(host = globalThis) {
  if (!IS_DEV) return false;
  try {
    if (/[?&]titleLab=1(?:&|$)/.test(String(host.location?.search || ''))) return true;
  } catch (_) { /* no location */ }
  try { return host.localStorage?.getItem('sf.titleLab') === '1'; } catch (_) { return false; }
}

/** The Continue door's own line: the ship, the place, the time played — never the slot, the clock
 *  or the bank balance (those stay on the Load screen). */
function continueDoorLine(meta) {
  if (!meta) return '';
  const parts = [];
  if (meta.shipName) parts.push(shipDisplayName(meta.shipName));
  if (meta.sectorName) parts.push(meta.sectorName);
  const playtime = fmtPlaytime(meta.playtimeS);
  if (playtime) parts.push(playtime);
  return parts.join(' · ') || 'Pick up where you left off';
}

/** The nearest usable title control in an arrow's direction (the doors are a grid, not a column). */
function titleSpatialTarget(items, active, key) {
  if (!active || typeof active.getBoundingClientRect !== 'function') return null;
  const o = active.getBoundingClientRect();
  const ox = o.left + o.width / 2; const oy = o.top + o.height / 2;
  const horizontal = key === 'ArrowLeft' || key === 'ArrowRight';
  const sign = key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 1;
  let best = null; let bestScore = Infinity;
  for (const c of items) {
    if (c === active) continue;
    const r = c.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) continue;
    const dx = r.left + r.width / 2 - ox; const dy = r.top + r.height / 2 - oy;
    const primary = (horizontal ? dx : dy) * sign;
    if (primary <= 1) continue;
    const score = primary + Math.abs(horizontal ? dy : dx) * 2.35;
    if (score < bestScore) { best = c; bestScore = score; }
  }
  return best;
}

/** The verbs' reading order. */
/**
 * SEED-ST-01 — the mode verbs say what they open. A sighted stranger never sees an aria-label,
 * so each non-primary verb carries the same gloss as a visible sub line. The wording is the
 * aria copy where one existed; Crucible and Archive had none and say what the code comment
 * already promised ("the scored ten-wave Survival run", "the authored intro cinematics").
 */
export const MENU_MODE_GLOSSES = Object.freeze({
  swarm: 'Straight into round 1. Level up, pick a build, survive.',
  crucible: 'A scored ten-wave survival run',
  archive: 'Authored intro reels, in the Codex',
  circuits: 'Race rivals or run time trials',
  sandbox: 'Free flight sandbox',
  physics: 'Orbital physics challenges',
});

/** TITLE-01: the Adventure door's line (the glosses above are the secondary verbs'). */
const ADVENTURE_DOOR_GLOSS = 'The campaign — your ship, the Helios Reach';

export function titleVerbOrder() {
  return ['swarm', 'continue', 'newGame', 'load', 'settings', 'help', 'quit'];
}

/** The title's Tab order, in reading order: the doors, the small row, the lab row (dev only), the fine
 *  line — every word on screen. A hidden Continue is not on screen, so it is not in the ladder. */
function titleTabLadder(r) {
  if (!r || !r.list) return [];
  const groups = [r.list, r.root && r.root.querySelector('.of-title-aside')].filter(Boolean);
  const out = [];
  for (const g of groups) for (const b of g.querySelectorAll('button[data-action]')) out.push(b);
  out.push(r.bCredits, r.bAchievements);
  return out.filter((b) => b && typeof b.getClientRects === 'function' && b.getClientRects().length > 0);
}
/** A Tab stop is a word that can act: a still-loading verb is passed over, the same rule the arrow
 *  keys' roving follows. */
function titleVerbUsable(b) {
  return !!b && !b.disabled && b.getAttribute('aria-disabled') !== 'true';
}

export const mainMenuScreen = {
  id: 'mainMenu',

  // P20/P22: the approved "Field at dusk" shot as a live presentation scene on the main renderer
  // (src/render/uiStage.js). Simulation stays frozen; the plate is the assemble / no-WebGL fallback.
  //
  // LIVE TITLE (build_map.md §25 Phase 5.2): once the screen has been visibly up and idle
  // for ATTRACT_IDLE_MS, `_attractLive` swaps the request to the `title-attract` scene —
  // the deterministic Crucible replay tape plays behind the menu instead of the still.
  // The manager re-resolves this function on every stack sync, so the flag plus a
  // syncVisibility() nudge is the whole swap; anything that fails upstream keeps the
  // authored plate, which is the same still the screen started on.
  stage(ctx) {
    return {
      scene: this._attractLive === true ? 'title-attract' : 'title-field',
      hullDefId: NEW_GAME.shipId,
    };
  },

  mount(rootEl, ctx) {
    injectDeckplate();   // the title can mount before the HUD that otherwise injects the system
    rootEl.innerHTML = '';
    // No `k-screen`: the frame IS the screen now (dp-frame--screen), and leaving the kit's grid
    // class on the root would put `#screens .of-title.k-screen` back in the cascade against it.
    rootEl.classList.add('screen');
    rootEl.dataset.screen = 'mainMenu';
    rootEl.dataset.kReady = '0';

    const { backdrop, title, stage, status } = createTitleFrame(rootEl);
    // The eyebrow's standing line (the localized contract line). The gloss writer below restores
    // exactly this when no verb is awake, and _render may replace it with the Continue summary.
    // TITLE-01: no tech words on the way in. The standing line is empty; a save's Continue summary and a
    // load failure still write here.
    status.textContent = '';
    this._statusDefault = status.textContent;
    // The pitch, once, under the name: what kind of game this is before a stranger picks a door.
    const logotype = title.querySelector('.dp-logotype');
    if (logotype && logotype.parentNode) {
      const strap = el('p', 'of-title-strap', TITLE_STRAPLINE);
      logotype.parentNode.insertBefore(strap, logotype.nextSibling);
    }

    // The words. Visible words follow the sheet; the accessible names keep the game's core copy
    // (coreText) so every route that finds "New Game" / "Continue" / "Quit Game" still does.
    // THE COLUMN IS FIVE VERBS, and one of them is the reason a stranger opened the game. Until
    // 2026-09-22 it was eight words at identical weight, so NEW GAME weighed exactly as much as
    // SANDBOX and the screen had made no decision. Everything that is a REFERENCE rather than a way
    // into the game moved to the footer line with Credits and Achievements; what is left is play,
    // resume, the other mode, the settings, and the way out.
    //
    // `primary` is resolved after the save scan (_applySave): Continue when there is something to
    // continue, New Game when there is not. Marking it here would light a dead verb on first paint.
    // titleVerbOrder owns the reading order.
    const labels = {
      newGame: coreText('newGame'),
      continue: coreText('continue'),
      load: 'Load',
      swarm: 'Swarm',
      settings: coreText('settings'),
      help: 'Help',
      quit: 'Quit',
    };
    const items = titleVerbOrder().map((action) => ({
      action,
      label: labels[action],
      containedNote: ['continue', 'newGame', 'swarm'].includes(action),
      ...(action === 'continue' ? { sub: 'Checking saves...', current: true } : {}),
      ...(MENU_MODE_GLOSSES[action] ? { sub: MENU_MODE_GLOSSES[action] } : {}),
      ...(action === 'newGame' ? { sub: ADVENTURE_DOOR_GLOSS } : {}),
      ...(action === 'quit' ? { danger: true } : {}),
    }));
    // The lab row: practice and test surfaces, not finished player modes. Built so the code that
    // reaches them keeps its hooks, but every one of them stays hidden unless the dev switch is on
    // (titleLabOpen). "Archive" opens the Codex on its Archive tab (the authored intro reels).
    const asideItems = [
      { action: 'swarmSetup', label: 'Customize Swarm', sub: MENU_MODE_GLOSSES.crucible },
      { action: 'archive', label: 'Archive', sub: MENU_MODE_GLOSSES.archive },
      { action: 'circuits', label: 'Circuits', sub: MENU_MODE_GLOSSES.circuits },
      { action: 'sandbox', label: 'Sandbox', sub: MENU_MODE_GLOSSES.sandbox },
      { action: 'physics', label: 'Physics challenges', sub: MENU_MODE_GLOSSES.physics },
    ];

    // The decorative legend rail is gone (2026-09-22). It was a 64x787 nine-slice plate whose only
    // job was to stand beside the verbs; the bench measured it as painted and empty, and in the
    // picture it read as a black bar somebody forgot to fill. Every menu item now carries its own
    // lamp rail, which is the same piece of hardware doing the same job while also saying which
    // verb is awake. An ornament became an instrument. design/frontend/THE_BAR.md §3.
    // The POSTER variant: there is no hardware in front of a player looking at a title screen, so
    // a verb is a word of light rather than a machined plate with a lamp rail. Weight 0.05.
    const list = words(items, {
      ariaLabel: 'Title menu',
      system: 'light',
      onPick: (action) => this._pick(ctx, action),
    });
    // Focus is a light source, not a ring: the focused word lights its neighbours and the rest of
    // the column recedes. This replaces the gold rectangle that read as a browser focus ring.
    stage.appendChild(list);

    // The lab row (dev switch only) sits under the small row in the same quiet substance.
    const aside = words(asideItems, {
      ariaLabel: 'Practice and test modes',
      system: 'light',
      row: true,
      onPick: (action) => this._pick(ctx, action),
    });
    aside.classList.add('of-title-aside');
    const labOpen = titleLabOpen();
    aside.hidden = !labOpen;
    for (const li of aside.children) li.hidden = !labOpen;
    stage.appendChild(aside);
    injectOrreryScreens();
    injectTitleDoorsLayouts();
    // TITLE-02: one composition at every size — two doors, a small row, the fine line. The dial is
    // retired from the title (ledger A11): the doors never sit on the ORRERY rings because there are
    // none here, and the hero scene keeps the right of the frame.
    if (arcRail) { arcRail.dispose(); arcRail = null; }
    const phone = isPhoneLayout();
    rootEl.classList.add(phone ? 'orr-title--phone' : 'orr-title', 'orr-title--doors');
    const quitShown = canQuit();

    const byAction = (action) => stage.querySelector('[data-action="' + action + '"]');
    const bContinue = byAction('continue');
    const bNew = byAction('newGame');
    const bSwarm = byAction('swarm');
    const bSwarmSetup = byAction('swarmSetup');
    const bLoad = byAction('load');
    const bArchive = byAction('archive');
    const bHelp = byAction('help');
    const bCircuits = byAction('circuits');
    const bPhysics = byAction('physics');
    const bSettings = byAction('settings');
    const bSandbox = byAction('sandbox');
    const bQuit = byAction('quit');
    if (bNew) bNew.setAttribute('aria-label', coreText('newGame'));
    if (bContinue) bContinue.setAttribute('aria-label', coreText('continue'));
    if (bSwarm) bSwarm.setAttribute('aria-label', 'Swarm — start round 1');
    if (bSwarmSetup) bSwarmSetup.setAttribute('aria-label', 'Customize the Swarm run: ship, room, difficulty');
    if (bLoad) bLoad.setAttribute('aria-label', coreText('loadGame'));
    if (bArchive) bArchive.setAttribute('aria-label', coreText('signalArchive'));
    if (bQuit) bQuit.setAttribute('aria-label', coreText('quitGame'));
    if (bHelp) bHelp.setAttribute('aria-label', 'Help and controls');
    if (bSandbox) bSandbox.setAttribute('aria-label', 'Free flight sandbox');
    if (bPhysics) bPhysics.setAttribute('aria-label', 'Orbital physics challenges');

    // Web build: no shell to quit, so no Quit verb (it stays in the DOM, hidden like an empty
    // Continue, so the hooks and the verb order are unchanged).
    if (!quitShown && bQuit && bQuit.closest('li')) bQuit.closest('li').hidden = true;

    // The doors: each button IS the card — picture, kicker, name, one line, and the verb it takes.
    // The kit's note stays inside as the door's line (Continue's carries the save summary hooks).
    const dressDoor = (button, door, go, art) => {
      if (!button) return null;
      const note = button.querySelector('.dp-lit__note, .dp-menu__note') || el('span', 'dp-lit__note', '');
      note.classList.add('of-door__line');
      button.textContent = '';
      button.classList.add('of-door');
      button.dataset.door = art;
      const pic = el('span', 'of-door__art');
      pic.setAttribute('aria-hidden', 'true');
      const kicker = el('span', 'of-door__kicker', door.kicker);
      kicker.setAttribute('aria-hidden', 'true');
      const name = el('span', 'of-door__name', door.name);
      name.setAttribute('aria-hidden', 'true');
      const verb = el('span', 'of-door__go', go);
      verb.setAttribute('aria-hidden', 'true');
      // In the small row (New Game when a save owns the door) the button reads as its plain word.
      const plain = el('span', 'of-door__plain', button.getAttribute('aria-label') || '');
      plain.setAttribute('aria-hidden', 'true');
      button.append(pic, kicker, name, note, verb, plain);
      return note;
    };
    dressDoor(bSwarm, TITLE_DOORS.swarm, TITLE_DOORS.swarm.go, 'swarm');
    if (bSwarm) bSwarm.querySelector('.of-door__line').textContent = TITLE_DOORS.swarm.line;
    dressDoor(bNew, TITLE_DOORS.adventure, TITLE_DOORS.adventure.go, 'adventure');
    if (bNew) bNew.querySelector('.of-door__line').textContent = TITLE_DOORS.adventure.line;
    // The save summary rides Continue's line. `.sf-menu-save-summary` / `has-save` are inert hooks
    // the boot and title-continue checks query.
    const saveSummary = dressDoor(bContinue, TITLE_DOORS.adventure, TITLE_DOORS.adventure.goSaved, 'adventure');
    saveSummary.classList.add('sf-menu-save-summary');
    // One lit thing at a time: the pointer moves focus, so a hovered door and a focused door can never
    // both be gold (the same rule the dial had).
    const onPointerWake = (ev) => {
      const b = ev.target && typeof ev.target.closest === 'function' ? ev.target.closest('button[data-action]') : null;
      if (!b || !stage.contains(b) || b === document.activeElement) return;
      if (!titleVerbUsable(b)) return;
      try { b.focus({ preventScroll: true }); } catch (_) { /* focus is best-effort */ }
    };
    stage.addEventListener('pointerover', onPointerWake);
    // The arrow keys and the D-pad walk the composition as it is laid out: Left/Right between the doors
    // and along the row, Up/Down between the doors and the row.
    const onArrow = (ev) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(ev.key) || ev.altKey || ev.ctrlKey || ev.metaKey) return;
      const usable = titleTabLadder(refs).filter(titleVerbUsable);
      const active = document.activeElement;
      if (!usable.includes(active)) return;
      ev.preventDefault();
      ev.stopPropagation();
      const next = titleSpatialTarget(usable, active, ev.key);
      if (!next) return;
      try { next.focus({ preventScroll: true }); } catch (_) { next.focus(); }
      cue('move');
    };
    stage.addEventListener('keydown', onArrow, true);

    // The fine line: "SpaceFace v0.0.0 · " then the Credits word (Task B §1.6). The version text
    // lives in its own span so _loadVersion can rewrite it without touching the word.
    const version = el('footer', 'dp-frame__foot dp-etch');
    version.dataset.role = 'version';
    // The two quiet words first (Credits · Achievements), then the build string set apart at the
    // far end: a version jammed against the links read as one run-on line ("BETA.1 · CREDITS").
    const bCredits = el('button', 'dp-menu__item dp-menu__item--fine', 'Credits');
    bCredits.type = 'button';
    bCredits.dataset.action = 'credits';
    bCredits.addEventListener('click', () => { cue('confirm'); this._pick(ctx, 'credits'); });
    version.appendChild(bCredits);
    // PQ-033.03: Achievements rides the same fine line as Credits — a quiet word, not a menu row.
    const dot = el('span', 'of-title-foot__dot', '·');
    dot.setAttribute('aria-hidden', 'true');
    version.appendChild(dot);
    const bAchievements = el('button', 'dp-menu__item dp-menu__item--fine', 'Achievements');
    bAchievements.type = 'button';
    bAchievements.dataset.action = 'achievements';
    bAchievements.addEventListener('click', () => { cue('confirm'); this._pick(ctx, 'achievements'); });
    version.appendChild(bAchievements);
    const build = el('span', 'of-title-build');
    // The build light: the produced `light.dot.good.on` render, the frame's own corner detail.
    // Decorative — the build string beside it is the information.
    const buildLight = el('span', 'dp-led');
    buildLight.dataset.colour = 'good';
    buildLight.setAttribute('aria-hidden', 'true');
    build.appendChild(buildLight);
    const versionText = el('span', '', leftoverVersionDisplay(CREDITS));
    // The full identity stays one hover away for a bug report, off the wall (section 4.15).
    versionText.title = leftoverVersionLabel(CREDITS);
    build.appendChild(versionText);
    version.appendChild(build);
    rootEl.appendChild(version);

    refs = {
      root: rootEl, backdrop, title, stage, aside, list, version, versionText, bCredits, bAchievements, saveSummary, status,
      bNew, bContinue, bSwarm, bSwarmSetup, bLoad, bSettings, bSandbox, bQuit, bArchive, bCircuits, bHelp, bPhysics,
      titleContinueFailure: null,
      buttons: [bContinue, bSwarm, bSwarmSetup, bNew, bLoad, bHelp, bArchive, bCircuits, bPhysics, bSettings, bSandbox, bQuit].filter(Boolean),
    };

    // Tab walks the screen the way it reads: down the verb ladder, along the reference line, then the
    // fine line (Credits, Achievements), and round again. Each words() group keeps its single roving
    // stop for the arrow keys; without this the reference line had no Tab stop at all and the first
    // Tab from the lit verb jumped straight to Credits in the footer.
    if (this._onTabKey) rootEl.removeEventListener('keydown', this._onTabKey);
    this._onTabKey = (ev) => {
      if (ev.key !== 'Tab' || ev.altKey || ev.ctrlKey || ev.metaKey || !refs) return;
      const ladder = titleTabLadder(refs);
      const at = ladder.indexOf(document.activeElement);
      if (at < 0) return;
      const step = ev.shiftKey ? -1 : 1;
      let next = null;
      for (let k = 1; k < ladder.length && !next; k += 1) {
        const b = ladder[(at + step * k + ladder.length * k) % ladder.length];
        if (titleVerbUsable(b)) next = b;
      }
      if (!next) return;
      ev.preventDefault();
      // the screen manager's focus trap (document) would otherwise see the moved focus and wrap it
      ev.stopPropagation();
      try { next.focus({ preventScroll: true }); } catch (_) { next.focus(); }
    };
    rootEl.addEventListener('keydown', this._onTabKey);

    // TITLE-02: every door says its own line on its face, so the eyebrow no longer narrates the
    // awake verb (on the dial it had to: the dial hid every sub line). The eyebrow is kept for one
    // thing only: a failed Continue, which must stay on screen in plain words.
    if (this._glossDetach) { this._glossDetach(); this._glossDetach = null; }
    this._glossAwake = null;

    // data-k-ready is owned by the screen manager once `stage` is declared: live, plate, or
    // unavailable. The still is already in the tree as `.k-world--plate`.

    // Continue follows the save store the moment it settles, not the next periodic refresh: the
    // shared-store sync and a completed save both re-read the index.
    this._offBus = [];
    if (ctx && ctx.bus && typeof ctx.bus.on === 'function') {
      for (const evt of ['save:store-synced', 'save:completed', 'save:slotsValidated']) {
        const off = ctx.bus.on(evt, () => { if (refs) this._render(ctx); });
        if (typeof off === 'function') this._offBus.push(off);
      }
      const offFailure = ctx.bus.on('save:error', (payload = {}) => {
        if (refs) handleTitleContinueLoadFailure(ctx, refs, payload);
      });
      if (typeof offFailure === 'function') this._offBus.push(offFailure);
      const offLoaded = ctx.bus.on('save:loaded', () => {
        if (!refs) return;
        clearTitleContinueLoadFailureState(refs);
        this._render(ctx);
      });
      if (typeof offLoaded === 'function') this._offBus.push(offLoaded);
      // Row 473: the boot shell hides a moment AFTER this title is already up, so the loading-hidden
      // receipt is the authoritative retry signal for that in-between window.
      const offLoadingHidden = this._bindLoadingHidden(ctx);
      if (typeof offLoadingHidden === 'function') this._offBus.push(offLoadingHidden);
    }

    this._render(ctx);
  },

  _pick(ctx, action) {
    // Any menu action ends the live title: the flag drops now and the stack change the
    // action triggers (push / load / quit) makes uiStage release the fight for real.
    this._attractLive = false;
    clearTitleContinueLoadFailureState(refs);
    // Keep flag and stage in lockstep even on actions that do not move the stack
    // (e.g. continue with no save) — arming uses the same manager nudge.
    const mgr = getManager(ctx);
    if (mgr && typeof mgr.syncVisibility === 'function') {
      try { mgr.syncVisibility(); } catch (e) { console.warn('[mainMenu] attract stage drop failed to request', e); }
    }
    switch (action) {
      case 'continue': {
        // A fresh click is the retry path: restore the ordinary save summary before loading again.
        this._render(ctx);
        const latest = this._latestSave !== undefined
          ? this._latestSave
          : latestSave(readSaveIndex(ctx));
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
      case 'newGame': {
        // TITLE-01: with a save on disk the door is Continue and New Game is its secondary key; starting over
        // asks first, so a fumbled press cannot walk a returning player away from their run.
        if (this._latestSave) {
          this._confirmFirstLight({
            title: 'Start a new game?',
            body: 'Your latest save stays on disk until you save over it. Continue picks it up instead.',
            confirmLabel: 'New Game',
            cancelLabel: 'Back',
          }).then((ok) => { if (ok) pushWhenReady(ctx, 'newGame', 'New Game'); });
          return;
        }
        pushWhenReady(ctx, 'newGame', 'New Game');
        return;
      }
      case 'load': pushWhenReady(ctx, 'saveLoad', 'Load Game'); return;
      case 'swarm': this._launchSwarm(ctx); return;
      case 'swarmSetup':
      case 'crucible': pushWhenReady(ctx, 'crucible', 'Swarm'); return;
      case 'help': pushWhenReady(ctx, 'help', 'Help'); return;
      case 'archive': requestCodexTab('Archive'); pushWhenReady(ctx, 'codex', 'Signal Archive'); return;
      case 'circuits': pushWhenReady(ctx, 'raceBoard', 'Circuits'); return;
      case 'physics': pushWhenReady(ctx, 'physicsVenues', 'Physics challenges'); return;
      case 'settings': pushWhenReady(ctx, 'settings', 'Settings'); return;
      case 'credits': pushWhenReady(ctx, 'credits', 'Credits'); return;
      case 'achievements': pushWhenReady(ctx, 'achievements', 'Achievements'); return;
      case 'sandbox': pushWhenReady(ctx, 'sandbox', 'Sandbox'); return;
      case 'quit': requestQuit(ctx); return;
      default: return;
    }
  },

  /**
   * ONE PRESS TO THE FIGHT: the Swarm door starts round 1 with the remembered defaults
   * (crucibleLaunch.requestSwarmQuickStart). The setup screen is the "Customize Swarm" key.
   * A second press while the launch is on its way does nothing.
   */
  _launchSwarm(ctx) {
    if (!screenReady(ctx, 'crucible')) { pushWhenReady(ctx, 'crucible', 'Swarm'); return; }
    if (this._swarmLaunching) return;
    this._swarmLaunching = true;
    import('../crucibleLaunch.js').then((launch) => {
      if (!launch.requestSwarmQuickStart(ctx.bus)) {
        this._swarmLaunching = false;
        pushWhenReady(ctx, 'crucible', 'Swarm');
      }
    }).catch(() => {
      this._swarmLaunching = false;
      pushWhenReady(ctx, 'crucible', 'Swarm');
    });
  },

  // Cheap signature of everything the render reads that can change while the menu sits on top.
  // The save index itself is event-driven ('save:store-synced'/'save:completed' re-render), so
  // the periodic refresh only needs to re-run when one of these flips.
  _menuInputs(ctx) {
    const sys = ctx.registry && ctx.registry.get && ctx.registry.get('save');
    const syncPending = !!(sys && typeof sys.isSharedStoreSyncPending === 'function' && sys.isSharedStoreSyncPending());
    return [
      syncPending ? '1' : '0',
      screenReady(ctx, 'newGame') ? '1' : '0',
      screenReady(ctx, 'saveLoad') ? '1' : '0',
      screenReady(ctx, 'settings') ? '1' : '0',
      screenReady(ctx, 'help') ? '1' : '0',
      screenReady(ctx, 'sandbox') ? '1' : '0',
      screenReady(ctx, 'raceBoard') ? '1' : '0',
      screenReady(ctx, 'physicsVenues') ? '1' : '0',
      screenReady(ctx, 'crucible') ? '1' : '0',
    ].join('');
  },

  // TITLE-01: the doors and the small row. The Adventure door is New Game for a new player and Continue when a
  // save exists; then New Game stands on the door as its secondary key (never behind More). The small row
  // (Settings, Help, Quit) is centred under the doors by how many of its words show.
  _layoutTitleRow() {
    if (!refs || !refs.stage) return;
    const stage = refs.stage;
    const liOf = (a) => {
      const b = stage.querySelector('[data-action="' + a + '"]');
      return b && b.closest ? b.closest('li') : null;
    };
    const hasSave = !!this._latestSave;
    stage.classList.toggle('has-save', hasSave);
    const cont = liOf('continue'); const ng = liOf('newGame'); const sw = liOf('swarm');
    for (const li of [cont, ng, sw]) if (li) li.classList.remove('of-title-door', 'is-adventure', 'is-swarm', 'of-title-row-item');
    if (sw) sw.classList.add('of-title-door', 'is-swarm');
    // The Adventure door is Continue when a save exists, else New Game. With a save, New Game steps
    // down into the small row as its plain word (starting over asks first, see _pick).
    const adventure = hasSave ? cont : ng;
    if (adventure) adventure.classList.add('of-title-door', 'is-adventure');
    if (hasSave && ng) ng.classList.add('of-title-row-item');
  },

  _render(ctx) {
    if (!refs) return;
    clearTitleContinueLoadFailure(refs.saveSummary);
    clearTitleContinueLoadFailure(refs.status);
    this._menuSig = this._menuInputs(ctx);
    setScreenButtonReady(refs.bNew, ctx, 'newGame', 'New Game');
    setScreenButtonReady(refs.bSwarm, ctx, 'crucible', 'Swarm');
    setScreenButtonReady(refs.bSwarmSetup, ctx, 'crucible', 'Swarm');
    setScreenButtonReady(refs.bLoad, ctx, 'saveLoad', 'Load Game');
    setScreenButtonReady(refs.bSettings, ctx, 'settings', 'Settings');
    if (refs.bSandbox) setScreenButtonReady(refs.bSandbox, ctx, 'sandbox', 'Sandbox');
    if (refs.bHelp) setScreenButtonReady(refs.bHelp, ctx, 'help', 'Help');
    if (refs.bCircuits) setScreenButtonReady(refs.bCircuits, ctx, 'raceBoard', 'Circuits');
    if (refs.bPhysics) setScreenButtonReady(refs.bPhysics, ctx, 'physicsVenues', 'Physics challenges');
    const sys = ctx.registry && ctx.registry.get && ctx.registry.get('save');
    const syncPending = !!(sys && typeof sys.isSharedStoreSyncPending === 'function' && sys.isSharedStoreSyncPending());
    const latest = latestSave(readSaveIndex(ctx));
    // Continue reads this cache instead of re-scanning localStorage on the click frame —
    // save:store-synced/save:completed re-render refreshes it, same horizon the summary shows.
    this._latestSave = latest;
    if (syncPending && !latest) {
      // Local saves are already authoritative — only a player with NO local slot waits on the
      // remote mirror, since that's the only thing that could still enable Continue. With a
      // local save the verb renders immediately below instead of dead-blocking up to the
      // shared store's 10s timeout behind 'Checking saves'.
      setDisabled(refs.bContinue, true, 'Checking saves');
      refs.saveSummary.classList.remove('has-save');
      refs.saveSummary.textContent = 'Checking saves...';
      this._syncCurrent();
      this._layoutTitleRow();
      reapplyTitleContinueLoadFailure(refs);
      return;
    }
    if (syncPending) this._syncCurrent();
    refs.saveSummary.classList.toggle('has-save', !!latest);
    if (latest) {
      const summary = saveSummaryText(latest.slot, latest.meta);
      // The door's line is the ship, the place and the time played; the full record (slot, date,
      // objective, credits) is the button's hover title and the Load screen's card.
      refs.saveSummary.textContent = continueDoorLine(latest.meta);
      setDisabled(refs.bContinue, false, 'Load ' + summary);
      bContinueRow(refs, true);
    } else {
      refs.saveSummary.textContent = coreText('noSave');
      setDisabled(refs.bContinue, true, 'No save found yet');
      // A dial does not show a dead verb: with no save there is nothing to continue, so the word
      // leaves the dial (the Continue probes all run with a save present).
      bContinueRow(refs, false);
    }
    // ONE primary verb, and it is whichever one actually starts play. Continue is the primary when
    // there is a save to continue; with none it is a dead word at the top of the list, so New Game
    // takes the lamp. Deciding this at build time would light a verb that cannot be used.
    const primaryAction = titlePrimaryAction(!!latest);
    this._setPrimary(primaryAction === 'continue' ? refs.bContinue : refs.bSwarm);
    this._syncCurrent();
    this._layoutTitleRow();
    reapplyTitleContinueLoadFailure(refs);
    // With the failure state settled, the eyebrow returns to its rest line — the re-render that
    // clears a stale failure must not leave the error words standing on the calmest screen in
    // the game. A live gloss (the pointer is on a verb right now) keeps its line instead.
    if (!this._glossAwake) {
      const rest = this._titleStatusRest();
      if (rest != null) refs.status.textContent = rest;
    }
  },

  /** The one lit verb. Exactly one item carries the primary treatment at any time. */
  _setPrimary(target) {
    if (!refs || !refs.root) return;
    for (const el of refs.root.querySelectorAll('.dp-lit__item--primary')) {
      el.classList.remove('dp-lit__item--primary');
    }
    if (target) target.classList.add('dp-lit__item--primary');
  },

  // The default word (Continue when it can load, else New Game)
  // carries aria-current and the list's single Tab stop; the kit's roving focus takes over once
  // focus is inside the list.
  /** The one awake word: the word the lamp lit — the primary verb — so the Hand cannot wake
   *  beside a different word than the lit one. A lit verb that is still aria-disabled refuses
   *  with a deny ("is initializing"), so pointing at it is honest; with no lamp stamped yet
   *  the first usable verb is the fallback. */
  _currentTarget() {
    const lit = refs.root && refs.root.querySelector('.dp-lit__item--primary');
    if (lit) return lit;
    return refs.buttons.find((b) => !isDisabled(b)) || null;
  },

  /** What the eyebrow says when no verb is awake: the Continue summary when a save is present,
   *  else the frame's standing contract line. null means leave the line exactly as it is — a
   *  presented Continue failure owns it until cleared. */
  _titleStatusRest() {
    if (!refs || refs.titleContinueFailure) return null;
    return this._statusDefault;
  },

  _syncCurrent() {
    if (!refs) return;
    const target = this._currentTarget();
    for (const b of refs.buttons) {
      const current = b === target;
      if (current) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
      b.tabIndex = current ? 0 : -1;
    }
    if (arcRail) arcRail.rest();
  },

  onShow(ctx) {
    this._swarmLaunching = false; // back on the title: the Swarm door may launch again
    this._render(ctx);
    this._shown = true;
    this._showToken = (this._showToken || 0) + 1;
    this._arrived = false;
    this._ctx = ctx;
    // Words stamp after the hull (kit motion). The plate is already up; the live stage may
    // still be assembling — that is the P17 "menu arrives after the hull" hold, not a blank.
    this._hold();
    this._arrive();
    if (refs) {
      // Focus the word _syncCurrent lights — in the demo that is the Crucible, not merely the
      // first usable verb — or the ORRERY Hand wakes on a different word than the primary.
      const target = this._currentTarget();
      if (target) try { target.focus(); } catch (e) {}
    }
    this._loadVersion();
    this._startIdleAttract({ ctx, state: ctx && ctx.state, rootEl: refs && refs.root });
    // Row 473: ask once, on the real title. Usually the boot shell is still up here, so this
    // returns false and the loading-hidden receipt below is what actually opens the offer.
    this._maybeOfferFirstLight(ctx);
  },
  onHide() {
    this._shown = false;
    this._showToken = (this._showToken || 0) + 1;
    // Only a dialog this screen opened is ours to dismiss. The pending flag doubles as "the promise
    // is still live", and the show token makes any late resolution inert.
    if (this._firstLightPending && this._firstLightConfirm) {
      this._firstLightPending = null;
      this._firstLightConfirm = false;
      try { dismissConfirm(); } catch (e) { /* the session it belonged to is over */ }
    }
    this._stopIdleAttract();
    // The lamp holds a ResizeObserver and four listeners on the menu; a screen that hides without
    // releasing them leaks one set per mount.
    if (detachLamp) { detachLamp(); detachLamp = null; }
  },
  refresh(ctx, options = {}) {
    if (options && options.periodic && refs && this._menuSig != null
      && this._menuSig === this._menuInputs(ctx)) return;
    this._render(ctx);
  },

  /** Row 473: the loading shell's completion receipt (loadingPresenter emits it after the overlay
   *  actually flips to display:none). This is the moment the title is finally unobstructed. */
  _bindLoadingHidden(ctx) {
    if (!ctx || !ctx.bus || typeof ctx.bus.on !== 'function') return null;
    return ctx.bus.on('ui:loadingHidden', () => { this._maybeOfferFirstLight(ctx); });
  },

  /** The seam the focused test replaces; the shipped route is the kit confirm. */
  _confirmFirstLight(options) { return confirm(options); },

  /**
   * Offer the calm first-light bundle once, through the shared confirmation surface.
   *
   * Returns true when an offer was opened. The gate is deliberately strict — the menu must be the
   * current screen, the boot shell must be fully gone, no other dialog may be open, and this menu
   * instance must not already have an offer pending. "Offered" is recorded BEFORE the words appear,
   * so a reload while the dialog is open cannot ask a second time.
   */
  _maybeOfferFirstLight(ctx) {
    if (this._shown !== true) return false;
    if (!menuIsCurrent(ctx)) return false;
    if (this._firstLightPending) return false;
    if (isConfirmOpen()) return false;
    if (bootOverlayBlocksMenu()) return false;
    const state = ctx && ctx.state;
    const settings = state && state.settings;
    if (!shouldOfferFirstLight(settings)) return false;

    // Offered once, including a reload before an answer: the marker is persisted through the
    // existing generic accessibility subtree before any dialog exists.
    const access = accessibilityOf(settings);
    access.firstLightOffered = true;
    mirrorAccessibility(ctx, settings);
    publishAccessibilityChange(ctx, 'firstLightOffered', true);

    const token = (this._firstLightToken = (this._firstLightToken || 0) + 1);
    const shownToken = this._showToken;
    this._firstLightPending = token;
    this._firstLightConfirm = true;
    // The still's drift is a background behaviour; a decision owns the screen while it is open.
    this._stopIdleAttract();

    let answer;
    try {
      answer = this._confirmFirstLight(FIRST_LIGHT_OFFER);
    } catch (e) {
      answer = Promise.resolve(false);
    }
    Promise.resolve(answer).then((accepted) => {
      // The pending flag tracks the live promise, so it clears on ANY settle — a superseded dialog
      // included — not only on a real answer.
      if (this._firstLightPending === token) {
        this._firstLightPending = null;
        this._firstLightConfirm = false;
      }
      // Navigated away or disposed while the words were up: no late write to a settings tree the
      // next screen (or the next run) already owns.
      if (this._showToken !== shownToken) return;
      // 'calm' is the only answer that applies the preset: Play (the lamp key), Esc, backdrop,
      // and an away-dismiss all mean "keep my settings" — the offer stays an offer, not a gate.
      const settled = accepted === 'calm';
      if (settled) applyFirstLightPreset(settings, rootElement());
      // `access` predates the first mirror: the direct-write path replaces settings.accessibility
      // with a copy, so the declined answer must land on the LIVE subtree or it is lost before
      // this mirror runs (the sink path keeps the same object, which is why both stay correct).
      else accessibilityOf(settings).firstLightChoice = 'kept';
      mirrorAccessibility(ctx, settings);
      if (settled && settings.video && typeof settings.video === 'object') {
        laneWriteSetting(state, 'settings.video.motionReduce', settings.video.motionReduce);
      }
      // One persistent receipt for the settled choice: main applies it and the save owner writes
      // the profile, so the answer survives the next launch.
      publishAccessibilityChange(ctx, 'firstLightChoice', settled ? 'applied' : 'kept');
      // The drift was stopped for the dialog; the title can breathe again if it still owns the screen.
      if (this._shown === true && refs && refs.root) {
        this._startIdleAttract({ ctx, state: ctx && ctx.state, rootEl: refs.root });
      }
    });
    return true;
  },

  dispose() {
    this._shown = false;
    this._showToken = (this._showToken || 0) + 1;
    this._firstLightPending = null;
    this._firstLightConfirm = false;
    this._stopIdleAttract();
    if (arcRail) { arcRail.dispose(); arcRail = null; }
    if (this._onTabKey && refs && refs.root) refs.root.removeEventListener('keydown', this._onTabKey);
    this._onTabKey = null;
    if (this._glossDetach) { this._glossDetach(); this._glossDetach = null; }
    this._glossAwake = null;
    for (const off of this._offBus || []) { try { off(); } catch (_) {} }
    this._offBus = [];
    refs = null;
  },

  // The idle attract (spec2/03 §3, MAP_OVERHAUL_BRIEF "cinematic still + idle drift",
  // build_map.md §25 Phase 5.2): after ATTRACT_IDLE_MS without input two things arm
  // together — `data-attract` starts the still's cheap transform drift (kit.css), and
  // `_attractLive` swaps the stage request to `title-attract`, the deterministic
  // Crucible replay that plays behind the menu instead of the still. Input re-arms the
  // idle window but does not tear the live fight down — once it is up it stays until
  // the screen hides or the player picks; reduced motion never lets either arm at all.
  _startIdleAttract({ ctx, state, rootEl } = {}) {
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
      if (on) {
        rootEl.dataset.attract = '1';
        // The flag alone changes nothing — the manager owns stageRequest and only
        // re-resolves stage specs on a stack sync, so arming needs the explicit nudge.
        if (this._attractLive !== true) {
          this._attractLive = true;
          const mgr = getManager(ctx);
          if (mgr && typeof mgr.syncVisibility === 'function') {
            try { mgr.syncVisibility(); } catch (e) { console.warn('[mainMenu] attract stage swap failed to request', e); }
          }
        }
      } else {
        delete rootEl.dataset.attract;
      }
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
    // The live title's whole teardown is this flag plus the stack sync that follows
    // every hide/unmount: the next resolve sees 'title-field' again (or nothing, when
    // another screen owns the top) and uiStage releases the fight with the stage.
    this._attractLive = false;
  },

  // Arrival (sheet: "the menu arrives after the hull"): the title settles from the top, then the
  // words stamp in 60 ms apart — the verb ladder first, the reference line closing the cascade —
  // and the fine foot settles once the words are seated. Once per show; reduced motion shows
  // everything at once (kit motion). Stamp budget: 10 items x 60 ms keeps the sequence inside
  // the kit's 1 s delay cap.
  _arrive() {
    if (this._arrived || !refs) return;
    this._arrived = true;
    try {
      settle(refs.title, { from: 'top', state: 'title:arrive' });
      const words = [...refs.list.children, ...(refs.aside ? refs.aside.children : [])];
      stamp(words, { gap: 60, state: 'title:arrive' });
      if (refs.version) settle(refs.version, { from: 'top', delay: 60 * Math.max(0, words.length - 1) + 120, state: 'title:arrive' });
    } catch (e) {
      console.warn('[mainMenu] arrival motion skipped', e);
    }
  },

  // The pre-arrival state (the kit's own `.k-in` start pose, which settle/stamp then release).
  // The title, the verb words, the reference line and the fine foot all hold — nothing on this
  // screen just appears (ORRERY.md §3.5). Reduced motion never holds: everything is simply there.
  _hold() {
    if (!refs || reducedMotion()) return;
    refs.title.classList.add('k-in', 'k-in--top');
    for (const li of refs.list.children) li.classList.add('k-in', 'k-in--stamp');
    if (refs.aside) for (const li of refs.aside.children) li.classList.add('k-in', 'k-in--stamp');
    if (refs.version) refs.version.classList.add('k-in', 'k-in--top');
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
    // Sample the counter when `live` first reads true, not at click: menu frames keep presenting
    // through the whole load, so a click-time baseline is already stale when mode flips — the
    // veil would lift on the same commit as the flag, before any flight frame exists. Post-flip
    // increments can only be flight frames (the menu stops drawing at the mode change).
    let frameAtLive = null;
    const start = Date.now();
    // rAF-chain the readiness check: the presented-frame counter only advances at paint, so a
    // timer poll can lag readiness by up to its period (~120ms of veil latency after the frame
    // already exists). rAF wakes the same frame the counter moves; a timer stays as failsafe
    // for hosts that throttle background rAF.
    // The veil element is a singleton: a re-entry (a second Continue after a failed load)
    // must retire the previous loop's arms and pending removal so they can't lift or delete
    // the veil the new loop relies on mid-load.
    const previous = fade._sfContinueFadeLoop;
    if (previous) {
      previous.stale = true;
      if (previous.rafId != null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(previous.rafId);
      if (previous.timerId != null) clearTimeout(previous.timerId);
      if (previous.removeTimerId != null) clearTimeout(previous.removeTimerId);
      if (typeof previous.offModeChanged === 'function') previous.offModeChanged();
      if (typeof previous.offSaveError === 'function') previous.offSaveError();
    }
    const loop = { stale: false, rafId: null, timerId: null, removeTimerId: null, offModeChanged: null, offSaveError: null };
    fade._sfContinueFadeLoop = loop;
    const lift = () => {
      if (loop.stale) return;
      loop.stale = true;
      if (loop.rafId != null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(loop.rafId);
      if (loop.timerId != null) clearTimeout(loop.timerId);
      if (typeof loop.offModeChanged === 'function') loop.offModeChanged();
      if (typeof loop.offSaveError === 'function') loop.offSaveError();
      fade.classList.remove('open');
      loop.removeTimerId = setTimeout(() => {
        if (fade._sfContinueFadeLoop === loop && fade.parentNode) fade.remove();
      }, 1100);
    };
    // A failed Continue bounces mode back to the menu (the stranded-mode hand-back or a
    // bounced rollback) — no flight frame is coming, so lift immediately instead of holding
    // the opaque veil over the menu for the rest of the 4s failsafe.
    loop.offModeChanged = ctx && ctx.bus && typeof ctx.bus.on === 'function'
      ? ctx.bus.on('mode:changed', ({ mode } = {}) => {
          if (mode && mode !== 'flight' && mode !== 'loading') lift();
        })
      : null;
    // A load that fails BEFORE any mode edge (corrupt slot, preflight/read rejection —
    // state.mode never left 'menu', so mode:changed never fires) still publishes
    // save:error, the same receipt the title's alert line classifies. Lift with the alert
    // instead of holding opaque black over it for the failsafe window (F-START-02).
    // Unclassified receipts (write/quota noise during a load that may still land) keep the veil.
    loop.offSaveError = ctx && ctx.bus && typeof ctx.bus.on === 'function'
      ? ctx.bus.on('save:error', (payload = {}) => {
          if (isTitleSaveReadFailure(payload)) lift();
        })
      : null;
    const check = () => {
      if (loop.stale) return;
      const live = ctx && ctx.state && ctx.state.mode === 'flight';
      let presented = false;
      if (live) {
        if (frameAtLive == null) {
          frameAtLive = frameCount();
          // Counter unavailable: the flag alone is the best signal left — lift on live.
          presented = frameAtLive == null;
        } else {
          const now = frameCount();
          presented = now != null && now > frameAtLive;
        }
      }
      if ((live && presented) || Date.now() - start > 4000) {
        lift();
        return;
      }
      // One pending callback per channel: arming unconditionally stacks a new rAF chain per
      // timer fire and a new timeout per rAF wake inside the stall window this guards. Each
      // channel self-clears before re-entering check(), which re-arms it if still pending.
      if (typeof requestAnimationFrame === 'function' && loop.rafId == null) {
        loop.rafId = requestAnimationFrame(() => { loop.rafId = null; check(); });
      }
      // The timer must re-arm on every wake, not just when rAF is missing: on a rAF-throttled
      // host (background tab) the first timer fire is the last check unless it keeps itself
      // armed — the 4s cap would never evaluate and the veil would hold indefinitely.
      if (loop.timerId == null) {
        loop.timerId = setTimeout(() => { loop.timerId = null; check(); }, 200);
      }
    };
    if (typeof requestAnimationFrame === 'function') {
      loop.rafId = requestAnimationFrame(() => { loop.rafId = null; check(); });
      // failsafe only: rAF-throttled hosts still lift — and self-clears so check()'s guarded
      // re-arm keeps exactly one pending per channel.
      loop.timerId = setTimeout(() => { loop.timerId = null; check(); }, 200);
    } else {
      loop.timerId = setTimeout(() => { loop.timerId = null; check(); }, 200);
    }
  },
};
