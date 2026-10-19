// D191 diagnostic bench: where does the Ceres SG-02 (native Rapier) step cost concentrate?
//
// Boots the real production runtime under Node (createAuthoritativeRuntime nodeSafeOnly —
// same systems the five-minute acceptance fixtures use), enters sector_ceres_belt, brings
// up the rapier-dynamic authority, then measures per-tick milliseconds for:
//
//   physicsUpdate   — the whole `physics` system slot (sync + owner.step + hash + sweeps)
//   syncLayers      — syncFromEntityLayers (entity->body record maintenance)
//   ownerStep       — Sg02DynamicBodyOwner.step (JS command consume + pre/post passes + solve)
//   worldStep       — RAPIER world.step / stepWithEvents (the native solve itself)
//   captureImpacts  — JS drain of the contact-force event queue (incl. world.contactPair calls)
//
// Configs A/B/C answer "what inside the solve is removable":
//   baseline   — production tuning as shipped (numSolverIterations=12, contact-force events on)
//   noEvents   — identical run with the event queue unplugged (owner._eventQueue = null)
//   solverIter4— identical run with numSolverIterations 12 -> 4 (Rapier default)
//
// Node-level sim tick time only — not a host wall-clock claim. Deterministic seeds keep the
// three runs comparable; small post-touch trajectory drift is expected and disclosed.
//
// Usage: node scripts/bench-d191-ceres-physics.mjs [--ticks N] [--seed N] [--player-at pocket]
import { performance } from 'node:perf_hooks';

import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';

const SECTOR = 'sector_ceres_belt';
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [];
}));
const TICKS = Math.max(60, Number.parseInt(args.ticks ?? '360', 10) || 360);
const SEED = Number.parseInt(args.seed ?? '47', 10) || 47;
const WARMUP = 90;
// Civic pocket (refinery) centre, sector-local — the pocket the defect names.
const POCKET_LOCAL = { x: -1100, z: 620 };

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}
function p95(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
}

