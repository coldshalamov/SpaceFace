// PL-322 The crowd's coin — "Clear a round with a stunt — a throw, a chain, a last-hit catch —
// and the stands throw scrap down at your feet worth more than the round paid. Take the bow; or
// taunt the crowd for more — the next throw lands at the other fighter."
//
// During a live round the plant keeps a bounded ledger of YOUR kills (entity:killed with
// killerId === playerId) and what the round paid you (run:awarded credits). On run:waveCleared
// (which only emits while phase 'active') a stunt round — a thrown kill (killCausality's thrown
// mass tags or a collision with an impactor), a chain (three kills in a short window) or a
// last-hit catch (a kill inside the final beat of the round) — mints the stands' scrap: real
// credit-chip pickups around your feet worth more than the round paid, collectible through the
// ordinary pickup route. Stand still by the pile and you take the bow. Fire your guns while the
// gift is down — asking for more — and the crowd repossesses it: the pile despawns, and the NEXT
// stunt's throw lands across the floor, at the other fighter.
//
// Invariants:
// - Deterministic: state.simTime / state.tick / hash32 only; no Math.random/Date.now.
// - Observes via bus events + polling; zero edits to swarm files; never writes state.run.
// - The scrap is ordinary 'pickup' bodies (kind 'scrap', wallet 'run'); only the despawn of
//   plant-minted ids is commanded (taunt repossession).
// - Bounded state: kill window ring, one live gift, memoryCap per run; per-run reset on run:ended.

import { isSwarmRuleset } from '../survivalSwarm.js';
import { hash32 } from '../../core/rng.js';
import { killCauseFromPayload, KillCause, impactLinkFromPresentation, isThrownMassTag } from '../../combat/killCausality.js';

export const PLANTS_CROWD_COIN_EVENT = 'plants:crowdCoin';

export const CROWD_COIN_TUNING = Object.freeze({
  plId: 'pl322',
  chainKills: 3,
  chainWindowS: 2.0,
  lastHitWindowS: 1.2,
  scrapPickups: 4,
  scrapTtlS: 20,
  scrapEjectWuS: 26,
  giftBonusMin: 20,          // "worth more than the round paid" even when the round paid little
  bowHoldS: 1.5,
  bowSpeedMax: 8,
  bowRangeWu: 80,
  otherFighterOffsetWu: 900,
  killWindowCap: 12,         // bounded per-round kill ring
  scanCap: 64,
  memoryCap: 16,
});

/** Pure: a thrown kill? The lethal body was a massline-throw, or a collision you impacted. */
export function isThrownKill(payload) {
  const cause = killCauseFromPayload(payload);
  if (cause !== KillCause.SHIP_COLLISION && cause !== KillCause.TERRAIN_COLLISION) return false;
  const link = impactLinkFromPresentation(payload && payload.presentation, {});
  if (link && isThrownMassTag(link.tag)) return true;
  return payload.impactorId != null;
}

/** Pure: did this kill ring carry a chain — n kills inside one short window? */
export function hasChain(killTimes, nowS, tuning = CROWD_COIN_TUNING) {
  if (!Array.isArray(killTimes) || killTimes.length < tuning.chainKills) return false;
  let run = 1;
  for (let i = 1; i < killTimes.length; i += 1) {
    run = killTimes[i] - killTimes[i - 1] <= tuning.chainWindowS ? run + 1 : 1;
    if (run >= tuning.chainKills) return true;
  }
  return false;
}

/** Pure: a last-hit catch — the freshest kill inside the round's final beat. */
export function isLastHit(killTimes, clearAtS, tuning = CROWD_COIN_TUNING) {
  if (!Array.isArray(killTimes) || killTimes.length === 0) return false;
  const last = killTimes[killTimes.length - 1];
  return clearAtS - last <= tuning.lastHitWindowS && clearAtS >= last;
}

/** Pure: the crowd's throw is worth more than the round paid. */
export function crowdGiftTotal(roundPaidCredits, tuning = CROWD_COIN_TUNING) {
  const paid = Number.isFinite(roundPaidCredits) && roundPaidCredits > 0 ? Math.floor(roundPaidCredits) : 0;
  return paid + Math.max(tuning.giftBonusMin, Math.ceil(paid / 2));
}

