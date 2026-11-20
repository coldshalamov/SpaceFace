// Radio controls read tuning receipts and send channel requests to the radio system.

import { BAND_CHANNEL_BY_ID, TUNABLE_BAND_CHANNELS } from '../data/bandRadio.js';
import QUIESSENCE_PACK from '../data/flavor/060-quiessence.js';
import { createHudDragController } from './hudLayout.js';
import { BINDINGS } from './bindings.js';
import { bearingRefusalLine, paintBearingRefusal, BEARING_REFUSAL_HOLD_MS } from './orrery/bearingRefusal.js';
import { isSwarmGlass } from './swarmGlass.js';

const QUIESSENCE_INDEXES = new Set(QUIESSENCE_PACK.entries.map((entry) => entry.shipIndex));
const CHANNEL_CAPTIONS = Object.freeze({
  concord_bulletin: 'Public notices', the_margin: 'Independent reporting', the_static: 'Pirate broadcasts',
  ballad_line: 'Frontier songs and tales', choir_vespers: 'Devotional hymns',
  fulfillment_routing: 'Automated freight dispatch', numbers_station: 'Coded transmissions',
});

export function quiessenceCensusProgress(state) {
  const scanned = new Set();
  for (const receipt of (state && state.v2Flavor && state.v2Flavor.presentedReceipts || [])) {
    if (typeof receipt !== 'string' || !receipt.startsWith(`${QUIESSENCE_PACK.id}:`)) continue;
    const index = Number(receipt.slice(receipt.lastIndexOf(':') + 1));
    if (QUIESSENCE_INDEXES.has(index)) scanned.add(index);
  }
  return {
    scanned: scanned.size,
    total: QUIESSENCE_INDEXES.size,
    complete: scanned.size === QUIESSENCE_INDEXES.size,
  };
}

