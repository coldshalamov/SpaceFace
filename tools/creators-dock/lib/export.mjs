// Translate a dock project into a lab scenario and a user-content pack.
// Unknown gameplay fields become errors. They are not stripped.

import {
  formatSimScenarioIssue,
  SIM_SCENARIO_SCHEMA,
  validateSimScenario,
} from '../../../src/contracts/simScenarioSchema.js';
import { validateEncounterShape } from '../../../src/data/encounters/shape.js';
import { resolveEntityProfile } from '../../../src/testing/lab/entityProfiles.js';
import { loadDialect } from './dialect.mjs';
import {
  ENCOUNTER_DECKS,
  ENCOUNTER_TIERS,
  FRAME_INPUT_KEYS,
  KNOWN_LAB_SIGNALS,
  MODULE_SLOT_TYPES,
  OVERRIDE_APPLIED,
  TETHER_DEF_ID,
} from './mirrors.mjs';
import { clone, emptyProject, playerCanonIssues, projectIssues, PROJECT_SCHEMA, round6 } from './scene.mjs';
import { assertProjectSize, inspectValue } from './security.mjs';
import { stableStringify } from './stableJson.mjs';

const PROJECT_KEYS = new Set([
  'schema', 'id', 'title', 'description', 'composition', 'seed', 'ticks', 'version',
  'evidenceClass', 'runtimeProfile', 'standardInvariants', 'world', 'grid', 'camera',
  'objects', 'frames', 'inputEvents', 'notes', 'fixtureExceptions', 'observer',
  'traceSignals', 'dt', 'systems', 'policies', 'checkpoints', 'parameterOverlay',
  'saveLoadEquivalence', 'encounter', 'weapon', 'place', 'module', 'mod', 'sampleEvery',
]);

const FRAME_KEYS = new Set(FRAME_INPUT_KEYS);
const SIGNAL_SET = new Set(KNOWN_LAB_SIGNALS);
const INVARIANT_NAMES = ['invariant.finiteState', 'invariant.noNegativeResources'];

const MOD_ID_RE = /^[a-z0-9][a-z0-9._-]{0,79}$/i;
const ENCOUNTER_ID_RE = /^[a-z][a-z0-9_]{1,79}$/;
const WEAPON_ID_RE = /^(wpn|unique)_[a-z0-9_]+$/;
const MODULE_ID_RE = /^(mod|unique)_[a-z0-9_]+$/;
const PLACE_ID_RE = /^zone_[a-z0-9_]+$/;

export async function exportProject(project) {
  const dialect = await loadDialect();
  return exportProjectWithDialect(project, dialect);
}

function plainProjectId(id, issues) {
  if (typeof id === 'string') return id;
  try {
    const text = JSON.stringify(id);
    const parsed = typeof text === 'string' ? JSON.parse(text) : undefined;
    if (typeof parsed === 'string') return parsed;
  } catch (error) {
    issues.push('scene could not be cloned');
    return '';
  }
  issues.push('project id must match the lab id pattern');
  return '';
}

