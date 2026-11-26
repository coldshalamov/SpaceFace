// One teaching card at a time inside a Swarm run (owner demo 2026-11-23, DEMO-SWARM-TUTOR-1).
//
// A Swarm round opens with three separate teachers and nothing sequencing them: the round brief
// (`encounter:castAnnounced`, "A rushing pack / Catch one Wasp on the Line…"), the first-sighting
// codex line (a counter-hint) and the first-use power caption over the power bar ("Plow · 5 /
// Gathers rocks at your bow…"). On the first frame of control all three landed together, covering
// roughly a third of the arena, and the round after Again landed them all over again. A newcomer
// cannot read a fight through that.
//
// This module is the ONE door those three go through, and it is deliberately thin:
//
//   • THE LANE IS ITS OWN SEAT. Cards draw in `#sf-teach-lane`, a host this module owns in the
//     left margin — never over the fight's centre. It is NOT the Stage's `speaker` slot: that
//     seat belongs to the story's face cards, and the one-voice yield CSS (styles/hud.css) hides
//     it whenever a tell or a danger line speaks — in a Swarm fight that is most of the time, so
//     a card seated there timed out unseen while its clock ran. A teaching card is not a voice:
//     it is small, marginal and passive, so it does not enter the one-voice arbitration at all.
//     The module keeps its own one-card queue because there is no other queue for this seat —
//     one list, one owner, no second wait-map in front of the Stage.
//   • ONE CARD AT A TIME. A card offered while another is up waits in offer order; when the card
//     on the glass retires, the oldest waiting card takes the seat. The ~6 s read clock starts
//     when the card actually mounts — a card still waiting must not time out unseen.
//   • EACH CARD RETIRES WHEN ITS MECHANIC IS USED, OR AFTER ~6 s ON THE GLASS. A mechanic is
//     marked used when the player demonstrably performs it: a taught hull caught on the Line
//     (never any tether latch — a rock proves nothing about catching a Wasp), or the press of
//     the power the card names.
//   • A CARD THE PLAYER HAS ALREADY BEEN SHOWN THIS SESSION NEVER SHOWS AGAIN. That is what makes
//     Again quiet: a fresh run resets `player.hints` and survivalAnnounce's per-run hint set,
//     which is exactly why the codex and power cards used to repeat. A page session is the unit
//     a player experiences as "you already told me that". The ROUND BRIEF is the deliberate
//     exception — the player is in a new round, so its line may show again (`repeat: true`).
//
// ── The 'RMB Tow' tag is an instrument, not teaching chrome ────────────────────────────────────
//
// The packet that founded this lane counted the world-anchored latch tag ("RMB · TOW") with the
// three cards as opening-frame clutter. It is not one: it is the Line's gunsight — a small chip
// pinned to the body the Line would catch right now, answering "what will I catch" while the
// cards answer "what is worth catching". It lives in the world, not in the margin, it never
// overlaps the cards, and hiding it while the Line lesson is up would sabotage the exact verb
// the lesson asks for. It stays. (Review XR-DEMO-SWARM-TUTOR-1 row "RMB Tow tag": decided.)
//
// ── Why the state is module-level, not owned by the mount ────────────────────────────────────
//
// `ui.init()` runs again for every new game — a fresh HUD, a fresh DOM — and Again is exactly
// that: a new game. Anything a mount owns dies there, which would wipe the session memory (and
// the card on the glass) at the precise moment this packet is about. So the memory AND the cards
// still inside their read window live at module scope: `installSwarmTeaching` re-binds the lane
// to the new document and re-seats whatever is still live. One lane exists at a time.
//
// Ownership: read-only presentation. It never writes state.run and never emits a gameplay intent.

import { SWARM_TEACHING_TTL_S, SWARM_TEACH_MECHANIC, SWARM_TEACH_MECHANIC_BY_ENEMY } from '../data/swarmTeaching.js';
import { reducedMotion, settle } from './kit/motion.js';

/** How long a teaching card stays on the glass. The token table owns the number (~6 s, owner demo). */
export const SWARM_TEACHING_TTL_MS = SWARM_TEACHING_TTL_S * 1000;
/** The id of the lane's own host element — the left-margin seat, one card at a time. */
export const SWARM_TEACHING_LANE_ID = 'sf-teach-lane';
/** How long the exit fade runs once a card retires. The seat is free at once; the fade is cosmetic. */
export const SWARM_TEACHING_EXIT_MS = 180;

