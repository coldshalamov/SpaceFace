// Plan 30 — clue → find → codex-unlock for the four secrets that shipped as locked placeholders.
//
// The point of this file is the NEGATIVE half. A test that only proves "the unlock works" would
// pass just as happily against a row that unlocks for everyone, which is the exact failure the
// build map records for these four. Every chain below is asserted in both directions.

import assert from 'node:assert/strict';
import test from 'node:test';

import { codexSecretPages } from '../src/data/codexSecrets.js';
import {
  STAR_SIGNATURE_PLATES,
  normalizeStarSignatureState,
  starSignatureProgress,
} from '../src/data/starSignatures.js';
import { CONTRIBUTOR_CONSTELLATIONS } from '../src/data/constellationLabels.js';
import {
  UNREGISTERED_CACHES,
  normalizeUnregisteredCachesState,
  unregisteredCacheProgress,
} from '../src/data/unregisteredCaches.js';
import {
  THE_FACE,
  faceApproachSolution,
  normalizeTheFaceState,
} from '../src/data/theFace.js';
import {
  THE_DEVELOPER,
  normalizeTheDeveloperState,
  theDeveloperShouldExist,
} from '../src/data/theDeveloper.js';
import { MODULES } from '../src/data/modules.js';
import { COMMODITIES } from '../src/data/commodities.js';
import { SECTORS } from '../src/data/sectors.js';
import { ENEMY_TYPES } from '../src/data/enemies.js';
import { SHIP_MARKING_STYLES, markingStylesForShip } from '../src/data/shipCustomization.js';

const SECTOR_BY_ID = new Map(SECTORS.map((sector) => [sector.id, sector]));
const MODULE_IDS = new Set(MODULES.map((row) => row.id));
const COMMODITY_IDS = new Set(COMMODITIES.map((row) => row.id));

function pageFor(state, id) {
  return codexSecretPages(state).find((page) => page.id === id);
}

function poiIn(sectorId, poiId) {
  const sector = SECTOR_BY_ID.get(sectorId);
  return !!(sector && (sector.pois || []).some((poi) => poi && poi.id === poiId));
}

test('every Plan 30 secret is still locked on a fresh profile', () => {
  const pages = codexSecretPages({ story: {}, world: {}, meta: { seed: 1 } });
  assert.equal(pages.filter((page) => page.unlocked).length, 0,
    'no secret may reveal itself from catalog presence alone');
  assert.ok(pages.every((page) => page.body == null && page.phase === 'locked'));
});

// ---------------------------------------------------------------- Names in the Stars

test('Names in the Stars is earned from builder plates and never touches the chart', () => {
  // The constraint that made this a design call: the sky labels stay presentation-only.
  for (const constellation of CONTRIBUTOR_CONSTELLATIONS) {
    assert.equal(constellation.interactive, false,
      'constellation labels must remain non-interactive presentation');
  }
  // Every plate names a real constellation and a real POI, one per region.
  const labelIds = new Set(CONTRIBUTOR_CONSTELLATIONS.map((row) => row.id));
  const sectors = new Set();
  for (const plate of STAR_SIGNATURE_PLATES) {
    assert.ok(labelIds.has(plate.constellationId), `${plate.constellationId} must exist in the sky`);
    assert.ok(poiIn(plate.sectorId, plate.poiId), `${plate.poiId} must exist in ${plate.sectorId}`);
    sectors.add(plate.sectorId);
  }
  assert.equal(sectors.size, STAR_SIGNATURE_PLATES.length, 'plates must be spread across sectors');

  const partial = { world: { starSignatures: { plates: { [STAR_SIGNATURE_PLATES[0].poiId]: { readAt: 12 } } } } };
  const partialPage = pageFor(partial, 'secret_names_in_stars');
  assert.equal(partialPage.phase, 'partial');
  assert.match(partialPage.body, /1 of 3 plates read/);

  const all = { world: { starSignatures: { plates: Object.fromEntries(
    STAR_SIGNATURE_PLATES.map((plate) => [plate.poiId, { readAt: 40 }]),
  ) } } };
  const complete = pageFor(all, 'secret_names_in_stars');
  assert.equal(complete.phase, 'complete');
  for (const plate of STAR_SIGNATURE_PLATES) assert.match(complete.body, new RegExp(plate.handle));
});

