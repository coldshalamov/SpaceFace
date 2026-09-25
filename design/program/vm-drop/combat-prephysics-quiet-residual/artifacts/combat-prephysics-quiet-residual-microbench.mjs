/**
 * Primary KPI: quiet combat prePhysics residual after #83+#84.
 * Before = ensure(resolve+sync) + isDynamic×2 + sink miss + cool always (heat=0).
 * After  = production ensure quiet-hit + cool heat0 skip + dynamic/momentum gated.
 * Soft-GPU fps not claimed.
 */
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const ROOT = process.cwd();

function runOnce(mode, iters = 50000, n = 48) {
  const script = `
import {
  createCombatCatalog,
  ensureCombatState,
  ensureCombatant,
  resolveCombatProfile,
  syncCombatantBounds,
  entityKey,
} from './src/combat/runtime.js';
import { MOMENTUM_SINK_STATUS_ID } from './src/data/combatDefs.js';
import { isDynamicPhysicsBodyEntity, writePhysicsBodyResponse } from './src/core/physicsAuthority.js';
import { applyMomentumSink } from './src/combat/momentumSink.js';

const catalog = createCombatCatalog();
const state = { tick: 0, entities: new Map(), combat: {} };
ensureCombatState(state);

const entities = [];
for (let i = 0; i < ${n}; i++) {
  const e = {
    id: 1000 + i,
    type: 'ship',
    alive: true,
    hull: 100, hullMax: 100,
    shield: 40, shieldMax: 40,
    armorHp: 10, armorMax: 10,
    cap: 50, capMax: 50,
    data: {},
    physicsBody: { dynamic: true, mass: 40, radius: 2, schemaVersion: 1 },
    vel: { x: 0, y: 0, z: 0 },
    pos: { x: i, z: 0 },
  };
  entities.push(e);
  state.entities.set(e.id, e);
  ensureCombatant(state, e, catalog);
}

const dt = 1/60;
const mode = ${JSON.stringify(mode)};
const impulse = { x: 0, y: 0, z: 0 };

function coolAlways(runtime) {
  const basePerTick = Number.isFinite(runtime.heatDissipationPerTick) ? runtime.heatDissipationPerTick : 0;
  const multiplier = runtime.multipliers && Number.isFinite(runtime.multipliers.heatDissipation)
    ? runtime.multipliers.heatDissipation : 1;
  runtime.heat = Math.max(0, runtime.heat - basePerTick * multiplier * (dt * 60));
}
function coolQuiet(runtime) {
  if (!(runtime.heat > 0)) return;
  coolAlways(runtime);
}

function ensureBefore(state, entity, catalog) {
  // Pre-#85 ensure: always resolve + sync on existing runtime.
  const combat = ensureCombatState(state);
  const key = entityKey(entity.id);
  let runtime = combat.entities[key];
  const profile = resolveCombatProfile(entity, catalog);
  if (!runtime || runtime.profileId !== (profile && profile.id)) {
    // warm path only
  }
  if (!Number.isFinite(runtime.heatDissipationPerTick)) {
    runtime.heatDissipationPerTick = profile && profile.heat
      ? Number(profile.heat.dissipationPerTick) || 0 : 0;
  }
  syncCombatantBounds(entity, runtime, profile);
  return runtime;
}

function tickBefore(e) {
  const runtime = ensureBefore(state, e, catalog);
  const response = runtime.physicsResponse;
  if (isDynamicPhysicsBodyEntity(e) && response
    && (response.massScale !== 1 || response.inertiaScale !== 1)) {
    writePhysicsBodyResponse(e, response);
  }
  if (isDynamicPhysicsBodyEntity(e)) {
    applyMomentumSink(state, e, runtime, dt, impulse);
  }
  coolAlways(runtime);
}

function tickAfter(e) {
  const runtime = ensureCombatant(state, e, catalog);
  const response = runtime.physicsResponse;
  const scaledResponse = !!(response && (response.massScale !== 1 || response.inertiaScale !== 1));
  const sinkActive = !!(runtime.statuses && runtime.statuses[MOMENTUM_SINK_STATUS_ID]);
  if (scaledResponse || sinkActive) {
    if (isDynamicPhysicsBodyEntity(e)) {
      if (scaledResponse) writePhysicsBodyResponse(e, response);
      if (sinkActive) applyMomentumSink(state, e, runtime, dt, impulse);
    }
  }
  coolQuiet(runtime);
}

const fn = mode === 'before' ? tickBefore : tickAfter;
for (let w = 0; w < 300; w++) for (const e of entities) fn(e);
const t0 = performance.now();
for (let i = 0; i < ${iters}; i++) {
  state.tick = i;
  for (const e of entities) fn(e);
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
  label: 'combat-prephysics-quiet-residual',
  primary: 'quiet-48-combatant-prephysics-residual-after-84',
  pairs,
  medianSpeedup: xs[Math.floor(xs.length / 2)],
  minSpeedup: xs[0],
  maxSpeedup: xs[xs.length - 1],
  note: 'Before=ensure resolve+sync + isDynamic×2 + sink miss + cool always. After=production ensure quiet-hit + cool heat0 skip + dynamic/momentum gated. Soft-GPU fps not claimed.',
};
writeFileSync(join(ROOT, 'artifacts/combat-prephysics-quiet-residual-microbench.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
