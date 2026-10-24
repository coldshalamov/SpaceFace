// moistureLoss.js — W-CAST-HANDS row 542, Drift's hook (§34.8): moisture loss as a
// physical mechanic. Ice-family cargo in the hold sublimates while the hull sits in
// sunlight, so a load of ice is a race against the leg, not a number on a manifest.
//
// WHAT THIS OWNS — exactly one record: `state.player.cargo.moisture`, a JSON-safe map of
// commodityId → fractional progress toward the next vented unit. It lives on the cargo
// record the same way salvageBay does, so it serializes through _serializeCargo as one
// optional key (absent = nothing has ever melted; old saves load byte-identical).
//
// WHAT DRIVES IT — a per-sector insolation constant, not elapsed time alone. The hold
// only vents while the ship is flying in a lit sector with ice aboard: docked hulls are
// shaded by the berth (the ui.docked latch or the hull's flags.docked — the same pair
// fragileCargo checks), dark-sector legs lose nothing, and a partly-melted load keeps
// its fraction across sectors, saves, and dockings — but dies with the lot when the
// line leaves the hold entirely. Removal goes through removeCargo, the cargo
// single-writer, so usedVolume/usedMass caches and rich-lot provenance stay honest.
//
// PLAYER TRUTH — two bounded comms beats, never a stream: one warning on sector entry
// with ice aboard a lit sector, and one line the first time the hold actually gets
// lighter on that visit. Every vented unit also emits `moisture:loss` so missions,
// contracts, and the weigher's own fiction can read the loss without a poll.
//
// Determinism: state.simTime-free — the calendar clock supplies elapsed dt; no wall
// clock, no ambient randomness. The system never spawns a body and never touches the
// entity map, so it needs no cook provider.

import { removeCargo } from './cargo.js';

export const MOISTURE_LOSS = Object.freeze({
  /** Seconds of full-sun flight (insolation 1.0) to vent one unit of ice. */
  secondsPerUnit: 75,
  /** Ice-family commodities the sun can take. Volatile classes describe jettison
   *  behavior, not composition — this list is the composition truth. */
  ice: Object.freeze(['cmdty_ice_water', 'cmdty_volatiles']),
  /** Insolation per sector: how much of the sun reaches a flying hold. Inner-system
   *  legs race hard; the outer dark barely sweats. Unlisted sectors are dark. */
  insolation: Object.freeze({
    sector_helios_prime: 1.0,
    sector_ceres_belt: 0.85,
    sector_vesta_forge: 0.8,
    sector_tethys_junction: 0.7,
    sector_pallas_drift: 0.55,
    sector_io_reach: 0.4,
    sector_charon_expanse: 0.15,
    sector_sker_haven: 0.1,
    sector_veil_nebula: 0.05,
    sector_ashfall_reach: 0.05,
  }),
  sender: 'HOLD TELEMETRY',
  /** The entry warning and the first-loss line. {name} is the commodity name, {n} the
   *  units aboard, {rate} the per-minute vent expectation at this sector's light. */
  entryWarning: 'Ice aboard, sun overhead — {name} is venting. {n}u aboard, roughly one every {rate}s in this light.',
  /** Same beat when the hold crosses back into the light already sweating. */
  entryWarningWarm: 'Back in the light — the {name} never stopped sweating. {n}u aboard, next unit inside ~{rate}s of sun.',
  firstLoss: 'The hold is lighter. {name} sublimated to crystal and bled off — {n}u left.',
});

/** Commodity display name without importing the market table: the data file already
 *  declares names, but a trim map keeps this system free of economy dependencies. */
const ICE_NAME = Object.freeze({ cmdty_ice_water: 'Water Ice', cmdty_volatiles: 'Ice Volatiles' });

