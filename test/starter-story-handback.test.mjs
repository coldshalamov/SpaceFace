import test from 'node:test';
import assert from 'node:assert/strict';
import { kesslerStarterWorkReply as reply } from '../src/ui/station/starterWorkdayConversation.js';
import { STARTER_JOBS } from '../src/data/starterJobs.js';
import { objectiveText } from '../src/ui/sim/missionRecap.js';
import { buildMissionBoardContract } from '../src/story/campaign47a/embodiedMissions.js';
import { createCampaign47aState } from '../src/story/campaign47a/campaignSchema.js';
import { CONTRACT_47A_B0_TAG, CONTRACT_47A_SAMPLE_ID, missions } from '../src/systems/missions.js';

const STATION = 'station_helios';
const CHOICE = 'helios_local_work';
const HITCH = STARTER_JOBS.find((job) => job.id === 'starter_hitch');

function setup(job = HITCH) {
  return {
    ui: { docked: true, dockedStationId: STATION, trackedMissionId: 'career-bounty' },
    nav: { waypoint: { kind: 'mission', missionId: 'career-bounty', label: 'Elroy', reason: 'Track Elroy for the bounty' } },
    world: { currentSectorId: 'sector_helios_prime' },
    player: { ownedShips: [{ defId: job.shipId, fittings: [job.requiredModule] }], activeShipIndex: 0 },
    missions: { starterJobStep: { [job.id]: job.steps.length }, active: [], boards: {} },
    story: { beatIndex: 0 },
  };
}

function missionOwnerFor(state) {
  return {
    state,
    _instanceFromOffer: missions._instanceFromOffer,
    _objectiveTarget: missions._objectiveTarget,
    _typeSpawnsTargets: missions._typeSpawnsTargets,
    _chainSeed: () => null,
  };
}

function installB0Mission() {
  const state = {
    story: { beatIndex: 0, branch: null, flags: {} },
    missions: { active: [], nextId: 1 },
    ui: {}, world: { currentSectorId: 'sector_helios_prime' }, simTime: 0,
  };
  const owner = {
    ...missionOwnerFor(state),
    bus: { emit() {} },
    _tutorialOwnsOpening: () => true,
    _refreshTrackedMissionNav() {},
  };
  missions._installContract47aColdStart.call(owner);
  const mission = state.missions.active[0];
  assert.equal(mission.storyTag, CONTRACT_47A_B0_TAG);
  assert.equal(mission.params.cmdtyId, CONTRACT_47A_SAMPLE_ID);
  assert.equal(mission.params.cmdtyId, 'cmdty_47a_assay_sample');
  return mission;
}

function authorB1Mission(completedSteps = []) {
  const campaign47a = createCampaign47aState();
  if (completedSteps.length) {
    campaign47a.stepProgress['1'] = { completed: completedSteps.slice(), updatedAtS: 0 };
  }
  const story = { beatIndex: 1, branch: null, flags: {}, campaign47a };
  const offer = buildMissionBoardContract(1, { seed: 23, epoch: 0, state: { story } });
  assert.ok(offer, 'the authored B1 book should post a current contract');
  const state = { missions: { nextId: 1 }, simTime: 0 };
  return missions._instanceFromOffer.call(missionOwnerFor(state), offer);
}

function ask(state) {
  const before = JSON.stringify(state);
  const result = reply(state, STATION, CHOICE);
  assert.equal(result.missionOffer, undefined);
  assert.equal(JSON.stringify(state), before, 'a conversation must not accept, track, or advance a mission');
  return result.text;
}

for (const job of STARTER_JOBS) {
  test(`${job.id}: third local settlement hands back to the already-live B0 Helios contract without taking another pin`, () => {
    const state = setup(job);
    const mission = installB0Mission();
    state.missions.active.push(mission);
    const text = ask(state);
    assert.match(text, /Contract 47-A: Mass Variance Sample/);
    assert.match(text, /Recover the 47-A sample from the marked rock/);
    assert.match(text, /Helios Station, Helios Prime/);
    assert.match(text, /47-A keeps its own account/);
    assert.match(text, /Track that card/);
    assert.doesNotMatch(text, /Elroy|Tethys|Ceres/);
  });
}

test('shared B0 objective mirrors the real mission owner before and after recovery, never a stale pin', () => {
  const state = setup();
  const mission = installB0Mission();
  state.missions.active.push(mission);
  const waypointOwner = {
    state,
    _resolveContract47aSampleSource: () => ({ type: 'sample_site', pos: { x: 30, z: 45 } }),
    _liveStation: () => null,
  };
  const recovery = missions._missionWaypoint.call(waypointOwner, mission);
  assert.equal(objectiveText(mission), `${recovery.reason}, then deliver it to Helios Station`);
  assert.match(ask(state), /Recover the 47-A sample from the marked rock/);

  mission.params.sampleRecovered = true;
  const returnWaypoint = missions._missionWaypoint.call(waypointOwner, mission);
  assert.equal(objectiveText(mission), returnWaypoint.reason);
  assert.match(returnWaypoint.reason, /Deliver the 47-A sample to Helios Station/);
  state.nav.waypoint = returnWaypoint;
  assert.match(ask(state), /Deliver the 47-A sample to Helios Station/);

  // Even a waypoint for this mission can be stale at the same time as a phase transition.
  state.nav.waypoint = recovery;
  const current = ask(state);
  assert.match(current, /Deliver the 47-A sample to Helios Station/);
  assert.match(current, /bound for Helios Station, Helios Prime/);
  assert.doesNotMatch(current, /47-A Recovery Site|marked rock/);

  state.nav.waypoint = { kind: 'mission', missionId: 'career-bounty', label: 'Elroy', reason: 'Track Elroy for the bounty' };
  assert.doesNotMatch(ask(state), /Elroy/);
  state.nav.waypoint = null;
  assert.match(ask(state), /Deliver the 47-A sample to Helios Station/);
});

