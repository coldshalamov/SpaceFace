import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { queuePhysicsImpulse, physicsBodyNativeReady } from '../src/core/physicsAuthority.js';
import { getCombatKernel } from '../src/combat/kernel.js';
import { economy } from '../src/systems/economy.js';
import { factions } from '../src/systems/factions.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';
import { actions } from '../src/systems/actions.js';
import { fields } from '../src/systems/fields.js';
import { FIELD_FLAGS } from '../src/data/fields.js';
import { industrialDisasters, normalizeIndustrialDisasters, createIndustrialDisastersSystem } from '../src/features/industrialDisasters/runtime.js';
import { SITE, SCENARIO_IDS, getScenario, sitePoint } from '../src/features/industrialDisasters/scenarios.js';
import { createCrisisRecord, summarizeIndustrialCrisis, normalizeCrisisRecord } from '../src/features/industrialDisasters/causality.js';
import { captureIndustrialDisasters, restoreIndustrialDisasters, validateIndustrialDisastersSave } from '../src/features/industrialDisasters/saveAdapter.js';
import { normalizeIndustrialPhysicalSnapshot } from '../src/features/industrialDisasters/physicalSite.js';
import { industrialDecision, commandForIndustrialChoice, installIndustrialDisasterPresentation } from '../src/features/industrialDisasters/presentation.js';

// Focused-explicit evidence: real entity lifetime, Rapier, combat damage, economy, factions and
// feature owners. These are not production-manifest, DOM keyboard-route or GPU acceptance tests.
// Fixture selection is a saved section before first native admission. Once admitted, no test
// writes an actor pose/velocity: all interventions use native impulses or the existing cable owner.
async function boot({ scenarioId = 'drift', saved = null, preview = true, toolSystems = [],
  playerOffset = { x: 0, z: 150 }, presentationRequired = false, nativeSnapshot = null } = {}) {
  const sim = createSimulation({ seed: 8205, systems: [...toolSystems, physics, economy, factions, industrialDisasters] });
  const { state, bus } = sim;
  state.mode = 'flight'; state.timeScale = 1; state.run = { kind: 'adventure' };
  state.world.currentSectorId = SITE.sectorId;
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  const player = sim.spawn({ type: 'ship', isPlayer: true, team: 0,
    pos: sitePoint(playerOffset), vel: { x: 0, z: 0 },
    radius: 5, mass: 20, hull: 100, hullMax: 100,
    data: { combatProfileId: 'combat_profile_standard_ship' } });
  state.playerId = player.id;
  const owner = sim.registry.get('industrialDisasters');
  if (presentationRequired) owner.requirePresentation();
  const ctx = { state, registry: sim.registry };
  if (saved) assert.equal(restoreIndustrialDisasters(saved, ctx).ok, true);
  else if (scenarioId !== 'drift') {
    const initial = owner.serialize();
    initial.site.discovered = true;
    initial.site.crisis = createCrisisRecord(scenarioId, 1);
    initial.site.crisis.phase = 'preview';
    owner.deserialize(initial);
  }
  const grants = [], reputation = [], prompts = [], events = [];
  bus.on('economy:grantCredits', (event) => grants.push(event));
  bus.on('faction:repDelta', (event) => reputation.push(event));
  bus.on('encounter:offer', (event) => prompts.push(event));
  bus.on('industrialDisasters:event', (event) => events.push(event));
  const presentation = installIndustrialDisasterPresentation({ state, bus, getReadModel: () => owner.readModel() });
  if (nativeSnapshot) sim.registry.get('physics').deserialize(nativeSnapshot, { deferNative: true });
  const prepared = await sim.registry.get('physics').prepareBackend(state);
  if (nativeSnapshot) {
    assert.equal(sim.registry.get('physics').hasResolvedSg02Owner(), true,
      'deferred native restore initializes its owner before releasing admission');
    sim.registry.get('physics').completeRestore({});
    bus.emit('save:loaded');
  } else assert.equal(prepared, true, 'the real default Rapier owner admitted');
  sim.runTicks(4);
  assert.equal(state.physicsRuntime?.diagnostics?.sg02Ready, true);
  const h = { sim, state, bus, owner, ctx, grants, reputation, prompts, events, presentation,
    bodies: () => owner.physical.bodies(), record: () => owner.site.crisis,
    close() { presentation.dispose(); owner.destroy(); sim.dispose(); } };
  h.command = (action, extra = {}) => {
    const request = { action, ...extra };
    bus.emit('industrialDisasters:command', request);
    return request.result;
  };
  if (!preview && h.record().phase === 'preview') {
    assert.equal(h.command('accept').ok, true);
    sim.runTicks(2);
  }
  return h;
}

function kick(body, vx, vz) {
  assert.ok(physicsBodyNativeReady(body), 'intervention starts on an admitted native body');
  assert.equal(queuePhysicsImpulse(body, { x: vx * body.mass, z: vz * body.mass },
    { source: 'industrial-focused-fixture', reason: 'physical-intervention' }), true);
}

function runUntil(h, predicate, seconds = 90, eachTick = null) {
  const count = Math.ceil(seconds / SIM_DT);
  for (let i = 0; i < count; i++) {
    if (predicate()) return i * SIM_DT;
    eachTick?.(i);
    h.sim.step(SIM_DT);
  }
  assert.ok(predicate(), `condition did not resolve after ${seconds}s: ${JSON.stringify({
    phase: h.record().phase, status: h.record().status, losses: h.record().losses,
  })}`);
  return seconds;
}

// Controlled test tug: acceleration is sent through the same impulse membrane as real tools.
// Speed/force are bounded and native contact constraints remain active during the entire tow.
function towTick(body, goal, maxSpeed = 10) {
  const dx = goal.x - body.pos.x, dz = goal.z - body.pos.z;
  const d = Math.hypot(dx, dz), v = Math.min(maxSpeed, d);
  let x = ((d ? dx / d * v : 0) - body.vel.x) * body.mass;
  let z = ((d ? dz / d * v : 0) - body.vel.z) * body.mass;
  const j = Math.hypot(x, z), cap = body.mass * 25 * SIM_DT;
  if (j > cap) { x *= cap / j; z *= cap / j; }
  queuePhysicsImpulse(body, { x, z }, { source: 'industrial-focused-fixture', reason: 'tow', continuous: true, dt: SIM_DT });
}

function recover(h, roles) {
  const berth = sitePoint(SITE.safeBerth);
  runUntil(h, () => roles.every((role) => ['safe', 'recovered'].includes(h.record().status[role])), 70,
    () => { for (const role of roles) { const body = h.bodies()[role]; if (body) towTick(body, berth); } });
}

test('ordinary proximity discovery offers inspect/refuse/cancel and preserves a held scene', async () => {
  const h = await boot();
  try {
    assert.equal(h.owner.site.discovered, true);
    assert.equal(h.record().phase, 'preview');
    assert.equal(h.owner.readModel().bodies.length, getScenario('drift').bodies.length);
    const decision = industrialDecision(h.owner.readModel());
    assert.deepEqual(decision.options.map((o) => o.id), ['inspect', 'accept:drift', 'decline', 'cancel']);
    assert.equal(commandForIndustrialChoice('accept:drift').action, 'accept');
    const transport = h.bodies().transport, before = { ...transport.pos };
    for (const action of ['inspect', 'cancel', 'decline']) assert.equal(h.command(action).ok, true);
    h.sim.runTicks(3600);
    assert.equal(h.record().elapsed, 0);
    assert.deepEqual({ ...transport.pos }, before, 'declining does not start an unavoidable disaster');
    assert.deepEqual(h.record().losses, {});
    assert.equal(h.command('accept', { scenarioId: 'corridor' }).ok, false, 'stale choice rejected');
    assert.equal(h.command('accept').ok, true);
    h.sim.runTicks(60);
    assert.ok(transport.pos.x > before.x + 2, 'actual transport starts moving after acceptance');
    assert.equal(h.command('accept').ok, false, 'second accept cannot kick velocity twice');
    assert.equal(h.command('cancel').ok, true);
    assert.equal(h.record().phase, 'active', 'closing comms does not erase live physics');
  } finally { h.close(); }
});

