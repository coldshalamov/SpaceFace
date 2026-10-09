// NXI-119: every starter-build description names the demonstrated use-case its fit proved
// on the parent's three-job result (freight leg / tow-recovery / short fight) plus its cost,
// and every advertised capability verifies through the live derived-stats/attachment/economy
// owners — no description may claim universal superiority.
import test from 'node:test';
import assert from 'node:assert/strict';

import { ORIGIN_ROLE_KITS } from '../src/careers/origins/careerOriginContracts.js';
import { MODULES } from '../src/data/modules.js';
import { STARTER_BUILDS, getStarterBuild } from '../src/data/starterBuilds.js';
import { SHIPS } from '../src/data/ships.js';
import { WEAPONS } from '../src/data/weapons.js';
import {
  buildSlotList,
  fits,
  fittingsFromDefaultModules,
  getDerivedStats,
} from '../src/systems/ships.js';

const FITTABLE_BY_ID = new Map([...WEAPONS, ...MODULES].map((entry) => [entry.id, entry]));
const CAREERS = ['hauler', 'hunter', 'prospector'];

function runtimeBuild(id) {
  const build = getStarterBuild(id);
  const fittings = fittingsFromDefaultModules(build.shipId, build.fittings);
  const derived = getDerivedStats(build.shipId, fittings, null);
  return { build, fittings, derived };
}

function kitModuleDef(build) {
  return FITTABLE_BY_ID.get(build.acquisition.moduleId);
}

