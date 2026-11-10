// PQ-029.02 — Frame coupler as the tow you can trust.
//
// Drill is data only (Range is owned elsewhere). Proof: a Drifter-mass hull tows 200 mass
// through a 180° at 60% Hitch cruise; hitch length accordion stays under 20 WU. The coupler
// still does not match sideways frames or brake a zero-stretch close.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { writePhysicsControl } from '../src/core/physicsAuthority.js';
import { effectiveTetherPolicy } from '../src/combat/attachments.js';
import { ATTACHMENT_DEFS } from '../src/data/combatDefs.js';
import { MODULES } from '../src/data/modules.js';
import { SHIPS } from '../src/data/ships.js';
import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';
import { fittingsFromDefaultModules, getDerivedStats } from '../src/systems/ships.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DRILL = JSON.parse(readFileSync(resolve(ROOT, 'src/data/scenarios/frame-coupler-tow-drill.scenario.json'), 'utf8'));
const DT = 1 / 60;
const HITCH_CRUISE = 95;
const TURN_SPEED = 0.6 * HITCH_CRUISE;
const REST = 80;
const DIST_SWING_CEILING = 20;
const COUPLER = MODULES.find((def) => def.id === 'mod_frame_coupler_m');
const DRIFTER = SHIPS.find((def) => def.id === 'ship_drifter');
const STANDARD = ATTACHMENT_DEFS.find((def) => def.id === 'tether_standard');

test('the coupler tow drill exists as data: hitch then turn, inside 60 seconds', () => {
  assert.equal(DRILL.schema, 'spaceface.scenarioContract.v1');
  assert.equal(DRILL.id, 'scenario.frame-coupler-tow-drill');
  assert.ok(DRILL.durationSeconds <= 60);
  assert.deepEqual(DRILL.beats.map((b) => b.id), ['coupler_hitch', 'coupler_turn']);
  assert.equal(DRILL.actors[0].assetRef, 'ship_drifter');
});

test('the coupler is an M hitch on the Drifter', () => {
  assert.equal(COUPLER.size, 'M');
  const fittings = fittingsFromDefaultModules(DRIFTER.id, [COUPLER.id]);
  assert.ok(fittings.includes(COUPLER.id));
  assert.equal(getDerivedStats(DRIFTER.id, fittings, null).masslineHeadId, 'frame_coupler');
});

test('a 200-mass tow holds a 180° at 60% cruise without hitch accordion', async () => {
  const policy = effectiveTetherPolicy(STANDARD, {
    data: { derived: { masslineHeadId: 'frame_coupler' } },
  }, PRODUCTION_FEATURES);
  assert.equal(policy.headId, 'frame_coupler');

  const tug = makeBody('tow-tug', 0, 0, DRIFTER.mass, TURN_SPEED, 0);
  const load = makeBody('tow-load', -REST, 0, 200, TURN_SPEED, 0);
  const runtime = await createSg02DynamicBodyOwner({ fixedDt: DT, quantum: 1e-5, mode: 'rapier-dynamic' });
  try {
    runtime.syncFromEntities([tug, load]);
    const handle = runtime.createAttachment({
      attachmentId: 'coupler-tow', defId: 'tether_standard',
      ownerId: tug.id, targetId: load.id,
      sourceWorld: tug.pos, targetWorld: load.pos,
      restLength: REST, spring: policy.spring, tick: 0,
    });
    assert.ok(handle);

    const turnTicks = 240;
    const omega = Math.PI / (turnTicks * DT);
    const tau = 0.22;
    let heading = 0;
    let minDist = Infinity;
    let maxDist = 0;
    for (let tick = 0; tick < turnTicks + 90; tick += 1) {
      if (tick < turnTicks) heading = omega * tick * DT;
      const vx = Math.cos(heading) * TURN_SPEED;
      const vz = Math.sin(heading) * TURN_SPEED;
      writePhysicsControl(tug, {
        source: 'pq-029-02-tow', mode: 'newtonian',
        force: { x: ((vx - tug.vel.x) / tau) * tug.mass, y: 0, z: ((vz - tug.vel.z) / tau) * tug.mass },
        torque: { x: 0, y: 0, z: 0 }, maxSpeed: Infinity,
      });
      writePhysicsControl(load, {
        source: 'pq-029-02-tow', mode: 'newtonian',
        force: { x: 0, y: 0, z: 0 }, torque: { x: 0, y: 0, z: 0 }, maxSpeed: Infinity,
      });
      runtime.step(DT);
      const dist = Math.hypot(load.pos.x - tug.pos.x, load.pos.z - tug.pos.z);
      minDist = Math.min(minDist, dist);
      maxDist = Math.max(maxDist, dist);
    }

    const distSwing = maxDist - minDist;
    const tugHeading = Math.atan2(tug.vel.z, tug.vel.x);
    console.log(
      `COUPLER_TOW distSwing=${distSwing.toFixed(1)} min=${minDist.toFixed(1)} max=${maxDist.toFixed(1)} `
      + `SPEED=${TURN_SPEED.toFixed(1)} tugH=${(tugHeading * 180 / Math.PI).toFixed(1)} CEILING=${DIST_SWING_CEILING}`,
    );
    assert.ok(minDist > REST * 0.7, `hitch must stay taut, min ${minDist.toFixed(1)}`);
    assert.ok(distSwing <= DIST_SWING_CEILING,
      `200-mass 180° tow must not accordion more than ${DIST_SWING_CEILING} WU, got ${distSwing.toFixed(1)}`);
    assert.ok(Math.abs(tugHeading) > 2,
      `tug must make the 180, heading ${((tugHeading * 180) / Math.PI).toFixed(1)} deg`);
  } finally {
    runtime.dispose();
  }
});

function makeBody(id, x, z, mass, vx, vz) {
  return {
    id, type: 'ship', alive: true, radius: 6, mass, maxSpeed: 260,
    physicsBody: { schemaVersion: 1, radius: 6, mass, inertiaY: mass * 4, dynamic: true, ccd: true, revision: 0 },
    pos: { x, z }, vel: { x: vx, z: vz }, rot: 0, angVel: 0, data: {},
  };
}
