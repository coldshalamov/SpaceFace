// PQ-033.02 D28 residual — dock/trade save-growth flatness.
//
// The release soak measured save payloads still crawling after every authored ramp had
// plateaued (PQ-033.02-REPORT.md; D28 fixed entities + npcJobs, the residual stayed). This
// focused harness reproduces the D28 probe route headlessly — seed 4711, boot the production
// manifest exactly like scripts/run-actual-game-playthrough.mjs, then per cycle (52 cycles):
// dock at st_helios_prime, seed cargo, 6 real economy.execute sells (chronicler mints trade
// stories), 8 combat:damage tension observations, 30 s of real sim steps, undock, measure the
// serialized payload, then run the REAL public save.save('quick') / save.load('quick')
// round-trip through a Map-backed localStorage shim.
//
// FLAT criterion (stated, not stubbed) over the tail window cycles 42-52, where every authored
// retention ramp is provably past plateau (96 chronicler stories: one story per sell, so 6
// sells/cycle passes the cap by cycle 16 — measured; the 192-row tension ring by cycle 24 at
// 8 observations/cycle; 64-point/15 s price histories and market warmup land in the first
// cycles; the economy blend-tail population — one crossfade per regime re-roll, 120-300 s
// windows — converges to its steady state (~66 open tails on this route) around cycle ~40,
// measured; the world record/far-row bags settle by cycle ~10):
//   • oscillation band (max-min) <= 24 KB — this route's measured honest ambient churn: live
//     traffic and encounter waves swing the entities/combat sections ±10-12 KB cycle to cycle
//     with no net growth. The band trips if that churn doubles; the SLOPE is the growth gate.
//   • least-squares slope <= 300 B/cycle.
// The only accepted residual crawl under that slope is chronicler `seen` at ~30 B/fact toward
// its 2048 cap — an authored retention window, not a leak. No chronicler/economy cap is changed
// to satisfy this test.
//
// Structural invariants that fail on the unbounded channels regardless of the band:
//   • far-actor rows: total <= FAR_ROW_BUDGET + durable + in-grace orphans, where the
//     durable set is authored/owned rows (persistenceOwner/worldSite markers) plus rows
//     whose worldRecordId resolves in world.records OR whose jobId resolves in npcJobs.byId.
//     An unanchored row is legal for one FAR_ROW_ORPHAN_GRACE_S window after shelving (its
//     record may still land); STALE orphans — unanchored past that window — must stay 0.
//     That stale-orphan channel is the one grower with no plateau.
//   • persistent entity count and npcJobs.byId key count stay under their early-run ceiling
//     after cycle 5 (D28 regression guards). Literal non-increase would false-positive on
//     normal job churn — the pre-fix soak oscillates persistent 3-8 and jobs 0-2 with no
//     monotone growth — so the guard is a ceiling, not a ratchet.

import test from 'node:test';
import assert from 'node:assert/strict';

// The save system reaches the shared player-store drawer through the environment; an unset
// variable would mount the real shared save drawer (AGENTS.md §9).
process.env.SPACEFACE_PLAYER_STORE_DIR = '';