test('each starter-build description names a demonstrated use-case and its cost', () => {
  const runtime = Object.fromEntries(STARTER_BUILDS.map((entry) => [entry.id, runtimeBuild(entry.id)]));
  const generalist = runtime.starter_generalist;
  const career = CAREERS.map((id) => runtime[`starter_${id}`]);

  // The generalist's demonstrated use-case: the same three jobs with no career tool spent.
  assert.match(generalist.build.benefit, /freight, tow and fight/i,
    'generalist benefit must name the three demonstrated jobs');
  assert.match(generalist.build.benefit, /open utility slot/i,
    'generalist benefit must name its open-slot capability');
  assert.match(generalist.build.tradeoff, /utility slot/i,
    'generalist tradeoff must name the slot it keeps open');
  assert.match(generalist.build.tradeoff, /winch, plate or price feed/i,
    'generalist tradeoff must name the career capabilities it forgoes');
  for (const other of career) {
    assert.ok(generalist.derived.maxSpeed > other.derived.maxSpeed,
      `${other.build.id}: generalist keeps the advertised speed edge on the same runs`);
    assert.ok(generalist.derived.turnRate > other.derived.turnRate,
      `${other.build.id}: generalist keeps the advertised turn-authority edge on the same runs`);
  }

  // The hauler's demonstrated use-case: the freight leg.
  const hauler = runtime.starter_hauler;
  assert.match(hauler.build.benefit, /freight leg/i,
    'hauler benefit must name the demonstrated freight-leg use-case');
  assert.match(hauler.build.benefit, /station-price feed/i,
    'hauler benefit must name the live capability its uplink powers');
  assert.equal(kitModuleDef(hauler.build).mods.marketIntel, true,
    'hauler uplink carries the marketIntel flag the live exchange feed consumes');
  for (const other of career) {
    if (other === hauler) continue;
    assert.ok(hauler.derived.maxSpeed > other.derived.maxSpeed,
      `${other.build.id}: hauler keeps the advertised speed edge on a freight leg`);
    assert.ok(hauler.derived.turnRate > other.derived.turnRate,
      `${other.build.id}: hauler keeps the advertised turn edge on a freight leg`);
  }
  assert.match(hauler.build.tradeoff, /no hold growth/i,
    'hauler tradeoff must name that the uplink does not expand the hold');

  // The hunter's demonstrated use-case: the short fight.
  const hunter = runtime.starter_hunter;
  assert.match(hunter.build.benefit, /short fight/i,
    'hunter benefit must name the demonstrated short-fight use-case');
  assert.match(hunter.build.benefit, /hull contact/i,
    'hunter benefit must name the hull-as-weapon capability its plate supplies');
  assert.ok(hunter.derived.ramDamageDealtMult > 1,
    'hunter plate must produce the advertised contact edge through derived stats');
  for (const other of career) {
    if (other === hunter) continue;
    assert.ok(hunter.derived.operationalMass > other.derived.operationalMass,
      `${other.build.id}: hunter carries the advertised momentum edge`);
    assert.ok(hunter.derived.turnRate < other.derived.turnRate,
      `${other.build.id}: hunter pays the advertised turn-authority cost`);
  }
  assert.match(hunter.build.tradeoff, /gives up the most speed and turn authority/i,
    'hunter tradeoff must name the handling cost');

  // The prospector's demonstrated use-case: tow-recovery on the Massline.
  const prospector = runtime.starter_prospector;
  assert.match(prospector.build.benefit, /tow-recovery/i,
    'prospector benefit must name the demonstrated tow-recovery use-case');
  assert.match(prospector.build.benefit, /reels the Massline in faster/i,
    'prospector benefit must name the reel-rate capability');
  assert.match(prospector.build.benefit, /farther out/i,
    'prospector benefit must name the longer-line capability');
  assert.ok(prospector.derived.tetherReelRateMult > 1,
    'prospector winch must produce the advertised reel edge through derived stats');
  assert.ok(prospector.derived.tetherSpoolMult > 1,
    'prospector winch must produce the advertised reach edge through derived stats');
  for (const other of career) {
    if (other === prospector) continue;
    assert.ok(prospector.derived.continuousDrain > other.derived.continuousDrain,
      `${other.build.id}: prospector pays the advertised power-draw cost`);
  }
  assert.match(prospector.build.tradeoff, /most power/i,
    'prospector tradeoff must name the power-draw cost');

  // Every description names its cost, and no career kit is best everywhere —
  // the parent's standing no-universal-superiority rule.
  for (const { build } of Object.values(runtime)) {
    assert.match(build.tradeoff, /utility slot/i,
      `${build.id} tradeoff must name the utility-slot cost`);
    assert.ok(build.benefit.length >= 24 && build.tradeoff.length >= 24,
      `${build.id} copy must stay player-readable`);
  }
  for (const entry of career) {
    const beatenBy = career.some((other) => other !== entry
      && (other.derived.maxSpeed > entry.derived.maxSpeed
        || other.derived.turnRate > entry.derived.turnRate
        || other.derived.continuousDrain < entry.derived.continuousDrain));
    assert.ok(beatenBy, `${entry.build.id} must lose to another kit on at least one axis`);
  }
});

test('neighboring success: the four builds still place legal fits through the real owner', () => {
  const hitch = SHIPS.find((entry) => entry.id === getStarterBuild('starter_generalist').shipId);
  const slots = buildSlotList(hitch);
  const seen = new Set();
  for (const build of STARTER_BUILDS) {
    const placed = fittingsFromDefaultModules(build.shipId, build.fittings);
    assert.equal(placed.filter(Boolean).length, build.fittings.length,
      `${build.id}: every declared module still reaches a slot`);
    for (let index = 0; index < placed.length; index += 1) {
      const moduleId = placed[index];
      if (!moduleId) continue;
      assert.ok(fits(slots[index], FITTABLE_BY_ID.get(moduleId)),
        `${build.id}: ${moduleId} still fits slot ${index}`);
    }
    seen.add(JSON.stringify(getDerivedStats(build.shipId, placed, null).mass)
      + getDerivedStats(build.shipId, placed, null).continuousDrain);
    assert.equal(build.acquisition.moduleId,
      build.careerId ? ORIGIN_ROLE_KITS[build.careerId].defId : null,
      `${build.id}: acquisition still names the canonical role kit`);
  }
  assert.equal(seen.size, 4, 'the four fits still produce four distinct capability packets');
});
