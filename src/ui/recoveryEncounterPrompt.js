// Compact, non-modal presenter for the physical derelict recovery state machine.
// Simulation owns range, condition, hazards, stabilization, settlement and persistence.

import { isUiInteractionFenced } from './input.js';
import { stationName } from './sectorLawPresenter.js';

const STYLE_ID = 'sf-recovery-encounter-style';
const RECEIPT_TTL_S = 6;

export function recoveryOutcomeText(receipt) {
  const outcome = String(receipt && receipt.outcome || 'closed');
  if (outcome === 'rescue') return 'SURVIVOR RECOVERED';
  if (outcome === 'blackbox') return 'BLACK BOX SECURED';
  if (outcome === 'strip') return 'COMPONENTS RECOVERED';
  if (receipt && receipt.failure === 'reactor_burst') return 'RECOVERY LOST · CORE BURST';
  return `RECOVERY ${outcome.replace(/_/g, ' ').toUpperCase()}`;
}

export function recoveryStabilizationText(readout) {
  if (readout && readout.poweredSurprise === 'defense_drone') {
    return 'Defense drone awake. Fight, withdraw, or stabilize under fire; helm control remains yours.';
  }
  if (readout && readout.stabilizationMode === 'massline') return 'Massline holding. Keep the wreck settled.';
  if (readout && readout.stabilizationMode === 'station_keeping') return 'Relative motion matched. Hold position.';
  return 'Tether the wreck, or hold within 90 WU at matched speed.';
}

function money(value) {
  return Math.max(0, Math.round(Number(value) || 0)).toLocaleString('en-US');
}

function receiptDetail(receipt) {
  if (receipt && receipt.failure === 'reactor_burst') return 'The telegraphed reactor window closed. No salvage remained.';
  const parts = [];
  if (receipt && receipt.credits) parts.push(`${money(receipt.credits)} credits`);
  if (receipt && receipt.repDelta) parts.push(`${receipt.repDelta > 0 ? '+' : ''}${receipt.repDelta} reputation`);
  const cargo = Object.values(receipt && receipt.cargo || {}).reduce((sum, amount) => sum + (Number(amount) || 0), 0);
  if (cargo) parts.push(`${cargo} cargo units`);
  return parts.length ? parts.join(' · ') : 'Outcome recorded. No duplicate settlement.';
}

function words(value) {
  return String(value == null ? '' : value).replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}

function recoveryLossText(reason) {
  switch (String(reason || 'lost')) {
    case 'drive_restored': return 'Drive restored before custody transfer.';
    case 'timed_out': return 'Civilian recovery deadline expired.';
    case 'destroyed': return 'Disabled civilian freighter was destroyed.';
    case 'sector_exit': return 'Recovery abandoned on sector departure.';
    case 'tether_broke': return 'Massline connection broke before transfer.';
    case 'released': return 'Massline connection was released before transfer.';
    case 'identity_invalid': return 'Civilian manifest identity changed; recovery closed.';
    case 'destination_unavailable': return 'The lawful recovery destination is no longer available.';
    default: return `Recovery closed: ${words(reason || 'lost')}.`;
  }
}

function remainingSeconds(payload, simTime) {
  const rawDueAt = payload && (payload.recoveryKind === 'surrendered' ? payload.escapeAt : payload.deadlineAt);
  if (rawDueAt == null) return null;
  const dueAt = Number(rawDueAt);
  return Number.isFinite(dueAt) ? Math.max(0, Math.ceil(dueAt - Number(simTime || 0))) : null;
}

function receiptRecoveryId(payload) {
  return String(payload && (payload.recoveryId || payload.id) || 'recovery');
}

function isCustodyReceipt(payload) {
  return !!(payload && (payload.shape === 'surrender_custody' || payload.shape === 'civilian_freight_recovery'));
}

