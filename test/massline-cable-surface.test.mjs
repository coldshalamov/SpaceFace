// Massline cable surface: the drawn line's cross-section, its load ferrules, the Snarl strand
// frame, and the release annulus silhouette.
//
// Every assertion here is about SHAPE. None of it reads a colour, because the family's contract is
// that the load has to be legible with the colour removed (VFX_TECHNIQUE_STANDARD §1 massline row,
// §3 "Loaded Massline").
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  resolveMasslineCableProfile,
  resolveMasslineWebStrandProfile,
} from '../src/render/masslinePresentation.js';
import {
  MASSLINE_CABLE_COLLAR_COUNT,
  MASSLINE_CABLE_SEGMENT_CAPACITY,
  createMasslineCenterline,
  createMasslineCollarSurface,
  createMasslineRibbonSurface,
  writeMasslineCenterline,
  writeMasslineCollarSurface,
  writeMasslineRibbonSurface,
} from '../src/render/masslineCableSurface.js';
import { TetherWebFx } from '../src/render/combat/tetherWebFx.js';
import { WEB_DEF_ID, WEB_LIMITS } from '../src/combat/tetherWebs.js';
import {
  MASSLINE_RELEASE_QUALITIES,
  createMasslineReleaseArcScratch,
  resolveMasslineReleaseArcPlan,
  writeMasslineReleaseArcGeometry,
} from '../src/render/masslineReleaseArc.js';

const COLLAR_ROWS = 4;
const COLLAR_COLS = 3;

