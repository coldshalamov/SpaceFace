// Pure data + vocabulary for Campaign 47-A sidecar (M5 task 1).
// Isolated library only: not registered, does not import systems.
// Does NOT own state.story.beatIndex / branch / endgame* — those are missions/story.
// No Math.random / wall clock. Authority: ARCHITECTURE + MASTER_TASTE + ALPHA M5 + live maps.

/** @typedef {'traders'|'patrol'|'free'} CampaignBranch */
/** @typedef {'A'|'B'|'C'|'D'|'E'} EndingId */
/** @typedef {'refinery'|'fuel_relay'|'hab_fortress'} OutpostSpecializationId */

export const CAMPAIGN_ID = 'campaign.47a.v1';
/** Schema v2: metadata sidecar only (no cursor/ending ownership fields). */
export const CAMPAIGN_SCHEMA_VERSION = 2;
export const CAMPAIGN_STATE_KEY = 'campaign47a';
export const CAMPAIGN_STATE_PATH = 'story.campaign47a';

/** Fail recovery: sim-seconds before a failed beat/encounter may be re-armed (meta only). */
export const FAIL_RECOVERY_COOLDOWN_S = 12;
/** Max failed attempts recorded per beat before soft-cap (still recoverable). */
export const MAX_FAILURES_PER_BEAT = 8;
/** Live B7 gate observations (read-only; never written here). */
export const ENDGAME_NET_WORTH_CR = 100_000;
export const ENDGAME_REP_MIN = 50;

export const BRANCH_IDS = Object.freeze(['traders', 'patrol', 'free']);

/** Live branch → faction map (matches missions STORY_BRANCH_INTROS). */
export const BRANCH_FACTION = Object.freeze({
  traders: 'faction_mts',
  patrol: 'faction_scn',
  free: 'faction_free',
});

/**
 * Live single opposing-faction map (missions.js B4).
 * patrol→free, free→scn, traders→dmc.
 */
export const BRANCH_OPPOSING = Object.freeze({
  patrol: 'faction_free',
  free: 'faction_scn',
  traders: 'faction_dmc',
});

/** Live branch intro contract (data/missions.js). */
export const STORY_BRANCH_INTRO_TAG = 'story.branch_intro';

export const STORY_BRANCH_INTROS = Object.freeze([
  Object.freeze({ branch: 'traders', factionId: 'faction_mts', type: 'bulk_trade' }),
  Object.freeze({ branch: 'patrol', factionId: 'faction_scn', type: 'patrol_clear' }),
  Object.freeze({ branch: 'free', factionId: 'faction_free', type: 'smuggling_run' }),
]);

/** Live B5 chain types/counts (missions.js BRANCH_CHAIN). */
export const BRANCH_CHAIN = Object.freeze({
  traders: Object.freeze({ missionType: 'bulk_trade', count: 3, label: 'Trade runs' }),
  patrol: Object.freeze({ missionType: 'patrol_clear', count: 2, label: 'Patrol clears' }),
  free: Object.freeze({ missionType: 'smuggling_run', count: 2, label: 'Smuggling legs' }),
});

/**
 * Embodied B0–B7 step recipes keyed to the observed canonical beatIndex.
 * Steps are ordered AND requirements (not OR, no synthetic primarySignal).
 * Rewards listed as documentation only — missions owns live reward application.
 */
