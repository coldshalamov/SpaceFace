// Factions & reputation system (ARCHITECTURE §0.6 single-writer, §0.9 scale, §3.10 state,
// §4.4 master event table; design/specs/06-factions-reputation.md formulas).
//
// SOLE WRITER of state.factions[id].rep — every change funnels through applyRep(), which clamps,
// applies diminishing returns near the caps, recomputes tier + aggro flag, fires faction:repChanged,
// and runs (non-recursive) cross-faction spillover via the FACTION_META relations matrix.
//
// Also owns state.conflicts[pairKey] (dynamic inter-faction war) and writes
// state.world.sectors[id].owner on war resolution (§0.6). Pure-data deps only (no 'three').
import { FACTION_META } from '../data/factions.js';
import { NEW_GAME } from '../data/newGameDefaults.js';

// ── Tiers (§0.9 / spec): 9 named bands across -1000..+1000, evaluated high→low. ──────────────
const TIERS = [
  { name: 'Hero',        min: 700 },
  { name: 'Allied',      min: 400 },
  { name: 'Trusted',     min: 150 },
  { name: 'Accepted',    min: 30 },
  { name: 'Neutral',     min: -29 },
  { name: 'Disliked',    min: -149 },
  { name: 'Hostile',     min: -399 },
  { name: 'Hated',       min: -699 },
  { name: 'Sworn Enemy', min: -1000 },
];

const AGGRO_THRESHOLD = -150; // rep <= this → attack-on-sight + dock lockout (spec)
const WITNESS_RANGE = 1200;   // wu — hostile acts only count rep if a faction unit is within range
const SPILL_CAP = 8;          // per-event spillover magnitude clamp (spec)
const KILL_BASE = -25;        // base rep for killing a faction ship (spec REP_ACTIONS)
const KILL_CLASS_MULT = { scout: 0.6, fighter: 1.0, gunship: 1.5, frigate: 2.0, capital: 2.5 };
const ENEMY_KILL_BONUS = 6;   // killing a faction's rival nudges that rival's enemies up (spec)

// Conflict / war tuning (spec Formulas) — kept simple but present.
const WAR_THRESHOLD = 75;     // tension >= this → 'war'
const TENSE_THRESHOLD = 40;   // tension >= this → 'tense'
const FLIP_THRESHOLD = 100;   // |cumulative momentum| beyond this flips the contested sector
const PLAYER_WEIGHT = 25;     // playerLean contribution to war momentum
const DECAY_POSITIVE = false; // default: only negative rep decays toward neutral (spec)

// Contested sectors flippable in war: pairKey → sectorId (spec CONTESTED SECTORS, sector_ ids).
const CONTESTED = {
  'faction_reach:faction_scn': 'sector_helios_prime',
  'faction_dmc:faction_mts': 'sector_tethys_junction',
  'faction_reach:faction_vael': 'sector_ashfall_reach',
  'faction_quiet:faction_scn': 'sector_io_reach',
  'faction_dmc:faction_reach': 'sector_charon_expanse',
};

// ── Static lookups derived from FACTION_META once at module load ────────────────────────────
const META_BY_ID = Object.create(null);
const FACTION_IDS = [];
for (const f of FACTION_META) { META_BY_ID[f.id] = f; FACTION_IDS.push(f.id); }

function sortedPairKey(a, b) { return a < b ? `${a}:${b}` : `${b}:${a}`; }

/** Spillover weight from faction `a` onto faction `b` (relations matrix, symmetric fallback). */
function spilloverWeight(a, b) {
  if (a === b) return 0;
  const ma = META_BY_ID[a];
  if (ma && ma.relations && typeof ma.relations[b] === 'number') return ma.relations[b];
  const mb = META_BY_ID[b];
  if (mb && mb.relations && typeof mb.relations[a] === 'number') return mb.relations[a];
  return 0;
}

/** First tier (high→low) whose `min` threshold is satisfied by `rep`. */
function tierOf(rep) {
  for (const t of TIERS) if (rep >= t.min) return t.name;
  return TIERS[TIERS.length - 1].name;
}

/** Diminishing returns near the caps (spec applyDiminish): gains above +150 and losses below
 *  -150 taper to 0.4× near ±1000, so the last stretch is grindy and intentional. */
