// SEED-PC-07 — a trucker names another live hull and that hull's real state.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LANE_ERRANDS, armLaneErrands, applyLaneErrandIntent } from '../src/systems/laneErrands.js';

const SEED = 4242;

function pack(status, recordId) {
  const player = { id: 1, alive: true, type: 'ship', pos: { x: 0, z: 0 }, data: { callsign: 'PLAYER-ONE' } };
  const speaker = { id: 2, alive: true, type: 'ship', pos: { x: 30, z: 0 }, rot: 0, data: { callsign: 'SPEAKER-1', trafficRole: 'hauler' } };
  const data = { callsign: 'BULK-9', trafficRole: 'hauler' };
  if (status === 'loaded') data.loaded = true;
  if (status === 'disabled') data.disabled = true;
  if (status === 'fleeing') data.fleeing = true;
  const other = { id: 4, alive: true, type: 'ship', pos: { x: 400, z: 40 }, data };
  const entry = {
    job: { id: 'job_s', kind: 'hauler', phase: 'transit', payload: {} },
    worldRecordId: recordId,
    entityId: 2,
    control: null,
  };
  const toasts = [];
  const runtime = {
    state: {
      mode: 'flight',
      meta: { seed: SEED },
      simTime: 10,
      playerId: 1,
      entities: new Map([[1, player], [2, speaker], [4, other]]),
    },
    bus: { emit(evt, payload) { if (evt === 'toast') toasts.push(payload); } },
    _byId() { return { job_s: entry }; },
    _writeIntent() {},
  };
  return { runtime, entry, speaker, other, toasts };
}

test('at least six errands can name another hull', () => {
  const rows = LANE_ERRANDS.filter((row) => row.gossip && row.line.includes('{callsign}') && row.line.includes('{state}'));
  assert.ok(rows.length >= 6, `expected >= 6 gossip lines, got ${rows.length}`);
  const motions = new Set(LANE_ERRANDS.map((row) => row.motion));
  assert.equal([...motions].every((motion) => ['brake', 'half', 'flash', 'face', 'orbit', 'weave'].includes(motion)), true);
});

test('the named hull is a live entity and the word matches its state', () => {
  const row = LANE_ERRANDS.find((item) => item.gossip);
  for (const status of ['loaded', 'disabled', 'fleeing']) {
    const { runtime, entry, speaker, other, toasts } = pack(status, `hand_${status}`);
    entry.errand = {
      id: row.id,
      motion: row.motion,
      until: 99,
      line: row.line,
      gossip: true,
      said: false,
      origin: { x: 30, z: 0 },
      started: 10,
      partnerId: null,
      subjectId: other.id,
    };
    applyLaneErrandIntent(runtime, entry, speaker, 10);
    assert.equal(toasts.length, 1, status);
    assert.equal(toasts[0].speakerId, speaker.id);
    assert.equal(toasts[0].text.includes('BULK-9'), true, toasts[0].text);
    assert.equal(toasts[0].text.includes(status), true, toasts[0].text);
    assert.equal(toasts[0].text.includes('PLAYER-ONE'), false);
    const named = [...runtime.state.entities.values()].find((entity) => entity.data && entity.data.callsign === 'BULK-9');
    assert.equal(named && named.id, other.id);
  }
});

test('seed 4242 arms a gossip line about a hull that exists', () => {
  let heard = null;
  for (let n = 0; n < 240 && !heard; n++) {
    const built = pack('loaded', `wr_${n}`);
    armLaneErrands(built.runtime, 10);
    if (!built.entry.errand || !built.entry.errand.gossip) continue;
    applyLaneErrandIntent(built.runtime, built.entry, built.speaker, 10);
    if (built.toasts.length === 1 && built.toasts[0].text.includes('BULK-9')) heard = built;
  }
  assert.ok(heard, 'no gossip errand armed');
  assert.equal(heard.toasts[0].text.includes('loaded'), true);
  assert.equal(heard.toasts[0].text.includes('PLAYER-ONE'), false);
  assert.equal(heard.runtime.state.entities.has(heard.entry.errand.subjectId), true);
});
