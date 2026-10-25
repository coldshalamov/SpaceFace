// src/data/bellhop.js — BELLHOP / CB-9, the Choir bell-tuning drone (W-SHIFT
// row 506, 03 §4.3). Phoebe Echo is named for a return: the shrine's song broke
// and the Choir stopped answering. A bell-tuning drone still stands the chime
// floor west of the Echo Shrine with five crystals hung in an arc and one job
// left: ring them in order. Strike a crystal with anything that hits hard — a
// thrown rock is the intended verb — and it chimes; ring the song's sequence
// and CB-9 calls the steps ('Again. Lower. There.'). Finish the phrase and the
// song holds: the crystals stand tuned, the drone hums it back on return, and
// the shrine pays a small tuning fee for the hand that rang it.
export const BELLHOP = Object.freeze({
  sectorId: 'sector_phoebe_echo',
  // The chime floor on open ice west of the Echo Shrine
  // (station_phoebe_echo 280,-960; The Answer array sits far north-west).
  post: Object.freeze({ x: 80, z: -760 }),
  // Five crystals hung in an arc facing the drone — the song is their order.
  crystalCount: 5,
  crystalRadius: 230,
  arcBearing: 2.4,           // arc center direction out from the post
  arcSpread: 1.9,            // radians the five crystals span
  // The broken song: which crystal index rings next. Authored, fixed forever —
  // the same five notes the Choir left half-played.
  song: Object.freeze([2, 0, 4, 1, 3]),
  // A strike counts when a real physics impact lands with this much impulse —
  // a drift-brush never rings; a thrown rock always does. Debounce keeps a
  // ringing hit from double-counting its own bounce.
  minImpulse: 40,
  ringDebounceTicks: 24,
  // story flags: song progress (0..song.length), the learned receipt, the pay,
  // the durability.
  progressFlag: 'bellhop_progress',
  sungFlag: 'bellhop_sung',
  paidFlag: 'bellhop_paid',
  goneFlag: 'bellhop_gone',
  payCr: 300,
  sender: 'BELLHOP / CB-9',
  callsign: 'CB-9',
  announce: 'CB-9 at the chime. The song broke and the Choir stopped answering. Ring the crystals in order — I will tell you when you are wrong.',
  // Canon payoff line: "Again. Lower. There." — the step calls.
  wrongLine: 'AGAIN.',
  // Step calls indexed by song position rung correctly.
  stepLines: Object.freeze(['LOWER.', 'HIGHER.', 'LOWER AGAIN.', 'NEARLY — ONE MORE.', 'THERE.']),
  sungLine: 'THERE. THE SONG HOLDS. THE SHRINE REMEMBERS IT NOW. A TUNING FEE FOR THE HAND THAT RANG IT.',
  repriseLine: 'The song holds. Ring them if you like — the Choir is listening.',
  goneLine: 'CB-9 DOWN. THE CRYSTALS KEEP THEIR OWN TIME NOW.',
});
