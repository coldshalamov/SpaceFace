// BP-01.1 story/narrative gate: wreck-module anatomy.
//
// This is a verification-only check over shipped backend contracts. It proves wrecks expose typed
// anatomy for black-box, module, reactor, and survivor-pod salvage without relying on asset/render
// work. T6f owns the visual parts; this check owns the gameplay-readable data seams.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

assert.equal(typeof window, 'undefined', 'this check must run headless');
assert.ok(existsSync(new URL('../src/data/salvageActions.js', import.meta.url)),
  'src/data/salvageActions.js exists');
assert.ok(existsSync(new URL('../src/systems/salvageActions.js', import.meta.url)),
  'src/systems/salvageActions.js exists');
assert.ok(existsSync(new URL('../src/systems/survivorPod.js', import.meta.url)),
  'src/systems/survivorPod.js exists');

const salvageData = await import('../src/data/salvageActions.js');
const salvageSysMod = await import('../src/systems/salvageActions.js');
const survivorPodMod = await import('../src/systems/survivorPod.js');
const {
  SALVAGE_ACTIONS,
  actionForWreck,
  actionReadoutForWreck,
  poolForAction,
} = salvageData;
const salvageActions = salvageSysMod.salvageActions || salvageSysMod.default;
const survivorPod = survivorPodMod.survivorPod || survivorPodMod.default;

assert.ok(salvageActions && salvageActions.name === 'salvageActions',
  'salvageActions system exports the registry object');
assert.ok(survivorPod && survivorPod.name === 'survivorPod',
  'survivorPod system exports the registry object');

function guarded(fn) {
  const random = Math.random;
  const now = Date.now;
  Math.random = () => { throw new Error('Math.random in salvage-anatomy path'); };
  Date.now = () => { throw new Error('Date.now in salvage-anatomy path'); };
  try { return fn(); } finally { Math.random = random; Date.now = now; }
}

function makeBus() {
  const handlers = new Map();
  const emitted = [];
  const bus = {
    on(evt, fn) {
      if (!handlers.has(evt)) handlers.set(evt, []);
      handlers.get(evt).push(fn);
    },
    off(evt, fn) {
      const list = handlers.get(evt) || [];
      const idx = list.indexOf(fn);
      if (idx >= 0) list.splice(idx, 1);
    },
    emit(evt, payload) {
      emitted.push({ evt, payload });
      for (const fn of (handlers.get(evt) || []).slice()) fn(payload);
    },
  };
  return { bus, emitted };
}

function makeWreck(id, parentType, extra = {}) {
  return {
    id,
    type: 'wreck',
    alive: true,
    pos: extra.pos || { x: 0, z: 0 },
    radius: 9,
    data: {
      parentType,
      scanLabel: 'Wreck Debris',
      salvagePool: { cmdty_scrap_metal: 1 },
      ...extra.data,
    },
  };
}

function makeState() {
  return {
    meta: { seed: 7713 },
    simTime: 12,
    playerId: 1,
    player: { tether: { active: false, targetId: null } },
    world: { currentSectorId: 'sector_tethys_junction' },
    ui: {},
    entities: new Map([
      [1, { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, hull: 100 }],
    ]),
  };
}

function makePodState() {
  const a = makeWreck(201, 'debris', { pos: { x: 140, z: -25 } });
  const b = makeWreck(202, 'debris', { pos: { x: -180, z: 60 } });
  const state = makeState();
  state.entities.set(a.id, a);
  state.entities.set(b.id, b);
  state.salvage = {
    points: [
      {
        id: 'pod_point_a',
        sectorId: 'sector_tethys_junction',
        zoneId: 'zone_tethys_derelict',
        pos: { ...a.pos },
        entityId: a.id,
        isCommunicator: false,
        wreckMissionId: null,
        offered: false,
      },
      {
        id: 'pod_point_b',
        sectorId: 'sector_tethys_junction',
        zoneId: 'zone_tethys_derelict',
        pos: { ...b.pos },
        entityId: b.id,
        isCommunicator: false,
        wreckMissionId: null,
        offered: false,
      },
    ],
  };
  return state;
}

