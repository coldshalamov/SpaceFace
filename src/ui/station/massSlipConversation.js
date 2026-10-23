import { normalizeMassScaleState } from '../../systems/cargoCustody.js';

const STATION = 'station_helios';
const OFFER = 'eco_mass_scale_weight_audit_station_helios';
const SLIP = `mass-slip:${OFFER}:0`;
const PREFIX = 'weight_slip:';

// This is the existing Helios audit, not any document that happens to mention weight.
// The evidence owner retains authority; this conversation only reads its saved record.
function auditSlip(state, stationId) {
  if (stationId !== STATION || state?.ui?.docked !== true
      || state.ui.dockedStationId !== STATION) return null;
  const slip = normalizeMassScaleState(state.economyContracts?.massScale).slips[SLIP];
  if (!slip || slip.kind !== 'weight_audit' || slip.issuingStationId !== STATION
      || slip.sourceOfferId !== OFFER || slip.targetSlot !== 0
      || slip.issuer !== 'Helios Variance Office' || slip.reference !== '47-A'
      || slip.declaredMassT !== 20 || !slip.discrepant) return null;
  return slip;
}

// Bind a rendered choice to the exact retained measurement. A late click cannot silently
// retarget to replacement evidence after Continue/new game or another mission incarnation.
function choiceId(slip) {
  return PREFIX + encodeURIComponent(JSON.stringify([
    slip.slipId, slip.missionId, slip.declaredMassT, slip.measuredMassT,
  ]));
}

export function kesslerWeightSlipChoice(state, stationId) {
  const slip = auditSlip(state, stationId);
  return slip ? { id: choiceId(slip), label: 'Show the weight slip.' } : null;
}

export function kesslerWeightSlipReply(state, stationId, selectedId) {
  if (typeof selectedId !== 'string' || !selectedId.startsWith(PREFIX)) return null;
  const slip = auditSlip(state, stationId);
  if (!slip || selectedId !== choiceId(slip)) return { text: 'Bring the original. I do not weigh a story.' };
  const figures = `Declared ${slip.declaredMassT} t. Your line read ${slip.measuredMassT} t.`;
  const filed = slip.filedAtStations[STATION]?.outcome === 'mass_discrepancy_filed';
  return { text: filed
    ? `${figures} The office filed the difference. The seal still says what it said. Keep the original.`
    : `${figures} You have a weight slip. Customs has no filing. Keep the original.` };
}