async function bootConfig({ solverIterations = null, dropEventQueue = false, ablate = null } = {}) {
  const runtime = createAuthoritativeRuntime({
    profileId: 'production',
    nodeSafeOnly: true,
    seed: SEED,
    helpers: { raycastToPlane() { return { x: 0, y: 0, z: 0 }; } },
  });
  const { state } = runtime;
  state.mode = 'flight';
  state.aceMemory ||= {};
  state.aceMemory.ace_rust_lord_orro = { id: 'ace_rust_lord_orro', fled: true };

  const origin = sectorLocalToGlobalForSector(POCKET_LOCAL, SECTOR);
  const player = runtime.spawn(makeShipEntitySpec('ship_hornet', {
    isPlayer: true,
    player: state.player,
    pos: { x: origin.x, z: origin.z },
    fittings: [],
  }));
  state.playerId = player.id;

  const worldSystem = runtime.getSystem('world');
  worldSystem.enterSector('sector_helios_prime');
  worldSystem.enterSector(SECTOR);

  const physics = runtime.getSystem('physics');
  const ready = await physics.prepareBackend(state, { reset: true });
  if (!ready || !physics._sg02) throw new Error('SG-02 authority did not come up');
  const owner = physics._sg02;

  if (solverIterations != null && owner.world.integrationParameters) {
    owner.world.integrationParameters.numSolverIterations = solverIterations;
  }
  if (dropEventQueue) {
    owner._eventQueue = null; // step() instead of step(eventQueue): unplugs contact-force events
  }

  // Cost-attribution ablations, applied mid-warmup once every record is materialized.
  // These mutate the live world to price a collider class; measurement surgery only.
  //   fxSensor   — fx colliders become sensors: leave the contact graph for the
  //                intersection graph (bool overlap only, no manifolds).
  //   fxGroups0  — fx colliders get collision groups 0: no cross-body pair generation.
  //                (Same-body pairs bypass group filters — verified by micro-bench.)
  //   fxSilent   — fx colliders get sensor+groups0: zero contact/intersection work,
  //                broadphase proxies stay. Prices all fx narrowphase bookkeeping.
  //   fxDisabled — fx colliders setEnabled(false): proxies leave the broadphase too.
  //                True upper bound of the fx contribution.
  //   allStaticDisabled — every non-dynamic collider disabled: static-contact floor.
  const applyAblation = () => {
    let touched = 0;
    for (const rec of owner.records.values()) {
      const isFx = rec.entity?.type === 'fx';
      const isStatic = !(rec.spec?.dynamic === true);
      for (const collider of rec.colliders || []) {
        if (ablate === 'fxSensor' && isFx) { collider.setSensor(true); touched += 1; }
        else if (ablate === 'fxGroups0' && isFx) { collider.setCollisionGroups(0); touched += 1; }
        else if (ablate === 'fxSilent' && isFx) { collider.setSensor(true); collider.setCollisionGroups(0); touched += 1; }
        else if (ablate === 'fxDisabled' && isFx) { collider.setEnabled(false); touched += 1; }
        else if (ablate === 'allStaticDisabled' && isStatic) { collider.setEnabled(false); touched += 1; }
      }
    }
    console.log(`    [ablate=${ablate}] touched ${touched} colliders`);
  };

  // Instrument owner seams. The registry calls methods on these objects by name, so an
  // own-property wrap on the forked instance intercepts the real per-tick path.
  const acc = { physicsUpdate: [], syncLayers: [], ownerStep: [], worldStep: [], captureImpacts: [] };
  const wrap = (obj, key, bucket) => {
    const orig = obj[key];
    if (typeof orig !== 'function') throw new Error(`cannot wrap ${key}`);
    obj[key] = function (...callArgs) {
      const t0 = performance.now();
      try { return orig.apply(this, callArgs); } finally {
        acc[bucket].push(performance.now() - t0);
      }
    };
  };
  wrap(owner.world, 'step', 'worldStep');
  wrap(owner, 'step', 'ownerStep');
  wrap(owner, 'syncFromEntityLayers', 'syncLayers');
  wrap(owner, '_captureContactImpacts', 'captureImpacts');
  wrap(physics, 'update', 'physicsUpdate');
  // physics.update minus ownerStep splits into the entity-layer sync seam (which itself
  // contains machinery/latch reconcile + activity classification + the dressing fold)
  // and the contact-emit tail.
  if (typeof physics._syncSg02DynamicAuthorityEntities === 'function') {
    acc.syncAuthorityEntities = []; wrap(physics, '_syncSg02DynamicAuthorityEntities', 'syncAuthorityEntities');
  }
  if (typeof physics._emitSg02ContactImpacts === 'function') {
    acc.emitImpacts = []; wrap(physics, '_emitSg02ContactImpacts', 'emitImpacts');
  }
  for (const key of ['_syncDynamicSpatialHash', 'collectPickups', 'sweepProjectiles',
    'updateDockRange', '_countCollisionPairWork', '_queueSectorFenceImpulses',
    '_reconcileCombatPhysicsBeforeStep']) {
    if (typeof physics[key] === 'function' && acc[key] == null) { acc[key] = []; wrap(physics, key, key); }
  }
  // JS-side decomposition of ownerStep: wrap the per-substep owner passes so the
  // ~ownerStep-worldStep gap is attributed instead of guessed.
  for (const key of ['_refreshSleepPolicy', '_stepAnchoredRecoil', '_applyAttachmentSprings',
    '_captureExpectedKinematics', '_readPostStepKinematics', '_applyStructuralGive',
    '_enforcePlane', '_clampSpeed', '_syncEntityFromKinematics', '_publishTelemetry',
    '_applyCommand', '_applyBodyResponse', '_stepContactReceipts']) {
    if (typeof owner[key] === 'function' && acc[key] == null) { acc[key] = []; wrap(owner, key, key); }
  }

  for (let i = 0; i < WARMUP; i += 1) {
    if (ablate && i === Math.floor(WARMUP / 2)) applyAblation();
    runtime.step(1 / 60);
  }
  for (const list of Object.values(acc)) list.length = 0;

  let contacts = 0;
  let sleepingDynamic = 0;
  let pairMatrix = {};
  let pairLeaderboard = [];
  let fxProximity = [];
  for (let i = 0; i < TICKS; i += 1) {
    runtime.step(1 / 60);
    if (i === Math.floor(TICKS / 2)) {
      // Mid-run census: unique narrow-phase pairs + sleep share. One-shot, excluded from timing.
      const pairs = new Set();
      const perEntity = new Map();
      owner.world.forEachCollider((collider) => {
        owner.world.contactPairsWith(collider, (other) => {
          const a = collider.handle; const b = other.handle;
          const key = a < b ? `${a}:${b}` : `${b}:${a}`;
          if (pairs.has(key)) return;
          pairs.add(key);
          const recA = owner._colliderOwners.get(a)?.rec;
          const recB = owner._colliderOwners.get(b)?.rec;
          const dynA = recA?.spec?.dynamic === true;
          const dynB = recB?.spec?.dynamic === true;
          const btA = typeof recA?.body?.bodyType === 'function' ? recA.body.bodyType() : -1;
          const btB = typeof recB?.body?.bodyType === 'function' ? recB.body.bodyType() : -1;
          const cls = dynA && dynB ? 'dyn:dyn' : (dynA || dynB ? 'dyn:fixed' : `fixed:fixed(bt${btA},${btB})`);
          const tA = recA?.entity?.type || '?';
          const tB = recB?.entity?.type || '?';
          if (pairMatrix._samples == null) pairMatrix._samples = {};
          const skey = `${cls}|${tA}<->${tB}`;
          if (!pairMatrix._samples[skey]) {
            const pa = typeof collider.parent === 'function' ? collider.parent()?.handle : null;
            const pb = typeof other.parent === 'function' ? other.parent()?.handle : null;
            pairMatrix._samples[skey] = {
              sameParentBody: pa != null && pa === pb,
              parentA: pa, parentB: pb,
              aAct: typeof collider.activeCollisionTypes === 'function' ? collider.activeCollisionTypes() : null,
              bAct: typeof other.activeCollisionTypes === 'function' ? other.activeCollisionTypes() : null,
              aBody: btA, bBody: btB,
              aId: recA?.entity?.id, bId: recB?.entity?.id,
              aData: recA?.entity?.data ? Object.keys(recA.entity.data).slice(0, 8) : null,
            };
          }
          const sameParent = typeof collider.parent === 'function' && typeof other.parent === 'function'
            && collider.parent()?.handle === other.parent()?.handle;
          if (sameParent) pairMatrix._selfPairs = (pairMatrix._selfPairs || 0) + 1;
          const mkey = `${cls}|${tA}<->${tB}`;
          pairMatrix[mkey] = (pairMatrix[mkey] || 0) + 1;
          for (const e of [recA?.entity, recB?.entity]) {
            if (!e) continue;
            perEntity.set(e.id, (perEntity.get(e.id) || 0) + 1);
          }
        });
      });
      contacts = pairs.size;
      pairLeaderboard = [...perEntity.entries()]
        .map(([id, n]) => {
          const e = state.entities.get(id);
          return { id, pairs: n, type: e?.type, dynamic: owner.records.get(id)?.spec?.dynamic === true,
            colliders: owner.records.get(id)?.colliders?.length ?? 0,
            site: e?.data?.worldSiteId || e?.data?.worldRecordId || e?.data?.ceresWorkfleetRole || null };
        })
        .sort((a, b) => b.pairs - a.pairs)
        .slice(0, 15);
      for (const rec of owner.dynamicRecords) {
        if (typeof rec.body.isSleeping === 'function' && rec.body.isSleeping()) sleepingDynamic += 1;
      }
      // Player-proximity census for fx dressing: are the 717 colliders anywhere near the
      // pocket the player flies, or scattered props that only ever pay graph bookkeeping?
      const playerRec = owner.records.get(state.playerId);
      const pp = playerRec?.body?.translation?.();
      fxProximity = [];
      for (const rec of owner.records.values()) {
        if (rec.entity?.type !== 'fx') continue;
        const t = rec.body.translation();
        const d = pp ? Math.hypot(t.x - pp.x, t.z - pp.z) : null;
        fxProximity.push({ id: rec.entity.id, d: d == null ? null : Math.round(d),
          colliders: rec.colliders?.length ?? 0,
          name: rec.entity.data?.name || rec.entity.data?.poiId || rec.entity.data?.worldRecordId || null });
      }
      fxProximity.sort((a, b) => (a.d ?? 1e9) - (b.d ?? 1e9));
    }
  }

  const diag = owner.diagnostics();
  const census = { byType: {}, collidable: 0, collidersByType: {}, solids: 0 };
  for (const rec of owner.records.values()) {
    const type = rec.entity?.type || 'unknown';
    census.byType[type] = (census.byType[type] || 0) + 1;
    const n = Array.isArray(rec.colliders) && rec.colliders.length ? rec.colliders.length : 1;
    census.collidersByType[type] = (census.collidersByType[type] || 0) + n;
    if (rec.spec && rec.spec.dynamic) census.collidable += 1;
    else census.solids += 1;
  }

  const report = {
    bodies: diag.bodies,
    dynamicBodies: diag.dynamicBodies,
    colliders: diag.colliders,
    ccdBodies: diag.ccdBodies,
    narrowPhasePairs: contacts,
    sleepingDynamic,
    pairMatrix,
    pairLeaderboard,
    fxProximity,
    census,
    phases: Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, {
      n: v.length,
      mean: +(v.reduce((s, x) => s + x, 0) / Math.max(1, v.length)).toFixed(3),
      p50: +median(v).toFixed(3),
      p95: +p95(v).toFixed(3),
      totalMs: +v.reduce((s, x) => s + x, 0).toFixed(1),
    }])),
  };
  runtime.dispose();
  return report;
}

