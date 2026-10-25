// zc-a34 — build_map §33 row 485 "Arenas that scale with you": the four-tier swarm arena
// ladder (pebble field → boulder belt → giant-rock graveyard → derelict-station yard).
//
//   * tiers defined and ordered, cumulative composition, ≥3 newly-movable throwables per step
//   * every asset id the ladder references exists in the model-truth census — no new commissions
//   * wave-band / Line-rating gating is monotone and tied to the landed lineRating thresholds
//   * the wave-1 pebble field guarantees ≥3 throwables within the tuned spawn-fly radius
//   * the tier layouts are consumable by the existing planner (planSwarmDebris)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SWARM_ARENA_LADDER,
  swarmArenaTierByStep,
  swarmArenaTierByWave,
  swarmArenaTierByRating,
  swarmArenaTierForRun,
  swarmArenaDebrisLayout,
  swarmArenaTierCensusIds,
  swarmArenaTierRatingFacts,
  planOpeningThrowables,
  validateSwarmArenaLadder,
  OPENING_POCKET_FLY_WU,
  OPENING_THROWABLE_MIN,
  OPENING_THROWABLE_SPOTS,
} from '../src/data/swarmArenaLadder.js';
import {
  LINE_RATING_THRESHOLDS_T,
  LINE_THROW_CLASSES,
  LINE_THROW_RADIUS_MAX,
  lineCameraOpen,
  lineTierForRating,
  lineThrowTierForBody,
} from '../src/data/lineRating.js';
import { ROCK_BODIES } from '../src/data/rockSubstances.js';
import { WRECK_AFTERMATH_MODELS } from '../src/data/wreckAftermathDressing.js';
import { planSwarmDebris } from '../src/systems/swarmArena.js';
import { mulberry32 } from '../src/core/rng.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const census = JSON.parse(readFileSync(resolve(ROOT, 'src/data/modelTruthCensus.json'), 'utf8'));
const censusIds = new Set(census.rows.map((row) => row.id));
const rockBodyIds = new Set(ROCK_BODIES.map((body) => body.id));
const wreckModelIds = new Set(WRECK_AFTERMATH_MODELS.map((model) => model.id));

test('zc-a34: four tiers defined and ordered, each a real authored room', () => {
  assert.equal(SWARM_ARENA_LADDER.length, 4, 'pebble field → boulder belt → graveyard → derelict yard');
  const expected = ['pebble_field', 'boulder_belt', 'rock_graveyard', 'derelict_yard'];
  assert.deepEqual(SWARM_ARENA_LADDER.map((t) => t.id), expected);
  let prevStep = 0;
  for (const tier of SWARM_ARENA_LADDER) {
    assert.equal(tier.step, prevStep + 1, `${tier.id} is step ${prevStep + 1}`);
    assert.ok(tier.name && tier.note, `${tier.id} is named and annotated`);
    assert.ok(tier.debris && tier.debris.id, `${tier.id} carries a debris layout`);
    assert.ok(tier.newlyMovableVisibleMin >= 3, `${tier.id} keeps ≥3 newly-movable throwables visible`);
    prevStep = tier.step;
  }
  assert.equal(swarmArenaTierByStep(1).id, 'pebble_field');
  assert.equal(swarmArenaTierByStep(4).id, 'derelict_yard');
  assert.equal(swarmArenaTierByStep(0), null);
  assert.equal(swarmArenaTierByStep(5), null);
});

test('zc-a34: composition climbs the mass-class ladder cumulatively', () => {
  for (const tier of SWARM_ARENA_LADDER) {
    const facts = swarmArenaTierRatingFacts(tier);
    assert.equal(tier.capClass, LINE_THROW_CLASSES[tier.ratingTierMin],
      `${tier.id} cap class is the landed class for tier ${tier.ratingTierMin}`);
    // The cap-class body really does need exactly this Line tier to move.
    assert.equal(lineThrowTierForBody({ radius: facts.capRadiusWu }), tier.ratingTierMin,
      `${tier.id} cap radius ${facts.capRadiusWu} needs tier ${tier.ratingTierMin}`);
    // Composition is cumulative: every class at or under the cap stays on screen.
    assert.deepEqual(tier.compositionClasses, LINE_THROW_CLASSES.slice(0, tier.ratingTierMin + 1),
      `${tier.id} composition is cumulative`);
    // The size band ends exactly on the cap class radius — the room's edge is the Line's edge.
    assert.equal(tier.debris.sizeMaxWu, LINE_THROW_RADIUS_MAX[tier.ratingTierMin]);
    assert.ok(tier.debris.sizeMinWu > 0 && tier.debris.sizeMinWu < tier.debris.sizeMaxWu);
    // Each step keeps ≥3 of the newly-movable class: the target can hold them.
    assert.ok(tier.debris.target >= tier.newlyMovableVisibleMin);
  }
  // The mass class actually climbs: no two tiers share a cap class.
  const caps = SWARM_ARENA_LADDER.map((t) => t.capClass);
  assert.equal(new Set(caps).size, 4, 'each tier raises the room\'s mass class');
});

