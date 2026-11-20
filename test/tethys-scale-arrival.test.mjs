import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { missions } from '../src/systems/missions.js';
import { economy } from '../src/systems/economy.js';
import { cargo, addCargo, removeCargo } from '../src/systems/cargo.js';
import { createKesslerScale } from '../src/systems/kesslerScale.js';
import { kesslerPadPosition, kesslerScalePending, kesslerScaleWaypoint } from '../src/systems/kesslerScaleWorksite.js';
import { missionLogScreen, storyActionForBeat } from '../src/ui/screens/missionLog.js';
import { lootShards } from '../src/systems/lootShards.js';
import { mining } from '../src/systems/mining.js';
import { world } from '../src/systems/world.js';
import { commitCoursePayload, getSearchTargets, resolveMapOpenTarget } from '../src/ui/galaxyMap.js';
import { takeMapOpenIntent } from '../src/ui/mapAuthority.js';
import { ensurePadWalkDocument } from '../scripts/lib/pq16400-gamepad-screens.mjs';

const TETHYS = 'station_tethys';
// The authored Book 1 alloy contract, shaped exactly as embodiedMissions posts it.
function alloyMission() {
  return {
    id: 'b1-alloy-run', status: 'active', type: 'cargo_delivery',
    storyTag: 'campaign47a:b1:alloy_run',
    title: 'Weigh-In — sealed alloy delivery', factionId: 'faction_mts',
    stationId: 'station_helios', destStationId: TETHYS, destSectorId: 'sector_tethys_junction',
    reward_cr: 600, riskTier: 1, time_limit_s: 0, preloadedCargo: true,
    params: {
      physicalVerb: 'weigh', completionMethods: ['sealed_delivery', 'partial_settle'],
      bookScene: 'alloy_run', cmdtyId: 'cmdty_alloys', qty: 6,
      manifestName: 'SEALED ALLOYS — 47-A RESERVE', silentRecat: true,
    },
  };
}
function fixture() {
  const sim = createSimulation({ seed: 79319, systems: [missions, economy, cargo, lootShards, mining, createKesslerScale()], updateOrder: [] });
  const s = sim.state;
  s.mode = 'flight'; s.run.kind = 'adventure'; s.simTime = 20;
  s.world.currentSectorId = 'sector_tethys_junction';
  s.playerId = sim.spawn({ type: 'ship', isPlayer: true, team: 0, pos: { x: 0, z: 0 }, radius: 10, mass: 30, hull: 100, data: {} }).id;
  s.player.flags = { docked: false }; s.ui.docked = false; s.player.cargo.capVolume = 100;
  s.story.beatIndex = 1;
  s.missions.active = [alloyMission()];
  s.missions.boards = s.missions.boards || {};
  addCargo(s, 'cmdty_alloys', 6);
  const scale = sim.registry.get('kesslerScale');
  return { sim, s, scale,
    crates: () => s.entityList.filter(e => e.alive !== false && e.data?.kesslerDelivered === true),
    close: () => sim.dispose() };
}
const completed = (s) => s.story.campaign47a?.stepProgress?.['1']?.completed || [];
const dock = (f) => f.sim.bus.emit('dock:docked', { stationId: TETHYS });

