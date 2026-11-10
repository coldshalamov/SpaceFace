// PQ-193.05 regression: the five WORLD_VISUAL_CENSUS A shapes publish packaged bodies,
// never primitives. Drone entities publish place_mining_drone.glb, gates resolve the authored
// jump ring (the buildGate hoop is unreachable), generic wrecks publish one of six aftermath
// bodies, and mine + massSeed are explicitly UNCOMMISSIONED (null — never a substitute).
// Fixed fixtures throughout; no sim run, no headed capture.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SECTORS } from '../src/data/sectors.js';
import {
  buildAuthoredStationArchetype,
  is19305PackagedWreckFile,
  PQ_193_05_DRONE_PACKAGED_FILE,
  PQ_193_05_GATE_PACKAGED_FILE,
  PQ_193_05_UNCOMMISSIONED_ENTITY_TYPES,
  PQ_193_05_WRECK_PACKAGED_FILES,
  resolve19305CensusAEntityPackagedFile,
  resolvePlaceFileForEntity,
} from '../src/render/partsLibrary.js';
import { createVisualFactory } from '../src/render/visualFactory.js';
import { installVisualOverrides } from '../src/render/visualOverrides.js';

// No jsdom in this repo: drone hull panels paint to canvas, so stub document the way
// authored-entity-plan-budget does. Builds happen below, after the stub is installed.
function makeStubCanvas() {
  const context = {
    canvas: { width: 256, height: 256 }, fillRect() {}, strokeRect() {}, clearRect() {},
    fillText() {}, strokeText() {},
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, setTransform() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, rect() {},
    bezierCurveTo() {}, quadraticCurveTo() {}, fill() {}, stroke() {}, drawImage() {},
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
    createImageData(width, height) { return { data: new Uint8ClampedArray(width * height * 4), width, height }; },
    getImageData(_x, _y, width, height) { return { data: new Uint8ClampedArray(width * height * 4), width, height }; },
    putImageData() {}, measureText() { return { width: 10 }; },
    fillStyle: '', strokeStyle: '', font: '', lineWidth: 1, globalAlpha: 1,
  };
  return { width: 256, height: 256, getContext: () => context, style: {}, addEventListener() {} };
}
globalThis.document = {
  createElement: (tag) => (tag === 'canvas' ? makeStubCanvas() : { style: {}, appendChild() {}, addEventListener() {} }),
};

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RELEASE_PLACES = 'assets/ships/release/parts/places';

let failures = 0;
let GateCount = 0;
function check(label, cond, detail = '') {
  if (cond) return;
  console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  failures++;
}

function releaseUrl(relativeFile) {
  return `${RELEASE_PLACES}/${String(relativeFile).replace(/^places\//, '')}`;
}

// 1. The 193.05 contract table: drone + gate resolve, wreck is the six-body set,
//    mine + massSeed are explicitly uncommissioned.
check('drone packaged file is the mining-drone place GLB',
  PQ_193_05_DRONE_PACKAGED_FILE === 'places/place_mining_drone.glb');
check('gate packaged file is the jump ring',
  PQ_193_05_GATE_PACKAGED_FILE === 'places/place_gate_jump_ring.glb');
check('wreck packaged set holds six aftermath bodies',
  PQ_193_05_WRECK_PACKAGED_FILES.length === 6, String(PQ_193_05_WRECK_PACKAGED_FILES.length));
check('uncommissioned types are exactly mine + massSeed',
  JSON.stringify([...PQ_193_05_UNCOMMISSIONED_ENTITY_TYPES]) === JSON.stringify(['mine', 'massSeed']));
check('drone entity resolves the mining-drone file',
  resolve19305CensusAEntityPackagedFile({ type: 'drone', data: {} }) === PQ_193_05_DRONE_PACKAGED_FILE);
check('gate station resolves the jump ring',
  resolve19305CensusAEntityPackagedFile({ type: 'station', data: { isGate: true } })
    === PQ_193_05_GATE_PACKAGED_FILE);
check('wormhole station resolves the jump ring',
  resolve19305CensusAEntityPackagedFile({ type: 'station', data: { isWormhole: true } })
    === PQ_193_05_GATE_PACKAGED_FILE);
for (const type of ['mine', 'massSeed', 'wreck', 'ship', 'pickup']) {
  check(`${type} resolves null (no substitute, wreck choice lives with the runtime pointer)`,
    resolve19305CensusAEntityPackagedFile({ type, id: `${type}:fixed`, data: {} }) === null);
}
check('null entity resolves null', resolve19305CensusAEntityPackagedFile(null) === null);