export const BAND_HUD_CSS = `
  /* Keep the tuner out of the radar and contact-roster column by default. It anchors in the sky
     LEFT of the dock: the dock grew when the sector-law card moved into it, and at the old
     top-right anchor the chip sat directly on the law card's headline. Players can still
     Ctrl-drag it anywhere that reads better for their own flight setup.
     ORRERY register: an instrument chip on the flight glass — etched face, warm bone rest light,
     no bordered box (the 2px left edge is the state channel), the 2px bone bracket on focus. */
  .sf-band-hud { position:absolute; right:calc(20px + var(--sf-dock-w, 220px) + var(--sf-safe-inset-x, 0px)); top:150px; bottom:auto; z-index:18; pointer-events:auto; }
  #hud > .sf-band-hud { pointer-events:auto; }
  .sf-band-hud__button { max-width:min(166px,48vw); min-height:34px; display:block;
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap; padding:7px 10px;
    border:0; border-left:2px solid var(--dp-lamp-dim, #8a6b3a);
    border-radius:var(--dp-r-instrument, 3px);
    background:var(--dp-glass-flight, rgb(18 23 29 / .82));
    color:var(--dp-ink, #e8e2d4);
    font-family:var(--dp-face-etch, var(--hud-data, system-ui));
    font-size:12px; font-weight:700; line-height:1.2;
    font-variation-settings:"wght" 720, "wdth" 68;
    letter-spacing:0; text-transform:none; cursor:pointer;
    text-shadow:var(--dp-etch-shadow, none);
    transition:color 160ms ease-out,border-color 160ms ease-out,background 160ms ease-out; }
  .sf-band-hud__button:hover { color:var(--dp-phos, #dfeeff);
    border-left-color:var(--dp-lamp, #f2b950); background:var(--dp-glass-flight, rgb(18 23 29 / .82)); }
  .sf-band-hud__button:focus-visible { outline:2px solid var(--dp-ink-dim, #a9a696); outline-offset:2px; }
  .sf-band-hud__button:active { color:var(--dp-phos, #dfeeff);
    border-left-color:var(--dp-lamp-hot, #ffd98c); }
  .sf-band-hud__button[data-off="true"] { border-left-color:var(--dp-metal-4, #2f3542);
    color:var(--dp-ink-mute, #96948e); text-shadow:none; }
  .sf-band-hud__button[data-off="true"]:hover { color:var(--dp-ink-dim, #a9a696); }
  .sf-band-hud__button[data-silence="true"] { color:var(--dp-ink-dim, #a9a696); }
  .sf-band-hud__button[data-bearing-refusal] { text-transform:none; letter-spacing:.01em; font-weight:560;
    color:var(--dp-danger-hot, #ff8a70); white-space:normal; text-align:left; line-height:1.25; }
  .sf-radio-tuner { position:fixed; z-index:2410; box-sizing:border-box; display:grid;
    grid-template-rows:auto minmax(0,1fr) auto; width:min(322px,calc(100vw - 24px)); max-height:min(80dvh,598px);
    background:var(--sf-pop-glass); border:1px solid var(--sf-pop-seam); border-radius:8px;
    box-shadow:var(--sf-pop-shadow); color:var(--dp-ink); pointer-events:auto; }
  .sf-radio-tuner[hidden] { display:none; }
  .sf-radio-tuner__head { display:grid; grid-template-columns:1fr auto; align-items:center; gap:5px 12px;
    padding:12px 13px 10px; border-bottom:1px solid var(--dp-rule); }
  .sf-radio-tuner__head h2 { margin:0; color:var(--dp-ink); font:740 20px/1.2 var(--dp-face-display); }
  .sf-radio-tuner__status { grid-column:1 / -1; color:var(--dp-ink-dim); font:500 13px/1.3 var(--dp-face-read); }
  .sf-radio-tuner__channels { min-height:0; overflow:auto; overscroll-behavior:contain; padding:5px 7px; }
  .sf-radio-tuner__channel { box-sizing:border-box; display:grid; grid-template-columns:minmax(0,1fr) auto;
    width:100%; min-height:42px; align-items:center; gap:3px 8px; padding:6px 8px;
    border:1px solid transparent; border-radius:4px; background:none; text-align:left; text-transform:none;
    letter-spacing:0; color:var(--dp-ink); cursor:pointer; }
  .sf-radio-tuner__channel strong { grid-column:1; font:650 14px/1.15 var(--dp-face-read); }
  .sf-radio-tuner__channel span { grid-column:1; color:var(--dp-ink-dim); font:500 12px/1.2 var(--dp-face-read); }
  .sf-radio-tuner__channel:hover { background:var(--dp-field); border-color:var(--dp-rule); }
  .sf-radio-tuner__channel[aria-pressed="true"] { background:var(--dp-field); border-color:var(--dp-rule-hi); }
  .sf-radio-tuner__channel[aria-pressed="true"] strong { color:var(--dp-hand-hot); }
  .sf-radio-tuner__channel[aria-pressed="true"]::after { content:""; grid-column:2; grid-row:1 / span 2;
    width:8px; height:8px; border-radius:50%; background:var(--dp-hand); }
  .sf-radio-tuner__foot { display:flex; justify-content:space-between; gap:8px; padding:8px 13px;
    border-top:1px solid var(--dp-rule); }
  .sf-radio-tuner__key { min-height:34px; padding:5px 8px; border:1px solid var(--dp-rule);
    border-radius:4px; background:none; color:var(--dp-ink); font:620 13px/1.1 var(--dp-face-read); cursor:pointer; }
  .sf-radio-tuner__key:hover { border-color:var(--dp-line-hi); }
  .sf-radio-tuner button:focus-visible { outline:2px solid var(--dp-hand); outline-offset:-2px; }
  @media (forced-colors: active) { .sf-radio-tuner { background:Canvas; color:CanvasText; border-color:CanvasText; } }
  @media (prefers-reduced-motion: reduce) { .sf-band-hud__button { transition:none; } }
  @media (max-width: 820px) { .sf-band-hud { right:12px; top:112px; bottom:auto; }
    .sf-band-hud__button { max-width:148px; font-size:12px; } }
`;

