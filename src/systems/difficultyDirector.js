// difficultyDirector.js — the pacing director. Reads live player state (protection pool, credits
// trend, recent damage taken, defeat streak) and modulates the pressure the world already exerts
// by tuning values systems already read — it never spawns anything.
//
//   * Published stance (the inspectable field): `state.difficulty.pacing` —
//     { stance, pressureMult, opportunityMult, sinceT, stress, ease }.
//     'recovery'  — the player is spiraling: incoming damage eases toward a bounded floor.
//     'steady'    — neutral water: both scales at 1.
//     'surge'     — the player is cruising: outgoing damage opens (more kills/hour ⇒ more loot).
//   * Read seam: data/difficulty.js pacingScale() folds the published mults into
//     difficultyDamageScale, which combat already calls on every damage packet involving the
//     player. The clamps live there — incoming can never hit zero, outgoing can never drop
//     below 1, so pacing can never zero the pressure or make a fight unwinnable.
//   * Pin release (director-driven disengagement): when one attacker has been the dominant
//     damage source on the player for a sustained engagement AND the player is not resolving it
//     (won't fight back, or implied time-to-kill is hopeless), the director stamps
//     `ai.forceFlee` — the same flag wingMorale/aceMemory use — for a bounded hold. The
//     doctrine layer already reads it every decision tick, so the harasser breaks off through
//     the ordinary flee machinery and combatOutcome records a 'fled' resolution.
//   * Exemptions mirror the encounter lane's mercy watch: authored duels (bosses, named aces,
//     encounter-owned squads) and lawful pressure on a wanted player are never touched.
//   * Determinism: pure function of state + bus events; stance transitions derive from
//     state.simTime only. No rng draws, no wall time. Transient by design — nothing to save;
//     the stance re-derives from persisted state (defeatStreak survives) plus fresh samples.

import { PACING_INCOMING_FLOOR, PACING_OUTGOING_CAP } from '../data/difficulty.js';

/** Bench A/B: production default ON. Quiet latch skips per-tick pacing eval when
 * stance is steady, mults are settled at 1, damage books + flee holds are empty.
 * Wakes on combat:damage / newGame / save:loaded / 0.5 s rescan. Soft-GPU fps not
 * claimed. Fresh registry.step residual (#162). */
let DIFFICULTY_DIRECTOR_QUIET_LATCH = true;
export function setDifficultyDirectorQuietLatchForBench(enabled) {
  DIFFICULTY_DIRECTOR_QUIET_LATCH = enabled !== false;
}
export function getDifficultyDirectorQuietLatchForBench() {
  return DIFFICULTY_DIRECTOR_QUIET_LATCH !== false;
}

/** Rescan while latched (0.5 s). Sim-time based so scripted tests that advance
 * simTime without tick still re-evaluate credit trend / stance. */
const DIFFICULTY_QUIET_RESCAN_S = 0.5;

function publishDifficultyQuiet(state, latched) {
  if (!state) return;
  const rt = state.difficultyRuntime || (state.difficultyRuntime = {});
  rt.quietLatched = !!latched;
}

const DAMAGE_WINDOW_S = 120;       // trailing window for recent-damage reads
const CREDIT_SAMPLE_S = 5;         // credits trend sample cadence
const CREDIT_WINDOW_S = 180;       // trend window kept
const STANCE_DWELL_S = 20;         // minimum time in a stance before transition (hysteresis)
const MULT_RAMP_PER_S = 0.02;      // mult approach rate — a full swing lands in ~20-50s, measurable

// Stance thresholds (stress / ease are 0..1 composite scores; enter > exit for hysteresis).
const RECOVERY_ENTER = 0.60;
const RECOVERY_EXIT = 0.45;
const SURGE_ENTER = 0.70;
const SURGE_EXIT = 0.55;

// Pin watch (director-driven disengagement). Mirrors the encounter lane's mercy constants but
// player-side: the director only needs a dominant attacker + no player resolution in reach.
const PIN_ENGAGE_S = 240;          // a dominant attacker pressing this long qualifies for release
const PIN_MIN_DMG = 60;            // window damage below this is pestering, not a pin
const PIN_TTK_S = 420;             // player-implied TTK above this = the player cannot resolve it
const PIN_FORGET_S = 90;           // attacker silent this long drops off the watch
const PIN_FLEE_HOLD_S = 300;       // flee order hold before the NPC may re-engage
const WANTED_HEAT = 0.15;          // mirrors heat.WANTED_THRESHOLD (read-only)

