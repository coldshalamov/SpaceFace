// Deep-space addressing contract tests (ADR D4).
//
// The governing property is negative and absolute: the player is NEVER spatially undefined. A test
// suite that only checked the happy midpoint would pass while the readout went blank in exactly the
// place the feature exists to cover, so the last test fuzzes a grid across the whole authored lattice
// — including negative quadrants and positions far outside every sector — and asserts a non-empty
// label at every single one.
//
// Every position in this file is GLOBAL (`global_v1`), per D2.1. Helios Prime sits at (0,0), which is
// why frame bugs are invisible there; the arithmetic tests are therefore driven from Tethys Junction
// (12288, 8192) and Ceres Belt (-12288, 8192), where a dropped offset or a flipped sign is a
// 12,288 WU error that cannot hide.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveDeepSpaceAddress,
  resolveRecoveryVerbs,
  resolveDeepSpaceReadout,
  formatAddressLabel,
  graticuleTicks,
  sectorCallSign,
  ADDRESS_KIND,
  DEEP_SPACE_ADDRESS_SCHEMA,
  GRATICULE_TICK_WU,
  GRATICULE_MAJOR_WU,
  RECOVERY_VERBS,
} from '../src/core/deepSpaceAddress.js';
import { buildAtlasIndex } from '../src/core/atlasIndex.js';
import {
  SECTOR_GLOBAL_ORIGINS,
  SECTOR_ORIGIN_LATTICE_WU,
  sectorGlobalOrigin,
  sectorMembershipAtGlobal,
} from '../src/data/sectorCoordinates.js';

const HELIOS = 'sector_helios_prime';       // origin (0, 0)        — the blind spot
const TETHYS = 'sector_tethys_junction';    // origin (12288, 8192) — where a frame bug bites
const CERES = 'sector_ceres_belt';          // origin (-12288, 8192) — negative quadrant

const helios = sectorGlobalOrigin(HELIOS);
const tethys = sectorGlobalOrigin(TETHYS);
const ceres = sectorGlobalOrigin(CERES);

const atlas = buildAtlasIndex();

/** Unit vector from a to b, plus its left-hand perpendicular. */
function chordBasis(a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.sqrt(dx * dx + dz * dz);
  return {
    len,
    dir: { x: dx / len, z: dz / len },
    perp: { x: -dz / len, z: dx / len },
  };
}

// ---------------------------------------------------------------------------------------------
// 1. Inside a sector — the address is the place, not a chord
// ---------------------------------------------------------------------------------------------

test('a player inside a sector zone reports that sector, not a transit chord', () => {
  // Well inside Tethys' authored disc, but deliberately NOT at its origin: a position that is only
  // correct when the sector's global origin is actually applied.
  const pos = { x: tethys.x + 800, z: tethys.z - 400 };
  const address = resolveDeepSpaceAddress(pos);

  assert.equal(address.schema, DEEP_SPACE_ADDRESS_SCHEMA);
  assert.equal(address.kind, ADDRESS_KIND.SECTOR);
  assert.equal(address.inSector, true);
  assert.equal(address.sectorId, TETHYS);
  assert.equal(address.transit, null, 'inside a disc there is no chord to be on');
  assert.equal(address.callSign, 'TETHYS');
  assert.match(address.label, /TETHYS/);
  assert.ok(address.label.length > 0);
  assert.ok(
    address.distanceFromOriginWU <= address.sectorRadiusWU,
    'in-sector requires the position to be within the authored disc',
  );

  // Helios at (0,0) must behave identically — the frame-blind sector is still a sector.
  const heliosAddress = resolveDeepSpaceAddress({ x: 500, z: 500 });
  assert.equal(heliosAddress.kind, ADDRESS_KIND.SECTOR);
  assert.equal(heliosAddress.sectorId, HELIOS);
  assert.equal(heliosAddress.inSector, true);

  // The sector's own origin is trivially inside it, for every authored sector.
  for (const [sectorId, origin] of Object.entries(SECTOR_GLOBAL_ORIGINS)) {
    const atOrigin = resolveDeepSpaceAddress({ x: origin.x, z: origin.z });
    assert.equal(atOrigin.kind, ADDRESS_KIND.SECTOR, `${sectorId} origin must read as in-sector`);
    assert.equal(atOrigin.sectorId, sectorId, `${sectorId} origin must address itself`);
  }
});

