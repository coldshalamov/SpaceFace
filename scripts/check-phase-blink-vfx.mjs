// Veil Step picture law. The curves are the lifecycle; the shader is required to match them.
import assert from 'node:assert/strict';
import { PHASE_BLINK, phaseBlinkRange } from '../src/data/phaseBlink.js';
import {
  ARRIVE_DUR,
  DEPART_DUR,
  VEIL_MAX_RANGE,
  VEIL_MIN_RANGE,
  cloudBody,
  filamentParcel,
  integrateClock,
  membraneDelay,
  pickSlot,
  sampleAim,
  sampleArrival,
  sampleDeparture,
  sampleDrain,
  slitMask,
  wantedRange,
} from '../src/render/phaseBlinkLifecycle.js';

assert.equal(VEIL_MIN_RANGE, PHASE_BLINK.minRange);
assert.equal(VEIL_MAX_RANGE, PHASE_BLINK.maxRange);
// charge and hold are the same curve: range(hold) == min + (max-min) * charge(hold)
for (const hold of [0, 0.05, 0.12, 0.24, 0.48, 0.9]) {
  const charge = hold <= 0 ? 0 : Math.min(1, 1 - (1 - Math.min(1, hold / PHASE_BLINK.chargeS)) ** 2);
  assert.ok(Math.abs(wantedRange(charge) - phaseBlinkRange(hold)) < 1e-6, `range drift at ${hold}`);
}

const pause = integrateClock(4, 4, 0.016);
assert.equal(pause.step, 0, 'a frozen sim does not advance the picture');
assert.equal(pause.drop, false);
const frame = integrateClock(1, 1 + 1 / 60, 0.5);
assert.ok(Math.abs(frame.step - 1 / 60) < 1e-9, 'sim time wins over a stale wall dt');
const hitch = integrateClock(1, 1.1, 0);
assert.equal(hitch.step, 0.05, 'a hitch must not skip ignition');
const stall = integrateClock(1, 2, 0);
assert.equal(stall.drop, true);
assert.equal(stall.step, 0);
const rewind = integrateClock(5, 1, 0);
assert.equal(rewind.rewind, true);
const first = integrateClock(null, 3, 0.016);
assert.equal(first.step, 0, 'the first sample only anchors the clock');
const wall = integrateClock(null, NaN, 1 / 60);
assert.ok(Math.abs(wall.step - 1 / 60) < 1e-9);

let prev = -1;
for (let i = 0; i <= 24; i += 1) {
  const extrude = sampleArrival(i / 24, false, false).extrude;
  assert.ok(extrude + 1e-9 >= prev, 'arrival matter never retracts');
  prev = extrude;
}
const born = sampleArrival(0, false, false);
const mid = sampleArrival(0.45, false, false);
const late = sampleArrival(0.82, false, false);
assert.equal(born.spread, 1, 'the arrival cut is the wound the player was already holding');
assert.ok(born.extrude < 0.3 && mid.extrude > 0.95, 'exhale happens after the cut is open');
assert.equal(born.zip, 0);
assert.ok(late.zip > 0.45 && late.extrude > 0.95, 'zip closes the cut while exhaled matter stays out');
assert.ok(late.detach > 0.5);
assert.equal(sampleArrival(0.1, false, true).hot, 0, 'flash reduce kills the hot fold, not the cut');
assert.ok(sampleArrival(0.1, false, false).hot > 0.4);
const cloudEarly = cloudBody(sampleArrival(0.08, false, false));
const cloudFull = cloudBody(sampleArrival(0.42, false, false));
const cloudBack = cloudBody(sampleArrival(0.94, false, false));
assert.ok(cloudFull > cloudEarly + 0.4, 'the arrival cloud blows out of the cut');
assert.ok(cloudBack < 0.2, 'the arrival cloud is swallowed back in');
assert.ok(sampleArrival(0.94, false, false).extrude > 0.95, 'scraps stay supplied after the cloud returns');
const leaveCloud = cloudBody(sampleDeparture(0.1, false, false));
assert.ok(leaveCloud > cloudBody(sampleDeparture(0.01, false, false)), 'departure blows before it swallows');
assert.ok(cloudBody(sampleDeparture(0.9, false, false)) < 0.15, 'departure cloud is back in the cut');

