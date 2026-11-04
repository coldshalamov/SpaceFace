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
//                     One diegetic note from an EXISTING recipe — bell, horn, machine,
//                     fauna, radio or impact voice; `rate` is the house transposition,
//                     `position` the anchor (the note comes from its place in space).
//                     The owner decides its own mute/mix rules — this file only emits
//                     the cue, never a second audio graph.
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
    meaning: 'one diegetic note from an EXISTING audio recipe — bell, horn, machine, '
      + 'fauna, radio or impact voice — transposed and spatialized at the anchor',
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

  // ---- batch 6 (the spectacle family) ----

  // SP3-083 — The Pour. Calendar dayOfYear 9, recurring: the foundry spine opens and
  // the melt runs gate by gate, twice-a-day economy made visible. HONEST SCOPING: the
  // sustained `fieldSustain` event light and pooled particles are the
  // vfxColorLightDirector leg; this row renders the pour as the registry carries it —
  // one wide melt bloom (the bloom-independent ring contract gives the white-orange
  // identity the cue light cannot re-tint), the glow walking the spine gate by gate as
  // cue-light beats, the final mould's single hard flash, then the annealing afterglow
  // dimming out across the minute the payload promises. The dark after the last beat
  // is the pour put away.
  'SP3-083': Object.freeze({
    title: 'The Pour',
    anchor: Object.freeze({ sectorId: 'sector_vesta_forge', zoneId: 'zone_vesta_forge' }),
    bearingRad: 0.35,
    loopS: 0,
    spanS: 88,
    steps: Object.freeze([
      Object.freeze({ atS: 0.5, template: 'bellVoice', params: Object.freeze({ recipe: 'sfx_work_motor', gain: 0.3, rate: 0.85 }) }),
      Object.freeze({ atS: 1.0, template: 'echoRing', params: Object.freeze({ color: '#ffd9a0', radiusWu: 160, lifeS: 4 }) }),
      Object.freeze({ atS: 3.0, template: 'lampCascade', params: Object.freeze({ count: 6, lengthWu: 200, stepS: 4 }) }),
      Object.freeze({ atS: 32.0, template: 'lightFlash', params: Object.freeze({ offsetWu: 0, magnitude: 6 }) }),
      Object.freeze({ atS: 42.0, template: 'lightFlash', params: Object.freeze({ offsetWu: 0, magnitude: 2 }) }),
      Object.freeze({ atS: 56.0, template: 'lightFlash', params: Object.freeze({ offsetWu: 0, magnitude: 1.2 }) }),
      Object.freeze({ atS: 72.0, template: 'lightFlash', params: Object.freeze({ offsetWu: 0, magnitude: 0.6 }) }),
      Object.freeze({ atS: 86.0, template: 'lightFlash', params: Object.freeze({ offsetWu: 0, magnitude: 0.3 }) }),
    ]),
  }),

  // SP3-065 — The Boulder Binary. The belt's clockwork pair on the debris-reef
  // approach (environmentalMachinery PQ-027.01 puts the reef at the Faith Filing Ninth
  // stake's shoulder, rotation 0.38; the row hangs the clock there). HONEST SCOPING:
  // the orbiting boulders themselves are the asteroidMotion leg — a physical pair this
  // registry cannot spawn. The row is the clock as the lane sees it: once per
  // 600-second day the matched pair runs its close pass — two matched lights a
  // ship-length apart, the abraded dust haze catching the pass, one spark on the
  // tangent — then they keep the time in silence (the loop's dark remainder). The
  // clock runs while the sector holds the pilot; leaving ends the echo, the way
  // SP3-127's did before its resurrection.
  'SP3-065': Object.freeze({
    title: 'The Boulder Binary',
    anchor: Object.freeze({ sectorId: 'sector_pallas_drift', poiId: 'poi_pallas_faith_stake' }),
    bearingRad: 0.38,
    loopS: 600,
    spanS: 12,
    steps: Object.freeze([
      Object.freeze({ atS: 2.0, template: 'lightFlash', params: Object.freeze({ offsetWu: -10, magnitude: 0.7 }) }),
      Object.freeze({ atS: 3.0, template: 'lightFlash', params: Object.freeze({ offsetWu: 10, magnitude: 0.7 }) }),
      Object.freeze({ atS: 3.5, template: 'echoRing', params: Object.freeze({ color: '#b8ac90', radiusWu: 20, lifeS: 2 }) }),
      Object.freeze({ atS: 5.0, template: 'lightFlash', params: Object.freeze({ offsetWu: 0, magnitude: 1.2 }) }),
    ]),
  }),

  // SP3-076 — Avalanche. The drill receipt lands and the overburden lets go. HONEST
  // SCOPING: the staged fracture chain, the seasonal terrain memory and the exposed
  // ore are the saveVersion-v15 mechanic leg; this row renders the slide as the
  // registry carries it — three grinding surges walking downslope as widening
  // cue-light fronts, the drill rig blinking insulted through it, and the rock's own
  // shipped calve voice on each surge. The row plays at the Caved Shaft, the pile's
  // authored marker: the blast near the pile is the fracture leg's business; the
  // registry plays the slide where the pile stands.
  'SP3-076': Object.freeze({
    title: 'Avalanche',
    anchor: Object.freeze({ sectorId: 'sector_hyperion_cut', poiId: 'poi_hyperion_driller' }),
    bearingRad: 2.2,
    loopS: 0,
    spanS: 30,
    steps: Object.freeze([
      Object.freeze({ atS: 0.6, template: 'lightFlash', params: Object.freeze({ offsetWu: 0, magnitude: 0.4 }) }),
      Object.freeze({ atS: 1.1, template: 'lightFlash', params: Object.freeze({ offsetWu: 0, magnitude: 0.4 }) }),
      Object.freeze({ atS: 2.0, template: 'lampCascade', params: Object.freeze({ count: 4, lengthWu: 120, stepS: 1.8 }) }),
      Object.freeze({ atS: 2.0, template: 'bellVoice', params: Object.freeze({ recipe: 'sfx_ambient_rock_calve', gain: 0.6, rate: 1 }) }),
      Object.freeze({ atS: 10.0, template: 'lampCascade', params: Object.freeze({ count: 4, lengthWu: 140, stepS: 2 }) }),
      Object.freeze({ atS: 10.0, template: 'bellVoice', params: Object.freeze({ recipe: 'sfx_ambient_rock_calve', gain: 0.5, rate: 0.92 }) }),
      Object.freeze({ atS: 19.0, template: 'lampCascade', params: Object.freeze({ count: 4, lengthWu: 160, stepS: 2.2 }) }),
      Object.freeze({ atS: 19.0, template: 'bellVoice', params: Object.freeze({ recipe: 'sfx_ambient_rock_calve', gain: 0.4, rate: 0.85 }) }),
      Object.freeze({ atS: 27.0, template: 'lightFlash', params: Object.freeze({ offsetWu: 40, magnitude: 0.6 }) }),
    ]),
  }),

  // SP3-001 — The Glint Hour. Calendar dayOfYear 5, recurring: the key light's azimuth
  // crosses the glint bearing and the field admits it is polished metal. HONEST
  // SCOPING: the coat-sun response itself is the illustratedSurface leg (a DIRTY file
  // — request, don't edit); this row renders the wave's walk — two sparkle files (the
  // parked field, then the debris arc off the lane a beat later) crossing inside the
  // authored two-second window as cue-light beats — and the wire posting both minutes,
  // exactly as the payload promises. Nothing is added that the eye keeps; the wave is
  // the schedule the glint keeps.
  'SP3-001': Object.freeze({
    title: 'The Glint Hour',
    anchor: Object.freeze({ sectorId: 'sector_helios_prime', stationId: 'station_helios' }),
    bearingRad: 0.9,
    loopS: 0,
    spanS: 14,
    steps: Object.freeze([
      Object.freeze({ atS: 0.5, template: 'lampCascade', params: Object.freeze({ count: 6, lengthWu: 180, stepS: 0.4 }) }),
      Object.freeze({ atS: 5.0, template: 'lampCascade', params: Object.freeze({ count: 5, lengthWu: 320, stepS: 0.7 }) }),
      Object.freeze({
        atS: 9.0,
        template: 'trafficAdvisory',
        params: Object.freeze({
          source: 'helios-watch',
          text: 'GLINT HOUR · Helios Prime — third bell: the key light crosses the glint bearing. Every coated hull, pod and wreck in the field flares inside the same two seconds; the debris arc off the lane takes its walk a beat later. Nothing added, nothing removed — the world is polished metal and admits it once a day. Both minutes posted. The second one is free.',
        }),
      }),
    ]),
  }),

  // SP1-183 — The Last Tow. The yard retires its oldest tug with full honors
  // (calendar dayOfYear 16): the procession to the crusher mouth, working hulls at
  // rest with lights on, one bow lamp riding lead, the forty-year log over the band,
  // and the last tow — unmanned, into the jaw, at the exact speed she always towed
  // at. HONEST SCOPING: the formation event and the naming flag are the encounter
  // legs; this row is the honors as light and voice through the owner seams — the
  // yard horn opening, the rest lamps holding, the procession walking the route at
  // tow speed, the band carrying the log (the shipped radio-bark recipe), and the
  // hydraulic jaw closing on her at Second Measure's mouth.
  'SP1-183': Object.freeze({
    title: 'The Last Tow',
    anchor: Object.freeze({ sectorId: 'sector_ceres_belt', poiId: 'world_site_ceres_second_measure' }),
    bearingRad: -0.6,
    loopS: 0,
    spanS: 60,
    steps: Object.freeze([
      Object.freeze({ atS: 1.0, template: 'bellVoice', params: Object.freeze({ recipe: 'sfx_hauler_foghorn', gain: 0.5, rate: 0.8 }) }),
      Object.freeze({ atS: 2.0, template: 'lightFlash', params: Object.freeze({ offsetWu: -30, magnitude: 0.4 }) }),
      Object.freeze({ atS: 2.5, template: 'lightFlash', params: Object.freeze({ offsetWu: 30, magnitude: 0.4 }) }),
      Object.freeze({ atS: 4.0, template: 'lightFlash', params: Object.freeze({ offsetWu: -60, magnitude: 0.8 }) }),
      Object.freeze({ atS: 6.0, template: 'lampCascade', params: Object.freeze({ count: 4, lengthWu: 120, stepS: 4 }) }),
      Object.freeze({ atS: 24.0, template: 'bellVoice', params: Object.freeze({ recipe: 'sfx_bark_radio', gain: 0.3, rate: 0.9 }) }),
      Object.freeze({ atS: 38.0, template: 'lightFlash', params: Object.freeze({ offsetWu: 70, magnitude: 0.6 }) }),
      Object.freeze({ atS: 46.0, template: 'lightFlash', params: Object.freeze({ offsetWu: 100, magnitude: 0.5 }) }),
      Object.freeze({ atS: 54.0, template: 'bellVoice', params: Object.freeze({ recipe: 'sfx_salvage_hydraulic', gain: 0.5, rate: 0.9 }) }),
      Object.freeze({ atS: 55.0, template: 'lightFlash', params: Object.freeze({ offsetWu: 110, magnitude: 0.7 }) }),
    ]),
  }),

  // SP3-044 — The Fireball. Meteor-shower surge, one boulder-sized fireball per day
  // the hash picks: it crosses the whole sector in eight seconds, brighter than
  // anything else up there, and lands somewhere real. HONEST SCOPING: the physical
  // boulder, the smoking crater marker with its one-day ore, and the end-tick landing
  // are the weatherMeteors / aftermathWreck legs; this row renders the crossing and
  // the landing as light — successive pulses beating across the field along the
  // flight bearing, the hard landing flash, the crater bloom opening wide, the boom
  // arriving late through the fog — and the fog watch naming the bearing on the wire.
  // The surge fires in either storm-lane sector; the row's place is the Veil fog
  // watch (the Murmur Buoy stands in the Blind Nebula fog the storm lane rides). A
  // Forge-side surge delivers the wire tell; where the buoy does not stand, the beats
  // skip rather than misplace — the moment needs its place.
  'SP3-044': Object.freeze({
    title: 'The Fireball',
    anchor: Object.freeze({ sectorId: 'sector_veil_nebula', poiId: 'poi_veil_murmur_buoy' }),
    bearingRad: 3.7,
    loopS: 0,
    spanS: 12,
    steps: Object.freeze([
      Object.freeze({ atS: 0.8, template: 'lightFlash', params: Object.freeze({ offsetWu: -1200, magnitude: 6 }) }),
      Object.freeze({ atS: 2.2, template: 'lightFlash', params: Object.freeze({ offsetWu: -600, magnitude: 6 }) }),
      Object.freeze({ atS: 3.6, template: 'lightFlash', params: Object.freeze({ offsetWu: 0, magnitude: 5.5 }) }),
      Object.freeze({ atS: 5.0, template: 'lightFlash', params: Object.freeze({ offsetWu: 600, magnitude: 5.5 }) }),
      Object.freeze({ atS: 6.4, template: 'lightFlash', params: Object.freeze({ offsetWu: 1200, magnitude: 5 }) }),
      Object.freeze({ atS: 8.0, template: 'lightFlash', params: Object.freeze({ offsetWu: 1600, magnitude: 6 }) }),
      Object.freeze({ atS: 8.4, template: 'echoRing', params: Object.freeze({ color: '#e89060', radiusWu: 160, lifeS: 4 }) }),
      Object.freeze({ atS: 8.6, template: 'bellVoice', params: Object.freeze({ recipe: 'sfx_explosion_large', gain: 0.5, rate: 0.8 }) }),
      Object.freeze({
        atS: 10.5,
        template: 'trafficAdvisory',
        params: Object.freeze({
          source: 'fog-watch',
          text: "STORM WATCH · Blind Nebula — fireball on bearing two-one-two, crossing the fog inside eight seconds, brighter than anything we have and beating light across everything under it. It comes down somewhere real; the crater holds fresh ore until end of day for anyone who read this off the wire. The surge's last stone lands exactly on the surge's last tick. It always does.",
        }),
      }),
    ]),
  }),

  // SPX-B-01 — The Arrival Stencil. First pass down the starter lane: the lane's
  // biggest rock carries the dockhands' paint — WELCOME TO THE LANE. MIND THE
  // TANKERS — and the chalked list of the three dumbest ways to die here, one line
  // scratched out and corrected in different paint. HONEST SCOPING: the hull-paint
  // decal itself is story-prop work (asset leg); this row renders what the registry
  // can carry honestly — the dockhands' renewal shift (work lamps walking the rock's
  // face, the correction's fresh mark), and the lane board posting the stencil's copy
  // verbatim, which is the surface the text rides until the decal lands. The
  // correction is a real hint: the scan ring is not a suggestion.
  'SPX-B-01': Object.freeze({
    title: 'The Arrival Stencil',
    anchor: Object.freeze({ sectorId: 'sector_helios_prime', stationId: 'station_helios' }),
    bearingRad: 1.2,
    loopS: 0,
    spanS: 10,
    steps: Object.freeze([
      Object.freeze({ atS: 1.0, template: 'lampCascade', params: Object.freeze({ count: 3, lengthWu: 40, stepS: 1.6 }) }),
      Object.freeze({
        atS: 2.5,
        template: 'trafficAdvisory',
        params: Object.freeze({
          source: 'lane board',
          kind: 'notices',
          text: 'STARTER LANE BOARD — WELCOME TO THE LANE. MIND THE TANKERS. Chalk underneath, in order: one, the tankers. Two, the tanker wake. Three, the scan ring is NOT a suggestion. One line is scratched out and corrected in different paint; the correction is the part the briefing packet skipped. Dockhands renew the paint between shifts. Add your mark when you pass clean.',
        }),
      }),
      Object.freeze({ atS: 6.0, template: 'lightFlash', params: Object.freeze({ offsetWu: 12, magnitude: 0.6 }) }),
    ]),
  }),

  // SPX-C-05 — The Pigeon Day. The coop carrier rides a convoy in, the keeper signs,
  // twelve racers are released for the ceremonial first flight — and the birds, who
  // remember the OLD loft, cross the entire sector in a tight line and land on the
  // old one, a welded-shut derelict. HONEST SCOPING: the roaming binding and the
  // keeper's log are the convoy/claim legs; the crossing renders as the verified
  // column walk (a tight file of small beats — no flocking system), the release as
  // the shipped migrant-fauna voice, the landing on the Three-Lamp Corner derelict,
  // and the keeper's lamp re-struck each cycle — the lamp that burns thereafter. The
  // first cycle after the dock is the day itself; the replays are the standing
  // market-day flight. The row plays where the old loft stands (Ceres Belt); a
  // convoy dock elsewhere delivers the wire tell only.
  'SPX-C-05': Object.freeze({
    title: 'The Pigeon Day',
    anchor: Object.freeze({ sectorId: 'sector_ceres_belt', poiId: 'poi_ceres_three_lamp' }),
    bearingRad: -0.9,
    loopS: 600,
    spanS: 24,
    steps: Object.freeze([
      Object.freeze({ atS: 1.0, template: 'bellVoice', params: Object.freeze({ recipe: 'ambient_fauna_migrant', gain: 0.4, rate: 1 }) }),
      Object.freeze({ atS: 3.0, template: 'lampCascade', params: Object.freeze({ count: 4, lengthWu: 400, stepS: 3 }) }),
      Object.freeze({ atS: 15.0, template: 'lightFlash', params: Object.freeze({ offsetWu: 0, magnitude: 0.6 }) }),
      Object.freeze({ atS: 20.0, template: 'lightFlash', params: Object.freeze({ offsetWu: 6, magnitude: 0.25 }) }),
    ]),
  }),

  // SP3-005 — Comet Perihelion. Calendar dayOfYear 15, recurring: the L6 background
  // comet drops from sky depth to near-plane for one day, tail streaming anti-
  // sunward. HONEST SCOPING: the near-plane parallax pass is the spaceBackground
  // compositor leg and the three interceptable stones are the weatherMeteors finite-
  // slot leg; the road (SP1-068) and the race (SP1-123) are their own units. This
  // row is the comet's light arriving — the near-plane point coming hard onto the
  // field, the tail streaming anti-sunward as a slow file, and the shed haze the
  // stones fall through. One comet, three answers; this row carries the light.
  'SP3-005': Object.freeze({
    title: 'Comet Perihelion',
    anchor: Object.freeze({ sectorId: 'sector_helios_prime', zoneId: 'zone_helios_core' }),
    bearingRad: 3.5,
    loopS: 0,
    spanS: 18,
    steps: Object.freeze([
      Object.freeze({ atS: 0.5, template: 'lightFlash', params: Object.freeze({ offsetWu: 0, magnitude: 5.5 }) }),
      Object.freeze({ atS: 2.0, template: 'lampCascade', params: Object.freeze({ count: 5, lengthWu: 320, stepS: 2.4 }) }),
      Object.freeze({ atS: 14.0, template: 'echoRing', params: Object.freeze({ color: '#cfe8f0', radiusWu: 90, lifeS: 3 }) }),
    ]),
  }),

  // SPX-A-08 — The Last Ferry. Shift turn on Io Reach: a two-hull ferry pair crosses
  // the trade lane sharing one lamp hung between them, the older hull visibly half-
  // towing the younger, and has been for years. HONEST SCOPING: the physical column
  // is the vignette legs' business; this row is the lane's view of the crossing —
  // the working lights walking the tow line in file (older hull, shared lamp,
  // younger hull), nothing announced, no wire line (the wire never mentions them —
  // that silence is the joke, so the row keeps it). The crossing replays once per
  // 600-second day while the sector holds the pilot; the dark remainder is the lane
  // between crossings. Some things run because somebody keeps them running.
  'SPX-A-08': Object.freeze({
    title: 'The Last Ferry',
    anchor: Object.freeze({ sectorId: 'sector_io_reach', zoneId: 'zone_io_reach' }),
    bearingRad: 0.3,
    loopS: 600,
    spanS: 40,
    steps: Object.freeze([
      Object.freeze({ atS: 0.8, template: 'lightFlash', params: Object.freeze({ offsetWu: -48, magnitude: 0.4 }) }),
      Object.freeze({ atS: 6.0, template: 'lightFlash', params: Object.freeze({ offsetWu: -12, magnitude: 1 }) }),
      Object.freeze({ atS: 15.0, template: 'lightFlash', params: Object.freeze({ offsetWu: 0, magnitude: 1 }) }),
      Object.freeze({ atS: 24.0, template: 'lightFlash', params: Object.freeze({ offsetWu: 12, magnitude: 1 }) }),
      Object.freeze({ atS: 34.0, template: 'lightFlash', params: Object.freeze({ offsetWu: 44, magnitude: 0.3 }) }),
    ]),
  }),

  // SP2-160 — The Ashcache Count Completion. The Kurtz ledger thread closes and the
  // count includes the player's hull for the first time: "...forty-one, forty-two."
  // HONEST SCOPING: the spoken count is the payload tell (Kurtz's voice, verbatim),
  // and the `counted_42` flag and codex page are their own legs. This row is the
  // sound of the count landing — two dry strokes at Kurtz's Mark, the second settling
  // half a tone the way a count closes — and then the stillness. AUDIO-ONLY BY
  // DESIGN: the ledger page turning in a wind that moves nothing else has no visual
  // seam, so the row promises no flash and renders none; the silence after the second
  // stroke is the wind. The count is correct. The count has always been correct.
  'SP2-160': Object.freeze({
    title: 'The Ashcache Count Completion',
    anchor: Object.freeze({ sectorId: 'sector_ashfall_reach', poiId: 'poi_ashfall_kurtz_mark' }),
    bearingRad: 0,
    loopS: 0,
    spanS: 6,
    steps: Object.freeze([
      Object.freeze({ atS: 1.2, template: 'bellVoice', params: Object.freeze({ recipe: 'sfx_core_bell', gain: 0.25, rate: 1.0 }) }),
      Object.freeze({ atS: 2.4, template: 'bellVoice', params: Object.freeze({ recipe: 'sfx_core_bell', gain: 0.22, rate: 0.94 }) }),
    ]),
  }),

  // SP1-047 — The Berth Queue. Peak shift at Helios: six hulls holding pattern around
  // the dock spine, a tug assigning berths in hand-signal light codes, two captains
  // bickering over who called it first. HONEST SCOPING: the physical queue hulls and
  // the controller's long memory are the ambient-encounter legs; this row is the
  // approach's view — six running lights walking the holding pattern, and the tug's
  // signal lamp granting a berth in code (two shorts, a long — the grant, from one
  // position, because a signal is not a searchlight). The bickering rides the band;
  // the payload tell already carries it verbatim, so the row adds no wire line — the
  // controller heard both and assigns neither.
  'SP1-047': Object.freeze({
    title: 'The Berth Queue',
    anchor: Object.freeze({ sectorId: 'sector_helios_prime', stationId: 'station_helios' }),
    bearingRad: 1.3,
    loopS: 0,
    spanS: 22,
    steps: Object.freeze([
      Object.freeze({ atS: 0.6, template: 'lightFlash', params: Object.freeze({ offsetWu: -8, magnitude: 0.4 }) }),
      Object.freeze({ atS: 1.0, template: 'lightFlash', params: Object.freeze({ offsetWu: -8, magnitude: 0.4 }) }),
      Object.freeze({ atS: 1.6, template: 'lightFlash', params: Object.freeze({ offsetWu: -8, magnitude: 1.4 }) }),
      Object.freeze({ atS: 4.0, template: 'lampCascade', params: Object.freeze({ count: 6, lengthWu: 160, stepS: 2.5 }) }),
    ]),
  }),

  // SP2-100 — The Choir's Hundredth Pilgrim. The depot gate reads its hundredth
  // pilgrim of the season aloud — the bell says it, the PA says it, the number is
  // spoken so nobody has to guess — then every Bell pulses out of cadence, once,
  // together, deliberately. HONEST SCOPING: the persisted pilgrim counter and the
  // Choir standing tick are the counter legs; this row renders the saying and the
  // pulse — the bell stroke that speaks the number, one wide ring rolling the field,
  // every Choir hull's ribbons lighting in the same breath (four beats on one atS is
  // the point; together or not at all), a heartbeat of nothing, and the cadence
  // quietly resuming. The PA's line is the payload tell: "The Pattern noticed."
  'SP2-100': Object.freeze({
    title: 'The Choir’s Hundredth Pilgrim',
    anchor: Object.freeze({ sectorId: 'sector_vesta_forge', stationId: 'station_depot3' }),
    bearingRad: -0.4,
    loopS: 0,
    spanS: 10,
    steps: Object.freeze([
      Object.freeze({ atS: 1.0, template: 'bellVoice', params: Object.freeze({ recipe: 'sfx_core_bell', gain: 0.6, rate: 1.0 }) }),
      Object.freeze({ atS: 3.0, template: 'echoRing', params: Object.freeze({ color: '#c8d8e8', radiusWu: 160, lifeS: 3 }) }),
      Object.freeze({ atS: 3.0, template: 'lightFlash', params: Object.freeze({ offsetWu: -80, magnitude: 0.8 }) }),
      Object.freeze({ atS: 3.0, template: 'lightFlash', params: Object.freeze({ offsetWu: -40, magnitude: 0.8 }) }),
      Object.freeze({ atS: 3.0, template: 'lightFlash', params: Object.freeze({ offsetWu: 40, magnitude: 0.8 }) }),
      Object.freeze({ atS: 3.0, template: 'lightFlash', params: Object.freeze({ offsetWu: 80, magnitude: 0.8 }) }),
      Object.freeze({ atS: 7.0, template: 'bellVoice', params: Object.freeze({ recipe: 'sfx_core_bell', gain: 0.3, rate: 1.0 }) }),
    ]),
  }),

  // SP2-121 — Solstice's Dark Lantern. One seeded night per game the belt's grid is
  // down, and in a field of dead lamps Solstice's lantern is the only light left
  // burning. HONEST SCOPING: the grid-down blackout of everything else is look/lamp-
  // bus work (additive VFX cannot darken — the row renders the lantern that STAYS);
  // the wrecks physically turning to face it is prop work. This row is the night as
  // the registry carries it: the lantern escalating hard then holding steady through
  // the window (the authored radius escalation as cue-light beats), its reach ringed
  // once across the field, the nearest wrecks' faces catching it, and Solstice's own
  // shipped chime — she did not ask for this. The dark remainder of the window is
  // the grid staying down. Solstice's line is the payload tell.
  'SP2-121': Object.freeze({
    title: 'Solstice’s Dark Lantern',
    anchor: Object.freeze({ sectorId: 'sector_ceres_belt', poiId: 'poi_solstice_lantern' }),
    bearingRad: 0.7,
    loopS: 0,
    spanS: 110,
    steps: Object.freeze([
      Object.freeze({ atS: 1.0, template: 'bellVoice', params: Object.freeze({ recipe: 'sfx_solstice_chime', gain: 0.5, rate: 0.85 }) }),
      Object.freeze({ atS: 1.5, template: 'lightFlash', params: Object.freeze({ offsetWu: 0, magnitude: 1.5 }) }),
      Object.freeze({ atS: 3.5, template: 'lightFlash', params: Object.freeze({ offsetWu: 0, magnitude: 2.5 }) }),
      Object.freeze({ atS: 6.5, template: 'lightFlash', params: Object.freeze({ offsetWu: 0, magnitude: 3.5 }) }),
      Object.freeze({ atS: 8.0, template: 'echoRing', params: Object.freeze({ color: '#e8c880', radiusWu: 160, lifeS: 4 }) }),
      Object.freeze({ atS: 10.0, template: 'lightFlash', params: Object.freeze({ offsetWu: -120, magnitude: 0.4 }) }),
      Object.freeze({ atS: 11.5, template: 'lightFlash', params: Object.freeze({ offsetWu: 140, magnitude: 0.4 }) }),
      Object.freeze({ atS: 30.0, template: 'lightFlash', params: Object.freeze({ offsetWu: 0, magnitude: 2.8 }) }),
      Object.freeze({ atS: 70.0, template: 'lightFlash', params: Object.freeze({ offsetWu: 0, magnitude: 2.5 }) }),
      Object.freeze({ atS: 100.0, template: 'lightFlash', params: Object.freeze({ offsetWu: 0, magnitude: 2.2 }) }),
    ]),
  }),

  // ---- batch 7 (the spectacle family) ----

  // SP1-115 — The Range Note. The sector-day after the ace's return receipt: for a
  // whole day, occasionally, a red ranging fleck crosses the hull glass — brief,
  // precise, from nowhere, no contact on any scanner. Sable Iask is a roaming named
  // captain with no fixed perch, and the fleck crosses YOUR glass — hull-space the
  // registry's place anchors cannot render; the payload tell carries the fleck
  // wherever the reminder lands. The row renders the ranging sweep from the
  // Unidentified Lattice in the Expanse — the anonymous dark roost the flecks sweep
  // out of — and, per the SP3-044 precedent, skips rather than misplaces where the
  // lattice does not stand. The loop is the day: the flecks recur on their cadence
  // while the sector holds the pilot; leaving ends them, exactly like the Boulder
  // Binary's clock. The accuracy-nerf half of the payoff was dropped by ratification
  // (hones c) — the story prop is the whole leg, and a fleck from nowhere makes no
  // sound and files no wire.
  'SP1-115': Object.freeze({
    title: 'The Range Note',
    anchor: Object.freeze({ sectorId: 'sector_charon_expanse', poiId: 'poi_charon_pylon_field' }),
    bearingRad: 2.1,
    loopS: 45,
    spanS: 8,
    steps: Object.freeze([
      Object.freeze({ atS: 1.0, template: 'echoRing', params: Object.freeze({ color: '#d0483a', radiusWu: 10, lifeS: 0.4 }) }),
      Object.freeze({ atS: 3.5, template: 'echoRing', params: Object.freeze({ color: '#d0483a', radiusWu: 8, lifeS: 0.35 }) }),
      Object.freeze({ atS: 6.5, template: 'echoRing', params: Object.freeze({ color: '#d0483a', radiusWu: 12, lifeS: 0.45 }) }),
    ]),
  }),

  // SP2-076 — The Shoal Toast. Bloom day at Nereid Waystation (calendar dayOfYear 18,
  // re-armed yearly): outside the glass the shoal's annual bloom passes like slow
  // fireworks, the bar's lights dim on cue, and every glass in the place goes up at
  // once — the toast is one word, in unison, and the word is the first mapper's name.
  // HONEST SCOPING: the bar interior, the codex page and the `shoal_toast` flag are
  // their own legs; additive VFX cannot darken, so "the bar's lights dim on cue"
  // renders as floor-gain beats — the lowest the cue light burns (the SP3-106
  // precedent). The crowd's unison toast is the shipped crowd voice from the
  // station's direction in space; the bloom is the slow file passing the glass.
  'SP2-076': Object.freeze({
    title: 'The Shoal Toast',
    anchor: Object.freeze({ sectorId: 'sector_nereid_shoal', stationId: 'station_nereid' }),
    bearingRad: 1.4,
    loopS: 0,
    spanS: 28,
    steps: Object.freeze([
      Object.freeze({ atS: 1.0, template: 'bellVoice', params: Object.freeze({ recipe: 'ambient_station_crowd', gain: 0.5, rate: 1 }) }),
      Object.freeze({ atS: 3.0, template: 'lampCascade', params: Object.freeze({ count: 5, lengthWu: 340, stepS: 4 }) }),
      Object.freeze({ atS: 22.0, template: 'lightFlash', params: Object.freeze({ offsetWu: 0, magnitude: 0.15 }) }),
      Object.freeze({ atS: 24.0, template: 'lightFlash', params: Object.freeze({ offsetWu: 30, magnitude: 0.12 }) }),
    ]),
  }),

  // SP3-060 — The Clearing. The exact second each surge ends: the sky cleans in one
  // wipe — the curtain-light collapses anti-sunward, stars sharpen over a second,
  // every hull's rim light comes back at once, and the sector audibly relaxes. It
  // ends every storm the same way. HONEST SCOPING: the exposure/structure wipe on the
  // background resolve is the sectorVisualProfiles compositor leg; this row renders
  // the clearing as the registry carries it — the wipe's wide ring, the rim lights
  // returning in one fast sweep, two hard star points, and the single low exhale in
  // the mix (the shipped breath voice, down an octave). The hash-daily firing lands
  // in any sector; the row plays at the Murmur Buoy — the Weather eye, the fog watch
  // post the payload is filed from — and skips rather than misplaces where the post
  // does not stand (the SP3-044 precedent). The best five seconds of weather in the
  // game, observed from the post that watches for a living.
  'SP3-060': Object.freeze({
    title: 'The Clearing',
    anchor: Object.freeze({ sectorId: 'sector_veil_nebula', poiId: 'poi_veil_murmur_buoy' }),
    bearingRad: 2.9,
    loopS: 0,
    spanS: 10,
    steps: Object.freeze([
      Object.freeze({ atS: 0.5, template: 'echoRing', params: Object.freeze({ color: '#bfe8f0', radiusWu: 160, lifeS: 4 }) }),
      Object.freeze({ atS: 1.5, template: 'lightFlash', params: Object.freeze({ offsetWu: -80, magnitude: 0.5 }) }),
      Object.freeze({ atS: 1.6, template: 'lightFlash', params: Object.freeze({ offsetWu: 120, magnitude: 0.4 }) }),
      Object.freeze({ atS: 2.5, template: 'lampCascade', params: Object.freeze({ count: 5, lengthWu: 200, stepS: 0.8 }) }),
      Object.freeze({ atS: 6.0, template: 'bellVoice', params: Object.freeze({ recipe: 'bolus_breath', gain: 0.3, rate: 0.5 }) }),
    ]),
  }),

  // SP1-150 — The Ashfall Skim. Calendar dayOfYear 8, recurring: Ashfall's refinery
  // skim runs dip close enough to the star that the hulls read as silhouettes against
  // the flare, collector fields dragging behind on lines, the crew's voices over the
  // band with the calm of people who do this twice a shift. HONEST SCOPING: the wake
  // speed lane is the environmentalMachinery field row (hones c) and the barges are
  // the ambient-encounter leg; this row renders the run as the registry carries it —
  // the file in line-ahead dipping starward over the seams they feed, the fields on
  // their lines as wide flare-lit rings, the band voices, and the sheared wake
  // reading as one brief bright lane behind the last barge.
  'SP1-150': Object.freeze({
    title: 'The Ashfall Skim',
    anchor: Object.freeze({ sectorId: 'sector_ashfall_reach', zoneId: 'zone_ashfall_belt' }),
    bearingRad: -0.7,
    loopS: 0,
    spanS: 26,
    steps: Object.freeze([
      Object.freeze({ atS: 1.0, template: 'bellVoice', params: Object.freeze({ recipe: 'sfx_bark_radio', gain: 0.3, rate: 1 }) }),
      Object.freeze({ atS: 2.0, template: 'lampCascade', params: Object.freeze({ count: 5, lengthWu: 240, stepS: 3 }) }),
      Object.freeze({ atS: 8.0, template: 'bellVoice', params: Object.freeze({ recipe: 'sfx_bark_radio', gain: 0.25, rate: 0.95 }) }),
      Object.freeze({ atS: 10.0, template: 'echoRing', params: Object.freeze({ color: '#e8a060', radiusWu: 120, lifeS: 3 }) }),
      Object.freeze({ atS: 10.5, template: 'echoRing', params: Object.freeze({ color: '#d89050', radiusWu: 90, lifeS: 3 }) }),
      Object.freeze({ atS: 20.0, template: 'lightFlash', params: Object.freeze({ offsetWu: 120, magnitude: 0.5 }) }),
    ]),
  }),

  // SP1-151 — The Frost Line. First crossing into Charon's outer belt: one invisible
  // boundary and the universe changes — hull rims whiten with feathered ice, comms
  // acquire a crackle, and every hull ahead wears the same frost. HONEST SCOPING:
  // the persistent hull-frost state and the frost-side-only trade good are the
  // mechanic legs; the catalog trigger fires the first crossing (sectorEntry, not
  // recurring) and every crossing after is the crossing-check leg's business. This
  // row renders the crossing as the registry carries it — the line reading for one
  // breath as a crisp ring, the frosted traffic walking the sunward side, your own
  // nose whitening, and the crackle arriving on the shipped squelch tail.
  'SP1-151': Object.freeze({
    title: 'The Frost Line',
    anchor: Object.freeze({ sectorId: 'sector_charon_expanse', zoneId: 'zone_charon_belt' }),
    bearingRad: 1.9,
    loopS: 0,
    spanS: 16,
    steps: Object.freeze([
      Object.freeze({ atS: 0.8, template: 'echoRing', params: Object.freeze({ color: '#eaf4f8', radiusWu: 90, lifeS: 2.5 }) }),
      Object.freeze({ atS: 2.5, template: 'lampCascade', params: Object.freeze({ count: 5, lengthWu: 180, stepS: 2 }) }),
      Object.freeze({ atS: 7.0, template: 'lightFlash', params: Object.freeze({ offsetWu: -60, magnitude: 0.6 }) }),
      Object.freeze({ atS: 12.0, template: 'bellVoice', params: Object.freeze({ recipe: 'sfx_comms_squelch_tail', gain: 0.35, rate: 0.9 }) }),
    ]),
  }),

  // SP1-153 — The Full Burn. Calendar dayOfYear 10, once: every operational hull at
  // Helios — tugs, barges, patrol, the lot — lights off simultaneously for a
  // synchronized station-keeping burn, holds ten seconds, and cuts together. Pure,
  // pointless, perfect choreography, sixty years strong. HONEST SCOPING: the
  // formation-ring motions, the join check and the tower's forever-grading are the
  // vignette legs; the cue light is momentary, so the held burn renders as dim
  // re-strikes inside the hold — the honest way to keep a ten-second burn visible.
  // Six beats on one atS is the point: together or not at all (the SP2-100
  // precedent). The tower's announcement rides the wire; the burn's voice is the
  // shipped engine voice, down; the cut together is the last flicker, and the dark
  // remainder of the window is every engine dead on the same tick.
  'SP1-153': Object.freeze({
    title: 'The Full Burn',
    anchor: Object.freeze({ sectorId: 'sector_helios_prime', stationId: 'station_helios' }),
    bearingRad: 2.2,
    loopS: 0,
    spanS: 15,
    steps: Object.freeze([
      Object.freeze({
        atS: 0.5,
        template: 'trafficAdvisory',
        params: Object.freeze({
          source: 'helios tower',
          kind: 'notices',
          text: 'DRILL NOTICE · Helios tower — fleet station-keeping drill at the turn of the hour. Every operational hull lights off together, holds ten, cuts together. It is not a test; nothing is being tested. It is the schedule, and the schedule has outlived everyone who laughed at it. The formation ring takes volunteers. The tower grades once. Forever.',
        }),
      }),
      Object.freeze({ atS: 1.0, template: 'bellVoice', params: Object.freeze({ recipe: 'sfx_engine_thrust', gain: 0.25, rate: 0.75 }) }),
      Object.freeze({ atS: 1.0, template: 'lightFlash', params: Object.freeze({ offsetWu: -100, magnitude: 1.2 }) }),
      Object.freeze({ atS: 1.0, template: 'lightFlash', params: Object.freeze({ offsetWu: -60, magnitude: 1.2 }) }),
      Object.freeze({ atS: 1.0, template: 'lightFlash', params: Object.freeze({ offsetWu: -20, magnitude: 1.2 }) }),
      Object.freeze({ atS: 1.0, template: 'lightFlash', params: Object.freeze({ offsetWu: 20, magnitude: 1.2 }) }),
      Object.freeze({ atS: 1.0, template: 'lightFlash', params: Object.freeze({ offsetWu: 60, magnitude: 1.2 }) }),
      Object.freeze({ atS: 1.0, template: 'lightFlash', params: Object.freeze({ offsetWu: 100, magnitude: 1.2 }) }),
      Object.freeze({ atS: 4.5, template: 'lightFlash', params: Object.freeze({ offsetWu: 0, magnitude: 0.5 }) }),
      Object.freeze({ atS: 7.0, template: 'lightFlash', params: Object.freeze({ offsetWu: -40, magnitude: 0.45 }) }),
      Object.freeze({ atS: 11.0, template: 'lightFlash', params: Object.freeze({ offsetWu: 0, magnitude: 0.3 }) }),
    ]),
  }),

  // SP1-155 — The Broadside. Calendar dayOfYear 31, recurring: the moon takes a
  // meteor stream broadside — a hundred visible impacts stitched across its face like
  // a slow string of flashbulbs, each one throwing a plume you can pick out from the
  // lane, while the band goes uncharacteristically respectful. HONEST SCOPING: the
  // stream's real iron crossing the lane (dodge-or-weather-it) is the debrisCrossings
  // mechanic leg, and the plumes' one-hour persistence is the aftermath leg — echo
  // ring life is the owner's 4 s ceiling. The moon is the Towed Moonlet, the sector's
  // authored moon on a chain; the row plays at its face. The flashbulb string walks
  // the face as a slow file, the plumes open wide and dim, and the band's respect is
  // the row saying nothing at all — no wire, no voice (that silence is the point, the
  // SPX-A-08 precedent). The moon is not in danger. Everyone watches anyway.
  'SP1-155': Object.freeze({
    title: 'The Broadside',
    anchor: Object.freeze({ sectorId: 'sector_ashfall_reach', poiId: 'poi_ashfall_towed_moonlet' }),
    bearingRad: 0.55,
    loopS: 0,
    spanS: 40,
    steps: Object.freeze([
      Object.freeze({ atS: 1.0, template: 'lampCascade', params: Object.freeze({ count: 6, lengthWu: 260, stepS: 3.2 }) }),
      Object.freeze({ atS: 4.0, template: 'echoRing', params: Object.freeze({ color: '#c8b8a0', radiusWu: 90, lifeS: 4 }) }),
      Object.freeze({ atS: 14.0, template: 'lampCascade', params: Object.freeze({ count: 5, lengthWu: 220, stepS: 3.6 }) }),
      Object.freeze({ atS: 18.0, template: 'echoRing', params: Object.freeze({ color: '#b8a890', radiusWu: 120, lifeS: 4 }) }),
      Object.freeze({ atS: 30.0, template: 'lampCascade', params: Object.freeze({ count: 4, lengthWu: 180, stepS: 3.2 }) }),
      Object.freeze({ atS: 36.0, template: 'echoRing', params: Object.freeze({ color: '#a89880', radiusWu: 140, lifeS: 4 }) }),
    ]),
  }),

  // SP1-157 — The Lightning Farmers. Storm season on the Black Orchard — the farm
  // rocks planted in rows off the Veil's storm lanes: the cells ground themselves on
  // the ridge and the farmers harvest, strikes running the collector lines to the
  // capacitor bank with a bang you feel in your teeth. HONEST SCOPING: the
  // charged-cell vendor, the queue and the module charge are the vendor leg; the
  // storm cells themselves are the weather leg; this row is the harvest as the lane
  // sees it — two strikes walking the line rock to rock, the bank taking each charge
  // with the shipped seismic thump, and the band's weather conversation (the shipped
  // radio-bark voice — people who talk about weather because the weather is the
  // whole conversation). The catalog trigger is a one-time proximity firing at the
  // Veil; the row plays where the Orchard stands.
  'SP1-157': Object.freeze({
    title: 'The Lightning Farmers',
    anchor: Object.freeze({ sectorId: 'sector_veil_nebula', poiId: 'poi_veil_black_orchard' }),
    bearingRad: 0.5,
    loopS: 0,
    spanS: 24,
    steps: Object.freeze([
      Object.freeze({ atS: 1.0, template: 'bellVoice', params: Object.freeze({ recipe: 'sfx_bark_radio', gain: 0.3, rate: 1 }) }),
      Object.freeze({ atS: 3.0, template: 'lightFlash', params: Object.freeze({ offsetWu: -60, magnitude: 1.5 }) }),
      Object.freeze({ atS: 3.4, template: 'lampCascade', params: Object.freeze({ count: 4, lengthWu: 120, stepS: 0.6 }) }),
      Object.freeze({ atS: 5.0, template: 'bellVoice', params: Object.freeze({ recipe: 'sfx_mining_seismic_pulse', gain: 0.45, rate: 0.9 }) }),
      Object.freeze({ atS: 5.5, template: 'lightFlash', params: Object.freeze({ offsetWu: 80, magnitude: 1.2 }) }),
      Object.freeze({ atS: 13.0, template: 'lightFlash', params: Object.freeze({ offsetWu: -60, magnitude: 1.3 }) }),
      Object.freeze({ atS: 13.4, template: 'lampCascade', params: Object.freeze({ count: 4, lengthWu: 120, stepS: 0.7 }) }),
      Object.freeze({ atS: 15.0, template: 'bellVoice', params: Object.freeze({ recipe: 'sfx_mining_seismic_pulse', gain: 0.4, rate: 0.85 }) }),
      Object.freeze({ atS: 15.5, template: 'lightFlash', params: Object.freeze({ offsetWu: 80, magnitude: 1 }) }),
      Object.freeze({ atS: 20.0, template: 'bellVoice', params: Object.freeze({ recipe: 'sfx_bark_radio', gain: 0.25, rate: 0.92 }) }),
    ]),
  }),

  // SP1-052 — The Merger Convoy. Once per seeded week (hash-daily, Ceres only): two
  // convoys meet at the Throughline weigh junction, run lights-to-lights for a
  // moment, and merge into one column with the old leads falling in side by side —
  // the band carrying a brief, formal exchange of freight manifests, read like a
  // marriage register. HONEST SCOPING: the doubled column's raid math (twice the
  // loot, twice the escort work, one shared graveyard) is the convoy-script leg's
  // business; this row is the merger as the lane sees it — the two matched leads
  // meeting on the lane bearing, the register read over the band in two voices, the
  // side-by-side leads at the head, and the merged column walking on. Nobody smokes
  // in vacuum; the row lights no cigars either.
  'SP1-052': Object.freeze({
    title: 'The Merger Convoy',
    anchor: Object.freeze({ sectorId: 'sector_ceres_belt', poiId: 'poi_ceres_throughline' }),
    bearingRad: 0.15,
    loopS: 0,
    spanS: 22,
    steps: Object.freeze([
      Object.freeze({ atS: 2.0, template: 'lightFlash', params: Object.freeze({ offsetWu: -40, magnitude: 1 }) }),
      Object.freeze({ atS: 2.0, template: 'lightFlash', params: Object.freeze({ offsetWu: 40, magnitude: 1 }) }),
      Object.freeze({ atS: 5.0, template: 'bellVoice', params: Object.freeze({ recipe: 'sfx_bark_radio', gain: 0.3, rate: 1 }) }),
      Object.freeze({ atS: 6.2, template: 'bellVoice', params: Object.freeze({ recipe: 'sfx_bark_radio', gain: 0.28, rate: 0.95 }) }),
      Object.freeze({ atS: 9.0, template: 'lightFlash', params: Object.freeze({ offsetWu: -8, magnitude: 1.2 }) }),
      Object.freeze({ atS: 9.0, template: 'lightFlash', params: Object.freeze({ offsetWu: 8, magnitude: 1.2 }) }),
      Object.freeze({ atS: 11.0, template: 'lampCascade', params: Object.freeze({ count: 5, lengthWu: 200, stepS: 2.4 }) }),
    ]),
  }),

  // SP3-036 — Ocean Glint Walk. Calendar dayOfYear 6, recurring, in its authored
  // forty-second window: a single burning point of reflected sun slides across the
  // Anvil's ocean band like a bead of fire, widening as the angle shallows into a
  // golden road of specular glint, then pinching out at the limb. For exactly that
  // long the planet reads as water. HONEST SCOPING: the planet-factory specular
  // parametric band (one authored material moment, no new shader) is the compositor
  // leg; this row renders the walk's light as the registry carries it — the bead
  // arriving at the limb, the slide across the band, the road widening as one warm
  // ring, the pinch — silent, because sun-angle geometry makes no sound (the SP3-001
  // sibling's own rule). Once a day, exactly as long as the geometry takes.
  'SP3-036': Object.freeze({
    title: 'Ocean Glint Walk',
    anchor: Object.freeze({ sectorId: 'sector_tethys_junction', zoneId: 'zone_tethys_anvil' }),
    bearingRad: 0.9,
    loopS: 0,
    spanS: 38,
    steps: Object.freeze([
      Object.freeze({ atS: 1.0, template: 'lightFlash', params: Object.freeze({ offsetWu: -150, magnitude: 1.6 }) }),
      Object.freeze({ atS: 6.0, template: 'lampCascade', params: Object.freeze({ count: 6, lengthWu: 300, stepS: 4 }) }),
      Object.freeze({ atS: 30.0, template: 'echoRing', params: Object.freeze({ color: '#e8c860', radiusWu: 160, lifeS: 4 }) }),
      Object.freeze({ atS: 35.0, template: 'lightFlash', params: Object.freeze({ offsetWu: 160, magnitude: 0.4 }) }),
    ]),
  }),

  // SP3-028 — Moonrise Over the Anvil. Day 30 of every year: a small cratered
  // moonlet the background never quite showed before rises across the Anvil's face —
  // a hard black coin with a lit rim, taking four minutes to cross. Ratification
  // kept this fully decoupled from the eclipse chain: a moonrise signature, not a
  // fourth transit. HONEST SCOPING: the signatureHero background composition is the
  // sectorVisualProfiles compositor leg, and additive VFX cannot darken — the black
  // coin is the sky keeping it; this row renders the half the registry can carry:
  // the LIT RIM. First contact rings at the limb, the rim walking the chord as a
  // sparse file over the four minutes (a clock hand, not a flare), last contact as
  // the rim pinches off. No sound and no wire: a moonrise is signed, not announced.
  'SP3-028': Object.freeze({
    title: 'Moonrise Over the Anvil',
    anchor: Object.freeze({ sectorId: 'sector_tethys_junction', zoneId: 'zone_tethys_anvil' }),
    bearingRad: 1.15,
    loopS: 0,
    spanS: 240,
    steps: Object.freeze([
      Object.freeze({ atS: 4.0, template: 'echoRing', params: Object.freeze({ color: '#d8d4c8', radiusWu: 60, lifeS: 2.5 }) }),
      Object.freeze({ atS: 30.0, template: 'lightFlash', params: Object.freeze({ offsetWu: -80, magnitude: 0.9 }) }),
      Object.freeze({ atS: 70.0, template: 'lightFlash', params: Object.freeze({ offsetWu: -40, magnitude: 0.9 }) }),
      Object.freeze({ atS: 110.0, template: 'lightFlash', params: Object.freeze({ offsetWu: 0, magnitude: 0.9 }) }),
      Object.freeze({ atS: 150.0, template: 'lightFlash', params: Object.freeze({ offsetWu: 40, magnitude: 0.9 }) }),
      Object.freeze({ atS: 190.0, template: 'lightFlash', params: Object.freeze({ offsetWu: 80, magnitude: 0.9 }) }),
      Object.freeze({ atS: 224.0, template: 'echoRing', params: Object.freeze({ color: '#d8d4c8', radiusWu: 40, lifeS: 2 }) }),
    ]),
  }),

  // SP2-124 — The Eighth Bell Answers. The receipt of a clean pulse chain — nothing
  // shattered, no hull billed — and the Eighth Bell rings once with nothing driving
  // it. An unscheduled note. HONEST SCOPING: the `eighth_approval` flag, the Choir
  // standing tick and the future extra ribbon are the counter/flag legs; the Choir's
  // channel is not the news wire, so the row files nothing — the personal register
  // line is the payload tell, verbatim (the SP2-160 audio-led precedent). The row is
  // the answer itself: the shipped strike voice at written pitch, one ring rolling
  // out with no pulse behind it, and then the silence the Choir decided not to
  // examine. It does not do that. It has never done that.
  'SP2-124': Object.freeze({
    title: 'The Eighth Bell Answers',
    anchor: Object.freeze({ sectorId: 'sector_vesta_forge', zoneId: 'zone_vesta_forge' }),
    bearingRad: 0,
    loopS: 0,
    spanS: 12,
    steps: Object.freeze([
      Object.freeze({ atS: 1.0, template: 'bellVoice', params: Object.freeze({ recipe: 'sfx_eighth_bell_strike', gain: 0.6, rate: 1 }) }),
      Object.freeze({ atS: 1.4, template: 'echoRing', params: Object.freeze({ color: '#c8d8e8', radiusWu: 120, lifeS: 3 }) }),
    ]),
  }),

  // SP2-026 — The Frequency Nobody Owns. First entry into the Veil: deep in the
  // Blind Nebula murk, the band carries a tone pattern nobody owns — the Vesper
  // phrase, LOW HIGH MIDDLE, two octaves down, played by something that is not
  // Vesper. HONEST SCOPING: the `veil_hums_vesper` flag and the next-scan line are
  // the comms legs; this row is the frequency itself. Three notes on the shipped
  // resonator voice at lullaby gain — the phrase recognizable and wrong, one voice,
  // no source filed. The phrase recurs on its own cadence while the murk holds the
  // pilot; when the murk breaks the runtime's sector gate ends the loop wherever it
  // is — the mid-note stop, like a door closed gently from the other side.
  'SP2-026': Object.freeze({
    title: 'The Frequency Nobody Owns',
    anchor: Object.freeze({ sectorId: 'sector_veil_nebula', zoneId: 'zone_veil_fog' }),
    bearingRad: 0,
    loopS: 30,
    spanS: 10,
    steps: Object.freeze([
      Object.freeze({ atS: 1.0, template: 'bellVoice', params: Object.freeze({ recipe: 'sfx_vesper_resonator_0', gain: 0.15, rate: 0.5 }) }),
      Object.freeze({ atS: 4.0, template: 'bellVoice', params: Object.freeze({ recipe: 'sfx_vesper_resonator_0', gain: 0.15, rate: 0.75 }) }),
      Object.freeze({ atS: 7.5, template: 'bellVoice', params: Object.freeze({ recipe: 'sfx_vesper_resonator_0', gain: 0.15, rate: 0.6 }) }),
    ]),
  }),

  // SP2-176 — The Choir Tender's Lullaby. Proximity to the dead hospital tender
  // during her scheduled hymn: the wreck's bell rings one note — no crew, no power,
  // one note a day — and every Choir hull in three sectors answers it in harmony,
  // mid-shift, no explanation filed. HONEST SCOPING: the codex page "The Hospital
  // Bell" and the Choir standing tick are their own legs, and the note's
  // day-seeded pitch variation is the calendar tell's business — the row voices one
  // playing of it, resolving, as the payload promises. One anchor cannot stand in
  // three sectors (the SP3-085 precedent), so the row plays the note at the tender
  // and the answers arrive over the band as the harmony voices: the fifth, the
  // octave, the unison under. The first note of a lullaby, from a hospital ship.
  'SP2-176': Object.freeze({
    title: 'The Choir Tender’s Lullaby',
    anchor: Object.freeze({ sectorId: 'sector_helios_prime', poiId: 'poi_helios_choir_tender' }),
    bearingRad: 0,
    loopS: 0,
    spanS: 12,
    steps: Object.freeze([
      Object.freeze({ atS: 1.0, template: 'bellVoice', params: Object.freeze({ recipe: 'sfx_morrow_bell_0', gain: 0.4, rate: 0.84 }) }),
      Object.freeze({ atS: 3.0, template: 'bellVoice', params: Object.freeze({ recipe: 'sfx_core_bell', gain: 0.3, rate: 1.26 }) }),
      Object.freeze({ atS: 3.2, template: 'bellVoice', params: Object.freeze({ recipe: 'sfx_core_bell', gain: 0.25, rate: 1.68 }) }),
      Object.freeze({ atS: 3.4, template: 'bellVoice', params: Object.freeze({ recipe: 'sfx_core_bell', gain: 0.2, rate: 0.84 }) }),
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
