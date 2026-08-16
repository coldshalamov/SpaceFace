import * as THREE from 'three';

// Plan 15 event tells are short-lived, hard world-space geometry. Each family owns one fixed pool
// and two draw surfaces (opaque tapered blades + hard linework); event bursts never allocate scene
// objects, materials, geometries, or typed arrays. Hidden pools draw nothing when dormant.
export const PD_INTERCEPT_TELL_CAPACITY = 12;
export const TENDER_WELD_TELL_CAPACITY = 12;

const PD_BLADES_PER_TELL = 2;
const PD_LINES_PER_TELL = 3;
const JACKAL_MINE_WAKE_CAPACITY = 24;
const JACKAL_MINE_WAKE_LINES = 4;
const JACKAL_MINE_WAKE_BLADES = 3;
const WELD_BARS_PER_TELL = 4;
const WELD_LINES_PER_TELL = 6;
const PD_LIFE_S = 0.72;
const WELD_LIFE_S = 0.82;

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function smoothstep01(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function createTaperedBladeGeometry(name) {
  // A fabricated clamp blade: broad rooted heel, narrowed working tip, real thickness. This avoids
  // both camera-facing cards and a generic glowing primitive carrying the interception silhouette.
  const positions = new Float32Array([
    -0.50, -0.50, -0.50,  -0.50, 0.50, -0.50,  -0.50, 0.50, 0.50,  -0.50, -0.50, 0.50,
     0.50, -0.22, -0.22,   0.50, 0.22, -0.22,   0.50, 0.22, 0.22,   0.50, -0.22, 0.22,
  ]);
  const indices = [
    0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6,
    0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2,
    2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0,
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.name = name;
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function makeSlots(capacity) {
  const slots = new Array(capacity);
  for (let index = 0; index < capacity; index++) {
    slots[index] = {
      alive: false,
      age: 0,
      life: 0,
      x: 0,
      z: 0,
      angle: 0,
      radius: 0,
      reducedMotion: false,
      sourceId: null,
      targetId: null,
      eventTick: 0,
    };
  }
  return slots;
}

function createLineSurface(name, segmentCapacity, color) {
  const positions = new Float32Array(segmentCapacity * 2 * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.name = `${name}Geometry`;
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setDrawRange(0, 0);
  const material = new THREE.LineBasicMaterial({ name, color, toneMapped: false });
  const mesh = new THREE.LineSegments(geometry, material);
  mesh.name = name;
  mesh.visible = false;
  mesh.frustumCulled = false;
  return { mesh, geometry, material, positions };
}

function createBladeSurface(name, instanceCapacity, color, emissive, emissiveIntensity) {
  const geometry = createTaperedBladeGeometry(`${name}Geometry`);
  const material = new THREE.MeshStandardMaterial({
    name,
    color,
    emissive,
    emissiveIntensity,
    roughness: 0.34,
    metalness: 0.46,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, instanceCapacity);
  mesh.name = name;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0;
  mesh.visible = false;
  mesh.frustumCulled = false;
  return { mesh, geometry, material };
}

export function createSpecialistWorldTellSystem(scene) {
  if (!scene || typeof scene.add !== 'function') return null;
  const group = new THREE.Group();
  group.name = 'Plan15SpecialistHardWorldTells';
  group.userData.presentationScope = 'plan15-specialist-event-components';
  group.userData.worldSpaceGeometry = true;

  const pdBlades = createBladeSurface(
    'PdInterceptTaperedClampBlades',
    PD_INTERCEPT_TELL_CAPACITY * PD_BLADES_PER_TELL,
    0xffd08a,
    0xff7b22,
    3.8,
  );
  const pdLines = createLineSurface(
    'PdInterceptHardCrossfireLines',
    PD_INTERCEPT_TELL_CAPACITY * PD_LINES_PER_TELL,
    0xffe1a8,
  );
  const mineWakeLines = createLineSurface(
    'JackalMinePhysicsWakeRails',
    JACKAL_MINE_WAKE_CAPACITY * JACKAL_MINE_WAKE_LINES,
    0xffa94f,
  );
  const mineWakeBlades = createBladeSurface(
    'JackalMinePhysicsWakeFletching',
    JACKAL_MINE_WAKE_CAPACITY * JACKAL_MINE_WAKE_BLADES,
    0xffb457,
    0xff6d1f,
    2.9,
  );
  const weldBars = createBladeSurface(
    'TenderGreenWeldTongues',
    TENDER_WELD_TELL_CAPACITY * WELD_BARS_PER_TELL,
    0x71ffc1,
    0x10e477,
    3.2,
  );
  const weldLines = createLineSurface(
    'TenderGreenWeldStitchLines',
    TENDER_WELD_TELL_CAPACITY * WELD_LINES_PER_TELL,
    0x9effce,
  );

  group.add(pdBlades.mesh, pdLines.mesh, mineWakeBlades.mesh, mineWakeLines.mesh, weldBars.mesh, weldLines.mesh);
  scene.add(group);
  return {
    group,
    pdBlades,
    pdLines,
    mineWakeBlades,
    mineWakeLines,
    weldBars,
    weldLines,
    pdSlots: makeSlots(PD_INTERCEPT_TELL_CAPACITY),
    weldSlots: makeSlots(TENDER_WELD_TELL_CAPACITY),
    pdCursor: 0,
    weldCursor: 0,
    activePd: 0,
    activeWeld: 0,
    matrix: new THREE.Matrix4(),
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    scale: new THREE.Vector3(),
    yAxis: new THREE.Vector3(0, 1, 0),
    mineLocal: { x: 0, z: 0 },
  };
}

function claimSlot(system, family) {
  const slots = family === 'pd' ? system.pdSlots : system.weldSlots;
  let cursor = family === 'pd' ? system.pdCursor : system.weldCursor;
  let index = -1;
  for (let offset = 0; offset < slots.length; offset++) {
    const candidate = (cursor + offset) % slots.length;
    if (!slots[candidate].alive) {
      index = candidate;
      break;
    }
  }
  if (index < 0) index = cursor;
  const slot = slots[index];
  if (!slot.alive) {
    if (family === 'pd') system.activePd++;
    else system.activeWeld++;
  }
  slot.alive = true;
  slot.age = 0;
  if (family === 'pd') system.pdCursor = (index + 1) % slots.length;
  else system.weldCursor = (index + 1) % slots.length;
  return slot;
}

export function spawnPdInterceptTell(system, receipt, localPosition, angle = 0, reducedMotion = false) {
  if (!system || !localPosition) return false;
  const slot = claimSlot(system, 'pd');
  slot.life = PD_LIFE_S;
  slot.x = Number(localPosition.x) || 0;
  slot.z = Number(localPosition.z) || 0;
  slot.angle = Number(angle) || 0;
  slot.radius = 0;
  slot.reducedMotion = !!reducedMotion;
  slot.sourceId = receipt ? (receipt.sourceId ?? receipt.shooterId ?? null) : null;
  slot.targetId = receipt ? (receipt.defenderId ?? null) : null;
  slot.eventTick = Math.max(0, Math.trunc(Number(receipt && receipt.tick) || 0));
  return true;
}

export function spawnTenderWeldTell(system, receipt, targetLocal, droneLocal, radius = 8, reducedMotion = false) {
  if (!system || !targetLocal) return false;
  const slot = claimSlot(system, 'weld');
  const dx = targetLocal.x - (droneLocal && Number(droneLocal.x) || targetLocal.x - 1);
  const dz = targetLocal.z - (droneLocal && Number(droneLocal.z) || targetLocal.z);
  slot.life = WELD_LIFE_S;
  slot.x = Number(targetLocal.x) || 0;
  slot.z = Number(targetLocal.z) || 0;
  slot.angle = Math.atan2(dz, dx);
  slot.radius = Math.max(3, Math.min(24, Number(radius) || 8));
  slot.reducedMotion = !!reducedMotion;
  slot.sourceId = receipt ? (receipt.droneId ?? null) : null;
  slot.targetId = receipt ? (receipt.targetId ?? null) : null;
  slot.eventTick = Math.max(0, Math.trunc(Number(receipt && receipt.tick) || 0));
  return true;
}

function writeSegment(positions, cursor, x0, y0, z0, x1, y1, z1) {
  positions[cursor++] = x0;
  positions[cursor++] = y0;
  positions[cursor++] = z0;
  positions[cursor++] = x1;
  positions[cursor++] = y1;
  positions[cursor++] = z1;
  return cursor;
}

function composeBlade(system, surface, instanceIndex, x, y, z, angle, sx, sy, sz) {
  system.position.set(x, y, z);
  system.quaternion.setFromAxisAngle(system.yAxis, -angle);
  system.scale.set(sx, sy, sz);
  system.matrix.compose(system.position, system.quaternion, system.scale);
  surface.mesh.setMatrixAt(instanceIndex, system.matrix);
}

function retireSlot(system, family, slot) {
  if (!slot.alive) return;
  slot.alive = false;
  if (family === 'pd') system.activePd = Math.max(0, system.activePd - 1);
  else system.activeWeld = Math.max(0, system.activeWeld - 1);
}

function updatePd(system, dt) {
  const surface = system.pdBlades;
  const lines = system.pdLines;
  let instanceCursor = 0;
  let lineCursor = 0;
  for (const slot of system.pdSlots) {
    if (!slot.alive) continue;
    slot.age += dt;
    if (slot.age >= slot.life) {
      retireSlot(system, 'pd', slot);
      continue;
    }
    const u = slot.age / slot.life;
    const attack = smoothstep01(slot.age / 0.075);
    const release = 1 - smoothstep01((u - 0.34) / 0.66);
    const envelope = attack * release;
    const dx = Math.cos(slot.angle);
    const dz = Math.sin(slot.angle);
    const nx = -dz;
    const nz = dx;
    // Two compact fabricated jaws run along the physical interceptor's source->contact axis.
    // Their tips bite at the receipt position; they do not form a free-floating screen-space X.
    const reach = 3.1 + envelope * 4.7;
    const halfGap = 0.72 + envelope * 1.15;
    const thickness = 0.28 + envelope * 0.34;
    for (let blade = 0; blade < PD_BLADES_PER_TELL; blade++) {
      const side = blade === 0 ? -1 : 1;
      composeBlade(
        system,
        surface,
        instanceCursor++,
        slot.x - dx * reach * 0.5 + nx * halfGap * side,
        1.02 + blade * 0.2,
        slot.z - dz * reach * 0.5 + nz * halfGap * side,
        slot.angle,
        reach,
        thickness,
        0.42 + envelope * 0.28,
      );
      lineCursor = writeSegment(lines.positions, lineCursor,
        slot.x - dx * (reach + 0.8) + nx * halfGap * side, 1.34,
        slot.z - dz * (reach + 0.8) + nz * halfGap * side,
        slot.x - dx * 0.35 + nx * halfGap * side, 1.34,
        slot.z - dz * 0.35 + nz * halfGap * side);
    }
    // A single short bite rail closes across the incoming path at the actual contact.
    lineCursor = writeSegment(lines.positions, lineCursor,
      slot.x - dx * 0.12 - nx * halfGap * 1.18, 1.34,
      slot.z - dz * 0.12 - nz * halfGap * 1.18,
      slot.x - dx * 0.12 + nx * halfGap * 1.18, 1.34,
      slot.z - dz * 0.12 + nz * halfGap * 1.18);
  }
  surface.mesh.count = instanceCursor;
  surface.mesh.visible = instanceCursor > 0;
  surface.mesh.instanceMatrix.needsUpdate = instanceCursor > 0;
  lines.mesh.geometry.setDrawRange(0, lineCursor / 3);
  lines.mesh.geometry.attributes.position.needsUpdate = lineCursor > 0;
  lines.mesh.visible = lineCursor > 0;
  return instanceCursor > 0 ? 1 : 0;
}

// A bounded, read-only presentation of the velocity that the real fields -> physics membrane has
// given authored Jackal wake mines. The rails are rooted on the physical mine and trail opposite
// its live velocity; VFX neither predicts nor writes motion.
export function updateJackalMineWakeTells(system, entities, localize, reducedMotion = false) {
  if (!system || typeof localize !== 'function') return 0;
  const lines = system.mineWakeLines;
  const blades = system.mineWakeBlades;
  let lineCursor = 0;
  let bladeCursor = 0;
  let admitted = 0;
  const list = entities || [];
  for (let index = 0; index < list.length && admitted < JACKAL_MINE_WAKE_CAPACITY; index++) {
    const mine = list[index];
    if (!mine || mine.alive === false || mine.type !== 'mine' || mine.data?.mineLayerWake !== true
      || !mine.pos || !mine.vel) continue;
    const vx = Number(mine.vel.x) || 0;
    const vz = Number(mine.vel.z) || 0;
    const speed = Math.hypot(vx, vz);
    if (speed < 2) continue;
    const ux = vx / speed;
    const uz = vz / speed;
    const nx = -uz;
    const nz = ux;
    const local = localize(mine.pos.x, mine.pos.z, system.mineLocal);
    const length = Math.min(reducedMotion ? 18 : 30, Math.max(9, speed * 0.18));
    const railHalfGap = Math.max(1.1, Math.min(2.1, (Number(mine.radius) || 6) * 0.25));
    const tailX = local.x - ux * length;
    const tailZ = local.z - uz * length;
    const angle = Math.atan2(uz, ux);
    for (let blade = 0; blade < JACKAL_MINE_WAKE_BLADES; blade++) {
      const side = blade - 1;
      const bladeLength = blade === 1 ? length : length * 0.68;
      composeBlade(
        system,
        blades,
        bladeCursor++,
        local.x - ux * bladeLength * 0.5 + nx * railHalfGap * side * 1.45,
        blade === 1 ? 0.46 : 0.28,
        local.z - uz * bladeLength * 0.5 + nz * railHalfGap * side * 1.45,
        angle,
        bladeLength,
        blade === 1 ? 0.42 : 0.3,
        blade === 1 ? 0.62 : 0.42,
      );
    }
    lineCursor = writeSegment(lines.positions, lineCursor,
      local.x, 0.82, local.z, tailX, 0.82, tailZ);
    for (let side = -1; side <= 1; side += 2) {
      lineCursor = writeSegment(lines.positions, lineCursor,
        local.x - ux * 1.2 + nx * railHalfGap * side, 0.58,
        local.z - uz * 1.2 + nz * railHalfGap * side,
        local.x - ux * length * 0.76 + nx * railHalfGap * side, 0.58,
        local.z - uz * length * 0.76 + nz * railHalfGap * side);
    }
    lineCursor = writeSegment(lines.positions, lineCursor,
      tailX - nx * railHalfGap * 1.25, 0.82, tailZ - nz * railHalfGap * 1.25,
      tailX + nx * railHalfGap * 1.25, 0.82, tailZ + nz * railHalfGap * 1.25);
    admitted++;
  }
  lines.mesh.geometry.setDrawRange(0, lineCursor / 3);
  lines.mesh.geometry.attributes.position.needsUpdate = lineCursor > 0;
  lines.mesh.visible = lineCursor > 0;
  blades.mesh.count = bladeCursor;
  blades.mesh.visible = bladeCursor > 0;
  blades.mesh.instanceMatrix.needsUpdate = bladeCursor > 0;
  return admitted;
}

function updateWeld(system, dt) {
  const surface = system.weldBars;
  const lines = system.weldLines;
  let instanceCursor = 0;
  let lineCursor = 0;
  for (const slot of system.weldSlots) {
    if (!slot.alive) continue;
    slot.age += dt;
    if (slot.age >= slot.life) {
      retireSlot(system, 'weld', slot);
      continue;
    }
    const u = slot.age / slot.life;
    const attack = smoothstep01(slot.age / 0.06);
    const release = 1 - smoothstep01((u - 0.28) / 0.72);
    const envelope = attack * release;
    const dx = Math.cos(slot.angle);
    const dz = Math.sin(slot.angle);
    const nx = -dz;
    const nz = dx;
    const seamHalf = Math.min(slot.radius * 0.52, 7.5);
    const chatter = slot.reducedMotion ? 0 : Math.sin(slot.age * 35) * 0.32;
    for (let bar = 0; bar < WELD_BARS_PER_TELL; bar++) {
      const along = ((bar + 0.5) / WELD_BARS_PER_TELL * 2 - 1) * seamHalf;
      const lift = 0.75 + (bar % 2) * 0.46;
      composeBlade(
        system,
        surface,
        instanceCursor++,
        slot.x + nx * along + dx * (chatter + (bar % 2 ? 0.45 : -0.35)),
        lift,
        slot.z + nz * along + dz * (chatter + (bar % 2 ? 0.45 : -0.35)),
        slot.angle,
        2.1 + envelope * 3.4,
        0.38 + envelope * 0.34,
        0.34 + envelope * 0.46,
      );
    }
    const stitchReach = 1.5 + envelope * 3.8;
    for (let stitch = 0; stitch < 4; stitch++) {
      const along = ((stitch + 0.5) / 4 * 2 - 1) * seamHalf;
      lineCursor = writeSegment(lines.positions, lineCursor,
        slot.x + nx * along - dx * stitchReach, 1.38, slot.z + nz * along - dz * stitchReach,
        slot.x + nx * along + dx * stitchReach, 1.38, slot.z + nz * along + dz * stitchReach);
    }
    // Two short feeder rails point back toward the physical repair drone without turning the tell
    // into a screen-wide beam tether. The receipt remains rooted on the repaired hull.
    lineCursor = writeSegment(lines.positions, lineCursor,
      slot.x - dx * (slot.radius * 0.72), 0.85, slot.z - dz * (slot.radius * 0.72),
      slot.x - dx * 1.2 + nx * 1.4, 1.38, slot.z - dz * 1.2 + nz * 1.4);
    lineCursor = writeSegment(lines.positions, lineCursor,
      slot.x - dx * (slot.radius * 0.72), 0.85, slot.z - dz * (slot.radius * 0.72),
      slot.x - dx * 1.2 - nx * 1.4, 1.38, slot.z - dz * 1.2 - nz * 1.4);
  }
  surface.mesh.count = instanceCursor;
  surface.mesh.visible = instanceCursor > 0;
  surface.mesh.instanceMatrix.needsUpdate = instanceCursor > 0;
  lines.mesh.geometry.setDrawRange(0, lineCursor / 3);
  lines.mesh.geometry.attributes.position.needsUpdate = lineCursor > 0;
  lines.mesh.visible = lineCursor > 0;
  return instanceCursor > 0 ? 1 : 0;
}

export function updateSpecialistWorldTellSystem(system, dt) {
  if (!system) return 0;
  const step = Math.max(0, Math.min(0.1, Number(dt) || 0));
  if (system.activePd === 0 && system.activeWeld === 0) return 0;
  return updatePd(system, step) + updateWeld(system, step);
}

export function reprojectSpecialistWorldTellSystem(system, dx, dz) {
  if (!system) return 0;
  const ox = Number(dx) || 0;
  const oz = Number(dz) || 0;
  let moved = 0;
  for (const slots of [system.pdSlots, system.weldSlots]) {
    for (const slot of slots) {
      if (!slot.alive) continue;
      slot.x += ox;
      slot.z += oz;
      moved++;
    }
  }
  return moved;
}

export function resetSpecialistWorldTellSystem(system) {
  if (!system) return;
  for (const slot of system.pdSlots) slot.alive = false;
  for (const slot of system.weldSlots) slot.alive = false;
  system.activePd = 0;
  system.activeWeld = 0;
  for (const surface of [system.pdBlades, system.mineWakeBlades, system.weldBars]) {
    surface.mesh.count = 0;
    surface.mesh.visible = false;
  }
  for (const surface of [system.pdLines, system.mineWakeLines, system.weldLines]) {
    surface.mesh.geometry.setDrawRange(0, 0);
    surface.mesh.visible = false;
  }
}

export function inspectSpecialistWorldTellSystem(system) {
  if (!system) return null;
  return {
    activePd: system.activePd,
    activeWeld: system.activeWeld,
    pdBladeInstances: system.pdBlades.mesh.count,
    pdLineVertices: system.pdLines.mesh.geometry.drawRange.count,
    mineWakeVertices: system.mineWakeLines.mesh.geometry.drawRange.count,
    mineWakeBladeInstances: system.mineWakeBlades.mesh.count,
    weldBarInstances: system.weldBars.mesh.count,
    weldLineVertices: system.weldLines.mesh.geometry.drawRange.count,
    drawSurfaces: system.group.children.length,
    capacities: {
      pd: PD_INTERCEPT_TELL_CAPACITY,
      weld: TENDER_WELD_TELL_CAPACITY,
    },
  };
}

export function disposeSpecialistWorldTellSystem(system) {
  if (!system) return;
  system.group.removeFromParent();
  for (const surface of [system.pdBlades, system.mineWakeBlades, system.weldBars, system.pdLines, system.mineWakeLines, system.weldLines]) {
    surface.geometry.dispose();
    surface.material.dispose();
  }
}
