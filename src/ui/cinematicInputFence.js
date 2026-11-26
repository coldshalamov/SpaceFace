// Release fence for the first-session cinematic.
//
// The splash becomes the focus owner before any menu screen is opened. Keyboard dismissal waits
// until every physical key involved in the gesture has been released, so native button activation
// cannot leak into the newly focused Main Menu. This module is DOM-light so chord, blur, teardown,
// and pointer/timer races stay behaviorally testable outside the browser.

const SPLASH_FALLBACK_MS = 4500;
const RECOVERED_FILM_WINDOW_MS = 1500;

/** Keep the short poster fallback, with one grace window if the film delivers a late first frame. */
export function armCinematicAutoDismiss({ video, canPresent, onElapsed, host = globalThis }) {
  const now = () => host.performance.now();
  const fallbackAt = now() + SPLASH_FALLBACK_MS;
  let active = true;
  let presented = false;
  let frame = null;
  let listening = false;
  let timer = host.setTimeout(elapse, SPLASH_FALLBACK_MS);

  function stopProof() {
    if (frame !== null) video.cancelVideoFrameCallback?.(frame);
    frame = null;
    if (listening) video.removeEventListener('playing', noteFirstFrame);
    listening = false;
  }

  function cancel() {
    if (!active) return;
    active = false;
    host.clearTimeout(timer);
    stopProof();
  }

  function elapse() {
    if (!active) return;
    cancel();
    onElapsed();
  }

  function noteFirstFrame(_time, metadata) {
    if (!active || presented || !canPresent() || video.paused || video.readyState < 2) return;
    const current = now();
    const firstFrameAt = Math.min(current, metadata?.presentationTime ?? current);
    if (firstFrameAt > fallbackAt) return;
    presented = true;
    stopProof();
    const end = firstFrameAt + RECOVERED_FILM_WINDOW_MS;
    if (end > fallbackAt) {
      host.clearTimeout(timer);
      timer = host.setTimeout(elapse, Math.max(0, end - current));
    }
  }

  function observeFrame(time, metadata) {
    frame = null;
    noteFirstFrame(time, metadata);
    if (active && !presented && now() < fallbackAt) frame = video.requestVideoFrameCallback(observeFrame);
  }

  if (typeof video?.requestVideoFrameCallback === 'function') {
    frame = video.requestVideoFrameCallback(observeFrame);
  } else if (video) {
    listening = true;
    video.addEventListener('playing', noteFirstFrame);
  }
  return cancel;
}

