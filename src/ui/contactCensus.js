// One ship-like contact census per sim tick, shared by every presentation scan that used to
// re-walk the same bucket: the combat contact marks and the threat halo (30 Hz), the contact
// roster (5 Hz) and the automatic-lock refresh (~8 Hz). Membership and hostility are derived
// once per (tick, index version, player, team) epoch instead of once per consumer — those only
// change inside a sim step, so a cached answer is identical to a fresh walk.
//
// Distance is different: presentation harnesses (and worker mirrors between reads) can move a
// position inside a tick, so dx/dz/distSq are recomputed on every call — a handful of
// subtractions against the per-call predicate walks it replaces. Rows are pooled record
// objects ({ e, dx, dz, distSq, hostile }); callers must not retain them past the moment they
// were read, and keep their own type, range and legality predicates so behaviour is unchanged.

import { indexedShipLikeScan } from '../world/livingWorldViews.js';
import { isHostileToPlayer } from '../systems/scannerReadModel.js';

const censuses = new WeakMap(); // state -> { key, player, census }

function censusEpoch(state) {
  // Integer sim ticks are the epoch when they exist; worker-mirrored states may carry only
  // the float clock. A state with neither (partial test doubles) is never cached.
  if (Number.isInteger(state && state.tick)) return `t${state.tick}`;
  if (Number.isFinite(state && state.simTime)) return `s${state.simTime}`;
  return null;
}

function membershipEpoch(state, index) {
  if (index && index.__spacefaceEntityIndexV1 && index.ready === true && Number.isFinite(index.version)) {
    return index.version;
  }
  const list = state && state.entityList;
  return list && typeof list.length === 'number' ? `l${list.length}` : 0;
}

/**
 * The shared ship-like contact census for `state`'s current sim moment.
 * `playerRef` lets a caller hand over the player entity it already resolved (harnesses without
 * a state.entities Map, or a caller whose player is authoritative). Returns
 * { player, indexed, rows } — rows carry { e, dx, dz, distSq, hostile }; geometry is refreshed
 * on every call, membership and hostility once per epoch.
 */
export function contactCensus(state, playerRef) {
  const entities = state && state.entities;
  const player = playerRef !== undefined ? playerRef
    : (entities && typeof entities.get === 'function' ? entities.get(state.playerId) : null);
  const index = state && state.entityIndex;
  // `indexed` means the row list came from the index bucket (indexedShipLikeScan's gate), so
  // hint-resolution semantics match the bucket walks this replaces.
  const indexed = !!(index && index.__spacefaceEntityIndexV1 && index.ready === true
    && Array.isArray(index.shipLike));
  const epoch = censusEpoch(state);
  const playerTeam = player ? player.team : 0;
  const key = epoch === null ? null
    : `${epoch}|v${membershipEpoch(state, index)}|t${playerTeam}`;

  let slot = censuses.get(state);
  const hit = !!(slot && key !== null && slot.key === key && slot.player === player
    && slot.census && slot.census.indexed === indexed);
  let census = slot && slot.census;
  if (!census) census = { player: null, indexed: false, rows: [] };
  census.player = player;
  census.indexed = indexed;
  const rows = census.rows;

  if (!hit) {
    // Membership + hostility: the per-entity predicates every consumer used to re-run.
    const source = indexedShipLikeScan(state);
    let n = 0;
    for (let i = 0; i < source.length; i++) {
      const e = source[i];
      // Player exclusion matches by identity AND id: an index hint carrying the player's id
      // resolves to the same body and must never row up as a contact.
      if (!e || e === player || (player && e.id != null && e.id === player.id)
        || e.alive === false || !e.pos) continue;
      let row = rows[n];
      if (!row) row = rows[n] = { e: null, dx: 0, dz: 0, distSq: 0, hostile: false };
      row.e = e;
      row.hostile = isHostileToPlayer(e, playerTeam, state);
      n += 1;
    }
    rows.length = n;
    // A clockless state (partial test doubles) gets a fresh census every call rather than a
    // forever-stale cached one — identical to the per-call walks it replaces.
    if (key !== null) censuses.set(state, { key, player, census });
    else censuses.delete(state);
  }

  // Volatile geometry: recompute against the live positions every call. An entity that died or
  // lost its position inside the tick reads as infinitely far — the old per-call guards'
  // equivalent for every consumer's range check.
  const px = player && player.pos ? player.pos.x : 0;
  const pz = player && player.pos ? player.pos.z : 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const e = row.e;
    if (!e || e === player || (player && e.id != null && e.id === player.id)
      || e.alive === false || !e.pos) {
      row.dx = 0;
      row.dz = 0;
      row.distSq = Infinity;
      continue;
    }
    row.dx = e.pos.x - px;
    row.dz = e.pos.z - pz;
    row.distSq = row.dx * row.dx + row.dz * row.dz;
  }
  return census;
}

/** Drop a state's cached census (tests that mutate entities without advancing the clock). */
export function invalidateContactCensus(state) {
  censuses.delete(state);
}
