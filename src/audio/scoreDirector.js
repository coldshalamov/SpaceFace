// THE EAR — score director. One presentation-only reader of the music inputs the audio host
// already resolves (docked / wanted / threat / sector / faction / swarm chain), turned into the
// musical decision: which phase of the player's story this is (arrival, travel, work, threat,
// fight, aftermath, dock, departure), how hard the music should push, when the next phrase
// boundary lands, and what key/mode/colour the current place and faction put on the harmony.
// It owns no AudioContext and never writes sim state; wall/audio time comes from the caller.

export const SCORE_DIRECTOR_SCHEMA = 'spaceface.scoreDirector.v1';

export const SCORE_PHASES = Object.freeze([
  'arrival', 'travel', 'work', 'threat', 'fight', 'aftermath', 'dock', 'departure',
]);

export const ARRIVAL_S = 12;
export const DEPARTURE_S = 8;
export const AFTERMATH_S = 16;
export const FIGHT_THREAT = 0.6;
export const THREAT_ENTER = 0.3;
export const THREAT_EXIT = 0.18;
export const INTENSITY_ATTACK_S = 0.6;
export const INTENSITY_RELEASE_S = 3.2;
export const BEATS_PER_BAR = 4;
export const BARS_PER_PHRASE = 4;
// A non-fight phase change must hold this long before it lands, so a single stale read (a theme
// refresh without the threat context) cannot drop a fight into its aftermath for one tick.
export const PHASE_DEBOUNCE_S = 0.3;

// Engine-native tempi of the four progressive stems (audioSystem stems A..D).
export const PHASE_STEM = Object.freeze({
  arrival: 'A', travel: 'A', work: 'A', threat: 'B', fight: 'C', aftermath: 'A', dock: 'D', departure: 'A',
});
export const STEM_BPM = Object.freeze({ A: 122, B: 124, C: 128, D: 116 });

// How long the music may wait before a change lands: a fight cannot wait a phrase, a
// resolution should. Units are bars of the incoming stem.
export const PHASE_QUANTIZE_BARS = Object.freeze({
  fight: 0.25, threat: 1, arrival: 1, travel: 2, work: 2, aftermath: 2, dock: 1, departure: 1,
});

export const MODES = Object.freeze({
  ionian: Object.freeze([0, 2, 4, 5, 7, 9, 11]),
  dorian: Object.freeze([0, 2, 3, 5, 7, 9, 10]),
  phrygian: Object.freeze([0, 1, 3, 5, 7, 8, 10]),
  lydian: Object.freeze([0, 2, 4, 6, 7, 9, 11]),
  mixolydian: Object.freeze([0, 2, 4, 5, 7, 9, 10]),
  aeolian: Object.freeze([0, 2, 3, 5, 7, 8, 10]),
});

// Scale-degree progressions (0 = tonic) per music state, eight bars each. The aeolian reading of
// travel is the engine's own Am9-F-C-G-Dm-G-C-Em, so a sector in A aeolian sounds exactly like the
// landed engine; every other sector moves the same song into its own key and mode.
export const STATE_PROGRESSIONS = Object.freeze({
  calm: Object.freeze([0, 5, 2, 6, 3, 6, 2, 4]),
  tense: Object.freeze([0, 3, 5, 4, 0, 3, 1, 4]),
  combat: Object.freeze([0, 5, 3, 4, 0, 5, 6, 4]),
  docked: Object.freeze([2, 0, 5, 6, 2, 0, 3, 6]),
  aftermath: Object.freeze([5, 3, 0, 0, 5, 6, 0, 0]),
});

function identity(id, tonic, mode, tempo, colour, room, label) {
  return Object.freeze({ id, tonic, mode, tempo, colour, room, label });
}

