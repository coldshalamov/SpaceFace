import test from 'node:test';
import assert from 'node:assert/strict';

import * as scoring from '../src/combat/masslineTargetScoring.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';
import { createBus } from '../src/core/eventBus.js';
import { masslineHud } from '../src/ui/masslineHud.js';
import { MASSLINE2_FLAGS } from '../src/data/featureFlags.js';

const player = () => ({
  id: 1,
  type: 'ship',
  alive: true,
  team: 0,
  pos: { x: 0, z: 0 },
  vel: { x: 70, z: 0 },
  rot: 0,
  radius: 8,
  mass: 200,
  data: { combat: {}, weapons: [] },
});

const target = (id, type, x, z, options = {}) => ({
  id,
  type,
  alive: true,
  team: options.team ?? 0,
  pos: { x, z },
  vel: { x: options.vx ?? 0, z: options.vz ?? 0 },
  radius: options.radius ?? 10,
  mass: options.mass ?? 500,
  data: options.data || {},
});

test('PQ-004 contextual scorer makes closeness, turn direction, and cursor precision the leading explainable signals', () => {
  assert.equal(typeof scoring.classifyMasslineIntent, 'function',
    'PQ-004 must add its contextual classifier to the existing T03 scorer owner');

  const p = player();
  const anchor = target('anchor-right', 'asteroid', 150, 145, { mass: 5200, radius: 34 });
  const decoy = target('decoy-left', 'ship', 105, -40, {
    mass: 80,
    team: 1,
    data: { ai: { huntPlayer: true } },
  });
  const candidates = [anchor, decoy];
  const context = scoring.classifyMasslineIntent(p, candidates, {
    turnIntent: 1,
    moveZ: 1,
    intentDir: { x: 0.72, z: 0.69 },
    cursorPrecisionOf: () => 0,
    isHostile: (candidate) => candidate.id === decoy.id,
  });
  assert.equal(context.id, 'massive-anchor-sling');

  const ranked = scoring.rankMasslineTargets(p, candidates, {
    context,
    intentDir: { x: 0.72, z: 0.69 },
    cursorPrecisionOf: () => 0,
    isHostile: (candidate) => candidate.id === decoy.id,
  });
  assert.equal(ranked[0].id, anchor.id,
    'forward+right steering must beat an off-intent hostile selected by the weapon layer');
  assert.deepEqual(ranked[0].reasons.context.leadingSignals,
    ['turn', 'proximity', 'cursor'], 'the three player-authored signals stay the highest weights');
  assert.ok(ranked[0].reasons.context.axes.turn > ranked[1].reasons.context.axes.turn);
});

test('PQ-004 genuinely precise cursor paint overrides the broad anchor preference', () => {
  assert.equal(typeof scoring.classifyMasslineIntent, 'function');
  const p = player();
  const anchor = target('anchor-right', 'asteroid', 150, 145, { mass: 5200, radius: 34 });
  const decoy = target('towable-decoy', 'wreck', 105, -40, { mass: 80 });
  const candidates = [anchor, decoy];
  const cursorPrecisionOf = (candidate) => candidate.id === decoy.id ? 1 : 0;
  const context = scoring.classifyMasslineIntent(p, candidates, {
    turnIntent: 1,
    moveZ: 1,
    intentDir: { x: 0.72, z: 0.69 },
    cursorPrecisionOf,
  });
  assert.equal(context.id, 'tow/salvage');
  assert.equal(context.explicitId, decoy.id);

  const ranked = scoring.rankMasslineTargets(p, candidates, {
    context,
    intentDir: { x: 0.72, z: 0.69 },
    cursorPrecisionOf,
  });
  assert.equal(ranked[0].id, decoy.id, 'precise paint must win immediately');
  assert.equal(ranked[0].reasons.context.explicit, true);
});

