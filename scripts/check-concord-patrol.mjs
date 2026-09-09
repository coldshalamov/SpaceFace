// Concord Patrol Interdictor smoke test (spec §8.2, Phase 3 §20).
//
// Verifies the bespoke lawful-authority builder produces a structurally-correct mesh that honors the
// §8.2 grammar contract: bilateral/symmetric, serialized twin nacelles, chrome axial spine, regulated
// paired formation lights, compact insignia, sockets, and the override seam intercepts the Concord
// patrol NPC while leaving other entities on the procedural path. Headless (mirrors check-kestrel-hero).
//
// Run: node scripts/check-concord-patrol.mjs
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

const THREE = await import('three');
globalThis.THREE = THREE;
const { buildConcordPatrol } = await import('../src/render/ships/concordPatrol.js');
const { installVisualOverrides } = await import('../src/render/visualOverrides.js');
const { createVisualFactory } = await import('../src/render/visualFactory.js');

let ok = 0, fail = 0;
function check(label, cond, detail = '') {
  if (cond) { ok++; } else { fail++; console.log(`FAIL  ${label}${detail ? '  —  ' + detail : ''}`); }
}

// ---- build directly ----
let root;
try {
  root = buildConcordPatrol({ id: 'c', type: 'ship', team: 1, radius: 18, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, data: { defId: 'ship_hornet', lootTableId: 'patrol_lawman' } });
  check('buildConcordPatrol does not throw', !!root);
} catch (e) { console.log(`ERR build threw: ${e.message}`); process.exit(1); }

// ---- sockets (weapon/engine/trail/camera) ----
const sockets = new Set();
root.traverse((o) => { if (o.userData && o.userData.spacefaceSocket && o.name) sockets.add(o.name); });
check('has SOCKET_Weapon_Front', sockets.has('SOCKET_Weapon_Front'));
check('has SOCKET_Engine_Main', sockets.has('SOCKET_Engine_Main'));
check('has SOCKET_Trail_Main', sockets.has('SOCKET_Trail_Main'));
check('has SOCKET_Camera_Focus', sockets.has('SOCKET_Camera_Focus'));

// ---- §8.2 grammar: bilateral symmetry — twin nacelles, paired formation lights, paired insignia ----
let portNacelle = false, stbdNacelle = false, portInsignia = false, stbdInsignia = false;
let formLights = 0;
root.traverse((o) => {
  if (o.name && o.name.includes('Nacelle_Body_Port')) portNacelle = true;
  if (o.name && o.name.includes('Nacelle_Body_Starboard')) stbdNacelle = true;
  if (o.name === 'Concord_Insignia_Port') portInsignia = true;
  if (o.name === 'Concord_Insignia_Starboard') stbdInsignia = true;
  if (o.name && o.name.startsWith('Concord_FormLight_')) formLights++;
});
check('§8.2 bilateral: twin nacelles present', portNacelle && stbdNacelle);
check('§8.2 bilateral: paired insignia', portInsignia && stbdInsignia);
check('§8.2 regulated: paired formation lights (>=8, even)', formLights >= 8 && formLights % 2 === 0, `lights=${formLights}`);

// ---- chrome axial spine + serialized planks (controlled chrome + repeated rhythm, §8.2) ----
let chromeSpine = false, planks = 0;
root.traverse((o) => {
  if (o.name === 'Concord_Axial_Spine') chromeSpine = true;
  if (o.name && o.name.startsWith('Concord_Plank_')) planks++;
});
check('§8.2 chrome axial spine present', chromeSpine);
check('§8.2 serialized planks (>=3 repeated)', planks >= 3, `planks=${planks}`);

// ---- contract + dimensions ----
check('assetId set', root.userData.assetId === 'SF_SCN_CONCORD_INTERDICTOR');
check('factionGrammar recorded', !!root.userData.renderContract.factionGrammar);
const box = new THREE.Box3().setFromObject(root); const size = new THREE.Vector3(); box.getSize(size);
check('authored length ~30m', size.x > 26 && size.x < 34, `length=${size.x.toFixed(1)}`);

// ---- override seam: intercepts Concord patrol, leaves others procedural ----
const vf = createVisualFactory(); installVisualOverrides(vf);
const concordMesh = vf.build({ id: 'c', type: 'ship', team: 1, radius: 18, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, factionId: 'faction_scn', data: { defId: 'ship_hornet', lootTableId: 'patrol_lawman', ai: { lawful: true } } });
check('seam intercepts Concord patrol', !!concordMesh && concordMesh.userData.assetId === 'SF_SCN_CONCORD_INTERDICTOR');
// A non-Concord enemy must stay procedural.
const otherMesh = vf.build({ id: 'r', type: 'ship', team: 1, radius: 14, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, factionId: 'faction_reach', data: { defId: 'ship_wasp', lootTableId: 'reaver_pirate' } });
check('non-Concord enemy uses procedural path', !!otherMesh && otherMesh.userData.assetId !== 'SF_SCN_CONCORD_INTERDICTOR');

console.log(`\n${ok} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
