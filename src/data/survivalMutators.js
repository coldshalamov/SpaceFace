// Crucible challenge mutators and trials (PQ-133.10a / CRU-057).
//
// Constraints and labels, never stat patches. A mutator either changes a rule the run
// already understands (Foundry shutter cadence via the planner's existing hook) or
// narrows what the player may choose (no drafts, one hull, one weapon, physics verbs).
//
// Pure frozen data. The run seed is not replaced; mutators are extra deterministic input.

function freezeDeep(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    for (const item of value) freezeDeep(item);
  } else {
    for (const key of Object.keys(value)) freezeDeep(value[key]);
  }
  return Object.freeze(value);
}

/** Mutator ids the wave planner already interprets. Unknown ids are recorded and ignored there. */
export const SURVIVAL_PLANNER_MUTATORS = Object.freeze(['shutter_alternating']);

export const SURVIVAL_PHYSICS_VERBS = Object.freeze(['Throw', 'Tag', 'Bind', 'Mine', 'Unsteer']);

export const SURVIVAL_MUTATOR_CATALOG = freezeDeep([
  {
    id: 'shutter_alternating',
    label: 'Alternating Shutters',
    blurb: 'The room runs the alternating shutter law for every wave the planner will honour.',
    skipDraft: false,
    skipReroll: false,
    hullLocked: false,
    weaponLock: null,
    physicsOnly: false,
    planner: true,
  },
  {
    id: 'draftless',
    label: 'Draftless',
    blurb: 'Mid-run weapon offers auto-resolve empty. The starting kit is the kit.',
    skipDraft: true,
    skipReroll: true,
    hullLocked: false,
    weaponLock: null,
    physicsOnly: false,
    planner: false,
  },
  {
    id: 'no_reroll',
    label: 'No Re-roll',
    blurb: 'The paid re-roll is refused. The first three cards stand.',
    skipDraft: false,
    skipReroll: true,
    hullLocked: false,
    weaponLock: null,
    physicsOnly: false,
    planner: false,
  },
  {
    id: 'physics_only',
    label: 'Physics Only',
    blurb: 'Drafts may only offer throw / tag / bind / mine / unsteer.',
    skipDraft: false,
    skipReroll: false,
    hullLocked: false,
    weaponLock: null,
    physicsOnly: true,
    planner: false,
  },
  {
    id: 'one_hull',
    label: 'One Hull',
    blurb: 'The launch hull is locked for the run.',
    skipDraft: false,
    skipReroll: false,
    hullLocked: true,
    weaponLock: null,
    physicsOnly: false,
    planner: false,
  },
  {
    id: 'one_weapon',
    label: 'One Weapon',
    blurb: 'No additional weapons are drafted. The launch gun is the gun.',
    skipDraft: true,
    skipReroll: true,
    hullLocked: false,
    weaponLock: 'starting',
    physicsOnly: false,
    planner: false,
  },
]);

export const SURVIVAL_MUTATOR_BY_ID = Object.freeze(Object.fromEntries(
  SURVIVAL_MUTATOR_CATALOG.map((row) => [row.id, row]),
));

export const SURVIVAL_TRIAL_CATALOG = freezeDeep([
  {
    id: 'trial_one_hull',
    ruleset: 'trial_one_hull',
    label: 'One-Hull Trial',
    blurb: 'Hitch in, Hitch out. The hull cannot be swapped.',
    impliedMutators: ['one_hull'],
    hullId: 'ship_kestrel',
    hullLocked: true,
    skipDraft: false,
    weaponLock: null,
  },
  {
    id: 'trial_one_weapon',
    ruleset: 'trial_one_weapon',
    label: 'One-Weapon Trial',
    blurb: 'The launch gun is the only gun. Drafts auto-resolve empty.',
    impliedMutators: ['one_weapon'],
    hullId: 'ship_kestrel',
    hullLocked: false,
    skipDraft: true,
    weaponLock: 'starting',
  },
]);

export const SURVIVAL_TRIAL_BY_ID = Object.freeze(Object.fromEntries(
  SURVIVAL_TRIAL_CATALOG.map((row) => [row.id, row]),
));

export const SURVIVAL_TRIAL_BY_RULESET = Object.freeze(Object.fromEntries(
  SURVIVAL_TRIAL_CATALOG.map((row) => [row.ruleset, row]),
));
