import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';

// LOAD-03 — the Swarm door's sector-scene warm. While the crucible (Swarm arena/PLAY)
// screen is up, the renderer also warms the picked arena's sector recipe: the authored
// bodies, traffic hulls, debris-rock family and instanced rock programs the first survival
// cook otherwise links behind the veil. These tests pin the trigger (crucible screen +
// embark speculation), the retarget on arena change, the cancel on leaving, and the
// Adventure path staying untouched.

// No jsdom in this repo: hull panels paint to canvas, so stub document the way
// opening-species-warm does.
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

const { render: renderSystem } = await import('../src/render/renderer.js');
const { ROCK_BODIES } = await import('../src/data/rockSubstances.js');

const RENDERER_SOURCE = readFileSync(
  new URL('../src/render/renderer.js', import.meta.url), 'utf8',
);

function menuOwner(extra = {}) {
  const owner = Object.create(renderSystem);
  Object.assign(owner, {
    renderer: {},
    scene: new THREE.Scene(),
    vf: {},
    state: { mode: 'menu', render: {} },
    _menuSwarmSceneWarm: null,
    _menuSwarmSpec: null,
    _rosterPrewarmRoots: [],
    _rosterPrewarmPending: new Set(),
    _rosterPrewarmPendingLabels: new WeakMap(),
    _asteroidInstancePool: null,
    _contextLost: false,
    _noteShadowMeshAdded() {},
    _noteShadowMeshRemoved() {},
  }, extra);
  return owner;
}

test('sector-scene warm begins hidden, mounted, and owned by the shared prewarm lanes', () => {
  const owner = menuOwner();
  const warm = owner._beginMenuSwarmSceneWarm({ sectorId: 'sector_helios_prime', seed: 7 });
  assert.ok(warm, 'begin mints the cohort');
  assert.equal(owner._menuSwarmSceneWarm, warm);
  assert.equal(warm.sectorId, 'sector_helios_prime');
  assert.equal(warm.root.visible, false, 'warm subjects never draw');
  assert.equal(warm.root.parent, owner.scene, 'boundary requests need a mounted root');
  assert.equal(warm.root.userData.warmBuilding, true, 'park sweeps skip an admitting root');
  assert.ok(owner._rosterPrewarmRoots.includes(warm.root),
    'run-end release and reskin sweeps reach the root');
  warm.building = false;
  owner._menuSwarmSceneWarm = null;
});

test('sector-scene warm refuses behind flight and without a sector', () => {
  const flight = menuOwner({ state: { mode: 'flight', render: {} } });
  assert.equal(
    flight._beginMenuSwarmSceneWarm({ sectorId: 'sector_helios_prime' }), null,
    'a live run owns its scene — mid-run crucible screens mint nothing');
  const noSector = menuOwner();
  assert.equal(noSector._beginMenuSwarmSceneWarm({ seed: 1 }), null);
  assert.equal(noSector._beginMenuSwarmSceneWarm(null), null);
});

test('the arm is a same-sector no-op and a sector change retargets', () => {
  const owner = menuOwner();
  owner._armMenuSwarmSceneWarm({ sectorId: 'sector_helios_prime' });
  const first = owner._menuSwarmSceneWarm;
  assert.ok(first && first.sectorId === 'sector_helios_prime');
  // A same-sector re-arm (speculation re-posted by picker dwell) keeps the cohort.
  owner._armMenuSwarmSceneWarm({ sectorId: 'sector_helios_prime' });
  assert.equal(owner._menuSwarmSceneWarm, first, 'same sector must not restart the work');
  // The arena pick flipped: the old cohort dies, the new sector's warm mints.
  owner._armMenuSwarmSceneWarm({ sectorId: 'sector_ceres_belt' });
  const second = owner._menuSwarmSceneWarm;
  assert.ok(second && second !== first, 'sector change replaces the cohort');
  assert.equal(second.sectorId, 'sector_ceres_belt');
  assert.equal(first.building, false, 'the replaced cohort stops admitting');
  assert.equal(first.root.parent, null, 'the replaced root leaves the scene');
  assert.ok(!owner._rosterPrewarmRoots.includes(first.root));
  assert.ok(owner._rosterPrewarmRoots.includes(second.root));
  second.building = false;
  owner._menuSwarmSceneWarm = null;
});

test('leaving the menu warm discards the scene cohort and its speculation', () => {
  const owner = menuOwner({
    _earlyCrucibleWarm: { root: new THREE.Group() },
    _earlyCrucibleWarmMenu: true,
  });
  owner._menuSwarmSpec = { sectorId: 'sector_helios_prime', seed: 3 };
  owner._armMenuSwarmSceneWarm(owner._menuSwarmSpec);
  const warm = owner._menuSwarmSceneWarm;
  assert.ok(warm);
  owner._discardEarlyCrucibleWarm();
  assert.equal(owner._menuSwarmSceneWarm, null, 'scene cohort dies with the menu warm');
  assert.equal(owner._menuSwarmSpec, null, 'stale speculation cannot re-arm it');
  assert.equal(warm.building, false);
  assert.equal(warm.root.parent, null);
  assert.ok(!owner._rosterPrewarmRoots.includes(warm.root));
});

