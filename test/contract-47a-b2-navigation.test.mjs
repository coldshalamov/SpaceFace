import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { STORY_BEATS } from '../src/data/missions.js';
import { createCampaign47aState } from '../src/story/campaign47a/campaignSchema.js';
import { missions, CONTRACT_47A_B2_TAG } from '../src/systems/missions.js';
import { missionMapAction, recommendedActions, missionLogScreen } from '../src/ui/screens/missionLog.js';
import { resolveHudNavStation } from '../src/ui/hud.js';
import { resolveWaypointPresentationPosition } from '../src/ui/navigationWaypoint.js';
import { applyMapOpenIntentToView, resolveMapOpenTarget } from '../src/ui/galaxyMap.js';
import { MAP_FOCUS, openGalaxyMap, takeMapOpenIntent } from '../src/ui/mapAuthority.js';
import { ensurePadWalkDocument } from '../scripts/lib/pq16400-gamepad-screens.mjs';

const CHARON = 'sector_charon_expanse';
const TETHYS = 'sector_tethys_junction';
const TETHYS_STATION = 'station_tethys';
const ELROY_STATION = 'station_expanse';
const ELROY_ID = 'npc_elroy';
const ELROY_ROLE = 'register_mark';

// Exercise the same station-first priority block used by updateObjectiveArrow, not a retyped
// approximation. The test also calls the production station resolver and waypoint presenter.
const hudSource = readFileSync(new URL('../src/ui/hud.js', import.meta.url), 'utf8');
const arrowAt = hudSource.indexOf('  function updateObjectiveArrow(p, slow) {');
const hudStart = hudSource.indexOf('    if (state.nav && state.nav.waypoint) {', arrowAt);
const hudEnd = hudSource.indexOf('    if (!wp && m)', hudStart);
assert.ok(arrowAt >= 0 && hudStart > arrowAt && hudEnd > hudStart, 'HUD waypoint consumer seam exists');
const consumeHudWaypoint = Function('resolveHudNavStation', 'resolveWaypointPresentationPosition',
  'return function(state) {'
    + ' const resolveNavStation = (nw) => resolveHudNavStation(state, nw.stationId);'
    + ' let wp = null, wpLabel = null, navMeta = null;'
    + hudSource.slice(hudStart, hudEnd)
    + ' return { pos: wp, label: wpLabel };'
    + '};'
)(resolveHudNavStation, resolveWaypointPresentationPosition);
const missionLogSource = readFileSync(new URL('../src/ui/screens/missionLog.js', import.meta.url), 'utf8');
const decoderStart = missionLogSource.indexOf('function mapOpenIntentFromButton(btn) {');
const decoderEnd = missionLogSource.indexOf('\nfunction openMapScreen', decoderStart);
assert.ok(decoderStart >= 0 && decoderEnd > decoderStart, 'Mission Log button decoder seam exists');
const decodeMissionLogMapButton = Function('MAP_FOCUS',
  missionLogSource.slice(decoderStart, decoderEnd) + ';return mapOpenIntentFromButton;'
)(MAP_FOCUS);

function addStation(state, id, x, z, name) {
  const entity = {
    id: `entity:${id}`, type: 'station', alive: true, pos: { x, z },
    data: { stationId: id, name },
  };
  state.entities.set(entity.id, entity);
  state.entityList.push(entity);
  return entity;
}

