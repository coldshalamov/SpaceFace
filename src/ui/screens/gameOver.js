// Ship-loss after-action screen. Standard runs pause over the wreck until the player confirms a
// deterministic lawful-dock recovery; Ironman keeps its final-run contract. Combat owns all state
// mutation and consequences. This DOM surface only explains the receipt and emits intents.
// The sheet's line (design/frontend/direction/DIRECTION_SHEET.md, game over, amended by Task B §1.5):
// a still — the wreck or the last frame, cooled with the wanted-blue scrim; what killed you at
// screen-title size; the final sortie and the final damage as the second line; the recovery dock,
// recovery cost and cargo consequence as three hero blocks; coverage as one sentence; the actions as
// words. Built on the frontend kit (styles/kit.css, src/ui/kit/); this file owns no CSS. The DOM is
// built from `el` + appendChild only so the after-action unit test's minimal fake document runs it.

//
// ORRERY (design/frontend/ORRERY.md §6 Meta, "Game over"): light rays cooled to red stand behind the
// report; the cause is the headline line and decrypts on arrival; the career record is a ring (the
// career's time round it, the lost hull's life the red arc that ends it at the top, the figures on
// stations round the rim); restore is the one Lamp Key (the recovery berth, else Load save, else New
// Game in Ironman). Red is only the loss. Composition: src/ui/orrery/saveLayouts.js.

import { STORY_BEATS } from '../../data/missions.js';
import { el, settle, cue } from '../kit/index.js';
import { dressLampKey } from '../orrery/lampKey.js';
import { injectSaveLayouts } from '../orrery/saveLayouts.js';
import { svg, arcD, polar, ticksD } from '../orrery/svg.js';
import { decrypt, rollTo } from '../orrery/text.js';
import { entitySpanHtml, decorateEntityNode } from '../entityResolver.js';
import { hullPosterUrl } from '../hullPosters.js';
import { NEW_GAME } from '../../data/newGameDefaults.js';
import { escapeHtml } from '../comms.js';
import { injectDeckplate } from '../deckplate/index.js';

/** The career ring's stations: [label, bearing in dial degrees (0 = up, clockwise)]. Time flown reads
 *  at the hub; the lost hull's life sits by the red arc it names (top left). */
const RING_STATIONS = Object.freeze({
  'Time flown': null,
  'This hull lasted': 318,
  'Contracts done': 42,
  Kills: 90,
  Trades: 138,
  'Lifetime profit': 222,
  'Best single trade': 270,
});

function parseDurationS(text) {
  const m = /^(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:(\d+)s)?$/.exec(String(text || '').trim());
  if (!m || !(m[1] || m[2] || m[3])) return null;
  return (Number(m[1]) || 0) * 3600 + (Number(m[2]) || 0) * 60 + (Number(m[3]) || 0);
}

/** The receipt's fields and their labels. The kicker, the second line, the hero words and the
 *  coverage sentence are all spelled from this table (the screen-import check reads the pairs). */
const FIELD_LABELS = [
  ['cause', 'Loss cause'],
  ['lifespan', 'Final sortie'],
  ['damage', 'Final damage'],
  ['dock', 'Recovery dock'],
  ['cost', 'Recovery cost'],
  ['cargo', 'Cargo consequence'],
  ['insurance', 'Coverage'],
];
const LABEL = Object.fromEntries(FIELD_LABELS);
const lower = (s) => String(s).toLowerCase();

/** A kit hero block (`.k-hero`): the number and its word. Returns the number element for updates. */
function heroBlock(parent, word) {
  const block = el('div', 'k-hero');
  const n = el('span', 'k-hero__n', '-');
  block.appendChild(n);
  block.appendChild(el('span', 'k-hero__w', word));
  parent.appendChild(block);
  return n;
}

/** A kit word in a `.k-words` list. Returns the button; the caller hides its `li` with it. */
function wordItem(list, label, className) {
  const li = el('li');
  const button = el('button', 'k-word k-word--emph' + (className ? ' ' + className : ''), label);
  button.type = 'button';
  li.appendChild(button);
  list.appendChild(li);
  button._kItem = li;
  return button;
}

function setWordHidden(button, hidden) {
  if (!button) return;
  button.hidden = hidden;
  if (button._kItem) button._kItem.hidden = hidden;
}

