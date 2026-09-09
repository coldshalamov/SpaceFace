/**
 * GATE-0 FORENSIC RE-MEASUREMENT (second independent reviewer) of commit 27bba37d
 * "fix(massSeed): mid-collapse kill completes the collapse instead of re-emitting it".
 *
 * These tests ATTACK THE REPAIR ITSELF for NEW defects it may introduce. They are NOT the
 * red-before/green-after regression pin (that is test/mass-seed-findings.test.mjs). Every test here
 * is expected to PASS against the repaired code; a FAILURE would be a new finding against the fix.
 *
 * Charter scenarios (a-f):
 *   a. _tickDying ordering: dying entries despawn on schedule even when the main seed is
 *      dead+collapsing and the repaired branch returns early.
 *   b. Boundary nowOf===collapseAt: exactly one collapse, original reason, cooldown once ON SCHEDULE.
 *   c. Deploy during the dead-entity-collapsing window (the behavioral DELTA vs pre-repair).
 *   d. Save (save:loaded -> _clearSeed) during the dead-collapsing window -> clean baseline.
 *   e. Sector exit during the dead-collapsing window -> _clearSeed exact.
 *   f. _finishCollapse receives a NULL entity (fully removed from the map) -> no throw, correct.
 *   + guard: a kill in a NON-collapsing phase still routes to _onSeedEntityLost (destroyed) —
 *     the new branch must not swallow legitimate destroyed events.
 *
 * Harness mirrors the base/findings suites (massSeed -> combat -> tetherGameplay).
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { massSeed } from '../src/systems/massSeed.js';
import { combat } from '../src/systems/combat.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';
import { MASS_SEED_DEF, MASS_SEED_CUT_REASONS } from '../src/data/massSeed.js';

const TICKS = { travel: 96, locking: 18, warning: 360, anchor: 1800, collapse: 27, cooldown: 480 };
const EVENTS = [
  'massSeed:collapsing', 'massSeed:collapsed', 'massSeed:destroyed', 'massSeed:tetherCut',
  'massSeed:deployed', 'massSeed:cleared', 'audio:cue', 'presentation:vfxCue',
];

function boot(seed = 7001) {
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
function explosions(t) { return named(t, 'audio:cue').filter((e) => e.p && e.p.id === 'sfx_explosion_small'); }

// Reach the expiry collapse beat with the seed still alive (the exact FINDING-01 pre-condition).
function reachExpiryCollapse(t) {
  deployNow(t);
  const seedId = t.state.massSeed.seedId;
  assert(runUntil(t, () => t.state.massSeed.phase === 'collapsing', TICKS.travel + TICKS.anchor + 60),
    'seed reaches the expiry collapse beat');
  assert.equal(named(t, 'massSeed:collapsing').at(-1).p.reason, MASS_SEED_CUT_REASONS.expired,
    'collapse began as an expiry');
  return seedId;
}

// ── (a) _tickDying runs BEFORE the repaired early-return branch ─────────────────────────────────
// The repaired branch `if (ms.phase==='collapsing'){...; return;}` returns early. _tickSeed calls
// _tickDying FIRST, so retired (dying) seeds must still despawn on schedule during a dead-collapsing
// window. A natural replaced-seed beat (27 ticks) cannot coincide with the main seed's ~1900-tick
// expiry collapse, so this white-box injects a due dying entry to isolate the ordering invariant.
test('FORENSIC-a: dying entries despawn on schedule while the main seed is dead+collapsing (early return)', () => {
  const t = boot(7011);
  const seedId = reachExpiryCollapse(t);
  const collapseAt = t.state.massSeed.collapseAt;
  // Simulate the mid-collapse kill exactly as combat does on hull 0: entity stays in the map,
  // alive flips false. Phase stays 'collapsing'; we are well before collapseAt.
  const seed = t.state.entities.get(seedId);
  seed.alive = false;
  // Inject a retired-seed beat that is due on the next tick (id has no live entity — _finishDying
  // tolerates that and still emits the collapsed receipt).
  const DUMMY = 424242;
  t.state.massSeed.dying.push({ id: DUMMY, despawnAt: t.state.simTime, reason: MASS_SEED_CUT_REASONS.replaced });
  t.sim.step();
  // _tickDying processed the injected entry despite the main seed's early-return branch.
  const drained = named(t, 'massSeed:collapsed').some((e) => e.p.seedId === DUMMY && e.p.reason === MASS_SEED_CUT_REASONS.replaced);
  assert(drained, 'the due dying entry despawned on schedule (massSeed:collapsed for the retired id)');
  assert(!t.state.massSeed.dying.some((d) => d.id === DUMMY), 'the drained entry left ms.dying');
  // The main seed is still collapsing (early-return path was taken) — proving _tickDying ran DESPITE it.
  assert.equal(t.state.massSeed.phase, 'collapsing', 'main seed still in its collapse beat (before collapseAt)');
  assert(t.state.simTime < collapseAt, 'we are genuinely inside the beat (now < collapseAt)');
});

// ── (b) boundary: mid-collapse kill finishes at collapseAt — one collapse, expired, cooldown once ──
test('FORENSIC-b: mid-collapse kill finishes exactly once at collapseAt with the ORIGINAL reason and on-schedule cooldown', () => {
  const t = boot(7021);
  const seedId = reachExpiryCollapse(t);
  const collapseAt = t.state.massSeed.collapseAt;
  const killTime = t.state.simTime;
  t.state.entities.get(seedId).alive = false; // killed mid-collapse (well before collapseAt)
  assert(collapseAt - killTime > MASS_SEED_DEF.collapseS * 0.5, 'kill lands early in the beat (distinguishes early vs on-schedule cooldown)');
  assert(runUntil(t, () => t.state.massSeed.phase === 'idle', TICKS.collapse + 20), 'collapse completes');

  const collapsing = named(t, 'massSeed:collapsing').map((e) => e.p.reason);
  const collapsed = named(t, 'massSeed:collapsed').map((e) => e.p.reason);
  assert.deepEqual(collapsing, [MASS_SEED_CUT_REASONS.expired], `exactly one collapse-begin, expired (got ${JSON.stringify(collapsing)})`);
  assert.deepEqual(collapsed, [MASS_SEED_CUT_REASONS.expired], `exactly one collapse-complete, expired (got ${JSON.stringify(collapsed)})`);
  assert.equal(named(t, 'massSeed:destroyed').length, 0, 'no destroyed event for a seed already collapsing from expiry');
  assert.equal(explosions(t).length, 1, 'exactly one death bang across the whole collapse');
  // Cooldown is set ONCE and ON SCHEDULE (~collapseAt + cooldownS), NOT from the kill instant
  // (pre-repair would give killTime + cooldownS, which is ~collapseS earlier).
  const cd = t.state.player.massSeed.cooldownUntil;
  const onSchedule = collapseAt + MASS_SEED_DEF.cooldownS;
  const dt = 1 / 60;
  assert(cd >= onSchedule - 2 * dt && cd <= onSchedule + 2 * dt,
    `cooldown on schedule: got ${cd.toFixed(4)}, expected ~${onSchedule.toFixed(4)} (kill-instant value would be ~${(killTime + MASS_SEED_DEF.cooldownS).toFixed(4)})`);
});

// ── (c) THE BEHAVIORAL DELTA: deploy during the dead-entity-collapsing window ────────────────────
// Pre-repair, a mid-collapse kill routed to _onSeedEntityLost, which SET the cooldown and reset the
// mirror to idle -> an immediate redeploy was cooldown-BLOCKED. Post-repair, phase stays 'collapsing'
// and cooldown is not set until collapseAt, so a redeploy in [kill, collapseAt) is now ALLOWED as a
// normal replacement. This test documents that delta and verifies the replacement is clean.
test('FORENSIC-c: deploy in the dead-collapsing window is allowed and behaves as a clean replacement (no orphan, single cooldown)', () => {
  const t = boot(7031);
  const seedA = reachExpiryCollapse(t);
  const deployedBefore = named(t, 'massSeed:deployed').length; // 1 (seed A)
  // Mid-collapse kill (models combat setting alive=false on hull 0). The entity is still in the map;
  // massSeed observes alive===false on its next tick — the same branch a swept null entity hits.
  t.state.entities.get(seedA).alive = false;
  // Let massSeed TICK on the DEAD seed. THIS is the tick where the pre-repair code routed to
  // _onSeedEntityLost (reset to idle + set cooldown + emit destroyed). The repair keeps the mirror in
  // 'collapsing' and starts NO cooldown — so this tick is what makes the behavioral delta observable
  // and is why this test reds on the pre-repair tree (verified) and greens on the repaired tree.
  t.sim.step();
  // DELTA (all three differ pre-repair): mirror stays collapsing, cooldown unset, no destroyed.
  assert.equal(t.state.massSeed.phase, 'collapsing', 'mirror still tracks the dead seed as collapsing (pre-repair: idle)');
  assert.equal(t.state.player.massSeed.cooldownUntil, 0, 'cooldown has NOT started (pre-repair: set) — a redeploy is not blocked');
  assert.equal(named(t, 'massSeed:destroyed').length, 0, 'no destroyed emitted (pre-repair: one destroyed)');

  deployNow(t); // redeploy inside the window — allowed post-repair
  // Count deployed EVENTS (recycling-robust: a swept seed id can be reused by the replacement).
  assert.equal(named(t, 'massSeed:deployed').length, deployedBefore + 1, 'a NEW seed launched (deploy was allowed)');
  assert.equal(t.state.massSeed.phase, 'travel', 'the replacement starts a fresh travel');
  // FORENSIC-FINDING-02 fix semantics: a DEAD retired seed is never tracked in ms.dying (its id is
  // recyclable and a beat entry would alias the replacement) — it completes synchronously instead.
  assert.equal(
    named(t, 'massSeed:collapsed').filter((e) => e.p.reason === MASS_SEED_CUT_REASONS.replaced).length,
    1,
    'the dead seed completed synchronously as replaced (not orphaned, not destroyed-flipped)');
  assert.equal(t.state.massSeed.dying.length, 0, 'no dying entry tracks the recyclable id of a dead seed');
  assert.equal(named(t, 'massSeed:destroyed').length, 0, 'still no destroyed after the replacement');
  assert.equal(t.state.player.massSeed.cooldownUntil, 0, 'replacement does not start the cooldown');
  // At DEPLOY TIME the window replacement is clean (this is what the repair gets right). Whether the
  // replacement SURVIVES to completion is a SEPARATE, repair-widened latent defect: the swept seed's
  // entity id is recycled by this replacement, and the retired seed's dying-beat later aliases + kills
  // it (see FORENSIC-FINDING-02 in test/mass-seed-forensic-findings.test.mjs, pinned expected-RED).
});

// ── (d) save:loaded during the dead-collapsing window normalizes away ───────────────────────────
test('FORENSIC-d: save:loaded (_clearSeed) during the dead-collapsing window -> clean idle baseline, fresh deploy works', () => {
  const t = boot(7041);
  const seedId = reachExpiryCollapse(t);
  t.state.entities.get(seedId).alive = false;
  t.sim.step(); // enter the dead+collapsing early-return window
  assert.equal(t.state.massSeed.phase, 'collapsing', 'in the dead-collapsing window');
  // A Continue/load fires save:loaded, which massSeed.init wired to _onSaveLoaded -> _clearSeed.
  t.bus.emit('save:loaded', {});
  assert.equal(t.state.massSeed.phase, 'idle', 'mirror normalized to idle on load');
  assert.equal(t.state.massSeed.dying.length, 0, 'dying slot flushed on load');
  assert(named(t, 'massSeed:cleared').length >= 1, 'a cleared receipt was emitted');
  assert.equal(t.state.entityList.filter((e) => e.type === 'massSeed').length, 0, 'no seed entity survives the load');
  // Fresh deploy works after the load (cooldown was never spuriously stamped by the window).
  t.state.player.massSeed.cooldownUntil = 0;
  deployNow(t);
  assert.equal(t.state.massSeed.phase, 'travel', 'deployable baseline restored post-load');
});

// ── (e) sector exit during the dead-collapsing window: _clearSeed exact ─────────────────────────
test('FORENSIC-e: sector:exit during the dead-collapsing window -> _clearSeed drains cleanly with the exact reason', () => {
  const t = boot(7051);
  const seedId = reachExpiryCollapse(t);
  t.state.entities.get(seedId).alive = false;
  t.sim.step();
  assert.equal(t.state.massSeed.phase, 'collapsing', 'in the dead-collapsing window');
  t.bus.emit('sector:exit', { sectorId: 'sector_forensic' });
  assert.equal(t.state.massSeed.phase, 'idle', 'sector exit normalizes the mirror to idle');
  assert.equal(t.state.massSeed.dying.length, 0, 'dying flushed on sector exit');
  const cleared = named(t, 'massSeed:cleared').at(-1);
  assert(cleared && cleared.p.reason === MASS_SEED_CUT_REASONS.cleared, 'cleared receipt carries the exact cleared reason');
  assert.equal(t.state.entityList.filter((e) => e.type === 'massSeed').length, 0, 'no seed entity survives the sector exit');
});

// ── (f) the repaired branch passes a NULL entity to _finishCollapse (entity fully swept) ─────────
test('FORENSIC-f: entity fully removed from the map mid-collapse -> _finishCollapse(null) does not throw and completes with the original reason', () => {
  const t = boot(7061);
  const seedId = reachExpiryCollapse(t);
  // Target-disappearance during the beat: the entity is GONE from the map (get() -> null), so the
  // repaired branch takes the `!entity` path and hands a null entity to _finishCollapse.
  t.state.entities.delete(seedId);
  assert.equal(t.state.entities.get(seedId) || null, null, 'entity truly removed');
  assert(runUntil(t, () => t.state.massSeed.phase === 'idle', TICKS.collapse + 20), 'collapse completes even with a null entity (no throw)');
  const collapsed = named(t, 'massSeed:collapsed').map((e) => e.p.reason);
  assert.deepEqual(collapsed, [MASS_SEED_CUT_REASONS.expired], `one collapse-complete, expired (got ${JSON.stringify(collapsed)})`);
  assert.equal(named(t, 'massSeed:destroyed').length, 0, 'no destroyed event (was already collapsing from expiry)');
  assert(t.state.player.massSeed.cooldownUntil > 0, 'cooldown set on completion');
});

// ── guard: a kill in a NON-collapsing phase still routes to _onSeedEntityLost (destroyed) ────────
// The new branch is gated on ms.phase==='collapsing'; it must NOT swallow a genuine mid-life kill.
test('FORENSIC-guard: a kill during ACTIVE (non-collapsing) still emits destroyed with the exact reason', () => {
  const t = boot(7071);
  deployNow(t);
  const seedId = t.state.massSeed.seedId;
  assert(runUntil(t, () => t.state.massSeed.phase === 'active', TICKS.travel + TICKS.locking + 6), 'seed reaches active');
  t.state.entities.get(seedId).alive = false; // killed while active (phase !== 'collapsing')
  assert(runUntil(t, () => t.state.massSeed.phase === 'idle', 10), 'destroyed out of active');
  assert.equal(named(t, 'massSeed:destroyed').length, 1, 'exactly one destroyed event for a genuine active-phase kill');
  assert.equal(named(t, 'massSeed:destroyed').at(-1).p.reason, MASS_SEED_CUT_REASONS.destroyed, 'exact destroyed reason (the new branch did not swallow it)');
  const collapsed = named(t, 'massSeed:collapsed').map((e) => e.p.reason);
  assert.deepEqual(collapsed, [MASS_SEED_CUT_REASONS.destroyed], 'the only collapse-complete is the destroy');
  assert(t.state.player.massSeed.cooldownUntil > 0, 'cooldown set on the active-phase kill');
});
