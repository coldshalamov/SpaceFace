// System-shaped owner for tests and the withheld registry adapter.
// It never inserts entities into state.entities. Venue bodies stay inside the session.

import { noteBracketDiscovery, nextUnlockedEvent } from './discover.js';
import { createSession, runMatch, stepSession, leaveVenue, worldFootprint, destroySession, serializeSession, deserializeSession } from './session.js';
import { freshLeagueMemory } from './memory.js';

export function createKineticLeague() {
  return {
    name: 'kineticLeague',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      if (!this.state.kineticLeague) this.state.kineticLeague = freshLeagueMemory();
      this.session = null;
      this._unsubs = [];
      const on = (name, fn) => {
        const off = this.bus?.on(name, fn);
        if (typeof off === 'function') this._unsubs.push(off);
      };
      on('bracket:matchStarted', () => this._discover('match-started'));
      on('bracket:matchFinished', () => this._discover('match-finished'));
      on('kinetic-league:enter', () => this._enterNext());
      on('game:newGame', () => this.newGame());
    },
    _discover(via) {
      const result = noteBracketDiscovery(this.state, { via });
      if (result.ok) this.bus?.emit('kinetic-league:discovered', { via, tier: result.tier });
      return result;
    },
    _enterNext() {
      const next = nextUnlockedEvent(this.state.kineticLeague);
      if (!next) return { ok: false, reason: 'no-event' };
      return this.enterMatch(next.id);
    },
    beginMatch(eventId, opts = {}) {
      if (this.session && (this.session.phase === 'play' || this.session.phase === 'result')) {
        leaveVenue(this.session);
      }
      const session = createSession(eventId, {
        seed: opts.seed,
        memory: this.state.kineticLeague,
        inventory: opts.inventory || null,
        shipId: this.state.playerId || opts.shipId || 'player-ship',
        practice: opts.practice === true,
        enforceTier: opts.enforceTier !== false,
      });
      if (session.ok !== false) session.liveInput = true;
      this.session = session;
      return session;
    },
    enterMatch(eventId, opts = {}) {
      if (this.session && (this.session.phase === 'play' || this.session.phase === 'result')) {
        leaveVenue(this.session);
      }
      const session = runMatch(eventId, {
        seed: opts.seed,
        memory: this.state.kineticLeague,
        inventory: this.state.player?.cargo ? this.state.player : opts.inventory,
        shipId: this.state.playerId || opts.shipId || 'player-ship',
        practice: opts.practice === true,
        enforceTier: opts.enforceTier !== false,
      });
      this.session = session;
      return session;
    },
    leave() {
      if (this.session) leaveVenue(this.session);
      return this.session;
    },
    retry(opts = {}) {
      if (!this.session?.event) return { ok: false, reason: 'no-session' };
      const eventId = this.session.event.id;
      const seed = this.session.seed;
      leaveVenue(this.session);
      return this.enterMatch(eventId, { seed, practice: opts.practice === true, enforceTier: false });
    },
    newGame() {
      if (this.session) destroySession(this.session);
      this.session = null;
      this.state.kineticLeague = freshLeagueMemory();
    },
    serialize() {
      return {
        memory: this.state.kineticLeague || freshLeagueMemory(),
        session: this.session && this.session.phase === 'play' ? serializeSession(this.session) : null,
      };
    },
    deserialize(raw) {
      if (this.session) destroySession(this.session);
      this.state.kineticLeague = raw?.memory || freshLeagueMemory();
      this.session = raw?.session ? deserializeSession(raw.session, { inventory: this.state.player }) : null;
    },
    footprint() {
      return worldFootprint(this.session);
    },
    update(dt) {
      const session = this.session;
      if (!session?.liveInput) return;
      if (session.phase !== 'play' && session.phase !== 'result') return;
      const input = this.state?.input || {};
      const actions = input.actions || {};
      stepSession(session, {
        thrustX: Number.isFinite(input.moveX) ? input.moveX : 0,
        thrustZ: Number.isFinite(input.moveZ) ? input.moveZ : 0,
        tether: actions.massline === true,
        cut: input.brake === true,
      }, dt);
    },
    destroy() {
      for (const off of this._unsubs || []) off();
      this._unsubs = [];
      if (this.session) destroySession(this.session);
      this.session = null;
    },
  };
}