export const CAMPAIGN_BEATS = Object.freeze([
  {
    beat: 0,
    id: 'cold_start',
    title: 'Cold Start',
    objective: 'Sample the 47-A mass discrepancy, then dock at Helios.',
    steps: Object.freeze([
      Object.freeze({
        id: 'mine',
        order: 0,
        accept: Object.freeze(['mining:yield', 'mining.yield']),
        label: 'Mine / sample yield',
      }),
      Object.freeze({
        id: 'dock',
        order: 1,
        accept: Object.freeze(['dock:docked']),
        label: 'Dock after sample',
        requiresPrior: Object.freeze(['mine']),
      }),
    ]),
    observeOnly: false,
    liveMissionType: 'mining_quota',
    introduces: 'mining',
    rewardDoc: Object.freeze({
      credits: 400,
      reason: 'story:beat:0',
      rep: Object.freeze([{ factionId: 'faction_scn', delta: 5 }]),
    }),
    next: 1,
    recovery: Object.freeze({
      rearmOn: Object.freeze(['dock:docked', 'mission:offered']),
      line: 'Manifest still open. Sample again or re-dock Helios.',
    }),
  },
  {
    beat: 1,
    id: 'honest_work',
    title: 'Honest Work',
    objective: 'Complete a tracked low-risk haul to a marked station.',
    steps: Object.freeze([
      Object.freeze({
        id: 'trade',
        order: 0,
        accept: Object.freeze(['economy:tradeCompleted', 'cargo.delivered', 'mission:completed']),
        label: 'Complete trade / haul',
      }),
    ]),
    observeOnly: false,
    liveMissionType: 'cargo_delivery',
    introduces: 'trade',
    rewardDoc: Object.freeze({ credits: 600, reason: 'story:beat:1', rep: Object.freeze([]) }),
    next: 2,
    recovery: Object.freeze({
      rearmOn: Object.freeze(['dock:docked', 'mission:failed']),
      line: 'Board still has honest work. Re-accept the haul.',
    }),
  },
  {
    beat: 2,
    id: 'first_blood',
    title: 'First Blood',
    objective: 'Clear a low-risk bounty or hostile contact.',
    steps: Object.freeze([
      Object.freeze({
        id: 'kill',
        order: 0,
        accept: Object.freeze(['entity:killed', 'mission:completed']),
        label: 'Kill / bounty clear',
      }),
    ]),
    observeOnly: false,
    liveMissionType: 'bounty_hunt',
    introduces: 'combat',
    rewardDoc: Object.freeze({ credits: 800, reason: 'story:beat:2', rep: Object.freeze([]) }),
    next: 3,
    recovery: Object.freeze({
      rearmOn: Object.freeze(['mission:failed', 'encounter:resolved', 'dock:docked']),
      line: 'Contact lost. Re-arm the bounty — the board still pays.',
    }),
  },
  {
    beat: 3,
    id: 'bigger_boat',
    title: 'Bigger Boat',
    objective: 'Purchase any tier-2 hull at a shipyard.',
    steps: Object.freeze([
      Object.freeze({
        id: 'ship_purchased',
        order: 0,
        accept: Object.freeze(['ship:purchased', 'ship.purchased']),
        label: 'Purchase hull',
      }),
    ]),
    observeOnly: false,
    liveMissionType: null,
    introduces: 'shipyard',
    rewardDoc: Object.freeze({ credits: 1000, reason: 'story:beat:3', rep: Object.freeze([]) }),
    next: 4,
    recovery: Object.freeze({
      rearmOn: Object.freeze(['dock:docked']),
      line: 'Shipyard still open. Earn the hull; no soft-lock.',
    }),
  },
  {
    beat: 4,
    id: 'pick_a_side',
    title: 'Pick a Side',
    objective: 'Accept a faction intro: Traders, Patrol, or Free Captains.',
    steps: Object.freeze([
      Object.freeze({
        id: 'branch_intro_accept',
        order: 0,
        accept: Object.freeze(['mission:accepted']),
        requireStoryTag: STORY_BRANCH_INTRO_TAG,
        requireLiveIntroTypes: Object.freeze(['bulk_trade', 'patrol_clear', 'smuggling_run']),
        label: 'Accept live branch intro',
      }),
    ]),
    observeOnly: false,
    liveMissionType: null, // intros use bulk_trade|patrol_clear|smuggling_run, not a synthetic type
    introduces: 'factions',
    branches: BRANCH_IDS,
    rewardDoc: Object.freeze({
      credits: 1200,
      reason: 'story:beat:4',
      repChosen: 15,
      repOpposing: -10,
    }),
    next: 5,
    recovery: Object.freeze({
      rearmOn: Object.freeze(['dock:docked', 'mission:failed']),
      line: 'Three intros still on the board. Pick one path.',
    }),
  },
  {
    beat: 5,
    id: 'proving_ground',
    title: 'Proving Ground',
    objective: 'Finish the branch mission chain.',
    steps: Object.freeze([
      Object.freeze({
        id: 'chain_complete',
        order: 0,
        accept: Object.freeze(['mission:completed']),
        requireChainComplete: true,
        label: 'Complete branch chain count',
      }),
    ]),
    observeOnly: false,
    liveMissionType: null, // chain uses live bulk_trade|patrol_clear|smuggling_run
    introduces: 'chaining',
    rewardDoc: Object.freeze({ credits: 2500, reason: 'story:beat:5', rep: Object.freeze([]) }),
    next: 6,
    recovery: Object.freeze({
      rearmOn: Object.freeze(['mission:failed', 'dock:docked']),
      line: 'Chain interrupted. Re-offer the next proving leg.',
    }),
  },
  {
    beat: 6,
    id: 'empire_seed',
    title: 'Empire Seed',
    objective: 'Deploy a drone, hire a trader, or claim an outpost specialization.',
    steps: Object.freeze([
      Object.freeze({
        id: 'asset_deploy',
        order: 0,
        accept: Object.freeze(['asset:deployed']),
        requireAssetDeploy: true,
        label: 'Deploy drone / trader / outpost',
      }),
    ]),
    observeOnly: false,
    liveMissionType: null,
    introduces: 'passive_income',
    rewardDoc: Object.freeze({ credits: 3000, reason: 'story:beat:6', rep: Object.freeze([]) }),
    next: 7,
    recovery: Object.freeze({
      rearmOn: Object.freeze(['dock:docked', 'asset:deployed']),
      line: 'Plot still free. Deploy any passive asset to continue.',
    }),
  },
  {
    beat: 7,
    id: 'deep_reach',
    title: 'The Deep Reach',
    objective: 'Meet endgame gates, then choose an ending. Sandbox continues after.',
    /** B7 only observes the live gate/advance — no sidecar completion authority. */
    steps: Object.freeze([]),
    observeOnly: true,
    liveMissionType: null,
    introduces: 'endgame',
    gateDoc: Object.freeze({
      kind: 'endgame',
      netWorthCr: ENDGAME_NET_WORTH_CR,
      repMin: ENDGAME_REP_MIN,
      note: 'Live missions/story own gate evaluation and endgame offer.',
    }),
    rewardDoc: Object.freeze({ credits: 0, reason: 'story:beat:7', rep: Object.freeze([]) }),
    next: null,
    recovery: Object.freeze({
      rearmOn: Object.freeze(['dock:docked', 'encounter:resolved']),
      line: 'Gates unmet or choice deferred. The count continues.',
    }),
  },
]);

