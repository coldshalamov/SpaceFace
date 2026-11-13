// PL-130 The stamp — Vesta (design/program/INFERENCE_PLANTS.md, row PL-130).
// "The stamp. The stamping hammer hits once a plate. Get any part of yours under it and
// the part comes back Vesta-stamped, official, forever."
// What the player can do: Stamp your parts; or stamp a stolen one and watch Customs hold
// it up to the light.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM.
// - The hammer stands on the docking ring (2.4x dockRadius, stationBubbles); its plate is
//   one authored place: the everyday-kit service gantry (insertDressingRow + stampSolidDressing,
//   kesslerScale.js pattern) plus a readable floor-pad beacon.
// - One hit per plate period (fixed sim grid). A part under the ring at the hit is stamped
//   only if the player is also inside the player ring — "any part of YOURS" means you
//   carried it there; no synthetic ownership flag is invented.
// - Stolen is a REAL commodity: a part pod stamped cmdty_stolen_goods (commodityMoralTags
//   'contraband'). Customs holds it up to the light — a timed hold on the part's data bag.
// - Bounded Maps with tuning.memoryCap; cooldowns in sim time.
// - Session state on `this`; destroy() unsubscribes all + despawns owned entities/dressing rows.

import { hash32 } from '../../core/rng.js';
import { BUBBLE_MULTIPLIERS } from '../../data/stationBubbles.js';
import { insertDressingRow } from '../../world/dressingTable.js';
import { stampSolidDressing } from '../../world/solidDressing.js';

export const PL_130_STAMPED_EVENT = 'plants:pl130:stamped';
export const PL_130_HELD_EVENT = 'plants:pl130:held';

export const THE_STAMP_TUNING = Object.freeze({
  anchorStationId: 'station_forge',
  platePeriodS: 20,                                  // one hit per plate
  hammerRadiusMult: BUBBLE_MULTIPLIERS.docking,      // 2.4x — the hammer stands on the dock ring
  stampRingRadiusWu: 30,                             // the plate
  playerRingRadiusWu: 60,                            // you carried it there
  holdS: 240,                                        // Customs holds it up for a yard day
  stampedPadLabel: 'VESTA-STAMPED — OFFICIAL',
  heldPadLabel: 'HELD TO THE LIGHT',
  placeId: 'service_gantry',                         // everyday space kit
  memoryCap: 10,
});

export const STOLEN_GOODS_ID = 'cmdty_stolen_goods'; // commodityMoralTags.js: 'contraband'

export function dockRadiusOf(station) {
  if (!station) return 72;
  const d = station.data || {};
  if (Number.isFinite(d.dockRadius) && d.dockRadius > 0) return d.dockRadius;
  const size = station.size || d.size;
  return size === 'L' ? 90 : size === 'S' ? 60 : 72; // bountyMarks.js:165 size rule
}

export function hammerPointFor(station, t = THE_STAMP_TUNING) {
  const a = (hash32('pl130', (station.data && station.data.stationId) || station.id) % 6283) / 1000;
  const r = dockRadiusOf(station) * t.hammerRadiusMult;
  return { x: station.pos.x + Math.cos(a) * r, z: station.pos.z + Math.sin(a) * r };
}

export function isStolenPart(entity) {
  return !!(entity && entity.data && entity.data.commodityId === STOLEN_GOODS_ID);
}

