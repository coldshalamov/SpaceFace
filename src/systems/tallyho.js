// W-SHIFT (row 506, 03 §4.3): TALLYHO / CN-2 — the scoreboard robot looking for a crowd.
// A marked scoreboard hull posts over the Rhea Cinder fight ground and rates every
// player kill inside its crowd ring — streaks inside the window score higher, and every
// few rated kills a Pitborn spectator hull drifts in to park at the rail while the board
// runs. Fight where it can watch and the sector fills with an audience.
//
// WHAT THIS OWNS — the board body and its spectator hulls (one-off event seams: init /
// deferred sector-enter / save:loaded / newGame), the rolling streak and rating calls,
// the durable score in story flags, and the spectator rail. Kills stay combat's — the
// board only reads the report.
import { TALLYHO } from '../data/tallyho.js';
import {
  tallyhoRateableKill, tallyhoStreak, tallyhoRateLine, tallyhoScoreFor, tallyhoSpectatorSeat,
} from '../characters/tallyhoRules.js';
import { deferSectorEnterMaterialization } from '../core/sectorEnterDefer.js';

export function tallyhoSpec() {
  return {
    type: 'drone',
    pos: { ...TALLYHO.post }, vel: { x: 0, z: 0 },
    radius: 12, mass: 40, hull: 250, hullMax: 250,
    homeSectorId: TALLYHO.sectorId,
    data: {
      tallyho: true, authoredCharacter: 'tallyho', parentType: 'story_prop',
      callsign: TALLYHO.callsign,
      scanLabel: 'TALLYHO / CN-2 — scoreboard, wants a crowd',
      scannerSignalKind: 'salvage',
      homeSectorId: TALLYHO.sectorId,
    },
  };
}

