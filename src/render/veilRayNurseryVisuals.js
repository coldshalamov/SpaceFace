import * as THREE from 'three';

const geometry = new Map();
// Non-solid fauna hover over the real mineral ribs. This presentation datum
// clears their Y4.6 crests even at the disturbed membrane's lowest stroke.
const ADULT_HOVER_Y = 8.6;
const JUVENILE_HOVER_Y = 6.2;
function cached(key, make) {
  if (!geometry.has(key)) {
    const g = make(); g.userData.spacefaceSharedAsset = true; geometry.set(key, g);
  }
  return geometry.get(key);
}

// The membrane has a pointed leading edge, swept shoulders, scalloped trailing
// folds and a raised root. Each side hinges at its anatomical keel, not its centre.
function membranePoint(t, s, side, target) {
  const width = Math.sin(Math.PI * t) * (16 - t * 3);
  return target.set(15 - t * 27 - Math.sin(s * Math.PI) * t * 3,
    (.8 + Math.sin(t * Math.PI) * .18) * (1 - s)
      + Math.sin(t * Math.PI * 2 - .7) * s * .9
      + Math.sin(t * Math.PI * 6) * s * s * .32,
    side * (width * s + .34));
}

function membrane(side) {
  return cached(`nursery-ray-wing:${side}`, () => {
    const positions = [], uvs = [], indices = [], rings = 24, spans = 10;
    const point = new THREE.Vector3();
    for (let i = 0; i <= rings; i++) {
      const t = i / rings;
      for (let j = 0; j <= spans; j++) {
        const s = j / spans;
        membranePoint(t, s, side, point);
        positions.push(point.x, point.y, point.z); uvs.push(t, s * .5);
        if (i < rings && j < spans) {
          const a = i * (spans + 1) + j, b = a + spans + 1;
          if (side > 0) indices.push(a, b, a + 1, a + 1, b, b + 1);
          else indices.push(a, a + 1, b, a + 1, b + 1, b);
        }
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(indices); g.computeVertexNormals(); return g;
  });
}

function bodyGeometry() {
  return cached('nursery-ray-keel', () => {
    const g = new THREE.CapsuleGeometry(.8, 21, 4, 8); g.rotateZ(Math.PI / 2); return g;
  });
}

function rayMaterials(colors, makeTissue) {
  const tissue = makeTissue(colors.tissue); tissue.side = THREE.DoubleSide;
  tissue.normalScale.multiplyScalar(.5);
  const bone = makeTissue(new THREE.Color(colors.tissue).multiplyScalar(.62).getHex());
  const seams = new THREE.MeshStandardMaterial({
    color: new THREE.Color(colors.filament).lerp(new THREE.Color(colors.tissue), .4).multiplyScalar(.55),
    roughness: .8, metalness: 0 });
  return { tissue, bone, seams };
}

function addRay(root, mats) {
  const wings = [];
  for (const side of [-1, 1]) {
    const hinge = new THREE.Group(); hinge.name = side < 0 ? 'Ray_Port_Membrane' : 'Ray_Starboard_Membrane';
    hinge.position.y = ADULT_HOVER_Y;
    hinge.add(new THREE.Mesh(membrane(side), mats.tissue)); root.add(hinge); wings.push(hinge);
    // Structural fin rays, seated on the membrane's raised folds. Fine dark ribs
    // make the membrane readable at the ordinary camera without a luminous disc.
    for (let i = 0; i < 5; i++) {
      const rib = new THREE.Mesh(cached(`nursery-ray-rib:${side}:${i}`, () => {
        const points = [];
        for (let j = 0; j <= 12; j++) {
          const point = membranePoint((i + 1) / 6, j / 12, side, new THREE.Vector3());
          point.y += .065; points.push(point);
        }
        return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 16, .07, 5, false);
      }), mats.seams);
      hinge.add(rib);
    }
  }
  const keel = new THREE.Mesh(bodyGeometry(), mats.bone); keel.position.y = ADULT_HOVER_Y;
  root.add(keel);
  const tail = new THREE.Mesh(cached('nursery-ray-tail', () => {
    const g = new THREE.ConeGeometry(.55, 13, 7); g.rotateZ(Math.PI / 2); return g;
  }), mats.bone); tail.position.set(-17, ADULT_HOVER_Y, 0); root.add(tail);
  return wings;
}

export function buildNurseryRay(entity, colors, makeTissue) {
  const root = new THREE.Group(), mats = rayMaterials(colors, makeTissue);
  const wings = addRay(root, mats), original = entity, life = entity.occupantGeneration;
  root.name = 'SF_VeilRay_Nursery_Adult'; root.userData.kind = 'fauna';
  root.userData.updateAuthoredMotion = (current, now, a11y, state) => {
    const alive = current === original && current.occupantGeneration === life && current.alive !== false
      && (!state || state.entities.get(current.id) === current);
    const mode = alive ? current.data?.ecology?.nurseryMode : null;
    const calm = a11y?.reducedMotion === true || !alive;
    const phase = current.data?.ecology?.phase || 0;
    const amplitude = calm ? 0 : mode === 'DISTURBED' ? .18 : mode === 'RECOVERING' ? .09 : .05;
    const angle = Math.sin(now * (mode === 'DISTURBED' ? 4 : 1.2) + phase) * amplitude;
    wings[0].rotation.x = angle; wings[1].rotation.x = -angle;
  };
  return root;
}

export function buildNurseryFlock(entity, colors, makeTissue) {
  const root = new THREE.Group(), mats = rayMaterials(colors, makeTissue);
  // Eight juveniles share one body and three instance batches, never eight
  // entity lifetimes, brains, collision bodies or reward sources.
  const batches = [new THREE.InstancedMesh(membrane(-1), mats.tissue, 8),
    new THREE.InstancedMesh(membrane(1), mats.tissue, 8), new THREE.InstancedMesh(bodyGeometry(), mats.bone, 8)];
  batches.forEach(m => { m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; root.add(m); });
  const matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion(), pos = new THREE.Vector3(), scale = new THREE.Vector3(.27, .27, .27);
  const axis = new THREE.Vector3(1, 0, 0), original = entity, life = entity.occupantGeneration;
  let spread = 8, previousTime = 0;
  root.name = 'SF_VeilRay_Nursery_Juvenile_Flock'; root.userData.kind = 'fauna';
  root.userData.updateAuthoredMotion = (current, now, a11y, state) => {
    const live = current === original && current.occupantGeneration === life && current.alive !== false
      && (!state || state.entities.get(current.id) === current);
    const count = live ? Math.max(0, Math.min(8, Math.trunc(current.data?.ecology?.visibleMembers ?? 8))) : 0;
    const scatter = current.data?.ecology?.nurseryMode === 'DISTURBED';
    const quiet = a11y?.reducedMotion === true;
    const dt = Math.max(0, Math.min(.25, now - previousTime)); previousTime = now;
    const targetSpread = scatter ? 26 : 8;
    spread = quiet ? targetSpread : spread + (targetSpread - spread) * (1 - Math.exp(-dt * 3));
    for (let j = 0; j < 3; j++) {
      batches[j].count = count;
      for (let i = 0; i < count; i++) {
        const angle = i * 2.399963 + (quiet ? 0 : now * .08), r = spread + (i % 3) * 4;
        pos.set(Math.cos(angle) * r, JUVENILE_HOVER_Y + (i % 2) * .5, Math.sin(angle) * r);
        quaternion.setFromAxisAngle(axis, j === 2 || quiet ? 0 : Math.sin(now * 1.5 + i) * .07 * (j ? -1 : 1));
        matrix.compose(pos, quaternion, scale); batches[j].setMatrixAt(i, matrix);
      }
      batches[j].instanceMatrix.needsUpdate = true;
    }
  };
  root.userData.updateAuthoredMotion(entity, 0, {}, null);
  return root;
}

export function buildNurseryMineralRib(entity) {
  const root = new THREE.Group(); root.name = 'SF_VeilRay_Fractured_Mineral_Rib'; root.userData.kind = 'prop';
  const index = entity.data.veilNurseryRib % 7;
  const rock = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .94, metalness: .02 });
  root.add(new THREE.Mesh(cached(`nursery-mineral-fracture:${index}`, () => {
    // A continuous, solid mineral spine, fractured along its long grain. Every
    // point stays within the existing native 11 x 5 x 3 half-extents.
    const xs = [-11, -7.2, -3.5, .4, 4.3, 7.8, 11], rings = [];
    const positions = [], colors = [];
    const shades = [0x293732, 0x3e4c43, 0x54624f, 0x6a735e, 0x596852, 0x45584c, 0x303e36, 0x293732]
      .map(hex => new THREE.Color(hex));
    for (let i = 0; i < xs.length; i++) {
      const top = 3.2 + ((index * 3 + i * 5) % 8) * .2;
      const width = i === 0 || i === xs.length - 1 ? 2.25 : 2.7 + ((index + i) % 3) * .15;
      rings.push([[-3.5, -width * .6], [-2.5, -width], [top * .1, -width],
        [top * .78, -width * .65], [top, width * .1], [top * .75, width * .72],
        [-1.2, width], [-3.5, width * .6]].map(([y, z]) => [xs[i], y, z]));
    }
    const triangle = (a, b, c, color) => {
      positions.push(...a, ...b, ...c);
      for (let k = 0; k < 3; k++) colors.push(color.r, color.g, color.b);
    };
    for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < 8; j++) {
      const next = (j + 1) % 8, a = rings[i][j], b = rings[i + 1][j];
      triangle(a, rings[i][next], b, shades[j]);
      triangle(rings[i][next], rings[i + 1][next], b, shades[j]);
    }
    for (let j = 1; j < 7; j++) {
      triangle(rings[0][0], rings[0][j + 1], rings[0][j], shades[1]);
      triangle(rings.at(-1)[0], rings.at(-1)[j], rings.at(-1)[j + 1], shades[2]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    g.computeVertexNormals(); return g;
  }), rock));
  return root;
}
