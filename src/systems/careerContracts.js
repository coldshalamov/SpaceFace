// Deterministic repeatable M3/M4 career contract chains.
// Owns only state.missions.careerContracts. Missions remains the board/active/reward authority;
// sectorSim remains the persistent regional-pressure authority. This system emits canonical intents.

import { hash32 } from '../core/rng.js';
import {
  CAREER_CONTRACT_BY_ID,
  CAREER_CONTRACT_SCHEMA_VERSION,
  REPEATABLE_CAREER_CONTRACTS,
} from '../data/careerContracts.js';
import { getRegionalEcologyProfile } from '../data/regionalEcology.js';

const RECEIPT_CAP = 96;
const SETTLED_CAP = 96;
const REFRESH_SECONDS = 600;
const RUN_STATUS = Object.freeze({ READY: 'ready', OFFERED: 'offered', ACTIVE: 'active', RECOVERING: 'recovering', COMPLETED: 'completed' });

function clonePlain(value) {
  return JSON.parse(JSON.stringify(value == null ? null : value));
}

function seedOf(state) {
  return ((state?.meta?.seed ?? state?.seed ?? 1) >>> 0) || 1;
}

function epochOf(state) {
  const refresh = Number(state?.missions?.config?.refreshSec) || REFRESH_SECONDS;
  return Math.floor((Number(state?.simTime) || 0) / refresh);
}

function freshRun(contractId) {
  return {
    contractId,
    cycle: 0,
    stageIndex: 0,
    attempt: 0,
    status: RUN_STATUS.READY,
    offerId: null,
    missionId: null,
    fingerprint: null,
    boundAftermathFingerprint: null,
    lastCompletedEpoch: -1,
    completedStages: [],
  };
}

function normalizeRun(def, raw) {
  const base = freshRun(def.id);
  if (!raw || typeof raw !== 'object') return base;
  const status = Object.values(RUN_STATUS).includes(raw.status) ? raw.status : base.status;
  return {
    ...base,
    ...raw,
    contractId: def.id,
    cycle: Math.max(0, Math.floor(Number(raw.cycle) || 0)),
    stageIndex: Math.max(0, Math.min(def.stages.length, Math.floor(Number(raw.stageIndex) || 0))),
    attempt: Math.max(0, Math.floor(Number(raw.attempt) || 0)),
    status,
    offerId: raw.offerId == null ? null : String(raw.offerId),
    missionId: raw.missionId == null ? null : String(raw.missionId),
    fingerprint: raw.fingerprint == null ? null : String(raw.fingerprint),
    boundAftermathFingerprint: raw.boundAftermathFingerprint == null ? null : String(raw.boundAftermathFingerprint),
    lastCompletedEpoch: Number.isFinite(raw.lastCompletedEpoch) ? Math.floor(raw.lastCompletedEpoch) : -1,
    completedStages: Array.isArray(raw.completedStages) ? raw.completedStages.map(String).slice(-12) : [],
  };
}

export function ensureCareerContractState(state) {
  if (!state.missions || typeof state.missions !== 'object') state.missions = {};
  const raw = state.missions.careerContracts;
  const own = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  own.schemaVersion = CAREER_CONTRACT_SCHEMA_VERSION;
  if (!own.runs || typeof own.runs !== 'object' || Array.isArray(own.runs)) own.runs = {};
  for (const def of REPEATABLE_CAREER_CONTRACTS) {
    const current = own.runs[def.id];
    const normalized = normalizeRun(def, current);
    if (current && typeof current === 'object' && !Array.isArray(current)) {
      for (const key of Object.keys(current)) delete current[key];
      Object.assign(current, normalized);
    } else {
      own.runs[def.id] = normalized;
    }
  }
  for (const id of Object.keys(own.runs)) if (!CAREER_CONTRACT_BY_ID[id]) delete own.runs[id];
  if (!Array.isArray(own.receipts)) own.receipts = [];
  own.receipts = own.receipts.filter((item) => item && item.contractId).slice(-RECEIPT_CAP);
  if (!Array.isArray(own.settledMissionIds)) own.settledMissionIds = [];
  own.settledMissionIds = [...new Set(own.settledMissionIds.map(String))].slice(-SETTLED_CAP);
  state.missions.careerContracts = own;
  return own;
}

export function completedOriginIdentity(state, careerId) {
  const meta = state?.careers?.origins?.__meta;
  const receipt = meta?.identityReceipts?.[careerId];
  if (receipt?.status === 'completed') return receipt;
  const upgrade = meta?.upgradeReceipts?.[careerId];
  if (!upgrade) return null;
  return {
    careerId,
    lane: careerId === 'hauler' ? 'freight' : careerId === 'hunter' ? 'warrant' : 'extraction',
    verb: careerId === 'hauler' ? 'carry' : careerId === 'hunter' ? 'intercept' : 'survey',
    status: 'completed',
    loadout: { defId: upgrade.defId, status: 'inventory' },
  };
}

