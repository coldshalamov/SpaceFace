// SWARM-02 — the arcade juice DETECTOR (SWARM_ARCADE §5, §10 step 2).
//
// Swarm is allowed to be gratuitous where Adventure is restrained (§1). Everything the
// mode celebrates is already computed — the kill chain, the physics causes, the boss
// roster — and almost none of it reached the screen. This system is the honest layer
// underneath the noise: it watches the same kill/wave/boss receipts the economy already
// trusts and publishes named, sim-timed juice events. The DOM presenter
// (src/ui/swarmJuiceHud.js) draws them; this file never touches a document.
//
// Event surface (all swarm-only, all gated on a live swarm-ruleset run):
//   swarm:killPopup    { pos, word, cause, score, credits, wave } — one per paid kill
//   swarm:announce     { kind, text, count } — DOUBLE/TRIPLE/QUAD/SWARM WIPE, PILE-UP ×N,
//                      COLLATERAL, REVENGE, CLOSE CALL, LAST ONE
//   swarm:roundSlam    { wave, boss, newcomer } — "ROUND N" with the boss card + debut card
//   swarm:roundClear   { wave, tally } — the count-up rows (FLAWLESS / SPEED / KILLS / CHAIN)
//   swarm:bossIntro    { name, line, wave } — the versus card
//   swarm:bossHp       { frac, alive, total, name } — the boss bar
//   swarm:bossDown     { name, wave } — slow-mo + payout beat
//   swarm:chainTier    { name, at, chain } — IGNITION/FLARE/NOVA/SUPERNOVA/SINGULARITY
//   swarm:chainShatter { chain, best } — a broken chain is loud, never silent
//
// It also owns the physical punch: hit-stop through the sanctioned time-effects channel
// (the same mechanism bulletTime uses, never a state.timeScale write) scaled by chain
// tier, and extra camera:shake on the big beats. All of it obeys the Arcade effects
// setting via arcadeEffectsLevel — reduced keeps the words, drops the vestibular punch.
//
// Single-writer law: it never writes state.run. It reads kills, it emits presentation.
// Payment stays with runSession/survivalRewards exactly as before.

import { createRewardDeathLedger, runOwnsReward } from '../combat/rewardEligibility.js';
import { validateRunState } from '../core/runState.js';
import { styleCauseFromKill } from './survivalStyle.js';
import { isSwarmRuleset } from './survivalSwarm.js';
import { WAVE_CLEARED_SEAM } from './survivalRun.js';
import { swarmBossFor, swarmNewcomerFor, SWARM_BOSS_ROTATION } from '../data/swarmMode.js';
import { swarmBroodNewcomerFor } from '../data/swarmBrood.js';
import {
  SWARM_CLOSE_CALL_HULL,
  SWARM_HITSTOP_SCALE,
  SWARM_HITSTOP_SOURCE,
  SWARM_LAST_ONE_WINDOW_S,
  SWARM_MULTI_WINDOW_S,
  SWARM_NEWCOMER_COUNTERS,
  SWARM_PILEUP_CAUSES,
  SWARM_REVENGE_WINDOW_S,
  arcadeEffectsLevel,
  swarmChainTierCrossed,
  swarmHitStopSeconds,
  swarmKillCauseWord,
  swarmMultiKillWord,
  swarmPileUp,
  swarmRoundTally,
} from '../data/swarmJuice.js';

function liveSwarmRun(state) {
  if (!state) return null;
  const run = state.run;
  if (!run || typeof run !== 'object' || Array.isArray(run)) return null;
  if (run.kind !== 'survival') return null;
  if (run.phase === 'inactive' || run.phase === 'ended') return null;
  if (!isSwarmRuleset(run.ruleset)) return null;
  if (!validateRunState(run).ok) return null;
  return run;
}

function simTimeOf(state) {
  if (Number.isFinite(state && state.simTime)) return state.simTime;
  return Math.max(0, Number(state && state.tick) || 0) / 60;
}

/** A single brood receipt joins at most this many bodies into the multi-kill window. */
const SWARM_BROOD_WINDOW_CAP = 64;

function hullFracOf(entity) {
  if (!entity || typeof entity !== 'object') return 1;
  const max = Number(entity.hullMax);
  if (!(max > 0)) return 1;
  return Math.max(0, Math.min(1, (Number(entity.hull) || 0) / max));
}

/** The boss card for a capital score id — matched back to the authored rotation row. */
function capitalBossCard(scoreId) {
  const row = SWARM_BOSS_ROTATION.find((b) => b && b.scoreId === scoreId);
  return row ? { name: row.label, line: row.line } : { name: 'CAPITAL CONTACT', line: null };
}