test('zc-a34: wave-band and Line-rating gating is monotone and tied to the landed thresholds', () => {
  let prevWave = -Infinity;
  let prevRating = -Infinity;
  for (const tier of SWARM_ARENA_LADDER) {
    assert.ok(tier.waveMin > prevWave, `${tier.id} wave band does not regress`);
    assert.ok(tier.lineRatingMinT > prevRating, `${tier.id} rating gate does not regress`);
    // The gate IS the landed threshold for the tier — one designer (lineRating.js).
    assert.equal(tier.lineRatingMinT, LINE_RATING_THRESHOLDS_T[tier.ratingTierMin],
      `${tier.id} gate must be the landed Line threshold`);
    assert.equal(lineTierForRating(tier.lineRatingMinT), tier.ratingTierMin);
    prevWave = tier.waveMin;
    prevRating = tier.lineRatingMinT;
  }
  // Band floors: wave 1–3 pebble, 4–6 boulder, 7–9 graveyard, 10+ derelict yard.
  assert.equal(swarmArenaTierByWave(1).id, 'pebble_field');
  assert.equal(swarmArenaTierByWave(3).id, 'pebble_field');
  assert.equal(swarmArenaTierByWave(4).id, 'boulder_belt');
  assert.equal(swarmArenaTierByWave(6).id, 'boulder_belt');
  assert.equal(swarmArenaTierByWave(7).id, 'rock_graveyard');
  assert.equal(swarmArenaTierByWave(9).id, 'rock_graveyard');
  assert.equal(swarmArenaTierByWave(10).id, 'derelict_yard');
  assert.equal(swarmArenaTierByWave(60).id, 'derelict_yard');
  // Rating gates: 0 t pebble, 25 t boulder, 80 t graveyard, 180 t derelict yard.
  assert.equal(swarmArenaTierByRating(0).id, 'pebble_field');
  assert.equal(swarmArenaTierByRating(24.9).id, 'pebble_field');
  assert.equal(swarmArenaTierByRating(25).id, 'boulder_belt');
  assert.equal(swarmArenaTierByRating(80).id, 'rock_graveyard');
  assert.equal(swarmArenaTierByRating(179.9).id, 'rock_graveyard');
  assert.equal(swarmArenaTierByRating(180).id, 'derelict_yard');
  assert.equal(swarmArenaTierByRating(50000).id, 'derelict_yard');
  // Selection is monotone in both axes and takes the deeper rung either axis unlocks.
  for (let wave = 1; wave <= 40; wave++) {
    assert.ok(swarmArenaTierByWave(wave).step >= swarmArenaTierByWave(wave - 1).step,
      `wave ${wave} regressed the ladder`);
  }
  for (const rating of [0, 10, 24, 25, 50, 80, 100, 180, 400, 2000, 50000]) {
    assert.ok(swarmArenaTierByRating(rating).step >= swarmArenaTierByRating(rating - 1).step,
      `rating ${rating} regressed the ladder`);
  }
  assert.equal(swarmArenaTierForRun({ wave: 1, ratingT: 0 }).id, 'pebble_field');
  assert.equal(swarmArenaTierForRun({ wave: 2, ratingT: 300 }).id, 'derelict_yard',
    'a heavy line opens the room early');
  assert.equal(swarmArenaTierForRun({ wave: 12, ratingT: 0 }).id, 'derelict_yard',
    'the wave band guarantees the climb for a light line');
  assert.equal(swarmArenaTierForRun({ wave: 5, ratingT: 90 }).id, 'rock_graveyard');
});

