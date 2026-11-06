import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';

// Scripted-intro species prewarm (PQ-210.00 follow-up): the rescue cast and lane traffic mint
// after the opening composition snapshot, so the entity-driven cook never sees them. The bounded
// warm must therefore carry exemplar specs for every species the intro can spawn — through the
// same production build + requestAuthoredUpgrade boundary a live entity uses. Ordinary Adventure
// now uses exact first-picture admission and bounded per-object streaming instead of this catalog.

// No jsdom in this repo: hull panels paint to canvas, so stub document the way
// pq-193-05-census-a-bodies does. The stub is installed before any vf.build runs.
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

const {
  combatSpawnableExemplarSpecs,
  wreckVisualExemplarSpecs,
  asteroidLeafResources,
  createVisualFactory,
} = await import('../src/render/visualFactory.js');
const { installVisualOverrides } = await import('../src/render/visualOverrides.js');
const { makeRescueCastSpecs } = await import('../src/onboarding/rescueOpening.js');
const { render: renderSystem, warmHullFilesForSpecs, disposeRendererOwnedResources } = await import('../src/render/renderer.js');
const { scriptedOnboardingRosterRows } = await import('../src/render/saveEnvelopeSectorWarm.js');

const RENDERER_SOURCE = readFileSync(
  new URL('../src/render/renderer.js', import.meta.url), 'utf8',
);
const FACTORY_SOURCE = readFileSync(
  new URL('../src/render/visualFactory.js', import.meta.url), 'utf8',
);

function liveFactory() {
  return installVisualOverrides(createVisualFactory(), { directAuthoredMount: true });
}

function specIndex(specs) {
  const bySpecies = new Map();
  for (const spec of specs) {
    const list = bySpecies.get(spec.type) || [];
    list.push(spec);
    bySpecies.set(spec.type, list);
  }
  return bySpecies;
}

test('spawnable exemplar manifest covers every scripted-intro species', () => {
  const specs = combatSpawnableExemplarSpecs('test-warm:spawnable:');
  const bySpecies = specIndex(specs);
  // The rescue cast's drone (scout), payload (grab pod) and beacon (run target) plus the
  // generic payload shell and the live/dead procedural beacons.
  assert.equal(bySpecies.get('drone').length, 1, 'drone exemplar');
  assert.ok(bySpecies.get('payload').length >= 2, 'generic + rescue payload exemplars');
  assert.ok(bySpecies.get('beacon').length >= 3, 'live + dead + rescueExit beacon exemplars');
  // Lane traffic: one exemplar per bounded freighter variant (LANE_FREIGHTER_VARIANTS = 8).
  const freighters = bySpecies.get('freighter') || [];
  assert.equal(freighters.length, 8, 'one exemplar per bounded lane-freighter variant');
  const variants = new Set(freighters.map((spec) => spec.data && spec.data.laneVariant));
  assert.equal(variants.size, freighters.length, 'each freighter exemplar a distinct variant');
  // The rescue-flagged exemplars carry exactly the data packagedPropSpec switches on.
  const rescuePod = specs.find((spec) => spec.type === 'payload' && spec.data.distressBeacon);
  assert.ok(rescuePod && rescuePod.data.rescuePriority === true, 'rescue pod flags');
  const rescueBeacon = specs.find((spec) => spec.type === 'beacon' && spec.data.rescueExit);
  assert.ok(rescueBeacon, 'rescueExit beacon flag');
});

test('intro exemplars build the same packaged-body boundary a live spawn uses', () => {
  const vf = liveFactory();
  const specs = combatSpawnableExemplarSpecs('test-warm:spawnable:');
  const find = (type, pred) => specs.find((spec) => spec.type === type && pred(spec));
  const cases = [
    ['drone', find('drone', () => true), 'places/place_mining_drone.glb'],
    ['payload:rescue', find('payload', (s) => s.data.distressBeacon === true),
      'places/place_47a_rescue_capsule.glb'],
    ['payload:generic', find('payload', (s) => s.data.distressBeacon !== true),
      'pods/pod_cargo_container.glb'],
    ['beacon:rescue', find('beacon', (s) => s.data.rescueExit === true),
      'places/place_lane_beacon.glb'],
  ];
  for (const [label, spec, file] of cases) {
    assert.ok(spec, `${label} exemplar spec exists`);
    const visual = vf.build(spec);
    assert.ok(visual, `${label} builds`);
    assert.equal(
      visual.userData && visual.userData.authoredPackageUrl,
      `assets/ships/release/parts/${file}`,
      `${label} carries the production packaged-body pointer`,
    );
    assert.equal(
      typeof (visual.userData && visual.userData.requestAuthoredUpgrade),
      'function',
      `${label} exposes the requestAuthoredUpgrade hook the warm kicks`,
    );
  }
});

