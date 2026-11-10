// SWARM-07 B1+B2 — the Brood presentation: the second population, instanced like the asteroid
// batch path (SWARM_EXPANSION §4 B1, §4 B2).
//
// The Brood are DESIGNED bodies, never camera-facing soft squares: each body is a faceted
// low-poly dart creature — a raised spine, a belly keel and two swept wing plates — drawn as
// ONE InstancedMesh so 400 bodies cost one draw call and per-frame buffer bytes. Families
// differ by silhouette stretch and colour (the family table's recipe). The attack language is
// drawn as designed telegraph instruments: the spitter's ground marker ring, the acid pool it
// leaves, the charger's committed-pass line, the acid lob itself — every one reads BEFORE the
// hit it warns about. The sim (src/systems/swarmBrood.js) owns the flat typed arrays; this
// module only reads them and writes instance transforms. Zero per-frame allocation: the
// Matrix4/Color/Quaternion scratch is retained; instance buffers are allocated once at create.
//
// Accessibility: reduced motion drops the per-body idle bob — positions, headings, telegraphs
// and population stay exact.

import * as THREE from 'three';
import { SWARM_BROOD_FAMILIES, BROOD_SPITTER_SPLASH_RADIUS, BROOD_SPITTER_POOL_RADIUS,
  BROOD_CHARGER_DASH_SPEED, BROOD_CHARGER_DASH_MAX_S,
  BROOD_CASCADE_NONE, BROOD_CASCADE_PANIC, BROOD_CASCADE_AGGRESSION, BROOD_CASCADE_GRIEF,
  TENDRIL_SEG_MAX, TENDRIL_SEG_RADIUS } from '../data/swarmBrood.js';
import { SWARM_BROOD_LATE_FAMILIES, SWARM_BROOD_STRAINS } from '../data/swarmBroodLate.js';
import { SWARM_MACHINE_FAMILIES } from '../data/swarmMachine.js';
import { swarmBroodCharacterFor } from '../data/swarmCharacter.js';
import { circleHitRadius, corridorHalfWidth, dashReach } from '../combat/telegraphFootprint.js';

const DRAW_FAMILIES = SWARM_BROOD_FAMILIES.concat(SWARM_BROOD_LATE_FAMILIES, SWARM_MACHINE_FAMILIES);
const FAMILY_N = DRAW_FAMILIES.length;
const MACHINE_SET = new Set(SWARM_MACHINE_FAMILIES);
const TAU = Math.PI * 2;

function familyStretch(fam) {
  const drawn = fam >= 0 && fam < FAMILY_N ? DRAW_FAMILIES[fam] : null;
  if (drawn && Array.isArray(drawn.stretch)) return drawn.stretch;
  if (fam >= 0 && fam < FAMILY_STRETCH.length) return FAMILY_STRETCH[fam];
  return FAMILY_STRETCH[0];
}

// Per-family silhouette stretch over the shared dart body: the spitter runs fat, the charger
// long, the leecher low and wide — distinct moving silhouettes, one geometry.
const FAMILY_STRETCH = Object.freeze([
  Object.freeze([1.0, 1.0, 1.0]),     // mite
  Object.freeze([1.05, 1.35, 1.1]),   // spitter
  Object.freeze([0.9, 1.25, 0.9]),    // spore_drift — a fat drifting seed
  Object.freeze([1.55, 0.85, 0.85]),  // charger
  Object.freeze([1.15, 1.45, 1.15]),  // lantern_cyst — a round lit bomb
  Object.freeze([0.8, 0.75, 1.35]),   // leecher
  Object.freeze([1.25, 0.7, 1.5]),    // glassback — a flat armored shell
  Object.freeze([1.9, 0.55, 0.65]),   // wake_eel — long ribbon
  Object.freeze([0.95, 1.5, 1.35]),   // bellows — a swelling sac
]);