const RECOVERY_INCOMING = 0.60;    // recovery target — above the 0.55 hard floor in difficulty.js
const RECOVERY_OUTGOING = 1.10;    // a losing fighter still gets a punch-out lane
const SURGE_OUTGOING = 1.15;       // cruising lift — below the 1.25 hard cap

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

function playerEntity(state) {
  return state && state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(state.playerId) : null;
}

function protectionOf(e) {
  if (!e) return { pool: 0, ratio: 1 };
  const pool = Math.max(0, (Number(e.hull) || 0) + (Number(e.shield) || 0) + (Number(e.armorHp) || 0));
  const max = Math.max(1, (Number(e.hullMax) || Number(e.hull) || 1)
    + (Number(e.shieldMax) || Number(e.shield) || 0)
    + (Number(e.armorMax) || Number(e.armorHp) || 0));
  return { pool, ratio: clamp01(pool / max) };
}

function survivalActive(state) {
  return !!(state && state.run && state.run.kind === 'survival' && state.run.phase !== 'inactive');
}

function wantedPlayer(state) {
  const h = state && state.player && state.player.heat;
  return typeof h === 'number' ? h >= WANTED_HEAT : false;
}

function defeatStreakCount(state, now) {
  const streak = state && state.player && state.player.defeatStreak;
  const count = Math.max(0, Math.floor(Number(streak && streak.count) || 0));
  const last = streak && streak.lastDefeatSimTime;
  // Streak older than the mercy window reads as cold even before combat's own reset runs.
  if (!Number.isFinite(last) || now - last > 1200) return 0;
  return count;
}

function freshInternals() {
  return {
    creditSamples: [],             // [{t, v}]
    incoming: new Map(),           // attackerId -> { firstAt, lastAt, dmg }
    outgoing: new Map(),           // targetId   -> { firstAt, lastAt, dmg }
    stance: 'steady',
    stanceSince: 0,
    incomingMult: 1,
    outgoingMult: 1,
    lastCreditSampleT: -Infinity,
    fleeHolds: new Map(),          // entityId -> until (flee holds this director stamped)
  };
}

function freshPublished(now) {
  return {
    stance: 'steady',
    pressureMult: 1,
    opportunityMult: 1,
    sinceT: now,
    stress: 0,
    ease: 0,
  };
}

function ensureDifficultyState(state) {
  if (!state.difficulty || typeof state.difficulty !== 'object' || Array.isArray(state.difficulty)) {
    state.difficulty = { pacing: freshPublished(Number(state.simTime) || 0) };
  }
  if (!state.difficulty.pacing || typeof state.difficulty.pacing !== 'object') {
    state.difficulty.pacing = freshPublished(Number(state.simTime) || 0);
  }
  return state.difficulty;
}

