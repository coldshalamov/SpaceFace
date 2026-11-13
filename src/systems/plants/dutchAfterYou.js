// PL-116 Right of way — "Dutch clips onto your anchor head-on — same anchor, opposite spin.
// One of you has to let go first: 'After you.'"
// What the player can do: "Let go and be waved through; or hold on, and find out what two
// ships on one anchor do."
//
// Invariants:
// - Deterministic: state.simTime/state.tick only; hash32 (src/core/rng.js) for variety;
//   no Math.random/Date.now; no Three.js/DOM imports.
// - All state on `this` (session-only); bounded clip ledger (tuning.memoryCap); cooldown
//   per anchor releaseId.
// - Anchors sector_hyperion_cut / station_hyperion_cut — read from live entities; the
//   module spawns its own props (never edits src/data).
// - The hold's physical answer is a real queued impulse on the anchor mass
//   (queuePhysicsImpulse); no other system's fields are written.

import { hash32 } from '../../core/rng.js';
import { queuePhysicsImpulse } from '../../core/physicsAuthority.js';

export const PLANTS_DUTCH_EVENT = 'plants:dutchAfterYou';

export const DUTCH_TUNING = Object.freeze({
  plId: 'pl116',
  sectorId: 'sector_hyperion_cut',
  stationId: 'station_hyperion_cut',
  triggerRangeWu: 1200,     // the Cut water where Dutch works
  standoffWindowS: 8,       // either of you may still let go inside this
  letGoRangeWu: 260,        // leaving this far from the anchor = letting go
  spinUpImpulse: 220,       // tangential impulse on the anchor while both hold
  cooldownS: 30,            // per anchor releaseId
  memoryCap: 4,             // active clip ledger entries
});

/** Pure: the standoff verdict for a clip held `heldS` seconds with the player now
 * `distWu` from the anchor. 'wavedThrough' | 'spinUp' | 'holding'. */
export function dutchClipVerdict(distWu, heldS, tuning = DUTCH_TUNING) {
  if (Number.isFinite(distWu) && distWu > tuning.letGoRangeWu) return 'wavedThrough';
  if (heldS >= tuning.standoffWindowS) return 'spinUp';
  return 'holding';
}

/** Pure: a tangential spin pair for two bodies on one anchor: equal and opposite. */
export function spinPair(rot, magnitude) {
  const tx = -Math.sin(rot);
  const tz = Math.cos(rot);
  return [
    { x: tx * magnitude, z: tz * magnitude },
    { x: -tx * magnitude, z: -tz * magnitude },
  ];
}

