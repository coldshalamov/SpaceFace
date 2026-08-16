// combat system: the damage pipeline (shield→armor→hull), shield/cap regen, death + loot +
// player respawn, and enemy spawn builders. Consumes projectile:hit from physics (ARCHITECTURE §2.3
// step 8, §4.4). Single source of health mutation for ships/stations/drones.
import { WEAPONS } from '../data/weapons.js';
import { ENEMY_TYPES } from '../data/enemies.js';
import { SHIPS } from '../data/ships.js';
import { MODULES } from '../data/modules.js';
import { makeShipEntitySpec, fittingsFromWeapons } from './ships.js';
import { removeCargo } from './cargo.js';
import { hash32 } from '../core/rng.js';
import { getCombatKernel } from '../combat/kernel.js';
import { legacyHitToDamagePacket, scalarHitToDamagePacket } from '../combat/damage.js';
import {
  applyStyleMultiplier,
  classifyKillCause,
  styleMultiplierOf,
} from '../combat/killCause.js';
import { createVictimRewardRng, missionOwnsReward } from '../combat/rewardEligibility.js';
import { triggerEmberCookOff } from '../combat/cookOff.js';
import { isTumbling } from '../combat/tumbleStatus.js';
import { queryNearbyEntities } from '../core/spatialQuery.js';
import { combatFlag } from '../data/featureFlags.js';
import { weakPointForEntity, isHitInWeakArc } from '../data/weakPoints.js';
import { heavyPartRecipeForEnemy } from '../data/heavyFamily.js';
import { buildDefeatReceipt, buildRecoveryPlan } from '../combat/playerDefeat.js';
import { normalizeActivity, normalizeRoe, roeForActivity } from '../ai/doctrine.js';
import {
  CombatDoctrineId,
  DOCTRINE_TELEGRAPH_TICKS,
  normalizeCombatDoctrineId,
} from '../ai/combatDoctrine.js';
import { MIN_AI_RESPONSE_WINDOW_S } from '../ai/engagementAuthority.js';
import { contactGrammarFor } from '../data/factionContactGrammar.js';
import { sampleFactionBehavior } from '../data/factionDoctrines.js';
import { isHostileToPlayer } from './scanner.js';

const WPN = new Map(WEAPONS.map((w) => [w.id, w]));
const ENEMY = new Map(ENEMY_TYPES.map((e) => [e.id, e]));
const SHIP = new Map(SHIPS.map((s) => [s.id, s]));
const MOD = new Map(MODULES.map((m) => [m.id, m]));
const CARGO_LOSS_RATE = 0.5;
// Massline whip damage (rung 14, flag combat.whipDamage): a solid/crushing whip-impact routes
// momentum-scaled kinetic damage to the struck body. Tuning knobs, not physics — the momentum
// number comes from masslineImpacts' record (mass × relSpeed).
const WHIP_DAMAGE_TYPES = new Set(['ship', 'station', 'drone']);
const WHIP_DAMAGE_MOMENTUM_SCALE = 1 / 1600; // 640-mass rock at 60 wu/s (solid) -> 24 damage
const WHIP_DAMAGE_MAX = 45;                  // ceiling for the heaviest slings
const RECOVERY_BERTH_CLEARANCE_WU = 140;
/** Seconds of invulnerability after undock / soft respawn window extension (overnight B1). */
export const UNDOCK_INVULN_S = 8;
const BASE_AI_CAPABILITIES = Object.freeze(['drive', 'sensor', 'weapon']);
const KILL_PRESENTATION_CAUSES = new Set([
  'generic',
  'kinetic',
  'explosive',
  'terrain_collision',
  'ship_collision',
]);
const KILL_PRESENTATION_SURFACES = new Set(['terrain', 'craft', 'structure']);
const BEAM_QUERY_RADIUS_PAD = 256;
const ARCHETYPE_TACTICAL_CAPABILITIES = Object.freeze({
  swarmer: Object.freeze(['counter_tether_overload', 'ranged', 'screen']),
  sniper: Object.freeze(['ranged']),
  brawler: Object.freeze(['disable', 'ranged']),
  fleeing_trader: Object.freeze(['ranged', 'screen']),
  pirate: Object.freeze(['counter_tether_overload', 'ranged', 'screen']),
  miniboss_capital: Object.freeze(['disable', 'ranged', 'screen']),
});

function factionBehaviorForCombatSpawn(factionId, opts = {}) {
  const seedBase = Number.isFinite(opts.doctrineSeed)
    ? opts.doctrineSeed
    : (Number.isFinite(opts.startedTick) ? opts.startedTick : 0);
  return sampleFactionBehavior(
    factionId,
    hash32(seedBase, factionId, 'combat-spawn-doctrine'),
    1,
  )[0] || null;
}

/**
 * Resolve an enemy archetype's authored combat stats.
 *
 * Encounter level is deliberately absent from this calculation: Plan 11 makes difficulty a
 * composition/geometry/timing decision, never hidden HP or damage inflation on the same hull.
 * The level remains available to encounter and presentation owners (for example visualTier).
 */
export function scaleCombatant(def, _level) {
  return {
    hull: Math.round(def?.hull || 100),
    armor: Math.round(def?.armor || 0),
    shield: Math.round(def?.shield || 0),
    dmgMult: 1,
  };
}

function resolveEnemyWeapon(w, slotIndex) {
  const base = WPN.get(w.id);
  if (!base) return null;
  // Phase 2 hardpoint fields: enemy ships have no per-hull facing data, so default front + the
  // standard fixed-gun gimbal arc (they gimbal toward their AI lead angle, like the player does).
  // An enemy entry may force a turret mount via w.turret:true (e.g. capital boss broadside beams).
  const isTurret = base.tracking === 'auto_turret' || !!w.turret;
  const isHoming = base.tracking === 'homing';
  const facing = isTurret ? 'turret' : 'front';
  const turretArcDeg = Number.isFinite(w.turretArcDeg) ? w.turretArcDeg : (base.turretArcDeg || 180);
  const gimbalArc = isTurret ? turretArcDeg * Math.PI / 180
    : (isHoming ? Math.PI : 22 * Math.PI / 180);
  return {
    ...base, slotIndex, defId: w.id,
    facing, facingAngle: facing === 'turret' ? 0 : 0, gimbalArc,
    muzzleOffset: [0.8, 0],
    dmg: w.dmgOverride ?? base.dmg,
    rof: w.rofOverride ?? base.rof,
    projSpeed: w.projSpeedOverride ?? base.projSpeed,
    range: w.rangeOverride ?? base.range,
    spread: base.spreadDeg ?? 0,
    tracking: isTurret ? 'auto_turret' : (base.tracking || 'fixed'),
    arc: isTurret ? { turret: turretArcDeg } : 'fixed',
    heatMax: base.heatMax ?? 100, lockTimeS: base.lockTimeS ?? 0,
    _cooldown: 0, _heat: 0,
  };
}

