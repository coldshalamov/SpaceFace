// Pirate parley response strip — a non-modal, edge-aligned flight interaction.
//
// The simulation owns eligibility, timing, payment, hostility and escape. This module only reads
// the public pirateParley events, renders their meaning, and emits canonical choices. It never
// pauses flight, writes cargo/credits, or creates a second combat state machine.
import { COMMODITIES } from '../data/commodities.js';
import { FACTION_META } from '../data/factions.js';

const STYLE_ID = 'sf-pirate-parley-style';
const RECEIPT_TTL_S = 4;
const COMMODITY_LABELS = new Map(COMMODITIES.map((c) => [c.id, String(c.name || c.id).replace(/^Refined /i, '')]));
const FACTION_LABELS = new Map(FACTION_META.map((f) => [f.id, String(f.name || f.id)]));
const KEY_CHOICE = Object.freeze({
  Digit1: 'comply', Numpad1: 'comply',
  Digit2: 'refuse', Numpad2: 'refuse',
  Digit3: 'run', Numpad3: 'run',
});

function positiveCargo(state) {
  const items = state && state.player && state.player.cargo && state.player.cargo.items || {};
  return Object.values(items).some((qty) => Number(qty) > 0);
}

export function shouldSurfaceParley(payload, state) {
  if (!payload || !payload.squadId || !payload.deadlineAt || !payload.demand) return false;
  if (!state || state.mode !== 'flight' || state.ui && state.ui.docked) return false;
  if (state.world && state.world.currentSectorId === 'sector_helios_prime') return false;
  if (!positiveCargo(state)) return false;
  const amount = Number(payload.demand.amount != null ? payload.demand.amount : payload.demand.qty);
  return Number.isFinite(amount) && amount > 0 && Number(payload.deadlineAt) > Number(state.simTime || 0);
}

function numberText(value) {
  return Math.max(0, Math.floor(Number(value) || 0)).toLocaleString('en-US');
}

function commodityLabel(id) {
  return COMMODITY_LABELS.get(id) || String(id || 'cargo').replace(/^cmdty_/i, '').replace(/_/g, ' ');
}

export function parleyDemandText(demand) {
  if (!demand) return 'NO VALID DEMAND';
  if (demand.kind === 'credits') return `TRANSFER ${numberText(demand.amount)} CREDITS`;
  const qty = numberText(demand.qty != null ? demand.qty : demand.amount);
  return `JETTISON ${qty} ${commodityLabel(demand.commodityId).toUpperCase()}`;
}

function entityById(state, id) {
  if (!id || !state) return null;
  if (state.entities && typeof state.entities.get === 'function') return state.entities.get(id) || null;
  return (Array.isArray(state.entityList) ? state.entityList : []).find((e) => e && e.id === id) || null;
}

function entityCallsign(entity) {
  const data = entity && entity.data || {};
  const value = data.callsign || data.displayName || data.name || data.def && data.def.name || entity && entity.name;
  return String(value || '').trim();
}

export function parleyHailerText(payload, state) {
  const entity = entityById(state, payload && payload.hailerId);
  const callsign = entityCallsign(entity);
  const factionId = payload && payload.factionId || entity && (entity.factionId || entity.data && entity.data.factionId);
  const faction = FACTION_LABELS.get(factionId) || 'Unregistered raiders';
  return callsign ? `${callsign} · ${faction}` : faction;
}

function paymentText(payload) {
  const payment = payload && payload.payment;
  if (!payment) return '';
  if (payment.kind === 'credits') return `${numberText(payment.amount)} credits transferred`;
  return `${numberText(payment.amount)} ${commodityLabel(payment.commodityId)} jettisoned`;
}