function curveFrame(overrides = {}) {
  return {
    ax: 1200, az: -430,
    dx: 96, dz: 38,
    px: -0.368, pz: 0.930,
    segments: 24,
    slackBow: 0,
    whipAmplitude: 0, whipHarmonic: 3, whipPhase: 0, whipFreq: 0,
    shiverAmplitude: 0, shiverPhase: 0, shiverPhaseFast: 0,
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/* Endpoint truth                                                              */
/* -------------------------------------------------------------------------- */

test('both drawn ends stay welded to the attachment poses they were handed', () => {
  const line = createMasslineCenterline();
  // Deterministic sweep across the whole envelope the live cable can present: deep slack bow, a
  // full snap whip, the load shiver, and every span count the buffer supports.
  for (let step = 0; step < 64; step += 1) {
    const frame = curveFrame({
      segments: 6 + (step % (MASSLINE_CABLE_SEGMENT_CAPACITY - 5)),
      slackBow: ((step * 7) % 49) - 24,
      whipAmplitude: (step % 11) * 5.2,
      whipHarmonic: step % 2 ? 5 : 3,
      whipPhase: step * 0.137,
      whipFreq: 46,
      shiverAmplitude: (step % 5) * 0.13,
      shiverPhase: step * 1.7,
      shiverPhaseFast: step * 4.1,
    });
    writeMasslineCenterline(line, frame);
    const last = line.segments;
    assert.equal(line.x[0], frame.ax, 'the source end is exactly the presented source anchor');
    assert.equal(line.z[0], frame.az);
    assert.ok(Math.abs(line.x[last] - (frame.ax + frame.dx)) < 1e-4,
      'the anchor end is exactly the presented target anchor');
    assert.ok(Math.abs(line.z[last] - (frame.az + frame.dz)) < 1e-4);
    assert.equal(line.count, line.segments + 1);
    assert.ok(line.length >= Math.hypot(frame.dx, frame.dz) - 1e-3,
      'arc length can never be shorter than the chord it spans');
  }
});

test('the surface owns no clock: identical inputs write identical geometry', () => {
  const line = createMasslineCenterline();
  const profile = resolveMasslineCableProfile({ chord: 103, load: 0.7, taut: true });
  const ribbon = createMasslineRibbonSurface();
  const frame = curveFrame({ segments: profile.segments, slackBow: 3 });

  writeMasslineCenterline(line, frame);
  writeMasslineRibbonSurface(ribbon, line, profile.coreHalfWidth, 1.5);
  const first = ribbon.positions.slice(0, ribbon.vertexCount * 3);

  // A reduced-motion frame is the same call with the animated amplitudes zeroed upstream. Nothing
  // in this module may advance on its own between the two writes.
  writeMasslineCenterline(line, frame);
  writeMasslineRibbonSurface(ribbon, line, profile.coreHalfWidth, 1.5);
  assert.deepEqual(ribbon.positions.slice(0, ribbon.vertexCount * 3), first);
});

/* -------------------------------------------------------------------------- */
/* Curvature-sensitive tessellation                                            */
/* -------------------------------------------------------------------------- */

test('span count follows curvature and running motion, not chord length', () => {
  const quietShort = resolveMasslineCableProfile({ chord: 20, load: 0, taut: true });
  const quietLong = resolveMasslineCableProfile({ chord: 400, load: 0, taut: true });
  assert.equal(quietShort.segments, quietLong.segments,
    'a straight line is straight at any length: the shader travel rides a linear varying');
  assert.equal(quietShort.segments, 6, 'a quiet straight line sits on the floor');

  const buffer = createMasslineRibbonSurface();
  assert.equal(buffer.capacity, MASSLINE_CABLE_SEGMENT_CAPACITY,
    'the planner clamps to exactly the span count the resident buffer holds');
  assert.equal(
    resolveMasslineCableProfile({ chord: 120, bowMagnitude: 9999, whipAmplitude: 9999, whipCycles: 999 }).segments,
    MASSLINE_CABLE_SEGMENT_CAPACITY,
    'an extreme curve saturates at the buffer, never past it',
  );

  const bowed = resolveMasslineCableProfile({ chord: 120, load: 0, bowMagnitude: 22 });
  const whipped = resolveMasslineCableProfile({
    chord: 120, load: 0.9, taut: true,
    bowMagnitude: 3, whipAmplitude: 48, whipCycles: 2.5,
    shiverAmplitude: 0.5, shiverCycles: 7.5,
  });
  assert.ok(bowed.segments > quietShort.segments, 'a slack bow has to be resolved');
  assert.ok(whipped.segments > bowed.segments, 'a snapping, shivering line asks for the most');
  assert.ok(whipped.segments <= MASSLINE_CABLE_SEGMENT_CAPACITY,
    'the resident buffer is never overrun');

  // Monotone in deviation: no span count may fall as the curve gets harder.
  let previous = 0;
  for (let deviation = 0; deviation <= 76; deviation += 4) {
    const profile = resolveMasslineCableProfile({ chord: 120, bowMagnitude: deviation });
    assert.ok(profile.segments >= previous, `span count fell at deviation ${deviation}`);
    previous = profile.segments;
  }

  // Accessibility pays twice: zeroed amplitudes are both a still line and a cheap one.
  const reduced = resolveMasslineCableProfile({
    chord: 120, load: 0.9, taut: true,
    bowMagnitude: 0, whipAmplitude: 0, whipCycles: 2.5,
    shiverAmplitude: 0, shiverCycles: 7.5,
  });
  assert.equal(reduced.segments, 6,
    'reduced motion removes the motion AND the cost of resolving it');
});

test('cross-section width is a pure function of the load state', () => {
  const state = { load: 0.62, taut: true, whip: 0.3, reel: 0.2 };
  const a = resolveMasslineCableProfile({ ...state, chord: 18, bowMagnitude: 0 });
  const b = resolveMasslineCableProfile({ ...state, chord: 380, bowMagnitude: 31, shiverAmplitude: 0.5, shiverCycles: 7.5 });
  assert.equal(a.coreHalfWidth, b.coreHalfWidth,
    'a distant line must not be inflated into a thicker stroke');
  assert.equal(a.sheathHalfWidth, b.sheathHalfWidth);

  const slack = resolveMasslineCableProfile({ load: 0, taut: false });
  const taut = resolveMasslineCableProfile({ load: 1, taut: true });
  assert.ok(taut.coreHalfWidth < slack.coreHalfWidth + 0.08,
    'the accepted relation holds: a worked line reads tighter than a lazy one');
  assert.ok(taut.sheathHalfWidth > slack.sheathHalfWidth,
    'load still swells the sheath so a heavy pull is legible in silhouette');
});

/* -------------------------------------------------------------------------- */
/* Resident buffers                                                            */
/* -------------------------------------------------------------------------- */

test('ribbon and ferrule buffers are allocated once and only ever re-ranged', () => {
  const line = createMasslineCenterline();
  const ribbon = createMasslineRibbonSurface();
  const collars = createMasslineCollarSurface();
  const positions = ribbon.positions;
  const along = ribbon.along;
  const side = ribbon.side.slice();
  const collarPositions = collars.positions;

  for (const segments of [6, 48, 11, 30, 6]) {
    const profile = resolveMasslineCableProfile({ chord: 120, load: 0.5 });
    writeMasslineCenterline(line, curveFrame({ segments, slackBow: 6 }));
    writeMasslineRibbonSurface(ribbon, line, profile.coreHalfWidth, 1.5);
    writeMasslineCollarSurface(collars, line, profile, 1.55);
    assert.equal(ribbon.positions, positions, 'the ribbon never replaces its position pool');
    assert.equal(ribbon.along, along);
    assert.deepEqual(Array.from(ribbon.side), Array.from(side), 'aSide is static, never re-uploaded');
    assert.equal(collars.positions, collarPositions);
    assert.equal(ribbon.indexCount, segments * 6);
    assert.equal(ribbon.geometry.drawRange.count, segments * 6,
      'only the live spans are drawn, so a quiet line costs what it looks like');
    assert.ok(ribbon.vertexCount * 3 <= positions.length);
    assert.equal(collars.indexCount, MASSLINE_CABLE_COLLAR_COUNT * 12 * 3,
      'four stations by three transverse gives twelve triangles of real surface per ferrule');
  }

  // A degenerate line draws nothing rather than a stale range.
  writeMasslineCenterline(line, curveFrame({ segments: 6, dx: 0, dz: 0 }));
  writeMasslineCollarSurface(collars, line, resolveMasslineCableProfile({ chord: 0 }), 1.55);
  assert.equal(collars.geometry.drawRange.count, 0);
});

/* -------------------------------------------------------------------------- */
/* Load ferrules — the constructed replacement for the flat additive band cards */
/* -------------------------------------------------------------------------- */

test('each load ferrule is a swept profile with a real cross-section, not a flat card', () => {
  const line = createMasslineCenterline();
  const collars = createMasslineCollarSurface();
  const profile = resolveMasslineCableProfile({ chord: 120, load: 0.8, taut: true, bowMagnitude: 5 });
  writeMasslineCenterline(line, curveFrame({ segments: profile.segments, slackBow: 5 }));
  writeMasslineCollarSurface(collars, line, profile, 1.55);

  assert.equal(collars.vertexCount, MASSLINE_CABLE_COLLAR_COUNT * COLLAR_ROWS * COLLAR_COLS);
  for (let collar = 0; collar < MASSLINE_CABLE_COLLAR_COUNT; collar += 1) {
    const base = collar * COLLAR_ROWS * COLLAR_COLS;
    for (let row = 0; row < COLLAR_ROWS; row += 1) {
      const index = base + row * COLLAR_COLS;
      // A transverse centre station is what gives the shader's cross-section term something to
      // fall off from; a two-vertex card has |aSide| == 1 everywhere and shades flat.
      assert.deepEqual(
        [collars.side[index], collars.side[index + 1], collars.side[index + 2]],
        [-1, 0, 1],
        'the ferrule spans its own cross-section',
      );
    }
    // The travelling load pulse must sweep THROUGH a ferrule rather than flashing it whole.
    const lead = collars.along[base];
    const trail = collars.along[base + (COLLAR_ROWS - 1) * COLLAR_COLS];
    assert.ok(trail > lead, 'the ferrule occupies a real span of the line, not one instant of it');
  }

  // Every ferrule vertex rides the rope it is threaded on — measured to the drawn curve itself,
  // not to its sample stations, because the hardware sits wherever the arc length puts it.
  const halfSpan = profile.collarHalfLength + profile.collarCrownHalfWidth + 1e-3;
  for (let vertex = 0; vertex < collars.vertexCount; vertex += 1) {
    const x = collars.positions[vertex * 3];
    const z = collars.positions[vertex * 3 + 2];
    let nearest = Infinity;
    for (let i = 0; i < line.segments; i += 1) {
      nearest = Math.min(nearest, distanceToSpan(x, z, line.x[i], line.z[i], line.x[i + 1], line.z[i + 1]));
    }
    assert.ok(nearest <= halfSpan, `ferrule vertex ${vertex} drifted off the line (${nearest})`);
    assert.equal(collars.positions[vertex * 3 + 1], Math.fround(1.55),
      'the batch stays on its authored plane');
  }
});

function distanceToSpan(x, z, x0, z0, x1, z1) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const lengthSq = dx * dx + dz * dz;
  const t = lengthSq > 1e-12
    ? Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / lengthSq))
    : 0;
  return Math.hypot(x - (x0 + dx * t), z - (z0 + dz * t));
}

