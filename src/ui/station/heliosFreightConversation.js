import { commodityDisplayName } from '../commodityNames.js';
import { counted } from '../numberFormat.js';


const STATION = 'station_helios';
const SECTOR = 'sector_helios_prime';
const PREFIX = 'helios_freight:';

// The aftermath system owns the incident, and custodyConsequences owns the actual recovery.
// This desk is a reader of both; it does not create cargo, work, payments, or a second ledger.
function openingCause(state, stationId) {
  if (stationId !== STATION || state?.ui?.docked !== true || state.ui.dockedStationId !== STATION) return null;
  const causes = state?.aftermathWrecks?.causes;
  if (!causes || typeof causes !== 'object' || Array.isArray(causes)) return null;
  const rows = Object.values(causes).filter((row) => row && row.shapeId === 'opening_hauler_raid'
    && row.sectorId === SECTOR && typeof row.fingerprint === 'string' && row.fingerprint
    && ['defended', 'robbed', 'hauler_destroyed', 'raid_over'].includes(row.outcome));
  rows.sort((a, b) => (Number(b.createdTick) || 0) - (Number(a.createdTick) || 0)
    || String(a.fingerprint).localeCompare(String(b.fingerprint)));
  return rows[0] || null;
}

function choiceId(cause) { return PREFIX + encodeURIComponent(cause.fingerprint); }

export function kesslerFreightChoice(state, stationId) {
  const cause = openingCause(state, stationId);
  return cause ? { id: choiceId(cause), label: 'What happened to the hauler?' } : null;
}

function recoveryCase(state, cause) {
  const key = `raid:${cause.fingerprint}`;
  const row = state?.player?.custodyLedger?.raidAftermath?.[key];
  if (!row || row.key !== key || row.fingerprint !== cause.fingerprint || row.sectorId !== SECTOR
    || !Array.isArray(row.lines) || !row.survivors || typeof row.survivors !== 'object') return null;
  return row;
}

function remainingLine(row, cause) {
  if (!row) return null;
  const lines = row.lines.filter((line) => line && line.manifestId === cause.manifestId
    && line.commodityId === cause.commodityId && Number.isFinite(line.qty)
    && Number.isFinite(line.returnedQty) && line.qty > line.returnedQty && line.returnedQty >= 0);
  return lines.length === 1 ? lines[0] : null;
}

function matchingWork(state, cause, row, line) {
  if (!row || !line || row.status !== 'open') return { active: false, offer: null };
  const key = row.key;
  const matches = (mission) => mission?.source === 'custodyRecovery'
    && mission.type === 'cargo_delivery' && mission.cause?.tag === 'raid_custody'
    && mission.cause.fingerprint === key && mission.cause.manifestId === cause.manifestId
    && mission.params?.cmdtyId === line.commodityId && mission.stationId === STATION
    && mission.destStationId === STATION && mission.destSectorId === SECTOR;
  const active = (state?.missions?.active || []).some((mission) => matches(mission) && mission.status === 'active');
  if (active) return { active: true, offer: null };
  const slots = state?.missions?.boards?.[STATION]?.slots;
  if (!Array.isArray(slots)) return { active: false, offer: null };
  const offers = slots.filter(matches);
  if (offers.length !== 1) return { active: false, offer: null };
  const offer = offers[0];
  const completed = (state?.missions?.receipts || []).some((receipt) => receipt?.source === 'custodyRecovery'
    && receipt.sourceOfferId === offer.id && receipt.outcome === 'completed');
  // A cumulative spill can change the obligation while the mission owner retains
  // this same posting. Its quantity is a posted term, not a fresh custody count.
  const valid = !completed && typeof offer.id === 'string' && offer.id.trim()
    && Number.isInteger(offer.params?.qty) && offer.params.qty > 0
    && typeof offer.title === 'string' && offer.title.trim();
  return { active: false, offer: valid ? offer : null };
}

export function kesslerFreightReply(state, stationId, selectedId) {
  if (typeof selectedId !== 'string' || !selectedId.startsWith(PREFIX)) return null;
  const cause = openingCause(state, stationId);
  if (!cause || selectedId !== choiceId(cause)) return { text: 'I need the current lane record in front of me.' };
  const outcome = {
    defended: 'The hauler survived the raid. The attack ended.',
    robbed: 'Raiders got away with freight from that hauler.',
    hauler_destroyed: 'The hauler was destroyed on the freight lane.',
    raid_over: 'The last report left the hauler and raiders on the lane. I have no later result on this slip.',
  }[cause.outcome];
  const row = recoveryCase(state, cause);
  if (!row) return { text: `${outcome} I have no freight handback recorded here.` };

  const line = remainingLine(row, cause);
  const people = Object.values(row.survivors);
  const pending = people.filter((person) => person?.outcome === 'pending').length;
  const freight = line ? `${line.qty - line.returnedQty}u ${commodityDisplayName(line.commodityId)} remain unreturned.`
    : row.lines.some((entry) => entry?.manifestId === cause.manifestId && entry.commodityId === cause.commodityId
      && Number.isFinite(entry.qty) && entry.qty > 0 && entry.returnedQty >= entry.qty)
      ? 'The recorded freight has been returned.' : 'I have no remaining freight quantity on this record.';
  const crew = pending ? ` ${counted(pending, 'survivor', 'survivors')} still awaiting resolution.` : '';
  const work = matchingWork(state, cause, row, line);
  if (work.active) return { text: `${outcome} ${freight}${crew} Your recovery ticket is open; the Mission Log has it.` };
  if (work.offer) return {
    text: `${outcome} ${freight}${crew} The recovery ticket is posted for ${work.offer.params.qty}u ${commodityDisplayName(line.commodityId)}; the current outstanding amount is ${line.qty - line.returnedQty}u. The dock checks the custody record at handback; partial returns are accepted.`,
    missionOffer: work.offer,
  };
  return { text: `${outcome} ${freight}${crew}` };
}
