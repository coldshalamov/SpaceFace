// SG-03 canonical combat grammar. Pure data: no DOM, renderer, wall clock, or runtime imports.
// Durations are integer simulation ticks at the SG-01 fixed step (normally 60 Hz).

export const COMBAT_SCHEMA_VERSION = 1;

export const GRAVITY_MARK_STATUS_ID = 'status_gravity_marked';
export const MOMENTUM_SINK_STATUS_ID = 'status_momentum_sink';
export const PINNED_STATUS_ID = 'status_pinned';
export const UNMOORED_STATUS_ID = 'status_unmoored';
export const CRYO_LOCK_STATUS_ID = 'status_cryo_lock';

export const COMBAT_CUE_IDS = Object.freeze([
  'combat.action.dash.start', 'combat.action.dash.active', 'combat.action.dash.end',
  'combat.action.attach.start', 'combat.action.attach.lock', 'combat.action.attach.end',
  'combat.action.reel.start', 'combat.action.reel.tick', 'combat.action.reel.end',
  'combat.action.sling.start', 'combat.action.sling.release', 'combat.action.sling.end',
  'combat.action.cut.start', 'combat.action.cut.snap', 'combat.action.cut.end',
  'combat.action.burst.start', 'combat.action.burst.fire', 'combat.action.burst.end',
  'combat.action.cancel', 'combat.action.reject',
  'combat.damage.shield', 'combat.damage.armor', 'combat.damage.hull', 'combat.damage.kill', 'combat.damage.charge',
  'cruise.charging', 'cruise.engaged', 'cruise.dropped',
  'ai.telegraph', 'ai.flee', 'ai.formation_broken',
  'presentation.tether.attach', 'presentation.tether.break',
  'combat.subsystem.drive.disabled', 'combat.subsystem.weapon.disabled',
  'combat.subsystem.sensor.disabled', 'combat.subsystem.tether.disabled',
  'combat.subsystem.power.disabled', 'combat.subsystem.restored',
  'combat.status.ionized', 'combat.status.burning', 'combat.status.overheated',
  'combat.status.scrambled', 'combat.status.gravity_marked', 'combat.status.momentum_sink',
  'combat.status.cryo_lock',
  'combat.attachment.created', 'combat.attachment.broken',
]);

export const DAMAGE_MODEL = Object.freeze({
  version: COMBAT_SCHEMA_VERSION,
  channelOrder: Object.freeze(['kinetic', 'thermal', 'ion', 'plasma', 'phase']),
  shieldMultipliers: Object.freeze({ kinetic: 0.82, thermal: 1.0, ion: 1.35, plasma: 1.15, phase: 0.35 }),
  armorMultipliers: Object.freeze({ kinetic: 0.92, thermal: 0.78, ion: 0.28, plasma: 1.20, phase: 0.55 }),
  hullMultipliers: Object.freeze({ kinetic: 1.0, thermal: 1.0, ion: 0.55, plasma: 1.08, phase: 1.0 }),
  // Default guns primarily kill hull. High share made starter pulse lasers take hundreds of hits
  // because 75% of post-armor damage only chipped subsystems. EMP/disable verbs still set
  // subsystemShare: 1.0 on the weapon packet.
  subsystemShare: 0.35,
  subsystemArmorMultipliers: Object.freeze({ kinetic: 0.95, thermal: 0.85, ion: 1.20, plasma: 1.05, phase: 1.0 }),
});

