#!/usr/bin/env node
// P1 — SYSTEM map coordinate-frame contract.
//
// buildSystemModel composes three sources that do NOT share a frame: live sim entities are
// galactic-global (core/coordinates `global_v1`), while sectorZones centres and authored
// station/gate/POI anchors are sector-local. The model used to publish them all as raw `x`/`z`,
// so every sector whose origin is not (0,0) drew its own furniture a whole lattice offset away
// from itself. Helios Prime is the only sector where that is invisible — its origin IS (0,0) —
// and it is the starting sector, which is why the defect survived.
//
// The contract this guards is TWO declared frames, never mixed inside one field:
//   `x`/`z`   — GLOBAL. The nav frame. resolveCourseTarget copies it into `ui:setCourse`, and
//               world.js `_onSetCourse` writes it to `state.nav.autopilot.target`. A fix that is
//               not global sends the ship to the wrong sector.
//   `drawPos` — SECTOR-LOCAL. The draw frame. The only frame the SYSTEM canvas may project.
//
// This is deliberately NOT "assert x/z is sector-local". That would break autopilot and would
// contradict the sibling arrays (ownership markers, wreck bearings) which already carry global
// x/z beside a local drawPos, a pairing pinned by test/claim-specializations.test.mjs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildSystemModel } from '../src/ui/galaxyMap.js';
import { SECTORS } from '../src/data/sectors.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { sectorGlobalOrigin, sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';

let sections = 0;
function ok(label) {
  sections++;
  console.log(`  PASS ${label}`);
}

const ZERO_ORIGIN = 'sector_helios_prime';      // origin (0, 0) — the blind spot
const NONZERO_ORIGIN = 'sector_tethys_junction'; // origin (12288, 8192) — where it bit

// station_tethys and zone_tethys_hub are authored at the SAME sector-local point, so on a correct
// chart they draw on top of each other. Before the fix the live station sat 12,288 WU from its own
// zone. Reusing the exact authored point makes the co-location assertion a real-data assertion.
const COLOCATED_LOCAL = Object.freeze({ x: 1050, z: 380 });
const LIVE_ENTITY_ID = 99;
const PLAYER_ID = 1;

function sectorRecord(sectorId) {
  const record = SECTORS.find((s) => s.id === sectorId);
  assert.ok(record, `fixture depends on authored sector ${sectorId}`);
  return record;
}

/** A live station entity standing at `local` within `sectorId`, stamped so residency keeps it. */
function liveStationAt(sectorId, local) {
  const global = sectorLocalToGlobalForSector(local, sectorId);
  return {
    id: LIVE_ENTITY_ID,
    type: 'station',
    alive: true,
    pos: { x: global.x, z: global.z },
    homeSectorId: sectorId,
    data: { stationId: 'station_live_probe', name: 'Live Berth', homeSectorId: sectorId },
  };
}

/**
 * `playerLocal` is sector-local within `currentSectorId`; pass null to omit the player entity
 * entirely so the null-player branch is exercised rather than faked.
 */
function stateFixture(currentSectorId, { live = true, playerLocal = { x: 0, z: 0 } } = {}) {
  const entityList = [];
  if (playerLocal) {
    const g = sectorLocalToGlobalForSector(playerLocal, currentSectorId);
    entityList.push({
      id: PLAYER_ID, type: 'ship', alive: true, pos: { x: g.x, z: g.z }, rot: 0.5,
      homeSectorId: currentSectorId, data: { homeSectorId: currentSectorId },
    });
  }
  if (live) entityList.push(liveStationAt(currentSectorId, COLOCATED_LOCAL));
  return {
    world: { currentSectorId, sectors: {} },
    entities: new Map(entityList.map((e) => [e.id, e])),
    entityList,
    playerId: playerLocal ? PLAYER_ID : null,
  };
}

function livePoint(model) {
  return model.points.find((p) => p.entityId === LIVE_ENTITY_ID) || null;
}