test('B1 names Tethys only for the active authored sealed-alloy mission', () => {
  const state = setup();
  const mission = authorB1Mission();
  state.story.beatIndex = 1;
  state.missions.active.push(mission);
  const text = ask(state);
  assert.equal(mission.storyTag, 'campaign47a:b1:alloy_run');
  assert.equal(mission.type, 'cargo_delivery');
  assert.ok(mission.id);
  assert.match(text, /Weigh-In — sealed alloy delivery/);
  assert.match(text, /Deliver to Tethys Trade Hub/);
  assert.match(text, /Tethys Trade Hub, Tethys Junction/);
  assert.doesNotMatch(text, /Ceres/);
});

test('B1 after Scale 4 points to Ceres only when the current furnace mission is actually active', () => {
  const state = setup();
  const mission = authorB1Mission(['alloy_run', 'scale_4']);
  state.story.beatIndex = 1;
  state.missions.active.push(mission);
  const text = ask(state);
  assert.equal(mission.storyTag, 'campaign47a:b1:infested');
  assert.equal(mission.type, 'patrol_clear');
  assert.ok(mission.id);
  assert.match(text, /Furnace Detail — the infested hauler/);
  assert.match(text, /Clear the marked repair-mite sites \(0\/4\)/);
  assert.match(text, /tow or fling the remaining marked ore pods into CR-FEED \(0\/3 received; 0 lost\)/);
  assert.match(text, /Ceres Refinery, Ceres Belt/);
  assert.doesNotMatch(text, /Tethys Trade Hub/);
  assert.doesNotMatch(text, /Clear 0\/4 hostiles/);

  // The shared card names both legs, while the live waypoint focus retains the current actor/phase.
  const ownerState = {
    missions: { active: [mission] }, entityList: [],
    world: { alienEcology: { sites: { closed_refinery: { deadFauna: {} } } } },
  };
  const worksiteWaypoint = missions._missionWaypoint.call(missionOwnerFor(ownerState), mission);
  assert.match(worksiteWaypoint.reason, /four marked repair-mite sites/);
  assert.match(worksiteWaypoint.reason, /frag blasts/);
  assert.equal(objectiveText(mission), 'Clear the marked repair-mite sites (0/4); tow or fling the remaining marked ore pods into CR-FEED (0/3 received; 0 lost)');
});

test('Scale 4 interstitial, legacy, completed, malformed, or missing mission falls back instead of inventing a route', () => {
  const cases = [
    null,
    { ...installB0Mission(), status: 'completed' },
    { ...authorB1Mission(), storyTag: 'campaign47a:b1:honest_work', campaign47aBeat: 1 }, // legacy B1
    { ...authorB1Mission(), type: 'salvage_retrieval' },
    { ...authorB1Mission(['alloy_run', 'scale_4']), destSectorId: 'sector_tethys_junction' },
    (() => {
      const furnace = authorB1Mission(['alloy_run', 'scale_4']);
      return { ...furnace, params: { ...furnace.params, furnaceWorksiteVersion: 0 } };
    })(),
    { ...installB0Mission(), id: '' },
    { ...installB0Mission(), id: undefined },
  ];
  for (const mission of cases) {
    const state = setup();
    state.story.beatIndex = 1; // beat alone is not proof of a live contract or Scale 4 step
    if (mission) state.missions.active.push(mission);
    const text = ask(state);
    assert.match(text, /47-A keeps its own account/);
    assert.match(text, /Contracts board has other work/);
    assert.doesNotMatch(text, /Helios Prime|Tethys|Ceres|Scale 4|Furnace Detail|Weigh-In/);
  }
});

test('multiple canonical active 47-A cards are ambiguous and keep the generic line', () => {
  const state = setup();
  state.missions.active.push(installB0Mission(), authorB1Mission());
  const text = ask(state);
  assert.match(text, /47-A keeps its own account/);
  assert.doesNotMatch(text, /Helios Prime|Tethys|Ceres|Weigh-In/);
});

test('an open local starter ticket still takes precedence over the story handback', () => {
  const state = setup();
  const mission = installB0Mission();
  state.missions.active.push(mission, {
    id: 'local-hitch-1', status: 'active', type: 'mining_quota',
    params: { starterJobId: HITCH.id },
  });
  const text = ask(state);
  assert.match(text, /already have a local ticket open/);
  assert.doesNotMatch(text, /Contract 47-A|Helios Prime/);
});

