// Physical derelict recovery encounter.
//
// Scanner investigation earns a real wreck, but not omniscience: a second close pulse identifies
// condition and ownership. The player then resolves any telegraphed reactor hazard, stabilizes the
// wreck with a massline or a careful station-keeping hold, and chooses rescue / black box / strip.
// This system owns only state.recoveryEncounters and wreck recovery annotations. Cargo, credits and
// reputation stay behind their canonical authorities. The only hostile branch is the authored,
// post-scan 10% still-powered surprise; it requests one defense drone through world spawn authority.

import { hash32 } from '../core/rng.js';
import { SECTORS } from '../data/sectors.js';

const STATE_VERSION = 1;
const SCAN_RANGE_WU = 260;
const HOLD_RANGE_WU = 90;
const HOLD_RELATIVE_SPEED = 8;
const STABILIZE_S = 2.5;
const HAZARD_WINDOW_S = 12;
const TOW_CLEAR_WU = 260;
const RECEIPT_CAP = 32;
const CONCORD_FACTION_ID = 'faction_scn';

const SECTOR_BY_ID = new Map(SECTORS.map((sector) => [sector.id, sector]));
const CHOICE = Object.freeze({
  rescue: Object.freeze({ credits: 620, rep: 12, cargo: Object.freeze({}) }),
  blackbox: Object.freeze({ credits: 360, rep: 4, cargo: Object.freeze({ cmdty_salvage_electronics: 1 }) }),
  strip: Object.freeze({ credits: 120, rep: 0, cargo: Object.freeze({ cmdty_salvage_electronics: 2, cmdty_scrap_metal: 2 }) }),
});
const LUNG_OF_CHARON_CASE = Object.freeze({
  sectorId: 'sector_charon_expanse',
  salvagePointId: 'poi_charon_tether_wreck',
  recoveryId: 'recovery:poi_charon_tether_wreck',
  targetRef: 'landmark_c7_lung_of_charon',
  artifactId: 'case:lung-of-charon:recovery:poi_charon_tether_wreck',
  title: 'The Lung of Charon',
  bodyByOutcome: Object.freeze({
    rescue: 'The hab-pod survivors were recovered alive. The snapped tether is logged as a completed rescue.',
    blackbox: 'The hab-pod black box was secured. The snapped tether incident is closed without a second claim.',
    strip: 'The snapped hab-pod was stripped for components. The survivor signal is closed in the case record.',
    abandoned: 'The incident was abandoned on departure from Charon Expanse. No recovery settlement was issued.',
    failed: 'The Lung of Charon recovery closed without a settlement.',
  }),
});

function freshState() {
  return { schemaVersion: STATE_VERSION, records: {}, outcomes: {}, receipts: [], activeId: null };
}

function ensureState(state) {
  if (!state.recoveryEncounters || typeof state.recoveryEncounters !== 'object') state.recoveryEncounters = freshState();
  const own = state.recoveryEncounters;
  own.schemaVersion = STATE_VERSION;
  if (!own.records || typeof own.records !== 'object' || Array.isArray(own.records)) own.records = {};
  if (!own.outcomes || typeof own.outcomes !== 'object' || Array.isArray(own.outcomes)) own.outcomes = {};
  if (!Array.isArray(own.receipts)) own.receipts = [];
  return own;
}

function positionOf(value) {
  return { x: Number(value && value.x) || 0, z: Number(value && value.z) || 0 };
}

function distance(a, b) {
  return Math.hypot((a && a.x || 0) - (b && b.x || 0), (a && a.z || 0) - (b && b.z || 0));
}

function relativeSpeed(a, b) {
  return Math.hypot((a && a.x || 0) - (b && b.x || 0), (a && a.z || 0) - (b && b.z || 0));
}

function cloneMap(value) {
  const out = {};
  for (const [key, amount] of Object.entries(value || {})) out[key] = Math.max(0, Math.floor(Number(amount) || 0));
  return out;
}

