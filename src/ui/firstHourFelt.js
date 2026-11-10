// The first-hour events the sim already emits and nothing heard.
// Voice when a tutorial arbiter is present; otherwise a toast. Never a second lesson system.

export const FIRST_HOUR_FELT_EVENTS = Object.freeze([
  'onboarding:rangePrompt',
  'rescue:complete',
  'firsthour:complete',
]);

export function firstHourFeltLine(event, payload) {
  if (event === 'onboarding:rangePrompt') {
    const text = payload && payload.text;
    return typeof text === 'string' && text ? text : null;
  }
  if (event === 'rescue:complete') {
    return 'Pod at the beacon. The lane will remember this pilot.';
  }
  if (event === 'firsthour:complete') {
    return 'The three are yours. The lane is open.';
  }
  return null;
}

function feltId(event, payload) {
  if (event === 'onboarding:rangePrompt') {
    const beat = payload && (payload.beat || payload.atS);
    return `firsthour:range:${beat == null ? 'latch' : beat}`;
  }
  return event;
}

export function bindFirstHourFelt(bus, options = {}) {
  if (!bus || typeof bus.on !== 'function') return { destroy() {} };
  const voice = options.voice || null;
  const seen = new Set();
  const offs = [];
  const listen = (event, handler) => {
    const off = bus.on(event, handler);
    offs.push(typeof off === 'function' ? off : () => bus.off?.(event, handler));
  };
  // The UI survives New Game and Continue. Dedupe belongs to the current run, not
  // to the lifetime of this mounted presenter.
  for (const event of ['game:newGame', 'save:loaded']) listen(event, () => seen.clear());
  for (const event of FIRST_HOUR_FELT_EVENTS) {
    const handler = (payload) => {
      const text = firstHourFeltLine(event, payload);
      if (!text) return false;
      const id = feltId(event, payload);
      if (seen.has(id)) return false;
      seen.add(id);
      if (typeof options.say === 'function') {
        options.say(text, event);
        return true;
      }
      const said = voice && typeof voice.say === 'function'
        && voice.say({ channel: 'tutorial', text, kind: 'info', ttl: 6, id });
      if (!said) bus.emit('toast', { text, kind: 'info', ttl: 6, id });
      return true;
    };
    listen(event, handler);
  }
  return {
    destroy() {
      for (const off of offs.splice(0)) off();
    },
  };
}
