#!/usr/bin/env node
// BP-01/C11 Battle-Aftermath Persistence contract.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { createSimulation } from '../src/core/sim.js';
import { scanner } from '../src/systems/scanner.js';
import { aftermathWrecks, aftermathForSector } from '../src/systems/aftermathWrecks.js';
import { save as saveSystem } from '../src/save/saveSystem.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';

assert.equal(typeof window, 'undefined', 'this check must run headless');
assert.ok(existsSync(new URL('../src/systems/aftermathWrecks.js', import.meta.url)),
  'src/systems/aftermathWrecks.js exists');

let sections = 0;
function ok(label) {
  sections++;
  console.log(`  PASS ${label}`);
}

function guarded(fn) {
  const random = Math.random;
  const now = Date.now;
  Math.random = () => { throw new Error('Math.random in battle aftermath path'); };
  Date.now = () => { throw new Error('Date.now in battle aftermath path'); };
  try { return fn(); } finally { Math.random = random; Date.now = now; }
}

guarded(testZoneKillsRecordBoundedProvenanceAndNews);
guarded(testSectorReentrySpawnsSalvageableWrecks);
guarded(testScannerResolvesAftermathManifest);
guarded(testSalvageCompletionRemovesMarker);
guarded(testSaveSystemPersistsAftermathMarkers);
testPackageRegistryAndSchemaWiring();

console.log(`[check-battle-aftermath] PASS - ${sections} sections green`);

