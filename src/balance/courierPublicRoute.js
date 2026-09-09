// M3 Courier public-route timing harness (Hauler freight career).
//
// Closes the authored-settlement gap for the courier/hauler origin: cargo_delivery + bulk_trade
// objectives, real cargo authority (preloaded hold / market buy-sell), missions→economy payout,
// market causality, operating/repair/retry costs, travel-time authority, and mid-route save restore.
// Independent of the Hunter public route. Credit settlement always goes through registered
// missions + economy authorities — never direct wallet or cargo mutation.

import { createSimulation } from '../core/sim.js';
import { planGateScene } from '../data/gateControl.js';
import { COMMODITIES } from '../data/commodities.js';
import { MISSION_TUNING } from '../data/missions.js';
import { NEW_GAME } from '../data/newGameDefaults.js';
import { SECTORS } from '../data/sectors.js';
import { SHIPS } from '../data/ships.js';
import {
  HAULER_COMPLETION_REWARD,
  HAULER_FAIL_RETRY_COOLDOWN_S,
  HAULER_STEPS,
  haulerRewardMultiplier,
} from '../careers/origins/haulerOriginData.js';
import { HAULER_ROLE_HULL_DEF_ID } from '../careers/ladders/haulerLadderDefs.js';
import { careerOrigins as careerOriginsSystem } from '../careers/origins/careerOrigins.js';
import { cargo as cargoSystem } from '../systems/cargo.js';
import { combat as combatSystem } from '../systems/combat.js';
import { economy as economySystem, SERVICE_PRICES } from '../systems/economy.js';
import { factions as factionsSystem } from '../systems/factions.js';
import { missions as missionsSystem } from '../systems/missions.js';
import {
  ships as shipsSystem,
  makeShipEntitySpec,
  fittingsFromDefaultModules,
} from '../systems/ships.js';
import { world as worldSystem } from '../systems/world.js';
import { save as saveSystem } from '../save/saveSystem.js';
import { scalarHitToDamagePacket } from '../combat/damage.js';

export const COURIER_PUBLIC_ROUTE_SCHEMA = 'spaceface.m3.courierPublicRoute.v2';
export const COURIER_PUBLIC_ROUTE_SEED = 0xC0B0_A091;
/** Healthy band aligns with career-cohort hauler lo floor (A_T1 * 0.45 = 112.5). */
export const COURIER_HEALTHY_CR_PER_MIN = 112.5;
export const COURIER_DEAD_CR_PER_MIN = 50;
export const COURIER_ROUTE_HORIZONS_MIN = Object.freeze([30, 60, 90]);
export const COURIER_HAULER_COHORT_REFERENCE = Object.freeze({ 30: 384.93, 60: 338.55, 90: 282.02 });
/** Meaningful first-window bank progress without pretending the wrong hull is the career goal. */
export const COURIER_30M_CAPITAL_PROGRESS_CR = 15_000;
export const COURIER_ROLE_HULL_DEF_ID = HAULER_ROLE_HULL_DEF_ID;
const COURIER_ROLE_HULL = SHIPS.find((ship) => ship.id === COURIER_ROLE_HULL_DEF_ID);
/** The first Courier ship target is the authored Mule, not the 15k mining Pelican. */
export const COURIER_FIRST_SHIP_TARGET_CR = COURIER_ROLE_HULL?.price ?? 0;
export const COURIER_ROLE_HULL_DEADLINE_MIN = 90;

/** Clean first-pass origin: three step base rewards + completion award (attempt-0, no haircut). */
export const COURIER_ORIGIN_CLEAN_GROSS_ENVELOPE_CR = HAULER_STEPS.reduce(
  (sum, step) => sum + (step.baseRewardCr | 0),
  0,
) + (HAULER_COMPLETION_REWARD.credits | 0);

const DOCK_OVERHEAD_S = 18;
const TRANSIT_WEAR_HP = 6;
const REPAIR_READINESS_GATE = 0.88;
const HOME_SECTOR_ID = NEW_GAME.startingSectorId;
const HOME_STATION_ID = 'station_helios';
const COURIER_BOARD_STATIONS = Object.freeze([
  'station_helios', 'station_ceres', 'station_beltout', 'station_coalition',
  'station_tethys', 'station_customs', 'station_forge',
]);

// Owned-seam pacing knobs (Courier-only). Tune here if the live route proves nonviable —
// do not edit shared career/mission/economy data from this harness.
export const COURIER_ROUTE_PACING = Object.freeze({
  /** Extra action seconds after each delivery dock (manifest paperwork / yard beat). */
  deliveryHandlingS: 10,
  /** Extra action seconds for a market buy or sell ticket. */
  marketTicketS: 8,
  /** Fractional hull wear applied per inter-sector leg (× TRANSIT_WEAR_HP). */
  transitWearScale: 1,
  /**
   * Board-loop preference: prefer cargo_delivery over bulk_trade when both are affordable.
   * Kept as a pacing preference only — does not invent board offers.
   */
  preferDelivery: true,
  /**
   * Max gate+scene toll (cr) a board contract may spend relative to its reward before the
   * courier route skips it for same-sector freight. Prevents high-sec gate bleed from
   * falsely killing an otherwise solvent courier without weakening authored risk.
   */
  maxBoardTollFracOfReward: 0.22,
  /** Hard ceiling on outbound+return toll for any single board hop. */
  maxBoardTollCr: 90,
  /** Prefer freestyle same-sector arbitrage after this many consecutive board skips. */
  arbAfterBoardSkips: 1,
  /** Use the live hull's available hold; market stock and wallet remain the natural lot limits. */
  arbMaxUnits: null,
});

const SECTOR_BY_ID = new Map(SECTORS.map((s) => [s.id, s]));
const STATION_TO_SECTOR = new Map();
const STATION_BY_ID = new Map();
for (const sec of SECTORS) {
  for (const st of sec.stations || []) {
    STATION_TO_SECTOR.set(st.id, sec);
    STATION_BY_ID.set(st.id, st);
  }
}
const _MathRandom = Math.random;
const _DateNow = Date.now;
let _blocked = false;

export function blockNondeterminism() {
  if (_blocked) return;
  _blocked = true;
  Math.random = () => { throw new Error('Math.random forbidden in courier public route'); };
  Date.now = () => { throw new Error('Date.now forbidden in courier public route'); };
}

export function restoreNondeterminism() {
  if (!_blocked) return;
  _blocked = false;
  Math.random = _MathRandom;
  Date.now = _DateNow;
}

function withDateAllowed(fn) {
  const prev = Date.now;
  Date.now = _DateNow;
  try { return fn(); }
  finally { Date.now = prev; }
}

export function round(n) { return Math.round(Number(n) || 0); }
export function round1(n) { return Math.round((Number(n) || 0) * 10) / 10; }
export function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

export function sectorDistanceWu(aSectorId, bSectorId) {
  if (!aSectorId || !bSectorId || aSectorId === bSectorId) return 600;
  const a = SECTOR_BY_ID.get(aSectorId);
  const b = SECTOR_BY_ID.get(bSectorId);
  if (!a || !b || !a.position || !b.position) return 1800;
  const dx = b.position.x - a.position.x;
  const dy = b.position.y - a.position.y;
  return clamp(600 + Math.hypot(dx, dy) * 650, 600, 6000);
}

export function travelTimeS(aSectorId, bSectorId) {
  return sectorDistanceWu(aSectorId, bSectorId) / (MISSION_TUNING.cruiseSpeedRef || 140);
}

export function stationTravelTimeS(aStationId, bStationId) {
  const a = STATION_BY_ID.get(aStationId);
  const b = STATION_BY_ID.get(bStationId);
  if (!a || !b || !a.pos || !b.pos) {
    return travelTimeS(STATION_TO_SECTOR.get(aStationId)?.id, STATION_TO_SECTOR.get(bStationId)?.id);
  }
  return Math.hypot(b.pos.x - a.pos.x, b.pos.z - a.pos.z) / (MISSION_TUNING.cruiseSpeedRef || 140);
}

function highSecGateToll(sector) {
  if (!sector) return 0;
  return sector.security > 0.6 ? Math.round(50 + 200 * sector.security) : 0;
}

function routeTollAmount(seed, fromSectorId, toSectorId, dayIndex = 0) {
  if (!fromSectorId || !toSectorId || fromSectorId === toSectorId) return 0;
  const to = SECTOR_BY_ID.get(toSectorId);
  const scene = planGateScene(seed, fromSectorId, toSectorId, dayIndex, {
    factionId: to && to.factionId,
    security: to && to.security,
    wanted: false,
  });
  return highSecGateToll(to) + (scene.tollAmount || 0);
}

function emptyBudget() {
  return { simS: 0, travelS: 0, actionS: 0, recoveryS: 0, idleS: 0 };
}

function emptyCosts() {
  return {
    tollCost: 0, repairCost: 0, missionCost: 0, insuranceCost: 0, ammoCost: 0, researchSpend: 0,
  };
}

function playerEntity(ctx) {
  return ctx.state.entities.get(ctx.state.playerId) || null;
}

function advanceTime(ctx, dt, budget, bucket = 'actionS') {
  const requested = Math.max(0, Number(dt) || 0);
  const remaining = Number.isFinite(ctx.horizonS)
    ? Math.max(0, ctx.horizonS - (ctx.state.simTime || 0))
    : requested;
  const d = Math.min(requested, remaining);
  if (d <= 0) return 0;
  // The headless sim's core is the time authority. This advances tick, simTime, playtime,
  // registered system updates, and queued-event flushing through the same deterministic seam.
  ctx.sim.step(d);
  budget.simS += d;
  if (bucket && budget[bucket] != null) budget[bucket] += d;
  return d;
}

function tryChargeToll(ctx, amount, reason, costs) {
  const cr = round(amount);
  if (cr <= 0) return { ok: true, charged: 0 };
  const have = ctx.state.player.credits | 0;
  if (have < cr) return { ok: false, charged: 0, have, need: cr };
  const before = have;
  ctx.econ.chargeCredits(cr, reason);
  const after = ctx.state.player.credits | 0;
  if (before - after !== cr) return { ok: false, charged: before - after, have: before, need: cr };
  costs.tollCost += cr;
  return { ok: true, charged: cr };
}

