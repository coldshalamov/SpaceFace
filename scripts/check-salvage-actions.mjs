// BP-01.1 packet SALVAGE_DISTINCT_FROM_MINING ("Salvage Is Not Mining").
//
// Contract:
//   - src/data/salvageActions.js is a pure catalog: parentType -> distinct verb/glyph/pool.
//   - src/systems/salvageActions.js annotates existing wreck entities only. It does not touch
//     salvage.js/mining.js/combat.js and does not spawn new entities.
//   - A debris wreck reads "cut panels"; a communicator reads "decode"; ship/module wreckage reads
//     "pull module"; an unstable reactor reads "vent or tether-away".
//   - Unstable reactors have counterplay. Venting or towing clear prevents damage; ignoring the
//     timer routes bounded damage through the existing combat system seam.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

assert.equal(typeof window, 'undefined', 'this check must run headless');
assert.ok(existsSync(new URL('../src/data/salvageActions.js', import.meta.url)),
  'src/data/salvageActions.js exists');
assert.ok(existsSync(new URL('../src/systems/salvageActions.js', import.meta.url)),
  'src/systems/salvageActions.js exists');

const dataMod = await import('../src/data/salvageActions.js');
const sysMod = await import('../src/systems/salvageActions.js');
const {
  SALVAGE_ACTIONS,
  actionForWreck,
  poolForAction,
  actionReadoutForWreck,
} = dataMod;
const salvageActions = sysMod.salvageActions || sysMod.default;

assert.ok(salvageActions && salvageActions.name === 'salvageActions',
  'salvageActions system exports the registry object');

function guarded(fn) {
  const r = Math.random, n = Date.now;
  Math.random = () => { throw new Error('Math.random in salvage-actions path'); };
  Date.now = () => { throw new Error('Date.now in salvage-actions path'); };
  try { return fn(); } finally { Math.random = r; Date.now = n; }
}

function makeBus() {
  const handlers = new Map();
  const emitted = [];
  const bus = {
    on(evt, fn) { if (!handlers.has(evt)) handlers.set(evt, []); handlers.get(evt).push(fn); },
    off(evt, fn) { const l = handlers.get(evt) || []; const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); },
    emit(evt, p) { emitted.push({ evt, p }); for (const fn of (handlers.get(evt) || []).slice()) fn(p); },
  };
  return { bus, emitted };
}

function makeWreck(id, parentType, extra = {}) {
  return {
    id,
    type: 'wreck',
    alive: true,
    pos: extra.pos || { x: 0, z: 0 },
    radius: 8,
    data: {
      parentType,
      salvagePool: { cmdty_scrap_metal: 1 },
      scanLabel: 'Wreck Debris',
      ...extra.data,
    },
  };
}

function makeState(wrecks = []) {
  return {
    meta: { seed: 123 },
    simTime: 10,
    playerId: 1,
    player: { tether: { active: false, targetId: null } },
    ui: {},
    entities: new Map([[1, { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, hull: 100 }]]),
  };
}

function initSystem(state, bus, combat) {
  const sys = { ...salvageActions };
  sys.init({
    state,
    bus,
    registry: { get(name) { return name === 'combat' ? combat : null; } },
    helpers: {},
  });
  return sys;
}

testCatalogIntegrity();
guarded(testEntityAnnotationAndScanReadout);
guarded(testVentReactorPreventsDamage);
guarded(testTetherAwayPreventsDamage);
guarded(testIgnoredReactorRoutesBoundedCombatDamage);

console.log('Salvage-actions checks OK');

function testCatalogIntegrity() {
  for (const id of ['cut_panel', 'pull_module', 'decode_blackbox', 'vent_reactor']) {
    const action = SALVAGE_ACTIONS[id];
    assert.ok(action, `${id} exists`);
    assert.ok(action.verb && action.label && action.glyph, `${id} has verb/label/glyph`);
    assert.ok(action.pool && typeof action.pool === 'object', `${id} has a pool`);
  }
  assert.equal(actionForWreck(makeWreck(10, 'debris')).id, 'cut_panel',
    'debris wreck -> cut panels');
  assert.equal(actionForWreck(makeWreck(11, 'communicator')).id, 'decode_blackbox',
    'communicator -> decode black box');
  assert.equal(actionForWreck(makeWreck(12, 'ship')).id, 'pull_module',
    'ship wreck -> pull module');
  assert.equal(actionForWreck(makeWreck(13, 'reactor', { data: { unstableReactor: true } })).id, 'vent_reactor',
    'unstable reactor -> vent reactor');

  const sigs = ['cut_panel', 'pull_module', 'decode_blackbox', 'vent_reactor']
    .map((id) => JSON.stringify(poolForAction(SALVAGE_ACTIONS[id], id)));
  assert.equal(new Set(sigs).size, sigs.length, 'each verb has a distinct deterministic pool');
  assert.equal(new Set(Object.values(SALVAGE_ACTIONS).map((a) => a.glyph)).size,
    Object.values(SALVAGE_ACTIONS).length, 'each verb has a distinct scan glyph');
  assert.ok(SALVAGE_ACTIONS.vent_reactor.counterplay.includes('vent'));
  assert.ok(SALVAGE_ACTIONS.vent_reactor.counterplay.includes('tether-away'));
}

