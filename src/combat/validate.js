import { COMBAT_CUE_IDS } from '../data/combatDefs.js';

const PHASES = ['startup', 'active', 'recovery'];
const TARGET_KINDS = new Set(['none', 'entity', 'attachment', 'point']);
const EFFECT_TIMINGS = new Set(['startupStart', 'activeStart', 'activeEachTick', 'recoveryStart']);
const EFFECT_TYPES = new Set(['createAttachment', 'reelAttachment', 'cutAttachment', 'damage']);
const STATUS_STACKING = new Set(['refresh', 'stack', 'replace', 'ignore']);
const VOLUME_SHAPES = new Set(['circle', 'box', 'capsule']);

export function validateCombatCatalog(catalog, options = {}) {
  const errors = [];
  const warnings = [];
  const cueIds = new Set(options.cueIds || COMBAT_CUE_IDS);
  const actions = arrayOf(catalog, 'actionDefs', 'actions');
  const statuses = arrayOf(catalog, 'statusDefs', 'statuses');
  const subsystems = arrayOf(catalog, 'subsystemDefs', 'subsystems');
  const attachments = arrayOf(catalog, 'attachmentDefs', 'attachments');
  const profiles = arrayOf(catalog, 'combatProfiles', 'profiles');
  const actionById = index(actions, 'ActionDef', errors);
  const statusById = index(statuses, 'StatusDef', errors);
  const subsystemById = index(subsystems, 'SubsystemDef', errors);
  const attachmentById = index(attachments, 'AttachmentDef', errors);
  index(profiles, 'CombatProfile', errors);

  for (const def of actions) validateAction(def, { errors, warnings, cueIds, actions, statusById, attachmentById });
  for (const def of statuses) validateStatus(def, { errors, cueIds, statusById });
  for (const def of subsystems) validateSubsystem(def, { errors, cueIds, subsystemById });
  validateDependencyCycles(subsystems, subsystemById, errors);
  for (const def of attachments) validateAttachment(def, { errors, cueIds });
  for (const profile of profiles) validateProfile(profile, { errors, subsystemById });

  return { ok: errors.length === 0, errors, warnings };
}

export function assertValidCombatCatalog(catalog, options = {}) {
  const result = validateCombatCatalog(catalog, options);
  if (!result.ok) {
    const error = new Error(`Combat catalog validation failed (${result.errors.length}):\n${result.errors.map((item) => ` - ${item}`).join('\n')}`);
    error.validation = result;
    throw error;
  }
  return result;
}

export function validateDamagePacket(packet, options = {}) {
  const errors = [];
  const channels = options.channels || ['kinetic', 'thermal', 'ion', 'plasma', 'phase'];
  if (!packet || typeof packet !== 'object') return { ok: false, errors: ['DamagePacket must be an object'] };
  if (!packet.channels || typeof packet.channels !== 'object') errors.push('DamagePacket.channels is required');
  for (const channel of channels) {
    const value = packet.channels && packet.channels[channel];
    if (value != null && (!Number.isFinite(value) || value < 0)) errors.push(`DamagePacket.channels.${channel} must be finite and >= 0`);
  }
  if (packet.channels) {
    for (const channel of Object.keys(packet.channels)) if (!channels.includes(channel)) errors.push(`DamagePacket has unknown channel: ${channel}`);
  }
  if (packet.penetration != null && (!Number.isFinite(packet.penetration) || packet.penetration < 0 || packet.penetration > 1)) errors.push('DamagePacket.penetration must be in [0,1]');
  if (packet.heat != null && (!Number.isFinite(packet.heat) || packet.heat < 0)) errors.push('DamagePacket.heat must be finite and >= 0');
  if (packet.subsystemShare != null && (!Number.isFinite(packet.subsystemShare) || packet.subsystemShare < 0 || packet.subsystemShare > 1)) errors.push('DamagePacket.subsystemShare must be in [0,1]');
  if (packet.statuses != null && !Array.isArray(packet.statuses)) errors.push('DamagePacket.statuses must be an array');
  return { ok: errors.length === 0, errors };
}