function openAftermathFor(state, sectorId) {
  const stores = [state?.aftermathWrecks?.causes, state?.regionalEcology?.causes];
  const rows = [];
  for (const store of stores) {
    for (const cause of Object.values(store || {})) {
      if (!cause || cause.sectorId !== sectorId || cause.status !== 'open' || !cause.fingerprint) continue;
      if (!rows.some((item) => item.fingerprint === cause.fingerprint)) rows.push(cause);
    }
  }
  return rows.sort((a, b) => ((a.createdTick || a.t || 0) - (b.createdTick || b.t || 0))
    || String(a.fingerprint).localeCompare(String(b.fingerprint)))[0] || null;
}

function scaledParams(params, cycle) {
  const out = clonePlain(params || {});
  const scale = 1 + (cycle % 3) * 0.15;
  for (const key of ['qty', 'clearCount', 'scanTargets']) {
    if (Number.isFinite(out[key])) out[key] = Math.max(1, Math.round(out[key] * scale));
  }
  if (Number.isFinite(out.targetStrength)) out.targetStrength = Math.round((out.targetStrength + (cycle % 3) * 0.08) * 100) / 100;
  out.taskTime = Number.isFinite(out.taskTime) ? out.taskTime : 30;
  out.fValue = Number.isFinite(out.fValue) ? out.fValue : (out.targetStrength || 1);
  return out;
}

export function buildCareerContractOffer(state, defOrId, runInput = null) {
  const def = typeof defOrId === 'string' ? CAREER_CONTRACT_BY_ID[defOrId] : defOrId;
  if (!def) return null;
  const own = ensureCareerContractState(state);
  const run = normalizeRun(def, runInput || own.runs[def.id]);
  const stage = def.stages[run.stageIndex];
  const origin = completedOriginIdentity(state, def.careerId);
  if (!stage || !origin) return null;
  const ecology = getRegionalEcologyProfile(stage.destSectorId);
  if (!ecology) return null;
  const aftermath = openAftermathFor(state, stage.destSectorId);
  const suffix = hash32(
    seedOf(state), 'career-contract-v1', def.id, run.cycle, run.stageIndex, run.attempt,
    ecology.fingerprint, aftermath?.fingerprint || 'no-aftermath',
  ).toString(36);
  const fingerprint = `cc_${def.id}_${run.cycle}_${run.stageIndex}_${run.attempt}_${suffix}`;
  const attemptMult = Math.max(0.70, 1 - run.attempt * 0.10);
  const cycleMult = 1 + (run.cycle % 4) * 0.08;
  const ecologyMult = 1 + ecology.danger.baseline * 0.15;
  const rewardCr = Math.max(1, Math.round(stage.rewardCr * attemptMult * cycleMult * ecologyMult));
  const collateralCr = Math.max(0, Math.round(stage.collateralCr * Math.max(0.50, 1 - run.attempt * 0.15)));
  const aftermathLine = aftermath
    ? ` Causal lead ${aftermath.fingerprint}: ${aftermath.motiveId || aftermath.consequenceKind || 'unresolved loss'}.`
    : ' No unresolved wreck cause is required; the regional ecology is the standing evidence.';
  const summary = `${def.actor.name}: ${def.actor.motive} ${stage.instruction} Failure: ${stage.failureText} Recovery: ${stage.recoveryText}${aftermathLine}`;
  return {
    id: `offer_${fingerprint}`,
    source: 'careerContract',
    type: stage.type,
    stationId: stage.boardStationId,
    factionId: def.actor.factionId,
    minRep: -149,
    riskTier: Math.max(0, Math.min(4, stage.riskTier + Math.floor(run.cycle / 4))),
    reward_cr: rewardCr,
    collateral_cr: collateralCr,
    title: `${def.title} ${run.stageIndex + 1}/3 — ${stage.title}`,
    description: summary,
    summary,
    destStationId: stage.destStationId || null,
    destSectorId: stage.destSectorId,
    preloadedCargo: !!stage.preloadedCargo,
    params: scaledParams(stage.params, run.cycle),
    storyTag: `career.repeatable.${def.careerId}:${def.id}:${run.cycle}:${stage.id}`,
    markerId: `career-contract:${def.id}:${run.cycle}:${stage.id}`,
    mapLabel: stage.instruction,
    cause: {
      fingerprint,
      tag: 'career_contract',
      contractId: def.id,
      stageId: stage.id,
      stageIndex: run.stageIndex,
      careerId: def.careerId,
      cycle: run.cycle,
      attempt: run.attempt,
      actorId: def.actor.id,
      actorName: def.actor.name,
      motive: def.actor.motive,
      originLane: origin.lane,
      originVerb: origin.verb,
      regionalFingerprint: ecology.fingerprint,
      regionalIdentityKey: ecology.identityKey,
      regionalFamilyId: ecology.familyId,
      regionalResourceKind: ecology.resource.kind,
      regionalSecurity: ecology.law.security,
      regionalDanger: ecology.danger.baseline,
      aftermathFingerprint: aftermath?.fingerprint || null,
      aftermathMotiveId: aftermath?.motiveId || null,
      instruction: stage.instruction,
      failure: stage.failureText,
      recovery: stage.recoveryText,
    },
  };
}