test('the ferrule cut is the load read, with no colour in it', () => {
  const slack = resolveMasslineCableProfile({ chord: 120, load: 0, taut: false });
  const taut = resolveMasslineCableProfile({ chord: 120, load: 1, taut: true });

  assert.ok(taut.collarLipHalfWidth < slack.collarLipHalfWidth,
    'a worked ferrule undercuts its lips into a hard edge');
  assert.ok(taut.collarCrownHalfWidth > slack.collarCrownHalfWidth,
    'and stands its crown proud of the rope');
  assert.ok(taut.collarCrownFraction > slack.collarCrownFraction,
    'slack is a soft dome; loaded is a hard-shouldered ring');
  assert.ok(taut.collarHalfLength > slack.collarHalfLength,
    'the accepted lengthening-with-load relation survives');
  assert.ok(taut.collarCrownHalfWidth > taut.coreHalfWidth,
    'hardware must be visible against the rope it grips');

  // Ferrule length is keyed off the chord against a fixed reference, NEVER off the live span
  // count — otherwise adaptive tessellation would silently resize the hardware every frame.
  const coarse = resolveMasslineCableProfile({ chord: 120, load: 0.5 });
  const fine = resolveMasslineCableProfile({
    chord: 120, load: 0.5, bowMagnitude: 40, shiverAmplitude: 0.5, shiverCycles: 7.5,
  });
  assert.ok(fine.segments > coarse.segments, 'precondition: these tessellate differently');
  assert.equal(coarse.collarHalfLength, fine.collarHalfLength);
});

