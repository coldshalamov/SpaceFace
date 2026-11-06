// A line scratched at the airlock is readable when it is written. Seed 4242.
// The ship's own bulkhead line stays on the ship.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { GRAFFITI } from '../src/data/narrative.js';
import { mountPlaceGraffiti, placeGraffitiDisplay } from '../src/ui/comms.js';

function makeClassList() {
  const set = new Set();
  return {
    add(...names) { for (const name of names) set.add(name); },
    remove(...names) { for (const name of names) set.delete(name); },
    contains(name) { return set.has(name); },
  };
}

function makeElement() {
  return {
    className: '',
    classList: makeClassList(),
    attributes: {},
    style: {},
    children: [],
    parentNode: null,
    set textContent(value) { this._text = String(value); },
    get textContent() { return this._text || ''; },
    setAttribute(key, value) { this.attributes[key] = String(value); },
    getAttribute(key) { return this.attributes[key]; },
    appendChild(child) {
      if (child.parentNode) child.remove();
      this.children.push(child);
      child.parentNode = this;
      return child;
    },
    insertBefore(child, reference) {
      if (child.parentNode) child.remove();
      const index = reference ? this.children.indexOf(reference) : -1;
      if (index < 0) this.children.push(child);
      else this.children.splice(index, 0, child);
      child.parentNode = this;
      return child;
    },
    remove() {
      const parent = this.parentNode;
      if (!parent) return;
      const index = parent.children.indexOf(this);
      if (index >= 0) parent.children.splice(index, 1);
      this.parentNode = null;
    },
  };
}

function installDocument(stationTape = null) {
  const previous = globalThis.document;
  globalThis.document = {
    createElement: () => makeElement(),
    querySelector: (selector) => selector === '#screens > .sx-berth.orr-station:not([aria-hidden="true"]) .sxb-tape'
      ? (typeof stationTape === 'function' ? stationTape() : stationTape) : null,
  };
  return () => { globalThis.document = previous; };
}

function holdClock() {
  const prevSet = globalThis.setTimeout;
  const prevClear = globalThis.clearTimeout;
  let current = null;
  const jobs = [];
  globalThis.setTimeout = (fn) => {
    const job = { fn, cancelled: false };
    jobs.push(job);
    current = job;
    return job;
  };
  globalThis.clearTimeout = (job) => {
    if (job) job.cancelled = true;
    if (current === job) current = null;
  };
  return {
    fire() {
      const job = current;
      current = null;
      if (job && !job.cancelled) {
        job.cancelled = true;
        job.fn();
      }
    },
    fireStale(index) { jobs[index]?.fn(); },
    restore() {
      globalThis.setTimeout = prevSet;
      globalThis.clearTimeout = prevClear;
    },
  };
}

