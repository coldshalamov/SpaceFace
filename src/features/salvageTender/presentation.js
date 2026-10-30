// Morrowlight's visible machinery. The existing renderer owns the hull; these bounded deck
// fittings share its presented transform. A separate scene root keeps hull rematerialization
// from disposing the deck owner's resources. No simulation writes, cloned cargo or private loop.
import * as THREE from 'three';
import { createAuthoredAssetLease } from '../../render/assetLoader.js';
import { nocturneForScene } from '../../render/nocturne/bridge.js';
import { getSalvageTenderReadModel, salvageTenderBodyForState } from './readModel.js';

const ROOT = 'assets/ships/release/parts/';
const OWNERS = new WeakMap();
const TAU = Math.PI * 2;
const NO_DIAGNOSTICS = Object.freeze({ mounted: 0, pending: 0, failures: 0, disposed: false });

// Each dead section has its own authored wrecked/repaired body. Repaired history survives hull
// damage: lights go out, but an installed workshop does not silently become a fresh abandoned rack.
export const TENDER_EQUIPMENT = Object.freeze([
  Object.freeze({
    id: 'lantern', stage: 1, slot: 'place', length: 0.43,
    position: Object.freeze([0.42, 0.23, -0.23]),
    broken: 'places/place_power_skid.glb', restored: 'places/place_power_skid_patched.glb',
  }),
  Object.freeze({
    id: 'bench', stage: 2, slot: 'place', length: 0.60,
    position: Object.freeze([-0.12, 0.24, -0.43]),
    broken: 'places/place_repair_scaffold_bent.glb', restored: 'places/place_repair_scaffold.glb',
  }),
  Object.freeze({
    id: 'rack', stage: 3, slot: 'place', length: 0.62,
    // The physical fairlead is 20 WU aft; the pod remains a separate rope-carried body.
    position: Object.freeze([-0.67, 0.23, 0]),
    broken: 'places/place_container_rack_abandoned.glb', restored: 'places/place_container_rack.glb',
  }),
]);

export const TENDER_CUES = Object.freeze({
  arrive: Object.freeze({ recipe: 'sfx_dock_clunk', gain: 0.24, caption: 'Morrowlight: the berth lamp is still on.' }),
  restore: Object.freeze({ recipe: 'sfx_cargo_seat_whir', gain: 0.42, caption: 'A dead part of the tender comes back to life.' }),
  repair: Object.freeze({ recipe: 'sfx_station_machinery', gain: 0.30, caption: 'The welding rig settles into its work.' }),
  provision: Object.freeze({ recipe: 'sfx_cargo_seat_thunk', gain: 0.28, caption: 'The supply rack takes the load.' }),
  relocate: Object.freeze({ recipe: 'sfx_undock_release', gain: 0.30, caption: 'Morrowlight: moorings released. Take it gently.' }),
  secured: Object.freeze({ recipe: 'sfx_dock_capture', gain: 0.32, caption: 'Morrowlight: secured. You are home.' }),
  damaged: Object.freeze({ recipe: 'sfx_station_machinery', gain: 0.20, caption: 'Morrowlight needs a repair before the machinery can work.' }),
});

