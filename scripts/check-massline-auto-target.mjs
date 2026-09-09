// Massline auto-target acceptance check: the gunnery rules for "orbit a tethered enemy and hit it".
//
// HISTORY. This file used to be the contract for `pickMasslineAutoTarget()` in
// src/combat/autoTargetMode.js — a massline-aware picker that ranked SWING anchors and wrote the
// winner to `state.player.targetId`. It was exported, tested here, and called from nowhere in src/.
// It was also the wrong shape: it wrote the GUN variable with a LATCH decision, and scored
// acquisition is now owned by the tether itself (tetherGameplay's acquisition receipt). It has been
// deleted rather than left in limbo, and this check now covers the thing that was actually broken:
// with a line on a hostile, the guns, the missile lock, the reticle lead and the target panel must
// all describe the same ship, and the lead must be solved on the ARC the target is actually flying.
//
// These are BEHAVIOURAL assertions — they drive the real modules against real state and assert an
// outcome. No source-string scanning.
//
// Contract:
//   1. A line on a hostile ship claims the guns even when the player's selection is a nearer ship.
//   2. A line on an ASTEROID does not claim the guns — you must be able to shoot the thing you are
//      about to swing a rock into.
//   3. The constrained (circular) solver runs on a TIGHT ORBIT, which is slack by rope phase. This
//      is the regression that made the signature Massline move miss, always to the outside.
//   4. A straight tow (radial motion) falls back to a linear lead but STILL keeps the guns on the
//      tethered hostile.
//   5. Mixed batteries get per-mount solutions: a slow and a fast projectile do not share one angle.
//   6. The reticle lead pip agrees with the fire path (same solver, same target).
//   7. uiRoot's nearest-hostile scan prefers the tethered hostile when it is the one choosing, and
//      does not stomp an explicit pick on a quiet refresh.
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import {
  resolvePlayerGunTarget, tetheredGunTarget, computeLockedLeadPoint,
} from '../src/combat/autoTargetMode.js';
import {
  orbitalConstraintState, solveTetherLeadSolution, tetherPairKinematics, aimTrueProjectileVelocity,
} from '../src/combat/tetherFireControl.js';
import { weapons } from '../src/systems/weapons.js';
import { targetNearestHostileToPlayer } from '../src/ui/uiRoot.js';
import { applyFeatureConfigToMaps, PRODUCTION_FEATURES } from '../src/data/featureFlags.js';
import { hash32, mulberry32 } from '../src/core/rng.js';

// The gun-ownership rule is part of massline2 fire control; seed the production feature maps so the
// flag reads the way it does in a real session.
applyFeatureConfigToMaps(PRODUCTION_FEATURES);

const PLAYER_ID = 8;

assertTetheredHostileClaimsTheGuns();
assertTetheredAsteroidDoesNotClaimTheGuns();
assertTightOrbitUsesTheConstrainedSolver();
assertStraightTowKeepsTheGunsButGoesLinear();
assertMixedBatterySolvesPerMount();
assertLiveMixedBatteryFiresOnDistinctHeadings();
assertReticleLeadMatchesTheFirePath();
assertNearestHostileScanPrefersTheTetheredHostile();
assertQuietRefreshDoesNotStompAnExplicitPick();

console.log('Massline auto-target wire checks OK');

// 1. Selection says "the nearer ship"; the line says "this one". The line wins.
function assertTetheredHostileClaimsTheGuns() {
  const h = createHarness();
  const near = makeShip(100, { x: 60, z: 0 }, { x: 0, z: 0 });
  const held = makeShip(200, { x: 0, z: 140 }, { x: 90, z: 0 });
  h.add(near, held);
  h.state.player.targetId = near.id;          // player selection / old nearest-hostile scan
  h.latch(held.id);

  assert.equal(tetheredGunTarget(h.state)?.id, 200, 'the tethered hostile must be the gun target');
  assert.equal(resolvePlayerGunTarget(h.state).id, 200,
    'resolvePlayerGunTarget must prefer the tethered hostile over the selection');
  assert.equal(h.state.player.targetId, 100,
    'the resolver must NOT overwrite the selection — it also aims massline throws');

  const gate = h.fireSolution();
  assert.ok(gate, 'a line on a hostile must produce a fire-control gate');
  assert.equal(gate.targetId, 200, 'the fire gate must be on the tethered hostile');
}

