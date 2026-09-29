import { AI_CONTRACT_VERSION, wrapAngle } from '../ai/contracts.js';
import { ActivityKind, RulesOfEngagement, normalizeActivity } from '../ai/doctrine.js';
import { hash32 } from '../core/rng.js';
import { makeEnemySpawnSpec } from './combat.js';
import { indexedShipLikeScan, entityIndexVersion } from '../world/livingWorldViews.js';
import { ENCOUNTER_COMMAND_RING_CAPACITY } from './aiPorts.js';


/** Bench A/B: production default ON. Quiet latch skips shipLike reinforcement-author
 * scans when no unrecalled reinforcement packages remain and no pending spawn/command
 * work is live. Soft-GPU fps not claimed. Fresh registry.step residual (#161). */
let AI_ENCOUNTER_QUIET_LATCH = true;
export function setAiEncounterQuietLatchForBench(enabled) {
  AI_ENCOUNTER_QUIET_LATCH = enabled !== false;
}
export function getAiEncounterQuietLatchForBench() {
  return AI_ENCOUNTER_QUIET_LATCH !== false;
}

/** Membership rescan while latched (0.5 s @ 60 Hz). */
const AI_ENCOUNTER_QUIET_RESCAN_TICKS = 30;

function publishAiEncounterQuiet(state, latched) {
  if (!state) return;
  const rt = state.aiEncounterRuntime || (state.aiEncounterRuntime = {});
  rt.quietLatched = !!latched;
}

const HISTORY_CAPACITY = 128;

/** SF-053: reinforcements arrive FROM somewhere — one ingress lane per squad, resolved against
 * live collision, the playable bound, and the pilot's escape pocket. A blocked candidate walks the
 * lane deterministically; a squad that still has no legal spot by its deadline cancels and returns
 * its reserved slots. */
const REINFORCEMENT_INGRESS = Object.freeze({
  fanSpreadRad: 0.75,        // members fan at most ±this around the lane bearing on the first try
  laneSpacingWu: 90,         // lateral member spacing across the lane
  radialStepWu: 140,         // a fully-blocked lane walks outward in this step
  playerClearanceWu: 420,    // never materialize inside the pilot's immediate escape pocket
  collisionMarginWu: 40,     // spawn point must clear a collidable's body by this margin
  collisionScanWu: 600,      // query radius wide enough to catch station-scale bodies
  boundsMarginWu: 90,        // land inside the playable soft radius by this margin
  escapeConeRad: 0.6,        // a running pilot's flee line — preferred off, never required
  escapeMinSpeedWu: 40,
  maxPlacementAttempts: 16,
  arrivalDeadlineTicks: 600, // a due squad that still cannot resolve a legal lane cancels
  approachSpeedWu: 130,      // arrivals enter already flying inbound along the lane
});
const INGRESS_ANGLE_STEPS = Object.freeze([0, 0.55, -0.55, 1.1, -1.1, 1.65, -1.65, Math.PI]);

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
    // Wing pair on a choreographed frame: the reinforcement arrives as a two-ship
    // pincer rather than two unrelated hunters.
    squadRecipe: 'pincer_sweep',
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
    squadRecipe: 'interceptor_scissors',
  }),
  reaver_swarm_screen: Object.freeze({
    typeId: 'wasp_swarmer',
    count: Object.freeze([1, 2]),
    level: 1,
    delayTicks: 90,
    radiusMin: 180,
    radiusMax: 300,
    doctrine: 'scavenger',
    factionId: 'faction_reach',
    squadPrefix: 'sg06_reaver_screen',
    cohortRecipe: 'fodder_crescent',
  }),
  iron_maw_screen: Object.freeze({
    typeId: 'wasp_swarmer',
    count: Object.freeze([2, 4]),
    level: 10,
    delayTicks: 90,
    radiusMin: 180,
    radiusMax: 300,
    doctrine: 'scavenger',
    factionId: 'faction_vael',
    squadPrefix: 'iron_maw_screen',
    cohortRecipe: 'fodder_crescent',
  }),
});

