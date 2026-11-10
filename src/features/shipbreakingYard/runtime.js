import { createYardPhysics } from './physics.js';
import { createYardLayout, YARD_LAYOUT_IDS, SHIPBREAKING_YARD_SITE as SITE } from './layouts.js';
import { createYardJob, freshYardState, normalizeYardState, snapshotYardState, yardPartValue,
  isYardAdventure, TERMINAL_PARTS, TERMINAL_JOBS } from './model.js';
import { hullEnvelopeWu } from '../../data/collisionProxyManifests.js';
import { WORLD_SITE_MANIFESTS } from '../../data/worldSiteManifests.js';
import { asteroidColliderRadius } from '../../data/asteroidColliders.js';
import { forEachFieldRock } from '../../world/livingWorldViews.js';

const distance = (a, b) => a && b ? Math.hypot(a.x - b.x, a.z - b.z) : Infinity;
const now = state => Number.isFinite(state.simTime) ? state.simTime : 0;
const position = entity => entity?.pos ? { x: entity.pos.x, z: entity.pos.z } : null;
const WHY = Object.freeze({
  stale_offer: 'That work ticket changed. Inspect it again before committing.',
  wrong_mode: 'The shipbreaking yard is available in Adventure flight.',
  not_here: 'Return to the Ceres shipbreaking yard to authorize this work.',
  not_claimed: 'Inspect and claim this wreck before working its fittings.',
  native_coupling_not_ready: 'The clamp is still settling onto its physical anchors. Try again shortly.',
  native_vent_not_ready: 'The service port is still settling. Try again shortly.',
  component_still_attached: 'This part is still connected. Open its remaining clamps before delivery.',
  original_requires_your_massline: 'Keep your MassLine on the original component for the handover.',
  another_line_has_custody: 'Another line still holds this part. Release it before handover.',
  bring_original_inside_receiver: 'Tow the whole component inside the receiving ring.',
  slow_and_steady_for_weighing: 'Brake below 7 WU/s and stop the spin so the scale can accept it.',
  pilot_outside_receiver: 'Bring your ship close to the scale with the load.',
  original_body_not_ready: 'The original body is unavailable or still entering native physics.',
  already_settled_or_lost: 'That original has already been delivered or lost.',
  match_wreck_velocity: 'Match the wreck’s drift before using the service coupling.',
  move_closer_to_coupling: 'Move within service reach of the selected coupling.',
  short_credits: 'You cannot cover the posted claim price. Inspection costs nothing.',
  receiver_unavailable: 'The yard settlement owner is unavailable. Your original remains yours.',
  unsafe_pressure: 'Vent the converter through its service port before releasing a hot connection.',
  component_changed: 'The selected original changed. Inspect the current part again.',
});

/** Adventure coordinator. Owns only the yard ledger/read model. All bodies, constraints,
 * damage, money and market stock still pass through their existing canonical owners. */
