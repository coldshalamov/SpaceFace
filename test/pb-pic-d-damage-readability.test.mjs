// PB-PIC-D (build_map §1C row 138) — SF-223 + SF-225, seam src/render/camera.js.
//
// SF-223 "A damaged ship that remains readable and aimable", camera-policy half: damage must read
// through the framing policy HONESTLY — hull damage alone never demotes an armed attacker (the
// threat stays framed while it looks endangered), a genuinely disarmed attacker demotes to passive
// context, a dead one drops out of composition entirely, and repair restores the active framing.
// (The decal/outline/art half of SF-223 belongs to the graphics-lane packets SF-211/213.)
//
// SF-225 "An authored-picture comparison that drives a real fix": the comparison found one causal
// defect in an ordinary-route composition — the scripted dock fly-in (pushZoom -0.45) multiplied
// PAST the active-attacker containment floor, cutting an edge-contained attacker out of the frame
// mid-approach. Measured before this row at 245 wu abeam: settled NDC 0.644 → 0.995 during the
// fly-in. The fix binds the containment floor over every tightening channel; with no attacker the
// floor is 0 and the fly-in is bit-identical to before (full tighten preserved).
//
// Fixed constants, no RNG (trauma stays 0), no GPU, no screenshots — sim-side numbers only.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createChaseCamera,
  playerHasActiveAttackerFraming,
  resolveChaseComposition,
} from '../src/render/camera.js';

// The chase camera constructor reads a viewport for aspect; the pure policy under test does not.
globalThis.window = { innerWidth: 1600, innerHeight: 1000 };

const DT = 1 / 60;
const FOV = 50;
const ASPECT = 16 / 9;
const TILT = 60;
const VIEW = { fov: FOV, baseFov: FOV, aspect: ASPECT, tiltDeg: TILT };

function ship(id, x, z, team, extras = {}) {
  return {
    id,
    type: 'ship',
    alive: extras.alive ?? true,
    hull: extras.hull ?? 100,
    team,
    pos: { x, z },
    vel: { x: 0, z: 0 },
    radius: extras.radius ?? 6,
    maxSpeed: 120,
    bank: 0,
    data: { combat: extras.combat ?? null },
  };
}

function stateWith(player, others = []) {
  return {
    playerId: player.id,
    entities: new Map([[player.id, player], ...others.map((o) => [o.id, o])]),
    player: {
      cruise: null,
      tether: { active: false, targetId: null },
      flybyFocus: { active: false, targetId: null },
    },
    settings: { video: { fov: FOV, motionReduce: false } },
    camera: { zoom: 144, tilt: TILT, lookAhead: 18, lerp: 6, trauma: 0 },
    input: { aimWorld: null },
    world: { frameOrigin: { x: 0, z: 0 }, frameOriginSeq: 0 },
    combat: { attachments: { byId: {} } },
  };
}

function bodyNdc(camera, focus, entity) {
  const zoom = Math.hypot(
    camera.position.x - focus.x,
    camera.position.y,
    camera.position.z - focus.z,
  );
  const tilt = TILT * Math.PI / 180;
  const tanHalf = Math.tan(FOV * Math.PI / 360);
  const dx = Math.abs(entity.pos.x - focus.x) + entity.radius;
  const dz = Math.abs(entity.pos.z - focus.z);
  const depth = Math.max(8, zoom - (Math.cos(tilt) * dz + entity.radius));
  return {
    zoom,
    ndc: Math.max(
      dx / (depth * tanHalf * ASPECT),
      (Math.sin(tilt) * dz + entity.radius) / (depth * tanHalf),
    ),
  };
}

// ── SF-223: the damage axis reads honestly through the framing policy ────────

test('SF-223: hull damage alone never demotes an armed attacker (endangered stays framed)', () => {
  const fresh = ship(2, 120, 15, 1, { combat: { targetId: 1, lockTarget: 1 } });
  const wounded = ship(2, 120, 15, 1, { hull: 12, combat: { targetId: 1, lockTarget: 1 } });
  const player = ship(1, 0, 0, 0, { radius: 7 });

  const freshState = stateWith(player, [fresh]);
  const woundedState = stateWith(player, [wounded]);

  const freshComp = resolveChaseComposition(freshState, player, { x: 0, z: 0 }, VIEW);
  const woundedComp = resolveChaseComposition(woundedState, player, { x: 0, z: 0 }, VIEW);

  assert.equal(woundedComp.hasActiveAttacker, true, 'a wounded armed attacker is still attacking');
  assert.equal(
    woundedComp.minZoom, freshComp.minZoom,
    `containment identical for hull 100 (${freshComp.minZoom.toFixed(2)}) and hull 12 (${woundedComp.minZoom.toFixed(2)}) — damage never buys a smaller threat`,
  );
  assert.equal(playerHasActiveAttackerFraming(woundedState, player), true);
});

test('SF-223: a genuinely disarmed attacker demotes to passive context, not invisible', () => {
  const player = ship(1, 0, 0, 0, { radius: 7 });
  const disabled = ship(2, 120, 15, 1, { combat: { targetId: 1, lockTarget: 1 } });
  const state = stateWith(player, [disabled]);
  // The combat kernel's own disarm channel: weapons capability false (heat/subsystem damage).
  state.combat.entities = { [disabled.id]: { capabilities: { weapon: false } } };

  const composed = resolveChaseComposition(state, player, { x: 0, z: 0 }, VIEW);
  assert.equal(composed.hasActiveAttacker, false, 'disarmed is not an active attacker');
  assert.equal(composed.hasThreatFocus, true, 'but it is still composed as visible context');
  assert.equal(composed.composedThreatId, disabled.id);
  assert.equal(playerHasActiveAttackerFraming(state, player), false);

  // Repair transition: clearing the disarm restores the active framing — no stale demotion.
  delete state.combat.entities;
  const repaired = resolveChaseComposition(state, player, { x: 0, z: 0 }, VIEW);
  assert.equal(repaired.hasActiveAttacker, true, 'repair returns the active containment');
  assert.equal(playerHasActiveAttackerFraming(state, player), true);
});

