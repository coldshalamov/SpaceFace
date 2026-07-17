#!/usr/bin/env node
// D10 Choir-Tender natural-route headless harness (C1 + shared driver).
//
// Production carrier path under multi-seed isolation:
//   game:started → D10 rumor → scan from player.pos → salvage → claim → salvaged
//
// Uses scripts/lib/naturalRoute.mjs for Tier-A boot, event observe, multi-seed,
// and evidence helpers. This check remains *supporting* under F1 §1/§3: it still
// uses controlled harness advances (position approach + bus-driven salvage/claim)
// for state-machine regression. Primary uninjected acceptance is residual work.
//
// Runner: npm run check:depth-program:r2:natural-d10

import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { movingRadiationGate, rewardDescriptors } from '../src/core/uniqueWreckComplications.js';
import {
  UNIQUE_WRECK_SCAN_RADIUS,
  uniqueWreckById,
} from '../src/data/uniqueWrecks.js';
import { uniqueWrecks } from '../src/systems/uniqueWrecks.js';
import { cargo } from '../src/systems/cargo.js';
import { ships } from '../src/systems/ships.js';
import {
  createTierASession,
  runMultiSeed,
  D10_CARRIER,
  D10_CI_SEEDS,
  D10_ROUTE_ID,
  NATURAL_ROUTE_SCHEMA,
} from './lib/naturalRoute.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = resolve(ROOT, '.devshots/depth-program/r2-natural-d10-headless.json');
const TARGET = D10_CARRIER.wreckId;
const TARGET_SLOT = uniqueWreckById(TARGET);
const BASE_SEED = D10_CI_SEEDS[0];
const SEED_COUNT = 5;
const HELIOS_SECTOR = D10_CARRIER.sectorId;

const OBSERVE_EVENTS = Object.freeze([
  'uniqueWreck:rumorRecorded',
  'uniqueWreck:bearingFixed',
  'uniqueWreck:decisionReady',
  'uniqueWreck:salvaged',
  'uniqueWreck:storyRewardGranted',
]);

assert.ok(TARGET_SLOT, `${TARGET} definition must exist`);

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function distance(a, b) {
  return Math.hypot(finite(a.x) - finite(b.x), finite(a.z) - finite(b.z));
}

function setPlayerPos(player, x, z) {
  if (!player || !player.pos) return;
  if (typeof player.pos.set === 'function') player.pos.set(x, 0, z);
  else {
    player.pos.x = x;
    player.pos.z = z;
  }
  if (player.prevPos) {
    if (typeof player.prevPos.set === 'function') player.prevPos.set(x, 0, z);
    else {
      player.prevPos.x = x;
      player.prevPos.z = z;
    }
  }
  if (player.vel) {
    if (typeof player.vel.set === 'function') player.vel.set(0, 0, 0);
    else {
      player.vel.x = 0;
      player.vel.z = 0;
    }
  }
}

function liveWreck(state, wreckId) {
  return state.entityList.find((entity) => entity?.alive !== false
    && entity?.data?.uniqueWreckId === wreckId) || null;
}

function openScanSimTime(state, def, record) {
  for (let simTime = 0; simTime <= 900; simTime += 1) {
    state.simTime = simTime;
    const gate = movingRadiationGate(state, record, def);
    if (gate?.allowed) return simTime;
  }
  return null;
}

function toPayload(pos) {
  return { x: finite(pos && pos.x, 0), z: finite(pos && pos.z, 0) };
}