/** Build a spawnEntity spec for a hostile NPC (team 1) from an enemy archetype id. */
// Weapon capacitor regen boost for the player — same ~15% faster recharge as weapons.js heat pacing.
const WEAPON_CAP_REGEN_MULT = 1.15;

export function makeEnemySpawnSpec(enemyTypeId, level, pos, opts = {}) {
  const def = ENEMY.get(enemyTypeId) || ENEMY_TYPES[0];
  level = level || (def.levelRange ? def.levelRange[0] : 1);
  const s = scaleCombatant(def, level);
  // Faction identity is READABILITY only (radar/HUD color + kill-rep target) — hostility is decided
  // by team/archetype/context in scanner.isHostileToPlayer, never by factionId. Precedence:
  //   caller override (a zone's owning faction) > archetype's own faction > lawful/hostile fallback.
  // The old code tagged EVERY hostile as faction_vael, so a Crimson Reach pirate read as a green alien.
  const factionId = opts.factionId || def.factionId || (def.factionLawful ? 'faction_scn' : 'faction_reach');
  const factionBehavior = factionBehaviorForCombatSpawn(factionId, opts);
  const spec = makeShipEntitySpec(def.shipId, { team: 1, factionId, pos, ai: { archetype: def.aiArchetype } });
  spec.hull = spec.hullMax = s.hull;
  spec.armorHp = spec.armorMax = s.armor;
  spec.armorFlat = def.armorFlat || 0;
  spec.shield = spec.shieldMax = s.shield;
  // Only advanced hulls mount regenerating deflectors; cheap early enemies have static shields.
  spec.shieldRegenRate = def.shieldRegenCapable ? (def.shieldRegen || 0) : 0;
  spec.shieldRegenDelay = def.shieldRegenDelay || 3;
  spec.cap = spec.capMax = def.cap || 80;
  spec.capRegen = def.capRegen || 20;
  if (def.maxSpeed) spec.maxSpeed = def.maxSpeed;
  if (def.accel) spec.thrust = def.accel;
  if (def.turnRate) spec.turnRate = def.turnRate;
  if (def.collisionRadius) spec.radius = def.collisionRadius;
  if (def.mass) spec.mass = def.mass;
  spec.drag = spec.drag || 1.25;
  // Expand weapon entries by their declared count so a boss that lists {id,count:4} actually gets 4
  // independent weapon instances (each with its own cooldown/heat), not 1. (Phase-2 audit fix.)
  const ws = [];
  {
    let idx = 0;
    for (const w of (def.weapons || [])) {
      const n = Math.max(1, w.count || 1);
      for (let k = 0; k < n; k++) {
        const rw = resolveEnemyWeapon(w, idx++);
        if (rw) ws.push(rw);
      }
    }
  }
  spec.data = spec.data || {};
  if (ws.length) spec.data.weapons = ws;
  // Keep the render-facing fittings in sync with the NPC's assigned weapons so its barrels render
  // at the right hardpoints (combat bypasses the fittings path that the player shipyard uses).
  const shipDef = SHIP.get(def.shipId) || SHIPS.find((s) => s.id === def.shipId);
  if (shipDef) spec.data.fittings = fittingsFromWeapons(shipDef, ws);
  // Visual tier scales with danger level: a tougher enemy (higher level) reads as an upgraded Mk.II/III
  // hull so higher-danger zones are visibly more threatening. Maps level→minTier thresholds (≈Mk.II at
  // L6, Mk.III at L12). Player ships are unaffected (they sum their own fitted module tiers).
  spec.data.visualTier = Math.max(0, Math.round((level - 1) * 1.8));
  spec.data.miningBeam = null;
  spec.data.ai = {
    archetype: def.aiArchetype,
    // D1: faction identity is now behavior identity too. The sampled profile drives pursuit,
    // preferred range, formation, retreat, and nonlethal finish rules in the production AI stack.
    // The enemy archetype keeps owning its close tactical verb below (ram/flyby/tether/ranged).
    factionPresenceDoctrine: factionBehavior,
    combatDoctrineId: normalizeCombatDoctrineId(def.combatDoctrineId),
    lawful: !!def.factionLawful,
    capabilities: tacticalCapabilitiesFor(def),
    // Every armed actor carries an inspectable reason for escalation. Encounter/mission callers
    // may replace these defaults with their authored demand; the fallback still fails legibly
    // instead of producing an anonymous team-1 murder-top.
    motive: opts.motive || (def.factionLawful ? 'law_enforcement' : 'assigned_interdiction'),
    engagementTrigger: opts.engagementTrigger || opts.trigger
      || (def.factionLawful ? 'wanted_status' : 'authorized_hostile_spawn'),
    zoneId: opts.zoneId || 'sector_hostile_zone',
    approachTelegraph: opts.approachTelegraph || doctrineTelegraphFor(def.combatDoctrineId),
    noFireResponseWindowS: Number.isFinite(opts.noFireResponseWindowS)
      ? Math.max(MIN_AI_RESPONSE_WINDOW_S, opts.noFireResponseWindowS)
      : Math.max(MIN_AI_RESPONSE_WINDOW_S, DOCTRINE_TELEGRAPH_TICKS / 60),
  };
  const doctrine = defaultDoctrineFor(def, pos, opts.startedTick);
  spec.data.ai.activity = doctrine.activity;
  spec.data.ai.roe = doctrine.roe;
  spec.data.bountyCr = def.bountyCr || 0;
  spec.data.loot = def.loot || null;
  spec.data.lootTableId = def.id;
  spec.data.shipClass = def.shipClass || 'fighter';
  if (def.killRewardTier) spec.data.killRewardTier = def.killRewardTier;
  if (def.reinforcements) spec.data.reinforcements = { ...def.reinforcements };
  spec.data.level = level;
  // Enemy silhouette override (graphics spec Workstream D): when present, the render track
  // draws the enemy as its OWN hostile family instead of the player ship-def's family. Gameplay
  // stats still come from shipId; only the appearance changes.
  if (def.silhouette) spec.data.silhouette = def.silhouette;
  // Ecology roles: durable telegraph + counter hints for HUD/comms (presentation consumers).
  if (def.telegraph) spec.data.telegraph = { ...def.telegraph };
  if (def.counterHint) spec.data.counterHint = def.counterHint;
  if (def.fieldAnchor) spec.data.fieldAnchor = { ...def.fieldAnchor };
  if (def.terrainAmbush) spec.data.terrainAmbush = { ...def.terrainAmbush };
  if (def.deathCookOff) spec.data.deathCookOff = { ...def.deathCookOff };
  if (def.mediumSetup) spec.data.mediumSetup = { ...def.mediumSetup };
  if (def.heavyFightShape) {
    spec.data.heavyFightShape = { ...def.heavyFightShape };
    if (def.heavyFightShape.ramPlate === true) {
      spec.data.intent = { ...(spec.data.intent || {}), ramPlate: true };
    }
  }
  if (def.visibleRetreat) spec.data.visibleRetreat = { ...def.visibleRetreat };
  const heavyPartRecipe = heavyPartRecipeForEnemy(def.id);
  if (heavyPartRecipe && heavyPartRecipe.id === def.heavyPartRecipeId) {
    // Immutable authored contract only. A later runtime owns mutable part health, detachment and
    // phase state; spawn construction must not manufacture a competing subsystem implementation.
    spec.data.heavyPartRecipeId = heavyPartRecipe.id;
    spec.data.heavyPartRecipe = heavyPartRecipe;
  }
  spec.data.fixedCombatStats = true;
  if (def.telegraph && def.telegraph.cue && !opts.approachTelegraph) {
    // Prefer role cue when doctrine telegraph is generic.
    spec.data.ai.approachTelegraph = def.telegraph.cue;
  }
  // Faction contact grammar (Package D): attach scan/demand/contact words for bark/HUD consumers.
  const grammar = contactGrammarFor(factionId);
  if (grammar) {
    spec.data.contactWord = grammar.contactWord;
    spec.data.demandType = grammar.demandType;
    spec.data.scanPolicy = grammar.scanPolicy;
    spec.data.lootLegality = grammar.lootLegality;
    if (!spec.data.ai.barkSituation && grammar.primaryBark) {
      spec.data.ai.barkSituation = grammar.primaryBark;
    }
  }
  spec.factionId = factionId;
  return spec;
}

