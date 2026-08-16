// Pure player-damage and recovery receipts. Combat owns the transition; UI consumes these models.
// No wall clock, RNG, DOM, or mutation lives here, so the same lethal hit always produces the same
// after-action account in browser, Electron, saves, and headless verification.

import { ENEMY_TYPES } from '../data/enemies.js';
import { FACTION_META } from '../data/factions.js';
import { MODULES } from '../data/modules.js';
import { SECTORS } from '../data/sectors.js';
import { SHIPS } from '../data/ships.js';
import { WEAPONS } from '../data/weapons.js';

const ENEMY_BY_ID = new Map(ENEMY_TYPES.map((entry) => [entry.id, entry]));
const FACTION_BY_ID = new Map(FACTION_META.map((entry) => [entry.id, entry]));
const MODULE_BY_ID = new Map(MODULES.map((entry) => [entry.id, entry]));
const SHIP_BY_ID = new Map(SHIPS.map((entry) => [entry.id, entry]));
const WEAPON_BY_ID = new Map(WEAPONS.map((entry) => [entry.id, entry]));
const STATION_BY_ID = new Map();

for (const sector of SECTORS) {
  for (const station of sector.stations || []) {
    STATION_BY_ID.set(station.id, { ...station, sectorId: sector.id, security: sector.security });
  }
}

const NON_LAWFUL_PERSONALITIES = new Set(['pirate', 'smuggler', 'xenophobic']);
const ENVIRONMENT_LABELS = Object.freeze({
  collision: 'Environmental hazard',
  deep_core_gas: 'Deep-core gas pocket',
  salvage_reactor: 'Salvage reactor',
  environmental: 'Environmental hazard',
});
const COUNTER_HINT_TEXT = Object.freeze({
  cross_the_lane_do_not_chase: 'Cross the Dart\'s firing lane; chasing its tail keeps you inside the pass.',
  displace_the_anchor_or_kill_it: 'Displace or kill the Flea anchor before committing inside its snare.',
  strip_the_cover_break_or_move_the_rock: 'Break or move the Skitter\'s cover before following it around the rock.',
  aim_the_blast_pop_it_next_to_something: 'Finish the Ember beside another hostile so its cook-off works for you.',
  strip_turrets_then_shove_or_ignore: 'Strip the Gunship\'s physical turrets before closing on the hull.',
  dodge_then_use_terrain_against_its_mass: 'Dodge the locked Ramscoop burn, then let terrain punish its mass.',
  destroy_launch_bays_before_the_screen_grows: 'Open on the Carrier\'s launch bays before its screen grows.',
  detonate_or_repulse_the_ore_then_strip_the_rack: 'Shoot or repulse the Foundry\'s charged ore, then strip its rack.',
  cut_tether_or_clear_wake: 'Clear the Jackal\'s mine wake with a Repulsor instead of following its turn.',
  hold_missiles_use_kinetics_peel_escort: 'Peel the point-defense escort with kinetics before spending missiles.',
  break_lock_close_under_cover: 'Break the sniper lock with cover, then close from an off-axis bearing.',
  kill_or_close_inside_fuzz: 'Close inside the Jammer fuzz or kill its antenna hull before relying on radar.',
  kill_or_catch_tender_and_drone_in_well: 'Separate the repair drone with a Well or kill the Tender first.',
  ignore_and_kill_wing: 'Break the Harrier\'s close wing first; the sniper will withdraw.',
  displace_break_anchor_or_outmass: 'Break or displace the tether anchor before fighting the raider\'s line.',
  kill_or_massline_displace_anchor_leave_radius: 'Kill or Massline-displace the Anchor, then leave its field radius.',
});

function pct(value, max) {
  return max > 0 ? Math.max(0, Math.min(100, Math.round((Number(value) || 0) / max * 100))) : 0;
}

