// Deterministic receipt builders for Campaign 47-A sidecar.
// Receipts are pure data: same inputs → same receipt ids/payloads.
// Namespaced campaign47a:* only — never encounter:receipt or story:beatAdvanced.

import { hash32 } from '../../core/rng.js';
import {
  CAMPAIGN_EVENTS,
  beatDefAt,
  endingDef,
  outpostSpecDef,
} from './campaignData.js';

/**
 * Stable receipt id from domain fields (not wall clock).
 * @param {string} kind
 * @param {Record<string, unknown>} parts
 */
export function receiptId(kind, parts = {}) {
  const keys = Object.keys(parts).sort();
  const joined = keys.map((k) => `${k}=${String(parts[k])}`).join('&');
  const h = hash32('campaign47a', kind, joined) >>> 0;
  return `receipt:campaign47a:${kind}:${h.toString(16)}`;
}

function campaignReceiptIntent(kind, payload) {
  return {
    event: CAMPAIGN_EVENTS.receipt,
    payload: {
      source: 'campaign47a',
      kind,
      ...payload,
    },
  };
}

/**
 * Strict, read-only validation for the one authored B1 refinery settlement.
 * It never repairs, clamps, or infers feed/loss counts. Old receipts without these
 * fields intentionally remain neutral.
 */
export function normalizeFurnaceSettlement(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)
    || raw.beatIndex !== 1 || raw.stepId !== 'infested'
    || raw.signal !== 'mission:completed'
    || (raw.furnaceStoryTag ?? raw.storyTag) !== 'campaign47a:b1:infested') return null;
  const rawMissionId = raw.furnaceMissionId ?? raw.missionId;
  const missionId = (typeof rawMissionId === 'string' || Number.isSafeInteger(rawMissionId))
    ? String(rawMissionId).trim() : '';
  if (!missionId || missionId.length > 96) return null;
  const feeds = raw.furnaceFeeds;
  const losses = raw.furnaceLosses;
  if (!Number.isInteger(feeds) || feeds < 0 || feeds > 3
    || !Number.isInteger(losses) || losses < 0 || losses > 3
    || feeds + losses !== 3) return null;
  const outcome = feeds === 3 ? 'full_disposal'
    : feeds === 0 ? 'clearance_only_cargo_lost' : 'partial_disposal';
  if (raw.furnaceOutcome !== outcome) return null;
  return {
    furnaceMissionId: missionId,
    furnaceStoryTag: 'campaign47a:b1:infested',
    furnaceFeeds: feeds,
    furnaceLosses: losses,
    furnaceOutcome: outcome,
  };
}

/**
 * Extract only the already-settled result from the authored B1 mission owner.
 * The physical lot ledger and proportional reward must still agree; completion alone
 * is never evidence that a pod reached CR-FEED.
 */
export function furnaceSettlementFromMission(mission, beatIndex = 1, stepId = 'infested', signal = 'mission:completed') {
  const params = mission && mission.params;
  const lots = params && params.furnaceLots;
  const slots = new Set();
  if (!mission || !params || mission.status !== 'completed'
    || mission.storyTag !== 'campaign47a:b1:infested'
    || mission.destSectorId !== 'sector_ceres_belt'
    || params.furnaceWorksiteVersion !== 1 || params.furnaceFeedsNeeded !== 3
    || params.furnaceSettlementAnnounced !== true || !!params.furnaceLedgerInvalid
    || !Array.isArray(lots) || lots.length !== 3
    || !lots.every((lot) => {
      if (!lot || !Number.isInteger(lot.slot) || lot.slot < 0 || lot.slot > 2
        || slots.has(lot.slot) || !(lot.received === true || lot.lost === true)
        || (lot.received === true && lot.lost === true)) return false;
      slots.add(lot.slot);
      return true;
    }) || slots.size !== 3) return null;
  const feeds = lots.filter((lot) => lot.received === true).length;
  const losses = lots.filter((lot) => lot.lost === true && lot.received !== true).length;
  if (feeds !== params.furnaceFeeds || losses !== params.furnaceLosses
    || !Number.isFinite(params.furnaceRewardBase) || params.furnaceRewardBase < 0
    || mission.reward_cr !== Math.floor(params.furnaceRewardBase * feeds / 3)) return null;
  return normalizeFurnaceSettlement({
    missionId: mission.id,
    storyTag: mission.storyTag,
    beatIndex,
    stepId,
    signal,
    furnaceFeeds: params.furnaceFeeds,
    furnaceLosses: params.furnaceLosses,
    furnaceOutcome: params.furnaceOutcome,
  });
}

/**
 * Step progress on the observed canonical beat (no spine advance).
 */