// ---- inf-brood-cascade-flush — the pack's coupling finally reads -----------------------------
//
// The Bloom spine authors the coupling web ("faint green filaments join members within this
// radius; a node's death flares the web", bloomLadder.js) and the data contract on the cascade
// kinds names the duty ("published on the view; the renderer flushes the filaments on them") —
// yet the picture kept every body its calm family colour. The BLOOM pathology's authored
// cascades ran as motion only, and in a 200-body furball a pack scattering in panic and a pack
// feeding read identically until you have watched the motion for seconds.
//
// The honest reader is the filament flush the contract names, keyed to the view kind the sim
// already publishes (view.cascade):
//   PANIC — the web flares: bodies sweep hot pale acid green (the coupling lighting up as one
//           animal breaks), an urgent pulse with a per-body stagger so the flare waves through
//           the pack instead of recolouring it at once.
//   GRIEF — the pack cools: bodies sink toward a desaturated slate (mourning dimming around
//           the corpse), a slow breath.
//   NONE  — null: the caller's colours stay bit-identical to the unwired path.
// The flush rides the flock mesh only — the cascade windows arm cells, never Tendril segments.
// The aggression kind is wired: the sim publishes it when a relay/Queen hit arms the rush
// (swarmBrood relayHit → view.cascade), and its flush is the data contract's own words —
// "the Queen (or a relay) taking a hit turns every linked member on the player at once;
// the filaments flush red" (src/data/swarmBrood.js W-COUPLING).

/** The web's flare: pale-hot acid green — the coupling colour burning, not a new family voice. */
export const BROOD_FLUSH_PANIC_RGB = Object.freeze([0.86, 1.0, 0.68]);
/** The mourning slate: desaturated, cool — the pack dimming around its dead. */
export const BROOD_FLUSH_GRIEF_RGB = Object.freeze([0.3, 0.36, 0.33]);
/** The aggression flush: hot anger red — the authored "filaments flush red" on the rush. */
export const BROOD_FLUSH_AGGRESSION_RGB = Object.freeze([1.0, 0.3, 0.16]);

const FLUSH_PANIC_HZ = 1.8;      // the flare's urgent pulse
const FLUSH_GRIEF_PERIOD_S = 2.4; // the mourning breath
const FLUSH_AGGRESSION_HZ = 2.6; // the rush's hotter beat — angrier than the panic flare

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * The filament flush for one body of the pack. Pure function of (kind, simTime, phase,
 * reducedMotion) — test-seam, no allocation (writes `out`). Returns null when no flush
 * owns the view kind (NONE, unknown), so callers keep their exact unwired colours.
 */
export function resolveBroodCascadeFlush(cascade, simTime, phase01, reducedMotion, out = null) {
  const t = Number.isFinite(simTime) ? simTime : 0;
  const ph = Number.isFinite(phase01) ? phase01 : 0;
  const rec = out || { weight: 0, r: 0, g: 0, b: 0 };
  if (cascade === BROOD_CASCADE_PANIC) {
    rec.r = BROOD_FLUSH_PANIC_RGB[0];
    rec.g = BROOD_FLUSH_PANIC_RGB[1];
    rec.b = BROOD_FLUSH_PANIC_RGB[2];
    // Reduced motion holds the flare at its floor weight — the coupling still reads,
    // nothing pulses. The stagger (phase01) waves the flare through the pack.
    rec.weight = reducedMotion
      ? 0.5
      : clamp01(0.5 + 0.18 * Math.sin((t * FLUSH_PANIC_HZ + ph * 0.35) * Math.PI * 2));
    return rec;
  }
  if (cascade === BROOD_CASCADE_AGGRESSION) {
    rec.r = BROOD_FLUSH_AGGRESSION_RGB[0];
    rec.g = BROOD_FLUSH_AGGRESSION_RGB[1];
    rec.b = BROOD_FLUSH_AGGRESSION_RGB[2];
    // The rush's read: a hotter, faster beat than the panic flare — the pack is one angry
    // animal charging you, not scattering. Same stagger law (the web lights up in a wave),
    // and reduced motion holds a steady anger floor, never silent.
    rec.weight = reducedMotion
      ? 0.45
      : clamp01(0.55 + 0.16 * Math.sin((t * FLUSH_AGGRESSION_HZ + ph * 0.5) * Math.PI * 2));
    return rec;
  }
  if (cascade === BROOD_CASCADE_GRIEF) {
    rec.r = BROOD_FLUSH_GRIEF_RGB[0];
    rec.g = BROOD_FLUSH_GRIEF_RGB[1];
    rec.b = BROOD_FLUSH_GRIEF_RGB[2];
    rec.weight = reducedMotion
      ? 0.4
      : clamp01(0.4 + 0.08 * Math.sin(t * (Math.PI * 2 / FLUSH_GRIEF_PERIOD_S) + ph * 2.1));
    return rec;
  }
  return null;
}

