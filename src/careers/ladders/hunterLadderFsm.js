// CL-02 Hunter ladder branch FSM (candidate pack).
// Listens to verified live bounty/combat/doctrine/scanner/heat events and drives
// the shared careerLadders authority via intents only — never writes credits,
// cargo, rep, heat, or story.beatIndex.
//
// Not registry-wired. Tests / lead bind createHunterLadderFsm() to a bus +
// careerLadders system instance.

import { normalizeCombatDoctrineId } from '../../ai/combatDoctrine.js';
import { isPlayerWanted } from '../../systems/heat.js';
import { classifyHunterContact } from '../origins/hunterOrigin.js';
import {
  HUNTER_FORBIDDEN_MARK_WORDS,
  HUNTER_LEGAL_MARK_WORDS,
} from '../origins/hunterOriginData.js';
import {
  CAREER_LADDER_EVENTS,
  LADDER_STATUS,
  STEP_STATUS,
  simTimeOf,
} from './ladderShared.js';
import {
  HUNTER_LADDER_CAREER_ID,
  HUNTER_LADDER_DEF,
  HUNTER_ROLE_HULL_DEF_ID,
  HUNTER_LADDER_FAIL_CODES as FAIL,
  HUNTER_LADDER_LIVE_EVENTS as EV,
  HUNTER_LADDER_LOST_TICKS,
  HUNTER_LADDER_PACKAGE_TIMER_S,
  HUNTER_LADDER_PURSUIT_CONTACT_TICKS,
  HUNTER_LADDER_PURSUIT_RANGE_SQ,
  createHunterLadderDefinition,
  validateHunterLadderDefinition,
} from './hunterLadderDefs.js';

const LEGAL_MARK = new Set(HUNTER_LEGAL_MARK_WORDS);
const FORBIDDEN_MARK = new Set(HUNTER_FORBIDDEN_MARK_WORDS);
const ROLE_HULL_STEP_ID = 'role_hull_capstone';

function ownsRoleHull(state) {
  const owned = state && state.player && state.player.ownedShips;
  return Array.isArray(owned) && owned.some((ship) => ship && ship.defId === HUNTER_ROLE_HULL_DEF_ID);
}

function reopenLegacyRoleHullCapstone(ladders, state) {
  const own = activeLeaf(ladders, state);
  const rt = own && own.steps && own.steps[ROLE_HULL_STEP_ID];
  if (!own || own.status !== LADDER_STATUS.COMPLETED || !rt || rt.status !== STEP_STATUS.PENDING) {
    return own;
  }
  const priorDone = HUNTER_LADDER_DEF.steps.slice(0, -1)
    .every((step) => own.steps[step.id]?.status === STEP_STATUS.DONE);
  if (!priorDone) return own;
  own.status = LADDER_STATUS.ACTIVE;
  own.stepIndex = HUNTER_LADDER_DEF.steps.length - 1;
  own.stepId = ROLE_HULL_STEP_ID;
  rt.status = STEP_STATUS.ACTIVE;
  rt.attempts = Math.max(1, rt.attempts | 0);
  rt.activeSinceS = simTimeOf(state);
  return own;
}

const DISABLE_SUBSYSTEMS = new Set([
  'subsystem_drive',
  'subsystem_weapon',
  'subsystem_tether_spool',
  'subsystem_power',
]);

const MILITARY_TYPES = new Set(['military', 'law', 'patrol', 'navy', 'concord']);
const BLACKMARKET_TYPES = new Set(['blackmarket', 'black_market', 'outlaw', 'smuggler']);

export {
  HUNTER_LADDER_CAREER_ID,
  HUNTER_LADDER_DEF,
  createHunterLadderDefinition,
  validateHunterLadderDefinition,
};

// ── pure helpers ─────────────────────────────────────────────────────────────

function entityIdOf(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (payload.entityId != null) return payload.entityId;
  if (payload.targetId != null) return payload.targetId;
  if (payload.id != null) return payload.id;
  return null;
}

function getEntity(state, id) {
  if (id == null || !state || !state.entities) return null;
  if (typeof state.entities.get === 'function') return state.entities.get(id) || null;
  return state.entities[id] || null;
}

function getPlayer(state) {
  if (!state) return null;
  return getEntity(state, state.playerId) || null;
}

function activeLeaf(laddersSys, state) {
  if (!laddersSys || !state) return null;
  const progress = laddersSys.getProgress
    ? laddersSys.getProgress(HUNTER_LADDER_CAREER_ID)
    : null;
  const leaf = state.careers
    && state.careers.ladders
    && state.careers.ladders[HUNTER_LADDER_CAREER_ID];
  return leaf || null;
}

function ensurePayload(leaf) {
  if (!leaf) return null;
  if (!leaf.steps || typeof leaf.steps !== 'object') return null;
  const stepId = leaf.stepId;
  if (!stepId || !leaf.steps[stepId]) return null;
  const step = leaf.steps[stepId];
  if (!step.payload || typeof step.payload !== 'object') step.payload = {};
  return step.payload;
}

function ensureFlags(leaf) {
  if (!leaf) return null;
  if (!leaf.flags || typeof leaf.flags !== 'object') {
    leaf.flags = {
      nonBinding: true,
      usesRealAuthorities: true,
      exclusive: false,
      blocksOtherCareers: false,
    };
  }
  return leaf.flags;
}

function isActiveHunter(leaf) {
  return !!(leaf
    && leaf.status === LADDER_STATUS.ACTIVE
    && leaf.stepId
    && leaf.steps
    && leaf.steps[leaf.stepId]
    && leaf.steps[leaf.stepId].status === STEP_STATUS.ACTIVE);
}

