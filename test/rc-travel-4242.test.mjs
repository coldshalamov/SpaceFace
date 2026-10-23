import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { SECTORS } from '../src/data/sectors.js';
import { FREIGHT_SPINE, spineFix, gateTollFor } from '../src/data/travelChoices.js';
import { computeDiscoveredRoute, DEFAULT_DRIVE } from '../src/systems/routePlanner.js';
import { routeFollower } from '../src/systems/routeFollower.js';
import { travelLanes, sweptSlingRingPass } from '../src/systems/travelLanes.js';
import { cruise } from '../src/systems/cruise.js';
import { world } from '../src/systems/world.js';
import { save } from '../src/save/saveSystem.js';
import { galaxyMapScreen, memoryTint } from '../src/ui/galaxyMap.js';
import { travelVectorReadout, mountTravelVectorHud } from '../src/ui/travelVectorHud.js';
import { bootRealPath, writeRealPathInput } from '../scripts/lib/bench/realPath.mjs';

function fixture() {
  const state = createGameState(4242), bus = createBus(), events = [];
  const emit = bus.emit.bind(bus); bus.emit = (name, payload) => { events.push({ name, payload }); return emit(name, payload); };
  state.mode = 'flight'; state.world.currentSectorId = 'sector_ceres_belt';
  for (const s of SECTORS) { state.world.sectors[s.id] = { ...s }; state.world.discovery[s.id] = { discovered: true }; }
  const player = { id: 1, alive: true, type: 'ship', radius: 8, pos: spineFix(0, -180), vel: { x: 0, z: 0 }, rot: 0, data: {} };
  state.playerId = 1; state.entities.set(1, player); state.entityList.push(player);
  const follower = Object.create(routeFollower); follower.init({ state, bus });
  const owner = Object.create(world); owner.state = state; owner.bus = bus; owner._activeDrive = () => DEFAULT_DRIVE;
  const routeTo = mode => computeDiscoveredRoute(state, 'sector_helios_prime', mode);
  bus.on('world:requestRoute', payload => owner._onRequestRoute(payload));
  return { state, bus, events, player, follower, owner, routeTo };
}

test('4242: map alternatives plot and engage different physical approaches with real toll/fuel terms', () => {
  const f = fixture();
  const screen = { _ctx: { state: f.state, registry: { get: () => f.owner } },
    _alternativesDestination: () => ({ dest: 'sector_helios_prime', note: 'Ceres departure' }) };
  const html = galaxyMapScreen._routeAlternativesHtml.call(screen, f.state);
  for (const mode of ['gate', 'dark', 'spine']) assert.match(html, new RegExp(`data-rail-alt="${mode}"`));
  const gate = f.routeTo('gate'), dark = f.routeTo('dark');
  assert.equal(gate.totalFuel, 0); assert.equal(dark.totalToll, 0); assert.ok(dark.totalFuel > 0);
  assert.equal(gate.totalToll, gateTollFor(f.state.world.sectors.sector_helios_prime));
  const targets = [];
  for (const mode of ['gate', 'dark']) {
    f.bus.emit('world:requestRoute', { targetSectorId: 'sector_helios_prime', mode });
    f.bus.emit('nav:engageRoute', {}); f.follower.update(1 / 60, f.state);
    targets.push({ ...f.state.nav.autopilot.target });
    f.bus.emit('nav:autopilot', { status: 'arrived' });
    assert.equal(f.events.filter(e => e.name === 'world:requestJump').at(-1).payload.via, mode === 'dark' ? 'drive' : 'gate');
    f.bus.emit('nav:abortRoute', {});
  }
  assert.ok(Math.hypot(targets[0].x - targets[1].x, targets[0].z - targets[1].z) >= 699);
});

test('4242: spine fixes and dark departure survive the real nav save sanitizer and reload validation', () => {
  for (const mode of ['spine', 'dark']) {
    const f = fixture(); f.state.nav.route = f.routeTo(mode); f.state.nav.autoTravel = true;
    f.follower.engage({}); f.follower.update(1 / 60, f.state);
    const saver = Object.create(save); saver.state = f.state; saver.bus = f.bus;
    const blob = saver._serializeNav();
    if (mode === 'spine') assert.deepEqual(blob.route.legs[0].target, spineFix(0, -180));
    else assert.equal(blob.route.legs[0].travelVia, 'drive');
    saver._restoreNav(blob); f.bus.emit('save:loaded', {});
    assert.equal(f.state.nav.executor.engaged, true, 'valid new route remains resumable');
    f.follower.update(1 / 60, f.state);
    if (mode === 'dark') {
      f.bus.emit('nav:autopilot', { status: 'arrived' });
      assert.equal(f.events.filter(e => e.name === 'world:requestJump').at(-1).payload.via, 'drive');
    }
  }
});