test('a parting line lets go of its hardware; a clean release does not', () => {
  // The two events must stay distinct WITHOUT touching either one's timing and without adding a
  // single particle — the clean release is acceptance-pinned particle-silent, and the continuing
  // motion of the released body is where its energy goes.
  const base = { chord: 96, load: 0.9, taut: true, collarCount: MASSLINE_CABLE_COLLAR_COUNT };
  const gripped = resolveMasslineCableProfile({ ...base, whip: 0.9 });
  const parting = resolveMasslineCableProfile({ ...base, whip: 0.9, parting: true });
  const cleanRelease = resolveMasslineCableProfile({ ...base, whip: 0 });

  assert.ok(parting.collarLipHalfWidth > gripped.collarLipHalfWidth * 2,
    'a parting ring opens its lips back out: it is not clamped on anything any more');
  assert.ok(parting.collarCrownFraction < gripped.collarCrownFraction * 0.5,
    'and its hard shoulder softens');
  assert.equal(parting.collarHalfLength, gripped.collarHalfLength,
    'hardware does not change size when a rope breaks');

  // A clean release carries no whip envelope, so its ferrules are simply the loaded ones, holding
  // their shape as the line fades. Nothing about the break grammar leaks into it.
  assert.equal(cleanRelease.collarLipHalfWidth,
    resolveMasslineCableProfile({ ...base, whip: 0, parting: true }).collarLipHalfWidth,
    'with no recoil envelope there is nothing to let go of, break flag or not');
  assert.ok(cleanRelease.collarCrownFraction > parting.collarCrownFraction,
    'a clean release keeps the ring the loaded line had');
});

test('ferrules never merge into one tube, at any chord the line can have', () => {
  // The hard case at the supported 60-degree gameplay camera is not an edge-on ribbon — a flat XZ
  // ribbon is never edge-on there — it is a cable running along the screen axis, whose LENGTH
  // foreshortens by about half. Rings that only look closer together still read as rings; rings
  // that actually touch read as a tube. So the pitch cap has to hold at every chord.
  for (const chord of [12, 15, 24, 40, 96, 150, 400, 900]) {
    for (const load of [0, 0.5, 1]) {
      const profile = resolveMasslineCableProfile({
        chord, load, taut: load > 0.5, collarCount: MASSLINE_CABLE_COLLAR_COUNT,
      });
      const clearance = profile.collarPitch - profile.collarHalfLength * 2;
      assert.ok(clearance > 0,
        `chord ${chord} load ${load}: ferrules touch (pitch ${profile.collarPitch})`);
      // Even halved by foreshortening there is still a gap.
      assert.ok(clearance * 0.5 > 0, 'clearance survives a two-to-one foreshortening');
    }
  }
});

