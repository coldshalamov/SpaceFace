import test from 'node:test';
import assert from 'node:assert/strict';
import { createMasslineInputGrammar as grammar } from '../../src/systems/masslineInputGrammar.js';
import { createCadenceWinch, stepCadenceWinch, cadenceAxis, readCadencePair, rateCadenceTechnique } from '../../src/systems/masslineControlLaw.js';
import { body, isolate, fixture } from './support.mjs';
const dt = 1 / 60;
const input = { dt, axis: -1, restLength: 100, minLength: 10, maxLength: 200, reelRate: 60, tension: 1000 };

for (const duration of [10, 11, 60, 600]) test(`hold ${duration} ticks never cuts on release`, () => {
  const g = grammar(); for (let i = 0; i < duration; i++) g.step(dt, { held: true, attached: true });
  assert.equal(g.step(dt, { held: false, attached: true }).cut, false);
});
test('tap cuts once; initial latch release never cuts', () => {
  const g = grammar(); assert.equal(g.step(dt, { held: true }).latch, true);
  assert.equal(g.step(dt, { held: false, attached: true }).cut, false);
  g.step(dt, { held: true, attached: true });
  assert.equal(g.step(dt, { held: false, attached: true }).cut, true);
  assert.equal(g.step(dt, { held: false, attached: true }).cut, false);
});
test('neutral after drawing is immediate, without a 220ms ghost command', () => {
  const g = grammar(); for (let i = 0; i < 12; i++) g.step(dt, { held: true, attached: true, lineLength: -1 });
  assert.equal(g.step(dt, { held: true, attached: true, lineLength: 0 }).lineLength, 0);
  assert.equal(g.step(dt, { held: true, attached: true, lineLength: 1 }).lineLength, 1);
});
test('pre-gesture memory is consumed once at activation', () => {
  const g = grammar(); g.step(dt, { held: true, attached: true, lineLength: -1 });
  for (let i = 1; i < 10; i++) g.step(dt, { held: true, attached: true });
  assert.equal(g.snapshot().buffered, true);
  assert.equal(g.step(dt, { held: true, attached: true }).lineLength, 0);
});
test('reset blocks a held input until release; zero dt cannot consume an edge', () => {
  const g = grammar(); g.reset(true);
  assert.equal(g.step(dt, { held: true }).latch, false);
  g.step(dt, { held: false });
  assert.equal(g.step(0, { held: true }).latch, false);
  assert.equal(g.step(dt, { held: true }).latch, true);
});
test('axis response is odd, bounded, monotone and exact at full deflection', () => {
  assert.equal(cadenceAxis(0.08), 0); assert.equal(cadenceAxis(Infinity), 0);
  let prev = 0; for (let i = 0; i <= 1000; i++) {
    const v = cadenceAxis(i / 1000); assert.ok(v >= prev && v <= 1);
    assert.equal(v, -cadenceAxis(-i / 1000) || 0); prev = v;
  } assert.equal(cadenceAxis(1), 1);
});
test('motor rises with bounded authority, neutral holds without target debt', () => {
  let r = createCadenceWinch(), last = 0;
  for (let i = 0; i < 10; i++) {
    const n = stepCadenceWinch(r, input); assert.ok(n.delta <= 0 && n.delta >= -1);
    assert.ok(Math.abs(n.runtime.velocity - last) <= 60 / 0.12 * dt + 1e-9);
    r = n.runtime; last = r.velocity;
  }
  const hold = stepCadenceWinch(r, { ...input, axis: 0 });
  assert.equal(hold.delta, 0); assert.equal(hold.runtime.velocity, 0);
  assert.equal(stepCadenceWinch(hold.runtime, { ...input, axis: 0 }).delta, 0);
});
test('reversal never travels in the old direction', () => {
  const r = { ...createCadenceWinch(), velocity: -60 };
  const n = stepCadenceWinch(r, { ...input, axis: 1 });
  assert.equal(n.delta, 0); assert.equal(n.runtime.velocity, 0);
  assert.ok(stepCadenceWinch(n.runtime, { ...input, axis: 1 }).delta > 0);
});
test('breakable load limit blocks in but never out; standard rating never stalls', () => {
  const opts = { ...input, maxTension: 10, tension: 1000, automaticBreakAllowed: true };
  assert.equal(stepCadenceWinch(null, opts).reason, 'load_limit');
  assert.ok(stepCadenceWinch(null, { ...opts, axis: 1 }).delta > 0);
  assert.ok(stepCadenceWinch(null, { ...opts, automaticBreakAllowed: false }).delta < 0);
});
test('spool bounds and malformed controls stay finite', () => {
  for (const axis of [-1, 1, NaN, Infinity]) {
    let r = createCadenceWinch(), restLength = 100;
    for (let i = 0; i < 2000; i++) {
      const n = stepCadenceWinch(r, { ...input, restLength, axis });
      restLength += n.delta; r = n.runtime;
      assert.ok(restLength >= 10 - 1e-8 && restLength <= 200 + 1e-8);
      assert.ok(Number.isFinite(r.appliedWork) && Number.isFinite(r.velocity));
    }
  }
});
test('explicit orbit draw obeys the radius-per-radian budget; pump is not free idle energy', () => {
  const pair = { valid: true, tangentialSpeed: 60, radialSpeed: 0, slack: 0 };
  const r = { ...createCadenceWinch(), velocity: -19.2 };
  const n = stepCadenceWinch(r, { ...input, orbit: true, pair });
  assert.ok(Math.abs(n.delta / dt) <= 60 * 0.32 + 1e-8);
  const pump = stepCadenceWinch(r, { ...input, orbit: true, pair, pump: true });
  assert.ok(pump.delta < n.delta);
  assert.equal(stepCadenceWinch(r, { ...input, axis: 0, orbit: true, pair, pump: true }).appliedWork ?? 0, 0);
});
test('pair and technique are independent of a uniform world velocity or break rating', () => {
  const a = body('a', 0, 0, 0, 0), b = body('b', 100, 0, 0, 100);
  const p = readCadencePair(a, b, 100);
  a.vel.x += 731; a.vel.z -= 993; b.vel.x += 731; b.vel.z -= 993;
  assert.deepEqual(readCadencePair(a, b, 100), p);
  assert.equal(rateCadenceTechnique(p, { phase: 'loaded', strain: 0.00001 }).classification, 'razor');
  assert.equal(rateCadenceTechnique(readCadencePair(a, a)).classification, 'messy');
});
test('winch state JSON roundtrip resumes exactly', () => {
  const r = stepCadenceWinch(null, input).runtime;
  assert.deepEqual(stepCadenceWinch(r, input), stepCadenceWinch(JSON.parse(JSON.stringify(r)), input));
});