test('authored remote distress uses the real decision deck, preserves the route, and becomes a physical scene on approach', async () => {
  const { fakeDom } = await import('./helpers/fake-dom.mjs');
  const { createPromptDeck, setPromptDeck } = await import('../src/ui/promptDeck.js');
  const { createEncounterChoicePrompt } = await import('../src/ui/encounterChoicePrompt.js');
  const { runtime: encounterRuntime } = await import('../src/data/encounters/8205-pro-industrial-disasters.js');
  // Only the browser document is a fixture. The real deck owns its entries, rendering, keyboard
  // routing and decision callbacks; the director stub below forwards the authored runtime's bus.
  const doc = fakeDom(), listeners = new Map(), make = doc.createElement;
  doc.createElement = (tag) => {
    const node = make(tag);
    const detach = (child) => {
      const siblings = child.parentNode?.children;
      if (siblings) { const i = siblings.indexOf(child); if (i >= 0) siblings.splice(i, 1); }
      child.parentNode = null;
    };
    node.remove = () => detach(node);
    node.appendChild = (child) => { detach(child); child.parentNode = node; node.children.push(child); return child; };
    node.insertBefore = (child, ref) => {
      if (child === ref) return child;
      detach(child); const i = node.children.indexOf(ref); child.parentNode = node;
      if (i < 0) node.children.push(child); else node.children.splice(i, 0, child);
      return child;
    };
    node.replaceChildren = (...children) => {
      for (const child of [...node.children]) detach(child);
      for (const child of children) node.appendChild(child);
    };
    node.removeEventListener = (name, fn) => {
      node.listeners[name] = (node.listeners[name] || []).filter((listener) => listener !== fn);
    };
    node.style.removeProperty = (name) => { delete node.style[name]; };
    Object.defineProperties(node, {
      firstElementChild: { get: () => node.children[0] || null },
      lastElementChild: { get: () => node.children.at(-1) || null },
      childElementCount: { get: () => node.children.length },
      nextElementSibling: { get: () => node.parentNode?.children[node.parentNode.children.indexOf(node) + 1] || null },
    });
    return node;
  };
  doc.body = doc.createElement('body');
  doc.addEventListener = (name, fn) => { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); };
  doc.removeEventListener = (name, fn) => listeners.get(name)?.delete(fn);
  const h = await boot({ playerOffset: { x: 900, z: 0 } });
  const deck = createPromptDeck({ document: doc, state: h.state, bus: h.bus });
  const prompt = createEncounterChoicePrompt({ bus: h.bus });
  try {
    const priorRoute = { kind: 'local', label: 'Existing delivery', pos: sitePoint({ x: 1100, z: 120 }) };
    h.state.nav.waypoint = priorRoute;
    const results = [], navChanges = [];
    h.bus.on('nav:waypoint', (waypoint) => navChanges.push(waypoint));
    const director = {
      emit: (type, payload) => h.bus.emit(type, payload),
      resolve: (live, outcome) => { results.push({ id: live.id, outcome }); return true; },
      abort: (_live, reason) => assert.fail(`authored encounter unexpectedly aborted: ${reason}`),
    };
    encounterRuntime.fire(director, { id: 'remote-hinge-fixture' }, h.state);
    assert.equal(results[0].outcome, 'signal_received');
    assert.equal(h.owner.site.signalled, true); assert.equal(h.owner.site.discovered, false);
    assert.equal(captureIndustrialDisasters(h.ctx).site.signalled, true);
    assert.equal(deck.size, 1);
    assert.equal(h.state.nav.waypoint, priorRoute, 'an invitation does not silently replace the pilot route');
    h.sim.runTicks(1200); deck.tick(); h.presentation.update();
    assert.equal(deck.size, 1, 'far status polling and twenty seconds cannot erase the untimed choice');
    assert.equal(h.record(), null); assert.equal(Object.keys(h.bodies()).length, 0);
    assert.equal(h.grants.length, 0); assert.equal(h.reputation.length, 0); assert.equal(navChanges.length, 0);
    assert.equal(deck.choose(deck.raisedId, 'cancel', 'test'), true);
    assert.equal(deck.size, 0); assert.equal(h.state.nav.waypoint, priorRoute);
    encounterRuntime.fire(director, { id: 'remote-hinge-fixture-again' }, h.state);
    assert.equal(deck.size, 1);
    for (const listener of listeners.get('keydown') || []) listener({ key: '1', preventDefault() {}, stopImmediatePropagation() {} });
    assert.equal(deck.size, 0, 'the actual deck keyboard path consumes the explicit mark-site choice');
    assert.equal(navChanges.length, 1); assert.deepEqual(h.state.nav.waypoint.pos, SITE.anchor);
    assert.equal(h.record(), null); assert.equal(Object.keys(h.bodies()).length, 0);
    const player = h.state.entities.get(h.state.playerId), goal = sitePoint({ x: 0, z: 150 });
    for (let i = 0; i < 1200 && !h.owner.site.discovered; i++) { towTick(player, goal, 140); h.sim.step(SIM_DT); }
    assert.equal(h.owner.site.discovered, true, 'native travel reaches the ordinary proximity seam');
    h.sim.runTicks(4); h.presentation.update(); deck.tick();
    assert.equal(h.record().phase, 'preview'); assert.equal(h.record().elapsed, 0);
    assert.equal(Object.keys(h.bodies()).length, getScenario('drift').bodies.length);
    assert.equal(deck.size, 1); assert.equal(deck.choose(deck.raisedId, 'inspect', 'test'), true);
    assert.equal(h.record().phase, 'preview'); assert.equal(h.grants.length, 0);
  } finally { prompt.destroy(); deck.destroy(); setPromptDeck(null); h.close(); }
});

test('Adventure Massline input acquires a site coupling, reels the native body, and restores one semantic tow', async () => {
  const h = await boot({ scenarioId: 'cascade', preview: false, toolSystems: [actions, tetherGameplay],
    playerOffset: { x: 10, z: -90 } });
  let cold;
  try {
    const target = h.bodies().coupler;
    const original = { ...target.pos };
    const latched = [], denied = [];
    h.bus.on('tether:latched', (event) => latched.push(event));
    h.bus.on('tether:latchDenied', (event) => denied.push(event));
    h.state.input.aimWorld = { ...target.pos };
    h.state.input.aimIntentActive = true;
    h.state.player.targetId = target.id;
    h.state.input.actions = { tetherFire: true, tetherCut: false, reelDelta: 0 };
    h.sim.step();
    h.state.input.actions = { tetherFire: false, tetherCut: false, reelDelta: 0 };
    h.sim.step(); // The existing tool intentionally publishes its active HUD mirror one tick later.
    assert.equal(h.state.player.tether.targetId, target.id, JSON.stringify(denied));
    assert.equal(h.state.player.tether.active, true);
    assert.equal(latched.length, 1, 'the existing player tool owns acquisition');
    const lineId = h.state.player.tether.attachmentId;
    const kernel = getCombatKernel(h.owner.ctx);
    const lengthBefore = kernel.attachments.get(lineId).restLength;
    h.state.input.actions.massline = { lineControl: true, lineLength: -1,
      reelIn: 1, payOut: 0, orbitDirection: 0, pump: false };
    h.sim.runTicks(30);
    h.state.input.actions = {};
    assert.ok(kernel.attachments.get(lineId).restLength < lengthBefore);
    assert.ok(target.pos.z < original.z - 0.05, 'native constraint moves the actual coupling');
    assert.equal(h.bodies().coupler, target, 'tool does not replace the physical content');
    const saved = JSON.parse(JSON.stringify(captureIndustrialDisasters(h.ctx)));
    assert.equal(saved.site.crisis.physical.playerTether.role, 'coupler');
    const savedLength = saved.site.crisis.physical.playerTether.restLength;
    const player = h.state.entities.get(h.state.playerId);
    const coldPlayerOffset = { x: player.pos.x - SITE.anchor.x, z: player.pos.z - SITE.anchor.z };
    h.state.input.actions.massline = { lineControl: true, lineLength: -1,
      reelIn: 1, payOut: 0, orbitDirection: 0, pump: false };
    runUntil(h, () => h.record().flags.disconnected, 8);
    h.state.input.actions = {};
    assert.equal(h.owner.physical.links().powerConnected, false,
      'the player winch physically detaches the service feed before machinery fails');
    assert.equal(h.record().losses.machineA, undefined);
    assert.equal(h.record().losses.machineB, undefined);
    // Generic player restore is outside the feature seam; this cold fixture places that saved
    // player before admission, while all feature actors/line come only from the feature section.
    cold = await boot({ saved, toolSystems: [actions, tetherGameplay], playerOffset: coldPlayerOffset });
    const restoredKernel = getCombatKernel(cold.owner.ctx);
    const lines = restoredKernel.attachments.listForEntity(cold.state.playerId);
    assert.equal(lines.length, 1);
    assert.equal(lines[0].targetId, cold.bodies().coupler.id);
    assert.ok(Math.abs(lines[0].restLength - savedLength) < 1e-6);
    cold.sim.runTicks(20);
    assert.equal(restoredKernel.attachments.listForEntity(cold.state.playerId).length, 1);
    assert.equal(cold.state.player.tether.targetId, cold.bodies().coupler.id,
      'existing Massline owner adopts the restored semantic line');
    cold.state.input.actions = { massline: { cut: true } };
    cold.sim.step(); cold.state.input.actions = {}; cold.sim.runTicks(3);
    assert.equal(restoredKernel.attachments.listForEntity(cold.state.playerId).length, 0);
    assert.equal(captureIndustrialDisasters(cold.ctx).site.crisis.physical.playerTether, null,
      'an actual player cut is not resurrected by the save owner');
  } finally { cold?.close(); h.close(); }
});

