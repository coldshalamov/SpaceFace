import assert from 'node:assert/strict';
import test from 'node:test';

import { input, DEFAULTS, selectedWorldSiteTarget } from '../src/systems/input.js';
import { mining } from '../src/systems/mining.js';
import { cycleTarget } from '../src/ui/uiRoot.js';

function entitiesFixture() {
  const player = { id: 1, type: 'ship', alive: true, team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, flags: {} };
  const hostile = { id: 2, type: 'ship', alive: true, team: 1, pos: { x: 80, z: 0 }, radius: 10, data: {} };
  const site = {
    id: 3, type: 'wreck', alive: true, team: 2, pos: { x: 100, z: 20 }, radius: 2, flags: {},
    data: { worldSiteTargetable: true, worldSiteId: 'world_site_helios_relay', worldSiteComponentId: 'relay_core' },
  };
  const asteroid = { id: 4, type: 'asteroid', alive: true, pos: { x: 40, z: 0 }, radius: 8, data: {} };
  return { player, hostile, site, asteroid };
}

function inputHarness(gamepad = null, touch = null) {
  const host = Object.create(input);
  host._keys = Object.create(null);
  host._ndc = { x: 0, y: 0 };
  host._screen = { x: 0, y: 0, active: false };
  host._m0 = host._m1 = host._m2 = false;
  host._lastKbmMs = 0;
  host.helpers = { raycastToPlane: () => ({ x: 100, z: 0 }) };
  host.bus = { emit() {} };
  host.gamepad = gamepad;
  host.touch = touch;
  return host;
}

function stateFixture() {
  const e = entitiesFixture();
  const entities = new Map(Object.values(e).map((entity) => [entity.id, entity]));
  return {
    ...e,
    state: {
      mode: 'flight', tick: 1, simTime: 0, playerId: 1, entities, entityList: [...entities.values()],
      settings: {}, nav: {}, ui: { screenStack: [] },
      player: { targetId: e.site.id, tether: { active: false, targetId: null } },
      input: { actions: {}, aimWorld: { x: 0, z: 0 }, mouseNdc: { x: 0, y: 0 }, pointerScreen: { x: 0, y: 0, active: false } },
    },
  };
}

test('Tab/X target cycle explicitly includes non-hostile World Site proxies', () => {
  const { state, site } = stateFixture();
  const events = [];
  const bus = { emit(name, payload) { events.push({ name, payload }); } };
  state.player.targetId = null;
  cycleTarget(state, 1, bus);
  assert.equal(state.player.targetId, site.id);
  assert.match(events.at(-1).payload.text, /target/i);
});

test('browser target cycling excludes a proxy until its presentation owner is admitted', () => {
  const { state, site } = stateFixture();
  const rootId = 'world_site_helios_relay/root';
  site.data.presentationOwnerWorldRecordId = rootId;
  const root = {
    id: 5, type: 'fx', alive: true, presentationAdmission: 'pending', pos: { x: 100, z: 20 },
    data: { worldRecordId: rootId, placeId: 'place_claim_outpost_relay' },
  };
  state.render = { scene: {} };
  state.entities.set(root.id, root);
  state.entityList.push(root);
  state.player.targetId = null;
  cycleTarget(state, 1, { emit() {} });
  assert.notEqual(state.player.targetId, site.id);
  root.presentationAdmission = 'ready';
  cycleTarget(state, 1, { emit() {} });
  assert.equal(state.player.targetId, site.id);
});

test('selected site precedence is explicit and aimed mining still follows the cursor', () => {
  const { state, site, asteroid } = stateFixture();
  const player = state.entities.get(state.playerId);
  const host = Object.create(mining);
  host._mineableScratch = [];
  host._diag = {};
  host.state = state;
  state.input.actions.siteBeam = false;
  assert.equal(host._acquireTarget(player, 500, state), asteroid,
    'ordinary aimed mining ignores a merely selected site');
  state.input.actions.siteBeam = true;
  assert.equal(host._acquireTarget(player, 500, state), site,
    'explicit contextual site action selects the site');
  host._beaming = true;
  host._lockTargetId = asteroid.id;
  assert.equal(host._acquireTarget(player, 500, state), asteroid);
  host._beaming = false;
  state.player.tether = { active: true, targetId: asteroid.id };
  assert.equal(host._acquireTarget(player, 500, state), asteroid);
});

test('rebindable B is contextual to a selected site while LT remains the site beam', () => {
  for (const scheme of Object.values(DEFAULTS.SCHEMES)) assert.deepEqual(scheme.siteBeam, ['KeyB']);
  const fixture = stateFixture();
  const host = inputHarness();
  host._keys.KeyB = true;
  host.update(1 / 60, fixture.state);
  assert.equal(fixture.state.input.fireGroup, 2);
  assert.equal(fixture.state.input.actions.siteBeam, true);
  assert.equal(fixture.state.input.actions.aimedMine, false);
  assert.equal(selectedWorldSiteTarget(fixture.state), fixture.site);

  fixture.state.player.targetId = fixture.asteroid.id;
  host.update(1 / 60, fixture.state);
  assert.equal(fixture.state.input.fireGroup, null, 'ordinary asteroid B remains reserved for drill view');
  assert.equal(fixture.state.input.actions.siteBeam, false);

  const gp = {
    lastActiveMs: 1,
    tick() {}, isConnected: () => true,
    axes: { leftX: 0, leftY: 0, rightX: 0, rightY: 0 },
    actions: { mine: { held: true } },
  };
  const padHost = inputHarness(gp);
  fixture.state.player.targetId = fixture.site.id;
  padHost.update(1 / 60, fixture.state);
  assert.equal(fixture.state.input.fireGroup, 2, 'gamepad LT drives the same selected-site beam');
  assert.equal(fixture.state.input.actions.siteBeam, true);
  assert.equal(fixture.state.input.actions.aimedMine, false);
});

test('RMB and touch Mine retain aimed-rock semantics even while a World Site is selected', () => {
  const fixture = stateFixture();
  const player = fixture.state.entities.get(fixture.state.playerId);

  const mouseHost = inputHarness();
  mouseHost._m2 = true;
  mouseHost.update(1 / 60, fixture.state);
  assert.equal(fixture.state.input.actions.siteBeam, false);
  assert.equal(fixture.state.input.actions.aimedMine, true);
  const miningHost = Object.assign(Object.create(mining), { _mineableScratch: [], _diag: {}, state: fixture.state });
  assert.equal(miningHost._acquireTarget(player, 500, fixture.state), fixture.asteroid);

  const touch = {
    lastActiveMs: 2,
    tick() {}, isConnected: () => true,
    axes: { leftX: 0, leftY: 0, rightX: 1, rightY: 0 },
    actions: { mine: { held: true } },
  };
  const touchHost = inputHarness(null, touch);
  touchHost.update(1 / 60, fixture.state);
  assert.equal(fixture.state.input.actions.siteBeam, false);
  assert.equal(fixture.state.input.actions.aimedMine, true);
  assert.equal(miningHost._acquireTarget(player, 500, fixture.state), fixture.asteroid);
});
