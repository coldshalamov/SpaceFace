// SpaceFace — three.quarks VFX scaffolding.
//
// Batched 3D mesh particle systems, one designed material language per family:
//   1. Impact spall   — molten armor darts: white-hot HDR cores that drag, cool to ember
//   2. Shield shards  — hexagonal field glass: edge-bright cyan plates that tumble and dim
//   3. Muzzle sparks  — plasma needles: overexposed blue-white, gone in a tenth of a second
//   4. Casings        — spent brass: LIT solid (MeshStandardMaterial), tumbling, cooling dark
//   5. Retro venting  — cryogenic ice needles off the bow jets, supersonic and brief
//   6. Mining ejecta  — authored STONE: fracture planes and a mineral vein, lit by the contact
//   7. Collision spall— authored STONE at rock scale: real scene lighting, not a glow (M1)
//   8. Damage venting — burning coolant spray that wanders (turbulent leak, not a cone print)
//   9. Shrapnel       — authored METAL: torn hull plates with thickness, crease and coating
//  10. Ice spall      — authored ICE: mirror shear plane against a terraced fracture underside
//  11. Cargo debris   — authored CARGO: ribbed, marked, hemmed panel with one ripped end
//
// Families 6, 7, 9, 10 and 11 are built by src/render/vfx/fragmentFamilies.js, which owns the
// authored geometry, the shared two-page material atlas and the per-family pool ceilings. Mining
// ejecta and collision spall deliberately share one stone geometry AND one stone material, so
// three.quarks merges them into a single batch: two events, one draw call.
//
// Design invariants (docs/visual-assets/VFX_TECHNIQUE_STANDARD.md):
//   - No 2D billboards, Points, or Sprites anywhere in this file (B2/B4/B13).
//   - Energy cools from HDR-hot to cold; solid fragments stay opaque and retire by size.
//   - Every family has an attack/settle/cool envelope via Size/Speed/Rotation behaviors, so no
//     burst is a uniform expanding shell (B10/B18).
//   - Additive energy families run toneMapped:false with HDR headroom so bloom has something
//     to catch (B8/M2); genuinely cold solid matter is scene-lit instead of self-glowing (M1).
//   - All spawn paths reuse scratch vectors/matrices; bursts only (emissionOverTime: 0).

import * as THREE from 'three';
import { impactOutwardNormal, impactTangentFraction } from '../combat/impactEventRecord.js';
import {
  FRAGMENT_FAMILY,
  FRAGMENT_DETAIL,
  FRAGMENT_POOL_CEILING,
  buildFragmentGeometry,
  createFragmentAtlas,
  createFragmentMaterial,
  remapUvIntoBand,
  resolveFragmentFamily,
} from './fragmentFamilies.js';
import {
  BatchedParticleRenderer,
  ParticleSystem,
  ConeEmitter,
  SphereEmitter,
  ConstantValue,
  IntervalValue,
  ColorRange,
  ColorOverLife,
  SizeOverLife,
  SpeedOverLife,
  Rotation3DOverLife,
  AxisAngleGenerator,
  RandomQuatGenerator,
  Gradient,
  Noise,
  PiecewiseBezier,
  Bezier,
  RenderMode,
} from 'three.quarks';

const _vUp = new THREE.Vector3(0, 1, 0);
const _vForward = new THREE.Vector3(0, 0, 1);
const _scaleOne = new THREE.Vector3(1, 1, 1);

// Flat facets preserve each cut plane through rotation.
function facet(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.computeVertexNormals();
  return g;
}

// One cubic bezier over normalized life. Control points are chosen per family so attack is
// always faster than release (E3).
function lifeCurve(p0, p1, p2, p3) {
  return new PiecewiseBezier([[new Bezier(p0, p1, p2, p3), 0]]);
}

// Hot-to-cold radiance track. HDR stops above 1.0 are deliberate bloom feed; alpha holds while
// the temperature does the work and only cuts at the very end.
function heatGradient(stops, alphaStops = [[1, 0], [1, 0.7], [0, 1]]) {
  return new Gradient(
    stops.map(([r, g, b, t]) => [new THREE.Vector3(r, g, b), t]),
    alphaStops,
  );
}

function additiveDonor() {
  return new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
}

