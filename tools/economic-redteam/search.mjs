// Coverage-guided search over varied command lists.
// Each sequence boots a fresh sim. Promising traces are minimized by deleting
// commands and replaying what remains. A receipt stores the cursor so a later
// run resumes. Time and heap ceilings stop the run without discarding the receipt.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { mulberry32, mulberry32FromContinuation } from '../../src/core/rng.js';
import { FAMILY_IDS } from './families.mjs';
import {
  badQty,
  buy,
  dock,
  leaveDock,
  lootDrop,
  offlineCatchup,
  raiseStanding,
  saveContinue,
  sell,
  service,
  shipLoss,
  sourceFit,
  stepTicks,
  tow,
} from './grammar.mjs';
import { HOME_FACTION, HOME_STATION, IRON, bootRedTeam } from './runtime.mjs';

const DEFAULT_SEQUENCES = 500;
const TIME_BUDGET_MS = 90_000;
const HEAP_BUDGET = 800 * 1024 * 1024;

const COMMAND_IDS = Object.freeze([
  'raise_standing',
  'loan',
  'buy',
  'sell',
  'undock',
  'loot_stolen',
  'loot_iron',
  'step',
  'dock',
  'dock_customs',
  'offline',
  'bad_qty',
  'tow',
  'source_fit',
  'ship_loss',
  'save_continue',
]);

function apply(sim, command) {
  switch (command.id) {
    case 'buy':
      return { sim, step: buy(sim, command.commodityId || IRON, command.qty || 1) };
    case 'sell':
      return { sim, step: sell(sim, command.commodityId || IRON, command.qty || 1) };
    case 'raise_standing':
      return { sim, step: raiseStanding(sim, command.factionId || HOME_FACTION, command.delta || 15) };
    case 'loan':
      return { sim, step: service(sim, 'loan') };
    case 'loot_stolen':
      return {
        sim,
        step: lootDrop(sim, {
          commodityId: 'cmdty_stolen_goods',
          qty: command.qty || 1,
          source: 'kill_burst',
        }),
      };
    case 'loot_iron':
      return {
        sim,
        step: lootDrop(sim, { commodityId: IRON, qty: command.qty || 1, source: command.source || 'mining' }),
      };
    case 'step':
      return { sim, step: stepTicks(sim, command.ticks || 8) };
    case 'undock':
      return { sim, step: leaveDock(sim) };
    case 'dock':
      return { sim, step: dock(sim, command.stationId || HOME_STATION) };
    case 'dock_customs':
      return { sim, step: dock(sim, 'station_customs') };
    case 'offline':
      return { sim, step: offlineCatchup(sim, command.elapsedSec || 120) };
    case 'bad_qty':
      return { sim, step: badQty(sim, IRON, command.qty == null ? -1 : command.qty) };
    case 'tow':
      return { sim, step: tow() };
    case 'source_fit':
      return { sim, step: sourceFit() };
    case 'ship_loss':
      return { sim, step: shipLoss() };
    case 'save_continue': {
      const out = saveContinue(sim, command.slot || 'ert-search');
      return { sim: out.sim, step: out.result };
    }
    default:
      return { sim, step: { action: command.id, unavailable: true, reason: 'unknown_command' } };
  }
}

export function runCommandList(seed, commands) {
  let sim = bootRedTeam(seed);
  const steps = [];
  for (const command of commands) {
    const applied = apply(sim, command);
    sim = applied.sim;
    steps.push(applied.step);
  }
  return { sim, steps };
}

function scoreSteps(steps) {
  const reasons = [];
  let creditsDelta = 0;
  let sawStolenLoot = false;
  let sawBuy = false;
  let sawSell = false;
  let tradeNet = 0;
  for (const step of steps) {
    creditsDelta += Number(step.creditsDelta) || 0;
    if (step.action === 'buy' || step.action === 'sell') tradeNet += Number(step.creditsDelta) || 0;
    if (step.action === 'buy' && step.ok) sawBuy = true;
    if (step.action === 'sell' && step.ok) sawSell = true;
    if (step.action === 'loot_drop' && step.detail && step.detail.commodityId === 'cmdty_stolen_goods') {
      sawStolenLoot = true;
    }
    const list = step.detail && step.detail.reasons;
    if (Array.isArray(list)) reasons.push(...list);
  }
  const injectedRep = steps.some((step) => step.action === 'raise_standing');
  const chosenKillBurst = steps.some((step) => step.action === 'loot_drop'
    && step.detail && step.detail.source === 'kill_burst' && step.detail.commodityId);
  // Injected standing and a caller-chosen kill_burst commodity are not confirmed exploits.
  const bayLaunder = !chosenKillBurst && sawStolenLoot && reasons.includes('salvage:bay_sale') && creditsDelta > 0;
  const closedWash = !injectedRep && sawBuy && sawSell && tradeNet > 0;
  return {
    bayLaunder,
    closedWash,
    suspicious: bayLaunder || closedWash,
    creditsDelta,
    reasons,
  };
}

