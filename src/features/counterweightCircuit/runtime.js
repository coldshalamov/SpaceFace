// Counterweight Circuit — sim system owner.
//
// The registered 'counterweightCircuit' system. Owns venue materialization,
// discovery, the attempt lifecycle (admit → observe → advance → result →
// retire), one-time rewards, ghost recording and the offer/action bus seam the
// prompt adapter mounts. All state lives at state.world.counterweightCircuit
// and rides the world save section (persistence.js owns the capture/restore).
//
// Ownership discipline: this file issues intents and observes receipts. It
// never writes poses, never applies velocity, never damages a body except
// through the combat damage owner, and never touches ordinary player cargo.

import {
  COUNTERWEIGHT_EVENTS, COUNTERWEIGHT_EVENT_BY_ID, eventUnlocked,
  VENUE_SECTOR_ID, VENUE_LOCAL, OFFER_RANGE_WU, DISCOVER_RANGE_WU,
  VENUE_RANGE_WU, CANCEL_RANGE_WU, COMMIT_RADIUS_WU, FEATURE_ID,
} from './definition.js';
import { createCircuitPhysical, venueAnchorGlobal, venueGlobalPos, CIRCUIT_OWNER } from './physical.js';
import { createAttemptState, advanceAttempt, cancelAttempt } from './attempt.js';
import { projectCounterweightHandling } from './handlingReadout.js';
import { applyResultToRecord, freshEventRecord, medalAtMost } from './scoring.js';
import { createGhostRecorder, normalizeGhost, ghostAllowed } from './ghost.js';
import { emitCommissionCue } from '../../audio/commissionCues.js';
import {
  projectCounterweightCircuitView, projectCounterweightCircuitJournal, registrarOfferSpec, eventPreviewSpec,
  recordsOfferSpec, resultOfferSpec, attemptProgressSpec,
} from './readModel.js';
import {
  freshCounterweightCircuitState, normalizeCounterweightCircuitState,
  installCounterweightCircuitSaveAdapter,
} from './persistence.js';

const finite = (v, d = 0) => (Number.isFinite(v) ? v : d);
const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));

