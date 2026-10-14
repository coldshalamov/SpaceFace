// One inspection owns one media element. Tokens, not catalog ids, fence asynchronous loads:
// selecting A -> B -> A must not admit the first A's late canplay/error callback.
export function createArmoryPreviewMedia({ motionReduced = () => false } = {}) {
  let token = null;
  let media = null;
  let ready = false;
  let active = true;
  let disposed = false;
  const owns = (candidate) => !disposed && candidate != null && candidate === token;
  const pause = () => { try { media?.pause(); } catch { /* Media may already be detached. */ } };
  const release = () => {
    const previous = media;
    media = null; ready = false;
    if (!previous) return;
    try { previous.pause(); } catch { /* Still release its resource after a failed pause. */ }
    try { previous.removeAttribute('src'); previous.load(); } catch { /* Best-effort teardown. */ }
  };
  const play = () => {
    if (!media || !ready) return;
    if (!active || motionReduced()) { pause(); return; }
    try { media.play()?.catch?.(() => {}); } catch { /* Autoplay denial leaves a still preview. */ }
  };
  return {
    begin() {
      if (disposed) return null;
      token = null; // Revoke before load() can dispatch events from the previous element.
      release();
      token = {};
      return token;
    },
    owns,
    attach(candidate, next) {
      if (!owns(candidate) || !next) return false;
      release();
      media = next;
      media.autoplay = false; // Only the active inspection is allowed to start playback.
      return true;
    },
    ready(candidate, next) {
      if (!owns(candidate) || media !== next) return false;
      ready = true;
      play();
      return true;
    },
    setActive(value) {
      active = !!value;
      if (!active) pause(); else play();
    },
    clear() { token = null; release(); },
    dispose() {
      if (disposed) return;
      disposed = true; token = null;
      release();
    },
  };
}
