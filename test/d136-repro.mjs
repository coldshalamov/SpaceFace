// D136 diagnostic: 12-cycle dock/trade soak + worldRecordId histogram.
// Mirrors test/save-growth-dock-trade-flat.test.mjs bootSoakSim exactly, with:
//   - spawnEntity wrapped to capture a caller stack tag per entity id
//   - per-cycle dump of live entities grouped by data.worldRecordId (dups flagged)
//   - persistent-entity detail dump whenever the count tops the early-5 ceiling
//   - far-row census (total / record-dup histogram)
// Run: node test/d136-repro.mjs   (D136_CYCLES / D136_CYCLE_S env knobs)
import assert from 'node:assert/strict';

process.env.SPACEFACE_PLAYER_STORE_DIR = '';

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
import { tensionDirector } from '../src/systems/tensionDirector.js';
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

const SEED = 4711;
const SECTOR = 'sector_helios_prime';
const STATION = 'st_helios_prime';
const CYCLES = Number(process.env.D136_CYCLES || 12);
const CYCLE_SECONDS = Number(process.env.D136_CYCLE_S || 30);

const spawnTrace = new Map(); // entityId -> caller tag
let cycleTag = 'boot';
let phaseTag = 'boot';

function tagStack() {
  const s = new Error().stack || '';
  // Keep the frames that name the spawning function inside src/ — D141 needs producers
  // beyond the D136 traffic/world/save list (aftermath, tension, salvage, encounter).
  const frames = s.split('\n')
    .map((l) => l.trim())
    .filter((l) => (l.includes('src\\') || l.includes('src/')) && !l.includes('d136-repro'));
  return frames.slice(0, 3).join(' | ');
}

