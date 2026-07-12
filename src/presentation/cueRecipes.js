// SG-08 presentation recipes for semantic slice events.
// This is headless data: renderer, VFX, UI, audio, and accessibility adapters consume these lanes later.

export const PRESENTATION_RECIPE_VERSION = 1;

export const PRESENTATION_LANES = Object.freeze([
  'camera',
  'vfx',
  'audio',
  'ui',
  'accessibility',
]);

export const PRESENTATION_RECIPES = Object.freeze({
  'travel.cruise.charging': travelRecipe(0.5, 30, 'cruise', 'vfx.direct_cruise_existing', ['travel', 'cruise', 'charging']),
  'travel.cruise.engaged': travelRecipe(0.64, 30, 'cruise', 'vfx.direct_cruise_existing', ['travel', 'cruise', 'engaged']),
  'travel.cruise.cancelled': travelRecipe(0.38, 12, 'cruise', 'vfx.direct_cruise_existing', ['travel', 'cruise', 'cancelled']),
  'travel.cruise.interrupted': travelRecipe(0.76, 12, 'cruise', 'vfx.direct_cruise_existing', ['travel', 'cruise', 'interrupted']),
  'travel.gate.approach': travelRecipe(0.52, 60, 'gate', 'vfx.direct_travel_gate', ['travel', 'approach', 'gate']),
  'travel.corridor.continuity': travelRecipe(0.44, 30, 'corridor', 'vfx.direct_travel_corridor', ['travel', 'continuity', 'corridor']),
  'travel.jump.aligning': travelRecipe(0.56, 30, 'jump_drive', 'vfx.direct_travel_alignment', ['travel', 'alignment']),
  'travel.jump.commit_window': travelRecipe(0.7, 60, 'jump_drive', 'vfx.direct_travel_commit', ['travel', 'commit', 'anticipation']),
  'travel.jump.committed': travelRecipe(0.82, 60, 'jump_drive', 'vfx.direct_travel_commit', ['travel', 'commit', 'no_return']),
  'travel.transition.continuity': travelRecipe(0.68, 60, 'jump_drive', 'vfx.direct_travel_transition', ['travel', 'continuity', 'transition']),
  'travel.arrival.oriented': travelRecipe(0.72, 30, 'arrival', 'vfx.direct_travel_arrival', ['travel', 'arrival', 'oriented']),
  'travel.arrival.sector_identity': travelRecipe(0.58, 30, 'sector', 'vfx.direct_travel_identity', ['travel', 'arrival', 'sector_identity']),
  'travel.discovery.mapped': travelRecipe(0.62, 30, 'discovery', 'vfx.direct_travel_discovery', ['travel', 'discovery', 'mapped']),
  'travel.interdiction.triggered': travelRecipe(0.92, 30, 'interdiction', 'vfx.direct_travel_interdiction', ['travel', 'disruption', 'interdiction']),
  'travel.jump.failed': travelRecipe(0.7, 20, 'jump_drive', 'vfx.direct_travel_failure', ['travel', 'disruption', 'failure']),
  'travel.recovery.resumed': travelRecipe(0.48, 30, 'travel_recovery', 'vfx.direct_travel_recovery', ['travel', 'recovery', 'resumed']),
  'travel.aftermath.clear': travelRecipe(0.46, 30, 'arrival', 'vfx.direct_travel_aftermath', ['travel', 'aftermath', 'clear']),
  'travel.aftermath.contested': travelRecipe(0.84, 30, 'arrival', 'vfx.direct_travel_aftermath', ['travel', 'aftermath', 'contested']),
  'mining.survey.pulse': miningRecipe(0.52, 30, 'survey', 'vfx.direct_mining_survey', ['mining', 'survey', 'pulse']),
  'mining.survey.resolved': miningRecipe(0.58, 30, 'survey', 'vfx.direct_mining_survey', ['mining', 'survey', 'resolved']),
  'mining.survey.classified': miningRecipe(0.62, 30, 'survey', 'vfx.direct_mining_survey', ['mining', 'survey', 'classified']),
  'mining.survey.tracked': miningRecipe(0.54, 20, 'survey', 'vfx.direct_mining_survey', ['mining', 'survey', 'tracked']),
  'mining.survey.investigated': miningRecipe(0.7, 30, 'survey', 'vfx.direct_mining_survey', ['mining', 'survey', 'investigated']),
  'mining.extraction.locked': miningRecipe(0.5, 1, 'mining_beam', 'vfx.direct_mining_beam', ['mining', 'extraction', 'locked']),
  'mining.seam.quality': miningRecipe(0.64, 1, 'seam', 'vfx.direct_mining_seam', ['mining', 'seam']),
  'mining.seam.reward': miningRecipe(0.64, 30, 'seam', 'vfx.direct_mining_seam', ['mining', 'seam', 'reward']),
  'mining.fracture.anticipation': miningRecipe(0.72, 60, 'asteroid', 'vfx.direct_mining_fracture', ['mining', 'fracture', 'anticipation']),
  'mining.fracture.released': miningRecipe(0.78, 4, 'asteroid', 'vfx.direct_mining_fracture', ['mining', 'fracture', 'released']),
  'mining.rich_core.exposed': miningRecipe(0.86, 30, 'rich_core', 'vfx.direct_mining_core', ['mining', 'rich_core', 'exposed']),
  'mining.rich_core.charge': miningRecipe(0.7, 30, 'rich_core', 'vfx.direct_mining_core', ['mining', 'rich_core', 'charge']),
  'mining.rich_core.completed': miningRecipe(0.92, 30, 'rich_core', 'vfx.direct_mining_core', ['mining', 'rich_core', 'completed']),
  'mining.rich_core.fizzle': miningRecipe(0.62, 30, 'rich_core', 'vfx.direct_mining_core', ['mining', 'rich_core', 'fizzle']),
  'mining.chunk.tether_required': miningRecipe(0.74, 30, 'bulk_chunk', 'vfx.direct_mining_chunk', ['mining', 'chunk', 'tether_required']),
  'mining.chunk.mass_engaged': miningRecipe(0.7, 30, 'bulk_chunk', 'vfx.direct_tether_attach', ['mining', 'chunk', 'mass_engaged']),
  'mining.cargo.mass_settled': miningRecipe(0.48, 30, 'cargo', 'vfx.direct_cargo_mass', ['mining', 'cargo', 'mass']),
  'mining.cargo.full': miningRecipe(0.82, 30, 'cargo', 'vfx.direct_cargo_full', ['mining', 'cargo', 'full']),
  'mining.field.aftermath': miningRecipe(0.58, 30, 'field', 'vfx.direct_field_memory', ['mining', 'field', 'aftermath']),
  'mining.heat.overheated': miningRecipe(0.8, 60, 'drill_heat', 'vfx.direct_drill_ui', ['mining', 'drill', 'heat', 'overheated']),
  'mining.vent.ready': miningRecipe(0.66, 60, 'drill_heat', 'vfx.direct_drill_ui', ['mining', 'drill', 'vent', 'ready']),
  'mining.yield.collected': miningRecipe(0.58, 8, 'ore', 'vfx.direct_mining_yield', ['mining', 'yield', 'collected']),
  'mining.drill.seismic_pulse': miningRecipe(0.54, 20, 'drill_scan', 'vfx.direct_drill_ui', ['mining', 'drill', 'seismic', 'pulse']),
  'mining.drill.contact': miningRecipe(0.46, 12, 'drill_contact', 'vfx.direct_drill_ui', ['mining', 'drill', 'contact']),
  'mining.drill.break': miningRecipe(0.58, 4, 'drill_break', 'vfx.direct_drill_ui', ['mining', 'drill', 'break']),
  'mining.drill.yield': miningRecipe(0.66, 8, 'drill_yield', 'vfx.direct_drill_ui', ['mining', 'drill', 'yield']),
  'mining.drill.gas_hazard': miningRecipe(0.92, 30, 'drill_hazard', 'vfx.direct_drill_ui', ['mining', 'drill', 'gas', 'hazard']),
  'mining.drill.aborted': miningRecipe(0.48, 20, 'drill_abort', 'vfx.direct_drill_ui', ['mining', 'drill', 'aborted']),
  'mining.drill.retry': miningRecipe(0.52, 20, 'drill_retry', 'vfx.direct_drill_ui', ['mining', 'drill', 'retry']),
  'combat.doctrine.setup': recipe({
    importance: 0.56,
    dedupeWindowTicks: 30,
    material: 'doctrine',
    lanes: { ...laneSet('vfx.direct_ai_telegraph'), audio: 'audio.combat_doctrine' },
    budgets: { voices: 1 },
    tags: ['combat', 'doctrine', 'setup'],
  }),
  'combat.doctrine.telegraph': recipe({
    importance: 0.76,
    dedupeWindowTicks: 30,
    material: 'doctrine',
    lanes: { ...laneSet('vfx.direct_ai_telegraph'), audio: 'audio.combat_doctrine' },
    budgets: { voices: 0 },
    tags: ['combat', 'doctrine', 'telegraph'],
  }),
  'combat.doctrine.action': recipe({
    importance: 0.72,
    dedupeWindowTicks: 1,
    material: 'doctrine',
    lanes: { ...laneSet('vfx.direct_combat_fire'), audio: 'audio.combat_doctrine' },
    budgets: { voices: 0 },
    tags: ['combat', 'doctrine', 'action'],
  }),
  'combat.doctrine.aftermath': recipe({
    importance: 0.68,
    dedupeWindowTicks: 1,
    material: 'doctrine',
    lanes: { ...laneSet('vfx.direct_combat_aftermath'), audio: 'audio.combat_doctrine' },
    budgets: { voices: 0 },
    tags: ['combat', 'doctrine', 'aftermath'],
  }),
  'combat.doctrine.break': recipe({
    importance: 0.7,
    dedupeWindowTicks: 12,
    material: 'doctrine',
    lanes: { ...laneSet('vfx.direct_ai_telegraph'), audio: 'audio.combat_doctrine' },
    budgets: { voices: 1 },
    tags: ['combat', 'doctrine', 'break'],
  }),
  'combat.doctrine.withdraw': recipe({
    importance: 0.58,
    dedupeWindowTicks: 20,
    material: 'doctrine',
    lanes: { ...laneSet('vfx.direct_ai_telegraph'), audio: 'audio.combat_doctrine' },
    budgets: { voices: 1 },
    tags: ['combat', 'doctrine', 'withdraw'],
  }),
  'combat.damage.applied': recipe({
    importance: 0.66,
    dedupeWindowTicks: 0,
    material: 'damage',
    lanes: { ...laneSet('vfx.direct_combat_damage'), audio: 'audio.combat_aftermath' },
    // combat:damage already owns the physical shield/armor/hull voice.
    budgets: { voices: 0 },
    tags: ['combat', 'damage'],
  }),
  'combat.near_miss': recipe({
    importance: 0.7,
    dedupeWindowTicks: 12,
    material: 'projectile',
    lanes: { ...laneSet('vfx.combat_near_miss'), audio: 'audio.combat_aftermath' },
    budgets: { particles: 12, voices: 1 },
    tags: ['combat', 'near_miss'],
  }),
  'combat.player.hit': recipe({
    importance: 0.78,
    dedupeWindowTicks: 4,
    material: 'damage',
    lanes: { ...laneSet('vfx.direct_player_damage'), audio: 'audio.combat_aftermath' },
    // The raw damage owner also supplies the ship-local directional urgency voice.
    budgets: { voices: 0 },
    tags: ['combat', 'player', 'damage'],
  }),
  'combat.player.kill': recipe({
    importance: 0.86,
    dedupeWindowTicks: 4,
    material: 'kill',
    lanes: { ...laneSet('vfx.direct_entity_killed', 'ui.combat_kill', 'accessibility.combat_kill'), audio: 'audio.combat_aftermath' },
    // entity:killed owns the explosion; this receipt owns UI/accessibility confirmation only.
    budgets: { voices: 0, uiPulses: 1 },
    tags: ['combat', 'player', 'kill'],
  }),
  'tether.attach': recipe({
    importance: 0.78,
    dedupeWindowTicks: 6,
    material: 'massline',
    lanes: {
      camera: 'camera.payload_composition',
      vfx: 'vfx.tether_snap',
      audio: 'audio.tether_snap',
      ui: 'ui.tension_arc',
      accessibility: 'accessibility.tension_alt',
    },
    budgets: { cameraTrauma: 0.12, particles: 48, voices: 2, uiPulses: 1 },
    tags: ['critical', 'tether', 'slice'],
  }),
  'tether.near_break': recipe({
    importance: 0.72,
    dedupeWindowTicks: 12,
    material: 'massline',
    lanes: {
      camera: 'camera.tether_strain',
      vfx: 'vfx.tether_strain',
      audio: 'audio.tether_strain',
      ui: 'ui.tension_warning',
      accessibility: 'accessibility.tension_alt',
    },
    budgets: { cameraTrauma: 0.08, particles: 24, voices: 2, uiPulses: 1 },
    tags: ['critical', 'tether', 'warning'],
  }),
  // Rung 10 — massline threat feedback (consumes masslineThreats' rung-09 massline:threat emit).
  // One recipe for all three threat kinds (line-near-break / hostile-on-arc / collision-course);
  // severity rides the cue magnitude so the audio sting + HUD warn scale, and the kind rides the
  // tags. HUD read stays clean non-diegetic (a plain warn pulse — no visor/cockpit motifs).
  'massline.threat': recipe({
    importance: 0.74,
    dedupeWindowTicks: 12,
    material: 'massline',
    lanes: {
      camera: 'camera.threat_composition',
      vfx: 'vfx.massline_threat',
      audio: 'audio.massline_threat',
      ui: 'ui.threat_warning',
      accessibility: 'accessibility.directional_warning',
    },
    budgets: { cameraTrauma: 0.06, particles: 20, voices: 2, uiPulses: 1 },
    tags: ['critical', 'tether', 'threat'],
  }),
  'tether.break': recipe({
    importance: 0.92,
    dedupeWindowTicks: 10,
    material: 'massline',
    lanes: {
      camera: 'camera.tether_snap',
      vfx: 'vfx.tether_break',
      audio: 'audio.tether_break',
      ui: 'ui.tether_break',
      accessibility: 'accessibility.break_caption',
    },
    budgets: { cameraTrauma: 0.22, particles: 96, voices: 3, uiPulses: 1 },
    tags: ['critical', 'tether', 'break'],
  }),
  // Rung 14 — whip-impact feedback (consumes masslineImpacts' rung-13 tether:whipImpact emit).
  // The payoff crack: the whipped mass slamming a body. Severity rides the cue magnitude so the
  // flash/sting scale with the hit; rating + latched/slung ride the tags. Feedback is the point —
  // the optional damage half lives in combat.js behind the whipDamage combat flag.
  'tether.whip_impact': recipe({
    importance: 0.8,
    dedupeWindowTicks: 10,
    material: 'massline',
    lanes: {
      camera: 'camera.whip_impact',
      vfx: 'vfx.whip_impact',
      audio: 'audio.whip_impact',
      ui: 'ui.whip_impact',
      accessibility: 'accessibility.impact_caption',
    },
    budgets: { cameraTrauma: 0.14, particles: 64, lights: 1, voices: 2, uiPulses: 1 },
    tags: ['critical', 'tether', 'impact'],
  }),
  // Prompt 03 — release-rated feedback. Classification tiers map to escalating cues; "messy"
  // has no recipe on purpose so the orchestrator suppresses it (missing_recipe) and emits no
  // presentation:cue, leaving messy releases with no premium feedback. Camera trauma lives on the
  // reduced-motion-safe presentation:cameraCue path (presentationAdapters dampens it under
  // motionReduce), so these stay accessibility-safe even at the razor tier.
  'tether.release.good': recipe({
    importance: 0.5,
    dedupeWindowTicks: 6,
    material: 'massline',
    lanes: {
      camera: 'camera.tether_release',
      vfx: 'vfx.tether_release',
      audio: 'audio.tether_release',
      ui: 'ui.tether_release',
      accessibility: 'accessibility.release_caption',
    },
    budgets: { cameraTrauma: 0.04, particles: 12, voices: 1, uiPulses: 1 },
    tags: ['tether', 'release', 'good'],
  }),
  'tether.release.clean': recipe({
    importance: 0.72,
    dedupeWindowTicks: 6,
    material: 'massline',
    lanes: {
      camera: 'camera.tether_release',
      vfx: 'vfx.tether_release',
      audio: 'audio.tether_release',
      ui: 'ui.tether_release',
      accessibility: 'accessibility.release_caption',
    },
    budgets: { cameraTrauma: 0.09, particles: 28, voices: 1, uiPulses: 1 },
    tags: ['tether', 'release', 'clean'],
  }),
  'tether.release.razor': recipe({
    importance: 0.9,
    dedupeWindowTicks: 6,
    material: 'massline',
    lanes: {
      camera: 'camera.tether_release',
      vfx: 'vfx.tether_release',
      audio: 'audio.tether_release',
      ui: 'ui.tether_release',
      accessibility: 'accessibility.release_caption',
    },
    budgets: { cameraTrauma: 0.16, particles: 56, voices: 2, uiPulses: 1 },
    tags: ['tether', 'release', 'razor'],
  }),
  'shield.collapse': recipe({
    importance: 0.84,
    dedupeWindowTicks: 8,
    material: 'shield',
    lanes: {
      camera: 'camera.threat_composition',
      vfx: 'vfx.shield_collapse',
      audio: 'audio.shield_collapse',
      ui: 'ui.shield_down',
      accessibility: 'accessibility.directional_warning',
    },
    budgets: { cameraTrauma: 0.16, particles: 80, voices: 2, lights: 1, uiPulses: 1 },
    tags: ['critical', 'combat', 'shield'],
  }),
  'subsystem.disabled': recipe({
    importance: 0.86,
    dedupeWindowTicks: 4,
    material: 'subsystem',
    lanes: {
      camera: 'camera.subsystem_focus',
      vfx: 'vfx.subsystem_sparks',
      audio: 'audio.subsystem_disabled',
      ui: 'ui.subsystem_brackets',
      accessibility: 'accessibility.subsystem_caption',
    },
    budgets: { cameraTrauma: 0.1, particles: 56, voices: 2, uiPulses: 1 },
    tags: ['critical', 'combat', 'subsystem'],
  }),
  'scenario.signal.pulse': recipe({
    importance: 0.68,
    dedupeWindowTicks: 30,
    material: 'signal',
    lanes: {
      camera: 'camera.threat_composition',
      vfx: 'vfx.signal_pulse',
      audio: 'audio.signal_pulse',
      ui: 'ui.spatial_objective',
      accessibility: 'accessibility.shape_coded_signal',
    },
    budgets: { particles: 40, voices: 2, uiPulses: 1 },
    tags: ['scenario', 'objective', 'slice'],
  }),
  'scenario.comms.kessler': recipe({
    importance: 0.74,
    dedupeWindowTicks: 60,
    material: 'comms',
    lanes: {
      camera: 'camera.payload_composition',
      vfx: 'vfx.comms_static',
      audio: 'audio.ducked_comms',
      ui: 'ui.comms_priority',
      accessibility: 'accessibility.caption_priority',
    },
    budgets: { voices: 2, uiPulses: 1 },
    tags: ['scenario', 'comms', 'kessler'],
  }),
  'scenario.comms.denial': recipe({
    importance: 0.8,
    dedupeWindowTicks: 60,
    material: 'comms',
    lanes: {
      camera: 'camera.tug_of_war',
      vfx: 'vfx.comms_static',
      audio: 'audio.ducked_comms',
      ui: 'ui.comms_priority',
      accessibility: 'accessibility.caption_priority',
    },
    budgets: { voices: 2, uiPulses: 1 },
    tags: ['scenario', 'comms', 'denial'],
  }),
  'scenario.objective.priority_split': recipe({
    importance: 0.82,
    dedupeWindowTicks: 30,
    material: 'objective',
    lanes: {
      camera: 'camera.priority_split',
      vfx: 'vfx.pod_beacon',
      audio: 'audio.distress_call',
      ui: 'ui.dual_objective',
      accessibility: 'accessibility.objective_shapes',
    },
    budgets: { particles: 36, voices: 2, uiPulses: 2 },
    tags: ['scenario', 'objective', 'civilian'],
  }),
  'scenario.branch.resolved': recipe({
    importance: 0.88,
    dedupeWindowTicks: 30,
    material: 'branch',
    lanes: {
      camera: 'camera.exit_composition',
      vfx: 'vfx.branch_signal',
      audio: 'audio.aftermath_state',
      ui: 'ui.aftermath_summary',
      accessibility: 'accessibility.branch_caption',
    },
    budgets: { particles: 52, voices: 2, uiPulses: 2 },
    tags: ['scenario', 'branch', 'aftermath'],
  }),
});

