// Factions & reputation system (ARCHITECTURE §0.6 single-writer, §0.9 scale, §3.10 state,
// §4.4 master event table; design/specs/06-factions-reputation.md formulas).
//
// SOLE WRITER of state.factions[id].rep — every change funnels through applyRep(), which clamps,
// applies diminishing returns near the caps, recomputes tier + aggro flag, fires faction:repChanged,
// and runs (non-recursive) cross-faction spillover via the FACTION_META relations matrix.
//
// Also owns state.conflicts[pairKey] (dynamic inter-faction war) and writes
// state.world.sectors[id].owner on war resolution (§0.6). Pure-data deps only (no 'three').
import { isRunSealed } from '../core/runSeal.js';
import { FACTION_META } from '../data/factions.js';
import { NEW_GAME } from '../data/newGameDefaults.js';
import { CONTESTED_SECTOR_BY_PAIR, contestedSectorForPair } from '../data/conflictZones.js';
import { SECTORS, stationGrowthLadderFor } from '../data/sectors.js';
import { KillCause, compactKillCausality } from '../combat/killCausality.js';
import { forEachLivingWorldActor } from '../world/livingWorldViews.js';

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
// V2 §24: faction power imbalance contributes to war momentum too, so NPC-vs-NPC wars can resolve
// without the player. Weighted lower than the player's direct lean (the player should still feel
// impactful) but high enough that a real power gap flips a sector over a few days of grinding.
const POWER_WEIGHT = 0.9;
const DECAY_POSITIVE = false; // default: only negative rep decays toward neutral (spec)

// PQ-170.00 — fronts you can tilt. A kill ON the contested sector of a warring pair is a front
// action, not background noise: it leans harder than a remote gank and banks real momentum that
// resolves on the next war tick (or immediately, while the front is already hot). Blockade kills
// strangle a lane's logistics hulls; siege kills break bastion-class hulls; a thrown mass or a
// slam the player caused reads as the wrecking-ball verb the packet names.
const FRONT_KILL_LEAN = 0.15;     // contested-sector kill lean gain (remote kills stay at 0.1)
const FRONT_KILL_TENSION = 0.5;   // a front action keeps the front hot
const FRONT_KILL_MOMENTUM = 6;    // base momentum banked per contested-sector kill
const BLOCKADE_MOMENTUM = 4;      // extra momentum for killing the lane's logistics hulls
const SIEGE_MOMENTUM = 10;        // extra momentum for breaking a bastion/heavy hull
const WRECKING_BALL_MOMENTUM = 5; // extra momentum when the kill was thrown mass / a caused slam
// PQ-170.01 — station growth and depot dependency. A station the player's freight physically grew
// is more of its faction's base (the authored rung's powerBonus feeds war power), and a stocked
// depot provisioning a Concord rotation is Concord reach the player is paying for. Both earn a
// little standing — through applyRep, the only rep writer — because they were earned with freight.
const STATION_GROWTH_REP = 8;        // per module a station gains on the player's throughput
const DEPOT_PROVISIONING_REP = 2;    // per completed Concord rotation the player's depot fed
const DEPOT_SUPPORT_POWER = 3;       // Concord power per depot currently provisioning a rotation
const ENDGAME_PULL_VICTIM_REP = -10; // the faction that lost the vault / heavy
const ENDGAME_PULL_POWER = 8;        // durable power hole left by a finished pull
const SIEGE_CLASSES = new Set(['capital', 'guardian', 'frigate']);
const SIEGE_HULLS = new Set(['ship_bastion', 'ship_warden', 'ship_colossus', 'ship_leviathan']);
const LOGISTICS_ARCHETYPES = new Set(['passive', 'fleeing_trader']);

// Contested sectors flippable in war: pairKey → sectorId (spec CONTESTED SECTORS, sector_ ids).
const CONTESTED = CONTESTED_SECTOR_BY_PAIR;

// ── Static lookups derived from FACTION_META once at module load ────────────────────────────
const META_BY_ID = Object.create(null);
const FACTION_IDS = [];
for (const f of FACTION_META) { META_BY_ID[f.id] = f; FACTION_IDS.push(f.id); }

