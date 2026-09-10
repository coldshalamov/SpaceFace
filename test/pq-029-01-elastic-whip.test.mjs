// PQ-029.01 — Elastic whip as stored energy.
//
// Seed 29010. Prints snap Δv / Wasp cruise, and proves the Range drill teaches
// latch / stretch / snap. The live 40% bar is the elastic whip spring on a light
// hostile (Rapier is the physics owner). The Range rung is the teaching box.
import assert from 'node:assert/strict';
import test from 'node:test';

import { effectiveTetherPolicy } from '../src/combat/attachments.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { mulberry32 } from '../src/core/rng.js';
import { getPropulsionProfile } from '../src/core/flight/propulsionCatalog.js';
import { ATTACHMENT_DEFS } from '../src/data/combatDefs.js';
import { SHIPS } from '../src/data/ships.js';
import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';
import {
  ELASTIC_WHIP_HEAD_ID,
  ELASTIC_WHIP_SPRING_K,
  whipGlowFromStoredEnergy,
  whipStoredEnergy,
  whipStrainGlow,
} from '../src/systems/tetherGameplay.js';
import {
  ELASTIC_WHIP_DRILL_ID,
  ELASTIC_WHIP_DRILL_SECONDS,
  RANGE_RAIL_ROWS,
  TRACTOR_THROW_DRILL_ID,
  createElasticWhipRung,
  rangeRungIndex,
  tickElasticWhipDrill,
} from '../src/ui/screens/range.js';

const SEED = 29010;
const DT = 1 / 60;
const WASP_CRUISE = getPropulsionProfile('drive_reaction_s').combatSpeed;
const SNAP_FLOOR = 0.4 * WASP_CRUISE;
const DRIFTER = SHIPS.find((def) => def.id === 'ship_drifter');

test('the Range drill teaches stretch-store-snap after the tractor throw rung', () => {
  const row = RANGE_RAIL_ROWS.find((entry) => entry.id === ELASTIC_WHIP_DRILL_ID);
  assert.ok(row, 'Range rail is missing the elastic whip rung');
  assert.equal(row.group, 'MASSLINE');
  assert.match(row.rule, /STRETCH STORES, RELEASE SNAPS/);
  assert.match(row.instruction, /latch the wasp/i);
  assert.ok(row.durationSeconds <= 60, `drill must teach inside 60 s, got ${row.durationSeconds}`);
  assert.equal(ELASTIC_WHIP_DRILL_SECONDS, 60);
  assert.equal(rangeRungIndex('swing_do_not_pull'), 2, 'existing swing rung index stays put');
  assert.equal(rangeRungIndex('well_pulls_light'), 6, 'well rung index stays put');
  assert.equal(rangeRungIndex(TRACTOR_THROW_DRILL_ID), 7, 'tractor throw stays at the previous end');
  assert.equal(rangeRungIndex(ELASTIC_WHIP_DRILL_ID), 8);

  const sim = createElasticWhipRung({ variant: 'light' });
  assert.equal(sim.hostile.mass, 16, 'the teaching hostile is a light wasp');
  assert.ok(sim.tether.allowed, 'the whip line is live on the light variant');
  assert.equal(sim.cruise, WASP_CRUISE);

  let result = tickElasticWhipDrill(sim, DT, {
    input: { forward: true },
    toggleTether: true,
  });
  assert.equal(sim.tether.attachedOnce, true, 'the first tether press must latch the wasp');

  for (let tick = 0; tick < 360 && !result.verdict; tick += 1) {
    result = tickElasticWhipDrill(sim, DT, { input: { forward: true } });
  }

  console.log(`RANGE_DRILL_TIME=${sim.timeS.toFixed(2)}s LIMIT=${ELASTIC_WHIP_DRILL_SECONDS} VERDICT=${result.verdict && result.verdict.kind} SNAP=${Math.round(sim.tether.snapSpeed)} CRUISE=${sim.cruise} ENERGY=${Math.round(sim.tether.maxStoredEnergy)} GLOW=${sim.tether.maxStrainGlow.toFixed(2)}`);
  assert.ok(result.verdict, 'the drill must reach a verdict');
  assert.equal(result.verdict.kind, 'clear', result.verdict.because || 'drill did not clear');
  assert.ok(result.cleared, 'clearing the gate marks the rung taught');
  assert.ok(sim.timeS <= ELASTIC_WHIP_DRILL_SECONDS, `taught in ${sim.timeS.toFixed(2)}s, over the 60 s bar`);
  assert.ok(sim.tether.maxStoredEnergy > 0, 'stretch must store energy before the snap');
  assert.ok(sim.tether.maxStrainGlow >= 0.35, 'stored stretch must light a readable strain glow');
});

