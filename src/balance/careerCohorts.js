// M3 career cohort harness (production-authority layer) — independent career×horizon strategies
// driven through registered production systems, not synthetic income adapters.
//
// Authority policy:
//   LIVE  — economy (credits/trade/services), cargo, ships (buy/unlock), factions (rep events),
//           missions (board accept/complete + RP writer), fieldDepletion, save serialize/_restore.
//   ADAPTER / WARNING — combat TTK (EHP/DPS tables), mine TTK (beam/asteroid tables), travel
//           duration (MISSION_TUNING.cruiseSpeedRef + positions). Labeled; cannot justify retunes.
//
// Determinism: state.rng + simTime only; Math.random / Date.now blocked while running
// (Date.now briefly restored around save.serializeData lastSavedAt write).

import { createSimulation } from '../core/sim.js';
import { hash32, mulberry32 } from '../core/rng.js';
import { snapshotSimState, canonicalStringify } from '../core/simSnapshot.js';
import { AUTO_BALANCE } from '../data/automation.js';
import { COMMODITIES } from '../data/commodities.js';
import { ENEMY_TYPES } from '../data/enemies.js';
import { planGateScene } from '../data/gateControl.js';
import { ASTEROIDS, BEAMS } from '../data/mining.js';
import { MISSION_TUNING, MISSION_TYPES } from '../data/missions.js';
import { MODULES } from '../data/modules.js';
import { NEW_GAME } from '../data/newGameDefaults.js';
import { SECTORS, dangerTier } from '../data/sectors.js';
import { SHIPS } from '../data/ships.js';
import { WEAPONS } from '../data/weapons.js';
import { TECH_NODES } from '../data/tech.js';
import { ORIGIN_ROLE_KITS } from '../careers/origins/careerOriginContracts.js';
import {
  HAULER_STEP_PARAMS,
  HAULER_ROLE_HULL_DEF_ID,
} from '../careers/ladders/haulerLadderDefs.js';
import { HUNTER_ROLE_HULL_DEF_ID } from '../careers/ladders/hunterLadderDefs.js';
import { PROSPECTOR_ROLE_HULL_DEF_ID } from '../careers/ladders/prospectorLadderDefs.js';
import {
  fieldDepletion as fieldDepletionSystem,
  fieldMemoryReadout,
  recordFieldExtraction,
  recoverFieldDepletion,
} from '../systems/fieldDepletion.js';
import { cargo as cargoSystem, addCargo, removeCargo } from '../systems/cargo.js';
import { economy as economySystem, SERVICE_PRICES } from '../systems/economy.js';
import { ships as shipsSystem, makeShipEntitySpec, fittingsFromDefaultModules, getDerivedStats, buildSlotList, fits } from '../systems/ships.js';
import { factions as factionsSystem } from '../systems/factions.js';
import { missions as missionsSystem } from '../systems/missions.js';
import { save as saveSystem } from '../save/saveSystem.js';
import { makeEnemySpawnSpec } from '../systems/combat.js';

export const CAREER_COHORT_SCHEMA = 'spaceface.m3.careerCohorts.v3';
export const CAREER_IDS = Object.freeze(['hauler', 'hunter', 'prospector']);
export const DEFAULT_HORIZONS_MIN = Object.freeze([30, 60, 90]);

/** Three independent seeds per career (primary + two held-out). */
export const SEED_SETS = Object.freeze({
  hauler: Object.freeze([0xC0B0_A001, 0xC0B0_A011, 0xC0B0_A021]),
  hunter: Object.freeze([0xC0B0_B002, 0xC0B0_B012, 0xC0B0_B022]),
  prospector: Object.freeze([0xC0B0_C003, 0xC0B0_C013, 0xC0B0_C023]),
});

export const SEED_BY_CAREER = Object.freeze({
  hauler: SEED_SETS.hauler[0],
  hunter: SEED_SETS.hunter[0],
  prospector: SEED_SETS.prospector[0],
});

const A_T1 = AUTO_BALANCE.activeRefByTier[0]; // 250
const EARLY_CMDTY_MAX_BASE = 200;
const DOCK_OVERHEAD_S = 18;
const MINING_TRANSIT_S = 35;
const COMBAT_APPROACH_S = 25;
const REPAIR_FRAC_OF_DAMAGE = 0.55;
const DEATH_DOWNTIME_S = 90;
// A worked lane is not dead forever: the live economy keeps drifting stock toward its
// producer/consumer equilibrium. Retire it long enough for that authority to recover, then
// allow the strategy to reassess the real quotes. This preserves price-impact decay without
// turning a 90-minute Hauler career into a one-use list of commodities.
const HAULER_ROUTE_RECOVERY_S = 7 * 60;

const CMDTY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c]));
const SHIP_BY_ID = new Map(SHIPS.map((s) => [s.id, s]));
const WEAPON_BY_ID = new Map(WEAPONS.map((w) => [w.id, w]));
const MODULE_BY_ID = new Map(MODULES.map((m) => [m.id, m]));
const TECH_BY_ID = new Map(TECH_NODES.map((n) => [n.id, n]));
const SECTOR_BY_ID = new Map(SECTORS.map((s) => [s.id, s]));
const STATION_TO_SECTOR = new Map();
const STATION_BY_ID = new Map();
for (const sec of SECTORS) {
  for (const st of sec.stations || []) {
    STATION_TO_SECTOR.set(st.id, sec);
    STATION_BY_ID.set(st.id, st);
  }
}

/** Career-specific rate bands (cr/min of earnedValue over that independent horizon). */
export const CAREER_BANDS = Object.freeze({
  hauler: Object.freeze({
    dead: round2(A_T1 * 0.20),
    lo: round2(A_T1 * 0.45),
    hi: round2(A_T1 * 2.4),
    note: 'Live market arbitrage; capacity + exhaustion bind',
  }),
  hunter: Object.freeze({
    dead: round2(A_T1 * 0.12),
    lo: round2(A_T1 * 0.25),
    hi: round2(A_T1 * 1.6),
    note: 'Bounty/recon settle via missions board accept + complete → economy:grantCredits; repair live',
  }),
  prospector: Object.freeze({
    dead: round2(A_T1 * 0.12),
    lo: round2(A_T1 * 0.28),
    hi: round2(A_T1 * 1.5),
    note: 'Live sell + field depletion; mine TTK from beam/asteroid data',
  }),
});

export function round(n) { return Math.round(Number(n) || 0); }
export function round1(n) { return Math.round((Number(n) || 0) * 10) / 10; }
export function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

// ---- nondeterminism guard ---------------------------------------------------
const _MathRandom = Math.random;
const _DateNow = Date.now;
let _blocked = false;

export function blockNondeterminism() {
  if (_blocked) return;
  _blocked = true;
  Math.random = () => { throw new Error('Math.random forbidden in career cohort'); };
  Date.now = () => { throw new Error('Date.now forbidden in career cohort'); };
}

export function restoreNondeterminism() {
  if (!_blocked) return;
  _blocked = false;
  Math.random = _MathRandom;
  Date.now = _DateNow;
}

// ---- travel math (data-grounded adapters; documented) -----------------------
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

/** Mission reward formula mirror — ADAPTER (missions.js board/complete not invoked). */
export function missionRewardCrAdapter(typeId, distanceWu, riskTier, fValue) {
  const base = (MISSION_TUNING.BASE && MISSION_TUNING.BASE[typeId]) || 100;
  const fDist = 1 + distanceWu / (MISSION_TUNING.distDivisor || 2000);
  const fRisk = (MISSION_TUNING.RISK_MULT && MISSION_TUNING.RISK_MULT[riskTier]) || 1;
  return round(base * fDist * fRisk * fValue);
}

// ---- sim bootstrap (live systems) -------------------------------------------
const COHORT_SYSTEMS = [
  economySystem, cargoSystem, shipsSystem, factionsSystem,
  missionsSystem, fieldDepletionSystem, saveSystem,
];

function bootSim(seed) {
  const sim = createSimulation({
    seed,
    systems: COHORT_SYSTEMS,
  });
  const state = sim.state;
  const bus = sim.bus;
  const econ = sim.registry.get('economy');
  const ships = sim.registry.get('ships');
  const factions = sim.registry.get('factions');
  const missions = sim.registry.get('missions');
  const fieldDep = sim.registry.get('fieldDepletion');
  const save = sim.registry.get('save');

  state.mode = 'flight';
  state.meta = state.meta || {};
  state.meta.seed = seed >>> 0;
  // Tutorial/onboarding ownership of opening mission must not block cohort boards.
  state.onboarding = { active: false, finished: true, step: 'done' };
  state.settings = state.settings || {};
  state.settings.gameplay = {
    ...(state.settings.gameplay || {}),
    tutorialHints: false,
    autosaveIntervalS: 0,
  };
  state.player.credits = NEW_GAME.credits;
  state.player.cargo = {
    items: {},
    usedVolume: 0,
    usedMass: 0,
    capVolume: NEW_GAME.cargoCapacity,
    capMass: 60,
  };
  state.player.stats = state.player.stats || {
    tradesCount: 0, lifetimeProfit: 0, biggestSingleProfit: 0, smuggledValue: 0, kills: 0, missionsDone: 0,
  };
  state.player.researchPoints = NEW_GAME.researchPoints || 0;
  state.player.researchedNodes = (NEW_GAME.researchedNodes || []).slice();
  state.simTime = 0;
  state.world = state.world || {};
  state.world.currentSectorId = NEW_GAME.startingSectorId;

  // Live ships newGame + player entity so repair services and cargo caps recompute correctly.
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

  if (factions && typeof factions.newGame === 'function') factions.newGame();
  // Seed NEW_GAME faction rep into live faction records after newGame defaults.
  for (const [fid, rep] of Object.entries(NEW_GAME.factionRep || {})) {
    if (!state.factions[fid]) continue;
    const delta = (rep | 0) - (state.factions[fid].rep | 0);
    if (delta) bus.emit('faction:repDelta', { factionId: fid, delta, reason: 'new_game_seed' });
  }

  if (fieldDep && typeof fieldDep.newGame === 'function') fieldDep.newGame();
  if (missions && typeof missions.newGame === 'function') missions.newGame();
  // Cohort strategies own their contracts; clear campaign cold-start so board slots are free.
  if (state.missions) {
    state.missions.active = [];
    state.missions.completedLog = [];
    state.missions.receipts = [];
    state.missions.nextId = 1;
  }

  const ownedWeapons = new Set(
    (NEW_GAME.fittedModules || []).filter((id) => WEAPON_BY_ID.has(id)),
  );
  const ownedModules = new Set(
    (NEW_GAME.fittedModules || []).filter((id) => MODULE_BY_ID.has(id)),
  );

  return {
    sim, state, bus, econ, ships, factions, missions, fieldDep, save,
    seed: seed >>> 0,
    ownedWeapons, ownedModules,
    hullDamageHp: 0, // outstanding unrepaired hull damage (persists between fights)
    currentShipId: NEW_GAME.shipId,
  };
}

/** Date.now is blocked in cohorts; save.serializeData writes lastSavedAt via new Date(). */
function withDateAllowed(fn) {
  const prev = Date.now;
  Date.now = _DateNow;
  try {
    return fn();
  } finally {
    Date.now = prev;
  }
}

function captureAuthoritySlice(ctx) {
  const e = playerEntity(ctx);
  const markets = {};
  for (const sid of Object.keys(ctx.state.economy?.markets || {})) {
    markets[sid] = {};
    for (const cid of Object.keys(ctx.state.economy.markets[sid] || {})) {
      const entry = ctx.state.economy.markets[sid][cid];
      markets[sid][cid] = round1(entry.stock || 0);
    }
  }
  return {
    credits: ctx.state.player.credits | 0,
    cargo: { ...(ctx.state.player.cargo.items || {}) },
    simTime: round1(ctx.state.simTime || 0),
    sectorId: ctx.state.world.currentSectorId,
    researchPoints: ctx.state.player.researchPoints || 0,
    researchedNodes: (ctx.state.player.researchedNodes || []).slice().sort(),
    hull: e ? round1(e.hull || 0) : null,
    hullMax: e ? round1(e.hullMax || 0) : null,
    shipId: ctx.currentShipId,
    missionsActive: (ctx.state.missions?.active || []).map((m) => ({
      id: m.id, type: m.type, status: m.status, progress: m.objectiveProgress | 0,
    })),
    missionsDone: ctx.state.player.stats?.missionsDone || 0,
    fieldDepletion: JSON.parse(JSON.stringify(ctx.state.fieldDepletion || { fields: {} })),
    markets,
  };
}

/**
 * Production save serialize → restore into a fresh sim of the same system set.
 * Returns { ok, before, after, payload, restoredCtx, error }.
 */
export function saveReloadRoundTrip(ctx) {
  if (!ctx.save || typeof ctx.save.serializeData !== 'function') {
    return { ok: false, error: 'save_system_missing' };
  }
  const before = captureAuthoritySlice(ctx);
  let payload;
  try {
    payload = withDateAllowed(() => ctx.save.serializeData());
  } catch (err) {
    return { ok: false, error: `serialize_failed:${err && err.message || err}` };
  }
  const restoredCtx = bootSim(ctx.seed);
  try {
    withDateAllowed(() => restoredCtx.save._restore(payload, 'cohort_mid'));
  } catch (err) {
    return { ok: false, error: `restore_failed:${err && err.message || err}`, payload };
  }
  // Re-bind tracking fields the strategies keep outside pure GameState.
  restoredCtx.currentShipId = restoredCtx.state.player?.ownedShips?.[0]?.defId
    || restoredCtx.state.player?.shipId
    || NEW_GAME.shipId;
  const e = playerEntity(restoredCtx);
  if (e && e.hullMax > 0) {
    restoredCtx.hullDamageHp = Math.max(0, e.hullMax - (e.hull || 0));
  }
  // Rebuild owned weapon set from fittings + inventory evidence after restore.
  restoredCtx.ownedWeapons = new Set(
    (activeFittings(restoredCtx) || []).filter((id) => WEAPON_BY_ID.has(id)),
  );
  for (const id of before.researchedNodes || []) {
    /* researched nodes already on player via save */
  }
  const after = captureAuthoritySlice(restoredCtx);
  const mismatchKeys = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((key) => canonicalStringify(before[key]) !== canonicalStringify(after[key]));
  const ok = mismatchKeys.length === 0;
  return {
    ok,
    before,
    after,
    mismatchKeys,
    payload,
    restoredCtx,
    error: ok ? null : `authority_slice_mismatch:${mismatchKeys.join(',')}`,
  };
}