function recordClone(record, { clearEntity = false } = {}) {
  if (!record || typeof record !== 'object') return null;
  const { _lastReadoutSignature: _runtimeSignature, ...durable } = record;
  return {
    ...durable,
    entityId: clearEntity ? null : (record.entityId == null ? null : record.entityId),
    pos: positionOf(record.pos),
    rewardPlan: record.rewardPlan ? { ...record.rewardPlan, cargo: cloneMap(record.rewardPlan.cargo) } : null,
    recoveredCargo: cloneMap(record.recoveredCargo),
  };
}

function receiptClone(receipt) {
  if (!receipt || typeof receipt !== 'object') return null;
  return { ...receipt, pos: positionOf(receipt.pos), cargo: cloneMap(receipt.cargo) };
}

function cloneState(own) {
  const records = {};
  const outcomes = {};
  for (const [id, record] of Object.entries(own.records || {})) {
    const clone = recordClone(record, { clearEntity: true });
    if (clone) records[id] = clone;
  }
  for (const [id, receipt] of Object.entries(own.outcomes || {})) {
    const clone = receiptClone(receipt);
    if (clone) outcomes[id] = clone;
  }
  return {
    schemaVersion: STATE_VERSION,
    records,
    outcomes,
    receipts: (own.receipts || []).map(receiptClone).filter(Boolean).slice(-RECEIPT_CAP),
    activeId: own.activeId && records[own.activeId] && !outcomes[own.activeId] ? own.activeId : null,
  };
}

function normalizeState(data) {
  const source = data && typeof data === 'object' ? data : freshState();
  const normalized = freshState();
  for (const [id, record] of Object.entries(source.records || {})) {
    if (!id || !record || typeof record !== 'object') continue;
    normalized.records[id] = recordClone({ ...record, id }, { clearEntity: true });
  }
  for (const [id, receipt] of Object.entries(source.outcomes || {})) {
    if (!id || !receipt || typeof receipt !== 'object') continue;
    normalized.outcomes[id] = receiptClone({ ...receipt, recoveryId: receipt.recoveryId || id });
  }
  normalized.receipts = (Array.isArray(source.receipts) ? source.receipts : [])
    .map(receiptClone).filter(Boolean).slice(-RECEIPT_CAP);
  normalized.activeId = source.activeId && normalized.records[source.activeId]
    && !normalized.outcomes[source.activeId] ? source.activeId : null;
  return normalized;
}

function publicReadout(record, state) {
  if (!record) return null;
  return {
    recoveryId: record.id,
    phase: record.phase,
    sectorId: record.sectorId,
    entityId: record.entityId,
    pos: positionOf(record.pos),
    classification: record.classification,
    condition: record.scanned ? record.condition : null,
    conditionLabel: record.scanned ? record.conditionLabel : 'UNIDENTIFIED DERELICT',
    ownership: record.scanned ? record.ownership : null,
    legalStatus: record.scanned ? record.legalStatus : null,
    hasSurvivor: record.scanned ? !!record.hasSurvivor : null,
    poweredSurprise: record.scanned ? record.poweredSurprise || null : null,
    hazard: record.scanned ? record.hazard : null,
    hazardRemaining_s: record.phase === 'hazard'
      ? Math.max(0, Number((record.hazardDueAt - Number(state.simTime || 0)).toFixed(1))) : null,
    stabilization: Number(Math.max(0, Math.min(1, (record.stabilizeProgress_s || 0) / STABILIZE_S)).toFixed(3)),
    stabilizationMode: record.stabilizationMode || null,
    stabilizeRequired_s: STABILIZE_S,
    retryReason: record.retryReason || null,
    towClear_wu: TOW_CLEAR_WU,
  };
}

function sourcePointId(payload, wreck) {
  const data = wreck && wreck.data || {};
  return String(data.salvagePointId || payload.sourceId || payload.signalId || payload.id || 'unknown');
}