async function bootSoakSim() {
  installLocalStorageShim();
  const tacticalAI = createTacticalAISystem();
  const chronicler = createChronicler({ shouldObserve: (state) => !isRunSealed(state) });
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

  // Instrument the shared spawn seam — tag every spawned entity with its caller.
  const helpers = sim.helpers;
  const origSpawn = helpers.spawnEntity;
  helpers.spawnEntity = (spec) => {
    const ent = origSpawn(spec);
    if (ent && ent.id != null) {
      spawnTrace.set(ent.id, `${cycleTag}/${phaseTag} :: ${tagStack()}`);
    }
    return ent;
  };

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

function persistentCount(state) {
  let n = 0;
  for (const e of state.entityList) {
    if (e && e.alive !== false && e.flags && e.flags.persistent) n += 1;
  }
  return n;
}

function farRowCensus(state) {
  const table = state.world && state.world.farActors;
  const rows = table && Array.isArray(table.rows) ? table.rows : [];
  const byRec = new Map();
  for (const rec of rows) {
    if (!rec) continue;
    const wr = rec.worldRecordId != null ? rec.worldRecordId
      : (rec.data && rec.data.worldRecordId != null ? rec.data.worldRecordId : null);
    if (wr == null) continue;
    byRec.set(wr, (byRec.get(wr) || 0) + 1);
  }
  let dupRows = 0;
  for (const n of byRec.values()) if (n > 1) dupRows += 1;
  return { total: rows.length, dupRecords: dupRows };
}

// D141 provenance (D141_PROV=1): which records/jobs the accumulating far rows anchor, and
// whether each anchor is live (record in world.records.byId, job in npcJobs.byId) — the
// row's own durability law under farActorTable.farRowIsDurable.
function farRowProvenance(state, label) {
  const table = state.world && state.world.farActors;
  const rows = table && Array.isArray(table.rows) ? table.rows : [];
  const records = (state.world && state.world.records && state.world.records.byId) || {};
  const jobs = (state.npcJobs && state.npcJobs.byId) || {};
  const now = Number.isFinite(state.simTime) ? state.simTime : 0;
  console.log(`\n--- far-row provenance @ ${label} (rows=${rows.length}, simT=${now.toFixed(0)}) ---`);
  for (const rec of rows) {
    if (!rec) continue;
    const d = rec.data && typeof rec.data === 'object' ? rec.data : {};
    const wr = rec.worldRecordId != null ? rec.worldRecordId : (d.worldRecordId != null ? d.worldRecordId : null);
    const jobId = rec.jobId != null ? rec.jobId : (d.jobId != null ? d.jobId : null);
    const record = wr != null ? records[wr] : null;
    const jobLive = jobId != null && Object.prototype.hasOwnProperty.call(jobs, jobId);
    const shelfAge = Number.isFinite(rec.virtualizedAt) ? now - rec.virtualizedAt : NaN;
    const recObsAge = record && Number.isFinite(record.lastObservedT) ? now - record.lastObservedT : NaN;
    const recNextEvent = record && Number.isFinite(record.nextEventAtT) ? record.nextEventAtT : null;
    console.log(`  row id=${rec.id} type=${rec.type} role=${rec.trafficRole || d.trafficRole || '-'} `
      + `wr=${wr || '-'} jobId=${jobId || '-'} jobLive=${jobLive} `
      + `rec=${record ? `${record.kind}/${record.retentionClass}` : 'MISSING'} `
      + `recJob=${record && record.jobId || '-'} recAlive=${record ? record.alive !== false : '-'} `
      + `recOutcome=${record && record.outcome || '-'} shelfAge=${shelfAge.toFixed(0)}s `
      + `obsAge=${Number.isFinite(recObsAge) ? recObsAge.toFixed(0) + 's' : '-'} `
      + `nextEvt=${recNextEvent != null ? recNextEvent.toFixed(0) : '-'} `
      + `anchor=${record || jobLive ? 'durable' : (wr || jobId ? 'ORPHAN' : 'plain')} `
      + `spawn=[${spawnTrace.get(rec.id) || 'pre-instrument'}]`);
  }
}

function worldRecordHistogram(state, label) {
  const byRec = new Map();
  for (const e of state.entityList) {
    if (!e || e.alive === false || !e.data) continue;
    const wr = e.data.worldRecordId;
    if (wr == null) continue;
    if (!byRec.has(wr)) byRec.set(wr, []);
    byRec.get(wr).push(e);
  }
  const dups = [];
  for (const [wr, list] of byRec) {
    if (list.length > 1) dups.push([wr, list]);
  }
  let persistentN = 0;
  const persistentRoles = {};
  for (const e of state.entityList) {
    if (!e || e.alive === false || !e.flags || !e.flags.persistent) continue;
    persistentN += 1;
    const r = (e.data && (e.data.trafficRole || e.data.payloadType)) || e.type;
    persistentRoles[r] = (persistentRoles[r] || 0) + 1;
  }
  const far = farRowCensus(state);
  console.log(`\n=== ${label}: persistent=${persistentN} roles=${JSON.stringify(persistentRoles)} `
    + `trackedWR=${byRec.size} dupRecords=${dups.length} farRows=${far.total} farDup=${far.dupRecords} ===`);
  for (const [wr, list] of dups) {
    console.log(`  DUP ${wr} x${list.length}:`);
    for (const e of list) {
      const d = e.data || {};
      console.log(`    id=${e.id} type=${e.type} role=${d.trafficRole || '-'} `
        + `persistent=${!!(e.flags && e.flags.persistent)} durable=${!!d.durable} `
        + `jobId=${d.jobId || '-'} manifest=${d.cargoManifest ? (d.cargoManifest.manifestId || 'yes') : '-'} `
        + `payloadType=${d.payloadType || '-'} alive=${e.alive !== false} `
        + `spawn=[${spawnTrace.get(e.id) || 'pre-instrument'}]`);
    }
  }
  return { byRec, dups };
}

function dumpPersistentEntities(state, label) {
  console.log(`\n--- persistent detail @ ${label} ---`);
  for (const e of state.entityList) {
    if (!e || e.alive === false || !e.flags || !e.flags.persistent) continue;
    const d = e.data || {};
    console.log(`  id=${e.id} type=${e.type} role=${d.trafficRole || '-'} wr=${d.worldRecordId || '-'} `
      + `jobId=${d.jobId || '-'} manifest=${d.cargoManifest ? (d.cargoManifest.manifestId || 'yes') : '-'} `
      + `payloadType=${d.payloadType || '-'} anchor=${d.anchorReason || '-'} `
      + `spawn=[${spawnTrace.get(e.id) || 'pre-instrument'}]`);
  }
}

const sim = await bootSoakSim();
const { state, bus, registry } = sim;
const econ = registry.get('economy');
const saveSys = registry.get('save');
const persistentSeries = [];

worldRecordHistogram(state, 'after boot enter');

for (let c = 1; c <= CYCLES; c++) {
  cycleTag = `cycle${c}`;
  phaseTag = 'dock';
  bus.emit('dock:docked', { stationId: STATION, sectorId: SECTOR });

  const items = state.player.cargo.items;
  items['cmdty_ore_iron'] = (Number(items['cmdty_ore_iron']) || 0) + 60;
  let sells = 0;
  for (let s = 0; s < 6; s++) {
    const res = econ.execute(STATION, 'cmdty_ore_iron', 'sell', 10);
    if (res && res.ok) sells += 1;
  }
  for (let k = 0; k < 8; k++) {
    bus.emit('combat:damage', { attackerId: state.playerId, targetId: -1 - k, applied: 5 });
  }

  phaseTag = 'sim30s';
  const stepsN = Math.round(CYCLE_SECONDS / SIM_DT);
  for (let t = 0; t < stepsN; t++) sim.step(SIM_DT);

  phaseTag = 'undock';
  bus.emit('dock:undocked', {});

  phaseTag = 'pre-save';
  const { dups: dupsBefore } = worldRecordHistogram(state, `cycle ${c} PRE-SAVE`);
  persistentSeries.push(persistentCount(state));
  if (persistentSeries.length > 5
      && persistentSeries[persistentSeries.length - 1] > Math.max(...persistentSeries.slice(0, 5))) {
    dumpPersistentEntities(state, `cycle ${c} over early-5 max`);
  }

  phaseTag = 'save';
  assert.equal(saveSys.save('quick'), true, `cycle ${c}: save must succeed`);
  phaseTag = 'load';
  assert.equal(saveSys.load('quick'), true, `cycle ${c}: load must succeed`);

  phaseTag = 'post-load';
  const { dups: dupsAfter } = worldRecordHistogram(state, `cycle ${c} POST-LOAD sells=${sells}`);
  if (dupsBefore.length === 0 && dupsAfter.length > 0) {
    console.log(`  >>> first dups appeared across the save/load boundary this cycle`);
  }
  if (process.env.D141_PROV === '1') farRowProvenance(state, `cycle ${c}`);
}
console.log('\nDONE');
process.exit(0);