function doctrineTelegraphFor(doctrineId) {
  if (doctrineId === CombatDoctrineId.TETHER_CONTROL_RAIDER) return 'attach_spool';
  if (doctrineId === CombatDoctrineId.FIELD_ANCHOR_CONTROLLER) return 'field_spool';
  if (doctrineId === CombatDoctrineId.CAPITAL_BROADSIDE) return 'broadside_charge';
  if (doctrineId === CombatDoctrineId.RANGED_DISENGAGER) return 'weapon_charge';
  return 'engine_flare';
}

function tacticalCapabilitiesFor(def) {
  const caps = new Set(BASE_AI_CAPABILITIES);
  if (Array.isArray(def.weapons) && def.weapons.length) caps.add('ranged');
  for (const capability of ARCHETYPE_TACTICAL_CAPABILITIES[def.aiArchetype] || []) caps.add(capability);
  if (def.combatDoctrineId === CombatDoctrineId.TETHER_CONTROL_RAIDER) caps.add('tug');
  if (def.combatDoctrineId === CombatDoctrineId.FIELD_ANCHOR_CONTROLLER) caps.add('screen');
  if (def.factionLawful) caps.add('disable');
  if (def.reinforcements) caps.add('screen');
  if (def.shipClass === 'capital') {
    caps.add('disable');
    caps.add('screen');
  }
  return [...caps].sort();
}

function defaultDoctrineFor(def, pos, startedTick = 0) {
  const profile = def.aiDoctrine || {};
  const activity = normalizeActivity({
    kind: profile.defaultActivity || (def.factionLawful ? 'patrol_route' : 'attack_run'),
    reason: `archetype:${def.id}`,
    anchor: pos || { x: 0, z: 0 },
    leashRadius: profile.leashRadius || 2600,
    preferredRange: profile.preferredRange || 0,
    startedTick: Number.isFinite(startedTick) ? Math.max(0, Math.floor(startedTick)) : 0,
  });
  return {
    activity,
    roe: normalizeRoe(profile.roe, roeForActivity(activity)),
  };
}

function qrange(range, r) { if (!range) return 1; const [lo, hi] = range; return Math.round(lo + (hi - lo) * r()); }

function catalogValue(id) {
  const def = SHIP.get(id) || WPN.get(id) || MOD.get(id);
  if (!def) return 0;
  return Math.max(0, Math.round((def.buyback != null ? def.buyback : def.price) || 0));
}

function setVecXZ(vec, x, z) {
  if (!vec) return;
  if (typeof vec.set === 'function') vec.set(x, 0, z);
  else { vec.x = x; vec.y = 0; vec.z = z; }
}

function activeSectorStations(state) {
  return state && state.world && state.world.activeSector && Array.isArray(state.world.activeSector.stations)
    ? state.world.activeSector.stations
    : [];
}

function stationRecordId(station) {
  if (!station) return null;
  if (station.stationId) return station.stationId;
  return typeof station.id === 'string' && station.id.startsWith('station_') ? station.id : null;
}

function stationRecordFor(state, stationId) {
  if (!stationId) return null;
  return activeSectorStations(state).find((station) => stationRecordId(station) === stationId) || null;
}

function firstActiveStationId(state) {
  for (const station of activeSectorStations(state)) {
    const stationId = stationRecordId(station);
    if (stationId) return stationId;
  }
  const live = firstLiveStation(state);
  return live && live.data && live.data.stationId || null;
}

function liveStationFor(state, stationId) {
  if (!state || !stationId) return null;
  const index = state.entityIndex;
  const indexed = index && index.byStationId && typeof index.byStationId.get === 'function'
    ? index.byStationId.get(stationId)
    : null;
  if (indexed && indexed.alive !== false && indexed.type === 'station') return indexed;
  const stations = index && Array.isArray(index.stations) ? index.stations : null;
  const candidates = stations || state.entityList || [];
  for (const entity of candidates) {
    if (entity && entity.alive !== false && entity.type === 'station' && entity.data && entity.data.stationId === stationId) {
      return entity;
    }
  }
  return null;
}

function firstLiveStation(state) {
  if (!state) return null;
  const stations = state.entityIndex && Array.isArray(state.entityIndex.stations)
    ? state.entityIndex.stations
    : state.entityList || [];
  for (const entity of stations) {
    if (entity && entity.alive !== false && entity.type === 'station' && entity.data && entity.data.stationId) return entity;
  }
  return null;
}

/**
 * Build the transient presentation-only view of a combat-owned death. The receipt is deliberately
 * derived from the lethal packet and live target snapshot; it is never stored on state/entities and
 * it cannot create damage, contact, causality, or a second death path.
 */
