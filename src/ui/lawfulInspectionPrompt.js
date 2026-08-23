// src/ui/lawfulInspectionPrompt.js -- narrow player decision surface for PQ-048.06.
//
// LawSecurity owns the case and economy owns the actual scan. This non-modal presenter only makes
// the one truthful player choice reachable: comply now, or physically fly beyond patrol range.

import { isUiInteractionFenced } from './input.js';

const STYLE_ID = 'sf-lawful-inspection-style';
const RESULT_TTL_S = 3;

export function createLawfulInspectionPrompt(ctx = {}) {
  const state = ctx.state || {};
  const bus = ctx.bus;
  const doc = ctx.document || (typeof document !== 'undefined' ? document : null);
  if (!doc || typeof doc.createElement !== 'function' || !bus || typeof bus.on !== 'function') {
    return inertPrompt();
  }

  injectStyle(doc);
  const mount = ctx.mount || doc.getElementById('ui-root') || doc.body;
  const root = doc.createElement('aside');
  root.id = 'sf-lawful-inspection';
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'false');
  root.setAttribute('aria-live', 'polite');
  root.setAttribute('aria-atomic', 'true');
  root.setAttribute('aria-labelledby', 'sf-lawful-inspection-title');
  root.setAttribute('aria-describedby', 'sf-lawful-inspection-status');

  const eyebrow = doc.createElement('div');
  eyebrow.className = 'sf-lawful-inspection__eyebrow';
  eyebrow.textContent = 'CONCORD TRAFFIC CONTROL';
  const title = doc.createElement('h2');
  title.id = 'sf-lawful-inspection-title';
  const status = doc.createElement('p');
  status.id = 'sf-lawful-inspection-status';
  status.className = 'sf-lawful-inspection__status';
  const escape = doc.createElement('p');
  escape.className = 'sf-lawful-inspection__escape';
  const actions = doc.createElement('div');
  actions.className = 'sf-lawful-inspection__actions';
  root.appendChild(eyebrow);
  root.appendChild(title);
  root.appendChild(status);
  root.appendChild(escape);
  root.appendChild(actions);
  if (mount && typeof mount.appendChild === 'function') mount.appendChild(root);

  let active = null;
  let mode = 'hidden';
  let resultExpiresAt = null;
  let button = null;
  let destroyed = false;
  const offs = [];

  function canSurface() {
    return state.mode === 'flight' && !(state.ui && state.ui.docked) && !isUiInteractionFenced(state);
  }

  function hide() {
    active = null;
    mode = 'hidden';
    resultExpiresAt = null;
    button = null;
    actions.replaceChildren();
    root.hidden = true;
    root.setAttribute('aria-busy', 'false');
  }

  function offered(payload) {
    if (destroyed || !canSurface() || !isCase(payload)) return false;
    active = {
      id: payload.id,
      deadlineAt: finiteOrNull(payload.deadlineAt),
      patrolWorldRecordId: payload.patrolWorldRecordId,
    };
    mode = 'offered';
    resultExpiresAt = null;
    title.textContent = 'LAWFUL CARGO INSPECTION';
    status.textContent = offerStatus(active.deadlineAt, state.simTime);
    escape.textContent = 'OR BREAK RANGE TO ESCAPE';
    button = doc.createElement('button');
    button.type = 'button';
    button.dataset.choice = 'comply';
    button.dataset.key = '1';
    button.textContent = 'COMPLY — HOLD FOR SCAN';
    button.setAttribute('aria-label', 'Comply. Hold for cargo scan.');
    button.setAttribute('aria-keyshortcuts', '1');
    button.addEventListener('click', () => choose('click'));
    actions.replaceChildren(button);
    root.setAttribute('aria-busy', 'false');
    root.hidden = false;
    return true;
  }

  function scanning(payload) {
    if (destroyed || !canSurface() || !isCase(payload)) return false;
    if (active && active.id !== payload.id) return false;
    active = {
      id: payload.id,
      deadlineAt: finiteOrNull(payload.deadlineAt),
      patrolWorldRecordId: payload.patrolWorldRecordId,
    };
    mode = 'scanning';
    title.textContent = 'CARGO SCAN IN PROGRESS';
    status.textContent = 'Hold position while Concord reads the manifest.';
    // The owner scan is synchronous once compliance is transmitted; do not advertise an escape
    // action after the player has already chosen to submit.
    escape.textContent = 'SCAN AUTHORIZED — HOLD POSITION';
    if (button) button.disabled = true;
    actions.replaceChildren();
    root.setAttribute('aria-busy', 'true');
    root.hidden = false;
    return true;
  }

  function resolved(payload) {
    if (destroyed || !payload || typeof payload.outcome !== 'string') return false;
    if (!canSurface()) { hide(); return false; }
    active = null;
    mode = 'resolved';
    title.textContent = 'INSPECTION RESULT';
    status.textContent = resultText(payload.outcome);
    escape.textContent = '';
    actions.replaceChildren();
    root.setAttribute('aria-busy', 'false');
    root.hidden = false;
    resultExpiresAt = (finiteOrNull(payload.resolvedAt) ?? simNow(state)) + RESULT_TTL_S;
    return true;
  }

  function choose(source = 'ui') {
    if (destroyed || mode !== 'offered' || !active || !button || button.disabled || isUiInteractionFenced(state)) {
      return false;
    }
    button.disabled = true;
    root.setAttribute('aria-busy', 'true');
    status.textContent = 'TRANSMITTING COMPLIANCE…';
    bus.emit('lawfulInspection:choose', { caseId: active.id, choice: 'comply', source });
    return true;
  }

  function onKeyDown(event) {
    if (destroyed || mode !== 'offered' || !active || !event
      || event.ctrlKey || event.altKey || event.metaKey || !isOneKey(event)) return;
    // The active decision owns Digit1 so a flight binding cannot fire through it.
    if (typeof event.preventDefault === 'function') event.preventDefault();
    if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
    else if (typeof event.stopPropagation === 'function') event.stopPropagation();
    choose('keyboard');
  }

  function tick() {
    if (destroyed || root.hidden) return;
    if (!canSurface()) { hide(); return; }
    if (mode === 'offered' && active) status.textContent = offerStatus(active.deadlineAt, state.simTime);
    if (mode === 'resolved' && Number.isFinite(resultExpiresAt) && simNow(state) >= resultExpiresAt) hide();
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    for (const off of offs) {
      try { if (typeof off === 'function') off(); } catch (_error) { /* best-effort teardown */ }
    }
    offs.length = 0;
    hide();
    root.remove();
  }

  offs.push(bus.on('lawfulInspection:offered', offered));
  offs.push(bus.on('lawfulInspection:scanning', scanning));
  offs.push(bus.on('lawfulInspection:resolved', resolved));
  offs.push(bus.on('sector:exit', hide));
  offs.push(bus.on('game:new', hide));
  offs.push(bus.on('game:load', hide));
  if (typeof doc.addEventListener === 'function') {
    doc.addEventListener('keydown', onKeyDown, true);
    offs.push(() => doc.removeEventListener('keydown', onKeyDown, true));
  }

  return {
    el: root,
    get button() { return button; },
    offered,
    scanning,
    resolved,
    hide,
    choose,
    tick,
    destroy,
  };
}

