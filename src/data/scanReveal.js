// BP-02.1/C3 Scan-Reveals-Loadout.
//
// Pure helpers for the scanner add-on. The system writes the returned payload to
// entity.data.scanRevealed for UI consumers only; AI/combat never read this.
import { SHIPS } from './ships.js';
import { WEAPONS } from './weapons.js';
import { weakPointForEntity } from './weakPoints.js';
import { hash32 } from '../core/rng.js';
import { fittedModuleDefs, maxFittedModuleMod } from '../core/fittedModules.js';

export const SCAN_REVEAL_FULL_RADIUS = 1200;
export const SCAN_REVEAL_CLASS_RADIUS = 2200;
export const SCAN_REVEAL_DEEP_RADIUS = 520;
// PB-BUILD-A (SF-133 stale-clear): a verified read stays claimable for this many seconds
// after the last confirming observation. Below the window the reveal carries the remembered
// loadout as a dated `confirmed` block; past it the memory is cleared rather than silently
// retargeted — a stale read must SAY it is old instead of lying in the present tense.
export const SCAN_REVEAL_CONFIRMED_STALE_S = 240;

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

// PB-BUILD-A (SF-124): the scanner's reach is a fitted capability. The reveal bands scale
// with the strongest fitted `scannerRadiusMult`/`scanRangeMult` module — the same max-fold
// `scannerProfileForState` (src/systems/scanner.js) uses for the pulse itself, duplicated
// here as a pure read so the data layer never imports a system. An unfitted hull keeps the
// authored 1.2 km / 2.2 km law exactly.
export function sensorRadiusMultForScan(state) {
  const a = maxFittedModuleMod(state, 'scannerRadiusMult', 1);
  const b = maxFittedModuleMod(state, 'scanRangeMult', 1);
  return Math.max(1, finite(a, 1), finite(b, 1));
}

// True when the active player fit carries a module whose mods declare `revealCargo` — the
// cargo-scanner capability that turns a resolving scan into a hold read.
export function cargoReaderFittedForScan(state) {
  return fittedModuleDefs(state).some((def) => !!(def && def.mods && def.mods.revealCargo === true));
}

function validRadiusMult(radiusMult) {
  return Number.isFinite(radiusMult) && radiusMult > 0 ? radiusMult : 1;
}

export function scanQualityForDistance(distance, radiusMult = 1) {
  const mult = validRadiusMult(radiusMult);
  if (!(distance <= SCAN_REVEAL_CLASS_RADIUS * mult)) return null;
  return distance <= SCAN_REVEAL_FULL_RADIUS * mult ? 'full' : 'class';
}

