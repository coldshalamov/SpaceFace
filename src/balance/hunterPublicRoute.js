// M3 Hunter public-route timing harness.
//
// Closes the authored-settlement gap: the origin writs, objective navigation, combat damage,
// missions→economy payout, repair/retry costs, and save-relevant state advance real simTime.
// Travel/fight durations are data-grounded adapters (MISSION_TUNING.cruiseSpeedRef + EHP/DPS);
// credit settlement always goes through registered missions + economy authorities.

import { createSimulation } from '../core/sim.js';
import { hash32 } from '../core/rng.js';
import { planGateScene } from '../data/gateControl.js';
import { ENEMY_TYPES } from '../data/enemies.js';
import { MISSION_TUNING } from '../data/missions.js';
import { NEW_GAME } from '../data/newGameDefaults.js';
import { SECTORS } from '../data/sectors.js';
import { WEAPONS } from '../data/weapons.js';
import {
  CAREER_ORIGIN_CONTRACTS,
  HUNTER_ORIGIN_CLEAN_GROSS_ENVELOPE_CR,
  ORIGIN_ROLE_KITS,
} from '../careers/origins/careerOriginContracts.js';
import { HUNTER_ORIGIN_REWARD } from '../careers/origins/hunterOriginData.js';
import { careerOrigins as careerOriginsSystem } from '../careers/origins/careerOrigins.js';
import { cargo as cargoSystem } from '../systems/cargo.js';
import { economy as economySystem, SERVICE_PRICES } from '../systems/economy.js';
import { factions as factionsSystem } from '../systems/factions.js';
import { missions as missionsSystem } from '../systems/missions.js';
import {
  ships as shipsSystem,
  makeShipEntitySpec,
  fittingsFromDefaultModules,
} from '../systems/ships.js';
import { save as saveSystem } from '../save/saveSystem.js';
import { combat as combatSystem, makeEnemySpawnSpec } from '../systems/combat.js';

export const HUNTER_PUBLIC_ROUTE_SCHEMA = 'spaceface.m3.hunterPublicRoute.v1';
export const HUNTER_PUBLIC_ROUTE_SEED = 0xC0B0_B091;
export const HUNTER_HEALTHY_CR_PER_MIN = 62.5;
export const HUNTER_DEAD_CR_PER_MIN = 30;
export const HUNTER_ROUTE_HORIZONS_MIN = Object.freeze([30, 60, 90]);

const DOCK_OVERHEAD_S = 18;
const COMBAT_APPROACH_S = 25;
const REPAIR_FRAC_OF_DAMAGE = 0.55;
const HOME_SECTOR_ID = NEW_GAME.startingSectorId;
const HOME_STATION_ID = 'station_helios';
const HUNTER_BOARD_STATIONS = Object.freeze([
  'station_helios', 'station_ceres', 'station_tethys', 'station_coalition', 'station_customs',
]);

const SECTOR_BY_ID = new Map(SECTORS.map((s) => [s.id, s]));
const STATION_TO_SECTOR = new Map();
for (const sec of SECTORS) {
  for (const st of sec.stations || []) STATION_TO_SECTOR.set(st.id, sec);
}
const WEAPON_BY_ID = new Map(WEAPONS.map((w) => [w.id, w]));
const ENEMY_BY_ID = new Map(ENEMY_TYPES.map((e) => [e.id, e]));

const _MathRandom = Math.random;
const _DateNow = Date.now;
let _blocked = false;

export function blockNondeterminism() {
  if (_blocked) return;
  _blocked = true;
  Math.random = () => { throw new Error('Math.random forbidden in hunter public route'); };
  Date.now = () => { throw new Error('Date.now forbidden in hunter public route'); };
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
  const remaining = Number.isFinite(ctx.routeHorizonS)
    ? Math.max(0, ctx.routeHorizonS - (ctx.state.simTime || 0))
    : requested;
  const d = Math.min(requested, remaining);
  if (d <= 0) return 0;
  const before = Number(ctx.state.simTime) || 0;
  ctx.sim.step(d);
  const advanced = (Number(ctx.state.simTime) || 0) - before;
  if (Math.abs(advanced - d) > 1e-6) {
    throw new Error(`simulation clock authority drifted: requested=${d} advanced=${advanced}`);
  }
  budget.simS += advanced;
  if (bucket && budget[bucket] != null) budget[bucket] += advanced;
  return advanced;
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
}) {
  const toll = routeTollAmount(seed, fromSectorId, toSectorId, dayIndex);
  const pay = tryChargeToll(ctx, toll, reason, costs);
  if (!pay.ok) {
    return {
      ok: false, reason: 'unaffordable_toll', toll, have: pay.have, need: pay.need,
    };
  }
  ctx.bus.emit('dock:undocked', { reason });
  advanceTime(ctx, travelS, budget, 'travelS');
  ctx.state.world.currentSectorId = toSectorId;
  ctx.bus.emit('sector:enter', { sectorId: toSectorId });
  return { ok: true, toll: pay.charged, travelS };
}

