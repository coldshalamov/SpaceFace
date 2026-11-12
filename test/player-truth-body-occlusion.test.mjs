import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { installPlayerTruthReader, measurePlayerTruthBodyOcclusion, playerTruthOpaqueBounds } from '../src/testing/playerTruth/reader.js';
import { summarizeBodyOcclusion, analyzeReadability } from '../scripts/player-truth/readability.mjs';
import { checkReadability, CLS, VIS } from '../scripts/player-truth/checks.mjs';

// CPU depth/triangle raster over the actual Three geometry. No browser/GPU acceptance claim.
function fixture({ count = 1, front = true, triangle = false, failDraw = 0 } = {}) {
  const width = 40; const height = 40; const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x556677);
  const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
  camera.position.set(0, 30, 0); camera.up.set(0, 0, -1); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
  const player = new THREE.Mesh(new THREE.BoxGeometry(triangle ? 1 : 8, 2, triangle ? 1 : 6),
    new THREE.MeshStandardMaterial({ color: 0xffcd55 }));
  if (triangle) player.position.set(3, 0, 3);
  scene.add(player); const bodies = [];
  for (let i = 0; i < count; i++) {
    let geometry;
    if (triangle) {
      geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute([-6, 0, -6, -6, 0, 6, 6, 0, -6], 3));
    } else geometry = new THREE.BoxGeometry(8, 2, 4);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x2c2926, side: THREE.DoubleSide }));
    mesh.position.y = front ? 5 + i : -5 - i; scene.add(mesh);
    bodies.push({ id: 2 + i, cls: 'station', ty: 7, mesh });
  }
  const effect = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial({
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  const instrument = effect.clone(); instrument.userData.presentationRole = 'target-instrument';
  scene.add(effect, instrument); scene.updateMatrixWorld(true);
  let target = { original: true }; const originalTarget = target;
  let clearColor = new THREE.Color(0x123456); let clearAlpha = 0.4; const draws = [];
  const raycaster = new THREE.Raycaster(); const pointer = new THREE.Vector2();
  const renderer = {
    isWebGLRenderer: true, domElement: { clientWidth: width, clientHeight: height, width, height },
    info: { autoReset: true, render: { calls: 9, triangles: 99 } }, shadowMap: { autoUpdate: true },
    getDrawingBufferSize(out) { return out.set(width, height); },
    getRenderTarget() { return target; }, setRenderTarget(next) { target = next; },
    getClearColor(out) { return out.copy(clearColor); }, getClearAlpha() { return clearAlpha; },
    setClearColor(value, alpha) { clearColor = new THREE.Color(value); clearAlpha = alpha; }, clear() {},
    render() { if (target?.isWebGLRenderTarget) assert.equal(target.texture.colorSpace, THREE.NoColorSpace,
      'native target applies no SRGB transfer to the 16-step ID channel');
      if (player.material.blending === THREE.NoBlending) {
        assert.equal(player.material.toneMapped, false);
        assert.equal(player.material.color.r, 1);
        for (const body of bodies) if (body.mesh.material.blending === THREE.NoBlending) {
          assert.ok(Number.isInteger(body.mesh.material.color.r * 255 / 16));
        }
      }
      draws.push({ player: player.visible, bodies: bodies.map(body => body.mesh.visible),
      effect: effect.visible, instrument: instrument.visible });
      renderer.info.render.calls++; renderer.info.render.triangles += 8;
      if (draws.length === failDraw) throw new Error('controlled body-mask failure');
    },
    readRenderTargetPixels(_rt, _x, _y, w, h, pixels) {
      pixels.fill(0); const visible = [];
      scene.traverseVisible(o => { if (o.isMesh && o.material.visible !== false) visible.push(o); });
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        pointer.set((x + 0.5) / w * 2 - 1, (y + 0.5) / h * 2 - 1);
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObjects(visible, false)[0];
        if (!hit) continue;
        const color = hit.object.material.color; const offset = (y * w + x) * 4;
        pixels[offset] = Math.round(color.r * 255); pixels[offset + 1] = Math.round(color.g * 255);
        pixels[offset + 2] = Math.round(color.b * 255); pixels[offset + 3] = 255;
      }
    },
  };
  const original = { playerMaterial: player.material, bodyMaterials: bodies.map(body => body.mesh.material),
    background: scene.background, clearColor: clearColor.clone(), clearAlpha };
  const measure = (opts = {}) => measurePlayerTruthBodyOcclusion({ THREE, renderer, scene, camera,
    playerMesh: player, bodies, playerBox: playerTruthOpaqueBounds(THREE, player, camera, width, height),
    vw: width, vh: height, width, height,
    draw(pixels) { renderer.setRenderTarget({ width, height }); renderer.clear(); renderer.render(scene, camera);
      renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels); }, ...opts });
  return { width, height, scene, camera, player, bodies, effect, instrument, renderer, draws,
    original, originalTarget, measure,
    dispose() { for (const mesh of [player, ...bodies.map(body => body.mesh), effect]) { mesh.geometry.dispose(); mesh.material.dispose(); } },
  };
}