export function createBandHud(ctx, options = {}) {
  const state = ctx && ctx.state || {};
  const bus = ctx && ctx.bus;
  const documentRef = options.documentRef || (typeof document !== 'undefined' ? document : null);
  if (!documentRef || typeof documentRef.createElement !== 'function') return inertBandHud();
  const host = options.host
    || (typeof documentRef.getElementById === 'function' && documentRef.getElementById('hud'))
    || documentRef.body;
  if (!host || typeof host.appendChild !== 'function') return inertBandHud();

  injectBandHudCss(documentRef);
  const root = documentRef.createElement('div');
  root.id = 'sf-band-hud';
  root.className = 'sf-band-hud';
  const button = documentRef.createElement('button');
  button.className = 'sf-band-hud__button';
  button.setAttribute('type', 'button');
  button.setAttribute('aria-live', 'off');
  button.setAttribute('aria-haspopup', 'dialog');
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', 'sf-radio-tuner');
  root.appendChild(button);
  host.appendChild(root);
  const layoutDrag = createHudDragController({
    state, bus, element: root, key: 'band', documentRef, windowRef: options.windowRef,
  });

  let status = null;
  let destroyed = false;
  let lastHidden = null;
  let lastText = null;
  let lastDataOff = null;
  let lastDataSilence = null;
  let lastAriaLabel = null;
  let lastEffectiveChannel = null;
  let lastLive = null;
  let lastSig = null;
  let refusalReason = null;
  let refusalTimer = 0;
  let tuner = null;
  const unsubscribers = [];
  const onClick = (event) => {
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    if (destroyed || root.hidden || !bus || typeof bus.emit !== 'function') return;
    if (tuner && !tuner.root.hidden) closeTuner(true);
    else openTuner();
  };
  button.addEventListener('click', onClick);
  if (bus && typeof bus.on === 'function') {
    unsubscribers.push(bus.on('band:status', (payload) => { status = payload || null; update(); }));
    unsubscribers.push(bus.on('band:bearingUnavailable', (payload) => {
      refusalReason = (payload && payload.reason) || 'unavailable';
      if (refusalTimer) clearTimeout(refusalTimer);
      refusalTimer = setTimeout(() => {
        refusalTimer = 0;
        refusalReason = null;
        update();
      }, BEARING_REFUSAL_HOLD_MS);
      update();
    }));
    unsubscribers.push(bus.on('v2:flavorPresented', (payload) => {
      if (payload && payload.sourceRef === 'landmark_c14_quiessence') update();
    }));
    unsubscribers.push(bus.on('save:loaded', () => {
      status = null;
      refusalReason = null;
      if (refusalTimer) { clearTimeout(refusalTimer); refusalTimer = 0; }
      update();
    }));
    unsubscribers.push(bus.on('ui:screenTop', ({ id } = {}) => { if (id) closeTuner(); }));
  }

  const viewport = documentRef.defaultView || options.windowRef;
  const onOutside = (event) => {
    if (tuner && !tuner.root.hidden && !tuner.root.contains(event.target) && !button.contains(event.target)) closeTuner();
  };
  const onEscape = (event) => {
    if (!tuner || tuner.root.hidden || event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    closeTuner(true);
  };

  function closeTuner(refocus = false) {
    if (!tuner || tuner.root.hidden) return;
    tuner.root.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    if (refocus) button.focus?.({ preventScroll: true });
  }

  function placeTuner() {
    if (!tuner || tuner.root.hidden || !viewport) return;
    const anchor = button.getBoundingClientRect();
    const panel = tuner.root;
    const left = Math.max(12, Math.min(viewport.innerWidth - panel.offsetWidth - 12, anchor.right - panel.offsetWidth));
    const below = anchor.bottom + 8;
    const top = below + panel.offsetHeight <= viewport.innerHeight - 12 ? below
      : Math.max(12, anchor.top - panel.offsetHeight - 8);
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  }

  function tune(channelId) {
    bus.emit('band:tune', { channelId, source: 'radio-tuner' });
  }

  function buildTuner() {
    const panel = documentRef.createElement('section');
    panel.id = 'sf-radio-tuner';
    panel.className = 'sf-radio-tuner';
    panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-labelledby', 'sf-radio-tuner-title');
    panel.innerHTML = `<div class="sf-radio-tuner__head"><h2 id="sf-radio-tuner-title">Radio channels</h2>
      <button type="button" class="sf-radio-tuner__key" data-tuner-close>Close</button>
      <div class="sf-radio-tuner__status" role="status"></div></div>
      <div class="sf-radio-tuner__channels" role="group" aria-label="Select a channel"></div>
      <div class="sf-radio-tuner__foot"><button type="button" class="sf-radio-tuner__key" data-tuner-off>Turn radio off</button>
        <button type="button" class="sf-radio-tuner__key" data-tuner-log>Radio log</button></div>`;
    const channels = panel.querySelector('.sf-radio-tuner__channels');
    const rows = TUNABLE_BAND_CHANNELS.map((channel) => {
      const row = documentRef.createElement('button');
      row.type = 'button';
      row.className = 'sf-radio-tuner__channel';
      const name = documentRef.createElement('strong');
      name.textContent = channel.label;
      const caption = documentRef.createElement('span');
      caption.textContent = CHANNEL_CAPTIONS[channel.id] || '';
      row.append(name, caption);
      row.addEventListener('click', () => tune(channel.id));
      channels.appendChild(row);
      return { id: channel.id, row };
    });
    const close = panel.querySelector('[data-tuner-close]');
    const off = panel.querySelector('[data-tuner-off]');
    const statusNode = panel.querySelector('.sf-radio-tuner__status');
    close.addEventListener('click', () => closeTuner(true));
    off.addEventListener('click', () => tune(null));
    panel.querySelector('[data-tuner-log]').addEventListener('click', () => {
      closeTuner(true);
      if (!state.ui?.commsBacklogOpen) bus.emit('ui:toggleComms');
    });
    (ctx?.stage?.slotEl?.('dialog') || documentRef.getElementById('ui-root') || host).appendChild(panel);
    documentRef.addEventListener?.('pointerdown', onOutside, true);
    documentRef.addEventListener?.('keydown', onEscape, true);
    viewport?.addEventListener?.('resize', placeTuner);
    return { root: panel, rows, close, off, statusNode };
  }

  function paintTuner(channelId, text) {
    if (!tuner || tuner.root.hidden) return;
    for (const { id, row } of tuner.rows) row.setAttribute('aria-pressed', String(id === channelId));
    tuner.off.disabled = !channelId;
    if (tuner.statusNode.textContent !== text) tuner.statusNode.textContent = text;
  }

  function openTuner() {
    if (!tuner) tuner = buildTuner();
    tuner.root.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    const channelId = status?.channelId !== undefined ? status.channelId : state.bandRadio?.channelId;
    paintTuner(channelId, lastText);
    placeTuner();
    (tuner.rows.find((entry) => entry.id === channelId)?.row || tuner.rows[0]?.row || tuner.close).focus?.({ preventScroll: true });
  }

  function update() {
    if (destroyed) return;
    const own = state.bandRadio || {};
    const channelId = status && status.channelId !== undefined ? status.channelId : own.channelId;
    const effectiveId = status && status.effectiveChannelId || own.effectiveChannelId;
    const sourceId = status && status.sourceId || own.effectiveSourceId;
    const strength = clamp01(finite(status && status.signalStrength, finite(own.signalStrength, 0)));
    const silence = !!(status && status.silence) || sourceId === 'planet_hush';
    // A live Swarm round has no band: the arena's own radio is off and the chip's "RADIO OFF"
    // (or a tuned channel from the campaign) is an open-world control the room cannot use
    // (SWARM-LEAK-01). Gate at the source so the chip is never painted, not hidden by a class.
    const hidden = !(state.mode === 'flight' && !(state.ui && state.ui.docked))
      || isSwarmGlass(state);

    // Strength is published at 5 Hz but renders in four threshold buckets — compare the
    // scalar projection inputs before any of the string formatting runs at all.
    const census = sourceId === 'landmark_quiessence' ? quiessenceCensusProgress(state) : null;
    const bandKeyLabel = (BINDINGS.band && BINDINGS.band.label) || 'Shift+O';
    const refusalLine = refusalReason ? bearingRefusalLine(refusalReason) : '';
    const sig = `${channelId}|${effectiveId}|${sourceId}|${strength >= 0.72 ? 3 : strength >= 0.38 ? 2 : strength >= 0.08 ? 1 : 0}`
      + `|${silence ? 1 : 0}|${hidden ? 1 : 0}|${census ? census.scanned + '/' + census.total : ''}|${bandKeyLabel}|${refusalLine}`;
    if (sig === lastSig) return;
    lastSig = sig;

    const channel = channelId && BAND_CHANNEL_BY_ID[channelId];
    const label = silence ? 'No signal here'
      : sourceId === 'landmark_quiessence' ? 'QUIET MEMORIAL'
        : channel && channel.label || 'OFF';
    const censusText = census ? `  FOUND ${census.scanned}/${census.total}` : '';
    const meter = channelId && !silence ? signalLabel(strength) : '';
    const chipText = `Radio · ${label}${censusText}`;
    const text = `${chipText}${meter ? ` · ${meter}` : ''}`;
    const dataOff = channelId ? 'false' : 'true';
    const dataSilence = silence ? 'true' : 'false';    const censusAria = census ? ` Census ${census.scanned} of ${census.total}${census.complete ? ', complete' : ''}.` : '';
    const ariaLabel = channelId
      ? `Radio, ${label}${meter ? `, ${meter}` : ''}.${censusAria} Choose a channel.`
      : 'Radio off. Choose a channel.';
    const effectiveChannel = effectiveId || 'off';
    const shownText = refusalLine || text;
    const shownAria = refusalLine ? `${refusalLine}.` : ariaLabel;
    const shownLive = refusalLine ? 'polite' : 'off';
    // Signal strength is published at 5 Hz, but the chip renders four threshold buckets. Key the
    // cache to the exact DOM projection so within-bucket strength changes do not repaint identical
    // text and attributes while every visible/accessibility transition still invalidates it.
    if (hidden === lastHidden && shownText === lastText && dataOff === lastDataOff
      && dataSilence === lastDataSilence && shownAria === lastAriaLabel
      && effectiveChannel === lastEffectiveChannel && shownLive === lastLive) return;
    lastHidden = hidden;
    lastText = shownText;
    lastDataOff = dataOff;
    lastDataSilence = dataSilence;
    lastAriaLabel = shownAria;
    lastEffectiveChannel = effectiveChannel;
    lastLive = shownLive;
    root.hidden = hidden;
    button.setAttribute('data-off', dataOff);
    button.setAttribute('data-silence', dataSilence);
    button.setAttribute('title', `Choose a radio channel. ${bandKeyLabel} cycles channels.`);
    button.setAttribute('data-effective-channel', effectiveChannel);
    if (refusalLine) paintBearingRefusal(button, refusalReason);
    else {
      button.textContent = chipText;
      button.removeAttribute('data-bearing-refusal');
      button.setAttribute('aria-live', 'off');
      button.setAttribute('aria-label', ariaLabel);
    }
    if (hidden) closeTuner();
    else paintTuner(channelId, shownText);
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    if (refusalTimer) { clearTimeout(refusalTimer); refusalTimer = 0; }
    button.removeEventListener('click', onClick);
    documentRef.removeEventListener?.('pointerdown', onOutside, true);
    documentRef.removeEventListener?.('keydown', onEscape, true);
    viewport?.removeEventListener?.('resize', placeTuner);
    tuner?.root.remove();
    layoutDrag.destroy();
    for (const unsub of unsubscribers) {
      try { unsub(); } catch (_) {}
    }
    if (root.parentNode && typeof root.parentNode.removeChild === 'function') root.parentNode.removeChild(root);
  }

  update();
  return { root, button, update, destroy, layoutDrag };
}

export function injectBandHudCss(documentRef = (typeof document !== 'undefined' ? document : null)) {
  if (!documentRef || !documentRef.head || typeof documentRef.createElement !== 'function') return false;
  if (typeof documentRef.getElementById === 'function' && documentRef.getElementById('sf-band-hud-css')) return false;
  const style = documentRef.createElement('style');
  style.id = 'sf-band-hud-css';
  style.textContent = BAND_HUD_CSS;
  documentRef.head.appendChild(style);
  return true;
}

function signalLabel(strength) {
  if (strength >= 0.72) return 'strong signal';
  if (strength >= 0.38) return 'clear signal';
  if (strength >= 0.08) return 'weak signal';
  return 'no signal';
}
function inertBandHud() {
  return { root: null, button: null, update() {}, destroy() {} };
}
function finite(value, fallback) { return Number.isFinite(value) ? value : fallback; }
function clamp01(value) { return value < 0 ? 0 : value > 1 ? 1 : value; }
