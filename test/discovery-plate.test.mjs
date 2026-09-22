// Feature 20 — the first-discovery plate: slides in on the durable discovery receipts
// (discovery:plateUnlocked / uniqueWreck:bearingFixed / aceMemory:transition 'encountered'),
// holds ~3 s, dedupes repeat keys, and cleans up on destroy. Driven through the real module
// with a stub DOM — no jsdom in this repo.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createDiscoveryPlate } from '../src/ui/discoveryPlate.js';
import { uniqueWreckById, UNIQUE_WRECKS } from '../src/data/uniqueWrecks.js';

function makeClassList() {
  const set = new Set();
  return {
    add(...names) { for (const n of names) set.add(n); },
    remove(...names) { for (const n of names) set.delete(n); },
    contains(n) { return set.has(n); },
    _set: set,
  };
}

function makeElement(tag = 'div') {
  const el = {
    tagName: String(tag).toUpperCase(),
    className: '',
    classList: makeClassList(),
    attributes: {},
    style: {},
    children: [],
    childNodes: [],
    parentNode: null,
    isConnected: false,
    _innerHTML: '',
    _text: '',
    set innerHTML(v) {
      this._innerHTML = String(v);
      // discoveryPlate builds three labelled children inside its frame; expose them
      // by class so querySelector can resolve kicker/title/meta.
      this._kids = {};
      for (const cls of ['sf-discovery-plate__kicker', 'sf-discovery-plate__title', 'sf-discovery-plate__meta']) {
        if (this._innerHTML.includes(cls)) {
          const kid = makeElement('div');
          kid.className = cls;
          kid.parentNode = this;
          this._kids[cls] = kid;
        }
      }
    },
    get innerHTML() { return this._innerHTML; },
    set textContent(v) { this._text = String(v); },
    get textContent() { return this._text; },
    setAttribute(k, v) { this.attributes[k] = String(v); },
    getAttribute(k) { return this.attributes[k]; },
    appendChild(child) { this.children.push(child); child.parentNode = this; child.isConnected = this._live; return child; },
    removeChild(child) {
      const i = this.children.indexOf(child);
      if (i >= 0) this.children.splice(i, 1);
      child.parentNode = null; child.isConnected = false;
    },
    removeFromParent() { if (this.parentNode) this.parentNode.removeChild(this); },
    querySelector(sel) {
      const cls = sel.replace(/^\./, '');
      return (this._kids && this._kids[cls]) || null;
    },
  };
  return el;
}

function makeDom() {
  const hud = makeElement('div');
  hud._live = true;
  const body = makeElement('body');
  body._live = true;
  const document = {
    createElement: (tag) => makeElement(tag),
    getElementById: (id) => (id === 'hud' ? hud : null),
    body,
  };
  return { document, hud, body };
}

function makeClock() {
  let now = 0;
  const rafQueue = [];
  return {
    now: () => now,
    advance(ms) { now += ms; },
    raf(cb) { rafQueue.push(cb); },
    flushRaf() { const q = rafQueue.splice(0); for (const cb of q) cb(now); },
  };
}

function installDom({ clock }) {
  const { document, hud } = makeDom();
  const saved = {
    document: globalThis.document,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    performanceNow: performance.now,
  };
  globalThis.document = document;
  globalThis.requestAnimationFrame = clock.raf;
  performance.now = clock.now;
  return {
    hud,
    restore() {
      globalThis.document = saved.document;
      globalThis.requestAnimationFrame = saved.requestAnimationFrame;
      performance.now = saved.performanceNow;
    },
  };
}

function findPlate(hud) {
  return hud.children.find((c) => c.className === 'sf-discovery-plate') || null;
}

function stateWithSector() {
  return {
    world: {
      sectors: {
        sector_ceres_belt: {
          name: 'Ceres Belt',
          pois: [{ id: 'poi_vault', name: 'The Ancient Vault', type: 'vault' }],
        },
      },
      discovery: {},
    },
  };
}

