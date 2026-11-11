// inf-latch-heft-read (WF-12): the Line's bite reads what it caught. The anchor end of the latch
// used to fire one white spark disc for every body; it now wears the caught body's substance
// (grit / glitter / glints / sparks, via the shared impact classifier) and its heft (the HUD F4
// bridle share, on the HUD's own thresholds): loose bodies spray more and faster with no ring,
// heavy ones throw fewer, bigger, slower chunks and roll a ring sized to their own radius. A
// shield that takes the bite keeps today's disc; a body with no surface and no mass claims nothing.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LATCH_DISC_C0,
  LATCH_HEFT_SPRAY,
  latchBodyMass,
  latchHeftBand,
  latchHeftPlan,
  latchHeftShare,
  latchHeftSprayKey,
} from '../src/render/vfx/latchHeftRead.js';
import { createTetherCableEventMethods } from '../src/render/vfx/tetherCableEventMethods.js';
import { massPreviewRead } from '../src/ui/masslineHud.js';

const SHIP_MASS = 100;

function rock(id, mass, data = {}, extra = {}) {
  return { id, type: 'asteroid', alive: true, pos: { x: 200, z: 0 }, radius: 12, mass, data, ...extra };
}

test('heft bands sit on the HUD F4 thresholds, so the picture and the words agree', () => {
  const words = { anchor: "WON'T BUDGE", heavy: 'HEAVY HAUL', even: 'EVEN PULL', loose: 'SWINGS LOOSE' };
  for (const mass of [10, 40, 60, 99, 150, 300, 500, 2000]) {
    const band = latchHeftBand(latchHeftShare(mass, SHIP_MASS));
    const hud = massPreviewRead({ mass }, SHIP_MASS);
    assert.ok(hud.word.endsWith(words[band]), `mass ${mass}: band ${band} vs HUD '${hud.word}'`);
  }
  assert.equal(latchHeftBand(NaN), null, 'no mass, no band');
  assert.equal(latchHeftShare(50, 0), NaN);
  assert.equal(latchBodyMass({ physicsBody: { mass: 70 }, mass: 5 }), 70, 'the coupled physics mass wins');
  assert.equal(latchBodyMass({ mass: 5 }), 5);
  assert.ok(Number.isNaN(latchBodyMass({})));
});

test('substance comes from the shared impact classifier', () => {
  assert.equal(latchHeftSprayKey(rock(1, 50, { substance: 'silicate' })), 'rock');
  assert.equal(latchHeftSprayKey(rock(1, 50, { substance: 'ice' })), 'ice');
  assert.equal(latchHeftSprayKey(rock(1, 50, { material: 'cryo' })), 'ice');
  assert.equal(latchHeftSprayKey(rock(1, 50, { material: 'crystal' })), 'ceramic');
  assert.equal(latchHeftSprayKey(rock(1, 50, { material: 'metal' })), 'metal');
  assert.equal(latchHeftSprayKey(rock(1, 50)), 'rock', 'a bare rock is rock');
  assert.equal(latchHeftSprayKey({ id: 2, type: 'ship', pos: { x: 0, z: 0 } }), 'metal', 'a hull sheds sparks');
  assert.equal(latchHeftSprayKey({ id: 3, type: 'pickup', pos: { x: 0, z: 0 } }), null, 'unknown claims nothing');
});

test('plan: loose bodies spray more and faster with no ring; heavy ones roll a radius-sized ring', () => {
  const ship = { mass: SHIP_MASS };
  const loose = latchHeftPlan(rock(1, 20, { substance: 'ice' }), ship, false, {});
  const heavy = latchHeftPlan(rock(2, 200, { substance: 'ice' }), ship, false, {});
  const anchor = latchHeftPlan(rock(3, 2000, { substance: 'ice' }), ship, false, {});
  assert.equal(loose.band, 'loose');
  assert.equal(loose.ringLive, false, 'a body that swings loose seats no load');
  assert.ok(loose.countMul > heavy.countMul && heavy.countMul > anchor.countMul, 'heavier throws fewer');
  assert.ok(loose.speedMul > heavy.speedMul && heavy.speedMul > anchor.speedMul, 'heavier throws slower');
  assert.ok(anchor.sizeMul > heavy.sizeMul && heavy.sizeMul > loose.sizeMul, 'heavier throws bigger chunks');
  assert.ok(heavy.ringLive && anchor.ringLive);
  assert.equal(heavy.ringSize0, 24, 'the ring leaves the hull edge (full width = 2 × radius)');
  assert.ok(anchor.ringSize1 > heavy.ringSize1 && anchor.ringLife > heavy.ringLife, 'won\'t budge rolls widest and slowest');
  const big = latchHeftPlan(rock(4, 200, { substance: 'ice' }, { radius: 40 }), ship, false, {});
  assert.ok(big.ringSize1 > heavy.ringSize1 * 3, 'a big body reads big');
  const mountain = latchHeftPlan(rock(5, 1e6, {}, { radius: 900 }), ship, false, {});
  assert.ok(mountain.ringSize1 <= 2 * 90 * 2.0 + 1e-9, 'the ring reach is clamped');
});

