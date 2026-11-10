import { FIELD_JOB_SIGNATURE_CRAFT } from '../data/occupationalTrafficCraft.js';
import { shouldDrawTableVfx, tableLookAtDelta, tableVfxDrawWuFromState } from './tabletopPolicy.js';

// Pure presentation grammar for the NPC job seam — "The Working Light" made visible.
//
// WHAT THIS IS: the read-only mapping from a job's (kind, phase, loaded) triple to the visual code a
// working ship shows the lane. It owns no state, allocates nothing per frame, and knows nothing about
// Three.js, the scene, entities or the bus. `src/render/vfx.js` is the only consumer; it holds the
// pool and does the drawing.
//
// WHAT THIS IS NOT: it is not a simulation input. Nothing here can change where a ship goes, how fast
// it flies, or what phase it is in. `src/systems/npcJobs.js` decides all of that and this module only
// describes it. That separation is deliberate: the sim goldens (`check:sim` / `check:sim:v3`) hash
// entity motion, so a presentation layer that cannot write motion cannot make them stale.
//
// ─── Source ───────────────────────────────────────────────────────────────────────────────────────
// Fiction:  design/fiction/THE_WORKING_LIGHT.md — the in-world signal code. Every `codeName` below is
//           the crews' own name for the signal, and every `means` line is what the Code says it
//           claims. Read that document before changing a profile; the visuals are downstream of it.
// Research: design/graphics-sprints/RESEARCH_work_signatures.md — the craft survey of how shipped
//           space games signal NPC work at distance.
//
// ─── The four far-field channels ──────────────────────────────────────────────────────────────────
// The research's load-bearing finding is that a job stays legible at 500-2000 world units through
// exactly four channels, and NONE of them is colour — at that range the hull is a few pixels wide, so
// paint and mesh detail are already gone. Every profile therefore declares all four:
//
//   link      A continuous geometric RELATIONSHIP to something else — a cut beam into a rock, a
//             transfer umbilical to a berth, a scan sweep over a volume. "Contact geometry beats
//             emissive colour": a thin line from ship to asteroid says more than any hull tint.
//   contact   What that relationship DOES to the other end — spall off the face, warm spill out of an
//             open hatch, tally dust off a discharging hold. Absence is meaningful: repairs add
//             material, so they have no ejecta.
//   attitude  The motion regime the eye reads before it reads shape — station-keeping micro-chatter,
//             steady cruise, stepped final, a spine waking, a panicked break.
//   rhythm    The lamp code. Temporal contrast survives sub-pixel where constant emissive does not,
//             so every signal here BLINKS on a named cadence rather than glowing.
//
// ─── Why cadence is the identity ──────────────────────────────────────────────────────────────────
// `beats` is how many distinct elements the code cycles through, and `cadenceHz` is how fast. Those
// two numbers ARE the signal — the fiction's "loaded heartbeat" is slow and even, "stacking" drops to
// half cadence, distress alternates hard. A reader who cannot resolve the lamp can still count the
// beat, which is precisely why maritime practice encodes meaning in flash groups.

const TAU = Math.PI * 2;

/** Pool size in vfx.js. Traffic caps a sector at 8 civilian hulls (traffic.js MAX_PER_SECTOR), and
 *  world/mission producers may add a few more, so 12 covers a full sector with headroom and still
 *  bounds the per-frame cost to a fixed, knowable ceiling. */
export const NPC_JOB_SIGNATURE_CAPACITY = 12;

/**
 * Beyond this the signature is not drawn at all.
 *
 * This number was WRONG TWICE before it was measured, and the correction is worth recording because
 * it is not a fact about this file — it is a fact about the game's camera.
 *
 * The research says these signals are read at 500-2000 world units in shipped space games, so the
 * first two guesses were 1500 (matching the station-side-event layer) and then 2000 (the top of that
 * band). Both were nonsense HERE. Projecting the live chase camera (FOV 50, positioned 54.9 above
 * and 31.7 behind the hull) gives this ladder for a point on the ground plane directly ahead:
 *
 *      z =   0  ->  screen y  540   (the player, dead centre)
 *      z =  20  ->            267
 *      z =  45  ->             14   (the very top edge of a 1080-tall frame)
 *      z =  60  ->           -105   (off-screen)
 *      z = 100  ->           -345
 *      z = 800  ->          -1192
 *
 * Lateral limit is +/-50. **The visible ground-plane bubble is about 100 world units across.** A
 * signal on a hull 1500 units away is not dim or small; it is above the top of the monitor. Measured
 * confirmation: four live signatures projected to screen y -885, -896, -648 and -71 while the
 * counters happily reported them "drawn".
 *
 * 300 covers the bubble at maximum manual zoom-out (CAMERA_ZOOM_MAX 330 in render/camera.js) plus
 * headroom for tall hulls whose upper hardware clears the horizon. Anything past that spends pool
 * slots on geometry no player can ever see.
 */
/** Leftover close-camera cap. Live draw uses tableVfxDrawWuFromState. */
export const NPC_JOB_SIGNATURE_DRAW_RANGE = 300;

// ─── The signals ──────────────────────────────────────────────────────────────────────────────────
// One frozen profile per working state. `codeName` and `means` are quoted from THE WORKING LIGHT so a
// reader of this file can find the fiction entry that governs it without leaving the code.