test('native ownership masks distinguish real foreground cover from an opaque panel behind the hull', () => {
  for (const front of [true, false]) {
    const h = fixture({ front });
    try {
      const receipt = h.measure();
      assert.equal(receipt.extraDraws, 2); assert.equal(receipt.rows[0].status, 'measured');
      assert.ok(receipt.playerPixels > 0);
      assert.equal(receipt.rows[0].pixels > 0, front);
      assert.equal(h.draws[0].bodies[0], false); assert.equal(h.draws[1].bodies[0], true);
      assert.ok(h.draws.every(draw => !draw.effect && !draw.instrument));
    } finally { h.dispose(); }
  }
});

test('empty actual mesh-box corners never become player occlusion', () => {
  const h = fixture({ triangle: true });
  try {
    const receipt = h.measure();
    assert.equal(receipt.extraDraws, 2, 'AABB intersection alone cannot decide coverage');
    assert.equal(receipt.rows[0].status, 'measured'); assert.equal(receipt.rows[0].pixels, 0);
    h.bodies[0].mesh.position.x = 20; h.scene.updateMatrixWorld(true);
    const disjoint = h.measure(); assert.equal(disjoint.extraDraws, 0);
    assert.equal(disjoint.rows[0].reason, 'disjoint-opaque-bounds');
  } finally { h.dispose(); }
});

test('mask success and failure restore every touched live material, visibility and render state', () => {
  for (const failDraw of [0, 2]) {
    const h = fixture({ failDraw });
    try {
      const receipt = h.measure();
      assert.equal(!!receipt.error, !!failDraw);
      if (failDraw) { assert.equal(receipt.rows[0].status, 'unknown'); assert.equal(receipt.rows[0].reason, 'mask-draw-error'); }
      assert.equal(h.player.material, h.original.playerMaterial);
      assert.equal(h.bodies[0].mesh.material, h.original.bodyMaterials[0]);
      assert.ok([h.player, h.bodies[0].mesh, h.effect, h.instrument].every(mesh => mesh.visible));
      assert.equal(h.scene.background, h.original.background);
      assert.equal(h.renderer.getRenderTarget(), h.originalTarget);
      assert.deepEqual(h.renderer.getClearColor(new THREE.Color()), h.original.clearColor);
      assert.equal(h.renderer.getClearAlpha(), h.original.clearAlpha);
      assert.equal(h.renderer.info.autoReset, true); assert.equal(h.renderer.shadowMap.autoUpdate, true);
      assert.deepEqual(h.renderer.info.render, { calls: 9, triangles: 99 });
    } finally { h.dispose(); }
  }
});

test('candidate caps and unsupported player geometry retain explicit UNKNOWN', () => {
  const h = fixture({ count: 2, front: false });
  try {
    const capped = h.measure({ maxCandidates: 1 }); assert.equal(capped.extraDraws, 2);
    assert.equal(capped.rows[0].pixels, 0); assert.equal(capped.rows[1].status, 'unknown');
    assert.equal(capped.rows[1].reason, 'candidate-cap');
    const original = h.player.material;
    h.player.material = new THREE.ShaderMaterial();
    const unsupported = h.measure(); assert.equal(unsupported.extraDraws, 0);
    assert.ok(unsupported.rows.every(row => row.reason === 'unsupported-player-silhouette'));
    h.player.material.dispose(); h.player.material = original;
  } finally { h.dispose(); }
});

test('source vertex hooks, displacement and morph poses cannot borrow raw-box or Basic-mask PASS', () => {
  const h = fixture({ front: false });
  try {
    const body = h.bodies[0].mesh; const compile = body.material.onBeforeCompile;
    body.material.onBeforeCompile = shader => { shader.vertexShader += '\n// displaced'; };
    assert.equal(h.measure().rows[0].reason, 'unsupported-vertex-pose');
    assert.equal(playerTruthOpaqueBounds(THREE, body, h.camera, h.width, h.height), null);
    body.material.onBeforeCompile = compile;
    const beforeRender = h.player.onBeforeRender;
    h.player.onBeforeRender = () => {};
    assert.equal(h.measure({ playerBox: [10, 10, 30, 30] }).rows[0].reason, 'unsupported-player-silhouette');
    h.player.onBeforeRender = beforeRender;
    body.material.displacementMap = new THREE.Texture();
    assert.equal(h.measure().rows[0].reason, 'unsupported-vertex-pose');
    body.material.displacementMap.dispose(); body.material.displacementMap = null;
    body.geometry.morphAttributes.position = [body.geometry.attributes.position.clone()];
    assert.equal(h.measure().rows[0].reason, 'unsupported-vertex-pose');
    delete body.geometry.morphAttributes.position;
    assert.equal(h.measure().rows[0].status, 'measured');
  } finally { h.dispose(); }
});

