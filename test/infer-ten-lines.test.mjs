// Ten inference lines. One file. Seed 4242 where a line asks for it.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { ENEMY_DOCTRINE_OVERRIDES } from '../src/data/combatDefs.js';
import { ENEMY_TYPES } from '../src/data/enemies.js';
import { MASSLINE2_FLAGS } from '../src/data/featureFlags.js';
import { SURVIVAL_GATE_GROUPS, SURVIVAL_WAVES } from '../src/data/survivalWaves.js';
import { TECH_NODES } from '../src/data/tech.js';
import { SWARM_RULESET } from '../src/data/swarmMode.js';
import { volatileClassOf } from '../src/data/commodityVolatileClasses.js';
import {
  getManifestIdentityPayload,
  PRODUCTION_INIT_ORDER,
  PRODUCTION_UPDATE_ORDER,
} from '../src/runtime/authoritativeSystemManifest.js';
import { spawnJettisonedCargoPod } from '../src/systems/lootShards.js';
import { MEMORIAL_THIEF_DECLARATION } from '../src/systems/memorialThief.js';
import { economy } from '../src/systems/economy.js';
import { flybyFocus } from '../src/systems/flybyFocus.js';
import { runSession } from '../src/systems/runSession.js';
import { ships } from '../src/systems/ships.js';
import { isNoOpDuplicateOffer, survivalDraft } from '../src/systems/survivalDraft.js';
import { survivalRun } from '../src/systems/survivalRun.js';
import { GATE_BEARINGS } from '../src/systems/waveMaterialization.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import {
  bindFlybyFocusHandoff,
  CameraDirectorMode,
  createCameraDirector,
} from '../src/render/cameraDirector.js';
import { localMapPauseCopy, pauseMapAction } from '../src/ui/screens/pause.js';
import { BINDINGS } from '../src/ui/bindings.js';
import {
  settingsInUseLabel,
  settingsPackRestartNote,
  settingsQualityKeepsNote,
  settingsScreen,
  settingsWorkshopSubscribedNote,
  settingsWorkshopSyncedNote,
} from '../src/ui/screens/settings.js';
import { fakeDom, findAll } from './helpers/fake-dom.mjs';

const SEED = 4242;
const ARENA = 'helios_core';

test('MACH-01 memorial thief is a uniqueWrecks sub-object and the manifest identity is unchanged', () => {
  assert.equal(MEMORIAL_THIEF_DECLARATION.owner, 'uniqueWrecks');
  assert.equal(MEMORIAL_THIEF_DECLARATION.systemId, null);
  assert.equal(MEMORIAL_THIEF_DECLARATION.independentTick, false);
  assert.equal(PRODUCTION_INIT_ORDER.includes('memorialThief'), false);
  assert.equal(PRODUCTION_UPDATE_ORDER.includes('memorialThief'), false);
  assert.equal(PRODUCTION_INIT_ORDER.includes('uniqueWrecks'), true);
  const payload = getManifestIdentityPayload();
  const blob = JSON.stringify(payload);
  assert.equal(blob.includes('memorialThief'), false);
  assert.equal(payload.schema, 'spaceface.authoritativeSystemManifest.v1');
  assert.equal(payload.productionInitOrder.includes('uniqueWrecks'), true);
  assert.equal(payload.productionUpdateOrder.includes('memorialThief'), false);
});

