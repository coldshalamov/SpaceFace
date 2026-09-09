// Branching post-ending replay chains. Owns only state.missions.postEndingReplay.
// Normal missions own boards/objectives/payouts; sectorSim owns persistent regional impulses.

import { hash32 } from '../core/rng.js';
import {
  POST_ENDING_REPLAY_SCHEMA_VERSION,
  POST_ENDING_REPLAY_SOURCE,
  postEndingReplayChain,
} from '../data/postEndingReplayChains.js';
import { getRegionalEcologyProfile } from '../data/regionalEcology.js';
import { normalizePostEndingContinuity } from '../story/endings/resolve.js';

const REFRESH_SECONDS = 600;
const RECEIPT_CAP = 48;
const SETTLED_CAP = 64;
const STATUS = Object.freeze({ READY: 'ready', OFFERED: 'offered', ACTIVE: 'active', RECOVERING: 'recovering', COMPLETED: 'completed' });

function clonePlain(value) { return JSON.parse(JSON.stringify(value == null ? null : value)); }
function seedOf(state) { return ((state?.meta?.seed ?? state?.seed ?? 1) >>> 0) || 1; }
function epochOf(state) {
  const refresh = Number(state?.missions?.config?.refreshSec) || REFRESH_SECONDS;
  return Math.floor((Number(state?.simTime) || 0) / refresh);
}

function unlockedChoice(state) {
  const rec = normalizePostEndingContinuity(state?.story?.postEnding);
  return rec?.status === 'complete' && rec?.replayHookId ? rec.choiceId : null;
}

function freshState(chain) {
  return {
    schemaVersion: POST_ENDING_REPLAY_SCHEMA_VERSION,
    choiceId: chain.choiceId,
    chainId: chain.id,
    replayHookId: chain.replayHookId,
    cycle: 0,
    stageIndex: 0,
    branchId: null,
    status: STATUS.READY,
    attempt: 0,
    offerId: null,
    missionId: null,
    fingerprint: null,
    lastCompletedEpoch: -1,
    completedStageIds: [],
    settledMissionIds: [],
    receipts: [],
    worldFlags: {},
  };
}

function normalizeState(chain, raw) {
  const base = freshState(chain);
  if (!raw || typeof raw !== 'object' || raw.chainId !== chain.id) return base;
  const branchIds = new Set(chain.branches.map((option) => option.id));
  const status = Object.values(STATUS).includes(raw.status) ? raw.status : base.status;
  return {
    ...base,
    ...raw,
    schemaVersion: POST_ENDING_REPLAY_SCHEMA_VERSION,
    choiceId: chain.choiceId,
    chainId: chain.id,
    replayHookId: chain.replayHookId,
    cycle: Math.max(0, Math.floor(Number(raw.cycle) || 0)),
    stageIndex: Math.max(0, Math.min(3, Math.floor(Number(raw.stageIndex) || 0))),
    branchId: branchIds.has(raw.branchId) ? raw.branchId : null,
    status,
    attempt: Math.max(0, Math.floor(Number(raw.attempt) || 0)),
    offerId: raw.offerId == null ? null : String(raw.offerId),
    missionId: raw.missionId == null ? null : String(raw.missionId),
    fingerprint: raw.fingerprint == null ? null : String(raw.fingerprint),
    lastCompletedEpoch: Number.isFinite(raw.lastCompletedEpoch) ? Math.floor(raw.lastCompletedEpoch) : -1,
    completedStageIds: Array.isArray(raw.completedStageIds) ? raw.completedStageIds.map(String).slice(-12) : [],
    settledMissionIds: [...new Set(Array.isArray(raw.settledMissionIds) ? raw.settledMissionIds.map(String) : [])].slice(-SETTLED_CAP),
    receipts: Array.isArray(raw.receipts) ? raw.receipts.filter((item) => item?.missionId).slice(-RECEIPT_CAP) : [],
    worldFlags: raw.worldFlags && typeof raw.worldFlags === 'object' && !Array.isArray(raw.worldFlags)
      ? clonePlain(raw.worldFlags) : {},
  };
}

