import * as THREE from 'three';
import { buildAuthoredPlaceProp, disposeDetachedObject, disposePreparedAuthoredBoundary } from '../../render/partsLibrary.js';
import { readFrameOrigin } from '../../render/frameCoordinates.js';
import { presentedAnchorXZ, presentedAnchorRot } from '../../render/presentedAnchor.js';
import { setPresentationAdmission } from '../../core/presentationAdmission.js';
import { SITE } from './scenarios.js';
import { decodeIndustrialDisasterStatus, installIndustrialDisasterWorkerView,
  sendIndustrialDisasterRequest } from './workerAdapter.js';

const CAPACITY = 3072; // fixed vertices per category; no growing particle pool or object per frame
const LIFT = 1.2;
const PALETTE = Object.freeze({ danger: 0xf1a34d, route: 0xb5dfcf, safe: 0xf1e6bd, broken: 0x948a83 });
const BATCH_NAMES = Object.freeze(Object.keys(PALETTE));
const pointValid = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.z);

/** The stock picker reads the public mesh map; the stock renderer retains its private map and
 * ownership. A read-only Map union exposes exact feature bodies to picking/hover without letting
 * the renderer's _noMesh residency sweep dispose boundaries owned by this adapter. */
export function installIndustrialMeshReadView(renderState, featureMeshes) {
  let base = renderState?.meshes || new Map();
  class ReadMap extends Map {
    get size() { let count = base.size || 0; for (const id of featureMeshes.keys()) if (!base.has(id)) count++; return count; }
    get(id) { return featureMeshes.has(id) ? featureMeshes.get(id) : base.get(id); }
    has(id) { return featureMeshes.has(id) || base.has(id); }
    *entries() { for (const pair of base) if (!featureMeshes.has(pair[0])) yield pair; yield* featureMeshes; }
    *keys() { for (const [id] of this.entries()) yield id; }
    *values() { for (const [, mesh] of this.entries()) yield mesh; }
    [Symbol.iterator]() { return this.entries(); }
    forEach(callback, thisArg) { for (const [id, mesh] of this.entries()) callback.call(thisArg, mesh, id, this); }
    set() { throw new TypeError('Industrial mesh read view is read-only'); }
    delete() { throw new TypeError('Industrial mesh read view is read-only'); }
    clear() { throw new TypeError('Industrial mesh read view is read-only'); }
  }
  const view = new ReadMap();
  const update = () => {
    if (!renderState || renderState.meshes === view) return;
    base = renderState.meshes || base;
    renderState.meshes = view;
  };
  update();
  return { update, dispose() { if (renderState?.meshes === view) renderState.meshes = base; } };
}

function makeBatch(T, color, name) {
  const array = new Float32Array(CAPACITY * 3);
  const geometry = new T.BufferGeometry();
  const attribute = new T.BufferAttribute(array, 3);
  attribute.setUsage(T.DynamicDrawUsage);
  geometry.setAttribute('position', attribute);
  geometry.setDrawRange(0, 0);
  const material = new T.MeshBasicMaterial({ color, side: T.DoubleSide, transparent: true,
    opacity: 0.83, depthWrite: false, toneMapped: false });
  const mesh = new T.Mesh(geometry, material);
  mesh.name = name;
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  return { mesh, geometry, material, attribute, array, used: 0 };
}

function vertex(batch, x, y, z) {
  const i = batch.used * 3;
  batch.array[i] = x; batch.array[i + 1] = y; batch.array[i + 2] = z;
  batch.used++;
}

function rail(batch, ax, az, bx, bz, width, origin, lift = LIFT) {
  if (batch.used + 6 > CAPACITY) return;
  const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
  if (!(len > 0.001)) return;
  const nx = -dz / len * width * 0.5, nz = dx / len * width * 0.5;
  ax -= origin.x; az -= origin.z; bx -= origin.x; bz -= origin.z;
  vertex(batch, ax + nx, lift, az + nz); vertex(batch, ax - nx, lift, az - nz); vertex(batch, bx - nx, lift, bz - nz);
  vertex(batch, ax + nx, lift, az + nz); vertex(batch, bx - nx, lift, bz - nz); vertex(batch, bx + nx, lift, bz + nz);
}

