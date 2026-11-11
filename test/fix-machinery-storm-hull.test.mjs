// fix-machinery-storm-hull — a machine's kill field says so on the hull.
//
// The defect in player words: crossing the Cinder Sluice current or a machine mouth played no
// boundary charge, no sustained static, and no departure shed, while the identical charted
// storm played all three. Cause: the machinery's hazard receipts carried no hull id, and every
// picture consumer (vfx storm read, HUD pill) drops an anonymous receipt as "not mine". The
// machinery boundary emitters are player-scoped by construction, so the receipt now names the
// hull it measured — and carries the family's authored storm severity, so the field edge can
// never downgrade the presence a charted approach circle raised.
import assert from 'node:assert/strict';
import test from 'node:test';

import { FIELD_FLAGS } from '../src/data/fields.js';
import {
  CINDER_SLUICE_FIELD,
  CINDER_SLUICE_SECTOR_ID,
  CINDER_SLUICE_SITE_ID,
  KILL_MACHINES,
  MACHINERY_STORM_INTENSITY,
  killMachineHazardZones,
} from '../src/data/environmentalMachinery.js';
import { worldSiteManifestById } from '../src/data/worldSiteManifests.js';
import { createWorldSiteRecord } from '../src/systems/worldSiteKernel.js';
import { environmentalMachinery } from '../src/systems/environmentalMachinery.js';
import { resolveStormCrossingBeat } from '../src/render/hazardStormRead.js';
import { resolveStormDepartureBeat } from '../src/render/stormDepartureRead.js';

function rig({ sectorId, playerPos, simTime = 2.2, siteRecord = null, siteId = null }) {
  const events = [];
  const fields = {
    byId: Object.create(null),
    registerEnvironmental(spec) { this.byId[spec.id] = { ...spec }; return this.byId[spec.id]; },
    updateExternal(id, patch) { Object.assign(this.byId[id], patch); return this.byId[id]; },
    unregisterExternal(id) { const had = !!this.byId[id]; delete this.byId[id]; return had; },
    hasExternal(id) { return !!this.byId[id]; },
  };
  const state = {
    mode: 'flight', tick: Math.round(simTime * 60), simTime, playerId: 1,
    world: { currentSectorId: sectorId },
    entities: new Map([[1, { id: 1, type: 'ship', alive: true, pos: { ...playerPos } }]]),
    sites: siteId
      ? { worldOrder: [siteId], worldById: { [siteId]: siteRecord } }
      : { worldOrder: [], worldById: {} },
  };
  const bus = {
    on() { return () => {}; },
    emit(name, payload) { events.push({ name, payload }); },
  };
  const system = Object.create(environmentalMachinery);
  const previousFlag = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;
  system.init({ state, bus, registry: { get(name) { return name === 'fields' ? fields : null; } } });
  return {
    state, events, system,
    update(nextSimTime, nextPos) {
      state.simTime = nextSimTime;
      state.tick = Math.round(nextSimTime * 60);
      if (nextPos) state.entities.get(1).pos = { ...nextPos };
      system.update(1 / 60, state);
    },
    done() {
      system.destroy();
      FIELD_FLAGS.enabled = previousFlag;
    },
  };
}

test('crossing a machine kill field names the hull, and the storm read plays the receipt', () => {
  const excavator = KILL_MACHINES[0];
  const inside = {
    x: excavator.globalPos.x + excavator.perp.x * 16 + excavator.dir.x * 10,
    z: excavator.globalPos.z + excavator.perp.z * 16 + excavator.dir.z * 10,
  };
  const outside = {
    x: excavator.globalPos.x + excavator.perp.x * 400,
    z: excavator.globalPos.z + excavator.perp.z * 400,
  };
  const harness = rig({ sectorId: CINDER_SLUICE_SECTOR_ID, playerPos: outside });
  try {
    harness.update(2.2, outside); // surge, hull outside: no boundary yet
    harness.update(2.4, inside); // cross the field edge
    const enter = harness.events.find((entry) => entry.name === 'hazard:enter');
    assert.ok(enter, 'crossing into the kill field emits the boundary');
    assert.equal(enter.payload.entityId, harness.state.playerId,
      'the receipt names the crossing hull — the picture accepts it');
    assert.equal(enter.payload.zoneId, excavator.id);
    assert.equal(enter.payload.intensity, MACHINERY_STORM_INTENSITY.killMachine,
      'the field edge carries the family severity, not a silent zero');

    // The exact read the vfx layer performs on this receipt now resolves.
    const beat = resolveStormCrossingBeat(enter.payload, harness.state.simTime, false);
    assert.ok(beat, 'the storm read resolves the machinery receipt into a crossing beat');
    assert.ok(beat.count >= 10, `the beat carries real charge (${beat.count} sparks)`);
    // Parity with the identical charted storm: world.js publishes { entityId, zoneType,
    // intensity } for the machine's approach circle; the field edge must read the same bite.
    const chartZone = killMachineHazardZones(excavator.sectorId).find((z) => z.id === excavator.id);
    const chartBeat = resolveStormCrossingBeat({
      entityId: harness.state.playerId, zoneType: chartZone.type, intensity: chartZone.intensity,
    }, harness.state.simTime, false);
    assert.equal(beat.lightSeverity, chartBeat.lightSeverity,
      'the kill field bites as hard as its charted approach zone');
    assert.notEqual(beat.lightSeverity, 'graze', 'a kill field never reads as a graze');
    assert.equal(beat.count, chartBeat.count, 'same charge density as the charted storm');

    harness.update(2.6, outside); // cross back out
    const exit = harness.events.find((entry) => entry.name === 'hazard:exit');
    assert.ok(exit, 'leaving the kill field emits the boundary');
    assert.equal(exit.payload.entityId, harness.state.playerId,
      'the departure names the hull too');
    assert.equal(exit.payload.intensity, MACHINERY_STORM_INTENSITY.killMachine);
    const shed = resolveStormDepartureBeat(exit.payload, harness.state.simTime, false);
    assert.ok(shed, 'the departure read resolves the machinery exit into the shed');
  } finally {
    harness.done();
  }
});

