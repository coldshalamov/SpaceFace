// PL-365 The lamp garden — "A cluster of rocks at a waystation each carries a name and one
// working lamp, kept lit by nobody official, for years | Sit with them a while; or salvage the
// lamps — your hull's lamps run dim at that station, and the keeper of nothing knows"
//
// Seam (verified): the garden is a cluster of REAL rock props (tetherable story-prop beacons,
// beacons.js:185 shape), each stamped with a name and a working lamp (data.lampLit), anchored
// at hash32-derived offsets off the verified sector_sker_haven claim-site POI
// (src/data/claimableBodies.js: poi_claim_morrow). Sitting is physical: hold station (speed at
// rest) inside the garden ring for sitHoldS. Salvaging is physical too: tow any garden lamp
// beyond salvageRangeWu from its rock — the lamp dies, the garden remembers, and while you are
// near that station your hull reads dim (a stamp on the player entity
// data.plantsPl365HullLampsDim that the presentation/lamp shaders read). No economy mutation.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only; hash32 places the rocks and picks names.
//   No Math.random(), no Date.now(). No Three.js, no DOM.
// - Session state on `this`; destroy() unsubscribes, removes owned props, clears Maps.
//   Durable verdicts ride story flags (`plantsPl365*`). Props respawn on sector re-entry.
// - The sitting beat fires once per visit (long cooldown); the dim verdict is forever.

import { hash32 } from '../../../core/rng.js';

export const PL_365_SAT_EVENT = 'plants:pl365:sat';
export const PL_365_DIMMED_EVENT = 'plants:pl365:dimmed';

export const LAMP_GARDEN_TUNING = Object.freeze({
  sectorId: 'sector_sker_haven',
  poiX: 2100,                 // verified claim-site POI poi_claim_morrow (sector-local)
  poiZ: -1450,
  gardenOffsetWu: 240,        // the garden cluster, off the waystation POI
  rockCount: 5,               // a cluster, not a field
  gardenRadiusWu: 60,         // the sitting ring around the cluster centre
  sitHoldS: 20,               // hold station this long to have sat with them
  restSpeedWu: 8,             // "sitting" = not moving
  satCooldownS: 600,          // the beat fires once per visit, not per tick
  salvageRangeWu: 22,         // a lamp towed this far from its rock is salvaged
  dimRadiusWu: 900,           // "at that station": the dim verdict reaches this far
  names: ['Old Rask', 'Benni', 'Halvorsen', 'The Tern', 'Quiet Ann'],
  memoryCap: 8,               // bounded bookkeeping
});

export const PL_365_DIM_FLAG = 'plantsPl365LampsSalvaged';

/** Pure: the garden's rock positions and names — hash32 offsets off the real POI. */
export function gardenPositions(t = LAMP_GARDEN_TUNING) {
  const roll = hash32('plantsPl365Garden', t.poiX, t.poiZ);
  const centreAng = (roll % 3600) * (Math.PI * 2) / 3600;
  const centre = {
    x: t.poiX + Math.cos(centreAng) * t.gardenOffsetWu,
    z: t.poiZ + Math.sin(centreAng) * t.gardenOffsetWu,
  };
  const rocks = [];
  for (let i = 0; i < t.rockCount; i++) {
    const ang = hash32('plantsPl365Rock', i, t.poiX, t.poiZ) % 3600 * (Math.PI * 2) / 3600;
    const rad = 18 + (hash32('plantsPl365Rad', i, t.poiX) % 30);
    rocks.push({
      name: t.names[i % t.names.length],
      pos: { x: centre.x + Math.cos(ang) * rad, z: centre.z + Math.sin(ang) * rad },
    });
  }
  return { centre, rocks };
}

