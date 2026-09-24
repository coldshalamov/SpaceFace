import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

// Scripted-intro species prewarm (PQ-210.00 follow-up): the rescue cast and lane traffic mint
// after the opening composition snapshot, so the entity-driven cook never sees them. The bounded
// warm must therefore carry exemplar specs for every species the intro can spawn — through the
// same production build + requestAuthoredUpgrade boundary a live entity uses — and the ordinary
// (non-survival) opening cook must actually invoke it.

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

test('the ordinary opening cook runs the bounded warm with the intro species profile', () => {
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
