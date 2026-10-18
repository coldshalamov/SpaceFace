import test from 'node:test';
import assert from 'node:assert/strict';

import {
  installProgramBinaryCache,
  programBinaryCacheSize,
} from '../src/render/programBinaryCache.js';

const COMPLETION_STATUS_KHR = 0x91B1;

// Strict fakeGL: program handles are plain objects with an `alive` flag.
// getProgramParameter mirrors the real WebGL/ANGLE contract — a query on a
// deleted handle does not throw; it logs GL_INVALID_VALUE ("Program object
// expected", the exact console line in the 2026-10-18 native-swarm witness) and
// answers null. Every such call is counted in `invalidQueries`.
function fakeGl() {
  const invalidQueries = [];
  const queries = [];
  const binaries = [];
  const gl = {
    deleteProgram(program) { program.alive = false; },
    getProgramParameter(program, pname) {
      queries.push({ program, pname });
      if (!program || program.alive !== true) {
        invalidQueries.push(program);
        return null;
      }
      if (pname === COMPLETION_STATUS_KHR) return program.linked === true;
      if (pname === gl.LINK_STATUS) return program.linked === true;
      return null;
    },
    getProgramBinary() { binaries.push(1); return { format: 1, binary: new Uint8Array(4) }; },
    programBinary() {},
    shaderSource() {},
    attachShader() {},
    linkProgram(program) { program.linked = true; },
    isContextLost() { return false; },
    getExtension(name) {
      if (name === 'KHR_parallel_shader_compile') return { COMPLETION_STATUS_KHR };
      if (name === 'WEBGL_get_program_binary') return { GL_PROGRAM_BINARY_ANGLE: 1 };
      if (name === 'WEBGL_debug_renderer_info') return null;
      return null;
    },
    getParameter() { return 'spaceface-fakeGL'; },
    LINK_STATUS: 0x8B82,
  };
  return { gl, invalidQueries, queries, binaries };
}

function linked(fixture, source) {
  const { gl } = fixture;
  const shader = {};
  const program = { alive: true, linked: false };
  gl.shaderSource(shader, source);
  gl.attachShader(program, shader);
  gl.linkProgram(program);
  return program;
}

const flushDrains = () => new Promise((resolve) => setTimeout(resolve, 60));

test('a program deleted before its harvest drain is never queried on its dead handle', async () => {
  const fixture = fakeGl();
  const { gl, invalidQueries, binaries } = fixture;
  const installed = installProgramBinaryCache(gl);
  assert.equal(installed.ok, true);

  const retired = linked(fixture, 'void main(){ retired(); }');
  // Parent asset retires before the drain runs: three's releaseProgram destroys
  // the wrapper and calls gl.deleteProgram — the handle pending[] still holds
  // is now dead, and no wrapped call tells the cache.
  gl.deleteProgram(retired);

  linked(fixture, 'void main(){ liveA(); }');
  await flushDrains(); // drain 1: harvests liveA, must not query the dead handle
  linked(fixture, 'void main(){ liveB(); }');
  await flushDrains(); // drain 2: a wedged dead entry is re-queried on every drain

  assert.equal(invalidQueries.length, 0,
    `the drain issued ${invalidQueries.length} getProgramParameter call(s) on a deleted `
      + 'program — each one is a GL_INVALID_VALUE "Program object expected" warning');
  assert.ok(binaries.length >= 2, 'live programs still harvest their binary');
});

test('a live link drains once and harvests its binary exactly when complete', async () => {
  const fixture = fakeGl();
  const { gl, invalidQueries, queries, binaries } = fixture;
  installProgramBinaryCache(gl);

  const program = linked(fixture, 'void main(){ first(); }');
  await flushDrains();
  assert.equal(invalidQueries.length, 0);
  assert.equal(binaries.length, 1, 'a completed program is harvested exactly once');
  const sizeAfterFirst = programBinaryCacheSize();
  assert.ok(sizeAfterFirst >= 1, 'the harvested binary entered MEMORY');

  const second = linked(fixture, 'void main(){ second(); }');
  await flushDrains();
  assert.equal(binaries.length, 2, 'a new live link harvests on the next drain');
  assert.ok(programBinaryCacheSize() > sizeAfterFirst);
  // Draining an empty queue queries nothing — the harvest is per-link, not a poll.
  const queriesBefore = queries.length;
  await flushDrains();
  assert.equal(queries.length, queriesBefore);
  assert.equal(program.alive, true);
  assert.equal(second.alive, true);
});
