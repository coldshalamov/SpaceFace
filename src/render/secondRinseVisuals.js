// Procedural body for Hasp's Second Rinse. The stock hull stays hidden.
// Sheet vertices are the sim quads, so the picture and the hit are the same shape.
// Motion reads secondRinsePresentation. It never writes the sim.

import * as THREE from 'three';
import {
  SECOND_RINSE as C,
  blueSheetLocal,
  pinCordLocal,
  secondRinsePicture,
  whiteSheetLocal,
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

function quadMesh(color, extra) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(18), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([
    0, 1, 0, 0, 1, 0, 0, 1, 0,
    0, 1, 0, 0, 1, 0, 0, 1, 0,
  ]), 3));
  const mesh = new THREE.Mesh(geo, mat(color, { ...extra, side: THREE.DoubleSide }));
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  return mesh;
}

function writeQuad(mesh, corners, yFor) {
  const pos = mesh.geometry.attributes.position;
  const y = typeof yFor === 'function' ? yFor : () => yFor;
  const [a, b, c, d] = corners;
  const ya = y(a, 0);
  const yb = y(b, 1);
  const yc = y(c, 2);
  const yd = y(d, 3);
  pos.array.set([
    a.x, ya, a.z, b.x, yb, b.z, c.x, yc, c.z,
    a.x, ya, a.z, c.x, yc, c.z, d.x, yd, d.z,
  ]);
  pos.needsUpdate = true;
}

function centroid(corners) {
  let x = 0;
  let z = 0;
  for (const p of corners) { x += p.x; z += p.z; }
  return { x: x / corners.length, z: z / corners.length };
}

