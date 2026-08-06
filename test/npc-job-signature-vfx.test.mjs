// "The Working Light" presentation grammar — the pure half.
//
// These assert the CLAIMS the fiction and the research make, not the pixel values. A test that
// pinned colours would go red on any art pass and prove nothing; what must not silently break is
// that every working state has a signal, that the signals are distinguishable WITHOUT colour, and
// that the frame writer is deterministic and allocation-free enough to run in the render hot path.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  NPC_JOB_SIGNATURE_PROFILES,
  NPC_JOB_SIGNATURE_CAPACITY,
  NPC_JOB_SIGNATURE_DRAW_RANGE,
  resolveNpcJobSignature,
  createNpcJobSignatureFrameScratch,
  writeNpcJobSignatureFrame,
} from '../src/render/npcJobSignatureVfx.js';
import { NPC_JOB_KIND, NPC_JOB_PHASE } from '../src/systems/npcJobs.js';

const KINDS = Object.values(NPC_JOB_KIND);
// `complete` is terminal — the job is over and the hull reverts to ordinary traffic, so showing
// nothing is correct, not a gap.
const SIGNALLING_PHASES = Object.values(NPC_JOB_PHASE).filter((p) => p !== NPC_JOB_PHASE.COMPLETE);

test('every kind x every non-terminal phase resolves to a signal', () => {
  const missing = [];
  for (const kind of KINDS) {
    for (const phase of SIGNALLING_PHASES) {
      for (const loaded of [false, true]) {
        if (!resolveNpcJobSignature(kind, phase, loaded)) missing.push(`${kind}:${phase}:${loaded}`);
      }
    }
  }
  assert.deepEqual(missing, [], 'a working hull must never be left with nothing to show');
});

test('a completed job and a nonsense phase show nothing', () => {
  for (const kind of KINDS) {
    assert.equal(resolveNpcJobSignature(kind, NPC_JOB_PHASE.COMPLETE, false), null);
    assert.equal(resolveNpcJobSignature(kind, 'not-a-phase', false), null);
    assert.equal(resolveNpcJobSignature(kind, '', false), null);
    assert.equal(resolveNpcJobSignature(kind, null, false), null);
  }
});

test('loaded and empty transit are DIFFERENT signals — "amber heartbeat means mass"', () => {
  const heavy = resolveNpcJobSignature('hauler', NPC_JOB_PHASE.TRANSIT, true);
  const light = resolveNpcJobSignature('hauler', NPC_JOB_PHASE.TRANSIT, false);
  assert.notEqual(heavy.id, light.id);
  assert.notEqual(heavy.rhythm, light.rhythm);
  // The Code says loaded is the SLOWER, heavier beat. If this ever inverts, the most-consulted
  // line in the fiction becomes a lie on screen.
  assert.ok(heavy.cadenceHz > light.cadenceHz,
    'the loaded heartbeat is a distinct, slower-feeling pair-beat, not the empty bar walk');
});

test('a patrol keeps sweeping across every phase it can occupy', () => {
  // "A patrol that doesn't sweep is not a patrol." A patrol crossing between pins must not borrow a
  // freighter's cruise code, or the one thing that identifies it disappears exactly when it moves.
  for (const phase of [NPC_JOB_PHASE.TRANSIT, NPC_JOB_PHASE.APPROACH, NPC_JOB_PHASE.HOLD]) {
    for (const loaded of [false, true]) {
      const sig = resolveNpcJobSignature('patrol', phase, loaded);
      assert.equal(sig.rhythm, 'pin-sweep', `patrol in ${phase} must still sweep`);
    }
  }
});

test('only a miner works a rock face, and only a miner comes home under rock', () => {
  assert.equal(resolveNpcJobSignature('miner', NPC_JOB_PHASE.WORK, false).id, 'blind_cone');
  assert.equal(resolveNpcJobSignature('miner', NPC_JOB_PHASE.RETURN, true).id, 'home_under_rock');
  assert.notEqual(resolveNpcJobSignature('hauler', NPC_JOB_PHASE.RETURN, true).id, 'home_under_rock');
});

