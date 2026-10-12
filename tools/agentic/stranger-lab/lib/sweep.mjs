// Bounded sweep: every journey × every seed, one runtime at a time.

import { listJourneys } from './journeys.mjs';
import { PERSONA_IDS } from './personas.mjs';
import { SWEEP_SEEDS } from './manifest.mjs';
import { runSession } from './session.mjs';

export async function runSweep(options = {}) {
  const journeys = options.journeys || listJourneys().map((journey) => journey.id);
  const seeds = options.seeds || SWEEP_SEEDS;
  const runs = [];
  let index = 0;
  for (const journeyId of journeys) {
    for (const seed of seeds) {
      const personaId = options.personaId || PERSONA_IDS[index % PERSONA_IDS.length];
      const surface = index % 4 === 0 ? 'simulated-touch' : 'keyboard';
      const result = await runSession({
        journeyId,
        personaId,
        seed,
        surface,
        fault: null,
      });
      runs.push(compact(result));
      index += 1;
    }
  }
  const confirmed = runs.flatMap((run) => (run.confirmed || []).map((failure) => ({
    ...failure,
    journeyId: run.journeyId,
    personaId: run.personaId,
    seed: run.seed,
    surface: run.surface,
    fingerprint: run.fingerprint,
    tapeHash: run.tapeHash,
  })));
  const headed = selectHeaded(runs, 25);
  const walls = runs.map((run) => run.wallMs).filter((ms) => Number.isFinite(ms)).sort((a, b) => a - b);
  return {
    schema: 'spaceface.strangerSweep.v1',
    evidenceClass: 'focused-fixture',
    host: 'node-headless',
    fpsClaimed: false,
    routeCount: journeys.length,
    seedCount: seeds.length,
    runCount: runs.length,
    passCount: runs.filter((run) => run.status === 'pass').length,
    failCount: runs.filter((run) => run.status === 'fail').length,
    incompleteCount: runs.filter((run) => run.status === 'incomplete').length,
    infraCount: runs.filter((run) => run.status === 'infra').length,
    confirmed,
    headedBrowser: {
      status: 'unverified',
      reason: 'This host does not claim a headed GPU session. The 25 runs below are the selection, not a browser result.',
      runs: headed,
    },
    performance: {
      medianWallMs: walls.length ? walls[(walls.length / 2) | 0] : null,
      maxWallMs: walls.length ? walls[walls.length - 1] : null,
      fpsClaimed: false,
    },
    runs,
  };
}

function compact(result) {
  return {
    journeyId: result.journeyId,
    personaId: result.personaId,
    seed: result.seed,
    surface: result.surface,
    status: result.status,
    completion: result.completion || null,
    unmeasured: result.unmeasured || [],
    ok: result.ok,
    digest: result.digest,
    tapeHash: result.tapeHash,
    fingerprint: result.fingerprint,
    ticks: result.ticks,
    wallMs: result.capture && result.capture.resources && result.capture.resources.wallMs,
    failures: result.failures || [],
    confirmed: result.confirmed || [],
    error: result.error || null,
    tape: result.status === 'fail' ? result.tape : undefined,
    fault: result.fault,
  };
}

function selectHeaded(runs, count) {
  const picked = [];
  for (let i = 0; i < runs.length && picked.length < count; i += Math.max(1, Math.floor(runs.length / count))) {
    const run = runs[i];
    picked.push({
      journeyId: run.journeyId,
      personaId: run.personaId,
      seed: run.seed,
      surface: run.surface,
      tapeHash: run.tapeHash,
      headedBrowser: 'unverified',
    });
  }
  return picked;
}