// ---------------------------------------------------------------------------------------------
// 2. The midpoint — 50% progress, zero off-axis
// ---------------------------------------------------------------------------------------------

test('exactly midway between Helios and Tethys reports 50% progress and ~0 off-axis', () => {
  const mid = { x: (helios.x + tethys.x) / 2, z: (helios.z + tethys.z) / 2 };
  const address = resolveDeepSpaceAddress(mid);

  assert.equal(address.kind, ADDRESS_KIND.TRANSIT, 'the midpoint is outside both discs');
  assert.equal(address.inSector, false);
  assert.ok(address.transit, 'a transit address carries a chord');

  const ends = [address.transit.from.sectorId, address.transit.to.sectorId].sort();
  assert.deepEqual(ends, [HELIOS, TETHYS].sort(), 'the two nearest origins are the endpoints');

  assert.ok(Math.abs(address.transit.progress - 0.5) < 1e-9, `progress was ${address.transit.progress}`);
  assert.ok(Math.abs(address.transit.offAxisWU) < 1e-6, `off-axis was ${address.transit.offAxisWU}`);
  assert.equal(address.transit.offAxisSign, 0, 'dead on the axis has no side');

  // Endpoints are ordered canonically by sector id, never by proximity — otherwise progress could
  // never exceed 50% and the label would swap ends as the player crossed the midpoint.
  assert.equal(address.transit.from.sectorId, HELIOS, 'helios sorts before tethys');
  assert.equal(address.transit.to.sectorId, TETHYS);

  // The preformatted label is what the HUD and the chart both render.
  assert.equal(address.label, 'HELIOS <-> TETHYS TRANSIT - 50%, 0 WU off-axis');
  assert.equal(
    formatAddressLabel(address, { glyphs: 'unicode' }),
    'HELIOS ↔ TETHYS TRANSIT — 50%, 0 WU off-axis',
  );

  // Chord bookkeeping is self-consistent.
  const expectedLen = Math.sqrt((tethys.x - helios.x) ** 2 + (tethys.z - helios.z) ** 2);
  assert.ok(Math.abs(address.transit.chordLengthWU - expectedLen) < 0.02);
  assert.ok(Math.abs(address.transit.alongWU - address.transit.remainingWU) < 0.02);
});

test('progress advances monotonically from end to end and the label counts up', () => {
  const basis = chordBasis(helios, tethys);
  let previous = -1;
  for (const t of [0.15, 0.3, 0.45, 0.62, 0.8]) {
    const pos = { x: helios.x + basis.dir.x * basis.len * t, z: helios.z + basis.dir.z * basis.len * t };
    const address = resolveDeepSpaceAddress(pos);
    if (address.kind !== ADDRESS_KIND.TRANSIT) continue; // near an endpoint we may be inside a disc
    assert.ok(address.transit.progress > previous, 'progress must increase along the chord');
    previous = address.transit.progress;
    assert.ok(Math.abs(address.transit.progress - t) < 1e-6, `expected ~${t}, got ${address.transit.progress}`);
  }
  // The ADR's own worked example, reproduced exactly.
  const p62 = { x: helios.x + basis.dir.x * basis.len * 0.62, z: helios.z + basis.dir.z * basis.len * 0.62 };
  assert.match(resolveDeepSpaceAddress(p62).label, /^HELIOS <-> TETHYS TRANSIT - 62%, \d+ WU off-axis$/);
});

test('orientFromSectorId flips the chord so progress counts toward the destination', () => {
  const basis = chordBasis(helios, tethys);
  const pos = { x: helios.x + basis.dir.x * basis.len * 0.25, z: helios.z + basis.dir.z * basis.len * 0.25 };

  const canonical = resolveDeepSpaceAddress(pos);
  assert.equal(canonical.transit.from.sectorId, HELIOS);
  assert.ok(Math.abs(canonical.transit.progress - 0.25) < 1e-6);

  const outbound = resolveDeepSpaceAddress(pos, { orientFromSectorId: TETHYS });
  assert.equal(outbound.transit.from.sectorId, TETHYS);
  assert.equal(outbound.transit.to.sectorId, HELIOS);
  assert.ok(Math.abs(outbound.transit.progress - 0.75) < 1e-6, 'flipping the chord flips progress');
});