test('Adventure PULL input moves an industrial plate through the existing fields owner and opens the lane', async () => {
  const previousFlag = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true; // Main/worker production enables this existing tool; Node golden keeps it off.
  const h = await boot({ scenarioId: 'corridor', preview: false, toolSystems: [fields],
    playerOffset: { x: -18, z: -90 } });
  try {
    const plate = h.bodies().blockerA;
    const original = { ...plate.pos };
    const deployed = [];
    h.bus.on('fields:deployed', (event) => deployed.push(event));
    h.state.input.aimWorld = sitePoint({ x: -18, z: -55 });
    h.state.input.actions = { deployWell: true };
    h.sim.step();
    assert.equal(h.state.input.actions.deployWell, false, 'existing user action is consumed');
    assert.equal(deployed.length, 1);
    h.sim.runTicks(120);
    assert.ok(plate.pos.z < original.z - 20, 'a real field impulse moved the same plate clear');
    assert.equal(h.bodies().blockerA, plate);
    assert.ok(physicsBodyNativeReady(plate));
    assert.equal(h.record().losses.blockerA, undefined);
    assert.equal(h.record().status.crewA, 'at-risk', 'one moved plate does not forge a rescue');
  } finally { h.close(); FIELD_FLAGS.enabled = previousFlag; }
});

test('cold far-tow restoration waits for native and visual admission, then a deliberate cut permits suspension', async () => {
  const h = await boot({ preview: false, toolSystems: [actions, tetherGameplay],
    playerOffset: { x: -115, z: -100 } });
  let cold;
  try {
    const target = h.bodies().transport;
    h.state.input.aimWorld = { ...target.pos }; h.state.input.aimIntentActive = true;
    h.state.input.actions = { tetherFire: true };
    h.sim.step();
    h.state.input.actions = { massline: { lineControl: true, lineLength: -1,
      reelIn: 1, payOut: 0, orbitDirection: 0, pump: false } };
    h.sim.runTicks(20); h.state.input.actions = {};
    const saved = JSON.parse(JSON.stringify(captureIndustrialDisasters(h.ctx)));
    assert.equal(saved.site.crisis.physical.playerTether.role, 'transport');
    const player = h.state.entities.get(h.state.playerId);
    const farOffset = { x: player.pos.x - SITE.anchor.x + 1000, z: player.pos.z - SITE.anchor.z };
    assert.ok(Math.hypot(farOffset.x, farOffset.z) > 740);
    // This boundary fixture translates the serialized tow before cold native admission. No
    // admitted actor is teleported; local anchors, line length and all relative poses are kept.
    for (const row of Object.values(saved.site.crisis.physical.rows)) row.pos.x += 1000;
    for (const row of Object.values(saved.site.crisis.lastMotion || {})) row.pos.x += 1000;
    cold = await boot({ saved, toolSystems: [actions, tetherGameplay], playerOffset: farOffset,
      presentationRequired: true });
    const kernel = getCombatKernel(cold.owner.ctx);
    assert.equal(Object.keys(cold.bodies()).length, getScenario('drift').bodies.length);
    assert.equal(cold.owner.physical.links().playerTetherPending, true);
    assert.equal(kernel.attachments.listForEntity(cold.state.playerId).length, 0);
    const heldElapsed = cold.record().elapsed;
    cold.sim.runTicks(120);
    assert.equal(Object.keys(cold.bodies()).length, getScenario('drift').bodies.length,
      'pending semantic tow prevents far-site retirement before the visual callback');
    assert.equal(cold.record().elapsed, heldElapsed);
    assert.equal(captureIndustrialDisasters(cold.ctx).site.crisis.physical.playerTether.role, 'transport');
    assert.equal(cold.owner.admitPresentation({ siteId: SITE.id, cycle: cold.record().cycle,
      epoch: cold.state.industrialDisastersAdmissionEpoch, ready: true }), true);
    cold.sim.runTicks(6);
    const lines = kernel.attachments.listForEntity(cold.state.playerId);
    assert.equal(lines.length, 1); assert.equal(lines[0].targetId, cold.bodies().transport.id);
    runUntil(cold, () => cold.state.player.tether.targetId === cold.bodies().transport?.id, 1);
    assert.equal(cold.state.player.tether.targetId, cold.bodies().transport.id);
    assert.equal(cold.owner.physical.canSuspend(), false);
    cold.state.input.actions = { massline: { cut: true } };
    cold.sim.step(); cold.state.input.actions = {}; cold.sim.runTicks(4);
    assert.equal(kernel.attachments.listForEntity(cold.state.playerId).length, 0);
    assert.equal(Object.keys(cold.bodies()).length, 0, 'a real cut releases the far physical residency');
    const afterCut = captureIndustrialDisasters(cold.ctx);
    assert.equal(afterCut.site.crisis.physical.playerTether, null);
    cold.sim.runTicks(120);
    assert.equal(Object.keys(cold.bodies()).length, 0);
    assert.equal(cold.record().elapsed, afterCut.site.crisis.elapsed, 'suspended aftermath has no invisible clock');
  } finally { cold?.close(); h.close(); }
});

test('scoped manifest adapters compose once with the exact-source authoritative lists', async () => {
  const { PRODUCTION_INIT_ORDER, PRODUCTION_UPDATE_ORDER, TABLE_CLOCK_IDS } = await import('../src/runtime/authoritativeSystemManifest.js');
  const { withIndustrialDisasters, industrialDisastersFactoryEntry } = await import('../src/features/industrialDisasters/manifestAdapter.js');
  const cases = [[PRODUCTION_INIT_ORDER, 'init', 'asteroidSites'],
    [PRODUCTION_UPDATE_ORDER, 'update', 'physics'], [TABLE_CLOCK_IDS, 'clock', null]];
  for (const [source, phase, anchor] of cases) {
    const before = [...source], composed = withIndustrialDisasters(source, phase);
    assert.deepEqual(source, before, 'the integration helper does not mutate shared base lists');
    assert.equal(composed.filter((id) => id === 'industrialDisasters').length, 1);
    if (phase === 'init') assert.equal(composed[composed.indexOf(anchor) + 1], 'industrialDisasters');
    if (phase === 'update') assert.ok(composed.indexOf('industrialDisasters') < composed.indexOf(anchor),
      'the owner queues physical intents before the native physics step');
    assert.deepEqual(withIndustrialDisasters(composed, phase), composed);
  }
  assert.deepEqual(industrialDisastersFactoryEntry(industrialDisasters), ['industrialDisasters', industrialDisasters]);
});

