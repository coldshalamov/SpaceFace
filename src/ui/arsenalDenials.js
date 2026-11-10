// Failed-attempt explanations for the matter tools (packet 01 §5). When the Gyre's net or the Pull
// collector stands over something it will not take — protected cargo, an anchored landmark, a body too big
// to hold whole, a full ball — the owner publishes `matter:refused` ONCE per class of body, with the
// owner's own words (`short`, `text`: src/matter/aggregateMass.js explainRefusal). This listener carries
// that sentence to the pilot through the existing toast channel and keeps the latest one so the verb's
// reveal tip can repeat it while it still matters. It composes no vocabulary of its own.
//
// Not spoken here, because the owner already says it: a dry charge (the Gyre and the collector toast
// "needs charge") and a commit-time refusal (no `count`; the collector narrates each of those itself).
const TOOL_NAME = Object.freeze({ gyre: 'Gyre', collector: 'Pull' });
const THROTTLE_TICKS = 150; // 2.5 s: one class of refusal is not repeated while the pilot reads it
const TIP_TICKS = 300;      // how long the Gyre/Pull tip keeps quoting it

/** The toast line for a refusal event, or null when the owner already spoke it (or it has no words). */
export function denialLine(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const text = typeof payload.text === 'string' ? payload.text.trim() : '';
  if (!text || payload.code === 'dry-charge') return null;
  if (!(Number(payload.count) > 0)) return null;
  const tool = TOOL_NAME[payload.tool] || 'Pull';
  return `${tool} — ${text}`;
}

/**
 * Listen for refusals on the bus. `onDenial(record)` receives `{ tool, code, text, tick }` for the tip;
 * the toast goes out through `bus.emit('toast', …)`. Returns an unsubscribe function.
 */
export function mountArsenalDenials(bus, { onDenial = null } = {}) {
  if (!bus || typeof bus.on !== 'function') return () => {};
  const last = new Map();
  const off = bus.on('matter:refused', (payload) => {
    const line = denialLine(payload);
    if (!line) return;
    const tick = Number.isFinite(payload.tick) ? payload.tick : 0;
    const key = `${payload.tool}:${payload.code}`;
    if (typeof onDenial === 'function') onDenial({ tool: payload.tool, code: payload.code, text: payload.text, tick });
    const before = last.get(key);
    if (before != null && tick - before < THROTTLE_TICKS && tick >= before) return;
    last.set(key, tick);
    if (typeof bus.emit === 'function') bus.emit('toast', { text: line, kind: 'info', ttl: 1.8 });
  });
  return typeof off === 'function' ? off : () => {};
}

/** The refusal worth quoting in a tip right now (or null), given the sim tick. */
export function currentDenial(record, tick) {
  if (!record || !Number.isFinite(tick)) return null;
  return tick - record.tick <= TIP_TICKS && tick >= record.tick ? record : null;
}