// ---------------------------------------------------------------------------------------------
// 3. Off-axis — the assertion that actually catches a broken projection
// ---------------------------------------------------------------------------------------------

test('off-axis distance is correct for a point perpendicular to the chord', () => {
  const basis = chordBasis(helios, tethys);
  const mid = { x: (helios.x + tethys.x) / 2, z: (helios.z + tethys.z) / 2 };
  const OFFSET = 340;

  for (const sign of [1, -1]) {
    const pos = {
      x: mid.x + basis.perp.x * OFFSET * sign,
      z: mid.z + basis.perp.z * OFFSET * sign,
    };
    const address = resolveDeepSpaceAddress(pos);
    assert.equal(address.kind, ADDRESS_KIND.TRANSIT);
    assert.ok(
      Math.abs(address.transit.offAxisWU - OFFSET) < 0.02,
      `expected ~${OFFSET} WU off-axis, got ${address.transit.offAxisWU}`,
    );
    // The load-bearing half: a purely PERPENDICULAR offset must not move progress at all. Off-axis
    // alone passes even if the along-chord projection is wrong; this pins the decomposition.
    assert.ok(
      Math.abs(address.transit.progress - 0.5) < 1e-9,
      `perpendicular offset moved progress to ${address.transit.progress}`,
    );
    assert.equal(address.transit.offAxisSign, sign, 'the two sides of the axis are distinguishable');
    assert.match(address.label, /340 WU off-axis/);
  }

  // A point ON the chord but off-centre has off-axis 0 and non-half progress — the other diagonal
  // of the same decomposition.
  const onAxis = { x: helios.x + basis.dir.x * basis.len * 0.7, z: helios.z + basis.dir.z * basis.len * 0.7 };
  const onAxisAddress = resolveDeepSpaceAddress(onAxis);
  assert.ok(Math.abs(onAxisAddress.transit.offAxisWU) < 1e-6);
  assert.ok(Math.abs(onAxisAddress.transit.progress - 0.7) < 1e-6);
});

// ---------------------------------------------------------------------------------------------
// 4. Large and negative coordinates
// ---------------------------------------------------------------------------------------------

test('large and negative global coordinates behave (Ceres Belt at -12288, 8192)', () => {
  // Inside Ceres' disc, in the negative-X quadrant.
  const inside = resolveDeepSpaceAddress({ x: ceres.x + 600, z: ceres.z + 600 });
  assert.equal(inside.kind, ADDRESS_KIND.SECTOR);
  assert.equal(inside.sectorId, CERES);
  assert.equal(inside.callSign, 'CERES');

  // Midway Helios ↔ Ceres: mirror image of the Tethys case, and the mirror must be exact.
  const mid = { x: (helios.x + ceres.x) / 2, z: (helios.z + ceres.z) / 2 };
  assert.ok(mid.x < 0, 'the Ceres midpoint is in negative X');
  const address = resolveDeepSpaceAddress(mid);
  assert.equal(address.kind, ADDRESS_KIND.TRANSIT);
  assert.deepEqual(
    [address.transit.from.sectorId, address.transit.to.sectorId].sort(),
    [CERES, HELIOS].sort(),
  );
  assert.ok(Math.abs(address.transit.progress - 0.5) < 1e-9);
  assert.ok(Math.abs(address.transit.offAxisWU) < 1e-6);
  assert.equal(address.label, 'CERES <-> HELIOS TRANSIT - 50%, 0 WU off-axis');

  // Off-axis magnitude is sign-symmetric across the mirrored chord.
  const tethysBasis = chordBasis(helios, tethys);
  const ceresBasis = chordBasis(helios, ceres);
  const tethysMid = { x: (helios.x + tethys.x) / 2, z: (helios.z + tethys.z) / 2 };
  const a = resolveDeepSpaceAddress({
    x: tethysMid.x + tethysBasis.perp.x * 500,
    z: tethysMid.z + tethysBasis.perp.z * 500,
  });
  const b = resolveDeepSpaceAddress({
    x: mid.x + ceresBasis.perp.x * 500,
    z: mid.z + ceresBasis.perp.z * 500,
  });
  assert.ok(Math.abs(a.transit.offAxisWU - b.transit.offAxisWU) < 0.02);

  // Far outside every authored sector, deep in the negative quadrant: still addressed, still sane.
  const farOut = resolveDeepSpaceAddress({ x: -80000, z: -60000 });
  assert.ok(farOut.sectorId, 'the Voronoi cell exists everywhere');
  assert.ok(farOut.label.length > 0);
  assert.ok(Number.isFinite(farOut.distanceFromOriginWU));
  if (farOut.transit) {
    assert.ok(farOut.transit.progress >= 0 && farOut.transit.progress <= 1, 'progress stays clamped');
    assert.ok(Number.isFinite(farOut.transit.rawProgress));
    assert.ok(Number.isFinite(farOut.transit.offAxisWU) && farOut.transit.offAxisWU >= 0);
  }
});