function tryTravel(ctx, {
  fromSectorId, toSectorId, travelS, reason, seed, costs, budget, dayIndex = 0,
  applyWear = true,
}) {
  const toll = routeTollAmount(seed, fromSectorId, toSectorId, dayIndex);
  const pay = tryChargeToll(ctx, toll, reason, costs);
  if (!pay.ok) {
    return {
      ok: false, reason: 'unaffordable_toll', toll, have: pay.have, need: pay.need,
    };
  }
  ctx.bus.emit('dock:undocked', { stationId: ctx.currentStationId || null });
  ctx.currentStationId = null;
  advanceTime(ctx, travelS, budget, 'travelS');
  const entered = ctx.world && typeof ctx.world.enterSector === 'function'
    ? ctx.world.enterSector(toSectorId, {
      fromJump: true,
      via: 'courier_public_route',
      fromSectorId,
      placePlayer: true,
    })
    : null;
  if (!entered || ctx.state.world.currentSectorId !== toSectorId) {
    return { ok: false, reason: 'world_travel_authority_failed', toll: pay.charged, travelS };
  }
  if (applyWear && fromSectorId && toSectorId && fromSectorId !== toSectorId) {
    applyTransitWear(ctx, TRANSIT_WEAR_HP * (COURIER_ROUTE_PACING.transitWearScale || 1));
  }
  return { ok: true, toll: pay.charged, travelS };
}

function applyTransitWear(ctx, damageHp) {
  const e = playerEntity(ctx);
  if (!e || !(e.hullMax > 0)) return;
  const dmg = Math.max(0, Number(damageHp) || 0);
  const before = e.hull || e.hullMax;
  const damagePacket = scalarHitToDamagePacket({
    // Compensate for the combat model's subsystem share so this remains about 6 hull HP per leg.
    damage: dmg * 4.2,
    damageType: 'kinetic',
    penetration: 0,
    shieldBypass: 1,
    pos: { x: e.pos.x, z: e.pos.z },
    source: { kind: 'transit_wear', id: 'courier_public_route' },
  });
  damagePacket.flags = { allowAnyTarget: true, ignoreFriendlyFire: true, ignoreInvulnerability: true };
  const result = ctx.combat && typeof ctx.combat.onHit === 'function'
    ? ctx.combat.onHit({
      targetId: e.id,
      ownerId: null,
      damagePacket,
      pos: { x: e.pos.x, z: e.pos.z },
      origin: { kind: 'transit_wear', id: 'courier_public_route' },
    })
    : null;
  if (Array.isArray(ctx.transitDamageReceipts)) {
    ctx.transitDamageReceipts.push({
      atS: round1(ctx.state.simTime || 0),
      ok: !!(result && result.ok),
      reason: result && result.reason || null,
      hullDamage: round2(result && result.hullDamage || 0),
      armorDamage: round2(result && result.armorDamage || 0),
      shieldDamage: round2(result && result.shieldDamage || 0),
    });
  }
  if (!result || result.ok === false) return;
  if ((e.hull || 0) > before) return;
  ctx.hullDamageHp = Math.max(0, e.hullMax - e.hull);
}

function applyDamageAndRepair(ctx, costs, budget, options = {}) {
  const e = playerEntity(ctx);
  if (!e || !(e.hullMax > 0)) return { spent: 0, readiness: 1, remainingHp: 0 };
  const readiness = e.hull / e.hullMax;
  const minCreditsAfter = options.minCreditsAfter != null ? options.minCreditsAfter : 200;
  const readinessGate = options.readinessGate != null ? options.readinessGate : REPAIR_READINESS_GATE;
  let spent = 0;
  if (readiness < readinessGate && (ctx.state.player.credits | 0) > minCreditsAfter) {
    const before = ctx.state.player.credits | 0;
    ctx.bus.emit('ui:service', { type: 'repair' });
    spent = Math.max(0, before - (ctx.state.player.credits | 0));
    costs.repairCost += spent;
    advanceTime(ctx, DOCK_OVERHEAD_S * 0.35, budget, 'recoveryS');
    ctx.hullDamageHp = Math.max(0, e.hullMax - (e.hull || 0));
  }
  return {
    spent,
    readiness: e.hullMax > 0 ? e.hull / e.hullMax : 1,
    remainingHp: Math.max(0, e.hullMax - (e.hull || 0)),
  };
}

function ensureStationMarkets(ctx, stationIds) {
  for (const id of stationIds) {
    if (id && ctx.econ && typeof ctx.econ.ensureMarket === 'function') {
      ctx.econ.ensureMarket(id);
    }
  }
}

function bootCourierRoute(seed) {
  const sim = createSimulation({
    seed,
    systems: [
      economySystem, cargoSystem, shipsSystem, combatSystem, worldSystem, factionsSystem,
      // Match the live registry's subscription order: origins must observe trade legs before
      // missions can synchronously settle a bulk-trade contract on the sell event.
      careerOriginsSystem, missionsSystem, saveSystem,
    ],
  });
  const state = sim.state;
  const bus = sim.bus;
  const econ = sim.registry.get('economy');
  const ships = sim.registry.get('ships');
  const combat = sim.registry.get('combat');
  const world = sim.registry.get('world');
  const factions = sim.registry.get('factions');
  const missions = sim.registry.get('missions');
  const origins = sim.registry.get('careerOrigins');
  const save = sim.registry.get('save');
  const creditAuthorityLedger = [];
  const grantCredits = econ.grantCredits.bind(econ);
  const chargeCredits = econ.chargeCredits.bind(econ);
  econ.grantCredits = (amount, reason) => {
    const before = state.player.credits | 0;
    const result = grantCredits(amount, reason);
    creditAuthorityLedger.push({ kind: 'grant', reason: reason || null, amount: (state.player.credits | 0) - before });
    return result;
  };
  econ.chargeCredits = (amount, reason) => {
    const before = state.player.credits | 0;
    const result = chargeCredits(amount, reason);
    creditAuthorityLedger.push({ kind: 'charge', reason: reason || null, amount: before - (state.player.credits | 0) });
    return result;
  };

  state.mode = 'flight';
  state.meta = state.meta || {};
  state.meta.seed = seed >>> 0;
  state.onboarding = { active: false, finished: true, step: 'done' };
  state.settings = state.settings || {};
  state.settings.gameplay = {
    ...(state.settings.gameplay || {}),
    tutorialHints: false,
    autosaveIntervalS: 0,
  };
  if (world && typeof world.newGame === 'function') world.newGame();
  if (econ && typeof econ.newGame === 'function') econ.newGame();
  econ.grantCredits(NEW_GAME.credits, 'new_game_seed');
  ships.newGame();
  const fittings = fittingsFromDefaultModules(NEW_GAME.shipId, NEW_GAME.fittedModules.slice());
  state.player.ownedShips[0].fittings = fittings;
  const ent = sim.helpers.spawnEntity(makeShipEntitySpec(NEW_GAME.shipId, {
    team: 0,
    isPlayer: true,
    player: state.player,
    fittings,
    pos: { x: 0, z: 0 },
  }));
  state.playerId = ent.id;
  ships.recomputeEntity(ent.id, fittings);
  const entered = world.enterSector(NEW_GAME.startingSectorId, {
    fromJump: false,
    via: 'new_game',
    placePlayer: true,
  });
  if (!entered) throw new Error(`Courier route failed to enter ${NEW_GAME.startingSectorId}`);

  if (factions && typeof factions.newGame === 'function') factions.newGame();
  for (const [fid, rep] of Object.entries(NEW_GAME.factionRep || {})) {
    if (!state.factions[fid]) continue;
    const delta = (rep | 0) - (state.factions[fid].rep | 0);
    if (delta) bus.emit('faction:repDelta', { factionId: fid, delta, reason: 'new_game_seed' });
  }
  if (missions && typeof missions.newGame === 'function') missions.newGame();
  if (origins && typeof origins.newGame === 'function') origins.newGame();

  // Warm every station market used by the courier origin + board loop.
  ensureStationMarkets(ctxStations(econ), [
    HOME_STATION_ID, 'station_ceres', 'station_beltout', 'station_coalition',
    'station_tethys', 'station_customs', 'station_forge',
  ]);

  return {
    sim, state, bus, econ, ships, combat, world, factions, missions, origins, save,
    seed: seed >>> 0,
    hullDamageHp: 0,
    currentShipId: NEW_GAME.shipId,
    currentStationId: null,
    transitDamageReceipts: [],
    creditAuthorityLedger,
  };
}

function ctxStations(econ) {
  return { econ };
}

function haulerOwn(ctx) {
  return ctx.state.careers?.origins?.hauler || null;
}

function activeOriginMission(ctx) {
  const own = haulerOwn(ctx);
  if (!own?.activeContract?.missionId) return null;
  return (ctx.state.missions.active || []).find((m) => m && m.id === own.activeContract.missionId) || null;
}

function cargoQty(ctx, cmdtyId) {
  return (ctx.state.player.cargo?.items && ctx.state.player.cargo.items[cmdtyId]) || 0;
}

function captureSaveSlice(ctx) {
  const e = playerEntity(ctx);
  const own = haulerOwn(ctx);
  const mission = activeOriginMission(ctx);
  const cargoItems = { ...(ctx.state.player.cargo?.items || {}) };
  const wp = ctx.state.nav?.waypoint || null;
  return {
    credits: ctx.state.player.credits | 0,
    simTime: round1(ctx.state.simTime || 0),
    sectorId: ctx.state.world.currentSectorId,
    hull: e ? round1(e.hull || 0) : null,
    hullMax: e ? round1(e.hullMax || 0) : null,
    originStatus: own && own.status,
    stepIndex: own && own.stepIndex,
    stepId: own && own.stepId,
    attempt: own && (own.attempt | 0),
    activeMissionId: own && own.activeContract && own.activeContract.missionId,
    cargoKey: Object.keys(cargoItems).sort().map((k) => `${k}:${cargoItems[k]}`).join('|'),
    missionType: mission && mission.type,
    waypointMissionId: wp && wp.missionId,
    waypointMarkerId: wp && wp.markerId,
    missionsDone: ctx.state.player.stats?.missionsDone || 0,
  };
}

