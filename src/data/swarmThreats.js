// SWARM-06 — Threat tiers and elite affixes (SWARM_ARCADE §6.4). The wager layer for a strong
// account: opt-in cards that stack, each paying a Bounty multiplier because the run it rides
// is honestly harder.
//
//   * A THREAT is a contract, not a stat patch in hiding. The ones that rewrite the run's rules
//     ride the MUTATOR machinery the run already understands (no_reroll, draftless); the ones
//     that change the room are facts the planner and the materializer read (pressure, speed,
//     elite plating). Nothing here touches the player's numbers — pressure stays concurrency,
//     never inflation, same law as the stakes.
//
//   * AFFIXES are the elite vocabulary (§6.4): from Zone 3 — and any wave while a Threat is
//     on — champions and elite-role bodies carry one named trick. The pick is a seeded hash of
//     seed + wave + body ordinal: the same run meets the same tricked hulls every time, and the
//     tricks feed the room-kill grammar, not just hit points.
//
// Pure frozen data + pure functions. No bus, no RNG, no DOM.

export const SWARM_THREATS = Object.freeze([
  Object.freeze({
    id: 'thick_pack', name: 'Thick Pack', bounty: 0.25, pressure: 1.35,
    blurb: 'Thirty-five percent more bodies in every room.',
  }),
  Object.freeze({
    id: 'thin_purse', name: 'Thin Purse', bounty: 0.15, purse: 0.5,
    blurb: 'The stake purse halves — the armory earns every card.',
  }),
  Object.freeze({
    id: 'no_rerolls', name: 'No Re-rolls', bounty: 0.10, mutator: 'no_reroll',
    blurb: 'The shelf deals once. What it says is what you fly.',
  }),
  Object.freeze({
    id: 'draftless', name: 'Draftless', bounty: 0.20, mutator: 'draftless',
    blurb: 'No armory between rounds. The launch kit is the kit.',
  }),
  Object.freeze({
    id: 'fast_lane', name: 'Fast Lane', bounty: 0.20, speed: 1.15,
    blurb: 'Every hostile hull runs fifteen percent hotter.',
  }),
  Object.freeze({
    id: 'armoured_elites', name: 'Armoured Elites', bounty: 0.25, eliteHull: 1.5,
    blurb: 'Champions plate up half again — and affixes ride every wave.',
  }),
]);

export const SWARM_THREAT_BY_ID = Object.freeze(Object.fromEntries(
  SWARM_THREATS.map((row) => [row.id, row]),
));

/**
 * Elite affixes (§6.4). The trick each marked hull carries; the effect each one plays lives
 * with the swarm-elites runtime. `fromWave` is the natural onset — affixes start with Zone 3,
 * and any live Threat card brings them early.
 */
export const SWARM_AFFIXES = Object.freeze([
  Object.freeze({ id: 'shielded', name: 'Shielded', blurb: 'A bubble eats the first hits — pop it.' }),
  Object.freeze({ id: 'splitter', name: 'Splitter', blurb: 'Bursts into two wasps on death.' }),
  Object.freeze({ id: 'volatile', name: 'Volatile', blurb: 'Explodes on death — chain fuel, rewards throwing.' }),
  Object.freeze({ id: 'magnetic', name: 'Magnetic', blurb: 'Drags your credit chips off the field.' }),
  Object.freeze({ id: 'commander', name: 'Commander', blurb: 'Hardens the hulls flying near it.' }),
  Object.freeze({ id: 'hasted', name: 'Hasted', blurb: 'Runs a third faster than its kin.' }),
]);

export const SWARM_AFFIX_BY_ID = Object.freeze(Object.fromEntries(
  SWARM_AFFIXES.map((row) => [row.id, row]),
));

/** Zone 3's first wave — the wave affixes start on without a Threat (§6.4). */
export const SWARM_AFFIX_FROM_WAVE = 21;

/**
 * The veteran band — the escalation the late run was missing. From Zone 5's first wave a
 * seeded share of affixed hulls carry a SECOND affix: two tricks on one body, never a
 * bigger hull or a hotter gun. The odds open at BASE, climb STEP a wave, and stop at MAX —
 * a marked minority, so meeting one still reads as the exception it is. A live Threat does
 * not move the gate: the wager bought the early vocabulary, not the band — depth still
 * earns the second trick by wave.
 */
export const SWARM_AFFIX_VETERAN_FROM_WAVE = 41;
export const SWARM_AFFIX_VETERAN_BASE_PCT = 20;
export const SWARM_AFFIX_VETERAN_PCT_PER_WAVE = 1;
export const SWARM_AFFIX_VETERAN_MAX_PCT = 40;

/**
 * The veteran-band odds for a wave, in percent: zero below the gate, then the slow climb
 * to the cap. Pure read — the stamp path supplies the seeded roll that answers it.
 */
export function swarmAffixVeteranPct(wave) {
  if (!Number.isInteger(wave) || wave < SWARM_AFFIX_VETERAN_FROM_WAVE) return 0;
  return Math.min(
    SWARM_AFFIX_VETERAN_MAX_PCT,
    SWARM_AFFIX_VETERAN_BASE_PCT
      + (wave - SWARM_AFFIX_VETERAN_FROM_WAVE) * SWARM_AFFIX_VETERAN_PCT_PER_WAVE,
  );
}

/**
 * The second affix a veteran carries, guaranteed DISTINCT from its primary: the hash picks
 * an offset 1..N-1 past the primary's own row and wraps, so the pair can never double one
 * trick — no double-shielded, ever. Same hash in, same partner out.
 */
