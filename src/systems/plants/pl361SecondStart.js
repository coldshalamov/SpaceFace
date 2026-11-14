// PL-361 The second start — "Hit true bankrupt and a starter kit waits in a locker at your
// last dock — rope, tank, chalk: FROM THE LANE."
// What the player can do: Take it and pay it back someday; or go bankrupt twice — the second
// kit comes with a loan note, in someone's handwriting.
//
// Invariants:
// - Deterministic: state.simTime/state.tick only; no Math.random/Date.now; no Three.js/DOM.
// - "True bankrupt" is the real player money bag: credits <= 0 with debt on the note
//   (state.player.credits / state.player.debt — economy is the single writer of both; this
//   module only reads). "Your last dock" is the last real dock:range receipt.
// - The kit is a real story-prop locker canister at the last dock (rope, tank, chalk,
//   masslineTetherable, floor-pad FROM THE LANE); taking it is holding it at pickup range —
//   a physical take, flagged ever after.
// - The second kit comes with the loan note: same locker, the pad and the receipt say so,
//   and the note stamp rides the kit data.
// - Bounded Maps with tuning.memoryCap; RESET on sector:exit / save:loaded / game:new /
//   game:newGame; destroy() unsubscribes + despawns the kit it owns.

import { hash32 } from '../../core/rng.js';

export const PLANTS_KIT_EVENT = 'plants:pl361:kit';

export const SECOND_START_TUNING = Object.freeze({
  plId: 'pl361',
  pickupRangeWu: 40,
  takeHoldS: 3,
  bankruptCooldownS: 60,     // one kit per bankrupt stretch
  memoryCap: 4,
});

export const SECOND_START_LINE = 'FROM THE LANE';
export const LOAN_NOTE_LINE = 'LOAN NOTE INSIDE';

export const PL_361_TAKEN_STAMP = 'plantsPl361KitTaken';