export function recoveryCustodyView(payload, state, simTime = state && state.simTime || 0) {
  if (!payload || (!payload.id && !payload.recoveryId)) return null;
  const receipt = isCustodyReceipt(payload);
  const recoveryKind = String(payload.recoveryKind || (payload.shape === 'civilian_freight_recovery' ? 'civilian_disabled' : 'surrendered'));
  const phase = receipt
    ? (payload.outcome === 'recovered' || payload.outcome === 'custody' ? 'success' : 'lost')
    : String(payload.phase || 'awaiting_tether');
  const terminal = receipt || ['lost', 'escaped', 'custody', 'recovered'].includes(phase);
  const destinationId = payload.stationId || payload.destinationStationId || null;
  const destination = stationName(state, destinationId);
  const label = String(payload.label || (recoveryKind === 'civilian_disabled'
    ? 'Disabled civilian freighter' : recoveryKind === 'drive_disabled' ? 'Disabled ship' : 'Surrendered ship'));
  const threshold = Math.max(0, Number(payload.secureReel_wu) || 60);
  const cargo = Math.max(0, Math.floor(Number(payload.remainingQty) || 0));
  const credits = Math.max(0, Math.round(Number(payload.credits != null ? payload.credits : payload.rewardCr) || 0));
  const remaining = remainingSeconds(payload, simTime);
  const activeRemaining = terminal ? null : remaining;
  const timerStatus = activeRemaining == null ? null : `${recoveryKind === 'surrendered' ? 'ESCAPE' : 'WINDOW'} ${activeRemaining} S`;
  const cargoText = recoveryKind === 'civilian_disabled' || payload.shape === 'civilian_freight_recovery'
    ? `${cargo} CARGO` : `${credits} CREDIT CUSTODY`;
  const destinationText = destinationId ? destination.toUpperCase() : 'LAWFUL STATION';
  let flag = recoveryKind === 'civilian_disabled' ? 'CIVILIAN RECOVERY' : 'NONLETHAL CUSTODY';
  let status = timerStatus || 'OPEN';
  let headline = label.toUpperCase();
  let meta = [cargoText, destinationText].filter(Boolean).join(' · ');
  let detail = '';

  if (receipt) {
    const success = payload.outcome === 'recovered' || payload.outcome === 'custody';
    flag = success ? 'CUSTODY RECEIPT' : 'RECOVERY CLOSED';
    status = success ? 'SUCCESS' : 'LOST';
    headline = String(payload.text || (success ? 'RECOVERY TRANSFER COMPLETE' : `RECOVERY LOST - ${words(payload.outcome)}`)).toUpperCase();
    meta = [
      `${credits} CREDITS`,
      payload.shape === 'civilian_freight_recovery' ? `${cargo} CARGO` : null,
      destinationId ? destination.toUpperCase() : null,
      success ? 'OUTCOME SUCCESS' : `REASON ${words(payload.outcome).toUpperCase()}`,
    ].filter(Boolean).join(' · ');
    detail = `Receipt ${String(payload.id)}.`;
  } else if (phase === 'tethered') {
    detail = `Line attached. Reel to ${threshold} WU for custody lock, then tow to ${destination}.`;
  } else if (phase === 'secured') {
    status = timerStatus || 'LOCKED';
    detail = `Custody locked. Tow ${label} to ${destination}.`;
  } else if (phase === 'escaped') {
    flag = 'RECOVERY CLOSED';
    status = 'ESCAPED';
    headline = `${label.toUpperCase()} ESCAPED`;
    meta = 'OUTCOME ESCAPED · REASON SURRENDER WINDOW EXPIRED · 0 CREDITS';
    detail = 'Surrender window expired; contact escaped.';
  } else if (phase === 'lost') {
    const reason = String(payload.lostReason || payload.reason || 'lost');
    flag = 'RECOVERY CLOSED';
    status = 'LOST';
    headline = `RECOVERY LOST · ${words(reason).toUpperCase()}`;
    meta = ['0 CREDITS', recoveryKind === 'civilian_disabled' ? cargoText : null, destinationText, `REASON ${words(reason).toUpperCase()}`].filter(Boolean).join(' · ');
    detail = recoveryLossText(reason);
  } else if (payload.instruction && /relatch/i.test(payload.instruction)) {
    detail = String(payload.instruction);
  } else if (recoveryKind === 'drive_disabled') {
    detail = `Drive disabled; Massline latch and reel inside ${threshold} WU, then tow to ${destination}.`;
  } else {
    const cargoClause = recoveryKind === 'civilian_disabled' ? ` ${cargo} cargo` : '';
    detail = `Massline latch and reel inside ${threshold} WU${recoveryKind === 'surrendered' ? ' before escape' : ''}, then tow${cargoClause} to ${destination}.`;
  }

  const timerAria = activeRemaining == null ? '' : ` ${activeRemaining} seconds remaining.`;
  const announcementKey = `${receiptRecoveryId(payload)}:${terminal ? `terminal:${payload.outcome || payload.lostReason || phase}` : phase}`;
  return Object.freeze({
    source: payload,
    recoveryId: receiptRecoveryId(payload),
    recoveryKind,
    phase,
    terminal,
    flag,
    status,
    headline,
    meta,
    detail,
    remaining: activeRemaining,
    announcementKey,
    ariaLabel: `${flag}. ${headline}. ${meta}. ${detail}.${timerAria}`.replace(/\s+/g, ' ').trim(),
  });
}