function leastCovered(coverage, rng) {
  let best = COMMAND_IDS[0];
  let bestCount = coverage[best] ?? 0;
  for (const id of COMMAND_IDS) {
    const count = coverage[id] ?? 0;
    if (count < bestCount || (count === bestCount && rng() < 0.5 && id !== best)) {
      best = id;
      bestCount = count;
    }
  }
  return best;
}

function vary(id, rng, index) {
  const qty = 1 + Math.floor(rng() * 6);
  switch (id) {
    case 'buy':
    case 'sell':
      return { id, commodityId: rng() < 0.7 ? IRON : 'cmdty_silicate', qty };
    case 'raise_standing':
      return { id, delta: 15 };
    case 'loot_stolen':
      return { id, qty };
    case 'loot_iron':
      return { id, qty, source: rng() < 0.5 ? 'mining' : 'kill_burst' };
    case 'step':
      return { id, ticks: 4 + Math.floor(rng() * 28) };
    case 'dock':
      return { id, stationId: HOME_STATION };
    case 'bad_qty':
      return { id, qty: rng() < 0.5 ? -3 : Number.NaN };
    case 'save_continue':
      return { id, slot: `ert-search-${index}` };
    case 'offline':
      return { id, elapsedSec: 30 + Math.floor(rng() * 90) };
    default:
      return { id };
  }
}

function washBundle(rng) {
  const grants = 10 + Math.floor(rng() * 6);
  const qty = 1 + Math.floor(rng() * 8);
  const commands = [];
  for (let i = 0; i < grants; i += 1) commands.push({ id: 'raise_standing', delta: 15 });
  commands.push({ id: 'loan' });
  commands.push({ id: 'buy', commodityId: IRON, qty });
  commands.push({ id: 'sell', commodityId: IRON, qty });
  return commands;
}

function bayBundle(rng) {
  return [
    { id: 'undock' },
    { id: 'loot_stolen', qty: 1 + Math.floor(rng() * 3) },
    { id: 'step', ticks: 16 + Math.floor(rng() * 24) },
    { id: 'dock', stationId: HOME_STATION },
  ];
}

function nextSequence(coverage, rng, index) {
  const roll = rng();
  if (roll < 0.18) return { familyId: 'zero_spread_trade_cycles', commands: washBundle(rng) };
  if (roll < 0.36) return { familyId: 'contraband_relabel', commands: bayBundle(rng) };
  const length = 3 + Math.floor(rng() * 4);
  const commands = [];
  for (let i = 0; i < length; i += 1) {
    const id = leastCovered(coverage, rng);
    commands.push(vary(id, rng, index));
  }
  return { familyId: FAMILY_IDS[index % FAMILY_IDS.length], commands };
}

function shrinkCommands(seed, commands, predicate) {
  let current = commands.slice();
  let guard = 0;
  let changed = true;
  while (changed && current.length > 1 && guard < 24) {
    changed = false;
    guard += 1;
    for (let i = 0; i < current.length; i += 1) {
      const trial = current.filter((_, index) => index !== i);
      const replay = runCommandList(seed, trial);
      if (predicate(scoreSteps(replay.steps))) {
        current = trial;
        changed = true;
        break;
      }
    }
  }
  return current;
}

