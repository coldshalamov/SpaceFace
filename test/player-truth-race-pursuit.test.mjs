import test from 'node:test';
import assert from 'node:assert/strict';
import { readVisibleRaceCue, racingCruiseBeat } from '../scripts/player-truth/driver.mjs';

function element({ attrs = {}, text = '', query = {}, lists = {} } = {}) {
  return {
    hidden: false,
    textContent: text,
    getAttribute: key => attrs[key] ?? null,
    querySelector: selector => query[selector] || null,
    querySelectorAll: selector => lists[selector] || [],
  };
}

function raceDom({ target = [120, 85], ship = [80, 85, 90], hint = 'AHEAD 300 wu' } = {}) {
  const targetNode = element({ attrs: { cx: target[0], cy: target[1] } });
  const shipNode = element({ attrs: { transform: `translate(${ship[0]} ${ship[1]}) rotate(${ship[2]})` } });
  const map = element({ query: { circle: targetNode, path: shipNode } });
  const hintNode = element({ text: hint });
  const root = element({
    query: { '.race-tape-map svg': map },
    lists: { '.race-tape-hint': [hintNode] },
  });
  return { root, map, targetNode, shipNode, hintNode };
}

test('race pilot reads the painted map target and text fallback only', () => {
  const oldDocument = globalThis.document;
  try {
    let dom = raceDom({ target: [120, 110], ship: [80, 85, 90], hint: 'RIGHT 900 wu' });
    globalThis.document = { querySelector: selector => selector === '#race-tape' ? dom.root : null };
    const mapCue = readVisibleRaceCue();
    assert.equal(mapCue.direction, 'right');
    assert.ok(mapCue.bearingDeg > 30 && mapCue.bearingDeg < 35);
    assert.equal(mapCue.distanceWU, 900);

    dom = raceDom({ target: [0, 0], ship: [0, 0, 90], hint: 'LEFT 240 wu' });
    dom.root.querySelector = selector => selector === '.race-tape-map svg' ? null : null;
    globalThis.document = { querySelector: selector => selector === '#race-tape' ? dom.root : null };
    const textCue = readVisibleRaceCue();
    assert.deepEqual(textCue, { direction: 'left', bearingDeg: -30, distanceWU: 240, hintText: 'LEFT 240 wu' });
  } finally {
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
  }
});

test('race pilot turns before thrust, then uses a bounded aligned boost pulse and releases on errors', async () => {
  const oldDocument = globalThis.document;
  const oldWindow = globalThis.window;
  const dom = raceDom({ target: [120, 110], ship: [80, 85, 90], hint: 'RIGHT 900 wu' });
  const state = { simTime: 0 };
  const held = new Set();
  const events = [];
  const history = [];
  let failWait = false;
  globalThis.document = { querySelector: selector => selector === '#race-tape' ? dom.root : null };
  globalThis.window = { SF: { state } };
  const page = {
    evaluate: async (fn, arg) => {
      const source = String(fn);
      if (source.includes('resolveActionCodes')) return 'ShiftLeft';
      return fn(arg);
    },
    waitForTimeout: async () => {
      history.push([...held]);
      if (failWait) throw new Error('clock stopped');
      state.simTime += 0.1;
      if (held.has('KeyD')) {
        dom.targetNode.getAttribute = key => key === 'cx' ? '120' : key === 'cy' ? '85' : null;
        dom.hintNode.textContent = 'AHEAD 300 wu';
      }
    },
    keyboard: {
      down: async code => { held.add(code); events.push(`down:${code}`); },
      up: async code => { held.delete(code); events.push(`up:${code}`); },
    },
  };
  try {
    await racingCruiseBeat(page, 0);
    assert.deepEqual(events.slice(0, 2), ['down:KeyD', 'up:KeyD'], 'large gate error turns before translation');
    assert.ok(history.every(keys => !keys.includes('KeyW')), 'turn pulse carries no forward input');

    await racingCruiseBeat(page, 1);
    assert.deepEqual(events.slice(2, 6), ['down:KeyW', 'down:ShiftLeft', 'up:ShiftLeft', 'up:KeyW']);
    assert.ok(history.some(keys => keys.includes('KeyW') && keys.includes('ShiftLeft')), 'aligned pulse includes bounded boost');
    assert.equal(held.size, 0);

    failWait = true;
    await assert.rejects(racingCruiseBeat(page, 2), /clock stopped/);
    assert.equal(held.size, 0, 'clock/error cleanup releases every public key');
  } finally {
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
    if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
  }
});
