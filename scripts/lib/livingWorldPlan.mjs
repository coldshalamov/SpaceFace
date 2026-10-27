// Read-only authoring support for the living-world commission. This module does not
// register geography, spawn actors, schedule simulation, or mark gameplay accepted.
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SECTORS } from '../../src/data/sectors.js';
import { SECTOR_ZONES } from '../../src/data/sectorZones.js';

export const LIVING_WORLD_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const LIVING_WORLD_PLAN_DIR = 'design/program/living-world';
export const AUTHORING_NOTICE = 'Authored plan only. Read-only; no runtime registration, task claim, or gameplay acceptance.';

const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const idPattern = /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/;

export function isRepoRelativePath(path) {
  return nonempty(path) && !isAbsolute(path) && !/^[A-Za-z]:/.test(path)
    && !path.includes('\\') && !path.split('/').some(part => part === '..' || part === '.' || part === '');
}

export function canonicalLivingWorldReferences() {
  return {
    sectors: new Set(SECTORS.map(row => row.id)),
    zonesBySector: new Map(Object.entries(SECTOR_ZONES).map(([sector, zones]) => [sector, new Set(zones.map(zone => zone.id))])),
  };
}

function isFile(root, path) {
  if (!isRepoRelativePath(path)) return false;
  try {
    const target = realpathSync(resolve(root, path));
    const inside = relative(realpathSync(root), target);
    if (isAbsolute(inside) || inside === '..' || inside.startsWith('../')) return false;
    return statSync(target).isFile();
  } catch { return false; }
}

export function readLivingWorldPlan(root = LIVING_WORLD_ROOT) {
  const read = name => JSON.parse(readFileSync(resolve(root, LIVING_WORLD_PLAN_DIR, name), 'utf8'));
  return { districts: read('districts.json'), program: read('program.json') };
}

/**
 * Validate the authoring package against canonical source identities. Resource edges
 * may cycle (a productive world can recycle); routine/task dependsOn edges are setup
 * dependencies and must be a DAG. File checking is injectable for focused fixtures.
 */