test('the recorded alloy handoff puts the real delivered crate on Scale 4 and Mira points in one line', () => {
  const f = fixture(); const s = f.s;
  const popups = []; f.sim.bus.on('comms:popup', p => popups.push(p));
  const weighed = []; f.sim.bus.on('kesslerPod:weighed', p => weighed.push(p));
  try {
    dock(f);
    assert.equal(s.player.cargo.items.cmdty_alloys || 0, 0, 'the sealed units left the hold');
    assert.ok(completed(s).includes('alloy_run'));
    assert.equal(f.crates().length, 1, 'the desk kept the delivered crate on the plate');
    const crate = f.crates()[0], pad = kesslerPadPosition();
    assert.ok(Math.hypot(crate.pos.x - pad.x, crate.pos.z - pad.z) <= 90);
    assert.equal(crate.data.jettisonedCargo, true);
    assert.equal(crate.data.physicalCustodyOnly, true, 'desk custody: the units cannot ride back');
    assert.equal(crate.data.commodityId, 'cmdty_alloys');
    assert.equal(crate.data.amount, 6); assert.equal(crate.data.salvagePool.cmdty_alloys, 6);
    assert.equal(crate.data.playerJettisonOrigin == null, true);
    const mira = popups.filter(e => e.sender === 'MIRA');
    assert.equal(mira.length, 1, 'Mira pointed at the Scale exactly once, at the recorded handoff');
    assert.ok(mira[0].text.trim().split(/\s+/).filter(Boolean).length <= 8, 'Mira keeps one line');
    assert.match(mira[0].text, /Scale 4/);
    assert.equal(kesslerScalePending(s), true, 'the scale step is open until the read latches');
    // The delivered crate stays with the desk until the pilot reaches the ring.
    f.scale.update(0, s);
    assert.notEqual(crate.data.kesslerRead, true);
    assert.equal(weighed.length, 0, 'a pilot at the berth cannot witness the reading');
    assert.equal(kesslerScalePending(s), true);
    assert.ok(f.scale._deckPods.has(crate.id), 'the delivered crate stays managed by the deck while waiting');

    const pilot = s.entities.get(s.playerId);
    pilot.pos = { x: pad.x + 91, z: pad.z };
    f.scale.update(0, s);
    assert.equal(weighed.length, 0, 'just outside the paint stays pending');
    pilot.pos.x = pad.x + 80;
    s.ui.docked = true;
    f.scale.update(0, s);
    assert.equal(weighed.length, 0, 'a docked pilot does not stand at the scale');
    s.ui.docked = false;
    f.scale.update(0, s);
    f.scale.update(0, s);
    assert.equal(crate.data.kesslerRead, true);
    assert.equal(weighed.length, 1);
    const p = weighed[0];
    assert.equal(p.entityId, crate.id);
    assert.equal(p.variance, true); assert.equal(p.trueRead, 20); assert.equal(p.plateRead, 18.8);
    assert.ok(Number.isSafeInteger(p.count) && p.count > 0);
    assert.ok(completed(s).includes('scale_4'), 'the delivered crate is the weighed one the campaign named');
    assert.ok(popups.some(e => e.sender === 'KESSLER DESK' && /Variance filed/.test(e.text)),
      'the scale handoff still lands on the real payload');
    // Custody is honest: the crate cannot be collected back into the hold.
    const before = s.player.cargo.items.cmdty_alloys || 0;
    s.player.cargo.capVolume = 100;
    f.sim.registry.get('mining')._collectPayload(crate, s.entities.get(s.playerId));
    assert.equal(s.player.cargo.items.cmdty_alloys || 0, before, 'no stock is invented');
    assert.equal(crate.alive !== false, true);
  } finally { f.close(); }
});

test('waypoint and mission copy name the delivered crate, agreeing with the campaign step', () => {
  const f = fixture(); const s = f.s;
  try {
    dock(f);
    const point = kesslerScaleWaypoint(s);
    assert.ok(point); assert.match(point.label, /delivered crate/);
    assert.match(point.reason, /delivered alloy crate/);
    assert.match(point.reason, /Fly inside the Scale 4 ring/, 'the tag points to the desk-crate reading');
    const action = storyActionForBeat({ beat: 1 }, s);
    assert.equal(action?.body, point.reason, 'the log teaches the same action as the waypoint');
    s.entities.get(s.playerId).pos = kesslerPadPosition();
    f.scale.update(0, s);
    assert.equal(kesslerScaleWaypoint(s), null, 'the read latches the step and retires the pin');
  } finally { f.close(); }
});

