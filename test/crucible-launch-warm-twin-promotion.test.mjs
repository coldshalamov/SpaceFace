// PQ-210.00 leaf .00 + ledger D44: no wave ever freezes the fight, and the wave-1 pack never
// pays a GLTFKit_InstancePool chunk promotion inside it.
//
// A packaged hull only promotes its direct mesh into an instance-pool chunk when a SECOND
// same-key owner registers — the first owner parks as a candidate. The launch warm therefore
// builds TWO witnesses per roster hull (test/render-package-pilots.test.mjs pins the promotion
// mechanics themselves; this file pins the warm POLICY that feeds them):
//   - every hull family the seed-4242 ruleset can field arrives as a twin pair, so the chunk
//     (program link + instanceMatrix bufferData) is created behind the loading shell;
//   - every witness's admission→compile chain joins `_rosterPrewarmPending`, the exact set the
//     opening cook holds the shell on BEFORE recording `live.firstFramePoolCensus` — warm
//     completion precedes the pool census, so promotion cannot still be in flight at flight;
//   - a re-admit builds nothing (the ledger dedupes) — the reverted 2026-09-25 twin attempt
//     doubled launch warm work; this pins the no-double-work property.
// The payload side is the real sim publisher (seed 4242, swarm ruleset); the renderer side runs
// the real `_admitSurvivalRosterPrewarm` with a recording visual factory, so the pair count and
// the pending-set drain are behavior, not source text.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';

import { render } from '../src/render/renderer.js';
import { createBus } from '../src/core/eventBus.js';
import { createRunState } from '../src/core/runState.js';
import { survivalArena } from '../src/systems/survivalArena.js';

const RENDERER_SOURCE = await readFile(new URL('../src/render/renderer.js', import.meta.url), 'utf8');

// The real publisher: one REAL spawn-spec exemplar per hull the ruleset can field (the full
// swarm roster plus boss packages), exactly what `survivalArena:rosterPrewarm` carries on the
// live route. Driven directly because the publisher's bus subscription is deliberately out
// (see test/survival-arena-roster-prewarm.test.mjs for the measured reason).
function rosterPayload(t, { ruleset = 'swarm', wave = 1 } = {}) {
  const run = createRunState({ kind: 'survival', ruleset, seed: 4242 });
  Object.assign(run, { arenaId: 'helios', phase: 'active', wave });
  const state = { run, tick: 120, simTime: 2, playerId: 1, entities: new Map() };
  const raw = createBus();
  const bus = {
    on: raw.on,
    emit(event, payload) { raw.emit(event, payload); },
  };
  const system = Object.create(survivalArena);
  system.init({ state, bus });
  t.after(() => system.destroy());
  const emitted = [];
  raw.on('survivalArena:rosterPrewarm', (payload) => emitted.push(payload));
  // What a `run:wavePlanned` receipt does on the live route.
  system._emitRosterPrewarm(run, { arenaPhase: 'idle', schedule: [] }, { wave });
  return emitted;
}

// Recording stand-in for the visual factory: the real factory composes authored GLBs; the warm
// policy under test (how many witnesses per spec, what joins the census hold) is factory-agnostic.
function recordingVf() {
  const builds = [];
  return {
    builds,
    build(spec) {
      builds.push(spec);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
      mesh.name = `warm:${spec && spec.id}`;
      return mesh;
    },
  };
}

function warmHarness(vf) {
  const scene = new THREE.Scene();
  const compiled = [];
  const owner = {
    renderer: {},
    scene,
    vf,
    state: {
      world: { currentSectorId: null },
      render: {
        compileObjectPipelines: (subject) => {
          compiled.push(subject);
          return Promise.resolve({});
        },
      },
    },
    _meshes: new Map(),
    _rosterPrewarmIds: new Set(),
    _rosterPrewarmWeaponIds: new Set(),
    _rosterPrewarmRoots: [],
    _rosterPrewarmPending: new Set(),
    _rosterPrewarmPendingLabels: new WeakMap(),
    // The warm's catalog leg is a real method on the render object; delegate so the pending
    // set carries every real member the cook's hold would wait on (its GLB loads fail fast
    // and gracefully in node — `.catch(() => null)` per file).
    _admitRosterPartCatalog(...args) { return render._admitRosterPartCatalog.apply(this, args); },
  };
  return { owner, scene, compiled };
}

