// Canonical deterministic hostile-spec builder shared by simulation and worker materializers.
// combat.js re-exports this API; its bounded repeat caches stay with the builder so callers that
// only create spawn specs do not load the damage/update system.
import { WEAPONS } from '../data/weapons.js';
import { ENEMY_TYPES } from '../data/enemies.js';
import { SHIPS } from '../data/ships.js';
import { dedupWarn } from '../core/warnDedup.js';
import { kilnbackPhysicalBody } from '../data/kilnbackBody.js';
import { kilnbackFlightModel } from '../data/kilnback.js';
import { mothlightPhysicalBody } from '../data/mothlightBody.js';
import { mothlightFlightModel } from '../data/mothlight.js';
import { palletJackPhysicalBody } from '../data/palletJackBody.js';
import { palletJackFlightModel } from '../data/palletJack.js';
import { scissorwakePhysicalBody } from '../data/scissorwakeBody.js';
import { makeShipEntitySpec, fittingsFromWeapons } from './ships.js';
import { hash32 } from '../core/rng.js';
import { applyLastArgumentSpawnSpec } from '../data/lastArgumentBody.js';
import { applyIronKrakenSpawnSpec } from '../data/ironKraken.js';
import { normalizeActivity, normalizeRoe, roeForActivity } from '../ai/doctrine.js';
import { CombatDoctrineId, DOCTRINE_TELEGRAPH_TICKS, normalizeCombatDoctrineId } from '../ai/combatDoctrine.js';
import { MIN_AI_RESPONSE_WINDOW_S } from '../ai/engagementAuthority.js';
import { contactGrammarFor } from '../data/factionContactGrammar.js';
import { sampleFactionBehavior } from '../data/factionDoctrines.js';

export const WPN = new Map(WEAPONS.map((weapon) => [weapon.id, weapon]));
const ENEMY = new Map(ENEMY_TYPES.map((enemy) => [enemy.id, enemy]));
const SHIP = new Map(SHIPS.map((ship) => [ship.id, ship]));

const BASE_AI_CAPABILITIES = Object.freeze(['drive', 'sensor', 'weapon']);
const ARCHETYPE_TACTICAL_CAPABILITIES = Object.freeze({
  swarmer: Object.freeze(['counter_tether_overload', 'ranged', 'screen']),
  sniper: Object.freeze(['ranged']),
  brawler: Object.freeze(['disable', 'ranged']),
  fleeing_trader: Object.freeze(['ranged', 'screen']),
  pirate: Object.freeze(['counter_tether_overload', 'ranged', 'screen']),
  miniboss_capital: Object.freeze(['disable', 'ranged', 'screen']),
  // Warden Escort: area-denial gunnery around its ward, no disable/tether verbs.
  guardian: Object.freeze(['ranged', 'screen']),
  // Kamikaze hulls carry no weapons and no support verbs — the hull itself is the ordnance.
  // BASE caps (drive/sensor) alone keep squad allocation honest: a dart cannot fill a gunner slot.
  kamikaze: Object.freeze([]),
});

// A wave of the same archetype samples one frozen doctrine row. Rebuilding it per body
// was pure repeat work on fight entry (same faction, same seed, same count of 1).
const factionSpawnBehaviorCache = new Map();
const weaponTemplateCache = new Map();
let capabilityByDef = new WeakMap();
const enemySpawnRepeatWork = {
  factionBehaviorBuilds: 0,
  factionBehaviorHits: 0,
  capabilityBuilds: 0,
  capabilityHits: 0,
  weaponTemplateBuilds: 0,
  weaponTemplateHits: 0,
};

/** How many identical fight-entry samples were rebuilt versus reused. Test seam. */
export function readEnemySpawnRepeatWork() {
  return { ...enemySpawnRepeatWork };
}

export function resetEnemySpawnRepeatWork() {
  enemySpawnRepeatWork.factionBehaviorBuilds = 0;
  enemySpawnRepeatWork.factionBehaviorHits = 0;
  enemySpawnRepeatWork.capabilityBuilds = 0;
  enemySpawnRepeatWork.capabilityHits = 0;
  enemySpawnRepeatWork.weaponTemplateBuilds = 0;
  enemySpawnRepeatWork.weaponTemplateHits = 0;
  factionSpawnBehaviorCache.clear();
  weaponTemplateCache.clear();
  capabilityByDef = new WeakMap();
}