export function createTallyho() {
  return {
    name: 'tallyho',
    init(ctx) {
      this.destroy();
      this.state = ctx.state; this.bus = ctx.bus; this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._streak = 0;
      this._lastKillAt = -Infinity;
      this._ratedSinceSpectator = 0;
      const on = (event, fn) => {
        const off = this.bus?.on(event, fn); if (typeof off === 'function') this._unsubs.push(off);
      };
      const reset = () => { this._streak = 0; this._lastKillAt = -Infinity; this._ratedSinceSpectator = 0; };
      on('sector:enter', (p) => {
        reset();
        if (deferSectorEnterMaterialization(this.state, p, this._cookProvider)) return;
        this._sync();
      });
      this._cookProvider = () => { this._sync(); };
      (this.helpers.sectorCookProviders || (this.helpers.sectorCookProviders = []))
        .push(this._cookProvider);
      on('save:loaded', () => { reset(); this._sync(); });
      on('game:newGame', () => { reset(); this._sync(); });
      on('entity:killed', (p) => this._onKilled(p));
      this._sync();
    },
    destroy() {
      for (const off of this._unsubs || []) off();
      this._unsubs = [];
      const providers = this.helpers?.sectorCookProviders;
      if (Array.isArray(providers)) {
        const i = providers.indexOf(this._cookProvider);
        if (i >= 0) providers.splice(i, 1);
      }
      const queue = this.state?.render?.deferredEnterMaterializers;
      if (Array.isArray(queue)) {
        for (let i = queue.length - 1; i >= 0; i--) {
          if (queue[i] && queue[i].provider === this._cookProvider) queue.splice(i, 1);
        }
      }
      this._cookProvider = null;
      this._removeOwned();
    },
    _flags() {
      const flags = this.state?.story?.flags;
      return flags ? flags : (this.state?.story ? (this.state.story.flags = {}) : null);
    },
    _adventure() {
      const run = this.state?.run;
      return (!run || !run.kind || run.kind === 'adventure' || run.kind === 'campaign')
        && this.state?.world?.currentSectorId === TALLYHO.sectorId;
    },
    _board() {
      for (const e of this.state?.entityList || []) {
        if (e?.alive && e.data?.tallyho === true) return e;
      }
      return null;
    },
    _spectators() {
      return (this.state?.entityList || []).filter((e) => e?.alive && e.data?.tallyhoSpectator === true);
    },
    _removeOwned() {
      for (const e of this.state?.entityList || []) {
        if (e?.alive && (e.data?.tallyho === true || e.data?.tallyhoSpectator === true)) {
          this.helpers?.removeEntity?.(e.id);
        }
      }
    },
    _sync() {
      if (!this.state?.story) return;
      if (!this._adventure()) { this._removeOwned(); return; }
      if (!this._board() && this.helpers.spawnEntity) this.helpers.spawnEntity(tallyhoSpec());
      const flags = this._flags();
      if (flags && flags[TALLYHO.announceFlag] !== true) {
        flags[TALLYHO.announceFlag] = true;
        this.bus?.emit('comms:popup', {
          id: 'tallyho_announce', sender: TALLYHO.sender, category: 'story',
          text: TALLYHO.announce, ttl: 9, persist: false,
        });
      }
    },
    /** The board rates a kill on the spot — the crowd hears it live. Spectators arrive
     *  on the same pass: the rail fills while the score runs. */
    _onKilled(p) {
      if (!this._adventure() || !p) return;
      const board = this._board();
      if (!board) return;
      // Own crowd by DATA FLAG, not aliveness: combat marks the victim dead before
      // entity:killed emits, so a live-only spectator scan would let a player kill
      // parked INSIDE the ring rate — shooting the audience must never score.
      // A flagged corpse still in the list holds its id until the sweep frees it,
      // and a recycled id only re-enters selfIds if the new occupant is also ours.
      const selfIds = new Set([board.id]);
      for (const e of this.state?.entityList || []) {
        if (e && e.data && (e.data.tallyho === true || e.data.tallyhoSpectator === true)) selfIds.add(e.id);
      }
      const playerId = this.state?.playerId ?? this.state?.player?.id;
      if (!tallyhoRateableKill(p, playerId, selfIds)) return;
      const now = Number(this.state?.simTime) || 0;
      const s = tallyhoStreak(this._streak, this._lastKillAt, now);
      this._streak = s.count; this._lastKillAt = now;
      const flags = this._flags();
      if (flags) {
        flags[TALLYHO.scoreFlag] = (Number(flags[TALLYHO.scoreFlag]) || 0) + tallyhoScoreFor(s.count);
        flags[TALLYHO.ratedFlag] = (Number(flags[TALLYHO.ratedFlag]) || 0) + 1;
      }
      this.bus?.emit('comms:popup', {
        id: `tallyho_rate_${p.id}`, sender: TALLYHO.sender, category: 'story',
        text: tallyhoRateLine(s.count), ttl: 5, persist: false,
      });
      this._ratedSinceSpectator += 1;
      if (this._ratedSinceSpectator >= TALLYHO.ratedKillsPerSpectator
          && this._spectators().length < TALLYHO.spectatorCap && this.helpers.spawnEntity) {
        this._ratedSinceSpectator = 0;
        // Next seat = one past the highest LIVE seat, never the live count: a dead
        // rail-sitter's chair stays empty and the new arrival does not spawn
        // coincident with the survivor. The stamped seat rides data.*, so a
        // save:loaded restore keeps the rail's occupancy honest too.
        let nextSeat = 0;
        for (const e of this._spectators()) {
          const s = Number(e.data && e.data.tallyhoSeat);
          if (Number.isInteger(s) && s >= nextSeat) nextSeat = s + 1;
        }
        const seat = tallyhoSpectatorSeat(nextSeat);
        this.helpers.spawnEntity({
          type: 'drone',
          pos: seat, vel: { x: 0, z: 0 },
          radius: 8, mass: 20, hull: 100, hullMax: 100,
          homeSectorId: TALLYHO.sectorId,
          data: {
            tallyhoSpectator: true, tallyhoSeat: nextSeat, parentType: 'story_prop',
            callsign: 'PITBORN RAIL',
            scanLabel: 'Pitborn spectator — came for the score',
            scannerSignalKind: 'salvage',
            homeSectorId: TALLYHO.sectorId,
          },
        });
      }
    },
  };
}

export const tallyho = createTallyho();
