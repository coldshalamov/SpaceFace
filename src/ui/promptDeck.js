// src/ui/promptDeck.js — the single owner of flight-mode DECISION surfaces.
//
// HUD_FLIGHT_ATTENTION.md routes transient presentations: decisions (timed, verbed, player must
// answer) live HERE as glass-register cards on one ladder; facts/receipts are thin lines in the
// reserved receipt lane (src/ui/toasts.js); continuous state stays on HUD instruments; alarms stay
// top-center (alerts.js). Before this module, seven hand-styled cards each owned their own
// placement, z-index, key router and gamepad poll from three different construction sites
// (uiRoot, comms, registry) — they overlapped, buried live decisions under stale receipts, raced
// for digits, and double-fired one gamepad press across two cards.
//
// ONE deck owns: placement (the ladder makes overlap unrepresentable), z-band (z 20, documented in
// ARCHITECTURE §1.2 — above the HUD, below the modal backdrop and screens), keyboard (one capture
// listener; Digit1-9 are "prompt answers" per systems/input.js's binding contract), gamepad
// (accept/cancel/nav hooked once beside isConfirmOpen in ui/input.js — no more cycleTarget
// hijack), lifecycle (one subscription set for sector/dock/.load transitions), and announcement
// (one polite live region, one announcement per offer).
//
// Producers (14 sim systems) keep emitting the same bus intents. The per-event adapters (the old
// card modules, now thin) normalize payloads and call offerDecision/updateDecision/resolveDecision;
// receipts go through the bus 'toast' event and are filtered by the receipt lane's admission.
//
// Styling: styles/prompt-deck.css consumes the glass-register tokens that hudStyles.js already
// defines on :root (owner directive 2026-09-14). No backdrop-filter — flight perf floor,
// FIELD_HARDWARE_PROGRAM §7. Motion goes through kit/motion settle (which itself honours
// sf-reduce-motion); no idle rAF: the deck is ticked once from uiRoot's existing frame.
//
// Sim clock only: deadlines, TTLs and countdowns read state.simTime. The deck NEVER pauses or
// fakes a producer's deadline — a decision whose producer is silent past its deadline is
// display-expired after a grace period, and the producer's own deterministic timeout remains
// authoritative (encounterDirector owns timeout choices).
//
// The pure helpers (planLadder, routeDigit, deadlineText) are exported for headless tests
// (test/prompt-deck.test.mjs); this module must stay importable without a DOM. kit/motion.js is
// DOM-free at module scope (every document/window read is inside the exported functions), so the
// static import keeps that contract while closing the async-import window below.

import { settle, reducedMotion } from './kit/motion.js';

const FULL_SLOTS = 2;          // full glass frames on the ladder before collapse to chips
const EXPIRY_GRACE_S = 2.5;    // display-expire grace after a passed deadline (producer may still resolve)
const COUNTDOWN_URGENT_S = 5;  // suffix turns urgent below this

const KINDS = new Set(['info', 'warn', 'danger']);

// ── pure helpers (headless-testable) ─────────────────────────────────────────────────────────

/** Ladder order: soonest deadline first, then offer sequence. `entries` = iterable of
 *  { id, deadlineAt, ttlAt, seq }. Returns ids in display order (index 0 = raised). */
export function planLadder(entries) {
  return [...entries]
    .sort((a, b) => {
      const da = finiteOr(a.deadlineAt, finiteOr(a.ttlAt, Infinity));
      const db = finiteOr(b.deadlineAt, finiteOr(b.ttlAt, Infinity));
      if (da !== db) return da - db;
      return a.seq - b.seq;
    })
    .map((e) => e.id);
}

/** Digit routing for the whole deck. Returns { type:'choose', id, choiceId } when the key maps to
 *  a visible choice of the raised entry, { type:'raise', id } when it maps to a collapsed chip's
 *  raise slot, or null. Chip raise slots claim digits AFTER the raised entry's choice count, so a
 *  keystroke never means two things at once. */
