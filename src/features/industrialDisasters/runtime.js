import { SITE, SCENARIO_IDS, getScenario } from './scenarios.js';
import {
  createCrisisRecord, stepIndustrialCrisis, projectIndustrialCrisis,
  finalizeIndustrialCrisis, normalizeCrisisRecord, summarizeIndustrialCrisis, CRISIS_SCHEMA_VERSION,
} from './causality.js';
import { createIndustrialPhysicalSite, normalizeIndustrialPhysicalSnapshot, INDUSTRIAL_PHYSICAL_VERSION } from './physicalSite.js';
import { SAVE_JOURNAL_EVENT } from '../../save/saveDirtyJournal.js';
import { setPresentationAdmission } from '../../core/presentationAdmission.js';
import { encodeIndustrialDisasterStatus, publishIndustrialDisasterPoses } from './workerAdapter.js';
import { laneSetNavWaypoint } from '../../core/simLaneCommands.js';

export const INDUSTRIAL_DISASTERS_SCHEMA_VERSION = 1;
const RETIRE_RADIUS = SITE.discoverRadius + 180;
const MAX_HISTORY = 3;
const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));
const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
const integer = (n, max = 1000000) => Math.max(0, Math.min(max, Math.floor(finite(n))));

export function createIndustrialDisastersState() {
  return {
    schemaVersion: INDUSTRIAL_DISASTERS_SCHEMA_VERSION,
    site: {
      id: SITE.id, sectorId: SITE.sectorId, anchor: { ...SITE.anchor },
      discovered: false, signalled: false, declined: false, inspected: false, attempt: 0,
      crisis: null, drill: false, returnCrisis: null,
      completed: [], history: [], rewardReceipts: {},
    },
  };
}

/** Validate before destructive owner cleanup, including when a collector uses deserialize()
 * directly through the existing save registry. An absent section is the old-save case. */
export function validateIndustrialDisastersSave(raw) {
  if (raw == null) return { ok: true, absent: true };
  if (typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, reason: 'industrial_section_invalid' };
  if (raw.schemaVersion !== INDUSTRIAL_DISASTERS_SCHEMA_VERSION) {
    return { ok: false, reason: 'industrial_schema_unsupported', schemaVersion: raw.schemaVersion };
  }
  if (!raw.site || typeof raw.site !== 'object' || Array.isArray(raw.site)) {
    return { ok: false, reason: 'industrial_site_invalid' };
  }
  for (const key of ['crisis', 'returnCrisis']) {
    const record = raw.site[key];
    if (record == null) continue;
    if (typeof record !== 'object' || Array.isArray(record) || !getScenario(record.scenarioId)) {
      return { ok: false, reason: 'industrial_crisis_invalid', key };
    }
    if (record.schemaVersion !== CRISIS_SCHEMA_VERSION) {
      return { ok: false, reason: 'industrial_crisis_schema_unsupported', key };
    }
    if (record.physical != null && (typeof record.physical !== 'object' || Array.isArray(record.physical)
      || record.physical.version !== INDUSTRIAL_PHYSICAL_VERSION)) {
      return { ok: false, reason: 'industrial_physical_schema_unsupported', key };
    }
  }
  return { ok: true };
}

function normalizeRecord(raw) {
  if (!raw || !getScenario(raw.scenarioId)) return null;
  const record = normalizeCrisisRecord(raw);
  if (!record) return null;
  record.physical = normalizeIndustrialPhysicalSnapshot(raw.physical, getScenario(record.scenarioId), SITE.anchor, record.cycle);
  return record;
}

