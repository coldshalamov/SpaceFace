// PL-108 Moving house — "A tug with a family's whole life strapped on takes a turn too hard
// and a chair comes loose. Hand it back: *'Take the chair. Just the chair.'*
// Keep the chair; or Line the whole rack off, and be chased across two sectors, sadly, on open radio"
//
// A seeded chance meeting: on sector entry the roll spawns a moving-house tug stranger
// trailing a rack of tetherable cargo pods. When the player comes near the loose chair
// pod, the tug says its one authored line. Taking ONLY the chair pod is the kind choice
// (no consequence). Stripping the rack (removing rack pods) is the wrong choice: the tug
// despawns with a chase stamp and the next two DIFFERENT sectors entered inside the chase
// window each carry one sad open-radio line.
//
// Invariants:
// - Deterministic: uses state.simTime / state.meta.seed / hash32 only; no Math.random/Date.now.
// - No Three.js / DOM imports.
// - Physical: the chair and rack are real tetherable jettisoned cargo pods
//   (spawnJettisonedCargoPod, flags.persistent, physicsBody mass, masslineTetherable).
// - Bounded memory: this._memory and this._owned are Maps capped by tuning.memoryCap.
// - Cooldowns: one bark per encounter; radio chase lines once per sector, max chase sectors.
// - The cross-sector chase is radio + stamps only: this module has no cross-sector entity
//   persistence seam, so no physical pursuer is spawned (honest limitation, see report).
// - Nothing runs while docked (state.mode must be 'flight'); despawn on sector:exit /
//   save:loaded / destroy. Gates/wormholes are never used as anchors; the player is never
//   treated as an NPC.

import { makeShipEntitySpec } from '../ships.js';
import { spawnJettisonedCargoPod } from '../lootShards.js';
import { hash32 } from '../../core/rng.js';

export const MOVING_HOUSE_EVENT = 'plants:movingHouse';
export const MOVING_HOUSE_RADIO_EVENT = 'plants:movingHouseRadio';

export const MOVING_HOUSE_TUNING = Object.freeze({
  plId: 'pl108',
  spawnChancePct: 60,          // seeded roll per sector entry
  barkRangeWu: 120,            // player near the loose chair pod -> the tug speaks
  rackPods: 3,                 // pods strapped on besides the loose chair
  rackStripThreshold: 2,       // taking this many rack pods strips the whole rack
  chaseDurationS: 600,         // one sector-day contract (mirrors DAY_SECONDS users)
  chaseRadioSectors: 2,        // chased across two sectors, on open radio
  podCommodityId: 'cmdty_ore_copper',
  podAmount: 1,
  podRadius: 5,
  strangerTtlS: 600,           // polite despawn TTL for the tug
  memoryCap: 16,               // bounded memory rows
});

export const MOVING_HOUSE_BARK = 'Take the chair. Just the chair.';
export const MOVING_HOUSE_CALLSIGN = 'MOVING TUG';

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Pure verdict for the encounter: idle until the chair or the rack is taken.
 * Taking >= rackStripThreshold rack pods strips the rack regardless of the chair.
 */
export function movingHouseVerdict({ chairTaken = false, rackTakenCount = 0 }, tuning = MOVING_HOUSE_TUNING) {
  if (Number(rackTakenCount) >= tuning.rackStripThreshold) return 'stripped';
  if (chairTaken === true) return 'kept';
  return 'idle';
}

