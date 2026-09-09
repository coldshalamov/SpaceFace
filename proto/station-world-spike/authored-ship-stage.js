import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from '/node_modules/three/examples/jsm/environments/RoomEnvironment.js';

const SHIP_URL = '/proto/station-world-spike/assets/kestrel-station-candidate.glb';
const PROMOTED_SHIP_URL = '/assets/ships/release/parts/wholeships/kestrel.glb';
const DETAIL_URL = '/proto/station-world-spike/assets/kestrel-detail-overlay.glb';
const BASIS_URL = '/vendor/addons/libs/basis/';

function visibleBounds(root) {
  const bounds = new THREE.Box3();
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    if (object.isMesh && object.visible) bounds.union(new THREE.Box3().setFromObject(object));
  });
  return bounds;
}

function eachMaterial(material, visit) {
  if (Array.isArray(material)) material.forEach(visit);
  else if (material) visit(material);
}

function disposeObject(root) {
  const materials = new Set();
  const textures = new Set();
  root?.traverse((object) => {
    object.geometry?.dispose?.();
    eachMaterial(object.material, (material) => materials.add(material));
  });
  for (const material of materials) {
    for (const value of Object.values(material)) {
      if (value?.isTexture) textures.add(value);
    }
    material.dispose?.();
  }
  for (const texture of textures) texture.dispose?.();
}

