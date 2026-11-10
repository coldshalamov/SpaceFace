// SFQ-B022 — the live line names throw, mutual swing, or self-sling from the two
// masses the constraint couples. Seed 4242. The pre-latch CAN mark stays a shape.
import test from 'node:test';
import assert from 'node:assert/strict';

import { latchCouplingRead, masslineHud } from '../src/ui/masslineHud.js';

const SEED = 4242;

function body(id, mass, physicsMass) {
  const entity = { id, type: 'ship', alive: true, mass, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  if (physicsMass != null) entity.physicsBody = { mass: physicsMass };
  return entity;
}

function meters(player, target) {
  const strainText = {
    textContent: 'LINE',
    style: {},
    attrs: {},
    classList: { toggle() {} },
    setAttribute(name, value) { this.attrs[name] = value; },
  };
  const strainPill = {
    style: {},
    attrs: {},
    classList: { toggle() {} },
    setAttribute(name, value) { this.attrs[name] = value; },
  };
  const dom = {
    btPill: { style: {}, classList: { toggle() {} } },
    btFill: { style: {} },
    ckPill: { style: {}, classList: { toggle() {} } },
    ckFill: { style: {} },
    strainPill,
    strainFill: { style: {} },
    strainText,
  };
  const state = {
    seed: SEED,
    simTime: 1,
    playerId: player.id,
    entities: new Map([[player.id, player], [target.id, target]]),
    player: {
      tether: { active: true, targetId: target.id, strain: 0, tensionEstimate: 0 },
      masslineTelemetry: { strain: 0 },
    },
  };
  masslineHud._updateMeters.call({ _lineLoad: null }, dom, {}, state);
  return { strainText, strainPill };
}

test('three mass pairs read PAYLOAD, EVEN, and ANCHOR — not a hull class', () => {
  const heavy = latchCouplingRead(body(1, 3200), body(2, 1000));
  assert.equal(heavy.short, 'PAYLOAD');
  assert.match(heavy.title, /payload/i);

  const even = latchCouplingRead(body(1, 1000), body(2, 1100));
  assert.equal(even.short, 'EVEN');

  const anchor = latchCouplingRead(body(1, 400), body(2, 2000));
  assert.equal(anchor.short, 'ANCHOR');
  assert.match(anchor.title, /anchor/i);

  // Just under 3× stays comparable. The ratio is not a cosmetic class table.
  assert.equal(latchCouplingRead(body(1, 2999), body(2, 1000)).short, 'EVEN');
  assert.equal(latchCouplingRead(body(1, 3000), body(2, 1000)).short, 'PAYLOAD');
});

test('a missing mass stays quiet, and physics-body mass beats the authored number', () => {
  assert.equal(latchCouplingRead(body(1, 0), body(2, 1000)), null);
  assert.equal(latchCouplingRead({ id: 1 }, body(2, 1000)), null);
  // Authored 100 would be a payload against 400; the body the solver couples is 2000.
  const read = latchCouplingRead(body(1, 100, 2000), body(2, 400, 400));
  assert.equal(read.short, 'PAYLOAD');
});

test('seed 4242: an attached line paints the coupling word on the load pill', () => {
  const player = body(1, 400);
  const target = body(2, 2000);
  const painted = meters(player, target);
  assert.equal(painted.strainText.textContent, 'ANCHOR');
  assert.equal(painted.strainPill.style.display, 'flex');
  assert.match(painted.strainPill.attrs['aria-label'], /Likely anchor/);

  const toss = meters(body(1, 3200), body(2, 800));
  assert.equal(toss.strainText.textContent, 'PAYLOAD');
  const mutual = meters(body(1, 900), body(2, 900));
  assert.equal(mutual.strainText.textContent, 'EVEN');
});
