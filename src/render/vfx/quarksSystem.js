// SpaceFace — three.quarks VFX scaffolding.
//
// Batched 3D mesh particle systems, one designed material language per family:
//   1. Impact spall   — molten armor darts: white-hot HDR cores that drag, cool to ember
//   2. Shield shards  — hexagonal field glass: edge-bright cyan plates that tumble and dim
//   3. Muzzle sparks  — plasma needles: overexposed blue-white, gone in a tenth of a second
//   4. Casings        — spent brass: LIT solid (MeshStandardMaterial), tumbling, cooling dark
//   5. Retro venting  — cryogenic ice needles off the bow jets, supersonic and brief
//   6. Mining ejecta  — glittering ore: per-chip warm/cool mineral variety over a hot-to-cold track
//   7. Collision spall— LIT rock/ice debris: real scene lighting, not a glow (M1 solid matter)
//   8. Damage venting — burning coolant spray that wanders (turbulent leak, not a cone print)
//   9. Shrapnel       — burning hull plates: flat-faceted, fast-tumbling, cooling from forge-hot
//
// Design invariants (docs/visual-assets/VFX_TECHNIQUE_STANDARD.md):
//   - No 2D billboards, Points, or Sprites anywhere in this file (B2/B4/B13).
//   - Temperature, not opacity, carries the fade: ColorOverLife gradients run HDR-hot to cold
//     while alpha holds, then cut only in the last fraction of life (B17).
//   - Every family has an attack/settle/cool envelope via Size/Speed/Rotation behaviors, so no
//     burst is a uniform expanding shell (B10/B18).
//   - Additive energy families run toneMapped:false with HDR headroom so bloom has something
//     to catch (B8/M2); genuinely cold solid matter is scene-lit instead of self-glowing (M1).
//   - All spawn paths reuse scratch vectors/matrices; bursts only (rateOverTime: 0).

import * as THREE from 'three';
import { SHARED_MATERIAL_ROLE, stampSharedMaterialRole } from '../sharedMaterialRoles.js';
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

