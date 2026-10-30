// W-CAST-HANDS (row 542, 03 §4.1 / 06 B3): Slate's column — the welder's ledger-pillar
// at Vesta Forge. Every weld the player's hull takes (anywhere — weld stress is on the
// seam, not the postcode) rings the column once; the pillar reads the count to a hull
// standing in its ring and predicts the canon's number — the seam holds to three and
// goes at four. The fourth spike files the player's entry (slate_column_entry), the
// receipt B3's Variance Adjustment will one day make literal.
//
// WHAT THIS OWNS — one beacon marking the pillar (event-driven seams like every one-off:
// init / deferred sector-enter / save:loaded / newGame), the weld-spike counter in
// state.story.flags (serialized wholesale), and the calendar proximity read. The column
// never repairs or harms the hull — it records; the prediction is the hook.
import { SLATE_COLUMN } from '../data/slate.js';
import { slateWeldSpike, slateColumnInRange, slateColumnLine } from '../characters/slateRules.js';
import { deferSectorEnterMaterialization } from '../core/sectorEnterDefer.js';

export function slateColumnSpec() {
  return {
    type: 'beacon',
    pos: { ...SLATE_COLUMN.pos }, vel: { x: 0, z: 0 },
    radius: 14, mass: 1e6, hull: 1, hullMax: 1,
    collides: false,
    homeSectorId: SLATE_COLUMN.sectorId,
    data: {
      slateColumn: true, parentType: 'story_prop',
      scanLabel: "Slate's column — weld-spike ledger",
      scannerSignalKind: 'salvage',
      homeSectorId: SLATE_COLUMN.sectorId,
    },
  };
}

export function createSlateColumn() {
  return {
    name: 'slateColumn',
    init(ctx) {
      this.destroy();
      this.state = ctx.state; this.bus = ctx.bus; this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._readArmed = true;
      const on = (event, fn) => {
        const off = this.bus?.on(event, fn); if (typeof off === 'function') this._unsubs.push(off);
      };
      on('sector:enter', (p) => {
        this._readArmed = true;
        if (deferSectorEnterMaterialization(this.state, p, this._cookProvider)) return;
        this._sync();
      });
      this._cookProvider = () => { this._sync(); };
      (this.helpers.sectorCookProviders || (this.helpers.sectorCookProviders = []))
        .push(this._cookProvider);
      on('save:loaded', () => this._sync());
      on('game:newGame', () => { this._readArmed = true; this._sync(); });
      on('service:completed', (p) => this._onService(p));
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
      return !run || !run.kind || run.kind === 'adventure' || run.kind === 'campaign';
    },
    _inSector() {
      return this.state?.world?.currentSectorId === SLATE_COLUMN.sectorId;
    },
    _player() {
      const s = this.state;
      const id = s?.playerId;
      if (!id) return null;
      return s.entities?.get?.(id) || (s.entityList || []).find((e) => e && e.id === id) || null;
    },
    _beacon() {
      for (const e of this.state?.entityList || []) {
        if (e?.alive && e.data?.slateColumn === true) return e;
      }
      return null;
    },
    _removeOwned() {
      for (const e of this.state?.entityList || []) {
        if (e?.alive && e.data?.slateColumn === true) this.helpers?.removeEntity?.(e.id);
      }
    },
    _sync() {
      if (!this.state?.story) return;
      if (!(this._adventure() && this._inSector())) { this._removeOwned(); return; }
      if (!this._beacon() && this.helpers.spawnEntity) this.helpers.spawnEntity(slateColumnSpec());
      const flags = this._flags();
      if (flags && flags[SLATE_COLUMN.announceFlag] !== true) {
        flags[SLATE_COLUMN.announceFlag] = true;
        this.bus?.emit('comms:popup', {
          id: 'slate_column_announce', sender: SLATE_COLUMN.sender, category: 'story',
          text: SLATE_COLUMN.announce, ttl: 9, persist: false,
        });
      }
    },
    /** Every real weld rings the column — a spike on the seam's ledger, wherever the
     *  berth stood. The fourth files the player's entry: the receipt Slate promised. */
    _onService(p) {
      if (!this._adventure() || !slateWeldSpike(p)) return;
      const flags = this._flags();
      if (!flags) return;
      const spikes = (Number(flags[SLATE_COLUMN.spikeFlag]) || 0) + 1;
      flags[SLATE_COLUMN.spikeFlag] = spikes;
      const fourth = spikes === SLATE_COLUMN.failureSpike;
      if (fourth) flags[SLATE_COLUMN.entryFlag] = true;
      const atYard = this._inSector();
      if (!atYard && !fourth) return; // off-sector welds still ring silently; only the prediction speaks
      this.bus?.emit('comms:popup', {
        id: `slate_spike_${spikes}`, sender: SLATE_COLUMN.sender,
        category: fourth ? 'warning' : 'story',
        text: (fourth ? SLATE_COLUMN.fourth : SLATE_COLUMN.spike).replace('{n}', String(spikes)),
        ttl: 9, persist: fourth,
      });
      this.bus?.emit('slate:spike', {
        spikes, fourth, entry: flags[SLATE_COLUMN.entryFlag] === true,
        stationId: p?.stationId || null,
      });
    },
    /** Calendar read pass: a hull standing in the pillar's ring hears its number — once
     *  per visit; leaving the sector re-arms the read. */
    update(dt, state) {
      const s = state || this.state;
      if (!s || !(this._adventure() && this._inSector())) return;
      const player = this._player();
      const inside = !!(player && player.alive !== false && slateColumnInRange(player.pos));
      if (!inside) { if (player) this._readArmed = true; return; }
      if (!this._readArmed) return;
      this._readArmed = false;
      const flags = this._flags();
      const spikes = flags ? (Number(flags[SLATE_COLUMN.spikeFlag]) || 0) : 0;
      this.bus?.emit('comms:popup', {
        id: `slate_column_read_${s.tick || 0}`, sender: SLATE_COLUMN.sender, category: 'story',
        // "The seam went" only when the story actually opened it — never off the weld count.
        text: slateColumnLine(spikes, { seamWent: !!flags && flags.variance_seam_failed === true }),
        ttl: 9, persist: false,
      });
      this.bus?.emit('slate:columnRead', {
        spikes, entry: flags ? flags[SLATE_COLUMN.entryFlag] === true : false,
        predictsFailureAt: SLATE_COLUMN.failureSpike,
      });
    },
  };
}

export const slateColumn = createSlateColumn();
