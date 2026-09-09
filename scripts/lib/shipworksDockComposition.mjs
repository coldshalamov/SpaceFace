import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { NodeIO } from '@gltf-transform/core';
import { dockTransformForShipBounds } from '../../src/ui/shipPreviewMount.js';

const DOCK_SOURCE = resolve('assets/ships/parts/places/place_dock_interior.glb');
const REPRESENTATIVES = Object.freeze([
  Object.freeze({
    id: 'ship_kestrel_fallback',
    defId: 'ship_kestrel',
    sourceKind: 'live-loading-fallback',
  }),
  Object.freeze({
    id: 'ship_kestrel_authored',
    defId: 'ship_kestrel',
    sourceKind: 'settled-authored-wholeship',
    sourcePath: resolve('assets/ships/parts/wholeships/kestrel.glb'),
  }),
  Object.freeze({
    id: 'ship_pelican_fallback',
    defId: 'ship_pelican',
    sourceKind: 'live-loading-fallback',
  }),
  Object.freeze({
    id: 'ship_bastion_fallback',
    defId: 'ship_bastion',
    sourceKind: 'live-loading-fallback',
  }),
  Object.freeze({
    id: 'ship_leviathan_fallback',
    defId: 'ship_leviathan',
    sourceKind: 'live-loading-fallback',
  }),
]);
const YAWS = Object.freeze([0, 45, 90]);
const SAMPLE_LIMIT = 1200;

let dependencyPromise = null;

function makeStubCanvas() {
  const context = {
    canvas: { width: 256, height: 256 },
    fillRect() {}, strokeRect() {}, clearRect() {}, fillText() {}, strokeText() {},
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, setTransform() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, rect() {},
    bezierCurveTo() {}, quadraticCurveTo() {}, fill() {}, stroke() {},
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
    createImageData(width, height) {
      return {
        data: new Uint8ClampedArray((width || 1) * (height || 1) * 4),
        width,
        height,
      };
    },
    getImageData(_x, _y, width, height) {
      return {
        data: new Uint8ClampedArray(width * height * 4),
        width,
        height,
      };
    },
    putImageData() {}, drawImage() {}, measureText() { return { width: 10 }; },
    fillStyle: '', strokeStyle: '', font: '', lineWidth: 1, globalAlpha: 1,
  };
  return {
    width: 256,
    height: 256,
    getContext: () => context,
    style: {},
    toDataURL: () => 'data:,',
    addEventListener() {},
    removeEventListener() {},
  };
}

function installHeadlessCanvas() {
  if (!globalThis.document) {
    globalThis.document = {
      createElement(tag) {
        return tag === 'canvas'
          ? makeStubCanvas()
          : { style: {}, appendChild() {}, addEventListener() {} };
      },
      getElementById: () => null,
      addEventListener() {},
    };
  }
  if (!globalThis.window) {
    globalThis.window = { addEventListener() {}, devicePixelRatio: 1 };
  }
  globalThis.__SF_VISUAL_FACTORY_THROW__ = true;
}

async function dependencies() {
  if (!dependencyPromise) {
    installHeadlessCanvas();
    dependencyPromise = Promise.all([
      import('three'),
      import('../../src/render/visualFactory.js'),
      import('../../src/render/ships/kestrelHero.js'),
      import('../../src/data/ships.js'),
    ]).then(([THREE, factoryModule, heroModule, shipModule]) => ({
      THREE,
      createVisualFactory: factoryModule.createVisualFactory,
      buildKestrelHero: heroModule.buildKestrelHero,
      SHIPS: shipModule.SHIPS,
    }));
  }
  return dependencyPromise;
}

function isPreviewOnly(object) {
  const tags = object?.userData?.spacefaceTags;
  const vfxRole = tags?.vfxRole;
  return !!(
    object?.isSprite
    || object?.name === 'Ship_Shield_Bubble'
    || object?.name === 'GLTFKit_Nav_Lights'
    || vfxRole === 'shieldBubble'
    || tags?.damageRole === 'navLight'
    || vfxRole === 'drivePlume'
    || vfxRole === 'driveCore'
    || vfxRole === 'driveHalo'
    || vfxRole === 'driveNozzleGlow'
    || vfxRole === 'navBlinker'
  );
}