test('presentation admission waits for the current scene epoch and new-game boot does not alias save load', async () => {
  const h = await boot();
  try {
    h.owner.requirePresentation();
    const epoch = h.state.industrialDisastersAdmissionEpoch;
    const cycle = h.record().cycle;
    const transport = h.bodies().transport;
    const before = { ...transport.pos };
    assert.equal(h.command('accept').ok, true);
    h.sim.runTicks(120);
    assert.equal(h.record().elapsed, 0, 'no invisible crisis while authored meshes are pending');
    assert.deepEqual({ ...transport.pos }, before);
    assert.equal(h.owner.admitPresentation({ siteId: SITE.id, cycle, epoch: epoch - 1, ready: true }), false);
    h.sim.runTicks(10); assert.equal(h.record().elapsed, 0);
    assert.equal(h.owner.admitPresentation({ siteId: SITE.id, cycle, epoch, ready: true }), true);
    h.sim.runTicks(10);
    assert.ok(h.record().elapsed > 0); assert.ok(transport.pos.x > before.x);
    const saved = JSON.parse(JSON.stringify(captureIndustrialDisasters(h.ctx)));
    assert.equal(restoreIndustrialDisasters(saved, h.ctx).ok, true);
    h.bus.emit('save:loaded');
    h.sim.runTicks(10);
    const restoredElapsed = h.record().elapsed;
    assert.equal(h.record().scenarioId, 'drift', 'Continue does not invoke a new-game reset');
    assert.equal(h.owner.admitPresentation({ siteId: SITE.id, cycle, epoch, ready: true }), false,
      'late load from the outgoing scene cannot release the restored crisis');
    h.sim.runTicks(60); assert.equal(h.record().elapsed, restoredElapsed);
    assert.equal(h.owner.admitPresentation({ siteId: SITE.id, cycle,
      epoch: h.state.industrialDisastersAdmissionEpoch, ready: true }), true);
    h.sim.runTicks(10); assert.ok(h.record().elapsed > restoredElapsed);
    h.bus.emit('game:newGame'); // runNewGameSimBoot's actual lane-neutral legacy lifecycle receipt.
    assert.equal(h.owner.site.crisis, null);
    assert.deepEqual(h.owner.site.completed, []);
    assert.equal(Object.keys(h.bodies()).length, 0);
  } finally { h.close(); }
});

test('destroyed site actors are accounted even while a required presentation has no surviving meshes', async () => {
  const h = await boot({ preview: false });
  try {
    h.owner.requirePresentation();
    const roles = Object.keys(h.bodies());
    for (const body of Object.values(h.bodies())) h.sim.helpers.removeEntity(body.id);
    h.sim.runTicks(10);
    for (const role of roles) assert.equal(h.record().losses[role], true, `honest external loss for ${role}`);
    runUntil(h, () => ['recovery', 'settled'].includes(h.record().phase), 4);
    assert.equal(Object.keys(h.bodies()).length, 0, 'there is no replacement fleet to await');
    const summary = summarizeIndustrialCrisis(h.record());
    assert.equal(summary.people.lost, 2); assert.equal(summary.equipment.lost, 3);
    assert.equal(summary.people.saved, 0); assert.equal(h.grants.length, 0);
  } finally { h.close(); }
});

test('production destroy lifecycle retires native site bodies, cable and feature subscriptions', async () => {
  const h = await boot({ scenarioId: 'cascade', preview: false });
  try {
    const ids = Object.values(h.bodies()).map((body) => body.id);
    const kernel = getCombatKernel(h.owner.ctx);
    const cable = h.owner.physical.links().powerAttachmentId;
    assert.ok(cable); assert.equal(kernel.attachments.get(cable).state, 'active');
    const beforeTeardown = h.owner.serialize();
    h.owner.destroy();
    assert.deepEqual(h.owner.serialize(), beforeTeardown,
      'a queued save after teardown retains the last original-body snapshot');
    for (const id of ids) {
      assert.equal(h.state.entities.has(id), false);
      assert.equal(kernel.attachments.listForEntity(id).length, 0);
    }
    assert.ok(['cut', 'broken'].includes(kernel.attachments.get(cable)?.state));
    assert.equal(h.sim.helpers.combatPhysics.getAttachmentTelemetry({ attachmentId: cable }), null,
      'the native cable port no longer retains its joint');
    const request = { action: 'inspect' };
    h.bus.emit('industrialDisasters:command', request);
    assert.equal(request.result, undefined, 'disposed command handler cannot materialize another site');
    assert.equal(h.owner.physical, null);
  } finally { h.close(); }
});

test('canonical retained-registry New Game retires the old crisis and starts a fresh held scene', async () => {
  const h = await boot({ scenarioId: 'cascade', preview: false });
  try {
    const ids = Object.values(h.bodies()).map((body) => body.id);
    h.owner.newGame();
    for (const id of ids) assert.equal(h.state.entities.has(id), false);
    assert.equal(h.owner.site.crisis, null);
    assert.deepEqual(h.owner.site.rewardReceipts, {});
    assert.equal(h.grants.length, 0);
    h.sim.runTicks(4);
    assert.equal(h.record().scenarioId, 'drift');
    assert.equal(h.record().phase, 'preview', 'a fresh game cannot inherit the live fault');
    assert.notEqual(createIndustrialDisastersSystem(), createIndustrialDisastersSystem(),
      'each production registry receives its own lifecycle instance');
  } finally { h.close(); }
});

test('drift: redirecting the real hauler preserves tanks, sends crews to refuge, and pays once', async () => {
  const h = await boot({ preview: false });
  try {
    const original = h.bodies().transport, id = original.id;
    kick(original, 0, 7);
    runUntil(h, () => h.record().phase === 'settled', 45);
    assert.equal(h.bodies().transport, original, 'no body replacement disguises the tow');
    assert.equal(original.id, id);
    assert.deepEqual(h.record().losses, {});
    assert.equal(h.record().status.crewA, 'safe');
    assert.equal(h.record().status.crewB, 'safe');
    assert.equal(h.grants.length, 1); assert.equal(h.reputation.length, 1);
    assert.equal(h.state.player.credits, h.grants[0].amount, 'economy is the actual credit writer');
    assert.ok(h.state.factions[SITE.factionId].rep > 0, 'actual faction owner remembers the rescue');
    const credits = h.state.player.credits;
    h.sim.runTicks(600); h.command('finalize'); h.command('finalize');
    assert.equal(h.state.player.credits, credits); assert.equal(h.grants.length, 1);
  } finally { h.close(); }
});

test('drift: moving the threatened tanks is a different useful physical intervention', async () => {
  const h = await boot({ preview: false });
  try {
    kick(h.bodies().storageA, 0, -8); kick(h.bodies().storageB, 0, -8);
    runUntil(h, () => h.record().phase === 'settled', 45);
    assert.equal(h.record().status.storageA, 'safe');
    assert.equal(h.record().status.storageB, 'safe');
    assert.ok(h.bodies().storageA.pos.z < SITE.anchor.z - 70);
    assert.deepEqual(h.record().losses, {});
  } finally { h.close(); }
});

test('drift: a missed impact becomes partial rescue and recoverable damaged machinery', async () => {
  const h = await boot({ preview: false });
  try {
    runUntil(h, () => h.record().losses.storageA === true, 35);
    assert.ok(h.bodies().storageA.hull < getScenario('drift').bodies.find((b) => b.role === 'storageA').hull,
      'the real combat owner applied the impact damage');
    kick(h.bodies().storageB, 0, -10);
    runUntil(h, () => h.record().phase === 'recovery' || h.record().phase === 'settled', 50);
    assert.equal(h.record().losses.storageB, undefined, 'separating the second tank prevents the hot-spill cascade');
    const survivingCrews = ['crewA', 'crewB'].filter((r) => !h.record().losses[r]);
    recover(h, survivingCrews);
    recover(h, ['storageA']);
    const summary = summarizeIndustrialCrisis(h.record());
    assert.equal(h.record().status.storageA, 'recovered');
    assert.ok(summary.equipment.lost >= 1, 'salvage does not restore ruined machinery');
    assert.ok(summary.people.saved >= 1);
    assert.ok(summary.salvageRecovered >= 1);
  } finally { h.close(); }
});

