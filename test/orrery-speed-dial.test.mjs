// ORRERY Speed Dial: the pure contract of the flight Cluster's speed instrument (src/ui/orrery/speedDial.js).
// The dial itself is DOM and SVG, shot in the bench (`scripts/ui-bench.mjs --shot=orrery-flight`); what must
// not drift is the maths a player feels: where the needle stands, what colour it wears, what the numeral says.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SPEED_DIAL, SPEED_RAMP, speedDialFraction, speedTint, speedTintStep, formatSpeedReading, speedPhase,
} from '../src/ui/orrery/speedDial.js';
import { readClusterModel, readSpeedCeiling } from '../src/ui/orrery/hudAdapter.js';
import { speedPhase as clusterSpeedPhase } from '../src/ui/orrery/flightCluster.js';
import { travelFlag } from '../src/data/featureFlags.js';

const T_REF = SPEED_DIAL.refBlade / SPEED_DIAL.blades;

test('the reference speed stands on its gate, and rest stands at zero', () => {
  assert.equal(speedDialFraction(0, 180, 405), 0);
  assert.ok(Math.abs(speedDialFraction(180, 180, 405) - T_REF) < 1e-9, 'REF is blade 30 of 50 whatever the hull');
  assert.ok(Math.abs(speedDialFraction(90, 180, 405) - T_REF / 2) < 1e-9, 'linear up to the reference');
  assert.ok(Math.abs(speedDialFraction(250, 250, 700) - T_REF) < 1e-9, 'a faster hull has the same gate');
});

test('the needle keeps moving all the way to V-MAX and never leaves the arc', () => {
  let prev = -1;
  for (let s = 0; s <= 3000; s += 7) {
    const f = speedDialFraction(s, 180, 405);
    assert.ok(f >= prev, `monotonic at ${s}`);
    assert.ok(f >= 0 && f <= 1, `on the arc at ${s}`);
    prev = f;
  }
  const atMax = speedDialFraction(405, 180, 405);
  assert.ok(atMax > 0.97 && atMax < 1, 'the ceiling is the last blade, with a sliver of arc beyond');
  assert.ok(speedDialFraction(4000, 180, 405) > atMax, 'a sling past the ceiling still moves it');
  assert.ok(speedDialFraction(1e9, 180, 405) <= 1);
  // the old gauge pinned at ref x 1.25 = 225; the new one is still climbing at 300
  assert.ok(speedDialFraction(300, 180, 405) > speedDialFraction(225, 180, 405));
});

test('with no published ceiling the overdrive band still exists, and bad input never becomes NaN', () => {
  assert.ok(speedDialFraction(250, 180, 0) > T_REF);
  assert.ok(speedDialFraction(250, 180, undefined) < 1);
  assert.ok(speedDialFraction(250, 180, 100) > T_REF, 'a ceiling below the reference is ignored');
  for (const bad of [NaN, -50, undefined, null, 'x', Infinity]) {
    const f = speedDialFraction(bad, 180, 405);
    assert.ok(Number.isFinite(f) && f >= 0 && f <= 1, `finite for ${String(bad)}`);
  }
  assert.ok(Number.isFinite(speedDialFraction(100, 0, 0)), 'a missing reference reads the 180 default');
  assert.equal(speedDialFraction(90, undefined, undefined), speedDialFraction(90, 180, undefined));
});

test('the tint walks bone, phos, ice, azure, blue-shift and never wears the Hand or the alarm', () => {
  assert.deepEqual(speedTint(0), SPEED_RAMP[0][1], 'asleep in bone');
  assert.deepEqual(speedTint(1), SPEED_RAMP[SPEED_RAMP.length - 1][1], 'the ceiling is ultraviolet white');
  assert.deepEqual(speedTint(T_REF), [143, 203, 255], 'the gate wears --dp-ice (#8FCBFF)');
  assert.deepEqual(speedTint(-3), speedTint(0));
  assert.deepEqual(speedTint(7), speedTint(1));
  assert.deepEqual(speedTint(NaN), speedTint(0));
  for (let i = 0; i <= 200; i += 1) {
    const [r, g, b] = speedTint(i / 200);
    for (const c of [r, g, b]) assert.ok(Number.isInteger(c) && c >= 0 && c <= 255);
    // amber (#F2B950) is red-high, blue-low; so is the alarm (#FF5038). Speed is bone or cold light: blue
    // never falls under 200 and red never leads blue by more than bone's own 20.
    assert.ok(b >= 200, `a cold light at ${i / 200}: blue stays high`);
    assert.ok(r - b <= 24, `no amber, no alarm at ${i / 200}`);
  }
  // colder as the speed is earned: red falls from bone to azure, then the ramp turns violet
  assert.ok(speedTint(0.78)[0] < speedTint(0.1)[0]);
  assert.ok(speedTint(0.9)[0] > speedTint(0.78)[0]);
});