function validateAction(def, ctx) {
  const path = `ActionDef(${idOf(def)})`;
  if (!def || typeof def !== 'object') return;
  if (!positiveVersion(def.version)) ctx.errors.push(`${path}.version must be a positive integer`);
  if (!Array.isArray(def.tags) || !def.tags.length) ctx.errors.push(`${path}.tags must be a non-empty array`);
  const phases = def.phases || {};
  const durations = {
    startup: phases.startupTicks,
    active: phases.activeTicks,
    recovery: phases.recoveryTicks,
  };
  for (const [phase, value] of Object.entries(durations)) if (!nonNegativeInteger(value)) ctx.errors.push(`${path}.phases.${phase}Ticks must be an integer >= 0`);
  const total = Object.values(durations).reduce((sum, value) => sum + (nonNegativeInteger(value) ? value : 0), 0);
  if (total <= 0) ctx.errors.push(`${path} has no reachable phase`);
  if (!nonNegativeInteger(def.cooldownTicks)) ctx.errors.push(`${path}.cooldownTicks must be an integer >= 0`);
  for (const [name, value] of Object.entries(def.costs || {})) if (!finiteNonNegative(value)) ctx.errors.push(`${path}.costs.${name} must be finite and >= 0`);

  const target = def.target || {};
  if (!TARGET_KINDS.has(target.kind)) ctx.errors.push(`${path}.target.kind is invalid`);
  if (target.maxRange != null && !finiteNonNegative(target.maxRange)) ctx.errors.push(`${path}.target.maxRange must be finite and >= 0`);
  if (target.required && target.kind === 'none') ctx.errors.push(`${path} cannot require a none target`);

  for (let i = 0; i < (def.cancelWindows || []).length; i++) {
    const window = def.cancelWindows[i];
    const windowPath = `${path}.cancelWindows[${i}]`;
    if (!PHASES.includes(window.phase)) { ctx.errors.push(`${windowPath}.phase is invalid`); continue; }
    const duration = durations[window.phase];
    if (!nonNegativeInteger(window.fromTick) || !nonNegativeInteger(window.toTick) || window.toTick <= window.fromTick) ctx.errors.push(`${windowPath} must have integer 0 <= fromTick < toTick`);
    else if (!nonNegativeInteger(duration) || window.toTick > duration) ctx.errors.push(`${windowPath} lies outside the ${window.phase} phase`);
    const intoTags = window.intoTags || [];
    if (!Array.isArray(intoTags)) ctx.errors.push(`${windowPath}.intoTags must be an array`);
    else if (intoTags.length && !ctx.actions.some((candidate) => candidate !== def && (candidate.tags || []).some((tag) => intoTags.includes(tag)))) {
      ctx.errors.push(`${windowPath} is impossible: no other ActionDef has a permitted tag`);
    }
  }

  if (def.movement) {
    if (!EFFECT_TIMINGS.has(def.movement.at)) ctx.errors.push(`${path}.movement.at is invalid`);
    if (!(Number.isFinite(def.movement.magnitude) && def.movement.magnitude >= 0)) ctx.errors.push(`${path}.movement.magnitude must be finite and >= 0`);
    if (def.movement.at && def.movement.at.startsWith('active') && durations.active === 0) ctx.errors.push(`${path}.movement is unreachable because activeTicks is 0`);
  }

  for (let i = 0; i < (def.effects || []).length; i++) {
    const effect = def.effects[i];
    const effectPath = `${path}.effects[${i}]`;
    if (!EFFECT_TIMINGS.has(effect.at)) ctx.errors.push(`${effectPath}.at is invalid`);
    if (!EFFECT_TYPES.has(effect.type)) ctx.errors.push(`${effectPath}.type is invalid`);
    if (effect.at && effect.at.startsWith('active') && durations.active === 0) ctx.errors.push(`${effectPath} is unreachable because activeTicks is 0`);
    if (effect.at === 'startupStart' && durations.startup === 0) ctx.errors.push(`${effectPath} is unreachable because startupTicks is 0`);
    if (effect.at === 'recoveryStart' && durations.recovery === 0) ctx.errors.push(`${effectPath} is unreachable because recoveryTicks is 0`);
    if (effect.type === 'createAttachment' && !ctx.attachmentById.has(effect.attachmentDefId)) ctx.errors.push(`${effectPath}.attachmentDefId does not resolve`);
    if (effect.type === 'damage') {
      const packetResult = validateDamagePacket(effect.packet || {});
      for (const error of packetResult.errors) ctx.errors.push(`${effectPath}: ${error}`);
      for (const status of effect.packet && effect.packet.statuses || []) if (!ctx.statusById.has(status.id)) ctx.errors.push(`${effectPath} references missing StatusDef ${status.id}`);
    }
  }

  const requiredCues = ['start', 'active', 'end', 'reject'];
  if ((def.cancelWindows || []).length) requiredCues.push('cancel');
  for (const cueName of requiredCues) {
    const cueId = def.cues && def.cues[cueName];
    if (typeof cueId !== 'string' || !cueId) ctx.errors.push(`${path}.cues.${cueName} is required`);
    else if (!ctx.cueIds.has(cueId)) ctx.errors.push(`${path}.cues.${cueName} references missing cue ID ${cueId}`);
  }
}

