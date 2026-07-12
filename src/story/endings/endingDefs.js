// Pure B7 ending definitions + sandbox continuation (M5).
// Data only — no state mutation, no bus emit, no credits/rep/cargo/heat writes.
// Canonical sources: docs/worldbuilding/story/ENDGAME-B7-REDESIGN.md, SPEC3-F7, ALPHA M5.

import { ENDGAME_NET_WORTH_CR, ENDGAME_REP_MIN } from '../campaign47a/campaignData.js';

export { ENDGAME_NET_WORTH_CR, ENDGAME_REP_MIN };

/** Five embodied endings (A–E). Sandbox is not an ending. */
export const ENDING_IDS = Object.freeze(['A', 'B', 'C', 'D', 'E']);

/** Explicit non-ending continuation id. */
export const SANDBOX_ID = 'SANDBOX';

/** Sandbox mode vocabulary for open-frontier continuation (not an ending package). */
export const SANDBOX_MODE_OPEN_FRONTIER = 'open_frontier';

export const BRANCH_FACTION = Object.freeze({
  traders: 'faction_mts',
  patrol: 'faction_scn',
  free: 'faction_free',
});

/** Capital-class hulls (tier ≥ 3) used for empire-stake eligibility. */
export const CAPITAL_SHIP_DEF_IDS = Object.freeze([
  'ship_bastion',
  'ship_atlas',
  'ship_ranger',
  'ship_warden',
  'ship_colossus',
  'ship_leviathan',
]);

/**
 * Five ending packages. Eligibility is evaluated by eligibility.js against live facts;
 * consequenceIntents are descriptors for story.js to emit via owner events only.
 */
export const ENDING_DEFS = Object.freeze([
  Object.freeze({
    id: 'A',
    key: 'clean_uniform',
    title: 'THE CLEAN UNIFORM',
    kind: 'contract',
    boardText: 'CONCORD AUXILIARY COMMISSION — SECTOR ADMINISTRATOR APPOINTMENT',
    hudOnAccept: 'Appointment confirmed. Record expunged. Welcome to the service.',
    resolution: 'You wear the badge. The math is the same. The paper is cleaner.',
    confirmPrompt: 'ACCEPT CONCORD AUXILIARY COMMISSION?',
    confirmHint: 'Irreversible. Record expunged. You become the institution.',
    graffitiBulkhead: 'They let you in. That means they need something from you.',
    graffitiHome: 'The signature is always the same. Only the paper changes.',
    sandboxMode: 'concord_auxiliary',
    boardEligible: true,
    /** Causal: lawful path — patrol branch, Concord standing, or hunter origin. */
    alignment: Object.freeze({
      branches: Object.freeze(['patrol']),
      factionId: 'faction_scn',
      factionRepMin: ENDGAME_REP_MIN,
      origins: Object.freeze(['hunter']),
    }),
    consequenceIntents: Object.freeze({
      rep: Object.freeze([
        Object.freeze({ factionId: 'faction_scn', delta: 700, reason: 'endgame_clean_uniform' }),
        Object.freeze({ factionId: 'faction_mts', delta: 100, reason: 'endgame_clean_uniform' }),
      ]),
      heatClear: Object.freeze({ reason: 'endgame_clean_uniform' }),
      credits: 0,
      flags: Object.freeze(['record_expunged', 'surcharges_cleared', 'aux_missions']),
      loopBack: false,
    }),
    continuity: continuity('auxiliary_watch', 'AUXILIARY WATCH', 'mission:completed', 3,
      'post47a_auxiliary_patrols', 'Complete three patrol, bounty, or escort contracts.',
      { missionTypes: ['patrol_clear', 'bounty_hunt', 'escort'] }),
  }),
  Object.freeze({
    id: 'B',
    key: 'same_silence',
    title: 'THE SAME SILENCE',
    kind: 'contract',
    boardText: 'QUIET SYNDICATE — SENIOR ROUTING POSITION (UNDISCLOSED LOCATION)',
    hudOnAccept: 'Position confirmed. Traffic begins immediately.',
    resolution: 'You are a channel. Freight moves. Your name does not.',
    confirmPrompt: 'ACCEPT QUIET ROUTING POSITION?',
    confirmHint: 'Irreversible. Public identity ends. Routing begins.',
    graffitiBulkhead: "You're not a person anymore. You're a channel. That's fine. Channels last longer.",
    graffitiHome: 'THEY NEVER SHOWED BUT THE CARGO MOVED.',
    sandboxMode: 'quiet_routing',
    boardEligible: true,
    /** Causal: free/smuggler path — free branch, Freeport standing, or hauler origin. */
    alignment: Object.freeze({
      branches: Object.freeze(['free']),
      factionId: 'faction_free',
      factionRepMin: ENDGAME_REP_MIN,
      origins: Object.freeze(['hauler']),
    }),
    consequenceIntents: Object.freeze({
      rep: Object.freeze([]),
      heatClear: null,
      credits: 0,
      flags: Object.freeze(['identity_erased', 'routing_active', 'hide_own_rep_delta']),
      identityErased: true,
      loopBack: false,
    }),
    continuity: continuity('quiet_manifest', 'QUIET MANIFEST', 'economy:tradeCompleted', 3,
      'post47a_quiet_routes', 'Close three distinct sale routes without a public title.',
      { side: 'sell' }),
  }),
  Object.freeze({
    id: 'C',
    key: 'only_honest',
    title: 'THE ONLY HONEST OPTION',
    kind: 'wormhole',
    boardText: null,
    hudOnAccept: 'CARGO: STABLE.',
    resolution: 'No exit. Same bay. Same day. Payment still pending.',
    confirmPrompt: 'JUMP WITHOUT DESTINATION?',
    confirmHint: 'The wormhole files a return, not an escape.',
    graffitiBulkhead: 'THEY KNEW THE MASS. THEY ALWAYS KNEW THE MASS.',
    graffitiHome: null,
    sandboxMode: 'loop_return',
    boardEligible: false,
    alignment: null,
    world: Object.freeze({
      sectorId: 'sector_ashfall_reach',
      fullLoad: true,
      noActiveMissions: true,
    }),
    consequenceIntents: Object.freeze({
      rep: Object.freeze([]),
      heatClear: null,
      credits: 0,
      flags: Object.freeze(['wormhole_return', 'pers_47a_pending', 'cargo_stable']),
      loopBack: true,
    }),
    continuity: continuity('return_circuit', 'RETURN CIRCUIT', 'sector:enter', 4,
      'post47a_loop_cartography', 'Re-enter four distinct regions after the loop return.'),
  }),
  Object.freeze({
    id: 'D',
    key: 'ledger_continues',
    title: 'THE LEDGER CONTINUES',
    kind: 'stay',
    boardText: null,
    hudOnAccept: 'CARGO: PERSONAL EFFECTS — 1 UNIT / 0.4t.',
    resolution: 'You stay. Watch. Record. The desk is yours.',
    confirmPrompt: 'KEEP THE LEDGER AND STAY?',
    confirmHint: 'Irreversible. Ashfall needs a witness more than a pilot.',
    graffitiBulkhead: 'THIS ONE STAYED.',
    graffitiHome: "THEY'RE NOT COMING BACK.",
    sandboxMode: 'witness_desk',
    boardEligible: false,
    alignment: null,
    world: Object.freeze({
      sectorId: 'sector_ashfall_reach',
      cargoIds: Object.freeze(['cmdty_personal_ledger']),
      requireLedgerFlag: true,
    }),
    consequenceIntents: Object.freeze({
      rep: Object.freeze([]),
      heatClear: null,
      credits: 0,
      flags: Object.freeze(['witness_current', 'stayed_at_ashfall', 'ledger_held']),
      stayedAtAshfall: true,
      loopBack: false,
    }),
    continuity: continuity('witness_archive', 'WITNESS ARCHIVE', 'scan:completed', 3,
      'post47a_witness_archive', 'File three distinct sector or contact scans.'),
  }),
  Object.freeze({
    id: 'E',
    key: 'next_run',
    title: 'THE NEXT RUN',
    kind: 'courier',
    boardText: null,
    hudOnAccept: 'CONTRACT 47-A: STATUS: CLOSED. CONTRACT 47-B: STATUS: PENDING.',
    resolution: 'No title. Thin coin. Another manifest opens.',
    confirmPrompt: 'ACCEPT THE NEXT RUN?',
    confirmHint: '47-A closes. Another manifest opens. No title.',
    graffitiBulkhead: null,
    graffitiHome: 'YOU KNEW THE MASS AND YOU TOOK THE COIN.',
    sandboxMode: 'working_pilot',
    boardEligible: false,
    alignment: null,
    world: Object.freeze({
      sectorId: 'sector_ashfall_reach',
      declineAll: Object.freeze(['A', 'B', 'C', 'D']),
    }),
    consequenceIntents: Object.freeze({
      rep: Object.freeze([]),
      heatClear: null,
      credits: 1200,
      creditReason: 'contract_47a_settlement',
      flags: Object.freeze(['contract_47a_closed', 'contract_47b_pending']),
      contract47bPending: true,
      loopBack: false,
    }),
    continuity: continuity('contract_47b', 'CONTRACT 47-B', 'mission:completed', 2,
      'post47a_next_manifest', 'Complete two contracts under the next manifest.'),
  }),
]);

