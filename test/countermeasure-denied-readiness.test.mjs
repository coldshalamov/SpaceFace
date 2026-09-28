/**
 * INF — the countermeasure must not be a silent keypress. The player under missile lock gets:
 *   1. first press deploys (locks broken, timers armed);
 *   2. a second press 1s later is REFUSED OUT LOUD — countermeasure:denied {kind, readyIn>0},
 *      the one-voice alert, and the shared deny cue (today that press was `return false`);
 *   3. effectT reaches 0 exactly durationS after deploy, and threatHalo's exported slot-state
 *      flips cooling→ready on the same tick the sim's cooldownT clamps to 0 (no UI lag);
 *   4. the live halo paints the read on the inbound-missile slot: data-cm mode, recharge frac,
 *      and the effect word ('JAMMING 4s' for the ECM module), hidden with no CM or no threat.
 * Deterministic on seed 4242.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { mulberry32 } from '../src/core/rng.js';
import { countermeasures, countermeasureReadiness } from '../src/systems/countermeasures.js';
import { countermeasureSlotState, createThreatHalo } from '../src/ui/threatHalo.js';

const DT = 1 / 60;
const CHAFF = { durationS: 3.5, cooldownS: 8 };
const SEED = 4242;

function makeBus() {
  const handlers = {};
  const seen = {};
  return {
    on(name, fn) { (handlers[name] || (handlers[name] = [])).push(fn); },
    emit(name, payload) {
      (seen[name] || (seen[name] = [])).push(payload);
      for (const fn of handlers[name] || []) fn(payload);
    },
    events(name) { return seen[name] || []; },
  };
}

function boot({ fittings = ['mod_chaff_dispenser_m'], withMissile = true } = {}) {
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    team: 0,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 8,
    flags: {},
    cap: 100,
    data: { fittings, weapons: [], combat: {}, derived: { cap: 100 } },
  };
  // The pirate holding the player under missile lock (the threat that justifies the verb).
  const pirate = {
    id: 7,
    type: 'ship',
    alive: true,
    team: 1,
    pos: { x: -400, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 8,
    data: { fittings: [], weapons: [], combat: { lockTarget: 1, lockProgress: 1 }, derived: {} },
  };
  const missile = {
    id: 20,
    type: 'projectile',
    alive: true,
    pos: { x: 220, z: 0 },
    vel: { x: -90, z: 0 },
    rot: Math.PI,
    radius: 1,
    data: { kind: 'missile', targetId: 1, turnRate: 2.8, projSpeed: 90 },
  };
  const entities = new Map([[1, player], [7, pirate], [20, missile]]);
  const state = {
    mode: 'flight',
    playerId: 1,
    tick: 120,
    simTime: 2,
    meta: { seed: SEED },
    rng: mulberry32(SEED),
    player: {},
    input: { fire: false, deployCountermeasure: false, actions: {} },
    combat: { beams: [] },
    entities,
    entityList: withMissile ? [player, pirate, missile] : [player, pirate],
    entityIndex: {
      __spacefaceEntityIndexV1: true,
      ships: [player, pirate],
      projectiles: withMissile ? [missile] : [],
    },
  };
  const bus = makeBus();
  const helpers = { getEntity: (id) => state.entities.get(id), spawnEntity() { return null; } };
  const cm = Object.create(countermeasures);
  cm.init({ state, bus, helpers });
  return { state, cm, bus, player, pirate };
}

function press(cm, state, ticks = 1) {
  state.input.deployCountermeasure = true;
  tickSim(cm, state, ticks);
  state.input.deployCountermeasure = false;
}

function tickSim(cm, state, n = 1) {
  for (let i = 0; i < n; i++) {
    state.tick += 1;
    state.simTime += DT;
    cm.update(DT, state);
  }
}

test('seed 4242: first press deploys under missile lock; second press 1s later denies out loud', () => {
  const { state, cm, bus, player, pirate } = boot();

  press(cm, state, 1);
  const deployed = bus.events('countermeasure:deployed');
  assert.equal(deployed.length, 1, 'first press must deploy');
  assert.equal(bus.events('countermeasure:denied').length, 0, 'a ready press never denies');
  assert.equal(player.data.cm.effectT, CHAFF.durationS, 'effect armed at durationS');
  assert.equal(player.data.cm.cooldownT, CHAFF.cooldownS, 'cooldown armed at cooldownS');
  assert.equal(pirate.data.combat.lockTarget, null, 'chaff under missile lock breaks the lock');

  tickSim(cm, state, 60); // one full second of cooldown age passes with no press
  press(cm, state, 1); // the player presses X again while the dispenser is still recharging
  const denied = bus.events('countermeasure:denied');
  assert.equal(denied.length, 1, 'the press on cooldown must emit exactly one denial');
  const payload = denied[0];
  assert.equal(payload.shipId, 1);
  assert.equal(payload.kind, 'chaff');
  assert.equal(payload.reason, 'cooldown');
  const expectedReadyIn = CHAFF.cooldownS - 61 * DT;
  assert.ok(payload.readyIn > 0, `readyIn must be positive, got ${payload.readyIn}`);
  assert.ok(Math.abs(payload.readyIn - expectedReadyIn) < 1e-9,
    `readyIn ${payload.readyIn} should be the live remainder ${expectedReadyIn}`);
  assert.equal(payload.tick, state.tick, 'denial stamps the sim tick');
  assert.equal(bus.events('countermeasure:deployed').length, 1, 'no second deploy happened');

  const alert = bus.events('alert').pop();
  assert.equal(alert.key, 'cm-denied');
  assert.equal(alert.sev, 'warn');
  assert.equal(alert.text, 'COUNTERMEASURE RECHARGING 7s', `got: ${alert.text}`);
  assert.equal(alert.ttl, 1.6);
  assert.ok(bus.events('audio:cue').some((c) => c.id === 'ui_deny'), 'denied press plays the deny cue');
});

test('seed 4242: pressing X with no module fitted denies honestly instead of dropping silently', () => {
  const { state, cm, bus } = boot({ fittings: [] });
  press(cm, state, 1);
  const denied = bus.events('countermeasure:denied');
  assert.equal(denied.length, 1, 'the no_module branch must emit too');
  assert.equal(denied[0].reason, 'no_module');
  assert.equal(denied[0].kind, null);
  assert.equal(denied[0].shipId, 1);
  const alert = bus.events('alert').pop();
  assert.equal(alert.text, 'NO COUNTERMEASURE FITTED');
  assert.ok(bus.events('audio:cue').some((c) => c.id === 'ui_deny'));
  assert.equal(bus.events('countermeasure:deployed').length, 0);
});

test('seed 4242: effectT reaches 0 exactly durationS after deploy and the slot-state flips cooling→ready on the same tick', () => {
  const { state, cm, player } = boot();
  press(cm, state, 1);
  const deploySim = state.simTime;

  let effectZeroElapsed = null;
  let readyElapsed = null;
  let firstLabel = null;
  for (let i = 0; i <= Math.ceil(CHAFF.cooldownS / DT) + 2; i++) {
    tickSim(cm, state, 1); // plain sim ticks — no deploy edge, the verb stays untouched
    const cmRT = player.data.cm;
    const readiness = countermeasureReadiness(player);
    const slot = countermeasureSlotState(readiness, true);
    const elapsed = state.simTime - deploySim;

    // The UI read must agree with the sim timer tick-for-tick — that IS "the same tick".
    assert.equal(slot.mode === 'ready', cmRT.cooldownT === 0,
      `tick ${state.tick}: slot mode ${slot.mode} vs cooldownT ${cmRT.cooldownT}`);
    assert.ok(Math.abs(slot.frac - (1 - cmRT.cooldownT / CHAFF.cooldownS)) < 1e-9,
      'slot frac is the live recharge fill');
    if (cmRT.effectT > 0) {
      assert.equal(slot.mode, 'effect');
      // Same boundary rule as the pure fn: float dust just above a whole second snaps down.
      assert.equal(slot.label, `CHAFF ${Math.max(1, Math.ceil(cmRT.effectT - 1e-9))}s`);
      if (firstLabel === null) firstLabel = slot.label;
    } else if (cmRT.cooldownT > 0) {
      assert.equal(slot.mode, 'cooling');
      assert.equal(slot.label, null);
    } else {
      assert.equal(slot.mode, 'ready');
      assert.equal(slot.frac, 1);
    }
    if (effectZeroElapsed === null && cmRT.effectT === 0) effectZeroElapsed = elapsed;
    if (readyElapsed === null && cmRT.cooldownT === 0) readyElapsed = elapsed;
  }

  assert.equal(firstLabel, 'CHAFF 4s', 'the effect word opens at the seconds ceiling');
  assert.ok(effectZeroElapsed >= CHAFF.durationS - 1e-9
    && effectZeroElapsed <= CHAFF.durationS + DT + 1e-9,
    `effectT must hit 0 within one tick of durationS, elapsed ${effectZeroElapsed}`);
  assert.ok(readyElapsed >= CHAFF.cooldownS - 1e-9
    && readyElapsed <= CHAFF.cooldownS + DT + 1e-9,
    `cooldown must release within one tick of cooldownS, elapsed ${readyElapsed}`);
  assert.ok(Math.abs(readyElapsed - effectZeroElapsed - (CHAFF.cooldownS - CHAFF.durationS)) <= DT + 1e-9,
    'the ready window opens exactly cooldownS-durationS after the effect ends');
});

// ── DOM side: the real createThreatHalo paints the read on the missile slot ────────────────────
// The mock harness does not parse innerHTML, so the SVG circle resolves to null there; the slot's
// data-cm / data-cm-frac attributes carry the same state the circle stroke would draw.

function mockDocument() {
  const elements = [];
  const fakeElement = (tag) => {
    const el = {
      tagName: String(tag || 'div').toUpperCase(),
      className: '',
      attributes: {},
      style: {},
      children: [],
      innerHTML: '',
      parentNode: null,
      setAttribute(k, v) { this.attributes[k] = String(v); },
      removeAttribute(k) { delete this.attributes[k]; },
      getAttribute(k) { return this.attributes[k]; },
      appendChild(child) {
        this.children.push(child);
        child.parentNode = this;
        return child;
      },
      removeChild(child) {
        const idx = this.children.indexOf(child);
        if (idx >= 0) this.children.splice(idx, 1);
        child.parentNode = null;
      },
    };
    elements.push(el);
    return el;
  };
  return { elements, document: { createElement: fakeElement } };
}

function busOf() {
  const listeners = new Map();
  return {
    on(name, fn) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(fn);
      return () => listeners.get(name).delete(fn);
    },
    emit(name, payload) {
      for (const fn of listeners.get(name) || []) fn(payload);
    },
  };
}

function domBoot({ fittings = ['mod_chaff_dispenser_m'], cm } = {}) {
  const mock = mockDocument();
  const oldDoc = globalThis.document;
  globalThis.document = mock.document;
  const halo = createThreatHalo(mock.document.createElement('div'), busOf());
  const player = {
    id: 'p', type: 'ship', team: 0, alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    data: { fittings, cm: cm || { cooldownT: 0, effectT: 0, effect: null } },
  };
  const missile = {
    id: 'm1', type: 'projectile', alive: true,
    pos: { x: 2400, z: 0 }, vel: { x: -90, z: 0 },
    data: { kind: 'missile', targetId: 'p' },
  };
  const state = { tick: 100, simTime: 100 / 60, playerId: player.id, entityList: [player, missile] };
  const project = (world, out) => {
    out.x = 640 + world.x;
    out.y = 360 + world.z;
    out.onScreen = false;
    return out;
  };
  const done = () => { globalThis.document = oldDoc; };
  return { mock, halo, player, missile, state, project, done };
}

function missileSlots(mock) {
  return mock.elements.filter((el) => String(el.className).includes('sf-threat-halo__slot--missile'));
}

test('halo paints the countermeasure read on the missile slot and flips cooling→ready on the slot itself', () => {
  const { mock, halo, player, state, project, done } = domBoot({
    cm: { cooldownT: 6.5, effectT: 0, effect: null },
  });
  try {
    halo.update(player, state, project);
    const slots = missileSlots(mock).filter((el) => el.style.display === 'block');
    assert.equal(slots.length, 1, 'the inbound seeker holds one missile slot');
    const slot = slots[0];
    assert.equal(slot.attributes['data-cm'], 'cooling', 'mid-recharge reads as cooling');
    assert.equal(slot.attributes['data-cm-frac'], '0.19', `frac = 1 - 6.5/8 (got ${slot.attributes['data-cm-frac']})`);
    assert.equal(slot._sfCmLabel.style.display, 'none', 'no effect word while only recharging');

    // Same slot, same threat, the tick the cooldown releases: the read flips to ready.
    player.data.cm.cooldownT = 0;
    player.data.cm.effectT = 0;
    halo.update(player, state, project);
    assert.equal(slot.attributes['data-cm'], 'ready', 'cooling→ready flips on the slot');
    assert.equal(slot.attributes['data-cm-frac'], '1.00');
    assert.equal(slot._sfCmLabel.style.display, 'none');
  } finally {
    done();
  }
});

test('while an effect is live the slot carries the duration word — JAMMING 4s for the ECM module', () => {
  const { mock, halo, player, state, project, done } = domBoot({
    fittings: ['mod_ecm_jammer_l'],
    cm: { cooldownT: 9, effectT: 4, effect: { cfg: { kind: 'ecm' } } },
  });
  try {
    halo.update(player, state, project);
    const slot = missileSlots(mock).find((el) => el.style.display === 'block');
    assert.ok(slot, 'threat slot visible under effect');
    assert.equal(slot.attributes['data-cm'], 'effect');
    assert.equal(slot._sfCmLabel.textContent, 'JAMMING 4s', `got: ${slot._sfCmLabel.textContent}`);
    assert.equal(slot._sfCmLabel.style.display, 'block');
    assert.equal(slot._sfCmRing.style.display, 'block', 'the recharge ring stays on during the effect');
  } finally {
    done();
  }
});

test('the read is contextual: no CM fitted or no inbound seeker leaves no countermeasure trace', () => {
  const { mock, halo, player, state, project, done } = domBoot({ fittings: [] });
  try {
    halo.update(player, state, project);
    const slot = missileSlots(mock).find((el) => el.style.display === 'block');
    assert.ok(slot, 'the missile threat itself still shows');
    assert.equal(slot.attributes['data-cm'], undefined, 'no CM fitted: plain chevron, no socket');
    assert.equal(slot._sfCmRing.style.display, 'none');
    assert.equal(slot._sfCmLabel.style.display, 'none');
  } finally {
    done();
  }

  const noThreat = domBoot({ cm: { cooldownT: 6.5, effectT: 0, effect: null } });
  try {
    noThreat.state.entityList = [noThreat.player];
    noThreat.halo.update(noThreat.player, noThreat.state, noThreat.project);
    const shown = missileSlots(noThreat.mock).filter((el) => el.style.display === 'block');
    assert.equal(shown.length, 0, 'no inbound seeker: no slots, so no countermeasure read either');
  } finally {
    noThreat.done();
  }
});
