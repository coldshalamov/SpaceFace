// §1C row 220 — SFQ-B021 (latch eligibility is honest: each class latches or denies with a
// specific reason) + SFQ-B025 (a just-destroyed hostile is a latchable, throwable body before it
// despawns or is vacuumed). Seed 4242.
import test from 'node:test';
import assert from 'node:assert/strict';

import { mulberry32 } from '../src/core/rng.js';
import { createBus } from '../src/core/eventBus.js';
import { isAttachable, acquisitionDenialReason } from '../src/systems/tetherGameplay.js';
import { resolveMasslineBracketRead, denialNextAction } from '../src/ui/masslineHud.js';

const SEED = 4242;

function makeState() {
  return {
    seed: SEED,
    tick: 120,
    simTime: 120 / 60,
    rng: mulberry32(SEED),
    playerId: 1,
    entities: new Map(),
    run: { phase: 'active', wave: 2 },
  };
}

function body(id, type, x, z, extra = {}) {
  return {
    id, type, alive: true,
    pos: { x, z },
    vel: { x: 0, z: 0 },
    radius: extra.radius ?? 10,
    mass: extra.mass ?? 500,
    physicsBody: extra.physicsBody ?? { dynamic: true, radius: extra.radius ?? 10, mass: extra.mass ?? 500 },
    data: extra.data || {},
  };
}

test('B021 each ineligible class denies with its specific reason, and the glass names it', () => {
  const s = makeState();

  // World-site machinery (solid kinematic body) — the machine is terrain with a cycle, not cargo.
  const machine = body('press', 'wreck', 100, 0, {
    radius: 30,
    physicsBody: { dynamic: false, radius: 30, mass: 1e9, inertiaY: 1e9, material: 'station' },
    data: { role: 'world_site_component', worldSiteComponentId: 'press_b', worldSiteTargetable: true },
  });
  assert.equal(isAttachable(machine, 1, s), false);
  assert.equal(acquisitionDenialReason(machine, 1), 'site-machinery');
  assert.equal(resolveMasslineBracketRead('invalid', 'site-machinery').text, 'DENIED');
  assert.equal(resolveMasslineBracketRead('invalid', 'site-machinery').reason, 'MACHINE, NOT CARGO');
  assert.equal(denialNextAction('invalid', 'site-machinery'), 'HAUL THE LOOSE FREIGHT INSTEAD');

  // Scripted pose (physicsBody:false) — the line has no body to pull on.
  const fauna = body('fauna', 'fauna', 100, 0, { physicsBody: false });
  assert.equal(isAttachable(fauna, 1, s), false);
  assert.equal(acquisitionDenialReason(fauna, 1), 'scripted-body');
  assert.equal(resolveMasslineBracketRead('invalid', 'scripted-body').reason, 'SCRIPTED MOTION');
  assert.equal(denialNextAction('invalid', 'scripted-body'), 'PICK A PHYSICAL BODY');

  // The explicit opt-out and the transient classes.
  const warded = body('warded', 'wreck', 100, 0, { data: { masslineTetherable: false } });
  assert.equal(isAttachable(warded, 1, s), false);
  assert.equal(acquisitionDenialReason(warded, 1), 'not-tetherable');
  assert.equal(resolveMasslineBracketRead('invalid', 'not-tetherable').reason, 'CANNOT LATCH');
  assert.equal(denialNextAction('invalid', 'not-tetherable'), 'PICK ANOTHER TARGET');

  const projectile = body('shot', 'projectile', 100, 0, {});
  assert.equal(acquisitionDenialReason(projectile, 1), 'not-tetherable');

  // A target that simply left/died keeps its own reason.
  const dead = body('dead', 'wreck', 100, 0, {});
  dead.alive = false;
  assert.equal(acquisitionDenialReason(dead, 1), 'target-lost');
});