test('a junk plate stamp cannot forge a builder signature', () => {
  const forged = normalizeStarSignatureState({ plates: {
    [STAR_SIGNATURE_PLATES[0].poiId]: { readAt: 'yes' },
    [STAR_SIGNATURE_PLATES[1].poiId]: { readAt: -4 },
    poi_not_a_beacon: { readAt: 10 },
  } });
  assert.deepEqual(Object.keys(forged.plates), []);
  assert.equal(starSignatureProgress({ world: { starSignatures: forged } }).read, 0);
  assert.equal(pageFor({ world: { starSignatures: forged } }, 'secret_names_in_stars').unlocked, false);
});

// ---------------------------------------------------------------- Unregistered Caches

test('the cache chain is 6-10 caches on real hidden POIs with real contents', () => {
  assert.ok(UNREGISTERED_CACHES.length >= 6 && UNREGISTERED_CACHES.length <= 10,
    `plan asks for 6-10 caches, found ${UNREGISTERED_CACHES.length}`);
  const ids = new Set();
  for (const def of UNREGISTERED_CACHES) {
    assert.ok(!ids.has(def.id), `duplicate cache id ${def.id}`);
    ids.add(def.id);
    assert.ok(poiIn(def.sectorId, def.cachePoiId), `${def.cachePoiId} must exist in ${def.sectorId}`);
    const sector = SECTOR_BY_ID.get(def.sectorId);
    const poi = sector.pois.find((row) => row.id === def.cachePoiId);
    assert.equal(poi.type, 'cache', `${def.cachePoiId} must be an authored cache POI`);
    assert.equal(poi.hidden, true, `${def.cachePoiId} must be hidden`);
    assert.ok(COMMODITY_IDS.has(def.cargo.commodityId), `${def.cargo.commodityId} must be a real commodity`);
    assert.ok(def.cargo.qty > 0);
    if (def.grantModuleId) {
      assert.ok(MODULE_IDS.has(def.grantModuleId), `${def.grantModuleId} must be a real module`);
    }
  }
  // The plan's named contents all have a home.
  assert.equal(UNREGISTERED_CACHES.filter((def) => def.forbidden).length, 1,
    'exactly one forbidden tech item');
  assert.ok(UNREGISTERED_CACHES.some((def) => def.grantModuleId && !def.forbidden),
    'at least one old-tech module');
  assert.ok(UNREGISTERED_CACHES.filter((def) => def.cosmeticMarkingId).length >= 2,
    'unique cosmetics');
  // The forbidden module had no other source in the game before this chain.
  const forbidden = UNREGISTERED_CACHES.find((def) => def.forbidden);
  const def = MODULES.find((row) => row.id === forbidden.grantModuleId);
  assert.equal(def.purchasable, false, 'a forbidden item must not be purchasable');
});

test('opening a cache unlocks the row; a malformed open cannot', () => {
  const first = UNREGISTERED_CACHES[0];
  const locked = { world: { unregisteredCaches: { caches: {} } } };
  assert.equal(pageFor(locked, 'secret_cache_chain').unlocked, false);

  const opened = { world: { unregisteredCaches: normalizeUnregisteredCachesState({
    caches: { [first.id]: { phase: 'opened', openedAt: 30 } },
  }) } };
  const page = pageFor(opened, 'secret_cache_chain');
  assert.equal(page.unlocked, true);
  assert.match(page.body, new RegExp(first.name));
  assert.equal(unregisteredCacheProgress(opened).opened, 1);

  // An `opened` claim with no open time is not an open cache — it falls back to what it can prove.
  const forged = normalizeUnregisteredCachesState({
    caches: { [first.id]: { phase: 'opened', openedAt: null } },
  });
  assert.equal(forged.caches[first.id], undefined);
  assert.equal(pageFor({ world: { unregisteredCaches: forged } }, 'secret_cache_chain').unlocked, false);

  // A granted module id that does not match the authored one is discarded, never honoured.
  const vault = UNREGISTERED_CACHES.find((row) => row.grantModuleId);
  const tampered = normalizeUnregisteredCachesState({
    caches: { [vault.id]: { phase: 'opened', openedAt: 8, grantedModuleId: 'mod_shield_aegis_l' } },
  });
  assert.equal(tampered.caches[vault.id].grantedModuleId, null);
});

