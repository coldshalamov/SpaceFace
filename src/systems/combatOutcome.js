// BP-02.1/C9 Kills-Less-Central Outcomes.
//
// Observer-only combat receipts. Records one terminal outcome per hostile and emits seams that
// future economy/rep systems can consume; it never writes credits, cargo, rep, AI, or combat state.
// Kill records retain only compact semantic causality; the richer presentation receipt remains
// transient and never enters GameState.
import { compactKillCausality, KillCause } from '../combat/killCausality.js';
import { isHostileToPlayer } from './scanner.js';
import { shouldRunOnTick } from '../core/activityScheduler.js';
import { indexedShipLikeScan, entityIndexVersion } from '../world/livingWorldViews.js';

/** Bench A/B: production default ON. Quiet latch skips the 4-tick shipLike flee-scan
 * when no unrecalled flee candidates remain. Wakes on kill/flee/disable/surrender /
 * spawn/destroy/save/sector/new-game / 0.5 s rescan. Soft-GPU fps not claimed.
 * Fresh registry.step residual (#163). */
let COMBAT_OUTCOME_QUIET_LATCH = true;
export function setCombatOutcomeQuietLatchForBench(enabled) {
  COMBAT_OUTCOME_QUIET_LATCH = enabled !== false;
}
export function getCombatOutcomeQuietLatchForBench() {
  return COMBAT_OUTCOME_QUIET_LATCH !== false;
}

/** Rescan while latched (0.5 s). Sim-time based so scripted tests that advance
 * simTime without matching tick cadence still re-evaluate forceFlee stamps. */
const COMBAT_OUTCOME_QUIET_RESCAN_S = 0.5;

function publishCombatOutcomeQuiet(state, latched) {
  if (!state) return;
  const rt = state.combatOutcomeRuntime || (state.combatOutcomeRuntime = {});
  rt.quietLatched = !!latched;
}

const STATE_VERSION = 2;
const MAX_OUTCOMES = 64;
const DISABLE_OUTCOME_SUBSYSTEMS = new Set([
  'subsystem_drive',
  'subsystem_weapon',
  'subsystem_tether_spool',
  'subsystem_power',
]);

function ensureState(state) {
  if (!state.combatOutcome || typeof state.combatOutcome !== 'object') {
    state.combatOutcome = { schemaVersion: STATE_VERSION, outcomes: [], byEntity: {} };
  }
  if (!Array.isArray(state.combatOutcome.outcomes)) state.combatOutcome.outcomes = [];
  if (!state.combatOutcome.byEntity || typeof state.combatOutcome.byEntity !== 'object') {
    state.combatOutcome.byEntity = {};
  }
  state.combatOutcome.schemaVersion = STATE_VERSION;
  return state.combatOutcome;
}

function playerTeam(state) {
  const player = state && state.entities && state.entities.get && state.entities.get(state.playerId);
  return player && player.team != null ? player.team : 0;
}

function entityFor(state, entityId) {
  return state && state.entities && state.entities.get ? state.entities.get(entityId) : null;
}

function isShipLike(entity, payload = null) {
  const type = (entity && entity.type) || (payload && payload.type);
  return type === 'ship' || type === 'drone';
}

function isCandidate(entity, state, payload = null) {
  const id = entity && entity.id != null ? entity.id : payload && payload.id;
  if (id == null || id === state.playerId) return false;
  if (!isShipLike(entity, payload)) return false;
  if (!entity) return !!(payload && payload.killerId === state.playerId);
  const team = playerTeam(state);
  const data = entity.data || {};
  const ai = data.ai || {};
  if (isHostileToPlayer(entity, team, state)) return true;
  if (ai.forceFlee || ai.fsm === 'flee' || ai.fsm === 'surrender') return true;
  if (Array.isArray(ai.hostileTeams) && ai.hostileTeams.includes(team)) return true;
  if (data.encounter) return true;
  return false;
}

function killedOutcomeText(label, destruction) {
  switch (destruction && destruction.cause) {
    case KillCause.TERRAIN_COLLISION: return `${label} smashed against terrain.`;
    case KillCause.SHIP_COLLISION: return `${label} destroyed in a collision.`;
    case KillCause.EXPLOSIVE: return `${label} detonated.`;
    case KillCause.KINETIC: return `${label} destroyed by weapons fire.`;
    default: return `${label} destroyed.`;
  }
}

function outcomeText(record) {
  const label = record.label || record.victimClass || 'target';
  switch (record.outcome) {
    case 'fled': return `${label} fled the fight.`;
    case 'disabled': return `${label} disabled; capture window open.`;
    case 'surrendered': return `${label} surrendered.`;
    case 'killed': return killedOutcomeText(label, record.destruction);
    default: return `${label} resolved.`;
  }
}