export function buildStepProgressReceipt({
  beatIndex,
  stepId,
  signal,
  completedSteps = [],
  stepsComplete = false,
  simTime = 0,
  attempt = 0,
  physicalVerb = null,
  completionMethod = null,
  assetKind = null,
  missionId = null,
  storyTag = null,
  furnaceSettlement = null,
}) {
  const def = beatDefAt(beatIndex);
  const normalizedFurnace = normalizeFurnaceSettlement({
    ...(furnaceSettlement || {}),
    furnaceMissionId: furnaceSettlement && furnaceSettlement.furnaceMissionId,
    furnaceStoryTag: furnaceSettlement && furnaceSettlement.furnaceStoryTag,
    beatIndex,
    stepId,
    signal,
  });
  const furnaceContextMatches = normalizedFurnace
    && (missionId == null || normalizedFurnace.furnaceMissionId === String(missionId))
    && (storyTag == null || normalizedFurnace.furnaceStoryTag === storyTag);
  const furnace = furnaceContextMatches ? {
    furnaceMissionId: normalizedFurnace.furnaceMissionId,
    furnaceStoryTag: normalizedFurnace.furnaceStoryTag,
    furnaceFeeds: normalizedFurnace.furnaceFeeds,
    furnaceLosses: normalizedFurnace.furnaceLosses,
    furnaceOutcome: normalizedFurnace.furnaceOutcome,
  } : null;
  const id = receiptId('step_progress', {
    beat: beatIndex,
    step: stepId || '',
    signal: signal || '',
    attempt,
    t: Math.floor(Number(simTime) || 0),
  });
  return {
    id,
    kind: 'step_progress',
    atSimTime: Number(simTime) || 0,
    beatIndex,
    beatId: def ? def.id : null,
    stepId,
    signal,
    physicalVerb: physicalVerb || null,
    completionMethod: typeof completionMethod === 'string' ? completionMethod : null,
    assetKind: assetKind === 'drone' || assetKind === 'trader' || assetKind === 'outpost' ? assetKind : null,
    completedSteps: completedSteps.slice(),
    stepsComplete: !!stepsComplete,
    attempt,
    ...(furnace || {}),
    intents: [
      {
        event: CAMPAIGN_EVENTS.stepProgress,
        payload: {
          beatIndex,
          stepId,
          signal,
          physicalVerb: physicalVerb || null,
          completedSteps: completedSteps.slice(),
          stepsComplete: !!stepsComplete,
          atSimTime: Number(simTime) || 0,
          ...(furnace || {}),
        },
      },
      campaignReceiptIntent('step_progress', {
        beatIndex,
        stepId,
        signal,
        physicalVerb: physicalVerb || null,
        stepsComplete: !!stepsComplete,
        atSimTime: Number(simTime) || 0,
        ...(furnace || {}),
      }),
    ],
  };
}

/**
 * Recognized live branch-intro acceptance (story.branch_intro + live type).
 */
export function buildBranchIntroAcceptReceipt({
  branch,
  missionType,
  storyTag,
  factionId = null,
  simTime = 0,
  attempt = 0,
  physicalVerb = null,
}) {
  const id = receiptId('branch_intro_accept', {
    branch: branch || '',
    type: missionType || '',
    tag: storyTag || '',
    attempt,
    t: Math.floor(Number(simTime) || 0),
  });
  return {
    id,
    kind: 'branch_intro_accept',
    atSimTime: Number(simTime) || 0,
    beatIndex: 4,
    branch,
    missionType,
    storyTag,
    factionId,
    physicalVerb: physicalVerb || null,
    attempt,
    intents: [
      campaignReceiptIntent('branch_intro_accept', {
        beatIndex: 4,
        branch,
        missionType,
        storyTag,
        factionId,
        physicalVerb: physicalVerb || null,
        atSimTime: Number(simTime) || 0,
      }),
    ],
  };
}

/**
 * Chain completion observation (uses live chain counts; no beat advance).
 */
export function buildChainProgressReceipt({
  branch,
  chainProgress,
  chainTarget,
  complete = false,
  simTime = 0,
  attempt = 0,
  missionType = null,
  physicalVerb = null,
}) {
  const id = receiptId('chain_progress', {
    branch: branch || '',
    progress: chainProgress,
    target: chainTarget,
    complete: complete ? 1 : 0,
    attempt,
    t: Math.floor(Number(simTime) || 0),
  });
  return {
    id,
    kind: 'chain_progress',
    atSimTime: Number(simTime) || 0,
    beatIndex: 5,
    branch,
    chainProgress,
    chainTarget,
    complete: !!complete,
    missionType,
    physicalVerb: physicalVerb || null,
    attempt,
    intents: [
      campaignReceiptIntent('chain_progress', {
        beatIndex: 5,
        branch,
        chainProgress,
        chainTarget,
        complete: !!complete,
        missionType,
        physicalVerb: physicalVerb || null,
        atSimTime: Number(simTime) || 0,
      }),
    ],
  };
}

