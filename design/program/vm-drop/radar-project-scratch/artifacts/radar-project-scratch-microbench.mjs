/**
 * Offline microbench: projectRadarPoint allocate+freeze vs out-param scratch,
 * plus mark push literal vs pooled row — mirrors radar.draw contact pass.
 */
function finiteCoordinate(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
const COMPACT = { center: 110, radius: 105 };

function projectBefore(playerPos, targetPos, range, metrics = COMPACT) {
  if (!playerPos || !targetPos || !metrics) return null;
  const px = finiteCoordinate(playerPos.x);
  const pz = finiteCoordinate(playerPos.z);
  const tx = finiteCoordinate(targetPos.x);
  const tz = finiteCoordinate(targetPos.z);
  const safeRange = finiteCoordinate(range);
  if (px == null || pz == null || tx == null || tz == null || safeRange == null || safeRange <= 0) return null;
  const dx = tx - px, dz = tz - pz;
  const distance = Math.hypot(dx, dz);
  const offRange = distance > safeRange;
  const angle = Math.atan2(-dz, -dx);
  const scale = metrics.radius / safeRange;
  const x = offRange ? metrics.center + Math.cos(angle) * metrics.radius : metrics.center - dx * scale;
  const y = offRange ? metrics.center + Math.sin(angle) * metrics.radius : metrics.center - dz * scale;
  return Object.freeze({ x, y, dx, dz, distance, offRange, angle, scale, resolved: true });
}

function projectAfter(playerPos, targetPos, range, metrics = COMPACT, out = null) {
  if (!playerPos || !targetPos || !metrics) return null;
  const px = finiteCoordinate(playerPos.x);
  const pz = finiteCoordinate(playerPos.z);
  const tx = finiteCoordinate(targetPos.x);
  const tz = finiteCoordinate(targetPos.z);
  const safeRange = finiteCoordinate(range);
  if (px == null || pz == null || tx == null || tz == null || safeRange == null || safeRange <= 0) return null;
  const dx = tx - px, dz = tz - pz;
  const distance = Math.hypot(dx, dz);
  const offRange = distance > safeRange;
  const angle = Math.atan2(-dz, -dx);
  const scale = metrics.radius / safeRange;
  const x = offRange ? metrics.center + Math.cos(angle) * metrics.radius : metrics.center - dx * scale;
  const y = offRange ? metrics.center + Math.sin(angle) * metrics.radius : metrics.center - dz * scale;
  if (out) {
    out.x = x; out.y = y; out.dx = dx; out.dz = dz; out.distance = distance;
    out.offRange = offRange; out.angle = angle; out.scale = scale; out.resolved = true;
    return out;
  }
  return Object.freeze({ x, y, dx, dz, distance, offRange, angle, scale, resolved: true });
}

const CONTACTS = 64;
const HOSTILE_FRAC = 0.35;
const DRAWS = 8000;
const player = { x: 0, z: 0 };
const entities = Array.from({ length: CONTACTS }, (_, i) => ({
  id: i,
  x: (i % 8) * 120 - 400,
  z: Math.floor(i / 8) * 120 - 400,
  hostile: (i / CONTACTS) < HOSTILE_FRAC,
}));
const range = 2000;

function run(mode) {
  const scratch = { x:0,y:0,dx:0,dz:0,distance:0,offRange:false,angle:0,scale:0,resolved:true };
  const hostileMarks = [];
  const pool = [];
  let checksum = 0;
  const t0 = performance.now();
  for (let d = 0; d < DRAWS; d++) {
    hostileMarks.length = 0;
    for (let i = 0; i < CONTACTS; i++) {
      const e = entities[i];
      const projected = mode === 'before'
        ? projectBefore(player, e, range)
        : projectAfter(player, e, range, COMPACT, scratch);
      if (!projected) continue;
      checksum += projected.x + projected.y;
      if (e.hostile) {
        if (mode === 'before') {
          hostileMarks.push({ entity: e, projected, distanceSq: projected.distance * projected.distance });
        } else {
          let mark = pool[hostileMarks.length];
          if (!mark) { mark = { entity: null, x: 0, y: 0, distanceSq: 0 }; pool[hostileMarks.length] = mark; }
          mark.entity = e;
          mark.x = projected.x;
          mark.y = projected.y;
          mark.distanceSq = projected.distance * projected.distance;
          hostileMarks.push(mark);
        }
      }
    }
    hostileMarks.sort((a, b) => a.distanceSq - b.distanceSq);
    const n = Math.min(hostileMarks.length, 32);
    for (let i = 0; i < n; i++) {
      const m = hostileMarks[i];
      checksum += (mode === 'before' ? m.projected.x + m.projected.y : m.x + m.y);
    }
  }
  return { ms: performance.now() - t0, checksum, hostileMarksEnd: hostileMarks.length };
}

run('before'); run('after');
const before = run('before');
const after = run('after');
const out = {
  label: 'radar-project-scratch',
  contacts: CONTACTS,
  draws: DRAWS,
  before: { ms: +before.ms.toFixed(3), checksum: before.checksum },
  after: { ms: +after.ms.toFixed(3), checksum: after.checksum },
  speedup: +(before.ms / Math.max(1e-9, after.ms)).toFixed(3),
  checksumMatch: before.checksum === after.checksum,
};
console.log(JSON.stringify(out, null, 2));
