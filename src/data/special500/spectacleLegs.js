// src/data/special500/spectacleLegs.js — the spectacle presentation registry.
//
// Phase 2 leg family "spectacle" (design/program/special-500/PHASE2_BUILD_BRIEF.md):
// each row maps one ratified catalog entry id to the authored visual/wire moment that
// entry's `sees` line promises. The runtime owner is src/systems/special500Spectacle.js;
// it subscribes 'special500:spectacle' (one emission per director firing) and plays this
// row's steps off state.simTime. Rendering/wire always goes through the EXISTING owner
// seams — there is no second render pipeline and no new shader code here:
//
//   lightFlash      → bus 'presentation:vfxCue' { id: 'special500.light', lights: 1 } —
//                     the vfx owner's default cue light (one distant secondary light
//                     point at the authored position). The light's colour/peak identity
//                     is the presentation owner's default cue identity; the payload
//                     cannot re-tint it. Honest scoping, not a bypass.
//   echoRing        → bus 'presentation:vfxCue' { id: 'thermal.mark', kind: 'thermalMark' }
//                     — the fields system's bloom-independent ring contract: authored
//                     colour, radius (owner clamps 1.5–160 WU), life (owner clamps
//                     0.15–4 s). One delayed radar/comms echo pulse; the delay is the
//                     step's atS.
//   lampCascade     → expanded into N lightFlash beats walking an axis (bow → stern).
//                     NOTE the honest shortfall: the authored "lamp-bus envelope
//                     sequence on one wreck package" needs Forge variant finishes on the
//                     wreck's window rows (asset work), so the cascade walks event-light
//                     points instead; the "hold dark" half of a blackout is the loop's
//                     silent remainder — additive VFX cannot darken.
//   trafficAdvisory → bus 'news:publish' — a logged advisory on the news wire (the
//                     owner surface the entry's seam names). Text-only, no motion.
//   bellVoice      → bus 'audio:cue' { id: recipe, gain, rate, position } — the audio
//                     owner's generic cue admission (audioSystem._onCue resolves the id
//                     through AUDIO_RECIPE_BY_ID and plays it with gain/rate/position).
//                     One diegetic bell/horn note from an EXISTING recipe; `rate` is the
//                     house transposition, `position` the anchor (the chime comes from the
//                     station's direction in space). The owner decides its own mute/mix
//                     rules — this file only emits the cue, never a second audio graph.
//
// Accessibility: every cue payload carries flashReduced (same two-gate read of
// state.settings as bombs.js/hullBurst.js) and the vfx owner renders its reduced
// variant — this file never bypasses vfxAccessibility. Audio cues carry no flash:
// the audio owner's own mix/mute rules own the ear, exactly as for any other cue.
//
// Determinism: rows are frozen pure data; the system schedules every beat from
// state.simTime (loop = pure simTime modulo). No rng, no wall time.

import { zonesForSector } from '../sectorZones.js';
import { RECIPES } from '../audioRecipes.js';
import { SPECIAL500_ALL } from './index.js';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/**
 * The template set: what each template means and the exact param contract the owner
 * seam supports. The system refuses (skips) a step whose template is not in this table.
 */
export const SPECTACLE_TEMPLATES = Object.freeze({
  lightFlash: Object.freeze({
    meaning: 'one distant secondary light point at the authored position',
    seam: "bus 'presentation:vfxCue' { id: 'special500.light', lights: 1 }",
    params: Object.freeze({
      offsetWu: 'WU along the row bearing from the anchor (finite, |x| <= 2000)',
      magnitude: 'advisory magnitude 0.1..6 (scales the cue radius read, not the light colour)',
    }),
  }),
  echoRing: Object.freeze({
    meaning: 'one delayed radar/comms echo pulse — a coloured ring at the anchor',
    seam: "bus 'presentation:vfxCue' { id: 'thermal.mark', kind: 'thermalMark' }",
    params: Object.freeze({
      color: 'authored hex colour the vfx owner renders the ring in',
      radiusWu: 'ring radius 1.5..160 WU (owner clamps)',
      lifeS: 'ring life 0.15..4 s (owner clamps)',
    }),
  }),
  lampCascade: Object.freeze({
    meaning: 'a walk of light points along the row bearing (bow to stern); expanded to lightFlash beats',
    seam: "expanded to N × 'lightFlash' beats at stepS intervals",
    params: Object.freeze({
      count: 'beats 2..6 (integer)',
      lengthWu: 'axis length 4..400 WU, centred on the anchor',
      stepS: 'seconds between beats 0.2..4',
    }),
  }),
  trafficAdvisory: Object.freeze({
    meaning: 'a logged advisory on the news wire — the world treats the moment as real',
    seam: "bus 'news:publish' { text, kind, source, sourceRef, eventId }",
    params: Object.freeze({
      text: 'the advisory line (1..400 chars, game voice)',
      source: 'wire source label (default watch-relay)',
      kind: 'news kind (default incidents)',
    }),
  }),
  bellVoice: Object.freeze({
    meaning: 'one diegetic bell/horn note from an EXISTING audio recipe, transposed and '
      + 'spatialized at the anchor',
    seam: "bus 'audio:cue' { id: recipe, gain, rate, position, duck, duckSeconds } — the "
      + "audio owner's generic cue admission (audioSystem._onCue → play(rid, { gain, rate, "
      + 'position })). `rate` is the house transposition (0.5 = one octave down); the mix, '
      + 'mute and caption rules stay the audio owner\'s.',
    params: Object.freeze({
      recipe: 'an id that exists in src/data/audioRecipes.js RECIPES (validated live)',
      gain: 'voice gain 0.05..1 (owner default 0.8)',
      rate: 'playback rate = pitch transposition 0.5..2 (1 = written pitch)',
      duck: 'optional true = the audio owner ducks the music bed for duckSeconds (0..600)',
      duckSeconds: 'music-duck hold seconds 0..600, only forwarded with duck: true',
    }),
  }),
});

