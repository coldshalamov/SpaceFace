// KIT_SPEC.md §8. The kit adds no audio context, no files and no new ids: it emits the cue ids the
// audio system already maps (src/audio/audioSystem.js AUDIO_CUE_TO_RECIPE) and the eight UI recipes
// in src/data/audioRecipes.js carry the sheet's character.
const CUE_ID = { open: 'ui_open', close: 'ui_back', move: 'ui_tab', confirm: 'ui_confirm', deny: 'ui_deny' };
export const CUE_IDS = Object.freeze({ ...CUE_ID });
let bus = null;
/** Called once from ui.init (§11.1). Returns a disposer that releases the bus. */
export function bindSound(b) {
  bus = b;
  return () => { if (bus === b) bus = null; };
}
export function cue(name) {
  const id = CUE_ID[name]; if (!id) throw new Error(`kit.cue: unknown cue ${name}`);
  bus?.emit('audio:cue', { id, gain: name === 'move' ? 0.25 : 0.6 });
}
