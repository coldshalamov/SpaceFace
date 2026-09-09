/**
 * GATE-0 FORENSIC FINDINGS (second independent reviewer) — expected-RED pins for defects surfaced
 * while adversarially attacking commit 27bba37d. Each asserts the CORRECT behavior and therefore
 * FAILS today; it is the executable spec for the fix and flips green once the fix lands.
 *
 * EXPECTED-RED BY DESIGN. Exclude from any aggregate green gate until fixed (same treatment the
 * physics lane gave test/mass-seed-findings.test.mjs before its repair).
 *
 * ── FORENSIC-FINDING-02 (P2/P3): a replacement deployed during the dead-collapsing window is later
 * KILLED by the retired seed's dying-beat via ENTITY-ID ALIASING. ─────────────────────────────────
 *
 * Repair-WIDENED latent defect (owner: src/systems/massSeed.js). Root cause is PRE-EXISTING:
 *   - The sim recycles entity ids through a LIFO free-list (src/core/coreSystem.js:25 pops freeIds,
 *     :115 pushes a swept entity's id back). So a swept seed's id is immediately reusable.
 *   - _retireLiveSeed pushes { id: oldId, despawnAt, reason } into ms.dying WITHOUT checking whether
 *     the entity is already dead/gone, and _finishDying later does `entity.alive = false` on
 *     `state.entities.get(entry.id)` with NO identity/type/generation guard.
 * The repair (27bba37d) keeps the mirror in 'collapsing' for the whole ~0.45s beat after a
 * mid-collapse kill, so a redeploy anywhere in the beat routes through _retireLiveSeed on the
 * already-swept seed; _handleDeploy then calls spawnEntity, which pops the just-freed id (LIFO) for
 * the replacement. The retired seed's dying entry now aliases the live replacement, and ~0.45s later
 * _finishDying kills it — the replacement routes through _onSeedEntityLost and is reported destroyed.
 *
 * Pre-repair this self-replacement path was reachable only in a 1-tick race (deploy on the step right
 * after the kill, before _tickSeed processed the dead seed); the repair widens it to the full beat
 * and makes it DETERMINISTIC in a quiet/low-entity scene. In active combat the exact-id recycle is
 * diluted by other entity churn (a real projectile entity may pop the id first), so real-play
 * reachability is probabilistic, not guaranteed. It does NOT breach the canonical bar (no NaN, no
 * constraint leak, no orphaned tether, determinism/hashEqual green) — hence P2/P3, filed, not a
 * Gate-0 blocker.
 *
 * Suggested fix (owning seam: massSeed.js), NOT implemented here (reviewer leaves code untouched):
 *   - In _retireLiveSeed, if the seed entity is already dead/gone (!entity || alive===false), do NOT
 *     create a dying entry that tracks its recyclable id — finish it immediately (there is no live
 *     body to collapse over the beat).
 *   - Defense-in-depth: have _finishDying verify the looked-up entity is still the retired massSeed
 *     (type==='massSeed' plus a stored uid/generation) before setting alive=false — this also guards
 *     the broader hazard that ANY entity recycling the freed id could be zapped mid-beat.
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

function boot(seed = 9001) {
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
  for (const n of ['massSeed:deployed', 'massSeed:collapsed', 'massSeed:destroyed']) {
    sim.bus.on(n, (p) => events.push({ name: n, p, tick: state.tick }));
  }
  return { sim, state, player, events };
}
function deployNow(t, aim = { x: 500, z: 0 }) { t.state.input.aimWorld = aim; t.state.input.actions.deployMassSeed = true; t.sim.step(); }
function named(t, name) { return t.events.filter((e) => e.name === name); }
function runUntil(t, pred, maxTicks) { for (let i = 0; i < maxTicks; i++) { if (pred()) return true; t.sim.step(); } return pred(); }

test('FORENSIC-FINDING-02: a replacement deployed in the dead-collapsing window must SURVIVE (not be killed by the retired seed’s dying-beat via id aliasing)', () => {
  const t = boot(9001);
  deployNow(t);
  const seedA = t.state.massSeed.seedId;
  assert(runUntil(t, () => t.state.massSeed.phase === 'collapsing', TICKS.travel + TICKS.anchor + 60), 'seed A reaches the expiry collapse beat');
  // Mid-collapse kill (models combat hull->0). Then tick once so massSeed processes the dead seed and
  // (repair) keeps the mirror in 'collapsing'; the sweep frees A's id onto the LIFO free-list.
  t.state.entities.get(seedA).alive = false;
  t.sim.step();
  assert.equal(t.state.massSeed.phase, 'collapsing', 'precondition: mirror still collapsing (repair-enabled window)');
  // Redeploy inside the window. spawnEntity pops the just-freed id (LIFO), so B recycles A's id.
  deployNow(t);
  const seedB = t.state.massSeed.seedId;
  assert.equal(seedB, seedA, 'setup: the replacement recycled the swept seed’s id (the aliasing precondition)');

  // Run past the retired seed's dying-beat despawn (~0.45s after the redeploy) — the replacement is
  // still early in its 1.6s travel and MUST remain alive.
  for (let i = 0; i < TICKS.collapse + 6; i++) t.sim.step();

  // CORRECT behavior (FAILS today): the fresh replacement survives; nothing was reported destroyed.
  const b = t.state.entities.get(seedB);
  assert(b && b.alive !== false, 'the replacement survives the retired seed’s dying-beat (not killed by id aliasing)');
  assert.equal(named(t, 'massSeed:destroyed').length, 0, 'no spurious destroyed: the retired seed’s cleanup must not kill the recycled-id replacement');
  const collapsedReasons = named(t, 'massSeed:collapsed').map((e) => e.p.reason);
  assert(!collapsedReasons.includes(MASS_SEED_CUT_REASONS.destroyed), 'no destroyed collapse for the replacement');
});