// 2. Every commissioned file exists in release/ and is manifested.
const releaseManifest = JSON.parse(
  readFileSync(resolve(ROOT, 'assets/ships/release/release_manifest.json'), 'utf8'));
const releaseIds = new Set(
  (releaseManifest.parts || releaseManifest.assets || []).map((entry) => entry && entry.id));
const partsManifest = JSON.parse(
  readFileSync(resolve(ROOT, 'assets/ships/parts/parts_manifest.json'), 'utf8'));
const partsIds = new Set(
  (partsManifest.parts || []).map((entry) => entry && entry.id));
const commissioned = [PQ_193_05_DRONE_PACKAGED_FILE, PQ_193_05_GATE_PACKAGED_FILE,
  ...PQ_193_05_WRECK_PACKAGED_FILES];
for (const file of commissioned) {
  const id = file.replace(/^places\//, '').replace(/\.glb$/, '');
  check(`${file} exists in release/`, existsSync(resolve(ROOT, releaseUrl(file))), releaseUrl(file));
  check(`${id} is in the release manifest`, releaseIds.has(id), id);
}
for (const id of ['place_mining_drone', 'place_gate_jump_ring']) {
  check(`${id} is in the parts manifest`, partsIds.has(id), id);
}

// 3. Runtime drone pointer: the flyer publishes the packaged body; the diamond + stick
//    arms survive only as hidden identity substrate.
{
  const vf = createVisualFactory();
  const drone = {
    id: 'drone:helios-courier-fixed-01', type: 'drone', radius: 4,
    data: { courierVisual: true },
  };
  const visual = vf.build(drone);
  check('drone builds a visual', !!(visual && visual.isObject3D));
  const url = visual && visual.userData && visual.userData.authoredPackageUrl;
  check('drone publishes the mining-drone packaged URL',
    typeof url === 'string' && url.endsWith(PQ_193_05_DRONE_PACKAGED_FILE), String(url));
  check('drone waits for authored admission',
    visual.userData.authoredAssetState === 'awaiting-authored-admission',
    String(visual.userData.authoredAssetState));
  let visibleProcedural = 0;
  for (const child of visual.children) {
    if (child.visible !== false) visibleProcedural++;
  }
  check('drone shows zero procedural primitives before admission', visibleProcedural === 0,
    `visible=${visibleProcedural}`);
}

// 4. Runtime wreck pointers: hazardous -> engine section, military -> turret, generic fixed
//    ids land inside the six-body set.
{
  const vf = createVisualFactory();
  const unstable = vf.build({
    id: 'wreck:unstable-fixed-01', type: 'wreck', radius: 14, data: { unstableReactor: true },
  });
  check('unstable-reactor wreck publishes the engine section',
    String(unstable.userData.authoredPackageUrl)
      .endsWith('places/place_aftermath_aft_engine_section.glb'),
    String(unstable.userData.authoredPackageUrl));
  const military = vf.build({
    id: 'wreck:military-fixed-01', type: 'wreck', radius: 14, data: { wreckClass: 'military' },
  });
  check('military wreck publishes the corvette turret',
    String(military.userData.authoredPackageUrl)
      .endsWith('places/place_aftermath_wreck_corvette_turret.glb'),
    String(military.userData.authoredPackageUrl));
  for (const id of ['wreck:generic-fixed-01', 'wreck:generic-fixed-02', 'wreck:generic-fixed-03']) {
    const visual = vf.build({ id, type: 'wreck', radius: 14, data: {} });
    check(`${id} publishes a packaged body inside the six-body set`,
      is19305PackagedWreckFile(visual.userData.authoredPackageUrl),
      String(visual.userData.authoredPackageUrl));
    let visibleProcedural = 0;
    for (const child of visual.children) {
      if (child.visible !== false) visibleProcedural++;
    }
    check(`${id} shows zero procedural primitives before admission`, visibleProcedural === 0,
      `visible=${visibleProcedural}`);
  }
  check('non-wreck file rejected from the wreck set',
    is19305PackagedWreckFile('places/place_nav_buoy.glb') === false);
}

// 5. Gates: every gate the live route can spawn resolves the authored jump ring — the
//    buildGate hoop fallback is unreachable because world.js always sets archetypeGlb.
{
  const helios = SECTORS.find((sector) => sector.id === 'sector_helios_prime');
  check('Helios Prime start sector exists', !!helios);
  check('Helios Prime has 3 neighbor gates (done-when arrival count)',
    (helios.neighbors || []).length === 3, String((helios.neighbors || []).length));
  for (const sector of SECTORS) {
    const authored = Array.isArray(sector.gates) && sector.gates.length > 0 ? sector.gates : null;
    if (authored) {
      for (const [aindex, gate] of authored.entries()) {
        check(`${sector.id} authored gate ${aindex} carries to+pos (world.js never skips it)`,
          !!(gate.to && gate.pos), `to=${gate.to} pos=${JSON.stringify(gate.pos)}`);
      }
    }
    const gateShapes = authored
      ? authored.map((g) => ({ archetypeGlb: g.archetypeGlb, wormhole: !!g.wormhole }))
      : (sector.neighbors || []).map(() => ({ archetypeGlb: undefined, wormhole: false }));
    for (const [index, shape] of gateShapes.entries()) {
      GateCount++;
      const ent = {
        type: 'station', radius: 32,
        data: {
          stationId: null, isGate: true, gateTo: `neighbor-${index}`, dockRadius: 70,
          isWormhole: shape.wormhole,
          // Mirror world.js _spawnGates: authored tag or the jump-ring default. The default
          // is the point — a gate never spawns without archetypeGlb, so the hoop path
          // (no archetype tag) never triggers on the live route.
          archetypeGlb: shape.archetypeGlb || 'place_gate_jump_ring',
        },
      };
      const resolved = resolvePlaceFileForEntity(ent);
      check(`${sector.id} gate ${index} resolves the authored jump ring`,
        resolved === 'places/place_gate_jump_ring.glb', String(resolved));
      check(`${sector.id} gate ${index} matches the 193.05 contract`,
        resolve19305CensusAEntityPackagedFile(ent) === PQ_193_05_GATE_PACKAGED_FILE);
      const visual = buildAuthoredStationArchetype(ent, { releaseMode: true });
      check(`${sector.id} gate ${index} builds an authored boundary`,
        !!(visual && visual.isObject3D)
        && visual.userData.authoredAssetState === 'awaiting-authored-admission',
        visual && visual.userData && visual.userData.authoredAssetState);
    }
  }
}

// 5b. Live-route dispatch: through installVisualOverrides (directAuthoredMount, the
//    renderer.js live-play configuration) a gate mounts a zero-draw admission
//    substrate — the buildGate hoop geometry never draws before admission.
{
  const vf = installVisualOverrides(createVisualFactory(), { releaseMode: true, directAuthoredMount: true });
  const gate = {
    id: 'gate:helios-fixed-01', type: 'station', radius: 32,
    data: { stationId: null, isGate: true, gateTo: 'neighbor-0', dockRadius: 70, archetypeGlb: 'place_gate_jump_ring' },
  };
  const visual = vf.build(gate);
  check('live-dispatch gate builds a visual', !!(visual && visual.isObject3D));
  let visibleMeshes = 0;
  const stack = [visual];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || node.visible === false) continue;
    if (node.isMesh === true) visibleMeshes++;
    if (node.children) stack.push(...node.children);
  }
  check('live-dispatch gate draws zero meshes before admission (no hoop)',
    visibleMeshes === 0, `visibleMeshes=${visibleMeshes}`);
}