/** Detached, bounded feature section. Saved IDs never choose another sector or another actor. */
export function normalizeIndustrialDisasters(raw) {
  const result = createIndustrialDisastersState();
  if (!raw || raw.schemaVersion !== INDUSTRIAL_DISASTERS_SCHEMA_VERSION || !raw.site) return result;
  const src = raw.site, site = result.site;
  site.discovered = src.discovered === true;
  site.signalled = src.signalled === true || site.discovered;
  site.declined = src.declined === true;
  site.inspected = src.inspected === true;
  site.attempt = integer(src.attempt);
  site.crisis = normalizeRecord(src.crisis);
  site.returnCrisis = normalizeRecord(src.returnCrisis);
  site.attempt = Math.max(site.attempt, site.crisis?.cycle || 0, site.returnCrisis?.cycle || 0);
  site.drill = src.drill === true && !!site.returnCrisis;
  if (!site.drill) site.returnCrisis = null;
  site.completed = SCENARIO_IDS.filter((id) => Array.isArray(src.completed) && src.completed.includes(id));
  for (const id of SCENARIO_IDS) {
    const row = src.rewardReceipts?.[id];
    if (!row || row.paid !== true) continue;
    site.rewardReceipts[id] = {
      paid: true, amount: integer(row.amount, 1000), reputation: integer(row.reputation, 5),
      cycle: integer(row.cycle),
    };
    // A settlement receipt is authoritative even if an older producer omitted completed.
    if (!site.completed.includes(id)) site.completed.push(id);
  }
  if (Array.isArray(src.history)) {
    site.history = src.history.filter((row) => getScenario(row?.scenarioId)).slice(-MAX_HISTORY).map((row) => ({
      scenarioId: row.scenarioId, cycle: integer(row.cycle),
      summary: String(row.summary || '').slice(0, 600),
      people: boundedCounts(row.people), equipment: boundedCounts(row.equipment), cargo: boundedCounts(row.cargo),
      amount: integer(row.amount, 1000),
    }));
  }
  return result;
}

function boundedCounts(row) {
  const total = integer(row?.total, 8), saved = Math.min(total, integer(row?.saved, 8));
  const lost = Math.min(total - saved, integer(row?.lost, 8));
  return { total, saved, lost, recovered: Math.min(lost, integer(row?.recovered, 8)), recoverable: total - saved - lost };
}

function countsFor(record) {
  const summary = summarizeIndustrialCrisis(record);
  return {
    people: boundedCounts(summary?.people),
    equipment: boundedCounts(summary?.equipment),
    cargo: boundedCounts(summary?.cargo),
  };
}

function summaryFor(counts) {
  return [['people', 'crew'], ['equipment', 'machines'], ['cargo', 'consignments']]
    .filter(([key]) => counts[key].total)
    .map(([key, noun]) => {
      const row = counts[key];
      return `${noun}: ${row.saved} safe, ${row.lost} lost${row.recovered ? ` (${row.recovered} recovered as scrap)` : ''}${row.recoverable ? `, ${row.recoverable} still recoverable` : ''}`;
    }).join(' · ');
}

export function isIndustrialAdventure(state) {
  return state?.mode === 'flight' && (!state.run || state.run.kind === 'adventure')
    && !state.ui?.docked && state.timeScale !== 0;
}

function distanceToSite(state) {
  const player = state?.entities?.get?.(state.playerId);
  return player?.alive !== false && player?.pos
    ? Math.hypot(player.pos.x - SITE.anchor.x, player.pos.z - SITE.anchor.z) : Infinity;
}

function roleBodies(state, cycle, scenarioId) {
  const result = {};
  for (const body of state?.entityList || state?.entities?.values?.() || []) {
    if (!body || body.alive === false || body.data?.industrialDisasterSiteId !== SITE.id) continue;
    if (body.data.industrialDisasterCycle != null && body.data.industrialDisasterCycle !== cycle) continue;
    if (body.data.industrialDisasterScenario && body.data.industrialDisasterScenario !== scenarioId) continue;
    const role = body.data.industrialDisasterRole;
    if (role) result[role] = body;
  }
  return result;
}