const SPINE_WAKE = Object.freeze({
  id: 'spine_wake',
  codeName: 'Waking the spine',
  means: 'Commission complete; under own power, not yet in transit. Do not cross the undock corridor.',
  link: null,
  contact: null,
  attitude: 'wake',
  rhythm: 'spine-wake',
  // Bow, midships, stern — "one beat each". Three beats is the signal.
  beats: 3,
  cadenceHz: 2.2,
  reducedCadenceHz: 1.1,
});

const HEAVY_BURN = Object.freeze({
  id: 'heavy_burn',
  codeName: 'Heavy burn / load-strobe',
  means: 'Hold is full or near-full. High mass, long stop. Do not cut in front.',
  link: null,
  contact: null,
  attitude: 'cruise',
  rhythm: 'load-heartbeat',
  // "A slow, even cadence (the loaded heartbeat)". Two beats: the pair fires, then rests.
  beats: 2,
  cadenceHz: 1.6,
  reducedCadenceHz: 0.8,
});

const CLEAN_BURN = Object.freeze({
  id: 'clean_burn',
  codeName: 'Light hull / clean burn',
  means: 'Low mass, quick to dodge. Or: hold open for hire.',
  link: null,
  contact: null,
  attitude: 'cruise',
  rhythm: 'empty-bar',
  // "Three dim whites in a row" — the ventral empty bar, walked one lamp at a time.
  beats: 3,
  cadenceHz: 1.1,
  reducedCadenceHz: 0.6,
});

const STACKING = Object.freeze({
  id: 'stacking',
  codeName: 'Stacking',
  means: 'Committed to a station, claim dock or field approach. Blind cone forward. Give way.',
  link: null,
  contact: null,
  attitude: 'final',
  rhythm: 'bow-final',
  // Steady bow lamp plus "lateral thrusters tick in rhythmic corrections" — two beats, port then
  // starboard, at the fiction's explicit HALF cadence of a loaded run.
  beats: 2,
  cadenceHz: 0.8,
  reducedCadenceHz: 0.5,
});

const BLIND_CONE = Object.freeze({
  id: 'blind_cone',
  codeName: 'Blind cone',
  means: 'Extracting. Sensors half-blind from dust and bloom. Beam is hot; the crew is watching the seam, not the lane.',
  link: 'cut-beam',
  contact: 'face-spall',
  attitude: 'station-keep',
  rhythm: 'work-cone',
  // The flank work-cone strobe — "do not enter this arc" — sweeps the forbidden side continuously,
  // so the beat count is the number of flank pips, not an on/off pair.
  beats: 4,
  cadenceHz: 5.5,
  reducedCadenceHz: 2,
});

const ON_THE_PIN = Object.freeze({
  id: 'on_the_pin',
  codeName: 'On the pin',
  means: 'Watch, not transit. You are in a measured box.',
  link: 'sweep-lamp',
  contact: null,
  attitude: 'station-keep',
  rhythm: 'pin-sweep',
  // "A patrol that doesn't sweep is not a patrol." The sweep is continuous; beats index the sweep's
  // own revolution so the lamp reads as rotating hardware rather than a blinking dot.
  beats: 8,
  cadenceHz: 3.2,
  reducedCadenceHz: 1.2,
});

const MOUTH_OPEN = Object.freeze({
  id: 'mouth_open',
  codeName: 'Mouth open',
  means: 'Hold changing. The ship is soft — hard burn risks the transfer crew and the seal.',
  link: 'transfer-umbilical',
  contact: 'hatch-spill',
  attitude: 'station-keep',
  rhythm: 'mouth-open',
  // "Load-strobe off or IRREGULAR" — three beats against a two-beat arm swing never lines up, which
  // is what makes the cadence read as irregular without any randomness.
  beats: 3,
  cadenceHz: 2.6,
  reducedCadenceHz: 1.1,
});

const SPILLING_THE_COUNT = Object.freeze({
  id: 'spilling_the_count',
  codeName: 'Spilling the count',
  means: 'Delivering. The refinery, the moisture column, the trade desk is eating your hold.',
  link: 'transfer-umbilical',
  contact: 'tally-dust',
  attitude: 'station-keep',
  rhythm: 'tally',
  // Drift orange blink "synced to ore-tally ticks" — a fast, regular, countable pulse. It is the one
  // signal in the Code that a bystander is expected to literally count.
  beats: 5,
  cadenceHz: 4.4,
  reducedCadenceHz: 1.6,
});

const HOME_UNDER_ROCK = Object.freeze({
  id: 'home_under_rock',
  codeName: 'Home under rock',
  means: 'Field to home, hold full. Do not offer empty hire. Do not assume they will dodge well.',
  link: null,
  contact: 'tally-dust',
  attitude: 'cruise',
  rhythm: 'return-chevron',
  // Load-strobe AND the return chevron: "two amber lamps stacked". Two beats walking up the stack
  // gives the chevron a direction, which is the whole point of a chevron.
  beats: 2,
  cadenceHz: 1.4,
  reducedCadenceHz: 0.7,
});

const BREAKING_THE_PATTERN = Object.freeze({
  id: 'breaking_the_pattern',
  codeName: 'Breaking the pattern',
  means: 'Not working. Not stacking. Get clear or render aid.',
  link: null,
  contact: null,
  attitude: 'break',
  rhythm: 'distress-alternate',
  // "Alternating red-white global flash." Two beats, fast, and deliberately the highest cadence in
  // the Code — it must break any rhythm the reader has already locked onto.
  beats: 2,
  cadenceHz: 6.5,
  reducedCadenceHz: 2.4,
});