function testEntityAnnotationAndScanReadout() {
  const { bus, emitted } = makeBus();
  const state = makeState();
  const combat = { hits: [], onHit(p) { this.hits.push(p); return { ok: true }; } };
  const sys = initSystem(state, bus, combat);
  const debris = makeWreck(20, 'debris');
  const comm = makeWreck(21, 'communicator');
  state.entities.set(debris.id, debris);
  state.entities.set(comm.id, comm);

  bus.emit('entity:spawned', { id: debris.id, type: 'wreck', entity: debris });
  bus.emit('entity:spawned', { id: comm.id, type: 'wreck', entity: comm });

  assert.equal(debris.data.salvageAction.id, 'cut_panel', 'debris annotated with cut_panel');
  assert.equal(comm.data.salvageAction.id, 'decode_blackbox', 'communicator annotated with decode');
  assert.notDeepEqual(debris.data.salvagePool, comm.data.salvagePool,
    'debris and communicator have distinct pools');
  assert.match(debris.data.scanLabel, /cut panels/i, 'debris scan label reads as salvage, not mining');
  assert.match(comm.data.scanLabel, /decode/i, 'communicator scan label reads as decoding');

  bus.emit('scan:completed', { targetId: debris.id, sectorId: 'sector_tethys' });
  assert.equal(state.ui.salvageActionRead.targetId, debris.id, 'scan surfaces targeted wreck readout');
  assert.equal(state.ui.salvageActionRead.actionId, 'cut_panel');
  assert.equal(actionReadoutForWreck(debris).glyph, debris.data.salvageAction.glyph,
    'pure readout agrees with entity annotation');
  assert.equal(emitted.some((e) => e.evt === 'entity:spawned' && e.p && e.p.type !== 'wreck'), false,
    'system does not spawn extra entities');
  sys.destroy();
}

function testVentReactorPreventsDamage() {
  const { bus, emitted } = makeBus();
  const state = makeState();
  const hits = [];
  const combat = { onHit(p) { hits.push(p); return { ok: true }; } };
  const reactor = makeWreck(30, 'reactor', { data: { unstableReactor: true } });
  state.entities.set(reactor.id, reactor);
  const sys = initSystem(state, bus, combat);
  bus.emit('entity:spawned', { id: reactor.id, type: 'wreck', entity: reactor });

  assert.equal(reactor.data.salvageAction.id, 'vent_reactor', 'reactor gets vent action');
  assert.ok(reactor.data.unstableReactor.dueAt > state.simTime, 'reactor timer armed');
  bus.emit('salvage:ventReactor', { wreckId: reactor.id });
  state.simTime = reactor.data.unstableReactor.dueAt + 1;
  sys.update(1, state);

  assert.equal(hits.length, 0, 'venting prevents combat damage');
  assert.equal(reactor.data.unstableReactor.vented, true, 'reactor marked vented');
  assert.equal(emitted.some((e) => e.evt === 'salvage:reactorVented'), true,
    'vent emits the counterplay receipt');
  sys.destroy();
}

function testTetherAwayPreventsDamage() {
  const { bus, emitted } = makeBus();
  const state = makeState();
  const hits = [];
  const combat = { onHit(p) { hits.push(p); return { ok: true }; } };
  const reactor = makeWreck(31, 'reactor', { pos: { x: 420, z: 0 }, data: { unstableReactor: true } });
  state.entities.set(reactor.id, reactor);
  state.player.tether = { active: true, targetId: reactor.id };
  const sys = initSystem(state, bus, combat);
  bus.emit('entity:spawned', { id: reactor.id, type: 'wreck', entity: reactor });

  state.simTime = reactor.data.unstableReactor.dueAt + 1;
  sys.update(1, state);

  assert.equal(hits.length, 0, 'tethering the reactor away prevents damage');
  assert.equal(reactor.data.unstableReactor.towedClear, true, 'reactor marked towed-clear');
  assert.equal(emitted.some((e) => e.evt === 'salvage:reactorTowedClear'), true,
    'tether-away emits the counterplay receipt');
  sys.destroy();
}

function testIgnoredReactorRoutesBoundedCombatDamage() {
  const { bus, emitted } = makeBus();
  const state = makeState();
  const hits = [];
  const combat = { onHit(p) { hits.push(p); return { ok: true }; } };
  const reactor = makeWreck(32, 'reactor', { pos: { x: 20, z: 0 }, data: { unstableReactor: true } });
  state.entities.set(reactor.id, reactor);
  const sys = initSystem(state, bus, combat);
  bus.emit('entity:spawned', { id: reactor.id, type: 'wreck', entity: reactor });

  state.simTime = reactor.data.unstableReactor.dueAt + 1;
  sys.update(1, state);

  assert.equal(hits.length, 1, 'ignored reactor routes one damage packet through combat');
  assert.equal(hits[0].targetId, state.playerId, 'damage targets the player through combat owner');
  assert.ok(hits[0].damage > 0 && hits[0].damage <= SALVAGE_ACTIONS.vent_reactor.burstDamage,
    'damage is bounded by the action catalog');
  assert.equal(reactor.alive, false, 'burst consumes the unstable wreck');
  assert.equal(emitted.some((e) => e.evt === 'salvage:reactorBurst'), true,
    'burst emits a consequence receipt');
  sys.destroy();
}
