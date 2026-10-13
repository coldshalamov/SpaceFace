// Bounded sweep: every journey × every seed, one runtime at a time.

import { listJourneys } from './journeys.mjs';
import { PERSONA_IDS } from './personas.mjs';
import { SWEEP_SEEDS } from './manifest.mjs';
import { compareDigests } from './detectors.mjs';
import { verifyHeadedBrowser } from './headed.mjs';
import { runSession } from './session.mjs';

export function personaIdForSweepIndex(index) {
  return PERSONA_IDS[index % PERSONA_IDS.length];
}

export async function runSweep(options = {}) {
  const journeys = options.journeys || listJourneys().map((journey) => journey.id);
  const seeds = options.seeds || SWEEP_SEEDS;
  const runs = [];
  const full = [];
  let index = 0;
  for (const journeyId of journeys) {
    for (const seed of seeds) {
      const personaId = options.personaId || personaIdForSweepIndex(index);
      const surface = index % 4 === 0 ? 'simulated-touch' : 'keyboard';
      const result = await runSession({
        journeyId,
        personaId,
        seed,
        surface,
        fault: null,
      });
      full.push(result);
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
  const headed = selectHeaded(full, 25);
  const repeated = runs[0]
    ? await runSession({
      journeyId: runs[0].journeyId,
      personaId: runs[0].personaId,
      seed: runs[0].seed,
      surface: runs[0].surface,
      fault: null,
    })
    : null;
  const drift = repeated ? compareDigests(runs[0].digest, repeated.digest) : null;
  if (drift) confirmed.push({ ...drift, journeyId: runs[0].journeyId, seed: runs[0].seed });
  const headedBrowser = await verifyHeadedBrowser(headed);
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
    determinismDrift: drift,
    headedBrowser,
    performance: {
      medianWallMs: walls.length ? walls[(walls.length / 2) | 0] : null,
      maxWallMs: walls.length ? walls[walls.length - 1] : null,
      fpsClaimed: false,
    },
    runs,
  };
}

export function publicSweepRow(run) {
  if (!run || typeof run !== 'object') return run;
  const failing = run.status === 'fail' || (Array.isArray(run.confirmed) && run.confirmed.length > 0);
  if (failing) return run;
  const { tape, ...rest } = run;
  return {
    ...rest,
    tapeHash: run.tapeHash,
    tapeTicks: tape && tape.frames ? tape.frames.length : undefined,
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
  const touch = runs.filter((run) => run.surface === 'simulated-touch');
  const touchStep = Math.max(1, Math.floor(touch.length / 8));
  for (let i = 0; i < touch.length && picked.length < 8; i += touchStep) picked.push(touch[i]);
  const stride = Math.max(1, Math.floor(runs.length / count));
  for (let i = 0; i < runs.length && picked.length < count; i += stride) {
    if (!picked.includes(runs[i])) picked.push(runs[i]);
  }
  return picked.slice(0, count);
}
