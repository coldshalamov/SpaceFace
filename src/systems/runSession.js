// Event-only sole writer of state.run (PQ-133 / CRU-002).
// Init-order only: never registered in PRODUCTION_UPDATE_ORDER, never ticks.
// Must not emit economy:* events, write state.player.* / state.economy.*, or construct entities —
// with ONE exception: it is also the owner of Adventure's saved Pilot Tree record,
// state.player.pilot (progression lead 2026-11-20), the persistent twin of run.pilot. That record is
// written only by the awardAdventureXp / takeAdventureNode / respecAdventurePilot handlers below,
// and the respec fee is paid through the economy's exact-charge request (the economy still writes
// the credits).
// Golden-safety: every handler is a strict no-op when state.run is absent or malformed.

import {
  RUN_OUTCOMES,
  canTransition,
  createPilotProgress,
  createRunState,
  runLevelForXp,
  validateRunState,
  validateRunStateForTick,
} from '../core/runState.js';
import {
  PILOT_REROLL_SCRAP,
  deepestPilotBranch,
  eligiblePilotCards,
  getPilotCard,
  isPilotCardEligible,
  pilotCardWeight,
  pilotDoorForRun,
  pilotPicksRemaining,
  untouchedPilotBranches,
  getPilotBranch,
} from '../data/pilotTree.js';
import {
  ADVENTURE_XP_AWARD_CAP,
  adventureLevelForXp,
  adventureRespecFee,
  createAdventurePilot,
  normalizeAdventurePilot,
} from '../data/pilotAdventure.js';
import { migrateHangar, purseBonusFor } from '../data/swarmHangar.js';
import { CRUCIBLE_WEEKLY_ROTATION } from '../data/survivalMutators.js';
import { normalizeSwarmStake, swarmStakeFor } from '../data/swarmStakes.js';
import { normalizePerkLoadout } from '../data/swarmPerks.js';
import { normalizeThreatIds } from '../data/swarmThreats.js';
import { crucibleEarnedPerkIds, dailySeedForDateKey, isUtcDateKey, loadCrucibleMeta, nextSwarmBankOrdinal } from './survivalRecords.js';
import { isSwarmRuleset } from './survivalSwarm.js';
import { bankableRunCredits, nonBankableRunCredits } from './survivalExtraction.js';
import { swarmPilotHasActed } from './swarmSafety.js';

const OUTCOME_SET = new Set(RUN_OUTCOMES);
const PURCHASE_RECEIPT_LIMIT = 64;
// OVH-01a (04 §3): re-rolling the pilot offer costs Scrap from the run purse. The price is
// owned by the tree's data (src/data/pilotTree.js) so the card UI shares it without importing
// this sim-side module.
const REFUND_FOR_SPEND = new Map([
  ['crucible:purchase', 'crucible:purchaseRefund'],
  ['swarm_floor_pad', 'swarm_floor:refund'],
  ['circuit_derelict_salvage', 'circuit_derelict_refund'],
  ['circuit_repair', 'circuit_repair_refund'],
  ['circuit_treasure', 'circuit_treasure_refund'],
  ['partial_bank', 'partial_bank_refund'],
]);
const REFUND_REASONS = new Set(REFUND_FOR_SPEND.values());
// Ephemeral identity survives the owner's immutable wallet/ledger commits. A new run or an
// unrelated replacement cannot inherit a pending armory action merely by reusing its seed.
const RUN_LIFETIMES = new WeakMap();
export function runLifetime(run) { return run && typeof run === 'object' ? RUN_LIFETIMES.get(run) || null : null; }

function cloneRun(run) {
  try {
    return JSON.parse(JSON.stringify(run));
  } catch {
    return null;
  }
}

function toFiniteInt(value, fallback = 0) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

function toReason(value) {
  return typeof value === 'string' ? value : null;
}

// A kill's displayed cause. Raw tags and weapon ids stay off the line.
function toCausePhrase(value) {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  if (!text || text.length > 48) return undefined;
  if (/[a-z0-9]+_[a-z0-9]+/.test(text) || /\bwpn_/.test(text)) return undefined;
  return text;
}

// Style settlements name their acts; anything else (or nothing) rides bare.
function toBankActs(value) {
  if (!Array.isArray(value)) return undefined;
  const names = value.filter((n) => typeof n === 'string' && n.trim().length > 0).slice(0, 8);
  return names.length > 0 ? names : undefined;
}
function toNonNegativeInt(value) {
  if (!Number.isFinite(value)) return 0;
  const n = Math.trunc(value);
  return n > 0 ? n : 0;
}

/** Perks no longer reach a Swarm run: progress unlocks options, never stats. */
const SWARM_PERKS_REACH_RUN = false;

function runOnlyAward(reason) {
  return reason === 'hangar_war_chest' || reason === 'swarm:sellBack' || reason === 'crucible:pact'
    || reason?.startsWith('swarm:stake:') || reason?.startsWith('swarm:checkpoint:');
}

function debitCredits(run, amount, earnedOnly = false) {
  const restricted = nonBankableRunCredits(run);
  const restrictedSpent = earnedOnly ? 0 : Math.min(restricted, amount);
  run.credits -= amount;
  if (restrictedSpent > 0) run.telemetry.nonBankableCredits = restricted - restrictedSpent;
  return restrictedSpent;
}

function rememberPurchaseReceipt(ledger, receipt) {
  ledger.receipts.set(receipt.requestId, receipt);
  while (ledger.receipts.size > PURCHASE_RECEIPT_LIMIT) {
    const oldest = ledger.receipts.keys().next();
    if (oldest.done) break;
    ledger.receipts.delete(oldest.value);
  }
  return receipt;
}

function cachePurchaseResult(owner, ledger, receipt) {
  rememberPurchaseReceipt(ledger, receipt);
  owner._emit('run:purchaseResolved', receipt);
  return receipt;
}

function safeRollback(commit) {
  if (typeof commit?.rollback !== 'function') return;
  try { commit.rollback(); } catch { /* Rollback diagnostics must not convert a refusal into a debit. */ }
}

