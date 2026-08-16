// PR95 Plan 19 — physical Gravity Eddy acceptance.
//
// This is a focused explicit harness using the exact production-relative slice
// anomalyRuntime -> fields -> physics. The movement proof boots the real rapier-dynamic owner, so
// the shared field kernel's queued impulse must cross the production physics membrane to bend the
// body; no mock force or direct integration stands in for gameplay.

import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { physics } from '../src/core/physics.js';
import { fields } from '../src/systems/fields.js';
import { anomalyRuntime } from '../src/systems/anomalyRuntime.js';
import { FIELD_FLAGS } from '../src/data/fields.js';
import { ORCUS_GRAVITY_EDDY } from '../src/data/anomalySites.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { SECTOR_ZONES } from '../src/data/sectorZones.js';
import { PRODUCTION_UPDATE_ORDER } from '../src/runtime/authoritativeSystemManifest.js';

const DT = 1 / 60;
const ORCUS = ORCUS_GRAVITY_EDDY.sectorId;

function canonicalAnchor() {
  const zone = (SECTOR_ZONES[ORCUS] || []).find((candidate) => candidate.id === ORCUS_GRAVITY_EDDY.zoneId);
  assert.ok(zone, 'canonical Orcus zone exists');
  return sectorLocalToGlobalForSector(zone.center, ORCUS);
}

async function boot(seed, sectorId) {
  const sim = createSimulation({
    seed,
    bus: createBus(),
    systems: [fields, anomalyRuntime, physics],
    updateOrder: [anomalyRuntime, fields, physics],
  });
  sim.state.mode = 'flight';
  sim.state.world.currentSectorId = sectorId;
  sim.state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  const physicsSystem = sim.registry.get('physics');
  assert.equal(await physicsSystem.prepareBackend(sim.state), true, 'real rapier-dynamic backend starts');
  return {
    sim,
    fields: sim.registry.get('fields'),
    anomaly: sim.registry.get('anomalyRuntime'),
    cleanup() {
      if (typeof physicsSystem._disableSg02DynamicAuthority === 'function') {
        physicsSystem._disableSg02DynamicAuthority();
      }
      sim.dispose();
    },
  };
}

function spawnProjectile(sim, anchor) {
  return sim.spawn({
    type: 'projectile',
    team: 7,
    pos: { x: anchor.x + 210, z: anchor.z },
    vel: { x: 0, z: 88 },
    rot: Math.PI * 0.5,
    angVel: 0,
    radius: 1.2,
    collides: true,
    hull: 1,
    hullMax: 1,
    physicsBody: {
      schemaVersion: 1,
      radius: 1.2,
      mass: 0.2,
      inertiaY: 0.1,
      dynamic: true,
      ccd: true,
      material: 'projectile',
      revision: 0,
    },
    data: { kind: 'gravity_eddy_probe' },
  });
}

async function trajectory(seed, sectorId, ticks = 90) {
  const harness = await boot(seed, sectorId);
  try {
    const anchor = canonicalAnchor();
    const body = spawnProjectile(harness.sim, anchor);
    for (let i = 0; i < ticks; i++) harness.sim.step(DT);
    return {
      field: harness.fields._kernel.list().find((entry) => entry.id === ORCUS_GRAVITY_EDDY.field.id) || null,
      x: body.pos.x,
      z: body.pos.z,
      vx: body.vel.x,
      vz: body.vel.z,
    };
  } finally {
    harness.cleanup();
  }
}

test('manifest places anomaly registration before the shared field force pass', () => {
  const anomalyIndex = PRODUCTION_UPDATE_ORDER.indexOf('anomalyRuntime');
  assert.ok(anomalyIndex >= 0, 'anomalyRuntime is admitted to the production manifest');
  assert.ok(anomalyIndex < PRODUCTION_UPDATE_ORDER.indexOf('fields'), 'eddy registers before fields applies forces');
});

test('Gravity Eddy is absent outside Orcus and exists at the canonical Orcus Signal anchor', async () => {
  const previous = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;
  try {
    const outside = await boot(1901, 'sector_helios_prime');
    outside.sim.step(DT);
    assert.equal(outside.fields.hasExternal(ORCUS_GRAVITY_EDDY.field.id), false);
    outside.cleanup();

    const inside = await boot(1901, ORCUS);
    inside.sim.step(DT);
    const live = inside.fields._kernel.list().find((entry) => entry.id === ORCUS_GRAVITY_EDDY.field.id);
    const expected = canonicalAnchor();
    assert.ok(live, 'always-on eddy registers on the first active Orcus tick');
    assert.deepEqual(live.center, expected, 'field center comes from zone_orcus_shadow');
    assert.equal(live.tag, 'environmental', 'eddy opts into the existing world-space Well presentation');
    inside.cleanup();
  } finally {
    FIELD_FLAGS.enabled = previous;
  }
});

test('shared field kernel materially bends a real dynamic projectile and repeats deterministically', async () => {
  const previous = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;
  try {
    const control = await trajectory(1902, 'sector_helios_prime');
    const first = await trajectory(1902, ORCUS);
    const repeat = await trajectory(1902, ORCUS);
    assert.equal(control.field, null, 'same-seed control carries no eddy');
    assert.ok(first.field, 'Orcus run carries the authored field');
    assert.ok(first.vx < control.vx - 8, `trajectory bends inward: control vx=${control.vx}, eddy vx=${first.vx}`);
    assert.ok(Math.abs(first.x - control.x) > 5, 'curved path separates materially from control');
    assert.deepEqual(first, repeat, 'same seed and inputs reproduce byte-identical trajectory values');
  } finally {
    FIELD_FLAGS.enabled = previous;
  }
});

test('sector/new/load boundaries clean up and the next active tick re-registers', async () => {
  const previous = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;
  const harness = await boot(1903, ORCUS);
  try {
    const fieldId = ORCUS_GRAVITY_EDDY.field.id;
    harness.sim.step(DT);
    assert.equal(harness.fields.hasExternal(fieldId), true);

    harness.sim.bus.emit('sector:exit', { sectorId: ORCUS });
    assert.equal(harness.fields.hasExternal(fieldId), false, 'sector exit unregisters immediately');
    harness.sim.step(DT);
    assert.equal(harness.fields.hasExternal(fieldId), true, 'still-active Orcus route re-registers next tick');

    harness.sim.bus.emit('save:loaded', {});
    assert.equal(harness.fields.hasExternal(fieldId), false, 'load boundary unregisters immediately');
    harness.sim.step(DT);
    assert.equal(harness.fields.hasExternal(fieldId), true, 'post-load active tick re-registers');

    harness.sim.bus.emit('game:new', {});
    assert.equal(harness.fields.hasExternal(fieldId), false, 'new-game boundary unregisters immediately');
    harness.sim.step(DT);
    assert.equal(harness.fields.hasExternal(fieldId), true, 'new active tick rebuilds authored transient field');
  } finally {
    harness.cleanup();
    FIELD_FLAGS.enabled = previous;
  }
});