// ── The working trades (design/fiction/THE_WORKING_TRADES.md) ────────────────────────────────────
// Three states THE WORKING LIGHT already codified but nothing could show, because no job kind
// reached them. Each is deliberately built from a different combination of the four channels than
// any signal above, so the fleet does not converge into "ship with a blinking thing on it".

const READING_THE_DARK = Object.freeze({
  id: 'reading_the_dark',
  codeName: 'Reading the dark',
  means: 'Mapping, seam-finding, wreck sniffing. Not extracting yet. Lower threat than a cutter, higher interest than a hauler.',
  link: 'scan-sweep',
  contact: null,
  attitude: 'station-keep',
  rhythm: 'pulse-ring',
  // "Pulse. Wait. Pulse." — the Code's slowest working cadence, and the only signal whose whole
  // read is the SILENCE between beats. A surveyor that pulses fast is lost or lying.
  beats: 3,
  cadenceHz: 0.9,
  reducedCadenceHz: 0.55,
});

const PICKING_THE_BONES = Object.freeze({
  id: 'picking_the_bones',
  codeName: 'Picking the bones',
  means: 'Recovery, not murder-in-progress — if the umbrellas are on and the weapons are cold.',
  link: 'cut-arc',
  contact: 'scrap-cloud',
  attitude: 'station-keep',
  rhythm: 'salvage-umbrella',
  // Hooded floods aimed DOWN at the hull being stripped, plus intermittent cutter arcs. Deliberately
  // irregular against the miner's even work-cone: a wreck fights back in a way a rock does not.
  beats: 6,
  cadenceHz: 4.8,
  reducedCadenceHz: 1.8,
});

const HULL_OPEN = Object.freeze({
  id: 'hull_open',
  codeName: 'Hull open',
  means: 'Soft target by necessity. Do not bounce wake off them.',
  link: 'weld-stitch',
  // The one authored ABSENCE in the whole code. THE WORKING LIGHT is explicit that repair ADDS
  // material, so a tender throws no ejecta at all — and that missing channel is itself the signal
  // separating a repair rig from a salvor working two hundred units away.
  contact: null,
  attitude: 'station-keep',
  rhythm: 'men-at-work',
  // Static red corners that do NOT blink (the Code calls them "static red men-at-work corners"),
  // with the welding stars carrying the rhythm instead. Two beats, slow, so the corners read as
  // continuous presence rather than a warning flash.
  beats: 2,
  cadenceHz: 2.9,
  reducedCadenceHz: 1.2,
});

export const NPC_JOB_SIGNATURE_PROFILES = Object.freeze({
  reading_the_dark: READING_THE_DARK,
  picking_the_bones: PICKING_THE_BONES,
  hull_open: HULL_OPEN,
  spine_wake: SPINE_WAKE,
  heavy_burn: HEAVY_BURN,
  clean_burn: CLEAN_BURN,
  stacking: STACKING,
  blind_cone: BLIND_CONE,
  on_the_pin: ON_THE_PIN,
  mouth_open: MOUTH_OPEN,
  spilling_the_count: SPILLING_THE_COUNT,
  home_under_rock: HOME_UNDER_ROCK,
  breaking_the_pattern: BREAKING_THE_PATTERN,
});

// ─── Phase -> signal ──────────────────────────────────────────────────────────────────────────────
// Resolution is exact-match first, then a phase-generic fallback. Kinds that genuinely differ get an
// exact row; where the Code says every hull shows the same thing (a spine wake is a spine wake), the
// generic row carries it and no per-kind duplication is invented.

const EXACT = Object.freeze({
  // A patrol crossing between pins is still watching, so it keeps its sweep rather than borrowing a
  // freighter's cruise code. The Code is explicit that the sweep is what makes a patrol a patrol.
  'patrol:transit': ON_THE_PIN,
  'patrol:approach': ON_THE_PIN,
  'patrol:hold': ON_THE_PIN,
  // Inspection cutter: the same pin sweep a patrol shows. The sweep lamp is the scan.
  // Not a new profile — a cutter that borrowed a freighter's burn would stop looking like law.
  'cutter:transit': ON_THE_PIN,
  'cutter:approach': ON_THE_PIN,
  'cutter:hold': ON_THE_PIN,
  'customs:transit': ON_THE_PIN,
  'customs:approach': ON_THE_PIN,
  'customs:hold': ON_THE_PIN,
  // Only a miner works a rock face; only a miner comes home under rock.
  'miner:work': BLIND_CONE,
  'miner:return': HOME_UNDER_ROCK,
  // The working trades. Each claims `work` for itself, because "what this hull does when it is
  // stopped and busy" is the single most identifying thing about a trade — and it is exactly where
  // the three original kinds were indistinguishable.
  'surveyor:work': READING_THE_DARK,
  // A survey rig crabs its grid rather than cruising it. The Code says the pulse never stops, so
  // the transit legs keep the same signal instead of borrowing a freighter's cadence.
  'surveyor:transit': READING_THE_DARK,
  'surveyor:approach': READING_THE_DARK,
  'salvor:work': PICKING_THE_BONES,
  // Getting the cut piece aboard is still work on the wreck, not a berth transfer.
  'salvor:load': PICKING_THE_BONES,
  'salvor:return': HOME_UNDER_ROCK,
  'tender:work': HULL_OPEN,
  // A tender re-undocks for every call-out; the Code's spine wake is what that looks like, and it
  // is why a repair rig reads differently from a barge even before it arrives anywhere.
  'tender:depart': SPINE_WAKE,
});