test('a heavy hull shrugs the whip snap and an overload breaks the line', () => {
  const heavy = createElasticWhipRung({ variant: 'heavy' });
  assert.equal(heavy.hostile.mass, 2400);
  let result = tickElasticWhipDrill(heavy, DT, { input: { forward: true }, toggleTether: true });
  for (let tick = 0; tick < 240 && !result.verdict; tick += 1) {
    result = tickElasticWhipDrill(heavy, DT, { input: { forward: true } });
  }
  assert.ok(heavy.tether.maxStoredEnergy > 0, 'the heavy contrast still stores stretch');
  assert.ok(
    !result.verdict || result.verdict.kind !== 'clear' || heavy.tether.snapSpeed < SNAP_FLOOR,
    'a 2400-mass hull must not clear the light-hostile snap bar',
  );

  const overloaded = createElasticWhipRung({ variant: 'light' });
  tickElasticWhipDrill(overloaded, DT, { input: { forward: true }, toggleTether: true });
  overloaded.player.x = overloaded.hostile.x + overloaded.tether.restLength * 2.6;
  overloaded.player.z = overloaded.hostile.z;
  const broke = tickElasticWhipDrill(overloaded, DT, { input: { forward: true } });
  assert.equal(overloaded.tether.brokeByLoad, true, 'the whip must break by load when stretch exceeds the edge');
  assert.equal(overloaded.tether.active, false);
  assert.ok(broke.verdict, 'breaking the line ends the drill');
  assert.equal(broke.verdict.kind, 'fail');
});

test('stretch stores energy and the glow tracks that same quantity', () => {
  assert.equal(ELASTIC_WHIP_HEAD_ID, 'elastic_whip');
  assert.equal(whipStoredEnergy(20, ELASTIC_WHIP_SPRING_K), 0.5 * ELASTIC_WHIP_SPRING_K * 400);
  const hot = whipStoredEnergy(22.4);
  assert.ok(whipGlowFromStoredEnergy(hot, 80) >= 0.9, 'a working snap stretch must read as hot glow');
  assert.equal(whipStrainGlow(22.4, 80), whipGlowFromStoredEnergy(hot, 80));
  assert.ok(whipGlowFromStoredEnergy(whipStoredEnergy(2), 80) < 0.15, 'a slack stretch stays dim');
  assert.equal(whipGlowFromStoredEnergy(0, 80), 0, 'spent energy must dim the glow');
});

