// 47-A visible assetRef smoke test.
//
// Verifies that every visible slice assetRef routes through authored runtime visuals instead of the
// generic fallback path. This covers the live runtime seam; SG-04 release compression is audited by
// check-sg04-release-assets.mjs.
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
const { build47aScenarioProp, SCENARIO_47A_PROP_ASSET_IDS } = await import('../src/render/scenarioProps47a.js');
const { installVisualOverrides } = await import('../src/render/visualOverrides.js');
const { createVisualFactory } = await import('../src/render/visualFactory.js');

let ok = 0, fail = 0;
function check(label, cond, detail = '') {
  if (cond) ok++;
  else { fail++; console.log(`FAIL  ${label}${detail ? '  —  ' + detail : ''}`); }
}

function socketsOf(root) {
  const sockets = new Set();
  root && root.traverse((o) => { if (o.userData && o.userData.spacefaceSocket && o.name) sockets.add(o.name); });
  return sockets;
}

function sizeOf(root) {
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  box.getSize(size);
  return size;
}

const propCases = [
  {
    ref: 'asset.slice.47a_spindle',
    type: 'payload',
    radius: 10,
    expected: SCENARIO_47A_PROP_ASSET_IDS['asset.slice.47a_spindle'],
    sockets: ['SOCKET_Tether_Massline', 'SOCKET_Camera_Focus'],
    names: ['Spindle_FalseMass_Cylinder', 'Spindle_Signal_Ring'],
  },
  {
    ref: 'asset.slice.bourse_carrier_wreck',
    type: 'wreck',
    radius: 92,
    expected: SCENARIO_47A_PROP_ASSET_IDS['asset.slice.bourse_carrier_wreck'],
    sockets: ['SOCKET_Hazard_Core', 'SOCKET_Camera_Focus'],
    names: ['Bourse_Carrier_Spine', 'Bourse_Fracture_Arc'],
  },
  {
    ref: 'asset.slice.civilian_pod',
    type: 'payload',
    radius: 8,
    expected: SCENARIO_47A_PROP_ASSET_IDS['asset.slice.civilian_pod'],
    sockets: ['SOCKET_Tether_Massline', 'SOCKET_Camera_Focus'],
    names: ['CivilianPod_Pressure_Capsule', 'CivilianPod_Distress_Beacon'],
  },
  {
    ref: 'asset.slice.kessler_handoff_beacon',
    type: 'beacon',
    radius: 80,
    expected: SCENARIO_47A_PROP_ASSET_IDS['asset.slice.kessler_handoff_beacon'],
    sockets: ['SOCKET_Handoff_Core', 'SOCKET_Camera_Focus'],
    names: ['HandoffBeacon_Covert_Ring', 'HandoffBeacon_Zone_Disc'],
  },
];

for (const c of propCases) {
  const entity = { id: c.ref, type: c.type, radius: c.radius, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, data: { assetRef: c.ref } };
  const root = build47aScenarioProp(entity);
  check(`${c.ref} direct builder returns root`, !!root);
  check(`${c.ref} assetId`, root && root.userData.assetId === c.expected, `assetId=${root && root.userData.assetId}`);
  check(`${c.ref} render contract`, !!(root && root.userData.renderContract && root.userData.renderContract.grammar));
  const sockets = socketsOf(root);
  check(`${c.ref} required sockets`, c.sockets.every((s) => sockets.has(s)), `sockets=[${[...sockets].join(',')}]`);
  const names = new Set();
  root && root.traverse((o) => { if (o.name) names.add(o.name); });
  check(`${c.ref} named hero parts`, c.names.every((name) => names.has(name)), `names=[${c.names.filter((name) => !names.has(name)).join(',')}]`);
  const size = sizeOf(root);
  check(`${c.ref} finite visible bounds`, size.x > 0 && size.y > 0 && size.z > 0 && Number.isFinite(size.x), `${size.x}x${size.y}x${size.z}`);
}

const vf = createVisualFactory();
installVisualOverrides(vf);
for (const c of propCases) {
  const mesh = vf.build({ id: `vf_${c.ref}`, type: c.type, radius: c.radius, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, data: { assetRef: c.ref } });
  check(`${c.ref} visualFactory seam`, !!mesh && mesh.userData.assetId === c.expected, `assetId=${mesh && mesh.userData.assetId}`);
}

const shipCases = [
  {
    ref: 'enemy_reaver_skirmisher',
    defId: 'ship_wasp',
    factionId: 'faction_reavers',
    expected: 'SF_REACH_REAVER_PIRATE',
  },
  {
    ref: 'enemy_reaver_tug',
    defId: 'ship_mule',
    factionId: 'faction_reavers',
    expected: 'SF_REACH_REAVER_PIRATE',
  },
  {
    ref: 'asset.slice.meridian_recovery_tug',
    defId: 'ship_mule',
    factionId: 'faction_scn',
    expected: 'SF_SCN_CONCORD_INTERDICTOR',
  },
];

for (const c of shipCases) {
  const mesh = vf.build({
    id: `ship_${c.ref}`,
    type: 'ship',
    team: c.factionId === 'faction_scn' ? 2 : 1,
    factionId: c.factionId,
    radius: 18,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    data: { defId: c.defId, assetRef: c.ref },
  });
  check(`${c.ref} ship assetRef seam`, !!mesh && mesh.userData.assetId === c.expected, `assetId=${mesh && mesh.userData.assetId}`);
  check(`${c.ref} ship sockets`, ['SOCKET_Engine_Main', 'SOCKET_Camera_Focus'].every((s) => socketsOf(mesh).has(s)));
}

const generic = vf.build({ id: 'generic_payload', type: 'payload', radius: 6, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, data: {} });
check('generic payload remains fallback', !generic || !generic.userData || !generic.userData.assetId);

console.log(`\n${ok} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
