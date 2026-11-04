// Bounded public projection for contacts, journal, optional navigation and UI
// remount. Reading it cannot move the ship, choose an approach or settle work.
import {
  CINDERGLASS_JOB_PHASES as P, CINDERGLASS_JOB_CUSTODY as C,
  CINDERGLASS_JOB_POINTS, CINDERGLASS_JOB_POD_MARKING,
  CINDERGLASS_JOB_TALA_BASE_CR, CINDERGLASS_JOB_TALA_DAMAGED_CR,
  CINDERGLASS_JOB_DEPOSIT_CR, CINDERGLASS_JOB_BROKER_CR,
  CINDERGLASS_JOB_RECEIVE_SPEED, CINDERGLASS_JOB_SERVICE_SECONDS,
  CINDERGLASS_JOB_SECTOR_ID,
  CINDERGLASS_JOB_ROLES, CINDERGLASS_JOB_TEXT, CINDERGLASS_JOB_TERMS_COPY, cinderglassJobBeaconFixValid,
} from './definition.js';
import { cinderglassJobContactRows, cinderglassJobRevisit } from './contact.js';
import { occupantGenerationOf } from '../../core/entity.js';

const text = (s, n = 600) => typeof s === 'string' ? s.slice(0, n) : '';
const finite = v => Number.isFinite(v) ? v : 0;
const point = p => p && Number.isFinite(p.x) && Number.isFinite(p.z) ? { x: p.x, z: p.z } : null;
const action = a => ({ id: text(a?.id, 48), label: text(a?.label, 100), disabled: a?.disabled === true,
  reason: text(a?.reason, 160), ...(a?.actor ? { actor: text(a.actor, 24) } : {}),
  ...(a?.quoteId ? { quoteId: text(a.quoteId, 160) } : {}),
  ...(a?.recipient ? { recipient: text(a.recipient, 24) } : {}),
  ...(a?.markerId ? { markerId: text(a.markerId, 96) } : {}) });

/** Only the original offer terms have this template; other contact details stay untouched. */
export function cinderglassJobDetailCopy(detail) {
  return detail === CINDERGLASS_JOB_TEXT.offerDetail ? CINDERGLASS_JOB_TERMS_COPY : null;
}

export function cinderglassJobPublicPrompt(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.token !== 'string' || !raw.token) return null;
  const source = Array.isArray(raw.choices) ? raw.choices : Array.isArray(raw.actions) ? raw.actions : [];
  const choices = source.slice(0, 8).map(action).filter(a => a.id);
  return { id: text(raw.id || raw.offerId, 96), offerId: text(raw.offerId, 96),
    token: text(raw.token, 200), operationId: text(raw.operationId, 160),
    revision: finite(raw.revision), epoch: finite(raw.epoch),
    title: text(raw.title, 100), sender: text(raw.sender, 100),
    headline: text(raw.headline || raw.line, 500), line: text(raw.line || raw.headline, 500),
    detail: text(raw.detail, 1100),
    ...(cinderglassJobDetailCopy(raw.detail) ? { detailCopy: CINDERGLASS_JOB_TERMS_COPY } : {}),
    statusFlag: text(raw.statusFlag, 160),
    kind: raw.kind === 'warn' ? 'warn' : 'info', choices,
    ...(raw.actions ? { actions: choices } : {}),
  };
}

function objective(st) {
  if (st.phase === P.DISPATCH) return 'Preparing the original freight cohort. No inspection deposit is being charged.';
  if (st.phase === P.RECON) return 'Read the visible CG-7 plate, then scan the original pod and external latch through a clear sightline.';
  if (st.phase === P.DECIDE) return 'Negotiate with Dask at inspection, service the external latch unseen, or use ordinary force and face the law.';
  if (st.phase === P.RECOVERY) return `${st.custody === C.RELEASED && !st.hardwareObservation && !cinderglassJobBeaconFixValid(st.beaconFix, st.operationId)
    ? 'Tune the CG-7 cargo beacon to locate the drifting original. ' : ''}Tow the same CG-7 pod to Tala’s cradle below ${CINDERGLASS_JOB_RECEIVE_SPEED} WU/s. Khand accepts only an intact original.`;
  if (st.phase === P.HANDOFF) return 'Read the condition quote, accept the receiving terms and hold the original slowly at the physical clamp.';
  return null;
}

