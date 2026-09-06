// PQ-137.11: the player is not ammunition. Solver-sourced contact on isPlayer hulls
// keeps heading, cannot reverse, and never spends more than 10% of cruise in one episode.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { physics } from '../src/core/physics.js';
import { queuePhysicsTorqueImpulse, writePhysicsControl } from '../src/core/physicsAuthority.js';
import {
  PLAYER_CONTACT_EVENT_BRIDGE_TICKS,
  PLAYER_CONTACT_MAX_CRUISE_FRACTION,
  createSg02DynamicBodyOwner,
} from '../src/core/sg02DynamicBodyOwner.js';
import { resolveGovernedCombatSpeed } from '../src/core/flight/propulsionCatalog.js';

const DT = 1 / 60;
const VISION = 'The owner\'s own ship is never knocked around';

test('player contact give: heading, budget, yaw, queued impulses, NPC, receipts, adapter', async () => {
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: DT });
  try {
    const player = makeCraft(1, { isPlayer: true, x: -48, z: 5, vx: 72 });
    const twin = makeCraft(2, { isPlayer: true, x: -48, z: 220, vx: 72 });
    const npc = makeCraft(3, { isPlayer: false, x: -48, z: -36, vx: 72 });
    const parked = makeCraft(4, { isPlayer: true, x: 180, z: 0, vx: 0, vz: 0 });
    const rammer = makeCraft(5, { isPlayer: false, x: 120, z: 0, vx: 80 });
    const farPlayer = makeCraft(6, { isPlayer: true, x: 0, z: 400, vx: 40 });
    const rockA = makeRock(10, { x: 0, z: 0 });
    const rockB = makeRock(11, { x: 0, z: -41 });
    const live = [player, twin, npc, parked, rammer, farPlayer, rockA, rockB];
    owner.syncFromEntities(live);

    const cruise = resolveGovernedCombatSpeed(player, null, player.combatSpeed || player.maxSpeed || 0);
    assert.ok(cruise > 0, `${VISION}: cruise must be a governed speed, got ${cruise}`);
    const episodeBudget = PLAYER_CONTACT_MAX_CRUISE_FRACTION * cruise;

    queuePhysicsTorqueImpulse(player, { x: 0, y: 28, z: 0 });
    queuePhysicsTorqueImpulse(twin, { x: 0, y: 28, z: 0 });
    const farSpeedBefore = Math.hypot(farPlayer.vel.x, farPlayer.vel.z);
    writePhysicsControl(farPlayer, {
      source: 'sg02-player-contact-give-test',
      mode: 'assisted',
      force: { x: 14400, y: 0, z: 0 },
      torque: { x: 0, y: 0, z: 0 },
      maxSpeed: 1000,
    });
    owner.step(DT);
    owner.drainContactImpacts();
    const farSpeedAfterImpulse = Math.hypot(farPlayer.vel.x, farPlayer.vel.z);

    let playerHit = false;
    let npcHit = false;
    let parkedHit = false;
    let lastPlayerContactTick = null;
    let episodeApplied = 0;
    const episodeSums = [];
    let quietTicks = 0;
    let placedSecondRock = false;
    let rammerSpeedAfterHit = 0;
    let npcSpeedAfterHit = 0;

    for (let i = 0; i < 520; i++) {
      const playerBefore = snapshot(player);
      owner.step(DT);
      const receipts = owner.drainContactImpacts();
      const playerReceipts = receipts.filter((r) => involves(r, player.id));
      if (playerReceipts.length) {
        playerHit = true;
        quietTicks = 0;
        const tick = playerReceipts[0].tick;
        const gap = lastPlayerContactTick == null ? 0 : tick - lastPlayerContactTick;
        if (lastPlayerContactTick == null || gap > PLAYER_CONTACT_EVENT_BRIDGE_TICKS) {
          if (episodeApplied > 0) episodeSums.push(episodeApplied);
          episodeApplied = 0;
        }
        lastPlayerContactTick = tick;
        const appliedSum = playerReceipts.reduce((n, r) => n + r.appliedPlayerDeltaV, 0);
        const reconstructed = playerReceipts.slice(0, -1).reduce((n, r) => n + r.appliedPlayerDeltaV, 0);
        if (playerReceipts.length > 1) {
          assert.equal(
            playerReceipts[playerReceipts.length - 1].appliedPlayerDeltaV,
            appliedSum - reconstructed,
            `${VISION}: the last receipt carries the floating-point residual so the tick sums exactly`,
          );
        }
        assert.ok(
          playerReceipts.every((r) => Number.isFinite(r.appliedPlayerDeltaV)),
          `${VISION}: every player receipt must carry finite appliedPlayerDeltaV`,
        );
        // "A controllable mass, not a cursor." — the owner receipts. The rule may keep the nose
        // and the course; it must SAY what the solver asked for, and it must report a retained
        // heading/course of exactly zero rather than leaving the question unmeasured.
        assert.ok(
          playerReceipts.every((r) => Number.isFinite(r.solverPlayerHeadingRad)
            && Number.isFinite(r.solverPlayerYawRateKick)
            && Number.isFinite(r.solverPlayerCourseRad)),
          `${VISION}: every player receipt carries what the solver tried to do to the nose and the course`,
        );
        assert.ok(
          playerReceipts.every((r) => r.appliedPlayerHeadingRad === 0 && r.appliedPlayerCourseRad === 0),
          `${VISION}: the retained contact heading and course change on the player are zero by construction`,
        );
        // Per-tick angles are stamped whole on every receipt of the tick, never divided.
        for (const r of playerReceipts) {
          assert.equal(
            r.solverPlayerHeadingRad, playerReceipts[0].solverPlayerHeadingRad,
            `${VISION}: a per-tick angle is stamped whole on every receipt of that tick, not split like delta-V`,
          );
        }
        assert.ok(Number.isFinite(playerReceipts[0].impulse), 'raw impulse must remain on the receipt');
        assert.ok(Number.isFinite(playerReceipts[0].preSolveClosingSpeed), 'raw closing speed must remain');
        assert.ok(playerReceipts[0].normal && Number.isFinite(playerReceipts[0].normal.x), 'raw normal remains');
        assert.ok(playerReceipts[0].pos && Number.isFinite(playerReceipts[0].pos.x), 'raw position remains');
        episodeApplied += Math.abs(appliedSum);
        assert.ok(
          episodeApplied <= episodeBudget + 1e-6,
          `${VISION}: one contact episode must not change the player by more than 10% of cruise (applied ${episodeApplied} vs budget ${episodeBudget})`,
        );

        const heading = planarHeading(playerBefore.vx, playerBefore.vz);
        const along = player.vel.x * heading.x + player.vel.z * heading.z;
        const perp = player.vel.x * heading.z - player.vel.z * heading.x;
        const expectedAlong = playerBefore.vx * heading.x + playerBefore.vz * heading.z;
        assert.ok(
          Math.abs(perp) <= Math.max(0.35, 0.02 * Math.hypot(player.vel.x, player.vel.z)),
          `${VISION}: contact response is along heading, not sideways (perp=${perp})`,
        );
        assert.ok(
          along >= -1e-3,
          `${VISION}: contact must not reverse the player's expected velocity (along=${along})`,
        );
        assert.ok(
          along <= expectedAlong + episodeBudget + 1e-3,
          `${VISION}: applied along-track change stays inside the episode budget`,
        );
      } else if (playerHit) {
        quietTicks += 1;
        if (!placedSecondRock && quietTicks > PLAYER_CONTACT_EVENT_BRIDGE_TICKS) {
          const heading = planarHeading(player.vel.x, player.vel.z);
          const speed = Math.max(48, Math.hypot(player.vel.x, player.vel.z));
          player.vel.x = heading.x * speed;
          player.vel.z = heading.z * speed;
          player.flags = { ...(player.flags || {}), noInterp: true };
          player.physicsBody.revision = (player.physicsBody.revision || 0) + 1;
          live.push(makeRock(99, {
            x: player.pos.x + heading.x * 46,
            z: player.pos.z + heading.z * 46,
          }));
          owner.syncFromEntities(live);
          placedSecondRock = true;
        }
      }
      if (receipts.some((r) => involves(r, npc.id))) {
        npcHit = true;
        npcSpeedAfterHit = Math.max(npcSpeedAfterHit, Math.hypot(npc.vel.x, npc.vel.z));
      }
      if (receipts.some((r) => involves(r, parked.id))) {
        parkedHit = true;
        rammerSpeedAfterHit = Math.max(rammerSpeedAfterHit, Math.hypot(rammer.vel.x, rammer.vel.z));
      }

      if (playerHit && playerReceipts.length) {
        assert.ok(
          Math.abs(player.rot - twin.rot) < 0.04,
          `${VISION}: player yaw stays on the no-contact baseline (player=${player.rot} twin=${twin.rot})`,
        );
        assert.ok(
          Math.abs(player.angVel - twin.angVel) < 0.05,
          `${VISION}: player spin stays on the authored/commanded baseline (player=${player.angVel} twin=${twin.angVel})`,
        );
      }
    }
    if (episodeApplied > 0) episodeSums.push(episodeApplied);

    assert.equal(playerHit, true, 'the protected player must actually strike rock');
    assert.equal(npcHit, true, 'the NPC must actually strike rock');
    assert.equal(parkedHit, true, 'the parked player must take a ram so the launch clause is measured');
    assert.ok(placedSecondRock, 'a second rock must be placed after >6 quiet ticks');
    assert.ok(episodeSums.length >= 2, `a new episode after >6 quiet ticks must apply again (episodes=${episodeSums.join(',')})`);
    for (const sum of episodeSums) {
      assert.ok(
        sum <= episodeBudget + 1e-6,
        `${VISION}: each episode independently stays inside 10% of cruise (sum=${sum} budget=${episodeBudget})`,
      );
    }

    assert.ok(Math.hypot(parked.vel.x, parked.vel.z) < 0.75,
      `${VISION}: a stationary player is not launched by solver contact (speed=${Math.hypot(parked.vel.x, parked.vel.z)})`);
    assert.ok(rammerSpeedAfterHit > 8,
      `NPC solver response remains live: the rammer still carries post-contact speed (${rammerSpeedAfterHit})`);
    assert.ok(npcSpeedAfterHit > 1,
      `generic MAX_CONTACT_DV still owns non-player bodies: the NPC keeps post-contact motion (${npcSpeedAfterHit})`);
    assert.ok(farSpeedAfterImpulse > farSpeedBefore + 4,
      `queued linear/control impulses stay in the no-contact baseline and still land (${farSpeedBefore} -> ${farSpeedAfterImpulse})`);
    assert.ok(twin.angVel > 0.01 && twin.rot > 0.01,
      'queued torque impulses stay in the no-contact baseline and still yaw the hull');
  } finally {
    owner.dispose();
  }
});

