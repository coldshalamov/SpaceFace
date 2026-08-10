import { AI_CONTRACT_VERSION } from '../ai/contracts.js';
import { ActivityKind, RulesOfEngagement, normalizeActivity } from '../ai/doctrine.js';
import { hash32 } from '../core/rng.js';
import { makeEnemySpawnSpec } from './combat.js';

const HISTORY_CAPACITY = 128;

const REINFORCEMENT_PACKAGES = Object.freeze({
  fixture_wing_pair: Object.freeze({
    typeId: 'wasp_swarmer',
    count: 2,
    level: 1,
    delayTicks: 1,
    radiusMin: 180,
    radiusMax: 240,
    doctrine: 'scavenger',
    factionId: 'faction_vael',
    squadPrefix: 'sg06_fixture_wing',
  }),
  vael_wing_pair: Object.freeze({
    typeId: 'reaver_pirate',
    count: 2,
    level: 2,
    delayTicks: 90,
    radiusMin: 520,
    radiusMax: 720,
    doctrine: 'scavenger',
    factionId: 'faction_vael',
    squadPrefix: 'sg06_vael_wing',
  }),
  scn_interceptor_pair: Object.freeze({
    typeId: 'patrol_lawman',
    count: 2,
    level: 3,
    delayTicks: 90,
    radiusMin: 560,
    radiusMax: 760,
    doctrine: 'official',
    factionId: 'faction_scn',
    squadPrefix: 'sg06_scn_interceptor',
  }),
});

