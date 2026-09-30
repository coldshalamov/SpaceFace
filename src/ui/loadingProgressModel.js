/** Pure, clock-injected display model. Serialized into the ring worker, so keep it self-contained.
 * Progress is an estimate inside a real stage, NOT a byte-completion claim. Only finish() can
 * produce 100%. A repeated or late event can never rewind a session. No simulation dependencies.
 */
export function createLoadingProgressModel() {
  const bands = {
    'boot-modules': .14, 'boot-state': .18, 'boot-contract': .20,
    'boot-systems': .94, 'boot-menu': .997,
    'restoring-save': .08, 'preparing-run': .25,
    'authored-library': .50, 'authored-visuals': .78,
    'render-pipelines': .90, 'gpu-resources': .94,
    'physics-authority': .96, 'entering-flight': .997,
  };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  let shown = 0, verified = 0, ceiling = .14, velocity = 0;
  let stageAt = 0, lastAt = null, id = '', complete = false, reduced = false;
  function reset(now = 0, value = 0) {
    shown = verified = clamp(Number(value) || 0, 0, .997);
    ceiling = Math.max(.14, shown); velocity = 0; id = '';
    stageAt = now; lastAt = now; complete = false;
  }
  function report(stage = {}, now = 0, fresh = false) {
    if (fresh) reset(now);
    if (complete) return;
    const amount = Number(stage.progress);
    if (!Number.isFinite(amount)) return;
    const nextId = String(stage.id || 'loading');
    const changed = nextId !== id;
    if (changed) { id = nextId; stageAt = now; }
    verified = Math.max(verified, clamp(amount, 0, .997));
    const bound = Number(stage.ceiling);
    const inferred = Number.isFinite(bound) ? bound : (bands[id] ?? Math.min(.997, verified + .06));
    ceiling = Math.max(shown, verified, Math.min(.997, inferred - .002));
  }
  function tick(now = 0) {
    if (!Number.isFinite(now)) return shown;
    if (lastAt === null) lastAt = now;
    const elapsed = Math.max(0, now - lastAt) / 1000;
    lastAt = Math.max(lastAt, now);
    if (reduced) { shown = Math.max(shown, complete ? 1 : verified); velocity = 0; return shown; }
    // A rational tail keeps moving much longer than exponential headroom. It is bounded by the
    // active stage, never a timer marching to 100. Work reports lift verified inside that band.
    const age = Math.max(0, now - stageAt) / 1000;
    const headroom = Math.max(0, ceiling - verified);
    const goal = complete ? 1 : verified + headroom * age / (age + 12);
    // Bounded substeps make 30/60/144 Hz and a resumed background tab stable. No giant dt jump,
    // negative velocity, overshoot, or O(duration-of-background-tab) recovery loop.
    let remaining = Math.min(elapsed, .35);
    while (remaining > 1e-8) {
      const dt = Math.min(1 / 120, remaining);
      const wanted = Math.min(complete ? 2 : .60, Math.max(0, goal - shown) * (complete ? 18 : 4.8));
      velocity += (wanted - velocity) * (1 - Math.exp(-dt / (complete ? .06 : .18)));
      shown = Math.max(shown, Math.min(goal, shown + Math.max(0, velocity) * dt));
      remaining -= dt;
    }
    if (complete && 1 - shown < .0008) shown = 1;
    return shown;
  }
  return {
    reset, report, tick,
    finish() { complete = true; verified = ceiling = 1; },
    setReduced(value) { reduced = value === true; },
    adopt(value) { if (Number.isFinite(value)) shown = Math.max(shown, Math.min(complete ? 1 : .997, value)); },
    snapshot() { return { shown, verified, ceiling, id, complete }; },
    format() { return shown === 1 && complete ? '100%' : `${(Math.floor(shown * 1000) / 10).toFixed(1)}%`; },
  };
}
