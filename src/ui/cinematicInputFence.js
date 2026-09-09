// Release fence for the first-session cinematic.
//
// The splash becomes the focus owner before any menu screen is opened. Keyboard dismissal waits
// until every physical key involved in the gesture has been released, so native button activation
// cannot leak into the newly focused Main Menu. This module is DOM-light so chord, blur, teardown,
// and pointer/timer races stay behaviorally testable outside the browser.

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

  const restoreFocusIfInteractive = () => {
    if (closed || isSuspended()) return;
    state = 'visible-idle';
    focusOwner();
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
