// Additive signature adapters for BP-10.1 audio/caption surfaces.
// Pure helpers: no DOM/Web Audio, and scanner hostility remains the canonical predicate.

import { SIGNATURE_RECIPES, getSignatureRecipe } from '../presentation/cueRecipesSignatures.js';
import { isHostileToPlayer as scannerIsHostileToPlayer } from './scanner.js';

export const SENSOR_SIGNATURE_DEBOUNCE_MS = 1000;
export const CUSTOMS_SIGNATURE_DEBOUNCE_MS = 4000;
export const TETHER_CUT_WHIPCRACK_EVENTS = Object.freeze(['tether:released', 'tether:broke']);
export const MINING_SEAM_CHIME_THROTTLE_MS = 500;
export const MINING_SEAM_BASELINE_YIELD_MULT = 0.35;
export const SIGNATURE_CAPTION_IMPORTANCE_THRESHOLD = 0.8;

export const CUSTOMS_ZONE_TYPES = Object.freeze([
  'border_checkpoint',
  'patrol_corridor',
]);

export const SIGNATURE_TITLES = Object.freeze({
  'tether.strain': 'MASSLINE STRAIN',
  'tether.cut_whipcrack': 'TAUT CUT',
  'mass.groan': 'HEAVY TOW',
  'mining.seam_chime': 'RICH SEAM',
  'mining.vent_bonus': 'CLEAN VENT',
  'sensor.scan': 'SCAN SWEEP',
  'sensor.lock': 'WEAPONS LOCK',
  'customs.scan': 'CUSTOMS SWEEP',
});

export const SIGNATURE_CAPTIONS = Object.freeze({
  'tether.strain': 'Massline strain.',
  'tether.cut_whipcrack': 'Taut line cut.',
  'mass.groan': 'Heavy mass under tow.',
  'mining.seam_chime': 'Rich seam hit.',
  'mining.vent_bonus': 'Clean vent bonus.',
  'sensor.scan': 'Scanned.',
  'sensor.lock': 'Weapons lock.',
  'customs.scan': 'Customs sweep.',
});

export const CAPTIONS_SIGNATURES = SIGNATURE_CAPTIONS;

export function captionForSignature(id) {
  return SIGNATURE_CAPTIONS[id] || null;
}

export function titleForSignature(id) {
  return SIGNATURE_TITLES[id] || null;
}

export function shouldCaptionSignature(input = {}) {
  const id = typeof input === 'string' ? input : input.id;
  const recipe = getSignatureRecipe(id);
  if (!recipe || !captionForSignature(id)) return false;
  const importance = finite(typeof input === 'string' ? recipe.importance : input.importance, recipe.importance);
  return importance >= SIGNATURE_CAPTION_IMPORTANCE_THRESHOLD;
}

export function buildSignatureCaptionCue(input = {}) {
  const id = typeof input === 'string' ? input : input.id;
  if (!shouldCaptionSignature(input)) return null;
  const recipe = getSignatureRecipe(id);
  const importance = finite(typeof input === 'string' ? recipe.importance : input.importance, recipe.importance);
  const nowMs = typeof input === 'string' ? 0 : Math.max(0, finite(input.nowMs, 0));
  return Object.freeze({
    id,
    audioId: recipe.audioId,
    sourceEvent: typeof input === 'string' ? recipe.sourceEvent : input.sourceEvent || recipe.sourceEvent,
    title: titleForSignature(id),
    caption: captionForSignature(id),
    importance,
    assertive: true,
    startedAtMs: nowMs,
    tags: recipe.tags,
  });
}

