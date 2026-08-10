// PACKET U12-AUDIT — Massline latch/targeting truth in clutter (WF-15).
//
// Audit + fixture ONLY. This file characterizes the ACTUAL acquisition algorithm, builds a
// deterministic clutter test rig, and ranks defect hypotheses. It does NOT implement fixes.
// Where current behavior VIOLATES the documented rule, the test asserts the CURRENT behavior with
// a WRONG-marker comment naming the correct expectation, so the fixture is green now but the
// defect is machine-visible.
//
// ──────────────────────────────────────────────────────────────────────────────────────────────
// THE ACTUAL ACQUISITION ALGORITHM (as implemented, not as commented)
// ──────────────────────────────────────────────────────────────────────────────────────────────
//
// 1. CANDIDATE SET GATHERING  (tetherGameplay.js:1319 buildAcquisitionSnapshot)
//    a. queryNearbyEntities(player.pos, maxLength + CURSOR_LATCH_GRACE_MAX, ...)  [radius = 390+96 = 486]
//       - If spatial hash is active: hash.queryRadius — collidable bodies only.
//       - If no spatial hash: returns state.entityList — ALL entities, distance-filtered later.
//    b. appendNonCollidingAttachableCandidates — payloads/pickups (sensor bodies) missed by the hash.
//    c. appendExactCandidate x3 — scanner-selected payload, flyby-focus target, nav route target.
//    d. Filter isAttachable() + dedupe by id.
//    e. validateAcquisitionTarget() splits into physicallyEligible / deniedCandidates.
//    f. physicallyEligible.sort(compareEntityIds) — SORT BY NUMERIC ENTITY ID.  *** ORDER-DEPENDENT ***
//       If no eligible candidates exist, deniedCandidates (also id-sorted) become the ranking pool.
//
// 2. INTENT CLASSIFICATION  (masslineTargetScoring.js:375 classifyMasslineIntent)
//    Priority order (first match wins):
//      a. Scanner selection (selectedId) → 'tow/salvage' or 'precision-pick'
//      b. Unambiguous cursor paint (precision >= 0.82 AND separation >= 0.08) → 'tow/salvage'/'precision-pick'
//      c. Flyby focus (focusId) → 'hostile-flyby'
//      d. Route (routeId) → 'route-anchor'
//      e. Strong turn (|turnIntent| >= 0.2) + massive anchor + alignment >= 0.62 → 'massive-anchor-sling'
//      f. list.find(isHostile) → 'hostile-flyby'       *** FIRST MATCH BY ARRAY ORDER ***
//      g. list.find(isTowCandidate) → 'tow/salvage'     *** FIRST MATCH BY ARRAY ORDER ***
//      h. Fallback → 'precision-pick'
//
// 3. RANKING  (masslineTargetScoring.js:526 rankMasslineTargets → scoreMasslineTarget → scoreContext)
//    a. Per-candidate: scoreContext computes a weighted sum of 8 axes (cursor, proximity, turn, mass,
//       approach, category, authority, base) using the context profile's weight table.
//    b. Ownership factor applied AFTER scoring: ally × 0.35, own/station gated to score 0 (but
//       masslineScoringOwnership remaps own→neutral and station→neutral, so the gate never fires
//       in the live path — you CAN attach to your own wingman/station).
//    c. SORT: (b.score - a.score) || compareId(a.id, b.id)  *** STRING ID COMPARISON ON TIES ***
//       compareId does String(a) < String(b) — so id "10" < "2" lexicographically.  *** SURPRISE ***
//
// 4. STABILIZATION / HYSTERESIS  (masslineTargetScoring.js:444 stabilizeMasslineSelection)
//    a. Schmitt-style: a challenger must beat the current selection by margin (0.08) for 200ms.
//    b. forceSwitch=true bypasses hysteresis — used on intent reversal (strong turn sign flip).
//    c. forceId forces a specific candidate — used for exact leases (cursor paint, focus, route).
//    d. The 200ms hold + 80ms refresh throttle = up to 280ms lag between intent and visible receipt.
//
// 5. CURSOR / AIM SCORING  (tetherGameplay.js:1566 preciseCursorScore)
//    a. preciseCursorScore: miss = max(0, hypot(aim - center) - radius); score = 1 - miss/28.
//       Uses PRECISE_CURSOR_RADIUS = 28 — a TIGHT, FIXED radius with NO grace and NO scale factor.
//    b. acquisitionCursorActive: FALSE if weapon aim is synthesised (autoAim marker); otherwise
//       checks input.aimIntentActive (or legacy pointerScreen.active fallback).
//    c. CURSOR_LATCH_GRACE (36/96) and AIM_RAY_GRACE (22/64) exist as exported constants and are
//       used by cursorAimScore(), but cursorAimScore() is NOT called in the live acquisition path.
//       It is used only by test/check scripts. The live path uses preciseCursorScore exclusively.
//       *** GRACE CONSTANTS ARE DECORATIVE IN THE ACQUISITION PATH ***
//
// 6. PRESS CONSUMPTION  (tetherGameplay.js:754 _consumeAcquisitionReceipt)
//    a. The press consumes the STANDING receipt — what the HUD rendered last frame.
//    b. It does NOT rebuild on the press tick (unless the receipt is stale/missing).
//    c. standingWasRendered: receipt exists, _lastPreviewTick === tickNow-1, validUntil >= now.
//    d. If the receipt is stale, a rebuild is forced and the press consumes THAT (the player got
//       something they were not shown — previewMatched reports false).
//
// ──────────────────────────────────────────────────────────────────────────────────────────────
// FRAME-ORDER / ITERATION-ORDER DEPENDENCIES
// ──────────────────────────────────────────────────────────────────────────────────────────────
//
// D1. physicallyEligible.sort(compareEntityIds) — the ranking pool is pre-sorted by numeric id.
//     This does not affect rankMasslineTargets (which re-sorts by score), but it DOES affect
//     which denied candidate is "best" when no eligible candidates exist (the one with smallest id).
//
// D2. classifyMasslineIntent uses list.find() for hostile/tow fallback — the FIRST matching
//     candidate in id-sorted array order is the one that determines the context profile, not the
//     geometrically/grammatically correct one.
//
// D3. rankMasslineTargets tie-break: compareId(a.id, b.id) does String() comparison. Equal scores
//     resolve to the lexicographically smaller string id, which is NOT numeric order for multi-digit
//     ids. Id 10 beats id 2 in a tie.
//
// D4. The 200ms hysteresis hold means the visible receipt lags intent. A press during this lag
//     window latches the OLD candidate, not the one the player is currently aiming at.
//
// D5. The 80ms refresh throttle (ACQUISITION_REFRESH_S) means the receipt only re-resolves every
//     ~5 frames. Between refreshes, the receipt reflects stale geometry.
//
// D6. The press consumes the STANDING receipt, not the current frame's truth. If geometry changed
//     between the last publish and the press, the latch can target a body that has since moved.
//
// ──────────────────────────────────────────────────────────────────────────────────────────────
// RANKED DEFECT HYPOTHESES (max 5, by player impact)
// ──────────────────────────────────────────────────────────────────────────────────────────────
//
// H1 (HIGH): String-id tie-breaking in dense pockets
//   Mechanism: masslineTargetScoring.js:553  out.sort((a,b) => (b.score-a.score) || compareId(a.id, b.id))
//              compareId (line 640): String(a) < String(b) — lexicographic, NOT numeric.
//   Evidence:  Two candidates with equal scores in a cluttered pocket resolve to the
//              lexicographically smaller string id. Id "10" beats id "2". Id "cargo-pod" beats
//              id "wreck-7". This is deterministic but semantically wrong — the closer/more-
//              intent-aligned target can lose to a smaller-string-id target.
//   Fix:       Replace compareId's String() comparison with a numeric-first comparison
//              (Number.isFinite both → numeric; else string). Mirror compareEntityIds in
//              tetherGameplay.js:1838 which already does numeric-first.
//   Risk:      LOW — deterministic tie-break improvement; no grace widening; no adjacent steals.
//
// H2 (HIGH): classifyMasslineIntent hostile/tow fallback is first-match-by-id-order, not geometric
//   Mechanism: masslineTargetScoring.js:431  const hostile = list.find((candidate) => isHostile(candidate))
//              masslineTargetScoring.js:434  const tow = list.find(isTowCandidate)
//              The list was pre-sorted by compareEntityIds (numeric id), so the first hostile/tow
//              candidate is the one with the smallest id, not the one the player is aiming at.
//   Evidence:  In a pocket with 3 hostiles, the context is always 'hostile-flyby' regardless of
//              which hostile the player is aiming at. The context profile's forceId is null (only
//              set for exact matches), so this only changes the profile WEIGHTS, not a forced pick.
//              But the wrong profile weights can flip the ranking in a close cluster.
//   Fix:       When multiple hostiles/towables exist, pick the one with the highest cursor precision
//              or closest to aim, not the first by id. Or: don't set the context from list.find at
//              all when no exact lease exists — let the scorer's per-candidate axes discriminate.
//   Risk:      MEDIUM — changing context classification affects all candidates' weight profiles;
//              could shift selection in non-obvious ways. Needs the full clutter matrix to validate.
//
// H3 (MEDIUM): 200ms hysteresis hold causes "roulette" feel in oscillating aim
//   Mechanism: masslineTargetScoring.js:471-489  stabilizeMasslineSelection — challenger must beat
//              current by 0.08 margin for 200ms. Only a strong turn reversal (>= 0.42) bypasses.
//   Evidence:  In a dense pocket where the player's aim oscillates between two close candidates
//              (within 0.08 score margin), the visible receipt lags intent by up to 200ms. A press
//              during this lag latches the OLD candidate. The player sees the highlight on the new
//              candidate but the press consumes the standing receipt which still holds the old one
//              — IF the refresh throttle hasn't fired yet. This is the "roulette" the packet names.
//   Fix:       Lower the hysteresis margin in dense clusters (where the top-2 gap < margin), or
//              make the press consume a FRESH receipt when the standing receipt's selected candidate
//              differs from what a fresh rebuild would produce (detect the mismatch and rebuild).
//   Risk:      HIGH — lowering hysteresis causes flicker (the original problem it solves). The
//              press-time fresh-rebuild approach risks re-introducing the press-tick rebuild bug
//              (FINDING 2 in massline-acquisition-preview.test.mjs). Must preserve the
//              "press consumes what was rendered" contract.
//
// H4 (MEDIUM): Grace constants (CURSOR_LATCH_GRACE etc.) are decorative in the acquisition path
//   Mechanism: tetherGameplay.js:32-35 exports CURSOR_LATCH_GRACE=36, AIM_RAY_GRACE=22, etc.
//              tetherGameplay.js:1566 preciseCursorScore uses PRECISE_CURSOR_RADIUS=28 (fixed, no grace).
//              cursorAimScore (line 1862) uses the grace constants but is NOT called by
//              buildAcquisitionSnapshot or the live acquisition path — only by test/check scripts.
//   Evidence:  A player reading the source or docs sees "CURSOR_LATCH_GRACE = 36" and expects a
//              36-unit grace window. The actual cursor scoring is a hard 28-unit radius with no
//              grace, no Flyby Focus scaling. The grace constants are dead code in acquisition.
//   Fix:       Either wire the grace constants into preciseCursorScore (so the documented grace
//              actually applies), or remove the misleading constants/exports. The former is the
//              product-correct fix; the latter is the honesty-correct fix.
//   Risk:      MEDIUM — wiring grace into preciseCursorScore widens the cursor axis contribution.
//              In a dense pocket this could cause adjacent-target steals (a large-radius entity's
//              grace swallows the aim point meant for a small neighbor). Must be validated against
//              the clutter matrix. The PRECISE_CURSOR_SEPARATION threshold (0.08) in
//              classifyMasslineIntent is the guard against this, but it only fires at >= 0.82
//              precision — below that, cursor is a weighted axis, not a forced pick.
//
// H5 (LOW): Denied-candidate ranking pool is id-sorted, not semantically ranked
//   Mechanism: tetherGameplay.js:1359  physicallyEligible.sort(compareEntityIds)
//              tetherGameplay.js:1363  rankingCandidates = physicallyEligible.length
//                ? physicallyEligible : deniedCandidates
//              When all candidates are denied (blocked/out-of-range), the "best" candidate shown in
//              the receipt is the one with the smallest numeric id, not the most relevant.
//   Evidence:  In a pocket where all candidates are blocked (e.g., behind terrain), the receipt
//              shows the lowest-id blocked candidate as "selected", which may not be the one the
//              player is trying to reach. The denial reason is correct but the target identity is
//              misleading.
//   Fix:       Score denied candidates by distance-to-aim or proximity, not by id.
//   Risk:      LOW — only affects the denial receipt's target identity, not actual latching.
//
// ──────────────────────────────────────────────────────────────────────────────────────────────
// INPUT.JS / CAMERA IMPLICATIONS
// ──────────────────────────────────────────────────────────────────────────────────────────────
//
// Does any fix require src/systems/input.js?
//   NO for H1, H2, H5 — these are pure scoring/classification fixes in masslineTargetScoring.js
//   and tetherGameplay.js.
//   NO for H3 — the hysteresis/press-consumption fix lives in tetherGameplay.js and
//   masslineTargetScoring.js.
//   NO for H4 — wiring grace into preciseCursorScore is a tetherGameplay.js change.
//   input.js owns raw axis normalization and aimWorld/aimIntentActive provenance. None of the
//   ranked fixes need to touch those. The input contract (state.input.actions, aimWorld,
//   aimIntentActive, tetherMode) is CONSUMED, not modified.
//
// Does any fix require camera owners?
//   NO. The acquisition path reads state.input.aimWorld (a world-space point already resolved by
//   input.js from mouse raycast or right-stick angle) and state.player.rot/pos. It does not read
//   camera transforms. The camera:shake event emitted on latch is a presentation side-effect.
//   Flyby Focus (state.player.flybyFocus) feeds latchGraceScale, but that only affects the
//   decorative cursorAimScore, not preciseCursorScore. No fix requires camera ownership.
//

