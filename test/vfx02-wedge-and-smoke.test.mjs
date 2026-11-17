// VFX-02 — the committed FLYBY lane is a light shaft, and lingering kill smoke may not bury a
// protected hull.
//
// Two defects this guards, both seen in the ACCEPT-06 captures:
//
//   1. `r10-1-mid1.png`: a translucent gold triangle spread over ~70% of the viewport, starting at
//      the `FLYBY · Break the beam` marker. The owner is the committed-lane primitive
//      (`ActionPrimitiveComposer.renderCommittedLane` -> `_piece(7, ...)`), whose fragment branch
//      painted a filled trapezoid at the shared event coverage cap. The corridor's TRUE angular
//      width is the telegraph's contract and must not shrink; its FILL must.
//   2. `r5-2-mid2.png`: opaque white faceted billows parked over the Iron Maw. Their size is a
//      multiple of the death's fireball, their opacity is low and dissolving, and a billow whose
//      disc overlaps the player or a champion hull cannot keep its authored opacity.
//
// Deliberately NOT asserted: any pixel. The GPU picture belongs to the frozen-frame captures; these
// are the profile and pool contracts those captures rest on.

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ActionVfx } from '../src/render/actionVfx.js';
import {
  ACTION_PRIMITIVES, LANE_SHAFT_SHOULDER_WIDTH, LANE_SHAFT_SPINE_WIDTH, committedLaneShaftProfile,
} from '../src/render/vfx/actionPrimitives.js';
import {
  RESIDUE_SMOKE_COLOUR, RESIDUE_SMOKE_END_OPACITY, RESIDUE_SMOKE_LIFE_S,
  RESIDUE_SMOKE_PEAK_OPACITY,
} from '../src/render/vfx/explosionPresentationVfx.js';
import { vfx } from '../src/render/vfx.js';

// ---------------------------------------------------------------------------------------------
// 1. The committed lane
// ---------------------------------------------------------------------------------------------

test('the committed lane keeps its true angular footprint and paints a shaft inside it', () => {
  // The shader branch is the picture; this pins the numbers it reads.
  assert.equal(ACTION_PRIMITIVES.capture, 6, 'the lane rides the capture primitive id');

  // Across the corridor: almost nothing survives past the shoulder. A filled trapezoid would be
  // near-flat across its whole width — that is exactly what covered 70% of the viewport.
  const nearEdge = committedLaneShaftProfile(0.08, 1.0);
  const midShoulder = committedLaneShaftProfile(0.08, LANE_SHAFT_SHOULDER_WIDTH * 1.8);
  const onSpine = committedLaneShaftProfile(0.08, 0);
  assert.ok(onSpine.body > nearEdge.body * 8,
    `the spine must dominate the corridor edge (${onSpine.body} vs ${nearEdge.body})`);
  assert.ok(midShoulder.body < onSpine.body * 0.35,
    `the shoulder must die before the corridor edge (${midShoulder.body} vs ${onSpine.body})`);
  assert.ok(nearEdge.body < onSpine.body * 0.02,
    `the corridor edge carries almost no fill (${nearEdge.body} vs ${onSpine.body})`);
  assert.ok(LANE_SHAFT_SPINE_WIDTH < LANE_SHAFT_SHOULDER_WIDTH);

  // Along the corridor: it thins with distance instead of holding one flat slab.
  const near = committedLaneShaftProfile(0.10, 0);
  const far = committedLaneShaftProfile(0.90, 0);
  assert.ok(far.body < near.body * 0.25, `reach must fade: ${near.body} -> ${far.body}`);
  assert.ok(far.hot < near.hot * 0.5, `the far end must be dimmer: ${near.hot} -> ${far.hot}`);

  // Monotone in both axes, so no band or hotspot can appear mid-corridor.
  let previousBody = Infinity;
  for (let i = 0; i <= 20; i++) {
    const p = committedLaneShaftProfile(i / 20, 0);
    assert.ok(p.body <= previousBody + 1e-9, 'body must fall monotonically along the shaft');
    previousBody = p.body;
  }
  let previousAcross = Infinity;
  for (let i = 0; i <= 20; i++) {
    const p = committedLaneShaftProfile(0.3, i / 20);
    assert.ok(p.body <= previousAcross + 1e-9, 'body must fall monotonically across the shaft');
    previousAcross = p.body;
  }
});