export function validateLivingWorldPlan(districtDocument, programDocument, {
  root = LIVING_WORLD_ROOT,
  references = canonicalLivingWorldReferences(),
  fileExists = path => isFile(root, path),
} = {}) {
  const issues = [];
  const add = (path, code, message) => issues.push({ path, code, message });
  const text = (value, path) => { if (!nonempty(value)) add(path, 'required_text', 'Expected nonempty text.'); };
  const id = (value, path) => { if (!nonempty(value) || !idPattern.test(value)) add(path, 'invalid_id', 'Expected a stable ID using letters, digits, underscores, hyphens, periods, or colons.'); };
  const array = (value, path, { nonempty: requireRows = false } = {}) => {
    if (!Array.isArray(value)) { add(path, 'required_array', 'Expected an array.'); return []; }
    if (requireRows && !value.length) add(path, 'empty_array', 'This composition needs at least one entry.');
    return value;
  };
  const unique = (rows, path) => {
    const seen = new Set();
    for (let index = 0; index < rows.length; index++) {
      const value = plain(rows[index]) ? rows[index].id : rows[index];
      id(value, `${path}[${index}]${plain(rows[index]) ? '.id' : ''}`);
      if (seen.has(value)) add(`${path}[${index}]`, 'duplicate_id', `Duplicate ID: ${value}`);
      seen.add(value);
    }
    return seen;
  };
  const pathText = (value, path, existing = false) => {
    if (!isRepoRelativePath(value)) { add(path, 'invalid_path', 'Expected a safe repository-relative path.'); return; }
    if (existing && !fileExists(value)) add(path, 'missing_source', `Source file does not exist: ${value}`);
  };
  const objectRows = (value, path, required = true) => {
    const rows = array(value, path, { nonempty: required });
    unique(rows, path);
    return rows.filter((row, index) => {
      if (plain(row)) return true;
      add(`${path}[${index}]`, 'required_object', 'Expected a record object.');
      return false;
    });
  };
  const referencesList = (value, allowed, path) => {
    const rows = array(value, path);
    unique(rows, path);
    for (const ref of rows) if (!allowed.has(ref)) add(path, 'unknown_reference', `Unknown reference: ${ref}`);
    return rows;
  };
  const textList = (value, path, minimum = 1) => {
    const rows = array(value, path);
    if (rows.length < minimum) add(path, 'missing_alternatives', `Expected at least ${minimum} ${minimum === 1 ? 'entry' : 'entries'}.`);
    for (const [index, value] of rows.entries()) text(value, `${path}[${index}]`);
  };

  if (!plain(districtDocument)) add('districts', 'required_object', 'Expected the districts document.');
  if (!plain(programDocument)) add('program', 'required_object', 'Expected the program document.');
  if (!plain(districtDocument) || !plain(programDocument)) return result();
  for (const [key, doc] of [['districts', districtDocument], ['program', programDocument]]) {
    if (doc.schemaVersion !== 1) add(`${key}.schemaVersion`, 'schema_version', 'Expected schemaVersion 1.');
    id(doc.campaignId, `${key}.campaignId`);
  }
  if (districtDocument.campaignId !== programDocument.campaignId) add('program.campaignId', 'campaign_mismatch', 'Both documents must name the same campaign.');
  if (!/^[a-f0-9]{40}$/.test(districtDocument.sourceBase || '')) add('districts.sourceBase', 'source_base', 'Expected a complete 40-character source commit.');
  if (districtDocument.status !== 'authored_plan') add('districts.status', 'plan_status', 'The district document must remain explicitly authored_plan.');

  const districts = objectRows(districtDocument.districts, 'districts.districts');
  const districtIds = new Set(districts.map(row => row.id));
  const opportunityOwners = new Map();
  for (const [index, district] of districts.entries()) {
    const p = `districts.districts[${index}]`;
    for (const key of ['name', 'premise', 'geometry', 'arrival']) text(district[key], `${p}.${key}`);
    if (district.status !== 'planned') add(`${p}.status`, 'district_status', 'This authoring catalog describes planned districts, not runtime acceptance.');
    if (!references.sectors.has(district.sectorId)) add(`${p}.sectorId`, 'unknown_sector', `Unknown canonical sector: ${district.sectorId}`);
    const zones = array(district.zoneIds, `${p}.zoneIds`, { nonempty: true });
    unique(zones, `${p}.zoneIds`);
    for (const zone of zones) if (!references.zonesBySector.get(district.sectorId)?.has(zone)) add(`${p}.zoneIds`, 'unknown_zone', `Zone ${zone} is not registered in ${district.sectorId}.`);
    if (!plain(district.landmark)) add(`${p}.landmark`, 'required_object', 'Expected a landmark brief.');
    else {
      text(district.landmark.name, `${p}.landmark.name`);
      text(district.landmark.change, `${p}.landmark.change`);
      if (district.landmark.existingRef !== null) text(district.landmark.existingRef, `${p}.landmark.existingRef`);
    }

    const population = district.population;
    if (!plain(population)) add(`${p}.population`, 'required_object', 'Expected a population budget.');
    else {
      for (const key of ['normalActive', 'alertActive', 'reserve', 'sharedCap']) {
        if (!Number.isSafeInteger(population[key]) || population[key] < 0) add(`${p}.population.${key}`, 'invalid_budget', 'Expected a finite, nonnegative integer.');
      }
      if (!(population.sharedCap >= 1 && population.sharedCap <= 40)) add(`${p}.population.sharedCap`, 'shared_cap', 'Shared live-actor cap must stay within the existing 1–40 hard bound.');
      for (const key of ['normalActive', 'alertActive']) if (population[key] > population.sharedCap) add(`${p}.population.${key}`, 'budget_exceeded', 'District live demand exceeds its declared shared cap.');
      if (population.admission != null) text(population.admission, `${p}.population.admission`);
      if ((population.normalActive > 24 || population.alertActive > 24) && !nonempty(population.admission)) add(`${p}.population.admission`, 'budget_admission', 'Demand above the current 24-slot default needs an explicit admission proposal; the hard ceiling is not an automatic grant.');
    }

    const resources = objectRows(district.resources, `${p}.resources`);
    const resourceIds = new Set(resources.map(row => row.id));
    for (const [i, resource] of resources.entries()) {
      text(resource.owner, `${p}.resources[${i}].owner`);
      pathText(resource.path, `${p}.resources[${i}].path`, true);
      text(resource.description, `${p}.resources[${i}].description`);
    }
    const routines = objectRows(district.routines, `${p}.routines`);
    const routineIds = new Set(routines.map(row => row.id));
    for (const [i, routine] of routines.entries()) {
      const rp = `${p}.routines[${i}]`;
      for (const key of ['role', 'owner', 'interruption', 'recovery']) text(routine[key], `${rp}.${key}`);
      pathText(routine.path, `${rp}.path`, true);
      referencesList(routine.inputResourceIds, resourceIds, `${rp}.inputResourceIds`);
      referencesList(routine.outputResourceIds, resourceIds, `${rp}.outputResourceIds`);
      referencesList(routine.dependsOn, routineIds, `${rp}.dependsOn`);
      textList(routine.visibleSteps, `${rp}.visibleSteps`);
    }
    checkDependencyCycles(routines, `${p}.routines`, add);

    const opportunities = objectRows(district.opportunities, `${p}.opportunities`);
    for (const [i, opportunity] of opportunities.entries()) {
      const op = `${p}.opportunities[${i}]`;
      if (opportunityOwners.has(opportunity.id)) add(`${op}.id`, 'duplicate_opportunity_id', `Opportunity ${opportunity.id} already belongs to ${opportunityOwners.get(opportunity.id)}; mission identities must be unique across districts.`);
      else opportunityOwners.set(opportunity.id, district.id);
      for (const key of ['title', 'commitReceipt', 'failure', 'revisit']) text(opportunity[key], `${op}.${key}`);
      textList(opportunity.approaches, `${op}.approaches`, 2);
      const approaches = Array.isArray(opportunity.approaches) ? opportunity.approaches : [];
      if (new Set(approaches.map(value => typeof value === 'string' ? value.trim() : value)).size < 2) add(`${op}.approaches`, 'duplicate_approach', 'Specify at least two distinct approaches.');
    }

    const assets = objectRows(district.assets, `${p}.assets`);
    for (const [i, asset] of assets.entries()) {
      const ap = `${p}.assets[${i}]`;
      text(asset.brief, `${ap}.brief`);
      if (!['reuse', 'planned'].includes(asset.status)) add(`${ap}.status`, 'asset_status', 'Explicitly classify the asset as reuse or planned.');
      if (asset.status === 'reuse') pathText(asset.sourcePath, `${ap}.sourcePath`, true);
      else if (asset.sourcePath !== null) pathText(asset.sourcePath, `${ap}.sourcePath`);
    }
    const paths = array(district.sourcePaths, `${p}.sourcePaths`, { nonempty: true });
    for (const [i, path] of paths.entries()) pathText(path, `${p}.sourcePaths[${i}]`, true);
    if (new Set(paths).size !== paths.length) add(`${p}.sourcePaths`, 'duplicate_path', 'Source crosswalk contains duplicate paths.');
    const acceptance = objectRows(district.acceptance, `${p}.acceptance`);
    for (const [i, check] of acceptance.entries()) for (const key of ['action', 'expected', 'negative']) text(check[key], `${p}.acceptance[${i}].${key}`);
  }

  const tasks = objectRows(programDocument.tasks, 'program.tasks');
  const taskIds = new Set(tasks.map(row => row.id));
  const taskMap = new Map(tasks.map(row => [row.id, row]));
  for (const [i, task] of tasks.entries()) {
    const tp = `program.tasks[${i}]`;
    for (const key of ['title', 'outcome']) text(task[key], `${tp}.${key}`);
    if (!['planned', 'implemented'].includes(task.status)) add(`${tp}.status`, 'task_status', 'Expected planned or implemented; neither means gameplay accepted.');
    const dependencies = referencesList(task.dependsOn, taskIds, `${tp}.dependsOn`);
    referencesList(task.districtIds, districtIds, `${tp}.districtIds`);
    if (!Number.isSafeInteger(task.priority) || task.priority < 0) add(`${tp}.priority`, 'invalid_priority', 'Expected a nonnegative integer priority.');
    if (!isRepoRelativePath(task.packet) || !task.packet.startsWith('tasks/') || !task.packet.endsWith('.md')) add(`${tp}.packet`, 'packet_path', 'Expected a Markdown work packet under tasks/.');
    else if (!fileExists(`${LIVING_WORLD_PLAN_DIR}/${task.packet}`)) add(`${tp}.packet`, 'missing_packet', `Missing task packet: ${task.packet}`);
    const paths = array(task.ownerPaths, `${tp}.ownerPaths`, { nonempty: true });
    for (const [j, path] of paths.entries()) pathText(path, `${tp}.ownerPaths[${j}]`);
    textList(task.checks, `${tp}.checks`);
    if (task.status === 'implemented') for (const dependency of dependencies) {
      if (taskMap.get(dependency)?.status === 'planned') add(`${tp}.dependsOn`, 'incomplete_dependency', `Implemented work still depends on planned task ${dependency}.`);
    }
  }
  checkDependencyCycles(tasks, 'program.tasks', add);
  return result(districts, tasks);

  function result(districts = [], tasks = []) {
    return {
      ok: issues.length === 0,
      notice: AUTHORING_NOTICE,
      issues,
      counts: {
        districts: districts.length,
        routines: districts.reduce((sum, row) => sum + (Array.isArray(row.routines) ? row.routines.length : 0), 0),
        opportunities: districts.reduce((sum, row) => sum + (Array.isArray(row.opportunities) ? row.opportunities.length : 0), 0),
        tasks: tasks.length,
        implementedAuthoringTasks: tasks.filter(task => task.status === 'implemented').length,
      },
    };
  }
}

