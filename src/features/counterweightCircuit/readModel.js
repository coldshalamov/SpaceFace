// Counterweight Circuit — bounded pure read model.
//
// One projection over live state for the offer deck, the in-attempt progress
// card, the records view, results and map markers. Read-only: no writes, no
// Three.js, no DOM, no ambient time. Everything here is derived from
// state.world.counterweightCircuit + the live attempt/entity facts, and the
// lists are exactly as long as the authored tables.

import {
  COUNTERWEIGHT_EVENTS, eventUnlocked, VENUE_SECTOR_ID,
  OFFER_RANGE_WU, DISCOVER_RANGE_WU, GHOST_MAX_SAMPLES,
} from './definition.js';
import { venueAnchorGlobal } from './physical.js';
import { medalAtMost } from './scoring.js';
import { ghostAllowed } from './ghost.js';

const LEG_LABEL = {
  attach: 'Line', swing: 'Swing', release: 'Release', transit: 'Gate',
  seat: 'Seat', contain: 'Contain', parkAll: 'Park both', reacquire: 'Reacquire',
};

const MEDAL_LABEL = { none: 'Finished', bronze: 'Bronze', silver: 'Silver', gold: 'Gold' };
const OUTCOME_LABEL = {
  complete: 'Complete', failed: 'Failed', cancelled: 'Cancelled',
};
const REASON_LABEL = {
  arrival_speed: 'arrival speed', pod_damage: 'pod damage', missed_gate: 'a missed gate',
  improved_time: 'an improved time', slow_arrival: 'arrival speed', load_destroyed: 'a destroyed load',
  missed_window: 'a missed window', load_lost: 'a lost load', entered_basin_ring: 'entering the basin ring',
  left_venue: 'leaving the venue', cancelled: 'cancellation', interrupted_unconfirmed: 'an interrupted attempt',
  admission_unconfirmed: 'course preparation not completed',
  time: 'completion time', handling_damage: 'handling damage', condition_unconfirmed: 'unconfirmed load condition',
  done: 'a clean finish',
};

function row(state) {
  return state?.world?.counterweightCircuit || null;
}

export function counterweightDiscovered(state) {
  return row(state)?.discovered === true;
}

export function counterweightVenueAnchor() {
  return venueAnchorGlobal();
}

/** Player/venue spatial facts for gating offers. */
export function counterweightVenueFacts(state) {
  const anchor = venueAnchorGlobal();
  const p = state?.entities?.get?.(state.playerId);
  const dist = p ? Math.hypot(p.pos.x - anchor.x, p.pos.z - anchor.z) : Infinity;
  return {
    anchor,
    sectorId: VENUE_SECTOR_ID,
    inSector: state?.world?.currentSectorId === VENUE_SECTOR_ID,
    distance: dist,
    nearRegistrar: dist <= OFFER_RANGE_WU,
    inDiscoverRange: dist <= DISCOVER_RANGE_WU,
  };
}

/** The course-selection menu row for one event. */
function eventMenuRow(def, records, row) {
  const rec = records?.[def.id];
  const unlocked = eventUnlocked(def, records);
  return {
    id: def.id,
    index: def.index,
    title: def.title,
    tagline: def.tagline,
    skill: def.skill,
    nextSkill: def.nextSkill || null,
    unlocked,
    completed: (rec?.completions || 0) > 0,
    attempts: rec?.attempts || 0,
    bestTimeS: rec?.bestTimeS ?? null,
    bestMedal: rec?.bestMedal || null,
    lastTimeS: rec?.lastTimeS ?? null,
    lastMedal: rec?.lastMedal ?? null,
    rewardCr: def.rewardCr,
    paid: rec?.paid === true,
    hasGhost: !!row?.ghost?.[def.id],
    requires: def.requires ? def.requires.slice() : [],
  };
}

/**
 * Full projection for presentation. `attempt` carries the live ordered-leg
 * status so the progress card can name the next physical landmark and the
 * current condition without guessing.
 */
export function projectCounterweightCircuitJournal(state, opts = {}) {
  const r = row(state);
  let attempt = null;
  const live = opts.attempt || r?.attempt || null;
  if (live && live.fsm) {
    const def = COUNTERWEIGHT_EVENTS.find((d) => d.id === live.eventId);
    attempt = {
      eventId: live.eventId,
      title: def?.title || live.eventId,
      practice: live.practice === true,
      phase: live.fsm.phase,
      legIndex: live.fsm.legIndex,
      retryCount: (def?.legs || []).reduce((sum, _, i) => sum + Math.min(999, Math.max(0, Number(live.fsm.mem?.retriesByLeg?.[i]) || 0)), 0),
      legs: (def?.legs || []).map((leg, i) => ({
        id: `${leg.kind}:${i}`,
        kind: leg.kind,
        label: LEG_LABEL[leg.kind] || leg.kind,
        hint: leg.hint || '',
        status: live.fsm.legStatus?.[i] || 'pending',
        retries: Math.min(999, Math.max(0, Number(live.fsm.mem?.retriesByLeg?.[i]) || 0)),
      })),
      elapsedS: live.fsm.phase === 'running' && live.fsm.armedAt != null
        ? Math.max(0, (opts.simTime ?? state?.simTime ?? 0) - live.fsm.armedAt)
        : live.fsm.elapsedS,
      conditionFrac: opts.conditionFrac ?? null,
      armed: live.fsm.phase !== 'staged',
    };
  }
  return { attempt, lastResult: r?.lastResult || null };
}