/**
 * The mite body: a faceted dart. Authored as raw triangles (non-indexed for flat facet
 * normals) — a designed silhouette that reads at swarm-camera distance: an arrowhead with a
 * raised spine and a belly keel, nose forward on +X, up on +Y, in the XZ flight plane.
 */
function buildBroodBodyGeometry(scale = 1) {
  const L = 3.1 * scale;   // nose
  const T = -2.0 * scale;  // tail
  const W = 2.3 * scale;   // wing half-span
  const HS = 1.15 * scale; // spine height
  const HB = -0.75 * scale; // belly keel
  const nose = [L, 0, 0];
  const tail = [T, 0, 0];
  const spine = [-0.4 * scale, HS, 0];
  const keel = [-0.4 * scale, HB, 0];
  const wingL = [T + 0.9 * scale, 0.1 * scale, W];
  const wingR = [T + 0.9 * scale, 0.1 * scale, -W];

  const tri = (a, b, c) => [a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]];
  const positions = new Float32Array([
    // top hull: spine ridge, split over both wings
    ...tri(nose, spine, wingL),
    ...tri(nose, wingL, tail),
    ...tri(nose, wingR, spine),
    ...tri(nose, tail, wingR),
    // belly: keel ridge
    ...tri(nose, wingL, keel),
    ...tri(nose, keel, wingR),
    ...tri(nose, keel, wingL),
    ...tri(nose, wingR, keel),
    // tail cap
    ...tri(tail, wingL, spine),
    ...tri(tail, spine, wingR),
    ...tri(tail, keel, wingL),
    ...tri(tail, wingR, keel),
  ]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function flatMarkerMaterial(color, opacity) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
}

// Footprint = damage query (packet 02). The engine's splash / pool / dash queries and these drawn
// footprints call the SAME functions (combat/telegraphFootprint.js) with the engine's published
// victim radius, so a marker's rim IS where the hurt starts.
const DEFAULT_VICTIM_RADIUS = 6; // the engine's own default before a victim is cached

function victimRadiusOf(view) {
  const r = view && view.victimRadius;
  return Number.isFinite(r) && r > 0 ? r : DEFAULT_VICTIM_RADIUS;
}

/** World radius of the spitter's splash marker at impact. */
export function spitterFootprintRadius(view) {
  return circleHitRadius(BROOD_SPITTER_SPLASH_RADIUS, victimRadiusOf(view));
}

/** World radius of a lingering acid pool: constant over its life — the query does not shrink. */
export function poolFootprintRadius(view) {
  return circleHitRadius(BROOD_SPITTER_POOL_RADIUS, victimRadiusOf(view));
}

/** The charger's committed lane: half-width (the two radii touching) and reach (speed x max time). */
export function chargerLane(view, carrierRadius) {
  return {
    halfWidth: corridorHalfWidth(carrierRadius, victimRadiusOf(view)),
    reach: dashReach(BROOD_CHARGER_DASH_SPEED, BROOD_CHARGER_DASH_MAX_S),
  };
}

const RING_CAP = 32;
const LOB_MAX_ITER = 24; // = BROOD_LOB_MAX; lob slots are sparse
const POOL_CAP = 12;
const LINE_CAP = 32;
const LOB_CAP = 24;
const SEG_CAP = TENDRIL_SEG_MAX;

/**
 * Create the presentation. Returns { mesh, update(view, dt, opts), dispose() }.
 * `update` reads the engine's published view (schema spaceface.swarmBrood.v2).
 */
