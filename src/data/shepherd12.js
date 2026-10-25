// src/data/shepherd12.js — SHEPHERD-12, the broken shepherd herding debris flocks
// (W-SHIFT row 506, 03 §4.3). Orcus Shadow is the Vael shadow: one research courier,
// sensors that lie, and a ring nobody made — The Tide, debris pinned in a slow tide
// around the anomaly. A broken Verge Shepherd Engine walks that ring's edge. Its
// herding coil burned out a century ago, so it checks the count instead of pulling
// it: push the strays back inside the ring and it reports the truth it can verify —
// FLOCK: PRESENT. The first whole flock pays one weighed Measure Engine fragment,
// the same `verge_measure_fragment` + `weighedMass` contract TARE's scale stamps and
// the Line-site Class trial consumes (06: TARE, SHEPHERD-12 and HOLDFAST unlock the
// Line Class trials). The tide keeps giving — a finished flock is followed by new
// strays, because the count never ends.
export const SHEPHERD12 = Object.freeze({
  sectorId: 'sector_orcus_shadow',
  // The flock: debris pinned in The Tide's ring around the shadow — the one-off's
  // rim (station_orcus_shadow 420,-960 + the ring's -560,+580 anchor = -140,-380).
  flockCenter: Object.freeze({ x: -140, z: -380 }),
  // Inside this radius a flock member is PRESENT; outside it, SHY. The ring the
  // one-off dresses is wide — the flock's edge is the readable band around it.
  flockRadius: 480,
  // Seven members: the count the shepherd reports. Four ride the ring; three drift
  // shy at deterministic bearings outside it — the authored work waiting for a hand.
  flockCount: 7,
  strayCount: 3,
  strayScatterRadius: 780,
  strayBearingStart: 2.1,
  strayBearingStep: 1.9,
  // Members drift — a stray still screaming through the edge is mid-throw, not
  // counted home until it settles inside the ring.
  homeSpeed: 30,
  // The shepherd itself is broken: it cannot pull the flock, so it walks the ring's
  // edge on a slow patrol, steering through the impulse membrane like every live
  // body — never a vel write. Patrol = the visible work of a herder that cannot herd.
  patrolRadius: 540,
  patrolSpeed: 14,
  patrolPoints: 12,
  // The tide is patient: after a whole flock reports, it waits this long before it
  // shies two more strays loose — a finished count is the beginning of the next one.
  waveDelay: 90,
  waveStrays: 2,
  strayCap: 3,
  // story flags: flocks counted, the fragment paid once, the shepherd's durability.
  flocksFlag: 'shepherd_flocks',
  paidFlag: 'shepherd_paid',
  goneFlag: 'shepherd_gone',
  waveFlag: 'shepherd_nextWaveAt',
  sender: 'SHEPHERD-12',
  callsign: 'SHEPHERD-12',
  announce: 'SHEPHERD-12 on the tide. The flock is shy and my coil is dead. Push the strays home and I will say the count true.',
  // Canon payoff line: "FLOCK: PRESENT."
  flockPresent: 'FLOCK: PRESENT.',
  flockShy: 'FLOCK: SHY — {strays} OUT.',
  strayHome: 'ONE HOME. {strays} STILL OUT.',
  paidLine: 'FLOCK: PRESENT. A FRAGMENT FOR THE HAND THAT HERDS.',
  goneLine: 'SHEPHERD-12 DOWN. THE TIDE KEEPS THE COUNT NOW.',
  lostLine: 'FLOCK: SHY. A MEMBER LOST.',
});