/**
 * Explicit sandbox continuation — not an ending.
 * Preserves the world, continues play, applies no ending rewards.
 */
export const SANDBOX_DEF = Object.freeze({
  id: SANDBOX_ID,
  key: 'open_frontier',
  title: 'THE OPEN FRONTIER',
  kind: 'sandbox',
  isEnding: false,
  boardText: null,
  hudOnAccept: 'NO FINAL DISPOSITION FILED. OPERATIONS CONTINUE.',
  resolution: 'No ending. The count continues. Fly.',
  confirmPrompt: 'CONTINUE WITHOUT FINAL DISPOSITION?',
  confirmHint: 'Not an ending. World preserved. No disposition rewards.',
  graffitiBulkhead: null,
  graffitiHome: null,
  sandboxMode: SANDBOX_MODE_OPEN_FRONTIER,
  boardEligible: false,
  consequenceIntents: Object.freeze({
    rep: Object.freeze([]),
    heatClear: null,
    credits: 0,
    flags: Object.freeze(['sandbox_continued', 'no_final_disposition']),
    loopBack: false,
  }),
  continuity: continuity('open_frontier', 'OPEN FRONTIER', 'sector:enter', 5,
    'post47a_open_frontier', 'Chart five distinct regions without filing a disposition.'),
});

function continuity(id, title, signal, target, replayHookId, objective, opts = {}) {
  return Object.freeze({
    id,
    title,
    signal,
    target,
    replayHookId,
    objective,
    missionTypes: Object.freeze((opts.missionTypes || []).slice()),
    side: opts.side || null,
  });
}

export function endingDef(id) {
  if (id === SANDBOX_ID || id === 'sandbox' || id === SANDBOX_DEF.key) return SANDBOX_DEF;
  return ENDING_DEFS.find((e) => e.id === id || e.key === id) || null;
}

export function listEndingDefs() {
  return ENDING_DEFS.slice();
}

export function isEndingId(id) {
  return ENDING_IDS.includes(id);
}

export function isSandboxId(id) {
  return id === SANDBOX_ID || id === 'sandbox' || id === SANDBOX_DEF.key;
}
