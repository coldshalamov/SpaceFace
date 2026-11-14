import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameState} from '../src/core/gameState.js';
import {createBus} from '../src/core/eventBus.js';
import {missions} from '../src/systems/missions.js';
import {createFurnaceIntake} from '../src/systems/furnaceIntake.js';
import {buildMissionBoardContract} from '../src/story/campaign47a/embodiedMissions.js';
import {createCampaign47aState} from '../src/story/campaign47a/campaignSchema.js';
import {FURNACE_INTAKE} from '../src/data/furnace.js';
import {FURNACE_MITE_KEYS,FURNACE_HAULER_LOCAL,furnaceLots,furnaceLotSpec,furnaceMouthGlobal} from '../src/missions/furnaceWorksite.js';
import {syncFurnaceWorksite} from '../src/missions/furnaceWorksiteRuntime.js';
import {furnaceDetailRead,furnaceReceiptLine} from '../src/missions/furnaceArrivalScene.js';
import {sectorLocalToGlobalForSector} from '../src/data/sectorCoordinates.js';
import {FURNACE_CAPSTAN} from '../src/missions/furnaceCapstan.js';

function authorFurnaceOffer(state) {
  const offer = buildMissionBoardContract(1, { seed: 23, epoch: 0, state: { story: state.story } });
  assert.ok(offer);
  assert.equal(offer.storyTag, 'campaign47a:b1:infested');
  return offer;
}

function liveWorksite() {
  const state = createGameState(23);
  state.story = { beatIndex: 1, branch: null, flags: {}, campaign47a: createCampaign47aState() };
  state.story.campaign47a.stepProgress['1'] = { completed: ['alloy_run', 'scale_4'], updatedAtS: 0 };
  state.missions = { active: [], nextId: 1, boards: {}, completedLog: [], receipts: [] };
  state.world.currentSectorId = 'sector_ceres_belt';
  state.world.alienEcology = { sites: { closed_refinery: { deadFauna: {} } } };
  state.run = { kind: 'adventure' };
  state.mode = 'flight';
  state.simTime = 100;

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
  return { state, bus, owner, mission, intake, helpers };
}