// ---------------------------------------------------------------------------------------------
// 5. Membership never contradicts the shipped Voronoi resolver
// ---------------------------------------------------------------------------------------------

test('the addressed sector always equals sectorMembershipAtGlobal', () => {
  // If these two ever disagreed, a player on a bisector could read as inside sector A while the
  // chart drew a chord anchored on sector B — the readout contradicting itself exactly where it
  // matters most. One resolver, one answer.
  for (let x = -40960; x <= 40960; x += 5120) {
    for (let z = -12288; z <= 61440; z += 6144) {
      const pos = { x, z };
      assert.equal(
        resolveDeepSpaceAddress(pos).sectorId,
        sectorMembershipAtGlobal(pos),
        `membership disagreement at ${x},${z}`,
      );
    }
  }
});

// ---------------------------------------------------------------------------------------------
// 6. Graticule geometry
// ---------------------------------------------------------------------------------------------

test('graticule ticks land on the surveyor lattice and stay bounded', () => {
  assert.equal(GRATICULE_TICK_WU, 1024, 'quarter of the 4096 WU sector-origin lattice');
  assert.equal(GRATICULE_TICK_WU * 4, SECTOR_ORIGIN_LATTICE_WU);
  assert.equal(GRATICULE_MAJOR_WU, SECTOR_ORIGIN_LATTICE_WU);

  const g = graticuleTicks({ minX: -2000, maxX: 6000, minZ: 0, maxZ: 5000 });
  assert.equal(g.spacingWU, 1024);
  assert.equal(g.decimated, false);
  assert.ok(g.x.length > 0 && g.z.length > 0);

  for (const tick of [...g.x, ...g.z]) {
    // Math.abs because a negative multiple yields -0, which assert.equal distinguishes from 0.
    assert.equal(Math.abs(tick.value % GRATICULE_TICK_WU), 0, `${tick.value} is not on the 1024 WU grid`);
    assert.equal(tick.major, Math.abs(tick.value % SECTOR_ORIGIN_LATTICE_WU) === 0, 'majors are lattice units');
  }
  assert.ok(g.x.every((t) => t.value >= -2000 && t.value <= 6000), 'ticks stay inside the bounds');
  assert.ok(g.x.some((t) => t.value === 0), 'the Helios origin line is a tick');
  assert.ok(g.x.some((t) => t.value === -1024), 'negative ticks exist');
  assert.ok(g.x.find((t) => t.value === 4096).major, '4096 is a major tick');
  assert.equal(g.x.find((t) => t.value === 1024).major, false, '1024 is a minor tick');

  // Zooming out thins the grid rather than emitting thousands of lines — and the coarser grid is a
  // strict SUBSET of the finer one, so ticks thin in place instead of sliding.
  const wide = graticuleTicks({ minX: -200000, maxX: 200000, minZ: -200000, maxZ: 200000 });
  assert.ok(wide.decimated, 'a lattice-wide view must decimate');
  assert.ok(wide.spacingWU > GRATICULE_TICK_WU);
  assert.equal(wide.spacingWU % GRATICULE_TICK_WU, 0, 'coarser spacing is a multiple of the base');
  assert.ok(wide.x.length <= 64 && wide.z.length <= 64, 'tick budget is respected');

  // Degenerate and hostile inputs degrade to an empty grid, never to a hang or a NaN tick.
  assert.deepEqual(graticuleTicks(null).x, []);
  assert.deepEqual(graticuleTicks({ minX: NaN, maxX: 1, minZ: 0, maxZ: 1 }).z, []);
  const inverted = graticuleTicks({ minX: 6000, maxX: -2000, minZ: 5000, maxZ: 0 });
  assert.ok(inverted.x.length > 0, 'inverted bounds are normalized, not rejected');
});