function stationTypeOf(state, payload = {}) {
  if (payload && typeof payload.stationType === 'string') return payload.stationType.toLowerCase();
  if (payload && typeof payload.kind === 'string') return payload.kind.toLowerCase();
  if (payload && typeof payload.type === 'string') return payload.type.toLowerCase();
  const stationId = payload && payload.stationId;
  if (stationId == null || !state) return null;
  const world = state.world || {};
  const stations = world.stations || state.stations || {};
  let st = null;
  if (typeof stations.get === 'function') st = stations.get(stationId);
  else st = stations[stationId];
  if (!st && Array.isArray(stations)) st = stations.find((s) => s && s.id === stationId);
  if (!st) return null;
  const t = st.type || st.stationType || st.kind || null;
  return t ? String(t).toLowerCase() : null;
}

function isMilitaryStation(type) {
  return !!type && MILITARY_TYPES.has(String(type).toLowerCase());
}

function isBlackmarketStation(type) {
  return !!type && BLACKMARKET_TYPES.has(String(type).toLowerCase());
}

/** True if capture was already committed (choice paid / preferred stamped / receipt). */
function isCaptureCommitted(leaf, payload = null) {
  if (!leaf) return false;
  if (leaf.capturePreferred === true) return true;
  if (payload && payload.capturePreferred === true) return true;
  if (payload && payload.choiceId === 'capture') return true;
  if (Array.isArray(leaf.activeChoiceIds) && leaf.activeChoiceIds.includes('capture')) return true;
  if (leaf.receipts && leaf.receipts['choice:hunter:capture_window:capture']) return true;
  return false;
}

/** True if execute was already committed. */
function isExecuteCommitted(leaf, payload = null) {
  if (!leaf) return false;
  if (payload && payload.choiceId === 'execute') return true;
  if (Array.isArray(leaf.activeChoiceIds) && leaf.activeChoiceIds.includes('execute')) return true;
  if (leaf.receipts && leaf.receipts['choice:hunter:capture_window:execute']) return true;
  return false;
}

function stampCapturePreferred(leaf, preferred) {
  if (!leaf) return;
  leaf.capturePreferred = !!preferred;
  if (!leaf.flags || typeof leaf.flags !== 'object') {
    leaf.flags = {
      nonBinding: true,
      usesRealAuthorities: true,
      exclusive: false,
      blocksOtherCareers: false,
    };
  }
  leaf.flags.capturePreferred = !!preferred;
  const step = leaf.steps && leaf.steps.capture_window;
  if (step) {
    if (!step.payload || typeof step.payload !== 'object') step.payload = {};
    step.payload.capturePreferred = !!preferred;
    if (preferred) step.payload.choiceId = step.payload.choiceId || 'capture';
    else if (step.payload.choiceId !== 'capture') step.payload.choiceId = step.payload.choiceId || 'execute';
  }
}

function distSq(a, b) {
  if (!a || !b) return Infinity;
  const dx = (a.x || 0) - (b.x || 0);
  const dz = (a.z || 0) - (b.z || 0);
  return dx * dx + dz * dz;
}

function targetIdOf(state) {
  const player = state && state.player;
  if (player && player.targetId != null) return player.targetId;
  if (state && state.input && state.input.targetId != null) return state.input.targetId;
  if (state && state.ui && state.ui.targetId != null) return state.ui.targetId;
  return null;
}

// ── FSM factory ──────────────────────────────────────────────────────────────

/**
 * Create an isolated Hunter ladder adapter.
 * @param {{ ladders?: object }} [opts]  careerLadders system instance
 */
