// Compact target hail beside the comms log. Simulation validation lives in scanner.js; this module
// only consumes scanner receipts, emits intents, and renders compact scanner-owned actions.

import {
  CONTACT_HAIL_RECEIPT_TTL_S,
  CONTACT_HAIL_REQUEST_TTL_S,
} from '../data/contactHail.js';
import { isUiInteractionFenced } from './input.js';
import { createMorphLabel } from './effects/morphLabel.js';
import { factionIcon, icon as stationIcon } from './station/icons.js';
import {
  buildHailRibbonPath,
  hailFrequencyText,
  resolveHailVisual,
} from './commsRadial.js';

const STYLE_ID = 'sf-contact-hail-style';

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  if (n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}

export function createContactHailPrompt(ctx) {
  const { state, bus } = ctx;
  injectStyle();

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
    </aside>`;
  document.getElementById('ui-root').appendChild(root);

  const hailButton = root.querySelector('[data-k="hail"]');
  const panel = root.querySelector('[data-k="panel"]');
  const linesEl = root.querySelector('[data-k="lines"]');
  const actionsEl = root.querySelector('[data-k="actions"]');
  const deckBtn = root.querySelector('[data-k="deck"]');
  const crestEl = root.querySelector('[data-k="crest"]');
  const pilotEl = root.querySelector('[data-k="pilot"]');
  const classEl = root.querySelector('[data-k="classword"]');
  const ribbonPath = root.querySelector('[data-k="ribbon"]');
  const freqHost = root.querySelector('[data-k="freq"]');
  const freqMorph = createMorphLabel(freqHost, { text: 'FREQ IDLE' });

  let active = null;
  let availability = { enabled: false, targetId: null, kind: null, label: 'HAIL' };
  let destroyed = false;
  let previousFreq = '';
  let nextRibbonUpdateAt = 0;

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
    classEl.textContent = visual.classWord;
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
    panel.hidden = true;
    linesEl.replaceChildren();
    actionsEl.replaceChildren();
    updateDeckVisual(true);
  }

  function render(payload) {
    if (!payload || payload.targetId !== state.player.targetId) return false;
    active = { ...payload };
    const lines = Array.isArray(payload.lines) ? payload.lines : [];
    const actions = Array.isArray(payload.actions) ? payload.actions : [];
    linesEl.replaceChildren(...lines.slice(0, 2).map((line) => {
      const row = document.createElement('div');
      row.className = 'sf-contact-hail__line';
      row.textContent = line;
      return row;
    }));
    actionsEl.replaceChildren(...actions.slice(0, 3).map((action, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.choice = action.id;
      button.textContent = `${index + 1} · ${action.label}`;
      button.setAttribute('aria-label', `${action.label}. Choice ${index + 1}.`);
      return button;
    }));
    panel.hidden = false;
    panel.setAttribute('aria-label', lines.slice(0, 2).join(' '));
    nextRibbonUpdateAt = Number(state.simTime) || 0;
    updateDeckVisual(true);
    return true;
  }

  function applyAvailability(payload) {
    availability = payload || { enabled: false, targetId: null, kind: null, label: 'HAIL' };
    hailButton.disabled = !availability.enabled;
    hailButton.textContent = availability.enabled ? 'HAIL' : 'HAIL —';
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
        || Number(active.expiresAt) <= now) hidePanel();
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
    try { freqMorph.dispose(); } catch (_) {}
    root.remove();
  }

  hailButton.addEventListener('click', () => request('pointer'));
  panel.addEventListener('click', onPanelClick);
  deckBtn.addEventListener('click', onDeckClick);
  document.addEventListener('keydown', onKeyDown, true);
  const busBindings = [
    ['contactHail:availability', applyAvailability],
    ['contactHail:offer', render],
    ['contactHail:response', render],
    ['contactHail:clear', hidePanel],
    ['contactHail:handoff', hidePanel],
    ['game:new', hidePanel],
    ['game:load', hidePanel],
    ['dock:docked', hidePanel],
    ['mode:changed', hidePanel],
  ];
  for (const [event, handler] of busBindings) bus.on(event, handler);

  return { el: root, tick, request, choose, hide: hidePanel, destroy };
}

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
  #sf-contact-hail { position:absolute; left:85px; top:20px; z-index:1061;
    font-family:var(--sf-body-face, "IBM Plex Sans", "Segoe UI", sans-serif); contain:layout paint style; }
  .sf-contact-hail__button { width:72px; height:32px; padding:0 10px;
    border:1px solid color-mix(in srgb, var(--sf-calm) 38%, transparent);
    background:color-mix(in srgb, var(--sf-surface) 90%, transparent); color:var(--sf-calm);
    font:600 12px var(--sf-subhead-face, "Saira SemiCondensed", sans-serif); letter-spacing:.04em; cursor:default; }
  .sf-contact-hail--ready .sf-contact-hail__button { color:var(--sf-paper); border-color:var(--sf-goal);
    cursor:pointer; }
  .sf-contact-hail__button:hover:not(:disabled), .sf-contact-hail__button:focus-visible,
  .sf-contact-hail__actions button:hover, .sf-contact-hail__actions button:focus-visible,
  .sf-contact-hail__deck:focus-visible {
    outline:2px solid var(--sf-goal); outline-offset:2px; }
  .sf-contact-hail__button:disabled { opacity:.72; }
  .sf-contact-hail__panel { position:absolute; left:-71px; top:38px; width:min(332px, calc(100vw - 28px));
    box-sizing:border-box; padding:10px 11px; background:color-mix(in srgb, var(--sf-surface) 94%, transparent); color:var(--sf-paper);
    border:1px solid color-mix(in srgb, var(--sf-calm) 38%, transparent); border-top:2px solid var(--sf-goal);
    box-shadow:0 14px 30px rgba(0,0,0,.32); }
  .sf-contact-hail__panel[hidden] { display:none !important; }
  .sf-contact-hail__deck { width:100%; border:1px solid var(--sf-edge); background:color-mix(in srgb, var(--sf-surface) 88%, transparent);
    color:var(--sf-paper); padding:8px; display:grid; grid-template-columns:24px 1fr; grid-template-rows:auto auto auto;
    column-gap:9px; row-gap:2px; text-align:left; cursor:pointer; margin-bottom:8px; }
  .sf-contact-hail__crest { grid-row:1 / span 2; width:24px; height:24px; display:inline-flex; align-items:center; justify-content:center; color:var(--sf-calm); }
  .sf-contact-hail__who { grid-column:2; display:grid; gap:1px; }
  .sf-contact-hail__pilot { font:600 14px var(--sf-subhead-face, "Saira SemiCondensed", sans-serif); line-height:1.1; letter-spacing:.02em; }
  .sf-contact-hail__class { font-size:12px; color:var(--sf-calm); line-height:1.2; }
  .sf-contact-hail__freq { grid-column:2; font:500 12px var(--sf-data-face, "IBM Plex Mono", monospace); color:var(--sf-goal); }
  .sf-contact-hail__ribbon { grid-column:1 / -1; width:100%; height:22px; color:var(--sf-you); }
  .sf-contact-hail__ribbon path { fill:none; stroke:currentColor; stroke-width:1.4; }
  .sf-contact-hail__lines { display:grid; gap:2px; }
  .sf-contact-hail__line { overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
    font-size:12px; line-height:1.35; letter-spacing:.02em; }
  .sf-contact-hail__line + .sf-contact-hail__line { color:var(--sf-calm); }
  .sf-contact-hail__actions { display:flex; gap:6px; margin-top:8px; }
  .sf-contact-hail__actions:empty { display:none; }
  .sf-contact-hail__actions button { min-height:30px; flex:1 1 0; border:1px solid color-mix(in srgb, var(--sf-calm) 40%, transparent);
    background:color-mix(in srgb, var(--sf-surface) 88%, transparent); color:var(--sf-paper); cursor:pointer;
    font:500 12px var(--sf-data-face, "IBM Plex Mono", monospace); letter-spacing:.03em; }
  body.ui-modal-open #sf-contact-hail,
  body.ui-live-screen #sf-contact-hail { opacity:0; visibility:hidden; pointer-events:none; }
  @media (max-width:900px), (max-height:620px) {
    #sf-contact-hail { left:85px; top:12px; }
    .sf-contact-hail__panel { left:-71px; }
  }
  @media (prefers-reduced-motion:reduce) {
    #sf-contact-hail, .sf-contact-hail__button, .sf-contact-hail__panel, .sf-contact-hail__deck { transition:none; }
  }`;
  document.head.appendChild(style);
}

export default createContactHailPrompt;
