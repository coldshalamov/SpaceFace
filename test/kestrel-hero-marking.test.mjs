import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// The Hitch (internal id kestrel) wears DIE LAUGHING: a hand-cut stencil in warm-ivory lacquer on the
// aft port armour course (design/graphics-sprints/TOP_FIVE_MATERIAL_TRUTH_PLAN.md §1). The Forge
// rebuild once dropped it; this pins both the recipe and the shipped body so it cannot vanish again.

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

function glbJson(path) {
  const b = readFileSync(new URL(`../${path}`, import.meta.url));
  return JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString('utf8'));
}

test('the Kestrel recipe stamps DIE LAUGHING through the stencil kit', () => {
  const recipe = read('tools/blender/forge/ships/kestrel.py');
  assert.match(recipe, /import stencil/, 'kestrel.py must use the stencil kit');
  assert.match(recipe, /stencil\.stamp\(/, 'kestrel.py must stamp the hero marking');
  assert.match(recipe, /'DIE'/);
  assert.match(recipe, /'LAUGHING'/);
  assert.match(recipe, /'Sponson'/, 'the marking sits on the port sponson armour course');
  assert.match(recipe, /angle=math\.pi/, 'the marking is turned to read upright at the spawn heading (nose screen-left under the chase camera)');
  assert.doesNotMatch(recipe, /NameBoard/, 'the blank ivory plaque is replaced by the stencil');
});

test('the stencil kit draws every letter DIE LAUGHING needs', () => {
  const kit = read('tools/blender/forge/stencil.py');
  for (const ch of new Set('DIELAUGHING')) {
    assert.match(kit, new RegExp(`^    '${ch}': \\(`, 'm'), `stencil glyph ${ch} missing`);
  }
});

test('the shipped LOD0 body carries the lettering on the aft port armour course', () => {
  const json = glbJson('assets/ships/parts/wholeships/kestrel.glb');
  const node = json.nodes.find((n) => n.name === 'LOD0_Armor_ivory');
  assert.ok(node && node.mesh !== undefined, 'LOD0_Armor_ivory (the marking) must ship in the Hitch');
  const prims = json.meshes[node.mesh].primitives;
  const tris = prims.reduce((n, p) => n + json.accessors[p.indices].count / 3, 0);
  // 11 letters of islands + overspray: hundreds of triangles; a blank plaque is a dozen.
  assert.ok(tris >= 400 && tris <= 1200, `marking triangles ${tris} out of the stencil band`);
  // glTF frame (x nose, y up, z starboard): aft port armour course is x -7.4..-3.8, z -5.7..-3.4.
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const p of prims) {
    const a = json.accessors[p.attributes.POSITION];
    for (let i = 0; i < 3; i += 1) {
      min[i] = Math.min(min[i], a.min[i]);
      max[i] = Math.max(max[i], a.max[i]);
    }
  }
  assert.ok(min[0] >= -7.45 && max[0] <= -3.75, `marking x ${min[0]}..${max[0]} off the course`);
  assert.ok(min[2] >= -5.75 && max[2] <= -3.35, `marking z ${min[2]}..${max[2]} off the course`);
  assert.ok(max[1] - min[1] < 0.1, 'the marking is a thin lacquer film, not a raised plaque');
});
