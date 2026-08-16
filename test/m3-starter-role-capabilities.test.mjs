import test from 'node:test';
import assert from 'node:assert/strict';

import { effectiveTetherPolicy } from '../src/combat/attachments.js';
import { ATTACHMENT_DEFS } from '../src/data/combatDefs.js';
import { STARTER_BUILDS, getStarterBuild } from '../src/data/starterBuilds.js';
import { ensurePhysicsBodySpec } from '../src/core/physicsAuthority.js';
import {
  buildSlotList,
  fittingsFromDefaultModules,
  getDerivedStats,
  makeShipEntitySpec,
} from '../src/systems/ships.js';
import { SHIPS } from '../src/data/ships.js';

function runtimeBuild(id) {
  const build = getStarterBuild(id);
  const fittings = fittingsFromDefaultModules(build.shipId, build.fittings);
  const derived = getDerivedStats(build.shipId, fittings, null);
  return { build, fittings, derived };
}

test('starter role copy advertises only capabilities exercised by live runtime consumers', () => {
  const builds = Object.fromEntries(STARTER_BUILDS.map((entry) => [entry.id, runtimeBuild(entry.id)]));
  const generalist = builds.starter_generalist;
  const hauler = builds.starter_hauler;
  const hunter = builds.starter_hunter;
  const prospector = builds.starter_prospector;

  for (const { build } of Object.values(builds)) {
    assert.equal(typeof build.benefit, 'string', `${build.id} must name its live benefit`);
    assert.ok(build.benefit.length >= 24, `${build.id} benefit must be player-readable`);
    assert.doesNotMatch(`${build.benefit} ${build.tradeoff}`, /market intel|route intelligence/i,
      `${build.id} cannot advertise unconsumed metadata`);
  }

  const hitch = SHIPS.find((entry) => entry.id === generalist.build.shipId);
  const utilitySlot = buildSlotList(hitch).find((slot) => slot.type === 'utility');
  assert.ok(utilitySlot, 'Hitch must expose the utility slot named by the generalist copy');
  assert.equal(generalist.fittings[utilitySlot.index], 'mod_ram_plate',
    'fresh Hitch carries the starter physics verb in its real utility slot');
  assert.ok(generalist.derived.ramDamageDealtMult > 1,
    'the live derived-stat consumer makes the fitted plate mechanically real');
  assert.equal(hunter.fittings[utilitySlot.index], 'mod_ram_plate',
    'the Hunter preview keeps the already-fitted plate without duplicating the utility slot');
  assert.equal(hauler.fittings[utilitySlot.index], 'mod_market_data_s');
  assert.equal(prospector.fittings[utilitySlot.index], 'mod_winch_hd');

  assert.ok(hauler.derived.maxSpeed > hunter.derived.maxSpeed,
    'light hauler kit keeps more live speed than the heavy hunter kit');
  assert.ok(hauler.derived.maxSpeed > prospector.derived.maxSpeed,
    'light hauler kit keeps more live speed than the winch kit');
  assert.ok(hauler.derived.turnRate > hunter.derived.turnRate,
    'light hauler kit keeps more live turn authority than the heavy hunter kit');
  assert.ok(hauler.derived.turnRate > prospector.derived.turnRate,
    'light hauler kit keeps more live turn authority than the winch kit');

  assert.ok(hunter.derived.operationalMass > hauler.derived.operationalMass);
  assert.ok(hunter.derived.operationalMass > prospector.derived.operationalMass);
  const hunterEntity = makeShipEntitySpec(hunter.build.shipId, {
    fittings: hunter.fittings,
    isPlayer: true,
  });
  const hunterBody = ensurePhysicsBodySpec(hunterEntity);
  assert.equal(hunterEntity.mass, hunter.derived.operationalMass,
    'ships copies the hunter build mass onto the live entity');
  assert.equal(hunterBody.mass, hunter.derived.operationalMass,
    'physics authority consumes the hunter build mass');

  const standardTether = ATTACHMENT_DEFS.find((entry) => entry.id === 'tether_standard');
  assert.ok(standardTether, 'standard tether definition exists');
  const basePolicy = effectiveTetherPolicy(standardTether, {
    data: { derived: generalist.derived },
  });
  const prospectorPolicy = effectiveTetherPolicy(standardTether, {
    data: { derived: prospector.derived },
  });
  assert.ok(prospectorPolicy.reelRate > basePolicy.reelRate,
    'live attachment service consumes the prospector reel-rate benefit');
  assert.ok(prospectorPolicy.break.maxTension > basePolicy.break.maxTension,
    'live attachment service consumes the prospector line-strength benefit');
  assert.ok(prospectorPolicy.break.maxImpulse > basePolicy.break.maxImpulse,
    'live attachment service consumes the prospector impulse tolerance');
});