test('ferrules are spaced along the rope, so slack visibly puts more rope between the anchors', () => {
  const line = createMasslineCenterline();
  const collars = createMasslineCollarSurface();
  const profile = resolveMasslineCableProfile({ chord: 103, load: 0.2, bowMagnitude: 20 });
  writeMasslineCenterline(line, curveFrame({ segments: profile.segments, slackBow: 20 }));
  writeMasslineCollarSurface(collars, line, profile, 1.55);

  const crowns = [];
  for (let collar = 0; collar < MASSLINE_CABLE_COLLAR_COUNT; collar += 1) {
    // Row 1 col 1: the leading crown's centre station.
    const index = collar * COLLAR_ROWS * COLLAR_COLS + COLLAR_COLS + 1;
    crowns.push({ x: collars.positions[index * 3], z: collars.positions[index * 3 + 2] });
  }

  // Arc-uniform spacing: consecutive crowns are equally far apart ALONG the curve. Chord-parameter
  // spacing would crowd them toward the ends of a deeply bowed line.
  const gaps = [];
  for (let i = 1; i < crowns.length; i += 1) {
    gaps.push(Math.hypot(crowns[i].x - crowns[i - 1].x, crowns[i].z - crowns[i - 1].z));
  }
  const mean = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
  for (const gap of gaps) {
    assert.ok(Math.abs(gap - mean) / mean < 0.06,
      `ferrule spacing is uneven along the rope (${gap} vs ${mean})`);
  }

  // A sagging line has more rope between the same two anchors, so the same ten rings sit further
  // apart; pulling it straight draws them together. That is a tension read made of position alone.
  const straight = createMasslineCollarSurface();
  writeMasslineCenterline(line, curveFrame({ segments: profile.segments, slackBow: 0 }));
  writeMasslineCollarSurface(straight, line, profile, 1.55);
  const a = COLLAR_COLS + 1;
  const b = COLLAR_ROWS * COLLAR_COLS + COLLAR_COLS + 1;
  const straightGap = Math.hypot(
    straight.positions[b * 3] - straight.positions[a * 3],
    straight.positions[b * 3 + 2] - straight.positions[a * 3 + 2],
  );
  assert.ok(mean > straightGap * 1.02,
    'slack must visibly put more rope between the anchors than a straightened line does');
});

/* -------------------------------------------------------------------------- */
/* Snarl strands                                                               */
/* -------------------------------------------------------------------------- */

function snarl(restLength, { links = 1, radius = [6, 9], motionReduce = true } = {}) {
  const scene = new THREE.Scene();
  const fx = new TetherWebFx(scene, (x, z, out) => { out.x = x; out.z = z; });
  const byId = {};
  for (let k = 0; k < links; k += 1) {
    byId[`w${k}`] = {
      defId: WEB_DEF_ID, state: 'active', ownerId: 2, targetId: 3, restLength, createdTick: 0,
    };
  }
  fx.update({
    simTime: 100,
    settings: { video: { motionReduce } },
    entities: new Map([
      [2, { alive: true, pos: { x: 0, z: 0 }, radius: radius[0] }],
      [3, { alive: true, pos: { x: 80, z: 20 }, radius: radius[1] }],
    ]),
    combat: { attachments: { byId } },
  });
  return fx;
}

function strandColumn(fx, instance, column) {
  const m = fx.mesh.instanceMatrix.array;
  return new THREE.Vector3(
    m[instance * 16 + column * 4],
    m[instance * 16 + column * 4 + 1],
    m[instance * 16 + column * 4 + 2],
  ).normalize();
}

/** Worst per-joint roll of the cross-section about the strand, after parallel transport. */
function worstTwistDeg(fx, segments = 10) {
  let worst = 0;
  for (let i = 1; i < segments; i += 1) {
    const axisPrev = strandColumn(fx, i - 1, 1);
    const axis = strandColumn(fx, i, 1);
    const carried = strandColumn(fx, i - 1, 0)
      .applyQuaternion(new THREE.Quaternion().setFromUnitVectors(axisPrev, axis))
      .normalize();
    const here = strandColumn(fx, i, 0);
    const cross = new THREE.Vector3().crossVectors(carried, here);
    worst = Math.max(worst, Math.abs(Math.atan2(cross.dot(axis), carried.dot(here))));
  }
  return worst * 180 / Math.PI;
}

