import test from 'node:test';
import assert from 'node:assert/strict';

import { fieldHud } from '../src/ui/fieldHud.js';
import { massSeedHud } from '../src/ui/massSeedHud.js';
import { planetHud } from '../src/ui/planetHud.js';

test('stable physics HUD states do not rewrite DOM attributes every frame', () => {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  const document = fakeDocument();
  globalThis.document = document;
  globalThis.window = { innerWidth: 1440, innerHeight: 900 };
  try {
    const cases = [
      {
        name: 'Field',
        prototype: fieldHud,
        state: {
          mode: 'flight',
          ui: { docked: false },
          simTime: 1,
          fields: {
            active: [{ kind: 'well', engaged: false, expireAt: 8 }],
            cooldowns: {},
            lastDenial: null,
          },
        },
      },
      {
        name: 'Planet',
        prototype: planetHud,
        state: {
          mode: 'flight',
          ui: { docked: false },
          planet: {
            active: true,
            player: { region: 'skim', stage: null, heat: 0.2, collectorOn: false },
          },
        },
      },
      {
        name: 'Mass Seed',
        prototype: massSeedHud,
        state: {
          mode: 'flight',
          ui: { docked: false },
          settings: { video: { motionReduce: false }, accessibility: {} },
          simTime: 1,
          playerId: 'player',
          player: { massSeed: { cooldownUntil: 0 } },
          entities: new Map(),
          massSeed: { phase: 'active', expireAt: 8 },
        },
      },
    ];

    for (const entry of cases) {
      const hud = Object.create(entry.prototype);
      hud.init({ state: entry.state, helpers: {} });
      hud.update(1 / 60, entry.state);
      const writes = trackDomWriteCalls([hud._dom.root, hud._dom.pill]);
      hud.update(1 / 60, entry.state);
      assert.equal(writes.count(), 0,
        `${entry.name} HUD must not rewrite stable styles, classes, or attributes`);
      hud.destroy();
    }
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

function trackDomWriteCalls(nodes) {
  let calls = 0;
  for (const node of nodes) {
    node.style = new Proxy(node.style, {
      set(target, name, value) {
        calls += 1;
        target[name] = value;
        return true;
      },
    });
    const setAttribute = node.setAttribute.bind(node);
    node.setAttribute = (...args) => {
      calls += 1;
      return setAttribute(...args);
    };
    const toggle = node.classList.toggle.bind(node.classList);
    node.classList.toggle = (...args) => {
      calls += 1;
      return toggle(...args);
    };
  }
  return { count: () => calls };
}

function fakeDocument() {
  const roots = [];
  const makeNode = (tagName) => {
    const node = {
      tagName,
      id: '',
      className: '',
      children: [],
      parentNode: null,
      isConnected: true,
      textContent: '',
      attributes: {},
      style: { display: '' },
      appendChild(child) {
        child.parentNode = this;
        this.children.push(child);
        return child;
      },
      removeChild(child) {
        this.children = this.children.filter((entry) => entry !== child);
        child.parentNode = null;
      },
      setAttribute(name, value) {
        this.attributes[name] = String(value);
        if (name === 'class') this.className = String(value);
        if (name === 'id') this.id = String(value);
      },
    };
    node.classList = {
      contains(name) { return node.className.split(/\s+/).includes(name); },
      add(name) { if (!this.contains(name)) node.className = `${node.className} ${name}`.trim(); },
      remove(name) {
        node.className = node.className.split(/\s+/)
          .filter((entry) => entry && entry !== name).join(' ');
      },
      toggle(name, force) {
        const enabled = force === undefined ? !this.contains(name) : !!force;
        if (enabled) this.add(name); else this.remove(name);
        return enabled;
      },
    };
    return node;
  };
  const body = makeNode('body');
  const head = makeNode('head');
  const hud = makeNode('div');
  hud.id = 'hud';
  body.appendChild(hud);
  roots.push(head, body);
  const getElementById = (id) => {
    const visit = (node) => {
      if (node.id === id) return node;
      for (const child of node.children) {
        const found = visit(child);
        if (found) return found;
      }
      return null;
    };
    for (const root of roots) {
      const found = visit(root);
      if (found) return found;
    }
    return null;
  };
  return {
    body,
    head,
    documentElement: { clientWidth: 1440, clientHeight: 900 },
    createElement: makeNode,
    getElementById,
  };
}