test('rescue cast members resolve onto the warmed species and packages', () => {
  const cast = makeRescueCastSpecs({ x: 0, z: 0 }, () => 0.5);
  const vf = liveFactory();
  // The swing rock and the wall alias onto ast_common_rock: the leaf warm group and the
  // instance-pool variants already cover every (type, variant) pair behind the shell.
  for (const key of ['rock', 'asteroid']) {
    const leaf = asteroidLeafResources(cast[key].data.typeId, 0);
    assert.equal(leaf.typeId, 'ast_common_rock', `${key} canonicalizes to the warmed rock type`);
  }
  // The derelict resolves to one of the six packaged wreck bodies the explicit decode list
  // warms; its procedural shell shares the wreck role materials the wreck exemplars build.
  const derelict = vf.build({ ...cast.derelict, pos: { x: 0, y: 0, z: 0 } });
  assert.ok(derelict, 'derelict wreck builds');
  assert.match(
    String(derelict.userData && derelict.userData.authoredPackageUrl),
    /places\/place_aftermath_.*\.glb$/,
    'derelict resolves to a packaged wreck body',
  );
  assert.equal(typeof derelict.userData.requestAuthoredUpgrade, 'function');
  // Scout, pod and beacon land the same pointers their exemplar specs asserted above.
  for (const [key, file] of [
    ['scout', 'places/place_mining_drone.glb'],
    ['pod', 'places/place_47a_rescue_capsule.glb'],
    ['beacon', 'places/place_lane_beacon.glb'],
  ]) {
    const visual = vf.build({ ...cast[key], pos: { x: 0, y: 0, z: 0 } });
    assert.ok(visual, `${key} builds`);
    assert.equal(
      visual.userData && visual.userData.authoredPackageUrl,
      `assets/ships/release/parts/${file}`,
      `${key} live build resolves the warmed package`,
    );
  }
});

test('ordinary scenePrepared leaves future roster work to streaming and discards an unrelated door warm', () => {
  for (const staged of [false, true]) {
    let begins = 0, discards = 0;
    const owner = Object.create(renderSystem);
    Object.assign(owner, {
      state: { mode: 'loading' }, scene: {}, _earlyCrucibleWarm: staged ? {} : null,
      _beginCrucibleBoundedRosterWarm() { begins++; throw new Error('ordinary launch started future roster'); },
      _discardEarlyCrucibleWarm() { discards++; this._earlyCrucibleWarm = null; },
    });
    owner._beginEarlyCrucibleRosterWarm();
    assert.equal(begins, 0);
    assert.equal(discards, staged ? 1 : 0);
    assert.equal(owner._earlyCrucibleWarm, null);
  }
});

test('survival scenePrepared retains its bounded whole-roster warm', () => {
  const warm = { root: new THREE.Group() }, begins = [];
  const owner = Object.create(renderSystem);
  Object.assign(owner, {
    state: { mode: 'loading', run: { kind: 'survival', phase: 'draft' } }, scene: new THREE.Scene(),
    _rosterPrewarmRoots: [], _beginCrucibleBoundedRosterWarm(options) { begins.push(options); return warm; },
    _noteShadowMeshAdded() {},
  });
  owner._beginEarlyCrucibleRosterWarm();
  assert.equal(begins.length, 1);
  assert.equal(begins[0].profile, 'crucible');
  assert.equal(owner._earlyCrucibleWarm, warm);
  assert.equal(warm.root.parent, owner.scene);
  assert.deepEqual(owner._rosterPrewarmRoots, [warm.root]);
});

test('explicit optional opening warms retain their deferred fleet decode lifetime', () => {
  // Measured on the witness run: starting the whole-ship GLB decodes at scenePrepared made
  // the launch SLOWER, not faster — ~100 MB of meshopt decode shares the single main-thread
  // lane with the authored-library/visuals gates (+8 s on authored-visuals) and the bigger
  // finish() cohort tripled live.postOpeningPipelines (3.1 → 13.7 s). What actually timed
  // out was the small packaged-body attach cohort. So: 'hull'-slot files defer to the cook
  // claim (same runway the mid-cook begin used to give them), small place/pod bodies start
  // immediately, and finish() backstops the deferred start so no path can skip it.
  const beginDef = RENDERER_SOURCE.indexOf('_beginCrucibleBoundedRosterWarm(options = {})');
  const finishDef = RENDERER_SOURCE.indexOf('_finishCrucibleBoundedRosterWarm(warm, options = {})');
  assert.ok(beginDef > 0 && finishDef > beginDef);
  const beginBlock = RENDERER_SOURCE.slice(beginDef, finishDef);
  assert.match(beginBlock, /deferFleetDecodes === true/);
  assert.match(beginBlock, /warm\.deferredDecodes = \[\]/);
  // Only the 'hull' slot (whole-ship GLBs) is deferred; place/pod bodies decode immediately.
  assert.match(beginBlock, /if \(deferFleetDecodes && slot === 'hull'\)/,
    'the deferral is hull-slot-scoped, not the whole explicit list');

  // The cook claim fires the deferred decodes where the mid-cook begin used to start them.
  const cookStart = RENDERER_SOURCE.indexOf('state.render.cookLiveSceneGpu = async');
  const cookBlock = RENDERER_SOURCE.slice(cookStart, beginDef);
  const claimIndex = cookBlock.indexOf('this._earlyCrucibleWarm = null;');
  assert.ok(claimIndex > 0, 'the cook claims the early warm');
  const claimTail = cookBlock.slice(claimIndex, claimIndex + 1200);
  assert.match(claimTail, /this\._startDeferredWarmDecodes\(crucibleWarm\)/,
    'the cook claim restarts the deferred fleet decodes with the old mid-cook runway');

  // finish() must backstop the deferred start before the bounded decode wait — a path that
  // skipped the claim must not leave the fleet files undecoded forever.
  const releaseDef = RENDERER_SOURCE.indexOf('_releaseSurvivalRosterPrewarm(reason)', finishDef);
  const finishBlock = RENDERER_SOURCE.slice(finishDef, releaseDef);
  const decodeWaitIndex = finishBlock.indexOf('decodeWaitMs');
  const firedIndex = finishBlock.indexOf('_startDeferredWarmDecodes(warm)');
  assert.ok(firedIndex >= 0 && decodeWaitIndex > firedIndex,
    'finish() fires deferred decodes before the bounded decode wait');
});

