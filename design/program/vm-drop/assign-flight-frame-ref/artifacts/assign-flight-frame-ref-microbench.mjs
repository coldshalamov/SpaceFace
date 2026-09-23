// Microbench: Object.assign telemetry copy vs attach result.telemetry by reference.
function makeTelemetry(i) {
  const t = {
    family: 'reaction', driveId: 'drive_reaction_m', assistMode: 'assisted',
    acceleration: { x: 1.2, z: 3.4 }, angularAcceleration: 0.01,
    force: { x: 10, y: 0, z: 20 }, torque: { x: 0, y: 1, z: 0 },
    speed: 40 + (i % 7), forwardSpeed: 38, lateralSpeed: 2,
    driveState: 'cruise', desiredHeading: 1.2,
    governor: { physicsEarned: true },
  };
  if (i % 3 === 0) { t.travelDrive = 'engaged'; t.travelCap = 200; t.travelCeiling = 220; }
  if (i % 5 === 0) t.vectoring = { x: 0.1, z: 0.2 };
  return t;
}
function before(entity, result, mode) {
  const frame = entity._flightFrame || (entity._flightFrame = {});
  Object.assign(frame, result.telemetry);
  frame.mode = mode;
  frame.driveId = result.driveId;
  frame.family = result.family;
  return frame;
}
function afterRef(entity, result, mode) {
  const frame = result.telemetry || {};
  frame.mode = mode;
  frame.driveId = result.driveId;
  frame.family = result.family;
  entity._flightFrame = frame;
  return frame;
}
// Player path also mutates frame after assign
function playerMutate(frame, i) {
  frame.autopursuit = null;
  frame.autopilot = i % 11 === 0 ? { dist: 1 } : null;
  frame.orbitAssist = { active: false, reason: 'unavailable' };
}

const e1 = {}, e2 = {};
const ITERS = 800000;
let sink = 0;
for (let i = 0; i < 5000; i++) {
  const result = { telemetry: makeTelemetry(i), driveId: 'd', family: 'reaction' };
  playerMutate(before(e1, result, 'assisted'), i);
  const r2 = { telemetry: makeTelemetry(i), driveId: 'd', family: 'reaction' };
  playerMutate(afterRef(e2, r2, 'assisted'), i);
}
let t0 = performance.now();
for (let i = 0; i < ITERS; i++) {
  const result = { telemetry: makeTelemetry(i), driveId: 'd', family: 'reaction' };
  const f = before(e1, result, 'assisted');
  playerMutate(f, i);
  sink += f.speed + (f.orbitAssist ? 1 : 0);
}
const beforeMs = performance.now() - t0;
t0 = performance.now();
for (let i = 0; i < ITERS; i++) {
  const result = { telemetry: makeTelemetry(i), driveId: 'd', family: 'reaction' };
  const f = afterRef(e2, result, 'assisted');
  playerMutate(f, i);
  sink += f.speed + (f.orbitAssist ? 1 : 0);
}
const afterMs = performance.now() - t0;

// Correctness: optional keys must not linger across ref attach (Object.assign DOES linger)
const ec = {};
before(ec, { telemetry: makeTelemetry(0), driveId: 'd', family: 'reaction' }, 'm'); // has travel*
before(ec, { telemetry: makeTelemetry(1), driveId: 'd', family: 'reaction' }, 'm'); // no travel*
const lingerAssign = 'travelDrive' in ec._flightFrame;
const er = {};
afterRef(er, { telemetry: makeTelemetry(0), driveId: 'd', family: 'reaction' }, 'm');
afterRef(er, { telemetry: makeTelemetry(1), driveId: 'd', family: 'reaction' }, 'm');
const lingerRef = 'travelDrive' in er._flightFrame;

console.log(JSON.stringify({
  beforeMs, afterMs, speedup: beforeMs / afterMs, iters: ITERS, sink,
  lingerAssign, lingerRef,
  note: 'lingerAssign true means Object.assign leaves stale optional keys; lingerRef should be false',
}, null, 2));
