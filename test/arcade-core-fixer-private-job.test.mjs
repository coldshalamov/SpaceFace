import assert from 'node:assert/strict';
import test from 'node:test';

import { SIM_DT } from '../src/core/sim.js';
import { frontierRumorOffer } from '../src/data/frontierRumors.js';
import { SALVAGE_RACE_VARIANT_ID } from '../src/data/missionVariants.js';
import { FIXER_CONTACT, fixerMemoryFor } from '../src/data/stationContacts.js';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { FIXER_PRIVATE_MISSION_SOURCE } from '../src/systems/missions.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { buildReply, generateContacts } from '../src/ui/screens/bar.js';

const HOME_STATION = 'station_helios';

test('Nera sells one off-board Salvage Race and remembers the physical result', async (t) => {
  const runtime = createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed: 0x52b0a4d });
  t.after(() => runtime.dispose());
  const { state, bus } = runtime;
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  runtime.getSystem('ships').newGame();
  const player = runtime.spawn(makeShipEntitySpec('ship_kestrel', {
    isPlayer: true,
    team: 0,
    factionId: 'faction_free',
    pos: { x: 0, z: 0 },
  }));
  player.flags = { ...(player.flags || {}), persistent: true };
  state.playerId = player.id;
  state.mode = 'station';
  state.world.currentSectorId = 'sector_helios_prime';
  state.ui.docked = true;
  state.ui.dockedStationId = HOME_STATION;
  state.player.credits = 100_000;
  state.player.cargo.capVolume = 500;
  state.player.cargo.capMass = 500;
  for (const record of Object.values(state.factions || {})) {
    if (record && typeof record === 'object') record.rep = 100;
  }

  const intro = frontierRumorOffer(state, HOME_STATION);
  assert.ok(intro && intro.source === 'bar');
  bus.emit('ui:purchaseFrontierRumor', { rumorId: intro.id, stationId: HOME_STATION });
  const contact = generateContacts(HOME_STATION, state)
    .find((candidate) => candidate.id === FIXER_CONTACT.id);
  assert.ok(contact && contact.choices.some((choice) => choice.id === 'private_job'));

  const missionOwner = runtime.getSystem('missions');
  const boardBefore = missionOwner.ensureBoard(HOME_STATION).slots.map((offer) => offer.id);
  const reply = buildReply('fixer', 'private_job', { state, bus, missions: missionOwner }, HOME_STATION, contact);
  assert.match(reply.text, /No board, no queue/);
  const mission = state.missions.active.find((row) => row.id === reply.privateMissionId);
  assert.ok(mission);
  assert.equal(mission.source, FIXER_PRIVATE_MISSION_SOURCE);
  assert.equal(mission.variantId, SALVAGE_RACE_VARIANT_ID);
  assert.match(mission.title, /^Off-Board: Salvage Race/);
  assert.deepEqual(missionOwner.ensureBoard(HOME_STATION).slots.map((offer) => offer.id), boardBefore,
    'the private job is accepted through Missions without occupying the public board');

  let memory = fixerMemoryFor(state);
  assert.equal(memory.privateJobCount, 1);
  assert.equal(memory.privateJobOutcomeCount, 0);
  assert.equal(memory.activePrivateJobMissionId, mission.id);
  const repeated = buildReply('fixer', 'private_job', { state, bus, missions: missionOwner }, HOME_STATION, contact);
  assert.match(repeated.text, /still open/);
  assert.equal(state.missions.active.filter((row) => row.source === FIXER_PRIVATE_MISSION_SOURCE).length, 1);

  assert.equal(await runtime.getSystem('physics').prepareBackend(state, { reset: true }), true);
  state.mode = 'flight';
  state.ui.docked = false;
  state.ui.dockedStationId = null;
  runtime.getSystem('world').enterSector(mission.destSectorId, { placePlayer: true });
  for (let tick = 0; tick < 90 && mission.targetEntityIds.length === 0; tick++) runtime.step(SIM_DT);
  assert.equal(mission.targetEntityIds.length, 1);
  const wreck = state.entities.get(mission.targetEntityIds[0]);
  assert.ok(wreck && wreck.alive !== false && wreck.type === 'wreck');
  assert.equal(wreck.data.salvageRaceMission, true);
  player.pos.x = wreck.pos.x - 80;
  player.pos.z = wreck.pos.z;
  runtime.getSystem('mining')._drainWreck(player, wreck, 18, 8);
  assert.equal(state.missions.receipts.find((row) => row.missionId === mission.id)?.outcome, 'completed');

  memory = fixerMemoryFor(state);
  assert.equal(memory.privateJobCount, 1);
  assert.equal(memory.privateJobOutcomeCount, 1);
  assert.equal(memory.activePrivateJobMissionId, null);
  assert.equal(memory.lastPrivateJobMissionId, mission.id);
  assert.equal(memory.lastPrivateJobOutcome, 'completed');

  const save = runtime.getSystem('save');
  const envelope = save.serialize('plan52-fixer-private-job');
  assert.equal(save.loadEnvelope(structuredClone(envelope), 'plan52-fixer-private-job'), true);
  memory = fixerMemoryFor(state);
  assert.equal(memory.privateJobCount, 1);
  assert.equal(memory.privateJobOutcomeCount, 1);
  assert.equal(memory.lastPrivateJobOutcome, 'completed');
  state.mode = 'station';
  state.ui.docked = true;
  state.ui.dockedStationId = HOME_STATION;
  bus.emit('dock:docked', { stationId: HOME_STATION, shipId: state.playerId });
  assert.equal(missionOwner.fixerPrivateOffer(HOME_STATION), null,
    'the same board epoch cannot remint Nera\'s private contract after Continue');
});