function entityForSalvagePoint(state, salvagePointId) {
  if (!salvagePointId) return null;
  return (state.entityList || []).find((entity) => entity && entity.alive !== false
    && entity.data && String(entity.data.salvagePointId || '') === String(salvagePointId)) || null;
}

function recoveryIdFor(pointId) {
  return `recovery:${String(pointId).replace(/[^a-zA-Z0-9:_-]/g, '_')}`;
}

function sectorFaction(sectorId) {
  const sector = SECTOR_BY_ID.get(sectorId);
  return sector && sector.factionId || null;
}

function isLungOfCharonRecord(record) {
  return !!(record
    && record.id === LUNG_OF_CHARON_CASE.recoveryId
    && record.sectorId === LUNG_OF_CHARON_CASE.sectorId
    && record.salvagePointId === LUNG_OF_CHARON_CASE.salvagePointId);
}

function lungCaseArtifact(record, receipt) {
  if (!isLungOfCharonRecord(record)) return null;
  const outcome = String(receipt && receipt.outcome || record.outcome || 'closed');
  const body = LUNG_OF_CHARON_CASE.bodyByOutcome[outcome]
    || `The Lung of Charon recovery closed as ${outcome.replace(/_/g, ' ')}.`;
  return {
    id: LUNG_OF_CHARON_CASE.artifactId,
    title: LUNG_OF_CHARON_CASE.title,
    body,
  };
}

export function recoveryPowerSurprise(seed, recoveryId) {
  const powered = hash32(seed || 1, recoveryId, 'recovery-powered-surprise') % 10 === 0;
  if (!powered) return null;
  const trustRoll = hash32(seed || 1, recoveryId, 'recovery-powered-trust') % 10;
  return trustRoll < 6 ? 'survivor' : 'defense_drone';
}

function classifyRecord(state, record, wreck) {
  const data = wreck && wreck.data || {};
  const roll = hash32(state.meta && state.meta.seed || 1, record.id, 'recovery-condition');
  const parentType = String(data.parentType || '').toLowerCase();
  const claimedFaction = data.factionId || wreck && wreck.factionId || sectorFaction(record.sectorId);
  const military = parentType === 'military' || data.restrictedSalvage === true;
  const explicitSurvivor = record.sourceKind === 'distress' || parentType === 'survivor_pod' || !!data.survivorPod;
  const poweredSurprise = explicitSurvivor ? null
    : recoveryPowerSurprise(state.meta && state.meta.seed || 1, record.id);
  const hasSurvivor = explicitSurvivor || poweredSurprise === 'survivor'
    || (!poweredSurprise && roll % 5 === 1);
  const hazard = !hasSurvivor && !poweredSurprise && roll % 4 === 0 ? 'reactor_leak' : null;
  const legalStatus = military ? 'restricted' : (claimedFaction && roll % 3 === 0 ? 'claimed' : 'open');
  const condition = poweredSurprise === 'defense_drone' ? 'defense_online'
    : hasSurvivor ? 'life_support' : hazard ? 'unstable' : (roll % 2 ? 'fractured' : 'stable');
  return {
    hasSurvivor,
    poweredSurprise,
    hazard,
    legalStatus,
    claimantFactionId: claimedFaction || null,
    ownership: legalStatus === 'open' ? 'OPEN SALVAGE' : legalStatus === 'restricted' ? 'RESTRICTED RECOVERY' : 'REGISTERED CLAIM',
    condition,
    conditionLabel: poweredSurprise === 'defense_drone' ? 'POWERED DEFENSE · DRONE WAKE'
      : hasSurvivor ? 'LIFE SIGNS · POD INTACT'
        : hazard ? 'REACTOR LEAK · CORE LIVE'
          : condition === 'fractured' ? 'FRACTURED HULL · LOAD SHIFT' : 'STABLE HULK · SYSTEMS COLD',
  };
}