export const SPECTACLE_TEMPLATE_IDS = Object.freeze(Object.keys(SPECTACLE_TEMPLATES));

// One spectacle row per catalog entry id. Fields:
//   title     display title (echoes the catalog entry)
//   anchor    where the moment lives: { sectorId, zoneId } (static zone data) or
//             { sectorId, poiId } / { sectorId, stationId } (world-materialized)
//   bearingRad  sector-frame direction of the row's axis (lane crossing, keel line)
//   loopS     0 = play once per firing; > 0 = the whole row repeats on a pure
//             simTime modulo of this many seconds (steps sit inside the lit window,
//             the remainder holds dark)
//   spanS     authored length of the lit window (validator: every step fits inside)
//   steps     [{ atS, template, params }] — atS within the lit window; expanded
//             templates (lampCascade) are expanded by the runtime owner.
const ROWS = {
  // SP1-101 — The Scheduled Ghost. The convoy that no longer exists crosses the
  // sector's patrolled corridor on its seeded schedule (calendar dayOfYear 13, a
  // 15 s window, re-armed yearly): sensors paint once (echo ring), three running
  // lights walk the lane, and the advisory board logs the arrival it cannot see.
  // Charon Expanse has no patrol_corridor-typed zone; the Cinder Refinery approach
  // is the sector's only patrolled corridor (P.patrol presence), so the ghost
  // crosses that lane.
  'SP1-101': Object.freeze({
    title: 'The Scheduled Ghost',
    anchor: Object.freeze({ sectorId: 'sector_charon_expanse', zoneId: 'zone_charon_refinery' }),
    bearingRad: 0.9,
    loopS: 0,
    spanS: 8,
    steps: Object.freeze([
      Object.freeze({ atS: 0.4, template: 'echoRing', params: Object.freeze({ color: '#8fe0a8', radiusWu: 90, lifeS: 2.2 }) }),
      Object.freeze({ atS: 1.6, template: 'lightFlash', params: Object.freeze({ offsetWu: -36, magnitude: 1 }) }),
      Object.freeze({ atS: 3.2, template: 'lightFlash', params: Object.freeze({ offsetWu: 0, magnitude: 1 }) }),
      Object.freeze({ atS: 4.8, template: 'lightFlash', params: Object.freeze({ offsetWu: 36, magnitude: 1 }) }),
      Object.freeze({
        atS: 6.0,
        template: 'trafficAdvisory',
        params: Object.freeze({
          source: 'charon-traffic',
          text: "TRAFFIC ADVISORY · Cinder Refinery approach — nine-hull convoy crossing the lane, line astern. Arrivals logged; right-of-way granted. No transponder, no hulls on scan. The board thanks the convoy for its cooperation and notes, for the record: it has never been late.",
        }),
      }),
    ]),
  }),

  // SP3-127 — The Echo Wreck. One hull in the Cruiser Graveyard replays its final
  // minute in light only, on a clean 60 s cycle: the scan sweep (a wide cold ring),
  // a panic of strobes, a cascade walking the keel bow to stern — then forty dark
  // seconds (the loop's silent remainder) before it starts over. The authored
  // lamp-bus envelope on the wreck package needs Forge variant finishes on the
  // wreck's window rows, so the cascade walks event-light points; the zone centre
  // of the Graveyard stands in for the seeded hull's scatter position.
  'SP3-127': Object.freeze({
    title: 'The Echo Wreck',
    anchor: Object.freeze({ sectorId: 'sector_io_reach', zoneId: 'zone_io_derelict' }),
    bearingRad: 2.4,
    loopS: 60,
    spanS: 20,
    steps: Object.freeze([
      Object.freeze({ atS: 0.6, template: 'echoRing', params: Object.freeze({ color: '#7ec8e8', radiusWu: 160, lifeS: 3.6 }) }),
      Object.freeze({ atS: 6.4, template: 'lightFlash', params: Object.freeze({ offsetWu: -18, magnitude: 1 }) }),
      Object.freeze({ atS: 7.8, template: 'lightFlash', params: Object.freeze({ offsetWu: 22, magnitude: 1 }) }),
      Object.freeze({ atS: 8.7, template: 'lightFlash', params: Object.freeze({ offsetWu: -6, magnitude: 1 }) }),
      Object.freeze({ atS: 9.4, template: 'lightFlash', params: Object.freeze({ offsetWu: 10, magnitude: 1 }) }),
      Object.freeze({ atS: 12.0, template: 'lampCascade', params: Object.freeze({ count: 4, lengthWu: 96, stepS: 1.4 }) }),
    ]),
  }),

  // SP3-002 — The Umbra Minute. Once per 40-day year a background moon crosses the
  // key-light line in Helios Prime for ~45 s. HONEST SCOPING: the key-light dim/warm/
  // clean-return envelope is look-mood work (the lookMoods overlay seam) and additive
  // VFX cannot darken — so this row renders the half of the picture that IS additive:
  // the lonely lights. Through the umbra minute the station's window rows and nav lamps
  // come up one by one and carry the frame; the beats stop before the window ends, and
  // the sun's return is the silence after the last lamp lets go.
  'SP3-002': Object.freeze({
    title: 'The Umbra Minute',
    anchor: Object.freeze({ sectorId: 'sector_helios_prime', zoneId: 'zone_helios_core' }),
    bearingRad: 1.1,
    loopS: 0,
    spanS: 40,
    steps: Object.freeze([
      Object.freeze({ atS: 1.0, template: 'lightFlash', params: Object.freeze({ offsetWu: -60, magnitude: 0.7 }) }),
      Object.freeze({ atS: 4.0, template: 'lightFlash', params: Object.freeze({ offsetWu: 20, magnitude: 0.9 }) }),
      Object.freeze({ atS: 9.0, template: 'lampCascade', params: Object.freeze({ count: 4, lengthWu: 140, stepS: 2.2 }) }),
      Object.freeze({ atS: 20.0, template: 'lightFlash', params: Object.freeze({ offsetWu: 70, magnitude: 0.6 }) }),
      Object.freeze({ atS: 27.0, template: 'lampCascade', params: Object.freeze({ count: 3, lengthWu: 90, stepS: 2.0 }) }),
    ]),
  }),

  // SP3-081 — The Slow Kiss. The wire predicted the minute six days out and the wire
  // was right: the Marnie's Pride and the hulk she killed touch near the Ashfall picket
  // redoubt (the redoubt sits on the gateward shoulder of zone_ashfall_approach). One
  // deep flash rolls both keels, a slow ring is the silent blossom of plates, and the
  // wire reads the obituary of a collision nobody caused. HONEST SCOPING: the two
  // durable wreck records with seeded drift (world.records) and the explosionShear
  // light family are the durable-world leg; this row renders the impact minute at the
  // redoubt's shoulder. The T-minus-six prediction line is the entry's own comms tell.
  'SP3-081': Object.freeze({
    title: 'The Slow Kiss',
    anchor: Object.freeze({ sectorId: 'sector_ashfall_reach', zoneId: 'zone_ashfall_approach' }),
    bearingRad: 0.35,
    loopS: 0,
    spanS: 12,
    steps: Object.freeze([
      Object.freeze({ atS: 0.5, template: 'lightFlash', params: Object.freeze({ offsetWu: -20, magnitude: 5 }) }),
      Object.freeze({ atS: 1.2, template: 'lightFlash', params: Object.freeze({ offsetWu: 24, magnitude: 4.5 }) }),
      Object.freeze({ atS: 2.2, template: 'echoRing', params: Object.freeze({ color: '#e8b26a', radiusWu: 160, lifeS: 4 }) }),
      Object.freeze({ atS: 6.0, template: 'lightFlash', params: Object.freeze({ offsetWu: 0, magnitude: 1.2 }) }),
      Object.freeze({
        atS: 9.5,
        template: 'trafficAdvisory',
        params: Object.freeze({
          source: 'ashfall-wire',
          text: "SECTOR WIRE · Ashfall Reach — the Marnie's Pride and the hulk she killed have touched near the redoubt, exactly as filed six days ago. Two wrecks where the charts showed two wrecks. The obituary runs at the top of the hour: no crew, no fault, no survivor. The wire thanks the pilots who came out to watch, and notes the plates are still settling.",
        }),
      }),
    ]),
  }),

  // SP3-024 — Ring Rain. Meteor-shower season off the Anvil's influence edge: bright
  // streaks peel off and fall sunward toward the disc in slow file — the planet visibly
  // eating its own ring. The row loops on a surge cadence: a file walks the sunward
  // bearing off the Anvil's centre, a second file follows, and the silent remainder is
  // the gap between surges. HONEST SCOPING: the surviving stones becoming ordinary
  // minable rock (the weatherMeteors slot book) is the mechanic leg; this row renders
  // the visible fall. bearingRad is the authored sunward bearing of the Tethys frame.
  'SP3-024': Object.freeze({
    title: 'Ring Rain',
    anchor: Object.freeze({ sectorId: 'sector_tethys_junction', zoneId: 'zone_tethys_anvil' }),
    bearingRad: 2.4,
    loopS: 44,
    spanS: 26,
    steps: Object.freeze([
      Object.freeze({ atS: 1.0, template: 'lampCascade', params: Object.freeze({ count: 5, lengthWu: 300, stepS: 3.4 }) }),
      Object.freeze({ atS: 18.0, template: 'lampCascade', params: Object.freeze({ count: 4, lengthWu: 260, stepS: 2.6 }) }),
    ]),
  }),

  // SP3-010 — Ring-Plane Flash. Cross the ring plane while the ring is backlit and the
  // disc collapses to a hairline, then blooms into a broad glare band — dust acting like
  // dust, zero threat. HONEST SCOPING: the background compositor's ring rendering
  // (spaceBackground.js) owns the optical collapse; this row renders the moment's light
  // as the cue seam gives it — one hard white point (the collapsed edge-on disc) and a
  // wide slow ring (the bloom opening) at the customs corridor, where pilots actually fly.
  'SP3-010': Object.freeze({
    title: 'Ring-Plane Flash',
    anchor: Object.freeze({ sectorId: 'sector_helios_prime', zoneId: 'zone_helios_lane' }),
    bearingRad: 0.6,
    loopS: 0,
    spanS: 10,
    steps: Object.freeze([
      Object.freeze({ atS: 0.5, template: 'lightFlash', params: Object.freeze({ offsetWu: 0, magnitude: 6 }) }),
      Object.freeze({ atS: 3.0, template: 'echoRing', params: Object.freeze({ color: '#f2f0e4', radiusWu: 160, lifeS: 4 }) }),
      Object.freeze({ atS: 6.5, template: 'lightFlash', params: Object.freeze({ offsetWu: 40, magnitude: 2 }) }),
    ]),
  }),

  // SP3-170 — The Breath of the Veil. The nebula plates swell a step and settle on the
  // sector-day clock (600 s) — the sector's resting respiration. HONEST SCOPING: the
  // paintedSky plate-strength sinusoid is the authored leg (compositor work on the sky
  // resolve path); this row renders the breath's instrument tell — one slow wide ring
  // at the swell and a dimmer one at the settle, once per sector-day, in the fog the
  // radar cannot make up its mind about. The dark remainder IS the hold between breaths.
  'SP3-170': Object.freeze({
    title: 'The Breath of the Veil',
    anchor: Object.freeze({ sectorId: 'sector_veil_nebula', zoneId: 'zone_veil_fog' }),
    bearingRad: 0,
    loopS: 600,
    spanS: 8,
    steps: Object.freeze([
      Object.freeze({ atS: 0.5, template: 'echoRing', params: Object.freeze({ color: '#9a7fd0', radiusWu: 160, lifeS: 4 }) }),
      Object.freeze({ atS: 5.0, template: 'echoRing', params: Object.freeze({ color: '#6a5390', radiusWu: 90, lifeS: 3 }) }),
    ]),
  }),

  // SP3-003 — The Unannounced Flare. Once per 7-day season at a hash-picked minute the
  // sun doubles for six seconds — a hard secondary point beside the key. The cue light
  // IS a hard secondary point of light, so this is the seam the moment was made for:
  // two beats holding the secondary burning at its authored offset, a short white ring
  // for the spark-line flicker, then it just stops — unannounced, unexplained.
  // HONEST SCOPING: the second faint shadow and the white-hot spark line on hull edges
  // are look/rig work; the doubled sun renders as the cue-light pair. The apron hands
  // set their coffee by it anyway.
  'SP3-003': Object.freeze({
    title: 'The Unannounced Flare',
    anchor: Object.freeze({ sectorId: 'sector_ceres_belt', zoneId: 'zone_ceres_refinery' }),
    bearingRad: -0.5,
    loopS: 0,
    spanS: 8,
    steps: Object.freeze([
      Object.freeze({ atS: 0.5, template: 'lightFlash', params: Object.freeze({ offsetWu: 120, magnitude: 6 }) }),
      Object.freeze({ atS: 2.0, template: 'lightFlash', params: Object.freeze({ offsetWu: 124, magnitude: 5.5 }) }),
      Object.freeze({ atS: 4.5, template: 'echoRing', params: Object.freeze({ color: '#ffffff', radiusWu: 40, lifeS: 1.5 }) }),
    ]),
  }),

  // SP3-155 — The Slow Lens. Stars near one empty point smear into short arcs; hulls on
  // the arc's line catch a faint blue rim; fly the exact line and the predictor bows.
  // HONEST SCOPING: the star-smear is background structure-warp work and the predictor
  // bow is gameplay leg — this row renders the fold this registry can carry: SP3-032's
  // survey-buoy lamp ripple (lamps only — the structure has never moved). The Well
  // Seams' buoy line ripples on a slow loop; the dark remainder is the ripple idling off.
  'SP3-155': Object.freeze({
    title: 'The Slow Lens',
    anchor: Object.freeze({ sectorId: 'sector_proteus_well', zoneId: 'zone_proteus_seams' }),
    bearingRad: 1.9,
    loopS: 24,
    spanS: 14,
    steps: Object.freeze([
      Object.freeze({ atS: 1.0, template: 'lampCascade', params: Object.freeze({ count: 4, lengthWu: 60, stepS: 2.6 }) }),
      Object.freeze({ atS: 9.0, template: 'lightFlash', params: Object.freeze({ offsetWu: -30, magnitude: 0.4 }) }),
    ]),
  }),

  // SP1-062 — The Intake Ballet. Shift turn at the Forge refinery: the ore barges pour
  // into one slow spiral, each shedding exactly on the horn, tugs correcting the
  // off-key ones. The row loops on the queue cadence: the shift horn at the head, the
  // queue's running lights walking the spiral bearing, one short correction pulse.
  // HONEST SCOPING: the barges and tugs themselves are NPC spawn work (the numbered
  // ambient encounter leg) and the tower's acknowledgment is the encounter's payoff —
  // this row is the ballet as the lane sees it: horn, lights, shoves.
  'SP1-062': Object.freeze({
    title: 'The Intake Ballet',
    anchor: Object.freeze({ sectorId: 'sector_vesta_forge', zoneId: 'zone_vesta_forge' }),
    bearingRad: 2.9,
    loopS: 26,
    spanS: 18,
    steps: Object.freeze([
      Object.freeze({ atS: 0.5, template: 'bellVoice', params: Object.freeze({ recipe: 'sfx_hauler_horn_fund', gain: 0.5, rate: 1 }) }),
      Object.freeze({ atS: 2.0, template: 'lampCascade', params: Object.freeze({ count: 5, lengthWu: 240, stepS: 2.6 }) }),
      Object.freeze({ atS: 15.0, template: 'lightFlash', params: Object.freeze({ offsetWu: -100, magnitude: 0.8 }) }),
    ]),
  }),

  // SP3-006 — The Lantern Winks. Founders' Day, at the shift turn after the Charter
  // reading: the dominant lit mass painted into the sector's sky brightens and lets
  // go, once. (SP3-020's Quiet Night double-pulse stays lore — the entry text says
  // nobody has caught it again, so the row winks exactly once.) HONEST SCOPING: the
  // painted-sky plate strength pulse is compositor work on the sky resolve path; this
  // row renders the wink as cue light at the plate's bearing — one hard brightening,
  // a wide warm ring swelling out, a dimmer ring as the glow lets go — then the plate
  // is back to its held strength and the sky keeps its secret for another year.
  'SP3-006': Object.freeze({
    title: 'The Lantern Winks',
    anchor: Object.freeze({ sectorId: 'sector_helios_prime', zoneId: 'zone_helios_core' }),
    bearingRad: -1.2,
    loopS: 0,
    spanS: 14,
    steps: Object.freeze([
      Object.freeze({ atS: 1.0, template: 'lightFlash', params: Object.freeze({ offsetWu: 0, magnitude: 6 }) }),
      Object.freeze({ atS: 1.5, template: 'echoRing', params: Object.freeze({ color: '#f5e6c8', radiusWu: 160, lifeS: 4 }) }),
      Object.freeze({ atS: 7.0, template: 'echoRing', params: Object.freeze({ color: '#c8b088', radiusWu: 100, lifeS: 3.5 }) }),
    ]),
  }),

  // SP3-106 — The Quiet Night Itself. The smuggler berths lower their lamps to the
  // floor for the day — not dark, just lowered — and at the night's center minute the
  // whole berth ducks nine ticks deeper and holds. HONEST SCOPING: additive VFX cannot
  // darken and the floor-gain override is lamp-bus work, so the lowered lamps render as
  // three window-row beats at floor magnitude (the lowest the cue light burns); the
  // center minute is the audio owner's own priority-duck seam — one low bell voice that
  // ducks the music bed and holds it, the way the arguments wait. The wire keeps its
  // voice down too. Sker's berths keep the day in story; this row renders the Den.
  'SP3-106': Object.freeze({
    title: 'The Quiet Night Itself',
    anchor: Object.freeze({ sectorId: 'sector_pallas_drift', stationId: 'station_smuggler' }),
    bearingRad: 1.6,
    loopS: 0,
    spanS: 320,
    steps: Object.freeze([
      Object.freeze({ atS: 1.0, template: 'lightFlash', params: Object.freeze({ offsetWu: -40, magnitude: 0.15 }) }),
      Object.freeze({ atS: 2.5, template: 'lightFlash', params: Object.freeze({ offsetWu: 0, magnitude: 0.2 }) }),
      Object.freeze({ atS: 4.0, template: 'lightFlash', params: Object.freeze({ offsetWu: 40, magnitude: 0.15 }) }),
      Object.freeze({
        atS: 5.0,
        template: 'trafficAdvisory',
        params: Object.freeze({
          source: 'berth board',
          kind: 'notices',
          text: 'QUIET HOURS · Smuggler berths — lamps at floor gain until further notice. Window rows at half. Docking without floodlights. No, the band is not broken; it is being polite. Normal volume resumes when it resumes.',
        }),
      }),
      Object.freeze({
        atS: 300.0,
        template: 'bellVoice',
        params: Object.freeze({ recipe: 'ambient_station_shift_bell', gain: 0.08, rate: 0.5, duck: true, duckSeconds: 60 }),
      }),
    ]),
  }),

  // SP3-144 — The Time Signal. Four notes, the same four, at every station's shift
  // turn, pitch-shifted per station until each berth has its own voice. The cue seam's
  // `rate` IS the house transposition: this row voices the Helios figure on the shift
  // bell (an ascending fourth the old hands can set a watch by). HONEST SCOPING: the
  // full per-station pitch table is a per-station row pass (one row per berth), the
  // whistle and the handoff mumble are band voices off this seam, and a stationId
  // anchor plays only where that berth is materialized — elsewhere the comms tell
  // carries the day. Docked, the notes come from the station's direction in space.
  'SP3-144': Object.freeze({
    title: 'The Time Signal',
    anchor: Object.freeze({ sectorId: 'sector_helios_prime', stationId: 'station_helios' }),
    bearingRad: 0,
    loopS: 0,
    spanS: 8,
    steps: Object.freeze([
      Object.freeze({ atS: 0.5, template: 'bellVoice', params: Object.freeze({ recipe: 'ambient_station_shift_bell', gain: 0.7, rate: 0.841 }) }),
      Object.freeze({ atS: 2.0, template: 'bellVoice', params: Object.freeze({ recipe: 'ambient_station_shift_bell', gain: 0.7, rate: 1.0 }) }),
      Object.freeze({ atS: 3.5, template: 'bellVoice', params: Object.freeze({ recipe: 'ambient_station_shift_bell', gain: 0.7, rate: 1.122 }) }),
      Object.freeze({ atS: 5.0, template: 'bellVoice', params: Object.freeze({ recipe: 'ambient_station_shift_bell', gain: 0.7, rate: 1.335 }) }),
    ]),
  }),

  // SP3-182 — The Market Bells. Market day at the Meridian Exchange: open bright,
  // close low, and the third stroke — the one the auction floor put up for — rolls the
  // lamp cascade down the station spine. HONEST SCOPING: the starmap's price-fold
  // pulse is UI work off this seam; the bells and the spine cascade are the market's
  // gong. The Exchange's own chime recipe is the counter bell the books describe; the
  // close is the same bell one octave down. The receipt trigger fires wherever the
  // pilot is; the gong itself lives at the Exchange.
  'SP3-182': Object.freeze({
    title: 'The Market Bells',
    anchor: Object.freeze({ sectorId: 'sector_tethys_junction', stationId: 'station_tethys' }),
    bearingRad: 0.75,
    loopS: 0,
    spanS: 16,
    steps: Object.freeze([
      Object.freeze({ atS: 0.5, template: 'bellVoice', params: Object.freeze({ recipe: 'ambient_station_market_chime', gain: 0.75, rate: 1.0 }) }),
      Object.freeze({ atS: 1.4, template: 'bellVoice', params: Object.freeze({ recipe: 'ambient_station_market_chime', gain: 0.65, rate: 1.0 }) }),
      Object.freeze({ atS: 5.0, template: 'bellVoice', params: Object.freeze({ recipe: 'ambient_station_market_chime', gain: 0.7, rate: 0.5 }) }),
      Object.freeze({ atS: 8.5, template: 'bellVoice', params: Object.freeze({ recipe: 'ambient_station_market_chime', gain: 0.8, rate: 1.0 }) }),
      Object.freeze({ atS: 9.0, template: 'lampCascade', params: Object.freeze({ count: 4, lengthWu: 220, stepS: 1.5 }) }),
    ]),
  }),

  // SP3-151 — The 40-Day Chord. The year's last minute: every station's time signal
  // fires at once, each in its own house key, and the overlap swells into one broad
  // chord that decays into the new year's silence. Six stacked voices at the berth
  // transpositions the rows author (the same figure SP3-144 voices, in every house
  // key at once), a softer round swelling under it — then the dark remainder is the
  // silence the new year begins in. Under it, the wire reads the year in numbers,
  // exactly once, none of it explained.
  'SP3-151': Object.freeze({
    title: 'The 40-Day Chord',
    anchor: Object.freeze({ sectorId: 'sector_helios_prime', stationId: 'station_helios' }),
    bearingRad: 0,
    loopS: 0,
    spanS: 14,
    steps: Object.freeze([
      Object.freeze({ atS: 0.5, template: 'bellVoice', params: Object.freeze({ recipe: 'ambient_station_shift_bell', gain: 0.5, rate: 0.841 }) }),
      Object.freeze({ atS: 0.6, template: 'bellVoice', params: Object.freeze({ recipe: 'ambient_station_shift_bell', gain: 0.5, rate: 1.0 }) }),
      Object.freeze({ atS: 0.7, template: 'bellVoice', params: Object.freeze({ recipe: 'ambient_station_shift_bell', gain: 0.5, rate: 1.122 }) }),
      Object.freeze({ atS: 0.8, template: 'bellVoice', params: Object.freeze({ recipe: 'ambient_station_shift_bell', gain: 0.45, rate: 1.335 }) }),
      Object.freeze({ atS: 0.9, template: 'bellVoice', params: Object.freeze({ recipe: 'ambient_station_shift_bell', gain: 0.4, rate: 0.5 }) }),
      Object.freeze({ atS: 1.0, template: 'bellVoice', params: Object.freeze({ recipe: 'ambient_station_shift_bell', gain: 0.35, rate: 1.5 }) }),
      Object.freeze({ atS: 2.4, template: 'bellVoice', params: Object.freeze({ recipe: 'ambient_station_shift_bell', gain: 0.3, rate: 1.0 }) }),
      Object.freeze({ atS: 2.6, template: 'bellVoice', params: Object.freeze({ recipe: 'ambient_station_shift_bell', gain: 0.25, rate: 1.122 }) }),
      Object.freeze({
        atS: 1.0,
        template: 'trafficAdvisory',
        params: Object.freeze({
          source: 'year-end wire',
          text: "YEAR'S END WIRE — the books close on another forty days: every ton moved, every hull lost, every debt carried forward, read into the chord exactly once, all of it sung and none of it explained. The new year opens in the silence after it. You may set your watch by the silence.",
        }),
      }),
    ]),
  }),

  // SP3-085 — All the Bells. Forge Due: the Eighth Bell tolls and, two seconds behind
  // each toll, the sector's window rows flash once in a traveling wave — the toll
  // physically passing through the infrastructure. Out in Ceres and Sker the yard
  // bells answer one octave down. The toll recipe is the one the Eighth Bell encounter
  // already ships; the answers are the yard bells at half pitch. The row loops on the
  // toll cadence through the festival window. HONEST SCOPING: "one toll per sector in
  // sequence" crosses three sectors and one anchor cannot stand in all of them — the
  // row plays the toll and the wave at the Forge, with the answers arriving over the
  // lanes as the octave-down voices. The five-stack whistle phrase and the books-closed
  // lamp step are band/lamp-bus work off this seam.
  'SP3-085': Object.freeze({
    title: 'All the Bells',
    anchor: Object.freeze({ sectorId: 'sector_vesta_forge', zoneId: 'zone_vesta_forge' }),
    bearingRad: 0.2,
    loopS: 45,
    spanS: 16,
    steps: Object.freeze([
      Object.freeze({ atS: 0.5, template: 'bellVoice', params: Object.freeze({ recipe: 'sfx_eighth_bell_toll', gain: 0.9, rate: 1.0 }) }),
      Object.freeze({ atS: 2.5, template: 'lampCascade', params: Object.freeze({ count: 5, lengthWu: 280, stepS: 0.9 }) }),
      Object.freeze({ atS: 9.0, template: 'bellVoice', params: Object.freeze({ recipe: 'sfx_core_bell', gain: 0.5, rate: 0.5 }) }),
      Object.freeze({ atS: 10.5, template: 'bellVoice', params: Object.freeze({ recipe: 'sfx_core_bell', gain: 0.4, rate: 0.5 }) }),
    ]),
  }),
};

