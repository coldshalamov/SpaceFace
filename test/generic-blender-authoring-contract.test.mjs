import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const authoring = JSON.parse(await readFile(
  new URL('../assets/ships/parts/blender/authoring.json', import.meta.url),
  'utf8',
));
const plasma = authoring.entries?.engine_plasma_ring;
assert.equal(plasma?.method, 'blender_generic');
assert.equal(plasma?.texture_role_owner, 'finalizer-v1');
assert.equal(plasma?.exporter_path, 'tools/art/blender/export_sprint_part.py');
assert.match(plasma?.blend_path || '', /engine_plasma_ring_authored\.blend$/);
for (const id of ['engine_plasma_ring', 'greeble_rcs']) {
  const entry = authoring.entries?.[id];
  assert.equal(entry?.current_authoring_route, 'docs/visual-assets/README.md');
  assert.equal(
    entry?.material_truth_skill_path,
    '.grok/skills/spaceface-blender-material-truth/SKILL.md',
  );
  assert.equal(entry?.material_truth_preflight_required, true);
  assert.equal(entry?.exporter_path, 'tools/art/blender/export_sprint_part.py');
  assert.equal('legacy_exporter_path' in entry, false);
}

const wrapper = await readFile(new URL('../tools/art/blender/export_sprint_part.py', import.meta.url), 'utf8');
assert.match(wrapper, /'texture_role_owner': TEXTURE_ROLE_OWNER/,
  'successful wrapper result/log must record the delegated owner');
assert.match(wrapper, /if os\.path\.exists\(OUT\):\s+os\.remove\(OUT\)/,
  'wrapper must delete a stale temporary export before Blender runs');
assert.match(wrapper, /export_stat\.st_mtime_ns < export_started_ns/,
  'wrapper must reject a stale post-export timestamp');

const finalizer = await readFile(new URL('../tools/art/finalize_part.mjs', import.meta.url), 'utf8');
assert.match(finalizer, /texture_role_owner !== 'finalizer-v1'/,
  'generic Blender finalization must require the registered owner handoff');
assert.match(finalizer, /textureRoleContract:\s*\{\s*version:\s*1,/,
  'finalized output must stamp the strict versioned texture-role contract');
assert.match(finalizer, /publishTwoFileTransaction/,
  'delegated temporary output may become canonical only through the transaction publisher');

const checker = await readFile(new URL('../scripts/check-parts-manifest.mjs', import.meta.url), 'utf8');
assert.match(checker, /textureRoleContractVersion === 1/,
  'manifest checker must activate strict role validation for finalized v1 outputs');
assert.match(checker, /validateSourceTextureRoleCoverage\(gltf, label\)/,
  'marked source assets must run the strict role validator');

console.log('PASS generic Blender authoring contract: registry, owner handoff, freshness, marker, checker');
