// Per-GL-context loss generation, shared by every shader-readiness poll.
//
// gl.isProgram() is a synchronous round trip to the GPU process. Asked for every pending program on
// every readiness poll, it was ~9 s of main thread during New Game loading (2026-09-13 launch profile,
// warm caches); rate-limited per waiter it was still 2.5 s, because dozens of waits were live at once.
// Handle validity therefore comes from the context-loss event and one native recheck budget that every
// waiter on a context shares: at most one isProgram() per gap, never one per program per poll.
const PROGRAM_HANDLE_RECHECK_DELAY_MS = 1000;
export const PROGRAM_HANDLE_RECHECK_GAP_MS = 250;
const programHandleContexts = new WeakMap();

export function programHandleContext(gl) {
  let record = programHandleContexts.get(gl);
  if (!record) {
    record = { generation: 0, nextNativeCheckAt: Date.now() + PROGRAM_HANDLE_RECHECK_DELAY_MS };
    programHandleContexts.set(gl, record);
    const canvas = gl.canvas;
    if (canvas && typeof canvas.addEventListener === 'function') {
      // Bumped by the canvas's own event, so a context lost and restored between polls is still seen.
      canvas.addEventListener('webglcontextlost', () => { record.generation += 1; }, false);
    }
  }
  return record;
}

export function contextLossGeneration(gl) {
  return gl && typeof gl === 'object' ? programHandleContext(gl).generation : 0;
}