test('plan: substance owns the palette; unknown surface with a mass keeps the white disc', () => {
  const ship = { mass: SHIP_MASS };
  const ice = latchHeftPlan(rock(1, 100, { substance: 'ice' }), ship, false, {});
  const grit = latchHeftPlan(rock(2, 100, { substance: 'silicate' }), ship, false, {});
  assert.equal(ice.c0, LATCH_HEFT_SPRAY.ice.c0);
  assert.equal(grit.c0, LATCH_HEFT_SPRAY.rock.c0);
  assert.ok(ice.speedMul > grit.speedMul, 'ice glitters faster than grit');
  assert.ok(grit.lifeMul > ice.lifeMul, 'grit hangs longer than glitter');
  const pod = latchHeftPlan({ id: 9, type: 'pickup', pos: { x: 0, z: 0 }, radius: 3, mass: 300 }, ship, false, {});
  assert.equal(pod.live, true);
  assert.equal(pod.c0, LATCH_DISC_C0, 'unknown surface keeps today\'s disc colour');
  assert.equal(pod.c1, null);
  assert.equal(pod.ringLive, true, 'but its mass still seats a ring');
  const nothing = latchHeftPlan({ id: 10, type: 'pickup', pos: { x: 0, z: 0 } }, ship, false, {});
  assert.equal(nothing.live, false, 'no surface and no mass claims nothing');
  const noMass = latchHeftPlan(rock(11, undefined, { substance: 'ice' }), ship, false, {});
  assert.equal(noMass.live, true);
  assert.equal(noMass.ringLive, false, 'no ring without a mass to justify it');
});

test('plan: reduced motion stretches the read, never silences it', () => {
  const ship = { mass: SHIP_MASS };
  const full = latchHeftPlan(rock(1, 400, { substance: 'ice' }), ship, false, {});
  const calm = latchHeftPlan(rock(1, 400, { substance: 'ice' }), ship, true, {});
  assert.ok(calm.countMul > 0 && calm.countMul < full.countMul);
  assert.ok(calm.speedMul < full.speedMul);
  assert.ok(calm.lifeMul > full.lifeMul, 'spray lives longer');
  assert.ok(calm.ringLive && calm.ringLife > full.ringLife && calm.ringOp < full.ringOp && calm.ringOp > 0);
});

// ---- the live latch handler -------------------------------------------------------------

function latchHost(entities, { reduced = false } = {}) {
  let seed = 7;
  const methods = createTetherCableEventMethods({
    SPR_FLASH: 'flash', SPR_RING: 'ring',
    random: () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; },
  });
  const particles = [];
  const sprites = [];
  const color = () => ({ hex: null, set(h) { this.hex = h; return this; } });
  const host = Object.assign({}, methods, {
    _scene: {},
    state: { playerId: 'p' },
    _ent: (id) => entities.get(id) || null,
    _c0: color(), _c1: color(), _burst: 1,
    _spawnParticle: (x, z, vx, vz, life, size0, size1, c0, c1, drag) => particles.push({
      x, z, speed: Math.hypot(vx, vz), life, size0, c0: c0.hex, c1: c1.hex, drag,
    }),
    _spawnSprite: (kind, x, y, z, life, size0, size1, op0, op1, col) => sprites.push({ kind, x, z, life, size0, size1, op0, col }),
    _eventLight: () => {},
    _spawnProjectileTrailStreak: () => {},
    _resetMasslineReleaseArc: () => {}, _resetMasslineSwingTrace: () => {}, _resetMonofilamentBlade: () => {},
    _emitJuiceCue: () => {},
    _causeNow: () => 0,
    _isReduced: () => reduced,
  });
  return { host, particles, sprites };
}

function world(target) {
  return new Map([
    ['p', { id: 'p', type: 'ship', alive: true, pos: { x: 0, z: 0 }, rot: 0, radius: 6, mass: SHIP_MASS }],
    [target.id, target],
  ]);
}

function anchorDisc(particles, target) {
  return particles.filter((q) => q.x === target.pos.x && q.z === target.pos.z);
}