function isCase(payload) {
  return !!(payload && typeof payload.id === 'string' && payload.id
    && typeof payload.patrolWorldRecordId === 'string' && payload.patrolWorldRecordId);
}

function simNow(state) {
  const value = Number(state && state.simTime);
  return Number.isFinite(value) ? value : 0;
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function offerStatus(deadlineAt, simTime) {
  if (!Number.isFinite(deadlineAt)) return 'Patrol requests a manifest scan. Flight remains active.';
  const remaining = Math.max(0, deadlineAt - (Number(simTime) || 0));
  return `Comply now or hold course · ${Math.ceil(remaining)} seconds`;
}

function resultText(outcome) {
  switch (outcome) {
    case 'cleared': return 'HOLD CLEAR — Concord releases your ship.';
    case 'contraband_discovered': return 'CONTRABAND SEIZED — cargo and penalty recorded.';
    case 'escaped': return 'INSPECTION ESCAPED — Concord records the refusal.';
    case 'collateral_assault': return 'INSPECTION ABORTED — firing on patrol is a lawful assault.';
    case 'collateral_patrol_destroyed': return 'PATROL DESTROYED — Concord records the attack.';
    case 'cloak_evaded': return 'PATROL LOST THE TRACE — inspection aborted.';
    default: return 'INSPECTION INTERRUPTED — no scan result recorded.';
  }
}

function isOneKey(event) {
  return String(event.key || '') === '1' || /^(?:Digit|Numpad)1$/.test(String(event.code || ''));
}

function injectStyle(doc) {
  if (!doc.head || doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
  #sf-lawful-inspection { position:absolute; right:28px; top:clamp(184px,23vh,280px); z-index:86;
    width:min(360px,calc(100vw - 40px)); box-sizing:border-box; padding:14px 15px 15px;
    border:1px solid rgba(216,170,51,.56); border-top:3px solid #d8aa33;
    background:linear-gradient(135deg,rgba(20,16,7,.98),rgba(8,10,13,.95)); color:#fff4d4;
    font-family:var(--mono,Consolas,monospace); box-shadow:0 18px 36px rgba(0,0,0,.36); pointer-events:auto; }
  #sf-lawful-inspection[hidden] { display:none !important; }
  .sf-lawful-inspection__eyebrow { color:#f3ca68; font-size:12px; font-weight:700; letter-spacing:.2em; }
  #sf-lawful-inspection-title { margin:7px 0 0; font:700 17px/1.2 var(--mono,Consolas,monospace); letter-spacing:.025em; }
  .sf-lawful-inspection__status { margin:6px 0 0; color:#eadbb7; font-size:12px; line-height:1.35; }
  .sf-lawful-inspection__escape { min-height:1.35em; margin:7px 0 0; color:#e8bd56; font:700 12px/1.35 var(--mono,Consolas,monospace); letter-spacing:.12em; }
  .sf-lawful-inspection__actions { display:grid; gap:6px; margin-top:12px; }
  .sf-lawful-inspection__actions button { min-height:42px; position:relative; padding:8px 11px 8px 44px;
    border:1px solid rgba(243,202,104,.45); background:rgba(216,170,51,.11); color:#fff4d4;
    text-align:left; font:700 12px/1.25 var(--mono,Consolas,monospace); letter-spacing:.025em; cursor:pointer;
    transition:transform .14s ease, border-color .14s ease, background .14s ease; }
  .sf-lawful-inspection__actions button::before { content:attr(data-key); position:absolute; left:10px; top:50%;
    width:22px; height:22px; display:grid; place-items:center; transform:translateY(-50%); border:1px solid rgba(243,202,104,.58);
    color:#f3ca68; font-size:12px; letter-spacing:0; }
  .sf-lawful-inspection__actions button:hover,.sf-lawful-inspection__actions button:focus-visible { transform:translateX(-2px);
    border-color:#ffe39a; background:rgba(243,202,104,.19); outline:2px solid #ffe39a; outline-offset:2px; }
  .sf-lawful-inspection__actions button:disabled { opacity:.56; cursor:wait; transform:none; }
  @media (max-width:820px) { #sf-lawful-inspection { left:50%; right:auto; top:auto; bottom:104px;
    transform:translateX(-50%); width:min(400px,calc(100vw - 24px)); } }
  @media (prefers-reduced-motion:reduce) { .sf-lawful-inspection__actions button { transition:none !important; } }`;
  doc.head.appendChild(style);
}

function inertPrompt() {
  return {
    el: null,
    get button() { return null; },
    offered: () => false,
    scanning: () => false,
    resolved: () => false,
    hide: () => {},
    choose: () => false,
    tick: () => {},
    destroy: () => {},
  };
}