/** Pure: where the other fighter stands — across the floor, deterministic per seed. */
export function otherFighterPos(pos, seed, tuning = CROWD_COIN_TUNING) {
  if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return null;
  const angle = (hash32(String(seed), tuning.plId, 'other') % 6283) / 1000;
  return {
    x: pos.x + Math.cos(angle) * tuning.otherFighterOffsetWu,
    z: pos.z + Math.sin(angle) * tuning.otherFighterOffsetWu,
  };
}

export const crowdCoinPlant = {
  name: 'plants322',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._resetRun();
    if (!this.bus || typeof this.bus.on !== 'function') return;
    const on = (event, fn) => {
      const off = this.bus.on(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('run:waveStarted', (p) => this._onWaveStarted(p));
    on('run:waveCleared', (p) => this._onWaveCleared(p));
    on('run:awarded', (p) => this._onAwarded(p));
    on('entity:killed', (p) => this._onKilled(p));
    on('combat:fire', (p) => this._onFire(p));
    on('run:ended', () => this._reset());
  },

  update() {
    const run = this._liveRun();
    if (!run) return;
    const now = this._now();
    this._pollGift(now);
    // Take the bow: stand by your pile, still, and the crowd roars once per gift.
    if (!this._gift || !this._gift.live || this._gift.offendedTarget || this._bowGiven) return;
    const player = this._player();
    const center = this._gift.center;
    if (!player || !player.pos || !player.vel || !center) return;
    const dx = player.pos.x - center.x;
    const dz = player.pos.z - center.z;
    const speedSq = player.vel.x * player.vel.x + player.vel.z * player.vel.z;
    if (dx * dx + dz * dz <= CROWD_COIN_TUNING.bowRangeWu * CROWD_COIN_TUNING.bowRangeWu
      && speedSq <= CROWD_COIN_TUNING.bowSpeedMax * CROWD_COIN_TUNING.bowSpeedMax) {
      this._bowTime += finite(this._lastPollDt, 0.25);
      if (this._bowTime >= CROWD_COIN_TUNING.bowHoldS) {
        this._bowGiven = true;
        this.bus.emit('audio:cue', { id: 'confirm', position: { x: center.x, z: center.z }, gain: 0.55, rate: 1.1 });
        this.bus.emit(PLANTS_CROWD_COIN_EVENT, { kind: 'bow', giftCredits: this._gift.credits, t: now });
      }
    } else {
      this._bowTime = 0;
    }
  },

  destroy() {
    for (const off of this._unsubs || []) if (typeof off === 'function') off();
    this._unsubs = [];
    this._resetRun();
  },

  // ---- internals ----

  _liveRun() {
    const run = this.state && this.state.run;
    if (!run || run.kind !== 'survival' || !isSwarmRuleset(run.ruleset)) return null;
    if (run.phase === 'inactive' || run.phase === 'ended' || run.phase === 'victory') return null;
    return run;
  },

  _now() {
    return finite(this.state && this.state.simTime, 0);
  },

  _player() {
    const s = this.state;
    return s && s.entities && typeof s.entities.get === 'function' ? s.entities.get(s.playerId) : null;
  },

  _resetRun() {
    this._killTimes = [];
    this._roundPaid = 0;
    this._thrownKill = false;
    this._gift = null;
    this._bowTime = 0;
    this._bowGiven = false;
    this._offended = false;
    this._lastPollDt = 0.25;
    this._lastPollAt = 0;
  },

  _onWaveStarted() {
    const run = this._liveRun();
    if (!run) return;
    this._killTimes = [];
    this._roundPaid = 0;
    this._thrownKill = false;
  },

  _onAwarded(payload) {
    const run = this._liveRun();
    if (!run || run.phase !== 'active') return;
    const credits = payload && Number.isFinite(payload.credits) ? payload.credits : 0;
    this._roundPaid += credits;
  },

  _onKilled(payload) {
    const run = this._liveRun();
    if (!run || run.phase !== 'active') return;
    if (!payload || payload.killerId == null || payload.killerId !== this.state.playerId) return;
    if (payload.id === this.state.playerId) return;
    if (payload.type != null && payload.type !== 'ship') return;
    this._killTimes.push(this._now());
    if (isThrownKill(payload)) this._thrownKill = true;
    while (this._killTimes.length > CROWD_COIN_TUNING.killWindowCap) this._killTimes.shift();
  },

  _onWaveCleared(payload) {
    const run = this._liveRun();
    if (!run || run.phase !== 'active') return;
    const now = this._now();
    const stunt = this._thrownKill
      || hasChain(this._killTimes, now)
      || isLastHit(this._killTimes, now);
    this._thrownKill = false;
    if (!stunt) return;
    const total = crowdGiftTotal(this._roundPaid);
    const player = this._player();
    const origin = this._offended && player && player.pos
      ? otherFighterPos(player.pos, run.seed)
      : (player && player.pos ? { x: player.pos.x, z: player.pos.z } : null);
    if (!origin) return;
    const minted = this._mintScrap(origin, total, run);
    if (minted.length === 0) return;
    if (this._offended) {
      this.bus.emit('audio:cue', { id: 'warning', position: origin, gain: 0.4, rate: 0.9 });
      this.bus.emit(PLANTS_CROWD_COIN_EVENT, {
        kind: 'thrown_to_other_fighter',
        pickupIds: minted,
        credits: total,
        center: origin,
        t: now,
      });
      return;
    }
    this._gift = { ids: minted, center: origin, credits: total, live: true };
    this._bowTime = 0;
    this._bowGiven = false;
    this.bus.emit('audio:cue', { id: 'confirm', position: origin, gain: 0.5, rate: 1 });
    this.bus.emit(PLANTS_CROWD_COIN_EVENT, {
      kind: 'scrap_gift', pickupIds: minted, credits: total, center: origin, t: now,
    });
  },

  _onFire(payload) {
    const run = this._liveRun();
    if (!run || !this._gift || !this._gift.live) return;
    if (!payload || payload.ownerId !== this.state.playerId) return;
    // Taunting the crowd for more while your gift is down: the crowd repossesses it.
    const ids = this._gift.ids;
    for (const id of ids) {
      if (this.helpers && typeof this.helpers.removeEntity === 'function') this.helpers.removeEntity(id);
    }
    this._offended = true;
    this._gift = { ids: [], center: null, credits: 0, live: false, offendedTarget: true };
    this.bus.emit('audio:cue', { id: 'ui_deny', position: null, gain: 0.5, rate: 1 });
    this.bus.emit(PLANTS_CROWD_COIN_EVENT, {
      kind: 'taunted', pulledIds: ids, nextThrow: 'other_fighter', t: this._now(),
    });
  },

  _pollGift(now) {
    if (this._lastPollAt && now - this._lastPollAt < 0.25) return;
    this._lastPollDt = this._lastPollAt ? Math.max(0, now - this._lastPollAt) : 0.25;
    this._lastPollAt = now;
    if (!this._gift || !this._gift.live) return;
    const entities = this.state && this.state.entities;
    if (!entities || typeof entities.has !== 'function') return;
    let remaining = 0;
    for (const id of this._gift.ids) {
      const e = entities.get(id);
      if (e && e.alive !== false) remaining += 1;
    }
    if (remaining === 0) {
      this._gift.live = false;
      this.bus.emit(PLANTS_CROWD_COIN_EVENT, {
        kind: 'scrap_scooped', credits: this._gift.credits, t: now,
      });
    }
  },

  _mintScrap(origin, totalCredits, run) {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return [];
    const now = this._now();
    const n = CROWD_COIN_TUNING.scrapPickups;
    const each = Math.max(1, Math.ceil(totalCredits / n));
    const ids = [];
    for (let i = 0; i < n; i += 1) {
      const angle = ((hash32(String(run.seed), this.state.tick, 'pl322', i) % 6283) / 1000);
      const spawned = spawnEntity({
        type: 'pickup',
        pos: { x: origin.x + Math.cos(angle) * 10, z: origin.z + Math.sin(angle) * 10 },
        vel: { x: Math.cos(angle) * CROWD_COIN_TUNING.scrapEjectWuS, z: Math.sin(angle) * CROWD_COIN_TUNING.scrapEjectWuS },
        radius: 5,
        mass: 0.1,
        collides: true,
        data: {
          kind: 'scrap',
          amount: 1,
          credits: each,
          wallet: 'run',
          grantReason: 'plants:pl322:crowds_coin',
          swarmFloorPad: { label: "CROWD'S COIN" },
          despawnAt: now + CROWD_COIN_TUNING.scrapTtlS,
          plants: { [CROWD_COIN_TUNING.plId]: { role: 'crowd_scrap' } },
        },
      });
      const id = spawned && typeof spawned === 'object' ? spawned.id : spawned;
      if (id != null) ids.push(id);
    }
    return ids;
  },
};

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
