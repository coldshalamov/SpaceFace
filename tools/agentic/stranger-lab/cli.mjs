#!/usr/bin/env node
// Stranger Lab — one entry for a reproducible causal failure, plus the sweep.
//
//   node tools/agentic/stranger-lab/cli.mjs prove
//   node tools/agentic/stranger-lab/cli.mjs sweep
//   node tools/agentic/stranger-lab/cli.mjs canary
//   node tools/agentic/stranger-lab/cli.mjs manifest
//   node tools/agentic/stranger-lab/cli.mjs run --journey flight --seed 7 --persona first-time-pilot
//   node tools/agentic/stranger-lab/cli.mjs replay --artifact artifacts/stranger-lab/canary-failure.json

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { writeArtifact } from './lib/artifact.mjs';
import { buildRouteManifest } from './lib/manifest.mjs';
import { runSession } from './lib/session.mjs';
import { shrinkFailure } from './lib/shrink.mjs';
import { runSweep } from './lib/sweep.mjs';
import { triageSweep } from './lib/triage.mjs';

const ROOT = join(import.meta.dirname, '../../..');

const CANARY = Object.freeze({
  journeyId: 'flight',
  personaId: 'first-time-pilot',
  seed: 7,
  fault: 'drop-thrust',
  surface: 'keyboard',
});

const GREEN = Object.freeze({
  journeyId: 'flight',
  personaId: 'first-time-pilot',
  seed: 7,
  fault: null,
  surface: 'keyboard',
});

const command = process.argv[2] || 'prove';
const args = parseArgs(process.argv.slice(3));
const OUT = args.out ? resolve(args.out) : join(ROOT, 'artifacts/stranger-lab');

try {
  if (command === 'manifest') {
    const manifest = buildRouteManifest();
    writeArtifact(join(OUT, 'route-manifest.json'), manifest);
    process.stdout.write(`${manifest.journeys.length} journeys, ${manifest.personas.length} personas, controls ${manifest.controlSchema.present}\n`);
  } else if (command === 'canary') {
    const run = await reproduceCanary();
    process.stdout.write(`canary fingerprint ${run.fingerprint} status ${run.status}\n`);
  } else if (command === 'prove') {
    const report = await prove();
    process.stdout.write(`${report.ok ? 'PROVE PASS' : 'PROVE FAIL'} fingerprint ${report.canaryFingerprint}\n`);
    if (!report.ok) process.exitCode = 1;
  } else if (command === 'sweep') {
    const sweep = await runSweep({
      seeds: args.seeds ? args.seeds.split(',').map((seed) => Number(seed)) : undefined,
      journeys: args.journeys ? args.journeys.split(',') : undefined,
    });
    const triage = triageSweep(sweep);
    writeArtifact(join(OUT, 'sweep.json'), { ...sweep, runs: sweep.runs.map(stripTape) });
    writeArtifact(join(OUT, 'triage.json'), triage);
    process.stdout.write(
      `sweep runs=${sweep.runCount} pass=${sweep.passCount} incomplete=${sweep.incompleteCount} fail=${sweep.failCount} infra=${sweep.infraCount} confirmed=${triage.confirmedCount}\n`,
    );
    if (sweep.infraCount) process.exitCode = 2;
    else if (sweep.failCount) process.exitCode = 1;
    else if (sweep.incompleteCount) process.exitCode = 3;
  } else if (command === 'run') {
    const run = await runSession({
      journeyId: args.journey || 'flight',
      personaId: args.persona,
      seed: args.seed != null ? Number(args.seed) : 7,
      surface: args.surface || 'keyboard',
      fault: args.fault || null,
    });
    writeArtifact(join(OUT, `run-${run.journeyId}-${run.seed}.json`), stripTape(run));
    process.stdout.write(`${run.journeyId} ${run.status} digest ${run.digest}\n`);
    if (run.status === 'infra') process.exitCode = 2;
    else if (run.status === 'fail') process.exitCode = 1;
    else if (run.status === 'incomplete') process.exitCode = 3;
  } else if (command === 'replay') {
    const artifact = JSON.parse(readFileSync(args.artifact, 'utf8'));
    const first = await runSession(replayOptions(artifact));
    const second = await runSession(replayOptions(artifact));
    const same = first.fingerprint === second.fingerprint && first.digest === second.digest;
    process.stdout.write(`replay same=${same} fingerprint ${first.fingerprint}\n`);
    if (!same) process.exitCode = 1;
  } else {
    process.stderr.write(`unknown command ${command}\n`);
    process.exitCode = 2;
  }
} catch (error) {
  process.stderr.write(`${error && error.stack || error}\n`);
  process.exitCode = 2;
}

