// SETTINGS-RUNTIME-TRUTH — VFX particle pool resize / migration contract.
//
// Spec contract (design/specs/10, design/PERF_BUDGET.md §4.3):
//   settings.video.particleQuality low|medium|high → cap 1500|3000|4000
//   + QUALITY_BURST spawn multiplier 0.55|0.8|1.0
//   ON settings:changed { particleQuality } → resize particle pool (live-apply).
//
// Diagnostic lane: runs all cases and reports every failure (does not stop at first).
// Expected RED until VFX gains a settings:changed resize/migrate path.
// vfx.js is frozen for this task — do not "fix" production code from this lane.
//
// Integration seam (where the fix must land):
//   1. Settings UI: src/ui/screens/settings.js _set() mutates settings.video.particleQuality
//      then emits bus 'settings:changed' { section:'video', key:'particleQuality', value }.
//   2. Renderer: src/render/renderer.js listens settings:changed for video but only applies
//      bloom/shadows/renderScale/pixelRatioCap/dynamicResolution/FOV — NOT particleQuality.
//   3. VFX: src/render/vfx.js reads particleQuality only inside _initPools() at boot (and
//      lazy first-attach). _subscribe() does not register settings:changed. There is no
//      resize/migrate helper that rebuilds SoA/GPU buffers while preserving live particles
//      and without re-stacking Points meshes or bus listeners.
//
// Run: node test/vfx-settings-runtime-truth.test.mjs

import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createBus } from '../src/core/eventBus.js';

const { vfx } = await import('../src/render/vfx.js');

/** Spec caps — mirrored from vfx.js PARTICLE_CAP / QUALITY_BURST. */
const EXPECTED = Object.freeze({
  low: { cap: 1500, burst: 0.55 },
  med: { cap: 3000, burst: 0.8 },
  medium: { cap: 3000, burst: 0.8 },
  high: { cap: 4000, burst: 1.0 },
});

const VFX_SUBSCRIBED_EVENTS = Object.freeze([
  'combat:fire',
  'projectile:hit',
  'combat:damage',
  'entity:killed',
  'entity:destroyed',
  'presentation:vfxCue',
  'ship:thrust',
  'jump:start',
]);

const failures = [];
const passes = [];

function record(name, fn) {
  try {
    fn();
    passes.push(name);
  } catch (err) {
    failures.push({
      name,
      message: err && err.message ? err.message : String(err),
      actual: err && 'actual' in err ? err.actual : undefined,
      expected: err && 'expected' in err ? err.expected : undefined,
    });
  }
}

function countBusListeners(bus, event) {
  const set = bus._listeners && bus._listeners.get(event);
  return set ? set.size : 0;
}

function countScenePoints(scene) {
  let n = 0;
  scene.traverse((obj) => { if (obj && obj.isPoints) n += 1; });
  return n;
}

function countSceneSprites(scene) {
  let n = 0;
  scene.traverse((obj) => { if (obj && obj.isSprite) n += 1; });
  return n;
}

function makeHarness(particleQuality = 'medium') {
  const scene = new THREE.Scene();
  const bus = createBus();
  const state = {
    playerId: 1,
    entities: new Map(),
    entityList: [],
    settings: {
      video: {
        particleQuality,
        engineTrails: true,
        motionReduce: false,
        bloom: true,
        energyMaterials: true,
      },
    },
    render: { scene },
  };
  const system = Object.create(vfx);
  system.init({ state, bus, helpers: {} });
  assert.ok(system._scene, 'vfx must attach to the provided render scene at boot');
  return { scene, bus, state, system };
}

/**
 * Production integration path under test:
 * Settings mutates state then emits settings:changed. Optional future apply hooks
 * are probed so the suite turns green when a real resize path lands (without editing
 * this file's contract).
 */
function applyParticleQuality(harness, quality) {
  const { state, bus, system } = harness;
  state.settings.video.particleQuality = quality;
  bus.emit('settings:changed', {
    section: 'video',
    key: 'particleQuality',
    value: quality,
  });
  if (typeof system.applySettings === 'function') system.applySettings(state.settings);
  if (typeof system.onSettingsChanged === 'function') {
    system.onSettingsChanged({ section: 'video', key: 'particleQuality', value: quality });
  }
  if (typeof system.resizePools === 'function') system.resizePools();
  if (typeof system._syncParticleQuality === 'function') system._syncParticleQuality();
  if (typeof system.update === 'function') system.update(1 / 60);
}