test('docking shows the airlock line and leaves the bulkhead on the ship', () => {
  const restore = installDocument();
  const state = createGameState(4242);
  const clock = holdClock();
  const bus = createBus();
  const parent = makeElement();
  const graffiti = mountPlaceGraffiti(bus, state, parent);
  try {
    assert.equal(placeGraffitiDisplay(false, true).airlock, '');
    assert.equal(placeGraffitiDisplay(false, true).bulkhead, 'none');
    assert.equal(placeGraffitiDisplay(false, false).airlock, 'none');
    assert.equal(placeGraffitiDisplay(true, false).bulkhead, 'block');

    bus.emit('graffiti:show', {
      line: "IF YOU'RE READING THIS WE DIDN'T MAKE IT. DON'T TAKE IT PERSONALLY.",
      where: 'bulkhead',
      beat: 0,
    });
    bus.emit('graffiti:show', {
      line: GRAFFITI.THEY_KNEW_THE_MASS,
      where: 'airlock',
      beat: 0,
    });
    bus.emit('graffiti:show', {
      line: GRAFFITI.HELIOS_NOT_NEEDED,
      where: 'airlock',
      beat: 0,
    });

    assert.equal(graffiti.airlockLine.textContent, 'THEY KNEW THE MASS.');
    assert.equal(graffiti.airlock.classList.contains('sf-airlock--visible'), true);
    assert.equal(graffiti.airlock.attributes['aria-hidden'], 'false');
    clock.fire();
    assert.equal(graffiti.airlockLine.textContent, "HELIOS DIDN'T NEED IT. THEY TOOK IT ANYWAY.");
    assert.equal(graffiti.airlock.classList.contains('sf-airlock--visible'), true);
    assert.equal(
      graffiti.bulkheadLine.textContent,
      "IF YOU'RE READING THIS WE DIDN'T MAKE IT. DON'T TAKE IT PERSONALLY.",
    );
    assert.equal(graffiti.bulkhead.classList.contains('sf-bulkhead--visible'), true);
    assert.equal(state.ui.graffiti.length, 2);
    assert.equal(state.ui.graffiti[0].where, 'airlock');
    assert.equal(state.ui.graffiti[0].line, 'THEY KNEW THE MASS.');
    assert.equal(state.ui.graffiti[1].line, "HELIOS DIDN'T NEED IT. THEY TOOK IT ANYWAY.");
  } finally {
    graffiti.destroy();
    bus.clear();
    clock.restore();
    restore();
  }
});

test('a live airlock line moves into the berth narrative flow while docked and returns on undock', () => {
  const tape = makeElement();
  let stationMounted = false;
  const restore = installDocument(() => stationMounted ? tape : null);
  const state = createGameState(4242);
  const bus = createBus();
  const home = makeElement();
  const graffiti = mountPlaceGraffiti(bus, state, home);
  try {
    bus.emit('graffiti:show', { line: 'THEY KNEW THE MASS.', where: 'airlock' });
    bus.emit('dock:docked', {});
    assert.equal(graffiti.airlock.parentNode, home, 'dock intent precedes the canonical docked-state write');
    state.ui.docked = true;
    stationMounted = true;
    bus.emit('ui:screenTop', { id: null });
    assert.equal(graffiti.airlock.parentNode, tape);
    assert.equal(graffiti.airlock.classList.contains('sf-airlock--station'), true);
    assert.equal(tape.children[0], graffiti.airlock);

    bus.emit('dock:undocked', {});
    assert.equal(graffiti.airlock.parentNode, tape, 'undock intent precedes the canonical state clear');
    state.ui.docked = false;
    stationMounted = false;
    bus.emit('ui:screenTop', { id: null });
    assert.equal(graffiti.airlock.parentNode, home);
    assert.equal(graffiti.airlock.classList.contains('sf-airlock--station'), false);
  } finally {
    graffiti.destroy();
    bus.clear();
    restore();
  }
});

test('an active flight quote registers with the HUD allocator only while its flight overlay is visible', () => {
  const restore = installDocument();
  const state = createGameState(4242);
  state.mode = 'flight';
  state.ui.docked = false;
  const bus = createBus();
  const clock = holdClock();
  const home = makeElement();
  const registered = new Set();
  const hud = {
    registerExternalFlightCaption(node) { registered.add(node); },
    releaseExternalFlightCaption(node) { registered.delete(node); },
  };
  const graffiti = mountPlaceGraffiti(bus, state, home, () => hud);
  try {
    bus.emit('graffiti:show', { line: 'RETURN TO THE DARK BETWEEN STATIONS.', where: 'airlock' });
    assert.equal(registered.has(graffiti.airlock), true);
    assert.equal(graffiti.airlock.classList.contains('sf-airlock--flight-safe'), true);

    bus.emit('dock:docked', {});
    assert.equal(registered.has(graffiti.airlock), true, 'dock event arrives before the state writer');
    state.ui.docked = true;
    bus.emit('ui:screenTop', { id: 'station' });
    assert.equal(registered.has(graffiti.airlock), false);
    assert.equal(graffiti.airlock.classList.contains('sf-airlock--flight-safe'), false);

    bus.emit('dock:undocked', {});
    state.ui.docked = false;
    bus.emit('ui:screenTop', { id: null });
    assert.equal(registered.has(graffiti.airlock), true);

    clock.fire(); // end the existing eight-second hold; the fading quote remains allocated
    assert.equal(registered.has(graffiti.airlock), true);
    clock.fire(); // complete the 400ms fade and release the safe-band claim
    assert.equal(registered.has(graffiti.airlock), false);
  } finally {
    graffiti.destroy();
    bus.clear();
    clock.restore();
    restore();
  }
});

