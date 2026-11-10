#!/usr/bin/env node
/**
 * Job-local save-size sampler for save-size-quiet.
 *
 * Reuses the headless release-soak system stack (scripts/lib/releaseSoakSession.mjs)
 * without modifying save code. Advances fixed-step sim for N sim-minutes and
 * records real save()/serializeData payload sizes at 0 / 30 / 60 / 120 sim-minutes.
 *
 * Wall clock is accelerated (not a literal 2h wall session).
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import os from 'node:os';

import { createSimulation, SIM_DT } from '../../../../src/core/sim.js';
import { spawnBudget } from '../../../../src/systems/spawnBudget.js';
import { cargo } from '../../../../src/systems/cargo.js';
import { economy } from '../../../../src/systems/economy.js';
import { factions } from '../../../../src/systems/factions.js';
import { heat } from '../../../../src/systems/heat.js';
import { sectorSim } from '../../../../src/systems/sectorSim.js';
import { world } from '../../../../src/systems/world.js';
import { encounterDirector } from '../../../../src/systems/encounterDirector.js';
import { stationSideEventDirector } from '../../../../src/systems/stationSideEventDirector.js';
import { gateControlDirector } from '../../../../src/systems/gateControlDirector.js';
import { mining } from '../../../../src/systems/mining.js';
import { combat } from '../../../../src/systems/combat.js';
import { missions } from '../../../../src/systems/missions.js';
import { makeShipEntitySpec } from '../../../../src/systems/ships.js';
import { save as saveSystem } from '../../../../src/save/saveSystem.js';
import { zonesForSector } from '../../../../src/data/sectorZones.js';
import { SECTOR_ID } from '../../../../scripts/lib/releaseSoakSession.mjs';

try { os.setPriority(os.constants.priority.PRIORITY_LOW); } catch { /* best effort */ }

const OUT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SEED = Number(process.env.SAVE_SIZE_SEED || 47);
const TARGET_SIM_MIN = Number(process.env.SAVE_SIZE_SIM_MIN || 120);
const SAMPLE_MINUTES = [0, 30, 60, 120].filter((m) => m <= TARGET_SIM_MIN);
const SLOT = 'save_size_quiet';
const LS_PREFIX = 'sf.save.';

function makeMemoryLocalStorage() {
  const map = new Map();
  return {
    get length() { return map.size; },
    key(i) { return Array.from(map.keys())[i] || null; },
    getItem(key) { key = String(key); return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(String(key), String(value)); },
    removeItem(key) { map.delete(String(key)); },
    clear() { map.clear(); },
  };
}

function installLocalStorage() {
  const previous = globalThis.localStorage;
  const storage = makeMemoryLocalStorage();
  globalThis.localStorage = storage;
  return () => {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  };
}

function soakSystems() {
  return [
    spawnBudget, cargo, economy, factions, heat, mining, combat,
    sectorSim, world, encounterDirector, stationSideEventDirector,
    gateControlDirector, missions, saveSystem,
  ];
}

function guidePlayer(state, zones, stepIndex) {
  const player = state.entities.get(state.playerId);
  if (!player || !zones || !zones.length) return;
  const zone = zones[Math.floor(stepIndex / 20) % zones.length];
  if (!zone || !zone.center) return;
  player.pos.x = zone.center.x;
  player.pos.z = zone.center.z;
  if (player.prevPos && typeof player.prevPos.copy === 'function') player.prevPos.copy(player.pos);
  player.vel.x = 0;
  player.vel.z = 0;
}

function nearestStationId(state) {
  const stations = (state.entityList || []).filter(
    (e) => e && e.alive !== false && e.type === 'station' && !(e.data && e.data.isGate),
  );
  if (!stations.length) return 'station_soak_virtual';
  return stations[0].data?.stationId || stations[0].id;
}

function measureSave(sim, label, simMinute, wallStartMs) {
  const saveSys = sim.registry.get('save');
  const out = {
    label,
    simMinute,
    simTimeS: Number(sim.state?.simTime) || 0,
    playtimeS: Number(sim.state?.meta?.playtimeS) || 0,
    tick: (sim.state?.tick | 0),
    wallAt: new Date().toISOString(),
    wallElapsedMs: Math.round(performance.now() - wallStartMs),
    serializeUtf8Bytes: null,
    serializeJsLength: null,
    storedUtf8Bytes: null,
    storedJsLength: null,
    saveOk: false,
    entityCount: Array.isArray(sim.state?.entityList) ? sim.state.entityList.length : null,
    credits: Number(sim.state?.player?.credits) || 0,
    error: null,
  };
  try {
    if (saveSys && typeof saveSys.serializeData === 'function') {
      const json = JSON.stringify(saveSys.serializeData());
      out.serializeUtf8Bytes = Buffer.byteLength(json, 'utf8');
      out.serializeJsLength = json.length;
    }
    if (saveSys && typeof saveSys.save === 'function') {
      out.saveOk = !!saveSys.save(SLOT, { reason: 'save_size_quiet' });
      const raw = globalThis.localStorage.getItem(LS_PREFIX + SLOT);
      if (raw != null) {
        out.storedJsLength = raw.length;
        out.storedUtf8Bytes = Buffer.byteLength(raw, 'utf8');
      }
    }
  } catch (err) {
    out.error = err && err.message ? err.message : String(err);
  }
  return out;
}