// 2. A rock on the line leaves the guns free.
function assertTetheredAsteroidDoesNotClaimTheGuns() {
  const h = createHarness();
  const rock = makeAsteroid(300, { x: 0, z: 140 }, { x: 90, z: 0 });
  const enemy = makeShip(100, { x: 200, z: 0 }, { x: 0, z: 0 });
  h.add(rock, enemy);
  h.state.player.targetId = enemy.id;
  h.latch(rock.id);

  assert.equal(tetheredGunTarget(h.state), null, 'an asteroid on the line must not claim the guns');
  assert.equal(resolvePlayerGunTarget(h.state).id, 100,
    'with a rock on the line the guns stay on the selection');
  assert.equal(h.fireSolution(), null, 'no fire gate for a non-ship anchor');
}

// 3. THE regression. A tight orbit is INSIDE rest length, so the rope reports `slack` — the old gate
// bailed on that and fired a straight lead at a body on a circle. Assert both that the constrained
// branch is taken and that it is the branch that actually hits.
function assertTightOrbitUsesTheConstrainedSolver() {
  const h = createHarness();
  const player = h.state.entities.get(PLAYER_ID);
  // 120wu apart, target sweeping tangentially at 96 wu/s => omega = 0.8 rad/s.
  const held = makeShip(200, { x: 120, z: 0 }, { x: 0, z: 96 });
  held.radius = 9;
  h.add(held);
  h.latch(held.id, { phase: 'slack', restLength: 200 });   // slack: distance 120 < restLength 200

  const orbit = orbitalConstraintState(player, held);
  assert.ok(orbit.constrained,
    `a tight orbit must read as constrained geometry (omega=${orbit.omega.toFixed(3)})`);

  const gate = h.fireSolution(320);
  assert.ok(gate, 'a slack-but-orbiting line must still produce a fire gate');
  assert.ok(gate.constrained,
    'the constrained solver must run on a slack tight orbit — this is the bug this check exists for');

  // The constrained solution must land inside the hull; the linear one must not.
  const kin = tetherPairKinematics(player, held);
  const missFor = (angle, time) => {
    const v = aimTrueProjectileVelocity(angle, 320, player.vel);
    const ang = kin.omega * time;
    const qx0 = held.pos.x - kin.comX, qz0 = held.pos.z - kin.comZ;
    const truthX = kin.comX + kin.comVx * time + (qx0 * Math.cos(ang) - qz0 * Math.sin(ang));
    const truthZ = kin.comZ + kin.comVz * time + (qx0 * Math.sin(ang) + qz0 * Math.cos(ang));
    return Math.hypot(player.pos.x + v.x * time - truthX, player.pos.z + v.z * time - truthZ);
  };
  const constrained = solveTetherLeadSolution(player, held, 320, { taut: true });
  const linear = solveTetherLeadSolution(player, held, 320, { taut: false });
  const constrainedMiss = missFor(constrained.angle, constrained.time);
  const linearMiss = missFor(linear.angle, linear.time);
  assert.ok(constrainedMiss <= held.radius,
    `constrained miss ${constrainedMiss.toFixed(2)} must be inside radius ${held.radius}`);
  assert.ok(linearMiss > constrainedMiss,
    `the linear lead must miss worse (${linearMiss.toFixed(2)} vs ${constrainedMiss.toFixed(2)})`);
}

// 4. Radial motion is not an orbit — go linear, but do not hand the guns back.
function assertStraightTowKeepsTheGunsButGoesLinear() {
  const h = createHarness();
  const player = h.state.entities.get(PLAYER_ID);
  const towed = makeShip(200, { x: 120, z: 0 }, { x: 70, z: 0 });   // pure radial separation
  h.add(towed);
  h.latch(towed.id, { phase: 'loaded', restLength: 100 });

  const orbit = orbitalConstraintState(player, towed);
  assert.equal(orbit.constrained, false, 'pure radial motion is not an arc');

  const gate = h.fireSolution(320);
  assert.ok(gate, 'a straight tow must STILL keep the guns on the tethered hostile');
  assert.equal(gate.constrained, false, 'a straight tow must use the linear lead');
  assert.equal(gate.targetId, 200);
}