async function buildRepresentativeShip(representative, def, dependenciesValue, factory) {
  if (representative.sourcePath) {
    return loadAuthoredShipGeometry(dependenciesValue.THREE, representative.sourcePath);
  }
  const entity = {
    id: 'shipworks-composition-proof',
    type: 'ship',
    team: 0,
    isPlayer: def.id === 'ship_kestrel',
    radius: def.collisionRadius,
    pos: { x: 0, z: 0 },
    rot: 0,
    prevPos: { x: 0, z: 0 },
    prevRot: 0,
    bank: 0,
    data: {
      defId: def.id,
      fittings: [],
      weapons: [],
      miningBeam: null,
    },
  };
  return def.id === 'ship_kestrel'
    ? dependenciesValue.buildKestrelHero(entity)
    : factory.build(entity);
}

async function loadAuthoredShipGeometry(THREE, sourcePath) {
  const document = await new NodeIO().read(sourcePath);
  const root = new THREE.Group();
  root.name = 'ShipworksAuthoredRepresentative';
  let primitives = 0;

  for (const node of document.getRoot().listNodes()) {
    const mesh = node.getMesh();
    const name = node.getName() || '';
    const extras = node.getExtras() || {};
    if (!mesh || /^COLLISION(?:_|$)/i.test(name) || extras.nonRender === true) continue;
    const matrix = new THREE.Matrix4().fromArray(node.getWorldMatrix());
    for (const primitive of mesh.listPrimitives()) {
      const position = primitive.getAttribute('POSITION');
      if (!position) continue;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(
        position.getArray().slice(),
        3,
        position.getNormalized(),
      ));
      const indices = primitive.getIndices();
      if (indices) geometry.setIndex(new THREE.BufferAttribute(indices.getArray().slice(), 1));
      const object = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
      object.name = `${name || 'AuthoredShipPrimitive'}_${primitives}`;
      object.matrix.copy(matrix);
      object.matrixAutoUpdate = false;
      root.add(object);
      primitives += 1;
    }
  }
  if (!primitives) throw new Error(`authored representative has no visible geometry: ${sourcePath}`);
  return root;
}

function visibleShipGeometry(root, THREE) {
  const box = new THREE.Box3().makeEmpty();
  const points = [];
  const objectBox = new THREE.Box3();
  const point = new THREE.Vector3();

  root.updateWorldMatrix(true, true);
  root.traverse((object) => {
    if (!object?.geometry || isPreviewOnly(object)) return;
    const position = object.geometry.getAttribute?.('position');
    if (!position) return;
    if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
    if (object.geometry.boundingBox) {
      objectBox.copy(object.geometry.boundingBox).applyMatrix4(object.matrixWorld);
      box.union(objectBox);
    }
    for (let index = 0; index < position.count; index += 1) {
      point.fromBufferAttribute(position, index).applyMatrix4(object.matrixWorld);
      points.push(point.clone());
    }
  });

  if (box.isEmpty() || !points.length) {
    throw new Error('representative ship has no visible geometry');
  }
  const stride = Math.max(1, Math.floor(points.length / SAMPLE_LIMIT));
  return {
    box,
    samples: points.filter((_value, index) => index % stride === 0).slice(0, SAMPLE_LIMIT),
    visibleVertexCount: points.length,
    stride,
  };
}

async function loadDockTriangles(THREE, sourcePath) {
  const document = await new NodeIO().read(sourcePath);
  const assetExtras = document.getRoot().getAsset()?.extras || {};
  const metadata = assetExtras.spacefaceAsset || {};
  const group = new THREE.Group();
  group.name = 'ShipworksDockCompositionProof';
  let triangles = 0;
  let primitives = 0;

  for (const node of document.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const matrix = new THREE.Matrix4().fromArray(node.getWorldMatrix());
    for (const primitive of mesh.listPrimitives()) {
      const position = primitive.getAttribute('POSITION');
      if (!position) continue;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(
        position.getArray().slice(),
        3,
        position.getNormalized(),
      ));
      const indices = primitive.getIndices();
      if (indices) {
        geometry.setIndex(new THREE.BufferAttribute(indices.getArray().slice(), 1));
        triangles += Math.floor(indices.getCount() / 3);
      } else {
        triangles += Math.floor(position.getCount() / 3);
      }
      const object = new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
      );
      object.name = `${node.getName() || 'DockPrimitive'}_${primitives}`;
      object.matrix.copy(matrix);
      object.matrixAutoUpdate = false;
      group.add(object);
      primitives += 1;
    }
  }
  if (!primitives || !triangles) throw new Error('dock source has no triangle geometry');
  group.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3().setFromObject(group);
  if (bounds.isEmpty()) throw new Error('dock source has empty bounds');
  return {
    group,
    primitives,
    triangles,
    metadata,
    bounds: {
      min: bounds.min.toArray(),
      max: bounds.max.toArray(),
      size: bounds.getSize(new THREE.Vector3()).toArray(),
      center: bounds.getCenter(new THREE.Vector3()).toArray(),
    },
  };
}

