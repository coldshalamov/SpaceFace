// Camera-sightline occluder relief (presentation only — never writes sim state).
//
// The world is 2.5D: every gameplay body is authored on the play plane (y = 0) and the chase
// camera looks down at it. A solid body that lands between the camera and the player still
// buries the ship — at mining/boost camera distances a near-camera rock draws 5–10× the hull,
// and a latched container once filled half the frame. The sightline fix is not alpha (pooled
// asteroid and authored-package instances share materials and carry no per-instance opacity);
// it is a duck: the occluder's root slides below the plane until its top clears the ray to the
// player. Root position feeds every submission path — asteroid InstancedMesh chunks recompose
// the owner root each sync, authored pool proxies derive their submitted matrixWorld from the
// owner, and direct meshes follow the render traversal — so one write covers all three without
// tearing the body apart.
//
// Per frame the renderer hands this the classified entity frame plus the settled camera and the
// presented player position; entries ease toward their required depth and ease back when the
// corridor clears. Decorative parallax debris is deliberately far below the plane already and is
// never an entity record, so the duck touches gameplay bodies only.

// A body smaller than this cannot bury the player; a body larger than this is landmark scale —
// camera clearance already lifts the camera over its roof, and a proportional duck would have
// to move hundreds of WU to clear the ray.
export const OCCLUDER_MIN_RADIUS = 12;
export const OCCLUDER_MAX_RADIUS = 160;

// Clearance kept between the sightline and the body's top once it has ducked.
const CLEARANCE_WU = 8;
// A deep duck is capped so the body never vanishes entirely below the frame — it eases out of
// the sightline, not out of the world.
const MAX_DIP_RADIUS_FACTOR = 1.8;
const MAX_DIP_PAD_WU = 12;

// Dip rates (WU/s). Dropping out of the player's sightline is urgent; rising back is leisurely
// so a skimming body does not yo-yo.
const DIP_DOWN_WU_PER_S = 220;
const DIP_UP_WU_PER_S = 90;

// A body still counts as "in the corridor" while the ray would re-clip it within this lateral
// pad — prevents flicker on bodies hovering at the corridor edge.
const EXIT_PAD_RADIUS_FACTOR = 0.12;

// Entity kinds that may stand between the camera and the player. Player/self, effects, pickups
// and projectiles are excluded by construction.
const OCCLUDER_TYPES = new Set([
  'asteroid', 'wreck', 'payload', 'station', 'place', 'ship',
  'beacon', 'drone', 'structure', 'mine', 'bomb', 'charge', 'cache',
]);

export function createCameraOccluderState() {
  return {
    // entityId -> { dip, applied, mesh } — `applied` is the depth currently written onto the
    // root, `dip` the eased value; mesh is retained so an entity leaving the set can be restored.
    entries: new Map(),
    // owner root -> depth, for the authored-instance pool submission path (keyed by the owner
    // object the slots hang their proxies under, not the entity id).
    sinkByOwner: new Map(),
    sinksDirty: false,
    occludingCount: 0,
  };
}

export function occluderDuckCandidate(entity) {
  if (!entity || entity.alive === false) return false;
  if (!OCCLUDER_TYPES.has(entity.type)) return false;
  const radius = occluderRadius(entity);
  return radius >= OCCLUDER_MIN_RADIUS && radius <= OCCLUDER_MAX_RADIUS;
}

function occluderRadius(entity) {
  const radius = Number(entity && entity.radius);
  return Number.isFinite(radius) ? Math.abs(radius) : 0;
}

// Shortest distance from point C to segment AB, plus the projection parameter. Scratch-free:
// callers pass plain numbers, results ride the shared `_hit` row.
const _hit = { t: 0, dx: 0, dy: 0, dz: 0, dist: 0, rayY: 0 };

function segmentApproach(ax, ay, az, bx, by, bz, cx, cy, cz) {
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const lenSq = abx * abx + aby * aby + abz * abz;
  let t = 0;
  if (lenSq > 1e-9) t = ((cx - ax) * abx + (cy - ay) * aby + (cz - az) * abz) / lenSq;
  _hit.t = t;
  const px = ax + abx * t, py = ay + aby * t, pz = az + abz * t;
  _hit.dx = cx - px; _hit.dy = cy - py; _hit.dz = cz - pz;
  _hit.rayY = py;
  _hit.dist = Math.sqrt(_hit.dx * _hit.dx + _hit.dy * _hit.dy + _hit.dz * _hit.dz);
  return _hit;
}

/**
 * Advance every occluder candidate one frame.
 *
 * @param {object} state created by createCameraOccluderState()
 * @param {Array} records renderEntityFrame classified records (record.entity/.mesh/.x/.y/.z)
 * @param {object} cameraPos chase camera position, same local frame as record positions
 * @param {object} focusPos presented player position (the end of the protected sightline)
 * @param {number} dt frame delta seconds (already timescale-scaled by the caller)
 * @param {object} [opts] { playerId } — the protected entity is never ducked
 * @returns {boolean} true when any sink value moved (instanced pools must re-submit matrices)
 */