export function createPl361SecondStart() {
  return {
    name: 'plantsPl361',

    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._kitId = null;
      this._kitAt = null;
      this._holdS = 0;
      this._lastDock = null;      // { stationId, x, z }
      this._wasBankrupt = false;
      this._bankruptAt = -Infinity;
      this._takenEver = false;
      const on = (event, fn) => {
        const off = this.bus && this.bus.on ? this.bus.on(event, fn) : null;
        if (typeof off === 'function') this._unsubs.push(off);
      };
      on('dock:range', (p = {}) => this._onDockRange(p || {}));
      on('sector:exit', () => this._reset());
      on('save:loaded', () => this._reset());
      on('game:new', () => this._reset());
      on('game:newGame', () => this._hardReset());
    },

    destroy() {
      for (const off of this._unsubs || []) {
        try { off(); } catch (err) { /* cleanup must not throw */ }
      }
      this._unsubs = [];
      this._reset();
      this.state = null;
      this.bus = null;
    },

    _reset() {
      this._despawnKit();
      this._lastDock = null;
      this._wasBankrupt = false;
    },

    _hardReset() {
      this._reset();
      this._takenEver = false;
      this._bankruptAt = -Infinity;
    },

    _despawnKit() {
      if (this._kitId != null && this.helpers && typeof this.helpers.removeEntity === 'function') {
        this.helpers.removeEntity(this._kitId);
      }
      this._kitId = null;
      this._kitAt = null;
      this._holdS = 0;
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s && s.simTime) ? s.simTime : (Number.isFinite(s && s.tick) ? s.tick / 60 : 0);
    },

    _onDockRange(p) {
      const s = this.state;
      if (!s || s.mode !== 'flight') return;
      if (!p || p.shipId == null || p.shipId !== s.playerId || !p.inRange || !p.stationId) return;
      const station = this._stationById(p.stationId);
      if (!station || !station.pos) return;
      this._lastDock = { stationId: p.stationId, x: station.pos.x, z: station.pos.z };
    },

    update(dt) {
      const s = this.state;
      if (!s || s.mode !== 'flight') return;
      const now = this._now();
      const player = s.entities && s.entities.get ? s.entities.get(s.playerId) : null;
      if (!player) return;

      // True bankrupt: credits <= 0 with debt on the note.
      const credits = Number(s.player && s.player.credits);
      const debt = Number(s.player && s.player.debt);
      const bankrupt = Number.isFinite(credits) && credits <= 0 && Number.isFinite(debt) && debt > 0;
      if (bankrupt && !this._wasBankrupt && now - this._bankruptAt >= SECOND_START_TUNING.bankruptCooldownS) {
        this._bankruptAt = now;
        this._spawnKit(now);
      }
      this._wasBankrupt = bankrupt;

      // Taking it: hold the locker at pickup range.
      if (this._kitId != null) {
        const kit = s.entities && s.entities.get ? s.entities.get(this._kitId) : null;
        if (!kit || kit.alive === false || !kit.pos) { this._kitId = null; return; }
        if (player.pos && Math.hypot(kit.pos.x - player.pos.x, kit.pos.z - player.pos.z) <= SECOND_START_TUNING.pickupRangeWu) {
          this._holdS += Math.max(0, Number(dt) || 0);
          if (this._holdS >= SECOND_START_TUNING.takeHoldS) {
            const loanNote = !!(kit.data && kit.data.plantsPl361LoanNote);
            const id = `plants:pl361:take:${Math.round(now)}`;
            this.bus.emit('comms:popup', {
              id, sender: 'THE LANE', category: 'story',
              text: loanNote
                ? 'Rope, tank, chalk — and a loan note, in someone\u2019s handwriting.'
                : 'Rope, tank, chalk: from the lane. Pay it back someday.',
              ttl: 8, persist: false,
            });
            this.bus.emit('audio:cue', { id: 'confirm', position: null, gain: 0.5, rate: 1.0 });
            this.bus.emit(PLANTS_KIT_EVENT, { kind: 'taken', loanNote, t: now });
            player.data = player.data || {};
            player.data[PL_361_TAKEN_STAMP] = { at: now, loanNote };
            this._takenEver = true;
            this._despawnKit();
          }
        } else {
          this._holdS = 0;
        }
      }
    },

    _spawnKit(now) {
      const spawnEntity = this.helpers && this.helpers.spawnEntity;
      if (typeof spawnEntity !== 'function' || !this._lastDock) return;
      const loanNote = this._takenEver;
      const h = hash32('plantsPl361Kit', String(this._lastDock.stationId));
      const a = (h % 6283) / 1000;
      const ent = spawnEntity({
        type: 'beacon',
        pos: { x: this._lastDock.x + Math.cos(a) * 46, z: this._lastDock.z + Math.sin(a) * 46 },
        vel: { x: 0, z: 0 },
        radius: 5,
        mass: 1e6,
        hull: 1,
        hullMax: 1,
        data: {
          parentType: 'story_prop',
          storyPropKind: 'plants_starter_locker',
          plantsPl361Kit: true,
          plantsPl361LoanNote: loanNote,
          scanLabel: loanNote
            ? 'A starter locker at your last dock — rope, tank, chalk, and a loan note'
            : 'A starter locker at your last dock — rope, tank, chalk',
          swarmFloorPad: { label: loanNote ? LOAN_NOTE_LINE : SECOND_START_LINE },
          masslineTetherable: true,
        },
      });
      if (!ent || ent.id == null) return;
      this._kitId = ent.id;
      const id = `plants:pl361:wait:${Math.round(now)}`;
      this.bus.emit('comms:popup', {
        id, sender: 'YOUR LAST DOCK', category: 'story',
        text: loanNote
          ? 'Bankrupt twice. A kit waits anyway — this one carries a loan note.'
          : 'True bankrupt, and a starter kit waits at your last dock. FROM THE LANE.',
        ttl: 9, persist: false,
      });
      this.bus.emit(PLANTS_KIT_EVENT, { kind: 'waiting', loanNote, stationId: this._lastDock.stationId, t: now });
    },

    _stationById(stationId) {
      const s = this.state;
      const idx = s && s.entityIndex;
      const list = (idx && Array.isArray(idx.stations)) ? idx.stations
        : (s && Array.isArray(s.entityList) ? s.entityList : []);
      for (const st of list) {
        if (!st || st.alive === false || st.type !== 'station') continue;
        const sid = (st.data && st.data.stationId) || st.id;
        if (sid === stationId) return st;
      }
      return null;
    },
  };
}

export const pl361SecondStart = createPl361SecondStart();
