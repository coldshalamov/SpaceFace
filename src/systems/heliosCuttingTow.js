// Read the original working tow at the cutter's existing beam. Attachment,
// flight and physics owners retain all control of the line and both bodies.
import { entityLocalPointToWorld } from '../combat/geometry.js';
import { hullEnvelopeWu } from '../data/collisionProxyManifests.js';

const SECTOR = 'sector_helios_prime';
const finite = p => Number.isFinite(p?.x) && Number.isFinite(p?.z);
const radius = e => Math.max(0, Number(e?.radius) || 0, hullEnvelopeWu(e) || 0);

function pointSegment(p, a, b) {
  const x = b.x - a.x, z = b.z - a.z, d = x * x + z * z;
  const t = d ? Math.max(0, Math.min(1, ((p.x - a.x) * x + (p.z - a.z) * z) / d)) : 0;
  return Math.hypot(p.x - a.x - t * x, p.z - a.z - t * z);
}
function segments(a, b, c, d) {
  const cross = (p, q, r) => (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
  if (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) return 0;
  return Math.min(pointSegment(a, c, d), pointSegment(b, c, d), pointSegment(c, a, b), pointSegment(d, a, b));
}
function liveLoad(s, load, generation, player, worker, rock) {
  return load?.alive && s.entities?.get(load.id) === load && load !== player && load !== worker && load !== rock
    && Number.isSafeInteger(generation) && generation > 0 && load.occupantGeneration === generation
    && ['payload', 'wreck', 'asteroid', 'ship'].includes(load.type)
    && load.collides !== false && load.physicsBody !== false && finite(load.pos)
    && ![load.homeSectorId, load.sectorId, load.data?.homeSectorId, load.data?.sectorId].some(id => id && id !== SECTOR);
}

export function heliosCuttingTow(s, player, worker, rock, margin = 0, prior = []) {
  const dx = rock.pos.x - worker.pos.x, dz = rock.pos.z - worker.pos.z, length = Math.hypot(dx, dz);
  if (!(length > 0) || length > (Number(worker.data?.miningBeam?.range) || 240) + radius(rock)) return { loads: [], blocked: false };
  const extent = Math.max(0, length - radius(rock));
  const end = { x: worker.pos.x + dx / length * extent, z: worker.pos.z + dz / length * extent };
  const t = s.player?.tether, a = s.combat?.attachments?.byId?.[String(t?.attachmentId)];
  const load = s.entities?.get(t?.targetId);
  const live = t?.active && a?.state === 'active' && a.id === t.attachmentId && a.defId === 'tether_standard'
    && a.ownerId === player.id && a.ownerGeneration === player.occupantGeneration
    && a.targetId === load?.id && liveLoad(s, load, a.targetGeneration, player, worker, rock)
    && finite(a.sourceAnchorLocal) && finite(a.targetAnchorLocal)
    && Number.isFinite(player.rot) && Number.isFinite(load.rot);
  const clearance = 8 + margin;
  const loads = prior.filter(row => liveLoad(s, row.load, row.generation, player, worker, rock));
  let blocked = loads.some(row => pointSegment(row.load.pos, worker.pos, end) < radius(row.load) + clearance);
  if (live && (pointSegment(load.pos, worker.pos, end) < radius(load) + clearance
    || segments(worker.pos, end, entityLocalPointToWorld(player, a.sourceAnchorLocal),
      entityLocalPointToWorld(load, a.targetAnchorLocal)) < clearance)) {
    blocked = true;
    if (!loads.some(row => row.load === load)) loads.push({ load, generation: load.occupantGeneration });
  }
  // Releasing or replacing the line does not hide an earlier load. Keep every
  // observed original through this uninterrupted hold, including clear bodies
  // that can re-enter during the half-second grace. Stale lives are pruned.
  return { loads, blocked };
}