// 6. Honest before-state pins for the two uncommissioned shapes: no packaged URL, no
//    substitute. A follow-up commission flips these assertions to the new bodies.
{
  const vf = createVisualFactory();
  const mineShapes = [
    { id: 'mine:trap-fixed-01', type: 'mine', radius: 6,
      data: { kind: 'mine', mine: true, armed: true, triggerRadius: 55 } },
    { id: 'mine:unnetted-fixed-01', type: 'mine', radius: 6, data: { mine: true } },
  ];
  for (const shape of mineShapes) {
    check(`${shape.id} resolves null (uncommissioned)`,
      resolve19305CensusAEntityPackagedFile(shape) === null);
    const visual = vf.build(shape);
    check(`${shape.id} publishes no packaged URL yet`,
      !(visual.userData && visual.userData.authoredPackageUrl),
      String(visual.userData && visual.userData.authoredPackageUrl));
  }
  const seed = { id: 'massSeed:deployed-fixed-01', type: 'massSeed', radius: 6,
    data: { deployed: true } };
  check('massSeed resolves null (uncommissioned)',
    resolve19305CensusAEntityPackagedFile(seed) === null);
  const seedVisual = vf.build(seed);
  check('massSeed publishes no packaged URL yet',
    !(seedVisual.userData && seedVisual.userData.authoredPackageUrl),
    String(seedVisual.userData && seedVisual.userData.authoredPackageUrl));
}

if (failures) {
  console.error(`pq-193-05-census-a-bodies.test: ${failures} failures`);
  process.exit(1);
} else {
  console.log(`pq-193-05-census-a-bodies.test: PASS `
    + `(gates=${GateCount}, drone=1/1 packaged, wrecks=5/5 packaged, mine+seed uncommissioned)`);
}
