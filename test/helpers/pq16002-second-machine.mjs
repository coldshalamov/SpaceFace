// PQ-160.02 "second machine" — a clean-room child process.
//
// Receives ONLY a run share code and (optionally) a ghost share file — the same artifacts a
// second player's machine would get. It decodes the code, resolves the starter build, runs the
// real production swarm on the decoded seed, imports the ghost block into this process's fresh
// crucible profile, and prints one JSON line for the parent to compare.
//
//   node test/helpers/pq16002-second-machine.mjs --code=SFC1-... [--ghost-file=path]
//     [--tick-cap=3600] [--wave-count=1] [--pose-tick=300]

import { readFileSync } from 'node:fs';
import { applyRunShareCode, importGhostShareText } from '../../src/ui/screens/shareCode.js';
import {
  armGhostPlayback,
  getGhostPlaybackTape,
  ghostHash,
  ghostPlaybackContract,
  ghostPoseAt,
} from '../../src/systems/survivalRecords.js';
import { simulateCrucibleSwarm } from '../../scripts/lib/bench/crucibleBench.mjs';

const LINE = 'PQ16002_RESULT_JSON:';

function fail(error) {
  process.stdout.write(LINE + JSON.stringify({ ok: false, error: String(error) }) + '\n');
  process.exit(2);
}

let code = '';
let ghostFile = null;
let tickCap = 3600;
let waveCount = 1;
let poseTick = 300;
for (const arg of process.argv.slice(2)) {
  if (arg.startsWith('--code=')) code = arg.slice('--code='.length);
  else if (arg.startsWith('--ghost-file=')) ghostFile = arg.slice('--ghost-file='.length);
  else if (arg.startsWith('--tick-cap=')) tickCap = Number(arg.slice('--tick-cap='.length));
  else if (arg.startsWith('--wave-count=')) waveCount = Number(arg.slice('--wave-count='.length));
  else if (arg.startsWith('--pose-tick=')) poseTick = Number(arg.slice('--pose-tick='.length));
}

const applied = applyRunShareCode(code);
if (!applied.ok) fail(applied.error || 'code did not decode');

const run = await simulateCrucibleSwarm({
  arenaId: applied.arenaId,
  loadoutId: applied.starterId,
  seed: applied.seed,
  tickCap,
  waveCount,
});

let ghost = null;
if (ghostFile) {
  const text = readFileSync(ghostFile, 'utf8');
  const imported = importGhostShareText(text);
  if (!imported.ok) fail(`ghost import failed: ${imported.error}`);
  const armed = armGhostPlayback(imported.hash);
  const tape = armed ? getGhostPlaybackTape() : null;
  if (!tape) fail('ghost import landed but playback could not arm');
  ghost = {
    hash: imported.hash,
    frameCount: imported.frameCount,
    alreadyPresent: imported.alreadyPresent === true,
    armedHash: ghostHash(tape),
    poseAtTick: ghostPoseAt(tape, poseTick),
    contract: ghostPlaybackContract(tape, poseTick),
  };
}

process.stdout.write(LINE + JSON.stringify({
  ok: true,
  decoded: {
    seed: applied.seed,
    ruleset: applied.ruleset,
    arenaId: applied.arenaId,
    starterId: applied.starterId,
    mutators: applied.mutators,
    ghostHash: applied.ghostHash,
  },
  runHash: run.runHash,
  ticks: run.ticks,
  stopReason: run.stopReason,
  ghost,
}) + '\n');