/** Re-exported so a caller names a mechanic from the same table the lane retires it with. */
export { SWARM_TEACH_MECHANIC };

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function wallNow() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now() : Date.now();
}

// ── session state (survives every ui.init; only a page reload clears it) ────────────────────────
const seen = new Set();            // card ids already offered this session
const usedMechanics = new Set();   // mechanics the player has actually performed
// card id -> { card, status, el, timer, exitTimer, shownAt, until } in offer order (Map order):
//   'queued'  waiting behind the card on the glass (or behind the loading veil)
//   'visible' on the glass now, read clock running
const cards = new Map();
// Cards offered while the loading veil is still up must not expire unseen behind it. The veil's
// state is read from the overlay ITSELF at seat time, never inferred from event ordering:
// game:new and the overlay's hide receipt arrive in either order across the menu and Again
// routes, so a boolean armed by one and cleared by the other deadlocks half the rounds (found live).
let veilRecheck = null;

/** Test seam: forget the whole session. Never called by the game — that is the point. */
export function resetSwarmTeachingSession() {
  seen.clear();
  usedMechanics.clear();
  for (const rec of cards.values()) {
    if (rec.timer) clearTimeout(rec.timer);
    if (rec.exitTimer) clearTimeout(rec.exitTimer);
  }
  cards.clear();
  if (veilRecheck) { clearInterval(veilRecheck); veilRecheck = null; }
}
/** Test seam: compatibility no-op — the veil is read from the overlay itself now. */
export function markSwarmTeachingVeilLifted() {}

/**
 * Offer a card to the session. Pure policy, no DOM:
 *   'accept'    the lane takes it; it seats now or waits behind the card up
 *   'spent'     this session already showed it (or the player already used its mechanic)
 *   'duplicate' the same card is already offered and still live
 */
export function offerTeachingCard(raw) {
  const id = clean(raw && raw.id);
  const line = clean(raw && raw.line);
  if (!id || !line) return 'duplicate';
  const mechanic = clean(raw.mechanic);
  const repeat = raw.repeat === true;
  // `repeat` (the round brief) is the one card exempt from both memory rules: the player is in a
  // NEW round, so its line may show again even though they have read it and used the verb it names.
  if (!repeat) {
    if (mechanic && usedMechanics.has(mechanic)) return 'spent';
    if (seen.has(id)) return 'spent';
  }
  if (cards.has(id)) return 'duplicate';
  seen.add(id);
  return 'accept';
}

/** Mark a mechanic used. True when this call is the first time the session saw it used. */
export function markTeachingMechanicUsed(mechanic) {
  const key = clean(mechanic);
  if (!key || usedMechanics.has(key)) return false;
  usedMechanics.add(key);
  return true;
}

export function teachingMechanicUsed(mechanic) {
  return usedMechanics.has(clean(mechanic));
}

/** Test/introspection seam: the cards offered and not yet retired, oldest first. */
export function liveTeachingCardIds() {
  return [...cards.keys()];
}

function visibleRecord() {
  for (const rec of cards.values()) if (rec.status === 'visible') return rec;
  return null;
}

/** Test/introspection seam: the card on the glass right now, or null. */
export function visibleTeachingCardId() {
  const rec = visibleRecord();
  return rec ? rec.card.id : null;
}

/** Test/introspection seam: the cards waiting behind the one on the glass, oldest first. */
export function queuedTeachingCardIds() {
  return [...cards.values()].filter((rec) => rec.status !== 'visible').map((rec) => rec.card.id);
}