test('PQ-004 scripted clutter matrix selects the turn-side heavy anchor in at least 19/20 transformed and permuted scenes', () => {
  const deviceInputs = [
    { device: 'keyboard/mouse', turnIntent: 1, moveX: 0, moveZ: 1 },
    { device: 'trackpad', turnIntent: 1, moveX: 0, moveZ: 1 },
    { device: 'gamepad', turnIntent: 1, moveX: 0, moveZ: 1 },
  ];
  let correct = 0;
  const receipts = [];
  for (let index = 0; index < 20; index++) {
    const angle = (index % 5) * Math.PI * 0.4;
    const offset = { x: (index % 4) * 37 - 55, z: Math.floor(index / 4) * 23 - 46 };
    const intentDir = { x: Math.cos(angle), z: Math.sin(angle) };
    const sideDir = { x: -intentDir.z, z: intentDir.x };
    const p = { id: 'player', pos: offset, vel: { x: 0, z: 0 }, rot: angle };
    const anchor = target(`anchor-${index}`, 'asteroid',
      offset.x + intentDir.x * 185, offset.z + intentDir.z * 185,
      { mass: 6200, radius: 34, vx: sideDir.x * 45, vz: sideDir.z * 45 });
    const decoy = target(`decoy-${index}`, 'ship',
      offset.x + intentDir.x * 108 + sideDir.x * 32,
      offset.z + intentDir.z * 108 + sideDir.z * 32,
      { mass: 85, team: 1, data: { ai: { huntPlayer: true }, combat: {} } });
    const tow = target(`tow-${index}`, 'payload',
      offset.x - sideDir.x * 94, offset.z - sideDir.z * 94,
      { mass: 320, radius: 10, data: { towable: true } });
    const candidates = index % 2 ? [decoy, tow, anchor] : [anchor, decoy, tow];
    const input = deviceInputs[index % deviceInputs.length];
    const cursorPrecisionOf = (candidate) => candidate.id === decoy.id ? 0.68 : 0.12;
    const context = scoring.classifyMasslineIntent(p, candidates, {
      turnIntent: input.turnIntent,
      moveZ: input.moveZ,
      intentDir,
      cursorPrecisionOf,
      isHostile: (candidate) => candidate.id === decoy.id,
    });
    const ranked = scoring.rankMasslineTargets(p, candidates, {
      maxRange: 390,
      context,
      intentDir,
      cursorPrecisionOf,
      isHostile: (candidate) => candidate.id === decoy.id,
      ownershipOf: (candidate) => candidate.id === decoy.id ? 'hostile' : 'neutral',
      reachAllowanceOf: (candidate) => candidate.radius || 0,
    });
    const selected = scoring.stabilizeMasslineSelection(ranked, null, index / 10).selected;
    if (selected?.id === anchor.id) correct += 1;
    receipts.push({ device: input.device, context: context.id, selectedId: selected?.id, expectedId: anchor.id });
  }
  assert.ok(correct >= 19, `turn-side anchor accuracy ${correct}/20: ${JSON.stringify(receipts)}`);
  assert.deepEqual(new Set(receipts.map((receipt) => receipt.device)),
    new Set(['keyboard/mouse', 'trackpad', 'gamepad']),
    'all normalized input surfaces must share the same semantic scorer');
});

test('PQ-004 classifier names exact Focus, route-anchor, and tow/salvage contexts without weapon-lock input', () => {
  assert.equal(typeof scoring.classifyMasslineIntent, 'function');
  const p = player();
  const hostile = target('hostile', 'ship', 160, 40, { team: 1, vx: -90 });
  const route = target('route-rock', 'asteroid', 210, 0, { mass: 2400 });
  const wreck = target('wreck', 'wreck', 130, -20, { mass: 180 });
  const candidates = [hostile, route, wreck];

  assert.equal(scoring.classifyMasslineIntent(p, candidates, { focusId: hostile.id }).id, 'hostile-flyby');
  assert.equal(scoring.classifyMasslineIntent(p, candidates, { routeId: route.id }).id, 'route-anchor');
  assert.equal(scoring.classifyMasslineIntent(p, candidates, {
    cursorPrecisionOf: (candidate) => candidate.id === wreck.id ? 1 : 0,
  }).id, 'tow/salvage');
});