// ---------------------------------------------------------------------------------------------
// 7. Recovery verbs
// ---------------------------------------------------------------------------------------------

test('recovery verbs resolve to real atlas nodes with global positions', () => {
  const basis = chordBasis(helios, tethys);
  const pos = { x: helios.x + basis.dir.x * basis.len * 0.5, z: helios.z + basis.dir.z * basis.len * 0.5 };

  const recovery = resolveRecoveryVerbs(pos, {
    heading: basis.dir,          // flying Helios → Tethys
    lastAnchorId: HELIOS,
  });

  assert.equal(recovery.schema, DEEP_SPACE_ADDRESS_SCHEMA);
  assert.deepEqual([...recovery.order], [...RECOVERY_VERBS]);

  for (const verb of RECOVERY_VERBS) {
    const r = recovery[verb];
    assert.ok(r, `verb ${verb} must be present`);
    assert.equal(r.verb, verb);
    assert.equal(r.available, true, `${verb} should resolve on the Helios↔Tethys chord: ${r.reason}`);

    // Every verb names a REAL atlas node — not a synthesized waypoint.
    const node = atlas.getNode(r.nodeId);
    assert.ok(node, `${verb} resolved to a node id that is not in the atlas: ${r.nodeId}`);
    assert.equal(node.hasPosition, true, `${verb} must resolve to an anchored node`);
    assert.deepEqual(r.globalPos, node.globalPos, `${verb} must report the atlas GLOBAL position`);
    assert.ok(Number.isFinite(r.distanceWU) && r.distanceWU >= 0);

    // The course target is shaped for the existing resolveCourseTarget, which reads FLAT x/z.
    assert.ok(r.courseTarget, `${verb} must carry a course target`);
    assert.equal(r.courseTarget.x, node.globalPos.x, 'course targets carry GLOBAL x');
    assert.equal(r.courseTarget.z, node.globalPos.z, 'course targets carry GLOBAL z');
    assert.equal(r.courseTarget.id, node.id);
    assert.equal(r.courseTarget.kind, node.kind);
    assert.equal(r.courseTarget.sectorId, node.sectorId);
    if (node.kind === 'gate') {
      assert.equal(r.courseTarget.targetSectorId, node.linkSectorId, 'a gate must carry its exit');
    }
  }

  // "Continue" means ahead: strictly positive projection on the heading.
  const ahead = (recovery.continue.globalPos.x - pos.x) * basis.dir.x
    + (recovery.continue.globalPos.z - pos.z) * basis.dir.z;
  assert.ok(ahead > 0, 'the continue anchor must be forward of the player');
  assert.equal(recovery.headingSource, 'heading');

  // "Divert" is a station, by definition.
  assert.equal(recovery.divert.kind, 'station');
  const nearestStation = atlas.nearestNode(pos, { kind: 'station' });
  assert.equal(recovery.divert.nodeId, nearestStation.id, 'divert takes the nearest station');

  // "Return" honours the remembered anchor.
  assert.equal(recovery.return.nodeId, HELIOS);
});

