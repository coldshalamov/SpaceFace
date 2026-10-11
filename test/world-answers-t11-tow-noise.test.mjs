// THE WORLD ANSWERS — T11 half: the long tow draws pirates.
//
// While the player's line holds a heavy non-ship body, encounterDirector accrues noise.tow
// (proportional to towed mass, capped, decaying like mining noise) and feeds
// combatRate += min(1, noise.tow) * 0.4. tetherGameplay is read-only here (state.player.tether).
//
//   node --test test/world-answers-t11-tow-noise.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { tensionAccrualScale } from '../src/ai/tensionPolicy.js';

const SECTOR = 'sector_pallas_drift';

function boot(seed = 4242) {
  const sim = createSimulation({ seed, systems: [encounterDirector] });
  const { state } = sim;
  const director = sim.registry.get('encounterDirector');
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 8, mass: 40,
    hull: 100, hullMax: 100, data: { intent: {}, ai: {} },
  });
  state.playerId = player.id;
  return { sim, state, director, player };
}

function spawnHulk(h, mass, extra = {}) {
  return h.sim.spawn({
    type: 'wreck', team: 0, pos: { x: 60, z: 0 }, vel: { x: 0, z: 0 }, radius: 14, mass,
    hull: 100, hullMax: 100, data: {}, ...extra,
  });
}

function tow(h, hulk) {
  h.state.player.tether = { active: !!hulk, targetId: hulk ? hulk.id : null, strain: 0, load: 0 };
}

/** Advance the director by `n` windows of `stepS` sim seconds. */
function run(h, n, stepS = 5) {
  const dir = h.state.encounterDirector;
  if (h.state.simTime === 0 || h.state._towT == null) { h.state._towT = 0; h.state.simTime = 0; h.director.update(1, h.state); }
  for (let i = 0; i < n; i++) {
    h.state._towT += stepS;
    h.state.simTime = h.state._towT;
    dir.pending = [];
    h.director.update(1, h.state);
  }
  return dir.noise.tow || 0;
}

test('towing a heavy hulk raises noise.tow; a light one raises it less; bounded by the cap', () => {
  const heavy = boot();
  tow(heavy, spawnHulk(heavy, 400));
  const light = boot();
  tow(light, spawnHulk(light, 40));
  const idle = boot();

  const h1 = run(heavy, 6);
  const l1 = run(light, 6);
  const i1 = run(idle, 6);
  assert.ok(h1 > 0.5, `heavy tow builds noise (got ${h1})`);
  assert.ok(l1 > 0 && l1 < h1, `light tow builds less (${l1} < ${h1})`);
  assert.equal(i1, 0, 'no tow, no tow noise');

  run(heavy, 400); // a very long tow
  assert.ok(heavy.state.encounterDirector.noise.tow <= 3, 'bounded at the cap');
  assert.ok(heavy.state.encounterDirector.noise.tow > 1, 'and saturating the combat term');
});

test('releasing the line lets the noise decay', () => {
  const h = boot();
  const hulk = spawnHulk(h, 400);
  tow(h, hulk);
  const peak = run(h, 8);
  assert.ok(peak > 0.5);
  tow(h, null);
  const after = run(h, 8);
  assert.ok(after < peak, `decays after release (${after} < ${peak})`);
  const later = run(h, 40);
  assert.ok(later < after * 0.6, 'keeps decaying');
});

test('a towed hulk adds exactly min(1, noise.tow) * 0.4 to the combat rate', () => {
  const h = boot();
  const hulk = spawnHulk(h, 400);
  tow(h, hulk);
  run(h, 12); // noise.tow now well above 0
  const dir = h.state.encounterDirector;
  const noise = dir.noise.tow;
  assert.ok(noise > 0.5);

  // Same instant, same everything: the pressure an idle director accrues vs the towing one.
  const idle = boot();
  run(idle, 12);
  const stepS = 5;
  const accrueOnce = (host) => {
    const d = host.state.encounterDirector;
    d.pending = [];
    d.pressure.combat = 0;
    host.state._towT += stepS;
    host.state.simTime = host.state._towT;
    host.director.update(1, host.state);
    return d.pressure.combat;
  };
  const withTow = accrueOnce(h);
  const without = accrueOnce(idle);
  assert.ok(withTow > without, 'a heavy tow draws pirates faster');
  // noise.tow evolves inside the tick (decay then accrual) — the term uses the post-update value.
  const scale = tensionAccrualScale(h.state, 'combat');
  const expected = Math.min(1, dir.noise.tow) * 0.4 * stepS * scale;
  assert.ok(Math.abs((withTow - without) - expected) < 1e-9, `delta ${withTow - without} == ${expected}`);
});

test('a live ship on the line is a fight, not a tow: no tow noise', () => {
  const h = boot();
  const ship = h.sim.spawn({
    type: 'ship', team: 2, pos: { x: 60, z: 0 }, vel: { x: 0, z: 0 }, radius: 8, mass: 900,
    hull: 100, hullMax: 100, data: {},
  });
  tow(h, ship);
  assert.equal(run(h, 6), 0);
  // A body that no longer exists adds nothing either.
  tow(h, { id: 99999 });
  assert.equal(run(h, 3), 0);
});

test('old saves without noise.tow load quietly and keep the serialized shape (lazy key); corrupt values repair', () => {
  const h = boot();
  const dir = h.state.encounterDirector || (h.director.update(1, h.state), h.state.encounterDirector);
  delete dir.noise.tow;
  dir.noise.mining = 0.4;
  h.state.simTime = 5;
  h.director.update(1, h.state);
  // No tow ever happened: the key stays absent so goldens/serialized director bytes are unchanged.
  assert.equal(h.state.encounterDirector.noise.tow, undefined);
  assert.deepEqual(Object.keys(h.state.encounterDirector.noise), ['mining']);
  assert.ok(h.state.encounterDirector.noise.mining > 0 && h.state.encounterDirector.noise.mining <= 0.4);

  // The same old save then tows: the key appears and accrues from zero.
  tow(h, spawnHulk(h, 400));
  h.state.simTime = 10;
  h.director.update(1, h.state);
  assert.ok(h.state.encounterDirector.noise.tow > 0);

  const bare = boot();
  bare.director.update(1, bare.state);
  delete bare.state.encounterDirector.noise;
  bare.state.simTime = 5;
  bare.director.update(1, bare.state);
  assert.deepEqual(Object.keys(bare.state.encounterDirector.noise), ['mining']);
  assert.equal(bare.state.encounterDirector.noise.mining, 0);

  const garbage = boot();
  garbage.director.update(1, garbage.state);
  garbage.state.encounterDirector.noise.tow = 'NaN';
  garbage.state.simTime = 5;
  garbage.director.update(1, garbage.state);
  assert.equal(garbage.state.encounterDirector.noise.tow, 0);
});

test('a fresh director with no tow serializes exactly as before (no noise.tow key)', () => {
  const h = boot();
  h.director.update(1, h.state);
  h.state.simTime = 6;
  h.director.update(1, h.state);
  assert.deepEqual(h.state.encounterDirector.noise, { mining: 0 });
});

test('same seed twice → identical tow noise trace', () => {
  const trace = () => {
    const h = boot(4242);
    tow(h, spawnHulk(h, 250));
    const out = [];
    for (let i = 0; i < 5; i++) out.push(run(h, 2));
    return out;
  };
  assert.deepEqual(trace(), trace());
});
