// ORRERY Phase 1: the live flight HUD feeds the Cluster through one pure adapter.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildOrdnanceGroups, createCooldownTracker, readOrdnanceModel, readClusterModel,
} from '../src/ui/orrery/hudAdapter.js';
import { speedPhase } from '../src/ui/orrery/flightCluster.js';
import { RAIL_SLOTS } from '../src/ui/powerRail.js';

function fakeState(extra = {}) {
  const entities = new Map();
  const player = {
    id: 7, alive: true, type: 'ship',
    hull: 60, hullMax: 120, shield: 30, shieldMax: 60, armorHp: 12, armorMax: 40,
    cap: 45, capMax: 90, maxSpeed: 150, rot: 0, vel: { x: 0, z: 100 },
    boost: { energy: 25, max: 100 },
    data: { weapons: [], impulseCharges: { throwCdT: 0 } },
  };
  entities.set(7, player);
  return {
    state: { playerId: 7, entities, entityList: [...entities.values()], simTime: 10, player: { cargo: { items: {} } }, fields: {}, ...extra },
    player,
  };
}

test('every rail slot lands in exactly one group, keyed by its rail index', () => {
  const groups = buildOrdnanceGroups(null);
  const ids = groups.flatMap((g) => g.slots.map((s) => s.id));
  assert.deepEqual(ids.sort(), RAIL_SLOTS.map((s) => String(s.index)).sort());
  for (const g of groups) {
    assert.ok(g.name && g.icon, 'each group carries a name and an icon');
    for (const s of g.slots) assert.ok(s.name && s.icon && s.key, `slot ${s.id} carries a name, icon and key`);
  }
});

test('the cluster model reads the same sources as the old instruments', () => {
  const { state, player } = fakeState();
  const m = readClusterModel(state, player, { ordnance: {} });
  assert.equal(m.hull, 60);
  assert.equal(m.hullMax, 120);
  assert.equal(m.shield, 30);
  assert.equal(m.armor, 12);
  assert.equal(m.energy, 45, 'energy is the capacitor, as the live HUD reads it');
  assert.equal(m.energyMax, 90);
  assert.equal(m.speed, 100);
  assert.equal(m.speedRef, 150);
  assert.equal(m.boost, 0.25);
  assert.equal(m.tether, null, 'no line, no tether instrument');
  // velocity along +z with the nose at rot 0 (+x): the ship is sliding 90° off its nose
  assert.equal(Math.round(m.drift), 90);
});

test('no drift is reported at a crawl, and missing numbers never become NaN', () => {
  const { state, player } = fakeState();
  player.vel = { x: 3, z: 2 };
  player.shieldMax = undefined;
  const m = readClusterModel(state, player, { ordnance: {} });
  assert.equal(m.drift, 0);
  for (const [k, v] of Object.entries(m)) if (typeof v === 'number') assert.ok(Number.isFinite(v), `${k} is finite`);
});

test('the rail states map onto the Cluster vocabulary', () => {
  const { state } = fakeState();
  state.player.tether = { active: true };
  state.fields.cooldowns = { well: 12 };
  state.player.cargo.items.cmdty_impulse_charge = 3;
  const ord = readOrdnanceModel(state, createCooldownTracker());
  assert.equal(ord['3'].state, 'armed', 'an active line is the armed slot');
  assert.equal(ord['5'].state, 'cooldown', 'a well on cooldown reads as cooling');
  assert.equal(typeof ord['5'].cooldown, 'number');
  assert.equal(ord['1'].count, 3, 'the charge count rides along');
});

test('the cooldown tracker turns time-left into a rising fraction', () => {
  const frac = createCooldownTracker();
  assert.equal(frac(5, { state: 'cooling', cooldownMs: 4000 }), 0);
  assert.equal(frac(5, { state: 'cooling', cooldownMs: 1000 }), 0.75);
  assert.equal(frac(5, { state: 'ready' }), null);
  assert.equal(frac(5, { state: 'cooling', cooldownMs: 2000 }), 0, 'a fresh cooldown restarts the sweep');
});

