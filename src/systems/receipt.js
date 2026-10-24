// W-SHIFT (row 506, 03 §4.3): RECEIPT / PR-8 — the printer filing every kill. A real
// marked drone hull trails the player through Kepler Scar's wreck-yard market and files
// each of the player's kills as a printed receipt — one serial per hull, bulk returns
// batched into a range on the calendar pass, the counter durable in story flags because
// the printer was running long before you arrived. Kill the printer and it files its own
// final receipt, once, then the feed goes dark.
//
// WHAT THIS OWNS — the printer body (event seams like every one-off: init / deferred
// sector-enter / save:loaded / newGame), the pending-kill hopper between calendar passes,
// the serial ledger in story flags, and a calendar follow-steering pass. It never touches
// the kill itself — combat owns the death; the printer only reads the report.
import { RECEIPT } from '../data/receipt.js';
import {
  receiptPrintableKill, receiptLine, receiptBatchLine, receiptFollowVelocity,
} from '../characters/receiptRules.js';
import { deferSectorEnterMaterialization } from '../core/sectorEnterDefer.js';

export function receiptSpec() {
  return {
    type: 'drone',
    pos: { ...RECEIPT.spawn }, vel: { x: 0, z: 0 },
    radius: 8, mass: 18, hull: 150, hullMax: 150,
    homeSectorId: RECEIPT.sectorId,
    data: {
      receipt: true, authoredCharacter: 'receipt', parentType: 'story_prop',
      callsign: RECEIPT.callsign,
      scanLabel: 'RECEIPT / PR-8 — kill-feed printer',
      scannerSignalKind: 'salvage',
      homeSectorId: RECEIPT.sectorId,
    },
  };
}

export function createReceipt() {
  return {
    name: 'receipt',
    init(ctx) {
      this.destroy();
      this.state = ctx.state; this.bus = ctx.bus; this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._pending = []; // kill payloads awaiting the next calendar pass
      const on = (event, fn) => {
        const off = this.bus?.on(event, fn); if (typeof off === 'function') this._unsubs.push(off);
      };
      on('sector:enter', (p) => {
        this._pending.length = 0;
        if (deferSectorEnterMaterialization(this.state, p, this._cookProvider)) return;
        this._sync();
      });
      this._cookProvider = () => { this._sync(); };
      (this.helpers.sectorCookProviders || (this.helpers.sectorCookProviders = []))
        .push(this._cookProvider);
      on('save:loaded', () => this._sync());
      on('game:newGame', () => { this._pending.length = 0; this._sync(); });
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
        && this.state?.world?.currentSectorId === RECEIPT.sectorId;
    },
    _drone() {
      for (const e of this.state?.entityList || []) {
        if (e?.alive && e.data?.receipt === true) return e;
      }
      return null;
    },
    _removeOwned() {
      for (const e of this.state?.entityList || []) {
        if (e?.alive && e.data?.receipt === true) this.helpers?.removeEntity?.(e.id);
      }
    },
    _sync() {
      if (!this.state?.story) return;
      if (!this._adventure()) { this._removeOwned(); this._pending.length = 0; return; }
      if (!this._drone() && this.helpers.spawnEntity) this.helpers.spawnEntity(receiptSpec());
      const flags = this._flags();
      if (flags && flags[RECEIPT.announceFlag] !== true) {
        flags[RECEIPT.announceFlag] = true;
        this.bus?.emit('comms:popup', {
          id: 'receipt_announce', sender: RECEIPT.sender, category: 'story',
          text: RECEIPT.announce, ttl: 9, persist: false,
        });
      }
    },
    /** The printer reads every kill report. Its own death files the final receipt; every
     *  other report goes in the hopper for the next pass — a printer works in batches. */
    _onKilled(p) {
      if (!this._adventure() || !p) return;
      const drone = this._drone();
      if (drone && p.id === drone.id) {
        const flags = this._flags();
        if (flags && !flags.receipt_final) {
          flags.receipt_final = true;
          this.bus?.emit('comms:popup', {
            id: 'receipt_final', sender: RECEIPT.sender, category: 'story',
            text: RECEIPT.finalLine, ttl: 9, persist: false,
          });
        }
        this._pending.length = 0;
        return;
      }
      if (!drone) return; // no printer, no feed
      const playerId = this.state?.playerId ?? this.state?.player?.id;
      if (!receiptPrintableKill(p, playerId, drone.id)) return;
      this._pending.push({
        victimClass: p.victimClass || p.type || null,
        hostile: p.targetHostileToPlayer === true,
      });
    },
    /** Calendar pass: steer toward the client, then flush the hopper — one popup per
     *  batch, serials durable in the story flags so the counter survives the save. */
    update() {
      if (!this._adventure()) return;
      const drone = this._drone();
      if (drone) {
        const player = this.state?.player || (this.state?.entities?.get?.(this.state?.playerId));
        const v = receiptFollowVelocity(drone.pos, player?.pos, player?.vel);
        drone.vel = v;
      }
      if (this._pending.length === 0) return;
      const flags = this._flags();
      if (!flags) { this._pending.length = 0; return; }
      let serial = Number.isFinite(flags[RECEIPT.serialFlag]) ? flags[RECEIPT.serialFlag] : RECEIPT.serialStart;
      const batch = this._pending.splice(0);
      const lo = serial, innocents = batch.filter((k) => !k.hostile).length;
      let text;
      if (batch.length === 1) {
        text = receiptLine(lo, batch[0].victimClass, batch[0].hostile);
        serial += 1;
      } else {
        serial += batch.length;
        text = receiptBatchLine(lo, serial - 1, batch.length, innocents);
      }
      flags[RECEIPT.serialFlag] = serial;
      this.bus?.emit('comms:popup', {
        id: `receipt_${lo}`, sender: RECEIPT.sender, category: 'story',
        text, ttl: 8, persist: false,
      });
    },
  };
}

export const receipt = createReceipt();