const CARD_CSS = `
#sf-teach-lane { position: fixed; left: calc(var(--sf-hud-edge, 20px) + var(--sf-safe-inset-x, 0px));
  top: var(--sf-speaker-top, 218px); z-index: 14; display: flex; flex-direction: column;
  align-items: flex-start; pointer-events: none; }
.sf-teach { display: flex; flex-direction: column; gap: 3px; box-sizing: border-box;
  width: min(300px, calc(100vw - 40px)); padding: 7px 12px 8px 11px;
  border-left: 2px solid var(--dp-lamp, #f2b950);
  background: linear-gradient(90deg, rgb(8 10 14 / .86) 0%, rgb(8 10 14 / .58) 78%, transparent 100%);
  color: var(--dp-ink, #e8e2d4);
  font-family: var(--dp-face-read, "Instrument Sans", system-ui, sans-serif);
  text-shadow: 0 1px 3px rgb(4 6 9 / .92); }
.sf-teach--out { opacity: 0; transition: opacity .18s ease-out; }
.sf-teach__kicker { font-weight: 600; font-size: 12px; line-height: 1.15; letter-spacing: .10em;
  text-transform: uppercase; font-variant-caps: small-caps; color: var(--dp-ink-dim, #b7b4a6); }
.sf-teach__kicker:empty { display: none; }
.sf-teach__title { font-family: var(--dp-face-display, "Archivo", system-ui, sans-serif);
  font-weight: 700; font-size: 15px; line-height: 1.15; color: var(--dp-ink, #e8e2d4); }
.sf-teach__title:empty { display: none; }
.sf-teach__line { font-weight: 550; font-size: 13px; line-height: 1.3; color: var(--dp-ink, #e8e2d4); }
.sf-teach__detail { font-weight: 500; font-size: 12px; line-height: 1.28; color: var(--dp-phos, #dfeeff); }
.sf-teach__detail:empty { display: none; }
@media (max-width: 760px) {
  #sf-teach-lane { top: auto; bottom: max(262px, 31vh); left: calc(12px + var(--sf-safe-inset-x, 0px)); }
}
@media (prefers-reduced-motion: reduce) {
  .sf-teach--out { transition: none; }
}
html.sf-reduce-motion .sf-teach--out { transition: none; }
@media (forced-colors: active) {
  .sf-teach { background: Canvas; color: CanvasText; border-left-color: Highlight; text-shadow: none; }
}
`;

function cardElement(doc, card) {
  const node = doc.createElement('div');
  node.className = 'sf-teach';
  node.setAttribute('role', 'status');
  node.setAttribute('aria-live', 'polite');
  node.dataset.teachId = card.id;
  const part = (cls, text) => {
    const el = doc.createElement('div');
    el.className = cls;
    el.textContent = text;
    node.appendChild(el);
  };
  if (card.kicker) part('sf-teach__kicker', card.kicker);
  if (card.title) part('sf-teach__title', card.title);
  part('sf-teach__line', card.line);
  if (card.detail) part('sf-teach__detail', card.detail);
  return node;
}

/**
 * Mount the Swarm teaching lane. The lane is its own seat — one card visible at a time in the
 * left margin, the rest waiting in offer order. The module-level record keeps each card's read
 * clock across re-mounts, so a ui.init on a new game never silently doubles a card's stay.
 */