export function exportProjectWithDialect(project, dialect) {
  const issues = [];
  const projectId = plainProjectId(project && project.id, issues);
  issues.push(...inspectValue(project));
  issues.push(...assertProjectSize(project));
  issues.push(...closedProjectKeys(project));
  issues.push(...projectIssues(project));
  if (!dialect) issues.push('dialect is required');

  const objects = Array.isArray(project && project.objects) ? project.objects : [];
  const actors = objects.filter((object) => object && object.kind === 'actor');
  const triggers = objects.filter((object) => object && object.kind === 'trigger');
  const objectives = objects.filter((object) => object && object.kind === 'objective');
  const fields = objects.filter((object) => object && object.kind === 'field');
  const routes = objects.filter((object) => object && object.kind === 'route');
  const attachments = objects.filter((object) => object && object.kind === 'attachment');

  const manifest = {
    schema: 'spaceface.creatorsDockExport.v1',
    projectId,
    withheldFromUserContent: [],
    editorOnly: [],
    written: {},
    labOnly: [],
  };

  for (const actor of actors) {
    manifest.withheldFromUserContent.push({
      path: `objects.${actor.id}.pose`,
      reason: 'XZ pose, heading, and initial velocity export on the lab entity. Encounter records have no pose.',
      labOnly: true,
    });
    manifest.labOnly.push(`objects.${actor.id}.vel`);
  }
  for (const trigger of triggers) {
    if (trigger.labOnly !== true) {
      issues.push(`${trigger.id}: trigger geometry is lab-only; set labOnly true so the withhold is explicit`);
    }
    manifest.withheldFromUserContent.push({
      path: `objects.${trigger.id}`,
      reason: 'Temporal assertions export on the lab scenario. User-content encounters cannot carry trigger geometry.',
      labOnly: true,
    });
    manifest.labOnly.push(`objects.${trigger.id}`);
  }
  for (const objective of objectives) {
    if (objective.labOnly !== true) {
      issues.push(`${objective.id}: objective metrics are lab-only; set labOnly true so the withhold is explicit`);
    }
    manifest.withheldFromUserContent.push({
      path: `objects.${objective.id}`,
      reason: 'Metric oracles export on the lab scenario. User-content encounters have no metric block.',
      labOnly: true,
    });
    manifest.labOnly.push(`objects.${objective.id}`);
  }
  for (const route of routes) {
    if (route.gameplay === true) {
      issues.push(`${route.id}: interaction routes are not lab relations. The runner rejects relations. Refusing to drop a gameplay route.`);
    } else if (route.gameplay !== false) {
      issues.push(`${route.id}: set gameplay true or false. A route is not dropped silently.`);
    } else {
      manifest.editorOnly.push({
        path: `objects.${route.id}`,
        reason: 'Route is an authoring guide. Lab relations are unsupported, so it is not written.',
      });
    }
  }
  for (const link of attachments) {
    manifest.withheldFromUserContent.push({
      path: `objects.${link.id}`,
      reason: 'Tether attachments export on the lab scenario only.',
      labOnly: true,
    });
    manifest.labOnly.push(`objects.${link.id}`);
  }
  for (const field of fields) explainField(field, issues, manifest);
  if ((project && Object.prototype.hasOwnProperty.call(project, 'grid'))
    || (project && Object.prototype.hasOwnProperty.call(project, 'camera'))) {
    manifest.editorOnly.push({
      path: 'grid',
      reason: 'Grid, snap, and camera are editor state.',
    });
  }
  const grouped = objects.filter((object) => object && object.groupId);
  if (grouped.length) {
    manifest.editorOnly.push({
      path: 'groupId',
      reason: `Groups (${[...new Set(grouped.map((object) => object.groupId))].join(', ')}) are editor-only.`,
    });
  }

  const scenario = buildScenario(project, actors, triggers, objectives, attachments, issues, projectId);
  if (scenario) {
    const validation = validateSimScenario(scenario);
    if (!validation.ok) {
      for (const issue of validation.issues) issues.push(formatSimScenarioIssue(issue));
    }
  }

  const pack = buildPack(project, fields, dialect, issues, manifest);
  const ok = issues.length === 0 && !!scenario;
  if (ok) {
    manifest.written.scenario = 'scenario.json';
    if (pack) {
      for (const file of Object.keys(pack.files)) manifest.written[file] = file;
    }
  }
  return { ok, issues, scenario: scenario || null, pack: ok ? pack : null, manifest };
}

function closedProjectKeys(project) {
  if (!project || typeof project !== 'object') return ['project must be an object'];
  const issues = [];
  for (const key of Object.keys(project)) {
    if (!PROJECT_KEYS.has(key)) {
      issues.push(`unknown project field "${key}"`);
    }
  }
  return issues;
}

function explainField(field, issues, manifest) {
  if (field.force != null || field.fieldKind === 'force') {
    issues.push(`${field.id}: the lab schema has no force-field object. Refusing to drop a gameplay-critical field.`);
    return;
  }
  if (field.fieldKind === 'place') {
    if (field.gameplay === false) {
      issues.push(`${field.id}: a place field is a user-content export. gameplay false would hide it.`);
    }
    manifest.written.place = 'places/(place id).json';
    manifest.withheldFromUserContent.push({
      path: `objects.${field.id}.force`,
      reason: 'This disc exports as a place record. It is not a simulated force.',
      labOnly: false,
    });
    return;
  }
  if (field.fieldKind === 'annotation') {
    if (field.gameplay === true) {
      issues.push(`${field.id}: annotation is not a runtime field. Refusing to drop a gameplay-critical annotation.`);
      return;
    }
    manifest.editorOnly.push({
      path: `objects.${field.id}`,
      reason: field.note || 'Annotation is not written to the lab scenario or the user pack.',
    });
    return;
  }
  issues.push(`${field.id}: unknown fieldKind "${field.fieldKind}"`);
}

