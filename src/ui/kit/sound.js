// Semantic cues only. The existing audio system owns context, routing, mute and voices.
export const CUE_IDS = Object.freeze({
  open: 'ui_open', close: 'ui_back', move: 'ui_tab', confirm: 'ui_confirm', deny: 'ui_deny',
});
let boundBus = null;
export function bindSound(bus) {
  if (typeof bus?.emit !== 'function') throw new TypeError('kit.bindSound requires the event bus');
  boundBus = bus;
  return () => { if (boundBus === bus) boundBus = null; };
}
export function cue(name) {
  const id = CUE_IDS[name];
  if (!id) throw new RangeError(`Unknown kit sound cue: ${name}`);
  if (!boundBus) return false;
  boundBus.emit('audio:cue', { id, gain: name === 'move' ? 0.25 : 0.6 });
  return true;
}