/** Uses the game's gesture-gated audio bus. It never allocates an AudioContext or a looping voice. */
export function bindSalvageTenderAudio(bus, getState) {
  if (!bus?.on || !bus?.emit) return () => {};
  const last = new Map();
  const off = bus.on('salvageTender:cue', (event) => {
    const cue = TENDER_CUES[event?.kind];
    if (!cue) return;
    const state = typeof getState === 'function' ? getState() : getState;
    const row = state?.salvageTender;
    if (!row?.physical || row.physical.sectorId !== state?.world?.currentSectorId) return;
    const player = state.entities?.get?.(state.playerId);
    const body = salvageTenderBodyForState(state);
    const pos = event.pos || body?.pos;
    if (!player?.pos || !pos || Math.hypot(player.pos.x - pos.x, player.pos.z - pos.z) > 240) return;
    const now = Number.isFinite(state.simTime) ? state.simTime : 0;
    const previous = last.get(event.kind);
    if (Number.isFinite(previous) && now >= previous && now - previous < 0.3) return;
    last.set(event.kind, now);
    if (state.settings?.accessibility?.audioCues !== false) {
      bus.emit('audio:cue', {
        id: cue.recipe, gain: cue.gain, position: { x: pos.x, y: 0, z: pos.z },
        owner: 'salvageTender', cueId: `salvageTender.${event.kind}`,
      });
    }
    bus.emit('presentation:caption', {
      text: typeof event.text === 'string' && event.text ? event.text : cue.caption,
      physical: true, channel: 'cue', assertive: false,
      showVisible: state.settings?.accessibility?.captions === true,
    });
  }, { presentation: true });
  return () => { if (typeof off === 'function') off(); last.clear(); };
}

function instantiate(record, lease, spec, THREE_NS) {
  if (!record?.bounds?.size || !(record.bounds.size[0] > 0)) return null;
  // Production packages own their residency and immutable geometry. Never recursively clone or
  // dispose the shared materials: other tenders may be using the same asset at this instant.
  if (record.renderPackage?.createInstance) {
    const instance = record.renderPackage.createInstance({
      residencyOwner: lease.owner,
      residencyRole: 'live-boundary',
      name: `Morrowlight_${spec.id}`,
    });
    const mount = new THREE_NS.Group();
    mount.scale.setScalar(spec.length / record.bounds.size[0]);
    mount.add(instance.root);
    return { root: mount, dispose: () => { mount.remove(instance.root); instance.dispose('tender-fitting-retired'); } };
  }
  // Kept for the existing source-blueprint loader contract and small headless tests. This branch
  // still uses the authored meshes; it invents no proxy body when an asset cannot be loaded.
  if (!Array.isArray(record.primitives)) return null;
  const mount = new THREE_NS.Group();
  mount.scale.setScalar(spec.length / record.bounds.size[0]);
  for (const primitive of record.primitives) {
    if (!primitive.geometry || !primitive.material || (primitive.tags?.lod && primitive.tags.lod !== 'lod0')) continue;
    const mesh = new THREE_NS.Mesh(primitive.geometry, primitive.material);
    if (primitive.matrix) primitive.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mount.add(mesh);
  }
  return { root: mount, dispose: () => mount.clear() };
}