test('corridor: clearing actual plates is used by moving pods; no receipt for mere clearance', async () => {
  const h = await boot({ scenarioId: 'corridor', preview: false });
  try {
    const crewA = h.bodies().crewA, startX = crewA.pos.x;
    kick(h.bodies().blockerA, 0, -8);
    h.sim.runTicks(300);
    assert.ok(crewA.pos.x > startX + 15, 'pod advances into the newly opened portion');
    assert.equal(h.record().status.crewA, 'at-risk', 'open lane alone is not an arrived survivor');
    kick(h.bodies().blockerB, 0, 8);
    runUntil(h, () => h.record().status.crewA === 'safe' && h.record().status.crewB === 'safe', 45);
    assert.equal(h.bodies().crewA, crewA);
    assert.ok(Math.hypot(crewA.pos.x - sitePoint(SITE.safeBerth).x, crewA.pos.z - sitePoint(SITE.safeBerth).z) <= SITE.safeRadius + crewA.radius);
    kick(h.bodies().hotWreck, 0, -8);
    runUntil(h, () => h.record().phase === 'recovery', 20);
    recover(h, ['cargoA']);
    runUntil(h, () => h.record().phase === 'settled', 5);
    assert.deepEqual(h.record().losses, {});
    assert.equal(h.grants.length, 1);
  } finally { h.close(); }
});

test('corridor: diverting hot wreck arrests exposure but leaves a real blocked-rescue problem', async () => {
  const h = await boot({ scenarioId: 'corridor', preview: false });
  try {
    runUntil(h, () => h.record().status.crewB === 'stranded' || h.record().status.crewA === 'stranded', 60);
    kick(h.bodies().hotWreck, 0, -10);
    runUntil(h, () => h.record().phase === 'recovery', 20);
    assert.ok(['crewA', 'crewB'].some((r) => h.record().status[r] === 'stranded'));
    assert.equal(h.grants.length, 0, 'no forced payout while crew remain in physical danger');
    kick(h.bodies().blockerA, 0, -8); kick(h.bodies().blockerB, 0, 8);
    const surviving = ['crewA', 'crewB'].filter((r) => !h.record().losses[r]);
    recover(h, surviving);
    recover(h, ['cargoA']);
    assert.ok(summarizeIndustrialCrisis(h.record()).peopleSaved >= 1);
    assert.ok(h.events.some((e) => e.id.startsWith('stranded:')));
  } finally { h.close(); }
});

test('cascade: pulling native coupling breaks the real cable and prevents both machine failures', async () => {
  const h = await boot({ scenarioId: 'cascade', preview: false });
  try {
    const cable = h.owner.physical.links().powerAttachmentId;
    assert.ok(cable, 'existing attachment owner carries a real service cable');
    const coupling = h.bodies().coupler;
    kick(coupling, 0, -10);
    runUntil(h, () => h.record().flags.disconnected, 10);
    assert.equal(h.owner.physical.links().powerConnected, false);
    assert.ok(['cut', 'broken'].includes(getCombatKernel(h.owner.ctx).attachments.get(cable)?.state));
    assert.equal(h.bodies().coupler, coupling, 'detachment preserves original admitted body');
    recover(h, ['cargoA']);
    runUntil(h, () => h.record().phase === 'settled', 30);
    assert.equal(h.record().losses.machineA, undefined);
    assert.equal(h.record().losses.machineB, undefined);
  } finally { h.close(); }
});

test('cascade: hauling the source away after one mill fails preserves the other mill', async () => {
  const h = await boot({ scenarioId: 'cascade', preview: false });
  try {
    runUntil(h, () => h.record().losses.machineA === true, 30);
    const millB = h.bodies().machineB, intactHull = millB.hull;
    // Pull away from the first mill; the flexible coupling can follow until its real feed detaches.
    kick(h.bodies().reactor, -12, -4);
    runUntil(h, () => h.record().flags.disconnected, 10);
    h.sim.runTicks(1200);
    assert.equal(h.record().losses.machineB, undefined);
    assert.equal(millB.hull, intactHull, 'the isolated feed applies no hidden late damage');
    assert.equal(h.record().losses.machineA, true);
    assert.equal(h.command('finalize').ok, true);
    assert.ok(h.owner.readModel().equipment.lost >= 1);
  } finally { h.close(); }
});

test('cold JSON restoration and leave/return preserve changed physical progress without twins', async () => {
  const h = await boot({ scenarioId: 'cascade', preview: false });
  let cold;
  try {
    kick(h.bodies().coupler, 0, -10);
    runUntil(h, () => h.record().flags.disconnected, 10);
    h.sim.runTicks(40);
    const saved = JSON.parse(JSON.stringify(captureIndustrialDisasters(h.ctx)));
    assert.equal(validateIndustrialDisastersSave(saved).ok, true);
    const expected = saved.site.crisis.physical.rows.coupler;
    const nativeSnapshot = h.sim.registry.get('physics').serialize();
    cold = await boot({ saved, nativeSnapshot });
    assert.equal(cold.record().flags.disconnected, true);
    assert.equal(cold.owner.physical.links().powerConnected, false, 'cold load does not rebuild severed service cable');
    assert.ok(Math.hypot(cold.bodies().coupler.pos.x - expected.pos.x, cold.bodies().coupler.pos.z - expected.pos.z) < 2);
    assert.ok(Math.abs(cold.bodies().coupler.vel.z - expected.vel.z) < 0.2, 'native velocity resumed through owner impulse');
    const ids = () => [...cold.state.entities.values()].filter((b) => b.data?.industrialDisasterSiteId === SITE.id);
    assert.equal(ids().length, getScenario('cascade').bodies.length);
    const player = cold.state.entities.get(cold.state.playerId);
    const away = sitePoint({ x: 0, z: 1050 });
    runUntil(cold, () => ids().length === 0, 30, () => towTick(player, away, 150));
    const suspended = captureIndustrialDisasters(cold.ctx);
    for (let i = 0; i < 1200; i++) { towTick(player, away, 100); cold.sim.step(SIM_DT); }
    assert.equal(cold.record().elapsed, suspended.site.crisis.elapsed, 'offsite incident does not run an invisible failure clock');
    assert.equal(ids().length, 0);
    runUntil(cold, () => ids().length === getScenario('cascade').bodies.length, 30,
      () => towTick(player, sitePoint({ x: 0, z: 150 }), 150));
    assert.equal(ids().length, getScenario('cascade').bodies.length);
    assert.equal(cold.owner.physical.links().powerConnected, false);
    assert.equal(cold.grants.length, 0);
  } finally { cold?.close(); h.close(); }
});

test('deliberate unpaid repeat restores the real aftermath, keeps receipts, and resets cleanly', async () => {
  const h = await boot({ preview: false });
  try {
    kick(h.bodies().transport, 0, 7);
    runUntil(h, () => h.record().phase === 'settled', 45);
    const saved = captureIndustrialDisasters(h.ctx), money = h.state.player.credits;
    assert.equal(h.command('drill', { scenarioId: 'drift' }).ok, true);
    assert.equal(h.owner.site.drill, true);
    assert.equal(h.command('accept').ok, true); h.sim.runTicks(2);
    kick(h.bodies().transport, 0, 7);
    runUntil(h, () => h.record().phase === 'settled', 45);
    assert.equal(h.grants.length, 1); assert.equal(h.state.player.credits, money);
    assert.equal(h.command('finishDrill').ok, true);
    assert.deepEqual(h.record().losses, saved.site.crisis.losses);
    assert.equal(h.record().cycle, saved.site.crisis.cycle);
    assert.equal(h.command('next').ok, true);
    assert.equal(h.record().scenarioId, 'corridor');
    assert.equal(h.record().phase, 'preview');
    assert.equal(h.command('next').ok, false, 'cannot erase an unresolved incident by cycling');
    h.bus.emit('game:new');
    assert.equal(h.owner.site.crisis, null);
    assert.equal([...h.state.entities.values()].filter((b) => b.data?.industrialDisasterSiteId === SITE.id).length, 0);
  } finally { h.close(); }
});

