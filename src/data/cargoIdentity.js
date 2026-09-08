// src/data/cargoIdentity.js — PQ-148.03 Cargo identity and reaction catalog.
//
// "Cargo with a name." Pods carry origin/destination/owner identities.
// When cargo is spilled, jettisoned, stolen, or returned, the owner reacts
// according to ownership and circumstances (restitution, bounty, thanks).
//
// Pure data catalog and lookup helpers: deterministic, no UI, no Math.random.

/**
 * Reactions an owner can express when their cargo is involved in an incident.
 * Each entry provides canonical reaction id, bark key, and ledger verb.
 */
export const CARGO_OWNER_REACTIONS = Object.freeze({
  restitution: Object.freeze({
    id: 'restitution',
    barkKey: 'cargo_spill_restitution',
    ledgerVerb: 'restitution',
  }),
  bounty: Object.freeze({
    id: 'bounty',
    barkKey: 'cargo_spill_bounty',
    ledgerVerb: 'bounty',
  }),
  thanks: Object.freeze({
    id: 'thanks',
    barkKey: 'cargo_spill_thanks',
    ledgerVerb: 'thanks',
  }),
});

/**
 * Fallback mapping of canonical station, faction, or lane contact ids to display names.
 * Used when a manifest or pod contains an ownerId without an explicit ownerName.
 */
const KNOWN_ENTITY_NAMES = Object.freeze({
  // Canonical stations
  station_ceres: 'Ceres Refinery',
  station_helios: 'Helios Station',
  station_helios_prime: 'Helios Station',
  station_tethys: 'Tethys Trade Hub',
  station_coalition: 'Coalition HQ',
  station_forge: 'Forge Foundry',
  station_drift: 'Drift Market',
  station_beltout: 'Belt Outpost',
  station_customs: 'Customs Gate',
  station_reach: 'Io Reach',
  station_veil: 'Research Station Veil',
  station_dione: 'Dione Exchange',
  station_ashcache: 'Ash Cache',
  station_nyx_march: 'Nyx March',
  station_hyperion_cut: 'Hyperion Cut',
  station_triton: 'Triton Wake Lab',
  station_expanse: 'Expanse Outpost',

  // Named lane contacts
  lane_mira_bluepack: 'Mira Bluepack',
  lane_kess_span: 'Kess of the Span',
  lane_warden_keel: 'Warden Keel',
  lane_rell_moisture: 'Rell of the Moisture Column',
  lane_venn_veil_run: 'Venn of the Sealed Manifest',

  // Factions
  faction_scn: 'Concord',
  faction_mts: 'Meridian',
  faction_dmc: 'Drift Miners',
  faction_reach: 'Reach Freeholders',
  faction_quiet: 'The Quiet',
  faction_choir: 'Choir of Glass',
  faction_free: 'Frontier Free League',
  faction_vael: 'Vael Collective',
});

function resolveOwnerName(ownerId) {
  if (!ownerId || typeof ownerId !== 'string') return null;
  return KNOWN_ENTITY_NAMES[ownerId] || null;
}

function isCivilianTarget(ownerId, legality, spec = {}) {
  if (spec.isCivilian === false || spec.civilian === false) return false;
  if (spec.isCivilian === true || spec.civilian === true) return true;
  if (spec.ownerRole === 'civilian' || spec.role === 'civilian') return true;

  // Contraband / illegal cargo does not receive civilian restitution protection
  const leg = String(legality || '').toLowerCase();
  if (leg === 'contraband' || leg === 'illegal') return false;

  if (ownerId != null) {
    const id = String(ownerId).toLowerCase();
    if (id.includes('pirate') || id.includes('raider') || id.includes('outlaw')
      || id.includes('bandit') || id.includes('marauder') || id.includes('hunter')
      || id.includes('military') || id.includes('warlord')) {
      return false;
    }
  }

  const role = String(spec.role || spec.trafficRole || '').toLowerCase();
  if (role) {
    const nonCivilianRoles = ['pirate', 'raider', 'outlaw', 'patrol', 'military', 'hunter', 'customs'];
    if (nonCivilianRoles.some((r) => role.includes(r))) return false;
  }

  return true;
}

function isPlayerCaused(causeStr, spec = {}) {
  if (spec.playerCaused === true || spec.causedByPlayer === true) return true;
  if (!causeStr) return false;
  const c = String(causeStr).toLowerCase();
  return c === 'restitution'
    || c === 'spill'
    || c === 'spilled'
    || c.includes('spill')
    || c.includes('ram')
    || c.includes('collision')
    || c.includes('bump')
    || c.includes('shot')
    || c.includes('damage')
    || c.includes('jettison')
    || c.includes('accident')
    || c.includes('player');
}

