// Presentation sources that are not combat-list entities.
// Field rocks and dressing rows keep reserved ids and draw, but they are not GameState.entityList
// members until a rock is promoted for mine / ram / tether.

import { getAsteroidFieldRock } from './asteroidField.js';
import { getDressingRow } from './dressingTable.js';

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
  return out;
}

export function resetWorldPresentationTables(state) {
  if (!state || !state.world) return;
  state.world.asteroidField = null;
  state.world.dressing = null;
}