test('ordinary Swarm adopts both menu warms while the opening equipment screen holds round zero', () => {
  const roster = { root: new THREE.Group(), swarmScoped: true, waveBase: 1 };
  const room = { root: new THREE.Group(), sectorId: 'sector_helios_prime', building: true };
  const owner = menuOwner({
    state: { mode: 'loading', run: { kind: 'survival', ruleset: 'swarm', phase: 'draft', wave: 0 } },
    _earlyCrucibleWarm: roster,
    _earlyCrucibleWarmMenu: true,
    _menuSwarmSceneWarm: room,
    _rosterPrewarmRoots: [roster.root, room.root],
    _beginCrucibleBoundedRosterWarm() {},
    _topUpEarlyCrucibleWarmPlayerSpec() {},
  });
  owner.scene.add(roster.root, room.root);

  owner._beginEarlyCrucibleRosterWarm();

  assert.equal(owner._earlyCrucibleWarm, roster);
  assert.equal(owner._earlyCrucibleWarmMenu, false);
  assert.equal(owner._menuSwarmSceneWarm, room);
  assert.equal(room.root.parent, owner.scene);
  assert.equal(room.building, true);
});

test('a checkpoint armory keeps a warm scoped to the bought round', () => {
  const roster = { root: new THREE.Group(), swarmScoped: true, waveBase: 11 };
  const owner = menuOwner({
    state: {
      mode: 'loading',
      run: { kind: 'survival', ruleset: 'swarm', phase: 'draft', wave: 10, telemetry: { startWave: 11 } },
    },
    _earlyCrucibleWarm: roster,
    _rosterPrewarmRoots: [roster.root],
    _beginCrucibleBoundedRosterWarm() {},
    _topUpEarlyCrucibleWarmPlayerSpec() {},
  });
  owner.scene.add(roster.root);

  owner._beginEarlyCrucibleRosterWarm();

  assert.equal(owner._earlyCrucibleWarm, roster);
});

test('the Swarm warm run excludes campaign places, mints the rock cohort, and settles clean', async () => {
  const compiled = [];
  const requests = [];
  const owner = menuOwner({
    state: {
      mode: 'menu',
      render: { compileObjectPipelines: async (subject) => { compiled.push(subject); return { ok: true }; } },
    },
    bloom: { prepareResources: async () => ({ warmed: true }) },
    _rosterPrewarmPendingLabels: { set(_promise, label) { requests.push(label); } },
  });
  const warm = {
    root: new THREE.Group(),
    sectorId: 'sector_helios_prime',
    arenaOnly: true,
    building: true,
  };
  warm.root.visible = false;
  warm.root.userData.warmBuilding = true;
  owner.scene.add(warm.root);
  owner._menuSwarmSceneWarm = warm;
  await owner._runMenuSwarmSceneWarm(warm, { sectorId: 'sector_helios_prime', seed: 42 });
  assert.equal(warm.building, false, 'settle drops the building latch');
  assert.equal(warm.root.userData.warmBuilding, false);
  assert.equal(warm.root.parent, null, 'a settled cohort leaves the presented scene');
  assert.ok(compiled.length >= 1, 'the rock-leaf family at least compiled behind the menu');
  const files = requests.filter(key => key.startsWith('menu-scene:file:'));
  assert.ok(files.some(key => key.includes('/place_rock_')));
  assert.ok(files.every(key => key.includes('/place_rock_')), 'the arena warms no campaign sector files');
  assert.ok(requests.includes('menu-scene:post'), 'shared post resources remain staged');
});

test('the Swarm embark marker warms the picked hull without borrowing the Adventure opening cast', () => {
  const requests = [];
  const owner = menuOwner({
    _warmSectorRecipeStubs(places, ships, roster) { requests.push({ places, ships, roster }); },
  });
  const spec = { sectorId: 'sector_helios_prime', seed: 4242, shipDefId: 'ship_hornet' };
  owner._prefetchEmbarkVisuals({ ...spec, swarmArenaOnly: true });
  assert.deepEqual(requests[0], {
    places: [], ships: [{ type: 'ship', data: { defId: 'ship_hornet' } }], roster: [],
  });
  owner._prefetchEmbarkVisuals(spec);
  assert.ok(requests[1]?.places.some(place => place.data.packagedPropFile === 'pods/pod_47a_evidence_spindle.glb'),
    'a later ordinary embark still warms its Adventure props');
});

