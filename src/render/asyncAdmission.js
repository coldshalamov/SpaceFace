export const AUTHORED_ASYNC_DEADLINE_MS = 120000;

function toAbortReason(reason) {
  if (reason instanceof Error && (reason.name === 'AbortError' || reason.name === 'TimeoutError')) {
    return reason;
  }
  const message = reason instanceof Error
    ? (reason.message || 'authored admission owner became inactive')
    : (reason != null ? String(reason) : 'authored admission owner became inactive');
  const error = new Error(message);
  error.name = 'AbortError';
  if (reason instanceof Error) error.cause = reason;
  return error;
}

export function createAsyncAdmission({
  label = 'authored-admission',
  timeoutMs = AUTHORED_ASYNC_DEADLINE_MS,
  signal = null,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  const controller = new AbortController();
  const labelText = String(label);
  let deadlineTimer = null;
  let externalSignal = null;

  const timeoutError = () => {
    const error = new Error(
      `[asyncAdmission] ${labelText} exceeded the ${timeoutMs}ms admission deadline`,
    );
    error.name = 'TimeoutError';
    error.code = 'AUTHORED_ADMISSION_TIMEOUT';
    return error;
  };

  const clearDeadline = () => {
    if (deadlineTimer != null) {
      clearTimer(deadlineTimer);
      deadlineTimer = null;
    }
  };

  const detachExternal = () => {
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort);
      externalSignal = null;
    }
  };

  const abort = (reason = null) => {
    if (controller.signal.aborted) return;
    controller.abort(toAbortReason(reason));
    clearDeadline();
    detachExternal();
  };

  function onExternalAbort() {
    const source = externalSignal;
    abort(source ? source.reason : null);
  }

  const ms = Number(timeoutMs);
  if (!Number.isFinite(ms) || ms < 0) {
    throw new TypeError(
      `createAsyncAdmission requires a finite non-negative timeoutMs, got ${timeoutMs}`);
  }
  deadlineTimer = setTimer(() => {
    deadlineTimer = null;
    abort(timeoutError());
  }, ms);
  if (deadlineTimer && typeof deadlineTimer.unref === 'function') deadlineTimer.unref();

  if (signal && typeof signal.addEventListener === 'function') {
    if (signal.aborted) abort(signal.reason);
    else {
      externalSignal = signal;
      signal.addEventListener('abort', onExternalAbort);
    }
  }

  const assertActive = () => {
    if (controller.signal.aborted) throw controller.signal.reason;
  };

  const wait = (work) => {
    Promise.resolve(work).then(() => {}, () => {});
    if (controller.signal.aborted) return Promise.reject(controller.signal.reason);
    return new Promise((resolve, reject) => {
      let detached = false;
      const detach = () => {
        if (detached) return;
        detached = true;
        controller.signal.removeEventListener('abort', onAbort);
      };
      const onAbort = () => {
        detach();
        reject(controller.signal.reason);
      };
      controller.signal.addEventListener('abort', onAbort);
      Promise.resolve(work).then(
        (value) => {
          detach();
          resolve(value);
        },
        (error) => {
          detach();
          reject(error);
        },
      );
    });
  };

  const finish = () => {
    clearDeadline();
    detachExternal();
  };

  return Object.freeze({
    signal: controller.signal,
    wait,
    abort,
    finish,
    assertActive,
  });
}
