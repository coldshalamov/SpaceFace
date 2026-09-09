// test/map-camera.test.mjs — the continuous map camera (packet W2-A, ADR D3).
//
// The cursor-anchored zoom invariant is the point of this file. Everything else guards the two
// ways this module could silently lie: drifting from galaxyMap's level thresholds, or confusing
// the global and sector-local frames (ADR D2.1). Both are invisible in Helios at origin (0,0),
// so the frame-sensitive cases run in sector_tethys_junction at (12288, 8192).

import test from 'node:test';
import assert from 'node:assert/strict';

// The camera module must never import galaxyMap.js. This TEST may — and does, deliberately, so
// the threshold parity below is pinned against the real source rather than a copied constant.
import {
  levelForZoom,
  ZOOM_MIN as GALAXY_MAP_ZOOM_MIN,
  ZOOM_MAX as GALAXY_MAP_ZOOM_MAX,
  LEVEL_SYSTEM_AT as GALAXY_MAP_LEVEL_SYSTEM_AT,
  LEVEL_LOCAL_AT as GALAXY_MAP_LEVEL_LOCAL_AT,
} from '../src/ui/galaxyMap.js';

import {
  corridorPlayableBounds,
  sectorGlobalOrigin,
  CORRIDOR_SECTOR_IDS,
  SECTOR_ORIGIN_LATTICE_WU,
} from '../src/data/sectorCoordinates.js';

import {
  createMapCamera,
  levelForSpan,
  zoomAt,
  framePreset,
  frameBoth,
  globalToScreen,
  screenToGlobal,
  setSpan,
  setFocus,
  panBy,
  cameraLevel,
  spanForZoom,
  zoomForSpan,
  pixelsPerWU,
  ZOOM_MIN,
  ZOOM_MAX,
  LEVEL_SYSTEM_AT_ZOOM,
  LEVEL_LOCAL_AT_ZOOM,
  LEVEL_SYSTEM_AT_SPAN_WU,
  LEVEL_LOCAL_AT_SPAN_WU,
  MAP_SPAN_REFERENCE_WU,
  MAP_SPAN_MIN_WU,
  MAP_SPAN_MAX_WU,
  MAP_PRESET_SPAN_WU,
  MAP_CHART_EXTENT,
} from '../src/ui/map/mapCamera.js';

const HELIOS = Object.freeze({ x: 0, z: 0 });
const TETHYS = sectorGlobalOrigin('sector_tethys_junction'); // (12288, 8192)

const SQUARE = Object.freeze({ x: 0, y: 0, width: 1000, height: 1000 });
const WIDE = Object.freeze({ x: 0, y: 0, width: 1600, height: 900 });
// An offset viewport rect, as `resolveGalaxyMapLayout` actually produces (header + rails).
const INSET = Object.freeze({ x: 236, y: 58, width: 624, height: 742 });

// Screen-space tolerance in pixels. Absolute, not relative: at Tethys the projection subtracts
// two ~12k-magnitude doubles, and the surviving error is what actually matters on screen.
const PX_EPS = 1e-6;