test('a discovery receipt slides a titled plate onto the HUD and retires it after ~3 s', () => {
  const clock = makeClock();
  const { hud, restore } = installDom({ clock });
  try {
    const bus = createBus();
    const plate = createDiscoveryPlate({ bus, state: stateWithSector() });
    bus.emit('discovery:plateUnlocked', { sectorId: 'sector_ceres_belt', poiId: 'poi_vault' });

    plate.tick();
    clock.flushRaf();
    const el = findPlate(hud);
    assert.ok(el, 'plate element mounts under #hud');
    assert.equal(el.style.display, 'block');
    assert.ok(el.classList.contains('sf-discovery-plate--in'), 'slide-in class applied');
    const title = el.querySelector('.sf-discovery-plate__title');
    const kicker = el.querySelector('.sf-discovery-plate__kicker');
    assert.equal(title.textContent, 'The Ancient Vault');
    assert.match(kicker.textContent, /DISCOVERY/i);

    clock.advance(2990);
    plate.tick();
    assert.equal(el.style.display, 'block', 'still visible just before TTL');
    clock.advance(20);
    plate.tick();
    assert.ok(el.classList.contains('sf-discovery-plate--out'), 'leaving class at TTL');
    clock.advance(400);
    plate.tick();
    assert.equal(el.style.display, 'none', 'plate retires after fade');
    plate.destroy();
  } finally {
    restore();
  }
});

test('repeat keys dedupe; a queued second discovery follows the first', () => {
  const clock = makeClock();
  const { hud, restore } = installDom({ clock });
  try {
    const bus = createBus();
    const plate = createDiscoveryPlate({ bus, state: stateWithSector() });
    bus.emit('discovery:plateUnlocked', { sectorId: 'sector_ceres_belt', poiId: 'poi_vault' });
    bus.emit('discovery:plateUnlocked', { sectorId: 'sector_ceres_belt', poiId: 'poi_vault' });
    bus.emit('discovery:plateUnlocked', { sectorId: 'sector_ceres_belt', poiId: 'poi_other' });
    plate.tick();
    clock.advance(3600);
    plate.tick();
    plate.tick();
    const el = findPlate(hud);
    const title = el.querySelector('.sf-discovery-plate__title');
    assert.equal(title.textContent, 'Poi Other', 'second discovery shows once the first retires');
    plate.destroy();
  } finally {
    restore();
  }
});

test('unique-wreck and flagship contacts produce their own kickers', () => {
  const clock = makeClock();
  const { hud, restore } = installDom({ clock });
  try {
    const bus = createBus();
    const plate = createDiscoveryPlate({ bus, state: stateWithSector() });
    const wreckId = UNIQUE_WRECKS[0] && UNIQUE_WRECKS[0].id;
    assert.ok(wreckId, 'fixture needs at least one authored unique wreck');
    bus.emit('uniqueWreck:bearingFixed', { wreckId, sectorId: 'sector_ceres_belt' });
    bus.emit('aceMemory:transition', { transition: 'encountered', aceId: 'ace_x', aceName: 'Vora Keth' });
    bus.emit('aceMemory:transition', { transition: 'dismissed', aceId: 'ace_y', aceName: 'Ignored' });

    plate.tick();
    const el = findPlate(hud);
    const kicker = el.querySelector('.sf-discovery-plate__kicker');
    const title = el.querySelector('.sf-discovery-plate__title');
    assert.equal(kicker.textContent, 'HISTORIC WRECK LOCATED');
    assert.equal(title.textContent, uniqueWreckById(wreckId).name || title.textContent);

    clock.advance(3600);
    plate.tick(); plate.tick();
    assert.equal(kicker.textContent, 'FLAGSHIP CONTACT');
    assert.equal(title.textContent, 'Vora Keth');

    clock.advance(3600);
    plate.tick(); plate.tick(); plate.tick();
    assert.equal(el.style.display, 'none', 'non-encountered transition never queued a third plate');
    plate.destroy();
  } finally {
    restore();
  }
});

test('destroy() unsubscribes and removes the element', () => {
  const clock = makeClock();
  const { hud, restore } = installDom({ clock });
  try {
    const bus = createBus();
    const plate = createDiscoveryPlate({ bus, state: stateWithSector() });
    plate.destroy();
    bus.emit('discovery:plateUnlocked', { sectorId: 'sector_ceres_belt', poiId: 'poi_vault' });
    plate.tick();
    assert.equal(findPlate(hud), null, 'no plate after destroy');
  } finally {
    restore();
  }
});