function finiteMeasure(value, issues, label) {
  if (value === null) {
    issues.push(`${label} must be a finite number`);
    return null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return round6(value);
  if (value === undefined) return 0;
  issues.push(`${label} must be a finite number`);
  return null;
}

function buildScenario(project, actors, triggers, objectives, attachments, issues, projectId) {
  if (!project || project.schema !== PROJECT_SCHEMA) return null;
  const entities = [];
  for (const actor of actors) {
    if (typeof actor.role !== 'string' || !actor.role) issues.push(`${actor.id}: role is required`);
    let resolved = null;
    try {
      resolved = resolveEntityProfile(actor.profile);
    } catch (error) {
      issues.push(`${actor.id}: ${error.message}`);
    }
    if (resolved && actor.overrides && typeof actor.overrides === 'object') {
      const applied = new Set(OVERRIDE_APPLIED[resolved.kind] || []);
      for (const key of Object.keys(actor.overrides)) {
        if (!applied.has(key)) {
          issues.push(`${actor.id}.overrides.${key}: not applied on ${resolved.kind} profiles. Refusing to drop it.`);
        }
      }
    }
    if (resolved && resolved.kind !== 'ship' && actor.loadout != null) {
      issues.push(`${actor.id}.loadout: loadout is only applied to ship profiles. Refusing to drop it.`);
    }
    const entity = {
      alias: actor.id,
      profile: actor.profile,
      role: actor.role || 'prop',
      isPlayer: !!actor.isPlayer,
      pos: {
        x: round6(actor.x || 0),
        y: finiteMeasure(actor.y, issues, `${actor.id}.y`),
        z: round6(actor.z || 0),
      },
      vel: {
        x: round6(actor.velX || 0),
        y: finiteMeasure(actor.velY, issues, `${actor.id}.velY`),
        z: round6(actor.velZ || 0),
      },
      heading: round6(actor.heading || 0),
      angularVelocity: round6(actor.angularVelocity || 0),
      persistent: actor.persistent !== false,
    };
    if (actor.team != null) entity.team = actor.team;
    if (actor.factionId != null) entity.factionId = actor.factionId;
    if (actor.overrides && Object.keys(actor.overrides).length) entity.overrides = clone(actor.overrides);
    if (actor.loadout != null) entity.loadout = clone(actor.loadout);
    entities.push(entity);
  }

  const labAttachments = [];
  const aliases = new Set(entities.map((entity) => entity.alias));
  for (const link of attachments) {
    if (link.defId !== TETHER_DEF_ID) {
      issues.push(`${link.id}: lab runner creates ${TETHER_DEF_ID} only. Refusing to drop defId "${link.defId}".`);
    }
    if (!aliases.has(link.ownerAlias) || !aliases.has(link.targetAlias)) {
      issues.push(`${link.id}: attachment alias does not match an actor`);
    }
    const row = {
      defId: link.defId,
      ownerAlias: link.ownerAlias,
      targetAlias: link.targetAlias,
    };
    if (link.restLength != null) row.restLength = link.restLength;
    labAttachments.push(row);
  }

  const metrics = [];
  const assertions = [];
  const seenMetric = new Set();
  const seenOracle = new Set();
  for (const objective of objectives) {
    if (typeof objective.metric !== 'string' || !objective.metric) {
      issues.push(`${objective.id}: objective.metric is required`);
      continue;
    }
    if (seenMetric.has(objective.metric)) {
      issues.push(`${objective.id}: metric "${objective.metric}" is already used. A second copy would not consume exactly once.`);
    }
    seenMetric.add(objective.metric);
    const metric = {
      name: objective.metric,
      version: 1,
      threshold: { op: objective.op, value: objective.value },
    };
    if (objective.signal) metric.params = { signal: objective.signal };
    metrics.push(metric);
    const assertion = { kind: 'metric', metric: objective.metric, op: objective.op, value: objective.value };
    assertions.push(assertion);
    rememberOracle(assertion, seenOracle, issues);
  }
  for (const trigger of triggers) {
    if (!trigger.assertion || typeof trigger.assertion !== 'object') {
      issues.push(`${trigger.id}: trigger.assertion is required`);
      continue;
    }
    let assertion = null;
    try {
      assertion = clone(trigger.assertion);
    } catch (error) {
      assertion = null;
    }
    if (!assertion || typeof assertion !== 'object' || Array.isArray(assertion)) {
      issues.push(`${trigger.id}: trigger.assertion could not be cloned`);
      continue;
    }
    assertions.push(assertion);
    rememberOracle(assertion, seenOracle, issues);
    if (assertion.signal && !SIGNAL_SET.has(assertion.signal)) {
      issues.push(`${trigger.id}: signal "${assertion.signal}" is not a lab sample field`);
    }
  }
  if (project.standardInvariants !== false) {
    for (const name of INVARIANT_NAMES) {
      if (seenMetric.has(name)) {
        issues.push(`standard invariant "${name}" collides with an objective`);
        continue;
      }
      metrics.push({ name, version: 1, threshold: { op: '==', value: 1 } });
      const assertion = { kind: 'metric', metric: name, op: '==', value: 1 };
      assertions.push(assertion);
      rememberOracle(assertion, seenOracle, issues);
    }
  }

  const signals = new Set(Array.isArray(project.traceSignals) ? project.traceSignals : []);
  for (const name of ['playerX', 'playerZ', 'playerVelX', 'playerVelZ', 'playerAlive', 'hull', 'cap', 'credits']) {
    signals.add(name);
  }
  for (const assertion of assertions) {
    if (assertion && assertion.signal && SIGNAL_SET.has(assertion.signal)) signals.add(assertion.signal);
  }
  for (const metric of metrics) {
    if (metric.params && metric.params.signal && SIGNAL_SET.has(metric.params.signal)) {
      signals.add(metric.params.signal);
    }
  }
  if (labAttachments.length) {
    signals.add('distance');
    signals.add('attachmentActive');
    signals.add('tension');
  }

  const clonedFrames = Array.isArray(project.frames) ? clone(project.frames) : [];
  const frames = Array.isArray(clonedFrames) ? clonedFrames : [];
  if (Array.isArray(project.frames) && !Array.isArray(clonedFrames)) {
    issues.push('frames could not be cloned');
  }
  for (const frame of frames) {
    if (!frame || !frame.input) continue;
    for (const key of Object.keys(frame.input)) {
      if (!FRAME_KEYS.has(key)) {
        issues.push(`frames input "${key}" is not a lab frame field. It is left in place so validation can reject it.`);
      }
    }
  }

  const scenario = {
    schema: SIM_SCENARIO_SCHEMA,
    id: projectId,
    version: project.version ?? 1,
    title: project.title,
    description: project.description || '',
    evidenceClass: project.evidenceClass,
    runtimeProfile: project.runtimeProfile || 'focused-lab',
    seed: project.seed,
    ticks: project.ticks,
    world: clone(project.world),
    entities,
    attachments: labAttachments,
    inputEvents: Array.isArray(project.inputEvents) ? clone(project.inputEvents) : [],
    frames,
    trace: {
      signals: [...signals].sort(),
      sampleEvery: Number.isInteger(project.sampleEvery) && project.sampleEvery > 0 ? project.sampleEvery : 1,
    },
    metrics,
    assertions,
    fixtureExceptions: Array.isArray(project.fixtureExceptions) ? clone(project.fixtureExceptions) : [],
    observer: clone(project.observer || { enabled: false }),
    notes: clone(project.notes || {}),
  };
  if (project.dt != null) scenario.dt = project.dt;
  if (Array.isArray(project.systems)) scenario.systems = clone(project.systems);
  if (Array.isArray(project.policies) && project.policies.length) scenario.policies = clone(project.policies);
  if (Array.isArray(project.checkpoints) && project.checkpoints.length) scenario.checkpoints = clone(project.checkpoints);
  if (project.parameterOverlay) scenario.parameterOverlay = clone(project.parameterOverlay);
  if (project.saveLoadEquivalence) scenario.saveLoadEquivalence = project.saveLoadEquivalence;
  return scenario;
}

function rememberOracle(assertion, seen, issues) {
  const id = oracleId(assertion);
  if (seen.has(id)) issues.push(`oracle "${id}" is declared more than once`);
  seen.add(id);
}

function oracleId(assertion) {
  if (!assertion || typeof assertion !== 'object') return 'invalid';
  if (assertion.kind === 'metric' || assertion.kind === 'quantitative') return `${assertion.metric}@1`;
  if (assertion.signal) return `${assertion.kind}:${assertion.signal}`;
  return String(assertion.kind || 'assertion');
}

function placeFromDisc(field) {
  const place = clone(field.place);
  if (!place || typeof place !== 'object' || Array.isArray(place)) return place;
  const center = place.center && typeof place.center === 'object' ? { ...place.center } : {};
  if (Number.isFinite(field.x)) center.x = field.x;
  if (Number.isFinite(field.z)) center.z = field.z;
  place.center = center;
  if (typeof field.radius === 'number' && field.radius > 0) place.radius = field.radius;
  return place;
}

function buildPack(project, fields, dialect, issues, manifest) {
  if (!project || !dialect) return null;
  const files = {};
  const mod = modMeta(project, issues);
  if (!mod) return null;
  files['mod.json'] = mod;

  if (project.encounter) {
    checkEncounter(project.encounter, dialect, issues);
    files[`encounters/${project.encounter.id}.json`] = clone(project.encounter);
  }
  if (project.weapon) {
    checkWeapon(project.weapon, dialect, issues);
    files[`weapons/${project.weapon.id}.json`] = clone(project.weapon);
  }
  if (project.module) {
    checkModule(project.module, dialect, issues);
    files[`modules/${project.module.id}.json`] = clone(project.module);
  }
  if (project.place) {
    checkPlace(project.place, dialect, issues);
    files[`places/${project.place.id}.json`] = clone(project.place);
  }
  for (const field of fields) {
    if (field.fieldKind !== 'place') continue;
    if (!field.place) {
      issues.push(`${field.id}: place field requires a place record`);
      continue;
    }
    checkPlace(field.place, dialect, issues);
    const file = `places/${field.place.id}.json`;
    if (files[file]) issues.push(`${field.id}: duplicate place file ${file}`);
    files[file] = placeFromDisc(field);
  }
  if (project.encounter) manifest.written.encounter = `encounters/${project.encounter.id}.json`;
  if (project.weapon) manifest.written.weapon = `weapons/${project.weapon.id}.json`;
  if (project.module) manifest.written.module = `modules/${project.module.id}.json`;
  const placeFile = Object.keys(files).find((file) => file.startsWith('places/'));
  if (placeFile) manifest.written.place = placeFile;
  return { modId: mod.id, files };
}

function modMeta(project, issues) {
  const fallbackId = String(project.id || 'dock').replace(/\./g, '-');
  const mod = project.mod || {
    id: fallbackId,
    name: project.title || fallbackId,
    version: '1.0.0',
    description: project.description || '',
    author: 'Creators Dock',
  };
  if (!mod || typeof mod !== 'object') {
    issues.push('mod manifest must be an object');
    return null;
  }
  for (const key of Object.keys(mod)) {
    if (!['id', 'name', 'version', 'description', 'author'].includes(key)) {
      issues.push(`mod.${key}: unknown mod.json field`);
    }
  }
  if (typeof mod.id !== 'string' || !MOD_ID_RE.test(mod.id)) issues.push('mod.id must be a safe slug');
  if (typeof mod.name !== 'string' || !mod.name.trim()) issues.push('mod.name is required');
  if (mod.version != null && typeof mod.version !== 'string') issues.push('mod.version must be a string');
  return {
    id: mod.id,
    name: mod.name,
    version: mod.version || '1.0.0',
    description: typeof mod.description === 'string' ? mod.description : '',
    author: typeof mod.author === 'string' ? mod.author : '',
  };
}

function rejectUnknown(record, allowed, label, issues) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    issues.push(`${label} must be an object`);
    return;
  }
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) issues.push(`${label}.${key}: unknown field "${key}"`);
  }
}