function applyDiminish(raw, delta) {
  let factor = 1;
  if (delta > 0 && raw >= 150) factor = 1 - ((raw - 150) / (1000 - 150)) * 0.6;
  else if (delta < 0 && raw <= -150) factor = 1 - ((-150 - raw) / (1000 - 150)) * 0.6;
  if (factor < 0.4) factor = 0.4; // never below the 0.4× floor
  return Math.round(delta * factor);
}

function clampRep(r) { return Math.max(-1000, Math.min(1000, r)); }

// Module-level singleton handle so the exported pure helpers (getStanding/priceMod/...) can read
// runtime state without a bus round-trip. Set in init(); stays null in headless unit tests.
let _state = null;

/** Ensure a runtime record exists for `id` (lazy, idempotent). */
function ensureFaction(state, id) {
  let rec = state.factions[id];
  if (!rec) {
    const meta = META_BY_ID[id];
    const startRep = (NEW_GAME.factionRep && NEW_GAME.factionRep[id] != null)
      ? NEW_GAME.factionRep[id]
      : (meta && typeof meta.startingRep === 'number' ? meta.startingRep : 0);
    rec = state.factions[id] = {
      rep: clampRep(startRep | 0),
      tier: tierOf(startRep),
      aggro: startRep <= AGGRO_THRESHOLD,
      bribesPaid: 0,
      lastDelta: { value: 0, reason: 'init', t: 0 },
      knownContrabandStrikes: 0,
      discoveredHostileBy: 0,
    };
  }
  return rec;
}

