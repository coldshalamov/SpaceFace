// Affordance gates. Each metric stays separate. Acceptance is the conjunction
// of the hard gates. auditOrder is a listing key, not a fun score.

import { FOUNDRY_LIMITS } from './budget.js';

export const HARD_GATES = Object.freeze([
  'lab-failed',
  'not-finite',
  'player-dead',
  'over-budget',
  'factory-spawn-cap',
  'impossible-profile',
  'spawn-overlap',
  'unreadable',
  'single-mechanic',
  'zero-force',
  'no-physical-consequence',
  'trivial-variant',
]);

export function evaluateCandidate(report, options = {}) {
  const limits = options.limits || FOUNDRY_LIMITS;
  const seen = options.seenSignatures || report.seenSignatures || null;
  const reasons = [];
  const fired = Array.isArray(report.fired) ? report.fired.slice() : [];
  const declared = Array.isArray(report.mechanics) ? report.mechanics.slice() : [];
  const entityCount = report.entityCount | 0;
  const hostileCount = report.hostileCount | 0;
  const ticks = report.ticks | 0;
  const minSeparation = Number.isFinite(report.minSeparation) ? report.minSeparation : Infinity;
  const overlap = report.overlap === true;

  if (report.impossibleProfile) reasons.push(`impossible-profile:${report.impossibleProfile}`);
  if (report.labOk === false) reasons.push('lab-failed');
  if (report.finite === false) reasons.push('not-finite');
  if (report.playerAlive === false) reasons.push('player-dead');
  if (ticks > limits.maxTicks || entityCount > limits.maxEntities || hostileCount > limits.maxHostiles) {
    reasons.push('over-budget');
  }
  if (hostileCount > limits.factorySpawnDefault) reasons.push('factory-spawn-cap');
  if (overlap) reasons.push('spawn-overlap');
  else if (Number.isFinite(minSeparation) && minSeparation < limits.minSeparationWu && entityCount > 1) {
    reasons.push('unreadable');
  }
  const happened = Array.isArray(report.happened) ? report.happened : fired;
  if (declared.length < 2 || happened.length < 2) reasons.push('single-mechanic');
  const missing = declared.filter((id) => !happened.includes(id));
  for (const id of missing) reasons.push(`zero-force:${id}`);
  if (happened.length < 2) reasons.push('no-physical-consequence');

  const bodyClass = report.bodyClass || 'nobody';
  const signature = signatureOf(happened, bodyClass);
  let trivial = false;
  if (seen && typeof seen.has === 'function' && seen.has(signature) && reasons.length === 0) {
    reasons.push('trivial-variant');
    trivial = true;
  }

  const physicalCauseFraction = declared.length
    ? declared.filter((id) => happened.includes(id)).length / declared.length
    : 0;
  const metrics = {
    mechanicCount: declared.length,
    firedObservables: happened,
    physicalCauseFraction: round3(physicalCauseFraction),
    interventionAffordances: report.interventionAffordances | 0,
    claritySeparationWu: Number.isFinite(minSeparation) ? round3(minSeparation) : null,
    consequence: {
      playerDisp: num(report.playerDisp),
      restDelta: num(report.restDelta),
      maxTension: num(report.maxTension),
    },
    novelty: !trivial && !(seen && seen.has && seen.has(signature)),
    retryBounded: report.playerAlive !== false && report.finite !== false && ticks <= limits.maxTicks,
    costTicks: ticks,
    costEntities: entityCount,
    scriptedFraction: round3(1 - physicalCauseFraction),
  };

  return {
    id: report.id,
    accepted: reasons.length === 0,
    reasons,
    metrics,
    signature,
    family: report.family || null,
    layout: report.layout || null,
  };
}

export function bodyClassOf(bodies, summary, attachment) {
  const live = summary && Array.isArray(summary.others) ? summary.others : null;
  const target = attachment && attachment.target;
  const kinds = new Set();
  for (const body of bodies || []) {
    if (!body) continue;
    if (live && body.alias !== target) {
      const row = live.find((item) => item.alias === body.alias);
      if (!row) continue;
      const moved = row.disp > 1 || Math.abs((row.speed || 0) - (row.launchSpeed || 0)) > 1 || row.hullDrop > 1;
      if (!moved) continue;
    }
    if (body.role === 'hostile' || body.team === 1 || body.profile === 'wasp_swarmer') kinds.add('hostile');
    else if (body.profile === 'asteroid.light' || (Number.isFinite(body.mass) && body.mass <= 80)) kinds.add('light');
    else kinds.add('heavy');
  }
  return kinds.size ? [...kinds].sort().join('+') : 'nobody';
}

export function signatureOf(fired, bodyClass) {
  const observables = Array.isArray(fired) ? fired.slice().sort() : [];
  return `${observables.join('+')}|${bodyClass || 'nobody'}`;
}

export function rankCandidates(verdicts) {
  const decorated = verdicts.map((row, index) => ({ ...row, sourceIndex: index }));
  decorated.sort((a, b) => {
    if (a.accepted !== b.accepted) return a.accepted ? -1 : 1;
    const af = (a.metrics && a.metrics.firedObservables && a.metrics.firedObservables.length) || 0;
    const bf = (b.metrics && b.metrics.firedObservables && b.metrics.firedObservables.length) || 0;
    if (af !== bf) return bf - af;
    const at = (a.metrics && a.metrics.costTicks) || 0;
    const bt = (b.metrics && b.metrics.costTicks) || 0;
    if (at !== bt) return at - bt;
    return String(a.id).localeCompare(String(b.id));
  });
  return decorated.map((row, auditOrder) => ({ ...row, auditOrder }));
}

export function criticSample(ranked, catalogIds = []) {
  const accepted = ranked.filter((row) => row.accepted).slice(0, 10);
  const rejected = [];
  const reasonKey = (row) => String((row.reasons && row.reasons[0]) || 'none').split(':')[0];
  const take = (row) => {
    if (!row || row.accepted || rejected.length >= 10) return;
    if (rejected.some((picked) => picked.id === row.id)) return;
    rejected.push(row);
  };
  const seenReason = new Set();
  for (const row of ranked) {
    const key = reasonKey(row);
    if (seenReason.has(key)) continue;
    seenReason.add(key);
    take(row);
  }
  const seenFamily = new Set(rejected.map((row) => row.family));
  for (const row of ranked) {
    if (rejected.filter((picked) => reasonKey(picked) === reasonKey(row)).length >= 2) continue;
    if (row.family && seenFamily.has(row.family)) continue;
    take(row);
    if (row.family) seenFamily.add(row.family);
  }
  for (const row of ranked) {
    if (reasonKey(row) === 'trivial-variant'
      && rejected.filter((picked) => reasonKey(picked) === 'trivial-variant').length >= 2) {
      continue;
    }
    take(row);
  }
  return {
    note: 'Ten accepted and ten rejected, with rejection reasons spread across gates. Entity count and intervention count are reported and are not gates.',
    acceptedIds: accepted.map((row) => row.id),
    rejectedIds: rejected.map((row) => row.id),
    catalogIds: catalogIds.slice(0, 10),
    rejected,
    accepted,
  };
}

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

function num(value) {
  return Number.isFinite(value) ? round3(value) : null;
}