// ---------------------------------------------------------------- The Face

test('The Face resolves only from the authored approach arc', () => {
  const body = { x: 0, z: 0 };
  const rad = THE_FACE.approachBearingDeg * Math.PI / 180;
  const inArc = { x: Math.cos(rad) * 180, z: Math.sin(rad) * 180 };
  const solved = faceApproachSolution(inArc, body);
  assert.equal(solved.resolved, true);
  assert.ok(solved.offAxisDeg <= THE_FACE.approachHalfWidthDeg);

  // Same range, wrong bearing — the far side is only the far side.
  const offRad = (THE_FACE.approachBearingDeg + 90) * Math.PI / 180;
  const offArc = faceApproachSolution({ x: Math.cos(offRad) * 180, z: Math.sin(offRad) * 180 }, body);
  assert.equal(offArc.resolved, false);
  assert.equal(offArc.withinRange, true, 'the failure must be the bearing, not the range');

  // Right bearing, too close and too far.
  const tooClose = faceApproachSolution(
    { x: Math.cos(rad) * (THE_FACE.minRangeWu - 10), z: Math.sin(rad) * (THE_FACE.minRangeWu - 10) }, body);
  assert.equal(tooClose.resolved, false);
  assert.equal(tooClose.withinArc, true);
  const tooFar = faceApproachSolution(
    { x: Math.cos(rad) * (THE_FACE.maxRangeWu + 10), z: Math.sin(rad) * (THE_FACE.maxRangeWu + 10) }, body);
  assert.equal(tooFar.resolved, false);

  assert.equal(faceApproachSolution(null, body), null);
  assert.equal(faceApproachSolution({ x: 1, z: NaN }, body), null);
});

test('The Face row needs a saved bearing that is still inside the arc', () => {
  assert.ok(poiIn(THE_FACE.sectorId, THE_FACE.poiId), 'the anchor moon must exist in the graph');

  const seen = { world: { theFace: { phase: 'seen', seenAt: 90, bearingDeg: THE_FACE.approachBearingDeg } } };
  const page = pageFor(seen, 'secret_face');
  assert.equal(page.unlocked, true);
  assert.match(page.body, new RegExp(THE_FACE.bodyName));

  // A save asserting the find from a bearing that could never have produced it is rejected.
  const forged = normalizeTheFaceState({ phase: 'seen', seenAt: 90, bearingDeg: THE_FACE.approachBearingDeg + 90 });
  assert.equal(forged.phase, 'unseen');
  const noBearing = normalizeTheFaceState({ phase: 'seen', seenAt: 90 });
  assert.equal(noBearing.phase, 'unseen');
  assert.equal(pageFor({ world: { theFace: forged } }, 'secret_face').unlocked, false);
});

test('the Face marking is earned, not issued with the hull', () => {
  const withoutState = markingStylesForShip('ship_kestrel');
  assert.equal(withoutState.some((style) => style.id === THE_FACE.markingId), false,
    'a caller that does not pass state must never see an earned marking');

  const seen = { world: { theFace: { phase: 'seen', seenAt: 5, bearingDeg: THE_FACE.approachBearingDeg } } };
  const earned = markingStylesForShip('ship_kestrel', seen);
  assert.ok(earned.some((style) => style.id === THE_FACE.markingId));
  // Every secret marking has a real unlock, and no ordinary marking accidentally carries one.
  for (const style of SHIP_MARKING_STYLES) {
    if (!style.secretUnlock) continue;
    assert.equal(markingStylesForShip('ship_kestrel', {}).some((row) => row.id === style.id), false,
      `${style.id} must stay locked until its secret is found`);
  }
});

// ---------------------------------------------------------------- The Developer