export const dutchAfterYouPlant = {
  name: 'plants116',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._ownedIds = new Set();   // entity ids this module spawned
    this._clips = new Map();      // releaseId -> { anchorId, propId, at, heldS }
    this._cooldowns = new Map();  // releaseId -> simTime (bounded by memoryCap)
    this._accum = 0;
    if (!this.bus || typeof this.bus.on !== 'function') return;
    const on = (event, fn) => {
      const off = this.bus.on(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('massline:throw', (p) => this._onThrow(p));
    on('sector:exit', () => this._cleanup());
  },

  update(dt) {
    const s = this.state;
    if (s && s.mode && s.mode !== 'flight') return;
    if (!s || !this.bus || this._clips.size === 0) return;
    this._accum += dt;
    if (this._accum < 0.5) return;   // 2 Hz — standoff pacing only
    this._accum = 0;
    const now = Number.isFinite(s.simTime) ? s.simTime : 0;
    const player = s.entities && s.entities.get(s.playerId);
    if (!player || !player.pos) return;
    for (const [releaseId, clip] of this._clips) {
      const anchor = clip.anchorId != null ? s.entities.get(clip.anchorId) : null;
      const anchorPos = anchor && anchor.alive !== false ? anchor.pos : null;
      const prop = clip.propId != null ? s.entities.get(clip.propId) : null;
      if (!anchorPos || !prop) { this._clips.delete(releaseId); continue; }
      const distWu = Math.hypot(anchorPos.x - player.pos.x, anchorPos.z - player.pos.z);
      const verdict = dutchClipVerdict(distWu, clip.heldS, DUTCH_TUNING);
      if (verdict === 'wavedThrough') {
        this._say(`plants:pl116:wave:${now}`, "You're through. Go on.", 6);
        this.bus.emit(PLANTS_DUTCH_EVENT, { kind: 'wavedThrough', releaseId, distWu, t: now });
        this._despawn(prop.id);
        this._clips.delete(releaseId);
        continue;
      }
      if (verdict === 'spinUp') {
        // Both held: this is what two ships on one anchor do — the pair spins.
        const [a, b] = spinPair(player.rot || 0, DUTCH_TUNING.spinUpImpulse);
        queuePhysicsImpulse(anchor, a, { tick: s.tick, externalEffect: true });
        queuePhysicsImpulse(prop, b, { tick: s.tick, externalEffect: true });
        this.bus.emit('audio:cue', { id: 'warning', position: anchorPos, gain: 0.8, rate: 0.9 });
        this._say(`plants:pl116:spin:${now}`, 'Dutch casts off. Spin.', 6);
        this.bus.emit(PLANTS_DUTCH_EVENT, { kind: 'spinUp', releaseId, distWu, t: now });
        this._despawn(prop.id);
        this._clips.delete(releaseId);
        continue;
      }
      clip.heldS += 0.5;
    }
  },

  destroy() {
    if (!this._unsubs) { this.state = null; this.bus = null; return; }
    for (const off of this._unsubs) {
      try { off(); } catch (err) { /* cleanup must not throw */ }
    }
    this._unsubs = [];
    this._cleanup();
    this._cooldowns = new Map();
    this._clips = new Map();
     this.state = null;
    this.bus = null;
  },

  // ---- internals ----

  _now() {
    return Number.isFinite(this.state && this.state.simTime) ? this.state.simTime : 0;
  },

  _station() {
    const s = this.state;
    const idx = s.entityIndex && Array.isArray(s.entityIndex.stations) ? s.entityIndex.stations : null;
    const lists = [idx, Array.isArray(s.entityList) ? s.entityList : null];
    for (const list of lists) {
      if (!list) continue;
      for (const e of list) {
        if (e && e.type === 'station' && e.alive !== false && e.data && e.data.stationId === DUTCH_TUNING.stationId) return e;
      }
    }
    if (s.entities && typeof s.entities.values === 'function') {
      for (const e of s.entities.values()) {
        if (e && e.type === 'station' && e.alive !== false && e.data && e.data.stationId === DUTCH_TUNING.stationId) return e;
      }
    }
    return null;
  },

  _inRange(pos, center, rangeWu) {
    if (!pos || !center) return false;
    return Math.hypot(pos.x - center.x, pos.z - center.z) <= rangeWu;
  },

  _onThrow(p) {
    const s = this.state;
    if (!s || !p || (s.world && s.world.currentSectorId) !== DUTCH_TUNING.sectorId) return;
    if (p.payloadId == null) return;
    const player = s.entities && s.entities.get(s.playerId);
    const station = this._station();
    if (!player || !player.pos || !station || !this._inRange(player.pos, station.pos, DUTCH_TUNING.triggerRangeWu)) return;
    const now = this._now();
    const releaseId = String(p.releaseId || `massline:${s.tick}:${p.payloadId}`);
    const last = this._cooldowns.get(releaseId);
    if (Number.isFinite(last) && now - last < DUTCH_TUNING.cooldownS) return;
    if (this._clips.has(releaseId)) return;
    if (this._clips.size >= DUTCH_TUNING.memoryCap) return;
    const anchor = s.entities.get(p.payloadId);
    const at = anchor && anchor.pos ? anchor.pos : player.pos;
    const bearing = Number.isFinite(hash32(s.meta && s.meta.seed, DUTCH_TUNING.sectorId, 'pl116', releaseId))
      ? (hash32(s.meta && s.meta.seed, DUTCH_TUNING.sectorId, 'pl116', releaseId) % 6283) / 1000
      : (player.rot || 0) + Math.PI;
    // Head-on, same anchor, opposite spin: Dutch parks opposite your approach.
    const pos = {
      x: at.x + Math.cos(bearing) * 26,
      z: at.z + Math.sin(bearing) * 26,
    };
    const prop = this._spawn({
      type: 'beacon',
      pos,
      vel: { x: 0, z: 0 },
      radius: 6,
      mass: 60,
      hull: 24,
      hullMax: 24,
      data: {
        parentType: 'story_prop',
        scanLabel: 'DUTCH — cutter, same anchor, opposite spin',
        storyPropKind: 'dutch_clip_on',
        tetherable: true,
        masslineTetherable: true,
        swarmFloorPad: { label: 'DUTCH · AFTER YOU' },
      },
    });
    if (!prop) return;
    this._cooldowns.set(releaseId, now);
    this._clips.set(releaseId, { anchorId: p.payloadId, propId: prop.id, at: now, heldS: 0 });
    this.bus.emit('audio:cue', { id: 'confirm', position: pos, gain: 0.9, rate: 1.0 });
    this._say(`plants:pl116:clip:${s.tick}`, 'After you.', 6);
    this.bus.emit(PLANTS_DUTCH_EVENT, {
      kind: 'clipOn', releaseId, anchorId: p.payloadId, propId: prop.id, t: now,
    });
  },

  _spawn(spec) {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return null;
    const data = spec.data || {};
    spec.data = {
      ...data,
      plants: { ...(data.plants || {}), [DUTCH_TUNING.plId]: { role: 'dutch' } },
    };
    const ent = spawnEntity(spec);
    if (ent && ent.id != null) this._ownedIds.add(ent.id);
    return ent || null;
  },

  _despawn(id) {
    if (id == null) return;
    const removeEntity = this.helpers && this.helpers.removeEntity;
    if (typeof removeEntity === 'function') removeEntity(id);
    this._ownedIds.delete(id);
  },

  _say(id, text, ttl) {
    if (!this.bus) return;
    this.bus.emit('comms:popup', { id, sender: 'DUTCH', category: 'traffic', text, ttl, persist: false });
    const voice = this.helpers && this.helpers.voice;
    if (voice && typeof voice.say === 'function') {
      voice.say({ channel: 'bark', id, text, ttl, key: DUTCH_TUNING.plId });
    }
  },

  _cleanup() {
    for (const id of this._ownedIds) {
      const removeEntity = this.helpers && this.helpers.removeEntity;
      if (typeof removeEntity === 'function') removeEntity(id);
    }
    this._ownedIds = new Set();
    this._clips = new Map();
  },
};