export function signatureCaptionAudit(recipes = SIGNATURE_RECIPES) {
  const ids = Object.keys(recipes || {}).sort();
  const captionedIds = ids.filter((id) => !!captionForSignature(id));
  const missingCaptionIds = ids.filter((id) => !captionForSignature(id));
  const criticalIds = ids.filter((id) => {
    const recipe = recipes[id];
    return recipe && Number.isFinite(recipe.importance) && recipe.importance >= SIGNATURE_CAPTION_IMPORTANCE_THRESHOLD;
  });
  const criticalMissingCaptionIds = criticalIds.filter((id) => !captionForSignature(id));
  return Object.freeze({
    ids: Object.freeze(ids),
    captionedIds: Object.freeze(captionedIds),
    missingCaptionIds: Object.freeze(missingCaptionIds),
    criticalIds: Object.freeze(criticalIds),
    criticalMissingCaptionIds: Object.freeze(criticalMissingCaptionIds),
    threshold: SIGNATURE_CAPTION_IMPORTANCE_THRESHOLD,
  });
}

export function resolveSensorSignature(contact, state, opts = {}) {
  const hostileFn = opts.isHostileToPlayer || scannerIsHostileToPlayer;
  const playerTeam = opts.playerTeam ?? playerTeamFromState(state);
  const hostile = !!hostileFn(contact, playerTeam, state);
  return hostile ? 'sensor.lock' : 'sensor.scan';
}

export function shouldDebounceSensorSignature(previous, nextId, nowMs, targetId, debounceMs = SENSOR_SIGNATURE_DEBOUNCE_MS) {
  if (!previous) return false;
  if (previous.targetId != null && targetId != null && previous.targetId !== targetId) return false;
  const untilMs = finite(previous.untilMs, finite(previous.startedAtMs, 0) + debounceMs);
  return finite(nowMs, 0) < untilMs && previous.id !== nextId;
}

export function buildSensorSignatureCue(sample = {}) {
  const contact = sample.contact || sample.entity || null;
  const state = sample.state || null;
  const nowMs = Math.max(0, finite(sample.nowMs, finite(state && state.simTime, 0) * 1000));
  const id = resolveSensorSignature(contact, state, sample);
  const targetId = contact && contact.id != null ? contact.id : sample.targetId ?? null;
  if (shouldDebounceSensorSignature(sample.previous, id, nowMs, targetId, sample.debounceMs)) return null;

  const recipe = getSignatureRecipe(id);
  const sourceId = sample.sourceId ?? (state && state.playerId) ?? null;
  return Object.freeze({
    id,
    audioId: recipe.audioId,
    sourceEvent: recipe.sourceEvent,
    material: recipe.material,
    mode: recipe.mode,
    title: titleForSignature(id),
    caption: captionForSignature(id),
    importance: recipe.importance,
    playerRelevance: recipe.playerRelevance,
    targetId,
    sourceId,
    hostile: id === 'sensor.lock',
    startedAtMs: nowMs,
    untilMs: nowMs + Math.max(1, finite(sample.debounceMs, SENSOR_SIGNATURE_DEBOUNCE_MS)),
    tags: recipe.tags,
    tones: recipe.tones,
  });
}

export function isCustomsZone(zone) {
  if (!zone || zone.factionId !== 'faction_scn') return false;
  if (!CUSTOMS_ZONE_TYPES.includes(zone.type)) return false;
  const text = `${zone.name || ''} ${zone.reason || ''} ${zone.type || ''}`.toLowerCase();
  return text.includes('customs') || text.includes('checkpoint') || text.includes('scanned');
}

export function isCustomsStation(station) {
  if (!station || station.factionId !== 'faction_scn') return false;
  const services = Array.isArray(station.services) ? station.services : [];
  const text = `${station.name || ''} ${station.type || ''} ${services.join(' ')}`.toLowerCase();
  return text.includes('customs') || services.includes('scan');
}

export function isCustomsContext(sample = {}) {
  if (isCustomsZone(sample.zone)) return true;
  if (isCustomsStation(sample.station)) return true;
  const stations = sample.sector && Array.isArray(sample.sector.stations) ? sample.sector.stations : [];
  return stations.some((station) => isCustomsStation(station));
}