/** Pure: one garden rock's prop spec — a named rock with one working lamp. */
export function gardenRockSpec(name, pos) {
  return {
    type: 'beacon',
    pos: { x: pos.x, z: pos.z },
    vel: { x: 0, z: 0 },
    radius: 7,
    mass: 1e6,
    hull: 1,
    hullMax: 1,
    flags: { persistent: true },
    data: {
      parentType: 'story_prop',
      storyPropKind: 'plants_lamp_garden_rock',
      plantsPl365Rock: true,
      memorialName: name,
      scanLabel: `A rock with a name — ${name} — and one working lamp, kept lit for years.`,
      swarmFloorPad: { label: name },
      lampLit: true,
      masslineTetherable: true,
    },
  };
}

/** Pure: is the player hull "sitting" — inside the ring at rest? */
export function isSittingInRing(playerPos, playerSpeed, centre, t = LAMP_GARDEN_TUNING) {
  if (!playerPos || !centre) return false;
  if (playerSpeed > t.restSpeedWu) return false;
  const dx = playerPos.x - centre.x;
  const dz = playerPos.z - centre.z;
  return dx * dx + dz * dz <= t.gardenRadiusWu * t.gardenRadiusWu;
}

export function createPl365LampGarden() {
  return {
    name: 'plantsPl365',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._rockIds = new Map();  // rockId -> anchor {x,z}, bounded
      this._sitStartAt = null;
      this._lastSatAt = -Infinity;
      this._dimAnnounced = false;
      const on = (event, fn) => {
        const off = this.bus?.on?.(event, fn);
        if (typeof off === 'function') this._unsubs.push(off);
      };
      on('entity:killed', (p = {}) => this._onRockDestroyed(p));
      on('sector:exit', () => this._despawnProps());
      on('save:loaded', () => this._despawnProps());
      on('game:newGame', () => this._hardReset());
    },

    destroy() {
      for (const off of this._unsubs || []) {
        try { off(); } catch (err) { /* cleanup must not throw */ }
      }
      this._unsubs = [];
      this._despawnProps();
      this._sitStartAt = null;
      this._lastSatAt = -Infinity;
      this._dimAnnounced = false;
    },

    _hardReset() {
      this._despawnProps();
      this._sitStartAt = null;
      this._lastSatAt = -Infinity;
      this._dimAnnounced = false;
    },

    _flags() {
      const flags = this.state?.story?.flags;
      return flags ? flags : (this.state?.story ? (this.state.story.flags = {}) : null);
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s?.simTime) ? s.simTime : (Number.isFinite(s?.tick) ? s.tick / 60 : 0);
    },

    _despawnProps() {
      const rm = this.helpers?.removeEntity;
      if (typeof rm === 'function') for (const id of (this._rockIds ? this._rockIds.keys() : [])) rm(id);
      this._rockIds?.clear();
      this._sitStartAt = null;
    },

    _player() {
      const s = this.state;
      return s?.entities?.get && s.playerId != null ? s.entities.get(s.playerId) : null;
    },

    _salvaged() { return this._flags()?.[PL_365_DIM_FLAG] === true; },

    _dimBySalvage(now) {
      const flags = this._flags();
      if (flags) flags[PL_365_DIM_FLAG] = true; // forever: the keeper of nothing knows
      this._dimAnnounced = false;
      this.bus?.emit('comms:popup', {
        id: `plants:pl365:dim:${Math.round(now)}`,
        sender: 'The garden',
        category: 'story',
        text: 'The keeper of nothing knows.',
        ttl: 9,
        persist: false,
      });
      this.bus?.emit('audio:cue', { id: 'ui_deny' });
      this.bus?.emit(PL_365_DIMMED_EVENT, { pos: gardenPositions().centre, t: now });
    },

    _onRockDestroyed() {
      if (this._rockIds.size === 0 || this._salvaged()) return;
      this._dimBySalvage(this._now()); // a destroyed garden lamp is salvaged all the same
    },

    update(dt) {
      const s = this.state;
      if (!s || s.mode !== 'flight') return;
      const inSector = s.world?.currentSectorId === LAMP_GARDEN_TUNING.sectorId;
      if (!inSector) { if (this._rockIds.size > 0) this._despawnProps(); return; }
      const now = this._now();
      const garden = gardenPositions();

      // Respawn missing rocks (bounded).
      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn === 'function' && this._rockIds.size < garden.rocks.length) {
        for (const rock of garden.rocks) {
          let present = false;
          for (const anchor of this._rockIds.values()) {
            if (anchor.x === rock.pos.x && anchor.z === rock.pos.z) { present = true; break; }
          }
          if (present) continue;
          const ent = spawn(gardenRockSpec(rock.name, rock.pos));
          if (ent && ent.id != null) {
            if (this._rockIds.size >= LAMP_GARDEN_TUNING.memoryCap) this._despawnProps();
            this._rockIds.set(ent.id, { x: rock.pos.x, z: rock.pos.z, name: rock.name });
          }
        }
      }
      if (this._rockIds.size === 0) return;

      const player = this._player();
      if (!player || !player.pos) return;

      // Salvage check: any garden rock towed off its stone.
      if (!this._salvaged()) {
        for (const [id, anchor] of this._rockIds) {
          const rock = s.entities?.get ? s.entities.get(id) : null;
          if (!rock || rock.alive === false || !rock.pos) continue;
          const dx = rock.pos.x - anchor.x;
          const dz = rock.pos.z - anchor.z;
          if (dx * dx + dz * dz > LAMP_GARDEN_TUNING.salvageRangeWu * LAMP_GARDEN_TUNING.salvageRangeWu) {
            // Salvaged: its lamp dies on the spot, and the garden remembers.
            rock.data.lampLit = false;
            rock.data.scanLabel = `A rock with a name — ${anchor.name} — and a dark socket.`;
            this._dimBySalvage(now);
            break;
          }
        }
      }

      // The dim verdict: your hull reads dim while near that station.
      if (this._salvaged()) {
        const cx = player.pos.x - garden.centre.x;
        const cz = player.pos.z - garden.centre.z;
        const inReach = (cx * cx + cz * cz) <= LAMP_GARDEN_TUNING.dimRadiusWu * LAMP_GARDEN_TUNING.dimRadiusWu;
        player.data = player.data || {};
        if (inReach) {
          player.data.plantsPl365HullLampsDim = true; // presentation reads this stamp
          if (!this._dimAnnounced) {
            this._dimAnnounced = true;
            this.bus?.emit('comms:popup', {
              id: `plants:pl365:dimreach:${Math.round(now)}`,
              sender: 'The station',
              category: 'story',
              text: 'Your lamps run dim here.',
              ttl: 8,
              persist: false,
            });
          }
        } else if (player.data.plantsPl365HullLampsDim === true) {
          player.data.plantsPl365HullLampsDim = false; // outside its reach the hull reads true
        }
      }

      // Sitting with them: hold station inside the ring.
      const vx = Number(player.vel && player.vel.x) || 0;
      const vz = Number(player.vel && player.vel.z) || 0;
      const speed = Math.sqrt(vx * vx + vz * vz);
      if (isSittingInRing(player.pos, speed, garden.centre)) {
        if (this._sitStartAt == null) this._sitStartAt = now;
        if (this._sitStartAt != null
          && now - this._sitStartAt >= LAMP_GARDEN_TUNING.sitHoldS
          && now - this._lastSatAt >= LAMP_GARDEN_TUNING.satCooldownS) {
          this._lastSatAt = now;
          this._sitStartAt = null;
          this.bus?.emit('comms:popup', {
            id: `plants:pl365:sat:${Math.round(now)}`,
            sender: 'The garden',
            category: 'story',
            text: 'Still lit. Years now.',
            ttl: 8,
            persist: false,
          });
          this.bus?.emit('audio:cue', { id: 'confirm' });
          this.bus?.emit(PL_365_SAT_EVENT, {
            pos: { x: garden.centre.x, z: garden.centre.z },
            heldS: LAMP_GARDEN_TUNING.sitHoldS,
            t: now,
          });
        }
      } else {
        this._sitStartAt = null;
      }
    },
  };
}

export const pl365LampGarden = createPl365LampGarden();