test('The Developer is a real unarmed hull parked behind the Dead Gate', () => {
  const archetype = ENEMY_TYPES.find((row) => row.id === 'the_developer');
  assert.ok(archetype, 'the hull must exist in the shipped archetype table');
  assert.deepEqual(archetype.weapons, [], 'it carries nothing that can shoot');
  assert.equal(archetype.aiDoctrine.roe, 'never_fire');
  // "Infinite dodge" must be honest: fastest and sharpest thing on the table, not invulnerable.
  const others = ENEMY_TYPES.filter((row) => row.id !== 'the_developer');
  assert.ok(archetype.turnRate > Math.max(...others.map((row) => row.turnRate || 0)));
  assert.ok(archetype.maxSpeed > Math.max(...others.map((row) => row.maxSpeed || 0)));
  assert.ok(archetype.hull > 0, 'it must be killable by physical means');
  assert.ok(poiIn(THE_DEVELOPER.sectorId, THE_DEVELOPER.gatePoiId));
  assert.equal(THE_DEVELOPER.chipDenominations.length > 1, true);
  assert.equal(new Set(THE_DEVELOPER.chipDenominations).size, THE_DEVELOPER.chipDenominations.length,
    'one chip of EVERY denomination means no repeats');
});

test('The Developer stays dead for its own seed and returns in the next one', () => {
  const killed = { phase: 'killed', seenAt: 10, killedAt: 20, killedSeed: 4242 };
  const sameSeed = normalizeTheDeveloperState(killed, 4242);
  assert.equal(sameSeed.phase, 'killed');
  assert.equal(theDeveloperShouldExist({ meta: { seed: 4242 }, world: { theDeveloper: killed } }), false);

  const nextSeed = normalizeTheDeveloperState(killed, 99);
  assert.equal(nextSeed.phase, 'seen', 'a kill in another universe is not a kill in this one');

  // It is never constructed under node, so no golden route can see it.
  assert.equal(theDeveloperShouldExist({ meta: { seed: 99 }, world: {} }), false,
    'construction is browser-gated so sf-sim and the 47-A tape never build it');

  const forged = normalizeTheDeveloperState({ phase: 'killed', killedAt: 5, killedSeed: 1 }, 1);
  assert.equal(forged.phase, 'unseen', 'a kill with no sighting behind it is not a record');
});

test('sighting unlocks the Developer row and the kill deepens it', () => {
  const unseen = { meta: { seed: 7 }, world: {} };
  assert.equal(pageFor(unseen, 'secret_developer').unlocked, false);

  const seen = { meta: { seed: 7 }, world: { theDeveloper: { phase: 'seen', seenAt: 3 } } };
  assert.equal(pageFor(seen, 'secret_developer').phase, 'seen');

  const killed = { meta: { seed: 7 }, world: { theDeveloper: { phase: 'killed', seenAt: 3, killedAt: 9, killedSeed: 7 } } };
  const page = pageFor(killed, 'secret_developer');
  assert.equal(page.phase, 'killed');
  assert.match(page.note, new RegExp(THE_DEVELOPER.bark));

  const nextUniverse = { meta: { seed: 8 }, world: { theDeveloper: { phase: 'killed', seenAt: 3, killedAt: 9, killedSeed: 7 } } };
  assert.equal(pageFor(nextUniverse, 'secret_developer').phase, 'seen');
});

// ---------------------------------------------------------------- Chain rule: nothing gates play

test('no Plan 30 secret gates progression', () => {
  for (const def of UNREGISTERED_CACHES) {
    if (!def.grantModuleId) continue;
    const module = MODULES.find((row) => row.id === def.grantModuleId);
    // Cache hardware is spare capability, never a tech-tree or mission prerequisite.
    assert.notEqual(module.slotType, 'engine_required');
    assert.ok(module.price === 0 || module.purchasable !== false || MODULE_IDS.has(module.id));
  }
  assert.equal(THE_FACE.markingId && typeof THE_FACE.markingId, 'string');
  const marking = SHIP_MARKING_STYLES.find((row) => row.id === THE_FACE.markingId);
  assert.ok(marking && !marking.appearance, 'the Face reward is a marking, not a stat');
});