export const ACTION_DEFS = Object.freeze([
  {
    id: 'action_dash', version: 1, tags: ['movement', 'dash'],
    phases: { startupTicks: 1, activeTicks: 1, recoveryTicks: 2 },
    cancelWindows: [{ phase: 'recovery', fromTick: 0, toTick: 2, intoTags: ['attach'] }],
    cooldownTicks: 8, costs: { capacitor: 8, heat: 2 },
    target: { kind: 'none', required: false },
    requiresCapabilities: ['drive'],
    movement: { at: 'activeStart', kind: 'forwardImpulse', magnitude: 18 },
    effects: [],
    cues: { start: 'combat.action.dash.start', active: 'combat.action.dash.active', end: 'combat.action.dash.end', cancel: 'combat.action.cancel', reject: 'combat.action.reject' },
  },
  {
    id: 'action_attach', version: 1, tags: ['tether', 'attach'],
    phases: { startupTicks: 1, activeTicks: 1, recoveryTicks: 2 },
    cancelWindows: [{ phase: 'recovery', fromTick: 0, toTick: 2, intoTags: ['reel'] }],
    cooldownTicks: 6, costs: { capacitor: 5, heat: 1 },
    target: {
      kind: 'entity', required: true, maxRange: 140, hostile: false,
      sourceSocketTag: 'massline', targetSocketTag: 'tether',
    },
    requiresCapabilities: ['tether'],
    movement: null,
    effects: [{ at: 'activeStart', type: 'createAttachment', attachmentDefId: 'attachment_massline' }],
    cues: { start: 'combat.action.attach.start', active: 'combat.action.attach.lock', end: 'combat.action.attach.end', cancel: 'combat.action.cancel', reject: 'combat.action.reject' },
  },
  {
    id: 'action_reel', version: 1, tags: ['tether', 'reel'],
    phases: { startupTicks: 0, activeTicks: 4, recoveryTicks: 1 },
    cancelWindows: [{ phase: 'active', fromTick: 2, toTick: 4, intoTags: ['sling', 'cut'] }],
    cooldownTicks: 2, costs: { capacitor: 4, heat: 1 },
    target: { kind: 'attachment', required: true, ownedByActor: true },
    requiresCapabilities: ['tether'],
    movement: null,
    effects: [{ at: 'activeEachTick', type: 'reelAttachment', restLengthDelta: -4, minRestLength: 8 }],
    cues: { start: 'combat.action.reel.start', active: 'combat.action.reel.tick', end: 'combat.action.reel.end', cancel: 'combat.action.cancel', reject: 'combat.action.reject' },
  },
  {
    id: 'action_sling', version: 1, tags: ['movement', 'tether', 'sling'],
    phases: { startupTicks: 1, activeTicks: 1, recoveryTicks: 2 },
    cancelWindows: [{ phase: 'recovery', fromTick: 0, toTick: 2, intoTags: ['cut'] }],
    cooldownTicks: 8, costs: { capacitor: 10, heat: 4 },
    target: { kind: 'attachment', required: true, ownedByActor: true },
    requiresCapabilities: ['drive', 'tether'],
    movement: { at: 'activeStart', kind: 'attachmentTangentImpulse', magnitude: 22 },
    effects: [],
    cues: { start: 'combat.action.sling.start', active: 'combat.action.sling.release', end: 'combat.action.sling.end', cancel: 'combat.action.cancel', reject: 'combat.action.reject' },
  },
  {
    id: 'action_cut', version: 1, tags: ['tether', 'cut'],
    phases: { startupTicks: 0, activeTicks: 1, recoveryTicks: 1 },
    cancelWindows: [{ phase: 'recovery', fromTick: 0, toTick: 1, intoTags: ['burst'] }],
    cooldownTicks: 1, costs: { capacitor: 0, heat: 0 },
    target: { kind: 'attachment', required: true, ownedByActor: true },
    requiresCapabilities: [],
    movement: null,
    effects: [{ at: 'activeStart', type: 'cutAttachment', reason: 'action_cut' }],
    cues: { start: 'combat.action.cut.start', active: 'combat.action.cut.snap', end: 'combat.action.cut.end', cancel: 'combat.action.cancel', reject: 'combat.action.reject' },
  },
  {
    id: 'action_burst', version: 1, tags: ['weapon', 'burst'],
    phases: { startupTicks: 1, activeTicks: 1, recoveryTicks: 2 },
    cancelWindows: [],
    cooldownTicks: 12, costs: { capacitor: 12, heat: 7 },
    target: { kind: 'entity', required: true, maxRange: 220, hostile: true },
    requiresCapabilities: ['weapon', 'sensor'],
    movement: null,
    effects: [{
      at: 'activeStart', type: 'damage',
      packet: {
        channels: { kinetic: 0, thermal: 0, ion: 8, plasma: 28, phase: 0 },
        penetration: 0.20, heat: 6,
        statuses: [{ id: 'status_ionized', stacks: 1 }],
      },
    }],
    cues: { start: 'combat.action.burst.start', active: 'combat.action.burst.fire', end: 'combat.action.burst.end', cancel: 'combat.action.cancel', reject: 'combat.action.reject' },
  },
]);