export function swarmAffixVeteranFor(hash, primaryId) {
  if (!Number.isInteger(hash) || hash < 0) return null;
  const count = SWARM_AFFIXES.length;
  const primaryIndex = SWARM_AFFIXES.findIndex((row) => row.id === primaryId);
  if (primaryIndex < 0 || count < 2) return null;
  const row = SWARM_AFFIXES[(primaryIndex + 1 + (hash % (count - 1))) % count];
  return row ? row.id : null;
}

/** Normalize a door pick or a request payload into catalog ids. Unknowns never reach the run. */
export function normalizeThreatIds(value) {
  const list = Array.isArray(value) ? value : (typeof value === 'string' ? [value] : []);
  const out = [];
  for (const id of list) {
    if (typeof id === 'string' && SWARM_THREAT_BY_ID[id] && !out.includes(id)) out.push(id);
  }
  return out;
}

/** The Bounty multiplier the pick pays at settlement — stacked, one product. */
export function swarmThreatBountyMult(ids) {
  let mult = 1;
  for (const id of normalizeThreatIds(ids)) mult *= (1 + SWARM_THREAT_BY_ID[id].bounty);
  return mult;
}

/** The extra room pressure Thick Pack asks the planner for, stacked with the stake. */
export function swarmThreatPressureMult(ids) {
  let mult = 1;
  for (const id of normalizeThreatIds(ids)) {
    const t = SWARM_THREAT_BY_ID[id];
    if (Number.isFinite(t.pressure)) mult *= t.pressure;
  }
  return mult;
}

/** The stake-purse factor Thin Purse takes off the top. */
export function swarmThreatPurseMult(ids) {
  let mult = 1;
  for (const id of normalizeThreatIds(ids)) {
    const t = SWARM_THREAT_BY_ID[id];
    if (Number.isFinite(t.purse)) mult *= t.purse;
  }
  return mult;
}

/** The speed factor Fast Lane stamps on every hostile body. */
export function swarmThreatSpeedMult(ids) {
  let mult = 1;
  for (const id of normalizeThreatIds(ids)) {
    const t = SWARM_THREAT_BY_ID[id];
    if (Number.isFinite(t.speed)) mult *= t.speed;
  }
  return mult;
}

/** The hull factor Armoured Elites stamps on champions. */
export function swarmThreatEliteHullMult(ids) {
  let mult = 1;
  for (const id of normalizeThreatIds(ids)) {
    const t = SWARM_THREAT_BY_ID[id];
    if (Number.isFinite(t.eliteHull)) mult *= t.eliteHull;
  }
  return mult;
}

/** The mutator ids the pick folds into the run's challenge contract. */
export function swarmThreatMutatorIds(ids) {
  const out = [];
  for (const id of normalizeThreatIds(ids)) {
    const t = SWARM_THREAT_BY_ID[id];
    if (typeof t.mutator === 'string' && t.mutator && !out.includes(t.mutator)) out.push(t.mutator);
  }
  return out;
}

/**
 * The wave affixes may start on for this run: Zone 3 in an honest run, wave 1 under any live
 * Threat — the wager bought the hard vocabulary early.
 */
export function swarmAffixFromWave(threatIds) {
  return normalizeThreatIds(threatIds).length > 0 ? 1 : SWARM_AFFIX_FROM_WAVE;
}

/**
 * The seeded affix pick for one body: same seed + wave + ordinal, same trick, every time.
 * Returns a catalog id or null for an out-of-table hash (never — kept for the contract).
 */
export function swarmAffixFor(hash) {
  if (!Number.isInteger(hash) || hash < 0) return null;
  const row = SWARM_AFFIXES[hash % SWARM_AFFIXES.length];
  return row ? row.id : null;
}

/** Data sanity, checkable without a DOM. */
export function validateSwarmThreats() {
  const issues = [];
  const seen = new Set();
  for (const threat of SWARM_THREATS) {
    if (!threat || typeof threat !== 'object') { issues.push('threat: not an object'); continue; }
    if (typeof threat.id !== 'string' || !threat.id) issues.push('threat: missing id');
    if (seen.has(threat.id)) issues.push(`${threat.id}: duplicate`);
    seen.add(threat.id);
    if (!(Number.isFinite(threat.bounty) && threat.bounty > 0)) issues.push(`${threat.id}: bad bounty`);
  }
  for (const affix of SWARM_AFFIXES) {
    if (!affix || typeof affix.id !== 'string' || !affix.id) issues.push('affix: missing id');
  }
  if (!(SWARM_AFFIX_VETERAN_FROM_WAVE > SWARM_AFFIX_FROM_WAVE)) {
    issues.push('veteran band: gate must sit past the affix floor');
  }
  if (!(SWARM_AFFIX_VETERAN_BASE_PCT > 0 && SWARM_AFFIX_VETERAN_BASE_PCT <= SWARM_AFFIX_VETERAN_MAX_PCT
    && SWARM_AFFIX_VETERAN_MAX_PCT < 100 && SWARM_AFFIX_VETERAN_PCT_PER_WAVE >= 0)) {
    issues.push('veteran band: odds outside the bounded band');
  }
  if (SWARM_AFFIXES.length >= 2) {
    // The distinct-pair contract: every primary partners with a different second, always.
    for (const affix of SWARM_AFFIXES) {
      for (let h = 0; h < SWARM_AFFIXES.length * 4; h++) {
        const second = swarmAffixVeteranFor(h, affix.id);
        if (second === affix.id || !SWARM_AFFIX_BY_ID[second]) {
          issues.push(`veteran pair: ${affix.id} produced ${second}`);
          break;
        }
      }
    }
  }
  return { ok: issues.length === 0, issues };
}