test('negative commands and malformed saves fail closed without grants or unrelated damage', async () => {
  const h = await boot();
  try {
    const outsider = h.sim.spawn({ type: 'ship', pos: sitePoint({ x: -130, z: -6 }), vel: { x: 0, z: 0 },
      radius: 4, mass: 20, hull: 250, hullMax: 250 });
    assert.equal(h.command('accept', { siteId: 'other-site' }).ok, false);
    assert.equal(h.command('finalize').ok, false);
    assert.equal(h.command('replay', { scenarioId: 'cascade' }).ok, false);
    assert.equal(h.command('award', { amount: 1000000 }).ok, false);
    const before = captureIndustrialDisasters(h.ctx);
    const liveBefore = h.bodies();
    assert.equal(restoreIndustrialDisasters({ schemaVersion: 99, site: {} }, h.ctx).ok, false);
    assert.deepEqual(captureIndustrialDisasters(h.ctx), before);
    for (const corruptSection of [
      (value) => { value.site.crisis.schemaVersion = 99; },
      (value) => { value.site.crisis.physical.version = 99; },
      (value) => { value.site.crisis.scenarioId = '__proto__'; },
      (value) => { value.site.crisis.scenarioId = 'constructor'; },
    ]) {
      const invalid = JSON.parse(JSON.stringify(before));
      corruptSection(invalid);
      assert.equal(validateIndustrialDisastersSave(invalid).ok, false);
      assert.equal(restoreIndustrialDisasters(invalid, h.ctx).ok, false);
      assert.equal(h.owner.deserialize(invalid).ok, false, 'direct save-owner calls validate before cleanup');
      assert.deepEqual(captureIndustrialDisasters(h.ctx), before,
        'unsupported nested versions and inherited-property scenario names cannot mutate a live save');
      for (const [role, body] of Object.entries(liveBefore)) assert.equal(h.bodies()[role], body);
    }
    assert.equal(getScenario('__proto__'), null);
    const corrupt = normalizeIndustrialDisasters({ schemaVersion: 1, site: {
      attempt: Infinity, completed: ['unknown'], rewardReceipts: { unknown: { paid: true, amount: 999 } },
      crisis: { scenarioId: 'not-an-incident', phase: 'active' },
    } });
    assert.equal(corrupt.site.crisis, null); assert.deepEqual(corrupt.site.completed, []);
    assert.equal(normalizeCrisisRecord({ scenarioId: 'drift', phase: 'bogus', heat: { storageA: NaN } }).phase, 'preview');
    const longTow = normalizeIndustrialPhysicalSnapshot({ rows: { transport: {
      pos: sitePoint({ x: 6000, z: -24000 }), vel: { x: 1200, z: -600 }, angVel: 120, hull: 180,
    } } }, 'drift');
    assert.deepEqual(longTow.rows.transport.pos, sitePoint({ x: 6000, z: -24000 }));
    assert.deepEqual(longTow.rows.transport.vel, { x: 1200, z: -600 });
    assert.equal(longTow.rows.transport.angVel, 120, 'legal long-tow/throw progress survives the corruption guards');
    h.command('accept'); h.sim.runTicks(3600);
    assert.equal(outsider.hull, 250, 'feature thermal/impact damage never targets unrelated ordinary actors');
    assert.equal(h.command('inspect', { siteId: 'other-site' }).ok, false);
    assert.equal(SCENARIO_IDS.length, 3);
  } finally { h.close(); }
});

test('canonical destruction tombstones original bodies and a cold load cannot respawn them', async () => {
  const h = await boot({ preview: false });
  let restored;
  try {
    const transport = h.bodies().transport;
    // Real entity lifetime owner, modelling a wreck removed by external combat. The crisis must
    // handle this independently of its own bounded, nonlethal machinery-damage policy.
    h.owner.ctx.helpers.removeEntity(transport.id, { immediate: true, reason: 'combat-destruction-fixture' });
    h.sim.runTicks(180);
    assert.equal(h.record().losses.transport, true);
    assert.equal(h.record().physical.rows.transport.tombstone, true);
    assert.equal(h.bodies().transport, undefined);
    const saved = JSON.parse(JSON.stringify(captureIndustrialDisasters(h.ctx)));
    restored = await boot({ saved });
    restored.sim.runTicks(180);
    assert.equal(restored.bodies().transport, undefined);
    assert.equal(restored.record().losses.transport, true);
    assert.ok(['recovery', 'settled'].includes(restored.record().phase), 'destroyed source does not strand an active crisis forever');
    assert.equal(Object.keys(restored.bodies()).length, getScenario('drift').bodies.length - 1);
  } finally { restored?.close(); h.close(); }
});

test('a paid cold aftermath is still paid exactly once after repeated restoration', async () => {
  const h = await boot({ preview: false });
  let restored;
  try {
    kick(h.bodies().transport, 0, 7);
    runUntil(h, () => h.record().phase === 'settled', 45);
    const saved = JSON.parse(JSON.stringify(captureIndustrialDisasters(h.ctx)));
    assert.equal(saved.site.rewardReceipts.drift.paid, true);
    restored = await boot({ saved });
    restored.sim.runTicks(300);
    assert.equal(restored.grants.length, 0);
    assert.equal(restored.reputation.length, 0);
    assert.equal(restoreIndustrialDisasters(saved, restored.ctx).ok, true);
    restored.sim.runTicks(300);
    assert.equal(restored.grants.length, 0);
    assert.equal(restored.reputation.length, 0);
    assert.equal(Object.keys(restored.bodies()).length, getScenario('drift').bodies.length);
  } finally { restored?.close(); h.close(); }
});

test('save between acceptance impulse submission and native solve neither loses nor doubles motion', async () => {
  const h = await boot();
  let restored;
  try {
    assert.equal(h.command('accept').ok, true);
    h.sim.step(SIM_DT); // physics ran first; feature has submitted the release for the NEXT solve
    const saved = JSON.parse(JSON.stringify(captureIndustrialDisasters(h.ctx)));
    assert.equal(saved.site.crisis.physical.started, false, 'submitted but unconsumed release remains pending');
    restored = await boot({ saved });
    h.sim.runTicks(60); restored.sim.runTicks(60);
    assert.ok(Math.abs(h.bodies().transport.vel.x - 4) < 0.01);
    assert.ok(Math.abs(restored.bodies().transport.vel.x - 4) < 0.01, 'cold continuation received exactly one release');
    assert.equal(captureIndustrialDisasters(restored.ctx).site.crisis.physical.started, true);
  } finally { restored?.close(); h.close(); }
});
// Append after existing imports; the dynamic imports avoid colliding with harness names.
test('production encounter prompt adapter routes safe decisions once and keeps cancel quiet', async () => {
  const { createBus } = await import('../src/core/eventBus.js');
  const { createEncounterChoicePrompt } = await import('../src/ui/encounterChoicePrompt.js');
  const { setPromptDeck } = await import('../src/ui/promptDeck.js');
  const { installIndustrialDisasterPresentation } = await import('../src/features/industrialDisasters/presentation.js');
  const { SITE } = await import('../src/features/industrialDisasters/scenarios.js');
  const bus = createBus(), cards = new Map(), commands = [], sound = [];
  const state = { simTime: 0, settings: { accessibility: { audioCues: true } } };
  setPromptDeck({ offerDecision: spec => { cards.set(spec.id, spec); return true; }, resolveDecision: id => cards.delete(id) });
  const owner = createEncounterChoicePrompt({ bus });
  const feature = installIndustrialDisasterPresentation({ state, bus });
  try {
    bus.on('industrialDisasters:command', command => commands.push(command));
    bus.on('audio:cue', cue => sound.push(cue));
    const offered = { siteId: SITE.id, phase: 'offered', scenarioId: 'drift', cycle: 1, discovered: true, near: true };
    bus.emit('industrialDisasters:status', offered);
    assert.equal(cards.size, 1);
    const card = [...cards.values()][0];
    assert.equal(card.deadlineAt, null);
    card.onChoose('accept:drift', 'test');
    assert.equal(commands[0].action, 'accept');
    assert.equal(cards.size, 0);
    bus.emit('encounter:choose', { encounterId: card.id.slice('encounter:'.length), choiceId: 'accept:drift' });
    assert.equal(commands.length, 1, 'stale duplicate cannot double-accept');
    bus.emit('industrialDisasters:status', offered);
    assert.equal(cards.size, 0, 'dismissed offer does not reopen every tick');
    bus.emit('sector:exit'); bus.emit('industrialDisasters:status', offered);
    assert.equal(cards.size, 1, 'return makes inspection reachable again');
    [...cards.values()][0].onChoose('decline', 'test');
    assert.equal(commands.at(-1).action, 'decline');
    bus.emit('sector:exit'); bus.emit('industrialDisasters:status', offered);
    [...cards.values()][0].onChoose('cancel', 'test');
    assert.equal(commands.at(-1).action, 'cancel');
    bus.emit('industrialDisasters:status', { ...offered, phase: 'active', hint: 'Tow it sideways.' });
    assert.equal(cards.size, 0, 'live intervention does not acquire another control panel');
    for (let i = 0; i < 20; i++) bus.emit('industrialDisasters:status', { ...offered, phase: 'active', severity: 0.8, hint: 'Tow it sideways.' });
    assert.ok(sound.length <= 1, 'warning sound remains bounded under repeated status updates');
  } finally { feature.dispose(); owner.destroy(); setPromptDeck(null); }
});