export function buildEncounterFailReceipt({
  beatIndex,
  reason = 'failed',
  simTime = 0,
  attempt = 0,
  encounterId = null,
  failedMethod = null,
}) {
  const def = beatDefAt(beatIndex);
  const id = receiptId('encounter_fail', {
    beat: beatIndex,
    reason,
    attempt,
    encounterId: encounterId || '',
    t: Math.floor(Number(simTime) || 0),
  });
  return {
    id,
    kind: 'encounter_fail',
    atSimTime: Number(simTime) || 0,
    beatIndex,
    beatId: def ? def.id : null,
    reason,
    attempt,
    encounterId,
    failedMethod: typeof failedMethod === 'string' ? failedMethod : null,
    recovery: def ? def.recovery : null,
    intents: [
      {
        event: CAMPAIGN_EVENTS.beatFailed,
        payload: {
          beatIndex,
          reason,
          attempt,
          encounterId,
          atSimTime: Number(simTime) || 0,
        },
      },
      campaignReceiptIntent('encounter_fail', {
        beatIndex,
        reason,
        attempt,
        encounterId,
        atSimTime: Number(simTime) || 0,
      }),
    ],
  };
}

export function buildEncounterRecoverReceipt({
  beatIndex,
  simTime = 0,
  attempt = 0,
  previousFailures = 0,
}) {
  const def = beatDefAt(beatIndex);
  const id = receiptId('encounter_recover', {
    beat: beatIndex,
    attempt,
    prev: previousFailures,
    t: Math.floor(Number(simTime) || 0),
  });
  return {
    id,
    kind: 'encounter_recover',
    atSimTime: Number(simTime) || 0,
    beatIndex,
    beatId: def ? def.id : null,
    attempt,
    previousFailures,
    recoveryLine: def && def.recovery ? def.recovery.line : null,
    intents: [
      {
        event: CAMPAIGN_EVENTS.beatRecovered,
        payload: {
          beatIndex,
          attempt,
          atSimTime: Number(simTime) || 0,
        },
      },
      campaignReceiptIntent('encounter_recover', {
        beatIndex,
        attempt,
        previousFailures,
        atSimTime: Number(simTime) || 0,
      }),
    ],
  };
}

/** Pure descriptor receipt for ending data (never applies consequences). */
export function buildEndingDescriptorReceipt({
  endingId,
  simTime = 0,
  declined = [],
}) {
  const def = endingDef(endingId);
  const id = receiptId('ending_descriptor', {
    ending: endingId,
    declined: (declined || []).join(','),
    t: Math.floor(Number(simTime) || 0),
  });
  return {
    id,
    kind: 'ending_descriptor',
    atSimTime: Number(simTime) || 0,
    endingId,
    endingKey: def ? def.key : null,
    declined: (declined || []).slice(),
    sandbox: def ? { ...def.sandbox } : null,
    consequenceDescriptors: def ? def.consequenceDescriptors : null,
    loopBackIntent: def ? def.loopBackIntent : null,
    intents: [
      campaignReceiptIntent('ending_descriptor', {
        endingId,
        atSimTime: Number(simTime) || 0,
        note: 'descriptor_only_not_applied',
      }),
    ],
    meta: {
      title: def ? def.title : null,
      kind: def ? def.kind : null,
      postLoop: def ? def.postLoop : null,
    },
  };
}

export function buildOutpostSpecReceipt({
  specializationId,
  simTime = 0,
  observedBeatIndex = 6,
}) {
  const def = outpostSpecDef(specializationId);
  const canonicalSpecId = def ? def.id : specializationId;
  const id = receiptId('outpost_spec', {
    spec: canonicalSpecId,
    t: Math.floor(Number(simTime) || 0),
  });
  return {
    id,
    kind: 'outpost_spec',
    atSimTime: Number(simTime) || 0,
    observedBeatIndex,
    specializationId: canonicalSpecId,
    claimSpecId: canonicalSpecId,
    outpostDefId: def ? def.outpostDefId : null,
    role: def ? def.role : null,
    consequenceFlags: def ? def.consequenceFlags.slice() : [],
    intents: [
      {
        event: CAMPAIGN_EVENTS.outpostTagged,
        payload: {
          specializationId: canonicalSpecId,
          claimSpecId: canonicalSpecId,
          outpostDefId: def ? def.outpostDefId : null,
          observedBeatIndex,
          atSimTime: Number(simTime) || 0,
        },
      },
      campaignReceiptIntent('outpost_spec', {
        specializationId: canonicalSpecId,
        claimSpecId: canonicalSpecId,
        outpostDefId: def ? def.outpostDefId : null,
        atSimTime: Number(simTime) || 0,
      }),
    ],
  };
}

/** Pure equality check for deterministic receipt replay tests. */
export function receiptsEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
