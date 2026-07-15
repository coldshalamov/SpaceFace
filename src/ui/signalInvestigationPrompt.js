// Compact scanner investigation card. Simulation owns detection, classification, tracking and
// durable receipts; this presenter only renders public signal events and emits `signal:track`.

import { isUiInteractionFenced } from './input.js';

const STYLE_ID = 'sf-signal-investigation-style';
const RESULT_TTL_S = 8;
const RECEIPT_TTL_S = 4;

export function signalStrengthWord(value) {
  const n = Math.max(0, Math.min(1, Number(value) || 0));
  if (n >= 0.66) return 'STRONG';
  if (n >= 0.33) return 'MEDIUM';
  return 'FAINT';
}

export function signalMetaText(record) {
  if (!record) return 'FAINT · RANGE —';
  const distance = Math.max(0, Math.round(Number(record.distance) || 0)).toLocaleString('en-US');
  const pass = Math.max(1, Math.round(Number(record.scanCount) || 1));
  return `${signalStrengthWord(record.strength)} · ${distance} WU · PASS ${pass}`;
}

function safeRecord(payload) {
  const row = payload && payload.primary;
  if (!row || !row.id || !row.classification) return null;
  return {
    id: String(row.id),
    classification: String(row.classification),
    detail: String(row.detail || 'Source unresolved. Close range or pulse again.'),
    confidence: Math.max(0, Math.min(1, Number(row.confidence) || 0)),
    strength: Math.max(0, Math.min(1, Number(row.strength) || 0)),
    distance: Math.max(0, Number(row.distance) || 0),
    scanCount: Math.max(1, Math.round(Number(row.scanCount) || 1)),
  };
}