function saveRoundTrip(ctx) {
  if (!ctx.save || typeof ctx.save.serializeData !== 'function') {
    return { ok: false, error: 'save_system_missing' };
  }
  const before = captureSaveSlice(ctx);
  let payload;
  try {
    payload = withDateAllowed(() => ctx.save.serializeData());
  } catch (err) {
    return { ok: false, error: `serialize_failed:${err && err.message || err}` };
  }
  const restoredCtx = bootCourierRoute(ctx.seed);
  restoredCtx.horizonS = ctx.horizonS;
  restoredCtx.transitDamageReceipts = (ctx.transitDamageReceipts || []).map((row) => ({ ...row }));
  try {
    withDateAllowed(() => restoredCtx.save._restore(payload, 'courier_public_route_mid'));
  } catch (err) {
    return { ok: false, error: `restore_failed:${err && err.message || err}`, payload, before };
  }
  restoredCtx.creditAuthorityLedger.splice(
    0,
    restoredCtx.creditAuthorityLedger.length,
    ...(ctx.creditAuthorityLedger || []).map((row) => ({ ...row })),
  );
  const e = playerEntity(restoredCtx);
  if (e && e.hullMax > 0) restoredCtx.hullDamageHp = Math.max(0, e.hullMax - (e.hull || 0));
  restoredCtx.currentShipId = restoredCtx.state.player?.ownedShips?.[0]?.defId
    || restoredCtx.state.player?.shipId
    || NEW_GAME.shipId;
  const after = captureSaveSlice(restoredCtx);
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  const mismatchKeys = keys.filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
  return {
    ok: mismatchKeys.length === 0,
    before,
    after,
    mismatchKeys,
    error: mismatchKeys.length ? `authority_slice_mismatch:${mismatchKeys.join(',')}` : null,
    restoredCtx,
  };
}

function markAuthority(receipt, row) {
  receipt.authorityReceipts.push(row);
}

function findBoardOffer(ctx, typeId, stationIds, options = {}) {
  if (!ctx.missions) return null;
  const preferSectorId = options.preferSectorId || null;
  const sameSectorOnly = !!options.sameSectorOnly;
  const maxCredits = options.maxCredits != null ? options.maxCredits : Infinity;
  const fromSectorId = options.fromSectorId || ctx.state.world?.currentSectorId;
  const seed = options.seed != null ? options.seed : (ctx.seed || 0);
  const maxToll = options.maxToll != null ? options.maxToll : Infinity;
  const ordered = preferSectorId
    ? [
      ...stationIds.filter((id) => STATION_TO_SECTOR.get(id)?.id === preferSectorId),
      ...(sameSectorOnly ? [] : stationIds.filter((id) => STATION_TO_SECTOR.get(id)?.id !== preferSectorId)),
    ]
    : [...stationIds];
  for (const stationId of ordered) {
    const board = ctx.missions.ensureBoard(stationId);
    if (!board || !board.slots) continue;
    const offer = board.slots.find((s) => s
      && s.type === typeId
      && !String(s.storyTag || '').startsWith('campaign47a:')
      && !String(s.storyTag || '').startsWith('origin.')
      && !String(s.storyTag || '').startsWith('ladder.')
      && !String(s.id || '').startsWith('offer_sp1_'));
    if (!offer) continue;
    const boardSector = STATION_TO_SECTOR.get(stationId)?.id;
    if (sameSectorOnly && preferSectorId && boardSector !== preferSectorId) continue;
    const boardToll = (boardSector && fromSectorId && boardSector !== fromSectorId)
      ? routeTollAmount(seed, fromSectorId, boardSector, 0)
      : 0;
    const destSector = offer.destSectorId || boardSector;
    const destToll = (destSector && boardSector && destSector !== boardSector)
      ? routeTollAmount(seed, boardSector, destSector, 0)
      : 0;
    const coll = offer.collateral_cr || 0;
    const tripToll = boardToll + destToll;
    if (tripToll > maxToll) continue;
    const reward = offer.reward_cr || 0;
    const tollCap = Math.min(
      COURIER_ROUTE_PACING.maxBoardTollCr,
      Math.max(40, reward * (COURIER_ROUTE_PACING.maxBoardTollFracOfReward || 0.35)),
    );
    if (tripToll > tollCap) continue;
    if (boardToll + destToll + coll > maxCredits) continue;
    return { offer, stationId, board, boardToll, destToll, tripToll };
  }
  return null;
}

function acceptBoardOffer(ctx, offerId, costs, receipt) {
  if (!ctx.missions || !offerId) return null;
  const before = ctx.state.player.credits | 0;
  const cargoBefore = JSON.stringify(ctx.state.player.cargo?.items || {});
  const ok = ctx.missions.acceptMission(offerId);
  if (!ok) return null;
  const spent = before - (ctx.state.player.credits | 0);
  if (spent > 0) {
    costs.missionCost += spent;
    receipt.purchaseSpend = (receipt.purchaseSpend || 0) + spent;
  }
  const cargoAfter = JSON.stringify(ctx.state.player.cargo?.items || {});
  if (cargoBefore !== cargoAfter) {
    receipt.cargoAuthorityEvents = (receipt.cargoAuthorityEvents || 0) + 1;
  }
  const candidates = (ctx.state.missions.active || []).filter((m) => m && m.status === 'active'
    && !String(m.storyTag || '').startsWith('campaign47a:'));
  return candidates[candidates.length - 1] || null;
}

function completeDeliveryAtDock(ctx, stationId, receipt) {
  const beforeCr = ctx.state.player.credits | 0;
  const beforeDone = ctx.state.player.stats?.missionsDone || 0;
  const cargoBefore = JSON.stringify(ctx.state.player.cargo?.items || {});
  ctx.bus.emit('dock:docked', { stationId });
  const cargoAfter = JSON.stringify(ctx.state.player.cargo?.items || {});
  if (cargoBefore !== cargoAfter) {
    receipt.cargoAuthorityEvents = (receipt.cargoAuthorityEvents || 0) + 1;
  }
  const reward = Math.max(0, (ctx.state.player.credits | 0) - beforeCr);
  if (reward > 0) receipt.missionProceeds = (receipt.missionProceeds || 0) + reward;
  const done = (ctx.state.player.stats?.missionsDone || 0) > beforeDone || reward > 0;
  return { ok: done || reward > 0, reward, stationId };
}

function executeMarketTrade(ctx, stationId, cmdtyId, side, qty, costs, receipt) {
  if (!ctx.econ || !(qty > 0)) return { ok: false, reason: 'bad_trade' };
  ctx.econ.ensureMarket(stationId);
  const beforeCr = ctx.state.player.credits | 0;
  const cargoBefore = cargoQty(ctx, cmdtyId);
  const res = ctx.econ.execute(stationId, cmdtyId, side, qty);
  if (!res || !res.ok) return { ok: false, reason: res && res.reason || 'execute_failed' };
  const cargoAfter = cargoQty(ctx, cmdtyId);
  if (cargoAfter !== cargoBefore) {
    receipt.cargoAuthorityEvents = (receipt.cargoAuthorityEvents || 0) + 1;
  }
  if (side === 'buy') {
    const spent = Math.max(0, beforeCr - (ctx.state.player.credits | 0));
    receipt.purchaseSpend = (receipt.purchaseSpend || 0) + spent;
    receipt.saleProceeds = receipt.saleProceeds || 0;
  } else {
    // Mission/origin bonuses can settle synchronously on this sell event; res.total is trade-only.
    receipt.saleProceeds = (receipt.saleProceeds || 0) + Math.max(0, res.total || 0);
  }
  return {
    ok: true,
    qty: res.qty,
    total: res.total,
    unitAvg: res.unitAvg,
    side,
    stationId,
    cmdtyId,
    cargoDelta: cargoAfter - cargoBefore,
  };
}

function selectArbitrage(ctx, buyStationId, sellStationId) {
  ctx.econ.ensureMarket(buyStationId);
  ctx.econ.ensureMarket(sellStationId);
  let best = null;
  for (const c of COMMODITIES) {
    if (c.legality !== 'legal' || c.basePrice > 200) continue;
    const qb = ctx.econ.quote(buyStationId, c.id, 'buy', 1);
    const qs = ctx.econ.quote(sellStationId, c.id, 'sell', 1);
    if (!qb.ok || !qs.ok) continue;
    const margin = qs.unitAvg - qb.unitAvg;
    if (!(margin > 0)) continue;
    if (!best || margin > best.margin) {
      best = {
        cmdtyId: c.id, name: c.name, margin, buy: qb.unitAvg, sell: qs.unitAvg, vol: c.volPerU || 1,
      };
    }
  }
  return best;
}

function rebindCtx(ctx, restored) {
  Object.assign(ctx, {
    sim: restored.sim,
    state: restored.state,
    bus: restored.bus,
    econ: restored.econ,
    ships: restored.ships,
    combat: restored.combat,
    world: restored.world,
    factions: restored.factions,
    missions: restored.missions,
    origins: restored.origins,
    save: restored.save,
    seed: restored.seed,
    hullDamageHp: restored.hullDamageHp,
    currentShipId: restored.currentShipId,
    currentStationId: restored.currentStationId || null,
    transitDamageReceipts: restored.transitDamageReceipts || [],
    creditAuthorityLedger: restored.creditAuthorityLedger || [],
  });
}

/**
 * Run one independent Courier (Hauler freight) public-route horizon.
 * options:
 *   seed, horizonMin / horizonS
 *   forceRetryOnFirstStep (default true) — abandon+reissue first origin step once for haircut proof
 *   forceBoardFailureAt (default 2) — abandon the Nth board contract (1-based after origin)
 *   captureSaveAfterOriginStep (default 0) — step index after which to save/restore
 *   routeRiskChoiceId (default open_manifest) — safer clock for public-route viability proof
 */
