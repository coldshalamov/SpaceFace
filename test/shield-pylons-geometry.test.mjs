/**
 * Linked Shield Pylons (packet 06) — the pure geometry and the permission matrix.
 *
 * Covers the one geometric fact every attack path reads: a segment with thickness in the XZ plane,
 * round end-caps, first-contact sweep of a disc against a static panel (exact) and a moving panel
 * (sub-stepped), from BOTH faces, near an end-cap, glancing, at tunnelling speeds, with a swinging
 * wall — and the relation-selective permission table from the packet.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  makePanel, writePanel, sweepDiscVsPanel, sweepDiscVsMovingPanel, distanceToAxis,
  discTouchesPanel, sideOfPanel, panelBounds, sweptPanelBounds, segmentMayTouchBounds,
} from '../src/combat/pylonShieldGeometry.js';
import {
  PYLON_CONTACT as C, PYLON_RELATION as R, PYLON_PERMISSION, blocksContact, classifyBody,
  resolveRelation, contactEnergy,
} from '../src/combat/pylonShieldPolicy.js';
import { SHIELD_PYLON_DEF } from '../src/data/shieldPylons.js';

const H = 2.2;
// A 100-WU wall on the x axis: A(-50,0) -> B(50,0). Left normal = (0,1) (the +z side).
const wall = () => makePanel(-50, 0, 50, 0, H);
const hit = () => ({ t: 0, cx: 0, cz: 0, x: 0, z: 0, nx: 0, nz: 0, side: 0, startInside: false, part: '' });

test('panel frame: axis, length, left normal', () => {
  const p = wall();
  assert.equal(p.len, 100);
  assert.deepEqual([p.ux, p.uz], [1, 0]);
  assert.deepEqual([p.nx, p.nz], [0, 1]);
  const d = makePanel(0, 0, 0, 80, H);
  assert.deepEqual([d.ux, d.uz], [0, 1]);
  assert.equal(d.nx, -1);
  const zero = makePanel(5, 5, 5, 5, H);
  assert.equal(zero.len, 0);
  assert.ok(Number.isFinite(zero.ux) && Number.isFinite(zero.nz), 'a zero-length panel keeps a valid frame');
});

test('a round crossing the wall stops at the near surface from BOTH faces', () => {
  const p = wall();
  const out = hit();
  // From the +z side moving -z.
  assert.equal(sweepDiscVsPanel(out, p, 0, 40, 0, -40, 0), true);
  assert.ok(Math.abs(out.z - H) < 1e-9, `contact on the +z surface, got ${out.z}`);
  assert.equal(out.nz, 1, 'normal points back at the attacker side');
  assert.equal(out.side, 1);
  assert.ok(Math.abs(out.t - (40 - H) / 80) < 1e-9);
  // From the -z side moving +z: the mirror image.
  assert.equal(sweepDiscVsPanel(out, p, 0, -40, 0, 40, 0), true);
  assert.ok(Math.abs(out.z + H) < 1e-9);
  assert.equal(out.nz, -1);
  assert.equal(out.side, -1);
});

test('thickness is real: a body of radius r meets the wall r+h before the axis', () => {
  const p = wall();
  const out = hit();
  assert.equal(sweepDiscVsPanel(out, p, 0, 30, 0, -30, 6), true);
  assert.ok(Math.abs(out.cz - (H + 6)) < 1e-9, 'centre stops at h+r');
  assert.ok(Math.abs(out.z - H) < 1e-9, 'the reported surface point is still the wall surface');
  // A path that ends short of the thick surface never touches.
  assert.equal(sweepDiscVsPanel(out, p, 0, 30, 0, H + 6 + 0.01, 6), false);
  assert.equal(sweepDiscVsPanel(out, p, 0, 30, 0, H + 6 - 0.01, 6), true);
});

test('past the end of the wall the path is clear; a path into the end-cap is stopped by the cap', () => {
  const p = wall();
  const out = hit();
  // Well beyond B on x: passes.
  assert.equal(sweepDiscVsPanel(out, p, 60, 30, 60, -30, 0), false);
  // Just inside the cap radius beyond B: hits the cap, normal leans outward along +x.
  assert.equal(sweepDiscVsPanel(out, p, 50 + H - 0.2, 30, 50 + H - 0.2, -30, 0), true);
  assert.equal(out.part, 'capB');
  assert.ok(out.nx > 0 && out.nz > 0, 'cap normal points away from the endpoint centre');
  assert.ok(Math.abs(Math.hypot(out.cx - 50, out.cz) - H) < 1e-9, 'contact lies on the cap circle');
  // Just outside the cap: clear.
  assert.equal(sweepDiscVsPanel(out, p, 50 + H + 0.2, 30, 50 + H + 0.2, -30, 0), false);
  // Mirror at A.
  assert.equal(sweepDiscVsPanel(out, p, -50 - H + 0.2, -30, -50 - H + 0.2, 30, 0), true);
  assert.equal(out.part, 'capA');
});

test('glancing crossings: a shallow ray still hits; a ray parallel inside the thickness starts inside', () => {
  const p = wall();
  const out = hit();
  // Skims in at ~1.4 degrees from outside the span: z reaches the thick surface only past x=-50, so
  // the first contact is the A end-cap, not the face.
  assert.equal(sweepDiscVsPanel(out, p, -200, 5, 200, -5, 0), true);
  assert.equal(out.part, 'capA');
  assert.ok(out.x < -50 && out.x > -53, `cap contact just beyond A, got ${out.x}`);
  // The same slope starting over the span meets the FACE inside it.
  assert.equal(sweepDiscVsPanel(out, p, -40, 3, 40, -3, 0), true);
  assert.equal(out.part, 'face');
  assert.ok(out.x > -40 && out.x < 40, `face contact along the span, got ${out.x}`);
  // Parallel to the wall, just outside the thickness: no contact.
  assert.equal(sweepDiscVsPanel(out, p, -200, H + 0.05, 200, H + 0.05, 0), false);
  // Parallel to the wall inside the thickness band: runs into the A end-cap and stops there.
  assert.equal(sweepDiscVsPanel(out, p, -200, 1, 200, 1, 0), true);
  assert.equal(out.part, 'capA');
  assert.ok(out.cx < -50 && out.cx > -50 - H, `stopped at the cap, got ${out.cx}`);
});

test('a path that starts inside the footprint reports startInside with t=0 and an outward normal', () => {
  const p = wall();
  const out = hit();
  assert.equal(sweepDiscVsPanel(out, p, 10, 1, 10, 40, 0), true);
  assert.equal(out.startInside, true);
  assert.equal(out.t, 0);
  assert.equal(out.nz, 1);
  assert.equal(sweepDiscVsPanel(out, p, 10, -1, 10, -40, 0), true);
  assert.equal(out.nz, -1);
});

test('fast projectile tunnelling: a 150 km/s shell cannot step over the wall in one tick', () => {
  const p = wall();
  const out = hit();
  const v = 150000;
  const dt = 1 / 60;
  const dz = v * dt; // 2500 WU in one tick
  assert.equal(sweepDiscVsPanel(out, p, 0, dz / 2, 0, -dz / 2, 0.5), true);
  assert.ok(out.t > 0 && out.t < 1);
  // And the end points straddle the wall, so a sampled-endpoint test would have missed it.
  assert.ok(Math.sign(dz / 2) !== Math.sign(-dz / 2));
});

test('a swinging wall cannot be tunnelled through by a stationary or slow body (moving sweep)', () => {
  const prev = makePanel(-50, 0, 50, 0, H);
  // The wall swings 90 degrees about its centre in one tick: A:(-50,0)->(0,-50), B:(50,0)->(0,50).
  const cur = makePanel(0, -50, 0, 50, H);
  const out = hit();
  // A stationary mote at (30, 30)... off the swept area: the wall sweeps through its quadrant
  // (the points between the prev and cur axes), so a mote at (25, 25) is swept over.
  assert.equal(sweepDiscVsMovingPanel(out, prev, cur, 25, 25, 25, 25, 0), true,
    'a mote the swinging wall sweeps over is hit even though it did not move');
  assert.ok(out.t > 0 && out.t < 1, `contact is mid-tick, got ${out.t}`);
  // A mote far outside the sweep is not.
  assert.equal(sweepDiscVsMovingPanel(out, prev, cur, 80, 80, 80, 80, 0), false);
});

test('moving sweep agrees with the exact static sweep when the panel is at rest', () => {
  const p = wall();
  const out = hit();
  const ref = hit();
  const moving = sweepDiscVsMovingPanel(out, p, makePanel(-50, 0, 50, 0, H), 8, 30, 8, -30, 1);
  assert.equal(moving, true);
  assert.equal(sweepDiscVsPanel(ref, p, 8, 30, 8, -30, 1), true);
  assert.ok(Math.abs(out.t - ref.t) < 1e-12);
});

test('moving sweep: a wall translating into a stationary hull hits at the right time', () => {
  const prev = makePanel(-50, 20, 50, 20, H);
  const cur = makePanel(-50, -20, 50, -20, H);   // slides 40 WU in -z across the tick
  const out = hit();
  // A hull at the origin (radius 5): the wall arrives when its axis is within h+5 of z=0.
  assert.equal(sweepDiscVsMovingPanel(out, prev, cur, 0, 0, 0, 0, 5), true);
  // axis z(τ) = 20 - 40τ ; contact when z = h+5 = 7.2  => τ = (20-7.2)/40 = 0.32
  assert.ok(Math.abs(out.t - 0.32) < 5e-3, `expected ~0.32, got ${out.t}`);
  assert.equal(out.nz > 0, false, 'the wall comes from +z side: the hull sits on its -z face');
});

test('moving sweep: sub-stepping covers a fast round meeting a moving wall', () => {
  const prev = makePanel(-50, 3, 50, 3, H);
  const cur = makePanel(-50, -3, 50, -3, H);
  const out = hit();
  // A 30 000 WU/s shell going the long way across: 500 WU in the tick.
  assert.equal(sweepDiscVsMovingPanel(out, prev, cur, 0, 250, 0, -250, 0.4), true);
  assert.ok(out.t > 0.4 && out.t < 0.6, `contact near mid-tick, got ${out.t}`);
});

test('point tests: footprint overlap, side of the wall, bounds', () => {
  const p = wall();
  assert.equal(discTouchesPanel(p, 0, 2, 0), true);
  assert.equal(discTouchesPanel(p, 0, 2.3, 0), false);
  assert.equal(discTouchesPanel(p, 0, 7, 5), true);
  assert.equal(discTouchesPanel(p, 0, 12, 5, 6), true, 'pad widens the test');
  assert.equal(sideOfPanel(p, 0, 9), 1);
  assert.equal(sideOfPanel(p, 0, -9), -1);
  assert.equal(sideOfPanel(p, 0, 0), 0);
  const d = distanceToAxis(p, 80, 0);
  assert.equal(d, 30);
  const b = panelBounds(p, 4);
  assert.deepEqual([b.minX, b.maxX, b.minZ, b.maxZ].map((v) => Math.round(v * 10) / 10), [-56.2, 56.2, -6.2, 6.2]);
  assert.equal(segmentMayTouchBounds(b, 0, 100, 0, 60), false);
  assert.equal(segmentMayTouchBounds(b, 0, 100, 0, -100), true);
  const sb = sweptPanelBounds(p, makePanel(0, -50, 0, 50, H), 0);
  assert.ok(sb.maxZ >= 50 && sb.minZ <= -50 && sb.maxX >= 50);
});

test('writePanel is allocation-free reuse and idempotent', () => {
  const scratch = makePanel(0, 0, 1, 0, 1);
  const same = writePanel(scratch, 3, 4, 3, 14, H);
  assert.equal(same, scratch);
  assert.equal(scratch.len, 10);
  assert.deepEqual([scratch.ux, scratch.uz], [0, 1]);
});

// ── Permission matrix (packet 06 table), both directions ─────────────────────────────────────

test('permission matrix: the packet table row by row', () => {
  // Player / permitted ally ship: passes in either direction (the policy has no direction input).
  assert.equal(blocksContact(C.SHIP, R.OWNER), false);
  assert.equal(blocksContact(C.SHIP, R.ALLY), false);
  // Hostile ship: blocked.
  assert.equal(blocksContact(C.SHIP, R.HOSTILE), true);
  // Neutral civilian: passes (the shield does not imprison routine traffic).
  assert.equal(blocksContact(C.SHIP, R.NEUTRAL), false);
  // Owner/allied projectile or beam passes; hostile is intercepted; an unowned hazard fails closed.
  for (const kind of [C.PROJECTILE, C.BEAM]) {
    assert.equal(blocksContact(kind, R.OWNER), false, `${kind} owner`);
    assert.equal(blocksContact(kind, R.ALLY), false, `${kind} ally`);
    assert.equal(blocksContact(kind, R.HOSTILE), true, `${kind} hostile`);
    assert.equal(blocksContact(kind, R.UNKNOWN), true, `${kind} unknown`);
  }
  // Neutral loose debris: blocked whatever its history; only an owner-attuned payload passes.
  for (const relation of [R.OWNER, R.ALLY, R.NEUTRAL, R.HOSTILE, R.UNKNOWN]) {
    assert.equal(blocksContact(C.DEBRIS, relation), true, `debris ${relation}`);
  }
  assert.equal(blocksContact(C.DEBRIS, R.ATTUNED), false);
  // Hostile explosion and electrical hop: blocked; the owner's pass.
  assert.equal(blocksContact(C.BLAST, R.HOSTILE), true);
  assert.equal(blocksContact(C.BLAST, R.OWNER), false);
  assert.equal(blocksContact(C.CHAIN, R.HOSTILE), true);
  assert.equal(blocksContact(C.CHAIN, R.ALLY), false);
  // Persistent force fields are a declared exception: nothing is claimed.
  for (const relation of Object.values(R)) assert.equal(blocksContact(C.FIELD, relation), false);
  // Unknown contact kinds fail closed.
  assert.equal(blocksContact('wormhole', R.OWNER), true);
});

test('classifyBody: craft, debris and the declared exemptions', () => {
  assert.equal(classifyBody({ type: 'ship' }), 'craft');
  assert.equal(classifyBody({ type: 'drone' }), 'craft');
  assert.equal(classifyBody({ type: 'asteroid' }), 'debris');
  assert.equal(classifyBody({ type: 'wreck' }), 'debris');
  assert.equal(classifyBody({ type: 'payload' }), 'debris');
  for (const type of ['pickup', 'projectile', 'bomb', 'mine', 'fieldEmitter', 'massSeed', 'station', 'planet', 'fx']) {
    assert.equal(classifyBody({ type }), 'exempt', type);
  }
  assert.equal(classifyBody(null), 'exempt');
});

test('resolveRelation: hostility comes from the injected oracle, never from team inequality', () => {
  const owner = { id: 1, team: 0 };
  const wingman = { id: 2, team: 0 };
  const civilian = { id: 3, team: 2 };
  const pirate = { id: 4, team: 1 };
  // A pirate the oracle says is NOT hostile (e.g. lawful patrol, player clean): team differs but it passes.
  const lawful = { id: 5, team: 1 };
  const hostile = (o, s) => s.id === 4;
  const ctx = { owner, isHostile: hostile, isAttuned: (s) => s.id === 9 };
  assert.equal(resolveRelation(owner, ctx), R.OWNER);
  assert.equal(resolveRelation(wingman, ctx), R.ALLY);
  assert.equal(resolveRelation(civilian, ctx), R.NEUTRAL);
  assert.equal(resolveRelation(pirate, ctx), R.HOSTILE);
  assert.equal(resolveRelation(lawful, ctx), R.NEUTRAL, 'team 1 vs team 0 alone is not hostility');
  assert.equal(resolveRelation({ id: 9, team: 7 }, ctx), R.ATTUNED);
  assert.equal(resolveRelation(null, ctx), R.UNKNOWN);
  assert.equal(resolveRelation(pirate, { owner: null }), R.UNKNOWN, 'a gone owner fails closed');
});

test('contactEnergy: one resource, never below the floor', () => {
  const def = SHIELD_PYLON_DEF;
  assert.equal(contactEnergy(C.PROJECTILE, { damage: 40 }, def), 40);
  assert.equal(contactEnergy(C.BEAM, { damage: 0.1 }, def), 0.1, 'a beam tick pays exactly what it delivers');
  assert.equal(contactEnergy(C.PROJECTILE, { damage: 0.1 }, def), def.minContactEnergy, 'a chip shot is never free');
  assert.equal(contactEnergy(C.BLAST, { damage: 120 }, def), 120);
  assert.equal(contactEnergy(C.BLAST, { baseImpulse: 5000 }, def), 5000 * def.blastEnergyFromImpulse);
  const ram = contactEnergy(C.SHIP, { mass: 28, dv: 60 }, def);
  assert.ok(ram > 150 && ram < def.capacity, `a light ram is a real cost but not a one-shot, got ${ram}`);
  assert.ok(PYLON_PERMISSION[C.SHIP][R.HOSTILE]);
});

test('static sweep matches a brute-force march on 4000 deterministic random paths', () => {
  let seed = 0x9e3779b9;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const p = makePanel(-30, 10, 45, -20, H);
  const out = hit();
  let hits = 0;
  for (let i = 0; i < 4000; i++) {
    const x0 = (rnd() - 0.5) * 240; const z0 = (rnd() - 0.5) * 240;
    const x1 = (rnd() - 0.5) * 240; const z1 = (rnd() - 0.5) * 240;
    const radius = rnd() < 0.5 ? 0 : rnd() * 8;
    const exact = sweepDiscVsPanel(out, p, x0, z0, x1, z1, radius);
    // Brute force: the first of 20000 samples whose centre is within h+radius of the axis.
    let first = -1;
    const N = 20000;
    for (let k = 0; k <= N; k++) {
      const t = k / N;
      if (distanceToAxis(p, x0 + (x1 - x0) * t, z0 + (z1 - z0) * t) <= H + radius) { first = t; break; }
    }
    if (first < 0) {
      assert.equal(exact, false, `path ${i}: exact reported a hit the march never saw (t=${out.t})`);
    } else {
      assert.equal(exact, true, `path ${i}: the march found contact at ${first} but exact missed`);
      assert.ok(Math.abs(out.t - first) < 2 / N + 1e-9, `path ${i}: exact ${out.t} vs march ${first}`);
      hits++;
    }
  }
  assert.ok(hits > 200, `the sample actually exercises hits, got ${hits}`);
});
