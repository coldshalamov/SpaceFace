/**
 * The shared material vocabulary. These are presentation units, never damage/force tuning.
 * Order is stable: the first ten codes are the shipped ForceParticleFlow ABI.
 * Shape, transport, contact and cooling identify a material; colour is only a redundant cue.
 */
const recipe = (id, family, transport, curl, response, cooling, contact, rgb) => Object.freeze({
  id, family, transport, curl, response, cooling, contact, rgb: Object.freeze(rgb),
});
export const MATERIAL_FLOW_RECIPES = Object.freeze([
  recipe('well', 'metric', 'sink', .72, 8, 1.35, 'slide', [.38, .52, 1.4]),
  recipe('repulsor', 'metric', 'pressure', .09, 4, 1.8, 'slide', [1.4, .38, .10]),
  recipe('cone', 'metric', 'jet', .13, 9, 1.45, 'slide', [.30, .90, 1.35]),
  recipe('skim', 'metric', 'intake', .22, 7, 1.3, 'slide', [.18, 1.20, .88]),
  recipe('seed', 'metric', 'lock', .065, 14, 1.65, 'slide', [.65, .40, 1.25]),
  recipe('heat', 'thermal', 'eject', .58, 2.8, 1.9, 'rebound', [1.55, .52, .08]),
  recipe('current', 'induction', 'branch', .52, 19, 2.25, 'slide', [.42, .80, 1.50]),
  recipe('repair', 'service', 'converge', .035, 12, 1.4, 'adhere', [.28, 1.35, .72]),
  recipe('transfer', 'service', 'conduit', .06, 11, 1.4, 'slide', [.72, .48, 1.40]),
  recipe('goo', 'reactive', 'creep', .10, 4.5, 1.5, 'adhere', [.38, .74, .12]),
  recipe('kinetic', 'kinetic', 'ballistic', .015, 1.4, 2.5, 'rebound', [1.6, .83, .25]),
  recipe('shield', 'shield', 'pressure', .055, 7, 2.1, 'slide', [.35, 1.15, 1.5]),
  recipe('coherent', 'coherent', 'conduit', .018, 16, 2.1, 'slide', [.55, 1.2, 1.6]),
  recipe('propulsion', 'propulsion', 'jet', .34, 6, 1.5, 'slide', [.36, .8, 1.55]),
  recipe('mineral', 'kinetic', 'ballistic', .025, 1.8, 1.7, 'rebound', [1.2, .92, .48]),
  recipe('pickup', 'service', 'converge', .10, 8, 1.25, 'slide', [.7, 1.4, .8]),
]);
export const MATERIAL_FLOW_KINDS = Object.freeze(MATERIAL_FLOW_RECIPES.map(r => r.id));
export function materialFlowRecipe(kind) {
  const index = typeof kind === 'number' ? kind : MATERIAL_FLOW_KINDS.indexOf(kind);
  return MATERIAL_FLOW_RECIPES[index] || null;
}

/** Complete top-level review map, not a claim that unlike effects use the same primitive. */
export const LIVING_VFX_FAMILIES = Object.freeze({
  metric: Object.freeze({ verb: 'constrain / draw / repel / channel', owners: ['fieldForcePresentation', 'bombPresentation', 'gyreSnarePresentation'], keep: 'truthful boundary; empty-space motion; independent release' }),
  kinetic: Object.freeze({ verb: 'hit / fracture / ricochet', owners: ['particleShards', 'quarksSystem', 'arcadeStructuralFx', 'explosionRupture'], keep: 'signed contact axis; lit solid fragments; no magic orbit' }),
  thermal: Object.freeze({ verb: 'ignite / vent / rupture', owners: ['quarksSystem', 'energyMaterials', 'explosionRupture', 'gasVolumeField'], keep: 'hot front, dark cavity, cooling transport; no shrinking fireball' }),
  coherent: Object.freeze({ verb: 'collimate / cut / drill', owners: ['weaponDischargePool', 'energyBoltPool', 'persistentBeams', 'toolConduit'], keep: 'source, axis, actual endpoint; no radial burst substituting for a beam' }),
  propulsion: Object.freeze({ verb: 'accelerate / brake / coast', owners: ['plasmaStream', 'continuousPlume', 'rcsImpulse', 'familyFleet', 'engineTrailSurfaces'], keep: 'nozzle-local force; long world-space history; never warp the recorded path' }),
  induction: Object.freeze({ verb: 'bridge / branch / interrupt', owners: ['emergentPrimitivePools', 'bombDetonationVfx', 'combatContactVfx'], keep: 'real contacts and sequential junctions, not a recoloured Well' }),
  reactive: Object.freeze({ verb: 'adhere / spread / consume', owners: ['statusMatterVfx', 'bombFlowSurface', 'bombPresentation'], keep: 'connected material, local reaction, residue; no invented blast' }),
  shield: Object.freeze({ verb: 'load / propagate / fracture / recover', owners: ['shieldShell', 'shieldContacts', 'shieldBubblePresentation'], keep: 'surface-local stress; readable ship; no permanent flashing bubble' }),
  service: Object.freeze({ verb: 'collect / repair / transfer / dock', owners: ['actionVfx', 'stationOperationVfx', 'pickupMotionPresentation'], keep: 'real body/socket anchors; direction; clean completion' }),
  massline: Object.freeze({ verb: 'latch / tension / carry / release', owners: ['energyMaterials', 'tetherWebFx', 'bolusCable'], keep: 'both endpoints and retained momentum; no burst on clean release' }),
});
