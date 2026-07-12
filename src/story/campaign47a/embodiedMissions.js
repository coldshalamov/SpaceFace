// Physical/default-route embodiment for Campaign 47-A.
// Pure data and builders only: missions owns boards/cursor/rewards, story owns overlay/endings,
// encounterDirector owns encounters, and aftermathWrecks owns battle residue.

import { hash32 } from '../../core/rng.js';
import {
  BRANCH_CHAIN,
  BRANCH_FACTION,
  BRANCH_IDS,
  CAMPAIGN_BEATS,
  ENDGAME_NET_WORTH_CR,
  ENDGAME_REP_MIN,
  ENDINGS,
  FAIL_RECOVERY_COOLDOWN_S,
  STORY_BRANCH_INTRO_TAG,
} from './campaignData.js';

export const EMBODIED_MISSIONS_ID = 'campaign47a.embodiedMissions.v2';
export const EMBODIED_MISSIONS_SCHEMA_VERSION = 2;
export const STORY_CONTRACT_PREFIX = 'campaign47a:';
export const AFTERMATH_RECORD_KIND = 'battle_wreck';

export const CANONICAL_CONTACT_SIGNALS = Object.freeze([
  'mining:yield', 'dock:docked', 'economy:tradeCompleted', 'scan:completed',
  'tether:reel', 'entity:killed',
  'ship:purchased', 'mission:accepted', 'mission:completed', 'mission:failed',
  'mission:offered', 'asset:deployed', 'encounter:spawned', 'encounter:resolved',
]);

export const CANONICAL_INTENT_EVENTS = Object.freeze([
  'economy:grantCredits', 'economy:chargeCredits', 'faction:repDelta', 'heat:clear',
  'sectorsim:impulse',
]);

export const NAMED_CAPTAIN_IDS = Object.freeze([
  'cap_sable_iask', 'cap_redcut_sorrel', 'cap_vane_ash',
]);
export const ENCOUNTER_SHAPE_IDS = Object.freeze(['named_hunter']);
export const CAREER_IDS = Object.freeze(['hauler', 'hunter', 'prospector']);

const B = (value) => Object.freeze(value);
const BIGGER_BOAT_ROUTES = B({
  custody: B({
    id: 'evidence_warrant', stationId: 'station_helios', sectorId: 'sector_helios_prime',
    label: 'Helios Evidence Yard',
    instruction: 'Dock at Helios; buy a tier-two hull under the evidence warrant',
  }),
  force: B({
    id: 'combat_refit', stationId: 'station_tethys', sectorId: 'sector_tethys_junction',
    label: 'Tethys Refit Yard',
    instruction: "Dock at Tethys; buy a tier-two hull from Slate's yard",
  }),
});
const PICK_SIDE_STAKES = B({
  custody: B({
    id: 'evidence_patrol', branch: 'patrol', factionId: 'faction_scn', type: 'patrol_clear',
    stationId: 'station_coalition', sectorId: 'sector_helios_prime', label: 'Coalition Evidence Patrol',
    instruction: 'Accept and complete the Coalition evidence patrol',
  }),
  force: B({
    id: 'manifest_charter', branch: 'traders', factionId: 'faction_mts', type: 'bulk_trade',
    stationId: 'station_tethys', sectorId: 'sector_tethys_junction', label: 'Meridian Liability Charter',
    instruction: 'Accept and complete the Meridian liability charter',
  }),
});