test('4242: real V3/Rapier flight clears three physical sling rings and posts one clean-chain receipt', { timeout: 120000 }, async () => {
  const first = FREIGHT_SPINE[0], axis = first.axis;
  const host = await bootRealPath({ seed: 4242, systems: [travelLanes, 'flightV3', 'physics'],
    bounds: { center: first.globalPos, radius: 12000, hardRadius: 15000 },
    hulls: [{ hullId: 'ship_kestrel', pos: spineFix(0, -100), rot: Math.atan2(axis.z, axis.x), isPlayer: true, factionId: 'faction_free' }] });
  try {
    const { state, player, bus } = host;
    state.world.currentSectorId = first.sectorId;
    state.settings.controls.flightMode = 'newtonian';
    const passes = [], chains = [], receipts = [];
    bus.on('lane:slingPass', p => passes.push(p)); bus.on('lane:spineComplete', p => chains.push(p));
    bus.on('toast', p => { if (/three clean rings/.test(p.text)) receipts.push(p); });
    player.vel.x = axis.x * 200; player.vel.z = axis.z * 200;
    host.step(1200, { before({ state }) { writeRealPathInput(state, { moveZ: 1 });
      state.input.travelDrive ||= { state: 'off', cap: 0 }; }, after() {
        if (chains.length) return false;
      } });
    assert.deepEqual(passes.map(p => p.ringIndex), [0, 1, 2], JSON.stringify({ pos: player.pos, vel: player.vel, rot: player.rot }));
    assert.equal(chains.length, 1); assert.equal(receipts.length, 1);
    assert.ok(chains[0].exitSpeedWuS >= 300);
    const rings = state.entityList.filter(e => e.data?.travelSpineRingId);
    assert.equal(rings.length, 3); assert.ok(rings.every(e => e.data.placeId === 'place_gate_jump_ring'));
    assert.equal(host.proof().backend, 'rapier-dynamic');
  } finally { host.dispose(); }
});

test('4242: snare opens a 1.5s escape arc; steering wins, staying straight loses, pause freezes it', () => {
  for (const escape of [true, false]) {
    const f = fixture(), c = Object.create(cruise); c.init(f);
    f.state.player.cruise = { phase: 'cruising', t: 3, stumbleT: 0, stumbleCdT: 0 };
    f.bus.emit('cruise:snareRequest', { sourceId: 'snare-4242' });
    const w = f.state.player.cruise.wrestle;
    assert.equal(w.remainingS, 1.5); assert.equal(f.state.player.cruise.phase, 'cruising');
    f.state.mode = 'pause'; c.update(1, f.state); assert.equal(w.remainingS, 1.5); f.state.mode = 'flight';
    // Simulate the ordinary bow turn over the visible escape window, not an outcome event.
    for (let tick = 0; tick < 100; tick++) {
      if (escape) f.player.rot += Math.sign(w.escapeBearing - f.player.rot) * Math.min(0.02, Math.abs(w.escapeBearing - f.player.rot));
      c.update(1 / 60, f.state);
    }
    assert.equal(f.state.player.cruise.phase, escape ? 'cruising' : 'off');
    assert.equal(f.events.some(e => e.name === 'cruise:wrestleEscaped'), escape);
    assert.equal(f.events.some(e => e.name === 'cruise:snared'), !escape);
  }
});

test('4242: a calendar sweep counts a forward tube crossing, never a reverse or parallel fly-by', () => {
  const ring = FREIGHT_SPINE[1];
  const before = spineFix(1, -150), after = spineFix(1, 150);
  assert.equal(sweptSlingRingPass(before, after, ring), true);
  assert.equal(sweptSlingRingPass(after, before, ring), false);
  const offset = p => ({ x: p.x + ring.throwPerp.x * 70, z: p.z + ring.throwPerp.z * 70 });
  assert.equal(sweptSlingRingPass(offset(before), offset(after), ring), false);
});

test('4242: ten-day chart prices fade and both free-inertia modes expose the tick line', () => {
  // One sim day is 600 seconds, shared with the calendar and sector field.
  assert.ok(memoryTint(10 * 600).alpha < memoryTint(0).alpha / 2);
  assert.equal(memoryTint(10 * 600).key, 'old');
  const f = fixture(); f.player.vel.x = 100;
  for (const mode of ['drift', 'newtonian']) {
    f.state.settings.controls.flightMode = mode; assert.equal(travelVectorReadout(f.state, f.player).drift, true);
  }
  f.state.settings.controls.flightMode = 'assisted'; assert.equal(travelVectorReadout(f.state, f.player).drift, false);
  // The mode mirror keeps the sim's precedence: an input-packet mode beats the entity stamp,
  // an entity stamp beats settings, and an invalid explicit value falls through to settings.
  f.state.input = { flightMode: 'drift' }; f.player.flightAssistMode = 'assisted';
  assert.equal(travelVectorReadout(f.state, f.player).drift, true, 'packet override wins over the entity stamp');
  f.state.input.flightMode = null; f.player.flightAssistMode = 'newtonian';
  assert.equal(travelVectorReadout(f.state, f.player).drift, true, 'entity stamp wins over settings');
  f.player.flightAssistMode = 'warp'; f.state.settings.controls.flightMode = 'drift';
  const invalidRead = travelVectorReadout(f.state, f.player);
  assert.equal(invalidRead.drift, true, 'an invalid stamp falls through to the settings mode');
  assert.equal(invalidRead.mode, 'drift');
  f.state.input = null; f.player.flightAssistMode = null; f.state.settings.controls.flightMode = 'assisted';
  const makeNode = () => ({ style: {}, attrs: {}, children: [], setAttribute(k, v) { this.attrs[k] = v; },
    append(...nodes) { this.children.push(...nodes); }, appendChild(n) { this.children.push(n); }, cloneNode() { return makeNode(); }, remove() { this.removed = true; } });
  const root = makeNode(); root.ownerDocument = { createElementNS: () => makeNode() };
  const instrument = mountTravelVectorHud(root, f.state, { worldToScreen: (p, out) => Object.assign(out, { x: p.x, y: p.z, onScreen: true }) });
  f.state.settings.controls.flightMode = 'drift'; instrument.update(f.player);
  assert.match(root.children[0].children[0].attrs.d, /M.*l.*M.*l/);
  f.state.player.cruise = { wrestle: { escapeBearing: 1 } }; instrument.update(f.player);
  assert.match(root.children[0].children[1].attrs.d, /A64,64/); instrument.destroy();
  assert.equal(root.children[0].removed, true);
});
