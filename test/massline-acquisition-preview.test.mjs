import test from 'node:test';
import assert from 'node:assert/strict';

import * as scoring from '../src/combat/masslineTargetScoring.js';
import { isAttachable, tetherGameplay } from '../src/systems/tetherGameplay.js';
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

test('a Massline press honors the player-selected physical target instead of a previous automatic receipt', () => {
  const h = createRuntimeHarness();
  h.system.update(1 / 60, h.state);
  assert.equal(h.state.masslineAcquisition, null,
    'idle flight must not publish an automatic cable-like Massline selection');

  h.state.player.targetId = h.decoy.id;
  h.state.input.aimWorld = { x: h.decoy.pos.x, z: h.decoy.pos.z };
  h.state.input.turnIntent = -1;
  h.state.input.moveZ = 0;
  h.state.tick += 7;
  h.state.simTime += 0.12;
  h.state.input.actions.tetherFire = true;
  h.system.update(1 / 60, h.state);

  assert.equal(h.created.length, 1);
  assert.equal(h.created[0].targetId, h.decoy.id,
    'the player-selected target must win at the moment of the Massline command');
  assert.equal(h.latched.length, 1);
});

test('stations and planets are valid physical Massline anchors when deliberately selected', () => {
  for (const type of ['station', 'planet']) {
    const h = createRuntimeHarness();
    h.anchor.type = type;
    h.state.player.targetId = h.anchor.id;
    h.state.input.aimWorld = { ...h.anchor.pos };
    assert.equal(isAttachable(h.anchor, h.state.playerId), true, `${type} must be physically attachable`);
    h.state.input.actions.tetherFire = true;
    h.system.update(1 / 60, h.state);
    assert.equal(h.created.at(-1)?.targetId, h.anchor.id, `${type} selection must create the attachment`);
  }
});

test('Massline attachment is based on physical presence, not an object-type whitelist', () => {
  const physicalObject = target('physical-unknown', 'new_world_object_type', 90, 0, { mass: 900 });
  assert.equal(isAttachable(physicalObject, 1), true,
    'new physical world objects must not require a separate Massline eligibility-list edit');
});

test('a Massline press resolves current physical truth instead of consuming an idle receipt', () => {
  const dead = createRuntimeHarness();
  dead.state.player.targetId = dead.anchor.id;
  dead.anchor.alive = false;
  dead.state.input.actions.tetherFire = true;
  dead.system.update(1 / 60, dead.state);
  assert.equal(dead.created.at(-1)?.targetId, dead.decoy.id,
    'a dead selected target falls back to a nearby physical object');

  const blocked = createRuntimeHarness({ helpers: { isMasslineObstructed: () => true } });
  blocked.state.player.targetId = blocked.anchor.id;
  blocked.state.input.actions.tetherFire = true;
  blocked.system.update(1 / 60, blocked.state);
  assert.equal(blocked.created.length, 0);
  assert.equal(blocked.denied.at(-1)?.reason, 'blocked');

  const owned = createRuntimeHarness();
  owned.anchor.ownerId = owned.state.playerId;
  owned.state.player.targetId = owned.anchor.id;
  owned.state.input.actions.tetherFire = true;
  owned.system.update(1 / 60, owned.state);
  assert.equal(owned.created.at(-1)?.targetId, owned.anchor.id,
    'ownership is not a hidden Massline eligibility rule');
});

test('idle Massline acquisition state remains empty across save-load and new-game boundaries', () => {
  const h = createRuntimeHarness();
  h.system.update(1 / 60, h.state);
  assert.equal(h.state.masslineAcquisition, null);

  h.bus.emit('save:loaded', {});
  assert.equal(h.state.masslineAcquisition, null);
  h.system.update(1 / 60, h.state);
  assert.equal(h.state.masslineAcquisition, null);

  h.bus.emit('game:started', {});
  assert.equal(h.state.masslineAcquisition, null);
});

test('an idle acquisition receipt never draws a cable-like line or target bracket', () => {
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
    assert.equal(preview.style.display, 'none');
    assert.equal(line.parentNode.style.display, 'none',
      'only the real rendered Massline cable may connect the player to an object');
    assert.equal(root.classList.contains('ml2-reduced-motion'), true);
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
