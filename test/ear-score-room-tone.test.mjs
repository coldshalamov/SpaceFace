import assert from 'node:assert/strict';
import test from 'node:test';

import { createBandBedRuntime } from '../src/audio/bandBeds.js';
import { resolveThemeMatrix, sectorBedToBandIntent } from '../src/audio/themeMatrix.js';
import { ROOM_PROFILES, resolveRoomProfile, resolveRoomPedal, ROOM_TONE_NODES_PER_GRAPH } from '../src/audio/roomTone.js';
import { createScoreDirector } from '../src/audio/scoreDirector.js';

function param(v = 0) {
  return {
    value: v, events: [],
    setTargetAtTime(x, t) { this.value = x; this.events.push(['target', x, t]); },
    setValueAtTime(x, t) { this.events.push(['set', x, t]); },
    linearRampToValueAtTime(x, t) { this.events.push(['ramp', x, t]); },
    cancelScheduledValues() {},
  };
}

function mockCtx() {
  const ctx = { currentTime: 0, sampleRate: 8000, created: 0, live: new Set() };
  const node = (extra = {}) => {
    ctx.created += 1;
    const n = { connect() {}, disconnect() { ctx.live.delete(n); }, ...extra };
    ctx.live.add(n);
    return n;
  };
  ctx.createGain = () => node({ gain: param(1) });
  ctx.createBiquadFilter = () => node({ type: '', frequency: param(0), Q: param(0) });
  ctx.createStereoPanner = () => node({ pan: param(0) });
  ctx.createOscillator = () => node({ type: '', frequency: param(0), detune: param(0), start() {}, stop() {} });
  ctx.createBufferSource = () => node({ buffer: null, loop: false, playbackRate: param(1), start() {}, stop() {} });
  ctx.createBuffer = (ch, len) => ({ getChannelData: () => new Float32Array(len) });
  return ctx;
}

function placeIntent(input) { return sectorBedToBandIntent(resolveThemeMatrix(input).bed); }

test('every place has designed room tone; the berth leaves the pedal to the station hum', () => {
  const d = createScoreDirector();
  const rooms = new Set();
  for (const sectorId of ['sector_helios_prime', 'sector_ceres_belt', 'sector_vesta_forge', 'sector_veil_nebula', 'sector_sker_haven', 'sector_charon_expanse']) {
    const frame = d.step({ sectorId }, rooms.size * 30);
    rooms.add(resolveRoomProfile(frame).id);
  }
  assert.equal(rooms.size, 6, 'six sectors, six different rooms');
  assert.equal(resolveRoomProfile(d.step({ sectorId: 'sector_helios_prime', docked: true }, 500)).id, 'berth');
  assert.equal(ROOM_PROFILES.berth.sub, 0);
  for (const row of Object.values(ROOM_PROFILES)) assert.ok(row.level > 0 && row.level <= 0.06);
  // Faction colours the pedal over the sector tonic.
  const concord = resolveRoomPedal(createScoreDirector().step({ sectorId: 'sector_helios_prime', factionId: 'faction_scn' }, 0));
  const reach = resolveRoomPedal(createScoreDirector().step({ sectorId: 'sector_helios_prime', factionId: 'faction_reach' }, 0));
  assert.equal(concord.rootHz, reach.rootHz);
  assert.notEqual(concord.interval, reach.interval);
});

test('band runtime: the place tick drives the room and score frame; a fight thins the room, the aftermath brings it back', () => {
  const ctx = mockCtx();
  const rt = createBandBedRuntime(ctx, { connect() {} }, { random: () => 0.5 });
  const levels = {};
  const tick = (input, seconds, label) => {
    for (let i = 0; i < seconds * 10; i += 1) { ctx.currentTime += 0.1; rt.setIntent(placeIntent(input)); }
    levels[label] = rt.room.activeGraph.output.gain.value;
    return rt.scoreFrame;
  };
  const base = { sectorId: 'sector_ceres_belt', factionId: 'faction_dmc' };
  assert.equal(tick(base, 4, 'travel').phase, 'travel');
  assert.equal(tick({ ...base, threat: 0.9, inCombat: true }, 6, 'fight').phase, 'fight');
  assert.equal(tick({ ...base, threat: 0 }, 4, 'aftermath').phase, 'aftermath');
  assert.ok(levels.fight < levels.travel * 0.5, 'combat takes the ear from the room');
  assert.ok(levels.aftermath > levels.fight * 2, 'the room is the first thing back');
  assert.ok(rt.activeGraph && rt.activeGraph.bedSig.includes('bed_ceres'), 'sector carrier stays live');
  // Sparse life events are pulsed on the pooled event gain, never new nodes.
  const created = ctx.created;
  tick(base, 30, 'travel2');
  assert.equal(ctx.created, created, 'thirty seconds of room life allocate no nodes');
  assert.ok(rt.room.activeGraph.events > 3);
});