const BY_PHASE = Object.freeze({
  commission: SPINE_WAKE,
  depart: SPINE_WAKE,
  approach: STACKING,
  work: BLIND_CONE,
  load: MOUTH_OPEN,
  unload: SPILLING_THE_COUNT,
  hold: ON_THE_PIN,
  flee: BREAKING_THE_PATTERN,
  // `transit` and `return` are resolved by LOAD state, not by phase name — see below. `complete` is
  // terminal and shows nothing: the job is over and the hull reverts to ordinary traffic.
});

// Fielded traffic roles arrive at this resolver under their hull names, not the kernel's six job
// kinds. A volatiles tanker is a heavy hauler; an inspection cutter runs a patrol beat. Two rows
// say that, rather than a kind-per-hull table of duplicate profiles.
const JOB_KIND_ALIASES = Object.freeze({
  tanker: 'hauler',
  customs: 'patrol',
  cutter: 'patrol',
});

/**
 * Resolve the signal a hull should be showing.
 *
 * @param {string} kind    job kind — 'miner' | 'hauler' | 'patrol'
 * @param {string} phase   kernel phase — see NPC_JOB_PHASE in ../systems/npcJobs.js
 * @param {boolean} loaded whether the hold is carrying. Decides heavy-burn vs clean-burn on the
 *                         transit legs, which is the single most-shown distinction in the Code
 *                         ("Amber heartbeat means mass. Respect mass.").
 * @returns {object|null}  a frozen profile, or null when the hull shows nothing at all
 */
export function resolveNpcJobSignature(kind, phase, loaded) {
  if (typeof phase !== 'string' || phase.length === 0) return null;
  const canonical = JOB_KIND_ALIASES[kind] || kind;
  const exact = EXACT[`${canonical}:${phase}`];
  if (exact) return exact;
  // Tanker included: a full hold is heavy_burn, an empty hold is clean_burn. Load picks
  // the existing pair. There is no tanker profile.
  if (phase === 'transit' || phase === 'return') {
    return loaded ? HEAVY_BURN : CLEAN_BURN;
  }
  return BY_PHASE[phase] || null;
}

/**
 * D3 adapter: prefer a Ceres causal-chain cue id (entity.data.ceresCausalCue) when it names a
 * known profile; otherwise fall back to ordinary job-phase resolution. No new profiles.
 */
export function resolveNpcJobSignaturePreferCue(kind, phase, loaded, cue) {
  if (typeof cue === 'string' && cue.length > 0) {
    const fromCue = NPC_JOB_SIGNATURE_PROFILES[cue];
    if (fromCue) return fromCue;
  }
  return resolveNpcJobSignature(kind, phase, loaded);
}

/**
 * Working light for a fielded tanker or inspection cutter.
 * The tanker kind uses the load rule (heavy burn / clean burn). The cutter kind uses the
 * pin sweep. Both results are entries of NPC_JOB_SIGNATURE_PROFILES — never a hull profile.
 *
 * @param {string} role traffic role — 'tanker' | 'customs' | 'cutter'
 * @param {string} phase kernel phase
 * @param {boolean} loaded hold is carrying
 * @returns {object|null}
 */
export function resolveFieldedCraftSignature(role, phase, loaded) {
  const craftRole = role === 'cutter' ? 'customs' : role;
  const craft = FIELD_JOB_SIGNATURE_CRAFT.find((row) => row && row.role === craftRole);
  if (!craft) return null;
  const kind = craftRole === 'customs' ? 'cutter' : craftRole;
  return resolveNpcJobSignature(kind, phase, loaded);
}

// ─── Deploy / stow ────────────────────────────────────────────────────────────────────────────────
// Working gear is not permanently out. A barge's magnet arms, a surveyor's pin boom, a salvor's
// umbrellas and a tender's plate racks all swing out to work and fold back to fly — that motion is
// the single cheapest piece of animation in the game, because it is one scalar and it is READ
// ENTIRELY FROM SILHOUETTE, which is the channel that survives distance.
//
// The scalar is derived, never stored: a job's phase and its elapsed time in that phase already say
// whether the gear should be out. Storing a deploy state would make it a second source of truth that
// could disagree with the phase, and a hull flying with its jaws still open is a bug that looks like
// an art asset problem.

/** Seconds a boom/arm/umbrella takes to swing out or fold back. Slow enough to be seen as motion. */
const DEPLOY_S = 2.6;

/** Phases in which a trade has its working gear extended. */
const GEAR_OUT_PHASES = new Set(['work', 'load', 'unload']);

/**
 * How far this hull's working gear is deployed, 0 (stowed) to 1 (fully out).
 *
 * Ramps in on entering a gear phase and ramps back out on leaving it, so the transition reads as
 * hardware moving rather than as an effect popping on. `sinceChange` is time spent in the CURRENT
 * phase; the caller owns that clock because it already tracks it for cadence.
 */
export function deployFraction(phase, sinceChange, reducedMotion) {
  const t = Math.max(0, Number.isFinite(sinceChange) ? sinceChange : 0);
  const span = reducedMotion ? DEPLOY_S * 0.5 : DEPLOY_S;
  const ramp = Math.max(0, Math.min(1, t / span));
  if (GEAR_OUT_PHASES.has(phase)) return ramp;
  // Leaving a work phase: the gear is still folding for the first DEPLOY_S of the next phase.
  return 1 - ramp;
}