export function createRecoveryEncounterPrompt(ctx) {
  const { state, bus } = ctx;
  injectStyle();
  const root = document.createElement('aside');
  root.id = 'sf-recovery-encounter';
  root.hidden = true;
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'polite');
  root.setAttribute('aria-atomic', 'true');
  root.innerHTML = `
    <div class="sf-recovery__head"><span data-k="flag">DERELICT RECOVERY</span><span data-k="status">—</span></div>
    <div class="sf-recovery__headline" data-k="headline">—</div>
    <div class="sf-recovery__meta" data-k="meta">—</div>
    <div class="sf-recovery__detail" data-k="detail">—</div>
    <div class="sf-recovery__meter" data-k="meter" hidden><i data-k="fill"></i></div>
    <div class="sf-recovery__actions" data-k="actions" hidden></div>`;
  document.getElementById('ui-root').appendChild(root);
  const el = Object.fromEntries(['flag', 'status', 'headline', 'meta', 'detail', 'meter', 'fill', 'actions']
    .map((key) => [key, root.querySelector(`[data-k=${key}]`)]));
  let active = null;
  let destroyed = false;
  let lastAnnouncementKey = '';
  let lastCountdownSecond = null;
  const unsubscribers = [];

  function text(node, value) {
    const next = String(value == null ? '' : value);
    if (node && node.textContent !== next) node.textContent = next;
  }

  function canSurface() {
    return state && state.mode === 'flight' && !(state.ui && state.ui.docked);
  }

  function hide() {
    root.hidden = true;
    root.className = '';
    active = null;
    lastAnnouncementKey = '';
    lastCountdownSecond = null;
  }

  function syncMotionPreference() {
    const next = state && state.settings && state.settings.video && state.settings.video.motionReduce
      ? 'true' : 'false';
    if (root.dataset.reducedMotion !== next) root.dataset.reducedMotion = next;
  }

  function actionButton(choice, key, label, disabled = false, title = '') {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.choice = choice;
    button.disabled = disabled;
    button.title = title || label;
    button.setAttribute('aria-label', `${label}. ${key === 'A' ? 'Controller A' : key === 'B' ? 'Controller B' : 'Controller X'}. ${title}`.trim());
    button.innerHTML = `<b>${key}</b><span>${label}</span>`;
    return button;
  }

  function renderActions(readout) {
    el.actions.replaceChildren();
    if (readout.mode === 'unique-wreck') {
      for (const [index, choice] of (readout.choices || []).entries()) {
        el.actions.appendChild(actionButton(choice.id, index === 0 ? 'A' : 'B', choice.label, false, choice.consequence));
      }
      el.actions.hidden = !(readout.choices || []).length;
      return;
    }
    if (readout.phase === 'hazard') {
      el.actions.appendChild(actionButton('vent', 'A', 'VENT CORE', false, 'Vent the reactor before its timer closes.'));
      el.actions.hidden = false;
      return;
    }
    if (readout.phase !== 'decision') {
      el.actions.hidden = true;
      return;
    }
    el.actions.appendChild(actionButton('rescue', 'A', 'RESCUE', !readout.hasSurvivor,
      readout.hasSurvivor ? 'Recover the survivor and earn claimant goodwill.' : 'No life signs detected.'));
    el.actions.appendChild(actionButton('blackbox', 'B', 'BLACK BOX', false, 'Recover the flight record and return registered evidence.'));
    el.actions.appendChild(actionButton('strip', 'X', 'STRIP', false, 'Take components; claimed or restricted wrecks carry reputation consequences.'));
    el.actions.hidden = false;
  }

  function render(readout) {
    if (!canSurface() || !readout || !readout.recoveryId) return false;
    active = { ...readout, mode: 'encounter', hideAt: Infinity };
    lastAnnouncementKey = '';
    syncMotionPreference();
    el.status.removeAttribute('aria-hidden');
    root.className = readout.phase === 'hazard' || readout.poweredSurprise === 'defense_drone'
      ? 'sf-recovery--hazard' : '';
    text(el.flag, 'DERELICT RECOVERY');
    text(el.headline, readout.conditionLabel || 'UNIDENTIFIED DERELICT');
    const ownership = readout.ownership || 'CLAIM UNKNOWN';
    const legal = readout.legalStatus ? String(readout.legalStatus).replace(/_/g, ' ').toUpperCase() : 'SCAN REQUIRED';
    text(el.meta, `${ownership} · ${legal}`);
    el.meter.hidden = true;

    if (readout.phase === 'awaiting_scan') {
      text(el.status, 'IDENTIFY');
      text(el.detail, 'Pulse scanner within 260 WU. Condition and ownership are still unknown.');
    } else if (readout.phase === 'hazard') {
      text(el.status, `CORE ${Math.max(0, Number(readout.hazardRemaining_s) || 0).toFixed(1)} S`);
      text(el.detail, `Vent now, or tether and tow ${readout.towClear_wu || 260} WU clear.`);
    } else if (readout.phase === 'stabilizing') {
      const pct = Math.round((Number(readout.stabilization) || 0) * 100);
      text(el.status, `STABILIZE ${pct}%`);
      text(el.detail, recoveryStabilizationText(readout));
      el.meter.hidden = false;
      el.fill.style.transform = `scaleX(${Math.max(0, Math.min(1, Number(readout.stabilization) || 0))})`;
    } else if (readout.phase === 'decision') {
      text(el.status, 'STABLE · CHOOSE');
      text(el.detail, readout.retryReason === 'cargo_full'
        ? 'Hold full. Make cargo space, then choose again.'
        : readout.retryReason === 'no_life_signs'
          ? 'No life signs. Recover the box or strip components.'
          : 'Method sets cargo, payout, and reputation.');
    }
    renderActions(readout);
    root.setAttribute('aria-label', `Derelict recovery. ${el.status.textContent}. ${el.headline.textContent}. ${el.meta.textContent}. ${el.detail.textContent}`);
    root.hidden = false;
    return true;
  }

  function renderUniqueWreck(readout) {
    if (!canSurface() || !readout || !readout.wreckId || !Array.isArray(readout.choices)) return false;
    active = { ...readout, mode: 'unique-wreck', hideAt: Infinity };
    lastAnnouncementKey = '';
    syncMotionPreference();
    el.status.removeAttribute('aria-hidden');
    root.className = 'sf-recovery--unique';
    text(el.flag, 'NAMED WRECK CLAIM');
    text(el.status, 'RECOVERED · CHOOSE');
    text(el.headline, readout.headline || 'UNIQUE RECOVERY');
    text(el.meta, 'ONE SETTLEMENT · SAVES IMMEDIATELY · NO DUPLICATE CLAIM');
    text(el.detail, readout.prompt || 'Choose who receives the recovered systems.');
    el.meter.hidden = true;
    renderActions(active);
    root.setAttribute('aria-label', `Named wreck claim. ${el.headline.textContent}. ${el.detail.textContent}`);
    root.hidden = false;
    return true;
  }

  function showReceipt(receipt) {
    if (!canSurface() || !receipt) return false;
    active = { mode: 'receipt', hideAt: Number(state.simTime || 0) + RECEIPT_TTL_S };
    lastAnnouncementKey = '';
    syncMotionPreference();
    el.status.removeAttribute('aria-hidden');
    root.className = receipt.failure ? 'sf-recovery--failed' : 'sf-recovery--receipt';
    text(el.flag, receipt.failure ? 'RECOVERY CLOSED' : 'RECOVERY RECEIPT');
    text(el.status, 'LOGGED');
    text(el.headline, recoveryOutcomeText(receipt));
    text(el.meta, `${receipt.ownership || 'OPEN SALVAGE'} · ${String(receipt.legalStatus || 'open').toUpperCase()}`);
    text(el.detail, receiptDetail(receipt));
    el.meter.hidden = true;
    el.actions.hidden = true;
    root.setAttribute('aria-label', `${recoveryOutcomeText(receipt)}. ${receiptDetail(receipt)} Outcome saved.`);
    root.hidden = false;
    return true;
  }

  function showUniqueReceipt(payload) {
    const receipt = payload && payload.receipt;
    if (!canSurface() || !receipt) return false;
    active = { mode: 'receipt', hideAt: Number(state.simTime || 0) + RECEIPT_TTL_S };
    lastAnnouncementKey = '';
    syncMotionPreference();
    el.status.removeAttribute('aria-hidden');
    root.className = Number(receipt.repDelta) < 0 ? 'sf-recovery--failed' : 'sf-recovery--receipt';
    text(el.flag, 'NAMED RECOVERY RECEIPT');
    text(el.status, 'SAVED');
    text(el.headline, receipt.title || 'RECOVERY CLOSED');
    text(el.meta, `${String(receipt.outcome || 'resolved').replace(/_/g, ' ').toUpperCase()} · EXACT-ONCE CLAIM`);
    text(el.detail, receipt.detail || 'Outcome recorded. No duplicate settlement.');
    el.meter.hidden = true;
    el.actions.hidden = true;
    root.setAttribute('aria-label', `${el.headline.textContent}. ${el.detail.textContent}. Outcome saved.`);
    root.hidden = false;
    return true;
  }

  function renderCustody(payload) {
    const view = recoveryCustodyView(payload, state, state && state.simTime || 0);
    if (destroyed || !canSurface() || !view) return false;
    active = {
      mode: 'custody',
      payload: { ...payload },
      view,
      hideAt: view.terminal ? Number(state.simTime || 0) + RECEIPT_TTL_S : Infinity,
    };
    syncMotionPreference();
    root.className = view.terminal
      ? (view.status === 'SUCCESS' ? 'sf-recovery--receipt sf-recovery--custody' : 'sf-recovery--failed sf-recovery--custody')
      : 'sf-recovery--custody';
    text(el.flag, view.flag);
    text(el.status, view.status);
    el.status.setAttribute('aria-hidden', 'true');
    text(el.headline, view.headline);
    text(el.meta, view.meta);
    text(el.detail, view.detail);
    el.meter.hidden = true;
    el.actions.replaceChildren();
    el.actions.hidden = true;
    if (view.announcementKey !== lastAnnouncementKey) {
      root.setAttribute('aria-label', view.ariaLabel);
      lastAnnouncementKey = view.announcementKey;
    }
    lastCountdownSecond = Math.floor(Number(state.simTime || 0));
    root.hidden = false;
    return true;
  }

  function choose(choice, source) {
    if (isUiInteractionFenced(state) || !active) return false;
    if (active.mode === 'unique-wreck') {
      if (!(active.choices || []).some((entry) => entry.id === choice)) return false;
      bus.emit('uniqueWreck:choose', { wreckId: active.wreckId, choiceId: choice, source });
      return true;
    }
    if (active.mode !== 'encounter') return false;
    if (choice === 'vent') bus.emit('recovery:vent', { recoveryId: active.recoveryId, source });
    else bus.emit('recovery:choose', { recoveryId: active.recoveryId, choice, source });
    return true;
  }

  function onClick(event) {
    if (isUiInteractionFenced(state)) return;
    const button = event.target && event.target.closest && event.target.closest('[data-choice]');
    if (!button || button.disabled || !root.contains(button)) return;
    choose(button.dataset.choice, 'click');
  }

  function tick() {
    if (destroyed || !active || isUiInteractionFenced(state)) return;
    if (!canSurface()) { hide(); return; }
    syncMotionPreference();
    if (active.mode === 'receipt') {
      if (Number(state.simTime || 0) >= active.hideAt) hide();
      return;
    }
    if (active.mode === 'custody') {
      if (active.hideAt <= Number(state.simTime || 0)) { hide(); return; }
      if (!active.view.terminal) {
        const simSecond = Math.floor(Number(state.simTime || 0));
        if (simSecond !== lastCountdownSecond) {
          lastCountdownSecond = simSecond;
          const view = recoveryCustodyView(active.payload, state, state.simTime);
          active.view = view;
          text(el.status, view.status);
        }
      }
      return;
    }
    const actions = ctx.gamepad && ctx.gamepad.actions || {};
    if (active.phase === 'hazard' && actions.accept && actions.accept.pressed) choose('vent', 'gamepad');
    else if (active.mode === 'unique-wreck') {
      const choices = active.choices || [];
      if (actions.accept && actions.accept.pressed && choices[0]) choose(choices[0].id, 'gamepad');
      else if (actions.cancel && actions.cancel.pressed && choices[1]) choose(choices[1].id, 'gamepad');
    }
    else if (active.phase === 'decision') {
      if (actions.accept && actions.accept.pressed && active.hasSurvivor) choose('rescue', 'gamepad');
      else if (actions.cancel && actions.cancel.pressed) choose('blackbox', 'gamepad');
      else if (actions.cycleTarget && actions.cycleTarget.pressed) choose('strip', 'gamepad');
    }
  }

  function destroy() {
    destroyed = true;
    for (const unsubscribe of unsubscribers.splice(0)) {
      try { if (typeof unsubscribe === 'function') unsubscribe(); } catch (_) {}
    }
    root.removeEventListener('click', onClick);
    root.remove();
  }

  function subscribe(event, handler) {
    const unsubscribe = bus.on(event, handler);
    if (typeof unsubscribe === 'function') unsubscribers.push(unsubscribe);
    else if (bus && typeof bus.off === 'function') unsubscribers.push(() => bus.off(event, handler));
  }

  root.addEventListener('click', onClick);
  for (const event of ['recovery:started', 'recovery:identified', 'recovery:defenseAwake', 'recovery:hazardCleared', 'recovery:readout', 'recovery:decisionReady', 'recovery:retryAvailable']) {
    subscribe(event, render);
  }
  subscribe('recovery:completed', showReceipt);
  subscribe('uniqueWreck:decisionReady', renderUniqueWreck);
  subscribe('uniqueWreck:resolved', showUniqueReceipt);
  subscribe('pirateParley:demand', hide);
  subscribe('pirateParley:resolved', () => bus.emit('uniqueWreck:decisionRequest', { source: 'pirate-parley-cleared' }));
  subscribe('law:distressRaised', hide);
  subscribe('law:incidentResolved', () => bus.emit('uniqueWreck:decisionRequest', { source: 'law-alert-cleared' }));
  subscribe('game:new', hide);
  subscribe('game:load', hide);
  for (const event of ['surrender:option', 'surrender:updated', 'surrender:tethered', 'surrender:secured', 'surrender:recoveryLost', 'surrender:escaped']) {
    subscribe(event, renderCustody);
  }
  subscribe('encounter:receipt', (payload) => { if (isCustodyReceipt(payload)) renderCustody(payload); });
  return { el: root, tick, hide, destroy, render, renderCustody, renderUniqueWreck, showReceipt, showUniqueReceipt, choose };
}

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
  #sf-recovery-encounter { position:absolute; top:112px; right:16px; width:min(410px,calc(100vw - 32px)); z-index:1068;
    box-sizing:border-box; padding:9px 11px 10px; contain:layout paint style; background:rgba(5,9,18,.93);
    border:1px solid rgba(57,208,255,.4); border-left:3px solid #39d0ff; color:#d7e6ff;
    font-family:var(--mono,Consolas,monospace); transition:opacity .16s ease-out,transform .16s ease-out; }
  #sf-recovery-encounter[hidden] { display:none !important; }
  .sf-recovery__head { display:flex; justify-content:space-between; gap:12px; color:#39d0ff; font-size:9px; letter-spacing:.14em; }
  .sf-recovery__headline { margin-top:5px; font-size:14px; line-height:1.25; letter-spacing:.045em; }
  .sf-recovery__meta { margin-top:3px; color:#91abc9; font-size:9px; line-height:1.35; letter-spacing:.08em; }
  .sf-recovery__detail { margin-top:4px; color:#bdcde3; font-size:10px; line-height:1.4; }
  .sf-recovery__meter { height:3px; margin-top:8px; overflow:hidden; background:rgba(145,171,201,.16); }
  .sf-recovery__meter i { display:block; width:100%; height:100%; transform:scaleX(0); transform-origin:left center; background:#39d0ff; transition:transform .12s ease-out; }
  .sf-recovery__actions { display:flex; justify-content:flex-end; gap:6px; margin-top:8px; pointer-events:auto; }
  .sf-recovery__actions[hidden] { display:none !important; }
  .sf-recovery__actions button { display:flex; align-items:center; gap:5px; min-height:32px; padding:5px 8px; border:1px solid rgba(57,208,255,.52);
    background:rgba(57,208,255,.09); color:#dff8ff; font:700 9px/1.2 var(--mono,Consolas,monospace); letter-spacing:.05em; cursor:pointer; }
  .sf-recovery__actions button b { display:inline-grid; place-items:center; min-width:16px; min-height:16px; border:1px solid rgba(223,248,255,.55); border-radius:50%; font-size:8px; }
  .sf-recovery__actions button:hover,.sf-recovery__actions button:focus-visible { background:rgba(57,208,255,.2); outline:2px solid #9cecff; outline-offset:2px; }
  .sf-recovery__actions button:disabled { opacity:.38; cursor:not-allowed; }
  #sf-recovery-encounter.sf-recovery--hazard { border-color:rgba(255,179,92,.55); border-left-color:#ffb35c; }
  #sf-recovery-encounter.sf-recovery--hazard .sf-recovery__head { color:#ffb35c; }
  #sf-recovery-encounter.sf-recovery--receipt { border-color:rgba(98,224,138,.5); border-left-color:#62e08a; }
  #sf-recovery-encounter.sf-recovery--receipt .sf-recovery__head { color:#62e08a; }
  #sf-recovery-encounter.sf-recovery--unique { border-color:rgba(255,179,92,.58); border-left-color:#ffb35c; }
  #sf-recovery-encounter.sf-recovery--unique .sf-recovery__head { color:#ffb35c; }
  #sf-recovery-encounter.sf-recovery--failed { border-color:rgba(255,92,92,.52); border-left-color:#ff5c5c; }
  #sf-recovery-encounter.sf-recovery--failed .sf-recovery__head { color:#ff5c5c; }
  #sf-recovery-encounter.sf-recovery--custody { pointer-events:none; }
  @media (max-width:900px),(max-height:620px) {
    #sf-recovery-encounter { top:78px; left:12px; right:12px; width:auto; padding:8px 10px; }
    .sf-recovery__headline { font-size:12px; } .sf-recovery__detail { font-size:9px; }
    .sf-recovery__actions { flex-wrap:wrap; }
  }
  #sf-recovery-encounter[data-reduced-motion=true],
  #sf-recovery-encounter[data-reduced-motion=true] .sf-recovery__meter i { transition:none; }
  @media (prefers-reduced-motion:reduce) { #sf-recovery-encounter,.sf-recovery__meter i { transition:none; } }`;
  document.head.appendChild(style);
}

export default createRecoveryEncounterPrompt;