// Wreck investigation tiers share the ship bands: a far pulse sees a silhouette,
// a near pulse names the loss, a close pulse reads the manifest. Generic debris with
// no ledger provenance never borrows a story — it reads class-only at every tier.
export function wreckQualityForDistance(distance, radiusMult = 1) {
  const mult = validRadiusMult(radiusMult);
  if (!(distance <= SCAN_REVEAL_CLASS_RADIUS * mult)) return null;
  if (distance <= SCAN_REVEAL_DEEP_RADIUS * mult) return 'deep';
  if (distance <= SCAN_REVEAL_FULL_RADIUS * mult) return 'identified';
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
  const quality = wreckQualityForDistance(distance, sensorRadiusMultForScan(state));
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

export function manifestTrustForScan(entity, distance, previousReveal = null, deepRadius = SCAN_REVEAL_DEEP_RADIUS) {
  if (!isFalseManifestCandidate(entity)) return 'trusted';
  const previous = previousReveal && previousReveal.manifestTrust;
  // A contradiction sticks. Falling back to the declared line on the next pulse
  // would mint a new clue every other scan and hide that the hold already mismatched.
  if (previous === 'suspect') return 'suspect';
  const radius = Number.isFinite(deepRadius) && deepRadius > 0 ? deepRadius : SCAN_REVEAL_DEEP_RADIUS;
  if (distance <= radius && previous === 'false') return 'suspect';
  return 'false';
}

function cargoHintFor(entity, manifestTrust) {
  const data = entity && entity.data || {};
  const cover = data.falseManifest && typeof data.falseManifest === 'object' && data.falseManifest.cargoHint
    ? String(data.falseManifest.cargoHint)
    : null;
  // A false or merely suspect manifest shows the declared line only. hiddenCargo,
  // or a cargoHint that names the real hold, stays off the reveal until a later
  // observation earns a contradiction — and even then the secret itself is not copied.
  if (manifestTrust === 'false' || manifestTrust === 'suspect') {
    if (cover) return cover;
    if (manifestTrust === 'suspect') return 'manifest mismatch';
    return 'declared civilian cargo';
  }
  if (data.cargoHint) return String(data.cargoHint);
  return data.trafficRole ? String(data.trafficRole) : null;
}

// The module ids a resolving read actually observed on the hull — the scan-time snapshot of
// the same source `moduleIdsForBuild` (buildIdentity) reads live. Sorted + deduped so the
// confirmed record is stable across pulse order and cannot leak a positional slot layout.
function fittingsForConfirmedRead(entity) {
  const data = entity && entity.data || {};
  const ids = [
    ...(Array.isArray(data.fittings) ? data.fittings : []),
    ...(Array.isArray(data.modules) ? data.modules : []),
  ];
  return [...new Set(ids.filter((id) => typeof id === 'string' && id))].sort();
}

// PB-BUILD-A (SF-124): a fitted cargo scanner turns a resolving read into a hold read. It
// reports the entity's DECLARED manifest (custody's cargoManifest, the same source the hail
// and target panel already show) plus the physical tell that the hold disagrees with it —
// the scanner detects the lie, never the secret: hiddenCargo contents stay off the reveal,
// exactly like cargoHintFor's cover rule above.
function holdReadForScan(entity, manifestTrust, now) {
  const data = entity && entity.data || {};
  const manifest = data.cargoManifest && typeof data.cargoManifest === 'object' ? data.cargoManifest : null;
  const declared = (manifest && Array.isArray(manifest.lines) ? manifest.lines : [])
    .map((line) => {
      const commodityId = line && (line.commodityId || line.id);
      return {
        commodityId: typeof commodityId === 'string' ? commodityId : null,
        qty: Math.max(0, Math.floor(finite(line && line.qty))),
      };
    })
    .filter((line) => line.commodityId && line.qty > 0)
    .sort((a, b) => String(a.commodityId).localeCompare(String(b.commodityId)));
  const declaredQty = manifest && Number.isFinite(manifest.totalQty)
    ? Math.max(0, Math.floor(manifest.totalQty))
    : declared.reduce((sum, line) => sum + line.qty, 0);
  return {
    at: now,
    declared,
    declaredQty,
    empty: declared.length === 0,
    mismatch: isFalseManifestCandidate(entity),
    trust: manifestTrust,
  };
}

// PB-BUILD-A (SF-133): knowledge the scan confirmed rides as a dated block so a weaker
// re-read does not erase it — but only while it is still fresh. `at` is the LAST
// verification time: a ship sitting inside the resolve band re-confirms every pulse and
// stays fresh; sliding back to class range starts the stale clock; past the window the
// confirmed claim is dropped outright instead of aging into a quiet lie.
function confirmedBlockForScan(reveal, entity, confirmedByRead, previous, now) {
  if (confirmedByRead) {
    return {
      at: now,
      quality: reveal.quality,
      loadout: Array.isArray(reveal.loadout) ? reveal.loadout.slice() : [],
      weakPoint: reveal.weakPoint || null,
      bountyCr: reveal.bountyCr,
      cargoHint: reveal.cargoHint,
      manifestTrust: reveal.manifestTrust,
      fittings: fittingsForConfirmedRead(entity),
      holdRead: reveal.holdRead || null,
    };
  }
  const prior = previous && previous.confirmed;
  if (!prior || typeof prior !== 'object') return null;
  const at = finite(prior.at, NaN);
  if (!Number.isFinite(at)) return null;
  const age = Math.max(0, now - at);
  return age <= SCAN_REVEAL_CONFIRMED_STALE_S ? prior : null;
}

export function buildShipScanReveal(entity, state, options = {}) {
  if (!entity || (entity.type !== 'ship' && entity.type !== 'drone')) return null;
  if (!entity.alive || !entity.pos) return null;
  const origin = options.origin || options.pos;
  const distance = scanRevealDistance(origin, entity);
  const radiusMult = sensorRadiusMultForScan(state);
  const quality = scanQualityForDistance(distance, radiusMult);
  if (!quality) return null;

  const data = entity.data || {};
  const shipDef = shipDefForScan(entity);
  const previous = options.previous || data.scanRevealed || null;
  const manifestTrust = manifestTrustForScan(entity, distance, previous, SCAN_REVEAL_DEEP_RADIUS * radiusMult);
  const shipId = (shipDef && shipDef.id) || data.defId || data.shipId || null;
  const shipClass = data.shipClass || data.class || data.role || (shipDef && shipDef.role) || entity.role || 'ship';
  const full = quality === 'full';
  const now = finite(options.now, state && state.simTime || 0);
  const weakPoint = full ? weakPointForEntity(entity) : null;

  const reveal = {
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
    // A fitted cargo scanner reads the declared manifest on the same deep read that
    // resolves the loadout; without the module the hold stays a hint, never a ledger.
    holdRead: full && cargoReaderFittedForScan(state)
      ? holdReadForScan(entity, manifestTrust, now)
      : null,
    confirmed: null,
  };
  reveal.confirmed = confirmedBlockForScan(reveal, entity, full, previous, now);
  return reveal;
}

// Fingerprint shape for the confirmed/hold-read memory: every claim field, none of the `at`
// stamps. Re-verifying an unchanged read must stay silent (the claim did not change), while
// a refit, a swapped manifest, or a stale-clear all change the fingerprint and emit a fresh
// reveal — the moment the KNOWLEDGE changes, not the moment time passes.
function fingerprintHoldRead(holdRead) {
  if (!holdRead || typeof holdRead !== 'object') return null;
  return {
    declared: holdRead.declared || null,
    declaredQty: holdRead.declaredQty,
    empty: holdRead.empty === true,
    mismatch: holdRead.mismatch === true,
    trust: holdRead.trust || null,
  };
}

function fingerprintConfirmed(confirmed) {
  if (!confirmed || typeof confirmed !== 'object') return null;
  return {
    quality: confirmed.quality || null,
    loadout: confirmed.loadout || null,
    weakPoint: confirmed.weakPoint || null,
    bountyCr: confirmed.bountyCr,
    cargoHint: confirmed.cargoHint || null,
    manifestTrust: confirmed.manifestTrust || null,
    fittings: confirmed.fittings || null,
    holdRead: fingerprintHoldRead(confirmed.holdRead),
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
    holdRead: fingerprintHoldRead(reveal.holdRead),
    confirmed: fingerprintConfirmed(reveal.confirmed),
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
