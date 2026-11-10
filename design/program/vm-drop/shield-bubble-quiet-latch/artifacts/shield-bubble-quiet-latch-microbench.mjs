/**
 * #159 — shield-bubble quiet-latch portable microbench.
 * Soft-GPU fps not a KPI. Picture contract ON.
 */
import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import {
  updateEntityShieldBubblePresentation,
  setShieldBubbleQuietLatchForBench,
} from '../src/render/weapons/shieldBubblePresentation.js';

const N = Number(process.env.N || 40);
const ITERS = Number(process.env.ITERS || 40000);
const WARM = 800;
const MODE = process.env.MODE || 'pair'; // off | on | pair

function makeBubble(shield = 100) {
  return {
    visible: false,
    material: { uniforms: { uFlash: { value: 0 }, uShellTime: { value: 0 } } },
    userData: {
      _prevShield: shield,
      _prevFlashT: 0,
      _collapseTimer: 0,
      _sfShieldQuietLatched: false,
    },
  };
}

function bench(label, fn) {
  for (let i = 0; i < WARM; i++) fn();
  if (global.gc) global.gc();
  const t0 = performance.now();
  for (let i = 0; i < ITERS; i++) fn();
  const us = ((performance.now() - t0) * 1000) / ITERS;
  return { label, us };
}

function runMode(on) {
  setShieldBubbleQuietLatchForBench(on);
  const ents = Array.from({ length: N }, (_, i) => ({ id: 10 + i, shield: 80 }));
  const bubbles = ents.map((e) => makeBubble(e.shield));
  let now = 1000;
  let sim = 100;
  // Arm latch when ON
  if (on) {
    for (let i = 0; i < 400; i++) {
      now += 0.016;
      sim += 0.016;
      for (let j = 0; j < N; j++) {
        updateEntityShieldBubblePresentation(ents[j], bubbles[j], now, sim, false);
      }
    }
  }
  const row = bench(on ? 'on' : 'off', () => {
    now += 0.016;
    sim += 0.016;
    for (let j = 0; j < N; j++) {
      updateEntityShieldBubblePresentation(ents[j], bubbles[j], now, sim, false);
    }
  });
  return {
    ...row,
    latched: bubbles.filter((b) => b.userData._sfShieldQuietLatched).length,
  };
}

let out;
if (MODE === 'off') out = runMode(false);
else if (MODE === 'on') out = runMode(true);
else {
  const off = runMode(false);
  const on = runMode(true);
  out = {
    N,
    ITERS,
    off,
    on,
    speedup: off.us / on.us,
    absBeforeUs: off.us,
  };
}
console.log(JSON.stringify(out));
if (MODE === 'pair') {
  writeFileSync(
    'artifacts/shield-bubble-quiet-latch-microbench.json',
    JSON.stringify(out, null, 2),
  );
}