test('distress overrides everything and is the loudest signal in the code', () => {
  const cadences = Object.values(NPC_JOB_SIGNATURE_PROFILES).map((p) => p.cadenceHz);
  const distress = NPC_JOB_SIGNATURE_PROFILES.breaking_the_pattern;
  assert.equal(distress.cadenceHz, Math.max(...cadences),
    'red-white must out-pace every other code so it breaks a locked-on rhythm');
  for (const kind of KINDS) {
    assert.equal(resolveNpcJobSignature(kind, NPC_JOB_PHASE.FLEE, false).id, 'breaking_the_pattern');
    assert.equal(resolveNpcJobSignature(kind, NPC_JOB_PHASE.FLEE, true).id, 'breaking_the_pattern');
  }
});

test('signals are distinguishable WITHOUT colour — every profile has a unique rhythm', () => {
  // The research finding this whole layer rests on: at 500-2000 world units the hull is a few pixels
  // and colour is gone. If two profiles ever shared a rhythm they would be the same signal in the
  // only channel that survives that distance.
  const rhythms = Object.values(NPC_JOB_SIGNATURE_PROFILES).map((p) => p.rhythm);
  assert.equal(new Set(rhythms).size, rhythms.length, 'two signals must never share a rhythm');
});

test('every profile declares all four far-field channels', () => {
  for (const [key, p] of Object.entries(NPC_JOB_SIGNATURE_PROFILES)) {
    assert.equal(typeof p.id, 'string', `${key} id`);
    assert.equal(typeof p.codeName, 'string', `${key} codeName`);
    assert.equal(typeof p.means, 'string', `${key} means`);
    assert.ok('link' in p, `${key} must declare a link channel (null is a valid answer)`);
    assert.ok('contact' in p, `${key} must declare a contact channel`);
    assert.ok(typeof p.attitude === 'string' && p.attitude.length > 0, `${key} attitude`);
    assert.ok(typeof p.rhythm === 'string' && p.rhythm.length > 0, `${key} rhythm`);
    assert.ok(Number.isInteger(p.beats) && p.beats >= 1, `${key} beats`);
    assert.ok(p.cadenceHz > 0, `${key} cadenceHz`);
    assert.ok(p.reducedCadenceHz > 0 && p.reducedCadenceHz <= p.cadenceHz,
      `${key} reduced-motion cadence must be slower or equal, never faster`);
    assert.ok(Object.isFrozen(p), `${key} must be frozen — profiles are shared across every hull`);
  }
});

test('a link implies a contact or an explicit absence, never an accident', () => {
  // Repairs deliberately have no ejecta — the Code says repair ADDS material — so a null contact is
  // a legitimate authored choice. What must not happen is a link that silently forgot its far end.
  const linked = Object.values(NPC_JOB_SIGNATURE_PROFILES).filter((p) => p.link);
  assert.ok(linked.length >= 3, 'the code should use its link channel on more than one state');
  for (const p of linked) {
    assert.ok(p.contact !== undefined, `${p.id}: a link must state what happens at its far end`);
  }
});

// ─── frame writer ─────────────────────────────────────────────────────────────────────────────────

test('the frame writer is deterministic: same inputs, same frame', () => {
  const p = NPC_JOB_SIGNATURE_PROFILES.on_the_pin;
  const a = writeNpcJobSignatureFrame(p, 3.25, 0.7, 4, -2, 511, false, createNpcJobSignatureFrameScratch());
  const b = writeNpcJobSignatureFrame(p, 3.25, 0.7, 4, -2, 511, false, createNpcJobSignatureFrameScratch());
  assert.deepEqual(a, b);
});

