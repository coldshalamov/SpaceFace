import * as THREE from 'three';
import { foundryPlateShape } from '../../data/foundryPlate.js';
import { FOUNDRY_LIGHT } from '../../data/lookMoods.js';
import { FOUNDRY_ARENA_ID } from '../../systems/swarmArena.js';
import { machinedBoxGeometry } from '../arenaFinish.js';
import { loadAuthoredPart } from '../assetLoader.js';
import { getAssetResidency } from '../assetResidency.js';
import { isReleaseAssetMode } from '../releaseMode.js';
import { instantiatePackagedPrimitives } from '../visualFactory.js';

export const FOUNDRY_DECK_Y = -62;
const BAY = 84;
const DECK_BAYS = 13;
const DECK_SIZE = BAY * DECK_BAYS;
const BELT_X = 142;
const BELT_LENGTH = 314;
const BELT_HEIGHT = 13;
const CRATES_PER_BELT = 6;
const BANK_CAPACITY = 24;
const PROP_ROOT = 'assets/ships/parts/places/';
const RELEASE_PROP_ROOT = 'assets/ships/release/parts/places/';

const CONVEYORS = [-1, 1].map(side => ({
  x: side * BELT_X, z: side * 25, yaw: Math.PI / 2, fit: BELT_LENGTH,
  y: FOUNDRY_DECK_Y, height: BELT_HEIGHT,
}));
const RACKS = [
  { x: -193, z: -105, yaw: Math.PI / 2, fit: 76 },
  { x: 193, z: 104, yaw: Math.PI / 2, fit: 76 },
  { x: 123, z: -222, yaw: 0, fit: 91 },
  { x: -123, z: 222, yaw: 0, fit: 91 },
];
const GANTRIES = [
  { x: -181, z: -226, yaw: 0, fit: 95 },
  { x: 181, z: 226, yaw: Math.PI, fit: 95 },
];
const FURNACE = { x: 11, z: 112 };
const WORK_LAMPS = [
  { x: -102, z: 53 },
  { x: 104, z: 43 },
];

const plateCorner = value => Math.sign(value) * (0.5 - (0.5 - Math.abs(value)) * 0.24);

