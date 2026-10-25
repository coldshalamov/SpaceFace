// Presentation only. The six physical bodies travel through the existing
// authored-place admission, material, LOD and teardown owners. This adapter adds
// a bounded set of world-space connection/clearance marks to that SAME scene.
import * as THREE from 'three';
import { buildAuthoredPlaceProp } from '../../render/partsLibrary.js';
import { setPresentationAdmission } from '../../core/presentationAdmission.js';
import { PARTS } from './parts.js';

const CAPACITY = 384;
const OVERLAY_Y = 4;
const MAX_DISTANCE_SQ = 650 * 650;
const sceneMounts = new WeakMap();
const OWNED_PLACE_IDS = new Set([
  ...Object.values(PARTS).map((part) => part.placeId),
  'place_cargo_pod_standard', 'place_cargo_pod_hazmat', 'place_maintenance_gantry',
]);
const COLORS = Object.freeze({
  holding: 0x9bbfb4, valid: 0xceeadd, warning: 0xffb65e,
  broken: 0xff795e, bench: 0xd6bd83, cargo: 0xe7d9ab,
});

export function isRigWorkshopBody(entity) {
  const meta = entity?.data?.rigWorkshop;
  return (!!meta && !!PARTS[meta.partType])
    || (entity?.data?.rigWorkshopOwner != null && OWNED_PLACE_IDS.has(entity.data.placeId));
}

/** Insert before the generic `payload` case in the existing visual factory.
 * The returned stable boundary is owned/disposed exactly like other authored
 * entities; there is no parallel mesh registry or duplicate visual body. */
export function buildRigWorkshopBody(entity, options = {}) {
  if (!isRigWorkshopBody(entity)) return null;
  // The shared place wrapper admits fx/known machinery, while these physical
  // bodies intentionally remain native payloads. A render-only facade selects
  // that existing admission path. All live fields still resolve on the original
  // object; there is no second entity or second physics registration.
  const visualEntity = Object.create(entity);
  Object.defineProperty(visualEntity, 'type', { value: 'fx' });
  // Preserve the shared owner's one pending/ready receipt through the facade.
  // This is the same presentation-only token the authored loader publishes.
  Object.defineProperty(visualEntity, 'presentationAdmission', {
    get: () => entity.presentationAdmission,
    set: (value) => { setPresentationAdmission(entity, value); },
  });
  const boundary = buildAuthoredPlaceProp(visualEntity, options);
  if (boundary?.userData) {
    boundary.userData.presentationEntityId = entity.id;
    boundary.userData.presentationEntityType = entity.type;
    boundary.userData.presentationOccupantGeneration = entity.occupantGeneration;
    boundary.userData.rigWorkshopBody = true;
  }
  return boundary;
}

/** For the renderer's existing per-frame owner. Pass its global-XZ -> render-
 * local converter; the default is suitable only when the scene origin is zero.
 * No animations, pulses, camera changes or flashes are used, so reduced motion
 * and reduced flash retain all the same functional information. */
