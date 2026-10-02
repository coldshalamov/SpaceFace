// src/core/pickupCustody.js — D92: the custody gate on physical (contact) pickup collection.
//
// Physics decides CONTACT; the cargo/custody owners decide CONSUMPTION through the synchronous
// `pickup:collected` acceptance receipt (pickupAcceptance.js). The legacy default of that contract
// — no listener wrote a receipt, so the pickup is fully consumed — is right for free loot (ore
// chips, shards, kill loot) and wrong for a pod somebody has title to: any live NPC hull that
// brushed a lawful-custody freight pod vacuumed it. In `world.reaction_trio` seed 4242 an express
// liner swept three custody pods at ~4.3 s with no theft report, no custody check and no respect
// for the salvor claim stamped the same tick. This module answers one question for the contact
// seam, from entity data alone, before any receipt is asked for:
//
//     may THIS non-player hull take THIS pod on contact?
//
//   * The player is never gated here. Player theft is adjudicated by the custody/law owners on the
//     receipt (encounterScripts reportFreightTheft, lawSecurity pod-theft intake).
//   * A pickup with no custody identity keeps the legacy contract: any live ship or drone may
//     contact-collect it.
//   * A custody pickup — a freight custody annotation, a salvor's claim, or a named cargo owner —
//     may be contact-collected only by the identity's owner, by the salvor that holds the claim
//     (`salvorClaimedBy`, the yard cutter traffic dispatched), or by an outlaw actor (the custody
//     script's stamped raider, a pirate/raider/scavenger hull): the take the custody script already
//     settles as `raider_secured`. A lawful hull with no claim and no title bounces off or passes
//     through; it never consumes.
//
// Pure data helpers: deterministic, no state writes, no imports from systems.

const OUTLAW_ROLE_MARKS = Object.freeze([
  'pirate', 'raider', 'scavenger', 'smuggler', 'outlaw', 'bandit', 'marauder',
]);

function cleanId(value) {
  if (value == null) return null;
  if (typeof value === 'object') return null;
  const text = String(value);
  return text ? text : null;
}

function marksOutlaw(text) {
  const value = String(text || '').toLowerCase();
  if (!value) return false;
  for (let i = 0; i < OUTLAW_ROLE_MARKS.length; i++) {
    if (value.includes(OUTLAW_ROLE_MARKS[i])) return true;
  }
  return false;
}

/**
 * The custody identity a pickup carries, or null when it is free loot.
 *
 * @param {object} data - the pickup's `data` record
 * @returns {{ ownerId: string|null, claimantId: string|null, freight: object|null }|null}
 */
export function pickupCustodyIdentity(data) {
  if (!data || typeof data !== 'object') return null;
  const freight = data.freightCustodyPod && typeof data.freightCustodyPod === 'object'
    ? data.freightCustodyPod
    : null;
  const claimantId = typeof data.salvorClaimedBy === 'string' && data.salvorClaimedBy
    ? data.salvorClaimedBy
    : null;
  const identity = data.cargoIdentity && typeof data.cargoIdentity === 'object'
    ? data.cargoIdentity
    : null;
  const ownerId = cleanId(identity && identity.ownerId)
    || cleanId(data.ownerId)
    || cleanId(freight && (freight.ownerId || freight.legalOwnerStableId))
    || null;
  if (!freight && !claimantId && !ownerId) return null;
  return { ownerId, claimantId, freight };
}

/** Every stable id a collector answers to: entity id, world record, salvor claim id, drone owner. */
function collectorIdentityIds(collector) {
  const ids = new Set();
  const own = cleanId(collector.id);
  if (own) ids.add(own);
  const data = collector.data && typeof collector.data === 'object' ? collector.data : null;
  if (data) {
    for (const key of ['worldRecordId', 'salvorClaimId', 'stableId']) {
      const value = cleanId(data[key]);
      if (value) ids.add(value);
    }
  }
  // A drone works for the hull that owns it: the owner's title is the drone's title.
  if (collector.type === 'drone') {
    const owner = cleanId(collector.ownerId) || cleanId(data && data.ownerId);
    if (owner) ids.add(owner);
  }
  return ids;
}

/**
 * An actor for whom taking somebody else's cargo is the job: the custody script's stamped raider
 * (`freightCustodyRaiderIdentityKey` survives the predation clear that strips `predationRole`),
 * a live predation raider, or any hull whose traffic/encounter role or AI archetype is an outlaw.
 */
export function isOutlawPickupCollector(collector) {
  const data = collector && collector.data && typeof collector.data === 'object' ? collector.data : null;
  if (!data) return false;
  if (data.freightCustodyRaiderIdentityKey) return true;
  if (data.predationRole === 'raider') return true;
  const ai = data.ai && typeof data.ai === 'object' ? data.ai : null;
  if (ai && (ai.pirate === true || ai.raider === true)) return true;
  if (marksOutlaw(data.trafficRole) || marksOutlaw(data.role) || marksOutlaw(data.jobRole)) return true;
  if (ai && (marksOutlaw(ai.role) || marksOutlaw(ai.encounterRole) || marksOutlaw(ai.archetype))) return true;
  return false;
}

/**
 * May `collector` contact-collect `pickup`? True for the player, for free loot, and for the
 * owner / claim holder / outlaw of a custody pickup. False for every other non-player hull.
 *
 * @param {object} pickup - the pickup entity (reads `pickup.data`)
 * @param {object} collector - the ship or drone in contact
 * @param {*} playerId - `state.playerId`
 */
export function pickupCustodyAllowsCollector(pickup, collector, playerId) {
  const custody = pickupCustodyIdentity(pickup && pickup.data);
  if (!custody) return true;
  if (!collector) return false;
  if (playerId != null && collector.id === playerId) return true;
  const ids = collectorIdentityIds(collector);
  if (custody.claimantId && ids.has(custody.claimantId)) return true;
  if (isOutlawPickupCollector(collector)) return true;
  // Spilled freight pods in distress cannot be contact-vacuumed by the carrier that lost them.
  if (pickup && pickup.data && pickup.data.spillNoticed === true) return false;
  if (custody.ownerId && ids.has(custody.ownerId)) return true;
  return false;
}
