// Minimal document stub for mounting kit screens headlessly — the same shape the
// crucible-results test builds inline. `el` in src/ui/kit only needs createElement,
// appendChild/append, classList, dataset, attributes, and listeners.

export function fakeDom() {
  const make = (tagName) => {
    const node = {
      tagName,
      id: '',
      className: '',
      textContent: '',
      innerHTML: '',
      children: [],
      parentNode: null,
      style: {},
      dataset: {},
      attributes: {},
      listeners: {},
      appendChild(child) { child.parentNode = this; this.children.push(child); return child; },
      append(...kids) { for (const k of kids) this.appendChild(k); },
      setAttribute(name, value) { this.attributes[name] = String(value); },
      removeAttribute(name) { delete this.attributes[name]; },
      getAttribute(name) { return this.attributes[name] ?? null; },
      addEventListener(name, fn) { (this.listeners[name] = this.listeners[name] || []).push(fn); },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      closest() { return null; },
      focus() {},
      click() { for (const fn of this.listeners.click || []) fn({ target: this }); },
    };
    node.classList = {
      add(...names) { node.className = [...node.className.split(/\s+/), ...names].filter(Boolean).join(' '); },
      remove(...names) {
        node.className = node.className.split(/\s+/).filter((n) => n && !names.includes(n)).join(' ');
      },
      toggle(name, force) {
        const has = node.className.split(/\s+/).includes(name);
        const want = force === undefined ? !has : !!force;
        if (want && !has) node.classList.add(name);
        if (!want && has) node.classList.remove(name);
      },
      contains(name) { return node.className.split(/\s+/).includes(name); },
    };
    return node;
  };
  const head = make('head');
  head.id = 'head';
  const roots = [head];
  return {
    head,
    createElement: make,
    getElementById(id) {
      const visit = (node) => {
        if (node.id === id) return node;
        for (const child of node.children) { const found = visit(child); if (found) return found; }
        return null;
      };
      for (const root of roots) { const found = visit(root); if (found) return found; }
      return null;
    },
    _make: make,
  };
}

export function findButtons(node, out = []) {
  if (node.tagName === 'button') out.push(node);
  for (const child of node.children) findButtons(child, out);
  return out;
}

export function findAll(node, pred, out = []) {
  if (pred(node)) out.push(node);
  for (const child of node.children) findAll(child, pred, out);
  return out;
}

/** Every string the plate puts on screen, in reading order. */
export function textLines(node, out = []) {
  if (node.children && node.children.length) {
    for (const child of node.children) textLines(child, out);
  } else if (node.textContent) {
    out.push(node.textContent);
  }
  return out;
}

/** Mount a screen def against the stub and capture its bus emits. `registryGet` answers the one
 *  registry name the screen reads (e.g. survivalResults' lastResult). */
export function mountScreen(screen, { registryGet = () => null, ctx = {} } = {}) {
  const previousDocument = globalThis.document;
  const doc = fakeDom();
  globalThis.document = doc;
  const emitted = [];
  const bus = {
    emit(event, payload) { emitted.push({ event, payload }); },
    on() { return () => {}; },
    off() {},
    once() {},
  };
  const registry = { get: registryGet };
  const root = doc._make('div');
  try {
    screen.mount(root, { bus, registry, ...ctx });
  } finally {
    globalThis.document = previousDocument;
  }
  return { root, emitted, buttons: findButtons(root), doc };
}
