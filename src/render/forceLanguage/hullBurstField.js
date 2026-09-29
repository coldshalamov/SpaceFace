// The hull burst's wedge, as a field-presentation record (slice C; design doc section 4, "cone/ring/sheet").
//
// The Clearing Cone already has a designed look: source-to-tip banks, bowed fronts, a working membrane and a
// truth boundary at the strike edge (forceLanguage/fieldForcePresentation.js, the `cone` recipe). A hull burst is
// that same volume, player-attached, for the duration of the burst: what is drawn IS the strike zone (the reach in
// data/hullBurst.js is the depth at which a hit lands). So instead of a second renderer, the presentation reads
// this record as one more field, with a per-type tint (Gravity Bumper cold blue, Fire Lance hot orange, Grip
// Bumper green). Read-only: nothing here writes state, listens to events or draws.
//
// One reusable record, updated in place: the presentation copies values into its own slots, and a per-frame
// allocation in the render loop is exactly what the field code avoids.
import { resolveHullBurst } from '../../data/hullBurst.js';

const record = {
  id: 'hullburst',
  kind: 'burst_gravity',
  center: { x: 0, z: 0 },
  dir: { x: 1, z: 0 },
  radius: 1,
  halfAngleRad: 0.5,
  halfWidth: 0,
  engaged: false,
  ownerId: null,
};

const finite = (v, f = 0) => (Number.isFinite(v) ? v : f);

/** The wedge record while a burst is live, else null. The returned object is reused across calls. */
export function hullBurstFieldRecord(state) {
  const rt = state && state.hullBurst;
  if (!rt || rt.phase !== 'active') return null;
  const player = state.entities && typeof state.entities.get === 'function' ? state.entities.get(state.playerId) : null;
  if (!player || player.alive === false || !player.pos) return null;
  const derived = player.data && player.data.derived;
  const def = derived && derived.hullBurstKind ? resolveHullBurst(derived.hullBurstKind, derived.hullBurstRank) : null;
  if (!def) return null;
  const rot = finite(player.rot);
  const dx = Math.cos(rot);
  const dz = Math.sin(rot);
  const nose = finite(player.radius, 12);
  record.kind = `burst_${def.id}`;
  record.center.x = finite(player.pos.x) + dx * nose;
  record.center.z = finite(player.pos.z) + dz * nose;
  record.dir.x = dx;
  record.dir.z = dz;
  record.radius = def.reachWu;
  record.halfAngleRad = def.halfAngleRad;
  // A live hit (or a held hostage) lights the wedge harder, the same channel a deployed field's "engaged" uses.
  record.engaged = (rt.hits | 0) > 0 || !!rt.grip;
  record.ownerId = state.playerId;
  return record;
}

/** Tint per burst type: [body, accent] as 0xRRGGBB. The presentation preloads these once. */
export const BURST_STYLE = Object.freeze({
  burst_gravity: Object.freeze({ color: 0x7f9cff, accent: 0xd8e2ff }),
  burst_lance: Object.freeze({ color: 0xff8a3d, accent: 0xffe1a4 }),
  burst_grip: Object.freeze({ color: 0x79f0c8, accent: 0xd9ffe0 }),
});

/** The recipe a field kind draws with: burst kinds are cones. */
export const shapeOfFieldKind = (kind) => (Object.hasOwn(BURST_STYLE, kind) ? 'cone' : kind);
