// PQ-149.02 — guaranteed ordinary life during a quiet-phase window.
// Seed 14920. Existing Ceres traffic / station-side events. No second director.
// Headless 300s sim. Does not spawn on the player or fill quiet with combat.

import assert from 'node:assert/strict';
import test from 'node:test';

import { SIM_DT } from '../src/core/sim.js';
import {
  applyFeatureConfigToMaps,
  restoreFeatureMaps,
  snapshotFeatureMaps,
} from '../src/data/featureFlags.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { stuntGrammar } from '../src/systems/stuntGrammar.js';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { getNodeSystemFactoryTable } from '../src/runtime/nodeSystemFactoryTable.js';
import { createTelemetry } from '../src/systems/telemetry.js';
import { publishSessionRhythmPhase } from '../src/ai/director.js';
import { sessionRhythmOf } from '../src/systems/encounterDirector.js';
import {
  PROOF_PLAYER_HULL_ID,
  PROOF_REFINERY_POCKET_ID,
  PROOF_SECTOR_ID,
  PROOF_SHOVE_WEAPON_ID,
  pocketEntryGlobal,
} from '../src/testing/lab/proofSixtySeconds.js';

const SEED = 14920;
const WINDOW_S = 300;
const ROUTINE = Object.freeze(['inspection', 'transfer', 'repair', 'waiting', 'tug']);

function withFeatures(runtime, fn) {
  const previous = snapshotFeatureMaps();
  applyFeatureConfigToMaps(runtime && runtime.config && runtime.config.features);
  try {
    return fn();
  } finally {
    restoreFeatureMaps(previous);
  }
}

function text(value, limit = 80) {
  return typeof value === 'string' ? value.slice(0, limit) : null;
}

function classifyActor(entity, towingJobIds) {
  const d = entity.data || {};
  const role = text(d.trafficRole || d.role);
  const jobKind = text(d.jobKind);
  const phase = text(d.jobPhase || d.trafficPhase || (entity.ai && entity.ai.state));
  const slotId = text(d.activityActorSlotId);
  const jobId = text(d.jobId);
  const cargoQty = Number(d.cargoManifest && d.cargoManifest.totalQty) || 0;
  const vx = Number(entity.vel && entity.vel.x) || 0;
  const vz = Number(entity.vel && entity.vel.z) || 0;
  const speed = Math.hypot(vx, vz);
  const names = new Set();
  if (role === 'patrol' || role === 'customs' || jobKind === 'patrol' || jobKind === 'surveyor'
    || /patrol|inspect|customs|survey/.test(String(slotId || ''))) {
    names.add('inspection');
  }
  if ((phase === 'load' || phase === 'unload') && cargoQty > 0) names.add('transfer');
  if (role === 'tender' || jobKind === 'tender' || role === 'rescue'
    || /tender|repair|rescue/.test(String(slotId || jobKind || role || ''))) {
    names.add('repair');
  }
  if (phase === 'commission' || phase === 'dock' || phase === 'idle' || phase === 'hold'
    || (speed < 1.5 && !!jobId)) {
    names.add('waiting');
  }
  if ((role === 'tug' || d.yardTug === true) && jobId && towingJobIds.has(jobId)) names.add('tug');
  return names;
}

function classifySideEvent(kind) {
  if (kind === 'repair_drone') return ['repair'];
  if (kind === 'hauler_dock') return ['transfer', 'waiting'];
  if (kind === 'cargo_tractor') return ['tug', 'transfer'];
  if (kind === 'patrol_launch') return ['inspection'];
  return [];
}

function classifyReceipt(receipt) {
  const action = String(receipt.action || receipt.actionId || '');
  const kind = String(receipt.jobKind || '');
  const names = new Set();
  if (kind === 'patrol' || kind === 'surveyor' || /scan|inspect|hold/.test(action)) names.add('inspection');
  if (kind === 'hauler' || action === 'unload' || action === 'load' || /transfer|unload|load/.test(action)) {
    names.add('transfer');
  }
  if (kind === 'tender' || /repair|tender/.test(action)) names.add('repair');
  if (action === 'hold' || /wait|dock|idle/.test(action)) names.add('waiting');
  if (kind === 'tug' || /tug|tow/.test(action)) names.add('tug');
  return names;
}

function forceQuiet(state) {
  const dir = state.encounterDirector || (state.encounterDirector = {});
  const now = Number(state.simTime) || 0;
  dir.sessionRhythm = { phase: 'quiet', enteredAt: now, dwellS: 0 };
}

function sampleNames(state) {
  const towingJobIds = new Set();
  const names = new Set();
  for (const entity of state.entityList || []) {
    if (!entity || entity.alive === false) continue;
    const d = entity.data || {};
    if (d.npcTowedByJobId) towingJobIds.add(String(d.npcTowedByJobId));
  }
  for (const entity of state.entityList || []) {
    if (!entity || entity.alive === false || entity.isPlayer) continue;
    const d = entity.data || {};
    if (!(d.activityActorSlotId || d.ceresActivityJobOwned === true || d.jobId || d.trafficRole || d.yardTug)) {
      continue;
    }
    for (const name of classifyActor(entity, towingJobIds)) names.add(name);
  }
  return names;
}