test('the explicit optional opening cook retains the intro species profile', () => {
  const cookStart = RENDERER_SOURCE.indexOf('state.render.cookLiveSceneGpu = async');
  const beginDef = RENDERER_SOURCE.indexOf('_beginCrucibleBoundedRosterWarm(options = {})');
  assert.ok(cookStart > 0 && beginDef > cookStart);
  const block = RENDERER_SOURCE.slice(cookStart, beginDef);
  // The warm must not be survival-gated: warmFirstFlightFx alone arms it so the normal
  // New Game / Continue cook compiles intro species behind the shell.
  assert.match(block, /if \(warmFirstFlightFx && !cookOverBudget\(\)\)/);
  assert.doesNotMatch(block, /warmFirstFlightFx && survivalCook && !cookOverBudget/);
  assert.match(block, /profile:\s*survivalCook \? 'crucible' : 'opening'/);
  // The warm root still joins the buffer census and the compile batch.
  assert.match(block, /addFirstFlightBufferRoot\(crucibleWarmRoot\)/);
  assert.match(block, /if \(crucibleWarmRoot\) cookCompileRoots\.push\(crucibleWarmRoot\)/);
});

test('ordinary opening keeps its live/embark hull set and releases the warm after first paint', () => {
  const menuWarms = [];
  const menuOwner = Object.create(renderSystem);
  Object.assign(menuOwner, {
    renderer: {},
    _warmSectorRecipeStubs(...args) { menuWarms.push(args); },
  });
  menuOwner._prefetchEmbarkVisuals({
    sectorId: 'sector_helios_prime', seed: 123, shipDefId: 'ship_mule',
  });
  assert.equal(menuWarms.length, 1);
  const [placeStubs, shipStubs, roster, sectorId] = menuWarms[0];
  assert.equal(sectorId, 'sector_helios_prime');
  assert.deepEqual(placeStubs.map(stub => stub.data.packagedPropFile), [
    'pods/pod_47a_evidence_spindle.glb', 'places/place_dead_hulk.glb',
  ], 'menu dwell keeps the 47-A spindle and carrier hulk');
  assert.deepEqual(shipStubs.map(stub => stub.data.defId), [
    'ship_wasp', 'ship_mule', 'ship_mule',
  ], 'fixed intro hulls and the selected starter remain warm');
  assert.deepEqual(roster, scriptedOnboardingRosterRows(),
    'scripted onboarding hulls remain warm without enumerating sector recipes');
  const embarkStart = RENDERER_SOURCE.indexOf('_prefetchEmbarkVisuals(payload)');
  const embarkEnd = RENDERER_SOURCE.indexOf('_admitSurvivalRosterPrewarm(payload, options = {})', embarkStart);
  const embark = RENDERER_SOURCE.slice(embarkStart, embarkEnd);
  assert.doesNotMatch(embark, /saveEnvelopeSectorStubs|saveEnvelopeFullExtrasStubs/);

  const helperStart = RENDERER_SOURCE.indexOf('function openingWarmHullFilesForState(state)');
  const beginDef = RENDERER_SOURCE.indexOf('_beginCrucibleBoundedRosterWarm(options = {})');
  const finishDef = RENDERER_SOURCE.indexOf('_finishCrucibleBoundedRosterWarm(warm, options = {})');
  const releaseDef = RENDERER_SOURCE.indexOf('_releaseOrdinaryOpeningWarm(reason =');
  assert.ok(helperStart > 0 && beginDef > helperStart && releaseDef > beginDef && finishDef > releaseDef);
  const helper = RENDERER_SOURCE.slice(helperStart, beginDef);
  assert.match(helper, /collectFirstFlightCookEntities\(state\)/,
    'the ordinary warm follows the same live first-flight source as the opening cook');
  assert.match(helper, /cruciblePlayerShipExemplarSpec\(state\)/,
    'the starter/player hull remains in the opening keep set');
  assert.match(helper, /defId: 'ship_wasp'/);
  assert.match(helper, /defId: 'ship_mule'/);
  assert.match(helper, /scriptedOnboardingRosterRows\(\)/,
    'the _prefetchEmbarkVisuals onboarding roster remains covered');

  const begin = RENDERER_SOURCE.slice(beginDef, finishDef);
  assert.match(begin, /const openingHullFiles = profile === 'opening'/);
  assert.match(begin, /profile === 'opening'\s*\n\s*\? openingHullFiles/,
    'ordinary opening uses its explicit set instead of the generic catalog fallback');
  const finish = RENDERER_SOURCE.slice(
    finishDef,
    RENDERER_SOURCE.indexOf('_releaseSurvivalRosterPrewarm(reason)', finishDef),
  );
  assert.match(finish, /warm\.profile === 'opening'/,
    'settled ordinary records use the same opening keep filter');
  const paintRelease = RENDERER_SOURCE.indexOf('export function applyFirstPlayablePaintRelease(owner)');
  const park = RENDERER_SOURCE.indexOf('owner\._parkBoundedWarmRoots', paintRelease);
  const teardown = RENDERER_SOURCE.indexOf('owner?\._releaseOrdinaryOpeningWarm', paintRelease);
  assert.ok(park > paintRelease && teardown > park,
    'first paint parks the root before releasing its residency owner');
});

