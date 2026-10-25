// Imported only by missions. Traffic owns remembered captains; missions owns history,
// ordinary board offers, acceptance, objective progress, payment, and standing-order cycles.
import { SECTORS } from '../data/sectors.js';
import { hash32 } from '../core/rng.js';
import { promotedPilotIdentity } from '../data/pilotCallsigns.js';
const STATIONS = new Map(SECTORS.flatMap(sector => (sector.stations || []).map(station => [station.id,
  { ...station, sectorId: sector.id, sector, factionId: station.factionId || sector.factionId }])));
const clone = value => JSON.parse(JSON.stringify(value));

/** Types that can earn a regular desk client. The three long-career types sit with the original seven. */
export const STANDING_CLIENT_TYPES = Object.freeze([
  'cargo_delivery', 'patrol_clear', 'bounty_hunt', 'mining_quota', 'recon_scan',
  'passenger_transport', 'escort', 'tow_recovery', 'bulk_trade', 'salvage_retrieval',
]);

/** Same-sector and neighbour berths, in catalog order. The relief run's first pick stays index 0. */
export function reliefDestinations(originId) {
  const origin = STATIONS.get(originId);
  if (!origin) return [];
  const neighbors = origin.sector?.neighbors || [];
  const out = [];
  for (const station of STATIONS.values()) {
    if (station.id === originId) continue;
    if (station.sectorId === origin.sectorId || neighbors.includes(station.sectorId)) out.push(station);
  }
  return out;
}

/**
 * One axis of the rescued captain's relief run. Cycle 0 and 1 stay food ×2 / 360 cr / first neighbour.
 * Cycle ≥3 changes exactly one axis from hash32(captainId, cycle).
 */
export function reliefOfferShape(captainId, cycle, originId) {
  const destinations = reliefDestinations(originId);
  const base = {
    cmdtyId: 'cmdty_food',
    qty: 2,
    reward_cr: 360,
    dest: destinations[0] || null,
  };
  const n = Math.max(0, Math.floor(Number(cycle) || 0));
  if (n < 3 || !base.dest) return base;
  let axis = hash32(captainId, n) % 3;
  if (axis === 2 && destinations.length < 2) axis = 1;
  if (axis === 0) return { ...base, cmdtyId: 'cmdty_ice_water' };
  if (axis === 1) return { ...base, reward_cr: 480 };
  return { ...base, dest: destinations[1] };
}

/** Display name only. The desk id string stays `desk:<station>:<type>`. */
export function deskClientName(stationId, type) {
  return promotedPilotIdentity(hash32(stationId, type), `${stationId}:${type}`).name;
}

/** "N of 3" for a type that has started and has not pinned yet. Count 3 is the offer, not this line. */
export function standingOrderProgressLines(state, stationId) {
  if (!stationId) return [];
  const rows = state?.missions?.standingOrders;
  if (!Array.isArray(rows)) return [];
  const lines = [];
  for (const row of rows) {
    if (!row || row.stationId !== stationId) continue;
    const count = Number(row.count) || 0;
    if (count < 1 || count >= 3) continue;
    const label = String(row.type || 'contract').replaceAll('_', ' ');
    lines.push(`${count} of 3 ${label}`);
  }
  return lines;
}

export function normalizeStandingOrders(raw) {
  return Array.isArray(raw) ? raw.filter(row => row?.stationId && row?.type && row?.template)
    .slice(-24).map(row => ({ ...clone(row), count: Math.max(0, Math.min(3, Number(row.count) || 0)),
      cycle: Math.max(0, Math.floor(Number(row.cycle) || 0)),
      seen: Array.isArray(row.seen) ? row.seen.map(String).slice(-8) : [] })) : [];
}

export function noteStandingOrderCompletion(state, mission) {
  if (!mission?.stationId || !mission.type) return;
  if (mission.source === 'captainStandingOrder') {
    const captainId = mission.cause?.captainId;
    if (captainId) {
      const cycles = state.missions.captainOrderCycles || (state.missions.captainOrderCycles = {});
      cycles[captainId] = { cycle: (cycles[captainId]?.cycle || 0) + 1, dueAtS: (state.simTime || 0) + 600 };
      while (Object.keys(cycles).length > 24) delete cycles[Object.keys(cycles)[0]];
    }
    const row = state.missions.standingOrders?.find(item => item.id === mission.cause?.standingOrderId);
    if (row) row.cycle++;
    return;
  }
  if (mission.storyTag || (mission.source && mission.source !== 'economyContract')
    || !STANDING_CLIENT_TYPES.includes(mission.type)) return;
  const rows = state.missions.standingOrders || (state.missions.standingOrders = []);
  const id = `standing:${mission.stationId}:${mission.type}`;
  let row = rows.find(item => item.id === id);
  if (!row) { row = { id, stationId: mission.stationId, type: mission.type, count: 0, cycle: 0, seen: [], template: {} };
    rows.push(row); if (rows.length > 24) rows.shift(); }
  if (row.seen.includes(String(mission.id))) return;
  row.seen.push(String(mission.id)); row.seen = row.seen.slice(-8); row.count = Math.min(3, row.count + 1);
  const fields = ['type', 'factionId', 'destStationId', 'destSectorId', 'params', 'reward_cr', 'collateral_cr',
    'riskTier', 'preloadedCargo', 'duration_s', 'time_limit_s', 'distance', 'minRep', 'economyTerms'];
  row.template = Object.fromEntries(fields.filter(key => mission[key] !== undefined).map(key => [key, clone(mission[key])]));
}