function runSeed(seed) {
  const session = createTierASession({
    seed,
    systems: [uniqueWrecks, cargo, ships],
    observeEvents: OBSERVE_EVENTS,
    eventFilter: (_name, payload) => (
      payload?.wreckId === TARGET_SLOT.id || payload?.wreckId === TARGET
    ),
  });
  const { state, bus, sim } = session;
  const moduleRewards = rewardDescriptors(TARGET_SLOT)
    .filter((reward) => reward.kind === 'module' || reward.kind === 'weapon')
    .map((reward) => reward.id);

  try {
    // Supporting harness setup (F1: supporting-only; not primary natural acceptance).
    state.mode = 'flight';
    state.world.currentSectorId = HELIOS_SECTOR;
    state.player.cargo.capVolume = 1000;
    state.player.cargo.capMass = 1e9;

    const player = sim.spawn({
      type: 'ship',
      team: 0,
      pos: { x: 0, z: 0 },
      vel: { x: 0, z: 0 },
      radius: 10,
      hull: 100,
      hullMax: 100,
      data: {
        defId: 'ship_kestrel',
      },
    });
    state.playerId = player.id;

    const before = state.player.uniqueWrecks?.bearings?.[TARGET];
    assert.equal(before, undefined, 'D10 must start without a preexisting bearing');

    // Native production carrier: game:started news (observe-only after emit from host boot).
    // Emitting game:started is the sanctioned run-start signal, not a uniqueWreck rumor inject.
    bus.emit('game:started');
    const record = state.player.uniqueWrecks?.bearings?.[TARGET];
    assert.ok(record, 'game:started must create the D10 record');

    const phaseTrail = [];
    assert.equal(record.phase, 'rumored', 'natural game:start rumor must land in rumored phase');
    phaseTrail.push(record.phase);
    assert.equal(record.sectorId, HELIOS_SECTOR, 'D10 record must stay in Helios');
    assert.equal(record.coordSpace, 'global_v1', 'D10 bearing must be global_v1');
    assert.equal(record.sourceRef, TARGET_SLOT.bearingSourceRef, 'primary source must be the D10 authored source');
    assert.equal(record.channelId, 'news', 'D10 primary source must be news');

    const exactPos = toPayload(record.exactPos);
    setPlayerPos(player, exactPos.x, exactPos.z);
    const playerToBearing = distance(toPayload(player.pos), exactPos);
    assert.ok(playerToBearing <= UNIQUE_WRECK_SCAN_RADIUS,
      `player must be within UNIQUE_WRECK_SCAN_RADIUS for D10 (${playerToBearing} <= ${UNIQUE_WRECK_SCAN_RADIUS})`);

    const openAtS = openScanSimTime(state, TARGET_SLOT, record);
    assert.notEqual(openAtS, null, 'D10 scan must have an open window within deterministic bounds');
    state.simTime = openAtS;
    // Supporting: direct scan:pulse at player.pos. Primary F1 path would use session.scanHere()
    // after flight + radiation window via real ticks only.
    bus.emit('scan:pulse', { pos: toPayload(player.pos) });

    phaseTrail.push(record.phase);
    assert.equal(record.phase, 'fixed', 'scan from player position should harden D10');
    assert.deepEqual(record.fixedPos, exactPos, 'fixedPos must match exact placement in global coords');

    const wreck = liveWreck(state, TARGET_SLOT.id);
    assert.ok(wreck, 'D10 must materialize after scan');
    const wreckPos = toPayload(wreck.pos);
    assert.ok(distance(wreckPos, exactPos) <= 1e-9,
      'live D10 wreck must spawn at exact global coordinates');

    bus.emit('salvage:completed', { wreckId: wreck.id, loot: {} });
    phaseTrail.push(record.phase);
    assert.equal(record.phase, 'decision', 'salvage must advance to decision');

    const claimChoice = TARGET_SLOT.decision.choices.find((choice) => choice.uniqueDrop);
    assert.ok(claimChoice, 'D10 must have a unique claim branch');
    bus.emit('uniqueWreck:choose', {
      wreckId: TARGET_SLOT.id,
      choiceId: claimChoice.id,
    });
    phaseTrail.push(record.phase);
    assert.equal(record.phase, 'salvaged', 'claim choice must resolve D10 to salvaged');
    assert.equal(record.choiceId, claimChoice.id, 'D10 choice id must be the one selected');
    assert.equal(record.rewardReceipt?.outcome, 'claimed', 'salvage must be a claimed outcome');
    assert.equal(record.rewardReceipt?.uniqueDropId, TARGET_SLOT.uniqueDropId, 'reward receipt must include the module choice');

    for (const moduleId of moduleRewards) {
      assert.equal(state.player.moduleInventory.some((item) => item?.defId === moduleId), true,
        `D10 should grant ${moduleId}`);
    }

    assert.deepEqual(phaseTrail, ['rumored', 'fixed', 'decision', 'salvaged'],
      'D10 must pass full rumor/fix/decision/salvage phases');

    return {
      seed,
      result: 'passed',
      pass: true,
      supporting: true,
      sectorId: record.sectorId,
      phaseTrail,
      coordSpace: record.coordSpace,
      sourceRef: record.sourceRef,
      channelId: record.channelId,
      scan: {
        openAtS,
        playerDistanceToExact: playerToBearing,
      },
      exactPos,
      fixedPos: toPayload(record.fixedPos),
      wreckEntityPos: wreckPos,
      choiceId: claimChoice.id,
      rewardReceipt: record.rewardReceipt,
      events: session.events.map((entry) => ({
        name: entry.event || entry.name,
        phase: entry.payload?.phase,
      })),
      ticks: session.ticks,
      simTime: session.simTime,
    };
  } finally {
    session.dispose();
  }
}

const seeds = Array.from({ length: SEED_COUNT }, (_, offset) => BASE_SEED + offset);
const multi = await runMultiSeed({
  seeds,
  label: 'check:depth-program:r2:natural-d10',
  runSeed,
});

assert.equal(multi.rows.length, SEED_COUNT, 'harness must execute at least 5 seeds');
assert.equal(multi.pass, true, 'all seeds must pass');
assert.equal(multi.rows.every((row) => row.result === 'passed'), true, 'all seeds must pass');

const report = {
  schema: NATURAL_ROUTE_SCHEMA,
  schemaVersion: 1,
  harness: 'check:depth-program:r2:natural-d10',
  routeId: D10_ROUTE_ID,
  contentClass: 'wreck',
  tier: 'A',
  supporting: true,
  carrier: { ...D10_CARRIER },
  target: TARGET,
  sector: HELIOS_SECTOR,
  seedBase: BASE_SEED,
  seedCount: SEED_COUNT,
  seeds,
  ciSeeds: [...D10_CI_SEEDS],
  result: multi.result,
  pass: multi.pass,
  rows: multi.rows,
  driver: 'scripts/lib/naturalRoute.mjs',
};

mkdirSync(resolve(ROOT, '.devshots/depth-program'), { recursive: true });
writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`R2 natural D10 harness OK: ${multi.rows.length} seeds passed (driver multi-seed)`);
console.log(`Evidence: ${OUTPUT}`);