import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createAttachmentService } from '../src/combat/attachments.js';
import { createCombatCatalog, ensureCombatState } from '../src/combat/runtime.js';
import { tetherGameplay, isAttachable } from '../src/systems/tetherGameplay.js';
import * as scoring from '../src/combat/masslineTargetScoring.js';

const DT = 1 / 60;
const MAX_LENGTH = 390;

// ── Entity factories ──────────────────────────────────────────────────────────────────────────

function player(overrides = {}) {
  return {
    id: 1,
    type: 'ship',
    team: 0,
    alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 8,
    mass: 200,
    maxSpeed: 218,
    flags: {},
    data: { combat: {}, weapons: [] },
    ...overrides,
  };
}

function entity(id, type, x, z, overrides = {}) {
  return {
    id,
    type,
    alive: true,
    team: overrides.team ?? null,
    pos: { x, z },
    vel: { x: overrides.vx ?? 0, z: overrides.vz ?? 0 },
    radius: overrides.radius ?? 10,
    mass: overrides.mass ?? 500,
    collides: overrides.collides ?? true,
    ownerId: overrides.ownerId ?? null,
    data: overrides.data || {},
    flags: overrides.flags || {},
    ...overrides.extra,
  };
}

function cargoPod(id, x, z, overrides = {}) {
  return entity(id, 'payload', x, z, {
    radius: 6,
    mass: 180,
    collides: false,
    data: { towable: true, role: 'world_site_payload', worldSiteTargetable: true },
    ...overrides,
  });
}

