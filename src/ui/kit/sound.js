// Semantic cues only. The existing audio system owns context, routing, mute and voices.
import { RECIPES } from '../../data/audioRecipes.js';
import { installKitPalette } from './palette.js';

export const CUE_IDS = Object.freeze({
  open: 'ui_open', close: 'ui_back', move: 'ui_tab', confirm: 'ui_confirm', deny: 'ui_deny',
});
let binding = null;

/** Opt in at the kit owner's lifetime, then call the returned disposer on teardown.
 * Dock, undock and wanted keep their existing authoritative emitters. Installing their
 * profile here does not emit those events or introduce a second sound on them.
 */
export function bindSound(bus, { recipes = RECIPES } = {}) {
  if (typeof bus?.emit !== 'function') throw new TypeError('kit.bindSound requires the event bus');
  // Validate/acquire before releasing the old binding: an invalid replacement changes nothing.
  const restore = installKitPalette(recipes);
  binding?.dispose();
  const owner = { bus, dispose: null };
  let disposed = false;
  owner.dispose = () => {
    if (disposed) return;
    disposed = true;
    restore();
    if (binding === owner) binding = null;
  };
  binding = owner;
  return owner.dispose;
}

export function cue(name, { changed = true } = {}) {
  const id = CUE_IDS[name];
  if (!id) throw new RangeError(`Unknown kit sound cue: ${name}`);
  if (!binding || !changed) return false;
  binding.bus.emit('audio:cue', { id, gain: name === 'move' ? 0.25 : 0.6 });
  return true;
}
