// Shared fake-DOM + fake-bus seam for stunt-callout tests. Extracted from
// handline-inference-senses.test.mjs so sibling tests mount the same real createStuntCallout
// wiring without evaluating a slice of a test file. `run` defaults to null (Adventure);
// a Swarm mount passes the survival run shape.
export function makeCalloutMount({ createStuntCallout, seed, run = null }) {
  function fakeDocument() {
    function createElement() {
      const el = {
        className: '', textContent: '', hidden: false, style: {}, children: [],
        classList: { add() {}, remove() {}, contains() { return false; } },
        appendChild(child) { child.parentNode = this; this.children.push(child); return child; },
        removeChild(child) {
          const i = this.children.indexOf(child);
          if (i >= 0) this.children.splice(i, 1);
          return child;
        },
        setAttribute() {},
        getAttribute() { return null; },
      };
      return el;
    }
    const head = { children: [], appendChild(c) { this.children.push(c); } };
    const body = { children: [], appendChild(c) { this.children.push(c); } };
    return {
      createElement,
      getElementById() { return null; },
      head,
      body,
      documentElement: { classList: { contains() { return false; } } },
    };
  }

  function fakeBus() {
    const handlers = new Map();
    return {
      on(event, cb) {
        if (!handlers.has(event)) handlers.set(event, []);
        handlers.get(event).push(cb);
        return () => {};
      },
      emit(event, payload) {
        for (const cb of handlers.get(event) || []) cb(payload);
      },
    };
  }

  return function mount() {
    const doc = fakeDocument();
    const bus = fakeBus();
    const state = {
      seed,
      mode: 'flight',
      run,
      ui: { screenStack: [], docked: false },
      playerId: 1,
      settings: { video: { motionReduce: true } },
    };
    const callout = createStuntCallout({ state, bus, doc });
    return { bus, callout };
  };
}