/**
 * Five ending descriptors (A–E). Consequences are data for a later adapter only —
 * this library never applies credits/rep/heat/cargo or chooses an ending.
 * All endings declare post-ending sandbox mode vocabulary.
 */
export const ENDINGS = Object.freeze([
  {
    id: 'A',
    key: 'clean_uniform',
    title: 'The Clean Uniform',
    kind: 'contract',
    summary: 'Join Concord Auxiliary. Record cleared; lawful interdiction loop opens.',
    requires: Object.freeze({
      declined: Object.freeze([]),
      cargoIds: Object.freeze([]),
      sectorId: null,
      fullLoad: false,
      noMissions: false,
    }),
    sandbox: Object.freeze({
      mode: 'concord_auxiliary',
      identityVisible: true,
      boardFilter: 'lawful_aux',
      hudPhaseHint: 3,
    }),
    /** Adapter-facing consequence descriptors — not applied here. */
    consequenceDescriptors: Object.freeze({
      rep: Object.freeze([
        Object.freeze({ factionId: 'faction_scn', delta: 700, reason: 'campaign47a:ending:A' }),
        Object.freeze({ factionId: 'faction_mts', delta: 100, reason: 'campaign47a:ending:A:mts' }),
      ]),
      credits: 0,
      heat: Object.freeze({
        intent: 'heat:clear',
        reason: 'campaign47a:ending:A',
        note: 'heat.js sole writer; adapter must route — never assign player.heat',
      }),
      flags: Object.freeze(['record_expunged', 'surcharges_cleared', 'aux_missions']),
    }),
    loopBackIntent: null,
    postLoop: 'Run the same math from inside the badge.',
  },
  {
    id: 'B',
    key: 'same_silence',
    title: 'The Same Silence',
    kind: 'contract',
    summary: 'Become routing infrastructure. Name leaves boards; cut arrives automatic.',
    requires: Object.freeze({
      declined: Object.freeze([]),
      cargoIds: Object.freeze([]),
      sectorId: null,
      fullLoad: false,
      noMissions: false,
    }),
    sandbox: Object.freeze({
      mode: 'quiet_routing',
      identityVisible: false,
      boardFilter: 'routing_oversight',
      hudPhaseHint: 3,
    }),
    consequenceDescriptors: Object.freeze({
      rep: Object.freeze([]),
      credits: 0,
      heat: null,
      flags: Object.freeze(['identity_erased', 'routing_active', 'hide_own_rep_delta']),
    }),
    loopBackIntent: null,
    postLoop: 'Freight moves. Your callsign shows up in someone else\'s airlock.',
  },
  {
    id: 'C',
    key: 'only_honest',
    title: 'The Only Honest Option',
    kind: 'wormhole',
    summary: 'Jump without destination from Ashfall. System files a return; 47-A reopens.',
    requires: Object.freeze({
      declined: Object.freeze([]),
      cargoIds: Object.freeze([]),
      sectorId: 'sector_ashfall_reach',
      fullLoad: true,
      noMissions: true,
    }),
    sandbox: Object.freeze({
      mode: 'loop_return',
      identityVisible: true,
      boardFilter: 'contract_47a_pending',
      hudPhaseHint: 1,
      campaignSoftReset: true,
    }),
    consequenceDescriptors: Object.freeze({
      rep: Object.freeze([]),
      credits: 0,
      heat: null,
      flags: Object.freeze(['wormhole_return', 'pers_47a_pending', 'cargo_stable']),
    }),
    /** Declares loopBack intent for later adapter — not emitted as production authority here. */
    loopBackIntent: Object.freeze({
      event: 'endgame:loopBack',
      payload: Object.freeze({}),
      note: 'story.js emits; live has no subscriber yet — adapter owns soft reset of missions spine',
    }),
    postLoop: 'Same day. Same bay. Payment still pending.',
  },
  {
    id: 'D',
    key: 'ledger_continues',
    title: 'The Ledger Continues',
    kind: 'stay',
    summary: 'Keep the ledger. Stay at Ashfall. Become the next witness desk.',
    requires: Object.freeze({
      declined: Object.freeze([]),
      cargoIds: Object.freeze(['cmdty_personal_ledger']),
      sectorId: 'sector_ashfall_reach',
      fullLoad: false,
      noMissions: false,
    }),
    sandbox: Object.freeze({
      mode: 'witness_desk',
      identityVisible: true,
      boardFilter: 'witness_only',
      hudPhaseHint: 3,
    }),
    consequenceDescriptors: Object.freeze({
      rep: Object.freeze([]),
      credits: 0,
      heat: null,
      flags: Object.freeze(['witness_current', 'counterparty_closed', 'ledger_held']),
    }),
    loopBackIntent: null,
    postLoop: 'Watch. Record. Stay. Patterns recur.',
  },
  {
    id: 'E',
    key: 'next_run',
    title: 'The Next Run',
    kind: 'courier',
    summary: 'Decline the other paths. Close 47-A for a thin payout. Open 47-B.',
    requires: Object.freeze({
      declined: Object.freeze(['A', 'B', 'C', 'D']),
      cargoIds: Object.freeze([]),
      sectorId: 'sector_ashfall_reach',
      fullLoad: false,
      noMissions: false,
    }),
    sandbox: Object.freeze({
      mode: 'working_pilot',
      identityVisible: true,
      boardFilter: 'standard',
      hudPhaseHint: 3,
    }),
    consequenceDescriptors: Object.freeze({
      rep: Object.freeze([]),
      credits: 1200,
      creditReason: 'campaign47a:ending:E:47a_close',
      heat: null,
      flags: Object.freeze(['contract_47a_closed', 'contract_47b_pending']),
    }),
    loopBackIntent: null,
    postLoop: 'No title. Reactor fuel still costs. Accept anyway.',
  },
]);

