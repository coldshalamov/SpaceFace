// Massline rung 14 acceptance check: tether:whipImpact produces player-facing feedback through the
// existing presentation pipeline AND (flag-gated) routes damage through the combat kernel.
//
// This is the consume half of rung 13's emit, in two halves:
//   • Feedback (unconditional): presentationOrchestrator subscribes to tether:whipImpact (sibling
//     of the massline:threat wiring), maps it to the 'tether.whip_impact' cue with
//     severity -> magnitude, rating + latched/slung riding the tags, and the STRUCK BODY as the
//     cue target. Adapters fan it out to an audio crack + non-diegetic HUD readout + caption.
//   • Damage (combat.whipDamage flag, OFF in the node golden / ON in the browser): combat.js
//     routes momentum-scaled kinetic damage to the struck body through the kernel
//     (scalarHitToDamagePacket -> routeDamage) — single-writer discipline, never direct hp.
//     Only solid/crushing ratings hurt; glances are feedback-only.
//
// Same harness shape as check-massline-threat-feedback.mjs, plus a combat harness with a mock
// kernel recording routeDamage calls (proving the kernel path, not direct mutation).
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { presentationOrchestrator } from '../src/systems/presentationOrchestrator.js';
import { presentationAdapters } from '../src/systems/presentationAdapters.js';
import { masslineImpacts } from '../src/systems/masslineImpacts.js';
import { combat } from '../src/systems/combat.js';
import { createGameState } from '../src/core/gameState.js';
import { COMBAT_FLAGS } from '../src/data/featureFlags.js';
import { PRESENTATION_RECIPES, validatePresentationRecipes } from '../src/presentation/cueRecipes.js';

// Sanity: the whip recipe exists and the whole recipe table still validates.
const recipeReport = validatePresentationRecipes();
assert(recipeReport.ok, `presentation recipes must validate: ${recipeReport.issues.join('; ')}`);
assert.ok(PRESENTATION_RECIPES['tether.whip_impact'], 'recipe tether.whip_impact must exist');

assertWhipEmitsPlayerFacingCue();
assertFamilyFloorRaisesWithoutClobbering();
assertSeverityScalesMagnitude();
assertRatingAndSlingRideTags();
assertDedupeSuppressesRepeat();
assertEndToEndFromRealObserver();
assertDamageRoutesThroughKernel();
assertDamageCapAndGates();

console.log('Massline whip feedback checks OK');

// 1. A tether:whipImpact emit fires exactly one presentation:cue mapped to tether.whip_impact with
//    the STRUCK BODY as target, and the adapters produce the full player-facing fan-out.
function assertWhipEmitsPlayerFacingCue() {
  const h = createFeedbackHarness();
  emitWhip(h, { targetId: 2, victimId: 3, severity: 0.7, rating: 'solid', slung: false });

  assert.equal(h.cues.length, 1, 'whip must emit exactly one presentation:cue');
  assert.equal(h.cues[0].id, 'tether.whip_impact', 'whip must map to the tether.whip_impact cue');
  assert.equal(h.cues[0].targetId, 3, 'cue target must be the struck body (victimId)');
  assert.equal(h.cues[0].sourceId, 2, 'cue source must be the whipped mass (targetId)');
  assert.equal(h.alerts.length, 1, 'whip must emit exactly one UI alert (no double-toast)');
  assert.equal(h.alerts[0].sev, 'info', 'whip alert reads as a payoff (info), not a warning');
  assert.equal(h.audioCues.length, 1, 'whip must emit an audio crack');
  assert.equal(h.vfxCues.length, 1, 'whip must emit a vfx cue');
  assert.equal(h.captions.length, 1, 'whip must emit an accessibility caption');
}