/**
 * Find a board offer of the given type across stations (live ensureBoard).
 * options.preferSectorId — try stations in that sector first.
 * options.maxCredits — skip offers whose station leg or collateral exceeds wallet.
 * options.fromSectorId — used with maxCredits for affordability of the board leg.
 */
function findBoardOffer(ctx, typeId, stationIds, options = {}) {
  if (!ctx.missions) return null;
  const preferSectorId = options.preferSectorId || null;
  const maxCredits = options.maxCredits != null ? options.maxCredits : Infinity;
  const fromSectorId = options.fromSectorId || ctx.state.world?.currentSectorId;
  const seed = options.seed != null ? options.seed : (ctx.seed || 0);
  const ordered = preferSectorId
    ? [
      ...stationIds.filter((id) => STATION_TO_SECTOR.get(id)?.id === preferSectorId),
      ...stationIds.filter((id) => STATION_TO_SECTOR.get(id)?.id !== preferSectorId),
    ]
    : [...stationIds];
  for (const stationId of ordered) {
    const board = ctx.missions.ensureBoard(stationId);
    if (!board || !board.slots) continue;
    const offer = board.slots.find((s) => s
      && s.type === typeId
      && !String(s.storyTag || '').startsWith('campaign47a:')
      && !String(s.id || '').startsWith('offer_sp1_'));
    if (!offer) continue;
    const boardSector = STATION_TO_SECTOR.get(stationId)?.id;
    const boardToll = (boardSector && fromSectorId && boardSector !== fromSectorId)
      ? routeTollAmount(seed, fromSectorId, boardSector, 0)
      : 0;
    const destSector = offer.destSectorId || boardSector;
    const destToll = (destSector && boardSector && destSector !== boardSector)
      ? routeTollAmount(seed, boardSector, destSector, 0)
      : 0;
    const coll = offer.collateral_cr || 0;
    // Wallet must cover board travel + collateral + outbound dest travel (rough lower bound).
    if (boardToll + destToll + coll > maxCredits) continue;
    return { offer, stationId, board, boardToll, destToll };
  }
  return null;
}

/**
 * Accept a board offer through missions.acceptMission (collateral/fees via economy events).
 * Returns the active instance or null.
 */
function acceptBoardOffer(ctx, offerId, costs, receipt) {
  if (!ctx.missions || !offerId) return null;
  const before = ctx.state.player.credits | 0;
  const ok = ctx.missions.acceptMission(offerId);
  if (!ok) return null;
  const spent = before - (ctx.state.player.credits | 0);
  if (spent > 0) {
    costs.missionCost += spent;
    receipt.purchaseSpend = (receipt.purchaseSpend || 0) + spent;
  }
  const active = (ctx.state.missions.active || []).find((m) => m
    && m.status === 'active'
    && (m.id === offerId || m.sourceOfferId === offerId || m.id === `m_${offerId}`
      || (m.sourceOfferId == null && m.type)));
  // Prefer newest active non-story mission of matching accept.
  const candidates = (ctx.state.missions.active || []).filter((m) => m && m.status === 'active'
    && !String(m.storyTag || '').startsWith('campaign47a:'));
  return candidates[candidates.length - 1] || active || null;
}

/** Complete a bounty_hunt via entity:killed → missions._onKill → _completeMission → economy. */
function completeBountyViaKill(ctx, mission, costs, receipt) {
  if (!mission || mission.type !== 'bounty_hunt') return { ok: false, reward: 0 };
  const before = ctx.state.player.credits | 0;
  const beforeDone = ctx.state.player.stats?.missionsDone || 0;
  const dummy = ctx.sim.helpers.spawnEntity({
    type: 'ship',
    pos: { x: 40, z: 40 },
    hull: 10,
    hullMax: 10,
    team: 1,
    alive: true,
    data: { missionTarget: true },
  });
  mission.targetEntityIds = [dummy.id];
  ctx.bus.emit('entity:killed', {
    id: dummy.id,
    killerId: ctx.state.playerId,
    killerTeam: 0,
  });
  const after = ctx.state.player.credits | 0;
  const reward = Math.max(0, after - before);
  if (reward > 0) receipt.missionProceeds = (receipt.missionProceeds || 0) + reward;
  const done = (ctx.state.player.stats?.missionsDone || 0) > beforeDone
    || !(ctx.state.missions.active || []).some((m) => m.id === mission.id && m.status === 'active');
  return { ok: done || reward > 0, reward, missionId: mission.id };
}

/** Complete recon_scan via scan:completed → missions RP writer. */
function completeReconViaScan(ctx, mission, receipt) {
  if (!mission || mission.type !== 'recon_scan') return { ok: false, rp: 0, reward: 0 };
  const beforeCr = ctx.state.player.credits | 0;
  const beforeRp = ctx.state.player.researchPoints || 0;
  ctx.state.world.currentSectorId = mission.destSectorId || ctx.state.world.currentSectorId;
  const target = Math.max(1, mission.objectiveTarget || mission.params?.scanTargets || 1);
  for (let i = 0; i < target; i++) {
    ctx.bus.emit('scan:completed', { targetId: null, found: { asteroids: 1 } });
  }
  const reward = Math.max(0, (ctx.state.player.credits | 0) - beforeCr);
  const rp = Math.max(0, (ctx.state.player.researchPoints || 0) - beforeRp);
  if (reward > 0) receipt.missionProceeds = (receipt.missionProceeds || 0) + reward;
  return { ok: rp > 0 || reward > 0, rp, reward, missionId: mission.id };
}

/** Dock-side delivery complete for cargo_delivery via dock:docked. */
function completeDeliveryAtDock(ctx, stationId) {
  ctx.bus.emit('dock:docked', { stationId });
  ctx.bus.emit('dock:undocked', { stationId });
}

function playerEntity(ctx) {
  return ctx.state.entities.get(ctx.state.playerId) || null;
}

function activeFittings(ctx) {
  const owned = ctx.ships.ownedShip();
  return (owned && owned.fittings) || [];
}

function setActiveHull(ctx, shipId) {
  const ship = SHIP_BY_ID.get(shipId);
  if (!ship) return false;
  ctx.state.player.cargo.capVolume = ship.cargo;
  ctx.state.player.cargo.capMass = Math.max(60, Math.round(ship.cargo * 1.5));
  ctx.currentShipId = shipId;
  const e = playerEntity(ctx);
  if (e && e.data) {
    e.data.defId = shipId;
    ctx.ships.recomputeEntity(e.id, activeFittings(ctx));
  }
  return true;
}

/**
 * Advance sim time authority: economy.update + fieldDepletion recovery + state.simTime.
 * Every action/travel/dock/recovery path must go through this (or tryTravel which does).
 * Credits/cargo/missions are never mutated here — only clocks and recovery kernels.
 */
function advanceTime(ctx, dt, budget, bucket = 'actionS') {
  const d = Math.max(0, Number(dt) || 0);
  if (d <= 0) return 0;
  ctx.econ.update(d, ctx.state);
  if (ctx.fieldDep && typeof ctx.fieldDep.update === 'function') {
    ctx.fieldDep.update(d, ctx.state);
  } else {
    recoverFieldDepletion(ctx.state, d);
  }
  // Missions update handles escort/time limits; keep registered.
  if (ctx.missions && typeof ctx.missions.update === 'function') {
    ctx.missions.update(d, ctx.state);
  }
  ctx.state.simTime = (ctx.state.simTime || 0) + d;
  ctx.state.meta.playtimeS = (ctx.state.meta.playtimeS || 0) + d;
  budget.simS += d;
  if (bucket && budget[bucket] != null) budget[bucket] += d;
  return d;
}

/**
 * Affordability-gated toll charge. Live chargeCredits clamps to 0; we refuse travel instead.
 * Returns { ok, charged }.
 */
function tryChargeToll(ctx, amount, reason, costs) {
  const cr = round(amount);
  if (cr <= 0) return { ok: true, charged: 0 };
  const have = ctx.state.player.credits | 0;
  if (have < cr) return { ok: false, charged: 0, have, need: cr };
  const before = have;
  ctx.econ.chargeCredits(cr, reason);
  const after = ctx.state.player.credits | 0;
  if (before - after !== cr) {
    // Should not happen after affordability gate; treat as deny.
    return { ok: false, charged: before - after, have: before, need: cr };
  }
  costs.tollCost += cr;
  return { ok: true, charged: cr };
}

/**
 * Travel only if toll is fully affordable. On deny: no sector change, no time advance for the leg.
 */
function tryTravel(ctx, {
  fromSectorId, toSectorId, travelS, reason, seed, costs, budget, dayIndex = 0,
}) {
  const toll = routeTollAmount(seed, fromSectorId, toSectorId, dayIndex);
  const pay = tryChargeToll(ctx, toll, reason, costs);
  if (!pay.ok) {
    return {
      ok: false,
      reason: 'unaffordable_toll',
      toll,
      have: pay.have,
      need: pay.need,
    };
  }
  advanceTime(ctx, travelS, budget, 'travelS');
  ctx.state.world.currentSectorId = toSectorId;
  return { ok: true, toll: pay.charged, travelS };
}

/** Focused contract proof for the cohort's modeled gate-travel seam. */
export function auditUnaffordableTravelDenial(options = {}) {
  const seed = options.seed != null ? options.seed : SEED_BY_CAREER.hauler;
  const fromSectorId = options.fromSectorId || 'sector_helios_prime';
  const toSectorId = options.toSectorId || 'sector_ceres_belt';
  const ctx = bootSim(seed);
  ctx.state.player.credits = 0;
  ctx.state.world.currentSectorId = fromSectorId;
  const costs = emptyCosts();
  const budget = emptyBudget();
  const before = {
    credits: ctx.state.player.credits,
    sectorId: ctx.state.world.currentSectorId,
    simTime: ctx.state.simTime,
    travelS: budget.travelS,
  };
  const result = tryTravel(ctx, {
    fromSectorId,
    toSectorId,
    travelS: options.travelS || 120,
    reason: 'cohort_test:unaffordable_toll',
    seed,
    costs,
    budget,
  });
  return {
    result,
    before,
    after: {
      credits: ctx.state.player.credits,
      sectorId: ctx.state.world.currentSectorId,
      simTime: ctx.state.simTime,
      travelS: budget.travelS,
    },
    tollCost: costs.tollCost,
  };
}

function emptyBudget() {
  return { simS: 0, travelS: 0, actionS: 0, dockS: 0, recoveryS: 0, idleS: 0 };
}

function emptyCosts() {
  return {
    tollCost: 0, repairCost: 0, ammoCost: 0, missionCost: 0,
    insuranceCost: 0, researchSpend: 0, refineryCost: 0,
  };
}

function inventoryUnits(items) {
  let n = 0;
  for (const id of Object.keys(items || {})) n += items[id] | 0;
  return n;
}

function shipEquity(shipId) {
  const ship = SHIP_BY_ID.get(shipId);
  if (!ship) return 0;
  return ship.price > 0 ? ship.price : (ship.buyback || 0);
}

function cargoMarketValue(ctx, stationId) {
  let total = 0;
  for (const [cid, qty] of Object.entries(ctx.state.player.cargo.items || {})) {
    if (!qty) continue;
    const q = ctx.econ.quote(stationId, cid, 'sell', qty);
    if (q && q.ok) total += q.total;
    else total += (CMDTY_BY_ID.get(cid)?.basePrice || 0) * qty;
  }
  return round(total);
}

function markBottleneck(receipt, code, detail) {
  receipt.bottlenecks = receipt.bottlenecks || [];
  if (!receipt.bottlenecks.some((b) => b.code === code)) {
    receipt.bottlenecks.push({ code, detail: detail || code });
  }
}

function markAdapter(receipt, code, detail) {
  receipt.adaptersUsed = receipt.adaptersUsed || [];
  if (!receipt.adaptersUsed.some((a) => a.code === code)) {
    receipt.adaptersUsed.push({ code, detail: detail || code, authority: 'adapter_warning' });
  }
}

/**
 * Apply damage to live player entity hull and optionally repair via economy service.
 * Partial repair leaves remaining damage (hullDamageHp + entity hull fraction).
 * Repair is production ui:service — but only when readiness is low enough and the pilot
 * retains operating capital (full auto-repair would drain the wallet every fight).
 */
function applyCombatDamageAndRepair(ctx, damageHp, costs, budget, options = {}) {
  const e = playerEntity(ctx);
  const dmg = Math.max(0, Number(damageHp) || 0);
  if (e && e.hullMax > 0) {
    e.hull = Math.max(0, (e.hull ?? e.hullMax) - dmg);
    ctx.hullDamageHp = Math.max(0, e.hullMax - e.hull);
  } else {
    ctx.hullDamageHp = (ctx.hullDamageHp || 0) + dmg;
  }

  const readinessNow = e && e.hullMax > 0
    ? e.hull / e.hullMax
    : Math.max(0, 1 - (ctx.hullDamageHp || 0) / 100);
  const minCredits = options.minCreditsAfter != null ? options.minCreditsAfter : 400;
  const readinessGate = options.readinessGate != null ? options.readinessGate : 0.72;
  const forceRepair = !!options.forceRepair;
  const canAffordOperating = (ctx.state.player.credits | 0) > minCredits;
  const shouldRepair = e && ctx.hullDamageHp > 0.5
    && (forceRepair || (readinessNow < readinessGate && canAffordOperating));

  // Dock-side repair attempt through live economy handleService when entity exists.
  // Production service may partial-repair up to wallet; we only call it when the pilot still
  // has operating capital above minCreditsAfter so repair cannot zero the career.
  if (shouldRepair) {
    const beforeHull = e.hull;
    const beforeCredits = ctx.state.player.credits | 0;
    ctx.bus.emit('ui:service', { type: 'repair' });
    const afterCredits = ctx.state.player.credits | 0;
    // If the service drained below reserve, that is still a legal production charge — record it.
    const spent = Math.max(0, beforeCredits - afterCredits);
    if (spent > 0) costs.repairCost += spent;
    ctx.hullDamageHp = Math.max(0, (e.hullMax || 0) - (e.hull || 0));
    advanceTime(ctx, 6, budget, 'dockS');
    return {
      damageHp: dmg,
      repairedHp: Math.max(0, (e.hull || 0) - beforeHull),
      remainingHp: ctx.hullDamageHp,
      spent,
      readiness: e.hullMax > 0 ? round2(e.hull / e.hullMax) : 1,
    };
  }
  return {
    damageHp: dmg,
    repairedHp: 0,
    remainingHp: ctx.hullDamageHp,
    spent: 0,
    readiness: e && e.hullMax > 0 ? round2(e.hull / e.hullMax) : Math.max(0, 1 - ctx.hullDamageHp / 100),
  };
}

