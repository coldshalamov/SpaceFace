// Range door & funnel tests (PQ-163.01 — "The Range is the door").
//
// Verifies that:
// 1. After the first latch, onboarding points at the Range (F4).
// 2. Opening the Range from that prompt is recorded as a telemetry funnel event (range:opened).
// 3. SWING, DO NOT PULL is the entry rung when that is the lesson.
// 4. Honest telemetry is recorded without inventing fake unaided-player percentages.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { makeEntity } from '../src/core/entity.js';
import { onboarding } from '../src/systems/onboarding.js';
import { RANGE_POINTER_LINE } from '../src/ui/hudAttention.js';
import {
  buildRangeOpenedFunnelEvent,
  freshRescueState,
  makeRescueCastSpecs,
  RESCUE_PROOF_SEED,
} from '../src/onboarding/rescueOpening.js';
import {
  rangeScreen,
  recordRangeOpened,
  resolveRescueEntryRung,
} from '../src/ui/screens/range.js';

// Minimal DOM stub for presentation panel reads in unit tests
function stubElement() {
  const children = [];
  return {
    children,
    style: {},
    dataset: {},
    textContent: '',
    innerHTML: '',
    classList: {
      contains: () => false,
      add: () => {},
      remove: () => {},
      toggle: () => {},
    },
    appendChild(child) {
      children.push(child);
      return child;
    },
    prepend(child) {
      children.unshift(child);
      return child;
    },
    remove() {
      const idx = children.indexOf(this);
      if (idx >= 0) children.splice(idx, 1);
    },
    setAttribute() {},
    getAttribute: () => null,
    hasAttribute: () => false,
    removeAttribute() {},
    addEventListener() {},
    removeEventListener() {},
    querySelector: () => null,
    getBoundingClientRect: () => ({ width: 100, height: 20 }),
  };
}

globalThis.document = {
  getElementById: () => null,
  querySelector: () => null,
  head: stubElement(),
  body: stubElement(),
  documentElement: null,
  createElement: () => stubElement(),
};

function makeHarness() {
  const bus = createBus();
  const player = makeEntity({
    type: 'ship',
    team: 1,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 8,
    data: {
      weapons: [{ defId: 'pulse_laser_s', _heat: 0, heatMax: 100 }],
      combat: {},
      ai: {},
    },
  });
  player.id = 1;

  const state = {
    meta: { seed: RESCUE_PROOF_SEED },
    simTime: 12.5,
    tick: 750,
    mode: 'flight',
    settings: { gameplay: { tutorialHints: true } },
    playerId: 1,
    player: { hints: {}, targetId: null },
    entities: new Map([[1, player]]),
    entityList: [player],
    nextEntityId: 10,
    nav: {},
    combat: { attachments: { byId: {} } },
    world: { activeSector: { stations: [], gates: [] } },
    story: { beatIndex: 0 },
  };

  const spawned = [];
  const helpers = {
    spawnEntity(spec) {
      const entity = makeEntity(spec);
      entity.id = state.nextEntityId++;
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      spawned.push(entity);
      return entity;
    },
    removeEntity(id) {
      const entity = state.entities.get(id);
      if (entity) entity.alive = false;
    },
  };

  const seen = {
    rangePrompt: [],
    rangeOpened: [],
  };

  bus.on('onboarding:rangePrompt', (p) => seen.rangePrompt.push(p));
  bus.on('range:opened', (p) => seen.rangeOpened.push(p));

  const sys = Object.create(onboarding);
  sys.init({ state, bus, helpers, registry: null });

  return { bus, state, sys, helpers, spawned, seen };
}

test('after the first latch, onboarding points at the Range (F4)', () => {
  const h = makeHarness();
  h.bus.emit('game:started', {});
  h.sys.update(0.25, h.state);

  const ob = h.state.onboarding;
  assert.equal(ob.firstLatchDone, false, 'no latch before tether engagement');
  assert.equal(ob.rangePromptActive, false, 'no range prompt before first latch');

  // Emit the first latch (e.g. hooking the derelict)
  h.bus.emit('tether:latched', { targetId: 99 });
  h.sys.update(0.25, h.state);

  assert.equal(ob.firstLatchDone, true, 'firstLatchDone flagged on first latch');
  assert.equal(ob.firstLatchAt, 12.5, 'firstLatchAt records timestamp');
  assert.equal(ob.rangePromptActive, true, 'rangePromptActive armed after first latch');
  assert.equal(ob.rangePrompt, RANGE_POINTER_LINE, 'rangePrompt carries Range (F4)');
  assert.equal(ob.pointedAtRange, true, 'pointedAtRange flag set');

  // Verify bus event
  assert.equal(h.seen.rangePrompt.length, 1, 'onboarding:rangePrompt emitted');
  assert.equal(h.seen.rangePrompt[0].active, true);
  assert.equal(h.seen.rangePrompt[0].text, RANGE_POINTER_LINE);

  // Subsequent latches do not duplicate the initial prompt event
  h.bus.emit('tether:latched', { targetId: 99 });
  assert.equal(h.seen.rangePrompt.length, 1, 'first latch event fires exactly once');
});

