// Massline rung 08 acceptance check: auto-target wire.
//
// pickMasslineAutoTarget(state, opts) wires the pure massline scorer (rung 07) into the auto-target
// picker (combat/autoTargetMode.js). When the player is in MASSLINE MODE (tether active), it picks
// the best slingshot/swing anchor via rankMasslineTargets — favoring swing geometry over the weapon
// "hostiles-first/distance" sort. When NOT in massline mode, it returns null (caller falls back).
//
// Contract (src/combat/autoTargetMode.js pickMasslineAutoTarget):
//   - massline mode (tether.active) -> picks the highest-scoring massline candidate, writes targetId
//   - not massline mode             -> returns null, targetId untouched
//   - candidates include asteroids  -> massline anchors are not hostiles-only (mining/slingshot)
//   - range gate                    -> entities beyond maxRange are excluded
//   - no candidates                 -> returns null (caller falls back to weapon pick)
//   - score 0 candidates            -> returns null (out-of-range/degenerate don't count as a pick)
//   - hostility resolved via scanner.isHostileToPlayer (never factionId) — hostile bonus applied
//   - applyLock:false               -> returns the pick record WITHOUT writing targetId
//
// This is an integration check against real state (unlike rung 07's pure unit tests), but it calls
// the picker directly — no sim harness, no tetherGameplay update loop.
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { pickMasslineAutoTarget } from '../src/combat/autoTargetMode.js';

const PLAYER_ID = 8;
const MAX_RANGE = 390;

assertMasslineModePicksSwingTarget();
assertNonMasslineModeReturnsNull();
assertAsteroidsAreValidCandidates();
assertRangeGateExcludesFarEntities();
assertNoCandidatesReturnsNull();
assertHostilityBonusResolvedFromScanner();
assertApplyLockFalseDoesNotMutate();
assertScoreZeroReturnsNull();

console.log('Massline auto-target wire checks OK');

// In massline mode with a tangential target and a radial target, the picker selects the tangential
// one (higher swing score) and writes its id to state.player.targetId.
function assertMasslineModePicksSwingTarget() {
  const h = createHarness();
  // Two identical-mass hostiles at the same range, differing only in motion geometry.
  // Tangential: motion perpendicular to the line (good swing). Radial: motion along the line (none).
  const tangential = makeShip(100, { x: 234, z: 0 }, { x: 0, z: 90 }, { team: 1, hostile: true });
  const radial = makeShip(200, { x: 234, z: 0 }, { x: -90, z: 0 }, { team: 1, hostile: true });
  h.add(tangential, radial);
  setMasslineMode(h, true);

  const pick = pickMasslineAutoTarget(h.state, { maxRange: MAX_RANGE });
  assert.ok(pick, 'massline mode must return a pick');
  assert.equal(pick.targetId, 100, `must pick the tangential target; got ${pick.targetId}`);
  assert.ok(pick.score > 0.5, `tangential pick score >0.5; got ${pick.score}`);
  assert.equal(h.state.player.targetId, 100, 'must write targetId to state');
}

// Not in massline mode (no tether active, no override) -> null, targetId untouched.
function assertNonMasslineModeReturnsNull() {
  const h = createHarness();
  const t = makeShip(100, { x: 234, z: 0 }, { x: 0, z: 90 }, { team: 1, hostile: true });
  h.add(t);
  // No tether active -> not massline mode.
  h.state.player.tether = { active: false, targetId: null };
  h.state.player.targetId = 999;

  const pick = pickMasslineAutoTarget(h.state, { maxRange: MAX_RANGE });
  assert.equal(pick, null, 'non-massline mode must return null');
  assert.equal(h.state.player.targetId, 999, 'non-massline mode must not touch targetId');
}

// Asteroids are valid massline candidates (slingshot/mining anchors), unlike weapon targeting.
function assertAsteroidsAreValidCandidates() {
  const h = createHarness();
  const rock = makeAsteroid(300, { x: 234, z: 0 }, { x: 0, z: 90 });
  h.add(rock);
  setMasslineMode(h, true);

  const pick = pickMasslineAutoTarget(h.state, { maxRange: MAX_RANGE });
  assert.ok(pick, 'a tangential asteroid must be a valid massline pick');
  assert.equal(pick.targetId, 300, `must pick the asteroid; got ${pick.targetId}`);
}

// Entities beyond maxRange are excluded from candidates.
function assertRangeGateExcludesFarEntities() {
  const h = createHarness();
  const far = makeShip(400, { x: 500, z: 0 }, { x: 0, z: 90 }, { team: 1, hostile: true });
  h.add(far);
  setMasslineMode(h, true);

  const pick = pickMasslineAutoTarget(h.state, { maxRange: MAX_RANGE });
  assert.equal(pick, null, 'entity beyond maxRange must not be picked');
}

// No candidates in range -> null (caller falls back to weapon pick).
function assertNoCandidatesReturnsNull() {
  const h = createHarness();
  setMasslineMode(h, true);
  // No entities added at all.
  const pick = pickMasslineAutoTarget(h.state, { maxRange: MAX_RANGE });
  assert.equal(pick, null, 'no candidates must return null');
}