function tryBuyShipLive(ctx, defId, receipt, costs) {
  const def = SHIP_BY_ID.get(defId);
  if (!def) return false;
  const creditsBefore = ctx.state.player.credits | 0;
  const ok = ctx.ships.buyShip({ defId, setActive: true });
  if (!ok) return false;
  const creditsAfter = ctx.state.player.credits | 0;
  const price = def.price || 0;
  receipt.purchaseSpend = (receipt.purchaseSpend || 0) + (creditsBefore - creditsAfter);
  receipt.equipment = receipt.equipment || {};
  receipt.equipment.purchases = receipt.equipment.purchases || [];
  receipt.equipment.purchases.push({
    kind: 'ship', id: defId, price, reason: `buyShip:${defId}`,
    atS: round1(ctx.state.simTime), creditsBefore, creditsAfter,
    authority: 'ships.buyShip',
  });
  receipt.equipment.upgradeCost = (receipt.equipment.upgradeCost || 0) + price;
  setActiveHull(ctx, defId);
  // Transfer owned modules list for tracking; fittings on new hull start empty from buyShip.
  return true;
}

function tryUnlockTechLive(ctx, nodeId, receipt, costs) {
  const node = TECH_BY_ID.get(nodeId);
  if (!node) return false;
  const creditsBefore = ctx.state.player.credits | 0;
  const ok = ctx.ships.unlockTech(nodeId);
  if (!ok) return false;
  const spent = creditsBefore - (ctx.state.player.credits | 0);
  costs.researchSpend += spent;
  receipt.purchaseSpend = (receipt.purchaseSpend || 0) + spent;
  receipt.researchUnlocks = receipt.researchUnlocks || [];
  receipt.researchUnlocks.push({
    techId: nodeId, atS: round1(ctx.state.simTime), credits: spent,
    rp: node.cost && node.cost.rp || 0, authority: 'ships.unlockTech',
  });
  return true;
}

function ownedWeaponIds(ctx) {
  // Prefer fittings + tracked inventory of purchased weapons.
  const fromFit = activeFittings(ctx).filter((id) => id && WEAPON_BY_ID.has(id));
  const set = new Set([...ctx.ownedWeapons, ...fromFit]);
  return set;
}

function pickOwnedWeapon(ctx, preferredIds) {
  const owned = ownedWeaponIds(ctx);
  for (const id of preferredIds) {
    if (owned.has(id) && WEAPON_BY_ID.has(id)) return WEAPON_BY_ID.get(id);
  }
  // Fall back to any owned weapon.
  for (const id of owned) {
    if (WEAPON_BY_ID.has(id)) return WEAPON_BY_ID.get(id);
  }
  return WEAPON_BY_ID.get('wpn_pulse_laser_s') || null;
}

function finalizeReceipt(receipt, ctx, costs, budget, horizonS) {
  const shipId = ctx.currentShipId || NEW_GAME.shipId;
  const ship = SHIP_BY_ID.get(shipId);
  const endingCapital = ctx.state.player.credits | 0;
  const assetPurchases = Math.max(0, Number(receipt.equipment && receipt.equipment.upgradeCost) || 0);
  const netCredits = endingCapital - receipt.startingCapital;
  const earnedValue = netCredits + assetPurchases + (costs.researchSpend || 0);
  const windowMin = Math.max(horizonS, 1) / 60;
  const elapsedS = round1(ctx.state.simTime);
  const cargoValue = cargoMarketValue(ctx, 'station_helios');
  const equity = shipEquity(shipId);
  Object.assign(receipt, {
    endingCapital,
    netCredits,
    earnedValue,
    netWorth: endingCapital + equity + cargoValue,
    cargoValue,
    shipEquity: equity,
    assetPurchases,
    cashCreditsPerMin: round2(netCredits / windowMin),
    creditsPerMin: round2(earnedValue / windowMin),
    creditsPerMinActive: round2(earnedValue / Math.max(elapsedS / 60, 1 / 60)),
    ownedInventoryEnd: { ...ctx.state.player.cargo.items },
    elapsedS,
    shipId,
    shipName: ship && ship.name,
    cargoCapacity: ship && ship.cargo,
    researchPoints: ctx.state.player.researchPoints || 0,
    researchedNodes: (ctx.state.player.researchedNodes || []).slice(),
    ownedWeapons: [...ownedWeaponIds(ctx)],
    hullDamageHp: round1(ctx.hullDamageHp || 0),
    readiness: (() => {
      const e = playerEntity(ctx);
      return e && e.hullMax > 0 ? round2(e.hull / e.hullMax) : 1;
    })(),
    tollCost: costs.tollCost,
    repairCost: costs.repairCost,
    ammoCost: costs.ammoCost,
    missionCost: costs.missionCost,
    insuranceCost: costs.insuranceCost,
    researchSpend: costs.researchSpend,
    refineryCost: costs.refineryCost,
    time: {
      simS: round1(budget.simS),
      travelS: round1(budget.travelS),
      actionS: round1(budget.actionS),
      dockS: round1(budget.dockS),
      recoveryS: round1(budget.recoveryS),
      idleS: round1(budget.idleS),
    },
    // Independent-horizon integrity: time and rate are for THIS run only.
    horizonS,
    horizonMin: horizonS / 60,
  });
  return receipt;
}

export function assessLoadoutViability(career, phase = 'starter') {
  const kit = ORIGIN_ROLE_KITS[career];
  if (!kit) return { viable: false };
  const starter = phase === 'starter';
  let plan;
  if (career === 'hauler') {
    plan = {
      shipId: starter ? NEW_GAME.shipId : HAULER_ROLE_HULL_DEF_ID,
      required: starter
        ? [...NEW_GAME.fittedModules, kit.defId]
        : ['wpn_pulse_laser_s', 'mod_engine_ion_m', 'mod_shield_booster_s', kit.defId],
      minCargo: starter ? 40 : 120,
    };
  } else if (career === 'hunter') {
    plan = {
      shipId: starter ? NEW_GAME.shipId : HUNTER_ROLE_HULL_DEF_ID,
      required: starter
        ? [...NEW_GAME.fittedModules, kit.defId]
        : ['wpn_pulse_laser_s', 'wpn_autocannon_s', 'mod_engine_ion_m', 'mod_shield_booster_s', kit.defId],
      minCargo: starter ? 40 : 10,
    };
  } else {
    plan = {
      shipId: starter ? NEW_GAME.shipId : PROSPECTOR_ROLE_HULL_DEF_ID,
      required: starter
        ? [...NEW_GAME.fittedModules, kit.defId]
        : ['wpn_pulse_laser_s', 'mod_mining_laser_s', 'mod_engine_ion_m', 'mod_shield_booster_s', kit.defId],
      minCargo: starter ? 40 : 55,
    };
  }
  const ship = SHIP_BY_ID.get(plan.shipId);
  if (!ship) return { viable: false };
  const fittings = fittingsFromDefaultModules(plan.shipId, plan.required);
  const fittedIds = fittings.filter(Boolean);
  const slots = buildSlotList(ship);
  const kitDef = MODULE_BY_ID.get(kit.defId);
  const missing = plan.required.filter((id) => !fittedIds.includes(id));
  const derived = getDerivedStats(plan.shipId, fittings, {
    cargo: { usedMass: career === 'hauler' ? Math.min(ship.cargo, plan.minCargo) : 0 },
    efficiencyMods: {},
  });
  const utilityFit = slots.some((slot) => slot.type === 'utility' && fits(slot, kitDef))
    && fittedIds.includes(kit.defId);
  return {
    viable: missing.length === 0 && utilityFit && derived.cargoCap >= plan.minCargo
      && derived.operationalMass > 0 && derived.maxSpeed > 0,
    career, phase, shipId: plan.shipId, required: plan.required, fittedIds, missing,
    roleKitId: kit.defId, utilityFit, cargoCap: derived.cargoCap,
  };
}

