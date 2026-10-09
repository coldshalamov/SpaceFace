// Laundry machinery and moored wash on Hasp's admitted Forge hull.
// Motion reads secondRinsePresentation. It never writes the sim.

import * as THREE from 'three';
import {
  SECOND_RINSE as C,
  whipAngle,
} from '../data/secondRinse.js';
import { secondRinsePresentation } from '../systems/secondRinse.js';

const GROUP = 'second-rinse-body';

function mat(color, extra = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: extra.roughness ?? 0.6,
    metalness: extra.metalness ?? 0.2,
    emissive: extra.emissive ?? 0x000000,
    emissiveIntensity: extra.emissiveIntensity ?? 0,
    side: extra.side ?? THREE.FrontSide,
    transparent: !!extra.transparent,
    opacity: extra.opacity ?? 1,
    depthWrite: extra.depthWrite !== false,
  });
}

function box(w, h, d, color, extra) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, extra));
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

function boatGeometry() {
  const positions = new Float32Array([
    -3, 0, -1, 3, 0, -1, 1.8, 0, -2.2,
    -3, 0, -1, 1.8, 0, -2.2, -1.8, 0, -2.2,
    -0.12, 0, -1, 0.12, 0, -1, 0.12, 0, 2.8,
    -0.12, 0, -1, 0.12, 0, 2.8, -0.12, 0, 2.8,
    0.3, 0, -0.5, 2.5, 0, -0.5, 0.3, 0, 2.5,
    -0.3, 0, -0.5, -0.3, 0, 1.8, -2.2, 0, -0.5,
  ]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

export function isSecondRinse(entity) {
  return entity?.data?.secondRinseId === 'hasp' && entity.data.worldRecordId === C.worldRecordId;
}

export function createSecondRinseVisualDriver(root, entity) {
  if (!isSecondRinse(entity) || !root) return null;
  const id = entity.id;
  const life = entity.occupantGeneration;
  const group = new THREE.Group();
  group.name = GROUP;
  const up = new THREE.Vector3(0, 1, 0);
  function lineBetween(a, b, thickness = 0.09) {
    const delta = new THREE.Vector3().subVectors(b, a);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(thickness, thickness, delta.length(), 6), mat(0xe7e1d4));
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(up, delta.normalize());
    group.add(mesh);
    return mesh;
  }

  const kettle = new THREE.Mesh(
    new THREE.SphereGeometry(1, 18, 12),
    mat(0x74828d, { roughness: 0.35, metalness: 0.45 }),
  );
  kettle.name = 'second-rinse-kettle';
  kettle.scale.set(2.7, 2.1, 2.7);
  kettle.position.set(-5, 4.1, -2);
  group.add(kettle);
  const kettleCradle = box(5.7, 0.6, 5.7, 0x263440);
  kettleCradle.position.set(-5, 2, -2);
  group.add(kettleCradle);

  const tumbler = new THREE.Group();
  const drum = new THREE.Mesh(
    new THREE.CylinderGeometry(2.4, 2.4, 7.2, 16),
    mat(0x909994, { roughness: 0.4, metalness: 0.35 }),
  );
  drum.rotation.z = Math.PI / 2;
  tumbler.add(drum);
  for (let i = 0; i < 6; i++) {
    const rib = box(0.28, 0.18, 5.4, 0x141a22);
    const a = (i / 6) * Math.PI * 2;
    rib.position.set(0, Math.sin(a) * 2.45, Math.cos(a) * 2.45);
    tumbler.add(rib);
  }
  tumbler.position.set(0, 3.2, 0);
  group.add(tumbler);
  for (const x of [-3, 3]) {
    const foot = box(0.55, 2.4, 4.4, 0x263440);
    foot.position.set(x, 1.4, 0);
    group.add(foot);
  }

  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.32, 11, 8),
    mat(0x5a636c),
  );
  mast.position.set(C.mast.x, 5.2, C.mast.z);
  group.add(mast);
  const truck = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), mat(0xc4553a, { emissive: 0xc4553a, emissiveIntensity: 0.4 }));
  truck.position.set(C.mast.x, 10.6, C.mast.z);
  group.add(truck);

  const buoy = new THREE.Mesh(new THREE.SphereGeometry(1.6, 12, 10), mat(0xe36a2e, { roughness: 0.45 }));
  buoy.position.set(C.buoy.x, 1.5, C.buoy.z);
  group.add(buoy);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 0.4, 12), mat(0xf2e7c9));
  band.position.copy(buoy.position);
  group.add(band);

  for (const c of C.whiteCenters) {
    lineBetween(new THREE.Vector3(C.mast.x, 8.2, C.mast.z), new THREE.Vector3(c.x, 7.5, c.z));
    lineBetween(new THREE.Vector3(c.x, 7.5, c.z), new THREE.Vector3(C.buoy.x, 2, C.buoy.z));
  }
  lineBetween(new THREE.Vector3(0, 1, 3), new THREE.Vector3(C.mast.x, 1, C.mast.z), 0.25);

  const whites = [];
  C.whiteCenters.forEach((center, i) => {
    const sheet = new THREE.Mesh(
      new THREE.PlaneGeometry(C.sheetAcross, C.sheetAlong * 0.45, 8, 8),
      mat(0xb0a899, { roughness: 0.96, metalness: 0, side: THREE.DoubleSide }),
    );
    sheet.rotation.x = Math.PI / 2;
    sheet.position.set(center.x, 7.4 - i * 0.15, center.z + C.sheetAlong * 0.225);
    group.add(sheet);
    sheet.userData.clothBase = sheet.geometry.attributes.position.array.slice();
    // A hem and two actual clips distinguish linen from a luminous screen-facing rectangle.
    for (const side of [-1, 1]) {
      const hem = box(0.18, C.sheetAlong * 0.45, 0.08, 0x696557);
      hem.position.set(side * (C.sheetAcross / 2 - 0.14), 0, -0.04);
      sheet.add(hem);
      const clip = box(0.75, 1.7, 0.34, 0x6f6343, { metalness: 0.5 });
      clip.position.set(side * (C.sheetAcross / 2 - 0.4), C.sheetAlong * 0.225 - 0.4, -0.12);
      sheet.add(clip);
    }
    whites.push(sheet);
  });

  const whip = new THREE.Group();
  whip.position.set(C.mast.x, 8.4, C.mast.z);
  const blue = new THREE.Mesh(
    new THREE.PlaneGeometry(C.sheetAcross, C.sheetAlong, 8, 16),
    mat(0x223958, { roughness: 0.94, metalness: 0, side: THREE.DoubleSide }),
  );
  blue.rotation.x = Math.PI / 2;
  blue.name = 'second-rinse-blue-sheet';
  blue.position.set(0, 0, C.sheetLead + C.sheetAlong / 2);
  // The loose leader leaves a clear flight path across the short, taut pin-cord.
  const leader = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, C.sheetLead, 6), mat(0x70829d));
  leader.rotation.x = Math.PI / 2;
  leader.position.z = C.sheetLead / 2;
  whip.add(leader);
  const boatPivot = new THREE.Group();
  const boat = new THREE.Mesh(boatGeometry(), mat(0xc5b68c, { roughness: 0.9, metalness: 0, side: THREE.DoubleSide }));
  boat.name = 'second-rinse-boat-print';
  boat.scale.setScalar(1.65);
  boat.rotation.x = -Math.PI / 2;
  boat.position.z = -0.04;
  boatPivot.add(boat);
  blue.add(boatPivot);
  whip.add(blue);
  group.add(whip);

  const pin = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.07, C.pinLength, 6),
    mat(0xf3e6c4, { emissive: 0xf3e6c4, emissiveIntensity: 0.25 }),
  );
  pin.rotation.x = Math.PI / 2;
  pin.position.set(C.mast.x, 9.2, C.mast.z + C.pinLength / 2);
  group.add(pin);

  const arm = new THREE.Group();
  arm.position.set(4, 3.4, C.mast.z - 2);
  lineBetween(new THREE.Vector3(C.mast.x, 1, C.mast.z), new THREE.Vector3(4, 3.4, C.mast.z - 2), 0.28);
  const upper = box(6.2, 0.4, 0.4, 0xc6a15a, { metalness: 0.45 });
  upper.position.x = 3;
  const fore = box(5.2, 0.35, 0.35, 0xc6a15a, { metalness: 0.45 });
  fore.position.set(5.6, 0, 0);
  const uPin = new THREE.Mesh(
    new THREE.TorusGeometry(1.05, 0.16, 8, 12, Math.PI),
    mat(0xf0d48a, { emissive: 0xf0d48a, emissiveIntensity: 0.35, metalness: 0.5 }),
  );
  uPin.position.set(8.2, 0, 0);
  arm.add(upper, fore, uPin);
  group.add(arm);

  const awningStripes = [];
  for (let i = 0; i < 6; i++) {
    const stripe = box(1.7, 0.1, 6.2, i % 2 ? 0x68505c : 0xb7aa84, { roughness: 0.85 });
    stripe.position.set(-2 + i * 1.7, 4.6, -1);
    group.add(stripe);
    awningStripes.push(stripe);
  }
  const shell = new THREE.Mesh(
    new THREE.BoxGeometry(11, 0.08, 6.4),
    mat(0xd8fff8, { transparent: true, opacity: 0, depthWrite: false, roughness: 0.15 }),
  );
  shell.position.set(2, 4.75, -1);
  group.add(shell);

  const glass = new THREE.Mesh(
    new THREE.CircleGeometry(1.25, 16),
    mat(0x071014, { roughness: 0.15, metalness: 0.1 }),
  );
  glass.rotation.x = -Math.PI / 2;
  glass.position.set(-1.5, 2.35, 0);
  group.add(glass);
  const figure = new THREE.Group();
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.38, 10, 8), mat(0xc4a574, { roughness: 0.7 }));
  head.position.y = 0.55;
  const torso = box(0.55, 0.7, 0.32, 0x1c2430);
  torso.position.y = -0.05;
  const cap = box(0.5, 0.12, 0.5, 0xc4553a);
  cap.position.y = 0.9;
  figure.add(head, torso, cap);
  figure.position.set(-1.5, 2.55, 0);
  group.add(figure);

  const vent = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 1.1, 8), mat(0x3c4650));
  vent.position.set(-7.2, 2.4, 0);
  group.add(vent);
  const puff = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.7, 3.2, 8, 1, true),
    mat(0xe8fbff, { transparent: true, opacity: 0.35, depthWrite: false, emissive: 0x9fd4e0, emissiveIntensity: 0.4 }),
  );
  puff.position.set(-7.2, 4.6, 0);
  group.add(puff);

  const spark = new THREE.Mesh(
    new THREE.TorusGeometry(0.4, 0.05, 6, 16),
    mat(0xfff6d0, { emissive: 0xfff6d0, emissiveIntensity: 2, transparent: true, opacity: 0 }),
  );
  spark.rotation.x = Math.PI / 2;
  spark.position.set(C.mast.x, 9.2, C.mast.z + 1);
  group.add(spark);

  root.add(group);
  const cloth = blue.geometry.attributes.position;
  const clothBase = cloth.array.slice();
  const print = boat.geometry.attributes.position;
  const printBase = print.array.slice();
  let retired = false;

  return {
    update(live, _now, a11y, state) {
      if (retired) return;
      const valid = live?.id === id && live.occupantGeneration === life && live.alive !== false
        && isSecondRinse(live) && state?.entities?.get(id) === live;
      if (!valid) return;
      const frame = secondRinsePresentation(state, live);
      const simTime = frame?.simTime ?? state.simTime ?? 0;
      const reduced = a11y?.reducedMotion === true;
      if (!reduced) tumbler.rotation.x = simTime * Math.PI * 2 / 2.6;
      whites.forEach((sheet, i) => {
        const luff = reduced ? 0 : Math.sin(simTime * (1.1 + i * 0.17) + i) * 0.16;
        sheet.rotation.z = luff;
        const points = sheet.geometry.attributes.position, base = sheet.userData.clothBase;
        for (let j = 0; j < points.count; j++) {
          const x = base[j * 3], y = base[j * 3 + 1];
          const free = Math.sin((x / C.sheetAcross + 0.5) * Math.PI);
          points.array[j * 3 + 2] = free * (0.5 + 0.55 * Math.sin(x * 0.8 + y * 0.1 + (reduced ? i : simTime * 1.2 + i)));
        }
        points.needsUpdate = true;
        sheet.geometry.computeVertexNormals();
      });
      const flag = frame?.flag || 'open';
      const angle = whipAngle(simTime, flag);
      if (flag === 'open') {
        blue.visible = true;
        leader.visible = true;
        pin.visible = true;
        blue.position.z = C.sheetLead + C.sheetAlong / 2;
        whip.rotation.y = -angle;
        blue.rotation.x = Math.PI / 2;
        boatPivot.rotation.z = 0;
        arm.rotation.z = 0;
      } else if (flag === 'crooked') {
        blue.visible = true;
        leader.visible = true;
        pin.visible = false;
        const age = frame?.clapAt == null ? 1 : Math.min(1, (simTime - frame.clapAt) / 0.4);
        blue.position.z = C.sheetLead + C.sheetAlong / 2;
        whip.rotation.y = 0;
        blue.rotation.x = Math.PI / 2 + 0.6 * age;
        boatPivot.rotation.z = Math.PI * age;
        arm.rotation.z = -0.8 * age;
      } else {
        const age = frame?.cutAt == null ? 1 : Math.min(1, (simTime - frame.cutAt) / 0.8);
        blue.visible = age < 1;
        blue.position.z = C.sheetLead + C.sheetAlong / 2 + age * 28;
        leader.visible = age < 1;
        pin.visible = false;
        whip.rotation.y = 0;
        // a cut mid-clap must not inherit the crooked pose — the cut frame hangs the boat normal
        boatPivot.rotation.z = 0;
        arm.rotation.z = 0;
      }
      for (let i = 0; i < cloth.count; i++) {
        const x = clothBase[i * 3], y = clothBase[i * 3 + 1];
        const loose = (C.sheetAlong / 2 - y) / C.sheetAlong;
        cloth.array[i * 3 + 2] = reduced ? 0 : Math.sin(y * 0.28 + x * 0.16 - simTime * 4) * loose * (flag === 'open' ? 0.6 : 0.12);
      }
      cloth.needsUpdate = true;
      blue.geometry.computeVertexNormals();
      // The printed boat follows the fabric, including its turned-over saved orientation.
      const pc = Math.cos(boatPivot.rotation.z), ps = Math.sin(boatPivot.rotation.z);
      for (let i = 0; i < print.count; i++) {
        const bx = printBase[i * 3] * 1.65, by = printBase[i * 3 + 2] * 1.65;
        const x = bx * pc - by * ps, y = bx * ps + by * pc;
        const loose = (C.sheetAlong / 2 - y) / C.sheetAlong;
        const displacement = reduced ? 0 : Math.sin(y * 0.28 + x * 0.16 - simTime * 4) * loose * (flag === 'open' ? 0.6 : 0.12);
        print.array[i * 3 + 1] = -displacement / 1.65;
      }
      print.needsUpdate = true;
      boat.geometry.computeVertexNormals();
      const puffAge = reduced ? 0.4 : (0.35 + 0.25 * Math.sin(simTime * 5.4));
      puff.scale.y = 0.4 + puffAge;
      puff.position.y = 3.6 + puffAge;
      const soap = frame?.clapAt == null ? 0 : Math.max(0, 1 - (simTime - frame.clapAt) / 2);
      shell.material.opacity = (reduced ? 0.4 : 1) * 0.45 * soap;
      const sparkAge = frame?.clapAt == null || flag !== 'crooked' ? 0 : Math.max(0, 1 - (simTime - frame.clapAt) / 0.16);
      spark.material.opacity = sparkAge;
      spark.scale.setScalar(0.4 + (1 - sparkAge) * 3);
      const lean = flag === 'open' ? 0 : 0.12;
      figure.rotation.z = lean;
    },
    dispose() {
      if (retired) return;
      retired = true;
      group.removeFromParent();
      group.traverse((node) => {
        node.geometry?.dispose?.();
        if (Array.isArray(node.material)) node.material.forEach((m) => m.dispose?.());
        else node.material?.dispose?.();
      });
    },
  };
}