function validateStatus(def, ctx) {
  const path = `StatusDef(${idOf(def)})`;
  if (!positiveVersion(def.version)) ctx.errors.push(`${path}.version must be a positive integer`);
  if (!positiveInteger(def.durationTicks)) ctx.errors.push(`${path}.durationTicks must be an integer > 0`);
  const mode = def.stacking && def.stacking.mode;
  if (!STATUS_STACKING.has(mode)) ctx.errors.push(`${path}.stacking.mode is invalid`);
  if (!positiveInteger(def.stacking && def.stacking.maxStacks)) ctx.errors.push(`${path}.stacking.maxStacks must be an integer > 0`);
  validateCue(def.cueId, `${path}.cueId`, ctx);
  for (const [i, interaction] of (def.interactions || []).entries()) {
    if (!ctx.statusById.has(interaction.with)) ctx.errors.push(`${path}.interactions[${i}].with does not resolve`);
    if (interaction.apply && !ctx.statusById.has(interaction.apply)) ctx.errors.push(`${path}.interactions[${i}].apply does not resolve`);
  }
  if (def.periodic) {
    if (!positiveInteger(def.periodic.everyTicks)) ctx.errors.push(`${path}.periodic.everyTicks must be an integer > 0`);
    const result = validateDamagePacket(def.periodic.packet || {});
    for (const error of result.errors) ctx.errors.push(`${path}.periodic: ${error}`);
  }
}

function validateSubsystem(def, ctx) {
  const path = `SubsystemDef(${idOf(def)})`;
  if (!positiveVersion(def.version)) ctx.errors.push(`${path}.version must be a positive integer`);
  if (!(Number.isFinite(def.health) && def.health > 0)) ctx.errors.push(`${path}.health must be finite and > 0`);
  if (!def.volume || !VOLUME_SHAPES.has(def.volume.shape)) ctx.errors.push(`${path}.volume.shape is invalid`);
  if (!def.disabledBehavior || typeof def.disabledBehavior !== 'object') ctx.errors.push(`${path}.disabledBehavior is required`);
  for (const dependency of def.dependencies || []) if (!ctx.subsystemById.has(dependency)) ctx.errors.push(`${path}.dependencies references missing SubsystemDef ${dependency}`);
  validateCue(def.cueId, `${path}.cueId`, ctx);
}

