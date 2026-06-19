// Reaver Pirate smoke test (spec §8.5, Phase 3 §20).
// Verifies the bespoke pirate-conversion builder honors the §8.5 grammar: broken symmetry (one
// off-center cannon, vestigial cargo door), mismatched repair panel, scorched radiators, crimson
// tag decal, hot drive, sockets, and override-seam interception. Headless (mirrors check-concord).
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
const { buildReaverPirate } = await import('../src/render/ships/reaverPirate.js');
const { installVisualOverrides } = await import('../src/render/visualOverrides.js');
const { createVisualFactory } = await import('../src/render/visualFactory.js');

let ok = 0, fail = 0;
function check(label, cond, detail = '') {
  if (cond) { ok++; } else { fail++; console.log(`FAIL  ${label}${detail ? '  —  ' + detail : ''}`); }
}

let root;
try {
  root = buildReaverPirate({ id: 'r', type: 'ship', team: 1, radius: 16, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, data: { defId: 'ship_drifter', lootTableId: 'reaver_pirate' } });
  check('buildReaverPirate does not throw', !!root);
} catch (e) { console.log(`ERR build threw: ${e.message}`); process.exit(1); }

// ---- sockets ----
const sockets = new Set();
root.traverse((o) => { if (o.userData && o.userData.spacefaceSocket && o.name) sockets.add(o.name); });
check('has weapon/engine/trail/camera sockets', ['SOCKET_Weapon_Front', 'SOCKET_Engine_Main', 'SOCKET_Trail_Main', 'SOCKET_Camera_Focus'].every((s) => sockets.has(s)));

// ---- §8.5 broken symmetry: one off-center cannon + vestigial cargo door ----
let cannon = false, cargoDoor = false, repairPanel = false, tagDecal = false, radiators = 0;
root.traverse((o) => {
  if (o.name === 'Reaver_HeavyCannon') cannon = true;
  if (o.name === 'Reaver_CargoDoor_Port') cargoDoor = true;
  if (o.name === 'Reaver_Repair_Panel') repairPanel = true;
  if (o.name === 'Reaver_Decal_Tag') tagDecal = true;
  if (o.name && o.name.startsWith('Reaver_Radiator_')) radiators++;
});
check('§8.5 broken symmetry: off-center heavy cannon', cannon);
check('§8.5 broken symmetry: vestigial port cargo door (asymmetry)', cargoDoor);
check('§8.5 local damage: mismatched repair panel', repairPanel);
check('§8.5 overpaint: crimson tag decal present', tagDecal);
check('§8.5 neglected thermal: scorched radiator fins (2)', radiators === 2, `radiators=${radiators}`);

// ---- contract + dimensions ----
check('assetId set', root.userData.assetId === 'SF_REACH_REAVER_PIRATE');
check('factionGrammar recorded', !!root.userData.renderContract.factionGrammar);
const box = new THREE.Box3().setFromObject(root); const size = new THREE.Vector3(); box.getSize(size);
check('authored length ~22-28m (converted civilian hull)', size.x > 19 && size.x < 30, `length=${size.x.toFixed(1)}`);

// ---- override seam: intercepts reaver_pirate, leaves Concord + others ----
const vf = createVisualFactory(); installVisualOverrides(vf);
const pirateMesh = vf.build({ id: 'r', type: 'ship', team: 1, radius: 16, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, factionId: 'faction_reach', data: { defId: 'ship_drifter', lootTableId: 'reaver_pirate' } });
check('seam intercepts reaver_pirate', !!pirateMesh && pirateMesh.userData.assetId === 'SF_REACH_REAVER_PIRATE');
// A non-pirate, non-Concord enemy stays procedural.
const neutralMesh = vf.build({ id: 'n', type: 'ship', team: 1, radius: 14, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, data: { defId: 'ship_wasp', lootTableId: 'some_other' } });
check('non-pirate enemy uses procedural path', !!neutralMesh && neutralMesh.userData.assetId !== 'SF_REACH_REAVER_PIRATE');

console.log(`\n${ok} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