export const STATUS_DEFS = Object.freeze([
  {
    id: 'status_tumbling', version: 1, tags: ['massline', 'control_loss'], durationTicks: 360,
    stacking: { mode: 'refresh', maxStacks: 1 }, immunityTags: [],
    // This status owns the active tumble fact and the canonical combat-action gate. The physical
    // tumble system consumes Massline-owned status metadata for zero-control and RCS recovery, so
    // SG-03 cannot spend capacitor on dash/tether/weapon verbs while the hull is uncontrolled.
    effects: { blockedActionTags: ['dash', 'tether', 'weapon'] },
    interactions: [], periodic: null, cueId: 'ai.formation_broken',
  },
  {
    // PQ-026 Gravity Mark: the weapon earns stronger coupling to the existing field kernel. This is
    // deliberately a response multiplier, not a mass/velocity write: flight, facing, braking, and
    // ordinary thrust remain wholly owned by their existing systems.
    id: GRAVITY_MARK_STATUS_ID, version: 1, tags: ['gravity', 'field_coupling'], durationTicks: 360,
    stacking: { mode: 'refresh', maxStacks: 1 }, immunityTags: [],
    effects: { multipliers: { fieldCoupling: 1.9 } },
    interactions: [], periodic: null, cueId: 'combat.status.gravity_marked',
  },
  {
    // PQ-026 Momentum Sink is an offensive, frame-relative force effect. The combat kernel binds
    // this status to its attacker's translational velocity and queues capped impulses through the
    // physics membrane; this definition deliberately owns no movement/control multiplier.
    id: MOMENTUM_SINK_STATUS_ID, version: 1, tags: ['gravity', 'momentum', 'frame_relative'], durationTicks: 240,
    stacking: { mode: 'replace', maxStacks: 1 }, immunityTags: [],
    effects: {}, interactions: [], periodic: null, cueId: 'combat.status.momentum_sink',
  },
  {
    // A Well makes the body physically expensive to accelerate. The status changes only the
    // physics owner's effective mass/inertia; it owns no velocity, input, steering, or speed rule.
    id: PINNED_STATUS_ID, version: 1, tags: ['gravity', 'mass_response', 'pinned'], durationTicks: 90,
    stacking: { mode: 'refresh', maxStacks: 1 }, immunityTags: [],
    effects: { physicsResponse: { massScale: 6, inertiaScale: 6 } },
    interactions: [{ with: UNMOORED_STATUS_ID, consumeWith: true }],
    periodic: null, cueId: 'combat.status.gravity_marked',
  },
  {
    // A Repulsor makes the body physically light enough for ordinary forces and impacts to throw.
    // It does not add force of its own and never alters the body's controls or authored speed cap.
    id: UNMOORED_STATUS_ID, version: 1, tags: ['gravity', 'mass_response', 'unmoored'], durationTicks: 90,
    stacking: { mode: 'refresh', maxStacks: 1 }, immunityTags: [],
    effects: { physicsResponse: { massScale: 0.3, inertiaScale: 0.3 } },
    interactions: [{ with: PINNED_STATUS_ID, consumeWith: true }],
    periodic: null, cueId: 'combat.status.gravity_marked',
  },
  {
    id: 'status_ionized', version: 1, tags: ['ion'], durationTicks: 90,
    stacking: { mode: 'refresh', maxStacks: 3 }, immunityTags: ['ion_immune'],
    effects: { multipliers: { capRegen: 0.70 } },
    interactions: [{ with: 'status_overheated', apply: 'status_scrambled', consumeWith: false }],
    periodic: null, cueId: 'combat.status.ionized',
  },
  {
    id: 'status_burning', version: 1, tags: ['thermal', 'damage_over_time'], durationTicks: 120,
    stacking: { mode: 'stack', maxStacks: 3 }, immunityTags: ['thermal_immune'],
    effects: {}, interactions: [],
    periodic: {
      everyTicks: 30,
      packet: { channels: { kinetic: 0, thermal: 4, ion: 0, plasma: 0, phase: 0 }, penetration: 0, heat: 1, statuses: [] },
    },
    cueId: 'combat.status.burning',
  },
  {
    // PQ-133.06b Cryo Lock. Catalog identity only: duration and stacks. The helm reads
    // stacks through cryoLockControlScale. This definition never writes velocity.
    id: CRYO_LOCK_STATUS_ID, version: 1, tags: ['thermal', 'cryo', 'control'], durationTicks: 90,
    stacking: { mode: 'refresh', maxStacks: 3 }, immunityTags: [],
    effects: {},
    interactions: [],
    periodic: null, cueId: 'combat.status.cryo_lock',
  },
  {
    id: 'status_overheated', version: 1, tags: ['thermal'], durationTicks: 60,
    stacking: { mode: 'refresh', maxStacks: 1 }, immunityTags: ['thermal_immune'],
    effects: { blockedActionTags: ['weapon', 'burst'], multipliers: { heatDissipation: 0.35 } },
    interactions: [{ with: 'status_ionized', apply: 'status_scrambled', consumeWith: false }],
    periodic: null, cueId: 'combat.status.overheated',
  },
  {
    id: 'status_scrambled', version: 1, tags: ['electronic'], durationTicks: 75,
    stacking: { mode: 'refresh', maxStacks: 1 }, immunityTags: ['electronic_immune'],
    effects: { capabilities: { sensor: false }, blockedActionTags: ['lock', 'sensor'] },
    interactions: [], periodic: null, cueId: 'combat.status.scrambled',
  },
]);

