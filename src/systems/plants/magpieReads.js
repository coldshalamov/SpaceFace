// PL-117 Magpie reads you — "Passing the Seam, Magpie calls your hold out on open radio,
// item by item. Pass him empty and he reads that too: 'Nothing. Bold.'"
// What the player can do: "Fly around; or carry exactly what you want the lane to know about."
//
// Invariants:
// - Deterministic: state.simTime/state.tick only; no Math.random/Date.now; no Three.js/DOM.
// - All state on `this` (session-only); approach ledger bounded (tuning.memoryCap); cooldown
//   per pass.
// - Anchors sector_rhea_cinder / station_rhea_cinder — read from live entities; the module
//   spawns its own props only (never edits src/data).
// - Reads the player's hold manifest (state.player.cargo.items) read-only; writes nothing
//   to the cargo owner.

export const PLANTS_MAGPIE_EVENT = 'plants:magpieReads';

export const MAGPIE_TUNING = Object.freeze({
  plId: 'pl117',
  sectorId: 'sector_rhea_cinder',
  stationId: 'station_rhea_cinder',
  seamRangeWu: 900,        // the Seam approach ring off the Cinder Claim
  passSpeedWu: 20,         // a pass, not a park
  passCooldownS: 45,       // once per approach
  maxItemsRead: 3,         // "item by item" stays short on the band
  memoryCap: 8,            // pass receipts this session
});

/** Pure: the hold manifest read — items flattened to {label, qty} rows, capped. */
export function holdManifest(cargo, maxItems = MAGPIE_TUNING.maxItemsRead) {
  const items = cargo && Array.isArray(cargo.items) ? cargo.items : [];
  const rows = [];
  for (const item of items) {
    if (!item || !item.commodityId || !(item.qty > 0)) continue;
    rows.push({ label: magpieLabel(item.commodityId), qty: item.qty, commodityId: item.commodityId });
    if (rows.length >= maxItems) break;
  }
  return rows;
}

/** Pure: Magpie's label for a commodity id — the hold's names on open radio. */
export function magpieLabel(commodityId) {
  return String(commodityId || 'cargo')
    .replace(/^cmdty_/, '')
    .replace(/_/g, ' ');
}

/** Pure: Magpie's line for one manifest row. */
export function magpieLineFor(row) {
  if (!row) return 'Nothing. Bold.';
  return `${row.label} — ${row.qty}.`;
}

export const magpieReadsPlant = {
  modes: ['flight'],
  name: 'plants117',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._ownedIds = new Set();
    this._armed = true;          // one read per approach; re-armed by leaving the sector
    this._passTimes = new Map(); // approachKey -> simTime (bounded)
    this._accum = 0;
    if (!this.bus || typeof this.bus.on !== 'function') return;
    const on = (event, fn) => {
      const off = this.bus.on(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('sector:exit', () => { this._armed = true; this._passTimes = new Map(); });
  },

  update(dt) {
    const s = this.state;
    if (s && s.mode && s.mode !== 'flight') return;
    if (!s || !this.bus || !this._armed) return;
    if ((s.world && s.world.currentSectorId) !== MAGPIE_TUNING.sectorId) return;
    this._accum += dt;
    if (this._accum < 1) return;   // 1 Hz — the Seam is crossed at walking pace
    this._accum = 0;
    const player = s.entities && s.entities.get(s.playerId);
    const station = this._station();
    if (!player || !player.pos || !station) return;
    const distWu = Math.hypot(player.pos.x - station.pos.x, player.pos.z - station.pos.z);
    if (distWu > MAGPIE_TUNING.seamRangeWu) return;
    const speed = Math.hypot(player.vel ? player.vel.x : 0, player.vel ? player.vel.z : 0);
    if (speed < MAGPIE_TUNING.passSpeedWu) return;   // parked in the Seam reads as nothing
    const now = Number.isFinite(s.simTime) ? s.simTime : 0;
    const key = String(Math.floor(now / MAGPIE_TUNING.passCooldownS));
    if (this._passTimes.has(key)) return;
    this._passTimes.set(key, now);
    if (this._passTimes.size > MAGPIE_TUNING.memoryCap) {
      const oldest = this._passTimes.keys().next().value;
      this._passTimes.delete(oldest);
    }
    this._armed = false;
    this._readHold(now, distWu);
  },

  destroy() {
    if (!this._unsubs) { this.state = null; this.bus = null; return; }
    for (const off of this._unsubs) {
      try { off(); } catch (err) { /* cleanup must not throw */ }
    }
    this._unsubs = [];
    this._despawnOwned();
    this._passTimes = new Map();
    this._armed = true;
     this.state = null;
    this.bus = null;
  },

  // ---- internals ----

  _station() {
    const s = this.state;
    const idx = s.entityIndex && Array.isArray(s.entityIndex.stations) ? s.entityIndex.stations : null;
    const lists = [idx, Array.isArray(s.entityList) ? s.entityList : null];
    for (const list of lists) {
      if (!list) continue;
      for (const e of list) {
        if (e && e.type === 'station' && e.alive !== false && e.data && e.data.stationId === MAGPIE_TUNING.stationId) return e;
      }
    }
    if (s.entities && typeof s.entities.values === 'function') {
      for (const e of s.entities.values()) {
        if (e && e.type === 'station' && e.alive !== false && e.data && e.data.stationId === MAGPIE_TUNING.stationId) return e;
      }
    }
    return null;
  },

  _readHold(now, distWu) {
    const s = this.state;
    const rows = holdManifest(s.player && s.player.cargo, MAGPIE_TUNING.maxItemsRead);
    this.bus.emit('audio:cue', { id: 'confirm', position: null, gain: 0.5, rate: 1.1 });
    if (rows.length === 0) {
      this._say(`plants:pl117:empty:${s.tick}`, 'Nothing. Bold.', 7);
      this.bus.emit(PLANTS_MAGPIE_EVENT, { kind: 'emptyHold', distWu, t: now });
      return;
    }
    for (let i = 0; i < rows.length; i++) {
      this._say(`plants:pl117:item:${i}:${s.tick}`, magpieLineFor(rows[i]), 7);
    }
    this.bus.emit(PLANTS_MAGPIE_EVENT, { kind: 'readsHold', items: rows, distWu, t: now });
  },

  _say(id, text, ttl) {
    if (!this.bus) return;
    this.bus.emit('comms:popup', { id, sender: 'MAGPIE', category: 'traffic', text, ttl, persist: false });
    const voice = this.helpers && this.helpers.voice;
    if (voice && typeof voice.say === 'function') {
      voice.say({ channel: 'comms', id, text, ttl, key: MAGPIE_TUNING.plId });
    }
  },

  _despawnOwned() {
    const removeEntity = this.helpers && this.helpers.removeEntity;
    if (typeof removeEntity !== 'function') return;
    for (const id of this._ownedIds) removeEntity(id);
    this._ownedIds = new Set();
  },
};
