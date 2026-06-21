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
    budgets: { cameraTrauma: 0.08, particles: 24, voices: 1, uiPulses: 1 },
    tags: ['critical', 'tether', 'warning'],
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
    budgets: { particles: 40, voices: 1, uiPulses: 1 },
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
    budgets: { voices: 1, uiPulses: 1 },
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
    budgets: { voices: 1, uiPulses: 1 },
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

for (const [id, value] of Object.entries(PRESENTATION_RECIPES)) {
  Object.defineProperty(value, 'id', { value: id, enumerable: true });
  Object.freeze(value);
}