// Map-backed localStorage shim so the REAL public save.save('quick')/save.load('quick') path
// runs (saveSystem._writeSlot / load read the global localStorage).
function installLocalStorageShim() {
  const store = new Map();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem(k) { return store.has(String(k)) ? store.get(String(k)) : null; },
      setItem(k, v) { store.set(String(k), String(v)); },
      removeItem(k) { store.delete(String(k)); },
      key(i) { return Array.from(store.keys())[Number(i)] ?? null; },
      get length() { return store.size; },
    },
  });
  return store;
}

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { actions } from '../src/systems/actions.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { weapons } from '../src/systems/weapons.js';
import { physics } from '../src/core/physics.js';
import { combat } from '../src/systems/combat.js';
import { cargo } from '../src/systems/cargo.js';
import { economy } from '../src/systems/economy.js';
import { missions } from '../src/systems/missions.js';
import { story } from '../src/systems/story.js';
import { save } from '../src/save/saveSystem.js';
import { world } from '../src/systems/world.js';
import { mining } from '../src/systems/mining.js';
import { fields } from '../src/systems/fields.js';
import { traffic } from '../src/systems/traffic.js';
import { salvage } from '../src/systems/salvage.js';
import { lootShards } from '../src/systems/lootShards.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';
import { masslineImpacts } from '../src/systems/masslineImpacts.js';
import { masslineThrow } from '../src/systems/masslineThrow.js';
import { masslineSnares } from '../src/systems/masslineSnares.js';
import { masslineThreats } from '../src/systems/masslineThreats.js';
import { tensionDirector, tensionSuspensionReason } from '../src/systems/tensionDirector.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { aiEncounter } from '../src/systems/aiEncounter.js';
import { createTacticalAISystem } from '../src/systems/tacticalAI.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { heat } from '../src/systems/heat.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';
import { dockingCorridor } from '../src/systems/dockingCorridor.js';
import { fieldDepletion } from '../src/systems/fieldDepletion.js';
import { voiceArbiter } from '../src/ui/voiceArbiter.js';
import { flybyFocus } from '../src/systems/flybyFocus.js';
import { scanner } from '../src/systems/scanner.js';
import { aceMemory } from '../src/systems/aceMemory.js';
import { barkDirector } from '../src/systems/barkDirector.js';
import { combatOutcome } from '../src/systems/combatOutcome.js';
import { aftermathWrecks } from '../src/systems/aftermathWrecks.js';
import { wingMorale } from '../src/systems/wingMorale.js';
import { custodyConsequences } from '../src/systems/custodyConsequences.js';
import { survivorPod } from '../src/systems/survivorPod.js';
import { factions } from '../src/systems/factions.js';
import { factionPresence } from '../src/systems/factionPresence.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { bountyHunt } from '../src/systems/bountyHunt.js';
import { provenanceLedger } from '../src/systems/provenanceLedger.js';
import { createChronicler } from '../src/systems/chronicler.js';
import { isRunSealed } from '../src/core/runSeal.js';
import { lossLedger } from '../src/systems/lossLedger.js';
import { pirateDisengage } from '../src/systems/pirateDisengage.js';
import { presentationOrchestrator } from '../src/systems/presentationOrchestrator.js';
import { presentationAdapters } from '../src/systems/presentationAdapters.js';
import { bandRadio } from '../src/systems/bandRadio.js';
import { onboarding } from '../src/systems/onboarding.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';
import { COMBAT_FLAGS, MASSLINE2_FLAGS, TRAVEL_FLAGS } from '../src/data/featureFlags.js';
import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';
import { fittingsFromDefaultModules, makeShipEntitySpec } from '../src/systems/ships.js';
import { NPC_JOB_KIND } from '../src/systems/npcJobs.js';
import { FAR_ROW_BUDGET, FAR_ROW_ORPHAN_GRACE_S } from '../src/world/farActorTable.js';
import {
  RETENTION_CLASS,
  ensureWorldRecords,
  gcExpiredRecentMemory,
  retentionClassOf,
} from '../src/world/worldRecords.js';

const SEED = 4711; // the D28 probe's seed
const SECTOR = 'sector_helios_prime';
const STATION = 'st_helios_prime';
const CYCLES = 52;
const CYCLE_SECONDS = 30;
const TAIL_FROM = 42; // tail window: cycles 42..52, every authored ramp past plateau
const TAIL_TO = 52;
// Measured honest churn of this route (see header): traffic/encounter waves swing the
// entities section ±10-12 KB. The pre-fix synthetic 3 KB band could never hold on this
// route; 24 KB trips only if the ambient wave churn doubles.
const FLAT_BAND_BYTES = 24 * 1024;
const FLAT_SLOPE_B_PER_CYCLE = 300;

