// Render-only presentation for the exact salvage and forbidden-cache fittings whose provenance
// should remain readable after they are installed. All resources are built once; ordinary flight
// only toggles preallocated hard geometry from the Ships-owned fittings array.
import * as THREE from 'three';
import { MODULES } from '../data/modules.js';
import { WEAPONS } from '../data/weapons.js';

export const SHIP_HARDWARE_PRESENTATIONS = Object.freeze(
  [...WEAPONS, ...MODULES]
    .filter((definition) => definition && definition.hullPresentation?.signature)
    .map((definition) => Object.freeze({
      id: definition.id,
      name: definition.name,
      slotType: definition.slotType,
      signature: definition.hullPresentation.signature,
      recognition: definition.hullPresentation.recognition,
    })),
);

function material(parameters, name) {
  const result = new THREE.MeshStandardMaterial(parameters);
  result.name = name;
  return result;
}

function addMesh(group, geometry, surface, name, position, rotation, scale) {
  const mesh = new THREE.Mesh(geometry, surface);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.scale.set(...scale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function addRing(group, geometry, surface, name, x, y, z, scale = 1) {
  return addMesh(group, geometry, surface, name, [x, y, z], [0, Math.PI / 2, 0], [scale, scale, scale]);
}

function buildIronsong(group, geometry, surfaces) {
  addMesh(group, geometry.box, surfaces.dark, 'Ironsong_Mount', [-0.03, 0, 0], [0, 0, 0], [0.34, 0.09, 0.24]);
  addMesh(group, geometry.cylinder, surfaces.brass, 'Ironsong_Drum_Port', [-0.02, 0.03, -0.10], [0, 0, Math.PI / 2], [0.15, 0.12, 0.12]);
  addMesh(group, geometry.cylinder, surfaces.brass, 'Ironsong_Drum_Starboard', [-0.02, 0.03, 0.10], [0, 0, Math.PI / 2], [0.15, 0.12, 0.12]);
  addMesh(group, geometry.cylinder, surfaces.gunmetal, 'Ironsong_RibbedBarrel', [0.25, 0.03, 0], [0, 0, Math.PI / 2], [0.50, 0.052, 0.052]);
  for (const x of [0.08, 0.20, 0.32]) addRing(group, geometry.torus, surfaces.ivory, `Ironsong_BarrelRib_${x}`, x, 0.03, 0, 0.105);
}

function buildVeilCutter(group, geometry, surfaces) {
  addMesh(group, geometry.box, surfaces.dark, 'VeilCutter_Mount', [-0.06, 0, 0], [0, 0, 0], [0.28, 0.08, 0.22]);
  for (const [index, y, z] of [[0, 0.08, 0], [1, -0.04, -0.09], [2, -0.04, 0.09]]) {
    addMesh(group, geometry.taper, surfaces.cyan, `VeilCutter_Prong_${index}`, [0.22, y, z], [0, 0, Math.PI / 2], [0.48, 0.052, 0.052]);
  }
  addMesh(group, geometry.icosa, surfaces.cyan, 'VeilCutter_FocusingLens', [0.44, 0.01, 0], [0, 0, 0], [0.13, 0.13, 0.13]);
  addRing(group, geometry.torus, surfaces.ivory, 'VeilCutter_OpenCage', 0.29, 0.01, 0, 0.27);
}

function buildNestbreaker(group, geometry, surfaces) {
  addMesh(group, geometry.box, surfaces.dark, 'Nestbreaker_Mount', [-0.05, 0, 0], [0, 0, 0], [0.28, 0.09, 0.30]);
  let index = 0;
  for (const y of [-0.055, 0.055]) {
    for (const z of [-0.11, 0, 0.11]) {
      addMesh(group, geometry.cylinder, surfaces.orange, `Nestbreaker_Tube_${index++}`, [0.18, y, z], [0, 0, Math.PI / 2], [0.38, 0.052, 0.052]);
    }
  }
  addMesh(group, geometry.box, surfaces.orange, 'Nestbreaker_SplitRail', [0.02, 0, 0], [0, 0, 0], [0.34, 0.025, 0.04]);
}

function buildLighthouse(group, geometry, surfaces) {
  addMesh(group, geometry.box, surfaces.dark, 'Lighthouse_Mount', [-0.13, -0.01, 0], [0, 0, 0], [0.38, 0.10, 0.24]);
  addMesh(group, geometry.cylinder, surfaces.ivory, 'Lighthouse_BeamSpine', [0.18, 0.04, 0], [0, 0, Math.PI / 2], [0.76, 0.065, 0.065]);
  for (const [index, x] of [-0.02, 0.13, 0.28, 0.43].entries()) {
    addRing(group, geometry.torus, surfaces.orange, `Lighthouse_FocusingRing_${index}`, x, 0.04, 0, 0.17);
  }
  addMesh(group, geometry.icosa, surfaces.orange, 'Lighthouse_BeaconLens', [0.53, 0.04, 0], [0, 0, 0], [0.13, 0.13, 0.13]);
}

function buildOvercharge(group, geometry, surfaces) {
  addMesh(group, geometry.box, surfaces.dark, 'Overcharge_Mount', [-0.03, -0.03, 0], [0, 0, 0], [0.36, 0.08, 0.26]);
  for (const [index, x] of [-0.18, -0.06, 0.06, 0.18].entries()) {
    addRing(group, geometry.torus, surfaces.copper, `Overcharge_Coil_${index}`, x, 0.05, 0, 0.22);
  }
  for (const z of [-0.17, 0.17]) addMesh(group, geometry.box, surfaces.gunmetal, `Overcharge_Cage_${z}`, [0, 0.05, z], [0, 0, 0], [0.46, 0.035, 0.035]);
  addMesh(group, geometry.cylinder, surfaces.cyan, 'Overcharge_FieldCore', [0, 0.05, 0], [0, 0, Math.PI / 2], [0.48, 0.045, 0.045]);
}

function buildMassFaker(group, geometry, surfaces) {
  addMesh(group, geometry.box, surfaces.gunmetal, 'MassFaker_Ballast', [-0.12, 0.02, 0], [0, 0.18, 0.12], [0.42, 0.16, 0.25]);
  addMesh(group, geometry.box, surfaces.ivory, 'MassFaker_Fork_Port', [0.14, 0.05, -0.15], [0, -0.08, 0], [0.50, 0.065, 0.075]);
  addMesh(group, geometry.box, surfaces.ivory, 'MassFaker_Fork_Starboard', [0.14, 0.05, 0.15], [0, 0.08, 0], [0.50, 0.065, 0.075]);
  addMesh(group, geometry.icosa, surfaces.violet, 'MassFaker_PhaseWeight_Port', [0.31, 0.05, -0.15], [0, 0, 0], [0.13, 0.13, 0.13]);
  addMesh(group, geometry.icosa, surfaces.violet, 'MassFaker_PhaseWeight_Starboard', [0.31, 0.05, 0.15], [0, 0, 0], [0.13, 0.13, 0.13]);
}

function buildDeadman(group, geometry, surfaces) {
  addMesh(group, geometry.box, surfaces.dark, 'Deadman_Mount', [-0.10, -0.02, 0], [0, 0, 0], [0.42, 0.09, 0.30]);
  addMesh(group, geometry.icosa, surfaces.orange, 'Deadman_ReactorCore', [0, 0.08, 0], [0, 0, 0], [0.18, 0.18, 0.18]);
  for (const [index, x] of [-0.17, 0, 0.17].entries()) addRing(group, geometry.torus, surfaces.orange, `Deadman_RadialRib_${index}`, x, 0.08, 0, 0.28);
  for (const z of [-0.20, 0.20]) addMesh(group, geometry.box, surfaces.ivory, `Deadman_HazardRail_${z}`, [0, 0.08, z], [0, 0, 0], [0.48, 0.035, 0.035]);
}

const BUILDERS = Object.freeze({
  ironsong_rotary: buildIronsong,
  veil_focusing_cage: buildVeilCutter,
  nestbreaker_split_rack: buildNestbreaker,
  lighthouse_ring_spine: buildLighthouse,
  overcharge_caged_coil: buildOvercharge,
  mass_faker_ballast_fork: buildMassFaker,
  deadman_radial_reactor: buildDeadman,
});

const ANCHORS = Object.freeze({
  ironsong_rotary: [0.12, 0.35, 0.20],
  veil_focusing_cage: [0.14, 0.40, 0.08],
  nestbreaker_split_rack: [0.08, 0.38, -0.20],
  lighthouse_ring_spine: [0.04, 0.42, 0],
  overcharge_caged_coil: [-0.18, 0.31, 0.21],
  mass_faker_ballast_fork: [-0.14, 0.36, -0.20],
  deadman_radial_reactor: [-0.30, 0.32, 0],
});

const SCALES = Object.freeze({
  ironsong_rotary: 1.15,
  veil_focusing_cage: 1.45,
  nestbreaker_split_rack: 1.40,
  lighthouse_ring_spine: 1.45,
  overcharge_caged_coil: 1,
  mass_faker_ballast_fork: 1.45,
  deadman_radial_reactor: 1,
});

export function createShipHardwarePresentation() {
  const root = new THREE.Group();
  root.name = 'ShipHardware_Presentation';
  root.userData.spacefaceShipHardwarePresentation = true;

  const geometry = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 12),
    taper: new THREE.CylinderGeometry(0.3, 0.5, 1, 8),
    torus: new THREE.TorusGeometry(0.5, 0.11, 6, 18),
    icosa: new THREE.IcosahedronGeometry(0.5, 1),
  };
  const surfaces = {
    dark: material({ color: 0x121923, roughness: 0.55, metalness: 0.74 }, 'Hardware_DarkMetal'),
    black: material({ color: 0x05080d, roughness: 0.78, metalness: 0.35 }, 'Hardware_BlackBallast'),
    gunmetal: material({ color: 0x596572, roughness: 0.38, metalness: 0.82 }, 'Hardware_Gunmetal'),
    brass: material({ color: 0xc08d43, roughness: 0.34, metalness: 0.76 }, 'Hardware_Brass'),
    copper: material({ color: 0xd86a32, roughness: 0.30, metalness: 0.70, emissive: 0x401407, emissiveIntensity: 0.55 }, 'Hardware_CopperCoil'),
    ivory: material({ color: 0xd9d3bd, roughness: 0.50, metalness: 0.42 }, 'Hardware_IvoryStencil'),
    cyan: material({ color: 0x75f0ea, roughness: 0.18, metalness: 0.28, emissive: 0x0b6e73, emissiveIntensity: 0.85 }, 'Hardware_CyanCore'),
    orange: material({ color: 0xff742b, roughness: 0.25, metalness: 0.42, emissive: 0x7a1d05, emissiveIntensity: 1.1 }, 'Hardware_HazardOrange'),
    violet: material({ color: 0x8a75d6, roughness: 0.22, metalness: 0.55, emissive: 0x21144d, emissiveIntensity: 0.75 }, 'Hardware_PhaseViolet'),
  };

  const groups = [];
  for (const presentation of SHIP_HARDWARE_PRESENTATIONS) {
    const builder = BUILDERS[presentation.signature];
    if (!builder) continue;
    const group = new THREE.Group();
    group.name = `ShipHardware_${presentation.id}`;
    group.userData.identityId = presentation.id;
    group.userData.signature = presentation.signature;
    group.userData.recognition = presentation.recognition;
    group.position.set(...(ANCHORS[presentation.signature] || [0, 0.3, 0]));
    group.scale.setScalar(SCALES[presentation.signature] || 1);
    builder(group, geometry, surfaces);
    group.visible = false;
    root.add(group);
    groups.push({ presentation, group });
  }

  let lastMask = -1;
  let activeCount = 0;
  let disposed = false;

  function maskForFittings(fittings) {
    if (!Array.isArray(fittings)) return 0;
    let mask = 0;
    for (let index = 0; index < groups.length; index += 1) {
      const id = groups[index].presentation.id;
      for (let fitIndex = 0; fitIndex < fittings.length; fitIndex += 1) {
        if (fittings[fitIndex] === id) {
          mask |= (1 << index);
          break;
        }
      }
    }
    return mask;
  }

  function sync(fittings) {
    if (disposed) return false;
    const mask = maskForFittings(fittings);
    if (mask === lastMask) return false;
    activeCount = 0;
    for (let index = 0; index < groups.length; index += 1) {
      const visible = !!(mask & (1 << index));
      groups[index].group.visible = visible;
      if (visible) activeCount += 1;
    }
    lastMask = mask;
    root.visible = activeCount > 0;
    return true;
  }

  function beginGpuWarmup() {
    if (disposed) return () => {};
    const priorMask = lastMask;
    for (const record of groups) record.group.visible = true;
    root.visible = true;
    let restored = false;
    return () => {
      if (restored || disposed) return;
      restored = true;
      lastMask = -1;
      const fittings = [];
      for (let index = 0; index < groups.length; index += 1) {
        if (priorMask & (1 << index)) fittings.push(groups[index].presentation.id);
      }
      sync(fittings);
    };
  }

  function diagnostics() {
    const activeIds = [];
    const signatures = [];
    let meshCount = 0;
    let spriteCount = 0;
    let pointsCount = 0;
    root.traverse((object) => {
      if (object.isMesh) meshCount += 1;
      if (object.isSprite) spriteCount += 1;
      if (object.isPoints) pointsCount += 1;
    });
    for (const { presentation, group } of groups) {
      signatures.push(presentation.signature);
      if (group.visible) activeIds.push(presentation.id);
    }
    return {
      visible: root.visible,
      disposed,
      activeCount,
      activeIds,
      signatures,
      meshCount,
      spriteCount,
      pointsCount,
      resourceIds: {
        root: root.uuid,
        geometries: Object.values(geometry).map((resource) => resource.uuid),
        materials: Object.values(surfaces).map((resource) => resource.uuid),
        groups: groups.map(({ group }) => group.uuid),
      },
    };
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const resource of Object.values(geometry)) resource.dispose();
    for (const resource of Object.values(surfaces)) resource.dispose();
    root.removeFromParent();
    root.clear();
  }

  sync([]);
  return {
    root,
    sync,
    beginGpuWarmup,
    diagnostics,
    hasVisibleHardware: () => activeCount > 0,
    dispose,
  };
}
