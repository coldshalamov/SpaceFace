// Acceptance probe (spec §8.2 / DoD §22): a LIGHT ship swings around a HEAVY ship on a Massline,
// driven by real mass-ratio momentum exchange through the Rapier rope joint + the massline
// controller — not scripted motion. Mirrors the SG-02 lab harness in check-sg02-dynamic-body-owner.mjs.
//
// Contract proved:
//   • The heavy anchor barely moves (large mass) while the light ship's trajectory bends.
//   • The light ship ends up moving in a different direction than its initial velocity — a swing.
//   • The Massline holds (does not break) under a moderate tethered maneuver.
//   • The light ship stays tethered at roughly the rest length (an orbital binding).
import assert from 'node:assert/strict';
import {
  createSg02CombatPhysicsPort,
  createSg02DynamicBodyOwner,
} from '../src/core/sg02DynamicBodyOwner.js';

const DT = 1 / 60;

function makeShip(id, x, z, mass, inertia, radius = 12) {
  return {
    id, type: 'ship', alive: true, radius, mass,
    flightModel: { inertia },
    pos: { x, z }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0,
    physicsBody: { mass, inertiaY: inertia, radius },
    data: {},
  };
}

const heavy = makeShip(1, 0, 0, 200, 600, 16);      // the anchor — barely moves
const light = makeShip(2, 40, 0, 8, 12, 10);        // the swinger — low mass
const INITIAL_LIGHT_VEL = { x: 0, z: 55 };          // tangential → induces an orbital swing
light.vel = { ...INITIAL_LIGHT_VEL };

const owner = await createSg02DynamicBodyOwner({ fixedDt: DT, quantum: 1e-5 });
const port = createSg02CombatPhysicsPort(owner);

try {
  owner.syncFromEntities([heavy, light]);
  assert.equal(owner.diagnostics().bodies, 2, 'swing lab should create both dynamic bodies');

  // Tether the light ship to the heavy anchor at a 40-unit rest length. High break thresholds so
  // the maneuver holds (we are testing swing dynamics, not breakage here).
  const REST = 40;
  const handle = port.createAttachment({
    attachmentId: 'att_swing',
    defId: 'attachment_massline',
    ownerId: heavy.id,
    targetId: light.id,
    sourceSocketId: 'massline',
    targetSocketId: 'massline',
    sourceWorld: { x: heavy.pos.x, y: 0, z: heavy.pos.z },
    targetWorld: { x: light.pos.x, y: 0, z: light.pos.z },
    restLength: REST,
    break: { maxTension: 100_000, maxImpulse: 100_000, stiffness: 220, damping: 16 },
    tick: 0,
  });
  assert(handle && handle.id, 'Massline attachment should be created');

  // Record the light ship's initial velocity heading.
  const initialHeading = Math.atan2(light.vel.z, light.vel.x);
  const initialSpeed = Math.hypot(light.vel.x, light.vel.z);

  // Step the physics: the tangential velocity + rope constraint produces a swing/orbit.
  const STEPS = 240; // ~4s of simulation
  let broke = false;
  let minDist = Infinity, maxDist = 0;
  for (let i = 0; i < STEPS; i++) {
    owner.step(DT);
    const tele = port.getAttachmentTelemetry({ attachmentId: 'att_swing', physicsHandle: handle, tick: i });
    if (!tele) { broke = true; break; }
    minDist = Math.min(minDist, tele.distance);
    maxDist = Math.max(maxDist, tele.distance);
  }
  assert(!broke, 'Massline should hold under a moderate tethered swing (no break)');

  // Heavy anchor barely moved (mass-ratio dominance): the swing is centered on the anchor. The
  // anchor is 25x the swinger's mass, so its displacement must be a small fraction of the rest length.
  const heavyDisp = Math.hypot(heavy.pos.x, heavy.pos.z);
  assert(heavyDisp < REST * 0.4,
    `heavy anchor (mass 200) should barely move vs the light ship (mass 8); displaced ${heavyDisp.toFixed(1)} (rest ${REST})`);

  // The light ship's velocity heading changed — its trajectory BENT around the anchor.
  const finalHeading = Math.atan2(light.vel.z, light.vel.x);
  const headingBend = Math.abs(wrapAngle(finalHeading - initialHeading));
  assert(headingBend > 0.6,
    `light ship trajectory should bend noticeably around the heavy anchor; heading bend ${headingBend.toFixed(2)} rad`);

  // The light ship stayed bound near the rest length — an orbital binding, not escape or collapse.
  assert(maxDist <= REST * 1.6,
    `light ship should not fly far beyond the rest length; max distance ${maxDist.toFixed(1)} (rest ${REST})`);

  const lightFinalSpeed = Math.hypot(light.vel.x, light.vel.z);
  assert(lightFinalSpeed > initialSpeed * 0.5,
    `light ship should retain substantial momentum through the swing; final speed ${lightFinalSpeed.toFixed(1)}`);

  console.log('Massline swing acceptance (spec §8.2 / DoD §22):');
  console.log(`  heavy anchor displacement: ${heavyDisp.toFixed(2)} units (mass-ratio: 200 vs 8)`);
  console.log(`  light ship heading bend:    ${headingBend.toFixed(2)} rad (trajectory swung around anchor)`);
  console.log(`  light ship speed:           ${initialSpeed.toFixed(1)} -> ${lightFinalSpeed.toFixed(1)}`);
  console.log(`  tether distance range:      ${minDist.toFixed(1)} .. ${maxDist.toFixed(1)} (rest ${REST})`);
  console.log(`  massline controller:        holding (no break) — momentum exchange is physical`);
  console.log('PASS: light ship swings around the heavy ship on Massline, mass-ratio-driven.');
} finally {
  owner.dispose();
}

function wrapAngle(a) { let x = a % (Math.PI * 2); if (x <= -Math.PI) x += Math.PI * 2; if (x > Math.PI) x -= Math.PI * 2; return x; }
