// project.js — the one authoritative Breakwater Spur project record and its
// pure progression transitions. Services, physical and freight adapters read
// and mutate this row through the runtime; none keeps an independent counter.

import {
  BREAKWATER_ROW_VERSION, BREAKWATER_PHASE, BREAKWATER_CHARTER,
  BREAKWATER_STOCK, BREAKWATER_COOP_JOBS, BREAKWATER_BONDED,
  BREAKWATER_BOUNDS, BREAKWATER_CARTRIDGES, BREAKWATER_SOCKET_IDS,
  breakwaterRecordId,
} from './definition.js';

const PH = BREAKWATER_PHASE;

export function createBreakwaterRow() {
  return {
    v: BREAKWATER_ROW_VERSION,
    phase: PH.DARK,
    stage: 0,
    discoveredAt: null,
    visitCount: 0,
    surveyed: { socket_drive: false, socket_drum: false, console: false },
    sockets: {
      drive: { status: 'empty', cartridgeRole: null, seatedAt: null },
      drum: { status: 'empty', cartridgeRole: null, seatedAt: null },
    },
    cartridges: {
      drive: mkCartridgeRow('drive'),
      drum: mkCartridgeRow('drum'),
    },
    // Fixed-step seat watches — {entityId, generation, since} per socket.
    seatWatch: { drive: null, drum: null },
    looseLoad: null,          // {kind:'supply'|'consignment', worldRecordId, status, entityId, generation}
    commission: { status: 'none', paidAt: null },
    charter: BREAKWATER_CHARTER.NONE,
    coop: {
      stock: { repair: 0, fuel: 0 },
      jobs: {
        scrap: { status: 'open', paid: false },
        supply: { status: 'open', paid: false },
        defend: { status: 'open', paid: false, haulerJobId: null },
      },
    },
    bonded: {
      bond: { status: 'none', postedAt: null, refundedAt: null, forfeitedAt: null },
      job: { status: 'open', paid: false },
    },
    freight: {
      hauler: null,           // {worldRecordId, jobId, entityId, generation, phase, purpose}
      itinerary: [],          // bounded log of true transitions
    },
    raider: null,             // {entityId, generation, status}
    pendingPayouts: {},       // one accepted work receipt per authored award
    receipts: [],             // bounded player-facing receipt history
    seq: 0,
    restored: false,
  };
}

function mkCartridgeRow(role) {
  return {
    role,
    worldRecordId: breakwaterRecordId(`cartridge_${role}`),
    status: 'loose',          // loose | unconfirmed | seated | lost
    everSpawned: false,
    entityId: null, generation: 0,
    hull: BREAKWATER_CARTRIDGES[role].hullMax,
    hullMax: BREAKWATER_CARTRIDGES[role].hullMax,
    damaged: false, seatedAt: null, lostAt: null, lostReason: null,
  };
}

// --- derived views ---------------------------------------------------------

export function cartridgesSeated(row) {
  let n = 0;
  for (const id of BREAKWATER_SOCKET_IDS) if (row.sockets[id]?.status === 'seated') n++;
  return n;
}

export function cartridgeLost(row) {
  return Object.values(row.cartridges).some(c => c.status === 'lost');
}

export function surveyComplete(row) {
  return row.surveyed.socket_drive && row.surveyed.socket_drum && row.surveyed.console;
}

export function recomputeStage(row) {
  // Physical stage: 0 dead lamps/empty sockets · 1 one arm supported + one lamp
  // · 2 both seated + continuous lights · 3 operating freight berth.
  const seated = cartridgesSeated(row);
  let stage = seated;
  if (row.commission.status === 'paid' && row.charter !== BREAKWATER_CHARTER.NONE) stage = 3;
  row.stage = stage;
  return stage;
}

export function recomputePhase(row) {
  const seated = cartridgesSeated(row);
  if (row.phase === PH.FAILED || row.phase === PH.DEGRADED) return row.phase;
  if (cartridgeLost(row)) {
    row.phase = row.commission.status === 'paid' ? PH.DEGRADED : PH.FAILED;
    return row.phase;
  }
  if (row.commission.status === 'paid') {
    row.phase = row.charter !== BREAKWATER_CHARTER.NONE ? PH.OPERATING : PH.COMMISSIONED;
  } else if (seated >= 2) row.phase = PH.READY;
  else if (seated >= 1 || row.surveyed.socket_drive || row.surveyed.socket_drum) {
    row.phase = surveyComplete(row) ? PH.RESTORING : PH.RESTORING;
  } else if (surveyComplete(row)) row.phase = PH.SURVEYED;
  else if (row.phase !== PH.DARK) row.phase = PH.SIGNALED;
  return row.phase;
}

