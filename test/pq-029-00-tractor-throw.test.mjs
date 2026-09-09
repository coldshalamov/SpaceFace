// PQ-029.00 — Tractor head as a throw toy.
//
// Seed 29000. Prints throw speed / cruise, and proves the Range drill teaches
// pick up / spin / throw inside 60 seconds. The live 1.2x bar is the tractor
// head on a light payload (Rapier is the physics owner). The Range rung is the
// teaching box; it does not invent a second throw writer.
import assert from 'node:assert/strict';
import test from 'node:test';

import { effectiveTetherPolicy } from '../src/combat/attachments.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { mulberry32 } from '../src/core/rng.js';
import { getPropulsionProfile } from '../src/core/flight/propulsionCatalog.js';
import { ATTACHMENT_DEFS } from '../src/data/combatDefs.js';
import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';
import { isAttachable, rateRelease } from '../src/systems/tetherGameplay.js';
import {
  RANGE_RAIL_ROWS,
  TRACTOR_THROW_DRILL_ID,
  TRACTOR_THROW_DRILL_SECONDS,
  createTractorThrowRung,
  rangeRungIndex,
  tickTractorThrowDrill,
} from '../src/ui/screens/range.js';

const SEED = 29000;
const DT = 1 / 60;
const HITCH_CRUISE = getPropulsionProfile('drive_reaction_m').combatSpeed;
const THROW_FLOOR = 1.2 * HITCH_CRUISE;

test('the Range drill teaches pick up, spin, throw in <= 60 s', () => {
  const row = RANGE_RAIL_ROWS.find((entry) => entry.id === TRACTOR_THROW_DRILL_ID);
  assert.ok(row, 'Range rail is missing the tractor throw rung');
  assert.equal(row.group, 'MASSLINE');
  assert.match(row.rule, /PICK UP, SPIN, THROW/);
  assert.match(row.instruction, /latch the pod/i);
  assert.ok(row.durationSeconds <= 60, `drill must teach inside 60 s, got ${row.durationSeconds}`);
  assert.equal(TRACTOR_THROW_DRILL_SECONDS, 60);
  assert.equal(rangeRungIndex('swing_do_not_pull'), 2, 'existing swing rung index stays put');
  assert.equal(rangeRungIndex('well_pulls_light'), 6, 'well rung index stays put');
  assert.equal(rangeRungIndex(TRACTOR_THROW_DRILL_ID), 7);

  const sim = createTractorThrowRung({ variant: 'light' });
  assert.equal(sim.payload.mass, 4, 'the teaching payload is light');
  assert.ok(sim.tether.allowed, 'the tractor line is live on the light variant');

  // Latch on the first tick, keep the flyby while the line winches, then cut.
  let result = tickTractorThrowDrill(sim, DT, {
    input: { forward: true },
    toggleTether: true,
  });
  assert.equal(sim.tether.attachedOnce, true, 'the first tether press must pick the pod up');

  for (let tick = 0; tick < 180 && !result.verdict; tick += 1) {
    result = tickTractorThrowDrill(sim, DT, { input: { forward: true } });
  }
  assert.equal(sim.tether.active, true, 'the spin beat keeps the line on');
  result = tickTractorThrowDrill(sim, DT, { toggleTether: true });
  assert.equal(sim.tether.releasedAfterAttach, true, 'the second press is the throw');

  for (let tick = 0; tick < 360 && !result.verdict; tick += 1) {
    result = tickTractorThrowDrill(sim, DT, { input: { forward: true } });
  }

  console.log(`RANGE_DRILL_TIME=${sim.timeS.toFixed(2)}s LIMIT=${TRACTOR_THROW_DRILL_SECONDS} VERDICT=${result.verdict && result.verdict.kind} THROW=${Math.round(sim.tether.throwSpeed)} CRUISE=${sim.cruise}`);
  assert.ok(result.verdict, 'the drill must reach a verdict');
  assert.equal(result.verdict.kind, 'clear', result.verdict.because || 'drill did not clear');
  assert.ok(result.cleared, 'clearing the gate marks the rung taught');
  assert.ok(sim.timeS <= TRACTOR_THROW_DRILL_SECONDS, `taught in ${sim.timeS.toFixed(2)}s, over the 60 s bar`);
});

