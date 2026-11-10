// SPX-B-08 — THE SHADOW RING. A faded painted ring on a flat-faced rock off the Eunomia
// trade lane, a tiny dead lamp at its center. No prompt, no marker, no legend on the charts.
// Fly so your hull's shadow fills the ring at the right sun minute and the lamp lights for
// the day. On the tenth hit, fresh paint appears under the ring: STILL GOT IT.
//
// HONEST SCOPING: the world has no shadow-casting sun pass to read, so the shadow-geometry
// predicate is authored arithmetic over live positions — an authored sector-frame sun
// bearing, a once-a-day sun minute, and a cast length. The hull's shadow "lands in the ring"
// when the point SUN_BEARING cast-length sunward of the hull sits inside the ring disc while
// the day-window holds. The lamp is the registry's cue-light seam (presentation:vfxCue, the
// same two-gate reduced-motion read as the spectacle rows); the paint is a comms tell keyed
// to the hit counter.
//
// OWNERSHIP (single-writer) — plain-named story flags, written only here:
//   shadow_ring_hits    the hit counter (the story.flags hit counter the followup names)
//   shadow_ring_lit_day the sector day the lamp is lit for (it burns for that day only)
//   shadow_ring_paint   latched once on the tenth hit — the paint is there for good
//
// Deterministic: the predicate reads state.simTime and live positions; the cue is throttled
// on simTime. The beat re-fires on its cooldown, so the ritual is there every sector day.
import { deepFreeze, defineEncounter } from './catalog.js';
import { CAL_DAY_S } from '../../data/worldCalendar.js';

export const encounterOrder = 1322;
export const trigger = deepFreeze({
  id: 'the_shadow_ring',
  tier: 'ambient',
  deck: 'civilian',
  weight: 0.6,
  zoneTypes: ['derelict_field'],
  script: 'selfRegistered',
  pressureCost: 6,
  cooldownS: 240,
  proximity: true,
  rare: true,
  gates: {
    sectorIds: ['sector_eunomia_gulf'],
  },
});

export const RING = Object.freeze({
  // The ring rock hangs an authored offset off the hulk-field anchor (off the trade lane);
  // the lamp prop and the predicate read the same offset so the place and the math agree.
  offset: Object.freeze({ x: 24, z: 30 }),
  radiusWu: 12,            // the painted ring's disc
  sunBearingRad: 0.62,     // the sector-frame bearing the light comes from
  castWu: 55,              // how far sunward of the ring the hull must sit to cast into it
  // The right sun minute: once per sector day the bearing is true.
  sunWindowFrac: Object.freeze([0.3, 0.42]),
  lampCadenceS: 30,        // while lit, the lamp re-cues on this simTime cadence
  paintHits: 10,           // the tenth hit pays the paint
});

function flagsOf(state) {
  return state && state.story && state.story.flags && typeof state.story.flags === 'object'
    ? state.story.flags : null;
}

function latchFlag(state, key, value) {
  const flags = flagsOf(state);
  if (!flags) {
    if (!state.story) state.story = { flags: {} };
    if (!state.story.flags || typeof state.story.flags !== 'object') state.story.flags = {};
  }
  const map = state.story.flags;
  if (map[key] != null) return map[key];
  map[key] = value;
  return value;
}

function dayFraction(simTime) {
  return ((Number(simTime) || 0) % CAL_DAY_S) / CAL_DAY_S;
}