test('the Snarl cross-section does not twist between neighbouring segments', (t) => {
  for (const restLength of [200, 95, 60]) {
    const fx = snarl(restLength);
    t.after(() => fx.dispose());
    // One facet of the five-sided strand spans 72 degrees. The previous frame (minimal arc from
    // world-up to each segment's own axis) rolled up to 27 degrees per joint on a braided strand —
    // over a third of a facet — and the facets visibly crawled along the cable.
    assert.ok(worstTwistDeg(fx) < 6,
      `rest ${restLength}: cross-section rolled ${worstTwistDeg(fx)} deg per joint`);
  }
});

test('Snarl lay collapses under tension and keeps its turn count', () => {
  const loose = resolveMasslineWebStrandProfile({ slack: 12, maxSlack: 12 });
  const pulled = resolveMasslineWebStrandProfile({ slack: 0, maxSlack: 12 });
  assert.equal(loose.braidTurns, pulled.braidTurns,
    'a rope does not re-braid itself when you pull it');
  assert.ok(pulled.braidAmplitude < loose.braidAmplitude * 0.5,
    'the strands collapse toward one taut line');
  assert.ok(pulled.liftAmplitude < loose.liftAmplitude);
  assert.ok(pulled.braidAmplitude > 0, 'a taut rope is still laid, not a single wire');

  // Monotone, and clamped at both ends of the envelope.
  let previous = -1;
  for (let slack = 0; slack <= 24; slack += 2) {
    const lay = resolveMasslineWebStrandProfile({ slack, maxSlack: 12 });
    assert.ok(lay.braidAmplitude >= previous);
    assert.ok(lay.slackNorm >= 0 && lay.slackNorm <= 1);
    previous = lay.braidAmplitude;
  }
});

test('Snarl strands bite hull surfaces and the batch stays inside its buffer', (t) => {
  const seated = snarl(200, { radius: [6, 9] });
  t.after(() => seated.dispose());
  const centred = snarl(200, { radius: [0, 0] });
  t.after(() => centred.dispose());
  const m = seated.mesh.instanceMatrix.array;
  const c = centred.mesh.instanceMatrix.array;
  // The first segment's midpoint must have moved out of the owner hull and along the link.
  const seatedStart = Math.hypot(m[12], m[14]);
  const centredStart = Math.hypot(c[12], c[14]);
  assert.ok(seatedStart > centredStart + 3,
    'a strand that ends at a hull centre is drawn inside the body it is gripping');

  const flooded = snarl(100, { links: WEB_LIMITS.activeLinks + 5 });
  t.after(() => flooded.dispose());
  const cap = WEB_LIMITS.activeLinks * 20;
  assert.ok(flooded.mesh.count <= cap, 'more links than the batch holds cannot overrun it');
  assert.equal(flooded.mesh.count % 20, 0, 'a link is written whole or not at all');
  assert.equal(flooded.mesh.count, cap);
  assert.equal(flooded.mesh.instanceMatrix.array.length / 16, cap);
});

/* -------------------------------------------------------------------------- */
/* Release annulus silhouette                                                  */
/* -------------------------------------------------------------------------- */

function arcInput(overrides = {}) {
  return {
    active: true,
    releaseTarget: { kind: 'entity', source: 'selection', targetId: 77, pos: null, radius: 0 },
    liveTarget: { id: 77, alive: true, pos: { x: 840, z: -315 }, radius: 19 },
    predictor: {
      valid: true, onSolution: false, errorRad: 0.08, tolRad: 0.02,
      timeToSolution: 0.32, predicted: { x: 842, z: -314 },
    },
    classification: null,
    radiusPadding: 4, y: 1.5, timeS: 2,
    reducedMotion: false, reducedFlash: false,
    startAngle: 0, spanRad: Math.PI * 2,
    ...overrides,
  };
}

