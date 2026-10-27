import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  AUTHORING_NOTICE, canonicalLivingWorldReferences, isRepoRelativePath,
  validateLivingWorldPlan, readyLivingWorldTasks,
  livingWorldDistrictBrief, renderLivingWorldDistrictBrief,
} from '../scripts/lib/livingWorldPlan.mjs';
import { parseLivingWorldArgs, runLivingWorld } from '../scripts/living-world.mjs';

function fixture() {
  const districts = {
    schemaVersion: 1, campaignId: 'test_reach', sourceBase: 'a'.repeat(40), status: 'authored_plan',
    districts: [{
      id: 'district_fixture', name: 'Working Berth', sectorId: 'sector_helios_prime',
      zoneIds: ['zone_helios_core'], status: 'planned', premise: 'A clinic relies on a visible freight route.',
      geometry: 'A public lane and a service loop share a real receiver.', arrival: 'The pilot follows the next coolant tug.',
      landmark: { name: 'Clinic Gantry', existingRef: 'station_helios', change: 'Reopen its damaged receiver.' },
      population: { normalActive: 4, alertActive: 6, reserve: 10, sharedCap: 24 },
      resources: [
        { id: 'coolant', owner: 'cargo', path: 'src/systems/cargo.js', description: 'Finite coolant held by the actual freighter.' },
        { id: 'empties', owner: 'cargo', path: 'src/systems/cargo.js', description: 'Spent canisters returned for refilling.' },
      ],
      routines: [{
        id: 'delivery', role: 'Coolant tender', owner: 'npcJobsRuntime', path: 'src/systems/npcJobsRuntime.js',
        inputResourceIds: ['coolant'], outputResourceIds: ['empties'], dependsOn: [],
        visibleSteps: ['Load a finite lot.', 'Fly to the clinic.', 'Unload only when the receiver accepts it.'],
        interruption: 'A blocked receiver makes the tender hold.', recovery: 'Clear the lane or tow to another admitted berth.',
      }],
      opportunities: [{
        id: 'work_coolant', title: 'Keep the clinic supplied', approaches: ['Escort the tender.', 'Tow the lot through the service loop.'],
        commitReceipt: 'Cargo owner confirms receipt of the exact lot.', failure: 'A lost lot reduces the shelf.', revisit: 'The clinic operates or remains short.',
      }],
      assets: [{ id: 'clinic_gantry', status: 'planned', sourcePath: null, brief: 'A repairable side receiver.' }],
      sourcePaths: ['src/systems/cargo.js', 'src/systems/npcJobsRuntime.js'],
      acceptance: [{ id: 'deliver', action: 'Bring the lot to the clinic.', expected: 'One accepted transfer.', negative: 'An empty tug is not credited.' }],
    }],
  };
  const task = (id, dependsOn, status = 'planned') => ({
    id, title: `Task ${id}`, status, dependsOn, districtIds: ['district_fixture'], packet: `tasks/${id}.md`,
    outcome: 'A physically completed delivery and a saved consequence.', ownerPaths: ['src/systems/npcJobsRuntime.js'],
    checks: ['node --test test/living-world-plan.test.mjs'], priority: Number(id.slice(3)),
  });
  const program = { schemaVersion: 1, campaignId: 'test_reach', tasks: [task('LW-00', [], 'implemented'), task('LW-01', ['LW-00']), task('LW-02', ['LW-01'])] };
  return { districts, program };
}

const validate = ({ districts, program }, options = {}) => validateLivingWorldPlan(districts, program, { fileExists: () => true, ...options });
const has = (result, code) => result.issues.some(issue => issue.code === code);

test('valid plan resolves existing geography and preserves an explicit authoring boundary', () => {
  const result = validate(fixture());
  assert.equal(result.ok, true);
  assert.equal(result.notice, AUTHORING_NOTICE);
  assert.deepEqual(result.counts, { districts: 1, routines: 1, opportunities: 1, tasks: 3, implementedAuthoringTasks: 1 });
});

test('canonical references reject nonexistent sectors and zones assigned to the wrong sector', () => {
  const value = fixture();
  value.districts.districts[0].sectorId = 'sector_missing';
  assert.equal(has(validate(value), 'unknown_sector'), true);
  value.districts.districts[0].sectorId = 'sector_ceres_belt';
  assert.equal(has(validate(value), 'unknown_zone'), true);
  const refs = canonicalLivingWorldReferences();
  assert.equal(refs.zonesBySector.get('sector_helios_prime').has('zone_helios_core'), true);
});

test('duplicate district, routine, and task IDs are not silently overwritten', () => {
  const value = fixture();
  value.districts.districts.push(structuredClone(value.districts.districts[0]));
  value.districts.districts[0].routines.push(structuredClone(value.districts.districts[0].routines[0]));
  value.program.tasks.push(structuredClone(value.program.tasks[0]));
  const result = validate(value);
  assert.equal(result.ok, false);
  assert.equal(result.issues.filter(issue => issue.code === 'duplicate_id').length, 3);
});

