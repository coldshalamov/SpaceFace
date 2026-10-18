import { dropDressingRow, getDressingRow, insertDressingRow } from '../world/dressingTable.js';
import { ALIEN_SITES } from '../data/alienEcology.js';

const runtimes = new WeakMap();
const RETIRE_PAD_WU = 120;

function replaceDressingEntry(state, previousId, replacement) {
  const dressing = state.world.sectorContents?.[ALIEN_SITES.closed_refinery.sectorId]?.dressing;
  if (!dressing) return;
  const index = dressing.findIndex(row => row.id === previousId);
  if (!replacement) {
    if (index >= 0) dressing.splice(index, 1);
    return;
  }
  const row = { id: replacement.id, placeId: replacement.data.placeId,
    pos: replacement.pos, paletteClass: 'alien' };
  if (index >= 0) dressing[index] = row;
  else dressing.push(row);
}

// Keep the authored dressing off the entity list until the refinery's close approach.
export function registerClosedRefineryProp(state, row, record, key) {
  let runtime = runtimes.get(state);
  if (!runtime || runtime.record !== record) {
    runtime = { record, entries: new Map() };
    runtimes.set(state, runtime);
  }
  const previous = runtime.entries.get(key);
  if (previous?.body && previous.body.alive !== false) {
    dropDressingRow(state, row.id);
    return;
  }
  runtime.entries.set(key, { row, body: null, hull: 120 });
}

export function captureClosedRefineryProps(state) {
  const runtime = runtimes.get(state);
  if (!runtime) return;
  for (const [key, entry] of runtime.entries) {
    const body = entry.body;
    if (body && (body.hull <= 0 || body.data.destroyed === true)) {
      (runtime.record.brokenCalcite ||= {})[key] = true;
      replaceDressingEntry(state, body.id, null);
      entry.body = null;
    }
  }
}

export function reconcileClosedRefineryProps(world) {
  const state = world.state, runtime = runtimes.get(state);
  const site = ALIEN_SITES.closed_refinery;
  if (!runtime || state.mode !== 'flight' || state.world.currentSectorId !== site.sectorId) return;
  const player = state.entities.get(state.playerId);
  if (!player?.pos) return;
  captureClosedRefineryProps(state);
  const center = world._toGlobal(site.center, site.sectorId);
  const distance = Math.hypot(player.pos.x - center.x, player.pos.z - center.z);
  for (const [key, entry] of runtime.entries) {
    if (runtime.record.brokenCalcite?.[key]) continue;
    const body = entry.body;
    if (body && body.alive !== false) {
      if (distance <= site.arrivalBands.close + RETIRE_PAD_WU
          || body.flags?.tethered || state.player?.tether?.targetId === body.id) continue;
      // Preserve the physics-owned pose and partial heat/damage when shelving the prop.
      entry.hull = body.hull;
      entry.row = insertDressingRow(state, {
        type: 'fx', pos: body.pos, rot: body.rot, radius: body.radius,
        homeSectorId: site.sectorId, data: { ...body.data },
      });
      replaceDressingEntry(state, body.id, entry.row);
      entry.body = null;
      world.helpers.removeEntity(body.id, { immediate: true, reason: 'virtualize' });
      continue;
    }
    if (distance > site.arrivalBands.close || !getDressingRow(state, entry.row.id)) continue;
    const row = entry.row;
    const entity = world.helpers.spawnEntity({
      type: 'prop', pos: { ...row.pos }, rot: row.rot, radius: row.radius,
      collides: true, physicsBody: { dynamic: true, material: 'prop' },
      hull: entry.hull, hullMax: 120, homeSectorId: site.sectorId,
      data: { ...row.data, closedRefineryProp: true, tetherPayload: true,
        name: row.data.moduleId === 'calcified_collar' ? 'Calcified collar' : 'Mineral root' },
    });
    if (!entity) continue;
    entry.body = entity;
    replaceDressingEntry(state, row.id, entity);
    dropDressingRow(state, row.id);
  }
}