export function runCourierPublicRoute(options = {}) {
  const seed = (options.seed != null ? options.seed : COURIER_PUBLIC_ROUTE_SEED) >>> 0;
  const horizonMin = options.horizonMin != null ? options.horizonMin : 30;
  const horizonS = options.horizonS != null ? options.horizonS : horizonMin * 60;
  const forceRetryOnFirstStep = options.forceRetryOnFirstStep !== false;
  const forceBoardFailureAt = options.forceBoardFailureAt != null ? options.forceBoardFailureAt : 2;
  const captureSaveAfterOriginStep = options.captureSaveAfterOriginStep != null
    ? options.captureSaveAfterOriginStep
    : 0;
  const routeRiskChoiceId = options.routeRiskChoiceId || 'open_manifest';

  const ctx = bootCourierRoute(seed);
  ctx.horizonS = horizonS;
  const costs = emptyCosts();
  const budget = emptyBudget();
  const receipt = {
    schema: COURIER_PUBLIC_ROUTE_SCHEMA,
    career: 'courier',
    careerSystemId: 'hauler',
    seed,
    horizonMin,
    horizonS,
    startingCapital: NEW_GAME.credits,
    purchaseSpend: 0,
    saleProceeds: 0,
    missionProceeds: 0,
    cargoAuthorityEvents: 0,
    completedLoops: 0,
    completedContracts: 0,
    failedContracts: 0,
    origin: {
      status: 'idle',
      completedStepIds: [],
      cleanGrossEnvelopeCr: COURIER_ORIGIN_CLEAN_GROSS_ENVELOPE_CR,
      completionRewardCr: HAULER_COMPLETION_REWARD.credits,
      attemptHaircuts: [],
      elapsedS: 0,
      routeRiskChoiceId,
    },
    liveSeams: [
      'careerOrigins.accept(hauler) → missions.postAndAcceptAuthoredOffer',
      'missions preloadedCargo addCargo / dock delivery removeCargo',
      'missions cargo_delivery dock:docked → _completeMission → economy:grantCredits',
      'missions bulk_trade economy:tradeCompleted → _completeMission → economy:grantCredits',
      'economy.execute buy/sell (market causality + cargo authority)',
      'economy ui:service repair (SERVICE_PRICES.repairCrPerHp)',
      'hauler origin retry haircut via abandon + reoffer attempt mult',
      'save.serializeData → save._restore careers/missions/cargo/economy/world slice',
      'missions.ensureBoard/acceptMission cargo_delivery|bulk_trade continuation',
    ],
    authorityReceipts: [],
    loops: [],
    bottlenecks: [],
    adaptersUsed: [
      {
        code: 'travel_ttk_adapter',
        note: 'Travel duration from sector/station positions / MISSION_TUNING.cruiseSpeedRef',
      },
      {
        code: 'transit_wear_adapter',
        note: 'Modest inter-sector wear via combat.onHit; repair through live ui:service economy path',
      },
    ],
    defects: [],
    saveProof: null,
    equipment: {
      activePhase: 'starter',
      currentShipId: NEW_GAME.shipId,
    },
    pacing: { ...COURIER_ROUTE_PACING },
  };

  // Dock + accept Courier/Hauler origin through public career event path.
  ctx.bus.emit('dock:docked', { stationId: HOME_STATION_ID });
  ctx.currentStationId = HOME_STATION_ID;
  advanceTime(ctx, DOCK_OVERHEAD_S, budget, 'actionS');

  let currentSectorId = ctx.state.world.currentSectorId;
  let retriedFirstStep = false;
  let originStepCompletions = 0;
  let boardLoop = 0;

  // ---- ORIGIN CHAIN (timed, cargo-bearing, market-aware) ---------------------
  while (ctx.state.simTime < horizonS) {
    const own = haulerOwn(ctx);
    if (!own) {
      receipt.defects.push('hauler_origin_state_missing');
      break;
    }
    if (own.status === 'completed') break;

    if (own.status === 'step_failed' || own.status === 'idle' || own.status === 'declined') {
      const wait = Math.max(HAULER_FAIL_RETRY_COOLDOWN_S + 1, 15);
      advanceTime(ctx, wait, budget, 'recoveryS');
      ctx.bus.emit('dock:docked', { stationId: ctx.currentStationId || HOME_STATION_ID });
      const re = ctx.origins.reoffer('hauler');
      if (!re || !re.ok) {
        // offerAtDock path may already have posted via dock:docked
        const view = ctx.origins.getOfferView && ctx.origins.getOfferView('hauler');
        if (!(view && view.canAccept) && own.status !== 'offered') {
          receipt.bottlenecks.push({ code: 'reoffer_failed', detail: re && re.reason });
          advanceTime(ctx, 30, budget, 'idleS');
          continue;
        }
      }
      markAuthority(receipt, {
        kind: 'origin_reoffer',
        attempt: own.attempt | 0,
        atS: round1(ctx.state.simTime),
        authority: 'careerOrigins.reoffer → hauler onFirstDock',
      });
    }

    if (own.status === 'offered') {
      const stepId = own.stepId || HAULER_STEPS[own.stepIndex | 0]?.id;
      if (stepId === 'route_risk') {
        const choice = ctx.origins.choose('hauler', routeRiskChoiceId);
        if (!choice || !choice.ok) {
          receipt.defects.push(`route_risk_choice_failed:${choice && choice.reason}`);
          break;
        }
      }
      ensureStationMarkets(ctx, [
        HOME_STATION_ID, 'station_ceres', 'station_beltout', 'station_coalition',
      ]);
      const beforeCr = ctx.state.player.credits | 0;
      const cargoBefore = JSON.stringify(ctx.state.player.cargo?.items || {});
      const accept = ctx.origins.accept('hauler');
      if (!accept || !accept.ok) {
        receipt.defects.push(`origin_accept_failed:${accept && accept.reason || 'unknown'}`);
        break;
      }
      const spent = Math.max(0, beforeCr - (ctx.state.player.credits | 0));
      if (spent > 0) {
        costs.missionCost += spent;
        receipt.purchaseSpend += spent;
      }
      const cargoAfter = JSON.stringify(ctx.state.player.cargo?.items || {});
      if (cargoBefore !== cargoAfter) receipt.cargoAuthorityEvents += 1;
      const mission = activeOriginMission(ctx);
      markAuthority(receipt, {
        kind: 'origin_accept',
        careerId: 'hauler',
        stepId: haulerOwn(ctx)?.stepId || stepId,
        missionId: mission && mission.id,
        reward_cr: mission && mission.reward_cr,
        collateral_cr: mission && mission.collateral_cr,
        atS: round1(ctx.state.simTime),
        authority: 'careerOrigins.accept → missions.postAndAcceptAuthoredOffer',
      });
    }

    const mission = activeOriginMission(ctx);
    const ownNow = haulerOwn(ctx);
    if (!mission || !ownNow?.activeContract) {
      if (ownNow?.status === 'completed') break;
      receipt.bottlenecks.push({
        code: 'origin_mission_missing',
        detail: `status=${ownNow && ownNow.status}`,
      });
      advanceTime(ctx, 20, budget, 'idleS');
      if (budget.idleS > 120) break;
      continue;
    }

    const stepId = ownNow.activeContract.stepId;
    const destStationId = mission.destStationId || ownNow.activeContract.destStationId;
    const destSectorId = mission.destSectorId
      || STATION_TO_SECTOR.get(destStationId)?.id
      || currentSectorId;
    const originStationId = mission.originStationId
      || ownNow.activeContract.originStationId
      || HOME_STATION_ID;

    // Objective navigation proof for origin contracts.
    const wp = ctx.state.nav && ctx.state.nav.waypoint;
    if (!wp || (wp.markerKind && wp.markerKind !== 'mission-objective' && wp.kind !== 'mission')) {
      // Not always stamped in headless; record bottleneck only if marker expected.
      if (mission.markerId || mission.markerKind === 'mission-objective') {
        receipt.bottlenecks.push({ code: 'missing_objective_marker', detail: stepId });
      }
    }

    // Forced retry on first origin step once: abandon → step_failed → reoffer with haircut.
    if (forceRetryOnFirstStep && !retriedFirstStep && originStepCompletions === 0
      && stepId === 'manifest_truth' && (ownNow.attempt | 0) === 0) {
      retriedFirstStep = true;
      const rewardBeforeHaircut = mission.reward_cr | 0;
      if (typeof ctx.missions.abandonMission !== 'function') {
        receipt.defects.push('mission_abandon_authority_missing');
        break;
      }
      ctx.missions.abandonMission(mission.id);
      // The registered mission failure event must advance the linked origin; do not repair it here.
      const afterFail = haulerOwn(ctx);
      if (afterFail && afterFail.status === 'active' && afterFail.activeContract
        && afterFail.activeContract.missionId === mission.id) {
        receipt.defects.push('mission_failure_did_not_reach_origin');
        break;
      }
      receipt.failedContracts += 1;
      advanceTime(ctx, DOCK_OVERHEAD_S + HAULER_FAIL_RETRY_COOLDOWN_S + 1, budget, 'recoveryS');
      ctx.bus.emit('dock:docked', { stationId: HOME_STATION_ID });
      ctx.currentStationId = HOME_STATION_ID;
      const returned = ctx.world.enterSector(HOME_SECTOR_ID, {
        fromJump: true,
        via: 'courier_retry_return',
        fromSectorId: ctx.state.world.currentSectorId,
        placePlayer: true,
      });
      currentSectorId = returned ? HOME_SECTOR_ID : ctx.state.world.currentSectorId;
      let re = ctx.origins.reoffer('hauler');
      if (!re || !re.ok) {
        // dock:docked may already re-offer
        re = { ok: haulerOwn(ctx)?.status === 'offered' };
      }
      // Accept retried step to capture haircut reward_cr.
      ensureStationMarkets(ctx, [HOME_STATION_ID, 'station_coalition']);
      const acc = ctx.origins.accept('hauler');
      const reMission = activeOriginMission(ctx);
      const haircutReward = reMission ? (reMission.reward_cr | 0) : 0;
      const attempt = haulerOwn(ctx)?.attempt | 0;
      receipt.origin.attemptHaircuts.push({
        contractId: stepId,
        attempt,
        rewardBefore: rewardBeforeHaircut,
        rewardAfter: haircutReward,
        expectedMult: haulerRewardMultiplier(attempt),
        reofferOk: !!(reMission && haircutReward > 0 && haircutReward < rewardBeforeHaircut),
      });
      markAuthority(receipt, {
        kind: 'origin_retry',
        contractId: stepId,
        rewardBefore: rewardBeforeHaircut,
        rewardAfter: haircutReward,
        atS: round1(ctx.state.simTime),
        authority: 'missions.abandon + careerOrigins.reoffer (attempt haircut)',
      });
      receipt.loops.push({
        phase: 'origin',
        stepId,
        outcome: 'retry_reissue',
        t: round1(ctx.state.simTime),
        reward: 0,
      });
      if (!acc || !acc.ok) {
        receipt.defects.push(`retry_accept_failed:${acc && acc.reason}`);
        break;
      }
      continue;
    }

    let stepOk = false;
    let stepReward = 0;
    let repairInfo = { spent: 0, readiness: 1 };
    let tradeLegs = null;

    if (mission.type === 'cargo_delivery') {
      // Travel to destination sector/station, then dock for missions cargo delivery authority.
      if (currentSectorId !== destSectorId) {
        const legOut = travelTimeS(currentSectorId, destSectorId) + DOCK_OVERHEAD_S;
        if (ctx.state.simTime + legOut > horizonS) break;
        const moveOut = tryTravel(ctx, {
          fromSectorId: currentSectorId,
          toSectorId: destSectorId,
          travelS: legOut,
          reason: `gate_toll:courier_origin:${stepId}:out`,
          seed,
          costs,
          budget,
        });
        if (!moveOut.ok) {
          receipt.bottlenecks.push({ code: 'unaffordable_toll', detail: `origin ${stepId} out` });
          break;
        }
        currentSectorId = destSectorId;
      } else {
        advanceTime(ctx, DOCK_OVERHEAD_S * 0.5 + stationTravelTimeS(
          ctx.currentStationId || originStationId, destStationId,
        ), budget, 'travelS');
      }

      // Prove sealed cargo is aboard before dock (missions preloaded via addCargo).
      const needCmdty = mission.params?.cmdtyId || ownNow.activeContract.commodityId;
      const needQty = Math.max(1, mission.params?.qty || ownNow.activeContract.qty || 1);
      if (cargoQty(ctx, needCmdty) < needQty) {
        receipt.defects.push(`preloaded_cargo_missing:${stepId}:${needCmdty}`);
        break;
      }

      const beforeCr = ctx.state.player.credits | 0;
      const del = completeDeliveryAtDock(ctx, destStationId, receipt);
      ctx.currentStationId = destStationId;
      advanceTime(ctx, COURIER_ROUTE_PACING.deliveryHandlingS, budget, 'actionS');
      repairInfo = applyDamageAndRepair(ctx, costs, budget, {
        minCreditsAfter: 250,
        readinessGate: REPAIR_READINESS_GATE,
      });
      stepReward = Math.max(del.reward, Math.max(0, (ctx.state.player.credits | 0) - beforeCr));
      // Origin chain may grant completion reward in same dock if last step — already in delta.
      stepOk = del.ok || haulerOwn(ctx)?.status === 'offered'
        || haulerOwn(ctx)?.status === 'completed'
        || !(ctx.state.missions.active || []).some((m) => m.id === mission.id && m.status === 'active');
      if (stepOk) {
        markAuthority(receipt, {
          kind: 'mission_complete',
          type: 'cargo_delivery',
          id: mission.id,
          originStepId: stepId,
          reward: stepReward,
          atS: round1(ctx.state.simTime),
          authority: 'missions._onDockedObjectives→_deliverCargo→_completeMission→economy:grantCredits',
        });
      }
    } else if (mission.type === 'bulk_trade') {
      const buyStationId = originStationId || 'station_beltout';
      const sellStationId = destStationId || 'station_ceres';
      const buySector = STATION_TO_SECTOR.get(buyStationId)?.id || currentSectorId;
      const sellSector = STATION_TO_SECTOR.get(sellStationId)?.id || currentSectorId;
      const cmdtyId = mission.params?.cmdtyId || ownNow.activeContract.commodityId;
      const qtyNeed = Math.max(1, mission.params?.qty || ownNow.activeContract.qty || 1);

      // Travel to buy station.
      if (currentSectorId !== buySector) {
        const legBuy = travelTimeS(currentSectorId, buySector) + DOCK_OVERHEAD_S;
        if (ctx.state.simTime + legBuy > horizonS) break;
        const moveBuy = tryTravel(ctx, {
          fromSectorId: currentSectorId,
          toSectorId: buySector,
          travelS: legBuy,
          reason: `gate_toll:courier_origin:${stepId}:buy`,
          seed,
          costs,
          budget,
        });
        if (!moveBuy.ok) {
          receipt.bottlenecks.push({ code: 'unaffordable_toll', detail: `origin ${stepId} buy leg` });
          break;
        }
        currentSectorId = buySector;
      }
      ctx.bus.emit('dock:docked', { stationId: buyStationId });
      ctx.currentStationId = buyStationId;
      advanceTime(ctx, COURIER_ROUTE_PACING.marketTicketS, budget, 'actionS');

      let want = qtyNeed;
      while (want > 0) {
        const q = ctx.econ.quote(buyStationId, cmdtyId, 'buy', want);
        if (q.ok && q.total <= (ctx.state.player.credits | 0)) break;
        want = Math.floor(want * 0.85);
      }
      if (want < qtyNeed) {
        // Need full qty for bulk_trade objective; try best effort then fail if short.
        want = qtyNeed;
      }
      const buyRes = executeMarketTrade(ctx, buyStationId, cmdtyId, 'buy', want, costs, receipt);
      if (!buyRes.ok) {
        receipt.defects.push(`origin_buy_failed:${stepId}:${buyRes.reason}`);
        break;
      }
      advanceTime(ctx, COURIER_ROUTE_PACING.marketTicketS, budget, 'actionS');

      // Travel to sell station.
      if (currentSectorId !== sellSector || buyStationId !== sellStationId) {
        const legSell = (currentSectorId === sellSector
          ? stationTravelTimeS(buyStationId, sellStationId)
          : travelTimeS(currentSectorId, sellSector)) + DOCK_OVERHEAD_S;
        if (ctx.state.simTime + legSell > horizonS) break;
        if (currentSectorId !== sellSector) {
          const moveSell = tryTravel(ctx, {
            fromSectorId: currentSectorId,
            toSectorId: sellSector,
            travelS: legSell,
            reason: `gate_toll:courier_origin:${stepId}:sell`,
            seed,
            costs,
            budget,
          });
          if (!moveSell.ok) {
            receipt.bottlenecks.push({ code: 'unaffordable_toll', detail: `origin ${stepId} sell leg` });
            break;
          }
          currentSectorId = sellSector;
        } else {
          advanceTime(ctx, legSell, budget, 'travelS');
        }
      }
      ctx.bus.emit('dock:docked', { stationId: sellStationId });
      ctx.currentStationId = sellStationId;
      const have = cargoQty(ctx, cmdtyId);
      const beforeCr = ctx.state.player.credits | 0;
      const beforeDone = ctx.state.player.stats?.missionsDone || 0;
      const sellRes = executeMarketTrade(ctx, sellStationId, cmdtyId, 'sell', have, costs, receipt);
      if (!sellRes.ok) {
        receipt.defects.push(`origin_sell_failed:${stepId}:${sellRes.reason}`);
        break;
      }
      // bulk_trade completion may add mission reward beyond sell proceeds.
      const afterCr = ctx.state.player.credits | 0;
      const missionsDoneAfter = ctx.state.player.stats?.missionsDone || 0;
      const missionBonus = Math.max(0, afterCr - beforeCr - (sellRes.total || 0));
      if (missionBonus > 0) receipt.missionProceeds += missionBonus;
      // Origin completion award may also land on last step.
      stepReward = missionBonus;
      if (missionsDoneAfter > beforeDone || missionBonus > 0
        || haulerOwn(ctx)?.status === 'completed'
        || haulerOwn(ctx)?.status === 'offered') {
        stepOk = true;
      } else {
        // market_spread may require both legs recorded; trade events should have fired.
        stepOk = haulerOwn(ctx)?.status !== 'active';
      }
      if (haulerOwn(ctx)?.status === 'completed') stepOk = true;
      advanceTime(ctx, COURIER_ROUTE_PACING.marketTicketS, budget, 'actionS');
      repairInfo = applyDamageAndRepair(ctx, costs, budget, {
        minCreditsAfter: 300,
        readinessGate: REPAIR_READINESS_GATE,
      });
      tradeLegs = {
        buy: buyRes,
        sell: sellRes,
        missionBonus,
      };
      if (stepOk) {
        markAuthority(receipt, {
          kind: 'mission_complete',
          type: 'bulk_trade',
          id: mission.id,
          originStepId: stepId,
          reward: stepReward,
          saleTotal: sellRes.total,
          atS: round1(ctx.state.simTime),
          authority: 'economy.execute→economy:tradeCompleted→missions._onTrade→_completeMission→economy:grantCredits',
        });
      }
    } else {
      receipt.defects.push(`unexpected_origin_mission_type:${mission.type}`);
      break;
    }

    if (!stepOk) {
      receipt.failedContracts += 1;
      receipt.defects.push(`origin_step_settle_failed:${stepId}`);
      break;
    }

    receipt.completedContracts += 1;
    originStepCompletions += 1;
    receipt.loops.push({
      phase: 'origin',
      stepId,
      outcome: 'completed',
      t: round1(ctx.state.simTime),
      reward: stepReward,
      repairSpent: repairInfo.spent,
      readiness: round2(repairInfo.readiness),
      markerId: wp && wp.markerId,
      attempt: haulerOwn(ctx)?.attempt | 0,
      tradeLegs: tradeLegs || undefined,
      missionType: mission.type,
    });

    if (captureSaveAfterOriginStep === originStepCompletions - 1 && !receipt.saveProof) {
      receipt.saveProof = saveRoundTrip(ctx);
      if (receipt.saveProof.ok && receipt.saveProof.restoredCtx) {
        rebindCtx(ctx, receipt.saveProof.restoredCtx);
        currentSectorId = ctx.state.world.currentSectorId;
      }
      if (receipt.saveProof) delete receipt.saveProof.restoredCtx;
    }

    // Between origin steps, a short dock beat.
    const status = haulerOwn(ctx)?.status;
    if (status === 'offered') {
      advanceTime(ctx, DOCK_OVERHEAD_S * 0.5, budget, 'actionS');
    }
  }

  const originEnd = haulerOwn(ctx);
  receipt.origin.status = originEnd?.status || 'unknown';
  receipt.origin.completedStepIds = (originEnd?.history || [])
    .filter((h) => h && h.kind === 'step_success')
    .map((h) => h.stepId)
    .filter(Boolean);
  // Fallback: completed loops for origin phase.
  if (!receipt.origin.completedStepIds.length) {
    receipt.origin.completedStepIds = receipt.loops
      .filter((l) => l.phase === 'origin' && l.outcome === 'completed')
      .map((l) => l.stepId);
  }
  receipt.origin.elapsedS = round1(budget.simS);
  if (originEnd?.status === 'completed' && originEnd.rewardReceipt) {
    receipt.origin.completionReceipt = {
      credits: originEnd.rewardReceipt.credits,
      granted: !!originEnd.rewardsGranted,
    };
  }

  // ---- BOARD + FREIGHT CONTINUATION for remaining horizon --------------------
  // Anchor freight work in the Ceres belt after origin: same-sector arb + local boards keep
  // high-sec gate tolls from dominating the 30-minute viability window.
  const buyStationId = 'station_beltout';
  const sellStationId = 'station_ceres';
  const buySector = STATION_TO_SECTOR.get(buyStationId);
  const sellSector = STATION_TO_SECTOR.get(sellStationId);
  const freightHubSectorId = buySector?.id || 'sector_ceres_belt';
  let boardSkips = 0;

  // Relocate to freight hub once if origin left us elsewhere.
  if (currentSectorId !== freightHubSectorId && ctx.state.simTime < horizonS * 0.95) {
    const hubLeg = travelTimeS(currentSectorId, freightHubSectorId) + DOCK_OVERHEAD_S;
    if (ctx.state.simTime + hubLeg <= horizonS) {
      const hubMove = tryTravel(ctx, {
        fromSectorId: currentSectorId,
        toSectorId: freightHubSectorId,
        travelS: hubLeg,
        reason: 'gate_toll:courier:freight_hub',
        seed,
        costs,
        budget,
      });
      if (hubMove.ok) {
        currentSectorId = freightHubSectorId;
        ctx.bus.emit('dock:docked', { stationId: sellStationId });
        ctx.currentStationId = sellStationId;
      }
    }
  }

  while (ctx.state.simTime < horizonS) {
    const wallet = ctx.state.player.credits | 0;
    let hit = null;
    const deliveryFirst = COURIER_ROUTE_PACING.preferDelivery;
    const types = deliveryFirst
      ? ['cargo_delivery', 'bulk_trade']
      : ['bulk_trade', 'cargo_delivery'];
    const boardSearch = (sameSectorOnly) => {
      for (const typeId of types) {
        const found = findBoardOffer(ctx, typeId, COURIER_BOARD_STATIONS, {
          preferSectorId: currentSectorId,
          fromSectorId: currentSectorId,
          maxCredits: wallet,
          seed,
          sameSectorOnly,
          maxToll: COURIER_ROUTE_PACING.maxBoardTollCr,
        });
        if (found) return found;
      }
      return null;
    };
    // Same-sector board first; only then a toll-capped cross-sector offer.
    hit = boardSearch(true) || boardSearch(false);

    if (!hit) {
      // Refresh boards briefly, then fall through to freestyle arbitrage.
      advanceTime(ctx, Math.min(45, (MISSION_TUNING.refreshSec || 600) * 0.08 + 1), budget, 'idleS');
      hit = boardSearch(true) || boardSearch(false);
      if (!hit) boardSkips += 1;
    }

    // When board offers are toll-expensive or missing, freestyle same-sector freight carries the window.
    if (hit && boardSkips < (COURIER_ROUTE_PACING.arbAfterBoardSkips || 2)) {
      const boardSector = STATION_TO_SECTOR.get(hit.stationId)?.id;
      if (boardSector && boardSector !== currentSectorId) {
        const legBoard = travelTimeS(currentSectorId, boardSector) + DOCK_OVERHEAD_S;
        if (ctx.state.simTime + legBoard > horizonS) break;
        const moveBoard = tryTravel(ctx, {
          fromSectorId: currentSectorId,
          toSectorId: boardSector,
          travelS: legBoard,
          reason: `gate_toll:courier_board:${boardLoop}:to_board`,
          seed,
          costs,
          budget,
        });
        if (!moveBoard.ok) {
          receipt.bottlenecks.push({ code: 'unaffordable_toll', detail: 'board approach' });
          break;
        }
        currentSectorId = boardSector;
      }
      ctx.bus.emit('dock:docked', { stationId: hit.stationId });
      ctx.currentStationId = hit.stationId;
      const accepted = acceptBoardOffer(ctx, hit.offer.id, costs, receipt);
      if (!accepted) {
        receipt.bottlenecks.push({ code: 'board_accept_failed', detail: hit.offer.id });
        advanceTime(ctx, 20, budget, 'idleS');
        continue;
      }
      markAuthority(receipt, {
        kind: 'mission_accept',
        type: accepted.type,
        id: accepted.id,
        reward_cr: accepted.reward_cr,
        atS: round1(ctx.state.simTime),
        authority: 'missions.acceptMission',
      });

      boardLoop += 1;
      let success = true;
      let reward = 0;
      let repairInfo = { spent: 0, readiness: 1 };

      if (forceBoardFailureAt > 0 && boardLoop === forceBoardFailureAt) {
        success = false;
        if (ctx.missions.abandonMission) ctx.missions.abandonMission(accepted.id);
        receipt.failedContracts += 1;
      } else if (accepted.type === 'cargo_delivery') {
        const destSt = accepted.destStationId;
        const destSec = accepted.destSectorId || STATION_TO_SECTOR.get(destSt)?.id;
        if (destSec && destSec !== currentSectorId) {
          const leg = travelTimeS(currentSectorId, destSec) + DOCK_OVERHEAD_S;
          if (ctx.state.simTime + leg > horizonS) break;
          const move = tryTravel(ctx, {
            fromSectorId: currentSectorId,
            toSectorId: destSec,
            travelS: leg,
            reason: `gate_toll:courier_board:${boardLoop}:out`,
            seed,
            costs,
            budget,
          });
          if (!move.ok) {
            if (ctx.missions.abandonMission) ctx.missions.abandonMission(accepted.id);
            receipt.failedContracts += 1;
            success = false;
          } else {
            currentSectorId = destSec;
          }
        }
        if (success) {
          // Board cargo_delivery may require buying cargo if not preloaded.
          if (accepted.params?.cmdtyId && cargoQty(ctx, accepted.params.cmdtyId) < (accepted.params.qty || 1)) {
            const need = Math.max(1, accepted.params.qty || 1);
            const buyAt = hit.stationId;
            ctx.econ.ensureMarket(buyAt);
            const buyRes = executeMarketTrade(ctx, buyAt, accepted.params.cmdtyId, 'buy', need, costs, receipt);
            if (!buyRes.ok) {
              // Try origin station market
              const alt = accepted.stationId || HOME_STATION_ID;
              const altRes = executeMarketTrade(ctx, alt, accepted.params.cmdtyId, 'buy', need, costs, receipt);
              if (!altRes.ok) {
                if (ctx.missions.abandonMission) ctx.missions.abandonMission(accepted.id);
                receipt.failedContracts += 1;
                success = false;
              }
            }
            advanceTime(ctx, COURIER_ROUTE_PACING.marketTicketS, budget, 'actionS');
          }
        }
        if (success) {
          const del = completeDeliveryAtDock(ctx, destSt || hit.stationId, receipt);
          ctx.currentStationId = destSt || hit.stationId;
          reward = del.reward;
          success = del.ok;
          if (success) {
            receipt.completedContracts += 1;
            markAuthority(receipt, {
              kind: 'mission_complete',
              type: 'cargo_delivery',
              id: accepted.id,
              reward,
              atS: round1(ctx.state.simTime),
              authority: 'missions._onDockedObjectives→_completeMission→economy:grantCredits',
            });
          } else {
            receipt.failedContracts += 1;
            if (ctx.missions.abandonMission) ctx.missions.abandonMission(accepted.id);
          }
          advanceTime(ctx, COURIER_ROUTE_PACING.deliveryHandlingS, budget, 'actionS');
          repairInfo = applyDamageAndRepair(ctx, costs, budget);
        }
      } else if (accepted.type === 'bulk_trade') {
        const cmdtyId = accepted.params?.cmdtyId;
        const qtyNeed = Math.max(1, accepted.params?.qty || 1);
        const destSt = accepted.destStationId || sellStationId;
        const destSec = accepted.destSectorId || STATION_TO_SECTOR.get(destSt)?.id;
        // Buy wherever we are if stock exists; else go to beltout.
        let buyAt = hit.stationId;
        ctx.econ.ensureMarket(buyAt);
        let q = ctx.econ.quote(buyAt, cmdtyId, 'buy', qtyNeed);
        if (!q.ok) {
          buyAt = buyStationId;
          if (buySector && currentSectorId !== buySector.id) {
            const leg = travelTimeS(currentSectorId, buySector.id) + DOCK_OVERHEAD_S;
            if (ctx.state.simTime + leg > horizonS) break;
            const move = tryTravel(ctx, {
              fromSectorId: currentSectorId,
              toSectorId: buySector.id,
              travelS: leg,
              reason: `gate_toll:courier_board:${boardLoop}:buy`,
              seed,
              costs,
              budget,
            });
            if (!move.ok) {
              if (ctx.missions.abandonMission) ctx.missions.abandonMission(accepted.id);
              receipt.failedContracts += 1;
              success = false;
            } else currentSectorId = buySector.id;
          }
          if (success) {
            ctx.bus.emit('dock:docked', { stationId: buyAt });
            ctx.currentStationId = buyAt;
            q = ctx.econ.quote(buyAt, cmdtyId, 'buy', qtyNeed);
          }
        }
        if (success) {
          const buyRes = executeMarketTrade(ctx, buyAt, cmdtyId, 'buy', qtyNeed, costs, receipt);
          if (!buyRes.ok) {
            if (ctx.missions.abandonMission) ctx.missions.abandonMission(accepted.id);
            receipt.failedContracts += 1;
            success = false;
          } else {
            advanceTime(ctx, COURIER_ROUTE_PACING.marketTicketS, budget, 'actionS');
            if (destSec && destSec !== currentSectorId) {
              const leg = travelTimeS(currentSectorId, destSec) + DOCK_OVERHEAD_S;
              if (ctx.state.simTime + leg > horizonS) break;
              const move = tryTravel(ctx, {
                fromSectorId: currentSectorId,
                toSectorId: destSec,
                travelS: leg,
                reason: `gate_toll:courier_board:${boardLoop}:sell`,
                seed,
                costs,
                budget,
              });
              if (!move.ok) {
                if (ctx.missions.abandonMission) ctx.missions.abandonMission(accepted.id);
                receipt.failedContracts += 1;
                success = false;
              } else currentSectorId = destSec;
            }
          }
        }
        if (success) {
          ctx.bus.emit('dock:docked', { stationId: destSt });
          ctx.currentStationId = destSt;
          const beforeCr = ctx.state.player.credits | 0;
          const beforeDone = ctx.state.player.stats?.missionsDone || 0;
          const have = cargoQty(ctx, cmdtyId);
          const sellRes = executeMarketTrade(ctx, destSt, cmdtyId, 'sell', have, costs, receipt);
          if (!sellRes.ok) {
            if (ctx.missions.abandonMission) ctx.missions.abandonMission(accepted.id);
            receipt.failedContracts += 1;
            success = false;
          } else {
            const bonus = Math.max(0, (ctx.state.player.credits | 0) - beforeCr - (sellRes.total || 0));
            if (bonus > 0) receipt.missionProceeds += bonus;
            reward = bonus;
            const missionsDoneAfter = ctx.state.player.stats?.missionsDone || 0;
            success = missionsDoneAfter > beforeDone || bonus > 0
              || !(ctx.state.missions.active || []).some((m) => m.id === accepted.id && m.status === 'active');
            if (success) {
              receipt.completedContracts += 1;
              markAuthority(receipt, {
                kind: 'mission_complete',
                type: 'bulk_trade',
                id: accepted.id,
                reward,
                atS: round1(ctx.state.simTime),
                authority: 'missions._onTrade→_completeMission→economy:grantCredits',
              });
            } else {
              receipt.failedContracts += 1;
            }
            advanceTime(ctx, COURIER_ROUTE_PACING.marketTicketS, budget, 'actionS');
            repairInfo = applyDamageAndRepair(ctx, costs, budget);
          }
        }
      } else {
        if (ctx.missions.abandonMission) ctx.missions.abandonMission(accepted.id);
        receipt.failedContracts += 1;
        success = false;
      }

      receipt.loops.push({
        phase: 'board',
        loop: boardLoop,
        type: accepted.type,
        outcome: success ? 'completed' : 'failed',
        t: round1(ctx.state.simTime),
        reward: success ? reward : 0,
        repairSpent: repairInfo.spent,
        readiness: round2(repairInfo.readiness),
        missionId: accepted.id,
        creditsAfter: ctx.state.player.credits | 0,
      });
      receipt.completedLoops = boardLoop;
      if (success) boardSkips = 0;
      else boardSkips += 1;
      continue;
    }

    // Freestyle freight arbitrage (live economy + cargo) when board is cold or toll-heavy.
    if (!buySector || !sellSector) {
      receipt.bottlenecks.push({ code: 'no_freight_stations' });
      break;
    }
    const best = selectArbitrage(ctx, buyStationId, sellStationId);
    if (!best) {
      receipt.bottlenecks.push({ code: 'no_positive_spread', detail: `t=${round1(ctx.state.simTime)}` });
      advanceTime(ctx, 60, budget, 'idleS');
      if (budget.idleS > horizonS * 0.35) break;
      continue;
    }

    const leg1S = travelTimeS(currentSectorId, buySector.id) + DOCK_OVERHEAD_S;
    if (ctx.state.simTime + leg1S > horizonS) break;
    const move1 = tryTravel(ctx, {
      fromSectorId: currentSectorId,
      toSectorId: buySector.id,
      travelS: leg1S,
      reason: `gate_toll:courier_arb:${boardLoop}:buy`,
      seed,
      costs,
      budget,
    });
    if (!move1.ok) {
      receipt.bottlenecks.push({ code: 'unaffordable_toll', detail: 'arb buy leg' });
      break;
    }
    currentSectorId = buySector.id;
    ctx.bus.emit('dock:docked', { stationId: buyStationId });
    ctx.currentStationId = buyStationId;

    const shipCargo = ctx.state.player.cargo.capVolume || NEW_GAME.cargoCapacity;
    const freeVol = shipCargo - (ctx.state.player.cargo.usedVolume || 0);
    let want = Math.floor(freeVol / (best.vol || 1));
    const entry = ctx.state.economy.markets[buyStationId]?.[best.cmdtyId];
    const stockAvail = Math.max(0, Math.floor((entry && entry.stock) - 1));
    want = Math.min(
      want,
      stockAvail,
      Number.isFinite(COURIER_ROUTE_PACING.arbMaxUnits)
        ? COURIER_ROUTE_PACING.arbMaxUnits
        : Number.POSITIVE_INFINITY,
    );
    while (want > 0) {
      const q = ctx.econ.quote(buyStationId, best.cmdtyId, 'buy', want);
      if (q.ok && q.total <= (ctx.state.player.credits | 0)) break;
      want = Math.floor(want * 0.85);
    }
    if (want <= 0) {
      receipt.bottlenecks.push({ code: 'capital_or_stock_bind', detail: best.cmdtyId });
      advanceTime(ctx, 45, budget, 'idleS');
      if (budget.idleS > horizonS * 0.4) break;
      continue;
    }
    const buyRes = executeMarketTrade(ctx, buyStationId, best.cmdtyId, 'buy', want, costs, receipt);
    if (!buyRes.ok) {
      receipt.bottlenecks.push({ code: 'arb_buy_failed', detail: buyRes.reason });
      break;
    }
    advanceTime(ctx, COURIER_ROUTE_PACING.marketTicketS, budget, 'actionS');
    receipt.cargoAuthorityEvents += 1;

    const leg2S = travelTimeS(currentSectorId, sellSector.id) + DOCK_OVERHEAD_S;
    if (ctx.state.simTime + leg2S > horizonS) break;
    const move2 = tryTravel(ctx, {
      fromSectorId: currentSectorId,
      toSectorId: sellSector.id,
      travelS: leg2S,
      reason: `gate_toll:courier_arb:${boardLoop}:sell`,
      seed,
      costs,
      budget,
    });
    if (!move2.ok) {
      receipt.bottlenecks.push({ code: 'unaffordable_toll', detail: 'arb sell leg; cargo stranded' });
      break;
    }
    currentSectorId = sellSector.id;
    ctx.bus.emit('dock:docked', { stationId: sellStationId });
    ctx.currentStationId = sellStationId;
    const have = cargoQty(ctx, best.cmdtyId);
    const sellRes = executeMarketTrade(ctx, sellStationId, best.cmdtyId, 'sell', have, costs, receipt);
    if (!sellRes.ok) {
      receipt.bottlenecks.push({ code: 'arb_sell_failed', detail: sellRes.reason });
      break;
    }
    advanceTime(ctx, COURIER_ROUTE_PACING.marketTicketS, budget, 'actionS');
    const repairInfo = applyDamageAndRepair(ctx, costs, budget, {
      minCreditsAfter: 400,
      readinessGate: 0.9,
    });
    // One successful spot-market leg cools the board-skip streak. Without this reset a single
    // abandoned contract permanently exiled the Courier from authored freight work.
    boardSkips = 0;
    boardLoop += 1;
    receipt.completedLoops = boardLoop;
    // Arbitrage freestyle is not a mission contract, but is freight causality proof.
    receipt.loops.push({
      phase: 'arbitrage',
      loop: boardLoop,
      outcome: 'completed',
      t: round1(ctx.state.simTime),
      cmdtyId: best.cmdtyId,
      bought: buyRes.qty,
      sold: sellRes.qty,
      buyTotal: buyRes.total,
      sellTotal: sellRes.total,
      repairSpent: repairInfo.spent,
      creditsAfter: ctx.state.player.credits | 0,
    });
    markAuthority(receipt, {
      kind: 'market_arbitrage',
      cmdtyId: best.cmdtyId,
      buyStationId,
      sellStationId,
      qty: sellRes.qty,
      marginCr: (sellRes.total || 0) - (buyRes.total || 0),
      atS: round1(ctx.state.simTime),
      authority: 'economy.execute buy/sell (cargo single-writer)',
    });
  }

  // Exact-horizon authority: if no complete action fits, advance the remainder as legitimate idle.
  advanceTime(ctx, horizonS - (ctx.state.simTime || 0), budget, 'idleS');
  return finalize(receipt, ctx, costs, budget, horizonS);
}