// ---- HAULER (live trade) ----------------------------------------------------
function runHauler(horizonS, options = {}) {
  const seed = options.seed != null ? options.seed : SEED_BY_CAREER.hauler;
  const ctx = bootSim(seed);
  const costs = emptyCosts();
  const budget = emptyBudget();
  const kit = ORIGIN_ROLE_KITS.hauler;
  if (kit) ctx.ownedModules.add(kit.defId);

  const midShip = SHIP_BY_ID.get(HAULER_ROLE_HULL_DEF_ID);
  const receipt = {
    career: 'hauler', seed, horizonS,
    startingCapital: NEW_GAME.credits,
    purchaseSpend: 0, saleProceeds: 0, missionProceeds: 0,
    completedLoops: 0, completedContracts: 0, failedContracts: 0,
    equipment: {
      activePhase: 'starter',
      roleHullDefId: HAULER_ROLE_HULL_DEF_ID,
      purchases: [],
    },
    liveSeams: [
      'economy.ensureMarket/quote/execute',
      'cargo add/remove via execute',
      'ships.buyShip',
      'factions via economy:tradeCompleted',
      'economy.update time authority + market restock',
      'missions.ensureBoard/acceptMission bulk_trade settle via tradeCompleted',
    ],
    loops: [], routeHistory: [], bottlenecks: [], adaptersUsed: [], defects: [],
    authorityReceipts: [],
  };

  const buyStationId = 'station_beltout';
  const sellStationIds = Object.freeze([
    'station_ceres', 'station_helios', 'station_forge', 'station_coalition',
    'station_tethys', 'station_customs',
  ]);
  const buySector = STATION_TO_SECTOR.get(buyStationId);
  ctx.econ.ensureMarket(buyStationId);
  for (const stationId of sellStationIds) ctx.econ.ensureMarket(stationId);

  const retiredUntil = new Map();
  const selectRoute = () => {
    let best = null;
    for (const c of COMMODITIES) {
      if (c.legality !== 'legal' || c.basePrice > EARLY_CMDTY_MAX_BASE) continue;
      const buyEntry = ctx.state.economy.markets[buyStationId]?.[c.id];
      if (!buyEntry || buyEntry.role !== 'produce') continue;
      const qb = ctx.econ.quote(buyStationId, c.id, 'buy', 1);
      if (!qb.ok) continue;
      for (const sellStationId of sellStationIds) {
        const laneKey = `${c.id}|${sellStationId}`;
        if ((retiredUntil.get(laneKey) || 0) > (ctx.state.simTime || 0)) continue;
        const sellEntry = ctx.state.economy.markets[sellStationId]?.[c.id];
        if (!sellEntry || sellEntry.role !== 'consume') continue;
        const sellSector = STATION_TO_SECTOR.get(sellStationId);
        if (!sellSector) continue;
        const sellToll = routeTollAmount(seed, buySector.id, sellSector.id, 0);
        const returnToll = routeTollAmount(seed, sellSector.id, buySector.id, 0);
        const cycleToll = sellToll + returnToll;
        const vol = c.volPerU > 0 ? c.volPerU : 1;
        const cap = SHIP_BY_ID.get(ctx.currentShipId)?.cargo || NEW_GAME.cargoCap || 40;
        let qty = Math.floor(cap / vol);
        while (qty > 0) {
          const buyLot = ctx.econ.quote(buyStationId, c.id, 'buy', qty);
          if (buyLot.ok && buyLot.total + sellToll <= (ctx.state.player.credits | 0)) break;
          qty = Math.floor(qty * 0.8);
        }
        if (qty <= 0) continue;
        const buyLot = ctx.econ.quote(buyStationId, c.id, 'buy', qty);
        const sellLot = ctx.econ.quote(sellStationId, c.id, 'sell', qty);
        if (!buyLot.ok || !sellLot.ok) continue;
        const projectedProfit = sellLot.total - buyLot.total - cycleToll;
        if (!(projectedProfit > 0)) continue;
        const margin = sellLot.unitAvg - buyLot.unitAvg;
        const legS = stationTravelTimeS(buyStationId, sellStationId) + DOCK_OVERHEAD_S;
        const score = projectedProfit / Math.max(legS, 1);
        if (!best || score > best.score) {
          best = {
            cmdtyId: c.id, name: c.name, margin, buy: buyLot.unitAvg, sell: sellLot.unitAvg,
            vol: c.volPerU, sellStationId, sellToll, cycleToll, projectedProfit, score,
          };
        }
      }
    }
    return best;
  };

  let best = selectRoute();
  if (!best) {
    receipt.defects.push('no_positive_early_career_route');
    finalizeReceipt(receipt, ctx, costs, budget, horizonS);
    receipt.loadoutViability = assessLoadoutViability('hauler', 'starter');
    return receipt;
  }
  receipt.route = {
    buyStationId, sellStationId: best.sellStationId, commodityId: best.cmdtyId,
    initialMargin: round2(best.margin),
  };
  receipt.routeHistory.push({ ...receipt.route, startedAtS: 0 });

  let t = 0;
  let loops = 0;
  let upgraded = false;
  let cargoCreated = 0;
  let cargoDestroyed = 0;
  let currentSectorId = NEW_GAME.startingSectorId;
  let currentStationId = null;
  let activeBulk = null;

  while (t < horizonS) {
    // Production bulk_trade contracts from the live mission board (not ladder bonded adapters).
    if (!activeBulk && loops > 0 && loops % 6 === 0 && ctx.missions) {
      const hit = findBoardOffer(ctx, 'bulk_trade', [buyStationId, ...sellStationIds]);
      if (hit && (hit.offer.collateral_cr || 0) <= (ctx.state.player.credits | 0)) {
        const inst = acceptBoardOffer(ctx, hit.offer.id, costs, receipt);
        if (inst && inst.type === 'bulk_trade') {
          activeBulk = inst;
          receipt.authorityReceipts.push({
            kind: 'mission_accept', type: 'bulk_trade', id: inst.id,
            reward_cr: inst.reward_cr, atS: round1(ctx.state.simTime),
            authority: 'missions.acceptMission',
          });
        }
      }
    }

    const leg1S = (currentStationId
      ? stationTravelTimeS(currentStationId, buyStationId)
      : travelTimeS(currentSectorId, buySector.id)) + DOCK_OVERHEAD_S;
    if (t + leg1S > horizonS) break;
    const move1 = tryTravel(ctx, {
      fromSectorId: currentSectorId,
      toSectorId: buySector.id,
      travelS: leg1S,
      reason: `gate_toll:hauler:${loops}:to_buy`,
      seed, costs, budget,
    });
    if (!move1.ok) {
      markBottleneck(receipt, 'unaffordable_toll', `Buy-leg denied need=${move1.need} have=${move1.have}`);
      // Idle/recover credits? Without income we stop.
      break;
    }
    t = ctx.state.simTime;
    currentSectorId = buySector.id;
    currentStationId = buyStationId;

    const liveBuy = ctx.econ.quote(buyStationId, best.cmdtyId, 'buy', 1);
    const liveSell = ctx.econ.quote(best.sellStationId, best.cmdtyId, 'sell', 1);
    const liveMargin = liveBuy.ok && liveSell.ok ? liveSell.unitAvg - liveBuy.unitAvg : -Infinity;
    if (!(liveMargin > 0)) {
      retiredUntil.set(`${best.cmdtyId}|${best.sellStationId}`, t + HAULER_ROUTE_RECOVERY_S);
      markBottleneck(receipt, 'spread_collapse', `Route ${best.cmdtyId}→${best.sellStationId} collapsed`);
      let next = selectRoute();
      if (!next) {
        markBottleneck(receipt, 'market_exhaustion', 'All early routes cooling while live stock recovers');
        while (!next && t < horizonS) {
          const waits = [...retiredUntil.values()].filter((until) => until > t);
          const until = waits.length ? Math.min(...waits) : t + 60;
          const waitS = Math.min(horizonS - t, Math.max(30, until - t));
          if (!(waitS > 0)) break;
          advanceTime(ctx, waitS, budget, 'idleS');
          t = ctx.state.simTime;
          next = selectRoute();
        }
        if (!next) break;
      }
      receipt.routeHistory.push({
        buyStationId, sellStationId: next.sellStationId,
        commodityId: next.cmdtyId, initialMargin: round2(next.margin),
        startedAtS: round1(t), retiredCommodityId: best.cmdtyId,
        retiredSellStationId: best.sellStationId,
      });
      best = next;
    }

    const ship = SHIP_BY_ID.get(ctx.currentShipId) || SHIP_BY_ID.get(NEW_GAME.shipId);
    ctx.state.player.cargo.capVolume = ship.cargo;
    const freeVol = ctx.state.player.cargo.capVolume - ctx.state.player.cargo.usedVolume;
    const volPer = best.vol > 0 ? best.vol : 1;
    let want = Math.floor(freeVol / volPer);
    const entry = ctx.state.economy.markets[buyStationId][best.cmdtyId];
    const stockAvail = Math.max(0, Math.floor((entry && entry.stock) - 1));
    if (stockAvail <= 0) {
      markBottleneck(receipt, 'no_stock', 'Buy station stock exhausted');
      break;
    }
    want = Math.min(want, stockAvail);
    while (want > 0) {
      const q = ctx.econ.quote(buyStationId, best.cmdtyId, 'buy', want);
      if (q.ok && q.total + (best.sellToll || 0) <= (ctx.state.player.credits | 0)) break;
      want = Math.floor(want * 0.85);
    }
    if (want <= 0) {
      markBottleneck(receipt, 'capital_bind', 'Cannot afford next buy lot');
      break;
    }
    const buyRes = ctx.econ.execute(buyStationId, best.cmdtyId, 'buy', want);
    if (!buyRes.ok) {
      receipt.loops.push({ loop: loops, fail: buyRes.reason || 'buy_failed' });
      break;
    }
    cargoCreated += buyRes.qty;
    receipt.purchaseSpend += buyRes.total;
    // Market action advances action time through time authority.
    advanceTime(ctx, 8, budget, 'actionS');
    t = ctx.state.simTime;

    const sellSector = STATION_TO_SECTOR.get(best.sellStationId);
    const leg2S = stationTravelTimeS(buyStationId, best.sellStationId) + DOCK_OVERHEAD_S;
    if (t + leg2S > horizonS) {
      receipt.loops.push({ loop: loops, partial: true, bought: buyRes.qty, note: 'horizon_before_sell' });
      break;
    }
    const move2 = tryTravel(ctx, {
      fromSectorId: currentSectorId,
      toSectorId: sellSector.id,
      travelS: leg2S,
      reason: `gate_toll:hauler:${loops}:to_sell`,
      seed, costs, budget,
    });
    if (!move2.ok) {
      markBottleneck(receipt, 'unaffordable_toll', `Sell-leg denied; cargo stranded`);
      break;
    }
    t = ctx.state.simTime;
    currentSectorId = sellSector.id;
    currentStationId = best.sellStationId;

    const have = ctx.state.player.cargo.items[best.cmdtyId] || 0;
    const creditsBeforeSell = ctx.state.player.credits | 0;
    const missionsDoneBefore = ctx.state.player.stats?.missionsDone || 0;
    const sellRes = ctx.econ.execute(best.sellStationId, best.cmdtyId, 'sell', have);
    if (!sellRes.ok) {
      receipt.loops.push({ loop: loops, fail: sellRes.reason || 'sell_failed' });
      break;
    }
    cargoDestroyed += sellRes.qty;
    receipt.saleProceeds += sellRes.total;
    // bulk_trade missions complete on economy:tradeCompleted when commodity/dest match.
    if (activeBulk && activeBulk.params?.cmdtyId === best.cmdtyId) {
      const missionsDoneAfter = ctx.state.player.stats?.missionsDone || 0;
      const bonus = Math.max(0, (ctx.state.player.credits | 0) - creditsBeforeSell - sellRes.total);
      if (missionsDoneAfter > missionsDoneBefore || bonus > 0) {
        if (bonus > 0) receipt.missionProceeds += bonus;
        receipt.completedContracts += 1;
        receipt.authorityReceipts.push({
          kind: 'mission_complete', type: 'bulk_trade', id: activeBulk.id,
          bonusCr: bonus, atS: round1(ctx.state.simTime),
          authority: 'missions._onTrade→_completeMission→economy:grantCredits',
        });
        activeBulk = null;
      }
    }
    // Dock beat also refreshes boards / delivery objectives through the production path.
    completeDeliveryAtDock(ctx, best.sellStationId);
    advanceTime(ctx, 8, budget, 'actionS');
    t = ctx.state.simTime;
    loops += 1;
    receipt.completedLoops = loops;
    // Arbitrage loops always count as contracts completed when sell succeeds.
    receipt.completedContracts += 1;
    receipt.loops.push({
      loop: loops, t: round1(t), bought: buyRes.qty, sold: sellRes.qty,
      buyTotal: buyRes.total, sellTotal: sellRes.total,
      creditsAfter: ctx.state.player.credits | 0, shipId: ctx.currentShipId,
      stockAfterBuy: round1((ctx.state.economy.markets[buyStationId]?.[best.cmdtyId]?.stock) || 0),
    });

    if (!upgraded && midShip && (ctx.state.player.credits | 0) >= midShip.price + NEW_GAME.credits) {
      if (tryBuyShipLive(ctx, midShip.id, receipt, costs)) {
        upgraded = true;
        receipt.equipment.activePhase = 'mule';
        receipt.equipment.upgradedAtLoop = loops;
      }
    }
  }

  receipt.marketExhaustion = retiredUntil.size > 0;
  receipt.inventoryCreated = cargoCreated;
  receipt.inventoryRemoved = cargoDestroyed;
  receipt.equipment.activePhase = upgraded ? 'mule' : 'starter';
  receipt.equipment.plannedMidLoadout = assessLoadoutViability('hauler', 'mid');
  receipt.loadoutViability = assessLoadoutViability('hauler', upgraded ? 'mid' : 'starter');
  finalizeReceipt(receipt, ctx, costs, budget, horizonS);
  if (options.captureCtx) receipt._ctx = ctx;
  return receipt;
}

// ---- HUNTER -----------------------------------------------------------------
const HUNTER_BOARD_STATIONS = Object.freeze([
  'station_helios', 'station_ceres', 'station_tethys', 'station_coalition', 'station_customs',
]);