test('NXI-029 a volatile lot stays volatile through dump and pickup; inert cargo stays inert', () => {
  const state = {
    meta: { seed: SEED },
    simTime: 0,
    playerId: 1,
    entities: new Map(),
    entityList: [],
  };
  const helpers = {
    spawnEntity(spec) {
      const entity = { id: state.entityList.length + 1, ...spec, data: { ...(spec.data || {}) } };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
  const volatilePod = spawnJettisonedCargoPod(state, {
    commodityId: 'cmdty_fuel_cells',
    amount: 3,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    ownerId: 1,
  }, helpers);
  assert.ok(volatilePod && volatilePod.data);
  assert.equal(volatilePod.data.commodityId, 'cmdty_fuel_cells');
  assert.equal(volatilePod.data.volatileClass, 'explosive');
  assert.equal(volatilePod.data.amount, 3);
  const recovered = volatileClassOf(volatilePod.data.commodityId);
  assert.equal(recovered && recovered.id, volatilePod.data.volatileClass);
  assert.equal(volatilePod.data.salvagePool.cmdty_fuel_cells, 3);

  const inertPod = spawnJettisonedCargoPod(state, {
    commodityId: 'cmdty_scrap_metal',
    amount: 2,
    pos: { x: 4, z: 0 },
    vel: { x: 0, z: 0 },
    ownerId: 1,
  }, helpers);
  assert.ok(inertPod && inertPod.data);
  assert.equal(inertPod.data.commodityId, 'cmdty_scrap_metal');
  assert.equal(inertPod.data.volatileClass, undefined);
  assert.equal(volatileClassOf(inertPod.data.commodityId), null);
  assert.notEqual(inertPod.data.commodityId, volatilePod.data.commodityId);
});

test('NXI-065 the starter wave leaves an opening lane on seed 4242 arenas', () => {
  const starters = SURVIVAL_WAVES.filter((recipe) => recipe.wave === 1);
  assert.ok(starters.length >= 1);
  for (const recipe of starters) {
    const opening = recipe.packages.filter((pkg) => pkg.atTick === 0);
    const gates = [...new Set(opening.map((pkg) => pkg.gateGroup))];
    assert.equal(gates.length, 1, `${recipe.id} must not surround the starter`);
    const used = GATE_BEARINGS[gates[0]];
    assert.ok(used);
    const openBearings = SURVIVAL_GATE_GROUPS.filter((gate) => gate !== gates[0]);
    assert.ok(openBearings.length >= SURVIVAL_GATE_GROUPS.length - 1);
    const hasOpposite = openBearings.some((gate) => {
      const bearing = GATE_BEARINGS[gate];
      return used.x * bearing.x + used.z * bearing.z < 0;
    });
    assert.equal(hasOpposite, true, recipe.id);
  }
  const planned = planWave({ seed: SEED, arenaId: ARENA, wave: 1 });
  assert.equal(planned.ok === false, false);
  assert.equal(planned.error, undefined);
  const plannedGates = [...new Set(planned.packages.filter((pkg) => pkg.atTick === 0).map((pkg) => pkg.gateGroup))];
  assert.equal(plannedGates.length, 1);
});

test('NXI-070 an owned unique is not offered; a swarm weapon still is', () => {
  const state = {
    player: {
      activeShipIndex: 0,
      ownedShips: [{ defId: 'ship_hornet', fittings: [] }],
      moduleInventory: [
        { instanceId: 'cloak', defId: 'unique_quietcloak' },
        { instanceId: 'gun', defId: 'wpn_pulse_laser_s' },
      ],
      cargo: { items: {}, usedVolume: 0 },
    },
    run: createRunState({ kind: 'survival', ruleset: SWARM_RULESET, seed: SEED }),
  };
  state.run.phase = 'draft';
  state.run.wave = 4;
  state.run.credits = 200;
  const bus = { on() { return () => {}; }, emit() {} };
  survivalDraft.init({ state, bus, helpers: {}, registry: { get() { return null; } } });
  survivalDraft._draftInput = null;
  survivalDraft._offers = [
    {
      id: 'dup-cloak', defId: 'unique_quietcloak', kind: 'verb', verb: 'Cloak',
      name: 'Quietcloak', slotIndex: 1, replaces: null,
    },
    {
      id: 'stack-gun', defId: 'wpn_pulse_laser_s', kind: 'verb', verb: 'Pulse',
      name: 'Pulse', slotIndex: 0, replaces: null,
    },
  ];
  const rows = survivalDraft.currentOffers();
  assert.equal(rows.some((row) => row.defId === 'unique_quietcloak'), false);
  assert.equal(rows.some((row) => row.defId === 'wpn_pulse_laser_s'), true);
  assert.equal(isNoOpDuplicateOffer(survivalDraft._offers[0], new Set(['unique_quietcloak']), SWARM_RULESET), true);
  assert.equal(isNoOpDuplicateOffer(survivalDraft._offers[1], new Set(['wpn_pulse_laser_s']), SWARM_RULESET), false);
});

test('FIGHT-01 mine-layer jackal doctrine comes from its own row', () => {
  const jackal = ENEMY_TYPES.find((row) => row.id === 'mine_layer_jackal');
  assert.ok(jackal);
  assert.equal(jackal.combatDoctrineId, 'mine_layer_wake');
  assert.equal(ENEMY_DOCTRINE_OVERRIDES.mine_layer_jackal, undefined);
});

test('PRO-05 In-use, Keeps, restart and Local Map resolve through placeholders in en-US', () => {
  assert.equal(settingsInUseLabel('Fire'), 'In use: Fire');
  assert.equal(
    settingsQualityKeepsNote('bloom, trails', 'shadows'),
    'Keeps bloom, trails. Substitutes: shadows.',
  );
  assert.equal(
    settingsPackRestartNote('C:/packs'),
    'No content packs installed. Drop a pack folder into C:/packs and restart.',
  );
  assert.equal(settingsPackRestartNote(''), 'No content packs installed.');
  assert.equal(
    settingsWorkshopSubscribedNote(2),
    'Steam Workshop: 2 subscribed item(s). Sync mirrors them into the content directory; a restart loads them.',
  );
  assert.equal(settingsWorkshopSyncedNote(3), 'Workshop sync mirrored 3 pack(s) — restart to load');

  const key = BINDINGS.localmap.label;
  const local = localMapPauseCopy(key, { place: ' in Helios' });
  assert.equal(local.label, `Local Map (${key})`);
  assert.equal(local.hint, `Open Local Map (${key}) for the live marker in Helios; no jump route is required.`);
  const here = localMapPauseCopy(key, { inThisSystem: true });
  assert.equal(here.hint, `Open Local Map (${key}) for the live marker in this system.`);

  const action = pauseMapAction({
    nav: {
      waypoint: {
        pos: { x: 12, z: -4 },
        sectorId: 'sector_helios_prime',
        sectorName: 'Helios',
      },
    },
    world: { currentSectorId: 'sector_helios_prime' },
  });
  assert.equal(action.hint, local.hint);
  assert.equal(action.label, local.label);
});

function shimDocument() {
  const doc = fakeDom();
  const realMake = doc._make;
  doc.createElement = (tag) => {
    const node = realMake(tag);
    node.ownerDocument = doc;
    const origAppendChild = node.appendChild.bind(node);
    const origAppend = node.append.bind(node);
    node.appendChild = (child) => {
      const result = origAppendChild(child);
      child.parentElement = node;
      return result;
    };
    node.append = (...kids) => {
      origAppend(...kids);
      for (const kid of kids) if (kid && typeof kid === 'object') kid.parentElement = node;
    };
    node.insertBefore = (child, ref) => {
      child.parentNode = node;
      child.parentElement = node;
      const index = node.children.indexOf(ref);
      node.children.splice(index < 0 ? node.children.length : index, 0, child);
      return child;
    };
    node.contains = (other) => !!(other && (other === node || node.children.some(
      (child) => child === other || (typeof child.contains === 'function' && child.contains(other)),
    )));
    const matchSel = (el, sel) => {
      if (sel.startsWith('.')) return el.classList.contains(sel.slice(1));
      return el.tagName === sel;
    };
    node.matches = (sel) => matchSel(node, sel);
    node.querySelectorAll = (sel) => findAll(node, (child) => child !== node && matchSel(child, sel));
    node.querySelector = (sel) => node.querySelectorAll(sel)[0] || null;
    return node;
  };
  return doc;
}

function mountGameplay() {
  const prev = globalThis.document;
  const doc = shimDocument();
  globalThis.document = doc;
  const settings = {
    audio: {}, video: {}, gameplay: {}, uiScale: 1, accessibility: {}, controls: {},
  };
  const bus = { emit() {}, on() { return () => {}; } };
  const ctx = { state: { settings }, bus, registry: { get: () => null }, helpers: {} };
  const root = doc.createElement('div');
  try {
    settingsScreen.mount(root, ctx);
    settingsScreen._select(ctx, 'Gameplay');
  } finally {
    globalThis.document = prev;
  }
  return { root, ctx };
}

function releaseAssistRow(root) {
  const row = findAll(root, (node) => node.tagName === 'li'
    && findAll(node, (child) => child.textContent === 'Massline release assist').length > 0)[0] || null;
  const select = row && row.querySelector ? row.querySelector('select') : null;
  const notes = findAll(root, (node) => typeof node.textContent === 'string'
    && node.textContent.includes('Massline'));
  return { row, select, notes };
}

test('PRO-12 the Massline release-assist row stays, disabled with a reason when the family is off', () => {
  const prior = MASSLINE2_FLAGS.enabled;
  try {
    MASSLINE2_FLAGS.enabled = false;
    const off = mountGameplay();
    const hidden = releaseAssistRow(off.root);
    assert.ok(hidden.row, 'row exists while the family is off');
    assert.equal(hidden.select && hidden.select.disabled, true);
    assert.equal(hidden.select.getAttribute('aria-disabled'), 'true');
    assert.ok(hidden.notes.some((node) => node.textContent.includes('Massline family is off')));

    MASSLINE2_FLAGS.enabled = true;
    const prev = globalThis.document;
    const doc = shimDocument();
    globalThis.document = doc;
    const root = doc.createElement('div');
    try {
      settingsScreen.mount(root, off.ctx);
      settingsScreen._select(off.ctx, 'Gameplay');
    } finally {
      globalThis.document = prev;
    }
    const on = releaseAssistRow(root);
    assert.ok(on.row, 'row exists while the family is on');
    assert.ok(on.select);
    assert.notEqual(on.select.disabled, true);
    const plate = findAll(root, (node) => typeof node.textContent === 'string' && node.textContent.includes('RELEASE'));
    assert.ok(plate.length > 0, 'the enabled row names the release marker');
    assert.equal(on.notes.some((node) => node.textContent.includes('Massline family is off')), false);
  } finally {
    MASSLINE2_FLAGS.enabled = prior;
  }
});

function bootDraft() {
  const state = createGameState(SEED);
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) {
      emitted.push({ event, payload });
      raw.emit(event, payload);
    },
  };
  const registry = {
    get(name) {
      if (name === 'ships') return ships;
      if (name === 'economy') return economy;
      if (name === 'survivalDraft') return survivalDraft;
      if (name === 'survivalRun') return survivalRun;
      return null;
    },
  };
  const ctx = { state, bus, helpers: {}, registry };
  economy.init(ctx);
  ships.init(ctx);
  if (economy.newGame) economy.newGame();
  if (ships.newGame) ships.newGame();
  runSession.init(ctx);
  survivalDraft.init(ctx);
  survivalRun.init(ctx);
  state.player.researchPoints += TECH_NODES.reduce((sum, node) => sum + ((node.cost && node.cost.rp) || 0), 0) + 1000;
  const cost = TECH_NODES.reduce((sum, node) => sum + ((node.cost && node.cost.credits) || 0), 0);
  if (cost > 0) economy.grantCredits(cost, 'test:tech');
  for (let pass = 0; pass < TECH_NODES.length + 1; pass++) {
    let progressed = false;
    for (const node of TECH_NODES) {
      if (!state.player.researchedNodes.includes(node.id) && ships.unlockTech(node.id)) progressed = true;
    }
    if (!progressed) break;
  }
  ships.buyShip({ defId: 'ship_hornet', setActive: true, grant: true });
  return { state, bus, emitted };
}