function finalize(receipt, ctx, costs, budget, horizonS) {
  const endingCapital = ctx.state.player.credits | 0;
  const netCredits = endingCapital - receipt.startingCapital;
  // Cohort-aligned courier viability: net wallet after live tolls/repair/collateral/market.
  // Collaterals and buys are already reflected in ending capital (no synthetic income).
  const earnedValue = netCredits;
  const elapsedS = Math.max(budget.simS, ctx.state.simTime || 0);
  const windowMin = Math.max(horizonS / 60, 1 / 60);

  receipt.endingCapital = endingCapital;
  receipt.netCredits = netCredits;
  receipt.earnedValue = earnedValue;
  receipt.creditsPerMin = round2(earnedValue / windowMin);
  receipt.creditsPerMinActive = round2(earnedValue / Math.max(elapsedS / 60, 1 / 60));
  receipt.repairCost = costs.repairCost;
  receipt.tollCost = costs.tollCost;
  receipt.missionCost = costs.missionCost;
  receipt.time = {
    simS: round1(elapsedS),
    travelS: round1(budget.travelS),
    actionS: round1(budget.actionS),
    recoveryS: round1(budget.recoveryS),
    idleS: round1(budget.idleS),
  };
  receipt.servicePrices = {
    repairCrPerHp: SERVICE_PRICES.repairCrPerHp,
  };
  receipt.ownedInventoryEnd = { ...(ctx.state.player.cargo?.items || {}) };
  receipt.transitDamageReceipts = (ctx.transitDamageReceipts || []).map((row) => ({ ...row }));
  receipt.creditAuthorityLedger = (ctx.creditAuthorityLedger || []).map((row) => ({ ...row }));
  const purchaseReady = (receipt.loops || []).find((row) => (row.creditsAfter | 0) >= COURIER_FIRST_SHIP_TARGET_CR);
  const cohortRate = COURIER_HAULER_COHORT_REFERENCE[receipt.horizonMin] || null;
  receipt.purchasePacing = {
    roleHullDefId: COURIER_ROLE_HULL_DEF_ID,
    targetCredits: COURIER_FIRST_SHIP_TARGET_CR,
    reached: endingCapital >= COURIER_FIRST_SHIP_TARGET_CR,
    firstReadyAtS: purchaseReady ? round1(purchaseReady.t || 0) : null,
    firstReadyAtMin: purchaseReady ? round2((purchaseReady.t || 0) / 60) : null,
  };
  receipt.capitalProgress = {
    targetCredits: COURIER_30M_CAPITAL_PROGRESS_CR,
    reached: endingCapital >= COURIER_30M_CAPITAL_PROGRESS_CR,
    fractionOfRoleHull: round2(endingCapital / COURIER_FIRST_SHIP_TARGET_CR),
  };
  receipt.balanceReview = {
    cohortRate,
    cohortRatio: cohortRate ? round2(receipt.creditsPerMin / cohortRate) : null,
    cohortUpperBand: 600,
  };
  const accountedEnding = receipt.startingCapital + receipt.saleProceeds + receipt.missionProceeds
    - receipt.purchaseSpend - costs.tollCost - costs.repairCost;
  receipt.creditAccounting = {
    startingCapital: receipt.startingCapital,
    saleProceeds: receipt.saleProceeds,
    missionProceeds: receipt.missionProceeds,
    purchaseSpend: receipt.purchaseSpend,
    tollCost: costs.tollCost,
    repairCost: costs.repairCost,
    accountedEnding,
    actualEnding: endingCapital,
    residual: endingCapital - accountedEnding,
  };

  const fails = [];
  const warns = [];

  if (receipt.defects.length) fails.push(...receipt.defects.map((d) => `defect:${d}`));
  if (receipt.origin.status !== 'completed' && horizonS >= 15 * 60) {
    fails.push(`origin_incomplete:${receipt.origin.status}`);
  }
  if (!(receipt.time.travelS > 0)) fails.push('travel_time_not_accounted');
  if (!(receipt.time.actionS > 0)) fails.push('action_time_not_accounted');
  if (Math.abs(receipt.time.simS - horizonS) > 0.001) {
    fails.push(`time_authority_mismatch simS=${receipt.time.simS} horizon=${horizonS}`);
  }
  if (!(receipt.repairCost > 0)) fails.push('repair_cost_missing');
  if (!(receipt.failedContracts > 0)) fails.push('retry_or_board_failure_missing');
  if (!(receipt.missionProceeds > 0)) fails.push('mission_proceeds_missing');
  if (!(receipt.cargoAuthorityEvents > 0)) fails.push('cargo_authority_missing');
  if (!(receipt.saleProceeds > 0) && !(receipt.loops || []).some((l) => l.phase === 'origin' && l.missionType === 'bulk_trade')) {
    // market_spread or arbitrage must prove market causality for courier.
    if (!(receipt.saleProceeds > 0)) fails.push('market_sale_proceeds_missing');
  }
  if (receipt.creditAccounting.residual !== 0) {
    fails.push(`credit_accounting_residual:${receipt.creditAccounting.residual}`);
  }
  if (!receipt.authorityReceipts.some((a) => a.kind === 'mission_complete'
    && /missions/i.test(a.authority || ''))) {
    fails.push('missions_economy_authority_missing');
  }
  if (!receipt.authorityReceipts.some((a) => a.kind === 'market_arbitrage' || a.type === 'bulk_trade'
    || (a.kind === 'mission_complete' && a.type === 'bulk_trade'))) {
    // Prefer market causality evidence.
    if (!(receipt.saleProceeds > 0)) fails.push('freight_market_causality_missing');
  }
  if (receipt.saveProof) {
    if (!receipt.saveProof.ok) fails.push(`save_roundtrip_failed:${receipt.saveProof.error}`);
  } else if (horizonS >= 30 * 60) {
    fails.push('save_proof_missing');
  }
  if (receipt.origin.attemptHaircuts.length) {
    for (const h of receipt.origin.attemptHaircuts) {
      if (!(h.rewardAfter < h.rewardBefore)) fails.push('retry_haircut_not_applied');
    }
  } else if (horizonS >= 30 * 60) {
    fails.push('origin_retry_missing');
  }

  if (receipt.creditsPerMin < COURIER_DEAD_CR_PER_MIN) {
    fails.push(`dead_income ${receipt.creditsPerMin} < ${COURIER_DEAD_CR_PER_MIN}`);
  } else if (receipt.creditsPerMin < COURIER_HEALTHY_CR_PER_MIN) {
    fails.push(`below_healthy_band ${receipt.creditsPerMin} < ${COURIER_HEALTHY_CR_PER_MIN}`);
  }
  if (cohortRate && receipt.creditsPerMin > cohortRate * 1.35) {
    warns.push(`career_parity_high ${receipt.creditsPerMin} > 1.35x cohort ${cohortRate}`);
  }
  if (receipt.creditsPerMin > receipt.balanceReview.cohortUpperBand) {
    warns.push(`hauler_upper_band_exceeded ${receipt.creditsPerMin} > ${receipt.balanceReview.cohortUpperBand}`);
  }
  if (horizonS === 30 * 60 && !receipt.capitalProgress.reached) {
    fails.push(`thirty_minute_capital_progress_missing ${endingCapital} < ${COURIER_30M_CAPITAL_PROGRESS_CR}`);
  }
  if (horizonS >= COURIER_ROLE_HULL_DEADLINE_MIN * 60 && !receipt.purchasePacing.reached) {
    fails.push(`role_hull_not_affordable ${endingCapital} < ${COURIER_FIRST_SHIP_TARGET_CR}`);
  }

  if (receipt.origin.status === 'completed') {
    const originRewards = receipt.loops
      .filter((l) => l.phase === 'origin' && l.outcome === 'completed')
      .reduce((s, l) => s + (l.reward || 0), 0);
    if (!(originRewards > 0) && !(receipt.missionProceeds > 0)) {
      fails.push('origin_rewards_missing');
    }
  }

  receipt.assertionFails = fails;
  receipt.assertionWarns = warns;
  receipt.ok = fails.length === 0;
  return receipt;
}