export function createSignalInvestigationPrompt(ctx) {
  const { state, bus } = ctx;
  injectStyle();
  const root = document.createElement('aside');
  root.id = 'sf-signal-investigation';
  root.hidden = true;
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'polite');
  root.setAttribute('aria-atomic', 'true');
  root.innerHTML = `
    <div class="sf-signal__head"><span data-k="flag">SCAN RETURN</span><span data-k="confidence">—</span></div>
    <div class="sf-signal__headline" data-k="headline">—</div>
    <div class="sf-signal__meta" data-k="meta">—</div>
    <div class="sf-signal__detail" data-k="detail">—</div>
    <div class="sf-signal__foot">
      <span class="sf-signal__more" data-k="more"></span>
      <button type="button" data-k="track" aria-label="Track and investigate scanner return. Controller A."><b>A</b> TRACK / INVESTIGATE</button>
    </div>`;
  document.getElementById('ui-root').appendChild(root);

  const el = Object.fromEntries(['flag', 'confidence', 'headline', 'meta', 'detail', 'more', 'track']
    .map((key) => [key, root.querySelector(`[data-k=${key}]`)]));
  let active = null;
  let destroyed = false;

  function text(node, value) {
    const next = String(value == null ? '' : value);
    if (node && node.textContent !== next) node.textContent = next;
  }

  function hide() {
    root.hidden = true;
    root.className = '';
    active = null;
  }

  function canSurface() {
    return state && state.mode === 'flight' && !(state.ui && state.ui.docked);
  }

  function showResults(payload) {
    if (!canSurface()) return false;
    const record = safeRecord(payload);
    if (!record) return false;
    active = {
      mode: 'result',
      signalId: record.id,
      hideAt: Number(state.simTime || 0) + RESULT_TTL_S,
    };
    root.className = 'sf-signal--result';
    text(el.flag, 'SCAN RETURN');
    text(el.confidence, `CONFIDENCE ${Math.round(record.confidence * 100)}%`);
    text(el.headline, record.classification.toUpperCase());
    text(el.meta, signalMetaText(record));
    text(el.detail, record.detail);
    const other = Math.max(0, Number(payload.total || (payload.signals && payload.signals.length) || 1) - 1);
    text(el.more, other ? `+${other} OTHER RETURN${other === 1 ? '' : 'S'}` : 'PRIMARY RETURN');
    el.track.hidden = false;
    el.track.disabled = false;
    root.setAttribute('aria-label', `Scan return. ${record.classification}. ${signalMetaText(record)}. ${record.detail} Track or investigate.`);
    root.hidden = false;
    return true;
  }

  function showTracked(payload) {
    if (!canSurface() || !payload || !payload.classification) return false;
    active = { mode: 'receipt', signalId: payload.id || payload.signalId, hideAt: Number(state.simTime || 0) + RECEIPT_TTL_S };
    root.className = 'sf-signal--receipt';
    text(el.flag, 'NAV FIX ARMED');
    text(el.confidence, 'TRACKING');
    text(el.headline, String(payload.classification).toUpperCase());
    text(el.meta, signalMetaText(payload));
    text(el.detail, 'Course plotted. Follow the primary objective marker to investigate.');
    text(el.more, 'OBJECTIVE + MAP UPDATED');
    el.track.hidden = true;
    root.setAttribute('aria-label', `${payload.classification} tracked. Course plotted. Follow the primary objective marker to investigate.`);
    root.hidden = false;
    return true;
  }

  function showInvestigated(payload) {
    if (!canSurface() || !payload) return false;
    active = { mode: 'receipt', signalId: payload.signalId, hideAt: Number(state.simTime || 0) + RECEIPT_TTL_S };
    root.className = 'sf-signal--receipt sf-signal--complete';
    text(el.flag, 'INVESTIGATION COMPLETE');
    text(el.confidence, 'LOGGED');
    text(el.headline, String(payload.classification || 'SIGNAL').toUpperCase());
    text(el.meta, 'DISCOVERY RECEIPT · SAVED');
    text(el.detail, 'Source reached and recorded. Local salvage, distress, or anomaly systems retain authority over any outcome.');
    text(el.more, 'NO DUPLICATE REWARD');
    el.track.hidden = true;
    root.setAttribute('aria-label', `${payload.classification || 'Signal'} investigation complete and saved.`);
    root.hidden = false;
    return true;
  }

  function track(source = 'click') {
    if (isUiInteractionFenced(state) || !active || active.mode !== 'result' || !active.signalId) return false;
    const signalId = active.signalId;
    el.track.disabled = true;
    bus.emit('signal:track', { signalId, source });
    return true;
  }

  function tick() {
    if (destroyed || !active || isUiInteractionFenced(state)) return;
    if (!canSurface()) { hide(); return; }
    if (Number(state.simTime || 0) >= active.hideAt) { hide(); return; }
    if (active.mode !== 'result') return;
    const actions = ctx.gamepad && ctx.gamepad.actions || {};
    if (actions.accept && actions.accept.pressed) track('gamepad');
  }

  function destroy() {
    destroyed = true;
    el.track.removeEventListener('click', onTrackClick);
    root.remove();
  }

  function onTrackClick() {
    if (isUiInteractionFenced(state)) return;
    track('click');
  }
  el.track.addEventListener('click', onTrackClick);
  bus.on('signal:scanResults', showResults);
  bus.on('signal:tracked', showTracked);
  bus.on('signal:investigated', showInvestigated);
  bus.on('recovery:started', hide);
  bus.on('pirateParley:demand', hide);
  bus.on('law:distressRaised', hide);
  bus.on('game:new', hide);
  bus.on('game:load', hide);

  return { el: root, tick, hide, destroy, showResults, showTracked, showInvestigated, track };
}

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
  #sf-signal-investigation { position:absolute; top:112px; right:16px; width:min(390px,calc(100vw - 32px));
    z-index:1065; box-sizing:border-box; padding:9px 11px 10px; contain:layout paint style;
    background:rgba(5,9,18,.93); border:1px solid rgba(80,216,255,.4); border-left:3px solid #50d8ff;
    color:#d7e6ff; font-family:var(--mono,Consolas,monospace); transition:opacity .16s ease-out,transform .16s ease-out; }
  #sf-signal-investigation[hidden] { display:none !important; }
  .sf-signal__head { display:flex; justify-content:space-between; gap:12px; color:#50d8ff; font-size:9px; letter-spacing:.14em; }
  .sf-signal__headline { margin-top:5px; font-size:14px; line-height:1.25; letter-spacing:.045em; }
  .sf-signal__meta { margin-top:3px; color:#91abc9; font-size:9px; line-height:1.35; letter-spacing:.08em; }
  .sf-signal__detail { margin-top:4px; color:#bdcde3; font-size:10px; line-height:1.4; }
  .sf-signal__foot { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-top:8px; }
  .sf-signal__more { min-width:0; color:#7892b6; font-size:8px; letter-spacing:.08em; }
  .sf-signal__foot button { pointer-events:auto; flex:0 0 auto; min-height:32px; padding:6px 9px; border:1px solid rgba(80,216,255,.58);
    background:rgba(80,216,255,.1); color:#dff8ff; font:700 9px/1.2 var(--mono,Consolas,monospace); letter-spacing:.06em; cursor:pointer; }
  .sf-signal__foot button b { display:inline-grid; place-items:center; min-width:16px; min-height:16px; margin-right:5px;
    border:1px solid rgba(223,248,255,.55); border-radius:50%; font-size:8px; }
  .sf-signal__foot button:hover,.sf-signal__foot button:focus-visible { background:rgba(80,216,255,.2); outline:2px solid #9cecff; outline-offset:2px; }
  .sf-signal__foot button:disabled { opacity:.55; cursor:default; }
  #sf-signal-investigation.sf-signal--receipt { border-color:rgba(98,224,138,.5); border-left-color:#62e08a; }
  #sf-signal-investigation.sf-signal--receipt .sf-signal__head { color:#62e08a; }
  @media (max-width:900px),(max-height:620px) {
    #sf-signal-investigation { top:78px; left:12px; right:12px; width:auto; padding:8px 10px; }
    .sf-signal__headline { font-size:12px; } .sf-signal__detail { font-size:9px; }
  }
  @media (prefers-reduced-motion:reduce) { #sf-signal-investigation { transition:none; } }`;
  document.head.appendChild(style);
}

export default createSignalInvestigationPrompt;
