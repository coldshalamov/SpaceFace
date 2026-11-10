// special500ForgeKaraoke.js — SP2-063 "The Karaoke Bell" (special-500 Phase 2, batch 19,
// counter family).
//
// The real event is the `dock:docked` receipt both docking producers already emit, read
// against the world calendar's own station clock: the player docks at the Forge bar AT THE
// EXACT SHIFT BELL (stationShiftAt's watch boundary — the bell the whole station already
// rings, data/worldCalendar.js) while the bar reads standing-room (barPressureAt above the
// authored threshold). Then the Foundry rail sings the change — the Pitborn "COUNT 'EM"
// cadence, adopted by DMC crews who will not admit where they learned it — and the bell
// harmonizes. One engineer harmonizes better than the bell and is resented for it.
//
//   heard_the_count_sung   simTime — plain-named story flag, written only here, once per save
//
// Readers (live, on their owners): the Pitborn hear about it and are delighted — faction
// standing +1 through the factions owner's repDelta intent (faction_pitborn); the shift bell
// itself rings through the audio owner's cue admission using the calendar's own shift-bell
// recipe (ambient_station_shift_bell — the same recipe the spectacle registry's bellVoice
// template drives); and the mail owner's flag-trigger row (mail_heard_the_count) delivers a
// Foundry regular's letter for pilots who caught the count. A bar row for the regular who
// hums the cadence is deferred to barContacts.js — that file is under another writer this
// pass; the letter is the delivered reader.
//
// Determinism: the window reads state.simTime against the station's own watch clock; no rng,
// no wall time. A dock without a station id, or a state without story, degrades to no-op.

import { stationShiftAt, barPressureAt, CAL_DAY_S, STATION_SHIFTS } from '../data/worldCalendar.js';
import { isRunSealed } from '../core/runSeal.js';
import { isRacingCorridorSession } from '../world/racingCorridor.js';

export const KARAOKE_STATION_ID = 'station_forge';
// "The exact shift bell": the receipt lands inside this many seconds of the watch boundary —
// close enough that the bell was still ringing when the clamp took the hull.
export const BELL_WINDOW_S = 5;
// "Bar pressure above threshold": standing room, not a quiet shift.
export const BAR_PRESSURE_MIN = 0.6;

export function createSpecial500ForgeKaraoke() {
  return {
    name: 'special500ForgeKaraoke',

    init(ctx) {
      for (const off of this.off || []) { if (typeof off === 'function') off(); }
      this.state = ctx.state;
      this.bus = ctx.bus || null;
      this.off = this.bus ? [this.bus.on('dock:docked', (p) => this._onDocked(p || {}))] : [];
    },

    destroy() {
      for (const off of this.off || []) { try { off(); } catch (e) { /* shutdown */ } }
      this.off = [];
      this.state = null;
      this.bus = null;
    },

    /** Pure window test, exported for the focused test: is this receipt on the bell? */
    _onTheBell(stationId, simTime) {
      if (stationId !== KARAOKE_STATION_ID) return false;
      const shift = stationShiftAt(stationId, Number(simTime) || 0);
      const elapsedSinceStart = (CAL_DAY_S / STATION_SHIFTS.length) - shift.endsInS;
      return shift.endsInS <= BELL_WINDOW_S || elapsedSinceStart <= BELL_WINDOW_S;
    },

    _onDocked(payload) {
      const state = this.state;
      const bus = this.bus;
      if (!state || !bus || isRunSealed(state) || state.physicsVenueSession || isRacingCorridorSession(state)) return;
      const stationId = typeof payload.stationId === 'string' ? payload.stationId : '';
      const now = Number(state.simTime) || 0;
      if (!this._onTheBell(stationId, now)) return;
      if (barPressureAt(stationId, now) < BAR_PRESSURE_MIN) return; // a quiet bell sings alone
      const flags = state.story && state.story.flags
        && typeof state.story.flags === 'object' ? state.story.flags : null;
      if (!flags) {
        if (!state.story) state.story = { flags: {} };
        if (!state.story.flags || typeof state.story.flags !== 'object') state.story.flags = {};
      }
      const map = state.story.flags;
      if (map.heard_the_count_sung != null) return; // once per save; the bell does not encore
      map.heard_the_count_sung = now;
      // The Pitborn heard about it too, and are delighted: standing moves through the
      // factions owner's repDelta intent — never written here.
      bus.emit('faction:repDelta', {
        factionId: 'faction_pitborn',
        delta: 1,
        reason: 'special500:heard_the_count_sung',
      });
      bus.emit('audio:cue', { id: 'ambient_station_shift_bell', gain: 0.7, rate: 1.0 });
      bus.emit('special500:karaokeHeard', { stationId, at: now });
      bus.emit('comms:log', {
        from: 'Foundry bar',
        text: 'The whole Foundry rail sings the change — the Pitborn COUNT \'EM cadence, '
          + 'adopted by DMC crews who will not tell you where they learned it — and the '
          + 'shift bell harmonizes on top. One engineer harmonizes better than the bell, '
          + 'and everyone resents him for it, forever, warmly. The bell is supposed to be '
          + 'the pitch pipe. The bell is not the pitch pipe.',
        kind: 'special500',
      });
    },
  };
}

export const special500ForgeKaraoke = createSpecial500ForgeKaraoke();