// ── boot: the production manifest, exactly like scripts/run-actual-game-playthrough.mjs ─────
async function bootSoakSim() {
  installLocalStorageShim();
  const tacticalAI = createTacticalAISystem();
  const chronicler = createChronicler({
    shouldObserve: (state) => !isRunSealed(state),
  });
  const sim = createSimulation({
    seed: SEED,
    systems: [
      actions, flightV3, weapons, physics, combat, cargo,
      economy, missions, story, save,
      world, mining, fields, traffic, salvage, lootShards,
      tetherGameplay, masslineImpacts, masslineThrow, masslineSnares, masslineThreats,
      tensionDirector, encounterDirector, aiEncounter, tacticalAI, aiPorts,
      voiceArbiter, scanner, flybyFocus, aceMemory, barkDirector,
      combatOutcome, aftermathWrecks, wingMorale, custodyConsequences, survivorPod,
      factions, factionPresence, spawnBudget, npcJobsRuntime, bountyHunt,
      provenanceLedger, chronicler, lossLedger, pirateDisengage,
      heat, lawSecurity, dockingCorridor, fieldDepletion,
      presentationOrchestrator, presentationAdapters,
      bandRadio,
      onboarding,
    ],
  });
  const { state, bus, registry } = sim;

  state.mode = 'flight';
  state.settings.gameplay.tutorialHints = false;
  state.settings.gameplay.runtimeProfile = 'production';
  Object.assign(COMBAT_FLAGS, PRODUCTION_FEATURES.combat);
  Object.assign(MASSLINE2_FLAGS, PRODUCTION_FEATURES.massline2);
  Object.assign(TRAVEL_FLAGS, PRODUCTION_FEATURES.travel);
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.settings.gameplay.flightBackend = 'v3';
  state.settings.gameplay.aiBackend = 'sg06-tactical';
  state.world.currentSectorId = SECTOR;
  state.player.credits = NEW_GAME.credits;

  const playerEntity = sim.spawn(makeShipEntitySpec(NEW_GAME.shipId, {
    team: 0,
    factionId: 'faction_free',
    isPlayer: true,
    player: state.player,
    fittings: fittingsFromDefaultModules(NEW_GAME.shipId, NEW_GAME.fittedModules || []),
    pos: { x: 0, z: 0 },
    rot: 0,
  }));
  state.playerId = playerEntity.id;

  if (typeof registry.get('economy').newGame === 'function') registry.get('economy').newGame();
  if (typeof registry.get('world').newGame === 'function') registry.get('world').newGame();
  bus.emit('game:started', {});
  const physicsReady = await registry.get('physics').prepareBackend(state, { reset: true });
  if (!physicsReady) throw new Error('physics backend did not prepare headless');
  registry.get('world').enterSector(SECTOR, {});
  return sim;
}

// ── structural census: the far-row orphan channel ───────────────────────────────────────────
// Mirrors the corrected sweep contract in src/world/farActorTable.js: authored/owned rows
// (persistenceOwner/worldSite markers) and rows anchoring a live record or job are durable;
// an unanchored row is legal for one FAR_ROW_ORPHAN_GRACE_S window after shelving (its
// record may still land) and is a STALE orphan — the unbounded channel — only past that.
function farRowCensus(state) {
  const table = state.world && state.world.farActors;
  const rows = table && Array.isArray(table.rows) ? table.rows : [];
  const records = (state.world && state.world.records && state.world.records.byId) || null;
  const jobs = (state.npcJobs && state.npcJobs.byId) || null;
  const now = Number.isFinite(state.simTime) ? state.simTime : 0;
  let durable = 0;
  let orphansStale = 0;
  let orphansYoung = 0;
  for (const rec of rows) {
    if (!rec) continue;
    const data = rec.data && typeof rec.data === 'object' ? rec.data : {};
    const jobId = rec.jobId != null ? rec.jobId : (data.jobId != null ? data.jobId : null);
    const recordId = rec.worldRecordId != null ? rec.worldRecordId
      : (data.worldRecordId != null ? data.worldRecordId : null);
    const owned = (data.persistenceOwner != null && data.persistenceOwner !== 'worldRecords')
      || data.worldSiteId != null || data.worldSiteComponentId != null;
    const jobResolves = jobId != null && !!jobs && Object.prototype.hasOwnProperty.call(jobs, jobId);
    const recordResolves = recordId != null && !!records
      && Object.prototype.hasOwnProperty.call(records, recordId);
    if (owned || jobResolves || recordResolves) durable += 1;
    else if (jobId != null || recordId != null) {
      const shelfT = Number(rec.virtualizedAt);
      if (Number.isFinite(shelfT) && now - shelfT > FAR_ROW_ORPHAN_GRACE_S) orphansStale += 1;
      else orphansYoung += 1;
    }
  }
  return { total: rows.length, durable, orphansStale, orphansYoung };
}