function hasPlayerLine(state, bodies) {
  const ids = new Set(Object.values(bodies).map((body) => body.id));
  return Object.values(state?.combat?.attachments?.byId || {}).some((line) => line?.state === 'active'
    && ((line.ownerId === state.playerId && ids.has(line.targetId))
      || (line.targetId === state.playerId && ids.has(line.ownerId))
      || (line.controllerId === state.playerId && (ids.has(line.ownerId) || ids.has(line.targetId)))));
}

/** Read-only projection for renderer/worker bridge/HUD. It contains no gameplay commands. */
export function getIndustrialDisasterReadModel(state) {
  const site = state?.industrialDisasters?.site;
  const record = site?.crisis;
  const scenario = getScenario(record?.scenarioId || 'drift');
  const bodies = roleBodies(state, record?.cycle, scenario.id);
  const counts = countsFor(record);
  const near = isIndustrialAdventure(state) && state?.world?.currentSectorId === SITE.sectorId
    && (distanceToSite(state) <= RETIRE_RADIUS || hasPlayerLine(state, bodies)
      || !!record?.physical?.playerTether);
  const projection = record ? projectIndustrialCrisis(record, { bodies, anchor: SITE.anchor,
    links: { powerConnected: record.physical?.powerConnected !== false } }) : {};
  return {
    ...projection, ...counts,
    siteId: SITE.id, title: SITE.label, label: SITE.label, sectorId: SITE.sectorId,
    anchor: { ...SITE.anchor }, radius: SITE.radius,
    discovered: site?.discovered === true, signalled: site?.signalled === true, inspected: site?.inspected === true,
    near, phase: !record || record.phase === 'preview' ? 'offered' : record.phase,
    scenarioId: scenario.id, cycle: record?.cycle || 0, attempt: site?.attempt || 0,
    presentationEpoch: state?.industrialDisastersAdmissionEpoch || 0,
    drill: site?.drill === true, hasNext: SCENARIO_IDS.some((id) => !site?.completed?.includes(id)),
    hint: record?.phase === 'recovery' || record?.phase === 'settled' ? scenario.recoveryHint : scenario.firstHint,
    summary: summaryFor(counts), history: clone(site?.history || []),
    bodies: Object.entries(bodies).map(([role, body]) => ({
      role, id: body.id, placeId: body.data?.placeId, pos: { x: body.pos.x, z: body.pos.z },
      radius: body.radius, hull: body.hull, alive: body.alive !== false,
      status: record?.status?.[role] || 'at-risk', label: body.data?.scanLabel || body.data?.name || role,
    })),
  };
}

/** Registered fixed-step owner; run after physical forces and before the save boundary.
 * Physics owns poses/velocities; combat owns damage; economy/factions own consequences. */