export function projectCounterweightCircuitView(state, opts = {}) {
  const r = row(state);
  const facts = counterweightVenueFacts(state);
  const records = r?.records || {};
  const menu = COUNTERWEIGHT_EVENTS.map((def) => eventMenuRow(def, records, r));
  const completedCount = menu.filter((m) => m.completed).length;
  const { attempt, lastResult } = projectCounterweightCircuitJournal(state, opts);
  return {
    schema: 1,
    discovered: r?.discovered === true,
    venue: {
      sectorId: VENUE_SECTOR_ID,
      anchor: facts.anchor,
      inSector: facts.inSector,
      nearRegistrar: facts.nearRegistrar,
      inDiscoverRange: facts.inDiscoverRange,
      label: 'Counterweight Circuit',
    },
    menu,
    completedCount,
    attempt,
    lastResult,
    settings: {
      ghostEnabled: r?.settings?.ghostEnabled === true,
      ghostReduceMotion: r?.settings?.ghostReduceMotion === true,
      ghostPlayback: ghostAllowed(r?.settings, opts.reducedMotion),
      ghostMaxSamples: GHOST_MAX_SAMPLES,
    },
    records: menu.map((m) => ({
      id: m.id, title: m.title, completed: m.completed,
      bestTimeS: m.bestTimeS, bestMedal: m.bestMedal,
      lastTimeS: m.lastTimeS, lastMedal: m.lastMedal,
      paid: m.paid, rewardCr: m.rewardCr, hasGhost: m.hasGhost,
    })),
  };
}

// ── offer/deck payloads (bounded plain data; the prompt adapter renders) ────

export function registrarOfferSpec(state, opts = {}) {
  const view = projectCounterweightCircuitView(state, opts);
  const lines = view.menu.map((m) => {
    const medal = m.bestMedal ? MEDAL_LABEL[m.bestMedal] : (m.completed ? MEDAL_LABEL.none : '—');
    const best = m.bestTimeS != null ? `${m.bestTimeS.toFixed(1)}s` : '—';
    const locked = m.unlocked ? '' : ' (locked)';
    return `${m.index + 1}. ${m.title}${locked}  ·  ${medal}  ·  best ${best}`;
  });
  return {
    id: 'counterweight:registrar',
    kind: 'contact',
    sender: 'Circuit Registrar',
    headline: 'COUNTERWEIGHT CIRCUIT',
    detail: view.attempt?.armed
      ? `Attempt live — ${view.attempt.title} (${(view.attempt.elapsedS ?? 0).toFixed(1)}s)`
      : `Seven physical events. ${view.completedCount}/7 complete.\n${lines.join('\n')}`,
    statusFlag: view.attempt?.armed ? 'running' : 'idle',
    choices: view.attempt
      ? [
          { id: 'cancel', label: 'Abandon attempt' },
          { id: 'close', label: 'Leave' },
        ]
      : [
          { id: 'events', label: 'Course list & previews' },
          { id: 'records', label: 'Records' },
          { id: 'ghost', label: view.settings.ghostEnabled ? 'Ghost: ON' : 'Ghost: OFF' },
          { id: 'close', label: 'Leave' },
        ],
  };
}

export function eventPreviewSpec(state, eventId, opts = {}) {
  const view = projectCounterweightCircuitView(state, opts);
  const m = view.menu.find((row2) => row2.id === eventId);
  if (!m) return null;
  const locked = !m.unlocked;
  const lockedDetail = locked
    ? `Locked — complete ${m.requires.map((r) => titleOf(r)).join(', ')} first.`
    : m.tagline;
  return {
    id: `counterweight:preview:${eventId}`,
    kind: 'contact',
    sender: 'Circuit Registrar',
    headline: `${m.index + 1}. ${m.title}`,
    detail: `${lockedDetail}\nSkill: ${m.skill}\nBest: ${m.bestTimeS != null ? `${m.bestTimeS.toFixed(1)}s ${MEDAL_LABEL[m.bestMedal] || ''}` : '—'}${m.hasGhost ? '  ·  ghost on file' : ''}`,
    statusFlag: locked ? 'locked' : 'ready',
    choices: locked
      ? [{ id: 'menu', label: 'Back' }, { id: 'close', label: 'Leave' }]
      : [
          { id: `practice:${eventId}`, label: 'Practice run' },
          { id: `attempt:${eventId}`, label: 'Ranked attempt' },
          { id: 'menu', label: 'Back' },
          { id: 'close', label: 'Leave' },
        ],
  };
}

