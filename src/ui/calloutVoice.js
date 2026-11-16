// One callout voice (design/game/20_THE_FIRST_HOUR.md, rule 2: danger > verb > objective > callout
// > receipts). The Swarm announcer (swarmJuiceHud) and the stunt/first-beat lane (stuntCallout)
// both speak in the centre of the screen; they take turns through this claim so at most one
// callout is up at a time. Pure wall-clock bookkeeping, no DOM.
let liveUntil = 0;
let livePri = 0;
let liveKey = '';
const nowMs = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

/**
 * Ask to speak. Returns true when the line may draw: nothing live, the same key repeating
 * (merges in place), or a priority at least as high as the one live. A lower one is refused.
 */
export function claimCalloutVoice(key, priority, ttlMs) {
  const now = nowMs();
  if (now < liveUntil && liveKey !== key && priority < livePri) return false;
  liveKey = key; livePri = priority; liveUntil = now + ttlMs;
  return true;
}

export function resetCalloutVoice() { liveUntil = 0; livePri = 0; liveKey = ''; }

/** True while a centre callout holds the voice (so a world chip can step aside for that moment). */
export function calloutVoiceLive() { return nowMs() < liveUntil; }