function pulseActivity(sim, zones, stepIndex) {
  const { state, bus } = sim;
  guidePlayer(state, zones, stepIndex);
  const ticksPerSimMin = Math.round(60 / SIM_DT);
  if (stepIndex > 0 && stepIndex % ticksPerSimMin === 0) {
    bus.emit('economy:tradeCompleted', {
      stationId: nearestStationId(state),
      side: 'sell',
      commodityId: 'cmdty_ore_iron',
      qty: 1,
      unitPrice: 12,
      total: 12,
    });
    if (state.player && Number.isFinite(state.player.credits)) state.player.credits += 12;
  }
  if (stepIndex > 0 && stepIndex % (10 * ticksPerSimMin) === 0) {
    const stationId = nearestStationId(state);
    state.ui = state.ui || {};
    state.ui.docked = true;
    state.mode = 'docked';
    bus.emit('dock:docked', { stationId });
    state.ui.docked = false;
    state.mode = 'flight';
    bus.emit('dock:undocked', { stationId, source: 'save_size_quiet' });
  }
}

function main() {
  const restore = installLocalStorage();
  const wallStart = performance.now();
  const startedAt = new Date().toISOString();
  const samples = [];
  const targetTicks = Math.round(TARGET_SIM_MIN * 60 / SIM_DT);
  const sampleAtTick = new Map(
    SAMPLE_MINUTES.map((m) => [Math.round(m * 60 / SIM_DT), m]),
  );

  try {
    const sim = createSimulation({ seed: SEED, systems: soakSystems() });
    const { state, bus, registry } = sim;

    state.mode = 'flight';
    for (const system of registry.systems) {
      if (system && typeof system.newGame === 'function') system.newGame();
    }
    state.player.ownedShips = [{ defId: 'ship_kestrel', fittings: [] }];
    state.player.activeShipIndex = 0;
    const player = sim.spawn(makeShipEntitySpec('ship_kestrel', {
      team: 0,
      factionId: 'faction_free',
      fittings: [],
      isPlayer: true,
      player: state.player,
      pos: { x: 0, z: 0 },
    }));
    state.playerId = player.id;
    state.player.team = 0;
    state.player.credits = 12_000;
    state.player.cargo.items = { cmdty_refined_metals: 16, cmdty_ore_iron: 10 };
    state.player.cargo.usedVolume = 10;
    state.player.cargo.usedMass = 10;

    const worldSys = registry.get('world');
    if (worldSys && typeof worldSys.enterSector === 'function') {
      worldSys.enterSector(SECTOR_ID);
    } else {
      bus.emit('sector:enter', { sectorId: SECTOR_ID });
      state.world.currentSectorId = SECTOR_ID;
    }
    const zones = (zonesForSector(SECTOR_ID) || []).filter((z) => z && z.center);

    samples.push(measureSave(sim, 'start', 0, wallStart));
    sampleAtTick.delete(0);
    console.error(`[save-size-quiet] sampled 0 min storedJsLength=${samples[0].storedJsLength} serializeUtf8=${samples[0].serializeUtf8Bytes}`);

    for (let i = 0; i < targetTicks; i++) {
      sim.step(SIM_DT);
      pulseActivity(sim, zones, i);
      const tickNow = i + 1;
      if (sampleAtTick.has(tickNow)) {
        const minute = sampleAtTick.get(tickNow);
        const sample = measureSave(sim, `${minute}min`, minute, wallStart);
        samples.push(sample);
        sampleAtTick.delete(tickNow);
        console.error(`[save-size-quiet] sampled ${minute} min @ tick ${tickNow} storedJsLength=${sample.storedJsLength} serializeUtf8=${sample.serializeUtf8Bytes}`);
      }
      if (tickNow % Math.round(15 * 60 / SIM_DT) === 0) {
        console.error(`[save-size-quiet] progress ${(tickNow * SIM_DT / 60).toFixed(0)} / ${TARGET_SIM_MIN} sim-min`);
      }
    }

    for (const [tick, minute] of sampleAtTick) {
      const sample = measureSave(sim, `${minute}min-late`, minute, wallStart);
      samples.push(sample);
      console.error(`[save-size-quiet] late sample ${minute} (wanted tick ${tick}) storedJsLength=${sample.storedJsLength}`);
    }

    const report = {
      schema: 'spaceface.vm-drop.save-size-quiet.v1',
      job: 'save-size-quiet',
      seed: SEED,
      sectorId: SECTOR_ID,
      targetSimMinutes: TARGET_SIM_MIN,
      sampleMinutes: SAMPLE_MINUTES,
      startedAt,
      finishedAt: new Date().toISOString(),
      wallDurationMs: Math.round(performance.now() - wallStart),
      ticksAdvanced: targetTicks,
      simDt: SIM_DT,
      slot: SLOT,
      lsPrefix: LS_PREFIX,
      primaryMetric: 'storedJsLength — localStorage string length after save(); same definition as browser release-soak saveBytes',
      samples,
      host: {
        platform: process.platform,
        arch: process.arch,
        node: process.version,
        cpus: os.cpus()?.length || null,
        model: os.cpus()?.[0]?.model || null,
        totalMem: os.totalmem(),
        freeMem: os.freemem(),
        loadavg: os.loadavg(),
      },
    };

    const outPath = path.join(OUT_DIR, 'samples.json');
    writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({
      ok: true,
      outPath,
      wallDurationMs: report.wallDurationMs,
      samples: samples.map((s) => ({
        label: s.label,
        simMinute: s.simMinute,
        playtimeS: s.playtimeS,
        storedJsLength: s.storedJsLength,
        storedUtf8Bytes: s.storedUtf8Bytes,
        serializeUtf8Bytes: s.serializeUtf8Bytes,
        saveOk: s.saveOk,
        error: s.error,
      })),
    }, null, 2));
  } finally {
    restore();
  }
}

main();