test('B025 a just-destroyed hostile latches, is towed, releases with earned speed, and lands the hit', async () => {
  const { createAttachmentService } = await import('../src/combat/attachments.js');
  const { createCombatCatalog, ensureCombatState } = await import('../src/combat/runtime.js');
  const { createSg02DynamicBodyOwner } = await import('../src/core/sg02DynamicBodyOwner.js');
  const { writePhysicsControl } = await import('../src/core/physicsAuthority.js');
  const { PRODUCTION_FEATURES } = await import('../src/runtime/runtimeProfiles.js');

  const DT = 1 / 60;
  const player = body(1, 'ship', 0, 0, { radius: 8, mass: 120 });
  player.isPlayer = true;

  // The wreck the aftermath route spawns for a just-destroyed hostile: the victim's body, torn
  // free at a fraction of its mass, real capsule collider, salvage still aboard
  // (aftermathWrecks arena-shard spec). It is fresh: alive, physical, not yet drained.
  const victimMass = 40;
  const wreck = body(2, 'wreck', 70, 0, {
    radius: 9,
    mass: victimMass * 0.35,
    physicsBody: { shape: 'capsule' },
    data: {
      parentType: 'ship',
      wreckClass: 'battlefield',
      wreckClassLabel: 'Hull Debris',
      salvagePool: { cmdty_scrap_metal: 2 },
      salvageTimeLeft: 30,
      killedAt: 100,
    },
  });

  // The other hostile the wreck is thrown at, down the throw line — far enough that the tow
  // itself cannot reach it; only the released body can.
  const victim2 = body(3, 'ship', 700, 0, { radius: 9, mass: 30 });

  const state = {
    mode: 'flight', tick: 100, simTime: 100 / 60, seed: SEED, rng: mulberry32(SEED),
    playerId: player.id,
    runtime: { features: PRODUCTION_FEATURES },
    world: { currentSectorId: 'sector_helios_prime' },
    entities: new Map([[player.id, player], [wreck.id, wreck], [victim2.id, victim2]]),
    entityList: [player, wreck, victim2],
    player: { tether: null },
  };
  ensureCombatState(state);
  const bus = createBus();
  const runtime = await createSg02DynamicBodyOwner({ fixedDt: DT, quantum: 1e-5, mode: 'rapier-dynamic' });
  try {
    runtime.syncFromEntities([player, wreck, victim2]);
    const victimSpeedAtSpawn = Math.hypot(victim2.vel.x, victim2.vel.z);
    assert.ok(victimSpeedAtSpawn < 1, 'the victim must sit still until the thrown wreck arrives');

    // The fresh wreck passes the honest eligibility gate: a real body, nothing scripted.
    assert.equal(isAttachable(wreck, player.id, state), true, 'the fresh wreck must be latchable');

    const attachments = createAttachmentService({
      state, catalog: createCombatCatalog(), helpers: { combatPhysics: runtime }, bus,
    });
    const created = attachments.create({
      defId: 'tether_standard', ownerId: player.id, targetId: wreck.id,
      sourceWorld: { x: player.pos.x, z: player.pos.z },
      targetWorld: { x: wreck.pos.x, z: wreck.pos.z },
    });
    assert.equal(created.ok, true, `the grab must succeed: ${created.reason || 'unknown failure'}`);

    // Grabbed: the player drags the wreck up the throw line. The spring tows it; no scripted
    // timer, no vacuum — the wreck is cargo under real force. The tow stops well short of the
    // victim: the hit must come from the released body, not the tow.
    const THROW_SPEED = 150;
    const RELEASE_LINE_X = 200;
    let maxWreckSpeed = 0;
    let released = false;
    for (let tick = 0; tick < 360; tick += 1) {
      if (wreck.pos.x >= RELEASE_LINE_X) { released = true; break; }
      if (!attachmentsCutAlive(created)) { released = true; break; }
      writePhysicsControl(player, {
        source: 'hand220-player-throw', mode: 'newtonian',
        force: {
          x: Math.sign(THROW_SPEED - player.vel.x) * 40 * player.mass,
          y: 0, z: 0,
        },
        torque: { x: 0, y: 0, z: 0 }, maxSpeed: THROW_SPEED,
      });
      writePhysicsControl(wreck, {
        source: 'hand220-wreck-idle', mode: 'newtonian',
        force: { x: 0, y: 0, z: 0 }, torque: { x: 0, y: 0, z: 0 }, maxSpeed: Infinity,
      });
      writePhysicsControl(victim2, {
        source: 'hand220-victim-idle', mode: 'newtonian',
        force: { x: 0, y: 0, z: 0 }, torque: { x: 0, y: 0, z: 0 }, maxSpeed: Infinity,
      });
      runtime.step(DT);
      maxWreckSpeed = Math.max(maxWreckSpeed, Math.hypot(wreck.vel.x, wreck.vel.z));
    }
    assert.ok(released, 'the tow must reach the release line (or the line must part trying)');
    assert.ok(maxWreckSpeed > 60,
      `the tow must carry the wreck at real speed before release (peak ${maxWreckSpeed.toFixed(1)})`);

    // Released: the earned speed is the throw. Momentum, not a teleport.
    attachments.cut(created.attachment.id, player.id, 'release');
    const atRelease = Math.hypot(wreck.vel.x, wreck.vel.z);
    assert.ok(atRelease > 60, `the release must keep the tow speed (${atRelease.toFixed(1)})`);

    // Thrown at another: fly until the wreck reaches the second hostile and hits it. The solver
    // resolves the contact impulse on the steps after the bodies first overlap, so the loop runs
    // on momentum arrival, not on the first touching frame.
    const hitSpeedBefore = Math.hypot(victim2.vel.x, victim2.vel.z);
    let closestGap = Infinity;
    let landed = false;
    for (let tick = 0; tick < 600; tick += 1) {
      writePhysicsControl(player, {
        source: 'hand220-player-coast', mode: 'newtonian',
        force: { x: 0, y: 0, z: 0 }, torque: { x: 0, y: 0, z: 0 }, maxSpeed: Infinity,
      });
      writePhysicsControl(wreck, {
        source: 'hand220-wreck-coast', mode: 'newtonian',
        force: { x: 0, y: 0, z: 0 }, torque: { x: 0, y: 0, z: 0 }, maxSpeed: Infinity,
      });
      writePhysicsControl(victim2, {
        source: 'hand220-victim-coast', mode: 'newtonian',
        force: { x: 0, y: 0, z: 0 }, torque: { x: 0, y: 0, z: 0 }, maxSpeed: Infinity,
      });
      runtime.step(DT);
      closestGap = Math.min(closestGap,
        Math.hypot(victim2.pos.x - wreck.pos.x, victim2.pos.z - wreck.pos.z));
      if (Math.hypot(victim2.vel.x, victim2.vel.z) > hitSpeedBefore + 8) {
        landed = true;
        break;
      }
    }
    assert.ok(landed, `the thrown wreck must reach the second hostile (closest gap ${closestGap.toFixed(1)})`);
    const victimSpeedAfter = Math.hypot(victim2.vel.x, victim2.vel.z);
    assert.ok(victimSpeedAfter > hitSpeedBefore + 5,
      `the hit must transfer momentum: victim ${hitSpeedBefore.toFixed(1)} -> ${victimSpeedAfter.toFixed(1)}`);

    // Before it despawns or is vacuumed: the wreck is still a live physical body after the whole
    // sequence (the pickup vacuum only ever considers type pickup/payload — a wreck is not one).
    assert.notEqual(wreck.alive, false, 'the wreck must survive its own throw as a live body');
  } finally {
    runtime.dispose();
  }
});

function attachmentsCutAlive(created) {
  return created && created.attachment && created.attachment.state !== 'broken';
}
