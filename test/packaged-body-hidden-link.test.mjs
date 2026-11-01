import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installShaderLinkReporter, linkObjectProgramsWhileHidden } from '../src/render/shaderLinkReporter.js';

const LINK_STATUS = 0x8b82;
const fakeGl = () => ({
  LINK_STATUS,
  isContextLost: () => false,
  getProgramParameter: (_p, pname) => (pname === LINK_STATUS ? true : null),
  getProgramInfoLog: () => '',
  getShaderInfoLog: () => '',
});
function fakeProgram(name) {
  let firstUses = 0; let cached;
  const firstUse = () => { if (cached === undefined) { firstUses += 1; cached = {}; } return cached; };
  return {
    name, type: 'MeshStandardMaterial', program: { id: name },
    get firstUses() { return firstUses; },
    getUniforms() { return firstUse(); },
    getAttributes() { return firstUse(); },
  };
}
function setup(hidden) {
  const props = new Map();
  const renderer = {
    debug: { checkShaderErrors: true },
    info: { programs: [] },
    domElement: { addEventListener() {} },
    getContext: () => fakeGl(),
    userData: {},
    properties: { get: (m) => props.get(m) },
  };
  installShaderLinkReporter(renderer);
  renderer.userData.spacefaceHiddenLinkWindow = () => hidden.value;
  const pooled = fakeProgram('Forge_bastion_gunmetal#instanced');
  const plain = fakeProgram('Forge_bastion_gunmetal#plain');
  const unrelated = fakeProgram('Other');
  renderer.info.programs.push(pooled, plain, unrelated);
  const material = { name: 'Forge_ore_barge_paint' };
  props.set(material, { currentProgram: pooled, programs: new Map([['i', pooled], ['p', plain]]) });
  const mesh = { material };
  const root = { traverse(fn) { fn(root); fn(mesh); } };
  return { renderer, root, pooled, plain, unrelated };
}

test('a detached wreck links both its pooled and plain variants while the picture is hidden', () => {
  const hidden = { value: true };
  const { renderer, root, pooled, plain, unrelated } = setup(hidden);
  assert.equal(linkObjectProgramsWhileHidden(renderer, root), 2);
  assert.equal(pooled.firstUses, 1);
  assert.equal(plain.firstUses, 1);
  assert.equal(unrelated.firstUses, 0, 'only the subtree\'s own programs are linked');
  assert.equal(renderer.userData.spacefaceUnusedPrograms.size, 1);
  // already linked: a second admission pays nothing
  assert.equal(linkObjectProgramsWhileHidden(renderer, root), 0);
});

test('no forced link once the veil has released (the draw path keeps today\'s behaviour)', () => {
  const hidden = { value: false };
  const { renderer, root, pooled, plain } = setup(hidden);
  assert.equal(linkObjectProgramsWhileHidden(renderer, root), 0);
  assert.equal(pooled.firstUses + plain.firstUses, 0);
});

test('without a hidden-link window or reporter it is a no-op', () => {
  assert.equal(linkObjectProgramsWhileHidden({ userData: {} }, { traverse() {} }), 0);
  assert.equal(linkObjectProgramsWhileHidden(null, null), 0);
});

test('attachPackagedBody links the detached body after compile and before publication', () => {
  const src = readFileSync(new URL('../src/render/visualFactory.js', import.meta.url), 'utf8');
  const start = src.indexOf('function attachPackagedBody(');
  const body = src.slice(start, src.indexOf('\nfunction ', start + 10));
  const compile = body.indexOf('await prepareAuthoredVisualPipelines(packaged');
  const link = body.indexOf('linkObjectProgramsWhileHidden(renderer, packaged)');
  const publish = body.indexOf('root.add(packaged)');
  assert.ok(compile > 0 && link > compile && publish > link);
  const r = readFileSync(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  assert.match(r, /spacefaceHiddenLinkWindow = hiddenLinkWindow/);
});
