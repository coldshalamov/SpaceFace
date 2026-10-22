// faction_pitborn.js — W-PITBORN (build_map §34.5 row 519, bible 02 §13).
//
// The Pitborn play Katamari as sport. Done-when:
//   · the Cull crowd meter (E-40): style kills fill it, it decays, tiers bark Ma Sprocket
//     lines, the purse scales with the settled score; dressing data (crowd/banners/board)
//   · the Yardmaster: procedurally accreted from the 43 WRECK_AFTERMATH_MODELS pieces and
//     dismantled piece by piece — every stripped piece drops as a keepable wreck body
//   · ballast balls in five sizes; balls accrete contacting junk and visibly bulk
//   · Ballast against Clatter (E-41): biggest junk ball at the horn; the yard names a ball
//   · Magnet Head: the Cull sells it (data + sale hook)
//
// Deterministic: accretion order, spills and Clatter's pace read seed/simTime only.

import {
  PITBORN_BALLAST_BALLS,
  PITBORN_BALLAST_ACCRETE,
  PITBORN_BALLAST_MATCH,
  PITBORN_CULL,
  PITBORN_YARDMASTER,
  PITBORN_MAGNET_HEAD,
  PITBORN_BARKS,
} from '../data/factions/pitborn.js';
import { WRECK_AFTERMATH_MODELS } from '../data/wreckAftermathDressing.js';
import { styleCauseFromKill } from './survivalStyle.js';

const FACTION_ID = 'faction_pitborn';
const BALLAST_BY_ID = Object.fromEntries(PITBORN_BALLAST_BALLS.map((b) => [b.id, b]));
const EDIBLE = new Set(PITBORN_BALLAST_ACCRETE.edibleTypes);
const dist2 = (a, b) => { const dx = a.x - b.x, dz = a.z - b.z; return dx * dx + dz * dz; };

/** Fresh serializable Pitborn record: crowd meter, leaderboard, named balls, the match. */
export function ensurePitbornState(state) {
  if (!state.pitborn || typeof state.pitborn !== 'object') {
    state.pitborn = {
      crowd: { score: 0, tier: 'cold', peak: 0 },
      leaderboard: [], namedBalls: [], ballastMatch: null,
    };
  }
  const p = state.pitborn;
  if (!p.crowd || typeof p.crowd !== 'object') p.crowd = { score: 0, tier: 'cold', peak: 0 };
  if (!Array.isArray(p.leaderboard)) p.leaderboard = [];
  if (!Array.isArray(p.namedBalls)) p.namedBalls = [];
  if (p.ballastMatch === undefined) p.ballastMatch = null;
  return p;
}

export function crowdTierFor(score) {
  let tier = PITBORN_CULL.tiers[0];
  for (const t of PITBORN_CULL.tiers) if (score >= t.at) tier = t;
  return tier;
}

/** The Cull purse at a crowd score — style pays. */
export function cullPurseFor(score) {
  return Math.round(PITBORN_CULL.purseBase + Math.max(0, score) * PITBORN_CULL.pursePerPoint);
}

/** Spawn a ballast ball in one of the five authored sizes. */
export function spawnBallastBall(state, helpers, { sizeId, x, z, ownerId = null }) {
  const spec = BALLAST_BY_ID[sizeId] || PITBORN_BALLAST_BALLS[0];
  return helpers.spawnEntity({
    type: 'junk', team: 1, factionId: FACTION_ID,
    pos: { x, z }, vel: { x: 0, z: 0 }, rot: 0,
    radius: spec.radius, mass: spec.mass, hull: spec.mass * 4, hullMax: spec.mass * 4,
    collides: true,
    data: {
      ballastBall: true, ballastSizeId: spec.id, baseRadius: spec.radius,
      accretedMass: 0, ownerId, name: spec.label, scannable: true,
      scanLabel: `BALLAST · ${spec.label.toUpperCase()} · accrete it bigger`,
    },
  });
}

