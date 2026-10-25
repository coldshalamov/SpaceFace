// src/data/holdfast.js — HOLDFAST / AN-1, the ice-anchor holding the rift
// (W-SHIFT row 506, 03 §4.3). Haumea Rift's fissure is the machine and the
// landmark — "the shift left mid-bite and the fissure kept the tools." An
// ice-anchor robot still stands the lip with four empty clamps and one verb:
// holding. Tow a drifting ice spire into a clamp and the seat drops the crack's
// run; seat all four before the crack tops out and the rift holds — and the
// robot pays one weighed Measure Engine fragment, because AN-1 is Line kin and
// a held rift IS a weighing (06: HOLDFAST is one of the three members that
// unlock a Line Class trial). The crack never stops trying — a topped-out run
// shakes a seated spire loose and the holding resumes, because that is the job.
export const HOLDFAST = Object.freeze({
  sectorId: 'sector_haumea_rift',
  // The anchor post on the fissure lip, near the Seam-Light's still-burning
  // worklight (station_haumea_rift 420,-780; the lip's poi reads 0,180).
  post: Object.freeze({ x: -140, z: 300 }),
  // Four clamp sockets stepping along the fissure bearing out from the post.
  clampCount: 4,
  clampBearing: 0.9,
  clampSpacing: 140,
  // A spire parked inside a socket seats; a spire still screaming through is
  // mid-throw, not an anchor.
  seatRadius: 46,
  seatSpeed: 25,
  // The crack: a meter that climbs on sim time. Each seated spire knocks it
  // back; topping it out runs the crack and shakes the oldest seat loose.
  crackRate: 1.6,          // per sim second — the lip gives ~60 s of slack
  crackMax: 100,
  crackSeatDrop: 30,
  crackRunFloor: 55,
  // Drift spires: the loose ice the rift gives up to be used against it. Six
  // authored, deterministic bearings; what the clamps seat or violence breaks,
  // the rift replaces the way the fissure keeps spalling.
  spireCount: 6,
  spireScatterRadius: 640,
  spireBearingStart: 1.7,
  spireBearingStep: 0.95,
  // story flags: the crack meter, the held receipt, the pay, the durability.
  crackFlag: 'holdfast_crack',
  heldFlag: 'holdfast_held',
  paidFlag: 'holdfast_paid',
  goneFlag: 'holdfast_gone',
  sender: 'HOLDFAST / AN-1',
  callsign: 'AN-1',
  announce: 'AN-1 on the lip. The rift is running and my clamps are empty. Tow me a spire. Any spire. I will do the holding.',
  seatLine: 'SPIRE SEATED. THE CRACK GIVES BACK.',
  heldLine: 'RIFT HELD. A FRAGMENT FOR THE HAND THAT ANCHORS.',
  // Canon payoff line: "Holding. Holding. Holding."
  holdingLine: 'HOLDING. HOLDING. HOLDING.',
  crackRanLine: 'THE CRACK RAN. A SEAT GAVE. HOLDING ANYWAY.',
  goneLine: 'AN-1 DOWN. THE RIFT TAKES THE POST BACK.',
});