export function getPresentationRecipe(id) {
  return PRESENTATION_RECIPES[id] || null;
}

export function validatePresentationRecipes(recipes = PRESENTATION_RECIPES) {
  const issues = [];
  const ids = Object.keys(recipes || {}).sort();
  for (const id of ids) {
    const item = recipes[id];
    const path = `$.${id}`;
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      issues.push(`${path} must be an object`);
      continue;
    }
    if (item.id !== id) issues.push(`${path}.id must match the recipe key`);
    if (item.version !== PRESENTATION_RECIPE_VERSION) issues.push(`${path}.version must be ${PRESENTATION_RECIPE_VERSION}`);
    if (!Number.isFinite(item.importance) || item.importance < 0 || item.importance > 1) {
      issues.push(`${path}.importance must be in [0,1]`);
    }
    if (!Number.isSafeInteger(item.dedupeWindowTicks) || item.dedupeWindowTicks < 0) {
      issues.push(`${path}.dedupeWindowTicks must be a non-negative safe integer`);
    }
    for (const lane of PRESENTATION_LANES) {
      if (!item.lanes || typeof item.lanes[lane] !== 'string' || !item.lanes[lane]) {
        issues.push(`${path}.lanes.${lane} is required`);
      }
    }
    if (!item.budgets || typeof item.budgets !== 'object' || Array.isArray(item.budgets)) {
      issues.push(`${path}.budgets must be an object`);
    }
  }
  return { ok: issues.length === 0, issues };
}

