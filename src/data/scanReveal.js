// BP-02.1/C3 Scan-Reveals-Loadout.
//
// Pure helpers for the scanner add-on. The system writes the returned payload to
// entity.data.scanRevealed for UI consumers only; AI/combat never read this.
import { SHIPS } from './ships.js';
import { WEAPONS } from './weapons.js';
import { weakPointForEntity } from './weakPoints.js';

export const SCAN_REVEAL_FULL_RADIUS = 1200;
export const SCAN_REVEAL_CLASS_RADIUS = 2200;
export const SCAN_REVEAL_DEEP_RADIUS = 520;

const SHIP_BY_ID = new Map(SHIPS.map((ship) => [ship.id, ship]));
const WEAPON_BY_ID = new Map(WEAPONS.map((weapon) => [weapon.id, weapon]));

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function pos2(pos) {
  return { x: finite(pos && pos.x), z: finite(pos && pos.z) };
}

export function scanRevealDistance(origin, entity) {
  if (!origin || !entity || !entity.pos) return Infinity;
  const a = pos2(origin);
  const b = pos2(entity.pos);
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function scanQualityForDistance(distance) {
  if (!(distance <= SCAN_REVEAL_CLASS_RADIUS)) return null;
  return distance <= SCAN_REVEAL_FULL_RADIUS ? 'full' : 'class';
}

export function shipDefForScan(entity) {
  const data = entity && entity.data || {};
  const defId = data.defId || data.shipId || entity.shipId || data.hullId;
  return SHIP_BY_ID.get(defId) || null;
}

function compactWeapon(runtimeWeapon) {
  const defId = runtimeWeapon && (runtimeWeapon.defId || runtimeWeapon.id || runtimeWeapon.weaponId);
  if (!defId) return null;
  const def = WEAPON_BY_ID.get(defId);
  return {
    id: defId,
    name: runtimeWeapon.name || (def && def.name) || defId,
    size: runtimeWeapon.size || (def && def.size) || null,
    facing: runtimeWeapon.facing || 'front',
    tracking: runtimeWeapon.tracking || (def && def.tracking) || 'fixed',
    damageType: runtimeWeapon.damageType || (def && def.damageType) || null,
    range: Math.round(finite(runtimeWeapon.range, def && def.range || 0)),
    dps: Math.round(finite(runtimeWeapon.dps, def && def.dps || 0)),
  };
}

export function scanLoadoutForEntity(entity) {
  const weapons = entity && entity.data && Array.isArray(entity.data.weapons)
    ? entity.data.weapons
    : [];
  return weapons
    .map(compactWeapon)
    .filter(Boolean)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)) || String(a.facing).localeCompare(String(b.facing)));
}

export function isFalseManifestCandidate(entity) {
  const data = entity && entity.data || {};
  const ai = data.ai || {};
  const role = String(data.trafficRole || data.role || ai.archetype || ai.role || '').toLowerCase();
  return !!(
    data.falseManifest ||
    data.hiddenCargo ||
    data.manifestTrust === 'false' ||
    role.includes('smuggl') ||
    (entity && entity.factionId === 'faction_quiet')
  );
}

export function manifestTrustForScan(entity, distance, previousReveal = null) {
  if (!isFalseManifestCandidate(entity)) return 'trusted';
  if (distance <= SCAN_REVEAL_DEEP_RADIUS && previousReveal && previousReveal.manifestTrust === 'false') {
    return 'suspect';
  }
  return 'false';
}

function cargoHintFor(entity, manifestTrust) {
  const data = entity && entity.data || {};
  if (data.cargoHint) return String(data.cargoHint);
  if (data.falseManifest && typeof data.falseManifest === 'object' && data.falseManifest.cargoHint) {
    return String(data.falseManifest.cargoHint);
  }
  if (manifestTrust === 'false') return 'declared civilian cargo';
  if (manifestTrust === 'suspect') return 'manifest mismatch';
  return data.trafficRole ? String(data.trafficRole) : null;
}

export function buildShipScanReveal(entity, state, options = {}) {
  if (!entity || (entity.type !== 'ship' && entity.type !== 'drone')) return null;
  if (!entity.alive || !entity.pos) return null;
  const origin = options.origin || options.pos;
  const distance = scanRevealDistance(origin, entity);
  const quality = scanQualityForDistance(distance);
  if (!quality) return null;

  const data = entity.data || {};
  const shipDef = shipDefForScan(entity);
  const previous = options.previous || data.scanRevealed || null;
  const manifestTrust = manifestTrustForScan(entity, distance, previous);
  const shipId = (shipDef && shipDef.id) || data.defId || data.shipId || null;
  const shipClass = data.shipClass || data.class || data.role || (shipDef && shipDef.role) || entity.role || 'ship';
  const full = quality === 'full';
  const now = finite(options.now, state && state.simTime || 0);
  const weakPoint = full ? weakPointForEntity(entity) : null;

  return {
    entityId: entity.id,
    revealedAt: now,
    quality: full && manifestTrust === 'suspect' ? 'deep' : quality,
    rangeWu: Math.round(distance),
    shipId,
    shipName: data.shipName || data.name || (shipDef && shipDef.name) || shipId || 'Unknown Ship',
    shipClass,
    role: data.role || (shipDef && shipDef.role) || null,
    factionId: entity.factionId || data.factionId || null,
    bountyCr: full ? Math.max(0, Math.round(finite(data.bountyCr, 0))) : null,
    manifestTrust,
    cargoHint: full ? cargoHintFor(entity, manifestTrust) : null,
    weakPoint: weakPoint ? {
      label: weakPoint.label,
      hint: weakPoint.hint,
      arcCenter: weakPoint.arcCenter,
      arcHalfWidth: weakPoint.arcHalfWidth,
      bonusMult: weakPoint.bonusMult,
    } : null,
    loadout: full ? scanLoadoutForEntity(entity) : [],
  };
}

export function scanRevealFingerprint(reveal) {
  if (!reveal) return '';
  return JSON.stringify({
    quality: reveal.quality,
    shipId: reveal.shipId,
    shipName: reveal.shipName,
    shipClass: reveal.shipClass,
    role: reveal.role,
    factionId: reveal.factionId,
    bountyCr: reveal.bountyCr,
    manifestTrust: reveal.manifestTrust,
    cargoHint: reveal.cargoHint,
    weakPoint: reveal.weakPoint,
    loadout: reveal.loadout,
  });
}

export function sameScanReveal(a, b) {
  return !!a && !!b && scanRevealFingerprint(a) === scanRevealFingerprint(b);
}