export const EMBODIED_MISSIONS = Object.freeze([
  B({
    beat: 0, id: 'cold_start', contactId: 'contact_kessler', contactName: 'Kessler',
    location: B({ sectorId: 'sector_helios_prime', stationId: 'station_helios', fieldId: 'f_helios_starter' }),
    physicalContact: B({ mode: 'ordered_and', steps: B([
      B({ id: 'mine', signal: 'mining:yield', accept: B(['mining:yield', 'mining.yield']) }),
      B({ id: 'dock', signal: 'dock:docked', accept: B(['dock:docked']), requiresPrior: B(['mine']) }),
    ]) }),
    missionBoardContract: null,
    recovery: 'Manifest still open. Sample again, then re-dock Helios.',
    careerIds: B(['prospector']),
  }),
  B({
    beat: 1, id: 'honest_work', contactId: 'contact_kessler', contactName: 'Kessler',
    location: B({ sectorId: 'sector_helios_prime', stationId: 'station_helios', destSectorId: 'sector_tethys_junction', destStationId: 'station_tethys' }),
    physicalContact: B({ mode: 'mission', steps: B([
      B({ id: 'deliver', signal: 'mission:completed', accept: B(['mission:completed']) }),
    ]) }),
    missionBoardContract: B({
      type: 'cargo_delivery', storyTag: 'campaign47a:b1:honest_work',
      title: '47-A FOLLOW-UP — TYCHO VARIANCE', factionId: 'faction_mts',
      stationId: 'station_helios', destStationId: 'station_tethys', destSectorId: 'sector_tethys_junction',
      reward_cr: 600, collateral_cr: 0, riskTier: 0, time_limit_s: 0,
      preloadedCargo: true,
      params: B({ cmdtyId: 'cmdty_alloys', qty: 4, manifestName: 'INDUSTRIAL COMPONENTS', filedAs: 'SURPLUS REDISTRIBUTION — STANDARD', fValue: 1, taskTime: 20 }),
    }),
    recovery: 'Honest work remains posted. Re-accept the Tycho run.',
    careerIds: B(['hauler']),
  }),
  B({
    beat: 2, id: 'first_blood', contactId: 'contact_rook', contactName: 'Rook',
    location: B({ sectorId: 'sector_tethys_junction', stationId: 'station_tethys', destSectorId: 'sector_charon_expanse', destStationId: 'station_expanse', zoneId: 'zone_charon_ambush' }),
    physicalContact: B({ mode: 'ordered_and', steps: B([
      B({ id: 'identify', signal: 'scan:completed', accept: B(['scan:completed', 'entity:killed']) }),
      B({ id: 'resolve', signal: 'tether:reel', accept: B(['tether:reel', 'entity:killed']), requiresPrior: B(['identify']) }),
    ]) }),
    missionBoardContract: B({
      type: 'bounty_hunt', storyTag: 'campaign47a:b2:elroy',
      title: '47-A INVESTIGATION — SECTOR INTERFERENCE', factionId: 'faction_scn',
      stationId: 'station_tethys', destStationId: 'station_expanse', destSectorId: 'sector_charon_expanse',
      reward_cr: 800, collateral_cr: 0, riskTier: 1, time_limit_s: 0,
      params: B({ clearCount: 1, targetStrength: 1.4, fValue: 1.4, taskTime: 60 }),
      storyTarget: B({
        id: 'npc_elroy', name: 'Elroy', label: 'UNKNOWN', archetype: 'reaver_pirate',
        factionId: 'faction_free', zoneId: 'zone_charon_ambush',
        registry: 'CIVILIAN VESSEL — REGISTERED',
        role: 'Pit Engineering, Maintenance Division',
      }),
    }),
    recovery: 'Contact lost. Re-arm the same investigation; the board still pays.',
    careerIds: B(['hunter']),
    aftermath: B({ owner: 'aftermathWrecks', source: 'entity:killed', sectorId: 'sector_charon_expanse', zoneId: 'zone_charon_ambush' }),
  }),
  B({
    beat: 3, id: 'bigger_boat', contactId: 'contact_slate', contactName: 'Slate',
    location: B({ sectorId: 'sector_tethys_junction', stationId: 'station_tethys' }),
    consequenceRoutes: BIGGER_BOAT_ROUTES,
    physicalContact: B({ mode: 'any', steps: B([B({ id: 'ship', signal: 'ship:purchased', accept: B(['ship:purchased']) })]) }),
    missionBoardContract: null, recovery: 'Shipyard remains open. Earn the hull; no soft-lock.',
    careerIds: B(['hauler', 'hunter', 'prospector']),
  }),
  B({
    beat: 4, id: 'pick_a_side', contactId: 'contact_vale', contactName: 'V. Director, Acting',
    location: B({ sectorId: 'sector_helios_prime', stationId: 'station_helios' }),
    consequenceStakes: PICK_SIDE_STAKES,
    physicalContact: B({ mode: 'existing_branch_intro', steps: B([B({ id: 'branch', signal: 'mission:completed', accept: B(['mission:completed']), requireStoryTag: STORY_BRANCH_INTRO_TAG })]) }),
    missionBoardContract: B({ kind: 'existing_branch_intro', storyTag: STORY_BRANCH_INTRO_TAG }),
    recovery: 'Three introductions remain. Choose how you participate.',
    careerIds: B(['hauler', 'hunter', 'prospector']),
  }),
  B({
    beat: 5, id: 'proving_ground', contactId: 'contact_callum', contactName: 'Callum',
    location: B({ sectorId: 'sector_tethys_junction', stationId: 'station_tethys' }),
    physicalContact: B({ mode: 'chain_count', steps: B([B({ id: 'chain', signal: 'mission:completed', accept: B(['mission:completed']), requireChainComplete: true })]) }),
    missionBoardContract: B({ kind: 'branch_chain', storyTag: 'campaign47a:b5' }),
    recovery: 'The next proving leg remains on the board.',
    careerIds: B(['hauler', 'hunter', 'prospector']),
  }),
  B({
    beat: 6, id: 'empire_seed', contactId: 'contact_vale', contactName: 'Director Vale',
    location: B({ sectorId: 'sector_ceres_belt', stationId: 'station_beltout' }),
    physicalContact: B({ mode: 'any', steps: B([B({ id: 'asset', signal: 'asset:deployed', accept: B(['asset:deployed']) })]) }),
    missionBoardContract: null, recovery: 'The plot remains free. Deploy any passive asset.',
    careerIds: B(['hauler', 'hunter', 'prospector']),
  }),
  B({
    beat: 7, id: 'deep_reach', contactId: 'contact_kurtz', contactName: 'Kurtz', observeOnly: true,
    location: B({ sectorId: 'sector_ashfall_reach', stationId: 'station_ashcache', poiId: 'poi_boss' }),
    physicalContact: B({ mode: 'observe', steps: B([]), gate: B({ netWorthCr: ENDGAME_NET_WORTH_CR, repMin: ENDGAME_REP_MIN }) }),
    missionBoardContract: null, recovery: 'The gate remains unmet or deferred. The count continues.',
    careerIds: B(['hauler', 'hunter', 'prospector']),
  }),
]);

