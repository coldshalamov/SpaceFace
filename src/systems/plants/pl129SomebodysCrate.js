// PL-129 Somebody's crate — Vesta (design/program/INFERENCE_PLANTS.md, row PL-129).
// "Somebody's crate. The furnace door opens on a rhythm. A frozen lump through on the beat
// and the next pour runs a shade brighter; a whole crate through and the yard PA answers:
// *'That was somebody's crate.'* The dock bill agrees."
// What the player can do: Feed it lumps; or feed it cargo and pay for the brightness.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM.
// - The furnace is NOT re-owned here: this plant listens to the live `furnace:fed` receipts
//   of src/systems/furnaceIntake.js (the CR-FEED mouth). Note: the brief calls that mouth
//   Vesta's; the intake owner's header places CR-FEED beside the Ceres refinery. This module
//   follows the real event and stamps no geography of its own.
// - The beat is a fixed sim-time grid (tuning.beatPeriodS); "on the beat" is a phase window.
// - A lump is a loose rock/payload feed; a whole crate is a jettisoned-cargo pod feed —
//   both read from the receipt's real fields (type / payloadType).
// - The italic PA line is final copy and is emitted EXACTLY, once per crate, on the ambient
//   voice channel (priority 1 — strictly lowest, the stationBroadcast convention).
// - "The dock bill agrees": no plant-reachable debit event exists (economy:grantCredits
//   clamps to >= 0), so the bill is marked on the anchor station's data and answered at the
//   next dock:docked. The crediting itself stays economy-owned; nothing is faked.
// - Bounded Maps with tuning.memoryCap; cooldowns in sim time.
// - Session state on `this`; destroy() unsubscribes all + despawns owned entities.

export const PL_129_BRIGHT_POUR_EVENT = 'plants:pl129:brightPour';
export const PL_129_CRATE_EVENT = 'plants:pl129:crateFed';
export const PL_129_BILL_EVENT = 'plants:pl129:dockBill';

export const PL_129_PA_LINE = 'That was somebody\'s crate.';

export const SOMEBODYS_CRATE_TUNING = Object.freeze({
  beatPeriodS: 24,           // the furnace door rhythm
  onBeatWindowS: 2.5,        // a lump through inside this window is "on the beat"
  brightPourAfterS: 24,      // the next pour is the following beat
  crateCooldownS: 45,        // one PA answer per crate, not per shard
  billCooldownS: 60,
  memoryCap: 8,
});

export function phaseOfBeat(simTime, t = SOMEBODYS_CRATE_TUNING) {
  const period = Math.max(1, t.beatPeriodS);
  return ((simTime % period) + period) % period;
}

export function isOnBeat(simTime, t = SOMEBODYS_CRATE_TUNING) {
  const phase = phaseOfBeat(simTime, t);
  return phase <= t.onBeatWindowS || phase >= t.beatPeriodS - t.onBeatWindowS;
}

/** A crate is a jettisoned-cargo pod; everything else through the mouth is a lump. */
export function feedKindOf(receipt) {
  if (!receipt) return null;
  return receipt.payloadType === 'jettisoned_cargo' ? 'crate' : 'lump';
}

export function createPl129SomebodysCrate() {
  return {
    name: 'plantsPl129',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._brightPourDueAt = 0;
      this._lastCrateAt = -Infinity;
      this._lastBillAt = -Infinity;
      this._billPending = null;   // { at } — set by a crate feed, answered at the next dock
      const on = (event, fn) => {
        const off = this.bus && this.bus.on ? this.bus.on(event, fn) : null;
        if (typeof off === 'function') this._unsubs.push(off);
      };
      on('furnace:fed', (p = {}) => this._onFed(p));
      on('dock:docked', (p = {}) => this._onDocked(p));
      on('sector:exit', () => this._reset());
      on('save:loaded', () => this._reset());
      on('game:newGame', () => this._reset());
    },

    destroy() {
      for (const off of this._unsubs || []) {
        try { off(); } catch (err) { /* cleanup must not throw */ }
      }
      this._unsubs = [];
      this._reset();
    },

    _reset() {
      this._brightPourDueAt = 0;
      this._billPending = null;
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s && s.simTime) ? s.simTime : (Number.isFinite(s && s.tick) ? s.tick / 60 : 0);
    },

    _popup(id, sender, text, ttl = 7, category = 'info') {
      if (!this.bus || typeof this.bus.emit !== 'function') return;
      this.bus.emit('comms:popup', { id, sender, category, text, ttl, persist: false });
    },

    _voice(id, text, ttl = 8) {
      const say = this.helpers && this.helpers.voice && this.helpers.voice.say;
      if (typeof say === 'function') {
        say({ id, channel: 'ambient', priority: 1, text, ttl });
        return;
      }
      if (this.bus && typeof this.bus.emit === 'function') {
        this.bus.emit('voice:say', { id, channel: 'ambient', priority: 1, text, ttl });
      }
    },

    _cue(id, gain = 0.5) {
      if (!this.bus || typeof this.bus.emit !== 'function') return;
      this.bus.emit('audio:cue', { id, gain });
    },

    _onFed(receipt) {
      if (!this.state || !receipt) return;
      const now = this._now();
      const t = SOMEBODYS_CRATE_TUNING;
      const kind = feedKindOf(receipt);
      if (kind === 'lump' && isOnBeat(now, t)) {
        // A frozen lump through on the beat: the next pour runs a shade brighter.
        this._brightPourDueAt = now + t.brightPourAfterS;
        return;
      }
      if (kind === 'crate' && now - this._lastCrateAt >= t.crateCooldownS) {
        this._lastCrateAt = now;
        this._popup(`plants:pl129:crate:${Math.round(now)}`, 'FORGE YARD PA', PL_129_PA_LINE, 9);
        this._voice(`plants:pl129:crate_voice:${Math.round(now)}`, PL_129_PA_LINE, 9);
        this._cue('ui_deny', 0.6);
        this._billPending = { at: now };
        if (this.bus && typeof this.bus.emit === 'function') {
          this.bus.emit(PL_129_CRATE_EVENT, { entityId: receipt.entityId, t: now });
        }
      }
    },

    /** "The dock bill agrees" — answered at the next dock, the debit itself economy-owned. */
    _onDocked(payload) {
      if (!this._billPending || !payload) return;
      const now = this._now();
      const t = SOMEBODYS_CRATE_TUNING;
      if (now - this._billPending.at < 1) return;
      if (now - this._lastBillAt < t.billCooldownS) return;
      this._lastBillAt = now;
      this._billPending = null;
      this._popup(`plants:pl129:bill:${Math.round(now)}`, 'FORGE DOCK',
        'The dock bill agrees: somebody\'s crate goes on your line.');
      if (this.bus && typeof this.bus.emit === 'function') {
        this.bus.emit(PL_129_BILL_EVENT, { stationId: payload.stationId || null, t: now });
      }
    },

    update(dt, state) {
      const s = state || this.state;
      if (!s) return;
      const now = this._now();
      if (this._brightPourDueAt > 0 && now >= this._brightPourDueAt) {
        this._brightPourDueAt = 0;
        this._popup(`plants:pl129:pour:${Math.round(now)}`, 'FORGE YARD PA',
          'Lumps on the beat — the next pour runs a shade brighter.');
        this._cue('confirm', 0.5);
        if (this.bus && typeof this.bus.emit === 'function') {
          this.bus.emit(PL_129_BRIGHT_POUR_EVENT, { t: now });
        }
      }
    },
  };
}

export const pl129SomebodysCrate = createPl129SomebodysCrate();
