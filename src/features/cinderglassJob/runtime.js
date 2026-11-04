import { CINDERGLASS_JOB_PHASES as P, CINDERGLASS_JOB_CUSTODY as C, CINDERGLASS_JOB_OUTCOMES as O,
  CINDERGLASS_JOB_TEXT as T, CINDERGLASS_JOB_SECTOR_ID, CINDERGLASS_JOB_ROLES,
  CINDERGLASS_JOB_CARRIER_ID, CINDERGLASS_JOB_POINTS } from './definition.js';
import { createCinderglassJobState, cinderglassJobOfferEligible, cinderglassJobOfferOpen,
  cinderglassJobMakeOffer, cinderglassJobDecline, cinderglassJobClose, rememberFact, recordReceipt } from './operation.js';
import { cinderglassJobAdmit, cinderglassJobStepConvoy, cinderglassJobDismissConvoy } from './convoy.js';
import { cinderglassJobEnsureLatchMount, cinderglassJobCohortReady } from './physical.js';
import { attachments, podEntity, carrierEntity, cinderglassJobEnsureClamp, cinderglassJobLiveClamp,
  cinderglassJobObserveCustody, cinderglassJobReleasePod, cinderglassJobStepHandoff,
  cinderglassJobReceiveQuote, nativeCinderglassAttachment, nativeCinderglassPose } from './custody.js';
import { cinderglassJobProposalAvailable, cinderglassJobPropose, cinderglassJobDaskRelease } from './negotiation.js';
import { cinderglassJobObserveScan, cinderglassJobObserveMarkings, cinderglassJobServiceGate,
  cinderglassJobServiceProgress, cinderglassJobServiceAbort } from './interception.js';
import { cinderglassJobApplyClosingMemory, cinderglassJobApplyConsequences } from './consequences.js';
import { cinderglassJobRevisit } from './contact.js';
import { restoreCinderglassJob, installCinderglassJobSave, uninstallCinderglassJobSave } from './persistence.js';
import { publishCinderglassJobReadModel } from './readModel.js';
import { nextCinderglassLife, currentRole, bindRole, exactRoleEvent } from './identity.js';
import { emitCommissionCue } from '../../audio/commissionCues.js';