// --- Interleaved A/B: one boot, alternate a lever across rounds to cancel process drift ---
// Usage: --interleave=iters|predDist|fxDisabled [--ticks=60 chunk ticks, default 60] [--rounds=6]
async function bootInterleaved(kind, chunkTicks = 60, rounds = 6) {
  const runtime = createAuthoritativeRuntime({
    profileId: 'production',
    nodeSafeOnly: true,
    seed: SEED,
    helpers: { raycastToPlane() { return { x: 0, y: 0, z: 0 }; } },
  });
  const { state } = runtime;
  state.mode = 'flight';
  state.aceMemory ||= {};
  state.aceMemory.ace_rust_lord_orro = { id: 'ace_rust_lord_orro', fled: true };
  const origin = sectorLocalToGlobalForSector(POCKET_LOCAL, SECTOR);
  const player = runtime.spawn(makeShipEntitySpec('ship_hornet', {
    isPlayer: true, player: state.player, pos: { x: origin.x, z: origin.z }, fittings: [],
  }));
  state.playerId = player.id;
  const worldSystem = runtime.getSystem('world');
  worldSystem.enterSector('sector_helios_prime');
  worldSystem.enterSector(SECTOR);
  const physics = runtime.getSystem('physics');
  const ready = await physics.prepareBackend(state, { reset: true });
  if (!ready || !physics._sg02) throw new Error('SG-02 authority did not come up');
  const owner = physics._sg02;

  const acc = { a: { worldStep: [], ownerStep: [], physicsUpdate: [] }, b: { worldStep: [], ownerStep: [], physicsUpdate: [] } };
  let arm = 'a';
  const wrap = (obj, key, bucket) => {
    const orig = obj[key];
    obj[key] = function (...callArgs) {
      const t0 = performance.now();
      try { return orig.apply(this, callArgs); } finally {
        acc[arm][bucket].push(performance.now() - t0);
      }
    };
  };
  wrap(owner.world, 'step', 'worldStep');
  wrap(owner, 'step', 'ownerStep');
  wrap(physics, 'update', 'physicsUpdate');

  const applyArm = (which) => {
    const ip = owner.world.integrationParameters;
    if (kind === 'iters') ip.numSolverIterations = which === 'a' ? 12 : 4;
    else if (kind === 'predDist') ip.normalizedPredictionDistance = which === 'a' ? 3.5 : 0.5;
    else if (kind === 'ccdOff') {
      for (const rec of owner.dynamicRecords) {
        if (rec.ccdEnabled && rec.body && typeof rec.body.enableCcd === 'function') rec.body.enableCcd(which === 'a');
      }
    }
    else if (kind === 'fxDisabled') {
      const enabled = which === 'a';
      for (const rec of owner.records.values()) {
        if (rec.entity?.type !== 'fx') continue;
        for (const c of rec.colliders || []) c.setEnabled(enabled);
      }
    }
    arm = which;
  };

  for (let i = 0; i < WARMUP; i += 1) runtime.step(1 / 60);
  for (const a of Object.values(acc)) for (const l of Object.values(a)) l.length = 0;
  applyArm('a');
  for (let r = 0; r < rounds; r += 1) {
    applyArm(r % 2 === 0 ? 'a' : 'b');
    for (let i = 0; i < chunkTicks; i += 1) runtime.step(1 / 60);
  }
  const stats = (v) => ({ n: v.length, mean: +(v.reduce((s, x) => s + x, 0) / Math.max(1, v.length)).toFixed(3),
    p50: +median(v).toFixed(3), p95: +p95(v).toFixed(3) });
  const report = { kind, chunkTicks, rounds, a: {}, b: {} };
  for (const bucket of ['worldStep', 'ownerStep', 'physicsUpdate']) {
    report.a[bucket] = stats(acc.a[bucket]);
    report.b[bucket] = stats(acc.b[bucket]);
  }
  runtime.dispose();
  console.log(`\n=== interleave:${kind}  (a=production, b=variant) ===`);
  for (const bucket of ['worldStep', 'ownerStep', 'physicsUpdate']) {
    const A = report.a[bucket]; const B = report.b[bucket];
    console.log(`  ${bucket.padEnd(14)} a(mean=${A.mean} p50=${A.p50})  b(mean=${B.mean} p50=${B.p50})  dMean=${(B.mean - A.mean).toFixed(3)}ms  dP50=${(B.p50 - A.p50).toFixed(3)}ms`);
  }
  return report;
}