function pilot(f, pos) {
  const e = { id: 'pilot', alive: true, type: 'ship', pos: pos || { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  f.state.entities.set(e.id, e);
  f.state.entityList.push(e);
  f.state.playerId = e.id;
  return e;
}

function clearMiteSites(f) {
  const deadFauna = f.state.world.alienEcology.sites.closed_refinery.deadFauna;
  for (const key of FURNACE_MITE_KEYS) deadFauna[key] = true;
  syncFurnaceWorksite(f.owner, f.mission);
}

const haulerPos = () => sectorLocalToGlobalForSector(FURNACE_HAULER_LOCAL, FURNACE_INTAKE.sectorId);
const mouthBeacons = f => f.state.entityList.filter(e => e.alive && e.data?.furnaceIntake === true);
const gantries = f => f.state.entityList.filter(e => e.alive && e.data?.furnaceCapstanId === FURNACE_CAPSTAN.id);

test('arrival line fires once near the worksite and survives reinit; no duplicate mouth marker', () => {
  const f = liveWorksite();
  const lines = [];
  f.bus.on('comms:popup', p => lines.push(p));
  const p = pilot(f, { x: 0, z: 0 });
  f.intake.update(0.016);
  assert.equal(lines.filter(x => x.id === 'furnace_detail_arrival').length, 0);
  p.pos = haulerPos();
  f.intake.update(0.016);
  const heard = lines.filter(x => x.id === 'furnace_detail_arrival');
  assert.equal(heard.length, 1);
  assert.match(heard[0].text, /quarantine worksite/i);
  // Repeated ticks and a full owner reinit keep the once-per-job mark.
  f.intake.update(0.016);
  f.intake.init({ state: f.state, bus: f.bus, helpers: f.helpers });
  f.intake.update(0.016);
  assert.equal(lines.filter(x => x.id === 'furnace_detail_arrival').length, 1);
  // Exactly one mouth beacon — the arrival adds no second marker of its own.
  assert.equal(mouthBeacons(f).length, 1);
});

test('docked or far player hears nothing; detail read reports live lot counts', () => {
  const f = liveWorksite();
  const lines = [];
  f.bus.on('comms:popup', p => lines.push(p));
  const p = pilot(f, haulerPos());
  f.state.ui.docked = true;
  f.intake.update(0.016);
  assert.equal(lines.filter(x => x.id === 'furnace_detail_arrival').length, 0);
  f.state.ui.docked = false;
  const read = furnaceDetailRead(f.state);
  assert.equal(read.active, true);
  assert.equal(read.received, 0);
  assert.equal(read.lost, 0);
  assert.equal(read.pending, 3);
  assert.equal(read.cleared, 0);
  f.intake.update(0.016);
  assert.equal(lines.filter(x => x.id === 'furnace_detail_arrival').length, 1);
});

test('validated marked pods suppress the generic burn voice; rock and malformed lots keep it', () => {
  const f = liveWorksite();
  const lines = [], toasts = [];
  pilot(f);
  f.bus.on('comms:popup', p => lines.push(p));
  f.bus.on('toast', p => toasts.push(p));
  clearMiteSites(f);
  f.intake.update(0.016);
  // Ordinary rock: the yard's generic burn line.
  const rock = { id: 'rock', alive: true, type: 'asteroid', pos: furnaceMouthGlobal(), data: {} };
  f.state.entities.set(rock.id, rock);
  f.state.entityList.push(rock);
  f.intake.update(0.016);
  assert.match(lines.find(x => x.id === 'furnace_fed_rock').text, /yard burns/);
  // Marked pod: the ledger callout speaks, the generic popup stays silent.
  const lot = f.mission.params.furnaceLots[0];
  const pod = f.state.entities.get(lot.entityId);
  pod.pos = furnaceMouthGlobal();
  f.intake.update(0.016);
  assert.equal(lines.some(x => x.id === `furnace_fed_${pod.id}`), false);
  assert.match(toasts.find(x => /Quarantine lot 1/.test(x.text)).text, /1\/3/);
});

test('furnaceReceiptLine reads the slip before the ledger marks it; forgery returns null', () => {
  const f = liveWorksite();
  clearMiteSites(f);
  const lot = f.mission.params.furnaceLots[0];
  const pod = f.state.entities.get(lot.entityId);
  pod._furnaceTaken = true;
  const line = furnaceReceiptLine(f.state, pod);
  assert.match(line, /pod 1 received — 1\/3/);
  // A pod wearing another mission's stamps is not this slip's cargo.
  pod.data.furnaceMissionId = 'mission-other';
  assert.equal(furnaceReceiptLine(f.state, pod), null);
});

test('gantry appears only with the receiving leg and only once; sector exit removes it', () => {
  const f = liveWorksite();
  pilot(f);
  f.intake.update(0.016);
  assert.equal(gantries(f).length, 0); // mite leg: no winch yet
  clearMiteSites(f);
  f.bus.emit('mission:updated', { missionId: f.mission.id });
  assert.equal(gantries(f).length, 1);
  const g = gantries(f)[0];
  assert.equal(g.type, 'fx');
  assert.equal(Math.hypot(g.pos.x - furnaceMouthGlobal().x, g.pos.z - furnaceMouthGlobal().z) < 1, true);
  assert.equal(g.data.tetherable, false);
  assert.equal(g.data.masslineTetherable, false);
  assert.equal(g.data.combatProfileId, 'combat_profile_tether_anchor');
  // Reinit on the same state does not mint a second gantry.
  f.intake.init({ state: f.state, bus: f.bus, helpers: f.helpers });
  assert.equal(gantries(f).length, 1);
  // Out of sector the yard hardware is stowed.
  f.state.world.currentSectorId = 'sector_helios_prime';
  f.bus.emit('sector:enter', { sectorId: 'sector_helios_prime' });
  assert.equal(gantries(f).length, 0);
});

test('detail read refuses malformed ledgers and duplicate authored jobs', () => {
  const f = liveWorksite();
  f.mission.params.furnaceLots[0].received = true;
  f.mission.params.furnaceLots[0].lost = true;
  assert.equal(furnaceDetailRead(f.state), null);
  const f2 = liveWorksite();
  const dup = { ...f2.mission, id: 'mission-dup', params: { ...f2.mission.params } };
  f2.state.missions.active.push(dup);
  assert.equal(furnaceDetailRead(f2.state), null);
});