function sortedPairKey(a, b) { return a < b ? `${a}:${b}` : `${b}:${a}`; }

const SECTOR_NAME_BY_ID = Object.create(null);
for (const s of SECTORS) SECTOR_NAME_BY_ID[s.id] = s.name || s.id;

function freshFrontRecord() {
  return { frontKills: 0, blockade: 0, siege: 0, thrown: 0 };
}

function factionLabel(id) {
  const meta = META_BY_ID[id];
  return String((meta && (meta.short || meta.name)) || id || 'unknown').toUpperCase();
}

function sectorLabel(id) {
  return String(SECTOR_NAME_BY_ID[id] || id || 'unknown sector').toUpperCase();
}

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

function defaultFactionRecord(id) {
  const meta = META_BY_ID[id];
  const startRep = (NEW_GAME.factionRep && NEW_GAME.factionRep[id] != null)
    ? NEW_GAME.factionRep[id]
    : (meta && typeof meta.startingRep === 'number' ? meta.startingRep : 0);
  const rep = clampRep(startRep | 0);
  return {
    rep,
    tier: tierOf(rep),
    aggro: rep <= AGGRO_THRESHOLD,
    bribesPaid: 0,
    lastDelta: { value: 0, reason: 'init', t: 0 },
    knownContrabandStrikes: 0,
    discoveredHostileBy: 0,
    // V2 §28b/§24 — faction power drives war momentum independent of the player. Derived
    // periodically from sector ownership + visible economic/military activity. See
    // _recomputeFactionPower. Starts at a small neutral baseline so wars can grind without us.
    power: 10,
    powerNonce: 0,
  };
}

function backfillFactionRecord(rec, id) {
  const defaults = defaultFactionRecord(id);
  if (!Number.isFinite(rec.rep)) rec.rep = defaults.rep;
  else rec.rep = clampRep(rec.rep);
  rec.tier = tierOf(rec.rep);
  rec.aggro = rec.rep <= AGGRO_THRESHOLD;
  if (!Number.isFinite(rec.bribesPaid)) rec.bribesPaid = 0;
  if (!rec.lastDelta || typeof rec.lastDelta !== 'object') rec.lastDelta = defaults.lastDelta;
  if (!Number.isFinite(rec.knownContrabandStrikes)) rec.knownContrabandStrikes = 0;
  if (!Number.isFinite(rec.discoveredHostileBy)) rec.discoveredHostileBy = 0;
  if (!Number.isFinite(rec.power)) rec.power = defaults.power;
  if (!Number.isFinite(rec.powerNonce)) rec.powerNonce = 0;
  return rec;
}

/** Ensure a runtime record exists for `id` (lazy, idempotent). Continue/old saves get missing fields filled here. */
function ensureFaction(state, id) {
  let rec = state.factions[id];
  if (!rec) rec = state.factions[id] = defaultFactionRecord(id);
  else backfillFactionRecord(rec, id);
  return rec;
}

