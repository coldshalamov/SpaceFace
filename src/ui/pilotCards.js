// OVH-01b — the Pilot Tree's three cards (design/overhaul/04_SWARM.md §2–§3).
//
// The sim deals; the screen never does. The run owner puts a hand in state.run.pilot.offer the
// moment a pick is banked (and again after each choice while picks wait). This module only decides
// WHEN to show that hand and asks the owner, through intents on the bus, to act on it:
//   run:pilotCardRequested { index }   — take card `index` of the hand
//   run:pilotRerollRequested {}        — pay Scrap for a fresh hand
// It never calls drawPilotOffer / choosePilotCard / rerollPilotOffer.
//
// Three exports carry the feature:
//   * pilotCardFace / readPilotHand / pilotBreathSeconds — pure, no DOM;
//   * createPilotCardsView — the one card layout, mounted by both homes below;
//   * pilotCardsScreen     — the breath: a modal pushed over the between-round draft, so the hand is
//                            resolved first and the draft is revealed when the cards close;
//   * createPilotBreathController — owned by survivalHud's tick: pushes the breath at the round's
//                            end and, for the "Pick at once" setting, raises the same cards over
//                            the fight with the presented clock at 15 %.

import { getPilotCard, PILOT_BRANCHES, PILOT_REROLL_SCRAP, pilotPoints } from '../data/pilotTree.js';
import { createTimeEffects } from '../core/timeEffects.js';
import { dpIcon } from './deckplate/icons.js';
import { cue } from './kit/index.js';
import { PILOT_CARDS_CSS, PILOT_CARDS_STYLE_ID } from './pilotCardsCss.js';

export const PILOT_CARDS_SCREEN_ID = 'pilotCards';
export const PILOT_CARD_INTENT = 'run:pilotCardRequested';
export const PILOT_REROLL_INTENT = 'run:pilotRerollRequested';
/** The breath is over (a card taken to the last pick, or Later): the run may start the next round. */
export const PILOT_BREATH_END_INTENT = 'run:breathEndRequested';
/** Time-effects source the "Pick at once" slowdown owns. */
export const PILOT_PICK_TIME_SOURCE = 'ui:pilot-pick';
export const PILOT_PICK_TIME_SCALE = 0.15;
/** Retired timing (kept for callers that still read it): the breath used to close itself after
 *  4 s, stretching 2 s per extra waiting pick up to 10 s. Since 2026-11-20 it never auto-closes. */
export const PILOT_BREATH_BASE_S = 4;
export const PILOT_BREATH_STEP_S = 2;
export const PILOT_BREATH_MAX_S = 10;
/** How long an intent may go unanswered before the card says it did not register. */
const PENDING_GIVE_UP_MS = 1500;

export function pilotBreathSeconds(banked) {
  const waiting = Number.isInteger(banked) && banked > 1 ? banked - 1 : 0;
  return Math.min(PILOT_BREATH_MAX_S, PILOT_BREATH_BASE_S + PILOT_BREATH_STEP_S * waiting);
}

// One colour and one icon per branch. The branch NAME always prints beside the colour, so colour
// is never the only channel.
export const BRANCH_LOOK = Object.freeze({
  gunner: Object.freeze({ color: '#f2b950', icon: 'weapon' }),
  bruiser: Object.freeze({ color: '#ff6f4a', icon: 'repel' }),
  rigger: Object.freeze({ color: '#4fd3e8', icon: 'line' }),
  conjurer: Object.freeze({ color: '#b68cff', icon: 'well' }),
  juggernaut: Object.freeze({ color: '#86d96f', icon: 'shield' }),
  ghost: Object.freeze({ color: '#9fb6dc', icon: 'offline' }),
  trader: Object.freeze({ color: '#e7c873', icon: 'cargo' }),
  prospector: Object.freeze({ color: '#dba466', icon: 'mining' }),
  builder: Object.freeze({ color: '#8fc7a8', icon: 'industry' }),
});
export const EVOLUTION_LOOK = Object.freeze({ color: '#ffd77a', icon: 'spark' });
const BRANCH_BY_ID = new Map(PILOT_BRANCHES.map((branch) => [branch.id, branch]));
const PIP_COUNT = 6;