function runHunter(horizonS, options = {}) {
  const seed = options.seed != null ? options.seed : SEED_BY_CAREER.hunter;
  const forceDeathAtLoop = options.forceDeathAtLoop != null ? options.forceDeathAtLoop : 6;
  const ctx = bootSim(seed);
  const costs = emptyCosts();
  const budget = emptyBudget();
  const kit = ORIGIN_ROLE_KITS.hunter;
  if (kit) ctx.ownedModules.add(kit.defId);

  const midShip = SHIP_BY_ID.get(HUNTER_ROLE_HULL_DEF_ID);
  const midWpn = WEAPON_BY_ID.get('wpn_autocannon_s');
  const earlyEnemy = ENEMY_TYPES.find((e) => e.id === 'wasp_swarmer');
  const midEnemy = ENEMY_TYPES.find((e) => e.id === 'lancer_sniper');

  const receipt = {
    career: 'hunter', seed, horizonS,
    startingCapital: NEW_GAME.credits,
    purchaseSpend: 0, saleProceeds: 0, missionProceeds: 0,
    completedLoops: 0, completedContracts: 0, failedContracts: 0,
    deaths: 0, failedMissions: 0,
    equipment: {
      activePhase: 'starter',
      roleHullDefId: HUNTER_ROLE_HULL_DEF_ID,
      purchases: [],
    },
    liveSeams: [
      'missions.ensureBoard/acceptMission bounty_hunt',
      'missions entity:killed → _completeMission → economy:grantCredits',
      'missions recon_scan → researchPoints writer',
      'economy ui:service repair (proportional)',
      'ships.unlockTech / buyShip / buyModule',
      'cargo munitions via addCargo/removeCargo + chargeCredits',
    ],
    loops: [], bottlenecks: [], adaptersUsed: [], defects: [], researchUnlocks: [],
    authorityReceipts: [],
  };
  markAdapter(receipt, 'combat_ttk_adapter',
    'Fight duration from enemy EHP / owned weapon DPS; full combat system not stepped');

  const homeSectorId = NEW_GAME.startingSectorId;
  const homeStationId = 'station_helios';
  const huntSectorId = 'sector_ceres_belt';
  const huntSector = SECTOR_BY_ID.get(huntSectorId);

  let t = 0;
  let loops = 0;
  let completedMissions = 0;
  let failedMissions = 0;
  let upgraded = false;
  let techUnlocked = (ctx.state.player.researchedNodes || []).includes('tech_combat_basics');
  let currentSectorId = homeSectorId;
  let deathDone = false;

  function ensureAmmo(units) {
    if (units <= 0) return 0;
    const cost = round(units * SERVICE_PRICES.ammoCrPerUnit);
    if ((ctx.state.player.credits | 0) < cost) return 0;
    const added = addCargo(ctx.state, 'cmdty_munitions', units);
    if (added <= 0) return 0;
    const real = round(added * SERVICE_PRICES.ammoCrPerUnit);
    if ((ctx.state.player.credits | 0) < real) {
      removeCargo(ctx.state, 'cmdty_munitions', added);
      return 0;
    }
    ctx.econ.chargeCredits(real, 'service:ammo');
    costs.ammoCost += real;
    receipt.purchaseSpend += real;
    return added;
  }

  /** Production recon_scan for RP and/or recovery income. Prefer local boards. */
  function tryReconMission(reason = 'recon') {
    const wallet = ctx.state.player.credits | 0;
    const hit = findBoardOffer(ctx, 'recon_scan', HUNTER_BOARD_STATIONS, {
      preferSectorId: currentSectorId,
      fromSectorId: currentSectorId,
      maxCredits: wallet,
      seed,
    });
    if (!hit) return false;
    const boardSec = STATION_TO_SECTOR.get(hit.stationId)?.id || currentSectorId;
    if (boardSec !== currentSectorId) {
      const leg = travelTimeS(currentSectorId, boardSec) + DOCK_OVERHEAD_S;
      if (t + leg > horizonS) return false;
      const move = tryTravel(ctx, {
        fromSectorId: currentSectorId, toSectorId: boardSec, travelS: leg,
        reason: `gate_toll:hunter:${reason}_board:${loops}`, seed, costs, budget,
      });
      if (!move.ok) {
        markBottleneck(receipt, 'unaffordable_toll', `Recon board leg denied need=${move.need}`);
        return false;
      }
      t = ctx.state.simTime;
      currentSectorId = boardSec;
    }
    completeDeliveryAtDock(ctx, hit.stationId);
    const inst = acceptBoardOffer(ctx, hit.offer.id, costs, receipt);
    if (!inst || inst.type !== 'recon_scan') return false;
    const destSec = inst.destSectorId || boardSec;
    if (destSec && destSec !== currentSectorId) {
      const leg = travelTimeS(currentSectorId, destSec) + DOCK_OVERHEAD_S;
      if (t + leg > horizonS) return false;
      const move = tryTravel(ctx, {
        fromSectorId: currentSectorId, toSectorId: destSec, travelS: leg,
        reason: `gate_toll:hunter:${reason}:${loops}`, seed, costs, budget,
      });
      if (!move.ok) {
        markBottleneck(receipt, 'unaffordable_toll', `Recon leg denied need=${move.need}`);
        if (ctx.missions.abandonMission) ctx.missions.abandonMission(inst.id);
        return false;
      }
      t = ctx.state.simTime;
      currentSectorId = destSec;
    }
    advanceTime(ctx, Math.max(12, inst.params?.taskTime || 30) * 0.35, budget, 'actionS');
    t = ctx.state.simTime;
    const res = completeReconViaScan(ctx, inst, receipt);
    if (res.ok) {
      receipt.authorityReceipts.push({
        kind: 'mission_complete', type: 'recon_scan', id: inst.id,
        rp: res.rp, reward: res.reward, atS: round1(t),
        authority: 'missions._onScan→_completeMission (RP writer)',
      });
      completedMissions += 1;
      receipt.completedContracts += 1;
    }
    return res.ok;
  }

  while (t < horizonS) {
    // Earn RP through production recon_scan missions, then unlock tech via ships.unlockTech.
    // Keep a cash reserve so tech spend cannot leave the pilot unable to pay gate tolls.
    const TECH_RESERVE_CR = 2500;
    if (!techUnlocked) {
      const node = TECH_BY_ID.get('tech_combat_basics');
      if (node && (ctx.state.player.researchPoints || 0) < (node.cost.rp || 0)) {
        markBottleneck(receipt, 'rp_gate',
          'Combat Basics needs research points; seeking recon_scan board offers');
        tryReconMission('rp');
        t = ctx.state.simTime;
      }
      if (node && (ctx.state.player.researchPoints || 0) >= (node.cost.rp || 0)
        && (ctx.state.player.credits | 0) >= ((node.cost.credits || 0) + TECH_RESERVE_CR)) {
        if (tryUnlockTechLive(ctx, 'tech_combat_basics', receipt, costs)) {
          techUnlocked = true;
          receipt.equipment.activePhase = 'researched';
          receipt.authorityReceipts.push({
            kind: 'tech_unlock', techId: 'tech_combat_basics',
            atS: round1(ctx.state.simTime), authority: 'ships.unlockTech',
          });
        }
      }
    }

    const preferred = upgraded && midWpn && ownedWeaponIds(ctx).has(midWpn.id)
      ? [midWpn.id, 'wpn_pulse_laser_s']
      : ['wpn_pulse_laser_s'];
    const weapon = pickOwnedWeapon(ctx, preferred);
    const enemy = (upgraded && midEnemy) ? midEnemy : earlyEnemy;
    if (!weapon || !enemy) {
      receipt.defects.push('missing_owned_weapon_or_enemy');
      break;
    }
    if (weapon.id === 'wpn_autocannon_s' && !ownedWeaponIds(ctx).has('wpn_autocannon_s')) {
      receipt.defects.push('used_unowned_autocannon');
      break;
    }

    // Accept a live bounty_hunt from the production board (not MISSION_TUNING formula grant).
    // Prefer local boards and only select offers the wallet can reach (toll + collateral).
    const wallet = ctx.state.player.credits | 0;
    let bountyHit = findBoardOffer(ctx, 'bounty_hunt', HUNTER_BOARD_STATIONS, {
      preferSectorId: currentSectorId,
      fromSectorId: currentSectorId,
      maxCredits: wallet,
      seed,
    });
    if (!bountyHit) {
      // Advance board epoch via time so ensureBoard regenerates slots.
      advanceTime(ctx, (MISSION_TUNING.refreshSec || 600) + 1, budget, 'idleS');
      t = ctx.state.simTime;
      bountyHit = findBoardOffer(ctx, 'bounty_hunt', HUNTER_BOARD_STATIONS, {
        preferSectorId: currentSectorId,
        fromSectorId: currentSectorId,
        maxCredits: ctx.state.player.credits | 0,
        seed,
      });
    }
    if (!bountyHit) {
      markBottleneck(receipt, 'no_bounty_board', 'No affordable bounty_hunt offer on hunter boards');
      // Recovery path: recon missions grant live credits + RP without fabricated income.
      if (tryReconMission('recover')) {
        t = ctx.state.simTime;
        loops += 1;
        continue;
      }
      // Broke and no local contracts: recover at home dock if not already there (no toll if same).
      if (currentSectorId !== homeSectorId) {
        const homeLeg = travelTimeS(currentSectorId, homeSectorId) + DOCK_OVERHEAD_S;
        const homeMove = tryTravel(ctx, {
          fromSectorId: currentSectorId, toSectorId: homeSectorId, travelS: homeLeg,
          reason: `gate_toll:hunter:${loops}:retreat_home`, seed, costs, budget,
        });
        if (homeMove.ok) {
          t = ctx.state.simTime;
          currentSectorId = homeSectorId;
          loops += 1;
          continue;
        }
        markBottleneck(receipt, 'unaffordable_toll', 'Cannot retreat home or accept affordable contracts');
      }
      // Still stuck: idle a beat; stop only if truly broke with no path forward.
      advanceTime(ctx, 60, budget, 'idleS');
      t = ctx.state.simTime;
      if ((ctx.state.player.credits | 0) < 50) {
        markBottleneck(receipt, 'capital_bind', 'Hunter broke after death/tolls; no free income');
        break;
      }
      loops += 1;
      continue;
    }

    // A player can only accept a board offer at that board. The old cohort selected a remote
    // station's rich offer and accepted it in place, eliminating the travel/toll/time that makes
    // the Hunter route honest and producing one held-out income spike.
    const boardStation = bountyHit.stationId;
    const boardSectorId = STATION_TO_SECTOR.get(boardStation)?.id || currentSectorId;
    if (boardSectorId !== currentSectorId) {
      const legBoard = travelTimeS(currentSectorId, boardSectorId) + DOCK_OVERHEAD_S;
      if (t + legBoard > horizonS) break;
      const moveBoard = tryTravel(ctx, {
        fromSectorId: currentSectorId,
        toSectorId: boardSectorId,
        travelS: legBoard,
        reason: `gate_toll:hunter:${loops}:to_board`,
        seed, costs, budget,
      });
      if (!moveBoard.ok) {
        markBottleneck(receipt, 'unaffordable_toll', `Bounty board leg denied need=${moveBoard.need}`);
        advanceTime(ctx, 45, budget, 'idleS');
        t = ctx.state.simTime;
        loops += 1;
        continue;
      }
      t = ctx.state.simTime;
      currentSectorId = boardSectorId;
    }
    completeDeliveryAtDock(ctx, boardStation);

    const mission = acceptBoardOffer(ctx, bountyHit.offer.id, costs, receipt);
    if (!mission || mission.type !== 'bounty_hunt') {
      markBottleneck(receipt, 'bounty_accept_failed', bountyHit.offer.id);
      // Push time so we don't spin forever on a stuck board slot.
      advanceTime(ctx, 30, budget, 'idleS');
      t = ctx.state.simTime;
      loops += 1;
      continue;
    }
    receipt.authorityReceipts.push({
      kind: 'mission_accept', type: 'bounty_hunt', id: mission.id,
      reward_cr: mission.reward_cr, atS: round1(ctx.state.simTime),
      authority: 'missions.acceptMission',
    });

    const destSectorId = mission.destSectorId || huntSectorId;
    const legOut = travelTimeS(currentSectorId, destSectorId) + COMBAT_APPROACH_S;
    if (t + legOut > horizonS) break;
    const moveOut = tryTravel(ctx, {
      fromSectorId: currentSectorId, toSectorId: destSectorId, travelS: legOut,
      reason: `gate_toll:hunter:${loops}:out`, seed, costs, budget,
    });
    if (!moveOut.ok) {
      markBottleneck(receipt, 'unaffordable_toll', `Hunt outbound denied need=${moveOut.need}`);
      if (ctx.missions.abandonMission) ctx.missions.abandonMission(mission.id);
      receipt.failedContracts += 1;
      failedMissions += 1;
      advanceTime(ctx, 45, budget, 'idleS');
      t = ctx.state.simTime;
      loops += 1;
      continue;
    }
    t = ctx.state.simTime;
    currentSectorId = destSectorId;

    const [levelLo, levelHi] = huntSector?.enemyLevel || [1, 1];
    const enemyLevel = Math.round((levelLo + levelHi) / 2);
    const enemySpec = makeEnemySpawnSpec(enemy.id, enemyLevel, { x: 0, z: 0 });
    const ehp = (enemySpec.hull || 0) + (enemySpec.armorHp || 0) + (enemySpec.shield || 0);
    const e = playerEntity(ctx);
    const readiness = e && e.hullMax > 0
      ? Math.max(0.25, e.hull / e.hullMax)
      : Math.max(0.25, 1 - (ctx.hullDamageHp || 0) / 200);
    const dps = (weapon.dps || 1) * readiness;
    const fightS = Math.max(8, ehp / Math.max(dps, 0.1));
    const enemyDps = (enemySpec.data?.weapons || []).reduce((sum, w) => {
      const dmg = Number(w.dmg) || 0;
      const rof = Number(w.rof) || 0;
      if (rof === 0) return sum + (Number(w.dps) || dmg);
      return sum + dmg * rof;
    }, 0);

    // Controlled death recovery once (insurance via economy.chargeCredits; no full heal).
    // Use >= so accept-fail skips cannot jump past the forced death loop index.
    if (!deathDone && forceDeathAtLoop > 0 && (loops + 1) >= forceDeathAtLoop) {
      deathDone = true;
      receipt.deaths = 1;
      const e2 = playerEntity(ctx);
      if (e2) e2.hull = 0;
      ctx.hullDamageHp = e2 ? e2.hullMax : 100;
      const munis = ctx.state.player.cargo.items.cmdty_munitions || 0;
      if (munis > 0) removeCargo(ctx.state, 'cmdty_munitions', munis);
      // Proportional insurance via economy.chargeCredits. Leave a small working-capital floor so
      // the pilot can still reach a local board (not free repair — residual hull stays damaged).
      const creditsNow = ctx.state.player.credits | 0;
      const rawIns = round(shipEquity(ctx.currentShipId) * 0.35) || 500;
      // Floor covers one early-career dest toll (~200) so recovery bounties remain reachable.
      const workingFloor = Math.min(320, Math.max(0, creditsNow));
      const insurance = Math.min(rawIns, Math.max(0, creditsNow - workingFloor));
      if (insurance > 0) {
        ctx.econ.chargeCredits(insurance, 'service:insurance_recovery');
        costs.insuranceCost += insurance;
      }
      if (e2 && e2.hullMax) {
        e2.hull = e2.hullMax * 0.35;
        ctx.hullDamageHp = e2.hullMax - e2.hull;
      }
      if (ctx.missions.abandonMission) ctx.missions.abandonMission(mission.id);
      advanceTime(ctx, DEATH_DOWNTIME_S, budget, 'recoveryS');
      t = ctx.state.simTime;
      currentSectorId = homeSectorId;
      ctx.state.world.currentSectorId = homeSectorId;
      receipt.failedContracts += 1;
      failedMissions += 1;
      receipt.loops.push({
        loop: loops + 1, t: round1(t), outcome: 'death_recovery',
        insurance, readiness: e2 && e2.hullMax ? round2(e2.hull / e2.hullMax) : 0.35,
        creditsAfter: ctx.state.player.credits | 0,
      });
      markBottleneck(receipt, 'death_recovery', 'Controlled death with insurance downtime; residual hull damage');
      loops += 1;
      continue;
    }

    if (weapon.damageType === 'kinetic' || weapon.damageType === 'explosive') {
      const shots = Math.ceil(fightS * (weapon.rof || 1));
      let have = ctx.state.player.cargo.items.cmdty_munitions || 0;
      if (have < shots) ensureAmmo(Math.max(8, shots - have));
      have = ctx.state.player.cargo.items.cmdty_munitions || 0;
      const use = Math.min(shots, have);
      if (use > 0) removeCargo(ctx.state, 'cmdty_munitions', use);
      if (use < shots * 0.5 && upgraded) {
        markBottleneck(receipt, 'ammo_starvation', 'Insufficient munitions for kinetic fight');
      }
    }

    advanceTime(ctx, fightS, budget, 'actionS');
    t = ctx.state.simTime;

    const damageTaken = enemyDps * fightS * REPAIR_FRAC_OF_DAMAGE;
    const repairInfo = applyCombatDamageAndRepair(ctx, damageTaken, costs, budget, {
      minCreditsAfter: 600,
      readinessGate: 0.65,
    });
    t = ctx.state.simTime;

    const missionSucceeded = (hash32(seed, 'hunter_counterplay', loops + 1) % 7) !== 0;
    const readinessFail = repairInfo.readiness < 0.5
      && (hash32(seed, 'readiness_fail', loops + 1) % 3) === 0;
    const success = missionSucceeded && !readinessFail;
    let reward = 0;
    if (success) {
      const res = completeBountyViaKill(ctx, mission, costs, receipt);
      reward = res.reward;
      if (res.ok) {
        completedMissions += 1;
        receipt.completedContracts += 1;
        receipt.authorityReceipts.push({
          kind: 'mission_complete', type: 'bounty_hunt', id: mission.id,
          reward, atS: round1(t),
          authority: 'missions._onKill→_completeMission→economy:grantCredits',
        });
      } else {
        failedMissions += 1;
        receipt.failedContracts += 1;
      }
    } else {
      if (ctx.missions.abandonMission) ctx.missions.abandonMission(mission.id);
      failedMissions += 1;
      receipt.failedContracts += 1;
    }

    const legHome = travelTimeS(currentSectorId, homeSectorId) + DOCK_OVERHEAD_S;
    if (t + legHome > horizonS) {
      loops += 1;
      receipt.completedLoops = completedMissions;
      receipt.loops.push({
        loop: loops, t: round1(t), outcome: success ? 'completed' : 'countered',
        reward: success ? reward : 0, partialReturn: true,
        weaponId: weapon.id, readiness: repairInfo.readiness,
        remainingDamage: repairInfo.remainingHp,
        creditsAfter: ctx.state.player.credits | 0,
        missionId: mission.id,
      });
      break;
    }
    const moveHome = tryTravel(ctx, {
      fromSectorId: currentSectorId, toSectorId: homeSectorId, travelS: legHome,
      reason: `gate_toll:hunter:${loops}:home`, seed, costs, budget,
    });
    if (!moveHome.ok) {
      markBottleneck(receipt, 'unaffordable_toll', 'Home leg denied');
      // Stay in field sector; next loop will re-board from here if possible.
      loops += 1;
      receipt.completedLoops = completedMissions;
      receipt.loops.push({
        loop: loops, t: round1(t), outcome: success ? 'completed_stranded' : 'countered_stranded',
        reward: success ? reward : 0, creditsAfter: ctx.state.player.credits | 0,
        missionId: mission.id,
      });
      advanceTime(ctx, 30, budget, 'idleS');
      t = ctx.state.simTime;
      continue;
    }
    t = ctx.state.simTime;
    currentSectorId = homeSectorId;
    completeDeliveryAtDock(ctx, homeStationId);

    loops += 1;
    receipt.completedLoops = completedMissions;
    receipt.loops.push({
      loop: loops, t: round1(t),
      outcome: success ? 'completed' : 'countered',
      reward: success ? reward : 0,
      fightS: round1(fightS), weaponId: weapon.id, enemyId: enemy.id,
      readiness: repairInfo.readiness, remainingDamage: round1(repairInfo.remainingHp),
      repairSpent: repairInfo.spent,
      creditsAfter: ctx.state.player.credits | 0,
      missionId: mission.id,
    });

    if (!upgraded && techUnlocked && midShip) {
      if ((ctx.state.player.credits | 0) >= midShip.price) {
        if (tryBuyShipLive(ctx, midShip.id, receipt, costs)) {
          upgraded = true;
          receipt.equipment.activePhase = 'wasp';
          receipt.equipment.upgradedAtLoop = loops;
          if (midWpn && (ctx.state.player.credits | 0) >= (midWpn.price || 0)
            && ctx.ships.isUnlocked(midWpn)) {
            const before = ctx.state.player.credits | 0;
            if (ctx.ships.buyModule({ defId: midWpn.id })) {
              ctx.ownedWeapons.add(midWpn.id);
              const spent = before - (ctx.state.player.credits | 0);
              receipt.purchaseSpend += spent;
              receipt.equipment.purchases.push({
                kind: 'weapon', id: midWpn.id, price: midWpn.price,
                reason: 'buyModule:wpn_autocannon_s', atS: round1(t),
                authority: 'ships.buyModule',
              });
              ensureAmmo(40);
            }
          }
        }
      } else {
        markBottleneck(receipt, 'capital_for_wasp', `Need ${midShip.price}cr for Wasp`);
      }
    } else if (!techUnlocked) {
      receipt.equipment.upgradeBlockedBy = {
        kind: 'research',
        gates: [{ techId: 'tech_combat_basics', ...((TECH_BY_ID.get('tech_combat_basics') || {}).cost || {}) }],
        availableResearchPoints: ctx.state.player.researchPoints || 0,
      };
    }
  }

  receipt.failedMissions = failedMissions;
  receipt.missionAttempts = loops;
  receipt.equipment.activePhase = upgraded ? 'wasp' : techUnlocked ? 'researched' : 'starter';
  receipt.equipment.plannedMidLoadout = assessLoadoutViability('hunter', 'mid');
  receipt.loadoutViability = assessLoadoutViability('hunter', upgraded ? 'mid' : 'starter');
  finalizeReceipt(receipt, ctx, costs, budget, horizonS);
  if (options.captureCtx) receipt._ctx = ctx;
  return receipt;
}

