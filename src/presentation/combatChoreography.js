// Pure data + helpers for doctrine-specific combat presentation choreography.
// Headless / deterministic: no DOM, Three, wall clock, or random sampling.

export const COMBAT_CHOREOGRAPHY_VERSION = 1;

export const COMBAT_CHOREOGRAPHY_PHASES = Object.freeze([
  'setup',
  'telegraph',
  'action',
  'aftermath',
]);

export const DOCTRINE_IDS = Object.freeze([
  'interceptor_flyby',
  'tether_control_raider',
  'ranged_disengager',
]);

export const DAMAGE_LAYERS = Object.freeze(['shield', 'armor', 'hull']);

const DOCTRINE_GRAMMARS = Object.freeze({
  interceptor_flyby: grammar('interceptor_flyby', 'wedge', '#ffb35c', 'engine_flare', 'strike', 'extend'),
  tether_control_raider: grammar('tether_control_raider', 'arc', '#8d66ff', 'attach_spool', 'action_attach', 'control'),
  ranged_disengager: grammar('ranged_disengager', 'bracket', '#ff5c5c', 'weapon_charge', 'fire_window', 'reset'),
});

const BREAK_PHASES = Object.freeze({
  interceptor_flyby: new Set(['extend', 'breakaway']),
  tether_control_raider: new Set(['escape']),
  ranged_disengager: new Set(['reset', 'retreat']),
});

const WITHDRAW_PHASES = Object.freeze({
  interceptor_flyby: new Set(['reform']),
  tether_control_raider: new Set(['reform']),
  ranged_disengager: new Set(['outer_standoff']),
});

export function isLiveDoctrineId(id) {
  return typeof id === 'string' && Object.hasOwn(DOCTRINE_GRAMMARS, id);
}

export function grammarForDoctrine(id) {
  return DOCTRINE_GRAMMARS[id] || null;
}

export function doctrinePhaseStage(doctrineId, phase) {
  if (!isLiveDoctrineId(doctrineId) || typeof phase !== 'string') return null;
  if (BREAK_PHASES[doctrineId].has(phase)) return 'break';
  if (WITHDRAW_PHASES[doctrineId].has(phase)) return 'withdraw';
  return null;
}

export function damageLayerHierarchy(payload = {}) {
  const layers = [];
  if (positive(payload.shieldDamage) || payload.shieldHit || payload.shieldAbsorbed || payload.brokeShield) layers.push('shield');
  if (positive(payload.armorDamage) || payload.armorHit) layers.push('armor');
  if (positive(payload.hullDamage) || payload.hullHit) layers.push('hull');
  return layers;
}

export function deepestDamageLayer(payload = {}) {
  const layers = damageLayerHierarchy(payload);
  return layers.length ? layers[layers.length - 1] : null;
}

export function validateCombatChoreography() {
  const issues = [];
  for (const doctrineId of DOCTRINE_IDS) {
    const item = grammarForDoctrine(doctrineId);
    if (!item || item.doctrineId !== doctrineId) issues.push(`${doctrineId}: missing grammar`);
    if (!item || item.phases.join('|') !== COMBAT_CHOREOGRAPHY_PHASES.join('|')) issues.push(`${doctrineId}: invalid phase order`);
    if (!item || item.telegraphTicks < 30) issues.push(`${doctrineId}: telegraph must last at least 30 ticks`);
  }
  return { ok: issues.length === 0, issues };
}

function grammar(doctrineId, shape, color, telegraphKind, actionKind, aftermathKind) {
  return Object.freeze({
    doctrineId,
    phases: COMBAT_CHOREOGRAPHY_PHASES,
    shape,
    color,
    telegraphTicks: 30,
    telegraphKind,
    actionKind,
    aftermathKind,
  });
}

function positive(value) {
  return Number.isFinite(value) && value > 0;
}