function bootHunterRoute(seed) {
  const sim = createSimulation({
    seed,
    systems: [
      economySystem, cargoSystem, shipsSystem, factionsSystem,
      missionsSystem, careerOriginsSystem, saveSystem, combatSystem,
    ],
  });
  const state = sim.state;
  const bus = sim.bus;
  const econ = sim.registry.get('economy');
  const ships = sim.registry.get('ships');
  const factions = sim.registry.get('factions');
  const missions = sim.registry.get('missions');
  const origins = sim.registry.get('careerOrigins');
  const save = sim.registry.get('save');
  const combat = sim.registry.get('combat');

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
  if (econ && typeof econ.newGame === 'function') econ.newGame();
  econ.grantCredits(NEW_GAME.credits, 'new_game_seed');
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
  for (const [fid, rep] of Object.entries(NEW_GAME.factionRep || {})) {
    if (!state.factions[fid]) continue;
    const delta = (rep | 0) - (state.factions[fid].rep | 0);
    if (delta) bus.emit('faction:repDelta', { factionId: fid, delta, reason: 'new_game_seed' });
  }
  if (missions && typeof missions.newGame === 'function') missions.newGame();
  // Origin owns the first contracts; clear campaign cold-start so the board remains free after.
  if (state.missions) {
    state.missions.active = [];
    state.missions.completedLog = [];
    state.missions.receipts = [];
    state.missions.nextId = 1;
  }
  if (origins && typeof origins.newGame === 'function') origins.newGame();

  const kit = ORIGIN_ROLE_KITS.hunter;
  if (kit) {
    // Role kit is granted by careerOrigins on primary accept; track for receipt only.
  }

  return {
    sim, state, bus, econ, ships, factions, missions, origins, save, combat,
    seed: seed >>> 0,
    hullDamageHp: 0,
    currentShipId: NEW_GAME.shipId,
  };
}

function activeMission(ctx) {
  const route = ctx.state.careers?.origins?.__meta?.routes?.hunter;
  if (!route?.activeMissionId) return null;
  return (ctx.state.missions.active || []).find((m) => m && m.id === route.activeMissionId) || null;
}

function ensureBountyTarget(ctx, mission) {
  if (!mission) return null;
  if (mission.targetEntityIds && mission.targetEntityIds.length) {
    const live = ctx.state.entities.get(mission.targetEntityIds[0]);
    if (live && live.alive) return live;
  }
  if (typeof ctx.missions.spawnTargetsForSector === 'function') {
    ctx.missions.spawnTargetsForSector(mission.destSectorId || ctx.state.world.currentSectorId);
  }
  const id = mission.targetEntityIds && mission.targetEntityIds[0];
  return id != null ? ctx.state.entities.get(id) || null : null;
}

function fightDurationS(weapon, contact, mission) {
  const archetype = (contact && contact.data && (contact.data.typeId || contact.data.defId))
    || (mission && mission.storyTarget && mission.storyTarget.archetype)
    || 'wasp_swarmer';
  const enemy = ENEMY_BY_ID.get(archetype);
  const level = 1;
  const spawn = makeEnemySpawnSpec(archetype, level, { x: 0, z: 0 });
  const ehp = (contact && Number.isFinite(contact.hullMax) ? contact.hullMax : (spawn.hull || enemy?.hull || 80))
    + (contact && Number.isFinite(contact.armorMax) ? contact.armorMax : (spawn.armorHp || 0))
    + (contact && Number.isFinite(contact.shieldMax) ? contact.shieldMax : (spawn.shield || 0));
  const dps = Math.max(0.1, weapon?.dps || 10);
  return Math.max(8, ehp / dps);
}

function enemyReturnDps(contact, mission) {
  const archetype = (contact && contact.data && (contact.data.typeId || contact.data.defId))
    || (mission && mission.storyTarget && mission.storyTarget.archetype)
    || 'wasp_swarmer';
  const spawn = makeEnemySpawnSpec(archetype, 1, { x: 0, z: 0 });
  return (spawn.data?.weapons || []).reduce((sum, w) => {
    const dmg = Number(w.dmg) || 0;
    const rof = Number(w.rof) || 0;
    if (rof === 0) return sum + (Number(w.dps) || dmg);
    return sum + dmg * rof;
  }, 0) || 4;
}

function applyCombatDamage(ctx, attacker, damageTaken, receipt) {
  const e = playerEntity(ctx);
  if (!e || !(e.hullMax > 0) || !ctx.combat || typeof ctx.combat.onHit !== 'function') {
    return { ok: false, readiness: 1, remainingHp: 0, hullDamage: 0, damageEvents: 0 };
  }
  const dmg = Math.max(0, Number(damageTaken) || 0);
  const hullBefore = Number(e.hull) || e.hullMax;
  const targetHull = Math.max(1, hullBefore - Math.min(dmg, Math.max(0, hullBefore - 1)));
  let damageEvents = 0;
  const offDamage = ctx.bus.on('combat:damage', (payload) => {
    if (payload && payload.targetId === e.id && payload.applied > 0) damageEvents += 1;
  });
  let attempts = 0;
  let lastResult = null;
  try {
    // The timing harness abstracts aim/weapon cadence, not damage authority. Repeated bounded hits
    // route through the registered combat kernel until the data-grounded enemy return-DPS has
    // produced the intended non-lethal hull loss.
    while (e.alive !== false && e.hull > targetHull + 0.01 && attempts < 128) {
      const remainingHull = e.hull - targetHull;
      const hitDamage = Math.max(8, Math.min(e.hullMax * 0.2, remainingHull * 4 + 8));
      lastResult = ctx.combat.onHit({
        targetId: e.id,
        ownerId: attacker && attacker.id != null ? attacker.id : null,
        damage: hitDamage,
        damageType: 'kinetic',
        pos: { x: e.pos.x, z: e.pos.z },
        weaponId: 'hunter_route_enemy_return_fire',
        origin: { kind: 'route-adapter', id: 'hunter_enemy_return_fire' },
      });
      attempts += 1;
      if (!lastResult || lastResult.ok !== true) break;
    }
  } finally {
    offDamage();
  }
  const hullDamage = Math.max(0, hullBefore - (Number(e.hull) || 0));
  ctx.hullDamageHp = Math.max(0, e.hullMax - e.hull);
  const result = {
    ok: damageEvents > 0 && hullDamage > 0 && e.alive !== false,
    readiness: e.hull / e.hullMax,
    remainingHp: ctx.hullDamageHp,
    hullDamage,
    damageEvents,
    attempts,
    lastReason: lastResult && lastResult.reason || null,
  };
  markAuthority(receipt, {
    kind: 'combat_damage',
    atS: round1(ctx.state.simTime),
    hullDamage: round1(hullDamage),
    damageEvents,
    authority: 'registered combat.onHit→combat kernel→combat:damage',
  });
  if (!result.ok) receipt.defects.push(`combat_damage_authority_failed:${result.lastReason || 'no_hull_damage'}`);
  return result;
}