test('a hit may not spin the player: an off-centre impulse is centred on the player and only on the player', async () => {
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: DT });
  try {
    const player = makeCraft(1, { isPlayer: true, x: 0, z: 0 });
    const npc = makeCraft(2, { isPlayer: false, x: 0, z: 400 });
    owner.syncFromEntities([player, npc]);
    // One warm step: Rapier realises a body's mass properties on its first step, and an impulse
    // against a zero-mass body is silently ignored (measured while writing this test).
    owner.step(DT);
    owner.drainContactImpacts();
    // The same impulse, at the same offset from the hull's own centre, on both hulls. This is the
    // shape of the real injector found on 2026-09-05: `weapon_hit` applied at the point of impact,
    // which took the player from 0 to -13.48 rad/s in one tick in the Helios rope cell.
    const kick = { x: 0, y: 0, z: 900 };
    assert.equal(owner.applyImpulse({ entityId: 1, impulse: kick, point: { x: 5, z: 0 }, reason: 'weapon_hit' }), true);
    assert.equal(owner.applyImpulse({ entityId: 2, impulse: kick, point: { x: 5, z: 400 }, reason: 'weapon_hit' }), true);
    owner.step(DT);
    owner.drainContactImpacts();
    // "A controllable mass, not a cursor." The mass moves; the nose does not.
    assert.ok(Math.abs(player.angVel) < 1e-6,
      `${VISION}: an off-centre hit must not spin the player's hull (angVel=${player.angVel})`);
    assert.ok(Math.abs(npc.angVel) > 0.5,
      `every other hull still takes the torque an off-centre hit carries (npc angVel=${npc.angVel})`);
    // The LINEAR half is passed through in full — this is not drag and not a clamp on given
    // momentum, which the packet forbids outright. Both hulls gain the same speed.
    const playerSpeed = Math.hypot(player.vel.x, player.vel.z);
    const npcSpeed = Math.hypot(npc.vel.x, npc.vel.z);
    assert.ok(playerSpeed > 30, `the player still takes the whole linear shove (${playerSpeed})`);
    assert.ok(Math.abs(playerSpeed - npcSpeed) < 1e-3,
      `only the torque arm is dropped, never the momentum (player=${playerSpeed} npc=${npcSpeed})`);
  } finally {
    owner.dispose();
  }
});

