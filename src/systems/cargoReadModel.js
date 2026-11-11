// Pure cargo and reservation reads, shared with the canonical cargo owner.
export function isPersistentCargo(state, commodityId) {
  const locked = state && state.story && state.story.persistentCargo;
  return Array.isArray(locked) && locked.includes(commodityId);
}

/**
 * True if `commodityId` is sealed contract freight that the player must not sell or jettison mid-run.
 *
 * This guards the player-facing trade/dump paths (market Sell, station hold Sell) the same way the
 * HUD already guards jettison. It narrows to ONLY preloaded-mission cargo: contracts that load a
 * sealed manifest into the hold at accept time (cargo_delivery / salvage_retrieval / smuggling_run
 * with `preloadedCargo:true`). Selling those bricks the mission with no recovery. It deliberately
 * does NOT cover `bulk_trade`/`bulk_haul` — those missions REQUIRE selling generic goods at the
 * destination, so those commodity ids must stay sellable.
 *
 * Plain state read (no missions import) → no circular dependency. The canonical cargo writer
 * (`removeCargo`) is intentionally NOT gated by this: the missions system has legitimate internal
 * consumers (`_deliverCargo`, `_removePreloadedContractCargo`) that remove preloaded cargo through
 * the writer directly. The guard belongs on player intent, not on the writer.
 */
/**
 * Sealed contract freight. A preloaded mission (`preloadedCargo:true` on cargo_delivery /
 * salvage_retrieval / smuggling_run) reserves units of `params.cmdtyId` until it delivers or ends;
 * units the player bought or salvaged on top of the manifest are their own. Persistent story cargo
 * and `fixtureSealed` ids seal the entire held lot. `bulk_trade`/`bulk_haul` commodities stay
 * sellable — those missions require selling generic goods at the destination.
 *
 * Plain state reads (no missions import) → no circular dependency. The canonical cargo writer
 * (`removeCargo`) is intentionally NOT gated: the missions system removes preloaded cargo through
 * the writer directly. The guards belong on player intent, not on the writer.
 */
function heldCargoQuantity(state, commodityId) {
  const items = state && state.player && state.player.cargo && state.player.cargo.items;
  return Math.max(0, Math.floor(Number(items && items[commodityId]) || 0));
}

/**
 * Remaining sealed claim for one preloaded contract.
 * An accounted `sealedRemaining` is the owner's record. A known `qty` with no delivery
 * record reserves the full obligation — old saves must not invent delivered progress.
 * No quantity at all is ambiguous: the whole held stack stays sealed.
 */
function preloadedClaim(mission) {
  if (!mission || mission.preloadedCargo !== true || !mission.params) return null;
  const commodityId = mission.params.cmdtyId;
  if (typeof commodityId !== 'string' || !commodityId) return null;
  const params = mission.params;
  if (params.sealAccounted === true && Number.isFinite(Number(params.sealedRemaining))) {
    return {
      commodityId,
      remaining: Math.max(0, Math.floor(Number(params.sealedRemaining))),
      explicit: true,
    };
  }
  const qty = Number(params.qty);
  if (Number.isFinite(qty) && qty > 0) {
    return { commodityId, remaining: Math.floor(qty), explicit: true };
  }
  return { commodityId, remaining: null, explicit: false };
}

function activePreloadedClaims(state, commodityId) {
  const active = state && state.missions && state.missions.active;
  if (!Array.isArray(active)) return [];
  const claims = [];
  for (const mission of active) {
    if (!mission || mission.status !== 'active') continue;
    const claim = preloadedClaim(mission);
    if (!claim || claim.commodityId !== commodityId) continue;
    claims.push({ mission, claim });
  }
  return claims;
}

/** Units of `commodityId` ordinary sale and jettison must leave aboard. */
export function reservedCargoQuantity(state, commodityId) {
  const held = heldCargoQuantity(state, commodityId);
  if (isPersistentCargo(state, commodityId)) return held;
  if (Array.isArray(state?.fixtureSealed) && state.fixtureSealed.includes(commodityId)) return held;
  const claims = activePreloadedClaims(state, commodityId);
  if (!claims.length) return 0;
  if (claims.some((row) => !row.claim.explicit)) return held;
  let reserved = 0;
  for (const row of claims) reserved += row.claim.remaining;
  return reserved;
}

/** Units the player may sell or dump. Held minus a valid reservation, never below zero. */
export function sellableCargoQuantity(state, commodityId) {
  if (isPersistentCargo(state, commodityId)) return 0;
  if (Array.isArray(state?.fixtureSealed) && state.fixtureSealed.includes(commodityId)) return 0;
  const held = heldCargoQuantity(state, commodityId);
  const claims = activePreloadedClaims(state, commodityId);
  if (!claims.length) return held;
  if (claims.some((row) => !row.claim.explicit)) return 0;
  let reserved = 0;
  for (const row of claims) reserved += row.claim.remaining;
  return Math.max(0, held - reserved);
}

/** NXB-025 published spellings — aliases of the canonical *Quantity readers above. */
export function reservedCargoQty(state, commodityId) {
  return reservedCargoQuantity(state, commodityId);
}

export function sellableCargoQty(state, commodityId) {
  return sellableCargoQuantity(state, commodityId);
}

/** True when a seal exists and leaves nothing the player may sell or dump. */
export function isUnsellableCargo(state, commodityId) {
  const sealed = isPersistentCargo(state, commodityId)
    || (Array.isArray(state?.fixtureSealed) && state.fixtureSealed.includes(commodityId))
    || activePreloadedClaims(state, commodityId).length > 0;
  return sealed && sellableCargoQuantity(state, commodityId) <= 0;
}

/**
 * Units this contract may take out of the hold without spending another contract's reservation.
 * Ambiguous rows (no quantity) release only the legacy single-unit obligation, capped by
 * explicit siblings. An explicit row releases its own remaining units, and nothing when an
 * ambiguous sibling still seals the whole stack.
 */
export function releasableContractUnits(state, mission) {
  const claim = preloadedClaim(mission);
  if (!claim) return 0;
  const held = heldCargoQuantity(state, claim.commodityId);
  let explicitOthers = 0;
  let ambiguousSibling = false;
  const active = state && state.missions && state.missions.active;
  if (Array.isArray(active)) {
    for (const other of active) {
      if (!other || other === mission || other.id === mission.id || other.status !== 'active') continue;
      const sibling = preloadedClaim(other);
      if (!sibling || sibling.commodityId !== claim.commodityId) continue;
      if (!sibling.explicit) ambiguousSibling = true;
      else explicitOthers += sibling.remaining;
    }
  }
  const room = Math.max(0, held - explicitOthers);
  if (!claim.explicit) {
    const qty = Math.max(1, Math.floor(Number(mission.params && mission.params.qty) || 1));
    return Math.min(qty, room);
  }
  if (ambiguousSibling) return 0;
  return Math.min(claim.remaining, room);
}