export const aiEncounter = {
  name: 'aiEncounter',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || (ctx.helpers = {});
    ensureOwnerState(this.state);
    this.helpers.inspectAIEncounter = () => this.inspect();
  },

  update(_dt, state) {
    const encounter = ensureEncounterState(state);
    const owner = ensureOwnerState(state);
    const commands = Array.isArray(encounter.commands) ? encounter.commands : [];
    if (commandsOutOfOrder(commands)) commands.sort((a, b) => finiteInt(a && a.seq) - finiteInt(b && b.seq));
    for (const command of commands) {
      const seq = finiteInt(command && command.seq);
      if (seq <= owner.lastAppliedSeq) continue;
      this._applyCommand(command, owner, state);
      owner.lastAppliedSeq = Math.max(owner.lastAppliedSeq, seq);
    }
    this._spawnDue(owner, state);
  },

  inspect() {
    const owner = ensureOwnerState(this.state);
    return Object.freeze({
      schemaVersion: AI_CONTRACT_VERSION,
      phase: owner.phase,
      lastAppliedSeq: owner.lastAppliedSeq,
      pendingReinforcements: owner.pendingReinforcements.length,
      spawned: owner.spawned.length,
      rejectedCommands: owner.rejectedCommands.length,
    });
  },

  newGame() {
    this.state.aiEncounter = { schemaVersion: AI_CONTRACT_VERSION, nextSeq: 1, commands: [] };
    ensureOwnerState(this.state);
  },

  _applyCommand(command, owner, state) {
    if (!command || typeof command !== 'object') return reject(owner, command, 'command_invalid');
    if (command.type === 'phase') {
      owner.phase = String(command.phase || 'unknown');
      pushCapped(owner.phaseHistory, { seq: command.seq, tick: command.tick, phase: owner.phase });
      emit(this.bus, 'ai:encounterPhase', { seq: command.seq, tick: command.tick, phase: owner.phase });
      return;
    }
    if (command.type === 'order_retreat') {
      const record = { seq: command.seq, tick: command.tick, reason: String(command.reason || 'unspecified') };
      pushCapped(owner.retreatOrders, record);
      emit(this.bus, 'ai:encounterRetreat', record);
      return;
    }
    if (command.type === 'narrative_beat') {
      const record = { seq: command.seq, tick: command.tick, beatIndex: Math.max(0, finiteInt(command.beatIndex)) };
      pushCapped(owner.narrativeBeats, record);
      emit(this.bus, 'ai:encounterNarrativeBeat', record);
      return;
    }
    if (command.type === 'request_reinforcement') {
      this._scheduleReinforcement(command, owner, state);
      return;
    }
    reject(owner, command, 'command_type_invalid');
  },

  _scheduleReinforcement(command, owner, state) {
    const pkg = reinforcementPackage(command.packageId);
    if (!pkg) {
      reject(owner, command, 'reinforcement_package_unknown');
      return;
    }
    const anchor = spawnAnchor(state);
    const count = Math.max(0, finiteInt(pkg.count));
    const dueTick = Math.max(finiteInt(state.tick) + 1, finiteInt(state.tick) + finiteInt(pkg.delayTicks, 1));
    const squadId = `${pkg.squadPrefix}_${String(command.seq).padStart(4, '0')}`;
    for (let index = 0; index < count; index++) {
      const pos = spawnPosition(anchor, state, command, pkg, index);
      owner.pendingReinforcements.push({
        id: `reinforcement_${command.seq}_${index}`,
        commandSeq: command.seq,
        packageId: pkg.id,
        typeId: pkg.typeId,
        level: pkg.level,
        dueTick,
        pos,
        anchor,
        leashRadius: finite(pkg.leashRadius, 2600),
        doctrine: pkg.doctrine,
        factionId: pkg.factionId,
        squadId,
      });
    }
    pushCapped(owner.scheduled, {
      seq: command.seq,
      tick: command.tick,
      packageId: pkg.id,
      count,
      dueTick,
      budgetRemaining: Math.max(0, finiteInt(command.budgetRemaining)),
    });
    emit(this.bus, 'ai:reinforcementScheduled', {
      seq: command.seq,
      tick: command.tick,
      packageId: pkg.id,
      count,
      dueTick,
    });
  },

  _spawnDue(owner, state) {
    const helper = this.helpers && this.helpers.spawnEntity;
    if (typeof helper !== 'function') return;
    const budget = this.helpers && this.helpers.spawnBudget;
    const keep = [];
    for (const pending of owner.pendingReinforcements) {
      if (finiteInt(pending.dueTick) > finiteInt(state.tick)) {
        keep.push(pending);
        continue;
      }
      // Reinforcements are ordinary live combatants and therefore share the same hard cap as
      // authored encounters. Keep a due ship pending when saturated; the first released slot lets
      // it arrive on the next deterministic tick instead of silently overflowing the sector.
      const budgeted = !!(budget && typeof budget.request === 'function');
      if (budgeted && budget.request(1, pending.squadId) <= 0) {
        keep.push(pending);
        continue;
      }
      // Faction must enter the factory: its presence doctrine, contact behavior, and bark identity
      // are derived there and cannot be repaired by patching only spec.factionId afterward.
      const spec = makeEnemySpawnSpec(pending.typeId, pending.level, pending.pos, {
        factionId: pending.factionId || undefined,
        startedTick: state.tick,
      });
      spec.data = spec.data || {};
      const baseAI = spec.data.ai || {};
      spec.data.ai = {
        ...baseAI,
        squadId: pending.squadId,
        doctrine: pending.doctrine,
        preferredRole: 'attack',
        capabilities: mergeCapabilities(baseAI.capabilities, ['drive', 'sensor', 'weapon']),
        spawnContext: 'sg06_reinforcement',
        encounterId: `sg06:${pending.commandSeq}`,
        encounterKind: 'sg06_reinforcement',
        encounterRole: 'reinforcement',
        activity: normalizeActivity({
          kind: ActivityKind.ATTACK_RUN,
          reason: `sg06_reinforcement:${pending.packageId}`,
          anchor: pending.anchor,
          leashRadius: pending.leashRadius,
          startedTick: finiteInt(state.tick),
          encounterId: `sg06:${pending.commandSeq}`,
        }),
        roe: RulesOfEngagement.WEAPONS_FREE,
      };
      spec.data.reinforcements = null;
      spec.data.encounter = {
        owner: 'sg06',
        commandSeq: pending.commandSeq,
        packageId: pending.packageId,
      };
      let entity;
      try {
        entity = helper(spec);
      } catch (error) {
        if (budgeted && typeof budget.releaseSome === 'function') budget.releaseSome(pending.squadId, 1);
        throw error;
      }
      if (!entity || entity.id == null) {
        if (budgeted && typeof budget.releaseSome === 'function') budget.releaseSome(pending.squadId, 1);
        continue;
      }
      if (budgeted && typeof budget.bindEntity === 'function') {
        budget.bindEntity(entity.id, pending.squadId);
      }
      const record = {
        commandSeq: pending.commandSeq,
        packageId: pending.packageId,
        entityId: entity.id,
        typeId: pending.typeId,
        tick: finiteInt(state.tick),
        pos: { x: finite(pending.pos && pending.pos.x), z: finite(pending.pos && pending.pos.z) },
      };
      pushCapped(owner.spawned, record);
      emit(this.bus, 'ai:reinforcementSpawned', record);
    }
    owner.pendingReinforcements = keep;
  },

};