test('the player is under the same absolute yaw ceiling as every other hull', async () => {
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: DT });
  try {
    const player = makeCraft(1, { isPlayer: true, x: 0, z: 0 });
    owner.syncFromEntities([player]);
    // A torque far past anything the pilot can command (the player's own yaw peaks near 3 rad/s).
    // Before this net the player was the ONE hull that skipped SANE_MAX_YAW_RATE entirely, and it
    // was measured at 13.51 rad/s on the live Crucible path.
    queuePhysicsTorqueImpulse(player, { x: 0, y: 48_000, z: 0 });
    const rotBefore = player.rot;
    owner.step(DT);
    owner.drainContactImpacts();
    assert.ok(Math.abs(player.angVel) <= 6.0 + 1e-6,
      `${VISION}: nothing may spin the player's hull past the ceiling every other body obeys (angVel=${player.angVel})`);
    // The pose and the rate are the same motion: the ceiling is applied before the rotation is
    // integrated, so a reader can never find a hull whose spin says one thing and whose nose says
    // another. "Turn NOW when I twitch." — the nose must always be where the spin says it is.
    const turned = Math.abs(player.rot - rotBefore);
    assert.ok(Math.abs(turned - Math.abs(player.angVel) * DT) < 1e-3,
      `${VISION}: the restored pose matches the restored spin (turned=${turned} expected=${Math.abs(player.angVel) * DT})`);
  } finally {
    owner.dispose();
  }
});

