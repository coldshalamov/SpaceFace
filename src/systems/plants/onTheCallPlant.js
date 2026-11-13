// PL-163 On the call — "Kill by collision while Kiln is still saying the round's name, and the
// crowd shouts the end of it. Time it."
//
// Kiln names the round as it opens (the wave-intro beat). A player collision kill that lands
// while the name is still up gets the crowd's answer: they shout the name's last word.
//
// Invariants:
// - Deterministic: state.simTime only; no Math.random/Date.now.
// - Observes via bus events; zero edits to swarm files; never writes state.run.
// - The round's name comes from the authored course table (src/data/swarmCourse.js), read-only.
// - Once per round; the saying window is a tuning constant measured from run:waveStarted.

import { isSwarmRuleset } from '../survivalSwarm.js';
import { killCauseFromPayload, KillCause } from '../../combat/killCausality.js';
import { swarmCourseFor } from '../../data/swarmCourse.js';

export const PLANTS_ON_THE_CALL_EVENT = 'plants:onTheCall';

export const ON_THE_CALL_TUNING = Object.freeze({
  plId: 'pl163',
  sayingWindowS: 4,            // Kiln is "still saying" the name for this long after wave start
  collisionCauses: Object.freeze([KillCause.SHIP_COLLISION, KillCause.TERRAIN_COLLISION]),
  memoryCap: 8,
});

/** Pure: the crowd shouts the end of the name — its last word, capped and shouted. */
export function crowdTailFor(roundName) {
  if (typeof roundName !== 'string' || !roundName.trim()) return null;
  const tail = roundName.trim().split(/\s+/).pop();
  if (!tail) return null;
  const capped = tail.length > 18 ? tail.slice(0, 18) : tail;
  return `${capped.toUpperCase()}!`;
}

/** Pure: is this kill receipt a player collision kill? */
export function isCollisionKill(payload, playerId, tuning = ON_THE_CALL_TUNING) {
  if (!payload || payload.killerId !== playerId) return false;
  return tuning.collisionCauses.includes(killCauseFromPayload(payload));
}

export const onTheCallPlant = {
  name: 'plants163',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this._unsubs = [];
    this._shoutedWave = 0;
    this._roundName = null;
    this._sayingUntil = 0;
    if (!this.bus || typeof this.bus.on !== 'function') return;
    const on = (event, fn) => {
      const off = this.bus.on(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('run:waveStarted', (p) => this._onWaveStarted(p));
    on('entity:killed', (p) => this._onKilled(p));
    on('run:ended', () => this._reset());
  },

  update() { /* event-driven */ },

  destroy() {
    for (const off of this._unsubs || []) if (typeof off === 'function') off();
    this._unsubs = [];
    this._shoutedWave = 0;
    this._roundName = null;
    this._sayingUntil = 0;
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

  _reset() {
    this._shoutedWave = 0;
    this._roundName = null;
    this._sayingUntil = 0;
  },

  _onWaveStarted(payload) {
    const run = this._liveRun();
    if (!run) return;
    const wave = finite(payload && payload.wave, finite(run.wave, 0));
    const round = swarmCourseFor(wave);
    this._roundName = round && typeof round.name === 'string' ? round.name : null;
    this._sayingUntil = this._now() + ON_THE_CALL_TUNING.sayingWindowS;
  },

  _onKilled(payload) {
    const run = this._liveRun();
    if (!run) return;
    if (this._shoutedWave === run.wave) return; // once per round
    if (this._now() > this._sayingUntil) return; // the name is done
    const tail = crowdTailFor(this._roundName);
    if (!tail) return;
    if (!isCollisionKill(payload, this.state.playerId, ON_THE_CALL_TUNING)) return;
    this._shoutedWave = run.wave;
    this.bus.emit('voice:say', {
      channel: 'comms', id: `plants:pl163:crowd:${run.wave}`, text: tail, ttl: 3,
    });
    this.bus.emit('audio:cue', {
      id: 'confirm',
      position: payload && payload.pos ? { x: payload.pos.x, z: payload.pos.z } : null,
      gain: 1, rate: 1.1,
    });
    this.bus.emit(PLANTS_ON_THE_CALL_EVENT, {
      kind: 'crowd_shout', wave: run.wave, roundName: this._roundName, tail, t: this._now(),
    });
  },
};

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
