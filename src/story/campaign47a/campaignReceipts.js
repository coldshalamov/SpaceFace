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
}) {
  const def = beatDefAt(beatIndex);
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
    completedSteps: completedSteps.slice(),
    stepsComplete: !!stepsComplete,
    attempt,
    intents: [
      {
        event: CAMPAIGN_EVENTS.stepProgress,
        payload: {
          beatIndex,
          stepId,
          signal,
          completedSteps: completedSteps.slice(),
          stepsComplete: !!stepsComplete,
          atSimTime: Number(simTime) || 0,
        },
      },
      campaignReceiptIntent('step_progress', {
        beatIndex,
        stepId,
        signal,
        stepsComplete: !!stepsComplete,
        atSimTime: Number(simTime) || 0,
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
    attempt,
    intents: [
      campaignReceiptIntent('branch_intro_accept', {
        beatIndex: 4,
        branch,
        missionType,
        storyTag,
        factionId,
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
    attempt,
    intents: [
      campaignReceiptIntent('chain_progress', {
        beatIndex: 5,
        branch,
        chainProgress,
        chainTarget,
        complete: !!complete,
        missionType,
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