test('the Cinder Sluice current — a killer cone with no charted zone — speaks on the hull', () => {
  // sector_ceres_belt charts no hazard disc over the sluice: the machinery receipt is the
  // ONLY boundary signal for this current, so before this fix it was fully silent.
  const manifest = worldSiteManifestById(CINDER_SLUICE_SITE_ID);
  assert.ok(manifest, 'sluice site manifest exists');
  const siteRecord = createWorldSiteRecord(manifest, { tick: 0 });
  const inside = { x: CINDER_SLUICE_FIELD.center.x, z: CINDER_SLUICE_FIELD.center.z };
  const outside = {
    x: CINDER_SLUICE_FIELD.center.x - CINDER_SLUICE_FIELD.dir.x * 1500,
    z: CINDER_SLUICE_FIELD.center.z - CINDER_SLUICE_FIELD.dir.z * 1500,
  };
  const harness = rig({
    sectorId: CINDER_SLUICE_SECTOR_ID, playerPos: inside,
    simTime: 0, siteRecord, siteId: CINDER_SLUICE_SITE_ID,
  });
  try {
    harness.update(0.1, inside); // warning window: geometry is live before force
    const enter = harness.events.find((entry) => entry.name === 'hazard:enter');
    assert.ok(enter, 'entering the current emits the boundary');
    assert.equal(enter.payload.entityId, harness.state.playerId, 'the current names the crossing hull');
    assert.equal(enter.payload.zoneId, CINDER_SLUICE_FIELD.id);
    assert.equal(enter.payload.intensity, MACHINERY_STORM_INTENSITY.cinderSluice);
    assert.ok(resolveStormCrossingBeat(enter.payload, harness.state.simTime, false),
      'the current plays the same storm read as a charted zone');

    harness.update(10, outside); // calm window drops the field: the hull is out
    const exit = harness.events.find((entry) => entry.name === 'hazard:exit');
    assert.ok(exit, 'leaving the current emits the boundary');
    assert.equal(exit.payload.entityId, harness.state.playerId);
    assert.ok(resolveStormDepartureBeat(exit.payload, harness.state.simTime, false),
      'the shed plays on leaving');
  } finally {
    harness.done();
  }
});

test('a non-player hull crossing a kill field stays silent — the boundary only measures the player', () => {
  const excavator = KILL_MACHINES[0];
  const inside = {
    x: excavator.globalPos.x + excavator.perp.x * 16 + excavator.dir.x * 10,
    z: excavator.globalPos.z + excavator.perp.z * 16 + excavator.dir.z * 10,
  };
  const farOutside = {
    x: excavator.globalPos.x + excavator.perp.x * 900,
    z: excavator.globalPos.z + excavator.perp.z * 900,
  };
  const harness = rig({ sectorId: CINDER_SLUICE_SECTOR_ID, playerPos: farOutside });
  try {
    // An NPC hull rides the sheet while the player stays clear of the whole machine.
    harness.state.entities.set(7, { id: 7, type: 'ship', alive: true, pos: { ...inside } });
    harness.update(2.2, farOutside);
    harness.update(2.4, farOutside);
    assert.equal(harness.events.filter((entry) => entry.name === 'hazard:enter').length, 0,
      'an NPC crossing emits nothing — the storm read stays player-only');
    assert.equal(harness.events.filter((entry) => entry.name === 'hazard:exit').length, 0);
  } finally {
    harness.done();
  }
});

test('the fail-closed guard that ate machinery receipts still holds for anonymous ones', () => {
  const anonymous = { zoneType: 'debris', zoneId: 'x', siteId: 'x', intensity: 0.7 };
  assert.equal(resolveStormCrossingBeat(anonymous, 5, false), null,
    'a receipt with no hull stays silent in the reader');
  assert.equal(resolveStormDepartureBeat(anonymous, 5, false), null);
});

test('the charted approach zone and the field edge publish the same severity — no downgrade', () => {
  for (const machine of KILL_MACHINES) {
    const zone = killMachineHazardZones(machine.sectorId).find((z) => z.id === machine.id);
    assert.ok(zone, `${machine.id} charts an approach zone`);
    assert.equal(zone.intensity, MACHINERY_STORM_INTENSITY.killMachine,
      `${machine.id}: chart circle and field edge read as one storm`);
  }
});