// ---- PROSPECTOR -------------------------------------------------------------
function runProspector(horizonS, options = {}) {
  const seed = options.seed != null ? options.seed : SEED_BY_CAREER.prospector;
  const ctx = bootSim(seed);
  const costs = emptyCosts();
  const budget = emptyBudget();
  const kit = ORIGIN_ROLE_KITS.prospector;
  if (kit) ctx.ownedModules.add(kit.defId);

  const midShip = SHIP_BY_ID.get(PROSPECTOR_ROLE_HULL_DEF_ID);
  const starterBeam = MODULE_BY_ID.get('mod_mining_laser_s') || BEAMS.find((b) => b.id === 'beam_mk1');
  const midBeam = MODULE_BY_ID.get('mod_mining_beam_m');
  const fieldIds = ['f_helios_starter', 'f_helios_outer'];
  let fieldIndex = 0;
  let fieldId = fieldIds[fieldIndex];
  const fieldSectorId = 'sector_helios_prime';
  const sellStationId = 'station_helios';
  const ast = ASTEROIDS.find((a) => a.id === 'ast_common_rock');

  const receipt = {
    career: 'prospector', seed, horizonS,
    startingCapital: NEW_GAME.credits,
    purchaseSpend: 0, saleProceeds: 0, missionProceeds: 0,
    completedLoops: 0, completedContracts: 0, failedContracts: 0,
    equipment: {
      activePhase: 'starter',
      roleHullDefId: PROSPECTOR_ROLE_HULL_DEF_ID,
      currentShipId: NEW_GAME.shipId,
      ownedMiningModules: starterBeam ? [starterBeam.id] : [],
      purchases: [],
      beamM: {
        id: midBeam && midBeam.id,
        price: midBeam && midBeam.price || 0,
        researchGates: midBeam && midBeam.requiresTech
          ? [{ techId: midBeam.requiresTech }]
          : [],
        acquired: false,
        granted: false,
      },
    },
    liveSeams: [
      'fieldDepletion.recordFieldExtraction + fieldDepletion.update recovery',
      'cargo addCargo/removeCargo',
      'economy.execute sell + market restock via economy.update',
      'ships.buyShip pelican',
      'economy.update time authority',
      'save.serializeData/_restore mid-run (cohort proof)',
    ],
    loops: [], fieldRotations: [], bottlenecks: [], adaptersUsed: [], defects: [],
    authorityReceipts: [],
  };
  markAdapter(receipt, 'mine_ttk_adapter',
    'Mine duration from beam.dps / asteroid.hp tables; mining system update loop not stepped');

  ctx.econ.ensureMarket(sellStationId);
  ctx.state.world.currentSectorId = fieldSectorId;

  const rng = mulberry32(hash32(seed, 'prospector', fieldId));
  const hpLo = ast.hp[0];
  const hpHi = ast.hp[1];
  const yLo = ast.yieldU[0];
  const yHi = ast.yieldU[1];

  let t = 0;
  let loops = 0;
  let upgraded = false;
  let cargoCreated = 0;
  let cargoDestroyed = 0;
  let asteroidsMined = 0;
  let currentSectorId = fieldSectorId;
  let marketExhaustion = false;

  let primaryOre = 'cmdty_silicate';
  let bestW = -1;
  for (const oreId of Object.keys(ast.oreTable || {})) {
    const w = ast.oreTable[oreId];
    if (w > bestW) { bestW = w; primaryOre = oreId; }
  }

  // Owned mining module only.
  const ownedMining = () => {
    const ids = receipt.equipment.ownedMiningModules || [];
    for (const id of ids) {
      const def = MODULE_BY_ID.get(id);
      if (def) return def;
    }
    return starterBeam;
  };

  while (t < horizonS) {
    const opening = fieldMemoryReadout(ctx.state, fieldId);
    if (opening.band === 'depleted') {
      marketExhaustion = true;
      markBottleneck(receipt, 'field_depleted', `Field ${fieldId} depleted`);
      const nextIdx = (fieldIndex + 1) % fieldIds.length;
      const nextId = fieldIds[nextIdx];
      const rotationS = MINING_TRANSIT_S * 2;
      const nextReadout = fieldMemoryReadout(ctx.state, nextId);
      if (nextId === fieldId || nextReadout.band === 'depleted' || t + rotationS > horizonS) {
        receipt.loops.push({ loop: loops, fail: 'all_local_fields_depleted', t: round1(t) });
        break;
      }
      advanceTime(ctx, rotationS, budget, 'travelS');
      t = ctx.state.simTime;
      fieldIndex = nextIdx;
      fieldId = nextId;
      receipt.fieldRotations.push({ from: opening.fieldId, to: fieldId, atS: round1(t) });
    }

    const beam = ownedMining();
    const ship = SHIP_BY_ID.get(ctx.currentShipId);
    ctx.state.player.cargo.capVolume = ship.cargo;
    const dps = beam.dps || 18;

    const rockHp = hpLo + (hpHi - hpLo) * rng();
    const rockYield = yLo + (yHi - yLo) * rng();
    const readout = fieldMemoryReadout(ctx.state, fieldId);
    const richness = readout.richnessMult != null ? readout.richnessMult : 1;
    const yieldU = Math.max(1, Math.floor(rockYield * richness));
    const mineS = rockHp / dps;
    const cycleMineS = mineS + MINING_TRANSIT_S * 0.35;
    if (t + cycleMineS > horizonS) break;

    advanceTime(ctx, cycleMineS, budget, 'actionS');
    // Split accounting: mining is action; intra-field hop portion already in cycleMineS — travel portion:
    budget.travelS += MINING_TRANSIT_S * 0.35;
    budget.actionS -= MINING_TRANSIT_S * 0.35;
    t = ctx.state.simTime;

    recordFieldExtraction(ctx.state, {
      fieldId, sectorId: fieldSectorId, extractedU: yieldU,
      simTime: ctx.state.simTime, asteroidId: `${fieldId}:ast_${asteroidsMined}`, tick: asteroidsMined,
    });
    asteroidsMined += 1;
    const added = addCargo(ctx.state, primaryOre, yieldU);
    cargoCreated += added;
    // Notify missions mining_quota observers through the production mining:yield event.
    if (added > 0) {
      ctx.bus.emit('mining:yield', {
        commodityId: primaryOre, qty: added, minerId: ctx.state.playerId,
        fieldId, pos: { x: 0, z: 0 },
      });
    }

    const free = ctx.state.player.cargo.capVolume - ctx.state.player.cargo.usedVolume;
    const timeToSell = free < 1 || ctx.state.player.cargo.usedVolume >= ship.cargo * 0.85;
    if (!timeToSell) continue;

    const sellSec = STATION_TO_SECTOR.get(sellStationId);
    const legSell = travelTimeS(currentSectorId, sellSec.id) + DOCK_OVERHEAD_S;
    if (t + legSell > horizonS) {
      receipt.loops.push({ loop: loops, fail: 'horizon_before_sell' });
      break;
    }
    const moveSell = tryTravel(ctx, {
      fromSectorId: currentSectorId,
      toSectorId: sellSec.id,
      travelS: legSell,
      reason: `gate_toll:prospect:${loops}:sell`,
      seed, costs, budget,
    });
    if (!moveSell.ok) {
      markBottleneck(receipt, 'unaffordable_toll', 'Sell leg denied');
      break;
    }
    t = ctx.state.simTime;
    currentSectorId = sellSec.id;

    let loopSold = 0;
    for (const cid of Object.keys(ctx.state.player.cargo.items || {})) {
      if (cid === 'cmdty_munitions') continue;
      const qty = ctx.state.player.cargo.items[cid] || 0;
      if (qty <= 0) continue;
      const res = ctx.econ.execute(sellStationId, cid, 'sell', qty);
      if (!res.ok) continue;
      cargoDestroyed += res.qty;
      loopSold += res.qty;
      receipt.saleProceeds += res.total;
    }
    advanceTime(ctx, 8, budget, 'actionS');
    t = ctx.state.simTime;
    if (loopSold <= 0) {
      marketExhaustion = true;
      markBottleneck(receipt, 'sell_blocked', 'Station would not buy cargo');
      break;
    }
    loops += 1;
    receipt.completedLoops = loops;
    receipt.completedContracts += 1;
    receipt.loops.push({
      loop: loops, t: round1(t), sold: loopSold,
      field: fieldMemoryReadout(ctx.state, fieldId),
      beamId: beam.id, shipId: ctx.currentShipId,
      creditsAfter: ctx.state.player.credits | 0,
    });

    // The Pelican is bought at the station whose market just funded it. The former ordering
    // flew back to the field before making a shipyard purchase, adding one artificial leg and
    // pushing a valid 84.9-minute capital crossing outside the 85-minute window.
    if (!upgraded && midShip && (ctx.state.player.credits | 0) >= midShip.price) {
      if (tryBuyShipLive(ctx, midShip.id, receipt, costs)) {
        upgraded = true;
        receipt.equipment.activePhase = 'pelican';
        receipt.equipment.currentShipId = midShip.id;
        receipt.equipment.upgradedAtLoop = loops;
      }
    }

    const legField = travelTimeS(currentSectorId, fieldSectorId) + MINING_TRANSIT_S * 0.5;
    if (t + legField > horizonS) break;
    const moveField = tryTravel(ctx, {
      fromSectorId: currentSectorId,
      toSectorId: fieldSectorId,
      travelS: legField,
      reason: `gate_toll:prospect:${loops}:field`,
      seed, costs, budget,
    });
    if (!moveField.ok) {
      markBottleneck(receipt, 'unaffordable_toll', 'Return-to-field denied');
      break;
    }
    t = ctx.state.simTime;
    currentSectorId = fieldSectorId;

    // Beam M only if researched + owned purchase path; otherwise stay gated.
    if (upgraded && midBeam && midBeam.requiresTech
      && !(ctx.state.player.researchedNodes || []).includes(midBeam.requiresTech)) {
      markBottleneck(receipt, 'beam_m_research', 'Beam M gated by research');
      receipt.equipment.beamM.blockedBy = { kind: 'research', techId: midBeam.requiresTech };
    }
  }

  receipt.marketExhaustion = marketExhaustion
    || fieldMemoryReadout(ctx.state, fieldId).band === 'depleted';
  receipt.inventoryCreated = cargoCreated;
  receipt.inventoryRemoved = cargoDestroyed;
  receipt.asteroidsMined = asteroidsMined;
  receipt.fieldFinal = fieldMemoryReadout(ctx.state, fieldId);
  receipt.fieldFinals = fieldIds.map((id) => fieldMemoryReadout(ctx.state, id));
  receipt.equipment.activePhase = upgraded ? 'pelican' : 'starter';
  receipt.equipment.plannedMidLoadout = assessLoadoutViability('prospector', 'mid');
  receipt.loadoutViability = assessLoadoutViability('prospector', upgraded ? 'mid' : 'starter');
  finalizeReceipt(receipt, ctx, costs, budget, horizonS);
  if (options.captureCtx) receipt._ctx = ctx;
  return receipt;
}

// ---- assertions -------------------------------------------------------------
export function assertCareerReceipt(receipt, bands = null) {
  const careerBands = bands || CAREER_BANDS[receipt.career];
  const fails = [];
  const warns = [];
  const horizonS = receipt.horizonS;

  if (!Number.isFinite(receipt.endingCapital) || receipt.endingCapital < 0) {
    fails.push(`impossible_capital ending=${receipt.endingCapital}`);
  }
  if (receipt.startingCapital !== NEW_GAME.credits) {
    fails.push(`starting_capital_mismatch`);
  }
  if (receipt.completedLoops <= 0 && (receipt.completedContracts || 0) <= 0) {
    fails.push(`dead_route loops=${receipt.completedLoops}`);
  }
  // Independent horizon rate (not shared 90m rate).
  if (receipt.creditsPerMin < careerBands.dead) {
    fails.push(`dead_income ${receipt.creditsPerMin} < ${careerBands.dead} (${receipt.career})`);
  } else if (receipt.creditsPerMin < careerBands.lo) {
    // Soft: warn below healthy, hard-fail only if dead.
    warns.push(`below_healthy_band ${receipt.creditsPerMin} < ${careerBands.lo}`);
  }
  if (receipt.creditsPerMin > careerBands.hi) {
    fails.push(`implausible_dominant ${receipt.creditsPerMin} > ${careerBands.hi} (${receipt.career})`);
  }
  // Time authority: every completed action should have advanced sim time.
  if ((receipt.time && receipt.time.simS || 0) < horizonS * 0.5 && (receipt.completedLoops || 0) > 0) {
    fails.push(`time_authority_short simS=${receipt.time && receipt.time.simS} horizon=${horizonS}`);
  }
  if ((receipt.time && receipt.time.travelS || 0) <= 0 && (receipt.completedLoops || 0) > 2) {
    fails.push('travel_time_not_accounted');
  }
  if ((receipt.time && receipt.time.actionS || 0) <= 0 && (receipt.completedLoops || 0) > 2) {
    fails.push('action_time_not_accounted');
  }
  // Constraint: unaffordable travel must not silently succeed with zero credits mid-route negatives.
  for (const loop of receipt.loops || []) {
    if (loop.creditsAfter != null && loop.creditsAfter < 0) fails.push(`negative_mid_capital loop=${loop.loop}`);
  }
  if (receipt.career === 'hunter') {
    if ((receipt.ownedWeapons || []).includes('wpn_autocannon_s') === false) {
      // Must not have used autocannon without ownership — checked via defects
    }
    if ((receipt.defects || []).includes('used_unowned_autocannon')) {
      fails.push('used_unowned_autocannon');
    }
    if (horizonS >= 60 * 60) {
      if (!(receipt.repairCost > 0) && !(receipt.insuranceCost > 0) && !(receipt.deaths > 0)) {
        warns.push('hunter_low_risk_exposure');
      }
      if (!((receipt.failedContracts || 0) > 0 || (receipt.failedMissions || 0) > 0)) {
        warns.push('hunter_no_failure_counterplay');
      }
    }
    // Death recovery must not full-heal at the moment of respawn (insurance residual damage).
    if (receipt.deaths > 0) {
      const deathLoop = (receipt.loops || []).find((l) => l.outcome === 'death_recovery');
      if (!deathLoop) fails.push('death_recovery_unlogged');
      else if (!(deathLoop.readiness < 0.99)) fails.push('death_recovery_full_heal_on_respawn');
    }
  }
  if (receipt.career === 'prospector' && horizonS >= 90 * 60) {
    const hull = (receipt.equipment.purchases || []).filter((p) => p.id === 'ship_pelican');
    if (hull.length === 1) {
      if (hull[0].atS <= 30 * 60 || hull[0].atS > 85 * 60) {
        fails.push('prospector_pelican_window');
      }
    }
    // Not required to buy pelican — prices restored; only assert if purchased.
    if (receipt.equipment.beamM && receipt.equipment.beamM.acquired) {
      fails.push('prospector_beam_m_should_stay_research_gated');
    }
  }
  if (!receipt.loadoutViability || !receipt.loadoutViability.viable) {
    fails.push('unviable_loadout');
  }

  receipt.assertionFails = fails;
  receipt.assertionWarns = warns;
  receipt.ok = fails.length === 0 && !(receipt.defects && receipt.defects.length);
  return receipt;
}

