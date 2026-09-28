import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { rateRelease } from '../src/systems/tetherGameplay.js';
import { masslineHud, releaseVerdictCopy } from '../src/ui/masslineHud.js';
import { MASSLINE2_FLAGS } from '../src/data/featureFlags.js';

// CV-THROW-1 — the cut-grade teaching slice. A deliberate cut gets a world-anchored verdict
// pill naming the grade and the measured cause; a snapped line is a consequence, not a
// lesson, so only `deliberate` ratings may ever reach the pill.

const player = () => ({
  id: 1, type: 'ship', alive: true, team: 0,
  pos: { x: 0, z: 0 }, vel: { x: 40, z: 0 }, rot: 0, radius: 8, mass: 200,
  data: { combat: {}, weapons: [] },
});

const payload = (id, x, z) => ({
  id, type: 'asteroid', alive: true, team: 0,
  pos: { x, z }, vel: { x: 0, z: 0 }, radius: 20, mass: 5200, data: {},
});

function initHud(state) {
  const bus = createBus();
  const hud = Object.assign({}, masslineHud);
  hud.init({ state, bus, helpers: { worldToScreen: (p) => ({ x: p.x + 300, y: p.z + 200, onScreen: true }) } });
  return { bus, hud };
}

test('CV-THROW-1 verdict copy names the grade and its measured cause', () => {
  assert.equal(releaseVerdictCopy({ classification: 'razor', releasedAtApex: true }), 'RAZOR · AT THE APEX');
  assert.equal(releaseVerdictCopy({ classification: 'razor', technique: 'swing' }), 'RAZOR · CREST RELEASE');
  assert.equal(releaseVerdictCopy({ classification: 'clean', technique: 'swing' }), 'CLEAN · CREST RELEASE');
  assert.equal(releaseVerdictCopy({ classification: 'good', technique: 'swing' }), 'GOOD · NEEDED MORE SPEED');
  assert.equal(releaseVerdictCopy({ classification: 'messy', technique: 'tow' }), 'MESSY · NEVER SWUNG');
  assert.equal(releaseVerdictCopy({ classification: 'messy', technique: 'radial' }), 'MESSY · OFF THE ARC');
  assert.equal(releaseVerdictCopy({ classification: 'messy', technique: 'slack' }), 'MESSY · LINE NOT LOADED');
  assert.equal(releaseVerdictCopy({ classification: 'messy', technique: 'unobserved' }), 'MESSY · UNGRADED');
  assert.equal(releaseVerdictCopy(null), '');
});

test('CV-THROW-1 rateRelease marks deliberate cuts and never calls a break an apex', () => {
  const p = player();
  const rock = payload(7, 120, 60);
  const state = {
    tick: 100, simTime: 5, playerId: p.id,
    player: { tether: { active: true, phase: 'taut' }, masslineTelemetry: {} },
    entities: new Map([[p.id, p], [rock.id, rock]]),
  };
  const cut = rateRelease(state, rock.id, { deliberate: true });
  assert.equal(cut.deliberate, true, 'a player-initiated release is marked deliberate');
  const breakRating = rateRelease(state, rock.id);
  assert.equal(breakRating.deliberate, false, 'a break/target-loss rating is not deliberate');
  assert.equal(breakRating.releasedAtApex, false,
    'a non-deliberate rating can never claim the apex read');
});

test('CV-THROW-1 only deliberate release ratings write a verdict, anchored at the payload', () => {
  const p = player();
  const rock = payload(7, 120, 60);
  const state = {
    simTime: 10,
    masslineDenial: null,
    masslineReleaseVerdict: null,
    player: { tether: { active: false } },
    entities: new Map([[p.id, p], [rock.id, rock]]),
  };
  const { bus } = initHud(state);

  bus.emit('tether:releaseRated', { targetId: rock.id, classification: 'messy', technique: 'tow' });
  assert.equal(state.masslineReleaseVerdict, null,
    'a rating without deliberate=true is evidence, not coaching — the pill stays silent');

  bus.emit('tether:releaseRated', {
    targetId: rock.id, classification: 'razor', technique: 'swing',
    deliberate: true, releasedAtApex: true,
  });
  const verdict = state.masslineReleaseVerdict;
  assert.ok(verdict, 'a deliberate release lands the verdict');
  assert.equal(verdict.classification, 'razor');
  assert.equal(verdict.technique, 'swing');
  assert.equal(verdict.releasedAtApex, true);
  assert.equal(verdict.targetId, rock.id);
  assert.equal(verdict.atX, rock.pos.x, 'the pill anchors at the released body');
  assert.equal(verdict.atZ, rock.pos.z);
  assert.ok(verdict.untilSimTime > state.simTime, 'the verdict carries a quantized expiry');

  bus.emit('tether:latched', { targetId: 99 });
  assert.equal(state.masslineReleaseVerdict, null,
    'a subsequent latch clears the verdict immediately — the tether mirror is the truth');
});