function determinismProjection(receipt) {
  return {
    seed: receipt.seed,
    horizonS: receipt.horizonS,
    endingCapital: receipt.endingCapital,
    earnedValue: receipt.earnedValue,
    creditsPerMin: receipt.creditsPerMin,
    completedContracts: receipt.completedContracts,
    failedContracts: receipt.failedContracts,
    repairCost: receipt.repairCost,
    tollCost: receipt.tollCost,
    missionProceeds: receipt.missionProceeds,
    saleProceeds: receipt.saleProceeds,
    purchaseSpend: receipt.purchaseSpend,
    capitalProgress: receipt.capitalProgress,
    purchasePacing: receipt.purchasePacing,
    time: receipt.time,
    origin: receipt.origin,
    loops: receipt.loops,
    authorityReceipts: receipt.authorityReceipts,
    creditAccounting: receipt.creditAccounting,
    saveProof: receipt.saveProof,
  };
}

/** Run independent 30/60/90 public-route measurements. */
export function measureCourierPublicRouteHorizons(options = {}) {
  const horizons = options.horizonsMin || COURIER_ROUTE_HORIZONS_MIN;
  const seed = (options.seed != null ? options.seed : COURIER_PUBLIC_ROUTE_SEED) >>> 0;
  const cells = {};
  const table = [];
  for (const minutes of horizons) {
    const receipt = runCourierPublicRoute({
      ...options,
      seed,
      horizonMin: minutes,
    });
    cells[minutes] = receipt;
    table.push({
      career: 'courier',
      minutes,
      seed: receipt.seed,
      credits: receipt.endingCapital,
      earnedValue: receipt.earnedValue,
      creditsPerMin: receipt.creditsPerMin,
      completedContracts: receipt.completedContracts,
      failedContracts: receipt.failedContracts,
      repairCost: receipt.repairCost,
      tollCost: receipt.tollCost,
      missionProceeds: receipt.missionProceeds,
      saleProceeds: receipt.saleProceeds,
      simS: receipt.time.simS,
      travelS: receipt.time.travelS,
      actionS: receipt.time.actionS,
      firstShipReadyMin: receipt.purchasePacing.firstReadyAtMin,
      capitalProgressReached: receipt.capitalProgress.reached,
      cohortRate: receipt.balanceReview.cohortRate,
      cohortRatio: receipt.balanceReview.cohortRatio,
      originStatus: receipt.origin.status,
      originElapsedS: receipt.origin.elapsedS,
      ok: receipt.ok,
      assertionFails: receipt.assertionFails,
      assertionWarns: receipt.assertionWarns,
    });
  }
  const firstMinutes = horizons[0];
  let determinism = { ok: true, minutes: firstMinutes, mismatch: null };
  if (options.includeDeterminism !== false && cells[firstMinutes]) {
    const replay = runCourierPublicRoute({ ...options, seed, horizonMin: firstMinutes });
    const expected = JSON.stringify(determinismProjection(cells[firstMinutes]));
    const actual = JSON.stringify(determinismProjection(replay));
    determinism = {
      ok: expected === actual,
      minutes: firstMinutes,
      mismatch: expected === actual ? null : 'projected_receipt_mismatch',
    };
  }
  // Retry economics: forced origin haircut + board abandon vs clean origin at 30m.
  let retryDelta = null;
  if (options.includeRetryDelta !== false) {
    const withRetry = runCourierPublicRoute({
      seed, horizonMin: 30, forceRetryOnFirstStep: true, forceBoardFailureAt: 2,
    });
    const cleanPass = runCourierPublicRoute({
      seed, horizonMin: 30, forceRetryOnFirstStep: false, forceBoardFailureAt: 2,
    });
    const originPaid = (receipt) => (receipt.loops || [])
      .filter((l) => l.phase === 'origin' && l.outcome === 'completed')
      .reduce((s, l) => s + (l.reward || 0), 0);
    const originWithRetry = originPaid(withRetry);
    const originClean = originPaid(cleanPass);
    const haircut = withRetry.origin.attemptHaircuts && withRetry.origin.attemptHaircuts[0];
    const earnedDelta = round2(cleanPass.earnedValue - withRetry.earnedValue);
    const crPerMinDelta = round2(cleanPass.creditsPerMin - withRetry.creditsPerMin);
    retryDelta = {
      withRetryEarned: withRetry.earnedValue,
      withRetryCrPerMin: withRetry.creditsPerMin,
      withRetryFailed: withRetry.failedContracts,
      withRetryHaircuts: withRetry.origin.attemptHaircuts,
      withRetryOriginPaid: originWithRetry,
      cleanEarned: cleanPass.earnedValue,
      cleanCrPerMin: cleanPass.creditsPerMin,
      cleanFailed: cleanPass.failedContracts,
      cleanOriginPaid: originClean,
      earnedDelta,
      crPerMinDelta,
      originPaidDelta: round2(originClean - originWithRetry),
      haircutApplied: !!(haircut && haircut.rewardAfter < haircut.rewardBefore),
      meaningful: earnedDelta > 0
        && !!(haircut && haircut.rewardAfter < haircut.rewardBefore)
        && withRetry.failedContracts > cleanPass.failedContracts
        && originClean > originWithRetry,
    };
    retryDelta.ok = retryDelta.meaningful;
  }
  const affordableCell = table.find((row) => row.firstShipReadyMin != null) || null;
  const roleHullPacing = {
    roleHullDefId: COURIER_ROLE_HULL_DEF_ID,
    targetCredits: COURIER_FIRST_SHIP_TARGET_CR,
    deadlineMin: COURIER_ROLE_HULL_DEADLINE_MIN,
    affordableByMin: affordableCell ? affordableCell.firstShipReadyMin : null,
    sampledHorizonMin: affordableCell ? affordableCell.minutes : null,
  };
  roleHullPacing.ok = roleHullPacing.affordableByMin != null
    && roleHullPacing.affordableByMin <= roleHullPacing.deadlineMin;
  const ok = table.every((row) => row.ok)
    && determinism.ok
    && (retryDelta == null || retryDelta.ok)
    && roleHullPacing.ok;
  return {
    schema: COURIER_PUBLIC_ROUTE_SCHEMA,
    seed,
    ok,
    healthyFloorCrPerMin: COURIER_HEALTHY_CR_PER_MIN,
    deadFloorCrPerMin: COURIER_DEAD_CR_PER_MIN,
    cleanGrossEnvelopeCr: COURIER_ORIGIN_CLEAN_GROSS_ENVELOPE_CR,
    determinism,
    retryDelta,
    roleHullPacing,
    table,
    cells,
  };
}