test('a live rope holds the player against other hulls, not against rock', async () => {
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: DT });
  try {
    const hooked = makeCraft(1, { isPlayer: true, x: -28, z: 0, vx: 80 });
    const free = makeCraft(2, { isPlayer: true, x: -28, z: 80, vx: 80 });
    const trafficHooked = makeCraft(3, { isPlayer: false, x: 8, z: 0, vx: 0 });
    const trafficFree = makeCraft(4, { isPlayer: false, x: 8, z: 80, vx: 0 });
    const anchor = makeRock(20, { x: -220, z: 0 });
    owner.syncFromEntities([hooked, free, trafficHooked, trafficFree, anchor]);
    const handle = owner.createAttachment({
      attachmentId: 'rope-holds-traffic',
      defId: 'tether_standard',
      ownerId: hooked.id,
      targetId: anchor.id,
      sourceWorld: hooked.pos,
      targetWorld: anchor.pos,
      restLength: 220,
      tick: 0,
    });
    assert.ok(handle, `${VISION}: the fixture hooks the player to a far rock`);

    let hookedApplied = 0;
    let freeApplied = 0;
    for (let i = 0; i < 90; i++) {
      owner.step(DT);
      const receipts = owner.drainContactImpacts();
      for (const r of receipts) {
        if (involves(r, hooked.id) && involves(r, trafficHooked.id)) {
          hookedApplied += Math.abs(r.appliedPlayerDeltaV || 0);
        }
        if (involves(r, free.id) && involves(r, trafficFree.id)) {
          freeApplied += Math.abs(r.appliedPlayerDeltaV || 0);
        }
      }
    }
    assert.ok(freeApplied > 0.5, `${VISION}: without a line the same scrape still spends the budget (free=${freeApplied})`);
    assert.ok(hookedApplied <= 1e-6, `${VISION}: a live line holds the player against traffic (hooked=${hookedApplied})`);
  } finally {
    owner.dispose();
  }
});