export const SUBSYSTEM_DEFS = Object.freeze([
  {
    id: 'subsystem_drive', version: 1, tags: ['drive'],
    volume: { shape: 'box', space: 'normalized', center: [-0.58, 0], halfExtents: [0.28, 0.42] },
    health: 45, armor: { flat: 2, multipliers: { kinetic: 0.9, thermal: 1.0, ion: 1.1, plasma: 1.0, phase: 1.0 } },
    dependencies: ['subsystem_power'],
    disabledBehavior: { capabilities: { drive: false }, multipliers: { movement: 0 }, blockedActionTags: ['dash', 'sling'] },
    repair: { fieldRatePerTick: 0.25, dockRatePerTick: 2 }, cueId: 'combat.subsystem.drive.disabled',
  },
  {
    id: 'subsystem_weapon', version: 1, tags: ['weapon'],
    volume: { shape: 'box', space: 'normalized', center: [0.50, 0], halfExtents: [0.34, 0.36] },
    health: 38, armor: { flat: 1, multipliers: { kinetic: 1.0, thermal: 0.9, ion: 1.0, plasma: 1.1, phase: 1.0 } },
    dependencies: ['subsystem_power'],
    disabledBehavior: { capabilities: { weapon: false }, blockedActionTags: ['weapon', 'burst'] },
    repair: { fieldRatePerTick: 0.20, dockRatePerTick: 2 }, cueId: 'combat.subsystem.weapon.disabled',
  },
  {
    id: 'subsystem_sensor', version: 1, tags: ['sensor'],
    volume: { shape: 'circle', space: 'normalized', center: [0.72, 0], radius: 0.23 },
    health: 26, armor: { flat: 0.5, multipliers: { kinetic: 1.0, thermal: 1.0, ion: 1.25, plasma: 1.0, phase: 1.0 } },
    dependencies: ['subsystem_power'],
    disabledBehavior: { capabilities: { sensor: false }, blockedActionTags: ['lock', 'sensor'] },
    repair: { fieldRatePerTick: 0.30, dockRatePerTick: 2.5 }, cueId: 'combat.subsystem.sensor.disabled',
  },
  {
    id: 'subsystem_tether_spool', version: 1, tags: ['tether'],
    volume: { shape: 'circle', space: 'normalized', center: [-0.18, 0.48], radius: 0.24 },
    health: 32, armor: { flat: 1, multipliers: { kinetic: 1.0, thermal: 0.9, ion: 1.1, plasma: 1.0, phase: 1.0 } },
    dependencies: ['subsystem_power'],
    disabledBehavior: {
      capabilities: { tether: false }, blockedActionTags: ['attach', 'reel', 'sling'],
      breakOwnedAttachments: true,
    },
    repair: { fieldRatePerTick: 0.25, dockRatePerTick: 2 }, cueId: 'combat.subsystem.tether.disabled',
  },
  {
    id: 'subsystem_power', version: 1, tags: ['power'],
    volume: { shape: 'circle', space: 'normalized', center: [-0.05, 0], radius: 0.30 },
    health: 52, armor: { flat: 3, multipliers: { kinetic: 0.9, thermal: 0.9, ion: 1.25, plasma: 1.05, phase: 1.0 } },
    dependencies: [],
    disabledBehavior: { capabilities: { power: false }, multipliers: { capRegen: 0.20 } },
    repair: { fieldRatePerTick: 0.10, dockRatePerTick: 1.5 }, cueId: 'combat.subsystem.power.disabled',
  },
]);