function checkEncounter(rec, dialect, issues) {
  const label = `encounter${rec && rec.id ? ` ${rec.id}` : ''}`;
  rejectUnknown(rec, dialect.encounterKeys, label, issues);
  if (!rec || typeof rec !== 'object') return;
  if (typeof rec.id !== 'string' || !ENCOUNTER_ID_RE.test(rec.id)) issues.push(`${label}: id must be lowercase_snake`);
  if (dialect.encounterIds.has(rec.id)) issues.push(`${label}: id collides with shipped content`);
  if (!Number.isInteger(rec.order) || rec.order < 1000) issues.push(`${label}: order must be an integer >= 1000`);
  if (!ENCOUNTER_TIERS.includes(rec.tier)) issues.push(`${label}: tier must be major, minor, or ambient`);
  if (!ENCOUNTER_DECKS.includes(rec.deck)) issues.push(`${label}: deck is not a user-content deck`);
  if (!Number.isInteger(rec.weight) || rec.weight < 1) issues.push(`${label}: weight must be a positive integer`);
  if (!Array.isArray(rec.zoneTypes) || !rec.zoneTypes.length) issues.push(`${label}: zoneTypes must be a non-empty array`);
  else {
    for (const zoneType of rec.zoneTypes) {
      if (!dialect.zoneTypeSet.has(zoneType)) issues.push(`${label}: unknown zone type "${zoneType}"`);
    }
  }
  if (typeof rec.script !== 'string' || !dialect.scripts.has(rec.script)) {
    issues.push(`${label}: script is not a shipped encounter script`);
  } else if (dialect.forbiddenScripts.has(rec.script)) {
    issues.push(`${label}: script "${rec.script}" is not usable from JSON`);
  }
  for (const field of ['squad', 'escort', 'genuine', 'bait', 'boss']) {
    const recipe = rec[field];
    if (recipe == null) continue;
    if (typeof recipe !== 'object' || Array.isArray(recipe)) {
      issues.push(`${label}.${field} must be an object`);
      continue;
    }
    if (recipe.archetypes != null) {
      if (!Array.isArray(recipe.archetypes)) issues.push(`${label}.${field}.archetypes must be an array`);
      else {
        for (const archetype of recipe.archetypes) {
          if (!dialect.enemyIds.has(archetype)) {
            issues.push(`${label}.${field}.archetypes unknown "${archetype}"`);
          }
        }
      }
    }
  }
  try {
    validateEncounterShape(rec.shape, rec.id || 'dock');
  } catch (error) {
    issues.push(`${label}: ${error.message}`);
  }
}

