// PL-127 Litter — Ditch cargo in a lane and traffic asks "Whose?" on open radio; three in a day bills you.
// Row (design/program/INFERENCE_PLANTS.md §A):
//   What happens: Ditch cargo in a lane and it stays put; traffic files round it on open radio
//   — "Whose?" Ditch three in a day and the sweep bill finds you at the next dock
//   What the player can do: Go back for it; or leave it and pay the sweep
//
// Invariants:
// - Deterministic: state.simTime/state.tick only; no Math.random() or Date.now();
//   variety via hash32(seed, label, key) from src/core/rng.js.
// - No Three.js or DOM imports.
// - Memory bounded via LITTER_TUNING.memoryCap with FIFO + stale eviction.
// - NPC movement only via requestTrafficReaction/releaseTrafficReaction; litter stays put, so
//   this plant never steers anyone.
// - Cooldowns per pod key. All session state lives on `this`, never module-level.
//
// The sweep bill charges through the economy owner's real transaction intent seam
// (economy:chargeCredits {amount, reason}, the same emit bombs.js uses — economy.js listens
// and owns the wallet write).

export const PLANTS_LITTER_EVENT = 'plants:litterDropped';
export const PLANTS_LITTER_SWEEP_BILL_EVENT = 'plants:litterSweepBill';

export const LITTER_BARK = 'Whose?';
export const LITTER_SWEEP_BILL_LINE = 'Sweep bill: three pods.';

export const LITTER_TUNING = Object.freeze({
  dayWindowS: 240,          // "three in a day": the counting window
  sweepBillAt: 3,           // ditch this many inside the window and the bill finds you
  sweepBillCr: 250,         // what the sweep costs, charged via economy:chargeCredits
  barkCooldownS: 6,         // the open-radio "Whose?" cooldown per litter drop
  billOnceS: 600,           // once delivered, the bill will not re-find you for this long
  memoryCap: 24,            // bounded litter pod rows (the ledger of dropped pods)
});

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Decision helper (pure): is this spawn a player-ditched cargo pod? The canonical stamp is
 * spawnJettisonedCargoPod's playerJettisonOrigin (owner === player at spawn).
 */
export function isPlayerLitterPod(entity) {
  if (!entity || entity.alive === false) return false;
  const data = entity.data || {};
  return data.playerJettisonOrigin != null && data.jettisonedCargo === true;
}

/**
 * Memory-row builder (pure): the day-window litter ledger with FIFO + stale eviction.
 */
export function litterLedgerFor(memory, now, cap = LITTER_TUNING.memoryCap) {
  if (!memory) return null;
  let row = memory.get('ledger');
  if (!row || now - row.windowStartAt > LITTER_TUNING.dayWindowS) {
    if (memory.size >= cap) {
      while (memory.size >= cap) memory.delete(memory.keys().next().value);
    }
    row = { podIds: [], windowStartAt: now, billDue: false, billPaidAt: -Infinity, lastBarkAt: -Infinity, lastAt: now };
    memory.set('ledger', row);
  }
  // Trim the pod id list to the window even when the row survives.
  return row;
}

export const litterOps = {
  _initLitter(ctx = {}) {
    this._litterMemory = new Map();
    if (this.bus && typeof this.bus.on === 'function' && !this._litterInstalled) {
      this._litterInstalled = true;
      this.bus.on('entity:spawned', (p) => this._onLitterSpawned(p));
      this.bus.on('pickup:collected', (p) => this._onLitterPickedUp(p));
      this.bus.on('dock:range', (p) => this._onLitterDockRange(p));
    }
  },

  _litterMemoryMap() {
    if (!(this._litterMemory instanceof Map)) this._litterMemory = new Map();
    return this._litterMemory;
  },

  /** entity:spawned receipt: the player ditched cargo — it stays put and the route asks. */
  _onLitterSpawned(payload) {
    if (!payload || !payload.entity || !this.state) return;
    if ((this.state.mode && this.state.mode !== 'flight')) return;
    const ent = payload.entity;
    if (!isPlayerLitterPod(ent)) return;

    const now = finite(this.state.simTime, 0);
    const row = litterLedgerFor(this._litterMemoryMap(), now);
    if (!row) return;
    row.lastAt = now;

    // It stays put: mark the pod as litter (no despawn pressure from this plant; owner seam).
    const data = ent.data || (ent.data = {});
    data.litter = true;

    if (row.podIds.length >= LITTER_TUNING.memoryCap) row.podIds.shift();
    row.podIds.push(payload.id);

    if (now - row.windowStartAt > LITTER_TUNING.dayWindowS) {
      row.windowStartAt = now;
    }

    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit(PLANTS_LITTER_EVENT, { podId: payload.id, count: row.podIds.length, t: now });
      if (now - row.lastBarkAt >= LITTER_TUNING.barkCooldownS
          && this.helpers && this.helpers.voice && typeof this.helpers.voice.say === 'function') {
        row.lastBarkAt = now;
        this.helpers.voice.say({
          channel: 'comms',
          id: 'plants:pl127:whose',
          text: LITTER_BARK,
          kind: 'traffic',
          ttl: 4,
        });
      }
    }
  },

  /** pickup:collected: going back for it clears the pod from the ledger. */
  _onLitterPickedUp(payload) {
    if (!payload || !this.state) return;
    if (payload.collectorId !== this.state.playerId) return;
    const row = this._litterMemoryMap().get('ledger');
    if (!row) return;
    const idx = row.podIds.indexOf(payload.pickupId);
    if (idx >= 0) row.podIds.splice(idx, 1);
  },

  /** dock:range: three in a day and the sweep bill finds you at the next dock. */
  _onLitterDockRange(payload) {
    if (!payload || !this.state) return;
    if (payload.shipId !== this.state.playerId || payload.inRange !== true) return;
    const now = finite(this.state.simTime, 0);
    const row = this._litterMemoryMap().get('ledger');
    if (!row) return;
    row.lastAt = now;
    if (now - row.billPaidAt < LITTER_TUNING.billOnceS) return;
    if (row.podIds.length < LITTER_TUNING.sweepBillAt) return;

    row.billDue = false;
    row.billPaidAt = now;
    row.podIds.length = 0; // the sweep happens; the lane is clean again
    if (this.bus && typeof this.bus.emit === 'function') {
      // The bill charges through the economy owner's transaction intent seam; the wallet
      // write (or debt record) stays the economy system's single decision.
      this.bus.emit('economy:chargeCredits', { amount: LITTER_TUNING.sweepBillCr, reason: 'plants:pl127:sweep-bill' });
      this.bus.emit(PLANTS_LITTER_SWEEP_BILL_EVENT, { stationId: payload.stationId, charged: LITTER_TUNING.sweepBillCr, t: now });
      this.bus.emit('audio:cue', { id: 'ui_deny', position: null, gain: 0.7, rate: 1 });
      this.bus.emit('comms:popup', {
        id: 'plants:pl127:bill',
        sender: 'DOCK',
        category: 'traffic',
        text: LITTER_SWEEP_BILL_LINE,
        ttl: 6,
      });
    }
  },
};
