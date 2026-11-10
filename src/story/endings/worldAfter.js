// Filed dispositions have places, bodies and executable market terms. Read-only: the story
// choice is the save authority, traffic materializes bodies, and economy applies these terms.
import { postEndingReplayChain } from '../../data/postEndingReplayChains.js';

const fact = (factionId, trafficLabel, positionLabel, buy, sell, beacons = 0) => Object.freeze({
  sectorId: 'sector_ashfall_reach', stationId: 'station_ashcache', factionId,
  trafficLabel, positionLabel, buy, sell, beacons,
});

export const ENDING_WORLD_FACTS = Object.freeze({
  A: fact('faction_scn', 'Concord auxiliary picket', 'Concord cache approach watch', 1.12, 1, 0),
  B: fact('faction_quiet', 'Quiet routing courier', 'Syndicate channel keeper', 0.90, 0.96, 2),
  C: fact('faction_dmc', 'Loop calibration surveyor', 'Return-bearing observer', 0.96, 1, 1),
  D: fact('faction_free', 'Current Desk evidence courier', 'Witness transfer watch', 1.08, 1.06, 0),
  E: fact('faction_mts', '47-B relief carrier', 'Broker 47-B dispatch courier', 0.94, 0.98, 0),
});

export function endingWorldFact(state, sectorId = null) {
  const row = ENDING_WORLD_FACTS[state?.story?.endgameChoice] || null;
  if (row && state.story.endgameChoice === 'B' && sectorId === 'sector_sker_haven') {
    return { ...row, sectorId, stationId: 'station_sker' };
  }
  return row;
}

export function endingStationTradeMults(state, stationId) {
  const row = endingWorldFact(state);
  const local = row?.stationId === stationId
    || (state?.story?.endgameChoice === 'B' && stationId === 'station_sker');
  return local ? { buy: row.buy, sell: row.sell } : { buy: 1, sell: 1 };
}

// The durable flags, rather than the current cycle/branch, retain every completed decision.
// Old saves already contain these flags, so they acquire readers without replaying a reward.
export function replayWorldConsequences(state) {
  const run = state?.missions?.postEndingReplay;
  const chain = run && postEndingReplayChain(run.choiceId);
  if (!chain || chain.id !== run.chainId) return [];
  return chain.branches.filter(branch => Number(run.worldFlags?.[branch.consequence.worldFlag]?.count) > 0)
    .map(branch => ({ ...branch.consequence, branchId: branch.id, label: branch.label,
      stationId: branch.finale.boardStationId }));
}

export function replayStandingLines(state) {
  return replayWorldConsequences(state).map(row => {
    const verb = row.branchId === 'shield' ? 'You shielded this route' : `You chose ${row.label}`;
    return `${verb}. ${row.worldFlag.replaceAll('_', ' ')} remains in force.`;
  });
}