export const aiEncounter = {
  name: 'aiEncounter',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || (ctx.helpers = {});
    this._aiEncounterQuiet = null;
    this._aiEncounterWakeSeq = 0;
    this._unsubs = [];
    ensureOwnerState(this.state);
    this.helpers.inspectAIEncounter = () => this.inspect();
    if (this.bus && typeof this.bus.on === 'function') {
      this._unsubs = [
        this.bus.on('entity:spawned', () => this._wakeAiEncounterQuiet()),
        this.bus.on('entity:destroyed', () => this._wakeAiEncounterQuiet()),
        this.bus.on('combat:damage', () => this._wakeAiEncounterQuiet()),
        this.bus.on('save:loaded', () => this._wakeAiEncounterQuiet()),
        this.bus.on('sector:enter', () => this._wakeAiEncounterQuiet()),
        this.bus.on('game:new', () => this._wakeAiEncounterQuiet()),
      ].filter(Boolean);
    }
  },

  update(_dt, state) {
    // Quiet open flight: every tick walked shipLike for authored reinforcement callers even
    // when no unrecalled packages existed and no pending spawn/command work was live.
    // Quiet latch short-circuits that scan (and ensure*); wakes on membership,
    // combat/spawn/save/sector, command/pending churn, or 0.5 s rescan. Soft-GPU fps not claimed.
    if (AI_ENCOUNTER_QUIET_LATCH !== false) {
      const quiet = this._aiEncounterQuiet;
      if (quiet) {
        const membership = entityIndexVersion(state);
        const tick = state.tick | 0;
        const wakeSeq = this._aiEncounterWakeSeq | 0;
        const enc = state.aiEncounter;
        const owner = enc && enc.owner;
        const cmdLen = enc && Array.isArray(enc.commands) ? enc.commands.length : 0;
        const pendingLen = owner && Array.isArray(owner.pendingReinforcements)
          ? owner.pendingReinforcements.length : 0;
        const nextSeq = enc ? (enc.nextSeq | 0) : 0;
        const lastApplied = owner ? (owner.lastAppliedSeq | 0) : 0;
        if (membership != null
          && quiet.membership === membership
          && quiet.wakeSeq === wakeSeq
          && quiet.cmdLen === cmdLen
          && quiet.pendingLen === pendingLen
          && quiet.nextSeq === nextSeq
          && quiet.lastApplied === lastApplied
          && pendingLen === 0
          && lastApplied >= (nextSeq - 1)
          && ((tick - (quiet.armedTick | 0)) < AI_ENCOUNTER_QUIET_RESCAN_TICKS)) {
          publishAiEncounterQuiet(state, true);
          return;
        }
      }
    } else if (this._aiEncounterQuiet) {
      this._aiEncounterQuiet = null;
    }

    const encounter = ensureEncounterState(state);
    const owner = ensureOwnerState(state);

    this._queueAuthoredReinforcements(encounter, state);
    const commands = Array.isArray(encounter.commands) ? encounter.commands : [];
    if (commandsOutOfOrder(commands)) commands.sort((a, b) => finiteInt(a && a.seq) - finiteInt(b && b.seq));
    for (const command of commands) {
      const seq = finiteInt(command && command.seq);
      if (seq <= owner.lastAppliedSeq) continue;
      this._applyCommand(command, owner, state);
      owner.lastAppliedSeq = Math.max(owner.lastAppliedSeq, seq);
    }
    this._spawnDue(owner, state);

    if (AI_ENCOUNTER_QUIET_LATCH !== false) {
      const membership = entityIndexVersion(state);
      const census = this._censusAiEncounterWork(state, encounter, owner);
      if (membership != null && !census.busy) {
        this._aiEncounterQuiet = {
          membership,
          armedTick: state.tick | 0,
          wakeSeq: this._aiEncounterWakeSeq | 0,
          cmdLen: census.cmdLen,
          pendingLen: census.pendingLen,
          nextSeq: census.nextSeq,
          lastApplied: census.lastApplied,
        };
        publishAiEncounterQuiet(state, true);
      } else {
        this._aiEncounterQuiet = null;
        publishAiEncounterQuiet(state, false);
      }
    }
  },

  _wakeAiEncounterQuiet() {
    this._aiEncounterWakeSeq = (this._aiEncounterWakeSeq | 0) + 1;
    this._aiEncounterQuiet = null;
  },

  /** Count unrecalled reinforcement authors + pending spawn/command work. */
  _censusAiEncounterWork(state, encounter, owner) {
    let authors = 0;
    for (const entity of indexedShipLikeScan(state)) {
      if (!entity || entity.alive === false || entity.type !== 'ship') continue;
      const data = entity.data;
      const authored = data && data.reinforcements;
      if (!authored || !authored.packageId) continue;
      const ai = data.ai;
      if (ai && ai._calledReinforcements === true) continue;
      authors++;
    }
    const cmdLen = Array.isArray(encounter.commands) ? encounter.commands.length : 0;
    const pendingLen = Array.isArray(owner.pendingReinforcements) ? owner.pendingReinforcements.length : 0;
    const nextSeq = encounter.nextSeq | 0;
    const lastApplied = owner.lastAppliedSeq | 0;
    const unapplied = nextSeq - 1 > lastApplied;
    return {
      authors,
      cmdLen,
      pendingLen,
      nextSeq,
      lastApplied,
      busy: authors > 0 || pendingLen > 0 || unapplied,
    };
  },

  inspect() {
    const owner = ensureOwnerState(this.state);
    return Object.freeze({
      schemaVersion: AI_CONTRACT_VERSION,
      phase: owner.phase,
      lastAppliedSeq: owner.lastAppliedSeq,
      pendingReinforcements: owner.pendingReinforcements.length,
      spawned: owner.spawned.length,
      cancelled: owner.cancelled.length,
      rejectedCommands: owner.rejectedCommands.length,
    });
  },

  /** Live facts the ingress resolver needs: player pose, playable bound, collidable oracle. */
  _ingressCtx(state) {
    const ctx = this._ingressScratch || (this._ingressScratch = { scratch: [] });
    const player = state && state.entities && typeof state.entities.get === 'function'
      ? state.entities.get(state.playerId) : null;
    ctx.playerPos = player && player.alive !== false && player.pos ? player.pos : null;
    ctx.playerVel = player && player.vel ? player.vel : null;
    ctx.bounds = state && state.bounds && Number.isFinite(state.bounds.radius) ? state.bounds : null;
    ctx.queryRadius = typeof (this.helpers && this.helpers.queryRadius) === 'function'
      ? this.helpers.queryRadius : null;
    return ctx;
  },

  /** Re-validate the recorded spot, else walk the lane again against the world as it is NOW. */
  _resolvePendingSpot(ctx, pending, state) {
    if (pending.pos && ingressSpotLegal(ctx, pending.pos)) return pending.pos;
    const seed = state && state.meta && state.meta.seed || 1;
    const pkg = reinforcementPackage(pending.packageId);
    return resolveIngressPosition(
      ctx,
      pending.anchor && Number.isFinite(pending.anchor.x) ? pending.anchor : spawnAnchor(state, null),
      Number.isFinite(pending.ingressBearing) ? pending.ingressBearing
        : unitHash(seed, pending.commandSeq, 'ingress') * Math.PI * 2,
      pkg || {},
      finiteInt(pending.memberIndex),
      Math.max(1, finiteInt(pending.memberCount, 1)),
      seed,
      pending.commandSeq,
    );
  },

  newGame() {
    this._aiEncounterQuiet = null;
    this._aiEncounterWakeSeq = 0;
    this.state.aiEncounter = { schemaVersion: AI_CONTRACT_VERSION, nextSeq: 1, commands: [] };
    ensureOwnerState(this.state);
    publishAiEncounterQuiet(this.state, false);
  },

  _queueAuthoredReinforcements(encounter, state) {
    for (const entity of indexedShipLikeScan(state)) {
      if (!entity || entity.alive === false || entity.type !== 'ship') continue;
      const data = entity.data || {};
      const ai = data.ai || (data.ai = {});
      const authored = data.reinforcements;
      if (!authored || !authored.packageId || ai._calledReinforcements === true) continue;
      if (!(entity.hullMax > 0) || entity.hull / entity.hullMax >= finite(authored.hullThreshold, 0.3)) continue;
      // SF-053: never announce a call whose squad cannot be reserved — the caller holds its
      // latch and retries when a slot frees, so the banner only runs when help can actually come.
      // The survival-run refusal mirrors spawnBudget.request's own gate: a Crucible round owns
      // its combat population and a caller there can never field a squad.
      const budget = this.helpers && this.helpers.spawnBudget;
      if (budget && typeof budget.available === 'function' && budget.available() < 1) continue;
      if (state.run && state.run.kind === 'survival' && state.run.phase !== 'inactive') continue;
      // And never burn the once-ever latch on a package the owner cannot resolve — a bad
      // authored id would announce once and then stay silent forever.
      if (!reinforcementPackage(authored.packageId)) continue;
      const seq = encounter.nextSeq++;
      const command = Object.freeze({
        version: AI_CONTRACT_VERSION,
        seq,
        tick: finiteInt(state.tick),
        type: 'request_reinforcement',
        packageId: String(authored.packageId),
        budgetRemaining: this.helpers.spawnBudget && typeof this.helpers.spawnBudget.available === 'function'
          ? this.helpers.spawnBudget.available() : 0,
        callerId: entity.id,
        anchor: Object.freeze({ x: finite(entity.pos && entity.pos.x), z: finite(entity.pos && entity.pos.z) }),
      });
      encounter.commands.push(command);
      // Authored pushes share the ports-side ring invariant: this list is walked every tick,
      // so it must stay bounded no matter which producer grows it.
      if (encounter.commands.length > ENCOUNTER_COMMAND_RING_CAPACITY) {
        encounter.commands.splice(0, encounter.commands.length - ENCOUNTER_COMMAND_RING_CAPACITY);
      }
      ai._calledReinforcements = true;
      emit(this.bus, 'ai:encounterCommand', command);
      emit(this.bus, 'alert', {
        key: 'reinforcements', sev: 'danger',
        text: `${data.name || 'ENEMY CAPITAL'} CALLING REINFORCEMENTS`, ttl: 3,
      });
      emit(this.bus, 'toast', { text: 'Hostile screen ships inbound!', kind: 'danger', ttl: 3 });
      emit(this.bus, 'audio:cue', { id: 'ui_alert' });
    }
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
    const anchor = spawnAnchor(state, command);
    const count = reinforcementCount(pkg, state, command);
    const dueTick = Math.max(finiteInt(state.tick) + 1, finiteInt(state.tick) + finiteInt(pkg.delayTicks, 1));
    const squadId = `${pkg.squadPrefix}_${String(command.seq).padStart(4, '0')}`;
    // SF-053: reserve the squad's slots when the promise is made, not when it lands. A partial
    // grant reserves that many members; the rest stay queued unreserved and admit one-per-freed-
    // slot at materialization (the shared-capacity contract) — never silently dropped, never
    // spawned past the cap.
    const budget = this.helpers && this.helpers.spawnBudget;
    const budgeted = !!(budget && typeof budget.request === 'function');
    const granted = budgeted
      ? Math.min(count, Math.max(0, finiteInt(budget.request(count, squadId))))
      : count;
    const seed = state && state.meta && state.meta.seed || 1;
    const ingressBearing = unitHash(seed, command.seq, 'ingress') * Math.PI * 2;
    const sectorId = state && state.world ? (state.world.currentSectorId || null) : null;
    const ctx = this._ingressCtx(state);
    for (let index = 0; index < count; index++) {
      const pos = resolveIngressPosition(ctx, anchor, ingressBearing, pkg, index, count, seed, command.seq);
      owner.pendingReinforcements.push({
        id: `reinforcement_${command.seq}_${index}`,
        commandSeq: command.seq,
        packageId: pkg.id,
        typeId: pkg.typeId,
        level: pkg.level,
        dueTick,
        deadlineTick: dueTick + REINFORCEMENT_INGRESS.arrivalDeadlineTicks,
        pos,
        anchor,
        sectorId,
        ingressBearing,
        memberIndex: index,
        memberCount: count,
        reservedBudget: budgeted && index < granted,
        leashRadius: finite(pkg.leashRadius, 2600),
        doctrine: pkg.doctrine,
        factionId: pkg.factionId,
        squadId,
        cohortRecipe: pkg.cohortRecipe || null,
        squadRecipe: pkg.squadRecipe || null,
        callerId: command.callerId == null ? null : command.callerId,
      });
    }
    pushCapped(owner.scheduled, {
      seq: command.seq,
      tick: command.tick,
      packageId: pkg.id,
      count,
      reserved: granted,
      dueTick,
      budgetRemaining: Math.max(0, finiteInt(command.budgetRemaining)),
      callerId: command.callerId == null ? null : command.callerId,
    });
    emit(this.bus, 'ai:reinforcementScheduled', {
      seq: command.seq,
      tick: command.tick,
      packageId: pkg.id,
      count,
      reserved: granted,
      dueTick,
      anchor: Object.freeze({ x: anchor.x, z: anchor.z }),
      ingressBearing,
      entityId: command.callerId == null ? null : command.callerId,
      callerId: command.callerId == null ? null : command.callerId,
    });
    // A director-paced call has no caller hull to bark — announce the approach itself so the
    // squad reads as an inbound lane, not a pop-in.
    if (command.callerId == null) {
      emit(this.bus, 'alert', {
        key: `reinforcements_inbound_${command.seq}`, sev: 'warn',
        text: 'HOSTILE REINFORCEMENTS INBOUND', ttl: 2.5,
      });
      emit(this.bus, 'toast', { text: 'Hostile reinforcements inbound!', kind: 'warn', ttl: 2.5 });
    }
  },

  _spawnDue(owner, state) {
    if (typeof (this.helpers && this.helpers.spawnEntity) !== 'function') return;
    const ctx = this._ingressCtx(state);
    const keep = [];
    // Commit the survivors even when a spawn throws: without the finally a thrown helper leaves
    // already-spawned members in the pending array, so the next tick re-spawns duplicates and
    // leaks their budget grants.
    try {
      for (const pending of owner.pendingReinforcements) {
        try {
          this._materializePending(ctx, owner, pending, keep, state);
        } catch (error) {
          // A failed member must not abort the tick or leak the pending tail: release this
          // member's slot on the record and keep walking the rest of the queue.
          cancelReinforcement(this.helpers, owner, pending, 'spawn_threw', state, this.bus);
        }
      }
    } finally {
      owner.pendingReinforcements = keep;
    }
  },

  _materializePending(ctx, owner, pending, keep, state) {
    const helper = this.helpers && this.helpers.spawnEntity;
    const budget = this.helpers && this.helpers.spawnBudget;
    const budgeted = !!(budget && typeof budget.request === 'function');
    // The call was made against a sector the world has since left. Continuous corridor
    // handoffs keep the corridor bound so the lane stays legal; a real departure abandons
    // the squad — its reserved slots return and the cancellation is on the record. Checked
    // before the due gate: a departed squad is not "inbound" anywhere, and the director
    // reads pendingReinforcements as committed threat.
    if (reinforcementAbandoned(pending, state)) {
      cancelReinforcement(this.helpers, owner, pending, 'sector_departure', state, this.bus);
      return;
    }
    if (finiteInt(pending.dueTick) > finiteInt(state.tick)) {
      keep.push(pending);
      return;
    }
    const spot = this._resolvePendingSpot(ctx, pending, state);
    if (!spot) {
      if (finiteInt(state.tick) >= finiteInt(pending.deadlineTick, finiteInt(pending.dueTick))) {
        cancelReinforcement(this.helpers, owner, pending, 'placement_unreachable', state, this.bus);
        return;
      }
      keep.push(pending);
      return;
    }
    pending.pos = spot;
    // Fallback for pending records written without a schedule-time reservation (a budget-less
    // fixture or a future producer): claim the slot at materialization, same as always. The
    // claim must mark the record reserved — an unflagged slot would leak through
    // cancelReinforcement's release gate if the spawn then fails.
    if (budgeted && pending.reservedBudget !== true) {
      if (budget.request(1, pending.squadId) <= 0) {
        if (finiteInt(state.tick) >= finiteInt(pending.deadlineTick, finiteInt(pending.dueTick))) {
          cancelReinforcement(this.helpers, owner, pending, 'budget_unavailable', state, this.bus);
          return;
        }
        keep.push(pending);
        return;
      }
      pending.reservedBudget = true;
    }
    // Faction must enter the factory: its presence doctrine, contact behavior, and bark identity
    // are derived there and cannot be repaired by patching only spec.factionId afterward.
    const spec = makeEnemySpawnSpec(pending.typeId, pending.level, pending.pos, {
      factionId: pending.factionId || undefined,
      startedTick: state.tick,
    });
    // SF-053: arrive THROUGH the lane — nose and velocity already carry the squad inbound
    // toward the anchor, so the approach reads as a flight-in instead of a materialization.
    const inward = unitTowardAnchor(pending.pos, pending.anchor);
    spec.rot = wrapAngle(Math.atan2(inward.z, inward.x));
    spec.vel = {
      x: inward.x * REINFORCEMENT_INGRESS.approachSpeedWu,
      z: inward.z * REINFORCEMENT_INGRESS.approachSpeedWu,
    };
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
      cohortRecipe: pending.cohortRecipe || undefined,
      squadRecipe: pending.squadRecipe || undefined,
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
      callerId: pending.callerId == null ? null : pending.callerId,
    };
    const entity = helper(spec);
    if (!entity || entity.id == null) {
      cancelReinforcement(this.helpers, owner, pending, 'spawn_refused', state, this.bus);
      return;
    }
    if (budgeted && typeof budget.bindEntity === 'function') {
      budget.bindEntity(entity.id, pending.squadId);
    }
    // Persisted proof the call produced arrivals: the caller's latch survives saves while the
    // pending queue is transient, so load reconciliation needs this to tell "squad arrived"
    // from "squad lost to the rebuild" (caller re-calls then).
    const caller = pending.callerId == null || !state.entities || typeof state.entities.get !== 'function'
      ? null : state.entities.get(pending.callerId);
    if (caller && caller.data) {
      caller.data.ai = caller.data.ai || {};
      caller.data.ai._reinforcementsDelivered = true;
    }
    const record = {
      commandSeq: pending.commandSeq,
      packageId: pending.packageId,
      entityId: entity.id,
      typeId: pending.typeId,
      tick: finiteInt(state.tick),
      pos: { x: finite(pending.pos && pending.pos.x), z: finite(pending.pos && pending.pos.z) },
    };
    const firstOfSquad = !owner.spawned.some((r) => r.commandSeq === pending.commandSeq);
    pushCapped(owner.spawned, record);
    emit(this.bus, 'ai:reinforcementSpawned', record);
    if (firstOfSquad) {
      emit(this.bus, 'alert', {
        key: `reinforcements_arrived_${pending.commandSeq}`,
        sev: 'warn',
        text: 'REINFORCEMENTS ON FIELD',
        ttl: 2.5,
      });
      emit(this.bus, 'toast', { text: 'Reinforcements have arrived.', kind: 'warn', ttl: 2.5 });
    }
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
  owner.cancelled = array(owner.cancelled);
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