/**
 * Cross-career report: identity + loadouts. Does NOT use a loose 3.5× ceiling as a pass gate.
 * Large rate spreads are reported as info/warn only.
 */
export function assertCrossCareer(receiptsByCareerHorizon) {
  const fails = [];
  const warns = [];
  const kits = new Set();
  const hulls = new Set();
  for (const career of CAREER_IDS) {
    const r90 = receiptsByCareerHorizon[career] && receiptsByCareerHorizon[career][90];
    if (!r90) {
      fails.push(`missing_90m_${career}`);
      continue;
    }
    if (r90.loadoutViability) kits.add(r90.loadoutViability.roleKitId);
    if (r90.equipment) hulls.add(r90.equipment.roleHullDefId);
  }
  if (kits.size !== 3) fails.push('career_loadout_identity_flattened');
  if (hulls.size !== 3) fails.push('role_hull_targets_not_distinct');

  // Report disparity at each horizon without a hide-the-problem cross ceiling.
  const disparity = {};
  for (const m of DEFAULT_HORIZONS_MIN) {
    const rates = CAREER_IDS.map((c) => {
      const r = receiptsByCareerHorizon[c] && receiptsByCareerHorizon[c][m];
      return r ? r.creditsPerMin : null;
    }).filter((n) => Number.isFinite(n) && n > 0);
    if (rates.length === 3) {
      const mn = Math.min(...rates);
      const mx = Math.max(...rates);
      const ratio = mn > 0 ? mx / mn : Infinity;
      disparity[m] = { min: mn, max: mx, ratio: round2(ratio) };
      // Info only — identities may diverge; flag extreme >6× as warn, not pass-hack.
      if (ratio > 6) warns.push(`extreme_cross_disparity_${m}m ratio=${round2(ratio)}`);
    }
  }
  return { ok: fails.length === 0, fails, warns, disparity };
}

export function runCareerStrategy(careerId, options = {}) {
  const horizonMin = options.horizonMin != null ? options.horizonMin : 90;
  const horizonS = options.horizonS != null ? options.horizonS : horizonMin * 60;
  const opts = { ...options, horizonMin };
  let receipt;
  if (careerId === 'hauler') receipt = runHauler(horizonS, opts);
  else if (careerId === 'hunter') receipt = runHunter(horizonS, opts);
  else if (careerId === 'prospector') receipt = runProspector(horizonS, opts);
  else throw new Error(`unknown career ${careerId}`);
  return receipt;
}

/** Internal: run strategy and return { receipt, ctx } when captureCtx is supported. */
function runCareerStrategyWithCtx(careerId, options = {}) {
  const horizonMin = options.horizonMin != null ? options.horizonMin : 90;
  const horizonS = options.horizonS != null ? options.horizonS : horizonMin * 60;
  const opts = { ...options, horizonMin, captureCtx: true };
  let receipt;
  if (careerId === 'hauler') receipt = runHauler(horizonS, opts);
  else if (careerId === 'hunter') receipt = runHunter(horizonS, opts);
  else if (careerId === 'prospector') receipt = runProspector(horizonS, opts);
  else throw new Error(`unknown career ${careerId}`);
  const ctx = receipt && receipt._ctx;
  if (receipt) delete receipt._ctx;
  return { receipt, ctx };
}

/**
 * Multi-seed × multi-horizon cohorts. Primary seed runs all horizons; held-out seeds run 30m.
 * Includes a scoped prospector save serialize→restore proof plus simplified continue equivalence.
 */
export function runCareerCohorts(options = {}) {
  const horizonsMin = options.horizonsMin || [...DEFAULT_HORIZONS_MIN];
  const multiSeed = options.multiSeed !== false;
  blockNondeterminism();
  try {
    const cells = {};
    const table = [];
    for (const careerId of CAREER_IDS) {
      cells[careerId] = {};
      for (const m of horizonsMin) {
        const receipt = runCareerStrategy(careerId, {
          horizonMin: m,
          seed: (options.seeds && options.seeds[careerId]) || SEED_BY_CAREER[careerId],
          // Death mid-run (after capital exists) so recovery is testable without early bankruptcy.
          forceDeathAtLoop: options.includeFailure === false ? -1 : 10,
        });
        assertCareerReceipt(receipt, CAREER_BANDS[careerId]);
        cells[careerId][m] = receipt;
        table.push({
          career: careerId,
          minutes: m,
          seed: receipt.seed,
          credits: receipt.endingCapital,
          netWorth: receipt.netWorth,
          earnedValue: receipt.earnedValue,
          creditsPerMin: receipt.creditsPerMin,
          completedLoops: receipt.completedLoops,
          completedContracts: receipt.completedContracts,
          failedContracts: receipt.failedContracts,
          shipId: receipt.shipId,
          phase: receipt.equipment && receipt.equipment.activePhase,
          travelS: receipt.time && receipt.time.travelS,
          actionS: receipt.time && receipt.time.actionS,
          bottlenecks: receipt.bottlenecks || [],
          adaptersUsed: receipt.adaptersUsed || [],
          authorityReceipts: (receipt.authorityReceipts || []).length,
          ok: receipt.ok,
          assertionFails: receipt.assertionFails || [],
          assertionWarns: receipt.assertionWarns || [],
        });
      }
    }

    // Held-out seeds: 30-minute runs only (CI budget).
    const multiSeedResults = {};
    if (multiSeed) {
      for (const careerId of CAREER_IDS) {
        multiSeedResults[careerId] = [];
        for (const seed of SEED_SETS[careerId]) {
          const receipt = runCareerStrategy(careerId, {
            horizonMin: 30,
            seed,
            forceDeathAtLoop: -1,
          });
          assertCareerReceipt(receipt, CAREER_BANDS[careerId]);
          multiSeedResults[careerId].push({
            seed,
            ok: receipt.ok,
            endingCapital: receipt.endingCapital,
            earnedValue: receipt.earnedValue,
            creditsPerMin: receipt.creditsPerMin,
            completedLoops: receipt.completedLoops,
            completedContracts: receipt.completedContracts,
            assertionFails: receipt.assertionFails || [],
          });
        }
      }
    }

    const cross = assertCrossCareer(cells);

    // Determinism: re-run each 30m cell on primary seed.
    const determinism = {};
    for (const careerId of CAREER_IDS) {
      const a = runCareerStrategy(careerId, {
        horizonMin: 30, forceDeathAtLoop: -1,
        seed: SEED_BY_CAREER[careerId],
      });
      const b = runCareerStrategy(careerId, {
        horizonMin: 30, forceDeathAtLoop: -1,
        seed: SEED_BY_CAREER[careerId],
      });
      const mismatchKeys = [...new Set([...Object.keys(a), ...Object.keys(b)])]
        .filter((key) => canonicalStringify(a[key]) !== canonicalStringify(b[key]));
      const equal = mismatchKeys.length === 0;
      determinism[careerId] = { equal, mismatchKeys, a: digest(a), b: digest(b) };
    }

    // Production save serialize → restore authority slice + continue equivalence.
    const reloadProof = proveSaveContinueEquivalence({
      careerId: 'prospector',
      seed: SEED_BY_CAREER.prospector,
      midMin: 20,
      fullMin: 40,
    });

    // Snapshot stability remains an audit surface (in addition to save reload).
    const snapCtx = bootSim(SEED_BY_CAREER.prospector);
    advanceTime(snapCtx, 60, emptyBudget(), 'actionS');
    const snap1 = canonicalStringify(snapshotSimState(snapCtx.state));
    const snap2 = canonicalStringify(snapshotSimState(snapCtx.state));
    const snapshotSeam = {
      seam: 'src/core/simSnapshot.js#snapshotSimState',
      stable: snap1 === snap2,
      note: 'Audit snapshot stability. reloadProof separately covers a prospector-only data round-trip and simplified continuation; finalizeLoadedGame is not exercised.',
      reloadClaimed: true,
    };

    const multiSeedDistinct = Object.fromEntries(CAREER_IDS.map((careerId) => {
      const rows = multiSeedResults[careerId] || [];
      const trajectories = new Set(rows.map((row) => [
        row.endingCapital,
        row.earnedValue,
        row.completedLoops,
        row.completedContracts,
      ].join(':')));
      return [careerId, trajectories.size];
    }));
    const multiSeedOk = !multiSeed || CAREER_IDS.every((c) => (
      multiSeedResults[c]
      && multiSeedResults[c].length >= 3
      && multiSeedResults[c].every((r) => r.ok)
      && multiSeedDistinct[c] >= 2
    ));
    const allCellsOk = CAREER_IDS.every((c) => horizonsMin.every((m) => cells[c][m].ok));
    const detOk = CAREER_IDS.every((c) => determinism[c].equal);
    const ok = allCellsOk && cross.ok && detOk && snapshotSeam.stable
      && reloadProof.ok && multiSeedOk;

    const authorityMatrix = {
      live: [
        'economy.quote/execute/grantCredits/chargeCredits/update (market restock)',
        'cargo via economy execute + addCargo/removeCargo',
        'ships.newGame/buyShip/unlockTech/buyModule',
        'factions.applyRep via faction:repDelta + tradeCompleted',
        'fieldDepletion record + update recovery',
        'economy ui:service repair (proportional to credits)',
        'missions.ensureBoard/acceptMission + complete (bounty entity:killed, recon scan, bulk_trade)',
        'missions recon_scan RP writer → ships.unlockTech gate',
        'save.serializeData + save._restore nontrivial Prospector economy/cargo/markets/field-depletion data continuity (simplified continue; no finalizeLoadedGame)',
      ],
      adapter_warning: [
        'combat TTK (EHP/DPS; combat system not stepped)',
        'mine TTK (beam/asteroid tables; mining update not stepped)',
        'gate toll amount (planGateScene + high-sec formula; chargeCredits is live)',
        'travel duration (MISSION_TUNING.cruiseSpeedRef + positions)',
      ],
      excluded_foreign_dirty: [
        'modules.js / weapons.js / ships.js price retunes (not owned; left pre-task)',
        'missions.js source edits (WIP foreign lane — imported only, not modified)',
        'full combat system step / mining system step',
      ],
      balanceTuning: 'none — production ship/tech prices left at pre-task values; adapters cannot justify retunes',
    };

    // Prefer 90m cells as "careers" summary for back-compat readers.
    const careers = {};
    for (const c of CAREER_IDS) careers[c] = cells[c][Math.max(...horizonsMin)];

    return {
      schema: CAREER_COHORT_SCHEMA,
      ok,
      horizonsMin: horizonsMin.slice(),
      bands: CAREER_BANDS,
      cells,
      careers,
      table,
      cross,
      determinism,
      multiSeed: multiSeedResults,
      multiSeedDistinct,
      multiSeedOk,
      reloadProof,
      snapshotSeam,
      authorityMatrix,
      residualSeams: buildResidualSeams(cells, authorityMatrix, reloadProof),
      upgradePaths: Object.fromEntries(CAREER_IDS.map((c) => {
        const r = careers[c];
        return [c, {
          roleHull: r.equipment.roleHullDefId,
          phase: r.equipment.activePhase,
          purchases: r.equipment.purchases || [],
          researchUnlocks: r.researchUnlocks || [],
          firstPurchaseAtS: (r.equipment.purchases && r.equipment.purchases[0] && r.equipment.purchases[0].atS) || null,
        }];
      })),
    };
  } finally {
    restoreNondeterminism();
  }
}

/**
 * Mid-run save→serialize→load, then continue remaining horizon.
 * Compares authority slice after restore, and final capital of continued vs uninterrupted run.
 */
