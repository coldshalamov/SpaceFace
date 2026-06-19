// Faction ships smoke test (spec §8.3 Meridian, §8.4 Drift, §8.6 Quiet, §8.7 Vael — Phase 3 §20).
//
// Verifies each of the four new bespoke faction builders produces a valid mesh with sockets, a
// factionGrammar contract, correct assetId, and that the override seam routes each enemy host to its
// bespoke builder while leaving unmapped enemies procedural. Headless (mirrors check-concord-patrol).
function makeStubCanvas() {
  const ctx = {
    canvas: { width: 256, height: 256 }, fillRect() {}, strokeRect() {}, clearRect() {}, fillText() {}, strokeText() {},
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, setTransform() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, rect() {},
    bezierCurveTo() {}, quadraticCurveTo() {}, fill() {}, stroke() {},
    createLinearGradient() { return { addColorStop() {} }; }, createRadialGradient() { return { addColorStop() {} }; },
    createImageData(w, h) { return { data: new Uint8ClampedArray((w || 1) * (h || 1) * 4), width: w, height: h }; },
    getImageData(x, y, w, h) { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; },
    putImageData() {}, drawImage() {}, measureText() { return { width: 10 }; },
    fillStyle: '', strokeStyle: '', font: '', lineWidth: 1, globalAlpha: 1, letterSpacing: '0px',
  };
  return { width: 256, height: 256, getContext: () => ctx, style: {}, toDataURL: () => 'data:,', addEventListener() {} };
}
globalThis.document = {
  createElement: (tag) => tag === 'canvas' ? makeStubCanvas() : { style: {}, appendChild() {}, addEventListener() {} },
  getElementById: () => null, addEventListener: () => {},
};
globalThis.window = { addEventListener: () => {}, devicePixelRatio: 1 };

const THREE = await import('../vendor/three.module.js');
globalThis.THREE = THREE;
const { buildMeridianTrader } = await import('../src/render/ships/meridianTrader.js');
const { buildDriftBarge } = await import('../src/render/ships/driftBarge.js');
const { buildQuietRaider } = await import('../src/render/ships/quietRaider.js');
const { buildVaelSniper } = await import('../src/render/ships/vaelSniper.js');
const { installVisualOverrides } = await import('../src/render/visualOverrides.js');
const { createVisualFactory } = await import('../src/render/visualFactory.js');

let ok = 0, fail = 0;
function check(label, cond, detail = '') {
  if (cond) { ok++; } else { fail++; console.log(`FAIL  ${label}${detail ? '  —  ' + detail : ''}`); }
}

// Each faction: (builder, enemyHost lootTableId, expected assetId, grammar section)
const FACTIONS = [
  { build: buildMeridianTrader, host: 'mule_trader', assetId: 'SF_MTS_MERIDIAN_HAULER', sec: '§8.3' },
  { build: buildDriftBarge, host: 'bruiser_brawler', assetId: 'SF_DMC_DRIFT_BARGE', sec: '§8.4' },
  { build: buildQuietRaider, host: 'corsair_raider', assetId: 'SF_QUIET_RAIDER', sec: '§8.6' },
  { build: buildVaelSniper, host: 'lancer_sniper', assetId: 'SF_VAEL_SNIPER', sec: '§8.7' },
];

const baseEnt = (host) => ({ id: 'f', type: 'ship', team: 1, radius: 18, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, data: { defId: 'ship_x', lootTableId: host } });

for (const f of FACTIONS) {
  let root;
  try {
    root = f.build(baseEnt(f.host));
    check(`${f.sec} ${f.assetId} builds`, !!root);
  } catch (e) { console.log(`ERR ${f.sec} build threw: ${e.message}`); continue; }

  // sockets: at least engine + camera
  const sockets = new Set();
  root.traverse((o) => { if (o.userData && o.userData.spacefaceSocket && o.name) sockets.add(o.name); });
  check(`${f.sec} has engine + camera sockets`, sockets.has('SOCKET_Engine_Main') && sockets.has('SOCKET_Camera_Focus'), `sockets=[${[...sockets].join(',')}]`);

  // contract + grammar
  check(`${f.sec} assetId matches`, root.userData.assetId === f.assetId, `got ${root.userData.assetId}`);
  check(`${f.sec} factionGrammar recorded`, !!root.userData.renderContract.factionGrammar);

  // dimensions are sane (non-zero, finite)
  const box = new THREE.Box3().setFromObject(root); const size = new THREE.Vector3(); box.getSize(size);
  check(`${f.sec} has finite non-zero dimensions`, size.x > 5 && size.y > 1 && Number.isFinite(size.x), `${size.x.toFixed(1)}x${size.y.toFixed(1)}x${size.z.toFixed(1)}`);
}

// ---- override seam routes each host to its bespoke builder; unmapped enemies stay procedural ----
const vf = createVisualFactory(); installVisualOverrides(vf);
for (const f of FACTIONS) {
  const mesh = vf.build(baseEnt(f.host));
  check(`${f.sec} seam intercepts ${f.host}`, !!mesh && mesh.userData.assetId === f.assetId, `assetId=${mesh && mesh.userData.assetId}`);
}
// An unmapped enemy must NOT get a bespoke assetId.
const unmapped = vf.build(baseEnt('wasp_swarmer'));
check('unmapped enemy uses procedural path', !unmapped || unmapped.userData.assetId === undefined, `assetId=${unmapped && unmapped.userData.assetId}`);

console.log(`\n${ok} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
