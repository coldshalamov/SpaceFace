#!/usr/bin/env node
// Runs plan verification steps 1-6 and writes full transcripts to scratch.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRATCH = process.env.PLACE_IDENTITY_SCRATCH
  || 'C:/Users/93rob/AppData/Local/Temp/grok-goal-8330956f5882/implementer';
mkdirSync(SCRATCH, { recursive: true });

function run(label, cmd, args, outFile, env = {}, options = {}) {
  const result = spawnSync(cmd, args, {
    cwd: ROOT, encoding: 'utf8', env: { ...process.env, ...env },
    shell: options.shell === true,
  });
  const body = [
    `# ${label}`,
    `command: ${cmd} ${args.join(' ')}`,
    `exit: ${result.status}`,
    '--- stdout ---',
    result.stdout || '',
    '--- stderr ---',
    result.stderr || '',
  ].join('\n');
  writeFileSync(resolve(SCRATCH, outFile), body);
  return result.status === 0;
}

function listConceptTree() {
  const base = resolve(ROOT, 'assets/concept');
  const lines = [];
  function walk(dir, prefix = '') {
    for (const name of readdirSync(dir)) {
      const abs = resolve(dir, name);
      const rel = `${prefix}${name}`;
      if (statSync(abs).isDirectory()) walk(abs, `${rel}/`);
      else if (/\.(jpg|png)$/i.test(name)) lines.push(rel);
    }
  }
  walk(base);
  return lines.sort();
}

// Step 1 — pipeline audit
const pipelineFiles = [
  'design/world-identity/PIPELINE.md',
  'design/world-identity/STORY_SECTOR_MAP.md',
  'design/world-identity/SECTOR_STYLE_INDEX.md',
  'design/world-identity/WORLD_NAVIGATION_SPEC.md',
  'design/world-identity/place-identity-index.json',
  'assets/ships/parts/blender/authoring.json',
  'docs/worldbuilding/story/PLACE-IDENTITY-GAP-FILL.md',
  'scripts/author-place-archetype.mjs',
  'scripts/promote-place-archetype.mjs',
  'scripts/check-place-concept-resemblance.mjs',
  'scripts/lib/silhouette-raster.mjs',
  'assets/ships/parts/blender/iteration_ledger.json',
  'design/world-identity/BLENDER_ITERATION_EVIDENCE.md',
  'scripts/export-place-silhouette-audit.mjs',
  'tools/art/blender/author_place_archetype.py',
  'src/data/sectorAnchors.js',
  'src/systems/world.js',
  'src/render/partsLibrary.js',
  'src/render/visualOverrides.js',
].filter((p) => existsSync(resolve(ROOT, p)));
writeFileSync(resolve(SCRATCH, 'pipeline-audit.txt'), `${pipelineFiles.join('\n')}\n`);

// Step 2 — sector spec audit
const sectorSpecs = readdirSync(resolve(ROOT, 'design/world-identity/sectors'))
  .filter((f) => f.endsWith('.md'));
writeFileSync(resolve(SCRATCH, 'sector-spec-audit.txt'),
  `sector spec files: ${sectorSpecs.length}\n${sectorSpecs.join('\n')}\n`);

// Step 3 — concept art index
const conceptLines = listConceptTree();
const idx = JSON.parse(readFileSync(resolve(ROOT, 'assets/concept/index.json'), 'utf8'));
const wiredRenderables = (idx.entries || []).filter((e) => e.blender_part_id).length;
const conceptBody = [
  `indexed entries: ${idx.entries.length}`,
  `wired blender_part_id: ${wiredRenderables}`,
  `on-disk images: ${conceptLines.length}`,
  '',
  ...conceptLines,
].join('\n');
writeFileSync(resolve(SCRATCH, 'concept-art-index.txt'), `${conceptBody}\n`);
const okConcept = run('concept-index check', process.execPath, ['scripts/check-concept-index.mjs'],
  'concept-index-check.log');

// Step 4 — geography
const okGeo = run('sector-geography', process.execPath, ['scripts/check-sector-geography.mjs'],
  'geography-check.log');

// Step 5 — concept↔GLB silhouette gate + glb-load verbose transcript + check:art
const resemblanceTranscript = resolve(SCRATCH, 'place-concept-resemblance.log');
const okResemblance = run('place-concept-resemblance', process.execPath,
  ['scripts/check-place-concept-resemblance.mjs', '--verbose'],
  'place-concept-resemblance.log',
  { PLACE_IDENTITY_TRANSCRIPT: resemblanceTranscript });

const glbTranscript = resolve(SCRATCH, 'station-archetype-glb-load.log');
const okGlb = run('station-archetype-glb-load', process.execPath,
  ['scripts/check-station-archetype-glb-load.mjs', '--verbose'],
  'station-archetype-glb-load.log',
  { PLACE_IDENTITY_TRANSCRIPT: glbTranscript });

const okSilhouetteAudit = run('export-place-silhouette-audit', process.execPath,
  ['scripts/export-place-silhouette-audit.mjs'], 'silhouette-visual-audit-run.log');

const okLiveProbe = run('probe-station-archetypes-live', process.execPath,
  ['scripts/probe-station-archetypes-live.mjs'], 'station-archetype-live-probe-run.log');

const okArt = run('check:art', 'npm', ['run', 'check:art'], 'check-art.log', {}, { shell: process.platform === 'win32' });

// Step 6 — story sector map
writeFileSync(resolve(SCRATCH, 'story-sector-map.txt'),
  'design/world-identity/STORY_SECTOR_MAP.md\n'
  + 'docs/worldbuilding/story/PLACE-IDENTITY-GAP-FILL.md (city districts + landmark vignettes)\n');

// Navigation spec feature count
const nav = readFileSync(resolve(ROOT, 'design/world-identity/WORLD_NAVIGATION_SPEC.md'), 'utf8');
const featureCount = (nav.match(/^### \d+\./gm) || []).length;
writeFileSync(resolve(SCRATCH, 'world-navigation-audit.txt'),
  `Eve-inspired features documented: ${featureCount}\npath: design/world-identity/WORLD_NAVIGATION_SPEC.md\n`);

// Blender iteration evidence pointer
writeFileSync(resolve(SCRATCH, 'blender-vertical-slice.log'), readFileSync(
  resolve(ROOT, 'assets/ships/parts/blender/authoring.json'), 'utf8'));

const allOk = okConcept && okGeo && okResemblance && okGlb && okSilhouetteAudit && okLiveProbe && okArt;
writeFileSync(resolve(SCRATCH, 'verify-place-identity-summary.txt'),
  `verify-place-identity-slice: ${allOk ? 'PASS' : 'FAIL'}\n`
  + `concept=${okConcept} geo=${okGeo} resemblance=${okResemblance} glb=${okGlb} silhouetteAudit=${okSilhouetteAudit} liveProbe=${okLiveProbe} art=${okArt} navFeatures=${featureCount}\n`
  + `PLACE-IDENTITY-GAP-FILL exists=${existsSync(resolve(ROOT, 'docs/worldbuilding/story/PLACE-IDENTITY-GAP-FILL.md'))}\n`
  + `wiredRenderables=${wiredRenderables}\n`);
console.log(readFileSync(resolve(SCRATCH, 'verify-place-identity-summary.txt'), 'utf8'));
process.exit(allOk ? 0 : 1);