const TIER_TAG = Object.freeze({ 1: 'Tier 1', 2: 'Tier 2', 3: 'Tier 3', capstone: 'Capstone' });

function branchRead(state, branchId) {
  const branch = BRANCH_BY_ID.get(branchId);
  return { id: branchId, name: branch ? branch.name : String(branchId), points: pilotPoints(state, branchId) };
}

/** One card's face: everything the screen prints, from the engine's own record. Pure. */
export function pilotCardFace(state, id) {
  const card = getPilotCard(id);
  if (!card) return null;
  const evolution = card.kind === 'evolution';
  const branches = evolution
    ? card.requires.map((branchId) => branchRead(state, branchId))
    : [branchRead(state, card.branch)];
  const look = evolution ? EVOLUTION_LOOK : (BRANCH_LOOK[card.branch] || BRANCH_LOOK.gunner);
  const second = evolution ? (BRANCH_LOOK[card.requires[1]] || look) : null;
  return {
    id: card.id,
    name: card.name,
    text: card.text,
    kind: evolution ? 'evolution' : 'node',
    tier: evolution ? null : card.tier,
    frame: evolution ? 'evolution' : (card.tier === 'capstone' ? 'capstone' : 'standard'),
    tag: evolution ? 'Evolution' : (TIER_TAG[card.tier] || ''),
    color: evolution ? (BRANCH_LOOK[card.requires[0]] || look).color : look.color,
    color2: second ? second.color : null,
    icon: look.icon,
    branches,
    // "Knockback 3" — or, for an evolution, both parents: "Guns 5 · Line 5".
    branchLine: branches.map((b) => `${b.name} ${b.points}`).join(' · '),
  };
}

/**
 * The hand the owner has dealt, ready to print — or null. A hand needs a banked pick and at least
 * one card the tree knows; a hand with nothing to choose is no breath at all.
 */
export function readPilotHand(state) {
  const run = state && state.run;
  const pilot = run && run.pilot;
  const offer = pilot && pilot.offer;
  if (!offer || !Array.isArray(offer.cards) || !(pilot.banked > 0)) return null;
  const faces = offer.cards.map((id) => pilotCardFace(state, id)).filter(Boolean);
  if (!faces.length) return null;
  const credits = Number.isFinite(run.credits) ? Math.max(0, Math.floor(run.credits)) : 0;
  return {
    faces,
    ids: faces.map((face) => face.id),
    rerolls: Number.isInteger(offer.rerolls) ? offer.rerolls : 0,
    banked: pilot.banked,
    level: Number.isInteger(run.level) ? run.level : null,
    credits,
    price: PILOT_REROLL_SCRAP,
    canReroll: credits >= PILOT_REROLL_SCRAP,
    signature: `${faces.map((face) => face.id).join('|')}#${Number.isInteger(offer.rerolls) ? offer.rerolls : 0}`,
  };
}

export function reducedMotionOn(doc) {
  const root = doc && doc.documentElement;
  return !!(root && root.classList && typeof root.classList.contains === 'function'
    && root.classList.contains('sf-reduce-motion'));
}

export function injectPilotCardsCss(doc) {
  if (!doc || !doc.head || typeof doc.createElement !== 'function') return;
  if (typeof doc.getElementById === 'function' && doc.getElementById(PILOT_CARDS_STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = PILOT_CARDS_STYLE_ID;
  style.textContent = PILOT_CARDS_CSS;
  doc.head.appendChild(style);
}

function make(doc, tag, className, text) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text != null && text !== '') node.textContent = String(text);
  return node;
}

function scrapWord(n) { return `${Number(n).toLocaleString('en-US')} Scrap`; }

/**
 * The card layout, shared by the breath screen and the "Pick at once" overlay.
 *   mode 'screen'  — a timed breath (4 s, up to 10 s while picks wait); Esc / "Later" closes it.
 *   mode 'overlay' — no timer; the fight runs slowed until a card is taken or "Later" is pressed.
 * `host` receives the root. `onClose(reason)` fires once when the view has nothing left to show
 * ('done') or the player sent it away ('later' / 'timeout').
 */