test('menu warm arm rides the real crucible trigger and embark speculation', () => {
  // The trigger is the real ui:screenTop id gate the door already uses — the scene warm
  // must arm from inside the menu roster begin, not a parallel event.
  const beginDef = RENDERER_SOURCE.indexOf('_beginMenuCrucibleRosterWarm() {');
  const endDef = RENDERER_SOURCE.indexOf('/**', beginDef + 1);
  const beginBlock = RENDERER_SOURCE.slice(beginDef, endDef);
  assert.match(beginBlock, /this\._earlyCrucibleWarmMenu = true;/);
  assert.match(beginBlock, /this\._armMenuSwarmSceneWarm\(this\._menuSwarmSpec\)/,
    'the door-stage arms the sector-scene cohort with the latest speculation');

  // Embark speculation only retargets while the crucible menu warm lives — Adventure's own
  // embark emits must not mint Swarm work.
  const busDef = RENDERER_SOURCE.indexOf("onBus('game:embarkSpeculation'");
  const busBlock = RENDERER_SOURCE.slice(busDef, busDef + 1400);
  assert.match(busBlock, /this\._prefetchEmbarkVisuals\(p\)/);
  assert.match(busBlock, /this\._menuSwarmSpec = \{ sectorId, seed: Number\.isFinite\(p\.seed\)/);
  assert.match(busBlock, /if \(this\._earlyCrucibleWarmMenu === true\)/,
    'the sector-scene arm stays gated to the staged crucible menu warm');

  // Screen leave cancels through the shared discard — no second teardown path.
  const discardDef = RENDERER_SOURCE.indexOf('_discardEarlyCrucibleWarm() {');
  const discardBlock = RENDERER_SOURCE.slice(discardDef, discardDef + 900);
  assert.match(discardBlock, /this\._discardMenuSwarmSceneWarm\(\)/);
  assert.match(discardBlock, /this\._menuSwarmSpec = null/);
});

test('the scene cohort warms the same rows the first cook pays', () => {
  const beginDef = RENDERER_SOURCE.indexOf('async _runMenuSwarmSceneWarm(warm, spec) {');
  const endDef = RENDERER_SOURCE.indexOf('/**', beginDef + 1);
  const runBlock = RENDERER_SOURCE.slice(beginDef, endDef);
  assert.ok(beginDef > 0);
  // Sector recipe: same save-envelope enumeration → same authored prewarm request lane →
  // decode + instantiate + compile under the canonical keys live boundaries use.
  assert.match(runBlock, /saveEnvelopeSectorStubs\(\{/);
  assert.match(runBlock, /currentSectorId: sectorId/);
  assert.match(runBlock, /authoredPrewarmRequestsForEntities\(entities, \{/);
  assert.match(runBlock, /loadAuthoredPart\(request\.url, \{/);
  assert.match(runBlock, /instantiatePackagedPrimitives\(record, holder\)/);
  assert.match(runBlock, /canonicalizeObjectSurfaceProgramKeys\(holder\)/);
  // Rock pools: leaf/detail family, variant + keyed instanced chunks — the cook.rockPools
  // rows that shrank between doors.
  assert.match(runBlock, /buildAsteroidLeafWarmGroup\(\)/);
  assert.match(runBlock, /warmAsteroidInstanceVariants\(this\._asteroidInstancePool/);
  assert.match(runBlock, /warmAsteroidInstanceKeys\(this\._asteroidInstancePool, asteroidPoolWarmResources\(\)\)/);
  assert.match(runBlock, /collectInstancePoolCompileRoots\(scene\)/);
  // The authored debris-rock family rides along: every arena mints authored geology the
  // sector recipe cannot name.
  assert.match(runBlock, /ROCK_BODIES/);
  // Post resources: the cook's opening.postResources row.
  assert.match(runBlock, /this\.bloom\.prepareResources\(yieldToBrowser\)/);
  // PLAY joins the same in-flight work: pending promises register in _rosterPrewarmPending,
  // which the cook's settle hold covers — no duplicate compiles.
  assert.match(runBlock, /this\._rosterPrewarmPending\.add\(settled\)/);
  // Pacing: the menu-dwell budget is the shared paced ledger + browser yields — no
  // synchronous waits anywhere in the cohort.
  assert.match(runBlock, /PACED_FRAME_BUDGET_MS/);
  assert.match(runBlock, /await yieldToBrowser\(\)/);
});

test('the debris-rock family request covers all authored geology bodies', () => {
  assert.equal(ROCK_BODIES.length, 24, '8 substances x 3 size classes');
  const subs = new Set(ROCK_BODIES.map((body) => body.substance));
  for (const sub of ['metallic_ore', 'silicate', 'ice', 'slag', 'crystal', 'reef_metal', 'cooked_rock', 'junk']) {
    assert.ok(subs.has(sub), `arena debris substance ${sub} stays covered`);
  }
});