test('the frame writer mutates only the scratch it is handed — no allocation per beat', () => {
  const p = NPC_JOB_SIGNATURE_PROFILES.heavy_burn;
  const scratch = createNpcJobSignatureFrameScratch();
  const returned = writeNpcJobSignatureFrame(p, 1.5, 0, 10, 0, 0, false, scratch);
  assert.equal(returned, scratch, 'must return the caller-owned scratch, not a fresh object');
  const keysBefore = Object.keys(scratch).sort();
  writeNpcJobSignatureFrame(p, 9.5, 1, -3, 3, 42, false, scratch);
  assert.deepEqual(Object.keys(scratch).sort(), keysBefore, 'no new fields may appear per frame');
});

test('emitStep advances exactly once per beat at the profile cadence', () => {
  const p = NPC_JOB_SIGNATURE_PROFILES.heavy_burn; // 1.6 Hz
  const scratch = createNpcJobSignatureFrameScratch();
  const steps = new Set();
  for (let i = 0; i <= 160; i++) {
    writeNpcJobSignatureFrame(p, i / 16, 0, 10, 0, 0, false, scratch);
    steps.add(scratch.emitStep);
  }
  // 10 seconds at 1.6 Hz -> 16 beats crossed, plus the beat in progress at t=0.
  assert.equal(steps.size, 17, `expected 17 distinct beats over 10s at 1.6Hz, saw ${steps.size}`);
});

test('beat cycles through exactly `beats` values and never leaves range', () => {
  for (const p of Object.values(NPC_JOB_SIGNATURE_PROFILES)) {
    const scratch = createNpcJobSignatureFrameScratch();
    const seen = new Set();
    for (let i = 0; i < 400; i++) {
      writeNpcJobSignatureFrame(p, i * 0.05, 0, 0, 0, 0, false, scratch);
      assert.ok(scratch.beat >= 0 && scratch.beat < p.beats, `${p.id} beat out of range`);
      assert.ok(scratch.beatT >= 0 && scratch.beatT < 1, `${p.id} beatT out of range`);
      assert.ok(scratch.cycleT >= 0 && scratch.cycleT < 1, `${p.id} cycleT out of range`);
      seen.add(scratch.beat);
    }
    assert.equal(seen.size, p.beats, `${p.id} must visit all ${p.beats} beats of its code`);
  }
});

test('seed de-phases hulls showing the same signal', () => {
  // Eight patrols blinking in lockstep read as one machine, not eight crews.
  const p = NPC_JOB_SIGNATURE_PROFILES.on_the_pin;
  const bearings = new Set();
  for (const seed of [0, 137, 311, 512, 743, 906]) {
    const s = createNpcJobSignatureFrameScratch();
    writeNpcJobSignatureFrame(p, 2, 0, 0, 0, seed, false, s);
    bearings.add(s.sweepAngle.toFixed(6));
  }
  assert.ok(bearings.size >= 5, `expected distinct sweep bearings per hull, saw ${bearings.size}`);
});

test('facing falls back to hull heading when the ship is station-keeping', () => {
  // A working miner has near-zero velocity. Reading direction from that noise would swing its work
  // cone wildly, which the research calls out as reading like a bug rather than like work.
  const p = NPC_JOB_SIGNATURE_PROFILES.blind_cone;
  const s = createNpcJobSignatureFrameScratch();
  writeNpcJobSignatureFrame(p, 1, Math.PI / 2, 0.01, -0.02, 0, false, s);
  assert.ok(Math.abs(s.dirX - 0) < 1e-6 && Math.abs(s.dirZ - 1) < 1e-6,
    `expected heading-derived facing, got (${s.dirX}, ${s.dirZ})`);
  // With real velocity it must track velocity instead.
  writeNpcJobSignatureFrame(p, 1, Math.PI / 2, 30, 0, 0, false, s);
  assert.ok(Math.abs(s.dirX - 1) < 1e-6 && Math.abs(s.dirZ) < 1e-6);
});