function titleWords(value, fallback = 'Unknown') {
  const text = String(value || fallback).replace(/^(ship|wpn|station|faction)_/, '').replace(/_/g, ' ');
  return text.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function weaponIdFromDamage(payload = {}) {
  return payload.weaponId
    || payload.origin && payload.origin.weaponId
    || payload.origin && payload.origin.kind === 'weapon' && payload.origin.id
    || payload.packet && payload.packet.source && payload.packet.source.weaponId
    || null;
}

export function attackerLabel(state, attackerId) {
  if (attackerId == null) return 'Environmental hazard';
  if (attackerId === state.playerId) return 'Own ship';
  const attacker = state.entities && typeof state.entities.get === 'function' ? state.entities.get(attackerId) : null;
  if (!attacker) return 'Unknown contact';
  const data = attacker.data || {};
  const enemy = ENEMY_BY_ID.get(data.lootTableId || data.enemyTypeId);
  if (enemy) return enemy.name;
  if (data.callsign) return String(data.callsign);
  const ship = SHIP_BY_ID.get(data.defId);
  return ship ? ship.name : titleWords(data.shipClass || attacker.type, 'Unknown contact');
}

function contextLabel(context) {
  if (!context) return null;
  if (context === 'deep_core_gas') return 'Deep-core gas';
  return titleWords(context);
}

/** Stable source identity for the after-action receipt. Never infer "environment" from a missing
 * entity when a non-null contact id was supplied: despawned attackers must remain Unknown contact. */
export function defeatSource(state, attackerId, context = null) {
  if (attackerId == null) {
    return {
      kind: 'environment',
      entityId: null,
      label: ENVIRONMENT_LABELS[context] || 'Environmental hazard',
      factionId: null,
      faction: null,
    };
  }
  if (attackerId === state.playerId) {
    return { kind: 'self', entityId: attackerId, label: 'Own ship', factionId: null, faction: null };
  }
  const entity = state.entities && typeof state.entities.get === 'function' ? state.entities.get(attackerId) : null;
  if (!entity) {
    return { kind: 'unknown', entityId: attackerId, label: 'Unknown contact', factionId: null, faction: null };
  }
  const data = entity.data || {};
  const factionId = entity.factionId || data.factionId || null;
  const faction = FACTION_BY_ID.get(factionId);
  return {
    kind: 'contact',
    entityId: attackerId,
    label: attackerLabel(state, attackerId),
    factionId,
    faction: faction ? faction.name : (factionId ? titleWords(factionId) : null),
  };
}

export function weaponLabel(weaponId) {
  const weapon = WEAPON_BY_ID.get(weaponId);
  return weapon ? weapon.name : (weaponId ? titleWords(weaponId) : 'Unknown weapon');
}

export function impactDirection(state, attackerId, hitPos = null) {
  const player = state.entities && typeof state.entities.get === 'function' ? state.entities.get(state.playerId) : null;
  const attacker = attackerId == null || !state.entities || typeof state.entities.get !== 'function'
    ? null : state.entities.get(attackerId);
  const source = attacker && attacker.pos || hitPos;
  if (!player || !player.pos || !source) return 'UNKNOWN';
  const dx = Number(source.x) - Number(player.pos.x);
  const dz = Number(source.z) - Number(player.pos.z);
  if (!(Math.hypot(dx, dz) > 1e-6)) return 'CONTACT';
  let relative = Math.atan2(dz, dx) - (Number(player.rot) || 0);
  while (relative > Math.PI) relative -= Math.PI * 2;
  while (relative <= -Math.PI) relative += Math.PI * 2;
  const quarter = Math.PI / 4;
  if (relative >= -quarter && relative <= quarter) return 'FRONT';
  if (relative > quarter && relative < Math.PI - quarter) return 'STARBOARD';
  if (relative < -quarter && relative > -Math.PI + quarter) return 'PORT';
  return 'AFT';
}

export function buildDamageReadout(state, payload = {}) {
  const after = payload.after || {};
  const layer = String(payload.dominantLayer || 'impact').toUpperCase();
  const subsystem = payload.subsystemId ? String(payload.subsystemId).replace(/_/g, ' ').toUpperCase() : null;
  const readout = {
    direction: impactDirection(state, payload.attackerId, payload.pos),
    attacker: attackerLabel(state, payload.attackerId),
    weapon: weaponLabel(weaponIdFromDamage(payload)),
    layer,
    subsystem,
    shieldPct: pct(after.shield, after.shieldMax),
    armorPct: pct(after.armor, after.armorMax),
    hullPct: pct(after.hull, after.hullMax),
  };
  readout.text = [readout.direction, readout.attacker, readout.weapon, readout.layer, readout.subsystem]
    .filter(Boolean)
    .join(' · ');
  return readout;
}

/** One concise, causal next-attempt hint derived from the same lethal facts as the receipt. */
export function defeatCounterplayHint(state, attackerId, lethal = {}, finalDamage = null) {
  const attacker = attackerId == null || !state.entities || typeof state.entities.get !== 'function'
    ? null : state.entities.get(attackerId);
  const data = attacker && attacker.data || {};
  const enemy = ENEMY_BY_ID.get(data.lootTableId || data.enemyTypeId);
  const authored = data.counterHint || enemy && enemy.counterHint;
  if (typeof authored === 'string' && authored.trim()) {
    return COUNTER_HINT_TEXT[authored] || authored;
  }

  const originKind = String(lethal.origin && lethal.origin.kind || lethal.context || '').toLowerCase();
  const sourceKind = String(lethal.packet && lethal.packet.source && lethal.packet.source.kind || '').toLowerCase();
  const weaponId = lethal.weaponId || weaponIdFromDamage(lethal) || '';
  if (originKind.includes('field') || sourceKind.includes('field')) {
    return 'Break the field source or leave its radius before committing to the trapped target.';
  }
  if (originKind.includes('collision')) {
    return 'Reduce closing speed and use lateral thrust before the next contact.';
  }
  if (originKind === 'deep_core_gas') {
    return 'Back out when the gas readout rises; re-enter after the pocket vents.';
  }
  if (weaponId.includes('missile')) {
    return 'Break the missile lock with cover or countermeasures before re-engaging.';
  }
  if (weaponId.includes('railgun')) {
    return 'Leave the firing line and close from an off-axis bearing between rail shots.';
  }
  if (weaponId.includes('emp')) {
    return 'Preserve distance while disabled; commit only after drive control returns.';
  }
  const direction = String(finalDamage && finalDamage.direction || '').toLowerCase();
  return direction && direction !== 'unknown' && direction !== 'contact'
    ? `The final hit came from ${direction}; rotate that side away and break line of fire sooner.`
    : 'Break line of fire before the damaged layer is exposed again.';
}

export function formatDefeatCause(state, receipt = {}) {
  const source = receipt.source || defeatSource(state, receipt.killerId, receipt.context);
  const weaponId = receipt.weaponId || weaponIdFromDamage(receipt);
  const weapon = weaponId ? weaponLabel(weaponId) : null;
  const layer = receipt.dominantLayer ? String(receipt.dominantLayer).toLowerCase() + ' breach' : 'hull loss';
  const context = receipt.context && !['weapon', 'combat'].includes(receipt.context)
    ? contextLabel(receipt.context) : null;
  return [source.label, source.faction, weapon, layer, context].filter(Boolean).join(' · ');
}

function fatalSummary(source, weapon, direction, dominantLayer) {
  const layer = String(dominantLayer || 'hull').toLowerCase();
  if (source.kind === 'environment') return `${source.label} breached the ${layer}.`;
  if (source.kind === 'self') {
    return `${weapon || 'Self-inflicted damage'} breached your ${layer}.`;
  }
  const faction = source.faction ? ` (${source.faction})` : '';
  const bearing = String(direction || 'unknown').toLowerCase();
  return `Final hit from ${source.label}${faction} · ${weapon || 'unidentified weapon'} · ${bearing} ${layer} breach.`;
}

function stationIsLawful(station) {
  if (!station || station.type === 'blackmarket') return false;
  const faction = FACTION_BY_ID.get(station.factionId);
  return !faction || !NON_LAWFUL_PERSONALITIES.has(faction.personality);
}

function liveStationPosition(state, stationId) {
  const active = state.world && state.world.activeSector;
  const record = active && Array.isArray(active.stations)
    ? active.stations.find((station) => (station.stationId || station.id) === stationId)
    : null;
  if (record && record.pos) return { x: Number(record.pos.x) || 0, z: Number(record.pos.z) || 0 };
  const entities = state.entityList || [];
  const entity = entities.find((item) => item && item.type === 'station' && item.data && item.data.stationId === stationId);
  return entity && entity.pos ? { x: Number(entity.pos.x) || 0, z: Number(entity.pos.z) || 0 } : null;
}

function chooseLawfulStation(state) {
  const remembered = state.player && state.player.insurance && state.player.insurance.lastStationId;
  const rememberedDef = STATION_BY_ID.get(remembered);
  if (rememberedDef && stationIsLawful(rememberedDef)) return rememberedDef;

  const currentSectorId = state.world && state.world.currentSectorId;
  const currentSector = SECTORS.find((sector) => sector.id === currentSectorId);
  const local = currentSector && (currentSector.stations || []).find(stationIsLawful);
  if (local) return { ...local, sectorId: currentSector.id, security: currentSector.security };

  const helios = STATION_BY_ID.get('station_helios');
  if (helios) return helios;
  return [...STATION_BY_ID.values()].find(stationIsLawful) || null;
}

export function buildRecoveryPlan(state, playerEntity) {
  const station = chooseLawfulStation(state);
  const insurance = state.player && state.player.insurance || {};
  const owned = (state.player && state.player.ownedShips || [])[state.player && state.player.activeShipIndex || 0] || {};
  const shipId = owned.defId || playerEntity && playerEntity.data && playerEntity.data.defId || 'ship_kestrel';
  const ship = SHIP_BY_ID.get(shipId) || SHIP_BY_ID.get('ship_kestrel');
  const rate = Math.max(0, Math.min(1, Number(insurance.rate) || 0));
  const deductible = Math.max(0, Math.round(Number(insurance.deductibleCr) || 0));
  const policyTier = insurance.activePolicy && insurance.activePolicy.tier || insurance.tier || null;
  const insured = policyTier === 'full' || policyTier === 'loyalty' || insurance.insuredModules === true;
  const shipPrice = Math.max(0, Math.round(Number(ship && ship.price) || 0));
  const quotedCostCr = ship && ship.tier === 0
    ? deductible
    : insured
      ? deductible
      : Math.max(deductible, Math.round(shipPrice * (1 - rate)));
  const availableCredits = Math.max(0, Math.round(Number(state.player && state.player.credits) || 0));
  const costCr = Math.min(quotedCostCr, availableCredits);
  const hardshipCoveredCr = quotedCostCr - costCr;

  const cargo = state.player && state.player.cargo;
  const cargoLosses = [];
  let persistentCargoProtected = 0;
  for (const commodityId of Object.keys(cargo && cargo.items || {}).sort()) {
    const have = Math.max(0, Math.floor(cargo.items[commodityId] || 0));
    const persistent = state.story && Array.isArray(state.story.persistentCargo)
      && state.story.persistentCargo.includes(commodityId);
    if (persistent) {
      persistentCargoProtected += have;
      continue;
    }
    const qty = Math.floor(have * 0.5);
    if (qty > 0) cargoLosses.push({ commodityId, qty });
  }

  return {
    schemaVersion: 1,
    stationId: station && station.id || null,
    stationName: station && station.name || 'Lawful recovery dock',
    sectorId: station && station.sectorId || state.world && state.world.currentSectorId || null,
    stationPos: station ? liveStationPosition(state, station.id) : { x: 0, z: 0 },
    shipId,
    costCr,
    quotedCostCr,
    hardshipCoveredCr,
    insuranceRate: rate,
    insuranceStatus: (ship && ship.tier === 0
      ? `STARTER RECOVERY · ${deductible.toLocaleString('en-US')} CR DEDUCTIBLE`
      : insured
        ? `INSURED · ${Math.round(rate * 100)}% COVERAGE`
        : `UNINSURED · ${Math.round((1 - rate) * 100)}% HULL SHARE`)
      + (hardshipCoveredCr > 0 ? ` · ${hardshipCoveredCr.toLocaleString('en-US')} CR RECOVERY FUND` : ''),
    cargoLosses,
    cargoLostQty: cargoLosses.reduce((total, loss) => total + loss.qty, 0),
    persistentCargoProtected,
  };
}

export function buildDefeatReceipt(state, playerEntity, killerId, lethal = {}) {
  const weaponId = lethal.weaponId || weaponIdFromDamage({
    origin: lethal.origin,
    packet: lethal.packet,
  });
  const dominantLayer = lethal.dominantLayer || lethal.result && lethal.result.dominantLayer || 'hull';
  const context = lethal.context || lethal.origin && lethal.origin.kind || 'combat';
  const source = defeatSource(state, killerId, context);
  const subsystemId = lethal.subsystemId || lethal.result && lethal.result.subsystemId || null;
  const finalDamage = buildDamageReadout(state, {
    attackerId: killerId,
    weaponId,
    dominantLayer,
    subsystemId,
    after: lethal.result && lethal.result.after || {},
    pos: lethal.packet && lethal.packet.hit && lethal.packet.hit.pos || null,
  });
  const counterplayHint = defeatCounterplayHint(state, killerId, lethal, finalDamage);
  const recovery = buildRecoveryPlan(state, playerEntity);
  return {
    schemaVersion: 1,
    tick: Number.isFinite(state.tick) ? state.tick | 0 : 0,
    simTime: Number.isFinite(state.simTime) ? state.simTime : 0,
    killerId: killerId == null ? null : killerId,
    source,
    attacker: source.label,
    factionId: source.factionId,
    faction: source.faction,
    weaponId,
    weapon: weaponId ? weaponLabel(weaponId) : null,
    dominantLayer,
    direction: finalDamage.direction,
    subsystemId,
    vitalsPct: {
      shield: finalDamage.shieldPct,
      armor: finalDamage.armorPct,
      hull: finalDamage.hullPct,
    },
    context,
    cause: formatDefeatCause(state, { killerId, source, weaponId, dominantLayer, context }),
    fatalSummary: fatalSummary(source, weaponId ? weaponLabel(weaponId) : null, finalDamage.direction, dominantLayer),
    counterplayHint,
    pos: playerEntity && playerEntity.pos ? { x: playerEntity.pos.x, z: playerEntity.pos.z } : null,
    recovery,
  };
}

export const PLAYER_RESCUE_CALL_FEE_CR = 350;
export const LIKED_FACTION_RESCUE_REP = 100;
export const LIKED_RESCUE_DELAY_S = 14;

function clonePlain(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function registryOwner(registry, name) {
  return registry && typeof registry.get === 'function' ? registry.get(name) : null;
}

function currentSectorFactionId(state) {
  const sectorId = state && state.world && state.world.currentSectorId;
  const active = state && state.world && (state.world.currentSector || state.world.activeSector);
  if (active && active.factionId) return active.factionId;
  const sector = SECTORS.find((candidate) => candidate.id === sectorId);
  return sector && sector.factionId || null;
}

export function likedFactionRescueQuote(state) {
  const factionId = currentSectorFactionId(state);
  const rec = factionId && state && state.factions && state.factions[factionId];
  const rep = Number(rec && rec.rep) || 0;
  return {
    available: !!factionId && rep >= LIKED_FACTION_RESCUE_REP,
    factionId,
    rep,
    requiredRep: LIKED_FACTION_RESCUE_REP,
    delayS: LIKED_RESCUE_DELAY_S,
  };
}

export function isPhysicalDefeatReceipt(receipt) {
  return !!(receipt && receipt.loss && receipt.loss.schemaVersion === 1 && receipt.loss.lossId);
}

/**
 * Runtime sequence coordinator installed by combat. It deliberately discovers the registered
 * owners at the commit edges instead of importing their implementations: ships owns hulls,
 * cargo owns the hold, survivorPod owns the player body, aftermathWrecks owns the hulk, and
 * traffic owns the responding NPC. A missing owner fails closed into combat's legacy recovery
 * rather than leaving half a loss in the world.
 */
export class PlayerDefeatCoordinator {
  constructor(ctx, adapters = {}) {
    this.state = ctx && ctx.state;
    this.bus = ctx && ctx.bus;
    this.registry = ctx && ctx.registry;
    this.restorePlayerAtRecoveryDock = adapters.restorePlayerAtRecoveryDock || null;
    this.onSequenceCleared = adapters.onSequenceCleared || null;
  }

  _owner(name) {
    return registryOwner(this.registry, name);
  }

  activeReceipt() {
    const combatReceipt = this.state && this.state.combat && this.state.combat.lastPlayerDefeat;
    const savedReceipt = this.state && this.state.player && this.state.player.activePhysicalDefeatReceipt;
    const receipt = isPhysicalDefeatReceipt(combatReceipt)
      ? combatReceipt
      : isPhysicalDefeatReceipt(savedReceipt) ? savedReceipt : null;
    // Combat's runtime serializer intentionally persists only kernel state. Keep the one physical
    // receipt on the already-saved player record and mirror it into combat for the existing UI.
    if (receipt && this.state.combat && this.state.combat.lastPlayerDefeat !== receipt) {
      this.state.combat.lastPlayerDefeat = receipt;
    }
    return receipt;
  }

  clear() {
    if (this.state && this.state.combat) this.state.combat.lastPlayerDefeat = null;
    if (this.state && this.state.player) delete this.state.player.activePhysicalDefeatReceipt;
  }

  tryBegin(playerEntity, receipt) {
    if (!playerEntity || !receipt || this.activeReceipt()) return { ok: false, reason: 'already_active' };
    const ships = this._owner('ships');
    const cargo = this._owner('cargo');
    const aftermath = this._owner('aftermathWrecks');
    const survivor = this._owner('survivorPod');
    if (!ships || typeof ships.capturePlayerLoss !== 'function'
      || !cargo || typeof cargo.removeCargo !== 'function' || typeof cargo.addCargo !== 'function'
      || !aftermath || typeof aftermath.recordPlayerLoss !== 'function'
      || !survivor || typeof survivor.convertPlayerToPod !== 'function') {
      return { ok: false, reason: 'physical_owner_unavailable' };
    }

    const seed = this.state && this.state.meta && this.state.meta.seed || 1;
    const lossId = `player_loss_${(seed >>> 0).toString(36)}_${Math.max(0, receipt.tick | 0).toString(36)}`;
    const shipSnapshot = ships.capturePlayerLoss(lossId);
    if (!shipSnapshot) return { ok: false, reason: 'ship_snapshot_unavailable' };

    const cargoManifest = [];
    const items = this.state && this.state.player && this.state.player.cargo
      && this.state.player.cargo.items || {};
    for (const commodityId of Object.keys(items).sort()) {
      const removed = cargo.removeCargo(commodityId, Math.max(0, Math.floor(Number(items[commodityId]) || 0)));
      if (removed > 0) cargoManifest.push({ commodityId, qty: removed });
    }

    const liked = likedFactionRescueQuote(this.state);
    const marker = aftermath.recordPlayerLoss({
      lossId,
      receipt,
      shipSnapshot,
      cargoManifest,
    });
    if (!marker) {
      for (const row of cargoManifest) cargo.addCargo(row.commodityId, row.qty, { sourceKind: 'player_loss_rollback' });
      return { ok: false, reason: 'wreck_unavailable' };
    }

    const loss = {
      schemaVersion: 1,
      lossId,
      phase: 'pod_drift',
      podEntityId: playerEntity.id,
      wreckMarkerId: marker.markerId,
      wreckEntityId: marker.liveEntityId == null ? null : marker.liveEntityId,
      cargoCustodyQty: cargoManifest.reduce((sum, row) => sum + row.qty, 0),
      rescueCallFeeCr: PLAYER_RESCUE_CALL_FEE_CR,
      likedRescueAvailable: liked.available,
      likedFactionId: liked.factionId,
      likedFactionRep: liked.rep,
      likedRescueDelayS: liked.delayS,
      startedAt: Number(this.state.simTime) || 0,
    };
    receipt.loss = loss;
    receipt.recovery = {
      ...(receipt.recovery || {}),
      cargoLosses: [],
      cargoLostQty: 0,
      hulkCargoQty: loss.cargoCustodyQty,
      insuranceStatus: 'INSURANCE SETTLEMENT PENDING',
    };
    const pod = survivor.convertPlayerToPod(playerEntity, { lossId, receipt });
    if (!pod) {
      if (typeof aftermath.cancelPlayerLoss === 'function') aftermath.cancelPlayerLoss(marker.markerId, 'pod_unavailable');
      for (const row of cargoManifest) cargo.addCargo(row.commodityId, row.qty, { sourceKind: 'player_loss_rollback' });
      delete receipt.loss;
      return { ok: false, reason: 'pod_unavailable' };
    }

    const economy = this._owner('economy');
    const settled = economy && typeof economy.settlePlayerLossPolicy === 'function'
      ? economy.settlePlayerLossPolicy({ lossId, shipSnapshot, cargoManifest }) : null;
    if (settled && settled.ok === true && settled.claim) {
      loss.insuranceClaim = clonePlain(settled.claim);
      receipt.insuranceClaim = clonePlain(settled.claim);
      receipt.recovery.insuranceStatus = settled.claim.tier === 'loaner'
        ? `UNINSURED · STARTER LOANER · ${settled.claim.debtAddedCr.toLocaleString('en-US')} CR DEBT`
        : `${String(settled.claim.tier).toUpperCase()} CLAIM · ${settled.claim.refitFundingCr.toLocaleString('en-US')} CR REFIT FUNDED`
          + (settled.claim.cashPayoutCr > 0
            ? ` · ${settled.claim.cashPayoutCr.toLocaleString('en-US')} CR CARGO CASH` : ' · NO CASH PAYOUT');
    } else {
      const legacy = this.state.player && this.state.player.insurance || {};
      const legacyTier = legacy.activePolicy && legacy.activePolicy.tier
        || (legacy.insuredModules === true ? 'full' : 'loaner');
      loss.insuranceClaim = { tier: legacyTier, settlementValueCr: 0, debtAddedCr: 0 };
      receipt.recovery.insuranceStatus = legacyTier === 'loaner'
        ? 'NO ACTIVE POLICY · STARTER LOANER ON RESCUE'
        : 'FULL LEGACY COVER · HULL + FIT PRESERVED';
    }

    this.state.combat.lastPlayerDefeat = receipt;
    this.state.player.activePhysicalDefeatReceipt = receipt;
    this.bus.emit('player:death', { ...receipt, recoverable: true, physicalLoss: true });
    this.bus.emit('aceMemory:playerKilled', {
      killerId: receipt.killerId,
      lossId,
      t: Number(this.state.simTime) || 0,
      sectorId: this.state.world && this.state.world.currentSectorId || null,
    });
    this.bus.emit('camera:shake', { amount: 0.9 });
    this.bus.emit('game:over', { reason: 'ship_destroyed', recoverable: true, physicalLoss: true, receipt });
    return { ok: true, receipt, marker, pod };
  }

  requestRescue(payload = {}) {
    const receipt = this.activeReceipt();
    const loss = receipt && receipt.loss;
    if (!loss || !['pod_drift', 'rescue_wait'].includes(loss.phase)) {
      return this._fail('no_pending_defeat');
    }
    const mode = payload.mode === 'wait' ? 'wait' : 'paid';
    if (mode === 'wait') {
      const liked = likedFactionRescueQuote(this.state);
      if (!liked.available) return this._fail('liked_rescue_unavailable');
      loss.phase = 'rescue_wait';
      loss.rescueMode = 'liked_faction';
      loss.rescueFactionId = liked.factionId;
      loss.rescueDueAt = (Number(this.state.simTime) || 0) + liked.delayS;
      this.bus.emit('playerDefeat:rescueWaiting', clonePlain(loss));
      return { ok: true, waiting: true, dueAt: loss.rescueDueAt };
    }

    const fee = Math.max(0, Math.round(Number(loss.rescueCallFeeCr) || PLAYER_RESCUE_CALL_FEE_CR));
    if (Math.max(0, Number(this.state.player && this.state.player.credits) || 0) < fee) {
      return this._fail('rescue_fee_unavailable');
    }
    return this._authorizeRescue(receipt, { mode: 'paid', feeCr: fee, factionId: null });
  }

  update() {
    const receipt = this.activeReceipt();
    const loss = receipt && receipt.loss;
    if (!loss || loss.phase !== 'rescue_wait') return;
    if ((Number(this.state.simTime) || 0) < Number(loss.rescueDueAt || Infinity)) return;
    this._authorizeRescue(receipt, {
      mode: 'liked_faction',
      feeCr: 0,
      factionId: loss.rescueFactionId || loss.likedFactionId || null,
    });
  }

  _authorizeRescue(receipt, { mode, feeCr, factionId }) {
    const loss = receipt.loss;
    const request = {
      lossId: loss.lossId,
      podEntityId: loss.podEntityId,
      sectorId: this.state.world && this.state.world.currentSectorId || null,
      mode,
      factionId,
      result: null,
    };
    this.bus.emit('playerDefeat:rescueAuthorized', request);
    if (!request.result || request.result.ok !== true) {
      loss.phase = 'pod_drift';
      loss.rescueFailure = request.result && request.result.reason || 'responder_unavailable';
      return this._fail(loss.rescueFailure);
    }
    if (feeCr > 0) this.bus.emit('economy:chargeCredits', { amount: feeCr, reason: 'player_loss:rescue_call' });
    loss.phase = 'rescue_inbound';
    loss.rescueMode = mode;
    loss.responderId = request.result.responderId;
    loss.rescueAuthorizedAt = Number(this.state.simTime) || 0;
    this.bus.emit('playerDefeat:rescueInbound', clonePlain(loss));
    return { ok: true, responderId: loss.responderId, feeCr };
  }

  podRescued(payload = {}) {
    const receipt = this.activeReceipt();
    const loss = receipt && receipt.loss;
    if (!loss || loss.phase !== 'rescue_inbound' || payload.lossId !== loss.lossId
      || payload.entityId !== loss.podEntityId) return false;
    const ships = this._owner('ships');
    const aftermath = this._owner('aftermathWrecks');
    const playerEntity = this.state.entities && this.state.entities.get
      ? this.state.entities.get(this.state.playerId) : null;
    if (!ships || typeof ships.applyPlayerLossRefit !== 'function' || !playerEntity
      || typeof this.restorePlayerAtRecoveryDock !== 'function') return false;

    const playerLoss = aftermath && typeof aftermath.playerLossForMarker === 'function'
      ? aftermath.playerLossForMarker(loss.wreckMarkerId) : null;
    const claimTier = loss.insuranceClaim && loss.insuranceClaim.tier;
    const tier = ['basic', 'full', 'loyalty'].includes(claimTier) ? claimTier : 'loaner';
    const refit = ships.applyPlayerLossRefit({
      lossId: loss.lossId,
      tier,
      shipSnapshot: playerLoss && playerLoss.shipSnapshot,
      insuranceClaim: loss.insuranceClaim || null,
    });
    if (!refit || refit.ok !== true) return false;
    this.restorePlayerAtRecoveryDock(playerEntity, receipt.recovery || buildRecoveryPlan(this.state, playerEntity));
    loss.phase = 'rescued';
    loss.rescuedAt = Number(this.state.simTime) || 0;
    loss.recoveryTier = tier;
    if (aftermath && typeof aftermath.offerPlayerRecoveryTow === 'function') {
      aftermath.offerPlayerRecoveryTow(loss.wreckMarkerId, {
        stationId: receipt.recovery && receipt.recovery.stationId || null,
      });
    }
    this.clear();
    if (typeof this.onSequenceCleared === 'function') this.onSequenceCleared();
    this.bus.emit('player:respawn', {
      stationId: receipt.recovery && receipt.recovery.stationId || null,
      stationName: receipt.recovery && receipt.recovery.stationName || null,
      shipId: refit.shipId,
      lossId: loss.lossId,
      recoveryTier: tier,
      physicalRescue: true,
      responderId: payload.rescueHullId || loss.responderId || null,
    });
    this.bus.emit('camera:shake', { amount: 0.35 });
    return true;
  }

  wreckDelivered(payload = {}) {
    if (!payload.lossId || !payload.shipSnapshot || !Array.isArray(payload.cargoManifest)) {
      payload.result = { ok: false, reason: 'invalid_delivery_receipt' };
      return false;
    }
    const ships = this._owner('ships');
    const cargo = this._owner('cargo');
    const aftermath = this._owner('aftermathWrecks');
    const economy = this._owner('economy');
    if (!ships || typeof ships.recoverPlayerLoss !== 'function'
      || !cargo || typeof cargo.addCargo !== 'function'
      || !aftermath || typeof aftermath.consumePlayerTowDelivery !== 'function') {
      payload.result = { ok: false, reason: 'recovery_owner_unavailable' };
      return false;
    }
    if (!aftermath.consumePlayerTowDelivery(payload)) {
      payload.result = { ok: false, reason: 'delivery_not_physical' };
      return false;
    }
    const hull = ships.recoverPlayerLoss({ lossId: payload.lossId, shipSnapshot: payload.shipSnapshot });
    if (!hull || hull.ok !== true) return false;
    const cargoLien = economy && typeof economy.consumeInsuranceCargoLien === 'function'
      ? economy.consumeInsuranceCargoLien({ lossId: payload.lossId }) : false;
    const remaining = [];
    if (!cargoLien) {
      for (const row of payload.cargoManifest) {
        const qty = Math.max(0, Math.floor(Number(row && row.qty) || 0));
        if (!(qty > 0) || !row.commodityId) continue;
        const accepted = cargo.addCargo(row.commodityId, qty, { sourceKind: 'recovered_player_hulk', lossId: payload.lossId });
        if (accepted < qty) remaining.push({ commodityId: row.commodityId, qty: qty - accepted });
      }
    }
    payload.remainingCargoManifest = remaining;
    payload.cargoLienConsumed = cargoLien;
    payload.result = remaining.length
      ? { ok: false, reason: 'cargo_capacity', recoveredHull: true }
      : { ok: true, recoveredHull: true, shipId: hull.shipId, cargoLienConsumed: cargoLien };
    return payload.result.ok;
  }

  rearmAfterLoad() {
    const receipt = this.activeReceipt();
    const loss = receipt && receipt.loss;
    const player = this.state && this.state.entities && this.state.entities.get
      ? this.state.entities.get(this.state.playerId) : null;
    const stamp = player && player.data && player.data.survivorPodCausal;
    if (!loss || !player || player.type !== 'payload' || !stamp
      || stamp.playerOccupied !== true || stamp.lossId !== loss.lossId) return false;
    // Entity ids are intentionally fresh across Continue; the receipt follows the canonical player
    // body and adopts its restored id instead of duplicating or searching for a second pod.
    loss.podEntityId = player.id;
    stamp.entityId = player.id;
    stamp.victimId = player.id;
    player.data.ownerId = player.id;
    player.data.sourceVictimId = player.id;
    player.data.ownership = { ownerId: player.id, factionId: 'player' };
    this.state.player.activePhysicalDefeatReceipt = receipt;
    this.state.combat.lastPlayerDefeat = receipt;
    return true;
  }

  _fail(reason) {
    const messages = {
      no_pending_defeat: 'No active survival-pod recovery is available.',
      liked_rescue_unavailable: 'No friendly local patrol owes you a pickup.',
      rescue_fee_unavailable: `Rescue dispatch requires ${PLAYER_RESCUE_CALL_FEE_CR} cr.`,
      responder_unavailable: 'No rescue hull can reach this pod yet.',
    };
    this.bus.emit('toast', { text: messages[reason] || messages.responder_unavailable, kind: 'error', ttl: 4 });
    this.bus.emit('player:recoveryFailed', { reason });
    return { ok: false, reason };
  }
}

export function createPlayerDefeatCoordinator(ctx, adapters) {
  return new PlayerDefeatCoordinator(ctx, adapters);
}
