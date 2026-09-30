import { parentPort } from 'node:worker_threads';

import { wrapAngle, ObjectiveKind } from '../src/ai/contracts.js';
import { ShipUtilitySelector } from '../src/ai/shipDecision.js';
import { applySpecialistCounterplay } from '../src/ai/specialistCounterplay.js';
import { createAttachmentService } from '../src/combat/attachments.js';
import { createCombatCatalog, ensureCombatState } from '../src/combat/runtime.js';
import { createBus } from '../src/core/eventBus.js';
import { economy } from '../src/systems/economy.js';
import { claims as claimsBase } from '../src/systems/claims.js';
import { automation } from '../src/systems/automation.js';

function makeEconHost() {
  const econ = Object.create(economy);
  econ.state = {
    meta: { seed: 47 },
    simTime: 1000,
    player: {},
    entities: new Map(),
    economy: {
      markets: {},
      cycles: {},
      econEvents: [],
      econClock: { accumulator: 0, lastTickT: 0, ticksElapsed: 0 },
      marketIntel: {},
      rngSeed: 123,
    },
  };
  econ.bus = createBus();
  econ._nextEventId = 1;
  econ._eventAccumulator = 0;
  econ._installRngFunction();
  return econ;
}

function makeClaimsHost() {
  const sys = { ...claimsBase };
  sys.state = {
    meta: { seed: 5 },
    simTime: 100,
    player: { credits: 1000000 },
    entities: new Map(),
    entityList: [],
    world: { currentSectorId: 'sector_a' },
    claims: {
      bodies: [{
        id: 'b1',
        owned: true,
        modules: [],
        spec: {
          id: 'spec_bastion',
          status: 'active',
          upkeepDebt: 0,
          store: { input: {}, output: {} },
          receipts: [],
          totals: {},
          defense: null,
        },
      }],
      meta: { rngSeed: 3, upkeepAccum: 0, raidAccum: 0, nextRaidId: 1 },
    },
  };
  sys.bus = createBus();
  sys._resumeDefenseIds = new Set();
  return sys;
}

function body(id, type, x, z, extra = {}) {
  return {
    id,
    type,
    alive: true,
    collides: true,
    team: type === 'ship' ? 0 : null,
    pos: { x, z },
    vel: { x: 0, z: 0 },
    rot: 0,
    hull: 100,
    hullMax: 100,
    data: {},
    ...extra,
  };
}

function liveLine() {
  const player = body('player', 'ship', 0, 0, { radius: 8, mass: 40 });
  const rock = body('rock', 'asteroid', 120, 0, { radius: 16, mass: 640 });
  const entities = new Map([[player.id, player], [rock.id, rock]]);
  const state = {
    mode: 'flight',
    tick: 100,
    simTime: 5,
    playerId: player.id,
    player: {},
    entities,
    entityList: [...entities.values()],
    runtime: { features: {} },
    world: { currentSectorId: 'test-sector' },
  };
  ensureCombatState(state);
  const catalog = createCombatCatalog();
  const physics = {
    createAttachment(spec) { return { id: `joint:${spec.attachmentId}` }; },
    cutAttachment() { return true; },
  };
  const attachments = createAttachmentService({
    state,
    catalog,
    helpers: { combatPhysics: physics },
    bus: createBus(),
  });
  const created = attachments.create({
    defId: 'tether_standard',
    ownerId: player.id,
    targetId: rock.id,
    sourceWorld: { x: 0, z: 0 },
    targetWorld: { x: 120, z: 0 },
  });
  if (!created.ok) throw new Error('fixture line failed: ' + created.reason);
  return { state, player, rock, line: created.attachment, attachments };
}