// The horizontal deck occupies almost the entire screen. Its fixed, tightly fitted
// map needs one bilinear hardware comparison per fragment. The stock five-tap filter
// remains on the ships, rocks and authored prop materials.
function useDeckShadowFilter(material) {
  material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <shadowmap_pars_fragment>', `
      #if defined( USE_SHADOWMAP ) && defined( SHADOWMAP_TYPE_PCF )
        #define getShadow getDefaultShadow
      #endif
      #include <shadowmap_pars_fragment>
      #if defined( USE_SHADOWMAP ) && defined( SHADOWMAP_TYPE_PCF )
        #undef getShadow
        float getShadow( sampler2DShadow map, vec2 size, float intensity,
            float bias, float radius, vec4 coord ) {
          if (intensity <= 0.0) return 1.0;
          vec3 sampleCoord = coord.xyz / coord.w;
          sampleCoord.z += bias;
          if (any(lessThan(sampleCoord.xy, vec2(0.0))) ||
              any(greaterThan(sampleCoord, vec3(1.0)))) return 1.0;
          return mix(1.0, texture(map, sampleCoord), intensity);
        }
      #endif
    `);
  };
}

export function isFoundrySetEntry(event, arenaId) {
  return event === 'swarm:arenaEntered' && arenaId === FOUNDRY_ARENA_ID;
}

function blocks(root, name, geometry, material, rows, receives = true, casts = false) {
  const batch = new THREE.InstancedMesh(geometry, material, rows.length);
  batch.name = name;
  batch.receiveShadow = receives;
  batch.castShadow = casts;
  const pose = new THREE.Object3D();
  const color = new THREE.Color();
  rows.forEach(([x, y, z, width, height, depth, hex, yaw = 0], i) => {
    pose.position.set(x, y, z);
    pose.scale.set(width, height, depth);
    pose.rotation.y = yaw;
    pose.updateMatrix();
    batch.setMatrixAt(i, pose.matrix);
    if (hex != null) batch.setColorAt(i, color.setHex(hex));
  });
  root.add(batch);
  return batch;
}

function buildDeck(root, planeMaterial, steel, box, plateGeometry) {
  const foundation = new THREE.Mesh(new THREE.PlaneGeometry(DECK_SIZE, DECK_SIZE), planeMaterial);
  foundation.name = 'Foundry deck foundation';
  foundation.rotation.x = -Math.PI / 2;
  foundation.position.y = FOUNDRY_DECK_Y - 1.25;
  foundation.receiveShadow = true;
  root.add(foundation);

  const plate = [], runners = [], insets = [];
  const finishes = [0x454743, 0x494945, 0x464946, 0x484b48, 0x444644];
  const half = (DECK_BAYS - 1) / 2;
  for (let row = -half; row <= half; row++) {
    const stagger = row % 2 === 0 ? 0 : BAY / 2;
    for (let col = -half; col <= half; col++) {
      const x = col * BAY + stagger;
      const z = row * BAY;
      const finish = (Math.abs(row * 19 + col * 13) + col * col) % finishes.length;
      plate.push([x, FOUNDRY_DECK_Y - 0.6, z, BAY - 1, 1.2, BAY - 1, finishes[finish]]);
      if ((col - row * 2) % 5 === 0) {
        insets.push([x - 23, FOUNDRY_DECK_Y + 0.15, z + 17, 14, 0.3, 27, 0x252b30]);
        for (let slot = 0; slot < 5; slot++) {
          insets.push([x - 23, FOUNDRY_DECK_Y + 0.55, z + 7 + 5 * slot, 12, 0.5, 1.4, 0x555754]);
        }
      }
    }
  }
  for (const side of [-1, 1]) {
    for (const x of [97, 112, 171, 187]) {
      runners.push([side * x, FOUNDRY_DECK_Y + 0.8, 0, 1.6, 1.6, 780, 0x373a3a]);
    }
    for (let z = -378; z <= 378; z += 28) {
      const x = side * 95;
      runners.push([x, FOUNDRY_DECK_Y + 0.12, z, 2.6, 0.24, 14, 0x806340]);
    }
  }
  blocks(root, 'Foundry steel plating', plateGeometry, steel, plate);
  blocks(root, 'Foundry rail beds', box, steel, runners);
  blocks(root, 'Foundry access grilles', box, steel, insets);
}

function buildMachinery(root, steel, box, fixtures) {
  const frames = [], rollers = [], hot = [], lamps = [];
  const y = FOUNDRY_DECK_Y;
  for (const belt of CONVEYORS) {
    frames.push([belt.x, y + 9, belt.z, 25, 5, BELT_LENGTH, 0x262d30]);
    for (const edge of [-1, 1]) {
      frames.push([belt.x + edge * 13, y + 10, belt.z, 2, 3, BELT_LENGTH, 0x79726a]);
      for (let i = -3; i <= 3; i++) {
        frames.push([belt.x + edge * 11, y + 4, belt.z + i * 43, 3.2, 8, 7, 0x323536]);
      }
    }
    for (let i = -22; i <= 22; i++) {
      rollers.push([belt.x, y + 12, belt.z + i * 6.8, 23, 1, 2.3, 0x595b58]);
    }
    for (const end of [-1, 1]) {
      const z = belt.z + end * BELT_LENGTH / 2;
      frames.push([belt.x, y + 9, z, 32, 18, 19, 0x414546]);
      frames.push([belt.x, y + 18, z, 27, 0.5, 11, 0x8d6735]);
    }
  }
  const { x, z } = FURNACE;
  frames.push([x, y + 2, z - 6, 63, 4, 57, 0x242929]);
  frames.push([x, y + 13, z + 10, 51, 22, 31, 0x3d3330]);
  frames.push([x, y + 25, z + 12, 49, 4, 29, 0x605149]);
  frames.push([x, y + 6, z - 16, 49, 8, 24, 0x57453a]);
  for (const side of [-1, 1]) {
    frames.push([x + side * 21, y + 17, z - 12, 8, 20, 17, 0x695040]);
    frames.push([x + side * 15, y + 32, z + 15, 11, 13, 11, 0x383736]);
  }
  hot.push([x, y + 15, z - 6, 33, 10, 1]);
  for (let i = -3; i <= 3; i++) {
    frames.push([x + i * 4.5, y + 13, z - 10, 1, 11, 2, 0x2c2521]);
    hot.push([x + i * 4.5, y + 10.5, z - 16, 2.4, 0.75, 15]);
  }

  for (const lamp of WORK_LAMPS) {
    frames.push([lamp.x, y + 1, lamp.z, 8, 2, 8, 0x554d41]);
    frames.push([lamp.x, y + 15, lamp.z, 2.2, 30, 2.2, 0x5d5350]);
    frames.push([lamp.x, y + 30, lamp.z, 13, 4.2, 6, 0x4b4844]);
    lamps.push([lamp.x, y + 32.2, lamp.z, 8, 0.6, 2]);
  }
  // This roof of the high shop lamp is visible when looking beyond the far bank.
  frames.push([-248, y + 24, -316, 11, 48, 13, 0x4b4744]);
  frames.push([-214, y + 49, -316, 78, 5, 14, 0x686258]);
  lamps.push([-195, y + 52, -316, 20, 1, 4]);
  blocks(root, 'Foundry machinery and trusses', box, steel, frames, true, true);
  blocks(root, 'Foundry conveyor rollers', box, steel, rollers);
  blocks(root, 'Foundry furnace cores', box, fixtures.hot, hot, false);
  blocks(root, 'Foundry work-lamp lenses', box, fixtures.lamp, lamps, false);
}

function mountPart(root, record, placements, name, batches, own) {
  const model = new THREE.Group();
  model.name = name;
  instantiatePackagedPrimitives(record, model);
  const bounds = new THREE.Box3().setFromObject(model);
  if (bounds.isEmpty()) return;
  const centre = bounds.getCenter(new THREE.Vector3());
  centre.y = bounds.min.y;
  const size = bounds.getSize(new THREE.Vector3());
  const pose = new THREE.Object3D();
  const anchor = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  const moving = name === 'Foundry cargo';
  const poses = placements.map(({ x, y = FOUNDRY_DECK_Y, z, yaw = 0, fit, height }) => {
    const scale = fit / Math.max(size.x, size.y, size.z);
    pose.scale.set(scale, height && size.y > 0 ? height / size.y : scale, scale);
    pose.rotation.y = yaw;
    pose.position.set(x, y, z).sub(anchor.copy(centre).multiply(pose.scale).applyQuaternion(pose.quaternion));
    pose.updateMatrix();
    return pose.matrix.clone();
  });
  for (const mesh of model.children) {
    const batch = own(new THREE.InstancedMesh(mesh.geometry, mesh.material, placements.length));
    batch.name = name;
    batch.receiveShadow = true;
    // The authored kits contain fine ribs and fasteners. The structural silhouettes cast.
    batch.castShadow = false;
    if (moving) {
      batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      batch.frustumCulled = false;
      batches.push({ batch, poses, primitive: mesh.matrix });
    } else {
      poses.forEach((poseMatrix, i) => batch.setMatrixAt(i, matrix.multiplyMatrices(poseMatrix, mesh.matrix)));
    }
    root.add(batch);
  }
}

export function createFoundrySet(scene, { renderer, nocturne, loadPart = loadAuthoredPart } = {}) {
  const root = new THREE.Group();
  root.name = 'Foundry industrial deck';
  const center = { x: 0, z: 0 };
  const local = { x: 0, z: 0 };
  const resources = new Set();
  const own = resource => { resources.add(resource); return resource; };
  const steel = own(new THREE.MeshStandardMaterial({ roughness: 0.76, metalness: 0.22, color: 0xffffff }));
  const floor = own(new THREE.MeshPhongMaterial({ color: 0xffffff, specular: 0x252322, shininess: 19 }));
  const grout = own(new THREE.MeshLambertMaterial({ color: 0x252729 }));
  useDeckShadowFilter(floor);
  useDeckShadowFilter(grout);
  const fixtures = {
    hot: own(new THREE.MeshBasicMaterial({ color: new THREE.Color(FOUNDRY_LIGHT.furnaceCore).multiplyScalar(3.4) })),
    lamp: own(new THREE.MeshBasicMaterial({ color: new THREE.Color(FOUNDRY_LIGHT.lampCore).multiplyScalar(1.4) })),
  };
  const box = machinedBoxGeometry();
  // Floor plates keep small clipped corners in world units. Scaling the prop
  // bevel straight up would cut broad dark holes in every floor joint.
  const plateGeometry = own(box.clone());
  const vertices = plateGeometry.getAttribute('position');
  for (let i = 0; i < vertices.count; i++) {
    vertices.setX(i, plateCorner(vertices.getX(i)));
    vertices.setZ(i, plateCorner(vertices.getZ(i)));
  }
  plateGeometry.computeVertexNormals();
  plateGeometry.computeBoundingBox();
  plateGeometry.computeBoundingSphere();
  buildDeck(root, grout, floor, box, plateGeometry);
  own(root.children[0].geometry);
  buildMachinery(root, steel, box, fixtures);
  for (const object of root.children) if (object.isInstancedMesh) own(object);

  const blank = [0, 0, 0, 1, 1, 1, 0xffffff];
  const walls = own(blocks(root, 'Foundry bank foundations', box, steel,
    Array(BANK_CAPACITY * 9).fill(blank), true, true));
  const bankLenses = own(blocks(root, 'Foundry bank marker lenses', box, fixtures.lamp,
    Array(BANK_CAPACITY * 2).fill(blank), false));
  walls.count = bankLenses.count = 0;
  const pose = new THREE.Object3D();
  const color = new THREE.Color();
  const matrix = new THREE.Matrix4();
  const cargo = [];
  let elapsed = 0;
  let disposed = false;
  let bankWave = null;
  const lightSources = [
    { x: FURNACE.x, y: FOUNDRY_DECK_Y + 15, z: FURNACE.z - 29, ...FOUNDRY_LIGHT.furnace },
    ...WORK_LAMPS.map(lamp => ({ ...lamp, y: FOUNDRY_DECK_Y + 28, ...FOUNDRY_LIGHT.workLamp })),
  ];
  const lights = lightSources.map(({ color: tint, intensity, range, priority }, i) => {
    if (nocturne) return nocturne.createLight(`foundry-set:${i}`, 'point', {
      color: tint, intensity, range, priority, stationary: true,
    });
    const light = own(new THREE.PointLight(tint, intensity, range, 2));
    light.name = `Foundry practical ${i + 1}`;
    root.add(light);
    return light;
  });
  scene.add(root);
  const owner = 'foundry-arena-set';
  const active = () => !disposed;
  const assetRoot = isReleaseAssetMode() ? RELEASE_PROP_ROOT : PROP_ROOT;
  const jobs = [
    ['place_conveyor_truss', CONVEYORS, 'Foundry conveyor truss'],
    ['place_container_rack', RACKS, 'Foundry panel racks'],
    ['place_maintenance_gantry', GANTRIES, 'Foundry maintenance gantries'],
    ['place_cargo_pod_standard', CONVEYORS.flatMap(belt => Array.from({ length: CRATES_PER_BELT }, () =>
      ({ x: belt.x, z: 0, y: FOUNDRY_DECK_Y + BELT_HEIGHT, yaw: belt.yaw, fit: 19 }))), 'Foundry cargo'],
  ];
  const ready = renderer ? Promise.all(jobs.map(async ([file, placements, name]) => {
    const record = await loadPart(`${assetRoot}${file}.glb`, {
      renderer, slot: 'place', optional: true, residencyOwner: owner, isResidencyOwnerActive: active,
    });
    if (record?.primitives?.length && active()) mountPart(root, record, placements, name, cargo, own);
  })) : Promise.resolve();

  function setBankBlock(batch, index, bank, x, y, z, width, height, depth, hex) {
    const { rot, pos } = bank;
    const cos = Math.cos(rot), sin = Math.sin(rot);
    pose.position.set(pos.x - center.x + x * cos + z * sin, y, pos.z - center.z - x * sin + z * cos);
    pose.rotation.y = rot;
    pose.scale.set(width, height, depth);
    pose.updateMatrix();
    batch.setMatrixAt(index, pose.matrix);
    if (hex != null) batch.setColorAt(index, color.setHex(hex));
  }

  return {
    root, center, ready,
    installBanks(entities, wave = 0) {
      if (bankWave === wave) return false;
      const banks = [];
      let x = 0, z = 0, n = 0;
      for (const entity of entities) {
        if (!entity || entity.alive === false || entity.data?.roomKind !== 'plate') continue;
        if (entity.data.roomSolidId && !entity.data.roomSolidId.startsWith(`survival-room-w${wave}-`)) continue;
        const id = entity.data.roomToyId;
        const rim = id?.startsWith('foundry_rim_');
        if (!rim && !id?.startsWith('foundry_plate_')) continue;
        banks.push(entity);
        if (rim) { x += entity.pos.x; z += entity.pos.z; n++; }
      }
      if (n === 0) return false;
      bankWave = wave;
      center.x = x / n;
      center.z = z / n;
      let i = 0, j = 0;
      for (const bank of banks.slice(0, BANK_CAPACITY)) {
        const shape = foundryPlateShape(bank);
        const { halfWidth: w, halfDepth: d, halfHeight: h } = shape;
        const height = -FOUNDRY_DECK_Y - h;
        setBankBlock(walls, i++, bank, 0, FOUNDRY_DECK_Y + height / 2, 0, w * 2, height, d * 2, 0x35393c);
        setBankBlock(walls, i++, bank, 0, -h - 2, 0, w * 2, 4, d * 2, 0x70573c);
        for (let panel = -2; panel <= 2; panel++) {
          setBankBlock(walls, i++, bank, panel * w * 0.36, -27, d - 1, w * 0.29, 36, 2, 0x504e49);
        }
        for (const edge of [-1, 1]) {
          setBankBlock(walls, i++, bank, edge * w * 0.88, -12, d - 1, w * 0.13, 9, 2, 0xb18a41);
          setBankBlock(bankLenses, j++, bank, edge * w * 0.73, -h - 3, d, 4, 1.6, 1.2);
        }
      }
      walls.count = i;
      bankLenses.count = j;
      for (const mesh of [walls, bankLenses]) {
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.computeBoundingSphere();
      }
      return true;
    },
    frame(dt, membrane) {
      elapsed += dt;
      if (membrane) membrane.toLocal(center, local);
      else { local.x = center.x; local.z = center.z; }
      root.position.set(local.x, 0, local.z);
      for (let i = 0; i < lights.length; i++) {
        const light = lights[i];
        const source = lightSources[i];
        light.position.set(source.x + (nocturne ? local.x : 0), source.y, source.z + (nocturne ? local.z : 0));
      }
      for (const { batch, poses, primitive } of cargo) {
        for (let i = 0; i < poses.length; i++) {
          const belt = CONVEYORS[Math.floor(i / CRATES_PER_BELT)];
          const phase = (elapsed * 11 + (i % CRATES_PER_BELT) * BELT_LENGTH / CRATES_PER_BELT) % BELT_LENGTH;
          matrix.copy(poses[i]);
          matrix.elements[14] += belt.z + (belt.x < 0 ? 1 : -1) * (phase - BELT_LENGTH / 2);
          batch.setMatrixAt(i, matrix.multiply(primitive));
        }
        batch.instanceMatrix.needsUpdate = true;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      if (nocturne) for (const light of lights) light.dispose();
      for (const resource of resources) resource.dispose();
      getAssetResidency(renderer)?.releaseOwner(owner, 'foundry-set-exit');
    },
  };
}