// ─── Reactions ────────────────────────────────────────────────────────────────────────────────────
// "Objects and NPCs should respond to the player and to each other." A working hull that does not
// notice you is scenery no matter how well it is lit.
//
// Each trade reacts in its OWN currency, taken from its dossier's "how they react to a stranger
// closing" entry — the reaction is an extension of the trade, not a shared alarm state bolted onto
// everyone. A tender flinches because its crew is outside on the plate. A surveyor answers with the
// only instrument it has. A salvor keeps cutting and watches you, because stopping costs money and
// looking away costs more.

export const NPC_JOB_REACTION = Object.freeze({
  /** Deliberately sweep the newcomer — "the only instrument it has". Not hostile; pointed. */
  PAINT: 'paint',
  /** Stop mid-stroke. Crew outside on the plate; nobody welds while a stranger closes. */
  FLINCH: 'flinch',
  /** Keep working, but tilt the hoods to watch. Stopping costs money. */
  WATCH: 'watch',
  /** Douse the work lights. Bright work attracts the wrong attention. */
  GO_DARK: 'go_dark',
  /** Run the lamps up — be obviously, boringly legitimate. */
  BRIGHTEN: 'brighten',
  /** Nothing. Out of range, or this trade genuinely does not care. */
  NONE: 'none',
});

/** Inside this the hull has definitely noticed you. Matched to the visible bubble's outer edge so a
 *  reaction begins at about the moment the player could first see the hull at all. */
export const NPC_JOB_REACTION_RANGE = 260;

const REACTION_BY_KIND = Object.freeze({
  // "Pulse too loud near a Quiet door and you get counted." A surveyor answers with its instrument.
  surveyor: NPC_JOB_REACTION.PAINT,
  // "Recovery, not murder-in-progress — IF the umbrellas are on." A salvor will not douse them, and
  // will not stop; it tilts them and keeps one eye on you.
  salvor: NPC_JOB_REACTION.WATCH,
  // "Hit a marked repair and every Free and Drift radio for two sectors learns your name." The rig
  // stops because its people are outside.
  tender: NPC_JOB_REACTION.FLINCH,
  // "Loud greedy cut raises attention — pirates interdict bright work." A barge goes dark.
  miner: NPC_JOB_REACTION.GO_DARK,
  // An insured hull's defence is being boringly legitimate. It gets brighter, not quieter.
  hauler: NPC_JOB_REACTION.BRIGHTEN,
  // A patrol paints you. That is the entire job.
  patrol: NPC_JOB_REACTION.PAINT,
});

/**
 * What this hull does about the player being `distance` away.
 *
 * Returns a plain descriptor rather than mutating anything: this module cannot and must not change
 * what an NPC does, only how it looks doing it. A reaction is a presentation overlay on a job that
 * carries on underneath — the barge is still mining, it has just stopped advertising it.
 *
 * `intensity` ramps 0->1 as the player closes, so the reaction arrives as a slide rather than a
 * switch. A hull that snaps to full alarm at an invisible radius reads as scripted.
 */
export function resolveNpcJobReaction(kind, distance, phase) {
  const d = Number.isFinite(distance) ? distance : Infinity;
  if (d > NPC_JOB_REACTION_RANGE) return { id: NPC_JOB_REACTION.NONE, intensity: 0 };
  // A fleeing hull is already past reacting; a completed one is not working at all.
  if (phase === 'flee' || phase === 'complete') return { id: NPC_JOB_REACTION.NONE, intensity: 0 };
  const id = REACTION_BY_KIND[kind] || NPC_JOB_REACTION.NONE;
  if (id === NPC_JOB_REACTION.NONE) return { id, intensity: 0 };
  const intensity = Math.max(0, Math.min(1, 1 - d / NPC_JOB_REACTION_RANGE));
  return { id, intensity };
}

export function createNpcJobSignatureFrameScratch() {
  return {
    dirX: 1,
    dirZ: 0,
    normalX: 0,
    normalZ: 1,
    /** Integer beat index at the profile's cadence. Advances monotonically; the consumer compares it
     *  against its own last value so a signal emits exactly once per beat regardless of frame rate. */
    emitStep: -1,
    /** Which element of the code is lit this beat: 0..(profile.beats - 1). */
    beat: 0,
    /** Continuous 0..1 position within the current beat, for anything that slides rather than blinks. */
    beatT: 0,
    /** Continuous 0..1 around the whole code cycle — a sweep lamp's bearing, a chevron's travel. */
    cycleT: 0,
    /** Sweep bearing in radians, absolute (world), for `pin-sweep`. */
    sweepAngle: 0,
    /** Station-keeping chatter, -1..1. Working hulls jitter; cruising hulls do not. The research is
     *  explicit that this micro-motion is read before hull type is. */
    chatter: 0,
  };
}

function writeDirection(out, dx, dz) {
  // The finite guard is not defensive padding. A non-finite velocity component (a physics NaN, an
  // Infinity from a degenerate integration step) divides to NaN here, and a NaN direction propagates
  // straight into every streak position this signal emits — producing geometry the GPU silently
  // drops and a signal that vanishes with no error anywhere. Fail to the last good direction instead.
  const length = Math.hypot(dx, dz);
  if (Number.isFinite(length) && length > 1e-6) {
    const nx = dx / length;
    const nz = dz / length;
    if (Number.isFinite(nx) && Number.isFinite(nz)) {
      out.dirX = nx;
      out.dirZ = nz;
    }
  }
  out.normalX = -out.dirZ;
  out.normalZ = out.dirX;
}