export function createMoistureLoss() {
  return {
    name: 'moistureLoss',

    init(ctx) {
      // Re-init on the exported singleton retires the old listener set before
      // re-subscribing (wexTicket/docket convention) — never stack a second set.
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this._unsubs = [];
      this._venting = 0;
      // One warning per sector visit: re-armed whenever the ship crosses a boundary,
      // so the same sector after a round trip warns again, but the same sector's
      // 500th tick does not.
      this._warned = false;
      this._lossNoted = false;
      if (this.bus && typeof this.bus.on === 'function') {
        this._unsubs.push(this.bus.on('sector:enter', () => {
          this._warned = false;
          this._lossNoted = false;
          this._entryWarning(this.state);
        }));
        this._unsubs.push(this.bus.on('game:newGame', () => this._reset()));
        // A lot that leaves the hold entirely takes its sweat with it — a sale,
        // jettison, or parked-hold swap that empties an ice line kills its
        // fraction here, instead of surviving as a head start on the next lot.
        this._unsubs.push(this.bus.on('cargo:changed', () => this._sweepGoneLots(this.state)));
      }
    },

    _reset() {
      this._warned = false;
      this._lossNoted = false;
      const cargo = this.state && this.state.player && this.state.player.cargo;
      if (cargo && cargo.moisture) delete cargo.moisture;
    },

    _exposure(state) {
      const sectorId = state && state.world && state.world.currentSectorId;
      return MOISTURE_LOSS.insolation[sectorId] || 0;
    },

    /** Berthed is berthed: the UI latch or the sim-side dock flag on the player
     *  hull (same pair fragileCargo checks — a dock flagged without the UI latch
     *  still sits in the berth's shade). */
    _isDocked(state) {
      if (state && state.ui && state.ui.docked) return true;
      const player = state && state.entities && typeof state.entities.get === 'function'
        ? state.entities.get(state.playerId)
        : null;
      return !!(player && player.flags && player.flags.docked);
    },

    /** Fractions belong to the lot physically aboard. When an ice line leaves the
     *  hold completely — sold, jettisoned, parked with a swapped hull, or vented
     *  dry — its accumulator dies with the lot rather than waiting in the record
     *  as a phantom head start for a different lot of the same commodity. */
    _sweepGoneLots(state) {
      if (this._venting) return; // a vent in flight owns its own decrement
      const cargo = state && state.player && state.player.cargo;
      const moisture = cargo && cargo.moisture;
      if (!moisture || typeof moisture !== 'object') return;
      for (const id of Object.keys(moisture)) {
        if (!MOISTURE_LOSS.ice.includes(id) || this._iceQty(cargo, id) <= 0) delete moisture[id];
      }
      if (!Object.keys(moisture).length) delete cargo.moisture;
    },

    _iceQty(cargo, commodityId) {
      const qty = Number(cargo && cargo.items && cargo.items[commodityId]) || 0;
      return qty > 0 ? qty : 0;
    },

    _iceAboard(state) {
      const cargo = state && state.player && state.player.cargo;
      if (!cargo) return null;
      for (const id of MOISTURE_LOSS.ice) {
        const qty = this._iceQty(cargo, id);
        if (qty > 0) return { id, qty };
      }
      return null;
    },

    _popup(id, text) {
      if (!this.bus || typeof this.bus.emit !== 'function') return;
      this.bus.emit('comms:popup', {
        id, sender: MOISTURE_LOSS.sender, text,
        category: 'warning', ttl: 8, persist: false,
      });
    },

    _entryWarning(state) {
      if (this._warned) return;
      if (this._isDocked(state)) return;
      if (this._exposure(state) <= 0) return;
      const aboard = this._iceAboard(state);
      if (!aboard) return;
      this._warned = true;
      const cargo = state && state.player && state.player.cargo;
      const warm = MOISTURE_LOSS.ice.some((id) =>
        (Number(cargo && cargo.moisture && cargo.moisture[id]) || 0) >= 0.25);
      const rate = Math.round(MOISTURE_LOSS.secondsPerUnit / this._exposure(state));
      this._popup('moisture:warn', (warm ? MOISTURE_LOSS.entryWarningWarm : MOISTURE_LOSS.entryWarning)
        .replace('{name}', ICE_NAME[aboard.id] || aboard.id)
        .replace('{n}', String(aboard.qty))
        .replace('{rate}', String(rate)));
    },

    /** Fractional sublimation accumulator on the cargo record. One optional key;
     *  absent until the first real drip so untouched saves stay byte-identical. */
    _moisture(cargo) {
      if (!cargo.moisture || typeof cargo.moisture !== 'object' || Array.isArray(cargo.moisture)) {
        cargo.moisture = {};
      }
      return cargo.moisture;
    },

    update(dt, state) {
      const s = state || this.state;
      if (!s) return;
      const exposure = this._exposure(s);
      if (exposure <= 0) return;
      if (this._isDocked(s)) return;
      const cargo = s.player && s.player.cargo;
      if (!cargo || !cargo.items) return;
      const span = Math.max(0, Number(dt) || 0);
      if (!(span > 0)) return;
      if (!this._warned) this._entryWarning(s);
      // Same gone-lot sweep as the cargo:changed listener — covers harness writes
      // and stale keys a save arrived with before they can bank a phantom unit.
      this._sweepGoneLots(s);

      let moisture = null;
      this._venting += 1;
      try {
        for (const id of MOISTURE_LOSS.ice) {
          if (this._iceQty(cargo, id) <= 0) continue;
          if (!moisture) moisture = this._moisture(cargo);
          moisture[id] = (Number(moisture[id]) || 0) + (exposure * span) / MOISTURE_LOSS.secondsPerUnit;
          while (moisture[id] >= 1 && this._iceQty(cargo, id) > 0) {
            const removed = removeCargo(s, id, 1);
            if (removed <= 0) { moisture[id] = 0; break; }
            moisture[id] -= 1;
            const remaining = this._iceQty(cargo, id);
            if (this.bus && typeof this.bus.emit === 'function') {
              this.bus.emit('moisture:loss', {
                commodityId: id, lost: 1, remaining,
                sectorId: s.world && s.world.currentSectorId || null,
                exposure,
              });
            }
            if (!this._lossNoted) {
              this._lossNoted = true;
              this._popup('moisture:loss', MOISTURE_LOSS.firstLoss
                .replace('{name}', ICE_NAME[id] || id)
                .replace('{n}', String(remaining)));
            }
          }
          // A line that vented dry has nothing left to accumulate against.
          if (this._iceQty(cargo, id) <= 0) delete moisture[id];
        }
      } finally {
        this._venting -= 1;
      }
    },

    destroy() {
      if (Array.isArray(this._unsubs)) {
        for (const off of this._unsubs) { try { off && off(); } catch { /* listener already gone */ } }
        this._unsubs = [];
      }
      this.state = null;
      this.bus = null;
    },
  };
}

export const moistureLoss = createMoistureLoss();
export default moistureLoss;
