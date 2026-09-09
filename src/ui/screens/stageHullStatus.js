// The screenshot-ready flag must describe the selected authored ship, never a timer or an old swap.
export function createStageHullStatus(publish) {
  let selected = null;
  let disposed = false;
  let value = Object.freeze({ phase: 'empty', defId: null });
  const set = (phase) => {
    if (disposed) return;
    value = Object.freeze({ phase, defId: selected });
    publish(value);
  };
  return {
    select(defId) { if (disposed) return; selected = defId; set('loading'); },
    drawn(defId, assetState) {
      if (disposed || defId !== selected || !selected || assetState !== 'authored') return false;
      set('ready');
      return true;
    },
    waiting() { if (value.phase === 'loading') set('waiting'); },
    unavailable() { if (value.phase !== 'ready') set('unavailable'); },
    snapshot() { return value; },
    dispose() { disposed = true; },
  };
}