test('the final docked line stays in the tape through its fade, then releases the flow slot', () => {
  const tape = makeElement();
  const restore = installDocument(tape);
  const state = createGameState(4242);
  state.ui.docked = true;
  const bus = createBus();
  const clock = holdClock();
  const home = makeElement();
  const graffiti = mountPlaceGraffiti(bus, state, home);
  try {
    bus.emit('graffiti:show', { line: 'THEY KNEW THE MASS.', where: 'airlock' });
    assert.equal(graffiti.airlock.parentNode, tape);

    clock.fire(); // the eight-second hold ends and starts the existing opacity fade
    assert.equal(graffiti.airlock.classList.contains('sf-airlock--visible'), false);
    assert.equal(graffiti.airlock.parentNode, tape, 'keep the fading text in station flow');

    clock.fire(); // the 400ms fade settles and releases the temporary tape row
    assert.equal(graffiti.airlock.parentNode, home);
    assert.equal(graffiti.airlock.classList.contains('sf-airlock--station'), false);
  } finally {
    graffiti.destroy();
    bus.clear();
    clock.restore();
    restore();
  }
});

test('a replacement line cannot be moved by an expired fade cleanup', () => {
  const tape = makeElement();
  const restore = installDocument(tape);
  const state = createGameState(4242);
  state.ui.docked = true;
  const bus = createBus();
  const clock = holdClock();
  const home = makeElement();
  const graffiti = mountPlaceGraffiti(bus, state, home);
  try {
    bus.emit('graffiti:show', { line: 'THEY KNEW THE MASS.', where: 'airlock' });
    clock.fire(); // end hold; timeout job 1 is the pending fade cleanup
    bus.emit('graffiti:show', { line: 'THEY ALWAYS KNEW THE MASS.', where: 'airlock' });
    assert.equal(graffiti.airlockLine.textContent, 'THEY ALWAYS KNEW THE MASS.');
    assert.equal(graffiti.airlock.classList.contains('sf-airlock--visible'), true);

    clock.fireStale(1);
    assert.equal(graffiti.airlock.parentNode, tape);
    assert.equal(graffiti.airlock.classList.contains('sf-airlock--station'), true);
    assert.equal(graffiti.airlock.classList.contains('sf-airlock--visible'), true);
  } finally {
    graffiti.destroy();
    bus.clear();
    clock.restore();
    restore();
  }
});

test('a yard line is readable and a repeat dock does not stack the same scratch', () => {
  const restore = installDocument();
  const state = createGameState(4242);
  state.ui.docked = true;
  const bus = createBus();
  const graffiti = mountPlaceGraffiti(bus, state, makeElement());
  try {
    bus.emit('graffiti:show', { line: 'COUNT YOUR EXITS BEFORE YOU COUNT YOUR CREDITS.', where: 'shipyard' });
    bus.emit('graffiti:show', { line: 'COUNT YOUR EXITS BEFORE YOU COUNT YOUR CREDITS.', where: 'shipyard' });
    assert.equal(graffiti.airlockLine.textContent, 'COUNT YOUR EXITS BEFORE YOU COUNT YOUR CREDITS.');
    assert.equal(graffiti.airlock.classList.contains('sf-airlock--visible'), true);
    assert.equal(state.ui.graffiti.length, 1);
    assert.equal(graffiti.bulkheadLine.textContent, '');
  } finally {
    graffiti.destroy();
    bus.clear();
    restore();
  }
});