// Tonic is semitones from the engine's A. Each sector owns a unique (tonic, mode) pair.
export const SECTOR_SCORE_IDENTITY = Object.freeze({
  sector_helios_prime: identity('sector_helios_prime', 0, 'dorian', 0, 'glass', 'civic', 'Helios Prime — A dorian, glass'),
  sector_ceres_belt: identity('sector_ceres_belt', -3, 'aeolian', -2, 'grit', 'belt', 'Ceres Belt — F# aeolian, grit'),
  sector_tethys_junction: identity('sector_tethys_junction', 3, 'mixolydian', 2, 'signal', 'junction', 'Tethys Junction — C mixolydian, signal'),
  sector_vesta_forge: identity('sector_vesta_forge', -5, 'phrygian', 1, 'forge', 'forge', 'Vesta Forge — E phrygian, forge'),
  sector_pallas_drift: identity('sector_pallas_drift', -7, 'lydian', -4, 'drift', 'drift', 'Pallas Drift — D lydian, drift'),
  sector_io_reach: identity('sector_io_reach', -2, 'aeolian', 0, 'reach', 'reach', 'Io Reach — G aeolian, reach'),
  sector_charon_expanse: identity('sector_charon_expanse', 2, 'phrygian', -3, 'cold', 'deep', 'Charon Expanse — B phrygian, cold'),
  sector_sker_haven: identity('sector_sker_haven', 1, 'phrygian', 3, 'rust', 'haven', 'Sker Haven — Bb phrygian, rust'),
  sector_veil_nebula: identity('sector_veil_nebula', -6, 'lydian', -6, 'choir', 'nebula', 'Veil Nebula — Eb lydian, choir'),
  sector_ashfall_reach: identity('sector_ashfall_reach', 4, 'aeolian', 1, 'ash', 'ash', 'Ashfall Reach — C# aeolian, ash'),
});

export const DEFAULT_SCORE_IDENTITY = identity('void', 0, 'aeolian', 0, 'void', 'void', 'Open void — A aeolian');

function colour(id, cell, accent, timbre, label, pedal) {
  return Object.freeze({ id, cell: Object.freeze(cell), accent, timbre, label, pedal });
}

// Faction colour: an interval cell (scale degrees answered on the phrase turnaround), the beat
// the faction leans on, a timbre family, and the pedal interval (semitones) it hangs over the
// sector tonic in the room. Cells are unique so a faction is a shape you hum.
export const FACTION_SCORE_COLOUR = Object.freeze({
  faction_scn: colour('faction_scn', [0, 4, 7], 0, 'brass', 'Concord — civic fifth-call', 7),
  faction_mts: colour('faction_mts', [0, 2, 4, 2], 2, 'pluck', 'Meridian — routing turn', 4),
  faction_dmc: colour('faction_dmc', [4, 3, 0], 1, 'reed', 'Drift — falling ballad', 3),
  faction_reach: colour('faction_reach', [0, 1, 0, 4], 3, 'grit', 'Reach — leaning half-step', 1),
  faction_quiet: colour('faction_quiet', [7, 7, 0], 0, 'tone', 'Quiet — numbers repeat', 0),
  faction_choir: colour('faction_choir', [0, 2, 6], 2, 'choir', 'Choir — open suspension', 6),
  faction_free: colour('faction_free', [0, 3, 4], 1, 'pluck', 'Frontier — rising question', 5),
  faction_vael: colour('faction_vael', [0, 6, 5], 0, 'glass', 'Vael — far seventh', 11),
  faction_archive: colour('faction_archive', [0, 5, 2], 2, 'bell', 'Archive — catalogue fourth', 5),
  faction_fulfillment: colour('faction_fulfillment', [0, 0, 1, 2], 1, 'pluck', 'Fulfillment — conveyor step', 2),
  faction_pitborn: colour('faction_pitborn', [0, 1, 6], 3, 'grit', 'Pitborn — tritone growl', 6),
  faction_understory: colour('faction_understory', [0, 4, 3, 1], 2, 'reed', 'Understory — root walk', 3),
  faction_verge_layers: colour('faction_verge_layers', [6, 4, 6, 0], 0, 'tone', 'Verge-Layer — high flicker', 10),
});