const leave = sampleDeparture(0.02, false, false);
assert.ok(leave.spread < 0.45, 'the departure tear has not reached the tail yet');
assert.ok(leave.open > 0.34 && leave.open < 0.7);
assert.ok(sampleDeparture(0.7, false, false).suck > 0.8);
assert.ok(sampleDeparture(0.7, false, false).detach > 0.4, 'scraps tear while the swallow is underway');
assert.ok(sampleDeparture(0, false, false).open < sampleDeparture(0.2, false, false).open);

// Reduced motion keeps a pose and still retires.
const held = sampleArrival(0.2, true, false);
const heldLate = sampleArrival(0.9, true, false);
assert.equal(held.extrude, heldLate.extrude);
assert.ok(heldLate.zip > held.zip);
assert.equal(sampleArrival(0.3, true, false).spread, 1);

const aim = sampleAim(1, false, false, false);
const choked = sampleAim(1, true, false, false);
assert.equal(aim.zip, 0, 'a held cut does not zip itself');
assert.equal(aim.warn, 0);
assert.equal(choked.warn, 1);
assert.ok(choked.spread < aim.spread, 'a wall keeps the wound short');
assert.equal(sampleAim(0.4, false, false, true).hot, 0);

const drainEarly = sampleDrain(0.05, false);
const drainLate = sampleDrain(0.9, false);
assert.equal(drainEarly.zip < drainLate.zip, true);
assert.ok(drainLate.fade < 0.5);
assert.equal(drainEarly.hot, 0, 'cancel does not flash');

// Center of an arrival cut dies before the ends. Nose of a departure cut dies first.
const open = { spread: 1, zip: 0.45 };
assert.ok(slitMask('arrive', 0.5, open.spread, open.zip) < slitMask('arrive', 0.08, open.spread, open.zip));
assert.ok(slitMask('depart', 0.95, 1, 0.45) < slitMask('depart', 0.1, 1, 0.45));
assert.equal(slitMask('arrive', 0.5, 0, 0), 0, 'an arrival tear is shut at the first instant of spread 0');
assert.ok(slitMask('arrive', 0.5, 1, 0) > 0.9);
assert.ok(slitMask('arrive', 1, 0.15, 0) < 0.05, 'ends wait for the tear to reach them');
assert.equal(slitMask('arrive', 0.5, 1, 1), 0);

const delays = [];
for (let r = 2; r < 8; r += 1) delays.push(membraneDelay(r));
assert.equal(new Set(delays).size, delays.length, 'membranes do not share an arrival time');
assert.ok(delays[0] < delays[delays.length - 1]);

let gaps = 0;
let solid = 0;
for (let i = 0; i <= 40; i += 1) {
  const a = filamentParcel(i / 40, 0.2, 1.4);
  if (a === 0) gaps += 1;
  else solid += 1;
}
assert.ok(gaps >= 4, 'a filament is a broken stream, not a bar');
assert.ok(solid >= 8);

const slots = [
  { alive: true, age: 0.1, dur: ARRIVE_DUR },
  { alive: false, age: 0, dur: DEPART_DUR },
  { alive: true, age: 0.8, dur: DEPART_DUR },
];
assert.equal(pickSlot(slots), 1);
slots[1].alive = true;
slots[1].age = 0.2;
assert.equal(pickSlot(slots), 2, 'a full pool gives way to the oldest residue');

assert.ok(ARRIVE_DUR !== DEPART_DUR, 'the two ends must not vanish on the same frame');

console.log('phase blink vfx ok');