export const factions = {
  name: 'factions',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    _state = ctx.state;
    this._lastDecayDay = 0;
    this._warAccumDays = 0; // sim-days accumulated toward the next WAR_TICK

    const state = this.state, bus = this.bus;

    // New game → seed reputations + conflicts from data defaults (idempotent: skip if a load
    // already populated state.factions).
    bus.on('game:started', () => this.newGame());

    // Sole rep-mutation entry point for every other system (§0.6).
    bus.on('faction:repDelta', ({ factionId, delta, reason }) => {
      this.applyRep(factionId, delta, reason || 'event');
    });

    // Killing a ship: lower rep with the victim's faction (if witnessed), raise rep a little with
    // that faction's enemies. Only the player's own kills move the player's standing.
    bus.on('entity:killed', (p) => {
      if (!p || p.type !== 'ship' || !p.factionId) return;
      if (p.killerId !== state.playerId) return; // NPC-on-NPC kills don't touch player rep
      const victim = p.factionId;
      const cls = p.victimClass || 'fighter';
      const witnessed = (p.witnessed != null) ? p.witnessed : this._witnessed(p.pos, victim);
      if (witnessed) {
        const mult = KILL_CLASS_MULT[cls] != null ? KILL_CLASS_MULT[cls] : 1.0;
        this.applyRep(victim, KILL_BASE * mult, 'kill_faction_ship');
      }
      // Rivals of the victim approve regardless of witness (word travels among enemies).
      for (const other of FACTION_IDS) {
        if (other === victim) continue;
        if (spilloverWeight(victim, other) < 0) {
          this.applyRep(other, ENEMY_KILL_BONUS, 'kill_faction_enemy_ship');
        }
      }
      // Pirate/law kills feed inter-faction tension around contested space.
      this._feedTensionForKill(victim, p.pos);
    });

    // Trade at a faction station: small standing gain scaled by net trade value, capped per docking.
    bus.on('economy:tradeCompleted', (p) => {
      if (!p || !p.factionId) return;
      const value = Math.abs(p.total != null ? p.total : (p.unitAvg || 0) * (p.qty || 0));
      if (value <= 0) return;
      const delta = Math.min(3, (value / 1000) * 0.5); // +0.5 / 1000cr, capped +3 (spec)
      if (delta > 0) this.applyRep(p.factionId, delta, 'trade_at_faction_station');
    });

    // Mission outcomes (missions system owns repMult / factionId).
    bus.on('mission:completed', (p) => {
      if (!p || !p.factionId) return;
      const mult = p.repMult != null ? p.repMult : 1;
      this.applyRep(p.factionId, 15 * mult, 'complete_faction_mission');
    });
    const onMissionLost = (p) => {
      if (p && p.factionId) this.applyRep(p.factionId, -12, 'fail_faction_mission');
    };
    bus.on('mission:failed', onMissionLost);
    bus.on('mission:expired', onMissionLost);

    // Customs / patrol contraband scan: heavy rep hit + escalating strike counter (§4.4).
    bus.on('contraband:scanned', (p) => {
      if (!p || !p.found || !p.factionId) return;
      const rec = ensureFaction(state, p.factionId);
      rec.knownContrabandStrikes++;
      const escalation = 1 + 0.5 * (rec.knownContrabandStrikes - 1); // repeats hurt more (spec ×1.5-ish)
      this.applyRep(p.factionId, -40 * escalation, 'caught_contraband');
    });

    // Rescuing a faction distress call → standing gain (spec +20). Credits handled by economy.
    bus.on('distress:rescued', (p) => {
      if (p && p.factionId) this.applyRep(p.factionId, 20, 'rescue_faction_distress');
    });

    // Day boundary (core/time): decay extreme rep toward neutral + advance war resolution.
    // core emits { days:absoluteDay, elapsed:delta }; the §4.4 table documents { days } as the
    // delta. Prefer `elapsed`; otherwise treat `days` as the delta. Always >= 1 day.
    bus.on('day:tick', (p) => {
      const d = (p && typeof p.elapsed === 'number') ? p.elapsed
        : (p && typeof p.days === 'number' ? p.days : 1);
      this._onDayTick(Math.max(1, d));
    });
  },

  // Per-tick work is cheap/event-driven; the day-gated decay/war ticks run off day:tick. The
  // update hook exists for interface completeness and as a lazy-init backstop.
  update(dt, state) {
    if (!_state) _state = state;
  },

  // ── Reputation core ───────────────────────────────────────────────────────────────────────

  /** Single mutation point for rep (§0.6). Clamps, diminishes near caps, recomputes tier+flags,
   *  emits faction:repChanged, then runs one (non-recursive) round of cross-faction spillover. */
  applyRep(factionId, delta, reason) {
    const state = this.state || _state;
    if (!state || !META_BY_ID[factionId] || !delta) return 0;
    const rec = ensureFaction(state, factionId);
    const soft = applyDiminish(rec.rep, delta);
    if (soft === 0) return 0;
    const oldTier = rec.tier;
    const oldAggro = rec.aggro;
    rec.rep = clampRep(rec.rep + soft);
    rec.tier = tierOf(rec.rep);
    rec.aggro = rec.rep <= AGGRO_THRESHOLD;
    rec.lastDelta = { value: soft, reason, t: state.simTime || 0 };
    const tierChanged = rec.tier !== oldTier;
    if (this.bus) {
      this.bus.emit('faction:repChanged', {
        factionId, delta: soft, reason, newRep: rec.rep, newTier: rec.tier, tierChanged,
      });
      if (rec.aggro !== oldAggro) this.bus.emit('faction:aggro', { factionId, isAggro: rec.aggro });
    }
    this._applySpillover(factionId, soft, reason);
    return soft;
  },

  /** One round of cross-faction spillover (never recurses). Allies of a helped faction gain a
   *  fraction; rivals lose a fraction; capped ±SPILL_CAP per event (spec applySpillover). */
  _applySpillover(srcId, delta, reason) {
    const state = this.state || _state;
    for (const other of FACTION_IDS) {
      if (other === srcId) continue;
      const w = spilloverWeight(srcId, other);
      if (!w) continue;
      let sd = Math.round(delta * w);
      if (sd === 0) continue;
      if (sd > SPILL_CAP) sd = SPILL_CAP; else if (sd < -SPILL_CAP) sd = -SPILL_CAP;
      const rec = ensureFaction(state, other);
      const oldTier = rec.tier;
      const oldAggro = rec.aggro;
      rec.rep = clampRep(rec.rep + sd);
      rec.tier = tierOf(rec.rep);
      rec.aggro = rec.rep <= AGGRO_THRESHOLD;
      if (this.bus) {
        this.bus.emit('faction:repSpillover', { factionId: other, delta: sd, srcFaction: srcId });
        if (rec.tier !== oldTier) {
          this.bus.emit('faction:repChanged', {
            factionId: other, delta: sd, reason: `spillover:${reason}`,
            newRep: rec.rep, newTier: rec.tier, tierChanged: true,
          });
        }
        if (rec.aggro !== oldAggro) this.bus.emit('faction:aggro', { factionId: other, isAggro: rec.aggro });
      }
    }
  },

  /** True if any ship/station of `faction` is within WITNESS_RANGE of `pos` (spec witnessed()). */
  _witnessed(pos, faction) {
    const state = this.state || _state;
    if (!pos || !state || !this.helpers || !this.helpers.queryRadius) return true; // fail-open if no spatial query
    const near = this.helpers.queryRadius(pos, WITNESS_RANGE);
    for (const e of near) {
      if (!e.alive) continue;
      if (e.factionId !== faction) continue;
      if (e.type === 'ship' || e.type === 'station') return true;
    }
    return false;
  },

  // ── Conflict / war layer (kept simple but present) ──────────────────────────────────────────

  _ensureConflict(key) {
    const state = this.state || _state;
    let c = state.conflicts[key];
    if (!c) c = state.conflicts[key] = { tension: 0, state: 'cold', playerLean: 0, momentum: 0 };
    return c;
  },

  /** Bump tension on the pair owning the contested sector nearest the kill, leaning the player
   *  away from the side they shot at. */
  _feedTensionForKill(victim, pos) {
    for (const key in CONTESTED) {
      const [a, b] = key.split(':');
      if (victim !== a && victim !== b) continue;
      const c = this._ensureConflict(key);
      c.tension = Math.max(0, Math.min(100, c.tension + 1.5));
      const lean = victim === a ? -1 : 1; // shooting A leans the player toward B
      c.playerLean = Math.max(-1, Math.min(1, c.playerLean + lean * 0.1));
      this._refreshConflictState(key, c);
    }
  },

  _refreshConflictState(key, c) {
    const prev = c.state;
    c.state = c.tension >= WAR_THRESHOLD ? 'war' : (c.tension >= TENSE_THRESHOLD ? 'tense' : 'cold');
    if (c.state === 'war' && prev !== 'war' && this.bus) {
      const sides = key.split(':');
      this.bus.emit('conflict:warDeclared', { pairKey: key, sides });
    }
  },

  _onDayTick(days) {
    const state = this.state || _state;
    if (!state) return;
    // 1) Rep decay toward neutral (forgiveness): negatives drift up; positives slowly fade
    //    only if DECAY_POSITIVE is enabled. Never crosses neutral (clamped at ±30).
    for (const id of FACTION_IDS) {
      const rec = ensureFaction(state, id);
      if (rec.rep < -30) {
        const next = Math.min(-30, rec.rep + 2 * days);
        if (next !== rec.rep) this._setRepDirect(id, rec, next, 'decay');
      } else if (DECAY_POSITIVE && rec.rep > 30) {
        const next = Math.max(30, rec.rep - 1 * days);
        if (next !== rec.rep) this._setRepDirect(id, rec, next, 'decay');
      }
    }
    // 2) War resolution: every WAR_TICK (~once per sim-day here) accumulate momentum on active wars;
    //    flip the contested sector when momentum runs away.
    this._warAccumDays += days;
    if (this._warAccumDays >= 1) {
      this._warAccumDays = 0;
      for (const key in state.conflicts) {
        const c = state.conflicts[key];
        if (c.state !== 'war') continue;
        const [a, b] = key.split(':');
        // baseStrength is symmetric here (no faction power table yet) → momentum is player-driven.
        c.momentum = (c.momentum || 0) + c.playerLean * PLAYER_WEIGHT;
        if (Math.abs(c.momentum) >= FLIP_THRESHOLD) {
          const winner = c.momentum > 0 ? b : a; // positive lean favors side B (see _feedTensionForKill)
          const loser = winner === a ? b : a;
          const sectorId = CONTESTED[key];
          if (sectorId && state.world && state.world.sectors && state.world.sectors[sectorId]) {
            state.world.sectors[sectorId].owner = winner; // §0.6: factions writes sector owner
            if (this.bus) this.bus.emit('conflict:flip', { pairKey: key, sectorId, newOwner: winner });
          }
          // Reward the side the player favored; penalize the other (spec warResolve).
          const leanMag = Math.abs(c.playerLean);
          if (leanMag > 0) {
            this.applyRep(winner, 20 * leanMag, 'war_won');
            this.applyRep(loser, -30 * leanMag, 'war_lost');
          }
          c.tension = 50; c.momentum = 0;
          this._refreshConflictState(key, c);
        }
      }
    }
  },

  /** Decay path: write rep without diminishing returns, still recompute tier/flags + emit. */
  _setRepDirect(id, rec, newRep, reason) {
    const oldTier = rec.tier;
    const oldAggro = rec.aggro;
    const delta = newRep - rec.rep;
    rec.rep = clampRep(newRep);
    rec.tier = tierOf(rec.rep);
    rec.aggro = rec.rep <= AGGRO_THRESHOLD;
    if (this.bus) {
      if (rec.tier !== oldTier) {
        this.bus.emit('faction:repChanged', {
          factionId: id, delta, reason, newRep: rec.rep, newTier: rec.tier, tierChanged: true,
        });
      }
      if (rec.aggro !== oldAggro) this.bus.emit('faction:aggro', { factionId: id, isAggro: rec.aggro });
    }
  },

  // ── newGame / save (§4.5: factions + conflicts serialize; factionMeta re-hydrated) ──────────

  newGame() {
    const state = this.state || _state;
    if (!state) return;
    state.factions = {};
    state.conflicts = {};
    for (const id of FACTION_IDS) {
      ensureFaction(state, id);
    }
  },

  serialize() {
    const state = this.state || _state;
    return { factions: state.factions, conflicts: state.conflicts };
  },

  deserialize(data) {
    const state = this.state || _state;
    if (!data) return;
    state.factions = data.factions || {};
    state.conflicts = data.conflicts || {};
    // Heal any missing fields / new factions added since the save was written.
    for (const id of FACTION_IDS) ensureFaction(state, id);
  },
};