function enterDraft(harness) {
  harness.bus.emit('run:beginRequested', {
    kind: 'survival', ruleset: 'scored', seed: SEED, arenaId: ARENA,
  });
  let from = 'loadout';
  for (const next of ['arena_intro', 'wave_intro', 'active', 'cleanup', 'draft']) {
    harness.bus.emit('run:transitionRequested', {
      expectedPhase: from, nextPhase: next, reason: 't', tick: 0,
    });
    from = next;
  }
  harness.state.run.wave = 1;
  return harness.state.run;
}

function named(emitted, event) {
  return emitted.filter((entry) => entry.event === event);
}

test('NXI-069 a full-slot refusal is terminal and FIGHT-04 emits the modifier the run hears', () => {
  const refused = bootDraft();
  enterDraft(refused);
  const before = (refused.state.player.moduleInventory || []).map((item) => item.instanceId);
  const offer = (survivalDraft._offers || [])[0];
  assert.ok(offer, 'the draft opened with a card');
  offer.slotIndex = 999;
  const first = survivalDraft.resolvePick({ offerId: offer.id });
  assert.equal(first, true);
  const rejection = named(refused.emitted, 'run:draftResolved');
  assert.equal(rejection.length, 1);
  assert.equal(rejection[0].payload.reason, 'fit_refused');
  assert.equal(rejection[0].payload.applied, false);
  assert.equal(named(refused.emitted, 'run:modifierChosen').length, 0);
  assert.deepEqual(
    (refused.state.player.moduleInventory || []).map((item) => item.instanceId),
    before,
  );
  assert.equal(survivalDraft.resolvePick({ offerId: offer.id }), false);
  assert.equal(named(refused.emitted, 'run:draftResolved').length, 1);
  assert.deepEqual(
    (refused.state.player.moduleInventory || []).map((item) => item.instanceId),
    before,
  );

  const skipped = bootDraft();
  enterDraft(skipped);
  const skipBefore = (skipped.state.player.moduleInventory || []).length;
  assert.equal(survivalDraft.resolvePick({ offerId: null }), true);
  const skip = named(skipped.emitted, 'run:draftResolved');
  assert.equal(skip.length, 1);
  assert.equal(skip[0].payload.reason, 'skipped');
  assert.equal(named(skipped.emitted, 'run:modifierChosen').length, 0);
  assert.equal((skipped.state.player.moduleInventory || []).length, skipBefore);
  assert.equal(survivalDraft.resolvePick({ offerId: null }), false);

  const chosen = bootDraft();
  enterDraft(chosen);
  assert.equal(survivalRun._draftResolved, false);
  const card = (survivalDraft._offers || [])[0];
  assert.ok(card);
  const picked = survivalDraft.resolvePick({ offerId: card.id });
  assert.equal(picked, true);
  const modifiers = named(chosen.emitted, 'run:modifierChosen');
  assert.equal(modifiers.length, 1);
  assert.equal(modifiers[0].payload.picked, card.id);
  assert.equal(modifiers[0].payload.applied, true);
  assert.equal(survivalRun._draftResolved, true);
  const resolved = named(chosen.emitted, 'run:draftResolved');
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].payload.applied, true);
  const fittings = chosen.state.player.ownedShips[chosen.state.player.activeShipIndex].fittings;
  assert.equal(fittings.includes(card.defId), true);
});

