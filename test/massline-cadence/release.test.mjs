import test from 'node:test';
import assert from 'node:assert/strict';
import { sweptDiskContact, solveCadenceRelease as solve, forecastCadenceWindow as forecast } from '../../src/combat/masslineReleaseGeometry.js';
import { sampleThrowSolution } from '../../src/combat/tetherFireControl.js';
import { body } from './support.mjs';
const p = () => body('payload', 0, 0, 100, 0, 10, 2);
const a = () => body('aim', 100, 0, 0, 0, 100, 5);

test('exact disk contact reports entry, closest approach and clearance', () => {
  const r = solve(p(), a()); assert.equal(r.onSolution, true);
  assert.ok(Math.abs(r.impactTime - 0.93) < 1e-12); assert.equal(r.clearance, 7);
});
test('both radii participate; no minimum-angle magic hitbox', () => {
  const victim = a(); victim.pos.z = 6;
  assert.equal(solve(p(), victim).onSolution, true);
  victim.pos.z = 8; assert.equal(solve(p(), victim).onSolution, false);
  const point = body('point', 1000, 1, 0, 0, 1, 0); const zero = p(); zero.radius = 0;
  assert.equal(solve(zero, point).onSolution, false);
});
test('retreating, parallel and horizon-limited targets cannot report false hits', () => {
  const aim = a(); aim.vel.x = 120; assert.equal(solve(p(), aim).onSolution, false);
  aim.vel.x = 100; assert.equal(solve(p(), aim).valid, false);
  aim.vel.x = 0; aim.pos.x = 1000; assert.equal(solve(p(), aim).onSolution, false);
});
test('a moving target crossing the actual exit ray is caught', () => {
  const aim = body('aim', 100, 100, 0, -100, 100, 5);
  const r = solve(p(), aim); assert.equal(r.onSolution, true);
  assert.ok(r.impactTime > 0.9 && r.impactTime < 1);
});
test('uniform translation and velocity shift leave the decision invariant', () => {
  const payload = p(), aim = body('aim', 100, 100, 0, -100);
  const before = solve(payload, aim);
  for (const b of [payload, aim]) { b.pos.x += 4444; b.pos.z -= 200; b.vel.x += 1234; b.vel.z -= 983; }
  const after = solve(payload, aim);
  for (const k of ['hit', 'onSolution', 'impactTime', 'clearance', 'errorRad', 'relativeSpeed']) assert.equal(before[k], after[k], k);
});
test('stationary payload can be contacted by a moving target without invalid geometry', () => {
  const payload = p(); payload.vel.x = 0; const aim = a(); aim.vel.x = -100;
  assert.equal(solve(payload, aim).onSolution, true);
});
test('invalid geometry and field acceleration fail closed', () => {
  const payload = p(); payload.pos.x = NaN; assert.equal(solve(payload, a()).valid, false);
  assert.equal(solve(p(), a(), { fieldSampler: () => ({ ax: Infinity, az: 0 }) }).valid, false);
});
test('relative swept field segments prevent tunnelling between predictor vertices', () => {
  const payload = body('p', 0, 0, 12000, 0, 1, 0.5), aim = body('a', 100, 0, 0, 0, 1, 0.5);
  const r = solve(payload, aim, { fieldSampler: () => ({ ax: 0, az: 0 }), fieldSteps: 1 });
  assert.equal(r.onSolution, true); assert.ok(Math.abs(r.impactTime - 99 / 12000) < 1e-12);
});
test('field integration has a hard work budget and preserves its declared model', () => {
  let count = 0; const r = solve(p(), a(), { fieldSteps: 1e8, fieldSampler: () => { count++; return { ax: 0, az: 0 }; } });
  assert.equal(count, 360); assert.equal(r.model, 'frozen_field'); assert.equal(r.onSolution, true);
});
test('tangent rays are stable; slightly outside is not a hit', () => {
  assert.equal(sweptDiskContact(100, 5, -100, 0, 5).hit, true);
  assert.equal(sweptDiskContact(100, 5.0001, -100, 0, 5).hit, false);
  assert.equal(sweptDiskContact(0, 0, 0, 0, 5).impactTime, 0);
});
test('a current heading reversal overrides cached on-solution immediately', () => {
  const cache = {}, payload = p(), aim = a();
  assert.equal(sampleThrowSolution(cache, payload, aim, { tick: 0 }).onSolution, true);
  payload.vel.x = -100;
  const r = sampleThrowSolution(cache, payload, aim, { tick: 1 });
  assert.equal(r.onSolution, false); assert.equal(r.sampleAgeTicks, 1); assert.equal(r.decisionTick, 1);
});
test('a stale field preview cannot authorise a cut; fresh decisions can', () => {
  const cache = {}, opts = { tick: 0, fieldSampler: () => ({ ax: 0, az: 0 }) };
  assert.equal(sampleThrowSolution(cache, p(), a(), opts).onSolution, true);
  const stale = sampleThrowSolution(cache, p(), a(), { ...opts, tick: 1 });
  assert.equal(stale.onSolution, false); assert.equal(stale.decisionStale, true);
  const fresh = sampleThrowSolution(cache, p(), a(), { ...opts, tick: 1, requireFresh: true });
  assert.equal(fresh.onSolution, true); assert.equal(fresh.sampleAgeTicks, 0);
});
test('forecast advertises its coast assumption and refuses radial, slack and field orbits', () => {
  const owner = body('owner', -50, 0, 0, -50), payload = body('payload', 50, 0, 0, 50);
  const aim = body('aim', -80, 180, 0, 0, 1, 10);
  const r = forecast(owner, payload, aim, { restLength: 100 });
  assert.equal(r.model, 'coast'); assert.equal(r.reliable, true); assert.ok(r.enterS > 0);
  assert.equal(forecast(owner, payload, aim, { restLength: 150 }).reason, 'slack');
  assert.equal(forecast(owner, payload, aim, { fieldAware: true }).reason, 'field');
  payload.vel.x = 100;
  assert.equal(forecast(owner, payload, aim).reason, 'settle_swing');
});
test('forecast is invariant under common world velocity (no omega/heading shortcut)', () => {
  const owner = body('owner', -50, 0, 0, -50), payload = body('payload', 50, 0, 0, 50), aim = body('aim', -80, 180);
  const r = forecast(owner, payload, aim);
  for (const b of [owner, payload, aim]) { b.vel.x += 300; b.vel.z -= 200; }
  const shifted = forecast(owner, payload, aim);
  assert.equal(r.enterS, shifted.enterS); assert.equal(r.exitS, shifted.exitS);
});
test('fixed-seed geometry agrees with an independent dense closest-approach check', () => {
  let seed = 4242; const rand = () => ((seed = Math.imul(1664525, seed) + 1013904223 >>> 0) / 2**32);
  for (let i = 0; i < 2000; i++) {
    const px = rand() * 400 - 200, pz = rand() * 400 - 200, vx = rand() * 200 - 100, vz = rand() * 200 - 100, r = 5 + rand() * 20;
    const result = sweptDiskContact(px, pz, vx, vz, r, 3);
    let min = Infinity;
    for (let step = 0; step <= 600; step++) min = Math.min(min, Math.hypot(px + vx * step / 200, pz + vz * step / 200));
    // Independent discrete oracle has <= |v|*dt/2 spatial error; exclude only its uncertainty band.
    const error = Math.hypot(vx, vz) / 400;
    if (Math.abs(min - r) > error + 1e-7) assert.equal(result.hit, min < r);
  }
});
test('overflow-scale state fails closed instead of publishing NaN telemetry', () => {
  const shot=solve({pos:{x:0,z:0},vel:{x:1e300,z:0},radius:1},{pos:{x:1e300,z:0},vel:{x:0,z:0},radius:1});
  assert.equal(shot.valid,false);assert.equal(shot.onSolution,false);
});
test('a free-flight ray never fabricates an orbital clock from rope omega', () => {
  const payload=p(),aim=a();aim.pos.z=100;
  const shot=solve(payload,aim,{omega:1});assert.equal(shot.onSolution,false);assert.equal(shot.timeToSolution,null);
});