// 5. Pulse 320 / autocannon 420 / railgun 700 cannot share one intercept angle.
function assertMixedBatterySolvesPerMount() {
  const h = createHarness();
  const held = makeShip(200, { x: 120, z: 0 }, { x: 0, z: 96 });
  h.add(held);
  h.latch(held.id, { phase: 'slack', restLength: 200 });

  const angles = [320, 420, 700].map((speed) => h.fireSolution(speed).angle);
  const spread = Math.max(...angles) - Math.min(...angles);
  assert.ok(spread > 0.01,
    `mixed-speed mounts need distinct lead angles; spread was ${spread.toFixed(4)} rad`);
  assert.ok(angles[0] > angles[1] && angles[1] > angles[2],
    'a slower round must lead further ahead of the target than a faster one');
}

// 5b. The same thing, end to end: run the real fire path for one tick with a pulse (320) and a
// railgun (700) on the same hull and assert the two rounds actually LEAVE on different headings.
// The unit assertion above proves the solver can tell them apart; this proves the fire path asks.
function assertLiveMixedBatteryFiresOnDistinctHeadings() {
  const h = createHarness();
  const player = h.state.entities.get(PLAYER_ID);
  const held = makeShip(200, { x: 120, z: 0 }, { x: 0, z: 96 });
  const decoy = makeShip(100, { x: 40, z: 0 }, { x: 0, z: 0 });
  h.add(held, decoy);
  h.state.player.targetId = decoy.id;
  h.latch(held.id, { phase: 'slack', restLength: 200 });
  player.data.weapons = [
    { defId: 'wpn_pulse_laser_s', slotIndex: 0, projSpeed: 320, facingAngle: 0, gimbalArc: Math.PI, muzzleOffset: [0.8, 0], dmg: 4, rof: 5.5, energyCost: 2, heat: 0, heatMax: 100 },
    { defId: 'wpn_railgun_m', slotIndex: 1, projSpeed: 700, facingAngle: 0, gimbalArc: Math.PI, muzzleOffset: [0.8, 0], dmg: 40, rof: 0.8, energyCost: 14, heat: 0, heatMax: 100 },
  ];
  player.cap = 200;
  h.state.input.fire = true;

  const fired = [];
  const bus = {
    on: () => {},
    emit: (name, payload) => { if (name === 'combat:fire') fired.push(payload); },
  };
  const system = Object.create(weapons);
  system.init({
    state: h.state,
    bus,
    helpers: {
      getEntity: (id) => h.state.entities.get(id),
      spawnEntity: () => ({}),
      hash32,
      mulberry32,
    },
    registry: { get: () => null },
  });
  system.update(1 / 60, h.state);

  // The HUD contract: the fire path publishes what it is ACTUALLY shooting at, so a target panel
  // reading state.player.targetId alone cannot silently describe a third ship.
  assert.equal(h.state.player.gunTargetId, 200,
    'gunTargetId must mirror the tethered hostile the guns took over');
  assert.equal(h.state.player.targetId, 100,
    'the selection is still the players own, untouched by the fire path');

  assert.equal(fired.length, 2, `both mounts must release a round; got ${fired.length}`);
  const byMount = new Map(fired.map((f) => [f.weaponId, f.dir]));
  const pulse = byMount.get('wpn_pulse_laser_s');
  const railgun = byMount.get('wpn_railgun_m');
  assert.ok(Number.isFinite(pulse) && Number.isFinite(railgun), 'both mounts must report a heading');
  // Pulse flight time is ~2x the railgun's, so it must lead visibly further around the arc.
  assert.ok(pulse - railgun > 0.05,
    `the slow mount must lead further than the fast one; delta was ${(pulse - railgun).toFixed(4)} rad`);
}