export const swarmJuice = {
  name: 'swarmJuice',
  id: 'swarmJuice',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || null;
    this.timeEffects = ctx.timeEffects || null;
    this._unsubs = [];
    this._reset();
    if (!this.bus || typeof this.bus.on !== 'function') return;
    this._unsubs.push(this.bus.on('entity:killed', (p) => this._onKilled(p)));
    this._unsubs.push(this.bus.on('combat:damage', (p) => this._onDamage(p)));
    // SWARM-07 B1 — the Brood tier's room wipes ride the same announcer/popups as ship kills.
    this._unsubs.push(this.bus.on('swarm:broodKills', (p) => this._onBroodKills(p)));
    this._unsubs.push(this.bus.on('run:wavePlanned', (p) => this._onWavePlanned(p)));
    this._unsubs.push(this.bus.on('run:waveStarted', () => this._onWaveStarted()));
    this._unsubs.push(this.bus.on(WAVE_CLEARED_SEAM, (p) => this._onWaveCleared(p)));
    this._unsubs.push(this.bus.on('capitalBoss:start', (p) => this._onCapitalBoss(p)));
    this._unsubs.push(this.bus.on('swarm:chain', (p) => this._onChain(p)));
    this._unsubs.push(this.bus.on('swarm:chainBroken', (p) => this._onChainBroken(p)));
    this._unsubs.push(this.bus.on('run:started', () => this._reset()));
    this._unsubs.push(this.bus.on('run:ended', () => this._reset()));
  },

  destroy() {
    this._releaseHitStop();
    for (const off of this._unsubs || []) if (typeof off === 'function') off();
    this._unsubs = [];
  },

  newGame() {
    this._reset();
  },

  update(dt, state) {
    const st = state || this.state;
    // Hit-stop drains in sim seconds — the dip IS the message, and it releases on the same
    // clock every other slow-time lease uses.
    if (this._hitStopLeft > 0) {
      this._hitStopLeft -= Math.max(0, Number(dt) || 0);
      if (this._hitStopLeft <= 0) this._releaseHitStop();
    }
    const run = liveSwarmRun(st);
    if (!run) return;
    // The boss bar polls the champion bodies it knows about; on a boss round it also scans
    // for late-landing champions (they arrive on their own schedule, not with the slam).
    if (this._bossWave === run.wave && !this._bossDownSent) {
      if (--this._bossScanIn <= 0) {
        this._bossScanIn = 15;
        this._collectChampions(st, run.wave);
      }
      if (this._boss.size > 0) this._publishBossHp(st, run.wave);
    }
  },

  // --- receipts -----------------------------------------------------------------

  _reset() {
    this._releaseHitStop();
    if (!this._deathLedger) this._deathLedger = createRewardDeathLedger();
    else this._deathLedger.clear();
    this._recent = [];              // { t, cause } player-kill window for multi/pile-up
    this._lastHitterId = null;      // last body to damage the player
    this._lastHitterAt = -Infinity;
    this._lastKillAt = -Infinity;   // LAST ONE proximity to the clear
    this._waveKills = 0;            // ROOM KILLS ×N tally figure
    this._hullLost = false;         // FLAWLESS latch
    this._waveStartAt = 0;
    this._bestChain = 0;            // the run's chain high-water, for the tally
    this._lastChain = 0;            // the live chain — hit-stop scales on its tier
    this._maxTierAt = 0;            // last announced tier mark — menus never re-announce
    this._bossWave = 0;
    this._boss = new Map();         // entity ref -> { dead } — identity, never ids
    this._bossAlive = 0;
    this._bossName = null;
    this._bossScanIn = 0;
    this._bossFrac = -1;
    this._bossDownSent = false;
  },

  _onKilled(payload) {
    const st = this.state;
    const run = liveSwarmRun(st);
    if (!run || !payload || payload.id == null) return;
    const victim = st.entities && typeof st.entities.get === 'function'
      ? st.entities.get(payload.id)
      : null;
    if (!runOwnsReward(victim)) return;
    if (this._deathLedger && !this._deathLedger.claim(victim)) return;

    const now = simTimeOf(st);
    const killerId = payload.killerId ?? payload.provenance?.actorId;
    const playerKill = st.playerId != null && killerId === st.playerId;
    const killer = killerId != null && st.entities && typeof st.entities.get === 'function'
      ? st.entities.get(killerId)
      : null;
    const friendlyFire = !playerKill && runOwnsReward(killer);
    const cause = styleCauseFromKill(payload);
    const surface = payload.presentation && payload.presentation.surface || null;
    const word = swarmKillCauseWord({ cause, surface, friendlyFire });
    const threat = victim.data && victim.data.stuntThreat;

    if (playerKill) {
      this._waveKills += 1;
      this._lastKillAt = now;
      this._emit('swarm:killPopup', {
        pos: payload.pos || victim.pos || null,
        word,
        cause,
        score: playerKill ? Math.max(0, Math.round(threat && threat.baseScore || 0)) : 0,
        credits: Math.max(0, Math.round(threat && threat.credits || 0)),
        wave: run.wave,
      });
      this._onPlayerKill(victim, payload, cause, now, run);
    } else if (friendlyFire) {
      // The room did our work — worth a word, never the chain.
      this._emit('swarm:killPopup', {
        pos: payload.pos || victim.pos || null, word, cause, score: 0,
        credits: 0, wave: run.wave,
      });
      this._emit('swarm:announce', { kind: 'collateral', text: 'COLLATERAL', count: 1 });
    }

    if (this._boss.has(victim)) this._markBossDead(st, run.wave);
  },

  _onPlayerKill(victim, payload, cause, now, run) {
    // The multi-kill window: prune then count. 2 DOUBLE · 3 TRIPLE · 4 QUAD · 5+ SWARM WIPE;
    // a window of nothing but physics kills is a PILE-UP ×N instead.
    this._recent.push({ t: now, cause });
    while (this._recent.length && now - this._recent[0].t > SWARM_MULTI_WINDOW_S) this._recent.shift();
    const count = this._recent.length;
    if (count >= 2) {
      const causes = this._recent.map((k) => k.cause);
      if (swarmPileUp(causes)) {
        this._emit('swarm:announce', { kind: 'pileup', text: `PILE-UP ×${count}`, count });
      } else {
        const word = swarmMultiKillWord(count);
        if (word) this._emit('swarm:announce', { kind: 'multikill', text: word, count });
      }
    }
    // REVENGE: the victim is the body that last put damage on you.
    if (this._lastHitterId != null && victim.id === this._lastHitterId
      && now - this._lastHitterAt <= SWARM_REVENGE_WINDOW_S) {
      this._emit('swarm:announce', { kind: 'revenge', text: 'REVENGE', count: 1 });
      this._lastHitterId = null;
    }
    // CLOSE CALL: a kill landed while your hull was under a tenth.
    const player = this.state.entities && typeof this.state.entities.get === 'function'
      ? this.state.entities.get(this.state.playerId)
      : null;
    if (player && hullFracOf(player) < SWARM_CLOSE_CALL_HULL) {
      this._emit('swarm:announce', { kind: 'closecall', text: 'CLOSE CALL', count: 1 });
    }
    // Physical punch: the multi-kill is the beat worth the dip; the tier carries its size.
    if (count >= 3) {
      this._requestHitStop(run);
      this._emit('camera:shake', {
        amount: Math.min(1, 0.25 + 0.08 * count),
        position: payload.pos || (victim && victim.pos) || null,
      });
    }
  },

  _onDamage(payload) {
    if (!payload || payload.isPlayer !== true) return;
    if (payload.attackerId != null) {
      this._lastHitterId = payload.attackerId;
      this._lastHitterAt = simTimeOf(this.state);
    }
    if (Number(payload.hullDamage) > 0) this._hullLost = true;
  },

  /**
   * SWARM-07 B1 — a batched brood-kill receipt: one receipt per cause per tick from the Brood
   * engine. One popup per receipt (the presenter's pool is sized for 30+ bodies a minute, not
   * one per mite), the batch counted into the same multi-kill window as ship kills, so a
   * 40-body wipe reads SWARM WIPE / PILE-UP ×N exactly as the room-kill grammar promises.
   */
  _onBroodKills(payload) {
    const st = this.state;
    const run = liveSwarmRun(st);
    if (!run || !payload) return;
    const count = Math.max(0, Math.trunc(Number(payload.count) || 0));
    if (count <= 0) return;
    const now = simTimeOf(st);
    const cause = typeof payload.cause === 'string' && payload.cause ? payload.cause : 'direct';
    const word = swarmKillCauseWord({ cause });
    this._waveKills += count;
    this._lastKillAt = now;
    this._emit('swarm:killPopup', {
      pos: payload.pos || null,
      word,
      cause,
      score: Math.max(0, Math.round(Number(payload.score) || 0)),
      credits: Math.max(0, Math.round(Number(payload.credits) || 0)),
      wave: run.wave,
      count,
    });
    // The multi-kill window: a receipt joins as its bodies, capped so one huge wipe cannot
    // stretch the window array without bound.
    const joined = Math.min(count, SWARM_BROOD_WINDOW_CAP);
    for (let i = 0; i < joined; i++) this._recent.push({ t: now, cause });
    while (this._recent.length && now - this._recent[0].t > SWARM_MULTI_WINDOW_S) this._recent.shift();
    const windowCount = this._recent.length;
    if (windowCount >= 2) {
      const causes = this._recent.map((k) => k.cause);
      if (swarmPileUp(causes)) {
        this._emit('swarm:announce', { kind: 'pileup', text: `PILE-UP ×${windowCount}`, count: windowCount });
      } else {
        const word2 = swarmMultiKillWord(windowCount);
        if (word2) this._emit('swarm:announce', { kind: 'multikill', text: word2, count: windowCount });
      }
    }
    // Physical punch: the wipe is the beat worth the dip.
    if (windowCount >= 3) {
      this._requestHitStop(run);
      this._emit('camera:shake', {
        amount: Math.min(1, 0.25 + 0.02 * windowCount),
        position: payload.pos || null,
      });
    }
  },

  _onWavePlanned(payload) {
    const run = liveSwarmRun(this.state);
    if (!run || !payload || !Number.isInteger(payload.wave)) return;
    const wave = payload.wave;
    const boss = swarmBossFor(wave);
    const newcomer = swarmNewcomerFor(wave);
    // SWARM-07 B1 — a Brood family debut rides the same slam card when the ship roster is quiet.
    const broodNewcomer = swarmBroodNewcomerFor(wave);
    const bossCard = boss ? { name: boss.label, line: boss.line } : null;
    const newcomerCard = newcomer ? {
      enemyId: newcomer.enemyId,
      name: newcomer.name,
      counter: SWARM_NEWCOMER_COUNTERS[newcomer.enemyId] || null,
    } : (broodNewcomer ? {
      enemyId: broodNewcomer.id,
      name: broodNewcomer.name,
      counter: broodNewcomer.counter,
      brood: true,
    } : null);
    this._emit('swarm:roundSlam', { wave, boss: bossCard, newcomer: newcomerCard });
    if (bossCard) {
      this._emit('swarm:bossIntro', { name: bossCard.name, line: bossCard.line, wave });
      this._bossWave = wave;
      this._bossName = bossCard.name;
      this._boss.clear();
      this._bossAlive = 0;
      this._bossFrac = -1;
      this._bossDownSent = false;
      this._bossScanIn = 0;
    }
  },

  _onWaveStarted() {
    this._waveKills = 0;
    this._hullLost = false;
    this._waveStartAt = simTimeOf(this.state);
  },

  _onWaveCleared(payload) {
    const run = liveSwarmRun(this.state);
    if (!run) return;
    const now = simTimeOf(this.state);
    const wave = Number.isInteger(payload && payload.wave) ? payload.wave : run.wave;
    // LAST ONE — the round's final kill lands in slow-mo, not as one more tick of a bar.
    if (now - this._lastKillAt <= SWARM_LAST_ONE_WINDOW_S && this._waveKills > 0) {
      this._emit('swarm:announce', { kind: 'lastone', text: 'LAST ONE', count: 1 });
      this._requestHitStop(run);
    }
    const tally = swarmRoundTally({
      flawless: !this._hullLost,
      durationS: Math.max(0, now - this._waveStartAt),
      kills: this._waveKills,
      bestChain: this._bestChain,
    });
    this._emit('swarm:roundClear', { wave, tally });
  },

  _onCapitalBoss(payload) {
    const run = liveSwarmRun(this.state);
    if (!run || !payload || payload.bossId == null) return;
    const body = this.state.entities && typeof this.state.entities.get === 'function'
      ? this.state.entities.get(payload.bossId)
      : null;
    if (body) this._addBossBody(body);
    // The intro card fired at plan time from the rotation row; the capital's own card
    // names the same fight for listeners that only watch the encounter id.
    const card = capitalBossCard(payload.encounterId);
    if (card && this._bossName == null) {
      this._bossWave = run.wave;
      this._bossName = card.name;
      this._bossDownSent = false;
      this._emit('swarm:bossIntro', { name: card.name, line: card.line, wave: run.wave });
    }
  },

  _onChain(payload) {
    if (!payload) return;
    const chain = Number.isFinite(payload.chain) ? payload.chain : 0;
    this._lastChain = chain;
    if (chain > this._bestChain) this._bestChain = chain;
    const crossed = swarmChainTierCrossed(chain, this._maxTierAt);
    if (crossed) {
      this._maxTierAt = crossed.at;
      const run = liveSwarmRun(this.state);
      this._emit('swarm:chainTier', { name: crossed.name, at: crossed.at, chain });
      this._emit('audio:cue', { id: 'ui_alert', gain: 0.6 });
      if (run) this._requestHitStop(run);
    }
  },

  _onChainBroken(payload) {
    const ended = payload && Number.isFinite(payload.chain) ? payload.chain : 0;
    this._lastChain = 0;
    if (ended < 3) return; // a two-kill flicker was never a chain worth mourning
    this._emit('swarm:chainShatter', { chain: ended, best: (payload && payload.best) ?? this._bestChain });
    this._maxTierAt = 0;
  },

  // --- the boss bar ----------------------------------------------------------------

  _addBossBody(entity) {
    if (!entity || this._boss.has(entity)) return;
    this._boss.set(entity, { dead: entity.alive === false });
    if (entity.alive !== false) this._bossAlive += 1;
  },

  _collectChampions(state, wave) {
    const entities = state.entities;
    if (!entities || typeof entities.values !== 'function') return;
    for (const e of entities.values()) {
      if (!e || e.alive === false) continue;
      const data = e.data;
      if (data && data.swarmChampion === true && data.runWave === wave) this._addBossBody(e);
    }
  },

  _markBossDead(state, wave) {
    let alive = 0;
    for (const [entity, row] of this._boss) {
      if (entity.alive === false) row.dead = true;
      if (!row.dead) alive += 1;
    }
    this._bossAlive = alive;
    this._publishBossHp(state, wave);
    if (alive === 0 && this._boss.size > 0 && !this._bossDownSent) {
      this._bossDownSent = true;
      const name = this._bossName || 'CHAMPION';
      this._emit('swarm:bossDown', { name, wave });
      this._emit('swarm:announce', { kind: 'bossdown', text: 'BOSS DOWN', count: 1 });
      this._requestHitStop(null, 1);
      this._emit('camera:shake', { amount: 1 });
      this._emit('audio:cue', { id: 'moment.stinger', gain: 0.9, duck: true });
    }
  },

  _publishBossHp(state, wave) {
    let hull = 0;
    let hullMax = 0;
    let alive = 0;
    for (const [entity, row] of this._boss) {
      if (entity.alive === false) row.dead = true;
      if (row.dead) continue;
      alive += 1;
      hull += Math.max(0, Number(entity.hull) || 0);
      hullMax += Math.max(0, Number(entity.hullMax) || 0);
    }
    this._bossAlive = alive;
    const frac = hullMax > 0 ? Math.max(0, Math.min(1, hull / hullMax)) : (this._boss.size ? 0 : -1);
    if (frac >= 0 && Math.abs(frac - this._bossFrac) >= 0.01) {
      this._bossFrac = frac;
      this._emit('swarm:bossHp', {
        frac, alive, total: this._boss.size, name: this._bossName || 'CHAMPION', wave,
      });
    }
  },

  // --- the physical punch ---------------------------------------------------------

  /**
   * Hit-stop through the same time-effects channel bulletTime uses — a bound request,
   * never a timeScale write, so pause/min-wins composition stays automatic. Reduced
   * effects keep every word and drop this dip; the accessibility flags already read
   * as reduced inside arcadeEffectsLevel.
   */
  _requestHitStop(run, forceSeconds) {
    void run;
    if (arcadeEffectsLevel(this.state && this.state.settings) !== 'full') return;
    const seconds = Number.isFinite(forceSeconds) ? forceSeconds
      : Math.max(0.06, swarmHitStopSeconds(this._lastChain || 0));
    if (!this.timeEffects) return;
    if (seconds > this._hitStopLeft) {
      this._hitStopLeft = seconds;
      this.timeEffects.set(SWARM_HITSTOP_SOURCE, { scale: SWARM_HITSTOP_SCALE });
    }
  },

  _releaseHitStop() {
    if (this._hitStopLeft !== 0) this._hitStopLeft = 0;
    if (this.timeEffects) this.timeEffects.clear(SWARM_HITSTOP_SOURCE);
  },

  _emit(event, payload) {
    if (this.bus && typeof this.bus.emit === 'function') this.bus.emit(event, payload);
  },
};

export default swarmJuice;