function ensureEncounterState(state) {
  if (!state.aiEncounter || typeof state.aiEncounter !== 'object' || Array.isArray(state.aiEncounter)) {
    state.aiEncounter = { schemaVersion: AI_CONTRACT_VERSION, nextSeq: 1, commands: [] };
  }
  if (state.aiEncounter.schemaVersion !== AI_CONTRACT_VERSION) state.aiEncounter.schemaVersion = AI_CONTRACT_VERSION;
  if (!Number.isInteger(state.aiEncounter.nextSeq) || state.aiEncounter.nextSeq < 1) state.aiEncounter.nextSeq = 1;
  if (!Array.isArray(state.aiEncounter.commands)) state.aiEncounter.commands = [];
  return state.aiEncounter;
}

function ensureOwnerState(state) {
  const encounter = ensureEncounterState(state);
  if (!encounter.owner || typeof encounter.owner !== 'object' || Array.isArray(encounter.owner)) {
    encounter.owner = {};
  }
  const owner = encounter.owner;
  owner.schemaVersion = AI_CONTRACT_VERSION;
  owner.lastAppliedSeq = Math.max(0, finiteInt(owner.lastAppliedSeq));
  owner.phase = String(owner.phase || 'respite');
  owner.pendingReinforcements = array(owner.pendingReinforcements);
  owner.scheduled = array(owner.scheduled);
  owner.spawned = array(owner.spawned);
  owner.rejectedCommands = array(owner.rejectedCommands);
  owner.phaseHistory = array(owner.phaseHistory);
  owner.retreatOrders = array(owner.retreatOrders);
  owner.narrativeBeats = array(owner.narrativeBeats);
  return owner;
}

function reinforcementPackage(packageId) {
  const id = packageId == null ? 'vael_wing_pair' : String(packageId);
  const pkg = REINFORCEMENT_PACKAGES[id];
  return pkg ? Object.freeze({ ...pkg, id }) : null;
}

function spawnAnchor(state) {
  const player = state && state.entities && state.entities.get ? state.entities.get(state.playerId) : null;
  if (player && player.pos) return { x: finite(player.pos.x), z: finite(player.pos.z) };
  return { x: 0, z: 0 };
}

function spawnPosition(anchor, state, command, pkg, index) {
  const seed = state && state.meta && state.meta.seed || 1;
  const a = unitHash(seed, command.seq, index, 'angle') * Math.PI * 2;
  const t = unitHash(seed, command.seq, index, 'radius');
  const radius = finite(pkg.radiusMin, 180) + (finite(pkg.radiusMax, 240) - finite(pkg.radiusMin, 180)) * t;
  return {
    x: anchor.x + Math.cos(a) * radius,
    z: anchor.z + Math.sin(a) * radius,
  };
}

function reject(owner, command, reason) {
  pushCapped(owner.rejectedCommands, {
    seq: command && command.seq == null ? null : command.seq,
    tick: command && command.tick == null ? null : command.tick,
    type: command && command.type == null ? null : String(command.type),
    reason,
  });
}

function pushCapped(list, value) {
  list.push(value);
  while (list.length > HISTORY_CAPACITY) list.shift();
}

function emit(bus, event, payload) {
  if (bus && typeof bus.emit === 'function') bus.emit(event, payload);
}

function unitHash(...args) {
  return hash32(...args) / 0xffffffff;
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function commandsOutOfOrder(commands) {
  for (let index = 1; index < commands.length; index++) {
    if (finiteInt(commands[index] && commands[index].seq) < finiteInt(commands[index - 1] && commands[index - 1].seq)) return true;
  }
  return false;
}

function mergeCapabilities(...lists) {
  const out = new Set();
  for (const list of lists) {
    for (const capability of Array.isArray(list) ? list : []) {
      if (typeof capability === 'string' && capability) out.add(capability);
    }
  }
  return [...out].sort();
}

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function finiteInt(value, fallback = 0) {
  return Number.isInteger(value) ? value : fallback;
}
