// PL-143 The good patch — "Fly into Triton dented and Hanne Brandt has the patch on
// before you've docked: 'Patches and tea. That's the list.' Other patchers click their
// tongues at her work."
// What the player can do: "Come back dented often; or ask what the tea is for — she
// pours you one instead of answering."
//
// Invariants:
// - Deterministic: state.simTime/state.tick only; no Math.random/Date.now; no
//   Three.js/DOM imports.
// - All state on `this` (session-only); cooldown per approach; the approach state resets
//   when you leave dock range.
// - Anchors sector_triton_wake / station_triton via the dock:range seam (physics.js) —
//   the patch fires before you've docked, exactly as written.
// - The patch is a small direct hull restore on the player hull (the only seam for a
//   patch applied outside the dock services), once per approach and capped; the row's
//   quoted line is used verbatim.

export const PLANTS_GOOD_PATCH_EVENT = 'plants:goodPatch';

export const GOOD_PATCH_TUNING = Object.freeze({
  plId: 'pl143',
  sectorId: 'sector_triton_wake',
  stationId: 'station_triton',
  dentFrac: 0.85,          // below this fraction of hullMax you fly in dented
  patchHull: 12,
  askDelayS: 20,           // linger in range after the patch and she pours one
  patchCooldownS: 90,      // come back dented often — but not every second
  memoryCap: 4,            // approach ledger entries
});

/** Pure: is a hull at `hull`/`hullMax` dented enough for Hanne? */
export function isDented(hull, hullMax, dentFrac = GOOD_PATCH_TUNING.dentFrac) {
  return Number.isFinite(hull) && Number.isFinite(hullMax) && hullMax > 0 && hull < hullMax * dentFrac;
}

/** Pure: the hull after her patch — capped, never over max. */
export function patchedHull(hull, hullMax, amount = GOOD_PATCH_TUNING.patchHull) {
  if (!Number.isFinite(hull) || !Number.isFinite(hullMax)) return hull;
  return Math.min(hullMax, hull + amount);
}

export const goodPatchPlant = {
  name: 'plants143',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._inRange = false;
    this._patchedAt = null;
    this._patchCount = 0;
    this._tonguesDone = false;
    this._teaDone = false;
    this._patchTimes = new Map();   // approachKey -> simTime (bounded)
    if (!this.bus || typeof this.bus.on !== 'function') return;
    const on = (event, fn) => {
      const off = this.bus.on(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('dock:range', (p) => this._onDockRange(p));
    // game:newGame: simTime restarts near zero and the old station never emits a departure
    // edge, so a stale in-range latch or patched-at stamp would swallow the first visit.
    on('game:newGame', () => { this._inRange = false; this._patchedAt = null; this._teaDone = false; });
    // Same-sector quickload: the old station's departure edge is eaten by the sector
    // change guard, so the load boundary clears the latch itself.
    on('save:loaded', () => { this._inRange = false; this._patchedAt = null; this._teaDone = false; });
  },

  update(dt) {
    const s = this.state;
    if (s && s.mode && s.mode !== 'flight') return;
    if (!s || !this.bus || !this._inRange || this._patchedAt == null || this._teaDone) return;
    const now = Number.isFinite(s.simTime) ? s.simTime : 0;
    if (now - this._patchedAt >= GOOD_PATCH_TUNING.askDelayS) {
      this._teaDone = true;
      // Ask what the tea is for — she pours you one instead of answering.
      this._say(`plants:pl143:tea:${Math.floor(now)}`, 'She pours one instead.', 6);
      this.bus.emit('audio:cue', { id: 'sfx_vent_chime', position: null, gain: 0.5, rate: 1.2 });
      this.bus.emit(PLANTS_GOOD_PATCH_EVENT, { kind: 'tea', t: now });
    }
  },

  destroy() {
    if (!this._unsubs) { this.state = null; this.bus = null; return; }
    for (const off of this._unsubs) {
      try { off(); } catch (err) { /* cleanup must not throw */ }
    }
    this._unsubs = [];
    this._inRange = false;
    this._patchedAt = null;
    this._patchTimes = new Map();
     this.state = null;
    this.bus = null;
  },

  // ---- internals ----

  _onDockRange(p) {
    const s = this.state;
    if (!s || !this.bus || !p) return;
    if ((s.world && s.world.currentSectorId) !== GOOD_PATCH_TUNING.sectorId) return;
    if (p.stationId !== GOOD_PATCH_TUNING.stationId) return;
    const now = Number.isFinite(s.simTime) ? s.simTime : 0;
    if (!p.inRange) {
      this._inRange = false;
      this._patchedAt = null;
      this._teaDone = false;
      return;
    }
    if (this._inRange) return;   // one patch per approach
    this._inRange = true;
    const player = s.entities && s.entities.get(s.playerId);
    if (!player || !isDented(player.hull, player.hullMax)) return;
    const approachKey = String(Math.floor(now / GOOD_PATCH_TUNING.patchCooldownS));
    if (this._patchTimes.has(approachKey)) return;
    this._patchTimes.set(approachKey, now);
    if (this._patchTimes.size > GOOD_PATCH_TUNING.memoryCap) {
      const oldest = this._patchTimes.keys().next().value;
      this._patchTimes.delete(oldest);
    }
    player.hull = patchedHull(player.hull, player.hullMax, GOOD_PATCH_TUNING.patchHull);
    this._patchedAt = now;
    this._patchCount += 1;
    // The row's exact line.
    this._say(`plants:pl143:patch:${approachKey}`, "Patches and tea. That's the list.", 7);
    this.bus.emit('audio:cue', { id: 'confirm', position: null, gain: 0.7, rate: 1.0 });
    this.bus.emit(PLANTS_GOOD_PATCH_EVENT, { kind: 'patched', hull: player.hull, t: now });
    if (this._patchCount >= 2 && !this._tonguesDone) {
      this._tonguesDone = true;
      this._say(`plants:pl143:tongues:${approachKey}`, 'Tongues click at her work.', 6);
      this.bus.emit(PLANTS_GOOD_PATCH_EVENT, { kind: 'tongues', t: now });
    }
  },

  _say(id, text, ttl) {
    if (!this.bus) return;
    this.bus.emit('comms:popup', { id, sender: 'HANNE BRANDT', category: 'traffic', text, ttl, persist: false });
    const voice = this.helpers && this.helpers.voice;
    if (voice && typeof voice.say === 'function') {
      voice.say({ channel: 'comms', id, text, ttl, key: GOOD_PATCH_TUNING.plId });
    }
  },
};