function recipe({ importance, dedupeWindowTicks, material, lanes, budgets, tags }) {
  return {
    version: PRESENTATION_RECIPE_VERSION,
    id: null,
    importance,
    dedupeWindowTicks,
    material,
    lanes: Object.freeze({ ...lanes }),
    budgets: Object.freeze({ ...budgets }),
    tags: Object.freeze([...(tags || [])]),
  };
}

function laneSet(vfx, ui = 'ui.none', accessibility = 'accessibility.none') {
  return {
    camera: 'camera.none',
    vfx,
    audio: 'audio.none',
    ui,
    accessibility,
  };
}

function miningRecipe(importance, dedupeWindowTicks, material, vfx, tags) {
  return recipe({
    importance,
    dedupeWindowTicks,
    material,
    lanes: { ...laneSet(vfx), audio: 'audio.mining' },
    budgets: { voices: 1 },
    tags,
  });
}

function travelRecipe(importance, dedupeWindowTicks, material, vfx, tags) {
  return recipe({
    importance,
    dedupeWindowTicks,
    material,
    lanes: { ...laneSet(vfx), audio: 'audio.travel' },
    // One semantic journey cue owns the audible floor for each source event. Layered synth
    // recipes still count as one scheduled voice and remain beneath the global SG-08 cap.
    budgets: { voices: 1 },
    tags,
  });
}

for (const [id, value] of Object.entries(PRESENTATION_RECIPES)) {
  Object.defineProperty(value, 'id', { value: id, enumerable: true });
  Object.freeze(value);
}
