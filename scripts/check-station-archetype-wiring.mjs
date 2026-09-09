#!/usr/bin/env node
// Validates station/gate archetypeGlb propagates from sector data → entity spawn shape → render path.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

function makeStubCanvas() {
  const ctx = {
    canvas: { width: 256, height: 256 },
    fillRect() {}, strokeRect() {}, clearRect() {}, fillText() {}, strokeText() {},
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, setTransform() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, rect() {},
    bezierCurveTo() {}, quadraticCurveTo() {}, fill() {}, stroke() {},
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
    createImageData(w, h) { return { data: new Uint8ClampedArray((w || 1) * (h || 1) * 4), width: w, height: h }; },
    getImageData(x, y, w, h) { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; },
    putImageData() {}, drawImage() {}, measureText() { return { width: 10 }; },
    fillStyle: '', strokeStyle: '', font: '', lineWidth: 1, globalAlpha: 1,
  };
  return {
    width: 256, height: 256, getContext: () => ctx, style: {},
    toDataURL: () => 'data:,', addEventListener() {}, removeEventListener() {},
  };
}
globalThis.document = {
  createElement: (tag) => {
    if (tag === 'canvas') return makeStubCanvas();
    return { style: {}, appendChild: () => {}, addEventListener: () => {} };
  },
  getElementById: () => null,
  addEventListener: () => {},
};
globalThis.window = { addEventListener: () => {}, devicePixelRatio: 1 };

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { SECTORS } = await import('../src/data/sectors.js');
const {
  STATION_ARCHETYPE_PLACE_IDS,
  resolvePlaceFileForEntity,
  buildAuthoredStationArchetype,
} = await import('../src/render/partsLibrary.js');
const { createVisualFactory } = await import('../src/render/visualFactory.js');
const { installVisualOverrides } = await import('../src/render/visualOverrides.js');

let ok = 0;
let fail = 0;
function check(label, cond, detail = '') {
  if (cond) ok++;
  else { fail++; console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`); }
}

const archetypeIds = new Set();
for (const sector of SECTORS) {
  for (const st of sector.stations || []) {
    check(`${sector.id}/${st.id}: archetypeGlb`, typeof st.archetypeGlb === 'string' && st.archetypeGlb.length > 0, st.archetypeGlb);
    archetypeIds.add(st.archetypeGlb);
    const ent = {
      type: 'station', id: `spawn_${st.id}`, radius: st.size === 'L' ? 90 : 72,
      pos: st.pos || { x: 0, z: 0 },
      data: {
        stationId: st.id, archetypeGlb: st.archetypeGlb, name: st.name,
        isGate: false,
      },
    };
    const placeFile = resolvePlaceFileForEntity(ent);
    check(`${sector.id}/${st.id}: resolvePlaceFile`, typeof placeFile === 'string' && placeFile.endsWith('.glb'), placeFile);
    check(`${sector.id}/${st.id}: place in whitelist`, STATION_ARCHETYPE_PLACE_IDS.includes(st.archetypeGlb), st.archetypeGlb);
    const visual = buildAuthoredStationArchetype(ent, { releaseMode: true });
    check(`${sector.id}/${st.id}: authored boundary`, !!visual && visual.userData.kind === 'station', visual && visual.userData.kind);
    check(`${sector.id}/${st.id}: upgrade hook`, typeof visual?.userData?.requestAuthoredUpgrade === 'function');
    check(`${sector.id}/${st.id}: archetype on visual`, visual?.userData?.archetypeGlb === st.archetypeGlb, visual?.userData?.archetypeGlb);
  }
}

check('distinct station archetypes >= 5', archetypeIds.size >= 5, `count=${archetypeIds.size}`);

const vf = createVisualFactory();
installVisualOverrides(vf, {});
const tradeHub = SECTORS.flatMap((s) => s.stations || []).find((st) => st.archetypeGlb === 'place_station_trade_hub');
const gateSector = SECTORS.find((s) => (s.gates || []).length > 0);
const gateEnt = {
  type: 'station', id: 'gate_test', radius: 70, pos: gateSector.gates[0].pos,
  data: {
    isGate: true, archetypeGlb: 'place_gate_jump_ring', name: 'Gate test', gateTo: gateSector.gates[0].to,
  },
};
const stationEnt = {
  type: 'station', id: 'station_test', radius: 72, pos: tradeHub.pos,
  data: { archetypeGlb: tradeHub.archetypeGlb, name: tradeHub.name, stationId: tradeHub.id },
};
const stationMesh = vf.build(stationEnt);
const gateMesh = vf.build(gateEnt);
const worldSrc = readFileSync(resolve(ROOT, 'src/systems/world.js'), 'utf8');
const visualFactorySrc = readFileSync(resolve(ROOT, 'src/render/visualFactory.js'), 'utf8');
check('visualOverrides station uses authored boundary', stationMesh?.userData?.requestAuthoredUpgrade != null);
check('visualOverrides gate uses authored boundary', gateMesh?.userData?.requestAuthoredUpgrade != null);
check('visualOverrides station != generic primitive count',
  stationMesh && stationMesh.name && stationMesh.name.includes('AuthoredAssetBoundary'));
check('world.js forwards archetypeGlb', worldSrc.includes('archetypeGlb: st.archetypeGlb'));
check('world.js decouples station collision radius from dock radius',
  worldSrc.includes('radius: collisionRadius') && worldSrc.includes('placeScale: dockRadius / 14'));
check('visualFactory has no station bubble shell meshes',
  !/stat:(?:haze|chromeshell|grimeshell)/.test(visualFactorySrc));

console.log(`\nstation-archetype-wiring: ${ok} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