test('SWING, DO NOT PULL is the entry rung when that is the lesson', () => {
  const h = makeHarness();
  h.bus.emit('game:started', {});

  // 1. Before latch / no prompt: starts at top of rail (0 = HEAVY HULLS TURN WIDE)
  assert.equal(resolveRescueEntryRung(h.state), 0, 'idle entry rung starts at top of rail (0)');

  // 2. Armed by the first-latch prompt: entry rung is 2 (SWING, DO NOT PULL)
  h.bus.emit('tether:latched', { targetId: 20 });
  assert.equal(resolveRescueEntryRung(h.state), 2, 'prompt armed: entry rung is SWING, DO NOT PULL (2)');

  // 3. During swing beat: entry rung is 2 (SWING, DO NOT PULL)
  h.state.onboarding.rescue.current = 'swing';
  assert.equal(resolveRescueEntryRung(h.state), 2, 'swing beat: entry rung is SWING, DO NOT PULL (2)');

  // 4. During shove beat: no dedicated rung -> falls back to top of rail (0)
  h.state.onboarding.rangePromptActive = false;
  h.state.onboarding.pointedAtRange = false;
  h.state.onboarding.rescue.current = 'shove';
  assert.equal(resolveRescueEntryRung(h.state), 0, 'shove beat starts at rail top (0)');
});

test('opening Range from that prompt is recorded (funnel)', () => {
  const h = makeHarness();
  h.bus.emit('game:started', {});
  h.bus.emit('tether:latched', { targetId: 55 });

  const ob = h.state.onboarding;
  assert.equal(ob.rangePromptActive, true);
  assert.equal(ob.rangeOpenedFromPrompt, false);

  // Simulate player opening Range while prompt is active
  h.state.simTime = 18.0;
  const evt = recordRangeOpened(h.bus, h.state);

  assert.equal(evt.type, 'range:opened');
  assert.equal(evt.fromPrompt, true, 'recorded as opened from prompt');
  assert.equal(evt.rungId, 'swing_do_not_pull', 'recorded entry rung is swing_do_not_pull');
  assert.equal(evt.rungIndex, 2);
  assert.equal(evt.atS, 18.0);

  // Event received by bus listener and recorded on onboarding state
  assert.equal(h.seen.rangeOpened.length, 1);
  assert.equal(h.seen.rangeOpened[0].fromPrompt, true);
  assert.equal(h.seen.rangeOpened[0].rungId, 'swing_do_not_pull');

  assert.equal(ob.rangeOpened, true);
  assert.equal(ob.rangeOpenedFromPrompt, true);
  assert.equal(ob.rangeOpenedAt, 18.0);
  assert.equal(ob.rangePromptActive, false, 'active prompt dismissed once opened');
  assert.deepEqual(ob.rangeFunnel, {
    opened: true,
    openedAt: 18.0,
    fromPrompt: true,
    rungId: 'swing_do_not_pull',
    rungIndex: 2,
  });
});

test('opening Range unprompted records fromPrompt: false without breaking funnel', () => {
  const h = makeHarness();
  h.bus.emit('game:started', {});

  // Player opens Range before any latch prompt
  h.state.simTime = 5.0;
  const evt = recordRangeOpened(h.bus, h.state);

  assert.equal(evt.type, 'range:opened');
  assert.equal(evt.fromPrompt, false, 'unprompted open marks fromPrompt: false');
  assert.equal(evt.rungId, 'heavy_turns_wide', 'default rail entry');
  assert.equal(evt.rungIndex, 0);

  assert.equal(h.state.onboarding.rangeOpened, true);
  assert.equal(h.state.onboarding.rangeOpenedFromPrompt, false);
});

test('a later Range open is not counted as from the first-latch prompt', () => {
  const h = makeHarness();
  h.bus.emit('game:started', {});
  h.bus.emit('tether:latched', { targetId: 55 });
  recordRangeOpened(h.bus, h.state);
  assert.equal(h.state.onboarding.rangePromptActive, false);
  assert.equal(h.state.onboarding.pointedAtRange, false);

  h.state.simTime = 40;
  const evt = recordRangeOpened(h.bus, h.state);
  assert.equal(evt.fromPrompt, false, 'second open is not from the spent prompt');
  assert.equal(h.seen.rangeOpened.length, 2);
  assert.equal(h.seen.rangeOpened[1].fromPrompt, false);
});

test('buildRangeOpenedFunnelEvent helper contract', () => {
  const event = buildRangeOpenedFunnelEvent(42.5, {
    fromPrompt: true,
    rungId: 'swing_do_not_pull',
    rungIndex: 2,
  });
  assert.deepEqual(event, {
    type: 'range:opened',
    fromPrompt: true,
    rungId: 'swing_do_not_pull',
    rungIndex: 2,
    atS: 42.5,
  });

  // Defensive fallbacks for empty / non-numeric args
  const fallback = buildRangeOpenedFunnelEvent(NaN);
  assert.deepEqual(fallback, {
    type: 'range:opened',
    fromPrompt: false,
    rungId: null,
    rungIndex: 0,
    atS: 0,
  });
});