function checkWeapon(rec, dialect, issues) {
  const label = `weapon${rec && rec.id ? ` ${rec.id}` : ''}`;
  rejectUnknown(rec, dialect.weaponKeys, label, issues);
  if (!rec || typeof rec !== 'object') return;
  if (typeof rec.id !== 'string' || !WEAPON_ID_RE.test(rec.id)) issues.push(`${label}: id must match wpn_* or unique_*`);
  if (dialect.weaponIds.has(rec.id)) issues.push(`${label}: id collides with a shipped weapon`);
  if (typeof rec.name !== 'string' || !rec.name.trim()) issues.push(`${label}: name is required`);
  if (rec.slotType !== 'weapon') issues.push(`${label}: slotType must be "weapon"`);
  if (!['S', 'M', 'L'].includes(rec.size)) issues.push(`${label}: size must be S, M, or L`);
  if (!Number.isInteger(rec.tier) || rec.tier < 1 || rec.tier > 5) issues.push(`${label}: tier must be an integer 1-5`);
  for (const field of ['mass', 'price', 'dmg', 'rof', 'energyCost', 'projSpeed', 'range']) {
    if (typeof rec[field] !== 'number' || !Number.isFinite(rec[field]) || rec[field] < 0) {
      issues.push(`${label}: ${field} must be a non-negative number`);
    }
  }
  if (!rec.rof) issues.push(`${label}: rof must be > 0`);
  if (!['energy', 'kinetic', 'explosive', 'thermal', 'ion', 'emp'].includes(rec.damageType)) {
    issues.push(`${label}: damageType is not in the shipped set`);
  }
  if (!['fixed', 'auto_turret', 'homing', 'hitscan', 'deploy'].includes(rec.tracking)) {
    issues.push(`${label}: tracking is not in the shipped set`);
  }
}