async function prove() {
  const manifest = buildRouteManifest();
  writeArtifact(join(OUT, 'route-manifest.json'), manifest);
  const first = await runSession(CANARY);
  const second = await runSession(CANARY);
  const replay = await runSession({ ...CANARY, playbackTape: first.tape, ticks: first.ticks });
  const green = await runSession(GREEN);
  const greenAgain = await runSession(GREEN);
  const shrunk = await shrinkFailure(first, 'unresponsive-commands');
  writeArtifact(join(OUT, 'canary-failure.json'), publicRun(first));
  writeArtifact(join(OUT, 'canary-replay.json'), publicRun(second));
  const report = {
    schema: 'spaceface.strangerProve.v1',
    ok: first.status === 'fail'
      && first.fingerprint
      && first.fingerprint === second.fingerprint
      && first.fingerprint === replay.fingerprint
      && first.digest === replay.digest
      && green.status === 'pass'
      && green.confirmed.length === 0
      && green.digest === greenAgain.digest
      && shrunk.ok === true
      && shrunk.minimalTicks < first.ticks
      && manifest.journeys.length >= 12
      && manifest.personas.length >= 8
      && manifest.controlSchema.present === true,
    canaryFingerprint: first.fingerprint,
    canaryDigest: first.digest,
    replayDigest: replay.digest,
    greenDigest: green.digest,
    greenConfirmed: green.confirmed.length,
    minimalTicks: shrunk.minimalTicks,
    fullTicks: first.ticks,
    determinism: green.digest === greenAgain.digest,
    journeys: manifest.journeys.length,
    personas: manifest.personas.length,
    headedBrowser: 'unverified',
    deviceTested: false,
    fpsClaimed: false,
  };
  writeArtifact(join(OUT, 'prove-report.json'), report);
  writeArtifact(join(OUT, 'sample-failure.json'), publicRun(first));
  return report;
}

async function reproduceCanary() {
  const first = await runSession(CANARY);
  const second = await runSession(CANARY);
  writeArtifact(join(OUT, 'canary-failure.json'), publicRun(first));
  writeArtifact(join(OUT, 'canary-replay.json'), publicRun(second));
  if (first.fingerprint !== second.fingerprint) {
    throw new Error('canary fingerprint diverged');
  }
  return first;
}

function publicRun(run) {
  return {
    schema: 'spaceface.strangerFailure.v1',
    status: run.status,
    evidenceClass: run.evidenceClass,
    host: run.host,
    journeyId: run.journeyId,
    personaId: run.personaId,
    seed: run.seed,
    fault: run.fault,
    surface: run.surface,
    deviceTested: false,
    fpsClaimed: false,
    fingerprint: run.fingerprint,
    digest: run.digest,
    tapeHash: run.tapeHash,
    ticks: run.ticks,
    failures: run.failures,
    closures: run.closures,
    tape: run.tape,
    capture: run.capture,
    replay: {
      journeyId: run.journeyId,
      personaId: run.personaId,
      seed: run.seed,
      fault: run.fault,
      surface: run.surface,
      tapeHash: run.tapeHash,
    },
  };
}

function replayOptions(artifact) {
  return {
    journeyId: artifact.journeyId || artifact.replay.journeyId,
    personaId: artifact.personaId || artifact.replay.personaId,
    seed: artifact.seed != null ? artifact.seed : artifact.replay.seed,
    fault: artifact.fault || (artifact.replay && artifact.replay.fault) || null,
    surface: artifact.surface || 'keyboard',
    playbackTape: artifact.tape,
    ticks: artifact.ticks,
  };
}

function stripTape(run) {
  if (!run || typeof run !== 'object') return run;
  const { tape, ...rest } = run;
  return { ...rest, tapeHash: run.tapeHash, tapeTicks: tape && tape.frames ? tape.frames.length : undefined };
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
    out[key] = value;
  }
  return out;
}