async function bootQuietCeres(seed) {
  const table = getNodeSystemFactoryTable({ tacticalAI: true, flightBackend: 'v3' });
  if (!table.get('stuntGrammar')) table.set('stuntGrammar', stuntGrammar);
  const runtime = createAuthoritativeRuntime({
    profileId: 'production',
    nodeSafeOnly: true,
    seed,
    systemLookup: table,
    slots: {
      aiSlot: table.get('aiSlot'),
      flightSlot: table.get('flightSlot'),
      aiBackend: 'sg06-tactical',
      flightBackend: 'v3',
    },
  });
  const state = runtime.state;
  state.mode = 'flight';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.settings.gameplay.flightBackend = 'v3';
  state.settings.gameplay.aiBackend = 'sg06-tactical';
  if (!state.input.actions) state.input.actions = { brake: false, autopursuit: false };

  const player = runtime.spawn(makeShipEntitySpec(PROOF_PLAYER_HULL_ID, {
    isPlayer: true,
    player: state.player,
    pos: { x: 0, z: 0 },
    fittings: [PROOF_SHOVE_WEAPON_ID],
    factionId: 'faction_free',
  }));
  state.playerId = player.id;

  const world = runtime.getSystem('world');
  if (!world || typeof world.enterSector !== 'function' || typeof world.relocatePlayerInSector !== 'function') {
    throw new Error('PQ-149.02: world enter/relocate missing — not the real path');
  }
  world.enterSector(PROOF_SECTOR_ID);
  const at = pocketEntryGlobal(PROOF_REFINERY_POCKET_ID);
  world.relocatePlayerInSector({ x: at.x, z: at.z, heading: 0 }, { reason: 'pq-149-02:ordinary-life' });
  player.vel.x = 0;
  player.vel.z = 0;

  const physics = runtime.getSystem('physics');
  if (!physics || typeof physics.prepareBackend !== 'function') {
    throw new Error('PQ-149.02: physics.prepareBackend missing — not the real path');
  }
  const ready = await withFeatures(runtime, () => physics.prepareBackend(state, { reset: true }));
  if (ready !== true) throw new Error('PQ-149.02: SG-02 failed to come up');
  const diag = physics._diag || {};
  if (diag.sg02Ready !== true || String(diag.backend) !== 'rapier-dynamic') {
    throw new Error(`PQ-149.02: not rapier-dynamic (${diag.backend})`);
  }
  return { runtime, state, player, backend: String(diag.backend) };
}

test('PQ-149.02 seed 14920: quiet window already shows ≥ 4 routine behaviours', { timeout: 600_000 }, async () => {
  const host = await bootQuietCeres(SEED);
  const { runtime, state } = host;
  const telemetry = createTelemetry(runtime.bus, state);
  const seenQuiet = new Set();
  const quietSeconds = { inspection: 0, transfer: 0, repair: 0, waiting: 0, tug: 0 };
  const firstSeen = {};
  const combatFire = [];
  const quietReceipts = [];
  runtime.bus.on('combat:fire', () => {
    if ((sessionRhythmOf(state) || {}).phase === 'quiet') combatFire.push(state.simTime);
  });
  runtime.bus.on('station:sideEvent', (p) => {
    if ((sessionRhythmOf(state) || {}).phase !== 'quiet') return;
    for (const name of classifySideEvent(p && p.kind)) {
      seenQuiet.add(name);
      if (firstSeen[name] == null) firstSeen[name] = state.simTime;
    }
  });
  runtime.bus.on('traffic:jobActionReceipt', (p) => {
    if ((sessionRhythmOf(state) || {}).phase !== 'quiet') return;
    quietReceipts.push({
      t: state.simTime,
      action: p && p.action,
      jobKind: p && p.jobKind,
      slot: p && p.actorSlotId,
    });
    for (const name of classifyReceipt(p || {})) {
      seenQuiet.add(name);
      if (firstSeen[name] == null) firstSeen[name] = state.simTime;
    }
  });

  forceQuiet(state);
  let quietSamples = 0;
  let lastSampleT = -1;
  const ticks = Math.round(WINDOW_S * 60);
  try {
    for (let i = 0; i < ticks; i++) {
      runtime.step(SIM_DT);
      const t = Number(state.simTime) || 0;
      if (Math.floor(t) === lastSampleT) continue;
      lastSampleT = Math.floor(t);
      const rhythm = sessionRhythmOf(state);
      if (!rhythm || rhythm.phase !== 'quiet') continue;
      quietSamples += 1;
      for (const name of sampleNames(state)) {
        seenQuiet.add(name);
        quietSeconds[name] = (quietSeconds[name] || 0) + 1;
        if (firstSeen[name] == null) firstSeen[name] = t;
      }
    }

    const names = ROUTINE.filter((name) => seenQuiet.has(name));
    assert.ok(quietSamples >= 80, `quiet window must last: samples=${quietSamples}`);
    assert.ok(names.length >= 4, `quiet must show ≥ 4 routine behaviours, got ${names.length}: ${names.join(', ')}`);
    assert.equal(combatFire.length, 0, 'quiet must not be filled with combat fire');
    assert.ok(quietReceipts.length >= 1, 'activity receipts must confirm ordinary work during quiet');

    const ring = telemetry.getRecentEvents();
    const activity = {
      seed: SEED,
      windowS: WINDOW_S,
      backend: host.backend,
      quietSamples,
      count: names.length,
      names,
      quietSeconds,
      firstSeen,
      quietReceipts: quietReceipts.length,
      combatFire: combatFire.length,
      telemetryTypes: [...new Set(ring.map((event) => event.type))].sort(),
    };
    console.log('PQ-149.02 ordinary-life activity', JSON.stringify(activity));
  } finally {
    publishSessionRhythmPhase(null);
    telemetry.dispose();
    runtime.dispose();
  }
});