function checkModule(rec, dialect, issues) {
  const label = `module${rec && rec.id ? ` ${rec.id}` : ''}`;
  rejectUnknown(rec, dialect.moduleKeys, label, issues);
  if (!rec || typeof rec !== 'object') return;
  if (typeof rec.id !== 'string' || !MODULE_ID_RE.test(rec.id)) issues.push(`${label}: id must match mod_* or unique_*`);
  if (dialect.moduleIds.has(rec.id)) issues.push(`${label}: id collides with a shipped module`);
  if (typeof rec.name !== 'string' || !rec.name.trim()) issues.push(`${label}: name is required`);
  if (!MODULE_SLOT_TYPES.includes(rec.slotType)) issues.push(`${label}: slotType is not a user module slot`);
  if (!['S', 'M', 'L'].includes(rec.size)) issues.push(`${label}: size must be S, M, or L`);
  if (!Number.isInteger(rec.tier) || rec.tier < 1 || rec.tier > 5) issues.push(`${label}: tier must be an integer 1-5`);
  for (const field of ['mass', 'price']) {
    if (typeof rec[field] !== 'number' || !Number.isFinite(rec[field]) || rec[field] < 0) {
      issues.push(`${label}: ${field} must be a non-negative number`);
    }
  }
  if (rec.sentence != null && (typeof rec.sentence !== 'string' || !rec.sentence.trim() || /[\r\n]/.test(rec.sentence))) {
    issues.push(`${label}: sentence must be one non-empty line`);
  }
}

