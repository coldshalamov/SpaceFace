import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../scripts/capture-blender-fixture-evidence.mjs', import.meta.url), 'utf8');

assert.match(source, /m0-asset-recovery-blender-fixture/,
  'Blender evidence is isolated in its own alpha task');
assert.match(source, /engine_plasma_ring_authored\.blend/,
  'capture starts from the canonical authored Blender source');
assert.match(source, /fixture-root/,
  'capture copies authoring inputs beneath a task-contained fixture root');
assert.match(source, /copyFileSync/,
  'capture copies the blend and core exporter instead of mutating canonical inputs');
assert.match(source, /canonicalWrapper.*export_sprint_part\.py/,
  'capture identifies the canonical standard wrapper as a guarded source input');
assert.match(source, /canonicalRoleHelper.*export_texture_role_mode\.py/,
  'capture identifies the wrapper texture-role helper as a guarded source input');
assert.match(source, /copyFileSync\(canonicalWrapper,\s*fixtureWrapper\)/,
  'capture copies the standard wrapper into the fixture root');
assert.match(source, /copyFileSync\(canonicalRoleHelper,\s*fixtureRoleHelper\)/,
  'capture copies the wrapper helper into the fixture root');
assert.match(source, /['"]--python['"],\s*fixtureWrapper/,
  'Blender executes the copied fixture wrapper, not canonical tooling');
assert.match(source, /withPythonNoBytecodeEnv/,
  'Blender inherits the shared Python bytecode suppression contract');
assert.match(source, /--python-expr/,
  'embedded Blender receives an interpreter-level bytecode suppression prelude');
assert.match(source, /sys\.dont_write_bytecode\s*=\s*True/,
  'embedded Blender disables bytecode before importing the wrapper or fixture exporter');
assert.match(source, /--python-exit-code['"],\s*['"]1/,
  'Blender wrapper failures become nonzero process exits');
assert.match(source, /SF_ROOT:\s*fixtureRoot/,
  'the standard wrapper resolves all authoring paths inside the fixture copy');
assert.match(source, /SF_TEXTURE_ROLE_OWNER:\s*['"]finalizer-v1['"]/,
  'fixture records the delegated texture-role owner explicitly');
assert.match(source, /canonicalBlendHashBefore/,
  'capture hashes canonical source before Blender runs');
assert.match(source, /canonicalBlendHashAfter/,
  'capture hashes canonical source after Blender runs');
assert.match(source, /canonicalWrapperHashBefore/,
  'capture guards dirty canonical wrapper edits before Blender runs');
assert.match(source, /canonicalWrapperHashAfter/,
  'capture verifies canonical wrapper content after Blender runs');
assert.match(source, /canonicalRoleHelperHashBefore/,
  'capture guards dirty canonical helper edits before Blender runs');
assert.match(source, /canonicalRoleHelperHashAfter/,
  'capture verifies canonical helper content after Blender runs');
assert.match(source, /pycSnapshotBefore/,
  'capture snapshots Python caches before Blender runs');
assert.match(source, /pycSnapshotAfter/,
  'capture proves Blender did not add or change Python bytecode');
assert.doesNotMatch(source, /assets[\\/]ships[\\/]release(?:\.|[\\/])/,
  'fixture capture never writes or publishes into release assets');

console.log('PASS Blender fixture evidence contract: isolated copy, no-bytecode wrapper, canonical hash guard');
