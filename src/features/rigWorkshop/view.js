// Main-realm composition over the existing prompt deck and renderer scene.
// Keep this import out of the authoritative/worker system lookup.
import { createRigWorkshopPresentation } from './presentation.js';
import { createRigWorkshopRender } from './render.js';
import { createRenderFrameMembrane } from '../../render/frameCoordinates.js';

export { buildRigWorkshopBody, isRigWorkshopBody } from './render.js';
export { buildRigWorkshopReadModel } from './presentation.js';

/** Mount once from the existing render owner. It is safe to mount before
 * uiRoot creates promptDeck: pending decisions wait for that ordinary deck.
 * frame() takes the current worker facade, so origin rebases never mutate sim. */
export function createRigWorkshopView({ state, bus, scene, getDeck } = {}) {
  if (!state || !bus || !scene) throw new TypeError('Rig Workshop view needs state, bus and the existing scene');
  const coordinates = createRenderFrameMembrane().reset(state);
  const decisions = createRigWorkshopPresentation({ state, bus, getDeck });
  const marks = createRigWorkshopRender({ scene, toLocalXZ(x, z, out) {
    out.x = x - coordinates.origin.x;
    out.z = z - coordinates.origin.z;
    return out;
  } });
  let disposed = false;
  const promptKey = (prompt) => prompt?.id == null ? null
    : `${String(prompt.id)}:${String(prompt.revision ?? '')}`;
  let lastHydratedPromptKey = promptKey(state.rigWorkshop?.prompt);
  const unsubs = [];
  const listen = (event, callback) => {
    if (!bus.on) return;
    const off = bus.on(event, callback);
    unsubs.push(typeof off === 'function' ? off : () => bus.off?.(event, callback));
  };
  // A live event already offered the page through the presentation adapter.
  // Remember it too, so a delayed mirror cannot resurrect an explicitly closed
  // page that was shown and dismissed between two render frames.
  listen('rigWorkshop:prompt', (prompt) => {
    const key = promptKey(prompt);
    if (key != null) lastHydratedPromptKey = key;
  });
  for (const event of ['game:new', 'game:newGame', 'game:load', 'save:restoring', 'save:loaded']) {
    listen(event, () => { lastHydratedPromptKey = null; });
  }
  return {
    frame(_dt, live = state) {
      if (disposed) return;
      coordinates.sync(live);
      const prompt = live.rigWorkshop?.prompt;
      const key = promptKey(prompt);
      if (key != null && key !== lastHydratedPromptKey) {
        lastHydratedPromptKey = key;
        decisions.show(prompt);
      }
      // Keep the key when the mirror clears the prompt. A stale nonnull tail
      // of that same revision must not reopen a card the pilot already closed.
      decisions.update(live);
      marks.update(live);
    },
    destroy() {
      if (disposed) return;
      disposed = true;
      for (const off of unsubs) off();
      unsubs.length = 0;
      decisions.destroy(); marks.dispose();
    },
  };
}