// The stake's score factor rides every point the run tallies — kills, banks and chains all
// pass through award, so scaling the seam scales the contract (integer-rounded, per
// SWARM_PROGRAM.md §S1). A non-swarm or unstaked run reads 1.
function swarmScoreScale(run) {
  return run && isSwarmRuleset(run.ruleset)
    ? swarmStakeFor(run.telemetry && run.telemetry.swarmStake).score
    : 1;
}

export const runSession = {
  name: 'runSession',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    if (this.state?.run && typeof this.state.run === 'object') RUN_LIFETIMES.set(this.state.run, {});
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || null;
    this._unsubs = [];
    if (!this.bus || typeof this.bus.on !== 'function') return;
    this._unsubs.push(this.bus.on('run:beginRequested', (payload) => this.begin(payload)));
    this._unsubs.push(this.bus.on('run:transitionRequested', (payload) => this.transition(payload)));
    this._unsubs.push(this.bus.on('run:endRequested', (payload) => this.end(payload)));
    this._unsubs.push(this.bus.on('run:retireRequested', (payload) => this.retire(payload)));
    this._unsubs.push(this.bus.on('run:awardRequested', (payload) => this.award(payload)));
    this._unsubs.push(this.bus.on('run:spendRequested', (payload) => this.spend(payload)));
    this._unsubs.push(this.bus.on('run:modifierRecordRequested', (payload) => this.recordModifier(payload)));
    // OVH-01a2: the screen asks through intents; the owner answers (and refuses in words —
    // run:pilotCardRejected / run:pilotRerollRejected receipts ride every player-facing no).
    this._unsubs.push(this.bus.on('run:pilotCardRequested', (payload) => this.choosePilotCard(this.state, payload && payload.index)));
    this._unsubs.push(this.bus.on('run:pilotRerollRequested', () => this.rerollPilotOffer(this.state)));
    this._unsubs.push(this.bus.on('run:threatRequested', (payload) => this.setThreat(payload)));
    // Adventure's Pilot Tree (progression lead 2026-11-20): XP from the world's sources, a node
    // chosen from the full tree by id, and a respec at a station for a fee.
    this._unsubs.push(this.bus.on('pilot:xpEarned', (payload) => this.awardAdventureXp(payload)));
    this._unsubs.push(this.bus.on('pilot:nodeRequested', (payload) => this.takeAdventureNode(payload && payload.nodeId)));
    this._unsubs.push(this.bus.on('pilot:respecRequested', () => this.respecAdventurePilot()));
    this._unsubs.push(this.bus.on('game:exitToMenu', (payload) => this._onExitToMenu(payload)));
    // save:restoring fires first (before save:loaded). Reset here so a loaded Adventure
    // save cannot inherit a live Survival run and suppress campaign autosaves forever.
    this._unsubs.push(this.bus.on('save:restoring', () => this._onSaveLifecycle()));
    this._unsubs.push(this.bus.on('save:loaded', () => this._onSaveLifecycle()));
  },

  destroy() {
    for (const off of this._unsubs || []) if (typeof off === 'function') off();
    this._unsubs = [];
  },

  // Sanctioned reset entry (not a bus handler): repair a present-but-malformed/null run;
  // no-op when the run key is absent entirely so legacy trees stay untouched.
  newGame() {
    if (!this._hasRunField()) return;
    this.state.run = createRunState();
  },

  begin(request) {
    const run = this._liveRun();
    if (!run || run.phase !== 'inactive') return;
    const kind = request && request.kind != null ? request.kind : 'adventure';
    const ruleset = request && request.ruleset != null ? request.ruleset : null;
    const seed = request && request.seed;
    const next = createRunState({ kind, ruleset, seed });
    next.phase = 'loadout';
    if (request && request.arenaId != null) next.arenaId = request.arenaId;
    // SWARM-04: a checkpoint start. The phase machine plans `run.wave + 1`, so the run's
    // counter parks on the wave BEFORE the bought entry point — a start at Round 11 means
    // wave sits at 10 until the first plan lands. Swarm only: the arc, the block and the
    // circuit always open at their authored first wave.
    const startWave = Number.isInteger(request && request.startWave) ? request.startWave : 0;
    const zeroScrapOpening = kind === 'survival' && isSwarmRuleset(ruleset)
      && request?.zeroScrapOpening === true && startWave <= 1 && request.openArmoryBeforeRound1 !== false
      && !request.practice && !request.dailyDateKey && !request.weeklyMutatorId && request.ghostHash == null;
    if (isSwarmRuleset(ruleset) && startWave > 1) {
      next.wave = startWave - 1;
      if (!next.telemetry || typeof next.telemetry !== 'object') next.telemetry = {};
      next.telemetry.startWave = startWave;
    }
    // SAVE-AND-SOAK-1 Part B: an interrupted run's round-start record rides the begin request
    // as `resume`. The envelope is still created by createRunState; the record's wallet, build,
    // pilot and mutator list restore on top, so the commit below — and every later owner read —
    // sees an ordinary valid run. The resumed wave is the record's own start boundary
    // (run.wave at the draft that opened the round), never a mid-fight position.
    const resume = request && request.resume && typeof request.resume === 'object'
      ? request.resume : null;
    let resumePilot = null;
    if (resume && next.kind === 'survival' && isSwarmRuleset(ruleset)) {
      const rr = resume.run && typeof resume.run === 'object' ? resume.run : null;
      if (rr) {
        if (Number.isInteger(rr.wave) && rr.wave >= 0) {
          next.wave = rr.wave;
          next.telemetry.startWave = rr.wave + 1;
        }
        for (const key of ['block', 'act', 'xp', 'score', 'credits']) {
          if (Number.isInteger(rr[key]) && rr[key] >= 0) next[key] = rr[key];
        }
        if (Number.isInteger(rr.level) && rr.level >= 1) next.level = rr.level;
        for (const key of ['modifiers', 'draftHistory', 'shopHistory', 'arenaMutators']) {
          if (Array.isArray(rr[key])) next[key] = rr[key];
        }
        if (rr.pilot && typeof rr.pilot === 'object' && !Array.isArray(rr.pilot)) {
          // Applied after createPilotProgress() stamps below — the tree's own record first,
          // the interrupted one on top.
          resumePilot = {
            points: rr.pilot.points && typeof rr.pilot.points === 'object' ? { ...rr.pilot.points } : {},
            nodes: Array.isArray(rr.pilot.nodes) ? rr.pilot.nodes.slice() : [],
            banked: Number.isInteger(rr.pilot.banked) && rr.pilot.banked > 0 ? rr.pilot.banked : 0,
            offer: null,
          };
        }
        if (rr.style && typeof rr.style === 'object' && !Array.isArray(rr.style)) {
          const style = cloneRun(rr.style);
          if (style && Number.isFinite(style.multiplier)) next.style = style;
        }
        if (typeof rr.buildCode === 'string') next.buildCode = rr.buildCode;
        // The record's telemetry is the run's own contract — stake, threats, hangar stamp,
        // bank ordinal — restored wholesale, then re-anchored to today's profile hangar so a
        // stale stamp can never outlive a profile change.
        if (rr.telemetry && typeof rr.telemetry === 'object' && !Array.isArray(rr.telemetry)) {
          const hangar = next.telemetry.hangar;
          next.telemetry = { ...cloneRun(rr.telemetry), hangar };
          next.telemetry.startWave = (Number.isInteger(rr.wave) && rr.wave >= 0 ? rr.wave : startWave - 1) + 1;
        }
      }
    }
    // The swarm stake rides telemetry (schema-free, run-lifelong, never serialized): the wave
    // planner reads it to scale pressure, and the results surface reads it to say what the
    // run cost. Absent means the tuned baseline — the door only sends it for swarm runs.
    if (request && typeof request.swarmStake === 'string') {
      next.telemetry.swarmStake = normalizeSwarmStake(request.swarmStake);
    }
    // S4 one-press Swarm: the quick-start's opt-out of the opening armory rides the begin
    // request like the stake — schema-free, run-lifelong. The phase machine reads it once at
    // the opening and enters round 1 in flight; absent means the armory opens as authored.
    if (isSwarmRuleset(ruleset) && request && request.openArmoryBeforeRound1 === false) {
      if (!next.telemetry || typeof next.telemetry !== 'object') next.telemetry = {};
      next.telemetry.openArmoryBeforeRound1 = false;
    }
    // OVH-01a: every run that can level — anything but Adventure — carries its own Pilot Tree
    // record (06 §2). Adventure and inactive envelopes stay pilot-free by contract; nothing
    // earned in a run outlives the run.
    if (next.kind !== 'adventure') next.pilot = createPilotProgress();
    if (resumePilot) next.pilot = resumePilot;
    if (next.kind === 'survival') {
      // A resume keeps the interrupted run's own practice flag — the door's payload may not name it.
      next.practice = request?.practice === true
        || (resume != null && resume.run != null && resume.run.practice === true);
      this._retireSerial = (this._retireSerial || 0) + 1;
      next.retireToken = this._retireSerial;
      if (!next.telemetry || typeof next.telemetry !== 'object') next.telemetry = {};
      const dateKey = request?.dailyDateKey;
      if (isUtcDateKey(dateKey) && dailySeedForDateKey(dateKey) === next.seed) next.telemetry.dailyDateKey = dateKey;
      const weeklyMutatorId = request?.weeklyMutatorId;
      if (CRUCIBLE_WEEKLY_ROTATION.includes(weeklyMutatorId)) next.arenaMutators = [weeklyMutatorId];
      const ghostHash = request?.ghostHash;
      if (Number.isInteger(ghostHash) && ghostHash >= 0 && ghostHash <= 0xffffffff) next.telemetry.ghostHash = ghostHash;
      const profile = loadCrucibleMeta();
      // NOTHING CARRIES POWER INTO A RUN (04_SWARM.md §9, release list 2026-11-19): the Hangar's
      // ranks (plating, shield, war chest, broker, re-rolls, magnet) no longer reach the run; only the
      // hulls it unlocked do. Every run reads this stamp, so ranks: {} is the one switch.
      next.telemetry.hangar = { ...migrateHangar(profile && profile.hangar), ranks: {} };
      // SWARM-06: the Threat wager and the perk loadout ride telemetry the same way the stake
      // does — schema-free, run-lifelong, never serialized. Threats normalize against the
      // catalog so a door or a hand-rolled request can never name a wager that does not exist.
      // Perks come off the profile's stored pick (a request may override it — sandbox drives
      // and tests slot honestly), earned-checked against the same derived earns the door read.
      if (isSwarmRuleset(ruleset)) {
        if (zeroScrapOpening) next.telemetry.zeroScrapOpening = true;
        next.telemetry.swarmBankOrdinal = nextSwarmBankOrdinal(next.telemetry.hangar);
        const threats = normalizeThreatIds(request && request.threats)
          .filter(id => !zeroScrapOpening || id !== 'thin_purse');
        if (threats.length) next.telemetry.threats = threats;
        const earned = crucibleEarnedPerkIds(profile);
        const pick = request && Array.isArray(request.perks) ? request.perks
          : (profile && profile.perks && profile.perks.loadout);
        const perks = normalizePerkLoadout(pick, earned);
        // Perks gave stats (triple bounty, free re-rolls, cooked-off bodies...): nothing carries
        // power into a run (director 2026-11-20 - stars unlock options, never stats). The earned
        // pick stays on the profile; it no longer reaches the run.
        if (perks.length && SWARM_PERKS_REACH_RUN) next.telemetry.perks = perks;
      }
    }
    const committed = this._commitRun(next, 'run:started', {
      schemaVersion: next.schemaVersion,
      kind: next.kind,
      ruleset: next.ruleset,
      seed: next.seed,
      phase: next.phase,
      openingLesson: request && request.openingLesson === true,
    });
    // The war chest pays the run wallet only. A stake or anything else that already funded
    // this run keeps the purse; adventure credits are never touched.
    if (!committed || next.kind !== 'survival' || zeroScrapOpening) return;
    const live = this._liveRun();
    if (!live || live.credits !== 0) return;
    const hangar = (live.telemetry && live.telemetry.hangar) || next.telemetry.hangar;
    const bonus = purseBonusFor(hangar);
    if (bonus > 0) this.award({ credits: bonus, reason: 'hangar_war_chest' });
  },

  transition(request) {
    const run = this._liveRun();
    if (!run) return;
    const expectedPhase = request && request.expectedPhase;
    const nextPhase = request && request.nextPhase;
    if (run.phase !== expectedPhase) return;
    if (!canTransition(run.phase, nextPhase)) return;
    const previousPhase = run.phase;
    const next = cloneRun(run);
    if (!next) return;
    next.phase = nextPhase;
    this._commitRun(next, 'run:transitioned', {
      previousPhase,
      phase: next.phase,
      reason: request && request.reason != null ? request.reason : null,
      tick: request && request.tick != null ? request.tick : 0,
    });
  },

  retire(request) {
    const run = this._liveRun();
    if (!run || run.kind !== 'survival' || run.phase === 'inactive'
      || run.phase === 'ended' || run.phase === 'victory'
      || !Number.isSafeInteger(request?.token) || request.token !== run.retireToken) return false;
    this.end({ outcome: 'aborted', reason: 'player_retired', tick: this.state?.tick });
    return this.state.run?.result?.reason === 'player_retired';
  },

  end(request) {
    const run = this._liveRun();
    if (!run) return;
    if (run.phase === 'victory' || run.phase === 'ended') return;
    const outcome = request && request.outcome;
    if (!OUTCOME_SET.has(outcome)) return;
    const reason = toReason(request && request.reason);
    const tick = toFiniteInt(request && request.tick, 0);
    const phase = outcome === 'victory' ? 'victory' : 'ended';
    if (!canTransition(run.phase, phase)) return;
    const next = cloneRun(run);
    if (!next) return;
    next.phase = phase;
    next.result = { outcome, reason, tick };
    this._commitRun(next, 'run:ended', {
      outcome,
      reason,
      seed: next.seed,
      phase: next.phase,
    });
  },

  // Run wallet + XP (CRU-014). This is the RUN economy and nothing else: it never emits
  // economy:grantCredits / economy:chargeCredits, never reads or writes state.player.credits,
  // and dies with the run. A negative amount is rejected rather than clamped so a bad caller
  // shows up as a missing award instead of a silent drain.
  award(request) {
    const run = this._liveRun();
    if (!run) return false;
    if (run.kind === 'adventure') return false;
    if (run.phase === 'inactive') return false;
    const credits = toNonNegativeInt(request && request.credits);
    const xp = toNonNegativeInt(request && request.xp);
    const reason = toReason(request && request.reason);
    // A quiet Crucible wave has not been played. Seed 4242 idle paid +202 at sim
    // 41.1, in the same sample gap as the second pre-input death's resolve,
    // before any flight input. Credits and XP still settle; the score line
    // stays 0 until this wave's pilot acts. Outside live Swarm and Gauntlet rounds, the
    // existing score admission is unchanged.
    let scorePoints = toNonNegativeInt(request && request.score);
    if (scorePoints > 0 && !swarmPilotHasActed(this.state)) scorePoints = 0;
    const score = Math.round(scorePoints * swarmScoreScale(run));
    if (credits === 0 && xp === 0 && score === 0) return false;
    const next = cloneRun(run);
    if (!next) return false;
    next.credits += credits;
    if (credits > 0 && isSwarmRuleset(run.ruleset)) {
      const refunds = runLifetime(run)?.creditRefunds;
      const debit = refunds?.get(reason);
      const reversingDebit = debit?.amount === credits && debit.tick === this.state.tick;
      if (reversingDebit) refunds.delete(reason);
      const restricted = reversingDebit ? debit.restricted
        : (runOnlyAward(reason) || REFUND_REASONS.has(reason) ? credits : 0);
      if (restricted > 0) {
        next.telemetry ??= {};
        next.telemetry.nonBankableCredits = nonBankableRunCredits(run) + restricted;
      }
    }
    next.xp += xp;
    next.score += score;
    const previousLevel = next.level;
    next.level = runLevelForXp(next.xp);
    // OVH-01a (04 §3): every level past the first banks one Pilot Tree pick. The banking rides
    // the same committed clone as the XP, so a refused commit can never orphan a pick; adventure
    // never reaches here (refused above), and a hand-built run without a pilot record gets one
    // rather than silently dropping the banked pick.
    const levelsGained = next.level > previousLevel ? next.level - previousLevel : 0;
    // A level-up banks a pick only while the tree still holds one to give: never more banked
    // picks than cards left to take (a promise of a pick that never comes is worse than none).
    let picksBanked = 0;
    if (levelsGained > 0) {
      next.pilot ??= createPilotProgress();
      const room = Math.max(0, pilotPicksRemaining(next.pilot, pilotDoorForRun(next)) - next.pilot.banked);
      picksBanked = Math.min(levelsGained, room);
      next.pilot.banked += picksBanked;
    }
    const committed = this._commitRun(next, 'run:awarded', {
      credits, xp, score,
      totalCredits: next.credits,
      totalXp: next.xp,
      totalScore: next.score,
      level: next.level,
      previousLevel,
      reason,
      wave: Number.isInteger(request && request.wave) ? request.wave : null,
      bankActs: toBankActs(request && request.bankActs),
      causePhrase: toCausePhrase(request && request.causePhrase),
    });
    if (committed && picksBanked > 0) {
      this._emit('run:levelUp', { level: next.level, previousLevel, xp: next.xp, banked: next.pilot.banked });
      // One level-up beat for both doors (the effects lead draws it on the ship).
      this._emit('pilot:levelUp', {
        door: 'swarm', level: next.level, previousLevel, banked: next.pilot.banked, entityId: this.state.playerId,
      });
      // OVH-01a2: the owner deals at a fixed moment — right after a level-up commit that banked
      // a pick, when no offer is open. The moment (and the state.rng it consumes) is the same
      // whatever the player's display settings are; the screen never draws.
      this._dealPilotHand();
    }
    return committed;
  },

  /** Spend from the run wallet. Refuses rather than going negative; the caller reads the result. */
  spend(request) {
    const run = this._liveRun();
    if (!run) return false;
    if (run.kind === 'adventure') return false;
    const amount = toNonNegativeInt(request && request.credits);
    if (amount <= 0) return false;
    const reason = toReason(request && request.reason);
    const earnedOnly = reason === 'partial_bank';
    const available = earnedOnly ? bankableRunCredits(run) : run.credits;
    if (available < amount) {
      this._emit('run:spendRejected', {
        credits: amount,
        available,
        reason,
      });
      return false;
    }
    const next = cloneRun(run);
    if (!next) return false;
    const restricted = debitCredits(next, amount, earnedOnly);
    const refundReason = REFUND_FOR_SPEND.get(reason);
    const lifetime = isSwarmRuleset(run.ruleset) ? runLifetime(run) : null;
    // Known refunds occur inside the spend notification or immediately after it returns.
    // The matching charge belongs to this live run and can be reversed once.
    const refunds = refundReason && lifetime ? (lifetime.creditRefunds ??= new Map()) : null;
    const debit = refunds ? { amount, restricted, tick: this.state.tick } : null;
    if (refunds) refunds.set(refundReason, debit);
    const committed = this._commitRun(next, 'run:spent', {
      credits: amount,
      totalCredits: next.credits,
      reason,
    });
    if (!committed && refunds?.get(refundReason) === debit) refunds.delete(refundReason);
    return committed;
  },

  /**
   * Commit a run-wallet purchase only when its authoritative world commit succeeds.
   * The callback is local to the sim owner; UI/worker commands carry data only. The callback may
   * return { ok: true, rollback } after creating the purchased object. A failed/reentrant commit
   * invokes rollback before returning and never publishes a debit.
   */
  purchase(request, commitWorld) {
    const run = this._liveRun();
    const receipt = (accepted, reason, credits = 0, totalCredits = run?.credits ?? 0) => Object.freeze({
      requestId: request && request.requestId,
      deviceId: request && typeof request.deviceId === 'string' ? request.deviceId : null,
      socketId: request && typeof request.socketId === 'string' ? request.socketId : null,
      accepted,
      reason,
      credits,
      totalCredits,
    });
    if (!run || run.kind !== 'survival' || !isSwarmRuleset(run.ruleset)) return receipt(false, 'phase_closed');
    const requestId = request && request.requestId;
    if (!Number.isSafeInteger(requestId) || requestId < 1) return receipt(false, 'invalid_request');
    const lifetime = runLifetime(run);
    if (!lifetime) return receipt(false, 'run_lifetime_missing');
    let ledger = lifetime.runPurchases;
    if (!ledger) {
      ledger = { highWatermark: 0, receipts: new Map(), committing: false };
      lifetime.runPurchases = ledger;
    }
    if (ledger.receipts.has(requestId)) return ledger.receipts.get(requestId);
    if (ledger.committing) return receipt(false, 'purchase_in_progress');
    if (requestId <= ledger.highWatermark) return receipt(false, 'stale_request');
    if (!['draft', 'refit'].includes(run.phase)) return receipt(false, 'phase_closed');
    const amount = toNonNegativeInt(request && request.credits);
    if (amount <= 0 || typeof commitWorld !== 'function') return receipt(false, 'invalid_purchase');
    ledger.highWatermark = requestId;
    if (run.credits < amount) {
      const rejected = receipt(false, 'insufficient_funds');
      rememberPurchaseReceipt(ledger, rejected);
      this._emit('run:purchaseResolved', rejected);
      return rejected;
    }

    ledger.committing = true;
    let worldCommit = null;
    let reason = 'world_commit_refused';
    try {
      worldCommit = commitWorld();
      if (!worldCommit || worldCommit.ok !== true) {
        reason = worldCommit && typeof worldCommit.reason === 'string' ? worldCommit.reason : reason;
        safeRollback(worldCommit);
        return cachePurchaseResult(this, ledger, receipt(false, reason));
      }
      // Spawn listeners run synchronously. They can end/replace the run or re-enter this API;
      // publish no debit unless the exact wallet record and lifecycle survived the callback.
      if (this.state.run !== run || runLifetime(this.state.run) !== lifetime
        || run.credits < amount || !['draft', 'refit'].includes(run.phase)) {
        reason = 'run_changed_during_purchase';
        safeRollback(worldCommit);
        return cachePurchaseResult(this, ledger, receipt(false, reason));
      }
      const next = cloneRun(run);
      if (!next) {
        reason = 'run_clone_failed';
        safeRollback(worldCommit);
        return cachePurchaseResult(this, ledger, receipt(false, reason));
      }
      debitCredits(next, amount);
      if (!this._commitRun(next, 'run:spent', {
        credits: amount,
        totalCredits: next.credits,
        reason: toReason(request && request.reason) || 'swarm_fortify',
        requestId,
      })) {
        reason = 'wallet_commit_failed';
        safeRollback(worldCommit);
        return cachePurchaseResult(this, ledger, receipt(false, reason));
      }
      const accepted = receipt(true, null, amount, next.credits);
      rememberPurchaseReceipt(ledger, accepted);
      this._emit('run:purchaseResolved', accepted);
      return accepted;
    } catch {
      safeRollback(worldCommit);
      return cachePurchaseResult(this, ledger, receipt(false, 'world_commit_failed'));
    } finally {
      ledger.committing = false;
    }
  },

  purchaseReceipt(requestId) {
    const run = this._liveRun();
    if (!run || run.kind !== 'survival' || !isSwarmRuleset(run.ruleset)
      || !Number.isSafeInteger(requestId) || requestId < 1) return null;
    const ledger = runLifetime(run)?.runPurchases;
    return ledger && ledger.receipts instanceof Map ? ledger.receipts.get(requestId) || null : null;
  },

  /**
   * Publish this wave's body count so a HUD can say "4 of 6 left" without reaching into the wave
   * owner's private cohort map.
   *
   * NOTE ON NAMING: `threatBudget` here is the number of BODIES the current wave plan will
   * materialize — not the recipe's abstract `threatBudget` difficulty figure in
   * src/data/survivalWaves.js, which never reaches state.run. The player-facing question is
   * "how many are left", so bodies is what this counts.
   */
  setThreat(request) {
    const run = this._liveRun();
    if (!run) return false;
    if (run.kind === 'adventure') return false;
    const next = cloneRun(run);
    if (!next) return false;
    let changed = false;
    for (const key of ['threatBudget', 'spawnedThreat', 'resolvedThreat']) {
      if (!request || !Number.isFinite(request[key])) continue;
      const value = toNonNegativeInt(request[key]);
      if (next[key] === value) continue;
      next[key] = value;
      changed = true;
    }
    if (!changed) return false;
    // No bus receipt: this is a per-wave counter a readout polls, not an event anyone acts on.
    // Emitting here would put a bus message on the same beat as every spawn and every death.
    const previous = this.state.run;
    RUN_LIFETIMES.set(next, runLifetime(previous) || {});
    this.state.run = next;
    if (!validateRunState(next).ok) {
      this.state.run = previous;
      return false;
    }
    return true;
  },

  /**
   * Append one immutable draft/refit record (CRU-016). This is the ONLY place a run modifier is
   * stored: the record is a note about what the player chose, never a live stat patch and never a
   * write into player.ownedShips[].fittings.
   */
  recordModifier(request) {
    const run = this._liveRun();
    if (!run) return false;
    if (run.kind === 'adventure') return false;
    const record = request && request.record;
    if (!record || typeof record !== 'object' || Array.isArray(record)) return false;
    const next = cloneRun(run);
    if (!next) return false;
    const frozen = cloneRun(record);
    if (!frozen) return false;
    next.modifiers.push(frozen);
    if (request.draft && typeof request.draft === 'object' && !Array.isArray(request.draft)) {
      const draft = cloneRun(request.draft);
      if (draft) next.draftHistory.push(draft);
    }
    return this._commitRun(next, 'run:modifierRecorded', {
      record: frozen,
      wave: Number.isInteger(request.wave) ? request.wave : null,
      modifierCount: next.modifiers.length,
    });
  },

  // OVH-01a/01a2 — the Pilot Tree engine (design/overhaul/06 §2, 04 §3). Level-ups bank picks in
  // award(); the owner deals the hands at fixed moments (_dealPilotHand) and the screen asks
  // through intents (run:pilotCardRequested / run:pilotRerollRequested above). All randomness is
  // state.rng at owner-owned moments, so one seed always deals the same hands whatever the
  // player's display settings are, and every mutation walks the same clone-validate-commit
  // discipline as the rest of the run. Free-function wrappers with the packet's signatures live
  // at the module foot.

  /**
   * The owner's deal primitive: draw cards and publish run.pilot.offer. An empty draw opens NO
   * offer (OVH-01a2 step 2) — nothing eligible leaves the offer untouched (null after a fresh
   * deal moment) and the pick stays banked for the next moment to try again. Returns the card
   * ids, [] when nothing is eligible, or null when refused outright.
   */
  drawPilotOffer(state = this.state) {
    if (state !== this.state) return null;
    const run = this._pilotRun(state);
    if (!run) return null;
    const cards = this._drawPilotCards(state, run);
    if (!cards || cards.length === 0) return cards || null;
    const next = cloneRun(run);
    if (!next) return null;
    next.pilot.offer = { cards, rerolls: 0 };
    const committed = this._commitRun(next, 'run:pilotOffered', {
      cards,
      banked: next.pilot.banked,
    });
    return committed ? cards : null;
  },

  /** Apply offer card `index`: the node joins the run, its branch gains the point, banked − 1. */
  choosePilotCard(state = this.state, index) {
    if (state !== this.state) return false;
    const run = this._pilotRun(state);
    if (!run) return false;
    if (!run.pilot.offer) {
      this._emit('run:pilotCardRejected', { index, reason: 'no_offer' });
      return false;
    }
    const cards = run.pilot.offer.cards;
    if (!Array.isArray(cards) || !Number.isInteger(index) || index < 0 || index >= cards.length) {
      this._emit('run:pilotCardRejected', { index, reason: 'invalid_index' });
      return false;
    }
    const card = getPilotCard(cards[index]);
    // The offer may be stale — a bend taken mid-offer locks its siblings, and the live set may
    // have changed under a frozen hand — so the choose re-runs the same pure eligibility gate
    // the draw used rather than trusting the drawn list.
    if (!card || !isPilotCardEligible(card, run.pilot, pilotDoorForRun(run))) {
      this._emit('run:pilotCardRejected', { index, nodeId: cards[index], reason: 'not_eligible' });
      return false;
    }
    const next = cloneRun(run);
    if (!next) return false;
    next.pilot.nodes.push(card.id);
    if (card.kind !== 'evolution') {
      next.pilot.points[card.branch] = (next.pilot.points[card.branch] || 0) + 1;
    }
    next.pilot.banked = Math.max(0, next.pilot.banked - 1);
    next.pilot.offer = null;
    const committed = this._commitRun(next, 'run:pilotCardChosen', {
      nodeId: card.id,
      branch: card.kind === 'evolution' ? null : card.branch,
      banked: next.pilot.banked,
    });
    if (committed) this._emitNodeTaken('swarm', card);
    // OVH-01a2: a second banked pick gets a fresh hand the moment this choice commits.
    if (committed && next.pilot.banked > 0) this._dealPilotHand();
    return committed;
  },

  /** Pay Scrap from the run purse and redraw the current offer (04 §3: re-roll costs Scrap). */
  rerollPilotOffer(state = this.state) {
    if (state !== this.state) return false;
    const run = this._pilotRun(state);
    if (!run) return false;
    if (!run.pilot.offer) {
      this._emit('run:pilotRerollRejected', { reason: 'no_offer' });
      return false;
    }
    // Nothing eligible anywhere means the redraw cannot produce a card; refuse without charging.
    if (eligiblePilotCards(run.pilot, pilotDoorForRun(run)).length === 0) {
      this._emit('run:pilotRerollRejected', { reason: 'nothing_eligible' });
      return false;
    }
    if (!this.spend({ credits: PILOT_REROLL_SCRAP, reason: 'pilot_reroll' })) {
      // spend() already said why (run:spendRejected); this receipt names the pilot intent.
      const live = this._liveRun();
      this._emit('run:pilotRerollRejected', {
        reason: 'insufficient_credits',
        price: PILOT_REROLL_SCRAP,
        credits: live ? live.credits : 0,
      });
      return false;
    }
    // spend() published a fresh run object; redraw against the live one.
    const live = this._pilotRun(this.state);
    if (!live) return false;
    const cards = this._drawPilotCards(this.state, live);
    if (cards === null) return false;
    const next = cloneRun(live);
    if (!next) return false;
    const rerolls = (live.pilot.offer && live.pilot.offer.rerolls || 0) + 1;
    next.pilot.offer = { cards, rerolls };
    const committed = this._commitRun(next, 'run:pilotOfferRerolled', {
      cards,
      rerolls,
      credits: PILOT_REROLL_SCRAP,
      totalCredits: next.credits,
    });
    return committed;
  },

  _emitNodeTaken(door, card) {
    this._emit('pilot:nodeTaken', {
      door,
      nodeId: card.id,
      name: card.name,
      branch: card.kind === 'evolution' ? null : card.branch,
      kind: card.kind === 'evolution' ? 'evolution' : card.tier === 'capstone' ? 'capstone' : 'node',
      entityId: this.state ? this.state.playerId : null,
    });
  },

  // ── Adventure's Pilot Tree (progression lead 2026-11-20) ───────────────────────────────────
  // The saved record lives on state.player.pilot. Nothing here draws from state.rng: Adventure
  // chooses from the full tree by node id, so no deal moment exists.

  /** True when Adventure owns the pilot right now (no Swarm or lab run is live). */
  _adventureDoorOpen() {
    const state = this.state;
    if (!state || !state.player) return false;
    const run = state.run;
    return !(run && run.kind && run.kind !== 'adventure' && run.phase && run.phase !== 'inactive');
  },

  /** XP from the world's sources; banks a point per level and announces the level-up beat. */
  awardAdventureXp(request) {
    if (!this._adventureDoorOpen()) return false;
    const xp = Math.min(ADVENTURE_XP_AWARD_CAP, toNonNegativeInt(request && request.xp));
    if (xp <= 0) return false;
    const before = normalizeAdventurePilot(this.state.player.pilot);
    const next = normalizeAdventurePilot({ ...before, xp: before.xp + xp });
    this.state.player.pilot = next;
    this._emit('pilot:xpAwarded', {
      xp,
      totalXp: next.xp,
      level: next.level,
      source: typeof request.source === 'string' ? request.source : null,
      label: typeof request.label === 'string' ? request.label : null,
    });
    if (next.level > before.level) {
      this._emit('pilot:levelUp', {
        door: 'adventure',
        level: next.level,
        previousLevel: before.level,
        banked: next.banked,
        entityId: this.state.playerId,
      });
      // The beat in words: it never opens anything over the fight; the point waits on the tree.
      this._emit('toast', {
        text: `Level ${next.level}: ${next.banked === 1 ? 'a point' : next.banked + ' points'} to spend in the Pilot Tree (T)`,
        kind: 'good',
        ttl: 4,
      });
    }
    return true;
  },

  /** Spend a banked point on any open node of the full tree (Adventure chooses by id). */
  takeAdventureNode(nodeId) {
    if (!this._adventureDoorOpen()) return false;
    const pilot = normalizeAdventurePilot(this.state.player.pilot);
    const card = getPilotCard(nodeId);
    if (pilot.banked <= 0) {
      this._emit('pilot:nodeRejected', { nodeId, reason: 'no_points' });
      return false;
    }
    if (!card || !isPilotCardEligible(card, pilot, 'adventure')) {
      this._emit('pilot:nodeRejected', { nodeId, reason: 'not_open' });
      return false;
    }
    pilot.nodes.push(card.id);
    if (card.kind !== 'evolution') pilot.points[card.branch] = (pilot.points[card.branch] || 0) + 1;
    this.state.player.pilot = normalizeAdventurePilot(pilot);
    this._emitNodeTaken('adventure', card);
    return true;
  },

  /** Hand every point back for a fee, docked at a station. The economy takes the credits. */
  respecAdventurePilot() {
    if (!this._adventureDoorOpen()) return false;
    const state = this.state;
    const docked = !!((state.player.flags && state.player.flags.docked) || (state.ui && state.ui.docked));
    const pilot = normalizeAdventurePilot(state.player.pilot);
    if (!docked) { this._emit('pilot:respecRejected', { reason: 'not_docked' }); return false; }
    if (pilot.nodes.length <= (pilot.granted || []).length) { this._emit('pilot:respecRejected', { reason: 'nothing_to_refund' }); return false; }
    const fee = adventureRespecFee(pilot);
    const credits = Math.round(Number(state.player.credits) || 0);
    let applied = false;
    const req = {
      amount: fee, reason: 'pilot_respec', requireFull: true, expectedCredits: credits,
      commit: () => {
        // Free (granted) skills stay: they were never the pilot's points to refund.
        const kept = pilot.granted || [];
        const keptPoints = {};
        for (const id of kept) { const c = getPilotCard(id); if (c && c.branch) keptPoints[c.branch] = (keptPoints[c.branch] || 0) + 1; }
        state.player.pilot = normalizeAdventurePilot({ ...pilot, points: keptPoints, nodes: kept.slice(), granted: kept.slice(), respecs: pilot.respecs + 1 });
        applied = true;
        return true;
      },
      result: false,
    };
    // The economy is the credits writer: the exact-charge request runs our commit only when the
    // full fee is there.
    if (this.bus) this.bus.emit('economy:chargeCredits', req);
    if (req.result !== true || !applied) {
      if (applied) state.player.pilot = pilot; // never refund without the fee
      this._emit('pilot:respecRejected', { reason: 'insufficient_credits', fee, credits });
      return false;
    }
    this._emit('pilot:respecced', { fee, refunded: pilot.level - 1 });
    return true;
  },

  /** A live, pilot-bearing run object, or null. Adventure and terminal runs never qualify. */
  _pilotRun(state) {
    if (!state) return null;
    const run = state.run;
    if (!run || typeof run !== 'object' || run.kind === 'adventure') return null;
    if (run.phase === 'inactive' || run.phase === 'ended' || run.phase === 'victory') return null;
    if (!run.pilot || typeof run.pilot !== 'object' || Array.isArray(run.pilot)) return null;
    if (!validateRunStateForTick(run, state.tick).ok) return null;
    return run;
  },

  /**
   * The 04 §3 draw: one card from the deepest branch (commitment always pays), one from an
   * untouched branch (a pivot is always possible), then weighted fills toward what combines.
   * Fewer than three come back when eligibility runs short; [] when nothing is eligible; null
   * only when the state carries no seeded rng stream (deterministic runs draw deterministically
   * or not at all).
   */
  _drawPilotCards(state, run) {
    const rng = state && typeof state.rng === 'function' ? state.rng : null;
    if (!rng) return null;
    const pilot = run.pilot;
    const door = pilotDoorForRun(run);
    const eligible = eligiblePilotCards(pilot, door);
    if (eligible.length === 0) return [];
    const pickedIds = [];
    const drawFrom = (pool) => {
      if (pool.length === 0) return;
      pickedIds.push(pool[Math.floor(rng() * pool.length)].id);
    };
    const deepest = deepestPilotBranch(pilot, door);
    if (deepest) drawFrom(eligible.filter((card) => card.branch === deepest));
    const untouched = new Set(untouchedPilotBranches(pilot, door));
    drawFrom(eligible.filter((card) => card.branch && untouched.has(card.branch)
      && !pickedIds.includes(card.id)));
    while (pickedIds.length < 3) {
      const rest = eligible.filter((card) => !pickedIds.includes(card.id));
      if (rest.length === 0) break;
      const total = rest.reduce((sum, card) => sum + pilotCardWeight(card, pilot), 0);
      let roll = rng() * total;
      let choice = rest[rest.length - 1];
      for (const card of rest) {
        roll -= pilotCardWeight(card, pilot);
        if (roll < 0) { choice = card; break; }
      }
      pickedIds.push(choice.id);
    }
    return pickedIds;
  },

  /**
   * OVH-01a2 — the fixed deal moments. Called right after a level-up commit that banked a pick
   * and right after a choose commits while picks still wait: deals a fresh hand only when no
   * offer is open and a pick is banked. An empty draw (nothing eligible, or nothing live) opens
   * no offer and keeps the pick banked — the next deal moment tries again. Nothing outside the
   * owner deals; a display preference can never change when (or from which state.rng draws) a
   * hand is dealt.
   */
  _dealPilotHand() {
    const run = this._pilotRun(this.state);
    if (!run || run.pilot.offer || run.pilot.banked <= 0) return false;
    const cards = this._drawPilotCards(this.state, run);
    if (!cards || cards.length === 0) return false;
    const next = cloneRun(run);
    if (!next) return false;
    next.pilot.offer = { cards, rerolls: 0 };
    return this._commitRun(next, 'run:pilotOffered', {
      cards,
      banked: next.pilot.banked,
    });
  },

  _onExitToMenu(payload) {
    const run = this._liveRun();
    if (!run) return;
    if (run.kind !== 'adventure' && run.phase !== 'inactive') {
      const tick = this.state && Number.isFinite(this.state.tick) ? this.state.tick : 0;
      this.end({
        outcome: 'aborted',
        reason: payload && payload.source != null ? payload.source : 'exit_to_menu',
        tick,
      });
    }
    this.state.run = createRunState();
  },

  _onSaveLifecycle() {
    if (!this.state) return;
    this.state.run = createRunState();
  },

  _commitRun(next, event, payload) {
    const previous = this.state.run;
    RUN_LIFETIMES.set(next, event === 'run:started' ? {} : runLifetime(previous) || {});
    this.state.run = next;
    if (!validateRunState(next).ok) {
      this.state.run = previous;
      return false;
    }
    this._emit(event, payload);
    return true;
  },

  _emit(event, payload) {
    if (this.bus && typeof this.bus.emit === 'function') this.bus.emit(event, payload);
  },

  _hasRunField() {
    return !!(this.state && Object.prototype.hasOwnProperty.call(this.state, 'run'));
  },

  _liveRun() {
    if (!this.state) return null;
    const run = this.state.run;
    if (!run || typeof run !== 'object') return null;
    if (!validateRunStateForTick(run, this.state.tick).ok) return null;
    return run;
  },
};

// OVH-01a free-function API with the packet's signatures. The run owner must be initialized on
// the same state (single writer): a foreign or uninitialized state is refused — null/false —
// rather than mutated blind. OVH-01a2: these are owner seams — the run itself deals at its fixed
// moments and the screen asks through the run:pilot*Requested intents; nothing outside the owner
// (and its tests) calls drawPilotOffer.
export function drawPilotOffer(state) {
  return runSession.drawPilotOffer(state);
}

export function choosePilotCard(state, index) {
  return runSession.choosePilotCard(state, index);
}

export function rerollPilotOffer(state) {
  return runSession.rerollPilotOffer(state);
}