/** Largest sector-local radius the model asks the canvas to fit (this is what blew out). */
function drawExtent(model) {
  let max = 0;
  for (const z of model.zones) max = Math.max(max, Math.hypot(z.x, z.z) + (z.radius || 0));
  for (const p of model.points) {
    if (p.drawPos) max = Math.max(max, Math.hypot(p.drawPos.x, p.drawPos.z));
  }
  return max;
}

/** The same extent computed the OLD way, over raw x/z — kept to prove the guard has teeth. */
function rawExtent(model) {
  let max = 0;
  for (const z of model.zones) max = Math.max(max, Math.hypot(z.x, z.z) + (z.radius || 0));
  for (const p of model.points) {
    if (Number.isFinite(p.x) && Number.isFinite(p.z)) max = Math.max(max, Math.hypot(p.x, p.z));
  }
  return max;
}

// ---------------------------------------------------------------------------
// (a) A live station lands on its own zone, in BOTH a zero- and nonzero-origin sector.
// ---------------------------------------------------------------------------
function testLiveEntityConversion() {
  for (const sectorId of [ZERO_ORIGIN, NONZERO_ORIGIN]) {
    const origin = sectorGlobalOrigin(sectorId);
    const state = stateFixture(sectorId);
    const model = buildSystemModel(state, sectorId);
    const point = livePoint(model);
    assert.ok(point, `${sectorId}: the live station must appear in the system model`);

    assert.deepEqual(
      { x: point.drawPos.x, z: point.drawPos.z }, { x: COLOCATED_LOCAL.x, z: COLOCATED_LOCAL.z },
      `${sectorId}: live station draws at its authored sector-local point, not its global one`,
    );
    // The nav frame must stay global, or the autopilot fix lands a lattice offset away.
    assert.deepEqual(
      { x: point.x, z: point.z },
      { x: origin.x + COLOCATED_LOCAL.x, z: origin.z + COLOCATED_LOCAL.z },
      `${sectorId}: live station keeps a GLOBAL x/z for the ui:setCourse payload`,
    );
  }

  // The real authored coincidence: station_tethys shares zone_tethys_hub's centre exactly.
  const hub = zonesForSector(NONZERO_ORIGIN).find((z) => z.id === 'zone_tethys_hub');
  assert.ok(hub, 'fixture depends on authored zone_tethys_hub');
  const model = buildSystemModel(stateFixture(NONZERO_ORIGIN), NONZERO_ORIGIN);
  const point = livePoint(model);
  const gap = Math.hypot(point.drawPos.x - hub.center.x, point.drawPos.z - hub.center.z);
  assert.equal(gap, 0,
    `live Tethys berth must be co-located with its own zone (was 12288 WU adrift), got ${gap}`);

  // Static authored anchors travel the other way: local on the chart, global for the course.
  const statik = model.points.find((p) => p.stationId === 'station_customs');
  assert.ok(statik, 'authored station_customs must still list from the static fallback');
  const customs = sectorRecord(NONZERO_ORIGIN).stations.find((s) => s.id === 'station_customs');
  const customsAnchor = customs.pos || customs.anchor || customs.position;
  assert.deepEqual({ x: statik.drawPos.x, z: statik.drawPos.z },
    { x: customsAnchor.x, z: customsAnchor.z },
    'authored anchors are already sector-local, so drawPos passes them through unchanged');
  assert.deepEqual({ x: statik.x, z: statik.z },
    { x: sectorGlobalOrigin(NONZERO_ORIGIN).x + customsAnchor.x,
      z: sectorGlobalOrigin(NONZERO_ORIGIN).z + customsAnchor.z },
    'authored anchors are lifted to global for the nav frame (their course was silently wrong)');

  ok('live and authored points expose sector-local drawPos beside a global nav x/z');
}

