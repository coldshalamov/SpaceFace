// UI-only authored crew. Selection and receipts remain owned by the armory;
// this scene has no entity, wallet, physics body, or simulation clock.
import * as THREE from 'three';
import { createAuthoredAssetLease, disposeAuthoredAssetRuntime } from '../../render/assetLoader.js';
import { cloneMaterialPreservingShaderHooks } from '../../render/materialClone.js';
import { applyAuthoredMaterialProfile } from '../../render/authoredMaterialProfiles.js';
import { compileScenePipelinesSafely } from '../../render/compilePipelinesSafely.js';
import { collectStartupGeometries, collectStartupTextures } from '../../render/startupGpuResidency.js';
import {
  detachedGeometryUploadPending,
  detachedTextureUploadPending,
  noteGeometryGpuResident,
  rehydrateDetachedGeometries,
  rehydrateDetachedTextures,
} from '../../render/packageCpuDetach.js';
import { isReleaseAssetMode } from '../../render/releaseMode.js';
import { LOOK_BASE } from '../../data/lookMoods.js';
import { retireWhenProgramsReady } from '../previewContextRetire.js';

const NAMES = ['SPANNER_ROOT', 'CLAW_L', 'CLAW_R', 'ITEM_CRADLE', 'PIP_ROOT', 'PIP_POINTER'];
const PARENTS = { CLAW_L: 'SPANNER_ROOT', CLAW_R: 'SPANNER_ROOT', ITEM_CRADLE: 'SPANNER_ROOT', PIP_POINTER: 'PIP_ROOT' };
const WIDTH_METRES = 20.5;
export const PIP_SPANNER_FILE = 'places/place_pip_spanner.glb';

/** Flattened primitives are scene-relative. Undo exactly their owner's world matrix. */
export function buildPipSpannerRig(blueprint) {
  if (!blueprint?.metadata?.previewOnly || blueprint.metadata.worldEntity !== false) {
    throw new Error('Pip and Spanner require their authored preview contract');
  }
  const root = new THREE.Group(), groups = {}, markers = new Map(), materials = new Map();
  for (const name of NAMES) {
    const matches = blueprint.markers.filter(marker => marker.name === name);
    if (matches.length !== 1) throw new Error(`Missing or duplicate crew pivot: ${name}`);
    markers.set(name, matches[0].matrix);
    const group = new THREE.Group(); group.name = name; groups[name] = group;
  }
  for (const name of NAMES) {
    const parentName = PARENTS[name], group = groups[name];
    const local = markers.get(name).clone();
    if (parentName) local.premultiply(markers.get(parentName).clone().invert());
    local.decompose(group.position, group.quaternion, group.scale);
    (parentName ? groups[parentName] : root).add(group);
  }
  try {
    for (const primitive of blueprint.primitives) {
      const name = NAMES.find(name => primitive.name.includes(`_${name}_`));
      if (!name) throw new Error(`Unowned crew primitive: ${primitive.name}`);
      let material = materials.get(primitive.material);
      if (!material) {
        material = cloneMaterialPreservingShaderHooks(primitive.material);
        applyAuthoredMaterialProfile(material, null, { assetId: blueprint.assetId });
        materials.set(primitive.material, material);
      }
      const mesh = new THREE.Mesh(primitive.geometry, material); mesh.name = primitive.name;
      mesh.matrix.copy(markers.get(name)).invert().multiply(primitive.matrix);
      mesh.matrixAutoUpdate = false; groups[name].add(mesh);
    }
  } catch (error) {
    for (const material of materials.values()) material.dispose();
    throw error;
  }
  const rest = Object.fromEntries(NAMES.map(name => [name, {
    position: groups[name].position.clone(), quaternion: groups[name].quaternion.clone(),
  }]));
  const reset = () => {
    for (const name of NAMES) {
      groups[name].position.copy(rest[name].position); groups[name].quaternion.copy(rest[name].quaternion);
    }
  };
  return { root, groups, rest, reset, dispose() { reset(); root.removeFromParent(); for (const material of materials.values()) material.dispose(); } };
}

