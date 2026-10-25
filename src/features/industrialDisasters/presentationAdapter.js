import { installIndustrialDisasterPresentation } from './presentation.js';
import { createIndustrialDisasterView } from './render.js';
import { getIndustrialDisasterReadModel } from './runtime.js';

/** Browser-only seam. Mount after the ordinary encounterChoicePrompt and the real render scene;
 * call update(alpha) in render, dispose() with that scene. No alternate input or simulation loop. */
export function createIndustrialDisastersPresentation(ctx, options = {}) {
  const getReadModel = options.getReadModel || getIndustrialDisasterReadModel;
  const prompts = installIndustrialDisasterPresentation({ state: ctx.state, bus: ctx.bus, getReadModel });
  const view = createIndustrialDisasterView({ ...ctx, ...options, getReadModel });
  let disposed = false;
  return {
    update(alpha = 1) { if (!disposed) view.update(alpha); },
    diagnostics() { return view.diagnostics(); },
    isReady() { return view.isReady(); },
    dispose() { if (disposed) return; disposed = true; prompts.dispose(); view.dispose(); },
  };
}