export const runtime = Object.freeze({
  fire(d, live, state) {
    const anchor = live.anchor || (live.plan && live.plan.zoneCenter);
    if (!anchor || !Number.isFinite(anchor.x)) return d.abort(live, 'no_zone_anchor');
    // The ring is a real place: the dead lamp stands at its center so the ritual has a
    // thing to fly at. Encounter-dressing scope, re-materialized per firing.
    const lamp = d.spawnProp(live, {
      type: 'beacon',
      pos: { x: anchor.x + RING.offset.x, z: anchor.z + RING.offset.z },
      radius: 5,
      scanLabel: 'FADED PAINTED RING \u2014 DEAD LAMP AT CENTER',
      storyPropKind: 'shadow_ring_lamp',
    });
    if (!lamp || lamp.id == null) return d.abort(live, 'prop_failed');
    live.vars.lampId = lamp.id;
    live.vars.lampPos = { x: lamp.pos.x, z: lamp.pos.z };
    live.vars.startedAt = d.now();
    live.vars.lastCueAt = 0;
    live.vars.saidToday = 0;
    live.phase = 'watch';
    d.say(live, 'info',
      'A faded painted ring on a flat-faced rock, a tiny dead lamp at its center. No marker, '
      + 'no legend \u2014 but the paint is fresh enough, and on the days the lamp is lit '
      + 'there is no other reason for it to be.',
      null, { literal: true, primary: true });
    return null;
  },

  tick(d, live, state, now) {
    if (live.phase !== 'watch') return;
    const day = Math.floor((Number(state.simTime) || 0) / CAL_DAY_S);
    const flags = flagsOf(state) || {};
    const litDay = Number.isFinite(Number(flags.shadow_ring_lit_day))
      ? Math.floor(Number(flags.shadow_ring_lit_day)) : null;

    // The lamp burns for its day while the watch stands. Off-day, the watch runs the ritual.
    if (litDay === day) {
      if (now - (live.vars.lastCueAt || 0) >= RING.lampCadenceS) {
        live.vars.lastCueAt = now;
        this._cueLamp(d, state, live);
      }
      if (now >= (live.vars.startedAt || 0) + 900) return d.abort(live, 'lamp_stands');
      return null;
    }

    // The ritual: fly the shadow into the ring at the right sun minute.
    const frac = dayFraction(now);
    const [w0, w1] = RING.sunWindowFrac;
    if (frac >= w0 && frac <= w1) {
      const player = state.entities && state.entities.get
        ? state.entities.get(state.playerId) : null;
      if (player && player.pos) {
        // The shadow lands castWu anti-sunward of the hull; the hit is that point inside
        // the ring disc. The sun bearing is authored sector-frame; the anchor offset puts
        // the rock there, so the math is done in the same frame.
        const ringX = (live.anchor && live.anchor.x || 0) + RING.offset.x;
        const ringZ = (live.anchor && live.anchor.z || 0) + RING.offset.z;
        const shadowX = player.pos.x - Math.cos(RING.sunBearingRad) * RING.castWu;
        const shadowZ = player.pos.z - Math.sin(RING.sunBearingRad) * RING.castWu;
        const dx = shadowX - ringX;
        const dz = shadowZ - ringZ;
        if (dx * dx + dz * dz <= RING.radiusWu * RING.radiusWu) {
          const hits = latchFlag(state, 'shadow_ring_hits', 0) + 1;
          state.story.flags.shadow_ring_hits = hits;
          state.story.flags.shadow_ring_lit_day = day;
          this._cueLamp(d, state, live);
          live.vars.lastCueAt = now;
          if (live.vars.saidToday !== day) {
            live.vars.saidToday = day;
            d.say(live, 'info',
              'The dead lamp lights. Somewhere, whoever painted the ring is either watching '
              + 'or long gone, and the lamp does not care which.',
              null, { literal: true });
          }
          if (hits === RING.paintHits && flags.shadow_ring_paint == null) {
            state.story.flags.shadow_ring_paint = Number(state.simTime) || 0;
            d.say(live, 'info',
              'Fresh paint under the ring, dry by morning: STILL GOT IT.',
              null, { literal: true });
          }
        }
      }
    }
    if (now >= (live.vars.startedAt || 0) + 900) return d.abort(live, 'stood_down');
    return null;
  },

  // One beat through the vfx owner's cue admission — the same seam the spectacle registry
  // uses; reduced-motion drops it to the reduced variant inside the owner, never here.
  _cueLamp(d, state, live) {
    const pos = live.vars.lampPos;
    if (!pos) return;
    const settings = state && state.settings;
    const v = settings && settings.video;
    const a = settings && settings.accessibility;
    const flashReduced = !!((v && (v.motionReduce || v.flashReduce)) || (a && a.flashReduce));
    d.emit('presentation:vfxCue', {
      id: 'special500.light',
      lane: 'special500',
      particles: 0,
      lights: 1,
      position: { x: pos.x, z: pos.z },
      magnitude: 0.6,
      material: 'special500',
      flashReduced,
    });
  },

  event() {}, // the ring takes no part in the fight; it keeps the minute
});

export default defineEncounter(trigger, {
  shape: {
    situation: 'wreck',
    place: 'derelict_field',
    twist: 'named',
    actor: 'faction_free',
  },
  title: 'THE SHADOW RING',
  factionId: 'faction_free',
  motive: 'a pure-flying ritual with no reward but the lamp and the paint',
  choices: [],
});