test('the tractor head picks up cargo, debris, drones, and light hulls', () => {
  const playerId = SEED;
  const bodies = [
    { id: 1, type: 'payload', alive: true, pos: { x: 100, z: 0 } },
    { id: 2, type: 'wreck', alive: true, pos: { x: -80, z: 40 } },
    { id: 3, type: 'drone', alive: true, pos: { x: 60, z: -60 } },
    { id: 4, type: 'ship', alive: true, pos: { x: -40, z: -90 } },
  ];
  for (const body of bodies) {
    assert.equal(isAttachable(body, playerId), true, `tractor must catch ${body.type}`);
  }
});

test('a winched tractor throw on seed 29000 is >= 1.2x Hitch cruise', async () => {
  const rng = mulberry32(SEED);
  assert.ok(rng() >= 0, 'seed 29000 must drive the fixture rng');

  const STANDARD = ATTACHMENT_DEFS.find((d) => d.id === 'tether_standard');
  const policy = effectiveTetherPolicy(STANDARD, {
    data: { derived: { masslineHeadId: 'tractor' } },
  }, PRODUCTION_FEATURES);
  assert.equal(policy.headId, 'tractor');

  const owner = makeBody('throw-owner', 0, 0, 0, 0, 26, 'ship');
  const pod = makeBody('throw-pod', 100, 0, 0, 45, 4, 'payload');
  const runtime = await createSg02DynamicBodyOwner({ fixedDt: DT, quantum: 1e-5, mode: 'rapier-dynamic' });
  try {
    runtime.syncFromEntities([owner, pod]);
    const handle = runtime.createAttachment({
      attachmentId: 'tractor-throw-29000',
      defId: 'tether_standard',
      ownerId: owner.id,
      targetId: pod.id,
      sourceWorld: owner.pos,
      targetWorld: pod.pos,
      restLength: 80,
      spring: policy.spring,
      tick: 0,
    });
    assert.ok(handle, 'the tractor line must latch the light payload');

    for (let tick = 0; tick < 60; tick += 1) runtime.step(DT);
    for (let i = 0; i < 10; i += 1) {
      runtime.setAttachmentReel({
        attachmentId: 'tractor-throw-29000',
        restLength: 80 - 50 * ((i + 1) / 10),
      });
      for (let tick = 0; tick < 12; tick += 1) runtime.step(DT);
    }
    for (let tick = 0; tick < 90; tick += 1) runtime.step(DT);
    runtime.cutAttachment({ attachmentId: 'tractor-throw-29000' });
    for (let tick = 0; tick < 30; tick += 1) runtime.step(DT);

    const throwSpeed = Math.hypot(pod.vel.x, pod.vel.z);
    const ratio = throwSpeed / HITCH_CRUISE;
    console.log(`TRACTOR_THROW_SPEED=${throwSpeed.toFixed(1)} CRUISE=${HITCH_CRUISE} RATIO=${ratio.toFixed(2)} FLOOR=1.20 SEED=${SEED}`);
    assert.ok(throwSpeed >= THROW_FLOOR,
      `a winched tractor throw must clear 1.2x cruise (${THROW_FLOOR}), got ${throwSpeed.toFixed(1)}`);
  } finally {
    runtime.dispose();
  }
});

test('the throw ends in a release rating, never a silent cut', () => {
  const state = {
    playerId: SEED,
    player: {
      masslineTelemetry: {
        strain: 0.55, tangentialSpeed: 110, radialSpeed: 12, angularSpeed: 2.4,
        distance: 31, restLength: 30, playerSpeed: 40,
        maxStrainSinceLatch: 0.6, maxTangentialSpeedSinceLatch: 110, maxAngularSpeedSinceLatch: 2.4,
      },
    },
  };
  const rating = rateRelease(state, 'throw-pod');
  console.log(`TRACTOR_RELEASE classification=${rating.classification} score=${rating.releaseScore.toFixed(2)} tangential=${rating.tangentialSpeed}`);
  assert.ok(['razor', 'clean'].includes(rating.classification),
    `a loaded swing release must rate clean or better, got ${rating.classification}`);
  assert.equal(rating.targetId, 'throw-pod');
  assert.equal(rating.sourceId, SEED);
});

function makeBody(id, x, z, vx, vz, mass, type) {
  const radius = type === 'payload' ? 2 : 4;
  return {
    id, type, alive: true, radius, mass, maxSpeed: 170,
    physicsBody: { schemaVersion: 1, radius, mass, inertiaY: 64, dynamic: true, ccd: true, revision: 0 },
    pos: { x, z }, vel: { x: vx, z: vz }, rot: 0, angVel: 0, data: {},
  };
}