export function resolveCustomsScanSignature(sample = {}) {
  if (sample.scanStarted === false) return null;
  if (sample.hasContraband && isCustomsContext(sample)) return 'customs.scan';
  return 'sensor.scan';
}

export function shouldDebounceCustomsSignature(previous, nowMs, debounceMs = CUSTOMS_SIGNATURE_DEBOUNCE_MS) {
  if (!previous) return false;
  const untilMs = finite(previous.untilMs, finite(previous.startedAtMs, 0) + debounceMs);
  return finite(nowMs, 0) < untilMs && (previous.id === 'customs.scan' || previous.id === 'sensor.scan');
}

export function buildCustomsScanCue(sample = {}) {
  const nowMs = Math.max(0, finite(sample.nowMs, 0));
  const id = resolveCustomsScanSignature(sample);
  if (!id) return null;
  if (shouldDebounceCustomsSignature(sample.previous, nowMs, sample.debounceMs)) return null;
  const recipe = getSignatureRecipe(id);
  return Object.freeze({
    id,
    audioId: recipe.audioId,
    sourceEvent: recipe.sourceEvent,
    material: recipe.material,
    mode: recipe.mode,
    title: titleForSignature(id),
    caption: captionForSignature(id),
    importance: recipe.importance,
    playerRelevance: recipe.playerRelevance,
    hasContraband: !!sample.hasContraband,
    customsContext: isCustomsContext(sample),
    zoneId: sample.zone && sample.zone.id || null,
    stationId: sample.station && sample.station.id || null,
    startedAtMs: nowMs,
    untilMs: nowMs + Math.max(1, finite(sample.debounceMs, CUSTOMS_SIGNATURE_DEBOUNCE_MS)),
    tags: recipe.tags,
    tones: recipe.tones,
  });
}

export function tetherCutSourceEvent(sample = {}) {
  return sample.sourceEvent || sample.eventId || sample.type || sample.eventType || null;
}

export function tetherCutTensionRatio(sample = {}) {
  const direct = sample.tensionRatio ?? sample.strain ?? sample.normalizedTension;
  if (Number.isFinite(direct)) return clamp(direct, 0, 1.25);
  const tension = finite(sample.tension, NaN);
  const maxTension = finite(sample.maxTension ?? sample.breakTension ?? sample.tensionLimit, NaN);
  if (Number.isFinite(tension) && Number.isFinite(maxTension) && maxTension > 0) {
    return clamp(tension / maxTension, 0, 1.25);
  }
  return 0;
}

export function resolveTetherCutSignature(sample = {}) {
  const eventId = tetherCutSourceEvent(sample);
  if (!TETHER_CUT_WHIPCRACK_EVENTS.includes(eventId)) return null;
  const recipe = getSignatureRecipe('tether.cut_whipcrack');
  if (!recipe) return null;
  return tetherCutTensionRatio(sample) >= recipe.tensionThreshold ? recipe.id : null;
}

export function buildTetherCutCue(sample = {}) {
  const id = resolveTetherCutSignature(sample);
  if (!id) return null;
  const recipe = getSignatureRecipe(id);
  const tensionRatio = tetherCutTensionRatio(sample);
  const overThreshold = clamp((tensionRatio - recipe.tensionThreshold) / (1.25 - recipe.tensionThreshold), 0, 1);
  const nowMs = Math.max(0, finite(sample.nowMs, 0));
  return Object.freeze({
    id,
    audioId: recipe.audioId,
    sourceEvent: tetherCutSourceEvent(sample),
    material: recipe.material,
    mode: recipe.mode,
    title: titleForSignature(id),
    caption: captionForSignature(id),
    importance: Math.min(1, recipe.importance + overThreshold * 0.08),
    playerRelevance: recipe.playerRelevance,
    tensionRatio: round4(tensionRatio),
    tension: Number.isFinite(sample.tension) ? round4(sample.tension) : null,
    maxTension: Number.isFinite(sample.maxTension) ? round4(sample.maxTension) : null,
    gain: round4(0.34 + overThreshold * 0.18),
    playbackRate: round4(1.16 + overThreshold * 0.2),
    targetId: sample.targetId ?? null,
    sourceId: sample.sourceId ?? null,
    startedAtMs: nowMs,
    tags: recipe.tags,
    tones: recipe.tones,
    reuses: recipe.reuses,
    layersWith: recipe.layersWith,
  });
}