/**
 * Three visible outpost specializations (ownership lane for M5).
 * Map to existing automation OUTPOSTS ids for lead integration.
 */
export const OUTPOST_SPECIALIZATIONS = Object.freeze([
  {
    id: 'refinery',
    outpostDefId: 'outpost_refinery',
    title: 'Industrial Refinery',
    role: 'processing',
    visibleTag: 'REFINERY',
    description: 'Ore in, alloys out. Defense modest; upkeep steady.',
    unlockBeat: 6,
    buildCostHint: 60000,
    defenseHint: 20,
    passiveHint: 'recipe:ore_iron→alloys',
    consequenceFlags: Object.freeze(['outpost_processing', 'local_alloy_supply']),
    deployObserve: Object.freeze({
      kind: 'outpost',
      specializationId: 'refinery',
      defId: 'outpost_refinery',
    }),
  },
  {
    id: 'fuel_relay',
    outpostDefId: 'outpost_fuelsynth',
    title: 'Fuel Relay',
    role: 'logistics',
    visibleTag: 'FUEL RELAY',
    description: 'Volatiles to fuel cells. Lane-facing logistics ownership.',
    unlockBeat: 6,
    buildCostHint: 45000,
    defenseHint: 15,
    passiveHint: 'recipe:volatiles→fuel_cells',
    consequenceFlags: Object.freeze(['outpost_logistics', 'fuel_lane_support']),
    deployObserve: Object.freeze({
      kind: 'outpost',
      specializationId: 'fuel_relay',
      defId: 'outpost_fuelsynth',
    }),
  },
  {
    id: 'hab_fortress',
    outpostDefId: 'outpost_habhub',
    title: 'Hab Fortress',
    role: 'habitation',
    visibleTag: 'HAB HUB',
    description: 'Crew buffer and credit drip. Highest defense, highest upkeep.',
    unlockBeat: 6,
    buildCostHint: 110000,
    defenseHint: 30,
    passiveHint: 'creditGen + capBuffer',
    consequenceFlags: Object.freeze(['outpost_habitation', 'crew_buffer', 'defendable_plot']),
    deployObserve: Object.freeze({
      kind: 'outpost',
      specializationId: 'hab_fortress',
      defId: 'outpost_habhub',
    }),
  },
]);