test('one contact episode gets one budget: the event bridge is the measured flicker, not six ticks', () => {
  // The rule's own definition of an event. The Crucible instrument and the flight scenario both
  // IMPORT this number; a local copy is how a stream of small legal shoves passed a bar that counts
  // events. Measured 2026-09-05 across the three worst cells: p95 of same-body re-contact flicker
  // was 88 ticks, so 90 (1.5 s) keeps one grind inside one budget.
  assert.equal(PLAYER_CONTACT_EVENT_BRIDGE_TICKS, 90,
    `${VISION}: a re-contact inside 1.5 s continues the SAME event and draws on its remaining budget`);
});

test('physics adapter forwards appliedPlayerDeltaV without aliasing raw playerDeltaV', () => {
  const bus = createBus();
  const payloads = [];
  bus.on('physics:impact', (payload) => payloads.push(payload));
  const player = {
    id: 1, type: 'ship', alive: true, mass: 20, isPlayer: true,
    vel: { x: 10, z: 0 }, pos: { x: 0, z: 0 },
  };
  const rock = {
    id: 2, type: 'asteroid', alive: true, mass: 1_000_000,
    vel: { x: 0, z: 0 }, pos: { x: 8, z: 0 },
  };
  const prevSg02 = physics._sg02;
  const prevBus = physics.bus;
  const prevScratch = physics._pairMaterialScratch;
  physics.bus = bus;
  physics._pairMaterialScratch = {
    push: 1, restitution: 0.18, tangentDamping: 0.04, impactScale: 1,
  };
  physics._sg02 = {
    drainContactImpacts() {
      return [{
        aId: 1,
        bId: 2,
        impulse: 40,
        pos: { x: 3, z: 1 },
        normal: { x: 1, z: 0 },
        causalActorId: 2,
        preSolveClosingSpeed: 17.5,
        appliedPlayerDeltaV: 1.25,
        solverPlayerHeadingRad: 0.42,
        solverPlayerYawRateKick: 25.2,
        solverPlayerCourseRad: -0.11,
        appliedPlayerHeadingRad: 0,
        appliedPlayerCourseRad: 0,
      }];
    },
  };
  try {
    const emitted = physics._emitSg02ContactImpacts({
      entities: new Map([[1, player], [2, rock]]),
      tick: 9,
      playerId: 1,
    });
    assert.equal(emitted, 1);
  } finally {
    physics._sg02 = prevSg02;
    physics.bus = prevBus;
    physics._pairMaterialScratch = prevScratch;
  }

  assert.equal(payloads.length, 1);
  const p = payloads[0];
  assert.equal(p.appliedPlayerDeltaV, 1.25, 'adapter forwards applied without recomputing it');
  assert.notEqual(p.playerDeltaV, p.appliedPlayerDeltaV, 'applied must not alias raw playerDeltaV');
  assert.ok(p.playerDeltaV > 0, 'legacy raw playerDeltaV remains a positive solver receipt');
  assert.equal(p.impulse, 40);
  assert.equal(p.preSolveClosingSpeed, 17.5);
  assert.equal(p.causalActorId, 2);
  assert.equal(p.pos.x, 3);
  assert.equal(p.normal.x, 1);
  assert.equal(p.playerInvolved, true);
  // "A controllable mass, not a cursor." The bus carries both halves of the answer: what a rock
  // asked of the nose, and what the rule let through.
  assert.equal(p.solverPlayerHeadingRad, 0.42, 'adapter forwards the solver heading kick unchanged');
  assert.equal(p.solverPlayerYawRateKick, 25.2, 'adapter forwards the solver yaw-rate kick unchanged');
  assert.equal(p.solverPlayerCourseRad, -0.11, 'adapter forwards the solver course kick unchanged');
  assert.equal(p.appliedPlayerHeadingRad, 0, 'retained heading change on the player is zero');
  assert.equal(p.appliedPlayerCourseRad, 0, 'retained course change on the player is zero');
});