export function buildKillPresentationReceipt(state, target, killerId, lethal = {}) {
  const packet = lethal && lethal.packet && typeof lethal.packet === 'object' ? lethal.packet : null;
  const hit = packet && packet.hit && typeof packet.hit === 'object' ? packet.hit : null;
  const collision = collisionPresentationProvenance(lethal, packet);
  const surface = normalizeKillSurface(collision && collision.surface);
  const cause = collision
    ? collisionCause(surface)
    : weaponKillCause(lethal, packet);
  const position = freezeKillPoint(
    collision && collision.position || hit && hit.pos || target && target.pos,
  );
  const direction = freezeKillDirection(
    collision
      ? collision.direction
      : hit && hit.approach || lethal && lethal.direction,
  );
  const normal = freezeKillDirection(
    collision
      ? collision.normal
      : hit && hit.normal || lethal && lethal.normal,
  );
  const targetVelocity = freezeKillPoint(
    collision && collision.targetVelocity || target && target.vel,
  );
  const impact = freezeKillImpact(collision && collision.impact);
  const legacyCause = KILL_PRESENTATION_CAUSES.has(cause) ? cause : 'generic';
  return Object.freeze({
    version: 1,
    cause: legacyCause,
    position,
    direction,
    normal,
    surface,
    targetVelocity,
    playerCaused: !!state && killerId === state.playerId,
    impact,
    // AC-08: the classified style identity rides ALONGSIDE the legacy low-level cause above, which
    // existing VFX still key off. One receipt, two fields, neither repurposed.
    style: classifyKillCause({
      victimId: target && target.id != null ? target.id : null,
      killerId: killerId == null ? null : killerId,
      cause: legacyCause,
      tumbleState: collision
        ? collision.tumble
        // Non-contact deaths carry live tumble truth so the "tumbling ship shot dead in open space"
        // case is decided by the classifier on real state rather than by an absent input.
        : { victim: isTumbling(state, target), source: false },
      impactVelocity: impact ? impact.deltaV : 0,
      zone: killZoneOf(lethal, packet),
      chainDepth: collision ? collision.chainDepth : 0,
    }),
  });
}

/**
 * Execution-zone identity for this death. AC-13 owns the atmosphere/gravity-well producer and will
 * stamp it onto the lethal event or its damage packet source; until then this reads null and the
 * classifier resolves burn-up and well-collapse to ordinary rather than guessing from geometry.
 */
function killZoneOf(lethal, packet) {
  if (lethal && lethal.zone != null) return lethal.zone;
  const source = packet && packet.source;
  if (source && source.zone != null) return source.zone;
  return null;
}

function collisionPresentationProvenance(lethal, packet) {
  const origin = lethal && lethal.origin;
  const source = packet && packet.source;
  if (!origin || origin.kind !== 'collision' || !source || typeof source.kind !== 'string'
    || !source.kind.startsWith('collision_')) return null;
  const value = source.collisionPresentation;
  return value && typeof value === 'object' ? value : null;
}

function collisionCause(surface) {
  if (surface === 'craft') return 'ship_collision';
  if (surface === 'terrain' || surface === 'structure') return 'terrain_collision';
  return 'generic';
}

function weaponKillCause(lethal, packet) {
  const origin = lethal && lethal.origin;
  const source = packet && packet.source;
  const authoredOrigin = origin && origin.kind === 'weapon';
  const authoredPacket = source && source.kind === 'weapon';
  if (!authoredOrigin && !authoredPacket) return 'generic';
  const weaponId = authoredOrigin
    ? (origin.weaponId ?? origin.id ?? (source && source.weaponId))
    : source.weaponId;
  const definition = weaponId == null ? null : WPN.get(weaponId);
  if (!definition) return 'generic';
  if (definition.damageType === 'kinetic') return 'kinetic';
  if (definition.damageType === 'explosive') return 'explosive';
  return 'generic';
}

function normalizeKillSurface(value) {
  return KILL_PRESENTATION_SURFACES.has(value) ? value : null;
}

function freezeKillPoint(value) {
  return Object.freeze({
    x: Number.isFinite(value && value.x) ? value.x : 0,
    z: Number.isFinite(value && value.z) ? value.z : 0,
  });
}

function freezeKillDirection(value) {
  const x = Number.isFinite(value && value.x) ? value.x : 0;
  const z = Number.isFinite(value && value.z) ? value.z : 0;
  const length = Math.hypot(x, z);
  if (!(length > 1e-9)) return null;
  return Object.freeze({ x: x / length, z: z / length });
}

function freezeKillImpact(value) {
  if (!value || typeof value !== 'object') return null;
  return Object.freeze({
    deltaV: finiteKillMetric(value.deltaV),
    exchangedMomentum: finiteKillMetric(value.exchangedMomentum),
    impactDamage: finiteKillMetric(value.impactDamage),
  });
}