/**
 * Write one hull's signal pose into `out` and return it.
 *
 * Positional scalar arguments keep this allocation-free: it runs once per live job per cadence tick
 * and must not produce garbage. The caller owns `out` for the slot's lifetime.
 *
 * `seed` de-phases hulls showing the SAME signal so eight patrols do not blink in lockstep — which
 * would read as one machine rather than eight crews. It is a stable per-job number, not RNG.
 */
export function writeNpcJobSignatureFrame(
  profile,
  elapsedS,
  headingRad,
  velX,
  velZ,
  seed,
  reducedMotion,
  out,
) {
  const frame = out || createNpcJobSignatureFrameScratch();
  if (!profile) return frame;

  const elapsed = Math.max(0, Number.isFinite(elapsedS) ? elapsedS : 0);
  const offset = Number.isFinite(seed) ? (seed % 1000) / 1000 : 0;

  // Facing: prefer real velocity, fall back to the hull's heading when parked. A station-keeping
  // miner has near-zero velocity, and reading direction from that noise would make its work cone
  // swing wildly — which is exactly the "idle thrash reads as a bug" failure the research warns of.
  const speed = Math.hypot(Number(velX) || 0, Number(velZ) || 0);
  if (speed > 0.5) {
    writeDirection(frame, velX, velZ);
  } else {
    const heading = Number.isFinite(headingRad) ? headingRad : 0;
    writeDirection(frame, Math.cos(heading), Math.sin(heading));
  }

  const cadence = reducedMotion ? profile.reducedCadenceHz : profile.cadenceHz;
  const beats = Math.max(1, profile.beats | 0);
  const scaled = elapsed * cadence + offset * beats;
  const step = Math.floor(scaled);
  frame.emitStep = step;
  // `%` on a negative would flip the beat order; `scaled` is non-negative by construction, but the
  // guard costs nothing and keeps a corrupt elapsedS from inverting the code.
  frame.beat = step >= 0 ? step % beats : 0;
  frame.beatT = scaled - step;
  frame.cycleT = (frame.beat + frame.beatT) / beats;
  frame.sweepAngle = frame.cycleT * TAU;

  // Only station-keeping hulls chatter. A cruising hull holds attitude — the research is explicit
  // that steady pose is itself the transit signal, and adding jitter to it would erase the contrast.
  if (profile.attitude === 'station-keep' && !reducedMotion) {
    frame.chatter = Math.sin(elapsed * 2.7 + offset * TAU) * Math.cos(elapsed * 1.13 + offset * 3.7);
  } else if (profile.attitude === 'break' && !reducedMotion) {
    // A breaking hull's plume is asymmetric — the Code's "not polite cadence". Larger and faster.
    frame.chatter = Math.sin(elapsed * 9.1 + offset * TAU);
  } else {
    frame.chatter = 0;
  }

  return frame;
}

// PIC-25 / WORLD-30 — one event, one record. Not a per-tick emitter and not a new profile.
const ORE_INTAKE_PROFILE_ID = 'mouth_open';
const _signatureGlassScratch = { x: 0, z: 0 };

/** True when this hull is inside the live table draw. Missing hulls are off glass. */
export function signatureSubjectOnGlass(state, subject) {
  if (!state || subject == null) return false;
  const entities = state.entities;
  const entity = subject && subject.pos
    ? subject
    : entities && typeof entities.get === 'function'
      ? entities.get(subject)
      : null;
  if (!entity || entity.alive === false || !entity.pos) return false;
  const player = entities && state.playerId != null && typeof entities.get === 'function'
    ? entities.get(state.playerId)
    : null;
  const drawWu = tableVfxDrawWuFromState(state);
  const delta = tableLookAtDelta(state, player && player.pos, entity.pos, _signatureGlassScratch);
  return shouldDrawTableVfx(delta.x, delta.z, drawWu);
}

/**
 * One intake record for `traffic:oreCollected`. The spark is the existing mouth-open
 * profile (hatch-spill at the intake). Null when the miner is not on glass.
 */
export function oreIntakeSignatureRecord(payload, state) {
  if (!payload || payload.carrierId == null) return null;
  if (!signatureSubjectOnGlass(state, payload.carrierId)) return null;
  const profile = NPC_JOB_SIGNATURE_PROFILES[ORE_INTAKE_PROFILE_ID];
  if (!profile) return null;
  return {
    kind: 'intake',
    carrierId: payload.carrierId,
    pickupId: payload.pickupId == null ? null : payload.pickupId,
    manifestId: payload.manifestId == null ? null : payload.manifestId,
    profileId: profile.id,
    profile,
    contact: profile.contact,
  };
}

/** Listen once. A repeat of the same collection does not push a second record. */
export function bindNpcJobOreIntake(bus, records, stateOf) {
  if (!bus || typeof bus.on !== 'function' || !records) return () => {};
  const seen = new Set();
  const onCollected = (payload) => {
    const state = typeof stateOf === 'function' ? stateOf() : stateOf;
    const rec = oreIntakeSignatureRecord(payload, state);
    if (!rec) return;
    const key = `${rec.carrierId}|${rec.manifestId}|${rec.pickupId}`;
    if (seen.has(key)) return;
    seen.add(key);
    records.push(rec);
  };
  bus.on('traffic:oreCollected', onCollected);
  return () => {
    if (typeof bus.off === 'function') bus.off('traffic:oreCollected', onCollected);
  };
}

