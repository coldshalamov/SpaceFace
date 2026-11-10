// Packet 02: acquisition without thrash. The picker is pure — candidates, intent and the sim clock
// in, one stable answer out — so crossing ships, dwell, the rear gate, entry/exit thresholds, tie
// breaks, camera scale and recycled ids are all driven here exactly as the live refresh drives them.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ACQUISITION_PROTOTYPE as P,
  classifyPickIntent,
  createAcquisitionTracker,
  stepAcquisition,
} from '../src/combat/targetAcquisition.js';

const STEP = 0.12; // AUTO_TARGET_REFRESH_S
const ship = (id, x, z, extra = {}) => ({ id, gen: id * 10, x, z, radius: 8, ...extra });
const cursorIntent = (cx, cz, extra = {}) => ({ px: 0, pz: 0, hasCursor: true, cx, cz, ...extra });

function run(tracker, frames, intentAt, candidatesAt, opts = null) {
  const picks = [];
  for (let i = 0; i < frames; i += 1) {
    const now = i * STEP;
    picks.push(stepAcquisition(tracker, candidatesAt(i, now), intentAt(i, now), now, opts).id);
  }
  return picks;
}
const flips = (picks) => picks.reduce((n, id, i) => n + (i > 0 && id !== picks[i - 1] ? 1 : 0), 0);

test('two crossing ships never alternate: the held lock survives a long near-tie', () => {
  const tracker = createAcquisitionTracker();
  // A and B sweep through each other's positions (relative speed ~80 wu/s) while the cursor sits
  // between them; their cost difference changes sign several times but stays inside the margin.
  const at = (i) => {
    const t = i * STEP;
    return [ship(2, 300 + 12 * Math.sin(t * 5), 20), ship(3, 300 - 12 * Math.sin(t * 5), -20)];
  };
  const picks = run(tracker, 60, () => cursorIntent(300, 0), (i) => at(i));
  assert.equal(flips(picks), 0, `held ${picks[0]} throughout, got ${JSON.stringify(picks)}`);
  // sanity: the naive per-refresh argmin the old picker used DOES alternate on the same input
  let naive = null; let naiveFlips = 0;
  for (let i = 0; i < 60; i += 1) {
    const cs = at(i);
    const best = cs.map((c) => ({ c, cost: Math.hypot(c.x - 300, c.z) + 0.25 * Math.hypot(c.x, c.z) }))
      .sort((a, b) => a.cost - b.cost)[0].c.id;
    if (naive != null && best !== naive) naiveFlips += 1;
    naive = best;
  }
  assert.ok(naiveFlips >= 4, `the fixture must actually thrash a naive argmin (${naiveFlips} flips)`);
});

test('a real retarget wins only after the dwell, and only once', () => {
  const tracker = createAcquisitionTracker();
  const picks = run(tracker, 30,
    (i) => (i < 8 ? cursorIntent(300, 0) : cursorIntent(300, 220)), // the player moves to B and stays
    () => [ship(2, 300, 0), ship(3, 300, 220)]);
  assert.equal(picks[0], 2);
  assert.equal(picks[7], 2, 'still on A while the cursor is on A');
  const switchAt = picks.findIndex((id, i) => i >= 8 && id === 3);
  assert.ok(switchAt > 8, 'not on the first frame the cursor arrives');
  assert.ok((switchAt - 8) * STEP >= P.dwellS - 1e-9, `after dwell (${(switchAt - 8) * STEP}s)`);
  assert.ok((switchAt - 8) * STEP <= P.dwellS + 2 * STEP, 'and promptly, not lazily');
  assert.equal(flips(picks), 1, 'exactly one switch');
});

test('a challenger that changes restarts the dwell', () => {
  const tracker = createAcquisitionTracker();
  stepAcquisition(tracker, [ship(2, 300, 0)], cursorIntent(300, 0), 0);
  // the cursor visits B for less than the dwell, then C: neither may take the lock
  const cands = [ship(2, 300, 0), ship(3, 300, 150), ship(4, -300, 150)];
  stepAcquisition(tracker, cands, cursorIntent(300, 150), 0.12);
  stepAcquisition(tracker, cands, cursorIntent(-300, 150), 0.24);
  const r = stepAcquisition(tracker, cands, cursorIntent(-300, 150), 0.36);
  assert.equal(r.id, 2, 'C has only been challenger for 0.12 s');
  const r2 = stepAcquisition(tracker, cands, cursorIntent(-300, 150), 0.60);
  assert.equal(r2.id, 4, 'C holds the margin past the dwell');
});

test('a contact behind the player is never acquired automatically, and Tab remains the way in', () => {
  const behind = ship(9, -180, 0);
  const t1 = createAcquisitionTracker();
  // cursor out ahead, nothing there; the only hostile is directly behind
  assert.equal(stepAcquisition(t1, [behind], cursorIntent(400, 0), 0).id, null, 'cursor intent ahead');
  const t2 = createAcquisitionTracker();
  assert.equal(stepAcquisition(t2, [behind], { px: 0, pz: 0, hasCursor: false, aimAngle: 0 }, 0).id, null, 'ray intent ahead');
  // ... but a cursor placed ON it is explicit intent
  const t3 = createAcquisitionTracker();
  assert.equal(stepAcquisition(t3, [behind], cursorIntent(-182, 4), 0).id, 9);
  // forward contact wins over a nearer one behind
  const t4 = createAcquisitionTracker();
  assert.equal(stepAcquisition(t4, [behind, ship(5, 500, 10)], cursorIntent(400, 0), 0).id, 5);
});