function finiteKillMetric(value) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export const combat = {
  name: 'combat',
  init(ctx) {
    this.state = ctx.state; this.bus = ctx.bus; this.helpers = ctx.helpers;
    this.registry = ctx.registry || null;
    this.kernel = getCombatKernel(ctx, { onKill: (target, killerId, lethal) => this.kill(target, killerId, lethal) });
    this._pendingPlayerRecovery = null;
    this._recoveryInFlight = false;
    this._beamCandidateScratch = [];
    this._beamQueryCenter = { x: 0, z: 0 };
    this._diag = {
      beamSpatialQueries: 0,
      beamCandidates: 0,
    };
    ctx.bus.on('projectile:hit', (p) => this.onHit(p));
    ctx.bus.on('tether:whipImpact', (p) => this.onWhipImpact(p || {}));
    ctx.bus.on('dock:docked', (p) => {
      this.rememberRespawnStation(p && p.stationId);
      this.setPlayerDocked(true);
    });
    ctx.bus.on('dock:undocked', () => this.setPlayerDocked(false));
    ctx.bus.on('player:recoveryRequested', (payload) => this.recoverPendingPlayer(payload || {}));
    const clearPendingDefeat = () => {
      this._pendingPlayerRecovery = null;
      this._recoveryInFlight = false;
      if (this.state.combat) this.state.combat.lastPlayerDefeat = null;
    };
    ctx.bus.on('game:started', clearPendingDefeat);
    ctx.bus.on('save:loaded', clearPendingDefeat);
  },

  // Transitional adapter: authored projectile/beam packets are routed directly; older scalar hit
  // producers still pass through the legacy bridge until their emitters migrate.
  onHit({ targetId, ownerId, damage, damageType, pos, penetration = 0, impulse = null, heat = 0, statuses = [], damagePacket = null, packet = null, weaponId = null, origin = null }) {
    if (targetId === this.state.playerId && this.playerIsDockProtected()) {
      return { ok: false, reason: 'target_docked', targetId, attackerId: ownerId == null ? null : ownerId };
    }
    const authoredPacket = damagePacket || packet || null;
    // Weak-point bonus (BP-02): a PLAYER shot landing in a large hull's exposed subsystem arc does
    // bonus damage. Player-only + flag-gated (`combat.weakPoints`, OFF in the golden) + geometric, so
    // NPC combat and the deterministic 47-A sim are untouched. Scales the outgoing packet.
    const weakMult = this._weakPointMult(targetId, ownerId, pos);
    const result = this.ensureKernel().routeDamage({
      attackerId: ownerId,
      targetId,
      packet: authoredPacket
        ? scaleDamagePacket(damagePacketWithHit(authoredPacket, pos), weakMult)
        : legacyHitToDamagePacket({ damage: damage * weakMult, damageType, pos, penetration, impulse, heat, statuses }),
      origin: origin || (weaponId || authoredPacket && authoredPacket.source && authoredPacket.source.weaponId
        ? { kind: 'weapon', id: weaponId || authoredPacket.source.weaponId }
        : { kind: 'legacy', id: 'projectile:hit' }),
    });
    if (result.ok && targetId === this.state.playerId) {
      this.bus.emit('camera:shake', { amount: result.shieldBroke ? 0.4 : 0.2 });
    }
    return result;
  },

  // Rung 14 (the damage half): a whip-impact from masslineImpacts becomes hull damage on the
  // struck body — through the kernel (single-writer), never direct hp. Flag-gated: combat.whipDamage
  // is OFF in the deterministic node golden and ON in the browser (featureFlags.js Tier-B model).
  // Only energetic hits (rating solid/crushing, relSpeed >= 55) hurt; glances are feedback-only.
  // Friendly fire is on, matching impulse-charge blasts — physics doesn't check IFF.
  onWhipImpact(payload) {
    if (!combatFlag('whipDamage')) return null;
    if (payload.rating !== 'solid' && payload.rating !== 'crushing') return null;
    const victim = this.state.entities.get(payload.victimId);
    if (!victim || victim.alive === false || !WHIP_DAMAGE_TYPES.has(victim.type)) return null;
    const momentum = Number.isFinite(payload.momentum) ? Math.max(0, payload.momentum) : 0;
    const damage = Math.min(WHIP_DAMAGE_MAX, momentum * WHIP_DAMAGE_MOMENTUM_SCALE);
    if (damage <= 0) return null;
    const packet = scalarHitToDamagePacket({
      damage,
      damageType: 'kinetic',
      pos: { x: victim.pos.x, z: victim.pos.z },
      source: { kind: 'massline_whip', massId: payload.targetId ?? null },
    });
    packet.flags = { ignoreFriendlyFire: true, allowAnyTarget: true };
    return this.ensureKernel().routeDamage({
      attackerId: this.state.playerId,
      targetId: victim.id,
      packet,
      origin: { kind: 'massline_whip', id: payload.targetId ?? null },
    });
  },

  ensureKernel() {
    if (this.kernel) return this.kernel;
    const helpers = this.helpers || (this.helpers = {});
    this.kernel = getCombatKernel({
      state: this.state,
      bus: this.bus,
      helpers,
      registry: this.registry || null,
    }, { onKill: (target, killerId, lethal) => this.kill(target, killerId, lethal) });
    return this.kernel;
  },

  // Weak-point damage multiplier for a hit (BP-02). Returns >1 only when: the feature flag is on, the
  // attacker is the local player, and the shot landed in the target's exposed subsystem arc. Emits a
  // combat:weakPointHit cue for the HUD callout. Never draws RNG; never mutates the target.
  _weakPointMult(targetId, ownerId, pos) {
    if (!pos || ownerId !== this.state.playerId || !combatFlag('weakPoints')) return 1;
    const target = this.state.entities && this.state.entities.get ? this.state.entities.get(targetId) : null;
    if (!target || target.alive === false) return 1;
    const wp = weakPointForEntity(target);
    if (!wp || !isHitInWeakArc(target, pos, wp)) return 1;
    this.bus.emit('combat:weakPointHit', { targetId, ownerId, label: wp.label, mult: wp.bonusMult, pos: { x: pos.x, z: pos.z } });
    return wp.bonusMult;
  },

  kill(t, killerId, lethal = {}) {
    const state = this.state, bus = this.bus, d = t.data || {};
    if (t.id === state.playerId) {
      if (this._pendingPlayerRecovery || t.alive === false) return;
      const receipt = buildDefeatReceipt(state, t, killerId, lethal);
      // Ironman (advertised as "permadeath" in the New Game UI) honors that promise: death ends
      // the run instead of respawning. We still fire player:death so the death banner/VFX play,
      // then emit game:over (a gameOver screen subscribes and shows a run summary). The entity is
      // left dead (not healed/relocated) so the screen opens over a real wreck, not a live ship.
      const difficulty = state.settings && state.settings.gameplay && state.settings.gameplay.difficulty;
      if (difficulty === 'ironman') {
        state.combat.lastPlayerDefeat = receipt;
        t.alive = false;
        setVecXZ(t.vel, 0, 0);
        bus.emit('player:death', { ...receipt, recoverable: false });
        bus.emit('camera:shake', { amount: 0.9 });
        bus.emit('game:over', { reason: 'ironman_death', recoverable: false, receipt });
        return;
      }
      this.beginPlayerDefeat(t, receipt);
      return;
    }
    if (!t.alive) return;
    const player = state.entities && state.entities.get ? state.entities.get(state.playerId) : null;
    const targetHostileToPlayer = lethal && typeof lethal.targetHostileToPlayer === 'boolean'
      ? lethal.targetHostileToPlayer
      : !!isHostileToPlayer(t, player && player.team, state);
    t.alive = false;
    const killedByPlayer = killerId === state.playerId;
    // Mission targets settle through missions' synchronous entity:killed listener. Paying their
    // archetype bounty/loot here as well makes one contract kill resolve through two reward
    // authorities. The durable mission identity survives sector rematerialization and Continue;
    // ambient enemies have neither tag and retain the normal combat reward path below.
    const missionOwns = missionOwnsReward(t);
    const authoredRewardEligible = killedByPlayer && !missionOwns;
    const factionLawful = lethal && typeof lethal.factionLawful === 'boolean'
      ? lethal.factionLawful
      : !!(d.ai && d.ai.lawful);
    // AC-12 Ember: fire the impulse before entity:killed listeners materialize loot pickups, so the
    // bounded body budget belongs to combatants/debris already present at the death rather than the
    // reward burst created by that same death. This is impulse-only; combat remains the sole health
    // writer and collisionConsequences owns any later impact damage.
    triggerEmberCookOff({ state, bus, helpers: this.helpers, source: t, killerId, lethal });
    const presentation = buildKillPresentationReceipt(state, t, killerId, lethal);
    bus.emit('entity:killed', {
      id: t.id, killerId, type: t.type, pos: { x: t.pos.x, z: t.pos.z },
      factionId: t.factionId, factionLawful, bountyCr: missionOwns ? 0 : (d.bountyCr || 0),
      lootTableId: d.lootTableId || null, victimClass: d.shipClass || t.type,
      targetHostileToPlayer,
      presentation,
    });
    // World event, not a player event: this fires for EVERY entity killed, so with no position it hit
    // the player's camera at full 0.5 trauma for a kill anywhere in the sector — three times the
    // amplitude of the destruction-VFX shake. The neighbouring emitters in this file are all
    // player-scoped by construction (player hit, player death, respawn) and correctly send none.
    bus.emit('camera:shake', { amount: 0.5, position: { x: t.pos.x, z: t.pos.z } });
    // AC-08 pays style through credits and RP only. The multiplier resolves at the payout edge, so
    // the authored `bountyCr` published above stays the victim's real world value for the ledger,
    // telemetry, and custody readers that account it rather than pay it.
    const styleMultiplier = styleMultiplierOf(presentation.style);
    const bounty = Math.max(0, Math.round(d.bountyCr || 0));
    if (bounty > 0 && authoredRewardEligible) {
      bus.emit('economy:grantCredits', {
        amount: applyStyleMultiplier(bounty, styleMultiplier),
        reason: 'bounty',
      });
    }
    if (d.loot && !missionOwns) {
      // Current run seed + durable victim identity makes authored rewards stable across entity-id
      // rematerialization and save/load without a private combat cursor to serialize or reset.
      const rewardRng = createVictimRewardRng(
        state.meta && state.meta.seed,
        t,
        'combat_authored_loot_v1',
      );
      const { credits, items } = this.rollLoot(d.loot, rewardRng);
      // Scale the credit value AFTER the deterministic roll. `items` are materials and are never
      // touched, so no draw shifts and the burst stays byte-identical whatever the kill style was.
      const creditedLoot = authoredRewardEligible ? applyStyleMultiplier(credits, styleMultiplier) : 0;
      if (creditedLoot > 0) bus.emit('economy:grantCredits', { amount: creditedLoot, reason: 'loot' });
      // NPC-on-NPC kills still publish the deterministic world receipt used by observers, but
      // authored credits and physical pickups remain player-earned. Commodity cargo continues to
      // materialize only through its owning loot/custody systems, never this metadata-only receipt.
      bus.emit('loot:drop', {
        pos: { x: t.pos.x, z: t.pos.z },
        credits: creditedLoot,
        items,
      });
      if (authoredRewardEligible) {
        for (const it of items) {
          const ang = rewardRng() * Math.PI * 2, sp = 18 + rewardRng() * 28;
          const kind = lootPickupKind(it.id);
          this.helpers.spawnEntity({
            type: 'pickup', pos: { x: t.pos.x + Math.cos(ang) * 8, z: t.pos.z + Math.sin(ang) * 8 },
            vel: { x: Math.cos(ang) * sp, z: Math.sin(ang) * sp }, radius: 2.2,
            data: { kind, commodityId: it.id, amount: it.qty, despawnAt: state.simTime + 30 },
          });
        }
      }
    }
  },

  beginPlayerDefeat(t, receipt) {
    if (!t || this._pendingPlayerRecovery) return false;
    t.alive = false;
    t.flags = t.flags || {};
    t.flags.defeated = true;
    setVecXZ(t.vel, 0, 0);
    this._pendingPlayerRecovery = { playerId: t.id, receipt };
    this.state.combat.lastPlayerDefeat = receipt;
    this.bus.emit('player:death', { ...receipt, recoverable: true });
    this.bus.emit('camera:shake', { amount: 0.9 });
    this.bus.emit('game:over', { reason: 'ship_destroyed', recoverable: true, receipt });
    return true;
  },

  /**
   * Rebuild the in-memory recovery latch from the durable after-action receipt when the wreck is
   * still present. The UI reads lastPlayerDefeat; combat previously only honored _pendingPlayerRecovery
   * (cleared on re-init / partial failure), so Continue could no-op with no feedback.
   */
  rearmPendingRecoveryFromReceipt() {
    if (this._pendingPlayerRecovery) return this._pendingPlayerRecovery;
    const state = this.state;
    if (!state) return null;
    const difficulty = state.settings && state.settings.gameplay && state.settings.gameplay.difficulty;
    if (difficulty === 'ironman') return null;
    const receipt = state.combat && state.combat.lastPlayerDefeat;
    if (!receipt) return null;
    const player = state.entities && typeof state.entities.get === 'function'
      ? state.entities.get(state.playerId)
      : null;
    if (!player) return null;
    const defeated = player.alive === false || !!(player.flags && player.flags.defeated);
    if (!defeated) return null;
    this._pendingPlayerRecovery = { playerId: player.id, receipt };
    return this._pendingPlayerRecovery;
  },

  notifyRecoveryFailure(reason) {
    const messages = {
      no_pending_defeat: 'Recovery is not available for this wreck. Load a save or start a new run.',
      player_missing: 'Recovery failed: ship record missing. Load a save or start a new run.',
      recovery_in_flight: 'Recovery is already in progress.',
      recovery_failed: 'Recovery failed. Try again, or load a save.',
    };
    const text = messages[reason] || messages.no_pending_defeat;
    if (this.bus) {
      this.bus.emit('toast', { text, kind: 'error', ttl: 4.5 });
      this.bus.emit('player:recoveryFailed', { reason: reason || 'no_pending_defeat' });
    }
  },

  recoverPendingPlayer(payload = {}) {
    if (this._recoveryInFlight) {
      this.notifyRecoveryFailure('recovery_in_flight');
      return { ok: false, reason: 'recovery_in_flight' };
    }

    // Prefer the live latch; if it was lost while the after-action receipt still describes a
    // recoverable wreck, re-arm from lastPlayerDefeat so Continue is not a silent no-op.
    const pending = this._pendingPlayerRecovery || this.rearmPendingRecoveryFromReceipt();
    if (!pending) {
      this.notifyRecoveryFailure('no_pending_defeat');
      return { ok: false, reason: 'no_pending_defeat' };
    }
    const player = this.state.entities && typeof this.state.entities.get === 'function'
      ? (this.state.entities.get(pending.playerId) || this.state.entities.get(this.state.playerId))
      : null;
    if (!player) {
      this.notifyRecoveryFailure('player_missing');
      return { ok: false, reason: 'player_missing' };
    }

    // Block re-entry for the duration of this call so a double-click cannot charge twice.
    // Keep the latch until placement succeeds — if restore throws, the player can retry without
    // losing the receipt and without a silent dead button.
    this._recoveryInFlight = true;
    try {
      const receipt = pending.receipt || {};
      const plan = receipt.recovery || buildRecoveryPlan(this.state, player);

      // Place first. Cargo/credit consequences apply only after the berth is committed so a
      // failed cross-sector restore cannot strip inventory and leave the after-action modal stuck.
      this.restorePlayerAtRecoveryDock(player, plan);

      let cargoLostQty = 0;
      for (const loss of plan.cargoLosses || []) {
        cargoLostQty += removeCargo(this.state, loss.commodityId, loss.qty);
      }
      if (plan.costCr > 0) {
        this.bus.emit('economy:chargeCredits', { amount: plan.costCr, reason: 'recovery:deductible' });
      }

      this._pendingPlayerRecovery = null;
      if (this.state.combat) this.state.combat.lastPlayerDefeat = null;

      const recoveryReceipt = {
        stationId: plan.stationId,
        stationName: plan.stationName,
        shipId: player.data && player.data.defId,
        costCr: plan.costCr,
        insuranceStatus: plan.insuranceStatus,
        cargoLost: cargoLostQty > 0,
        cargoLostQty,
        cause: receipt.cause || null,
        source: payload.source || 'after_action',
      };
      this.bus.emit('player:respawn', recoveryReceipt);
      this.bus.emit('camera:shake', { amount: 0.45 });
      return { ok: true, ...recoveryReceipt };
    } catch (err) {
      console.error('[combat] player recovery failed', err);
      this.notifyRecoveryFailure('recovery_failed');
      return { ok: false, reason: 'recovery_failed' };
    } finally {
      this._recoveryInFlight = false;
    }
  },

  restorePlayerAtRecoveryDock(t, plan) {
    const currentSectorId = this.state.world && this.state.world.currentSectorId;
    if (plan && plan.sectorId && plan.sectorId !== currentSectorId) {
      const world = this.registry && typeof this.registry.get === 'function' ? this.registry.get('world') : null;
      if (world && typeof world.enterSector === 'function') {
        world.enterSector(plan.sectorId, {
          via: 'recovery',
          fromSectorId: currentSectorId || null,
          placePlayer: true,
        });
      }
    }
    const livePos = this.respawnPosition(plan && plan.stationId);
    const stationPos = livePos && (livePos.x !== 0 || livePos.z !== 0) ? livePos
      : plan && plan.stationPos || livePos || { x: 0, z: 0 };
    // Recover beside the station rather than at its collision origin. Lawful-station engagement
    // authority already prevents attackers firing into this berth, so recovery needs no temporary
    // invulnerability reward-hack and stale projectiles remain back at the wreck site.
    const pos = { x: stationPos.x + RECOVERY_BERTH_CLEARANCE_WU, z: stationPos.z };
    t.alive = true;
    t.hull = t.hullMax;
    t.armorHp = t.armorMax;
    t.shield = t.shieldMax;
    t.cap = t.capMax;
    setVecXZ(t.pos, pos.x, pos.z);
    setVecXZ(t.vel, 0, 0);
    if (t.prevPos && typeof t.prevPos.copy === 'function') t.prevPos.copy(t.pos);
    else setVecXZ(t.prevPos, pos.x, pos.z);
    t.flags = t.flags || {};
    delete t.flags.defeated;
    t.flags.invuln = false;
    t._invulnUntil = null;
  },

  rollLoot(loot, r) {
    // Production supplies the stateless per-victim stream explicitly. The optional `this.rng`
    // fallback is dependency injection used by the offline loot-table audit; combat init never owns
    // or advances such a cursor.
    r = typeof r === 'function' ? r : (this && typeof this.rng === 'function' ? this.rng : null);
    if (!r) throw new TypeError('rollLoot requires an injected deterministic RNG');
    const cr0 = (loot.creditsRange && loot.creditsRange[0]) || 0;
    const cr1 = (loot.creditsRange && loot.creditsRange[1]) || 0;
    const credits = Math.round(cr0 + (cr1 - cr0) * r());
    const items = [];
    for (const g of (loot.guaranteed || [])) items.push({ id: g.id, qty: qrange(g.qtyRange, r) });
    for (const drop of (loot.drops || [])) if (r() < (drop.chance ?? 0)) items.push({ id: drop.id, qty: qrange(drop.qtyRange, r) });
    return { credits, items };
  },

  respawnPlayer(t, killerId) {
    const state = this.state, bus = this.bus;
    bus.emit('player:death', { pos: { x: t.pos.x, z: t.pos.z }, killerId });
    const stationId = this.respawnStationId();
    const respawnPos = this.respawnPosition(stationId);
    const refundCr = this.insuranceRefund(t);
    const cargoLostQty = this.applyRespawnCargoLoss();
    if (refundCr > 0) bus.emit('economy:grantCredits', { amount: refundCr, reason: 'insurance:respawn' });
    t.alive = true;
    t.hull = t.hullMax; t.armorHp = t.armorMax; t.shield = t.shieldMax; t.cap = t.capMax;
    setVecXZ(t.pos, respawnPos.x, respawnPos.z);
    setVecXZ(t.vel, 0, 0);
    if (t.prevPos && typeof t.prevPos.copy === 'function') t.prevPos.copy(t.pos);
    else setVecXZ(t.prevPos, respawnPos.x, respawnPos.z);
    t.flags.invuln = true; t._invulnUntil = state.simTime + UNDOCK_INVULN_S;
    bus.emit('player:respawn', {
      stationId,
      shipId: t.data && t.data.defId,
      refundCr,
      cargoLost: cargoLostQty > 0,
      cargoLostQty,
    });
    bus.emit('camera:shake', { amount: 0.8 });
  },

  rememberRespawnStation(stationId) {
    if (!stationId) return;
    const player = this.state && this.state.player;
    if (!player) return;
    const ins = player.insurance || (player.insurance = { rate: 0.6, deductibleCr: 500, insuredModules: false, lastStationId: null });
    ins.lastStationId = stationId;
  },

  setPlayerDocked(docked) {
    const player = this.state && this.state.entities && this.state.entities.get
      ? this.state.entities.get(this.state.playerId)
      : null;
    if (!player) return;
    player.flags = player.flags || {};
    player.flags.docked = !!docked;
    if (docked) {
      player.flags.invuln = true;
      player._invulnUntil = Infinity;
      setVecXZ(player.vel, 0, 0);
    } else {
      // Overnight B1: longer undock grace so early pirates can't delete the player at the pad.
      player.flags.invuln = true;
      player._invulnUntil = (this.state.simTime || 0) + UNDOCK_INVULN_S;
    }
  },

  playerIsDockProtected() {
    const player = this.state && this.state.entities && this.state.entities.get
      ? this.state.entities.get(this.state.playerId)
      : null;
    return !!(player && player.flags && player.flags.docked) || !!(this.state && this.state.ui && this.state.ui.docked);
  },

  respawnStationId() {
    const player = this.state && this.state.player;
    const ins = player && player.insurance;
    if (ins && ins.lastStationId && (stationRecordFor(this.state, ins.lastStationId) || liveStationFor(this.state, ins.lastStationId))) {
      return ins.lastStationId;
    }
    return firstActiveStationId(this.state);
  },

  respawnPosition(stationId) {
    const station = stationRecordFor(this.state, stationId);
    let pos = station && station.pos;
    if (!pos && station && typeof station.id === 'number' && this.state && this.state.entities) {
      const entity = this.state.entities.get(station.id);
      pos = entity && entity.pos;
    }
    if (!pos) {
      const live = liveStationFor(this.state, stationId);
      pos = live && live.pos;
    }
    return pos ? { x: pos.x || 0, z: pos.z || 0 } : { x: 0, z: 0 };
  },

  insuranceRefund(t) {
    const player = this.state && this.state.player;
    const ins = player && player.insurance;
    if (!player || !ins || !ins.insuredModules) return 0;
    const owned = (player.ownedShips || [])[player.activeShipIndex || 0] || {};
    const shipId = owned.defId || (t.data && t.data.defId);
    const shipValue = catalogValue(shipId);
    let moduleValue = 0;
    for (const id of (owned.fittings || [])) {
      if (id) moduleValue += catalogValue(id);
    }
    const rate = Math.max(0, Number(ins.rate) || 0);
    const deductible = Math.max(0, Math.round(ins.deductibleCr || 0));
    return Math.max(0, Math.round(rate * (shipValue + moduleValue) - deductible));
  },

  applyRespawnCargoLoss() {
    const cargo = this.state && this.state.player && this.state.player.cargo;
    if (!cargo || !cargo.items) return 0;
    let lost = 0;
    for (const id of Object.keys(cargo.items)) {
      const have = Math.max(0, Math.floor(cargo.items[id] || 0));
      const qty = Math.floor(have * CARGO_LOSS_RATE);
      if (qty > 0) lost += removeCargo(this.state, id, qty);
    }
    return lost;
  },

  update(dt, state) {
    ensureCombatRuntime(this);
    resetCombatDiagnostics(this._diag);
    const ships = (state.entityIndex && state.entityIndex.ships) || state.entityList;
    for (const e of ships) {
      if (e.type !== 'ship' || !e.alive) continue;
      if (e.flags.invuln && e._invulnUntil != null && state.simTime >= e._invulnUntil) e.flags.invuln = false;
      if (e.shieldMax > 0 && e.shield < e.shieldMax && state.simTime - (e.lastDamageT || -1e9) >= (e.shieldRegenDelay || 3)) {
        e.shield = Math.min(e.shieldMax, e.shield + (e.shieldRegenRate || 0) * dt);
      }
      if (e.capMax > 0 && e.cap < e.capMax) {
        const regenMult = this.kernel ? this.kernel.capRegenMultiplier(e.id) : 1;
        const playerCapMult = e.id === state.playerId ? WEAPON_CAP_REGEN_MULT : 1;
        e.cap = Math.min(e.capMax, e.cap + (e.capRegen || 0) * regenMult * playerCapMult * dt);
      }
    }
    this._applyBeamDamage(state);
    state.combatRuntime = state.combatRuntime || {};
    state.combatRuntime.diagnostics = this._diag;
    if (this.kernel) this.kernel.postPhysics(dt);
  },

  // Continuous beam weapons (weapons.js) push a ray per firing beam into state.combat.beams each tick
  // with a dpsThisTick value; weapons clears the list at the start of its update, so this consumes the
  // current tick's beams (weapons runs before combat in UPDATE_ORDER). Each beam damages the FIRST
  // entity along its path. Without this sweep, beam weapons (and the Dreadnought's heavy beams) deal
  // zero damage — only writes, no reads.
  _applyBeamDamage(state) {
    ensureCombatRuntime(this);
    const beams = state.combat && state.combat.beams;
    if (!beams || !beams.length) return;
    for (let i = 0; i < beams.length; i++) {
      const beam = beams[i];
      if (!beam || !beam.from || !beam.to || !(beam.dpsThisTick > 0)) continue;
      const ax = beam.from.x, az = beam.from.z;
      const dx = beam.to.x - ax, dz = beam.to.z - az;
      const len2 = dx * dx + dz * dz || 1e-6;
      const owner = state.entities.get(beam.ownerId);
      const ownerTeam = owner ? owner.team : null;
      let bestT = Infinity, bestE = null;
      const damageables = beamDamageCandidates(this, state, beam, dx, dz);
      for (const e of damageables) {
        if (!e.alive) continue;
        if (e.type !== 'ship' && e.type !== 'station' && e.type !== 'drone' && e.type !== 'heavyPart') continue;
        if (e.type === 'heavyPart' && e.data?.heavyPartState !== 'mounted') continue;
        if (e.id === beam.ownerId) continue;
        if (e.id === state.playerId && this.playerIsDockProtected()) continue;
        if (ownerTeam != null && e.team === ownerTeam) continue; // no friendly fire
        let t = ((e.pos.x - ax) * dx + (e.pos.z - az) * dz) / len2;
        if (t < 0) t = 0; else if (t > 1) t = 1;
        const px = e.pos.x - (ax + dx * t), pz = e.pos.z - (az + dz * t);
        const rr = (e.radius || 6) + 2;
        if (px * px + pz * pz <= rr * rr && t < bestT) { bestT = t; bestE = e; }
      }
      if (bestE) {
        this.onHit({
          targetId: bestE.id,
          ownerId: beam.ownerId,
          damage: beam.dpsThisTick,
          damageType: beam.dmgType || 'energy',
          damagePacket: beam.damagePacket || null,
          weaponId: beam.weaponId || null,
          pos: { x: ax + dx * bestT, z: az + dz * bestT },
        });
      }
    }
  },
};

