import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createFurnaceIntake } from '../src/systems/furnaceIntake.js';
import { missions } from '../src/systems/missions.js';
import { buildMissionBoardContract } from '../src/story/campaign47a/embodiedMissions.js';
import { createCampaign47aState } from '../src/story/campaign47a/campaignSchema.js';
import { FURNACE_MITE_KEYS, furnaceHandlingRead, furnaceLotSpec, furnaceLots, furnaceMouthGlobal, furnaceWorksiteFocus } from '../src/missions/furnaceWorksite.js';
import { syncFurnaceWorksite, snapshotFurnaceWorksite } from '../src/missions/furnaceWorksiteRuntime.js';
import { furnaceDetailRead, furnaceReleasePosition, syncFurnaceArrivalScene } from '../src/missions/furnaceArrivalScene.js';
import { furnaceDetailChoices, furnaceDetailReply } from '../src/ui/station/furnaceDetailConversation.js';
import { generateContacts, buildReply } from '../src/ui/station/barContacts.js';
import { sectorLocalToGlobalForSector as globalPos } from '../src/data/sectorCoordinates.js';
const POD_COUNT = 3, RECEIPT_AT = 100;
function authorFurnaceOffer(state) {
  const offer = buildMissionBoardContract(1, {
    seed: 23,
    epoch: 0,
    state: { story: state.story },
  });
  assert.ok(offer);
  assert.equal(offer.storyTag, 'campaign47a:b1:infested');
  assert.equal(offer.params.furnaceWorksiteVersion, 1);
  return offer;
}