function assertClosePx(actual, expected, message) {
  assert.ok(
    Math.abs(actual - expected) <= PX_EPS,
    `${message}: expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
  );
}

function assertAnchorHeld(camBefore, camAfter, cursorGlobal, viewport, label) {
  const before = globalToScreen(camBefore, cursorGlobal, viewport);
  const after = globalToScreen(camAfter, cursorGlobal, viewport);
  assertClosePx(after.x, before.x, `${label}: cursor drifted on screen x`);
  assertClosePx(after.y, before.y, `${label}: cursor drifted on screen y`);
}

// -------------------------------------------------------------------------------------------
// Level thresholds — exact reproduction of the existing behaviour.
// -------------------------------------------------------------------------------------------

test('level thresholds are the galaxyMap thresholds, not a fork of them', () => {
  // Drift guard: if someone retunes galaxyMap's levels, this check fails loudly rather than the
  // camera silently disagreeing with the builders about which model to emit.
  assert.equal(LEVEL_SYSTEM_AT_ZOOM, GALAXY_MAP_LEVEL_SYSTEM_AT, 'SYSTEM threshold drifted');
  assert.equal(LEVEL_LOCAL_AT_ZOOM, GALAXY_MAP_LEVEL_LOCAL_AT, 'LOCAL threshold drifted');
  assert.equal(ZOOM_MIN, GALAXY_MAP_ZOOM_MIN, 'ZOOM_MIN drifted');
  assert.equal(ZOOM_MAX, GALAXY_MAP_ZOOM_MAX, 'ZOOM_MAX drifted');
});

test('levelForSpan reproduces levelForZoom exactly, across the whole legacy zoom range', () => {
  const samples = [
    // The boundaries themselves, and the floats either side of them.
    GALAXY_MAP_LEVEL_SYSTEM_AT,
    GALAXY_MAP_LEVEL_LOCAL_AT,
    1.5999999, 1.6000001, 2.7999999, 2.8000001,
    // The legacy clamp endpoints.
    ZOOM_MIN, ZOOM_MAX,
    // The three preset zooms `zoomForMapFocus` returns.
    1.0, 2.0, 3.2,
    // A general sweep.
    0.35, 0.5, 0.9, 1.2, 1.59, 1.61, 2.0, 2.4, 2.79, 2.81, 3.0, 5.0, 9.0, 14.0, 22.0,
  ];

  for (const zoom of samples) {
    assert.equal(
      levelForSpan(spanForZoom(zoom)),
      levelForZoom(zoom),
      `level disagreed at zoom ${zoom} (span ${spanForZoom(zoom)})`,
    );
  }
});

test('the span boundaries are inclusive toward the zoomed-in level, mirroring `zoom >=`', () => {
  // galaxyMap: `if (z >= LEVEL_LOCAL_AT) return 'local'` — so the boundary belongs to LOCAL.
  assert.equal(levelForSpan(LEVEL_LOCAL_AT_SPAN_WU), 'local');
  assert.equal(levelForSpan(LEVEL_SYSTEM_AT_SPAN_WU), 'system');
  // And the far side of each boundary steps out exactly one level.
  assert.equal(levelForSpan(LEVEL_LOCAL_AT_SPAN_WU * (1 + 1e-12)), 'system');
  assert.equal(levelForSpan(LEVEL_SYSTEM_AT_SPAN_WU * (1 + 1e-12)), 'galaxy');

  // The boundary spans are the reference span divided by the legacy thresholds — nothing else.
  assert.equal(LEVEL_LOCAL_AT_SPAN_WU, MAP_SPAN_REFERENCE_WU / GALAXY_MAP_LEVEL_LOCAL_AT);
  assert.equal(LEVEL_SYSTEM_AT_SPAN_WU, MAP_SPAN_REFERENCE_WU / GALAXY_MAP_LEVEL_SYSTEM_AT);
});

test('spanForZoom and zoomForSpan are inverses, and degenerate input reads as zoom 1', () => {
  for (const zoom of [0.35, 1, 1.6, 2.8, 7.5, 22]) {
    assert.ok(Math.abs(zoomForSpan(spanForZoom(zoom)) - zoom) < 1e-9, `not inverse at ${zoom}`);
  }
  // Mirrors galaxyMap's `Number(zoom) || 1`.
  assert.equal(spanForZoom(undefined), MAP_SPAN_REFERENCE_WU);
  assert.equal(spanForZoom(NaN), MAP_SPAN_REFERENCE_WU);
  assert.equal(spanForZoom(0), MAP_SPAN_REFERENCE_WU);
  assert.equal(levelForSpan(NaN), 'galaxy');
  assert.equal(levelForSpan(0), 'galaxy');
  assert.equal(levelForSpan(-5), 'galaxy');
});

// -------------------------------------------------------------------------------------------
// Cursor-anchored zoom — the single most important property in the packet.
// -------------------------------------------------------------------------------------------

test('cursor-anchored zoom holds across 4+ decades of span, at origin and at Tethys', () => {
  // Widened limits so the sweep exercises the pure math rather than the clamp. The clamp case is
  // its own test below, because clamping is exactly where a naive implementation breaks.
  const LIMITS = { minSpanWU: 1e-2, maxSpanWU: 1e9 };

  // 10 -> 100,000 WU is four decades.
  const spans = [10, 100, 1000, 10000, 100000, 31.6, 3162, 56789];
  // Zoom in and out, gently and hard.
  const factors = [1.1, 1.25, 2, 4, 11, 0.9, 0.8, 0.5, 0.25, 1 / 11];

  const cases = [
    // Helios at origin — the sector where a frame bug is invisible.
    { label: 'helios', focus: HELIOS, cursor: { x: 137.5, z: -412.25 } },
    // Tethys at (12288, 8192). Cursor is offset from focus on BOTH axes and at both signs, so the
    // large-magnitude subtraction that makes Tethys meaningful is actually exercised.
    { label: 'tethys', focus: TETHYS, cursor: { x: TETHYS.x + 1873.5, z: TETHYS.z - 942.75 } },
    { label: 'tethys-far', focus: TETHYS, cursor: { x: TETHYS.x - 6421.25, z: TETHYS.z + 3310.5 } },
    // Deep space between sectors, negative coordinates.
    { label: 'deep-negative', focus: { x: -28672, z: -4096 }, cursor: { x: -31044.5, z: -1233.25 } },
  ];

  for (const { label, focus, cursor } of cases) {
    for (const spanWU of spans) {
      const cam = createMapCamera({ focusGlobal: focus, spanWU, ...LIMITS });
      for (const factor of factors) {
        for (const viewport of [SQUARE, WIDE, INSET]) {
          const next = zoomAt(cam, cursor, factor);
          assertAnchorHeld(cam, next, cursor, viewport, `${label} span=${spanWU} f=${factor}`);
          // And the span actually moved the way the factor asked.
          assert.ok(
            Math.abs(next.spanWU - spanWU / factor) < 1e-9 * Math.max(1, spanWU),
            `${label}: span did not follow factor ${factor} from ${spanWU} (got ${next.spanWU})`,
          );
        }
      }
    }
  }
});

test('cursor stays anchored even when the span clamps at a limit', () => {
  // This is the test that catches deriving the new focus from the REQUESTED factor instead of the
  // ACHIEVED span ratio. The two agree everywhere except against a zoom stop, where the naive
  // implementation drifts the view every time the player keeps scrolling.
  for (const focus of [HELIOS, TETHYS]) {
    const cursor = { x: focus.x + 2211.75, z: focus.z - 1608.5 };

    // Zoom OUT hard, repeatedly, against the outer stop.
    let cam = createMapCamera({ focusGlobal: focus, spanWU: MAP_SPAN_MAX_WU * 0.9 });
    for (let i = 0; i < 5; i += 1) {
      const next = zoomAt(cam, cursor, 0.1);
      assertAnchorHeld(cam, next, cursor, SQUARE, `clamped zoom-out step ${i}`);
      cam = next;
    }
    assert.equal(cam.spanWU, MAP_SPAN_MAX_WU, 'should have pinned to the outer span limit');

    // Zoom IN hard, repeatedly, against the inner stop.
    cam = createMapCamera({ focusGlobal: focus, spanWU: MAP_SPAN_MIN_WU * 1.1 });
    for (let i = 0; i < 5; i += 1) {
      const next = zoomAt(cam, cursor, 10);
      assertAnchorHeld(cam, next, cursor, SQUARE, `clamped zoom-in step ${i}`);
      cam = next;
    }
    assert.equal(cam.spanWU, MAP_SPAN_MIN_WU, 'should have pinned to the inner span limit');
  }
});

test('a fully clamped zoom is a no-op, and a zero/negative factor changes nothing', () => {
  const cam = createMapCamera({ focusGlobal: TETHYS, spanWU: MAP_SPAN_MAX_WU });
  const cursor = { x: TETHYS.x + 5000, z: TETHYS.z + 5000 };

  const pinned = zoomAt(cam, cursor, 0.5); // already at the outer stop
  assert.equal(pinned.spanWU, MAP_SPAN_MAX_WU);
  assert.equal(pinned.focusGlobal.x, cam.focusGlobal.x);
  assert.equal(pinned.focusGlobal.z, cam.focusGlobal.z);

  for (const bad of [0, -2, NaN, undefined]) {
    const same = zoomAt(cam, cursor, bad);
    assert.equal(same.spanWU, cam.spanWU, `factor ${bad} must not change the span`);
    assert.equal(same.focusGlobal.x, cam.focusGlobal.x);
    assert.equal(same.focusGlobal.z, cam.focusGlobal.z);
  }
});

test('a span change alone preserves focusGlobal — the continuity property of ADR D3', () => {
  // "Crossing a span threshold preserves focusGlobal, so scale changes read as zooming rather
  // than switching maps." Assert it across all three levels, at a nonzero-origin sector.
  const cam = createMapCamera({ focusGlobal: TETHYS, spanWU: MAP_PRESET_SPAN_WU.local });
  assert.equal(cameraLevel(cam), 'local');

  const toSystem = setSpan(cam, MAP_PRESET_SPAN_WU.system);
  assert.equal(cameraLevel(toSystem), 'system');
  assert.deepEqual({ ...toSystem.focusGlobal }, { x: TETHYS.x, z: TETHYS.z });

  const toGalaxy = setSpan(toSystem, MAP_PRESET_SPAN_WU.galaxy);
  assert.equal(cameraLevel(toGalaxy), 'galaxy');
  assert.deepEqual({ ...toGalaxy.focusGlobal }, { x: TETHYS.x, z: TETHYS.z });
});

// -------------------------------------------------------------------------------------------
// Projection
// -------------------------------------------------------------------------------------------

test('globalToScreen -> screenToGlobal round-trips to identity', () => {
  const cases = [
    { focus: HELIOS, spanWU: 3584 },
    { focus: TETHYS, spanWU: 3584 },
    { focus: TETHYS, spanWU: 10240 },
    { focus: TETHYS, spanWU: MAP_PRESET_SPAN_WU.galaxy },
    { focus: { x: -45056, z: 73728 }, spanWU: 950 },
  ];
  const probes = [
    { x: 0, z: 0 },
    { x: 1, z: -1 },
    { x: 12288, z: 8192 },
    { x: -30011.5, z: 41022.25 },
    { x: 999999, z: -999999 },
  ];

  for (const { focus, spanWU } of cases) {
    const cam = createMapCamera({ focusGlobal: focus, spanWU });
    for (const viewport of [SQUARE, WIDE, INSET]) {
      for (const probe of probes) {
        const screen = globalToScreen(cam, probe, viewport);
        const back = screenToGlobal(cam, screen, viewport);
        // Relative tolerance: at |x| ~ 1e6 a double simply has no more precision to offer.
        const tolX = Math.max(1e-6, Math.abs(probe.x) * 1e-12);
        const tolZ = Math.max(1e-6, Math.abs(probe.z) * 1e-12);
        assert.ok(Math.abs(back.x - probe.x) <= tolX, `round-trip x: ${back.x} vs ${probe.x}`);
        assert.ok(Math.abs(back.z - probe.z) <= tolZ, `round-trip z: ${back.z} vs ${probe.z}`);
      }
    }
  }
});

test('the projection is north-up, minor-axis, and centered on the viewport rect', () => {
  const cam = createMapCamera({ focusGlobal: TETHYS, spanWU: 1000 });

  // The focus lands dead center of the viewport rect, offset included.
  const center = globalToScreen(cam, TETHYS, INSET);
  assertClosePx(center.x, INSET.x + INSET.width / 2, 'focus not at viewport center x');
  assertClosePx(center.y, INSET.y + INSET.height / 2, 'focus not at viewport center y');

  // +x global goes right, +z global goes down.
  const east = globalToScreen(cam, { x: TETHYS.x + 100, z: TETHYS.z }, SQUARE);
  const south = globalToScreen(cam, { x: TETHYS.x, z: TETHYS.z + 100 }, SQUARE);
  assert.ok(east.x > center.x - INSET.x, '+x must project right');
  assert.ok(south.y > 500, '+z must project down');

  // span is the MINOR axis extent: a 1600x900 viewport shows spanWU across its 900px height.
  assert.equal(pixelsPerWU(cam, WIDE), 900 / 1000);
  assert.equal(pixelsPerWU(cam, SQUARE), 1000 / 1000);
});

// -------------------------------------------------------------------------------------------
// Framing bookmarks
// -------------------------------------------------------------------------------------------

test('presets produce the documented spans and land in their own levels', () => {
  const local = framePreset('local', { playerGlobal: { x: TETHYS.x + 250, z: TETHYS.z - 90 } });
  const system = framePreset('system', { sectorId: 'sector_tethys_junction' });
  const galaxy = framePreset('galaxy');

  // ADR D3: "Local = player at ~3-4k span".
  assert.ok(local.spanWU >= 3000 && local.spanWU <= 4000, `local span ${local.spanWU} outside ~3-4k`);
  // ADR D3: "System = current sector origin at ~10k".
  assert.ok(system.spanWU >= 9000 && system.spanWU <= 11500, `system span ${system.spanWU} outside ~10k`);
  // ADR D3: "Galaxy = chart centroid at lattice extent".
  assert.ok(galaxy.spanWU > system.spanWU * 4, 'galaxy span must be the whole chart, not a system');

  assert.equal(levelForSpan(local.spanWU), 'local');
  assert.equal(levelForSpan(system.spanWU), 'system');
  assert.equal(levelForSpan(galaxy.spanWU), 'galaxy');

  // Every preset span is expressible in lattice cells — the chart's own unit.
  assert.equal(MAP_PRESET_SPAN_WU.local % (SECTOR_ORIGIN_LATTICE_WU / 8), 0);
  assert.equal(MAP_PRESET_SPAN_WU.system % (SECTOR_ORIGIN_LATTICE_WU / 2), 0);
});

test('presets focus the right GLOBAL point — including in a nonzero-origin sector', () => {
  // LOCAL frames the player, wherever they are.
  const player = { x: TETHYS.x - 640, z: TETHYS.z + 128 };
  assert.deepEqual(framePreset('local', { playerGlobal: player }).focusGlobal, player);

  // SYSTEM frames the sector origin. In Tethys that is (12288, 8192), NOT (0,0) — the whole
  // reason this program exists. A sector-local answer would be (0,0) and look fine in Helios.
  const system = framePreset('system', { sectorId: 'sector_tethys_junction' });
  assert.deepEqual(system.focusGlobal, { x: 12288, z: 8192 });
  assert.notDeepEqual(system.focusGlobal, { x: 0, z: 0 });

  // With no sectorId, membership is resolved from the player's global position (Voronoi).
  const inferred = framePreset('system', { playerGlobal: { x: TETHYS.x + 300, z: TETHYS.z - 300 } });
  assert.deepEqual(inferred.focusGlobal, { x: 12288, z: 8192 });

  // Helios still resolves to the origin, as it must.
  assert.deepEqual(framePreset('system', { sectorId: 'sector_helios_prime' }).focusGlobal, HELIOS);

  // GALAXY frames the chart centroid, which is the corridor bounds center.
  const galaxy = framePreset('galaxy');
  const bounds = corridorPlayableBounds();
  assertClosePx(galaxy.focusGlobal.x, bounds.center.x, 'galaxy centroid x != corridor bounds center');
  assertClosePx(galaxy.focusGlobal.z, bounds.center.z, 'galaxy centroid z != corridor bounds center');

  // Unknown preset names fall back to SYSTEM, mirroring `zoomForMapFocus`.
  assert.equal(framePreset('nonsense', { sectorId: 'sector_tethys_junction' }).spanWU,
    MAP_PRESET_SPAN_WU.system);
});

test('the galaxy preset actually contains every authored sector', () => {
  // Containment, not a magic number: this survives a frontier sector being added later.
  const preset = framePreset('galaxy');
  const cam = createMapCamera({ focusGlobal: preset.focusGlobal, spanWU: preset.spanWU });

  for (const viewport of [SQUARE, WIDE]) {
    for (const id of CORRIDOR_SECTOR_IDS) {
      const screen = globalToScreen(cam, sectorGlobalOrigin(id), viewport);
      assert.ok(
        screen.x >= viewport.x && screen.x <= viewport.x + viewport.width,
        `${id} off-chart horizontally at ${screen.x}`,
      );
      assert.ok(
        screen.y >= viewport.y && screen.y <= viewport.y + viewport.height,
        `${id} off-chart vertically at ${screen.y}`,
      );
    }
  }
  assert.ok(CORRIDOR_SECTOR_IDS.length >= 24, 'expected the full authored corridor set');
  // The preset span must not be silently clamped away by the default outer limit.
  assert.ok(MAP_SPAN_MAX_WU >= MAP_CHART_EXTENT.spanWU, 'cannot zoom out to the whole chart');
  assert.equal(createMapCamera({ spanWU: preset.spanWU }).spanWU, preset.spanWU);
});

test('frameBoth contains both points with margin — near, far, and negative pairs', () => {
  const pairs = [
    { label: 'near', a: { x: 100, z: 100 }, b: { x: 340, z: -60 } },
    { label: 'helios-to-tethys', a: HELIOS, b: TETHYS },
    { label: 'negative', a: { x: -30000, z: -2000 }, b: { x: -5000, z: 9000 } },
    { label: 'both-negative', a: { x: -45056, z: -4096 }, b: { x: -28672, z: -1024 } },
    { label: 'axis-aligned-x', a: { x: -8000, z: 512 }, b: { x: 8000, z: 512 } },
    { label: 'axis-aligned-z', a: { x: 512, z: -8000 }, b: { x: 512, z: 8000 } },
    { label: 'tethys-local', a: { x: TETHYS.x - 40, z: TETHYS.z + 15 }, b: { x: TETHYS.x + 60, z: TETHYS.z } },
  ];

  for (const { label, a, b } of pairs) {
    const framed = frameBoth(a, b);
    const cam = createMapCamera({ focusGlobal: framed.focusGlobal, spanWU: framed.spanWU });

    for (const viewport of [SQUARE, WIDE, INSET]) {
      const minor = Math.min(viewport.width, viewport.height);
      const pad = minor * 0.05; // demand real margin, not a hairline touch of the edge
      for (const [name, point] of [['a', a], ['b', b]]) {
        const s = globalToScreen(cam, point, viewport);
        assert.ok(
          s.x >= viewport.x + pad && s.x <= viewport.x + viewport.width - pad,
          `${label}/${name} not framed with margin on x (${s.x} in ${viewport.width})`,
        );
        assert.ok(
          s.y >= viewport.y + pad && s.y <= viewport.y + viewport.height - pad,
          `${label}/${name} not framed with margin on y (${s.y} in ${viewport.height})`,
        );
      }
    }

    // The midpoint is the focus, in the global frame.
    assertClosePx(framed.focusGlobal.x, (a.x + b.x) / 2, `${label}: focus x is not the midpoint`);
    assertClosePx(framed.focusGlobal.z, (a.z + b.z) / 2, `${label}: focus z is not the midpoint`);
  }
});

test('frameBoth degenerates safely and honours its options', () => {
  // Coincident points would give a span of zero; the floor keeps the camera usable.
  const same = frameBoth(TETHYS, TETHYS);
  assert.equal(same.spanWU, MAP_SPAN_MIN_WU);
  assert.deepEqual(same.focusGlobal, { x: TETHYS.x, z: TETHYS.z });

  // A bigger margin means a bigger span, never a smaller one.
  const tight = frameBoth(HELIOS, TETHYS, { marginFactor: 1 });
  const loose = frameBoth(HELIOS, TETHYS, { marginFactor: 2 });
  assert.ok(loose.spanWU > tight.spanWU);
  assert.equal(tight.spanWU, 12288); // max(|dx|, |dz|) = max(12288, 8192)

  // A margin below 1 would crop the points out of frame; it is floored at 1.
  assert.equal(frameBoth(HELIOS, TETHYS, { marginFactor: 0.2 }).spanWU, 12288);

  // Absurdly distant pairs still clamp into the legal span range.
  const huge = frameBoth({ x: -1e9, z: 0 }, { x: 1e9, z: 0 });
  assert.equal(huge.spanWU, MAP_SPAN_MAX_WU);
});

// -------------------------------------------------------------------------------------------
// Purity
// -------------------------------------------------------------------------------------------

test('the module is pure: cameras are frozen and transforms never mutate their input', () => {
  const cam = createMapCamera({ focusGlobal: TETHYS, spanWU: 4096 });
  assert.ok(Object.isFrozen(cam), 'camera must be frozen');
  assert.ok(Object.isFrozen(cam.focusGlobal), 'focusGlobal must be frozen');

  const snapshot = JSON.stringify(cam);
  const cursor = { x: TETHYS.x + 700, z: TETHYS.z - 300 };
  const cursorSnapshot = JSON.stringify(cursor);

  zoomAt(cam, cursor, 2);
  setSpan(cam, 20000);
  setFocus(cam, HELIOS);
  panBy(cam, { x: 500, z: 500 });
  globalToScreen(cam, cursor, SQUARE);
  screenToGlobal(cam, { x: 10, y: 10 }, SQUARE);

  assert.equal(JSON.stringify(cam), snapshot, 'a transform mutated the input camera');
  assert.equal(JSON.stringify(cursor), cursorSnapshot, 'a transform mutated the cursor argument');
});

test('createMapCamera always populates span limits, so a frozen camera cannot carry undefined', () => {
  for (const init of [undefined, {}, { spanWU: 5000 }, { focusGlobal: TETHYS }]) {
    const cam = createMapCamera(init);
    assert.ok(Number.isFinite(cam.minSpanWU) && cam.minSpanWU > 0, 'minSpanWU missing');
    assert.ok(Number.isFinite(cam.maxSpanWU) && cam.maxSpanWU >= cam.minSpanWU, 'maxSpanWU missing');
    assert.ok(Number.isFinite(cam.spanWU) && cam.spanWU > 0, 'spanWU missing');
    assert.ok(Number.isFinite(cam.focusGlobal.x) && Number.isFinite(cam.focusGlobal.z));
    // Limits survive a transform, so a long chain of zooms cannot lose them.
    const zoomed = zoomAt(cam, { x: 1, z: 1 }, 1.5);
    assert.equal(zoomed.minSpanWU, cam.minSpanWU);
    assert.equal(zoomed.maxSpanWU, cam.maxSpanWU);
  }

  // Garbage in stays finite rather than becoming NaN on screen.
  const junk = createMapCamera({ focusGlobal: { x: NaN, z: undefined }, spanWU: NaN });
  assert.equal(junk.focusGlobal.x, 0);
  assert.equal(junk.focusGlobal.z, 0);
  assert.ok(Number.isFinite(junk.spanWU) && junk.spanWU > 0);
});

test('pan moves the focus in the GLOBAL frame and leaves the span alone', () => {
  const cam = createMapCamera({ focusGlobal: TETHYS, spanWU: 4096 });
  const panned = panBy(cam, { x: -1024, z: 2048 });
  assert.deepEqual({ ...panned.focusGlobal }, { x: TETHYS.x - 1024, z: TETHYS.z + 2048 });
  assert.equal(panned.spanWU, cam.spanWU);
});
