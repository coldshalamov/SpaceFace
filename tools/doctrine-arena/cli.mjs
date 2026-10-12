// Held-out counterplay tournament. Writes receipts under tools/doctrine-arena/results/.
// Usage:
//   node tools/doctrine-arena/cli.mjs --probe=cp_rescue_tow
//   node tools/doctrine-arena/cli.mjs --demos
//   node tools/doctrine-arena/cli.mjs --tournament

import { mkdir, writeFile } from 'node:fs/promises';
import { COUNTERPLAY_DOCTRINE_IDS } from '../../src/ai/counterplay/catalog.js';
import { DEV_SEEDS } from './scenes.mjs';
import { runCounterplayScenario } from './run.mjs';
import { runDemonstrations, runTournament, summarizeReceipts } from './tournament.mjs';

const args = process.argv.slice(2);
const probe = readArg('--probe');
const outDir = new URL('./results/', import.meta.url);

if (probe) {
  const seed = Number(readArg('--seed') || DEV_SEEDS[0]);
  const tape = readArg('--tape') || 'resists';
  const started = Date.now();
  const receipt = await runCounterplayScenario({
    doctrineId: probe,
    seed,
    tape,
    pilotId: readArg('--pilot') || undefined,
    mass: 'canonical',
    range: 'authored',
    terrain: 'open',
    ticks: Number(readArg('--ticks') || 340),
  });
  printReceipt(receipt, Date.now() - started);
} else if (args.includes('--demos')) {
  const seeds = args.includes('--held-out') ? undefined : DEV_SEEDS;
  const started = Date.now();
  const receipts = await runDemonstrations({ seeds });
  await dump('demos.json', receipts, Date.now() - started);
} else if (args.includes('--tournament')) {
  const started = Date.now();
  const receipts = await runTournament({
    seeds: args.includes('--full-seeds') ? undefined : [101],
    ticks: Number(readArg('--ticks') || 120),
  });
  await dump('tournament.json', receipts, Date.now() - started);
} else {
  console.log('doctrines: ' + COUNTERPLAY_DOCTRINE_IDS.join(', '));
  console.log('pass --probe=<id> or --demos or --tournament');
}

function readArg(name) {
  const hit = args.find((arg) => arg.startsWith(name + '='));
  return hit ? hit.slice(name.length + 1) : null;
}

function printReceipt(receipt, ms) {
  console.log(JSON.stringify({
    ms,
    doctrineId: receipt.doctrineId,
    tape: receipt.tape,
    phaseTrace: receipt.phaseTrace,
    telegraphTicks: receipt.telegraphTicks,
    goalProgress: receipt.goalProgress,
    goalComplete: receipt.goalComplete,
    unexpectedFire: receipt.unexpectedFire,
    fireAuthorized: receipt.fireAuthorized,
    playerDamage: receipt.playerDamage,
    projectiles: receipt.projectiles,
    opponentWeapons: receipt.opponentWeapons,
    driveDelta: receipt.driveDelta,
    detail: receipt.detail,
    physicsBackend: receipt.physicsBackend,
    sg02Ready: receipt.sg02Ready,
    opponentWeapons: receipt.opponentWeapons,
    end: receipt.end,
  }, null, 2));
}

async function dump(name, receipts, ms) {
  await mkdir(outDir, { recursive: true });
  const summary = summarizeReceipts(receipts);
  const payload = { ms, runs: receipts.length, summary, receipts };
  await writeFile(new URL(name, outDir), JSON.stringify(payload, null, 2));
  console.log(JSON.stringify({ ms, runs: receipts.length, summary }, null, 2));
}