function initSalvageSystem(state, bus) {
  const sys = { ...salvageActions };
  sys.init({
    state,
    bus,
    registry: { get() { return null; } },
    helpers: {},
  });
  return sys;
}

function initSurvivorPod(state, bus) {
  const sys = { ...survivorPod };
  sys.init({ state, bus, helpers: {} });
  return sys;
}

function spawnWreck(state, bus, wreck) {
  state.entities.set(wreck.id, wreck);
  bus.emit('entity:spawned', { id: wreck.id, type: 'wreck', entity: wreck });
  return wreck;
}

guarded(testPureAnatomyCatalog);
guarded(testSystemAnnotatesTypedWreckModules);
guarded(testSurvivorPodPromotesExistingWreckAsTypedPod);

console.log('PASS  check:salvage-anatomy');

function testPureAnatomyCatalog() {
  assert.deepEqual(Object.keys(SALVAGE_ACTIONS).sort(), [
    'cut_panel',
    'decode_blackbox',
    'pull_module',
    'vent_reactor',
  ], 'wreck anatomy exposes the four BP-01.1 backend verbs');

  const blackbox = makeWreck(10, 'communicator', {
    data: { isCommunicator: true, wreckMissionId: 'wm_blackbox_attacker' },
  });
  const moduleWreck = makeWreck(11, 'module');
  const reactor = makeWreck(12, 'reactor', { data: { unstableReactor: true } });

  assert.equal(actionForWreck(blackbox).id, 'decode_blackbox',
    'communicator anatomy maps to black-box decoding');
  assert.match(actionForWreck(blackbox).label, /black box/i,
    'black-box anatomy is named as a black box, not generic salvage');
  assert.equal(actionReadoutForWreck(blackbox).glyph, 'LOG',
    'black-box anatomy gets the log glyph');

  assert.equal(actionForWreck(moduleWreck).id, 'pull_module',
    'module anatomy maps to module extraction');
  assert.match(actionForWreck(moduleWreck).hint, /subsystem/i,
    'module anatomy copy names a subsystem instead of ore');
  assert.equal(actionReadoutForWreck(moduleWreck).glyph, 'MOD',
    'module anatomy gets the module glyph');

  assert.equal(actionForWreck(reactor).id, 'vent_reactor',
    'reactor anatomy maps to reactor venting');
  assert.equal(actionReadoutForWreck(reactor).unstable, true,
    'reactor readout marks the module unstable');
  assert.deepEqual(actionReadoutForWreck(reactor).counterplay.sort(), ['tether-away', 'vent'],
    'reactor anatomy exposes both counterplay verbs');

  const pools = ['decode_blackbox', 'pull_module', 'vent_reactor']
    .map((id) => JSON.stringify(poolForAction(id)));
  assert.equal(new Set(pools).size, pools.length,
    'black-box/module/reactor anatomy each yields a distinct deterministic pool');
}