test('PIC-23 cancel and end both hand the camera back to FOLLOW within 30 ticks', () => {
  const director = createCameraDirector();
  director.output.mode = CameraDirectorMode.FOCUS_PAIR;
  const events = [];
  const handlers = {};
  const bus = {
    on(name, fn) {
      (handlers[name] || (handlers[name] = [])).push(fn);
      return () => {
        handlers[name] = (handlers[name] || []).filter((entry) => entry !== fn);
      };
    },
    emit(name, payload) {
      events.push({ name, payload });
      for (const fn of handlers[name] || []) fn(payload);
    },
  };
  const unbind = bindFlybyFocusHandoff(director, bus);
  bus.emit('flybyFocus:end', { reason: 'expired', seed: SEED });
  assert.equal(director.output.mode, CameraDirectorMode.FOLLOW);
  director.output.mode = CameraDirectorMode.FOCUS_PAIR;
  bus.emit('flybyFocus:cancel', { reason: 'cancelled', seed: SEED });
  assert.equal(director.output.mode, CameraDirectorMode.FOLLOW);
  unbind();

  const state = createGameState(SEED);
  state.mode = 'flight';
  state.simTime = 2;
  state.meta = { ...(state.meta || {}), seed: SEED };
  const player = {
    id: state.playerId,
    alive: true,
    type: 'ship',
    team: 0,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    flags: {},
  };
  state.entities.set(state.playerId, player);
  assert.ok(player.pos);
  player.alive = true;
  if (player.flags) player.flags.docked = false;
  state.input = state.input || {};
  state.input.boost = true;
  state.input.fire = false;
  const heard = [];
  const focusBus = {
    on() { return () => {}; },
    emit(name, payload) { heard.push({ name, payload }); },
  };
  flybyFocus.init({ state, bus: focusBus, helpers: {}, registry: { get() { return null; } } });
  const focus = state.player.flybyFocus;
  focus.active = true;
  focus.targetId = 4242;
  focus.until = 10;
  director.output.mode = CameraDirectorMode.GATE_APPROACH;
  flybyFocus.update(1 / 60, state);
  assert.equal(heard.filter((entry) => entry.name === 'flybyFocus:cancel').length, 1);
  assert.equal(heard.filter((entry) => entry.name === 'flybyFocus:end').length, 1);
  assert.equal(heard.find((entry) => entry.name === 'flybyFocus:cancel').payload.seed, SEED);
  assert.equal(director.output.mode, CameraDirectorMode.FOLLOW);
  assert.equal(focus.active, false);

  focus.active = true;
  focus.until = 0;
  state.simTime = 3;
  state.input.boost = false;
  state.input.fire = false;
  director.output.mode = CameraDirectorMode.FOCUS_PAIR;
  flybyFocus.update(1 / 60, state);
  assert.equal(heard.filter((entry) => entry.name === 'flybyFocus:end').length, 2);
  assert.equal(heard.filter((entry) => entry.name === 'flybyFocus:cancel').length, 1);
  assert.equal(director.output.mode, CameraDirectorMode.FOLLOW);

  const view = { followX: 0, followZ: 0, followZoom: 72, fov: 50, aspect: 16 / 9, tiltDeg: 60 };
  for (let tick = 0; tick < 30; tick++) {
    director.step(1 / 60, state, player, view);
    assert.equal(director.output.mode, CameraDirectorMode.FOLLOW);
  }
});
