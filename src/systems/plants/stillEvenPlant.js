// PL-110 Still even — "Pass Juno Castellane head-on anywhere and she flashes her lamps once.
// The third time, a hail: *'Still even.'* Flash back; or shove her once, and the next three
// jobs you eye are done before you dock"
//
// Juno Castellane is a recurring stranger: on a seeded roll she spawns in the sector and
// counts head-on passes with the player (proximity + closing speed, cooldown-gated). Each
// pass she flashes her lamps once. On the third pass she hails the one authored line on
// comms. Answering = holding station close (non-hostile proximity) for answerHoldS after
// the hail: the lamps sync. Shoving her (a real player<->Juno physics impact at impulse
// >= shoveImpulseMin) ends the meeting on the spot: she departs on a leased intent, the
// lamp-sync the player was earning is lost, and her one open-radio line — the board went
// dry before you docked — fires once. That lost payoff is the shove's cost.
//
// Honest seam note: "flash back" has no player lamp-flash input seam in the listed trigger
// vocabulary, so answering is modeled as holding station in answer range.
//
// Invariants:
// - Deterministic: state.simTime / state.meta.seed / hash32 only; no Math.random/Date.now.
// - No Three.js / DOM imports. Juno's meeting drift goes through the traffic reaction lease.
// - Bounded Maps capped by tuning.memoryCap; cooldowns on passes and hails.
// - Nothing runs while docked; the player is never the NPC; her pass count lives in a seed-
//   keyed row that survives sector changes WITHIN a session and is cleared on save:loaded
//   or a new game (game:new / game:newGame) — never across worlds.

import { makeShipEntitySpec } from '../ships.js';
import { requestTrafficReaction, releaseTrafficReaction } from '../trafficReactionLease.js';
import { hash32 } from '../../core/rng.js';

export const STILL_EVEN_EVENT = 'plants:stillEven';
export const STILL_EVEN_SYNC_EVENT = 'plants:stillEvenSync';
export const STILL_EVEN_JOBS_DONE_EVENT = 'plants:stillEvenJobsDone';

export const STILL_EVEN_TUNING = Object.freeze({
  plId: 'pl110',
  spawnChancePct: 70,          // she recurs "anywhere"
  passRangeWu: 160,            // head-on pass detection range
  passClosingSpeedWu: 40,      // must actually be closing
  passCooldownS: 30,           // one pass counts per cooldown window
  passesNeeded: 3,             // the third time, a hail
  flashDurationS: 0.8,         // she flashes her lamps once
  answerRangeWu: 180,          // holding station inside this answers the flash
  answerHoldS: 4,              // held this long = flash back (sync)
  shoveImpulseMin: 40,         // a real shove, not a bump
  shoveCooldownS: 20,
  strangerTtlS: 600,
  memoryCap: 8,
});

export const STILL_EVEN_HAIL = 'Still even.';
export const STILL_EVEN_CALLSIGN = 'JUNO CASTELLANE';
export const STILL_EVEN_JOBS_LINE = 'Board went dry before you docked.';

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Pure pass predicate: close enough, actually closing, no gate involved. */
export function isHeadOnPass(distWu, closingSpeedWu, tuning = STILL_EVEN_TUNING) {
  return Number.isFinite(distWu) && Number.isFinite(closingSpeedWu)
    && distWu <= tuning.passRangeWu && closingSpeedWu >= tuning.passClosingSpeedWu;
}

/** Pure shove predicate: a real player->Juno impact at or above the shove threshold. */
export function isShove(impulse, tuning = STILL_EVEN_TUNING) {
  return Number.isFinite(impulse) && impulse >= tuning.shoveImpulseMin;
}