export const cinderglassJobSystem = {
  name: 'cinderglassJob',
  init(ctx) {
    this.destroy();
    Object.assign(this, { state: ctx.state, bus: ctx.bus, registry: ctx.registry, helpers: ctx.helpers || {},
      _subs: [], _bindings: new Map(), _destroying: false, _restoring: false, _needsRebind: true,
      _presentationReady: false, _serviceActionId: null, _promptSignature: null, _factsEmitted: new Set() });
    this._cg = ensureCinderglassJobState(this.state);
    this._invalidateLife();
    const on = (name, fn) => this._subs.push(this.bus.on(name, fn));
    on('cinderglassJob:action', p => this._onAction(p));
    on('cinderglassJob:presentationReady', p => this._onPresentationReady(p));
    // Mission settlement writes the canonical 47-A step before this event.
    // Docking can pause the sim immediately afterwards, so the normal idle
    // update may never get a chance to publish the newly available contact.
    on('mission:completed', () => {
      if (!this._restoring && !this._destroying && cinderglassJobOfferEligible(this.state)
        && !this.state.cinderglassJobView?.contacts?.length) this._publish();
    });
    on('credits:changed', p => {
      const settlement = this._cg?.settlement;
      if (!this._restoring && !this._destroying && this.state.world?.currentSectorId === CINDERGLASS_JOB_SECTOR_ID
        && settlement && p?.reason === settlement.key && p.delta === settlement.creditedCr && p.delta > 0) {
        emitCommissionCue(this.bus, 'commission.cinderglass.settlement', settlement.key, CINDERGLASS_JOB_SECTOR_ID, this.state.tick);
      }
    });
    on('scan:pulse', p => { if (!this._restoring) cinderglassJobObserveScan(this, this.state, p); });
    for (const name of ['entity:killed', 'entity:destroyed']) on(name, p => this._onEntityKilled(p));
    on('npcjobs:complete', p => this._onRouteComplete(p));
    on('save:restoring', () => { this._restoring = true; this._invalidateLife(); this._bindings.clear(); });
    on('save:loaded', () => { this._restoring = false; this._needsRebind = true; });
    for (const name of ['player:death', 'player:respawn']) on(name, () => {
      this._invalidateLife(); this._cg.serviceActive = false; this._cg.serviceProgressS = 0;
      this._needsRebind = true; this._closePrompts();
    });
    on('sector:exit', () => { this._invalidateLife(); this._serviceActionId = null; this._cg.serviceActive = false; this._closePrompts(); });
    on('sector:enter', () => { this._needsRebind = true; this._presentationReady = false; });
    installCinderglassJobSave(this);
  },
  token() { return this._lifeToken; },
  _invalidateLife() {
    if (!this.state) return;
    this._lifeToken = nextCinderglassLife(this.state);
    this._cgScanSeq = -1; this._serviceActionId = null; this._presentationReady = false;
    this._promptSignature = null; this._factsEmitted = new Set();
    this._leftAvailability = null; this._lastViewKey = null; this._nextActiveViewAt = 0;
    if (this._cg) { this._cg.serviceActive = false; this._cg.serviceProgressS = 0; }
    this.state.cinderglassJobToken = this.token();
    this.state.cinderglassJobPresentationReady = false;
    this.state.cinderglassJobOffer = null;
  },
  newGame() {
    this._retirePhysical();
    this._cg = resetCinderglassJobState(this.state);
    this._needsRebind = true; this._restoring = false; this._invalidateLife(); this._closePrompts();
  },
  reset() { this.newGame(); },
  update(dt, state) {
    if (this._destroying || this._restoring || this.registry?.get('save')?._restoring) return;
    const st = this._cg = ensureCinderglassJobState(state);
    installCinderglassJobSave(this);
    if (this._needsRebind) this._rebind(state);
    if (this._pendingJobs) this._rebindJobs(state);
    if (st.phase === P.OFFER || st.outcome === O.DECLINED) {
      if (cinderglassJobOfferOpen(st, state)) this._openOffer();
      this._publish(false); return;
    }
    if (st.phase === P.CLOSED) {
      this._stepClosure(state);
      cinderglassJobApplyClosingMemory(this, state); cinderglassJobApplyConsequences(this, state);
      this._publishFacts(); this._publish(false); return;
    }
    if (state.world?.currentSectorId !== CINDERGLASS_JOB_SECTOR_ID) { this._publish(false); return; }
    if (st.phase === P.DISPATCH) {
      if (state.mode !== 'flight' || state.player?.docked || state.ui?.docked) { this._publish(false); return; }
      const admitted = cinderglassJobAdmit(this, state);
      this._rebind(state);
      const clamp = cinderglassJobEnsureClamp(this, state);
      if (admitted && clamp && this._presentationReady && cinderglassJobCohortReady(this, state)) {
        st.cohortAdmitted = true; st.phase = P.RECON;
        rememberFact(st, state.simTime, 'convoy_out', T.scanHint);
      }
      this._publishApproachPrompts(); this._publish(false); return;
    }
    if (!this._presentationReady) { this._publish(false); return; }
    if (st.custody === C.CARRIED) cinderglassJobEnsureClamp(this, state);
    cinderglassJobStepConvoy(this, state);
    cinderglassJobObserveCustody(this, state);
    cinderglassJobObserveMarkings(this, state);
    if (this._serviceActionId != null) {
      const r = cinderglassJobServiceProgress(this, state, this._serviceActionId, dt);
      if (r.status !== 'running') {
        const serviceId = this._serviceActionId;
        this._serviceActionId = null; st.serviceActive = false;
        if (r.status === 'interrupted') {
          cinderglassJobServiceAbort(this, state, r.reason);
          emitCommissionCue(this.bus, 'commission.cinderglass.interrupted', `${this.token()}:${st.operationId}:${serviceId}`, CINDERGLASS_JOB_SECTOR_ID, state.tick);
          this._refuseAction(null, r.reason);
        }
        st.promptRevision++;
      }
    }
    if (!st.outcome) cinderglassJobDaskRelease(this, state);
    cinderglassJobStepHandoff(this, state);
    this._stepClosure(state);
    cinderglassJobApplyClosingMemory(this, state); cinderglassJobApplyConsequences(this, state);
    this._publishApproachPrompts(); this._publishFacts(); this._publish(false);
  },
  _openOffer() {
    const st = this._cg;
    const offer = cinderglassJobMakeOffer(st, this.state);
    offer.token = this.token(); offer.operationId = st.operationId; offer.revision = ++st.promptRevision;
    st.offer.spec = offer;
    this.state.cinderglassJobOffer = offer;
    this.bus.emit('cinderglassJob:offer', offer);
  },
  _rebind(state) {
    this._needsRebind = false;
    const st = this._cg, matches = new Map(Object.keys(CINDERGLASS_JOB_ROLES).map(k => [k, []]));
    if (!st.operationId) return;
    for (const e of state.entities?.values() || []) for (const [key, d] of Object.entries(CINDERGLASS_JOB_ROLES)) {
      if (e.data?.worldRecordId === d.worldRecordId && e.data.cinderglassRole === d.role
        && e.data.cinderglassOperationId === st.operationId && e.alive !== false) matches.get(key).push(e);
    }
    for (const [key, list] of matches) {
      if (list.length === 1) bindRole(this, key, list[0]);
      else { this._bindings.delete(key); st.entities[key] = null; if (list.length > 1) st.bindingConflict = key; }
    }
    this._rebindJobs(state);
    const svc = attachments(this), pod = podEntity(this, state);
    for (const [bodyKey, jointKey] of [['carrierId','clampAttachmentId'], ['cradleId','cradleAttachmentId'], ['brokerId','brokerAttachmentId']]) {
      const owner = currentRole(this, state, bodyKey);
      const joint = owner && pod && svc?.listForEntity(owner.id).find(a => a.state === 'active'
        && a.defId === 'attachment_transport_clamp' && a.ownerId === owner.id && a.targetId === pod.id
        && a.ownerGeneration === owner.occupantGeneration && a.targetGeneration === pod.occupantGeneration);
      st.entities[jointKey] = joint?.id ?? null;
    }
    if (st.custody === C.CARRIED && st.entities.clampAttachmentId != null) st.entities.pendingClamp = false;
    if (currentRole(this, state, 'latchId')) cinderglassJobEnsureLatchMount(this, state);
  },
  _rebindJobs(state) {
    const st = this._cg;
    for (const [bodyKey, jobKey] of [['carrierId','carrierJobId'], ['escortAId','escortAJobId'], ['escortBId','escortBJobId']]) {
      const e = currentRole(this, state, bodyKey), id = `job:${CINDERGLASS_JOB_ROLES[bodyKey].worldRecordId}`;
      const entry = state.npcJobs?.byId?.[id];
      st.entities[jobKey] = e && entry?.job?.id === id && entry.worldRecordId === e.data.worldRecordId
        && entry.entityId === e.id && e.data.jobId === id ? id : null;
    }
    this._pendingJobs = st.cohortAdmitted && !st.cohortRetired && !st.runFinished && st.captainAlive && !st.entities.carrierJobId;
  },
  _onPresentationReady(p) {
    if (!p || p.token !== this.token() || p.operationId !== this._cg.operationId || !Array.isArray(p.bodies)) return;
    this._rebind(this.state);
    const bodies = [...this._bindings.values()].map(b => b.entity).filter(e => e.alive !== false);
    const ids = new Map(p.bodies.map(b => [b.id, b.generation]));
    if (ids.size !== bodies.length || p.bodies.length !== bodies.length || !bodies.length
      || bodies.some(e => ids.get(e.id) !== e.occupantGeneration)) return;
    this._presentationReady = true; this.state.cinderglassJobPresentationReady = true;
  },
  _onEntityKilled(p) {
    if (this._restoring || this._destroying) return;
    const st = this._cg, state = this.state;
    if (exactRoleEvent(this, state, 'latchId', p)) {
      st.latchDestroyed = true;
      const out = cinderglassJobReleasePod(this, state, { actorId: state.playerId, reason: 'cinderglass_latch_destroyed' });
      if (out.ok || st.custody !== C.CARRIED) {
        st.approach = 'violent'; st.phase = P.RECOVERY; st.forceUnlawful = true;
        rememberFact(st, state.simTime, 'released_violent', T.releasedViolent);
      }
    }
    if (exactRoleEvent(this, state, 'carrierId', p)) {
      st.captainAlive = false; st.actors.dask.alive = false; st.actors.dask.knowsTheft = true;
      rememberFact(st, state.simTime, 'carrier_lost', 'Oren Dask died on the route. Surviving crew can report what they witnessed.');
      if (!st.outcome) {
        st.approach ||= 'violent'; st.phase = P.RECOVERY;
        // The native attachment owner may have broken the endpoint before this receipt.
        const a = attachments(this)?.get(st.entities.clampAttachmentId);
        if (!a || a.state !== 'active') { st.custody = C.RELEASED; st.entities.pendingClamp = false; }
      }
    }
    if (exactRoleEvent(this, state, 'podId', p) && !st.outcome) {
      st.custody = C.DESTROYED; cinderglassJobClose(st, state.simTime, O.DESTROYED);
      rememberFact(st, state.simTime, 'pod_destroyed', T.podDestroyed);
    }
  },
  _onRouteComplete(p) {
    const st = this._cg, state = this.state, carrier = carrierEntity(this, state);
    if (!carrier || p?.jobId !== `job:${CINDERGLASS_JOB_CARRIER_ID}` || st.outcome) return;
    const entry = state.npcJobs?.byId?.[p.jobId];
    if (!entry || entry.entityId !== carrier.id || entry.worldRecordId !== carrier.data.worldRecordId
      || entry.job?.phase !== 'complete' || entry.job.routeIndex !== entry.job.route.length - 1
      || carrier.data.jobId !== p.jobId) return;
    const pose = nativeCinderglassPose(this, state, carrier), dest = CINDERGLASS_JOB_POINTS.marshal;
    if (!pose || Math.hypot(pose.pos.x - dest.x, pose.pos.z - dest.z) > 20 || Math.hypot(pose.vel.x, pose.vel.z) >= 3.5) return;
    st.runFinished = true;
    recordReceipt(st, state.simTime, { kind: 'route_completed', jobId: p.jobId });
  },
  _stepClosure(state) {
    const st = this._cg;
    if (st.outcome) { if (!st.cohortRetired) { cinderglassJobDismissConvoy(this, state); st.cohortRetired = true; } return; }
    if (st.runFinished && st.custody === C.CARRIED) {
      cinderglassJobClose(st, state.simTime, O.CONSIGNMENT_DELIVERED);
      rememberFact(st, state.simTime, 'convoy_left', T.convoyLeftLine);
      cinderglassJobDismissConvoy(this, state); st.cohortRetired = true;
    } else if (st.runFinished && !st.cohortRetired) { cinderglassJobDismissConvoy(this, state); st.cohortRetired = true; }
  },
  _publishApproachPrompts() {
    const st = this._cg, state = this.state, choices = [];
    let headline = 'Choose how to recover the original controller.', detail = 'Force is unlawful; normal damage and witness rules apply.';
    if (st.phase === P.DISPATCH) {
      headline = 'Preparing the original convoy hardware.';
      detail = st.admissionReason ? `Waiting for ${st.admissionReason.replaceAll('_', ' ')}. No deposit has been charged.` : 'Native bodies, released visuals and traffic owners must all be ready.';
      choices.push({ id: 'retryAdmission', label: 'Retry preparation' }, { id: 'abandon', label: 'Abandon this recovery' });
    } else if (st.serviceActive) {
      headline = `Servicing the external latch · ${Math.floor(st.serviceProgressS / 5 * 100)}%`;
      detail = 'Hold close, matched drift and clear sightlines for five seconds.';
      choices.push({ id: 'serviceAbort', label: 'Abort service' });
    } else if ([P.RECON, P.DECIDE].includes(st.phase)) {
      if (cinderglassJobProposalAvailable(this, state)) choices.push({ id: 'propose', label: 'Post the quoted 150CR inspection deposit' });
      if (cinderglassJobServiceGate(this, state).ok) choices.push({ id: 'serviceStart', label: 'Quietly service the latch · five seconds' });
    } else if (st.phase === P.RECOVERY && st.receiveQuote) {
      const q = st.receiveQuote;
      headline = `${q.recipient === 'tala' ? 'Tala' : 'Khand'} offers ${q.amount}CR for this ${q.condition} original.`;
      detail = `${q.baseCr}CR payment${q.refundCr ? ' + 150CR paid deposit refund' : ''}. Acceptance transfers this original into the receiving clamp.`;
      choices.push({ id: q.recipient === 'tala' ? 'receiveTala' : 'receiveBroker', label: `Accept physical ${q.recipient === 'tala' ? 'return' : 'unlawful sale'}`, quoteId: q.quoteId, recipient: q.recipient });
    }
    if (choices.length && !st.serviceActive) choices.push({ id: 'leave', label: 'Leave this conversation' });
    const availability = JSON.stringify(choices);
    if (!choices.length) this._leftAvailability = null;
    const spec = choices.length && !st.outcome && availability !== this._leftAvailability ? { id: 'cinderglassJob:approach', headline, detail,
      choices, token: this.token(), operationId: st.operationId, revision: st.promptRevision } : null;
    const sig = JSON.stringify(spec);
    if (sig !== this._promptSignature) { this._promptSignature = sig; st.approachPrompt = spec; this.bus.emit('cinderglassJob:servicePrompt', spec); }
  },
  _onAction(p) {
    const st = this._cg, state = this.state;
    if (!p || p.token !== this.token() || this._restoring || this._destroying) return this._refuseAction(p, 'stale_life');
    const action = p.action;
    if (action === 'contact') {
      if (!cinderglassJobOfferEligible(state)) return this._refuseAction(p, 'contact_unavailable');
      if (st.outcome && st.outcome !== O.DECLINED || ![P.OFFER,P.CLOSED].includes(st.phase)) return this._refuseAction(p, 'operation_in_progress');
      st.publicRequested = true;
      if (!st.offer && Number(state.simTime) >= st.nextOfferAtS) this._openOffer();
      p.result = { ok: true }; this._publish(); return;
    }
    if (action === 'revisit') {
      if (!cinderglassJobOfferEligible(state)) return this._refuseAction(p, 'contact_unavailable');
      const r = cinderglassJobRevisit(st, p.actor);
      this.bus.emit('cinderglassJob:fact', { id: 'revisit', text: r.line }); p.result = { ok: true }; return;
    }
    if (action === 'accept' || action === 'decline') {
      if (!st.offer?.open || p.offerEpoch !== st.offerEpoch || !cinderglassJobOfferEligible(state)) return this._refuseAction(p, 'stale_offer');
      if (action === 'decline') cinderglassJobDecline(st, state);
      else { st.offer = null; st.publicRequested = false; st.phase = P.DISPATCH; st.runId++;
        st.operationId = `cg:${state.meta.seed}:${st.runId}`; recordReceipt(st, state.simTime, { kind: 'accepted' }); }
      this.state.cinderglassJobOffer = null; this._closePrompts(); p.result = { ok: true }; this._publish(); return;
    }
    if (p.operationId !== st.operationId) return this._refuseAction(p, 'stale_operation');
    if (action === 'track') {
      const marker = this.state.cinderglassJobView?.navigation?.find(m => m.id === p.markerId);
      if (!marker || !Number.isFinite(marker.pos?.x) || !Number.isFinite(marker.pos?.z)) return this._refuseAction(p, 'stale_marker');
      this.bus.emit('ui:setCourse', { pos: { ...marker.pos }, label: marker.label,
        targetEntityId: marker.followId ?? null, autopilot: false, arrivalRadius: 60, source: 'cinderglassJob' });
      p.result = { ok: true };
    } else if (action === 'retryAdmission' && st.phase === P.DISPATCH) {
      st.admissionReason = null; p.result = { ok: true };
    } else if (action === 'abandon' && st.phase === P.DISPATCH) {
      cinderglassJobClose(st, state.simTime, O.LOST);
      rememberFact(st, state.simTime, 'abandoned', 'The recovery was abandoned during preparation. No deposit or reward was paid; no replacement original will be created.');
      this._stepClosure(state); p.result = { ok: true };
    } else if (action === 'propose') {
      p.result = cinderglassJobPropose(this, state, p);
      if (!p.result.ok) this._refuseAction(p, p.result.reason);
    } else if (action === 'serviceStart') {
      const gate = this._presentationReady ? cinderglassJobServiceGate(this, state) : { ok: false, reason: 'admission_pending' };
      if (!gate.ok) return this._refuseAction(p, gate.reason);
      this._serviceActionId = ++st.serviceAttemptId; st.serviceActive = true; st.serviceProgressS = 0; p.result = { ok: true };
    } else if (action === 'serviceAbort') {
      cinderglassJobServiceAbort(this, state, 'aborted'); this._serviceActionId = null; st.serviceActive = false; p.result = { ok: true };
    } else if (action === 'receiveTala' || action === 'receiveBroker') {
      const recipient = action === 'receiveTala' ? 'tala' : 'broker';
      const q = cinderglassJobReceiveQuote(this, state, recipient);
      if (!q || q.quoteId !== p.quoteId) return this._refuseAction(p, 'quote_changed');
      p.result = this.registry?.get('cargo')?.receiveCinderglassPod?.(st.operationId, p.quoteId, p.token)
        || { ok: false, reason: 'cargo_owner_unavailable' };
      if (!p.result.ok) this._refuseAction(p, p.result.reason);
    } else if (action === 'leave') { this._leftAvailability = JSON.stringify(st.approachPrompt?.choices || []); st.promptRevision++; st.approachPrompt = null; this._promptSignature = null; this._closePrompts(); p.result = { ok: true }; }
    else if (action === 'keep') { st.keepAcknowledged = true; rememberFact(st, state.simTime, 'kept', 'You still physically possess the original. The recovery is unpaid and remains unfinished.'); p.result = { ok: true }; }
    else return this._refuseAction(p, 'unknown_action');
    st.promptRevision++; this._publish();
  },
  _refuseAction(p, reason) {
    const st = this._cg;
    if (p) p.result = { ok: false, reason };
    if (st && !this._destroying) {
      st.lastRefusal = { reason, revision: ++st.promptRevision };
      if (reason === 'dask_refused') st.actors.dask.dealRefused = true;
      this.bus?.emit('cinderglassJob:refused', st.lastRefusal); this._publish();
    }
    return p?.result || { ok: false, reason };
  },
  receiveAuthorization(operationId, quoteId, token) {
    if (operationId !== this._cg.operationId || token !== this.token() || !this._presentationReady || this._restoring) return null;
    return ['tala','broker'].map(r => cinderglassJobReceiveQuote(this, this.state, r)).find(q => q?.quoteId === quoteId) || null;
  },
  acceptReceive(receipt, joint) {
    const st = this._cg;
    if (st.custodyReceipt || receipt.operationId !== st.operationId || !nativeCinderglassAttachment(this, this.state, joint)) return false;
    st.custodyReceipt = { ...receipt }; st.pendingReceive = null;
    st.custody = receipt.recipient === 'tala' ? C.RECEIVED : C.BROKERED;
    st.entities[receipt.recipient === 'tala' ? 'cradleAttachmentId' : 'brokerAttachmentId'] = joint.id;
    st.phase = P.HANDOFF; st.promptRevision++;
    return true;
  },
  settlementAuthorization(operationId, receiptId) {
    const st = this._cg, r = st.custodyReceipt, pod = podEntity(this, this.state), recipient = r?.recipient;
    const receiver = currentRole(this, this.state, recipient === 'tala' ? 'cradleId' : 'brokerId');
    const joint = attachments(this)?.get(st.entities[recipient === 'tala' ? 'cradleAttachmentId' : 'brokerAttachmentId']);
    if (!r || st.settlement || operationId !== st.operationId || r.receiptId !== receiptId
      || r.source !== 'cargo:cinderglass' || !pod || pod.hull <= 0 || !receiver
      || pod.data.cinderglassReceiveReceipt !== receiptId || joint?.ownerId !== receiver.id || joint.targetId !== pod.id
      || !nativeCinderglassAttachment(this, this.state, joint)) return null;
    const baseCr = recipient === 'broker' ? r.condition === 'intact' ? 300 : 0 : r.condition === 'intact' ? 450 : 300;
    const refundCr = recipient === 'tala' && st.depositPaid && st.depositReceipt?.amount === 150 && !st.depositRefunded ? 150 : 0;
    if (!baseCr || r.baseCr !== baseCr || r.refundCr !== refundCr || r.amount !== baseCr + refundCr) return null;
    return { recipient, amount: baseCr + refundCr, baseCr, refundCr };
  },
  acceptSettlement(result) {
    const st = this._cg, auth = this.settlementAuthorization(result.operationId, result.receiptId);
    if (!auth || auth.amount !== result.creditedCr || auth.refundCr !== result.refundCr || auth.recipient !== result.recipient) return false;
    st.settlement = { ...result }; st.depositRefunded = auth.refundCr === 150;
    st.actors[auth.recipient].paid = true;
    cinderglassJobClose(st, this.state.simTime, auth.recipient === 'broker' ? O.SOLD_BROKER
      : auth.baseCr === 450 ? O.RETURNED_TALA : O.RETURNED_DAMAGED, { paidCr: result.creditedCr });
    rememberFact(st, this.state.simTime, 'paid', auth.recipient === 'broker' ? T.brokerPaid : auth.baseCr === 450 ? T.paidTala : T.paidDamaged);
    return true;
  },
  settlementMatches(r) { const own = this._cg.settlement; return !!own && ['operationId','receiptId','recipient','creditedCr','baseCr','refundCr','key'].every(k => own[k] === r[k]); },
  _publishFacts() {
    for (const f of this._cg.rememberedFacts) if (!this._factsEmitted.has(f.id + f.text)) { this._factsEmitted.add(f.id + f.text); this.bus.emit('cinderglassJob:fact', f); }
  },
  _publish(force = true) {
    const st = this._cg, idle = [P.OFFER, P.CLOSED].includes(st.phase);
    const key = `${this.token()}:${st.phase}:${st.promptRevision}:${st.rememberedFacts.length}:${this.state.world?.currentSectorId}:${cinderglassJobOfferEligible(this.state)}:${this.state.ui?.dockedStationId}`;
    if (!force && idle && key === this._lastViewKey) return;
    if (!force && !idle && this.state.simTime < this._nextActiveViewAt) return;
    this._lastViewKey = key; this._nextActiveViewAt = this.state.simTime + 0.125;
    this.state.cinderglassJobToken = this.token(); this.state.cinderglassJobPresentationReady = this._presentationReady;
    this.state.cinderglassJobOffer = this._cg.offer?.spec || null;
    const view = publishCinderglassJobReadModel(this.state);
    this.bus?.emit('cinderglassJob:view', view);
  },
  _closePrompts() { this._cg.approachPrompt = null; this.bus?.emit('cinderglassJob:servicePrompt', null); this.bus?.emit('cinderglassJob:close', {}); },
  restoreFeatureState(data) {
    this._cg = restoreCinderglassJob(this.state, data); this._bindings.clear();
    this._needsRebind = true; this._invalidateLife(); this._closePrompts();
    this._factsEmitted = new Set(this._cg.rememberedFacts.map(f => f.id + f.text));
  },
  _retirePhysical() {
    if (!this.state || !this._cg || !this._bindings) return;
    this._destroying = true;
    cinderglassJobDismissConvoy(this, this.state);
    const svc = attachments(this), exact = [...this._bindings.entries()].map(([k]) => currentRole(this, this.state, k, true)).filter(Boolean);
    for (const e of exact) for (const a of svc?.listForEntity(e.id) || []) if (a.state === 'active'
      && (a.ownerId === e.id && a.ownerGeneration === e.occupantGeneration || a.targetId === e.id && a.targetGeneration === e.occupantGeneration)) svc.cut(a.id, null, 'cinderglass_teardown');
    for (const e of exact) if (this.state.entities?.get(e.id) === e) this.helpers.removeEntity?.(e.id);
    this._bindings.clear(); this._destroying = false;
  },
  destroy() {
    if (!this.state) return;
    this._retirePhysical();
    for (const off of this._subs || []) if (typeof off === 'function') off();
    this._subs = []; this._serviceActionId = null; this._closePrompts(); uninstallCinderglassJobSave(this);
    this.state.cinderglassJobOffer = null; this.state.cinderglassJobView = null;
  },
};
export function createCinderglassJobSystem() { return Object.create(cinderglassJobSystem); }
export function ensureCinderglassJobState(state) {
  state.world ||= {};
  if (state.world.cinderglassJob?.version !== 1) state.world.cinderglassJob = createCinderglassJobState();
  return state.world.cinderglassJob;
}
export function resetCinderglassJobState(state) { state.world ||= {}; return state.world.cinderglassJob = createCinderglassJobState(); }
export function createCinderglassJobSystemFactory() { return createCinderglassJobSystem; }
