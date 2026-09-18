// src/ui/recoveryEncounterPrompt.js — adapter from the derelict-recovery / named-wreck / cache /
// custody sim events to the flight decision deck (src/ui/promptDeck.js) and the reserved receipt
// lane. The pure view builders below (recoveryCustodyView, the cache views, the text helpers) are
// the headless contract (test/recovery-encounter.test.mjs, test/pq048-*.test.mjs) and are kept
// verbatim; only the hand-rolled card DOM, style tag, digit router and per-card gamepad poll were
// retired — the deck owns placement, keys, gamepad, announcements and lifecycle now.
//
// Simulation owns range, condition, hazards, stabilization, settlement and persistence.

import { stationName } from './sectorLawPresenter.js';
import { getPromptDeck } from './promptDeck.js';

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

export function vestaOreCachePromptView(payload) {
  if (!payload || !payload.recordId || !Array.isArray(payload.choices) || payload.choices.length !== 3) return null;
  const controllerKeys = ['A', 'B', 'X'];
  const choices = payload.choices.map((choice, index) => ({
    id: String(choice.id || ''),
    label: String(choice.label || '').trim(),
    consequence: String(choice.consequence || '').trim(),
    controllerKey: controllerKeys[index],
    ariaLabel: `${String(choice.label || '').trim()}. Controller ${controllerKeys[index]}. ${String(choice.consequence || '').trim()}`.trim(),
  }));
  if (choices.some((choice) => !choice.id || !choice.label || !choice.consequence)) return null;
  const headline = String(payload.headline || 'SHIFT-END ORE CACHE');
  const prompt = String(payload.prompt || 'Choose the cache disposition.');
  return Object.freeze({
    ...payload,
    choices,
    headline,
    prompt,
    ariaLabel: `Vesta ore cache. ${headline}. ${prompt} ${choices.map((choice) => choice.ariaLabel).join(' ')}`,
  });
}

export function pallasHiddenCachePromptView(payload) {
  if (!payload || !payload.recordId || !Array.isArray(payload.choices) || payload.choices.length !== 3) return null;
  const controllerKeys = ['A', 'B', 'X'];
  const choices = payload.choices.map((choice, index) => {
    const available = choice.available !== false;
    const unavailableReason = String(choice.unavailableReason || '').trim();
    const consequence = String(choice.consequence || '').trim();
    return {
      id: String(choice.id || ''),
      label: String(choice.label || '').trim(),
      consequence,
      available,
      unavailableReason,
      controllerKey: controllerKeys[index],
      ariaLabel: `${String(choice.label || '').trim()}. Controller ${controllerKeys[index]}. ${available ? consequence : unavailableReason || 'Unavailable.'}`.trim(),
    };
  });
  if (choices.some((choice) => !choice.id || !choice.label || !choice.consequence)) return null;
  const headline = String(payload.headline || 'BLACK-WAKE WEAPONS CACHE');
  const prompt = String(payload.prompt || 'Choose the cache disposition.');
  return Object.freeze({
    ...payload,
    choices,
    headline,
    prompt,
    ariaLabel: `Pallas hidden cache. ${headline}. ${prompt} ${choices.map((choice) => choice.ariaLabel).join(' ')}`,
  });
}

// ── deck adapter ───────────────────────────────────────────────────────────────────────────────

const ID_RECOVERY = 'recovery';
const ID_UNIQUE_WRECK = 'uniqueWreck';
const ID_VESTA = 'vestaOreCache';
const ID_PALLAS = 'pallasHiddenCache';
const ID_CUSTODY = 'custody';

function meterContent(doc, value) {
  const meter = doc.createElement('div');
  meter.className = 'sf-prompt-meter';
  const fill = doc.createElement('i');
  fill.style.setProperty('--v', String(Math.max(0, Math.min(1, Number(value) || 0))));
  meter.appendChild(fill);
  return meter;
}