if (args.interleave) {
  const rounds = Math.max(2, Number.parseInt(args.rounds ?? '6', 10) || 6);
  const chunkTicks = Math.max(20, Number.parseInt(args.ticks ?? '60', 10) || 60);
  const rep = await bootInterleaved(String(args.interleave), chunkTicks, rounds);
  console.log(JSON.stringify(rep, null, 2));
  process.exit(0);
}

const configs = args.config
  ? [{ name: String(args.config), opts: {
    dropEventQueue: args.config === 'noEventQueue',
    solverIterations: args.config === 'solverIter4' ? 4 : null,
    ablate: ['fxSensor', 'fxGroups0', 'fxSilent', 'fxDisabled', 'allStaticDisabled'].includes(args.config) ? args.config : null,
  } }]
  : [
    { name: 'baseline', opts: {} },
    { name: 'fxSensor', opts: { ablate: 'fxSensor' } },
    { name: 'fxGroups0', opts: { ablate: 'fxGroups0' } },
    { name: 'fxSilent', opts: { ablate: 'fxSilent' } },
    { name: 'fxDisabled', opts: { ablate: 'fxDisabled' } },
    { name: 'allStaticDisabled', opts: { ablate: 'allStaticDisabled' } },
    { name: 'solverIter4', opts: { solverIterations: 4 } },
  ];