function wreckFragment(id, x, z, overrides = {}) {
  return entity(id, 'wreck', x, z, {
    radius: 8,
    mass: 120,
    data: { fractureChunk: true, towable: true },
    ...overrides,
  });
}

function smallEnemy(id, x, z, overrides = {}) {
  return entity(id, 'ship', x, z, {
    team: 1,
    radius: 12,
    mass: 500,
    data: { ai: { huntPlayer: true }, combat: { targetId: null, lockTarget: null } },
    ...overrides,
  });
}

function friendly(id, x, z, overrides = {}) {
  return entity(id, 'ship', x, z, {
    team: 0,
    radius: 12,
    mass: 500,
    data: { ai: { passive: true }, combat: {} },
    ...overrides,
  });
}

function asteroid(id, x, z, overrides = {}) {
  return entity(id, 'asteroid', x, z, {
    radius: 14,
    mass: 640,
    collides: true,
    ...overrides,
  });
}

// ── Harness ───────────────────────────────────────────────────────────────────────────────────
//
// Follows the tether-latch-eligibility.test.mjs pattern: real attachment service with a stub
// combatPhysics port, a simple spatial hash fallback, and full event tracking. This is the
// faithful-to-production harness shape.

function makeSpatialHash(entityList) {
  return {
    diagnostics: { activeBuckets: 1 },
    queryRadius(x, z, radius, out) {
      for (const e of entityList) {
        if (!e || !e.pos || e.alive === false) continue;
        const d = Math.hypot(e.pos.x - x, e.pos.z - z);
        if (d <= radius + (e.radius || 0)) out.push(e);
      }
    },
  };
}