export const SPECTACLE_LEGS = Object.freeze(ROWS);

/** Numeric bounds per template param; everything here must stay owner-clamp-compatible. */
const PARAM_BOUNDS = Object.freeze({
  lightFlash: Object.freeze({ offsetWu: [-2000, 2000], magnitude: [0.1, 6] }),
  echoRing: Object.freeze({ radiusWu: [1.5, 160], lifeS: [0.15, 4] }),
  lampCascade: Object.freeze({ count: [2, 6], lengthWu: [4, 400], stepS: [0.2, 4] }),
  bellVoice: Object.freeze({ gain: [0.05, 1], rate: [0.5, 2] }),
});

// The live recipe-id set: a bellVoice step may only voice a recipe the audio owner
// actually ships. Built once from the pure-data RECIPES table (src/data/AGENTS.md: no
// side effects, no renderer imports — audioRecipes.js is data only).
const AUDIO_RECIPE_IDS = new Set(RECIPES.map((r) => r && r.id).filter(Boolean));

/**
 * Validate the registry against the live catalog. Returns human-readable problems
 * (empty = valid): every row id is a live spectacle-channel catalog entry, every
 * template is known, every numeric param is finite inside its owner bounds, anchors
 * name real zones, and every step fits the row's lit window.
 */
export function validateSpectacleLegs(entries = SPECIAL500_ALL) {
  const problems = [];
  const byId = new Map(Array.isArray(entries) ? entries.map((e) => [e.id, e]) : []);
  for (const [id, row] of Object.entries(SPECTACLE_LEGS)) {
    const entry = byId.get(id);
    if (!entry) { problems.push(`${id}: row has no catalog entry`); continue; }
    if (entry.dormant) problems.push(`${id}: row on a dormant entry`);
    if (entry.channel !== 'spectacle') problems.push(`${id}: catalog channel is ${entry.channel}, not spectacle`);
    if (entry.sectors && entry.sectors.length && !entry.sectors.includes(row.anchor && row.anchor.sectorId)) {
      problems.push(`${id}: anchor sector ${row.anchor && row.anchor.sectorId} outside the entry's sectors`);
    }
    const anchor = row.anchor || {};
    const zoneIds = new Set(zonesForSector(anchor.sectorId).map((z) => z && z.id));
    if (anchor.zoneId && !zoneIds.has(anchor.zoneId)) problems.push(`${id}: anchor zone ${anchor.zoneId} does not exist in ${anchor.sectorId}`);
    if (!Number.isFinite(row.bearingRad)) problems.push(`${id}: bearingRad not finite`);
    if (!(Number.isFinite(row.loopS) && row.loopS >= 0)) problems.push(`${id}: loopS must be >= 0`);
    if (!(Number.isFinite(row.spanS) && row.spanS > 0)) problems.push(`${id}: spanS must be > 0`);
    if (!Array.isArray(row.steps) || !row.steps.length) { problems.push(`${id}: no steps`); continue; }
    for (const step of row.steps) {
      const at = `${id}@${step && step.atS}`;
      if (!Number.isFinite(step.atS) || step.atS < 0) { problems.push(`${at}: atS out of range`); continue; }
      if (step.atS > row.spanS) problems.push(`${at}: step outside the lit window`);
      if (row.loopS > 0 && row.loopS <= row.spanS) problems.push(`${id}: loopS must exceed the lit window (the dark half is the remainder)`);
      if (!SPECTACLE_TEMPLATES[step.template]) { problems.push(`${at}: unknown template ${step.template}`); continue; }
      const p = step.params || {};
      if (step.template === 'trafficAdvisory') {
        const text = String(p.text || '');
        if (!text.trim() || text.length > 400) problems.push(`${at}: advisory text 1..400 chars`);
        if (p.source != null && !String(p.source).trim()) problems.push(`${at}: empty advisory source`);
      } else {
        for (const [key, [lo, hi]] of Object.entries(PARAM_BOUNDS[step.template] || {})) {
          const v = p[key];
          if (!Number.isFinite(v) || v < lo || v > hi) problems.push(`${at}: ${key} ${v} outside ${lo}..${hi}`);
        }
        if (step.template === 'lampCascade' && !(Number.isInteger(p.count) && p.count >= 2)) {
          problems.push(`${at}: cascade count must be an integer >= 2`);
        }
      }
      if (step.template === 'echoRing' && !HEX_COLOR.test(String(p.color || ''))) {
        problems.push(`${at}: echoRing needs a #rrggbb colour`);
      }
      if (step.template === 'bellVoice') {
        if (!AUDIO_RECIPE_IDS.has(p.recipe)) problems.push(`${at}: bellVoice recipe ${p.recipe} is not a live audio recipe`);
        if (p.duck != null && p.duck !== true) problems.push(`${at}: bellVoice duck must be true or omitted`);
        if (p.duckSeconds != null && (!Number.isFinite(p.duckSeconds) || p.duckSeconds < 0 || p.duckSeconds > 600)) {
          problems.push(`${at}: bellVoice duckSeconds 0..600`);
        }
      }
    }
  }
  return problems;
}