// ---------------------------------------------------------------------------
// BIDIRECTIONAL frame guard over EVERY point, whatever its provenance.
//
// A guard that only watched the live path would let the STATIC path rot back into sector-local
// values sitting in x/z — the latent autopilot bug this packet also fixes, and one that is
// invisible in Helios. At a nonzero origin the two frames are 12,288 WU apart, so each point can be
// pinned to its exact origin offset with zero tolerance, in both directions at once.
// ---------------------------------------------------------------------------
function testEveryPointDeclaresBothFrames() {
  for (const sectorId of [ZERO_ORIGIN, NONZERO_ORIGIN]) {
    const origin = sectorGlobalOrigin(sectorId);
    const model = buildSystemModel(stateFixture(sectorId), sectorId);

    const provenance = new Set();
    let positioned = 0;
    for (const p of model.points) {
      provenance.add(p.entityId != null ? 'live' : p.kind);
      if (!p.drawPos) {
        // A position-less catalog entry is legal, but then BOTH frames must be absent.
        assert.equal(p.x, null, `${sectorId}/${p.id}: no drawPos means no global x either`);
        assert.equal(p.z, null, `${sectorId}/${p.id}: no drawPos means no global z either`);
        continue;
      }
      positioned++;
      assert.ok(Number.isFinite(p.x) && Number.isFinite(p.z),
        `${sectorId}/${p.id}: a drawable point must also carry a finite global x/z for nav`);
      assert.equal(p.x - p.drawPos.x, origin.x,
        `${sectorId}/${p.id}: x must be GLOBAL (drawPos.x + origin.x) — a sector-local value here arms the autopilot a lattice short`);
      assert.equal(p.z - p.drawPos.z, origin.z,
        `${sectorId}/${p.id}: z must be GLOBAL (drawPos.z + origin.z) — a sector-local value here arms the autopilot a lattice short`);
    }

    assert.ok(positioned >= 4, `${sectorId}: expected several positioned points, saw ${positioned}`);
    // The guard only means something if it actually reached the static paths, not just the live one.
    for (const required of ['live', 'station', 'gate']) {
      assert.ok(provenance.has(required),
        `${sectorId}: frame guard must cover ${required} provenance (saw ${[...provenance].join(', ')})`);
    }
  }
  ok('every point — live, static station, static gate, poi — declares both frames exactly');
}

// ---------------------------------------------------------------------------
// (b) Draw extents stay inside the sector, so the auto-fit cannot blow out.
// ---------------------------------------------------------------------------
function testSpanStaysInsideSector() {
  for (const sectorId of [ZERO_ORIGIN, NONZERO_ORIGIN]) {
    const record = sectorRecord(sectorId);
    const bound = Number(record.worldRadius) || 4000;
    const model = buildSystemModel(stateFixture(sectorId), sectorId);
    const extent = drawExtent(model);
    assert.ok(extent > 0, `${sectorId}: model must actually contain drawable furniture`);
    assert.ok(extent <= bound,
      `${sectorId}: draw extent ${extent.toFixed(1)} must stay inside worldRadius ${bound}`);
  }

  // Teeth: the pre-fix computation (raw x/z) must still visibly violate the bound at a nonzero
  // origin. If this ever stops holding, the assertion above has stopped proving anything.
  const record = sectorRecord(NONZERO_ORIGIN);
  const bound = Number(record.worldRadius) || 4000;
  const model = buildSystemModel(stateFixture(NONZERO_ORIGIN), NONZERO_ORIGIN);
  const raw = rawExtent(model);
  assert.ok(raw > bound * 2,
    `guard has teeth: raw-global extent ${raw.toFixed(1)} must dwarf worldRadius ${bound}`);

  ok('system draw extents stay within the sector; the raw-global extent still blows out');
}

