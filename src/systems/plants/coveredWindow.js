// PL-289 The covered window — Io (design/program/INFERENCE_PLANTS.md, row PL-289).
// "The covered window. Nap in an unlit public berth overnight and someone walking their
// route pauses to plate your window against the morning flare of departing traffic."
// What the player can do: Thank the walker if you catch them; or leave your trash in the
// berth — no more covered windows, and the walker routes past you.
//
// SEAM NOTE (honest): the public berth is a chalked prop off the REAL Io Reach body
// (station_reach, sector_io_reach); the walker is a real neutral stranger
// (makeShipEntitySpec, team 2, passive) on a fixed hash route through the night band of
// the shared 240 s plant day. Napping is parking slow in the berth through the night;
// when the walker's route reaches the berth they pause and "plate the window": a real
// plate prop spawns beside your hull with lampsFlashing=false presence (a silent plate —
// the note's exact shape). The morning flare is the night band ending: the plate's
// presence stamp holds until then. Thanking the walker is catching them mid-pause —
// being near them while they work; leaving your trash is a jettisoned cargo pod sitting
// inside the berth zone through tuning.trashS. After trash: no more covered windows —
// the walker routes past your berth (flag-borne receipt plantsPl289Trashed), the plate
// goes at dawn, and one line explains the new route.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only; night band, walker route and pause
//   times are pure clock/hash math. No Math.random(), no Date.now().
// - No Three.js, no DOM. Bounded Maps with tuning.memoryCap.
// - Session state on `this`; destroy() unsubscribes all + despawns berth, walker, plate.

import { hash32 } from '../../core/rng.js';
import { BUBBLE_MULTIPLIERS } from '../../data/stationBubbles.js';
import { makeShipEntitySpec } from '../ships.js';

export const PL_289_PLATED_EVENT = 'plants:pl289:plated';
export const PL_289_THANKS_EVENT = 'plants:pl289:thanks';
export const PL_289_TRASH_EVENT = 'plants:pl289:trash';

export const COVERED_WINDOW_TUNING = Object.freeze({
  stationId: 'station_reach',
  sectorId: 'sector_io_reach',
  dayLengthS: 240,
  nightFraction: 0.25,         // the overnight band
  berthRadiusMult: BUBBLE_MULTIPLIERS.docking, // 2.4x — the public berth block
  napSpeedWu: 4,
  napNeedS: 10,
  walkerHull: 'ship_mule',
  walkerFaction: 'faction_dmc',
  walkerCallsign: 'the walker',
  pauseRangeWu: 40,
  thanksRangeWu: 30,
  trashS: 12,                  // a pod sitting in the berth this long is trash
  plateRadius: 4,
  memoryCap: 8,
  sender: 'The walker',
});

export const BERTH_SALT = 'plantsPl289Berth';
export const THANKS_LINE = 'Someone did it for me once.';
export const TRASH_LINE = 'The walker routes past your berth now.';

/** Night band of the shared plant day. */
export function nightAt(simTime, t = COVERED_WINDOW_TUNING) {
  const len = Math.max(1, t.dayLengthS);
  const phase = ((simTime % len) + len) % len;
  return phase >= len * (1 - t.nightFraction);
}

/** Day index of the shared plant clock. */
export function berthDayOf(simTime, t = COVERED_WINDOW_TUNING) {
  return Math.floor((Number.isFinite(simTime) ? simTime : 0) / Math.max(1, t.dayLengthS));
}

/** The public berth: a fixed chalked spot, hash-derived bearing. */
export function berthPointFor(station, t = COVERED_WINDOW_TUNING) {
  const a = (hash32(BERTH_SALT, (station.data && station.data.stationId) || station.id) % 6283) / 1000;
  const base = Number.isFinite(station.data?.dockRadius) && station.data.dockRadius > 0
    ? station.data.dockRadius
    : (station.size === 'L' ? 90 : station.size === 'S' ? 60 : 72);
  const r = base * t.berthRadiusMult;
  return { x: station.pos.x + Math.cos(a) * r, z: station.pos.z + Math.sin(a) * r };
}

/** The walker's route: from one hash point past the berth to the other. */
export function walkerRouteFor(station, t = COVERED_WINDOW_TUNING) {
  const berth = berthPointFor(station, t);
  const h = hash32(BERTH_SALT, 'route', (station.data && station.data.stationId) || station.id);
  const a = (h % 6283) / 1000;
  const len = 180;
  return {
    from: { x: berth.x + Math.cos(a) * len, z: berth.z + Math.sin(a) * len },
    berth,
    to: { x: berth.x - Math.cos(a) * len, z: berth.z - Math.sin(a) * len },
  };
}

function stationOf(state, stationId) {
  if (!state) return null;
  const list = (state.entityIndex && state.entityIndex.stations) || state.entityList || [];
  const pools = [];
  if (list.length) pools.push(list);
  if (state.entities && typeof state.entities.values === 'function') pools.push([...state.entities.values()]);
  for (const pool of pools) {
    for (const e of pool) {
      if (!e || e.alive === false || e.type !== 'station') continue;
      if (((e.data && e.data.stationId) || e.id) === stationId) return e;
    }
  }
  return null;
}