function checkDependencyCycles(rows, path, add) {
  const byId = new Map(rows.map(row => [row.id, row]));
  const visiting = new Set();
  const complete = new Set();
  function visit(id, trail) {
    if (complete.has(id) || !byId.has(id)) return;
    if (visiting.has(id)) { add(path, 'dependency_cycle', `Setup dependency cycle: ${[...trail.slice(trail.indexOf(id)), id].join(' -> ')}`); return; }
    visiting.add(id);
    for (const dependency of Array.isArray(byId.get(id).dependsOn) ? byId.get(id).dependsOn : []) visit(dependency, [...trail, id]);
    visiting.delete(id);
    complete.add(id);
  }
  for (const id of byId.keys()) visit(id, []);
}

/** Ready in this authored plan only; does not inspect or modify the global program board. */
export function readyLivingWorldTasks(program) {
  const tasks = Array.isArray(program?.tasks) ? program.tasks : [];
  const byId = new Map(tasks.map(task => [task.id, task]));
  return tasks.filter(task => task.status === 'planned'
    && Array.isArray(task.dependsOn)
    && task.dependsOn.every(id => byId.get(id)?.status === 'implemented'))
    .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
}

export function livingWorldDistrictBrief(district, program) {
  return {
    notice: AUTHORING_NOTICE,
    district,
    tasks: program.tasks.filter(task => task.districtIds.includes(district.id)),
    ownerCrosswalk: [
      ...district.resources.map(row => ({ kind: 'resource', id: row.id, owner: row.owner, path: row.path })),
      ...district.routines.map(row => ({ kind: 'routine', id: row.id, owner: row.owner, path: row.path })),
    ],
  };
}