// 1b. The orchestrator declares a player-relevance FLOOR on this cue family. Both halves of that
//     word are asserted here, because the obvious "just declare 1" fix breaks the second one:
//       - it RAISES a bare payload (neither entity id is the player -> inferRelevance gives 0.52,
//         below presentationAdapters' PLAYER_LANE_RELEVANCE_FLOOR of 0.8) so the payoff moment of
//         the whole swing still reaches the HUD, the caption and the camera; and
//       - it never LOWERS a relevance the emitter or identity inference already earned, so the
//         genuine "the slung mass hit ME" case keeps its 1.0 and its assertive caption.
function assertFamilyFloorRaisesWithoutClobbering() {
  // Raises: bare payload, no playerRelevance stated, no player entity at either end.
  const bare = createFeedbackHarness();
  bare.state.tick += 20;
  bare.bus.emit('tether:whipImpact', {
    targetId: 2, victimId: 3, relSpeed: 60, massSpeed: 60, mass: 640,
    momentum: 640 * 60, slung: false, severity: 0.7, rating: 'solid',
  });
  bare.bus.flush();
  assert.equal(bare.cues.length, 1, 'a bare whip payload must still produce one presentation:cue');
  assert.ok(bare.cues[0].playerRelevance >= 0.8,
    `massline impacts must clear the player-lane floor; got ${bare.cues[0].playerRelevance}`);
  assert.equal(bare.alerts.length, 1, 'a bare whip payload must still reach the HUD');
  assert.equal(bare.captions[0].assertive, false,
    'the floor must not promote a payoff cue past the 0.9 assertive bar');

  // Does not clobber: the player is the struck body, which inferRelevance rates 1.0.
  const struck = createFeedbackHarness();
  struck.state.tick += 20;
  struck.bus.emit('tether:whipImpact', {
    targetId: 2, victimId: struck.state.playerId, relSpeed: 60, massSpeed: 60, mass: 640,
    momentum: 640 * 60, slung: false, severity: 0.7, rating: 'solid',
  });
  struck.bus.flush();
  assert.equal(struck.cues.length, 1, 'a whip that hits the player must produce one presentation:cue');
  assert.equal(struck.cues[0].playerRelevance, 1,
    'being hit is addressed TO the player; the floor must not lower it to 0.88');
  assert.equal(struck.captions[0].assertive, true,
    'a mass slung into the player is the one whip case that should interrupt');
}

// 2. Severity drives the cue magnitude: a crushing whip reads stronger than a glancing one.
function assertSeverityScalesMagnitude() {
  const mild = createFeedbackHarness();
  emitWhip(mild, { severity: 0.3, rating: 'glance' });
  const hot = createFeedbackHarness();
  emitWhip(hot, { severity: 1.0, rating: 'crushing' });

  const mildMag = mild.vfxCues[0] && mild.vfxCues[0].magnitude;
  const hotMag = hot.vfxCues[0] && hot.vfxCues[0].magnitude;
  assert.ok(Number.isFinite(mildMag) && Number.isFinite(hotMag), 'vfx cues must carry magnitude');
  assert.ok(hotMag > mildMag, `severity must scale magnitude; hot=${hotMag} mild=${mildMag}`);
}

// 3. The impact rating and latched/slung distinction ride the cue tags for downstream flavor.
function assertRatingAndSlingRideTags() {
  const latched = createFeedbackHarness();
  emitWhip(latched, { rating: 'crushing', slung: false });
  assert.ok(latched.cues[0].tags.includes('crushing'),
    `cue tags must carry the rating; got ${JSON.stringify(latched.cues[0].tags)}`);
  assert.ok(latched.cues[0].tags.includes('latched'), 'an on-line whip must tag latched');
  assert.ok(latched.cues[0].tags.includes('whip'), 'cue tags must carry the whip marker');

  const slung = createFeedbackHarness();
  emitWhip(slung, { rating: 'solid', slung: true });
  assert.ok(slung.cues[0].tags.includes('slung'), 'a post-release whip must tag slung');
}

// 4. The same impact repeated inside the dedupe window is suppressed (anti-spam is the
//    orchestrator's job; the sibling massline.threat behaves the same way).
function assertDedupeSuppressesRepeat() {
  const h = createFeedbackHarness();
  emitWhip(h, { targetId: 2, victimId: 3, severity: 0.7, rating: 'solid' });
  h.state.tick += 2; // inside dedupeWindowTicks (10)
  h.bus.emit('tether:whipImpact', whipPayload(h, { targetId: 2, victimId: 3, severity: 0.7, rating: 'solid' }));
  h.bus.flush();

  assert.equal(h.cues.length, 1, 'repeat whip inside the dedupe window must not double-cue');
  assert.ok(h.suppressed.some((s) => s.id === 'tether.whip_impact' && s.reason === 'dedupe_window'),
    'the repeat must be reported as dedupe_window suppressed');
}