export function createCoveredWindow() {
  return {
    name: 'plantsPl289',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._berthId = null;
      this._walkerId = null;
      this._plateId = null;
      this._berthPoint = null;
      this._napS = 0;
      this._napping = false;
      this._platedNight = -1;
      _initTrash(this);
      this._trashed = false;
      this._thanked = false;
      this._lastNight = null;
      const on = (event, fn) => {
        const off = this.bus?.on?.(event, fn);
        if (typeof off === 'function') this._unsubs.push(off);
      };
      on('sector:exit', () => this._drop());
      on('save:loaded', () => this._drop());
      on('game:new', () => this._resetSession());
      on('game:newGame', () => this._resetSession());
    },

    destroy() {
      for (const off of this._unsubs || []) {
        try { off(); } catch (err) { /* cleanup must not throw */ }
      }
      this._unsubs = [];
      this._resetSession();
    },

    _resetSession() {
      this._drop();
      this._trashed = !!(this.state?.story?.flags?.plantsPl289Trashed);
      this._thanked = false;
    },

    _drop() {
      const rm = this.helpers?.removeEntity;
      if (typeof rm === 'function') {
        for (const id of [this._berthId, this._walkerId, this._plateId]) {
          if (id != null) rm(id);
        }
      }
      this._berthId = null;
      this._walkerId = null;
      this._plateId = null;
      this._berthPoint = null;
      this._napS = 0;
      this._napping = false;
      this._platedNight = -1;
      this._trashId = null;
      this._trashSince = null;
      this._lastNight = null;
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s?.simTime) ? s.simTime : (Number.isFinite(s?.tick) ? s.tick / 60 : 0);
    },

    _flags() {
      const s = this.state;
      return s && s.story ? (s.story.flags || (s.story.flags = {})) : null;
    },

    _popup(id, sender, text, ttl = 8) {
      this.bus?.emit('comms:popup', { id, sender, category: 'traffic', text, ttl, persist: false });
    },

    _cue(id, gain = 0.45) {
      this.bus?.emit('audio:cue', { id, gain });
    },

    _emit(type, payload) {
      this.bus?.emit(type, payload);
    },

    _get(id) {
      return this.state?.entities?.get ? this.state.entities.get(id) : null;
    },

    _ensureBerth(station) {
      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn !== 'function' || this._berthId != null) return;
      const point = berthPointFor(station);
      this._berthPoint = point;
      const berth = spawn({
        type: 'beacon',
        pos: { x: point.x, z: point.z },
        vel: { x: 0, z: 0 },
        radius: 9,
        mass: 1e6,
        hull: 1,
        hullMax: 1,
        homeSectorId: COVERED_WINDOW_TUNING.sectorId,
        data: {
          parentType: 'story_prop',
          storyPropKind: 'plants_public_berth',
          plantsPl289Berth: true,
          placeId: 'place_habitat_pod',
          everydaySpaceKit: true,
          scanLabel: 'An unlit public berth \u2014 naps are free, the walker sees to the window',
          swarmFloorPad: { label: 'PUBLIC BERTH' },
        },
      });
      this._berthId = berth && berth.id != null ? berth.id : null;
    },

    _ensureWalker(station) {
      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn !== 'function' || this._walkerId != null) return;
      const route = walkerRouteFor(station, COVERED_WINDOW_TUNING);
      const spec = makeShipEntitySpec(COVERED_WINDOW_TUNING.walkerHull, {
        team: 2,
        factionId: COVERED_WINDOW_TUNING.walkerFaction,
        pos: { x: route.from.x, z: route.from.z },
        ai: { archetype: 'passive', passive: true },
      });
      spec.data = spec.data || {};
      spec.data.plantsPl289Walker = true;
      spec.data.parentType = 'story_prop';
      spec.data.callsign = COVERED_WINDOW_TUNING.walkerCallsign;
      spec.data.despawnAt = null;
      const ent = spawn(spec);
      if (ent && ent.id != null) this._walkerId = ent.id;
    },

    _spawnPlate(player, now, night) {
      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn !== 'function' || this._plateId != null) return;
      const plate = spawn({
        type: 'payload',
        pos: { x: player.pos.x + 8, z: player.pos.z + 8 },
        vel: { x: 0, z: 0 },
        radius: COVERED_WINDOW_TUNING.plateRadius,
        mass: 3,
        physicsBody: { mass: 3 },
        flags: { persistent: true },
        data: {
          parentType: 'story_prop',
          storyPropKind: 'plants_flare_plate',
          plantsPl289Plate: true,
          masslineTetherable: true,
          scanLabel: 'A plate over your window, set against the morning flare',
          swarmFloorPad: { label: 'FLARE PLATE' },
          lampsFlashing: false,     // silent presence: the note's exact shape
        },
      });
      if (plate && plate.id != null) {
        this._plateId = plate.id;
        this._platedNight = night;
        this._emit(PL_289_PLATED_EVENT, { night, plateId: plate.id, t: now });
      }
    },

    update(dt, state) {
      const s = state || this.state;
      if (!s || s.mode !== 'flight') return;
      if (s.world?.currentSectorId !== COVERED_WINDOW_TUNING.sectorId) { this._drop(); return; }
      const station = stationOf(s, COVERED_WINDOW_TUNING.stationId);
      if (!station?.pos) { this._drop(); return; }
      const now = this._now();
      const t = COVERED_WINDOW_TUNING;
      this._ensureBerth(station);
      if (!this._berthPoint) return;
      const night = nightAt(now, t);
      const night2 = berthDayOf(now, t);
      const player = s.entities?.get ? s.entities.get(s.playerId) : null;
      if (!player?.pos) return;

      // Morning: the flare passes, the plate's presence ends (it goes with the wash).
      if (this._lastNight === true && !night && this._plateId != null) {
        this.helpers?.removeEntity?.(this._plateId);
        this._plateId = null;
      }
      this._lastNight = night;

      // Napping: slow, in the berth, through the night.
      const speed = Math.hypot(Number(player.vel?.x) || 0, Number(player.vel?.z) || 0);
      const dB = Math.hypot(player.pos.x - this._berthPoint.x, player.pos.z - this._berthPoint.z);
      const inBerth = dB <= 26;
      if (night && inBerth && speed <= t.napSpeedWu) {
        this._napS += Math.max(0, Number(dt) || 0);
        if (this._napS >= t.napNeedS) this._napping = true;
      } else {
        this._napS = 0;
        if (!night || !inBerth) this._napping = false;
      }

      // The walker walks their route through the night — unless your berth is trashed.
      if (night && !this._trashed) {
        this._ensureWalker(station);
        const walker = this._walkerId != null ? this._get(this._walkerId) : null;
        if (walker?.pos) {
          const route = walkerRouteFor(station, t);
          const span = 120;                                  // one crossing per night
          const phase = ((now % t.dayLengthS) + t.dayLengthS) % t.dayLengthS;
          const k = Math.min(1, Math.max(0, ((phase - t.dayLengthS * (1 - t.nightFraction)) / span)));
          const tx = route.from.x + (route.to.x - route.from.x) * k;
          const tz = route.from.z + (route.to.z - route.from.z) * k;
          walker.pos.x = tx;
          walker.pos.z = tz;
          const dW = Math.hypot(tx - this._berthPoint.x, tz - this._berthPoint.z);
          const nearPlayer = Math.hypot(tx - player.pos.x, tz - player.pos.z);

          // The pause: napping hull, walker passing, plate goes on — silent.
          if (this._napping && dW <= t.pauseRangeWu && this._plateId == null) {
            this._spawnPlate(player, now, night2);
          }
          // Thank the walker if you catch them: near them while they work, awake.
          if (dW <= t.pauseRangeWu && !this._napping && nearPlayer <= t.thanksRangeWu
              && !this._thanked && this._platedNight === night2) {
            this._thanked = true;
            this._cue('confirm', 0.45);
            this._popup(`plants:pl289:thanks:${Math.round(now)}`, t.sender, THANKS_LINE);
            this._emit(PL_289_THANKS_EVENT, { night: night2, t: now });
          }
        }
      }

      // Trash: a jettisoned pod sitting inside the berth zone through trashS.
      if (this._trashId != null) {
        const pod = this._get(this._trashId);
        const near = pod?.pos && Math.hypot(pod.pos.x - this._berthPoint.x, pod.pos.z - this._berthPoint.z) <= 30;
        if (!near) {
          this._trashId = null;
          this._trashSince = null;
        } else if (now - (this._trashSince || now) >= t.trashS) {
          this._trashed = true;
          const flags = this._flags();
          if (flags) flags.plantsPl289Trashed = true;
          this._trashId = null;
          this._trashSince = null;
          if (this._plateId != null) this.helpers?.removeEntity?.(this._plateId);
          this._plateId = null;
          if (this._walkerId != null) this.helpers?.removeEntity?.(this._walkerId);
          this._walkerId = null;
          this._cue('ui_deny', 0.5);
          this._popup(`plants:pl289:trash:${Math.round(now)}`, t.sender, TRASH_LINE);
          this._emit(PL_289_TRASH_EVENT, { night: night2, t: now });
        }
      } else if (s.entities && typeof s.entities.values === 'function') {
        for (const e of s.entities.values()) {
          if (!e || e.alive === false || e.type !== 'payload' || !e.pos) continue;
          const d = e.data || {};
          if (!d.commodityId) continue;                      // jettisoned cargo pods only
          if (Math.hypot(e.pos.x - this._berthPoint.x, e.pos.z - this._berthPoint.z) <= 30) {
            this._trashId = e.id;
            this._trashSince = now;
            break;
          }
        }
      }
    },
  };
}

function _initTrash(plant) {
  plant._trashId = null;
  plant._trashSince = null;
}

export const coveredWindowPlant = createCoveredWindow();