export function syncCaptainStandingOrders(host, info, board) {
  const state = host.state;
  if (!board?.slots || !info?.id) return false;
  let changed = false;
  // Reconcile only unaccepted relief offers whose remembered cause is positively obsolete.
  // Roster eviction is bounded forgetting, not evidence of death; unknown rows stay intact.
  // Accepted contracts live in missions.active and retain their recorded terms.
  const roster = state.traffic?.captainRoster || [];
  const currentSlots = board.slots.filter(offer => {
    if (offer?.source !== 'captainStandingOrder' || offer.cause?.tag !== 'remembered_captain') return true;
    const captainId = offer.cause.captainId;
    if (!captainId) return true;
    const captain = roster.find(row => row.id === captainId);
    if (captain?.alive === false) return false;
    const cycle = state.missions.captainOrderCycles?.[captainId]?.cycle;
    const prefix = `captain-order:${hash32(captainId).toString(36)}:`;
    const suffix = typeof offer.id === 'string' && offer.id.startsWith(prefix) ? offer.id.slice(prefix.length) : '';
    // Only a known, older native cycle can be superseded; malformed/foreign identities are not proof.
    return !(Number.isSafeInteger(cycle) && /^(0|[1-9]\d*)$/.test(suffix)
      && Number.isSafeInteger(Number(suffix)) && Number(suffix) < cycle);
  });
  if (currentSlots.length !== board.slots.length) { board.slots = currentSlots; changed = true; }
  const candidates = [];
  for (const captain of state.traffic?.captainRoster || []) {
    const orderState = state.missions.captainOrderCycles?.[captain.id];
    if (!captain.alive || !(captain.outcomes?.rescued > 0) || captain.homeStationId !== info.id
      || (state.simTime || 0) < (orderState?.dueAtS ?? captain.orderDueAtS ?? 0)) continue;
    const cycle = orderState?.cycle || 0;
    const shape = reliefOfferShape(captain.id, cycle, info.id);
    const destination = shape.dest;
    if (!destination) continue;
    const goods = shape.cmdtyId === 'cmdty_ice_water' ? 'ice water' : 'provisions';
    const runNo = cycle >= 2 ? ` #${cycle}` : '';
    candidates.push({ id: `captain-order:${hash32(captain.id).toString(36)}:${cycle}`,
      source: 'captainStandingOrder', giverId: captain.id, clientId: captain.id,
      stationId: info.id, factionId: info.factionId, type: 'cargo_delivery',
      destStationId: destination.id, destSectorId: destination.sectorId,
      reward_cr: shape.reward_cr, collateral_cr: 0, preloadedCargo: true, riskTier: 1, minRep: -149,
      time_limit_s: 1800, duration_s: 1800,
      params: { cmdtyId: shape.cmdtyId, qty: shape.qty, taskTime: 20, fValue: 1 },
      title: `${captain.name} — standing relief run${runNo}`,
      summary: `${captain.name} remembers your rescue. Carry two units of ${goods} to ${destination.name}. This client will keep a route open for you.`,
      cause: { tag: 'remembered_captain', captainId: captain.id },
    });
  }
  for (const row of state.missions.standingOrders || []) {
    if (row.stationId !== info.id || row.count < 3) continue;
    const clientName = deskClientName(info.id, row.type);
    const typeLabel = row.type.replaceAll('_', ' ');
    candidates.push({ ...clone(row.template), id: `${row.id}:${row.cycle}`, source: 'captainStandingOrder',
      stationId: info.id, giverId: `desk:${info.id}:${row.type}`, clientId: `desk:${info.id}:${row.type}`,
      title: `${clientName} — standing ${typeLabel}`,
      summary: `${clientName} keeps a ${typeLabel} desk at ${info.name}. Three finished runs earned the next one.`,
      cause: { tag: 'standing_client', standingOrderId: row.id },
    });
  }
  // Existing valid rows consume capacity, including saved legacy extras. Never trim earned
  // rows just to meet the admission limit, and never let an ineligible early client starve later ones.
  let standingCount = board.slots.filter(offer => offer?.source === 'captainStandingOrder').length;
  for (const offer of candidates) {
    if (standingCount >= 3) break;
    if (board.slots.some(row => row?.id === offer.id)
      || state.missions.active?.some(mission => mission?.giverId === offer.giverId)
      || state.missions.receipts?.some(receipt => receipt?.sourceOfferId === offer.id)) continue;
    board.slots.push(offer); standingCount++; changed = true;
  }
  return changed;
}