test('the speed Scale phases against the displayed reading: asleep, flight, above reference', () => {
  assert.equal(speedPhase(0, 180), 'rest');
  assert.equal(speedPhase(0.4, 180), 'rest', 'below a crawl the numeral reads 0 and the instrument sleeps');
  assert.equal(speedPhase(0.5, 180), 'flight');
  assert.equal(speedPhase(90, 180), 'flight');
  assert.equal(speedPhase(180.4, 180), 'flight', 'the displayed numeral (180) is not above reference');
  assert.equal(speedPhase(180.6, 180), 'over', 'the displayed numeral (181) is above reference — ice');
  assert.equal(speedPhase(672, 400), 'over', 'travel and tether legitimately exceed the reference');
  assert.equal(speedPhase(-12, 400), 'rest');
  assert.equal(speedPhase(90, undefined), 'flight', 'a missing reference reads the 180 default');
  assert.equal(speedPhase(NaN, 180), 'rest', 'no reading, no light');
});

test('every ordnance key explains itself: bank sentence, live keys and live state in one tip', () => {
  const bindings = {
    chargeThrow: ['KeyY', 'Digit1'], chargeDetonate: ['KeyR', 'Digit2'], tether: ['Space', 'KeyF', 'Digit3'],
  };
  const { state } = fakeState();
  state.player.cargo.items.cmdty_impulse_charge = 0;
  const ord = readOrdnanceModel(state, createCooldownTracker(), bindings);
  assert.equal(ord['1'].tip,
    'Charge — throw an impulse charge that sticks where it lands (1 · Y)\nNo impulse charges in cargo');
  assert.match(ord['3'].tip, /\(3 · Space · F\)\nReady$/);
  assert.match(ord['2'].tip, /Nothing armed to detonate$/);
  // A collapsed node answers "what is in this band" without unfolding it.
  const groups = buildOrdnanceGroups(bindings);
  assert.equal(groups[0].tip, 'Ordnance — Charge 1 · Blast 2 · Line 3');
  assert.equal(groups[0].slots[0].key, '1', 'the shelf reads as the 1–9 hotbar the player reaches for');
});

test('the Cluster writes each tip to a hoverable, focusable socket (the tier-2 seat)', () => {
  const src = readFileSync(new URL('../src/ui/orrery/flightCluster.js', import.meta.url), 'utf8');
  assert.match(src, /k\.setAttribute\('tabindex', '0'\)/, 'a verb key answers keyboard focus');
  assert.match(src, /k\.setAttribute\(node \? 'data-group' : 'data-slot', id\)/, 'a socket names its verb');
  assert.match(src, /if \(tip\) k\.setAttribute\('data-why', tip\)/, 'the bank phrase rides the socket');
  assert.match(src, /if \(tip\) sk\.el\.setAttribute\('data-why', tip\)/, 'the live state line moves with the model');
  assert.match(src, /pointer-events:auto/, 'a verb key answers the cursor so the reveal can fire');
});

test('hud.js mounts the Cluster once and feeds it once per frame', () => {
  const src = readFileSync(new URL('../src/ui/hud.js', import.meta.url), 'utf8');
  assert.equal((src.match(/mountOrreryCluster\(/g) || []).length, 1);
  assert.equal((src.match(/orreryCluster\.update\(/g) || []).length, 1);
  // with ORRERY on, the old left column is not an obstacle and the edge arrow avoids the instrument
  assert.match(src, /objectiveEdgeBoxes\.orrery = orreryCluster/);
});

test('a settled Cluster frame writes nothing: springs at rest ignore a repeat target', async () => {
  const { createSpring } = await import('../src/ui/orrery/motion.js');
  let paints = 0;
  const saved = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = () => 1;
  try {
    const sp = createSpring({ value: 0, onUpdate: () => { paints += 1; } });
    sp.set(0);
    sp.set(0);
    assert.equal(paints, 0);
    sp.set(0.5, { instant: true });
    assert.equal(paints, 1);
    sp.set(0.5);
    assert.equal(paints, 1);
  } finally {
    globalThis.requestAnimationFrame = saved;
  }
});
