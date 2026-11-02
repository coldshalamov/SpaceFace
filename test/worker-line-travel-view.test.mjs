import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { MASSLINE2_FLAGS, TRAVEL_FLAGS } from '../src/data/featureFlags.js';
import { masslineThrow } from '../src/systems/masslineThrow.js';
import { cloak } from '../src/systems/cloak.js';
import { bulletTime } from '../src/systems/bulletTime.js';
import { travelLanes } from '../src/systems/travelLanes.js';
import { masslineHud } from '../src/ui/masslineHud.js';
import { travelTapeLaneStatus } from '../src/ui/hud.js';
import { createDomainDiffer, applyDomainPathUpdate } from '../scripts/lib/simReadModel.mjs';

const DT = 1 / 60;
const body = (id, x, z, mass = 16) => ({ id, type: 'ship', alive: true, team: 0,
  pos: { x, z }, vel: { x: 90, z: 0 }, rot: 0, angVel: 0, radius: 12, mass,
  data: { weapons: [], combat: {} }, flags: {} });

function harness() {
  const state = createGameState(47), bus = createBus();
  const player = body(1, 0, 0, 200), payload = body(2, 0, 140), target = body(3, 900, 140, 500);
  target.vel = { x: 0, z: 0 };
  target.radius = 35;
  state.mode = 'flight'; state.tick = 100; state.simTime = 100 / 60;
  state.entities = new Map([player, payload, target].map(entity => [entity.id, entity]));
  state.entityList = [...state.entities.values()]; state.playerId = player.id;
  state.player.targetId = target.id;
  state.player.tether = { active: true, targetId: payload.id, attachmentId: null,
    phase: 'taut', load: 0.7, restLength: 140, strain: 0.3, cadence: { phase: 'coast' } };
  state.settings.gameplay.masslineReleaseAssist = 'arm';
  state.input.aimIntentActive = false; state.input.aimWorld = { x: 0, z: 0 };
  state.input.actions = { throwArm: true };
  state.runtime = { features: { massline2: { enabled: true, throw: true, cloak: true, bulletTime: true } } };
  const systems = [];
  function start(producer, registry = { get: () => null }) {
    const system = Object.create(producer);
    system.init({ state, bus, helpers: {}, registry });
    systems.push(system);
    return system;
  }
  const throwSystem = start(masslineThrow);
  return { state, player, payload, target, bus, start, throwSystem,
    tick() { state.tick++; state.simTime += DT; throwSystem.update(DT, state); },
    destroy() { for (const system of systems.reverse()) system.destroy?.(); } };
}

function channel(state) {
  const differ = createDomainDiffer(), domains = new Map();
  const main = { ...state, player: structuredClone(state.player), massline2: null, travelLanes: null };
  return { main, domains, sync() {
    const updates = differ.diff(state, state.tick).updates;
    for (const update of updates) applyDomainPathUpdate(domains, structuredClone(update), new Set());
    main.tick = state.tick; main.simTime = state.simTime; main.mode = state.mode;
    main.player = structuredClone(state.player);
    main.entities = new Map([...state.entities].map(([id, entity]) => [id, structuredClone(entity)]));
    main.entityList = [...main.entities.values()];
    main.massline2 = domains.get('massline2'); main.travelLanes = domains.get('travelLanes');
    return updates.filter(update => ['massline2', 'travelLanes'].includes(update.segs[0]));
  } };
}

function withFeatures(run) {
  const line = { ...MASSLINE2_FLAGS }, travel = { ...TRAVEL_FLAGS };
  Object.assign(MASSLINE2_FLAGS, { enabled: true, throw: true, cloak: true, bulletTime: true });
  Object.assign(TRAVEL_FLAGS, { laneBoost: true, travelBurn: true });
  try { return run(); } finally { Object.assign(MASSLINE2_FLAGS, line); Object.assign(TRAVEL_FLAGS, travel); }
}

