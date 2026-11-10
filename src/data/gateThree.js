// src/data/gateThree.js — the Gate 3 weir (W-CAST-HANDS row 542, §34.8 / 03 §4.1).
// Hale and Dree share one post: the Customs Gate's weir cordon across the Tethys lane.
// Crossing the ring IS submitting — the scale reads hull plus loose freight against the
// manifest the papers declare (the hull's own mass), exactly the row-513 model encounter
// 700 runs. Hale files REF 44-C: the second fine, correctly, every time. Dree's mercy is
// the waved weir — one small over-mass, once ever, walked through open.
//
// The bureau expansion keeps the same fiction — the scale is honest; the manifest is
// on you — and adds the rest of a customs post's day:
//   · every crossing writes a weigh-slip ledger row; fines carry REF receipts
//   · some crossings are held for inspection — stay inside the ring while Dree
//     walks the hull, or bolt and the run is filed unread (plus the mark)
//   · a counter ring at the post sells Transit Bonds and hears contests —
//     dwell there at lane speed to transact
//   · the weir recalibrates on a maintenance clock: blind windows log transit
//     unread — the honest scale's one honest gap
//   · every hull in the lane is censused the same way — flagged haulers are
//     pulled aside to the hold point where traffic can watch them wait
export const GATE_THREE_WEIR = Object.freeze({
  sectorId: 'sector_tethys_junction',
  // The Customs Gate station (station_customs, sectorAnchors -640,-1180) — 'Everything
  // transits; nothing transits unread.'
  post: Object.freeze({ x: -640, z: -1180 }),
  // The cordon is a lane-scale ring, not a pad — you submit by crossing it.
  weirRadius: 180,
  // What the papers declare: the hull's own mass, like the barge's manifest minimum.
  manifestMinT: 1,
  finePerTCr: 38,          // REF 44-C is priced per unmanifested tonne, same tariff as 700.
  fineMinCr: 120,
  // Dree's wave covers a small over-mass — a lane's worth of slack, not a smuggler's hold.
  dreeWaveMaxT: 25,

  // ── The counter ring: a smaller circle at the post where the desk does business.
  //    Dwell inside it at lane speed to transact — contest the freshest open REF
  //    or buy a Transit Bond. One action per approach; leave the ring to re-arm.
  counterRadius: 64,
  deskDwellS: 4,           // hold this long at the desk for one action
  deskSpeedMax: 12,        // faster than this and the desk reads a flyby, not a customer
  // Contests: Dree overturns a REF when the over-mass is desk-error small; Hale
  // upholds the rest and prices the counter's time.
  contestMercyT: 12,
  contestFeeCr: 90,
  contestRepUp: 1,
  contestRepDown: -1,
  // Transit Bond: paid route authority — the tariff reads bonded hulls at a cut
  // fine for the window, and a clean window rebates part of the fee.
  bondFeeCr: 480,
  bondValidS: 1200,
  bondDiscount: 0.5,
  bondRebateCr: 200,
  bondRep: 1,
  // Concord standing courtesy: at this rank step and above a filed fine reads light.
  rankDiscount: 0.25,
  rankDiscountStep: 2,
  // Inspections: after the first-ever transit (the baseline read), a seeded share
  // of crossings are held while Dree walks the hull. A marked runner is held every
  // time until the mark cools. A ship with real standing is held less often.
  inspectPct: 20,          // percent of eligible crossings held
  inspectS: 6,             // the walk takes this long inside the ring
  flaggedS: 300,           // a weir run marks the hull for this long
  rankInspectMult: 0.5,    // rank step >= rankDiscountStep halves the hold chance
  // Weir run: bolting mid-hold files the pending verdict unread plus the runner
  // surcharge, which steps up for repeat runners, plus the standing mark.
  evasionFeeCr: 220,
  evasionStepCr: 140,
  evasionStepCap: 3,
  evasionRepHit: -4,
  // Maintenance: the cordon recalibrates on a slow seeded cadence. During the
  // window the scale is blind — transits log unread, no weigh, no hold, no fine.
  maintenancePeriodS: 1500,
  maintenanceS: 90,
  maintenanceJitterS: 600,
  // The lane census: every other hull crossing the ring is weighed on the same
  // model. Over-mass haulers are flagged and nudged to the hold point.
  logCap: 24,              // the weigh-slip book is bounded
  laneCap: 16,             // recent lane verdicts, bounded
  laneVerdictsPerCensus: 4,// the desk reads this many lane hulls per pass, tops
  lanePullS: 3,            // a flagged hauler is walked aside for this long
  lanePullDv: 6,           // WU/s nudge per census toward the hold point — a walk, not a fling
  laneBarkS: 45,           // lane chatter cooldown — the desk does not narrate every hull
  holdOffset: Object.freeze({ x: 120, z: 40 }), // the hold point beside the post

  factionId: 'faction_scn',

  announceFlag: 'gate3_weir_announced',
  waveFlag: 'dree_weir_waived',
  countFlag: 'hale_fines_filed',
  runFlag: 'gate3_weir_runs',
  inspectFlag: 'gate3_inspections_held',
  contestWonFlag: 'gate3_contests_won',
  bondCountFlag: 'gate3_bonds_written',
  sender: 'GATE 3 CUSTOMS',
  announce: 'Gate 3 reads every hull that crosses its weir. The scale is honest; the manifest is on you.',
  clean: 'Weighing {read}t against a {manifest}t manifest — clean. Transit logged.',
  waived: 'OVER MASS: {over}t your papers do not carry. Inspector Dree waves the weir — once. REF 44-C stayed in the drawer.',
  fined: 'OVER MASS: {over}t your papers do not carry. REF 44-C filed — {fine} cr against the note. Hale files the second fine correctly.',
  // The bureau's lines, same voices.
  heldPrefix: 'Dree closes the walk: ',
  hold: 'HOLD FOR INSPECTION — Inspector Dree walks the hull. Stay inside the weir.',
  evaded: 'WEIR RUN — the scale had already read the hull. REF {receipt} filed unread: {fine} cr against the note, and the gate marks the runner.',
  contestOverturned: 'REF {receipt} — Dree reads the slip twice. {over}t is desk error, not a hold\'s worth: the filing is struck and {fine} cr returns to the note.',
  contestUpheld: 'REF {receipt} — Hale reads the scale log. {over}t over the manifest is a filing, not a mistake. The REF stands; {fee} cr counter fee.',
  bondWritten: 'TRANSIT BOND {receipt} written — {fee} cr. For {mins} minutes the tariff reads you at half a filed fine; close the window clean and {rebate} cr rides home.',
  bondLive: 'Bond {receipt} is live — {mins} minutes still on the window.',
  bondDenied: 'The counter needs {fee} cr on the note to write a transit bond. Come back heavier.',
  bondMarked: 'The counter does not write bonds for marked hulls. Cool the mark first.',
  bondLapsed: 'Bond {receipt} closed clean — {rebate} cr rides home with a transit commendation.',
  bondLapsedSpent: 'Bond {receipt} closed — the discount was the bond.',
  blindOpen: 'WEIR RECALIBRATING — for {s} seconds the scale is blind. Transit logs unread.',
  blindTransit: 'Scale blind — transit logged unread. The weir owes you a weighing.',
  laneHeld: 'LANE: hauler {tag} pulled aside at the cordon — {over}t its papers do not carry.',
  deskBusy: 'The desk is mid-inspection — hold inside the ring.',
  blindLabel: 'Gate 3 customs weir — RECALIBRATING',
});
