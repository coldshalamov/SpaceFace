// BP-02.1/C3 Scan-Reveals-Loadout.
//
// Pure helpers for the scanner add-on. The system writes the returned payload to
// entity.data.scanRevealed for UI consumers only; AI/combat never read this.
import { SHIPS } from './ships.js';
import { WEAPONS } from './weapons.js';
import { weakPointForEntity } from './weakPoints.js';
import { hash32 } from '../core/rng.js';

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

// Wreck investigation tiers share the ship bands: a far pulse sees a silhouette,
// a near pulse names the loss, a close pulse reads the manifest. Generic debris with
// no ledger provenance never borrows a story — it reads class-only at every tier.
export function wreckQualityForDistance(distance) {
  if (!(distance <= SCAN_REVEAL_CLASS_RADIUS)) return null;
  if (distance <= SCAN_REVEAL_DEEP_RADIUS) return 'deep';
  if (distance <= SCAN_REVEAL_FULL_RADIUS) return 'identified';
  return 'contact';
}

const WRECK_FACTION_WORD = {
  faction_scn: 'Concord',
  faction_concord: 'Concord',
  faction_reach: 'Reach',
  faction_dmc: 'Drift',
  faction_drift: 'Drift',
  faction_quiet: 'the Quiet',
  faction_mts: 'MTS',
  faction_free: 'Frontier',
};

const WRECK_LOSS_NOUN = {
  outpost: 'outpost',
  fleet: 'fleet vessel',
  drone: 'mining drone',
  ship: 'ship',
  trader: 'hauler',
};

export function wreckStoryForLoss(loss, sectorName) {
  if (!loss) return null;
  const who = WRECK_FACTION_WORD[loss.factionId] || 'unmarked';
  const noun = WRECK_LOSS_NOUN[loss.kind] || 'hauler';
  const verb = loss.kind === 'outpost' ? 'was raided' : 'went dark';
  const article = WRECK_FACTION_WORD[loss.factionId] ? 'A' : 'An';
  return `${article} ${who} ${noun} ${verb} near ${sectorName || 'unknown space'}.`;
}

function wreckPoolLots(entity) {
  const pool = entity && entity.data && entity.data.salvagePool;
  if (!pool || typeof pool !== 'object') return [];
  return Object.entries(pool)
    .filter(([, qty]) => (Number(qty) || 0) > 0)
    .map(([id, qty]) => ({ id, qty: Math.floor(Number(qty)) }))
    .sort((a, b) => b.qty - a.qty || String(a.id).localeCompare(String(b.id)));
}

export function wreckSalvageHintForEntity(entity) {
  const lots = wreckPoolLots(entity);
  if (!lots.length) return 'picked clean';
  const total = lots.reduce((s, lot) => s + lot.qty, 0);
  return `${lots[0].id} (${total}u aboard)`;
}

export function buildWreckScanReveal(entity, state, options = {}) {
  if (!entity || entity.type !== 'wreck') return null;
  if (!entity.alive || !entity.pos) return null;
  const origin = options.origin || options.pos;
  const distance = scanRevealDistance(origin, entity);
  const quality = wreckQualityForDistance(distance);
  if (!quality) return null;

  const data = entity.data || {};
  const now = finite(options.now, state && state.simTime || 0);
  const loss = options.loss || null;
  const provenance = data.provenance || null;
  const lossId = (loss && loss.lossId) || (provenance && provenance.lossId) || null;
  const reveal = {
    entityId: entity.id,
    kind: 'wreck',
    revealedAt: now,
    quality,
    rangeWu: Math.round(distance),
    lossId,
    wreckClass: data.wreckClass || null,
    wreckLabel: data.wreckClassLabel || data.scanLabel || 'Unidentified wreck',
    story: null,
    factionId: (loss && loss.factionId) || (provenance && provenance.factionId) || null,
    simDay: (loss && Number.isFinite(loss.simDay)) ? loss.simDay : null,
    daysAgo: null,
    cargoHint: (loss && loss.cargoHint) || (provenance && provenance.cargoHint) || null,
    salvageHint: null,
    cold: false,
    cause: data.interventionCause || null,
    recognized: false,
  };
  // Memory pays: an investigated loss reads its story even at contact range.
  if (quality === 'contact') {
    if (loss && options.known) {
      reveal.story = wreckStoryForLoss(loss, options.sectorName || null);
      reveal.recognized = true;
    }
    return reveal;
  }
  // Identified+: the story only when a ledger entry actually backs it.
  if (loss) {
    const sector = options.sectorName
      || (state && state.world && state.world.sectors && state.world.sectors[loss.sectorId]
        && state.world.sectors[loss.sectorId].name)
      || null;
    reveal.story = wreckStoryForLoss(loss, sector);
    const daySeconds = 600;
    const today = Math.floor(now / daySeconds);
    reveal.daysAgo = Number.isFinite(loss.simDay) ? Math.max(0, today - loss.simDay) : null;
  }
  if (quality === 'deep') {
    reveal.salvageHint = wreckSalvageHintForEntity(entity);
    reveal.cold = wreckPoolLots(entity).length === 0;
  }
  return reveal;
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
    kind: reveal.kind || 'ship',
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
    lossId: reveal.lossId,
    wreckClass: reveal.wreckClass,
    wreckLabel: reveal.wreckLabel,
    story: reveal.story,
    salvageHint: reveal.salvageHint,
    cold: reveal.cold,
    cause: reveal.cause,
    recognized: reveal.recognized,
  });
}