test('PQ-004 hysteresis holds a marginal challenger for 200 ms but obeys precise paint and deliberate reversal immediately', () => {
  assert.equal(typeof scoring.stabilizeMasslineSelection, 'function',
    'PQ-004 must expose a pure candidate-memory contract');
  const first = [
    { id: 'a', score: 0.72, rating: 'good', reasons: {} },
    { id: 'b', score: 0.68, rating: 'good', reasons: {} },
  ];
  const initial = scoring.stabilizeMasslineSelection(first, null, 10);
  assert.equal(initial.selected.id, 'a');

  const challenged = [
    { id: 'b', score: 0.82, rating: 'clean', reasons: {} },
    { id: 'a', score: 0.70, rating: 'good', reasons: {} },
  ];
  const held = scoring.stabilizeMasslineSelection(challenged, initial.memory, 10.10);
  assert.equal(held.selected.id, 'a', 'a new challenger must not flicker the preview immediately');
  const switched = scoring.stabilizeMasslineSelection(challenged, held.memory, 10.31);
  assert.equal(switched.selected.id, 'b', 'sustained 200 ms loss switches the preview');

  const reversed = scoring.stabilizeMasslineSelection(first, switched.memory, 10.32, { forceSwitch: true });
  assert.equal(reversed.selected.id, 'a', 'deliberate reversal bypasses hysteresis');
});

test('PQ-004 runtime publishes one semantic receipt and the latch consumes that same target, independent of weapon selection', () => {
  const h = createRuntimeHarness();
  h.system.update(1 / 60, h.state);

  const receipt = h.state.masslineAcquisition;
  assert.ok(receipt && receipt.selected, 'an unlatched flight tick must publish a pre-latch receipt');
  assert.equal(receipt.selected.targetId, h.anchor.id,
    'weapon-selected hostile must not steal the forward+right Massline preview');
  assert.equal(receipt.selected.status, 'ready');
  assert.ok(receipt.validUntil > h.state.simTime);
  assert.ok(receipt.alternatives.some((entry) => entry.targetId === h.decoy.id));

  // Weapon lock, precise cursor, and steering all change on the press tick. The previously rendered
  // receipt remains authoritative; refreshing and substituting here would make the latch lie.
  h.state.player.targetId = h.decoy.id;
  h.state.input.aimWorld = { x: h.decoy.pos.x, z: h.decoy.pos.z };
  h.state.input.turnIntent = -1;
  h.state.input.moveZ = 0;
  h.state.tick += 7;
  h.state.simTime += 0.12;
  h.state.input.actions.tetherFire = true;
  h.system.update(1 / 60, h.state);

  assert.equal(h.created.length, 1);
  assert.equal(h.created[0].targetId, receipt.selected.targetId,
    'the consumed tether press must use the visible receipt target');
  assert.equal(h.latched.length, 1);
  assert.equal(h.latched[0].selectionReceiptId, receipt.id);
  assert.equal(h.latched[0].previewMatched, true);
});

