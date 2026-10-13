// Board row 301 (AUDIO-DEVICE-FOLLOW): the mix follows an output-device change.
//
// A pilot plugs in headphones, a Bluetooth headset connects, the monitor's speakers go away. The
// browser fires `devicechange` on navigator.mediaDevices, and the AudioContext may stop rendering
// (suspended / interrupted) while the old sink is gone. Until now nothing owned that event.
//
// Two ways to get it wrong, both named by the row:
//  - a SILENT LAUNCH: resuming a context the pilot never unlocked. A device event is not a user
//    gesture; an autoplay-blocked context must stay blocked until the existing gesture handler runs.
//  - DOUBLED LOOPS: tearing the context down and building a new one re-creates every sustained
//    voice beside the ones the old context still holds. The context is never rebuilt here; it is
//    resumed, and the lifecycle owner (`_resumeAudioContext`) restarts the schedulers and frame
//    loop it already paused when the context stopped.

export const DEVICE_CHANGE_SETTLE_MS = 400;

/**
 * What an output-device change asks of the audio context.
 * @returns {'none' | 'resume'}
 */
export function planDeviceChange({ ctxState, lifecycleSuspended, everRan, muted } = {}) {
  if (ctxState !== 'suspended' && ctxState !== 'interrupted') return 'none'; // running follows the default sink; closed/absent has nothing to resume
  if (lifecycleSuspended) return 'none'; // the lifecycle owner resumes when the page returns
  if (muted) return 'none';
  if (!everRan) return 'none'; // never unlocked: only a real gesture may start it
  return 'resume';
}

/**
 * Whether the existing context should retarget the OS default output.
 * `setSinkId('')` moves the same graph onto the new default device. It does not
 * build a second context, so sustained loops are not doubled. It is refused
 * until the pilot has already unlocked audio: opening a device is not a gesture.
 * @returns {'none' | 'rebind-default'}
 */
export function planSinkRebind({
  ctxState,
  lifecycleSuspended,
  everRan,
  muted,
  setSinkIdAvailable,
} = {}) {
  if (!setSinkIdAvailable) return 'none';
  if (lifecycleSuspended || muted || !everRan) return 'none';
  if (ctxState !== 'running' && ctxState !== 'suspended' && ctxState !== 'interrupted') return 'none';
  return 'rebind-default';
}

/**
 * Listen for output-device changes and call `onChange` once per burst: plugging a headset fires a
 * handful of events in quick succession, and the new device needs a moment to settle.
 * @returns {() => void} unbind
 */
export function bindOutputDeviceFollow({
  mediaDevices = (typeof navigator !== 'undefined' ? navigator.mediaDevices : null),
  onChange,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  settleMs = DEVICE_CHANGE_SETTLE_MS,
} = {}) {
  if (!mediaDevices || typeof mediaDevices.addEventListener !== 'function' || typeof onChange !== 'function') {
    return () => {};
  }
  let timer = null;
  const handler = () => {
    if (timer !== null) clearTimer(timer);
    timer = setTimer(() => {
      timer = null;
      try { onChange(); } catch (_) { /* a failed follow must never break the frame loop */ }
    }, settleMs);
  };
  mediaDevices.addEventListener('devicechange', handler);
  return () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
    try { mediaDevices.removeEventListener('devicechange', handler); } catch (_) { /* gone with the document */ }
  };
}
