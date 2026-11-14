// PL-214 Pyrrha's box — "Proteus | Pyrrha's box. Hand Pyrrha anything and she lifts it once, sets
// it down, and tells you what it is worth as a rumour. Arrive empty-handed and you get the speech:
// *'A reading's a rumor. Bring me a box.'* | Bring her the strangest thing you can tow |
// DRAFT 2026-11-11"
// The quoted speech "A reading's a rumor. Bring me a box." is final copy from the row.
//
// SEAM NOTE (honest): Proteus is sector_proteus_well / station_proteus — Proteus Den (verified in
// src/data/frontierRegions/east.js). Pyrrha and her bench exist only in the row, so her bench is
// an everyday-kit dressing row (place_inspection_platform, stampSolidDressing — kesslerScale
// pattern) plus a story-prop post carrying her floor pad label (entity.data.swarmFloorPad —
// floatingText.js pad layer shape). "Hand her anything" is physical: a tetherable box (payload /
// masslineTetherable body) actually inside her lift radius. The rumour value is a hash of the
// box, honest about being a rumour in the popup text.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM imports.
// - Session state on `this`; destroy()/sector:exit remove the owned post, drop owned rows.
// - Bounded ledgers (tuning.memoryCap); one read per box per cooldown; one speech per visit.
// - Pad label is the verified floatingText shape: data.swarmFloorPad {label ≤24 chars}.

import { hash32 } from '../../core/rng.js';
import { insertDressingRow, dropDressingRow } from '../../world/dressingTable.js';
import { stampSolidDressing } from '../../world/solidDressing.js';
import { plantStationById } from '../plantEntityViews.js';

export const PL_214_READ_EVENT = 'plants:pl214:read';
export const PL_214_EMPTY_EVENT = 'plants:pl214:empty';

export const PYRRHA_LINE = "A reading's a rumor. Bring me a box.";
export const PYRRHA_SENDER = 'PYRRHA';

export const PYRRHA_BOX_TUNING = Object.freeze({
  sectorId: 'sector_proteus_well',
  stationId: 'station_proteus',
  padOffsetWu: 260,
  liftRadiusWu: 70,            // her lift: a box this close gets picked up once
  emptyHoldS: 6,               // empty-handed this long gets the speech
  emptyCooldownS: 60,
  readCooldownPerBoxS: 90,     // she lifts a box once; the read cools before a re-read
  strangeMassMin: 300,         // "the strangest thing you can tow"
  rumourBaseCr: 60,
  rumourSpreadCr: 400,
  rumourStrangeBonusCr: 220,
  memoryCap: 12,
});

const finite = (v, f = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
};

const PAD_SALT = hash32('plantsPl214pad', PYRRHA_BOX_TUNING.sectorId);

/** Deterministic bench position off the Den. */
export function padPosition(stationPos, sectorId = PYRRHA_BOX_TUNING.sectorId) {
  const h = hash32('plantsPl214pos', String(sectorId), PAD_SALT);
  const bearing = (h % 3600) / 3600 * Math.PI * 2;
  return {
    x: finite(stationPos?.x) + Math.cos(bearing) * PYRRHA_BOX_TUNING.padOffsetWu,
    z: finite(stationPos?.z) + Math.sin(bearing) * PYRRHA_BOX_TUNING.padOffsetWu,
  };
}

/** The rumour: deterministic per box, honest about its strangeness. */
export function rumourValueFor(boxEntityId, mass, tuning = PYRRHA_BOX_TUNING) {
  const h = hash32('plantsPl214rumour', String(boxEntityId));
  const base = tuning.rumourBaseCr + (h % tuning.rumourSpreadCr);
  const strange = finite(mass) >= tuning.strangeMassMin;
  return { valueCr: base + (strange ? tuning.rumourStrangeBonusCr : 0), strange };
}

export function isABox(ent) {
  if (!ent || ent.alive === false) return false;
  if (ent.type === 'payload') return true;
  const data = ent.data || {};
  return data.masslineTetherable === true || data.tetherPayload === true;
}