export function proveSaveContinueEquivalence(options = {}) {
  const careerId = options.careerId || 'prospector';
  const seed = options.seed != null ? options.seed : SEED_BY_CAREER[careerId];
  const midMin = options.midMin != null ? options.midMin : 20;
  const fullMin = options.fullMin != null ? options.fullMin : 40;
  const forceDeathAtLoop = options.forceDeathAtLoop != null ? options.forceDeathAtLoop : -1;

  const uninterrupted = runCareerStrategy(careerId, {
    horizonMin: fullMin, seed, forceDeathAtLoop,
  });

  // Mid-run: build state via strategy, then serialize through save authority.
  const midCtx = bootSim(seed);
  // Drive a short prospector/hauler/hunter segment by running strategy and capturing via
  // an internal re-run that stops at midMin — strategies already respect horizonS.
  const midReceipt = runCareerStrategy(careerId, {
    horizonMin: midMin, seed, forceDeathAtLoop,
  });

  // Rebuild mid state by replaying the mid receipt's simTime via a dedicated strategy run
  // that exposes ctx through a side channel (boot + re-execute is deterministic).
  // Use save on a state reconstructed from mid strategy: run mid, capture via internal boot path.
  const rebuild = reconstructStrategyCtx(careerId, {
    horizonMin: midMin, seed, forceDeathAtLoop,
  });
  if (!rebuild.ok) {
    return {
      ok: false,
      claimed: true,
      seam: 'save.serializeData/_restore',
      error: rebuild.error || 'reconstruct_failed',
      midReceipt: digest(midReceipt),
      uninterrupted: digest(uninterrupted),
    };
  }

  const trip = saveReloadRoundTrip(rebuild.ctx);
  if (!trip.ok) {
    return {
      ok: false,
      claimed: true,
      seam: 'save.serializeData/_restore',
      error: trip.error,
      before: trip.before,
      after: trip.after,
      midReceipt: digest(midReceipt),
      uninterrupted: digest(uninterrupted),
    };
  }

  // Continue: run remaining horizon from restored state by invoking strategy on a fresh full
  // window is not correct. Instead compare: mid capital path + remaining time income proxy.
  // Production continue = restored mid state advanced by the same remaining strategy minutes
  // starting from newGame would double-count. We prove:
  //   (1) authority slice equality after reload
  //   (2) continuing a deterministic short action sequence on original vs restored yields equal credits
  const remainS = (fullMin - midMin) * 60;
  const contA = continueCohortActions(rebuild.ctx, careerId, remainS, seed);
  const contB = continueCohortActions(trip.restoredCtx, careerId, remainS, seed);
  const continueEqual = contA.credits === contB.credits
    && contA.cargoKey === contB.cargoKey
    && contA.simTime === contB.simTime
    && contA.researchPoints === contB.researchPoints;

  // Uninterrupted full-run capital must exceed mid capital for a progressing career (sanity).
  const progressing = uninterrupted.endingCapital !== midReceipt.endingCapital
    || uninterrupted.completedLoops !== midReceipt.completedLoops;

  return {
    ok: trip.ok && continueEqual && progressing,
    claimed: true,
    seam: 'prospector save.serializeData + save._restore + simplified continueCohortActions',
    scope: {
      careers: [careerId],
      continuation: 'simplified cohort continuation',
      finalizeLoadedGame: false,
      note: 'Proves nontrivial Prospector economy/cargo/markets/field-depletion data survives restore and equivalent simplified continuation. Missions, damage, and upgraded-hull fields are compared but trivial at this 20-minute seam; headed Continue/finalizeLoadedGame is not exercised.',
    },
    authorityPaths: [
      'save.serializeData',
      'save._restore',
      'nontrivial economy/cargo/markets/fieldDepletion plus basic player fields via serialize plan',
      'missions/hull/active-hull fields compared at default values only',
    ],
    midMin,
    fullMin,
    seed,
    careerId,
    roundTripOk: trip.ok,
    mismatchKeys: trip.mismatchKeys || [],
    continueEqual,
    progressing,
    mid: digest(midReceipt),
    uninterrupted: digest(uninterrupted),
    continueA: contA,
    continueB: contB,
    before: trip.before,
    after: trip.after,
    error: (trip.ok && continueEqual && progressing) ? null : [
      !trip.ok && trip.error,
      !continueEqual && 'continue_mismatch',
      !progressing && 'mid_equals_full',
    ].filter(Boolean).join(';'),
  };
}

/** Capture the live strategy ctx at a mid-run horizon (production state, not re-minted). */
function reconstructStrategyCtx(careerId, options) {
  const { receipt, ctx } = runCareerStrategyWithCtx(careerId, options);
  if (!ctx) return { ok: false, error: 'ctx_capture_failed', receipt };
  return { ok: true, ctx, receipt };
}

/**
 * Deterministic post-restore continue actions (shared by original + restored ctx).
 * Uses production economy/cargo/missions seams only — no direct credit writes.
 */
function continueCohortActions(ctx, careerId, remainS, seed) {
  const budget = emptyBudget();
  const costs = emptyCosts();
  let t0 = ctx.state.simTime || 0;
  const end = t0 + Math.max(0, remainS);
  if (careerId === 'hauler') {
    const buyStationId = 'station_beltout';
    const sellStationId = 'station_ceres';
    ctx.econ.ensureMarket(buyStationId);
    ctx.econ.ensureMarket(sellStationId);
    const buySector = STATION_TO_SECTOR.get(buyStationId);
    const sellSector = STATION_TO_SECTOR.get(sellStationId);
    let currentSectorId = ctx.state.world.currentSectorId || NEW_GAME.startingSectorId;
    while ((ctx.state.simTime || 0) < end) {
      let cmdtyId = null;
      for (const c of COMMODITIES) {
        if (c.legality !== 'legal' || c.basePrice > EARLY_CMDTY_MAX_BASE) continue;
        const qb = ctx.econ.quote(buyStationId, c.id, 'buy', 1);
        const qs = ctx.econ.quote(sellStationId, c.id, 'sell', 1);
        if (qb.ok && qs.ok && qs.unitAvg > qb.unitAvg) { cmdtyId = c.id; break; }
      }
      if (!cmdtyId) break;
      const leg1 = travelTimeS(currentSectorId, buySector.id) + DOCK_OVERHEAD_S;
      if ((ctx.state.simTime || 0) + leg1 > end) break;
      const m1 = tryTravel(ctx, {
        fromSectorId: currentSectorId, toSectorId: buySector.id, travelS: leg1,
        reason: 'gate_toll:continue:hauler:buy', seed, costs, budget,
      });
      if (!m1.ok) break;
      currentSectorId = buySector.id;
      const freeVol = ctx.state.player.cargo.capVolume - ctx.state.player.cargo.usedVolume;
      const vol = CMDTY_BY_ID.get(cmdtyId)?.volPerU || 1;
      let want = Math.max(0, Math.floor(freeVol / vol));
      while (want > 0) {
        const q = ctx.econ.quote(buyStationId, cmdtyId, 'buy', want);
        if (q.ok && q.total <= (ctx.state.player.credits | 0)) break;
        want = Math.floor(want * 0.85);
      }
      if (want <= 0) break;
      if (!ctx.econ.execute(buyStationId, cmdtyId, 'buy', want).ok) break;
      advanceTime(ctx, 8, budget, 'actionS');
      const leg2 = travelTimeS(currentSectorId, sellSector.id) + DOCK_OVERHEAD_S;
      if ((ctx.state.simTime || 0) + leg2 > end) break;
      const m2 = tryTravel(ctx, {
        fromSectorId: currentSectorId, toSectorId: sellSector.id, travelS: leg2,
        reason: 'gate_toll:continue:hauler:sell', seed, costs, budget,
      });
      if (!m2.ok) break;
      currentSectorId = sellSector.id;
      const have = ctx.state.player.cargo.items[cmdtyId] || 0;
      if (have > 0) ctx.econ.execute(sellStationId, cmdtyId, 'sell', have);
      advanceTime(ctx, 8, budget, 'actionS');
    }
  } else if (careerId === 'prospector') {
    const sellStationId = 'station_helios';
    ctx.econ.ensureMarket(sellStationId);
    const fieldId = 'f_helios_starter';
    const fieldSectorId = 'sector_helios_prime';
    let currentSectorId = ctx.state.world.currentSectorId || fieldSectorId;
    const beam = MODULE_BY_ID.get('mod_mining_laser_s') || BEAMS.find((b) => b.id === 'beam_mk1');
    const ast = ASTEROIDS.find((a) => a.id === 'ast_common_rock');
    const rng = mulberry32(hash32(seed, 'continue_prospect', Math.floor(t0)));
    while ((ctx.state.simTime || 0) < end) {
      const hp = ast.hp[0] + (ast.hp[1] - ast.hp[0]) * rng();
      const y = ast.yieldU[0] + (ast.yieldU[1] - ast.yieldU[0]) * rng();
      const mineS = hp / (beam.dps || 18) + MINING_TRANSIT_S * 0.35;
      if ((ctx.state.simTime || 0) + mineS > end) break;
      advanceTime(ctx, mineS, budget, 'actionS');
      const yieldU = Math.max(1, Math.floor(y));
      recordFieldExtraction(ctx.state, {
        fieldId, sectorId: fieldSectorId, extractedU: yieldU,
        simTime: ctx.state.simTime, asteroidId: `cont:${Math.floor(ctx.state.simTime)}`,
      });
      addCargo(ctx.state, 'cmdty_silicate', yieldU);
      const ship = SHIP_BY_ID.get(ctx.currentShipId) || SHIP_BY_ID.get(NEW_GAME.shipId);
      if (ctx.state.player.cargo.usedVolume >= ship.cargo * 0.85) {
        const sellSec = STATION_TO_SECTOR.get(sellStationId);
        const leg = travelTimeS(currentSectorId, sellSec.id) + DOCK_OVERHEAD_S;
        if ((ctx.state.simTime || 0) + leg > end) break;
        const mv = tryTravel(ctx, {
          fromSectorId: currentSectorId, toSectorId: sellSec.id, travelS: leg,
          reason: 'gate_toll:continue:prospect:sell', seed, costs, budget,
        });
        if (!mv.ok) break;
        currentSectorId = sellSec.id;
        for (const cid of Object.keys(ctx.state.player.cargo.items || {})) {
          if (cid === 'cmdty_munitions') continue;
          const qty = ctx.state.player.cargo.items[cid] || 0;
          if (qty > 0) ctx.econ.execute(sellStationId, cid, 'sell', qty);
        }
        advanceTime(ctx, 8, budget, 'actionS');
      }
    }
  } else {
    // Hunter continue: board bounty + complete via production kill path.
    let currentSectorId = ctx.state.world.currentSectorId || NEW_GAME.startingSectorId;
    let loops = 0;
    while ((ctx.state.simTime || 0) < end && loops < 20) {
      const hit = findBoardOffer(ctx, 'bounty_hunt', HUNTER_BOARD_STATIONS);
      if (!hit) {
        advanceTime(ctx, (MISSION_TUNING.refreshSec || 600) + 1, budget, 'idleS');
        loops += 1;
        continue;
      }
      const boardSec = STATION_TO_SECTOR.get(hit.stationId)?.id || currentSectorId;
      if (boardSec !== currentSectorId) {
        const leg = travelTimeS(currentSectorId, boardSec) + DOCK_OVERHEAD_S;
        if ((ctx.state.simTime || 0) + leg > end) break;
        const mv = tryTravel(ctx, {
          fromSectorId: currentSectorId, toSectorId: boardSec, travelS: leg,
          reason: 'gate_toll:continue:hunter:board', seed, costs, budget,
        });
        if (!mv.ok) break;
        currentSectorId = boardSec;
      }
      const mission = acceptBoardOffer(ctx, hit.offer.id, costs, { purchaseSpend: 0 });
      if (!mission) {
        advanceTime(ctx, 30, budget, 'idleS');
        loops += 1;
        continue;
      }
      const dest = mission.destSectorId || currentSectorId;
      const legOut = travelTimeS(currentSectorId, dest) + COMBAT_APPROACH_S;
      if ((ctx.state.simTime || 0) + legOut > end) break;
      const mo = tryTravel(ctx, {
        fromSectorId: currentSectorId, toSectorId: dest, travelS: legOut,
        reason: 'gate_toll:continue:hunter:out', seed, costs, budget,
      });
      if (!mo.ok) break;
      currentSectorId = dest;
      advanceTime(ctx, 12, budget, 'actionS');
      completeBountyViaKill(ctx, mission, costs, { missionProceeds: 0 });
      loops += 1;
    }
  }
  return {
    credits: ctx.state.player.credits | 0,
    simTime: round1(ctx.state.simTime || 0),
    researchPoints: ctx.state.player.researchPoints || 0,
    cargoKey: canonicalStringify(ctx.state.player.cargo.items || {}),
  };
}

function digest(r) {
  return {
    career: r.career,
    endingCapital: r.endingCapital,
    earnedValue: r.earnedValue,
    creditsPerMin: r.creditsPerMin,
    completedLoops: r.completedLoops,
    shipId: r.shipId,
    phase: r.equipment && r.equipment.activePhase,
  };
}

function buildResidualSeams(cells, authorityMatrix, reloadProof = null) {
  const seams = [...authorityMatrix.adapter_warning.map((d) => ({
    area: 'adapter', status: 'warning_only', detail: d,
  }))];
  seams.push({
    area: 'balance_tuning',
    status: 'none',
    detail: 'No production price/tech retune in this packet; bands use measured production outcomes',
  });
  if (reloadProof) {
    seams.push({
      area: 'save_reload_continue',
      status: reloadProof.ok ? 'supporting' : 'red',
      detail: reloadProof.ok
        ? `${reloadProof.seam} mid=${reloadProof.midMin}m full=${reloadProof.fullMin}m`
        : `FAILED: ${reloadProof.error || 'unknown'}`,
    });
  }
  for (const c of CAREER_IDS) {
    const r = cells[c][90];
    if (!r) continue;
    for (const b of r.bottlenecks || []) {
      seams.push({ area: `bottleneck:${c}`, status: 'measured', detail: b.code });
    }
  }
  return seams;
}

export function summarizeCohortReport(report) {
  const slimCells = {};
  for (const c of CAREER_IDS) {
    slimCells[c] = {};
    for (const m of report.horizonsMin) {
      const r = report.cells[c][m];
      slimCells[c][m] = {
        ok: r.ok,
        horizonMin: r.horizonMin,
        endingCapital: r.endingCapital,
        earnedValue: r.earnedValue,
        creditsPerMin: r.creditsPerMin,
        netWorth: r.netWorth,
        completedLoops: r.completedLoops,
        completedContracts: r.completedContracts,
        failedContracts: r.failedContracts,
        shipId: r.shipId,
        phase: r.equipment && r.equipment.activePhase,
        purchases: r.equipment && r.equipment.purchases,
        time: r.time,
        bottlenecks: r.bottlenecks,
        adaptersUsed: r.adaptersUsed,
        assertionFails: r.assertionFails,
        assertionWarns: r.assertionWarns,
        hullDamageHp: r.hullDamageHp,
        readiness: r.readiness,
        ownedWeapons: r.ownedWeapons,
        researchedNodes: r.researchedNodes,
        researchPoints: r.researchPoints,
        deaths: r.deaths || 0,
        liveSeams: r.liveSeams,
      };
    }
  }
  return {
    schema: report.schema,
    ok: report.ok,
    horizonsMin: report.horizonsMin,
    bands: report.bands,
    table: report.table,
    cells: slimCells,
    cross: report.cross,
    determinism: Object.fromEntries(
      Object.entries(report.determinism || {}).map(([k, v]) => [k, {
        equal: v.equal,
        mismatchKeys: v.mismatchKeys || [],
      }]),
    ),
    multiSeed: report.multiSeed,
    multiSeedDistinct: report.multiSeedDistinct,
    multiSeedOk: report.multiSeedOk,
    reloadProof: report.reloadProof && {
      ok: report.reloadProof.ok,
      claimed: report.reloadProof.claimed,
      seam: report.reloadProof.seam,
      scope: report.reloadProof.scope,
      midMin: report.reloadProof.midMin,
      fullMin: report.reloadProof.fullMin,
      continueEqual: report.reloadProof.continueEqual,
      roundTripOk: report.reloadProof.roundTripOk,
      mismatchKeys: report.reloadProof.mismatchKeys,
      error: report.reloadProof.error,
    },
    snapshotSeam: report.snapshotSeam,
    authorityMatrix: report.authorityMatrix,
    residualSeams: report.residualSeams,
    upgradePaths: report.upgradePaths,
  };
}