/**
 * Determine the reaction for a cargo spill or incident:
 * - 'thanks' if player returns/helps owner
 * - 'bounty' if player steals / kills the owner
 * - 'restitution' if player caused the spill and the owner is civilian
 * - null otherwise
 *
 * @param {object} spec
 * @param {string|number|null} [spec.ownerId] - Cargo owner ID
 * @param {string|number|null} [spec.playerId] - Player entity ID
 * @param {string|null} [spec.legality] - Commodity legality ('legal'|'restricted'|'contraband')
 * @param {string|object|null} [spec.cause] - Trigger cause / incident description
 * @returns {'restitution'|'bounty'|'thanks'|null}
 */
export function reactionForSpill(spec = {}) {
  if (!spec || typeof spec !== 'object') return null;

  const { ownerId, playerId, legality, cause } = spec;

  // Player cannot react against themselves
  if (ownerId != null && playerId != null && String(ownerId) === String(playerId)) {
    return null;
  }

  const causeStr = typeof cause === 'string'
    ? cause
    : (cause && (cause.type || cause.kind || cause.action || cause.id || cause.cause)) || '';
  const c = causeStr.toLowerCase().trim();

  // 1. Thanks if player returns/helps owner
  if (spec.helped === true || spec.returned === true
    || c === 'thanks'
    || c === 'return'
    || c === 'returns'
    || c === 'returned'
    || c === 'help'
    || c === 'helps'
    || c === 'helped'
    || c === 'assist'
    || c === 'assisted'
    || c === 'rescue'
    || c === 'rescued'
    || c.includes('return')
    || c.includes('help')
    || c.includes('assist')
    || c.includes('rescue')
    || c.includes('salvage_returned')) {
    return 'thanks';
  }

  // 2. Bounty if player steals / kills the owner
  if (spec.stolen === true || spec.killedOwner === true
    || c === 'bounty'
    || c === 'steal'
    || c === 'steals'
    || c === 'stole'
    || c === 'stolen'
    || c === 'theft'
    || c === 'piracy'
    || c === 'kill'
    || c === 'kills'
    || c === 'killed'
    || c === 'murder'
    || c === 'attack'
    || c.includes('steal')
    || c.includes('theft')
    || c.includes('piracy')
    || c.includes('kill')
    || c.includes('murder')
    || c.includes('destroyed_owner')) {
    return 'bounty';
  }

  // 3. Restitution if player caused the spill and the owner is civilian
  if (isPlayerCaused(c, spec) && isCivilianTarget(ownerId, legality, spec)) {
    return 'restitution';
  }

  return null;
}

/**
 * Derive a structured cargo identity from a freight manifest and optional context.
 *
 * Example:
 * ```javascript
 * identityFromManifest(
 *   { originId: 'station_ceres', destStationId: 'station_helios_prime', ownerId: 'station_ceres' },
 *   { cause: 'player_spill' }
 * );
 * // -> { originId: 'station_ceres', destinationId: 'station_helios_prime', ownerId: 'station_ceres', ownerName: 'Ceres Refinery', reaction: 'restitution' }
 * ```
 *
 * @param {object} manifest - Cargo manifest or freight contract object
 * @param {object|string} [extras] - Optional overrides or context (e.g. cause, playerId, reaction)
 * @returns {{ originId: string|null, destinationId: string|null, ownerId: string|null, ownerName: string|null, reaction: string|null }|null}
 */
export function identityFromManifest(manifest, extras = {}) {
  if (!manifest || typeof manifest !== 'object') return null;

  const opts = typeof extras === 'string'
    ? { reaction: extras }
    : (extras && typeof extras === 'object' ? extras : {});

  const originId = opts.originId
    || opts.originStationId
    || opts.boardStationId
    || opts.origin
    || opts.from
    || manifest.originId
    || manifest.originStationId
    || manifest.boardStationId
    || manifest.stationId
    || manifest.origin
    || manifest.from
    || (manifest.lotSource && manifest.lotSource.stationId)
    || (manifest.custody && manifest.custody.originId)
    || null;

  const destinationId = opts.destinationId
    || opts.destStationId
    || opts.targetStationId
    || opts.destination
    || opts.to
    || manifest.destinationId
    || manifest.destStationId
    || manifest.targetStationId
    || manifest.destination
    || manifest.to
    || (manifest.custody && manifest.custody.destStationId)
    || null;

  const ownerId = opts.ownerId
    || (opts.owner && opts.owner.id)
    || (typeof opts.owner === 'string' ? opts.owner : null)
    || opts.carrierId
    || (opts.actor && opts.actor.id)
    || opts.freighterKey
    || manifest.ownerId
    || (manifest.owner && manifest.owner.id)
    || (typeof manifest.owner === 'string' ? manifest.owner : null)
    || manifest.carrierId
    || (manifest.actor && manifest.actor.id)
    || manifest.freighterKey
    || manifest.holderId
    || null;

  const ownerName = opts.ownerName
    || (opts.owner && opts.owner.name)
    || opts.carrierName
    || (opts.actor && opts.actor.name)
    || opts.freighterLabel
    || manifest.ownerName
    || (manifest.owner && manifest.owner.name)
    || manifest.carrierName
    || (manifest.actor && manifest.actor.name)
    || manifest.freighterLabel
    || manifest.freighterName
    || resolveOwnerName(ownerId)
    || null;

  const reaction = opts.reaction
    || manifest.reaction
    || reactionForSpill({
      ownerId,
      playerId: opts.playerId ?? manifest.playerId,
      legality: opts.legality ?? manifest.legality,
      cause: opts.cause ?? manifest.cause,
      isCivilian: opts.isCivilian ?? manifest.isCivilian,
      civilian: opts.civilian ?? manifest.civilian,
      role: opts.role ?? manifest.role,
    })
    || null;

  if (!originId && !destinationId && !ownerId && !ownerName && !reaction) {
    return null;
  }

  return Object.freeze({
    originId: originId != null ? String(originId) : null,
    destinationId: destinationId != null ? String(destinationId) : null,
    ownerId: ownerId != null ? String(ownerId) : null,
    ownerName: ownerName != null ? String(ownerName) : null,
    reaction: reaction != null ? String(reaction) : null,
  });
}

