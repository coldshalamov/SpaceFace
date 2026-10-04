import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveForgePublishHooks } from '../tools/blender/forge/publishHooks.mjs';

const channels = [{ id: 'MAIN_PORT', coreHook: 'HOOK_CERES_THRUSTER_MAIN_PORT',
  coreMeshes: [0, 1, 2].map(lod => `LOD${lod}_HOOK_CERES_THRUSTER_MAIN_PORT_glow_drive`) }];
const source = () => ({
  asset: { extras: { ceresWorkfleet: { propulsion: { channels } } } },
  nodes: channels[0].coreMeshes.map((name, mesh) => ({ name, mesh })),
  meshes: channels[0].coreMeshes.map(() => ({ primitives: [{ attributes: { POSITION: 0 } }] })),
  accessors: [{ count: 3 }],
});

test('ordinary Forge ship and place hook defaults remain unchanged', () => {
  assert.deepEqual(resolveForgePublishHooks({ layout: 'npc' }, {}), ['HOOK_DRIVE_CORE']);
  assert.deepEqual(resolveForgePublishHooks({ layout: 'player' }, {}), ['HOOK_DRIVE_CORE']);
  assert.deepEqual(resolveForgePublishHooks({ layout: 'place' }, {}), []);
});

test('explicit per-channel hook contract validates actual separate mesh nodes at every LOD', () => {
  for (const layout of ['npc', 'place']) {
    const entry = { layout, hooks: channels[0].coreMeshes };
    assert.deepEqual(resolveForgePublishHooks(entry, source()), entry.hooks);
    assert.notEqual(resolveForgePublishHooks(entry, source()), entry.hooks);
    assert.throws(() => resolveForgePublishHooks({ ...entry, hooks: entry.hooks.slice(0, 2) }, source()), /omit an authored LOD/);
  }
});

test('empty, malformed, missing, duplicate and non-render hook overrides fail closed', () => {
  for (const layout of ['npc', 'place']) for (const hooks of [[], null, '', [''], ['bad'], ['HOOK_X', 'HOOK_X']]) {
    assert.throws(() => resolveForgePublishHooks({ layout, hooks }, source()), /nonempty, unique/);
  }
  assert.throws(() => resolveForgePublishHooks({ layout: 'npc', hooks: ['HOOK_DRIVE_CORE'] }, source()), /real render mesh/);
  for (const mutation of [doc => { delete doc.nodes[0].mesh; }, doc => { doc.nodes.push({ ...doc.nodes[0] }); },
    doc => { doc.meshes[0].primitives = []; }, doc => { doc.nodes[0].extras = { nonRender: true }; },
    doc => { doc.accessors[0].count = 0; }]) {
    const doc = source(); mutation(doc);
    assert.throws(() => resolveForgePublishHooks({ layout: 'npc', hooks: channels[0].coreMeshes }, doc), /real render mesh/);
  }
});