/** Digit routing for the whole deck. Digits are GLOBAL display-line slots: every non-disabled
 *  choice button on the ladder claims its printed keycap in display order (raised card first,
 *  then the second full frame), and collapsed chips claim the digits after all visible choices —
 *  so a printed key never means two things and never means nothing. Returns
 *  { type:'choose', id, choiceId } | { type:'raise', id } | null. */
export function routeDigit(entries, raisedId, key) {
  const index = digitIndex(key);
  if (index < 0) return null;
  const order = planLadder(entries);
  if (!order.length) return null;
  // A player raise overrides ladder order; a stale raisedId falls back to the ladder head.
  const raised = entries.some((e) => e.id === raisedId) ? raisedId : order[0];
  const line = [raised, ...order.filter((id) => id !== raised)];

  let slot = 0;
  for (const id of line.slice(0, FULL_SLOTS)) {
    const e = entries.find((x) => x.id === id);
    for (const c of (e && e.choices || [])) {
      if (c.disabled) continue;
      if (slot === index) return { type: 'choose', id, choiceId: c.id };
      slot += 1;
    }
  }
  const chips = line.slice(FULL_SLOTS);
  const chipIndex = index - slot;
  if (chipIndex >= 0 && chipIndex < chips.length) return { type: 'raise', id: chips[chipIndex] };
  return null;
}

/** The countdown line under a headline. Producer-owned deadlines render a countdown; untimed
 *  decisions render their status flag or the standing "flight remains active" line. */
export function deadlineText(deadlineAt, simTime, statusFlag) {
  if (statusFlag) return statusFlag;
  if (!Number.isFinite(deadlineAt)) return 'Choose a response. Flight remains active.';
  const remaining = Math.max(0, Number(deadlineAt) - (Number(simTime) || 0));
  const seconds = Math.ceil(remaining);
  return `Choose a response · ${seconds} second${seconds === 1 ? '' : 's'}`;
}

export function digitIndex(key) {
  const k = String(key || '');
  if (/^[1-9]$/.test(k)) return Number(k) - 1;
  const m = /^(?:Digit|Numpad)([1-9])$/.exec(k);
  return m ? Number(m[1]) - 1 : -1;
}

/** The power-rail claim payload for the current display line: which digit slots the deck owns and
 *  what answer each borrowed socket should show, in the same order routeDigit() walks them —
 *  visible choices of the full frames first, then collapsed chips as raises. Returns null when no
 *  digit routes anywhere, so the caller releases rather than claims nothing. */
export function planSlotClaim(entries, raisedId) {
  const order = planLadder(entries);
  if (!order.length) return null;
  const raised = order.includes(raisedId) ? raisedId : order[0];
  const line = [raised, ...order.filter((id) => id !== raised)];
  const answers = [];
  for (const id of line.slice(0, FULL_SLOTS)) {
    const e = entries.find((x) => x.id === id);
    for (const c of (e && e.choices || [])) {
      if (!c.disabled) answers.push(c.label || c.id);
    }
  }
  for (const id of line.slice(FULL_SLOTS)) {
    const e = entries.find((x) => x.id === id);
    answers.push('RAISE ' + ((e && e.headline) || id));
  }
  if (!answers.length) return null;
  const slots = answers.slice(0, 9).map((_, i) => i + 1);
  return { slots, answers: answers.slice(0, 9) };
}