function testSystemAnnotatesTypedWreckModules() {
  const { bus, emitted } = makeBus();
  const state = makeState();
  const sys = initSalvageSystem(state, bus);

  const blackbox = spawnWreck(state, bus, makeWreck(21, 'communicator', {
    data: { isCommunicator: true, wreckMissionId: 'wm_blackbox_attacker' },
  }));
  const moduleWreck = spawnWreck(state, bus, makeWreck(22, 'module'));
  const reactor = spawnWreck(state, bus, makeWreck(23, 'reactor', {
    data: { unstableReactor: true },
  }));

  assert.equal(blackbox.data.salvageAction.id, 'decode_blackbox',
    'spawned black box gets decode anatomy');
  assert.equal(moduleWreck.data.salvageAction.id, 'pull_module',
    'spawned module wreck gets pull-module anatomy');
  assert.equal(reactor.data.salvageAction.id, 'vent_reactor',
    'spawned reactor gets vent anatomy');
  assert.ok(reactor.data.unstableReactor.dueAt > state.simTime,
    'reactor anatomy arms a future instability timer');
  assert.match(blackbox.data.scanLabel, /black box/i,
    'black-box scan label survives system annotation');
  assert.match(moduleWreck.data.scanLabel, /module/i,
    'module scan label survives system annotation');
  assert.match(reactor.data.scanLabel, /reactor/i,
    'reactor scan label survives system annotation');
  assert.notDeepEqual(blackbox.data.salvagePool, moduleWreck.data.salvagePool,
    'black-box and module anatomy are not the same mining pool');
  assert.notDeepEqual(moduleWreck.data.salvagePool, reactor.data.salvagePool,
    'module and reactor anatomy are not the same mining pool');

  bus.emit('scan:completed', { targetId: blackbox.id, sectorId: 'sector_tethys_junction' });
  assert.equal(state.ui.salvageActionRead.actionId, 'decode_blackbox',
    'scan surfaces the targeted black-box action');
  assert.equal(emitted.some((e) => e.evt === 'spawn:entity'), false,
    'anatomy annotation does not request new spawns');
  sys.destroy();
}

function testSurvivorPodPromotesExistingWreckAsTypedPod() {
  const { bus, emitted } = makeBus();
  const state = makePodState();
  const sys = initSurvivorPod(state, bus);

  bus.emit('salvage:placed', { sectorId: 'sector_tethys_junction', count: 2, communicators: 0 });
  const promoted = state.salvage.points.filter((p) => p && p.survivorPod);
  assert.equal(promoted.length, 1,
    'survivor-pod anatomy promotes exactly one existing salvage point');

  const point = promoted[0];
  const ent = state.entities.get(point.entityId);
  assert.ok(ent, 'promoted pod keeps its original wreck entity');
  assert.equal(ent.data.parentType, 'survivor_pod',
    'survivor pod has a discrete parentType');
  assert.equal(ent.data.tetherRole, 'survivor_pod',
    'survivor pod exposes the tow role instead of generic debris');
  assert.equal(ent.data.isCommunicator, true,
    'survivor pod stays on the shipped salvage communicator path');
  assert.equal(ent.data.wreckMissionId, 'wm_survivor_pod',
    'survivor pod reuses the shipped survivor-pod mission template');
  assert.ok(ent.data.survivorPod && ent.data.survivorPod.oxygenDueAt > state.simTime,
    'survivor pod mirrors oxygen anatomy metadata onto the entity');
  assert.match(ent.data.scanLabel, /survivor pod|oxygen/i,
    'survivor-pod scan label is not generic debris');
  assert.equal(emitted.filter((e) => e.evt === 'survivorPod:promoted').length, 1,
    'typed pod promotion emits one receipt');
  assert.equal(emitted.some((e) => e.evt === 'entity:spawned' || e.evt === 'spawn:entity'), false,
    'survivor-pod anatomy reuses an existing wreck instead of spawning one');

  sys.update(1, state);
  assert.equal(state.ui.survivorPod.salvagePointId, point.id,
    'survivor-pod anatomy has a visible countdown readout');

  const offer = {
    source: 'salvage',
    offerId: `offer_${point.id}`,
    salvagePointId: point.id,
    type: 'salvage_retrieval',
    title: 'Generic Salvage',
    summary: 'Generic summary',
  };
  bus.emit('mission:offered', offer);
  assert.equal(offer.type, 'passenger_transport',
    'survivor-pod anatomy routes rescue as passenger transport');
  assert.equal(offer.params.passengers, 1,
    'survivor-pod rescue carries one passenger');
  assert.ok(offer.survivorPod && offer.survivorPod.stripRoute,
    'survivor-pod anatomy exposes both rescue and strip routes');
  sys.destroy();
}