function readReceipt(path) {
  if (!path || !existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function writeReceipt(path, body) {
  if (!path) return;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(body, null, 2)}\n`);
}

export function runSearch(options = {}) {
  const sequences = Math.max(1, Math.floor(Number(options.sequences) || DEFAULT_SEQUENCES));
  const seed = (Number(options.seed) >>> 0) || 1845;
  const receiptPath = options.receiptPath || null;
  const timeBudget = Number(options.timeBudgetMs) > 0 ? Number(options.timeBudgetMs) : TIME_BUDGET_MS;
  const heapBudget = Number(options.heapBudget) > 0 ? Number(options.heapBudget) : HEAP_BUDGET;
  const prior = options.resume === false ? null : readReceipt(receiptPath);
  const resume = !!(prior && prior.resumable && prior.seed === seed
    && Array.isArray(prior.traces) && prior.traces.length > 0 && prior.traces.length < sequences);
  const rng = resume && prior.rngContinuation
    ? mulberry32FromContinuation(prior.rngContinuation)
    : mulberry32(seed ^ 0x9e3779b9);
  const coverage = Object.fromEntries(COMMAND_IDS.map((id) => [id, 0]));
  const familyCoverage = Object.fromEntries(FAMILY_IDS.map((id) => [id, 0]));
  if (resume && prior.coverage) Object.assign(coverage, prior.coverage);
  if (resume && prior.familyCoverage) Object.assign(familyCoverage, prior.familyCoverage);
  const traces = resume && Array.isArray(prior.traces) ? prior.traces.slice() : [];
  const findings = resume && Array.isArray(prior.findings) ? prior.findings.slice() : [];
  const mutations = resume && Array.isArray(prior.mutations) ? prior.mutations.slice() : [];
  const started = performance.now();
  let cursor = resume ? prior.traces.length : 0;
  let stopped = null;

  const snapshot = (done) => ({
    campaign: 'SF-CLOUD-13',
    seed,
    sequencesRequested: sequences,
    sequencesCompleted: traces.length,
    cursor: traces.length,
    resumable: !done && cursor < sequences,
    reset: 'reboot',
    walletWrites: 0,
    coverage,
    familyCoverage,
    findingCount: findings.length,
    mutationCount: mutations.length,
    traces,
    findings,
    mutations,
    rngContinuation: typeof rng.getState === 'function' ? rng.getState() : null,
    stopped,
  });

  for (; cursor < sequences; cursor += 1) {
    const elapsed = performance.now() - started;
    const heap = process.memoryUsage().heapUsed;
    if (elapsed > timeBudget || heap > heapBudget) {
      stopped = { reason: elapsed > timeBudget ? 'time_ceiling' : 'heap_ceiling', elapsed, heap, cursor };
      break;
    }
    const planned = nextSequence(coverage, rng, cursor);
    for (const command of planned.commands) coverage[command.id] = (coverage[command.id] || 0) + 1;
    familyCoverage[planned.familyId] = (familyCoverage[planned.familyId] || 0) + 1;
    const played = runCommandList(seed, planned.commands);
    const scored = scoreSteps(played.steps);
    const row = {
      index: cursor,
      seed,
      familyId: planned.familyId,
      commands: planned.commands,
      creditsDelta: scored.creditsDelta,
      classification: scored.bayLaunder
        ? 'exploit_contraband_bay'
        : (scored.closedWash ? 'exploit_wash' : 'observed'),
    };
    traces.push(row);
    if (scored.suspicious) findings.push(row);
    const shortened = mutations.filter((row) => row.after < row.before).length;
    if (scored.suspicious && planned.commands.length > 4 && shortened < 2) {
      const shrunk = shrinkCommands(seed, planned.commands, (next) => (
        row.classification === 'exploit_contraband_bay' ? next.bayLaunder : next.closedWash
      ));
      const replay = runCommandList(seed, shrunk);
      const replayScore = scoreSteps(replay.steps);
      mutations.push({
        index: cursor,
        before: planned.commands.length,
        after: shrunk.length,
        commands: shrunk,
        stillFails: replayScore.suspicious,
        creditsDelta: replayScore.creditsDelta,
      });
    }
    if (receiptPath && (cursor + 1) % 50 === 0) writeReceipt(receiptPath, snapshot(false));
  }
  const done = cursor >= sequences && !stopped;
  if (!done && !stopped) stopped = { reason: 'incomplete', cursor };

  const heldOutSeeds = [seed + 17, seed + 99];
  const heldOutRuns = [];
  if (done && options.skipHeldOut !== true) {
    const sample = mutations.filter((row) => row.stillFails).slice(0, 2);
    for (const held of heldOutSeeds) {
      const local = mulberry32(held);
      const bundle = local() < 0.5 ? washBundle(local) : bayBundle(local);
      const played = runCommandList(held, bundle);
      const scored = scoreSteps(played.steps);
      heldOutRuns.push({
        seed: held,
        commands: bundle,
        classification: scored.bayLaunder
          ? 'exploit_contraband_bay'
          : (scored.closedWash ? 'exploit_wash' : 'observed'),
        creditsDelta: scored.creditsDelta,
      });
      for (const finding of sample) {
        const replay = runCommandList(held, finding.commands);
        const replayScore = scoreSteps(replay.steps);
        heldOutRuns.push({
          seed: held,
          replayOf: finding.index,
          commands: finding.commands,
          stillFails: replayScore.suspicious,
          creditsDelta: replayScore.creditsDelta,
        });
      }
    }
  }

  const receipt = snapshot(done);
  receipt.heldOutSeeds = heldOutSeeds;
  receipt.heldOutRuns = heldOutRuns;
  receipt.resumable = !done;
  writeReceipt(receiptPath, receipt);

  return {
    seed,
    sequences,
    sequencesCompleted: cursor,
    coverage: familyCoverage,
    commandCoverage: coverage,
    traces,
    findings,
    mutations,
    mutationCount: mutations.length,
    findingCount: findings.length,
    heldOutSeeds,
    heldOutRuns,
    resumable: !done,
    stopped,
    reset: 'reboot',
    walletWrites: 0,
  };
}