export const ATTACHMENT_DEFS = Object.freeze([
  {
    id: 'attachment_massline', version: 1,
    sourceSocketTags: ['massline'], targetSocketTags: ['tether'],
    ownership: { policy: 'initiator', transferable: true },
    // +25% break budget vs prior baseline (8200/165/420) — lines were snapping too readily in play.
    break: { maxTension: 10250, maxImpulse: 206.25, maxYank: 525, graceTicks: 4 },
    spring: { K: 170, zeta: 0.90, captureS: 0.30, maxStretchRatio: 0.72, reelSafeStretchRatio: 0.66 },
    // Production action_attach shares the normal-play durability contract: ordinary ship/objective
    // endpoints may load, reel, and exchange momentum, but cannot auto-break the line. Authored
    // extreme operations opt in on an endpoint exactly as tether_standard does. SG-02 remains the
    // momentum owner; this block owns the winch and explicit failure policy.
    massline: { enabled: true, automaticBreakPolicy: 'extreme_load_only' },
    limits: { maxPerOwner: 1 },
    cues: { created: 'combat.attachment.created', broken: 'combat.attachment.broken' },
  },
  {
    id: 'tether_standard', version: 1,
    sourceSocketTags: ['tether_spool'], targetSocketTags: ['tether'],
    ownership: { policy: 'initiator', transferable: true },
    maxLength: 390,
    minLength: 18,
    reelRate: 69,
    // A healthy standard Massline is infrastructure, not a maneuver-timing consumable. Starter-ship
    // thrust, ordinary boost, a slack catch, or a botched slingshot must not sever it. The physical
    // envelope is ten times the previous 1.05M / 19k / 15k tune, and automatic overload breaks are
    // disabled unless a future extreme-load endpoint (for example a station-scale or singularity
    // operation) explicitly opts into that contract. Pilot cut and subsystem/destruction cuts are
    // separate intentional severing paths and remain available.
    breakTension: 10500000,
    snapImpulseNoise: 0,
    break: { maxTension: 10500000, maxImpulse: 190000, maxYank: 150000, graceTicks: 4, stiffness: 90, damping: 6 },
    // The force budget was doubled previously, but the independent geometric edge stayed at 0.72x
    // rest length and remained the real snap authority for short latches. Double that usable stretch
    // envelope as well; the massline overload controller still cuts violent/extreme-mass loads.
    spring: { K: 140, zeta: 0.95, captureS: 0.35, maxStretchRatio: 1.44, reelSafeStretchRatio: 1.32 },
    // The break machinery remains available for explicitly authored future extreme-load endpoints.
    // Normal entities do not opt in, so ordinary piloting cannot accidentally sever the line.
    massline: { enabled: true, overloadGraceS: 1.1, automaticBreakPolicy: 'extreme_load_only' },
    limits: { maxPerOwner: 1 },
    cues: { created: 'combat.attachment.created', broken: 'combat.attachment.broken' },
  },
  {
    id: 'attachment_transverse_snare', version: 1,
    sourceSocketTags: ['tether'], targetSocketTags: ['tether'],
    ownership: { policy: 'initiator', transferable: false },
    // A snare is deliberately expendable. It can hold a genuine crossing, but ordinary thrust
    // and collision load can break it after the visible warning window instead of creating an
    // invisible permanent slow field.
    break: { maxTension: 5400, maxImpulse: 1000, maxYank: 2400, graceTicks: 6 },
    spring: { K: 145, zeta: 0.72, captureS: 0.18, maxStretchRatio: 0.65 },
    limits: { maxPerOwner: 1 },
    cues: { created: 'combat.attachment.created', broken: 'combat.attachment.broken' },
  },
  {
    id: 'attachment_twin_bridle', version: 1,
    sourceSocketTags: ['tether'], targetSocketTags: ['tether'],
    ownership: { policy: 'initiator', transferable: false },
    maxLength: 480,
    // One physical rope between the two chosen bodies. There is no Massline winch block here:
    // Twin Bridle never reels, seeks a speed, or turns the controller ship into a third endpoint.
    break: { maxTension: 9200, maxImpulse: 1800, maxYank: 4200, graceTicks: 8 },
    spring: { K: 110, zeta: 0.88, captureS: 0.35, maxStretchRatio: 0.75 },
    limits: { maxPerOwner: 1 },
    cues: { created: 'combat.attachment.created', broken: 'combat.attachment.broken' },
  },
]);

