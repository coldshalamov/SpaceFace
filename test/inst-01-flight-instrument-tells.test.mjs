// INST-01 — the field, mass-seed, and planet tells are the flight instrument, not three cyan pills.
//
// The three bottom-center readouts (PQ-011/012/013) self-inject their own scoped sheet. Before
// INST-01 each injected a pre-reset web card: "Segoe UI" type on a flat rgba(10, 18, 28) navy
// fill with a translucent cyan border — three anachronistic cyan pills floating on a deckplate
// deck. The done sentence: those three inject no Segoe UI / rgba(10, 18, 28 cards; they use
// tokens already on #hud.
//
// Proof shape: the exported sheets are audited for the retired card and for token use, and each
// module is then driven through its REAL update() against a fixed-seed game state (4242) under a
// fake document, asserting the style node it actually appends equals the exported sheet and the
// pill still mounts inside #hud with its status/aria-live contract intact.
import assert from 'node:assert/strict';
import test from 'node:test';

import { FIELD_HUD_CSS, fieldHud } from '../src/ui/fieldHud.js';
import { MASS_SEED_HUD_CSS, massSeedHud } from '../src/ui/massSeedHud.js';
import { PLANET_HUD_CSS, planetHud } from '../src/ui/planetHud.js';
import { createGameState } from '../src/core/gameState.js';

const TELLS = [
  {
    name: 'fieldHud',
    proto: fieldHud,
    css: FIELD_HUD_CSS,
    styleId: 'sf-field-css',
    // State classes the module toggles at runtime — the paint may change, the contract may not.
    stateClasses: ['field-repulsor', 'field-denied', 'field-cooldown', 'field-current-warning', 'field-current-surge', 'field-current-calm'],
    mount: (state) => {
      state.fields = { active: [{ kind: 'well', engaged: true, expireAt: state.simTime + 8 }], cooldowns: {}, lastDenial: null };
    },
  },
  {
    name: 'massSeedHud',
    proto: massSeedHud,
    css: MASS_SEED_HUD_CSS,
    styleId: 'sf-mseed-css',
    stateClasses: ['mseed-warning', 'mseed-cooldown', 'mseed-reduced-motion'],
    mount: (state) => {
      state.massSeed = { phase: 'active', expireAt: state.simTime + 24, lockAt: state.simTime + 1 };
    },
  },
  {
    name: 'planetHud',
    proto: planetHud,
    css: PLANET_HUD_CSS,
    styleId: 'sf-planet-css',
    stateClasses: ['planet-storm', 'planet-reentry'],
    mount: (state) => {
      state.planet = { active: true, player: { region: 'skim', stage: null, heat: 0.2, collectorOn: false } };
    },
  },
];

test('INST-01: the three tells inject no Segoe UI / rgba(10, 18, 28 card', () => {
  for (const tell of TELLS) {
    assert.doesNotMatch(tell.css, /Segoe\s*UI/, `${tell.name} must not name a consumer font stack`);
    assert.doesNotMatch(tell.css, /rgba\(\s*10\s*,\s*18\s*,\s*28/,
      `${tell.name} must not hand-mix the old navy card fill`);
    // The rest of the retired cyan pill left with the card: border and ink literals.
    assert.doesNotMatch(tell.css, /rgba\(\s*120\s*,\s*190\s*,\s*235/, `${tell.name} cyan border is retired`);
    assert.doesNotMatch(tell.css, /#cfe8ff/i, `${tell.name} cyan ink is retired`);
  }
});

test('INST-01: the three tells paint with the tokens already on #hud', () => {
  for (const tell of TELLS) {
    assert.match(tell.css, /var\(--dp-/, `${tell.name} assembles deckplate tokens`);
    assert.match(tell.css, /var\(--hud-/, `${tell.name} reads the aliases defined on #hud itself`);
    // One flight instrument: the same flight-glass face and etched legend voice as the deck.
    assert.match(tell.css, /var\(--dp-glass-flight/, `${tell.name} sits on the flight glass`);
    assert.match(tell.css, /var\(--dp-face-etch/, `${tell.name} speaks the etched legend voice`);
    assert.match(tell.css, /var\(--dp-fs-etch, 12px\)/, `${tell.name} keeps the 12px floor through the token`);
  }
});

test('INST-01: the state-class contract survives the repaint', () => {
  for (const tell of TELLS) {
    for (const cls of tell.stateClasses) {
      assert.ok(tell.css.includes(cls), `${tell.name} still declares .${cls}`);
    }
    assert.match(tell.css, /forced-colors:\s*active/, `${tell.name} hands the surface back to the OS palette`);
  }
});

test('INST-01: on a fixed seed (4242) each module injects exactly the audited sheet into #hud', () => {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  const document = fakeDocument();
  globalThis.document = document;
  globalThis.window = { innerWidth: 1440, innerHeight: 900 };
  try {
    for (const tell of TELLS) {
      const state = createGameState(4242);
      state.mode = 'flight';
      state.ui = state.ui || {};
      state.ui.docked = false;
      tell.mount(state);

      const hud = Object.create(tell.proto);
      hud.init({ state, helpers: {} });
      hud.update(1 / 60, state);

      const style = document.getElementById(tell.styleId);
      assert.ok(style, `${tell.name} injects its sheet under its own id`);
      assert.equal(style.textContent, tell.css, `${tell.name} injects exactly the audited sheet`);

      const pill = style === null ? null : findInNode(document.getElementById('hud'), (node) =>
        node.className && String(node.className).includes('pill'));
      assert.ok(pill, `${tell.name} mounts its pill inside #hud`);
      assert.equal(pill.attributes.role, 'status', `${tell.name} pill keeps role=status`);
      assert.equal(pill.attributes['aria-live'], 'polite', `${tell.name} pill keeps aria-live=polite`);
      hud.destroy();
    }
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

function findInNode(node, predicate) {
  if (predicate(node)) return node;
  for (const child of node.children) {
    const found = findInNode(child, predicate);
    if (found) return found;
  }
  return null;
}

// The fake document from test/physics-hud-dom-writes.test.mjs: enough DOM for the guarded
// _ensureDom path — id lookup, appendChild, classList, setAttribute — and nothing more.
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