function beamDamageCandidates(host, state, beam, dx, dz) {
  ensureCombatRuntime(host);
  const fallback = (state.entityIndex && state.entityIndex.damageables) || state.entityList;
  const center = host._beamQueryCenter;
  center.x = (beam.from.x + beam.to.x) * 0.5;
  center.z = (beam.from.z + beam.to.z) * 0.5;
  const queryRadius = Math.hypot(dx, dz) * 0.5 + BEAM_QUERY_RADIUS_PAD;
  const candidates = queryNearbyEntities(state, center, queryRadius, host._beamCandidateScratch, fallback);
  if (candidates === host._beamCandidateScratch) host._diag.beamSpatialQueries++;
  host._diag.beamCandidates += candidates.length;
  return candidates;
}

function ensureCombatRuntime(host) {
  if (!host._beamCandidateScratch) host._beamCandidateScratch = [];
  if (!host._beamQueryCenter) host._beamQueryCenter = { x: 0, z: 0 };
  if (!host._diag) {
    host._diag = {
      beamSpatialQueries: 0,
      beamCandidates: 0,
    };
  }
}

function resetCombatDiagnostics(diag) {
  if (!diag) return;
  diag.beamSpatialQueries = 0;
  diag.beamCandidates = 0;
}

function lootPickupKind(id) {
  return (typeof id === 'string' && id.startsWith('cmdty_')) ? 'cargo' : 'module';
}

// Scale every damage channel of a packet by `mult` (BP-02 weak-point bonus). Returns the packet
// unchanged when mult is 1 (the overwhelming common case), so there is zero allocation off the hot
// path. Clones defensively so the source packet (often a shared authored def) is never mutated.
function scaleDamagePacket(packet, mult) {
  if (!packet || !(mult > 1)) return packet;
  const channels = { ...(packet.channels || {}) };
  for (const k in channels) channels[k] = channels[k] * mult;
  return { ...packet, channels };
}

function damagePacketWithHit(packet, pos) {
  if (!pos) return packet;
  return {
    ...packet,
    channels: { ...(packet.channels || {}) },
    statuses: (packet.statuses || []).map((status) => ({ ...status })),
    flags: packet.flags ? { ...packet.flags } : undefined,
    source: packet.source ? { ...packet.source } : undefined,
    hit: {
      ...(packet.hit || {}),
      pos: { x: Number(pos.x) || 0, z: Number(pos.z) || 0 },
    },
    impulse: packet.impulse ? { ...packet.impulse } : packet.impulse,
  };
}
