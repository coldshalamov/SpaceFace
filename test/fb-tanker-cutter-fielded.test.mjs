// FB-133 — The packaged volatiles tanker and inspection cutter are fielded with their jobs
//
// Pins:
// 1. Both craft are fielded with signature job configurations in FIELD_JOB_SIGNATURE_CRAFT.
// 2. Both map to their occupational job kinds in OCCUPATIONAL_JOB_KIND_BY_ROLE (tanker -> hauler, customs -> patrol).
// 3. Signature profile ids exist and resolve for both craft.
// 4. In trafficRoleMixForSector, tanker is only weighted > 0 when refuel service is present and not highCore.
// 5. In trafficRoleMixForSector, customs is only weighted > 0 when scan/toll service is present and not highCore.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FIELD_JOB_SIGNATURE_CRAFT,
  OCCUPATIONAL_JOB_KIND_BY_ROLE,
} from '../src/data/occupationalTrafficCraft.js';
import { SECTORS } from '../src/data/sectors.js';
import { trafficRoleMixForSector } from '../src/systems/traffic.js';

test('FB-133: volatiles tanker and inspection cutter are authored and fielded', () => {
  const tanker = FIELD_JOB_SIGNATURE_CRAFT.find((c) => c.craftId === 'volatiles_tanker');
  const cutter = FIELD_JOB_SIGNATURE_CRAFT.find((c) => c.craftId === 'inspection_cutter');

  assert.ok(tanker, 'volatiles_tanker defined');
  assert.equal(tanker.fielded, true, 'tanker is fielded');
  assert.equal(tanker.role, 'tanker');
  assert.equal(tanker.jobKind, 'hauler');
  assert.equal(tanker.service, 'refuel');
  assert.equal(tanker.loadedProfileId, 'heavy_burn');
  assert.equal(tanker.emptyProfileId, 'clean_burn');

  assert.ok(cutter, 'inspection_cutter defined');
  assert.equal(cutter.fielded, true, 'cutter is fielded');
  assert.equal(cutter.role, 'customs');
  assert.equal(cutter.jobKind, 'patrol');
  assert.equal(cutter.service, 'customs');
  assert.equal(cutter.profileId, 'on_the_pin');
});

test('FB-133: roles map to correct job kinds in OCCUPATIONAL_JOB_KIND_BY_ROLE', () => {
  assert.equal(OCCUPATIONAL_JOB_KIND_BY_ROLE.tanker, 'hauler');
  assert.equal(OCCUPATIONAL_JOB_KIND_BY_ROLE.customs, 'patrol');
});

test('FB-133: service gating strictly controls tanker and customs appearance', () => {
  for (const sector of SECTORS) {
    const mix = trafficRoleMixForSector(sector);
    const services = new Set();
    for (const st of sector.stations || []) {
      for (const s of st.services || []) services.add(s);
    }
    const highCore = typeof sector.security === 'number' && sector.security >= 0.9;

    if (mix.tanker > 0) {
      assert.ok(services.has('refuel'), `Sector ${sector.id} with tanker mix > 0 must have refuel service`);
      assert.ok(!highCore, `Sector ${sector.id} with tanker mix > 0 must not be highCore`);
    }

    if (mix.customs > 0) {
      assert.ok(
        services.has('scan') || services.has('toll'),
        `Sector ${sector.id} with customs mix > 0 must have scan or toll service`
      );
      assert.ok(!highCore, `Sector ${sector.id} with customs mix > 0 must not be highCore`);
    }
  }
});
