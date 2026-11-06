/**
 * inf-rescue-desk-answer — the rescue's payer answers the tow at the delivery moment.
 *
 * A towed-in rescue used to end in a generic fee receipt from nowhere: the station that took the
 * person in never spoke, and an ambulance hull fed a pod by hand never answered the cable. Now
 * the receiving desk answers a pod towed into its bubble (a bunk offered, the debt named in
 * words — the fee receipt already says the figure), and a rescue hull's crew answers a player
 * handoff before they cast off. Both ride the same arbiter seam as the tow voice (say + a
 * barkDirector:voice receipt carrying the same voiceId), once per rescue, in the receiver's own
 * faction register. Ransom keeps the fence's own voice (fenceDesk owns it); an unattended pod an
 * ambulance claims on its own credits nobody's answer. The adjacent raw player-facing strings in
 * this owner (mayday, fee receipt, testimony toast) now go through localizeText.
 *
 * Seed 4242. Focused: owner = src/systems/survivorPod.js.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { survivorPod } from '../src/systems/survivorPod.js';

function boot(sectorId, { voice = true } = {}) {
  const bus = createBus();
  const state = {
    mode: 'flight',
    tick: 20,
    simTime: 30,
    playerId: 1,
    meta: { seed: 4242 },
    nextEntityId: 500,
    entities: new Map(),
    entityList: [],
    world: { currentSectorId: sectorId },
    player: { tether: { active: false, targetId: null } },
    traffic: { freighters: [] },
    story: { flags: {} },
    ui: {},
  };

  function add(entity) {
    state.entities.set(entity.id, entity);
    state.entityList.push(entity);
    return entity;
  }

  const player = add({
    id: 1,
    type: 'ship',
    team: 0,
    alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 12,
    mass: 100,
    hull: 200,
    hullMax: 200,
    data: {},
    flags: {},
  });

  const said = [];
  const receipts = [];
  const toasts = [];
  const grants = [];
  const resolved = [];
  const helpers = voice
    ? { voice: { say: (msg) => { said.push(msg); return true; } } }
    : {};
  bus.on('barkDirector:voice', (p) => receipts.push(p));
  bus.on('toast', (p) => toasts.push(p));
  bus.on('economy:grantCredits', (p) => grants.push(p));
  bus.on('survivorPod:resolved', (p) => resolved.push(p));

  survivorPod.init({ state, bus, helpers, registry: null });

  function ejectPod() {
    const id = (state.nextEntityId += 1);
    const victim = add({
      id,
      type: 'ship',
      team: 2,
      factionId: 'faction_mts',
      alive: true,
      pos: { x: 800, z: 200 },
      vel: { x: 4, z: -1 },
      radius: 14,
      mass: 160,
      hull: 10,
      hullMax: 100,
      data: { trafficRole: 'hauler', role: 'hauler', ai: { archetype: 'mule_trader', passive: true } },
      flags: {},
    });
    const pod = survivorPod._spawnCausalPod(state, victim, { pos: victim.pos, vel: victim.vel });
    assert.ok(pod, 'causal pod spawned');
    // Park the pair far from any station or rescue hull: the tow lasts as long as the test wants.
    pod.pos.x = 800;
    pod.pos.z = 200;
    player.pos.x = 800;
    player.pos.z = 214;
    return pod;
  }

  function addLawfulStation(x, z) {
    const station = add({
      id: (state.nextEntityId += 1),
      type: 'station',
      alive: true,
      factionId: 'faction_scn',
      pos: { x, z },
      radius: 40,
      data: { stationId: 'station_desk_probe', size: 'M' },
      flags: {},
    });
    return station;
  }

  function addRescueHull(x, z) {
    const hull = add({
      id: (state.nextEntityId += 1),
      type: 'ship',
      team: 0,
      factionId: 'faction_free',
      alive: true,
      pos: { x, z },
      vel: { x: 0, z: 0 },
      radius: 12,
      mass: 120,
      hull: 200,
      hullMax: 200,
      data: { trafficRole: 'rescue', role: 'rescue', worldRecordId: 'wr_rescue_desk_probe' },
      flags: {},
    });
    state.traffic.freighters.push({ id: hull.id, role: 'rescue' });
    return hull;
  }

  function latch(pod) {
    state.player.tether = { active: true, targetId: pod.id };
    bus.emit('tether:latched', { targetId: pod.id, ownerId: player.id });
  }

  function unlatch() {
    state.player.tether = { active: false, targetId: null };
  }

  return {
    state, bus, said, receipts, toasts, grants, resolved, player,
    ejectPod, addLawfulStation, addRescueHull, latch, unlatch,
    restore() {
      if (typeof survivorPod.destroy === 'function') survivorPod.destroy();
    },
  };
}

const gripLines = (h) => h.said.filter((m) => String(m.id).startsWith('survivorTowGrip:'));
const receiptLines = (h) => h.said.filter((m) => String(m.id).startsWith('survivorMaydayPaid:'));
const deskLines = (h) => h.said.filter((m) => String(m.id).startsWith('survivorDesk:'));
const deskToasts = (h) => h.toasts.filter((t) => t.kind === 'survivorDeskAnswer');

test('the station desk answers a pod towed into its bubble — once, in the house register', () => {
  const h = boot('sector_kepler_scar');
  try {
    const pod = h.ejectPod();
    h.latch(pod);
    assert.equal(gripLines(h).length, 1, 'the tow voice still opens the tow');

    // No station nearby yet: the delivery has no payer, so no fee and no answer.
    h.state.simTime += 1;
    survivorPod.update(1 / 60, h.state);
    assert.equal(deskLines(h).length, 0, 'no desk answer away from a station');
    assert.equal(receiptLines(h).length, 0);

    // The lawful house that receives the pod: inside its protection bubble, the desk answers.
    h.addLawfulStation(800, 200);
    h.state.simTime += 1;
    survivorPod.update(1 / 60, h.state);

    assert.equal(h.resolved.filter((r) => r.outcome === 'rescued').length, 1, 'rescue resolved');
    assert.equal(h.grants.length, 1, 'the salvage fee still pays');
    assert.equal(receiptLines(h).length, 1, 'the fee receipt still speaks');
    assert.match(receiptLines(h)[0].text, /420/, 'the receipt names the fee figure');

    const desks = deskLines(h);
    assert.equal(desks.length, 1, 'the desk answers once');
    const line = desks[0];
    assert.equal(line.channel, 'bark');
    assert.equal(line.kind, 'survivorDeskAnswer');
    assert.equal(line.id, `survivorDesk:${pod.id}`);
    assert.equal(line.factionId, 'faction_scn', 'the desk speaks in the receiving house register');
    assert.match(line.text, /bunk/i, 'a bed is offered');
    assert.match(line.text, /fee/i, 'the debt is named');

    const receipt = h.receipts.find((r) => r.voiceId === line.id);
    assert.ok(receipt, 'the desk line carries its radio receipt');
    assert.equal(receipt.situation, 'desk');
    assert.equal(receipt.text, line.text);
    assert.equal(receipt.factionId, 'faction_scn');

    // A later tick never repeats the desk (and never re-pays the fee).
    h.state.simTime += 1;
    survivorPod.update(1 / 60, h.state);
    assert.equal(deskLines(h).length, 1, 'the desk answer is once per rescue');
    assert.equal(h.grants.length, 1, 'the fee never pays twice');
  } finally {
    h.restore();
  }
});

test('the ambulance crew answers a player handoff; an unattended claim stays silent', () => {
  const first = boot('sector_kepler_scar');
  try {
    const pod = first.ejectPod();
    first.latch(pod);
    assert.equal(gripLines(first).length, 1, 'the tow opens before the handoff');

    const hull = first.addRescueHull(860, 200); // within the 90 wu handoff range
    first.state.simTime += 1;
    survivorPod.update(1 / 60, first.state);

    const crews = deskLines(first);
    assert.equal(crews.length, 1, 'the rescue hull crew answers the handoff');
    assert.equal(crews[0].id, `survivorDesk:${pod.id}`);
    assert.equal(crews[0].factionId, 'faction_free', 'the crew speaks in its own house register');
    assert.match(crews[0].text, /take the line/i, 'the crew names taking custody');
    const receipt = first.receipts.find((r) => r.voiceId === crews[0].id);
    assert.ok(receipt, 'the crew line rides the same arbiter receipt contract');

    // Custody is pending: the fee belongs to the hull's own dock arrival, not the handoff.
    assert.equal(receiptLines(first).length, 0, 'no fee receipt at the handoff moment');
    assert.equal(first.grants.length, 0, 'no credits until the hull docks');
  } finally {
    first.restore();
  }

  // The same hull claiming a pod nobody towed speaks for nobody.
  const second = boot('sector_kepler_scar');
  try {
    const pod = second.ejectPod();
    second.addRescueHull(860, 200);
    second.state.simTime += 1;
    survivorPod.update(1 / 60, second.state);
    assert.equal(deskLines(second).length, 0, 'an unattended claim credits nobody');
    assert.equal(second.grants.length, 0, 'no fee for a pod the player never towed');
  } finally {
    second.restore();
  }
});

test('a fence delivery keeps the desk quiet — the fence desk owns that voice', () => {
  const h = boot('sector_kepler_scar');
  try {
    const pod = h.ejectPod();
    // The fence berth from the tow-voice harness: station_kepler_scar wants pods.
    h.state.entityList.push({
      id: 901,
      type: 'station',
      alive: true,
      factionId: 'faction_reach',
      pos: { x: 800, z: 200 },
      radius: 34,
      data: { stationId: 'station_kepler_scar', stationTypeId: 'blackmarket', factionId: 'faction_reach' },
      flags: {},
    });
    h.state.entities.set(901, h.state.entityList[h.state.entityList.length - 1]);
    h.latch(pod);

    assert.equal(h.resolved.filter((r) => r.outcome === 'ransomed').length, 1, 'ransom resolved');
    assert.equal(deskLines(h).length, 0, 'no station desk answer at a fence');
    assert.equal(deskToasts(h).length, 0);
    assert.equal(receiptLines(h).length, 0, 'no lawful salvage fee at a fence');
    assert.equal(h.grants.length, 0, 'the fence pays its own way');
  } finally {
    h.restore();
  }
});

test('without a voice helper the desk answer falls back to a toast and never fakes a receipt', () => {
  const h = boot('sector_kepler_scar', { voice: false });
  try {
    const pod = h.ejectPod();
    h.latch(pod);
    h.addLawfulStation(800, 200);
    h.state.simTime += 1;
    survivorPod.update(1 / 60, h.state);

    assert.equal(h.resolved.filter((r) => r.outcome === 'rescued').length, 1);
    assert.equal(deskToasts(h).length, 1, 'the desk answer surfaces as a toast');
    assert.match(deskToasts(h)[0].text, /bunk/i);
    assert.equal(h.receipts.length, 0, 'no audio receipt without a floor');
  } finally {
    h.restore();
  }
});

test('the mayday and testimony copy ride the localization pipeline like the tow voice', () => {
  const h = boot('sector_kepler_scar');
  try {
    const pod = h.ejectPod();
    const mayday = h.said.find((m) => String(m.id).startsWith('survivorMayday:'));
    assert.ok(mayday, 'the eject mayday spoke');
    assert.match(mayday.text, /Mayday, mayday — hauler going down/, 'mayday interpolates its hull label');

    // The heat testimony receipt (its owner fires on a cooled receipt, here driven directly).
    h.bus.emit('survivorPod:heatCooled', { cooled: 12 });
    const toasts = h.toasts.filter((t) => /testimony filed/i.test(t.text));
    assert.equal(toasts.length, 1, 'the testimony line is player-facing through the same path');
  } finally {
    h.restore();
  }
});
