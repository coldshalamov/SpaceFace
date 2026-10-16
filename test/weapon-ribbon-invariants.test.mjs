import assert from 'node:assert/strict';
import test from 'node:test';

// Actual pre-hoist buffers: preserve every Float32 attribute byte, topology and lifetime.
import { createHash } from 'node:crypto';
import { WeaponRibbonPool, RIBBON_PROFILE } from '../src/render/weapons/ribbonPool.js';

const views = [
  { name: 'near', camera: { x: 3, y: 4, z: -5 }, fov: 50, height: 1000 },
  { name: 'far-wide', camera: { x: -8000, y: 3000, z: 9000 }, fov: 113, height: 317 },
  { name: 'near-zero-fov', camera: { x: 0, y: 0, z: 0 }, fov: 0, height: 1 },
  { name: 'invalid-tuning', camera: { x: NaN, y: Infinity, z: undefined }, fov: NaN, height: NaN },
];

function ribbonWitness(profile, view) {
  const pool = new WeaponRibbonPool(null, { capacity: 4, segments: 24 });
  const hash = createHash('sha256');
  const record = () => {
    for (const key of ['position', 'color', 'alpha', 'uv', 'normal', 'shape', 'hist', 'histLen',
      'age', 'phase', 'lingerAge', 'alive', 'entityIds', 'drawSlots']) {
      const array = pool[key];
      hash.update(key);
      hash.update(Buffer.from(array.buffer, array.byteOffset, array.byteLength));
    }
    const index = pool.geometry.index.array;
    hash.update(Buffer.from(index.buffer, index.byteOffset, index.byteLength));
    hash.update(JSON.stringify({ live: pool.live, visible: pool.mesh.visible,
      drawRange: pool.geometry.drawRange, modulation: pool.material.uniforms.uModulation.value,
      uploadedBytes: pool.uploadedBytesLastFrame, byEntity: [...pool.byEntity],
      attributes: pool._dynamicAttributes.map(attribute => ({ version: attribute.version, ranges: attribute.updateRanges })) }));
  };
  try {
    pool.setCamera({ fov: view.fov }, view.height);
    if (view.name === 'invalid-tuning') {
      pool._fovDeg = view.fov;
      pool._viewportHeight = view.height;
    }
    for (let i = 0; i < 4; i++) {
      pool.spawn({ entityId: 17 + i, x: i - 1, y: i * 0.3, z: -i,
        width: [0.18, 0.38, 0.57, 0.9][i], linger: 0.2 + i * 0.07,
        colorHead: '#18b4ef', colorTail: '#d53b21', profile });
    }
    pool.update(1 / 60, view.camera);
    record();
    // Partial and full histories include straight, curved, vertical and stationary paths.
    for (let s = 1; s < 29; s++) {
      pool.pushHead(17, s * 0.7, 0.3, -s * 0.2);
      pool.pushHead(18, 3 * Math.sin(s * 0.2), Math.cos(s * 0.17), s * 0.4);
      pool.pushHead(19, 1, s * 0.6, -2);
      pool.pushHead(20, 2, 0.9, -3);
      if (s === 8 || s === 28) { pool.update(1 / 30, view.camera); record(); }
    }
    pool.release(18);
    pool.update(0.031, view.camera, { id: 'reduced-motion' });
    record();
    pool.update(-0.01, null, { id: 'reduced-flash' });
    record();
    pool.update(NaN, { x: 1e8, y: -2e8, z: 3e8 }, { id: 'reduced-motion-and-flash' });
    record();
    pool.update(0.3, view.camera);
    record();
    for (const id of [17, 19, 20]) pool.release(id);
    pool.update(2, view.camera);
    record();
    pool.update(1 / 60, view.camera);
    record();
    return hash.digest('hex');
  } finally { pool.dispose(); }
}


const EXPECTED = {
  "CORD/near": "47a8f20b1b269d2a5a60806cc2f101c4b5e57e3f0882bbc21de9584face9338d",
  "CORD/far-wide": "0aee2538e55ce7e9798f510242201d05a492a5d5146cc8de4a79f982133859ea",
  "CORD/near-zero-fov": "acfeaec31e29170971c05ef1b66c57fa355635cb349db6159e2ed841cd007230",
  "CORD/invalid-tuning": "2c92e4353d58df40285a7d6d8b55d6dea6f39663abe2010f9636a3fd1290b392",
  "BRAID/near": "a867a2aa4adea2463732db9c74cd1dd2e1855b56d0858d2b34215eeee8a2b043",
  "BRAID/far-wide": "048d302d9a6938508cef3eff5c2f1c7cedb302d8b524304d2a9a50b1a50e2d86",
  "BRAID/near-zero-fov": "85151242a888e05402406e13e044dd67ba825c1d6d0fbde1e92f8dc76e22f862",
  "BRAID/invalid-tuning": "aa9a6a02fcc02343ea0dd4d50b316433977fd72fed5261278b3ad9957d028372",
  "FORK/near": "903e1d1806c390ee5cac68826a7d178225a1b500a925e7b8c85114b2c0e254cf",
  "FORK/far-wide": "6cf9c7ebb19d5ac4655b6e9cbc8f51f5f08c7a0f4e7bbb95429bf50d5b05af02",
  "FORK/near-zero-fov": "8b88af1733bcd7fc151ccb4f878fa56f1afc3af94e4d209019ce85ea8e1b6b32",
  "FORK/invalid-tuning": "a36b2aee84a8c03d6dedfbcf1e1592592f8b8893776f0823f448c1ee8057469c",
  "SHEET/near": "695d3ceccde65e8dace753178d1c7c374cf9ffb78457649700d6ccaba78bc9b7",
  "SHEET/far-wide": "635e2fa539d84763d384b03af3cbf4ef3d622445efb155773757fef10ae75ad4",
  "SHEET/near-zero-fov": "181cea5e9a4ce8b22b5a4823cca47e6669d24070688aa72a78194eb39c289da9",
  "SHEET/invalid-tuning": "0850467e3f2d32b379c58a94625a393ea7964a60398ecc3dede53323e703b02c",
  "FILAMENT/near": "3c2ff081f7d581da7c3e0f8f1922f0113f0fe4d72fc19329a860de0e957454c2",
  "FILAMENT/far-wide": "4212c5de9f323d212ce393ec15b7ae4efa472cbbedbf96dbdcff02ca58807076",
  "FILAMENT/near-zero-fov": "ee4038542a82f448bdd9b89eb20bcc30ddedcd12115f2952207f2d5e3024df59",
  "FILAMENT/invalid-tuning": "a3b24a393b5ad074a8275963a81a26e1558d02255a90891361aee6c795c96ec1"
};

for (const [name, profile] of Object.entries(RIBBON_PROFILE)) {
  for (const view of views) {
    test(`ribbon buffers preserve authored ${name} geometry and lifecycle at ${view.name}`, () => {
      assert.equal(ribbonWitness(profile, view), EXPECTED[`${name}/${view.name}`]);
    });
  }
}
