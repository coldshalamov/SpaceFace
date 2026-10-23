// Imported only by missions. Traffic owns remembered captains; missions owns history,
// ordinary board offers, acceptance, objective progress, payment, and standing-order cycles.
import { SECTORS } from '../data/sectors.js';
import { hash32 } from '../core/rng.js';
const STATIONS = new Map(SECTORS.flatMap(sector => (sector.stations || []).map(station => [station.id,
  { ...station, sectorId: sector.id, sector, factionId: station.factionId || sector.factionId }])));
const clone = value => JSON.parse(JSON.stringify(value));

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
    || !['cargo_delivery', 'patrol_clear', 'bounty_hunt', 'mining_quota', 'recon_scan', 'passenger_transport', 'escort'].includes(mission.type)) return;
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
  const candidates = [];
  for (const captain of state.traffic?.captainRoster || []) {
    const orderState = state.missions.captainOrderCycles?.[captain.id];
    if (!captain.alive || !(captain.outcomes?.rescued > 0) || captain.homeStationId !== info.id
      || (state.simTime || 0) < (orderState?.dueAtS ?? captain.orderDueAtS ?? 0)) continue;
    const origin = STATIONS.get(info.id);
    const destination = [...STATIONS.values()].find(station => station.id !== info.id
      && (station.sectorId === origin?.sectorId || origin?.sector?.neighbors?.includes(station.sectorId)));
    if (!destination) continue;
    candidates.push({ id: `captain-order:${hash32(captain.id).toString(36)}:${orderState?.cycle || 0}`,
      source: 'captainStandingOrder', giverId: captain.id, clientId: captain.id,
      stationId: info.id, factionId: info.factionId, type: 'cargo_delivery',
      destStationId: destination.id, destSectorId: destination.sectorId,
      reward_cr: 360, collateral_cr: 0, preloadedCargo: true, riskTier: 1, minRep: -149,
      time_limit_s: 1800, duration_s: 1800,
      params: { cmdtyId: 'cmdty_food', qty: 2, taskTime: 20, fValue: 1 },
      title: `${captain.name} — standing relief run`,
      summary: `${captain.name} remembers your rescue. Carry two units of provisions to ${destination.name}. This client will keep a route open for you.`,
      cause: { tag: 'remembered_captain', captainId: captain.id },
    });
  }
  for (const row of state.missions.standingOrders || []) {
    if (row.stationId !== info.id || row.count < 3) continue;
    candidates.push({ ...clone(row.template), id: `${row.id}:${row.cycle}`, source: 'captainStandingOrder',
      stationId: info.id, giverId: `desk:${info.id}:${row.type}`, clientId: `desk:${info.id}:${row.type}`,
      title: `Standing order — ${row.type.replaceAll('_', ' ')}`,
      summary: `Three completed ${row.type.replaceAll('_', ' ')} contracts earned a regular client at ${info.name}. The next run stays on this board.`,
      cause: { tag: 'standing_client', standingOrderId: row.id },
    });
  }
  for (const offer of candidates.slice(0, 3)) {
    if (board.slots.some(row => row?.id === offer.id)
      || state.missions.active?.some(mission => mission?.giverId === offer.giverId)
      || state.missions.receipts?.some(receipt => receipt?.sourceOfferId === offer.id)) continue;
    board.slots.push(offer); changed = true;
  }
  return changed;
}