export function recordsOfferSpec(state, opts = {}) {
  const view = projectCounterweightCircuitView(state, opts);
  const lines = view.records.map((r) => {
    const medal = r.bestMedal ? MEDAL_LABEL[r.bestMedal] : (r.completed ? MEDAL_LABEL.none : '—');
    const best = r.bestTimeS != null ? `${r.bestTimeS.toFixed(1)}s` : '—';
    const last = r.lastTimeS != null ? `${r.lastTimeS.toFixed(1)}s ${MEDAL_LABEL[r.lastMedal] || ''}` : '—';
    const paid = r.paid ? `+${r.rewardCr} CR` : r.completed ? 'payment pending' : '';
    return `${r.title}: ${medal} · best ${best} · last ${last} ${paid}`;
  });
  return {
    id: 'counterweight:records',
    kind: 'contact',
    sender: 'Circuit Registrar',
    headline: 'COUNTERWEIGHT RECORDS',
    detail: lines.join('\n') || 'No attempts on file.',
    statusFlag: 'records',
    choices: [{ id: 'menu', label: 'Back' }, { id: 'close', label: 'Leave' }],
  };
}

export function resultOfferSpec(result) {
  if (!result) return null;
  const outcome = OUTCOME_LABEL[result.outcome] || result.outcome;
  const medal = result.medal ? `${MEDAL_LABEL[result.medal]} — ` : '';
  const time = result.timeS != null ? `${result.timeS.toFixed(1)}s` : '';
  const reason = REASON_LABEL[result.reason] || result.reason || 'result';
  const measured = Number.isFinite(result.reasonDetail)
    ? result.reason === 'arrival_speed' ? ` (${result.reasonDetail.toFixed(1)} WU/s)`
      : ['pod_damage', 'handling_damage'].includes(result.reason) ? ` (${Math.round(result.reasonDetail * 100)}% condition)`
        : ['time', 'slow_arrival', 'improved_time'].includes(result.reason) ? ` (${result.reasonDetail.toFixed(1)}s)` : ''
    : '';
  const reward = result.rewardCr ? `\n+${result.rewardCr} CR (first completion)`
    : result.rewardStatus === 'wallet_full' ? '\nPayment pending: your wallet is full.'
      : result.rewardStatus ? '\nPayment pending. The registrar will retry.' : '';
  return {
    id: 'counterweight:result',
    kind: 'result',
    sender: 'Circuit Registrar',
    headline: `${outcome}${result.practice ? ' (practice)' : ''}`,
    detail: `${medal}${time}\nDecided by ${reason}${measured}.${reward}`,
    // Plain data only: the presentation boundary resolves the source template using the
    // existing localization runtime, while simulation retains the original English detail.
    detailTemplate: '{medal}{time}{lineBreak}Decided by {reason}{measured}.{reward}',
    detailValues: { medal, time, lineBreak: '\n', reason, measured, reward },
    statusFlag: result.outcome === 'complete' ? 'success' : 'notice',
    choices: [{ id: 'menu', label: 'Course list' }, { id: 'close', label: 'Leave' }],
  };
}

/** Progress card while an attempt runs — refreshed by the runtime. */
export function attemptProgressSpec(state, opts = {}) {
  const view = projectCounterweightCircuitView(state, opts);
  const a = view.attempt;
  if (!a) return null;
  const legLine = a.legs.map((l) => `${l.status === 'done' ? '✓' : l.status === 'active' ? '▸' : '·'} ${l.label}`).join('  ');
  const current = a.legs[a.legIndex];
  const cond = a.conditionFrac != null ? `\nPod condition: ${Math.round(a.conditionFrac * 100)}%` : '';
  return {
    id: 'counterweight:progress',
    kind: 'contact',
    sender: 'Circuit Registrar',
    headline: opts.attempt?.admissionPending ? `${a.title} — preparing course`
      : a.armed ? `${a.title} — ${(a.elapsedS ?? 0).toFixed(1)}s` : `${a.title} — staged`,
    detail: `${legLine}${current?.hint ? `\n${current.hint}` : ''}${cond}${a.practice ? '\n(practice — no payout)' : ''}`,
    statusFlag: 'running',
    choices: [{ id: 'cancel', label: 'Abandon attempt' }],
  };
}

function titleOf(eventId) {
  return COUNTERWEIGHT_EVENTS.find((d) => d.id === eventId)?.title || eventId;
}

/** Map/contact markers the sector and local maps can draw. */
export function getCounterweightCircuitMapMarkers(state, sectorId) {
  if (sectorId !== VENUE_SECTOR_ID) return [];
  const r = row(state);
  const reached = state?.world?.currentSectorId === VENUE_SECTOR_ID
    || Number(state?.world?.discovery?.[VENUE_SECTOR_ID]?.visitedCount) > 0;
  if (!r?.discovered && !reached) return [];
  const anchor = venueAnchorGlobal();
  return [{
    id: 'counterweight_circuit_venue',
    kind: 'site',
    label: r?.discovered ? 'Counterweight Circuit' : 'Counterweight Circuit — approach registrar',
    pos: { x: anchor.x, z: anchor.z },
    sectorId,
    discovered: r?.discovered === true,
  }];
}
