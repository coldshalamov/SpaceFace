// INFERENCE WORLD-14: "The Veil research station can run a research side event."
//
// Contract: `planStationSideEvents` for a `research` station can pick a research-specific kind
// (`sensor_sweep`), that kind is cosmetic (budget 0 — never a launched combat ship), no other
// station type can schedule it, and the render grammar carries a matching profile so the seam
// actually draws instead of resolving to a null profile.
import assert from 'node:assert/strict';
import test from 'node:test';

import { planStationSideEvents, SIDE_EVENTS, SIDE_EVENT_IDS } from '../src/data/stationSideEvents.js';
import {
  createStationSideEventVfxFrameScratch,
  resolveStationSideEventVfxProfile,
  writeStationSideEventVfxFrame,
} from '../src/render/stationSideEventVfx.js';
import { stationSideEventReachWu } from '../src/systems/stationSideEventDirector.js';

const NON_RESEARCH_TYPES = ['trade_hub', 'refinery', 'mining', 'fab', 'military', 'blackmarket'];

function researchStation() {
  return {
    id: 'station_veil',
    type: 'station',
    alive: true,
    size: 'M',
    factionId: 'faction_free',
    pos: { x: 120, z: 0 },
    dockRadius: 80,
    data: { stationId: 'station_veil', stationTypeId: 'research', dockRadius: 80, size: 'M' },
  };
}

test('sensor_sweep is a research-only cosmetic side event', () => {
  const def = SIDE_EVENTS.sensor_sweep;
  assert.ok(def, 'sensor_sweep exists in the side-event catalog');
  assert.ok(SIDE_EVENT_IDS.includes('sensor_sweep'), 'sensor_sweep is in the stable id order');
  assert.equal(def.budget, 0, 'research side event requests no spawn slot (never a launched ship)');
  assert.deepEqual([...def.affinity], ['research'], 'sensor_sweep is research-only');
  assert.equal(def.affinity.includes('military'), false, 'research side event is not a combat ship');
});

test('a research station can pick its research side event, and no other type can', () => {
  let sawResearchKind = false;
  for (let seed = 0; seed < 60; seed++) {
    for (const item of planStationSideEvents(seed, 'sector_veil', 4, 'station_veil', 'research')) {
      const affinity = SIDE_EVENTS[item.kind].affinity;
      assert.ok(affinity == null || affinity.includes('research'), `${item.kind} must fit research`);
      if (item.kind === 'sensor_sweep') sawResearchKind = true;
    }
  }
  assert.ok(sawResearchKind, 'a research plan can actually pick the research-specific kind');

  for (const typeId of NON_RESEARCH_TYPES) {
    for (let seed = 0; seed < 60; seed++) {
      const kinds = planStationSideEvents(seed, 'sector_veil', 4, 'station_x', typeId).map((i) => i.kind);
      assert.ok(kinds.every((kind) => kind !== 'sensor_sweep'),
        `${typeId} must not schedule a research-only side event`);
    }
  }
});

test('the research station reach accounts for the dish arc, and the kind renders', () => {
  const reach = stationSideEventReachWu(researchStation());
  assert.ok(Number.isFinite(reach) && reach > 0, 'research station reach includes the dish arc');

  const profile = resolveStationSideEventVfxProfile('sensor_sweep');
  assert.ok(profile, 'sensor_sweep has a render profile (a null profile would draw nothing)');
  assert.equal(profile.trajectory, 'dish-sweep', 'the research kind carries its own trajectory read');

  const scratch = createStationSideEventVfxFrameScratch();
  const early = writeStationSideEventVfxFrame(profile, 3, 70, 122, 0, 118, 0, 120, 0, 0, false, scratch);
  const pose = { x: early.x, z: early.z };
  const later = writeStationSideEventVfxFrame(profile, 40, 70, 122, 0, 118, 0, 120, 0, 0, false, scratch);
  assert.ok(later.x !== pose.x || later.z !== pose.z, 'the boom sweeps rather than sitting still');
  assert.ok(later.emitStep > 0, 'the sweep emits at its cadence');
});