function spawnAnchor(state, command = null) {
  const authored = command && command.anchor;
  if (authored && Number.isFinite(authored.x) && Number.isFinite(authored.z)) {
    return { x: authored.x, z: authored.z };
  }
  const player = state && state.entities && state.entities.get ? state.entities.get(state.playerId) : null;
  if (player && player.pos) return { x: finite(player.pos.x), z: finite(player.pos.z) };
  return { x: 0, z: 0 };
}

function reinforcementCount(pkg, state, command) {
  if (!Array.isArray(pkg.count)) return Math.max(0, finiteInt(pkg.count));
  const min = Math.max(0, finiteInt(pkg.count[0]));
  const max = Math.max(min, finiteInt(pkg.count[1], min));
  const roll = unitHash(state && state.meta && state.meta.seed || 1, command.seq, command.callerId, 'count');
  return Math.min(max, min + Math.floor(roll * (max - min + 1)));
}

/**
 * Resolve one member's spawn point on the squad's ingress lane. Members fan inside
 * ±fanSpreadRad around the bearing and spread laneSpacingWu across it, so the wing arrives
 * from a readable direction instead of popping onto a ring. Candidates are walked through a
 * fixed angle/radius retry table; the first pass also prefers spots off a running pilot's
 * flee line (a preference — the hard gates are bounds, collision, and the clearance floor).
 */