export const COMBAT_PROFILES = Object.freeze([
  {
    id: 'combat_profile_standard_ship', version: 1, entityTypes: ['ship', 'drone'],
    heat: { max: 100, dissipationPerTick: 0.50 },
    immunityTags: [],
    subsystemIds: ['subsystem_drive', 'subsystem_weapon', 'subsystem_sensor', 'subsystem_tether_spool', 'subsystem_power'],
    sockets: [
      // Legacy SG-03 story Massline anchor. 47-A's golden action_attach tape uses
      // attachment_massline and depends on this fixture-era lever arm; keep player tether tuning on
      // socket_tether_spool so SPEC3-F3 can evolve without rewriting the 47-A expected envelope.
      { id: 'socket_massline', tags: ['massline'], localPos: [-0.25, 0.42], maxAttachments: 1 },
      // Forward spool (radius-normalized, +X = facing). Overnight B1: 0.38→0.50 nose bias.
      // ≥0.72 broke slingshot release energy (check-tether-gameplay); 0.50 is the safe lever.
      { id: 'socket_tether_spool', tags: ['tether_spool'], localPos: [0.50, 0], maxAttachments: 1 },
      { id: 'socket_hull', tags: ['tether'], localPos: [0, 0], maxAttachments: 2 },
    ],
    capabilities: { drive: true, weapon: true, sensor: true, tether: true, power: true },
  },
  {
    id: 'combat_profile_tether_payload', version: 1, entityTypes: ['payload'],
    heat: { max: 0, dissipationPerTick: 0 },
    immunityTags: [],
    subsystemIds: [],
    sockets: [{ id: 'socket_tether_payload', tags: ['tether'], localPos: [0, 0], maxAttachments: 2 }],
    capabilities: { drive: false, weapon: false, sensor: false, tether: false, power: false },
  },
  {
    id: 'combat_profile_tether_anchor', version: 1, entityTypes: ['asteroid', 'wreck', 'pickup', 'fieldEmitter', 'masslineSnareAnchor'],
    heat: { max: 0, dissipationPerTick: 0 },
    immunityTags: [],
    subsystemIds: [],
    sockets: [{ id: 'socket_tether_anchor', tags: ['tether'], localPos: [0, 0], maxAttachments: 4 }],
    capabilities: { drive: false, weapon: false, sensor: false, tether: false, power: false },
  },
  {
    id: 'combat_profile_standard_station', version: 1, entityTypes: ['station'],
    heat: { max: 200, dissipationPerTick: 0.30 },
    immunityTags: [],
    subsystemIds: ['subsystem_weapon', 'subsystem_sensor', 'subsystem_power'],
    sockets: [{ id: 'socket_hull', tags: ['tether'], localPos: [0, 0], maxAttachments: 8 }],
    capabilities: { drive: false, weapon: true, sensor: true, tether: false, power: true },
  },
]);