function boardHasOffer(state, offerId) {
  if (!offerId) return false;
  return Object.values(state?.missions?.boards || {}).some((board) => (
    Array.isArray(board?.slots) && board.slots.some((offer) => offer?.id === offerId)
  ));
}

function activeHasMission(state, missionId, fingerprint) {
  return (state?.missions?.active || []).some((mission) => mission && mission.status === 'active'
    && ((missionId && mission.id === missionId) || (fingerprint && mission.cause?.fingerprint === fingerprint)));
}

export const careerContracts = {
  name: 'careerContracts',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this._unsubs = [];
    this._pending = new Map();
    ensureCareerContractState(this.state);
    this._listen('dock:docked', (payload) => this._offerAtStation(payload?.stationId));
    this._listen('mission:offerBoarded', (payload) => this._onOfferBoarded(payload || {}));
    this._listen('mission:accepted', (payload) => this._onMissionAccepted(payload || {}));
    this._listen('mission:completed', (payload) => this._settle(payload || {}, true));
    this._listen('mission:failed', (payload) => this._settle(payload || {}, false));
    this._listen('mission:expired', (payload) => this._settle(payload || {}, false));
    this._listen('save:loaded', () => this._reconcileAll());
    this._listen('game:newGame', () => this.newGame());
  },

  _listen(event, fn) {
    if (!this.bus?.on) return;
    const off = this.bus.on(event, fn);
    if (typeof off === 'function') this._unsubs.push(off);
  },

  newGame() {
    if (!this.state.missions || typeof this.state.missions !== 'object') this.state.missions = {};
    this.state.missions.careerContracts = null;
    ensureCareerContractState(this.state);
    this._pending?.clear();
  },

  _reconcileRun(run) {
    if (run.status === RUN_STATUS.OFFERED && !boardHasOffer(this.state, run.offerId)) {
      run.status = RUN_STATUS.RECOVERING;
      run.offerId = null;
      run.fingerprint = null;
    }
    if (run.status === RUN_STATUS.ACTIVE && !activeHasMission(this.state, run.missionId, run.fingerprint)) {
      run.status = RUN_STATUS.RECOVERING;
      run.missionId = null;
      run.offerId = null;
      run.fingerprint = null;
    }
    return run;
  },

  _reconcileAll() {
    const own = ensureCareerContractState(this.state);
    this._pending.clear();
    for (const run of Object.values(own.runs)) this._reconcileRun(run);
  },

  _offerAtStation(stationId) {
    if (!stationId || !this.bus?.emit) return null;
    const own = ensureCareerContractState(this.state);
    const epoch = epochOf(this.state);
    const candidates = [];
    for (const def of REPEATABLE_CAREER_CONTRACTS) {
      if (!completedOriginIdentity(this.state, def.careerId)) continue;
      const run = this._reconcileRun(own.runs[def.id]);
      if (run.status === RUN_STATUS.COMPLETED) {
        if (epoch <= run.lastCompletedEpoch) continue;
        Object.assign(run, freshRun(def.id), { cycle: run.cycle + 1, lastCompletedEpoch: run.lastCompletedEpoch });
      }
      if (![RUN_STATUS.READY, RUN_STATUS.RECOVERING].includes(run.status)) continue;
      const stage = def.stages[run.stageIndex];
      if (!stage || stage.boardStationId !== stationId) continue;
      candidates.push({ def, run });
    }
    candidates.sort((a, b) => (a.run.lastCompletedEpoch - b.run.lastCompletedEpoch)
      || a.def.careerId.localeCompare(b.def.careerId) || a.def.id.localeCompare(b.def.id));
    const choice = candidates[0];
    if (!choice) return null;
    const offer = buildCareerContractOffer(this.state, choice.def, choice.run);
    if (!offer) return null;
    this._pending.set(offer.id, choice.def.id);
    this.bus.emit('mission:offered', offer);
    if (choice.run.status !== RUN_STATUS.OFFERED) this._pending.delete(offer.id);
    return offer;
  },

  _onOfferBoarded(payload) {
    if (payload.source !== 'careerContract') return false;
    const own = ensureCareerContractState(this.state);
    const contractId = this._pending.get(payload.offerId)
      || Object.keys(own.runs).find((id) => own.runs[id].fingerprint === payload.causeFingerprint);
    const run = contractId && own.runs[contractId];
    if (!run) return false;
    run.status = RUN_STATUS.OFFERED;
    run.offerId = payload.offerId || null;
    run.fingerprint = payload.causeFingerprint || null;
    const def = CAREER_CONTRACT_BY_ID[contractId];
    const offer = def && buildCareerContractOffer(this.state, def, run);
    run.boundAftermathFingerprint = offer?.cause?.aftermathFingerprint || run.boundAftermathFingerprint || null;
    this._pending.delete(payload.offerId);
    return true;
  },

  _findRun(payload) {
    const own = ensureCareerContractState(this.state);
    return Object.values(own.runs).find((run) => (
      (payload.missionId && run.missionId === payload.missionId)
      || (payload.causeFingerprint && run.fingerprint === payload.causeFingerprint)
    )) || null;
  },

  _onMissionAccepted(payload) {
    if (payload.source !== 'careerContract') return false;
    const run = this._findRun(payload);
    if (!run) return false;
    run.status = RUN_STATUS.ACTIVE;
    run.missionId = payload.missionId || null;
    return true;
  },

  _settle(payload, completed) {
    if (payload.source !== 'careerContract' || !payload.missionId) return false;
    const own = ensureCareerContractState(this.state);
    if (own.settledMissionIds.includes(String(payload.missionId))) return false;
    const run = this._findRun(payload);
    if (!run) return false;
    const def = CAREER_CONTRACT_BY_ID[run.contractId];
    const stage = def?.stages?.[run.stageIndex];
    if (!def || !stage) return false;
    own.settledMissionIds.push(String(payload.missionId));
    if (own.settledMissionIds.length > SETTLED_CAP) own.settledMissionIds.splice(0, own.settledMissionIds.length - SETTLED_CAP);
    const outcome = completed ? 'completed' : 'failed';
    const impulse = completed ? stage.successImpulse : stage.failureImpulse;
    const receipt = {
      id: `${run.fingerprint}:${outcome}:${payload.missionId}`,
      contractId: def.id,
      careerId: def.careerId,
      cycle: run.cycle,
      stageId: stage.id,
      stageIndex: run.stageIndex,
      attempt: run.attempt,
      outcome,
      missionId: String(payload.missionId),
      sectorId: stage.destSectorId,
      regionalFingerprint: getRegionalEcologyProfile(stage.destSectorId)?.fingerprint || null,
      aftermathFingerprint: run.boundAftermathFingerprint || null,
      t: Number(this.state.simTime) || 0,
    };
    own.receipts.push(receipt);
    if (own.receipts.length > RECEIPT_CAP) own.receipts.splice(0, own.receipts.length - RECEIPT_CAP);
    this.bus?.emit?.('sectorsim:impulse', {
      kind: `career_contract:${def.careerId}:${stage.id}:${outcome}`,
      sectorId: stage.destSectorId,
      danger: impulse.danger,
      pricePressure: impulse.pricePressure,
      fingerprint: receipt.id,
    });
    this.bus?.emit?.('careerContract:consequence', clonePlain(receipt));
    run.missionId = null;
    run.offerId = null;
    run.fingerprint = null;
    if (completed) {
      run.completedStages.push(stage.id);
      run.attempt = 0;
      run.stageIndex += 1;
      if (run.stageIndex >= def.stages.length) {
        run.status = RUN_STATUS.COMPLETED;
        run.lastCompletedEpoch = epochOf(this.state);
        this.bus?.emit?.('careerContract:completed', {
          contractId: def.id,
          careerId: def.careerId,
          cycle: run.cycle,
          actor: clonePlain(def.actor),
          skillExpression: def.skillExpression,
          consequence: def.consequence,
          aftermathFingerprint: run.boundAftermathFingerprint || null,
        });
      } else {
        run.status = RUN_STATUS.READY;
      }
    } else {
      run.attempt += 1;
      run.status = RUN_STATUS.RECOVERING;
    }
    return true;
  },

  destroy() {
    for (const off of this._unsubs || []) off();
    this._unsubs = [];
    this._pending?.clear();
  },
};

export default careerContracts;