export function massGroanGainForMass(towedMass, curve = null) {
  const recipe = getSignatureRecipe('mass.groan');
  const gainCurve = curve || recipe && recipe.gainCurve || {};
  const mass = Math.max(0, finite(towedMass, 0));
  const minMass = Math.max(0, finite(gainCurve.minMass, 0));
  const fullMass = Math.max(minMass + 1, finite(gainCurve.fullMass, minMass + 1));
  if (mass <= minMass) return 0;
  const minGain = clamp(finite(gainCurve.minGain, 0), 0, 1);
  const maxGain = clamp(finite(gainCurve.maxGain, minGain), minGain, 1);
  const t = clamp((mass - minMass) / (fullMass - minMass), 0, 1);
  return round4(minGain + t * (maxGain - minGain));
}

export function buildMassGroanCue(sample = {}) {
  if (sample.active === false || sample.released === true) return null;
  const recipe = getSignatureRecipe('mass.groan');
  if (!recipe) return null;
  const mass = finite(sample.towedMass ?? sample.mass ?? sample.targetMass, 0);
  const gain = massGroanGainForMass(mass, recipe.gainCurve);
  if (gain <= 0) return null;
  const nowMs = Math.max(0, finite(sample.nowMs, 0));
  return Object.freeze({
    id: recipe.id,
    audioId: recipe.audioId,
    sourceEvent: recipe.sourceEvent,
    material: recipe.material,
    mode: recipe.mode,
    title: titleForSignature(recipe.id),
    caption: captionForSignature(recipe.id),
    importance: Math.min(1, recipe.importance + gain * 0.14),
    playerRelevance: recipe.playerRelevance,
    targetId: sample.targetId ?? null,
    sourceId: sample.sourceId ?? null,
    towedMass: round4(mass),
    gain,
    playbackRate: round4(0.72 - Math.min(0.2, gain * 0.28)),
    releaseFadeMs: recipe.releaseFadeMs,
    startedAtMs: nowMs,
    tags: recipe.tags,
    tones: recipe.tones,
    layersWith: recipe.layersWith,
  });
}

export function miningSourceEvent(sample = {}) {
  return sample.sourceEvent || sample.eventId || sample.type || sample.eventType || null;
}

export function miningSeamRichnessDelta(sample = {}) {
  const direct = sample.richnessDelta ?? sample.seamRichnessDelta;
  if (Number.isFinite(direct)) return Math.max(0, direct);
  const recipe = getSignatureRecipe('mining.seam_chime');
  const baseline = finite(
    sample.baselineYieldMult,
    recipe && Number.isFinite(recipe.baselineYieldMult)
      ? recipe.baselineYieldMult
      : MINING_SEAM_BASELINE_YIELD_MULT,
  );
  const yieldMult = finite(sample.yieldMult ?? sample.multiplier ?? sample.seamMult, NaN);
  if (Number.isFinite(yieldMult)) return Math.max(0, yieldMult - baseline);
  if (sample.seamHit === true || sample.onSeam === true || miningSourceEvent(sample) === 'mining:seamHit') {
    return Math.max(0, 1 - baseline);
  }
  return 0;
}

export function shouldThrottleMiningSeam(previous, nowMs, throttleMs = MINING_SEAM_CHIME_THROTTLE_MS) {
  if (!previous) return false;
  const untilMs = finite(previous.untilMs, finite(previous.startedAtMs, 0) + throttleMs);
  return previous.id === 'mining.seam_chime' && finite(nowMs, 0) < untilMs;
}

