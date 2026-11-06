// special500ReadEverything.js — SP2-188 "The Demo End's Uninvited Guest" (special-500
// Phase 2, batch 18, counter family).
//
// The run-end leg of the popup-dismiss counter chain. src/ui/comms.js — the popup owner —
// counts what it surfaces (state.ui.commsSeen) and what the PLAYER dismissed by click
// (state.ui.commsDismissed; TTL sweeps and feed overflow are not attention). This system
// reads those two session counters at the real run-end receipt (`player:death`, emitted by
// the combat owner's defeat path and the world's radiation fallback) and, when a whole
// session of channel noise drew zero manual dismissals, delivers the guest:
//
//   read_everything  story flag (plain-named; written only here) — the permanent stamp the
//                    next session's ambient cadence reads (story.js schedules 20% fewer
//                    ambient lines when it is set: the channel respects the reader)
//   state.ui.readEverythingFired — session mark the after-action sheet reads for the one
//                    line it gains this defeat (src/ui/screens/gameOver.js)
//   the guest popup  one comms:popup queued since minute one and never needed dismissing —
//                    it dismisses itself (plain ttl, no persist)
//
// Session scoping is honest by construction: state.ui does not survive a save/Continue, so
// "all session" resets the way sessions do. No update() — subscribes at init, never ticks.
// Determinism: the decision reads counters and the receipt; no rng, no wall time. A missing
// counter (headless harness, a comms surface that never mounted) degrades to no firing.

// A channel that never spoke cannot be "read everything": this is the minimum the feed must
// have surfaced before a zero-dismissal session means anything. The ambient table alone
// turns over far more than this in a session.
const MIN_POPUPS_SEEN = 6;

export const READ_EVERYTHING_MIN_POPUPS = MIN_POPUPS_SEEN;

export function createSpecial500ReadEverything() {
  return {
    name: 'special500ReadEverything',

    init(ctx) {
      for (const off of this.off || []) { if (typeof off === 'function') off(); }
      this.state = ctx.state;
      this.bus = ctx.bus || null;
      this.off = this.bus ? [this.bus.on('player:death', () => this._onRunEnd())] : [];
    },

    destroy() {
      for (const off of this.off || []) { try { off(); } catch (e) { /* shutdown */ } }
      this.off = [];
      this.state = null;
      this.bus = null;
    },

    /** The pure decision, exported for the focused test: did the channel notice? */
    _channelNoticed() {
      const state = this.state;
      if (!state || !state.ui) return false;
      if (state.story && state.story.flags && state.story.flags.read_everything != null) return false;
      const seen = state.ui.commsSeen | 0;
      const dismissed = state.ui.commsDismissed | 0;
      return seen >= MIN_POPUPS_SEEN && dismissed === 0;
    },

    _onRunEnd() {
      const state = this.state;
      const bus = this.bus;
      if (!state || !bus) return;
      if (!this._channelNoticed()) return;
      if (!state.story) state.story = { flags: {} };
      if (!state.story.flags || typeof state.story.flags !== 'object') state.story.flags = {};
      state.story.flags.read_everything = Number(state.simTime) || 0;
      if (!state.ui) state.ui = {};
      state.ui.readEverythingFired = true;
      // The uninvited guest: queued since minute one, never needed dismissing, dismisses itself.
      bus.emit('comms:popup', {
        id: 'special500.read_everything',
        category: 'personal',
        sender: 'THE CHANNEL',
        text: 'YOU READ EVERYTHING. THE CHANNEL NOTICED. THE CHANNEL IS MOSTLY NOISE. '
          + 'SO WAS MOST OF THIS. THANK YOU FOR THE PART THAT WASN\u2019T.',
        ttl: 5,
      });
    },
  };
}

export const special500ReadEverything = createSpecial500ReadEverything();