export function createRigWorkshopRender({ scene, toLocalXZ = identityXZ } = {}) {
  if (scene) sceneMounts.get(scene)?.dispose();
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff, vertexColors: false, transparent: true, opacity: 0.8,
    depthWrite: false, depthTest: true, toneMapped: false,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, CAPACITY);
  mesh.name = 'SF_RigWorkshopConnectionMarks';
  mesh.userData.rigWorkshopPresentation = true;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.renderOrder = 15;
  mesh.count = 0;
  mesh.visible = false;
  scene?.add?.(mesh);
  const pose = new THREE.Object3D();
  const color = new THREE.Color();
  mesh.setColorAt(0, color); // Allocate the fixed instance-color buffer at mount.
  const a = { x: 0, z: 0 }, b = { x: 0, z: 0 };
  const start = { x: 0, z: 0 }, end = { x: 0, z: 0 };
  let count = 0;
  let disposed = false;
  let bodies = null;
  let playerPosition = null;

  function get(id) { return bodies?.get ? bodies.get(id) : bodies?.[id]; }
  function near(pos) {
    return validPosition(pos) && (!playerPosition
      || (pos.x - playerPosition.x) ** 2 + (pos.z - playerPosition.z) ** 2 <= MAX_DISTANCE_SQ);
  }

  function stroke(ax, az, bx, bz, tint, width = 0.75) {
    if (count >= CAPACITY || !Number.isFinite(ax + az + bx + bz)) return;
    toLocalXZ(ax, az, a);
    toLocalXZ(bx, bz, b);
    const dx = b.x - a.x, dz = b.z - a.z;
    const length = Math.hypot(dx, dz);
    if (!(length > 0.01)) return;
    pose.position.set((a.x + b.x) * 0.5, OVERLAY_Y, (a.z + b.z) * 0.5);
    pose.rotation.set(0, -Math.atan2(dz, dx), 0);
    pose.scale.set(length, 0.28, width);
    pose.updateMatrix();
    mesh.setMatrixAt(count, pose.matrix);
    color.setHex(tint);
    mesh.setColorAt(count, color);
    count += 1;
  }

  function localStroke(cx, cz, rot, ax, az, bx, bz, tint, width = 0.75) {
    const c = Math.cos(rot), s = Math.sin(rot);
    stroke(cx + ax * c - az * s, cz + ax * s + az * c,
      cx + bx * c - bz * s, cz + bx * s + bz * c, tint, width);
  }

  function bracket(x, z, radius, rot, tint, invalid = false) {
    const r = Math.max(3, radius);
    const t = r * 0.42;
    for (let side = -1; side <= 1; side += 2) {
      for (let endSign = -1; endSign <= 1; endSign += 2) {
        localStroke(x, z, rot, side * r, endSign * r,
          side * (r - t), endSign * r, tint);
        localStroke(x, z, rot, side * r, endSign * r,
          side * r, endSign * (r - t), tint);
      }
    }
    if (invalid) {
      localStroke(x, z, rot, -r * 0.45, -r * 0.45, r * 0.45, r * 0.45, tint, 1.1);
      localStroke(x, z, rot, -r * 0.45, r * 0.45, r * 0.45, -r * 0.45, tint, 1.1);
    }
  }

  function connection(ax, az, bx, bz, stress, broken) {
    const dx = bx - ax, dz = bz - az;
    const length = Math.hypot(dx, dz);
    if (!(length > 0.1)) return;
    const tint = broken ? COLORS.broken : stress >= 0.65 ? COLORS.warning : COLORS.holding;
    if (broken) {
      stroke(ax, az, ax + dx * 0.3, az + dz * 0.3, tint);
      stroke(ax + dx * 0.7, az + dz * 0.7, bx, bz, tint);
    } else {
      stroke(ax, az, bx, bz, tint);
    }
    // Notch count supplies the same warning without depending on hue. A break
    // opens the line; real tension adds one, two, then three load notches.
    const notches = broken ? 1 : stress >= 0.9 ? 3 : stress >= 0.65 ? 2 : 0;
    const nx = -dz / length, nz = dx / length;
    for (let i = 0; i < notches; i += 1) {
      const t = 0.5 + (i - (notches - 1) * 0.5) * Math.min(0.2, 3 / length);
      const x = ax + dx * t, z = az + dz * t;
      stroke(x - nx * 3, z - nz * 3, x + nx * 3, z + nz * 3, tint, 1);
    }
  }

  function update(state = {}) {
    if (disposed) return;
    count = 0;
    const workshop = state.rigWorkshop;
    bodies = state.entities;
    const player = get(state.playerId);
    playerPosition = player?.pos || null;
    const homeSector = workshop?.bench?.sectorId;
    const currentSector = state.world?.currentSectorId;
    const active = workshop && (!state.mode || state.mode === 'flight') && !state.ui?.docked
      && (homeSector == null || currentSector == null || homeSector === currentSector);
    if (active) {
      const attachments = state.combat?.attachments?.byId;
      for (const rig of workshop.rigs || []) {
        if (rig.id !== workshop.activeRigId) continue;
        for (const edge of rig.connections || []) {
          const parent = get(edge.parentId), child = get(edge.childId);
          if (!parent?.pos || !child?.pos || (!near(parent.pos) && !near(child.pos))) continue;
          if (!matchesBodyToken(parent, edge.parentToken) || !matchesBodyToken(child, edge.childToken)) continue;
          let exact = false;
          for (const id of edge.attachmentIds || []) {
            const link = attachments?.[id];
            if (!link || link.state !== 'active') continue;
            const owner = get(link.ownerId), target = get(link.targetId);
            if (!owner?.pos || !target?.pos) continue;
            if ((link.ownerGeneration != null && owner.occupantGeneration != null
              && link.ownerGeneration !== owner.occupantGeneration)
              || (link.targetGeneration != null && target.occupantGeneration != null
                && link.targetGeneration !== target.occupantGeneration)) continue;
            anchorWorld(owner, link.sourceAnchorLocal, start);
            anchorWorld(target, link.targetAnchorLocal, end);
            connection(start.x, start.z, end.x, end.z, edge.stress || 0, false);
            exact = true;
          }
          if (!exact && edge.state === 'broken') connection(parent.pos.x, parent.pos.z,
            child.pos.x, child.pos.z, 1, true);
          if (!exact && edge.state === 'pending') {
            const dx = child.pos.x - parent.pos.x, dz = child.pos.z - parent.pos.z;
            for (let i = 0; i < 3; i += 1) {
              const t = (i + 0.15) / 3;
              stroke(parent.pos.x + dx * t, parent.pos.z + dz * t,
                parent.pos.x + dx * (t + 0.18), parent.pos.z + dz * (t + 0.18), COLORS.bench);
            }
          }
        }
        for (const id of rig.partIds || []) {
          const body = get(id);
          if (!body?.pos || !near(body.pos)) continue;
          if (body.alive === false || (body.hullMax > 0 && body.hull < body.hullMax * 0.6)) {
            bracket(body.pos.x, body.pos.z, (body.radius || 7) + 2, body.rot || 0,
              body.alive === false ? COLORS.broken : COLORS.warning, body.alive === false);
          }
          const throttle = Number(body.data?.rigWorkshop?.throttle) || 0;
          if (body.alive !== false && rig.power && Math.abs(throttle) > 0.01
            && body.data?.rigWorkshop?.partType === 'mover') {
            const r = (body.radius || 6) + 3;
            const direction = Math.sign(throttle);
            localStroke(body.pos.x, body.pos.z, body.rot || 0, -r * direction, -3,
              (-r - 6) * direction, 0, COLORS.valid);
            localStroke(body.pos.x, body.pos.z, body.rot || 0, -r * direction, 3,
              (-r - 6) * direction, 0, COLORS.valid);
          }
        }
      }
      const preview = workshop.preview;
      if (preview?.pos && near(preview.pos)) {
        const part = PARTS[preview.partType];
        const radius = part?.radius || 8;
        const tint = preview.valid ? COLORS.valid : COLORS.broken;
        bracket(preview.pos.x, preview.pos.z, radius, preview.rot || 0, tint, !preview.valid);
        // The preview traces the same normalized collision sections admitted by
        // physics. In particular, a cradle is visibly open, not a filled box.
        for (const shape of part?.collision?.primitives || []) {
          if (shape.kind !== 'obb') continue;
          const bodyCos = Math.cos(preview.rot || 0), bodySin = Math.sin(preview.rot || 0);
          const x = preview.pos.x + radius * (shape.x * bodyCos - shape.z * bodySin);
          const z = preview.pos.z + radius * (shape.x * bodySin + shape.z * bodyCos);
          const rot = (preview.rot || 0) + (shape.angle || 0);
          const hx = shape.hx * radius, hz = shape.hz * radius;
          localStroke(x, z, rot, -hx, -hz, hx, -hz, tint, 0.5);
          localStroke(x, z, rot, hx, -hz, hx, hz, tint, 0.5);
          localStroke(x, z, rot, hx, hz, -hx, hz, tint, 0.5);
          localStroke(x, z, rot, -hx, hz, -hx, -hz, tint, 0.5);
        }
        const parent = get(preview.parentId);
        if (parent?.pos) {
          const dx = preview.pos.x - parent.pos.x, dz = preview.pos.z - parent.pos.z;
          const length = Math.hypot(dx, dz) || 1;
          const inset = Math.min(length * 0.4, Number(parent.radius) || 0);
          connection(parent.pos.x + dx / length * inset, parent.pos.z + dz / length * inset,
            preview.pos.x - dx / length * radius * 0.8,
            preview.pos.z - dz / length * radius * 0.8, 0, !preview.valid);
        }
      }
      if (near(workshop.bench?.pos)) {
        bracket(workshop.bench.pos.x, workshop.bench.pos.z, 34, 0, COLORS.bench);
      }
      const jobs = workshop.jobs;
      let job = jobs?.[workshop.activeJobId];
      if (Array.isArray(jobs)) {
        job = null;
        for (let i = 0; i < jobs.length; i += 1) {
          if (jobs[i].id === workshop.activeJobId) { job = jobs[i]; break; }
        }
      }
      if (job && job.stage !== 'completed' && job.stage !== 'settled') {
        if (near(job.destination)) bracket(job.destination.x, job.destination.z,
          Number(job.deliveryRadius) || 75, 0, COLORS.cargo);
        for (const id of job.cargoIds || []) {
          const cargo = get(id);
          if (!cargo?.pos || cargo.alive === false || !near(cargo.pos)) continue;
          bracket(cargo.pos.x, cargo.pos.z, (cargo.radius || 8) + 3,
            cargo.rot || 0, COLORS.cargo);
        }
      }
    }
    const changed = mesh.count !== count;
    mesh.count = count;
    mesh.visible = count > 0;
    if (count || changed) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  const api = {
    mesh, update,
    dispose() {
      if (disposed) return;
      disposed = true;
      mesh.removeFromParent();
      geometry.dispose();
      material.dispose();
      mesh.dispose();
      if (scene && sceneMounts.get(scene) === api) sceneMounts.delete(scene);
    },
  };
  if (scene) sceneMounts.set(scene, api);
  return api;
}

function identityXZ(x, z, out) { out.x = x; out.z = z; return out; }
function validPosition(pos) { return !!pos && Number.isFinite(pos.x) && Number.isFinite(pos.z); }
function matchesBodyToken(body, expected) {
  return !expected || expected === (body?.data?.rigWorkshop?.token
    || body?.data?.rigWorkshopCargo?.token || body?.data?.worldRecordId);
}
function anchorWorld(body, anchor, out) {
  const x = Number(anchor?.x) || 0, z = Number(anchor?.z) || 0;
  const c = Math.cos(body.rot || 0), s = Math.sin(body.rot || 0);
  out.x = body.pos.x + x * c - z * s;
  out.z = body.pos.z + x * s + z * c;
  return out;
}