export function createBroodPresentation(scene, capacity = 400) {
  const geometry = buildBroodBodyGeometry(1);
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.62,
    metalness: 0.18,
    flatShading: true,
    emissive: new THREE.Color(0.22, 0.05, 0.02),
    emissiveIntensity: 0.9,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  mesh.name = 'sf-swarm-brood';
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.visible = false;
  mesh.renderOrder = 2;
  scene.add(mesh);

  // The attack language: spitter windup markers (rings), acid pools (dark discs), charger
  // committed-pass lines, and the acid lobs in flight.
  const ringGeo = new THREE.RingGeometry(0.82, 1.0, 28);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = flatMarkerMaterial(0x6cff9a, 0.85);
  const rings = new THREE.InstancedMesh(ringGeo, ringMat, RING_CAP);
  rings.name = 'sf-swarm-brood-marks';
  rings.frustumCulled = false;
  rings.renderOrder = 6;
  rings.count = 0;
  rings.visible = false;
  scene.add(rings);

  const poolGeo = new THREE.CircleGeometry(1.0, 24);
  poolGeo.rotateX(-Math.PI / 2);
  const poolMat = new THREE.MeshBasicMaterial({
    color: 0x1f5c2a,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const pools = new THREE.InstancedMesh(poolGeo, poolMat, POOL_CAP);
  pools.name = 'sf-swarm-brood-pools';
  pools.frustumCulled = false;
  pools.renderOrder = 5;
  pools.count = 0;
  pools.visible = false;
  scene.add(pools);

  const lineGeo = new THREE.BoxGeometry(1, 0.07, 0.14);
  const lineMat = flatMarkerMaterial(0xff7a4a, 0.8);
  const lines = new THREE.InstancedMesh(lineGeo, lineMat, LINE_CAP);
  lines.name = 'sf-swarm-brood-lines';
  lines.frustumCulled = false;
  lines.renderOrder = 6;
  lines.count = 0;
  lines.visible = false;
  scene.add(lines);
  // The committed lane the pass will sweep (the hairline above is only its centreline): a faint
  // strip as wide and as long as the dash's damage query, so the dodge is read off the picture.
  const lanes = new THREE.InstancedMesh(lineGeo, flatMarkerMaterial(0xff7a4a, 0.2), LINE_CAP);
  lanes.name = 'sf-swarm-brood-lanes';
  lanes.frustumCulled = false;
  lanes.renderOrder = 5;
  lanes.count = 0;
  lanes.visible = false;
  scene.add(lanes);

  const lobGeo = new THREE.TetrahedronGeometry(1.1);
  const lobMat = new THREE.MeshStandardMaterial({
    color: 0x8affb0,
    emissive: new THREE.Color(0.15, 0.5, 0.2),
    emissiveIntensity: 1.2,
    flatShading: true,
    roughness: 0.5,
  });
  const lobs = new THREE.InstancedMesh(lobGeo, lobMat, LOB_CAP);
  lobs.name = 'sf-swarm-brood-lobs';
  lobs.frustumCulled = false;
  lobs.renderOrder = 3;
  lobs.count = 0;
  lobs.visible = false;
  scene.add(lobs);

  // B3 — the Tendril's body: jointed knuckles on the same dart geometry, drawn on their own
  // instanced mesh so the chain reads as one animal, not as flock bodies. Attached links run
  // the worm's carapace tone; a freed link (its lead died — the Centipede split) burns hotter
  // so the player's counter is visible at a glance.
  const segMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.55,
    metalness: 0.22,
    flatShading: true,
    emissive: new THREE.Color(0.18, 0.09, 0.03),
    emissiveIntensity: 1.0,
    side: THREE.DoubleSide,
  });
  const segs = new THREE.InstancedMesh(geometry, segMat, SEG_CAP);
  segs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  segs.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(SEG_CAP * 3), 3);
  segs.instanceColor.setUsage(THREE.DynamicDrawUsage);
  segs.name = 'sf-swarm-tendril';
  segs.frustumCulled = false;
  segs.count = 0;
  segs.visible = false;
  segs.renderOrder = 2;
  scene.add(segs);
  const SEG_BODY_COLOR = new THREE.Color(0.42, 0.34, 0.18);  // carapace bronze

  // The Machine's instruments, drawn in its own cold voice: shield links are cyan lines
  // on the pair, beam sweeps are hot blades, magnet auras are faint violet rings.
  const mlinks = new THREE.InstancedMesh(lineGeo, flatMarkerMaterial(0x66e0ff, 0.55), LINE_CAP);
  mlinks.name = 'sf-swarm-machine-links';
  mlinks.frustumCulled = false;
  mlinks.renderOrder = 6;
  mlinks.count = 0;
  mlinks.visible = false;
  scene.add(mlinks);

  const mbeams = new THREE.InstancedMesh(lineGeo, flatMarkerMaterial(0xffd28a, 0.8), LINE_CAP);
  mbeams.name = 'sf-swarm-machine-beams';
  mbeams.frustumCulled = false;
  mbeams.renderOrder = 6;
  mbeams.count = 0;
  mbeams.visible = false;
  scene.add(mbeams);

  const mauras = new THREE.InstancedMesh(ringGeo, flatMarkerMaterial(0x7a9cff, 0.34), RING_CAP);
  mauras.name = 'sf-swarm-machine-auras';
  mauras.frustumCulled = false;
  mauras.renderOrder = 5;
  mauras.count = 0;
  mauras.visible = false;
  scene.add(mauras);
  const SEG_FREE_COLOR = new THREE.Color(0.9, 0.42, 0.16);   // the freed link burns hotter

  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const axis = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const color = new THREE.Color();
  const splitTint = new THREE.Color();

  const FAMILY_COLORS = DRAW_FAMILIES.map((def) => color.clone().setRGB(
    def.bodyColor[0], def.bodyColor[1], def.bodyColor[2],
  ));
  // The strain marks: byte index → the strain's authored tint (swarmBroodLate.js). A marked
  // body burns pale-hot over its family's recipe — the cooked flesh reads before it pops.
  const STRAIN_TINTS = SWARM_BROOD_STRAINS.map((strain) => color.clone().setRGB(
    strain.tint[0], strain.tint[1], strain.tint[2],
  ));
  // The cascade flush's scratch (zero per-frame allocation): the target colour and the
  // pure layer's output record, both retained.
  const flushColor = new THREE.Color();
  const flushScratch = { weight: 0, r: 0, g: 0, b: 0 };

  function dispose() {
    for (const m of [mesh, rings, pools, lines, lanes, lobs, segs, mlinks, mbeams, mauras]) {
      scene.remove(m);
      // lanes/mlinks/mbeams share the line geometry; mauras shares the ring geometry.
      if (m !== lanes && m !== mlinks && m !== mbeams && m !== mauras) m.geometry.dispose();
      m.material.dispose();
    }
  }

  /** A flat ring scaled to a world radius, drawn at the marker's point. */
  function writeRing(index, x, z, radius, grow) {
    quat.identity();
    pos.set(x, 0.25, z);
    const r = Math.max(0.5, radius * grow);
    scl.set(r, 1, r);
    matrix.compose(pos, quat, scl);
    rings.setMatrixAt(index, matrix);
  }

  /**
   * @param {object} view the engine's published view (may be null/empty)
   * @param {number} dt frame seconds
   * @param {{simTime?:number, reducedMotion?:boolean}} opts
   * @returns {boolean} true when anything was drawn this frame
   */
  function update(view, dt, opts = {}) {
    void dt;
    const bodies = !!(view && view.alive && view.aliveCount > 0);
    if (!bodies) {
      mesh.count = 0;
      mesh.visible = false;
    }
    const simTime = Number.isFinite(opts.simTime) ? opts.simTime : 0;
    const reduced = opts.reducedMotion === true;

    // ---- bodies ------------------------------------------------------------------
    let written = 0;
    let chargersWinding = 0;
    if (bodies) {
      const count = Math.min(view.cap, capacity);
      const { px, pz, heading, family, alive, phase, seedPhase, teleX, teleZ } = view;
      for (let i = 0; i < count; i++) {
        if (!alive[i]) continue;
        const bob = reduced ? 0 : Math.sin(simTime * 5.1 + seedPhase[i]) * 0.35;
        quat.setFromAxisAngle(axis, heading[i]);
        pos.set(px[i], 0.6 + bob, pz[i]);
        const fam = family[i];
        const drawn = fam >= 0 && fam < FAMILY_N ? DRAW_FAMILIES[fam] : null;
        // S6: the E1 draw scale lives on Lane F's character sheet (drawScale 1.5 — draw only,
        // the collision radius in swarmBrood.js never moves).
        const charScale = drawn ? (swarmBroodCharacterFor(drawn.id)?.drawScale || 1) : 1;
        const base = (drawn ? drawn.radius / 2.4 : 1) * charScale;
        const stretch = familyStretch(fam);
        scl.set(base * stretch[0], base * stretch[1], base * stretch[2]);
        matrix.compose(pos, quat, scl);
        mesh.setMatrixAt(written, matrix);
        const c = drawn ? FAMILY_COLORS[fam] : FAMILY_COLORS[0];
        color.copy(c);
        if (drawn && Array.isArray(drawn.bodyEmissive)
            && (drawn.splits || drawn.births || MACHINE_SET.has(drawn))) {
          splitTint.setRGB(drawn.bodyEmissive[0], drawn.bodyEmissive[1], drawn.bodyEmissive[2]);
          color.lerp(splitTint, drawn.births ? 0.55 : 0.45);
        }
        if (view.affix && view.affix[i] > 0) {
          const markTint = STRAIN_TINTS[view.affix[i] - 1];
          if (markTint) color.lerp(markTint, 0.72);
        }
        // inf-brood-cascade-flush: the coupling web's flush, keyed to the view kind the
        // engine publishes — panic flares the pack hot, grief cools it toward its dead.
        // No cascade live (or an unwired kind) leaves the colour exactly as it was.
        const flush = view.cascade && view.cascade !== BROOD_CASCADE_NONE
          ? resolveBroodCascadeFlush(view.cascade, simTime,
            (seedPhase[i] % TAU) / TAU, reduced, flushScratch)
          : null;
        if (flush) {
          flushColor.setRGB(flush.r, flush.g, flush.b);
          color.lerp(flushColor, flush.weight);
        }
        mesh.setColorAt(written, color);
        // The committed-pass telegraph: one stretched marker per winding pass — the
        // charger's own line, and the formation drone's peel dive, which is the same law.
        if (phase[i] === 1 && chargersWinding < LINE_CAP && drawn && (drawn.id === 'charger' || drawn.formation)) {
          const dx = teleX[i] - px[i];
          const dz = teleZ[i] - pz[i];
          const len = Math.sqrt(dx * dx + dz * dz);
          if (len > 1) {
            quat.setFromAxisAngle(axis, Math.atan2(dz, dx));
            pos.set(px[i] + dx * 0.5, 0.4, pz[i] + dz * 0.5);
            scl.set(len, 1, 1);
            matrix.compose(pos, quat, scl);
            lines.setMatrixAt(chargersWinding, matrix);
            // The footprint: the lane from the charger along the committed bearing, as wide and as
            // long as the dash's damage query (a lane half-width of both radii touching).
            const lane = chargerLane(view, drawn.radius);
            quat.setFromAxisAngle(axis, Math.atan2(dz, dx));
            pos.set(px[i] + (dx / len) * lane.reach * 0.5, 0.3, pz[i] + (dz / len) * lane.reach * 0.5);
            scl.set(lane.reach, 1, (lane.halfWidth * 2) / 0.14);
            matrix.compose(pos, quat, scl);
            lanes.setMatrixAt(chargersWinding, matrix);
            chargersWinding += 1;
          }
        }
        written += 1;
      }
    }
    mesh.count = written;
    mesh.visible = written > 0;
    if (written > 0) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }

    // ---- the attack language -------------------------------------------------------

    // Spitter windup markers: the ground ring grows in as the splash approaches.
    // The Machine's weld channels ride the same marker language: a ring on the wreck
    // tightening as the channel lands — the salvager's teleX tracks the remain it eats.
    let ringN = 0;
    if (bodies) {
      const count = Math.min(view.cap, capacity);
      const { alive, phase, family, teleX, teleZ, timer } = view;
      for (let i = 0; i < count && ringN < RING_CAP; i++) {
        if (!alive[i] || phase[i] !== 1) continue;
        const fam = family[i];
        if (!(fam >= 0 && fam < FAMILY_N)) continue;
        const drawn = DRAW_FAMILIES[fam];
        if (drawn.id === 'spitter') {
          // Grow from 0.2 to 1.0 across the windup so the marker tightens as it lands.
          // The marker closes IN on the real splash radius and arrives at it exactly at impact.
          writeRing(ringN, teleX[i], teleZ[i], spitterFootprintRadius(view), 1.0 - 0.48 * Math.max(0, Math.min(1, timer[i] / 0.8)));
          ringN += 1;
        } else if (drawn.repairs || drawn.assembles) {
          const channelS = drawn.repairs ? drawn.repairS : drawn.assembleS;
          const grow = 1.0 - 0.6 * Math.max(0, Math.min(1, timer[i] / (channelS > 0 ? channelS : 3)));
          writeRing(ringN, teleX[i], teleZ[i], 7, grow);
          ringN += 1;
        }
      }
    }
    rings.count = ringN;
    rings.visible = ringN > 0;
    if (ringN > 0) rings.instanceMatrix.needsUpdate = true;

    // Acid pools: dark discs that cool out over their ttl.
    let poolN = 0;
    if (view && view.poolCount > 0) {
      for (let i = 0; i < POOL_CAP; i++) {
        const age = view.poolAge[i];
        const ttl = view.poolTtl[i];
        if (!(ttl > 0) || age >= ttl) continue;
        quat.identity();
        pos.set(view.poolX[i], 0.15, view.poolZ[i]);
        const r = poolFootprintRadius(view); // the acid query does not shrink as the pool cools
        scl.set(r, 1, r);
        matrix.compose(pos, quat, scl);
        pools.setMatrixAt(poolN, matrix);
        poolN += 1;
      }
    }
    pools.count = poolN;
    pools.visible = poolN > 0;
    if (poolN > 0) pools.instanceMatrix.needsUpdate = true;

    // Charger lines.
    lines.count = chargersWinding;
    lines.visible = chargersWinding > 0;
    lanes.count = chargersWinding;
    lanes.visible = chargersWinding > 0;
    if (chargersWinding > 0) {
      lines.instanceMatrix.needsUpdate = true;
      lanes.instanceMatrix.needsUpdate = true;
    }

    // ---- the Machine's instruments ---------------------------------------------------
    // Shield links: one cyan line per live beam, linker to charge.
    let linkN = 0;
    if (view && Array.isArray(view.links)) {
      for (const link of view.links) {
        if (linkN >= LINE_CAP) break;
        const dx = link.x2 - link.x1;
        const dz = link.z2 - link.z1;
        const len = Math.sqrt(dx * dx + dz * dz);
        if (!(len > 1)) continue;
        quat.setFromAxisAngle(axis, Math.atan2(dz, dx));
        pos.set(link.x1 + dx * 0.5, 0.5, link.z1 + dz * 0.5);
        scl.set(len, 1, 0.8);
        matrix.compose(pos, quat, scl);
        mlinks.setMatrixAt(linkN, matrix);
        linkN += 1;
      }
    }
    mlinks.count = linkN;
    mlinks.visible = linkN > 0;
    if (linkN > 0) mlinks.instanceMatrix.needsUpdate = true;

    // Beam instruments: a windup draws both arc edges as faint blades; a live sweep
    // draws the walking edge at full burn — the marker IS the segment the engine cuts.
    let beamN = 0;
    if (view && Array.isArray(view.beams)) {
      // Sim headings turn +X toward +Z, opposite Three's positive Y rotation.
      for (const beam of view.beams) {
        // A covered muzzle has no edge. Never submit a singular zero-scale matrix.
        if (!(beam.range > 0)) continue;
        if (beam.state === 0) {
          if (beamN < LINE_CAP) {
            quat.setFromAxisAngle(axis, -beam.a0);
            pos.set(beam.x + Math.cos(beam.a0) * beam.range * 0.5, 0.35,
              beam.z + Math.sin(beam.a0) * beam.range * 0.5);
            scl.set(beam.range, 0.5, 0.7);
            matrix.compose(pos, quat, scl);
            mbeams.setMatrixAt(beamN, matrix);
            beamN += 1;
          }
          if (beamN < LINE_CAP) {
            quat.setFromAxisAngle(axis, -beam.a1);
            pos.set(beam.x + Math.cos(beam.a1) * beam.range * 0.5, 0.35,
              beam.z + Math.sin(beam.a1) * beam.range * 0.5);
            scl.set(beam.range, 0.5, 0.7);
            matrix.compose(pos, quat, scl);
            mbeams.setMatrixAt(beamN, matrix);
            beamN += 1;
          }
          continue;
        }
        if (beamN >= LINE_CAP) break;
        const t = beam.total > 0 ? Math.min(1, beam.t / beam.total) : 1;
        const a = beam.a0 + (beam.a1 - beam.a0) * t;
        quat.setFromAxisAngle(axis, -a);
        pos.set(beam.x + Math.cos(a) * beam.range * 0.5, 0.45,
          beam.z + Math.sin(a) * beam.range * 0.5);
        scl.set(beam.range, 1, Math.max(1, 2 * beam.width / 0.14));
        matrix.compose(pos, quat, scl);
        mbeams.setMatrixAt(beamN, matrix);
        beamN += 1;
      }
    }
    mbeams.count = beamN;
    mbeams.visible = beamN > 0;
    if (beamN > 0) mbeams.instanceMatrix.needsUpdate = true;

    // Magnet auras: the faint ring your shots bend into.
    let auraN = 0;
    if (view && Array.isArray(view.auras)) {
      for (const aura of view.auras) {
        if (auraN >= RING_CAP) break;
        quat.identity();
        pos.set(aura.x, 0.3, aura.z);
        scl.set(aura.r, 1, aura.r);
        matrix.compose(pos, quat, scl);
        mauras.setMatrixAt(auraN, matrix);
        auraN += 1;
      }
    }
    mauras.count = auraN;
    mauras.visible = auraN > 0;
    if (auraN > 0) mauras.instanceMatrix.needsUpdate = true;

    // Acid lobs in flight: a dot on the arc, height keyed to flight progress.
    let lobN = 0;
    if (view && view.lobCount > 0) {
      const n = Math.min(view.lobCount, LOB_CAP);
      for (let i = 0; i < LOB_MAX_ITER && lobN < n; i++) {
        if (!view.lobAlive[i]) continue;
        const progress = view.lobTotal[i] > 0 ? Math.min(1, view.lobT[i] / view.lobTotal[i]) : 1;
        const height = Math.sin(Math.PI * progress) * 22;
        quat.setFromAxisAngle(axis, progress * Math.PI * 2);
        pos.set(view.lobX[i], 0.8 + height, view.lobZ[i]);
        scl.set(1, 1, 1);
        matrix.compose(pos, quat, scl);
        lobs.setMatrixAt(lobN, matrix);
        lobN += 1;
      }
    }
    lobs.count = lobN;
    lobs.visible = lobN > 0;
    if (lobN > 0) lobs.instanceMatrix.needsUpdate = true;

    // ---- B3: the Tendril's chain ----------------------------------------------------
    // Read-only over the published segment buffers: jointed darts on the same geometry,
    // stretched lengthwise into knuckles. A freed link (SEG_LEAD_FREE) tints hot — the
    // Centipede split made visible. Reduced motion drops the tail sway only.
    let segN = 0;
    if (view && view.tendril && view.segAliveCount > 0 && view.segAlive) {
      const freeLead = view.segLeadFree;
      const base = (view.segRadius || TENDRIL_SEG_RADIUS) / 2.4;
      for (let i = 0; i < SEG_CAP && segN < SEG_CAP; i++) {
        if (!view.segAlive[i]) continue;
        const sway = reduced ? 0 : Math.sin(simTime * 6.4 + i * 0.9) * 0.28;
        quat.setFromAxisAngle(axis, view.segHeading ? view.segHeading[i] : 0);
        pos.set(view.segX[i], 0.7 + sway, view.segZ[i]);
        // The knuckle: longer than the dart, narrower — one link of a worm, not a ship.
        scl.set(base * 1.7, base * 0.8, base * 0.85);
        matrix.compose(pos, quat, scl);
        segs.setMatrixAt(segN, matrix);
        color.copy(view.segLead[i] === freeLead ? SEG_FREE_COLOR : SEG_BODY_COLOR);
        segs.setColorAt(segN, color);
        segN += 1;
      }
    }
    segs.count = segN;
    segs.visible = segN > 0;
    if (segN > 0) {
      segs.instanceMatrix.needsUpdate = true;
      if (segs.instanceColor) segs.instanceColor.needsUpdate = true;
    }

    return written > 0 || ringN > 0 || poolN > 0 || chargersWinding > 0 || lobN > 0 || segN > 0
      || linkN > 0 || beamN > 0 || auraN > 0;
  }

  return { mesh, rings, pools, lines, lanes, lobs, segs, mlinks, mbeams, mauras, update, dispose };
}