function hash32(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const MODE_NAMES = Object.freeze(Object.keys(MODES));
const UNKNOWN_COLOURS = Object.freeze(['glass', 'grit', 'signal', 'drift', 'cold', 'choir']);

export function resolveScoreIdentity(sectorId) {
  if (!sectorId) return DEFAULT_SCORE_IDENTITY;
  const row = SECTOR_SCORE_IDENTITY[sectorId];
  if (row) return row;
  const h = hash32(String(sectorId));
  return identity(String(sectorId), (h % 12) - 6, MODE_NAMES[(h >>> 4) % MODE_NAMES.length],
    ((h >>> 8) % 7) - 3, UNKNOWN_COLOURS[(h >>> 12) % UNKNOWN_COLOURS.length], 'void',
    `${sectorId} — derived`);
}

// Fold a tonic into [-6, +5] so a transposed engine never drops its sub bass under ~40 Hz.
export function foldTonic(tonic) {
  return ((((Number(tonic) || 0) + 6) % 12) + 12) % 12 - 6;
}

const PITCH_CLASS = Object.freeze({
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5,
  'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
});

// The engine's sequencers are written in A aeolian note names. Moving them into a sector's key
// and mode is one mapping: each diatonic A-aeolian tone becomes the same scale degree of the
// sector mode, transposed to its tonic; chromatic colour (the tense Bb, the dominant's G#) keeps
// its distance from the moved root.
export function scoreNoteHz(note, octave = 4, identityRow = null) {
  const pc = PITCH_CLASS[note];
  if (pc == null) return 440;
  const base = 440 * Math.pow(2, (pc - 9) / 12 + (octave - 4));
  if (!identityRow) return base;
  const rel = (pc - 9 + 12) % 12;
  const idx = MODES.aeolian.indexOf(rel);
  const scale = MODES[identityRow.mode] || MODES.aeolian;
  const moved = idx >= 0 ? scale[idx] : rel;
  return base * Math.pow(2, (moved - rel + foldTonic(identityRow.tonic)) / 12);
}

export function resolveFactionColour(factionId) {
  return (factionId && FACTION_SCORE_COLOUR[factionId]) || null;
}

function clamp01(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}

// Diatonic chord on a scale degree: stacked thirds in the sector's mode, as semitone offsets
// from A. `raiseLeading` gives minor modes a major dominant for combat cadences.
export function scaleChord(identityRow, degree, opts = {}) {
  const row = identityRow || DEFAULT_SCORE_IDENTITY;
  const scale = MODES[row.mode] || MODES.aeolian;
  const size = opts.size || 4;
  const tones = [];
  for (let i = 0; i < size; i += 1) {
    const step = degree + i * 2;
    const octave = Math.floor(step / 7);
    let semis = scale[((step % 7) + 7) % 7] + octave * 12;
    if (opts.raiseLeading && ((step % 7) + 7) % 7 === 6 && scale[6] === 10 && ((degree % 7) + 7) % 7 === 4) semis += 1;
    tones.push(row.tonic + semis);
  }
  return Object.freeze(tones);
}

export function semitoneHz(baseHz, semis) {
  return baseHz * Math.pow(2, semis / 12);
}

export function scoreChordForBar(identityRow, musicState, barIndex) {
  const prog = STATE_PROGRESSIONS[musicState] || STATE_PROGRESSIONS.calm;
  const bar = ((Math.floor(barIndex) % prog.length) + prog.length) % prog.length;
  const degree = prog[bar];
  return Object.freeze({
    bar,
    degree,
    tones: scaleChord(identityRow, degree, { raiseLeading: musicState === 'combat' || musicState === 'tense' }),
  });
}

// Next musical boundary at or after `nowS` on a grid anchored at `anchorS`.
export function nextPhraseBoundary(nowS, anchorS, bpm, bars = 1) {
  const now = Number(nowS) || 0;
  const anchor = Number.isFinite(anchorS) ? anchorS : now;
  const tempo = Number(bpm) > 0 ? Number(bpm) : 120;
  const unit = (60 / tempo) * BEATS_PER_BAR * Math.max(0.0625, Number(bars) || 1);
  if (now <= anchor) return anchor;
  const n = Math.ceil((now - anchor) / unit - 1e-9);
  return anchor + n * unit;
}

export function phaseBpm(phase, identityRow) {
  const stem = PHASE_STEM[phase] || 'A';
  const row = identityRow || DEFAULT_SCORE_IDENTITY;
  return STEM_BPM[stem] + (row.tempo || 0) * (phase === 'fight' ? 0.5 : 1);
}

export function phaseMusicState(phase) {
  if (phase === 'fight') return 'combat';
  if (phase === 'threat') return 'tense';
  if (phase === 'dock') return 'docked';
  if (phase === 'aftermath') return 'aftermath';
  return 'calm';
}

// Continuous stem faders for a phase at an intensity. Fight at 0.6 is a held breath with the
// calm lead still in it; fight at 1.0 is the full drop. Aftermath carries the calm stem with a
// thinning tail of the fight stem so the last hit resolves instead of cutting.
export function phaseStemWeights(phase, intensity, aftermathT = 0) {
  const i = clamp01(intensity);
  switch (phase) {
    case 'fight':
      return Object.freeze({ A: 0.35 - 0.25 * i, B: 0.55 - 0.3 * i, C: 0.55 + 0.45 * i, D: 0 });
    case 'threat':
      return Object.freeze({ A: 0.6 - 0.4 * i, B: 0.45 + 0.55 * i, C: 0.25 * i, D: 0 });
    case 'aftermath': {
      const t = clamp01(aftermathT);
      return Object.freeze({ A: 0.45 + 0.55 * t, B: 0.25 * (1 - t), C: 0.35 * (1 - t) * (1 - t), D: 0 });
    }
    case 'dock':
      return Object.freeze({ A: 0.12, B: 0, C: 0, D: 0.7 + 0.3 * (1 - i) });
    case 'departure':
      return Object.freeze({ A: 0.85, B: 0, C: 0, D: 0.3 });
    case 'arrival':
      return Object.freeze({ A: 0.7, B: 0.1, C: 0, D: 0 });
    case 'work':
      return Object.freeze({ A: 0.8, B: 0.12, C: 0, D: 0 });
    default:
      return Object.freeze({ A: 0.75 + 0.25 * i, B: 0, C: 0, D: 0 });
  }
}

// Room-tone mix for the place layer. The room is the first thing back after a fight and the
// first thing to step aside for one; arrival opens the room from closed.
export function phaseRoomMix(phase, intensity, phaseT = 1) {
  const i = clamp01(intensity);
  const t = clamp01(phaseT);
  switch (phase) {
    case 'fight': return Object.freeze({ level: 0.32, air: 0.5, sub: 0.4, events: 0, open: 1 });
    case 'threat': return Object.freeze({ level: 0.7 - 0.3 * i, air: 0.85, sub: 0.9, events: 0.35, open: 1 });
    case 'aftermath': return Object.freeze({ level: 0.6 + 0.55 * Math.sin(Math.PI * Math.min(1, t * 1.6)) * (1 - 0.4 * t), air: 1.15, sub: 0.8, events: 0.5 + 0.5 * t, open: 1 });
    case 'arrival': return Object.freeze({ level: 0.4 + 0.75 * t, air: 1, sub: 1, events: 0.6 * t, open: t });
    case 'dock': return Object.freeze({ level: 0.85, air: 0.7, sub: 0.35, events: 0.8, open: 1 });
    case 'departure': return Object.freeze({ level: 0.6 + 0.4 * t, air: 1, sub: 0.7 + 0.3 * t, events: 0.4, open: 1 });
    case 'work': return Object.freeze({ level: 0.9, air: 0.9, sub: 1, events: 1, open: 1 });
    default: return Object.freeze({ level: 1, air: 1, sub: 1, events: 1, open: 1 });
  }
}

function phaseTarget(phase, input, aftermathT, peak) {
  const threat = clamp01(input.threat);
  const lift = clamp01(input.swarmLift);
  switch (phase) {
    case 'fight': return Math.min(1, 0.55 + 0.4 * threat + 0.25 * lift);
    case 'threat': return 0.3 + 0.45 * threat;
    case 'aftermath': return (0.18 + 0.5 * peak) * (1 - aftermathT) + 0.12 * aftermathT;
    case 'dock': return 0.1;
    case 'arrival': return 0.35;
    case 'departure': return 0.3;
    case 'work': return 0.32;
    default: return 0.22;
  }
}

export function createScoreDirector(options = {}) {
  const arrivalS = options.arrivalS ?? ARRIVAL_S;
  const departureS = options.departureS ?? DEPARTURE_S;
  const aftermathS = options.aftermathS ?? AFTERMATH_S;
  const mem = {
    t: null, phase: 'travel', phaseSince: 0, sectorId: undefined, docked: false,
    intensity: 0.2, peak: 0, lastFightAt: -Infinity, arrivalAt: -Infinity, departureAt: -Infinity,
    threatLatched: false, anchor: 0, t0: 0, pendingPhase: null, pendingSince: 0, transitionAt: 0, frame: null, transitions: 0,
  };

  function choosePhase(input, now, allowAftermath) {
    const threat = clamp01(input.threat);
    if (input.docked) return 'dock';
    const fighting = !!input.inCombat || threat >= FIGHT_THREAT;
    if (fighting) return 'fight';
    mem.threatLatched = mem.threatLatched ? threat > THREAT_EXIT : threat >= THREAT_ENTER;
    if (mem.threatLatched || input.wanted) return 'threat';
    if (allowAftermath && now - mem.lastFightAt < aftermathS) return 'aftermath';
    if (now - mem.arrivalAt < arrivalS) return 'arrival';
    if (now - mem.departureAt < departureS) return 'departure';
    if (input.working) return 'work';
    return 'travel';
  }

  function step(input = {}, nowS = 0) {
    const now = Number(nowS) || 0;
    const dt = mem.t == null ? 0 : Math.max(0, Math.min(1, now - mem.t));
    if (mem.t == null) { mem.anchor = now; mem.t0 = now; }
    mem.t = now;
    const sectorId = input.sectorId || null;
    if (mem.sectorId !== undefined && sectorId !== mem.sectorId && !input.docked) mem.arrivalAt = now;
    mem.sectorId = sectorId;
    const docked = !!input.docked;
    if (mem.docked && !docked) mem.departureAt = now;
    mem.docked = docked;

    const prevPhase = mem.phase;
    if (prevPhase === 'fight') mem.lastFightAt = now;
    // Aftermath only follows the fight it resolves: docking or a sector jump closes the story.
    const allowAftermath = prevPhase === 'fight' || prevPhase === 'aftermath' || prevPhase === 'threat';
    const candidate = choosePhase(input, now, allowAftermath);
    let phase = prevPhase;
    if (candidate === prevPhase || candidate === 'fight' || candidate === 'dock' || prevPhase === 'dock'
      || mem.t0 === now) {
      mem.pendingPhase = null;
      phase = candidate;
    } else if (mem.pendingPhase !== candidate) {
      mem.pendingPhase = candidate;
      mem.pendingSince = now;
    } else if (now - mem.pendingSince >= PHASE_DEBOUNCE_S) {
      mem.pendingPhase = null;
      phase = candidate;
    }
    if (phase === 'fight') {
      mem.lastFightAt = now;
      mem.peak = Math.max(mem.peak, clamp01(input.threat), clamp01(input.swarmLift));
    } else if (phase !== 'aftermath' && phase !== 'threat') {
      mem.peak = 0;
    }
    const identityRow = resolveScoreIdentity(sectorId);
    const bpm = phaseBpm(phase, identityRow);
    if (phase !== prevPhase) {
      mem.transitions += 1;
      mem.phaseSince = now;
      mem.transitionAt = nextPhraseBoundary(now, mem.anchor, bpm, PHASE_QUANTIZE_BARS[phase] || 1);
      mem.phase = phase;
    }
    const aftermathT = phase === 'aftermath' ? clamp01((now - mem.lastFightAt) / aftermathS) : 0;
    const phaseSpan = phase === 'arrival' ? arrivalS : phase === 'departure' ? departureS : phase === 'aftermath' ? aftermathS : 4;
    const phaseT = clamp01((now - mem.phaseSince) / phaseSpan);
    const target = phaseTarget(phase, input, aftermathT, mem.peak);
    const tc = target > mem.intensity ? INTENSITY_ATTACK_S : INTENSITY_RELEASE_S;
    mem.intensity = dt > 0 ? mem.intensity + (target - mem.intensity) * (1 - Math.exp(-dt / tc)) : target;
    const musicState = phaseMusicState(phase);
    const barLen = (60 / bpm) * BEATS_PER_BAR;
    const barIndex = Math.floor(Math.max(0, now - mem.anchor) / barLen);
    mem.frame = Object.freeze({
      schema: SCORE_DIRECTOR_SCHEMA,
      phase,
      previousPhase: prevPhase,
      changed: phase !== prevPhase,
      since: mem.phaseSince,
      phaseT,
      transitionAt: mem.transitionAt,
      intensity: mem.intensity,
      target,
      musicState,
      stem: PHASE_STEM[phase],
      bpm,
      barIndex,
      phraseBar: barIndex % BARS_PER_PHRASE,
      stemWeights: phaseStemWeights(phase, mem.intensity, aftermathT),
      room: phaseRoomMix(phase, mem.intensity, phase === 'aftermath' ? aftermathT : phaseT),
      identity: identityRow,
      chord: scoreChordForBar(identityRow, musicState, barIndex),
      faction: resolveFactionColour(input.factionId),
      sectorId,
      transitions: mem.transitions,
    });
    return mem.frame;
  }

  return {
    step,
    get frame() { return mem.frame; },
    reset() { mem.t = null; mem.phase = 'travel'; mem.sectorId = undefined; mem.docked = false; mem.peak = 0;
      mem.lastFightAt = -Infinity; mem.arrivalAt = -Infinity; mem.departureAt = -Infinity; mem.threatLatched = false;
      mem.pendingPhase = null; mem.intensity = 0.2; mem.frame = null; mem.transitions = 0; },
  };
}

export function scoreIdentitiesAreDistinct() {
  const pairs = new Set();
  for (const row of Object.values(SECTOR_SCORE_IDENTITY)) {
    const key = `${((row.tonic % 12) + 12) % 12}:${row.mode}`;
    if (pairs.has(key)) return false;
    pairs.add(key);
  }
  const cells = new Set();
  for (const row of Object.values(FACTION_SCORE_COLOUR)) {
    const key = row.cell.join(',');
    if (cells.has(key)) return false;
    cells.add(key);
  }
  return true;
}