export const difficultyDirector = {
  name: 'difficultyDirector',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this._registry = ctx.registry || null;
    this._w = freshInternals();
    this._difficultyQuiet = null;
    this._difficultyWakeSeq = 0;
    this._unsubs = [];
    ensureDifficultyState(this.state);
    if (this.bus && typeof this.bus.on === 'function') {
      this._onDamage = (p) => {
        this._wakeDifficultyQuiet();
        this._recordDamage(p);
      };
      this.bus.on('combat:damage', this._onDamage);
      this._unsubs = [
        this.bus.on('save:loaded', () => this._wakeDifficultyQuiet()),
        this.bus.on('game:new', () => this._wakeDifficultyQuiet()),
        this.bus.on('sector:enter', () => this._wakeDifficultyQuiet()),
      ].filter(Boolean);
    }
  },

  newGame() {
    this._w = freshInternals();
    this._wakeDifficultyQuiet();
    if (this.state) {
      this.state.difficulty = { pacing: freshPublished(Number(this.state.simTime) || 0) };
      publishDifficultyQuiet(this.state, false);
    }
  },

  // ── signal intake ─────────────────────────────────────────────────────────────────────
  _recordDamage(p) {
    if (!p || !this._w) return;
    const now = Number(this.state.simTime) || 0;
    const amt = Math.max(0, Number(p.applied) || 0);
    if (!(amt > 0)) return;
    const pid = this.state.playerId;
    let book = null;
    let key = null;
    if (p.isPlayer === true || p.targetId === pid) {
      book = this._w.incoming;
      key = p.attackerId != null ? p.attackerId : 'world';
    } else if (p.attackerId === pid) {
      book = this._w.outgoing;
      key = p.targetId != null ? p.targetId : 'world';
    }
    if (!book || key == null) return;
    const row = book.get(key) || { firstAt: now, lastAt: -Infinity, bins: [] };
    if (now - row.lastAt > PIN_FORGET_S) { row.firstAt = now; row.bins = []; }
    row.lastAt = now;
    // Per-second bins: the window sum is exact and memory stays bounded (~120 bins/key).
    const sec = Math.floor(now);
    const last = row.bins[row.bins.length - 1];
    if (last && last.sec === sec) last.dmg += amt;
    else row.bins.push({ sec, dmg: amt });
    book.set(key, row);
  },

  _rowWindowDamage(row, now) {
    if (!row || now - row.lastAt > DAMAGE_WINDOW_S) return 0;
    const floor = now - DAMAGE_WINDOW_S;
    let total = 0;
    const bins = row.bins;
    while (bins.length && bins[0].sec < floor) bins.shift();
    for (const b of bins) total += b.dmg;
    return total;
  },

  _windowDamage(book, now) {
    let total = 0;
    for (const [key, row] of book) {
      if (now - row.lastAt > DAMAGE_WINDOW_S) { book.delete(key); continue; }
      total += this._rowWindowDamage(row, now);
    }
    return total;
  },

  _outgoingTo(book, key, now) {
    return this._rowWindowDamage(book.get(key), now);
  },

  _creditTrend(state, now) {
    const w = this._w;
    const credits = Number(state.player && state.player.credits);
    if (!Number.isFinite(credits)) return 0;
    if (now - w.lastCreditSampleT >= CREDIT_SAMPLE_S) {
      w.lastCreditSampleT = now;
      w.creditSamples.push({ t: now, v: credits });
      while (w.creditSamples.length && now - w.creditSamples[0].t > CREDIT_WINDOW_S) w.creditSamples.shift();
    }
    const s = w.creditSamples;
    if (s.length < 2 || now - s[0].t < CREDIT_WINDOW_S * 0.5) return 0;
    const base = Math.max(1, Math.abs(s[0].v));
    return (s[s.length - 1].v - s[0].v) / base;   // signed fraction over the window
  },

  // ── stance evaluation ─────────────────────────────────────────────────────────────────
  _scores(state, now, protection, windowDmg, creditTrend) {
    const streak = defeatStreakCount(state, now);
    // Stress: pool damage in-window relative to the player's whole pool, plus hull state,
    // plus the persisted loss streak, plus a gentle credit-slide nudge.
    const dmgFrac = protection.pool > 0 || windowDmg > 0
      ? windowDmg / Math.max(protection.pool, 1) : 0;
    const stress =
      0.40 * clamp01(dmgFrac / 0.35) +          // losing >~35% of pool in 2 min = fully stressed
      0.30 * (1 - protection.ratio) +            // a battered hull is stress even between hits
      0.22 * clamp01(streak / 3) +               // 3+ defeats in the window = max contribution
      0.08 * clamp01(-creditTrend / 0.15);       // a 15%+ credit slide adds a little
    // Ease: intact, un-shot-at, and the ledger is moving the right way.
    const ease =
      0.40 * protection.ratio +
      0.35 * clamp01(1 - dmgFrac / 0.10) +       // ~no incoming pressure at all
      0.15 * clamp01(creditTrend / 0.05) +       // credits trending up ≥5% over the window
      0.10 * (streak === 0 ? 1 : 0);
    return { stress: clamp01(stress), ease: clamp01(ease) };
  },

  _nextStance(cur, stress, ease) {
    if (cur === 'recovery') return stress < RECOVERY_EXIT ? (ease >= SURGE_ENTER ? 'surge' : 'steady') : 'recovery';
    if (cur === 'surge') return stress >= RECOVERY_ENTER ? 'recovery' : (ease < SURGE_EXIT ? 'steady' : 'surge');
    if (stress >= RECOVERY_ENTER) return 'recovery';
    if (ease >= SURGE_ENTER) return 'surge';
    return 'steady';
  },

  _targetsFor(stance) {
    if (stance === 'recovery') return { incoming: RECOVERY_INCOMING, outgoing: RECOVERY_OUTGOING };
    if (stance === 'surge') return { incoming: 1, outgoing: SURGE_OUTGOING };
    return { incoming: 1, outgoing: 1 };
  },

  // ── pin release ───────────────────────────────────────────────────────────────────────
  _encounterOwned(state, attackerId) {
    const live = state.encounterDirector && state.encounterDirector.live;
    if (!live || typeof live !== 'object') return false;
    for (const id of Object.keys(live)) {
      const l = live[id];
      if (l && l.phase !== 'done' && Array.isArray(l.ids) && l.ids.includes(attackerId)) return true;
    }
    return false;
  },

  _pinTick(state, now) {
    const w = this._w;
    // Expire flee holds this director stamped (only ours — ai._pacingFleeUntil marks the stamp).
    for (const [id, until] of w.fleeHolds) {
      if (now < until) continue;
      const ent = state.entities && state.entities.get(id);
      const ai = ent && ent.data && ent.data.ai;
      if (ai && ai._pacingFleeUntil === until) {
        delete ai.forceFlee;
        delete ai._pacingFleeUntil;
        delete ai.moraleFleeReason;
      }
      w.fleeHolds.delete(id);
    }
    if (!w.incoming.size) return;
    const pid = state.playerId;
    const player = playerEntity(state);
    if (!player || player.alive === false) return;
    const wanted = wantedPlayer(state);
    for (const [attackerId, row] of w.incoming) {
      if (now - row.lastAt > PIN_FORGET_S) continue;               // went quiet on its own
      if (now - row.firstAt < PIN_ENGAGE_S) continue;              // not a sustained pin yet
      const spanDmg = this._outgoingTo(w.incoming, attackerId, now);
      if (spanDmg < PIN_MIN_DMG) continue;                         // pestering, not a pin
      const attacker = state.entities && state.entities.get(attackerId);
      if (!attacker || attacker.alive === false) continue;
      if (attacker.type !== 'ship' && attacker.type !== 'drone') continue;
      const data = attacker.data || (attacker.data = {});
      const ai = data.ai || (data.ai = {});
      if (ai.forceFlee === true || ai.fsm === 'flee') {
        // A hold stamped before a save/load has no entry in the transient fleeHolds map —
        // adopt the marker so it still expires on time; a foreign flee reason is left alone.
        if (ai._pacingFleeUntil != null) {
          if (ai._pacingFleeUntil > now) w.fleeHolds.set(attackerId, ai._pacingFleeUntil);
          else if (ai.forceFlee === true) {
            delete ai.forceFlee;
            delete ai._pacingFleeUntil;
            delete ai.moraleFleeReason;
          }
        }
        continue;
      }
      if (ai.namedAceId || data.encounterBoss || data.isBoss) continue;   // authored duel
      if (ai.lawful && wanted) continue;                           // lawful pressure on a wanted pilot
      if (this._encounterOwned(state, attackerId)) continue;       // scripted squad resolves itself
      // Resolution check: is the player actually winning this fight? Zero outgoing means the
      // pilot won't or can't fight; a hopeless implied TTK means fighting won't end it either.
      const outgoingDmg = this._outgoingTo(w.outgoing, attackerId, now);
      const attackerPool = Math.max(1, (Number(attacker.hull) || 0) + (Number(attacker.shield) || 0));
      const outDps = outgoingDmg / Math.max(1, Math.min(DAMAGE_WINDOW_S, now - row.firstAt));
      const resolving = outgoingDmg > 0 && outDps > 0 && (attackerPool / outDps) <= PIN_TTK_S;
      if (resolving) continue;
      // Stamp the flee order — the doctrine stack already converts it to a FLEE activity.
      const until = now + PIN_FLEE_HOLD_S;
      ai.forceFlee = true;
      ai.moraleFleeReason = 'pacing_pin_release';
      ai._pacingFleeUntil = until;
      w.fleeHolds.set(attackerId, until);
      if (this.bus) {
        this.bus.emit('difficulty:pinReleased', {
          attackerId, engagedForS: now - row.firstAt, windowDamage: spanDmg,
          stance: w.stance, playerId: pid, atT: now,
        });
        this.bus.emit('toast', { text: 'The harasser loses interest and breaks off.', kind: 'info', ttl: 4 });
      }
      w.incoming.delete(attackerId);
      break;                                                        // one release per tick
    }
  },

  // ── tick ─────────────────────────────────────────────────────────────────────────────
  update(dt, state) {
    // Quiet open flight: every tick still evaluated pacing scores / credit trend / pin watch
    // even when stance was already steady, mults settled at 1, and damage books + flee holds
    // were empty. Quiet latch short-circuits that work; wakes on combat:damage / new-game /
    // save / sector enter / 0.5 s rescan. Soft-GPU fps not claimed.
    if (DIFFICULTY_DIRECTOR_QUIET_LATCH !== false) {
      const quiet = this._difficultyQuiet;
      if (quiet) {
        const wakeSeq = this._difficultyWakeSeq | 0;
        const nowS = Number(state.simTime) || 0;
        if (quiet.wakeSeq === wakeSeq
          && (nowS - (Number(quiet.armedSimT) || 0)) < DIFFICULTY_QUIET_RESCAN_S) {
          publishDifficultyQuiet(state, true);
          return;
        }
      }
    } else if (this._difficultyQuiet) {
      this._difficultyQuiet = null;
      publishDifficultyQuiet(state, false);
    }

    const diff = ensureDifficultyState(state);
    const pacing = diff.pacing;
    const w = this._w || (this._w = freshInternals());
    const now = Number(state.simTime) || 0;
    const player = playerEntity(state);
    const protection = protectionOf(player);
    const windowDmg = this._windowDamage(w.incoming, now);
    const creditTrend = this._creditTrend(state, now);
    const { stress, ease } = this._scores(state, now, protection, windowDmg, creditTrend);

    // The arena keeps its own tuning (same contract as the defeat-streak floor): pacing pins
    // itself to steady while a scored survival run is live.
    const inert = survivalActive(state) || !player || player.alive === false;
    const next = inert ? 'steady' : this._nextStance(w.stance, stress, ease);
    if (next !== w.stance && now - w.stanceSince >= STANCE_DWELL_S) {
      w.stance = next;
      w.stanceSince = now;
      if (this.bus) {
        this.bus.emit('difficulty:stanceChanged', {
          stance: next, stress, ease, atT: now,
        });
      }
    }

    // Mults ramp toward the stance target — a losing player's incoming pressure decays
    // measurably over tens of seconds, not in a cliff step.
    const targets = this._targetsFor(w.stance);
    const stepMax = MULT_RAMP_PER_S * Math.max(0, dt || 0);
    const approach = (cur, tgt) => cur + Math.max(-stepMax, Math.min(stepMax, tgt - cur));
    w.incomingMult = approach(w.incomingMult, targets.incoming);
    w.outgoingMult = approach(w.outgoingMult, targets.outgoing);

    // Publish the single inspectable field.
    pacing.stance = w.stance;
    pacing.pressureMult = Math.max(PACING_INCOMING_FLOOR, Math.min(1, w.incomingMult));
    pacing.opportunityMult = Math.max(1, Math.min(PACING_OUTGOING_CAP, w.outgoingMult));
    pacing.sinceT = w.stanceSince;
    pacing.stress = stress;
    pacing.ease = ease;

    this._pinTick(state, now);

    if (DIFFICULTY_DIRECTOR_QUIET_LATCH !== false) {
      // Do not latch while survival is active or player is dead/missing — arena / inert
      // contracts keep publishing every tick. Quiet open flight often sits in surge
      // (healthy + unpressured); arm whenever mults have settled at the stance targets
      // and damage books + flee holds are empty.
      const latchTargets = this._targetsFor(w.stance);
      const canLatch = !inert
        && Math.abs(w.incomingMult - latchTargets.incoming) < 1e-4
        && Math.abs(w.outgoingMult - latchTargets.outgoing) < 1e-4
        && w.incoming.size === 0
        && w.outgoing.size === 0
        && w.fleeHolds.size === 0;
      if (canLatch) {
        this._difficultyQuiet = {
          armedTick: state.tick | 0,
          armedSimT: Number(state.simTime) || 0,
          wakeSeq: this._difficultyWakeSeq | 0,
        };
        publishDifficultyQuiet(state, true);
      } else {
        this._difficultyQuiet = null;
        publishDifficultyQuiet(state, false);
      }
    }
  },

  _wakeDifficultyQuiet() {
    this._difficultyWakeSeq = (this._difficultyWakeSeq | 0) + 1;
    this._difficultyQuiet = null;
  },

  destroy() {
    if (this.bus && this.bus.off && this._onDamage) this.bus.off('combat:damage', this._onDamage);
    this._onDamage = null;
    if (this._unsubs) {
      for (const u of this._unsubs) { if (typeof u === 'function') u(); }
      this._unsubs = [];
    }
  },
};

export default difficultyDirector;
