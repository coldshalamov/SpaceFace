// lawChallengeCopy.js — the standing-heat challenge the patrol answers with (inf-patrol-challenge).
//
// A lawful patrol that ACQUIRES a wanted hull used to keep flying its station orbit as if the
// sheet were not there — the first reaction arrived later, from a hunter wing spawned off-screen.
// Now the patrol that finds you reacts before any of that: it holds a standoff ring off your
// beam and names the sheet on the band, once per patrol per heat episode.
//
// Law voice: the same uppercase channel voice as the custody and fine desks. One hail per
// wanted tier — the line names the tier's standing demand, never a threat the sim has not
// armed (the challenge patrols stay HOLD_FIRE; the seeded hunter waves own the violence).
//
// Recognized copy fields (`hail`, `text`) so the localization extractor carries the corpus;
// unknown tiers render NOTHING (the anti-free-text failure mode).

export const LAW_HEAT_CHALLENGE_COPY = Object.freeze({
  scan: Object.freeze({
    hail: 'PATROL TO WANTED HULL — YOUR PLATE READS FINE/SCAN. HOLD THIS RING AND STAND BY FOR THE READ, OR CLEAR THE WATCH.',
    text: 'HEAT CHALLENGE — a patrol cuts its route and holds off your beam, naming the fine/scan sheet. The read comes next.',
  }),
  bounty: Object.freeze({
    hail: 'PATROL TO WANTED HULL — YOUR PLATE READS BOUNTY. HOLD THIS RING; THE HUNTERS ALREADY HAVE YOUR POSITION.',
    text: 'HEAT CHALLENGE — a patrol cuts its route and holds off your beam, naming the bounty sheet. The hunters know where you are.',
  }),
  nets: Object.freeze({
    hail: 'PATROL TO WANTED HULL — THE WEDGE IS UP FOR YOU. HOLD THIS RING; THE CHECKPOINT IS THE ONLY WAY THROUGH.',
    text: 'HEAT CHALLENGE — a patrol cuts its route and holds off your beam, naming the nets wedge. The checkpoint stands.',
  }),
  impound: Object.freeze({
    hail: 'PATROL TO WANTED HULL — THE POUND HOLDS YOUR BILL. HOLD THIS RING; THE YARD IS MARKED ON YOUR CHART.',
    text: 'HEAT CHALLENGE — a patrol cuts its route and holds off your beam, naming the impound bill. The yard is marked.',
  }),
});

/** The band line for a tier, or null for a tier the bank does not name (never invented). */
export function lawHeatChallengeCopy(tier) {
  return LAW_HEAT_CHALLENGE_COPY[tier] || null;
}
