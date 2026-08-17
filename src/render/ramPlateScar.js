// Plan 45 Ram Plate bow-contact tell.
//
// A collision scores three short, solid gouges into the contact plane. The gouges are opaque,
// world-space BoxGeometry with a dark metal trough and a narrower hot lip; heat and reach animate,
// never opacity. Everything is allocated at init and reused from a fixed pool.

const CAPACITY = 6;
const GOUGE_COUNT = 3;
const LIFE_S = 1.15;
const ATTACK_S = 0.065;

export function createRamPlateScarSystem(THREE, scene) {
  if (!THREE || !scene) return null;
  const group = new THREE.Group();
  group.name = 'ram-plate-bow-scars';
  group.frustumCulled = false;
  scene.add(group);

  const troughGeometry = new THREE.BoxGeometry(0.34, 0.10, 8.4);
  const lipGeometry = new THREE.BoxGeometry(0.10, 0.15, 7.2);
  const slots = new Array(CAPACITY);
  for (let index = 0; index < CAPACITY; index++) {
    const root = new THREE.Group();
    root.name = `ram-plate-bow-scar-${index}`;
    root.visible = false;
    const troughMaterial = new THREE.MeshStandardMaterial({
      color: 0x24160f,
      roughness: 0.76,
      metalness: 0.82,
      emissive: 0x2d0b02,
      emissiveIntensity: 0.1,
      transparent: false,
      depthWrite: true,
    });
    const lipMaterial = new THREE.MeshStandardMaterial({
      color: 0xff7b1a,
      roughness: 0.34,
      metalness: 0.88,
      emissive: 0xff3d00,
      emissiveIntensity: 0,
      transparent: false,
      depthWrite: true,
    });
    for (let gouge = 0; gouge < GOUGE_COUNT; gouge++) {
      const offset = (gouge - 1) * 0.72;
      const trough = new THREE.Mesh(troughGeometry, troughMaterial);
      trough.position.set(offset, 0, 0);
      trough.rotation.y = (gouge - 1) * 0.055;
      const lip = new THREE.Mesh(lipGeometry, lipMaterial);
      lip.position.set(offset + 0.12, 0.08, -0.18);
      lip.rotation.y = (gouge - 1) * 0.055;
      root.add(trough, lip);
    }
    group.add(root);
    slots[index] = {
      root,
      troughMaterial,
      lipMaterial,
      alive: false,
      age: 0,
      serial: -1,
      peak: 1,
    };
  }

  let serial = 0;
  let lastSourceId = null;

  function claimSlot() {
    for (let index = 0; index < slots.length; index++) {
      if (!slots[index].alive) return slots[index];
    }
    let oldest = slots[0];
    for (let index = 1; index < slots.length; index++) {
      if (slots[index].serial < oldest.serial) oldest = slots[index];
    }
    return oldest;
  }

  function spawn(input = {}) {
    if (!Number.isFinite(input.x) || !Number.isFinite(input.z)) return false;
    const slot = claimSlot();
    const magnitude = clamp(Number(input.magnitude) || 1, 0.7, 1.55);
    const reducedFlash = input.reducedFlash === true;
    slot.alive = true;
    slot.age = 0;
    slot.serial = serial++;
    slot.peak = reducedFlash ? 1.7 : 4.8;
    slot.root.visible = true;
    slot.root.position.set(input.x, 0.34, input.z);
    // BoxGeometry's long axis is local Z. Cant it across the contact axis so the score reads as a
    // deliberate plated bow scrape rather than another bilateral shock bar.
    slot.root.rotation.set(0, Math.PI * 0.5 - (Number(input.axisAngle) || 0) + 0.52, 0);
    slot.root.scale.set(magnitude, 1, 0.24);
    slot.lipMaterial.emissiveIntensity = slot.peak * 0.12;
    slot.troughMaterial.emissiveIntensity = reducedFlash ? 0.06 : 0.16;
    lastSourceId = input.sourceId == null ? null : input.sourceId;
    return true;
  }

  function update(dt) {
    let active = 0;
    const step = clamp(Number(dt) || 0, 0, 0.1);
    for (let index = 0; index < slots.length; index++) {
      const slot = slots[index];
      if (!slot.alive) continue;
      slot.age += step;
      if (slot.age >= LIFE_S) {
        slot.alive = false;
        slot.root.visible = false;
        continue;
      }
      active++;
      const attack = smooth01(slot.age / ATTACK_S);
      const release = 1 - smooth01((slot.age - ATTACK_S) / (LIFE_S - ATTACK_S));
      const heat = attack * release;
      slot.root.scale.z = 0.24 + attack * 0.76;
      slot.lipMaterial.emissiveIntensity = 0.08 + slot.peak * heat;
      slot.troughMaterial.emissiveIntensity = 0.04 + 0.18 * heat;
    }
    return active;
  }

  function reproject(offsetX, offsetZ) {
    const dx = Number(offsetX) || 0;
    const dz = Number(offsetZ) || 0;
    for (let index = 0; index < slots.length; index++) {
      const slot = slots[index];
      if (!slot.alive) continue;
      slot.root.position.x += dx;
      slot.root.position.z += dz;
    }
  }

  function clear() {
    for (let index = 0; index < slots.length; index++) {
      slots[index].alive = false;
      slots[index].root.visible = false;
    }
  }

  function inspect() {
    let active = 0;
    for (let index = 0; index < slots.length; index++) if (slots[index].alive) active++;
    return Object.freeze({
      capacity: CAPACITY,
      active,
      hardMeshes: CAPACITY * GOUGE_COUNT * 2,
      sprites: 0,
      points: 0,
      transparentMaterials: 0,
      lastSourceId,
    });
  }

  function dispose() {
    clear();
    scene.remove(group);
    troughGeometry.dispose();
    lipGeometry.dispose();
    for (let index = 0; index < slots.length; index++) {
      slots[index].troughMaterial.dispose();
      slots[index].lipMaterial.dispose();
    }
  }

  return Object.freeze({ group, spawn, update, reproject, clear, inspect, dispose });
}

function smooth01(value) {
  const t = clamp(Number(value) || 0, 0, 1);
  return t * t * (3 - 2 * t);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}
