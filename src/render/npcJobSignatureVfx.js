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
  const exact = EXACT[`${kind}:${phase}`];
  if (exact) return exact;
  if (phase === 'transit' || phase === 'return') {
    return loaded ? HEAVY_BURN : CLEAN_BURN;
  }
  return BY_PHASE[phase] || null;
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