test('a receipt with no measured owner angles carries no invented zero', () => {
  const bus = createBus();
  const payloads = [];
  bus.on('physics:impact', (payload) => payloads.push(payload));
  const a = { id: 7, type: 'ship', alive: true, mass: 20, vel: { x: 5, z: 0 }, pos: { x: 0, z: 0 } };
  const b = { id: 8, type: 'ship', alive: true, mass: 20, vel: { x: 0, z: 0 }, pos: { x: 6, z: 0 } };
  const prevSg02 = physics._sg02;
  const prevBus = physics.bus;
  const prevScratch = physics._pairMaterialScratch;
  physics.bus = bus;
  physics._pairMaterialScratch = { push: 1, restitution: 0.18, tangentDamping: 0.04, impactScale: 1 };
  physics._sg02 = {
    drainContactImpacts() {
      return [{ aId: 7, bId: 8, impulse: 12, pos: { x: 3, z: 0 }, normal: { x: 1, z: 0 } }];
    },
  };
  try {
    physics._emitSg02ContactImpacts({ entities: new Map([[7, a], [8, b]]), tick: 3, playerId: 99 });
  } finally {
    physics._sg02 = prevSg02;
    physics.bus = prevBus;
    physics._pairMaterialScratch = prevScratch;
  }
  assert.equal(payloads.length, 1);
  // A hole must stay a hole: an unmeasured angle that arrived as 0 would read as "the solver asked
  // for nothing", which is the exact failure this whole unit exists to stop.
  assert.equal('solverPlayerHeadingRad' in payloads[0], false);
  assert.equal('appliedPlayerHeadingRad' in payloads[0], false);
  assert.equal('appliedPlayerCourseRad' in payloads[0], false);
});

test('proportional receipts sum exactly to the applied delta-V, last takes the residual', async () => {
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: DT });
  try {
    const player = makeCraft(1, { isPlayer: true, x: 0, z: 0, vx: 20 });
    owner.syncFromEntities([player]);
    const rec = owner.records.get(player.id);
    rec._lastAppliedPlayerDeltaV = 1;
    const receipts = [
      { aId: 1, bId: 10, impulse: 1, appliedPlayerDeltaV: 0 },
      { aId: 1, bId: 11, impulse: 1, appliedPlayerDeltaV: 0 },
      { aId: 1, bId: 12, impulse: 1, appliedPlayerDeltaV: 0 },
    ];
    owner._distributeAppliedPlayerDeltaV(receipts);
    const sum = receipts.reduce((n, r) => n + r.appliedPlayerDeltaV, 0);
    assert.equal(sum, 1, `${VISION}: allocated applied delta-V must sum exactly to the retained response`);
    assert.equal(
      receipts[2].appliedPlayerDeltaV,
      1 - (receipts[0].appliedPlayerDeltaV + receipts[1].appliedPlayerDeltaV),
    );
  } finally {
    owner.dispose();
  }
});

function involves(receipt, id) {
  return receipt.aId === id || receipt.bId === id;
}

function snapshot(entity) {
  return { vx: entity.vel.x, vz: entity.vel.z, rot: entity.rot, wy: entity.angVel };
}

function planarHeading(vx, vz) {
  const speed = Math.hypot(vx, vz);
  if (speed <= 1e-9) return { x: 1, z: 0 };
  return { x: vx / speed, z: vz / speed };
}

function makeCraft(id, pose) {
  const radius = 6;
  const mass = 24;
  return {
    id,
    type: 'ship',
    alive: true,
    isPlayer: pose.isPlayer === true,
    radius,
    mass,
    combatSpeed: 100,
    maxSpeed: 100,
    pos: { x: pose.x, z: pose.z },
    vel: { x: pose.vx || 0, z: pose.vz || 0 },
    rot: 0,
    angVel: 0,
    physicsBody: {
      schemaVersion: 1,
      radius,
      mass,
      inertiaY: 48,
      dynamic: true,
      ccd: true,
      revision: 0,
    },
    data: { defId: 'ship_kestrel' },
  };
}

function makeRock(id, pose) {
  return {
    id,
    type: 'asteroid',
    alive: true,
    radius: 10,
    mass: 1_000_000,
    pos: { x: pose.x, z: pose.z },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
    physicsBody: {
      schemaVersion: 1,
      radius: 10,
      mass: 1_000_000,
      inertiaY: 1_000_000,
      dynamic: false,
      ccd: false,
      revision: 0,
    },
    data: {},
  };
}