export function sameScanReveal(a, b) {
  return !!a && !!b && scanRevealFingerprint(a) === scanRevealFingerprint(b);
}

// INF-U18: sealed survivor caches in generic debris. Loss-less hulls never borrow
// a story — but a seeded share holds a physical cache: cargo the crew sealed
// before the end. Fresh hulls cache more often than picked-clean ones, and a cold
// hull's cache is a single missed lot. Deterministic per wreck id + seed so the
// scan path and the beam path agree on what is inside.
export const DEBRIS_CACHE_FRESH_CHANCE = 40;
export const DEBRIS_CACHE_COLD_CHANCE = 20;
export const DEBRIS_CACHE_TTL_S = 150;

const DEBRIS_CACHE_LOTS_BY_KIND = Object.freeze({
  cargo: Object.freeze([
    Object.freeze({ commodityId: 'cmdty_salvage_electronics', amount: 2 }),
    Object.freeze({ commodityId: 'cmdty_scrap_metal', amount: 2 }),
  ]),
  valuables: Object.freeze([
    Object.freeze({ commodityId: 'cmdty_luxury_goods', amount: 1 }),
    Object.freeze({ commodityId: 'cmdty_salvage_electronics', amount: 1 }),
  ]),
  munitions: Object.freeze([
    Object.freeze({ commodityId: 'cmdty_munitions', amount: 2 }),
    Object.freeze({ commodityId: 'cmdty_scrap_metal', amount: 1 }),
  ]),
});
const DEBRIS_CACHE_KINDS = Object.freeze(['cargo', 'valuables', 'munitions']);

/**
 * The sealed cache inside a generic wreck, or null when the hull holds none.
 * Pure: same wreck id + seed + pool always answers the same way.
 */
export function debrisCacheFor(wreck, seed) {
  if (!wreck || wreck.type !== 'wreck') return null;
  const cold = wreckPoolLots(wreck).length === 0;
  const h = hash32((seed >>> 0) || 1, wreck.id, 'debris-cache') >>> 0;
  const chance = cold ? DEBRIS_CACHE_COLD_CHANCE : DEBRIS_CACHE_FRESH_CHANCE;
  if ((h % 100) >= chance) return null;
  const kind = DEBRIS_CACHE_KINDS[(h >>> 7) % DEBRIS_CACHE_KINDS.length];
  const lots = (DEBRIS_CACHE_LOTS_BY_KIND[kind] || []).map((lot) => ({ ...lot }));
  return { kind, cold, lots: cold ? lots.slice(0, 1) : lots };
}

/**
 * Expose the cache as physical pods around the wreck. Bus-only: each lot goes
 * out as an entity:spawnRequest with the wreck's own drift, so the magnet and
 * cargo owners do the rest. Returns the pod specs for tests/telemetry.
 */
export function spawnDebrisCachePods(bus, wreck, cache, now) {
  if (!bus || typeof bus.emit !== 'function' || !wreck || !cache || !Array.isArray(cache.lots)) return [];
  const wpos = wreck.pos || { x: 0, z: 0 };
  const wvel = wreck.vel || { x: 0, z: 0 };
  const edge = (wreck.radius || 8) + 5;
  const base = ((hash32(wreck.id, 'cache-scatter') >>> 0) % 360) * Math.PI / 180;
  const specs = [];
  cache.lots.forEach((lot, i) => {
    if (!lot || !lot.commodityId || !(lot.amount > 0)) return;
    const ang = base + (i / Math.max(1, cache.lots.length)) * Math.PI * 2;
    const kick = 12 + i * 5;
    specs.push({
      type: 'pickup',
      pos: { x: (wpos.x || 0) + Math.cos(ang) * edge, z: (wpos.z || 0) + Math.sin(ang) * edge },
      vel: {
        x: (wvel.x || 0) + Math.cos(ang) * kick,
        z: (wvel.z || 0) + Math.sin(ang) * kick,
      },
      radius: 3, mass: 0.5, collides: true,
      data: {
        kind: 'cargo', commodityId: lot.commodityId, amount: lot.amount,
        despawnAt: now + DEBRIS_CACHE_TTL_S,
        debrisCache: true,
        scanLabel: 'Sealed cache',
      },
    });
  });
  for (const spec of specs) bus.emit('entity:spawnRequest', { spec });
  return specs;
}