/** A capped one-shot pose, never an idle loop or a prerequisite for a transaction. */
export function createPipSpannerMotion(rig, { draw = () => {}, schedule, cancel,
  reduced = () => false, width = () => 360, now = () => performance.now() } = {}) {
  let frame = null, alive = true;
  const stop = () => { if (frame != null) cancel?.(frame); frame = null; rig.reset(); };
  const turn = (name, angle) => rig.groups[name].quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle));
  const pose = (kind, t) => {
    rig.reset();
    const envelope = Math.sin(Math.PI * Math.max(0, Math.min(1, t)));
    if (kind === 'confirm') {
      turn('CLAW_L', -.17 * envelope); turn('CLAW_R', .17 * envelope);
      rig.groups.ITEM_CRADLE.position.y -= .18 * envelope;
    } else if (kind === 'denied') turn('PIP_POINTER', .13 * envelope);
    else if (kind === 'repair') turn('PIP_POINTER', -.16 * envelope);
    else {
      const smooth = t * t * (3 - 2 * t);
      const cap = Math.min(1, 30 * WIDTH_METRES / Math.max(1, width()) / Math.hypot(.38, .2));
      rig.groups.PIP_ROOT.position.addScaledVector(new THREE.Vector3(.38, .12, .2), smooth * cap);
      turn('PIP_POINTER', -.14 * smooth);
    }
    draw();
  };
  return {
    play(kind) {
      stop(); if (!alive) return;
      if (reduced() || !schedule) { draw(); return; }
      const start = now(), duration = kind === 'confirm' ? 650 : kind === 'denied' ? 150 : kind === 'repair' ? 600 : 220;
      const step = () => {
        frame = null; if (!alive) return;
        if (reduced()) { stop(); draw(); return; }
        const t = Math.min(1, Math.max(0, (now() - start) / duration)); pose(kind, t);
        if (t < 1) frame = schedule(step);
      };
      frame = schedule(step);
    },
    reset() { stop(); if (alive) draw(); },
    dispose() { stop(); alive = false; },
  };
}