test('PQ-004 receipt fails closed when the previewed target dies, becomes obstructed/protected, or expires', () => {
  const cases = [
    {
      name: 'target dies',
      expected: 'target-lost',
      mutate: (h) => { h.anchor.alive = false; },
    },
    {
      name: 'line becomes obstructed',
      expected: 'blocked',
      options: { obstruction: () => true },
    },
    {
      name: 'target becomes player-owned',
      expected: 'protected',
      mutate: (h) => { h.anchor.ownerId = h.state.playerId; },
    },
    {
      name: 'receipt expires',
      expected: 'preview-stale',
      mutate: (h) => { h.state.simTime += 0.4; h.state.tick += 24; },
    },
  ];
  for (const entry of cases) {
    let obstructed = false;
    const h = createRuntimeHarness({
      helpers: entry.options?.obstruction
        ? { isMasslineObstructed: () => obstructed }
        : {},
    });
    h.system.update(1 / 60, h.state);
    if (entry.options?.obstruction) obstructed = true;
    entry.mutate?.(h);
    h.state.input.actions.tetherFire = true;
    h.system.update(1 / 60, h.state);
    assert.equal(h.created.length, 0, `${entry.name}: invalid target must not latch`);
    assert.equal(h.denied.at(-1)?.reason, entry.expected, `${entry.name}: denial must explain the changed fact`);
    assert.equal(h.state.masslineAcquisition?.selected?.reason, entry.expected,
      `${entry.name}: the semantic receipt must carry the same denial`);
  }
});

test('PQ-004 acquisition receipt is transient across save-load and new-game boundaries', () => {
  const h = createRuntimeHarness();
  h.system.update(1 / 60, h.state);
  assert.ok(h.state.masslineAcquisition?.selected);

  h.bus.emit('save:loaded', {});
  assert.equal(h.state.masslineAcquisition, null, 'a load boundary must discard the pre-load receipt');
  h.system.update(1 / 60, h.state);
  assert.ok(h.state.masslineAcquisition?.selected, 'the live world must publish a fresh post-load receipt');

  h.bus.emit('game:started', {});
  assert.equal(h.state.masslineAcquisition, null, 'a new run must not inherit the previous run selection');
});