// Flat facets, not DCC-smoothed normals: a tetrahedron of rock or a plate of shield glass reads
// as a cut object at the chase camera only when each face holds its own plane.
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
      emission: { rateOverTime: new ConstantValue(0) },
      shape: new ConeEmitter({ radius: 0.05, angle: 0.65 }),
      material: additiveDonor(),
      renderMode: RenderMode.Mesh,
      mesh: spallGeo,
      behaviors: [
        new ColorOverLife(heatGradient([[3.4, 2.7, 1.7, 0], [1.9, 0.55, 0.1, 0.45], [0.22, 0.04, 0.01, 1]])),
        new SizeOverLife(lifeCurve(0.65, 1.15, 1.0, 0.45)),
        new SpeedOverLife(lifeCurve(1.0, 0.55, 0.3, 0.16)),
        new Noise(new ConstantValue(5), new ConstantValue(0.35)),
      ],
    });

    // -------------------------------------------------------------
    // 2. Shield Shards — hexagonal field glass.
    // Flat hex plates, not generic octahedra: the shield is a manufactured lattice and its
    // wreckage keeps that ancestry. Edge-bright electric cyan, slow stately tumble.
    // -------------------------------------------------------------
    const shieldShardGeo = facet(new THREE.CylinderGeometry(0.24, 0.24, 0.06, 6));
    this.shieldShards = new ParticleSystem({
      duration: 1,
      looping: false,
      startLife: new IntervalValue(0.2, 0.45),
      startSpeed: new IntervalValue(9, 22),
      startSize: new IntervalValue(0.5, 1.5),
      startRotation: new RandomQuatGenerator(),
      startColor: new ColorRange(new THREE.Vector4(0.85, 1, 1, 1), new THREE.Vector4(0.6, 0.9, 1.1, 1)),
      worldSpace: true,
      emission: { rateOverTime: new ConstantValue(0) },
      shape: new ConeEmitter({ radius: 0.1, angle: 0.85 }),
      material: additiveDonor(),
      renderMode: RenderMode.Mesh,
      mesh: shieldShardGeo,
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
      emission: { rateOverTime: new ConstantValue(0) },
      shape: new ConeEmitter({ radius: 0.05, angle: 0.35 }),
      material: additiveDonor(),
      renderMode: RenderMode.Mesh,
      mesh: muzzleGeo,
      behaviors: [
        new ColorOverLife(heatGradient([[2.6, 3.4, 4.6, 0], [0.3, 0.9, 2.0, 0.6], [0.05, 0.15, 0.5, 1]], [[1, 0], [0.9, 0.5], [0, 1]])),
        new SizeOverLife(lifeCurve(1.0, 1.05, 0.7, 0.3)),
        new SpeedOverLife(lifeCurve(1.0, 0.5, 0.22, 0.1)),
      ],
    });

    // -------------------------------------------------------------
    // 4. Spent Shell Casings — LIT solid brass.
    // Cold manufactured matter: scene-lit (key/rim/fill + muzzle point light), tumbling end over
    // end, warming from the chamber then cooling dark. The only family with no glow at all.
    // -------------------------------------------------------------
    const casingGeo = facet(new THREE.CylinderGeometry(0.07, 0.07, 0.28, 6));
    casingGeo.rotateZ(Math.PI / 2);
    const casingMat = stampSharedMaterialRole(new THREE.MeshStandardMaterial({
      color: 0xc9a227,
      metalness: 0.35,
      roughness: 0.4,
      transparent: true,
    }), SHARED_MATERIAL_ROLE.HULL);
    this.casingEjection = new ParticleSystem({
      duration: 1,
      looping: false,
      startLife: new IntervalValue(0.9, 1.5),
      startSpeed: new IntervalValue(4, 9),
      startSize: new IntervalValue(0.8, 1.15),
      startRotation: new RandomQuatGenerator(),
      startColor: new ColorRange(new THREE.Vector4(1.35, 1.1, 0.55, 1), new THREE.Vector4(1.1, 0.9, 0.45, 1)),
      worldSpace: true,
      emission: { rateOverTime: new ConstantValue(0) },
      shape: new ConeEmitter({ radius: 0.05, angle: 0.4 }),
      material: casingMat,
      renderMode: RenderMode.Mesh,
      mesh: casingGeo,
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
      emission: { rateOverTime: new ConstantValue(0) },
      shape: new ConeEmitter({ radius: 0.2, angle: 0.28 }),
      material: additiveDonor(),
      renderMode: RenderMode.Mesh,
      mesh: retroIceGeo,
      behaviors: [
        new ColorOverLife(heatGradient([[2.3, 2.9, 3.3, 0], [0.5, 1.2, 2.2, 0.55], [0.06, 0.25, 0.8, 1]], [[1, 0], [0.85, 0.5], [0, 1]])),
        new SizeOverLife(lifeCurve(0.8, 1.1, 0.9, 0.35)),
        new SpeedOverLife(lifeCurve(1.0, 0.9, 0.75, 0.6)),
        new Noise(new ConstantValue(7), new ConstantValue(0.5)),
      ],
    });

    // -------------------------------------------------------------
    // 6. Mining Ejecta — glittering ore over a molten track.
    // Each chip rolls warm (molten ore) or cool (glinting mineral) at spawn, then rides the same
    // white-hot to dull track, so a single strike throws a mixed handful of matter.
    // -------------------------------------------------------------
    const miningOreGeo = facet(new THREE.OctahedronGeometry(0.17));
    this.miningEjecta = new ParticleSystem({
      duration: 1,
      looping: false,
      startLife: new IntervalValue(0.4, 0.85),
      startSpeed: new IntervalValue(8, 24),
      startSize: new IntervalValue(0.45, 1.5),
      startRotation: new RandomQuatGenerator(),
      startColor: new ColorRange(new THREE.Vector4(1.1, 0.9, 0.55, 1), new THREE.Vector4(0.65, 0.9, 1.15, 1)),
      worldSpace: true,
      emission: { rateOverTime: new ConstantValue(0) },
      shape: new ConeEmitter({ radius: 0.15, angle: 0.8 }),
      material: additiveDonor(),
      renderMode: RenderMode.Mesh,
      mesh: miningOreGeo,
      behaviors: [
        new ColorOverLife(heatGradient([[3.0, 2.4, 1.2, 0], [1.4, 0.55, 0.15, 0.5], [0.2, 0.08, 0.03, 1]])),
        new SizeOverLife(lifeCurve(0.6, 1.15, 1.0, 0.55)),
        new SpeedOverLife(lifeCurve(1.0, 0.7, 0.45, 0.3)),
        new Rotation3DOverLife(new AxisAngleGenerator(_vUp, new IntervalValue(2, 8))),
      ],
    });

    // -------------------------------------------------------------
    // 7. Collision Spall — LIT rock and ice.
    // Cold terrain matter has no business glowing: real scene lighting on flat-faceted
    // tetrahedra, tumbling hard off the contact plane and settling as they drag.
    // -------------------------------------------------------------
    const rockShardGeo = facet(new THREE.TetrahedronGeometry(0.3));
    const rockShardMat = stampSharedMaterialRole(new THREE.MeshStandardMaterial({
      color: 0x9a9088,
      metalness: 0.05,
      roughness: 0.9,
      transparent: true,
    }), SHARED_MATERIAL_ROLE.ROCK);
    this.collisionSpall = new ParticleSystem({
      duration: 1,
      looping: false,
      startLife: new IntervalValue(0.45, 1.0),
      startSpeed: new IntervalValue(6, 18),
      startSize: new IntervalValue(0.55, 1.7),
      startRotation: new RandomQuatGenerator(),
      startColor: new ColorRange(new THREE.Vector4(1.05, 1.0, 0.92, 1), new THREE.Vector4(0.8, 0.82, 0.9, 1)),
      worldSpace: true,
      emission: { rateOverTime: new ConstantValue(0) },
      shape: new SphereEmitter({ radius: 0.3 }),
      material: rockShardMat,
      renderMode: RenderMode.Mesh,
      mesh: rockShardGeo,
      behaviors: [
        new ColorOverLife(heatGradient([[1.15, 1.1, 1.02, 0], [0.85, 0.82, 0.78, 0.6], [0.45, 0.43, 0.4, 1]], [[1, 0], [1, 0.78], [0, 1]])),
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
      emission: { rateOverTime: new ConstantValue(0) },
      shape: new ConeEmitter({ radius: 0.15, angle: 0.7 }),
      material: additiveDonor(),
      renderMode: RenderMode.Mesh,
      mesh: damageSparkGeo,
      behaviors: [
        new ColorOverLife(heatGradient([[3.1, 1.7, 0.5, 0], [1.2, 0.3, 0.06, 0.5], [0.25, 0.05, 0.01, 1]])),
        new SizeOverLife(lifeCurve(0.7, 1.1, 0.95, 0.4)),
        new SpeedOverLife(lifeCurve(1.0, 0.65, 0.4, 0.28)),
        new Noise(new ConstantValue(4), new ConstantValue(0.9)),
      ],
    });

    // -------------------------------------------------------------
    // 9. Destruction Shrapnel — burning hull plates.
    // Flattened, flat-faceted plates (not symmetric caltrops): a ship comes apart as sheets of
    // its own skin. Forge-hot at separation, tumbling fast, cooling through ember orange.
    // -------------------------------------------------------------
    const shardGeo = facet(new THREE.TetrahedronGeometry(0.42));
    shardGeo.scale(1.35, 0.55, 1.0);
    this.shrapnel = new ParticleSystem({
      duration: 1,
      looping: false,
      startLife: new IntervalValue(0.45, 1.05),
      startSpeed: new IntervalValue(10, 32),
      startSize: new IntervalValue(0.7, 1.9),
      startRotation: new RandomQuatGenerator(),
      startColor: new ColorRange(new THREE.Vector4(1.1, 1.0, 0.9, 1), new THREE.Vector4(1.0, 0.8, 0.6, 1)),
      worldSpace: true,
      emission: { rateOverTime: new ConstantValue(0) },
      shape: new SphereEmitter({ radius: 0.3 }),
      material: additiveDonor(),
      renderMode: RenderMode.Mesh,
      mesh: shardGeo,
      behaviors: [
        new ColorOverLife(heatGradient([[3.3, 2.0, 0.8, 0], [1.5, 0.4, 0.06, 0.5], [0.18, 0.03, 0.01, 1]], [[1, 0], [1, 0.6], [0, 1]])),
        new SizeOverLife(lifeCurve(0.75, 1.1, 1.0, 0.7)),
        new SpeedOverLife(lifeCurve(1.0, 0.7, 0.45, 0.3)),
        new Rotation3DOverLife(new AxisAngleGenerator(_vUp, new IntervalValue(4, 12))),
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
    ];

    for (const sys of allSystems) {
      this.root.add(sys.emitter);
      this.renderer.addSystem(sys);
    }

    // The batch renderer generates its own ShaderMaterial from each donor (default toneMapped),
    // which would crush the HDR gradient stops before bloom ever sees them. Opt the additive
    // energy batches out of tone mapping; the two scene-lit solid families stay on ACES.
    const energySystems = [
      this.impactSpall,
      this.shieldShards,
      this.muzzleSparks,
      this.retroVenting,
      this.miningEjecta,
      this.damageVenting,
      this.shrapnel,
    ];
    for (const sys of energySystems) {
      const batchIndex = this.renderer.systemToBatchIndex.get(sys);
      const batch = batchIndex != null ? this.renderer.batches[batchIndex] : null;
      if (batch && batch.material) batch.material.toneMapped = false;
    }

    if (options.scene) {
      this.attach(options.scene);
    }
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
   * Spawns glittering crystal chips and molten rock droplets from asteroid mining contacts.
   */
  spawnMiningEjecta(x, y, z, nx, ny, nz, count = 8) {
    if (!this.scene) return;
    this._scratchPos.set(x, y, z);
    this._scratchDir.set(nx, ny, nz).normalize();
    if (this._scratchDir.lengthSq() < 1e-4) this._scratchDir.set(0, 0, 1);
    this._scratchQuat.setFromUnitVectors(_vForward, this._scratchDir);
    this._scratchMatrix.compose(this._scratchPos, this._scratchQuat, _scaleOne);
    this.miningEjecta.spawn(count, this.miningEjecta.emissionState, this._scratchMatrix);
  }

  /**
   * Spawns tumbling rock fragments and mineral dust upon physical ship-terrain collisions.
   */
  spawnCollisionSpall(x, y, z, nx, ny, nz, count = 12) {
    if (!this.scene) return;
    this._scratchPos.set(x, y, z);
    this._scratchDir.set(nx, ny, nz).normalize();
    if (this._scratchDir.lengthSq() < 1e-4) this._scratchDir.set(0, 0, 1);
    this._scratchQuat.setFromUnitVectors(_vForward, this._scratchDir);
    this._scratchMatrix.compose(this._scratchPos, this._scratchQuat, _scaleOne);
    this.collisionSpall.spawn(count, this.collisionSpall.emissionState, this._scratchMatrix);
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
   * Spawns tumbling 3D tetrahedral debris chunks upon entity death.
   */
  spawnExplosion(x, y, z, count = 28) {
    if (!this.scene) return;
    this._scratchPos.set(x, y, z);
    this._scratchQuat.identity();
    this._scratchMatrix.compose(this._scratchPos, this._scratchQuat, _scaleOne);
    this.shrapnel.spawn(count, this.shrapnel.emissionState, this._scratchMatrix);
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
  }

  dispose() {
    if (this.scene) {
      this.scene.remove(this.renderer);
      this.scene.remove(this.root);
      this.scene = null;
    }
  }
}