// ---------------------------------------------------------------------------
// (c) The player field: present, converted, honest about remote surveys, null when absent.
// ---------------------------------------------------------------------------
function testPlayerField() {
  const local = { x: 200, z: -140 };

  for (const sectorId of [ZERO_ORIGIN, NONZERO_ORIGIN]) {
    const origin = sectorGlobalOrigin(sectorId);
    const state = stateFixture(sectorId, { playerLocal: local });
    const model = buildSystemModel(state, sectorId);
    assert.ok(model.player, `${sectorId}: system model must carry a player mark`);
    assert.equal(model.player.inSector, true, `${sectorId}: player is standing in this sector`);
    assert.deepEqual({ x: model.player.drawPos.x, z: model.player.drawPos.z }, { x: local.x, z: local.z },
      `${sectorId}: player mark is converted into this sector's local frame`);
    // The player mark must carry the SAME two-frame shape as points and ownership markers. A mark
    // that disagreed in shape with every other mark is how the next agent reintroduces the defect.
    assert.equal(model.player.x - model.player.drawPos.x, origin.x,
      `${sectorId}: player x is the global frame (drawPos.x + origin.x), like every other mark`);
    assert.equal(model.player.z - model.player.drawPos.z, origin.z,
      `${sectorId}: player z is the global frame (drawPos.z + origin.z), like every other mark`);
    assert.equal(model.player.distance, 0, `${sectorId}: an in-sector player needs no off-chart hint`);
  }

  // Surveying a remote sector: standing in Helios, reading Tethys.
  const remote = buildSystemModel(stateFixture(ZERO_ORIGIN, { playerLocal: local }), NONZERO_ORIGIN);
  assert.ok(remote.player, 'a remote survey still reports where the player is');
  assert.equal(remote.player.inSector, false, 'the player is NOT inside the surveyed sector');
  const originGap = sectorGlobalOrigin(NONZERO_ORIGIN);
  const playerGlobal = sectorLocalToGlobalForSector(local, ZERO_ORIGIN);
  const expectX = playerGlobal.x - originGap.x;
  const expectZ = playerGlobal.z - originGap.z;
  assert.deepEqual({ x: remote.player.drawPos.x, z: remote.player.drawPos.z }, { x: expectX, z: expectZ },
    'remote player mark is expressed in the SURVEYED sector local frame');
  assert.deepEqual({ x: remote.player.x, z: remote.player.z }, { x: playerGlobal.x, z: playerGlobal.z },
    'remote player nav x/z stays global — it does not rebase onto the surveyed sector');
  assert.equal(remote.player.distance, Math.hypot(expectX, expectZ),
    'distance is measured from the surveyed sector origin');
  assert.equal(remote.player.bearing, Math.atan2(expectZ, expectX),
    'bearing points from the surveyed sector origin toward the player');
  assert.ok(remote.player.distance > (Number(sectorRecord(NONZERO_ORIGIN).worldRadius) || 4000),
    'a genuinely remote player reads as outside the surveyed sector, not as an in-sector mark');

  // No player entity -> null. The field must never be fabricated.
  const headless = buildSystemModel(stateFixture(ZERO_ORIGIN, { playerLocal: null }), ZERO_ORIGIN);
  assert.equal(headless.player, null, 'no player entity must yield a null player field, not a fake origin mark');

  ok('player mark converts per surveyed sector, flags remote surveys, and stays null when absent');
}