// 6. The pip must not draw a lead the guns will not honour.
function assertReticleLeadMatchesTheFirePath() {
  const h = createHarness();
  const player = h.state.entities.get(PLAYER_ID);
  const near = makeShip(100, { x: 60, z: 0 }, { x: 0, z: 0 });
  const held = makeShip(200, { x: 120, z: 0 }, { x: 0, z: 96 });
  h.add(near, held);
  h.state.player.targetId = near.id;
  h.latch(held.id, { phase: 'slack', restLength: 200 });
  // Primary mount speed drives the pip; give the player one so playerLeadSpeed is not the fallback.
  player.data.weapons = [{ defId: 'w_pulse', projSpeed: 320 }];

  const lead = computeLockedLeadPoint(h.state);
  assert.ok(lead, 'a lead point must exist while the guns are on the tethered hostile');
  const pipAngle = Math.atan2(lead.z - player.pos.z, lead.x - player.pos.x);
  const gate = h.fireSolution(320);
  assert.ok(Math.abs(pipAngle - gate.angle) < 1e-9,
    `the pip (${pipAngle.toFixed(6)}) must be the fire solution (${gate.angle.toFixed(6)})`);
}

// 7. When the scan is the one choosing, it chooses the ship on the line.
function assertNearestHostileScanPrefersTheTetheredHostile() {
  const h = createHarness();
  const near = makeShip(100, { x: 60, z: 0 }, { x: 0, z: 0 });
  const held = makeShip(200, { x: 0, z: 140 }, { x: 90, z: 0 });
  h.add(near, held);
  h.state.player.targetId = null;      // nothing picked — the scan decides
  h.latch(held.id);

  targetNearestHostileToPlayer(h.state, null, {});
  assert.equal(h.state.player.targetId, 200,
    'the scan must lock the tethered hostile, not the nearer ship');
}

function assertQuietRefreshDoesNotStompAnExplicitPick() {
  const h = createHarness();
  const near = makeShip(100, { x: 60, z: 0 }, { x: 0, z: 0 });
  const held = makeShip(200, { x: 0, z: 140 }, { x: 90, z: 0 });
  h.add(near, held);
  h.state.player.targetId = near.id;   // an explicit Tab/radar pick
  h.latch(held.id);

  targetNearestHostileToPlayer(h.state, null, { quiet: true });
  assert.equal(h.state.player.targetId, 100,
    'a quiet 0.12s refresh must preserve a valid explicit pick');
}

// ---- harness ----

function createHarness() {
  const state = createGameState(0x5a);
  state.mode = 'flight';
  state.tick = 100;
  state.playerId = PLAYER_ID;
  state.entities.clear();
  state.entityList = state.entityList || [];
  state.entityList.length = 0;

  const player = {
    id: PLAYER_ID, type: 'ship', alive: true, team: 0,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0, maxSpeed: 120, radius: 8, mass: 200,
    flags: {}, cap: 100,
    data: { weapons: [], combat: {}, derived: { cap: 100 } },
  };
  state.entities.set(PLAYER_ID, player);
  state.entityList.push(player);

  state.player.tether = { active: false, targetId: null, phase: 'slack', restLength: 0 };
  state.player.targetId = null;

  const harness = { state };
  harness.add = (...entities) => {
    for (const e of entities) {
      state.entities.set(e.id, e);
      state.entityList.push(e);
    }
  };
  harness.latch = (targetId, extra = {}) => {
    state.player.tether = {
      active: true, targetId, phase: 'slack', restLength: 0, strain: 0, ...extra,
    };
  };
  // Call the real fire-control path against a minimal host (the same shape check-massline2 uses).
  harness.fireSolution = (projSpeed = null) => weapons._tetherFireSolution.call(
    { helpers: { getEntity: (id) => state.entities.get(id) }, _playerProjectileSpeed: () => 360 },
    player, state, projSpeed,
  );
  return harness;
}

// scanner.isHostileToPlayer flags hostility via ai.huntPlayer / forcePlayerTarget / encounter.
function makeShip(id, pos, vel, { team = 1 } = {}) {
  return {
    id, type: 'ship', alive: true, team,
    pos: { ...pos }, vel: { ...vel }, rot: 0, angVel: 0, maxSpeed: 120, radius: 10, mass: 500,
    data: { combat: {}, ai: { huntPlayer: true } },
  };
}

function makeAsteroid(id, pos, vel) {
  return {
    id, type: 'asteroid', alive: true, team: 0,
    pos: { ...pos }, vel: { ...vel }, rot: 0, angVel: 0, radius: 11, mass: 640,
    data: {},
  };
}