export function parleyReceiptText(payload) {
  const outcome = String(payload && payload.outcome || 'resolved');
  if (outcome === 'complied') return `PAID · ${paymentText(payload) || 'toll settled'} · raiders disengaging`;
  if (outcome === 'unprofitable') return 'NO PAYMENT · hold had no collectible toll · raiders disengaging';
  if (outcome === 'evaded') return 'EVADED · clear of intercept radius · raiders disengaging';
  if (outcome === 'player_attack') return 'ESCALATED · you fired during parley · raiders weapons free';
  if (outcome === 'refused') return 'ESCALATED · you refused the toll · raiders weapons free';
  if (outcome === 'timeout') return 'ESCALATED · response window expired · raiders weapons free';
  return `PARLEY CLOSED · ${outcome.replace(/_/g, ' ')}`;
}

export function parleyRemainingSeconds(deadlineAt, simTime) {
  return Math.max(0, Number(deadlineAt || 0) - Number(simTime || 0));
}

export function createPirateParleyPrompt(ctx) {
  const { state, bus } = ctx;
  injectStyle();

  const root = document.createElement('aside');
  root.id = 'sf-pirate-parley';
  root.hidden = true;
  root.setAttribute('role', 'region');
  root.setAttribute('aria-live', 'polite');
  root.setAttribute('aria-atomic', 'true');
  root.innerHTML = `
    <div class="sf-parley__head">
      <span class="sf-parley__flag">TOLL HAIL</span>
      <span class="sf-parley__sender" data-k="sender">UNREGISTERED RAIDERS</span>
      <span class="sf-parley__timer" data-k="timer">RESPONSE —</span>
    </div>
    <div class="sf-parley__demand" data-k="demand">—</div>
    <div class="sf-parley__why" data-k="why">Cargo toll. Profit motive; weapons held during response.</div>
    <div class="sf-parley__actions" data-k="actions">
      <button type="button" data-choice="comply" aria-label="Comply with pirate demand. Keyboard 1. Controller A."><b>1 · A</b><span>COMPLY</span></button>
      <button type="button" data-choice="refuse" aria-label="Refuse pirate demand and authorize combat. Keyboard 2. Controller B."><b>2 · B</b><span>REFUSE</span></button>
      <button type="button" data-choice="run" aria-label="Run from pirate demand and clear the intercept radius. Keyboard 3. Controller X."><b>3 · X</b><span>RUN 1.2 KM</span></button>
    </div>
    <div class="sf-parley__receipt" data-k="receipt" hidden></div>`;
  document.getElementById('ui-root').appendChild(root);

  const senderEl = root.querySelector('[data-k=sender]');
  const timerEl = root.querySelector('[data-k=timer]');
  const demandEl = root.querySelector('[data-k=demand]');
  const whyEl = root.querySelector('[data-k=why]');
  const actionsEl = root.querySelector('[data-k=actions]');
  const receiptEl = root.querySelector('[data-k=receipt]');
  const runButton = root.querySelector('[data-choice=run]');
  let active = null;
  let lastTimerText = '';
  let destroyed = false;

  function setText(el, value) {
    const text = String(value == null ? '' : value);
    if (el && el.textContent !== text) el.textContent = text;
  }

  function hide() {
    root.hidden = true;
    root.classList.remove('sf-parley--receipt', 'sf-parley--danger', 'sf-parley--running');
    active = null;
    lastTimerText = '';
  }

  function showDemand(payload) {
    if (!shouldSurfaceParley(payload, state)) return false;
    const sender = parleyHailerText(payload, state);
    const demand = parleyDemandText(payload.demand);
    active = { ...payload, phase: 'demand', selected: null };
    setText(senderEl, sender.toUpperCase());
    setText(demandEl, demand);
    setText(whyEl, 'Cargo toll. Profit motive; weapons held during response.');
    whyEl.hidden = false;
    runButton.disabled = false;
    runButton.querySelector('span').textContent = 'RUN 1.2 KM';
    actionsEl.hidden = false;
    receiptEl.hidden = true;
    root.hidden = false;
    root.classList.remove('sf-parley--receipt', 'sf-parley--danger', 'sf-parley--running');
    root.setAttribute('aria-label', `${sender} hailing. ${demand}. Cargo toll for profit. Choose comply, refuse, or run.`);
    updateTimer();
    return true;
  }

  function showReceipt(payload) {
    if (!active || String(active.squadId) !== String(payload && payload.squadId)) return false;
    const text = parleyReceiptText(payload);
    const danger = ['refused', 'timeout', 'player_attack'].includes(String(payload.outcome || ''));
    active = { ...payload, phase: 'receipt', hideAt: Number(state.simTime || 0) + RECEIPT_TTL_S };
    setText(receiptEl, text);
    actionsEl.hidden = true;
    whyEl.hidden = true;
    receiptEl.hidden = false;
    timerEl.textContent = danger ? 'WEAPONS FREE' : 'DISENGAGING';
    root.classList.add('sf-parley--receipt');
    root.classList.toggle('sf-parley--danger', danger);
    root.classList.remove('sf-parley--running');
    root.setAttribute('aria-label', text);
    return true;
  }

  function choose(choice, source) {
    if (!active || active.phase !== 'demand') return false;
    const canonical = choice === 'comply' || choice === 'refuse' || choice === 'run' ? choice : null;
    if (!canonical) return false;
    if (canonical === 'run') {
      active.selected = 'run';
      root.classList.add('sf-parley--running');
      runButton.disabled = true;
      runButton.querySelector('span').textContent = 'RUNNING';
      setText(whyEl, 'Run selected. Clear every raider by 1.2 km before time expires.');
    }
    bus.emit('pirateParley:choose', { squadId: active.squadId, choice: canonical, source });
    return true;
  }

  function updateTimer() {
    if (!active || active.phase !== 'demand') return;
    const remaining = parleyRemainingSeconds(active.deadlineAt, state.simTime);
    const prefix = active.selected === 'run' ? 'CLEAR 1.2 KM' : 'RESPONSE';
    const text = `${prefix} ${remaining.toFixed(1)} S`;
    if (text !== lastTimerText) {
      lastTimerText = text;
      setText(timerEl, text);
      timerEl.setAttribute('aria-label', `${remaining.toFixed(1)} seconds remaining`);
    }
  }

  function onClick(event) {
    const button = event.target && event.target.closest && event.target.closest('[data-choice]');
    if (!button || !root.contains(button)) return;
    choose(button.dataset.choice, 'click');
  }

  function onKeyDown(event) {
    if (!active || active.phase !== 'demand' || event.altKey || event.ctrlKey || event.metaKey) return;
    const choice = KEY_CHOICE[event.code];
    if (!choice) return;
    event.preventDefault();
    event.stopPropagation();
    choose(choice, 'keyboard');
  }

  function tick() {
    if (destroyed || !active) return;
    if (state.mode !== 'flight' || state.ui && state.ui.docked) {
      hide();
      return;
    }
    if (active.phase === 'receipt') {
      if (Number(state.simTime || 0) >= active.hideAt) hide();
      return;
    }
    updateTimer();
    const actions = ctx.gamepad && ctx.gamepad.actions || {};
    if (actions.accept && actions.accept.pressed) choose('comply', 'gamepad');
    else if (actions.cancel && actions.cancel.pressed) choose('refuse', 'gamepad');
    else if (actions.cycleTarget && actions.cycleTarget.pressed) choose('run', 'gamepad');
  }

  function destroy() {
    destroyed = true;
    document.removeEventListener('keydown', onKeyDown, true);
    root.removeEventListener('click', onClick);
    root.remove();
  }

  root.addEventListener('click', onClick);
  document.addEventListener('keydown', onKeyDown, true);
  bus.on('pirateParley:demand', showDemand);
  bus.on('pirateParley:resolved', showReceipt);
  bus.on('game:new', hide);
  bus.on('game:load', hide);

  return { el: root, tick, hide, destroy, showDemand, showReceipt, choose };
}

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
  #sf-pirate-parley {
    position:absolute; top:112px; right:16px; width:min(390px, calc(100vw - 32px)); z-index:1080;
    box-sizing:border-box; padding:10px 12px 11px; pointer-events:none;
    background:rgba(5,9,18,.92); border:1px solid rgba(255,179,92,.44); border-left:3px solid #ffb35c;
    color:#d7e6ff; font-family:var(--mono, Consolas, monospace); contain:layout paint style;
    opacity:1; transform:translateX(0); transition:opacity .16s ease-out, transform .16s ease-out;
  }
  #sf-pirate-parley[hidden] { display:none !important; }
  .sf-parley__head { display:grid; grid-template-columns:auto minmax(0,1fr) auto; gap:8px; align-items:baseline; }
  .sf-parley__flag, .sf-parley__timer { font-size:9px; letter-spacing:.14em; color:#ffb35c; white-space:nowrap; }
  .sf-parley__sender { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
    font-size:10px; letter-spacing:.08em; color:#84a0c8; }
  .sf-parley__demand { margin-top:6px; font-size:15px; line-height:1.2; letter-spacing:.04em; color:#d7e6ff; }
  .sf-parley__why { margin-top:3px; font-size:11px; line-height:1.35; color:#84a0c8; }
  .sf-parley__actions { display:grid; grid-template-columns:repeat(3,1fr); gap:6px; margin-top:9px; pointer-events:auto; }
  .sf-parley__actions[hidden], .sf-parley__why[hidden], .sf-parley__receipt[hidden] { display:none !important; }
  .sf-parley__actions button { min-width:0; min-height:34px; display:flex; align-items:center; justify-content:center; gap:6px;
    background:rgba(57,208,255,.05); border:1px solid rgba(57,208,255,.34); color:#d7e6ff;
    font:10px var(--mono, Consolas, monospace); letter-spacing:.08em; cursor:pointer; }
  .sf-parley__actions button:hover, .sf-parley__actions button:focus-visible {
    outline:2px solid #39d0ff; outline-offset:1px; background:rgba(57,208,255,.12); }
  .sf-parley__actions button b { color:#39d0ff; font-size:9px; font-weight:400; }
  .sf-parley__actions button[data-choice=refuse] { border-color:rgba(255,92,92,.38); }
  .sf-parley__actions button[data-choice=refuse] b { color:#ff5c5c; }
  .sf-parley__actions button:disabled { cursor:default; border-color:rgba(255,179,92,.54); color:#ffb35c; opacity:1; }
  .sf-parley__receipt { margin-top:7px; font-size:12px; line-height:1.4; color:#39d0ff; letter-spacing:.03em; }
  #sf-pirate-parley.sf-parley--danger { border-color:rgba(255,92,92,.58); border-left-color:#ff5c5c; }
  #sf-pirate-parley.sf-parley--danger .sf-parley__flag,
  #sf-pirate-parley.sf-parley--danger .sf-parley__timer,
  #sf-pirate-parley.sf-parley--danger .sf-parley__receipt { color:#ff5c5c; }
  #sf-pirate-parley.sf-parley--running { border-left-color:#39d0ff; }
  @media (max-width:900px), (max-height:620px) {
    #sf-pirate-parley { top:78px; left:12px; right:12px; width:auto; padding:8px 10px 9px; }
    .sf-parley__demand { font-size:13px; }
    .sf-parley__why { font-size:10px; }
    .sf-parley__actions { margin-top:7px; }
    .sf-parley__actions button { min-height:32px; font-size:9px; }
  }
  @media (max-width:520px) {
    .sf-parley__head { grid-template-columns:auto minmax(0,1fr); }
    .sf-parley__timer { grid-column:1 / -1; }
    .sf-parley__actions button { flex-direction:column; gap:2px; }
  }
  @media (prefers-reduced-motion:reduce) {
    #sf-pirate-parley { transition:none; }
  }`;
  document.head.appendChild(style);
}

export default createPirateParleyPrompt;