test('zc-a34: every referenced asset id exists — rocks, bodies, wrecks, places (no commissions)', () => {
  const result = validateSwarmArenaLadder(censusIds, { rockBodyIds, wreckModelIds });
  assert.deepEqual(result.issues, [], `ladder references unknown assets: ${JSON.stringify(result.issues)}`);
  assert.equal(result.ok, true);
  // And the flat helper agrees with the census universe.
  for (const tier of SWARM_ARENA_LADDER) {
    for (const id of swarmArenaTierCensusIds(tier)) {
      assert.ok(censusIds.has(id), `${id} on ${tier.id} is in the model census`);
    }
    for (const id of tier.bodyIds) {
      assert.ok(rockBodyIds.has(id), `${id} on ${tier.id} is a ROCK_BODIES substance body`);
    }
    for (const stem of tier.wreckStems || []) {
      assert.ok(wreckModelIds.has(`place_aftermath_${stem}`), `${stem} on ${tier.id} is a wreck-aftermath body`);
    }
  }
  // Visual families are reused, not new: rock types come from the six census asteroids,
  // the yard's dressing from the wreck-aftermath pack and the dead-hulk place.
  const rockTypes = new Set(SWARM_ARENA_LADDER.flatMap((t) => [...t.rockTypeIds]));
  for (const id of rockTypes) {
    const row = census.rows.find((r) => r.id === id);
    assert.ok(row && row.family === 'rock', `${id} is a census rock-family asteroid`);
  }
  for (const id of SWARM_ARENA_LADDER[3].placeIds) {
    const row = census.rows.find((r) => r.id === id);
    assert.ok(row && (row.family === 'wreck' || row.id === 'place_dead_hulk'),
      `${id} is an existing wreck-family/dead-hulk asset`);
  }
});

test('zc-a34: wave-1 pebble field guarantees ≥3 throwables within the tuned spawn-fly radius', () => {
  const tier = SWARM_ARENA_LADDER[0];
  const facts = swarmArenaTierRatingFacts(tier);
  assert.equal(facts.capClass, 'pebble');
  assert.equal(lineThrowTierForBody({ radius: facts.capRadiusWu }), 0,
    'the wave-1 throwable is movable on a bare T0 line');
  // Fly radius stays a short hop and inside the standard massline's reach.
  assert.ok(OPENING_POCKET_FLY_WU <= 390, 'the pocket is inside the 390 wu massline reach');
  // The bare pocket: every heading and a spread of anchors places the authored spots.
  for (const headingRad of [0, 0.7, 1.9, 3.14, 5.5]) {
    for (const anchor of [{ x: 0, z: 0 }, { x: -2400, z: 1800 }, { x: 990, z: -990 }]) {
      const plan = planOpeningThrowables({ anchor, headingRad, tier });
      const inPocket = plan.filter((p) => Math.hypot(p.x - anchor.x, p.z - anchor.z) <= OPENING_POCKET_FLY_WU);
      assert.ok(inPocket.length >= OPENING_THROWABLE_MIN,
        `heading ${headingRad} anchor ${JSON.stringify(anchor)} placed ${inPocket.length} throwables`);
      const near = plan.filter((p) => Math.hypot(p.x - anchor.x, p.z - anchor.z) <= 200);
      assert.ok(near.length >= 3, 'three throwables sit within ~200 wu — the first throw is unmissable');
      for (const p of plan) {
        assert.equal(p.sizeClass, 'pebble');
        assert.equal(p.radiusWu, facts.capRadiusWu);
        assert.ok(Math.hypot(p.x - anchor.x, p.z - anchor.z) <= OPENING_POCKET_FLY_WU + 1e-6,
          'no opening throwable escapes the pocket');
      }
    }
  }
  // Determinism: same inputs, same rocks.
  const a = planOpeningThrowables({ anchor: { x: 10, z: -4 }, headingRad: 2, tier });
  const b = planOpeningThrowables({ anchor: { x: 10, z: -4 }, headingRad: 2, tier });
  assert.deepEqual(a, b);
  // Blocked spots nudge outward or skip; the ≥3 pocket guarantee survives two blockers.
  const blocked = planOpeningThrowables({
    anchor: { x: 0, z: 0 },
    headingRad: 0,
    tier,
    existing: [
      { x: 120, z: 0, radius: 30 },
      { x: 150 * Math.cos(2.2), z: 150 * Math.sin(2.2), radius: 24 },
    ],
  });
  const inPocket = blocked.filter((p) => Math.hypot(p.x, p.z) <= OPENING_POCKET_FLY_WU);
  assert.ok(inPocket.length >= OPENING_THROWABLE_MIN,
    `two blocked spots still leave ${inPocket.length} throwables`);
  for (const p of blocked) {
    for (const s of [{ x: 120, z: 0, radius: 30 }, { x: 150 * Math.cos(2.2), z: 150 * Math.sin(2.2), radius: 24 }]) {
      const gap = Math.hypot(p.x - s.x, p.z - s.z);
      assert.ok(gap >= p.radiusWu + s.radius,
        `placed throwable keeps surface clearance (${gap.toFixed(1)} wu)`);
    }
  }
  // The authored spots themselves: five for a three-guarantee margin, three inside ~185 wu.
  assert.equal(OPENING_THROWABLE_SPOTS.length, 5);
  assert.ok(OPENING_THROWABLE_SPOTS.filter((s) => s.radiusWu <= 200).length >= 3);
});