function liveWorksite() {
  const state = createGameState(23);
  state.story = {
    beatIndex: 1,
    branch: null,
    flags: {},
    campaign47a: createCampaign47aState(),
  };
  state.story.campaign47a.stepProgress['1'] = {
    completed: ['alloy_run', 'scale_4'],
    updatedAtS: 0,
  };
  state.missions = { active: [], nextId: 1, boards: {}, completedLog: [], receipts: [] };
  state.world.currentSectorId = 'sector_ceres_belt';
  state.world.alienEcology = { sites: { closed_refinery: { deadFauna: {} } } };
  state.run = { kind: 'adventure' };
  state.mode = 'flight';
  state.simTime = RECEIPT_AT;

  const bus = createBus();
  const owner = Object.create(missions);
  owner.state = state;
  const helpers = {
    spawnEntity(spec) {
      const entity = { ...spec, id: `spawn-${state.nextEntityId++}`, alive: true };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
    removeEntity(id) {
      state.entities.delete(id);
      const index = state.entityList.findIndex((entity) => entity.id === id);
      if (index >= 0) state.entityList.splice(index, 1);
    },
  };
  owner.init({ state, bus, helpers, registry: { get: () => null } });
  const mission = owner._instanceFromOffer(authorFurnaceOffer(state));
  state.missions.active.push(mission);
  for (const lot of furnaceLots(mission)) {
    const entity = { ...furnaceLotSpec(mission, lot), id: `ore-pod-${lot.slot}`, alive: true };
    lot.entityId = entity.id;
    state.entities.set(entity.id, entity);
    state.entityList.push(entity);
  }

  const intake = createFurnaceIntake();
  intake.init({ state, bus, helpers });
  return { state, bus, owner, mission, intake };
}

function feedPod(fixture, slot) {
  const lot = fixture.mission.params.furnaceLots[slot];
  const pod = fixture.state.entities.get(lot.entityId);
  assert.ok(pod);
  pod.pos = furnaceMouthGlobal();
  fixture.intake.update();
}

function losePod(fixture, slot) {
  const lot = fixture.mission.params.furnaceLots[slot];
  const pod = fixture.state.entities.get(lot.entityId);
  assert.ok(pod);
  pod.alive = false;
  fixture.bus.emit('entity:killed', { id: pod.id, entity: pod, killerId: 'npc' });
}

function clearMiteSites(fixture) {
  const deadFauna = fixture.state.world.alienEcology.sites.closed_refinery.deadFauna;
  for (const key of FURNACE_MITE_KEYS) deadFauna[key] = true;
  syncFurnaceWorksite(fixture.owner, fixture.mission);
}

function settledWorksite(received) {
  const fixture = liveWorksite();
  for (let slot = 0; slot < POD_COUNT; slot++) {
    if (slot < received) feedPod(fixture, slot);
    else losePod(fixture, slot);
  }
  clearMiteSites(fixture);
  assert.equal(fixture.mission.status, 'completed');
  assert.equal(fixture.state.missions.active.includes(fixture.mission), false);
  assert.equal(fixture.state.missions.furnaceWorksiteAftermath.version, 1,
    'the real settlement cleanup retired the authored physical worksite');
  assert.equal(fixture.state.missions.furnaceWorksiteAftermath.missionId, fixture.mission.id);
  return fixture;
}

function pilot(f, local = { x: 1980, z: 1810 }) {
  const p = { id: 'pilot', type: 'ship', alive: true, pos: globalPos(local, 'sector_ceres_belt') };
  f.state.playerId = p.id; f.state.entities.set(p.id, p); f.state.entityList.push(p); return p;
}
const guides = f => f.state.entityList.filter(e => e.alive && e.data?.furnaceReleaseGuide);
const host = { id: 'contact_station_ceres_0', role: 'barkeep' };
function berth(f) { f.state.ui.docked = true; f.state.ui.dockedStationId = 'station_ceres'; }
function answer(f, action = 'read') {
  const choice = furnaceDetailChoices(f.state, 'station_ceres', host).find(c => c.id.startsWith(`furnace_detail:${action}:`));
  assert.ok(choice); return furnaceDetailReply({ state: f.state, bus: f.bus }, 'station_ceres', host, choice.id);
}

test('first approach is local, active-job specific and uses one nonphysical existing ring asset', () => {
  const f = liveWorksite(), p = pilot(f, { x: -1100, z: 620 }), lines = [];
  f.bus.on('comms:popup', e => lines.push(e));
  f.intake.update(); assert.equal(lines.length, 0); assert.equal(guides(f).length, 1);
  const guide = guides(f)[0]; assert.equal(guide.physicsBody, false); assert.equal(guide.collides, false);
  assert.equal(guide.data.circuitMark, true); assert.equal(guide.data.tetherable, false);
  assert.deepEqual(guide.pos, furnaceReleasePosition());
  p.pos = globalPos({ x: 1980, z: 1810 }, 'sector_ceres_belt');
  f.state.ui.docked = true; f.intake.update(); assert.equal(lines.length, 0);
  f.state.ui.docked = false; f.intake.update(); assert.equal(lines.length, 1);
  assert.match(lines[0].text, /no crew.*Four marked repair-mite.*Casket worms.*own freight/s);
  for (let i = 0; i < 5; i++) f.intake.update(); assert.equal(lines.length, 1);
  assert.equal(furnaceDetailRead(f.state).received, 0); assert.equal(f.mission.objectiveProgress, 0);
  f.intake.destroy(); assert.equal(guides(f).length, 0);
  f.intake.init({ state: f.state, bus: f.bus, helpers: f.owner.helpers });
  f.state.simTime += 20; f.intake.update(); assert.equal(lines.length, 1, 'same saved mark prevents re-announcement');
  assert.equal(guides(f).length, 1);
  f.state.world.currentSectorId = 'sector_helios_prime'; f.intake._sync(); assert.equal(guides(f).length, 0);
});

test('either work order keeps site clearance, intake and losses distinct', () => {
  for (const received of [0, 1, 2, 3]) {
    const f = liveWorksite(); pilot(f); const lines = []; f.bus.on('comms:popup', e => lines.push(e));
    f.intake.update();
    for (let slot = 0; slot < 3; slot++) {
      if (slot < received) feedPod(f, slot); else losePod(f, slot);
    }
    assert.equal(f.mission.status, 'active', 'cargo settlement cannot clear actual mites');
    if (received) assert.match(lines.find(e => e.id === 'furnace_fed_ore-pod-0').text,
      /pod 1 received.*1\/3.*0\/4.*not site clearance/);
    clearMiteSites(f); f.state.simTime += 13; f.intake.update();
    assert.equal(f.mission.status, 'completed'); assert.equal(guides(f).length, 0);
    const read = furnaceDetailRead(f.state); assert.equal(read.settled, true);
    assert.equal(read.rewardCr, received * 160); assert.equal(read.lost, 3 - received);
    const result = lines.find(e => e.id === 'furnace_detail_result'); assert.ok(result);
    assert.match(result.text, new RegExp(`${received}/3 pods received, ${3 - received} lost`));
    assert.match(result.text, /remains sealed/);
    const before = JSON.stringify({ cargo: f.state.player.cargo, credits: f.state.player.credits, missions: f.state.missions });
    berth(f); const reply = answer(f); assert.match(reply.text, new RegExp(`${received * 160} cr`));
    assert.match(reply.text, /Lost cargo is not a delivery/);
    assert.equal(JSON.stringify({ cargo: f.state.player.cargo, credits: f.state.player.credits, missions: f.state.missions }), before);
  }
  const f = liveWorksite(); pilot(f); const lines = []; f.bus.on('comms:popup', e => lines.push(e));
  f.intake.update(); clearMiteSites(f); f.state.simTime += 13; f.intake.update();
  assert.match(lines.at(-1).text, /Four marked mite sites cleared.*3 quarantine pods/);
  assert.equal(f.mission.status, 'active');
  for (let i = 0; i < 3; i++) feedPod(f, i);
  assert.equal(f.mission.status, 'completed');
});

test('ordinary rock is consumed without mission progress or quarantine receipt', () => {
  const f = liveWorksite(), lines = []; pilot(f); f.bus.on('comms:popup', e => lines.push(e));
  f.owner.helpers.spawnEntity({ type: 'asteroid', pos: furnaceMouthGlobal(), data: {} });
  f.intake.update(); assert.equal(furnaceDetailRead(f.state).received, 0);
  assert.ok(lines.some(e => e.text === 'CR-FEED took the load. The yard burns what it is given.'));
  assert.ok(!lines.some(e => /Quarantine pod \d received/.test(e.text)));
});

test('return remembers actual Casket worm losses without inventing player kill credit', () => {
  const f = settledWorksite(2); berth(f);
  assert.match(answer(f).text, /No Casket worm losses are recorded/);
  const dead = f.state.world.alienEcology.sites.closed_refinery.deadFauna;
  dead['closed_refinery:casket_worm:0'] = true;
  dead['closed_refinery:casket_worm:2'] = true;
  dead['other:casket_worm:1'] = true;
  assert.equal(furnaceDetailRead(f.state).casketLosses, 2);
  assert.match(answer(f).text, /2 Casket worms lost.*does not say whose blast/);
  assert.equal(f.state.missions.receipts[0].rewardCr, 320);
});

test('invalid, ambiguous and unfinished aftermath cannot advertise a completed job', () => {
  const f = liveWorksite(); pilot(f); berth(f);
  const original = structuredClone(f.mission.params.furnaceLots);
  f.mission.params.furnaceLots[0].slot = 1;
  assert.equal(furnaceDetailRead(f.state), null); assert.deepEqual(furnaceDetailChoices(f.state, 'station_ceres', host), []);
  f.mission.params.furnaceLots = original;
  f.state.missions.active.push(structuredClone(f.mission)); assert.equal(furnaceDetailRead(f.state), null);
  for (const change of [g => { g.state.missions.receipts = []; }, g => { g.state.missions.receipts.push({ ...g.state.missions.receipts[0] }); },
    g => { g.state.missions.receipts[0].destStationId = 'station_tethys'; },
    g => { g.state.missions.receipts[0].at_s = g.state.simTime + 1; },
    g => { g.state.missions.receipts[0].at_s = NaN; },
    g => { delete g.state.missions.receipts[0].at_s; },
    g => { delete g.state.world.alienEcology.sites.closed_refinery.deadFauna[FURNACE_MITE_KEYS[2]]; },
    g => { g.state.missions.furnaceWorksiteAftermath.lots[0].received = false; }]) {
    const g = settledWorksite(3); change(g); berth(g);
    assert.notEqual(furnaceDetailRead(g.state)?.settled, true); assert.deepEqual(furnaceDetailChoices(g.state, 'station_ceres', host), []);
  }
});

test('Ceres host integration preserves ordinary choices and rechecks stale replies before actions', () => {
  const f = liveWorksite(); berth(f); pilot(f);
  const contact = generateContacts('station_ceres', f.state).find(c => c.id === host.id);
  assert.ok(contact?.choices.some(c => c.id === 'rumors'));
  const choice = contact.choices.find(c => c.id.startsWith('furnace_detail:read:'));
  assert.ok(choice); assert.match(buildReply(contact.role, choice.id, { state: f.state, bus: f.bus }, 'station_ceres', contact).text, /Jorah.*not his ship/);
  const before = JSON.stringify(f.state.missions), events = [];
  f.bus.on('ui:trackMission', e => events.push(e)); f.bus.on('ui:pushScreen', e => events.push(e));
  answer(f, 'log'); assert.equal(events[0].missionId, f.mission.id); assert.equal(events[1].id, 'missionLog');
  assert.equal(JSON.stringify(f.state.missions), before);
  const stale = furnaceDetailChoices(f.state, 'station_ceres', host)[1].id;
  f.mission.params.furnaceLots[0].received = true;
  assert.match(furnaceDetailReply({ state: f.state, bus: f.bus }, 'station_ceres', host, stale).text, /not the current record/);
  assert.equal(events.length, 2);
  f.state.ui.docked = false; assert.deepEqual(furnaceDetailChoices(f.state, 'station_ceres', host), []);
});

test('fresh pickup pockets are aligned but existing, lost and moved lot positions are preserved', () => {
  const f = liveWorksite(); clearMiteSites(f);
  for (const row of f.mission.params.furnaceLots) {
    const e = f.state.entities.get(row.entityId);
    assert.deepEqual(e.pos, globalPos({ x: 1760 + 170 * row.slot, z: 1640 }, 'sector_ceres_belt'));
    assert.equal(e.mass, 40); assert.equal(e.physicsBody.mass, 40); assert.equal(e.radius, 12);
  }
  assert.match(furnaceWorksiteFocus(f.mission, f.state).reason, /Right-click the gantry and Hail/);
  const row = f.mission.params.furnaceLots[0], e = f.state.entities.get(row.entityId);
  e.pos = globalPos({ x: 1760, z: 1740 }, 'sector_ceres_belt'); snapshotFurnaceWorksite(f.owner, f.mission);
  const saved = structuredClone(f.mission), pos = { ...row.pos };
  for (const lot of f.mission.params.furnaceLots) f.owner.helpers.removeEntity(lot.entityId);
  for (const lot of saved.params.furnaceLots) delete lot.entityId;
  f.state.missions.active = [saved]; syncFurnaceWorksite(f.owner, saved);
  assert.deepEqual(f.state.entities.get(saved.params.furnaceLots[0].entityId).pos, pos);
  assert.match(furnaceWorksiteFocus(saved, f.state).reason, /Right-click the gantry and Hail/);
  assert.equal(f.state.entities.get(saved.params.furnaceLots[0].entityId).mass, 40);
});


test('earned Line capacity is stated before work without inventing an upgrade or long-tow solution', () => {
  const f = liveWorksite(); pilot(f); berth(f);
  f.state.lineProgression = { tonnageLoggedT: 40, classIndex: 8, grantedClassSteps: 0, trialClassSteps: 0 };
  const before = JSON.stringify(f.state.lineProgression);
  assert.deepEqual(furnaceHandlingRead(f.state), { lineClass: 'I', limitT: 20, podMassT: 40, overclass: true });
  assert.match(furnaceWorksiteFocus(f.mission, f.state).reason, /40 t.*Class I.*20 t.*overheats and snaps.*Do not attempt a long tow/);
  const choice = furnaceDetailChoices(f.state, 'station_ceres', host)[0];
  assert.equal(choice.label, 'My Line is rated for 20 t. Those pods are 40 t.');
  assert.match(answer(f).text, /40 t.*20 t.*no Line Class upgrade for sale.*has not agreed to tow/);
  assert.equal(JSON.stringify(f.state.lineProgression), before);
  f.state.ui.docked = false; const lines = []; f.bus.on('comms:popup', e => lines.push(e));
  f.intake.update(); assert.match(lines[0].text, /40 t.*Class I.*20 t.*Do not attempt a long tow/);
  clearMiteSites(f); f.state.simTime += 13; f.intake.update();
  assert.match(lines.at(-1).text, /40 t.*Class I.*20 t.*Do not attempt a long tow/);
  assert.doesNotMatch(lines.at(-1).text, /Tow a marked pod/);
  f.state.lineProgression.tonnageLoggedT = 2000; berth(f);
  assert.deepEqual(furnaceHandlingRead(f.state), { lineClass: 'II', limitT: 100, podMassT: 40, overclass: false });
  assert.match(furnaceDetailReply({ state: f.state, bus: f.bus }, 'station_ceres', host, choice.id).text, /not the current record/);
  assert.match(answer(f).text, /40 t, within your Line Class II rating of 100 t/);
});