test('the tint is quantised so a write is keyed to a crossing, not a frame', () => {
  const steps = new Set();
  for (let i = 0; i <= 1000; i += 1) steps.add(speedTintStep(i / 1000));
  assert.ok(steps.size <= 25 && steps.size >= 20, `${steps.size} steps`);
  assert.equal(speedTintStep(0), 0);
  assert.equal(speedTintStep(1), 24);
  assert.equal(speedTintStep(0.5), speedTintStep(0.5001));
});

test('the numeral stays inside the dial at any speed', () => {
  assert.equal(formatSpeedReading(0), '0');
  assert.equal(formatSpeedReading(149.4), '149');
  assert.equal(formatSpeedReading(149.5), '150');
  assert.equal(formatSpeedReading(9999), '9999');
  assert.equal(formatSpeedReading(10000), '10.0k');
  assert.equal(formatSpeedReading(99940), '99.9k');
  assert.equal(formatSpeedReading(99960), '100k');
  assert.equal(formatSpeedReading(999400), '999k');
  assert.ok(formatSpeedReading(5e6).endsWith('M'));
  assert.ok(formatSpeedReading(1e12).length <= 5);
  assert.equal(formatSpeedReading(NaN), '0');
  assert.equal(formatSpeedReading(-40), '0');
  for (const n of [0, 7, 88, 149, 999, 4000, 9999, 10000, 54321, 999499, 2e6, 1e15]) {
    assert.ok(formatSpeedReading(n).length <= 5, `${n} -> ${formatSpeedReading(n)}`);
  }
});

test('the colour phase is decided by the displayed reading and is shared with the Cluster export', () => {
  assert.equal(clusterSpeedPhase, speedPhase, 'flightCluster re-exports the one contract');
  assert.equal(speedPhase(0.4, 180), 'rest');
  assert.equal(speedPhase(180.4, 180), 'flight');
  assert.equal(speedPhase(180.6, 180), 'over');
});

test('the adapter hands the dial its V-MAX, the afterburner flag and the burning drive', () => {
  const entities = new Map();
  const player = {
    id: 1, hull: 80, hullMax: 100, shield: 0, shieldMax: 0, armorHp: 0, armorMax: 0, cap: 10, capMax: 10,
    maxSpeed: 180, rot: 0, vel: { x: 150, z: 0 }, boost: { energy: 50, max: 100 }, data: { weapons: [] },
  };
  entities.set(1, player);
  const state = { playerId: 1, entities, entityList: [player], simTime: 1, player: {}, input: {} };

  const idle = readClusterModel(state, player, { ordnance: {} });
  assert.equal(idle.boosting, false, 'no flag, no afterburner');
  assert.equal(idle.driveActive, false);
  assert.equal(idle.speedMax, 0, 'unknown until the live mount reads the ceiling');

  const lit = readClusterModel(state, { ...player, flags: { boosting: true } }, { ordnance: {}, speedMax: 405 });
  assert.equal(lit.boosting, true, 'p.flags.boosting rides through to the dial');
  assert.equal(lit.speedMax, 405);

  const odd = readClusterModel(state, { ...player, flags: { boosting: 'yes' } }, { ordnance: {}, speedMax: NaN });
  assert.equal(odd.boosting, true);
  assert.equal(odd.speedMax, 0, 'a bad ceiling is zero, never NaN');
});

test('V-MAX is the number the travel tape prints: published by the drive, else resolved from the hull', () => {
  const player = { id: 1, maxSpeed: 180, vel: { x: 0, z: 0 }, data: {} };
  const published = { input: { travelDrive: { state: 'engaged', ceiling: 612 } }, entities: new Map([[1, player]]), playerId: 1 };
  // the drive axis is a feature flag: with it on the published ceiling wins, with it off there is no ceiling
  assert.equal(readSpeedCeiling(published, player), travelFlag('travelBurn') ? 612 : 0);
  const none = readSpeedCeiling({ input: {}, entities: new Map(), playerId: 1 }, player);
  assert.ok(Number.isFinite(none) && none >= 0);
});

test('the dial is mounted once by the Cluster, which feeds it every frame and tears it down', () => {
  const src = readFileSync(new URL('../src/ui/orrery/flightCluster.js', import.meta.url), 'utf8');
  assert.equal((src.match(/createSpeedDial\(/g) || []).length, 1);
  assert.match(src, /dial\.update\(\{/, 'the Cluster feeds the dial');
  assert.match(src, /dial\.arrive\(\)/, 'the self-test sweep runs on arrival');
  assert.match(src, /strain, dial\]\) g\.dispose\(\)/, 'dispose reaches the dial');
  assert.doesNotMatch(src, /SPEED_FROM|SPEED_TO|R\.speed\b/, 'the hairline speed arc is gone');
  const dial = readFileSync(new URL('../src/ui/orrery/speedDial.js', import.meta.url), 'utf8');
  assert.match(dial, /orr-cluster__speed /, 'the settings preview still finds the numeral by its class');
  assert.match(dial, /orr-cluster__speedfoot/, 'and the unit foot');
  const code = dial.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /(^|[\s;{"'])(backdrop-)?filter\s*:|drop-shadow\(|feGaussianBlur/, 'no live filter in flight (ORRERY §3.1)');
});