// ---------------------------------------------------------------------------
// (d) Regression guard on the DRAW frame.
//
// Deliberately NOT "no raw e.pos in the model" — raw e.pos in `x`/`z` is the intended nav frame.
// What must never come back is projecting a global position onto the sector-local canvas.
// ---------------------------------------------------------------------------
function testDrawFrameGuard() {
  for (const sectorId of [ZERO_ORIGIN, NONZERO_ORIGIN]) {
    const bound = Number(sectorRecord(sectorId).worldRadius) || 4000;
    const model = buildSystemModel(stateFixture(sectorId), sectorId);
    for (const p of model.points) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) {
        assert.equal(p.drawPos, null,
          `${sectorId}: ${p.id} has no nav position, so it must not claim a draw position either`);
        continue;
      }
      assert.ok(p.drawPos && Number.isFinite(p.drawPos.x) && Number.isFinite(p.drawPos.z),
        `${sectorId}: ${p.id} is positioned, so it MUST publish a sector-local drawPos`);
      assert.ok(Math.hypot(p.drawPos.x, p.drawPos.z) <= bound,
        `${sectorId}: ${p.id} drawPos escaped the sector — a global position leaked into the draw frame`);
    }
  }

  // Source guard: the SYSTEM canvas must project only converted coordinates.
  const src = readFileSync(new URL('../src/ui/galaxyMap.js', import.meta.url), 'utf8');
  // Match the DEFINITION, not the `this._drawSystem(...)` call site in _draw() — the call site
  // comes first in the file and sliced a 40-character window that trivially passed nothing.
  const start = src.indexOf('_drawSystem(g, state, w, h) {');
  const end = src.indexOf('_drawLocal(g, state, w, h) {');
  assert.ok(start > 0 && end > start, 'check must be able to isolate the _drawSystem body');
  assert.ok(end - start > 4000, 'the isolated _drawSystem body must be the real function, not a call site');
  const drawSystem = src.slice(start, end);

  assert.match(drawSystem, /sx\(p\.drawPos\.x\)/,
    '_drawSystem must project points through drawPos');
  // Present-checks, not just absent-checks: deleting the player draw outright would otherwise pass.
  assert.match(drawSystem, /sx\(model\.player\.drawPos\.x\)/,
    '_drawSystem must still draw "you are here", and must draw it through the converted drawPos');
  // NOT asserted here: an off-chart indicator for a remote survey. _drawSystem always builds with
  // sectorId=null, so `inSector` is always true on this path and such a branch would be
  // unreachable — a check pinning it would only be pinning dead code. The model-level support
  // (inSector/bearing/distance) is the real deliverable and is covered by testPlayerField above;
  // whoever adds remote-sector surveying wires the indicator and asserts it then.
  assert.match(drawSystem, /model\.player\.inSector/,
    '_drawSystem must gate the "you are here" triangle on inSector, so a remote survey never gets a confident in-sector mark');
  assert.doesNotMatch(drawSystem, /sx\(p\.x\)|sz\(p\.z\)/,
    '_drawSystem must not project a point\'s global nav x/z onto the sector-local canvas');
  assert.doesNotMatch(drawSystem, /sx\(wp\.pos\.x\)|sz\(wp\.pos\.z\)/,
    '_drawSystem must not project the global nav.waypoint.pos directly');
  assert.doesNotMatch(drawSystem, /sx\(player\.pos\.x\)|sz\(player\.pos\.z\)/,
    '_drawSystem must not project the global player position directly');
  // model.player.x/z is the GLOBAL half of the pair, exactly like every other mark. Projecting it
  // is the same defect wearing the new field name — an easy mistake precisely because the local
  // half now lives one property deeper.
  assert.doesNotMatch(drawSystem, /sx\(model\.player\.x\)|sz\(model\.player\.z\)/,
    '_drawSystem must project the player through model.player.drawPos, not its global x/z');
  assert.match(drawSystem, /sx\(model\.player\.drawPos\.x\)/,
    '_drawSystem must project the player mark through drawPos');

  // Search results are the one place BOTH frames are consumed off the SAME object: selecting a
  // result centres the SYSTEM camera (draw frame) while the primary action arms a course (nav
  // frame). The static points used to centre correctly only because their x/z were accidentally
  // sector-local, so lifting them to global would have silently broken this without a guard.
  assert.match(src, /drawPos: p\.drawPos,/,
    'search targets must carry drawPos so result selection can centre the sector-local camera');
  assert.match(src, /const focus = target\.drawPos/,
    'selecting a search result must centre the SYSTEM camera on the sector-local frame');

  ok('draw frame is guarded in the model, the SYSTEM canvas, and search-result focus');
}

function testRuntimeScope() {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.scripts['check:map-frames'], 'node scripts/check-map-frames.mjs',
    'package exposes check:map-frames');
  ok('check is reachable as npm run check:map-frames');
}

testLiveEntityConversion();
testEveryPointDeclaresBothFrames();
testSpanStaysInsideSector();
testPlayerField();
testDrawFrameGuard();
testRuntimeScope();

console.log(`Map frames OK — ${sections} sections; SYSTEM model keeps global nav x/z and sector-local drawPos.`);