export function ensurePostEndingReplayState(state) {
  const choiceId = unlockedChoice(state);
  const chain = choiceId && postEndingReplayChain(choiceId);
  if (!chain) return null;
  if (!state.missions || typeof state.missions !== 'object') state.missions = {};
  const current = state.missions.postEndingReplay;
  const normalized = normalizeState(chain, current);
  if (current && typeof current === 'object' && !Array.isArray(current) && current.chainId === chain.id) {
    for (const key of Object.keys(current)) delete current[key];
    Object.assign(current, normalized);
  } else {
    state.missions.postEndingReplay = normalized;
  }
  return state.missions.postEndingReplay;
}

function branchById(chain, branchId) {
  return chain?.branches?.find((option) => option.id === branchId) || null;
}

function stageDescriptor(chain, run, branchHint = null) {
  if (!chain || !run) return null;
  if (run.stageIndex === 0) return { stage: chain.opening, branch: null, phase: 'opening' };
  const branch = branchById(chain, branchHint || run.branchId);
  if (!branch) return null;
  if (run.stageIndex === 1) return { stage: branch.mission, branch, phase: 'choice' };
  if (run.stageIndex === 2) return { stage: branch.finale, branch, phase: 'finale' };
  return null;
}

function scaledParams(params, cycle) {
  const out = clonePlain(params || {});
  const scale = 1 + (cycle % 3) * 0.12;
  for (const key of ['qty', 'clearCount', 'scanTargets']) {
    if (Number.isFinite(out[key])) out[key] = Math.max(1, Math.round(out[key] * scale));
  }
  if (Number.isFinite(out.targetStrength)) out.targetStrength = Math.round((out.targetStrength + (cycle % 3) * 0.06) * 100) / 100;
  out.taskTime = Number.isFinite(out.taskTime) ? out.taskTime : 35;
  out.fValue = Number.isFinite(out.fValue) ? out.fValue : (out.targetStrength || 1);
  return out;
}

export function buildPostEndingReplayOffer(state, branchHint = null) {
  const run = ensurePostEndingReplayState(state);
  if (!run) return null;
  const chain = postEndingReplayChain(run.choiceId);
  const descriptor = stageDescriptor(chain, run, branchHint);
  if (!descriptor) return null;
  const { stage, branch, phase } = descriptor;
  const ecology = getRegionalEcologyProfile(stage.destSectorId);
  if (!ecology) return null;
  const suffix = hash32(
    seedOf(state), 'post-ending-replay-v1', chain.id, run.cycle, run.stageIndex,
    branch?.id || 'opening', run.attempt, ecology.fingerprint,
  ).toString(36);
  const fingerprint = `per_${chain.id}_${run.cycle}_${run.stageIndex}_${branch?.id || 'opening'}_${run.attempt}_${suffix}`;
  const attemptMult = Math.max(0.70, 1 - run.attempt * 0.10);
  const cycleMult = 1 + (run.cycle % 4) * 0.07;
  const rewardCr = Math.max(1, Math.round(stage.rewardCr * attemptMult * cycleMult * (1 + ecology.danger.baseline * 0.12)));
  const collateralCr = Math.max(0, Math.round(stage.collateralCr * Math.max(0.50, 1 - run.attempt * 0.15)));
  const choiceLine = branch ? ` Choice: ${branch.label}. Tradeoff: ${branch.tradeoff}` : '';
  const summary = `${chain.actor.name}: ${chain.actor.motive} ${stage.instruction}${choiceLine} Failure: ${stage.failureText} Recovery: ${stage.recoveryText}`;
  return {
    id: `offer_${fingerprint}`,
    source: POST_ENDING_REPLAY_SOURCE,
    type: stage.type,
    stationId: stage.boardStationId,
    factionId: stage.factionId,
    minRep: -149,
    riskTier: Math.max(0, Math.min(4, stage.riskTier + Math.floor(run.cycle / 5))),
    reward_cr: rewardCr,
    collateral_cr: collateralCr,
    title: `${chain.title} ${run.stageIndex + 1}/3 — ${stage.title}`,
    description: summary,
    summary,
    destStationId: stage.destStationId || null,
    destSectorId: stage.destSectorId,
    preloadedCargo: !!stage.preloadedCargo,
    params: scaledParams(stage.params, run.cycle),
    storyTag: `postending.${run.choiceId}:${chain.id}:${run.cycle}:${stage.id}:${branch?.id || 'opening'}`,
    markerId: `post-ending-replay:${chain.id}:${run.cycle}:${stage.id}`,
    mapLabel: stage.instruction,
    cause: {
      fingerprint,
      tag: 'post_ending_replay',
      chainId: chain.id,
      choiceId: run.choiceId,
      replayHookId: chain.replayHookId,
      cycle: run.cycle,
      stageIndex: run.stageIndex,
      stageId: stage.id,
      phase,
      branchId: branch?.id || null,
      branchLabel: branch?.label || null,
      tradeoff: branch?.tradeoff || null,
      durablePremise: chain.durablePremise,
      regionalFingerprint: ecology.fingerprint,
      regionalFamilyId: ecology.familyId,
      regionalResourceKind: ecology.resource.kind,
      instruction: stage.instruction,
      failure: stage.failureText,
      recovery: stage.recoveryText,
      oneTimeReward: false,
    },
  };
}

