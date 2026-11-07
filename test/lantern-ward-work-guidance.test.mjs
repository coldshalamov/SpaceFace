import test from 'node:test';
import assert from 'node:assert/strict';
import { lanternWardWorkGuidance } from '../src/data/lanternWardGuidance.js';
import { selectLanternWardDialogue } from '../src/missions/lanternWardStory.js';

function state(overrides = {}) {
  return { npcJobs: { lanternWard: { version: 1, initialized: true, phase: 'blocked',
    blocked: true, workS: 0, objects: {}, history: {}, ...overrides } } };
}

test('arrival offers two physical routes and identifies the family cup separately from the memorial', () => {
  const s = state(), before = structuredClone(s), result = lanternWardWorkGuidance(s);
  assert.equal(result.step, 'choose_route');
  assert.match(result.lines[0], /tow the fallen mast/i);
  assert.match(result.lines[0], /loaded cradle.*south rim/i);
  assert.match(result.lines[1], /northeast.*planted window/);
  assert.match(result.lines[1], /three brass strokes.*memorial plinth stays dark/);
  assert.deepEqual(s, before, 'asking for guidance cannot accept, move or settle anything');
});

test('current service phases replace the opening obstruction instructions', () => {
  for (const [phase, expected] of [['transit', 'transit'], ['recovering', 'recovering'],
    ['interrupted', 'resume'], ['brace', 'handoff'], ['connect', 'connect'], ['installed', 'complete']]) {
    const result = lanternWardWorkGuidance(state({ phase }));
    assert.equal(result.step, expected, phase);
    assert.doesNotMatch(result.lines[0], /tow the fallen mast|borrow the loaded cradle/, phase);
  }
  assert.equal(lanternWardWorkGuidance(state({ phase: 'waiting', blocked: false })).step, 'ready');
});

test('an interrupted handoff explains where the original goes and when the player releases it', () => {
  const result = lanternWardWorkGuidance(state({ phase: 'interrupted' }));
  assert.match(result.lines[0], /original lamp to its cradle/);
  assert.match(result.lines[0], /receiving cup.*directly/);
  assert.match(result.lines[0], /release your Massline/);
});

test('lost originals and unavailable service equipment are distinct from repairable contacts', () => {
  const lampLost = lanternWardWorkGuidance(state({ phase: 'installed', objects: { lamp: { lost: true } } }));
  assert.equal(lampLost.step, 'lamp_lost');
  assert.match(lampLost.lines[0], /replacement lamp cannot/);
  assert.equal(lanternWardWorkGuidance(state({ phase: 'damaged', objects: { receiver: { lost: true } } })).step, 'receiver_lost');
  assert.equal(lanternWardWorkGuidance(state({ lampMissing: true })).step, 'find_original');
  assert.equal(lanternWardWorkGuidance(state({ phase: 'missing' })).step, 'unavailable');
  const repair = lanternWardWorkGuidance(state({ phase: 'damaged' }));
  assert.equal(repair.step, 'repair');
  assert.match(repair.lines[0], /one ELECTRONICS.*original.*match speed.*hail/);
});

test('a missing cradle cannot cancel a valid household handoff or an installed lamp', () => {
  for (const phase of ['brace', 'connect', 'installed']) {
    const s = state({ phase, objects: { cradle: { lost: true } }, cradleAway: true });
    assert.notEqual(lanternWardWorkGuidance(s).step, 'cradle_lost', phase);
  }
  const missing = lanternWardWorkGuidance(state({ phase: 'missing', objects: { cradle: { lost: true } } }));
  assert.equal(missing.step, 'cradle_lost');
  assert.match(missing.lines[0], /same lamp alongside the receiving cup/);
});

test('connection progress follows attended work and resets honestly after Continue', () => {
  const saved = state({ phase: 'connect', workS: 9 });
  assert.match(lanternWardWorkGuidance(saved).status, /50%/);
  const restored = JSON.parse(JSON.stringify(saved));
  // The work owner deliberately clears attended work on restore; guidance must
  // read that new value rather than infer completion from an earlier hail.
  restored.npcJobs.lanternWard.workS = 0;
  assert.match(lanternWardWorkGuidance(restored).status, /0%/);
  for (const [workS, expected] of [[Infinity, '0%'], [NaN, '0%'], [-18, '0%'], [36, '100%']]) {
    assert.ok(lanternWardWorkGuidance(state({ phase: 'connect', workS })).status.endsWith(expected));
  }
  assert.match(lanternWardWorkGuidance(saved).lines[0], /restarts this check/);
});

test('a displaced, previously settled lamp directs reconnection without resetting service history', () => {
  const s = state({ phase: 'displaced', needsReinstall: true,
    firstCompletionReceipt: { receiptId: 'lantern-ward:venn-family-lamp:service:01' },
    history: { installations: 1, recovered: true, lampStolen: true } });
  const before = structuredClone(s), result = lanternWardWorkGuidance(s);
  assert.equal(result.step, 'reconnect');
  assert.match(result.lines[0], /same lamp.*previous service remains recorded/);
  assert.deepEqual(s, before);
});

test('Nessa does not call a missing cradle a missing lamp, or demand a cradle after installation', () => {
  const base = { districtId: 'district_helios_lantern_ward', phase: 'missing',
    missingLamp: false, cradleMissing: true, serviceMissing: true };
  assert.match(selectLanternWardDialogue(base).text, /cradle.*away/i);
  assert.match(selectLanternWardDialogue({ ...base, cradleMissing: false }).text, /equipment or operator/);
  const installed = selectLanternWardDialogue({ ...base, phase: 'installed', installed: true, serviceMissing: false });
  assert.match(installed.text, /circuit is live/);
});