test('recovery degrades honestly when the heading is unknown and when the anchor is not', () => {
  const mid = { x: (helios.x + tethys.x) / 2, z: (helios.z + tethys.z) / 2 };

  // No heading, no velocity, no last anchor: the chord supplies a direction rather than a guess.
  const chordOnly = resolveRecoveryVerbs(mid, {});
  assert.equal(chordOnly.headingSource, 'transit-chord');
  assert.equal(chordOnly.divert.available, true);
  // With nothing remembered, "return" falls back to the addressed sector — always valid, never null.
  assert.equal(chordOnly.return.available, true);
  assert.equal(chordOnly.return.nodeId, sectorMembershipAtGlobal(mid));
  assert.match(chordOnly.return.reason, /fallback/);

  // Departing an anchor implies the forward direction without any heading input.
  const departed = resolveRecoveryVerbs(mid, { lastAnchorId: HELIOS });
  assert.equal(departed.headingSource, 'departed-anchor');
  const away = (departed.continue.globalPos.x - mid.x) * (mid.x - helios.x)
    + (departed.continue.globalPos.z - mid.z) * (mid.z - helios.z);
  assert.ok(away > 0, 'continuing means moving further from the anchor you left');

  // An unknown anchor id must not fabricate a target.
  const unknown = resolveRecoveryVerbs(mid, { lastAnchorId: 'station_does_not_exist' });
  assert.equal(unknown.return.available, true);
  assert.notEqual(unknown.return.nodeId, 'station_does_not_exist');

  // A heading pointing away from everything charted leaves `continue` unavailable rather than wrong.
  const emptyDirection = resolveRecoveryVerbs({ x: -120000, z: -120000 }, { heading: { x: -1, z: -1 } });
  assert.equal(emptyDirection.continue.available, false);
  assert.equal(emptyDirection.continue.nodeId, null);
  assert.equal(emptyDirection.continue.courseTarget, null);
  assert.ok(emptyDirection.continue.reason.length > 0, 'an unavailable verb explains itself');
  // The other two still work — one dead verb never blanks the panel.
  assert.equal(emptyDirection.divert.available, true);
  assert.equal(emptyDirection.return.available, true);
});

// ---------------------------------------------------------------------------------------------
// 8. The governing property: never undefined, anywhere
// ---------------------------------------------------------------------------------------------

test('the readout is never empty or undefined anywhere on the lattice', () => {
  const STEP = 2048;
  let sampled = 0;
  let transitSamples = 0;
  let sectorSamples = 0;

  for (let x = -49152; x <= 53248; x += STEP) {
    for (let z = -12288; z <= 77824; z += STEP) {
      const pos = { x, z };
      const address = resolveDeepSpaceAddress(pos);
      sampled++;

      assert.ok(address, `no address at ${x},${z}`);
      assert.equal(address.schema, DEEP_SPACE_ADDRESS_SCHEMA);
      assert.ok(
        address.kind === ADDRESS_KIND.SECTOR || address.kind === ADDRESS_KIND.TRANSIT,
        `unknown address kind at ${x},${z}: ${address.kind}`,
      );
      assert.equal(typeof address.label, 'string', `label is not a string at ${x},${z}`);
      assert.ok(address.label.trim().length > 0, `empty label at ${x},${z}`);
      assert.ok(!/undefined|NaN|null/.test(address.label), `label leaked a hole at ${x},${z}: ${address.label}`);
      assert.ok(address.sectorId, `no sector membership at ${x},${z}`);
      assert.ok(Number.isFinite(address.distanceFromOriginWU), `non-finite distance at ${x},${z}`);
      assert.equal(address.globalPos.x, x);
      assert.equal(address.globalPos.z, z);

      if (address.kind === ADDRESS_KIND.TRANSIT) {
        transitSamples++;
        const t = address.transit;
        assert.ok(t, `transit kind without a chord at ${x},${z}`);
        assert.ok(t.progress >= 0 && t.progress <= 1, `progress out of range at ${x},${z}`);
        assert.ok(Number.isFinite(t.offAxisWU) && t.offAxisWU >= 0, `bad off-axis at ${x},${z}`);
        assert.ok(t.chordLengthWU > 0, `degenerate chord at ${x},${z}`);
        assert.notEqual(t.from.sectorId, t.to.sectorId, `chord endpoints collapsed at ${x},${z}`);
        assert.ok(
          t.from.sectorId === address.sectorId || t.to.sectorId === address.sectorId,
          `the chord must touch the addressed sector at ${x},${z}`,
        );
        assert.ok(t.from.sectorId < t.to.sectorId, `endpoints not canonically ordered at ${x},${z}`);
      } else {
        sectorSamples++;
        assert.equal(address.transit, null);
      }

      // Both branches must also produce a non-empty unicode label — the map renders that variant.
      assert.ok(formatAddressLabel(address, { glyphs: 'unicode' }).trim().length > 0);
    }
  }

  // The fuzz must actually exercise BOTH branches, or it proves nothing about the transit path.
  assert.ok(sampled > 500, `expected a dense grid, sampled ${sampled}`);
  assert.ok(transitSamples > 0, 'no deep-space samples — the fuzz never left a sector disc');
  assert.ok(sectorSamples > 0, 'no in-sector samples — the fuzz never entered a sector disc');
});