test('opening warm hull selection keeps faction primaries and the LOD2 stand-in, without cold LOD1', () => {
  const files = [...warmHullFilesForSpecs([
    {
      id: 'opening:hauler', type: 'ship', alive: true,
      data: { defId: 'ship_mule' },
    },
    {
      id: 'opening:patrol', type: 'ship', alive: true, factionId: 'faction_free',
      data: { defId: 'ship_wasp', trafficRole: 'patrol' },
    },
  ])].sort();
  assert.deepEqual(files, [
    'wholeships/mule_production_v1.glb',
    'wholeships/mule_production_v1_lod2.glb',
    'wholeships/wasp_free_militia.glb',
  ], 'opening warms the selected faction body plus the policy-required stand-in set');
  assert.equal(files.some((file) => file.includes('_lod1.')), false,
    'runtime demotion is disabled, so LOD1 never enters the opening warm');
});

test('the bounded warm decodes the rescue intro packaged bodies explicitly', () => {
  const beginDef = RENDERER_SOURCE.indexOf('_beginCrucibleBoundedRosterWarm(options = {})');
  const finishDef = RENDERER_SOURCE.indexOf('_finishCrucibleBoundedRosterWarm(warm, options = {})');
  assert.ok(beginDef > 0 && finishDef > beginDef);
  const block = RENDERER_SOURCE.slice(beginDef, finishDef);
  assert.match(block, /places\/place_47a_rescue_capsule\.glb/);
  assert.match(block, /places\/place_lane_beacon\.glb/);
  assert.match(block, /PQ_193_05_DRONE_PACKAGED_FILE/);
  assert.match(block, /PQ_193_05_WRECK_PACKAGED_FILES/);
  // The survival roster ship exemplars stay crucible-scoped: the 20 s opening shell cannot
  // settle sixteen whole-ship compose jobs before flight.
  assert.match(block, /profile === 'crucible'\s*\?\s*swarmRosterShipExemplarSpecs/);
  // finish() must still wait on the rock-surface library so the PBR reskin recompiles behind
  // the shell rather than mid-flight.
  const releaseDef = RENDERER_SOURCE.indexOf('_releaseSurvivalRosterPrewarm(reason)', finishDef);
  assert.ok(releaseDef > finishDef);
  const finishBlock = RENDERER_SOURCE.slice(finishDef, releaseDef);
  assert.match(finishBlock, /rockSurfaceLibraryReady/);
});

test('wreck and asteroid exemplar helpers still cover the intro bodies', () => {
  // Six packaged wreck variants: the exemplar id scan keeps going until every residue class
  // is represented, so the derelict's hashId pick is always among the warmed set.
  const wreckSpecs = wreckVisualExemplarSpecs('test-warm:wreck:');
  assert.ok(wreckSpecs.length >= 6, 'wreck exemplars cover all packaged variants');
  // Sanity on the exemplar contract: they are admission subjects, never live entities.
  for (const spec of wreckSpecs) {
    assert.ok(spec.id.startsWith('test-warm:wreck:'), 'prefixed admission id');
    assert.equal(spec.type, 'wreck');
  }
});