test('real Three adapter retains native identities, rebases, and retires every visual boundary', async () => {
  const THREE = await import('three');
  const { createBus } = await import('../src/core/eventBus.js');
  const { createIndustrialDisasterView } = await import('../src/features/industrialDisasters/render.js');
  const { SITE, SCENARIOS } = await import('../src/features/industrialDisasters/scenarios.js');
  const bus = createBus(), scene = new THREE.Scene(), entities = new Map();
  const bodies = SCENARIOS.drift.bodies.map((body, i) => {
    const entity = { id: i + 1, type: 'payload', alive: true,
      pos: { x: SITE.anchor.x + body.offset.x, z: SITE.anchor.z + body.offset.z },
      prevPos: { x: SITE.anchor.x + body.offset.x - 1, z: SITE.anchor.z + body.offset.z },
      rot: 0, vel: { ...body.velocity }, radius: body.radius,
      data: { placeId: body.assetId, industrialDisasterRole: body.role } };
    entities.set(entity.id, entity);
    return { id: entity.id, role: body.role, status: 'at-risk' };
  });
  const state = { entities, world: { currentSectorId: SITE.sectorId, frameOrigin: { ...SITE.anchor } },
    render: { scene }, simTime: 1, settings: { video: { motionReduce: true }, accessibility: { flashReduce: true } } };
  let builds = 0, disposals = 0;
  const model = { siteId: SITE.id, near: true, anchor: SITE.anchor, phase: 'active', bodies, paths: [], hazards: [], connections: [] };
  const buildPlace = descriptor => {
    builds++; assert.equal(descriptor.type, 'fx'); descriptor.presentationAdmission = 'ready';
    const root = new THREE.Group(); root.userData.authoredAssetState = 'authored';
    root.matrixAutoUpdate = false; root.updateMatrix(); return root;
  };
  const view = createIndustrialDisasterView({ state, bus, scene, buildPlace, disposePlace: () => disposals++, getReadModel: () => model });
  try {
    view.update(0.5);
    assert.equal(builds, 7); assert.equal(view.diagnostics().mounted, 5); assert.equal(view.diagnostics().scenery, 2);
    assert.equal(view.isReady(), true);
    assert.equal(entities.get(1).type, 'payload', 'view descriptor never retypes the native body');
    assert.equal(entities.get(1).presentationAdmission, 'ready');
    view.update(0.5); assert.equal(builds, 7, 'stable bodies retain their exact authored boundaries');
    state.world.frameOrigin.x += 100; view.update(0.5);
    const body = scene.children[0].children.find(child => child.name.startsWith('HingeWorks_transport_'));
    assert.ok(Math.abs(body.position.x - (-215.5)) < 1e-6, 'actual body pose is interpolated and rebased');
    assert.ok(Math.abs(body.matrix.elements[12] - (-215.5)) < 1e-6,
      'the frozen authored boundary matrix follows its native interpolated transform');
    bus.emit('sector:exit');
    assert.equal(view.diagnostics().mounted, 0); assert.equal(disposals, 7);
  } finally { view.dispose(); }
  assert.equal(scene.children.length, 0);
});
test('worker wire transports exact native identities and poses without a second simulation', async () => {
  const { createBus } = await import('../src/core/eventBus.js');
  const { installSimCommandSink } = await import('../src/core/simLaneCommands.js');
  const { projectBridgeEvent } = await import('../scripts/lib/simEventBridge.mjs');
  const { SITE, SCENARIOS } = await import('../src/features/industrialDisasters/scenarios.js');
  const { encodeIndustrialDisasterStatus, decodeIndustrialDisasterStatus, publishIndustrialDisasterPoses,
    installIndustrialDisasterWorkerView, sendIndustrialDisasterRequest } = await import('../src/features/industrialDisasters/workerAdapter.js');
  const bus = createBus(), sent = [], facade = {
    entities: new Map([[999, { id: 999, type: 'ship', alive: true }]]), entityList: [], simTime: 1,
    entityIndex: { __spacefaceEntityIndexV1: true, ready: true, payloads: [], movables: [],
      damageables: [], radarContacts: [], byWorldRecordId: new Map(), byWorldRecordIdCount: new Map(), laneVersions: {} },
  };
  const nativeBodies = {};
  SCENARIOS.drift.bodies.forEach((spec, i) => { nativeBodies[spec.role] = {
    id: i + 10, type: 'payload', alive: true,
    pos: { x: SITE.anchor.x + spec.offset.x, z: SITE.anchor.z + spec.offset.z },
    prevPos: { x: SITE.anchor.x + spec.offset.x - 1, z: SITE.anchor.z + spec.offset.z },
    vel: { ...spec.velocity }, rot: 0, radius: spec.radius, mass: spec.mass, hull: 100, hullMax: 100, occupantGeneration: 1,
    data: { industrialDisasterScenario: 'drift', industrialDisasterCycle: 1,
      worldRecordId: `${SITE.id}/drift/1/${spec.role}`, placeId: spec.assetId },
  }; });
  const native = { tick: 1, simTime: 1, industrialDisastersAdmissionEpoch: 4 };
  const removeSink = installSimCommandSink(descriptor => sent.push(descriptor));
  const view = installIndustrialDisasterWorkerView({ state: facade, bus });
  try {
    assert.equal(sent[0].emit, 'industrialDisasters:requirePresentation');
    let packet; bus.on('industrialDisasters:poses', p => { packet = p; });
    publishIndustrialDisasterPoses({ state: native, bus, bodies: nativeBodies, cycle: 1, scenarioId: 'drift' });
    assert.equal(projectBridgeEvent('industrialDisasters:poses', packet).dropped, false);
    assert.equal(facade.entities.size, 6);
    assert.equal(facade.entityList.length, 5);
    assert.equal(facade.entityIndex.payloads.length, 5, 'read-only targeting index sees every replicated native payload');
    const copy = facade.entities.get(10);
    assert.notEqual(copy, nativeBodies.transport); assert.equal(copy.id, nativeBodies.transport.id);
    facade.entities.delete(10); facade.entityList.splice(facade.entityList.indexOf(copy), 1);
    nativeBodies.transport.pos.x += 3; native.tick++;
    publishIndustrialDisasterPoses({ state: native, bus, bodies: nativeBodies, cycle: 1, scenarioId: 'drift' });
    assert.equal(facade.entities.get(10), copy); assert.equal(copy.pos.x, nativeBodies.transport.pos.x);
    assert.ok(facade.entityList.includes(copy), 'the next native pose repairs a main facade journal rebuild');
    assert.equal(copy._noMesh, true); assert.equal(nativeBodies.transport.type, 'payload');
    const model = { siteId: SITE.id, phase: 'offered', near: true, discovered: true, scenarioId: 'drift', cycle: 1,
      presentationEpoch: 4, bodies: Object.entries(nativeBodies).map(([role, b]) => ({ role, ...b })),
      history: [{ scenarioId: 'drift', people: { saved: 1, lost: 1 }, equipment: { saved: 2, lost: 1 }, cargo: { saved: 0, lost: 0 } }],
      people: { total: 2, saved: 1, lost: 1 }, hazards: [{ role: 'transport', pos: nativeBodies.transport.pos, radius: 20 }],
      paths: [{ from: { x: 1, z: 2 }, to: { x: 3, z: 4 }, blocked: true }],
      connections: [{ fromRole: 'a', toRole: 'b', from: { x: 1, z: 2 }, to: { x: 3, z: 4 }, connected: true }] };
    const wire = encodeIndustrialDisasterStatus(model, native);
    const transported = projectBridgeEvent('industrialDisasters:status', wire);
    assert.equal(transported.dropped, false); assert.equal(transported.flat.bodyRows[0].entityId, 10);
    const decoded = decodeIndustrialDisasterStatus(transported.flat);
    assert.equal(decoded.bodies[0].id, 10); assert.equal(decoded.history[0].people.lost, 1); assert.equal(decoded.presentationEpoch, 4);
    bus.emit('industrialDisasters:status', wire); assert.equal(view.readModel().bodies.length, 5);
    let local = 0; bus.on('industrialDisasters:command', () => local++);
    assert.equal(sendIndustrialDisasterRequest(bus, 'industrialDisasters:command', { action: 'accept', scenarioId: 'drift' }), true);
    assert.equal(sent.at(-1).payload.action, 'accept'); assert.equal(local, 0, 'worker request has no duplicate main-sim dispatch');
    assert.equal(sendIndustrialDisasterRequest(bus, 'industrialDisasters:command', { action: 'spawn' }), false);
    assert.equal(sendIndustrialDisasterRequest(bus, 'arbitrary:command', { action: 'accept' }), false);
    assert.equal(sendIndustrialDisasterRequest(bus, 'industrialDisasters:presentationReady', { cycle: 1, epoch: 4, ready: true }), true);
    assert.equal(sent.at(-1).payload.epoch, 4);
    bus.emit('sector:exit'); assert.equal(facade.entities.size, 1); assert.equal(copy.alive, false);
    assert.equal(facade.entityList.length, 0); assert.equal(facade.entityIndex.payloads.length, 0);
  } finally { view.dispose(); removeSink(); }
});
test('actual pointer ray selects the native industrial ID without giving the renderer mesh ownership', async () => {
  const THREE = await import('three');
  const { createBus } = await import('../src/core/eventBus.js');
  const { createWorldObjectPicker } = await import('../src/render/worldObjectPicking.js');
  const { createIndustrialDisasterView } = await import('../src/features/industrialDisasters/render.js');
  const { SITE, SCENARIOS } = await import('../src/features/industrialDisasters/scenarios.js');
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  const bus = createBus(), entities = new Map(), originalMeshes = new Map();
  const bodies = SCENARIOS.drift.bodies.map((body, i) => {
    const entity = { id: i + 1, type: 'payload', alive: true,
      pos: { x: SITE.anchor.x + body.offset.x, z: SITE.anchor.z + body.offset.z },
      prevPos: { x: SITE.anchor.x + body.offset.x, z: SITE.anchor.z + body.offset.z },
      vel: { ...body.velocity }, rot: 0, radius: body.radius,
      data: { placeId: body.assetId, industrialDisasterRole: body.role } };
    entities.set(entity.id, entity); return { id: entity.id, role: body.role, status: 'at-risk' };
  });
  const state = { entities, world: { currentSectorId: SITE.sectorId, frameOrigin: { ...SITE.anchor } },
    render: { scene, camera, meshes: originalMeshes }, simTime: 1, settings: {} };
  const model = { siteId: SITE.id, near: true, discovered: true, cycle: 1, presentationEpoch: 4,
    phase: 'active', bodies, paths: [], hazards: [], connections: [] };
  let disposed = 0;
  // Primitive geometry isolates picking/ownership; this does not claim authored GLB appearance.
  const view = createIndustrialDisasterView({ state, bus, scene, getReadModel: () => model,
    buildPlace: descriptor => {
      descriptor.presentationAdmission = 'ready'; const root = new THREE.Group();
      root.userData.authoredAssetState = 'authored';
      root.add(new THREE.Mesh(new THREE.BoxGeometry(descriptor.radius * 2, descriptor.radius * 2, descriptor.radius * 2),
        new THREE.MeshBasicMaterial())); return root;
    }, disposePlace: () => disposed++ });
  try {
    view.update(1); assert.equal(state.render.meshes instanceof Map, true);
    assert.equal(state.render.meshes.size, 5); assert.equal(originalMeshes.size, 0);
    camera.position.set(-115, 120, -26); camera.up.set(0, 0, -1); camera.lookAt(-115, 0, -26);
    camera.updateMatrixWorld(true); scene.updateMatrixWorld(true);
    const picker = createWorldObjectPicker({ state, getViewport: () => ({ width: 500, height: 500 }) });
    const hit = picker.pick(250, 250);
    assert.equal(hit?.entity.id, 1); assert.equal(hit.entity, entities.get(1)); assert.equal(hit.entity.type, 'payload');
  } finally { view.dispose(); }
  assert.equal(state.render.meshes, originalMeshes); assert.equal(originalMeshes.size, 0);
  assert.equal(scene.children.length, 0); assert.equal(disposed, 7);
});
test('rejected incident transition reoffers once, allows retry after release, and leaves active flight clear', async () => {
  const { createBus } = await import('../src/core/eventBus.js');
  const { createEncounterChoicePrompt } = await import('../src/ui/encounterChoicePrompt.js');
  const { setPromptDeck } = await import('../src/ui/promptDeck.js');
  const { installIndustrialDisasterPresentation } = await import('../src/features/industrialDisasters/presentation.js');
  const { SITE } = await import('../src/features/industrialDisasters/scenarios.js');
  const bus = createBus(), cards = new Map(), radio = [];
  const model = { siteId: SITE.id, phase: 'settled', scenarioId: 'drift', cycle: 1, discovered: true, near: true, hasNext: true };
  let connected = true, accepted = 0;
  setPromptDeck({ offerDecision: p => cards.set(p.id, p), resolveDecision: id => cards.delete(id) });
  const owner = createEncounterChoicePrompt({ bus });
  const ui = installIndustrialDisasterPresentation({ state: { simTime: 0, settings: {} }, bus });
  bus.on('comms:log', p => radio.push(p.text));
  bus.on('industrialDisasters:command', p => {
    if (p.action !== 'next') return;
    if (connected) bus.emit('industrialDisasters:commandRejected', { siteId: SITE.id, cycle: 1, reason: 'release_tethers', action: 'next' });
    else accepted++;
  });
  try {
    bus.emit('industrialDisasters:status', model);
    [...cards.values()][0].onChoose('next', 'test'); assert.equal(cards.size, 1);
    [...cards.values()][0].onChoose('next', 'test'); assert.equal(cards.size, 1);
    assert.equal(radio.filter(s => s.startsWith('Release your towline')).length, 1);
    connected = false; [...cards.values()][0].onChoose('next', 'test');
    assert.equal(accepted, 1); assert.equal(cards.size, 0);
    bus.emit('industrialDisasters:status', { ...model, phase: 'active' });
    bus.emit('industrialDisasters:commandRejected', { siteId: SITE.id, cycle: 1, reason: 'make_safe_first', action: 'finalize' });
    assert.equal(cards.size, 0);
  } finally { ui.dispose(); owner.destroy(); setPromptDeck(null); }
});