test('a stored whip snap on seed 29010 moves a light hostile >= 40% of Wasp cruise', async () => {
  const rng = mulberry32(SEED);
  assert.ok(rng() >= 0, 'seed 29010 must drive the fixture rng');

  const STANDARD = ATTACHMENT_DEFS.find((d) => d.id === 'tether_standard');
  const policy = effectiveTetherPolicy(STANDARD, {
    data: { derived: { masslineHeadId: ELASTIC_WHIP_HEAD_ID } },
  }, PRODUCTION_FEATURES);
  assert.equal(policy.headId, ELASTIC_WHIP_HEAD_ID);

  const owner = makeBody('whip-owner', 0, 0, -105, 0, DRIFTER.mass, 'ship');
  const wasp = makeBody('whip-wasp', 80, 0, 0, 0, 16, 'ship');
  const runtime = await createSg02DynamicBodyOwner({ fixedDt: DT, quantum: 1e-5, mode: 'rapier-dynamic' });
  try {
    runtime.syncFromEntities([owner, wasp]);
    const handle = runtime.createAttachment({
      attachmentId: 'elastic-whip-snap-29010',
      defId: 'tether_standard',
      ownerId: owner.id,
      targetId: wasp.id,
      sourceWorld: owner.pos,
      targetWorld: wasp.pos,
      restLength: 80,
      spring: policy.spring,
      tick: 0,
    });
    assert.ok(handle, 'the whip must latch the light hostile');

    let peakEnergy = 0;
    let peakGlow = 0;
    let releaseEnergy = 0;
    let releaseGlow = 0;
    let waspBefore = 0;
    let released = false;
    for (let tick = 0; tick < 180; tick += 1) {
      runtime.step(DT);
      const telemetry = runtime.getAttachmentTelemetry({ attachmentId: 'elastic-whip-snap-29010' });
      if (!telemetry) continue;
      const energy = telemetry.storedEnergy;
      const glow = whipGlowFromStoredEnergy(energy, telemetry.restLength);
      peakEnergy = Math.max(peakEnergy, energy);
      peakGlow = Math.max(peakGlow, glow);
      if (!released && energy >= 20000 && telemetry.stretch > 12) {
        waspBefore = Math.hypot(wasp.vel.x, wasp.vel.z);
        releaseEnergy = energy;
        releaseGlow = glow;
        runtime.cutAttachment({
          attachmentId: 'elastic-whip-snap-29010',
          reason: 'tether_cut',
        });
        released = true;
        break;
      }
    }
    assert.equal(released, true, 'the whip must still be stretched when the player cuts');
    const waspAfter = Math.hypot(wasp.vel.x, wasp.vel.z);
    const snapDv = Math.max(0, waspAfter - waspBefore);
    const ratio = waspAfter / WASP_CRUISE;
    console.log(`WHIP_SNAP_DV=${waspAfter.toFixed(1)} BEFORE=${waspBefore.toFixed(1)} D_V=${snapDv.toFixed(1)} CRUISE=${WASP_CRUISE} RATIO=${ratio.toFixed(2)} FLOOR=0.40 ENERGY=${releaseEnergy.toFixed(0)} SPENT=${releaseEnergy.toFixed(0)} GLOW=${releaseGlow.toFixed(2)} PEAK_ENERGY=${peakEnergy.toFixed(0)} PEAK_GLOW=${peakGlow.toFixed(2)} SEED=${SEED}`);
    assert.ok(releaseEnergy > 0, 'the stretch must publish stored energy');
    assert.ok(releaseGlow >= 0.35, 'the glow must read that stored energy, not a timer');
    assert.ok(waspAfter >= SNAP_FLOOR,
      `a stored whip snap must move a light hostile >= 40% cruise (${SNAP_FLOOR}), got ${waspAfter.toFixed(1)}`);
    assert.equal(runtime.getAttachmentTelemetry({ attachmentId: 'elastic-whip-snap-29010' }), null,
      'the line is gone after the release spends the store');
  } finally {
    runtime.dispose();
  }
});

test('a slack whip cut spends nothing and is not a gun', async () => {
  const STANDARD = ATTACHMENT_DEFS.find((d) => d.id === 'tether_standard');
  const policy = effectiveTetherPolicy(STANDARD, {
    data: { derived: { masslineHeadId: ELASTIC_WHIP_HEAD_ID } },
  }, PRODUCTION_FEATURES);
  const owner = makeBody('slack-owner', 0, 0, 0, 0, DRIFTER.mass, 'ship');
  const wasp = makeBody('slack-wasp', 80, 0, 0, 0, 16, 'ship');
  const runtime = await createSg02DynamicBodyOwner({ fixedDt: DT, quantum: 1e-5, mode: 'rapier-dynamic' });
  try {
    runtime.syncFromEntities([owner, wasp]);
    runtime.createAttachment({
      attachmentId: 'elastic-whip-slack-29010',
      defId: 'tether_standard',
      ownerId: owner.id,
      targetId: wasp.id,
      sourceWorld: owner.pos,
      targetWorld: wasp.pos,
      restLength: 80,
      spring: policy.spring,
      tick: 0,
    });
    runtime.step(DT);
    const telemetry = runtime.getAttachmentTelemetry({ attachmentId: 'elastic-whip-slack-29010' });
    const energy = telemetry ? telemetry.storedEnergy : 0;
    runtime.cutAttachment({ attachmentId: 'elastic-whip-slack-29010', reason: 'tether_cut' });
    const waspSpeed = Math.hypot(wasp.vel.x, wasp.vel.z);
    console.log(`SLACK_CUT ENERGY=${energy.toFixed(1)} WASP=${waspSpeed.toFixed(2)} SEED=${SEED}`);
    assert.ok(energy < 50, `a rest-length line must not store a snap, got ${energy.toFixed(1)}`);
    assert.ok(waspSpeed < 4, `a slack cut must not fire a gun, wasp ${waspSpeed.toFixed(2)}`);
  } finally {
    runtime.dispose();
  }
});

function makeBody(id, x, z, vx, vz, mass, type) {
  const radius = 4;
  return {
    id, type, alive: true, radius, mass, maxSpeed: 170,
    physicsBody: { schemaVersion: 1, radius, mass, inertiaY: 64, dynamic: true, ccd: true, revision: 0 },
    pos: { x, z }, vel: { x: vx, z: vz }, rot: 0, angVel: 0, data: {},
  };
}