function transformDockForShip(dock, shipBox, THREE, metadata, dockBounds) {
  const size = shipBox.getSize(new THREE.Vector3());
  const center = shipBox.getCenter(new THREE.Vector3());
  const transform = dockTransformForShipBounds(shipBox, metadata, dockBounds);
  if (!transform) throw new Error('runtime dock transform rejected representative ship bounds');
  dock.scale.setScalar(transform.scale);
  dock.position.set(
    transform.position.x,
    transform.position.y,
    transform.position.z,
  );
  dock.updateWorldMatrix(true, true);
  return { size, center, ...transform };
}

export async function evaluateShipworksDockComposition({
  sourcePath = DOCK_SOURCE,
} = {}) {
  const deps = await dependencies();
  const { THREE } = deps;
  const sourceBytes = await readFile(sourcePath);
  const sourceSha256 = createHash('sha256').update(sourceBytes).digest('hex');
  const {
    group: dock,
    primitives,
    triangles,
    metadata,
    bounds: dockBounds,
  } = await loadDockTriangles(THREE, sourcePath);
  const factory = deps.createVisualFactory();
  const rows = [];

  for (const representative of REPRESENTATIVES) {
    const def = deps.SHIPS.find((candidate) => candidate.id === representative.defId);
    if (!def) throw new Error(`missing representative ship ${representative.defId}`);
    const ship = await buildRepresentativeShip(representative, def, deps, factory);
    const geometry = visibleShipGeometry(ship, THREE);
    if (geometry.samples.length !== SAMPLE_LIMIT) {
      throw new Error(`${representative.id} produced ${geometry.samples.length}/${SAMPLE_LIMIT} samples`);
    }
    const placement = transformDockForShip(dock, geometry.box, THREE, metadata, dockBounds);
    const radius = placement.size.length() * 0.5;
    const distance = radius * 2.85;
    const camera = new THREE.Vector3(
      placement.center.x - distance * 0.42,
      placement.center.y + distance * 0.38,
      placement.center.z + distance * 0.72,
    );

    for (const yaw of YAWS) {
      const rotation = new THREE.Matrix4().makeRotationY(THREE.MathUtils.degToRad(yaw));
      let hits = 0;
      for (const sourcePoint of geometry.samples) {
        const target = sourcePoint.clone().applyMatrix4(rotation);
        const delta = target.clone().sub(camera);
        const far = delta.length();
        const intersections = new THREE.Raycaster(
          camera,
          delta.normalize(),
          0,
          far - 0.01,
        ).intersectObjects(dock.children, false);
        if (intersections.length) hits += 1;
      }
      rows.push({
        shipId: representative.id,
        defId: representative.defId,
        sourceKind: representative.sourceKind,
        yaw,
        samples: geometry.samples.length,
        hits,
        visibleVertexCount: geometry.visibleVertexCount,
        stride: geometry.stride,
        dockScale: placement.scale,
        floorClearance: placement.floorClearance,
      });
    }
  }

  const totals = rows.reduce(
    (value, row) => ({
      samples: value.samples + row.samples,
      hits: value.hits + row.hits,
    }),
    { samples: 0, hits: 0 },
  );
  return Object.freeze({
    schema: 'spaceface.shipworks-dock-composition.v1',
    sourcePath,
    sourceSha256,
    representativeShips: REPRESENTATIVES.map((representative) => representative.id),
    yaws: [...YAWS],
    dock: { primitives, triangles },
    rows,
    totals,
    pass: rows.length === REPRESENTATIVES.length * YAWS.length
      && totals.samples === REPRESENTATIVES.length * YAWS.length * SAMPLE_LIMIT
      && totals.hits === 0,
  });
}
