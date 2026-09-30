// Swarm stakes (design/swarm/SWARM_PROGRAM.md §S1) — the swarm run's difficulty contract.
//
// A stake is four numbers and a promise: the PURSE is the run wallet the armory opens with,
// the PRESSURE is the single multiplier on the swarm's concurrency curve and round quota, the
// EARN is the multiplier on what a cleared round pays, and the SCORE is the multiplier on every
// point the run tallies. Nothing here touches hull, damage or speed — pressure in this mode is
// concurrency, never stat inflation (see swarmMode.js).
//
// The purse is a runway, not a power axis: it is spent inside the run's own shop and dies with
// the run. A high purse is an exhibition — you walk in rich to learn the room or to demo a
// kit. A zero purse is the honest wager — everything you fly is taken off the pack.
//
// Pure frozen data. No bus, no RNG, no DOM.

export const SWARM_STAKE_SCHEMA_VERSION = 1;

export const SWARM_STAKES = Object.freeze([
  Object.freeze({
    id: 'exhibition',
    label: 'Exhibition',
    purse: 2400,
    pressure: 0.65,
    earn: 0.75,
    score: 0.5,
    blurb: 'Walk in rich; the room is a classroom. Buy what you want to see.',
  }),
  Object.freeze({
    id: 'contender',
    label: 'Contender',
    purse: 750,
    pressure: 1.0,
    earn: 1.0,
    score: 1.0,
    blurb: 'The run the swarm was tuned for. A real stake, an honest pack.',
  }),
  Object.freeze({
    id: 'veteran',
    label: 'Veteran',
    purse: 250,
    pressure: 1.15,
    earn: 1.25,
    score: 1.5,
    blurb: 'Thin purse, thick pack. The shop is earned, not spent into.',
  }),
  Object.freeze({
    id: 'ironbound',
    label: 'Ironbound',
    purse: 0,
    pressure: 1.3,
    earn: 1.5,
    score: 2.0,
    blurb: 'Nothing but the hull. The purse is what you take off the pack.',
  }),
]);

export const SWARM_STAKE_BY_ID = Object.freeze(Object.fromEntries(
  SWARM_STAKES.map((stake) => [stake.id, stake]),
));

export const SWARM_DEFAULT_STAKE_ID = 'contender';

/** The stake for an id, defaulting to the tuning baseline. Unknown values never reach the run. */
export function normalizeSwarmStake(stakeId) {
  return typeof stakeId === 'string' && SWARM_STAKE_BY_ID[stakeId]
    ? stakeId
    : SWARM_DEFAULT_STAKE_ID;
}

/** The frozen stake row for an id (defaulted). */
export function swarmStakeFor(stakeId) {
  return SWARM_STAKE_BY_ID[normalizeSwarmStake(stakeId)];
}

/** One legible line for the door: what the purse buys and what it costs. */
export function swarmStakePitch(stakeId) {
  const stake = swarmStakeFor(stakeId);
  const purse = stake.purse > 0 ? `${stake.purse} cr to open` : 'no purse';
  const pressure = stake.pressure === 1 ? 'the tuned pack'
    : stake.pressure < 1 ? `${Math.round(stake.pressure * 100)}% pressure`
    : `${Math.round(stake.pressure * 100)}% pressure`;
  const earn = stake.earn === 1 ? 'standard pay' : `pays ×${stake.earn}`;
  const score = stake.score === 1 ? 'true tally' : `scores ×${stake.score}`;
  return `${purse} · ${pressure} · ${earn} · ${score}`;
}

/** Data sanity, checkable without a DOM. */
export function validateSwarmStakes() {
  const issues = [];
  const seen = new Set();
  for (const stake of SWARM_STAKES) {
    if (!stake || typeof stake !== 'object') { issues.push('stake: not an object'); continue; }
    if (typeof stake.id !== 'string' || !stake.id) issues.push('stake: missing id');
    if (seen.has(stake.id)) issues.push(`${stake.id}: duplicate`);
    seen.add(stake.id);
    if (!Number.isInteger(stake.purse) || stake.purse < 0) issues.push(`${stake.id}: bad purse`);
    if (!(stake.pressure > 0)) issues.push(`${stake.id}: bad pressure`);
    if (!(stake.earn > 0)) issues.push(`${stake.id}: bad earn`);
    if (!(stake.score > 0)) issues.push(`${stake.id}: bad score`);
  }
  if (!SWARM_STAKE_BY_ID[SWARM_DEFAULT_STAKE_ID]) issues.push('default stake missing');
  return { ok: issues.length === 0, issues };
}