test('degenerate and hostile inputs still produce an address', () => {
  for (const pos of [null, undefined, {}, { x: NaN, z: NaN }, { x: Infinity, z: 0 }]) {
    const address = resolveDeepSpaceAddress(pos);
    assert.ok(address, 'a missing position must still be addressed');
    assert.ok(address.label.trim().length > 0);
    assert.ok(!/undefined|NaN/.test(address.label), `label leaked a hole: ${address.label}`);
  }
  // An empty candidate set falls back to the full corridor set (both sectorMembershipAtGlobal and
  // rankSectors do this), so it still addresses normally rather than degrading. Asserted so the
  // fallback is a stated contract, not an accident a future edit could quietly remove.
  const nowhere = resolveDeepSpaceAddress({ x: 0, z: 0 }, { candidates: [] });
  assert.equal(nowhere.sectorId, HELIOS, 'an empty candidate set falls back to the corridor set');
  assert.ok(nowhere.label.trim().length > 0);
  assert.equal(formatAddressLabel(null), 'UNCHARTED SPACE');
});

test('call signs are short, upper-case and unique across every authored sector', () => {
  const seen = new Map();
  for (const sectorId of Object.keys(SECTOR_GLOBAL_ORIGINS)) {
    const node = atlas.getNode(sectorId);
    const sign = sectorCallSign(sectorId, node && node.name);
    assert.equal(sign, sign.toUpperCase(), `${sectorId} call sign must be upper case`);
    assert.ok(!/\s/.test(sign), `${sectorId} call sign must be one token: "${sign}"`);
    assert.ok(!seen.has(sign), `call sign collision: ${sectorId} and ${seen.get(sign)} are both "${sign}"`);
    seen.set(sign, sectorId);
  }
  assert.equal(seen.size, Object.keys(SECTOR_GLOBAL_ORIGINS).length);
  // Derivable from the id alone when a name is missing.
  assert.equal(sectorCallSign('sector_tethys_junction', null), 'TETHYS');
  assert.equal(sectorCallSign(null, null), 'UNCHARTED');
});

// ---------------------------------------------------------------------------------------------
// 9. Purity and the combined readout
// ---------------------------------------------------------------------------------------------

test('the module is pure: identical inputs give deep-equal outputs', () => {
  const pos = { x: 4321, z: 6789 };
  assert.deepEqual(resolveDeepSpaceAddress(pos), resolveDeepSpaceAddress(pos));
  assert.deepEqual(resolveRecoveryVerbs(pos, { lastAnchorId: HELIOS }), resolveRecoveryVerbs(pos, { lastAnchorId: HELIOS }));
  assert.deepEqual(
    graticuleTicks({ minX: 0, maxX: 9000, minZ: 0, maxZ: 9000 }),
    graticuleTicks({ minX: 0, maxX: 9000, minZ: 0, maxZ: 9000 }),
  );

  // A caller must not be able to corrupt the shared read model by mutating what it was handed.
  const address = resolveDeepSpaceAddress(pos);
  assert.throws(() => { address.label = 'tampered'; }, TypeError);
  assert.throws(() => { address.globalPos.x = 0; }, TypeError);
});

test('resolveDeepSpaceReadout returns all three layers describing one instant', () => {
  const mid = { x: (helios.x + tethys.x) / 2, z: (helios.z + tethys.z) / 2 };
  const readout = resolveDeepSpaceReadout(mid, {
    lastAnchorId: HELIOS,
    bounds: { minX: mid.x - 4000, maxX: mid.x + 4000, minZ: mid.z - 4000, maxZ: mid.z + 4000 },
  });

  assert.equal(readout.schema, DEEP_SPACE_ADDRESS_SCHEMA);
  assert.equal(readout.address.kind, ADDRESS_KIND.TRANSIT);
  assert.equal(readout.recovery.return.nodeId, HELIOS);
  assert.ok(readout.graticule.x.length > 0);
  assert.equal(readout.graticule.spacingWU, GRATICULE_TICK_WU);
  // The recovery layer reused the same address rather than re-deriving it.
  assert.deepEqual(readout.recovery.divert.globalPos, resolveRecoveryVerbs(mid, {}).divert.globalPos);
  // Omitting bounds omits the graticule; the chart owns its own extent.
  assert.equal(resolveDeepSpaceReadout(mid, {}).graticule, null);
});