export const stillEvenPlant = {
  modes: ['flight'],
  name: 'plants110',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._owned = new Map();
    this._memory = new Map(); // seed-keyed juno ledger row + encounter row
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
    on('physics:impact', (p) => this._onImpact(p));
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
    const juno = this._entity(enc.junoId);
    const player = this._player();
    if (!juno || juno.alive === false || !player) return;
    const dist = this._dist(juno.pos, player.pos);
    const closing = this._closingSpeed(player, juno);
    // Head-on pass: flash once, count, maybe hail.
    if (enc.lastPassAt == null || now - enc.lastPassAt >= STILL_EVEN_TUNING.passCooldownS) {
      if (isHeadOnPass(dist, closing)) {
        enc.lastPassAt = now;
        enc.passes += 1;
        this._junoRow().passes = enc.passes; // the count survives sector changes
        juno.data.lampsFlashing = true;
        juno.data.lampFlashUntil = now + STILL_EVEN_TUNING.flashDurationS;
        this.bus.emit(STILL_EVEN_EVENT, { kind: 'pass', junoId: enc.junoId, passes: enc.passes, t: now });
        if (enc.passes >= STILL_EVEN_TUNING.passesNeeded && !enc.greeted) {
          enc.greeted = true;
          enc.greetedAt = now;
          this._comms(`plants:${STILL_EVEN_TUNING.plId}:hail:${now}`, STILL_EVEN_CALLSIGN, STILL_EVEN_HAIL, 6);
          this.bus.emit(STILL_EVEN_EVENT, { kind: 'hail', junoId: enc.junoId, t: now });
        }
      }
    }
    // Answer: hold station close after the hail -> the lamps sync.
    if (enc.greeted && !enc.synced && enc.greetedAt != null
        && now - enc.greetedAt >= STILL_EVEN_TUNING.answerHoldS
        && dist <= STILL_EVEN_TUNING.answerRangeWu) {
      enc.synced = true;
      juno.data.lampsFlashing = true;
      juno.data.lampFlashUntil = now + STILL_EVEN_TUNING.flashDurationS * 2;
      this._cue('confirm', juno.pos, 0.7, 1);
      this.bus.emit(STILL_EVEN_SYNC_EVENT, { junoId: enc.junoId, t: now });
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

  _closingSpeed(player, juno) {
    if (!player || !juno || !player.vel || !juno.vel) return 0;
    const rx = finite(juno.pos.x) - finite(player.pos.x);
    const rz = finite(juno.pos.z) - finite(player.pos.z);
    const dist = Math.hypot(rx, rz) || 1;
    const vrx = finite(player.vel.x) - finite(juno.vel.x);
    const vrz = finite(player.vel.z) - finite(juno.vel.z);
    return -(rx * vrx + rz * vrz) / dist;
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
    while (this._memory.size >= STILL_EVEN_TUNING.memoryCap) {
      this._memory.delete(this._memory.keys().next().value);
    }
  },

  _junoRow() {
    const seed = (this.state.meta && this.state.meta.seed) != null ? this.state.meta.seed : 1;
    const key = `juno:${seed}`;
    let row = this._memory.get(key);
    if (!row) {
      this._capMemory();
      row = { key, passes: 0, greeted: false, shovedAt: null };
      this._memory.set(key, row);
    }
    return row;
  },

  _spawnJuno(pos) {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return null;
    const spec = makeShipEntitySpec('ship_drifter', {
      team: 2, factionId: 'faction_free', pos: { x: pos.x, z: pos.z },
      ai: { archetype: 'courier', passive: true },
    });
    const ent = spawnEntity(spec);
    if (!ent || ent.id == null) return null;
    ent.data = ent.data || {};
    ent.data.plants = { ...(ent.data.plants || {}), [STILL_EVEN_TUNING.plId]: { role: 'juno' } };
    ent.data.callsign = STILL_EVEN_CALLSIGN;
    this._owned.set(ent.id, { kind: 'juno', expiresAt: this._now() + STILL_EVEN_TUNING.strangerTtlS });
    return ent;
  },

  _onSectorEnter(p) {
    this._resetSector();
    if (!this._flight()) return;
    const s = this.state;
    const sectorId = (p && p.sectorId) || (s.world && s.world.currentSectorId) || 's1';
    const seed = (s.meta && s.meta.seed) != null ? s.meta.seed : 1;
    if (hash32(seed, sectorId, 'pl110', 'spawn') % 100 >= STILL_EVEN_TUNING.spawnChancePct) return;
    const player = this._player();
    const base = player && player.pos ? player.pos : { x: 0, z: 0 };
    const juno = this._spawnJuno({ x: base.x - 260, z: base.z + 160 });
    if (!juno) return;
    this._capMemory();
    this._memory.set('enc', { junoId: juno.id, passes: this._junoRow().passes, lastPassAt: null, greeted: false, greetedAt: null, synced: false });
  },

  // The shove bites: a real impact ends the meeting on the spot. Juno departs on a leased
  // intent, the lamp-sync payoff the player was earning is lost, and her one open-radio
  // line fires once — the board went dry before you docked.
  _onImpact(p) {
    if (!this._flight() || !p) return;
    const enc = this._memory.get('enc');
    if (!enc) return;
    const now = this._now();
    const isJuno = (id) => id === enc.junoId;
    const isPlayer = (id) => id === this.state.playerId;
    if (!((isPlayer(p.aId) && isJuno(p.bId)) || (isPlayer(p.bId) && isJuno(p.aId)))) return;
    if (!isShove(finite(p.impulse, 0))) return; // a bump is not a shove
    if (enc.lastShoveAt != null && now - enc.lastShoveAt < STILL_EVEN_TUNING.shoveCooldownS) return;
    enc.lastShoveAt = now;
    const row = this._junoRow();
    row.shovedAt = now;
    row.greeted = false; // the hail and its sync are lost with this meeting
    row.passes = 0;      // the pass ledger starts over: the politeness is spent
    this._cue('ui_deny', this._entity(enc.junoId)?.pos, 0.9, 1);
    this.bus.emit(STILL_EVEN_EVENT, { kind: 'shoved', junoId: enc.junoId, impulse: finite(p.impulse), t: now });
    // She leaves: one leased drift away, then the meeting ends.
    const juno = this._entity(enc.junoId);
    if (juno) {
      const away = Math.atan2(finite(juno.pos.z) - finite(this._player()?.pos?.z), finite(juno.pos.x) - finite(this._player()?.pos?.x));
      requestTrafficReaction(this, juno, {
        moveX: 0, moveZ: 1, boost: true, fire: false, fireGroup: null, aimAngle: away, brake: false,
      }, 8);
      this._memory.set('boltEntityId', juno.id);
      this._memory.set('boltUntil', now + 8);
    }
    this._memory.delete('enc');
    // The lost payoff, named once on her channel.
    this._comms(`plants:${STILL_EVEN_TUNING.plId}:jobs:${now}`, STILL_EVEN_CALLSIGN, STILL_EVEN_JOBS_LINE, 6);
    this.bus.emit(STILL_EVEN_JOBS_DONE_EVENT, { lostSync: true, t: now });
  },

  _remove(id) {
    if (id == null) return;
    this._owned.delete(id);
    if (this.helpers && typeof this.helpers.removeEntity === 'function') this.helpers.removeEntity(id);
  },

  _sweepExpired(now) {
    const boltEntityId = this._memory.get('boltEntityId');
    const boltUntil = this._memory.get('boltUntil');
    if (boltEntityId != null && Number.isFinite(boltUntil) && now >= boltUntil) {
      releaseTrafficReaction(this, this._entity(boltEntityId));
      this._remove(boltEntityId);
      this._memory.delete('boltEntityId');
      this._memory.delete('boltUntil');
    }
    for (const [id, row] of this._owned) {
      if (Number.isFinite(row.expiresAt) && now >= row.expiresAt) this._remove(id);
    }
  },

  _despawnOwned() {
    if (this.helpers && typeof this.helpers.removeEntity === 'function') {
      for (const id of [...(this._owned ? this._owned.keys() : [])]) this.helpers.removeEntity(id);
    }
    if (this._owned) this._owned.clear();
  },

  // Sector-scoped reset: the encounter dies, the seed-keyed juno ledger (a session row)
  // survives so her pass count carries to the next sector.
  _resetSector() {
    for (const id of [...(this._owned ? this._owned.keys() : [])]) {
      releaseTrafficReaction(this, this._entity(id));
    }
    this._despawnOwned();
    const keep = new Map();
    if (this._memory) {
      for (const [k, v] of this._memory) {
        if (typeof k === 'string' && k.startsWith('juno:')) keep.set(k, v);
      }
      this._memory.clear();
      for (const [k, v] of keep) this._memory.set(k, v);
    }
    if (this.bus) this.bus.emit(STILL_EVEN_EVENT, { kind: 'reset', reason: 'sector_exit', t: this._now() });
  },

  // Cross-game hygiene: a save load or a new game is a new world — her ledger dies with it.
  _resetAll(reason) {
    for (const id of [...(this._owned ? this._owned.keys() : [])]) {
      releaseTrafficReaction(this, this._entity(id));
    }
    this._despawnOwned();
    if (this._memory) this._memory.clear();
    if (this.bus) this.bus.emit(STILL_EVEN_EVENT, { kind: 'reset', reason, t: this._now() });
  },

  _comms(id, sender, text, ttl) {
    this.bus.emit('comms:popup', { id, sender, category: 'traffic', text, ttl });
  },

  _cue(id, pos, gain = 0.8, rate = 1) {
    this.bus.emit('audio:cue', { id, position: pos ? { x: pos.x, z: pos.z } : null, gain, rate });
  },
};