export function createAuthoredShipStage(canvas, { onFirstFrame, onError } = {}) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
    premultipliedAlpha: false,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(37, 1, .05, 1000);
  const shipPivot = new THREE.Group();
  scene.add(shipPivot);

  const room = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environmentTarget = pmrem.fromScene(room, .04);
  room.dispose();
  scene.environment = environmentTarget.texture;

  // The light rig is deliberately asymmetric. It separates the warm hull paint,
  // dark machinery, repair panels, and emissive systems instead of flattening
  // them into the procedural preview's single clay-colored value range.
  scene.add(new THREE.HemisphereLight(0xbfe8ff, 0x111722, .72));
  const key = new THREE.DirectionalLight(0xffd6aa, 3.1);
  key.position.set(-18, 24, 20);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -.00018;
  key.shadow.normalBias = .03;
  Object.assign(key.shadow.camera, { left: -24, right: 24, top: 18, bottom: -18, near: 1, far: 80 });
  scene.add(key);

  const fill = new THREE.DirectionalLight(0x68d7ff, 1.45);
  fill.position.set(20, 8, 23);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0x9d7aff, 1.9);
  rim.position.set(5, 13, -24);
  scene.add(rim);

  const workLight = new THREE.PointLight(0xffa94d, 42, 34, 1.8);
  workLight.position.set(-8, -1, 11);
  scene.add(workLight);

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(70, 44),
    new THREE.ShadowMaterial({ color: 0x01030a, opacity: .38, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -3.8;
  shadow.receiveShadow = true;
  scene.add(shadow);

  const ktx2Loader = new KTX2Loader()
    .setTranscoderPath(BASIS_URL)
    .setWorkerLimit(2)
    .detectSupport(renderer);
  const loader = new GLTFLoader()
    .setKTX2Loader(ktx2Loader)
    .setMeshoptDecoder(MeshoptDecoder);

  const state = {
    disposed: false,
    root: null,
    detailRoot: null,
    radius: 15,
    baseDistance: 35,
    zoom: 1,
    yaw: -.22,
    frame: 0,
    width: 0,
    height: 0,
    renderCount: 0,
  };

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (state.width === width && state.height === height && renderer.getPixelRatio() === dpr) return false;
    state.width = width;
    state.height = height;
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    return true;
  }

  function positionCamera() {
    const distance = state.baseDistance / state.zoom;
    const direction = new THREE.Vector3(.78, .34, 1).normalize();
    camera.position.copy(direction.multiplyScalar(distance));
    camera.lookAt(0, -.25, 0);
    camera.near = Math.max(.05, distance / 250);
    camera.far = distance * 18;
    camera.updateProjectionMatrix();
  }

  function renderNow() {
    state.frame = 0;
    if (state.disposed) return;
    resize();
    shipPivot.rotation.y = state.yaw;
    positionCamera();
    renderer.render(scene, camera);
    state.renderCount += 1;
    if (window.__SF_STATION_SHIP) {
      window.__SF_STATION_SHIP.yaw = state.yaw;
      window.__SF_STATION_SHIP.zoom = state.zoom;
      window.__SF_STATION_SHIP.renderCount = state.renderCount;
    }
  }

  function requestRender() {
    if (!state.frame && !state.disposed) state.frame = requestAnimationFrame(renderNow);
  }

  const resizeObserver = new ResizeObserver(requestRender);
  resizeObserver.observe(canvas);

  async function load() {
    try {
      const gltf = await loader.loadAsync(SHIP_URL);
      if (state.disposed) {
        disposeObject(gltf.scene);
        return;
      }
      const root = gltf.scene;
      const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      const prepare = (subject, { hideHelpers = false, boostNormals = false } = {}) => subject.traverse((object) => {
        if (!object.isMesh) return;
        if (hideHelpers && /collision|plume/i.test(object.name || '')) {
          object.visible = false;
          return;
        }
        object.castShadow = true;
        object.receiveShadow = true;
        eachMaterial(object.material, (material) => {
          if ('envMapIntensity' in material) material.envMapIntensity = 1.18;
          if (boostNormals && material.normalScale) material.normalScale.multiplyScalar(1.12);
          for (const value of Object.values(material)) {
            if (value?.isTexture) value.anisotropy = anisotropy;
          }
          material.needsUpdate = true;
        });
      });
      prepare(root, { hideHelpers: true, boostNormals: true });

      const bounds = visibleBounds(root);
      const center = bounds.getCenter(new THREE.Vector3());
      const sphere = bounds.getBoundingSphere(new THREE.Sphere());
      root.position.sub(center);
      shipPivot.add(root);
      state.root = root;
      state.radius = sphere.radius;
      // At this framing the Kestrel fills the bay without colliding with the
      // service crown; zoom remains available for material and greeble study.
      state.baseDistance = Math.max(24, sphere.radius * 2.28);
      shadow.position.y = bounds.min.y - center.y - .45;

      // The detail study remains a separate GLB so the accepted V4 asset and
      // release manifests stay untouched while we test whether its form language
      // deserves a full authored V5 pass.
      try {
        const detailGltf = await loader.loadAsync(DETAIL_URL);
        if (state.disposed) {
          disposeObject(detailGltf.scene);
          return;
        }
        const detailRoot = detailGltf.scene;
        prepare(detailRoot);
        detailRoot.position.copy(root.position);
        shipPivot.add(detailRoot);
        state.detailRoot = detailRoot;
      } catch (detailError) {
        console.warn('[station-world] detail overlay unavailable', detailError);
      }

      requestRender();
      renderer.shadowMap.needsUpdate = true;
      onFirstFrame?.();
      window.__SF_STATION_SHIP = {
        ready: true,
        asset: SHIP_URL,
        promotedBase: PROMOTED_SHIP_URL,
        detail: state.detailRoot ? DETAIL_URL : null,
        radius: sphere.radius,
        renderer: 'authored-demand-render',
        yaw: state.yaw,
        zoom: state.zoom,
        renderCount: state.renderCount,
      };
    } catch (error) {
      console.error('[station-world] authored ship failed', error);
      window.__SF_STATION_SHIP = { ready: false, error: String(error) };
      onError?.(error);
    }
  }

  load();
  requestRender();

  return {
    setYaw(yaw) {
      state.yaw = yaw;
      requestRender();
    },
    rotateBy(delta) {
      state.yaw += delta;
      requestRender();
    },
    zoomBy(delta) {
      state.zoom = THREE.MathUtils.clamp(state.zoom + delta, .72, 1.55);
      requestRender();
    },
    render: requestRender,
    dispose() {
      if (state.disposed) return;
      state.disposed = true;
      if (state.frame) cancelAnimationFrame(state.frame);
      resizeObserver.disconnect();
      disposeObject(state.root);
      disposeObject(state.detailRoot);
      shadow.geometry.dispose();
      shadow.material.dispose();
      environmentTarget.dispose();
      pmrem.dispose();
      ktx2Loader.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      delete window.__SF_STATION_SHIP;
    },
  };
}