const gameplay = (await isolate('src/systems/tetherGameplay.js', {
  '../combat/attachments.js': { automaticMasslineBreakAllowed: def => def.automaticBreak === true },
  './masslineImpacts.js': { lineSweepContact: () => { throw Error('unexpected sweep'); } },
})).tetherGameplay;
function gameHost(f) { return { ...gameplay, ...f, _active: { attachmentId: 'line', targetId: 'rock', type: 'tether_standard' }, _phaseMirror: {}, _reelStrength: 0 }; }
test('real _reelActive commits only accepted commands through the service', () => {
  const f = fixture(), host = gameHost(f); f.attachments.rejectReel(true);
  const n = host._reelActive(f.attachments, -1, dt, f.state, f.player, f.payload, { normalizedAxis: true });
  assert.equal(n.changed, false); assert.equal(f.attachment.restLength, 100);
  assert.equal(f.state.masslineCadence.winch.appliedWork, 0);
  assert.equal(f.state.masslineCadence.winch.velocity, 0);
  f.attachments.rejectReel(false);
  assert.equal(host._reelActive(f.attachments, -1, dt, f.state, f.player, f.payload, { normalizedAxis: true }).changed, true);
});
test('authored drill deltas are unchanged rather than passed through the axis curve', () => {
  const f = fixture(), host = gameHost(f);
  host._reelActive(f.attachments, -0.5, dt, f.state, f.player, f.payload, { normalizedAxis: false });
  assert.equal(f.attachment.restLength, 99.5);
});
test('rejected cut keeps its active line and emits no success', () => {
  const f = fixture(), host = gameHost(f); f.attachments.rejectCut(true);
  assert.equal(host._cutActive(f.attachments, f.state, f.player, f.state.simTime), false);
  assert.equal(host._active.attachmentId, 'line'); assert.equal(f.bus.count('tether:cut'), 0);
  assert.equal(f.bus.count('tether:releaseRated'), 0); assert.equal(f.bus.count('tether:cutDenied'), 1);
});
test('release rating uses current endpoint motion, not previous telemetry', async () => {
  const { rateRelease } = await isolate('src/systems/tetherGameplay.js', {
    './masslineImpacts.js': { lineSweepContact() {} },
  });
  const f = fixture(); f.state.player.masslineTelemetry = { tangentialSpeed: 0, strain: 0.0001 };
  const r = rateRelease(f.state, 'rock');
  assert.equal(r.classification, 'razor'); assert.equal(r.tangentialSpeed, 100);
  assert.equal(r.sourceId, 'pilot'); assert.equal(r.scoringVersion, 'cadence.v1');
});
test('lower orbit authority immediately bounds a previously fast motor', () => {
  const previous={...createCadenceWinch(),velocity:-60};
  const next=stepCadenceWinch(previous,{...input,orbit:true,pair:{valid:true,tangentialSpeed:20,radialSpeed:0,slack:0}});
  assert.ok(Math.abs(next.delta/dt)<=6.4+1e-8);
});
test('real reel adapter accounts for the authority-accepted length, not requested travel', () => {
  const f=fixture(),host=gameHost(f),before=f.attachment.restLength;
  f.attachments.reel=(_id,delta)=>{f.attachment.restLength+=delta*.5;return {ok:true,attachment:f.attachment};};
  host._reelActive(f.attachments,-1,dt,f.state,f.player,f.payload,{normalizedAxis:true});
  const applied=f.attachment.restLength-before;
  assert.equal(f.state.masslineCadence.winch.velocity,applied/dt);
  assert.equal(f.state.masslineCadence.winch.appliedWork,-applied*f.attachment.lastTension);
});
