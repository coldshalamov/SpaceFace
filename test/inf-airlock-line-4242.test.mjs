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
      this.children.push(child);
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

function installDocument() {
  const previous = globalThis.document;
  globalThis.document = { createElement: () => makeElement() };
  return () => { globalThis.document = previous; };
}

function holdClock() {
  const prevSet = globalThis.setTimeout;
  const prevClear = globalThis.clearTimeout;
  let current = null;
  globalThis.setTimeout = (fn) => {
    current = fn;
    return 1;
  };
  globalThis.clearTimeout = () => { current = null; };
  return {
    fire() {
      const fn = current;
      current = null;
      if (fn) fn();
    },
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