// 5. End-to-end: the REAL rung-13 observer detects an impact from seeded tether state and its emit
//    lands as a player-facing cue through the same bus — no mock between emit and consume.
function assertEndToEndFromRealObserver() {
  const h = createFeedbackHarness();
  const impacts = Object.create(masslineImpacts);
  impacts.init({ state: h.state, bus: h.bus, helpers: {} });

  // Latched mass moving at 60 wu/s already overlapping a rock: the impact fires on this update.
  h.state.mode = 'flight';
  h.state.player = { tether: { active: true, targetId: 2, strain: 0.4, load: 0.8, phase: 'loaded' } };
  h.state.entities.get(2).vel = { x: 0, z: 60 };
  h.state.entities.set(3, { id: 3, type: 'asteroid', alive: true, pos: { x: 100, z: 10 }, vel: { x: 0, z: 0 }, radius: 11, mass: 640 });
  h.state.tick += 20;
  impacts.update(1 / 60, h.state);
  h.bus.flush();

  assert.equal(h.cues.length, 1, 'observer-detected impact must produce a presentation:cue');
  assert.equal(h.cues[0].id, 'tether.whip_impact', 'end-to-end cue must be tether.whip_impact');
  assert.equal(h.cues[0].targetId, 3, 'end-to-end cue must target the struck rock');
  assert.equal(h.alerts.length, 1, 'end-to-end impact must reach the HUD as one alert');
}

// 6. Damage half: with the flag on, a solid whip on a damageable body routes EXACTLY through the
//    kernel (the mock is the only mutator) with the momentum-scaled kinetic packet and the
//    friendly-fire flags matching impulse-charge blasts. Attacker is the player (kill credit).
function assertDamageRoutesThroughKernel() {
  const h = createCombatHarness();
  withFlag(true, () => {
    h.bus.emit('tether:whipImpact', {
      targetId: 20, victimId: 30, relSpeed: 60, massSpeed: 60, mass: 640,
      momentum: 640 * 60, slung: false, severity: 60 / 95, rating: 'solid', tick: h.state.tick, time: 1,
    });
  });

  assert.equal(h.routed.length, 1, `solid whip with flag on must route damage once; got ${h.routed.length}`);
  const req = h.routed[0];
  assert.equal(req.targetId, 30, 'damage must target the struck body');
  assert.equal(req.attackerId, h.state.playerId, 'the whip is the player\'s hit (kill credit)');
  assert.equal(req.origin && req.origin.kind, 'massline_whip', 'origin must name the whip');
  assert.ok(Math.abs(req.packet.channels.kinetic - 24) < 1e-9,
    `640×60 momentum at 1/1600 scale must land 24 kinetic; got ${req.packet.channels.kinetic}`);
  assert.equal(req.packet.flags && req.packet.flags.ignoreFriendlyFire, true,
    'whip damage is physical — friendly fire on, like impulse-charge blasts');
  const hull = h.state.entities.get(30);
  assert.deepEqual({ x: hull.pos.x, z: hull.pos.z },
    { x: req.packet.hit.pos.x, z: req.packet.hit.pos.z }, 'the hit position must be the victim');
}

// 7. Gates: the damage cap holds; glances, non-damageable victims, and the flag-off default
//    (the node golden) never touch the kernel.
function assertDamageCapAndGates() {
  const cap = createCombatHarness();
  withFlag(true, () => {
    cap.bus.emit('tether:whipImpact', whipDamagePayload({ victimId: 30, momentum: 1e6, rating: 'crushing' }));
  });
  assert.equal(cap.routed.length, 1, 'a crushing whip must route damage');
  assert.ok(Math.abs(cap.routed[0].packet.channels.kinetic - 45) < 1e-9,
    `whip damage must cap at 45; got ${cap.routed[0].packet.channels.kinetic}`);

  const glance = createCombatHarness();
  withFlag(true, () => {
    glance.bus.emit('tether:whipImpact', whipDamagePayload({ victimId: 30, momentum: 640 * 30, rating: 'glance' }));
  });
  assert.equal(glance.routed.length, 0, 'a glance is feedback-only — no damage');

  const rock = createCombatHarness();
  withFlag(true, () => {
    rock.bus.emit('tether:whipImpact', whipDamagePayload({ victimId: 31, momentum: 640 * 60, rating: 'solid' }));
  });
  assert.equal(rock.routed.length, 0, 'an asteroid victim takes no hull damage');

  const off = createCombatHarness();
  withFlag(false, () => {
    off.bus.emit('tether:whipImpact', whipDamagePayload({ victimId: 30, momentum: 640 * 60, rating: 'solid' }));
  });
  assert.equal(off.routed.length, 0, 'flag off (the node-golden default) must never route damage');
}

// ---- feedback harness (mirrors check-massline-threat-feedback.mjs) ----

