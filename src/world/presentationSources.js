// Presentation sources that are not combat-list entities.
// Field rocks, dressing rows, and far-actor rows keep reserved ids and may draw, but they are not
// GameState.entityList members until promote (mine / ram / tether / decode-runway traffic).

import { getAsteroidFieldRock, queryAsteroidField } from './asteroidField.js';
import { getDressingRow } from './dressingTable.js';
import { getFarActor, promoteFarActor, queryFarActors } from './farActorTable.js';
import { authoredPrefetchRadius, tableTravelSpeed } from '../render/tabletopPolicy.js';

const _farPromoteScratch = [];
const _rockQueryScratch = [];
const _farPromoteIds = [];

export function isPresentationLedgerRow(entity) {
  return !!(entity && (
    entity.farResident === true
    || entity.fieldResident === true
    || entity.dressingResident === true
  ));
}

export function resolveWorldPresentationEntity(state, id) {
  if (id == null || !state) return null;
  const live = state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(id)
    : null;
  if (live && live.alive !== false) return live;
  const rock = getAsteroidFieldRock(state, id);
  if (rock && rock.alive !== false && rock.liveEntityId == null) return rock;
  const dressing = getDressingRow(state, id);
  if (dressing && dressing.alive !== false) return dressing;
  const far = getFarActor(state, id);
  if (far && far.alive !== false) return far;
  return live && live.alive !== false ? live : null;
}

function pushAlive(out, row) {
  if (row && row.alive !== false) out.push(row);
}

export function collectJournalPresentationEntities(state, out = []) {
  out.length = 0;
  const list = state && state.entityList;
  if (list) {
    for (let i = 0; i < list.length; i++) pushAlive(out, list[i]);
  }
  const dressing = state && state.world && state.world.dressing;
  if (dressing && Array.isArray(dressing.rows)) {
    for (let i = 0; i < dressing.rows.length; i++) pushAlive(out, dressing.rows[i]);
  }
  return out;
}

export function collectMeshPresentationEntities(state, out = []) {
  collectJournalPresentationEntities(state, out);
  const field = state && state.world && state.world.asteroidField;
  if (field && Array.isArray(field.rocks)) {
    for (let i = 0; i < field.rocks.length; i++) {
      const rec = field.rocks[i];
      if (!rec || rec.alive === false || rec.liveEntityId != null) continue;
      out.push(rec);
    }
  }
  const far = state && state.world && state.world.farActors;
  if (far && Array.isArray(far.rows)) {
    const live = state.entities;
    for (let i = 0; i < far.rows.length; i++) {
      const rec = far.rows[i];
      if (!rec || rec.alive === false) continue;
      if (live && typeof live.has === 'function' && live.has(rec.id)) continue;
      out.push(rec);
    }
  }
  return out;
}

/**
 * Ask Lane A helpers to rematerialize anything inside the authored decode runway
 * (TABLE_AUTHORED_DECODE_SECONDS × current top speed). Does not invent membership.
 * Field rocks already draw from the ledger — mass-promoting them would refill entityList.
 */
export function requestDecodeRunwayPromote(state, helpers) {
  const result = {
    farSeen: 0,
    farPromoted: 0,
    rocksSeen: 0,
    rocksPromoted: 0,
    helpersMissing: !(helpers && typeof helpers.spawnEntity === 'function'),
  };
  if (!state) return result;
  const player = state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(state.playerId)
    : null;
  const origin = player && player.pos;
  if (!origin) return result;
  const decodeR = authoredPrefetchRadius(tableTravelSpeed(state));
  const farHits = queryFarActors(state, origin, decodeR, _farPromoteScratch);
  result.farSeen = farHits.length;
  _farPromoteIds.length = 0;
  for (let i = 0; i < farHits.length; i++) {
    const rec = farHits[i];
    if (rec && rec.id != null) _farPromoteIds.push(rec.id);
  }
  if (!result.helpersMissing) {
    for (let i = 0; i < _farPromoteIds.length; i++) {
      if (promoteFarActor(state, _farPromoteIds[i], helpers)) result.farPromoted += 1;
    }
  }
  const rockHits = queryAsteroidField(state, origin, decodeR, _rockQueryScratch);
  result.rocksSeen = rockHits.length;
  return result;
}

export function resetWorldPresentationTables(state) {
  if (!state || !state.world) return;
  state.world.asteroidField = null;
  state.world.dressing = null;
}