export const movingHousePlant = {
  name: 'plants108',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._owned = new Map();   // spawned entity id -> { kind, expiresAt }
    this._memory = new Map();  // encounter row: stamps for the active meeting
    this._accum = 0;
    const on = (event, fn) => {
      const off = this.bus.on(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('sector:enter', (p) => this._onSectorEnter(p));
    on('sector:exit', () => this._resetSector());
    on('save:loaded', () => this._resetAll('save_loaded'));
    on('game:new', () => this._resetAll('game_new'));
    on('game:newGame', () => this._resetAll('game_new_game'));
    on('pickup:collected', (p) => this._onPickupCollected(p));
    on('tether:snapCatch', (p) => this._onSnapCatch(p));
  },

  update(dt) {
    const s = this.state;
    if (!s || !this.bus) return;
    this._accum += finite(dt, 0);
    if (this._accum < 1) return; // 1 Hz sweep — no per-frame work
    this._accum = 0;
    const now = finite(s.simTime, 0);
    this._sweepExpired(now);
    if (!this._flight() || this._memory.get('enc') == null) return;
    const enc = this._memory.get('enc');
    const chair = this._entity(enc.chairPodId);
    if (enc.barkedAt == null && chair && chair.alive !== false && this._dist(chair.pos, this._player()?.pos) <= MOVING_HOUSE_TUNING.barkRangeWu) {
      enc.barkedAt = now;
      this._say('bark', `plants:${MOVING_HOUSE_TUNING.plId}:bark`, MOVING_HOUSE_BARK, 5);
      this.bus.emit(MOVING_HOUSE_EVENT, { kind: 'barked', tugId: enc.tugId, chairPodId: enc.chairPodId, t: now });
    }
  },

  destroy() {
    for (const off of this._unsubs || []) off();
    this._unsubs = [];
    this._despawnOwned();
    if (this._memory) this._memory.clear();
  },

  // ---- internals ----

  _flight() {
    return !!this.state && (this.state.mode == null || this.state.mode === 'flight');
  },

  _now() {
    return finite(this.state && this.state.simTime, 0);
  },

  _dist(a, b) {
    if (!a || !b || !Number.isFinite(a.x) || !Number.isFinite(a.z) || !Number.isFinite(b.x) || !Number.isFinite(b.z)) return Infinity;
    return Math.hypot(a.x - b.x, a.z - b.z);
  },

  _player() {
    const s = this.state;
    return s && s.entities && typeof s.entities.get === 'function' ? s.entities.get(s.playerId) : null;
  },

  _entity(id) {
    const s = this.state;
    if (id == null || !s) return null;
    if (s.entities && typeof s.entities.get === 'function') return s.entities.get(id) || null;
    if (Array.isArray(s.entityList)) return s.entityList.find((e) => e && e.id === id) || null;
    return null;
  },

  _capMemory() {
    while (this._memory.size >= MOVING_HOUSE_TUNING.memoryCap) {
      this._memory.delete(this._memory.keys().next().value);
    }
  },

  _spawnStranger(defId, pos) {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return null;
    const spec = makeShipEntitySpec(defId, {
      team: 2, factionId: 'faction_free', pos: { x: pos.x, z: pos.z },
      ai: { archetype: 'tug', passive: true },
    });
    const ent = spawnEntity(spec);
    if (!ent || ent.id == null) return null;
    ent.data = ent.data || {};
    ent.data.plants = { ...(ent.data.plants || {}), [MOVING_HOUSE_TUNING.plId]: { role: 'tug' } };
    ent.data.callsign = MOVING_HOUSE_CALLSIGN;
    this._owned.set(ent.id, { kind: 'tug', expiresAt: this._now() + MOVING_HOUSE_TUNING.strangerTtlS });
    return ent;
  },

  _spawnPod(pos, ownerId, role) {
    if (typeof spawnJettisonedCargoPod !== 'function') return null;
    const ent = spawnJettisonedCargoPod(this.state, {
      commodityId: MOVING_HOUSE_TUNING.podCommodityId,
      amount: MOVING_HOUSE_TUNING.podAmount,
      radius: MOVING_HOUSE_TUNING.podRadius,
      pos: { x: pos.x, z: pos.z },
      vel: { x: 0, z: 0 },
      ownerId,
      ownerName: MOVING_HOUSE_CALLSIGN,
    }, this.helpers);
    if (!ent || ent.id == null) return null;
    ent.data = ent.data || {};
    ent.data.plants = { ...(ent.data.plants || {}), [MOVING_HOUSE_TUNING.plId]: { role } };
    ent.data.masslineTetherable = true;
    this._owned.set(ent.id, { kind: role, expiresAt: this._now() + MOVING_HOUSE_TUNING.strangerTtlS });
    return ent;
  },

  _onSectorEnter(p) {
    this._resetSector();
    if (!this._flight()) return;
    const s = this.state;
    const now = this._now();
    const sectorId = (p && p.sectorId) || (s.world && s.world.currentSectorId) || 's1';
    // Radio tail of a rack stripped in a previous sector: two sad sectors, once each.
    const chase = this._memory.get('chase');
    if (chase && now < chase.until && chase.sectorsLeft > 0 && sectorId !== chase.fromSectorId) {
      chase.sectorsLeft -= 1;
      chase.fromSectorId = sectorId;
      this._comms(`plants:${MOVING_HOUSE_TUNING.plId}:radio:${now}`, MOVING_HOUSE_CALLSIGN,
        'Radio: the loose chair hears about it.', 6);
      this.bus.emit(MOVING_HOUSE_RADIO_EVENT, { sectorId, sectorsLeft: chase.sectorsLeft, t: now });
    }
    // Seeded roll: is the moving-house tug in this sector?
    const seed = (s.meta && s.meta.seed) != null ? s.meta.seed : 1;
    const roll = hash32(seed, sectorId, 'pl108', 'spawn') % 100;
    if (roll >= MOVING_HOUSE_TUNING.spawnChancePct) return;
    const player = this._player();
    const base = player && player.pos ? player.pos : { x: 0, z: 0 };
    const tug = this._spawnStranger('ship_hawser', { x: base.x + 220, z: base.z - 60 });
    if (!tug) return;
    const pods = [];
    const chair = this._spawnPod({ x: base.x + 190, z: base.z - 20 }, tug.id, 'chair');
    if (chair) pods.push(chair.id);
    for (let i = 0; i < MOVING_HOUSE_TUNING.rackPods; i += 1) {
      const rack = this._spawnPod({ x: base.x + 250 + i * 24, z: base.z - 90 }, tug.id, 'rack');
      if (rack) pods.push(rack.id);
    }
    if (!chair) { this._remove(tug.id); return; }
    this._capMemory();
    this._memory.set('enc', {
      tugId: tug.id,
      chairPodId: chair.id,
      rackPodIds: pods.filter((id) => id !== chair.id),
      rackTakenCount: 0,
      chairTaken: false,
      barkedAt: null,
    });
  },

  // Keeping the chair = collecting it into the hold (a real pickup receipt).
  _onPickupCollected(p) {
    if (!this._flight() || !p || !this.bus) return;
    const enc = this._memory.get('enc');
    if (!enc) return;
    const now = this._now();
    if (p.collectorId !== this.state.playerId) return;
    if (p.pickupId === enc.chairPodId && !enc.chairTaken) {
      enc.chairTaken = true;
      this._owned.delete(p.pickupId); // the chair rides with the player now
      this.bus.emit(MOVING_HOUSE_EVENT, { kind: 'kept_chair', chairPodId: enc.chairPodId, t: now });
      this._maybeResolve(enc, now);
    }
  },

  // "Line the whole rack off" = yanking rack pods off under tether (real snap-catch receipts),
  // not collecting loose pods.
  _onSnapCatch(p) {
    if (!this._flight() || !p) return;
    const enc = this._memory.get('enc');
    if (!enc || !Array.isArray(enc.rackPodIds) || !enc.rackPodIds.includes(p.targetId)) return;
    const now = this._now();
    enc.rackTakenIds = enc.rackTakenIds || [];
    if (!enc.rackTakenIds.includes(p.targetId)) {
      enc.rackTakenIds.push(p.targetId);
      enc.rackTakenCount = enc.rackTakenIds.length;
      this._owned.delete(p.targetId);
      this._maybeResolve(enc, now);
    }
  },

  _maybeResolve(enc, now) {
    const verdict = movingHouseVerdict(enc);
    if (verdict === 'idle') return;
    if (verdict === 'kept') {
      this.bus.emit(MOVING_HOUSE_EVENT, { kind: 'resolved_kept', tugId: enc.tugId, t: now });
    } else {
      // Wrong choice: the rack is gone; the chase is radio and stamps, not a pursuer hull.
      this._cue('ui_deny', this._entity(enc.tugId)?.pos, 0.9, 1);
      this.bus.emit(MOVING_HOUSE_EVENT, { kind: 'rack_stripped', tugId: enc.tugId, t: now });
      this._capMemory();
      this._memory.set('chase', {
        until: now + MOVING_HOUSE_TUNING.chaseDurationS,
        sectorsLeft: MOVING_HOUSE_TUNING.chaseRadioSectors,
        fromSectorId: (this.state.world && this.state.world.currentSectorId) || null,
      });
      this._remove(enc.tugId);
    }
    this._memory.delete('enc');
  },

  _remove(id) {
    if (id == null) return;
    this._owned.delete(id);
    if (this.helpers && typeof this.helpers.removeEntity === 'function') this.helpers.removeEntity(id);
  },

  _sweepExpired(now) {
    for (const [id, row] of this._owned) {
      if (Number.isFinite(row.expiresAt) && now >= row.expiresAt) this._remove(id);
    }
  },

  _despawnOwned() {
    if (!this.helpers || typeof this.helpers.removeEntity !== 'function') {
      if (this._owned) this._owned.clear();
      return;
    }
    for (const id of [...(this._owned ? this._owned.keys() : [])]) {
      this.helpers.removeEntity(id);
    }
    if (this._owned) this._owned.clear();
  },

  // Sector-scoped reset: the encounter dies, the chase radio tail (a session stamp)
  // survives — it is anchored to the strip, not to this sector.
  _resetSector() {
    this._despawnOwned();
    const chase = this._memory ? this._memory.get('chase') : null;
    if (this._memory) this._memory.clear();
    if (chase) this._memory.set('chase', chase);
    if (this.bus) this.bus.emit(MOVING_HOUSE_EVENT, { kind: 'reset', reason: 'sector_exit', t: this._now() });
  },

  // Cross-game hygiene: a save load or a new game is a new world — the chase stamp dies.
  _resetAll(reason) {
    this._despawnOwned();
    if (this._memory) this._memory.clear();
    if (this.bus) this.bus.emit(MOVING_HOUSE_EVENT, { kind: 'reset', reason, t: this._now() });
  },

  _say(channel, id, text, ttl) {
    const voice = this.helpers && this.helpers.voice;
    if (voice && typeof voice.say === 'function') {
      voice.say({ channel, id, text, ttl });
      return;
    }
    this.bus.emit('voice:say', { channel, id, text, ttl });
  },

  _comms(id, sender, text, ttl) {
    this.bus.emit('comms:popup', { id, sender, category: 'traffic', text, ttl });
  },

  _cue(id, pos, gain = 0.8, rate = 1) {
    this.bus.emit('audio:cue', { id, position: pos ? { x: pos.x, z: pos.z } : null, gain, rate });
  },
};
