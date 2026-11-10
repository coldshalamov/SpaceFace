// Bounded, event-driven inference. No neural training, renderer reads, RNG draws or wall time.
import { NEMESIS_KITS, NEMESIS_STYLES } from '../data/nemesisRival.js';
import { compactKillCausality } from '../combat/killCausality.js';
import { LIMITS, counts, normalizePlan, boundedPush, keyForId } from './model.js';

const EXPLICIT_STYLES = Object.freeze({
  fling: 'tether', tether: 'tether', gun: 'gunnery', gunnery: 'gunnery',
  rock: 'terrain', terrain: 'terrain', explosive: 'ordnance', ordnance: 'ordnance',
  field: 'field', kite: 'kite',
});

export function classifyPlayerKill(payload, playerId, tumbles, now) {
  if (!payload || playerId == null || (payload.type && payload.type !== 'ship')) return null;
  const victimId = payload.id ?? payload.victimId;
  if (!keyForId(victimId) || victimId === playerId) return null;
  const causality = compactKillCausality(payload, playerId);
  if (!causality.playerCaused) return null;
  const hint = payload.killStyle || payload.explicitStyle;
  let style = typeof hint === 'string' && Object.hasOwn(EXPLICIT_STYLES, hint)
    ? EXPLICIT_STYLES[hint] : null;
  if (!style) {
    const flung = tumbles.some((row) => row.id === victimId && row.at <= now
      && now - row.at <= LIMITS.tumbleWindowS);
    if (flung && (causality.cause === 'terrain_collision' || causality.cause === 'ship_collision')) style = 'tether';
    else if (causality.cause === 'explosive') style = 'ordnance';
    else if (causality.cause === 'terrain_collision') style = 'terrain';
    else if (causality.cause === 'kinetic') style = 'gunnery';
    // Unknown causes stay unknown. "Generic" is not evidence that someone used a gun.
  }
  return style ? { victimId, style, causality } : null;
}

/** Once-per-event receipt. Caller must prove observation before admitting the receipt. */
export function admitEvidence(memory, episode, { key, style, source = 'direct' }) {
  if (!episode || !NEMESIS_STYLES.includes(style) || typeof key !== 'string'
      || key.length > 240 || !['direct', 'report'].includes(source)) return false;
  if (memory.seen.includes(key)) return false;
  boundedPush(memory.seen, key, LIMITS.dedupe);
  const units = source === 'direct' ? 2 : 1;
  const amount = Math.min(units, LIMITS.evidencePerStyle - episode.counts[style],
    LIMITS.evidencePerEpisode - episode.total);
  if (amount <= 0) return false;
  episode.counts[style] += amount;
  episode.total += amount;
  episode.sources[source] += 1;
  return true;
}

/** Equal encounter budgets prevent high-rate guns from outvoting one decisive sling. */
export function inferPlayerModel(episodes) {
  const mass = counts();
  let weight = 0, evidenceUnits = 0, evidenceEpisodes = 0;
  const bounded = episodes.slice(-LIMITS.episodes);
  for (const episode of bounded) {
    for (const style of NEMESIS_STYLES) mass[style] *= 0.75;
    weight *= 0.75;
    const total = NEMESIS_STYLES.reduce((sum, style) => sum + episode.counts[style], 0);
    if (!total) continue;
    const strength = Math.min(1, total / 6);
    for (const style of NEMESIS_STYLES) mass[style] += strength * episode.counts[style] / total;
    weight += strength;
    evidenceUnits += total;
    evidenceEpisodes += 1;
  }
  // A small symmetric prior is explicitly uncertainty, not fabricated observations.
  const denominator = weight + NEMESIS_STYLES.length * 0.15;
  const posterior = Object.fromEntries(NEMESIS_STYLES.map((style) => [style, (mass[style] + 0.15) / denominator]));
  const ranked = NEMESIS_STYLES.slice().sort((a, b) => posterior[b] - posterior[a]
    || NEMESIS_STYLES.indexOf(a) - NEMESIS_STYLES.indexOf(b));
  return { posterior, ranked, evidenceUnits, evidenceEpisodes };
}

export function prepareNemesisPlan(memory, side = 1) {
  const model = inferPlayerModel(memory.episodes);
  const [best, next] = model.ranked;
  let primary = 'open';
  if (model.evidenceUnits >= 6 && model.posterior[best] >= 0.5) primary = best;
  const previous = memory.lastPrimary;
  // Keep an established, still-supported hypothesis through a single ambiguous encounter.
  // Hysteresis is not eternal commitment: a 0.10 posterior advantage revises it.
  if (previous !== 'open' && NEMESIS_STYLES.includes(previous)
      && model.posterior[previous] >= 0.27
      && model.posterior[best] - model.posterior[previous] < 0.10) primary = previous;
  const chapter = Math.min(3, memory.progress ?? memory.completed);
  const second = model.ranked.find((style) => style !== primary) || next;
  const secondary = chapter >= 2 && primary !== 'open' && model.evidenceEpisodes >= 2
    && model.posterior[second] >= 0.22 ? second : null;
  return normalizePlan({
    primary, secondary, chapter, side,
    confidence: primary === 'open' ? model.posterior[best] : model.posterior[primary],
    evidenceEpisodes: model.evidenceEpisodes, evidenceUnits: model.evidenceUnits,
    reason: primary === 'open'
      ? 'Insufficient or mixed observed evidence; no specialized counter committed.'
      : `${NEMESIS_KITS[primary].label}: ${model.evidenceUnits} evidence units across `
        + `${model.evidenceEpisodes} observed encounters. Refit is locked until this encounter ends.`,
  });
}

export function predictionWasWrong(plan, episode) {
  if (!plan || plan.primary === 'open' || !episode || episode.total < 6) return false;
  const ranked = NEMESIS_STYLES.slice().sort((a, b) => episode.counts[b] - episode.counts[a]
    || NEMESIS_STYLES.indexOf(a) - NEMESIS_STYLES.indexOf(b));
  return ranked[0] !== plan.primary && episode.counts[ranked[0]] / episode.total >= 0.6;
}
