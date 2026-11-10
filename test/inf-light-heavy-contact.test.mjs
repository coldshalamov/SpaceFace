// inf-light-heavy-contact — the wave-7 A/B left a candidate (not claim): "a light hull
// slung into a heavy one can end ticks interpenetrated with ball colliders — production
// hulls use compound proxies; contact-domain owner should look." This settles it on the
// PRODUCTION construction paths in the same fixed-seed SG-02 lab the tether A/B used,
// measured with the owner's own solid-contact sampler (the solver's per-point separation,
// shape-accurate for compounds — never an envelope-radius guess):
//   A  craft -> craft      both hulls on the ordinary ship path (capsule colliders);
//   B  craft -> compound   the light hull slams a production compound hull — the Ceres
//                          Second Measure Breaker (mass 3200, 13 authored primitives);
//   C  compound -> craft   a production DYNAMIC compound hull (the Borrowed Voice
//                          recorder body) slung into the heavy craft;
//   D  ball -> ball        the candidate's origin case, for reference only.
// Each sling is a hard, honest throw (140 wu/s, 5.6x the repo's own throw floor), spawned
// far outside every authored footprint, run dead-center (worst case) and 0.8 degrees off
// (seeded, so the arms are not one geometry, inside the target's angular width so it lands).
// Honesty bar for the production arms: the
// solver never opens a penetration deeper than a rounding hair (no tick with separation
// under -1 wu), nothing tunnels through the heavy hull, the shove lands (the heavy hull
// moves, the light hull does not carry through), and the pair ends at a resting touch or
// apart — never holding an overlap. Arm D is printed, not asserted: it documents the
// candidate against the toy shape, not the production claim.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { writePhysicsControl } from '../src/core/physicsAuthority.js';
import { ceresWorkfleetHardwareSpec } from '../src/data/ceresWorkfleetHardware.js';
import { borrowedVoiceRecorderBody, borrowedVoiceRecorderRadius } from '../src/data/borrowedVoiceBody.js';

const DT = 1 / 60;
const TICKS = 600;          // 10 s: approach, impact, restitution, settle
const ENTRY_SPEED = 140;    // a hard sling — 5.6x the repo's throw floor (THROW_CREDIT_MIN_SPEED_WU)
const SPAWN_X = -300;       // far outside every authored footprint (lab-clear, not a dodge)

function capsuleHull(id, x, z, mass, radius, vx, vz) {
  // The ordinary ship path: no authored shape, ship type — the owner builds the capsule.
  return {
    id, type: 'ship', alive: true, collides: true, radius, mass, maxSpeed: 400,
    physicsBody: { schemaVersion: 1, radius, mass, inertiaY: mass * 4, dynamic: true, ccd: true, revision: 0 },
    pos: { x, z }, vel: { x: vx, z: vz }, rot: 0, angVel: 0, data: {}, occupantGeneration: 1,
  };
}

function ballHull(id, x, z, mass, radius, vx, vz) {
  const body = capsuleHull(id, x, z, mass, radius, vx, vz);
  body.type = 'debris';
  body.physicsBody.shape = 'ball'; // the authored toy shape the candidate was seen with
  return body;
}

function productionCompoundBreaker() {
  // A real production heavy hull: the authored Ceres hardware spec, body factory intact.
  const spec = ceresWorkfleetHardwareSpec('breaker');
  return {
    ...spec, id: 'breaker', occupantGeneration: 1, alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0,
  };
}

function compoundRecorder(id, x, z, vx, vz) {
  // A real production DYNAMIC compound hull, built by the authored body factory itself.
  return {
    id, type: 'prop', alive: true, collides: true,
    radius: borrowedVoiceRecorderRadius('a'), mass: 8, maxSpeed: 400,
    physicsBody: borrowedVoiceRecorderBody('a'),
    pos: { x, z }, vel: { x: vx, z: vz }, rot: 0, angVel: 0, data: {}, occupantGeneration: 1,
  };
}

async function runSling({ light, heavy, offsetRad = 0 }) {
  const runtime = await createSg02DynamicBodyOwner({ fixedDt: DT, quantum: 1e-5, mode: 'rapier-dynamic' });
  try {
    const bodies = [light, heavy];
    if (offsetRad) {
      light.pos.z = Math.tan(offsetRad) * (heavy.pos.x - SPAWN_X) * -1;
      light.vel.x = ENTRY_SPEED * Math.cos(offsetRad);
      light.vel.z = ENTRY_SPEED * Math.sin(offsetRad);
    }
    runtime.syncFromEntities(bodies);
    const trace = {
      firstContactTick: null, minSeparation: Infinity, deepTicks: 0,
      endRows: 0, endWorst: Infinity, crossed: false,
      lightEndSpeed: null, heavyEndSpeed: null,
    };
    for (let tick = 0; tick < TICKS; tick += 1) {
      for (const body of bodies) {
        if (body.physicsBody.dynamic === false) continue;
        writePhysicsControl(body, {
          source: 'inf-contact-lab', mode: 'newtonian',
          force: { x: 0, y: 0, z: 0 }, torque: { x: 0, y: 0, z: 0 }, maxSpeed: Infinity,
        });
      }
      runtime.step(DT);
      const lightBefore = light.pos.x;
      let worst = null;
      for (const row of runtime.sampleSolidContacts(light.id)) {
        if (!worst || row.separation < worst.separation) worst = row;
      }
      if (worst) {
        if (trace.firstContactTick == null) trace.firstContactTick = tick;
        trace.minSeparation = Math.min(trace.minSeparation, worst.separation);
        if (worst.separation < -1) trace.deepTicks += 1;
      }
      // Tunnel read (envelope): the light hull carried PAST the heavy's centre plane.
      if (!trace.crossed
        && Math.abs(light.pos.x - heavy.pos.x) < 1
        && Math.abs(lightBefore - heavy.pos.x) > 1) trace.crossed = true;
    }
    const endRows = runtime.sampleSolidContacts(light.id);
    trace.endRows = endRows.length;
    trace.endWorst = endRows.reduce((w, r) => Math.min(w, r.separation), Infinity);
    trace.lightEndSpeed = Math.hypot(light.vel.x, light.vel.z);
    trace.heavyEndSpeed = Math.hypot(heavy.vel.x, heavy.vel.z);
    return trace;
  } finally {
    runtime.destroy?.();
  }
}

