import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BOLUS_SECTOR_ID } from '../src/data/theBolus.js';
import { tickBolus } from '../src/systems/theBolus.js';
import { buildFaunaMesh } from '../src/render/faunaVisuals.js';
import { preloadCreatureSkinLibrary } from '../src/render/creatureSkinLibrary.js';
import { render, disposeRendererOwnedResources } from '../src/render/renderer.js';

const flush = async () => { for (let i = 0; i < 100; i++) await Promise.resolve(); };
const deferred = () => {
  let resolve;
  const promise = new Promise(yes => { resolve = yes; });
  return { promise, resolve };
};

function fixture() {
  const player = { id: 'player', type: 'ship', alive: true, flags: {},
    pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, rot: 0 };
  const entity = { id: 'valve', type: 'fauna', alive: true, occupantGeneration: 1,
    homeSectorId: BOLUS_SECTOR_ID, flags: {}, radius: 24,
    pos: { x: -480, y: 0, z: 20 }, vel: { x: 0, y: 0, z: 0 }, rot: 0,
    physicsBody: { dynamic: true, mass: 40, radius: 8 },
    data: { ecology: { speciesId: 'bolus_valve' },
      bolus: { role: 'valve', key: 'bolus_valve_0', anchorX: -480, anchorZ: 20, phase: 0, hold: 0, spent: false } } };
  const scene = new THREE.Scene();
  const renderer = {};
  const state = { mode: 'flight', simTime: 0, playerId: player.id,
    player: { tether: { phase: 'loaded' }, cargo: { items: {}, capVolume: 100, usedVolume: 0, usedMass: 0 } },
    world: { currentSectorId: BOLUS_SECTOR_ID }, entities: new Map([[player.id, player], [entity.id, entity]]),
    entityList: [entity], combat: { attachments: { byId: { line: { state: 'active', ownerId: player.id, targetId: entity.id } } } },
    render: { scene, renderer, admissionRunGeneration: 1, compileObjectPipelines: async () => ({ ready: true }) } };
  const owner = Object.create(render);
  Object.assign(owner, { state, scene, renderer, _meshes: new Map(), _meshesVersion: 0,
    _meshResidencyShipCandidates: [], _meshResidencyOtherCandidates: [], _meshResidencySweep: {},
    _frameMembrane: { toLocal: pos => pos }, _shadowPolicyOptions: () => ({}),
    _presentationWorld: { handleForEntityId: id => ({ id }), bindMesh: () => true, unbindMesh: () => true },
    _persistentSubmitLanes: { reserve() {}, release() {} },
    _meshReleaseBatchBegin() {}, _meshReleaseBatchEnd() {} });
  const initial = buildFaunaMesh(entity);
  scene.add(initial); owner._meshes.set(entity.id, initial); owner._bindPresentationMesh(entity, initial);
  const candidates = [];
  owner.vf = { build(snapshot) { const m = buildFaunaMesh(snapshot); candidates.push(m); return m; } };

  // Drive the actual retained-mesh portion of the renderer's residency poll.
  const poll = () => {
    let visited = false;
    owner._syncFaunaSpeciesAppearance = (...args) => {
      visited = true;
      return render._syncFaunaSpeciesAppearance.apply(owner, args);
    };
    const steps = owner._reconcileMeshResidencySteps();
    for (let n = 0; n < 12 && !visited; n++) {
      const step = steps.next();
      if (step.done) break;
    }
    steps.return();
    delete owner._syncFaunaSpeciesAppearance;
    assert.equal(visited, true, 'the renderer poll visits the retained fauna root');
  };
  return { player, entity, state, scene, owner, initial, candidates, poll,
    close() { disposeRendererOwnedResources(owner); } };
}

