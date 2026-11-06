/**
 * inf-rescue-tow-voice — the RESCUED pod's trip home reads: the survivor talks during the tow.
 *
 * Between the mayday at eject and the fee receipt at delivery, a towed pod used to be a silent
 * scan label on a cable. Now the survivor answers the latch once (grip), reads the air clock
 * once per threshold while the line holds, and each line carries the barkDirector:voice receipt
 * (same id as the say id) so the radio voice schedules on the real arbiter floor.
 *
 * Seed 4242. Focused: owner = src/systems/survivorPod.js.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { survivorPod } from '../src/systems/survivorPod.js';

const TOW_TTL_S = 180; // CAUSAL_POD_TTL_S

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
  const helpers = voice
    ? { voice: { say: (msg) => { said.push(msg); return true; } } }
    : {};
  bus.on('barkDirector:voice', (p) => receipts.push(p));
  bus.on('toast', (p) => toasts.push(p));

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

  function latch(pod) {
    state.player.tether = { active: true, targetId: pod.id };
    bus.emit('tether:latched', { targetId: pod.id, ownerId: player.id });
  }

  function unlatch() {
    state.player.tether = { active: false, targetId: null };
  }

  return {
    state, bus, said, receipts, toasts, player,
    ejectPod, latch, unlatch,
    restore() {
      if (typeof survivorPod.destroy === 'function') survivorPod.destroy();
    },
  };
}

const gripLines = (h) => h.said.filter((m) => String(m.id).startsWith('survivorTowGrip:'));
const airLines = (h, stamp) => h.said.filter((m) => String(m.id).startsWith(`survivorAir:${stamp}:`));
// The eject mayday rides the same voice helper — tow-voice accounting excludes it by id.
const maydayLines = (h) => h.said.filter((m) => String(m.id).startsWith('survivorMayday:'));

test('the survivor answers the latch once, and the receipt carries the say id to the radio voice', () => {
  const h = boot('sector_kepler_scar');
  try {
    const pod = h.ejectPod();
    assert.equal(gripLines(h).length, 0, 'no voice before the cable holds');
    h.latch(pod);
    const grips = gripLines(h);
    assert.equal(grips.length, 1, 'one grip line on latch');
    const line = grips[0];
    assert.equal(line.channel, 'bark');
    assert.equal(line.kind, 'survivorMayday');
    assert.equal(line.id, `survivorTowGrip:${pod.id}`);
    assert.equal(line.factionId, 'faction_mts', 'the survivor speaks in the victim faction register');
    assert.match(line.text, /got us/i);
    assert.equal(h.receipts.length, 1, 'one audio receipt');
    const receipt = h.receipts[0];
    assert.equal(receipt.voiceId, line.id, 'radio voice waits for this exact floor');
    assert.equal(receipt.situation, 'distress');
    assert.equal(receipt.text, line.text);
    assert.equal(receipt.factionId, line.factionId);
    h.latch(pod); // re-latch must not re-speak
    h.latch(pod);
    assert.equal(gripLines(h).length, 1, 'grip is once per pod');
  } finally {
    h.restore();
  }
});

test('air calls read the tow clock once per threshold and only while the line holds', () => {
  const h = boot('sector_kepler_scar');
  try {
    const pod = h.ejectPod();
    h.latch(pod);
    const rec = h.state.survivorPod.causal.byEntityId[pod.id];
    assert.ok(rec, 'tow record live');
    const expireAt = rec.expireAt;

    // Far from any threshold: no air call.
    h.state.simTime = expireAt - 90;
    survivorPod.update(1 / 60, h.state);
    assert.equal(airLines(h, 'towAir60').length, 0);

    // Inside 60 s: exactly one call, once, not repeated by later ticks.
    h.state.simTime = expireAt - 55;
    survivorPod.update(1 / 60, h.state);
    assert.equal(airLines(h, 'towAir60').length, 1);
    assert.equal(airLines(h, 'towAir20').length, 0);
    h.state.simTime = expireAt - 40;
    survivorPod.update(1 / 60, h.state);
    h.state.simTime = expireAt - 30;
    survivorPod.update(1 / 60, h.state);
    assert.equal(airLines(h, 'towAir60').length, 1, 'sixty-second call never repeats');

    // Inside 20 s: the last call, once.
    h.state.simTime = expireAt - 12;
    survivorPod.update(1 / 60, h.state);
    assert.equal(airLines(h, 'towAir20').length, 1);
    h.state.simTime = expireAt - 5;
    survivorPod.update(1 / 60, h.state);
    assert.equal(airLines(h, 'towAir20').length, 1);

    // The air voice rides the same floor contract as the grip.
    const last = airLines(h, 'towAir20')[0];
    const lastReceipt = h.receipts.find((r) => r.voiceId === last.id);
    assert.ok(lastReceipt, 'air call carries its radio receipt');
    assert.equal(lastReceipt.situation, 'distress');
    assert.ok(last.importance == null || last.importance >= 0.5, 'air calls are not flavor-tier');

    // Off the cable: the survivor stops talking.
    h.unlatch();
    h.state.simTime = expireAt - 3;
    survivorPod.update(1 / 60, h.state);
    assert.equal(h.said.length, maydayLines(h).length + gripLines(h).length
      + airLines(h, 'towAir60').length + airLines(h, 'towAir20').length,
    'nothing new spoken while unlatched');
  } finally {
    h.restore();
  }
});

test('a save/restore re-adoption does not re-speak the tow voice', () => {
  const first = boot('sector_kepler_scar');
  let stamp;
  try {
    const pod = first.ejectPod();
    first.latch(pod);
    const rec = first.state.survivorPod.causal.byEntityId[pod.id];
    first.state.simTime = rec.expireAt - 55;
    survivorPod.update(1 / 60, first.state);
    stamp = { ...pod.data.survivorPodCausal };
    assert.equal(stamp.towGripSpoken, true, 'grip stamped on the persistent record');
    assert.equal(stamp.towAir60, true, 'air call stamped on the persistent record');
  } finally {
    first.restore();
  }

  // Fresh coordinator state (save:loaded wiped it): a pod re-adopts from its entity stamp.
  // The harness mints a fresh pod body, then stamps it with the saved causal record — the
  // re-adoption path reads exactly that stamp, which is what a restored save carries.
  const second = boot('sector_kepler_scar');
  try {
    const pod = second.ejectPod(); // mints a body; its own mayday fires once, then we override
    // save:loaded wipes coordinator state while the entity keeps its data stamp — reproduce that.
    delete second.state.survivorPod.causal.byEntityId[pod.id];
    pod.data.survivorPodCausal = { ...stamp };
    second.said.length = 0;
    second.receipts.length = 0;
    second.state.simTime = stamp.expireAt - 30;
    second.latch(pod); // the tow resumes: re-adoption happens on this tick, grip stays spent
    const podId = pod.id;
    assert.ok(second.state.survivorPod.causal.byEntityId[podId], 'record re-adopted');
    assert.equal(gripLines(second).length, 0, 'grip stays spent across the restore');
    assert.equal(airLines(second, 'towAir60').length, 0, 'sixty-second call stays spent');
    second.state.simTime = stamp.expireAt - 10;
    survivorPod.update(1 / 60, second.state);
    assert.equal(airLines(second, 'towAir20').length, 1, 'an unspent threshold still speaks');
    second.latch(pod);
    assert.equal(airLines(second, 'towAir20').length, 1, 'no threshold repeats');
    assert.equal(gripLines(second).length, 0, 'a re-latch after restore does not re-grip');
  } finally {
    second.restore();
  }
});

test('without a voice helper the tow voice falls back to toasts and never fakes a receipt', () => {
  const h = boot('sector_kepler_scar', { voice: false });
  try {
    const pod = h.ejectPod();
    h.latch(pod);
    assert.equal(gripLines(h).length, 0, 'no say without a voice helper');
    assert.equal(h.receipts.length, 0, 'no audio receipt without a floor');
    const gripToasts = h.toasts.filter((t) => t.kind === 'survivorMayday' && /got us/i.test(t.text));
    assert.equal(gripToasts.length, 1, 'the grip surfaces as a toast');
    const rec = h.state.survivorPod.causal.byEntityId[pod.id];
    h.state.simTime = rec.expireAt - 55;
    survivorPod.update(1 / 60, h.state);
    const airToasts = h.toasts.filter((t) => t.kind === 'survivorMayday' && /sixty seconds/i.test(t.text));
    assert.equal(airToasts.length, 1, 'the air call surfaces too');
    assert.equal(h.receipts.length, 0, 'no audio receipt without a floor');
  } finally {
    h.restore();
  }
});

test('a same-tick custody resolve stays silent — nobody towed anybody', () => {
  const h = boot('sector_kepler_scar');
  try {
    const pod = h.ejectPod();
    // A fence berth right on top of the pair: the latch tick resolves custody immediately.
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
    assert.equal(gripLines(h).length, 0, 'instant handoff is a receipt, not a conversation');
    assert.equal(h.toasts.filter((t) => t.kind === 'survivorMayday').length, 0);
  } finally {
    h.restore();
  }
});