function setup({ completedBookSteps = ['cinder_board', 'compost', 'nest'] } = {}) {
  const state = createGameState(4747);
  state.world.currentSectorId = TETHYS;
  state.story.beatIndex = 2;
  state.story.campaign47a = createCampaign47aState();
  if (completedBookSteps.length) {
    state.story.campaign47a.stepProgress['2'] = {
      completed: completedBookSteps.slice(), updatedAtS: 12,
    };
  }
  state.onboarding = { active: false, finished: true };
  state.settings.gameplay.tutorialHints = false;

  const player = {
    id: state.playerId, type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    data: { ai: {} },
  };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  addStation(state, TETHYS_STATION, 0, 0, 'Tethys Junction');
  addStation(state, ELROY_STATION, 880, -640, 'Expanse Refinery');
  addStation(state, 'station_helios', -100, 40, 'Helios Station');

  let nextEntityId = 9000;
  const helpers = {
    player: () => player,
    spawnEntity(spec) {
      const entity = {
        ...spec,
        id: nextEntityId++,
        alive: true,
        pos: { ...spec.pos },
        vel: { ...(spec.vel || { x: 0, z: 0 }) },
        data: structuredClone(spec.data || {}),
      };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
  const bus = createBus();
  const owner = Object.create(missions);
  owner.init({ state, bus, helpers, registry: { get: () => null } });
  return { state, bus, owner, player };
}

function openElroyWrit() {
  const h = setup();
  h.owner.ensureBoard(TETHYS_STATION);
  const board = h.state.missions.boards[TETHYS_STATION];
  assert.ok(board.slots.some((offer) => offer.storyTag === CONTRACT_47A_B2_TAG),
    'completed Cinder/Compost/Nest records make the authored Registry Writ the next board job');

  // The live departure hook accepts and tracks the normal authored board offer.
  h.bus.emit('dock:undocked', { stationId: TETHYS_STATION });
  const mission = h.state.missions.active.find((candidate) => (
    candidate && candidate.storyTag === CONTRACT_47A_B2_TAG
  ));
  assert.ok(mission, 'normal Tethys departure accepts the next Registry Writ');
  assert.equal(mission.type, 'bounty_hunt', 'the live Registry Writ is the authored bounty, not pod rescue');
  assert.equal(mission.storyTarget.id, ELROY_ID);
  assert.equal(mission.storyTarget.role, ELROY_ROLE);
  assert.equal(mission.destStationId, ELROY_STATION);

  h.state.world.currentSectorId = CHARON;
  h.bus.emit('sector:enter', { sectorId: CHARON });
  assert.equal(mission.targetEntityIds.length, 1, 'the actual sector-entry path spawns the one marked hull');
  const target = h.state.entities.get(mission.targetEntityIds[0]);
  assert.ok(target && target.alive !== false);
  return { ...h, mission, target };
}

function expectedSearchFix(state) {
  const wp = state.nav.waypoint;
  assert.equal(wp.stationId, null);
  assert.equal(wp.targetEntityId, null);
  assert.match(wp.label, /Ashfall Approach.*search/i);
  assert.match(wp.reason, /No verified contact|Travel to Charon/i);
  assert.doesNotMatch(wp.reason, /Expanse Refinery/);
  return wp;
}

function hudPosition(state) {
  return consumeHudWaypoint(state).pos;
}

function checkMapIntent(state, mission, expectedPos, focus = 'local') {
  const action = missionMapAction(state, mission, true);
  assert.ok(action, 'the focused Registry Writ has a map action');
  assert.equal(action.focus, focus);
  assert.equal(action.stationId, null, 'the valid Elroy route is not anchored to the refinery');
  assert.equal(action.missionId, null, 'missionId must not make galaxyMap backfill destStationId');
  assert.equal(action.suppressMissionId, true);
  assert.deepEqual(action.pos, expectedPos);
  assert.equal(resolveMapOpenTarget(state, action), null,
    'the real map resolver selects no receiving berth when this is a target/search fix');
  if (expectedPos) {
    const view = { cams: { local: { cx: 0, cy: 0, zoom: 1 }, system: { cx: 0, cy: 0, zoom: 1 }, galaxy: { cx: 0, cy: 0, zoom: 1 } } };
    applyMapOpenIntentToView(view, action, state);
    if (focus === 'local') assert.deepEqual([view.cams.local.cx, view.cams.local.cy], [expectedPos.x, expectedPos.z]);
  }
  return action;
}

function clickContext(state) {
  const pushed = [];
  return {
    state,
    bus: createBus(),
    screenManager: { pushScreen(id) { pushed.push(id); }, top() { return 'missionLog'; } },
    pushed,
  };
}

function releaseMountedRoot(root) {
  if (typeof missionLogScreen.unmount === 'function') missionLogScreen.unmount();
  else if (typeof missionLogScreen.onHide === 'function') missionLogScreen.onHide();
  root.remove();
}

test('the B2 story waypoint remains at Tethys for Cinder marks and later the Registry Writ', () => {
  const initial = setup({ completedBookSteps: [] });
  const cinder = initial.owner._storyWaypointForBeat(STORY_BEATS[2]);
  assert.equal(cinder.stationId, TETHYS_STATION);
  assert.equal(cinder.label, 'Tethys board — Cinder marks');
  assert.match(cinder.reason, /accept Cinder marks.*before flying to Charon/i);

  const afterNest = setup();
  const writBoard = afterNest.owner._storyWaypointForBeat(STORY_BEATS[2]);
  assert.equal(writBoard.stationId, TETHYS_STATION,
    'the authored route returns to the Tethys board before Elroy; it does not jump directly from Ceres');
  assert.equal(writBoard.label, 'Tethys board — Registry Writ');
  assert.match(writBoard.reason, /read the next writ.*scan before choosing/i);
});

test('the dispatched B2 Elroy target owns HUD and Mission Log map focus before and after scan', () => {
  const { state, bus, owner, mission, target, player } = openElroyWrit();
  owner._refreshTrackedMissionNav(mission);
  const waypoint = state.nav.waypoint;
  assert.equal(waypoint.stationId, null);
  assert.equal(waypoint.label, '47-A Signal');
  assert.equal(waypoint.targetEntityId, target.id);
  assert.deepEqual(waypoint.pos, target.pos);
  assert.match(waypoint.reason, /Scan the marked vessel before acting/);

  // Demonstrate the former actual-consumer result: the registered HUD station resolver returns
  // the refinery and the HUD's station-first block preferred that position over the live target.
  assert.deepEqual(resolveHudNavStation(state, ELROY_STATION).pos, { x: 880, z: -640 });
  const oldRoute = { ...waypoint, stationId: ELROY_STATION };
  state.nav.waypoint = oldRoute;
  assert.deepEqual(hudPosition(state), { x: 880, z: -640 });
  // The resolver's actual mission-id fallback is the station that caused the chart mismatch.
  assert.equal(resolveMapOpenTarget(state, { missionId: mission.id, stationId: ELROY_STATION,
    sectorId: CHARON, pos: target.pos }).stationId, ELROY_STATION);

  owner._refreshTrackedMissionNav(mission);
  assert.deepEqual(hudPosition(state), target.pos,
    'HUD updateObjectiveArrow now follows the validated target, not the refinery');
  const map = checkMapIntent(state, mission, target.pos);
  assert.deepEqual(map.pos, target.pos);

  // Movement is resolved through the waypoint's durable presentation bind, not a frozen spawn fix.
  target.pos.x += 137;
  target.pos.z -= 83;
  assert.deepEqual(hudPosition(state), target.pos);
  assert.deepEqual(missionMapAction(state, mission, true).pos, target.pos,
    'Mission Log re-resolves the current target position when it builds the map action');

  player.pos = { x: target.pos.x + 10, z: target.pos.z + 10 };
  state.player.targetId = target.id;
  bus.emit('scan:completed', { targetId: target.id });
  assert.equal(mission.params.investigationStage, 'identified', 'the normal scanner event identifies the live writ');
  assert.match(state.nav.waypoint.reason, /Choose: fire to close the tag, or reel Elroy inside sixty/);
  assert.equal(state.nav.waypoint.label, 'Elroy');
  assert.deepEqual(hudPosition(state), target.pos);
  const identifiedAction = checkMapIntent(state, mission, target.pos);
  assert.deepEqual(identifiedAction.pos, target.pos);

  // The actual Mission Log CTA encodes/decodes through the screen's normal map handoff.
  ensurePadWalkDocument();
  const ctx = clickContext(state);
  const root = document.createElement('div');
  document.body.appendChild(root);
  const pinBeforeReader = JSON.stringify(state.nav.waypoint);
  missionLogScreen.mount(root, ctx);
  const button = root.querySelector('.sf-mlog-btn-map[data-act="openMap"]');
  assert.ok(button, 'the real focused Mission Log card exposes its map handoff');
  assert.equal(button.hasAttribute('data-mid'), false,
    'a target-only map handoff must not smuggle missionId back into map resolver station fallback');
  assert.equal(button.getAttribute('data-map-sector-id'), CHARON);
  assert.equal(button.getAttribute('data-map-station-id'), null);
  assert.deepEqual({
    x: Number(button.getAttribute('data-map-pos-x')),
    z: Number(button.getAttribute('data-map-pos-z')),
  }, target.pos);
  const intent = decodeMissionLogMapButton(button);
  assert.equal(intent.missionId, null, 'the actual Mission Log decoder honors stationless target suppression');
  assert.equal(intent.stationId, null);
  assert.equal(intent.sectorId, CHARON);
  assert.deepEqual(intent.pos, target.pos);
  assert.equal(openGalaxyMap(ctx, intent), true, 'the ordinary map authority accepts the decoded handoff');
  assert.deepEqual(ctx.pushed, ['galaxyMap']);
  const openedIntent = takeMapOpenIntent(state);
  assert.equal(openedIntent.missionId, null);
  assert.equal(openedIntent.stationId, null);
  assert.equal(openedIntent.sectorId, CHARON);
  assert.deepEqual(openedIntent.pos, target.pos);
  const mapView = { cams: { local: { cx: 0, cy: 0, zoom: 1 }, system: { cx: 0, cy: 0, zoom: 1 }, galaxy: { cx: 0, cy: 0, zoom: 1 } } };
  applyMapOpenIntentToView(mapView, openedIntent, state);
  assert.deepEqual([mapView.cams.local.cx, mapView.cams.local.cy], [target.pos.x, target.pos.z]);
  assert.equal(JSON.stringify(state.nav.waypoint), pinBeforeReader,
    'reading/opening the map does not rewrite the persistent navigation waypoint');
  assert.equal(resolveMapOpenTarget(state, intent), null);
  releaseMountedRoot(root);
});

test('missing, dead, recycled, wrong-identity, and malformed Elroy contacts become Ashfall search guidance', () => {
  const mutations = [
    { label: 'missing', apply: ({ mission }) => { mission.targetEntityIds = []; } },
    { label: 'dead', apply: ({ target }) => { target.alive = false; } },
    { label: 'recycled entity id', apply: ({ state, target }) => {
      state.entities.set(target.id, { id: target.id, type: 'ship', alive: true,
        pos: { x: 200, z: 300 }, data: { name: 'Recycled hull' } });
    } },
    { label: 'wrong story identity', apply: ({ target }) => { target.data.storyTargetId = 'npc_other'; } },
    { label: 'wrong authored role', apply: ({ target }) => { target.data.storyTargetRole = 'board_writ'; } },
    { label: 'wrong mission owner', apply: ({ mission, target }) => { target.data.missionTag = 'other'; target.data.missionId = 'other'; } },
    { label: 'wrong slot', apply: ({ target }) => { target.data.missionTargetSlot = 1; } },
    { label: 'non-finite position', apply: ({ target }) => { target.pos.x = Infinity; } },
    { label: 'foreign sector provenance', apply: ({ target }) => { target.data.homeSectorId = 'sector_ceres_belt'; } },
  ];
  for (const entry of mutations) {
    const h = openElroyWrit();
    entry.apply(h);
    h.owner._refreshTrackedMissionNav(h.mission);
    const wp = expectedSearchFix(h.state);
    assert.ok(wp.pos && Number.isFinite(wp.pos.x) && Number.isFinite(wp.pos.z), `${entry.label}: authored search zone is a finite fix`);
    assert.deepEqual(hudPosition(h.state), wp.pos, `${entry.label}: HUD points to search guidance, not station`);
    checkMapIntent(h.state, h.mission, wp.pos);
  }
});

test('off-sector B2 gives sector/search guidance and terminal B2 publishes no route', () => {
  const h = openElroyWrit();
  h.state.world.currentSectorId = TETHYS;
  h.owner._refreshTrackedMissionNav(h.mission);
  const wp = expectedSearchFix(h.state);
  assert.equal(wp.sectorId, CHARON);
  assert.equal(wp.pos, null, 'never project Charon world coordinates into the Tethys local view');
  const action = checkMapIntent(h.state, h.mission, null, 'galaxy');
  assert.equal(action.sectorId, CHARON);
  assert.equal(action.stationId, null);

  h.mission.status = 'completed';
  assert.equal(h.owner._missionWaypoint(h.mission), null, 'terminal mission has no live B2 waypoint');
  h.owner._clearMissionNav(h.mission.id);
  assert.equal(h.state.nav.waypoint, null);
});

test('Continue-adopted slot-zero Elroy survives a runtime-id change without exposing a recycled occupant', () => {
  const h = openElroyWrit();
  const restored = {
    ...h.target,
    id: h.target.id + 100,
    pos: { ...h.target.pos },
    data: structuredClone(h.target.data),
  };
  h.state.entities.delete(h.target.id);
  h.state.entityList = h.state.entityList.filter((entity) => entity.id !== h.target.id);
  h.state.entities.set(restored.id, restored);
  h.state.entityList.push(restored);
  h.mission.targetEntityIds = [];
  h.bus.emit('save:loaded', {});
  assert.deepEqual(h.mission.targetEntityIds, [restored.id], 'real restore adoption rebinds the durable owned slot');
  assert.equal(h.state.nav.waypoint.targetEntityId, restored.id);
  assert.equal(h.state.nav.waypoint.stationId, null);
  assert.deepEqual(hudPosition(h.state), restored.pos);

  // A second, same-runtime-id occupant without the original durable/story identity cannot inherit it.
  restored.data.storyTargetId = 'npc_someone_else';
  h.owner._refreshTrackedMissionNav(h.mission);
  expectedSearchFix(h.state);
});

test('Mission Log map anchors retain explicit destination/return stations when no stationless fix owns them', () => {
  const h = setup({ completedBookSteps: [] });
  const ordinary = {
    id: 'ordinary-delivery', status: 'active', type: 'cargo_delivery',
    destStationId: TETHYS_STATION, destSectorId: TETHYS,
  };
  h.state.missions.active = [ordinary];
  h.state.world.currentSectorId = TETHYS;
  h.state.nav.waypoint = { kind: 'mission', missionId: ordinary.id,
    sectorId: TETHYS, stationId: TETHYS_STATION };
  const action = missionMapAction(h.state, ordinary, true);
  assert.equal(action.stationId, TETHYS_STATION);
  assert.equal(action.missionId, ordinary.id);
  assert.equal(resolveMapOpenTarget(h.state, action).stationId, TETHYS_STATION);

  // The B1 replacement-cargo phase uses its actual origin station, Helios, not the destination
  // Tethys berth and not a stationless target fix.
  const b1Return = {
    id: 'b1-return', status: 'active', type: 'cargo_delivery', storyTag: 'campaign47a:b1:honest_work',
    stationId: 'station_helios', destStationId: TETHYS_STATION, destSectorId: TETHYS,
    params: { cargoRecoveryNeeded: true },
  };
  h.state.missions.active = [b1Return];
  h.state.world.currentSectorId = 'sector_helios_prime';
  h.state.nav.waypoint = h.owner._missionWaypoint(b1Return);
  assert.equal(h.state.nav.waypoint.stationId, 'station_helios');
  const returnAction = missionMapAction(h.state, b1Return, true);
  assert.equal(returnAction.stationId, 'station_helios');
  assert.equal(returnAction.missionId, b1Return.id);
  assert.equal(resolveMapOpenTarget(h.state, returnAction).stationId, 'station_helios');

  const coldStart = {
    id: 'b0-return', status: 'active', type: 'salvage_retrieval',
    destStationId: 'station_helios', destSectorId: 'sector_helios_prime',
  };
  h.state.missions.active = [coldStart];
  h.state.world.currentSectorId = 'sector_helios_prime';
  h.state.nav.waypoint = null;
  const b0Action = missionMapAction(h.state, coldStart, true);
  assert.equal(b0Action.stationId, 'station_helios');
  assert.equal(b0Action.missionId, coldStart.id);
  assert.equal(resolveMapOpenTarget(h.state, b0Action).stationId, 'station_helios');

  const scaleState = createGameState(4747);
  scaleState.world.currentSectorId = TETHYS;
  scaleState.story.beatIndex = 1;
  scaleState.story.campaign47a = createCampaign47aState();
  scaleState.story.campaign47a.stepProgress['1'] = { completed: ['alloy_run'], updatedAtS: 12 };
  const scaleActions = recommendedActions(scaleState, [], null);
  assert.match(scaleActions[0].title, /Scale 4|Weigh-In/i,
    'the existing Scale 4 Mission Log fallback remains the same reader');
});
