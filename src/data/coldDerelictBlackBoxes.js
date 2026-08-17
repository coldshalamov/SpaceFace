// Plan 53 projection for the already-physical Plan 26 cold-derelict recorder route. The durable
// receipt stores stable aftermath/lot identity only; authored log language is projected here.

export const COLD_DERELICT_BLACK_BOX_SOURCE_KIND = 'cold_derelict_black_box';

function cleanText(value, fallback = null, max = 160) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text ? text.slice(0, max) : fallback;
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

export function normalizeColdDerelictBlackBoxReceipt(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const markerId = cleanText(input.markerId);
  const lotId = cleanText(input.lotId);
  const provenanceId = cleanText(input.provenanceId);
  if (!markerId || !lotId || !provenanceId
    || input.sourceKind !== COLD_DERELICT_BLACK_BOX_SOURCE_KIND) return null;
  return Object.freeze({
    sourceKind: COLD_DERELICT_BLACK_BOX_SOURCE_KIND,
    markerId,
    lotId,
    provenanceId,
    sectorId: cleanText(input.sectorId),
    zoneId: cleanText(input.zoneId),
    zoneName: cleanText(input.zoneName, 'an unmarked lane'),
    victimClass: cleanText(input.victimClass, 'unregistered hull'),
    victimLabel: cleanText(input.victimLabel, 'Unregistered Hull'),
    victimFactionId: cleanText(input.victimFactionId),
    confirmedKillerTrack: input.confirmedKillerTrack === true,
    lossTick: Math.floor(finite(input.lossTick)),
    lostAt: finite(input.lostAt),
    recoveredAt: finite(input.recoveredAt),
  });
}

function projectRecord(receipt) {
  const causeLine = receipt.confirmedKillerTrack
    ? 'The recorder retained a confirmed firing track. The transponder name did not survive the cooling cycle.'
    : 'No confirmed firing track survived the cooling cycle.';
  return Object.freeze({
    ...receipt,
    title: `${receipt.victimLabel} — Cold Recorder`,
    logs: Object.freeze([
      Object.freeze({ stamp: 'HULL', text: `${receipt.victimLabel}, logged as ${receipt.victimClass}, went dark in ${receipt.zoneName}.` }),
      Object.freeze({ stamp: 'TRACK', text: causeLine }),
      Object.freeze({ stamp: 'COLD', text: 'The hull cooled past fresh recovery. One recorder remained sealed behind the marked hatch.' }),
      Object.freeze({ stamp: 'RECOVERY', text: 'Massline held the wreck steady. The cut plate cleared, and Cargo accepted the recorder intact.' }),
    ]),
    note: 'Field note: scan a cold hulk before cutting, stabilize it on the Massline, and leave one unit of hold space for the loose recorder.',
  });
}

export function coldDerelictBlackBoxRecords(story = {}) {
  const source = story && story.flags && story.flags.codexLore
    && story.flags.codexLore.blackBoxes && story.flags.codexLore.blackBoxes.coldDerelict;
  if (!source || typeof source !== 'object' || Array.isArray(source)) return [];
  return Object.values(source)
    .map(normalizeColdDerelictBlackBoxReceipt)
    .filter(Boolean)
    .sort((a, b) => (a.recoveredAt - b.recoveredAt) || a.markerId.localeCompare(b.markerId))
    .map(projectRecord);
}
