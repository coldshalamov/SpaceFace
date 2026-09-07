#!/usr/bin/env node
// scripts/check-crucible-kit-order.mjs — PQ-137.05 20-seed Pulse vs physics kit ordering.
//
//   node scripts/check-crucible-kit-order.mjs
//   node scripts/check-crucible-kit-order.mjs --seeds=4242,8008,13502 --tick-cap=5400
//
// Headless only. Does not launch Chromium / Playwright / Electron.

import { runCrucibleKitOrder, KIT_ORDER_SEEDS, KIT_ORDER_TICK_CAP } from './lib/bench/crucibleKitOrder.mjs';

function parseArgs(argv) {
  const out = { seeds: [...KIT_ORDER_SEEDS], tickCap: KIT_ORDER_TICK_CAP };
  for (const a of argv) {
    if (a.startsWith('--seeds=')) {
      out.seeds = a.slice('--seeds='.length).split(',').map((s) => Number(s.trim())).filter(Number.isFinite);
    } else if (a.startsWith('--tick-cap=')) {
      out.tickCap = Number(a.slice('--tick-cap='.length));
    }
  }
  return out;
}

const opts = parseArgs(process.argv.slice(2));
const result = await runCrucibleKitOrder(opts);
if (!result.ok) {
  console.error(`check-crucible-kit-order: FAIL ${result.reason}`);
  process.exit(1);
}
console.log('check-crucible-kit-order: PASS');