function checkPlace(rec, dialect, issues) {
  const label = `place${rec && rec.id ? ` ${rec.id}` : ''}`;
  rejectUnknown(rec, dialect.placeKeys, label, issues);
  if (!rec || typeof rec !== 'object') return;
  if (typeof rec.sectorId !== 'string' || !dialect.sectorIds.has(rec.sectorId)) {
    issues.push(`${label}: sectorId is not a sector that already has zones`);
  }
  if (typeof rec.id !== 'string' || !PLACE_ID_RE.test(rec.id)) issues.push(`${label}: id must match zone_*`);
  if (dialect.zoneIds.has(rec.id)) issues.push(`${label}: id collides with an existing zone`);
  if (typeof rec.name !== 'string' || !rec.name.trim()) issues.push(`${label}: name is required`);
  if (!dialect.zoneTypeSet.has(rec.type)) issues.push(`${label}: type is not a zone type`);
  if (rec.factionId != null && (typeof rec.factionId !== 'string' || !rec.factionId.startsWith('faction_'))) {
    issues.push(`${label}: factionId must be a faction_* id`);
  }
  if (typeof rec.reason !== 'string' || !rec.reason.trim()) issues.push(`${label}: reason is required`);
  if (!rec.center || !Number.isFinite(rec.center.x) || !Number.isFinite(rec.center.z)) {
    issues.push(`${label}: center must be {x, z} numbers`);
  }
  if (typeof rec.radius !== 'number' || !(rec.radius > 0)) issues.push(`${label}: radius must be a positive number`);
  if (rec.threat != null && (!Number.isInteger(rec.threat) || rec.threat < 0 || rec.threat > 5)) {
    issues.push(`${label}: threat must be an integer 0-5`);
  }
}