/** Sidecar meta status for fail/recover on the observed current beat only. */
export const BEAT_STATUS = Object.freeze({
  IDLE: 'idle',
  TRACKING: 'tracking',
  FAILED: 'failed',
  RECOVERED: 'recovered',
});

/**
 * Namespaced campaign events only.
 * Never emit encounter:receipt, story:beatAdvanced, authority rewards, or raw toasts.
 */
export const CAMPAIGN_EVENTS = Object.freeze({
  receipt: 'campaign47a:receipt',
  stepProgress: 'campaign47a:stepProgress',
  beatFailed: 'campaign47a:beatFailed',
  beatRecovered: 'campaign47a:beatRecovered',
  outpostTagged: 'campaign47a:outpostTagged',
  meta: 'campaign47a:meta',
});

/** @deprecated Prefer CAMPAIGN_EVENTS — kept as alias for clarity in reviews. */
export const AUTHORITY_EVENTS = CAMPAIGN_EVENTS;

/** Fields discarded on migrate from isolated v1 dual-spine blobs. */
export const DISCARDED_OWNERSHIP_FIELDS = Object.freeze([
  'beatIndex',
  'branch',
  'chainProgress',
  'chainTarget',
  'phase',
  'endgameOffered',
  'endgameReady',
  'endingId',
  'endingsDeclined',
  'startedAtS',
  'completedAtS',
]);

export function beatDefAt(index) {
  const i = Math.floor(Number(index));
  if (!Number.isFinite(i) || i < 0 || i >= CAMPAIGN_BEATS.length) return null;
  return CAMPAIGN_BEATS[i];
}

export function endingDef(id) {
  return ENDINGS.find((e) => e.id === id) || null;
}

export function outpostSpecDef(id) {
  return OUTPOST_SPECIALIZATIONS.find((o) => o.id === id) || null;
}

export function branchFactionId(branch) {
  return BRANCH_FACTION[branch] || null;
}

export function branchOpposingFactionId(branch) {
  return BRANCH_OPPOSING[branch] || null;
}

export function branchIntroDef(branch) {
  return STORY_BRANCH_INTROS.find((b) => b.branch === branch) || null;
}

export function mapOutpostDefToSpec(defId) {
  const hit = OUTPOST_SPECIALIZATIONS.find((o) => o.outpostDefId === defId);
  return hit ? hit.id : null;
}