function accumulateFactionPowerEntity(e, power, haulerByFac, stationByFac) {
  if (!e || !e.alive) return;
  const fid = e.factionId;
  if (fid == null || power[fid] == null) return;
  if (e.type === 'ship' && e.data && e.data.ai && e.data.ai.passive) {
    haulerByFac[fid] = (haulerByFac[fid] || 0) + 1;
  } else if (e.type === 'station' && !(e.data && e.data.isGate)) {
    stationByFac[fid] = (stationByFac[fid] || 0) + 1;
  }
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
    bus.on('faction:bribe', (p) => {
      const payload = (p && typeof p === 'object') ? p : {};
      payload.result = this.bribeStanding(payload);
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
      // PQ-170.00: the same kill ON a contested front is a physical tilt of the war — blockade
      // lanes, siege kills and wrecking-ball throws bank momentum toward the flip.
      this._feedFrontForKill(victim, p);
    });

    // Wrecking-ball clause: a thrown mass or a caused slam can kill with no conventional
    // killerId (missionConditions documents the slung-rock case), so the rep-gated listener
    // above never sees it. The compact causality receipt still says the player caused it —
    // honor the front tilt (and front tension) without touching reputation.
    bus.on('entity:killed', (p) => {
      if (!p || p.type !== 'ship' || !p.factionId) return;
      if (p.killerId === state.playerId) return; // handled by the rep listener above
      const causality = compactKillCausality(p, state.playerId);
      if (!causality.playerCaused) return;
      this._feedTensionForKill(p.factionId, p.pos);
      this._feedFrontForKill(p.factionId, p, causality);
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
      // Standing for the bust is already applied from economy's faction:repDelta. This
      // handler only owns the strike ledger so repeats escalate the next scan.
    });

    // Rescuing a faction distress call → standing gain (spec +20). Credits handled by economy.
    bus.on('distress:rescued', (p) => {
      if (p && p.factionId) this.applyRep(p.factionId, 20, 'rescue_faction_distress');
    });

    // PQ-170.01: a station module the player's throughput built, and a Concord rotation the
    // player's depot provisioned, are standing earned with freight. claims emits the facts; this
    // is the only place they touch rep.
    bus.on('station:moduleGained', (p) => {
      if (p && p.factionId) this.applyRep(p.factionId, STATION_GROWTH_REP, 'station_growth');
    });
    bus.on('claim:depotPatrolCompleted', (p) => {
      if (p && p.factionId) this.applyRep(p.factionId, DEPOT_PROVISIONING_REP, 'depot_provisioning');
    });
    bus.on('endgame:pullCompleted', (p) => {
      if (p && p.victimFactionId) {
        this.applyRep(p.victimFactionId, ENDGAME_PULL_VICTIM_REP, 'endgame_pull_victim');
      }
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
    // THE RUN SEAL (PQ-135). A Crucible run promises on its own door that nothing you earn there
    // follows you home, and this is the sole writer of player standing — so this is the one place
    // that promise can be kept for every path at once (kills, contraband, claims, encounters).
    // Without it, five waves of Crucible moved eight factions' standing, one of them by twenty-five
    // points, for fights that happened in a sealed arena the campaign never sees.
    if (isRunSealed(state)) return 0;
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

  bribeStanding(payload = {}) {
    const state = this.state || _state;
    const factionId = payload && typeof payload.factionId === 'string' ? payload.factionId : null;
    if (!state || !factionId || !META_BY_ID[factionId]) {
      return { ok: false, reason: 'unknown_faction', factionId, cost: 0, shortfall: 0 };
    }
    const cost = bribeCost(factionId);
    if (!Number.isFinite(cost)) {
      return { ok: false, reason: 'too_hated', factionId, cost: Infinity, shortfall: 0 };
    }
    if (cost <= 0) {
      return { ok: false, reason: 'not_hostile', factionId, cost: 0, shortfall: 0 };
    }
    const credits = Math.max(0, state.player && state.player.credits | 0);
    if (credits < cost) {
      return { ok: false, reason: 'short', factionId, cost, shortfall: cost - credits };
    }

    this.bus.emit('economy:chargeCredits', { amount: cost, reason: 'bribe:standing' });
    const rec = ensureFaction(state, factionId);
    const toFloor = -29 - rec.rep;
    const applied = toFloor > 0 ? this.applyRep(factionId, toFloor, 'bribe_standing') : 0;
    rec.bribesPaid = (rec.bribesPaid | 0) + 1;
    return {
      ok: true,
      reason: 'paid',
      factionId,
      cost,
      shortfall: 0,
      applied,
      newRep: rec.rep,
      newTier: rec.tier,
    };
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
    if (!c.front || typeof c.front !== 'object') c.front = freshFrontRecord();
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
      const lean = victim === a ? 1 : -1; // shooting A banks momentum for B (positive favors B)
      c.playerLean = Math.max(-1, Math.min(1, c.playerLean + lean * 0.1));
      this._refreshConflictState(key, c);
    }
  },

  // PQ-170.00 — the front is a physical situation. A kill that happens inside the pair's
  // contested sector banks momentum immediately (it resolves on the next war tick, and
  // immediately while the front is already at war): ordinary line kills count, hauler/logistics
  // kills read as a lane blockade, bastion/heavy hulls read as siege, and a kill the player
  // caused with thrown mass or a slam counts as the wrecking-ball verb. The bounded `front`
  // ledger rides the saved conflict record so a map or log can show who actually did the work.
  _feedFrontForKill(victim, payload, causality) {
    const state = this.state || _state;
    const sectorId = state && state.world && state.world.currentSectorId;
    if (!sectorId) return;
    const victimEntity = this._entityById(payload && payload.id);
    for (const key in CONTESTED) {
      const [a, b] = key.split(':');
      if (victim !== a && victim !== b) continue;
      if (CONTESTED[key] !== sectorId) continue;
      const c = this._ensureConflict(key);
      const lean = victim === a ? 1 : -1; // killing A's hulls on the front favors B
      c.playerLean = Math.max(-1, Math.min(1, c.playerLean + lean * FRONT_KILL_LEAN));
      c.tension = Math.max(0, Math.min(100, c.tension + FRONT_KILL_TENSION));
      const front = c.front;
      front.frontKills += 1;
      let kick = FRONT_KILL_MOMENTUM;
      const cls = String(payload && payload.victimClass || '').toLowerCase();
      if (SIEGE_CLASSES.has(cls) || SIEGE_HULLS.has(this._victimHullId(victimEntity))) {
        kick += SIEGE_MOMENTUM;
        front.siege += 1;
      }
      if (this._victimWasLogistics(victimEntity, payload)) {
        kick += BLOCKADE_MOMENTUM;
        front.blockade += 1;
      }
      const causal = causality || compactKillCausality(payload, state.playerId);
      if (causal.playerCaused === true
          && (causal.cause === KillCause.TERRAIN_COLLISION || causal.cause === KillCause.SHIP_COLLISION)) {
        kick += WRECKING_BALL_MOMENTUM;
        front.thrown += 1;
      }
      c.momentum = (c.momentum || 0) + lean * kick;
      this._refreshConflictState(key, c);
      if (this.bus) {
        this.bus.emit('conflict:frontAction', {
          pairKey: key,
          sectorId,
          lean,
          momentum: c.momentum,
          front: { ...front },
        });
      }
      // A live war resolves the banked tilt mid-fight; a colder front keeps the momentum banked
      // until the next war tick (or until the action itself boils the front over).
      this._resolveFlip(key, c);
    }
  },

  _entityById(id) {
    const state = this.state || _state;
    if (id == null || !state || !state.entities) return null;
    const entities = state.entities;
    if (typeof entities.get === 'function') return entities.get(id) || null;
    return null;
  },

  _victimHullId(entity) {
    const data = entity && entity.data;
    return String((data && (data.defId || data.shipId)) || (entity && entity.shipId) || '');
  },

  _victimWasLogistics(entity, payload) {
    const ai = entity && entity.data && entity.data.ai;
    if (ai && (ai.passive === true || LOGISTICS_ARCHETYPES.has(String(ai.archetype || '')))) {
      return true;
    }
    return /hauler|freight|convoy|trader|miner/.test(String(payload && payload.victimClass || '').toLowerCase());
  },

  // Offscreen tension injection (ADR-0002 / V2 §33). sectorSim owns no conflict state; it calls this
  // sanctioned method so factions remains the sole writer of state.conflicts (§0.6). The offscreen
  // engine feeds NPC-vs-NPC tension from danger + faction-power imbalance, which the existing war-
  // resolution loop (momentum → conflict:flip) then resolves into real territory shifts. Unlike
  // _feedTensionForKill, this does NOT touch playerLean (offscreen wars don't credit the player).
  addOffscreenTension(pairKey, delta, reason) {
    if (!pairKey || !delta) return;
    const c = this._ensureConflict(pairKey);
    c.tension = Math.max(0, Math.min(100, c.tension + delta));
    this._refreshConflictState(pairKey, c);
  },

  // Resolve the shared contested-sector catalog through the factions owner API for compatibility.
  contestedSectorFor(pairKey) {
    return contestedSectorForPair(pairKey);
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
      // Recompute faction power once per day so NPC activity (sector ownership, visible haulers,
      // military losses) feeds war momentum. Cheap: a single pass over sectors + entity list.
      this._recomputeFactionPower(state);
      for (const key in state.conflicts) {
        const c = state.conflicts[key];
        if (c.state !== 'war') continue;
        const [a, b] = key.split(':');
        const pa = (state.factions[a] && state.factions[a].power) || 0;
        const pb = (state.factions[b] && state.factions[b].power) || 0;
        // Momentum = player's direct lean + the NPC power imbalance. Positive (favoring B) when
        // either the player leaned toward B OR B is simply stronger. This replaces the "symmetric
        // baseStrength → momentum is player-driven" placeholder (audit #24).
        c.momentum = (c.momentum || 0) + c.playerLean * PLAYER_WEIGHT + (pb - pa) * POWER_WEIGHT;
        this._resolveFlip(key, c);
      }
    }
  },

  // Resolve one contested-sector flip when momentum runs away during a live war. Called from the
  // day tick and from the front-action feed, so a committed siege can turn the map mid-fight
  // instead of waiting for a boundary the player never sees.
  _resolveFlip(key, c) {
    const state = this.state || _state;
    if (!state || !c || c.state !== 'war') return false;
    if (Math.abs(c.momentum) < FLIP_THRESHOLD) return false;
    const [a, b] = key.split(':');
    const winner = c.momentum > 0 ? b : a; // positive lean/power favors side B
    const loser = winner === a ? b : a;
    const sectorId = CONTESTED[key];
    if (sectorId && state.world && state.world.sectors && state.world.sectors[sectorId]) {
      state.world.sectors[sectorId].owner = winner; // §0.6: factions writes sector owner
      if (this.bus) {
        this.bus.emit('conflict:flip', { pairKey: key, sectorId, newOwner: winner });
        this.bus.emit('toast', {
          text: `${sectorLabel(sectorId)} changes hands — ${factionLabel(winner)} takes it from ${factionLabel(loser)}`,
          kind: 'warn',
          ttl: 7,
        });
      }
    }
    // Reward the side the player favored; penalize the other (spec warResolve). Only apply the
    // rep swing if the player actually leaned (a pure NPC-power flip shouldn't credit the player).
    const leanMag = Math.abs(c.playerLean);
    if (leanMag > 0) {
      this.applyRep(winner, 20 * leanMag, 'war_won');
      this.applyRep(loser, -30 * leanMag, 'war_lost');
    }
    c.tension = 50; c.momentum = 0;
    this._refreshConflictState(key, c);
    return true;
  },

  // Recompute each faction's `power` from world state: sector ownership (territory = power base),
  // visible economic activity (NPC haulers of that faction = trade power), minus recent military
  // losses (a faction losing ships is weakening). Kept cheap and bounded so a day-tick is fine.
  // This is the "faction power table" the audit (factions.js:331 comment) said was missing.
  _recomputeFactionPower(state) {
    if (!state.factions || !state.world) return;
    // Start every faction at a baseline so even un-tracked factions have a little inertia.
    const power = {};
    for (const id of FACTION_IDS) power[id] = 5;

    // (1) Territory: each owned sector adds power.
    const sectors = (state.world && state.world.sectors) || {};
    for (const sid in sectors) {
      const owner = sectors[sid].owner;
      if (owner && power[owner] != null) power[owner] += 6;
    }

    // (2) Economic activity: count visible NPC haulers per faction (the traffic system spawns these;
    // their presence = that faction is trading = economic power). Capped so a busy sector doesn't
    // dominate. Also count live stations of the faction (infrastructure).
    const haulerByFac = {};
    const stationByFac = {};
    const index = state.entityIndex && state.entityIndex.__spacefaceEntityIndexV1 ? state.entityIndex : null;
    if (index) {
      for (const e of index.ships || []) accumulateFactionPowerEntity(e, power, haulerByFac, stationByFac);
      for (const e of index.stations || []) accumulateFactionPowerEntity(e, power, haulerByFac, stationByFac);
    } else {
      forEachLivingWorldActor(state, (e) => accumulateFactionPowerEntity(e, power, haulerByFac, stationByFac));
    }
    for (const id of FACTION_IDS) {
      power[id] += Math.min(12, (haulerByFac[id] || 0) * 2);  // haulers: trade power, capped
      power[id] += Math.min(8, (stationByFac[id] || 0) * 3);   // stations: infrastructure
    }

    // (2b) PQ-170.01: player-built infrastructure the faction leans on. Read-only over the
    // claims-owned ledger; the authored rung carries the number so data stays the single source.
    const growth = state.claims && state.claims.stationGrowth;
    if (growth && typeof growth === 'object') {
      for (const stationId in growth) {
        const rec = growth[stationId];
        if (!rec || !rec.factionId || power[rec.factionId] == null || !(rec.rung > 0)) continue;
        const step = stationGrowthLadderFor({ type: rec.type })[rec.rung - 1];
        if (step) power[rec.factionId] += Math.max(0, Number(step.powerBonus) || 0);
      }
    }
    const claimBodies = state.claims && state.claims.bodies;
    if (Array.isArray(claimBodies) && power.faction_scn != null) {
      for (const body of claimBodies) {
        if (body && body.depotSupport && body.depotSupport.supported === true) {
          power.faction_scn += DEPOT_SUPPORT_POWER;
        }
      }
    }
    const pulls = state.claims && state.claims.endgamePulls;
    if (pulls && pulls.completed && typeof pulls.completed === 'object') {
      const order = Array.isArray(pulls.completedOrder) ? pulls.completedOrder : Object.keys(pulls.completed);
      for (const pullId of order) {
        const rec = pulls.completed[pullId];
        const victim = rec && rec.victimFactionId;
        if (victim && power[victim] != null) power[victim] = Math.max(2, power[victim] - ENDGAME_PULL_POWER);
      }
    }

    // (3) Military health: a faction at -aggro (losing the war of attrition) is weakened. This ties
    // standing to power so a hated faction is also militarily diminished.
    for (const id of FACTION_IDS) {
      const rec = state.factions[id];
      if (!rec) continue;
      if (rec.aggro) power[id] = Math.max(2, power[id] - 6); // bleeding support
    }

    // Commit (eased toward the new value so power doesn't lurch day-to-day; reads as a slow shift).
    for (const id of FACTION_IDS) {
      const rec = state.factions[id];
      if (!rec) continue;
      const target = power[id];
      rec.power = rec.power + (target - rec.power) * 0.5;
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

/** Choice A's commission removes station markups, but never creates a discount by itself. */
export function stationSurchargeWaiverActive(state = _state) {
  return state?.story?.flags?.surcharges_cleared === true;
}

/** Pure standing-price read used by economy quotes and focused consequence tests. */
export function priceModForState(state, factionId) {
  const rec = state && state.factions ? state.factions[factionId] : null;
  const rep = rec ? rec.rep : 0;
  const t = Math.max(-1, Math.min(1, rep / 1000));
  const standingBuy = Math.max(0.70, Math.min(1.40,
    1 - 0.30 * Math.max(0, t) + 0.40 * Math.max(0, -t)));
  const sell = Math.max(0.70, Math.min(1.20,
    1 + 0.20 * Math.max(0, t) - 0.30 * Math.max(0, -t)));
  const surchargeWaived = standingBuy > 1 && stationSurchargeWaiverActive(state);
  return { buy: surchargeWaived ? 1 : standingBuy, sell, surchargeWaived };
}

/** Buy/sell price multipliers from standing (spec getRepPriceMod). Economy multiplies base price
 *  by these: t = rep/1000; allies get discounts, hostiles a surcharge. Returns {buy, sell}. */
export function priceMod(factionId) {
  return priceModForState(_state, factionId);
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