test('a held lock that drifts behind stays held until a forward challenger earns it', () => {
  const t = createAcquisitionTracker();
  stepAcquisition(t, [ship(9, 200, 0)], cursorIntent(220, 0), 0);
  for (let i = 1; i < 20; i += 1) {
    const r = stepAcquisition(t, [ship(9, -150, 10)], cursorIntent(400, 0), i * STEP);
    assert.equal(r.id, 9, 'the enemy on your tail keeps the lock');
  }
  let id = 9;
  for (let i = 20; i < 30; i += 1) {
    id = stepAcquisition(t, [ship(9, -150, 10), ship(6, 420, 0)], cursorIntent(420, 0), i * STEP).id;
  }
  assert.equal(id, 6, 'the cursor on a forward ship takes it after the dwell');
});

test('entry and exit radii: the cursor must be near a NEW contact, the incumbent holds out to exit', () => {
  const near = ship(2, 300, 0);
  const t = createAcquisitionTracker();
  stepAcquisition(t, [near], cursorIntent(300, 0), 0);
  // cursor drifts 50 wu off the incumbent (inside exit 60, outside enter 36): another ship at the
  // cursor needs the margin AND the dwell, not just proximity
  const other = ship(3, 350, 50);
  let r;
  for (let i = 1; i < 6; i += 1) r = stepAcquisition(t, [near, other], cursorIntent(350, 50), i * STEP);
  assert.equal(r.id, 3, 'on the new ship (cursor on it, incumbent 70 wu off, beyond exit)');
  const t2 = createAcquisitionTracker();
  stepAcquisition(t2, [near], cursorIntent(300, 0), 0);
  // a ship 100 wu from the cursor is outside the entry radius: it never becomes a challenger
  const far = ship(4, 400, 0);
  for (let i = 1; i < 10; i += 1) r = stepAcquisition(t2, [near, far], cursorIntent(330, 0), i * STEP);
  assert.equal(r.id, 2);
  assert.equal(r.challengerId, null);
});

test('equal costs break by id, independent of candidate order', () => {
  const a = ship(7, 300, 40); const b = ship(3, 300, -40);
  const t1 = createAcquisitionTracker();
  const t2 = createAcquisitionTracker();
  assert.equal(stepAcquisition(t1, [a, b], cursorIntent(300, 0), 0).id, 3);
  assert.equal(stepAcquisition(t2, [b, a], cursorIntent(300, 0), 0).id, 3);
});

test('thresholds follow the camera: zoomed out reaches more world', () => {
  const c = ship(2, 300, 0);
  const cursor = cursorIntent(300, 75); // 67 wu from the hull edge: outside 36, inside 72
  const t1 = createAcquisitionTracker();
  const t2 = createAcquisitionTracker();
  // fallback (nothing on the cursor) still takes the best FORWARD contact, so test the entry radius
  // through a challenger instead: an incumbent far away, the cursor 77 wu off a closer-to-cursor ship
  const incumbent = ship(5, -100, 300);
  for (const t of [t1, t2]) stepAcquisition(t, [incumbent], cursorIntent(-100, 300), 0);
  let r1; let r2;
  for (let i = 1; i < 8; i += 1) {
    r1 = stepAcquisition(t1, [incumbent, c], cursor, i * STEP, { zoom: 144 });
    r2 = stepAcquisition(t2, [incumbent, c], cursor, i * STEP, { zoom: 288 });
  }
  assert.equal(r1.id, 5, 'at the default camera 67 wu is outside the entry radius (36)');
  assert.equal(r2.id, 2, 'zoomed out 2x the same on-screen reach covers it');
});

test('a recycled id is not the incumbent', () => {
  const t = createAcquisitionTracker();
  stepAcquisition(t, [ship(2, 300, 0)], cursorIntent(300, 0), 0);
  const heir = { id: 2, gen: 9999, x: 700, z: 400, radius: 8 };
  const r = stepAcquisition(t, [heir, ship(3, 310, 10)], cursorIntent(310, 10), 0.12);
  assert.equal(r.id, 3, 'the heir of number 2 did not inherit the hold; the cursor contact is taken');
});

test('empty candidate list is free aim and resets the hold', () => {
  const t = createAcquisitionTracker();
  stepAcquisition(t, [ship(2, 300, 0)], cursorIntent(300, 0), 0);
  assert.equal(stepAcquisition(t, [], cursorIntent(300, 0), 0.12).id, null);
  assert.equal(t.id, null);
});

test('paused sim clock: dwell does not advance while time is frozen', () => {
  const t = createAcquisitionTracker();
  stepAcquisition(t, [ship(2, 300, 0), ship(3, 300, 200)], cursorIntent(300, 0), 0);
  let r;
  for (let i = 0; i < 500; i += 1) r = stepAcquisition(t, [ship(2, 300, 0), ship(3, 300, 200)], cursorIntent(300, 200), 1.0);
  assert.equal(r.id, 2, 'five hundred calls at one frozen instant never satisfy a 0.24 s dwell');
});

test('prop versus attack target before commit', () => {
  assert.equal(classifyPickIntent({ type: 'ship' }, true), 'attack');
  assert.equal(classifyPickIntent({ type: 'drone' }, true), 'attack');
  assert.equal(classifyPickIntent({ type: 'ship' }, false), 'info');
  assert.equal(classifyPickIntent({ type: 'asteroid' }, false), 'prop');
  assert.equal(classifyPickIntent({ type: 'wreck' }, false), 'prop');
  assert.equal(classifyPickIntent({ type: 'payload' }, false), 'prop');
  assert.equal(classifyPickIntent({ type: 'station' }, false), 'prop');
  assert.equal(classifyPickIntent({ type: 'ship', data: { worldSiteTargetable: true } }, false), 'info');
  assert.equal(classifyPickIntent({ type: 'fx', data: { worldSiteTargetable: true } }, false), 'prop');
  assert.equal(classifyPickIntent(null, false), 'info');
});