export function importScenario(doc) {
  const issues = [];
  if (!doc || typeof doc !== 'object') return { ok: false, issues: ['scenario must be an object'], project: null };
  const validation = validateSimScenario(doc);
  if (!validation.ok) {
    return {
      ok: false,
      issues: validation.issues.map(formatSimScenarioIssue),
      project: null,
    };
  }
  const project = emptyProject({
    id: doc.id,
    title: doc.title,
    description: doc.description || '',
    seed: doc.seed,
    ticks: doc.ticks,
    composition: (doc.notes && doc.notes.composition) || 'imported',
  });
  project.version = doc.version ?? 1;
  project.evidenceClass = doc.evidenceClass;
  project.runtimeProfile = doc.runtimeProfile || 'focused-lab';
  project.world = clone(doc.world);
  project.frames = clone(doc.frames || []);
  project.inputEvents = clone(doc.inputEvents || []);
  project.notes = clone(doc.notes || {});
  project.fixtureExceptions = clone(doc.fixtureExceptions || []);
  project.observer = clone(doc.observer || { enabled: false });
  project.traceSignals = doc.trace && Array.isArray(doc.trace.signals) ? doc.trace.signals.slice() : [];
  if (doc.trace && Number.isInteger(doc.trace.sampleEvery)) project.sampleEvery = doc.trace.sampleEvery;
  if (doc.dt != null) project.dt = doc.dt;
  if (Array.isArray(doc.systems)) project.systems = clone(doc.systems);
  if (Array.isArray(doc.policies) && doc.policies.length) project.policies = clone(doc.policies);
  if (Array.isArray(doc.checkpoints) && doc.checkpoints.length) project.checkpoints = clone(doc.checkpoints);
  if (doc.parameterOverlay) project.parameterOverlay = clone(doc.parameterOverlay);
  if (doc.saveLoadEquivalence) project.saveLoadEquivalence = doc.saveLoadEquivalence;

  const objects = [];
  let refusedMeasure = false;
  function importedMeasure(value, label) {
    if (value === null) {
      refusedMeasure = true;
      issues.push(`${label} must be a finite number`);
      return null;
    }
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (value === undefined) return 0;
    refusedMeasure = true;
    issues.push(`${label} must be a finite number`);
    return null;
  }
  for (const entity of doc.entities || []) {
    const actor = {
      id: entity.alias,
      kind: 'actor',
      role: entity.role,
      profile: entity.profile,
      x: entity.pos ? entity.pos.x : 0,
      y: importedMeasure(entity.pos ? entity.pos.y : undefined, `${entity.alias || 'entity'}.pos.y`),
      z: entity.pos ? entity.pos.z : 0,
      heading: entity.heading || 0,
      velX: entity.vel ? entity.vel.x : 0,
      velY: importedMeasure(entity.vel ? entity.vel.y : undefined, `${entity.alias || 'entity'}.vel.y`),
      velZ: entity.vel ? entity.vel.z : 0,
      angularVelocity: entity.angularVelocity || 0,
      persistent: entity.persistent !== false,
    };
    if (entity && Object.prototype.hasOwnProperty.call(entity, 'isPlayer') && typeof entity.isPlayer !== 'boolean') {
      return {
        ok: false,
        issues: [`${entity.alias || 'entity'}: isPlayer must be a boolean`],
        project: null,
      };
    }
    actor.isPlayer = entity.isPlayer === true;
    if (entity.team != null) actor.team = entity.team;
    if (entity.factionId) actor.factionId = entity.factionId;
    if (entity.overrides && Object.keys(entity.overrides).length) actor.overrides = clone(entity.overrides);
    if (entity.loadout != null) actor.loadout = clone(entity.loadout);
    objects.push(actor);
  }
  const playerCount = objects.filter((object) => object.kind === 'actor' && object.isPlayer).length;
  if (playerCount !== 1) {
    return {
      ok: false,
      issues: [`scene needs exactly one player actor (found ${playerCount})`],
      project: null,
    };
  }
  if (refusedMeasure) return { ok: false, issues, project: null };
  let linkIndex = 0;
  for (const link of doc.attachments || []) {
    const row = {
      id: `link_${linkIndex}`,
      kind: 'attachment',
      defId: link.defId,
      ownerAlias: link.ownerAlias,
      targetAlias: link.targetAlias,
    };
    if (link.restLength != null) row.restLength = link.restLength;
    objects.push(row);
    linkIndex += 1;
  }

  const invariantMetrics = new Set();
  const metricByName = new Map();
  for (const metric of doc.metrics || []) {
    if (INVARIANT_NAMES.includes(metric.name)) invariantMetrics.add(metric.name);
    else metricByName.set(metric.name, metric);
  }
  const invariantAssertions = (doc.assertions || []).filter((assertion) => (
    assertion && assertion.kind === 'metric' && INVARIANT_NAMES.includes(assertion.metric)
  ));
  project.standardInvariants = INVARIANT_NAMES.every((name) => invariantMetrics.has(name))
    && invariantAssertions.length === INVARIANT_NAMES.length;

  let objectiveIndex = 0;
  let triggerIndex = 0;
  for (const assertion of doc.assertions || []) {
    if (!assertion || typeof assertion !== 'object') continue;
    if (assertion.kind === 'metric' && INVARIANT_NAMES.includes(assertion.metric)) continue;
    if (assertion.kind === 'metric' || assertion.kind === 'quantitative') {
      const metric = metricByName.get(assertion.metric);
      if (!metric) {
        issues.push(`assertion metric "${assertion.metric}" has no metric entry`);
        continue;
      }
      if (metric.params && Object.keys(metric.params).some((key) => key !== 'signal')) {
        issues.push(`metric "${metric.name}" has params the dock cannot round-trip`);
      }
      objects.push({
        id: `objective_${objectiveIndex}`,
        kind: 'objective',
        x: 0,
        z: 0,
        metric: assertion.metric,
        ...(metric.params && metric.params.signal ? { signal: metric.params.signal } : {}),
        op: assertion.op,
        value: assertion.value,
        labOnly: true,
        label: assertion.metric,
      });
      objectiveIndex += 1;
      continue;
    }
    if (['holds', 'never', 'eventByTick', 'settles', 'temporal'].includes(assertion.kind)) {
      objects.push({
        id: `trigger_${triggerIndex}`,
        kind: 'trigger',
        shape: 'circle',
        x: 0,
        z: 0,
        radius: 10,
        assertion: clone(assertion),
        labOnly: true,
        label: assertion.kind,
      });
      triggerIndex += 1;
      continue;
    }
    issues.push(`assertion kind "${assertion.kind}" has no dock mapping. Refusing to drop it.`);
  }
  project.objects = objects;
  const stored = clone(project);
  const canon = playerCanonIssues(stored);
  if (canon.length) return { ok: false, issues: issues.concat(canon), project: null };
  return { ok: issues.length === 0, issues, project: stored };
}

export function packFileText(files) {
  const out = {};
  for (const [name, value] of Object.entries(files)) out[name] = stableStringify(value);
  return out;
}
