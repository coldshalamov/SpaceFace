/**
 * Primary KPI: combat kernel quiet per-combatant pre+post physics heat/bounds path.
 * Before = cool resolve + trailing sync+resolve + post ensure+sync+resolve.
 * After  = stashed dissipation + status-gated sync + post skip when runtime exists.
 * Soft-GPU fps not claimed.
 */
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = process.cwd();

function runOnce(mode, iters = 40000, n = 48) {
  const script = `
import {
  createCombatCatalog,
  ensureCombatState,
  ensureCombatant,
  resolveCombatProfile,
  syncCombatantBounds,
  entityKey,
} from './src/combat/runtime.js';

const catalog = createCombatCatalog();
const state = { tick: 0, entities: new Map(), combat: {} };
ensureCombatState(state);

const entities = [];
for (let i = 0; i < ${n}; i++) {
  const e = {
    id: 1000 + i,
    type: i % 5 === 0 ? 'station' : 'ship',
    alive: true,
    hull: 100, hullMax: 100,
    shield: 40, shieldMax: 40,
    armorHp: 10, armorMax: 10,
    cap: 50, capMax: 50,
    data: {},
  };
  entities.push(e);
  state.entities.set(e.id, e);
  ensureCombatant(state, e, catalog);
}

const dt = 1 / 60;
const mode = ${JSON.stringify(mode)};

function coolBefore(entity, runtime) {
  const profile = resolveCombatProfile(entity, catalog);
  const basePerTick = profile && profile.heat && Number(profile.heat.dissipationPerTick) || 0;
  const multiplier = runtime.multipliers && Number.isFinite(runtime.multipliers.heatDissipation)
    ? runtime.multipliers.heatDissipation : 1;
  runtime.heat = Math.max(0, runtime.heat - basePerTick * multiplier * (dt * 60));
}
function coolAfter(entity, runtime) {
  const basePerTick = Number.isFinite(runtime.heatDissipationPerTick)
    ? runtime.heatDissipationPerTick : 0;
  const multiplier = runtime.multipliers && Number.isFinite(runtime.multipliers.heatDissipation)
    ? runtime.multipliers.heatDissipation : 1;
  runtime.heat = Math.max(0, runtime.heat - basePerTick * multiplier * (dt * 60));
}

for (let w = 0; w < 200; w++) {
  for (const e of entities) {
    const runtime = ensureCombatant(state, e, catalog);
    const statusChanged = false;
    if (mode === 'before') {
      coolBefore(e, runtime);
      syncCombatantBounds(e, runtime, resolveCombatProfile(e, catalog));
      const r2 = ensureCombatant(state, e, catalog);
      syncCombatantBounds(e, r2, resolveCombatProfile(e, catalog));
    } else {
      coolAfter(e, runtime);
      if (statusChanged) syncCombatantBounds(e, runtime);
      const table = state.combat.entities;
      if (!(table && table[entityKey(e.id)])) ensureCombatant(state, e, catalog);
    }
  }
}

const t0 = performance.now();
for (let i = 0; i < ${iters}; i++) {
  state.tick = i;
  for (const e of entities) {
    const runtime = ensureCombatant(state, e, catalog);
    const statusChanged = false;
    if (mode === 'before') {
      coolBefore(e, runtime);
      syncCombatantBounds(e, runtime, resolveCombatProfile(e, catalog));
      const r2 = ensureCombatant(state, e, catalog);
      syncCombatantBounds(e, r2, resolveCombatProfile(e, catalog));
    } else {
      coolAfter(e, runtime);
      if (statusChanged) syncCombatantBounds(e, runtime);
      const table = state.combat.entities;
      if (!(table && table[entityKey(e.id)])) ensureCombatant(state, e, catalog);
    }
  }
}
process.stdout.write(JSON.stringify({ ms: performance.now() - t0 }));
`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8', cwd: ROOT, timeout: 180000,
  });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || 'fail');
  return JSON.parse(r.stdout);
}

const pairs = [];
for (let i = 0; i < 9; i++) {
  const before = runOnce('before');
  const after = runOnce('after');
  pairs.push({
    beforeMs: +before.ms.toFixed(3),
    afterMs: +after.ms.toFixed(3),
    speedup: +(before.ms / Math.max(after.ms, 1e-9)).toFixed(3),
  });
}
const xs = pairs.map((p) => p.speedup).sort((a, b) => a - b);
const out = {
  label: 'combat-kernel-profile-reuse',
  primary: 'quiet-48-combatant-pre-post-heat-bounds',
  pairs,
  medianSpeedup: xs[Math.floor(xs.length / 2)],
  minSpeedup: xs[0],
  maxSpeedup: xs[xs.length - 1],
  note: 'Before=cool resolve + trailing sync resolve + post ensure+sync resolve. After=stashed dissipation + status-gated sync + post skip when runtime exists. Soft-GPU fps not claimed.',
};
writeFileSync(join(ROOT, 'artifacts/combat-kernel-profile-reuse-microbench.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