/**
 * One threatened-miner reaction: the same profile a close player already draws
 * (`go_dark`), not a new marker. Null unless the job is a miner.
 */
export function threatenedMinerReactionRecord(payload) {
  if (!payload || payload.kind !== 'miner' || payload.jobId == null) return null;
  const close = resolveNpcJobReaction('miner', 0, 'work');
  if (!close || close.id === NPC_JOB_REACTION.NONE) return null;
  return {
    kind: 'threatened',
    jobId: payload.jobId,
    reactionId: close.id,
    intensity: close.intensity,
    once: true,
  };
}

/** One reaction record per miner job. A second `npcjobs:threatened` does not repeat it. */
export function bindNpcJobThreatReaction(bus, records) {
  if (!bus || typeof bus.on !== 'function' || !records) return () => {};
  const seen = new Set();
  const onThreat = (payload) => {
    const key = payload && payload.jobId != null ? String(payload.jobId) : '';
    if (!key || seen.has(key)) return;
    const rec = threatenedMinerReactionRecord(payload);
    if (!rec) return;
    seen.add(key);
    records.push(rec);
  };
  bus.on('npcjobs:threatened', onThreat);
  return () => {
    if (typeof bus.off === 'function') bus.off('npcjobs:threatened', onThreat);
  };
}

function reducedMotionOf(state) {
  const settings = state && state.settings || null;
  const video = settings && settings.video || null;
  const accessibility = settings && settings.accessibility || null;
  return !!((video && video.motionReduce) || (accessibility && accessibility.motionPreference === 'reduce'));
}

function ensureLiveCueState(host) {
  if (!host._npcIntakePending) host._npcIntakePending = new Map();
  if (!host._npcIntakeSeen) host._npcIntakeSeen = new Set();
  if (!host._npcThreatPending) host._npcThreatPending = new Map();
  if (!host._npcThreatShown) host._npcThreatShown = new Set();
}

function clearLiveCueState(host) {
  ensureLiveCueState(host);
  host._npcIntakePending.clear();
  host._npcIntakeSeen.clear();
  host._npcThreatPending.clear();
  host._npcThreatShown.clear();
}

function hostEntity(host, id) {
  if (!host || id == null) return null;
  if (typeof host._ent === 'function') return host._ent(id);
  const entities = host.state && host.state.entities;
  return entities && typeof entities.get === 'function' ? entities.get(id) : null;
}

function locateMinerJob(host, jobId) {
  const byId = host && host.state && host.state.npcJobs && host.state.npcJobs.byId;
  if (!byId || jobId == null) return null;
  const key = String(jobId);
  const direct = byId[key] || byId[jobId];
  if (direct && direct.job && !direct.job.corrupt) {
    const kind = direct.kind || direct.job.kind;
    if (kind === 'miner') return { jobId: key, entry: direct, job: direct.job };
  }
  for (const id in byId) {
    if (String(id) !== key) continue;
    const entry = byId[id];
    if (!entry || !entry.job || entry.job.corrupt) return null;
    const kind = entry.kind || entry.job.kind;
    if (kind !== 'miner') return null;
    return { jobId: String(id), entry, job: entry.job };
  }
  return null;
}

function minerJobForCarrier(host, carrierId) {
  const byId = host && host.state && host.state.npcJobs && host.state.npcJobs.byId;
  if (!byId || carrierId == null) return null;
  for (const id in byId) {
    const entry = byId[id];
    if (!entry || !entry.job || entry.job.corrupt) continue;
    if (String(entry.entityId) !== String(carrierId)) continue;
    const kind = entry.kind || entry.job.kind;
    if (kind !== 'miner') continue;
    return { jobId: String(id), entry, job: entry.job };
  }
  return null;
}

function slotClaimedThisPass(host, jobId) {
  const slots = host && host._npcJobSignatureSlots;
  if (!slots) return null;
  const gen = host._npcJobSignatureGen;
  const key = String(jobId);
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    if (slot && String(slot.jobId) === key && slot.gen === gen) return slot;
  }
  return null;
}

function noteOreCollected(host, payload) {
  if (!host || !host.state) return;
  ensureLiveCueState(host);
  const rec = oreIntakeSignatureRecord(payload, host.state);
  if (!rec) return;
  const key = `${rec.carrierId}|${rec.manifestId}|${rec.pickupId}`;
  if (host._npcIntakeSeen.has(key) || host._npcIntakePending.has(key)) return;
  host._npcIntakeSeen.add(key);
  host._npcIntakePending.set(key, rec);
}

function noteMinerThreatened(host, payload) {
  if (!host || !host.state) return;
  ensureLiveCueState(host);
  const rec = threatenedMinerReactionRecord(payload);
  if (!rec) return;
  const id = String(rec.jobId);
  if (host._npcThreatShown.has(id) || host._npcThreatPending.has(id)) return;
  const located = locateMinerJob(host, id);
  if (!located || !signatureSubjectOnGlass(host.state, located.entry.entityId)) return;
  host._npcThreatPending.set(id, rec);
}