async function drainPending(owner) {
  // Warm completion is the pending set emptying: every member's chain resolves, its finally
  // removes it. Bounded rounds — a hung chain must fail the test, not hang it.
  for (let round = 0; round < 50 && owner._rosterPrewarmPending.size > 0; round++) {
    await Promise.allSettled([...owner._rosterPrewarmPending]);
    await new Promise((resolve) => setImmediate(resolve));
  }
  return owner._rosterPrewarmPending.size;
}

test('the launch warm twins every roster hull so the pool chunk promotes behind the shell', async (t) => {
  const payload = rosterPayload(t)[0];
  assert.ok(payload && Array.isArray(payload.specs) && payload.specs.length > 0,
    'the seed-4242 swarm publisher emits a real spec set');
  const shipSpecs = payload.specs.filter((spec) => spec && spec.type === 'ship');
  assert.ok(shipSpecs.length > 0, 'the payload carries ship exemplars');

  const vf = recordingVf();
  const { owner, scene } = warmHarness(vf);
  render._admitSurvivalRosterPrewarm.call(owner, payload);

  for (const spec of shipSpecs) {
    const twins = vf.builds.filter((built) => built && built.id === spec.id);
    assert.equal(twins.length, 2,
      `${spec.id} is built twice: the second same-key owner is what promotes the first into a ` +
      'GLTFKit_InstancePool chunk at warm time instead of on the first live twin spawn');
    assert.strictEqual(twins[0], spec,
      'both witnesses ride the identical spec — same fitSeed/palette, i.e. the exact pool keys ' +
      'the live spawn must already find');
  }
  for (const spec of shipSpecs) {
    assert.ok(owner._rosterPrewarmIds.has(spec.id), `${spec.id} is ledgered against rebuilds`);
  }
  // The twin boundaries mount hidden and stay owned: retention is what keeps the promoted
  // chunks resident until run end.
  const twinRoots = scene.children.filter((object) => shipSpecs.some((spec) => spec.id === object.userData?.rosterPrewarm));
  assert.equal(twinRoots.length, shipSpecs.length * 2, 'every witness boundary mounts on the scene');
  for (const root of twinRoots) {
    assert.equal(root.visible, false, 'a witness never draws');
    assert.ok(owner._rosterPrewarmRoots.includes(root), 'the witness stays owned for run-end release');
  }
});

test('every witness chain joins the pending set, drains it, and compiles behind the shell', async (t) => {
  const payload = rosterPayload(t)[0];
  const shipSpecs = payload.specs.filter((spec) => spec && spec.type === 'ship');
  const vf = recordingVf();
  const { owner, compiled } = warmHarness(vf);

  render._admitSurvivalRosterPrewarm.call(owner, payload);

  assert.ok(owner._rosterPrewarmPending.size >= shipSpecs.length * 2,
    'both twins per hull hold a place in the census-hold set');
  const remaining = await drainPending(owner);
  assert.equal(remaining, 0,
    'warm completion is observable as an empty `_rosterPrewarmPending` — the exact condition ' +
    'the opening cook waits for before the pool census');
  for (const spec of shipSpecs) {
    const compiledTwins = compiled.filter((subject) => subject.name === `warm:${spec.id}`);
    assert.equal(compiledTwins.length, 2,
      `${spec.id}: both witnesses compile through the warm's own lane before the set drains — ` +
      'a witness that compiled after flight would link its pool variant inside the round');
  }
});

test('a re-admit builds nothing: the ledger dedupes, no doubled launch warm work', async (t) => {
  const payload = rosterPayload(t)[0];
  const vf = recordingVf();
  const { owner } = warmHarness(vf);

  render._admitSurvivalRosterPrewarm.call(owner, payload);
  const buildsAfterFirst = vf.builds.length;
  const pendingAfterFirst = owner._rosterPrewarmPending.size;
  assert.ok(buildsAfterFirst > 0);

  render._admitSurvivalRosterPrewarm.call(owner, payload);

  assert.equal(vf.builds.length, buildsAfterFirst,
    'the second publish (wave 2 re-emits the roster) rebuilds nothing — the reverted twin ' +
    'attempt failed partly by doubling launch warm work');
  assert.equal(owner._rosterPrewarmPending.size, pendingAfterFirst,
    'the re-admit queues no new census-hold work');
});

