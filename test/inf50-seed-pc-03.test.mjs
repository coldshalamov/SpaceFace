// SEED-PC-03 — two NPC hulls trade one line and one reply. The player is not addressed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LANE_ERRANDS, armLaneErrands, applyLaneErrandIntent } from '../src/systems/laneErrands.js';

const SEED = 4242;

test('at least six partner errands carry a reply', () => {
  const replies = LANE_ERRANDS.filter((row) => row.partner && row.reply);
  assert.ok(replies.length >= 6, `expected >= 6 replies, got ${replies.length}`);
  for (const row of replies) {
    assert.equal(typeof row.reply, 'string');
    assert.equal(row.reply.includes('PLAYER'), false);
  }
});

test('a partner errand plays both hulls within earshot on seed 4242', () => {
  let heard = null;
  for (let n = 0; n < 160 && !heard; n++) {
    const player = { id: 1, alive: true, type: 'ship', pos: { x: 0, z: 0 }, data: { callsign: 'PLAYER-ONE' } };
    const speaker = { id: 2, alive: true, type: 'ship', pos: { x: 40, z: 0 }, rot: 0, data: { callsign: 'SPEAKER-1', trafficRole: 'hauler' } };
    const partner = { id: 3, alive: true, type: 'ship', pos: { x: 90, z: 10 }, rot: 0, data: { callsign: 'PARTNER-2', trafficRole: 'tender' } };
    const entry = {
      job: { id: 'job_s', kind: 'hauler', phase: 'transit', payload: {} },
      worldRecordId: `wr_${n}`,
      entityId: 2,
      control: null,
    };
    const partnerEntry = {
      job: { id: 'job_p', kind: 'tender', phase: 'transit', payload: {} },
      worldRecordId: `wr_${n}_p`,
      entityId: 3,
      control: null,
    };
    const toasts = [];
    const runtime = {
      state: {
        mode: 'flight',
        meta: { seed: SEED },
        simTime: 10,
        playerId: 1,
        entities: new Map([[1, player], [2, speaker], [3, partner]]),
      },
      bus: { emit(evt, payload) { if (evt === 'toast') toasts.push(payload); } },
      _byId() { return { job_s: entry, job_p: partnerEntry }; },
      _writeIntent() {},
    };
    armLaneErrands(runtime, 10);
    if (!entry.errand || !entry.errand.reply) continue;
    applyLaneErrandIntent(runtime, entry, speaker, 10);
    if (toasts.length === 2) heard = { toasts, entry };
  }
  assert.ok(heard, 'no two-hull exchange armed');
  assert.equal(heard.toasts[0].speakerId, 2);
  assert.equal(heard.toasts[1].speakerId, 3);
  assert.equal(heard.toasts[1].text, heard.entry.errand.reply);
  assert.equal(heard.toasts.some((row) => row.speakerId === 1), false);
  assert.equal(heard.toasts.some((row) => String(row.text).includes('PLAYER-ONE')), false);
  const motions = new Set(LANE_ERRANDS.map((row) => row.motion));
  assert.equal(motions.has('face'), true);
  assert.equal([...motions].every((motion) => ['brake', 'half', 'flash', 'face', 'orbit', 'weave'].includes(motion)), true);
});