function repairAtDock(ctx, costs, budget, receipt, options = {}) {
  const e = playerEntity(ctx);
  if (!e || !(e.hullMax > 0)) return { spent: 0, readiness: 1, remainingHp: 0 };
  const readiness = e.hull / e.hullMax;
  const minCreditsAfter = options.minCreditsAfter != null ? options.minCreditsAfter : 200;
  const readinessGate = options.readinessGate != null ? options.readinessGate : 0.7;
  let spent = 0;
  if (readiness < readinessGate && (ctx.state.player.credits | 0) > minCreditsAfter) {
    if (!(e.flags && e.flags.docked)) {
      receipt.defects.push('repair_attempted_while_undocked');
      return { spent: 0, readiness, remainingHp: Math.max(0, e.hullMax - (e.hull || 0)) };
    }
    const before = ctx.state.player.credits | 0;
    ctx.bus.emit('ui:service', { type: 'repair' });
    spent = Math.max(0, before - (ctx.state.player.credits | 0));
    costs.repairCost += spent;
    advanceTime(ctx, DOCK_OVERHEAD_S * 0.35, budget, 'recoveryS');
    ctx.hullDamageHp = Math.max(0, e.hullMax - (e.hull || 0));
    if (spent > 0) {
      markAuthority(receipt, {
        kind: 'repair_service',
        atS: round1(ctx.state.simTime),
        spent,
        authority: 'economy ui:service→handleService→chargeCredits',
      });
    }
  }
  return {
    spent,
    readiness: e.hullMax > 0 ? e.hull / e.hullMax : 1,
    remainingHp: Math.max(0, e.hullMax - (e.hull || 0)),
  };
}

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
      && !String(s.storyTag || '').startsWith('origin.')
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
    if (boardToll + destToll + coll > maxCredits) continue;
    return { offer, stationId, board, boardToll, destToll };
  }
  return null;
}

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
  const candidates = (ctx.state.missions.active || []).filter((m) => m && m.status === 'active'
    && !String(m.storyTag || '').startsWith('campaign47a:'));
  return candidates[candidates.length - 1] || null;
}

function completeBountyViaKill(ctx, mission, receipt) {
  if (!mission || mission.type !== 'bounty_hunt') return { ok: false, reward: 0 };
  const contact = ensureBountyTarget(ctx, mission);
  if (!contact) return { ok: false, reward: 0, reason: 'no_target' };
  const before = ctx.state.player.credits | 0;
  const beforeDone = ctx.state.player.stats?.missionsDone || 0;
  let missionReward = 0;
  let combatDamageEvents = 0;
  const offCredits = ctx.bus.on('credits:changed', (payload) => {
    if (!payload || payload.reason !== `mission:${mission.id}`) return;
    missionReward += Math.max(0, Number(payload.delta) || 0);
  });
  const offDamage = ctx.bus.on('combat:damage', (payload) => {
    if (payload && payload.targetId === contact.id && payload.applied > 0) combatDamageEvents += 1;
  });
  let attempts = 0;
  try {
    while (contact.alive !== false && attempts < 8) {
      const totalHp = Math.max(1,
        (Number(contact.hull) || 0)
        + (Number(contact.armorHp) || 0)
        + (Number(contact.shield) || 0));
      const result = ctx.combat.onHit({
        targetId: contact.id,
        ownerId: ctx.state.playerId,
        damage: Math.max(250, totalHp * 12),
        damageType: 'kinetic',
        pos: { x: contact.pos.x, z: contact.pos.z },
        weaponId: 'wpn_pulse_laser_s',
        origin: { kind: 'route-adapter', id: 'hunter_player_fire', weaponId: 'wpn_pulse_laser_s' },
      });
      attempts += 1;
      if (!result || result.ok !== true) break;
    }
  } finally {
    offDamage();
    offCredits();
  }
  const walletDelta = Math.max(0, (ctx.state.player.credits | 0) - before);
  if (missionReward > 0) receipt.missionProceeds = (receipt.missionProceeds || 0) + missionReward;
  const stillActive = (ctx.state.missions.active || []).some((m) => m.id === mission.id && m.status === 'active');
  const done = (ctx.state.player.stats?.missionsDone || 0) > beforeDone || !stillActive;
  return {
    ok: done && contact.alive === false && missionReward > 0 && combatDamageEvents > 0,
    reward: missionReward,
    walletDelta,
    combatDamageEvents,
    attempts,
    missionId: mission.id,
    targetId: contact.id,
  };
}