function factionBehaviorForCombatSpawn(factionId, opts = {}) {
  const seedBase = Number.isFinite(opts.doctrineSeed)
    ? opts.doctrineSeed
    : (Number.isFinite(opts.startedTick) ? opts.startedTick : 0);
  const key = `${String(factionId)}|${seedBase}`;
  if (factionSpawnBehaviorCache.has(key)) {
    enemySpawnRepeatWork.factionBehaviorHits += 1;
    return factionSpawnBehaviorCache.get(key);
  }
  enemySpawnRepeatWork.factionBehaviorBuilds += 1;
  const row = sampleFactionBehavior(
    factionId,
    hash32(seedBase, factionId, 'combat-spawn-doctrine'),
    1,
  )[0] || null;
  if (factionSpawnBehaviorCache.size > 64) factionSpawnBehaviorCache.clear();
  factionSpawnBehaviorCache.set(key, row);
  return row;
}

/** Scale an enemy archetype's base stats by encounter level. */
export function scaleCombatant(def, level) {
  const f = 1 + 0.12 * Math.max(0, (level || 1) - 1);
  return { hull: Math.round((def.hull || 100) * f), armor: Math.round((def.armor || 0) * f), shield: Math.round((def.shield || 0) * f), dmgMult: f };
}

// C1: floor for enemy direct-fire projectile speed (WU/s) — keeps shots readable on screen.
const ENEMY_PROJ_SPEED_FLOOR = 380;

function enemyWeaponTemplateKey(w) {
  return [
    w.id,
    w.turret === true ? 1 : 0,
    w.dmgOverride ?? '',
    w.rofOverride ?? '',
    w.projSpeedOverride ?? '',
    w.rangeOverride ?? '',
    w.occasional === true ? 1 : 0,
    w.defensiveOnly === true ? 1 : 0,
  ].join('|');
}

function resolveEnemyWeapon(w, slotIndex) {
  const base = WPN.get(w.id);
  if (!base) return null;
  const templateKey = enemyWeaponTemplateKey(w);
  let template = weaponTemplateCache.get(templateKey);
  if (template) {
    enemySpawnRepeatWork.weaponTemplateHits += 1;
  } else {
    enemySpawnRepeatWork.weaponTemplateBuilds += 1;
    // Phase 2 hardpoint fields: enemy ships have no per-hull facing data, so default front + the
    // standard fixed-gun gimbal arc (they gimbal toward their AI lead angle, like the player does).
    // An enemy entry may force a turret mount via w.turret:true (e.g. capital boss broadside beams).
    const isTurret = base.tracking === 'auto_turret' || !!w.turret;
    const isHoming = base.tracking === 'homing';
    const facing = isTurret ? 'turret' : 'front';
    const gimbalArc = isTurret ? (base.turretArcDeg || 180) * Math.PI / 180
      : (isHoming ? Math.PI : 22 * Math.PI / 180);
    template = {
      ...base, defId: w.id,
      facing, facingAngle: facing === 'turret' ? 0 : 0, gimbalArc,
      muzzleOffset: [0.8, 0],
      dmg: w.dmgOverride ?? base.dmg,
      rof: w.rofOverride ?? base.rof,
      // C1 engagement scale: enemy direct-fire projectiles fly at >= 380 WU/s so a shot crosses the
      // visible frame in well under a second. Homing and deployed ordnance keep authored speeds.
      projSpeed: (isHoming || base.tracking === 'deploy')
        ? (w.projSpeedOverride ?? base.projSpeed)
        : Math.max(ENEMY_PROJ_SPEED_FLOOR, w.projSpeedOverride ?? base.projSpeed),
      range: w.rangeOverride ?? base.range,
      spread: base.spreadDeg ?? 0,
      tracking: isTurret ? 'auto_turret' : (base.tracking || 'fixed'),
      arc: isTurret ? { turret: base.turretArcDeg || 180 } : 'fixed',
      heatMax: base.heatMax ?? 100, lockTimeS: base.lockTimeS ?? 0,
      // Mount roles authored in enemies.js: `occasional` fires in deterministic windows,
      // `defensiveOnly` answers only inside its own close envelope. weapons.js gates on
      // these — they must survive resolution or the mounts read as always-on primaries.
      ...(w.occasional === true ? { occasional: true } : null),
      ...(w.defensiveOnly === true ? { defensiveOnly: true } : null),
    };
    if (weaponTemplateCache.size > 128) weaponTemplateCache.clear();
    weaponTemplateCache.set(templateKey, template);
  }
  // Cooldown, heat, and the small per-mount arrays are per body. The template stays shared.
  const instance = { ...template, slotIndex, _cooldown: 0, _heat: 0 };
  if (Array.isArray(template.muzzleOffset)) instance.muzzleOffset = template.muzzleOffset.slice();
  if (template.arc && typeof template.arc === 'object') instance.arc = { ...template.arc };
  return instance;
}