function alongOf(corners) {
  return { x: corners[1].x - corners[0].x, z: corners[1].z - corners[0].z };
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

  const kettle = new THREE.Mesh(
    new THREE.SphereGeometry(1, 18, 12),
    mat(0xa7b0b8, { roughness: 0.35, metalness: 0.45 }),
  );
  kettle.scale.set(9, 2.1, 5);
  group.add(kettle);
  const belly = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 10),
    mat(0x1e2a36, { roughness: 0.7, metalness: 0.3 }),
  );
  belly.scale.set(8, 0.7, 4.2);
  belly.position.y = -1.5;
  group.add(belly);

  const tumbler = new THREE.Group();
  const drum = new THREE.Mesh(
    new THREE.CylinderGeometry(2.4, 2.4, 7.2, 16),
    mat(0xd5dce3, { roughness: 0.4, metalness: 0.35 }),
  );
  drum.rotation.z = Math.PI / 2;
  tumbler.add(drum);
  for (let i = 0; i < 6; i++) {
    const rib = box(6.2, 0.16, 0.22, 0x141a22);
    const a = (i / 6) * Math.PI * 2;
    rib.position.set(0, Math.sin(a) * 2.45, Math.cos(a) * 2.45);
    tumbler.add(rib);
  }
  tumbler.position.set(0, 3.2, 0);
  group.add(tumbler);

  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.28, 9, 8),
    mat(0x5a636c),
  );
  mast.position.set(C.mast.x, 4.6, C.mast.z);
  group.add(mast);
  const truck = new THREE.Mesh(
    new THREE.SphereGeometry(0.38, 10, 8),
    mat(0xc4553a, { emissive: 0xc4553a, emissiveIntensity: 0.4 }),
  );
  truck.position.set(C.mast.x, 9.1, C.mast.z);
  group.add(truck);

  const buoy = new THREE.Mesh(new THREE.SphereGeometry(1.5, 12, 10), mat(0xe36a2e, { roughness: 0.45 }));
  buoy.position.set(C.buoy.x, 8.55, C.buoy.z);
  group.add(buoy);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.35, 12), mat(0xf2e7c9));
  band.position.copy(buoy.position);
  group.add(band);

  const line = quadMesh(0xe7e1d4);
  const lineFar = quadMesh(0xe7e1d4);
  group.add(line, lineFar);

  const whites = [];
  const pegs = [];
  for (let i = 0; i < C.whiteCenters.length; i++) {
    const sheet = quadMesh(0xf4f1ea, { roughness: 0.85 });
    group.add(sheet);
    whites.push(sheet);
    const peg = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 8, 6),
      mat(0xc4553a, { emissive: 0xc4553a, emissiveIntensity: 0.35 }),
    );
    group.add(peg);
    pegs.push(peg);
  }

  const blue = quadMesh(0x2748d6, { roughness: 0.55, transparent: true, opacity: 1 });
  group.add(blue);
  const boat = new THREE.Group();
  const flip = new THREE.Group();
  const hull = box(4.4, 0.34, 9.6, 0x140e0a, { roughness: 0.42 });
  const cabin = box(1.8, 0.86, 2.8, 0x3a2418);
  cabin.position.set(0, 0.56, 1.2);
  const keel = box(3.6, 0.14, 8.6, 0xe7d7b8, { roughness: 0.72 });
  keel.position.y = -0.26;
  const rub = box(0.34, 0.08, 7.4, 0x6e3424);
  rub.position.y = -0.36;
  flip.add(hull, cabin, keel, rub);
  boat.add(flip);
  group.add(boat);

  const pin = quadMesh(0xf3e6c4, { emissive: 0xf3e6c4, emissiveIntensity: 0.35 });
  group.add(pin);
  const pinFar = quadMesh(0xf3e6c4, { emissive: 0xf3e6c4, emissiveIntensity: 0.55 });
  pinFar.visible = false;
  group.add(pinFar);
  const peg = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 10, 8),
    mat(0xc4553a, { emissive: 0xffb089, emissiveIntensity: 0.7 }),
  );
  const pegFar = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 10, 8),
    mat(0xc4553a, { emissive: 0xffb089, emissiveIntensity: 0.7 }),
  );
  const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 9, 6), mat(0x5a636c));
  const stakeFar = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 9, 6), mat(0x5a636c));
  stake.position.set(C.pinA.x, 4.5, C.pinA.z);
  stakeFar.position.set(C.pinB.x, 4.5, C.pinB.z);
  group.add(peg, pegFar, stake, stakeFar);

  const shoulder = { x: -7, z: 4 };
  const aim = C.blueHinge;
  const arm = new THREE.Group();
  arm.position.set(shoulder.x, 3.2, shoulder.z);
  arm.rotation.y = Math.atan2(-(aim.z - shoulder.z), aim.x - shoulder.x);
  const upper = box(8, 0.38, 0.38, 0xc6a15a, { metalness: 0.45 });
  upper.position.x = 4;
  const fore = box(7, 0.32, 0.32, 0xc6a15a, { metalness: 0.45 });
  fore.position.set(7.2, 0, 0);
  const palm = new THREE.Mesh(
    new THREE.SphereGeometry(0.7, 10, 8),
    mat(0xf0d48a, { emissive: 0xf0d48a, emissiveIntensity: 0.25, metalness: 0.4 }),
  );
  palm.position.set(11, 0, 0);
  arm.add(upper, fore, palm);
  group.add(arm);

  for (let i = 0; i < 5; i++) {
    const stripe = box(1.6, 0.08, 5.4, i % 2 ? 0x7d5a68 : 0xe6d3a4, { roughness: 0.85 });
    stripe.position.set(-3.2 + i * 1.6, 4.5, -1);
    group.add(stripe);
  }
  const shell = new THREE.Mesh(
    new THREE.BoxGeometry(8, 0.08, 5.6),
    mat(0xd8fff8, { transparent: true, opacity: 0, depthWrite: false, roughness: 0.15 }),
  );
  shell.position.set(0, 4.7, -1);
  group.add(shell);

  const glass = new THREE.Mesh(
    new THREE.CircleGeometry(1.15, 16),
    mat(0x071014, { roughness: 0.15, metalness: 0.1, side: THREE.DoubleSide }),
  );
  glass.rotation.x = -Math.PI / 2;
  glass.position.set(-1.2, 2.3, 0);
  group.add(glass);
  const figure = new THREE.Group();
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.36, 10, 8), mat(0xc4a574, { roughness: 0.7 }));
  head.position.y = 0.5;
  const torso = box(0.52, 0.66, 0.3, 0x1c2430);
  torso.position.y = -0.05;
  const cap = box(0.48, 0.12, 0.48, 0xc4553a);
  cap.position.y = 0.84;
  figure.add(head, torso, cap);
  figure.position.set(-1.2, 2.5, 0);
  group.add(figure);

  const vent = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 1, 8), mat(0x3c4650));
  vent.position.set(-7.2, 2.2, 0);
  group.add(vent);
  const puff = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.65, 2.8, 8, 1, true),
    mat(0xe8fbff, { transparent: true, opacity: 0.35, depthWrite: false, emissive: 0x9fd4e0, emissiveIntensity: 0.4 }),
  );
  puff.position.set(-7.2, 4.2, 0);
  group.add(puff);

  const spark = new THREE.Mesh(
    new THREE.TorusGeometry(0.45, 0.06, 6, 16),
    mat(0xfff6d0, { emissive: 0xfff6d0, emissiveIntensity: 2, transparent: true, opacity: 0, depthWrite: false }),
  );
  spark.rotation.x = Math.PI / 2;
  group.add(spark);

  root.add(group);
  let retired = false;
  const hideStock = () => {
    for (const child of root.children) {
      if (child !== group) child.visible = false;
    }
  };
  const ribbon = (a, b, y, half) => {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    const px = (-dz / len) * half;
    const pz = (dx / len) * half;
    const ya = typeof y === 'function' ? y(a) : y;
    const yb = typeof y === 'function' ? y(b) : y;
    return {
      corners: [
        { x: a.x + px, z: a.z + pz },
        { x: b.x + px, z: b.z + pz },
        { x: b.x - px, z: b.z - pz },
        { x: a.x - px, z: a.z - pz },
      ],
      y: (p, index) => (index === 0 || index === 3 ? ya : yb),
    };
  };
  const lineHeight = (z) => {
    const span = C.buoy.z - C.mast.z || 1;
    const t = Math.max(0, Math.min(1, (z - C.mast.z) / span));
    return 8.55 - Math.sin(Math.PI * t) * 1.35;
  };

  return {
    update(live, _now, a11y, state) {
      if (retired) return;
      const valid = live?.id === id && live.occupantGeneration === life && live.alive !== false
        && isSecondRinse(live) && state?.entities?.get(id) === live;
      if (!valid) return;
      hideStock();
      const frame = secondRinsePresentation(state, live);
      const picture = secondRinsePicture(frame?.flag || 'open');
      const reduced = frame?.frozen === true || a11y?.reducedMotion === true || a11y?.motionReduce === true;
      const simTime = frame?.simTime ?? state.simTime ?? 0;
      const whipTime = reduced || !picture.whipping ? 0 : simTime;
      if (!reduced) tumbler.rotation.x = (frame?.simTime ?? simTime) * Math.PI * 2 / 2.6;
      const midLine = {
        x: (C.mast.x + C.buoy.x) / 2,
        z: (C.mast.z + C.buoy.z) / 2,
      };
      const paintRibbon = (mesh, a, b, yOf, half) => {
        const span = ribbon(a, b, yOf, half);
        writeQuad(mesh, span.corners, span.y);
      };
      paintRibbon(line, C.mast, midLine, (p) => lineHeight(p.z), 0.12);
      paintRibbon(lineFar, midLine, C.buoy, (p) => lineHeight(p.z), 0.12);
      whites.forEach((sheet, i) => {
        const corners = whiteSheetLocal(i);
        const luff = reduced ? 0 : Math.sin(whipTime * (1.1 + i * 0.17) + i) * 0.22;
        const top = corners[0];
        const top2 = corners[1];
        const hang = lineHeight((top.z + top2.z) / 2);
        writeQuad(sheet, corners, (_p, index) => hang - 0.7 + ((index === 2 || index === 3) ? luff : 0));
        pegs[i].position.set((top.x + top2.x) / 2, hang + 0.12, (top.z + top2.z) / 2);
      });
      const raw = blueSheetLocal(whipTime, picture.whipping ? 'open' : 'crooked');
      const crookedAge = !picture.boatInverted ? 0
        : (reduced || frame?.clapAt == null ? 1 : Math.min(1, Math.max(0, (simTime - frame.clapAt) / 0.4)));
      const cutAge = picture.pin ? 0
        : (reduced || frame?.cutAt == null ? 1 : Math.min(1, Math.max(0, (simTime - frame.cutAt) / 0.45)));
      const slide = picture.boatInverted ? C.seatSlide * crookedAge : 0;
      const shown = raw.map((p, index) => ({
        x: p.x,
        z: p.z + ((index === 1 || index === 2) ? slide : 0),
      }));
      blue.visible = true;
      blue.material.opacity = 1;
      blue.material.depthWrite = true;
      writeQuad(blue, shown, (_p, index) => {
        const edge = index === 1 || index === 2;
        const flutter = !picture.whipping || reduced ? 0 : Math.sin(whipTime * 3.1) * (edge ? 0.35 : 0.08);
        return 8.2 + flutter;
      });
      const mid = centroid(shown);
      const dir = alongOf(shown);
      boat.visible = true;
      boat.position.set(mid.x, 8.62, mid.z);
      boat.rotation.set(0, Math.atan2(dir.x, dir.z), 0);
      flip.rotation.set(0, 0, Math.PI * crookedAge);
      const aimYaw = Math.atan2(-(aim.z - shoulder.z), aim.x - shoulder.x);
      arm.rotation.y = aimYaw + 0.6 * crookedAge;
      arm.rotation.z = -0.15 * crookedAge;
      figure.rotation.z = 0;
      const cord = pinCordLocal();
      const midPin = { x: (cord.a.x + cord.b.x) / 2, z: (cord.a.z + cord.b.z) / 2 };
      peg.position.set(cord.a.x, 9.05, cord.a.z);
      pegFar.position.set(cord.b.x, 9.05, cord.b.z);
      if (picture.pin) {
        pinFar.visible = false;
        paintRibbon(pin, cord.a, cord.b, 8.7, 0.22);
      } else {
        pinFar.visible = true;
        const keep = 0.7 - 0.48 * cutAge;
        const droop = 1.8 * cutAge;
        const stop = (from) => ({
          x: from.x + (midPin.x - from.x) * keep,
          z: from.z + (midPin.z - from.z) * keep,
        });
        const hung = (anchor) => (p) => (
          Math.hypot(p.x - anchor.x, p.z - anchor.z) < 0.35 ? 8.7 : 8.7 - droop
        );
        paintRibbon(pin, cord.a, stop(cord.a), hung(cord.a), 0.22);
        paintRibbon(pinFar, cord.b, stop(cord.b), hung(cord.b), 0.22);
      }
      const puffAge = reduced ? 0.4 : (0.35 + 0.25 * Math.sin((frame?.simTime ?? simTime) * 5.4));
      puff.scale.y = 0.4 + puffAge;
      puff.position.y = 3.4 + puffAge;
      const soap = reduced || !picture.boatInverted || frame?.clapAt == null
        ? 0
        : Math.max(0, 1 - (simTime - frame.clapAt) / 2);
      shell.material.opacity = 0.45 * soap;
      const clapSpark = !reduced && picture.boatInverted && frame?.clapAt != null
        ? Math.max(0, 1 - (simTime - frame.clapAt) / 0.16) : 0;
      const breakSpark = !reduced && !picture.pin && frame?.cutAt != null
        ? Math.max(0, 1 - (simTime - frame.cutAt) / 0.22) : 0;
      const sparkAge = Math.max(clapSpark, breakSpark);
      spark.visible = sparkAge > 0.02;
      spark.material.opacity = sparkAge;
      if (spark.visible) spark.scale.setScalar(0.4 + (1 - sparkAge) * (picture.pin ? 3 : 2.2));
      spark.position.set(picture.pin ? mid.x : midPin.x, 8.7, picture.pin ? mid.z : midPin.z);
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