test('CV-THROW-1 the verdict pill renders the grade, anchors on the body, and expires', () => {
  const previousEnabled = MASSLINE2_FLAGS.enabled;
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  const document = fakeDocument();
  globalThis.document = document;
  globalThis.window = { innerWidth: 1440, innerHeight: 900 };
  MASSLINE2_FLAGS.enabled = true;
  try {
    const p = player();
    const rock = payload(7, 120, 60);
    const state = {
      mode: 'flight',
      simTime: 10,
      playerId: p.id,
      player: { tether: { active: false, targetId: null } },
      entities: new Map([[p.id, p], [rock.id, rock]]),
      settings: { video: { motionReduce: true }, accessibility: { motionPreference: 'reduce' } },
      massline2: {},
      masslineReleaseVerdict: null,
    };
    const { bus, hud } = initHud(state);
    bus.emit('tether:releaseRated', {
      targetId: rock.id, classification: 'razor', technique: 'swing',
      deliberate: true, releasedAtApex: true,
    });
    hud.update(1 / 60, state);

    const root = document.getElementById('sf-ml2');
    const preview = findByClass(root, 'ml2-preview');
    const mark = findByClass(root, 'ml2-preview-mark');
    assert.equal(preview.style.display, 'block', 'the verdict owns the pill slot while it lives');
    assert.equal(preview.textContent, 'RAZOR · AT THE APEX',
      'the pill names the grade and the cause in the bracket grammar');
    assert.equal(preview.attributes['data-bracket-state'], 'verdict');
    assert.equal(preview.attributes['data-target-id'], String(rock.id));
    assert.equal(preview.classList.contains('ml2-preview-verdict'), true);
    assert.equal(preview.classList.contains('ml2-verdict-razor'), true);
    assert.equal(mark.classList.contains('ml2-shape-can'), true,
      'an earned cut keeps the solid diamond — the mark is a result, not a denial');
    assert.equal(mark.attributes['aria-label'], 'RAZOR · AT THE APEX');

    // A messy cut reads differently — weaker shape, warn grade.
    state.masslineReleaseVerdict = null;
    bus.emit('tether:releaseRated', {
      targetId: rock.id, classification: 'messy', technique: 'tow', deliberate: true,
    });
    hud.update(1 / 60, state);
    assert.equal(preview.textContent, 'MESSY · NEVER SWUNG',
      'the cause names why the cut graded low — that is the teaching');
    assert.equal(preview.classList.contains('ml2-verdict-messy'), true);
    assert.equal(preview.classList.contains('ml2-verdict-razor'), false,
      'a new grade must not inherit the previous grade class');
    assert.equal(mark.classList.contains('ml2-shape-range'), true,
      'a sub-razor grade shows the broken ring, not the earned diamond');

    // Expiry: past untilSimTime the slot returns to ordinary acquisition state.
    state.simTime = 12.5;
    hud.update(1 / 60, state);
    assert.equal(preview.style.display, 'none', 'an expired verdict stops drawing');

    hud.destroy();
    assert.equal(state.masslineReleaseVerdict, null, 'destroy clears the verdict field');
  } finally {
    MASSLINE2_FLAGS.enabled = previousEnabled;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

function findByClass(root, className) {
  if (!root) return null;
  if (root.classList && root.classList.contains(className)) return root;
  for (const child of root.children || []) {
    const found = findByClass(child, className);
    if (found) return found;
  }
  return null;
}

function fakeDocument() {
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
      style: {
        display: '',
        transform: '',
        setProperty(name, value) { this[name] = value; },
      },
      appendChild(child) { child.parentNode = this; this.children.push(child); return child; },
      removeChild(child) { this.children = this.children.filter((entry) => entry !== child); child.parentNode = null; },
      setAttribute(name, value) {
        this.attributes[name] = String(value);
        if (name === 'class') this.className = String(value);
        if (name === 'id') this.id = String(value);
      },
    };
    node.classList = {
      contains(name) { return node.className.split(/\s+/).includes(name); },
      add(name) { if (!this.contains(name)) node.className = `${node.className} ${name}`.trim(); },
      remove(name) { node.className = node.className.split(/\s+/).filter((entry) => entry && entry !== name).join(' '); },
      toggle(name, force) {
        const shouldAdd = force === undefined ? !this.contains(name) : !!force;
        if (shouldAdd) this.add(name); else this.remove(name);
        return shouldAdd;
      },
    };
    return node;
  };
  const body = makeNode('body');
  const head = makeNode('head');
  const hud = makeNode('div');
  hud.id = 'hud';
  body.appendChild(hud);
  const roots = [head, body];
  const byId = (id) => {
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
    createElement: makeNode,
    createElementNS: (_namespace, tagName) => makeNode(tagName),
    getElementById: byId,
  };
}