function resolveIngressPosition(ctx, anchor, bearing, pkg, index, count, seed, seq) {
  const cfg = REINFORCEMENT_INGRESS;
  const t = unitHash(seed, seq, index, 'radius');
  const radiusMin = finite(pkg && pkg.radiusMin, 180);
  let baseRadius = radiusMin + (finite(pkg && pkg.radiusMax, 240) - radiusMin) * t;
  const fan = (unitHash(seed, seq, index, 'fan') * 2 - 1) * (count > 1 ? cfg.fanSpreadRad : 0);
  const lateral = (index - (count - 1) / 2) * cfg.laneSpacingWu;
  // An anchor inside the pilot's pocket (director calls anchor on the pilot) leaves no authored
  // ring point on the lane's far side legal — widen the ring just enough that far-side angles
  // clear the floor. The legality gate still verifies every candidate; this only stops a
  // hopeless authored band from walking the whole retry table.
  const playerPos = ctx && ctx.playerPos;
  if (playerPos) {
    const anchorDist = Math.hypot(anchor.x - finite(playerPos.x), anchor.z - finite(playerPos.z));
    if (anchorDist < cfg.playerClearanceWu) {
      baseRadius = Math.max(baseRadius,
        cfg.playerClearanceWu - anchorDist + Math.abs(lateral) + 60);
    }
  }
  const perpX = -Math.sin(bearing);
  const perpZ = Math.cos(bearing);
  for (let pass = 0; pass < 2; pass++) {
    for (let attempt = 0; attempt < cfg.maxPlacementAttempts; attempt++) {
      const angle = bearing + fan + INGRESS_ANGLE_STEPS[attempt % INGRESS_ANGLE_STEPS.length];
      const radius = baseRadius + Math.floor(attempt / INGRESS_ANGLE_STEPS.length) * cfg.radialStepWu;
      const pos = {
        x: anchor.x + Math.cos(angle) * radius + perpX * lateral,
        z: anchor.z + Math.sin(angle) * radius + perpZ * lateral,
      };
      if (pass === 0 && inEscapeCone(ctx, pos)) continue;
      if (ingressSpotLegal(ctx, pos)) return pos;
    }
  }
  return null;
}