export const industrialDisasters = {
  name: 'industrialDisasters',
  init(ctx) {
    this.dispose?.();
    this.ctx = ctx; this.state = ctx.state; this.bus = ctx.bus;
    this.state.industrialDisasters = normalizeIndustrialDisasters(this.state.industrialDisasters);
    this._presentationRequired = !!(ctx.presentationRequired || this.state.render?.scene);
    this._bumpPresentationEpoch();
    this.physical = createIndustrialPhysicalSite({ ...ctx,
      industrialPresentationRequired: () => this._presentationRequired });
    this._subscriptions = []; this._near = false; this._restoring = false; this._signalOffered = false;
    this._publishClock = 0; this._revision = -1;
    const on = (name, fn) => { this.bus.on(name, fn); this._subscriptions.push([name, fn]); };
    on('industrialDisasters:command', (request) => {
      if (request && typeof request === 'object') {
        request.result = this.command(request);
        if (!request.result.ok) this.bus.emit('industrialDisasters:commandRejected', {
          siteId: SITE.id, cycle: this.site.crisis?.cycle || 0,
          reason: request.result.reason, action: request.action,
        });
      }
    });
    on('industrialDisasters:discover', (request) => this.signal(request));
    on('industrialDisasters:requirePresentation', (request) => {
      if (request?.required === true) this.requirePresentation();
    });
    on('industrialDisasters:presentationReady', (request) => this.admitPresentation(request));
    on('sector:exit', () => { this._suspend(); this._signalOffered = false; });
    on('save:restoring', () => {
      this._restoring = true; this.physical.cleanup(); this._near = false;
      this._bumpPresentationEpoch(); this._publishPoses({});
    });
    on('save:loaded', () => { this._restoring = false; this._near = false; this._revision = -1; this._signalOffered = false; });
    on('game:new', () => this.reset());
    on('game:newGame', () => this.reset());
  },

  get site() { return this.state.industrialDisasters.site; },

  _bumpPresentationEpoch() {
    this.state.industrialDisastersAdmissionEpoch = (integer(this.state.industrialDisastersAdmissionEpoch) % 999999) + 1;
    this._presentationReadyCycle = null;
  },

  requirePresentation() {
    if (this._presentationRequired) return;
    this._presentationRequired = true; this._bumpPresentationEpoch();
    for (const entity of Object.values(this.physical.bodies())) setPresentationAdmission(entity, 'pending');
    this._publish();
  },

  admitPresentation(request) {
    const record = this.site.crisis;
    if (!record || request?.siteId !== SITE.id || request.cycle !== record.cycle
      || request.epoch !== this.state.industrialDisastersAdmissionEpoch) return false;
    this._presentationReadyCycle = request.ready === true ? record.cycle : null;
    // The browser view owns admission receipts. In worker mode these are the original native
    // bodies, not the read-model clones on which the browser loaded its authored meshes.
    for (const entity of Object.values(this.physical.bodies())) {
      setPresentationAdmission(entity, request.ready === true ? 'ready' : 'pending');
    }
    return true;
  },

  signal(request = {}) {
    if ((request.siteId && request.siteId !== SITE.id) || !isIndustrialAdventure(this.state)
      || this.state.world?.currentSectorId !== SITE.sectorId) return { ok: false, reason: 'wrong_sector' };
    if (!this.site.signalled) { this.site.signalled = true; this._dirty(); }
    this._signalOffered = true;
    if (distanceToSite(this.state) <= SITE.discoverRadius) return this.discover();
    // A director invitation may fire elsewhere in the refinery approach. Offer a destination;
    // never spend the rescue clock, spawn remote victims, or overwrite the pilot's route.
    this.bus.emit('industrialDisasters:signal', { siteId: SITE.id, sectorId: SITE.sectorId,
      title: SITE.label, anchorX: SITE.anchor.x, anchorZ: SITE.anchor.z });
    return { ok: true, signalled: true, active: false };
  },

  discover() {
    if (!isIndustrialAdventure(this.state) || this.state.world?.currentSectorId !== SITE.sectorId
      || distanceToSite(this.state) > SITE.discoverRadius) return { ok: false, reason: 'approach_site' };
    const first = !this.site.discovered;
    this.site.discovered = true; this.site.signalled = true;
    if (!this.site.crisis) this._prepare(SCENARIO_IDS.find((id) => !this.site.completed.includes(id)) || 'drift');
    if (first) { this._dirty(); this._publish(); }
    return { ok: true, first };
  },

  _prepare(scenarioId) {
    const scenario = getScenario(scenarioId);
    if (!scenario) return false;
    this.physical.cleanup();
    this._bumpPresentationEpoch();
    this.site.attempt += 1;
    this.site.crisis = createCrisisRecord(scenarioId, this.site.attempt);
    this.site.crisis.phase = 'preview';
    this.site.declined = false; this.site.inspected = false;
    this.physical.materialize(this.site.crisis, scenario, SITE.anchor);
    this._revision = -1;
    this._dirty();
    return true;
  },

  command(request = {}) {
    if (request.siteId && request.siteId !== SITE.id) return { ok: false, reason: 'wrong_site' };
    if (!isIndustrialAdventure(this.state) || this.state.world?.currentSectorId !== SITE.sectorId) {
      return { ok: false, reason: 'approach_site' };
    }
    if (this._restoring) return { ok: false, reason: 'restoring' };
    const site = this.site;
    if (request.action === 'markSite') {
      if (!site.signalled) return { ok: false, reason: 'undiscovered' };
      const waypoint = { kind: 'local', label: SITE.label, reason: 'Inspect the industrial distress call',
        pos: { ...SITE.anchor }, sectorId: SITE.sectorId, sectorName: 'Ceres Belt',
        markerId: SITE.id, markerKind: 'industrial-distress' };
      laneSetNavWaypoint(this.state, waypoint);
      this.bus.emit('nav:waypoint', waypoint);
      return { ok: true, marked: true, active: site.crisis?.phase === 'active' };
    }
    if (request.action === 'cancel' && site.signalled && distanceToSite(this.state) > RETIRE_RADIUS) {
      return { ok: true, preserved: true };
    }
    if (distanceToSite(this.state) > RETIRE_RADIUS) return { ok: false, reason: 'approach_site' };
    if (!site.discovered && !this.discover().ok) return { ok: false, reason: 'undiscovered' };
    const crisis = site.crisis;
    switch (request.action) {
      case 'inspect':
        site.inspected = true; site.declined = false;
        this._publish(); this.bus.emit('industrialDisasters:inspect', { siteId: SITE.id });
        return { ok: true, phase: crisis?.phase };
      case 'decline':
        if (crisis?.phase !== 'preview') return { ok: false, reason: 'already_involved' };
        site.declined = true; this._dirty();
        return { ok: true, preserved: true };
      case 'cancel':
        return { ok: true, preserved: true }; // channel dismissal never erases a physical problem
      case 'resume':
        this.physical.materialize(crisis, getScenario(crisis.scenarioId), SITE.anchor);
        this._publish(); return { ok: true };
      case 'accept':
        if (!crisis || crisis.phase !== 'preview') return { ok: false, reason: 'already_involved' };
        if (request.scenarioId && request.scenarioId !== crisis.scenarioId) return { ok: false, reason: 'stale_choice' };
        crisis.phase = 'active'; crisis.revision += 1;
        site.declined = false; this._dirty(); this._publish();
        return { ok: true, scenarioId: crisis.scenarioId };
      case 'finalize':
        if (!crisis || !['recovery', 'settled'].includes(crisis.phase) || site.drill) {
          return { ok: false, reason: 'make_safe_first' };
        }
        finalizeIndustrialCrisis(crisis);
        this._settle(); this._publish();
        return { ok: true, summary: summaryFor(countsFor(crisis)) };
      case 'next': {
        if (site.drill || crisis?.phase !== 'settled') return { ok: false, reason: 'close_response_first' };
        if (this.physical.canSuspend && !this.physical.canSuspend()) return { ok: false, reason: 'release_tethers' };
        const next = SCENARIO_IDS.find((id) => !site.completed.includes(id));
        if (!next) return { ok: false, reason: 'all_incidents_recorded' };
        this._prepare(next); this._publish();
        return { ok: true, scenarioId: next };
      }
      case 'replay':
      case 'drill': {
        const id = request.scenarioId || crisis?.scenarioId;
        if (!getScenario(id) || !site.completed.includes(id)) return { ok: false, reason: 'complete_incident_first' };
        if (site.drill || crisis?.phase !== 'settled') return { ok: false, reason: 'close_response_first' };
        if (this.physical.canSuspend && !this.physical.canSuspend()) return { ok: false, reason: 'release_tethers' };
        this.physical.snapshot(crisis);
        site.returnCrisis = clone(crisis); site.drill = true;
        this._prepare(id); this._publish();
        return { ok: true, drill: true, paid: false };
      }
      case 'finishDrill':
        if (!site.drill || !site.returnCrisis) return { ok: false, reason: 'not_a_drill' };
        if (this.physical.canSuspend && !this.physical.canSuspend()) return { ok: false, reason: 'release_tethers' };
        this.physical.cleanup();
        this._bumpPresentationEpoch();
        site.crisis = site.returnCrisis; site.returnCrisis = null; site.drill = false;
        this.physical.materialize(site.crisis, getScenario(site.crisis.scenarioId), SITE.anchor);
        this._dirty(); this._publish();
        return { ok: true, restoredAftermath: true };
      default: return { ok: false, reason: 'unknown_command' };
    }
  },

  update(dt) {
    if (this._restoring || !Number.isFinite(dt) || dt <= 0) return;
    if (!isIndustrialAdventure(this.state)) return;
    const near = this.state.world?.currentSectorId === SITE.sectorId && distanceToSite(this.state) <= RETIRE_RADIUS;
    if (!near && this.state.world?.currentSectorId === SITE.sectorId && this.site.signalled && !this._signalOffered) {
      this.signal();
    }
    const restoringTow = this.state.world?.currentSectorId === SITE.sectorId
      && !this._near && !!this.site.crisis?.physical?.playerTether;
    if (!near && !restoringTow && (!this._near || !this.physical.canSuspend || this.physical.canSuspend())) {
      if (this._near) this._suspend();
      return;
    }
    if (!this.site.discovered && distanceToSite(this.state) <= SITE.discoverRadius) this.discover();
    const record = this.site.crisis;
    if (!record) return;
    const entering = !this._near;
    this._near = true;
    this.physical.materialize(record, getScenario(record.scenarioId), SITE.anchor);
    const links = this.physical.links();
    const liveBodies = this.physical.bodies();
    if (links.ready && (!Object.keys(liveBodies).length || !this._presentationRequired
      || this._presentationReadyCycle === record.cycle)) {
      // The adapter admits the one initial/saved velocity impulse; it never writes a live pose.
      this.physical.start(record);
      if (['active', 'recovery', 'settled'].includes(record.phase)) {
        const before = record.revision;
        const result = stepIndustrialCrisis(record, { dt, bodies: liveBodies, anchor: SITE.anchor, links });
        this.physical.step(result.intents || [], dt, record);
        for (const event of result.events || []) this.bus.emit('industrialDisasters:event', {
          ...event, siteId: SITE.id, scenarioId: record.scenarioId, cycle: record.cycle,
        });
        if (record.revision !== before) this._dirty();
      }
      if (record.phase === 'settled') this._settle();
    }
    this._publishPoses();
    this._publishClock += dt;
    if (entering || record.revision !== this._revision || this._publishClock >= 1) {
      this._publish();
      if (entering) this.bus.emit('industrialDisasters:inspect', { siteId: SITE.id });
    }
  },

  _settle() {
    const site = this.site, crisis = site.crisis;
    if (!crisis || crisis.phase !== 'settled' || site.drill) return;
    const counts = countsFor(crisis);
    const paid = site.rewardReceipts[crisis.scenarioId];
    if (paid?.paid) {
      // Late physical recovery changes what remains, never reopens a paid settlement.
      const row = site.history.find((item) => item.scenarioId === crisis.scenarioId);
      const summary = summaryFor(counts);
      if (row && row.summary !== summary) { Object.assign(row, counts, { summary }); this._dirty(); }
      return;
    }
    const amount = Math.min(1000, counts.people.saved * 180 + counts.equipment.saved * 80 + counts.cargo.saved * 120);
    const reputation = Math.min(5, counts.people.saved + (counts.equipment.saved ? 1 : 0));
    // Commit receipt BEFORE synchronous owner events: nested re-entry cannot pay twice.
    site.rewardReceipts[crisis.scenarioId] = { paid: true, amount, reputation, cycle: crisis.cycle };
    if (!site.completed.includes(crisis.scenarioId)) site.completed.push(crisis.scenarioId);
    const receipt = { scenarioId: crisis.scenarioId, cycle: crisis.cycle,
      ...counts, amount, summary: summaryFor(counts) };
    site.history = [...site.history.filter((row) => row.scenarioId !== crisis.scenarioId), receipt].slice(-MAX_HISTORY);
    this._dirty();
    if (amount) this.bus.emit('economy:grantCredits', { amount, reason: `Hinge Works / ${crisis.scenarioId} rescue settlement` });
    if (reputation) this.bus.emit('faction:repDelta', { factionId: SITE.factionId, delta: reputation, reason: 'industrial rescue' });
    this.bus.emit('industrialDisasters:consequence', { siteId: SITE.id, ...receipt,
      text: `${receipt.summary}. DMC recovery settlement: ${amount} cr.` });
  },

  _suspend() {
    if (!this.physical || !this.site?.crisis) { this._near = false; return; }
    if (this.physical.canSuspend && !this.physical.canSuspend()) return;
    this.physical.suspend(this.site.crisis);
    this._near = false; this._bumpPresentationEpoch(); this._publishPoses({}); this._dirty(); this._publish();
  },

  _publish() {
    this._publishClock = 0; this._revision = this.site.crisis?.revision ?? -1;
    this.bus.emit('industrialDisasters:status', encodeIndustrialDisasterStatus(this.readModel(), this.state));
  },

  _publishPoses(bodies = this.physical?.bodies() || {}) {
    publishIndustrialDisasterPoses({ state: this.state, bus: this.bus, bodies,
      cycle: this.site?.crisis?.cycle || 0, scenarioId: this.site?.crisis?.scenarioId || null });
  },

  _dirty() {
    this.bus.emit('save:dirty', { kind: SAVE_JOURNAL_EVENT.UPSERT_RECORD,
      payload: { owner: 'industrialDisasters', id: SITE.id, revision: this.site.crisis?.revision || 0 } });
  },

  readModel() { return getIndustrialDisasterReadModel(this.state); },
  serialize() {
    // A queued save can finish after registry teardown. dispose() captures the
    // last live originals before releasing them; keep that detached section.
    if (this.site.crisis) this.physical?.snapshot(this.site.crisis);
    return normalizeIndustrialDisasters(this.state.industrialDisasters);
  },
  deserialize(raw) {
    const verdict = validateIndustrialDisastersSave(raw);
    if (!verdict.ok) return verdict;
    const section = normalizeIndustrialDisasters(raw);
    this.physical.cleanup();
    this.state.industrialDisasters = section;
    this._near = false; this._revision = -1; this._publishClock = 0; this._signalOffered = false;
    this._bumpPresentationEpoch(); this._publishPoses({});
    return { ok: true };
  },
  reset() {
    this.physical?.cleanup();
    this.state.industrialDisasters = createIndustrialDisastersState();
    this._near = false; this._restoring = false; this._revision = -1; this._signalOffered = false;
    this._bumpPresentationEpoch(); this._publishPoses({});
  },
  // runReset calls this canonical lifecycle method before the world rebuilds. Legacy
  // game:new receipts alone do not cover retained-registry New Game transitions.
  newGame() { this.reset(); },
  dispose() {
    if (this._subscriptions) for (const [name, fn] of this._subscriptions) this.bus?.off?.(name, fn);
    this._subscriptions = [];
    if (this.state?.industrialDisasters?.site?.crisis) this.physical?.snapshot(this.site.crisis);
    this.physical?.dispose?.(); this.physical = null;
    if (this.state && this.bus) this._publishPoses({});
  },
  destroy() { this.dispose(); },
};

/** A registry owns its physical bindings/subscriptions; simultaneous hosts never share them. */
export function createIndustrialDisastersSystem() {
  return Object.create(industrialDisasters);
}

export default industrialDisasters;
