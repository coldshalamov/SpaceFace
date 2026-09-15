// PQ-146: immutable encounter admission and pure consequence accounting.
export const THREAT_REWARDS = Object.freeze(Object.fromEntries([
  ['none', 0], ['fodder', 100], ['skirmisher', 200], ['heavy', 400], ['elite', 600], ['boss', 2000],
].map(([threatClass, score]) => [threatClass, Object.freeze({ threatClass, baseScore: score, styleBudget: score, credits: score / 10 })])));

export function threatReward(threatClass) { return THREAT_REWARDS[threatClass] || THREAT_REWARDS.none; }

/** Call at materialization. Once admitted, changes to level, mass or loadout cannot promote a life. */
export function admitStuntThreat(entity, encounterId = 'encounter') {
  if (!entity || entity.id == null) return null;
  const data = entity.data ||= {};
  if (data.stuntThreat?.lifeId != null) return data.stuntThreat;
  const eligible = data.runCohort === 'survival' && data.rewardEligible !== false && data.unbudgetedAdd !== true;
  const named = data.threatClass;
  const threatClass = !eligible ? 'none' : THREAT_REWARDS[named] ? named
    : data.isBoss === true || data.bossId != null ? 'boss'
      : data.isElite === true || data.elite === true || data.runRole === 'elite' ? 'elite'
        : data.hullClass === 'heavy' || data.role === 'heavy' || data.runRole === 'heavy' ? 'heavy'
          : ['skirmisher', 'specialist', 'support', 'disruptor', 'reach', 'anchor'].includes(data.runRole ?? data.role) ? 'skirmisher' : 'fodder';
  const lifeId = data.bodyLifeId ?? data.lifeId ?? `${encounterId}:${entity.id}`;
  data.stuntThreat = { lifeId: String(lifeId), ...threatReward(threatClass) };
  return data.stuntThreat;
}

export const PRIMARY_SCORING = Object.freeze({
  bolas: ['tether', 90], wrecking_ball: ['tether', 90], clothesline: ['tether', 140], tow_kill: ['tether', 90],
  rock_discovery: ['impact', 50], well_golf: ['field', 140], dead_mans_mass: ['debris', 140],
  bank_job: ['rebound', 90], return_to_sender: ['rebound', 140], kickstart: ['escape', 140],
  needle_thread: ['escape', 140], one_two: ['impact', 140], slingshot_golf: ['field', 200],
});
export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, Number.isFinite(Number(x)) ? Number(x) : lo));
export function executionFactor(trick = {}) {
  const m = trick.metrics || {};
  const rho = m.selfLaunch ? 1 : Number(m.payloadMass) / Number(m.playerDryHullMass);
  const massTerm = m.projectileOnly || !(rho > 0) ? 0 : clamp(Math.log2(rho), 0, 2);
  const k = m.projectileOnly ? 0 : Number(m.usefulDeltaV) / Number(m.referenceCruise);
  return Math.floor((1 + 0.15 * massTerm + 0.20 * clamp((k - 0.30) / 0.70, 0, 1)) * 1000 + 1e-9) / 1000;
}
export function candidateStyle(trick, repetition = 1) {
  const spec = PRIMARY_SCORING[trick?.trickId];
  if (!spec) return 0; // modifiers and unknown names never independently pay
  const mods = trick.modifiers || {};
  const q = mods.razorRelease === 'razor' ? 20 : mods.razorRelease === 'clean' ? 5 : 0;
  const collateral = 15 * clamp(Number(mods.collateralCount || 1) - 1, 0, 4);
  const bridge = mods.closeShave === true && trick.trickId !== 'needle_thread' ? 10 : 0;
  return Math.min(300, repetition * (spec[1] * executionFactor(trick) + q + collateral + bridge));
}
/** Stable lexical ordering also covers numeric identity 0; retain fractional raw until bank. */
export function allocateStyle(amount, available) {
  const rows = available.filter(x => x.available > 0).sort((a, b) => String(a.lifeId) < String(b.lifeId) ? -1 : String(a.lifeId) > String(b.lifeId) ? 1 : 0);
  const total = rows.reduce((n, row) => n + row.available, 0);
  const accepted = Math.min(Math.max(0, amount), total);
  let assigned = 0;
  return rows.map((row, i) => {
    const points = i === rows.length - 1 ? accepted - assigned : accepted * row.available / total;
    assigned += points;
    return { lifeId: row.lifeId, points };
  });
}