/** Hard placement gates: inside the playable bound, out of the pilot's pocket, no collision. */
function ingressSpotLegal(ctx, pos) {
  if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return false;
  const cfg = REINFORCEMENT_INGRESS;
  const bounds = ctx && ctx.bounds;
  if (bounds) {
    const c = bounds.center || { x: 0, z: 0 };
    const limit = Math.max(0, finite(bounds.radius) - cfg.boundsMarginWu);
    const dx = pos.x - finite(c.x);
    const dz = pos.z - finite(c.z);
    if (dx * dx + dz * dz > limit * limit) return false;
  }
  const playerPos = ctx && ctx.playerPos;
  if (playerPos) {
    const dx = pos.x - finite(playerPos.x);
    const dz = pos.z - finite(playerPos.z);
    if (dx * dx + dz * dz < cfg.playerClearanceWu * cfg.playerClearanceWu) return false;
  }
  const query = ctx && ctx.queryRadius;
  if (query) {
    const scratch = ctx.scratch || [];
    query(pos, cfg.collisionScanWu, scratch);
    for (const entity of scratch) {
      if (!entity || entity.alive === false || entity.collides === false || !entity.pos) continue;
      // Stations/gates carry a compound collision proxy whose spars outrun `radius`; their
      // authored physical extent is dockRadius. Clear the real footprint, not the core scalar.
      const footprint = Math.max(finite(entity.radius, 0),
        finite(entity.data && entity.data.dockRadius));
      const need = footprint + cfg.collisionMarginWu;
      const dx = entity.pos.x - pos.x;
      const dz = entity.pos.z - pos.z;
      if (dx * dx + dz * dz < need * need) return false;
    }
    scratch.length = 0;
  }
  return true;
}

