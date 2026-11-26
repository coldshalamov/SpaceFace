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

function raceDom({ target = [120, 85], ship = [80, 85, 90], hint = 'AHEAD 300 wu',
  stats = '0.00s · 0 u/s · GATE 2/16', course = '' } = {}) {
  const targetNode = element({ attrs: { cx: target[0], cy: target[1] } });
  const shipNode = element({ attrs: { transform: `translate(${ship[0]} ${ship[1]}) rotate(${ship[2]})` } });
  const polyline = element({ attrs: { points: course } });
  const map = element({ query: { circle: targetNode, path: shipNode, polyline } });
  const hintNode = element({ text: hint });
  const statsNode = element({ text: stats });
  const root = element({
    query: { '.race-tape-map svg': map, '.race-tape-stats': statsNode },
    lists: { '.race-tape-hint': [hintNode] },
  });
  return { root, map, targetNode, shipNode, hintNode, statsNode };
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
    assert.equal(textCue.direction, 'left');
    assert.equal(textCue.bearingDeg, -30);
    assert.equal(textCue.distanceWU, 240);

    dom = raceDom({ target: [0, 0], ship: [0, 0, 90], hint: 'AHEAD 358 u' });
    dom.root.querySelector = selector => selector === '.race-tape-map svg' ? null : null;
    globalThis.document = { querySelector: selector => selector === '#race-tape' ? dom.root : null };
    const renderedUnitCue = readVisibleRaceCue();
    assert.equal(renderedUnitCue.distanceWU, 358,
      'the public HUD unit is parsed so the pilot can use its near-gate control');

    dom = raceDom({ target: [120, 85], ship: [135, 91, 90], hint: 'OFF COURSE · RECOVERY RUN',
      course: '40,85 120,85 120,125' });
    const missed = readVisibleRaceCue();
    assert.equal(missed.reenter, true);
    assert.ok(missed.bearingDeg < -165, 'aim is moved behind the painted checkpoint plane after a miss');
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
  let fullStop = false;
  let missedWheelOpen = false;
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
    waitForFunction: async fn => {
      state.input = { actions: { contextWheel: held.has('KeyQ') } };
      assert.equal(fn(), true, 'previous Q release is applied before reopening the wheel');
    },
    keyboard: {
      down: async code => { held.add(code); events.push(`down:${code}`); },
      up: async code => { held.delete(code); events.push(`up:${code}`); },
    },
    locator: selector => {
      if (selector === '#sf-context-wheel') return { waitFor: async () => {} };
      assert.equal(selector, '#sf-context-wheel [data-action="brake"] .sf-cwheel__face');
      return {
        waitFor: async () => {
          assert.ok(held.has('KeyQ'));
          if (!missedWheelOpen) return;
          missedWheelOpen = false;
          throw Object.assign(new Error('wheel did not open'), { name: 'TimeoutError' });
        },
        evaluate: async fn => fn({ closest: () => ({ previousElementSibling: {
          classList: { contains: name => name === 'is-on' && fullStop },
        } }) }),
        boundingBox: async () => ({ x: 80, y: 25, width: 80, height: 30 }),
      };
    },
    mouse: { click: async (x, y) => {
      assert.deepEqual([x, y], [120, 40]);
      fullStop = !fullStop;
      events.push(fullStop ? 'stop:on' : 'stop:off');
    } },
  };
  try {
    await racingCruiseBeat(page, 0);
    assert.deepEqual(events.slice(0, 2), ['down:KeyD', 'up:KeyD'], 'large gate error turns before translation');
    assert.ok(history.every(keys => !keys.includes('KeyW')), 'turn pulse carries no forward input');

    await racingCruiseBeat(page, 1);
    assert.deepEqual(events.slice(2, 6), ['down:KeyW', 'down:ShiftLeft', 'up:ShiftLeft', 'up:KeyW']);
    assert.ok(history.some(keys => keys.includes('KeyW') && keys.includes('ShiftLeft')), 'aligned pulse includes bounded boost');
    assert.equal(held.size, 0);

    let previousEvents = events.length;
    dom.statsNode.textContent = '3 · HOLD THE GRID';
    dom.hintNode.textContent = 'Accelerate on green · Touch: up drives, sides steer, down brakes';
    await racingCruiseBeat(page, 2);
    assert.deepEqual(events.slice(previousEvents), [], 'the painted countdown keeps the pilot stationary');

    for (const hint of ['BRAKE FOR TURN', 'CORRECT YOUR DRIFT', 'WRONG WAY · OFF COURSE']) {
      previousEvents = events.length;
      dom.statsNode.textContent = '9.07s · 383 u/s · GATE 3/16';
      dom.hintNode.textContent = hint;
      await racingCruiseBeat(page, 3);
      assert.deepEqual(events.slice(previousEvents), [
        'down:KeyQ', 'stop:on', 'up:KeyQ', 'down:KeyQ', 'stop:off', 'up:KeyQ',
      ], 'a visible warning gets a bounded real Full Stop pulse');
      assert.equal(fullStop, false);
    }

    previousEvents = events.length;
    missedWheelOpen = true;
    await racingCruiseBeat(page, 3);
    assert.deepEqual(events.slice(previousEvents), [
      'down:KeyQ', 'up:KeyQ', 'down:KeyQ', 'stop:on', 'up:KeyQ',
      'down:KeyQ', 'stop:off', 'up:KeyQ',
    ], 'a missed wheel opening gets another press and leaves the brake off');

    previousEvents = events.length;
    dom.statsNode.textContent = '10.02s · 0 u/s · GATE 3/16';
    dom.hintNode.textContent = 'RECOVERY RUN';
    await racingCruiseBeat(page, 4);
    assert.deepEqual(events.slice(previousEvents), ['down:KeyW', 'up:KeyW'], 'missing distance never grants boost');

    failWait = true;
    await assert.rejects(racingCruiseBeat(page, 5), /clock stopped/);
    assert.equal(held.size, 0, 'clock/error cleanup releases every public key');
  } finally {
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
    if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
  }
});
