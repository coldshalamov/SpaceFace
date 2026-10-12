import test from 'node:test';
import assert from 'node:assert/strict';
import { detectFailures, compareDigests } from '../../tools/agentic/stranger-lab/lib/detectors.mjs';
import { listJourneys } from '../../tools/agentic/stranger-lab/lib/journeys.mjs';
import { buildRouteManifest, SWEEP_SEEDS } from '../../tools/agentic/stranger-lab/lib/manifest.mjs';
import { PERSONA_IDS, getPersona } from '../../tools/agentic/stranger-lab/lib/personas.mjs';
import { redact } from '../../tools/agentic/stranger-lab/lib/redact.mjs';
import { runSession } from '../../tools/agentic/stranger-lab/lib/session.mjs';
import { shrinkFailure } from '../../tools/agentic/stranger-lab/lib/shrink.mjs';

const CANARY = {
  journeyId: 'flight',
  personaId: 'first-time-pilot',
  seed: 7,
  fault: 'drop-thrust',
  surface: 'keyboard',
};

test('route manifest names twelve journeys, eight personas, and the live control schema', () => {
  const manifest = buildRouteManifest();
  assert.equal(manifest.schema, 'spaceface.strangerRouteManifest.v1');
  assert.equal(manifest.journeys.length, 12);
  assert.equal(manifest.personas.length, 8);
  assert.equal(manifest.seeds.length, 12);
  assert.equal(SWEEP_SEEDS.length, 12);
  assert.equal(manifest.controlSchema.present, true);
  assert.ok(manifest.labScenarios.some((row) => row.file.endsWith('flight-fixed-input.scenario.json')));
  assert.ok(manifest.blindSpots.some((row) => row.includes('iPhone')));
  assert.equal(listJourneys().length, 12);
  assert.equal(PERSONA_IDS.length, 8);
});

test('personas are pure functions of the observation and seed', () => {
  const obs = {
    tick: 30,
    journeyId: 'flight',
    x: 0,
    z: 0,
    rot: 1.57,
    nearest: { x: 0, z: 40, dist: 40, kind: 'asteroid' },
    alive: true,
    docked: false,
    tetherActive: false,
    speed: 0,
    runPhase: 'inactive',
  };
  for (const id of PERSONA_IDS) {
    const persona = getPersona(id);
    const left = persona.decide(obs, { seed: 7, tick: 30 });
    const right = persona.decide(obs, { seed: 7, tick: 30 });
    assert.deepEqual(left, right, id);
  }
});

test('redact strips account material', () => {
  const out = redact({
    email: 'pilot@example.com',
    note: 'mail pilot@example.com bearer abcdef',
    ok: true,
  });
  assert.equal(out.email, '[redacted]');
  assert.equal(out.note.includes('pilot@example.com'), false);
  assert.equal(out.note.includes('abcdef'), false);
  assert.equal(out.ok, true);
});

test('negative controls do not invent unresponsive, dock, payment, or model failures', () => {
  const samples = [];
  for (let tick = 0; tick < 40; tick++) {
    samples.push({
      tick,
      simTime: tick / 60,
      mode: 'flight',
      alive: true,
      docked: false,
      tetherActive: false,
      x: tick * 0.01,
      z: 0,
      speed: 0.2,
      angVel: 0.1,
      nearest: null,
      credits: 100,
    });
  }
  const frames = samples.map((sample) => ({
    tick: sample.tick,
    moveZ: 0,
    moveX: 0,
    turnIntent: 0,
    brake: true,
    issuedMoveZ: 0,
    commands: [],
  }));
  const detection = detectFailures({
    samples,
    frames,
    commands: [
      { type: 'buy', tick: 3, intentId: 'once', ok: true, duplicate: true, charged: false, total: 12, refused: false },
      { type: 'buy', tick: 3, intentId: 'once', ok: true, duplicate: false, charged: true, total: 12, refused: false },
    ],
    asset: { essentialModelCheck: 'not-run' },
  });
  assert.deepEqual(detection.confirmed, []);
  const blocked = samples.map((sample, index) => ({
    ...sample,
    x: index < 20 ? index * 0.5 : 10,
    speed: index < 20 ? 4 : 0.2,
    nearest: { kind: 'station', dist: 30 },
    dockPhase: 'approach',
  }));
  const thrusting = frames.map((frame) => ({ ...frame, moveZ: 1, brake: false, issuedMoveZ: 1 }));
  const station = detectFailures({ samples: blocked, frames: thrusting, commands: [], asset: { essentialModelCheck: 'not-run' } });
  assert.equal(station.confirmed.some((row) => row.id === 'unresponsive-commands'), false);
  assert.equal(compareDigests('abc', 'abc'), null);
});

test('canary reproduces the same fingerprint and the green control stays clean', async () => {
  const first = await runSession(CANARY);
  const second = await runSession(CANARY);
  const replay = await runSession({ ...CANARY, playbackTape: first.tape, ticks: first.ticks });
  assert.equal(first.status, 'fail');
  assert.ok(first.failures.some((failure) => failure.id === 'unresponsive-commands' && failure.origin === 'canary'));
  assert.equal(first.confirmed.length, 0);
  assert.equal(first.fingerprint, second.fingerprint);
  assert.equal(first.fingerprint, replay.fingerprint);
  assert.equal(first.digest, replay.digest);
  const green = await runSession({ ...CANARY, fault: null });
  const greenAgain = await runSession({ ...CANARY, fault: null });
  assert.equal(green.status, 'pass', JSON.stringify(green.failures || green.error));
  assert.equal(green.confirmed.length, 0);
  assert.equal(green.digest, greenAgain.digest);
});

test('shrinking keeps the canary and shortens the tape', async () => {
  const run = await runSession(CANARY);
  const shrunk = await shrinkFailure(run, 'unresponsive-commands');
  assert.equal(shrunk.ok, true);
  assert.ok(shrunk.minimalTicks < run.ticks);
  assert.ok(shrunk.minimalTicks >= 1);
});
