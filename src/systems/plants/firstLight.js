// PL-294 The first light — "A rookie's first solo tow wobbles past you badly. One lamp flash
// from you tells them where the line should sit, and they catch it.
// Flash once and move on; or laugh about it on open channel — rookies remember callsigns
// longer than routes"
//
// A seeded chance meeting: a rookie stranger crosses the player's lane towing a pod, wobbling
// badly (their steering intent oscillates through the traffic reaction lease). The row's
// literal trigger — a lamp-flash input — has no seam in today's flight (no lamp action is
// wired); the same gesture reachable through the ordinary route today is a single muzzle
// flash near them (declared substitute, same as waveBackPlant's declared substitute for its
// flash). One shot inside the window = one lamp flash: the rookie catches the line (their
// wobble straightens, the pod swings onto the line astern, their lamp answers once).
//
// - Flash once and move on: exactly one shot — the catch.
// - Laugh about it on open channel: three or more shots near them inside the window is
//   hooting fire, not a flash — the rookie remembers your callsign: a dock-gossip stamp
//   ("rookies remember callsigns longer than routes") and wary rookies for a season.
//
// Invariants:
// - Deterministic: state.simTime / state.meta.seed / hash32 only; no Math.random/Date.now.
// - No Three.js / DOM imports. The wobble is the module's own waypoint writes through the
//   traffic reaction lease (abort on refusal); the player is never steered.
// - Physical: the tow pod is a real tetherable body that swings onto the line astern.
// - Bounded Maps capped by tuning.memoryCap; one catch per meeting; TTL despawns.
// - Nothing runs while docked; the player is never the NPC.

import { makeShipEntitySpec } from '../ships.js';
import { spawnJettisonedCargoPod } from '../lootShards.js';
import { requestTrafficReaction, releaseTrafficReaction } from '../trafficReactionLease.js';
import { hash32 } from '../../core/rng.js';

export const FIRST_LIGHT_EVENT = 'plants:firstLight';
export const FIRST_LIGHT_GOSSIP_EVENT = 'plants:firstLightGossip';

export const FIRST_LIGHT_TUNING = Object.freeze({
  plId: 'pl294',
  spawnChancePct: 50,
  passRangeWu: 180,            // "wobbles past you": the crossing happens this close
  flashRangeWu: 320,           // a shot from inside this reads as a flash aimed at them
  flashWindowS: 10,            // the shot window after the bad pass
  mockShots: 3,                // hooting fire: this many shots inside the window
  mockSeasonS: 900,            // rookies remember callsigns longer than routes
  gossipMax: 2,                // bounded dock gossip after a mock
  gossipCooldownS: 30,
  wobblePeriodS: 3,            // steering oscillation period
  catchSpeedWu: 16,            // the straightened tow's pace
  strangerTtlS: 420,
  podTtlS: 300,
  podAmount: 1,
  podRadius: 5,
  memoryCap: 8,
});

export const FIRST_LIGHT_CALLSIGN = 'FIRST TOW';
export const FIRST_LIGHT_MOCK_GOSSIP_LINE = 'Rookies remember that callsign.';

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Pure verdict for the shot tally inside the window. */
export function flashVerdict(shots, tuning = FIRST_LIGHT_TUNING) {
  const n = Math.max(0, Math.floor(finite(shots, 0)));
  if (n === 1) return 'flash';
  if (n >= tuning.mockShots) return 'mock';
  return 'waiting';
}

/** Pure: the wobble offset a wobbling tow holds off its lane at time t. */
export function wobbleOffsetWu(t, periodS = FIRST_LIGHT_TUNING.wobblePeriodS, amplitudeWu = 40) {
  const phase = Math.sin((finite(t, 0) / finite(periodS, 3)) * Math.PI * 2);
  return phase * finite(amplitudeWu, 40);
}

