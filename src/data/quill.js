// src/data/quill.js — QUILL / AR-3, the deserter page-drone (W-SHIFT row 506,
// 03 §4.3). Triton Wake is the empty lane: one Vael courier, a research post, and
// the anomaly's south rim where the Watcher's Tithe gathers offerings. An Archive
// page-drone deserted to that rim with the sealed pages it could not stop copying.
// Bring it a scanned wreck — a hull whose manifest your scanner resolved — and it
// copies the log: the wreck stays yours, the page stays open, and one sealed
// secret comes out per copy. "I copied it. Now it exists twice." The copy stamp
// rides the wreck, so a log can only ever be copied once — even by a later,
// stranger drone.
export const QUILL = Object.freeze({
  sectorId: 'sector_triton_wake',
  // The deserter's drift: just off the Watcher's Tithe rim where the offerings
  // gather (station_triton 480,-980; the tithe sits -160,340 on the anomaly's
  // south rim). AR-3 keeps the quiet side of it.
  post: Object.freeze({ x: -60, z: 520 }),
  // The read ring: a log parked inside it gets copied. Read, never taken —
  // the drone copies, it does not keep the hull.
  readRadius: 110,
  // A wreck still screaming through the ring is a flyby, not a delivery — the
  // drone reads what settles (a gentle drift still counts: it ARRIVED).
  readSpeed: 25,
  // The drone holds its drift near the tithe; shoved off, it walks home through
  // the impulse membrane like every live body.
  leashRadius: 60,
  driftSpeed: 16,
  // story flags: the count of pages copied open, the durable gone receipt.
  copiedFlag: 'quill_copied',
  goneFlag: 'quill_gone',
  sender: 'QUILL / AR-3',
  callsign: 'AR-3',
  announce: 'AR-3 on the rim. Bring me a wreck your scanner has read. I will copy it, and you will keep one of my sealed pages open.',
  copiedLine: 'I copied it. Now it exists twice. That is how you keep a thing.',
  goneLine: 'AR-3 OUT. THE COPIES STAY COPIED. THE REST GOES SEALED.',
  masteryLine: 'EVERY PAGE OUT. THE ARCHIVE IS SMALLER THAN THE DARK.',
  // The sealed pages: what the Archive locked, the deserter gives away one copy
  // at a time — each page is the Shift's own secret map, told by the machine who
  // wrote them down and ran. Revealed in order, one per new log.
  secrets: Object.freeze([
    'SEALED PAGE 1 — Dione Lane keeps a dead scale. WG-2 weighs what you set on the plate and pays true mass in fragments. The Line reads them.',
    'SEALED PAGE 2 — The Orcus shepherd is broken and counts anyway. Put every stray inside the ring and it pays what the Line calls a fragment.',
    'SEALED PAGE 3 — The rift at Haumea is running. AN-1 has empty clamps and one verb. Tow it ice; it does the holding.',
    'SEALED PAGE 4 — Phoebe Echo rings five bells that lost their song. Strike them lowest to highest. The wrong order is only a lesson.',
    'SEALED PAGE 5 — Eunomia Gulf composts its dead. UG-4 races you to every wreck and gardens what it wins. Losing is also an education.',
    'SEALED PAGE 6 — The Archive sealed me for keeping copies. I keep them anyway. Now you keep this one.',
  ]),
});