export const DEFAULT_COMBAT_PROFILE_BY_TYPE = Object.freeze({
  ship: 'combat_profile_standard_ship',
  drone: 'combat_profile_standard_ship',
  payload: 'combat_profile_tether_payload',
  asteroid: 'combat_profile_tether_anchor',
  wreck: 'combat_profile_tether_anchor',
  pickup: 'combat_profile_tether_anchor',
  fieldEmitter: 'combat_profile_tether_anchor',
  masslineSnareAnchor: 'combat_profile_tether_anchor',
  station: 'combat_profile_standard_station',
});

// Spec2/02 §3 juice-stack: canonical cue ids per weapon family/size so VFX/audio can map
// player/NPC fire events to the right muzzle, projectile, and impact vocabulary.
export const WEAPON_CUE_TABLES = Object.freeze({
  kinetic_s: Object.freeze({ muzzle: 'vfx.muzzle.kinetic_s', projectile: 'vfx.proj.kinetic_s', impact: 'vfx.impact.kinetic_s', cueId: 'combat.damage.hull' }),
  kinetic_m: Object.freeze({ muzzle: 'vfx.muzzle.kinetic_m', projectile: 'vfx.proj.kinetic_m', impact: 'vfx.impact.kinetic_m', cueId: 'combat.damage.hull' }),
  kinetic_l: Object.freeze({ muzzle: 'vfx.muzzle.kinetic_l', projectile: 'vfx.proj.kinetic_l', impact: 'vfx.impact.kinetic_l', cueId: 'combat.damage.hull' }),
  energy_s: Object.freeze({ muzzle: 'vfx.muzzle.energy_s', projectile: 'vfx.proj.energy_s', impact: 'vfx.impact.energy_s', cueId: 'combat.damage.shield' }),
  energy_m: Object.freeze({ muzzle: 'vfx.muzzle.energy_m', projectile: 'vfx.proj.energy_m', impact: 'vfx.impact.energy_m', cueId: 'combat.damage.shield' }),
  energy_l: Object.freeze({ muzzle: 'vfx.muzzle.energy_l', projectile: 'vfx.proj.energy_l', impact: 'vfx.impact.energy_l', cueId: 'combat.damage.shield' }),
  explosive_m: Object.freeze({ muzzle: 'vfx.muzzle.explosive_m', projectile: 'vfx.proj.explosive_m', impact: 'vfx.impact.explosive_m', cueId: 'combat.damage.armor' }),
  missile: Object.freeze({ muzzle: 'vfx.muzzle.missile', projectile: 'vfx.proj.missile', impact: 'vfx.impact.missile', cueId: 'combat.damage.armor' }),
});

export function resolveWeaponCueTable(weaponId, weaponsArray = []) {
  const w = weaponsArray.find((x) => x.id === weaponId);
  if (!w) return WEAPON_CUE_TABLES.kinetic_m;
  const dt = (w.damageType || 'kinetic').toLowerCase();
  const size = (w.size || 'M').toLowerCase();
  if (dt === 'explosive' || dt === 'plasma') return WEAPON_CUE_TABLES.explosive_m;
  if (dt === 'missile' || dt === 'rocket' || dt === 'torpedo') return WEAPON_CUE_TABLES.missile;
  const key = `${dt}_${size}`;
  return WEAPON_CUE_TABLES[key] || WEAPON_CUE_TABLES.kinetic_m;
}
