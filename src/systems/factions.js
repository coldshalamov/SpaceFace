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
import { FACTION_BACKROOM } from '../data/factionPlay.js';
import { NEW_GAME } from '../data/newGameDefaults.js';
import { SECTORS } from '../data/sectors.js';
import { WEAPONS } from '../data/weapons.js';
import {
  CONTESTED_SECTOR_BY_PAIR,
  conflictPairsForSector,
  contestedSectorForPair,
} from '../data/conflictZones.js';
import { makeShipEntitySpec } from './ships.js';

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
const CONFLICT_SALVAGE_COMMODITY_ID = 'cmdty_classified_salvage';
const CONFLICT_SALVAGE_QTY = 3;
const CONFLICT_REP_REWARD = 18;
const LICENSED_FIT_BY_ID = new Map(
  WEAPONS.filter((def) => def && def.factionLicense).map((def) => [def.id, def]),
);

// Contested sectors flippable in war: pairKey → sectorId (spec CONTESTED SECTORS, sector_ ids).
const CONTESTED = CONTESTED_SECTOR_BY_PAIR;

// ── Static lookups derived from FACTION_META once at module load ────────────────────────────
const META_BY_ID = Object.create(null);
const FACTION_IDS = [];
for (const f of FACTION_META) { META_BY_ID[f.id] = f; FACTION_IDS.push(f.id); }
const STATION_BY_ID = new Map();
for (const sector of SECTORS) {
  for (const station of sector.stations || []) {
    STATION_BY_ID.set(station.id, {
      ...station,
      factionId: station.factionId || sector.factionId || null,
      sectorId: sector.id,
    });
  }
}

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
      // V2 §28b/§24 — faction power drives war momentum independent of the player. Derived
      // periodically from sector ownership + visible economic/military activity. See
      // _recomputeFactionPower. Starts at a small neutral baseline so wars can grind without us.
      power: 10,
      powerNonce: 0,
    };
  }
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
    bus.on('save:loaded', () => this._resetStaleActiveFronts());
    bus.on('sector:enter', (p) => this._resetStaleActiveFronts(p && p.sectorId));

    // Sole rep-mutation entry point for every other system (§0.6).
    bus.on('faction:repDelta', ({ factionId, delta, reason }) => {
      this.applyRep(factionId, delta, reason || 'event');
    });

    // Killing a ship: lower rep with the victim's faction (if witnessed), raise rep a little with
    // that faction's enemies. Only the player's own kills move the player's standing.
    bus.on('entity:killed', (p) => {
      if (!p || p.type !== 'ship' || !p.factionId) return;
      this._observeConflictFrontKill(p);
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

    // UI emits one intent; factions validates and spawns the front it already owns. Weapons,
    // tactical AI, physics and combat remain the only authorities that can fight or resolve it.
    bus.on('ui:chooseConflictSide', (p) => {
      if (p && typeof p === 'object') p.result = this.chooseConflictSide(p);
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

  /** Read-only standing gate consumed by economy's point-of-sale transaction. */
  licensedFitOffer(defId) {
    return factionLicensedFitOfferForState(this.state || _state, defId);
  },

  /** Materialize one bounded faction front in the live contested sector. */
  chooseConflictSide({ pairKey, sideId } = {}) {
    const state = this.state || _state;
    const sectorId = state && state.world && state.world.currentSectorId;
    const sides = typeof pairKey === 'string' ? pairKey.split(':') : [];
    if (!state || sides.length !== 2 || !sides.includes(sideId)) {
      return { ok: false, reason: 'invalid_side' };
    }
    if (contestedSectorForPair(pairKey) !== sectorId) {
      return { ok: false, reason: 'wrong_sector' };
    }
    const conflict = this._ensureConflict(pairKey);
    if (conflict.front && (conflict.front.status === 'active' || conflict.front.status === 'resolved')) {
      return { ok: false, reason: conflict.front.status === 'resolved' ? 'already_resolved' : 'already_active' };
    }
    const player = state.entities && state.entities.get && state.entities.get(state.playerId);
    if (!player || !player.pos || !this.helpers || typeof this.helpers.spawnEntity !== 'function') {
      return { ok: false, reason: 'player_not_present' };
    }

    const opponentId = sides[0] === sideId ? sides[1] : sides[0];
    // Stage outside lawful station-protection volumes so the shared engagement authority can
    // authorize an actual faction fight. Helios has the larger 1,400-WU starter sanctuary.
    const stagingDistance = sectorId === 'sector_helios_prime' ? 1500 : 700;
    const anchor = { x: player.pos.x + stagingDistance, z: player.pos.z };
    const spawnSide = (factionId, team, offsets) => offsets.map((offset, index) => {
      const concord = factionId === 'faction_scn';
      const fittings = concord
        ? ['wpn_flak_turret_s', 'wpn_pulse_laser_s']
        : ['wpn_autocannon_s', 'wpn_pulse_laser_s'];
      const spec = makeShipEntitySpec('ship_wasp', {
        team,
        factionId,
        fittings,
        pos: { x: anchor.x + offset.x, z: anchor.z + offset.z },
        rot: team === 0 ? 0 : Math.PI,
        ai: {
          archetype: 'fighter',
          passive: false,
          spawnContext: 'conflict_zone',
          roe: 'weapons_free',
          combatDoctrineId: concord ? 'ranged_disengager' : 'interceptor_flyby',
          motive: 'hold_conflict_front',
          engagementTrigger: 'player_side_choice',
          zoneId: sectorId,
          approachTelegraph: 'conflict_weapons_hot',
          noFireResponseWindowS: 1,
          capabilities: concord ? ['point_defence', 'ranged'] : ['ranged'],
          activity: {
            kind: 'attack_run',
            reason: `conflict_front:${pairKey}`,
            anchor: { ...anchor },
            leashRadius: 1100,
            preferredRange: concord ? 240 : 320,
            startedTick: state.tick | 0,
            targetId: null,
          },
        },
      });
      spec.data.conflictFront = { pairKey, sideId: factionId, index };
      return this.helpers.spawnEntity(spec);
    });
    const allies = spawnSide(sideId, 0, [{ x: -60, z: -50 }, { x: -60, z: 50 }]);
    const opponents = spawnSide(opponentId, 1, [{ x: 60, z: -50 }, { x: 60, z: 50 }]);
    if (allies.some((entity) => !entity) || opponents.some((entity) => !entity)) {
      for (const entity of [...allies, ...opponents]) if (entity) entity.alive = false;
      return { ok: false, reason: 'spawn_failed' };
    }
    for (let i = 0; i < 2; i++) {
      const ally = allies[i], opponent = opponents[i];
      ally.data.ai.activity.targetId = opponent.id;
      ally.data.ai.retaliationTargetId = opponent.id;
      opponent.data.ai.activity.targetId = ally.id;
      opponent.data.ai.retaliationTargetId = ally.id;
    }

    conflict.tension = Math.min(100, (Number(conflict.tension) || 0) + 12);
    conflict.front = {
      status: 'active',
      pairKey,
      sectorId,
      chosenSide: sideId,
      opponentSide: opponentId,
      allyIds: allies.map((entity) => entity.id),
      opponentIds: opponents.map((entity) => entity.id),
      anchor: { ...anchor },
      startedAt: Number(state.simTime) || 0,
    };
    this._refreshConflictState(pairKey, conflict);
    const receipt = { ok: true, ...conflict.front };
    this.bus.emit('conflict:sideChosen', receipt);
    if (state.nav && !state.nav.waypoint) {
      state.nav.waypoint = {
        kind: 'conflict_front',
        markerKind: 'mission-objective',
        pairKey,
        sectorId,
        pos: { ...anchor },
        label: 'CONFLICT FRONT',
        reason: `${META_BY_ID[sideId]?.name || sideId} border skirmish`,
        arrivalRadius: 220,
      };
      this.bus.emit('nav:waypoint', state.nav.waypoint);
    }
    this.bus.emit('toast', {
      text: `Joined ${META_BY_ID[sideId]?.name || sideId} — conflict front marked ${stagingDistance} wu local-east`,
      kind: 'info',
      ttl: 5,
    });
    return receipt;
  },

  /** Observe exact front casualties before the ordinary player-kill reputation path. An allied
   * victory earns no player rights, but it also cannot strand an exhausted transient front. */
  _observeConflictFrontKill(payload) {
    const state = this.state || _state;
    if (!state || !payload) return null;
    for (const pairKey of conflictPairsForSector(state.world && state.world.currentSectorId)) {
      const conflict = state.conflicts && state.conflicts[pairKey];
      const front = conflict && conflict.front;
      if (!front || front.status !== 'active' || !front.opponentIds.includes(payload.id)) continue;
      if (payload.killerId === state.playerId) return this._resolveConflictFrontKill(payload);

      const opponentsRemain = front.opponentIds.some((id) => {
        const entity = state.entities && state.entities.get && state.entities.get(id);
        return !!(entity && entity.alive !== false);
      });
      if (opponentsRemain) return null;

      delete conflict.front;
      if (state.nav?.waypoint?.kind === 'conflict_front'
        && state.nav.waypoint.pairKey === pairKey) {
        state.nav.waypoint = null;
        this.bus.emit('nav:waypoint', null);
      }
      const receipt = { pairKey, outcome: 'allies_won', salvageRights: false };
      this.bus.emit('conflict:skirmishUnclaimed', receipt);
      this.bus.emit('toast', {
        text: 'Allied pilots won the skirmish before you secured salvage rights — front available to retry',
        kind: 'info',
        ttl: 5,
      });
      return receipt;
    }
    return null;
  },

  /** One player-earned opposing kill resolves the front and materializes one physical rights lot. */
  _resolveConflictFrontKill(payload) {
    const state = this.state || _state;
    if (!state || !payload || payload.killerId !== state.playerId) return null;
    for (const pairKey of conflictPairsForSector(state.world && state.world.currentSectorId)) {
      const conflict = state.conflicts && state.conflicts[pairKey];
      const front = conflict && conflict.front;
      if (!front || front.status !== 'active' || !front.opponentIds.includes(payload.id)) continue;
      const rightId = `conflict-right:${pairKey}:${front.chosenSide}:${state.tick | 0}`;
      front.status = 'resolved';
      front.resolvedAt = Number(state.simTime) || 0;
      front.resolvedKillId = payload.id;
      front.salvageRightId = rightId;
      const sides = pairKey.split(':');
      conflict.playerLean = Math.max(-1, Math.min(1,
        (Number(conflict.playerLean) || 0) + (front.chosenSide === sides[1] ? 0.25 : -0.25)));
      this.applyRep(front.chosenSide, CONFLICT_REP_REWARD, 'conflict_zone_support');

      const pickup = this.helpers && typeof this.helpers.spawnEntity === 'function'
        ? this.helpers.spawnEntity({
          type: 'pickup',
          pos: { x: payload.pos.x + 8, z: payload.pos.z },
          vel: { x: 0, z: 0 },
          radius: 2.2,
          mass: 0.1,
          collides: true,
          data: {
            kind: 'cargo',
            commodityId: CONFLICT_SALVAGE_COMMODITY_ID,
            amount: CONFLICT_SALVAGE_QTY,
            despawnAt: (Number(state.simTime) || 0) + 90,
            richLotSource: {
              lotId: rightId,
              provenanceId: rightId,
              sourceKind: 'conflict_salvage_right',
              sourceOwner: 'player',
              choiceId: front.chosenSide,
              richQty: CONFLICT_SALVAGE_QTY,
            },
          },
        })
        : null;
      const receipt = {
        pairKey,
        sideId: front.chosenSide,
        defeatedSide: front.opponentSide,
        killId: payload.id,
        salvageRightId: rightId,
        pickupId: pickup && pickup.id,
        salvageQty: CONFLICT_SALVAGE_QTY,
      };
      if (state.nav?.waypoint?.kind === 'conflict_front'
        && state.nav.waypoint.pairKey === pairKey) {
        state.nav.waypoint = null;
        this.bus.emit('nav:waypoint', null);
      }
      this.bus.emit('conflict:skirmishResolved', receipt);
      this.bus.emit('toast', { text: 'Skirmish won — classified salvage rights granted', kind: 'success', ttl: 4 });
      return receipt;
    }
    return null;
  },

  /** Conflict actors are sector-local and intentionally not save entities. Continue or a sector
   * transition may therefore retain an active receipt after every exact actor disappeared. Reset
   * only that stale active attempt; resolved fronts and their earned-right provenance are durable. */
  _resetStaleActiveFronts(enteredSectorId = null) {
    const state = this.state || _state;
    if (!state || !state.conflicts) return 0;
    let reset = 0;
    for (const conflict of Object.values(state.conflicts)) {
      const front = conflict && conflict.front;
      if (!front || front.status !== 'active') continue;
      const actorIds = [...(front.allyIds || []), ...(front.opponentIds || [])];
      const actorStillPresent = actorIds.some((id) => {
        const entity = state.entities && state.entities.get && state.entities.get(id);
        return !!(entity && entity.alive !== false && entity.data?.conflictFront?.pairKey === front.pairKey);
      });
      const leftSector = enteredSectorId && enteredSectorId !== front.sectorId;
      if (!leftSector && actorStillPresent) continue;
      delete conflict.front;
      reset++;
    }
    if (reset > 0 && this.bus) this.bus.emit('conflict:staleFrontReset', { count: reset });
    return reset;
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
        if (Math.abs(c.momentum) >= FLIP_THRESHOLD) {
          const winner = c.momentum > 0 ? b : a; // positive lean/power favors side B
          const loser = winner === a ? b : a;
          const sectorId = CONTESTED[key];
          if (sectorId && state.world && state.world.sectors && state.world.sectors[sectorId]) {
            state.world.sectors[sectorId].owner = winner; // §0.6: factions writes sector owner
            if (this.bus) this.bus.emit('conflict:flip', { pairKey: key, sectorId, newOwner: winner });
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
        }
      }
    }
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
      for (const e of state.entityList || []) accumulateFactionPowerEntity(e, power, haulerByFac, stationByFac);
    }
    for (const id of FACTION_IDS) {
      power[id] += Math.min(12, (haulerByFac[id] || 0) * 2);  // haulers: trade power, capped
      power[id] += Math.min(8, (stationByFac[id] || 0) * 3);   // stations: infrastructure
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
    this._resetStaleActiveFronts();
  },
};

// ── Public read API (consumed by economy / ai / missions / ui; never mutates state) ───────────

/** Runtime standing record for a faction (rep, tier, aggro, …). Read-only snapshot semantics. */
export function getStanding(factionId) {
  if (!_state || !_state.factions) return null;
  return _state.factions[factionId] || null;
}

/** Pure licensed-fit read for economy/UI. Authored standing controls access, not item stats. */
export function factionLicensedFitOfferForState(state, defId) {
  const def = LICENSED_FIT_BY_ID.get(defId);
  if (!def) return null;
  const license = def.factionLicense;
  const currentRep = Number(state?.factions?.[license.factionId]?.rep) || 0;
  const price = Math.max(0, Math.round((Number(def.price) || 0)
    * priceModForState(state, license.factionId).buy));
  return {
    defId: def.id,
    name: def.name,
    factionId: license.factionId,
    minRep: Number(license.minRep) || 0,
    currentRep,
    price,
    available: currentRep >= (Number(license.minRep) || 0),
    def,
  };
}

export function factionLicensedFitOffersForState(state, factionId = null) {
  const offers = [];
  for (const defId of LICENSED_FIT_BY_ID.keys()) {
    const offer = factionLicensedFitOfferForState(state, defId);
    if (offer && (!factionId || offer.factionId === factionId)) offers.push(offer);
  }
  return offers;
}

/** Trusted standing opens the discreet room inside a legitimate faction station. The service
 * remains separate from authored black-market stations: this is access earned inside the law. */
export function factionBackroomAccessForState(state, stationId) {
  const station = STATION_BY_ID.get(stationId);
  if (!station || station.type === 'blackmarket' || !station.factionId) return null;
  const currentRep = Number(state?.factions?.[station.factionId]?.rep) || 0;
  return {
    stationId: station.id,
    stationName: station.name,
    factionId: station.factionId,
    minRep: FACTION_BACKROOM.minRep,
    currentRep,
    available: currentRep >= FACTION_BACKROOM.minRep,
    serviceId: FACTION_BACKROOM.serviceId,
  };
}

/** Current-sector conflict choices for the player-facing station surface. */
export function conflictChoicesForState(state) {
  const sectorId = state && state.world && state.world.currentSectorId;
  if (!sectorId) return [];
  return conflictPairsForSector(sectorId).flatMap((pairKey) => {
    const sides = pairKey.split(':');
    const front = state.conflicts && state.conflicts[pairKey] && state.conflicts[pairKey].front;
    return sides.map((sideId) => ({
      pairKey,
      sideId,
      opponentId: sides[0] === sideId ? sides[1] : sides[0],
      available: !front,
      status: front ? front.status : 'available',
      chosen: !!front && front.chosenSide === sideId,
      anchor: front && front.anchor ? { ...front.anchor } : null,
    }));
  });
}

/** Exact customs exemption quantity proven by a resolved front and its physical rich-lot receipt. */
export function earnedConflictSalvageQtyForState(state, commodityId) {
  if (commodityId !== CONFLICT_SALVAGE_COMMODITY_ID) return 0;
  const lots = state?.player?.cargo?.richLots;
  if (!Array.isArray(lots)) return 0;
  const validRights = new Set();
  for (const conflict of Object.values(state.conflicts || {})) {
    const front = conflict && conflict.front;
    if (front && front.status === 'resolved' && front.salvageRightId) validRights.add(front.salvageRightId);
  }
  let qty = 0;
  for (const lot of lots) {
    if (!lot || lot.commodityId !== commodityId || lot.sourceKind !== 'conflict_salvage_right') continue;
    if (lot.sourceOwner !== 'player' || !validRights.has(lot.provenanceId)) continue;
    qty += Math.max(0, Math.floor(Number(lot.qty) || 0));
  }
  return qty;
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