function validateDependencyCycles(subsystems, byId, errors) {
  const visiting = new Set(), visited = new Set();
  function visit(id, trail) {
    if (visiting.has(id)) { errors.push(`Subsystem dependency cycle: ${[...trail, id].join(' -> ')}`); return; }
    if (visited.has(id)) return;
    visiting.add(id);
    const def = byId.get(id);
    for (const dependency of def && def.dependencies || []) visit(dependency, [...trail, id]);
    visiting.delete(id);
    visited.add(id);
  }
  for (const def of subsystems) visit(def.id, []);
}

function validateAttachment(def, ctx) {
  const path = `AttachmentDef(${idOf(def)})`;
  if (!positiveVersion(def.version)) ctx.errors.push(`${path}.version must be a positive integer`);
  if (!Array.isArray(def.sourceSocketTags) || !def.sourceSocketTags.length) ctx.errors.push(`${path}.sourceSocketTags must be non-empty`);
  if (!Array.isArray(def.targetSocketTags) || !def.targetSocketTags.length) ctx.errors.push(`${path}.targetSocketTags must be non-empty`);
  if (!def.ownership || !['initiator', 'target', 'neutral'].includes(def.ownership.policy)) ctx.errors.push(`${path}.ownership.policy is invalid`);
  for (const key of ['maxTension', 'maxImpulse', 'graceTicks']) if (def.break && def.break[key] != null && !finiteNonNegative(def.break[key])) ctx.errors.push(`${path}.break.${key} must be finite and >= 0`);
  validateCue(def.cues && def.cues.created, `${path}.cues.created`, ctx);
  validateCue(def.cues && def.cues.broken, `${path}.cues.broken`, ctx);
}

function validateProfile(profile, ctx) {
  const path = `CombatProfile(${idOf(profile)})`;
  if (!positiveVersion(profile.version)) ctx.errors.push(`${path}.version must be a positive integer`);
  for (const subsystemId of profile.subsystemIds || []) if (!ctx.subsystemById.has(subsystemId)) ctx.errors.push(`${path}.subsystemIds references missing SubsystemDef ${subsystemId}`);
  const socketIds = new Set();
  for (const socket of profile.sockets || []) {
    if (!socket.id || socketIds.has(socket.id)) ctx.errors.push(`${path} has duplicate/empty socket id ${socket.id}`);
    socketIds.add(socket.id);
    if (!Array.isArray(socket.tags) || !socket.tags.length) ctx.errors.push(`${path}.socket(${socket.id}).tags must be non-empty`);
    if (!positiveInteger(socket.maxAttachments)) ctx.errors.push(`${path}.socket(${socket.id}).maxAttachments must be > 0`);
  }
}

function validateCue(cueId, path, ctx) {
  if (typeof cueId !== 'string' || !cueId) ctx.errors.push(`${path} is required`);
  else if (!ctx.cueIds.has(cueId)) ctx.errors.push(`${path} references missing cue ID ${cueId}`);
}

function index(items, label, errors) {
  const map = new Map();
  for (const item of items) {
    if (!item || typeof item.id !== 'string' || !item.id) { errors.push(`${label} has an empty id`); continue; }
    if (map.has(item.id)) errors.push(`Duplicate ${label} id: ${item.id}`);
    map.set(item.id, item);
  }
  return map;
}

function arrayOf(catalog, arrayName, mapName) {
  if (Array.isArray(catalog && catalog[arrayName])) return catalog[arrayName];
  const map = catalog && catalog[mapName];
  return map instanceof Map ? [...map.values()] : [];
}

function idOf(def) {
  return def && def.id || '<missing>';
}

function positiveVersion(value) { return positiveInteger(value); }
function positiveInteger(value) { return Number.isInteger(value) && value > 0; }
function nonNegativeInteger(value) { return Number.isInteger(value) && value >= 0; }
function finiteNonNegative(value) { return Number.isFinite(value) && value >= 0; }