// ── Public read API (consumed by economy / ai / missions / ui; never mutates state) ───────────

/** Runtime standing record for a faction (rep, tier, aggro, …). Read-only snapshot semantics. */
export function getStanding(factionId) {
  if (!_state || !_state.factions) return null;
  return _state.factions[factionId] || null;
}

/** Buy/sell price multipliers from standing (spec getRepPriceMod). Economy multiplies base price
 *  by these: t = rep/1000; allies get discounts, hostiles a surcharge. Returns {buy, sell}. */
export function priceMod(factionId) {
  const rec = _state && _state.factions ? _state.factions[factionId] : null;
  const rep = rec ? rec.rep : 0;
  const t = Math.max(-1, Math.min(1, rep / 1000));
  const buy = Math.max(0.70, Math.min(1.40, 1 - 0.30 * Math.max(0, t) + 0.40 * Math.max(0, -t)));
  const sell = Math.max(0.70, Math.min(1.20, 1 + 0.20 * Math.max(0, t) - 0.30 * Math.max(0, -t)));
  return { buy, sell };
}

/** Tier name for a faction (cheap UI/AI read). */
export function getTier(factionId) {
  const rec = _state && _state.factions ? _state.factions[factionId] : null;
  return rec ? rec.tier : tierOf(0);
}

