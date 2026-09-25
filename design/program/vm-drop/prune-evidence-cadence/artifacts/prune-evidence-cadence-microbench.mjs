import { writeFileSync } from 'node:fs';
import { bindStuntEvidence, pruneEvidence, journalFor, PRUNE_EVIDENCE_CADENCE } from './src/combat/stuntEvidence.js';

function makeState(seedTick) {
  const entities = new Map();
  for (let i = 1; i <= 80; i++) entities.set(i, { id: i });
  const state = { tick: seedTick, entities, playerId: 1 };
  bindStuntEvidence(state);
  const j = journalFor(state);
  for (let i = 0; i < 64; i++) {
    const age = (i * 7) % 500;
    j.roots.set(`r${i}`, { tick: seedTick - age, id: `r${i}` });
    j.bodies.set(`b${i}`, { rootId: `r${i}`, id: `b${i}` });
  }
  for (let i = 0; i < 128; i++) {
    j.contacts.set(`c${i}`, { tick: seedTick - ((i * 3) % 200), id: `c${i}` });
  }
  for (let i = 0; i < 32; i++) {
    j.constraints.set(`k${i}`, { attached: i % 4 !== 0, lastTick: seedTick - ((i * 11) % 500), id: `k${i}` });
  }
  for (let i = 0; i < 80; i++) j.lives.set(`l${i}`, { id: `l${i}`, entity: { id: i + 1 } });
  return state;
}

const TICKS = 8000;
const SEED = 6000;

function run(forceEvery) {
  const state = makeState(SEED);
  const j = journalFor(state);
  let sink = 0, worst = 0;
  const t0 = performance.now();
  for (let t = 0; t < TICKS; t++) {
    const tick = SEED + t;
    state.tick = tick;
    if (t % 40 === 0) {
      j.roots.set(`fresh${t}`, { tick, id: `fresh${t}` });
      j.bodies.set(`freshb${t}`, { rootId: `fresh${t}`, id: `freshb${t}` });
      j.contacts.set(`freshc${t}`, { tick: tick - 170, id: `freshc${t}` });
    }
    const s0 = performance.now();
    if (forceEvery) {
      // legacy every-tick: bypass cadence by force
      pruneEvidence(state, tick, true);
    } else {
      pruneEvidence(state, tick);
    }
    const dt = performance.now() - s0;
    if (dt > worst) worst = dt;
    sink += j.roots.size + j.contacts.size;
  }
  return { ms: performance.now() - t0, worstMs: worst, sink, roots: j.roots.size, contacts: j.contacts.size };
}

// warm
run(true); run(false);
const before = run(true);
const after = run(false);
const result = {
  ticks: TICKS,
  cadence: PRUNE_EVIDENCE_CADENCE,
  beforeMs: before.ms,
  afterMs: after.ms,
  speedup: before.ms / after.ms,
  beforeWorstMs: before.worstMs,
  afterWorstMs: after.worstMs,
  worstSpeedup: before.worstMs / Math.max(after.worstMs, 1e-9),
  beforeSink: before.sink,
  afterSink: after.sink,
};
console.log(JSON.stringify(result, null, 2));
writeFileSync('scratch-prune-bench.json', `${JSON.stringify(result, null, 2)}\n`);