function assertCapBurst(system, quality, label) {
  const exp = EXPECTED[quality];
  assert.ok(exp, `unknown quality ${quality}`);
  const snap = system.inspect();
  assert.equal(
    snap.particleCap,
    exp.cap,
    `${label}: inspect().particleCap must be ${exp.cap} for particleQuality='${quality}' (got ${snap.particleCap})`,
  );
  assert.equal(
    system._cap,
    exp.cap,
    `${label}: internal _cap must be ${exp.cap} for '${quality}' (got ${system._cap})`,
  );
  assert.equal(
    system._burst,
    exp.burst,
    `${label}: QUALITY_BURST (_burst) must be ${exp.burst} for '${quality}' (got ${system._burst})`,
  );
  if (system._pPos) {
    assert.equal(
      system._pPos.length,
      exp.cap * 3,
      `${label}: position buffer must be cap*3 (${exp.cap * 3}) for '${quality}' (got ${system._pPos.length})`,
    );
  }
  if (system._alive) {
    assert.equal(
      system._alive.length,
      exp.cap,
      `${label}: alive SoA must be length ${exp.cap} for '${quality}' (got ${system._alive.length})`,
    );
  }
}

function spawnLiveParticles(system, count) {
  const c0 = { r: 1, g: 0.6, b: 0.2 };
  const c1 = { r: 0.4, g: 0.1, b: 0 };
  for (let i = 0; i < count; i++) {
    system._spawnParticle(
      i * 0.5,
      -i * 0.25,
      0.1,
      0.05,
      8.0,
      1.2,
      0.2,
      c0,
      c1,
      0.98,
      0,
      0,
    );
  }
  const live = system.inspect().liveParticles;
  assert.ok(live >= count, `expected ≥${count} live particles after spawn, got ${live}`);
  return live;
}

function snapshotPoolIdentity(system, scene, bus) {
  return {
    pointsRef: system._points || null,
    scenePoints: countScenePoints(scene),
    sceneSprites: countSceneSprites(scene),
    listeners: Object.fromEntries(
      VFX_SUBSCRIBED_EVENTS.map((ev) => [ev, countBusListeners(bus, ev)]),
    ),
    liveParticles: system.inspect().liveParticles,
  };
}

function assertNoDuplicatePoolsOrListeners(before, after, label) {
  assert.equal(
    after.scenePoints,
    before.scenePoints,
    `${label}: scene THREE.Points count must not grow (before=${before.scenePoints}, after=${after.scenePoints}) — migration must replace/reuse, not stack pools`,
  );
  assert.equal(
    after.sceneSprites,
    before.sceneSprites,
    `${label}: scene Sprite count must not grow on particle-quality change (before=${before.sceneSprites}, after=${after.sceneSprites})`,
  );
  for (const ev of VFX_SUBSCRIBED_EVENTS) {
    assert.equal(
      after.listeners[ev],
      before.listeners[ev],
      `${label}: bus listener count for '${ev}' must not double on quality change (before=${before.listeners[ev]}, after=${after.listeners[ev]})`,
    );
  }
  if (before.pointsRef && after.pointsRef && before.pointsRef !== after.pointsRef) {
    assert.equal(
      before.pointsRef.parent,
      null,
      `${label}: when pool mesh is replaced, the previous Points must be removed from the scene`,
    );
  }
}

// ── 1) Boot: actual particle cap / burst (and no quality clamp) ─────────────
for (const q of ['low', 'medium', 'high']) {
  record(`boot cap/burst [${q}]`, () => {
    const h = makeHarness(q);
    assertCapBurst(h.system, q, `boot[${q}]`);
    assert.equal(countScenePoints(h.scene), 1, `boot[${q}]: exactly one Points cloud`);
  });
}

record('boot[high]: no quality cap (full 4000 / burst 1.0)', () => {
  const h = makeHarness('high');
  assert.equal(h.system.inspect().particleCap, 4000, 'boot[high]: no quality cap — full 4000');
  assert.equal(h.system._burst, 1.0, 'boot[high]: full QUALITY_BURST 1.0');
  assert.equal(h.system._pPos.length, 4000 * 3, 'boot[high]: GPU buffer is full high capacity');
});

// ── 2) current → max → current (production default medium) ──────────────────
record('current→max→current: cap/burst live-apply', () => {
  const h = makeHarness('medium');
  assertCapBurst(h.system, 'medium', 'current(boot)');

  applyParticleQuality(h, 'high');
  assertCapBurst(h.system, 'high', 'current→max');

  applyParticleQuality(h, 'medium');
  assertCapBurst(h.system, 'medium', 'max→current');

  applyParticleQuality(h, 'low');
  assertCapBurst(h.system, 'low', 'current→low');

  applyParticleQuality(h, 'high');
  assertCapBurst(h.system, 'high', 'low→max');
  assert.equal(
    h.system.inspect().particleCap,
    4000,
    'no quality cap after runtime cycle: high must remain full 4000',
  );
});

