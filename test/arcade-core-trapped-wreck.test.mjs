import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { save } from '../src/save/saveSystem.js';
import { uniqueWreckById } from '../src/data/uniqueWrecks.js';
import { cargo } from '../src/systems/cargo.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { mining } from '../src/systems/mining.js';
import { salvageActions } from '../src/systems/salvageActions.js';
import { RUMOR_EVENT_BY_CHANNEL, uniqueWrecks } from '../src/systems/uniqueWrecks.js';

const WRECK_ID = 'wreck_dmc_ironsong';
const ENCOUNTER_ID = 'ambush_snare';
const INSTANCE_ID = `unique-wreck:${WRECK_ID}:${ENCOUNTER_ID}`;

function boot(seed = 26047) {
  const def = uniqueWreckById(WRECK_ID);
  const sim = createSimulation({
    seed,
    systems: [encounterDirector, salvageActions, uniqueWrecks, mining, cargo, save],
    updateOrder: [encounterDirector, salvageActions, uniqueWrecks, mining, cargo, save],
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = def.sectorId;
  state.player.cargo.capVolume = 0;
  state.player.cargo.capMass = 1e9;
  state.player.beamMode = 'extract';
  state.ui.beamMode = 'extract';
  state.player.miningBeam = {
    tierId: 'beam_mk1', range: 220, dps: 90, directToCargo: false,
    heat: 0, heatMax: 10_000, heatRate: 0.1, coolRate: 100,
  };
  const player = sim.spawn({
    type: 'ship', team: 0, factionId: 'player', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, hull: 100, hullMax: 100, flags: {}, data: { defId: 'ship_kestrel' },
  });
  state.playerId = player.id;
  const requests = [];
  const beamEvents = [];
  bus.on('uniqueWreck:encounterRequested', (payload) => requests.push(payload));
  for (const name of ['mining:start', 'mining:yield', 'beam:denied']) {
    bus.on(name, (payload) => beamEvents.push({ name, payload }));
  }
  return { sim, state, bus, def, player, requests, beamEvents };
}

function revealIronsong(route) {
  const source = route.def.rumorSources.find((entry) => entry.sourceRef === route.def.bearingSourceRef);
  route.bus.emit(RUMOR_EVENT_BY_CHANNEL[source.channelId], {
    wreckId: route.def.id,
    authoredWreckId: route.def.id,
    sourceRef: source.sourceRef,
    channelId: source.channelId,
  });
  const record = route.state.player.uniqueWrecks.bearings[WRECK_ID];
  const wreck = route.state.entityList.find((entity) => entity.alive !== false
    && entity.data?.uniqueWreckId === WRECK_ID);
  assert.ok(record && wreck, 'the authentic comms clue materializes the Ironsong as a physical wreck');
  return { record, wreck };
}

function scanAndSpring(route) {
  const { record, wreck } = revealIronsong(route);
  assert.doesNotMatch(`${wreck.data.scanLabel} ${wreck.data.scanDescription}`, /pirate tripwire/i,
    'the clue is a bearing, not advance knowledge of the trap');

  route.bus.emit('scan:pulse', { pos: { ...record.exactPos } });
  assert.equal(record.phase, 'fixed');
  assert.match(wreck.data.scanLabel, /pirate tripwire detected/i);
  assert.match(wreck.data.scanDescription, /drive wakes.+salvage.+spring/i,
    'the normal scanner discloses both the pirate tell and the player action that triggers it');

  route.player.pos.set(wreck.pos.x - 80, 0, wreck.pos.z);
  route.player.prevPos.copy(route.player.pos);
  route.state.player.targetId = wreck.id;
  route.state.player.tether = { active: true, targetId: wreck.id, attachmentId: 'massline:ironsong' };
  route.state.input.fireGroup = 2;
  route.sim.step(0.75);
  route.state.input.fireGroup = 0;
  route.sim.step(1 / 60);

  const live = route.state.encounterDirector.live[INSTANCE_ID];
  const pirates = route.state.entityList.filter((entity) => entity.alive !== false
    && entity.type === 'ship' && entity.team === 1 && entity.factionId === 'faction_reach');
  const looseLoot = route.state.entityList.filter((entity) => entity.alive !== false
    && entity.type === 'pickup'
    && ['cmdty_scrap_metal', 'cmdty_classified_salvage'].includes(entity.data?.commodityId));
  assert.ok(live, `the detected trap reaches the existing live encounter director: ${JSON.stringify(route.beamEvents)}`);
  assert.ok(pirates.length >= 4, 'the trap produces a physical Reach pirate squad');
  assert.ok(looseLoot.length >= 1, 'the same beam action ejects conserved physical wreck loot');
  assert.equal(route.requests.length, 1);
  assert.equal(route.requests[0].trigger, 'salvage_yield');
  assert.match(wreck.data.scanLabel, /pirate tripwire sprung/i,
    'the scan readout changes when the warned-about ambush becomes physical');
  return { record, wreck, live, pirates, looseLoot };
}

test('the Ironsong is detectable pirate bait and springs a physical ambush only when salvage leaves the wreck', () => {
  const route = boot();
  try {
    scanAndSpring(route);
  } finally {
    route.sim.dispose();
  }
});

test('the seeded trap plan is stable and its completed receipt survives real Continue without a second ambush', () => {
  const first = boot(26048);
  const repeat = boot(26048);
  try {
    const a = scanAndSpring(first);
    const b = scanAndSpring(repeat);
    assert.deepEqual(
      {
        wreck: { x: a.wreck.pos.x, z: a.wreck.pos.z },
        ships: a.live.plan.ships,
      },
      {
        wreck: { x: b.wreck.pos.x, z: b.wreck.pos.z },
        ships: b.live.plan.ships,
      },
      'equal save seeds produce the same wreck anchor and pirate plan',
    );

    const physicalLoot = a.looseLoot[0];
    first.state.player.cargo.capVolume = 1000;
    first.player.pos.copy(physicalLoot.pos);
    first.player.prevPos.copy(physicalLoot.pos);
    first.sim.step(1);
    assert.ok(Object.values(first.state.player.cargo.items).reduce((sum, qty) => sum + qty, 0) >= 1,
      'the ejected wreck unit enters cargo only after physical pickup contact');

    const remainingBeforeSave = structuredClone(a.record.salvageRemaining);
    first.bus.emit('encounter:resolved', { encounterId: INSTANCE_ID, outcome: 'player_victory' });
    const complicationKey = `${WRECK_ID}:encounter:${ENCOUNTER_ID}`;
    assert.equal(first.state.player.uniqueWrecks.complications[complicationKey].status, 'completed');
    assert.match(a.wreck.data.scanLabel, /pirate tripwire cleared/i);
    const saveOwner = first.sim.registry.get('save');
    const envelope = saveOwner.serialize('plan26-trapped-wreck');
    assert.equal(saveOwner.loadEnvelope(structuredClone(envelope), 'plan26-trapped-wreck'), true,
      'the production save owner completes a real Continue');
    assert.equal(first.state.player.uniqueWrecks.complications[complicationKey].status, 'completed');

    const restoredWreck = first.state.entityList.find((entity) => entity.alive !== false
      && entity.data?.uniqueWreckId === WRECK_ID);
    assert.ok(restoredWreck, 'the still-partly-loaded physical wreck rematerializes after Continue');
    assert.deepEqual(first.state.player.uniqueWrecks.bearings[WRECK_ID].salvageRemaining, remainingBeforeSave);
    assert.deepEqual(restoredWreck.data.salvagePool, remainingBeforeSave,
      'Continue cannot mint the already-collected unit back into the physical wreck');
    assert.match(restoredWreck.data.scanLabel, /pirate tripwire cleared/i);
    const restoredPlayer = first.state.entities.get(first.state.playerId);
    restoredPlayer.pos.set(restoredWreck.pos.x - 80, 0, restoredWreck.pos.z);
    restoredPlayer.prevPos.copy(restoredPlayer.pos);
    first.state.player.targetId = restoredWreck.id;
    first.state.player.tether = {
      active: true, targetId: restoredWreck.id, attachmentId: 'massline:ironsong-continue',
    };
    first.state.player.beamMode = 'extract';
    first.state.ui.beamMode = 'extract';
    first.state.input.fireGroup = 2;
    first.sim.step(1.5);
    first.state.input.fireGroup = 0;
    first.sim.step(1 / 60);
    assert.equal(first.requests.length, 1, 'continued salvage cannot request the completed trap again');
    assert.equal(Object.keys(first.state.player.uniqueWrecks.complications)
      .filter((key) => key === complicationKey).length, 1);
  } finally {
    first.sim.dispose();
    repeat.sim.dispose();
  }
});