function createFeedbackHarness() {
  const bus = createBus();
  const state = {
    tick: 1,
    simTime: 1 / 60,
    playerId: 1,
    entities: new Map([
      [1, { id: 1, type: 'ship', alive: true, team: 'player', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 6 }],
      [2, { id: 2, type: 'asteroid', alive: true, pos: { x: 100, z: 0 }, vel: { x: 0, z: 0 }, radius: 11, mass: 640 }],
    ]),
    settings: {
      video: { motionReduce: false },
      accessibility: { flashReduce: false },
    },
  };
  const ctx = { state, bus, helpers: {} };

  const orchestrator = Object.create(presentationOrchestrator);
  orchestrator.init(ctx);
  const adapters = Object.create(presentationAdapters);
  adapters.init(ctx);

  const harness = {
    state, bus, orchestrator, adapters,
    cues: [], alerts: [], audioCues: [], vfxCues: [], captions: [], suppressed: [],
  };
  bus.on('presentation:cue', (p) => harness.cues.push(p));
  bus.on('alert', (p) => harness.alerts.push(p));
  bus.on('audio:cue', (p) => harness.audioCues.push(p));
  bus.on('presentation:vfxCue', (p) => harness.vfxCues.push(p));
  bus.on('presentation:caption', (p) => harness.captions.push(p));
  bus.on('presentation:cueSuppressed', (p) => harness.suppressed.push(p));
  return harness;
}

function whipPayload(harness, overrides) {
  return {
    targetId: 2,
    victimId: 3,
    relSpeed: 60,
    massSpeed: 60,
    mass: 640,
    momentum: 640 * 60,
    slung: false,
    // Mirrors masslineImpacts._emitWhipImpact exactly. Neither end of this event is the player —
    // the cue targets the struck body and sources the whipped mass — so cueSchema.inferRelevance
    // has nothing to key on and falls to the distance table's 0.52, below presentationAdapters'
    // PLAYER_LANE_RELEVANCE_FLOOR of 0.8. The observer states 0.88 ("the player is the source")
    // because every impact it reports is the player's own whip. Deliberately not 1.0: that crosses
    // the 0.9 assertive bar in _applyAccessibility and would make a payoff cue interrupt real
    // warnings. Omitting it here left the harness asserting against a payload production never sends.
    playerRelevance: 0.88,
    severity: 0.7,
    rating: 'solid',
    tick: harness.state.tick,
    time: harness.state.tick / 60,
    ...overrides,
  };
}

function emitWhip(harness, overrides) {
  harness.state.tick += 20; // clear any prior dedupe window between distinct emits
  harness.bus.emit('tether:whipImpact', whipPayload(harness, overrides));
  // presentation:cue is queued (deferred) by the orchestrator; flush dispatches it to adapters.
  harness.bus.flush();
}

// ---- combat harness (real combat system + mock kernel recording routeDamage) ----

function createCombatHarness() {
  const bus = createBus();
  const state = createGameState(0x5a);
  state.mode = 'flight';
  state.tick = 100;
  state.simTime = state.tick / 60;
  state.playerId = 1;
  state.entities.clear();
  state.entities.set(1, { id: 1, type: 'ship', alive: true, team: 'player', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 6 });
  state.entities.set(20, { id: 20, type: 'asteroid', alive: true, pos: { x: 100, z: 0 }, vel: { x: 0, z: 60 }, radius: 11, mass: 640 });
  state.entities.set(30, { id: 30, type: 'ship', alive: true, team: 'pirate', pos: { x: 100, z: 60 }, vel: { x: 0, z: 0 }, radius: 8, hull: 100 });
  state.entities.set(31, { id: 31, type: 'asteroid', alive: true, pos: { x: 100, z: 90 }, vel: { x: 0, z: 0 }, radius: 11, mass: 640 });

  const combatSys = Object.create(combat);
  combatSys.init({ state, bus, helpers: {}, registry: null });

  const routed = [];
  // The mock kernel is the ONLY damage sink: if onWhipImpact bypassed routeDamage (direct hp
  // writes), routed stays empty and the assertions above fail.
  combatSys.kernel = {
    routeDamage(request) {
      routed.push(request);
      return { ok: true, attackerId: request.attackerId };
    },
  };
  return { state, bus, combatSys, routed };
}

function whipDamagePayload(overrides) {
  return {
    targetId: 20, victimId: 30, relSpeed: 60, massSpeed: 60, mass: 640,
    momentum: 640 * 60, slung: false, severity: 0.6, rating: 'solid', tick: 100, time: 1,
    ...overrides,
  };
}

function withFlag(value, fn) {
  const prior = COMBAT_FLAGS.whipDamage;
  COMBAT_FLAGS.whipDamage = value;
  try { fn(); } finally { COMBAT_FLAGS.whipDamage = prior; }
}