// Hostility is resolved via scanner.isHostileToPlayer. A hostile target gets the bonus; an
// identical non-hostile scores lower. We give the FRIENDLY the lower id so that WITHOUT the hostility
// bonus the friendly would win the id-ascending tiebreak — only WITH the bonus does the hostile win.
// This makes the test genuinely verify hostility resolution (not pass on a tiebreak coincidence).
function assertHostilityBonusResolvedFromScanner() {
  const h = createHarness();
  const player = h.state.entities.get(PLAYER_ID);
  // Friendly gets the lower id (499) so it would tiebreak-win without the hostility bonus.
  const friendly = makeShip(499, { x: 234, z: 0 }, { x: 0, z: 90 }, { team: player.team, hostile: false });
  const hostile = makeShip(500, { x: 234, z: 0 }, { x: 0, z: 90 }, { team: 1, hostile: true });
  h.add(friendly, hostile);
  setMasslineMode(h, true);

  const pick = pickMasslineAutoTarget(h.state, { maxRange: MAX_RANGE });
  assert.equal(pick.targetId, 500,
    `hostile (id 500) must outrank identical friendly (id 499) via hostility bonus; got ${pick.targetId}`);
}

// applyLock:false returns the pick record without writing targetId.
function assertApplyLockFalseDoesNotMutate() {
  const h = createHarness();
  const t = makeShip(100, { x: 234, z: 0 }, { x: 0, z: 90 }, { team: 1, hostile: true });
  h.add(t);
  setMasslineMode(h, true);
  h.state.player.targetId = 777;

  const pick = pickMasslineAutoTarget(h.state, { maxRange: MAX_RANGE, applyLock: false });
  assert.ok(pick, 'must still return a pick record');
  assert.equal(pick.targetId, 100, 'pick record must identify the target');
  assert.equal(h.state.player.targetId, 777, 'applyLock:false must not mutate targetId');
}

// A candidate that scores 0 (e.g. degenerate distance, somehow in range) must not be picked.
// We simulate by placing a target at the player's exact position (distance 0 -> 'out').
function assertScoreZeroReturnsNull() {
  const h = createHarness();
  const player = h.state.entities.get(PLAYER_ID);
  const onPlayer = makeShip(600, { x: player.pos.x, z: player.pos.z }, { x: 0, z: 0 }, { team: 1, hostile: true });
  h.add(onPlayer);
  setMasslineMode(h, true);

  const pick = pickMasslineAutoTarget(h.state, { maxRange: MAX_RANGE });
  assert.equal(pick, null, 'score-0 candidate must not be picked');
}

// ---- harness ----

function createHarness() {
  const state = createGameState(0x5a);
  state.mode = 'flight';
  state.tick = 100;
  state.playerId = PLAYER_ID;
  state.entities.clear();
  state.entityList = state.entityList || [];

  const player = {
    id: PLAYER_ID, type: 'ship', alive: true, team: 0,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0, maxSpeed: 120, radius: 8, mass: 200,
    data: { weapons: [], combat: {}, derived: { cap: 100 } },
  };
  state.entities.set(PLAYER_ID, player);
  state.entityList.push(player);

  // Default to no tether (not massline mode). Tests opt in via setMasslineMode.
  state.player.tether = { active: false, targetId: null };
  state.player.targetId = null;
  const harness = { state };
  harness.add = (...entities) => {
    for (const e of entities) {
      state.entities.set(e.id, e);
      state.entityList.push(e);
    }
  };
  return harness;
}

function setMasslineMode(harness, on) {
  harness.state.player.tether = {
    active: !!on,
    targetId: on ? (harness.state.player.tether && harness.state.player.tether.targetId) || null : null,
  };
}

function add(harness, ...entities) {
  for (const e of entities) {
    harness.state.entities.set(e.id, e);
    harness.state.entityList.push(e);
  }
}

// Build a ship entity. hostile:true sets up scanner-detectable hostility (team 1 + ai context that
// scanner.isHostileToPlayer treats as hostile; see scanner.js PLAYER_DANGER_CONTEXTS / huntPlayer).
function makeShip(id, pos, vel, { team = 1, hostile = false } = {}) {
  const data = { combat: {}, ai: null };
  if (hostile) {
    // scanner flags hostility via ai.huntPlayer / ai.forcePlayerTarget / encounter / danger context.
    data.ai = { huntPlayer: true };
  }
  return {
    id, type: 'ship', alive: true, team,
    pos: { ...pos }, vel: { ...vel }, rot: 0, angVel: 0, maxSpeed: 120, radius: 10, mass: 500,
    data,
  };
}

function makeAsteroid(id, pos, vel) {
  return {
    id, type: 'asteroid', alive: true, team: 0,
    pos: { ...pos }, vel: { ...vel }, rot: 0, angVel: 0, radius: 11, mass: 640,
    data: {},
  };
}
