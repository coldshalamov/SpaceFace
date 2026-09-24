// INF-003: the default swarm HUD does no repeated DOM work on a steady tick, and every
// lock/damage/cooldown-adjacent transition (threat census, chain, countdown, death) still paints.
import assert from 'node:assert/strict';
import test from 'node:test';

import { survivalHud } from '../src/ui/survivalHud.js';

const writes = { text: 0, style: 0, attr: 0, hidden: 0, classToggle: 0 };
function resetWrites() {
  for (const key of Object.keys(writes)) writes[key] = 0;
}
function totalWrites() {
  return Object.values(writes).reduce((a, b) => a + b, 0);
}

function countingEl(tag) {
  const el = {
    tag,
    children: [],
    parentNode: null,
    isConnected: true,
    style: new Proxy({}, { set(t, p, v) { writes.style++; t[p] = v; return true; } }),
    dataset: {},
    classList: {
      toggle() { writes.classToggle++; },
      add() {},
      remove() {},
      contains() { return false; },
    },
    _text: '',
    _hidden: false,
    className: '',
    id: '',
    appendChild(c) { c.parentNode = this; this.children.push(c); return c; },
    removeChild(c) {
      const i = this.children.indexOf(c);
      if (i >= 0) this.children.splice(i, 1);
      if (c.parentNode === this) c.parentNode = null;
      return c;
    },
    setAttribute() { writes.attr++; },
  };
  Object.defineProperty(el, 'textContent', {
    get() { return this._text; },
    set(v) { writes.text++; this._text = String(v); },
  });
  Object.defineProperty(el, 'hidden', {
    get() { return this._hidden; },
    set(v) { writes.hidden++; this._hidden = !!v; },
  });
  return el;
}

function installDocument() {
  const prev = globalThis.document;
  const head = countingEl('head');
  globalThis.document = {
    body: { classList: { toggle() { writes.classToggle++; }, remove() {} } },
    head,
    querySelector() { return countingEl('host'); },
    getElementById() { return null; },
    createElement(tag) { return countingEl(tag); },
  };
  return () => { globalThis.document = prev; };
}

function capturingBus() {
  const handlers = new Map();
  return {
    on(event, fn) {
      if (!handlers.has(event)) handlers.set(event, []);
      handlers.get(event).push(fn);
      return () => {};
    },
    emit(event, payload) {
      for (const fn of handlers.get(event) || []) fn(payload);
    },
  };
}

function swarmState() {
  return {
    mode: 'flight',
    simTime: 100,
    tick: 6000,
    ui: {},
    run: {
      kind: 'survival', phase: 'active', ruleset: 'swarm', arenaId: 'helios_core',
      wave: 3, threatBudget: 40, spawnedThreat: 40, resolvedThreat: 10,
      score: 1000, credits: 50, xp: 200, level: 2,
    },
  };
}

function mount() {
  const restore = installDocument();
  resetWrites();
  const bus = capturingBus();
  const state = swarmState();
  const hud = Object.create(survivalHud);
  hud.init({ state, bus });
  hud.update(1 / 60, state);
  resetWrites();
  return {
    hud, bus, state,
    dom: () => hud._dom,
    step(n = 1) {
      for (let i = 0; i < n; i++) {
        state.simTime += 1 / 60;
        state.tick += 1;
        hud.update(1 / 60, state);
      }
    },
    done() {
      hud.destroy();
      restore();
    },
  };
}

test('a steady swarm tick performs zero repeated DOM mutations', () => {
  const fx = mount();
  try {
    fx.step(120);
    assert.equal(totalWrites(), 0, `steady ticks must not touch the DOM, got ${JSON.stringify(writes)}`);
  } finally {
    fx.done();
  }
});

test('threat census transitions still paint figure and meter at once', () => {
  const fx = mount();
  try {
    // No wave clock yet: a swarm run scores kills as a bare figure, threat meter parked hidden.
    fx.state.run.resolvedThreat = 11;
    fx.step(1);
    assert.equal(fx.dom().killFig.textContent, '11', 'kill figure follows the census');
    assert.equal(fx.dom().threat.hidden, true, 'threat meter stays parked without a wave clock');
    resetWrites();
    fx.step(60);
    assert.equal(totalWrites(), 0, 'the settled census costs nothing further');
  } finally {
    fx.done();
  }
});

test('chain appear, countdown tick, and death line all paint through the guards', () => {
  const fx = mount();
  try {
    fx.bus.emit('swarm:chain', { chain: 7, best: 7, cause: 'gun', step: 1, at: fx.state.simTime });
    fx.step(1);
    assert.equal(fx.dom().chainRow.hidden, false, 'a live chain shows its row');
    assert.equal(fx.dom().chainFig.textContent, '7', 'chain figure paints');
    fx.bus.emit('swarm:chainBroken', {});
    fx.step(1);
    assert.equal(fx.dom().chainRow.hidden, true, 'a broken chain hides its row again');

    // The HUD never ticks the clock itself: it renders the published payload on arrival.
    fx.bus.emit('run:waveProgress', { wave: 3, remainingTicks: 3600, durationTicks: 3600 });
    fx.step(1);
    assert.equal(fx.dom().threatFig.textContent, '0:60', 'countdown clock paints on arrival');
    assert.equal(fx.dom().threat.hidden, false, 'the meter unparks with the clock');
    resetWrites();
    fx.step(59);
    assert.equal(fx.dom().threatFig.textContent, '0:60', 'no payload means no repaint');
    assert.equal(totalWrites(), 0, 'holding the second costs nothing');
    fx.bus.emit('run:waveProgress', { wave: 3, remainingTicks: 3540, durationTicks: 3600 });
    fx.step(1);
    assert.equal(fx.dom().threatFig.textContent, '0:59', 'the next payload ticks the clock');

    fx.bus.emit('player:death', { killerId: 9, attacker: 'Raider', weapon: 'pulse-bolt' });
    fx.step(1);
    assert.equal(fx.dom().death.hidden, false, 'death keeps its line on the glass');
    assert.match(fx.dom().death.textContent, /Raider · pulse-bolt/, 'death names the cause');
  } finally {
    fx.done();
  }
});

test('a remounted readout repaints instead of trusting the old mount cache', () => {
  const fx = mount();
  try {
    fx.step(5);
    fx.dom().root.isConnected = false;
    fx.step(1);
    assert.equal(fx.dom().killFig.textContent, '10', 'fresh nodes repaint the census');
    assert.equal(fx.dom().chainRow.hidden, true, 'fresh nodes repaint visibility');
    assert.equal(fx.dom().threat.hidden, true, 'fresh nodes repaint the parked meter');
  } finally {
    fx.done();
  }
});