// A broken, bowed lattice edge has empty space at its centre. It cannot turn into the
// fully filled luminous hexagon that previously read as a tossed sequin.
function shieldStressGeometry() {
  const positions = [];
  const uvs = [];
  const point = (i, radius, depth) => {
    const angle = i * Math.PI / 3;
    return [Math.cos(angle) * radius, depth + Math.sin(angle) * 0.045, Math.sin(angle) * radius];
  };
  const triangle = (a, b, c) => {
    for (const p of [a, b, c]) { positions.push(...p); uvs.push(p[0] + 0.5, p[2] + 0.5); }
  };
  for (let i = 0; i < 4; i++) {
    const a = point(i, 0.28, 0.02), b = point(i + 1, 0.28, 0.02);
    const c = point(i + 1, 0.20, -0.02), d = point(i, 0.20, -0.02);
    triangle(a, b, c); triangle(a, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  return geo;
}

// Opaque fragments retain mass through their travel, then contract out of the pool.
// Retirement never makes the remaining world visible through a rock or hull plate, and because
// each fragment's own startLife is an interval the family never blinks out together.
function solidRetirement() {
  return new SizeOverLife(new PiecewiseBezier([
    [new Bezier(1, 1, 1, 1), 0],
    [new Bezier(1, 0.9, 0.35, 0), 0.82],
  ]));
}

// Alpha that never leaves 1: solid matter retires by contracting, never by turning into a ghost.
const SOLID_ALPHA = [[1, 0], [1, 1]];

function clamp01(v) {
  return v > 1 ? 1 : (v > 0 ? v : 0);
}

export class QuarksVfxSystem {
  constructor(options = {}) {
    this.scene = null;
    this.renderer = new BatchedParticleRenderer();
    this.renderer.name = 'SF_QuarksBatchedRenderer';
    this.root = new THREE.Group();
    this.root.name = 'SF_QuarksEmittersRoot';

    this._scratchPos = new THREE.Vector3();
    this._scratchDir = new THREE.Vector3();
    this._scratchQuat = new THREE.Quaternion();
    this._scratchMatrix = new THREE.Matrix4();
    this._scratchNormal = { x: 0, y: 0, z: 0 };

    // ---- authored solid-fragment resources -------------------------------------------------
    // Two atlas pages and four materials serve every solid family, so the debris class is one
    // texture residency and one shader program family however many events are in flight.
    this._fragmentDetail = options.fragmentDetail === FRAGMENT_DETAIL.FAR
      ? FRAGMENT_DETAIL.FAR : FRAGMENT_DETAIL.NEAR;
    this.fragmentAtlas = createFragmentAtlas();
    this._fragmentGeo = {};
    this._fragmentMat = {};
    for (const family of [FRAGMENT_FAMILY.METAL, FRAGMENT_FAMILY.STONE,
      FRAGMENT_FAMILY.ICE, FRAGMENT_FAMILY.CARGO]) {
      this._fragmentGeo[family] = buildFragmentGeometry(family, { detail: this._fragmentDetail });
      this._fragmentMat[family] = createFragmentMaterial(family, this.fragmentAtlas);
    }

    // -------------------------------------------------------------
    // 1. Hull Impact Spall — molten armor darts.
    // Long 4-sided darts flung along the contact normal; white-hot at separation, dragging hard
    // and cooling through orange to a dead ember. No tumble: a dart holds its flight axis.
    // -------------------------------------------------------------
    const spallGeo = facet(new THREE.ConeGeometry(0.09, 0.7, 4));
    spallGeo.rotateX(Math.PI / 2);
    this.impactSpall = new ParticleSystem({
      duration: 1,
      looping: false,
      startLife: new IntervalValue(0.22, 0.55),
      startSpeed: new IntervalValue(14, 34),
      startSize: new IntervalValue(0.45, 1.35),
      startColor: new ColorRange(new THREE.Vector4(1, 1, 1, 1), new THREE.Vector4(1, 0.85, 0.62, 1)),
      worldSpace: true,
      emissionOverTime: new ConstantValue(0),
      shape: new ConeEmitter({ radius: 0.05, angle: 0.65 }),
      material: additiveDonor(),
      renderMode: RenderMode.Mesh,
      instancingGeometry: spallGeo,
      behaviors: [
        new ColorOverLife(heatGradient([[3.4, 2.7, 1.7, 0], [1.9, 0.55, 0.1, 0.45], [0.22, 0.04, 0.01, 1]])),
        new SizeOverLife(lifeCurve(0.65, 1.15, 1.0, 0.45)),
        new SpeedOverLife(lifeCurve(1.0, 0.55, 0.3, 0.16)),
        new Noise(new ConstantValue(5), new ConstantValue(0.35)),
      ],
    });

    // -------------------------------------------------------------
    // 2. Shield Shards — hexagonal field glass.
    // Bowed broken lattice edges retain the shield structure with open centres.
    // Cyan stress cools quickly while their slow tumble leaves the body visible.
    // -------------------------------------------------------------
    const shieldShardGeo = shieldStressGeometry();
    const shieldShardMat = additiveDonor();
    shieldShardMat.side = THREE.DoubleSide;
    this.shieldShards = new ParticleSystem({
      duration: 1,
      looping: false,
      startLife: new IntervalValue(0.2, 0.45),
      startSpeed: new IntervalValue(9, 22),
      startSize: new IntervalValue(0.5, 1.5),
      startRotation: new RandomQuatGenerator(),
      startColor: new ColorRange(new THREE.Vector4(0.85, 1, 1, 1), new THREE.Vector4(0.6, 0.9, 1.1, 1)),
      worldSpace: true,
      emissionOverTime: new ConstantValue(0),
      shape: new ConeEmitter({ radius: 0.1, angle: 0.85 }),
      material: shieldShardMat,
      renderMode: RenderMode.Mesh,
      instancingGeometry: shieldShardGeo,
      behaviors: [
        new ColorOverLife(heatGradient([[1.7, 3.3, 4.2, 0], [0.35, 1.1, 2.4, 0.5], [0.04, 0.2, 0.7, 1]])),
        new SizeOverLife(lifeCurve(0.55, 1.1, 1.0, 0.6)),
        new SpeedOverLife(lifeCurve(1.0, 0.8, 0.55, 0.4)),
        new Rotation3DOverLife(new AxisAngleGenerator(_vUp, new IntervalValue(1.5, 4.5))),
      ],
    });

    // -------------------------------------------------------------
    // 3. Muzzle Sparks — plasma needles.
    // Overexposed blue-white slivers with a brutal drag curve: a violent crack that is gone
    // before the eye can track it.
    // -------------------------------------------------------------
    const muzzleGeo = facet(new THREE.ConeGeometry(0.05, 0.95, 3));
    muzzleGeo.rotateX(Math.PI / 2);
    this.muzzleSparks = new ParticleSystem({
      duration: 1,
      looping: false,
      startLife: new IntervalValue(0.07, 0.16),
      startSpeed: new IntervalValue(26, 55),
      startSize: new IntervalValue(0.5, 1.3),
      startColor: new ColorRange(new THREE.Vector4(0.9, 1, 1.1, 1), new THREE.Vector4(0.7, 0.9, 1.2, 1)),
      worldSpace: true,
      emissionOverTime: new ConstantValue(0),
      shape: new ConeEmitter({ radius: 0.05, angle: 0.35 }),
      material: additiveDonor(),
      renderMode: RenderMode.Mesh,
      instancingGeometry: muzzleGeo,
      behaviors: [
        new ColorOverLife(heatGradient([[2.6, 3.4, 4.6, 0], [0.3, 0.9, 2.0, 0.6], [0.05, 0.15, 0.5, 1]], [[1, 0], [0.9, 0.5], [0, 1]])),
        new SizeOverLife(lifeCurve(1.0, 1.05, 0.7, 0.3)),
        new SpeedOverLife(lifeCurve(1.0, 0.5, 0.22, 0.1)),
      ],
    });

    // -------------------------------------------------------------
    // 4. Spent Shell Casings — LIT solid brass.
    // Cold manufactured matter: scene-lit (key/rim/fill + muzzle point light), tumbling end over
    // end, warming from the chamber then cooling dark. Solid matter, with no self-glow.
    // -------------------------------------------------------------
    const casingGeo = facet(new THREE.CylinderGeometry(0.07, 0.07, 0.28, 6));
    casingGeo.rotateZ(Math.PI / 2);
    // Spent brass joins the metal family's atlas band rather than minting its own texture and
    // shader variant; only the tint and finish stay brass.
    remapUvIntoBand(casingGeo, FRAGMENT_FAMILY.METAL, 'bare');
    const casingMat = createFragmentMaterial(FRAGMENT_FAMILY.METAL, this.fragmentAtlas, {
      color: 0xc9a227,
      metalness: 0.55,
      roughness: 0.38,
    });
    casingMat.transparent = true;
    casingMat.name = 'SF_FragmentMat_casing';
    this._casingDonor = casingMat;
    this.casingEjection = new ParticleSystem({
      duration: 1,
      looping: false,
      startLife: new IntervalValue(0.9, 1.5),
      startSpeed: new IntervalValue(4, 9),
      startSize: new IntervalValue(0.8, 1.15),
      startRotation: new RandomQuatGenerator(),
      startColor: new ColorRange(new THREE.Vector4(1.35, 1.1, 0.55, 1), new THREE.Vector4(1.1, 0.9, 0.45, 1)),
      worldSpace: true,
      emissionOverTime: new ConstantValue(0),
      shape: new ConeEmitter({ radius: 0.05, angle: 0.4 }),
      material: casingMat,
      renderMode: RenderMode.Mesh,
      instancingGeometry: casingGeo,
      behaviors: [
        // Chamber-hot brass cooling to shadowed metal; alpha holds until the last breath.
        new ColorOverLife(heatGradient([[1.25, 1.05, 0.55, 0], [0.75, 0.6, 0.32, 0.55], [0.3, 0.24, 0.14, 1]], [[1, 0], [1, 0.82], [0, 1]])),
        new SpeedOverLife(lifeCurve(1.0, 0.85, 0.65, 0.5)),
        new Rotation3DOverLife(new AxisAngleGenerator(_vForward, new IntervalValue(6, 14))),
      ],
    });

    // -------------------------------------------------------------
    // 5. Retro Venting — cryogenic ice needles.
    // Supersonic moisture flash-frozen off the bow jets: pale, hard, fast, and gone. A faint
    // noise jitter keeps the spray from reading as a printed cone.
    // -------------------------------------------------------------
    const retroIceGeo = facet(new THREE.ConeGeometry(0.06, 0.6, 3));
    retroIceGeo.rotateX(Math.PI / 2);
    this.retroVenting = new ParticleSystem({
      duration: 1,
      looping: false,
      startLife: new IntervalValue(0.12, 0.26),
      startSpeed: new IntervalValue(38, 70),
      startSize: new IntervalValue(0.55, 1.35),
      startColor: new ColorRange(new THREE.Vector4(1, 1, 1, 1), new THREE.Vector4(0.75, 0.9, 1.15, 1)),
      worldSpace: true,
      emissionOverTime: new ConstantValue(0),
      shape: new ConeEmitter({ radius: 0.2, angle: 0.28 }),
      material: additiveDonor(),
      renderMode: RenderMode.Mesh,
      instancingGeometry: retroIceGeo,
      behaviors: [
        new ColorOverLife(heatGradient([[2.3, 2.9, 3.3, 0], [0.5, 1.2, 2.2, 0.55], [0.06, 0.25, 0.8, 1]], [[1, 0], [0.85, 0.5], [0, 1]])),
        new SizeOverLife(lifeCurve(0.8, 1.1, 0.9, 0.35)),
        new SpeedOverLife(lifeCurve(1.0, 0.9, 0.75, 0.6)),
        new Noise(new ConstantValue(7), new ConstantValue(0.5)),
      ],
    });

    // -------------------------------------------------------------
    // 6. Mining Ejecta — authored STONE at chip scale.
    // Contact light belongs to the mining owner. Cleavage planes, the bedding staircase and the
    // proud mineral vein stay visible as chips leave that light, without spectral glitter.
    // Shares its geometry AND material with collision spall, so both merge into one batch.
    // -------------------------------------------------------------
    this.miningEjecta = new ParticleSystem({
      duration: 1,
      looping: false,
      startLife: new IntervalValue(0.4, 0.85),
      startSpeed: new IntervalValue(8, 24),
      // Base stone block is ~0.9 WU across; at 5.96 px/WU a chip reads from 3 to 8 px.
      startSize: new IntervalValue(0.5, 1.6),
      startRotation: new RandomQuatGenerator(),
      startColor: new ColorRange(new THREE.Vector4(1.06, 1.0, 0.94, 1), new THREE.Vector4(0.82, 0.8, 0.76, 1)),
      worldSpace: true,
      emissionOverTime: new ConstantValue(0),
      shape: new ConeEmitter({ radius: 0.15, angle: 0.8 }),
      material: this._fragmentMat[FRAGMENT_FAMILY.STONE],
      renderMode: RenderMode.Mesh,
      instancingGeometry: this._fragmentGeo[FRAGMENT_FAMILY.STONE],
      behaviors: [
        new ColorOverLife(heatGradient([[1.08, 1.0, 0.9, 0], [0.86, 0.83, 0.79, 0.5], [0.52, 0.5, 0.48, 1]], SOLID_ALPHA)),
        solidRetirement(),
        new SpeedOverLife(lifeCurve(1.0, 0.7, 0.45, 0.3)),
        new Rotation3DOverLife(new AxisAngleGenerator(_vUp, new IntervalValue(2, 8))),
      ],
    });

    // -------------------------------------------------------------
    // 7. Collision Spall — the same authored STONE at rock scale.
    // Cold terrain matter has no business glowing: real scene lighting on a block that keeps its
    // arris and its weathered flanks through the tumble, then drags and settles.
    // -------------------------------------------------------------
    this.collisionSpall = new ParticleSystem({
      duration: 1,
      looping: false,
      startLife: new IntervalValue(0.45, 1.0),
      // Asteroids run 8-20 WU of radius; a broken-off block reads at 5-17 px, not 2.
      startSize: new IntervalValue(1.0, 3.2),
      startSpeed: new IntervalValue(6, 18),
      startRotation: new RandomQuatGenerator(),
      startColor: new ColorRange(new THREE.Vector4(1.05, 1.0, 0.92, 1), new THREE.Vector4(0.8, 0.82, 0.9, 1)),
      worldSpace: true,
      emissionOverTime: new ConstantValue(0),
      shape: new SphereEmitter({ radius: 0.3 }),
      material: this._fragmentMat[FRAGMENT_FAMILY.STONE],
      renderMode: RenderMode.Mesh,
      instancingGeometry: this._fragmentGeo[FRAGMENT_FAMILY.STONE],
      behaviors: [
        new ColorOverLife(heatGradient([[1.15, 1.1, 1.02, 0], [0.85, 0.82, 0.78, 0.6], [0.45, 0.43, 0.4, 1]], SOLID_ALPHA)),
        solidRetirement(),
        new SpeedOverLife(lifeCurve(1.0, 0.7, 0.5, 0.38)),
        new Rotation3DOverLife(new AxisAngleGenerator(_vUp, new IntervalValue(3, 10))),
      ],
    });

    // -------------------------------------------------------------
    // 8. Damage Venting — burning coolant spray.
    // A punctured line, not a bonfire: a wandering orange jet (noise advects the spray) that
    // gutters as pressure drops.
    // -------------------------------------------------------------
    const damageSparkGeo = facet(new THREE.ConeGeometry(0.07, 0.42, 3));
    damageSparkGeo.rotateX(Math.PI / 2);
    this.damageVenting = new ParticleSystem({
      duration: 1,
      looping: false,
      startLife: new IntervalValue(0.3, 0.65),
      startSpeed: new IntervalValue(7, 16),
      startSize: new IntervalValue(0.5, 1.35),
      startColor: new ColorRange(new THREE.Vector4(1.1, 0.95, 0.8, 1), new THREE.Vector4(1.0, 0.75, 0.5, 1)),
      worldSpace: true,
      emissionOverTime: new ConstantValue(0),
      shape: new ConeEmitter({ radius: 0.15, angle: 0.7 }),
      material: additiveDonor(),
      renderMode: RenderMode.Mesh,
      instancingGeometry: damageSparkGeo,
      behaviors: [
        new ColorOverLife(heatGradient([[3.1, 1.7, 0.5, 0], [1.2, 0.3, 0.06, 0.5], [0.25, 0.05, 0.01, 1]])),
        new SizeOverLife(lifeCurve(0.7, 1.1, 0.95, 0.4)),
        new SpeedOverLife(lifeCurve(1.0, 0.65, 0.4, 0.28)),
        new Noise(new ConstantValue(4), new ConstantValue(0.9)),
      ],
    });

    // -------------------------------------------------------------
    // 9. Destruction Shrapnel — authored METAL: torn hull plates.
    // A ship is 28-90 WU across, so the plate torn off it has to be metres of structure, not a
    // chip: these run 1.8-4.8 WU, which is 10-29 px at the chase camera. Fewer, larger, and each
    // one carries its crease, its coating step and its knife-edged tear. The explosion core
    // supplies the heat; the plate cools to shadowed steel as it leaves that core.
    // -------------------------------------------------------------
    this.shrapnel = new ParticleSystem({
      duration: 1,
      looping: false,
      startLife: new IntervalValue(0.55, 1.1),
      startSpeed: new IntervalValue(10, 32),
      startSize: new IntervalValue(1.6, 4.4),
      startRotation: new RandomQuatGenerator(),
      startColor: new ColorRange(new THREE.Vector4(1.25, 1.05, 0.85, 1), new THREE.Vector4(1.0, 0.86, 0.7, 1)),
      worldSpace: true,
      emissionOverTime: new ConstantValue(0),
      shape: new SphereEmitter({ radius: 0.3 }),
      material: this._fragmentMat[FRAGMENT_FAMILY.METAL],
      renderMode: RenderMode.Mesh,
      instancingGeometry: this._fragmentGeo[FRAGMENT_FAMILY.METAL],
      behaviors: [
        // Heat lives on the fresh edge at separation and is gone by mid-life; the plate finishes
        // as cold shadowed metal, never as a light.
        new ColorOverLife(heatGradient([[1.35, 1.0, 0.72, 0], [0.84, 0.83, 0.8, 0.45], [0.52, 0.55, 0.6, 1]], SOLID_ALPHA)),
        solidRetirement(),
        new SpeedOverLife(lifeCurve(1.0, 0.7, 0.45, 0.3)),
        // A plate that size tumbles slowly — a fast spin would read as confetti.
        new Rotation3DOverLife(new AxisAngleGenerator(_vUp, new IntervalValue(1.6, 5.5))),
      ],
    });

    // -------------------------------------------------------------
    // 10. Ice Spall — authored ICE.
    // Not a blue rock. One mirror-flat shear plane answers the key light as a single hard sheet
    // while the terraced underside stays matte, so the material is legible from the specular
    // behaviour alone at a handful of pixels. No heat track: ice separates cold.
    // -------------------------------------------------------------
    this.iceSpall = new ParticleSystem({
      duration: 1,
      looping: false,
      startLife: new IntervalValue(0.5, 1.15),
      startSpeed: new IntervalValue(7, 22),
      startSize: new IntervalValue(0.9, 2.8),
      startRotation: new RandomQuatGenerator(),
      startColor: new ColorRange(new THREE.Vector4(1.0, 1.04, 1.1, 1), new THREE.Vector4(0.86, 0.94, 1.05, 1)),
      worldSpace: true,
      emissionOverTime: new ConstantValue(0),
      shape: new SphereEmitter({ radius: 0.3 }),
      material: this._fragmentMat[FRAGMENT_FAMILY.ICE],
      renderMode: RenderMode.Mesh,
      instancingGeometry: this._fragmentGeo[FRAGMENT_FAMILY.ICE],
      behaviors: [
        new ColorOverLife(heatGradient([[1.05, 1.1, 1.18, 0], [0.82, 0.9, 1.0, 0.55], [0.5, 0.58, 0.68, 1]], SOLID_ALPHA)),
        solidRetirement(),
        new SpeedOverLife(lifeCurve(1.0, 0.72, 0.5, 0.36)),
        // Flat slabs scythe rather than spin: a slower tumble keeps the shear plane readable.
        new Rotation3DOverLife(new AxisAngleGenerator(_vUp, new IntervalValue(2.2, 7))),
      ],
    });

    // -------------------------------------------------------------
    // 11. Cargo Debris — authored CARGO.
    // Freight that came apart. Ribs, hem and the marked centre bay keep the manufactured
    // ancestry; the ripped end keeps it from ever being read as a collectible. This is cosmetic
    // matter only: it carries no value, no pickup and no physics body.
    // -------------------------------------------------------------
    this.cargoDebris = new ParticleSystem({
      duration: 1,
      looping: false,
      startLife: new IntervalValue(0.65, 1.4),
      startSpeed: new IntervalValue(8, 26),
      startSize: new IntervalValue(1.3, 3.4),
      startRotation: new RandomQuatGenerator(),
      startColor: new ColorRange(new THREE.Vector4(1.05, 1.0, 0.96, 1), new THREE.Vector4(0.88, 0.86, 0.84, 1)),
      worldSpace: true,
      emissionOverTime: new ConstantValue(0),
      shape: new SphereEmitter({ radius: 0.35 }),
      material: this._fragmentMat[FRAGMENT_FAMILY.CARGO],
      renderMode: RenderMode.Mesh,
      instancingGeometry: this._fragmentGeo[FRAGMENT_FAMILY.CARGO],
      behaviors: [
        new ColorOverLife(heatGradient([[1.12, 1.02, 0.9, 0], [0.86, 0.83, 0.8, 0.5], [0.5, 0.49, 0.47, 1]], SOLID_ALPHA)),
        solidRetirement(),
        new SpeedOverLife(lifeCurve(1.0, 0.68, 0.44, 0.3)),
        new Rotation3DOverLife(new AxisAngleGenerator(_vForward, new IntervalValue(1.8, 6))),
      ],
    });

    // Register all systems to root and renderer
    const allSystems = [
      this.impactSpall,
      this.shieldShards,
      this.muzzleSparks,
      this.casingEjection,
      this.retroVenting,
      this.miningEjecta,
      this.collisionSpall,
      this.damageVenting,
      this.shrapnel,
      this.iceSpall,
      this.cargoDebris,
    ];

    for (const sys of allSystems) {
      this.root.add(sys.emitter);
      this.renderer.addSystem(sys);
    }

    // The batch renderer generates its own ShaderMaterial from each donor (default toneMapped),
    // which would crush the HDR gradient stops before bloom ever sees them. Opt the additive
    // energy batches out of tone mapping; scene-lit solid families stay on ACES.
    const energySystems = [
      this.impactSpall,
      this.shieldShards,
      this.muzzleSparks,
      this.retroVenting,
      this.damageVenting,
    ];
    for (const sys of energySystems) {
      const batchIndex = this.renderer.systemToBatchIndex.get(sys);
      const batch = batchIndex != null ? this.renderer.batches[batchIndex] : null;
      if (batch && batch.material) batch.material.toneMapped = false;
    }

    // ---- bounded solid pools ----------------------------------------------------------------
    // Per-family ceilings, enforced at the spawn call so a dense brawl cannot stack fragments
    // without limit, and pushed down into the instanced buffers so the batch never reallocates
    // mid-frame (three.quarks otherwise preallocates 1000 instances and DOUBLES on overflow).
    // Mining ejecta and collision spall sit in one shared stone batch, so their caps sum to the
    // stone ceiling rather than each claiming it.
    this._solidCap = new Map([
      [this.miningEjecta, Math.floor(FRAGMENT_POOL_CEILING[FRAGMENT_FAMILY.STONE] / 2)],
      [this.collisionSpall, Math.ceil(FRAGMENT_POOL_CEILING[FRAGMENT_FAMILY.STONE] / 2)],
      [this.shrapnel, FRAGMENT_POOL_CEILING[FRAGMENT_FAMILY.METAL]],
      [this.iceSpall, FRAGMENT_POOL_CEILING[FRAGMENT_FAMILY.ICE]],
      [this.cargoDebris, FRAGMENT_POOL_CEILING[FRAGMENT_FAMILY.CARGO]],
      [this.casingEjection, 48],
    ]);
    this._boundBatch(this.miningEjecta, FRAGMENT_POOL_CEILING[FRAGMENT_FAMILY.STONE]);
    this._boundBatch(this.shrapnel, FRAGMENT_POOL_CEILING[FRAGMENT_FAMILY.METAL]);
    this._boundBatch(this.iceSpall, FRAGMENT_POOL_CEILING[FRAGMENT_FAMILY.ICE]);
    this._boundBatch(this.cargoDebris, FRAGMENT_POOL_CEILING[FRAGMENT_FAMILY.CARGO]);
    this._boundBatch(this.casingEjection, 48);

    this._familySystem = {
      [FRAGMENT_FAMILY.METAL]: this.shrapnel,
      [FRAGMENT_FAMILY.STONE]: this.collisionSpall,
      [FRAGMENT_FAMILY.ICE]: this.iceSpall,
      [FRAGMENT_FAMILY.CARGO]: this.cargoDebris,
    };
    this._familyUsers = {
      [FRAGMENT_FAMILY.METAL]: [this.shrapnel],
      [FRAGMENT_FAMILY.STONE]: [this.miningEjecta, this.collisionSpall],
      [FRAGMENT_FAMILY.ICE]: [this.iceSpall],
      [FRAGMENT_FAMILY.CARGO]: [this.cargoDebris],
    };

    if (options.scene) {
      this.attach(options.scene);
    }
  }

  /** The batch a system currently renders through, or null. */
  _batchFor(sys) {
    const batchIndex = this.renderer.systemToBatchIndex.get(sys);
    return batchIndex != null ? this.renderer.batches[batchIndex] || null : null;
  }

  /** Shrink one batch's instanced buffers to a family ceiling. Idempotent, construction-time. */
  _boundBatch(sys, ceiling) {
    if (!(ceiling > 0)) return;
    const batch = this._batchFor(sys);
    if (!batch || batch.maxParticles <= ceiling) return;
    batch.maxParticles = ceiling;
    batch.setupBuffers();
  }

  /**
   * Spawn against a hard ceiling. A burst that would overrun the pool is truncated rather than
   * growing the buffers; the family keeps its oldest matter and simply throws less new matter.
   */
  _spawnCapped(sys, count, matrix) {
    const cap = this._solidCap ? this._solidCap.get(sys) : null;
    let n = Math.round(Number(count) || 0);
    if (n <= 0) return 0;
    if (cap != null) n = Math.min(n, Math.max(0, cap - sys.particleNum));
    if (n <= 0) return 0;
    sys.spawn(n, sys.emissionState, matrix);
    return n;
  }

  /** Orient the scratch matrix from a world point plus a direction, reusing the scratch objects. */
  _poseFrom(x, y, z, dx, dy, dz) {
    this._scratchPos.set(x, y, z);
    this._scratchDir.set(dx, dy, dz);
    if (this._scratchDir.lengthSq() < 1e-8) this._scratchDir.set(0, 0, 1);
    this._scratchDir.normalize();
    this._scratchQuat.setFromUnitVectors(_vForward, this._scratchDir);
    this._scratchMatrix.compose(this._scratchPos, this._scratchQuat, _scaleOne);
    return this._scratchMatrix;
  }

  /**
   * Swap every authored solid family to a near or far distance representation. Silhouette and
   * material identity are preserved; the micro-relief (coating step, weld bead, bedding steps,
   * bracket, extra tear teeth) is what drops out. Rebuilds the affected batches, so this belongs
   * on a quality-tier change, never in a per-frame path.
   */
  setFragmentDetail(detail) {
    const next = detail === FRAGMENT_DETAIL.FAR ? FRAGMENT_DETAIL.FAR : FRAGMENT_DETAIL.NEAR;
    if (next === this._fragmentDetail) return false;
    this._fragmentDetail = next;
    for (const family of Object.keys(this._familyUsers)) {
      // Swap the attribute payload INSIDE the geometry the batch was keyed on. Assigning a new
      // geometry object instead would re-key the system into a fresh batch and strand the old
      // one (three.quarks never retires an emptied batch), so the buffers are rebuilt in place.
      const source = buildFragmentGeometry(family, { detail: next });
      const target = this._fragmentGeo[family];
      for (const name of ['position', 'normal', 'uv']) {
        const attribute = source.getAttribute(name);
        if (attribute) target.setAttribute(name, attribute);
      }
      target.computeBoundingBox();
      target.computeBoundingSphere();
      target.userData.fragmentDetail = next;
      const rebuilt = new Set();
      for (const sys of this._familyUsers[family]) {
        const batch = this._batchFor(sys);
        if (batch && !rebuilt.has(batch)) {
          // Frees the previous attribute uploads and re-reads the new ones at the bounded size.
          batch.setupBuffers();
          rebuilt.add(batch);
        }
      }
    }
    return true;
  }

  attach(scene) {
    if (!scene || this.scene === scene) return;
    this.scene = scene;
    scene.add(this.renderer);
    scene.add(this.root);
  }

  update(dt) {
    if (!this.scene) return;
    const clampedDt = Math.min(0.05, Math.max(0.001, dt));
    this.renderer.update(clampedDt);
  }

  /**
   * Spawns impact response tailored by target surface and weapon family.
   */
  spawnImpact(x, y, z, nx, ny, nz, hitShield = false, variant = 0) {
    if (!this.scene) return;
    this._scratchPos.set(x, y, z);
    this._scratchDir.set(nx, ny, nz).normalize();
    if (this._scratchDir.lengthSq() < 1e-4) this._scratchDir.set(0, 0, 1);
    this._scratchQuat.setFromUnitVectors(_vForward, this._scratchDir);
    this._scratchMatrix.compose(this._scratchPos, this._scratchQuat, _scaleOne);

    if (hitShield) {
      this.shieldShards.spawn(10, this.shieldShards.emissionState, this._scratchMatrix);
    } else {
      const count = variant === 2 ? 16 : (variant === 3 ? 20 : 10);
      this.impactSpall.spawn(count, this.impactSpall.emissionState, this._scratchMatrix);
    }
  }

  /**
   * Spawns muzzle discharge sparks and spent brass casings (for kinetic).
   */
  spawnMuzzle(x, y, z, dirX, dirY, dirZ, variant = 0, ejectCasing = false) {
    if (!this.scene) return;
    this._scratchPos.set(x, y, z);
    this._scratchDir.set(dirX, dirY, dirZ).normalize();
    if (this._scratchDir.lengthSq() < 1e-4) this._scratchDir.set(0, 0, 1);
    this._scratchQuat.setFromUnitVectors(_vForward, this._scratchDir);
    this._scratchMatrix.compose(this._scratchPos, this._scratchQuat, _scaleOne);

    const sparkCount = variant === 3 ? 16 : (variant === 2 ? 12 : 8);
    this.muzzleSparks.spawn(sparkCount, this.muzzleSparks.emissionState, this._scratchMatrix);

    if (ejectCasing || variant === 2) {
      // Eject casing out the side (+right and slightly up)
      this._scratchDir.set(dirZ, 0.4, -dirX).normalize();
      this._scratchQuat.setFromUnitVectors(_vForward, this._scratchDir);
      this._scratchMatrix.compose(this._scratchPos, this._scratchQuat, _scaleOne);
      this.casingEjection.spawn(1, this.casingEjection.emissionState, this._scratchMatrix);
    }
  }

  /**
   * Spawns forward supersonic cryogenic exhaust needles during reverse braking.
   */
  spawnRetroVenting(x, y, z, dirX, dirY, dirZ, intensity = 1.0) {
    if (!this.scene || !(intensity > 0.05)) return;
    this._scratchPos.set(x, y, z);
    this._scratchDir.set(dirX, dirY, dirZ).normalize();
    if (this._scratchDir.lengthSq() < 1e-4) this._scratchDir.set(0, 0, 1);
    this._scratchQuat.setFromUnitVectors(_vForward, this._scratchDir);
    this._scratchMatrix.compose(this._scratchPos, this._scratchQuat, _scaleOne);

    const count = Math.max(2, Math.min(8, Math.round(intensity * 6)));
    this.retroVenting.spawn(count, this.retroVenting.emissionState, this._scratchMatrix);
  }

  /**
   * Cut mineral leaving a mining work face. `materialHint` is an optional ore/commodity id: an
   * ice body throws its own family instead of borrowing rock. Callers that pass nothing keep
   * exactly the previous behaviour.
   */
  spawnMiningEjecta(x, y, z, nx, ny, nz, count = 8, materialHint = null) {
    if (!this.scene) return 0;
    const matrix = this._poseFrom(x, y, z, nx, ny, nz);
    const family = resolveFragmentFamily(materialHint);
    if (family === FRAGMENT_FAMILY.ICE) return this._spawnCapped(this.iceSpall, count, matrix);
    return this._spawnCapped(this.miningEjecta, count, matrix);
  }

  /**
   * Broken terrain from a physical contact or a shattering rock. `materialHint` routes an icy
   * body to the ice family; anything else stays stone.
   */
  spawnCollisionSpall(x, y, z, nx, ny, nz, count = 12, materialHint = null) {
    if (!this.scene) return 0;
    const matrix = this._poseFrom(x, y, z, nx, ny, nz);
    const family = resolveFragmentFamily(materialHint);
    if (family === FRAGMENT_FAMILY.ICE) return this._spawnCapped(this.iceSpall, count, matrix);
    return this._spawnCapped(this.collisionSpall, count, matrix);
  }

  /** Cleaved ice: a separate family, never a tinted rock. */
  spawnIceSpall(x, y, z, nx, ny, nz, count = 10) {
    if (!this.scene) return 0;
    return this._spawnCapped(this.iceSpall, count, this._poseFrom(x, y, z, nx, ny, nz));
  }

  /**
   * Freight coming apart. Purely cosmetic matter: it never creates a pickup, never carries value
   * and never adds a physics body — authoritative cargo stays with the cargo system.
   */
  spawnCargoDebris(x, y, z, nx, ny, nz, count = 8) {
    if (!this.scene) return 0;
    return this._spawnCapped(this.cargoDebris, count, this._poseFrom(x, y, z, nx, ny, nz));
  }

  /**
   * Spawns burning coolant smoke and hazard sparks trailing from low-hull ships (< 35% HP).
   */
  spawnDamageVenting(x, y, z, dirX, dirY, dirZ, count = 4) {
    if (!this.scene) return;
    this._scratchPos.set(x, y, z);
    this._scratchDir.set(dirX, dirY, dirZ).normalize();
    if (this._scratchDir.lengthSq() < 1e-4) this._scratchDir.set(0, 0, 1);
    this._scratchQuat.setFromUnitVectors(_vForward, this._scratchDir);
    this._scratchMatrix.compose(this._scratchPos, this._scratchQuat, _scaleOne);
    this.damageVenting.spawn(count, this.damageVenting.emissionState, this._scratchMatrix);
  }

  /**
   * Radial blowout of crystalline hexagonal energy shield shards when a shield collapses to 0.
   */
  spawnShieldBreak(x, y, z, count = 24) {
    if (!this.scene) return;
    this._scratchPos.set(x, y, z);
    this._scratchQuat.identity();
    this._scratchMatrix.compose(this._scratchPos, this._scratchQuat, _scaleOne);
    this.shieldShards.spawn(count, this.shieldShards.emissionState, this._scratchMatrix);
  }

  /**
   * Torn hull plates from a destroyed body. `count` keeps its old caller meaning (the intended
   * violence of the death), but it no longer maps one-to-one onto instances: at 5.96 px/WU a
   * cloud of thirty chips is static, so the same event now throws roughly half as many plates at
   * two to three times the size. `options.cargoShare` (0..1) mixes in container panels for a
   * hauler or a freight kill; it defaults to none, so existing callers are unchanged.
   */
  spawnExplosion(x, y, z, count = 28, options = null) {
    if (!this.scene) return 0;
    this._scratchPos.set(x, y, z);
    this._scratchQuat.identity();
    this._scratchMatrix.compose(this._scratchPos, this._scratchQuat, _scaleOne);
    const requested = Math.max(0, Math.round(Number(count) || 0));
    const cargoShare = options ? clamp01(Number(options.cargoShare) || 0) : 0;
    const plates = Math.max(requested > 0 ? 3 : 0, Math.round(requested * 0.45 * (1 - cargoShare * 0.5)));
    let emitted = this._spawnCapped(this.shrapnel, plates, this._scratchMatrix);
    if (cargoShare > 0) {
      emitted += this._spawnCapped(this.cargoDebris, Math.round(requested * 0.3 * cargoShare), this._scratchMatrix);
    }
    return emitted;
  }

  /**
   * THE IMPACTS-LANE ENTRY POINT. The impacts lane owns contact timing and is the sole subscriber
   * to the simulation event; this reads its finished record and emits solid matter only. It never
   * subscribes to anything, never writes simulation state and never throws on a malformed record.
   *
   * E2: when `axisSigned` is false the normal is an unsigned collision axis whose sign is a
   * collider-ordering artifact. `impactOutwardNormal` returns null in that case, and the answer is
   * a symmetric pair of half-bursts about the axis — never a fabricated one-sided spall cone.
   */
  emitFromImpact(rec) {
    if (!this.scene || !rec) return 0;
    const family = resolveFragmentFamily(rec.materialId);
    if (!family) return 0;                       // shield, energy, unknown: this lane stays silent
    const sys = this._familySystem ? this._familySystem[family] : null;
    if (!sys) return 0;

    const severity = clamp01(Number(rec.severity) || 0);
    if (!(severity > 0)) return 0;
    const x = Number(rec.x) || 0;
    const y = Number(rec.y) || 0;
    const z = Number(rec.z) || 0;

    // A skid sheds less matter than a square-on strike, and it sheds it flatter.
    const tangent = clamp01(impactTangentFraction(rec));
    const budget = Math.max(1, Math.round((1 + severity * 7) * (1 - tangent * 0.45)));

    const outward = impactOutwardNormal(rec, this._scratchNormal);
    if (outward) {
      return this._spawnCapped(sys, budget, this._poseFrom(x, y, z, outward.x, outward.y, outward.z));
    }

    // Unsigned axis: throw the same total matter symmetrically about it.
    const ax = Number(rec.nx) || 0;
    const ay = Number(rec.ny) || 0;
    const az = Number(rec.nz) || 1;
    const half = Math.max(1, Math.round(budget * 0.5));
    let emitted = this._spawnCapped(sys, half, this._poseFrom(x, y, z, ax, ay, az));
    emitted += this._spawnCapped(sys, budget - half, this._poseFrom(x, y, z, -ax, -ay, -az));
    return emitted;
  }

  reset() {
    this.impactSpall.particleNum = 0;
    this.shieldShards.particleNum = 0;
    this.muzzleSparks.particleNum = 0;
    this.casingEjection.particleNum = 0;
    this.retroVenting.particleNum = 0;
    this.miningEjecta.particleNum = 0;
    this.collisionSpall.particleNum = 0;
    this.damageVenting.particleNum = 0;
    this.shrapnel.particleNum = 0;
    this.iceSpall.particleNum = 0;
    this.cargoDebris.particleNum = 0;
  }

  dispose() {
    // detach first so nothing renders a half-torn-down batch
    if (this.scene) {
      this.scene.remove(this.renderer);
      this.scene.remove(this.root);
      this.scene = null;
    }
    // ParticleSystem.dispose removes the emitter and unregisters from its batch; the batches
    // themselves hold merged instanced geometry + generated ShaderMaterials that three.quarks
    // never frees, so they need an explicit dispose or every presenter teardown leaks them.
    for (const sys of [
      this.impactSpall, this.shieldShards, this.muzzleSparks, this.casingEjection,
      this.retroVenting, this.miningEjecta, this.collisionSpall, this.damageVenting,
      this.shrapnel, this.iceSpall, this.cargoDebris,
    ]) {
      if (sys && typeof sys.dispose === 'function') sys.dispose();
    }
    for (const batch of this.renderer.batches || []) {
      if (!batch) continue;
      if (batch.material && typeof batch.material.dispose === 'function') batch.material.dispose();
      if (typeof batch.dispose === 'function') batch.dispose();
    }
    if (this.renderer.batches) this.renderer.batches.length = 0;
    if (this.renderer.systemToBatchIndex) this.renderer.systemToBatchIndex.clear();
    // The authored fragment resources are ours, not three.quarks': the donors and the two shared
    // atlas pages outlive every batch and leak on presenter teardown unless we free them here.
    for (const family of Object.keys(this._fragmentGeo || {})) {
      const geo = this._fragmentGeo[family];
      if (geo && typeof geo.dispose === 'function') geo.dispose();
    }
    for (const family of Object.keys(this._fragmentMat || {})) {
      const mat = this._fragmentMat[family];
      if (mat && typeof mat.dispose === 'function') mat.dispose();
    }
    this._fragmentGeo = {};
    this._fragmentMat = {};
    if (this._casingDonor && typeof this._casingDonor.dispose === 'function') {
      this._casingDonor.dispose();
      this._casingDonor = null;
    }
    if (this.fragmentAtlas) {
      this.fragmentAtlas.dispose();
      this.fragmentAtlas = null;
    }
    if (this._solidCap) this._solidCap.clear();
  }
}