export function createPilotCardsView({ state, bus, host, doc = globalThis.document, mode = 'screen', onClose, now = () => Date.now() }) {
  injectPilotCardsCss(doc);
  const root = make(doc, 'section', `pc pc--${mode}`);
  root.dataset.pilotCards = mode;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', mode === 'screen' ? 'true' : 'false');
  root.setAttribute('aria-labelledby', 'pc-title');
  const head = make(doc, 'header', 'pc__head');
  const kicker = make(doc, 'span', 'pc__kicker');
  const title = make(doc, 'h2', 'pc__title');
  title.id = 'pc-title';
  const sub = make(doc, 'p', 'pc__sub');
  head.append(kicker, title, sub);
  const hand = make(doc, 'div', 'pc__hand');
  hand.setAttribute('role', 'group');
  hand.setAttribute('aria-label', 'Pilot cards');
  const status = make(doc, 'p', 'pc__status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const bar = make(doc, 'div', 'pc__bar');
  const reroll = make(doc, 'button', 'pc__key2');
  reroll.type = 'button';
  reroll.dataset.action = 'reroll';
  const rerollWord = make(doc, 'span', 'pc__reroll-word', 'Re-roll');
  const rerollPrice = make(doc, 'span', 'pc__price');
  const rerollKey = make(doc, 'kbd', '', 'R');
  reroll.append(rerollKey, rerollWord, rerollPrice);
  const purse = make(doc, 'span', 'pc__purse');
  const timer = make(doc, 'div', 'pc__timer');
  const timerWord = make(doc, 'span', 'pc__timer-word');
  const track = make(doc, 'span', 'pc__track');
  const fill = make(doc, 'span', 'pc__fill');
  track.appendChild(fill);
  timer.append(timerWord, track);
  const later = make(doc, 'button', 'pc__key2');
  later.type = 'button';
  later.dataset.action = 'later';
  later.append(make(doc, 'kbd', '', 'Esc'), make(doc, 'span', '', 'Later'));
  bar.append(reroll, purse, timer, later);
  root.append(head, hand, status, bar);
  // No clock in either mode (director, 2026-11-20): the player reads until they take a card or
  // press Later, which leaves the pick banked. A card that closes itself mid-sentence is a lost pick.
  timer.hidden = true;
  if (host && typeof host.appendChild === 'function') host.appendChild(root);

  let current = null;       // the hand last drawn
  let cards = [];           // the card buttons, in the hand's order
  let pending = null;       // { signature, at, kind }
  let deadline = 0;
  let breathMs = 0;
  let closed = false;
  let lastSecond = -1;
  let lastFillPct = -1;
  let generation = 0;

  function emit(event, payload) {
    if (bus && typeof bus.emit === 'function') bus.emit(event, payload);
  }

  function close(reason) {
    if (closed) return;
    closed = true;
    if (typeof onClose === 'function') onClose(reason);
  }

  function buildCard(face, index) {
    const card = make(doc, 'button', 'pc__card');
    card.type = 'button';
    card.dataset.index = String(index);
    card.dataset.nodeId = face.id;
    card.dataset.frame = face.frame;
    card.dataset.branch = face.kind === 'evolution' ? 'evolution' : face.branches[0].id;
    card.style.setProperty('--pc', face.color);
    if (face.color2) card.style.setProperty('--pc2', face.color2);
    card.style.setProperty('--pc-i', String(index));
    card.setAttribute('aria-label', `${index + 1}. ${face.name}. ${face.branchLine}. ${face.text}`);
    const top = make(doc, 'span', 'pc__top');
    const icon = make(doc, 'span', 'pc__icon');
    icon.innerHTML = dpIcon(face.icon, 40);
    const where = make(doc, 'span', 'pc__where');
    const branchLine = make(doc, 'span', 'pc__branch');
    if (face.kind === 'evolution') {
      branchLine.textContent = face.branchLine;
    } else {
      const b = face.branches[0];
      branchLine.append(`${b.name}`, make(doc, 'b', '', String(b.points)));
    }
    where.appendChild(branchLine);
    if (face.kind !== 'evolution') {
      const pips = make(doc, 'span', 'pc__pips');
      const held = face.branches[0].points;
      for (let i = 0; i < PIP_COUNT; i += 1) {
        const pip = make(doc, 'span', 'pc__pip');
        if (i < held) pip.dataset.held = '1';
        else if (i === held) pip.dataset.next = '1';
        pips.appendChild(pip);
      }
      where.appendChild(pips);
    }
    top.append(icon, where, make(doc, 'span', 'pc__tag', face.tag));
    const name = make(doc, 'strong', 'pc__name', face.name);
    const text = make(doc, 'span', 'pc__text', face.text);
    const foot = make(doc, 'span', 'pc__foot');
    foot.append(make(doc, 'span', 'pc__key', String(index + 1)), make(doc, 'span', 'pc__take', 'Take'));
    card.append(top, name, text, foot);
    card.addEventListener('click', () => choose(index));
    return card;
  }

  function startBreath(hand0) {
    // The breath no longer times out; `deadline` stays 0 so tick never closes the cards.
    void hand0;
    deadline = 0;
    breathMs = 0;
    lastSecond = -1;
    lastFillPct = -1;
  }

  /**
   * Give the still-standing hand a full breath again. A screen can be hidden by an external
   * stack pop (never through its own close), which leaves the old wall-clock deadline in the
   * past; re-showing must not then close the cards on their first tick.
   */
  function restartBreath(hand0 = current) {
    if (mode !== 'screen' || closed || !hand0) return false;
    startBreath(hand0);
    return true;
  }

  function render() {
    if (closed) return false;
    const next = readPilotHand(state);
    if (!next) { close('done'); return false; }
    const fresh = !current || next.signature !== current.signature;
    if (fresh) {
      generation += 1;
      hand.replaceChildren();
      cards = next.faces.map((face, index) => buildCard(face, index));
      for (const card of cards) hand.appendChild(card);
      hand.dataset.count = String(cards.length);
      hand.dataset.generation = String(generation);
      pending = null;
      status.textContent = '';
      if (!current || next.banked !== current.banked || next.ids.join() !== current.ids.join()) startBreath(next);
      if (!current) {
        // The first card takes the keyboard so Enter/Space and the pad's accept have a target.
        const first = cards[0];
        if (first && typeof first.focus === 'function') { try { first.focus({ preventScroll: true }); } catch { /* no focus in this host */ } }
      }
    }
    current = next;
    kicker.textContent = next.level != null ? `Level ${next.level}` : 'Level up';
    title.textContent = 'Pick one';
    sub.textContent = next.banked > 1 ? `${next.banked} picks waiting` : '1 pick waiting';
    rerollPrice.textContent = scrapWord(next.price);
    rerollPrice.className = 'pc__price';
    reroll.setAttribute('aria-disabled', next.canReroll ? 'false' : 'true');
    reroll.title = next.canReroll ? '' : `Re-roll needs ${scrapWord(next.price)}`;
    purse.textContent = next.canReroll ? `${scrapWord(next.credits)} in the purse`
      : `${scrapWord(next.credits)} in the purse — ${scrapWord(next.price - next.credits)} short`;
    purse.className = next.canReroll ? 'pc__purse' : 'pc__purse pc__purse--short';
    return true;
  }

  function sendPending(kind) {
    pending = { signature: current.signature, at: now(), kind };
  }

  function choose(index) {
    if (closed || !current || !Number.isInteger(index) || index < 0 || index >= current.faces.length) return false;
    if (pending) return false;
    sendPending('card');
    cue('confirm');
    emit(PILOT_CARD_INTENT, { index });
    return true;
  }

  function doReroll() {
    if (closed || !current || pending) return false;
    if (!current.canReroll) {
      status.textContent = `Re-roll needs ${scrapWord(current.price)} — you have ${scrapWord(current.credits)}.`;
      cue('deny');
      return false;
    }
    sendPending('reroll');
    cue('move');
    emit(PILOT_REROLL_INTENT, {});
    return true;
  }

  function dismiss(reason = 'later') { close(reason); }

  reroll.addEventListener('click', () => { doReroll(); });
  later.addEventListener('click', () => dismiss('later'));

  // The owner's refusals, in words (OVH-01a2 receipts). The 1.5 s give-up below stays as the
  // fallback for an intent nobody answered.
  const CARD_REFUSAL = Object.freeze({
    no_offer: 'That hand has closed.',
    invalid_index: 'That card is no longer in the hand.',
    not_eligible: 'That card can no longer be taken.',
  });
  const unsubs = [];
  if (bus && typeof bus.on === 'function') {
    const listen = (event, fn) => { const off = bus.on(event, fn); if (typeof off === 'function') unsubs.push(off); };
    listen('run:pilotCardRejected', (p) => {
      if (closed || !pending || pending.kind !== 'card') return;
      pending = null;
      status.textContent = CARD_REFUSAL[p && p.reason] || 'That pick was refused.';
      cue('deny');
    });
    listen('run:pilotRerollRejected', (p) => {
      if (closed || !pending || pending.kind !== 'reroll') return;
      pending = null;
      status.textContent = p && p.reason === 'insufficient_credits'
        ? `Re-roll needs ${scrapWord(p.price ?? PILOT_REROLL_SCRAP)} — you have ${scrapWord(p.credits ?? 0)}.`
        : p && p.reason === 'nothing_eligible' ? 'Nothing else can be dealt.' : 'The re-roll was refused. No Scrap was spent.';
      cue('deny');
    });
  }

  /** Keyboard: 1/2/3 take, R re-rolls, Esc sends the breath away. Returns true when it owned the key. */
  function key(ev) {
    if (closed || !ev || ev.altKey || ev.ctrlKey || ev.metaKey) return false;
    const k = ev.key;
    const index = '123'.indexOf(k);
    if (k && k.length === 1 && index >= 0) {
      if (index < (current ? current.faces.length : 0)) { choose(index); return true; }
      return true; // a digit with no card is still this screen's, never flight's ordnance key
    }
    if (k === 'r' || k === 'R') { doReroll(); return true; }
    if (k === 'Escape') { dismiss('later'); return true; }
    return false;
  }

  /** Drive: poll the run for a changed hand, and time the breath. Returns false once closed. */
  function tick(nowMs = now()) {
    if (closed) return false;
    if (!render()) return false;
    if (pending && nowMs - pending.at > PENDING_GIVE_UP_MS) {
      status.textContent = pending.kind === 'card'
        ? 'That pick did not register — press it again.'
        : 'The re-roll did not go through. No Scrap was spent.';
      pending = null;
    }
    if (mode === 'screen' && deadline) {
      // A transient UI hold (the bench and the tests set it) keeps the breath open for a still.
      if (state.ui && state.ui.pilotBreathHold === true) deadline = nowMs + breathMs;
      const left = Math.max(0, deadline - nowMs);
      const seconds = Math.ceil(left / 1000);
      if (seconds !== lastSecond) { lastSecond = seconds; timerWord.textContent = `Closes in ${seconds} s`; }
      const pct = Math.round((left / Math.max(1, breathMs)) * 100);
      if (pct !== lastFillPct) { lastFillPct = pct; fill.style.width = `${pct}%`; }
      if (left <= 0) { close('timeout'); return false; }
    }
    return !closed;
  }

  function focusIndex(delta) {
    if (!cards.length) return;
    const active = doc.activeElement;
    const at = cards.indexOf(active);
    const to = at < 0 ? 0 : (at + delta + cards.length) % cards.length;
    if (typeof cards[to].focus === 'function') cards[to].focus();
  }

  function destroy() {
    closed = true;
    while (unsubs.length) { try { unsubs.pop()(); } catch { /* a bus already torn down */ } }
    if (root.parentNode) root.parentNode.removeChild(root);
  }

  render();
  return {
    root, render, tick, choose, reroll: doReroll, dismiss, key, destroy, focusIndex, restartBreath,
    get cards() { return cards; },
    get hand() { return current; },
    get closed() { return closed; },
    elements: { kicker, title, sub, hand, status, reroll, rerollPrice, purse, timer, timerWord, fill, later },
  };
}

// ---------------------------------------------------------------------------------------------
// The breath: a modal screen, pushed over the between-round draft.

let screenState = null;

export const pilotCardsScreen = {
  id: PILOT_CARDS_SCREEN_ID,
  // Not a locked surface: Esc is this screen's own "Later" (it leaves the pick banked), so the
  // input owner must reach onEscape instead of trapping the key.
  data: {},

  mount(rootEl, ctx) {
    this.dispose();
    rootEl.innerHTML = '';
    rootEl.classList.add('pc-screen');
    rootEl.dataset.kReady = '0';
    const doc = rootEl.ownerDocument || globalThis.document;
    screenState = { ctx, rootEl, doc, view: null, timer: null, padHeld: { x: false } };
    this._build();
    rootEl.dataset.kReady = '1';
  },

  _build() {
    const s = screenState;
    if (!s) return;
    if (s.view) { s.view.destroy(); s.view = null; }
    const { ctx, rootEl, doc } = s;
    s.view = createPilotCardsView({
      state: ctx.state, bus: ctx.bus, host: rootEl, doc, mode: 'screen',
      onClose: () => {
        if (ctx.bus && typeof ctx.bus.emit === 'function') {
          ctx.bus.emit('ui:closeScreen', { id: PILOT_CARDS_SCREEN_ID });
          // Between rounds with no armory under the cards, the next round waits on this breath.
          ctx.bus.emit(PILOT_BREATH_END_INTENT, {});
        }
      },
    });
  },

  onShow(ctx) {
    const s = screenState;
    if (!s) return;
    if (ctx) s.ctx = ctx;
    // A screen re-shown after being hidden gets a fresh breath and a fresh read of the run.
    if (s.view && s.view.closed) this._build();
    else if (s.view) { s.view.render(); s.view.restartBreath(); }
    cue('open');
    if (s.timer) clearInterval(s.timer);
    s.timer = setInterval(() => { if (s.view) s.view.tick(Date.now()); }, 50);
    if (s.timer && typeof s.timer.unref === 'function') s.timer.unref();
    if (s.view) s.view.tick(Date.now());
  },

  onHide() {
    const s = screenState;
    if (!s) return;
    if (s.timer) { clearInterval(s.timer); s.timer = null; }
  },

  /** The input owner's lane for 1/2/3, R and Esc (src/ui/input.js routes modal keys here). */
  onKey(ev) {
    const s = screenState;
    if (!s || !s.view) return false;
    return s.view.key(ev) === true;
  },

  /**
   * Esc is this screen's own "Later": src/ui/input.js intercepts Escape before onKey, so the
   * dismissal must live here. Returning true keeps the manager from popping the screen itself
   * and stops the same key reaching flight.
   */
  onEscape() {
    const s = screenState;
    if (!s || !s.view) return false;
    s.view.dismiss('later');
    return true;
  },

  /** Pad: X re-rolls, Y sends the breath away (A / D-pad are the shared focus layer). */
  onPadButton(name, st) {
    const s = screenState;
    if (!s || !s.view || !st || !st.pressed) return;
    if (name === 'x') s.view.reroll();
    else if (name === 'y') s.view.dismiss('later');
  },

  dispose() {
    const s = screenState;
    if (!s) return;
    if (s.timer) clearInterval(s.timer);
    if (s.view) s.view.destroy();
    screenState = null;
  },
};

// ---------------------------------------------------------------------------------------------
// The controller survivalHud ticks. No per-frame DOM work: it reads state, and acts on edges.

function liveSurvival(state) {
  const run = state && state.run;
  return run && run.kind === 'survival' && run.phase !== 'inactive' && run.phase !== 'ended'
    && run.phase !== 'victory' ? run : null;
}

function screenStackOf(state) {
  const stack = state && state.ui && state.ui.screenStack;
  return Array.isArray(stack) ? stack : [];
}

/**
 * Is this the between-round stop where the cards belong? Over the armory when it is up (the
 * Bench round, or a ruleset that still shops every wave); and, for a Swarm round with no armory,
 * over the room itself while the run waits in `draft` for the breath to end.
 */
export function breathStop(run, stack) {
  if (!run) return false;
  if (stack.includes('crucibleDraft')) return true;
  return run.phase === 'draft' && run.ruleset === 'swarm' && stack.length === 0;
}

export function pilotPickAtOnceOn(state) {
  return !!(state && state.settings && state.settings.gameplay && state.settings.gameplay.pilotPickAtOnce === true);
}

/**
 * `tick(state)` is called by the run HUD every presented frame. Two jobs:
 *   1. THE BREATH — when the between-round draft screen is up and a hand waits, push the cards on
 *      top of it (once per draft), so the player resolves the hand first and the draft is
 *      revealed when the cards close.
 *   2. PICK AT ONCE — with the setting on, raise the cards over the fight the moment a hand
 *      exists, and hold the presented clock at 15 % until a card is taken (or "Later").
 */
export function createPilotBreathController({ state, bus, doc = globalThis.document, timeEffects = null, host = null }) {
  const effects = timeEffects || (state ? createTimeEffects(state) : null);
  let breathKey = null;       // the draft this breath was already pushed for
  let overlay = null;         // { view, timer }
  let dismissedSignature = null;
  let slowed = false;
  let latest = state;         // the state the run HUD last ticked with
  let breathPoll = null;
  const offs = [];

  // THE BREATH WHILE PAUSED. The run HUD's tick is a simulation system: it stops the moment the
  // between-round draft pauses the game, so a tick-only check never sees the draft go up (found in
  // a played round: level 4, three picks banked, a hand dealt, no cards). The draft's own events
  // still fire, so the opening is caught here, and a short wall-clock poll waits until the draft
  // is actually on the stack before pushing the cards on top of it.
  function tryBreath() {
    const st = latest;
    const run = liveSurvival(st);
    const hand = run ? readPilotHand(st) : null;
    if (!run || !hand) return false;
    const stack = screenStackOf(st);
    if (stack.includes(PILOT_CARDS_SCREEN_ID)) return true;
    if (!breathStop(run, stack)) return false;
    const key = `${run.seed}:${run.wave}`;
    if (breathKey === key) return true;
    breathKey = key;
    // "Pick at once" must not leave its document-capture keys and 15 % clock over a screen the
    // breath is about to push (or hand its keys to the breath's own cards).
    closeOverlay();
    if (bus && typeof bus.emit === 'function') bus.emit('ui:pushScreen', { id: PILOT_CARDS_SCREEN_ID });
    return true;
  }
  function stopBreathPoll() { if (breathPoll) { clearInterval(breathPoll); breathPoll = null; } }
  function startBreathPoll() {
    stopBreathPoll();
    let tries = 0;
    breathPoll = setInterval(() => {
      tries += 1;
      if (tryBreath() || tries >= 60) stopBreathPoll(); // ~3 s, then the next tick or draft retries
    }, 50);
    if (breathPoll && typeof breathPoll.unref === 'function') breathPoll.unref();
  }
  if (bus && typeof bus.on === 'function') {
    const listen = (event, fn) => { const off = bus.on(event, fn); if (typeof off === 'function') offs.push(off); };
    // A pausing screen, a round end or any pushed screen ends the slowed fight overlay at
    // once: its tick stops with the simulation, so a tick-only check would leave the capture
    // key handler, the timer and the 15 % clock pinned over the next screen.
    listen('sim:pause', () => closeOverlay());
    listen('run:ended', () => closeOverlay());
    listen('run:draftOffered', () => { closeOverlay(); startBreathPoll(); });
    listen('ui:pushScreen', (p) => {
      closeOverlay();
      if (p && p.id === 'crucibleDraft') startBreathPoll();
    });
  }

  function setSlow(on) {
    if (!effects || slowed === on) return;
    slowed = on;
    if (on) effects.set(PILOT_PICK_TIME_SOURCE, { scale: PILOT_PICK_TIME_SCALE });
    else effects.clear(PILOT_PICK_TIME_SOURCE);
  }

  function closeOverlay() {
    setSlow(false);
    if (!overlay) return;
    if (overlay.timer) clearInterval(overlay.timer);
    // The capture-phase key listener goes with the overlay; a fresh one is added on the next open.
    if (overlay.keyHandler && doc && typeof doc.removeEventListener === 'function') {
      doc.removeEventListener('keydown', overlay.keyHandler, true);
    }
    overlay.view.destroy();
    overlay = null;
  }

  function openOverlay(hand) {
    const target = host || (doc && doc.body);
    if (!target) return;
    const view = createPilotCardsView({
      state, bus, host: target, doc, mode: 'overlay',
      onClose: (reason) => {
        if (reason === 'later') dismissedSignature = readPilotHand(state)?.signature || null;
        // Defer teardown out of the view's own call stack.
        queueMicrotask(closeOverlay);
      },
    });
    overlay = { view, timer: null, padHeld: [false, false, false] };
    overlay.keyHandler = (ev) => { if (overlay && overlay.view.key(ev)) { ev.preventDefault(); ev.stopPropagation(); } };
    if (doc && typeof doc.addEventListener === 'function') doc.addEventListener('keydown', overlay.keyHandler, true);
    overlay.timer = setInterval(() => padPoll(), 50);
    if (overlay.timer && typeof overlay.timer.unref === 'function') overlay.timer.unref();
    setSlow(true);
    cue('open');
    void hand;
  }

  // Overlay gamepad reach: the D-pad moves between cards, A takes the focused one, X re-rolls, Y
  // sends it away — the same raw standard-mapping buttons the screen layer reads for modals.
  function padPoll() {
    if (!overlay) return;
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = Array.from(pads || []).find((p) => p && p.connected);
    if (!pad) return;
    const down = (i) => !!(pad.buttons[i] && pad.buttons[i].pressed);
    const edges = overlay.pad || (overlay.pad = {});
    const edge = (name, now) => { const was = edges[name]; edges[name] = now; return now && !was; };
    if (edge('left', down(14))) overlay.view.focusIndex(-1);
    if (edge('right', down(15))) overlay.view.focusIndex(1);
    if (edge('a', down(0))) {
      const at = overlay.view.cards.indexOf(doc.activeElement);
      overlay.view.choose(at < 0 ? 0 : at);
    }
    if (edge('x', down(2))) overlay.view.reroll();
    if (edge('y', down(3))) overlay.view.dismiss('later');
  }

  function tick(st = state) {
    if (st) latest = st;
    const run = liveSurvival(st);
    const hand = run ? readPilotHand(st) : null;
    const stack = screenStackOf(st);

    // The overlay lives only while its hand does.
    if (overlay) {
      if (!hand || !pilotPickAtOnceOn(st) || stack.length > 0 || st.mode !== 'flight') closeOverlay();
      else overlay.view.tick();
    }
    if (!run || !hand) {
      if (!stack.includes('crucibleDraft')) breathKey = null;
      if (!hand) dismissedSignature = null;
      return;
    }

    // 1. The breath, between rounds: over the armory on a Bench round, over the room otherwise.
    const draftUp = breathStop(run, stack);
    if (!draftUp) breathKey = null;
    else if (!stack.includes(PILOT_CARDS_SCREEN_ID) && breathKey !== `${run.seed}:${run.wave}`) {
      breathKey = `${run.seed}:${run.wave}`;
      if (bus && typeof bus.emit === 'function') bus.emit('ui:pushScreen', { id: PILOT_CARDS_SCREEN_ID });
      return;
    }

    // 2. Pick at once, over the fight.
    if (!overlay && pilotPickAtOnceOn(st) && stack.length === 0 && st.mode === 'flight'
      && hand.signature !== dismissedSignature) {
      openOverlay(hand);
    }
  }

  function destroy() {
    closeOverlay();
    stopBreathPoll();
    while (offs.length) { try { offs.pop()(); } catch { /* bus already gone */ } }
    breathKey = null;
  }

  return { tick, destroy, get overlayOpen() { return !!overlay; }, get slowed() { return slowed; } };
}