export function createPl130TheStamp() {
  return {
    name: 'plantsPl130',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._accum = 0;
      this._plate = null;
      this._plateStationKey = null;
      this._lastPlateIndex = -1;
      this._stampedIds = new Map();  // entityId -> simTime, bounded by memoryCap
      this._placeRowId = null;
      const on = (event, fn) => {
        const off = this.bus && this.bus.on ? this.bus.on(event, fn) : null;
        if (typeof off === 'function') this._unsubs.push(off);
      };
      on('sector:exit', () => this._reset());
      on('save:loaded', () => this._reset());
      on('game:newGame', () => this._reset());
    },

    destroy() {
      for (const off of this._unsubs || []) {
        try { off(); } catch (err) { /* cleanup must not throw */ }
      }
      this._unsubs = [];
      this._reset();
    },

    _reset() {
      if (this._plate != null && this.helpers && typeof this.helpers.removeEntity === 'function') {
        this.helpers.removeEntity(this._plate);
      }
      this._plate = null;
      if (this._stampedIds && typeof this._stampedIds.clear === 'function') this._stampedIds.clear();
      if (this._placeRowId != null && this.state && this.state.world && this.state.world.dressing
          && Array.isArray(this.state.world.dressing.rows)) {
        const row = this.state.world.dressing.byId.get(this._placeRowId);
        if (row && row.data && row.data.plantsPl130 === true) row.alive = false;
      }
      this._placeRowId = null;
      this._accum = 0;
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s && s.simTime) ? s.simTime : (Number.isFinite(s && s.tick) ? s.tick / 60 : 0);
    },

    _popup(id, sender, text, ttl = 7) {
      if (!this.bus || typeof this.bus.emit !== 'function') return;
      this.bus.emit('comms:popup', { id, sender, category: 'info', text, ttl, persist: false });
    },

    _cue(id, position = null, gain = 0.5) {
      if (!this.bus || typeof this.bus.emit !== 'function') return;
      this.bus.emit('audio:cue', { id, position, gain });
    },

    _get(id) {
      return this.state && this.state.entities && typeof this.state.entities.get === 'function'
        ? this.state.entities.get(id) : null;
    },

    _station(state) {
      const player = state && state.entities && typeof state.entities.get === 'function'
        ? state.entities.get(state.playerId) : null;
      if (!player || !player.pos) return null;
      const idx = state.entityIndex;
      const list = (idx && Array.isArray(idx.stations) && idx.stations.length)
        ? idx.stations
        : (Array.isArray(state.entityList) ? state.entityList : [...(state.entities ? state.entities.values() : [])]);
      let best = null;
      let bestD2 = Infinity;
      for (const st of list) {
        if (!st || st.alive === false || st.type !== 'station') continue;
        if ((st.data && st.data.stationId || st.id) !== THE_STAMP_TUNING.anchorStationId) continue;
        const d2 = (st.pos.x - player.pos.x) ** 2 + (st.pos.z - player.pos.z) ** 2;
        if (d2 < bestD2) { bestD2 = d2; best = st; }
      }
      return best;
    },

    _ensurePlate(station) {
      const key = (station.data && station.data.stationId) || station.id;
      if (this._plateStationKey === key && this._plate != null) return;
      const point = hammerPointFor(station, THE_STAMP_TUNING);
      // One authored place for the hammer: the everyday-kit gantry, solid, on the dressing
      // table like the Scale 4 worksite — never a hand-sized ball collider.
      const rows = (this.state.world && this.state.world.dressing && this.state.world.dressing.rows) || [];
      const exists = rows.some((r) => r.alive !== false && r.data && r.data.plantsPl130 === true);
      if (!exists) {
        const data = {
          plantsPl130: true, placeId: THE_STAMP_TUNING.placeId,
          worldDressing: true, everydaySpaceKit: true, paletteClass: 'core',
          placeScale: 1, name: 'The stamping hammer',
          scanLabel: 'The stamp — one hit per plate',
        };
        const solid = stampSolidDressing(data, { radius: 10 });
        const row = insertDressingRow(this.state, {
          pos: point, rot: 0, radius: 10, collides: !!solid,
          ...(solid ? { physicsBody: { dynamic: false, material: 'prop' } } : {}),
          data,
        });
        this._placeRowId = row && row.id != null ? row.id : null;
      }
      const spawn = this.helpers && this.helpers.spawnEntity;
      if (typeof spawn === 'function') {
        const ent = spawn({
          type: 'beacon',
          pos: { x: point.x, z: point.z },
          vel: { x: 0, z: 0 },
          radius: 6,
          mass: 1e6,
          hull: 1,
          hullMax: 1,
          collides: false,
          physicsBody: false,
          data: {
            parentType: 'story_prop',
            storyPropKind: 'plants_stamp_plate',
            plantsPl130Plate: true,
            scanLabel: 'The stamp — plate under the hammer',
            swarmFloorPad: { label: 'THE STAMP — PLATE' },
          },
        });
        this._plate = ent && ent.id != null ? ent.id : null;
      }
      this._plateStationKey = key;
      this._lastPlateIndex = Math.floor(this._now() / THE_STAMP_TUNING.platePeriodS);
    },

    update(dt, state) {
      const s = state || this.state;
      if (!s || s.mode !== 'flight') return;
      const now = this._now();
      const t = THE_STAMP_TUNING;

      const station = this._station(s);
      if (!station) { this._accum = 0; return; }
      this._ensurePlate(station);
      if (this._plate == null) return;
      const plate = this._get(this._plate);
      if (!plate || plate.alive === false || !plate.pos) return;

      this._accum += Math.max(0, Number(dt) || 0);
      if (this._accum < 1) return;             // 1 Hz — the hammer needs no per-frame judge
      this._accum = 0;

      const plateIndex = Math.floor(now / t.platePeriodS);
      if (plateIndex === this._lastPlateIndex) return;
      this._lastPlateIndex = plateIndex;

      const player = this._get(s.playerId);
      if (!player || !player.pos) return;
      const playerD = Math.hypot(player.pos.x - plate.pos.x, player.pos.z - plate.pos.z);
      const playerPresent = playerD <= t.playerRingRadiusWu;

      // Anything part-like under the ring at the hit: payloads and loose debris only.
      const ents = s.entityList && Array.isArray(s.entityList)
        ? s.entityList
        : [...(s.entities && typeof s.entities.values === 'function' ? s.entities.values() : [])];
      for (const e of ents) {
        if (!e || e.alive === false || !e.pos) continue;
        if (e.type !== 'payload' && e.type !== 'debris') continue;
        if (e === plate) continue;
        const d = Math.hypot(e.pos.x - plate.pos.x, e.pos.z - plate.pos.z);
        if (d > t.stampRingRadiusWu) continue;
        if (playerPresent) this._stampPart(e, now, plate.pos);
      }
    },

    _stampPart(part, now, platePos) {
      const t = THE_STAMP_TUNING;
      part.data = part.data || {};
      const already = this._stampedIds.get(part.id) != null || part.data.plantsVestaStamped === true;
      part.data.plantsVestaStamped = true;           // official, forever
      if (part.data.swarmFloorPad) part.data.swarmFloorPad.label = t.stampedPadLabel;
      else part.data.swarmFloorPad = { label: t.stampedPadLabel };

      // Bounded ledger.
      if (this._stampedIds.size >= t.memoryCap) {
        const oldestKey = this._stampedIds.keys().next().value;
        this._stampedIds.delete(oldestKey);
      }
      this._stampedIds.set(part.id, now);
      if (!already) {
        this._cue('sfx_vent_chime', platePos, 0.45);
        if (this.bus && typeof this.bus.emit === 'function') {
          this.bus.emit(PL_130_STAMPED_EVENT, { entityId: part.id, t: now });
        }
      }

      // A stolen part reads official and still reads stolen: Customs holds it to the light.
      if (isStolenPart(part) && part.data.customsHoldUntil == null) {
        part.data.customsHoldUntil = now + t.holdS;
        part.data.swarmFloorPad.label = t.heldPadLabel;
        this._popup(`plants:pl130:held:${part.id}`, 'CUSTOMS GATE',
          'Vesta-stamped, official — and held up to the light. It still reads stolen.');
        this._cue('ui_deny', platePos, 0.6);
        if (this.bus && typeof this.bus.emit === 'function') {
          this.bus.emit(PL_130_HELD_EVENT, { entityId: part.id, until: part.data.customsHoldUntil, t: now });
        }
      } else if (!already) {
        this._popup(`plants:pl130:done:${part.id}`, 'VESTA STAMP',
          'Stamped. It comes back Vesta-stamped — official, forever.');
      }
    },
  };
}

export const pl130TheStamp = createPl130TheStamp();
