import test from 'node:test';
import assert from 'node:assert/strict';
import { detectFailures, compareDigests } from '../../tools/agentic/stranger-lab/lib/detectors.mjs';
import { assessJourney, listJourneys } from '../../tools/agentic/stranger-lab/lib/journeys.mjs';
import { buildRouteManifest, SWEEP_SEEDS } from '../../tools/agentic/stranger-lab/lib/manifest.mjs';
import { PERSONA_IDS, getPersona } from '../../tools/agentic/stranger-lab/lib/personas.mjs';
import { redact, redactString } from '../../tools/agentic/stranger-lab/lib/redact.mjs';
import { runSession } from '../../tools/agentic/stranger-lab/lib/session.mjs';
import { shrinkFailure } from '../../tools/agentic/stranger-lab/lib/shrink.mjs';
import { compactRun, personaIdForSweepIndex, publicSweepRow } from '../../tools/agentic/stranger-lab/lib/sweep.mjs';
import { journeyWorldStepped, replayJourneyTape } from '../../tools/agentic/stranger-lab/lib/browserJourneyHost.js';

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
    tick: 2,
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
    const left = persona.decide(obs, { seed: 7, tick: 2 });
    const right = persona.decide(obs, { seed: 7, tick: 2 });
    assert.deepEqual(left, right, id);
    const other = persona.decide(obs, { seed: 8, tick: 2 });
    assert.notDeepEqual(left, other, `${id} ignored the seed`);
  }
});

test('failing sweep rows keep their tape, and combat or docking are not a flight replay', () => {
  const kept = publicSweepRow({
    status: 'fail',
    tapeHash: 'abc',
    confirmed: [{ id: 'unresponsive-commands' }],
    tape: { frames: [{ tick: 0, moveZ: 1 }] },
  });
  assert.equal(kept.tape.frames.length, 1);
  const dropped = publicSweepRow({
    status: 'pass',
    tapeHash: 'def',
    confirmed: [],
    tape: { frames: [{ tick: 0 }, { tick: 1 }] },
  });
  assert.equal(dropped.tape, undefined);
  assert.equal(dropped.tapeTicks, 2);
  const missed = publicSweepRow({
    status: 'incomplete',
    tapeHash: 'ghi',
    confirmed: [],
    tape: { frames: [{ tick: 3, moveZ: 0.65 }] },
  });
  assert.equal(missed.tape.frames.length, 1);
  assert.equal(missed.tape.frames[0].moveZ, 0.65);
  const forced = compactRun({
    journeyId: 'mission',
    personaId: 'first-time-pilot',
    seed: 7,
    status: 'incomplete',
    tapeHash: 'forced',
    tape: { frames: [{ tick: 3, moveZ: 0.65 }, { tick: 4, moveZ: 0.65 }] },
  });
  assert.equal(forced.tape.frames.length, 2);
  const forcedRow = publicSweepRow(forced);
  assert.equal(forcedRow.tape.frames.length, 2);
  assert.equal(forcedRow.tape.frames[0].tick, 3);
  const flightOnly = {
    systems: ['actions', 'flight', 'weapons', 'physics'],
    builtKinds: { ship: 1 },
    builtHostile: 0,
    builtTetherActive: false,
  };
  assert.equal(journeyWorldStepped('docking', flightOnly), false);
  assert.equal(journeyWorldStepped('combat-death-retry', flightOnly), false);
  assert.equal(journeyWorldStepped('launch', flightOnly), false);
  assert.equal(journeyWorldStepped('mining', flightOnly), false);
  assert.equal(journeyWorldStepped('flight', flightOnly), true);
  assert.equal(journeyWorldStepped('docking', {
    systems: ['actions', 'flight', 'weapons', 'physics', 'dockingCorridor'],
    builtKinds: { station: 1, ship: 1 },
  }), true);
  assert.equal(journeyWorldStepped('combat-death-retry', {
    systems: ['actions', 'flight', 'tacticalAI', 'weapons', 'physics', 'aiPorts', 'combat'],
    builtKinds: { ship: 4 },
    builtHostile: 3,
  }), true);
});

test('the journey host steps docking and combat worlds, not an empty flight', async () => {
  const docking = await runSession({
    journeyId: 'docking', seed: 7, ticks: 2, personaId: 'meticulous-cargo-handler',
  });
  const dockingReplay = await replayJourneyTape({ journeyId: 'docking', seed: 7, tape: docking.tape });
  assert.equal(dockingReplay.status, 'stepped', dockingReplay.error);
  assert.equal(journeyWorldStepped('docking', dockingReplay.evidence), true);
  const combat = await runSession({
    journeyId: 'combat-death-retry', seed: 7, ticks: 2, personaId: 'reckless-improvisor',
  });
  const combatReplay = await replayJourneyTape({
    journeyId: 'combat-death-retry', seed: 7, tape: combat.tape,
  });
  assert.equal(combatReplay.status, 'stepped', combatReplay.error);
  assert.equal(journeyWorldStepped('combat-death-retry', combatReplay.evidence), true);
  const flightOnly = {
    systems: ['actions', 'flight', 'weapons', 'physics'],
    builtKinds: { ship: 1 },
    builtHostile: 0,
  };
  assert.equal(journeyWorldStepped('combat-death-retry', flightOnly), false);
});