function samples({ pixels = 0, unknown = 0, stale = false } = {}) {
  return Array.from({ length: 5 }, (_, i) => ({ t: i * 100, sim: i / 10, mode: 'flight',
    run: { ph: 'active' }, e: [[2, CLS.station, 0, 0, 0, 0, 20, 20, 8, VIS.onscreen, 0, 7]],
    px: { bodyOcclusion: { version: 1, method: 'native-opaque-id-depth', rows: [{
      id: stale ? 1000002 : 2, cls: 'station', ty: 7, status: i < unknown ? 'unknown' : 'measured',
      reason: 'candidate-cap', pixels, playerPixels: 50, box: [15, 15, 25, 25],
    }] } } }));
}
function report(group, fallback = {}) {
  return { readability: { classes: { enemy: { n: 5, lowContrastFrac: 0 }, asteroid: { n: 5, lowContrastFrac: 0 } },
    pairs: [{ a: 'enemy', b: 'asteroid', nA: 5, nB: 5, sep: 3 }],
    census: [{ cls: 'station', ty: 7, n: 11, look: 'dark', meanRadiusPx: 40, overPlayerFrac: 0.27,
      ...(group ? { occlusion: group } : {}), ...fallback }] } };
}

test('readability uses actual pixel ownership at the unchanged five-sample/20% boundary', async () => {
  const clear = summarizeBodyOcclusion(samples()).get('station|7');
  assert.equal(checkReadability(report(clear)).status, 'PASS', '27% broad-box overlap is diagnostic');
  const coverSamples = samples(); coverSamples[0].px.bodyOcclusion.rows[0].pixels = 1;
  const covered = summarizeBodyOcclusion(coverSamples).get('station|7');
  assert.equal(covered.covered, 1); assert.equal(covered.n, 5);
  assert.equal(checkReadability(report(covered)).status, 'FAIL', 'one actual covered frame out of five is still 20%');
  assert.equal(checkReadability(report({ ...clear, n: 4 })).status, 'UNKNOWN');
  assert.equal(checkReadability(report(summarizeBodyOcclusion(samples({ unknown: 1 })).get('station|7'))).status, 'UNKNOWN');
  assert.equal(checkReadability(report()).status, 'UNKNOWN', 'legacy boxes cannot establish actual cover');
  assert.equal(checkReadability(report(summarizeBodyOcclusion(samples({ stale: true })).get('station|7'))).status, 'UNKNOWN');
  const analyzed = await analyzeReadability([], () => null, coverSamples);
  assert.equal(analyzed.census[0].occlusion.covered, 1, 'native receipts retain observations without a screenshot interval');
});

test('the installed reader wires masks into its existing native cadence and reuses cached materials', () => {
  const h = fixture({ front: false }); let callback;
  const entities = [{ id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 4 },
    { id: 2, type: 'station', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 8, data: { roomKind: 'plate' } }];
  const win = { performance: { now: () => 100 }, addEventListener() {}, removeEventListener() {},
    requestAnimationFrame(fn) { callback = fn; return 1; }, cancelAnimationFrame() {},
    SF: { THREE, state: { mode: 'flight', simTime: 1, playerId: 1, entityList: entities,
      render: { renderer: h.renderer, scene: h.scene, camera: h.camera, meshes: new Map([[1, h.player], [2, h.bodies[0].mesh]]) } } } };
  const reader = installPlayerTruthReader(win, { pxEvery: 2, vfxEvery: 1000 });
  try {
    reader.start(); callback(); assert.equal(reader.drain().samples[0].px, undefined);
    callback(); const sample = reader.drain().samples[0];
    assert.equal(sample.px.bodyOcclusion.extraDraws, 2);
    assert.equal(sample.px.bodyOcclusion.rows[0].pixels, 0); assert.equal(h.draws.length, 5);
    assert.equal(sample.px.bodyOcclusion.rows[0].id, sample.e[0][0]);
    callback(); callback(); assert.equal(reader.drain().samples.at(-1).px.bodyOcclusion.extraDraws, 2);
    assert.equal(h.draws.length, 10); assert.equal(h.renderer.getRenderTarget(), h.originalTarget);
  } finally { reader.dispose(); h.dispose(); }
});