export function resolveMiningSeamSignature(sample = {}) {
  const recipe = getSignatureRecipe('mining.seam_chime');
  if (!recipe) return null;
  if (miningSourceEvent(sample) && miningSourceEvent(sample) !== recipe.sourceEvent) return null;
  if (sample.seamHit === false || sample.onSeam === false) return null;
  const nowMs = Math.max(0, finite(sample.nowMs, 0));
  if (shouldThrottleMiningSeam(sample.previous, nowMs, recipe.throttleMs)) return null;
  return miningSeamRichnessDelta(sample) >= recipe.richnessThreshold ? recipe.id : null;
}

export function buildMiningSeamCue(sample = {}) {
  const id = resolveMiningSeamSignature(sample);
  if (!id) return null;
  const recipe = getSignatureRecipe(id);
  const richnessDelta = miningSeamRichnessDelta(sample);
  const normalized = clamp((richnessDelta - recipe.richnessThreshold) / (1 - recipe.richnessThreshold), 0, 1);
  const nowMs = Math.max(0, finite(sample.nowMs, 0));
  return Object.freeze({
    id,
    audioId: recipe.audioId,
    sourceEvent: recipe.sourceEvent,
    material: recipe.material,
    mode: recipe.mode,
    title: titleForSignature(id),
    caption: captionForSignature(id),
    importance: Math.min(1, recipe.importance + normalized * 0.06),
    playerRelevance: recipe.playerRelevance,
    asteroidId: sample.asteroidId ?? null,
    richnessDelta: round4(richnessDelta),
    yieldMult: Number.isFinite(sample.yieldMult) ? round4(sample.yieldMult) : null,
    gain: round4(0.18 + normalized * 0.14),
    playbackRate: round4(1.06 + normalized * 0.34),
    startedAtMs: nowMs,
    untilMs: nowMs + Math.max(1, finite(recipe.throttleMs, MINING_SEAM_CHIME_THROTTLE_MS)),
    tags: recipe.tags,
    tones: recipe.tones,
    reuses: recipe.reuses,
  });
}

export function resolveMiningVentBonusSignature(sample = {}) {
  const recipe = getSignatureRecipe('mining.vent_bonus');
  if (!recipe) return null;
  if (miningSourceEvent(sample) && miningSourceEvent(sample) !== recipe.sourceEvent) return null;
  if (sample.phase !== recipe.requiresPhase) return null;
  if (sample.forced === false || sample.clean === false || sample.bonus === false) return null;
  if (sample.browserEligible === false || sample.headless === true) return null;
  if (sample.ownerId != null && sample.playerId != null && sample.ownerId !== sample.playerId) return null;
  return recipe.id;
}

export function buildMiningVentBonusCue(sample = {}) {
  const id = resolveMiningVentBonusSignature(sample);
  if (!id) return null;
  const recipe = getSignatureRecipe(id);
  const nowMs = Math.max(0, finite(sample.nowMs, 0));
  return Object.freeze({
    id,
    audioId: recipe.audioId,
    sourceEvent: recipe.sourceEvent,
    material: recipe.material,
    mode: recipe.mode,
    title: titleForSignature(id),
    caption: captionForSignature(id),
    importance: recipe.importance,
    playerRelevance: recipe.playerRelevance,
    ownerId: sample.ownerId ?? null,
    phase: sample.phase,
    forced: sample.forced !== false,
    clean: sample.clean !== false,
    browserEligible: sample.browserEligible !== false,
    startedAtMs: nowMs,
    tags: recipe.tags,
    tones: recipe.tones,
    reuses: recipe.reuses,
  });
}

function playerTeamFromState(state) {
  const entities = state && state.entities;
  const player = entities && typeof entities.get === 'function' ? entities.get(state.playerId) : null;
  return player && Number.isFinite(player.team) ? player.team : 0;
}

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value, min, max) {
  const n = finite(value, min);
  return n < min ? min : n > max ? max : n;
}

function round4(value) {
  return Math.round(finite(value, 0) * 10000) / 10000;
}