// The single "next useful action" the whole UI surfaces — never a 0/100 bar.
export function nextActionFor(row) {
  const seated = cartridgesSeated(row);
  switch (row.phase) {
    case PH.DARK: return null;
    case PH.SIGNALED: return 'Close on the signal and inspect the spur.';
    case PH.SURVEYED: {
      const missing = [];
      if (!row.surveyed.socket_drive) missing.push('drive socket');
      if (!row.surveyed.socket_drum) missing.push('drum socket');
      if (!row.surveyed.console) missing.push('dispatcher console');
      return missing.length ? `Inspect the ${missing.join(' and ')}.` : 'Inspect the dispatcher console.';
    }
    case PH.RESTORING:
      if (seated < 2) {
        const need = [];
        if (Object.values(row.cartridges).some(c=>c.status==='unconfirmed')) return 'An original is unconfirmed. Check its last known location; the spur cannot seat a replacement.';
        if (row.cartridges.drive.status === 'loose') need.push('drive cartridge');
        if (row.cartridges.drum.status === 'loose') need.push('drum cartridge');
        if (row.cartridges.drive.status === 'lost' || row.cartridges.drum.status === 'lost') {
          return 'Original lost — the spur cannot be completed.';
        }
        return `Recover the ${need.join(' and ')} from the salvage pocket and seat ${need.length === 2 ? 'them' : 'it'}.`;
      }
      return 'Return to the dispatcher console to commission the spur.';
    case PH.READY: return 'Commission the spur at the dispatcher console (4 scrap + 1 salvage electronics).';
    case PH.COMMISSIONED: return 'Choose the berth charter — cooperative berth or bonded freight.';
    case PH.OPERATING: return operatingAction(row);
    case PH.DEGRADED: return 'The spur runs degraded — an original was lost after commissioning.';
    case PH.FAILED: return 'An original cartridge was destroyed. The spur stays a dead frame.';
    default: return null;
  }
}

function operatingAction(row) {
  if (row.charter === BREAKWATER_CHARTER.COOP) {
    const j = row.coop.jobs;
    if (row.looseLoad?.status === 'waiting') return 'Tow the supply cartridge onto the receiving shelf.';
    if (row.freight.hauler) return 'A supply mule is on approach — keep the lane clear.';
    if (j.scrap.status === 'open') return `Bring ${BREAKWATER_COOP_JOBS.scrap.qty} scrap to the shelf (${BREAKWATER_COOP_JOBS.scrap.pay} CR).`;
    if (j.supply.status === 'open') return 'Recover the reserve supply cartridge for the berth (160 CR).';
    if (j.defend.status === 'open') return 'Stand by for the scheduled unload — cover it (180 CR).';
    return 'Berth services available — repair and refuel while stock lasts.';
  }
  if (row.charter === BREAKWATER_CHARTER.BONDED) {
    const c = row.looseLoad;
    if (row.bonded.job.status === 'done') return 'Bonded run complete — freight terms on the console.';
    if (!c) return `Post the ${BREAKWATER_BONDED.bondCr} CR bond and take the sealed consignment.`;
    if (c.status === 'waiting') return 'Take custody of the sealed consignment and haul for Belt Outpost.';
    if (c.status === 'in_transit') return 'Tow the consignment to the Belt Outpost southeast receiving mark; settle below 4 WU/s and keep the line attached.';
    if (c.status === 'delivered') return 'Consignment handed off — return to the spur for settlement.';
    if (c.status === 'lost') return 'Consignment lost — the bond is forfeit.';
    return 'Return to the dispatcher console.';
  }
  return null;
}

// --- receipts (bounded, player-facing facts) -------------------------------

export function pushReceipt(row, text, simTime, kind = 'info') {
  row.receipts.push({ at: simTime, kind, text });
  if (row.receipts.length > BREAKWATER_BOUNDS.receipts) {
    row.receipts.splice(0, row.receipts.length - BREAKWATER_BOUNDS.receipts);
  }
}

export function logItinerary(row, text, simTime) {
  row.freight.itinerary.push({ at: simTime, text });
  if (row.freight.itinerary.length > BREAKWATER_BOUNDS.itineraryLog) {
    row.freight.itinerary.splice(0, row.freight.itinerary.length - BREAKWATER_BOUNDS.itineraryLog);
  }
}

export function nextSeq(row, prefix) {
  row.seq = (row.seq || 0) + 1;
  return `${prefix}:${row.seq}`;
}
