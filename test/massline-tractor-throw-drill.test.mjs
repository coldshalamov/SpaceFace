// PQ-029.00 — Tractor head as a throw toy.
//
// The drill lives as data (src/data/scenarios/tractor-throw-drill.scenario.json — the Range
// screen is owned by PQ-163.02 and stays untouched). This test proves the three beats against
// the real seams: latch eligibility for all four body classes, a real SG-02 swing-and-release
// with the tractor policy that prints its throw speed, and a release rating on the throw.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { effectiveTetherPolicy } from '../src/combat/attachments.js';
import { ATTACHMENT_DEFS } from '../src/data/combatDefs.js';
import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';
import { isAttachable, rateRelease } from '../src/systems/tetherGameplay.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DRILL = JSON.parse(readFileSync(resolve(ROOT, 'src/data/scenarios/tractor-throw-drill.scenario.json'), 'utf8'));
// Hitch on the stock reaction-M drive: governed combat speed 95 wu/s (propulsionCatalog).
const HITCH_CRUISE = 95;
const THROW_FLOOR = 1.2 * HITCH_CRUISE;
const DT = 1 / 60;
const PLAYER_ID = 2900;

test('the drill exists as data: three beats, one verb each, inside 60 seconds', () => {
  assert.equal(DRILL.schema, 'spaceface.scenarioContract.v1');
  assert.equal(DRILL.id, 'scenario.tractor-throw-drill');
  assert.ok(DRILL.durationSeconds <= 60, `drill must teach inside 60 s, got ${DRILL.durationSeconds}`);
  assert.deepEqual(DRILL.beats.map((b) => b.id), ['tractor_pickup', 'tractor_spin', 'tractor_throw']);
  const roles = new Map(DRILL.actors.map((a) => [a.id, a]));
  for (const id of ['player_hitch', 'drill_pod', 'drill_drone', 'drill_debris', 'drill_skiff', 'drill_gate']) {
    assert.ok(roles.has(id), `drill cast is missing ${id}`);
  }
  // Cargo, debris, drone, and light hull are all first-class catchables.
  for (const id of ['drill_pod', 'drill_drone', 'drill_debris', 'drill_skiff']) {
    const caps = roles.get(id).capabilities;
    assert.ok(caps.includes('massline.attachment_target'), `${id} must be latchable`);
    assert.ok(caps.includes('throwable.light'), `${id} must be throwable`);
  }
  // The throw beat ends in a rated release, never a silent cut.
  const throwBeat = DRILL.beats[2];
  assert.ok(throwBeat.funnelEventIds.includes('tether:releaseRated'));
});

test('the tractor head picks up cargo, debris, drones, and light hulls', () => {
  const bodies = [
    { id: 1, type: 'payload', alive: true, pos: { x: 100, z: 0 } },  // cargo pod
    { id: 2, type: 'wreck', alive: true, pos: { x: -80, z: 40 } },   // debris chunk
    { id: 3, type: 'drone', alive: true, pos: { x: 60, z: -60 } },   // drone
    { id: 4, type: 'ship', alive: true, pos: { x: -40, z: -90 } },   // light hull
  ];
  for (const body of bodies) {
    assert.equal(isAttachable(body, PLAYER_ID), true, `tractor must catch ${body.type}`);
  }
});

test('a winched swing throws a light payload at >= 1.2x cruise with the tractor head', async () => {
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
      attachmentId: 'tractor-throw', defId: 'tether_standard',
      ownerId: owner.id, targetId: pod.id,
      sourceWorld: owner.pos, targetWorld: pod.pos,
      restLength: 80, spring: policy.spring, tick: 0,
    });
    assert.ok(handle, 'the tractor line must latch the light payload');

    for (let tick = 0; tick < 60; tick += 1) runtime.step(DT);      // settle into the swing
    for (let i = 0; i < 10; i += 1) {                               // winch 80 -> 30: the wind-up
      runtime.setAttachmentReel({ attachmentId: 'tractor-throw', restLength: 80 - 50 * ((i + 1) / 10) });
      for (let tick = 0; tick < 12; tick += 1) runtime.step(DT);
    }
    for (let tick = 0; tick < 90; tick += 1) runtime.step(DT);      // hold the loaded swing
    runtime.cutAttachment({ attachmentId: 'tractor-throw' });       // the throw
    for (let tick = 0; tick < 30; tick += 1) runtime.step(DT);

    const throwSpeed = Math.hypot(pod.vel.x, pod.vel.z);
    const ratio = throwSpeed / HITCH_CRUISE;
    console.log(`TRACTOR_THROW_SPEED=${throwSpeed.toFixed(1)} CRUISE=${HITCH_CRUISE} RATIO=${ratio.toFixed(2)} FLOOR=1.20`);
    assert.ok(throwSpeed >= THROW_FLOOR,
      `a winched tractor throw must clear 1.2x cruise (${THROW_FLOOR}), got ${throwSpeed.toFixed(1)}`);
  } finally {
    runtime.dispose();
  }
});

test('the throw ends in a release rating, never a silent cut', () => {
  // A loaded tangential swing at cut time: the rating the HUD toast reads.
  const state = {
    playerId: PLAYER_ID,
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
  assert.equal(rating.sourceId, PLAYER_ID);
});

function makeBody(id, x, z, vx, vz, mass, type) {
  const radius = type === 'payload' ? 2 : 4;
  return {
    id, type, alive: true, radius, mass, maxSpeed: 170,
    physicsBody: { schemaVersion: 1, radius, mass, inertiaY: 64, dynamic: true, ccd: true, revision: 0 },
    pos: { x, z }, vel: { x: vx, z: vz }, rot: 0, angVel: 0, data: {},
  };
}