/** Soft preference: a running pilot's flee line is the last place an arrival should cut off. */
function inEscapeCone(ctx, pos) {
  const playerPos = ctx && ctx.playerPos;
  const playerVel = ctx && ctx.playerVel;
  if (!playerPos || !playerVel) return false;
  const speed = Math.hypot(finite(playerVel.x), finite(playerVel.z));
  if (speed < REINFORCEMENT_INGRESS.escapeMinSpeedWu) return false;
  const dx = pos.x - finite(playerPos.x);
  const dz = pos.z - finite(playerPos.z);
  const d = Math.hypot(dx, dz);
  if (d < 1e-6) return true;
  return (dx * playerVel.x + dz * playerVel.z) / (d * speed)
    > Math.cos(REINFORCEMENT_INGRESS.escapeConeRad);
}

/**
 * The call is abandoned when the squad would now land in a world the pilot is no longer in.
 * Continuous corridor handoffs keep the shared corridor bound — the lane stays legal — while
 * a real departure puts the anchor outside the playable bound and cancels the squad.
 */
function reinforcementAbandoned(pending, state) {
  const currentSector = state && state.world ? state.world.currentSectorId || null : null;
  if (pending.sectorId == null || currentSector == null || pending.sectorId === currentSector) return false;
  const bounds = state && state.bounds;
  if (!bounds || !Number.isFinite(bounds.hardRadius)) return true;
  const c = bounds.center || { x: 0, z: 0 };
  const dx = finite(pending.anchor && pending.anchor.x) - finite(c.x);
  const dz = finite(pending.anchor && pending.anchor.z) - finite(c.z);
  return dx * dx + dz * dz > bounds.hardRadius * bounds.hardRadius;
}

function cancelReinforcement(helpers, owner, pending, reason, state, bus) {
  if (pending.reservedBudget === true) {
    const budget = helpers && helpers.spawnBudget;
    if (budget && typeof budget.releaseSome === 'function') budget.releaseSome(pending.squadId, 1);
  }
  pushCapped(owner.cancelled, {
    commandSeq: pending.commandSeq,
    packageId: pending.packageId,
    tick: finiteInt(state && state.tick),
    reason: String(reason),
  });
  emit(bus, 'ai:reinforcementCancelled', {
    seq: pending.commandSeq,
    tick: finiteInt(state && state.tick),
    packageId: pending.packageId,
    reason: String(reason),
    callerId: pending.callerId == null ? null : pending.callerId,
  });
}

/** Unit vector from the spawn spot toward the anchor — the direction the arrival flies in. */
function unitTowardAnchor(pos, anchor) {
  const dx = finite(anchor && anchor.x) - finite(pos && pos.x);
  const dz = finite(anchor && anchor.z) - finite(pos && pos.z);
  const d = Math.hypot(dx, dz);
  return d > 1e-6 ? { x: dx / d, z: dz / d } : { x: 1, z: 0 };
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