test('worker throw producer reaches the mounted release mark and cadence, refreshes, then clears on loss/reset', () => withFeatures(() => {
  const h = harness(), view = channel(h.state), dom = installDom();
  const hud = Object.create(masslineHud);
  try {
    h.tick();
    const solution = h.state.massline2.throw.solution;
    assert.equal(solution.valid, true, 'the registered throw producer solved a real payload/target pair');
    h.state.massline2.privateRuntime = { entity: h.payload, native: () => {}, huge: 'private'.repeat(10000) };
    solution.privateScratch = h.state.massline2.privateRuntime;
    const updates = view.sync(), initial = updates.find(update => update.segs[0] === 'massline2');
    assert.ok(initial && initial.bytes < 12_000, 'the wire contains the bounded view, not solver scratch');
    assert.equal(view.main.massline2.privateRuntime, undefined);
    assert.equal(view.main.massline2.throw.solution.privateScratch, undefined);
    assert.notEqual(view.main.massline2.throw.solution, solution);
    assert.equal(view.main.massline2.throw.payloadId, h.payload.id);
    assert.equal(view.main.massline2.throw.aimTargetId, h.target.id);
    assert.equal(view.main.massline2.throw.releaseTarget.targetId, h.target.id);
    assert.equal(view.main.massline2.throw.solution.sampleTick, solution.sampleTick);
    hud.init({ state: view.main, bus: createBus(), helpers: { worldToScreen } });
    hud.update(DT, view.main);
    const mark = dom.document.querySelector('.ml2-throw');
    assert.equal(mark.style.display, 'block', 'the actual main-lane HUD paints the transported throw');
    const cadence = dom.document.querySelector('.ml-cadence');
    assert.ok(cadence, 'the real cadence component was mounted by masslineHud');
    assert.equal(cadence.hidden, false);
    assert.equal(cadence.querySelector('[data-ml="speed"]').textContent, solution.payloadSpeed.toFixed(0));
    assert.equal(cadence.querySelector('[data-ml="clearance"]').textContent,
      `${solution.clearance >= 0 ? '+' : ''}${solution.clearance.toFixed(1)}`);
    const before = mark.style.transform, decidedAt = solution.decisionTick;
    h.target.pos.x += 80; h.target.pos.z += 80;
    h.tick();
    assert.ok(view.sync().some(update => update.segs[0] === 'massline2'), 'fresh decisions travel on the next reply');
    assert.ok(view.main.massline2.throw.solution.decisionTick > decidedAt,
      'the decision is current even when the producer reuses its bounded preview sample');
    assert.equal(view.main.massline2.throw.solution.decisionTick, h.state.tick);
    assert.equal(view.main.massline2.throw.solution.sampleTick, h.state.massline2.throw.solution.sampleTick);
    hud.update(DT, view.main);
    assert.notEqual(mark.style.transform, before, 'the existing HUD signature notices the fresh target/solution');
    h.payload.alive = false; h.tick(); view.sync(); hud.update(DT, view.main);
    assert.equal(view.main.massline2.throw.solution, null);
    assert.equal(mark.style.display, 'none', 'lost payload cannot leave a stale release mark');
    h.payload.alive = true; h.tick(); view.sync(); hud.update(DT, view.main);
    assert.equal(mark.style.display, 'block');
    h.bus.emit('save:loaded', {}); h.state.tick++; view.sync(); hud.update(DT, view.main);
    assert.equal(view.main.massline2.throw.armed, false);
    assert.equal(mark.style.display, 'none');
    delete h.state.massline2; h.state.tick++; view.sync(); hud.update(DT, view.main);
    assert.equal(view.main.massline2, null, 'a new owner without the root removes the old view');
    assert.equal(mark.style.display, 'none');
  } finally { hud.destroy(); dom.restore(); h.destroy(); }
}));

test('worker self-sling and ability producers reach their existing main HUD surfaces', () => withFeatures(() => {
  const h = harness(), view = channel(h.state), dom = installDom(), hud = Object.create(masslineHud);
  try {
    h.payload.mass = 5000;
    h.state.player.ownedShips = [{ fittings: ['mod_cloak_mk1'] }]; h.state.player.activeShipIndex = 0;
    const shroud = h.start(cloak), slow = h.start(bulletTime);
    h.state.input.actions.cloakToggle = true;
    shroud.update(DT, h.state);
    h.state.input.actions.cloakToggle = false;
    h.state.input.actions.bulletTime = true;
    slow.update(DT, h.state); slow.update(DT, h.state);
    h.tick(); view.sync();
    assert.equal(h.state.massline2.cloak.active, true);
    assert.equal(h.state.massline2.bulletTime.active, true);
    assert.ok(h.state.massline2.throw.selfSolution, 'the real producer publishes the player-as-payload read');
    hud.init({ state: view.main, bus: createBus(), helpers: { worldToScreen } }); hud.update(DT, view.main);
    assert.equal(dom.document.querySelector('.ml2-self').style.display, 'block');
    assert.equal(dom.document.querySelector('.ml2-throw').style.display, 'none', 'a heavy anchor uses self-sling ownership');
    assert.equal(dom.document.querySelector('.ml2-ring').style.display, 'block');
    assert.equal(hud._dom.ckPill.classList.contains('ml2-on'), true);
    assert.equal(hud._dom.btPill.classList.contains('ml2-on'), true);
    assert.equal(hud._dom.ckFill.style.transform, `scaleX(${h.state.massline2.cloak.energy})`);
    h.bus.emit('save:restoring', {}); h.state.tick++; view.sync(); hud.update(DT, view.main);
    assert.equal(view.main.massline2.cloak.active, false);
    assert.equal(view.main.massline2.bulletTime.active, false);
    assert.equal(hud._dom.ckPill.classList.contains('ml2-on'), false);
    assert.equal(hud._dom.btPill.classList.contains('ml2-on'), false);
  } finally { hud.destroy(); dom.restore(); h.destroy(); }
}));

