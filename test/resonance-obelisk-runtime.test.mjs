import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import {
  RESONANCE_OBELISK,
  resonanceObeliskResponse,
} from '../src/data/resonanceObelisk.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { scanner } from '../src/systems/scanner.js';

function boot(seed = 6202, { triangulated = false } = {}) {
  const sim = createSimulation({ seed, systems: [scanner, encounterDirector] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.input.actions = state.input.actions || {};
  state.world.currentSectorId = RESONANCE_OBELISK.sectorId;
  const center = sectorLocalToGlobalForSector({ x: 0, z: 0 }, RESONANCE_OBELISK.sectorId);
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: center.x - 700, z: center.z },
    radius: 10, hull: 100, hullMax: 100, data: {},
  });
  state.playerId = player.id;
  const obelisk = sim.spawn({
    type: 'fx', team: 2, pos: { ...center }, radius: 24, mass: 0, collides: false,
    data: {
      poi: true,
      poiId: RESONANCE_OBELISK.poiId,
      poiType: 'anomaly',
      hidden: true,
      requiresTriangulation: true,
      triangulation: { requiredPings: 3, minBaselineWu: 350, minBearingDeltaDeg: 8 },
      anomalyTriangulated: triangulated,
      resonanceScanResponse: true,
      flavorTargetRef: 'landmark_c2_resonance_obelisk',
    },
  });
  state.world.activeSector = {
    id: RESONANCE_OBELISK.sectorId,
    pois: [{
      id: obelisk.id,
      poiId: RESONANCE_OBELISK.poiId,
      type: 'anomaly',
      pos: { ...center },
      hidden: true,
      requiresTriangulation: true,
      triangulation: { ...obelisk.data.triangulation },
      anomalyTriangulated: triangulated,
    }],
  };
  const events = { scans: [], queued: [] };
  bus.on('signal:scanResults', (payload) => events.scans.push(payload));
  bus.on('resonance:patrolQueued', (payload) => events.queued.push(payload));
  return { sim, state, bus, player, obelisk, center, events };
}

function pulse(harness) {
  harness.state.input.actions.scanPulse = true;
  harness.sim.runTicks(2);
}

function coolScanner(harness) {
  harness.sim.runTicks(Math.ceil(8.1 / SIM_DT));
}

function localPlayer(harness, x, z) {
  const pos = sectorLocalToGlobalForSector({ x, z }, RESONANCE_OBELISK.sectorId);
  harness.player.pos.x = pos.x;
  harness.player.pos.z = pos.z;
}

test('C2 response is monotonic and bounded instead of becoming a spawn multiplier', () => {
  const fresh = resonanceObeliskResponse(3);
  const readAgain = resonanceObeliskResponse(5);
  const saturated = resonanceObeliskResponse(99);
  assert.deepEqual(fresh, { scanCount: 3, responseTier: 3, pulseIntervalS: 6.3, patrolIntervalS: 96 });
  assert.equal(readAgain.pulseIntervalS, 4.5);
  assert.equal(readAgain.patrolIntervalS, 60);
  assert.equal(saturated.pulseIntervalS, 2.7);
  assert.equal(saturated.patrolIntervalS, 45);
});

test('triangulation activates the named obelisk and repeated scans pull one real Vael watch closer', () => {
  const h = boot();
  pulse(h);
  coolScanner(h);
  localPlayer(h, 0, 700);
  pulse(h);
  coolScanner(h);
  localPlayer(h, 0, -700);
  pulse(h);

  const first = h.events.scans.at(-1).primary;
  assert.equal(first.id, RESONANCE_OBELISK.signalId);
  assert.equal(first.classification, 'RESONANCE OBELISK');
  assert.equal(first.scanCount, 3);
  assert.match(first.detail, /Pulse interval 6\.3 s/);
  assert.match(first.detail, /Vael watch cadence target 96 s/);
  assert.equal(h.obelisk.data.resonancePulseIntervalS, 6.3);
  assert.equal(h.events.queued.length, 1);
  assert.equal(h.state.encounterDirector.pending.length, 1);
  const initialDueAt = h.state.encounterDirector.pending[0].dueAt;

  coolScanner(h);
  pulse(h);
  const repeated = h.events.scans.at(-1).primary;
  assert.equal(repeated.scanCount, 4);
  assert.equal(h.state.encounterDirector.pending.length, 1, 'repeated reads tighten one watch, never clone it');
  assert.ok(h.state.encounterDirector.pending[0].dueAt < initialDueAt);

  h.state.encounterDirector.pending[0].dueAt = h.state.simTime;
  h.state.encounterDirector.pressure.combat = 140;
  h.state.encounterDirector.lastMeaningfulAt = -1e9;
  localPlayer(h, 0, 0);
  h.sim.runTicks(70);
  const live = Object.values(h.state.encounterDirector.live)
    .find((entry) => entry.shapeId === RESONANCE_OBELISK.patrolShapeId);
  assert.ok(live, 'the queued response reaches the existing paced encounter runtime');
  assert.equal(live.factionId, 'faction_vael');
  assert.ok(live.ids.length >= 1 && live.ids.length <= 2);
  for (const id of live.ids) {
    const entity = h.state.entities.get(id);
    assert.equal(entity.factionId, 'faction_vael');
    assert.equal(entity.data.ai.engagementTrigger, 'resonance_obelisk_scan_response');
  }
});

test('an investigated obelisk keeps counting visits after scanner save and restore', () => {
  const first = boot(6203, { triangulated: true });
  pulse(first);
  const signalId = first.events.scans[0].primary.id;
  first.bus.emit('signal:track', { signalId });
  localPlayer(first, 0, 0);
  first.sim.runTicks(2);
  assert.ok(first.state.signalInvestigation.completed[signalId]);

  coolScanner(first);
  pulse(first);
  assert.equal(first.events.scans.at(-1).primary.scanCount, 2);
  assert.equal(first.events.scans.at(-1).primary.trackable, false);
  const saved = first.sim.registry.get('scanner').serialize();

  const restored = boot(6203, { triangulated: true });
  restored.sim.registry.get('scanner').deserialize(saved);
  localPlayer(restored, 0, 0);
  pulse(restored);
  assert.equal(restored.events.scans.at(-1).primary.scanCount, 3);
  assert.equal(restored.events.scans.at(-1).primary.trackable, false);
  assert.match(restored.events.scans.at(-1).primary.detail, /3 scans logged/);
});
