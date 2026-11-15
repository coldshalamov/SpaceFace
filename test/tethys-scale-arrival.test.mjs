import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { missions } from '../src/systems/missions.js';
import { economy } from '../src/systems/economy.js';
import { cargo, addCargo, removeCargo } from '../src/systems/cargo.js';
import { createKesslerScale } from '../src/systems/kesslerScale.js';
import { kesslerPadPosition, kesslerScalePending, kesslerScaleWaypoint } from '../src/systems/kesslerScaleWorksite.js';
import { storyActionForBeat } from '../src/ui/screens/missionLog.js';
import { lootShards } from '../src/systems/lootShards.js';
import { mining } from '../src/systems/mining.js';

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
    // The deck reads the settled crate on its ordinary pass — while the player is still
    // at the window — and the real payload reaches the campaign book.
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
    assert.match(point.reason, /brake below 2 WU\/s/, 'the tag carries the set-down instruction');
    const action = storyActionForBeat({ beat: 1 }, s);
    assert.match(action?.body, /delivered alloy crate on Scale 4/, 'the log names the crate the campaign weighed');
    f.scale.update(0, s);
    assert.equal(kesslerScaleWaypoint(s), null, 'the read latches the step and retires the pin');
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
    dock(f); f.scale.update(0, s);
    const crate = f.crates()[0], receipt = { ...crate.data.kesslerReceipt };
    s.world.currentSectorId = 'sector_helios_prime';
    f.scale._sync();
    assert.equal(f.crates().length, 1, 'the desk keeps custody while the pilot is away');
    s.world.currentSectorId = 'sector_tethys_junction';
    f.scale._sync(); f.scale._sync();
    assert.equal(f.crates().length, 1, 'return never mints a second crate');
    assert.deepEqual(crate.data.kesslerReceipt, receipt, 'the recorded reading stays with the body');
    assert.equal(crate.data.kesslerDelivered, true);
  } finally { f.close(); }
});
