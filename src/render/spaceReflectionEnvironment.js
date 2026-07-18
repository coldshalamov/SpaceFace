// Invisible image-based-lighting rig for authored PBR surfaces.
//
// Visible space should remain genuinely dark. Basing the entire PMREM on that dark backdrop,
// however, leaves coated paint, bare metal, glass, bevels, and roughness maps with almost no
// reflected structure. These broad emissive cards behave like distant area sources in the IBL
// capture only; they never appear in the playable scene or lift the background black level.

// PMREMGenerator's 256px scene capture supports at most 20 taps per half-blur. Keep the initial
// convolution below that ceiling; the large reflection cards already provide broad sources, so a
// 0.035-radian prefilter softens their edges without clipping the kernel or spamming the live route.
export const SPACE_REFLECTION_PMREM_SIGMA_RADIANS = 0.035;

export function createSpaceReflectionEnvironment(THREE, options = {}) {
  if (!THREE) throw new TypeError('createSpaceReflectionEnvironment requires THREE');

  const scene = new THREE.Scene();
  scene.name = 'space-pbr-reflection-environment';
  scene.background = options.background || new THREE.Color(0x010205);
  const root = new THREE.Group();
  root.name = 'space-pbr-reflection-cards';
  scene.add(root);

  const cards = [
    addCard(THREE, root, {
      name: 'reflection-key-warm',
      color: options.keyColor || '#ffe3c2',
      radiance: 4.2,
      size: [22, 9],
      position: [19, 11, 10],
    }),
    addCard(THREE, root, {
      name: 'reflection-rim-cool',
      color: options.rimColor || '#7099d8',
      radiance: 2.4,
      size: [12, 20],
      position: [-17, 5, -15],
    }),
    addCard(THREE, root, {
      name: 'reflection-fill-neutral',
      color: options.fillColor || '#9fb2c8',
      radiance: 1.15,
      size: [18, 7],
      position: [2, -15, 14],
    }),
  ];

  return {
    scene,
    cards,
    diagnostics: Object.freeze({
      schema: 'spaceface.spaceReflectionEnvironment.v1',
      visibleInGame: false,
      areaSourceCount: cards.length,
      preservesDarkBackdrop: true,
      roles: Object.freeze(cards.map((card) => card.name)),
    }),
    dispose() {
      for (const card of cards) {
        card.geometry.dispose();
        card.material.dispose();
      }
      root.clear();
      scene.clear();
    },
  };
}

function addCard(THREE, root, spec) {
  const geometry = new THREE.PlaneGeometry(spec.size[0], spec.size[1]);
  const color = new THREE.Color(spec.color).multiplyScalar(spec.radiance);
  const material = new THREE.MeshBasicMaterial({
    color,
    side: THREE.DoubleSide,
    toneMapped: false,
    fog: false,
  });
  const card = new THREE.Mesh(geometry, material);
  card.name = spec.name;
  card.position.set(...spec.position);
  card.lookAt(0, 0, 0);
  card.userData.reflectionOnly = true;
  card.userData.radiance = spec.radiance;
  card.userData.extent = spec.size.slice();
  root.add(card);
  return card;
}