test('a held Bolus valve becomes a prepared suture without repeatedly rebuilding', async () => {
  const skins = await preloadCreatureSkinLibrary(null, { loadTexture: async () => new THREE.Texture() });
  const t = fixture(); const gate = deferred(); let options;
  t.state.render.compileObjectPipelines = (_root, opts) => { options = opts; return gate.promise; };
  try {
    t.poll();
    assert.equal(t.candidates.length, 0, 'unchanged fauna do not rebuild');
    const world = { state: t.state, bus: { emit() {} }, _sectorOrigin: () => ({ x: 0, z: 0 }) };
    for (let i = 0; i < 13; i++) tickBolus(world, 0.1);
    assert.equal(t.entity.data.ecology.speciesId, 'bolus_suture');
    assert.deepEqual(t.initial.children.map(child => child.name), ['valve_lip']);
    assert.equal(
      t.initial.children[0].geometry.attributes.uv.count,
      t.initial.children[0].geometry.attributes.position.count,
    );
    assert.ok(t.initial.children[0].geometry.attributes.uv.count > 6);
    assert.equal(t.initial.children[0].material.map, skins.tissue.baseColor);
    assert.equal(t.initial.children[0].material.normalMap, skins.tissue.normal);
    t.poll(); await flush();
    const pending = t.owner._appearanceReplacements.get(t.entity.id);
    assert.ok(pending);
    assert.equal(t.entity.mesh, t.initial);
    assert.equal(t.initial.visible, true);
    assert.equal(t.candidates.length, 1);
    assert.equal(t.candidates[0].visible, false);
    assert.equal(options.strict, true);
    assert.equal(options.explicit, true);
    for (let i = 0; i < 3; i++) t.poll();
    assert.equal(t.owner._appearanceReplacements.get(t.entity.id), pending);
    assert.equal(t.candidates.length, 1, 'polls must not restart in-flight admission');
    t.entity.pos.x = -460;
    gate.resolve({ ready: true });
    assert.equal((await pending.completion).status, 'committed');
    assert.deepEqual(t.entity.mesh.children.map(child => child.name), ['suture_strap', 'suture_stitch']);
    assert.ok(t.entity.mesh.children.every(child => child.material.map === skins.tissue.baseColor
      && child.material.normalMap === skins.tissue.normal), 'the prepared successor retains the shared live skins');
    assert.equal(t.entity.mesh.position.x, -460, 'publication uses the current entity pose');
    assert.equal(t.entity.mesh.visible, true);
    assert.equal(t.initial.parent, null);
    t.poll();
    assert.equal(t.candidates.length, 1, 'the admitted species stays stable');
  } finally { gate.resolve({ ready: true }); t.close(); await flush(); }
});

test('stale species, occupant, sector and renderer generations cannot publish a suture', async () => {
  for (const change of ['species', 'occupant', 'entity', 'sector', 'renderer-generation', 'context-generation']) {
    const t = fixture(); const gate = deferred();
    t.owner._contextRecovery = { generation: 1 };
    t.state.render.compileObjectPipelines = () => gate.promise;
    try {
      t.entity.data.ecology.speciesId = 'bolus_suture';
      t.poll(); await flush();
      const pending = t.owner._appearanceReplacements.get(t.entity.id);
      assert.ok(pending, change);
      if (change === 'species') t.entity.data.ecology.speciesId = 'bolus_valve';
      if (change === 'occupant') t.entity.occupantGeneration++;
      if (change === 'entity') t.state.entities.set(t.entity.id, { ...t.entity });
      if (change === 'sector') t.state.world.currentSectorId = 'elsewhere';
      if (change === 'renderer-generation') t.state.render.admissionRunGeneration++;
      if (change === 'context-generation') t.owner._contextRecovery.generation++;
      gate.resolve({ ready: true });
      assert.equal((await pending.completion).status, 'retained', change);
      await flush();
      assert.equal(t.entity.mesh, t.initial, change);
      assert.equal(t.initial.parent, t.scene, change);
      assert.equal(t.candidates[0].parent, null, change);
      if (change === 'species') {
        t.poll();
        assert.equal(t.candidates.length, 1, 'a reverted request does not rebuild');
      }
    } finally { gate.resolve({ ready: true }); t.close(); await flush(); }
  }
});

test('failed fauna admission retains the old body and uses the bounded retry owner', async () => {
  const t = fixture();
  t.state.render.compileObjectPipelines = async () => ({ partial: true, ready: false });
  try {
    t.entity.data.ecology.speciesId = 'bolus_suture';
    t.poll();
    const first = t.owner._appearanceReplacements.get(t.entity.id);
    assert.equal((await first.completion).status, 'retained'); await flush();
    assert.equal(t.entity.mesh, t.initial);
    for (let i = 0; i < 3; i++) t.poll();
    assert.equal(t.candidates.length, 1, 'failed admission is not restarted each poll');
    t.state.render.compileObjectPipelines = async () => ({ ready: true });
    assert.equal(t.owner._retryAppearanceReplacement(t.entity, t.initial, Infinity), true);
    const retry = t.owner._appearanceReplacements.get(t.entity.id);
    assert.equal((await retry.completion).status, 'committed');
    assert.equal(t.entity.mesh.userData.speciesId, 'bolus_suture');
    assert.equal(t.candidates.length, 2);
  } finally { t.close(); await flush(); }
});