export function createRecoveryEncounterPrompt(ctx = {}) {
  const state = ctx.state || {};
  const bus = ctx.bus;
  const doc = ctx.document || (typeof document !== 'undefined' ? document : null);
  if (!bus || typeof bus.on !== 'function') return inertPrompt();
  const simNow = () => Number(state && state.simTime) || 0;

  function canSurface() { return state && state.mode === 'flight' && !(state.ui && state.ui.docked); }
  function canSurfacePallas(readout) {
    if (!state || state.mode !== 'flight') return false;
    if (!(state.ui && state.ui.docked)) return true;
    return readout && readout.reportAvailable === true
      && state.ui.dockedStationId === readout.reportStationId;
  }

  const offer = (spec) => {
    const deck = getPromptDeck();
    return !!(deck && deck.offerDecision(spec));
  };

  const emitReceipt = (text, kind = 'info') => {
    return !!bus.emit('toast', { text, kind, ttl: RECEIPT_TTL_S });
  };

  let custodyPayload = null;
  let custodyLastSecond = null;

  function renderEncounter(readout) {
    if (!readout || !readout.recoveryId) return false;
    const deck = getPromptDeck();
    if (!deck) return false;
    const meta = `${readout.ownership || 'CLAIM UNKNOWN'} · ${readout.legalStatus ? String(readout.legalStatus).replace(/_/g, ' ').toUpperCase() : 'SCAN REQUIRED'}`;
    const base = {
      id: ID_RECOVERY,
      sender: 'DERELICT RECOVERY',
      headline: readout.conditionLabel || 'UNIDENTIFIED DERELICT',
      detail: meta,
    };
    if (readout.phase === 'awaiting_scan') {
      return offer({ ...base, kind: 'info', statusFlag: 'IDENTIFY', detail: 'Pulse scanner within 260 WU. Condition and ownership are still unknown.', choices: [] });
    }
    if (readout.phase === 'hazard') {
      return offer({
        ...base,
        kind: 'danger',
        statusFlag: `CORE ${Math.max(0, Number(readout.hazardRemaining_s) || 0).toFixed(1)} S`,
        detail: `Vent now, or tether and tow ${readout.towClear_wu || 260} WU clear.`,
        choices: [{ id: 'vent', label: 'VENT CORE', title: 'Vent the reactor before its timer closes.' }],
        onChoose: (choiceId, source) => bus.emit('recovery:vent', { recoveryId: readout.recoveryId, source }),
      });
    }
    if (readout.phase === 'stabilizing') {
      const pct = Math.round((Number(readout.stabilization) || 0) * 100);
      return offer({
        ...base,
        kind: 'warn',
        statusFlag: `STABILIZE ${pct}%`,
        detail: recoveryStabilizationText(readout),
        content: doc ? meterContent(doc, readout.stabilization) : null,
        choices: [],
      });
    }
    if (readout.phase !== 'decision') {
      // Unknown/transitional phases (e.g. awaiting_tether) render as an honest status frame —
      // the pre-deck card showed them too; going dark mid-state machine reads as a broken promise.
      return offer({
        ...base,
        kind: 'info',
        statusFlag: words(readout.phase).toUpperCase() || 'IN PROGRESS',
        choices: [],
      });
    }
    return offer({
      ...base,
      kind: 'info',
      statusFlag: 'STABLE · CHOOSE',
      detail: readout.retryReason === 'cargo_full'
        ? 'Hold full. Make cargo space, then choose again.'
        : readout.retryReason === 'no_life_signs'
          ? 'No life signs. Recover the box or strip components.'
          : 'Method sets cargo, payout, and reputation.',
      choices: [
        { id: 'rescue', label: 'RESCUE', disabled: !readout.hasSurvivor, reason: readout.hasSurvivor ? 'Recover the survivor and earn claimant goodwill.' : 'No life signs detected.' },
        { id: 'blackbox', label: 'BLACK BOX', cancel: true, title: 'Recover the flight record and return registered evidence.' },
        { id: 'strip', label: 'STRIP', danger: true, title: 'Take components; claimed or restricted wrecks carry reputation consequences.' },
      ],
      onChoose: (choiceId, source) => bus.emit('recovery:choose', { recoveryId: readout.recoveryId, choice: choiceId, source }),
    });
  }

  function renderUniqueWreck(readout) {
    const deck = getPromptDeck();
    if (!deck || !readout || !readout.wreckId || !Array.isArray(readout.choices)) return false;
    return offer({
      id: ID_UNIQUE_WRECK,
      kind: 'info',
      sender: 'NAMED WRECK CLAIM',
      statusFlag: 'RECOVERED · CHOOSE',
      headline: readout.headline || 'UNIQUE RECOVERY',
      detail: readout.prompt || 'Choose who receives the recovered systems. One settlement · saves immediately · no duplicate claim.',
      choices: readout.choices.map((choice) => ({
        id: choice.id,
        label: choice.label,
        disabled: choice.available === false,
        reason: choice.available === false ? (choice.unavailableReason || choice.consequence) : choice.consequence,
      })),
      onChoose: (choiceId, source) => bus.emit('uniqueWreck:choose', { wreckId: readout.wreckId, choiceId, source }),
    });
  }

  function renderVestaOreCache(readout) {
    const view = vestaOreCachePromptView(readout);
    const deck = getPromptDeck();
    if (!deck || !view || !canSurface()) return false;
    return offer({
      id: ID_VESTA,
      kind: 'info',
      sender: 'VESTA ORE CACHE',
      statusFlag: 'SEAL INTACT · CHOOSE',
      headline: view.headline,
      detail: view.prompt,
      choices: view.choices.map((choice) => ({
        id: choice.id,
        label: choice.label,
        title: choice.consequence,
      })),
      onChoose: (choiceId, source) => bus.emit('vestaOreCache:choose', { recordId: view.recordId, choiceId, source }),
    });
  }

  function renderPallasHiddenCache(readout) {
    const view = pallasHiddenCachePromptView(readout);
    const deck = getPromptDeck();
    if (!deck || !view || !canSurfacePallas(view)) return false;
    return offer({
      id: ID_PALLAS,
      kind: 'info',
      sender: 'PALLAS HIDDEN CACHE',
      statusFlag: view.reportAvailable ? 'DRIFT MARKET · FILE OR ACT' : 'CACHE FIXED · CHOOSE',
      headline: view.headline,
      detail: view.prompt,
      choices: view.choices.map((choice) => ({
        id: choice.id,
        label: choice.label,
        disabled: choice.available === false,
        reason: choice.available === false ? choice.unavailableReason : choice.consequence,
      })),
      onChoose: (choiceId, source) => bus.emit('pallasHiddenCache:choose', { recordId: view.recordId, choiceId, source }),
    });
  }

  function renderCustody(payload) {
    const view = recoveryCustodyView(payload, state, simNow());
    const deck = getPromptDeck();
    if (!view) return false;
    if (view.terminal) {
      if (deck) deck.resolveDecision(ID_CUSTODY);
      if (canSurface() || view.phase === 'lost' || view.phase === 'escaped') {
        emitReceipt(`${view.flag} — ${view.headline} — ${view.meta}`, view.status === 'SUCCESS' ? 'success' : 'danger');
      }
      return true;
    }
    if (!deck || !canSurface()) return false;
    custodyPayload = payload;
    return deck.offerDecision({
      id: ID_CUSTODY,
      kind: 'warn',
      sender: view.flag,
      statusFlag: view.status,
      headline: view.headline,
      detail: [view.meta, view.detail].filter(Boolean).join(' — '),
      choices: [],
      // The countdown lives in the custody view; refresh the status each sim second.
      onTick: () => {
        const second = Math.floor(simNow());
        if (second === custodyLastSecond) return;
        custodyLastSecond = second;
        const next = recoveryCustodyView(payload, state, simNow());
        if (!next || next.terminal) return;
        deck.updateDecision(ID_CUSTODY, { statusFlag: next.status, detail: [next.meta, next.detail].filter(Boolean).join(' — ') });
      },
    });
  }

  const showReceipt = (receipt) => {
    const deck = getPromptDeck();
    if (deck) deck.resolveDecision(ID_RECOVERY);
    if (!receipt || !canSurface()) return false;
    const danger = !!receipt.failure || Number(receipt.repDelta) < 0;
    return emitReceipt(
      `RECOVERY ${receipt.failure ? 'CLOSED' : 'RECEIPT'} — ${receipt.title || recoveryOutcomeText(receipt)} — ${receiptDetail(receipt)}`,
      danger ? 'danger' : 'success',
    );
  };

  const showUniqueReceipt = (payload) => {
    const receipt = payload && payload.receipt;
    const deck = getPromptDeck();
    if (deck) deck.resolveDecision(ID_UNIQUE_WRECK);
    if (!receipt || !canSurface()) return false;
    return emitReceipt(
      `NAMED RECOVERY — ${receipt.title || 'RECOVERY CLOSED'} — ${receipt.detail || 'Outcome recorded. No duplicate settlement.'}`,
      Number(receipt.repDelta) < 0 ? 'danger' : 'success',
    );
  };

  const showVestaOreCacheReceipt = (payload) => {
    const receipt = payload && payload.receipt;
    const deck = getPromptDeck();
    if (deck) deck.resolveDecision(ID_VESTA);
    if (!receipt || !canSurface()) return false;
    return emitReceipt(
      `VESTA CACHE — ${receipt.title || 'CACHE DISPOSITION RECORDED'} — ${receipt.detail || 'Outcome recorded.'}`,
      'success',
    );
  };

  const showPallasHiddenCacheReceipt = (payload) => {
    const receipt = payload && payload.receipt;
    const deck = getPromptDeck();
    if (deck) deck.resolveDecision(ID_PALLAS);
    if (!receipt) return false;
    const dockedReport = receipt.choiceId === 'report'
      && state && state.mode === 'flight' && state.ui && state.ui.docked === true
      && state.ui.dockedStationId === receipt.stationId;
    // The docked report receipt is exactly the attention plan's receipt-lane case: a fact, not a
    // card — toasts render on menus, so this lands even while docked at the drift market.
    if (!canSurface() && !dockedReport) return false;
    return emitReceipt(
      `PALLAS CACHE — ${receipt.title || 'CACHE DISPOSITION RECORDED'} — ${receipt.detail || 'Outcome recorded.'}`,
      'success',
    );
  };

  const onEncounterEvent = (readout) => { renderEncounter(readout); return false; };

  for (const event of ['recovery:started', 'recovery:identified', 'recovery:defenseAwake', 'recovery:hazardCleared', 'recovery:readout', 'recovery:decisionReady', 'recovery:retryAvailable']) {
    bus.on(event, onEncounterEvent);
  }
  bus.on('recovery:completed', showReceipt);
  bus.on('uniqueWreck:decisionReady', renderUniqueWreck);
  bus.on('uniqueWreck:resolved', showUniqueReceipt);
  bus.on('vestaOreCache:decisionReady', renderVestaOreCache);
  bus.on('vestaOreCache:resolved', showVestaOreCacheReceipt);
  bus.on('pallasHiddenCache:decisionReady', renderPallasHiddenCache);
  bus.on('pallasHiddenCache:resolved', showPallasHiddenCacheReceipt);
  bus.on('encounter:receipt', (payload) => { if (isCustodyReceipt(payload)) renderCustody(payload); });
  for (const event of ['surrender:option', 'surrender:updated', 'surrender:tethered', 'surrender:secured', 'surrender:recoveryLost', 'surrender:escaped']) {
    bus.on(event, renderCustody);
  }
  // The old cross-card hide/re-request chains (pirateParley:demand → hide, parley resolved →
  // re-request uniqueWreck) are retired: the deck stacks coexisting surfaces, so an interruption
  // no longer erases the wreck decision and nothing needs re-requesting.

  const subscribers = [
    ...['recovery:started', 'recovery:identified', 'recovery:defenseAwake', 'recovery:hazardCleared', 'recovery:readout', 'recovery:decisionReady', 'recovery:retryAvailable'].map((event) => [event, onEncounterEvent]),
    ['recovery:completed', showReceipt],
    ['uniqueWreck:decisionReady', renderUniqueWreck],
    ['uniqueWreck:resolved', showUniqueReceipt],
    ['vestaOreCache:decisionReady', renderVestaOreCache],
    ['vestaOreCache:resolved', showVestaOreCacheReceipt],
    ['pallasHiddenCache:decisionReady', renderPallasHiddenCache],
    ['pallasHiddenCache:resolved', showPallasHiddenCacheReceipt],
    ...['surrender:option', 'surrender:updated', 'surrender:tethered', 'surrender:secured', 'surrender:recoveryLost', 'surrender:escaped'].map((event) => [event, renderCustody]),
  ];

  return {
    el: null,
    tick: () => {},
    hide: () => {
      const deck = getPromptDeck();
      if (!deck) return false;
      for (const id of [ID_RECOVERY, ID_UNIQUE_WRECK, ID_VESTA, ID_PALLAS, ID_CUSTODY]) deck.resolveDecision(id);
      return true;
    },
    destroy: () => {
      for (const [event, handler] of subscribers) {
        try { bus.off && bus.off(event, handler); } catch (_) {}
      }
    },
    render: renderEncounter,
    renderUniqueWreck,
    renderVestaOreCache,
    renderPallasHiddenCache,
    renderCustody,
    showReceipt, showUniqueReceipt, showVestaOreCacheReceipt, showPallasHiddenCacheReceipt,
    choose: () => false,
  };
}

function inertPrompt() {
  return {
    el: null, tick: () => {}, hide: () => false, destroy: () => {}, choose: () => false,
    render: () => false, renderUniqueWreck: () => false, renderVestaOreCache: () => false,
    renderPallasHiddenCache: () => false, renderCustody: () => false,
    showReceipt: () => false, showUniqueReceipt: () => false,
    showVestaOreCacheReceipt: () => false, showPallasHiddenCacheReceipt: () => false,
  };
}

export default createRecoveryEncounterPrompt;