/**
 * Reads cargo identity fields from a cargo pod, payload entity, or data stamp.
 * Inspects commodityId, ownerId, originId, destinationId, ownerName (and reaction if present).
 *
 * Example:
 * ```javascript
 * cargoIdentityOf({
 *   commodityId: 'cmdty_ore_iron',
 *   originId: 'station_ceres',
 *   destinationId: 'station_helios_prime',
 *   ownerId: 'station_ceres',
 *   ownerName: 'Ceres Refinery',
 * });
 * // -> { commodityId: 'cmdty_ore_iron', ownerId: 'station_ceres', originId: 'station_ceres', destinationId: 'station_helios_prime', ownerName: 'Ceres Refinery' }
 * ```
 *
 * @param {object} podOrData - Entity, data record, or cargo identity object
 * @returns {{ commodityId: string|null, ownerId: string|null, originId: string|null, destinationId: string|null, ownerName: string|null, reaction?: string }|null}
 */
export function cargoIdentityOf(podOrData) {
  if (!podOrData || typeof podOrData !== 'object') return null;

  const data = podOrData.data && typeof podOrData.data === 'object'
    ? podOrData.data
    : podOrData;

  const identity = (data && data.cargoIdentity && typeof data.cargoIdentity === 'object' ? data.cargoIdentity : null)
    || (podOrData.cargoIdentity && typeof podOrData.cargoIdentity === 'object' ? podOrData.cargoIdentity : null);

  const commodityId = (identity && identity.commodityId)
    || data.commodityId
    || podOrData.commodityId
    || (data.salvagePool && typeof data.salvagePool === 'object' ? Object.keys(data.salvagePool)[0] : null)
    || (podOrData.salvagePool && typeof podOrData.salvagePool === 'object' ? Object.keys(podOrData.salvagePool)[0] : null)
    || (Array.isArray(data.lines) && data.lines[0] && data.lines[0].commodityId)
    || (Array.isArray(podOrData.lines) && podOrData.lines[0] && podOrData.lines[0].commodityId)
    || null;

  const ownerId = (identity && identity.ownerId)
    || data.ownerId
    || podOrData.ownerId
    || (identity && identity.owner && identity.owner.id)
    || (data.owner && data.owner.id)
    || (podOrData.owner && podOrData.owner.id)
    || null;

  const originId = (identity && (identity.originId || identity.originStationId || identity.boardStationId))
    || data.originId
    || data.originStationId
    || data.boardStationId
    || podOrData.originId
    || podOrData.originStationId
    || podOrData.boardStationId
    || null;

  const destinationId = (identity && (identity.destinationId || identity.destStationId || identity.targetStationId))
    || data.destinationId
    || data.destStationId
    || data.targetStationId
    || podOrData.destinationId
    || podOrData.destStationId
    || podOrData.targetStationId
    || null;

  const ownerName = (identity && identity.ownerName)
    || data.ownerName
    || podOrData.ownerName
    || (identity && identity.owner && identity.owner.name)
    || (data.owner && data.owner.name)
    || (podOrData.owner && podOrData.owner.name)
    || resolveOwnerName(ownerId)
    || null;

  const reaction = (identity && identity.reaction)
    || data.reaction
    || podOrData.reaction
    || ((data.cause || podOrData.cause)
      ? reactionForSpill({
          ownerId,
          playerId: data.playerId ?? podOrData.playerId,
          legality: data.legality ?? podOrData.legality,
          cause: data.cause ?? podOrData.cause,
        })
      : null);

  if (!commodityId && !ownerId && !originId && !destinationId && !ownerName) {
    return null;
  }

  const result = {
    commodityId: commodityId != null ? String(commodityId) : null,
    ownerId: ownerId != null ? String(ownerId) : null,
    originId: originId != null ? String(originId) : null,
    destinationId: destinationId != null ? String(destinationId) : null,
    ownerName: ownerName != null ? String(ownerName) : null,
  };

  if (reaction != null) {
    result.reaction = String(reaction);
  }

  return Object.freeze(result);
}
