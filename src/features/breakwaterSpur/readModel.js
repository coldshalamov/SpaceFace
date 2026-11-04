// readModel.js — the detached bounded Breakwater Spur projection. UI and the
// prompt adapter read this; nothing here mutates state and nothing here holds
// live entity references across a frame.

import {
  BREAKWATER_SITE_ID, BREAKWATER_SECTOR_ID, BREAKWATER_SITE_LOCAL,
  BREAKWATER_POI_ID, BREAKWATER_CONTACT_ID, BREAKWATER_DISPATCHER,
  BREAKWATER_PHASE, BREAKWATER_CHARTER, BREAKWATER_STOCK,
  BREAKWATER_COMMISSION_COST, BREAKWATER_COOP_JOBS, BREAKWATER_BONDED,
  BREAKWATER_CARTRIDGES, BREAKWATER_SOCKETS, BREAKWATER_CONSIGNMENT,
} from './definition.js';
import { nextActionFor, cartridgesSeated, surveyComplete } from './project.js';
import { sectorLocalToGlobalForSector } from '../../data/sectorCoordinates.js';

const PH = BREAKWATER_PHASE;

function finite(n, fallback = 0) { return Number.isFinite(n) ? n : fallback; }

export function breakwaterSiteGlobal() {
  return sectorLocalToGlobalForSector(
    { x: BREAKWATER_SITE_LOCAL.x, z: BREAKWATER_SITE_LOCAL.z },
    BREAKWATER_SECTOR_ID,
  );
}

export function getBreakwaterSpurStatus(state) {
  const row = state.world.breakwaterSpur;
  if (!row) return null;
  const seated = cartridgesSeated(row);
  const status = {
    present: true,
    siteId: BREAKWATER_SITE_ID,
    sectorId: BREAKWATER_SECTOR_ID,
    phase: row.phase,
    stage: row.stage,
    dispatcher: BREAKWATER_DISPATCHER,
    charter: row.charter,
    seated,
    survey: { ...row.surveyed },
    surveyComplete: surveyComplete(row),
    cartridges: {
      drive: cartridgeStatus(row, 'drive'),
      drum: cartridgeStatus(row, 'drum'),
    },
    commission: { ...row.commission },
    stock: row.charter === BREAKWATER_CHARTER.COOP ? { ...row.coop.stock, caps: { ...BREAKWATER_STOCK } } : null,
    jobs: row.charter === BREAKWATER_CHARTER.COOP
      ? {
          scrap: { status: row.coop.jobs.scrap.status, pay: BREAKWATER_COOP_JOBS.scrap.pay, qty: BREAKWATER_COOP_JOBS.scrap.qty },
          supply: { status: row.coop.jobs.supply.status, pay: BREAKWATER_COOP_JOBS.supply.pay },
          defend: { status: row.coop.jobs.defend.status, pay: BREAKWATER_COOP_JOBS.defend.pay },
        }
      : row.charter === BREAKWATER_CHARTER.BONDED
        ? {
            consignment: {
              status: row.bonded.job.status,
              bond: row.bonded.bond.status,
              bondCr: BREAKWATER_BONDED.bondCr,
              payCr: BREAKWATER_BONDED.payCr,
              loadStatus: row.looseLoad?.status || null,
            },
          }
        : null,
    looseLoad: row.looseLoad ? { kind: row.looseLoad.kind, status: row.looseLoad.status } : null,
    hauler: row.freight.hauler ? { phase: row.freight.hauler.phase, purpose: row.freight.hauler.purpose } : null,
    raiderActive: !!row.raider,
    receipts: row.receipts.slice(-4).map(r => ({ at: r.at, kind: r.kind, text: r.text })),
    itinerary: row.freight.itinerary.slice(-3).map(r => ({ at: r.at, text: r.text })),
    nextAction: nextActionFor(row),
  };
  return status;
}

function cartridgeStatus(row, role) {
  const c = row.cartridges[role];
  if (!c) return null;
  return {
    role, status: c.status, damaged: !!c.damaged,
    hull: finite(c.hull, 0), hullMax: finite(c.hullMax, 0),
    label: BREAKWATER_CARTRIDGES[role].label,
  };
}

// Distance/direction read for HUD surfaces — detached numbers only.
export function breakwaterDistanceTo(state) {
  const p = state.entities?.get?.(state.playerId);
  const row = state.world?.breakwaterSpur;
  if (!p?.pos || !row || row.phase === PH.DARK) return null;
  const site = breakwaterSiteGlobal();
  const dx = site.x - p.pos.x, dz = site.z - p.pos.z;
  return { distance: Math.hypot(dx, dz), bearing: Math.atan2(dx, dz) };
}

