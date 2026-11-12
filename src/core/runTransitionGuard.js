// Monotonic ownership guard for async new-game/load transitions. A newer begin() invalidates all
// older tokens; a private issued-token brand rejects forged/cloned generation objects, and commit()
// is one-shot so a current transition can publish its route exactly once.

export function createRunTransitionGuard() {
  let generation = 0;
  const issued = new WeakSet();
  const committed = new WeakSet();

  return {
    begin(label = '') {
      generation += 1;
      const token = Object.freeze({ generation, label: String(label || '') });
      issued.add(token);
      return token;
    },

    isCurrent(token) {
      return !!token && issued.has(token) && token.generation === generation;
    },

    commit(token, action) {
      if (!token || !issued.has(token) || token.generation !== generation || committed.has(token)) return false;
      if (typeof action !== 'function') throw new TypeError('run-transition commit action must be a function');
      committed.add(token);
      action();
      return true;
    },
  };
}