test('opening warm compiles the exact double-sided hulk program keys instead of minting hulks', () => {
  const src = readFileSync(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  assert.match(src, /function openingWarmHullFilesForState\(state\) \{\s*return warmHullFilesForSpecs\(openingWarmShipSpecsForState\(state\)\);/);
  assert.match(src, /const hulkShipSpecs = profile === 'opening' \? \[\] : shipSpecs;/);
  assert.match(src, /if \(profile === 'opening'\) this\._warmOpeningHulkProgramKeys\(\);/);
  const body = src.slice(src.indexOf('  _warmOpeningHulkProgramKeys() {'));
  assert.match(body, /material\.side = THREE\.DoubleSide;/);
  assert.match(body, /installIllustratedSurface\(material\);/);
  // Trimmed to the one key that linked post-lift (lt12-lt14): no batched or depth-twin variants.
  assert.doesNotMatch(body.slice(0, body.indexOf('return receipt;')), /BatchedMesh|MeshDepthMaterial/);
  // First use runs one program per idle frame and stops once the shell is gone.
  assert.match(body, /requestIdleCallback/);
  const releaseBody = body.slice(body.indexOf('const release = ('), body.indexOf('const idle = ('));
  assert.match(releaseBody, /hold\.geometry\?\.dispose\?\.\(\);/);
  assert.doesNotMatch(releaseBody, /material[s]?\S*\.dispose\(/, 'materials must not dispose: that would release the warmed programs');
});


test('stale opening hulk compile completion cannot release or use the replacement warm owner', async () => {
  assert.equal(typeof renderSystem._warmOpeningHulkProgramKeys, 'function');
  const oldRaf = globalThis.requestAnimationFrame;
  const oldRic = globalThis.requestIdleCallback;
  const rafQueue = [], idleQueue = [];
  globalThis.requestAnimationFrame = (fn) => { rafQueue.push(fn); return rafQueue.length; };
  globalThis.requestIdleCallback = (fn) => { idleQueue.push(fn); return idleQueue.length; };
  try {
    const drainFirstUseFrame = () => {
      const raf = rafQueue.shift();
      assert.equal(typeof raf, 'function', 'first-use work must queue its next animation frame');
      raf();
      const idle = idleQueue.shift();
      assert.equal(typeof idle, 'function', 'first-use work must queue on the idle lane');
      idle();
    };
    const pending = [];
    let firstUseCalls = 0;
    const programs = new Map([['hulk', { cacheKey: 'hulk-key', getUniforms() { firstUseCalls += 1; } }]]);
    const state = {
      mode: 'loading', world: {}, contextRestoreSeq: 1,
      render: { admissionRunGeneration: 1, firstPlayableFrameAt: null },
    };
    const owner = {
      state,
      scene: new THREE.Scene(),
      cam: { obj: new THREE.PerspectiveCamera() },
      renderer: { properties: { get: () => ({ programs }) } },
      _openingHulkKeyWarmHold: null,
      _selectPostRoute: () => 'test-route',
      _compilePostRoute: () => new Promise((resolve, reject) => pending.push({ resolve, reject })),
    };

    const oldReceipt = renderSystem._warmOpeningHulkProgramKeys.call(owner);
    assert.equal(renderSystem._warmOpeningHulkProgramKeys.call(owner), oldReceipt,
      'duplicate requests share one issued warm per admission owner');
    assert.equal(pending.length, 1, 'same-owner reuse does not compile another material');
    const oldHold = owner._openingHulkKeyWarmHold;
    let oldMaterialDisposals = 0;
    oldHold.material.addEventListener('dispose', () => { oldMaterialDisposals += 1; });
    state.render.admissionRunGeneration = 2;
    const newReceipt = renderSystem._warmOpeningHulkProgramKeys.call(owner);
    const newHold = owner._openingHulkKeyWarmHold;
    assert.notEqual(newReceipt, oldReceipt);
    assert.notEqual(newHold, oldHold);
    assert.equal(oldHold.released, false, 'candidate buffers wait for the async compile before final retirement');

    pending[0].resolve();
    await Promise.resolve();
    assert.equal(owner._openingHulkKeyWarmHold, newHold, 'stale completion cannot clear the replacement hold');
    assert.notEqual(newHold.released, true, 'stale completion cannot release the replacement hold');
    assert.equal(oldReceipt.linkMs, null, 'stale completion cannot run first-use work');
    assert.equal(firstUseCalls, 0);
    assert.equal(oldMaterialDisposals, 1, 'stale compile retires only its candidate material when it settles');

    const newMaterial = newHold.material;
    let newMaterialDisposals = 0;
    newMaterial.addEventListener('dispose', () => { newMaterialDisposals += 1; });
    pending[1].resolve();
    await Promise.resolve();
    assert.equal(newReceipt.error, null);
    assert.equal(newHold.released, false, 'private geometry remains until both first-use idle turns complete');
    assert.equal(rafQueue.length, 1, 'active compile queues its first-use animation frame');
    drainFirstUseFrame();
    assert.equal(firstUseCalls, 1, 'first idle turn touches the acquired program once');
    assert.equal(newHold.released, false, 'one idle touch does not finish the multi-key first-use walk');
    drainFirstUseFrame();
    assert.equal(newHold.released, true, 'the active owner releases its private geometry after first use');
    assert.equal(owner._openingHulkKeyWarmHold, null);
    assert.equal(owner._openingHulkKeyWarmResource.material, newMaterial, 'the compiled material is retained as one renderer/context program pin');
    assert.equal(newMaterialDisposals, 0);
    assert.equal(firstUseCalls, 1);
    assert.equal(renderSystem._warmOpeningHulkProgramKeys.call(owner), newReceipt,
      'completed same-owner receipt remains idempotent after its transient hold is released');
    assert.equal(pending.length, 2, 'completed receipt reuse does not mint another program-cache reference');

    state.render.admissionRunGeneration = 3;
    const thirdReceipt = renderSystem._warmOpeningHulkProgramKeys.call(owner);
    const thirdHold = owner._openingHulkKeyWarmHold;
    const thirdMaterial = thirdHold.material;
    assert.notEqual(thirdMaterial, newMaterial, 'a new generation compiles a replacement candidate');
    assert.equal(newMaterialDisposals, 0, 'the previous pin stays alive until replacement has acquired its key');
    pending[2].resolve();
    await Promise.resolve();
    assert.equal(owner._openingHulkKeyWarmResource.material, thirdMaterial);
    assert.equal(newMaterialDisposals, 1, 'successful replacement retires the old pin exactly once');
    assert.equal(rafQueue.length, 1, 'replacement compile queues its own first-use animation frame');
    drainFirstUseFrame();
    drainFirstUseFrame();
    assert.equal(thirdHold.released, true);
    assert.equal(renderSystem._warmOpeningHulkProgramKeys.call(owner), thirdReceipt);
    assert.equal(pending.length, 3, 'completed receipt remains idempotent in the replacement generation');

    state.render.admissionRunGeneration = 4;
    const livePin = owner._openingHulkKeyWarmResource;
    const noKeyReceipt = renderSystem._warmOpeningHulkProgramKeys.call(owner);
    const noKeyHold = owner._openingHulkKeyWarmHold;
    programs.clear();
    pending[3].resolve();
    await Promise.resolve();
    assert.match(noKeyReceipt.error, /without an acquired program key/);
    assert.equal(noKeyReceipt.linkMs, null, 'an empty program map is not a completed warm');
    assert.equal(owner._openingHulkKeyWarmResource, livePin, 'no-key candidate cannot displace the retained program pin');
    assert.equal(noKeyHold.released, true);
    programs.set('hulk', { cacheKey: 'hulk-key', getUniforms() { firstUseCalls += 1; } });

    let pinDisposals = 0;
    let textureDisposals = 0;
    thirdMaterial.addEventListener('dispose', () => { pinDisposals += 1; });
    for (const texture of owner._openingHulkKeyWarmResource.textures) texture.addEventListener('dispose', () => { textureDisposals += 1; });
    disposeRendererOwnedResources(owner);
    assert.equal(pinDisposals, 1, 'live renderer teardown releases its retained material pin');
    assert.equal(textureDisposals, 6, 'live renderer teardown releases all six warm textures');
    assert.equal(owner._openingHulkKeyWarmResource, null);
  } finally {
    if (oldRaf === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = oldRaf;
    if (oldRic === undefined) delete globalThis.requestIdleCallback;
    else globalThis.requestIdleCallback = oldRic;
  }
});

test('compile rejection releases its own hold and a released loading owner cannot first-use later', async () => {
  const pending = [];
  let firstUseCalls = 0;
  const programs = new Map([['hulk', { cacheKey: 'hulk-key', getUniforms() { firstUseCalls += 1; } }]]);
  const state = {
    mode: 'loading', world: {}, contextRestoreSeq: 4,
    render: { admissionRunGeneration: 9, firstPlayableFrameAt: null },
  };
  const owner = {
    state, scene: new THREE.Scene(), cam: { obj: new THREE.PerspectiveCamera() },
    renderer: { properties: { get: () => ({ programs }) } }, _openingHulkKeyWarmHold: null,
    _selectPostRoute: () => 'test-route',
    _compilePostRoute: () => new Promise((resolve, reject) => pending.push({ resolve, reject })),
  };
  const receipt = renderSystem._warmOpeningHulkProgramKeys.call(owner);
  const hold = owner._openingHulkKeyWarmHold;
  pending[0].reject(new Error('compile rejected'));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.match(receipt.error, /compile rejected/);
  assert.equal(hold.released, true);
  assert.equal(owner._openingHulkKeyWarmHold, null);

  // A fresh compile may finish, but a released/non-loading owner cannot issue the deferred
  // program touch on a later timer turn.
  state.render.admissionRunGeneration = 10;
  const later = renderSystem._warmOpeningHulkProgramKeys.call(owner);
  const laterHold = owner._openingHulkKeyWarmHold;
  state.mode = 'flight';
  pending[1].resolve();
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(later.linkMs, null);
  assert.equal(laterHold.released, true);
  assert.equal(firstUseCalls, 0);
});



test('a stale queued first-use cannot double-retire a pin already replaced by a newer generation', async () => {
  const oldRaf = globalThis.requestAnimationFrame;
  const oldRic = globalThis.requestIdleCallback;
  const rafQueue = [], idleQueue = [];
  globalThis.requestAnimationFrame = (fn) => { rafQueue.push(fn); return rafQueue.length; };
  globalThis.requestIdleCallback = (fn) => { idleQueue.push(fn); return idleQueue.length; };
  try {
    const pending = [];
    const programs = new Map([['hulk', { cacheKey: 'hulk-key', getUniforms() {} }]]);
    const state = {
      mode: 'loading', world: {}, contextRestoreSeq: 7,
      render: { admissionRunGeneration: 1, firstPlayableFrameAt: null },
    };
    const owner = {
      state, scene: new THREE.Scene(), cam: { obj: new THREE.PerspectiveCamera() },
      renderer: { properties: { get: () => ({ programs }) } }, _openingHulkKeyWarmHold: null,
      _selectPostRoute: () => 'test-route',
      _compilePostRoute: () => new Promise((resolve, reject) => pending.push({ resolve, reject })),
    };
    renderSystem._warmOpeningHulkProgramKeys.call(owner);
    const firstHold = owner._openingHulkKeyWarmHold;
    const firstMaterial = firstHold.material;
    const firstTextures = [...firstHold.textures];
    let materialDisposals = 0, textureDisposals = 0;
    firstMaterial.addEventListener('dispose', () => { materialDisposals += 1; });
    for (const texture of firstTextures) texture.addEventListener('dispose', () => { textureDisposals += 1; });
    pending[0].resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(rafQueue.length, 1, 'first generation queues deferred first-use');

    state.render.admissionRunGeneration = 2;
    renderSystem._warmOpeningHulkProgramKeys.call(owner);
    pending[1].resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(owner._openingHulkKeyWarmResource.material, owner._openingHulkKeyWarmHold.material);
    assert.equal(materialDisposals, 1, 'new successful candidate retires the previous program pin once');
    assert.equal(textureDisposals, 6, 'old pin textures are retired once on replacement');

    rafQueue[0]();
    assert.equal(idleQueue.length, 0, 'stale animation callback cannot enqueue new idle work');
    assert.equal(materialDisposals, 1, 'old idle callback cannot dispose the replaced pin again');
    assert.equal(textureDisposals, 6, 'old idle callback cannot dispose its textures twice');
    assert.equal(owner._openingHulkKeyWarmResource.material, owner._openingHulkKeyWarmHold.material,
      'newer program pin remains active after stale first-use callback');
  } finally {
    if (oldRaf === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = oldRaf;
    if (oldRic === undefined) delete globalThis.requestIdleCallback;
    else globalThis.requestIdleCallback = oldRic;
  }
});

test('a lost or replaced WebGL owner abandons its stale warm without GPU disposal or first use', async () => {
  const pending = [];
  let firstUseCalls = 0;
  const programs = new Map([['hulk', { cacheKey: 'hulk-key', getUniforms() { firstUseCalls += 1; } }]]);
  const state = {
    mode: 'loading', world: {}, contextRestoreSeq: 12,
    render: { admissionRunGeneration: 22, firstPlayableFrameAt: null },
  };
  const owner = {
    state, scene: new THREE.Scene(), cam: { obj: new THREE.PerspectiveCamera() },
    renderer: { properties: { get: () => ({ programs }) } }, _openingHulkKeyWarmHold: null,
    _selectPostRoute: () => 'test-route',
    _compilePostRoute: () => new Promise((resolve, reject) => pending.push({ resolve, reject })),
  };
  const receipt = renderSystem._warmOpeningHulkProgramKeys.call(owner);
  const hold = owner._openingHulkKeyWarmHold;
  let textureDisposals = 0;
  let geometryDisposals = 0;
  let materialDisposals = 0;
  hold.material.addEventListener('dispose', () => { materialDisposals += 1; });
  for (const texture of hold.textures) texture.addEventListener('dispose', () => { textureDisposals += 1; });
  hold.geometry.addEventListener('dispose', () => { geometryDisposals += 1; });
  owner._contextLost = true;
  state.contextRestoreSeq += 1;
  pending[0].resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(receipt.linkMs, null);
  assert.equal(hold.released, true);
  assert.equal(textureDisposals, 0, 'lost-context textures are abandoned without dispose events');
  assert.equal(geometryDisposals, 0, 'lost-context geometry is abandoned without dispose events');
  assert.equal(materialDisposals, 0, 'lost-context candidate materials are abandoned without dispose events');
  assert.equal(firstUseCalls, 0, 'lost-context programs are never touched');
});


test('live teardown retires a settled candidate before its deferred idle first-use', async () => {
  const oldRaf = globalThis.requestAnimationFrame;
  const oldRic = globalThis.requestIdleCallback;
  globalThis.requestAnimationFrame = () => 1;
  globalThis.requestIdleCallback = () => 1;
  try {
    const pending = [];
    const programs = new Map([['hulk', { cacheKey: 'hulk-key', getUniforms() {} }]]);
    const state = {
      mode: 'loading', world: {}, contextRestoreSeq: 33,
      render: { admissionRunGeneration: 44, firstPlayableFrameAt: null },
    };
    const owner = {
      state, scene: new THREE.Scene(), cam: { obj: new THREE.PerspectiveCamera() },
      renderer: { properties: { get: () => ({ programs }) } }, _openingHulkKeyWarmHold: null,
      _selectPostRoute: () => 'test-route',
      _compilePostRoute: () => new Promise((resolve, reject) => pending.push({ resolve, reject })),
    };
    renderSystem._warmOpeningHulkProgramKeys.call(owner);
    const hold = owner._openingHulkKeyWarmHold;
    const material = hold.material;
    const geometry = hold.geometry;
    let materialDisposals = 0, geometryDisposals = 0, textureDisposals = 0;
    material.addEventListener('dispose', () => { materialDisposals += 1; });
    geometry.addEventListener('dispose', () => { geometryDisposals += 1; });
    for (const texture of hold.textures) texture.addEventListener('dispose', () => { textureDisposals += 1; });
    pending[0].resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(owner._openingHulkKeyWarmResource.material, material, 'compile has promoted the candidate pin');
    assert.equal(hold.released, false, 'deferred first-use still owns its transient hold');
    disposeRendererOwnedResources(owner);
    assert.equal(materialDisposals, 1, 'live teardown releases the active material pin before renderer disposal');
    assert.equal(geometryDisposals, 1, 'live teardown releases transient geometry');
    assert.equal(textureDisposals, 6, 'live teardown releases candidate textures');
    assert.equal(owner._openingHulkKeyWarmResource, null);
    assert.equal(state.render.openingHulkKeyWarm, null, 'teardown clears the issued receipt');
  } finally {
    if (oldRaf === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = oldRaf;
    if (oldRic === undefined) delete globalThis.requestIdleCallback;
    else globalThis.requestIdleCallback = oldRic;
  }
});


test('teardown force-retires a compile-pending candidate before native renderer disposal', async () => {
  const pending = [];
  const programs = new Map([['hulk', { cacheKey: 'hulk-key', getUniforms() {} }]]);
  const state = {
    mode: 'loading', world: {}, contextRestoreSeq: 61,
    render: { admissionRunGeneration: 72, firstPlayableFrameAt: null },
  };
  const owner = {
    state, scene: new THREE.Scene(), cam: { obj: new THREE.PerspectiveCamera() },
    renderer: { properties: { get: () => ({ programs }) } }, _openingHulkKeyWarmHold: null,
    _selectPostRoute: () => 'test-route',
    _compilePostRoute: () => new Promise((resolve, reject) => pending.push({ resolve, reject })),
  };
  renderSystem._warmOpeningHulkProgramKeys.call(owner);
  const hold = owner._openingHulkKeyWarmHold;
  let materialDisposals = 0, geometryDisposals = 0, textureDisposals = 0;
  hold.material.addEventListener('dispose', () => { materialDisposals += 1; });
  hold.geometry.addEventListener('dispose', () => { geometryDisposals += 1; });
  for (const texture of hold.textures) texture.addEventListener('dispose', () => { textureDisposals += 1; });
  disposeRendererOwnedResources(owner);
  assert.equal(materialDisposals, 1, 'pending candidate material lease retires before renderer disposal');
  assert.equal(geometryDisposals, 1);
  assert.equal(textureDisposals, 6);
  pending[0].resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(materialDisposals, 1, 'late completion is idempotent after forced teardown retirement');
  assert.equal(geometryDisposals, 1);
  assert.equal(textureDisposals, 6);
});

test('explicit contextLost teardown abandons candidate handles even before owner loss flag changes', () => {
  const pending = [];
  const programs = new Map([['hulk', { cacheKey: 'hulk-key', getUniforms() {} }]]);
  const state = {
    mode: 'loading', world: {}, contextRestoreSeq: 81,
    render: { admissionRunGeneration: 92, firstPlayableFrameAt: null },
  };
  const owner = {
    state, scene: new THREE.Scene(), cam: { obj: new THREE.PerspectiveCamera() },
    renderer: { properties: { get: () => ({ programs }) } }, _openingHulkKeyWarmHold: null,
    _selectPostRoute: () => 'test-route',
    _compilePostRoute: () => new Promise((resolve, reject) => pending.push({ resolve, reject })),
  };
  renderSystem._warmOpeningHulkProgramKeys.call(owner);
  const hold = owner._openingHulkKeyWarmHold;
  let materialDisposals = 0, geometryDisposals = 0, textureDisposals = 0;
  hold.material.addEventListener('dispose', () => { materialDisposals += 1; });
  hold.geometry.addEventListener('dispose', () => { geometryDisposals += 1; });
  for (const texture of hold.textures) texture.addEventListener('dispose', () => { textureDisposals += 1; });
  disposeRendererOwnedResources(owner, { contextLost: true });
  assert.equal(materialDisposals, 0);
  assert.equal(geometryDisposals, 0);
  assert.equal(textureDisposals, 0);
  assert.equal(hold.candidate.retired, true, 'dead-context references are dropped immediately');
});