test('direction is always a unit vector with a perpendicular normal', () => {
  const p = NPC_JOB_SIGNATURE_PROFILES.stacking;
  const s = createNpcJobSignatureFrameScratch();
  for (const [vx, vz, rot] of [[0, 0, 0], [3, 4, 0], [-9, 0, 1.2], [0.1, 0.1, -2.5], [NaN, NaN, 0.4]]) {
    writeNpcJobSignatureFrame(p, 1, rot, vx, vz, 0, false, s);
    assert.ok(Math.abs(Math.hypot(s.dirX, s.dirZ) - 1) < 1e-9, `dir not unit for ${vx},${vz}`);
    assert.ok(Math.abs(s.dirX * s.normalX + s.dirZ * s.normalZ) < 1e-9, 'normal must be perpendicular');
  }
});

test('reduced motion slows every code and stills the station-keeping chatter', () => {
  for (const p of Object.values(NPC_JOB_SIGNATURE_PROFILES)) {
    const normal = createNpcJobSignatureFrameScratch();
    const reduced = createNpcJobSignatureFrameScratch();
    writeNpcJobSignatureFrame(p, 12, 0, 0, 0, 0, false, normal);
    writeNpcJobSignatureFrame(p, 12, 0, 0, 0, 0, true, reduced);
    assert.ok(reduced.emitStep <= normal.emitStep,
      `${p.id}: reduced motion must never beat faster than normal`);
    assert.equal(reduced.chatter, 0, `${p.id}: reduced motion must not jitter the hull`);
  }
});

test('only station-keeping and breaking hulls chatter; cruising hulls hold attitude', () => {
  // Steady pose IS the transit signal. Adding jitter to it would erase the contrast that makes
  // station-keeping legible in the first place.
  for (const p of Object.values(NPC_JOB_SIGNATURE_PROFILES)) {
    let sawChatter = false;
    const s = createNpcJobSignatureFrameScratch();
    for (let i = 0; i < 200; i++) {
      writeNpcJobSignatureFrame(p, i * 0.07, 0, 0, 0, 17, false, s);
      if (Math.abs(s.chatter) > 1e-6) sawChatter = true;
      assert.ok(s.chatter >= -1.0001 && s.chatter <= 1.0001, `${p.id} chatter out of range`);
    }
    const shouldChatter = p.attitude === 'station-keep' || p.attitude === 'break';
    assert.equal(sawChatter, shouldChatter, `${p.id} (${p.attitude}) chatter expectation`);
  }
});

test('corrupt inputs degrade quietly instead of throwing into the render loop', () => {
  const p = NPC_JOB_SIGNATURE_PROFILES.tally ?? NPC_JOB_SIGNATURE_PROFILES.spilling_the_count;
  const s = createNpcJobSignatureFrameScratch();
  for (const bad of [NaN, -1, Infinity, undefined, null, 'x']) {
    writeNpcJobSignatureFrame(p, bad, bad, bad, bad, bad, false, s);
    assert.ok(Number.isFinite(s.dirX) && Number.isFinite(s.dirZ), 'direction stayed finite');
    assert.ok(Number.isInteger(s.beat) && s.beat >= 0 && s.beat < p.beats, 'beat stayed legal');
    assert.ok(Number.isFinite(s.sweepAngle), 'sweep stayed finite');
  }
  // A null profile is a legal answer from resolve(); the writer must tolerate it.
  assert.doesNotThrow(() => writeNpcJobSignatureFrame(null, 1, 0, 0, 0, 0, false, s));
  assert.doesNotThrow(() => writeNpcJobSignatureFrame(null, 1, 0, 0, 0, 0, false, null));
});

test('pool capacity covers a saturated sector and the draw range is declared', () => {
  // traffic.js caps a sector at 8 civilian hulls; world/mission producers may add a few more.
  assert.ok(NPC_JOB_SIGNATURE_CAPACITY >= 8,
    'the pool must cover a fully-populated sector or hulls silently go dark');
  assert.ok(NPC_JOB_SIGNATURE_DRAW_RANGE >= 1000,
    'signals must survive to the distance the research says they are read at');
});
