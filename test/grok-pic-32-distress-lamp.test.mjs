// PIC-32 — a ship broadcasting distress pulses a lamp while its distress script is live,
// cleared when the script resolves either way. The lamp is one record per live encounter on
// the broadcasting hull (victim when genuine, the beacon when bait), admitted by the script's
// own fire, ended by the one encounter:resolved funnel every outcome passes through.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { actions } from '../src/systems/actions.js';
import { combat } from '../src/systems/combat.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { distressLampRecord } from '../src/render/vfx/worldCueRecipes.js';

const SECTOR_ID = 'sector_tethys_junction';
const STATION_ID = 'st_tethys_hub';
const ANCHOR = Object.freeze({ x: 6200, z: 4800 });
const SEED = 4242;

function boot(seed = SEED) {
  const systems = [combat, spawnBudget, encounterDirector, actions];
  const sim = createSimulation({ seed, systems });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR_ID;
  state.story.beatIndex = 7;
  state.world.activeSector = {
    stations: [{ id: STATION_ID, pos: { x: ANCHOR.x + 1200, z: ANCHOR.z }, name: 'Tethys Hub' }],
  };
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: ANCHOR.x - 700, z: ANCHOR.z },
    vel: { x: 0, z: 0 }, radius: 8, hull: 600, hullMax: 600,
    data: { intent: {}, ai: {} },
  });
  state.playerId = player.id;
  sim.spawn({
    type: 'station', team: 2, factionId: 'faction_mts',
    pos: { x: ANCHOR.x + 1200, z: ANCHOR.z }, radius: 42,
    data: { stationId: STATION_ID, factionId: 'faction_mts', sectorId: SECTOR_ID, dockRadius: 72 },
  });
  const resolved = [];
  bus.on('encounter:resolved', (p) => resolved.push(structuredClone(p)));
  return { sim, state, bus, player, resolved, director: sim.registry.get('encounterDirector') };
}

function fire(h, suffix) {
  const encounterId = `pic32:distress-lamp${suffix}`;
  assert.deepEqual(h.director.requestAuthoredEncounter({
    shapeId: 'distress_call', encounterId, sectorId: SECTOR_ID,
    anchor: { ...ANCHOR }, zoneType: 'trade_lane', zoneRadius: 800, force: true,
  }), { ok: true, encounterId });
  const live = h.state.encounterDirector.live[encounterId];
  assert.ok(live, 'the authored distress call was admitted');
  return live;
}

test('seed 4242: the live distress script carries one lamp on the broadcasting hull', () => {
  const h = boot();
  const live = fire(h, '-live');
  const role = live.plan.variantKind === 'distress_genuine' ? 'victim' : 'bait';
  const broadcaster = h.director.entsOf(live, role)[0];
  assert.ok(broadcaster, 'the distress script spawned a broadcasting hull');

  const lamp = distressLampRecord(h.state, live.id);
  assert.ok(lamp, 'the live distress encounter admits a lamp record');
  assert.equal(lamp.id, 'distress-lamp');
  assert.equal(lamp.kind, 'lamp');
  assert.equal(lamp.encounterId, live.id);
  assert.equal(lamp.targetId, broadcaster.id);
  assert.equal(lamp.pos.x, broadcaster.pos.x);
  assert.equal(lamp.pos.z, broadcaster.pos.z);
  assert.equal(lamp.mapMarker, false);
  assert.ok(Number.isFinite(lamp.pulseCadenceS) && lamp.pulseCadenceS > 0, 'the lamp carries its pulse cadence');
  assert.equal(broadcaster.data.distressLamp, lamp.id, 'the stamp rides the broadcasting hull');
  assert.equal(h.state.presentation.distressLamps[live.id], lamp);

  // A repeat broadcast for the same live encounter admits no second lamp.
  h.bus.emit('encounter:distressBroadcast', { encounterId: live.id, targetId: broadcaster.id });
  assert.equal(distressLampRecord(h.state, live.id), lamp);
  assert.equal(Object.keys(h.state.presentation.distressLamps).length, 1);

  // A mayday with no hull behind it fails closed: no lamp for a ghost broadcast.
  h.bus.emit('encounter:distressBroadcast', { encounterId: 'pic32:ghost', targetId: 999999 });
  assert.equal(distressLampRecord(h.state, 'pic32:ghost'), null);
  h.sim.dispose();
});

test('seed 4242: ignoring the call resolves the script and the lamp dies with it', () => {
  const h = boot();
  const live = fire(h, '-ignored');
  assert.ok(distressLampRecord(h.state, live.id), 'the lamp is live while the script is');

  h.bus.emit('encounter:choose', { encounterId: live.id, choiceId: 'ignore' });
  h.sim.runTicks(2);

  assert.equal(live.phase, 'done');
  assert.equal(live.outcome, 'ignored');
  assert.ok(h.resolved.some((p) => p.encounterId === live.id), 'the resolution funnel fired');
  assert.equal(distressLampRecord(h.state, live.id), null, 'the lamp died with the script');
  assert.equal(h.state.presentation.distressLamps[live.id], undefined, 'the map slot is vacated');
  const broadcaster = h.state.entities.get(live.ids.find((id) => live.roles[id] === 'victim' || live.roles[id] === 'bait'));
  if (broadcaster) assert.equal(broadcaster.data.distressLamp, undefined, 'the hull stamp is cleaned');
  h.sim.dispose();
});

test('seed 4242: the broadcasting hull dying mid-fight clears the lamp through the same funnel', () => {
  const h = boot();
  const live = fire(h, '-death');
  const role = live.plan.variantKind === 'distress_genuine' ? 'victim' : 'bait';
  const broadcaster = h.director.entsOf(live, role)[0];
  assert.ok(distressLampRecord(h.state, live.id), 'the lamp is live while the script is');

  // Walk the encounter into its conflict phase so the script's own death branches can run.
  // The director lives on a 1 Hz cadence, so phase transitions need a second of sim time.
  h.player.pos.x = ANCHOR.x;
  h.player.pos.z = ANCHOR.z;
  h.sim.runTicks(130);
  assert.equal(live.phase, 'conflict');

  const combatSys = h.sim.registry.get('combat');
  if (live.plan.variantKind === 'distress_genuine') {
    combatSys.kill(broadcaster, h.player.id);
    h.sim.runTicks(130);
    assert.equal(live.outcome, 'lost', 'the dead stricken hauler ends the script lost');
  } else {
    for (const e of h.director.entsOf(live)) combatSys.kill(e, h.player.id);
    h.sim.runTicks(130);
    assert.equal(live.outcome, 'bait_broken', 'the broken bait ends the script');
  }
  assert.ok(h.resolved.some((p) => p.encounterId === live.id), 'the resolution funnel fired');
  assert.equal(distressLampRecord(h.state, live.id), null, 'the lamp died with the script');
  h.sim.dispose();
});
