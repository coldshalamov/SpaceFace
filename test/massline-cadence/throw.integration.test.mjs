import test from 'node:test';
import assert from 'node:assert/strict';
import { isolate, fixture, featureStub, body, tick } from './support.mjs';
import { forecastCadenceWindow, solveCadenceRelease } from '../../src/combat/masslineReleaseGeometry.js';
const { masslineThrow, selfSlingBonusDv } = await isolate('src/systems/masslineThrow.js', {
  '../data/featureFlags.js': featureStub,
  '../core/spatialQuery.js': { queryNearbyEntities: (_s, _p, _r, _scratch, entities) => entities },
});
function setup(mode = 'snap') {
  const f = fixture(); f.state.settings.gameplay.masslineReleaseAssist = mode;
  const host = { ...masslineThrow }; host.init(f);
  return Object.assign(f, { host, step() { host.update(1 / 60, f.state); }, press() { f.state.input.actions.throwArm = true; } });
}
function nextWindow(f) {
  // Search real geometry, not a mocked solver. Find an aperture 1..5 fixed ticks ahead.
  for (let x = 24; x > -40; x -= 0.25) {
    f.victim.pos.x = x;
    const now = solveCadenceRelease(f.payload, f.victim);
    const win = forecastCadenceWindow(f.player, f.payload, f.victim, { restLength: 100 });
    if (!now.onSolution && win.reliable && win.enterS > 0 && win.enterS <= 5 / 60) return;
  }
  throw new Error('No real next-window fixture found');
}
test('preview is readable before commitment; no preview-driven cut', () => {
  const f = setup(); f.step();
  assert.equal(f.state.massline2.throw.solution.onSolution, true);
  assert.equal(f.attachments.calls.length, 0);
  assert.equal(f.bus.count('massline:releaseWindow'), 1);
  tick(f); f.step(); assert.equal(f.bus.count('massline:releaseWindow'), 1);
});
test('arm requires a fresh explicit edge and current contact', () => {
  const f = setup('arm'); f.victim.pos.x = -100; f.press(); f.step();
  assert.equal(f.attachments.calls.length, 0);
  f.victim.pos.x = 50; tick(f); f.step();
  assert.equal(f.bus.count('massline:throw'), 1);
  assert.equal(f.state.massline2.throw.lastThrow.mode, 'arm');
});
test('off permits a deliberately bad shot, preserves both real velocities', () => {
  const f = setup('off'); f.victim.pos.x = -100;
  const before = [structuredClone(f.player.vel), structuredClone(f.payload.vel)];
  f.press(); f.step();
  assert.equal(f.bus.count('massline:throw'), 1);
  assert.equal(f.state.massline2.throw.lastThrow.prediction.onSolution, false);
  assert.deepEqual([f.player.vel, f.payload.vel], before);
  assert.deepEqual(f.state.massline2.throw.lastThrow.impulses, []);
});
test('no target never swallows manual cut', () => {
  const f = setup(); f.state.player.targetId = null; f.press(); f.step();
  assert.equal(f.bus.count('massline:throw'), 1);
  assert.equal(f.state.massline2.throw.lastThrow.prediction.valid, false);
});
test('rejected cut emits no successful throw or VFX, remains attached', () => {
  const f = setup(); f.attachments.rejectCut(true); f.press(); f.step();
  assert.equal(f.attachment.state, 'active');
  assert.equal(f.bus.count('massline:throw'), 0);
  assert.equal(f.bus.count('presentation:vfxCue'), 0);
});
test('snap queue deadline is at most five fixed ticks, does not manufacture a hit', () => {
  const f = setup(); nextWindow(f); f.press(); f.step();
  assert.ok(f.host._pendingSnap, 'real near-future geometry queued');
  const pressTick = f.state.tick;
  for (let i = 1; i < 5; i++) { tick(f); f.step(); assert.equal(f.bus.count('massline:throw'), 0); }
  tick(f); f.step();
  assert.equal(f.bus.count('massline:throw'), 1);
  const receipt = f.state.massline2.throw.lastThrow;
  assert.equal(receipt.tick - pressTick, 5);
  assert.equal(receipt.mode, 'snap-manual'); // Bodies deliberately didn't move; the forecast isn't permission.
  assert.equal(receipt.prediction.onSolution, false);
});
test('queued throw cannot redirect when pointer identity changes', () => {
  const f = setup(); nextWindow(f); f.press(); f.step(); assert.ok(f.host._pendingSnap);
  const other = body('other', 50, 250, 0, 0, 100, 10);
  f.state.entities.set(other.id, other); f.state.entityList.push(other);
  f.state.input.aimIntentActive = true; f.state.input.aimWorld = { ...other.pos };
  tick(f); f.step();
  assert.equal(f.host._pendingSnap, null);
  assert.equal(f.state.massline2.throw.solution, null);
  assert.equal(f.bus.count('massline:releaseCancelled'), 1);
  for (let i = 0; i < 8; i++) { tick(f); f.step(); }
  assert.equal(f.bus.count('massline:throw'), 0);
});
test('held input through a menu/latch boundary is not fresh authorization', () => {
  const f = setup('arm'); f.state.mode = 'station'; f.press(); f.step();
  f.state.mode = 'flight'; tick(f); f.step();
  assert.equal(f.bus.count('massline:throw'), 0);
  f.state.input.actions.throwArm = false; tick(f); f.step();
  f.press(); tick(f); f.step(); assert.equal(f.bus.count('massline:throw'), 1);
});
test('same-tick repeated update cannot duplicate accepted release', () => {
  const f = setup('arm'); f.press(); f.step(); f.step();
  assert.equal(f.bus.count('massline:throw'), 1);
  assert.equal(f.attachments.calls.filter(x => x.type === 'cut').length, 1);
});
test('manual self-sling is a physical receipt, no free impulse', () => {
  const f = setup(); f.step(); const before = { ...f.player.vel };
  f.host._onManualCut();
  assert.equal(f.bus.count('massline:selfSling'), 1);
  assert.deepEqual(f.player.vel, before);
  assert.equal(f.state.massline2.throw.lastSelfSling.bonusDv, 0);
  assert.equal(selfSlingBonusDv(200, 1, true), 0);
  assert.equal(f.attachments.calls.length, 0);
});
test('boundaries clear pending intent; reinit/destroy unsubscribe all listeners', () => {
  const f = setup(); f.host.init(f); f.step();
  f.bus.emit('tether:cut', {}); assert.equal(f.bus.count('massline:selfSling'), 1);
  f.bus.emit('save:loaded', {});
  assert.equal(f.host._pendingSnap, null); assert.equal(f.state.massline2.throw.solution, null);
  f.host.destroy(); f.bus.emit('tether:cut', {});
  assert.equal(f.bus.count('massline:selfSling'), 1);
});
test('next-tick validation records actual unmodified flight, not an aim correction', () => {
  const f = setup('off'); f.press(); f.step();
  f.payload.pos.z += f.payload.vel.z / 60; tick(f); f.state.player.tether.active = false; f.step();
  assert.equal(f.bus.count('massline:releaseValidated'), 1);
  const receipt = f.state.massline2.throw.lastReleaseValidation;
  assert.deepEqual(receipt.actual.velocity, f.payload.vel);
  assert.deepEqual(receipt.impulses, []);
});
test('stopping the winch refreshes the coast forecast immediately, not four ticks later', () => {
  const f=setup();f.state.player.tether.cadence={reelVelocity:-20};f.step();
  assert.equal(f.state.massline2.throw.solution.window.reason,'coast_required');
  tick(f);f.state.player.tether.cadence.reelVelocity=0;f.step();
  assert.equal(f.host._windowForecast.tick,f.state.tick);
  assert.equal(f.state.massline2.throw.solution.window.reliable,true);
});