/** Attack-on-sight / dock-lockout flag (rep <= -150). */
export function isAggro(factionId) {
  const rec = _state && _state.factions ? _state.factions[factionId] : null;
  return rec ? !!rec.aggro : false;
}

/** Dock access gate: 'locked' | 'restricted' | 'full' (spec dockAccess). */
export function dockAccess(factionId) {
  const rec = _state && _state.factions ? _state.factions[factionId] : null;
  const rep = rec ? rec.rep : 0;
  if (rep <= AGGRO_THRESHOLD) return 'locked';
  if (rep < -30) return 'restricted';
  return 'full';
}

/** Mission availability gate by minRep (spec missionAvailable). */
export function missionAvailable(mission) {
  if (!mission || !mission.factionId) return true;
  const rec = _state && _state.factions ? _state.factions[mission.factionId] : null;
  const rep = rec ? rec.rep : 0;
  return rep >= (mission.minRep || 0);
}

/** Bribe cost to clear minor hostility to the -29 floor; Infinity if too hated to bribe (spec). */
export function bribeCost(factionId) {
  const rec = _state && _state.factions ? _state.factions[factionId] : null;
  if (!rec) return 0;
  if (rec.rep > -30) return 0;            // not hostile → n/a
  if (rec.rep <= -400) return Infinity;   // Hated tier or worse → unbribeable
  const bribeCount = rec.bribesPaid > 0 ? 1 : 0; // escalation scales with prior bribes
  return Math.round((Math.abs(rec.rep) - 29) * 8 * (1 + 0.5 * bribeCount));
}