test('every persona attempts the journey cue, and docking closure thrust is visible', () => {
  const dock = {
    tick: 30, journeyId: 'docking', x: 0, z: 0, rot: 0, speed: 1, alive: true, docked: false,
    berthed: false, dockBerth: { x: 40, z: 0 }, dockDistToBerth: 40,
    nearest: { x: 40, z: 0, dist: 40, kind: 'station' },
  };
  const thrust = getPersona('meticulous-cargo-handler').decide(dock, { seed: 7, tick: 30 });
  assert.ok(thrust.moveZ >= 0.5, thrust.moveZ);
  const launch = {
    tick: 5, journeyId: 'launch', x: 0, z: 0, rot: 0, speed: 0, alive: true, docked: true,
    nearest: null,
  };
  const undock = getPersona('reckless-improvisor').decide(launch, { seed: 7, tick: 5 });
  assert.ok(undock.commands.some((command) => command.type === 'undock'));
  const mission = {
    tick: 7, journeyId: 'mission', x: 0, z: 0, rot: 0, speed: 0, alive: true, docked: false,
    nearest: null, missionActiveId: null,
  };
  const accept = getPersona('first-time-pilot').decide(mission, { seed: 7, tick: 7 });
  assert.ok(accept.commands.some((command) => command.type === 'accept-mission' && command.missionId === 'stranger-recon'));
});

test('the sweep assigns every persona, including hostile and weak-hardware', () => {
  const seen = new Set();
  for (let index = 0; index < 12 * SWEEP_SEEDS.length; index++) seen.add(personaIdForSweepIndex(index));
  for (const id of PERSONA_IDS) assert.equal(seen.has(id), true, id);
});