test('worker travel-lane producer drives the real Throughline tape through alignment, operation, outage and exit', () => withFeatures(() => {
  const h = harness(), view = channel(h.state);
  const infrastructure = { id: 'throughline-test', name: 'Test Throughline', stage: 'aligning', operational: false,
    from: { x: 10000, z: 0 }, to: { x: 10800, z: 0 }, support: { x: 10400, z: 80 },
    corridorRadiusWU: 240, ceilingMult: 1.7, rampMult: 1.4 };
  const lane = h.start(travelLanes, { get: name => name === 'claims' ? {
    visitTravelInfrastructure(_sector, visit) { visit(infrastructure, { sectorId: 'sector_helios_prime' }); },
  } : null });
  h.player.pos = { x: 10400, z: 0 };
  h.state.input.travelDrive = { state: 'engaged', cap: 0 };
  const paint = () => { lane.update(DT, h.state); h.state.tick++; view.sync(); return travelTapeLaneStatus(view.main.travelLanes); };
  try {
    assert.equal(paint(), 'THROUGHLINE ALIGNING');
    h.state.travelLanes.privateRuntime = { entities: h.state.entities, native: () => {}, huge: 'x'.repeat(100000) };
    h.state.tick++;
    const update = view.sync().find(update => update.segs[0] === 'travelLanes');
    assert.equal(update, undefined, 'private changes do not dirty the bounded lane view');
    infrastructure.stage = 'active'; infrastructure.operational = true;
    assert.equal(paint(), 'THROUGHLINE ×1.7');
    assert.equal(view.main.travelLanes.privateRuntime, undefined);
    infrastructure.operational = false;
    assert.equal(paint(), 'THROUGHLINE OFFLINE');
    h.player.pos.z = 1000;
    assert.equal(paint(), '', 'leaving the actual corridor removes the stale manufactured-lane caption');
    delete h.state.travelLanes; h.state.tick++; view.sync();
    assert.equal(view.main.travelLanes, null);
    assert.equal(travelTapeLaneStatus(view.main.travelLanes), '');
  } finally { h.destroy(); }
}));

function worldToScreen({ x, z }) { return { x: 400 + x / 4, y: 300 + z / 4, onScreen: true }; }

// Minimal DOM implementation for the existing HUD mount. The production components own all
// markup, selectors, text and updates; this only supplies DOM operations in the native test.
function installDom() {
  const previousDocument = globalThis.document, previousWindow = globalThis.window;
  const document = {};
  function makeNode(tagName) {
    const node = { tagName, ownerDocument: document, id: '', className: '', children: [], parentNode: null,
      textContent: '', attributes: {}, dataset: {}, hidden: false, isConnected: true,
      style: { setProperty(name, value) { this[name] = value; } },
      appendChild(child) { child.parentNode = this; this.children.push(child); return child; },
      append(...children) { for (const child of children) this.appendChild(child); },
      removeChild(child) { this.children = this.children.filter(value => value !== child); child.parentNode = null; },
      remove() { this.parentNode?.removeChild(this); },
      setAttribute(name, value) { this.attributes[name] = String(value);
        if (name === 'class') this.className = String(value); if (name === 'id') this.id = String(value); },
      getAttribute(name) { return this.attributes[name] ?? null; },
      removeAttribute(name) { delete this.attributes[name]; },
      querySelector(selector) { return search(this, candidate => matches(candidate, selector)); },
    };
    node.classList = { contains: name => node.className.split(/\s+/).includes(name),
      add(name) { if (!this.contains(name)) node.className = `${node.className} ${name}`.trim(); },
      remove(name) { node.className = node.className.split(/\s+/).filter(value => value && value !== name).join(' '); },
      toggle(name, force) { const on = force ?? !this.contains(name); if (on) this.add(name); else this.remove(name); return on; } };
    Object.defineProperty(node, 'innerHTML', { set(markup) {
      this.children = [];
      const html = markup.replace(/<style>[\s\S]*?<\/style>/g, '');
      for (const match of html.matchAll(/<([\w-]+)([^>]*)>/g)) {
        const child = makeNode(match[1]);
        for (const attr of match[2].matchAll(/([\w-]+)="([^"]*)"/g)) child.setAttribute(attr[1], attr[2]);
        this.appendChild(child);
      }
    } });
    return node;
  }
  function search(root, predicate) {
    if (predicate(root)) return root;
    for (const child of root.children) { const found = search(child, predicate); if (found) return found; }
    return null;
  }
  function matches(node, selector) {
    if (selector.startsWith('.')) return node.classList.contains(selector.slice(1));
    const attr = /^\[([^=]+)="([^"]*)"\]$/.exec(selector);
    return attr ? node.getAttribute(attr[1]) === attr[2] : node.tagName === selector;
  }
  Object.assign(document, { body: makeNode('body'), head: makeNode('head'), createElement: makeNode,
    createElementNS: (_ns, tag) => makeNode(tag),
    getElementById(id) { return search(this.body, node => node.id === id) || search(this.head, node => node.id === id); },
    querySelector(selector) { return this.body.querySelector(selector); } });
  const host = makeNode('div'); host.id = 'hud'; document.body.appendChild(host);
  globalThis.document = document; globalThis.window = { innerWidth: 1440, innerHeight: 900 };
  return { document, restore() {
    if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
  } };
}