test('the cook holds the shell for the warm before the pool census runs', () => {
  // Order pin for the seam the behavior above feeds: the rosterPrewarmSettle hold (which
  // awaits `_rosterPrewarmPending` and drains queued pipeline admissions) must be recorded
  // before `live.firstFramePoolCensus` — promotion happens inside those admissions, so a
  // census that preceded the hold could watch witnesses still in flight (the reverted
  // attempt's failure mode).
  const settle = RENDERER_SOURCE.indexOf("'live.rosterPrewarmSettle'");
  const census = RENDERER_SOURCE.indexOf("'live.firstFramePoolCensus'");
  const seal = RENDERER_SOURCE.indexOf("'live.finalPipelineSeal'");
  assert.ok(settle > 0, 'the settle hold exists in the opening cook');
  assert.ok(census > settle, 'the pool census follows the roster-prewarm settle');
  assert.ok(seal > census, 'the final pipeline seal follows the census');
  // The hold must actually await the pending set, not merely record it.
  const holdBlock = RENDERER_SOURCE.slice(RENDERER_SOURCE.indexOf('if (this._rosterPrewarmPending'), settle);
  assert.match(holdBlock, /Promise\.allSettled\(pending\)/,
    'the hold awaits the same set the warm fills');
});

test('the between-round deferred warm twins newcomers and settles them before its census', () => {
  // The shop leg warms whatever the next round adds (packet step 3). Same contract as the
  // launch warm: twin witnesses per newcomer ship, and the authored commits settle before the
  // palette census mints its subjects — never promotion inside the next round.
  const region = RENDERER_SOURCE.slice(
    RENDERER_SOURCE.indexOf('_warmSwarmDeferredRoster(nextWave)'),
    RENDERER_SOURCE.indexOf('_mintDeferredPaletteSubjects(root, freshSet, sectorId) {'),
  );
  assert.ok(region.length > 0, 'the deferred warm region exists');
  assert.match(region, /for \(let witness = 0; witness < 2; witness \+= 1\)/,
    'each newcomer hull is built as a twin pair');
  assert.match(region, /deferPackagePoolActivation: false/,
    'chunk publication happens behind the shop, at count 0, not on a live draw');
  const settleAll = region.indexOf('Promise.allSettled(warm.pendingAttachments)');
  const mint = region.indexOf('_mintDeferredPaletteSubjects(root, freshSet, sectorId)');
  assert.ok(settleAll > 0 && mint > settleAll,
    'the palette census runs only after every authored witness commit has settled');
});

test('the launch warm promotes the wave-1 hull pool keys from the decoded record', () => {
  // D44's contended-host failure: the exemplar/hulk composes that provide the second same-key
  // owner lose the budget race, so the first live twin creates the chunks in-round (+71
  // bufferFullUploads at the pack boundary). finish()'s hull branch must therefore promote the
  // launch keep set's keys from the DECODED RECORD — witness pairs, the armory batch's tool —
  // and record the count so the probe can attribute it.
  const finish = RENDERER_SOURCE.slice(
    RENDERER_SOURCE.indexOf('async _finishCrucibleBoundedRosterWarm(warm, options = {})'),
    RENDERER_SOURCE.indexOf('Between-round roster warm for swarm runs'),
  );
  assert.ok(finish.length > 0, 'the bounded warm finish exists');
  const promotion = finish.indexOf('warmRenderPackageShipPool(scene, record, witnessPalettes)');
  assert.ok(promotion > 0, 'finish() promotes launch-hull pool keys via witness pairs');
  const leg = finish.slice(Math.max(0, promotion - 1600), promotion);
  assert.match(leg, /launchHullKeepSet\.has\(normalizeFile\(url\)\)/,
    'promotion is scoped to the launch keep set — wave 1\u2019s field plus the player hull, ' +
    'never the unscoped catalog fleet the receipt measured as the launch regression');
  assert.match(leg, /warm\.swarmScoped === true/,
    'the leg only runs where the eligibility ladder scoped the cohort');
  assert.match(finish, /chunkPromotions/, 'the promotion count lands in the probe-visible progress record');
});