export const firstLightPlant = {
  modes: ['flight'],
  name: 'plants294',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._owned = new Map();
    this._memory = new Map();
    this._accum = 0;
    const on = (event, fn) => {
      const off = this.bus.on(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('sector:enter', (p) => this._onSectorEnter(p));
    on('sector:exit', () => this._reset('sector_exit'));
    on('save:loaded', () => this._reset('save_loaded'));
    on('game:new', () => this._reset('game_new'));
    on('game:newGame', () => this._reset('game_new_game'));
    on('combat:fire', (p) => this._onShot(p));
    on('dock:range', (p) => this._onDockRange(p));
    on('entity:killed', (p) => this._onKilled(p));
  },

  update(dt) {
    const s = this.state;
    if (!s || !this.bus) return;
    this._accum += finite(dt, 0);
    if (this._accum < 1) return;
    this._accum = 0;
    const now = finite(s.simTime, 0);
    this._sweepExpired(now);
    if (!this._flight()) return;
    const enc = this._memory.get('enc');
    if (!enc) return;
    const rookie = this._entity(enc.rookieId);
    const pod = this._entity(enc.podId);
    const player = this._player();
    if (!rookie || rookie.alive === false) { this._memory.delete('enc'); return; }

    // The wobble: oscillating waypoints until the line is caught; then straight and level.
    if (!enc.caught) {
      const offset = wobbleOffsetWu(now);
      const head = finite(rookie.rot, 0);
      const perpX = -Math.sin(head);
      const perpZ = Math.cos(head);
      const point = {
        x: finite(rookie.pos.x) + Math.cos(head) * 90 + perpX * offset,
        z: finite(rookie.pos.z) + Math.sin(head) * 90 + perpZ * offset,
      };
      const dx = point.x - finite(rookie.pos.x);
      const dz = point.z - finite(rookie.pos.z);
      const d = Math.hypot(dx, dz) || 1;
      const held = requestTrafficReaction(this, rookie, {
        moveX: dx / d, moveZ: dz / d,
        boost: false, fire: false, fireGroup: null, aimAngle: Math.atan2(dz, dx), brake: false,
      }, 3);
      if (!held) releaseTrafficReaction(this, rookie); // refused: abort, leave the hull alone
      // Tow pod rides the wobble: it follows the rookie's tail with lag (its own physics: a
      // gentle pull along the rookie-to-pod line keeps it visibly attached but sloppy).
      if (pod && rookie.pos) {
        const px = finite(rookie.pos.x) - Math.cos(head) * 34;
        const pz = finite(rookie.pos.z) - Math.sin(head) * 34;
        const ddx = px - finite(pod.pos.x);
        const ddz = pz - finite(pod.pos.z);
        const dd = Math.hypot(ddx, ddz) || 1;
        pod.vel = {
          x: finite(pod.vel && pod.vel.x) + (ddx / dd) * 4,
          z: finite(pod.vel && pod.vel.z) + (ddz / dd) * 4,
        };
      }
    } else if (pod && rookie.pos) {
      // Caught: the line sits straight astern, steady.
      const head = finite(rookie.rot, 0);
      const px = finite(rookie.pos.x) - Math.cos(head) * 30;
      const pz = finite(rookie.pos.z) - Math.sin(head) * 30;
      const ddx = px - finite(pod.pos.x);
      const ddz = pz - finite(pod.pos.z);
      const dd = Math.hypot(ddx, ddz) || 1;
      pod.vel = {
        x: finite(pod.vel && pod.vel.x) + (ddx / dd) * 8,
        z: finite(pod.vel && pod.vel.z) + (ddz / dd) * 8,
      };
    }

    // The pass: once the rookie has crossed near the player, the window opens.
    if (!enc.passed && player && player.pos
        && this._dist(rookie.pos, player.pos) <= FIRST_LIGHT_TUNING.passRangeWu) {
      enc.passed = true;
      enc.windowUntil = now + FIRST_LIGHT_TUNING.flashWindowS;
      this.bus.emit(FIRST_LIGHT_EVENT, { kind: 'bad_pass', rookieId: enc.rookieId, t: now });
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
    while (this._memory.size >= FIRST_LIGHT_TUNING.memoryCap) {
      this._memory.delete(this._memory.keys().next().value);
    }
  },

  _onSectorEnter(p) {
    this._reset('sector_enter');
    if (!this._flight()) return;
    const s = this.state;
    const sectorId = (p && p.sectorId) || (s.world && s.world.currentSectorId) || 's1';
    const seed = (s.meta && s.meta.seed) != null ? s.meta.seed : 1;
    if (hash32(seed, sectorId, FIRST_LIGHT_TUNING.plId, 'spawn') % 100 >= FIRST_LIGHT_TUNING.spawnChancePct) return;
    const player = this._player();
    const base = player && player.pos ? player.pos : { x: 0, z: 0 };
    const rookie = this._spawnRookie({ x: base.x + 260, z: base.z - 160 });
    if (!rookie) return;
    const pod = this._spawnTowPod({ x: base.x + 226, z: base.z - 160 });
    this._capMemory();
    this._memory.set('enc', {
      rookieId: rookie.id,
      podId: pod ? pod.id : null,
      passed: false,
      caught: false,
      mocked: false,
      shots: 0,
      windowUntil: null,
    });
  },

  _spawnRookie(pos) {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return null;
    const spec = makeShipEntitySpec('ship_drifter', {
      team: 2, factionId: 'faction_free', pos: { x: pos.x, z: pos.z },
      ai: { archetype: 'rookie', passive: true },
    });
    const ent = spawnEntity(spec);
    if (!ent || ent.id == null) return null;
    ent.data = ent.data || {};
    ent.data.plants = { ...(ent.data.plants || {}), [FIRST_LIGHT_TUNING.plId]: { role: 'rookie', firstSolo: true } };
    ent.data.callsign = FIRST_LIGHT_CALLSIGN;
    this._owned.set(ent.id, { kind: 'rookie', expiresAt: this._now() + FIRST_LIGHT_TUNING.strangerTtlS });
    return ent;
  },

  _spawnTowPod(pos) {
    const pod = spawnJettisonedCargoPod(this.state, {
      commodityId: 'cmdty_ore_iron', amount: FIRST_LIGHT_TUNING.podAmount,
      radius: FIRST_LIGHT_TUNING.podRadius,
      pos: { x: pos.x, z: pos.z }, vel: { x: 0, z: 0 },
      ownerId: null, ownerName: FIRST_LIGHT_CALLSIGN,
    }, this.helpers);
    if (!pod || pod.id == null) return null;
    pod.data = pod.data || {};
    pod.data.plants = { ...(pod.data.plants || {}), [FIRST_LIGHT_TUNING.plId]: { role: 'first_tow' } };
    this._owned.set(pod.id, { kind: 'tow_pod', expiresAt: this._now() + FIRST_LIGHT_TUNING.podTtlS });
    return pod;
  },

  // combat:fire receipt — the only "lamp" the flight route offers today (declared substitute).
  _onShot(p) {
    if (!this._flight() || !p || !this.state) return;
    if (p.ownerId !== this.state.playerId) return;
    const enc = this._memory.get('enc');
    if (!enc || !enc.passed || enc.mocked) return;
    const now = this._now();
    if (enc.windowUntil != null && now > enc.windowUntil) return;
    const rookie = this._entity(enc.rookieId);
    const origin = p.origin;
    if (!rookie || !origin) return;
    if (this._dist(origin, rookie.pos) > FIRST_LIGHT_TUNING.flashRangeWu) return;
    enc.shots += 1;
    // Flash once and move on: one shot is the catch. Keep hooting after it and the laugh
    // takes the meeting back — rookies remember callsigns longer than routes.
    const verdict = flashVerdict(enc.shots);
    if (verdict === 'flash') {
      enc.caught = true;
      rookie.data.lampsFlashing = true;
      rookie.data.lampFlashUntil = now + 1.2;
      this._cue('confirm', rookie.pos, 0.7, 1);
      this.bus.emit(FIRST_LIGHT_EVENT, { kind: 'caught', rookieId: enc.rookieId, t: now });
    } else if (verdict === 'mock') {
      enc.caught = false;
      enc.mocked = true;
      rookie.data.lampsFlashing = false;
      this._capMemory();
      this._memory.set('mock', { until: now + FIRST_LIGHT_TUNING.mockSeasonS, heard: 0, lastAt: null });
      this.bus.emit(FIRST_LIGHT_EVENT, { kind: 'mocked', rookieId: enc.rookieId, shots: enc.shots, t: now });
    }
  },

  // "rookies remember callsigns longer than routes": the docks hear about you, bounded.
  _onDockRange(p) {
    if (!this._flight() || !p || p.inRange !== true) return;
    const gossip = this._memory.get('mock');
    if (!gossip) return;
    if (gossip.heard >= FIRST_LIGHT_TUNING.gossipMax) return;
    const now = this._now();
    if (gossip.lastAt != null && now - gossip.lastAt < FIRST_LIGHT_TUNING.gossipCooldownS) return;
    gossip.lastAt = now;
    gossip.heard += 1;
    this._comms(`plants:${FIRST_LIGHT_TUNING.plId}:gossip:${now}`, 'DOCK GOSSIP',
      FIRST_LIGHT_MOCK_GOSSIP_LINE, 6);
    this.bus.emit(FIRST_LIGHT_GOSSIP_EVENT, { stationId: p.stationId, heard: gossip.heard, t: now });
  },

  _onKilled(p) {
    const enc = this._memory.get('enc');
    if (!enc || !p || p.id !== enc.rookieId) return;
    this._memory.delete('enc');
    this.bus.emit(FIRST_LIGHT_EVENT, { kind: 'rookie_dead', hullId: p.id, t: this._now() });
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
    const enc = this._memory.get('enc');
    if (enc && this._entity(enc.rookieId) == null) this._memory.delete('enc');
    const gossip = this._memory.get('mock');
    if (gossip && now >= gossip.until) this._memory.delete('mock');
  },

  _despawnOwned() {
    if (this.helpers && typeof this.helpers.removeEntity === 'function') {
      for (const id of [...(this._owned ? this._owned.keys() : [])]) this.helpers.removeEntity(id);
    }
    if (this._owned) this._owned.clear();
  },

  _reset(reason) {
    this._despawnOwned();
    // "rookies remember callsigns longer than routes": the mock stamp rides across sectors;
    // a session boundary (save:loaded, game:new, game:newGame) forgets it.
    const sectoral = reason === 'sector_enter' || reason === 'sector_exit';
    const keep = sectoral && this._memory ? this._memory.get('mock') : null;
    if (this._memory) this._memory.clear();
    if (keep) this._memory.set('mock', keep);
    if (this.bus && reason === 'sector_exit') {
      this.bus.emit(FIRST_LIGHT_EVENT, { kind: 'reset', reason, t: this._now() });
    }
  },

  _comms(id, sender, text, ttl) {
    this.bus.emit('comms:popup', { id, sender, category: 'traffic', text, ttl });
  },

  _cue(id, pos, gain = 0.8, rate = 1) {
    this.bus.emit('audio:cue', { id, position: pos ? { x: pos.x, z: pos.z } : null, gain, rate });
  },
};
