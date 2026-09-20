// Five canonical dispositions. A/B stay board contracts; C/D/E stay embodied actions.
// Constants match campaign47a's de9f3f1fc baseline. Sandbox is NOT a sixth ending.
import { freeze } from './value.js';
export const ENDGAME_NET_WORTH_CR = 100000;
export const ENDGAME_REP_MIN = 50;
export const ENDING_IDS = Object.freeze(['A', 'B', 'C', 'D', 'E']);
export const SANDBOX_ID = 'SANDBOX';
export const SANDBOX_MODE_OPEN_FRONTIER = 'open_frontier';
export const BRANCH_FACTION = freeze({ traders: 'faction_mts', patrol: 'faction_scn', free: 'faction_free' });
export const CAPITAL_SHIP_DEF_IDS = Object.freeze([
  'ship_bastion', 'ship_atlas', 'ship_ranger', 'ship_warden', 'ship_colossus', 'ship_leviathan',
]);
const continuation = (id, title, signal, target, replayHookId, objective, opts = {}) => ({
  id, title, signal, target, replayHookId, objective, missionTypes: opts.missionTypes || [], side: opts.side || null,
});
export const ENDING_DEFS = freeze([
  {
    id: 'A', key: 'clean_uniform', title: 'THE CLEAN UNIFORM', kind: 'contract', boardEligible: true,
    boardText: 'CONCORD AUXILIARY COMMISSION — SECTOR ADMINISTRATOR APPOINTMENT',
    hudOnAccept: 'Appointment confirmed. Record expunged. Welcome to the service.',
    resolution: 'You wear the badge. The math is the same. The paper is cleaner.',
    confirmPrompt: 'ACCEPT CONCORD AUXILIARY COMMISSION?',
    confirmHint: 'Irreversible. Concord clears the search, not the people in your history. The commission does not end flight.',
    graffitiBulkhead: 'They let you in. That means they need something from you.',
    graffitiHome: 'The signature is always the same. Only the paper changes.',
    sandboxMode: 'concord_auxiliary',
    alignment: { branches: ['patrol'], factionId: 'faction_scn', factionRepMin: 50, origins: ['hunter'] },
    consequenceIntents: {
      rep: [{ factionId: 'faction_scn', delta: 700, reason: 'endgame_clean_uniform' },
        { factionId: 'faction_mts', delta: 100, reason: 'endgame_clean_uniform' }],
      heatClear: { reason: 'endgame_clean_uniform' }, credits: 0,
      flags: ['record_expunged', 'surcharges_cleared', 'aux_missions'], loopBack: false,
    },
    continuity: continuation('auxiliary_watch', 'AUXILIARY WATCH', 'mission:completed', 3,
      'post47a_auxiliary_patrols', 'Complete three patrol, bounty, or escort contracts.',
      { missionTypes: ['patrol_clear', 'bounty_hunt', 'escort'] }),
  },
  {
    id: 'B', key: 'same_silence', title: 'THE SAME SILENCE', kind: 'contract', boardEligible: true,
    boardText: 'QUIET SYNDICATE — SENIOR ROUTING POSITION (UNDISCLOSED LOCATION)',
    hudOnAccept: 'Position confirmed. Traffic begins immediately.',
    resolution: 'You are a channel. Freight moves. Your name does not.',
    confirmPrompt: 'ACCEPT QUIET ROUTING POSITION?',
    confirmHint: 'Irreversible. Your public identity is masked; your history and any active pursuit remain.',
    graffitiBulkhead: "You're not a person anymore. You're a channel. That's fine. Channels last longer.",
    graffitiHome: 'THEY NEVER SHOWED BUT THE CARGO MOVED.', sandboxMode: 'quiet_routing',
    alignment: { branches: ['free'], factionId: 'faction_free', factionRepMin: 50, origins: ['hauler'] },
    consequenceIntents: { rep: [], heatClear: null, credits: 0,
      flags: ['identity_erased', 'routing_active', 'hide_own_rep_delta'], identityErased: true, loopBack: false },
    continuity: continuation('quiet_manifest', 'QUIET MANIFEST', 'economy:tradeCompleted', 3,
      'post47a_quiet_routes', 'Close three distinct sale routes without a public title.', { side: 'sell' }),
  },
  {
    id: 'C', key: 'only_honest', title: 'THE ONLY HONEST OPTION', kind: 'wormhole', boardEligible: false,
    boardText: null, hudOnAccept: 'CARGO: STABLE.',
    resolution: 'No exit. Same account. Payment still pending.',
    confirmPrompt: 'JUMP WITHOUT DESTINATION?',
    confirmHint: 'The wormhole files a return, not an escape. No inventory, history, or campaign reset.',
    graffitiBulkhead: 'THEY KNEW THE MASS. THEY ALWAYS KNEW THE MASS.', graffitiHome: null,
    sandboxMode: 'loop_return', alignment: null,
    world: { sectorId: 'sector_ashfall_reach', fullLoad: true, noActiveMissions: true },
    consequenceIntents: { rep: [], heatClear: null, credits: 0,
      flags: ['wormhole_return', 'pers_47a_pending', 'cargo_stable'], loopBack: true },
    continuity: continuation('return_circuit', 'RETURN CIRCUIT', 'sector:enter', 4,
      'post47a_loop_cartography', 'Re-enter four distinct regions after the loop return.'),
  },
  {
    id: 'D', key: 'ledger_continues', title: 'THE LEDGER CONTINUES', kind: 'stay', boardEligible: false,
    boardText: null, hudOnAccept: 'CARGO: PERSONAL EFFECTS — 1 UNIT / 0.4t.',
    resolution: 'You keep the ledger. The desk is yours. So is the next departure.',
    confirmPrompt: 'KEEP THE LEDGER AND STAY?',
    confirmHint: 'Irreversible disposition, not a grounded ship. Keep the witness desk; fly to gather the next record.',
    graffitiBulkhead: 'THIS ONE STAYED.', graffitiHome: "THEY'RE NOT COMING BACK.",
    sandboxMode: 'witness_desk', alignment: null,
    world: { sectorId: 'sector_ashfall_reach', cargoIds: ['cmdty_personal_ledger'], requireLedgerFlag: true },
    consequenceIntents: { rep: [], heatClear: null, credits: 0,
      flags: ['witness_current', 'stayed_at_ashfall', 'ledger_held'], stayedAtAshfall: true, loopBack: false },
    continuity: continuation('witness_archive', 'WITNESS ARCHIVE', 'scan:completed', 3,
      'post47a_witness_archive', 'File three distinct sector or contact scans.'),
  },
  {
    id: 'E', key: 'next_run', title: 'THE NEXT RUN', kind: 'courier', boardEligible: false,
    boardText: null, hudOnAccept: 'CONTRACT 47-A: STATUS: CLOSED. CONTRACT 47-B: STATUS: PENDING.',
    resolution: 'No title. Thin coin. Another manifest opens.',
    confirmPrompt: 'ACCEPT THE NEXT RUN?',
    confirmHint: '47-A closes for 1,200 cr. No pardon, no rank. Only currently available alternatives need to be declined.',
    graffitiBulkhead: null, graffitiHome: 'YOU KNEW THE MASS AND YOU TOOK THE COIN.',
    sandboxMode: 'working_pilot', alignment: null,
    world: { sectorId: 'sector_ashfall_reach', declineAll: ['A', 'B', 'C', 'D'] },
    consequenceIntents: { rep: [], heatClear: null, credits: 1200, creditReason: 'contract_47a_settlement',
      flags: ['contract_47a_closed', 'contract_47b_pending'], contract47bPending: true, loopBack: false },
    continuity: continuation('contract_47b', 'CONTRACT 47-B', 'mission:completed', 2,
      'post47a_next_manifest', 'Complete two contracts under the next manifest.'),
  },
]);
export const SANDBOX_DEF = freeze({
  id: SANDBOX_ID, key: 'open_frontier', title: 'THE OPEN FRONTIER', kind: 'sandbox', isEnding: false,
  boardText: null, boardEligible: false, hudOnAccept: 'NO FINAL DISPOSITION FILED. OPERATIONS CONTINUE.',
  resolution: 'No ending. The count continues. Fly.', confirmPrompt: 'CONTINUE WITHOUT FINAL DISPOSITION?',
  confirmHint: 'Not an ending. World preserved. No disposition rewards. This run will not file another disposition.',
  graffitiBulkhead: null, graffitiHome: null, sandboxMode: SANDBOX_MODE_OPEN_FRONTIER,
  consequenceIntents: { rep: [], heatClear: null, credits: 0, flags: ['sandbox_continued', 'no_final_disposition'], loopBack: false },
  continuity: continuation('open_frontier', 'OPEN FRONTIER', 'sector:enter', 5,
    'post47a_open_frontier', 'Chart five distinct regions without filing a disposition.'),
});
export function endingDef(id) {
  if (isSandboxId(id)) return SANDBOX_DEF;
  return ENDING_DEFS.find(d => d.id === id || d.key === id || d.sandboxMode === id) || null;
}
export const listEndingDefs = () => ENDING_DEFS.slice();
export const isEndingId = id => ENDING_IDS.includes(id);
export const isSandboxId = id => id === SANDBOX_ID || id === 'sandbox' || id === 'open_frontier';