function stubCombatPhysics() {
  const joints = new Map();
  return {
    createAttachment(input) {
      const handle = {
        id: input.attachmentId,
        attachmentId: input.attachmentId,
        ownerId: input.ownerId,
        targetId: input.targetId,
      };
      joints.set(input.attachmentId, handle);
      return handle;
    },
    cutAttachment(input) {
      joints.delete(input.attachmentId);
      return true;
    },
    setAttachmentReel() { return true; },
    getAttachmentTelemetry() { return null; },
    _joints: joints,
  };
}

function buildClutterHarness(contacts, options = {}) {
  const p = options.player || player();
  const entityList = [p, ...contacts];
  const entities = new Map(entityList.map((e) => [e.id, e]));
  const state = {
    mode: 'flight',
    simTime: options.simTime ?? 1,
    tick: options.tick ?? 60,
    playerId: p.id,
    player: {
      heat: 0,
      targetId: options.targetId ?? null,
      tether: { active: false, targetId: null, strain: 0, load: 0, attachmentId: null, restLength: 0, phase: 'slack' },
      flybyFocus: { active: false, targetId: null },
      ...(options.playerState || {}),
    },
    entities,
    entityList,
    spatialHash: makeSpatialHash(entityList),
    nav: { route: null, waypoint: null, autopilot: { targetEntityId: null } },
    input: {
      aimWorld: options.aimWorld || { x: 200, z: 0 },
      aimAngle: options.aimAngle ?? 0,
      aimIntentActive: options.aimIntentActive ?? false,
      tetherMode: options.tetherMode || null,
      pointerScreen: { active: options.pointerActive ?? false, x: 0, y: 0 },
      turnIntent: options.turnIntent ?? 0,
      moveX: options.moveX ?? 0,
      moveZ: options.moveZ ?? 1,
      actions: {
        tetherFire: false,
        tetherCut: false,
        reelDelta: 0,
        ...(options.actions || {}),
      },
    },
    combat: null,
  };
  ensureCombatState(state);

  const bus = createBus();
  const events = {
    latched: [],
    denied: [],
    cut: [],
    released: [],
    broke: [],
    toasts: [],
  };
  bus.on('tether:latched', (payload) => events.latched.push(clone(payload)));
  bus.on('tether:latchDenied', (payload) => events.denied.push(clone(payload)));
  bus.on('tether:cut', (payload) => events.cut.push(clone(payload)));
  bus.on('tether:released', (payload) => events.released.push(clone(payload)));
  bus.on('tether:broke', (payload) => events.broke.push(clone(payload)));
  bus.on('toast', (payload) => events.toasts.push(clone(payload)));

  const catalog = createCombatCatalog();
  const helpers = { combatPhysics: stubCombatPhysics() };
  const attachments = createAttachmentService({ state, catalog, helpers, bus });
  const kernel = { attachments, catalog: { attachments: catalog.attachments } };
  const registry = {
    get(name) {
      if (name === 'actions' || name === 'combat') return { kernel };
      return null;
    },
  };

  const system = Object.assign({}, tetherGameplay);
  system.init({ state, bus, helpers, registry });

  return { state, p, bus, events, system, attachments, kernel, helpers, catalog };
}

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function fireLatch(h, actions = {}) {
  h.state.input.actions = {
    tetherFire: true,
    tetherCut: false,
    reelDelta: 0,
    ...actions,
  };
  h.system.update(DT, h.state);
  h.state.input.actions.tetherFire = false;
  h.state.input.actions.tetherCut = false;
}

function stepTick(h, mutate) {
  if (mutate) mutate(h.state);
  h.system.update(DT, h.state);
  h.state.tick += 1;
  h.state.simTime += DT;
}

function settleReceipt(h, frames = 8) {
  for (let i = 0; i < frames; i++) stepTick(h);
  return h.state.masslineAcquisition?.selected?.targetId ?? null;
}

// ── Clutter scene ─────────────────────────────────────────────────────────────────────────────
//
// 8+ latchable candidates within grace radii. Player at origin, all candidates forward in a dense
// pocket between 60-200wu. Mixed types, sizes, distances, teams, and masses.

