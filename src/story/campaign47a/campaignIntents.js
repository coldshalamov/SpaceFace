// Descriptor builders for Campaign 47-A sidecar (M5 task 1).
// Pure data only: describes live-compatible payloads and ending consequences.
// Never mutates player credits/rep/cargo/heat. Never emits story:beatAdvanced,
// economy:grantCredits, encounter:receipt, toast, or mission:offered as production.

import {
  BRANCH_CHAIN,
  BRANCH_FACTION,
  BRANCH_IDS,
  BRANCH_OPPOSING,
  STORY_BRANCH_INTRO_TAG,
  STORY_BRANCH_INTROS,
  beatDefAt,
  branchIntroDef,
  endingDef,
  outpostSpecDef,
} from './campaignData.js';

/**
 * Live-compatible branch intro offer shape (data only — not board injection).
 * Matches missions isStoryBranchIntroOffer: storyTag + bulk_trade|patrol_clear|smuggling_run.
 */
export function describeBranchIntroOffer(branch) {
  const intro = branchIntroDef(branch);
  if (!intro) return null;
  return {
    storyTag: STORY_BRANCH_INTRO_TAG,
    type: intro.type,
    factionId: intro.factionId,
    branch: intro.branch,
    source: 'campaign47a:descriptor',
    campaignBeat: 4,
    note: 'Adapter must inject via missions board path — mission:offered does not populate boards',
  };
}

/** All three live branch intro descriptors. */
export function describeAllBranchIntroOffers() {
  return STORY_BRANCH_INTROS.map((intro) => describeBranchIntroOffer(intro.branch));
}

/**
 * Live B4 opposing rep map (single opposing faction) — descriptor for adapter.
 */
export function describeBranchRepDeltas(branch) {
  if (!BRANCH_IDS.includes(branch)) return null;
  const chosen = BRANCH_FACTION[branch];
  const opposing = BRANCH_OPPOSING[branch];
  return {
    chosen: chosen
      ? { factionId: chosen, delta: 15, reason: 'story_branch_chosen' }
      : null,
    opposing: opposing
      ? { factionId: opposing, delta: -10, reason: 'story_branch_opposing' }
      : null,
    note: 'Live missions.js applies these; sidecar does not emit faction:repDelta',
  };
}

/**
 * Live chain mission type/count for a branch (descriptor only).
 */
export function describeChainRequirement(branch) {
  const chain = BRANCH_CHAIN[branch];
  if (!chain) return null;
  return {
    branch,
    missionType: chain.missionType,
    count: chain.count,
    label: chain.label,
    factionId: BRANCH_FACTION[branch] || null,
    note: 'missions.js owns chainProgress and beat advance',
  };
}

/**
 * Documentation of live beat reward shape — NOT production intents.
 * Adapter / missions own actual economy:grantCredits / faction:repDelta.
 */
export function describeBeatRewardDoc(beatIndex) {
  const def = beatDefAt(beatIndex);
  if (!def || !def.rewardDoc) return null;
  return {
    beatIndex,
    beatId: def.id,
    ...def.rewardDoc,
    note: 'descriptor_only — missions owns live beat rewards',
  };
}

/**
 * Ending consequence descriptors for later adapter.
 * Includes Ending A: SCN +700, MTS +100, heat:clear intent descriptor.
 * Ending C: loopBack intent declaration.
 * Never applies effects.
 */
export function describeEndingConsequences(endingId) {
  const def = endingDef(endingId);
  if (!def) return null;
  return {
    endingId,
    key: def.key,
    title: def.title,
    sandbox: { ...def.sandbox },
    requires: def.requires,
    consequences: def.consequenceDescriptors
      ? {
          rep: (def.consequenceDescriptors.rep || []).map((r) => ({ ...r })),
          credits: def.consequenceDescriptors.credits || 0,
          creditReason: def.consequenceDescriptors.creditReason || null,
          heat: def.consequenceDescriptors.heat
            ? { ...def.consequenceDescriptors.heat }
            : null,
          flags: (def.consequenceDescriptors.flags || []).slice(),
        }
      : null,
    loopBackIntent: def.loopBackIntent ? { ...def.loopBackIntent } : null,
    applied: false,
    note: 'descriptor_only — story.js / heat.js / economy / factions own application',
  };
}

/** Outpost deploy observation shape (automation remains sole deployer). */
export function describeOutpostDeployObserve(specializationId) {
  const def = outpostSpecDef(specializationId);
  if (!def) return null;
  return {
    ...def.deployObserve,
    source: 'campaign47a:descriptor',
    note: 'automation emits asset:deployed; sidecar only tags specialization',
  };
}

/**
 * True if a mission payload is a recognized live branch-intro offer.
 * Mirrors missions isStoryBranchIntroOffer contract (storyTag + type).
 */
export function isLiveBranchIntroPayload(payload = {}) {
  if (!payload || typeof payload !== 'object') return false;
  const tag = payload.storyTag;
  if (tag !== STORY_BRANCH_INTRO_TAG && tag !== 4 && tag !== '4') return false;
  const type = payload.type;
  const liveTypes = STORY_BRANCH_INTROS.map((i) => i.type);
  if (!liveTypes.includes(type)) return false;
  if (payload.branch && !BRANCH_IDS.includes(payload.branch)) return false;
  return true;
}

/**
 * Infer branch from a live intro payload.
 */
export function inferBranchFromIntroPayload(payload = {}) {
  if (payload.branch && BRANCH_IDS.includes(payload.branch)) return payload.branch;
  const byType = STORY_BRANCH_INTROS.find((i) => i.type === payload.type);
  if (byType) return byType.branch;
  if (payload.factionId === 'faction_mts') return 'traders';
  if (payload.factionId === 'faction_scn') return 'patrol';
  if (payload.factionId === 'faction_free') return 'free';
  return null;
}