const OPS = {
  wrapAngle({ value }) {
    return { value: wrapAngle(value) };
  },
  selectorHugeRot() {
    const sel = new ShipUtilitySelector();
    const selected = sel.select({
      tick: 0,
      entityId: 7,
      perception: {
        self: {
          id: 7,
          pos: { x: 0, z: 0 },
          rot: 1e30,
          hullFraction: 0.9,
          energyFraction: 0.9,
          heatFraction: 0.1,
          tethered: true,
        },
        contacts: [{
          id: 1,
          kind: 'ship',
          pos: { x: 10, z: 0 },
          vel: { x: 0, z: 0 },
          alive: true,
          visible: true,
          hostile: true,
          confidence: 1,
          threat: 0.5,
          tags: [],
        }],
        events: [],
      },
      directive: {
        objective: { kind: ObjectiveKind.COUNTER_TETHER_OVERLOAD, targetId: 1, reason: 'fixture' },
        formation: {},
        tactic: 'counter',
      },
      actionDefs: [{
        id: 'action_overload',
        tags: ['counter_tether_overload'],
        metadata: { requiresEscapeAlignment: true },
      }],
    });
    return { actionId: selected ? selected.actionId : 'no-selection' };
  },
  counterplayHugeBearing() {
    const h = liveLine();
    const raider = {
      id: 'raider',
      alive: true,
      pos: { x: 40, z: 0 },
      data: { lootTableId: 'tether_control_raider' },
    };
    h.state.entities.set(raider.id, raider);
    applySpecialistCounterplay({
      state: h.state,
      specialist: raider,
      enemyId: 'tether_control_raider',
      doctrinePhase: 'spool_cue',
      tick: 30,
      attachments: h.attachments,
      fields: null,
    });
    const committed = !!(raider.data && raider.data._cutterCommit);
    if (committed) raider.data._cutterCommit.bearing = 1e30;
    const second = applySpecialistCounterplay({
      state: h.state,
      specialist: raider,
      enemyId: 'tether_control_raider',
      doctrinePhase: 'attach_window',
      tick: 31,
      attachments: h.attachments,
      fields: null,
    });
    return { committed, second: second ? second.verb || 'result' : null };
  },
  econUpdateHuge() {
    const econ = makeEconHost();
    econ.state.economy.econClock.accumulator = 1e30;
    try {
      econ.update(0.5, econ.state);
      return { threw: null, accumulator: econ.state.economy.econClock.accumulator };
    } catch (err) {
      return { threw: err.name, accumulator: econ.state.economy.econClock.accumulator };
    }
  },
  econTickHuge() {
    const econ = makeEconHost();
    econ._eventAccumulator = 1e30;
    try {
      econ.econTick(5, econ.state);
      return { threw: null, eventAccumulator: econ._eventAccumulator };
    } catch (err) {
      return { threw: err.name, eventAccumulator: econ._eventAccumulator };
    }
  },
  claimsUpdateHuge({ field }) {
    const sys = makeClaimsHost();
    sys.state.claims.meta[field] = 1e30;
    try {
      sys.update(0.5, sys.state);
      return { threw: null, value: sys.state.claims.meta[field] };
    } catch (err) {
      return { threw: err.name, value: sys.state.claims.meta[field] };
    }
  },
  autoOffscreenHuge() {
    const auto = Object.create(automation);
    auto.state = { world: { currentSectorId: 'sector_a' } };
    const a = { accumulators: { offscreenNetworkS: 1e30 }, drones: [], outposts: [] };
    try {
      auto._updateOffscreenNetwork(0.5, a);
      return { threw: null, value: a.accumulators.offscreenNetworkS };
    } catch (err) {
      return { threw: err.name, value: a.accumulators.offscreenNetworkS };
    }
  },
  autoOutpostsHuge({ field }) {
    const auto = Object.create(automation);
    auto.state = { world: { currentSectorId: 'sector_a' } };
    auto._outpostSellAccum = field === 'sell' ? 1e30 : 0;
    auto._outpostRaidAccum = field === 'raid' ? 1e30 : 0;
    const a = { outposts: [{ id: 'o1', sectorId: 'sector_b' }] };
    try {
      auto._updateOutposts(0.5, a);
      return { threw: null, sell: auto._outpostSellAccum, raid: auto._outpostRaidAccum };
    } catch (err) {
      return {
        threw: err.name,
        sell: auto._outpostSellAccum,
        raid: auto._outpostRaidAccum,
      };
    }
  },
};

parentPort.once('message', (msg) => {
  parentPort.postMessage({ type: 'ready' });
  const op = OPS[msg && msg.op];
  if (!op) {
    parentPort.postMessage({ type: 'done', error: { name: 'Error', message: `unknown op ${msg && msg.op}` } });
    return;
  }
  try {
    parentPort.postMessage({ type: 'done', result: op(msg) });
  } catch (err) {
    parentPort.postMessage({
      type: 'done',
      error: { name: err && err.name, message: String((err && err.message) || err) },
    });
  }
});