export function embodiedMissionAt(beatIndex) {
  const i = Math.floor(Number(beatIndex));
  return Number.isFinite(i) && i >= 0 && i < EMBODIED_MISSIONS.length ? EMBODIED_MISSIONS[i] : null;
}

export function getBiggerBoatRoute(elroyOutcome) {
  const key = elroyOutcome === 'custody' ? 'custody' : 'force';
  return { outcome: key, ...BIGGER_BOAT_ROUTES[key] };
}

export function getPickSideStake(elroyOutcome) {
  const key = elroyOutcome === 'custody' ? 'custody' : 'force';
  return { outcome: key, ...PICK_SIDE_STAKES[key] };
}

export function listEmbodiedMissions() { return EMBODIED_MISSIONS.slice(); }
export function isCanonicalContactSignal(signal) { return CANONICAL_CONTACT_SIGNALS.includes(String(signal || '')); }
export function isCanonicalIntentEvent(eventName) { return CANONICAL_INTENT_EVENTS.includes(String(eventName || '')); }

export function getPhysicalContact(beatIndex) {
  const def = embodiedMissionAt(beatIndex);
  if (!def) return null;
  return {
    beat: def.beat, id: def.id, mode: def.physicalContact.mode, observeOnly: !!def.observeOnly,
    steps: def.physicalContact.steps.map((step) => ({ ...step, accept: [...step.accept], requiresPrior: [...(step.requiresPrior || [])] })),
    gate: def.physicalContact.gate ? { ...def.physicalContact.gate } : null,
  };
}

export function isNextPhysicalContact(beatIndex, signal, completedStepIds = []) {
  const contact = getPhysicalContact(beatIndex);
  if (!contact || contact.observeOnly) return false;
  const done = new Set(completedStepIds || []);
  if (contact.mode === 'ordered_and') {
    const next = contact.steps.find((step) => !done.has(step.id));
    return !!(next && (next.signal === signal || next.accept.includes(signal)));
  }
  return contact.steps.some((step) => !done.has(step.id) && (step.signal === signal || step.accept.includes(signal)));
}

export function getEmbodiedLocation(beatIndex, branch = null, elroyOutcome = null) {
  const def = embodiedMissionAt(beatIndex);
  if (!def) return null;
  const location = { beat: def.beat, ...def.location };
  if (def.beat === 3) Object.assign(location, getBiggerBoatRoute(elroyOutcome));
  if (def.beat === 4) Object.assign(location, getPickSideStake(elroyOutcome));
  if (def.beat === 5 && branch) {
    const branchLocation = {
      traders: { stationId: 'station_tethys', sectorId: 'sector_tethys_junction', destStationId: 'station_ceres', destSectorId: 'sector_ceres_belt' },
      patrol: { stationId: 'station_coalition', sectorId: 'sector_helios_prime', destStationId: 'station_expanse', destSectorId: 'sector_charon_expanse' },
      free: { stationId: 'station_helios', sectorId: 'sector_helios_prime', destStationId: 'station_tethys', destSectorId: 'sector_tethys_junction' },
    }[branch];
    if (branchLocation) Object.assign(location, branchLocation, { branch });
  }
  return location;
}

