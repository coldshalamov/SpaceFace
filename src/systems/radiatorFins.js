// Exterior radiator fins. One authored vane, shared by the thermal sink and the
// signature tell so a sheared fin cannot cool the hall and stay bright.
//
// A fin counts only while it is intact and still has hull. Hull at zero, or an
// explicit intact:false, is a vane that has been shot off.

export const RADIATOR_FIN = Object.freeze({
  id: 'skin',
  name: 'Radiator Fin',
  hull: 48,
  // One intact vane pulls a hollow 10 MW hall from a thermal fault (load 1)
  // to nominal (10 / 24). Sheared vanes add nothing.
  sinkPerIntact: 14,
  // Alone this reads Bright. On a hall that is already running it is enough
  // to step the class again, so the vane is not free stealth.
  loudnessPerIntact: 0.45,
});

export function radiatorFinIntact(fin) {
  if (!fin || typeof fin !== 'object') return false;
  if (fin.intact === false) return false;
  const hull = Number(fin.hull);
  return Number.isFinite(hull) && hull > 0;
}

function intactCount(fins) {
  const list = Array.isArray(fins) ? fins : [];
  let n = 0;
  for (let i = 0; i < list.length; i++) {
    if (radiatorFinIntact(list[i])) n += 1;
  }
  return n;
}

/** Heat units per minute shed by every intact vane. Finite and >= 0. */
export function radiatorFinSink(fins) {
  const n = intactCount(fins);
  if (n <= 0) return 0;
  const rate = n * RADIATOR_FIN.sinkPerIntact;
  return Number.isFinite(rate) && rate > 0 ? rate : 0;
}

/** Extra signature loudness in [0, 1] from intact vanes. */
export function radiatorFinLoudness(fins) {
  const n = intactCount(fins);
  if (n <= 0) return 0;
  const loud = n * RADIATOR_FIN.loudnessPerIntact;
  if (!Number.isFinite(loud) || loud <= 0) return 0;
  return loud > 1 ? 1 : loud;
}

/**
 * Durable fin rows. Drops the session entity id — entity ids do not survive a
 * load, and the body is re-ensured from this record. Null means "never welded".
 * An array, even empty, means the site already had its chance.
 */
export function normalizeRadiatorFins(raw) {
  if (!Array.isArray(raw)) return null;
  const out = [];
  for (let i = 0; i < raw.length; i++) {
    const fin = raw[i];
    if (!fin || typeof fin !== 'object') continue;
    const hullRaw = Number(fin.hull);
    const hull = Number.isFinite(hullRaw) && hullRaw > 0 ? hullRaw : 0;
    const intact = fin.intact !== false && hull > 0;
    const id = typeof fin.id === 'string' && fin.id.length > 0 ? fin.id : RADIATOR_FIN.id;
    out.push({ id, intact, hull: intact ? hull : 0 });
  }
  return out;
}