test('bounded: a sector-hopping tape never holds more than two room graphs or leaks nodes', () => {
  const ctx = mockCtx();
  const rt = createBandBedRuntime(ctx, { connect() {} }, { random: () => 0.5 });
  const sectors = ['sector_helios_prime', 'sector_ceres_belt', 'sector_vesta_forge', 'sector_pallas_drift', 'sector_io_reach'];
  for (let i = 0; i < 200; i += 1) {
    ctx.currentTime += 0.1;
    rt.setIntent(placeIntent({ sectorId: sectors[Math.floor(i / 3) % sectors.length], docked: i % 50 > 44 }));
  }
  const roomGraphs = [rt.room.activeGraph, rt.room.fadingGraph].filter(Boolean);
  assert.ok(roomGraphs.length <= 2);
  for (const g of roomGraphs) assert.ok(g.nodes.length <= ROOM_TONE_NODES_PER_GRAPH);
  // Two room graphs + two carrier graphs bound the live set.
  assert.ok(ctx.live.size <= 2 * ROOM_TONE_NODES_PER_GRAPH + 2 * 9, `live nodes ${ctx.live.size}`);
  rt.destroy();
  assert.equal(ctx.live.size, 0);
});

test('a tuned Band station keeps the carrier while the place tick keeps the room', () => {
  const ctx = mockCtx();
  const rt = createBandBedRuntime(ctx, { connect() {} }, { random: () => 0.5 });
  rt.setIntent(placeIntent({ sectorId: 'sector_helios_prime' }));
  rt.setIntent({ active: true, strength: 0.8, channelId: 'concord_bulletin', bed: { kind: 'civil_service' } });
  const radio = rt.activeGraph;
  assert.equal(radio.profileKey, 'civil_service');
  for (let i = 0; i < 20; i += 1) { ctx.currentTime += 0.1; rt.setIntent(placeIntent({ sectorId: 'sector_helios_prime' })); }
  assert.equal(rt.activeGraph, radio, 'the 10 Hz place tick no longer retunes the radio away');
  assert.ok(rt.room.activeGraph);
  rt.setIntent({ active: false, reason: 'off-air' });
  ctx.currentTime += 0.1;
  rt.setIntent(placeIntent({ sectorId: 'sector_helios_prime' }));
  assert.ok(rt.activeGraph.bedSig.includes('bed_helios'), 'off air, the sector carrier returns');
  rt.setIntent({ active: false, reason: 'pause' });
  assert.equal(rt.activeGraph, null);
  assert.equal(rt.room.activeGraph, null);
});

test('a new session does not inherit the last session\'s fight, and pause clears the room fast', () => {
  const ctx = mockCtx();
  const rt = createBandBedRuntime(ctx, { connect() {} }, { random: () => 0.5 });
  for (let i = 0; i < 30; i += 1) { ctx.currentTime += 0.1; rt.setIntent(placeIntent({ sectorId: 'sector_helios_prime' })); }
  for (let i = 0; i < 30; i += 1) { ctx.currentTime += 0.1; rt.setIntent(placeIntent({ sectorId: 'sector_helios_prime', threat: 0.9, inCombat: true })); }
  assert.equal(rt.scoreFrame.phase, 'fight');
  ctx.currentTime += 0.1;
  const pausedAt = ctx.currentTime;
  rt.setIntent({ active: false, reason: 'pause' });
  assert.ok(rt.room.fadingGraph.stopAt <= pausedAt + 0.13, 'the room does not play on behind the menu');
  ctx.currentTime += 8;
  for (let i = 0; i < 5; i += 1) { ctx.currentTime += 0.1; rt.setIntent(placeIntent({ sectorId: 'sector_helios_prime' })); }
  assert.notEqual(rt.scoreFrame.phase, 'aftermath', 'a loaded or new session starts its own story');
  rt.resetScore();
  assert.equal(rt.scoreFrame, null);
});