// Contact/map route — one quiet marker once the signal is received; the
// galaxyMap contact layer consumes this the same way it does the tender's.
export function readBreakwaterSpurPresentation(state) {
  // A Continue facade may retain an older saved row. The worker's current view,
  // including an explicit clear, is authoritative for presentation.
  if (state && Object.hasOwn(state, 'breakwaterSpurView')) return state.breakwaterSpurView;
  return state?.world?.breakwaterSpur || null;
}

export function getBreakwaterSpurMapMarkers(state, sectorId) {
  const row = readBreakwaterSpurPresentation(state);
  if (!row || sectorId !== BREAKWATER_SECTOR_ID || row.phase === PH.DARK) return [];
  const stageLabel = row.stage <= 0 ? 'dark frame'
    : row.stage === 1 ? 'half-restored'
    : row.stage === 2 ? 'restored frame'
    : row.charter === BREAKWATER_CHARTER.COOP ? 'co-op berth' : 'bonded berth';
  return [{
    id: BREAKWATER_POI_ID,
    kind: 'poi', poiType: 'breakwater_spur',
    name: 'Breakwater Spur',
    x: BREAKWATER_SITE_LOCAL.x, z: BREAKWATER_SITE_LOCAL.z,
    drawPos: { x: BREAKWATER_SITE_LOCAL.x, z: BREAKWATER_SITE_LOCAL.z },
    coursePos: { x: BREAKWATER_SITE_LOCAL.x, z: BREAKWATER_SITE_LOCAL.z },
    courseLabel: 'Breakwater Spur',
    courseArrivalRadius: 60,
    stageId: `stage_${row.stage}`,
    stageLabel,
    statusLine: row.nextAction || nextActionFor(row) || stageLabel,
  }];
}

// Decision-deck offers — built from the row only, with a revision the adapter
// echoes back so stale choices are refused.
export function buildBreakwaterSpurOffer(state) {
  const row = state.world.breakwaterSpur;
  if (!row || row.phase === PH.DARK) return null;
  const status = getBreakwaterSpurStatus(state);
  const actions = [];
  const base = {
    revision: `${row.phase}:${row.stage}:${row.seq}`,
    sender: `${BREAKWATER_DISPATCHER.toUpperCase()} · BREAKWATER DISPATCH`,
    siteId: BREAKWATER_SITE_ID,
  };
  switch (row.phase) {
    case PH.SIGNALED:
      return {
        ...base, kind: 'inspect', title: 'Breakwater Spur — dead loading frame',
        detail: 'An H-shaped freight spur, dark. Two socket cradles on the receiving shelf and a dispatcher console are all that is left working.',
        actions: [...actions, { id: 'course', label: 'Mark course' }, { id: 'close', label: 'Leave' }],
        status,
      };
    case PH.SURVEYED:
    case PH.RESTORING: {
      const carts = status.cartridges;
      const detail = [
        `Sockets: drive ${row.sockets.drive.status}, drum ${row.sockets.drum.status}.`,
        `Cartridges: drive — ${cartLabel(carts.drive)}; drum — ${cartLabel(carts.drum)}.`,
        'Both originals lie in the salvage pocket to the south-west.',
      ].join(' ');
      if (canSeat(row, 'drive')) actions.push({ id: 'seat:drive', label: 'Seat drive cartridge' });
      if (canSeat(row, 'drum')) actions.push({ id: 'seat:drum', label: 'Seat drum cartridge' });
      addCartridgeRepairs(row,actions);
      actions.push({ id: 'course_pocket', label: 'Mark salvage pocket' }, { id: 'close', label: 'Leave' });
      return { ...base, kind: 'restore', title: 'Breakwater Spur — restoration', detail, actions, status };
    }
    case PH.READY: {
      const c = BREAKWATER_COMMISSION_COST;
      addCartridgeRepairs(row,actions);
      actions.push(
        { id: 'commission', label: `Commission the spur (${c.scrap} scrap + ${c.electronics} electronics)` },
        { id: 'close', label: 'Not yet' },
      );
      return {
        ...base, kind: 'commission', title: 'Breakwater Spur — commission',
        detail: 'Both cartridges seated. Vale can put the spur on the books for the commissioning stock — real parts, debited once.',
        actions, status,
      };
    }
    case PH.COMMISSIONED:
      actions.push(
        { id: 'charter:coop', label: 'Cooperative berth — repair, refuel, honest work' },
        { id: 'charter:bonded', label: 'Bonded freight — posted bond, better pay, real risk' },
      );
      return {
        ...base, kind: 'charter', title: 'Choose the berth charter',
        detail: 'The charter is permanent. Co-op runs stock and scheduled hauls; bonded forwards sealed freight against a posted bond.',
        actions, status,
      };
    case PH.OPERATING:
    case PH.DEGRADED:
      return operatingOffer(row, base, status, actions);
    case PH.FAILED:
      return {
        ...base, kind: 'failed', title: 'Breakwater Spur — dead frame',
        detail: 'An original cartridge was destroyed. The frame stands; the project is over.',
        actions: [{ id: 'close', label: 'Leave' }], status,
      };
    default:
      return null;
  }
}