test('the committed lane still writes the announced angular cap, so the telegraph cannot lie', () => {
  // Mirrors test/ai-committed-lane-vfx.test.mjs, which is the footprint contract. This test exists
  // so a future "make the wedge thinner" change to the GEOMETRY is caught here: the fill is what
  // shrinks, never the corridor the simulation promised the player.
  const attacker = {
    id: 2, occupantGeneration: 7, type: 'ship', alive: true,
    pos: { x: 20, z: 30 }, vel: { x: 0, z: 0 }, rot: 1, radius: 10, data: {},
  };
  const player = {
    id: 1, occupantGeneration: 3, type: 'ship', alive: true,
    pos: { x: 250, z: 30 }, vel: { x: 0, z: 0 }, rot: 0, radius: 8, data: {},
  };
  const state = {
    tick: 60, simTime: 1, playerId: 1,
    entities: new Map([[1, player], [2, attacker]]), settings: { video: {} },
  };
  const cue = {
    entityId: 2, sourceGeneration: 7, targetId: 1, targetGeneration: 3,
    doctrineId: 'interceptor_flyby', phase: 'engine_flare', kind: 'engine_flare',
    tick: 60, durationTicks: 30,
    attackLine: {
      origin: { x: 20, z: 30 }, heading: 0.25,
      dir: { x: Math.cos(0.25), z: Math.sin(0.25) }, range: 900, halfWidth: 32,
    },
    aimCommit: { bearing: 0.25, capRad: 0.2, untilTick: 330 },
  };
  const out = new ActionVfx(new THREE.Scene());
  try {
    assert.equal(out.emit('ai:telegraph', cue, state), true);
    state.tick = 66; state.simTime = 1.1; out.update(state);
    const kindAttr = out.batch.attributes[1];
    let lane = -1;
    for (let i = 0; i < out.batch.count; i++) if (kindAttr.getX(i) === 7) lane = i;
    assert.ok(lane >= 0, 'the pooled geometry contains a committed lane');
    const shape = out.batch.attributes[2];
    assert.ok(Math.abs(shape.getX(lane) - 900 * Math.tan(0.2)) < 1e-3,
      'the corridor still reaches both permitted angular edges at its full range');
  } finally {
    out.dispose();
  }
});

// ---------------------------------------------------------------------------------------------
// 2. The lingering kill smoke
// ---------------------------------------------------------------------------------------------

test('kill smoke is dark, low, and it dissolves', () => {
  assert.ok(RESIDUE_SMOKE_PEAK_OPACITY <= 0.35, 'smoke is low opacity, never a white cloud');
  assert.ok(RESIDUE_SMOKE_END_OPACITY < RESIDUE_SMOKE_PEAK_OPACITY / 4,
    'the billow must dissolve over its life rather than fade out at a flat grey');
  assert.ok(RESIDUE_SMOKE_LIFE_S >= 2.5 && RESIDUE_SMOKE_LIFE_S <= 5,
    'LOOK-05C authored a ~2-3 billow smoke that lingers 4-5 s');

  // Colour: dark-to-mid grey. Parsed rather than string-compared so a retint stays legal while a
  // saturated hue (a white cloud, a green puff) does not.
  const hex = RESIDUE_SMOKE_COLOUR.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  assert.ok(max <= 0x66, `smoke must be dark-to-mid grey, not ${RESIDUE_SMOKE_COLOUR}`);
  assert.ok(max - min <= 0x12, `smoke must be near-neutral, not ${RESIDUE_SMOKE_COLOUR}`);
});

test('a billow over the player or a champion hull cannot keep its authored opacity', () => {
  const owner = Object.create(vfx);
  const player = { id: 1, alive: true, type: 'ship', radius: 10, pos: { x: 0, z: 0 }, data: {} };
  const champion = {
    id: 9, alive: true, type: 'ship', radius: 40, pos: { x: 400, z: 0 }, data: { swarmChampion: true },
  };
  const chaff = { id: 12, alive: true, type: 'ship', radius: 10, pos: { x: 0, z: 900 }, data: {} };
  const entities = new Map([[1, player], [9, champion], [12, chaff]]);
  owner.state = { playerId: 1, entities, entityList: [player, champion, chaff] };

  // Open space: the authored opacity survives untouched.
  assert.equal(owner._smokeOpacityCapNear(0, 2000, 40), 1);

  // Directly on the player: capped to the floor.
  const onPlayer = owner._smokeOpacityCapNear(0, 0, 40);
  assert.ok(onPlayer > 0 && onPlayer <= 0.2, `a billow on the player reads ${onPlayer}`);

  // Over the champion: same floor, measured against ITS radius (a dreadnought is wide).
  const onChampion = owner._smokeOpacityCapNear(400, 0, 40);
  assert.ok(onChampion > 0 && onChampion <= 0.2, `a billow on the champion reads ${onChampion}`);
  assert.ok(owner._smokeOpacityCapNear(400 + 90, 0, 40) > onChampion,
    'the cap lifts as the billow clears the champion hull');

  // A non-champion hull does not earn the cap: smoke over chaff is ordinary smoke.
  owner._smokeProtectedFrame = false;
  assert.equal(owner._smokeOpacityCapNear(0, 900, 40), 1,
    'only the player and champion hulls are protected');

  // A dead champion stops protecting anything (the census is rebuilt once per smoke pass, so the
  // test opens a new pass the same way the writer does).
  champion.alive = false;
  owner._smokeProtectedFrame = false;
  assert.equal(owner._smokeOpacityCapNear(400, 0, 40), 1);
});
