// W2-C / O17: the NPC bridle-cut cooldown ledger is keyed actorId:attachmentId, and attachment ids
// only ever grow, so it used to keep one row per bridle ever cut for the whole session. Expired
// rows are dropped on every write; the cooldown itself behaves exactly as before.
import test from 'node:test';
import assert from 'node:assert/strict';

import { tetherGameplay, TWIN_BRIDLE_DEF_ID } from '../src/systems/tetherGameplay.js';

const COOLDOWN_TICKS = 90;

function rig() {
  const entities = new Map();
  const owner = { id: 10, alive: true, pos: { x: 0, z: 0 } };
  const target = { id: 11, alive: true, pos: { x: 100, z: 0 } };
  const cutter = {
    id: 20, alive: true, pos: { x: 50, z: 10 },
    data: { enemyTypeId: 'tether_control_raider' },
  };
  for (const e of [owner, target, cutter]) entities.set(e.id, e);
  const byId = {};
  const state = {
    tick: 0,
    playerId: 1,
    entities,
    combat: { attachments: { byId } },
  };
  const breaks = [];
  let retire = true;
  const kernel = {
    attachments: {
      breakAttachment(attachment, reason, actorId) {
        breaks.push({ id: attachment.id, reason, actorId });
        if (retire) attachment.state = 'broken';
        return { ok: true };
      },
    },
  };
  const host = Object.create(tetherGameplay);
  host.state = state;
  host.registry = { get: (name) => (name === 'combat' ? { kernel } : null) };
  host.bus = { emit() {} };
  host._npcBridleCutTicks = new Map();
  const addBridle = (id) => {
    byId[id] = {
      id, defId: TWIN_BRIDLE_DEF_ID, state: 'active', controllerId: state.playerId,
      ownerId: owner.id, targetId: target.id,
    };
    return byId[id];
  };
  const cut = (tick) => host._handleNPCBridleCounterplay({
    entityId: cutter.id, phase: 'attach_window', doctrineId: 'tether_control_raider', tick,
  });
  return { host, addBridle, cut, breaks, keepActive: () => { retire = false; } };
}

test('many cut/retire cycles keep the cooldown ledger bounded', () => {
  const { host, addBridle, cut, breaks } = rig();
  let peak = 0;
  for (let i = 0; i < 400; i++) {
    addBridle(`att_${i}`);
    const result = cut(i * 40); // a fresh bridle every 40 ticks: at most 3 rows live in a 90-tick window
    assert.ok(result, `cycle ${i} cut`);
    peak = Math.max(peak, host._npcBridleCutTicks.size);
  }
  assert.equal(breaks.length, 400, 'every fresh bridle was cut');
  assert.ok(peak <= 3, `ledger never held more than the live cooldown window (peak=${peak})`);
  assert.ok(host._npcBridleCutTicks.size <= 3, `still bounded after the run (size=${host._npcBridleCutTicks.size})`);
});

test('the per-bridle cooldown is unchanged', () => {
  const { host, addBridle, cut, breaks, keepActive } = rig();
  keepActive(); // the cut does not retire the line, so the same key is probed again
  addBridle('att_a');
  assert.ok(cut(1000), 'first cut lands');
  assert.equal(cut(1000 + COOLDOWN_TICKS - 1), null, 'inside the cooldown the same bridle is not cut again');
  assert.equal(breaks.length, 1);
  assert.ok(cut(1000 + COOLDOWN_TICKS), 'cooldown over: the same bridle can be cut again');
  assert.equal(breaks.length, 2);
  assert.equal(host._npcBridleCutTicks.size, 1, 'one actor:attachment row');
});

test('a row inside its cooldown survives other cuts\' pruning', () => {
  const { host, addBridle, cut, keepActive } = rig();
  keepActive();
  addBridle('att_a');
  addBridle('att_b');
  assert.ok(cut(500)); // nearest bridle by id tie-break cuts first
  const first = [...host._npcBridleCutTicks.keys()][0];
  host.state.combat.attachments.byId[first.split(':')[1]].state = 'broken'; // retire it, leave the other
  assert.ok(cut(520), 'the second bridle is cut inside the first one\'s window');
  assert.equal(host._npcBridleCutTicks.size, 2, 'the unexpired first row was kept');
  addBridle('att_c');
  assert.ok(cut(520 + COOLDOWN_TICKS + 1));
  assert.ok(host._npcBridleCutTicks.size <= 2, 'expired rows were dropped');
});
