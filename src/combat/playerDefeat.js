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
  const insured = insurance.insuredModules === true;
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
    pos: playerEntity && playerEntity.pos ? { x: playerEntity.pos.x, z: playerEntity.pos.z } : null,
    recovery,
  };
}