function entity(state, id, operationId = null) {
  const e = id != null ? state.entities?.get?.(id) : null;
  return e?.alive !== false && e?.pos && (!operationId || e.data?.cinderglassOperationId === operationId) ? e : null;
}

function marker(id, label, pos, kind, followId = null) {
  const p = point(pos);
  return p ? { id: `cinderglassJob:${id}`, label, pos: p, kind, sectorId: CINDERGLASS_JOB_SECTOR_ID,
    followId, optional: true } : null;
}

export function cinderglassJobNavigation(view) {
  if (!view) return [];
  return view.markers.slice(0, 4).map(m => ({ ...m, source: 'cinderglassJob', priority: 'optional',
    preserveCourse: true, action: { action: 'track', markerId: m.id, token: view.token,
      operationId: view.operationId, revision: view.revision } }));
}

export function cinderglassJobJournal(view) {
  if (!view || (!view.objective && !view.facts.length && !view.outcome)) return null;
  return { id: 'cinderglassJob', title: 'The Cinderglass Job', phase: view.phase,
    objective: view.objective, outcome: view.outcome, facts: view.facts.slice(-6),
    summary: view.revisit.tala.line, navigation: view.navigation.slice(0, 4),
    terms: view.terms, depositPaid: view.depositPaid, depositRefunded: view.depositRefunded };
}