test('Mission Log opens Scale 4 and the next Tethys berth without changing the current course', () => {
  const f = fixture();
  const s = f.s;
  ensurePadWalkDocument();
  const screen = Object.create(missionLogScreen);
  const root = document.createElement('div');
  document.body.appendChild(root);
  const opened = [];
  try {
    dock(f);
    const marker = s.nav.waypoint;
    s.ui.screenStack = ['missionLog'];
    screen.mount(root, { state: s, bus: f.sim.bus,
      screenManager: { top: () => 'missionLog', pushScreen: id => opened.push(id) },
    });
    const current = root.querySelector('[data-current-action="true"]');
    const buttons = () => root.querySelectorAll('[data-map-selection-target="active-waypoint"]');
    assert.match(root.querySelector('.sf-mlog-stage')?.textContent, /Honest Work/);
    assert.doesNotMatch(root.textContent, /Sample the 47-A mass discrepancy, then dock at Helios|(?:visit a station board|dock at a station).*accept (?:a contract|work)|choose a first contract/i);
    assert.match(root.textContent, /Act I - Cold Start/i);
    assert.equal(current?.querySelector('.sf-mlog-rec-marker')?.textContent, `◆ ${marker.label}`, current?.textContent);
    assert.equal(buttons().length, 1);
    buttons()[0].click();
    const intent = takeMapOpenIntent(s);
    const target = resolveMapOpenTarget(s, intent);
    assert.deepEqual(opened, ['galaxyMap']);
    assert.equal(target.id, 'active-waypoint');
    assert.deepEqual({ x: target.x, z: target.z }, marker.pos);
    assert.equal(commitCoursePayload(s, target).waypointKind, 'story');
    assert.equal(s.nav.waypoint, marker);
    assert.ok(!s.nav.autopilot?.active);

    s.world.currentSectorId = 'sector_helios_prime';
    screen.refresh();
    assert.equal(buttons().length, 0, 'the ring has no local fix from this sector');
    assert.equal(resolveMapOpenTarget(s, intent), null);
    assert.equal(s.nav.waypoint, marker);

    s.world.currentSectorId = 'sector_tethys_junction';
    const detour = { kind: 'local', label: 'Pilot course', pos: { ...marker.pos } };
    s.nav.waypoint = detour;
    screen.refresh();
    assert.equal(buttons().length, 0, 'a manual fix at the same point is not the story marker');
    assert.equal(resolveMapOpenTarget(s, intent), null);
    assert.equal(s.nav.waypoint, detour);

    s.nav.waypoint = marker;
    const navigation = Object.assign(Object.create(world), { state: s, bus: f.sim.bus });
    const autopilot = navigation._onSetCourse(commitCoursePayload(s, target));
    s.entities.get(s.playerId).pos = kesslerPadPosition();
    f.scale.update(0, s);
    const furnace = s.nav.waypoint;
    const heldCourse = structuredClone(autopilot);
    const board = s.missions.boards[TETHYS];
    const furnaceOffer = board.slots.find(offer => offer.storyTag === 'campaign47a:b1:infested');
    assert.equal(furnace.label, furnaceOffer.title);
    screen.refresh();
    const furnaceButton = () => root.querySelector('[data-map-station-id="station_tethys"]');
    assert.equal(root.querySelector('.sf-mlog-rec-marker')?.textContent, `◆ ${furnaceOffer.title}`);
    furnaceButton().click();
    const berthIntent = takeMapOpenIntent(s);
    assert.equal(berthIntent.focus, 'local');
    assert.equal(resolveMapOpenTarget(s, berthIntent)?.stationId, TETHYS);
    assert.equal(s.nav.waypoint, furnace);
    assert.equal(s.nav.autopilot, autopilot);
    assert.deepEqual(s.nav.autopilot, heldCourse);

    s.world.currentSectorId = 'sector_helios_prime';
    screen.refresh();
    furnaceButton().click();
    const remoteIntent = takeMapOpenIntent(s);
    const remote = resolveMapOpenTarget(s, remoteIntent);
    assert.equal(remoteIntent.focus, 'galaxy');
    assert.equal(remote?.sectorId, 'sector_tethys_junction');
    assert.equal(s.nav.waypoint, furnace);
    assert.equal(s.nav.autopilot, autopilot);
    assert.deepEqual(s.nav.autopilot, heldCourse);

    s.nav.waypoint = { ...furnace, sectorId: 'sector_helios_prime' };
    screen.refresh();
    assert.equal(furnaceButton(), null, 'a mismatched marker cannot select the board');
    s.nav.waypoint = furnace;
    board.slots = board.slots.filter(offer => offer !== furnaceOffer);
    screen.refresh();
    assert.equal(furnaceButton(), null, 'an absent board offer supplies no action');
    assert.equal(s.nav.waypoint, furnace);
  } finally {
    screen.onHide();
    root.remove();
    f.close();
  }
});