export function updateCameraOccluders(state, records, cameraPos, focusPos, dt, opts = {}) {
  if (!state) return false;
  const entries = state.entries;
  const frameSeen = (state.frameSeq = (state.frameSeq || 0) + 1);
  state.sinkByOwner.clear();
  state.occludingCount = 0;
  const playerId = opts.playerId;
  const camX = cameraPos.x, camY = cameraPos.y, camZ = cameraPos.z;
  const fx = focusPos.x, fy = Number.isFinite(focusPos.y) ? focusPos.y : 0, fz = focusPos.z;

  if (Array.isArray(records)) {
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const entity = record && record.entity;
      if (!entity || entity.id === playerId) continue;
      if (record.visible === false || record.viewCulled === true) continue;
      const mesh = record.mesh;
      if (!mesh) continue;
      // The authored pose is always on the plane; entries carry the current duck so a record
      // captured mid-slide still evaluates against y = 0.
      const radius = occluderRadius(entity);
      if (!occluderDuckCandidate(entity)) {
        if (entries.has(entity.id)) entries.get(entity.id).target = 0;
        continue;
      }
      const hit = segmentApproach(
        camX, camY, camZ,
        fx, fy, fz,
        record.x, 0, record.z,
      );
      // Only bodies strictly between camera and player count — anything past the focus point is
      // behind the ship on screen and cannot cover it.
      let required = 0;
      if (hit.t > 0.02 && hit.t < 0.98) {
        const entry = entries.get(entity.id);
        const lateral = Math.sqrt(hit.dx * hit.dx + hit.dz * hit.dz);
        // Corridor: the ray must pass through the body's cylinder laterally AND below its top.
        // Once engaged the corridor widens slightly so borderline bodies do not oscillate.
        const pad = entry && entry.dip > 0 ? radius * EXIT_PAD_RADIUS_FACTOR : 0;
        const bodyTop = radius; // collision radius ≈ visual extent above the plane
        const blocksSightline = lateral < radius + pad && bodyTop > hit.rayY - CLEARANCE_WU;
        if (blocksSightline) {
          const maxDip = radius * MAX_DIP_RADIUS_FACTOR + MAX_DIP_PAD_WU;
          required = Math.min(Math.max(0, bodyTop - (hit.rayY - CLEARANCE_WU)), maxDip);
        }
      }
      if (required > 0 || entries.has(entity.id)) {
        let entry = entries.get(entity.id);
        if (!entry) {
          entry = { dip: 0, applied: 0, target: 0, mesh, seen: 0 };
          entries.set(entity.id, entry);
        } else if (entry.mesh !== mesh) {
          // Root rebuilt while ducked (LOD/hot-reload): restore the old root so it cannot
          // linger below the plane, then carry the depth onto the new one.
          restoreOccluderDip(entry);
          entry.applied = 0;
          entry.dip = 0;
        }
        entry.mesh = mesh;
        entry.target = required;
        entry.seen = frameSeen;
      }
    }
  }

  // Ease every live entry toward its target; restore and purge entities no longer in the set.
  let sinksMoved = false;
  const rateDown = DIP_DOWN_WU_PER_S * dt;
  const rateUp = DIP_UP_WU_PER_S * dt;
  for (const [id, entry] of entries) {
    if (entry.seen !== frameSeen) {
      // Entity left the classified set this frame — restore the root once, then forget it.
      restoreOccluderDip(entry);
      entries.delete(id);
      sinksMoved = true;
      continue;
    }
    const target = entry.target || 0;
    if (entry.dip < target) entry.dip = Math.min(target, entry.dip + rateDown);
    else if (entry.dip > target) entry.dip = Math.max(target, entry.dip - rateUp);
    const dip = entry.dip < 0.01 ? 0 : entry.dip;
    // The pose pass rewrites position.y = 0 every synced frame, so an active duck must be
    // re-written every frame — `applied` records depth changes for the instanced pools' dirty
    // gates, not whether the write is still needed.
    if (dip !== entry.applied) sinksMoved = true;
    if (dip > 0) {
      applyOccluderDip(entry, dip);
      state.occludingCount++;
      state.sinkByOwner.set(entry.mesh, dip);
    } else if (entry.applied !== 0) {
      restoreOccluderDip(entry);
    } else {
      entry.applied = 0;
    }
    if (dip === 0 && target === 0) entries.delete(id);
  }
  state.sinksDirty = sinksMoved;
  return sinksMoved;
}

function applyOccluderDip(entry, dip) {
  const mesh = entry.mesh;
  if (!mesh || !mesh.position) return;
  mesh.position.y = -dip;
  // Roots frozen by the submit lanes compose on demand — the local recompose here is what lets
  // the duck reach matrixWorld (asteroid pool, authored proxies, render traversal all read it).
  mesh.updateMatrix();
  entry.applied = dip;
}

function restoreOccluderDip(entry) {
  const mesh = entry && entry.mesh;
  if (mesh && mesh.position && entry.applied !== 0) {
    mesh.position.y = 0;
    if (typeof mesh.updateMatrix === 'function') mesh.updateMatrix();
  }
  entry.applied = 0;
}

/** Diagnostics for probes/tests: entities currently ducked out of the sightline. */
export function cameraOccluderDiagnostics(state) {
  const out = { active: 0, deepest: 0, entries: [] };
  if (!state) return out;
  for (const [id, entry] of state.entries) {
    if (entry.dip <= 0) continue;
    out.active++;
    out.deepest = Math.max(out.deepest, entry.dip);
    out.entries.push({ id, dip: entry.dip, target: entry.target });
  }
  return out;
}