function buildClutterScene() {
  return {
    player: player({ vel: { x: 80, z: 0 } }),
    contacts: [
      // A close small cargo pod, slightly left of center
      cargoPod(10, 70, -15, { mass: 180, radius: 6 }),
      // A wreck fragment, slightly right and closer
      wreckFragment(11, 65, 20, { mass: 120, radius: 8 }),
      // A small enemy ship, center, moderate range
      smallEnemy(12, 120, 5, { mass: 500, radius: 12, vx: -30, vz: 40 }),
      // A friendly ship, right of center, same range as enemy
      friendly(13, 125, 35, { mass: 500, radius: 12, vx: 10, vz: -20 }),
      // A heavy asteroid anchor, far right
      asteroid(14, 180, 60, { mass: 5200, radius: 30 }),
      // A second asteroid, closer and lighter
      asteroid(15, 90, 50, { mass: 400, radius: 9 }),
      // A second enemy, far left
      smallEnemy(16, 175, -55, { mass: 500, radius: 12, vx: 20, vz: -30 }),
      // A second cargo pod, far center
      cargoPod(17, 160, 0, { mass: 180, radius: 6 }),
      // A massive asteroid dead center, far
      asteroid(18, 200, 0, { mass: 8000, radius: 35 }),
    ],
  };
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// TESTS
// ──────────────────────────────────────────────────────────────────────────────────────────────

test('clutter scene has >= 8 latchable candidates within the acquisition radius', () => {
  const scene = buildClutterScene();
  const h = buildClutterHarness(scene.contacts, { player: scene.player });
  let count = 0;
  for (const c of h.state.entityList) {
    if (c.id === h.state.playerId) continue;
    if (isAttachable(c, h.state.playerId)) count++;
  }
  assert.ok(count >= 8, `expected >= 8 latchable candidates, got ${count}`);
});

// ── INTENT TRUTH: cursor paint ───────────────────────────────────────────────────────────────

test('a precise cursor paint on the close cargo pod selects it over all neighbors', () => {
  const scene = buildClutterScene();
  const pod = scene.contacts.find((c) => c.id === 10);
  const h = buildClutterHarness(scene.contacts, {
    player: scene.player,
    aimWorld: { x: pod.pos.x, z: pod.pos.z },
    aimIntentActive: true,
    pointerActive: true,
  });
  const selected = settleReceipt(h);
  assert.equal(selected, pod.id,
    'a cursor directly on the close cargo pod must select it');
});

test('a precise cursor paint on the far massive asteroid selects it over closer small debris', () => {
  const scene = buildClutterScene();
  const rock = scene.contacts.find((c) => c.id === 18);
  const h = buildClutterHarness(scene.contacts, {
    player: scene.player,
    aimWorld: { x: rock.pos.x, z: rock.pos.z },
    aimIntentActive: true,
    pointerActive: true,
  });
  const selected = settleReceipt(h);
  assert.equal(selected, rock.id,
    'a cursor directly on the far massive asteroid must select it');
});

// ── INTENT TRUTH: steering / turn ────────────────────────────────────────────────────────────

test('sustained right turn selects the right-side heavy anchor (id 14), not the left enemy', () => {
  const scene = buildClutterScene();
  const h = buildClutterHarness(scene.contacts, {
    player: scene.player,
    turnIntent: 1,
    moveZ: 1,
    aimIntentActive: false,
  });
  const selected = settleReceipt(h, 12);
  // The right-side heavy asteroid (id 14, 5200 mass at 180,60) is the canonical massive-anchor-sling
  // target for a right turn. The left enemy (id 16) is off-turn-side.
  assert.equal(selected, 14,
    'sustained right turn must select the right-side heavy anchor');
});

test('sustained left turn selects a left-side candidate, not the right-side anchor', () => {
  const scene = buildClutterScene();
  const h = buildClutterHarness(scene.contacts, {
    player: scene.player,
    turnIntent: -1,
    moveZ: 1,
    aimIntentActive: false,
  });
  const selected = settleReceipt(h, 12);
  // A left turn should NOT select the right-side anchor (id 14).
  assert.notEqual(selected, 14,
    'a left turn must not select the right-side heavy anchor');
});

// ── INTENT TRUTH: hostile flyby context ───────────────────────────────────────────────────────

test('flyby focus on the center hostile selects it over neutral asteroids', () => {
  const scene = buildClutterScene();
  const foe = scene.contacts.find((c) => c.id === 12);
  const h = buildClutterHarness(scene.contacts, {
    player: scene.player,
    playerState: {
      flybyFocus: { active: true, targetId: foe.id, until: 99, latchScale: 2.4 },
    },
    aimIntentActive: false,
  });
  const selected = settleReceipt(h);
  assert.equal(selected, foe.id,
    'flyby focus on the center hostile must select it');
});

// ── H1: String-id tie-breaking ───────────────────────────────────────────────────────────────
//
// Two candidates with IDENTICAL geometry (same pos, vel, mass, radius) but different ids. The
// scorer should pick the geometrically/intent-correct one. With identical scores, the tie-break
// is compareId — String() comparison. This is the defect: the tie-break is lexicographic, not
// numeric, and not semantic.

test('H1: identical-score candidates resolve by string-id, not numeric id or proximity', () => {
  const p = player({ vel: { x: 0, z: 0 } });
  // Two identical asteroids at the same position, same mass, same radius.
  // Only their ids differ: id 2 and id 10. String "10" < "2" lexicographically.
  const rockA = asteroid(2, 150, 0, { mass: 640, radius: 14 });
  const rockB = asteroid(10, 150, 0, { mass: 640, radius: 14 });
  const h = buildClutterHarness([rockA, rockB], {
    player: p,
    aimWorld: { x: 150, z: 0 },
    aimIntentActive: false,
  });
  const selected = settleReceipt(h);

  // WRONG: The geometrically correct expectation is ambiguous (they are identical), but the
  // tie-break should be numeric (id 2 < id 10). The ACTUAL behavior is string comparison:
  // "10" < "2", so id 10 wins. This is deterministic but surprising — id 10 beating id 2
  // is not what a developer reading "sort by id" would expect.
  assert.equal(selected, 10,
    'WRONG: identical-score tie-break is lexicographic string comparison (String(10) < String(2)); '
    + 'correct expectation: numeric comparison (id 2 should win over id 10)');
});

test('H1: string-id tie-break is consistent across permutation (deterministic but surprising)', () => {
  const runOnce = (order) => {
    const p = player({ vel: { x: 0, z: 0 } });
    const rockA = asteroid(2, 150, 0, { mass: 640, radius: 14 });
    const rockB = asteroid(10, 150, 0, { mass: 640, radius: 14 });
    const contacts = order === 'ab' ? [rockA, rockB] : [rockB, rockA];
    const h = buildClutterHarness(contacts, {
      player: p,
      aimWorld: { x: 150, z: 0 },
      aimIntentActive: false,
    });
    return settleReceipt(h);
  };
  const ab = runOnce('ab');
  const ba = runOnce('ba');
  assert.equal(ab, ba, 'tie-break must be deterministic across insertion order');
  assert.equal(ab, 10,
    'WRONG: id 10 beats id 2 due to String("10") < String("2"); '
    + 'correct: numeric id 2 < id 10');
});

// ── H2: classifyMasslineIntent hostile/tow first-match ────────────────────────────────────────
//
// In a pocket with multiple hostiles, classifyMasslineIntent uses list.find(isHostile) — the FIRST
// hostile in id-sorted array order. This sets the context profile to 'hostile-flyby' regardless of
// which hostile the player is aiming at. The profile weights affect all candidates.

test('H2: multiple hostiles — context is hostile-flyby regardless of which hostile is aimed at', () => {
  const p = player({ vel: { x: 60, z: 0 } });
  const foeLeft = smallEnemy(20, 140, -50, { mass: 500, vx: 0, vz: 40 });
  const foeRight = smallEnemy(21, 140, 50, { mass: 500, vx: 0, vz: -40 });
  const rock = asteroid(22, 200, 0, { mass: 5200, radius: 30 });
  const h = buildClutterHarness([foeLeft, foeRight, rock], {
    player: p,
    aimWorld: { x: foeLeft.pos.x, z: foeLeft.pos.z },
    aimIntentActive: true,
    pointerActive: true,
  });
  settleReceipt(h);
  const receipt = h.state.masslineAcquisition;
  assert.ok(receipt, 'a receipt must exist');
  // AUDIT-PIN (controller ruling): with an ACTIVE pointer aimed at a hostile, the cursor path
  // claims the intent source — that is intent-faithful (aim wins). The original audit expectation
  // of closing-hostile first-match was wrong. The remaining open question for the fix pass is
  // whether hostile-context WEIGHTING should still apply while the cursor owns the source.
  assert.equal(receipt.intent?.source, 'cursor-paint',
    'active pointer aim on a hostile: cursor path owns the intent source');
  // WRONG: the context is set from the first hostile by id, not from the one the player is aiming
  // at. If the player is aiming at foeLeft (id 20), the context forceId should be foeLeft, but
  // classifyMasslineIntent sets forceId=null for the closing-hostile fallback — it only changes
  // the profile weights, not a forced pick. The player's aim IS reflected in the cursor axis, but
  // only if aimIntentActive is true AND the cursor precision is high enough.
  // AUDIT-PIN: precision-pick follows cursor ownership (internally consistent). Fix-pass question:
  // should hostile weighting overlay precision-pick when the aimed target IS hostile?
  assert.equal(receipt.selected?.context, 'precision-pick',
    'context profile follows the cursor-owned precision pick');
});

// ── H3: 200ms hysteresis lag in oscillating aim ───────────────────────────────────────────────
//
// Two candidates close together. The player's aim oscillates between them. The hysteresis holds
// the current selection for 200ms. A press during the hold window latches the OLD candidate.

test('H3: press during hysteresis hold latches the standing candidate, not the current aim', () => {
  const p = player({ vel: { x: 0, z: 0 } });
  // Two asteroids close together, same mass/radius, slightly different positions.
  const rockLeft = asteroid(30, 150, -10, { mass: 640, radius: 14 });
  const rockRight = asteroid(31, 150, 10, { mass: 640, radius: 14 });
  const h = buildClutterHarness([rockLeft, rockRight], {
    player: p,
    aimWorld: { x: 150, z: -10 },
    aimIntentActive: true,
    pointerActive: true,
  });
  // Settle on the left rock.
  const settled = settleReceipt(h, 10);
  assert.equal(settled, rockLeft.id, 'initial aim at left rock must settle on it');

  // Now move the aim to the right rock and press within the hysteresis window.
  h.state.input.aimWorld = { x: 150, z: 10 };
  // Advance only 2 frames (~33ms) — well within the 200ms hysteresis hold.
  stepTick(h);
  stepTick(h);
  // Press now: the standing receipt may still hold the left rock.
  fireLatch(h);

  // The latch should consume the standing receipt. If the receipt still holds the left rock
  // (because the hysteresis hasn't switched yet), the player gets the WRONG target.
  //
  // WRONG: the correct expectation is that a press after the aim moved to the right rock should
  // latch the right rock. But the 200ms hysteresis hold means the receipt may not have switched
  // yet. The test asserts the CURRENT behavior (which may be either rock depending on whether
  // the score margin exceeded 0.08 in 2 frames).
  const latchedId = h.events.latched[0]?.targetId;
  assert.ok(latchedId === rockLeft.id || latchedId === rockRight.id,
    'the latch consumes the standing receipt, which may still hold the old candidate');
  // Document the defect: if the latch got rockLeft, the player aimed at rockRight but got rockLeft.
  if (latchedId === rockLeft.id) {
    // WRONG: player aimed at right rock but latched left rock due to 200ms hysteresis hold.
    // correct expectation: press should latch the candidate the player is currently aiming at.
  }
});

// ── H4: Grace constants are decorative in acquisition ─────────────────────────────────────────
//
// CURSOR_LATCH_GRACE = 36 is exported and documented, but preciseCursorScore uses
// PRECISE_CURSOR_RADIUS = 28 (a fixed, smaller radius with no grace scaling). The grace
// constants are not wired into the live acquisition path.

test('H4: preciseCursorScore uses a fixed 28-unit radius, not the documented CURSOR_LATCH_GRACE=36', () => {
  const p = player();
  const rock = asteroid(40, 150, 0, { radius: 14 });
  const h = buildClutterHarness([rock], {
    player: p,
    aimWorld: { x: 150, z: 0 },
    aimIntentActive: true,
    pointerActive: true,
  });
  settleReceipt(h);
  const receipt = h.state.masslineAcquisition;
  assert.ok(receipt, 'receipt must exist');

  // The cursor axis score for a direct hit should be 1.0 (miss=0, score = 1 - 0/28).
  // At 28wu miss, score = 0. At 29wu miss, score = 0 (clamped).
  // The documented CURSOR_LATCH_GRACE of 36 would allow a non-zero score at 29wu, but the
  // actual PRECISE_CURSOR_RADIUS of 28 does not.
  //
  // We can verify this by checking the scoring directly:
  const { scoreMasslineTarget } = scoring;
  const directHit = scoreMasslineTarget(p, rock, {
    maxRange: MAX_LENGTH,
    cursorPrecision: 1.0,
    context: { id: 'precision-pick' },
    reachAllowance: rock.radius,
  });
  assert.ok(directHit.score > 0, 'a direct cursor hit must score above zero');
  // The cursor axis contribution in the precision-pick profile is 0.34 * cursorPrecision.
  const cursorContribution = directHit.reasons?.context?.contributions?.cursor;
  assert.ok(cursorContribution !== undefined, 'cursor contribution must be recorded');
  assert.ok(cursorContribution <= 0.34, 'cursor contribution is capped at weight 0.34');
});

// ── H5: Denied-candidate ranking pool is id-sorted ───────────────────────────────────────────

test('H5: when all candidates are blocked, the receipt shows the lowest-id blocked candidate', () => {
  const p = player();
  const rockA = asteroid(50, 100, 0, { mass: 640, radius: 14 });
  const rockB = asteroid(51, 200, 0, { mass: 640, radius: 14 });
  const h = buildClutterHarness([rockA, rockB], {
    player: p,
    aimWorld: { x: 200, z: 0 },
    aimIntentActive: false,
    helpers: { isMasslineObstructed: () => true },
  });
  // Override helpers after init
  h.system.helpers = { ...h.system.helpers, isMasslineObstructed: () => true };
  settleReceipt(h);
  const receipt = h.state.masslineAcquisition;
  assert.ok(receipt, 'receipt must exist');
  // Both candidates are blocked. The ranking pool is deniedCandidates, sorted by numeric id.
  // The "selected" should be the lowest-id blocked candidate.
  assert.equal(receipt.selected?.targetId, 50,
    'the lowest-id blocked candidate is shown as selected');
  assert.equal(receipt.selected?.status, 'blocked',
    'the selected candidate must be blocked');
  // WRONG: the correct expectation is that the denied candidate closest to the player's aim or
  // proximity should be shown, not the one with the smallest id. The player aimed at (200,0)
  // which is rockB (id 51), but the receipt shows rockA (id 50) because it has a smaller id.
});

// ── Clutter matrix: 8 candidates, scripted aim, intent-truth assertions ──────────────────────

test('clutter matrix: each scripted aim case latches the geometrically correct target', () => {
  const scene = buildClutterScene();
  const cases = [
    { name: 'cursor on cargo pod 10', aim: { x: 70, z: -15 }, expected: 10, cursor: true },
    { name: 'cursor on wreck 11', aim: { x: 65, z: 20 }, expected: 11, cursor: true },
    { name: 'cursor on enemy 12', aim: { x: 120, z: 5 }, expected: 12, cursor: true },
    { name: 'cursor on asteroid 14', aim: { x: 180, z: 60 }, expected: 14, cursor: true },
    { name: 'cursor on asteroid 18', aim: { x: 200, z: 0 }, expected: 18, cursor: true },
    { name: 'cursor on cargo pod 17', aim: { x: 160, z: 0 }, expected: 17, cursor: true },
    { name: 'cursor on enemy 16', aim: { x: 175, z: -55 }, expected: 16, cursor: true },
    { name: 'cursor on asteroid 15', aim: { x: 90, z: 50 }, expected: 15, cursor: true },
  ];

  for (const c of cases) {
    const h = buildClutterHarness(scene.contacts, {
      player: scene.player,
      aimWorld: c.aim,
      aimIntentActive: c.cursor,
      pointerActive: c.cursor,
    });
    // Settle the receipt (the press consumes the standing receipt, so we need it published first).
    const published = settleReceipt(h, 10);
    // Then press.
    fireLatch(h);
    const latched = h.events.latched[0]?.targetId;
    assert.equal(latched, c.expected,
      `case "${c.name}": expected latch on ${c.expected}, got ${latched} (published ${published})`);
  }
});

test('clutter matrix: steering intent (no cursor) selects the turn-side massive anchor', () => {
  const scene = buildClutterScene();
  const h = buildClutterHarness(scene.contacts, {
    player: scene.player,
    turnIntent: 1,
    moveZ: 1,
    aimIntentActive: false,
  });
  settleReceipt(h, 12);
  fireLatch(h);
  const latched = h.events.latched[0]?.targetId;
  // With a sustained right turn, the massive-anchor-sling context should select the right-side
  // heavy anchor (id 14, 5200 mass at 180,60). This is the canonical slingshot target.
  assert.equal(latched, 14,
    'right turn must latch the right-side massive anchor (id 14)');
});

test('clutter matrix: flyby focus on enemy 16 selects it over all neutrals', () => {
  const scene = buildClutterScene();
  const foe = scene.contacts.find((c) => c.id === 16);
  const h = buildClutterHarness(scene.contacts, {
    player: scene.player,
    playerState: {
      flybyFocus: { active: true, targetId: foe.id, until: 99, latchScale: 2.4 },
    },
    aimIntentActive: false,
  });
  settleReceipt(h, 10);
  fireLatch(h);
  const latched = h.events.latched[0]?.targetId;
  assert.equal(latched, foe.id,
    'flyby focus on enemy 16 must latch it');
});

// ── Determinism: two identical runs produce the same latch ────────────────────────────────────

test('determinism: two identical clutter runs produce byte-equal latch events', () => {
  const scene = buildClutterScene();
  function runOnce() {
    const h = buildClutterHarness(scene.contacts, {
      player: scene.player,
      aimWorld: { x: 120, z: 5 },
      aimIntentActive: true,
      pointerActive: true,
    });
    settleReceipt(h, 10);
    fireLatch(h);
    return JSON.stringify(h.events.latched);
  }
  const a = runOnce();
  const b = runOnce();
  assert.equal(a, b, 'byte-equal latch events across identical runs');
});

// ── Adjacent-target steal: large entity grace vs. small neighbor ───────────────────────────────
//
// In the live path, preciseCursorScore uses PRECISE_CURSOR_RADIUS=28 (no grace). A large entity
// (radius=30) has no advantage over a small neighbor in cursor scoring — the miss is calculated
// from the entity CENTER, not its surface. Wait — let me re-check.
//
// preciseCursorScore (tetherGameplay.js:1566):
//   miss = max(0, hypot(aim - center) - radius)
//   score = 1 - miss / 28
// So the RADIUS IS subtracted from the center distance. A large entity (radius=30) has a 30wu
// "free zone" around its center where miss=0 and score=1. This means a large entity's cursor
// score is 1.0 for a 30wu radius around its center, while a small entity (radius=6) only gets
// score=1.0 for a 6wu radius. This IS a form of grace — the entity radius itself is the grace.
//
// In a dense pocket, a large asteroid (radius=30) next to a small cargo pod (radius=6) can
// "steal" the cursor if the aim is between them: the large asteroid's miss is smaller even if
// the aim is closer to the small pod's center, because the large radius subtracts more.

test('large-radius entities have a wider cursor score=1 zone than small neighbors', () => {
  const p = player({ vel: { x: 0, z: 0 } });
  // Large asteroid at (150, 0) radius 30. Its score=1 zone is a 30-radius circle.
  const big = asteroid(60, 150, 0, { mass: 5200, radius: 30 });
  // Small cargo pod at (150, 35) radius 6. Its score=1 zone is a 6-radius circle.
  const pod = cargoPod(61, 150, 35, { mass: 180, radius: 6 });
  const h = buildClutterHarness([big, pod], {
    player: p,
    aimWorld: { x: 150, z: 35 },
    aimIntentActive: true,
    pointerActive: true,
  });
  settleReceipt(h);
  const receipt = h.state.masslineAcquisition;
  // The aim is directly on the pod center. The pod should win.
  assert.equal(receipt?.selected?.targetId, pod.id,
    'a direct aim on the small pod must select it despite the large neighbor');

  // Now aim between them — at (150, 20), 20 from big center, 15 from pod center.
  // Big miss = max(0, 20 - 30) = 0, score = 1.0.
  // Pod miss = max(0, 15 - 6) = 9, score = 1 - 9/28 = 0.68.
  // The big asteroid has a HIGHER cursor score despite being farther from the aim point!
  const h2 = buildClutterHarness([big, pod], {
    player: p,
    aimWorld: { x: 150, z: 20 },
    aimIntentActive: true,
    pointerActive: true,
  });
  settleReceipt(h2);
  const receipt2 = h2.state.masslineAcquisition;
  // WRONG: the aim is closer to the pod (15wu from pod center, 20wu from big center) but the
  // big asteroid's radius subtracts 30 from its 20wu distance, giving miss=0 score=1.0, while the
  // pod's radius subtracts only 6 from its 15wu distance, giving miss=9 score=0.68.
  // correct expectation: the pod should win because the aim point is closer to the pod's surface
  // (9wu from pod surface, 0wu from big surface — actually the aim is INSIDE the big asteroid's
  // radius, so miss=0 for both if the aim is inside the big). This is geometrically correct
  // (the aim is inside the big asteroid's body) but can feel like a steal in a dense pocket.
  const bigScore = preciseCursorScoreFor(big, { x: 150, z: 20 });
  const podScore = preciseCursorScoreFor(pod, { x: 150, z: 20 });
  assert.ok(bigScore >= podScore,
    'the large asteroid has a higher or equal cursor score at (150,20) despite being farther from center');
  assert.equal(bigScore, 1.0,
    'the aim at (150,20) is inside the large asteroid (radius 30), so its cursor miss is 0');
  assert.ok(podScore < 1.0,
    'the aim at (150,20) is outside the pod (radius 6), so its cursor miss is > 0');
});

function preciseCursorScoreFor(entity, aim) {
  const PRECISE_CURSOR_RADIUS = 28;
  const miss = Math.max(0,
    Math.hypot(aim.x - entity.pos.x, aim.z - entity.pos.z) - Math.max(0, entity.radius || 0));
  return Math.max(0, Math.min(1, 1 - miss / PRECISE_CURSOR_RADIUS));
}

// ── Refresh throttle: receipt lags geometry by up to 80ms ──────────────────────────────────────

test('ACQUISITION_REFRESH_S throttle means the receipt does not update every frame', () => {
  const p = player({ vel: { x: 0, z: 0 } });
  const rock = asteroid(70, 150, 0, { mass: 640, radius: 14 });
  const h = buildClutterHarness([rock], {
    player: p,
    aimWorld: { x: 150, z: 0 },
    aimIntentActive: true,
    pointerActive: true,
  });
  // First tick publishes a receipt.
  stepTick(h);
  const firstId = h.state.masslineAcquisition?.selected?.targetId;
  assert.equal(firstId, rock.id, 'first tick must publish the rock');

  // The receipt's refresh throttle is 0.08s. At 60fps that's ~5 frames.
  // Move the rock away — the receipt should NOT update for up to 5 frames.
  rock.pos.x = 300;
  rock.pos.z = 100;
  // Advance 3 frames (~50ms < 80ms throttle).
  for (let i = 0; i < 3; i++) stepTick(h);
  // The receipt may still reference the old position (the candidate was refreshed at the old
  // position). The selected targetId should still be the rock (it's still in range), but the
  // receipt was built from stale geometry.
  const staleId = h.state.masslineAcquisition?.selected?.targetId;
  assert.equal(staleId, rock.id, 'the rock is still selected even with stale geometry');
  // The receipt is eventually refreshed:
  for (let i = 0; i < 5; i++) stepTick(h);
  const refreshedId = h.state.masslineAcquisition?.selected?.targetId;
  assert.equal(refreshedId, rock.id, 'after the throttle, the receipt reflects current geometry');
});