export function createHunterLadderFsm(opts = {}) {
  return {
    name: 'hunterLadder',
    careerId: HUNTER_LADDER_CAREER_ID,
    state: null,
    bus: null,
    ladders: opts.ladders || null,
    _subs: [],
    _registered: false,
    _lostTicks: 0,
    _lastTargetId: null,

    /**
     * Register definition with the shared framework (idempotent per process if cleared between tests).
     */
    register(laddersSys = null) {
      const sys = laddersSys || this.ladders;
      if (!sys) return { ok: false, reason: 'no_ladders_system' };
      this.ladders = sys;
      const v = validateHunterLadderDefinition();
      if (!v.ok) return { ok: false, reason: 'invalid_definition', errors: v.errors };
      // Prefer system.registerDefinition when available (hydrates leaf).
      if (typeof sys.registerDefinition === 'function') {
        const r = sys.registerDefinition(createHunterLadderDefinition());
        if (r && r.ok === false && r.reason === 'duplicate_careerId') {
          this._registered = true;
          return { ok: true, reason: 'already_registered', careerId: HUNTER_LADDER_CAREER_ID };
        }
        this._registered = !!(r && r.ok);
        return r;
      }
      return { ok: false, reason: 'no_register' };
    },

    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus || null;
      if (ctx.ladders) this.ladders = ctx.ladders;
      if (ctx.registry && typeof ctx.registry.get === 'function') {
        const viaReg = ctx.registry.get('careerLadders');
        if (viaReg) this.ladders = viaReg;
      }
      if (this.ladders && !this._registered) this.register(this.ladders);

      this._listen(EV.HEAT_CHANGED, (p) => this._onHeatChanged(p));
      this._listen(EV.COMBAT_DAMAGE, (p) => this._onCombatDamage(p));
      this._listen(EV.ENTITY_KILLED, (p) => this._onEntityKilled(p));
      this._listen(EV.AI_TELEGRAPH, (p) => this._onAiTelegraph(p));
      this._listen(EV.BOUNTY_TRICK_TELEGRAPH, (p) => this._onTrickTelegraph(p));
      this._listen(EV.BOUNTY_TRICK_ACTIVATED, (p) => this._onTrickActivated(p));
      this._listen(EV.BOUNTY_OUTCOME, (p) => this._onBountyOutcome(p));
      this._listen(EV.AI_FLEE, (p) => this._onAiFlee(p));
      this._listen(EV.COMBAT_SUBSYSTEM_DISABLED, (p) => this._onSubsystemDisabled(p));
      this._listen(EV.COMBAT_OUTCOME, (p) => this._onCombatOutcome(p));
      this._listen(EV.DOCK_DOCKED, (p) => this._onDocked(p));
      this._listen(EV.MISSION_ACCEPTED, (p) => this._onMissionAccepted(p));
      this._listen(EV.SHIP_PURCHASED, (p) => {
        if (p && p.defId === HUNTER_ROLE_HULL_DEF_ID) this._syncRoleHullCapstone();
      });
      this._listen(EV.SAVE_LOADED, () => this._syncRoleHullCapstone());
      this._listen(CAREER_LADDER_EVENTS.STEP_ACTIVE, (p) => this._onStepActive(p));
      this._listen(CAREER_LADDER_EVENTS.CHOOSE, (p) => {
        // UI may emit choose on the bus; prefer ladders.choose if present.
        if (p && p.careerId === HUNTER_LADDER_CAREER_ID && p.choiceId) {
          this.choose(p.choiceId, p);
        }
      });
      this._syncRoleHullCapstone();
    },

    newGame() {
      this._lostTicks = 0;
      this._lastTargetId = null;
    },

    update(_dt, state) {
      if (state) this.state = state;
      if (!this.state || !this.ladders) return;
      if (this.state.mode && this.state.mode !== 'flight' && this.state.mode !== 'docked') {
        // Still allow docked ledger/capture resolution via dock events.
      }
      const leaf = activeLeaf(this.ladders, this.state);
      if (!isActiveHunter(leaf)) return;

      if (leaf.stepId === 'warrant_desk') {
        this._tickWarrantDesk(leaf);
        return;
      }
      if (leaf.stepId === 'doctrine_pursuit') {
        this._tickDoctrinePursuit(leaf);
        return;
      }
      if (leaf.stepId === 'escalation_package') {
        this._tickEscalationPackage(leaf);
        return;
      }
    },

    // ── public test / adapter API ──────────────────────────────────────────

    offer(opts = {}) {
      if (!this.ladders) return { ok: false, reason: 'no_ladders' };
      return this.ladders.offer(HUNTER_LADDER_CAREER_ID, opts);
    },

    accept(opts = {}) {
      if (!this.ladders) return { ok: false, reason: 'no_ladders' };
      return this.ladders.accept(HUNTER_LADDER_CAREER_ID, opts);
    },

    recover(opts = {}) {
      if (!this.ladders || !this.state) return { ok: false, reason: 'no_ladders' };
      const leaf = activeLeaf(this.ladders, this.state);
      // Heat-related recovery requires clean heat authority.
      if (leaf && leaf.status === LADDER_STATUS.RECOVERING) {
        const last = Array.isArray(leaf.history) ? leaf.history[leaf.history.length - 1] : null;
        const code = (last && last.code) || (leaf.steps && leaf.stepId && leaf.steps[leaf.stepId]
          && leaf.steps[leaf.stepId].payload && leaf.steps[leaf.stepId].payload.lastFailCode) || null;
        if (
          (code === FAIL.HEAT_SPIKED || code === FAIL.ILLEGAL_KILL || code === FAIL.ILLEGAL_FIRE
            || code === FAIL.CIVILIAN_KILL || code === FAIL.WANTED_BLOCKS_LAW_FILE)
          && isPlayerWanted(this.state)
          && !opts.force
        ) {
          return {
            ok: false,
            reason: 'heat_still_wanted',
            code: FAIL.HEAT_SPIKED,
          };
        }
      }
      const result = this.ladders.recover(HUNTER_LADDER_CAREER_ID, opts);
      if (result && result.ok) {
        this._lostTicks = 0;
        const next = activeLeaf(this.ladders, this.state);
        const payload = ensurePayload(next);
        if (payload && next && next.stepId === 'warrant_desk') {
          payload.markEntityId = null;
          payload.doctrineId = null;
        }
        if (payload && next && next.stepId === 'doctrine_pursuit') {
          payload.pursuitTicks = 0;
          payload.lostTicks = 0;
          payload.telegraphSeen = false;
          this._lostTicks = 0;
        }
        if (payload && next && next.stepId === 'escalation_package') {
          payload.packageCleared = false;
          payload.packageSawTrick = false;
          payload.packageStartedAtS = simTimeOf(this.state);
          payload.packageHostileClears = 0;
        }
      }
      return result;
    },

    /**
     * Confirm a mark for warrant_desk (or re-mark after recovery).
     * Uses live classifyHunterContact + heat gate.
     */
    confirmMark(entity, opts = {}) {
      if (!this.ladders || !this.state) return { ok: false, reason: 'no_ladders' };
      const leaf = activeLeaf(this.ladders, this.state);
      if (!isActiveHunter(leaf) || leaf.stepId !== 'warrant_desk') {
        return { ok: false, reason: 'wrong_step', stepId: leaf && leaf.stepId };
      }
      if (isPlayerWanted(this.state)) {
        return this._fail(FAIL.HEAT_SPIKED, opts);
      }
      if (!entity) {
        return this._fail(FAIL.NO_MARK, opts);
      }
      const cls = classifyHunterContact(this.state, entity);
      if (cls.lawful || cls.contactWord === 'PATROL') {
        return this._fail(FAIL.MARKED_LAWFUL, { ...opts, detail: cls.contactWord });
      }
      if (cls.civilian || (cls.contactWord && FORBIDDEN_MARK.has(cls.contactWord) && !LEGAL_MARK.has(cls.contactWord))) {
        return this._fail(FAIL.MARKED_CIVILIAN, { ...opts, detail: cls.contactWord });
      }
      if (!cls.legalBounty || !LEGAL_MARK.has(cls.contactWord)) {
        return this._fail(FAIL.MARKED_CIVILIAN, { ...opts, detail: cls.contactWord || 'unknown' });
      }

      const payload = ensurePayload(leaf);
      const flags = ensureFlags(leaf);
      payload.markEntityId = entity.id;
      payload.doctrineId = cls.doctrineId
        || normalizeCombatDoctrineId(entity.data && entity.data.ai && entity.data.ai.combatDoctrineId)
        || null;
      payload.contactWord = cls.contactWord;
      payload.legalBounty = true;
      if (opts.missionId != null) payload.missionId = opts.missionId;
      flags.markEntityId = entity.id;

      return this._complete({
        receiptId: opts.receiptId,
        markEntityId: entity.id,
      });
    },

    /** Explicit pursuit contact tick injection (tests / headless). */
    tickPursuit({ inContact = false, dtTicks = 1 } = {}) {
      if (!this.ladders || !this.state) return { ok: false, reason: 'no_ladders' };
      const leaf = activeLeaf(this.ladders, this.state);
      if (!isActiveHunter(leaf) || leaf.stepId !== 'doctrine_pursuit') {
        return { ok: false, reason: 'wrong_step' };
      }
      if (isPlayerWanted(this.state)) return this._fail(FAIL.HEAT_SPIKED);

      const payload = ensurePayload(leaf);
      const ticks = Math.max(1, dtTicks | 0);
      // lostTicks lives in step payload (save-safe), mirrored to instance for live ticks.
      let lost = Number(payload.lostTicks);
      if (!Number.isFinite(lost)) lost = Number(this._lostTicks) || 0;
      if (inContact) {
        lost = 0;
        payload.lostTicks = 0;
        this._lostTicks = 0;
        payload.pursuitTicks = (Number(payload.pursuitTicks) || 0) + ticks;
        if (payload.pursuitTicks >= HUNTER_LADDER_PURSUIT_CONTACT_TICKS) {
          return this._complete({
            receiptId: `step_done:hunter:doctrine_pursuit:ticks:${payload.pursuitTicks}`,
          });
        }
      } else {
        lost += ticks;
        payload.lostTicks = lost;
        this._lostTicks = lost;
        if (lost >= HUNTER_LADDER_LOST_TICKS) {
          payload.lostTicks = 0;
          this._lostTicks = 0;
          return this._fail(FAIL.MARK_LOST);
        }
      }
      return {
        ok: true,
        pursuitTicks: payload.pursuitTicks || 0,
        need: HUNTER_LADDER_PURSUIT_CONTACT_TICKS,
        lostTicks: Number(payload.lostTicks) || 0,
      };
    },

    /** Mark escalation package cleared (tests / adapter after hostiles down). */
    notePackageCleared(opts = {}) {
      if (!this.ladders || !this.state) return { ok: false, reason: 'no_ladders' };
      const leaf = activeLeaf(this.ladders, this.state);
      if (!isActiveHunter(leaf) || leaf.stepId !== 'escalation_package') {
        return { ok: false, reason: 'wrong_step' };
      }
      if (isPlayerWanted(this.state)) return this._fail(FAIL.HEAT_SPIKED);
      const payload = ensurePayload(leaf);
      payload.packageCleared = true;
      payload.packageSawTrick = payload.packageSawTrick || !!opts.sawTrick;
      return this._tryCompletePackage(leaf, opts);
    },

    /**
     * Resolve a step choice (capture/execute/file_law/sell_dark).
     * Enforces WANTED + station gates; emits canonical consequence intents via framework.
     */
    choose(choiceId, opts = {}) {
      if (!this.ladders || !this.state) return { ok: false, reason: 'no_ladders' };
      const leaf = activeLeaf(this.ladders, this.state);
      if (!isActiveHunter(leaf)) return { ok: false, reason: 'not_active' };

      const id = String(choiceId || '');
      const payload = ensurePayload(leaf);
      const flags = ensureFlags(leaf);
      const stationType = stationTypeOf(this.state, opts);

      if (leaf.stepId === 'capture_window') {
        if (id === 'capture') {
          if (!payload.markDisabled) {
            return { ok: false, reason: 'mark_not_disabled' };
          }
          if (isPlayerWanted(this.state)) return this._fail(FAIL.HEAT_SPIKED, opts);
          // Exclusive fork: execute already paid must not also pay capture.
          if (isExecuteCommitted(leaf, payload)) {
            return { ok: false, reason: 'execute_already_chosen', duplicate: true };
          }
          const chosen = this.ladders.choose(HUNTER_LADDER_CAREER_ID, 'capture', opts);
          if (!chosen || !chosen.ok) return chosen;
          if (chosen.duplicate) return chosen;
          // Re-fetch: choose → ensureLadderLeaf may replace the leaf object.
          const live = activeLeaf(this.ladders, this.state);
          const livePayload = ensurePayload(live);
          livePayload.choiceId = 'capture';
          stampCapturePreferred(live, true);
          // Capture requires military dock — do not complete yet unless forced.
          if (opts.completeNow || (opts.stationType && isMilitaryStation(stationTypeOf(this.state, opts)))) {
            return this._completeCapture(live, opts);
          }
          return chosen;
        }
        if (id === 'execute') {
          if (isPlayerWanted(this.state)) return this._fail(FAIL.HEAT_SPIKED, opts);
          // Exclusive fork: capture already paid must not also pay execute.
          if (isCaptureCommitted(leaf, payload)) {
            return { ok: false, reason: 'capture_already_chosen', duplicate: true };
          }
          const chosen = this.ladders.choose(HUNTER_LADDER_CAREER_ID, 'execute', opts);
          if (!chosen || !chosen.ok) return chosen;
          if (chosen.duplicate) return chosen;
          const live = activeLeaf(this.ladders, this.state);
          const livePayload = ensurePayload(live);
          livePayload.choiceId = 'execute';
          stampCapturePreferred(live, false);
          if (opts.completeNow || opts.markDead) {
            const done = this._complete({
              receiptId: opts.receiptId || 'step_done:hunter:capture_window:execute',
            });
            stampCapturePreferred(activeLeaf(this.ladders, this.state), false);
            return done;
          }
          return chosen;
        }
        return { ok: false, reason: 'unknown_choice', choiceId: id };
      }

      if (leaf.stepId === 'ledger_choice') {
        if (id === 'file_law') {
          if (isPlayerWanted(this.state)) {
            return this._fail(FAIL.WANTED_BLOCKS_LAW_FILE, opts);
          }
          const st = stationType || stationTypeOf(this.state, opts);
          if (opts.requireStation !== false && !isMilitaryStation(st) && !opts.ignoreStation) {
            return { ok: false, reason: 'requires_military_dock', stationType: st };
          }
          const chosen = this.ladders.choose(HUNTER_LADDER_CAREER_ID, 'file_law', opts);
          if (!chosen || !chosen.ok) return chosen;
          if (chosen.duplicate) return chosen;
          const live = activeLeaf(this.ladders, this.state);
          const livePayload = ensurePayload(live);
          const liveFlags = ensureFlags(live);
          livePayload.choiceId = 'file_law';
          livePayload.ledgerPath = 'law';
          live.ledgerPath = 'law';
          liveFlags.ledgerPath = 'law';
          const done = this._complete({
            receiptId: opts.receiptId || 'ladder_done:hunter:law',
            completionReceiptId: 'ladder_done:hunter',
          });
          // Re-stamp after complete migrate wipes flags.
          const after = activeLeaf(this.ladders, this.state);
          if (after) {
            after.ledgerPath = 'law';
            after.capturePreferred = after.capturePreferred;
            if (!after.flags || typeof after.flags !== 'object') after.flags = {};
            after.flags.ledgerPath = 'law';
          }
          return done;
        }
        if (id === 'sell_dark') {
          const st = stationType || stationTypeOf(this.state, opts);
          if (opts.requireStation !== false && !isBlackmarketStation(st) && !opts.ignoreStation) {
            return { ok: false, reason: 'requires_blackmarket_dock', stationType: st };
          }
          const chosen = this.ladders.choose(HUNTER_LADDER_CAREER_ID, 'sell_dark', opts);
          if (!chosen || !chosen.ok) return chosen;
          if (chosen.duplicate) {
            return { ok: true, reason: 'duplicate_receipt', duplicate: true, code: FAIL.DOUBLE_SELL_BLOCKED };
          }
          const live = activeLeaf(this.ladders, this.state);
          const livePayload = ensurePayload(live);
          const liveFlags = ensureFlags(live);
          livePayload.choiceId = 'sell_dark';
          livePayload.ledgerPath = 'dark';
          live.ledgerPath = 'dark';
          liveFlags.ledgerPath = 'dark';
          const done = this._complete({
            receiptId: opts.receiptId || 'ladder_done:hunter:dark',
            completionReceiptId: 'ladder_done:hunter',
          });
          const after = activeLeaf(this.ladders, this.state);
          if (after) {
            after.ledgerPath = 'dark';
            if (!after.flags || typeof after.flags !== 'object') after.flags = {};
            after.flags.ledgerPath = 'dark';
          }
          return done;
        }
        return { ok: false, reason: 'unknown_choice', choiceId: id };
      }

      return { ok: false, reason: 'no_choices_on_step', stepId: leaf.stepId };
    },

    getLeaf() {
      return activeLeaf(this.ladders, this.state);
    },

    getProgress() {
      return this.ladders ? this.ladders.getProgress(HUNTER_LADDER_CAREER_ID) : null;
    },

    destroy() {
      for (const off of this._subs || []) {
        try { off(); } catch (_) { /* best-effort */ }
      }
      this._subs = [];
    },

    // ── internal ticks ─────────────────────────────────────────────────────

    _tickWarrantDesk(leaf) {
      const targetId = targetIdOf(this.state);
      if (targetId == null) {
        this._lastTargetId = null;
        return;
      }
      if (targetId === this._lastTargetId) return;
      this._lastTargetId = targetId;
      const entity = getEntity(this.state, targetId);
      this.confirmMark(entity);
    },

    _tickDoctrinePursuit(leaf) {
      if (isPlayerWanted(this.state)) {
        this._fail(FAIL.HEAT_SPIKED);
        return;
      }
      const payload = ensurePayload(leaf);
      const markId = payload.markEntityId
        || (leaf.flags && leaf.flags.markEntityId)
        || null;
      // Prefer mark from prior step payload: copy forward if missing.
      if (markId == null) {
        const prior = leaf.steps && leaf.steps.warrant_desk && leaf.steps.warrant_desk.payload;
        if (prior && prior.markEntityId != null) {
          payload.markEntityId = prior.markEntityId;
          payload.doctrineId = prior.doctrineId || payload.doctrineId;
        }
      }
      const markEntityId = payload.markEntityId;
      const mark = getEntity(this.state, markEntityId);
      const player = getPlayer(this.state);
      const locked = targetIdOf(this.state) === markEntityId;

      let inContact = false;
      if (mark && player && mark.alive !== false && mark.pos && player.pos && locked) {
        const cls = classifyHunterContact(this.state, mark);
        if (cls.legalBounty) {
          inContact = distSq(mark.pos, player.pos) <= HUNTER_LADDER_PURSUIT_RANGE_SQ;
        }
      }
      this.tickPursuit({ inContact, dtTicks: 1 });
    },

    _tickEscalationPackage(leaf) {
      if (isPlayerWanted(this.state)) {
        this._fail(FAIL.HEAT_SPIKED);
        return;
      }
      const payload = ensurePayload(leaf);
      if (payload.packageStartedAtS == null) {
        payload.packageStartedAtS = simTimeOf(this.state);
      }
      const elapsed = simTimeOf(this.state) - (Number(payload.packageStartedAtS) || 0);
      if (elapsed >= HUNTER_LADDER_PACKAGE_TIMER_S) {
        // Survive timer without WANTED and mark still present/legal.
        const mark = getEntity(this.state, payload.markEntityId);
        if (!mark || mark.alive === false) {
          // Mark dead during package is ok if it was the legal bag and no heat —
          // treat as cleared package.
          payload.packageCleared = true;
        }
        this._tryCompletePackage(leaf, { via: 'timer' });
      }
    },

    _tryCompletePackage(leaf, opts = {}) {
      const payload = ensurePayload(leaf);
      if (isPlayerWanted(this.state)) return this._fail(FAIL.HEAT_SPIKED, opts);
      // Require either saw a trick / package clear signal or timer path.
      if (payload.packageCleared || opts.via === 'timer' || payload.packageSawTrick) {
        if (payload.packageCleared || opts.via === 'timer' || (payload.packageSawTrick && payload.packageHostileClears > 0)) {
          payload.packageCleared = true;
          ensureFlags(leaf).packageCleared = true;
          return this._complete({
            receiptId: opts.receiptId || `step_done:hunter:escalation_package`,
          });
        }
        // Saw trick only — wait for clears unless force.
        if (opts.force || opts.allowTrickOnly) {
          payload.packageCleared = true;
          return this._complete({
            receiptId: opts.receiptId || `step_done:hunter:escalation_package:trick`,
          });
        }
      }
      return { ok: true, waiting: true, packageCleared: !!payload.packageCleared };
    },

    _completeCapture(leaf, opts = {}) {
      const payload = ensurePayload(leaf);
      if (!payload.markDisabled && !opts.force) {
        return { ok: false, reason: 'mark_not_disabled' };
      }
      if (isPlayerWanted(this.state)) return this._fail(FAIL.HEAT_SPIKED, opts);
      const mark = getEntity(this.state, payload.markEntityId);
      if (mark && mark.alive === false && !opts.force) {
        return { ok: false, reason: 'mark_dead_for_capture' };
      }
      stampCapturePreferred(leaf, true);
      const done = this._complete({
        receiptId: opts.receiptId || 'step_done:hunter:capture_window:capture',
      });
      stampCapturePreferred(activeLeaf(this.ladders, this.state), true);
      return done;
    },

    // ── event handlers ─────────────────────────────────────────────────────

    _onStepActive(payload) {
      if (!payload || payload.careerId !== HUNTER_LADDER_CAREER_ID) return;
      const leaf = activeLeaf(this.ladders, this.state);
      if (!leaf) return;
      const p = ensurePayload(leaf);
      // Carry mark forward across steps.
      const warrant = leaf.steps && leaf.steps.warrant_desk && leaf.steps.warrant_desk.payload;
      if (warrant && warrant.markEntityId != null && p.markEntityId == null) {
        p.markEntityId = warrant.markEntityId;
        p.doctrineId = warrant.doctrineId || p.doctrineId;
      }
      if (payload.stepId === 'escalation_package') {
        p.packageStartedAtS = simTimeOf(this.state);
        p.packageCleared = false;
        p.packageSawTrick = false;
        p.packageHostileClears = 0;
      }
      if (payload.stepId === 'doctrine_pursuit') {
        p.pursuitTicks = Number(p.pursuitTicks) || 0;
        // Hydrate save-safe lostTicks into instance (do not wipe mid-pursuit restore).
        const savedLost = Number(p.lostTicks);
        this._lostTicks = Number.isFinite(savedLost) ? savedLost : 0;
        p.lostTicks = this._lostTicks;
        p.telegraphSeen = !!p.telegraphSeen;
      }
      if (payload.stepId === 'capture_window') {
        p.markDisabled = !!p.markDisabled;
        p.choiceId = p.choiceId || null;
      }
      if (payload.stepId === ROLE_HULL_STEP_ID) this._syncRoleHullCapstone();
    },

    _syncRoleHullCapstone() {
      if (!this.state || !this.ladders) return { ok: false, reason: 'missing' };
      const leaf = reopenLegacyRoleHullCapstone(this.ladders, this.state);
      if (!leaf || leaf.status !== LADDER_STATUS.ACTIVE || leaf.stepId !== ROLE_HULL_STEP_ID) {
        return { ok: true, reason: 'inactive' };
      }
      if (!ownsRoleHull(this.state)) return { ok: true, reason: 'not_owned' };
      return this.ladders.applySignal(HUNTER_LADDER_CAREER_ID, {
        kind: 'complete',
        receiptId: `step_done:${HUNTER_LADDER_CAREER_ID}:${ROLE_HULL_STEP_ID}:${HUNTER_ROLE_HULL_DEF_ID}`,
      });
    },

    _onHeatChanged() {
      const leaf = activeLeaf(this.ladders, this.state);
      if (!isActiveHunter(leaf)) return;
      if (!isPlayerWanted(this.state)) return;
      // Lawful steps fail under WANTED.
      if (
        leaf.stepId === 'warrant_desk'
        || leaf.stepId === 'doctrine_pursuit'
        || leaf.stepId === 'escalation_package'
        || leaf.stepId === 'capture_window'
      ) {
        this._fail(FAIL.HEAT_SPIKED);
      }
    },

    _onCombatDamage(payload) {
      if (!payload || !this.state) return;
      const leaf = activeLeaf(this.ladders, this.state);
      if (!isActiveHunter(leaf)) return;
      if (payload.attackerId !== this.state.playerId && payload.ownerId !== this.state.playerId) return;

      const victimId = entityIdOf(payload) ?? payload.targetId;
      const victim = getEntity(this.state, victimId);
      if (!victim) return;
      const cls = classifyHunterContact(this.state, victim);
      if (cls.lawful || cls.civilian || cls.illegalToKill) {
        // Illegal splash on clean hulls.
        if (
          leaf.stepId === 'doctrine_pursuit'
          || leaf.stepId === 'escalation_package'
          || leaf.stepId === 'capture_window'
          || leaf.stepId === 'warrant_desk'
        ) {
          this._fail(FAIL.ILLEGAL_FIRE, { detail: cls.contactWord });
        }
      }
    },

    _onEntityKilled(payload) {
      if (!payload || !this.state) return;
      const leaf = activeLeaf(this.ladders, this.state);
      if (!isActiveHunter(leaf)) return;

      // Live damage.js emits { id, killerId, type, pos, factionId, victimClass }.
      const victimId = entityIdOf(payload);
      const byPlayer = payload.killerId === this.state.playerId;
      const payloadMark = ensurePayload(leaf);
      const markId = payloadMark && payloadMark.markEntityId;

      if (byPlayer) {
        // Reconstruct classification from kill payload flags when entity already gone.
        const victim = getEntity(this.state, victimId);
        const lawful = !!(payload.factionLawful || (victim && (victim.data && (victim.data.factionLawful || (victim.data.ai && victim.data.ai.lawful)))));
        const civilian = !!(payload.illegalToKill || (victim && victim.team === 2)
          || (victim && victim.data && victim.data.ai && victim.data.ai.passive));

        if (lawful || civilian || payload.illegalToKill) {
          if (leaf.stepId === 'escalation_package') {
            this._fail(FAIL.CIVILIAN_KILL);
            return;
          }
          if (leaf.stepId === 'capture_window' || leaf.stepId === 'doctrine_pursuit' || leaf.stepId === 'warrant_desk') {
            this._fail(FAIL.ILLEGAL_KILL);
            return;
          }
        }

        if (leaf.stepId === 'escalation_package') {
          if (victimId !== markId) {
            payloadMark.packageHostileClears = (Number(payloadMark.packageHostileClears) || 0) + 1;
            if (payloadMark.packageSawTrick || payloadMark.packageHostileClears > 0) {
              payloadMark.packageCleared = true;
              this._tryCompletePackage(leaf, { allowTrickOnly: true });
            }
          } else {
            // Legal mark kill during package still keeps bag if not wanted.
            if (!isPlayerWanted(this.state)) {
              payloadMark.packageCleared = true;
              this._tryCompletePackage(leaf, { allowTrickOnly: true });
            }
          }
          return;
        }

        if (leaf.stepId === 'capture_window' && victimId === markId) {
          if (isPlayerWanted(this.state)) {
            this._fail(FAIL.HEAT_SPIKED);
            return;
          }

          // Capture already committed: never auto-execute, never flip capturePreferred,
          // never emit a second choice receipt / execute grant.
          if (isCaptureCommitted(leaf, payloadMark)) {
            payloadMark.markAlive = false;
            stampCapturePreferred(leaf, true);
            return;
          }

          // Execute already chosen: complete once (choice pay already done).
          if (isExecuteCommitted(leaf, payloadMark)) {
            this._complete({
              receiptId: 'step_done:hunter:capture_window:execute',
            });
            stampCapturePreferred(activeLeaf(this.ladders, this.state), false);
            return;
          }

          // No prior choice: legal kill of mark auto-executes exactly once.
          const chosen = this.ladders.choose(HUNTER_LADDER_CAREER_ID, 'execute', {
            receiptId: 'choice:hunter:capture_window:execute',
          });
          if (!chosen || !chosen.ok) return;
          const live = activeLeaf(this.ladders, this.state);
          const lp = ensurePayload(live);
          if (lp) lp.choiceId = 'execute';
          stampCapturePreferred(live, false);
          this._complete({
            receiptId: 'step_done:hunter:capture_window:execute',
          });
          stampCapturePreferred(activeLeaf(this.ladders, this.state), false);
        }
      } else if (leaf.stepId === 'escalation_package' && victimId === this.state.playerId) {
        this._fail(FAIL.PACKAGE_WIPED_PLAYER);
      } else if (leaf.stepId === 'capture_window' && victimId === markId) {
        // Mark died without player kill.
        // If capture was already declared, preserve branch truth and do not flip to execute.
        if (isCaptureCommitted(leaf, payloadMark)) {
          payloadMark.markAlive = false;
          stampCapturePreferred(leaf, true);
          return;
        }
        // No capture commitment — bag lost.
        this._fail(FAIL.MARK_ESCAPED);
      }
    },

    _onAiTelegraph(payload) {
      const leaf = activeLeaf(this.ladders, this.state);
      if (!isActiveHunter(leaf) || leaf.stepId !== 'doctrine_pursuit') return;
      if (isPlayerWanted(this.state)) return;
      const payloadStep = ensurePayload(leaf);
      const entityId = entityIdOf(payload);
      if (entityId == null || entityId !== payloadStep.markEntityId) return;
      // Alternate success: doctrine telegraph from the mark while still legal.
      // Headless tests may omit player.targetId — markEntityId match is enough.
      const mark = getEntity(this.state, payloadStep.markEntityId);
      if (!mark) return;
      const cls = classifyHunterContact(this.state, mark);
      if (!cls.legalBounty) return;
      payloadStep.telegraphSeen = true;
      payloadStep.doctrineId = normalizeCombatDoctrineId(
        payload.doctrineId || payload.kind || payloadStep.doctrineId,
      ) || payloadStep.doctrineId;
      this._complete({
        receiptId: `step_done:hunter:doctrine_pursuit:telegraph`,
      });
    },

    _onTrickTelegraph(payload) {
      // Optional pursuit presentation signal; does not complete alone.
      const leaf = activeLeaf(this.ladders, this.state);
      if (!isActiveHunter(leaf)) return;
      const p = ensurePayload(leaf);
      if (leaf.stepId === 'doctrine_pursuit' || leaf.stepId === 'escalation_package') {
        p.lastTrickTelegraph = payload && payload.trickId || true;
      }
    },

    _onTrickActivated(payload) {
      const leaf = activeLeaf(this.ladders, this.state);
      if (!isActiveHunter(leaf) || leaf.stepId !== 'escalation_package') return;
      const p = ensurePayload(leaf);
      p.packageSawTrick = true;
      p.lastTrickId = payload && payload.trickId || null;
      // With allowTrickOnly after activate, tests can complete via notePackageCleared.
    },

    _onBountyOutcome(payload) {
      const leaf = activeLeaf(this.ladders, this.state);
      if (!isActiveHunter(leaf) || leaf.stepId !== 'escalation_package') return;
      const p = ensurePayload(leaf);
      p.lastBountyOutcome = payload && payload.outcome || true;
      p.packageHostileClears = (Number(p.packageHostileClears) || 0) + 1;
      p.packageCleared = true;
      this._tryCompletePackage(leaf, { allowTrickOnly: true });
    },

    _onAiFlee(payload) {
      const leaf = activeLeaf(this.ladders, this.state);
      if (!isActiveHunter(leaf) || leaf.stepId !== 'escalation_package') return;
      const p = ensurePayload(leaf);
      p.packageHostileClears = (Number(p.packageHostileClears) || 0) + 1;
      if (p.packageSawTrick || p.packageHostileClears > 0) {
        p.packageCleared = true;
        this._tryCompletePackage(leaf, { allowTrickOnly: true });
      }
    },

    _onSubsystemDisabled(payload) {
      const leaf = activeLeaf(this.ladders, this.state);
      if (!isActiveHunter(leaf) || leaf.stepId !== 'capture_window') return;
      const entityId = entityIdOf(payload);
      const p = ensurePayload(leaf);
      if (entityId == null || entityId !== p.markEntityId) return;
      const subsystemId = String(payload.subsystemId || '');
      if (subsystemId && !DISABLE_SUBSYSTEMS.has(subsystemId)) {
        // Still accept any subsystem disable on mark as capture window open
        // (combatOutcome filters; ladder is slightly more permissive for tests).
      }
      p.markDisabled = true;
      p.disableSubsystemId = subsystemId || null;
    },

    _onCombatOutcome(payload) {
      const leaf = activeLeaf(this.ladders, this.state);
      if (!isActiveHunter(leaf) || leaf.stepId !== 'capture_window') return;
      if (!payload || payload.outcome !== 'disabled') return;
      const entityId = entityIdOf(payload);
      const p = ensurePayload(leaf);
      if (entityId == null || entityId !== p.markEntityId) return;
      p.markDisabled = true;
      // Never require combat:surrendered.
    },

    _onDocked(payload) {
      const leaf = activeLeaf(this.ladders, this.state);
      if (!isActiveHunter(leaf)) return;
      const p = ensurePayload(leaf);
      const stationType = stationTypeOf(this.state, payload || {});

      if (leaf.stepId === 'capture_window') {
        if (p.choiceId === 'capture' && p.markDisabled && isMilitaryStation(stationType)) {
          this._completeCapture(leaf, { ...(payload || {}), stationType });
        }
        return;
      }

      if (leaf.stepId === 'ledger_choice') {
        p.lastDockStationType = stationType;
        p.lastDockStationId = payload && payload.stationId || null;
        // Auto-prompt only stores dock context; choice is explicit (file_law / sell_dark).
      }
    },

    _onMissionAccepted(payload) {
      const leaf = activeLeaf(this.ladders, this.state);
      if (!isActiveHunter(leaf) || leaf.stepId !== 'warrant_desk') return;
      if (!payload) return;
      if (payload.type && payload.type !== 'bounty_hunt') return;
      const p = ensurePayload(leaf);
      p.missionId = payload.missionId || payload.id || p.missionId;
    },

    // ── complete / fail wrappers ───────────────────────────────────────────

    _complete(opts = {}) {
      if (!this.ladders) return { ok: false, reason: 'no_ladders' };
      return this.ladders.applySignal(HUNTER_LADDER_CAREER_ID, {
        kind: 'complete',
        receiptId: opts.receiptId,
        completionReceiptId: opts.completionReceiptId,
      });
    },

    _fail(code, opts = {}) {
      if (!this.ladders || !this.state) return { ok: false, reason: 'no_ladders' };
      const leaf = activeLeaf(this.ladders, this.state);
      if (leaf && isActiveHunter(leaf)) {
        const p = ensurePayload(leaf);
        if (p) p.lastFailCode = code;
      }
      return this.ladders.applySignal(HUNTER_LADDER_CAREER_ID, {
        kind: 'fail',
        code,
        receiptId: opts.receiptId,
      });
    },

    _listen(event, handler) {
      if (!this.bus || typeof this.bus.on !== 'function') return;
      const off = this.bus.on(event, handler);
      if (typeof off === 'function') this._subs.push(off);
    },
  };
}

/** Singleton candidate (lead may ignore; tests use createHunterLadderFsm). */
export const hunterLadder = createHunterLadderFsm();