function captureSaveSlice(ctx) {
  const e = playerEntity(ctx);
  const route = ctx.state.careers?.origins?.__meta?.routes?.hunter || null;
  const mission = activeMission(ctx);
  const wp = ctx.state.nav?.waypoint || null;
  return {
    credits: ctx.state.player.credits | 0,
    simTime: round1(ctx.state.simTime || 0),
    sectorId: ctx.state.world.currentSectorId,
    hull: e ? round1(e.hull || 0) : null,
    hullMax: e ? round1(e.hullMax || 0) : null,
    routeStatus: route && route.status,
    contractIndex: route && route.contractIndex,
    activeMissionId: route && route.activeMissionId,
    completedContractIds: route ? [...(route.completedContractIds || [])] : [],
    missionType: mission && mission.type,
    missionOriginId: mission && mission.originContractId,
    waypointMissionId: wp && wp.missionId,
    waypointMarkerId: wp && wp.markerId,
    waypointMarkerKind: wp && wp.markerKind,
    waypointTargetEntityId: wp && wp.targetEntityId,
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
  const restoredCtx = bootHunterRoute(ctx.seed);
  restoredCtx.routeHorizonS = ctx.routeHorizonS;
  try {
    withDateAllowed(() => restoredCtx.save._restore(payload, 'hunter_public_route_mid'));
  } catch (err) {
    return { ok: false, error: `restore_failed:${err && err.message || err}`, payload, before };
  }
  // Rebind player entity tracking after restore.
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

/**
 * Run one independent Hunter public-route horizon.
 * options:
 *   seed, horizonMin / horizonS
 *   forceRetryOnFirstWrit (default true) — fail+reissue first origin writ once for haircut proof
 *   forceBoardFailureAt (default 2) — abandon the Nth board bounty (1-based after origin)
 *   captureSaveAfterOriginWrit (default 0) — index of origin writ after which to save/restore
 */
export function runHunterPublicRoute(options = {}) {
  const seed = (options.seed != null ? options.seed : HUNTER_PUBLIC_ROUTE_SEED) >>> 0;
  const horizonMin = options.horizonMin != null ? options.horizonMin : 30;
  const horizonS = options.horizonS != null ? options.horizonS : horizonMin * 60;
  const forceRetryOnFirstWrit = options.forceRetryOnFirstWrit !== false;
  const forceBoardFailureAt = options.forceBoardFailureAt != null ? options.forceBoardFailureAt : 2;
  const captureSaveAfterOriginWrit = options.captureSaveAfterOriginWrit != null
    ? options.captureSaveAfterOriginWrit
    : 0;

  const ctx = bootHunterRoute(seed);
  ctx.routeHorizonS = horizonS;
  const costs = emptyCosts();
  const budget = emptyBudget();
  const weapon = WEAPON_BY_ID.get('wpn_pulse_laser_s');
  const receipt = {
    schema: HUNTER_PUBLIC_ROUTE_SCHEMA,
    career: 'hunter',
    seed,
    horizonMin,
    horizonS,
    startingCapital: NEW_GAME.credits,
    purchaseSpend: 0,
    missionProceeds: 0,
    completedLoops: 0,
    completedContracts: 0,
    failedContracts: 0,
    origin: {
      status: 'idle',
      completedContractIds: [],
      cleanGrossEnvelopeCr: HUNTER_ORIGIN_CLEAN_GROSS_ENVELOPE_CR,
      completionRewardCr: HUNTER_ORIGIN_REWARD.credits,
      attemptHaircuts: [],
      elapsedS: 0,
    },
    liveSeams: [
      'careerOrigins.accept → missions.postAndAcceptAuthoredOffer',
      'nav.waypoint mission-objective markers',
      'missions entity:killed → _completeMission → economy:grantCredits',
      'economy ui:service repair (SERVICE_PRICES.repairCrPerHp)',
      'origin retry via reoffer/postRoute attempt haircut',
      'save.serializeData → save._restore careerOrigins/missions slice',
      'missions.ensureBoard/acceptMission bounty_hunt continuation',
    ],
    authorityReceipts: [],
    loops: [],
    bottlenecks: [],
    adaptersUsed: [
      {
        code: 'travel_ttk_adapter',
        note: 'Travel duration from sector positions / MISSION_TUNING.cruiseSpeedRef',
      },
      {
        code: 'combat_ttk_adapter',
        note: 'Fight duration from enemy EHP / owned weapon DPS; full combat AI not stepped',
      },
    ],
    defects: [],
    saveProof: null,
    equipment: {
      activePhase: 'starter',
      roleKitId: ORIGIN_ROLE_KITS.hunter.defId,
      currentShipId: NEW_GAME.shipId,
      weaponId: weapon && weapon.id,
    },
  };

  // Dock + accept Hunter origin through public career event path.
  ctx.bus.emit('dock:docked', { stationId: HOME_STATION_ID });
  advanceTime(ctx, DOCK_OVERHEAD_S, budget, 'actionS');
  const accept = ctx.origins.accept('hunter');
  if (!accept || !accept.ok) {
    receipt.defects.push(`origin_accept_failed:${accept && accept.reason || 'unknown'}`);
    return finalize(receipt, ctx, costs, budget, horizonS);
  }
  markAuthority(receipt, {
    kind: 'origin_accept',
    careerId: 'hunter',
    missionId: accept.missionId || null,
    atS: round1(ctx.state.simTime),
    authority: 'careerOrigins.accept → missions.postAndAcceptAuthoredOffer',
  });

  let currentSectorId = ctx.state.world.currentSectorId;
  let originWritIndex = 0;
  let boardLoop = 0;
  let retriedFirstWrit = false;

  // ---- ORIGIN CHAIN (timed, navigated, damage-bearing) -----------------------
  while (ctx.state.simTime < horizonS) {
    const route = ctx.state.careers.origins.__meta.routes.hunter;
    if (!route || route.status === 'completed') break;
    if (route.status === 'recovering') {
      const re = ctx.origins.reoffer('hunter');
      if (!re || !re.ok) {
        receipt.bottlenecks.push({ code: 'reoffer_failed', detail: re && re.reason });
        advanceTime(ctx, 30, budget, 'idleS');
        continue;
      }
      markAuthority(receipt, {
        kind: 'origin_reoffer',
        attempt: route.attempt,
        atS: round1(ctx.state.simTime),
        authority: 'careerOrigins.reoffer → postRouteContract',
      });
    }

    const mission = activeMission(ctx);
    if (!mission || mission.type !== 'bounty_hunt') {
      receipt.defects.push('origin_mission_missing');
      break;
    }
    const def = CAREER_ORIGIN_CONTRACTS.hunter[route.contractIndex];
    if (!def) break;

    // Objective navigation proof before travel.
    const wpBefore = ctx.state.nav && ctx.state.nav.waypoint;
    if (!wpBefore || wpBefore.markerKind !== 'mission-objective') {
      receipt.defects.push(`missing_objective_marker:${def.id}`);
    }

    const destSectorId = mission.destSectorId || def.destSectorId;
    const legOut = travelTimeS(currentSectorId, destSectorId) + COMBAT_APPROACH_S;
    if (ctx.state.simTime + legOut > horizonS) break;
    const moveOut = tryTravel(ctx, {
      fromSectorId: currentSectorId,
      toSectorId: destSectorId,
      travelS: legOut,
      reason: `gate_toll:hunter_origin:${def.id}:out`,
      seed,
      costs,
      budget,
    });
    if (!moveOut.ok) {
      receipt.bottlenecks.push({ code: 'unaffordable_toll', detail: `origin ${def.id} out` });
      break;
    }
    currentSectorId = destSectorId;

    const contact = ensureBountyTarget(ctx, mission);
    if (!contact || !contact.alive) {
      receipt.defects.push(`origin_target_missing:${def.id}`);
      break;
    }
    // Re-check navigation latch after sector enter / spawn.
    const wp = ctx.state.nav && ctx.state.nav.waypoint;
    if (wp) {
      if (wp.markerId && def.id && !String(wp.markerId).includes(def.id)
        && wp.missionId !== mission.id) {
        receipt.bottlenecks.push({ code: 'waypoint_marker_drift', detail: wp.markerId });
      }
    }

    const fightS = fightDurationS(weapon, contact, mission);
    advanceTime(ctx, fightS, budget, 'actionS');
    const damageTaken = enemyReturnDps(contact, mission) * fightS * REPAIR_FRAC_OF_DAMAGE;
    const damageInfo = applyCombatDamage(ctx, contact, damageTaken, receipt);

    // Forced retry on first writ once: abandon → recovering → reoffer with haircut.
    if (forceRetryOnFirstWrit && !retriedFirstWrit && originWritIndex === 0 && route.attempt === 0) {
      retriedFirstWrit = true;
      const rewardBeforeHaircut = mission.reward_cr | 0;
      const abandoned = typeof ctx.missions.abandonMission === 'function'
        && ctx.missions.abandonMission(mission.id) === true;
      const routeAfter = ctx.state.careers.origins.__meta.routes.hunter;
      if (!abandoned || !routeAfter || routeAfter.status !== 'recovering'
        || routeAfter.activeMissionId != null || (routeAfter.attempt | 0) < 1) {
        receipt.defects.push('mission_failure_route_link_missing');
        break;
      }
      receipt.failedContracts += 1;
      advanceTime(ctx, DOCK_OVERHEAD_S, budget, 'recoveryS');
      // Return home for reissue.
      if (currentSectorId !== HOME_SECTOR_ID) {
        const homeLeg = travelTimeS(currentSectorId, HOME_SECTOR_ID) + DOCK_OVERHEAD_S;
        const homeMove = tryTravel(ctx, {
          fromSectorId: currentSectorId,
          toSectorId: HOME_SECTOR_ID,
          travelS: homeLeg,
          reason: 'gate_toll:hunter_origin:retry_home',
          seed,
          costs,
          budget,
        });
        if (homeMove.ok) currentSectorId = HOME_SECTOR_ID;
      }
      ctx.bus.emit('dock:docked', { stationId: HOME_STATION_ID });
      const repairInfo = repairAtDock(ctx, costs, budget, receipt, {
        minCreditsAfter: 250,
        readinessGate: 0.72,
      });
      let re = { ok: true, source: 'dock_reissue' };
      let reMission = activeMission(ctx);
      // Dock is the public reissue seam. Call the authority directly only if no dock subscriber
      // posted the replacement mission.
      if (!reMission && ctx.state.careers.origins.__meta.routes.hunter.status === 'recovering') {
        re = ctx.origins.reoffer('hunter');
        reMission = activeMission(ctx);
      }
      const haircutReward = reMission ? (reMission.reward_cr | 0) : 0;
      const routeRetry = ctx.state.careers.origins.__meta.routes.hunter;
      receipt.origin.attemptHaircuts.push({
        contractId: def.id,
        attempt: routeRetry.attempt | 0,
        rewardBefore: rewardBeforeHaircut,
        rewardAfter: haircutReward,
        reofferOk: !!(reMission && haircutReward > 0 && haircutReward < rewardBeforeHaircut),
      });
      markAuthority(receipt, {
        kind: 'origin_retry',
        contractId: def.id,
        rewardBefore: rewardBeforeHaircut,
        rewardAfter: haircutReward,
        atS: round1(ctx.state.simTime),
        authority: 'missions.abandon + careerOrigins.reoffer (attempt haircut)',
      });
      receipt.loops.push({
        phase: 'origin',
        contractId: def.id,
        outcome: 'retry_reissue',
        t: round1(ctx.state.simTime),
        reward: 0,
        hullDamage: round1(damageInfo.hullDamage),
        repairSpent: repairInfo.spent,
        readiness: round2(repairInfo.readiness),
      });
      continue;
    }

    const kill = completeBountyViaKill(ctx, mission, receipt);
    const paid = kill.reward || 0;
    if (!kill.ok) {
      receipt.failedContracts += 1;
      receipt.defects.push(`origin_settle_failed:${def.id}`);
      break;
    }
    receipt.completedContracts += 1;
    markAuthority(receipt, {
      kind: 'mission_complete',
      type: 'bounty_hunt',
      id: mission.id,
      originContractId: def.id,
      reward: paid,
      atS: round1(ctx.state.simTime),
      authority: 'missions._onKill→_completeMission→economy:grantCredits',
    });
    receipt.loops.push({
      phase: 'origin',
      contractId: def.id,
      outcome: 'completed',
      t: round1(ctx.state.simTime),
      reward: paid,
      fightS: round1(fightS),
      travelS: round1(legOut),
      hullDamage: round1(damageInfo.hullDamage),
      repairSpent: 0,
      readiness: round2(damageInfo.readiness),
      markerId: wp && wp.markerId,
      targetId: kill.targetId,
      attempt: route.attempt | 0,
    });

    if (currentSectorId !== HOME_SECTOR_ID) {
      const homeLeg = travelTimeS(currentSectorId, HOME_SECTOR_ID) + DOCK_OVERHEAD_S;
      if (ctx.state.simTime + homeLeg <= horizonS) {
        const homeMove = tryTravel(ctx, {
          fromSectorId: currentSectorId,
          toSectorId: HOME_SECTOR_ID,
          travelS: homeLeg,
          reason: `gate_toll:hunter_origin:${def.id}:home`,
          seed,
          costs,
          budget,
        });
        if (homeMove.ok) currentSectorId = HOME_SECTOR_ID;
      }
    }
    let repairInfo = { spent: 0, readiness: damageInfo.readiness };
    if (currentSectorId === HOME_SECTOR_ID) {
      ctx.bus.emit('dock:docked', { stationId: HOME_STATION_ID });
      repairInfo = repairAtDock(ctx, costs, budget, receipt, {
        minCreditsAfter: 250,
        readinessGate: 0.72,
      });
    }
    const completedLoop = receipt.loops[receipt.loops.length - 1];
    if (completedLoop && completedLoop.contractId === def.id) {
      completedLoop.hullDamage = round1(damageInfo.hullDamage);
      completedLoop.repairSpent = repairInfo.spent;
      completedLoop.readiness = round2(repairInfo.readiness);
    }

    if (captureSaveAfterOriginWrit === originWritIndex && !receipt.saveProof) {
      receipt.saveProof = saveRoundTrip(ctx);
      if (receipt.saveProof.ok && receipt.saveProof.restoredCtx) {
        // Continue from restored authority so save is load-bearing for the rest of the route.
        Object.assign(ctx, {
          sim: receipt.saveProof.restoredCtx.sim,
          state: receipt.saveProof.restoredCtx.state,
          bus: receipt.saveProof.restoredCtx.bus,
          econ: receipt.saveProof.restoredCtx.econ,
          ships: receipt.saveProof.restoredCtx.ships,
          factions: receipt.saveProof.restoredCtx.factions,
          missions: receipt.saveProof.restoredCtx.missions,
          origins: receipt.saveProof.restoredCtx.origins,
          save: receipt.saveProof.restoredCtx.save,
          combat: receipt.saveProof.restoredCtx.combat,
          seed: receipt.saveProof.restoredCtx.seed,
          hullDamageHp: receipt.saveProof.restoredCtx.hullDamageHp,
          currentShipId: receipt.saveProof.restoredCtx.currentShipId,
          routeHorizonS: receipt.saveProof.restoredCtx.routeHorizonS,
        });
        currentSectorId = ctx.state.world.currentSectorId;
      }
      if (receipt.saveProof) delete receipt.saveProof.restoredCtx;
    }

    originWritIndex += 1;
    // Dock overhead between writs when still on the origin chain.
    const routeNow = ctx.state.careers.origins.__meta.routes.hunter;
    if (routeNow && routeNow.status !== 'completed') {
      advanceTime(ctx, DOCK_OVERHEAD_S * 0.5, budget, 'actionS');
    }
  }

  const originRoute = ctx.state.careers?.origins?.__meta?.routes?.hunter;
  receipt.origin.status = originRoute?.status || 'unknown';
  receipt.origin.completedContractIds = originRoute
    ? [...(originRoute.completedContractIds || [])]
    : [];
  receipt.origin.elapsedS = round1(budget.simS);
  receipt.origin.upgradeReceipt = ctx.state.careers?.origins?.__meta?.upgradeReceipts?.hunter || null;

  // ---- BOARD CONTINUATION for remaining horizon ------------------------------
  while (ctx.state.simTime < horizonS) {
    const wallet = ctx.state.player.credits | 0;
    let bountyHit = findBoardOffer(ctx, 'bounty_hunt', HUNTER_BOARD_STATIONS, {
      preferSectorId: currentSectorId,
      fromSectorId: currentSectorId,
      maxCredits: wallet,
      seed,
    });
    if (!bountyHit) {
      advanceTime(ctx, (MISSION_TUNING.refreshSec || 600) + 1, budget, 'idleS');
      bountyHit = findBoardOffer(ctx, 'bounty_hunt', HUNTER_BOARD_STATIONS, {
        preferSectorId: currentSectorId,
        fromSectorId: currentSectorId,
        maxCredits: ctx.state.player.credits | 0,
        seed,
      });
    }
    if (!bountyHit) {
      receipt.bottlenecks.push({ code: 'no_bounty_board', detail: `t=${round1(ctx.state.simTime)}` });
      advanceTime(ctx, 60, budget, 'idleS');
      if ((ctx.state.player.credits | 0) < 50) break;
      // Prevent infinite spin if board never yields.
      if (budget.idleS > horizonS * 0.4) break;
      continue;
    }

    const boardSectorId = STATION_TO_SECTOR.get(bountyHit.stationId)?.id || currentSectorId;
    if (boardSectorId !== currentSectorId) {
      const boardLeg = travelTimeS(currentSectorId, boardSectorId) + DOCK_OVERHEAD_S;
      if (ctx.state.simTime + boardLeg > horizonS) break;
      const boardMove = tryTravel(ctx, {
        fromSectorId: currentSectorId,
        toSectorId: boardSectorId,
        travelS: boardLeg,
        reason: `gate_toll:hunter_board:${boardLoop}:board`,
        seed,
        costs,
        budget,
      });
      if (!boardMove.ok) {
        receipt.bottlenecks.push({ code: 'unaffordable_toll', detail: 'board station' });
        advanceTime(ctx, 45, budget, 'idleS');
        continue;
      }
      currentSectorId = boardSectorId;
    }
    ctx.bus.emit('dock:docked', { stationId: bountyHit.stationId });
    const mission = acceptBoardOffer(ctx, bountyHit.offer.id, costs, receipt);
    if (!mission || mission.type !== 'bounty_hunt') {
      receipt.bottlenecks.push({ code: 'bounty_accept_failed', detail: bountyHit.offer.id });
      advanceTime(ctx, 30, budget, 'idleS');
      continue;
    }
    markAuthority(receipt, {
      kind: 'mission_accept',
      type: 'bounty_hunt',
      id: mission.id,
      reward_cr: mission.reward_cr,
      atS: round1(ctx.state.simTime),
      authority: 'missions.acceptMission',
    });

    const destSectorId = mission.destSectorId || 'sector_ceres_belt';
    const legOut = travelTimeS(currentSectorId, destSectorId) + COMBAT_APPROACH_S;
    if (ctx.state.simTime + legOut > horizonS) break;
    const moveOut = tryTravel(ctx, {
      fromSectorId: currentSectorId,
      toSectorId: destSectorId,
      travelS: legOut,
      reason: `gate_toll:hunter_board:${boardLoop}:out`,
      seed,
      costs,
      budget,
    });
    if (!moveOut.ok) {
      if (ctx.missions.abandonMission) ctx.missions.abandonMission(mission.id);
      receipt.failedContracts += 1;
      receipt.bottlenecks.push({ code: 'unaffordable_toll', detail: 'board outbound' });
      advanceTime(ctx, 45, budget, 'idleS');
      continue;
    }
    currentSectorId = destSectorId;

    boardLoop += 1;
    const contact = ensureBountyTarget(ctx, mission);
    const fightS = fightDurationS(weapon, contact, mission);
    advanceTime(ctx, fightS, budget, 'actionS');
    const damageTaken = enemyReturnDps(contact, mission) * fightS * REPAIR_FRAC_OF_DAMAGE;
    const damageInfo = applyCombatDamage(ctx, contact, damageTaken, receipt);

    let success = true;
    let reward = 0;
    if (forceBoardFailureAt > 0 && boardLoop === forceBoardFailureAt) {
      success = false;
      if (ctx.missions.abandonMission) ctx.missions.abandonMission(mission.id);
      receipt.failedContracts += 1;
    } else {
      const res = completeBountyViaKill(ctx, mission, receipt);
      reward = res.reward;
      if (res.ok) {
        receipt.completedContracts += 1;
        markAuthority(receipt, {
          kind: 'mission_complete',
          type: 'bounty_hunt',
          id: mission.id,
          reward,
          atS: round1(ctx.state.simTime),
          authority: 'missions._onKill→_completeMission→economy:grantCredits',
        });
      } else {
        success = false;
        receipt.failedContracts += 1;
        if (ctx.missions.abandonMission) ctx.missions.abandonMission(mission.id);
      }
    }

    let homeReached = currentSectorId === HOME_SECTOR_ID;
    if (!homeReached) {
      const legHome = travelTimeS(currentSectorId, HOME_SECTOR_ID) + DOCK_OVERHEAD_S;
      if (ctx.state.simTime + legHome <= horizonS) {
        const moveHome = tryTravel(ctx, {
          fromSectorId: currentSectorId,
          toSectorId: HOME_SECTOR_ID,
          travelS: legHome,
          reason: `gate_toll:hunter_board:${boardLoop}:home`,
          seed,
          costs,
          budget,
        });
        if (moveHome.ok) {
          currentSectorId = HOME_SECTOR_ID;
          homeReached = true;
        }
      }
    }
    let repairInfo = { spent: 0, readiness: damageInfo.readiness };
    if (homeReached) {
      ctx.bus.emit('dock:docked', { stationId: HOME_STATION_ID });
      repairInfo = repairAtDock(ctx, costs, budget, receipt, {
        minCreditsAfter: 400,
        readinessGate: 0.65,
      });
    }

    receipt.loops.push({
      phase: 'board',
      loop: boardLoop,
      outcome: success ? 'completed' : 'failed',
      t: round1(ctx.state.simTime),
      reward: success ? reward : 0,
      fightS: round1(fightS),
      hullDamage: round1(damageInfo.hullDamage),
      repairSpent: repairInfo.spent,
      readiness: round2(repairInfo.readiness),
      missionId: mission.id,
      creditsAfter: ctx.state.player.credits | 0,
    });
    receipt.completedLoops = boardLoop;
    if (!homeReached) break;
  }

  advanceTime(ctx, horizonS - ctx.state.simTime, budget, 'idleS');
  return finalize(receipt, ctx, costs, budget, horizonS);
}

function finalize(receipt, ctx, costs, budget, horizonS) {
  const endingCapital = ctx.state.player.credits | 0;
  const netCredits = endingCapital - receipt.startingCapital;
  const earnedValue = netCredits + (receipt.purchaseSpend || 0) + (costs.researchSpend || 0);
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

  const fails = [];
  const warns = [];

  if (receipt.defects.length) fails.push(...receipt.defects.map((d) => `defect:${d}`));
  if (receipt.origin.status !== 'completed' && horizonS >= 15 * 60) {
    fails.push(`origin_incomplete:${receipt.origin.status}`);
  }
  if (!(receipt.time.travelS > 0)) fails.push('travel_time_not_accounted');
  if (!(receipt.time.actionS > 0)) fails.push('action_time_not_accounted');
  if (Math.abs(receipt.time.simS - horizonS) > 0.1) {
    fails.push(`time_authority_mismatch simS=${receipt.time.simS} horizon=${horizonS}`);
  }
  if (!(receipt.repairCost > 0)) fails.push('repair_cost_missing');
  if (!(receipt.failedContracts > 0)) fails.push('retry_or_board_failure_missing');
  if (!(receipt.missionProceeds > 0)) fails.push('mission_proceeds_missing');
  if (!receipt.authorityReceipts.some((a) => a.kind === 'mission_complete'
    && a.reward > 0 && /missions/i.test(a.authority || ''))) {
    fails.push('missions_economy_authority_missing');
  }
  if (!receipt.authorityReceipts.some((a) => a.kind === 'combat_damage'
    && a.hullDamage > 0 && a.damageEvents > 0)) {
    fails.push('combat_damage_authority_missing');
  }
  if (!receipt.authorityReceipts.some((a) => a.kind === 'repair_service'
    && a.spent > 0)) {
    fails.push('repair_service_authority_missing');
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

  if (receipt.creditsPerMin < HUNTER_DEAD_CR_PER_MIN) {
    fails.push(`dead_income ${receipt.creditsPerMin} < ${HUNTER_DEAD_CR_PER_MIN}`);
  } else if (receipt.creditsPerMin < HUNTER_HEALTHY_CR_PER_MIN) {
    fails.push(`below_healthy_band ${receipt.creditsPerMin} < ${HUNTER_HEALTHY_CR_PER_MIN}`);
  }

  // Gross origin envelope remains the clean-pass authored ceiling after haircut + repair.
  if (receipt.origin.status === 'completed') {
    const originRewards = receipt.loops
      .filter((l) => l.phase === 'origin' && l.outcome === 'completed')
      .reduce((s, l) => s + (l.reward || 0), 0);
    if (!(originRewards > 0)) fails.push('origin_rewards_missing');
  }

  receipt.assertionFails = fails;
  receipt.assertionWarns = warns;
  receipt.ok = fails.length === 0;
  return receipt;
}

/** Run independent 30/60/90 public-route measurements. */
export function measureHunterPublicRouteHorizons(options = {}) {
  const horizons = options.horizonsMin || HUNTER_ROUTE_HORIZONS_MIN;
  const seed = (options.seed != null ? options.seed : HUNTER_PUBLIC_ROUTE_SEED) >>> 0;
  const cells = {};
  const table = [];
  for (const minutes of horizons) {
    const receipt = runHunterPublicRoute({
      ...options,
      seed,
      horizonMin: minutes,
    });
    cells[minutes] = receipt;
    table.push({
      career: 'hunter',
      minutes,
      seed: receipt.seed,
      credits: receipt.endingCapital,
      earnedValue: receipt.earnedValue,
      creditsPerMin: receipt.creditsPerMin,
      missionProceeds: receipt.missionProceeds,
      completedContracts: receipt.completedContracts,
      failedContracts: receipt.failedContracts,
      repairCost: receipt.repairCost,
      tollCost: receipt.tollCost,
      simS: receipt.time.simS,
      travelS: receipt.time.travelS,
      actionS: receipt.time.actionS,
      damageReceipts: receipt.authorityReceipts.filter((row) => row.kind === 'combat_damage').length,
      repairReceipts: receipt.authorityReceipts.filter((row) => row.kind === 'repair_service').length,
      retryHaircut: receipt.origin.attemptHaircuts[0] || null,
      originStatus: receipt.origin.status,
      originElapsedS: receipt.origin.elapsedS,
      ok: receipt.ok,
      assertionFails: receipt.assertionFails,
    });
  }
  const ok = table.every((row) => row.ok);
  return {
    schema: HUNTER_PUBLIC_ROUTE_SCHEMA,
    seed,
    ok,
    healthyFloorCrPerMin: HUNTER_HEALTHY_CR_PER_MIN,
    deadFloorCrPerMin: HUNTER_DEAD_CR_PER_MIN,
    cleanGrossEnvelopeCr: HUNTER_ORIGIN_CLEAN_GROSS_ENVELOPE_CR,
    table,
    cells,
  };
}