test('PQ-004 HUD renders the receipt as a reduced-motion-safe, non-color target/intent/status cue', () => {
  const previousEnabled = MASSLINE2_FLAGS.enabled;
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  const document = fakeDocument();
  globalThis.document = document;
  globalThis.window = { innerWidth: 1440, innerHeight: 900 };
  MASSLINE2_FLAGS.enabled = true;
  try {
    const p = player();
    const anchor = target(20, 'asteroid', 150, 145, { mass: 5200, radius: 34 });
    const state = {
      mode: 'flight',
      playerId: p.id,
      player: { tether: { active: false, targetId: null } },
      entities: new Map([[p.id, p], [anchor.id, anchor]]),
      settings: {
        video: { motionReduce: true },
        accessibility: { motionPreference: 'reduce' },
      },
      massline2: {},
      masslineAcquisition: {
        id: 'massline-acquisition:7',
        selected: {
          targetId: anchor.id,
          targetLabel: 'Heavy Anchor',
          context: 'massive-anchor-sling',
          intentLabel: 'ORBIT',
          confidence: 0.78,
          status: 'ready',
          reason: null,
        },
        alternatives: [],
      },
    };
    const hud = Object.assign({}, masslineHud);
    hud.init({
      state,
      helpers: { worldToScreen: ({ x, z }) => ({ x: x + 300, y: z + 200, onScreen: true }) },
    });
    hud.update(1 / 60, state);

    const root = document.getElementById('sf-ml2');
    const preview = findByClass(root, 'ml2-preview');
    const line = findByClass(root, 'ml2-preview-line');
    assert.ok(preview, 'Massline HUD must mount its pre-latch bracket');
    assert.equal(preview.style.display, 'block');
    assert.match(preview.textContent, /Heavy Anchor/);
    assert.match(preview.textContent, /ORBIT/);
    assert.match(preview.textContent, /78%/);
    assert.match(preview.textContent, /READY/);
    assert.equal(preview.attributes.role, 'status');
    assert.match(preview.attributes['aria-label'], /Massline ORBIT Heavy Anchor, 78 percent, ready/i);
    assert.equal(preview.attributes['data-receipt-id'], 'massline-acquisition:7',
      'the rendered cue must expose the exact semantic receipt it represents');
    assert.equal(preview.attributes['data-target-id'], String(anchor.id));
    assert.ok(line && line.attributes.x2, 'a visible line must connect the ship and predicted target');
    assert.equal(root.classList.contains('ml2-reduced-motion'), true);

    state.masslineAcquisition.selected = {
      ...state.masslineAcquisition.selected,
      status: 'protected',
      reason: 'protected',
    };
    hud.update(1 / 60, state);
    assert.match(preview.textContent, /PROTECTED/);
    assert.equal(preview.classList.contains('ml2-preview-protected'), true,
      'blocked meaning must have a shape/style hook in addition to color and text');

    state.masslineAcquisition.selected = {
      ...state.masslineAcquisition.selected,
      status: 'ready',
      reason: null,
    };
    hud.helpers.worldToScreen = ({ x }) => x === p.pos.x
      ? { x: 720, y: 450, onScreen: true }
      : { x: 1900, y: -180, onScreen: false };
    hud.update(1 / 60, state);
    assert.equal(preview.style.display, 'block', 'offscreen acquisition must remain visible at the viewport edge');
    assert.equal(preview.classList.contains('ml2-preview-offscreen'), true,
      'offscreen meaning must have a non-color border/shape hook');
    assert.match(preview.attributes['aria-label'], /offscreen/i);
    hud.destroy();
  } finally {
    MASSLINE2_FLAGS.enabled = previousEnabled;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

function createRuntimeHarness(options = {}) {
  const p = player();
  const anchor = target(20, 'asteroid', 150, 145, { mass: 5200, radius: 34 });
  const decoy = target(10, 'ship', 105, -40, {
    mass: 80,
    team: 1,
    data: { ai: { huntPlayer: true }, combat: {} },
  });
  const entities = new Map([[p.id, p], [anchor.id, anchor], [decoy.id, decoy]]);
  const state = {
    mode: 'flight',
    tick: 120,
    simTime: 2,
    playerId: p.id,
    player: {
      targetId: decoy.id,
      tether: { active: false, targetId: null },
      flybyFocus: { active: false, targetId: null },
    },
    entities,
    entityList: [...entities.values()],
    spatialHash: null,
    nav: { route: null, waypoint: null, autopilot: { targetEntityId: null } },
    input: {
      turnIntent: 1,
      moveX: 0,
      moveZ: 1,
      aimWorld: { x: 390, z: -240 },
      aimAngle: -0.55,
      pointerScreen: { active: false, x: 0, y: 0 },
      actions: { tetherFire: false, tetherCut: false, reelDelta: 0, massline: null },
    },
  };
  const created = [];
  let active = null;
  const attachments = {
    listForEntity: () => [],
    get: (id) => active && active.id === id ? active : null,
    create: (request) => {
      created.push(structuredClone(request));
      active = { id: 'att-preview', targetId: request.targetId, state: 'active', restLength: 180 };
      return { ok: true, attachment: active };
    },
    cut: () => ({ ok: true }),
  };
  const kernel = {
    attachments,
    catalog: { attachments: new Map([['tether_standard', { id: 'tether_standard', maxLength: 390 }]]) },
  };
  const bus = createBus();
  const latched = [];
  const denied = [];
  bus.on('tether:latched', (payload) => latched.push(structuredClone(payload)));
  bus.on('tether:latchDenied', (payload) => denied.push(structuredClone(payload)));
  const system = Object.assign({}, tetherGameplay);
  system.init({
    state,
    bus,
    helpers: options.helpers || {},
    registry: { get: (name) => name === 'actions' || name === 'combat' ? { kernel } : null },
  });
  return { state, system, anchor, decoy, created, latched, denied, bus };
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

function findByClass(root, className) {
  if (!root) return null;
  if (root.classList && root.classList.contains(className)) return root;
  for (const child of root.children || []) {
    const found = findByClass(child, className);
    if (found) return found;
  }
  return null;
}