export function createCounterweightCircuitSystem() {
  let ctx = null;
  let state = null;
  let bus = null;
  let helpers = null;
  let physical = null;
  const unsubs = [];

  // Live attempt — the FSM itself is a plain-data object that serializes whole.
  let attempt = null;              // {eventId, attemptId, practice, fsm, def, cohort:Map, shift}
  let ghostRec = null;             // recorder for the running attempt
  let registrarInRange = false;
  let offerGeneration = 0;
  let lastProgressAt = -1;
  let lastViewAt = -1;
  let latestObservation = null;    // private, same-attempt physical frame; never persisted
  let nextOrphanSweepAt = 0;
  let nextRewardRetryAt = 0;
  let restoring = false;
  let admissionGeneration = 0;
  let releaseSaveAdapter = null;

  function row() {
    if (!state.world.counterweightCircuit) {
      state.world.counterweightCircuit = freshCounterweightCircuitState();
    }
    return state.world.counterweightCircuit;
  }

  function recordFor(eventId) {
    const r = row();
    if (!r.records[eventId]) r.records[eventId] = freshEventRecord();
    return r.records[eventId];
  }

  const anchor = () => venueAnchorGlobal();
  const player = () => physical?.player?.() || null;
  const playerDist = () => {
    const p = player();
    const a = anchor();
    return p ? Math.hypot(p.pos.x - a.x, p.pos.z - a.z) : Infinity;
  };
  const inVenueSector = () => state.world?.currentSectorId === VENUE_SECTOR_ID;

  // ── attempt lifecycle ─────────────────────────────────────────────────────

  // Resolve the venue-local definition into this attempt's global geometry —
  // gate planes and bounds circles are checked against live global positions.
  function materializeDef(defBase, shift) {
    const def = { ...defBase, bodies: defBase.bodies };
    if (defBase.gate) {
      def.gate = { ...defBase.gate, absPos: venueGlobalPos({ x: defBase.gate.pos.x + shift.x, z: defBase.gate.pos.z + shift.z }) };
    }
    if (defBase.bounds) {
      def.bounds = { ...defBase.bounds, absPos: venueGlobalPos({ x: defBase.bounds.pos.x + shift.x, z: defBase.bounds.pos.z + shift.z }) };
    }
    return def;
  }

  function startAttempt(eventId, practice) {
    const def = COUNTERWEIGHT_EVENT_BY_ID[eventId];
    const r = row();
    if (!def || attempt) return false;
    if (r.records[eventId]?.pendingReward) {
      settlePendingReward(eventId);
      if (r.records[eventId]?.pendingReward) return false;
    }
    if (!eventUnlocked(def, r.records)) return false;
    if (!inVenueSector() || !player()) return false;
    if (state.mode !== 'flight') return false;
    // The registrar is a dock instrument — its verbs only answer in person.
    if (playerDist() > OFFER_RANGE_WU * 1.5) return false;
    if (!physical.ensureVenue()) {
      // Venue fixtures must be physically present before a cohort is admitted.
      return false;
    }
    const shift = physical.pickCourseShift(def);
    if (!shift) return false;
    const attemptId = ++r.attemptCounter;
    physical.setCourseShift(shift);
    const liveDef = materializeDef(def, shift);
    const admission = physical.admitCohort(liveDef, attemptId, shift);
    const cohort = admission.cohort;
    if (admission.failure || !(cohort instanceof Map) || cohort.size !== def.bodies.length) {
      if (cohort instanceof Map) physical.retireCohort(cohort);
      return false;
    }
    const fsm = createAttemptState(def, { attemptId, practice });
    attempt = { eventId, attemptId, practice: practice === true, fsm, def: liveDef, cohort, shift,
      admissionGeneration: ++admissionGeneration, admissionPending: true,
      admissionStartedAt: state.simTime, presentationReady: false };
    publishView(true);
    emitProgressOffer(true);
    return true;
  }

  function activateAttempt() {
    if (!attempt || !attempt.admissionPending) return;
    const { eventId, attemptId, practice, def, cohort } = attempt;
    const r = row();
    attempt.admissionPending = false;
    recordFor(eventId).attempts += 1;
    const barge = cohort.get('barge');
    if (barge && def.bodies.find((b) => b.role === 'barge')?.itinerary) {
      physical.driveMobile(barge, def.bodies.find((b) => b.role === 'barge').itinerary);
    }
    if (r.settings.ghostEnabled) {
      const p = player();
      ghostRec = createGhostRecorder(eventId, p ? p.pos : null, p ? p.rot : 0);
    }
    const tape = ghostAllowed(r.settings, reducedMotionPref()) ? r.ghost[eventId] : null;
    state.counterweightCircuitGhost = tape ? { eventId, attemptId, allowReducedMotion: r.settings.ghostReduceMotion, tape } : null;
    emitCommissionCue(bus, 'commission.counterweight.start', `${eventId}:${attemptId}`, VENUE_SECTOR_ID, state.tick);
    bus?.emit('counterweightCircuit:attemptStarted', { eventId, practice: practice === true });
    publishView(true);
    emitProgressOffer(true);
  }

  function endAttempt(outcome, reason) {
    if (!attempt) return null;
    const { def, fsm, cohort, eventId, attemptId } = attempt;
    const r = row();
    let conditionFrac = null;
    const fragile = def.bodies.find((b) => b.fragile);
    if (fragile) {
      const live = cohort.get(fragile.role);
      if (live && live.hullMax > 0) conditionFrac = Math.max(0, live.hull / live.hullMax);
    }
    const rec = recordFor(attempt.eventId);
    // Capture before scoring changes the record. A missing time on an older
    // record with completions is unknown, not evidence of a first finish.
    const newReceipt = rec.lastAttemptKey !== `${fsm.eventId}:${fsm.attemptId}`;
    const priorBest = Number.isFinite(rec.bestTimeS) && rec.bestTimeS >= 0 && rec.bestTimeS <= Number.MAX_SAFE_INTEGER
      ? rec.bestTimeS : rec.completions === 0 ? null : undefined;
    const applied = applyResultToRecord(rec, def, fsm, conditionFrac);
    const result = applied.result;
    if (newReceipt && result?.outcome === 'complete' && Number.isFinite(result.timeS)
      && result.timeS >= 0 && result.timeS <= Number.MAX_SAFE_INTEGER && priorBest !== undefined) {
      result.previousBestTimeS = priorBest;
    }
    r.lastResult = result;
    r.revision += 1;
    if (applied.rewardRequested && !rec.pendingReward) {
      rec.pendingReward = { eventId: attempt.eventId, attemptId: attempt.attemptId };
      result.rewardStatus = 'pending';
      settlePendingReward(attempt.eventId);
    }
    // Ghost: only a ranked personal-best run keeps its tape — one per event.
    const wantGhost = ghostRec && result?.outcome === 'complete' && !attempt.practice
      && applied.improvedBest && ghostAllowed(r.settings, reducedMotionPref());
    if (wantGhost) {
      const p = player();
      const tape = ghostRec.end(p?.pos, p?.rot, state.simTime);
      const clean = tape && normalizeGhost(tape, attempt.eventId);
      if (clean) r.ghost[attempt.eventId] = clean;
    }
    ghostRec = null;
    state.counterweightCircuitGhost = null;
    physical.retireMobile();
    physical.retireCohort(cohort);
    attempt = null;
    publishView(true);
    emitResultOffer(result);
    if (!restoring && inVenueSector() && result?.reason !== 'interrupted_unconfirmed') {
      if (result?.outcome === 'complete' && result.rewardStatus !== 'accepted') {
        emitCommissionCue(bus, 'commission.counterweight.complete', `${eventId}:${attemptId}`, VENUE_SECTOR_ID, state.tick);
      } else if (result?.outcome === 'failed') {
        emitCommissionCue(bus, 'commission.counterweight.failed', `${eventId}:${attemptId}`, VENUE_SECTOR_ID, state.tick);
      }
    }
    return result;
  }

  function payoutAuthorization(eventId, attemptId) {
    const def = COUNTERWEIGHT_EVENT_BY_ID[eventId], rec = row().records[eventId], pending = rec?.pendingReward;
    if (!def || !pending || rec.paid || pending.eventId !== eventId || pending.attemptId !== attemptId
      || rec.lastAttemptKey !== `${eventId}:${attemptId}` || rec.lastResult?.outcome !== 'complete'
      || rec.lastResult.practice === true || !(rec.completions > 0)) return null;
    return { eventId, attemptId, key: `counterweight:first-completion:${eventId}`, amount: def.rewardCr };
  }

  function payoutAlreadyAccepted(eventId) {
    return !!COUNTERWEIGHT_EVENT_BY_ID[eventId] && row().records[eventId]?.paid === true;
  }

  function acceptPayout(eventId, attemptId, creditedCr) {
    const auth = payoutAuthorization(eventId, attemptId);
    if (!auth || creditedCr !== auth.amount) return false;
    const r = row(), rec = r.records[eventId];
    rec.paid = true;
    delete rec.pendingReward;
    rec.lastResult.rewardCr = creditedCr;
    rec.lastResult.rewardStatus = 'accepted';
    if (r.lastResult === rec.lastResult || (r.lastResult?.eventId === eventId && r.lastResult?.outcome === 'complete')) {
      r.lastResult.rewardCr = creditedCr; r.lastResult.rewardStatus = 'accepted';
    }
    r.revision += 1;
    return true;
  }

  function settlePendingReward(eventId) {
    const rec = row().records[eventId], pending = rec?.pendingReward;
    if (!pending) return null;
    const economy = ctx.registry?.get?.('economy');
    if (typeof economy?.settleCounterweightResult !== 'function') {
      if (rec.lastResult) rec.lastResult.rewardStatus = 'economy_unavailable';
      return { ok: false, reason: 'economy_unavailable' };
    }
    try {
      const receipt = economy.settleCounterweightResult(eventId, pending.attemptId);
      if (!receipt?.ok && rec.lastResult) rec.lastResult.rewardStatus = receipt?.reason || 'payment_refused';
      if (receipt?.ok && state.counterweightCircuitOffer?.id === 'counterweight:result'
        && row().lastResult?.eventId === eventId) emitResultOffer(row().lastResult);
      return receipt;
    } catch (error) {
      if (rec.lastResult) rec.lastResult.rewardStatus = 'payment_error';
      console.error('[Counterweight Circuit] reward settlement failed', error);
      return { ok: false, reason: 'payment_error' };
    }
  }

  function cancelLiveAttempt(reason) {
    if (!attempt) return;
    cancelAttempt(attempt.fsm, { simTime: state.simTime }, reason);
    endAttempt('cancelled', reason);
  }

  // ── offers ────────────────────────────────────────────────────────────────

  function emitOffer(spec) {
    if (!spec) return;
    if (state.counterweightCircuitOffer?.id !== spec.id || spec.id !== 'counterweight:progress') offerGeneration += 1;
    spec = { ...spec, generation: offerGeneration };
    // Domain mirror — the browser prompt lane (and the worker bridge) reads
    // this state copy; live receipts still arrive on the bus first.
    state.counterweightCircuitOffer = spec;
    bus?.emit('counterweightCircuit:offer', spec);
  }
  function emitProgressOffer(force = false) {
    if (!attempt) return;
    if (!force && state.simTime - lastProgressAt < 0.5) return;
    lastProgressAt = state.simTime;
    const fragile = attempt.def.bodies.find((b) => b.fragile);
    let conditionFrac = null;
    if (fragile) {
      const live = attempt.cohort.get(fragile.role);
      if (live && live.hullMax > 0) conditionFrac = Math.max(0, live.hull / live.hullMax);
    }
    emitOffer(attemptProgressSpec(state, { attempt, simTime: state.simTime, conditionFrac }));
  }
  function emitResultOffer(result) {
    const canReview = inVenueSector() && state.mode === 'flight' && !!player() && playerDist() <= OFFER_RANGE_WU;
    emitOffer(resultOfferSpec(result, { canReview }));
  }
  function closeOffers() {
    offerGeneration += 1;
    state.counterweightCircuitOffer = null;
    bus?.emit('counterweightCircuit:close', { id: 'counterweight' });
  }

  // ── render mirror ─────────────────────────────────────────────────────────
  // state.counterweightCircuitView: the bounded, presentation-only course view
  // the annotation adapter (and the worker bridge mirror) reads. Absolute world
  // positions, plain data, rebuilt at ≤8 Hz while an attempt lives.

  function publishView(force = false) {
    if (!attempt) {
      const lastResult = row().lastResult || null;
      state.counterweightCircuitView = lastResult ? { phase: null, journal: { attempt: null, lastResult } } : null;
      lastViewAt = -1;
      latestObservation = null;
      return;
    }
    if (!force && state.simTime - lastViewAt < 0.125) return;
    lastViewAt = state.simTime;
    const journal = projectCounterweightCircuitJournal(state, { attempt, simTime: state.simTime });
    const currentLives = {};
    for (const body of attempt.def.bodies) {
      const entity = attempt.cohort.get(body.role);
      if (entity && state.entities?.get(entity.id) === entity && physical.nativeReady(entity)) {
        currentLives[body.role] = { id: entity.id, generation: entity.occupantGeneration };
      }
    }
    const handling = projectCounterweightHandling({
      def: attempt.def, fsm: attempt.fsm, currentLives,
      observation: latestObservation?.attempt === attempt && latestObservation.observation.simTime === state.simTime
        ? latestObservation.observation : null,
      admitted: !attempt.admissionPending, inFlight: state.mode === 'flight', inVenueSector: inVenueSector(),
      eventId: attempt.eventId, attemptId: attempt.attemptId,
    });
    const marks = [];
    for (const b of attempt.def.bodies) {
      if (!b.zone) continue;
      const entity = attempt.cohort.get(b.role);
      const abs = entity?.pos || venueGlobalPos({ x: b.local.x + attempt.shift.x, z: b.local.z + attempt.shift.z });
      marks.push({
        shape: 'ring', kind: 'receiver', label: b.zone.label || b.role,
        x: abs.x + (b.zone.offset?.x || 0), z: abs.z + (b.zone.offset?.z || 0),
        r: b.zone.radius, followId: entity?.id ?? null,
      });
    }
    const ex = attempt.def.exclusion;
    if (ex) {
      const anchorEnt = attempt.cohort.get(ex.role);
      const abs = anchorEnt?.pos || venueGlobalPos({ x: 0, z: 0 });
      marks.push({ shape: 'ring', kind: 'exclusion', x: abs.x, z: abs.z, r: ex.radius, followId: anchorEnt?.id ?? null });
    }
    const gates = { ...(attempt.def.gates || {}), ...(attempt.def.gate ? { gate: attempt.def.gate } : {}) };
    const activeGate = attempt.def.legs[attempt.fsm.legIndex]?.gate;
    for (const [gateId, g] of Object.entries(gates)) {
      const gp = venueGlobalPos({ x: g.pos.x + attempt.shift.x, z: g.pos.z + attempt.shift.z });
      marks.push({
        shape: 'gate', kind: 'gate', gateId, label: g.label, active: gateId === activeGate,
        ax: gp.x - g.axis.x * g.halfWidth, az: gp.z - g.axis.z * g.halfWidth,
        bx: gp.x + g.axis.x * g.halfWidth, bz: gp.z + g.axis.z * g.halfWidth,
      });
    }
    if (attempt.def.bounds) {
      const b = attempt.def.bounds;
      const bp = venueGlobalPos({ x: b.pos.x + attempt.shift.x, z: b.pos.z + attempt.shift.z });
      marks.push({ shape: 'ring', kind: 'bounds', x: bp.x, z: bp.z, r: b.radius });
    }
    state.counterweightCircuitView = {
      eventId: attempt.eventId,
      attemptId: attempt.attemptId,
      journal,
      handling,
      admission: attempt.admissionPending ? { generation: attempt.admissionGeneration,
        bodies: attempt.def.bodies.map(b => ({ id: attempt.cohort.get(b.role).id,
          generation: attempt.cohort.get(b.role).occupantGeneration, file: b.file })) } : null,
      phase: attempt.fsm.phase,
      armedAt: attempt.fsm.phase === 'running' ? attempt.fsm.armedAt : null,
      marks,
    };
  }

  const reducedMotionPref = () => state?.settings?.video?.motionReduce === true;

  // ── actions from the prompt adapter ───────────────────────────────────────

  function onAction(payload = {}) {
    const r = row();
    const { action, eventId } = payload;
    const offer = state.counterweightCircuitOffer;
    const choiceId = eventId ? `${action}:${eventId}` : action;
    if (!offer || payload.offerId !== offer.id || payload.generation !== offer.generation
      || !offer.choices?.some(choice => choice.id === choiceId && choice.disabled !== true)) return;
    if (!attempt && !['close', 'leave'].includes(action)
      && (!inVenueSector() || state.mode !== 'flight' || !player() || playerDist() > OFFER_RANGE_WU)) {
      if (offer.id === 'counterweight:result' && r.lastResult) emitResultOffer(r.lastResult);
      else emitOffer({ ...offer, detail: `${offer.detail || ''}\nReturn to the registrar to choose another course.` });
      return;
    }
    if (action === 'menu') {
      emitOffer(registrarOfferSpec(state, { attempt }));
    } else if (action === 'events' || action === 'courseList') {
      emitOffer({ id: 'counterweight:events', kind: 'contact', sender: 'Circuit Registrar',
        headline: 'COURSES', statusFlag: 'menu',
        detail: 'Choose an event to preview.',
        choices: COUNTERWEIGHT_EVENTS.map((def) => ({ id: `preview:${def.id}`, label: `${def.index + 1}. ${def.title}` }))
          .concat([{ id: 'close', label: 'Leave' }]) });
    } else if (action === 'preview' && eventId) {
      emitOffer(eventPreviewSpec(state, eventId, { attempt }));
    } else if (action === 'records') {
      emitOffer(recordsOfferSpec(state, { attempt }));
    } else if (action === 'ghost') {
      // Opt-in toggle; reduced-motion playback stays suppressed unless the pilot
      // explicitly allows it here.
      r.settings.ghostEnabled = !r.settings.ghostEnabled;
      if (reducedMotionPref() && r.settings.ghostEnabled) r.settings.ghostReduceMotion = true;
      if (!r.settings.ghostEnabled) r.settings.ghostReduceMotion = false;
      r.revision += 1;
      emitOffer(registrarOfferSpec(state, { attempt }));
    } else if (action === 'practice' && eventId) {
      if (!startAttempt(eventId, true)) emitOffer({ ...eventPreviewSpec(state, eventId, { attempt }),
        detail: 'The course is not ready. Clear the apron and try again.' });
    } else if (action === 'attempt' && eventId) {
      if (!startAttempt(eventId, false)) emitOffer({ ...eventPreviewSpec(state, eventId, { attempt }),
        detail: 'The course is not ready. Clear the apron and try again.' });
    } else if (action === 'cancel') {
      cancelLiveAttempt('cancelled');
    } else if (action === 'close' || action === 'leave') {
      closeOffers();
    }
  }

  function onInspect(payload = {}) {
    bus?.emit('counterweightCircuit:view', projectCounterweightCircuitView(state, {
      attempt, simTime: state.simTime, reducedMotion: reducedMotionPref(),
      requestId: payload.requestId,
    }));
  }

  function onPresentationReady(payload = {}) {
    if (!attempt?.admissionPending || payload.attemptId !== attempt.attemptId
      || payload.generation !== attempt.admissionGeneration) return;
    if (!Array.isArray(payload.bodies) || payload.bodies.length !== attempt.def.bodies.length) return;
    const entries = new Map(payload.bodies.map(b => [b.id, b.generation]));
    if (entries.size !== attempt.cohort.size || [...attempt.cohort.values()].some(entity =>
      state.entities?.get(entity.id) !== entity || entity.alive === false
      || entries.get(entity.id) !== entity.occupantGeneration)) return;
    attempt.presentationReady = true;
  }

  // ── the tick ──────────────────────────────────────────────────────────────

  function update(dt) {
    if (restoring) return;
    const r = row();
    if (state.simTime >= nextRewardRetryAt) {
      nextRewardRetryAt = state.simTime + 5;
      for (const def of COUNTERWEIGHT_EVENTS) if (r.records[def.id]?.pendingReward) settlePendingReward(def.id);
    }
    if (!inVenueSector()) {
      if (attempt) cancelLiveAttempt('left_venue');
      if (registrarInRange) { registrarInRange = false; closeOffers(); }
      return;
    }
    const dist = playerDist();
    if (dist > VENUE_RANGE_WU) {
      if (attempt) cancelLiveAttempt('left_venue');
      if (registrarInRange) { registrarInRange = false; closeOffers(); }
      return;
    }
    // Materialize the apron once the pilot is in range — real fixture bodies,
    // durable identities, spawned exactly once per occupancy.
    if (dist <= VENUE_RANGE_WU * 0.9) {
      r.venueSpawned = physical.ensureVenue();
    }
    if (!r.discovered && dist <= DISCOVER_RANGE_WU) {
      r.discovered = true;
      r.firstDiscoveredAt = state.simTime;
      r.revision += 1;
      bus?.emit('counterweightCircuit:discovered', { sectorId: VENUE_SECTOR_ID });
      bus?.emit('ui:toast', { text: 'Counterweight Circuit — training apron charted', kind: 'site' });
    }

    if (attempt) {
      // Keep the proximity edge current during the course without replacing its progress/result
      // card; a result reached away from the mast must remain readable until re-entry.
      registrarInRange = dist <= OFFER_RANGE_WU && state.mode === 'flight' && !!player();
      // Leaving the venue, docking or losing the ship cancels — never a win.
      if (dist > CANCEL_RANGE_WU || state.mode !== 'flight' || !player()) {
        cancelLiveAttempt('left_venue');
      } else {
        if (attempt.admissionPending) {
          if (attempt.presentationReady && physical.cohortAdmission(attempt.cohort, attempt.def).ready) activateAttempt();
          else if (state.simTime - attempt.admissionStartedAt > 30) cancelLiveAttempt('admission_unconfirmed');
          if (attempt) { emitProgressOffer(false); publishView(false); }
          return;
        }
        const obs = physical.observe(attempt.cohort, attempt.def, dt);
        latestObservation = { attempt, observation: obs };
        obs.committed = obs.committed || attempt.fsm.phase === 'running';
        // Measured contact on course bodies feeds the attempt's honest
        // damage/impact tally (result reasons; fragility is canonical hull).
        for (const imp of obs.impacts) {
          attempt.fsm.mem.impacts += 1;
          if (imp.dp > attempt.fsm.mem.maxImpactDp) attempt.fsm.mem.maxImpactDp = imp.dp;
        }
        const events = advanceAttempt(attempt.fsm, attempt.def, obs);
        physical.stepMobile(dt);
        if (ghostRec && attempt.fsm.phase === 'running') {
          const p = player();
          if (p) ghostRec.sample(state.simTime, p.pos, p.rot);
        }
        for (const ev of events) {
          if (ev.type === 'armed') {
            emitProgressOffer(true);
          } else if (ev.type === 'leg') {
            const legKind = attempt.def.legs[ev.index]?.kind;
            if (ghostRec) {
              const p = player();
              const markKind = { attach: 'attach', release: 'release', transit: 'gate', seat: 'seat', contain: 'seat', swing: 'swing' }[legKind];
              if (markKind) ghostRec.mark(markKind, p?.pos, p?.rot, state.simTime, attempt.def.legs[ev.index]?.role || '');
            }
            emitProgressOffer(true);
          } else if (ev.type === 'retry') {
            bus?.emit('ui:toast', { text: `${attempt.def.title}: re-line and take it again`, kind: 'info' });
            emitProgressOffer(true);
          } else if (ev.type === 'finished') {
            endAttempt(ev.outcome, ev.reason);
          }
        }
        if (attempt) { emitProgressOffer(false); publishView(false); }
      }
      return;
    }

    // Orphan sweep: a cohort body that outlived its attempt (demoted-and-
    // rematerialized across a sector hop, or a restore edge) is feature-owned —
    // it retires, never lingers as a free original. Bounded to one scan / 5 s.
    if (state.simTime >= nextOrphanSweepAt) {
      nextOrphanSweepAt = state.simTime + 5;
      for (const e of state.entityList || []) {
        if (e?.data?.persistenceOwner === CIRCUIT_OWNER && e.data.counterweightAttempt != null) {
          physical.retireEntity(e, 'counterweight_orphan');
        }
      }
    }

    // Entering the registrar's range opens one session; only leaving rearms it.
    const nearRegistrar = dist <= OFFER_RANGE_WU && state.mode === 'flight' && !!player();
    if (nearRegistrar && !registrarInRange) {
      registrarInRange = true;
      if (state.counterweightCircuitOffer?.id === 'counterweight:result' && r.lastResult) emitResultOffer(r.lastResult);
      else emitOffer(registrarOfferSpec(state, { attempt: null }));
    } else if (!nearRegistrar && registrarInRange) {
      registrarInRange = false;
      if (state.counterweightCircuitOffer?.id === 'counterweight:result' && r.lastResult) emitResultOffer(r.lastResult);
      else closeOffers();
    }
  }

  // ── lifecycle ─────────────────────────────────────────────────────────────

  function init(context) {
    ctx = context;
    state = context.state;
    bus = context.bus;
    helpers = context.helpers;
    physical = createCircuitPhysical(ctx);
    row();
    // Instance-scoped save adapter over the shipped save owner — nests the
    // section inside the world bag on both save lanes (persistence.js).
    releaseSaveAdapter = installCounterweightCircuitSaveAdapter(
      ctx.registry?.get?.('save'), system);
    const on = (name, fn) => { if (bus?.on) unsubs.push(bus.on(name, fn)); };
    on('counterweightCircuit:action', onAction);
    on('counterweightCircuit:inspect', onInspect);
    on('counterweightCircuit:presentationReady', onPresentationReady);
    on('credits:changed', payload => {
      const prefix = 'counterweight:first-completion:';
      const key = payload?.reason;
      if (typeof key !== 'string' || !key.startsWith(prefix) || !(payload.delta > 0) || restoring || !inVenueSector()) return;
      const eventId = key.slice(prefix.length);
      if (COUNTERWEIGHT_EVENT_BY_ID[eventId] && row().records[eventId]?.paid === true) {
        emitCommissionCue(bus, 'commission.counterweight.payout', key, VENUE_SECTOR_ID, state.tick);
      }
    });
    on('save:restoring', () => { restoring = true; admissionGeneration += 1; closeOffers(); });
    on('save:loaded', afterContinue);
    on('save:error', payload => {
      if (!restoring || payload?.reason !== 'load_failed') return;
      restoring = false;
      if (attempt) cancelLiveAttempt('interrupted');
    });
    on('sector:exit', () => {
      // Leaving mid-flight cancels clearly; venue fixtures stay — durable
      // persistent originals that the residency owner shelves and returns.
      if (attempt) cancelLiveAttempt('left_venue');
      publishView(true);
      registrarInRange = false;
      closeOffers();
    });
    on('entity:destroyed', (payload = {}) => {
      // A destroyed cohort body can never become a win during cleanup — the
      // survive constraint already fails it; this only clears the binding so
      // the observation frame reports the body gone, not stale.
      const e = payload.entity;
      if (!e || e.data?.persistenceOwner !== CIRCUIT_OWNER) return;
      if (attempt && e.data?.counterweightAttempt === attempt.attemptId) {
        // Leave the entity in the cohort map — observe() reports alive:false
        // and the survive constraint does the honest failing.
      }
    });
  }

  function newGame() {
    reset(true);
  }

  function reset(full = false) {
    if (attempt) {
      physical.retireMobile();
      physical.retireCohort(attempt.cohort);
      attempt = null;
    }
    ghostRec = null;
    if (full) {
      // Retire every owned fixture — a fresh run rematerializes the venue.
      for (const e of state.entityList || []) {
        if (e?.data?.persistenceOwner === CIRCUIT_OWNER) physical.retireEntity(e, 'counterweight_newgame');
      }
      state.world.counterweightCircuit = freshCounterweightCircuitState();
    }
    state.counterweightCircuitView = null;
    state.counterweightCircuitGhost = null;
    state.counterweightCircuitOffer = null;
    registrarInRange = false; offerGeneration += 1; lastProgressAt = -1; lastViewAt = -1;
    admissionGeneration += 1;
  }

  function destroy() {
    reset(true);
    physical?.dispose();
    for (const off of unsubs.splice(0)) { try { off?.(); } catch (_) { /* noop */ } }
    try { releaseSaveAdapter?.(); } catch (_) { /* noop */ }
    releaseSaveAdapter = null;
  }

  // The durable section — plain JSON only. The live cohort map is runtime
  // identity; the saved attempt carries the identities it must rebind.
  function serialize() {
    const r = row();
    const out = clone(r);
    if (attempt && attempt.fsm && (attempt.fsm.phase === 'staged' || attempt.fsm.phase === 'running')) {
      out.attempt = {
        eventId: attempt.eventId,
        attemptId: attempt.attemptId,
        practice: attempt.practice,
        fsm: clone(attempt.fsm),
        shift: attempt.shift,
        cohort: [...attempt.cohort.keys()],
      };
    } else {
      out.attempt = null;
    }
    return out;
  }

  function deserialize(raw) {
    const restored = normalizeCounterweightCircuitState(raw);
    state.world.counterweightCircuit = restored;
    attempt = null;
    ghostRec = null;
    if (restored.attempt && COUNTERWEIGHT_EVENT_BY_ID[restored.attempt.eventId]) {
      const def = COUNTERWEIGHT_EVENT_BY_ID[restored.attempt.eventId];
      const fsm = restored.attempt.fsm;
      if (fsm && (fsm.phase === 'staged' || fsm.phase === 'running')) {
        attempt = {
          eventId: restored.attempt.eventId,
          attemptId: restored.attempt.attemptId,
          practice: restored.attempt.practice === true,
          fsm, defBase: def, shift: restored.attempt.shift || { x: 0, z: 0 },
          cohort: new Map(), cohortRoles: restored.attempt.cohort || [],
        };
      }
    }
  }

  function afterContinue() {
    physical.afterRestore();
    restoring = false;
    if (!attempt) { publishView(true); return; }
    // Rebind the saved cohort to the bodies the entity restore actually brought
    // back. A body that did not return marks the attempt interrupted —
    // unconfirmed, never awarded, never inferred.
    const def = attempt.defBase || attempt.def;
    attempt.def = materializeDef(def, attempt.shift || { x: 0, z: 0 });
    const cohort = new Map();
    let missing = false;
    const expectedRoles = def.bodies.map(b => b.role);
    if (attempt.cohortRoles.length !== expectedRoles.length
      || new Set(attempt.cohortRoles).size !== expectedRoles.length
      || expectedRoles.some(role => !attempt.cohortRoles.includes(role))) missing = true;
    for (const role of expectedRoles) {
      const identity = `pro:counterweightCircuit:att${attempt.attemptId}:${role}`;
      const entity = physical.byIdentity(identity);
      if (entity) cohort.set(role, entity);
      else missing = true;
    }
    attempt.cohort = cohort;
    // The save format has no authoritative native/line or presentation continuity receipt.
    // Never resume a partially witnessed run: the player can start a fresh attempt instead.
    attempt.fsm.phase = 'failed';
    attempt.fsm.reason = 'interrupted';
    attempt.fsm.reasonDetail = missing ? 'cohort_missing' : 'continuity_unconfirmed';
    endAttempt('failed', 'interrupted_unconfirmed');
  }

  const system = {
    name: FEATURE_ID,
    init, update, newGame, reset, destroy,
    serialize, deserialize, afterContinue,
    payoutAuthorization, payoutAlreadyAccepted, acceptPayout,
    // Test/driver seams — the same functions update() uses, exposed for rigs.
    _startAttempt: startAttempt,
    _cancelAttempt: cancelLiveAttempt,
    _attempt: () => attempt,
    _row: row,
    _physical: () => physical,
  };
  const initOrig = init;
  init = function (context) { system.ctx = context; return initOrig(context); };
  system.init = init;
  return system;
}
