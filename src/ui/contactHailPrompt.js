// Compact target hail beside the comms log. Simulation validation lives in scanner.js; this module
// only consumes scanner receipts, emits intents, and renders compact scanner-owned actions.

import {
  CONTACT_HAIL_RECEIPT_TTL_S,
  CONTACT_HAIL_REQUEST_TTL_S,
} from '../data/contactHail.js';
import { markTold } from '../systems/deedRecord.js';
import { isUiInteractionFenced } from './input.js';
import { createMorphLabel } from './effects/morphLabel.js';
import { factionIcon, icon as stationIcon } from './station/icons.js';
import {
  buildHailRibbonPath,
  hailFrequencyText,
  resolveHailVisual,
} from './commsRadial.js';
import { getPromptDeck } from './promptDeck.js';

const ROUTE_READING_GRACE_S = 30;

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  if (n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}

export function createContactHailPrompt(ctx) {
  const { state, bus } = ctx;
  // G16-02: the detail panel rides the Stage's prompt slot inside the shared .dp-glass frame —
  // the injected sheet retired to styles/ui.css, where the panel's face and anchored seat stay
  // scoped to the legacy #ui-root mount this file keeps for a host with no live Stage.
  const stage = ctx && ctx.stage && typeof ctx.stage.show === 'function' ? ctx.stage : null;

  const root = document.createElement('div');
  root.id = 'sf-contact-hail';
  root.innerHTML = `
    <button type="button" class="sf-contact-hail__button" data-k="hail" disabled
      aria-label="Hail selected contact">HAIL</button>
    <aside class="sf-contact-hail__panel" data-k="panel" role="region" aria-live="polite"
      aria-atomic="true" hidden>
      <button type="button" class="sf-contact-hail__deck" data-k="deck"
        aria-label="Open tactical hail deck">
        <span class="sf-contact-hail__crest" data-k="crest"></span>
        <span class="sf-contact-hail__who">
          <span class="sf-contact-hail__pilot" data-k="pilot">NO CONTACT</span>
          <span class="sf-contact-hail__class" data-k="classword">CHANNEL IDLE</span>
        </span>
        <span class="sf-contact-hail__freq" data-k="freq"></span>
        <svg class="sf-contact-hail__ribbon" viewBox="0 0 152 24" aria-hidden="true" focusable="false">
          <path data-k="ribbon"></path>
        </svg>
      </button>
      <div class="sf-contact-hail__lines" data-k="lines"></div>
      <div class="sf-contact-hail__actions" data-k="actions"></div>
      <button type="button" class="sf-contact-hail__close" data-k="close" hidden aria-label="Close route details">CLOSE DETAILS</button>
    </aside>`;
  const uiRoot = document.getElementById('ui-root');
  uiRoot.appendChild(root);

  const hailButton = root.querySelector('[data-k="hail"]');
  const panel = root.querySelector('[data-k="panel"]');
  // hud.js re-seats #sf-contact-hail into the comms tape inside .sf-leftcontext, and that column
  // clips every descendant outside its box — the absolute panel would paint nowhere. The panel is
  // an overlay, not tape content: the Stage's prompt slot hosts it (fallback: #ui-root, anchored
  // to the button's rect as before).
  if (!stage) uiRoot.appendChild(panel);
  const linesEl = panel.querySelector('[data-k="lines"]');
  const actionsEl = panel.querySelector('[data-k="actions"]');
  const closeBtn = panel.querySelector('[data-k="close"]');
  const deckBtn = panel.querySelector('[data-k="deck"]');
  const crestEl = panel.querySelector('[data-k="crest"]');
  const pilotEl = panel.querySelector('[data-k="pilot"]');
  const classEl = panel.querySelector('[data-k="classword"]');
  const ribbonPath = panel.querySelector('[data-k="ribbon"]');
  const freqHost = panel.querySelector('[data-k="freq"]');
  const freqMorph = createMorphLabel(freqHost, { text: 'FREQ IDLE' });

  let active = null;
  let routeReadUntil = null;
  let availability = { enabled: false, targetId: null, kind: null, label: 'HAIL' };
  let destroyed = false;
  let previousFreq = '';
  let nextRibbonUpdateAt = 0;
  let toldRequestId = null;
  let panelHandle = null;

  // Keep the authored relationship on the fallback mount: the panel hangs 71px left and 38px
  // below the channel button. The staged panel takes the prompt slot's seat instead.
  function syncPanelPosition() {
    if (panel.hidden || panelHandle) return;
    const r = root.getBoundingClientRect();
    if (!r.width && !r.height) return;
    panel.style.left = `${Math.max(8, Math.round(r.left) - 71)}px`;
    panel.style.top = `${Math.round(r.top) + 38}px`;
  }

  function activePayload() {
    if (active) return active;
    if (!availability.enabled || availability.targetId == null) return null;
    return {
      targetId: availability.targetId,
      kind: availability.kind || null,
      lines: [availability.label || 'CONTACT'],
      expiresAt: (Number(state.simTime) || 0) + CONTACT_HAIL_REQUEST_TTL_S,
    };
  }

  function updateDeckVisual(force = false) {
    if (panel.hidden && !force) return;
    syncPanelPosition();
    const payload = activePayload();
    if (!payload) {
      deckBtn.hidden = true;
      return;
    }
    const visual = resolveHailVisual(state, payload, availability);
    if (!visual) {
      deckBtn.hidden = true;
      return;
    }
    deckBtn.hidden = false;
    crestEl.innerHTML = visual.factionId ? factionIcon(visual.factionId, 22) : stationIcon('target', 22);
    pilotEl.textContent = visual.pilot;
    // A selected route can contain actionable prose, not a ship-class word.
    classEl.textContent = payload?.choice === 'route' ? 'ROUTE DETAILS · SNAPSHOT' : visual.classWord;
    const now = Number(state.simTime) || 0;
    const ttl = active && active.choice ? CONTACT_HAIL_RECEIPT_TTL_S : CONTACT_HAIL_REQUEST_TTL_S;
    const amplitude = active
      ? clamp01((Number(active.expiresAt) - now) / Math.max(1, ttl))
      : 0.22;
    ribbonPath.setAttribute('d', buildHailRibbonPath(visual.seed, amplitude, visual.density));
    const freq = hailFrequencyText(amplitude, visual.density);
    const dir = previousFreq && freq > previousFreq ? 'up' : previousFreq && freq < previousFreq ? 'down' : 'flat';
    freqMorph.set(freq, { dir });
    previousFreq = freq;
  }

  function hidePanel() {
    active = null;
    routeReadUntil = null;
    if (panel.contains(document.activeElement)) hailButton.focus?.();
    closeBtn.hidden = true;
    if (panelHandle) { panelHandle.clear(); panelHandle = null; }
    panel.hidden = true;
    panel.classList.remove('sf-contact-hail__panel--detail');
    panel.removeAttribute('tabindex');
    linesEl.replaceChildren();
    actionsEl.replaceChildren();
    updateDeckVisual(true);
  }

  function clearReceipt(payload) {
    // Scanner still expires its receipt at four seconds. Only its exact expiry notice
    // may leave this zero-action route snapshot on screen for reading.
    if (active && routeReadUntil != null && payload?.reason === 'expired'
      && active.requestId != null && payload.requestId === active.requestId
      && payload.targetId === active.targetId) return;
    hidePanel();
  }

  function render(payload) {
    if (!payload || payload.targetId !== state.player.targetId) return false;
    active = { ...payload };
    const detail = payload.choice === 'route';
    // Retain a read-only reply for reading, never extend simulation receipts or actions.
    routeReadUntil = detail && !(payload.actions?.length)
      ? (Number(state.simTime) || 0) + ROUTE_READING_GRACE_S : null;
    closeBtn.hidden = !detail;
    panel.classList.toggle('sf-contact-hail__panel--detail', detail);
    // Keyboard users can focus and scroll a long chosen route.
    if (detail) panel.setAttribute('tabindex', '0');
    else panel.removeAttribute('tabindex');
    const lines = Array.isArray(payload.lines) ? payload.lines : [];
    const actions = Array.isArray(payload.actions) ? payload.actions : [];
    // Scanner deliberately caps normal lines at two; advice has its own bounded
    // transport field and one visible wrapped row. Never extend receipt lifetime.
    const towAdvice=payload.kind==='tally_three'&&typeof payload.towAdvice==='string'
      ?payload.towAdvice.trim().slice(0,240):'';
    linesEl.replaceChildren(...lines.slice(0, 2).map((line) => {
      const row = document.createElement('div');
      row.className = 'sf-contact-hail__line';
      row.textContent = line;
      return row;
    }));
    if(towAdvice){
      const row=document.createElement('div');
      row.className='sf-contact-hail__line sf-contact-hail__tow-advice';
      row.textContent=towAdvice;linesEl.appendChild(row);
    }
    actionsEl.replaceChildren(...actions.slice(0, 3).map((action, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.choice = action.id;
      button.textContent = `${index + 1} · ${action.label}`;
      button.setAttribute('aria-label', `${action.label}. Choice ${index + 1}.`);
      return button;
    }));
    panel.hidden = false;
    if (stage && !panelHandle) {
      panelHandle = stage.show('prompt', panel, { id: 'contact-hail', severity: 'info' });
    }
    // THE WORLD REMEMBERS (U-E): a patrol that opened with a deed has now actually said it, once.
    if (payload.deedId && payload.requestId !== toldRequestId) {
      toldRequestId = payload.requestId;
      markTold(state, payload.deedId, { by: `hail:${payload.targetId}` });
    }
    panel.setAttribute('aria-label', [...lines.slice(0,2),...(towAdvice?[towAdvice]:[])].join(' '));
    nextRibbonUpdateAt = Number(state.simTime) || 0;
    updateDeckVisual(true);
    return true;
  }

  function applyAvailability(payload) {
    availability = payload || { enabled: false, targetId: null, kind: null, label: 'HAIL' };
    hailButton.disabled = !availability.enabled;
    hailButton.textContent = 'HAIL';   // unavailable reads as a disabled key (and its aria-label), not a dash
    hailButton.setAttribute('aria-label', availability.enabled
      ? availability.label
      : 'Hail unavailable for selected contact');
    root.classList.toggle('sf-contact-hail--ready', !!availability.enabled);
    if (active && (!availability.enabled || availability.targetId !== active.targetId)) hidePanel();
    updateDeckVisual(true);
  }

  function request(source = 'pointer') {
    if (isUiInteractionFenced(state) || !availability.enabled) return false;
    bus.emit('contactHail:request', { targetId: availability.targetId, source });
    return true;
  }

  function choose(choice, source = 'pointer') {
    if (isUiInteractionFenced(state) || !active || !choice) return false;
    bus.emit('contactHail:choice', {
      requestId: active.requestId,
      targetId: active.targetId,
      choice,
      source,
    });
    return true;
  }

  function onPanelClick(event) {
    if (isUiInteractionFenced(state)) return;
    const button = event.target && event.target.closest && event.target.closest('[data-choice]');
    if (!button || !panel.contains(button)) return;
    choose(button.dataset.choice, 'pointer');
  }

  function onDeckClick(event) {
    event.preventDefault();
    if (isUiInteractionFenced(state)) return;
    const targetId = active && active.targetId != null
      ? active.targetId
      : availability && availability.targetId != null
        ? availability.targetId
        : null;
    if (targetId == null) return;
    bus.emit('contactHail:deck:open', { targetId, source: 'prompt' });
  }

  function onKeyDown(event) {
    if (isUiInteractionFenced(state) || !active || event.altKey || event.ctrlKey || event.metaKey) return;
    // The decision deck owns the digits while any decision is live — the hail panel's numbered
    // choices step aside rather than race it (pre-deck, both capture listeners fired).
    const deck = getPromptDeck();
    if (deck && deck.size > 0) return;
    const index = event.code === 'Digit1' || event.code === 'Numpad1' ? 0
      : event.code === 'Digit2' || event.code === 'Numpad2' ? 1
        : event.code === 'Digit3' || event.code === 'Numpad3' ? 2 : -1;
    if (index < 0) return;
    const action = active.actions && active.actions[index];
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    choose(action.id, 'keyboard');
  }

  function tick() {
    if (destroyed) return;
    if (active) {
      const now = Number(state.simTime) || 0;
      if (active.targetId !== state.player.targetId
        || state.mode !== 'flight' || state.ui && state.ui.docked
        || (routeReadUntil == null ? Number(active.expiresAt) <= now
          : routeReadUntil <= now && !panel.contains(document.activeElement))) hidePanel();
    }
    if (!panel.hidden) {
      const now = Number(state.simTime) || 0;
      if (now >= nextRibbonUpdateAt) {
        updateDeckVisual();
        nextRibbonUpdateAt = now + 0.12;
      }
    }
  }

  function destroy() {
    destroyed = true;
    for (const [event, handler] of busBindings) bus.off(event, handler);
    document.removeEventListener('keydown', onKeyDown, true);
    deckBtn.removeEventListener('click', onDeckClick);
    closeBtn.removeEventListener('click', hidePanel);
    try { freqMorph.dispose(); } catch (_) {}
    if (panelHandle) { panelHandle.clear(); panelHandle = null; }
    panel.remove();
    root.remove();
  }

  closeBtn.addEventListener('click', hidePanel);
  hailButton.addEventListener('click', () => request('pointer'));
  panel.addEventListener('click', onPanelClick);
  deckBtn.addEventListener('click', onDeckClick);
  document.addEventListener('keydown', onKeyDown, true);
  const busBindings = [
    ['contactHail:availability', applyAvailability],
    ['contactHail:offer', render],
    ['contactHail:response', render],
    ['contactHail:clear', clearReceipt],
    ['contactHail:handoff', hidePanel],
    ['game:new', hidePanel],
    ['game:load', hidePanel],
    ['dock:docked', hidePanel],
    ['mode:changed', hidePanel],
  ];
  for (const [event, handler] of busBindings) bus.on(event, handler);

  return { el: root, tick, request, choose, hide: hidePanel, destroy };
}


export default createContactHailPrompt;