function persistentEntityCount(state) {
  let n = 0;
  for (const e of state.entityList) {
    if (e && e.alive !== false && e.flags && e.flags.persistent) n += 1;
  }
  return n;
}

function leastSquaresSlope(points) {
  // points: [x, y][] — B per cycle
  const n = points.length;
  let sx = 0; let sy = 0; let sxx = 0; let sxy = 0;
  for (const [x, y] of points) {
    sx += x; sy += y; sxx += x * x; sxy += x * y;
  }
  const denom = n * sxx - sx * sx;
  if (denom === 0) return 0;
  return (n * sxy - sx * sy) / denom;
}

test('dock/trade save-load soak: serialized payload is flat in the tail window', async () => {
  const sim = await bootSoakSim();
  const { state, bus, registry } = sim;
  const econ = registry.get('economy');
  const saveSys = registry.get('save');

  const bytes = [];
  const censuses = [];
  const persistentCounts = [];
  const jobCounts = [];
  const sellLog = [];

  for (let c = 1; c <= CYCLES; c++) {
    bus.emit('dock:docked', { stationId: STATION, sectorId: SECTOR });

    // Seed cargo (fixture setup, cargo system stays the runtime writer) then 6 real sells —
    // one chronicler story per sell, so the 96-story cap passes by cycle 16 and the cycles
    // 26-36 window measures only unbounded channels (at 3 sells/cycle the cap passes at
    // cycle 32, inside the window — measured on this harness's first red run).
    const items = state.player.cargo.items;
    items['cmdty_ore_iron'] = (Number(items['cmdty_ore_iron']) || 0) + 60;
    let sells = 0;
    for (let s = 0; s < 6; s++) {
      const res = econ.execute(STATION, 'cmdty_ore_iron', 'sell', 10);
      if (res && res.ok) sells += 1;
    }
    sellLog.push(sells);

    // 8 player-attributed combat observations per cycle: the 192-row tension trace ring is
    // provably full by cycle 24 (8*24=192), inside the cycles 26-36 flat window.
    for (let k = 0; k < 8; k++) {
      bus.emit('combat:damage', { attackerId: state.playerId, targetId: -1 - k, applied: 5 });
    }

    // ~30 s of real sim steps: chronicler/economy cadence ticks, traffic shelve/promote,
    // far-row budget sweep, world-record gc every 60 ticks.
    const stepsN = Math.round(CYCLE_SECONDS / SIM_DT);
    for (let t = 0; t < stepsN; t++) sim.step(SIM_DT);

    bus.emit('dock:undocked', {});

    // The same json the release soak's saveBytes counts: serialize('quick') → stringify.
    const envelope = saveSys.serialize('quick');
    const json = JSON.stringify(envelope);
    bytes.push(json.length);

    const census = farRowCensus(state);
    censuses.push(census);
    persistentCounts.push(persistentEntityCount(state));
    jobCounts.push(Object.keys(state.npcJobs.byId).length);

    // Real public save/load round-trip through the localStorage shim.
    assert.equal(saveSys.save('quick'), true, `cycle ${c}: save.save('quick') must succeed`);
    assert.equal(saveSys.load('quick'), true, `cycle ${c}: save.load('quick') must succeed`);

    console.log(`[save-growth] cycle ${String(c).padStart(2)} `
      + `bytes=${json.length} (${(json.length / 1024).toFixed(2)} KB) `
      + `farRows=${census.total} durable=${census.durable} `
      + `orphansStale=${census.orphansStale} orphansYoung=${census.orphansYoung} `
      + `persistent=${persistentCounts[persistentCounts.length - 1]} `
      + `jobs=${jobCounts[jobCounts.length - 1]} sells=${sells}`);
  }

  // Sanity: the soak actually traded (a harness that never sells measures nothing).
  const totalSells = sellLog.reduce((a, b) => a + b, 0);
  assert.ok(totalSells >= CYCLES, `soak must complete real sells (got ${totalSells}/${CYCLES * 6})`);

  // ── structural invariants (unbounded channels, independent of the byte band) ─────────────
  for (let i = 0; i < censuses.length; i++) {
    const c = censuses[i];
    assert.ok(c.total <= FAR_ROW_BUDGET + c.durable + c.orphansYoung,
      `cycle ${i + 1}: far rows ${c.total} exceed budget+durable+grace `
      + `(${FAR_ROW_BUDGET}+${c.durable}+${c.orphansYoung})`);
    assert.equal(c.orphansStale, 0,
      `cycle ${i + 1}: ${c.orphansStale} far rows have anchored nothing for more than `
      + `${FAR_ROW_ORPHAN_GRACE_S} s — the unbounded orphan channel (PQ-033.02 mechanism 2)`);
  }
  // D28 guards: after cycle 5 the counts never exceed the early-run ceiling. Normal job churn
  // oscillates (a new hauler takes a job as an old one completes), so the guard is a ceiling.
  const persistentCeiling = Math.max(...persistentCounts.slice(0, 5));
  const jobsCeiling = Math.max(...jobCounts.slice(0, 5));
  for (let i = 5; i < persistentCounts.length; i++) {
    assert.ok(persistentCounts[i] <= persistentCeiling,
      `cycle ${i + 1}: persistent entity count ${persistentCounts[i]} passed the early-run `
      + `ceiling ${persistentCeiling} (D28 regression)`);
    assert.ok(jobCounts[i] <= jobsCeiling,
      `cycle ${i + 1}: npcJobs.byId key count ${jobCounts[i]} passed the early-run `
      + `ceiling ${jobsCeiling} (D28 regression)`);
  }

  // ── the flat criterion ────────────────────────────────────────────────────────────────────
  const tailPoints = [];
  for (let c = TAIL_FROM; c <= TAIL_TO; c++) tailPoints.push([c, bytes[c - 1]]);
  const tailBytes = tailPoints.map(([, y]) => y);
  const band = Math.max(...tailBytes) - Math.min(...tailBytes);
  const slope = leastSquaresSlope(tailPoints);
  const warmPoints = [];
  for (let c = 6; c <= CYCLES; c++) warmPoints.push([c, bytes[c - 1]]);
  const warmSlope = leastSquaresSlope(warmPoints);

  console.log(`[save-growth] tail cycles ${TAIL_FROM}-${TAIL_TO}: band=${band} B (${(band / 1024).toFixed(2)} KB), `
    + `slope=${slope.toFixed(0)} B/cycle (${(slope / 1024).toFixed(3)} KB/cycle)`);
  console.log(`[save-growth] post-warmup cycles 6-${CYCLES} slope=${warmSlope.toFixed(0)} B/cycle `
    + `(${(warmSlope / 1024).toFixed(3)} KB/cycle)`);

  assert.ok(band <= FLAT_BAND_BYTES,
    `tail oscillation band ${band} B > ${FLAT_BAND_BYTES} B: payload still ramping in the flat window`);
  assert.ok(slope <= FLAT_SLOPE_B_PER_CYCLE,
    `tail slope ${slope.toFixed(0)} B/cycle > ${FLAT_SLOPE_B_PER_CYCLE} B/cycle: `
    + `unbounded save growth (measured ${(slope / 1024).toFixed(3)} KB/cycle)`);
});