function boot(seed = 717) {
  const sim = createSimulation({ seed, systems: [aftermathWrecks, scanner] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_pallas_drift';
  state.world.sectors.sector_pallas_drift = { id: 'sector_pallas_drift', name: 'Pallas Drift' };
  state.input.actions = state.input.actions || {};
  const player = sim.spawn({
    type: 'ship',
    team: 0,
    pos: { x: 1420, z: 760 },
    hull: 220,
    hullMax: 220,
    radius: 10,
    data: { defId: 'ship_kestrel' },
  });
  state.playerId = player.id;
  const log = { recorded: [], spawned: [], completed: [], news: [], scans: [] };
  bus.on('aftermathWreck:recorded', (payload) => log.recorded.push(payload));
  bus.on('aftermathWreck:spawned', (payload) => log.spawned.push(payload));
  bus.on('aftermathWreck:completed', (payload) => log.completed.push(payload));
  bus.on('news:headline', (payload) => log.news.push(payload));
  bus.on('scan:completed', (payload) => log.scans.push(payload));
  return { sim, state, bus, player, log };
}

function emitKill(t, i, overrides = {}) {
  const pos = overrides.pos || sectorLocalToGlobalForSector(
    { x: 1420 + i * 8, z: 760 + i * 6 },
    'sector_pallas_drift',
  );
  const victim = t.sim.spawn({
    type: overrides.type || 'ship',
    team: 1,
    factionId: overrides.factionId || 'faction_reach',
    pos,
    hull: 1,
    hullMax: 40,
    radius: 8,
    data: {
      name: overrides.name || `Raider ${i}`,
      shipClass: overrides.victimClass || 'raider_fighter',
      ai: { hostileTeams: [0] },
    },
  });
  t.state.tick = i + 1;
  t.state.simTime = i + 10;
  t.bus.emit('entity:killed', {
    id: victim.id,
    killerId: overrides.killerId == null ? t.state.playerId : overrides.killerId,
    type: victim.type,
    pos,
    factionId: victim.factionId,
    victimClass: overrides.victimClass || victim.data.shipClass,
  });
  return victim;
}

function spawnedWrecks(t) {
  return Array.from(t.state.entities.values()).filter((entity) =>
    entity && entity.alive && entity.type === 'wreck' && entity.data && entity.data.aftermath);
}

function testZoneKillsRecordBoundedProvenanceAndNews() {
  const t = boot();
  for (let i = 0; i < 3; i++) emitKill(t, i);
  assert.equal(aftermathForSector(t.state, 'sector_pallas_drift').length, 3,
    'three zone kills record three aftermath markers');
  assert.equal(t.log.recorded.length, 3, 'each marker emits a recorded receipt');
  assert.equal(t.log.news.length, 3, 'each marker emits a station-news headline event');
  assert.match(t.log.news[0].headline, /Sker-Run Ambush|wreckage/i,
    'headline names the authored zone or aftermath');

  t.bus.emit('entity:killed', {
    id: 99999,
    killerId: t.state.playerId,
    type: 'ship',
    pos: sectorLocalToGlobalForSector({ x: -2400, z: -2400 }, 'sector_pallas_drift'),
    victimClass: 'out_of_zone',
  });
  assert.equal(aftermathForSector(t.state, 'sector_pallas_drift').length, 3,
    'kills outside named zones do not record markers');

  t.bus.emit('entity:killed', {
    id: t.state.playerId,
    killerId: 44,
    type: 'ship',
    pos: sectorLocalToGlobalForSector({ x: 1420, z: 760 }, 'sector_pallas_drift'),
    victimClass: 'player_ship',
  });
  assert.equal(aftermathForSector(t.state, 'sector_pallas_drift').length, 3,
    'player death does not create a salvage marker');

  for (let i = 3; i < 12; i++) emitKill(t, i);
  const capped = aftermathForSector(t.state, 'sector_pallas_drift');
  assert.equal(capped.length, 8, 'per-sector aftermath ring buffer caps at eight markers');
  assert.equal(capped[0].victimLabel, 'Raider 11', 'ring buffer is newest-first');
  assert.ok(capped.every((marker) => marker.zoneId === 'zone_pallas_ambush'),
    'each marker carries the matching authored zone id');
  assert.ok(capped.every((marker) => marker.killerId === t.state.playerId),
    'each marker preserves killer provenance');
  ok('zone kills record bounded provenance and station-news headlines');
}

function testSectorReentrySpawnsSalvageableWrecks() {
  const t = boot(718);
  for (let i = 0; i < 3; i++) emitKill(t, i);
  t.bus.emit('sector:exit', { sectorId: 'sector_pallas_drift' });
  t.bus.emit('sector:enter', { sectorId: 'sector_pallas_drift' });
  const wrecks = spawnedWrecks(t);
  assert.equal(wrecks.length, 3, 'sector re-entry materializes one wreck per marker');
  for (const wreck of wrecks) {
    assert.equal(wreck.data.parentType, 'ship', 'after-effects spawn as ship wrecks for salvage verbs');
    assert.ok(wreck.data.salvagePool && wreck.data.salvagePool.cmdty_scrap_metal > 0,
      'wreck carries a drainable salvage pool');
    assert.equal(wreck.data.salvageTimeLeft, 8, 'wreck carries salvage timing for mining._drainWreck');
    assert.ok(wreck.data.provenance && wreck.data.provenance.markerId,
      'wreck carries structured provenance');
    assert.match(wreck.data.provenanceLine, /destroyed in/i,
      'wreck carries a readable who-died-here line');
  }
  t.bus.emit('sector:enter', { sectorId: 'sector_pallas_drift' });
  assert.equal(spawnedWrecks(t).length, 3, 'same-sector re-entry is idempotent while wrecks are live');
  ok('sector re-entry spawns salvageable aftermath wrecks without duplicates');
}

function testScannerResolvesAftermathManifest() {
  const t = boot(719);
  emitKill(t, 0);
  t.bus.emit('sector:enter', { sectorId: 'sector_pallas_drift' });
  const wreck = spawnedWrecks(t)[0];
  assert.ok(wreck, 'aftermath wreck spawned for scan test');
  wreck.pos.x = t.player.pos.x + 60;
  wreck.pos.z = t.player.pos.z;
  t.state.input.actions.scanPulse = true;
  t.sim.runTicks(2);
  assert.equal(wreck.data.scanned, true, 'scanner resolves the aftermath wreck');
  assert.ok(Array.isArray(wreck.data.manifest) && wreck.data.manifest.length > 0,
    'scanner exposes the salvage manifest');
  assert.ok(wreck.data.provenanceLine.includes('killer'), 'scan target keeps the provenance line');
  ok('scanner resolves aftermath wreck manifest and provenance payload');
}

function testSalvageCompletionRemovesMarker() {
  const t = boot(720);
  emitKill(t, 0);
  t.bus.emit('sector:enter', { sectorId: 'sector_pallas_drift' });
  const wreck = spawnedWrecks(t)[0];
  // The live producer (mining._drainWreck) names the durable marker; since 384e547c the consumer
  // refuses a bare entity id because ids are recycled across New Game/travel.
  t.bus.emit('salvage:completed', { wreckId: wreck.id, markerId: wreck.data.provenance.markerId, loot: {} });
  assert.equal(aftermathForSector(t.state, 'sector_pallas_drift').length, 0,
    'completed salvage removes the durable marker');
  assert.equal(t.log.completed.length, 1, 'completion emits a receipt');
  ok('salvage completion consumes the aftermath marker');
}

function testSaveSystemPersistsAftermathMarkers() {
  const t = boot(721);
  emitKill(t, 0);
  emitKill(t, 1, { victimClass: 'patrol_lawman' });

  const saveRuntime = Object.create(saveSystem);
  saveRuntime.init({
    state: t.state,
    bus: t.bus,
    helpers: {},
    registry: {
      get(name) {
        if (name === 'aftermathWrecks') return t.sim.registry.get('aftermathWrecks');
        return null;
      },
    },
  });
  const data = saveRuntime.serializeData();
  assert.ok(data.aftermathWrecks && data.aftermathWrecks.bySector.sector_pallas_drift,
    'save data includes aftermathWrecks');
  assert.equal(data.aftermathWrecks.bySector.sector_pallas_drift.length, 2,
    'save data carries both markers');

  const restored = boot(722);
  restored.sim.registry.get('aftermathWrecks').deserialize(data.aftermathWrecks);
  assert.equal(aftermathForSector(restored.state, 'sector_pallas_drift').length, 2,
    'system deserialize restores markers');
  ok('save system serializes and restores aftermath markers');
}

function testPackageRegistryAndSchemaWiring() {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.scripts['check:battle-aftermath'], 'node scripts/check-battle-aftermath.mjs',
    'package exposes check:battle-aftermath');

  const registry = readFileSync(new URL('../src/core/registry.js', import.meta.url), 'utf8');
  assert.match(registry, /import \{ aftermathWrecks \} from '\.\.\/systems\/aftermathWrecks\.js';/,
    'registry imports aftermathWrecks');
  // The registry is a tabular ['name', system] list now (one entry per line), not a comma run.
  const at = (name) => registry.indexOf("['" + name + "',");
  assert.ok(at('combatOutcome') > 0 && at('aftermathWrecks') > at('combatOutcome'),
    'aftermathWrecks registers after combat outcomes');
  assert.ok(at('mining') > at('aftermathWrecks') && at('missions') > at('aftermathWrecks'),
    'aftermathWrecks registers before the salvage readers (mining, missions)');

  const saveSrc = readFileSync(new URL('../src/save/saveSystem.js', import.meta.url), 'utf8');
  assert.match(saveSrc, /data\.aftermathWrecks\s*=\s*this\._callSerialize\('aftermathWrecks'\)/,
    'save data includes aftermathWrecks');
  assert.match(saveSrc, /this\._callDeserialize\('aftermathWrecks', data\.aftermathWrecks\)/,
    'load restore hydrates aftermathWrecks');

  const migrationSrc = readFileSync(new URL('../src/save/migrations.js', import.meta.url), 'utf8');
  assert.match(migrationSrc, /from:\s*7,\s*to:\s*8/,
    'save migrations include v7 -> v8 aftermath seed');

  const systemSrc = readFileSync(new URL('../src/systems/aftermathWrecks.js', import.meta.url), 'utf8');
  assert.doesNotMatch(systemSrc, /Math\.random|Date\.now|performance\.now|setTimeout|setInterval/,
    'aftermath path uses no RNG, wall-clock time, or timers');
  assert.doesNotMatch(systemSrc, /grantCredits|chargeCredits|addCargo|removeCargo|applyRep/,
    'aftermath system does not directly write economy, cargo, or reputation');
  ok('package, registry, save schema, determinism, and single-writer guards are pinned');
}