export function mountSwarmTeaching({ bus = null, state = null, ttlMs = SWARM_TEACHING_TTL_MS } = {}) {
  const doc = typeof document !== 'undefined' ? document : null;
  if (!doc) {
    return {
      offer() {}, used() {}, spend: () => false, retire: () => false,
      visibleId: visibleTeachingCardId, queuedIds: queuedTeachingCardIds,
      liveIds: liveTeachingCardIds, laneEl: () => null, destroy() {},
    };
  }

  if (!doc.getElementById('sf-teach-css') && doc.head) {
    const style = doc.createElement('style');
    style.id = 'sf-teach-css';
    style.textContent = CARD_CSS;
    doc.head.appendChild(style);
  }

  /**
   * The lane's host element. Re-resolved on every use and re-attached when the document's owner
   * wiped it: `ui.init` rebuilds #ui-root's contents on a new game, and the lane must seat back
   * into the live tree rather than a detached one.
   */
  function laneEl() {
    let host = doc.getElementById(SWARM_TEACHING_LANE_ID);
    if (!host) {
      host = doc.createElement('div');
      host.id = SWARM_TEACHING_LANE_ID;
    }
    const parent = doc.getElementById('ui-root') || doc.body || null;
    if (parent && host.parentNode !== parent) parent.appendChild(host);
    return host;
  }

  /** The mechanic a tethered body's catch demonstrates, or '' when the catch teaches nothing. */
  function taughtCatchMechanic(payload) {
    if (!payload || typeof payload !== 'object') return '';
    const targetId = payload.targetId;
    if (targetId == null || !state || !state.entities || typeof state.entities.get !== 'function') return '';
    const body = state.entities.get(targetId);
    const enemyId = body && body.data && typeof body.data.lootTableId === 'string' ? body.data.lootTableId : '';
    if (!enemyId) return '';
    return SWARM_TEACH_MECHANIC_BY_ENEMY[enemyId] || '';
  }

  /** Remove a card's element (now or after its exit fade) and forget it. Never promotes. */
  function detachRecord(rec) {
    if (rec.timer) { clearTimeout(rec.timer); rec.timer = null; }
    const el = rec.el;
    rec.el = null;
    if (el && el.parentNode) {
      if (reducedMotion()) {
        el.parentNode.removeChild(el);
      } else {
        try { el.classList.add('sf-teach--out'); } catch { /* cosmetic */ }
        const drop = () => { if (el.parentNode) el.parentNode.removeChild(el); };
        rec.exitTimer = setTimeout(drop, SWARM_TEACHING_EXIT_MS);
        if (rec.exitTimer && typeof rec.exitTimer.unref === 'function') rec.exitTimer.unref();
      }
    }
  }

  /** Mount a waiting card on the glass and start its read clock — the only honest place to start it. */
  function seatVisible(rec, { remainingMs = ttlMs } = {}) {
    rec.status = 'visible';
    rec.until = null;
    const host = laneEl();
    rec.el = cardElement(doc, rec.card);
    host.appendChild(rec.el);
    try { if (!reducedMotion()) settle(rec.el, { from: 'left', state: 'teach-show' }); } catch { /* motion is cosmetic */ }
    const remaining = Math.max(0, remainingMs);
    rec.shownAt = wallNow();
    rec.until = rec.shownAt + remaining;
    if (rec.timer) clearTimeout(rec.timer);
    rec.timer = setTimeout(() => { retireCard(rec.card.id); }, remaining);
    if (rec.timer && typeof rec.timer.unref === 'function') rec.timer.unref();
  }

  /** The veil's truth is the overlay element itself — never an ordering guess across game:new and
   *  the hide receipt, which fire in either order on the menu and Again routes. */
  function veilIsUp() {
    const overlay = doc.getElementById('boot-overlay');
    if (!overlay) return false;
    const style = typeof getComputedStyle === 'function' ? getComputedStyle(overlay) : null;
    if (style && style.display === 'none') return false;
    if (overlay.style && overlay.style.display === 'none') return false;
    return true;
  }

  /** While the veil covers the arena, re-ask on a slow tick — a card held there must still seat
   *  promptly when it lifts, whichever route lifted it. */
  function armVeilRecheck() {
    if (veilRecheck) return;
    veilRecheck = setInterval(() => {
      if (!veilIsUp() || cards.size === 0) {
        clearInterval(veilRecheck);
        veilRecheck = null;
      }
      seatNext();
    }, 250);
    if (veilRecheck && typeof veilRecheck.unref === 'function') veilRecheck.unref();
  }

  /** Fill the seat from the wait list: oldest first, dropping anything whose read window already closed. */
  function seatNext() {
    if (visibleRecord()) return;
    if (!cards.size) return;
    if (veilIsUp()) { armVeilRecheck(); return; }
    for (const rec of cards.values()) {
      if (rec.status === 'visible') return;
      const remaining = rec.until == null ? ttlMs : rec.until - wallNow();
      if (remaining <= 0) { retireCard(rec.card.id); continue; }
      seatVisible(rec, { remainingMs: remaining });
      return;
    }
  }

  /** Release one card: its seat, its clock and its element. The lesson's memory is untouched. */
  function retireCard(id) {
    const rec = cards.get(clean(id));
    if (!rec) return false;
    cards.delete(rec.card.id);
    detachRecord(rec);
    if (rec.status === 'visible') seatNext();
    return true;
  }

  /**
   * Hand one card to the lane. It seats at once when the seat is free and the veil is up, else
   * it waits in offer order — behind the loading veil nothing seats at all.
   */
  const offer = (raw) => {
    const verdict = offerTeachingCard(raw);
    if (verdict !== 'accept') return verdict;
    const rec = {
      card: {
        id: clean(raw.id),
        mechanic: clean(raw.mechanic),
        kicker: clean(raw.kicker),
        title: clean(raw.title),
        line: clean(raw.line),
        detail: clean(raw.detail),
        repeat: raw.repeat === true,
      },
      status: 'queued',
      el: null, timer: null, exitTimer: null, shownAt: null, until: null,
    };
    cards.set(rec.card.id, rec);
    seatNext();
    return 'shown';
  };

  /**
   * Its mechanic was performed: retire every live card teaching it (seated or waiting) and spend
   * the lesson for the session. Returns false when no card was teaching it — callers that need
   * "the press itself spends the lesson" (the power caption) must use spend() after the offer,
   * because the offer is what a first press exists to produce.
   */
  const used = (mechanic) => {
    const key = clean(mechanic);
    if (!key) return false;
    let retired = false;
    for (const rec of [...cards.values()]) {
      if (rec.card.mechanic !== key) continue;
      retireCard(rec.card.id);
      retired = true;
    }
    if (retired) markTeachingMechanicUsed(key);
    return retired;
  };

  /** The mechanic is a fact the player demonstrated, whether or not a card was live to retire. */
  const spend = (mechanic) => markTeachingMechanicUsed(mechanic);

  /** A run boundary empties the glass but keeps the session memory — that is what makes Again quiet. */
  const clearGlass = () => {
    for (const id of [...cards.keys()]) retireCard(id);
  };

  // A re-mount (ui.init on a new game) puts every carried card back in the wait list with the read
  // time it has left; the fresh seat then fills in offer order. Behind a veil they stay held.
  for (const rec of [...cards.values()]) {
    if (rec.timer) { clearTimeout(rec.timer); rec.timer = null; }
    rec.el = null;
    if (rec.status === 'visible') rec.status = 'queued';
  }
  seatNext();

  const unsubs = [];
  if (bus && typeof bus.on === 'function') {
    // A first-sighting lesson arrives from the sim (survivalAnnounce emits it inside Swarm instead
    // of a voice line) so the three teachers can be sequenced at one door.
    unsubs.push(bus.on('swarm:teach', (p) => {
      if (!p || typeof p !== 'object') return;
      offer(p);
    }));
    // The Line is the mechanic the round brief and the first-sighting cards both teach — but only
    // a catch on a hull whose lesson IS the line counts: latching a rock or a crate proves nothing
    // about catching a Wasp (XR-DEMO-SWARM-TUTOR-1). The catch spends the lesson whether or not a
    // card is still live to retire — a player hooking taught hulls does not need the lesson.
    unsubs.push(bus.on('tether:latched', (p) => {
      const mechanic = taughtCatchMechanic(p);
      if (!mechanic) return;
      spend(mechanic);
      used(mechanic);
    }));
    unsubs.push(bus.on('run:started', clearGlass));
    unsubs.push(bus.on('game:exitToMenu', clearGlass));
    // The player can finally see the arena: seat everything that was offered behind the veil.
    unsubs.push(bus.on('ui:loadingHidden', () => seatNext()));
    // A new load covers the arena again (Again is a fresh scene build); seating re-reads the
    // overlay itself, so there is nothing to re-arm here — the recheck tick handles the rest.
    unsubs.push(bus.on('game:new', () => seatNext()));
  }

  return {
    offer,
    used,
    spend,
    /** Retire one card (or the oldest live one). The lesson's memory is untouched. */
    retire(id = null) {
      if (id != null) return retireCard(id);
      const [first] = [...cards.keys()];
      return first != null ? retireCard(first) : false;
    },
    visibleId: visibleTeachingCardId,
    queuedIds: queuedTeachingCardIds,
    liveIds: liveTeachingCardIds,
    laneEl,
    destroy() {
      for (const off of unsubs) if (typeof off === 'function') off();
      // The SEAT goes; the cards and the memory stay, so a re-mount can re-seat them. Elements are
      // dropped without the exit beat — the document they were seated in is going away itself.
      for (const rec of cards.values()) {
        if (rec.timer) { clearTimeout(rec.timer); rec.timer = null; }
        if (rec.exitTimer) { clearTimeout(rec.exitTimer); rec.exitTimer = null; }
        rec.el = null;
      }
      // The veil recheck belongs to THIS lane's closures: a stale tick must not outlive the mount
      // (the re-mount re-arms it on the next seatNext when the veil is still up).
      if (veilRecheck) { clearInterval(veilRecheck); veilRecheck = null; }
    },
  };
}

let mounted = null;

/** The live teaching lane, or null before uiRoot mounts it (headless, tests, a dead document). */
export function getSwarmTeaching() {
  return mounted;
}

/**
 * uiRoot's mount point. A re-init REPLACES the lane in place: the old bus handlers come off and
 * the old seat is released, then whatever is still live is re-seated in the new document.
 */
export function installSwarmTeaching(ctx = {}) {
  if (mounted) mounted.destroy();
  mounted = mountSwarmTeaching(ctx);
  return mounted;
}

export function releaseSwarmTeaching() {
  if (mounted) mounted.destroy();
  mounted = null;
}

/**
 * The one call site a presenter uses to teach something inside a Swarm run. Answers 'shown' |
 * 'spent' | 'duplicate'; a lane that is not mounted answers 'duplicate' and draws nothing.
 */
export function teachSwarmCard(card) {
  return mounted ? mounted.offer(card) : 'duplicate';
}

/** A mechanic was used: retires its live card and spends the lesson. False when nothing taught it. */
export function useSwarmMechanic(mechanic) {
  return mounted ? mounted.used(mechanic) : false;
}