/** Spawn the Yardmaster, procedurally accreted: one piece per aftermath model, seeded. */
export function spawnYardmaster(state, helpers, { x, z, seed = null }) {
  const rng = () => state.rng();
  // Seeded shuffle of the 43 aftermath models — every Yardmaster is a different colossus.
  const pool = WRECK_AFTERMATH_MODELS.slice();
  if (seed != null) {
    // Deterministic order from the caller's seed without touching state.rng.
    let s = seed >>> 0 || 1;
    const draw = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 0xffffffff; };
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(draw() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  } else {
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  }
  const pieces = pool.slice(0, PITBORN_YARDMASTER.pieceCount).map((m, i) => ({
    idx: i, modelId: m.id, kind: m.kind, label: m.label, hull: PITBORN_YARDMASTER.pieceHull, attached: true,
  }));
  const totalMass = pieces.reduce((a, p, i) => a + 20 + (WRECK_AFTERMATH_MODELS[i]?.longestM || 10), 0);
  const e = helpers.spawnEntity({
    type: 'ship', team: 1, factionId: FACTION_ID,
    pos: { x, z }, vel: { x: 0, z: 0 }, rot: 0,
    radius: 320, mass: totalMass, hull: pieces.length * PITBORN_YARDMASTER.pieceHull,
    hullMax: pieces.length * PITBORN_YARDMASTER.pieceHull, collides: true,
    flags: { persistent: true },
    data: {
      yardmaster: true, name: PITBORN_YARDMASTER.name, role: 'yardmaster-capital',
      scannable: true,
      scanLabel: `YARDMASTER · ${pieces.length} accreted pieces · strip it, keep the pieces`,
      pieces,
    },
  });
  return e;
}