test('setup dependency cycles and unbound resources are rejected', () => {
  const value = fixture();
  const routines = value.districts.districts[0].routines;
  routines.push({ ...structuredClone(routines[0]), id: 'refill', dependsOn: ['delivery'] });
  routines[0].dependsOn = ['refill'];
  routines[0].inputResourceIds = ['invented_cargo'];
  const result = validate(value);
  assert.equal(has(result, 'dependency_cycle'), true);
  assert.equal(has(result, 'unknown_reference'), true);
});

test('resource recycling is legal without a cyclic setup dependency', () => {
  const value = fixture();
  const routines = value.districts.districts[0].routines;
  routines.push({ ...structuredClone(routines[0]), id: 'refill', dependsOn: [], inputResourceIds: ['empties'], outputResourceIds: ['coolant'] });
  assert.equal(validate(value).ok, true);
});

test('missing task dependencies, district references, and task cycles fail', () => {
  const value = fixture();
  value.program.tasks[1].dependsOn = ['LW-02', 'LW-99'];
  value.program.tasks[2].districtIds = ['district_missing'];
  const result = validate(value);
  assert.equal(has(result, 'unknown_reference'), true);
  assert.equal(has(result, 'dependency_cycle'), true);
});

test('budget bounds reject nonfinite, negative, fractional, and over-cap live demand', () => {
  for (const change of [{ normalActive: NaN }, { reserve: -1 }, { alertActive: 1.5 }, { normalActive: 25 }, { sharedCap: 41 }, { sharedCap: 0 }]) {
    const value = fixture();
    Object.assign(value.districts.districts[0].population, change);
    assert.equal(validate(value).ok, false, JSON.stringify(change));
  }
  const value = fixture();
  value.districts.districts[0].population.reserve = 60;
  assert.equal(validate(value).ok, true, 'offscreen finite reserve is not simultaneous live demand');
});

test('a hard-ceiling envelope above the normal shared cap needs explicit admission context', () => {
  const value = fixture();
  const district = value.districts.districts[0];
  Object.assign(district.population, { sharedCap: 40, alertActive: 32 });
  assert.equal(has(validate(value), 'budget_admission'), true);
  district.population.admission = 'Planning envelope; coordinate other owners and measure before changing the 24-slot default.';
  assert.equal(validate(value).ok, true);
  assert.ok(renderLivingWorldDistrictBrief(livingWorldDistrictBrief(district, value.program)).includes(district.population.admission));
});

test('opportunities need distinct approaches and committed, failed, and revisit outcomes', () => {
  const value = fixture();
  const opportunity = value.districts.districts[0].opportunities[0];
  opportunity.approaches = ['Tow.', 'Tow.'];
  opportunity.commitReceipt = '';
  opportunity.failure = null;
  opportunity.revisit = '   ';
  const result = validate(value);
  assert.equal(has(result, 'duplicate_approach'), true);
  assert.equal(result.issues.filter(issue => issue.code === 'required_text').length, 3);
});

test('planned models do not require nonexistent files, but reuse requires an existing source path', () => {
  const value = fixture();
  assert.equal(validate(value).ok, true);
  value.districts.districts[0].assets[0].status = 'reuse';
  assert.equal(has(validate(value), 'invalid_path'), true);
  value.districts.districts[0].assets[0].sourcePath = 'assets/ships/parts/places/clinic.glb';
  assert.equal(has(validate(value, { fileExists: path => !path.endsWith('clinic.glb') }), 'missing_source'), true);
  value.districts.districts[0].assets[0].sourcePath = 'src/data/worldSiteManifests.js';
  assert.equal(validate(value).ok, true, 'an existing declaration source is valid; this does not claim a specific GLB ships or is registered');
});

test('resource and routine owners cannot refer to absent files behind other valid source paths', () => {
  for (const kind of ['resources', 'routines']) {
    const value = fixture();
    value.districts.districts[0][kind][0].path = 'src/systems/missingOwner.js';
    const result = validate(value, { fileExists: path => path !== 'src/systems/missingOwner.js' });
    assert.equal(has(result, 'missing_source'), true, kind);
  }
});

test('opportunity identities are global across districts while reusable assets may be shared', () => {
  const value = fixture();
  const second = structuredClone(value.districts.districts[0]);
  second.id = 'district_fixture_second';
  value.districts.districts.push(second);
  assert.equal(has(validate(value), 'duplicate_opportunity_id'), true);
  second.opportunities[0].id = 'work_coolant_second';
  assert.equal(validate(value).ok, true, 'same reusable asset ID may appear in multiple district briefs');
});

test('source reading and task packets must exist; traversal paths are refused', () => {
  const value = fixture();
  assert.equal(has(validate(value, { fileExists: path => path !== 'src/systems/cargo.js' }), 'missing_source'), true);
  assert.equal(has(validate(value, { fileExists: path => !path.includes('tasks/LW-02.md') }), 'missing_packet'), true);
  for (const unsafe of ['/etc/passwd', '../AGENTS.md', 'src/../AGENTS.md', 'C:/repo/file', 'src\\file', 'src//file']) assert.equal(isRepoRelativePath(unsafe), false);
  value.program.tasks[1].packet = '../AGENTS.md';
  assert.equal(has(validate(value), 'packet_path'), true);
});