export const shipbreakingYard = {
  name: 'shipbreakingYard',

  init(ctx) {
    if (Object.prototype.hasOwnProperty.call(this, 'physics')) this.destroy();
    this.ctx = ctx; this.state = ctx.state; this.bus = ctx.bus; this.helpers = ctx.helpers || {};
    this.registry = ctx.registry; this._subs = []; this._busy = false; this._restoring = false;
    this._retirePending = false;
    this._needsHydrate = true; this._nextRead = 0; this._nextOffer = 0; this._nextPartRead = 0; this._inside = false;
    this._selectedModuleId = null; this._selectedJobId = null; this._beacon = null;
    this._layouts = new Map();
    this._row = normalizeYardState(ctx.state.shipbreakingYard, ctx.state.meta?.seed || 1);
    this.state.shipbreakingYard = this._row;
    this.physics = createYardPhysics(ctx);
    const on = (event, fn) => this._subs.push(this.bus.on(event, fn));
    on('shipbreakingYard:action', payload => this.command(payload || {}));
    on('scan:completed', payload => {
      if (!this._local()) return;
      // The production pulse reports targetId:null; selected/tethered identity is explicit
      // player intent. A nearby original is the fallback when the pulse has no target.
      let entity = this.state.entities.get(payload?.targetId ?? this.state.player?.targetId ?? this.state.player?.tether?.targetId);
      if (!entity && this._row.discovered) {
        let nearest = SITE.workRange;
        for (const job of Object.values(this._row.jobs)) for (const m of this._layout(job).modules) {
          const candidate = this.physics.body(job, m.id), d = distance(candidate?.pos, this._player()?.pos);
          if (d < nearest) { entity = candidate; nearest = d; }
        }
      }
      if (entity?.data?.persistenceOwner === 'shipbreakingYard') {
        const job = this.getJob(entity.data.shipbreakingJobId);
        if (job) this.inspectPart(entity.data.shipbreakingModuleId, job.id);
        else this.offerCatalog();
      } else if (entity?.data?.stationId === SITE.stationId) {
        const known = this._row.discovered || this.discover({ source: 'station-scan' }).ok;
        if (known && !this.offerCatalog()) this.offerDirections();
      } else if (this._row.discovered && distance(this._player()?.pos, this.receiver()) < 180) this.offerCatalog();
    });
    on('sector:exit', () => this._leaveSector());
    on('sector:enter', () => { this._needsHydrate = true; this._nextRead = 0; this._inside = false; });
    on('save:restoring', () => {
      this._restoring = true; this.physics.resetBindings(); this._beacon = null; this.close();
      this._publish();
    });
    on('save:loaded', () => this.afterContinue());
    on('game:new', () => this.newGame());
    on('dock:docked', () => this.close());
    this._publish();
  },

  _player() { const p = this.state.entities?.get(this.state.playerId); return p?.alive ? p : null; },
  _layout(job) {
    if (!job) return null;
    const key = `${job.layoutId}:${job.variant}`;
    if (!this._layouts.has(key)) this._layouts.set(key, createYardLayout(job.layoutId, job.variant));
    return this._layouts.get(key);
  },
  getJob(id = this._row.activeJobId) { return this._row.jobs[id] || this._row.jobs[this._row.slots[id]] || null; },
  receiver() {
    const a = this._row.anchor;
    if (!a) return null;
    const pos = { x: a.x + SITE.receiverOffset.x, z: a.z + SITE.receiverOffset.z };
    return { ...pos, pos, radius: SITE.receiverRadius, maxSpeed: SITE.receiverSpeed, stationId: SITE.stationId };
  },
  _local() {
    return !this._restoring && isYardAdventure(this.state) && this.state.mode === 'flight'
      && this.state.world?.currentSectorId === SITE.sectorId && !!this._player() && !this.state.ui?.docked;
  },
  _near(job = null) {
    if (!this._local()) return false;
    const p = this._player();
    if (distance(p.pos, this._row.anchor) <= 800 || distance(p.pos, this.receiver()) <= 200) return true;
    return !!job && this._layout(job).modules.some(m => distance(p.pos, this.physics.body(job, m.id)?.pos) <= SITE.workRange);
  },
  _gate(revision, job = null, claimed = false) {
    if (this._busy || revision !== this._row.revision) return 'stale_offer';
    if (!this._local()) return 'wrong_mode';
    if (!this._near(job)) return 'not_here';
    if (claimed && (!job || !['working', 'parked'].includes(job.status))) return 'not_claimed';
    return null;
  },
  _result(ok, reason, extra = {}) { return { ok, ...(reason ? { reason } : {}), ...extra }; },
  _touch() {
    this._row.revision++;
    this.bus.emit('save:dirty', { kind: 'world', payload: { source: 'shipbreakingYard' } });
  },
  _say(text, kind = 'info') { this.bus.emit('shipbreakingYard:receipt', { text, kind }); },
  _cue(kind, entity, extra = {}) {
    this.bus.emit('shipbreakingYard:cue', { kind, id: extra.id || kind, pos: position(entity) || this._row.anchor,
      at: now(this.state), ...extra });
  },
  close() { this.bus?.emit('shipbreakingYard:close', {}); },

  _ensureAnchor() {
    if (this._row.anchor) return true;
    const station = this.state.entityList.find(e => e.alive && e.type === 'station' && e.data?.stationId === SITE.stationId);
    if (!station) return false;
    const outer = Math.max(station.radius || 40, hullEnvelopeWu(station) || 0);
    // A large authored site may expose small component colliders but reserve a much
    // wider working area. Respect Second Measure and the other Ceres site envelopes,
    // including before their individual proxies have finished materializing.
    const reservations = WORLD_SITE_MANIFESTS.filter(site => site.sectorId === SITE.sectorId
      && site.placement?.coordinateSpace === 'global_v1' && site.placement.pos).map(site => ({
      pos: site.placement.pos,
      radius: Math.max(site.debug?.reservationEnvelope || 0, site.visualRoot?.visualRadius || 0),
    }));
    const obstacles = this.state.entityList.filter(e => e.alive && e.collides !== false
      && ['station', 'wreck'].includes(e.type)).map(e => ({
      pos: e.pos, radius: hullEnvelopeWu(e) || e.radius || 0,
    }));
    // Rocks remain physical scenery while demoted to compact records. Looking only at
    // entityList would place an apparently clear yard inside a rock that promotes when
    // the pilot arrives. This canonical read view covers sleeping and admitted rocks.
    forEachFieldRock(this.state, rock => {
      if (rock.collides === false) return;
      obstacles.push({ pos: rock.pos, radius: Math.max(hullEnvelopeWu(rock),
        asteroidColliderRadius(rock.data?.typeId, rock.radius)) });
    });
    // A few deterministic empty aprons, outside the station's authored hull envelope.
    for (const angle of [0.55, -0.55, 1.1, -1.1, 2.4]) {
      const anchor = { x: station.pos.x + Math.cos(angle) * (outer + 620),
        z: station.pos.z + Math.sin(angle) * (outer + 620) };
      const blocked = [...SITE.berthOffsets, SITE.receiverOffset].some(o => {
        const point = { x: anchor.x + o.x, z: anchor.z + o.z };
        return reservations.some(site => distance(point, site.pos) < site.radius + 100)
          || obstacles.some(obstacle => distance(point, obstacle.pos) < obstacle.radius + 100);
      });
      if (!blocked) { this._row.anchor = anchor; return true; }
    }
    return false;
  },

  discover(options = {}) {
    if (!this._local()) return this._result(false, 'wrong_mode');
    if (!this._row.anchor && options.anchor && Number.isFinite(options.anchor.x) && Number.isFinite(options.anchor.z)) {
      this._row.anchor = { x: options.anchor.x, z: options.anchor.z };
    }
    if (!this._ensureAnchor()) return this._result(false, 'not_here');
    const first = !this._row.discovered;
    this._row.discovered = true;
    for (const layoutId of YARD_LAYOUT_IDS) if (!this.getJob(layoutId)) {
      const job = createYardJob(this._row, layoutId); this._row.jobs[job.id] = job; this._row.slots[layoutId] = job.id;
    }
    this._materialize();
    if (first) {
      this._touch(); this._cue('discovered');
      this._say('Ceres shipbreaking yard. Three claimed hulls; inspect freely. Intact machinery pays the yard, scrap feeds the Ceres market.');
    }
    this._publish();
    return this._result(true, null, { discovered: first });
  },

  _materialize() {
    if (!this._local() || !this._row.discovered) return;
    let pending = false;
    for (const job of Object.values(this._row.jobs)) {
      const result = this.physics.spawnJob(job);
      if (result?.pending > 0) pending = true;
    }
    if (!this._beacon || this.state.entities.get(this._beacon.id) !== this._beacon || !this._beacon.alive) {
      const found = this.state.entityList.find(e => e.alive && e.data?.identityKey === `${SITE.id}:scale`);
      this._beacon = found || this.helpers.spawnEntity?.({ type: 'beacon', pos: this.receiver().pos, radius: 4, mass: 0,
        hull: 1, hullMax: 1, collides: false, physicsBody: false, flags: { persistent: true, missionPinned: true },
        data: { name: 'Ceres receiving scale', scanLabel: 'SHIPBREAKING · receiving scale', scannable: true,
          assetRef: 'asset.slice.kessler_handoff_beacon', identityKey: `${SITE.id}:scale`, worldRecordId: `${SITE.id}:scale`,
          persistenceOwner: 'shipbreakingYard', homeSectorId: SITE.sectorId, sectorId: SITE.sectorId, transientSector: true,
          lifetimeS: Infinity } });
    }
    this._needsHydrate = pending;
  },

  offerDirections() {
    if (!this._local() || !this._row.discovered || !this._row.anchor) return false;
    this._selectedModuleId = null; this._selectedJobId = null;
    const range = Math.round(distance(this._player().pos, this.receiver()));
    this.bus.emit('shipbreakingYard:offer', { kind: 'catalog', revision: this._row.revision,
      title: 'CERES SHIPBREAKERS · OPEN FOR WORK',
      detail: `The receiving scale is ${range} WU away, off Ceres station’s working apron. Three retired hulls await inspection. You can look before paying.`,
      actions: [{ id: 'course', label: 'MARK THE YARD RECEIVING SCALE' }, { id: 'leave', label: 'KEEP FLYING', cancel: true }] });
    return true;
  },

  offerCatalog() {
    if (!this._near() || !this._row.discovered) return false;
    this._selectedModuleId = null; this._selectedJobId = null;
    this._observeAll();
    const jobs = YARD_LAYOUT_IDS.map(id => this.getJob(id)).filter(Boolean);
    this.bus.emit('shipbreakingYard:offer', { kind: 'catalog', revision: this._row.revision,
      title: 'CERES · SHIPBREAKING YARD', detail: 'Inspect a claimed wreck before paying. A damaged part earns less; every original you deliver is paid separately. You may leave unfinished work and return.',
      actions: jobs.map(job => ({ id: 'inspect', layoutId: job.layoutId,
        label: `${this._layout(job).title} · ${job.status === 'offered' ? `${this._layout(job).fee} cr claim` : job.status.toUpperCase()}`,
        title: `${this._layout(job).summary} Likely remaining value ${this._remainingValue(job)} cr.` })).concat([{ id: 'leave', label: 'LEAVE WITHOUT SPENDING', cancel: true }]) });
    return true;
  },

  _remainingValue(job) {
    return this._layout(job).modules.reduce((sum, m) => sum + (TERMINAL_PARTS.has(job.modules[m.id].status) ? 0 : yardPartValue(m, job.modules[m.id])), 0);
  },

  inspect(layoutId) {
    const job = this.getJob(layoutId);
    if (!job || !this._near(job)) return this._result(false, 'not_here');
    this._observeAll(); this._selectedJobId = job.id; this._selectedModuleId = null;
    const layout = this._layout(job);
    const remaining = this._remainingValue(job);
    const actions = [];
    if (job.status === 'offered' && remaining > 0) actions.push({ id: 'accept', layoutId, label: `CLAIM FOR ${layout.fee} CR`,
      disabled: this.state.player.credits < layout.fee || remaining <= 0,
      title: 'Pay once for these exact originals. Each part is paid on physical delivery; no whole-job success requirement.' });
    else if (TERMINAL_JOBS.has(job.status) || job.status === 'offered' && remaining === 0) actions.push({ id: 'next-lot', layoutId, label: 'BRING THE NEXT WRECK TO THIS BERTH' });
    else actions.push({ id: 'resume', label: job.status === 'parked' ? 'RESUME PAID WORK' : 'CONTINUE WORK' });
    for (const module of layout.modules) if (!TERMINAL_PARTS.has(job.modules[module.id].status)) {
      actions.push({ id: 'inspect-part', moduleId: module.id, label: `${module.label} · ${yardPartValue(module, job.modules[module.id])} cr` });
    }
    actions.push({ id: 'catalog', label: 'OTHER WRECKS' }, { id: 'leave', label: 'LEAVE THIS TICKET OPEN', cancel: true });
    this.bus.emit('shipbreakingYard:offer', { kind: 'inspect', revision: this._row.revision, jobId: job.id,
      title: `${layout.title} · ${layout.difficulty}`, detail: `${layout.summary} ${layout.conditionLabel}. Claim ${layout.fee} cr; likely remaining ${remaining} cr; already recovered ${job.recoveredCr} cr. ${layout.strategy}`,
      actions: actions.slice(0, 9) });
    this._publish(); return this._result(true, null, { jobId: job.id });
  },

  accept(layoutId, revision) {
    const job = this.getJob(layoutId), reason = this._gate(revision, job);
    if (reason) return this._result(false, reason);
    if (!job || job.status !== 'offered') return this._result(false, 'already_claimed');
    const layout = this._layout(job);
    if (this.state.player.credits < layout.fee) return this._result(false, 'short_credits');
    if (this._remainingValue(job) <= 0) return this._result(false, 'nothing_to_claim');
    const payment = { amount: layout.fee, reason: `shipbreaking:claim:${job.id}`, requireFull: true,
      expectedCredits: this.state.player.credits, result: false, commit: () => {
        if (job.status !== 'offered') return false;
        const active = this.getJob(); if (active && active !== job && active.status === 'working') active.status = 'parked';
        job.status = 'working'; job.paidCr = layout.fee; job.paidAt = now(this.state);
        this._row.activeJobId = job.id; this._row.stats.spentCr += layout.fee; this._row.revision++;
        return true;
      } };
    this._busy = true;
    try { this.bus.emit('economy:chargeCredits', payment); } finally { this._busy = false; }
    if (!payment.result) return this._result(false, 'receiver_unavailable');
    this.bus.emit('save:dirty', { kind: 'world', payload: { source: 'shipbreakingYard' } });
    this._say(`${layout.title} is yours to work. ${layout.firstAction}`, 'good');
    this.inspect(layoutId);
    return this._result(true, null, { jobId: job.id, paidCr: layout.fee });
  },

  inspectPart(moduleId, jobId = this._row.activeJobId, { refreshOnly = false } = {}) {
    const job = this.getJob(jobId), layout = this._layout(job), spec = layout?.modules.find(m => m.id === moduleId);
    if (!spec || !this._near(job)) return this._result(false, 'not_here');
    this._observeAll(); this._selectedJobId = job.id; this._selectedModuleId = moduleId;
    const record = job.modules[moduleId], entity = this.physics.body(job, moduleId);
    const attached = layout.couplings.filter(c => (c.a === moduleId || c.b === moduleId) && job.couplings[c.id].status === 'connected');
    const claimed = ['working', 'parked'].includes(job.status);
    const actions = [], warnings = [];
    if (spec.hazardous && !job.hazard.vented && !job.hazard.burst) actions.push({ id: 'vent', moduleId,
      label: 'VENT THROUGH THE SERVICE PORT', disabled: !claimed, title: 'Relieves pressure into a controlled physical recoil; preserves this converter.' });
    for (const coupling of attached) {
      const blocked = this._couplingReason(job, coupling);
      if (blocked) warnings.push(blocked);
      actions.push({ id: 'disconnect', couplingId: coupling.id, label: `RELEASE ${coupling.label.toUpperCase()}`,
        disabled: !claimed || !!blocked, title: blocked || 'Service release uses the real clamp. Keep a MassLine on the part to control its drift.' });
    }
    let delivery = null;
    if (!attached.length && !TERMINAL_PARTS.has(record.status)) {
      delivery = this.physics.deliveryGate(job, moduleId, this.receiver());
      actions.push({ id: 'deliver', moduleId, label: `HAND OVER · ${yardPartValue(spec, record)} CR`,
        disabled: !claimed || !delivery.ok, title: delivery.ok ? 'This original is inside the scale, slow and on your line.' : WHY[delivery.reason] || delivery.reason });
    }
    if (entity) actions.push({ id: 'locate', moduleId, label: 'MARK THIS ORIGINAL', title: 'Set a course to this exact physical component.' });
    if (claimed) actions.push({ id: 'course', label: 'MARK THE RECEIVING SCALE' });
    actions.push({ id: 'work', label: 'WORK TICKET' }, { id: 'leave', label: 'BACK TO FLYING', cancel: true });
    const condition = Math.round(record.condition * 100);
    const status = TERMINAL_PARTS.has(record.status) ? record.status.toUpperCase()
      : attached.length ? `${attached.length} live connection${attached.length === 1 ? '' : 's'}` : 'FREE · READY TO TOW';
    const text = `${spec.label}: ${condition}% intact, ${yardPartValue(spec, record)} cr, ${spec.mass} mass. ${status}. `
      + (warnings.length ? warnings.join(' ') + ' ' : '')
      + (delivery && !delivery.ok ? WHY[delivery.reason] || delivery.reason : '')
      + (!claimed ? ' Inspect and claim this lot before working it.' : '')
      + (spec.fragile ? ' Fragile machinery: collisions and gunfire reduce its intact price.' : '');
    this.bus.emit('shipbreakingYard:offer', { kind: 'work', revision: this._row.revision, jobId: job.id,
      moduleId, targetId: entity?.id, title: spec.label, detail: text, actions, refreshOnly });
    this._publish(); return this._result(true, null, { status, condition, valueCr: yardPartValue(spec, record), targetId: entity?.id });
  },

  _couplingReason(job, coupling) {
    if (coupling.hazardModuleId && !job.hazard.vented && !job.hazard.burst) return WHY.unsafe_pressure;
    const layout = this._layout(job);
    for (const id of coupling.requiresReleased || []) if (job.couplings[id]?.status === 'connected') {
      return `Release ${layout.couplings.find(c => c.id === id)?.label || id} first.`;
    }
    const a = this.physics.body(job, coupling.a), b = this.physics.body(job, coupling.b);
    for (const id of coupling.requiresClear || []) {
      const blocker = this.physics.body(job, id);
      if (!blocker) continue;
      const endpoints = [a, b].filter(e => e && e !== blocker);
      if (endpoints.some(e => distance(e.pos, blocker.pos) < e.radius + blocker.radius + 24)) {
        return `Tow ${layout.modules.find(m => m.id === id)?.label || id} clear of the extraction lane.`;
      }
    }
    return null;
  },

  disconnect(couplingId, revision, jobId = this._row.activeJobId) {
    const job = this.getJob(jobId), reason = this._gate(revision, job, true);
    if (reason) return this._result(false, reason);
    const coupling = this._layout(job).couplings.find(c => c.id === couplingId);
    if (!coupling || job.couplings[couplingId].status !== 'connected') return this._result(false, 'component_changed');
    const blocked = this._couplingReason(job, coupling);
    if (blocked) return this._result(false, blocked);
    this._busy = true;
    let result;
    try {
      result = this.physics.disconnect(job, couplingId);
      if (!result.ok) return result;
      job.couplings[couplingId].status = 'released';
      this._refreshFreedom(job); this._touch();
      const target = this.physics.body(job, coupling.b);
      this._cue('released', target, { id: `${job.id}:${couplingId}` });
      this._say(`${coupling.label} released. ${this._layout(job).modules.find(m => m.id === coupling.b)?.label} keeps its real drift; take it gently on the MassLine.`, 'good');
    } finally { this._busy = false; }
    this._publish(); return result;
  },

  vent(moduleId, revision, jobId = this._row.activeJobId) {
    const job = this.getJob(jobId), reason = this._gate(revision, job, true);
    if (reason) return this._result(false, reason);
    const spec = this._layout(job).modules.find(m => m.id === moduleId);
    if (!spec?.hazardous || job.hazard.vented || job.hazard.burst) return this._result(false, 'component_changed');
    const entity = this.physics.body(job, moduleId), pilot = this._player();
    if (distance(entity?.pos, pilot.pos) > SITE.workRange) return this._result(false, 'move_closer_to_coupling');
    if (!entity || Math.hypot(entity.vel.x - pilot.vel.x, entity.vel.z - pilot.vel.z) > 18) return this._result(false, 'match_wreck_velocity');
    this._busy = true;
    try {
      const result = this.physics.vent?.(job, moduleId, pilot.id) || { ok: false, reason: 'native_vent_not_ready' };
      if (!result.ok) return result;
      job.hazard.vented = true; this._touch(); this._cue('released', entity, { id: `${job.id}:vent` });
      this._say('Service pressure discharged. The same converter is safe to separate; its intact value is preserved.', 'good');
    } finally { this._busy = false; }
    this._publish(); return this._result(true);
  },

  deliver(moduleId, revision, jobId = this._row.activeJobId) {
    const job = this.getJob(jobId), reason = this._gate(revision, job, true);
    if (reason) return this._result(false, reason);
    const module = this._layout(job).modules.find(m => m.id === moduleId);
    if (!module) return this._result(false, 'component_changed');
    const gate = this.physics.deliveryGate(job, moduleId, this.receiver());
    if (!gate.ok) return gate;
    const economy = this.registry?.get('economy');
    if (typeof economy?.grantCredits !== 'function' || typeof economy?.applyStockPressure !== 'function') return this._result(false, 'receiver_unavailable');
    const record = job.modules[moduleId];
    record.condition = Math.min(record.condition, gate.condition); record.hull = gate.entity.hull;
    const credits = yardPartValue(module, record);
    if (!Number.isSafeInteger(this.state.player.credits) || this.state.player.credits > Number.MAX_SAFE_INTEGER - credits) return this._result(false, 'credit_limit');
    const receipt = { id: `${job.id}:${moduleId}:delivery`, jobId: job.id, moduleId,
      credits, condition: record.condition, at: now(this.state), stationId: SITE.stationId };
    this._busy = true;
    try {
      // Reserve the terminal source before native cuts, credit notifications or entity retirement
      // can reenter. A synchronous save sees both the source receipt and the single owner's cash.
      record.status = 'delivered'; record.receipt = receipt; job.recoveredCr += credits;
      this._row.stats.earnedCr += credits; this._row.stats.deliveredParts++; this._row.revision++;
      economy.applyStockPressure(SITE.stationId, module.commodityId, 'sell', module.units || 1);
      // Stock pressure is an owner-local write with no bus callbacks. Commit it before
      // grantCredits notifies observers, so a save inside credits:changed sees all three:
      // the terminal receipt, Ceres's material stock, and the player's earned credits.
      economy.grantCredits(credits, `shipbreaking:delivery:${receipt.id}`);
      const retired = this.physics.retire(job, moduleId);
      // A retirement refusal cannot re-open a paid original; retry removal on the next tick.
      if (!retired.ok) this._retirePending = true;
      this._finishIfDone(job); this._cue('delivered', gate.entity, { id: receipt.id });
      this.bus.emit('shipbreakingYard:delivered', { ...receipt, identityKey: gate.identityKey,
        commodityId: module.commodityId, units: module.units || 1 });
      this._say(`${module.label} accepted: ${credits} cr at ${Math.round(record.condition * 100)}% intact. Ceres receives the recovered material.`, 'good');
    } finally { this._busy = false; }
    this.bus.emit('save:dirty', { kind: 'world', payload: { source: 'shipbreakingYard' } });
    this._publish(); return this._result(true, null, { receipt });
  },

  park(jobId, revision) {
    const job = this.getJob(jobId), reason = this._gate(revision, job, true);
    if (reason) return this._result(false, reason);
    this._capture(job); job.status = 'parked';
    if (this._row.activeJobId === job.id) this._row.activeJobId = null;
    this._touch(); this.close(); this._say('Work parked. Paid ownership, remaining fittings and delivered receipts stay on this ticket.');
    this._publish(); return this._result(true);
  },

  resume(jobId, revision) {
    const job = this.getJob(jobId), reason = this._gate(revision, job, true);
    if (reason) return this._result(false, reason);
    const active = this.getJob(); if (active && active !== job && active.status === 'working') active.status = 'parked';
    job.status = 'working'; this._row.activeJobId = job.id; this._touch();
    this.inspect(job.layoutId); return this._result(true, null, { jobId: job.id, paidCr: 0 });
  },

  forfeit(jobId, revision) {
    const job = this.getJob(jobId), reason = this._gate(revision, job, true);
    if (reason) return this._result(false, reason);
    this._busy = true;
    try {
      this._capture(job); job.status = 'abandoned'; job.closedAt = now(this.state);
      for (const record of Object.values(job.modules)) if (!TERMINAL_PARTS.has(record.status)) {
        record.status = 'lost'; record.lossReason = 'abandoned'; this._row.stats.lostParts++;
      }
      for (const record of Object.values(job.couplings)) if (record.status === 'connected') record.status = 'broken';
      if (this._row.activeJobId === job.id) this._row.activeJobId = null;
      this.physics.shelve(job); this._touch();
    } finally { this._busy = false; }
    this._say(`Ticket closed. You keep the ${job.recoveredCr} cr already earned; unreturned originals are relinquished.`);
    this._publish(); return this._result(true);
  },

  nextLot(layoutId, revision) {
    const old = this.getJob(layoutId), reason = this._gate(revision, old);
    if (reason) return this._result(false, reason);
    if (!old || !TERMINAL_JOBS.has(old.status) && !(old.status === 'offered' && this._remainingValue(old) === 0)) return this._result(false, 'finish_or_abandon_current_lot');
    this._busy = true;
    try {
      this.physics.shelve(old);
      this._row.history.push({ id: old.id, layoutId, paidCr: old.paidCr, recoveredCr: old.recoveredCr, outcome: old.status === 'complete' ? 'complete' : 'abandoned' });
      this._row.history = this._row.history.slice(-12);
      delete this._row.jobs[old.id]; this._row.cycles[layoutId]++;
      const job = createYardJob(this._row, layoutId); this._row.jobs[job.id] = job; this._row.slots[layoutId] = job.id;
      this.physics.spawnJob(job); this._touch();
    } finally { this._busy = false; }
    this.inspect(layoutId); return this._result(true, null, { jobId: this.getJob(layoutId).id });
  },

  command(payload) {
    const { actionId, revision, layoutId, moduleId, couplingId } = payload;
    const job = this.getJob(payload.jobId || layoutId || this._row.activeJobId);
    let result;
    if (actionId === 'leave' || actionId === 'cancel') { this.close(); this._nextOffer = now(this.state) + 30; return this._result(true); }
    if (actionId === 'catalog') return this._result(this.offerCatalog());
    if (actionId === 'inspect') return this.inspect(layoutId);
    if (actionId === 'inspect-part') return this.inspectPart(moduleId, job?.id);
    if (actionId === 'work') return this.workTicket(job?.id);
    if (actionId === 'accept') result = this.accept(layoutId || job?.layoutId, revision);
    else if (actionId === 'disconnect') result = this.disconnect(couplingId, revision, job?.id);
    else if (actionId === 'vent') result = this.vent(moduleId, revision, job?.id);
    else if (actionId === 'deliver') result = this.deliver(moduleId, revision, job?.id);
    else if (actionId === 'park') result = this.park(job?.id, revision);
    else if (actionId === 'resume') result = this.resume(job?.id, revision);
    else if (actionId === 'forfeit') result = this.forfeit(job?.id, revision);
    else if (actionId === 'next-lot') result = this.nextLot(layoutId || job?.layoutId, revision);
    else if (actionId === 'locate') {
      const original = job && this.physics.body(job, moduleId);
      if (!this._local() || !original) return this._result(false, 'component_changed');
      this.bus.emit('ui:setCourse', { pos: position(original), targetEntityId: original.id, sectorId: SITE.sectorId,
        autopilot: false, label: this._layout(job).modules.find(m => m.id === moduleId)?.label || 'Claimed wreck component' });
      this.close(); return this._result(true);
    }
    else if (actionId === 'course') {
      if (!this._local() || !this._row.discovered || !this.receiver()) return this._result(false, 'not_here');
      this.bus.emit('ui:setCourse', { pos: this.receiver().pos, sectorId: SITE.sectorId,
        autopilot: false, label: 'Shipbreaking receiving scale' });
      this.close(); return this._result(true);
    } else if (actionId === 'abandon') {
      const reason = this._gate(revision, job, true);
      if (reason) return this._result(false, reason);
      this._selectedModuleId = null;
      this.bus.emit('shipbreakingYard:offer', { kind: 'confirm-abandon', revision: this._row.revision, jobId: job.id,
        title: 'Close this wreck claim?', detail: `You keep ${job.recoveredCr} cr already paid. Remaining originals are relinquished; the ${job.paidCr} cr claim is not refunded. Parking keeps the claim instead.`,
        actions: [{ id: 'forfeit', label: 'RELINQUISH REMAINING ORIGINALS' }, { id: 'park', label: 'PARK AND KEEP MY CLAIM' },
          { id: 'leave', label: 'CANCEL', cancel: true }] });
      return this._result(true);
    } else result = this._result(false, 'unknown_action');
    if (!result.ok) {
      this._say(WHY[result.reason] || result.reason, 'warn');
      // A rejected stale/native gate should leave a usable current ticket in the deck.
      if (job && this._near(job)) this.workTicket(job.id);
    }
    if (result.ok && ['disconnect', 'vent', 'deliver'].includes(actionId)) {
      if (moduleId) this.inspectPart(moduleId, job.id); else this.workTicket(job.id);
    }
    return result;
  },

  workTicket(jobId = this._row.activeJobId) {
    const job = this.getJob(jobId); if (!job || !this._near(job)) return this._result(false, 'not_here');
    this._selectedModuleId = null; this._selectedJobId = job.id;
    const layout = this._layout(job), claimed = ['working', 'parked'].includes(job.status);
    if (!claimed) return this.inspect(job.layoutId);
    const actions = layout.modules.filter(m => !TERMINAL_PARTS.has(job.modules[m.id].status))
      .map(m => ({ id: 'inspect-part', moduleId: m.id,
        label: `${m.label} · ${job.modules[m.id].status === 'free' ? 'FREE' : `${Math.round(job.modules[m.id].condition * 100)}%`}` }));
    actions.push({ id: 'park', label: 'PARK THIS WORK' }, { id: 'abandon', label: 'CLOSE CLAIM…' }, { id: 'leave', label: 'BACK TO FLYING', cancel: true });
    this.bus.emit('shipbreakingYard:offer', { kind: 'work', revision: this._row.revision, jobId: job.id,
      title: `${layout.title} · WORK TICKET`, detail: `${layout.firstAction} Recovered ${job.recoveredCr} cr; ${this._remainingValue(job)} cr still intact. Scan any original to inspect its remaining connections.`, actions });
    return this._result(true);
  },

  _refreshFreedom(job) {
    const layout = this._layout(job);
    for (const module of layout.modules) {
      const record = job.modules[module.id]; if (TERMINAL_PARTS.has(record.status)) continue;
      record.status = layout.couplings.some(c => (c.a === module.id || c.b === module.id) && job.couplings[c.id].status === 'connected') ? 'attached' : 'free';
    }
  },
  _finishIfDone(job) {
    if (['working', 'parked'].includes(job.status) && Object.values(job.modules).every(m => TERMINAL_PARTS.has(m.status))) {
      job.status = 'complete'; job.closedAt = now(this.state); this._row.stats.completedJobs++;
      if (this._row.activeJobId === job.id) this._row.activeJobId = null;
    }
  },
  _observeAll() {
    if (this._restoring || !this._row.discovered || this._busy) return;
    let changed = false;
    for (const job of Object.values(this._row.jobs)) {
      if (TERMINAL_JOBS.has(job.status)) continue;
      for (const event of this.physics.syncJob(job)) {
        if (event.type === 'strain') { this._cue('strain', this.physics.body(job, this._layout(job).couplings.find(c => c.id === event.couplingId)?.b), { id: `${job.id}:${event.couplingId}` }); continue; }
        if (event.type === 'damaged') {
          const record = job.modules[event.moduleId]; if (TERMINAL_PARTS.has(record.status)) continue;
          record.hull = event.hull; record.condition = Math.min(record.condition, event.condition); changed = true;
          if (record.hull <= 0) { record.status = 'lost'; record.lossReason = 'destroyed'; this._row.stats.lostParts++; }
          if (event.damage > 4 && ['working', 'parked'].includes(job.status)) {
            this._say(`${this._layout(job).modules.find(m => m.id === event.moduleId)?.label} damaged. Its intact price fell; the rest of the claim remains payable.`, 'warn');
          }
        } else if (event.type === 'lost') {
          const record = job.modules[event.moduleId]; if (TERMINAL_PARTS.has(record.status)) continue;
          record.status = 'lost'; record.lossReason = event.reason; record.condition = 0; record.hull = 0;
          this._row.stats.lostParts++; changed = true;
        } else if (event.type === 'released') {
          job.couplings[event.couplingId].status = event.broken ? 'broken' : 'released'; changed = true;
          this._cue('released', null, { id: `${job.id}:${event.couplingId}` });
          const coupling = this._layout(job).couplings.find(c => c.id === event.couplingId);
          if (coupling?.hazardModuleId && !job.hazard.vented && !job.hazard.burst) {
            job.hazard.burst = true; // Reserve before damage can recursively remove an endpoint.
            this.physics.burst?.(job, this._layout(job).hazard);
            this._cue('hazard', this.physics.body(job, coupling.hazardModuleId), { id: `${job.id}:pressure` });
            this._say('The live return tore open. Pressure struck the surrounding machinery; surviving parts still pay.', 'warn');
          }
        }
      }
      this._refreshFreedom(job); this._finishIfDone(job);
    }
    if (changed) this._touch();
  },

  _capture(job) {
    const snapshot = this.physics.snapshotJob(job);
    for (const [id, sample] of Object.entries(snapshot.modules || {})) {
      const record = job.modules[id]; if (!record || TERMINAL_PARTS.has(record.status)) continue;
      record.pose = sample.pose; record.hull = sample.hull; record.condition = Math.min(record.condition, sample.condition);
    }
    for (const [id, sample] of Object.entries(snapshot.couplings || {})) if (job.couplings[id]) {
      job.couplings[id].restLength = sample.restLength;
      if (sample.terminal && job.couplings[id].status === 'connected') job.couplings[id].status = 'broken';
    }
    this._refreshFreedom(job);
  },
  _leaveSector() {
    if (this._restoring) return;
    this._observeAll();
    for (const job of Object.values(this._row.jobs)) {
      this._capture(job); if (job.status === 'working') job.status = 'parked'; this.physics.shelve(job);
    }
    this._row.activeJobId = null; this._removeBeacon(); this._needsHydrate = true; this._inside = false;
    this.close(); this._publish();
  },
  _removeBeacon() {
    if (this._beacon && this.state.entities.get(this._beacon.id) === this._beacon
      && this._beacon.data?.identityKey === `${SITE.id}:scale`) this.helpers.removeEntity?.(this._beacon.id);
    this._beacon = null;
  },

  readModel() {
    const visible = this._local() && this._row.discovered && !this._needsHydrate;
    const jobs = visible ? Object.values(this._row.jobs).filter(j => !TERMINAL_JOBS.has(j.status)).map(job => {
      const layout = this._layout(job);
      const modules = layout.modules.map(m => {
        const entity = this.physics.body(job, m.id), record = job.modules[m.id];
        return { id: m.id, jobId: job.id, entityId: entity?.id, label: m.label, condition: record.condition,
          status: record.status, valueCr: yardPartValue(m, record), pos: position(entity), radius: m.radius,
          fragile: !!m.fragile, hazardous: !!m.hazardous && !job.hazard.vented && !job.hazard.burst };
      });
      return { id: job.id, title: layout.title, status: job.status, modules,
        couplings: layout.couplings.map(c => ({ id: c.id, a: c.a, b: c.b, status: job.couplings[c.id].status,
          posA: position(this.physics.body(job, c.a)), posB: position(this.physics.body(job, c.b)),
          strained: (this.physics.lineStatus(job, c.id)?.tension || 0) >= 1800,
          safe: !this._couplingReason(job, c), reason: this._couplingReason(job, c) })) };
    }) : [];
    return { visible, revision: this._row.revision, anchor: this._row.anchor, receiver: this.receiver(), jobs,
      selectedModuleId: this._selectedModuleId, selectedJobId: this._selectedJobId };
  },
  _publish() {
    if (!this.state) return;
    const view = this.readModel();
    this.state.shipbreakingYardView = view;
    // The browser adapter consumes this detached projection through the existing event
    // journal in worker mode. bridge.js supplies its bounded wire shape; no entity or
    // simulation-owner facade is exposed to presentation code.
    this.bus?.emit('shipbreakingYard:view', view);
  },

  update(_dt, state) {
    if (!this._local()) return;
    if (!this._ensureAnchor()) return;
    const near = distance(this._player().pos, this._row.anchor) <= SITE.discoveryRange;
    if (!this._row.discovered && near) this.discover();
    if (!this._row.discovered) return;
    if (this._needsHydrate) this._materialize();
    this._observeAll();
    if (this._retirePending) {
      this._retirePending = false;
      for (const job of Object.values(this._row.jobs)) for (const [id, record] of Object.entries(job.modules)) {
        if (TERMINAL_PARTS.has(record.status)) {
          const retired = this.physics.retire(job, id);
          if (!retired.ok && retired.reason !== 'original_missing') this._retirePending = true;
        }
      }
    }
    if (near && !this._inside && now(state) >= this._nextOffer) { this.offerCatalog(); this._nextOffer = now(state) + 30; }
    if (!near && this._inside) this.close();
    this._inside = near;
    if (now(state) >= this._nextRead) { this._publish(); this._nextRead = now(state) + .1; }
    if (this._selectedModuleId && this._selectedJobId && now(state) >= this._nextPartRead) {
      this._nextPartRead = now(state) + .3;
      this.inspectPart(this._selectedModuleId, this._selectedJobId, { refreshOnly: true });
    }
  },

  serialize() {
    this._observeAll(); for (const job of Object.values(this._row.jobs)) this._capture(job);
    return snapshotYardState(this._row);
  },
  deserialize(raw) {
    this._row = normalizeYardState(raw, this.state.meta?.seed || 1); this.state.shipbreakingYard = this._row;
    this.physics.resetBindings(); this._beacon = null; this._restoring = true; this._needsHydrate = true;
    this._retirePending = false;
    this._selectedModuleId = null; this._selectedJobId = null; this.close();
  },
  afterContinue() {
    this._restoring = false; this._needsHydrate = true; this._nextRead = 0; this._nextOffer = 0; this._inside = false;
    this._publish();
  },
  newGame() {
    if (!this.physics) return;
    for (const job of Object.values(this._row.jobs)) this.physics.shelve(job);
    this._removeBeacon(); this.physics.resetBindings(); this._row = freshYardState(this.state.meta?.seed || 1);
    this.state.shipbreakingYard = this._row; this._restoring = false; this._busy = false;
    this._retirePending = false;
    this._needsHydrate = true; this._nextRead = 0; this._nextOffer = 0; this._inside = false;
    this._selectedModuleId = null; this._selectedJobId = null; this.close(); this._publish();
  },
  destroy() {
    if (!this.physics) return;
    for (const job of Object.values(this._row?.jobs || {})) this.physics.shelve(job);
    this._removeBeacon(); this._restoring = true; this.close(); this._publish(); this.physics.dispose();
    for (const off of this._subs || []) if (typeof off === 'function') off();
    this._subs = [];
  },
};
