import { deferredEnterNow } from '../core/sectorEnterDefer.js';
// Read-only return conversation. careerContracts owns every receipt, run and board offer.
export const SORI_COMPARISON_CONTACT_ID = 'contact_sori_ven_comparison';
const CONTRACT = 'prospector_veil_volatiles';
const STATION = 'station_veil';
const STAGES = ['calibrate_the_veil', 'draw_helium_envelope', 'deliver_to_triton'];
const TYPES = ['recon_scan', 'mining_quota', 'bulk_trade'];
const integer = (n) => Number.isInteger(n) && n >= 0;
const token = (s) => typeof s === 'string' && s.trim().length > 0;

export function soriComparisonMemory(state, stationId) {
  if (stationId !== STATION) return null;
  const own = state?.missions?.careerContracts;
  const run = own?.runs?.[CONTRACT];
  if (!run || run.contractId !== CONTRACT || !integer(run.cycle)
    || !integer(run.stageIndex) || run.stageIndex > 3
    || !['ready', 'offered', 'active', 'recovering', 'completed'].includes(run.status)) return null;
  if (!Array.isArray(own.receipts) || !Array.isArray(own.settledMissionIds)) return null;
  const rows = own.receipts.filter((row) => row?.contractId === CONTRACT
    && row.stageId === 'deliver_to_triton' && row.outcome === 'completed');
  if (!rows.length) return null;
  // Do not skip malformed/future completion evidence and silently tell an older success instead.
  if (rows.some((row) => row.careerId !== 'prospector' || row.stageIndex !== 2
    || row.sectorId !== 'sector_triton_wake' || !integer(row.cycle) || row.cycle > run.cycle
    || !integer(row.attempt) || !token(row.id) || !token(row.missionId)
    || !own.settledMissionIds.includes(row.missionId))) return null;
  const latestCycle = Math.max(...rows.map((row) => row.cycle));
  const latest = rows.filter((row) => row.cycle === latestCycle);
  // The settlement owner emits one completion per cycle. Conflicting or duplicate records fail closed.
  if (latest.length !== 1) return null;
  const receipt = latest[0];
  const current = receipt.cycle === run.cycle;
  if (current && (!Array.isArray(run.completedStages) || run.status !== 'completed' || run.stageIndex !== 3
    || !STAGES.every((id) => run.completedStages?.includes(id)))) return null;
  return { receipt, run, current };
}

function currentOffer(state, memory) {
  const run = memory.run;
  if (run.status !== 'offered' || run.stageIndex >= STAGES.length
    || !token(run.offerId) || !token(run.fingerprint) || !integer(run.attempt)) return null;
  const slots = state?.missions?.boards?.[STATION]?.slots;
  if (!Array.isArray(slots)) return null;
  const matching = slots.filter((offer) => offer?.id === run.offerId);
  if (matching.length !== 1) return null;
  const offer = matching[0];
  // The missions owner initializes config. Without it, do not guess its default cadence.
  const refresh = state.missions.config?.refreshSec;
  const now = deferredEnterNow(state);
  if (!Number.isFinite(refresh) || refresh <= 0 || !Number.isFinite(now)) return null;
  const epoch = Math.floor((now || 0) / refresh);
  if (Number.isFinite(offer.expiresAtEpoch) && offer.expiresAtEpoch <= epoch) return null;
  const cause = offer.cause;
  if (offer.source !== 'careerContract' || offer.stationId !== STATION
    || offer.type !== TYPES[run.stageIndex] || cause?.contractId !== CONTRACT
    || cause.careerId !== 'prospector' || cause.actorId !== 'actor_sori_ven'
    || cause.stageIndex !== run.stageIndex || cause.stageId !== STAGES[run.stageIndex]
    || cause.cycle !== run.cycle || cause.attempt !== run.attempt
    || cause.fingerprint !== run.fingerprint) return null;
  return offer;
}

export function soriComparisonContact(state, stationId) {
  const memory = soriComparisonMemory(state, stationId);
  if (!memory) return null;
  return {
    id: SORI_COMPARISON_CONTACT_ID,
    name: 'Dr. Sori Ven', role: 'engineer', roleLabel: 'DMC Assayer', factionId: 'faction_dmc',
    canonicalKey: 'sori_comparison',
    line: memory.current
      ? 'Triton accepted the envelope. Now the comparison is not mine alone. That was the point.'
      : 'Your last envelope reached Triton. I still prefer a second instrument to a second opinion.',
    choices: [
      { id: 'comparison', label: 'Why a separate lab?' },
      { id: 'work', label: 'What are you working on?' },
      { id: 'leave', label: 'Leave you to it.' },
    ],
  };
}

export function soriComparisonReply(state, stationId, choiceId) {
  const memory = soriComparisonMemory(state, stationId);
  if (!memory) return { text: 'Let me check the comparison record before I put my name to it.' };
  if (choiceId === 'comparison') return {
    text: 'I can calibrate my own instrument until it agrees with me. I need another lab that can tell me I am wrong. Getting the envelope there gives us that chance; it does not settle what made the Veil.',
  };
  if (choiceId === 'work') {
    const offer = currentOffer(state, memory);
    if (offer) return {
      text: 'A fresh order, not a second payment for the last envelope. The current terms are on the board. Read them before you take it.',
      missionOffer: offer,
    };
    if (memory.run.status === 'active' && (state.missions.active || []).some((mission) =>
      mission?.id === memory.run.missionId && mission.status === 'active'
      && mission.cause?.contractId === CONTRACT && mission.cause.cycle === memory.run.cycle
      && mission.cause.fingerprint === memory.run.fingerprint)) return {
      text: 'The order you took is still open. Follow its current instructions in your Mission Log. The last envelope does not finish this one.',
    };
    return { text: memory.current
      ? 'No current order of mine is posted here. You can leave this comparison with us; there is no extra delivery to make.'
      : 'I have no current order on this board to offer you. A previous envelope is not a new assignment.' };
  }
  if (choiceId === 'leave') return { text: 'Thank you. A useful measurement does not need an audience.' };
  return { text: 'One question at a time. I have enough overlapping signals.' };
}