test('a plan cannot self-label its districts runtime accepted or hide unfinished dependencies', () => {
  const value = fixture();
  value.districts.status = 'live';
  value.districts.districts[0].status = 'route_accepted';
  value.program.tasks[2].status = 'implemented';
  const result = validate(value);
  assert.equal(has(result, 'plan_status'), true);
  assert.equal(has(result, 'district_status'), true);
  assert.equal(has(result, 'incomplete_dependency'), true);
});

test('malformed documents fail with diagnostics rather than crashing', () => {
  for (const bad of [null, [], false]) assert.equal(validateLivingWorldPlan(bad, {}).ok, false);
  const value = fixture();
  value.districts.districts[0].opportunities[0].approaches = { map: 'invalid' };
  value.districts.districts[0].routines = [null, 'not an object'];
  value.program.tasks[1].dependsOn = false;
  assert.equal(validate(value).ok, false);
});

test('ready task selection is deterministic, read-only, and follows all declared dependencies', () => {
  const value = fixture();
  const before = structuredClone(value);
  assert.deepEqual(readyLivingWorldTasks(value.program).map(row => row.id), ['LW-01']);
  assert.deepEqual(value, before);
  value.program.tasks[1].status = 'implemented';
  assert.deepEqual(readyLivingWorldTasks(value.program).map(row => row.id), ['LW-02']);
});

test('district briefing includes real owner crosswalk, intervention, recovery, and complete authoring data', () => {
  const value = fixture();
  const brief = livingWorldDistrictBrief(value.districts.districts[0], value.program);
  const text = renderLivingWorldDistrictBrief(brief);
  assert.equal(brief.ownerCrosswalk.find(row => row.kind === 'routine').path, 'src/systems/npcJobsRuntime.js');
  for (const expected of ['A blocked receiver makes the tender hold.', 'Clear the lane or tow to another admitted berth.', 'An empty tug is not credited.', 'The clinic operates or remains short.', 'tasks/LW-01.md']) assert.ok(text.includes(expected), expected);
});

test('CLI selects a single action and rejects unknown or ambiguous requests', () => {
  assert.deepEqual(parseLivingWorldArgs(['--district=district_fixture', '--json']), { action: 'district', id: 'district_fixture', json: true });
  assert.equal(parseLivingWorldArgs(['--task', 'LW-01']).id, 'LW-01');
  for (const args of [['--next', '--validate'], ['--task'], ['--unsafe'], ['--district=']]) assert.throws(() => parseLivingWorldArgs(args));
});

test('CLI validates, prints the entire task, and lists readiness without changing its files', () => {
  const root = mkdtempSync(join(tmpdir(), 'spaceface-living-world-test-'));
  try {
    const value = fixture();
    const write = (relative, content) => { const path = join(root, relative); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, content); };
    write('design/program/living-world/districts.json', JSON.stringify(value.districts));
    write('design/program/living-world/program.json', JSON.stringify(value.program));
    for (const path of value.districts.districts[0].sourcePaths) write(path, '// fixture\n');
    for (const task of value.program.tasks) write(`design/program/living-world/${task.packet}`, `# ${task.id}\nThe complete work packet, including its final recovery condition.\n`);
    const manifestBefore = readFileSync(join(root, 'design/program/living-world/program.json'), 'utf8');
    for (const args of [['--validate', '--json'], ['--task=LW-01', '--json'], ['--next', '--json'], ['--district=district_fixture', '--json']]) {
      let output = ''; let errors = '';
      assert.equal(runLivingWorld(args, { root, write: text => { output += text; }, error: text => { errors += text; } }), 0, errors);
      const result = JSON.parse(output);
      assert.equal(result.notice, AUTHORING_NOTICE);
      if (args[0] === '--task=LW-01') assert.ok(result.packet.includes('final recovery condition'));
      if (args[0] === '--next') assert.deepEqual(result.tasks.map(row => row.id), ['LW-01']);
    }
    assert.equal(readFileSync(join(root, 'design/program/living-world/program.json'), 'utf8'), manifestBefore);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a task-packet symlink cannot make the reader leave its repository', () => {
  const root = mkdtempSync(join(tmpdir(), 'spaceface-living-world-root-'));
  const external = mkdtempSync(join(tmpdir(), 'spaceface-living-world-outside-'));
  try {
    const value = fixture();
    const write = (relative, content) => { const path = join(root, relative); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, content); };
    for (const path of value.districts.districts[0].sourcePaths) write(path, '// fixture\n');
    write('design/program/living-world/tasks/LW-00.md', '# foundation\n');
    write('design/program/living-world/tasks/LW-02.md', '# followup\n');
    const target = join(external, 'outside.md');
    writeFileSync(target, 'Outside repository.');
    symlinkSync(target, join(root, 'design/program/living-world/tasks/LW-01.md'));
    const result = validateLivingWorldPlan(value.districts, value.program, { root });
    assert.equal(has(result, 'missing_packet'), true);
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(external, { recursive: true, force: true }); }
});