export const recoveryEncounter = {
  name: 'recoveryEncounter',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this.registry = ctx.registry;
    this._unsubs = [];
    ensureState(this.state);
    this._listen('signal:investigated', (payload) => this._onSignalInvestigated(payload || {}));
    this._listen('scan:pulse', () => this._onScanPulse());
    this._listen('recovery:vent', (payload) => this._vent(payload || {}));
    this._listen('recovery:choose', (payload) => this._choose(payload || {}));
    this._listen('salvage:reactorVented', (payload) => this._hazardCleared(payload || {}, 'vented'));
    this._listen('salvage:reactorTowedClear', (payload) => this._hazardCleared(payload || {}, 'towed_clear'));
    this._listen('salvage:reactorBurst', (payload) => this._hazardBurst(payload || {}));
    this._listen('salvage:placed', (payload) => this._rebindSector(payload && payload.sectorId));
    this._listen('sector:exit', (payload) => this._onSectorExit(payload || {}));
    this._listen('sector:enter', (payload) => this._rebindSector(payload && payload.sectorId));
    this._listen('entity:spawned', (payload) => this._onEntitySpawned(payload && payload.entity));
  },

  _listen(event, fn) {
    if (!this.bus || typeof this.bus.on !== 'function') return;
    const unsub = this.bus.on(event, fn);
    if (typeof unsub === 'function') this._unsubs.push(unsub);
  },

  newGame() {
    this.state.recoveryEncounters = freshState();
  },

  update(dt, state) {
    const own = ensureState(state);
    const record = own.activeId && own.records[own.activeId];
    if (!record || own.outcomes[record.id] || state.mode !== 'flight') return;
    if (record.sectorId !== (state.world && state.world.currentSectorId)) return;
    const wreck = this._wreck(record);
    const player = state.entities && state.entities.get && state.entities.get(state.playerId);
    if (!wreck || wreck.alive === false || !player || player.alive === false) return;
    record.pos = positionOf(wreck.pos);
    this._applyRecordToWreck(record, wreck);

    if (record.phase === 'awaiting_scan' || record.phase === 'decision') {
      this._emitProgress(record);
      return;
    }

    if (record.phase === 'hazard') {
      const unstable = wreck.data && wreck.data.unstableReactor;
      if (unstable && Number.isFinite(Number(unstable.dueAt))) record.hazardDueAt = Number(unstable.dueAt);
      this._emitProgress(record);
      return;
    }
    if (record.phase !== 'stabilizing') return;

    const tether = state.player && state.player.tether;
    const tethered = !!(tether && tether.active && tether.targetId === wreck.id);
    const close = distance(player.pos, wreck.pos) <= HOLD_RANGE_WU;
    const slow = relativeSpeed(player.vel, wreck.vel) <= HOLD_RELATIVE_SPEED;
    const mode = tethered ? 'massline' : close && slow ? 'station_keeping' : null;
    record.stabilizationMode = mode;
    if (mode) record.stabilizeProgress_s = Math.min(STABILIZE_S, (record.stabilizeProgress_s || 0) + dt);
    else record.stabilizeProgress_s = Math.max(0, (record.stabilizeProgress_s || 0) - dt * 0.75);
    if (record.stabilizeProgress_s >= STABILIZE_S) {
      record.phase = 'decision';
      record.stabilizedAt = Number(state.simTime) || 0;
      record.retryReason = null;
      this._emit('recovery:decisionReady', publicReadout(record, state));
      return;
    }
    this._emitProgress(record);
  },

  _onSignalInvestigated(payload) {
    if (payload.sourceKind !== 'salvage' && payload.sourceKind !== 'distress') return null;
    const state = this.state;
    const own = ensureState(state);
    let wreck = payload.entityId != null && state.entities && state.entities.get && state.entities.get(payload.entityId);
    const pointId = sourcePointId(payload, wreck);
    const id = recoveryIdFor(pointId);
    if (own.outcomes[id]) {
      this._emit('recovery:receipt', receiptClone(own.outcomes[id]));
      return own.records[id] || null;
    }
    let record = own.records[id];
    if (!record) {
      record = {
        id,
        salvagePointId: pointId,
        signalId: payload.signalId || null,
        sourceKind: payload.sourceKind,
        sectorId: payload.sectorId || state.world && state.world.currentSectorId,
        entityId: wreck && wreck.id || null,
        pos: positionOf(payload.pos || wreck && wreck.pos),
        classification: payload.classification || (payload.sourceKind === 'distress' ? 'DISTRESS SIGNAL' : 'DERELICT SALVAGE'),
        phase: 'awaiting_scan',
        scanned: false,
        condition: null,
        conditionLabel: null,
        hasSurvivor: false,
        poweredSurprise: null,
        defenseTriggered: false,
        hazard: null,
        hazardDueAt: null,
        hazardResolution: null,
        legalStatus: null,
        claimantFactionId: null,
        ownership: null,
        stabilizeProgress_s: 0,
        stabilizationMode: null,
        retryReason: null,
        recoveredCargo: {},
        rewardGranted: false,
        createdAt: Number(state.simTime) || 0,
      };
      own.records[id] = record;
    }
    own.activeId = id;
    this._claimSalvagePoint(record);
    wreck = wreck || this._materialize(record);
    if (wreck) {
      record.entityId = wreck.id;
      record.pos = positionOf(wreck.pos);
      this._applyRecordToWreck(record, wreck);
    }
    this._emit('recovery:started', publicReadout(record, state));
    return record;
  },

  _onScanPulse() {
    const state = this.state;
    const own = ensureState(state);
    const record = own.activeId && own.records[own.activeId];
    if (!record || record.phase !== 'awaiting_scan' || record.sectorId !== state.world?.currentSectorId) return false;
    const wreck = this._wreck(record);
    const player = state.entities && state.entities.get && state.entities.get(state.playerId);
    if (!wreck || !player || distance(player.pos, wreck.pos) > SCAN_RANGE_WU) return false;
    Object.assign(record, classifyRecord(state, record, wreck));
    record.scanned = true;
    record.scannedAt = Number(state.simTime) || 0;
    record.phase = record.hazard ? 'hazard' : 'stabilizing';
    if (record.hazard) this._armHazard(record, wreck);
    else if (record.poweredSurprise === 'defense_drone') this._triggerDefense(record, wreck);
    this._applyRecordToWreck(record, wreck);
    this._emit('recovery:identified', publicReadout(record, state));
    return true;
  },

  _onSectorExit(payload) {
    const own = ensureState(this.state);
    const record = own.activeId && own.records[own.activeId];
    if (!isLungOfCharonRecord(record) || own.outcomes[record.id]) return false;
    if (String(payload.sectorId || '') !== record.sectorId) return false;
    // Continuous membership handoffs do not mean the player left the operation. Likewise,
    // recovery respawn calls world.enterSector while combat's durable defeat receipt is still
    // present; that transition must keep the Lung resumable instead of filing an abandonment.
    if (payload.continuous || payload.noTeleport) return false;
    if (this.state.combat && this.state.combat.lastPlayerDefeat) return false;
    return this._complete(record, 'abandoned', {
      failure: 'sector_exit',
      credits: 0,
      repDelta: 0,
      cargo: {},
    });
  },

  _triggerDefense(record, wreck) {
    if (record.defenseTriggered) return false;
    record.defenseTriggered = true;
    this._emit('spawn:request', {
      entityType: 'pirate',
      enemyTypeId: 'wasp_swarmer',
      sectorId: record.sectorId,
      position: positionOf(wreck && wreck.pos || record.pos),
      count: 1,
      tags: ['derelict_defense', 'still_powered'],
      refId: record.id,
    });
    this._emit('recovery:defenseAwake', publicReadout(record, this.state));
    return true;
  },

  _armHazard(record, wreck) {
    record.hazardDueAt = Number(this.state.simTime || 0) + HAZARD_WINDOW_S;
    const actions = this.registry && this.registry.get && this.registry.get('salvageActions');
    if (wreck.data) wreck.data.unstableReactor = true;
    if (actions && typeof actions._annotate === 'function') actions._annotate(wreck);
    const unstable = wreck.data && wreck.data.unstableReactor;
    if (unstable && typeof unstable === 'object') unstable.dueAt = record.hazardDueAt;
    if (wreck.data) wreck.data.salvagePool = {};
  },

  _vent(payload) {
    const record = this._recordFromPayload(payload);
    if (!record || record.phase !== 'hazard' || record.entityId == null) return false;
    this._emit('salvage:ventReactor', { wreckId: record.entityId, targetId: record.entityId, recoveryId: record.id });
    return true;
  },

  _hazardCleared(payload, resolution) {
    const record = this._recordByEntity(payload.wreckId != null ? payload.wreckId : payload.targetId);
    if (!record || record.phase !== 'hazard') return false;
    record.hazardResolution = resolution;
    record.phase = 'stabilizing';
    record.stabilizeProgress_s = 0;
    const wreck = this._wreck(record);
    if (wreck && wreck.data) wreck.data.salvagePool = {};
    this._emit('recovery:hazardCleared', publicReadout(record, this.state));
    return true;
  },

  _hazardBurst(payload) {
    const record = this._recordByEntity(payload.wreckId != null ? payload.wreckId : payload.targetId);
    if (!record || record.phase !== 'hazard') return false;
    record.hazardResolution = 'burst';
    return this._complete(record, 'failed', { failure: 'reactor_burst', credits: 0, repDelta: 0, cargo: {} });
  },

  _choose(payload) {
    const record = this._recordFromPayload(payload);
    const choice = String(payload.choice || payload.optionId || '');
    if (!record || record.phase !== 'decision' || !CHOICE[choice]) return false;
    if (choice === 'rescue' && !record.hasSurvivor) {
      record.retryReason = 'no_life_signs';
      this._emit('recovery:retryAvailable', publicReadout(record, this.state));
      return false;
    }
    const plan = CHOICE[choice];
    record.rewardPlan = { choice, credits: plan.credits, rep: plan.rep, cargo: cloneMap(plan.cargo) };
    record.recoveredCargo = record.recoveredCargo || {};
    if (!this._recoverCargo(record)) {
      record.retryReason = 'cargo_full';
      this._emit('recovery:retryAvailable', publicReadout(record, this.state));
      return false;
    }
    record.retryReason = null;
    const repDelta = this._repDelta(record, choice, plan.rep);
    return this._complete(record, choice, {
      credits: plan.credits,
      repDelta,
      cargo: cloneMap(record.recoveredCargo),
      factionId: record.claimantFactionId || (choice === 'rescue' ? CONCORD_FACTION_ID : null),
    });
  },

  _recoverCargo(record) {
    const plan = record.rewardPlan && record.rewardPlan.cargo || {};
    const cargo = this.registry && this.registry.get && this.registry.get('cargo');
    if (!cargo || typeof cargo.addCargo !== 'function') return Object.keys(plan).length === 0;
    let complete = true;
    for (const [commodityId, requested] of Object.entries(plan)) {
      const have = Math.max(0, Math.floor(record.recoveredCargo[commodityId] || 0));
      const missing = Math.max(0, requested - have);
      if (!missing) continue;
      const added = Math.max(0, Math.floor(cargo.addCargo(commodityId, missing) || 0));
      record.recoveredCargo[commodityId] = have + added;
      if (record.recoveredCargo[commodityId] < requested) complete = false;
    }
    return complete;
  },

  _repDelta(record, choice, positive) {
    if (choice === 'rescue') return positive;
    if (choice === 'blackbox') return record.legalStatus === 'restricted' ? 2 : positive;
    if (choice === 'strip' && record.legalStatus === 'restricted') return -12;
    if (choice === 'strip' && record.legalStatus === 'claimed') return -7;
    return 0;
  },

  _complete(record, outcome, result) {
    const own = ensureState(this.state);
    if (!record || own.outcomes[record.id]) return false;
    const factionId = result.factionId || record.claimantFactionId || null;
    if (!record.rewardGranted) {
      if (result.credits > 0) this._emit('economy:grantCredits', { amount: result.credits, reason: `recovery:${outcome}`, recoveryId: record.id });
      if (factionId && result.repDelta) this._emit('faction:repDelta', { factionId, delta: result.repDelta, reason: `recovery:${outcome}`, recoveryId: record.id });
      record.rewardGranted = true;
    }
    record.phase = outcome === 'failed' ? 'failed' : 'completed';
    record.outcome = outcome;
    record.completedAt = Number(this.state.simTime) || 0;
    const receipt = {
      id: `recovery-receipt:${record.id}`,
      recoveryId: record.id,
      sectorId: record.sectorId,
      salvagePointId: record.salvagePointId,
      entityId: record.entityId,
      pos: positionOf(record.pos),
      outcome,
      failure: result.failure || null,
      condition: record.condition,
      ownership: record.ownership,
      legalStatus: record.legalStatus,
      factionId,
      credits: result.credits || 0,
      repDelta: result.repDelta || 0,
      cargo: cloneMap(result.cargo),
      completedAt: record.completedAt,
    };
    own.outcomes[record.id] = receipt;
    own.receipts.push(receipt);
    while (own.receipts.length > RECEIPT_CAP) own.receipts.shift();
    own.activeId = null;
    const wreck = this._wreck(record);
    if (wreck) this._applyRecordToWreck(record, wreck);
    this._emit('recovery:completed', receiptClone(receipt));
    this._emit('recovery:receipt', receiptClone(receipt));
    this._publishLungCase(record, receipt);
    return true;
  },

  _publishLungCase(record, receipt) {
    const artifact = lungCaseArtifact(record, receipt);
    if (!artifact) return false;
    const completedAt = Number(receipt && receipt.completedAt);
    this._emit('landmark:artifactRecovered', {
      sectorId: LUNG_OF_CHARON_CASE.sectorId,
      poiId: LUNG_OF_CHARON_CASE.salvagePointId,
      targetRef: LUNG_OF_CHARON_CASE.targetRef,
      signalId: record.signalId || null,
      artifact,
      returnedAt: Number.isFinite(completedAt) ? Math.max(0, completedAt) : Number(this.state.simTime) || 0,
    });
    return true;
  },

  _claimSalvagePoint(record) {
    const points = this.state.salvage && this.state.salvage.points;
    const point = Array.isArray(points) && points.find((row) => row && row.id === record.salvagePointId);
    if (!point) return null;
    point.offered = true;
    point.recoveryEncounterId = record.id;
    if (point.entityId != null) record.entityId = point.entityId;
    return point;
  },

  _rebindSector(sectorId) {
    if (!sectorId) return;
    const own = ensureState(this.state);
    for (const record of Object.values(own.records)) {
      if (!record || record.sectorId !== sectorId) continue;
      this._claimSalvagePoint(record);
      const wreck = this._materialize(record);
      if (wreck) this._applyRecordToWreck(record, wreck);
    }
  },

  _materialize(record) {
    let wreck = this._wreck(record);
    if (wreck) return wreck;
    wreck = entityForSalvagePoint(this.state, record.salvagePointId);
    if (wreck) {
      record.entityId = wreck.id;
      record.pos = positionOf(wreck.pos);
      return wreck;
    }
    const point = this._claimSalvagePoint(record);
    if (point && point.entityId != null) wreck = this.state.entities && this.state.entities.get && this.state.entities.get(point.entityId);
    if (wreck) {
      record.entityId = wreck.id;
      record.pos = positionOf(wreck.pos);
      return wreck;
    }
    if (record.sectorId !== (this.state.world && this.state.world.currentSectorId) || typeof this.helpers.spawnEntity !== 'function') return null;
    wreck = this.helpers.spawnEntity({
      type: 'wreck',
      pos: positionOf(record.pos),
      radius: 10,
      mass: 1800,
      hull: 1,
      hullMax: 1,
      data: {
        parentType: record.sourceKind === 'distress' ? 'communicator' : 'ship',
        salvagePointId: record.salvagePointId,
        recoveryEncounterId: record.id,
        salvagePool: {},
        salvageTimeLeft: 0,
        scanLabel: record.scanned ? record.conditionLabel : 'Unidentified Derelict',
      },
    });
    if (wreck) record.entityId = wreck.id;
    return wreck;
  },

  _onEntitySpawned(entity) {
    const data = entity && entity.data || {};
    const own = ensureState(this.state);
    const id = data.recoveryEncounterId;
    const record = id && own.records[id]
      || Object.values(own.records).find((candidate) => candidate
        && data.salvagePointId && String(candidate.salvagePointId) === String(data.salvagePointId));
    if (record) record.entityId = entity.id;
    if (record) this._applyRecordToWreck(record, entity);
  },

  _applyRecordToWreck(record, wreck) {
    const data = wreck.data || (wreck.data = {});
    data.recoveryEncounterId = record.id;
    data.salvagePointId = record.salvagePointId;
    data.recoveryPhase = record.phase;
    data.recoveryClosed = record.phase === 'completed' || record.phase === 'failed';
    data.salvagePool = {};
    data.salvageTimeLeft = 0;
    if (record.phase === 'completed') data.scanLabel = `Recovered Derelict - ${String(record.outcome || 'closed').replace(/_/g, ' ')}`;
    else if (record.phase === 'failed') data.scanLabel = 'Burned Derelict - recovery closed';
    else data.scanLabel = record.scanned ? record.conditionLabel : 'Unidentified Derelict';
  },

  _recordFromPayload(payload) {
    const own = ensureState(this.state);
    const id = payload.recoveryId || payload.id || own.activeId;
    return id && own.records[id] || null;
  },

  _recordByEntity(entityId) {
    if (entityId == null) return null;
    return Object.values(ensureState(this.state).records).find((record) => record && record.entityId === entityId) || null;
  },

  _wreck(record) {
    return record && record.entityId != null && this.state.entities && this.state.entities.get
      ? this.state.entities.get(record.entityId) || null : null;
  },

  _emitProgress(record) {
    const progressBucket = Math.floor((record.stabilizeProgress_s || 0) * 5);
    const hazardBucket = record.phase === 'hazard' ? Math.ceil((record.hazardDueAt - Number(this.state.simTime || 0)) * 2) : null;
    const signature = `${record.phase}:${record.stabilizationMode || ''}:${progressBucket}:${hazardBucket}`;
    if (record._lastReadoutSignature === signature) return;
    record._lastReadoutSignature = signature;
    this._emit('recovery:readout', publicReadout(record, this.state));
  },

  _emit(event, payload) {
    if (this.bus && typeof this.bus.emit === 'function') this.bus.emit(event, payload);
  },

  serialize() {
    return cloneState(ensureState(this.state));
  },

  deserialize(data) {
    this.state.recoveryEncounters = normalizeState(data);
    const own = ensureState(this.state);
    for (const record of Object.values(own.records)) {
      const receipt = record && own.outcomes[record.id];
      if (receipt) this._publishLungCase(record, receipt);
    }
  },

  destroy() {
    for (const unsub of this._unsubs || []) unsub();
    this._unsubs = [];
  },
};

export default recoveryEncounter;