function cartLabel(c) {
  if (!c) return 'unknown';
  if (c.status === 'lost') return 'lost';
  if (c.status === 'unconfirmed') return 'location unconfirmed';
  if (c.status === 'seated') return c.damaged ? `seated (damaged, ${Math.round(c.hull)} hull)` : 'seated';
  return c.damaged ? `loose (damaged, ${Math.round(c.hull)} hull)` : 'loose in the pocket';
}

function canSeat(row, socketRole) {
  return (row.seatWatch[socketRole]?.since || 0) >= 1.5;
}

function addCartridgeRepairs(row,actions) {
  for (const role of ['drive','drum']) {
    const c=row.cartridges[role];
    if (c.status==='seated' && c.damaged && c.hull>0) {
      const price=Math.max(1,Math.round((c.hullMax-c.hull)*.9));
      actions.push({id:`repair:${role}`,label:`Repair ${role} cartridge (${price} CR)`});
    }
  }
}

function operatingOffer(row, base, status, actions) {
  addCartridgeRepairs(row,actions);
  if (row.charter === BREAKWATER_CHARTER.COOP) {
    const j = row.coop.jobs;
    const detail = [
      `Stock — repair ${row.coop.stock.repair}/${BREAKWATER_STOCK.repairCap}, fuel ${row.coop.stock.fuel}/${BREAKWATER_STOCK.fuelCap}.`,
      status.nextAction || '',
    ].join(' ');
    if (j.scrap.status === 'open') {
      actions.push({ id: 'job:scrap', label: `Deliver ${BREAKWATER_COOP_JOBS.scrap.qty} scrap (${BREAKWATER_COOP_JOBS.scrap.pay} CR)` });
    }
    if (j.supply.status === 'open' && !row.looseLoad) {
      actions.push({ id: 'job:supply', label: `Recover supply cartridge (${BREAKWATER_COOP_JOBS.supply.pay} CR)` });
    }
    if (j.defend.status === 'open' && !row.freight.hauler) {
      actions.push({ id: 'job:defend', label: `Cover the scheduled unload (${BREAKWATER_COOP_JOBS.defend.pay} CR)` });
    }
    if (row.looseLoad?.kind === 'supply' && row.looseLoad.status !== 'lost') {
      actions.push({ id: 'deliver:supply', label: 'Hand supply cartridge to the shelf' });
    }
    if (status.stock.repair > 0 || status.stock.fuel > 0) {
      actions.push({ id: 'service:repair', label: `Repair hull (${status.stock.repair} in stock)` });
      actions.push({ id: 'service:fuel', label: `Refuel (${status.stock.fuel} in stock)` });
    }
    actions.push({ id: 'close', label: 'Leave' });
    return { ...base, kind: 'berth', title: 'Breakwater Spur — co-op berth', detail, actions, status };
  }
  const load = row.looseLoad;
  const detail = [
    `Bond: ${row.bonded.bond.status} · ${BREAKWATER_BONDED.bondCr} CR required. After the outpost accepts the consignment, return to the spur for ${BREAKWATER_BONDED.payCr} CR and the bond refund. A lost consignment forfeits the bond.`,
    status.nextAction || '',
  ].join(' ');
  if (row.bonded.bond.status === 'none' && row.bonded.job.status === 'open') {
    actions.push({ id: 'job:bonded', label: `Post ${BREAKWATER_BONDED.bondCr} CR bond — take the consignment` });
  }
  if (load?.kind === 'consignment' && load.status === 'delivered') {
    actions.push({ id: 'settle:bonded', label: `Settle the run (${BREAKWATER_BONDED.payCr} CR + bond)` });
  }
  actions.push({ id: 'intel', label: 'Freight terms' }, { id: 'close', label: 'Leave' });
  return { ...base, kind: 'bonded', title: 'Breakwater Spur — bonded freight', detail, actions, status };
}