function finiteOr(v, fallback) {
  if (v == null || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// ── live instance registry (adapters across three construction sites share one deck) ─────────

let _deck = null;
export function getPromptDeck() { return _deck; }
export function setPromptDeck(deck) { _deck = deck || null; }

// ── the deck ─────────────────────────────────────────────────────────────────────────────────

export function createPromptDeck(ctx = {}) {
  const doc = ctx.document || (typeof document !== 'undefined' ? document : null);
  const state = ctx.state || {};
  const bus = ctx.bus;
  if (!doc || !doc.createElement) return inertDeck();

  const host = doc.getElementById('ui-root') || doc.body;
  const root = doc.createElement('div');
  root.id = 'sf-prompt-deck';
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Flight decisions');
  root.hidden = true;

  const live = doc.createElement('div');
  live.id = 'sf-prompt-deck-live';
  live.className = 'sf-prompt-deck__live';
  live.setAttribute('role', 'status');
  live.setAttribute('aria-live', 'polite');

  host.appendChild(root);
  host.appendChild(live);

  /** id → entry { spec, seq, el, chipEl, lastCountdown, announced } */
  const entries = new Map();
  let seqCounter = 0;
  let destroyed = false;
  let raisedId = null;
  let raisedExplicit = false;
  let lastLiveText = '';
  // Power-rail claim signature ('' = released). While the deck owns Digit1-N for answers/raises,
  // the rail is told so its sockets show the answers instead of powers that will not fire.
  let claimSig = '';

  function fenced() {
    return !!(state && state.ui && state.ui.fulfillmentBlackoutActive === true);
  }
  function modalOpen() {
    return !!(doc.body && doc.body.classList && doc.body.classList.contains('ui-modal-open'));
  }
  function simNow() { return Number(state && state.simTime) || 0; }
  function inFlight() { return state && state.mode === 'flight' && !(state.ui && state.ui.docked); }

  // Tell the power rail which digit sockets the deck is borrowing, in the same order routeDigit()
  // walks them: visible choices of the full frames first, then collapsed chips as raises. The
  // claim releases whenever the deck cannot capture keys (hidden, fenced, modal, docked, dead), so
  // a prompt that vanishes without resolving can never leave the rail showing dead answers.
  function syncClaim() {
    if (!bus || typeof bus.emit !== 'function') return;
    const active = !destroyed && entries.size && !root.hidden && !fenced() && !modalOpen() && inFlight();
    let payload = null;
    let sig = '';
    if (active) {
      const plan = planSlotClaim(
        [...entries.values()].map((e) => ({
          id: e.spec.id, deadlineAt: e.spec.deadlineAt, ttlAt: e.spec.ttlAt, seq: e.seq,
          choices: e.spec.choices, headline: e.spec.headline,
        })),
        raisedId,
      );
      if (plan) {
        // Wall-clock expiry for the rail's stale-claim drop: the soonest producer deadline plus
        // display grace, converted from sim seconds. Undeadlined offers hold until release.
        const nowS = simNow();
        let soonest = Infinity;
        for (const e of entries.values()) {
          const d = finiteOr(e.spec.deadlineAt, finiteOr(e.spec.ttlAt, Infinity));
          if (d < soonest) soonest = d;
        }
        payload = {
          claimId: 'prompt-deck', mode: 'PARTIAL',
          slots: plan.slots, answers: plan.answers,
          expiresAt: Number.isFinite(soonest)
            ? Date.now() + Math.max(0, soonest - nowS + EXPIRY_GRACE_S) * 1000
            : undefined,
        };
        sig = plan.slots.join(',') + '|' + plan.answers.join('|');
      }
    }
    if (sig === claimSig) return;
    claimSig = sig;
    if (payload) bus.emit('hud:slotClaim', payload);
    else bus.emit('hud:slotRelease', { claimId: 'prompt-deck' });
  }

  // ── DOM builders ───────────────────────────────────────────────────────────────────────────
  function buildFrame(entry) {
    const spec = entry.spec;
    const frame = doc.createElement('section');
    frame.className = 'sf-prompt sf-prompt--' + (KINDS.has(spec.kind) ? spec.kind : 'info');
    frame.dataset.deckId = spec.id;
    frame.setAttribute('role', 'dialog');
    frame.setAttribute('aria-modal', 'false');
    const senderId = 'sf-prompt-sender-' + cssId(spec.id);
    const titleId = 'sf-prompt-title-' + cssId(spec.id);
    const detailId = 'sf-prompt-detail-' + cssId(spec.id);
    // labelledby wins over aria-label in the accessible-name computation — an aria-label set
    // beside it is dead markup that reads authoritative but never reaches the user. The name is
    // sender + headline; the detail element stays the live description (countdown text included).
    frame.setAttribute('aria-labelledby', senderId + ' ' + titleId);
    frame.setAttribute('aria-describedby', detailId);

    const head = doc.createElement('header');
    head.className = 'sf-prompt__head';
    entry.senderEl = doc.createElement('span');
    entry.senderEl.className = 'sf-prompt__sender';
    entry.senderEl.id = senderId;
    entry.flagEl = doc.createElement('span');
    entry.flagEl.className = 'sf-prompt__flag';
    head.append(entry.senderEl, entry.flagEl);

    entry.headlineEl = doc.createElement('h3');
    entry.headlineEl.className = 'sf-prompt__headline';
    entry.headlineEl.id = titleId;
    entry.detailEl = doc.createElement('p');
    entry.detailEl.className = 'sf-prompt__detail';
    entry.detailEl.id = detailId;

    entry.contentEl = doc.createElement('div');
    entry.contentEl.className = 'sf-prompt__content';

    entry.choicesEl = doc.createElement('div');
    entry.choicesEl.className = 'sf-prompt__choices';
    entry.choicesEl.setAttribute('role', 'group');
    entry.choicesEl.setAttribute('aria-label', 'Choices');

    frame.append(head, entry.headlineEl, entry.detailEl, entry.contentEl, entry.choicesEl);
    frame.addEventListener('click', (ev) => {
      const btn = ev.target && ev.target.closest && ev.target.closest('[data-choice-id]');
      if (!btn || btn.disabled || !frame.contains(btn)) return;
      choose(spec.id, btn.dataset.choiceId, 'click');
    });
    return frame;
  }

  function renderFrame(entry) {
    const spec = entry.spec;
    setText(entry.senderEl, spec.sender || '');
    setText(entry.flagEl, spec.statusFlag || '');
    entry.flagEl.hidden = !spec.statusFlag;
    setText(entry.headlineEl, spec.headline || spec.id);
    entry.lastCountdown = null;
    renderCountdown(entry);
    entry.contentEl.replaceChildren(...(spec.content ? [spec.content] : []));
    renderChoices(entry);
  }

  function renderChoices(entry) {
    const spec = entry.spec;
    const base = entry.digitBase || 0;
    const choices = spec.choices || [];
    entry.choicesEl.replaceChildren();
    entry.choiceButtons = [];
    let printable = 0;
    choices.forEach((choice) => {
      const btn = doc.createElement('button');
      btn.type = 'button';
      btn.className = 'sf-prompt__choice' + (choice.danger ? ' sf-prompt__choice--danger' : '');
      btn.dataset.choiceId = choice.id;
      btn.disabled = !!choice.disabled;
      if (choice.reason || choice.title) btn.title = choice.reason || choice.title || '';
      const keyNum = choice.disabled ? '' : String(base + printable + 1);
      btn.setAttribute('aria-label', `${choice.label}.${choice.disabled ? ' Unavailable.' : ''}${keyNum ? ` Key ${keyNum}.` : ''}`);
      const key = doc.createElement('b');
      key.className = 'sf-prompt__key';
      key.textContent = keyNum;
      const label = doc.createElement('span');
      label.textContent = choice.label;
      btn.append(key, label);
      if (!choice.disabled) printable += 1;
      entry.choicesEl.appendChild(btn);
      entry.choiceButtons.push(btn);
    });
    entry.choicesEl.hidden = choices.length === 0;
    entry.frameEl && entry.frameEl.classList.toggle('sf-prompt--bare', choices.length === 0 && !spec.content);
  }

  function renderCountdown(entry) {
    const spec = entry.spec;
    // The countdown grammar belongs to decisions; a status frame (no live choices) renders its
    // detail alone. With an authored detail line the countdown renders as a compact suffix —
    // one line, not two competing sentences.
    const hasLiveChoices = (spec.choices || []).some((c) => !c.disabled);
    let next = '';
    if (hasLiveChoices && Number.isFinite(spec.deadlineAt)) {
      const seconds = Math.max(0, Math.ceil(spec.deadlineAt - simNow()));
      next = spec.detail ? `— ${seconds}s` : deadlineText(spec.deadlineAt, simNow(), null);
    } else if (hasLiveChoices && !spec.detail) {
      next = deadlineText(null, simNow(), null);
    }
    const nextText = (spec.detail || '') + (next ? (spec.detail ? ' ' : '') + next : '');
    if (nextText !== entry.lastCountdown) {
      entry.lastCountdown = nextText;
      setText(entry.detailEl, nextText);
      entry.detailEl.classList.toggle('sf-prompt__detail--urgent',
        hasLiveChoices && Number.isFinite(spec.deadlineAt) && spec.deadlineAt - simNow() <= COUNTDOWN_URGENT_S);
    }
  }

  function buildChip(entry) {
    const chip = doc.createElement('button');
    chip.type = 'button';
    chip.className = 'sf-prompt-chip';
    chip.dataset.deckId = entry.spec.id;
    const key = doc.createElement('b');
    key.className = 'sf-prompt-chip__key';
    const label = doc.createElement('span');
    label.className = 'sf-prompt-chip__label';
    const time = doc.createElement('i');
    time.className = 'sf-prompt-chip__time';
    chip.append(key, label, time);
    chip.addEventListener('click', () => raise(entry.spec.id));
    entry.chipKeyEl = key;
    entry.chipLabelEl = label;
    entry.chipTimeEl = time;
    entry.chipCountdown = null;
    return chip;
  }

  // ── layout ─────────────────────────────────────────────────────────────────────────────────
  function layout() {
    if (destroyed) return;
    const order = planLadder([...entries.values()].map((e) => ({
      id: e.spec.id, deadlineAt: e.spec.deadlineAt, ttlAt: e.spec.ttlAt, seq: e.seq,
    })));
    if (!order.length) {
      raisedId = null;
      raisedExplicit = false;
      root.replaceChildren();
      root.hidden = true;
      syncClaim();
      return;
    }
    // Deadline urgency owns the order unless the PLAYER explicitly raised an entry (chip click or
    // its digit); a stale explicit raise falls back to ladder order. The deck never lets the mere
    // fact of being first-offered keep a card above a more urgent one.
    const raised = raisedExplicit && raisedId && order.includes(raisedId) ? raisedId : order[0];
    const line = [raised, ...order.filter((id) => id !== raised)];
    raisedId = raised;
    raisedExplicit = false;

    root.replaceChildren();
    const full = line.slice(0, FULL_SLOTS);
    const chips = line.slice(FULL_SLOTS);
    // Global keycap walk: visible choices claim digits in display order, chips claim the rest.
    // routeDigit() implements this same walk, so what is printed is what fires.
    let digitSlot = 0;
    for (const id of full) {
      const entry = entries.get(id);
      entry.digitBase = digitSlot;
      digitSlot += (entry.spec.choices || []).filter((c) => !c.disabled).length;
      entry.chipEl = null;
      entry.frameEl.hidden = false;
      entry.frameEl.classList.toggle('sf-prompt--raised', id === raisedId);
      renderChoices(entry);
      root.appendChild(entry.frameEl);
    }
    for (const id of chips) {
      const entry = entries.get(id);
      if (!entry.chipEl) entry.chipEl = buildChip(entry);
      setText(entry.chipKeyEl, String(digitSlot + 1));
      setText(entry.chipLabelEl, entry.spec.headline || entry.spec.id);
      // The chip's children concatenate into a name with no separators ("5PIRATE DEMAND12s") —
      // give the button an explicit name that names the verb, the card, and the key.
      entry.chipEl.setAttribute('aria-label',
        `Raise ${entry.spec.headline || entry.spec.id} — key ${digitSlot + 1}`);
      root.appendChild(entry.chipEl);
      digitSlot += 1;
    }
    root.hidden = line.length === 0;
    // Clamp the ladder above the sector-law panel when it is on screen — the right column is the
    // HUD's reserved composition (approved resting frame) and the deck may not enter it.
    const lawPanel = doc.getElementById('sf-sector-law');
    if (lawPanel && lawPanel.getBoundingClientRect) {
      const lawTop = lawPanel.getBoundingClientRect().top;
      if (Number.isFinite(lawTop) && lawTop > 0) {
        const deckTop = root.getBoundingClientRect().top;
        root.style.maxHeight = `${Math.max(200, Math.floor(lawTop - deckTop - 10))}px`;
      }
    }
    syncChoiceHighlight();
    syncClaim();
  }

  function syncChoiceHighlight() {
    for (const entry of entries.values()) {
      const raisedEntry = entry.spec.id === raisedId;
      (entry.choiceButtons || []).forEach((btn, i) => {
        // The highlight is the gamepad's cursor: it appears only once stick/d-pad navigation is
        // used, so mouse/keyboard users never see a stuck ring on the default choice.
        btn.classList.toggle('is-highlight', raisedEntry && entry.highlightIndex != null && i === entry.highlightIndex);
      });
    }
  }

  // ── countdown / expiry / status tick ───────────────────────────────────────────────────────
  function tick() {
    if (destroyed) { syncClaim(); return; }
    if (!entries.size) { syncClaim(); return; }
    const now = simNow();
    for (const [id, entry] of [...entries]) {
      const spec = entry.spec;
      const deadline = finiteOr(spec.deadlineAt, finiteOr(spec.ttlAt, Infinity));
      const grace = Number.isFinite(spec.deadlineAt) ? EXPIRY_GRACE_S : 0;
      if (now >= deadline + grace) {
        if (typeof spec.onExpire === 'function') {
          try { spec.onExpire(); } catch (_) { /* adapter cleanup stays best-effort */ }
        }
        remove(id);
        continue;
      }
      if (typeof spec.onTick === 'function') spec.onTick(entry);
      if (entry.frameEl && !entry.frameEl.hidden) {
        renderCountdown(entry);
        if (entry.chipEl && entry.chipTimeEl) {
          const secs = Math.max(0, Math.ceil(deadline - now));
          const time = Number.isFinite(deadline) ? `${secs}s` : '';
          if (time !== entry.chipCountdown) {
            entry.chipCountdown = time;
            setText(entry.chipTimeEl, time);
          }
        }
      }
    }
    if (fenced() || !inFlight()) {
      // Suppressed, not cancelled: producers keep their deadlines and re-assert or resolve.
      root.hidden = true;
      syncClaim();
      return;
    }
    if (entries.size && root.hidden) {
      if (modalOpen()) { syncClaim(); return; }
      layout();
      root.hidden = false;
    }
    syncClaim();
  }

  // ── input ──────────────────────────────────────────────────────────────────────────────────
  function onKeyDown(ev) {
    if (destroyed || ev.ctrlKey || ev.altKey || ev.metaKey) return;
    if (!entries.size || !root || root.hidden) return;
    if (fenced() || modalOpen() || !inFlight()) return;
    const route = routeDigit(
      [...entries.values()].map((e) => ({ id: e.spec.id, deadlineAt: e.spec.deadlineAt, ttlAt: e.spec.ttlAt, seq: 0, choices: e.spec.choices })),
      raisedId, ev.key != null ? ev.key : ev.code,
    );
    if (!route) return;
    if (typeof ev.preventDefault === 'function') ev.preventDefault();
    if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
    else if (typeof ev.stopPropagation === 'function') ev.stopPropagation();
    if (route.type === 'choose') choose(route.id, route.choiceId, 'keyboard');
    else raise(route.id);
  }

  /** Gamepad, polled once from ui/input.js beside the confirm handling. Returns true when the
   *  deck consumed the press. accept = highlighted choice; cancel = the choice flagged
   *  `cancel` (safe default), never a destructive one; nav up/down moves the highlight. */
  function gamepadCapture(actions) {
    if (destroyed || !entries.size || !root || root.hidden || fenced() || modalOpen() || !inFlight()) return false;
    const entry = entries.get(raisedId);
    if (!entry) return false;
    const spec = entry.spec;
    const choices = (spec.choices || []);
    const usable = choices.map((c, i) => ({ c, i })).filter(({ c }) => !c.disabled);
    if (!usable.length) return true; // status frame: swallow so flight menus don't react
    if (!(entry.highlightIndex in choices) || choices[entry.highlightIndex].disabled) {
      entry.highlightIndex = usable[0].i;
    }
    if (actions.accept && actions.accept.pressed) {
      const c = choices[entry.highlightIndex] || usable[0].c;
      choose(spec.id, c.id, 'gamepad');
      return true;
    }
    if (actions.cancel && actions.cancel.pressed) {
      const cancelChoice = usable.find(({ c }) => c.cancel);
      if (cancelChoice) choose(spec.id, cancelChoice.c.id, 'gamepad');
      return true;
    }
    return false;
  }

  /** Nav edges, forwarded from ui/input.js when the deck captures input. */
  function gamepadNav(dir) {
    const entry = entries.get(raisedId);
    if (!entry) return false;
    const spec = entry.spec;
    const choices = (spec.choices || []);
    const usable = choices.map((c, i) => ({ c, i })).filter(({ c }) => !c.disabled);
    if (usable.length < 2) return false;
    if (!(entry.highlightIndex in choices) || choices[entry.highlightIndex].disabled) {
      entry.highlightIndex = usable[0].i;
    }
    const at = usable.findIndex(({ i }) => i === entry.highlightIndex);
    const next = usable[(at + (dir === 'down' ? 1 : usable.length - 1)) % usable.length];
    entry.highlightIndex = next.i;
    syncChoiceHighlight();
    return true;
  }

  // ── verbs ──────────────────────────────────────────────────────────────────────────────────
  function choose(id, choiceId, source) {
    if (destroyed || fenced()) return false;
    const entry = entries.get(id);
    if (!entry) return false;
    const choice = (entry.spec.choices || []).find((c) => c.id === choiceId);
    if (!choice || choice.disabled) return false;
    if (typeof entry.spec.onChoose === 'function') entry.spec.onChoose(choiceId, source || 'deck');
    return true;
  }

  function raise(id) {
    if (!entries.has(id)) return false;
    raisedId = id;
    raisedExplicit = true;
    layout();
    return true;
  }

  // ── public API ─────────────────────────────────────────────────────────────────────────────
  function offerDecision(spec) {
    if (destroyed || !spec || !spec.id) return false;
    const normalized = normalizeSpec(spec);
    let entry = entries.get(normalized.id);
    const isNew = !entry;
    if (entry) {
      entry.spec = { ...entry.spec, ...normalized };
      renderFrame(entry);
    } else {
      entry = {
        spec: normalized,
        seq: ++seqCounter,
        frameEl: null, chipEl: null, highlightIndex: null, lastCountdown: null,
      };
      entry.frameEl = buildFrame(entry);
      renderFrame(entry);
      entries.set(normalized.id, entry);
    }
    if (fenced() || !inFlight()) { root.hidden = true; return true; }
    layout();
    if (!modalOpen()) root.hidden = false;
    // Entrance settles new cards only — a producer re-asserting a live offer must not replay the
    // slide, and a card mid-exit is already gone from the entries map so it never reaches here.
    if (isNew && !entry.frameEl.hidden) {
      try { settle(entry.frameEl, { from: 'right', state: 'deck-offer' }); } catch (_) {}
    }
    announce(entry);
    return true;
  }

  function normalizeSpec(spec) {
    const choices = Array.isArray(spec.choices)
      ? spec.choices.map((c) => ({
        id: String(c && c.id || ''),
        label: String(c && (c.label != null ? c.label : c.id) || ''),
        disabled: !!(c && c.disabled),
        danger: !!(c && c.danger),
        cancel: !!(c && c.cancel),
        reason: c && (c.reason != null ? String(c.reason)
          : (c.title != null ? String(c.title) : undefined)),
      })).filter((c) => c.id)
      : [];
    return {
      id: String(spec.id),
      kind: KINDS.has(spec.kind) ? spec.kind : 'info',
      sender: spec.sender != null ? String(spec.sender) : '',
      headline: spec.headline != null ? String(spec.headline) : '',
      detail: spec.detail != null ? String(spec.detail) : '',
      statusFlag: spec.statusFlag != null ? String(spec.statusFlag) : null,
      choices,
      deadlineAt: finiteOr(spec.deadlineAt, null),
      ttlAt: finiteOr(spec.ttlAt, null),
      content: spec.content || null,
      onChoose: typeof spec.onChoose === 'function' ? spec.onChoose : null,
      onTick: typeof spec.onTick === 'function' ? spec.onTick : null,
      onExpire: typeof spec.onExpire === 'function' ? spec.onExpire : null,
      collapse: !!spec.collapse,
    };
  }

  function updateDecision(id, patch) {
    const entry = entries.get(String(id));
    if (!entry) return false;
    entry.spec = { ...entry.spec, ...normalizeSpec({ ...entry.spec, ...patch, id: entry.spec.id }) };
    renderFrame(entry);
    layout();
    return true;
  }

  function resolveDecision(id) {
    return remove(String(id));
  }

  function hasDecision(id) {
    return id != null ? entries.has(String(id)) : entries.size > 0;
  }

  function remove(id) {
    const entry = entries.get(id);
    if (!entry) return false;
    entries.delete(id);
    // Resolved/expired cards get a short exit slide instead of a pop-out; the frame stays mounted
    // for the transition window so layout() is not re-run per frame. Reduced motion removes
    // instantly — the state change is already unambiguous via the card disappearing.
    const frame = entry.frameEl;
    if (frame && frame.isConnected && !reducedMotion()) {
      frame.classList.add('sf-prompt--leaving');
      frame.style.pointerEvents = 'none';
      const chip = entry.chipEl;
      if (chip && chip.isConnected) chip.classList.add('sf-prompt-chip--leaving');
      setTimeout(() => {
        frame.remove();
        if (chip) chip.remove();
      }, 170);
    } else {
      if (frame) frame.remove();
      entry.chipEl && entry.chipEl.remove();
    }
    if (raisedId === id) raisedId = null;
    layout();
    return true;
  }

  function clearAll() {
    for (const id of [...entries.keys()]) remove(id);
    root.hidden = true;
  }

  function announce(entry) {
    const spec = entry.spec;
    const choiceText = (spec.choices || []).map((c, i) => `${i + 1} ${c.label}`).join(', ');
    // Skip empty fields rather than punctuating them — a sender-less offer used to announce
    // ". HEADLINE. ..." with a leading dot.
    const text = [spec.sender, spec.headline, spec.detail].filter(Boolean).join('. ')
      + (spec.sender || spec.headline || spec.detail ? '. ' : '')
      + (choiceText ? 'Choices: ' + choiceText + '.' : '');
    if (text === lastLiveText) return;
    lastLiveText = text;
    live.textContent = text;
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    syncClaim(); // release the rail claim — layout() no-ops once destroyed, so it cannot reach it
    doc.removeEventListener('keydown', onKeyDown, true);
    clearAll();
    root.remove();
    live.remove();
    if (_deck === api) setPromptDeck(null);
  }

  doc.addEventListener('keydown', onKeyDown, true);

  // ONE lifecycle owner for the whole family. The old cards each subscribed to their own subset
  // of these and drifted; on any of these transitions every flight decision is void — producers
  // re-assert or resolve through their own events.
  if (bus && typeof bus.on === 'function') {
    const voidAll = () => clearAll();
    bus.on('sector:exit', voidAll);
    bus.on('game:new', voidAll);
    bus.on('game:load', voidAll);
    bus.on('dock:docked', voidAll);
  }

  const api = {
    el: root,
    offerDecision, updateDecision, resolveDecision, hasDecision, clearAll,
    choose, raise, tick, gamepadCapture, gamepadNav,
    get size() { return entries.size; },
    get raisedId() { return raisedId; },
    destroy,
  };
  setPromptDeck(api);
  return api;
}

function inertDeck() {
  const noop = () => false;
  return {
    el: null, offerDecision: noop, updateDecision: noop, resolveDecision: noop,
    hasDecision: () => false, clearAll: noop, choose: noop, raise: noop, tick: noop,
    gamepadCapture: () => false, gamepadNav: () => false, size: 0, raisedId: null, destroy: noop,
  };
}

function cssId(id) {
  return String(id).replace(/[^a-zA-Z0-9_-]/g, '_');
}

function setText(node, value) {
  const text = String(value == null ? '' : value);
  if (node && node.textContent !== text) node.textContent = text;
}