export const pl214PyrrhaBox = {
  name: 'plantsPl214',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._acc = 0;
    this._rowId = null;
    this._postId = null;
    this._emptyHoldS = 0;
    this._lastSpeechAt = -Infinity;
    this._reads = new Map();       // boxId -> lastReadAt (bounded)
    const on = (event, fn) => {
      const off = this.bus?.on?.(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('sector:exit', (p = {}) => {
      if (!p.sectorId || p.sectorId === PYRRHA_BOX_TUNING.sectorId) this._clear();
    });
    on('save:loaded', () => this._clear());
    on('game:newGame', () => this._clear());
  },

  destroy() {
    for (const off of this._unsubs || []) {
      try { off(); } catch (err) { /* cleanup must not throw */ }
    }
    this._unsubs = [];
    this._clear();
    this.state = null;
    this.bus = null;
    this.helpers = {};
  },

  _clear() {
    const s = this.state;
    if (this._rowId != null && s) dropDressingRow(s, this._rowId);
    this._rowId = null;
    if (this._postId != null && typeof this.helpers?.removeEntity === 'function') {
      this.helpers.removeEntity(this._postId);
    }
    this._postId = null;
    this._emptyHoldS = 0;
    this._reads = new Map();
  },

  _now(s) {
    return Number.isFinite(s?.simTime) ? s.simTime : (Number.isFinite(s?.tick) ? s.tick / 60 : 0);
  },

  _station(s) {
    return plantStationById(s, PYRRHA_BOX_TUNING.stationId);
  },

  _ensureBench(s) {
    const station = this._station(s);
    if (!station?.pos) return null;
    const pos = padPosition(station.pos);
    if (this._rowId == null) {
      const data = {
        pl214Bench: true,
        placeId: 'place_inspection_platform',
        homeSectorId: PYRRHA_BOX_TUNING.sectorId,
        sectorId: PYRRHA_BOX_TUNING.sectorId,
        name: "Pyrrha's bench",
        everydaySpaceKit: true,
      };
      const solid = stampSolidDressing(data, { radius: 20 });
      const row = insertDressingRow(s, {
        type: 'prop',
        pos, rot: 0,
        radius: 20,
        homeSectorId: PYRRHA_BOX_TUNING.sectorId,
        data,
        collides: !!solid,
        ...(solid ? { physicsBody: { dynamic: false, material: 'prop' } } : {}),
      });
      if (row && row.id != null) this._rowId = row.id;
    }
    if (this._postId == null && typeof this.helpers?.spawnEntity === 'function') {
      const ent = this.helpers.spawnEntity({
        type: 'beacon',
        pos, vel: { x: 0, z: 0 },
        radius: 5,
        mass: 1e6,
        hull: 1,
        hullMax: 1,
        homeSectorId: PYRRHA_BOX_TUNING.sectorId,
        data: {
          parentType: 'story_prop',
          scanLabel: "Pyrrha's bench — hand her anything",
          storyPropKind: 'reader_bench',
          pl214BenchPost: true,
          swarmFloorPad: { label: 'PYRRHA · READINGS' },
          tetherable: true,
          masslineTetherable: true,
          homeSectorId: PYRRHA_BOX_TUNING.sectorId,
        },
      });
      if (ent && ent.id != null) this._postId = ent.id;
    }
    return pos;
  },

  update(dt, state) {
    const s = state || this.state;
    if (!s || (s.mode && s.mode !== 'flight')) return;
    if (s.world?.currentSectorId !== PYRRHA_BOX_TUNING.sectorId) { this._clear(); return; }

    const bench = this._ensureBench(s);
    const now = this._now(s);
    const t = PYRRHA_BOX_TUNING;
    const player = typeof s.entities?.get === 'function' ? s.entities.get(s.playerId) : null;
    if (!bench || !player || player.alive === false || !player.pos) return;

    this._acc += finite(dt);
    if (this._acc < 1) return;                 // 1 Hz — no per-frame work
    this._acc = 0;

    // What is in her lift radius: real boxes only (never the player, never the bench post).
    let box = null;
    const entities = s.entities;
    if (typeof entities?.values === 'function') {
      for (const e of entities.values()) {
        if (!e || e.alive === false || e === player) continue;
        if (e.id === this._postId) continue;
        if (!isABox(e) || !e.pos) continue;
        const d = Math.hypot(e.pos.x - bench.x, e.pos.z - bench.z);
        if (d <= t.liftRadiusWu) { box = e; break; }
      }
    }

    if (box) {
      this._emptyHoldS = 0;
      const last = this._reads.get(box.id);
      if ((last === undefined || now - last >= t.readCooldownPerBoxS)) {
        if (this._reads.size >= t.memoryCap) {
          const oldest = this._reads.keys().next().value;
          this._reads.delete(oldest);
        }
        this._reads.set(box.id, now);
        const { valueCr, strange } = rumourValueFor(box.id, box.mass, t);
        this.bus?.emit(PL_214_READ_EVENT, {
          boxId: box.id, valueCr, strange, mass: finite(box.mass), t: now,
        });
        this.bus?.emit('comms:popup', {
          id: `plants:pl214:read:${box.id}`, sender: PYRRHA_SENDER, category: 'traffic',
          text: `Worth, as a rumour: ${valueCr} cr. Maybe.${strange ? ' Strangest today.' : ''}`,
          ttl: 8, persist: false,
        });
        this.bus?.emit('audio:cue', { id: 'confirm', position: { x: bench.x, z: bench.z }, gain: 0.4, rate: 1 });
      }
    } else {
      const near = Math.hypot(player.pos.x - bench.x, player.pos.z - bench.z) <= t.liftRadiusWu + 40;
      if (near) {
        this._emptyHoldS += 1;
        if (this._emptyHoldS >= t.emptyHoldS && now - this._lastSpeechAt >= t.emptyCooldownS) {
          this._lastSpeechAt = now;
          this._emptyHoldS = 0;
          this.bus?.emit(PL_214_EMPTY_EVENT, { benchPos: { x: bench.x, z: bench.z }, t: now });
          if (this.helpers?.voice && typeof this.helpers.voice.say === 'function') {
            this.helpers.voice.say({ channel: 'comms', id: 'plants:pl214:empty', text: PYRRHA_LINE, kind: 'traffic', ttl: 6 });
          } else {
            this.bus?.emit('voice:say', { channel: 'comms', id: 'plants:pl214:empty', text: PYRRHA_LINE, ttl: 6 });
          }
          this.bus?.emit('comms:popup', {
            id: 'plants:pl214:empty', sender: PYRRHA_SENDER, category: 'traffic',
            text: PYRRHA_LINE, ttl: 8, persist: false,
          });
        }
      } else {
        this._emptyHoldS = 0;
      }
    }
  },
};
