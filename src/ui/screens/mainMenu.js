// Main Menu / title screen (ARCHITECTURE §1.3 step 6, §5; design/specs/09).
// Field Hardware POSTER: uiStage `title-field` (Hitch on the dusk pad) plus produced kit
// hardware — logotype, legend rail, selected-row plate, status strip, build light.
// This file owns no CSS. Continue is enabled iff a save exists, shows the exact latest slot
// metadata, and loads that displayed slot so players trust resume before committing to a load.
import { createTitleFrame } from '../views/menuFrames.js';
import { injectDeckplate, attachAttentionLamp } from '../deckplate/index.js';
import { CREDITS } from '../../data/credits.js';
import { NEW_GAME } from '../../data/newGameDefaults.js';
import { requestCodexTab } from './codex.js';
import { coreText } from '../localizedCoreCopy.js';
import { requestQuit } from '../quitGame.js';
import { IS_DEV } from '../../core/devMode.js';
import { IS_DEMO } from '../../core/demoMode.js';
import { el, words, settle, stamp, reducedMotion, cue } from '../kit/index.js';
import { selectLatestOccupiedSlot } from '../../save/saveSystem.js';
import { createArcRail } from '../orrery/arcRail.js';
import { injectOrreryScreens } from '../orrery/screenLayouts.js';

const LS_PREFIX = 'sf.save.';
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

/**
 * The DIAGNOSTIC identity: version plus build hash. This is what a crash receipt and the shell
 * bridge want, and pq-033-01 guards its composition.
 */
export function leftoverVersionLabel(payload) {
  const version = leftoverVersionToken(payload);
  if (!version) return 'SpaceFace';
  const build = leftoverBuildToken(payload);
  return 'SpaceFace v' + version + (build ? ' · ' + build : '');
}

/**
 * The PLAYER-FACING line: version only.
 *
 * ONE_PHOTOGRAPH.md section 4.15 kills developer strings on player screens, and named this one:
 * the commit hash in the title foot and the pause foot. A version number is legitimate -- a player
 * quoting "v0.1.0" in a bug report helps them and us. A twelve-character git SHA does not: it
 * means nothing to the reader and it read as debris on the two calmest screens in the game.
 *
 * The hash is not lost, only moved off the wall: leftoverVersionLabel still composes it for
 * diagnostics, and the title foot carries it as a title attribute so it is one hover away for
 * anyone filing a report.
 */
export function leftoverVersionDisplay(payload) {
  const version = leftoverVersionToken(payload);
  return version ? 'SpaceFace v' + version : 'SpaceFace';
}