test('SF-223: a dead attacker drops out of composition entirely; no ghost framing', () => {
  const player = ship(1, 0, 0, 0, { radius: 7 });
  const wreck = ship(2, 120, 15, 1, { alive: false, hull: 0, combat: { targetId: 1, lockTarget: 1 } });
  const state = stateWith(player, [wreck]);

  const composed = resolveChaseComposition(state, player, { x: 0, z: 0 }, VIEW);
  assert.equal(composed.hasThreatFocus, false);
  assert.equal(composed.hasActiveAttacker, false);
  assert.equal(composed.nearbyEnemies, 0);
  assert.equal(composed.composedThreatId, null);
  assert.equal(composed.minZoom, 0);
  assert.equal(playerHasActiveAttackerFraming(state, player), false);
});

// ── SF-225: the scripted tighten must not spend the containment floor ────────

function flyInRun(abeamX, withAttacker = true) {
  const player = ship(1, 0, 0, 0, { radius: 7 });
  const attacker = ship(2, abeamX, 10, 1, { combat: withAttacker ? { targetId: 1, lockTarget: 1 } : null });
  const state = stateWith(player, withAttacker ? [attacker] : []);
  const camera = createChaseCamera(state);
  camera.snapToPlayer();
  for (let i = 0; i < 180; i++) camera.follow(DT); // containment settles
  const settled = withAttacker ? bodyNdc(camera.obj, state.camera.focus, attacker) : { ndc: 0, zoom: 0 };
  const settledDiag = camera.zoomDiagnostics();
  camera.pushZoom(-0.45, 1.2); // the dock fly-in uiRoot performs
  let worstNdc = 0;
  let tightestZoom = Infinity;
  for (let i = 0; i < 120; i++) {
    camera.follow(DT);
    if (withAttacker) {
      worstNdc = Math.max(worstNdc, bodyNdc(camera.obj, state.camera.focus, attacker).ndc);
    }
    tightestZoom = Math.min(tightestZoom, camera.zoomDiagnostics().dynamicZoom);
  }
  return { settled, settledFloor: settledDiag.contextMinZoom, worstNdc, tightestZoom };
}

test('SF-225: the dock fly-in under fire holds the containment floor (the comparison defect)', () => {
  // Before the fix: settled NDC 0.644 → 0.995 during the fly-in at 245 wu abeam (measured).
  const near = flyInRun(200);
  assert.ok(
    near.worstNdc <= near.settled.ndc + 0.01,
    `fly-in must not frame the attacker worse than settled (worst ${near.worstNdc.toFixed(3)} vs settled ${near.settled.ndc.toFixed(3)})`,
  );
  assert.ok(
    near.tightestZoom >= Math.min(near.settledFloor, near.settled.zoom) - 1,
    `applied zoom never drops below the containment floor (tightest ${near.tightestZoom.toFixed(1)}, floor ${near.settledFloor.toFixed(1)})`,
  );

  const edge = flyInRun(245);
  assert.ok(
    edge.worstNdc <= 0.70,
    `at the containment edge the attacker stays in frame through the fly-in (worst ${edge.worstNdc.toFixed(3)}; pre-fix measured 0.995)`,
  );
});

test('SF-225: the kill kiss also respects the containment floor', () => {
  const player = ship(1, 0, 0, 0, { radius: 7 });
  const attacker = ship(2, 200, 10, 1, { combat: { targetId: 1, lockTarget: 1 } });
  const state = stateWith(player, [attacker]);
  const camera = createChaseCamera(state);
  camera.snapToPlayer();
  for (let i = 0; i < 180; i++) camera.follow(DT);
  const floor = camera.zoomDiagnostics().contextMinZoom;
  const zoomAtKiss = camera.zoomDiagnostics().dynamicZoom;
  camera.pushZoom(-0.04, 0.25); // killCam: a 4% tighten must not cut the NEXT threat
  let tightest = Infinity;
  for (let i = 0; i < 40; i++) {
    camera.follow(DT);
    tightest = Math.min(tightest, camera.zoomDiagnostics().dynamicZoom);
  }
  assert.ok(
    tightest >= zoomAtKiss - 1,
    `the kiss never tightens an actively contained frame (tightest ${tightest.toFixed(1)}, at kiss ${zoomAtKiss.toFixed(1)}; an unfloored kiss would take ~4% off)`,
  );
  assert.ok(
    tightest >= Math.min(floor, zoomAtKiss) - 4,
    `and stays at the containment floor the damped zoom had already reached (floor ${floor.toFixed(1)})`,
  );
});

test('SF-225: with no attacker the dock fly-in still fully tightens (no quality lost)', () => {
  const quiet = flyInRun(0, false);
  assert.ok(
    quiet.tightestZoom < 0.72 * 144,
    `scripted tighten reaches its authored depth when containment is not in play (tightest ${quiet.tightestZoom.toFixed(1)})`,
  );
  assert.equal(quiet.settledFloor, 0, 'no attacker, no floor');
});