export function makeEnemySpawnSpec(enemyTypeId, level, pos, opts = {}) {
  let def = ENEMY.get(enemyTypeId);
  if (!def) {
    // Unknown ids used to silently spawn a wasp — a typo in a wave recipe or encounter script
    // shipped as a real body with no trail. Keep the safe fallback (a spawn that never throws,
    // so callers that reserved a slot still get a body) but make it loud and inspectable.
    def = ENEMY_TYPES[0];
    dedupWarn('combat/unknown-enemyTypeId',
      '[combat] makeEnemySpawnSpec: unknown enemyTypeId — spawning fallback', enemyTypeId, def.id);
    opts = { ...opts, spawnFallbackFor: enemyTypeId };
  }
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
  if (def.combatSpeed) {
    spec.combatSpeed = def.combatSpeed;
    if (spec.data && spec.data.derived && spec.data.derived.propulsion) {
      spec.data.derived.propulsion = {
        ...spec.data.derived.propulsion,
        combatSpeed: def.combatSpeed,
      };
    }
    if (spec.propulsion) {
      spec.propulsion = {
        ...spec.propulsion,
        combatSpeed: def.combatSpeed,
      };
    }
  }
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
  // FB-020: a heavy hull authoring turret subsystems keys each turret mount to its own
  // destructible `subsystem_turret_<i>` — a dead mount goes silent through the ordinary
  // weaponBankReadiness gate, and mount loss (not hull fraction) drives the fight's phases.
  if (def.subsystems && Number(def.subsystems.turretHp) > 0) {
    let turretIndex = 0;
    for (const w of ws) {
      if (w && (w.facing === 'turret' || w.tracking === 'auto_turret')) {
        w.subsystemId = `subsystem_turret_${turretIndex++}`;
      }
    }
    spec.data.subsystems = { ...def.subsystems };
  }
  // FB-020: a row may author its own weak-point arc (Iron Maw's prow rib) — the scan-revealed
  // seam the packet promises differs from the class table's rear vent.
  if (def.weakPoint && typeof def.weakPoint === 'object') spec.data.weakPoint = { ...def.weakPoint };
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
  if (opts.spawnFallbackFor) spec.data.spawnFallbackFor = opts.spawnFallbackFor;
  if (def.detonator) spec.data.detonator = { ...def.detonator };
  spec.data.shipClass = def.shipClass || 'fighter';
  if (def.reinforcements) spec.data.reinforcements = { ...def.reinforcements };
  spec.data.level = level;
  // Enemy silhouette override (graphics spec Workstream D): when present, the render track
  // draws the enemy as its OWN hostile family instead of the player ship-def's family. Gameplay
  // stats still come from shipId; only the appearance changes.
  if (def.silhouette) spec.data.silhouette = def.silhouette;
  // Ecology roles: durable telegraph + counter hints for HUD/comms (presentation consumers).
  if (def.telegraph) spec.data.telegraph = { ...def.telegraph };
  if (def.counterHint) spec.data.counterHint = def.counterHint;
  // FB-121: ammunition / moving terrain / specialist — the scan panel's one-word read on what
  // this hull IS, derived on the row from mass unless the specialist identity overrides it.
  spec.data.physicalClass = def.physicalClass || null;
  // INF-025: authored directional armor (Mirrorjaw prow/stern split). Clamped here so a bad
  // row can neither immunize a hull nor multiply damage without bound; the router stays pure.
  if (def.directionalArmor && typeof def.directionalArmor === 'object') {
    spec.data.directionalArmor = {
      frontArcDeg: clampDirectionalArc(def.directionalArmor.frontArcDeg),
      frontMult: clampDirectionalMult(def.directionalArmor.frontMult),
      rearArcDeg: clampDirectionalArc(def.directionalArmor.rearArcDeg),
      rearMult: clampDirectionalMult(def.directionalArmor.rearMult),
    };
  }
  if (def.fieldAnchor) spec.data.fieldAnchor = { ...def.fieldAnchor };
  if (def.subsystems && typeof def.subsystems === 'object') {
    spec.data.subsystems = { ...def.subsystems };
    const turretHp = Number(def.subsystems.turretHp) || 300;
    const turrets = {};
    let tIdx = 0;
    for (const w of def.weapons || []) {
      const count = w.count || 1;
      for (let i = 0; i < count; i++) {
        const subId = `turret_${tIdx}`;
        turrets[subId] = {
          id: subId,
          health: turretHp,
          maxHealth: turretHp,
          destroyed: false,
          effectiveDisabled: false,
          isTurret: true,
          weaponDefId: w.id,
        };
        tIdx++;
      }
    }
    spec.data.subsystems.turrets = turrets;
    spec.subsystems = { ...(spec.subsystems || {}), ...turrets };
  }
  // Presentation-only boss dressing (Forge Regent crown). Render-owned; no combat fields.
  if (def.bossDressing && typeof def.bossDressing === 'object') {
    spec.data.bossDressing = { ...def.bossDressing };
  }
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
  if (def.id === 'kilnback' || def.id === 'scissorwake' || def.id === 'mothlight') {
    const body = def.id === 'kilnback' ? kilnbackPhysicalBody() : def.id === 'mothlight' ? mothlightPhysicalBody() : scissorwakePhysicalBody();
    spec.physicsBody = body; spec.mass = body.mass; spec.radius = body.radius;
    spec.visualRadius = body.radius;
    spec.data.authoredAssetId = def.id === 'kilnback' ? 'SF_SHIP_KILNBACK' : def.id === 'mothlight' ? 'SF_SHIP_MOTHLIGHT_TENDER' : 'SF_SHIP_SCISSORWAKE';
    if (def.id === 'mothlight') {
      spec.data.persistenceOwner = 'mothlight';
      spec.flightModel = mothlightFlightModel(body, spec.flightModel);
      if (spec.data.derived) spec.data.derived.flightModel = mothlightFlightModel(body, spec.data.derived.flightModel);
    }
    if (def.id === 'kilnback') spec.data.persistenceOwner = 'kilnback';
    if (def.id === 'kilnback') {
      spec.flightModel = kilnbackFlightModel(body, spec.flightModel);
      if (spec.data.derived) spec.data.derived.flightModel = kilnbackFlightModel(body, spec.data.derived.flightModel);
    }
    for (const model of [spec.flightModel, spec.data.derived?.flightModel]) {
      if (model) { model.mass = body.mass; model.inertia = body.inertiaY; }
    }
  }
  if (def.id === 'pallet_jack') {
    const body = palletJackPhysicalBody();
    spec.physicsBody = body; spec.mass = body.mass; spec.radius = body.radius;
    spec.visualRadius = body.radius;
    spec.data.authoredAssetId = 'SF_SHIP_PALLET_JACK';
    spec.data.persistenceOwner = 'palletJack';
    spec.data.combatProfileId = 'combat_profile_pallet_jack';
    spec.flightModel = palletJackFlightModel(body, spec.flightModel);
    if (spec.data.derived) spec.data.derived.flightModel = palletJackFlightModel(body, spec.data.derived.flightModel);
  }
  return applyIronKrakenSpawnSpec(applyLastArgumentSpawnSpec(spec, def.id), def.id);
}
function doctrineTelegraphFor(doctrineId) {
  if (doctrineId === CombatDoctrineId.TETHER_CONTROL_RAIDER) return 'attach_spool';
  if (doctrineId === CombatDoctrineId.FIELD_ANCHOR_CONTROLLER) return 'field_spool';
  if (doctrineId === CombatDoctrineId.CAPITAL_BROADSIDE) return 'broadside_charge';
  if (doctrineId === CombatDoctrineId.RANGED_DISENGAGER) return 'weapon_charge';
  if (doctrineId === CombatDoctrineId.RANGED_STALKER) return 'sensor_ghost';
  if (doctrineId === CombatDoctrineId.DETONATOR_RUN) return 'detonator_fuse';
  return 'engine_flare';
}

function tacticalCapabilitiesFor(def) {
  const cached = def ? capabilityByDef.get(def) : null;
  if (cached) {
    enemySpawnRepeatWork.capabilityHits += 1;
    return cached.slice();
  }
  enemySpawnRepeatWork.capabilityBuilds += 1;
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
  const sorted = Object.freeze([...caps].sort());
  if (def) capabilityByDef.set(def, sorted);
  return sorted.slice();
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
function clampDirectionalArc(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 150;
  return Math.min(180, Math.max(0, n));
}

function clampDirectionalMult(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.min(10, Math.max(0, n));
}