test('tracking the Scale 4 objective keeps its story owner and hands back to the actual Furnace Detail desk', () => {
  const f = fixture();
  const s = f.s;
  try {
    dock(f);
    const marker = s.nav.waypoint;
    const goal = getSearchTargets(s, 'local', s.world.currentSectorId).find(row => row.id === 'active-map-goal');
    const course = commitCoursePayload(s, goal);
    const navigation = Object.assign(Object.create(world), { state: s, bus: f.sim.bus });
    assert.ok(navigation._onSetCourse(course).active);
    assert.equal(s.nav.waypoint, marker, 'Track Waypoint keeps the live story marker');

    s.entities.get(s.playerId).pos = kesslerPadPosition();
    f.scale.update(0, s);
    const posted = s.missions.boards[TETHYS].slots.find(row => row.storyTag === 'campaign47a:b1:infested');
    assert.ok(posted);
    assert.equal(s.nav.waypoint.label, posted.title);
    assert.equal(s.nav.waypoint.stationId, posted.stationId);
    assert.match(s.nav.waypoint.reason, /Dock at Tethys Trade Hub and accept/);

    navigation._onSetCourse(course);
    assert.equal(s.nav.waypoint.kind, 'local', 'a stale story stamp can only arm an ordinary course');
  } finally { f.close(); }
});

test('a detour cannot bind the Scale 4 story marker and survives the receipt', () => {
  const f = fixture();
  const s = f.s;
  try {
    dock(f);
    const navigation = Object.assign(Object.create(world), { state: s, bus: f.sim.bus });
    const goal = getSearchTargets(s, 'local', s.world.currentSectorId).find(row => row.id === 'active-map-goal');
    const course = commitCoursePayload(s, goal);
    navigation._onSetCourse({ ...course, pos: { x: course.pos.x + 160, z: course.pos.z } });
    const detour = s.nav.waypoint;
    assert.equal(detour.kind, 'local');

    s.entities.get(s.playerId).pos = kesslerPadPosition();
    f.scale.update(0, s);
    assert.ok(completed(s).includes('scale_4'));
    assert.equal(s.nav.waypoint, detour);
  } finally { f.close(); }
});

test('a foreign delivery or a missing seal never mints a crate on the deck', () => {
  const f = fixture(); const s = f.s;
  try {
    assert.equal(f.crates().length, 0);
    // A foreign cargo_delivery event with the same payload shape is not the handoff.
    f.sim.bus.emit('cargo:delivered', { commodityId: 'cmdty_alloys', qty: 6, missionId: 'other-mission', stationId: TETHYS });
    assert.equal(f.crates().length, 0);
    // An incomplete seal stays open: units lost before docking deliver nothing.
    removeCargo(s, 'cmdty_alloys', 1);
    dock(f);
    assert.equal(f.crates().length, 0, 'a partial seal cannot mint the crate');
    assert.ok(!completed(s).includes('alloy_run'));
    assert.equal(s.player.cargo.items.cmdty_alloys || 0, 5, 'the shortfall stays with the pilot');
  } finally { f.close(); }
});

test('the crate survives a leave-and-return without duplicating or losing its receipt', () => {
  const f = fixture(); const s = f.s;
  try {
    dock(f);
    s.entities.get(s.playerId).pos = kesslerPadPosition();
    f.scale.update(0, s);
    const crate = f.crates()[0], receipt = { ...crate.data.kesslerReceipt };
    s.world.currentSectorId = 'sector_helios_prime';
    f.scale._sync();
    assert.equal(f.crates().length, 1, 'the desk keeps custody while the pilot is away');
    s.world.currentSectorId = 'sector_tethys_junction';
    f.scale._sync(); f.scale._sync();
    assert.equal(f.crates().length, 1, 'return never mints a second crate');
    f.scale.update(0, s);
    assert.deepEqual(crate.data.kesslerReceipt, receipt, 'the recorded reading stays with the body');
    assert.equal(s.story.flags.kessler_reads_counted, 1, 'return does not generate a second reading');
    assert.equal(crate.data.kesslerDelivered, true);
  } finally { f.close(); }
});