function fmtTime(s) {
  s = Math.max(0, Math.floor(s || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h > 0) return h + 'h ' + m + 'm';
  if (m > 0) return m + 'm ' + sec + 's';
  return sec + 's';
}

function fmtCr(c) { return (Math.max(0, Math.round(c || 0))).toLocaleString() + ' cr'; }

function fmtMs(ms) {
  const s = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  return fmtTime(s);
}

function prettyLabel(value) {
  return String(value || 'unknown')
    .replace(/^(faction|ship|sector|station)_/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function storyProgressLabel(state = {}) {
  const story = state.story || (state.missions && state.missions.story) || {};
  const raw = Number(story.beatIndex);
  const maxBeat = Math.max(0, STORY_BEATS.length - 1);
  const beat = Number.isFinite(raw) ? Math.max(0, Math.min(maxBeat, Math.floor(raw))) : 0;
  return 'Beat ' + beat + ' / ' + maxBeat;
}

function telemetryHandle(ctx) {
  if (ctx && ctx.telemetry && typeof ctx.telemetry.getSessionStats === 'function') return ctx.telemetry;
  const globalTelemetry = typeof window !== 'undefined' ? window.__SF_TELEMETRY__ : null;
  return globalTelemetry && typeof globalTelemetry.getSessionStats === 'function' ? globalTelemetry : null;
}

export function deathCauseLabel(entry = null) {
  if (!entry) return 'Unknown loss';
  const cause = String(entry.cause || 'unknown');
  if (cause === 'environmental') return 'Environmental hazard';
  if (cause === 'self') return 'Self-inflicted damage';
  if (cause.startsWith('collision:')) return 'Collision with ' + prettyLabel(cause.slice('collision:'.length));
  if (cause.startsWith('ship:')) {
    const killer = prettyLabel(entry.killerType || cause.slice('ship:'.length));
    const faction = entry.killerFaction ? ' (' + prettyLabel(entry.killerFaction) + ')' : '';
    return 'Destroyed by ' + killer + faction;
  }
  return cause === 'unknown' ? 'Unknown loss' : prettyLabel(cause);
}

export function lastDeathSummary(ctx = {}) {
  const telemetry = telemetryHandle(ctx);
  let entry = null;
  if (telemetry) {
    try {
      const stats = telemetry.getSessionStats();
      const log = stats && Array.isArray(stats.deathLog) ? stats.deathLog : [];
      entry = log.length ? log[log.length - 1] : null;
    } catch (e) {
      entry = null;
    }
  }
  return {
    cause: deathCauseLabel(entry),
    lifespan: entry && entry.lifespanMs != null ? fmtMs(entry.lifespanMs) : '-',
  };
}

export function currentDefeat(ctx = {}) {
  const state = ctx.state || {};
  return state.combat && state.combat.lastPlayerDefeat || null;
}

function getManager(ctx) {
  if (ctx && ctx.screenManager) return ctx.screenManager;
  if (ctx && ctx.screens && ctx.screens.pushScreen) return ctx.screens;
  const ui = ctx && ctx.registry && ctx.registry.get && ctx.registry.get('ui');
  if (ui && ui.screenManager) return ui.screenManager;
  return null;
}

function asScreenStack(ctx) {
  const stack = ctx && ctx.state && ctx.state.ui && ctx.state.ui.screenStack;
  return Array.isArray(stack) ? stack : null;
}

/**
 * Successful recovery must dismiss Game Over even when another modal (for example, Load save)
 * is stacked above it. Pop ancestors until gameOver leaves the stack; fall back to a single
 * top-only pop when the shared stack is unavailable.
 */
function popAncestorsUntilGameOverResolves(ctx, manager) {
  if (!manager) return { popped: 0, dismissed: false };
  const stack = asScreenStack(ctx);
  if (Array.isArray(stack)) {
    if (!stack.includes('gameOver')) return { popped: 0, dismissed: false };
    let popped = 0;
    // Bound by the initial length so a broken/no-op manager cannot spin forever.
    const guard = stack.length;
    for (let i = 0; i < guard && stack.length; i++) {
      const top = stack[stack.length - 1];
      if (typeof manager.popScreen !== 'function') break;
      const beforeLength = stack.length;
      manager.popScreen();
      // Keep lightweight harness managers honest when they do not mutate the shared stack.
      if (stack.length === beforeLength) stack.pop();
      popped += 1;
      if (top === 'gameOver') return { popped, dismissed: true };
    }
    return { popped, dismissed: !stack.includes('gameOver') };
  }

  const isGameOverTop = typeof manager.top === 'function' && manager.top() === 'gameOver';
  if (!isGameOverTop || typeof manager.popScreen !== 'function') {
    return { popped: 0, dismissed: false };
  }
  manager.popScreen();
  return { popped: 1, dismissed: true };
}

export const gameOverScreen = {
  id: 'gameOver',
  data: { locked: true },
  _summaryEls: null,
  _summarySig: null,
  _defaultButton: null,
  _titleEl: null,
  _subEl: null,
  _recoveryEl: null,
  _retryButton: null,
  _loadButton: null,
  _newButton: null,
  _menuButton: null,

  mount(rootEl, ctx) {
    this._rootEl = rootEl;

    injectDeckplate();
    injectSaveLayouts();
    rootEl.innerHTML = '';
    rootEl.classList.remove('panel', 'sf-menu', 'sf-gameover');
    // k-screen--cold: the one screen that deepens the menu scrim to the wanted blue (Task B §1.5).
    rootEl.classList.add('k-screen', 'k-screen--stage', 'k-screen--cold', 'sf-gameover', 'orr-gameover');
    rootEl.setAttribute('role', 'dialog');
    rootEl.setAttribute('aria-modal', 'true');
    rootEl.setAttribute('aria-labelledby', 'sf-gameover-title');
    // Light rays cooled to red, behind the report (ORRERY §4 #16): one slow compositor turn, still
    // under reduced motion.
    const rays = el('div', 'orr-go-rays');
    rays.setAttribute('aria-hidden', 'true');
    rootEl.appendChild(rays);

    // .k-title — what killed you, at screen-title size; the sortie and the damage as the second line.
    const title = el('header', 'k-title');
    // The verdict as a caps kicker over the cause ("Ship lost · loss cause"); the public-route check
    // reads both phrases from the surface, and the cause itself is the display line.
    const kicker = el('span', 'k-caps', 'Ship lost · ' + lower(LABEL.cause));
    this._kickerEl = kicker;
    title.appendChild(kicker);
    const h = el('h1', 'k-display k-t-title', 'Ship Lost');
    h.id = 'sf-gameover-title';
    this._titleEl = h;
    title.appendChild(h);
    const line = el('p', 'k-sentence k-sentence--emph');
    this._lineEl = line;
    title.appendChild(line);
    const sub = el('p', 'k-sentence sf-go-sub', 'Flight controls locked. Review the loss, then recover.');
    this._subEl = sub;
    title.appendChild(sub);
    rootEl.appendChild(title);

    // .k-stage — three hero blocks, the coverage sentence, the recovery sentence.
    const stage = el('section', 'k-stage');
    const heroes = el('div', 'k-words k-words--row sf-go-grid');
    this._summaryEls = Object.create(null);
    // `.sf-go-grid .v` is what the public-route check reads; the hero numbers carry the class.
    // The sheet's words are "recovery dock", "recovery cost", "cargo"; the public-route check reads
    // "Cargo consequence", so the third word is the nearest phrase that satisfies both.
    for (const key of ['dock', 'cost', 'cargo']) {
      const n = heroBlock(heroes, lower(LABEL[key]));
      n.className += ' v';
      this._summaryEls[key] = n;
    }
    stage.appendChild(heroes);
    const insurance = el('p', 'k-sentence');
    this._summaryEls.insurance = insurance;
    stage.appendChild(insurance);
    const recovery = el('p', 'k-sentence sf-go-recovery', 'Recovery receipt pending.');
    this._recoveryEl = recovery;
    stage.appendChild(recovery);
    rootEl.appendChild(stage);
    // The career record beside the loss report: what this pilot had done before the hull went, so
    // the screen reads as the end of a chapter, not a receipt alone. Refilled on every show.
    const recap = el('aside', 'sf-go-recap');
    recap.setAttribute('aria-label', 'Career record');
    recap.appendChild(el('p', 'k-caps sf-go-recap__title', 'Career record'));
    // The ring the record's stations stand round (drawn by _paintCareerRing where SVG exists).
    const ring = el('div', 'sf-go-ring');
    ring.setAttribute('aria-hidden', 'true');
    recap.appendChild(ring);
    this._ringEl = ring;
    const recapRows = el('dl', 'sf-go-recap__rows');
    recap.appendChild(recapRows);
    this._recapRows = recapRows;
    // A remount rebuilds the DOM from scratch — the signature cache must not tell the first
    // _refreshSummary the fresh tree is already right.
    this._summarySig = null;
    rootEl.appendChild(recap);
    // Cause, sortie and damage read in the title; they are kept as summary keys for the refresh.
    this._summaryEls.cause = h;
    this._summaryEls.lifespan = el('span');
    this._summaryEls.damage = el('span');

    // .k-foot — the actions as words.
    const foot = el('footer', 'k-foot sf-go-foot');
    const list = el('ul', 'k-words k-words--row');
    list.setAttribute('aria-label', 'After action');
    foot.appendChild(list);

    const bRetry = wordItem(list, 'Continue from recovery berth', 'k-word--primary sf-go-retry');
    bRetry.title = 'Apply the shown recovery receipt and continue beside the named lawful dock';
    bRetry.setAttribute('aria-label', 'Continue from the recovery berth with the shown consequences');
    if (bRetry.childNodes) dressLampKey(bRetry);
    else bRetry.classList.add('orr-lampkey');
    bRetry.addEventListener('click', () => {
      // Combat owns success/failure. Success closes via player:respawn; failure surfaces a toast
      // (and player:recoveryFailed) so a dead latch never looks like a no-op button.
      cue('confirm');
      ctx.bus.emit('player:recoveryRequested', { source: 'after_action' });
    });
    this._retryButton = bRetry;

    const bLoad = wordItem(list, 'Load save');
    bLoad.title = 'Open saved games without applying recovery consequences';
    bLoad.setAttribute('aria-label', 'Load save instead of recovering this ship');
    bLoad.addEventListener('click', () => {
      cue('confirm');
      const mgr = getManager(ctx);
      if (mgr && mgr.pushScreen) mgr.pushScreen('saveLoad');
      else ctx.bus.emit('ui:pushScreen', { id: 'saveLoad' });
    });
    this._loadButton = bLoad;

    const bNew = wordItem(list, 'New Game');
    bNew.title = 'Start a fresh run';
    bNew.setAttribute('aria-label', 'Start a fresh run');
    bNew.addEventListener('click', () => {
      cue('confirm');
      const mgr = getManager(ctx);
      // A fresh new game clears the dead run; main.js's game:new handler resets all run state.
      ctx.bus.emit('game:over:dismissed', {});
      const difficulty = ctx.state && ctx.state.settings && ctx.state.settings.gameplay
        && ctx.state.settings.gameplay.difficulty || 'standard';
      ctx.bus.emit('game:new', { name: null, difficulty });
      if (mgr && mgr.popScreen) { try { mgr.popScreen(); } catch (e) {} }
    });
    this._newButton = bNew;

    // The label is what check-gameover-recovery-copy asserts in the source (and probes read in the DOM).
    const bMenu = wordItem(list, 'Main Menu / Load');
    bMenu.title = 'Return to title screen to continue or load another save';
    bMenu.setAttribute('aria-label', 'Return to title screen to continue or load another save');
    bMenu.addEventListener('click', () => {
      cue('confirm');
      if (ctx.state) ctx.state.mode = 'menu';
      ctx.bus.emit('game:over:dismissed', {});
      const mgr = getManager(ctx);
      if (mgr) {
        if (mgr.closeAll) mgr.closeAll();
        if (mgr.replaceScreen) mgr.replaceScreen('mainMenu');
        else if (mgr.pushScreen) mgr.pushScreen('mainMenu');
      }
    });
    this._menuButton = bMenu;

    // Combat alone decides whether recovery succeeded. Keep the locked screen in place on a
    // rejected/duplicate intent; close only on the canonical successful respawn receipt.
    ctx.bus.on('player:respawn', () => {
      const mgr = getManager(ctx);
      const close = popAncestorsUntilGameOverResolves(ctx, mgr);
      if (!close.dismissed) return;
      ctx.bus.emit('game:over:dismissed', {});
    });
    // Failed recovery stays on this modal. Refresh copy so Load/New paths appear if the receipt
    // was cleared, and keep the primary button available when combat re-armed from the receipt.
    ctx.bus.on('player:recoveryFailed', () => {
      this._refreshSummary(ctx);
    });

    rootEl.appendChild(foot);
    this._titleRegion = title;
    this._stageRegion = stage;
    this._footRegion = foot;
    this._refreshSummary(ctx);
  },

  onShow(ctx) {
    this._refreshSummary(ctx);
    this._armDeathSlide(ctx);
    // The cause resolves out of telemetry noise once the report is on the glass (ORRERY §4 #4).
    if (this._titleEl) this._stopTitleDecrypt = decrypt(this._titleEl, this._titleEl.textContent, { duration: 560, delay: 420 });
    // The kit's settle needs a real frame clock; the after-action unit test runs under a fake document.
    if (typeof requestAnimationFrame === 'function' && this._titleRegion) {
      settle(this._titleRegion, { from: 'left', state: 'gameover-title' });
      settle(this._stageRegion, { from: 'left', delay: 60, state: 'gameover-stage' });
      settle(this._footRegion, { from: 'bottom', delay: 120, state: 'gameover-foot' });
      cue('open');
    }
    if (this._defaultButton) {
      try { this._defaultButton.focus({ preventScroll: true }); } catch (e) { try { this._defaultButton.focus(); } catch (err) {} }
    }
  },

  onHide() {
    if (this._slideTimer) {
      clearTimeout(this._slideTimer);
      this._slideTimer = null;
    }
    this._endDeathSlide();
  },

  _armDeathSlide(ctx) {
    const settings = ctx && ctx.state && ctx.state.settings;
    const root = this._rootEl;
    if (!settings || !root) return;
    const video = settings.video || {};
    const access = settings.accessibility || {};
    if (video.motionReduce || video.flashReduce || access.flashReduce) return;
    if (this._slideTimer) clearTimeout(this._slideTimer);
    root.classList.remove('k-screen--cold');
    const hidden = [];
    for (const child of root.children) {
      if (!child || !child.style) continue;
      hidden.push(child);
      child.style.visibility = 'hidden';
    }
    this._slideHidden = hidden;
    this._slideTimer = setTimeout(() => this._endDeathSlide(), 400);
  },

  _endDeathSlide() {
    const root = this._rootEl;
    if (root) root.classList.add('k-screen--cold');
    const hidden = this._slideHidden;
    if (hidden) {
      for (const child of hidden) child.style.visibility = '';
      this._slideHidden = null;
    }
    this._slideTimer = null;
  },
  refresh(ctx) { this._refreshSummary(ctx); },

  /** The career record: lifetime figures the player earned before this loss. */
  _refreshRecap(ctx) {
    const rows = this._recapRows;
    if (!rows) return;
    const state = ctx && ctx.state || {};
    const stats = state.player && state.player.stats || {};
    const count = (n) => Math.max(0, Math.round(Number(n) || 0)).toLocaleString();
    const items = [
      ['Time flown', fmtTime(state.meta && state.meta.playtimeS)],
      ['This hull lasted', lastDeathSummary(ctx).lifespan],
      ['Contracts done', count(stats.missionsDone)],
      ['Kills', count(stats.kills)],
      ['Trades', count(stats.tradesCount)],
      ['Lifetime profit', fmtCr(stats.lifetimeProfit)],
      ['Best single trade', fmtCr(stats.biggestSingleProfit)],
    ];
    rows.textContent = '';
    // Each figure is a station round the ring (a dt/dd pair in its own group, so the list still reads
    // as the career record); counts and credits roll up to their value like mechanical counters.
    const rolls = typeof requestAnimationFrame === 'function';
    items.forEach(([label, value], order) => {
      const bearing = RING_STATIONS[label];
      const station = el('div', 'sf-go-st' + (bearing == null ? ' sf-go-st--hub' : '')
        + (label === 'This hull lasted' ? ' sf-go-st--lost' : ''));
      if (station.style && typeof station.style.setProperty === 'function') station.style.setProperty('--i', String(order));
      if (bearing != null && station.style && typeof station.style.setProperty === 'function') {
        const rad = (bearing * Math.PI) / 180;
        station.style.setProperty('--sx', Math.sin(rad).toFixed(4));
        station.style.setProperty('--sy', (-Math.cos(rad)).toFixed(4));
        station.dataset.side = bearing > 10 && bearing < 170 ? 'right' : bearing > 190 && bearing < 350 ? 'left' : 'mid';
      }
      station.appendChild(el('dt', 'sf-go-recap__k', label));
      const dd = el('dd', 'sf-go-recap__v', '');
      const money = /^([\d,]+) cr$/.exec(value);
      if (rolls && money) {
        const n = el('span', 'sf-go-n', '');
        dd.appendChild(n);
        dd.appendChild(el('span', 'sf-go-u', 'cr'));
        rollTo(n, Number(money[1].replace(/,/g, '')));
      } else if (rolls && /^[\d,]+$/.test(value)) {
        const n = el('span', 'sf-go-n', '');
        dd.appendChild(n);
        rollTo(n, Number(value.replace(/,/g, '')));
      } else dd.textContent = value;
      station.appendChild(dd);
      rows.appendChild(station);
    });
    const player = state.player || {};
    const owned = Array.isArray(player.ownedShips) ? player.ownedShips : [];
    const ship = owned[Number.isInteger(player.activeShipIndex) ? player.activeShipIndex : 0] || owned[0] || null;
    const hullId = (ship && typeof ship.defId === 'string' && ship.defId) || NEW_GAME.shipId;
    this._paintCareerRing(Number(state.meta && state.meta.playtimeS) || 0, parseDurationS(lastDeathSummary(ctx).lifespan), hullId);
  },

  /** The ring the career record stands round: the career's time as one closed track with a bezel of
   *  ticks; the lost hull's life the red arc that ends it at the top (its share of the career), and
   *  the red loss tick at the top. Nothing is drawn without SVG (the node tests' document). */
  _paintCareerRing(playtimeS, lifespanS, hullId) {
    const host = this._ringEl;
    const doc = globalThis.document;
    if (!host || !doc || typeof doc.createElementNS !== 'function' || typeof host.replaceChildren !== 'function') return;
    const root = svg('svg', { class: 'orr-svg sf-go-ring__svg', viewBox: '-120 -120 240 240', 'aria-hidden': 'true', focusable: 'false' });
    const r = 100;
    root.appendChild(svg('path', { d: ticksD(0, 0, r + 9, 60, { len: 3, major: 5, majorLen: 7, inward: true }), class: 'sf-go-ring__ticks' }));
    // a lit band between the track and the inner ring (one annulus, even-odd)
    root.appendChild(svg('path', { d: `${arcD(0, 0, r - 1, 0, 360)} ${arcD(0, 0, r - 21, 0, 360)}`, 'fill-rule': 'evenodd', class: 'sf-go-ring__band' }));
    root.appendChild(svg('circle', { cx: 0, cy: 0, r, class: 'sf-go-ring__track' }));
    root.appendChild(svg('circle', { cx: 0, cy: 0, r: r - 22, class: 'sf-go-ring__inner' }));
    const share = playtimeS > 0 && lifespanS != null ? Math.max(0.012, Math.min(1, lifespanS / playtimeS)) : null;
    if (playtimeS > 0) {
      const lostFrom = share == null ? 360 : 360 - share * 360;
      if (lostFrom > 0.5) {
        const career = arcD(0, 0, r, 0, lostFrom - (share == null ? 0 : 1.2));
        root.appendChild(svg('path', { d: career, class: 'sf-go-ring__bloom orr-draw', pathLength: 1 }));
        root.appendChild(svg('path', { d: career, class: 'sf-go-ring__career orr-draw', pathLength: 1 }));
      }
      // one ice pulse runs the career round on arrival and dies at the loss
      if (lostFrom > 0.5) root.appendChild(svg('path', { d: arcD(0, 0, r, 0, Math.max(1, lostFrom - 1.2)), class: 'sf-go-ring__sweep', pathLength: 1 }));
      if (share != null) {
        const lost = arcD(0, 0, r, lostFrom, 359.999);
        root.appendChild(svg('path', { d: lost, class: 'sf-go-ring__lost-bloom' }));
        root.appendChild(svg('path', { d: lost, class: 'sf-go-ring__lost' }));
      }
    }
    // the loss: a red tick across the ring at the top, where the career stopped
    const [x0, y0] = polar(0, 0, r - 9, 0);
    const [x1, y1] = polar(0, 0, r + 12, 0);
    root.appendChild(svg('path', { d: `M ${x0} ${y0} L ${x1} ${y1}`, class: 'sf-go-ring__stop' }));
    // the hull that was lost, at the hub: its produced plan view, cooled, under the time flown
    const art = hullPosterUrl(hullId, 'top');
    const nodes = [root];
    if (art) {
      const img = el('img', 'sf-go-ring__hull');
      img.alt = '';
      img.decoding = 'async';
      img.draggable = false;
      img.src = art;
      nodes.unshift(img);
    }
    host.replaceChildren(...nodes);
  },

  /** Restore is the one Lamp Key: the recovery berth when there is one, else the route the screen
   *  focuses (Load save, or New Game in Ironman). The other words are small verbs with a notch. */
  _dressRestore(primary) {
    for (const button of [this._retryButton, this._loadButton, this._newButton, this._menuButton]) {
      if (!button || !button.classList) continue;
      if (button === primary) {
        if (!button._orrDressed && button.childNodes) { dressLampKey(button); button._orrDressed = true; }
        button.classList.add('orr-lampkey');
        button.classList.remove('sf-go-verb');
        // restore leads the row (and the tab order), whichever route it is
        const li = button._kItem;
        const list = li && li.parentNode;
        if (list && typeof list.insertBefore === 'function' && list.firstChild !== li) list.insertBefore(li, list.firstChild);
      } else {
        button.classList.remove('orr-lampkey');
        button.classList.add('sf-go-verb');
      }
    }
  },

  _refreshSummary(ctx) {
    const els = this._summaryEls;
    if (!els) return;
    const state = ctx && ctx.state || {};
    const receipt = currentDefeat(ctx);
    const recovery = receipt && receipt.recovery || {};
    const difficulty = state.settings && state.settings.gameplay && state.settings.gameplay.difficulty;
    const death = lastDeathSummary(ctx);
    const stats = state.player && state.player.stats || {};
    const vitals = receipt && receipt.vitalsPct || {};
    // The shell repaints the open screen ~3x/sec as refresh(ctx, { periodic: true }), and the
    // screen-import check pins refresh() to a bare `this._refreshSummary(ctx)` call, so the
    // periodic skip lives here as a content signature — the same gate footprint/mainMenu use.
    // Everything on this surface is static after death; the one live update
    // (player:recoveryFailed) lands in the receipt fields the signature covers. An unchanged
    // signature means the DOM already says it: no 14-node recap rebuild, no recovery innerHTML
    // re-parse.
    const sig = [
      difficulty, death.cause, death.lifespan, state.meta && state.meta.playtimeS,
      stats.missionsDone, stats.kills, stats.tradesCount,
      stats.lifetimeProfit, stats.biggestSingleProfit,
      receipt ? 1 : 0,
      receipt && receipt.fatalSummary, receipt && receipt.cause, receipt && receipt.direction,
      receipt && receipt.dominantLayer, receipt && receipt.subsystemId,
      vitals.shield, vitals.armor, vitals.hull,
      recovery.stationName, recovery.stationId, recovery.costCr, recovery.quotedCostCr,
      recovery.hardshipCoveredCr, recovery.cargoLostQty, recovery.persistentCargoProtected,
      recovery.insuranceStatus,
    ].join('|');
    if (sig === this._summarySig) return;
    this._summarySig = sig;
    this._refreshRecap(ctx);
    const ironman = difficulty === 'ironman';
    const recoverable = !ironman && !!receipt;
    const cargoLost = Math.max(0, Number(recovery.cargoLostQty) || 0);
    const protectedQty = Math.max(0, Number(recovery.persistentCargoProtected) || 0);
    const cargoText = cargoLost > 0
      ? cargoLost + 'u lost' + (protectedQty > 0 ? ' · ' + protectedQty + 'u protected' : '')
      : 'No cargo lost';
    const charged = Math.max(0, Number(recovery.costCr) || 0);
    const quoted = Math.max(charged, Number(recovery.quotedCostCr) || 0);
    const recoveryFund = Math.max(0, Number(recovery.hardshipCoveredCr) || 0);
    const costText = recoveryFund > 0
      ? `${fmtCr(charged)} charged · ${fmtCr(quoted)} quote · ${fmtCr(recoveryFund)} recovery fund`
      : fmtCr(charged);
    const values = {
      cause: receipt && (receipt.fatalSummary || receipt.cause) || death.cause,
      lifespan: death.lifespan,
      damage: receipt ? [
        receipt.direction,
        String(receipt.dominantLayer || 'hull').toUpperCase(),
        receipt.subsystemId && String(receipt.subsystemId).replace(/_/g, ' ').toUpperCase(),
        receipt.vitalsPct && `S${receipt.vitalsPct.shield}% A${receipt.vitalsPct.armor}% H${receipt.vitalsPct.hull}%`,
      ].filter(Boolean).join(' · ') : 'Unresolved',
      dock: recovery.stationName || 'No recovery route',
      cost: recovery.costCr != null ? costText : '-',
      cargo: cargoText,
      insurance: recovery.insuranceStatus || 'No recovery coverage',
    };
    for (const key in values) {
      if (key === 'cause') continue; // the title carries the cause (below)
      const text = key === 'insurance' ? LABEL.insurance + ': ' + values[key] : values[key];
      if (els[key] && els[key].textContent !== text) els[key].textContent = text;
    }
    // The named recovery berth is a station door, not just a caption.
    if (els.dock && recovery.stationId) decorateEntityNode(els.dock, 'station:' + recovery.stationId);
    // No recovery cost to report: the readout leaves the report instead of showing a lone dash.
    const costHero = els.cost && typeof els.cost.closest === 'function' ? els.cost.closest('.k-hero') : null;
    if (costHero) costHero.hidden = values.cost === '-';
    // The display line is the cause itself; the caps kicker above it carries the verdict.
    const verdict = ironman ? 'Run Over' : 'Ship Lost';
    if (this._kickerEl) {
      const kicker = verdict + ' · ' + lower(LABEL.cause);
      if (this._kickerEl.textContent !== kicker) this._kickerEl.textContent = kicker;
    }
    if (this._titleEl) {
      const cause = String(values.cause || '');
      // With no recorded cause the title says so (the kicker above already carries the verdict).
      const text = cause && !/^unknown loss$/i.test(cause) ? cause : 'Cause unrecorded';
      // A running decrypt would land its old word after this one: retire it first.
      if (this._stopTitleDecrypt) { this._stopTitleDecrypt(); this._stopTitleDecrypt = null; }
      if (this._titleEl.textContent !== text) this._titleEl.textContent = text;
    }
    if (this._lineEl) {
      // A missing value drops its pair; an empty line hides, never prints a dash as data.
      const pairs = [];
      if (values.lifespan && values.lifespan !== '-') pairs.push(LABEL.lifespan + ' ' + values.lifespan);
      if (values.damage && values.damage !== 'Unresolved') pairs.push(lower(LABEL.damage) + ' ' + lower(values.damage));
      const text = pairs.join(' · ');
      if (this._lineEl.textContent !== text) this._lineEl.textContent = text;
      this._lineEl.hidden = !text;
    }
    if (this._subEl) {
      this._subEl.textContent = ironman
        ? 'Your ship was lost. In Ironman, death is final.'
        : recoverable
        ? 'Flight controls locked. Review the loss, then continue from the lawful recovery berth.'
        : 'Recovery receipt unavailable. Load a save or start a new run.';
    }
    if (this._recoveryEl) {
      if (recoverable) {
        const dockHtml = recovery.stationId
          ? entitySpanHtml('station:' + recovery.stationId, escapeHtml(recovery.stationName || 'lawful dock'))
          : escapeHtml(recovery.stationName || 'lawful dock');
        this._recoveryEl.innerHTML = `RECOVERY BERTH · ${dockHtml} · ${escapeHtml(costText)} · ${escapeHtml(cargoText)}`;
      } else {
        this._recoveryEl.textContent = ironman
          ? 'This is Ironman mode: Casual, Standard, and Veteran deaths use insurance respawn, but this save is sealed. New Game starts fresh; Main Menu lets you Continue or Load another save.'
          : 'No recovery consequences were applied. Load a valid save or begin a new run.';
      }
    }
    setWordHidden(this._retryButton, !recoverable);
    setWordHidden(this._loadButton, false);
    setWordHidden(this._newButton, recoverable);
    setWordHidden(this._menuButton, recoverable);
    this._defaultButton = recoverable ? this._retryButton : ironman ? this._newButton : this._loadButton;
    this._dressRestore(this._defaultButton);
  },
};
