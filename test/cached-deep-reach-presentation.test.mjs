import assert from 'node:assert/strict';
import test from 'node:test';
import { deepReachBriefing } from '../src/story/campaign47a/deepReachBriefing.js';
import { getDeepReachOperation } from '../src/story/campaign47a/embodiedMissions.js';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { missions as missionsProto } from '../src/systems/missions.js';

const EXPECTED = Object.freeze({
  custody: Object.freeze({
    branch: 'patrol', stationId: 'station_ashcache', type: 'authored_set_piece',
    program: 'patrol_guard', variant: 'ashfall_blockade',
    verb: 'jam', methods: ['park_the_hulk', 'swing_the_wedge'],
  }),
  force: Object.freeze({
    branch: 'traders', stationId: 'station_ashcache', type: 'demolition',
    program: 'mine_to_depot', variant: 'ashfall_siege',
    verb: 'knock_down', methods: ['wrecking_ball', 'cut_down'],
  }),
  free: Object.freeze({
    branch: 'free', stationId: 'station_ashcache', type: 'tow_recovery',
    program: 'mine_to_depot', variant: 'ashfall_evidence_tow',
    verb: 'tow', methods: ['tow_in', 'sling_in'], elroy: 'force',
  }),
});

function harness(outcome) {
  const expected = EXPECTED[outcome];
  const state = createGameState(outcome === 'custody' ? 481 : 482);
  state.mode = 'flight';
  state.simTime = 80;
  state.playerId = 1;
  state.player.credits = 100_000;
  state.settings.gameplay.tutorialHints = false;
  state.onboarding = { active: false, finished: true };
  state.world.currentSectorId = 'sector_helios_prime';
  state.factions.faction_scn = { ...(state.factions.faction_scn || {}), rep: 100 };
  state.factions.faction_mts = { ...(state.factions.faction_mts || {}), rep: 100 };
  state.factions.faction_free = { ...(state.factions.faction_free || {}), rep: 100 };

  let nextId = 40;
  const player = { id: 1, type: 'ship', alive: true, team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  state.entities.set(player.id, player);
  const bus = createBus();
  const credits = [];
  bus.on('economy:grantCredits', (payload) => credits.push(payload));
  const helpers = {
    hash32,
    mulberry32,
    player: () => player,
    voice: { say: () => true },
    spawnEntity: (spec) => {
      const entity = { ...spec, id: nextId++, alive: true, pos: { ...spec.pos }, vel: spec.vel || { x: 0, z: 0 } };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
  const missions = Object.assign({}, missionsProto);
  missions.init({ state, bus, helpers, registry: { get: () => null } });
  missions.newGame();
  state.missions.active = [];
  state.ui.trackedMissionId = null;
  state.nav.waypoint = null;
  state.story.beatIndex = 7;
  state.story.branch = expected.branch;
  state.story.flags.elroy_outcome = expected.elroy || outcome;
  state.story.flags.proving_ground_complete = true;
  state.story.flags.empire_seed_complete = true;
  state.story.flags.empire_seed_asset_id = 'seed-2';
  state.story.flags.empire_seed_variant = outcome === 'custody' ? 'custody_watch' : 'force_logistics';
  missions._syncCampaignSidecarAfterAdvance();
  missions._refreshNavigation({ forceStory: true, silent: true });
  return { state, bus, missions, credits, expected };
}

function operationOffer(h) {
  const board = h.missions.ensureBoard(h.expected.stationId);
  const offer = board.slots.find((row) => String(row.storyTag || '').startsWith('campaign47a:b7:'));
  assert.ok(offer, 'Deep Reach operation is physically posted');
  assert.equal(offer.type, h.expected.type);
  assert.equal(offer.params.physicalVerb, h.expected.verb);
  assert.deepEqual(offer.params.completionMethods, h.expected.methods);
  assert.equal(offer.params.assetId, h.state.story.flags.empire_seed_asset_id);
  return offer;
}

function acceptOperation(h) {
  const offer = operationOffer(h);
  assert.equal(h.missions.acceptMission(offer.id), true);
  return h.state.missions.active.find((row) => row.storyTag === offer.storyTag);
}

const copy = value => structuredClone(value);
const withoutCopy = ({title, brief, ...terms}) => terms;
function cachedOffer(outcome = 'custody') {
  const h = harness(outcome), offer = operationOffer(h);
  offer.title = 'ASHFALL: SLUNG CORE'; offer.brief = 'OLD BRIEF';
  offer.params.reckoning = { rows: [{id:'b3_sling_in', mass:96, kind:'core'}], bodies: {historical:123} };
  offer.reward_cr = 2345; offer.collateral_cr = 78; offer.expiresAtEpoch = 987;
  return {h, offer, board:h.state.missions.boards[h.expected.stationId]};
}
for (const outcome of ['custody','force','free']) test(`cached ${outcome} copy refreshes without changing terms or parameter identity`, () => {
  const {h, offer, board} = cachedOffer(outcome), terms = withoutCopy(copy(offer)), params = offer.params;
  const rows = params.reckoning.rows, bodies = params.reckoning.bodies;
  h.state.story.campaign47a.flags.spine = {v:1,solved:{'6':{asset:'trader'}}};
  const expected = deepReachBriefing(getDeepReachOperation(outcome, h.expected.branch), rows);
  assert.equal(h.missions._syncEmbodiedStoryOffer({id:h.expected.stationId}, board, 900), true);
  const refreshed = board.slots.find(row=>row.id===offer.id);
  assert.equal(refreshed.title, expected.title.toUpperCase()); assert.equal(refreshed.brief, expected.brief);
  assert.doesNotMatch(refreshed.brief,/trader ballast/);
  assert.deepEqual(withoutCopy(refreshed), terms); assert.equal(refreshed.params, params);
  assert.equal(refreshed.params.reckoning.rows, rows); assert.equal(refreshed.params.reckoning.bodies, bodies);
  const snapshot = copy(board);
  for(let i=0;i<3;i++) assert.equal(h.missions._syncEmbodiedStoryOffer({id:h.expected.stationId},board,901+i),false);
  assert.deepEqual(board,snapshot); assert.equal(board.slots.find(row=>row.id===offer.id),refreshed);
});
test('active accepted operation and same-tag cached row remain untouched',()=>{
  const {h,offer,board}=cachedOffer();
  const active={...copy(offer),status:'active'}; h.state.missions.active.push(active);
  const before=copy(active), cached=copy(offer);
  assert.equal(h.missions._syncEmbodiedStoryOffer({id:h.expected.stationId},board,900),false);
  assert.deepEqual(active,before);assert.deepEqual(board.slots.find(row=>row.id===offer.id),cached);
  assert.equal(h.state.missions.active[0],active);
});
for(const [field,value] of [['source','other'],['stationId','other'],['type','other'],['storyOperation','other'],['destStationId','other'],['destSectorId','other'],['assetId','other']]) test(`mismatching cached ${field} is not rewritten`,()=>{
  const {h,offer,board}=cachedOffer();if(field==='assetId')offer.params.assetId=value;else offer[field]=value;
  const before=copy(offer);
  assert.equal(h.missions._syncEmbodiedStoryOffer({id:h.expected.stationId},board,900),false);
  assert.deepEqual(board.slots.find(row=>row.id===offer.id),before);
});
test('legacy absent callbacks do not invent current callback pieces',()=>{
 const {h,offer,board}=cachedOffer();delete offer.params.reckoning;
 const params=offer.params;
 assert.equal(h.missions._syncEmbodiedStoryOffer({id:h.expected.stationId},board,900),true);
 const fresh=board.slots.find(row=>row.id===offer.id);assert.equal(fresh.params,params);assert.equal(fresh.params.reckoning,undefined);assert.doesNotMatch(fresh.brief,/Nearby:/);
});