const out = { seed: SEED, ticks: TICKS, warmup: WARMUP, runs: {} };
for (const cfg of configs) {
  out.runs[cfg.name] = await bootConfig(cfg.opts);
  const r = out.runs[cfg.name];
  console.log(`\n=== ${cfg.name} ===`);
  console.log(`bodies=${r.bodies} dynamic=${r.dynamicBodies} colliders=${r.colliders} narrowPairs=${r.narrowPhasePairs} sleepingDynamic=${r.sleepingDynamic} ccd=${r.ccdBodies ?? '?'}`);
  if (r.pairLeaderboard?.length) {
    console.log('  pair matrix:', JSON.stringify(r.pairMatrix));
    for (const row of r.pairLeaderboard.slice(0, 8)) {
      console.log(`    ${String(row.pairs).padStart(4)} pairs  ${row.type} ${row.dynamic ? 'dyn' : 'fix'} colliders=${row.colliders} ${row.site || row.id}`);
    }
    if (r.fxProximity?.length) {
      const near = r.fxProximity.filter((f) => (f.d ?? 1e9) < 500);
      console.log(`  fx proximity: ${near.length}/${r.fxProximity.length} props within 500wu of pocket; nearest:`,
        r.fxProximity.slice(0, 5).map((f) => `${f.name}@${f.d}wu(${f.colliders}c)`).join(', '));
    }
  }
  for (const [k, v] of Object.entries(r.phases)) {
    console.log(`  ${k.padEnd(14)} mean=${String(v.mean).padStart(7)}ms p50=${String(v.p50).padStart(7)} p95=${String(v.p95).padStart(7)} total=${v.totalMs}ms n=${v.n}`);
  }
}
console.log('\n' + JSON.stringify(out, null, 2));