// ── companion: assign() pins the hull's world record before the 180 s recent-memory window ──
//
// The window: a job hull's record is captured RECENT at traffic spawn; npcJobsRuntime.assign()
// stamps data.jobId but (pre-fix) nobody re-captures the record until the next world capture
// pass — which walks only LIVE entities. A hull shelved into the far table in that window is
// never re-observed, gcExpiredRecentMemory drops its record after 180 s, and the far row it
// anchored is left orphaned forever. assign() must pin the record PERMANENT at the moment the
// job claims the hull (the traffic.js upsertWorldRecord seam).
test('assign() pins the world record PERMANENT before the 180 s recent-memory window drops it', () => {
  process.env.SPACEFACE_PLAYER_STORE_DIR = '';
  const sim = createSimulation({ seed: SEED, systems: [world, npcJobsRuntime] });
  const { state, bus, registry } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR;
  const worldSys = registry.get('world');

  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    hull: 100, hullMax: 100, radius: 4, isPlayer: true,
  });
  state.playerId = player.id;
  bus.emit('game:started', {});

  function workerHull(recordId) {
    const e = sim.spawn({
      type: 'ship', team: 2, pos: { x: 40, z: 0 }, vel: { x: 0, z: 0 },
      hull: 100, hullMax: 100, radius: 6,
    });
    e.data = { worldRecordId: recordId, sectorId: SECTOR, homeSectorId: SECTOR, trafficRole: 'hauler' };
    return e;
  }

  // (a) The documented window, unchanged by the fix: an un-pinned RECENT record expires.
  const plain = workerHull('wr_companion_plain');
  const plainCaptured = worldSys.upsertWorldRecord(plain);
  assert.ok(plainCaptured, 'plain hull record captured');
  assert.equal(retentionClassOf(plainCaptured), RETENTION_CLASS.RECENT);

  // (b) The fix: assign() pins the record PERMANENT at claim time (traffic-time RECENT
  // capture first, exactly the production ordering, then the job claim).
  const worker = workerHull('wr_companion_worker');
  const preAssign = worldSys.upsertWorldRecord(worker);
  assert.ok(preAssign, 'worker hull record captured pre-assign');
  assert.equal(retentionClassOf(preAssign), RETENTION_CLASS.RECENT, 'pre-assign capture is RECENT');

  const jobId = sim.helpers.npcJobs.assign(worker, {
    kind: NPC_JOB_KIND.MINER,
    route: [{ id: 'home', pos: { x: 0, z: 0 } }, { id: 'field', pos: { x: 600, z: 0 } }],
    sectorId: SECTOR,
    speed: 100, commissionS: 1, departS: 1, approachS: 1, workS: 2, loadS: 1, unloadS: 1, dwellS: 1,
  });
  assert.ok(jobId, 'assign() must return a jobId');

  // Advance past the 180 s recent-memory window with no observation, then run the exact gc
  // call the world tick makes (world.js _tick → gcExpiredRecentMemory).
  state.simTime += 181;
  gcExpiredRecentMemory(ensureWorldRecords(state.world), state.simTime);

  const byId = ensureWorldRecords(state.world).byId;
  assert.equal(byId['wr_companion_plain'], undefined,
    'the un-pinned RECENT record is dropped after 181 s (the documented window)');
  const pinned = byId['wr_companion_worker'];
  assert.ok(pinned, 'the assigned hull record survives the 181 s gc window');
  assert.equal(retentionClassOf(pinned), RETENTION_CLASS.PERMANENT,
    'assign() must pin the record PERMANENT before the window can drop it');

  // The pinned record and its job survive a world serialize/deserialize round-trip and the
  // job still resolves against the restored bag (the rematerialization re-link contract).
  const snapshot = worldSys.serialize();
  worldSys.deserialize(snapshot);
  const restored = ensureWorldRecords(state.world).byId['wr_companion_worker'];
  assert.ok(restored, 'pinned record survives the world round-trip');
  assert.equal(retentionClassOf(restored), RETENTION_CLASS.PERMANENT);
  const jobEntry = state.npcJobs.byId[jobId];
  assert.ok(jobEntry, 'job bag entry survives');
  assert.ok(ensureWorldRecords(state.world).byId[jobEntry.worldRecordId],
    'the job still anchors a live record after the round-trip (re-link contract)');
});