/** Concrete render owner; call update after prepareFrame and before drawPreparedFrame. */
export function createSalvageTenderPresentation({
  state, bus = null, renderer = state?.render?.renderer, scene = state?.render?.scene, meshes = null,
  THREE_NS = THREE, leaseFactory = createAuthoredAssetLease,
} = {}) {
  let liveState = state;
  let disposed = false;
  let attachedRoot = null;
  let model = null;
  let lastProjectionAt = -Infinity;
  let lastRevision = -1;
  let pending = 0;
  let failures = 0;
  const group = new THREE_NS.Group();
  group.name = 'Morrowlight_ServiceDeck';
  group.userData.salvageTenderPresentation = true;
  group.matrixAutoUpdate = false;
  group.visible = false;
  scene?.add?.(group);
  const inverseScene = new THREE_NS.Matrix4();
  const lease = leaseFactory(renderer, { ownerId: 'personal-salvage-tender:deck', role: 'live-boundary' });
  const fixtures = TENDER_EQUIPMENT.map((spec) => {
    const fixture = {
      spec, group: new THREE_NS.Group(), broken: null, restored: null,
      lamp: null, active: false,
    };
    fixture.group.name = `Morrowlight_${spec.id}_Rack`;
    fixture.group.position.set(...spec.position);
    const geometry = new THREE_NS.CylinderGeometry(0.022, 0.022, 0.034, 8);
    const material = new THREE_NS.MeshStandardMaterial({
      color: 0x705b35, emissive: 0xffc071, emissiveIntensity: 0,
      metalness: 0.35, roughness: 0.6,
    });
    fixture.lamp = new THREE_NS.Mesh(geometry, material);
    fixture.lamp.position.set(spec.length * 0.35, 0.06, 0);
    fixture.group.add(fixture.lamp);
    group.add(fixture.group);
    return fixture;
  });
  const nocturne = nocturneForScene(scene);
  const deckLight = nocturne
    ? nocturne.createLight('salvage-tender:berth-lamp', 'point', { color: 0xffc071, range: 65, decay: 2, priority: 2 })
    : new THREE_NS.PointLight(0xffc071, 0, 65, 2);
  deckLight.name = 'Morrowlight_BerthLamp';
  deckLight.castShadow = false;
  deckLight.position.set(0.42, 0.5, -0.23);
  if (!nocturne) group.add(deckLight);
  const unbindAudio = bindSalvageTenderAudio(bus, () => liveState);
  const lifecycleUnsubs = [];

  // Bounded at six immutable authored records. Liveness is checked before instantiation and
  // again before mounting; a sector change/reset cannot publish late equipment into a new world.
  const ready = Promise.all(fixtures.flatMap((fixture) => ['broken', 'restored'].map(async (variant) => {
    pending += 1;
    try {
      const record = await lease.load(ROOT + fixture.spec[variant], { slot: fixture.spec.slot });
      if (disposed || !lease.isActive()) return;
      if (!record) { failures += 1; return; }
      const item = instantiate(record, lease, fixture.spec, THREE_NS);
      if (!item) { failures += 1; return; }
      if (disposed || !lease.isActive()) { item.dispose(); return; }
      fixture[variant] = item;
      item.root.name = `Morrowlight_${fixture.spec.id}_${variant}`;
      item.root.visible = variant === (fixture.active ? 'restored' : 'broken');
      if (variant === 'broken' && fixture.spec.id === 'lantern') item.root.rotation.z = -0.16;
      fixture.group.add(item.root);
    } catch (_error) {
      if (!disposed) failures += 1;
    } finally { pending -= 1; }
  })));

  const api = {
    group, renderer, scene, ready,
    get disposed() { return disposed; },
    update(nextState = liveState) {
      if (disposed || !nextState) return;
      liveState = nextState;
      const row = nextState.salvageTender;
      const entityId = salvageTenderBodyForState(nextState)?.id;
      const root = (meshes || nextState.render?.meshes)?.get?.(entityId) || null;
      if (root !== attachedRoot) {
        attachedRoot = root?.isObject3D ? root : null;
      }
      const now = Number.isFinite(nextState.simTime) ? nextState.simTime : 0;
      if (!model || now < lastProjectionAt || now - lastProjectionAt >= 0.2 || row?.revision !== lastRevision) {
        model = getSalvageTenderReadModel(nextState);
        lastProjectionAt = now;
        lastRevision = row?.revision;
      }
      group.visible = !!(model?.visible && attachedRoot?.visible && nextState.mode === 'flight');
      if (!group.visible) { deckLight.intensity = 0; return; }
      // Follow the renderer's interpolated frame-space pose, never the latest simulation pose.
      // Each matrix is reused; world-origin rebases and root swaps therefore remain coherent.
      attachedRoot.updateWorldMatrix(true, false);
      scene?.updateWorldMatrix?.(true, false);
      if (scene?.matrixWorld) inverseScene.copy(scene.matrixWorld).invert();
      else inverseScene.identity();
      group.matrix.multiplyMatrices(inverseScene, attachedRoot.matrixWorld);
      group.matrixWorldNeedsUpdate = true;
      if (nocturne) deckLight.position.set(0.42, 0.5, -0.23).applyMatrix4(attachedRoot.matrixWorld);
      const reduceMotion = nextState.settings?.video?.motionReduce === true;
      const reduceFlash = nextState.settings?.video?.flashReduce === true
        || nextState.settings?.accessibility?.flashReduce === true
        || nextState.settings?.accessibility?.reducedFlash === true;
      const power = model.stage >= 1 && !model.disabled;
      const breathe = reduceMotion || reduceFlash ? 1 : 1 + Math.sin(now * TAU * 0.15) * 0.035;
      deckLight.intensity = power && model.secured ? 18 * breathe : 0;
      for (const fixture of fixtures) {
        const installed = model.stage >= fixture.spec.stage;
        fixture.active = installed;
        // If a healthy asset fails loading, keep the damaged authored section visible until the
        // correct one can be admitted; diagnostics make that limitation explicit.
        if (fixture.broken) fixture.broken.root.visible = !installed || !fixture.restored;
        if (fixture.restored) fixture.restored.root.visible = installed;
        const working = installed && power && model.secured;
        fixture.lamp.material.emissiveIntensity = working ? 1.2 * breathe : 0;
        fixture.group.rotation.y = fixture.spec.id === 'bench' && working && model.service && !model.service.paused && !reduceMotion
          ? Math.sin(now * 1.6) * 0.025 : 0;
      }
    },
    diagnostics() {
      return {
        mounted: fixtures.reduce((sum, fixture) => sum + (fixture.broken ? 1 : 0) + (fixture.restored ? 1 : 0), 0),
        pending, failures, disposed,
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      scene?.remove?.(group);
      attachedRoot = null;
      unbindAudio();
      for (const off of lifecycleUnsubs) if (typeof off === 'function') off();
      lifecycleUnsubs.length = 0;
      if (state && OWNERS.get(state) === api) OWNERS.delete(state);
      if (liveState !== state && liveState && OWNERS.get(liveState) === api) OWNERS.delete(liveState);
      for (const fixture of fixtures) {
        for (const variant of ['broken', 'restored']) {
          const item = fixture[variant];
          if (item) { fixture.group.remove(item.root); item.dispose(); fixture[variant] = null; }
        }
        fixture.lamp.geometry.dispose();
        fixture.lamp.material.dispose();
      }
      deckLight.dispose?.();
      group.clear();
      lease.release('salvage-tender-presentation-disposed');
    },
  };
  // Release synchronously at the owning lifecycle boundary, including a factory created
  // outside the registry wrapper. Deferring this tail could outlive the renderer/context.
  for (const event of ['save:restoring', 'sector:exit', 'salvageTender:reset']) {
    if (bus?.on) lifecycleUnsubs.push(bus.on(event, () => api.dispose()));
  }
  api.update(state);
  return api;
}

/** Registry-facing lifecycle adapters. No render work exists before the tender has a live body. */
export function updateSalvageTenderPresentation(state, bus = null) {
  if (!state) return;
  const renderer = state.render?.renderer;
  const row = state.salvageTender;
  const live = salvageTenderBodyForState(state);
  let owner = OWNERS.get(state);
  if (owner?.disposed) { OWNERS.delete(state); owner = null; }
  if (state.mode !== 'flight' || !renderer || !live || live.alive === false
    || row?.physical?.sectorId !== state.world?.currentSectorId) {
    releaseSalvageTenderPresentation(state);
    return;
  }
  if (owner && (owner.renderer !== renderer || owner.scene !== state.render?.scene)) {
    owner.dispose(); OWNERS.delete(state); owner = null;
  }
  if (!owner) {
    owner = createSalvageTenderPresentation({ state, bus, renderer });
    OWNERS.set(state, owner);
  }
  owner.update(state);
}

export function releaseSalvageTenderPresentation(state) {
  const owner = state && OWNERS.get(state);
  if (!owner) return;
  owner.dispose();
  OWNERS.delete(state);
}

export function salvageTenderPresentationDiagnostics(state) {
  return OWNERS.get(state)?.diagnostics() || NO_DIAGNOSTICS;
}