test('live latch: an ice sliver glitters loose, a heavy ice slab throws slow chunks under a ring', () => {
  const sliver = rock('ice-s', 20, { substance: 'ice' });
  const s = latchHost(world(sliver));
  s.host._onTetherLatch({ actorId: 'p', targetId: sliver.id });
  const sDisc = anchorDisc(s.particles, sliver);
  assert.ok(sDisc.length > 14, `a loose body throws more than the authored 14: ${sDisc.length}`);
  assert.ok(sDisc.every((q) => q.c0 === LATCH_HEFT_SPRAY.ice.c0 && q.c1 === LATCH_HEFT_SPRAY.ice.c1), 'ice glitter palette');
  assert.equal(s.sprites.filter((q) => q.kind === 'ring').length, 0, 'no ring for a loose body');

  const slab = rock('ice-h', 2000, { substance: 'ice' });
  const h = latchHost(world(slab));
  h.host._onTetherLatch({ actorId: 'p', targetId: slab.id });
  const hDisc = anchorDisc(h.particles, slab);
  assert.ok(hDisc.length < sDisc.length, 'the slab throws fewer');
  const avg = (rows, k) => rows.reduce((a, q) => a + q[k], 0) / rows.length;
  assert.ok(avg(hDisc, 'speed') < avg(sDisc, 'speed'), 'and slower');
  assert.ok(hDisc[0].size0 > sDisc[0].size0, 'and bigger');
  const rings = h.sprites.filter((q) => q.kind === 'ring');
  assert.equal(rings.length, 1, 'the load seats one ring');
  assert.equal(rings[0].x, slab.pos.x);
  assert.equal(rings[0].size0, slab.radius * 2);
  assert.equal(rings[0].col, LATCH_HEFT_SPRAY.ice.ring);
  // The connection read is untouched: both ends still flash the Line's cyan.
  assert.equal(h.sprites.filter((q) => q.kind === 'flash' && q.col === '#a6f0ff').length, 2);
});

test('live latch: grit and metal read apart; a shield taking the bite keeps today\'s disc', () => {
  const grit = rock('g', 150, { substance: 'silicate' });
  const g = latchHost(world(grit));
  g.host._onTetherLatch({ actorId: 'p', targetId: grit.id });
  assert.ok(anchorDisc(g.particles, grit).every((q) => q.c0 === LATCH_HEFT_SPRAY.rock.c0));

  const hull = { id: 'h', type: 'ship', alive: true, pos: { x: 150, z: 0 }, radius: 8, mass: 120 };
  const m = latchHost(world(hull));
  m.host._onTetherLatch({ actorId: 'p', targetId: hull.id });
  assert.ok(anchorDisc(m.particles, hull).every((q) => q.c0 === LATCH_HEFT_SPRAY.metal.c0), 'a hull sheds hot sparks');

  const shielded = { ...hull, id: 'sh', shield: 40 };
  const sh = latchHost(world(shielded));
  sh.host._onTetherLatch({ actorId: 'p', targetId: shielded.id });
  const disc = anchorDisc(sh.particles, shielded);
  assert.equal(disc.length, 14, 'the authored disc count');
  assert.ok(disc.every((q) => q.c0 === LATCH_DISC_C0), 'the shell\'s bite keeps the white disc');
  assert.equal(sh.sprites.filter((q) => q.kind === 'ring').length, 0);
});

test('live latch: a body with no surface and no mass reads exactly as before', () => {
  const pod = { id: 'pod', type: 'pickup', alive: true, pos: { x: 120, z: 0 }, radius: 3 };
  const h = latchHost(world(pod));
  h.host._onTetherLatch({ actorId: 'p', targetId: pod.id });
  const disc = anchorDisc(h.particles, pod);
  assert.equal(disc.length, 14);
  assert.ok(disc.every((q) => q.c0 === LATCH_DISC_C0 && q.c1 === '#39d0ff' && q.size0 === 1.35 && q.drag === 2.8));
  assert.equal(h.sprites.filter((q) => q.kind === 'ring').length, 0);
});

test('live latch: reduced motion keeps the ring and the spray, slower and softer', () => {
  const slab = rock('r', 2000, { substance: 'silicate' });
  const full = latchHost(world(slab));
  full.host._onTetherLatch({ actorId: 'p', targetId: slab.id });
  const calm = latchHost(world(slab), { reduced: true });
  calm.host._onTetherLatch({ actorId: 'p', targetId: slab.id });
  const ringFull = full.sprites.find((q) => q.kind === 'ring');
  const ringCalm = calm.sprites.find((q) => q.kind === 'ring');
  assert.ok(ringCalm && ringCalm.life > ringFull.life && ringCalm.op0 < ringFull.op0);
  assert.ok(anchorDisc(calm.particles, slab).length >= 6, 'the spray is stretched, not silenced');
});