function arc(batch, center, radius, origin, fraction = 1, width = 0.9) {
  const segments = 40;
  for (let i = 0; i < segments * fraction; i++) {
    // Four intentional gaps distinguish the footprint from a solid obstacle.
    if (i % 10 === 0) continue;
    const a = i / segments * Math.PI * 2, b = (i + 1) / segments * Math.PI * 2;
    rail(batch, center.x + Math.cos(a) * radius, center.z + Math.sin(a) * radius,
      center.x + Math.cos(b) * radius, center.z + Math.sin(b) * radius, width, origin);
  }
}

function chevron(batch, x, z, dx, dz, size, origin) {
  const len = Math.hypot(dx, dz) || 1, ux = dx / len, uz = dz / len;
  rail(batch, x - ux * size - uz * size * 0.55, z - uz * size + ux * size * 0.55, x, z, 1.0, origin);
  rail(batch, x - ux * size + uz * size * 0.55, z - uz * size - ux * size * 0.55, x, z, 1.0, origin);
}

/** Exact authored visual descriptors are render objects only. The physical payload object is
 * never replaced or retyped; native physics, Massline and interactions retain its original ID.
 * The stock place adapter accepts only `fx` at its visual boundary, so this view record supplies
 * that visual vocabulary without inserting a second entity into the simulation. */
export function industrialVisualDescriptor(entity) {
  return {
    ...entity, type: 'fx', alive: true, _noMesh: false,
    data: { ...entity.data, poi: true, worldOneOff: true, placeTargetRadius: entity.radius },
    presentationAdmission: 'pending',
  };
}

/** Mount once on the live scene. Call update(alpha) beside other render adapters. The read model
 * provides IDs and geometry; this adapter reads actual native bodies for pose interpolation.
 * buildPlace/disposePlace are injectable only for deterministic focused lifecycle tests. */