export function renderLivingWorldDistrictBrief(brief) {
  const { district: d, tasks, ownerCrosswalk } = brief;
  const lines = [
    `# ${d.name} (${d.id})`, '', AUTHORING_NOTICE, '',
    `Sector: ${d.sectorId}`, `Existing zones: ${d.zoneIds.join(', ')}`, '',
    '## Premise', d.premise, '', '## Arrival', d.arrival, '', '## Geometry', d.geometry, '',
    `## Landmark: ${d.landmark.name}`, `Existing reference: ${d.landmark.existingRef ?? 'planned'}`, d.landmark.change, '',
    '## Population proposal', `Normal live demand: ${d.population.normalActive}; alert: ${d.population.alertActive}; finite reserve: ${d.population.reserve}; shared hard cap: ${d.population.sharedCap}. These are plan budgets, not measured performance or guaranteed slot grants.`,
    d.population.admission || 'The existing runtime default is 24 shared slots. This plan does not change it or guarantee a district its entire envelope.', '',
    '## Resources',
  ];
  for (const r of d.resources) lines.push(`- ${r.id}: ${r.description} [${r.owner}: ${r.path}]`);
  lines.push('', '## Visible routines');
  for (const r of d.routines) lines.push('', `### ${r.id}: ${r.role}`, `Owner: ${r.owner} (${r.path})`, `Setup dependencies: ${r.dependsOn.join(', ') || 'none'}`, `Inputs: ${r.inputResourceIds.join(', ') || 'none'}`, `Outputs: ${r.outputResourceIds.join(', ') || 'none'}`, ...r.visibleSteps.map((step, i) => `${i + 1}. ${step}`), `Interruption: ${r.interruption}`, `Recovery: ${r.recovery}`);
  lines.push('', '## Opportunities');
  for (const o of d.opportunities) lines.push('', `### ${o.id}: ${o.title}`, ...o.approaches.map(approach => `- ${approach}`), `Committed outcome: ${o.commitReceipt}`, `Failure: ${o.failure}`, `Return visit: ${o.revisit}`);
  lines.push('', '## Asset work');
  for (const a of d.assets) lines.push(`- ${a.id} [${a.status}${a.sourcePath ? `; ${a.sourcePath}` : ''}]: ${a.brief}`);
  lines.push('', '## Acceptance routes');
  for (const a of d.acceptance) lines.push(`- ${a.id}: ${a.action}`, `  Expected: ${a.expected}`, `  Negative case: ${a.negative}`);
  lines.push('', '## Owner crosswalk');
  for (const owner of ownerCrosswalk) lines.push(`- ${owner.kind} ${owner.id} -> ${owner.owner}: ${owner.path}`);
  lines.push('', '## Source reading', ...d.sourcePaths.map(path => `- ${path}`), '', '## Work packets');
  for (const task of tasks) lines.push(`- ${task.id} [${task.status}]: ${task.title} (${task.packet}); depends on ${task.dependsOn.join(', ') || 'nothing'}`);
  return `${lines.join('\n')}\n`;
}