export function createCinematicInputFence({
  keyboardTarget = globalThis,
  visibilityTarget = globalThis.document,
  focusOwner = () => {},
  onFinalize = () => {},
} = {}) {
  if (!keyboardTarget?.addEventListener || !keyboardTarget?.removeEventListener) {
    throw new TypeError('cinematic input fence requires a keyboard event target');
  }
  if (!visibilityTarget?.addEventListener || !visibilityTarget?.removeEventListener) {
    throw new TypeError('cinematic input fence requires a visibility event target');
  }
  if (typeof focusOwner !== 'function' || typeof onFinalize !== 'function') {
    throw new TypeError('cinematic input fence callbacks must be functions');
  }

  const heldPhysicalKeys = new Set();
  let windowFocused = typeof visibilityTarget.hasFocus === 'function'
    ? visibilityTarget.hasFocus()
    : true;
  let documentVisible = visibilityTarget.hidden !== true;
  let state = windowFocused && documentVisible ? 'visible-idle' : 'suspended';
  let initiator = null;
  let initiatorReleased = false;
  let pendingDismissReason = null;
  let closed = false;
  let tornDown = false;

  const isSuspended = () => !windowFocused || !documentVisible;

  const consume = (event) => {
    event?.preventDefault?.();
    event?.stopImmediatePropagation?.();
  };

  const resetIncompleteGesture = () => {
    heldPhysicalKeys.clear();
    initiator = null;
    initiatorReleased = false;
    pendingDismissReason = null;
    if (!closed) state = isSuspended() ? 'suspended' : 'visible-idle';
  };

  // focusOwner() runs a synchronous focus() that fires focus/focusin inside this call. Any other
  // focus trap on the document (e.g. a modal's focusin tether) can answer with its own focus(),
  // which arrives back here — without the re-entry guard that ping-pong is unbounded recursion.
  let restoringFocus = false;
  const restoreFocusIfInteractive = () => {
    if (closed || isSuspended() || restoringFocus) return;
    restoringFocus = true;
    try {
      state = 'visible-idle';
      focusOwner();
    } finally {
      restoringFocus = false;
    }
  };

  const removeListeners = () => {
    keyboardTarget.removeEventListener('keydown', onKeyDown, true);
    keyboardTarget.removeEventListener('keyup', onKeyUp, true);
    keyboardTarget.removeEventListener('blur', onBlur, true);
    keyboardTarget.removeEventListener('focus', onFocus, true);
    visibilityTarget.removeEventListener('visibilitychange', onVisibilityChange, true);
  };

  const finalize = (reason) => {
    if (closed) return false;
    closed = true;
    state = 'closed';
    const finalReason = pendingDismissReason || reason || 'keyboard';
    heldPhysicalKeys.clear();
    initiator = null;
    initiatorReleased = false;
    pendingDismissReason = null;
    removeListeners();
    onFinalize(finalReason);
    return true;
  };

  function onKeyDown(event) {
    if (closed) return;
    consume(event);
    if (isSuspended()) return;
    const physicalId = physicalKeyId(event);
    if (!physicalId) return;
    heldPhysicalKeys.add(physicalId);
    // A repeat can be the first event we observe when the key was already held as the fence was
    // installed. Track it as pre-held so timer/pointer dismissal cannot expose the menu beneath
    // subsequent repeats, but do not promote it to a fresh keyboard dismissal gesture.
    if (event?.repeat === true) {
      state = 'keys-held';
      return;
    }
    if (!initiator) initiator = physicalId;
    state = 'keys-held';
  }

  function onKeyUp(event) {
    if (closed) return;
    consume(event);
    if (isSuspended()) return;
    const physicalId = physicalKeyId(event);
    if (!physicalId || !heldPhysicalKeys.has(physicalId)) return;
    heldPhysicalKeys.delete(physicalId);
    if (physicalId === initiator) initiatorReleased = true;
    if (heldPhysicalKeys.size > 0) return;
    if (initiator && initiatorReleased) finalize('keyboard');
    else if (pendingDismissReason) finalize(pendingDismissReason);
    else state = 'visible-idle';
  }

  function onBlur() {
    if (closed) return;
    windowFocused = false;
    resetIncompleteGesture();
  }

  function onFocus() {
    if (closed) return;
    windowFocused = true;
    restoreFocusIfInteractive();
  }

  function onVisibilityChange() {
    if (closed) return;
    documentVisible = visibilityTarget.hidden !== true;
    if (!documentVisible) resetIncompleteGesture();
    else restoreFocusIfInteractive();
  }

  keyboardTarget.addEventListener('keydown', onKeyDown, true);
  keyboardTarget.addEventListener('keyup', onKeyUp, true);
  keyboardTarget.addEventListener('blur', onBlur, true);
  keyboardTarget.addEventListener('focus', onFocus, true);
  visibilityTarget.addEventListener('visibilitychange', onVisibilityChange, true);
  restoreFocusIfInteractive();

  return {
    requestDismiss(reason = 'pointer') {
      if (closed) return false;
      if (isSuspended()) return false;
      if (heldPhysicalKeys.size > 0) {
        pendingDismissReason = reason;
        return false;
      }
      return finalize(reason);
    },
    teardown() {
      if (closed) return false;
      closed = true;
      tornDown = true;
      state = 'torn-down';
      resetIncompleteGesture();
      state = 'torn-down';
      removeListeners();
      return true;
    },
    snapshot() {
      return {
        state,
        initiator,
        initiatorReleased,
        heldPhysicalKeys: [...heldPhysicalKeys].sort(),
        pendingDismissReason,
        windowFocused,
        documentVisible,
        closed,
        tornDown,
      };
    },
  };
}

export function physicalKeyId(event) {
  const code = typeof event?.code === 'string' ? event.code.trim() : '';
  if (code) return code;
  const key = typeof event?.key === 'string' ? event.key : '';
  if (!key) return '';
  const location = Number.isInteger(event?.location) ? event.location : 0;
  return `${key}@${location}`;
}