export function createIndustrialDisasterView({
  state, scene = state?.render?.scene, renderer = state?.render?.renderer, bus,
  getReadModel = null, THREE_NS = THREE, buildPlace = buildAuthoredPlaceProp,
  disposePlace = disposeDetachedObject,
} = {}) {
  if (!scene?.add || !state?.entities) return { update() {}, dispose() {}, isReady: () => false, diagnostics: () => ({ mounted: 0 }) };
  const root = new THREE_NS.Group();
  root.name = 'IndustrialDisasters_HingeWorks';
  scene.add(root);
  const batches = {};
  for (const name of BATCH_NAMES) {
    batches[name] = makeBatch(THREE_NS, PALETTE[name], `HingeWorks_${name}`);
    root.add(batches[name].mesh);
  }
  const views = new Map(), roles = new Map(), scenery = new Map(), featureMeshes = new Map();
  const meshReadView = installIndustrialMeshReadView(state.render, featureMeshes);
  const origin = { x: 0, z: 0 }, anchor = { x: 0, z: 0 }, refuge = { x: 0, z: 0 };
  const p = { x: 0, z: 0 }, a11y = { reducedMotion: false, reducedFlash: false };
  const workerView = installIndustrialDisasterWorkerView({ state, bus });
  let model = null, disposed = false, lastReady = null, lastReadyCycle = null, lastReadyEpoch = null, epoch = 0, readAt = -Infinity;
  const onStatus = (next) => {
    const decoded = workerView.isWorker() ? workerView.readModel() : decodeIndustrialDisasterStatus(next);
    if (!decoded || (model && (decoded.presentationEpoch || 0) < (model.presentationEpoch || 0))) return;
    model = decoded; syncBodies(model);
  };

  function build(descriptor) {
    try { return buildPlace(descriptor, { releaseMode: true, state }); }
    catch (_) { descriptor.presentationAdmission = 'unavailable'; return null; }
  }

  function requestUpgrade(visual, descriptor) {
    const request = visual.userData.requestAuthoredUpgrade;
    if (typeof request !== 'function' || !renderer) return;
    try {
      const promise = request(renderer, scene, { admissionVisible: true });
      if (promise?.catch) promise.catch(() => { if (!disposed) descriptor.presentationAdmission = 'unavailable'; });
    } catch (_) { descriptor.presentationAdmission = 'unavailable'; }
  }

  function mountScenery() {
    if (scenery.size) return;
    const specs = [
      // These are structural silhouettes BELOW the flight plane, never counterfeit targets.
      { role: 'works-floor', assetId: SITE.assetId, x: -30, z: 85, y: -100, radius: 40 },
      { role: 'refuge-dock', assetId: SITE.refugeAssetId, x: SITE.safeBerth.x, z: SITE.safeBerth.z, y: -50, radius: 20 },
    ];
    for (const spec of specs) {
      const descriptor = { id: `industrial-scenery:${spec.role}`, type: 'fx', alive: true,
        pos: { x: SITE.anchor.x + spec.x, z: SITE.anchor.z + spec.z }, rot: 0, radius: spec.radius,
        data: { placeId: spec.assetId, poi: true, worldOneOff: true, placeTargetRadius: spec.radius,
          sectorId: SITE.sectorId }, presentationAdmission: 'pending' };
      const visual = build(descriptor);
      if (!visual?.isObject3D) continue;
      visual.name = `HingeWorks_Context_${spec.role}`;
      root.add(visual);
      scenery.set(spec.role, { root: visual, descriptor, y: spec.y });
      requestUpgrade(visual, descriptor);
    }
  }

  function removeView(id) {
    const view = views.get(id);
    if (!view) return;
    if (featureMeshes.get(id) === view.root) featureMeshes.delete(id);
    view.descriptor.alive = false; // cancels the existing authored owner before any late swap
    view.root.userData.admissionEpoch = (view.root.userData.admissionEpoch || 0) + 1;
    root.remove(view.root);
    view.root.userData.releaseAuthoredAssetResidency?.('industrial-site-retired');
    const prepared = disposePreparedAuthoredBoundary(view.root);
    if (prepared?.catch) prepared.catch(() => {});
    disposePlace(view.root, state);
    if (state.entities.get(id) === view.entity && view.entity.alive !== false) setPresentationAdmission(view.entity, 'pending');
    views.delete(id);
  }

  function syncBodies(next) {
    if (disposed) return;
    const source = Array.isArray(next?.bodies) ? next.bodies : [];
    if (source.length || (next?.discovered && next?.near !== false)) mountScenery();
    const wanted = new Set();
    roles.clear();
    for (let i = 0; i < source.length && i < 24; i++) {
      const row = source[i], id = row?.id ?? row?.entityId;
      const entity = state.entities.get(id);
      if (!entity || entity.alive === false || !entity.data?.placeId) continue;
      wanted.add(id);
      roles.set(row.role || entity.data.industrialDisasterRole, entity);
      let view = views.get(id);
      if (view && (view.entity !== entity || view.assetId !== entity.data.placeId)) { removeView(id); view = null; }
      if (view) continue;
      const descriptor = industrialVisualDescriptor(entity);
      const visual = build(descriptor);
      if (!visual?.isObject3D) { setPresentationAdmission(entity, 'unavailable'); continue; }
      visual.name = `HingeWorks_${row.role || id}_${entity.data.placeId}`;
      // Deliberately do not stamp presentationEntityId: boundaryLiveEntity must keep the render
      // descriptor as the visual owner instead of switching its type back to the native payload.
      visual.userData.industrialOriginalEntityId = id;
      root.add(visual);
      view = { entity, descriptor, root: visual, assetId: entity.data.placeId, status: 'pending' };
      views.set(id, view);
      featureMeshes.set(id, visual);
      lastReady = null;
      setPresentationAdmission(entity, 'pending');
      requestUpgrade(visual, descriptor);
    }
    for (const [id] of views) if (!wanted.has(id)) removeView(id);
  }

  function drawReadability(alpha) {
    for (const name of BATCH_NAMES) batches[name].used = 0;
    if (!model || model.hidden || model.near === false) return;
    const siteAnchor = model.anchor || SITE.anchor;
    anchor.x = siteAnchor.x; anchor.z = siteAnchor.z;
    refuge.x = anchor.x + SITE.safeBerth.x; refuge.z = anchor.z + SITE.safeBerth.z;
    // A refuge is a three-sided receiving bracket, visibly open on the approach side.
    const r = SITE.safeRadius;
    rail(batches.safe, refuge.x - r, refuge.z - r, refuge.x + r, refuge.z - r, 1.3, origin);
    rail(batches.safe, refuge.x + r, refuge.z - r, refuge.x + r, refuge.z + r, 1.3, origin);
    rail(batches.safe, refuge.x + r, refuge.z + r, refuge.x - r, refuge.z + r, 1.3, origin);
    chevron(batches.safe, refuge.x + 3, refuge.z, 1, 0, 6, origin);
    for (const hazard of model.hazards || []) {
      const entity = roles.get(hazard.role);
      if (!entity || entity.alive === false || !(hazard.radius > 0)) continue;
      presentedAnchorXZ(entity, alpha, p);
      arc(batches.danger, p, hazard.radius, origin);
      // Heading is the actual current velocity, not an authored prediction that ignores a tow.
      const vx = Number(entity.vel?.x) || 0, vz = Number(entity.vel?.z) || 0;
      const speed = Math.hypot(vx, vz);
      if (speed > 0.25) {
        const reach = Math.min(65, speed * 9), dx = vx / speed * reach, dz = vz / speed * reach;
        rail(batches.danger, p.x, p.z, p.x + dx, p.z + dz, 0.9, origin);
        chevron(batches.danger, p.x + dx, p.z + dz, dx, dz, 5, origin);
      }
    }
    const time = a11y.reducedMotion || a11y.reducedFlash ? 0 : (Number(state.simTime) || 0);
    for (const path of model.paths || []) {
      if (!pointValid(path.from) || !pointValid(path.to)) continue;
      const batch = path.blocked ? batches.danger : batches.route;
      const dx = path.to.x - path.from.x, dz = path.to.z - path.from.z, length = Math.hypot(dx, dz) || 1;
      const half = Number(path.halfWidth) || 9, nx = -dz / length * half, nz = dx / length * half;
      rail(batch, path.from.x + nx, path.from.z + nz, path.to.x + nx, path.to.z + nz, 0.7, origin);
      rail(batch, path.from.x - nx, path.from.z - nz, path.to.x - nx, path.to.z - nz, 0.7, origin);
      for (let i = 0; i < 4; i++) {
        const t = ((i / 4) + (path.blocked ? 0 : time * 0.06)) % 1;
        chevron(batch, path.from.x + dx * t, path.from.z + dz * t, dx, dz, 4, origin);
      }
      if (path.blocked) {
        const x = (path.from.x + path.to.x) / 2, z = (path.from.z + path.to.z) / 2;
        rail(batch, x - 5, z - 5, x + 5, z + 5, 1.1, origin);
        rail(batch, x - 5, z + 5, x + 5, z - 5, 1.1, origin);
      }
    }
    for (const connection of model.connections || []) {
      if (!connection.connected || !pointValid(connection.from) || !pointValid(connection.to)) continue;
      // Parallel conductors show a live physical relationship. Disconnection removes the span;
      // an isolated skid never retains a cosmetic arc implying that it still feeds machinery.
      const from = roles.get(connection.fromRole), to = roles.get(connection.toRole);
      const ax = from?.pos?.x ?? connection.from.x, az = from?.pos?.z ?? connection.from.z;
      const bx = to?.pos?.x ?? connection.to.x, bz = to?.pos?.z ?? connection.to.z;
      rail(batches.danger, ax, az - 0.8, bx, bz - 0.8, 0.65, origin, 2.4);
      rail(batches.danger, ax, az + 0.8, bx, bz + 0.8, 0.65, origin, 2.4);
    }
    for (const row of model.bodies || []) {
      if (!['disabled', 'damaged', 'lost', 'destroyed', 'stranded'].includes(row.status)) continue;
      const entity = roles.get(row.role);
      if (!entity?.pos) continue;
      presentedAnchorXZ(entity, alpha, p);
      const size = Math.max(3, (Number(entity.radius) || 3) * 0.65);
      const batch = row.status === 'lost' || row.status === 'destroyed' ? batches.broken : batches.safe;
      rail(batch, p.x - size, p.z - size, p.x + size, p.z + size, 1.1, origin, 2.8);
      if (row.status === 'lost' || row.status === 'destroyed') rail(batch, p.x - size, p.z + size, p.x + size, p.z - size, 1.1, origin, 2.8);
    }
    // A recorded loss remains a modest witness mark by the original bay even after the next
    // incident. These are fixed warning marks, never replacement people, cargo or salvage.
    const history = model.history || [];
    for (let i = 0; i < history.length && i < 3; i++) {
      const receipt = history[i];
      const lost = (receipt.people?.lost || 0) + (receipt.equipment?.lost || 0) + (receipt.cargo?.lost || 0);
      if (!lost) continue;
      const x = anchor.x - 45 + i * 13, z = anchor.z + 85;
      rail(batches.broken, x - 4, z - 4, x + 4, z + 4, 1.2, origin);
      rail(batches.broken, x - 4, z + 4, x + 4, z - 4, 1.2, origin);
    }
  }

  function update(alpha = 1) {
    if (disposed) return;
    meshReadView.update();
    workerView.update();
    const now = Number(state.simTime) || 0;
    if ((getReadModel || workerView.isWorker()) && (!model || now - readAt >= 0.25 || now < readAt)) {
      readAt = now;
      const next = workerView.isWorker() ? workerView.readModel() : getReadModel(state);
      if (next) { model = next; syncBodies(next); }
    }
    root.visible = state.world?.currentSectorId === SITE.sectorId && !!model && !model.hidden;
    if (!root.visible) return;
    readFrameOrigin(state, origin);
    a11y.reducedMotion = state.settings?.video?.motionReduce === true;
    a11y.reducedFlash = state.settings?.accessibility?.flashReduce === true;
    let sceneryReady = scenery.size === 2;
    for (const view of scenery.values()) {
      view.root.position.set(view.descriptor.pos.x - origin.x, view.y, view.descriptor.pos.z - origin.z);
      if (view.root.matrixAutoUpdate === false) view.root.updateMatrix();
      sceneryReady = sceneryReady && view.descriptor.presentationAdmission === 'ready'
        && view.root.userData.authoredAssetState === 'authored';
    }
    const expectedBodies = (model.bodies || []).filter((body) => body.alive !== false).length;
    let ready = sceneryReady && views.size === expectedBodies;
    for (const [id, view] of views) {
      const entity = state.entities.get(id);
      if (entity !== view.entity || entity?.alive === false) { ready = false; continue; }
      presentedAnchorXZ(entity, alpha, p);
      view.root.position.set(p.x - origin.x, Number(entity.pos?.y) || 0, p.z - origin.z);
      view.root.rotation.y = -presentedAnchorRot(entity, alpha);
      // Authored place boundaries freeze local matrices after composition. Updating position
      // alone leaves the real GLB at its old pose even though a plain test Group would move.
      if (view.root.matrixAutoUpdate === false) view.root.updateMatrix();
      view.descriptor.pos = entity.pos;
      view.descriptor.rot = entity.rot;
      const authored = view.root.userData.authoredAssetState;
      const admitted = sceneryReady && view.descriptor.presentationAdmission === 'ready'
        && authored === 'authored' && view.root.userData.pipelinesPending !== true;
      const status = admitted ? 'ready' : view.descriptor.presentationAdmission === 'unavailable' ? 'unavailable' : 'pending';
      setPresentationAdmission(entity, status);
      ready = ready && admitted;
      view.status = status;
      view.root.userData.updateAuthoredMotion?.(entity, state.simTime || 0, a11y, state);
      view.root.userData.updateWorldSitePresentation?.(entity, state.simTime || 0, a11y);
    }
    const cycle = model?.cycle ?? model?.attempt;
    const presentationEpoch = model?.presentationEpoch || 0;
    if (ready !== lastReady || cycle !== lastReadyCycle || presentationEpoch !== lastReadyEpoch) {
      lastReady = ready;
      lastReadyCycle = cycle; lastReadyEpoch = presentationEpoch;
      sendIndustrialDisasterRequest(bus, 'industrialDisasters:presentationReady', { ready, siteId: SITE.id, cycle, epoch: presentationEpoch });
    }
    drawReadability(alpha);
    for (const name of BATCH_NAMES) {
      const batch = batches[name];
      batch.attribute.needsUpdate = true;
      batch.geometry.setDrawRange(0, batch.used);
      batch.mesh.visible = batch.used > 0;
      batch.material.opacity = a11y.reducedFlash ? 0.72 : 0.83;
    }
  }

  function clear() {
    if (model && Number.isInteger(model.cycle)) {
      sendIndustrialDisasterRequest(bus, 'industrialDisasters:presentationReady', {
        siteId: SITE.id, ready: false, cycle: model.cycle, epoch: model.presentationEpoch || 0,
      });
    }
    epoch++;
    for (const [id] of views) removeView(id);
    for (const view of scenery.values()) {
      view.descriptor.alive = false;
      root.remove(view.root);
      view.root.userData.releaseAuthoredAssetResidency?.('industrial-scenery-retired');
      const prepared = disposePreparedAuthoredBoundary(view.root);
      if (prepared?.catch) prepared.catch(() => {});
      disposePlace(view.root, state);
    }
    scenery.clear();
    roles.clear(); model = null; lastReady = null; lastReadyCycle = null; lastReadyEpoch = null;
    readAt = -Infinity;
    for (const name of BATCH_NAMES) batches[name].geometry.setDrawRange(0, 0);
  }
  bus?.on?.('industrialDisasters:status', onStatus);
  bus?.on?.('sector:exit', clear);
  bus?.on?.('save:loaded', clear);
  bus?.on?.('game:new', clear);
  bus?.on?.('game:newGame', clear);
  return {
    update,
    isReady: () => lastReady === true,
    diagnostics: () => ({ mounted: views.size, scenery: scenery.size, ready: lastReady === true,
      unavailable: [...views.values()].filter((view) => view.status === 'unavailable').map((view) => view.assetId),
      markerDraws: Object.values(batches).filter((batch) => batch.used > 0).length }),
    dispose() {
      if (disposed) return;
      clear(); disposed = true;
      workerView.dispose();
      meshReadView.dispose();
      bus?.off?.('industrialDisasters:status', onStatus);
      bus?.off?.('sector:exit', clear);
      bus?.off?.('save:loaded', clear);
      bus?.off?.('game:new', clear);
      bus?.off?.('game:newGame', clear);
      scene.remove(root);
      for (const name of BATCH_NAMES) { batches[name].geometry.dispose(); batches[name].material.dispose(); }
    },
  };
}