export function applyLeftoverVersionText(target, payload) {
  if (!target) return '';
  const version = leftoverVersionToken(payload);
  if (!version) return target.textContent || '';
  const label = leftoverVersionDisplay(payload);
  target.textContent = label;
  target.title = leftoverVersionLabel(payload);
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

/** The one lit verb's action. Demo: the Crucible door always (ZERO_TO_HERO Phase 5.1). Otherwise
 *  Continue when a save exists, New Game when none does — the pre-demo decision, unchanged. */
export function titlePrimaryAction(demo, hasSave) {
  if (demo) return 'crucible';
  return hasSave ? 'continue' : 'newGame';
}

/** The verbs' reading order. DEMO_READINESS §5: in the demo the Crucible is the FIRST button,
 *  not just the lit one — Adventure (New Game renamed) second, Continue third. */
export function titleVerbOrder(demo) {
  if (demo) return ['crucible', 'newGame', 'continue', 'settings', 'quit'];
  return ['continue', 'newGame', 'load', 'crucible', 'settings', 'quit'];
}

export const mainMenuScreen = {
  id: 'mainMenu',

  // P20/P22: the approved "Field at dusk" shot as a live presentation scene on the main renderer
  // (src/render/uiStage.js). Simulation stays frozen; the plate is the assemble / no-WebGL fallback.
  stage: { scene: 'title-field', hullDefId: NEW_GAME.shipId },

  mount(rootEl, ctx) {
    injectDeckplate();   // the title can mount before the HUD that otherwise injects the system
    rootEl.innerHTML = '';
    // No `k-screen`: the frame IS the screen now (dp-frame--screen), and leaving the kit's grid
    // class on the root would put `#screens .of-title.k-screen` back in the cascade against it.
    rootEl.classList.add('screen');
    rootEl.dataset.screen = 'mainMenu';
    rootEl.dataset.kReady = '0';

    const { backdrop, title, stage, status } = createTitleFrame(rootEl);

    // The words. Visible words follow the sheet; the accessible names keep the game's core copy
    // (coreText) so every route that finds "New Game" / "Continue" / "Quit Game" still does.
    // THE COLUMN IS FIVE VERBS, and one of them is the reason a stranger opened the game. Until
    // 2026-09-22 it was eight words at identical weight, so NEW GAME weighed exactly as much as
    // SANDBOX and the screen had made no decision. Everything that is a REFERENCE rather than a way
    // into the game moved to the footer line with Credits and Achievements; what is left is play,
    // resume, the other mode, the settings, and the way out.
    //
    // `primary` is resolved after the save scan (_applySave): Continue when there is something to
    // continue, New Game when there is not — except in the demo, where the Crucible is always the
    // one lit verb (ZERO_TO_HERO Phase 5.1). Marking it here would light a dead verb on first paint.
    // DEMO_READINESS §5: in the demo the Crucible is the FIRST button, not just the lit one —
    // titleVerbOrder owns the reading order both modes share.
    const labels = {
      // The demo renames the verb to the mode it starts; the accessible name stays coreText so
      // every route that finds "New Game" still does.
      newGame: IS_DEMO ? 'Adventure' : coreText('newGame'),
      continue: coreText('continue'),
      load: 'Load',
      // "Crucible" — the scored ten-wave Survival run (PQ-133 §12.2: direct main-menu entry). It
      // launches through the ordinary New Game path and never touches the Adventure save.
      crucible: 'Crucible',
      settings: coreText('settings'),
      quit: 'Quit',
    };
    const items = titleVerbOrder(IS_DEMO).map((action) => ({
      action,
      label: labels[action],
      ...(action === 'continue' ? { sub: 'Checking saves...', current: true } : {}),
      ...(action === 'quit' ? { danger: true } : {}),
    }));
    // The quiet line: reference and dev, at etch size, out of the way of the decision.
    // "Archive" opens the Codex on its Archive tab, where the authored intro cinematics replay.
    const asideItems = [{ action: 'archive', label: 'Archive' }];
    // "Sandbox" — DEV ONLY. A testing harness for reaching mid-game features without playing for
    // an hour. Stripped from production builds via IS_DEV. See src/ui/screens/sandbox.js.
    if (IS_DEV) asideItems.push({ action: 'sandbox', label: 'Sandbox' });

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
    stage.classList.add('dp-attend');
    stage.appendChild(list);

    // The quiet line sits under the column, in the same substance one size down, so reference verbs
    // are reachable without competing with the decision.
    const aside = words(asideItems, {
      ariaLabel: 'Reference',
      system: 'light',
      row: true,
      onPick: (action) => this._pick(ctx, action),
    });
    aside.classList.add('of-title-aside');
    stage.appendChild(aside);
    detachLamp = attachAttentionLamp(stage);
    // ORRERY: the same buttons, set round the rim of the emblem's dial; the amber Hand swings from
    // its pivot to whichever verb is awake. The rail only positions the list and draws behind it.
    if (arcRail) arcRail.dispose();
    injectOrreryScreens();
    rootEl.classList.add('orr-title');
    arcRail = createArcRail({ host: stage, list, frame: rootEl, extra: [aside] });

    const byAction = (action) => stage.querySelector('[data-action="' + action + '"]');
    const bContinue = byAction('continue');
    const bNew = byAction('newGame');
    const bLoad = byAction('load');
    const bCrucible = byAction('crucible');
    const bArchive = byAction('archive');
    const bSettings = byAction('settings');
    const bSandbox = byAction('sandbox');
    const bQuit = byAction('quit');
    if (bLoad) bLoad.setAttribute('aria-label', coreText('loadGame'));
    if (IS_DEMO) bNew.setAttribute('aria-label', coreText('newGame'));
    bArchive.setAttribute('aria-label', coreText('signalArchive'));
    bQuit.setAttribute('aria-label', coreText('quitGame'));
    if (bSandbox) bSandbox.classList.add('k-38');
    // The save summary rides Continue's sub line. `.sf-menu-save-summary` / `has-save` are inert
    // hooks the boot and title-continue checks query; kit.css styles the sub line.
    // The light variant names its sub line dp-lit__note; the bench one names it dp-menu__note.
    // Query both, so changing a screen's weight never silently drops the save summary.
    const saveSummary = bContinue.parentElement.querySelector('.dp-lit__note, .dp-menu__note');
    saveSummary.classList.add('sf-menu-save-summary');

    // The fine line: "SpaceFace v0.0.0 · " then the Credits word (Task B §1.6). The version text
    // lives in its own span so _loadVersion can rewrite it without touching the word.
    const version = el('footer', 'dp-frame__foot dp-etch');
    version.dataset.role = 'version';
    // The build light: the produced `light.dot.good.on` render, the frame's own corner detail.
    // Decorative — the build string beside it is the information.
    const buildLight = el('span', 'dp-led');
    buildLight.dataset.colour = 'good';
    buildLight.setAttribute('aria-hidden', 'true');
    version.appendChild(buildLight);
    const versionText = el('span', '', leftoverVersionDisplay(CREDITS));
    // The full identity stays one hover away for a bug report, off the wall (section 4.15).
    versionText.title = leftoverVersionLabel(CREDITS);
    version.appendChild(versionText);
    version.appendChild(el('span', '', ' · '));
    const bCredits = el('button', 'dp-menu__item dp-menu__item--fine', 'Credits');
    bCredits.type = 'button';
    bCredits.dataset.action = 'credits';
    bCredits.addEventListener('click', () => { cue('confirm'); this._pick(ctx, 'credits'); });
    version.appendChild(bCredits);
    // PQ-033.03: Achievements rides the same fine line as Credits — a quiet word, not a menu row.
    version.appendChild(el('span', '', ' · '));
    const bAchievements = el('button', 'dp-menu__item dp-menu__item--fine', 'Achievements');
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

    // data-k-ready is owned by the screen manager once `stage` is declared: live, plate, or
    // unavailable. The still is already in the tree as `.k-world--plate`.

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
      screenReady(ctx, 'sandbox') ? '1' : '0',
      screenReady(ctx, 'crucible') ? '1' : '0',
    ].join('');
  },

  _render(ctx) {
    if (!refs) return;
    this._menuSig = this._menuInputs(ctx);
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
      // ORRERY: the dial shows no sentence under a verb; what Continue would load is the eyebrow.
      if (refs.status) refs.status.textContent = coreText('continue') + ' · ' + summary;
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
    // takes the lamp. The demo lights the Crucible regardless (ZERO_TO_HERO Phase 5.1). Deciding
    // this at build time would light a verb that cannot be used.
    const primaryAction = titlePrimaryAction(IS_DEMO, !!latest);
    this._setPrimary(
      primaryAction === 'crucible' ? refs.bCrucible
        : primaryAction === 'continue' ? refs.bContinue
          : refs.bNew);
    this._syncCurrent();
  },

  /** The one lit verb. Exactly one item carries the primary treatment at any time. */
  _setPrimary(target) {
    if (!refs || !refs.root) return;
    for (const el of refs.root.querySelectorAll('.dp-lit__item--primary')) {
      el.classList.remove('dp-lit__item--primary');
    }
    if (target) target.classList.add('dp-lit__item--primary');
  },

  // The default word (Continue when it can load, else New Game — always Crucible in the demo)
  // carries aria-current and the list's single Tab stop; the kit's roving focus takes over once
  // focus is inside the list.
  /** The one awake word: the demo's Crucible always; otherwise the word the lamp lit — the
   *  primary verb — so the Hand cannot wake beside a different word than the lit one. A lit verb
   *  that is still aria-disabled refuses with a deny ("is initializing"), so pointing at it is
   *  honest; with no lamp stamped yet the first usable verb is the fallback. */
  _currentTarget() {
    if (IS_DEMO) return refs.bCrucible || null;
    const lit = refs.root && refs.root.querySelector('.dp-lit__item--primary');
    if (lit) return lit;
    return refs.buttons.find((b) => !isDisabled(b)) || null;
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
    this._render(ctx);
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
    this._startIdleAttract({ state: ctx && ctx.state, rootEl: refs && refs.root });
  },
  onHide() {
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

  dispose() {
    this._stopIdleAttract();
    if (arcRail) { arcRail.dispose(); arcRail = null; }
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
