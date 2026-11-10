/**
 * PQ-011 / SF-11 — Deployable Anchor Mass Seed: FINDINGS (tests that FAIL against the current
 * implementation, each documenting a real, reachable, deterministic defect).
 *
 * Each test name carries a FINDING-XX tag matching REPORT.md. These assert the CORRECT behavior and
 * therefore FAIL today; they are the executable spec for the repair. Severity is judged against the
 * canonical acceptance bar (no NaN, no constraint leak, no orphaned tether, no invisible expiry,
 * determinism green). Nothing here breaches that bar — these are receipt/hygiene P2s — but they are
 * genuine and deterministic, not manufactured.
 *
 * Harness mirrors the base suite (massSeed → combat → tetherGameplay, production update order).
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { massSeed } from '../src/systems/massSeed.js';
import { combat } from '../src/systems/combat.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';
import { MASS_SEED_CUT_REASONS } from '../src/data/massSeed.js';

const TICKS = { travel: 96, anchor: 1800, collapse: 27 };
const EVENTS = [
  'massSeed:collapsing', 'massSeed:collapsed', 'massSeed:destroyed', 'massSeed:tetherCut',
  'massSeed:deployed', 'audio:cue', 'presentation:vfxCue',
];

function boot(seed = 6001) {
  const sim = createSimulation({ seed, bus: createBus(), systems: [massSeed, combat, tetherGameplay] });
  const { state } = sim;
  state.mode = 'flight';
  state.input.actions = {};
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 12, collides: true,
    vel: { x: 0, z: 0 }, rot: 0, angVel: 0, hull: 200, hullMax: 200, flags: {},
    data: { combatProfileId: 'combat_profile_standard_ship' },
  });
  state.playerId = player.id;
  const events = [];
  for (const n of EVENTS) sim.bus.on(n, (p) => events.push({ name: n, p, tick: state.tick }));
  return { sim, state, player, events, bus: sim.bus };
}
function deployNow(t, aim = { x: 500, z: 0 }) {
  t.state.input.aimWorld = aim; t.state.input.actions.deployMassSeed = true; t.sim.step();
}
function named(t, name) { return t.events.filter((e) => e.name === name); }
function runUntil(t, pred, maxTicks) { for (let i = 0; i < maxTicks; i++) { if (pred()) return true; t.sim.step(); } return pred(); }

// ── FINDING-01 (P2): a kill landing DURING the expiry collapse beat re-emits the collapse
// lifecycle and FLIPS the demise reason seed_expired → seed_destroyed. ──────────────────────────
//
// Mechanism: src/systems/massSeed.js. _beginCollapse (line ~480) sets phase='collapsing', cuts the
// tether cleanly with 'seed_expired', flips the body to the ghost material, and emits
// massSeed:collapsing{expired}. The entity stays alive + damageable for the 0.45s collapse beat (by
// design — no protected window). If a hostile projectile:hit lands in that window, combat kills the
// seed; on the next tick _tickSeed sees alive===false and calls _onSeedEntityLost (line ~528), which
// UNCONDITIONALLY emits massSeed:destroyed + a SECOND massSeed:collapsing{destroyed} +
// massSeed:collapsed{destroyed} + a second explosion cue, and restarts the cooldown from the kill
// time. _finishCollapse never runs, so the ONLY collapsed event reports 'seed_destroyed'.
//
// Consequence: a seed that expired on its own is reported to telemetry/HUD as ENEMY-DESTROYED, the
// collapse-begin fires twice for one seed, and a redundant death bang plays during the collapse
// animation. No constraint leak (the tether was already cut with the exact 'seed_expired' reason),
// no NaN, no orphan — hence P2, below the canonical P0/P1 bar — but the receipts are not exact.
//
// Repair shape (owning seam: massSeed.js _onSeedEntityLost / the _tickSeed entity-lost branch): if
// the seed is ALREADY in phase 'collapsing' when the entity is lost, treat the loss as completion of
// the in-progress collapse — finish quietly, preserve the original ms.collapseReason, and do not
// emit a fresh destroyed/collapsing/collapsed with a flipped reason.
test('FINDING-01: mid-collapse kill must not re-emit collapse nor flip seed_expired → seed_destroyed', () => {
  const t = boot(6001);
  const raider = t.sim.spawn({
    type: 'ship', team: 1, pos: { x: 460, z: 20 }, radius: 12, collides: true,
    hull: 100, hullMax: 100, data: { combatProfileId: 'combat_profile_standard_ship' },
  });
  deployNow(t);
  const seedId = t.state.massSeed.seedId;
  // Run to the expiry collapse beat.
  assert(runUntil(t, () => t.state.massSeed.phase === 'collapsing', TICKS.travel + TICKS.anchor + 60), 'seed reaches the expiry collapse beat');
  assert.equal(named(t, 'massSeed:collapsing').at(-1).p.reason, MASS_SEED_CUT_REASONS.expired, 'collapse began as an expiry');

  // A hostile shot lands DURING the 0.45s collapse beat (reachable: the seed is still damageable).
  t.bus.emit('projectile:hit', {
    targetId: seedId, ownerId: raider.id, damage: 999, damageType: 'kinetic', pos: { x: 438, z: 0 }, penetration: 1,
  });
  assert(runUntil(t, () => t.state.massSeed.phase === 'idle', 40), 'seed leaves the field');

  // CORRECT behavior (fails today): the seed expired, so its demise stays an expiry.
  const collapsingReasons = named(t, 'massSeed:collapsing').map((e) => e.p.reason);
  const collapsedReasons = named(t, 'massSeed:collapsed').map((e) => e.p.reason);
  assert.deepEqual(collapsingReasons, [MASS_SEED_CUT_REASONS.expired],
    `exactly one collapse-begin, reason expired (got ${JSON.stringify(collapsingReasons)})`);
  assert.deepEqual(collapsedReasons, [MASS_SEED_CUT_REASONS.expired],
    `exactly one collapse-complete, reason expired (got ${JSON.stringify(collapsedReasons)})`);
  assert.equal(named(t, 'massSeed:destroyed').length, 0,
    'no destroyed event for a seed that was already collapsing from expiry');
  const explosions = named(t, 'audio:cue').filter((e) => e.p && e.p.id === 'sfx_explosion_small');
  assert.equal(explosions.length, 1, 'exactly one death bang across the whole collapse (no redundant second explosion)');
});