const describeTrace = (t) => `firstContact t${t.firstContactTick}, minSep ${t.minSeparation === Infinity ? 'none' : t.minSeparation.toFixed(4)}, `
  + `deepTicks ${t.deepTicks}, endRows ${t.endRows} (worst ${t.endWorst === Infinity ? 'n/a' : t.endWorst.toFixed(4)}), `
  + `crossed ${t.crossed}, endSpeeds ${t.lightEndSpeed.toFixed(1)}/${t.heavyEndSpeed.toFixed(2)}`;

async function deadCenterAndSeeded(name, makePair) {
  const straight = await runSling(makePair());
  console.log(`${name} dead-center: ${describeTrace(straight)}`);
  assert.ok(straight.firstContactTick != null,
    `${name}: the sling must actually land (${describeTrace(straight)})`);
  assert.ok(straight.minSeparation > -0.5 && straight.deepTicks === 0,
    `${name}: the solver never opens a real penetration (${describeTrace(straight)})`);
  assert.ok(!straight.crossed,
    `${name}: nothing tunnels through the heavy hull (${describeTrace(straight)})`);
  assert.ok(straight.heavyEndSpeed > 0.05 && straight.lightEndSpeed < ENTRY_SPEED * 0.5,
    `${name}: the shove lands — the heavy moves and the throw does not carry through (${describeTrace(straight)})`);
  assert.ok(straight.endWorst > -1,
    `${name}: the pair never holds an overlap at rest (${describeTrace(straight)})`);
  // The offset-bearing arm crosses on a different geometry (its placement drift cancels the
  // bearing's z-drift, so it still lands near the centre line — that is the point: same
  // hit, different pose). Its manifold can be transient between ticks, so the sampler may
  // report no rows while the exchange itself reads on the heavy hull's velocity.
  const seeded = await runSling(makePair(Math.PI / 225));
  console.log(`${name} offset-bearing: ${describeTrace(seeded)}`);
  assert.ok(seeded.minSeparation > -0.5 && seeded.deepTicks === 0 && !seeded.crossed,
    `${name}: the offset-bearing sling stays honest too (${describeTrace(seeded)})`);
  assert.ok(seeded.heavyEndSpeed > 0.05,
    `${name}: the offset-bearing exchange lands (${describeTrace(seeded)})`);
}

test('production craft-to-craft: a hard sling keeps the hulls separated', async () => {
  await deadCenterAndSeeded('craft->craft', (ang = 0) => ({
    heavy: capsuleHull('heavy', 0, 0, 400, 8, 0, 0),
    light: capsuleHull('light', SPAWN_X, 0, 12, 5, ENTRY_SPEED * Math.cos(ang), ENTRY_SPEED * Math.sin(ang)),
  }));
});

test('production compound target: the thrown hull does not sink into the authored proxies', async () => {
  await deadCenterAndSeeded('craft->compound', (ang = 0) => ({
    heavy: productionCompoundBreaker(),
    light: capsuleHull('light', SPAWN_X, 0, 12, 5, ENTRY_SPEED * Math.cos(ang), ENTRY_SPEED * Math.sin(ang)),
  }));
});

test('production dynamic compound hull: the recorder slings into the heavy craft honestly', async () => {
  await deadCenterAndSeeded('compound->craft', (ang = 0) => ({
    heavy: capsuleHull('heavy', 0, 0, 400, 8, 0, 0),
    light: compoundRecorder('recorder', SPAWN_X, 0, ENTRY_SPEED * Math.cos(ang), ENTRY_SPEED * Math.sin(ang)),
  }));
});

test('reference: the same sling with toy ball colliders (reported, not asserted)', async () => {
  const straight = await runSling({
    light: ballHull('light', SPAWN_X, 0, 12, 5, ENTRY_SPEED, 0),
    heavy: ballHull('heavy', 0, 0, 400, 8, 0, 0),
  });
  console.log(`ball->ball dead-center (candidate origin): ${describeTrace(straight)}`);
});