function compactRecord(state, entity, payload, outcome, reason) {
  const data = entity && entity.data || {};
  const id = entity && entity.id != null ? entity.id : payload && (payload.entityId || payload.id);
  return {
    schemaVersion: STATE_VERSION,
    entityId: id,
    outcome,
    reason: reason || outcome,
    tick: state.tick || 0,
    t: Number(state.simTime || 0),
    sectorId: state.world && state.world.currentSectorId || null,
    killerId: payload && payload.killerId != null ? payload.killerId : null,
    factionId: (entity && entity.factionId) || (payload && payload.factionId) || data.factionId || null,
    victimClass: (payload && payload.victimClass) || data.shipClass || data.class || (entity && entity.type) || null,
    label: data.name || data.shipName || data.callsign || data.callSign || (payload && payload.label) || null,
    bountyCr: Math.max(0, Math.round(Number((payload && payload.bountyCr) || data.bountyCr || 0) || 0)),
    sourceEvent: payload && payload.sourceEvent || null,
    destruction: outcome === 'killed' ? compactKillCausality(payload, state.playerId) : null,
  };
}

export const combatOutcome = {
  name: 'combatOutcome',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || {};
    this._combatOutcomeQuiet = null;
    this._combatOutcomeWakeSeq = 0;
    this._unsubs = [];
    ensureState(this.state);

    this._onKilled = (payload) => {
      this._wakeCombatOutcomeQuiet();
      this._killed(payload || {});
    };
    this._onFlee = (payload) => {
      this._wakeCombatOutcomeQuiet();
      this._flee(payload || {});
    };
    this._onDisabled = (payload) => {
      this._wakeCombatOutcomeQuiet();
      this._disabled(payload || {});
    };
    this._onSurrendered = (payload) => {
      this._wakeCombatOutcomeQuiet();
      this._surrendered(payload || {});
    };
    if (this.bus && typeof this.bus.on === 'function') {
      this.bus.on('entity:killed', this._onKilled);
      this.bus.on('ai:flee', this._onFlee);
      this.bus.on('combat:subsystemDisabled', this._onDisabled);
      this.bus.on('combat:surrendered', this._onSurrendered);
      this._unsubs = [
        this.bus.on('entity:spawned', () => this._wakeCombatOutcomeQuiet()),
        this.bus.on('entity:destroyed', () => this._wakeCombatOutcomeQuiet()),
        this.bus.on('save:loaded', () => this._wakeCombatOutcomeQuiet()),
        // Run boundary: byEntity dedup must not leak into the next game — entity ids recycle
        // (nextEntityId resets to 1), so stale dedup rows would silently drop new records.
        this.bus.on('game:new', () => {
          if (this.state) {
            this.state.combatOutcome = { schemaVersion: STATE_VERSION, outcomes: [], byEntity: {} };
          }
          this._wakeCombatOutcomeQuiet();
        }),
        this.bus.on('game:newGame', () => {
          if (this.state) {
            this.state.combatOutcome = { schemaVersion: STATE_VERSION, outcomes: [], byEntity: {} };
          }
          this._wakeCombatOutcomeQuiet();
        }),
        this.bus.on('sector:enter', () => this._wakeCombatOutcomeQuiet()),
        // Flee stamps that land without an ai:flee emit (doctrine/fsm churn, surrender
        // escape, pacing pin release, pirate parley/disengage) — wake so the next 4-tick
        // scan records them on the same cadence as before.
        this.bus.on('combat:damage', () => this._wakeCombatOutcomeQuiet()),
        this.bus.on('ai:stateChange', () => this._wakeCombatOutcomeQuiet()),
        this.bus.on('surrender:escaped', () => this._wakeCombatOutcomeQuiet()),
        this.bus.on('difficulty:pinReleased', () => this._wakeCombatOutcomeQuiet()),
        this.bus.on('pirateParley:started', () => this._wakeCombatOutcomeQuiet()),
        this.bus.on('pirateParley:resolved', () => this._wakeCombatOutcomeQuiet()),
        this.bus.on('pirateDisengage:triggered', () => this._wakeCombatOutcomeQuiet()),
      ].filter(Boolean);
    }
  },

  update(_dt, state) {
    // Quiet open flight: every 4 ticks still walked shipLike for forceFlee/fsm:flee
    // stamps even when no unrecalled flee candidates remained (event path already
    // covers ai:flee). Quiet latch short-circuits that scan; wakes on combat
    // outcome seams / spawn·destroy / save·sector·new-game / 0.5 s rescan.
    // Soft-GPU fps not claimed.
    if (COMBAT_OUTCOME_QUIET_LATCH !== false) {
      const quiet = this._combatOutcomeQuiet;
      if (quiet) {
        const membership = entityIndexVersion(state);
        const wakeSeq = this._combatOutcomeWakeSeq | 0;
        const nowS = Number(state && state.simTime) || 0;
        if (membership != null
          && quiet.membership === membership
          && quiet.wakeSeq === wakeSeq
          && (nowS - (Number(quiet.armedSimT) || 0)) < COMBAT_OUTCOME_QUIET_RESCAN_S) {
          publishCombatOutcomeQuiet(state, true);
          return;
        }
      }
    } else if (this._combatOutcomeQuiet) {
      this._combatOutcomeQuiet = null;
      publishCombatOutcomeQuiet(state, false);
    }

    if (state && state.ui && state.ui.docked === true) return;
    if (state && state.mode && state.mode !== 'flight') return;
    if (!shouldRunOnTick(state && state.tick, 'combatOutcome:scan', 4)) return;
    const own = ensureState(state);
    const list = indexedShipLikeScan(state);
    let recorded = 0;
    for (const entity of list) {
      if (!entity || !entity.alive || own.byEntity[entity.id]) continue;
      const ai = entity.data && entity.data.ai;
      if (ai && (ai.forceFlee || ai.fsm === 'flee') && isCandidate(entity, state)) {
        this._record(entity, { entityId: entity.id, sourceEvent: 'forceFlee' }, 'fled', ai.forceFlee ? 'forceFlee' : 'fsm:flee');
        recorded++;
      }
    }

    if (COMBAT_OUTCOME_QUIET_LATCH !== false) {
      const membership = entityIndexVersion(state);
      if (membership != null && recorded === 0) {
        this._combatOutcomeQuiet = {
          membership,
          armedSimT: Number(state.simTime) || 0,
          wakeSeq: this._combatOutcomeWakeSeq | 0,
        };
        publishCombatOutcomeQuiet(state, true);
      } else {
        this._combatOutcomeQuiet = null;
        publishCombatOutcomeQuiet(state, false);
      }
    }
  },

  _wakeCombatOutcomeQuiet() {
    this._combatOutcomeWakeSeq = (this._combatOutcomeWakeSeq | 0) + 1;
    this._combatOutcomeQuiet = null;
  },

  _killed(payload) {
    const entity = entityFor(this.state, payload.id);
    if (!isCandidate(entity, this.state, payload)) return;
    this._record(entity, { ...payload, sourceEvent: 'entity:killed' }, 'killed', 'entity:killed');
  },

  _flee(payload) {
    const entityId = payload.entityId != null ? payload.entityId : payload.id;
    const entity = entityFor(this.state, entityId);
    if (!entity || !isCandidate(entity, this.state, payload)) return;
    this._record(entity, { ...payload, entityId, sourceEvent: 'ai:flee' }, 'fled', 'ai:flee');
  },

  _disabled(payload) {
    // The combat kernel names the damaged combatant `targetId`; retain the older aliases for
    // authored/test emitters that predate that live event contract.
    const entityId = payload.targetId != null
      ? payload.targetId
      : payload.entityId != null ? payload.entityId : payload.id;
    const subsystemId = String(payload.subsystemId || '');
    if (!DISABLE_OUTCOME_SUBSYSTEMS.has(subsystemId)) return;
    const entity = entityFor(this.state, entityId);
    if (!entity || !isCandidate(entity, this.state, payload)) return;
    this._record(entity, { ...payload, entityId, sourceEvent: 'combat:subsystemDisabled' }, 'disabled', subsystemId);
  },

  _surrendered(payload) {
    const entityId = payload.entityId != null ? payload.entityId : payload.id;
    const entity = entityFor(this.state, entityId);
    if (!entity || !isCandidate(entity, this.state, payload)) return;
    this._record(entity, { ...payload, entityId, sourceEvent: 'combat:surrendered' }, 'surrendered', 'combat:surrendered');
  },

  _record(entity, payload, outcome, reason) {
    const state = this.state;
    const own = ensureState(state);
    const id = entity && entity.id != null ? entity.id : payload && (payload.entityId || payload.id);
    if (id == null || own.byEntity[id]) return null;
    const record = compactRecord(state, entity, payload, outcome, reason);
    own.byEntity[id] = record;
    own.outcomes.push(record);
    if (own.outcomes.length > MAX_OUTCOMES) own.outcomes.splice(0, own.outcomes.length - MAX_OUTCOMES);
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('combat:outcome', record);
      this.bus.emit('combat:outcomeConsequence', {
        entityId: record.entityId,
        outcome: record.outcome,
        reason: record.reason,
        factionId: record.factionId,
        sectorId: record.sectorId,
        t: record.t,
        destruction: record.destruction,
      });
    }
    this._speak(record);
    return record;
  },

  _speak(record) {
    const voice = this.helpers && this.helpers.voice;
    if (!voice || typeof voice.say !== 'function') return false;
    return voice.say({
      channel: 'info',
      kind: 'combat',
      id: `combatOutcome:${record.entityId}`,
      text: outcomeText(record),
      ttl: 2,
    });
  },

  destroy() {
    if (this.bus && typeof this.bus.off === 'function') {
      if (this._onKilled) this.bus.off('entity:killed', this._onKilled);
      if (this._onFlee) this.bus.off('ai:flee', this._onFlee);
      if (this._onDisabled) this.bus.off('combat:subsystemDisabled', this._onDisabled);
      if (this._onSurrendered) this.bus.off('combat:surrendered', this._onSurrendered);
    }
    for (const off of this._unsubs || []) {
      if (typeof off === 'function') off();
    }
    this._unsubs = [];
    this._combatOutcomeQuiet = null;
    this._combatOutcomeWakeSeq = 0;
    this._onKilled = this._onFlee = this._onDisabled = this._onSurrendered = null;
  },
};

export function combatOutcomeForEntity(state, entityId) {
  const own = ensureState(state);
  return own.byEntity[entityId] || null;
}

export default combatOutcome;
