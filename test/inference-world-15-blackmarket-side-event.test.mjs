// INFERENCE WORLD-15: "The black market's apron does den business."
//
// Contract: `planStationSideEvents` for a `blackmarket` station can pick den-specific kinds —
// an unmanifested `quiet_dock` runner and the fence's `cargo_tractor` — instead of the old
// repair_drone-only day that made every den look commercially dead. Both kinds are cosmetic
// seams (budget 0 — never a launched combat ship), `quiet_dock` is blackmarket-only, and the
// render grammar carries a matching profile so the seam actually draws.
import assert from 'node:assert/strict';
import test from 'node:test';

import { planStationSideEvents, SIDE_EVENTS, SIDE_EVENT_IDS } from '../src/data/stationSideEvents.js';
import {
  createStationSideEventVfxFrameScratch,
  resolveStationSideEventVfxProfile,
  writeStationSideEventVfxFrame,
} from '../src/render/stationSideEventVfx.js';
import { stationSideEventReachWu } from '../src/systems/stationSideEventDirector.js';

const NON_BLACKMARKET_TYPES = ['trade_hub', 'refinery', 'mining', 'fab', 'military', 'research'];

function blackmarketStation() {
  return {
    id: 'station_sker',
    type: 'station',
    alive: true,
    size: 'M',
    factionId: 'faction_reach',
    pos: { x: 120, z: 0 },
    dockRadius: 80,
    data: { stationId: 'station_sker', stationTypeId: 'blackmarket', dockRadius: 80, size: 'M' },
  };
}

test('quiet_dock is a blackmarket-only cosmetic side event, and the fence tug comes too', () => {
  const def = SIDE_EVENTS.quiet_dock;
  assert.ok(def, 'quiet_dock exists in the side-event catalog');
  assert.ok(SIDE_EVENT_IDS.includes('quiet_dock'), 'quiet_dock is in the stable id order');
  assert.equal(def.budget, 0, 'quiet_dock requests no spawn slot (never a launched ship)');
  assert.deepEqual([...def.affinity], ['blackmarket'], 'quiet_dock is den business, not lane freight');
  assert.ok(SIDE_EVENTS.cargo_tractor.affinity.includes('blackmarket'),
    'the fence tug works blackmarket pods too');
});

test('a blackmarket station plans den business, and no other type gets quiet_dock', () => {
  let sawQuietDock = false;
  let sawTractor = false;
  for (let seed = 0; seed < 60; seed++) {
    for (const item of planStationSideEvents(seed, 'sector_sker_haven', 4, 'station_sker', 'blackmarket')) {
      const affinity = SIDE_EVENTS[item.kind].affinity;
      assert.ok(affinity == null || affinity.includes('blackmarket'), `${item.kind} must fit a den`);
      // Den business is not declared freight or a patrol wing.
      assert.notEqual(item.kind, 'hauler_dock', 'blackmarket does not log manifest freight');
      assert.notEqual(item.kind, 'patrol_launch', 'blackmarket does not launch patrols');
      if (item.kind === 'quiet_dock') sawQuietDock = true;
      if (item.kind === 'cargo_tractor') sawTractor = true;
    }
  }
  assert.ok(sawQuietDock, 'a blackmarket plan can actually pick the unmanifested runner');
  assert.ok(sawTractor, 'a blackmarket plan can actually pick the fence tug');

  for (const typeId of NON_BLACKMARKET_TYPES) {
    for (let seed = 0; seed < 60; seed++) {
      const kinds = planStationSideEvents(seed, 'sector_sker_haven', 4, 'station_x', typeId).map((i) => i.kind);
      assert.ok(kinds.every((kind) => kind !== 'quiet_dock'),
        `${typeId} must not schedule den-only business`);
    }
  }
  // The tractor stays off military/research aprons — its affinity did not grow sideways.
  for (const typeId of ['military', 'research']) {
    for (let seed = 0; seed < 60; seed++) {
      const kinds = planStationSideEvents(seed, 'sector_x', 4, 'station_y', typeId).map((i) => i.kind);
      assert.ok(kinds.every((kind) => kind !== 'cargo_tractor'),
        `${typeId} must not schedule the fence tug`);
    }
  }
});

test('the blackmarket reach covers the inbound runner, and quiet_dock draws a slip-run', () => {
  const denReach = stationSideEventReachWu(blackmarketStation());
  const labReach = stationSideEventReachWu({
    ...blackmarketStation(),
    data: { ...blackmarketStation().data, stationTypeId: 'research' },
  });
  assert.ok(Number.isFinite(denReach) && denReach > 0, 'blackmarket station reach is finite');
  assert.ok(denReach >= labReach, 'the inbound traffic reach is at least the lab reach');

  const profile = resolveStationSideEventVfxProfile('quiet_dock');
  assert.ok(profile, 'quiet_dock has a render profile (a null profile would draw nothing)');
  assert.equal(profile.trajectory, 'slip-run', 'the den runner carries its own trajectory read');
  assert.equal(profile.accent, 'dimmed-transit-lights', 'lights-out silhouette, not cargo lamps');

  const scratch = createStationSideEventVfxFrameScratch();
  const early = writeStationSideEventVfxFrame(profile, 3, 35, 122, 0, 118, 0, 120, 0, 0, false, scratch);
  const pose = { x: early.x, z: early.z };
  const later = writeStationSideEventVfxFrame(profile, 18, 35, 122, 0, 118, 0, 120, 0, 0, false, scratch);
  assert.ok(later.x !== pose.x || later.z !== pose.z, 'the runner moves down the approach');
  assert.ok(later.emitStep > 0, 'the runner emits at its cadence');
});