test('release marks carry the rating in their own silhouette', () => {
  const scratch = createMasslineReleaseArcScratch();
  const tapers = MASSLINE_RELEASE_QUALITIES.map((quality) => {
    const plan = resolveMasslineReleaseArcPlan(scratch.plan, arcInput({ classification: quality }));
    return plan.dashTaper;
  });
  assert.ok(tapers.every((value, index) => index === 0 || value > tapers[index - 1]),
    'blunt stubs for a messy release, needles for a razor one');
  assert.ok(tapers[0] < 0.2 && tapers[3] > 0.6, 'the ladder actually spans a visible range');

  // The window closing is a shape event while you are still approaching it.
  const far = resolveMasslineReleaseArcPlan(scratch.plan, arcInput({
    predictor: { valid: true, onSolution: false, errorRad: 0.11, tolRad: 0.02, timeToSolution: 1, predicted: { x: 842, z: -314 } },
  })).dashTaper;
  const near = resolveMasslineReleaseArcPlan(scratch.plan, arcInput({
    predictor: { valid: true, onSolution: true, errorRad: 0.01, tolRad: 0.02, timeToSolution: 0.05, predicted: { x: 842, z: -314 } },
  })).dashTaper;
  assert.ok(near > far, 'the marks sharpen as the solution comes in');
});

test('tapered marks stay inside the planned annulus and never leave its plane', () => {
  const scratch = createMasslineReleaseArcScratch();
  for (const classification of [null, ...MASSLINE_RELEASE_QUALITIES]) {
    const plan = resolveMasslineReleaseArcPlan(scratch.plan, arcInput({ classification }));
    const geometry = writeMasslineReleaseArcGeometry(scratch.geometry, plan);
    assert.ok(geometry.segmentCount > 0);
    for (let vertex = 0; vertex < geometry.vertexCount; vertex += 1) {
      const offset = vertex * 3;
      const radial = Math.hypot(
        geometry.positions[offset] - plan.centerX,
        geometry.positions[offset + 2] - plan.centerZ,
      );
      assert.ok(radial >= plan.innerRadius - 1e-4 && radial <= plan.outerRadius + 1e-4,
        `${classification}: vertex ${vertex} left the band`);
      assert.equal(geometry.positions[offset + 1], plan.y);
    }
    // Each mark cools toward its tip, so one mark has a direction in a still frame.
    if (plan.dashTaper > 0.05) {
      const root = scratch.geometry.colors[0] + scratch.geometry.colors[1] + scratch.geometry.colors[2];
      const tip = scratch.geometry.colors[6] + scratch.geometry.colors[7] + scratch.geometry.colors[8];
      assert.ok(tip < root, `${classification}: the tooth tip must fall away from its root`);
    }
  }
});

test('multi-lane rings interlock instead of stacking, and the stagger has no clock in it', () => {
  const scratch = createMasslineReleaseArcScratch();
  const plan = resolveMasslineReleaseArcPlan(scratch.plan, arcInput({ classification: 'razor' }));
  assert.equal(plan.laneCount, 3, 'precondition: razor draws three lanes');
  const geometry = writeMasslineReleaseArcGeometry(scratch.geometry, plan);
  const perLane = geometry.segmentCount / plan.laneCount;

  const laneAngles = [];
  for (let lane = 0; lane < plan.laneCount; lane += 1) {
    const vertex = lane * perLane * 4;
    laneAngles.push(Math.atan2(
      geometry.positions[vertex * 3 + 2] - plan.centerZ,
      geometry.positions[vertex * 3] - plan.centerX,
    ));
  }
  assert.equal(new Set(laneAngles.map((angle) => angle.toFixed(6))).size, plan.laneCount,
    'three lanes must not be three copies of one circle');

  // Frozen means frozen: a reduced-flash ring at two very different times is the same ring.
  const frozen = resolveMasslineReleaseArcPlan(scratch.plan,
    arcInput({ classification: 'razor', reducedFlash: true, timeS: 1 }));
  writeMasslineReleaseArcGeometry(scratch.geometry, frozen);
  const first = scratch.geometry.positions.slice(0, scratch.geometry.vertexCount * 3);
  resolveMasslineReleaseArcPlan(scratch.plan,
    arcInput({ classification: 'razor', reducedFlash: true, timeS: 987 }));
  writeMasslineReleaseArcGeometry(scratch.geometry, scratch.plan);
  assert.deepEqual(scratch.geometry.positions.slice(0, scratch.geometry.vertexCount * 3), first);
});