function stableOfferId(seed, beat, epoch, step, branch) {
  return `mo_47a_b${beat}_${hash32(seed >>> 0, beat, epoch | 0, step | 0, branch || 'none').toString(36)}`;
}

export function buildMissionBoardContract(beatIndex, options = {}) {
  const def = embodiedMissionAt(beatIndex);
  if (!def || !def.missionBoardContract) return null;
  if (def.beat === 4) return { beat: 4, kind: 'existing_branch_intro', storyTag: STORY_BRANCH_INTRO_TAG };
  const seed = (Number(options.seed) >>> 0) || 1;
  const epoch = Math.max(0, Number(options.epoch) | 0);
  if (def.beat === 5) return buildBranchChainOffer(def, seed, epoch, options);
  const base = def.missionBoardContract;
  return {
    ...base,
    id: stableOfferId(seed, def.beat, epoch, 0, null),
    params: { ...base.params },
    storyTarget: base.storyTarget ? { ...base.storyTarget } : null,
    distance: Number(options.distance) || (def.beat === 2 ? 3000 : 1600),
    expiresAtEpoch: epoch + 1,
    campaign47aBeat: def.beat,
    storyContractId: base.storyTag,
    source: 'campaign47a.embodied',
  };
}

function buildBranchChainOffer(def, seed, epoch, options) {
  const branch = options.branch;
  if (!BRANCH_IDS.includes(branch)) return null;
  const chain = BRANCH_CHAIN[branch];
  const step = Math.max(0, Number(options.chainStep) | 0);
  if (!chain || step >= chain.count) return null;
  const loc = getEmbodiedLocation(5, branch);
  const storyTag = `campaign47a:b5:${branch}:${step + 1}`;
  const captain = branch === 'patrol'
    ? [
      { id: 'cap_sable_iask', name: 'Sable Iask', archetype: 'lancer_sniper' },
      { id: 'cap_redcut_sorrel', name: 'Redcut Sorrel', archetype: 'bruiser_brawler' },
    ][step] || null
    : null;
  const params = chain.missionType === 'bulk_trade'
    ? { cmdtyId: 'cmdty_food', qty: 4, fValue: 1, taskTime: 30 }
    : chain.missionType === 'patrol_clear'
      ? { clearCount: 1, targetStrength: 1.8 + step * 0.3, fValue: 1.5, taskTime: 60 }
      : { cmdtyId: 'cmdty_classified_salvage', qty: 1, manifestName: 'ADMINISTRATIVE RECORDS — 3 YEARS / SEALED', fValue: 1.3, taskTime: 30 };
  return {
    id: stableOfferId(seed, 5, epoch, step, branch),
    type: chain.missionType,
    storyTag,
    storyContractId: storyTag,
    storyBranch: branch,
    factionId: BRANCH_FACTION[branch],
    stationId: loc.stationId,
    destStationId: loc.destStationId,
    destSectorId: loc.destSectorId,
    reward_cr: 900 + step * 250,
    collateral_cr: 0,
    riskTier: 2,
    time_limit_s: 0,
    distance: 2200,
    params,
    title: branch === 'traders' ? `PROVING GROUND — LEDGER RUN ${step + 1}/${chain.count}`
      : branch === 'patrol' ? `PROVING GROUND — ${captain ? captain.name.toUpperCase() : 'PATROL CLEAR'}`
        : `PROVING GROUND — SEALED ROUTE ${step + 1}/${chain.count}`,
    storyTarget: captain ? {
      id: captain.id, name: captain.name, label: captain.name.toUpperCase(), archetype: captain.archetype,
      factionId: 'faction_reach', namedCaptainId: captain.id, zoneId: 'zone_charon_ambush',
    } : null,
    preloadedCargo: branch === 'free',
    expiresAtEpoch: epoch + 1,
    campaign47aBeat: 5,
    source: 'campaign47a.embodied',
  };
}