export function createPipSpannerPreview({ canvas, doc = canvas?.ownerDocument,
  onReady = () => {}, onError = () => {}, onProject = () => {}, rendererFactory = options => new THREE.WebGLRenderer(options),
  leaseFactory = createAuthoredAssetLease, compile = compileScenePipelinesSafely,
  retire = retireWhenProgramsReady } = {}) {
  if (!canvas?.getContext) return null;
  const win = doc?.defaultView || globalThis;
  let renderer;
  try { renderer = rendererFactory({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' }); }
  catch (error) { onError(error); return null; }
  renderer.debug && (renderer.debug.checkShaderErrors = false);
  renderer.setPixelRatio(Math.min(win.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera();
  camera.position.set(-1.8, 33, 19); camera.lookAt(-1.8, .7, -1); camera.near = .1; camera.far = 100;
  scene.add(new THREE.AmbientLight(LOOK_BASE.rig.ambientHex, .85));
  for (const [color, power, at] of [[LOOK_BASE.rig.keyHex, 1.7, [-.55, 1.1, .75]],
    [LOOK_BASE.rig.rimHex, .7, [.75, .35, -.55]], [LOOK_BASE.rig.fillHex, .35, [.5, -.25, .45]]]) {
    const light = new THREE.DirectionalLight(color, power); light.position.set(...at); scene.add(light);
  }
  let disposed = false, ready = false, rig = null, motion = null, lastOffer = null;
  const lease = leaseFactory(renderer, { ownerId: 'pip-spanner-armory', role: 'preview' });
  const dimensions = () => ({ width: Math.max(1, canvas.clientWidth || 360), height: Math.max(1, canvas.clientHeight || 216) });
  const resize = () => {
    if (disposed) return;
    const { width, height } = dimensions(); renderer.setSize(width, height, false);
    camera.left = -WIDTH_METRES / 2; camera.right = WIDTH_METRES / 2;
    camera.top = WIDTH_METRES / 2 * height / width; camera.bottom = -camera.top; camera.updateProjectionMatrix();
    if (ready) draw();
  };
  const reduced = () => !!(doc?.documentElement?.classList?.contains('sf-reduce-motion')
    || doc?.documentElement?.classList?.contains('sf-reduce-flash')
    || win.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const anchor = new THREE.Vector3();
  const draw = () => {
    if (disposed || !ready) return;
    renderer.render(scene, camera);
    const { width, height } = dimensions();
    rig.groups.ITEM_CRADLE.getWorldPosition(anchor).project(camera);
    onProject({ x: (anchor.x + 1) * width / 2, y: (1 - anchor.y) * height / 2 });
  };
  resize();
  const observer = typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(resize) : null;
  observer?.observe(canvas);
  const lost = event => { event.preventDefault(); if (!disposed) { onError(new Error('Crew preview context lost')); view.dispose(); } };
  canvas.addEventListener?.('webglcontextlost', lost);
  const view = {
    inspect(offer) { lastOffer = offer?.id || null; motion?.play('focus'); },
    receipt(receipt, selection) {
      if (receipt?.offerId !== selection || selection !== lastOffer) return;
      if (receipt.outcome === 'accepted') motion?.play(receipt.kind === 'service' ? 'repair' : 'confirm');
      else if (receipt.outcome === 'denied') motion?.play('denied');
    },
    reset() { lastOffer = null; motion?.reset(); },
    dispose() {
      if (disposed) return; disposed = true; ready = false; motion?.dispose(); observer?.disconnect();
      canvas.removeEventListener?.('webglcontextlost', lost);
      retire({ programs: renderer.info?.programs, parallelCompile: !!renderer.extensions?.has('KHR_parallel_shader_compile'),
        context: renderer.getContext?.(), finish() {
          rig?.dispose(); lease.release('pip-spanner-preview-retired'); disposeAuthoredAssetRuntime(renderer);
          renderer.dispose(); renderer.forceContextLoss?.();
        } });
    },
  };
  const url = `assets/ships/${isReleaseAssetMode() ? 'release/parts' : 'parts'}/${PIP_SPANNER_FILE}`;
  view.ready = lease.load(url, { slot: 'place' }).then(async blueprint => {
    if (disposed || !blueprint) return false;
    rig = buildPipSpannerRig(blueprint); scene.add(rig.root);
    await compile(renderer, scene, camera);
    if (disposed || renderer.getContext?.().isContextLost?.()) return false;
    // A cpu-detached package texture this private context has not uploaded re-enters three's
    // uploader on the first bind and reads emptied payloads — re-attach the pending set before
    // the first draw (the N2 secondary-context gate).
    const pendingUploads = collectStartupTextures(scene)
      .filter((texture) => detachedTextureUploadPending(texture, renderer.properties));
    const pendingGeometries = collectStartupGeometries(scene)
      .filter((geometry) => detachedGeometryUploadPending(geometry, renderer));
    if (pendingGeometries.length) await rehydrateDetachedGeometries(pendingGeometries);
    if (pendingUploads.length) await rehydrateDetachedTextures(pendingUploads);
    if (disposed || renderer.getContext?.().isContextLost?.()) return false;
    // compile() created this context's attribute records — ledger the uploads so a later
    // detach doesn't re-pend this renderer in the geometry gate.
    for (const geometry of collectStartupGeometries(scene)) {
      noteGeometryGpuResident(geometry, renderer);
    }
    ready = true;
    motion = createPipSpannerMotion(rig, { draw, reduced, width: () => dimensions().width,
      schedule: win.requestAnimationFrame?.bind(win), cancel: win.cancelAnimationFrame?.bind(win) });
    draw(); onReady(); return true;
  }).catch(error => { if (!disposed) { onError(error); view.dispose(); } return false; });
  return view;
}