test('redact strips account material and does not truncate tapes', () => {
  const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
  const out = redact({
    email: 'pilot@example.com',
    userId: 'pilot-9',
    user_id: 'pilot-underscore',
    username: 'Ada',
    playerName: 'Ada',
    player_name: 'Ada Underscore',
    session: 'sess-live',
    note: `mail pilot@example.com bearer abcdef password=hunter2 password hunter2 password"=sekret Authorization: Basic dXNlcjpwYXNz cookie=sid api_key=sk-live-abc123 ${jwt} user_id=pilot-underscore player_name=Ada Underscore Authorization Basic dXNlcjpwYXNz Cookie: session=sess-live supersecret user_id=pilot-underscore`,
    ok: true,
    rows: Array.from({ length: 100 }, (_, index) => index),
  });
  assert.equal(out.email, '[redacted]');
  assert.equal(out.userId, '[redacted]');
  assert.equal(out.user_id, '[redacted]');
  assert.equal(out.username, '[redacted]');
  assert.equal(out.playerName, '[redacted]');
  assert.equal(out.player_name, '[redacted]');
  assert.equal(out.session, '[redacted]');
  assert.equal(out.note.includes('pilot@example.com'), false);
  assert.equal(out.note.includes('abcdef'), false);
  assert.equal(out.note.includes('hunter2'), false);
  assert.equal(out.note.includes('sekret'), false);
  assert.equal(out.note.includes('dXNlcjpwYXNz'), false);
  assert.equal(out.note.includes('cookie=sid'), false);
  assert.equal(out.note.includes('sk-live-abc123'), false);
  assert.equal(out.note.includes('eyJ'), false);
  assert.equal(out.note.includes('pilot-underscore'), false);
  assert.equal(out.note.includes('Ada Underscore'), false);
  assert.equal(out.note.includes('sess-live'), false);
  assert.equal(out.note.includes('supersecret:'), false);
  const assigned = redactString('user_id=pilot-underscore player_name=Ada Underscore Authorization Basic dXNlcjpwYXNz Cookie: session=sess-live supersecret user_id=pilot-underscore');
  assert.equal(assigned.includes('pilot-underscore'), false);
  assert.equal(assigned.includes('Ada Underscore'), false);
  assert.equal(assigned.includes('dXNlcjpwYXNz'), false);
  assert.equal(assigned.includes('sess-live'), false);
  assert.equal(assigned.includes('supersecret:'), false);
  assert.match(assigned, /user_id=\[redacted\]/);
  assert.match(assigned, /player_name=\[redacted\]/);
  assert.match(assigned, /cookie: \[redacted\]/);
  assert.equal(out.ok, true);
  assert.equal(out.rows.length, 100);
  assert.equal(out.rows[99], 99);
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
  assert.equal(detection.closures.some((row) => row.id === 'missing-essential-model'), false);
  assert.ok(detection.unmeasured.some((row) => row.id === 'missing-essential-model'));
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

test('each causal detector fires on a crafted failure and stays quiet on its control', () => {
  const flying = (patch = {}) => Array.from({ length: 40 }, (_, tick) => ({
    tick, simTime: tick / 60, mode: 'flight', alive: true, docked: false, x: tick, z: 0,
    speed: 4, angVel: 0.2, nearest: null, credits: 100, ...patch,
  }));
  const thrusting = (patch = {}) => flying().map((sample) => ({
    tick: sample.tick, moveZ: 1, moveX: 0, turnIntent: 0, brake: false, issuedMoveZ: 1, commands: [], ...patch,
  }));
  const stuck = detectFailures({
    samples: flying({ x: 0, speed: 0 }),
    frames: thrusting(),
    commands: [],
    asset: { essentialModelCheck: 'passed' },
  });
  assert.ok(stuck.failures.some((row) => row.id === 'unresponsive-commands' && row.origin === 'product'));
  const approach = flying({
    x: 0, speed: 0, dockPhase: 'approach', nearest: { kind: 'station', dist: 80 },
  });
  const approachStuck = detectFailures({
    samples: approach,
    frames: thrusting(),
    commands: [],
    asset: { essentialModelCheck: 'passed' },
  });
  assert.ok(approachStuck.failures.some((row) => row.id === 'unresponsive-commands'));
  const close = flying({
    x: 0, speed: 0, dockPhase: 'approach', nearest: { kind: 'station', dist: 12 },
  });
  const closeStuck = detectFailures({
    samples: close,
    frames: thrusting(),
    commands: [],
    asset: { essentialModelCheck: 'passed' },
  });
  assert.ok(closeStuck.failures.some((row) => row.id === 'unresponsive-commands'));
  const closeSlow = flying().map((sample, index) => ({
    ...sample,
    x: index < 20 ? index * 0.5 : 10,
    speed: index < 20 ? 4 : 0.2,
    nearest: { kind: 'station', dist: 12 },
    dockPhase: 'approach',
  }));
  const closeContact = detectFailures({
    samples: closeSlow,
    frames: thrusting(),
    commands: [],
    asset: { essentialModelCheck: 'passed' },
  });
  assert.equal(closeContact.failures.some((row) => row.id === 'unresponsive-commands'), false);

  const menu = detectFailures({
    samples: flying({ mode: 'menu' }),
    frames: thrusting(),
    commands: [],
    asset: { essentialModelCheck: 'passed' },
  });
  assert.ok(menu.failures.some((row) => row.id === 'unexpected-menu-fallback'));

  const stalledSamples = flying();
  for (const sample of stalledSamples) sample.simTime = 1;
  const stalled = detectFailures({ samples: stalledSamples, frames: thrusting(), commands: [], asset: { essentialModelCheck: 'passed' } });
  assert.ok(stalled.failures.some((row) => row.id === 'stalled-loading'));

  const docked = flying();
  docked[10] = { ...docked[10], docked: true, nearest: { kind: 'station', dist: 900 } };
  const dock = detectFailures({ samples: docked, frames: thrusting(), commands: [], asset: { essentialModelCheck: 'passed' } });
  assert.ok(dock.failures.some((row) => row.id === 'impossible-docking'));

  const paid = detectFailures({
    samples: flying(),
    frames: thrusting({ moveZ: 0, issuedMoveZ: 0 }),
    commands: [
      { type: 'buy', tick: 2, intentId: 'twice', ok: true, charged: true, duplicate: false, total: 8 },
      { type: 'buy', tick: 3, intentId: 'twice', ok: true, charged: true, duplicate: false, total: 8 },
    ],
    asset: { essentialModelCheck: 'passed' },
  });
  assert.ok(paid.failures.some((row) => row.id === 'double-payment'));

  const fake = detectFailures({
    samples: flying(),
    frames: thrusting({ moveZ: 0, issuedMoveZ: 0 }),
    commands: [{ type: 'probe-dock', tick: 4, ok: true, berthed: false }],
    asset: { essentialModelCheck: 'passed' },
  });
  assert.ok(fake.failures.some((row) => row.id === 'false-success'));

  const missionSamples = flying();
  for (const sample of missionSamples) {
    sample.missionStatus = 'active';
    sample.missionActiveId = 'stuck-contract';
  }
  const stuckMission = detectFailures({
    samples: missionSamples,
    frames: thrusting({ moveZ: 0, issuedMoveZ: 0 }),
    commands: [{ type: 'abandon-mission', tick: 1, missionId: 'stuck-contract', ok: true }],
    asset: { essentialModelCheck: 'passed' },
  });
  assert.ok(stuckMission.failures.some((row) => row.id === 'stuck-missions'));

  const yaw = detectFailures({
    samples: flying({ angVel: -0.2, x: 0 }),
    frames: thrusting({ turnIntent: 1, moveZ: 0, issuedMoveZ: 0 }),
    commands: [],
    asset: { essentialModelCheck: 'passed' },
  });
  assert.ok(yaw.failures.some((row) => row.id === 'wrong-ship-controls'));

  const saved = detectFailures({
    samples: flying(),
    frames: thrusting({ moveZ: 0, issuedMoveZ: 0 }),
    commands: [
      { type: 'save', tick: 2, snapshot: { sectorId: 'a', credits: 10, x: 0, z: 0 } },
      { type: 'continue', tick: 4, snapshot: { sectorId: 'b', credits: 10, x: 0, z: 0 } },
    ],
    asset: { essentialModelCheck: 'passed' },
  });
  assert.ok(saved.failures.some((row) => row.id === 'save-discontinuity'));

  const missing = detectFailures({
    samples: flying(),
    frames: thrusting({ moveZ: 0, issuedMoveZ: 0 }),
    commands: [],
    asset: { essentialModelCheck: 'failed', detail: 'ship_missing' },
  });
  assert.ok(missing.confirmed.some((row) => row.id === 'missing-essential-model'));
  assert.ok(compareDigests('left', 'right').id === 'determinism-drift');
});

test('no detected defect is not completion of docking or death and recovery', () => {
  const samples = [{ tick: 0, alive: true, mode: 'flight', docked: false },
    { tick: 100, alive: true, mode: 'flight', docked: false, dockPhase: 'approach' }];
  const dock = assessJourney({ journeyId: 'docking', samples });
  assert.equal(dock.status, 'incomplete');
  assert.ok(dock.missing.includes('berth arrival'));
  const combat = assessJourney({ journeyId: 'combat-death-retry', samples });
  assert.equal(combat.status, 'incomplete');
  assert.ok(combat.missing.includes('player death'));
  const recovered = assessJourney({
    journeyId: 'combat-death-retry',
    samples: [...samples, { tick: 101, alive: false }, { tick: 103, alive: true }],
    commands: [{ type: 'recover', tick: 102, ok: true }],
  });
  assert.equal(recovered.status, 'complete');
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
  const bare = await runSession({ ...CANARY, fault: null, playbackTape: first.tape, ticks: first.ticks });
  assert.equal(bare.fingerprint, first.fingerprint);
  assert.equal(bare.digest, first.digest);
  assert.ok(bare.failures.some((failure) => failure.origin === 'canary'));
  assert.equal(bare.confirmed.length, 0);
});

test('shrinking keeps the canary and shortens the tape', async () => {
  const run = await runSession(CANARY);
  const shrunk = await shrinkFailure(run, 'unresponsive-commands');
  assert.equal(shrunk.ok, true);
  assert.ok(shrunk.minimalTicks < run.ticks);
  assert.ok(shrunk.minimalTicks >= 1);
});

test('the docking pilot reaches the actual manifest berth without a synthetic dock flag', async () => {
  const run = await runSession({ journeyId: 'docking', seed: 7 });
  assert.equal(run.status, 'pass', JSON.stringify(run.completion || run.error));
  assert.equal(run.final.berthed, true);
  assert.equal(run.final.docked, false, 'headless sim does not pretend the station UI opened');
});

test('launch leaves a real berth and the mission route completes then fails', async () => {
  const launch = await runSession({ journeyId: 'launch', seed: 7 });
  assert.equal(launch.status, 'pass', JSON.stringify(launch.completion || launch.error));
  assert.ok(launch.commands.some((row) => row.type === 'undock' && row.ok));
  const mission = await runSession({ journeyId: 'mission', seed: 7 });
  assert.equal(mission.status, 'pass', JSON.stringify({ completion: mission.completion, commands: mission.commands, error: mission.error }));
  assert.ok(mission.milestones['mission:completed'] > 0);
  assert.ok(mission.milestones['mission:failed'] > 0);
});

test('combat death is a live wreck and recovery uses the combat owner', async () => {
  const run = await runSession({ journeyId: 'combat-death-retry', seed: 7 });
  assert.equal(run.status, 'pass', JSON.stringify({
    completion: run.completion,
    hull: run.final && run.final.hull,
    shield: run.final && run.final.shield,
    milestones: run.milestones,
    error: run.error,
  }));
  assert.ok(run.milestones['player:death'] > 0);
  assert.ok(run.commands.some((row) => row.type === 'recover' && row.ok));
});