test('zc-a34: every tier\'s first wave places its newly-movable pocket', () => {
  for (const tier of SWARM_ARENA_LADDER) {
    const plan = planOpeningThrowables({ anchor: { x: 0, z: 0 }, headingRad: 0.9, tier });
    assert.ok(plan.length >= OPENING_THROWABLE_MIN,
      `${tier.id} opening places ${plan.length} < ${OPENING_THROWABLE_MIN}`);
    for (const p of plan) {
      assert.equal(p.sizeClass, tier.capClass, `${tier.id} opening bodies are ${tier.capClass}-class`);
      assert.equal(p.radiusWu, LINE_THROW_RADIUS_MAX[tier.ratingTierMin]);
      assert.ok(Math.hypot(p.x, p.z) <= OPENING_POCKET_FLY_WU + 1e-6, `${tier.id} pocket holds`);
    }
    // With two blockers the margin still covers the guarantee.
    const blocked = planOpeningThrowables({
      anchor: { x: 0, z: 0 }, headingRad: 0.9, tier,
      existing: [{ x: 100, z: 10, radius: 40 }, { x: -60, z: -80, radius: 36 }],
    });
    assert.ok(blocked.length >= OPENING_THROWABLE_MIN, `${tier.id} survives two blocked spots`);
  }
});

test('zc-a34: tier debris layouts are consumable by the existing planner (planSwarmDebris)', () => {
  for (const tier of SWARM_ARENA_LADDER) {
    const layout = swarmArenaDebrisLayout(tier);
    assert.ok(layout, `${tier.id} has a layout`);
    // The existing planner accepts the record verbatim and fills the target inside the band.
    const rng = mulberry32(20261023);
    const spots = planSwarmDebris({ anchor: { x: 0, z: 0 }, existing: [], want: layout.target, rng, layout });
    assert.equal(spots.length, layout.target, `${tier.id} layout fills its target through planSwarmDebris`);
    for (const spot of spots) {
      assert.equal(spot.layoutId, layout.id, `${tier.id} spots carry the tier layout id`);
      const dist = Math.hypot(spot.x, spot.z);
      assert.ok(dist >= layout.safeRadius, `${tier.id} rock respects the safe radius`);
      assert.ok(dist <= layout.outer + layout.separation + 44,
        `${tier.id} rock stays inside the band`);
    }
    // The band itself climbs with the tier (the room widens; LINE_ARENA_SCALE_BY_TIER).
    const facts = swarmArenaTierRatingFacts(tier);
    assert.ok(facts.arenaRadiusScale >= 1, `${tier.id} arena scale is the landed table value`);
  }
  // Bands widen monotonically with the step.
  for (let i = 1; i < SWARM_ARENA_LADDER.length; i++) {
    const prev = swarmArenaDebrisLayout(SWARM_ARENA_LADDER[i - 1]);
    const cur = swarmArenaDebrisLayout(SWARM_ARENA_LADDER[i]);
    assert.ok(cur.outer > prev.outer, 'the room widens with each scale step');
    assert.ok(cur.target >= prev.target, 'the field count does not shrink');
  }
});

test('zc-a34: the camera open rides the rating tier (row 485 seam, reused not re-authored)', () => {
  let prevOpen = -Infinity;
  for (const tier of SWARM_ARENA_LADDER) {
    const facts = swarmArenaTierRatingFacts(tier);
    assert.equal(facts.cameraOpenBias, lineCameraOpen(tier.ratingTierMin),
      `${tier.id} camera open is the landed per-tier value`);
    assert.ok(facts.cameraOpenBias >= prevOpen, `${tier.id} camera open does not narrow`);
    prevOpen = facts.cameraOpenBias;
  }
  assert.equal(swarmArenaTierRatingFacts(SWARM_ARENA_LADDER[0]).cameraOpenBias, 0,
    'tier 0 does not open the frame');
  assert.ok(swarmArenaTierRatingFacts(SWARM_ARENA_LADDER[3]).cameraOpenBias > 0,
    'the derelict yard opens the frame');
});