/** A/B are physical contracts on the Ashfall board. C/D/E remain world actions. */
export function buildEndgameBoardOffers(options = {}) {
  const seed = (Number(options.seed) >>> 0) || 1;
  const epoch = Math.max(0, Number(options.epoch) | 0);
  return ENDINGS.slice(0, 2).map((ending, index) => ({
    id: stableOfferId(seed, 7, epoch, index, ending.id),
    type: 'passenger_transport',
    storyTag: `campaign47a:ending:${ending.id}`,
    storyContractId: `campaign47a:ending:${ending.id}`,
    storyDisposition: ending.id,
    stationId: 'station_ashcache',
    destStationId: 'station_ashcache',
    destSectorId: 'sector_ashfall_reach',
    factionId: ending.id === 'A' ? 'faction_scn' : 'faction_mts',
    title: `FINAL DISPOSITION — ${ending.title.toUpperCase()}`,
    params: { cmdtyId: null, qty: 1, fValue: 0, taskTime: 0 },
    reward_cr: 0, collateral_cr: 0, riskTier: 0, time_limit_s: 0, distance: 0,
    expiresAtEpoch: epoch + 2,
    campaign47aBeat: 7,
    source: 'campaign47a.embodied',
  }));
}

export function getFailureRecovery(beatIndex) {
  const def = embodiedMissionAt(beatIndex);
  return def ? { beat: def.beat, cooldownS: FAIL_RECOVERY_COOLDOWN_S, line: def.recovery } : null;
}

export function buildConsequenceIntents(beatIndex) {
  const def = embodiedMissionAt(beatIndex);
  return def ? { beat: def.beat, intents: [], applied: false, note: 'missions/story existing owners apply canonical rewards and consequences' } : null;
}

export function buildAftermathHook(beatIndex) {
  const def = embodiedMissionAt(beatIndex);
  return def && def.aftermath ? { beat: def.beat, recordKind: AFTERMATH_RECORD_KIND, ...def.aftermath } : null;
}

export function getNamedCaptainBinding(beatIndex, options = {}) {
  if ((Number(beatIndex) | 0) !== 5 || options.branch !== 'patrol') return { beat: Number(beatIndex) | 0, captainId: null, bound: false };
  const captainId = ['cap_sable_iask', 'cap_redcut_sorrel'][Math.max(0, Number(options.chainStep) | 0)] || null;
  return { beat: 5, captainId, bound: !!captainId, encounterShapeId: captainId ? 'named_hunter' : null };
}

export function getCareerCrossover(beatIndex, branch = null) {
  const def = embodiedMissionAt(beatIndex);
  if (!def) return null;
  const ids = def.beat === 5 && branch
    ? ({ traders: ['hauler'], patrol: ['hunter'], free: ['prospector', 'hauler'] }[branch] || def.careerIds)
    : def.careerIds;
  return { beat: def.beat, careerIds: [...ids], binding: 'non_binding' };
}

export function describeEmbodiedMission(beatIndex, options = {}) {
  const def = embodiedMissionAt(beatIndex);
  if (!def) return null;
  return {
    beat: def.beat, id: def.id, contactId: def.contactId, contactName: def.contactName,
    location: getEmbodiedLocation(beatIndex, options.branch, options.elroyOutcome),
    physicalContact: getPhysicalContact(beatIndex),
    boardContract: buildMissionBoardContract(beatIndex, options),
    recovery: getFailureRecovery(beatIndex),
    aftermath: buildAftermathHook(beatIndex),
    career: getCareerCrossover(beatIndex, options.branch),
    authority: B({ cursor: 'missions', overlay: 'story', encounters: 'encounterDirector', aftermath: 'aftermathWrecks' }),
  };
}

export function validateEmbodiedMissions() {
  const errors = [];
  if (EMBODIED_MISSIONS.length !== CAMPAIGN_BEATS.length) errors.push('beat count mismatch');
  for (const def of EMBODIED_MISSIONS) {
    const canonical = CAMPAIGN_BEATS[def.beat];
    if (!canonical || canonical.id !== def.id) errors.push(`B${def.beat}: canonical id mismatch`);
    if (!def.contactId || !def.location || !def.physicalContact || !def.recovery) errors.push(`B${def.beat}: incomplete embodiment`);
    for (const step of def.physicalContact.steps) {
      if (!isCanonicalContactSignal(step.signal)) errors.push(`B${def.beat}: unverified signal ${step.signal}`);
    }
  }
  const b2 = embodiedMissionAt(2);
  if (!b2.missionBoardContract.storyTarget || b2.missionBoardContract.storyTarget.id !== 'npc_elroy') errors.push('B2: Elroy target missing');
  const b3 = embodiedMissionAt(3);
  if (!b3.consequenceRoutes || !b3.consequenceRoutes.custody || !b3.consequenceRoutes.force) errors.push('B3: consequence routes missing');
  const b4 = embodiedMissionAt(4);
  if (!b4.consequenceStakes || !b4.consequenceStakes.custody || !b4.consequenceStakes.force) errors.push('B4: consequence stakes missing');
  return { ok: errors.length === 0, errors };
}