export const pitbornCull = {
  name: 'pitbornCull',

  init(ctx) {
    this.ctx = ctx; this.state = ctx.state; this.bus = ctx.bus; this.helpers = ctx.helpers;
    this._subs = [
      this.bus.on('entity:killed', (p) => this._onKilled(p)),
    ];
    this._yardHull = new Map(); // entityId -> last hull, for piece-strip deltas
    ensurePitbornState(this.state);
  },

  // ── The Cull crowd meter (E-40) ──────────────────────────────────────────────────
  _onKilled(p) {
    if (!p || p.killerId !== this.state.playerId) return;
    // Authored style kinds ('catch', 'multikill', 'impact', 'ballastFeed') score their own
    // row before the generic family lookup can flatten them.
    const authored = typeof p.styleCause === 'string' && PITBORN_CULL.stylePoints[p.styleCause] != null
      ? p.styleCause : null;
    const cause = authored || styleCauseFromKill(p) || 'kill';
    // The yard reads causes in its own register: a collision kill is an impact kill.
    const style = PITBORN_CULL.stylePoints[cause] != null ? cause
      : cause === 'collision' || cause === 'terrain' ? 'impact'
      : 'kill';
    this.awardCrowdStyle(this.state, style, PITBORN_CULL.stylePoints[style], p);
  },

  /** Style lands on the meter — the arena rates you live. */
  awardCrowdStyle(state, cause, points, payload = null) {
    const pit = ensurePitbornState(state);
    const before = crowdTierFor(pit.crowd.score);
    pit.crowd.score = Math.min(PITBORN_CULL.crowdMax, pit.crowd.score + Math.max(0, points || 0));
    pit.crowd.peak = Math.max(pit.crowd.peak, pit.crowd.score);
    const tier = crowdTierFor(pit.crowd.score);
    pit.crowd.tier = tier.id;
    this.bus.emit('pitborn:crowdStyle', {
      cause, points, score: pit.crowd.score, tier: tier.id, tick: state.tick,
    });
    if (tier !== before) {
      const line = tier.id === 'count'
        ? "COUNT 'EM! COUNT 'EM!"
        : PITBORN_BARKS.crowdUp[Math.floor(state.rng() * PITBORN_BARKS.crowdUp.length)];
      this.bus.emit('comms:log', { text: line, speaker: PITBORN_BARKS.announcer });
      this.bus.emit('pitborn:crowdTier', { tier: tier.id, score: pit.crowd.score, tick: state.tick });
    }
    // The scoreboard redraws crowd score and purse for the arena dressing lane.
    this.bus.emit('pitborn:scoreboard', {
      score: pit.crowd.score, tier: tier.id, purse: cullPurseFor(pit.crowd.score), tick: state.tick,
    });
    return pit.crowd.score;
  },

  /** Settle the Cull: record the run on the yard leaderboard and pay the purse. */
  settleCull(state, { killed = 0 } = {}) {
    const pit = ensurePitbornState(state);
    const purse = cullPurseFor(pit.crowd.score);
    pit.leaderboard.push({
      score: Math.round(pit.crowd.score), peak: Math.round(pit.crowd.peak),
      purse, kills: killed, settledAt: state.simTime,
    });
    while (pit.leaderboard.length > 16) pit.leaderboard.shift();
    this.bus.emit('pitborn:cullSettled', {
      score: pit.crowd.score, purse, kills: killed, tick: state.tick,
    });
    this.bus.emit('economy:grantCredits', { amount: purse, reason: 'pitborn_cull_purse' });
    pit.crowd.score = 0;
    pit.crowd.tier = 'cold';
    return purse;
  },

  // ── Ballast balls ──────────────────────────────────────────────────────────────
  _accreteBalls(state) {
    for (const ball of state.entityList) {
      if (!ball || ball.alive === false || ball.data?.ballastBall !== true) continue;
      const reach = ball.radius + 6;
      for (const prey of state.entityList) {
        if (prey === ball || !prey || prey.alive === false || !EDIBLE.has(prey.type)) continue;
        if (prey.data?.ballastBall === true) continue;
        const rr = reach + (Number(prey.radius) || 0);
        if (dist2(prey.pos, ball.pos) > rr * rr) continue;
        const gained = Math.max(0, Number(prey.mass) || 0) * PITBORN_BALLAST_ACCRETE.yield;
        ball.data.accretedMass += gained;
        ball.mass += gained;
        ball.radius = ball.data.baseRadius + ball.data.accretedMass * PITBORN_BALLAST_ACCRETE.radiusPerMass;
        this.helpers.removeEntity(prey.id, { reason: 'ballast_accreted' });
        this.bus.emit('pitborn:ballastAccreted', {
          ballId: ball.id, eatenId: prey.id, gained, accretedMass: ball.data.accretedMass,
          tick: state.tick,
        });
      }
    }
  },

  // ── E-41 Ballast vs Clatter ────────────────────────────────────────────────────
  startBallastMatch(state, { playerBallId = null } = {}) {
    const pit = ensurePitbornState(state);
    pit.ballastMatch = {
      playerBallId,
      clatterMass: PITBORN_BALLAST_MATCH.clatterSeededBonus,
      hornAt: state.simTime + PITBORN_BALLAST_MATCH.matchS,
      over: false, winner: null, purse: 0,
    };
    this.bus.emit('pitborn:ballastStart', { hornAt: pit.ballastMatch.hornAt, tick: state.tick });
    this.bus.emit('comms:log', { text: PITBORN_BARKS.ballastStart, speaker: PITBORN_BARKS.announcer });
    return pit.ballastMatch;
  },

  _tickBallastMatch(state) {
    const match = ensurePitbornState(state).ballastMatch;
    if (!match || match.over) return;
    // Clatter's ball grows on a seeded-but-steady yard pace — deterministic, beatable.
    match.clatterMass += PITBORN_BALLAST_MATCH.clatterAccretePerS / 60;
    const ball = match.playerBallId != null ? state.entities.get(match.playerBallId) : null;
    const playerMass = ball && ball.alive !== false
      ? (Number(ball.mass) || 0) + (Number(ball.data?.accretedMass) || 0)
      : 0;
    match.playerMass = playerMass;
    if (state.simTime >= match.hornAt) {
      match.over = true;
      match.winner = playerMass > match.clatterMass ? 'player' : PITBORN_BALLAST_MATCH.rival;
      this.bus.emit('pitborn:ballastHorn', {
        winner: match.winner, playerMass, clatterMass: match.clatterMass, tick: state.tick,
      });
      this.bus.emit('comms:log', { text: PITBORN_BALLAST_MATCH.hornLine, speaker: PITBORN_BARKS.announcer });
      if (match.winner === 'player') {
        const name = `Ball of ${state.player?.callsign || 'the Pilot'}`;
        ensurePitbornState(state).namedBalls.push({ name, mass: playerMass, namedAt: state.simTime });
        this.bus.emit('comms:log', { text: PITBORN_BALLAST_MATCH.winLine, speaker: PITBORN_BARKS.announcer });
        this.bus.emit('pitborn:ballastNamed', { name, ballId: match.playerBallId, tick: state.tick });
      } else {
        this.bus.emit('comms:log', { text: PITBORN_BALLAST_MATCH.loseLine, speaker: PITBORN_BARKS.announcer });
      }
    }
  },

  // ── The Yardmaster, dismantled piece by piece ──────────────────────────────────
  _tickYardmasters(state) {
    for (const e of state.entityList) {
      if (!e || e.alive === false || !e.data?.yardmaster) continue;
      const last = this._yardHull.has(e.id) ? this._yardHull.get(e.id) : e.hull;
      this._yardHull.set(e.id, e.hull);
      const dmg = Math.max(0, (Number(last) || 0) - (Number(e.hull) || 0));
      if (dmg <= 0) continue;
      const pieces = e.data.pieces || [];
      // Damage strips the outermost attached pieces — one per pieceHull of real damage,
      // always at least one per hit. You keep what falls off.
      const strip = Math.max(1, Math.floor(dmg / PITBORN_YARDMASTER.pieceHull));
      let stripped = 0;
      for (const piece of pieces) {
        if (stripped >= strip) break;
        if (!piece.attached) continue;
        piece.attached = false;
        stripped += 1;
        const a = state.rng() * Math.PI * 2;
        const r = PITBORN_YARDMASTER.pieceScatterR * (0.3 + state.rng() * 0.7);
        this.helpers.spawnEntity({
          type: 'debris', team: 0,
          pos: { x: e.pos.x + Math.cos(a) * r, z: e.pos.z + Math.sin(a) * r },
          vel: { x: Math.cos(a) * 14, z: Math.sin(a) * 14 },
          radius: 12, mass: 20, hull: 30, hullMax: 30, collides: true,
          data: {
            yardmasterPiece: true, modelId: piece.modelId, pieceIdx: piece.idx,
            name: piece.label, scannable: true,
            scanLabel: `YARDMASTER PIECE · ${piece.label} · salvageable`,
          },
        });
      }
      if (stripped > 0) {
        const left = pieces.filter((p) => p.attached).length;
        this.bus.emit('pitborn:yardmasterStripped', {
          entityId: e.id, stripped, piecesLeft: left, tick: state.tick,
        });
        if (left <= 0) {
          this.helpers.removeEntity(e.id, { reason: 'yardmaster_dismantled' });
          this.bus.emit('pitborn:yardmasterDown', { entityId: e.id, tick: state.tick });
          this.bus.emit('comms:log', { text: "Yardmaster's stripped! Yard owes you a drink.", speaker: PITBORN_BARKS.announcer });
        }
      }
    }
  },

  update(dt, state) {
    const pit = ensurePitbornState(state);
    // The crowd cools between moments of style.
    if (pit.crowd.score > 0) {
      pit.crowd.score = Math.max(0, pit.crowd.score - PITBORN_CULL.decayPerS * dt);
      pit.crowd.tier = crowdTierFor(pit.crowd.score).id;
    }
    this._accreteBalls(state);
    this._tickBallastMatch(state);
    this._tickYardmasters(state);
  },
};

export default pitbornCull;