export function buildCinderglassJobView(state) {
  const st = state.world?.cinderglassJob;
  if (!st || st.version !== 1) return null;
  const offer = cinderglassJobPublicPrompt(state.cinderglassJobOffer);
  const approach = cinderglassJobPublicPrompt(st.approachPrompt || state.cinderglassJobApproach);
  const token = text(state.cinderglassJobToken || approach?.token || offer?.token, 200);
  const actors = st.actors || {};
  const outcome = st.outcome ? { id: text(st.outcome.id || st.outcome, 48), paidCr: finite(st.outcome.paidCr) } : null;
  const view = { token, operationId: text(st.operationId, 160), revision: finite(st.promptRevision),
    phase: st.phase, approach: st.approach || null, outcome, custody: st.custody,
    scanDone: st.scanDone === true, podMarked: st.podMarked === true,
    depositPaid: st.depositPaid === true, depositRefunded: st.depositRefunded === true,
    depositCr: CINDERGLASS_JOB_DEPOSIT_CR, suspicion: Math.min(3, Math.max(0, st.suspicion | 0)),
    captainAlive: st.captainAlive !== false, runFinished: st.runFinished === true,
    leg: Number.isInteger(st.routeLeg) ? st.routeLeg : null,
    legLabel: ['freight approach', 'inspection layby', 'outbound bend', 'return'][st.routeLeg] || null,
    objective: objective(st), offer, approachPrompt: approach,
    refusal: st.lastRefusal ? { reason: text(st.lastRefusal.reason, 60), text: text(st.lastRefusal.text, 400), revision: finite(st.lastRefusal.revision) } : null,
    terms: { intactCr: CINDERGLASS_JOB_TALA_BASE_CR, damagedCr: CINDERGLASS_JOB_TALA_DAMAGED_CR,
      depositCr: CINDERGLASS_JOB_DEPOSIT_CR, brokerCr: CINDERGLASS_JOB_BROKER_CR },
    receiveQuote: st.receiveQuote ? { quoteId: text(st.receiveQuote.quoteId, 160), recipient: text(st.receiveQuote.recipient, 24),
      amount: finite(st.receiveQuote.amount), baseCr: finite(st.receiveQuote.baseCr), refundCr: finite(st.receiveQuote.refundCr),
      condition: text(st.receiveQuote.condition, 40), podId: st.receiveQuote.podId, token: text(st.receiveQuote.token, 200) } : null,
    marking: st.podMarked || st.scanDone ? CINDERGLASS_JOB_POD_MARKING : null,
    facts: (Array.isArray(st.rememberedFacts) ? st.rememberedFacts : []).slice(-6).filter(Boolean)
      .map(f => ({ id: text(f.id, 100), atS: finite(f.atS), text: text(f.text, 500) })),
    markers: [], serviceActive: st.serviceActive === true,
    serviceProgress: Math.min(1, Math.max(0, finite(st.serviceProgressS) / CINDERGLASS_JOB_SERVICE_SECONDS)),
    actors: { tala: { paid: actors.tala?.paid === true },
      dask: { alive: actors.dask?.alive !== false, dealAccepted: actors.dask?.dealAccepted === true,
        dealRefused: actors.dask?.dealRefused === true }, broker: { paid: actors.broker?.paid === true } },
    revisit: Object.fromEntries(['tala', 'dask', 'broker'].map(a => [a, cinderglassJobRevisit(st, a)])),
  };
  const markers = view.markers, ids = st.entities || {};
  view.recoveryActions = !st.outcome && st.phase === P.RECOVERY && [C.RELEASED, C.TETHERED].includes(st.custody)
    ? [{ id: 'tuneBeacon', label: st.beaconFix ? 'Request fresh CG-7 beacon fix' : 'Tune CG-7 cargo beacon',
      action: { action: 'tuneBeacon', token, operationId: view.operationId, revision: view.revision } }] : [];
  if (st.everAdmitted && !state.cinderglassJobPresentationReady) {
    const bodies = [];
    for (const [key, role] of Object.entries(CINDERGLASS_JOB_ROLES)) {
      const e = entity(state, ids[key], st.operationId);
      if (!e || e.data?.worldRecordId !== role.worldRecordId || e.data?.cinderglassRole !== role.role) continue;
      bodies.push({ key, id: e.id, generation: occupantGenerationOf(e), worldRecordId: role.worldRecordId,
        assetId: text(e.data.cinderglassAssetId, 100), assetFile: text(e.data.cinderglassAssetFile, 260) });
    }
    if (bodies.length) view.admission = { token, operationId: view.operationId, bodies };
  }
  if ([P.DISPATCH, P.RECON, P.DECIDE].includes(st.phase)) {
    markers.push(st.hardwareObservation?.pos
      ? marker('convoy', 'CG-7 convoy · last observed position', st.hardwareObservation.pos, 'contact')
      : marker('marshal', 'Dask convoy · freight approach', CINDERGLASS_JOB_POINTS.marshal, 'contact'));
    if (st.scanDone) markers.push(marker('layby', 'Freight pull-off · inspection layby', CINDERGLASS_JOB_POINTS.pullOff, 'site'));
  }
  if ([P.RECOVERY, P.HANDOFF].includes(st.phase)) {
    const pod = entity(state, ids.podId, st.operationId);
    if (pod && [C.TETHERED, C.RELEASED].includes(st.custody)) {
      // Held cargo is an instrument contact. A loose original exposes only the
      // last actual observation or an explicitly requested cargo-beacon reply.
      const beacon = cinderglassJobBeaconFixValid(st.beaconFix, st.operationId) ? st.beaconFix : null;
      const observed = st.hardwareObservation;
      const useBeacon = st.custody !== C.TETHERED && beacon && (!observed || beacon.atS >= observed.atS);
      const seenPos = st.custody === C.TETHERED ? pod.pos : useBeacon ? beacon.pos : observed?.pos;
      const age = useBeacon ? Math.max(0, Math.floor(finite(state.simTime) - beacon.atS)) : 0;
      const label = useBeacon ? `CG-7 pod · beacon fix · ${age}s old` : 'Original CG-7 pod';
      if (seenPos) {
        const podMarker = marker('pod', label, seenPos, 'cargo', st.custody === C.TETHERED ? pod.id : null);
        if (useBeacon) podMarker.labelCopy = { template: 'CG-7 pod · beacon fix · {age}s old', values: { age } };
        markers.push(podMarker);
      }
    }
    markers.push(marker('cradle', 'Tala Rook · receiving cradle', entity(state, ids.cradleId, st.operationId)?.pos || CINDERGLASS_JOB_POINTS.cradle, 'site'));
    if (st.scanDone) markers.push(marker('broker', 'Vesi Khand · unlawful receiving clamp', entity(state, ids.brokerId, st.operationId)?.pos || CINDERGLASS_JOB_POINTS.broker, 'site'));
  }
  view.markers = markers.filter(Boolean).slice(0, 4);
  view.navigation = cinderglassJobNavigation(view);
  view.contacts = cinderglassJobContactRows(state, view).slice(0, 3);
  view.journal = cinderglassJobJournal(view);
  return view;
}

export function publishCinderglassJobReadModel(state) {
  state.cinderglassJobView = buildCinderglassJobView(state);
  return state.cinderglassJobView;
}
