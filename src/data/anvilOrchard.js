// The Orchard's finite ledger. Native poses and current-world authority are never saved here.
export const ANVIL_ORCHARD = Object.freeze({
  id: 'anvil_storm_orchard', sectorId: 'sector_tethys_junction',
  planetId: 'planet_tethys_anvil', commodityId: 'cmdty_gas_hydrogen',
  schemaVersion: 1, socketCount: 3, unitsPerPod: 4, cyclesPerSocket: 4,
  totalUnits: 48, openingSteps: 30, calmTicks: 600, forecastTicks: 120, gustTicks: 300,
});

const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const object = (o) => !!o && typeof o === 'object' && !Array.isArray(o)
  && (Object.getPrototypeOf(o) === Object.prototype || Object.getPrototypeOf(o) === null);
const integer = (v, min, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(v) && v >= min && v <= max;
const tick = (v) => v === null || integer(v, 0);
const statuses = new Set(['empty', 'stowed', 'releasing', 'drifting', 'delivered', 'lost']);
const operations = new Set(['closed', 'opening', 'open', 'closing']);
const handoffs = new Set(['fixed', 'requested', 'ready']);

export function orchardLotId(socket, cycle) {
  return `${ANVIL_ORCHARD.id}:${socket}:${cycle}`;
}

export function createOrchardRecord(tick = 0) {
  if (!integer(tick, 0)) throw new TypeError('Invalid Orchard creation tick');
  return {
    schemaVersion: 1, id: ANVIL_ORCHARD.id, phaseAnchorTick: tick,
    sourceRemaining: ANVIL_ORCHARD.totalUnits, frameStatus: 'intact', lots: [],
    sockets: Array.from({ length: 3 }, (_, socket) => ({
      socket, cycle: 0, lotId: null, status: 'empty', operation: 'closed', progress: 0,
      handoff: 'fixed', targetRevision: null, acceptedTick: null, completedTick: null,
      openedTick: null, readyTick: null,
      mountLostWork: 0, mountLostTick: null,
    })),
  };
}

/** Pure, bounded projection. Invalid current data is refused rather than replenished. */
export function normalizeOrchardRecord(value) {
  if (!object(value) || value.schemaVersion !== 1 || value.id !== ANVIL_ORCHARD.id
    || !integer(value.phaseAnchorTick, 0) || !integer(value.sourceRemaining, 0, 48)
    || !['intact', 'destroyed'].includes(value.frameStatus)
    || !Array.isArray(value.lots) || value.lots.length > 12
    || !Array.isArray(value.sockets) || value.sockets.length !== 3) return null;
  const lots = [], byId = new Map();
  let allocated = 0;
  for (const row of value.lots) {
    if (!object(row) || !integer(row.socket, 0, 2) || !integer(row.cycle, 1, 4)
      || row.id !== orchardLotId(row.socket, row.cycle) || byId.has(row.id)
      || !integer(row.units, 1, 4) || !['retained', 'delivered', 'lost'].includes(row.outcome)) return null;
    const lot = { id: row.id, socket: row.socket, cycle: row.cycle, units: row.units, outcome: row.outcome };
    lots.push(lot); byId.set(lot.id, lot); allocated += lot.units;
  }
  if (allocated + value.sourceRemaining !== 48) return null;
  const sockets = [];
  for (let i = 0; i < 3; i++) {
    const s = value.sockets[i];
    if (!object(s) || s.socket !== i || !integer(s.cycle, 0, 4) || !statuses.has(s.status)
      || !operations.has(s.operation) || !integer(s.progress, 0, 30) || !handoffs.has(s.handoff)
      || !tick(s.acceptedTick) || !tick(s.completedTick) || !tick(s.openedTick) || !tick(s.readyTick) || !tick(s.mountLostTick)
      || !integer(s.mountLostWork, 0, 30)
      || !(s.targetRevision === null || integer(s.targetRevision, 2))) return null;
    const socketLots = lots.filter((lot) => lot.socket === i).sort((a, b) => a.cycle - b.cycle);
    if (socketLots.length !== s.cycle || socketLots.some((lot, n) => lot.cycle !== n + 1)) return null;
    const current = s.cycle ? byId.get(orchardLotId(i, s.cycle)) : null;
    if (s.lotId !== (current?.id ?? null) || (!current && s.status !== 'empty')) return null;
    if (socketLots.slice(0, -1).some((lot) => lot.outcome === 'retained')) return null;
    if (current) {
      const outcome = ['delivered', 'lost'].includes(s.status) ? s.status : 'retained';
      if (current.outcome !== outcome || s.status === 'empty') return null;
    }
    if (s.acceptedTick !== null && s.acceptedTick < value.phaseAnchorTick) return null;
    if (s.completedTick !== null && (s.acceptedTick === null || s.completedTick < s.acceptedTick + s.progress)) return null;
    if (s.progress > 0 && (s.acceptedTick === null || s.completedTick === null)) return null;
    if (s.openedTick !== null && (s.acceptedTick === null || s.completedTick === null
      || s.openedTick < s.acceptedTick + 30 || s.openedTick > s.completedTick)) return null;
    if (s.operation === 'open' && s.openedTick === null) return null;
    if (s.operation === 'closing' && (s.acceptedTick === null || s.completedTick === null
      || (s.openedTick === null ? s.status !== 'lost' : s.completedTick < s.openedTick + 30 - s.progress))) return null;
    if (s.operation === 'closed' && s.openedTick !== null && s.completedTick < s.openedTick + 30) return null;
    if (s.mountLostWork > 0 && (s.acceptedTick === null || s.mountLostTick === null
      || s.mountLostTick < (s.completedTick ?? s.acceptedTick) + s.mountLostWork)) return null;
    if (s.mountLostWork === 0 && s.mountLostTick !== null) return null;
    if ((s.operation === 'closed' && s.progress !== 0) || (s.operation === 'open' && s.progress !== 30)) return null;
    if (s.status === 'stowed' && (s.progress !== 0 || s.operation !== 'closed' || s.handoff !== 'fixed' || s.acceptedTick !== null || s.completedTick !== null || s.openedTick !== null)) return null;
    const mountLost = value.frameStatus === 'destroyed' && s.mountLostWork === 30;
    if ((s.handoff !== 'fixed' || s.status === 'drifting') && !(s.openedTick !== null || mountLost)) return null;
    if ((s.status === 'drifting' || s.status === 'delivered') && s.handoff !== 'ready') return null;
    if (s.status === 'releasing' && (s.acceptedTick === null || !['opening', 'open'].includes(s.operation))) return null;
    if (s.handoff === 'requested' && s.status !== 'releasing') return null;
    if (s.handoff === 'ready' && !['drifting', 'delivered', 'lost'].includes(s.status)) return null;
    if (s.handoff === 'ready') {
      const releaseTick = s.openedTick ?? (mountLost ? s.mountLostTick : null);
      if (s.readyTick === null || releaseTick === null || s.readyTick < releaseTick) return null;
    } else if (s.readyTick !== null) return null;
    if (!current && (s.handoff !== 'fixed' || s.progress !== 0 || s.operation !== 'closed' || s.acceptedTick !== null || s.completedTick !== null)) return null;
    if ((s.handoff === 'fixed') !== (s.targetRevision === null)) return null;
    if (value.frameStatus === 'intact' && (s.mountLostWork !== 0 || s.mountLostTick !== null)) return null;
    sockets.push({ socket: i, cycle: s.cycle, lotId: s.lotId, status: s.status,
      operation: s.operation, progress: s.progress, handoff: s.handoff,
      targetRevision: s.targetRevision, acceptedTick: s.acceptedTick, completedTick: s.completedTick,
      openedTick: s.openedTick, readyTick: s.readyTick,
      mountLostWork: s.mountLostWork, mountLostTick: s.mountLostTick });
  }
  return { schemaVersion: 1, id: ANVIL_ORCHARD.id, phaseAnchorTick: value.phaseAnchorTick,
    sourceRemaining: value.sourceRemaining, frameStatus: value.frameStatus, lots, sockets };
}

export function readOrchardSaveSection(sites) {
  if (!sites || !own(sites, 'anvilOrchard') || sites.anvilOrchard === null) return null;
  const record = normalizeOrchardRecord(sites.anvilOrchard);
  if (!record) throw new TypeError('Invalid saved Anvil Orchard custody');
  return record;
}

export function orchardPhase(record, currentTick) {
  if (!integer(record?.phaseAnchorTick, 0) || !integer(currentTick, 0)) return null;
  const elapsed = Math.max(0, currentTick - record.phaseAnchorTick) % 1020;
  if (elapsed < 600) return { phase: 'calm', remainingTicks: 600 - elapsed };
  if (elapsed < 720) return { phase: 'forecast', remainingTicks: 720 - elapsed };
  return { phase: 'gust', remainingTicks: 1020 - elapsed };
}


export function orchardHistoryFitsTick(record, currentTick) {
  if (record === null) return true;
  return integer(currentTick, 0) && record.phaseAnchorTick <= currentTick
    && record.sockets.every(socket => ['acceptedTick', 'completedTick', 'openedTick', 'readyTick', 'mountLostTick']
      .every(key => socket[key] === null || socket[key] <= currentTick));
}