record('current→max: pool migration without duplicate pools/listeners', () => {
  const h = makeHarness('medium');
  spawnLiveParticles(h.system, 8);
  const before = snapshotPoolIdentity(h.system, h.scene, h.bus);
  assert.equal(before.scenePoints, 1);
  assert.equal(before.listeners['combat:fire'], 1);

  applyParticleQuality(h, 'high');
  // Cap must move first — otherwise a no-op "migration" that keeps medium would
  // trivially pass the duplicate check while ignoring the settings change.
  assert.equal(
    h.system.inspect().particleCap,
    EXPECTED.high.cap,
    'migration precondition: cap must become high (4000) after settings:changed',
  );
  const after = snapshotPoolIdentity(h.system, h.scene, h.bus);
  assertNoDuplicatePoolsOrListeners(before, after, 'current→max migration');
});

record('current→max: preserve existing live particles (upsize)', () => {
  const h = makeHarness('medium');
  const liveBefore = spawnLiveParticles(h.system, 12);
  applyParticleQuality(h, 'high');
  assert.equal(
    h.system.inspect().particleCap,
    EXPECTED.high.cap,
    'preserve precondition: pool must resize to high before live-count is meaningful',
  );
  const liveAfter = h.system.inspect().liveParticles;
  assert.ok(
    liveAfter >= liveBefore,
    `upsize must preserve live particles (had ${liveBefore}, now ${liveAfter})`,
  );
});

record('max→current: preserve live particles within new cap (downsize)', () => {
  const h = makeHarness('high');
  const liveBefore = spawnLiveParticles(h.system, 12);
  applyParticleQuality(h, 'medium');
  assert.equal(
    h.system.inspect().particleCap,
    EXPECTED.medium.cap,
    'downsize precondition: pool must resize to medium',
  );
  const liveAfter = h.system.inspect().liveParticles;
  const floor = Math.min(liveBefore, EXPECTED.medium.cap);
  assert.ok(
    liveAfter >= floor,
    `downsize must preserve min(live, newCap) (had ${liveBefore}, now ${liveAfter}, floor ${floor})`,
  );
});

// ── 3) Naïve re-init is NOT valid migration (documents the wrong fix) ───────
record('sanity: raw _initPools/_subscribe without teardown duplicates', () => {
  const h = makeHarness('medium');
  const before = snapshotPoolIdentity(h.system, h.scene, h.bus);
  h.system._initPools();
  h.system._subscribe();
  const after = snapshotPoolIdentity(h.system, h.scene, h.bus);
  assert.ok(
    after.scenePoints > before.scenePoints
      || after.listeners['combat:fire'] > before.listeners['combat:fire'],
    'sanity: raw _initPools/_subscribe without teardown must duplicate pools or listeners '
      + `(points ${before.scenePoints}→${after.scenePoints}, `
      + `combat:fire ${before.listeners['combat:fire']}→${after.listeners['combat:fire']})`,
  );
});

// ── 4) Seam probe: settings:changed ownership ───────────────────────────────
record('integration seam: VFX must listen for settings:changed', () => {
  const h = makeHarness('medium');
  const n = countBusListeners(h.bus, 'settings:changed');
  assert.ok(
    n >= 1,
    'integration seam: VFX must subscribe to settings:changed for particleQuality live-apply. '
      + 'Today vfx._subscribe wires combat/mining/thrust/… only; renderer video handler '
      + 'applies bloom/FOV/scale but not particleQuality → pool never resizes after boot. '
      + `settings:changed listener count on pure VFX harness=${n}`,
  );
});

// ── Report ──────────────────────────────────────────────────────────────────
const report = {
  ok: failures.length === 0,
  test: 'vfx-settings-runtime-truth',
  caps: EXPECTED,
  passed: passes,
  failed: failures,
  defect: failures.length
    ? {
        summary:
          'VFX particle cap/burst are boot-only; settings:changed particleQuality does not resize or migrate the pool.',
        seam: [
          'src/ui/screens/settings.js — emits settings:changed on particleQuality toggle',
          'src/render/renderer.js — settings:changed video branch omits particleQuality/VFX',
          'src/render/vfx.js — PARTICLE_CAP/QUALITY_BURST applied only in _initPools(); no settings:changed handler; no migrate-without-duplicate path',
        ],
        firstFailure: failures[0],
      }
    : null,
};

console.log(JSON.stringify(report, null, 2));

if (failures.length) {
  console.error(`\n[vfx-settings-runtime-truth] ${failures.length} failure(s), ${passes.length} pass(es)`);
  for (const f of failures) {
    console.error(`  ✗ ${f.name}`);
    console.error(`    ${f.message}`);
  }
  process.exitCode = 1;
} else {
  console.log(`\n[vfx-settings-runtime-truth] all ${passes.length} checks passed`);
}