function intakeScratch(host) {
  if (host._npcJobIntakeSlot) return host._npcJobIntakeSlot;
  host._npcJobIntakeSlot = {
    frame: createNpcJobSignatureFrameScratch(),
    deploy: 1,
    elapsed: 0,
    seed: 1,
    lastEmitStep: -1,
    profileId: ORE_INTAKE_PROFILE_ID,
    jobId: null,
  };
  return host._npcJobIntakeSlot;
}

function drawPendingIntakes(host) {
  const pending = host && host._npcIntakePending;
  if (!pending || pending.size === 0 || typeof host._emitNpcJobSignature !== 'function') return 0;
  const profile = NPC_JOB_SIGNATURE_PROFILES[ORE_INTAKE_PROFILE_ID];
  if (!profile) return 0;
  const reduced = reducedMotionOf(host.state);
  const slot = intakeScratch(host);
  let extra = 0;
  for (const [key, rec] of pending) {
    const ent = hostEntity(host, rec.carrierId);
    if (!ent || ent.alive === false || !signatureSubjectOnGlass(host.state, ent)) {
      pending.delete(key);
      continue;
    }
    const located = minerJobForCarrier(host, rec.carrierId);
    const job = located ? located.job : { kind: 'miner', phase: 'load' };
    writeNpcJobSignatureFrame(
      profile, 0,
      Number.isFinite(ent.rot) ? ent.rot : 0,
      ent.vel ? ent.vel.x : 0,
      ent.vel ? ent.vel.z : 0,
      slot.seed, reduced, slot.frame,
    );
    extra += host._emitNpcJobSignature(slot, profile, ent, job, reduced) || 0;
    host._lastNpcJobSignatureId = profile.id;
    pending.delete(key);
  }
  return extra;
}

function drawPendingThreats(host) {
  const pending = host && host._npcThreatPending;
  if (!pending || pending.size === 0) return 0;
  const close = resolveNpcJobReaction('miner', 0, 'work');
  const reduced = reducedMotionOf(host.state);
  let extra = 0;
  for (const [jobId] of pending) {
    const located = locateMinerJob(host, jobId);
    const ent = located && hostEntity(host, located.entry.entityId);
    const slot = slotClaimedThisPass(host, jobId);
    const onGlass = !!(ent && signatureSubjectOnGlass(host.state, ent) && slot);
    pending.delete(jobId);
    host._npcThreatShown.add(jobId);
    if (!onGlass || !close || close.id === NPC_JOB_REACTION.NONE) continue;
    if (slot.reaction !== close.id) {
      slot.reaction = close.id;
      slot.reactionT = close.intensity;
      if (typeof host._emitNpcJobReaction === 'function') {
        extra += host._emitNpcJobReaction(slot, ent, reduced) || 0;
      }
    }
    host._lastNpcJobReaction = close.id;
  }
  return extra;
}

function bindNpcJobLiveCues(host) {
  clearLiveCueState(host);
  if (typeof host._npcJobLiveCueOff === 'function') {
    try { host._npcJobLiveCueOff(); } catch { /* listener already gone */ }
    host._npcJobLiveCueOff = null;
  }
  const bus = host.bus;
  if (!bus || typeof bus.on !== 'function') return;
  const onOre = (payload) => noteOreCollected(host, payload);
  const onThreat = (payload) => noteMinerThreatened(host, payload);
  const onReset = () => clearLiveCueState(host);
  const offs = [];
  const add = (name, fn) => {
    const off = bus.on(name, fn);
    if (typeof off === 'function') offs.push(off);
  };
  add('traffic:oreCollected', onOre);
  add('npcjobs:threatened', onThreat);
  add('game:newGame', onReset);
  const unsub = () => {
    if (typeof bus.off === 'function') {
      bus.off('traffic:oreCollected', onOre);
      bus.off('npcjobs:threatened', onThreat);
      bus.off('game:newGame', onReset);
    }
    for (let i = 0; i < offs.length; i++) offs[i]();
  };
  host._npcJobLiveCueOff = unsub;
  if (Array.isArray(host._subs)) host._subs.push(unsub);
}

/**
 * The job-light draw (`vfx._updateNpcJobSignatures`) subscribes here.
 * One ore collection emits one open-hatch spark. One threat emits one go-dark.
 */
export function installNpcJobLiveSignatureDraw(vfxSystem) {
  if (!vfxSystem || vfxSystem._npcJobLiveSignatureInstalled) return vfxSystem;
  vfxSystem._npcJobLiveSignatureInstalled = true;
  const origInit = vfxSystem.init;
  vfxSystem.init = function npcJobLiveInit(ctx) {
    const result = origInit.apply(this, arguments);
    bindNpcJobLiveCues(this);
    return result;
  };
  const origDraw = vfxSystem._updateNpcJobSignatures;
  vfxSystem._updateNpcJobSignatures = function npcJobLiveDraw(step) {
    const emitted = origDraw.apply(this, arguments) || 0;
    return emitted + drawPendingIntakes(this) + drawPendingThreats(this);
  };
  const origUpdate = vfxSystem.update;
  if (typeof origUpdate === 'function') {
    vfxSystem.update = function npcJobLiveUpdate(dt, state) {
      const gen = this._npcJobSignatureGen;
      const result = origUpdate.apply(this, arguments);
      // The signature cadence did not run. Deliver a queued intake once; do not poll.
      if (this._npcJobSignatureGen === gen) drawPendingIntakes(this);
      return result;
    };
  }
  return vfxSystem;
}
