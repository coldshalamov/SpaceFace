// A1 The Band — compact tuner chip. Read-only over sim state; emits intents only.

import { BAND_CHANNEL_BY_ID } from '../data/bandRadio.js';
import { createHudDragController } from './hudLayout.js';

export const BAND_HUD_CSS = `
  /* Keep the tuner out of the radar and contact-roster column by default. Players can still
     Ctrl-drag it anywhere that reads better for their own flight setup. */
  .sf-band-hud { position:absolute; right:20px; top:150px; bottom:auto; z-index:18; pointer-events:auto; }
  #hud > .sf-band-hud { pointer-events:auto; }
  .sf-band-hud__button { min-width:176px; min-height:34px; display:flex; align-items:center;
    justify-content:space-between; gap:12px; padding:7px 10px; border:1px solid rgba(135,165,190,.38);
    border-left:2px solid rgba(124,196,218,.82); border-radius:2px; background:rgba(5,9,18,.92);
    color:var(--text-secondary, #aebdca); font:600 10px/1.2 var(--font-mono, monospace);
    letter-spacing:.08em; text-transform:uppercase; cursor:pointer;
    transition:border-color 160ms ease-out,color 160ms ease-out,background 160ms ease-out; }
  .sf-band-hud__button:hover,.sf-band-hud__button:focus-visible { color:var(--text-primary, #edf5fa);
    border-color:rgba(124,196,218,.86); background:rgba(8,16,28,.96); outline:none; }
  .sf-band-hud__button:focus-visible { box-shadow:0 0 0 2px rgba(124,196,218,.24); }
  .sf-band-hud__button[data-off="true"] { border-left-color:rgba(130,145,155,.5); color:rgba(174,189,202,.72); }
  @media (prefers-reduced-motion: reduce) { .sf-band-hud__button { transition:none; } }
  @media (max-width: 820px) { .sf-band-hud { right:12px; top:112px; bottom:auto; }
    .sf-band-hud__button { min-width:148px; font-size:9px; } }
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
  root.appendChild(button);
  host.appendChild(root);
  const layoutDrag = createHudDragController({
    state, bus, element: root, key: 'band', documentRef, windowRef: options.windowRef,
  });

  let status = null;
  let destroyed = false;
  let lastRenderSignature = null;
  const unsubscribers = [];
  const onClick = (event) => {
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    if (destroyed || !bus || typeof bus.emit !== 'function') return;
    bus.emit('band:cycle', { source: 'hud-chip' });
  };
  button.addEventListener('click', onClick);
  if (bus && typeof bus.on === 'function') {
    unsubscribers.push(bus.on('band:status', (payload) => { status = payload || null; update(); }));
    unsubscribers.push(bus.on('save:loaded', () => { status = null; update(); }));
  }

  function update() {
    if (destroyed) return;
    const own = state.bandRadio || {};
    const channelId = status && status.channelId !== undefined ? status.channelId : own.channelId;
    const effectiveId = status && status.effectiveChannelId || own.effectiveChannelId;
    const sourceId = status && status.sourceId || own.effectiveSourceId;
    const strength = clamp01(finite(status && status.signalStrength, finite(own.signalStrength, 0)));
    const silence = !!(status && status.silence) || sourceId === 'planet_hush';
    const hidden = !(state.mode === 'flight' && !(state.ui && state.ui.docked));

    const channel = channelId && BAND_CHANNEL_BY_ID[channelId];
    const label = sourceId === 'planet_hush' ? 'RF VOID'
      : sourceId === 'landmark_quiessence' ? 'QUIET MEMORIAL'
        : channel && channel.label || 'OFF';
    const meter = channelId ? signalMeter(strength, silence) : '---';
    const renderSignature = [hidden, channelId || '', effectiveId || '', sourceId || '',
      strength, silence, label, meter].join('|');
    if (renderSignature === lastRenderSignature) return;
    lastRenderSignature = renderSignature;
    root.hidden = hidden;
    button.textContent = `BAND  ${label}  ${meter}`;
    button.setAttribute('data-off', channelId ? 'false' : 'true');
    button.setAttribute('data-silence', silence ? 'true' : 'false');
    button.setAttribute('aria-label', channelId
      ? `Band tuner, ${label}, ${silence ? 'radio silence' : signalLabel(strength)}. Activate for next channel.`
      : 'Band tuner, off. Activate for next channel.');
    button.setAttribute('aria-keyshortcuts', 'Shift+O');
    button.setAttribute('title', '[ Shift+O ] Cycle Band channel');
    button.setAttribute('data-effective-channel', effectiveId || 'off');
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    button.removeEventListener('click', onClick);
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

function signalMeter(strength, silence) {
  if (silence) return 'VOID';
  const bars = strength >= 0.72 ? 3 : strength >= 0.38 ? 2 : strength >= 0.08 ? 1 : 0;
  return `${'|'.repeat(bars)}${'.'.repeat(3 - bars)}`;
}
function signalLabel(strength) {
  if (strength >= 0.72) return 'strong signal';
  if (strength >= 0.38) return 'readable signal';
  if (strength >= 0.08) return 'weak signal';
  return 'carrier lost';
}
function inertBandHud() {
  return { root: null, button: null, update() {}, destroy() {} };
}
function finite(value, fallback) { return Number.isFinite(value) ? value : fallback; }
function clamp01(value) { return value < 0 ? 0 : value > 1 ? 1 : value; }
