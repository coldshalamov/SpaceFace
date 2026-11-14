import test from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry, Color, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene, Texture } from 'three';
import { captureReadyFleetLookFrame, installFleetLook, renderOnce, withFleetLookMaterialFactors } from '../src/render/fleetLook.js';

function fixture() {
  const scene = { updates: 0, updateMatrixWorld() { this.updates++; } };
  const camera = {};
  const renderer = { rawDraws: 0, render() { this.rawDraws++; } };
  return { scene, camera, renderer };
}

test('fleet look uses the renderer-selected post route, including native presentation', () => {
  for (const route of ['bloom', 'native']) {
    const { scene, camera, renderer } = fixture();
    let observed = null;
    const owner = {
      _selectPostRoute() { return route; },
      _renderPostRoute(...args) { observed = args; },
    };
    renderOnce(renderer, scene, camera, owner);
    assert.deepEqual(observed, [route, scene, camera, 0]);
    assert.equal(scene.updates, 1);
    assert.equal(renderer.rawDraws, 0);
  }
});

test('fleet look rejects route selection and presentation errors instead of capturing a raw frame', async () => {
  for (const failingMethod of ['_selectPostRoute', '_renderPostRoute']) {
    const { scene, camera, renderer } = fixture();
    const owner = {
      _selectPostRoute() { return 'bloom'; },
      _renderPostRoute() {},
      [failingMethod]() { throw new Error(`injected ${failingMethod} failure`); },
    };
    let captures = 0;
    await assert.rejects(captureReadyFleetLookFrame({
      root: new Group(), isActive: () => true,
      draw: () => renderOnce(renderer, scene, camera, owner),
      capture: () => { captures++; return 'incorrect raw frame'; },
      settle: async () => {}, maxAttempts: 1,
    }), new RegExp(`injected ${failingMethod} failure`));
    assert.equal(renderer.rawDraws, 0);
    assert.equal(captures, 0);
  }
});

test('fleet look rejects an unavailable production route', () => {
  for (const owner of [null, {}, { _renderPostRoute() {} }, { _selectPostRoute() {} }]) {
    const { scene, camera, renderer } = fixture();
    assert.throws(() => renderOnce(renderer, scene, camera, owner), /fleet-look.*post route.*unavailable/i);
    assert.equal(renderer.rawDraws, 0);
  }
});

test('A/B factors are applied once per shared material and restored on success or error', () => {
  const material = new MeshStandardMaterial({ color: new Color().setRGB(0.6, 0.4, 0.2),
    envMapIntensity: 2, emissiveIntensity: 4 });
  const originalColor = material.color.clone();
  const root = new Group();
  root.add(new Mesh(new BoxGeometry(), material), new Mesh(new BoxGeometry(), [material, material]));
  for (const fail of [false, true]) {
    const action = () => withFleetLookMaterialFactors(root, { env: 0.5, emissive: 0.25, color: 0.5 }, () => {
      assert.equal(material.envMapIntensity, 1);
      assert.equal(material.emissiveIntensity, 1);
      assert.deepEqual(material.color.toArray(), originalColor.clone().multiplyScalar(0.5).toArray());
      if (fail) throw new Error('draw failed');
    });
    if (fail) assert.throws(action, /draw failed/);
    else action();
    assert.equal(material.envMapIntensity, 2);
    assert.equal(material.emissiveIntensity, 4);
    assert.deepEqual(material.color.toArray(), originalColor.toArray());
  }
});

test('a failed A/B shot restores the live scene before the next shot', async () => {
  const scene = new Scene();
  const environment = new Texture();
  const background = new Color(0x203040);
  scene.environment = environment;
  scene.background = background;
  const material = new MeshStandardMaterial({ color: new Color().setRGB(0.6, 0.4, 0.2),
    envMapIntensity: 2, emissiveIntensity: 4 });
  const originalColor = material.color.clone();
  let rawDraws = 0;
  const renderer = { render() { rawDraws++; }, getContext() { return {}; }, renderBufferDirect() {} };
  let routeDraws = 0;
  const owner = {
    _selectPostRoute() { return 'bloom'; },
    _renderPostRoute() {
      assert.equal(scene.environment, null);
      assert.equal(scene.background, null);
      // The readiness draw is unmodified; A/B factors exist only for the final draw.
      if (++routeDraws === 1) {
        assert.equal(material.envMapIntensity, 2);
        return;
      }
      assert.equal(material.envMapIntensity, 1);
      assert.equal(material.emissiveIntensity, 1);
      assert.deepEqual(material.color.toArray(), originalColor.clone().multiplyScalar(0.5).toArray());
      throw new Error('injected post failure');
    },
  };
  const vf = {
    build(entity) {
      // Avoid an asset fetch while exercising the real shoot and scene cleanup path.
      entity.data.enemyTypeId = 'enemy_iron_kraken';
      const root = new Group();
      root.userData.ironKrakenRig = true;
      root.add(new Mesh(new BoxGeometry(), material), new Mesh(new BoxGeometry(), material));
      return root;
    },
  };
  const oldWindow = globalThis.window;
  globalThis.window = {};
  try {
    installFleetLook({
      state: { render: { renderer, scene, camera: new PerspectiveCamera(), vf,
        compileObjectPipelines: async () => ({}) } },
      registry: { get: () => owner },
    });
    await assert.rejects(window.SF_fleetLook.shoot({
      defId: 'ship_kestrel', ab: { noEnvironment: true, noBackground: true, env: 0.5, emissive: 0.25, color: 0.5 },
    }), /injected post failure/);
    assert.equal(scene.environment, environment);
    assert.equal(scene.background, background);
    assert.equal(material.envMapIntensity, 2);
    assert.equal(material.emissiveIntensity, 4);
    assert.deepEqual(material.color.toArray(), originalColor.toArray());
    assert.equal(rawDraws, 0);
    assert.equal(routeDraws, 2);
  } finally {
    if (oldWindow === undefined) delete globalThis.window;
    else globalThis.window = oldWindow;
  }
});