function boardHasOffer(state, offerId) {
  return Object.values(state?.missions?.boards || {}).some((board) => (
    Array.isArray(board?.slots) && board.slots.some((offer) => offer?.id === offerId)
  ));
}

function activeHasMission(state, missionId, fingerprint) {
  return (state?.missions?.active || []).some((mission) => mission?.status === 'active'
    && ((missionId && mission.id === missionId) || (fingerprint && mission.cause?.fingerprint === fingerprint)));
}

export const postEndingReplay = {
  name: 'postEndingReplay',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this._unsubs = [];
    this._pending = new Map();
    ensurePostEndingReplayState(this.state);
    this._listen('story:replayHookUnlocked', () => this._activate());
    this._listen('dock:docked', (payload) => this._offerAtStation(payload?.stationId));
    this._listen('mission:offerBoarded', (payload) => this._onOfferBoarded(payload || {}));
    this._listen('mission:accepted', (payload) => this._onMissionAccepted(payload || {}));
    this._listen('mission:completed', (payload) => this._settle(payload || {}, true));
    this._listen('mission:failed', (payload) => this._settle(payload || {}, false));
    this._listen('mission:expired', (payload) => this._settle(payload || {}, false));
    this._listen('save:loaded', () => this._resumeAfterLoad());
  },

  _listen(event, fn) {
    if (!this.bus?.on) return;
    const off = this.bus.on(event, fn);
    if (typeof off === 'function') this._unsubs.push(off);
  },

  _activate() {
    const run = ensurePostEndingReplayState(this.state);
    if (!run) return null;
    const chain = postEndingReplayChain(run.choiceId);
    this.bus?.emit?.('postEndingReplay:available', {
      choiceId: run.choiceId,
      chainId: run.chainId,
      title: chain.title,
      openingStationId: chain.opening.boardStationId,
      cycle: run.cycle,
    });
    this._publishRoute('unlocked', run, chain);
    this._offerAtCurrentStation();
    return run;
  },

  _resumeAfterLoad() {
    const run = this._reconcile();
    if (!run) return null;
    const chain = postEndingReplayChain(run.choiceId);
    this._publishRoute('loaded', run, chain);
    this._offerAtCurrentStation();
    return run;
  },

  _offerAtCurrentStation() {
    const stationId = this.state?.ui?.dockedStationId || null;
    return stationId ? this._offerAtStation(stationId) : null;
  },

  _publishRoute(reason, run = ensurePostEndingReplayState(this.state), chain = null) {
    if (!run || !this.bus?.emit) return null;
    const def = chain || postEndingReplayChain(run.choiceId);
    const descriptor = stageDescriptor(def, run, run.branchId);
    const payload = {
      reason,
      choiceId: run.choiceId,
      chainId: run.chainId,
      replayHookId: run.replayHookId,
      title: def?.title || null,
      cycle: run.cycle,
      stageIndex: run.stageIndex,
      status: run.status,
      branchId: run.branchId,
      offerId: run.offerId,
      missionId: run.missionId,
      stationId: descriptor?.stage?.boardStationId || null,
      sectorId: descriptor?.stage?.destSectorId || null,
      stageTitle: descriptor?.stage?.title || null,
      instruction: descriptor?.stage?.instruction || null,
      choices: run.stageIndex === 1 && !run.branchId
        ? def.branches.map((option) => ({
          id: option.id,
          label: option.label,
          tradeoff: option.tradeoff,
          stationId: option.mission.boardStationId,
          sectorId: option.mission.destSectorId,
        }))
        : [],
    };
    this.bus.emit('postEndingReplay:route', clonePlain(payload));
    return payload;
  },

  newGame() {
    if (this.state?.missions) delete this.state.missions.postEndingReplay;
    this._pending?.clear();
  },

  _reconcile() {
    this._pending.clear();
    const run = ensurePostEndingReplayState(this.state);
    if (!run) return null;
    if (run.status === STATUS.OFFERED && !boardHasOffer(this.state, run.offerId)) {
      run.status = STATUS.RECOVERING;
      run.offerId = null;
      run.fingerprint = null;
    }
    if (run.status === STATUS.ACTIVE && !activeHasMission(this.state, run.missionId, run.fingerprint)) {
      run.status = STATUS.RECOVERING;
      run.missionId = null;
      run.offerId = null;
      run.fingerprint = null;
    }
    return run;
  },

  _candidateAtStation(chain, run, stationId) {
    if (run.stageIndex === 0) return chain.opening.boardStationId === stationId ? { branch: null } : null;
    if (run.stageIndex === 1 && !run.branchId) {
      const choices = chain.branches.filter((option) => option.mission.boardStationId === stationId);
      return choices.length ? { branch: choices.sort((a, b) => a.id.localeCompare(b.id))[0] } : null;
    }
    const branch = branchById(chain, run.branchId);
    if (!branch) return null;
    const stage = run.stageIndex === 1 ? branch.mission : run.stageIndex === 2 ? branch.finale : null;
    return stage?.boardStationId === stationId ? { branch } : null;
  },

  _offerAtStation(stationId) {
    if (!stationId || !this.bus?.emit) return null;
    const run = this._reconcile();
    if (!run) return null;
    const chain = postEndingReplayChain(run.choiceId);
    const epoch = epochOf(this.state);
    if (run.status === STATUS.COMPLETED) {
      if (epoch <= run.lastCompletedEpoch) return null;
      const retained = { receipts: run.receipts, settledMissionIds: run.settledMissionIds, worldFlags: run.worldFlags };
      Object.assign(run, freshState(chain), retained, { cycle: run.cycle + 1, lastCompletedEpoch: run.lastCompletedEpoch });
    }
    if (![STATUS.READY, STATUS.RECOVERING].includes(run.status)) return null;
    const candidate = this._candidateAtStation(chain, run, stationId);
    if (!candidate) return null;
    const offer = buildPostEndingReplayOffer(this.state, candidate.branch?.id || null);
    if (!offer) return null;
    this._pending.set(offer.id, offer.cause);
    this.bus.emit('mission:offered', offer);
    if (run.status !== STATUS.OFFERED) this._pending.delete(offer.id);
    return offer;
  },

  _onOfferBoarded(payload) {
    if (payload.source !== POST_ENDING_REPLAY_SOURCE) return false;
    const run = ensurePostEndingReplayState(this.state);
    const cause = this._pending.get(payload.offerId);
    if (!run || !cause || cause.fingerprint !== payload.causeFingerprint) return false;
    run.status = STATUS.OFFERED;
    run.offerId = payload.offerId;
    run.fingerprint = cause.fingerprint;
    this._pending.delete(payload.offerId);
    this._publishRoute('offered', run);
    return true;
  },

  _onMissionAccepted(payload) {
    if (payload.source !== POST_ENDING_REPLAY_SOURCE) return false;
    const run = ensurePostEndingReplayState(this.state);
    if (!run || run.fingerprint !== payload.causeFingerprint) return false;
    const offerCause = (this.state.missions.active || []).find((mission) => mission?.id === payload.missionId)?.cause;
    const pendingCause = offerCause || null;
    if (run.stageIndex === 1 && !run.branchId && pendingCause?.branchId) run.branchId = pendingCause.branchId;
    // Headless/minimal mission harnesses may not expose active cause. The fingerprint encodes the
    // branch and the current chain has unique branch ids, so recover it deterministically.
    if (run.stageIndex === 1 && !run.branchId) {
      const chain = postEndingReplayChain(run.choiceId);
      const branch = chain.branches.find((option) => run.fingerprint.includes(`_${option.id}_`));
      if (branch) run.branchId = branch.id;
    }
    if (run.stageIndex === 1 && !run.branchId) return false;
    run.status = STATUS.ACTIVE;
    run.missionId = payload.missionId || null;
    this._publishRoute('accepted', run);
    return true;
  },

  _settle(payload, completed) {
    if (payload.source !== POST_ENDING_REPLAY_SOURCE || !payload.missionId) return false;
    const run = ensurePostEndingReplayState(this.state);
    if (!run || run.settledMissionIds.includes(String(payload.missionId))) return false;
    if (run.missionId !== payload.missionId && run.fingerprint !== payload.causeFingerprint) return false;
    const chain = postEndingReplayChain(run.choiceId);
    const descriptor = stageDescriptor(chain, run, run.branchId);
    if (!descriptor) return false;
    const { stage, branch } = descriptor;
    run.settledMissionIds.push(String(payload.missionId));
    if (run.settledMissionIds.length > SETTLED_CAP) run.settledMissionIds.splice(0, run.settledMissionIds.length - SETTLED_CAP);
    const outcome = completed ? 'completed' : 'failed';
    const receipt = {
      id: `${run.fingerprint}:${outcome}:${payload.missionId}`,
      choiceId: run.choiceId,
      chainId: run.chainId,
      replayHookId: run.replayHookId,
      cycle: run.cycle,
      stageIndex: run.stageIndex,
      stageId: stage.id,
      branchId: branch?.id || run.branchId,
      outcome,
      missionId: String(payload.missionId),
      t: Number(this.state.simTime) || 0,
      oneTimeRewardGranted: false,
    };
    run.receipts.push(receipt);
    if (run.receipts.length > RECEIPT_CAP) run.receipts.splice(0, run.receipts.length - RECEIPT_CAP);
    this.bus?.emit?.('postEndingReplay:stageSettled', clonePlain(receipt));
    run.missionId = null;
    run.offerId = null;
    run.fingerprint = null;
    if (!completed) {
      run.status = STATUS.RECOVERING;
      run.attempt += 1;
      this._publishRoute('recovering', run, chain);
      this._offerAtCurrentStation();
      return true;
    }
    run.completedStageIds.push(stage.id);
    run.attempt = 0;
    run.stageIndex += 1;
    if (run.stageIndex === 1) {
      run.status = STATUS.READY;
      this.bus?.emit?.('postEndingReplay:choiceAvailable', {
        choiceId: run.choiceId,
        chainId: run.chainId,
        prompt: chain.choicePrompt,
        options: chain.branches.map((option) => ({
          id: option.id,
          label: option.label,
          tradeoff: option.tradeoff,
          stationId: option.mission.boardStationId,
        })),
      });
      this._publishRoute('choice', run, chain);
      this._offerAtCurrentStation();
      return true;
    }
    if (run.stageIndex < 3) {
      run.status = STATUS.READY;
      this._publishRoute('advanced', run, chain);
      this._offerAtCurrentStation();
      return true;
    }
    const finalBranch = branchById(chain, run.branchId);
    if (!finalBranch) return false;
    run.status = STATUS.COMPLETED;
    run.lastCompletedEpoch = epochOf(this.state);
    const flag = finalBranch.consequence.worldFlag;
    const prior = run.worldFlags[flag] || { count: 0 };
    run.worldFlags[flag] = {
      count: (prior.count | 0) + 1,
      cycle: run.cycle,
      completedAtS: Number(this.state.simTime) || 0,
      sectorId: finalBranch.consequence.sectorId,
    };
    const consequenceId = `postending:${run.chainId}:${run.cycle}:${run.branchId}`;
    this.bus?.emit?.('sectorsim:impulse', {
      kind: `post_ending_replay:${run.choiceId}:${run.branchId}`,
      sectorId: finalBranch.consequence.sectorId,
      danger: finalBranch.consequence.danger,
      pricePressure: finalBranch.consequence.pricePressure,
      fingerprint: consequenceId,
    });
    this.bus?.emit?.('postEndingReplay:cycleCompleted', {
      id: consequenceId,
      choiceId: run.choiceId,
      chainId: run.chainId,
      replayHookId: run.replayHookId,
      cycle: run.cycle,
      branchId: run.branchId,
      consequence: clonePlain(finalBranch.consequence),
      oneTimeRewardGranted: false,
    });
    this._publishRoute('cycle_completed', run, chain);
    return true;
  },

  serialize() {
    const run = ensurePostEndingReplayState(this.state);
    return run ? clonePlain(run) : null;
  },

  deserialize(data) {
    if (!this.state.missions || typeof this.state.missions !== 'object') this.state.missions = {};
    this.state.missions.postEndingReplay = data ? clonePlain(data) : null;
    return this._reconcile();
  },

  destroy() {
    for (const off of this._unsubs || []) off();
    this._unsubs = [];
    this._pending?.clear();
  },
};

export default postEndingReplay;
