import { COUNTERPLAY_DOCTRINE_IDS } from '../../src/ai/counterplay/catalog.js';
import { runCounterplayScenario } from './run.mjs';
import { HELD_OUT_SEEDS, demonstrationScene } from './scenes.mjs';

export const TOURNAMENT_PILOTS = Object.freeze([
  'close_booster',
  'rope_manipulator',
  'evasive',
  'civilian_protector',
]);

export async function runTournament(options = {}) {
  const doctrines = options.doctrines || COUNTERPLAY_DOCTRINE_IDS;
  const seeds = options.seeds || HELD_OUT_SEEDS.slice(0, 2);
  const pilots = options.pilots || TOURNAMENT_PILOTS;
  const masses = options.masses || ['light', 'heavy'];
  const ranges = options.ranges || ['close', 'far'];
  const terrains = options.terrains || ['open', 'cover'];
  const ticks = options.ticks || 150;
  const receipts = [];
  for (const doctrineId of doctrines) {
    for (const seed of seeds) {
      for (const pilotId of pilots) {
        for (const mass of masses) {
          for (const range of ranges) {
            for (const terrain of terrains) {
              receipts.push(await runCounterplayScenario({
                doctrineId,
                seed,
                pilotId,
                mass,
                range,
                terrain,
                tape: 'archetype',
                ticks,
              }));
            }
          }
        }
      }
    }
  }
  return receipts;
}

export async function runDemonstrations(options = {}) {
  const doctrines = options.doctrines || COUNTERPLAY_DOCTRINE_IDS;
  const seeds = options.seeds || HELD_OUT_SEEDS;
  const tapes = options.tapes || ['resists', 'counter'];
  const receipts = [];
  for (const doctrineId of doctrines) {
    for (const seed of seeds) {
      for (const tape of tapes) {
        const scene = demonstrationScene(doctrineId, seed, tape);
        if (options.ticks) scene.ticks = options.ticks;
        receipts.push(await runCounterplayScenario({ scene }));
      }
    }
  }
  return receipts;
}

export function summarizeReceipts(receipts) {
  const byDoctrine = {};
  for (const receipt of receipts) {
    const row = byDoctrine[receipt.doctrineId] || (byDoctrine[receipt.doctrineId] = {
      runs: 0,
      meanProgress: 0,
      minProgress: 1,
      maxProgress: 0,
      unexpectedFire: 0,
      telegraphRuns: 0,
      complete: 0,
    });
    row.runs += 1;
    row.meanProgress += receipt.goalProgress || 0;
    row.minProgress = Math.min(row.minProgress, receipt.goalProgress || 0);
    row.maxProgress = Math.max(row.maxProgress, receipt.goalProgress || 0);
    row.unexpectedFire += receipt.unexpectedFire || 0;
    if ((receipt.telegraphTicks || 0) > 0) row.telegraphRuns += 1;
    if (receipt.goalComplete) row.complete += 1;
  }
  for (const row of Object.values(byDoctrine)) {
    row.meanProgress = row.runs ? Math.round((row.meanProgress / row.runs) * 1000) / 1000 : 0;
  }
  return byDoctrine;
}
