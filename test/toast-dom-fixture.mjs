// Reused from the repository toast/focus test DOM fixture, with global restoration for isolation.
export function installDom() {
  const previous = {
    document: globalThis.document,
    window: globalThis.window,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
    performance: globalThis.performance,
  };
  const byId = new Map();

  class FakeClassList {
    constructor() { this.values = new Set(); }
    add(...vs) { vs.forEach((v) => this.values.add(v)); }
    remove(...vs) { vs.forEach((v) => this.values.delete(v)); }
    contains(v) { return this.values.has(v); }
    toggle(v, force) {
      if (force === undefined) force = !this.values.has(v);
      if (force) this.values.add(v); else this.values.delete(v);
      return force;
    }
  }

  function parseAttrs(attrPart) {
    const attrs = new Map();
    const re = /([a-zA-Z0-9\-:]+)="([^"]*)"/g;
    let m;
    while ((m = re.exec(attrPart)) !== null) attrs.set(m[1], m[2]);
    return attrs;
  }

  class FakeElement {
    constructor(tagName = 'div') {
      this.tagName = String(tagName).toUpperCase();
      this.children = [];
      this.childNodes = this.children;
      this.parentNode = null;
      this.ownerDocument = null;
      this.classList = new FakeClassList();
      this.attributes = new Map();
      this._listeners = new Map();
      this.style = {};
      this.dataset = {};
      this._className = '';
      this._textContent = '';
      this._innerHTML = '';
      this.hidden = false;
      this.disabled = false;
      this.isConnected = true;
      this.inert = false;
      this.id = '';
    }
    get className() { return this._className; }
    set className(v) {
      this._className = String(v || '');
      this.classList.values = new Set(this._className.split(/\s+/).filter(Boolean));
    }
    get textContent() {
      if (this.children.length) return this.children.map((c) => c.textContent).join('');
      return this._textContent;
    }
    set textContent(v) {
      this._textContent = String(v == null ? '' : v);
      this.children.length = 0;
      this._innerHTML = '';
    }
    get innerHTML() { return this._innerHTML; }
    set innerHTML(html) {
      this._innerHTML = String(html || '');
      for (const child of [...this.children]) {
        child.parentNode = null;
        child.isConnected = false;
        if (child.id && byId.get(child.id) === child) byId.delete(child.id);
      }
      this.children.length = 0;
      this._textContent = '';
      if (!this._innerHTML) return;
      const stack = [this];
      let i = 0;
      while (i < this._innerHTML.length) {
        if (this._innerHTML[i] !== '<') {
          const end = this._innerHTML.indexOf('<', i);
          const text = this._innerHTML.slice(i, end === -1 ? this._innerHTML.length : end);
          stack[stack.length - 1]._textContent += text;
          if (end === -1) break;
          i = end;
          continue;
        }
        if (this._innerHTML.slice(i, i + 4) === '<!--') {
          const end = this._innerHTML.indexOf('-->', i);
          i = end === -1 ? this._innerHTML.length : end + 3;
          continue;
        }
        const closeMatch = this._innerHTML.slice(i).match(/^<\/([a-zA-Z0-9]+)\s*>/);
        if (closeMatch) {
          const tag = closeMatch[1].toUpperCase();
          if (stack.length > 1 && stack[stack.length - 1].tagName === tag) stack.pop();
          i += closeMatch[0].length;
          continue;
        }
        const openMatch = this._innerHTML.slice(i).match(/^<([a-zA-Z0-9]+)([^>]*)>/);
        if (!openMatch) { i++; continue; }
        const [, tag, attrPart] = openMatch;
        const selfClosing = /\/\s*$/.test(attrPart)
          || ['br', 'hr', 'img', 'input', 'meta', 'link'].includes(tag.toLowerCase());
        const child = document.createElement(tag);
        const attrs = parseAttrs(attrPart);
        for (const [k, v] of attrs) {
          child.setAttribute(k, v);
          if (k === 'class') child.className = v;
          if (k === 'id') {
            child.id = v;
            byId.set(v, child);
          }
          if (k === 'type') child.type = v;
        }
        stack[stack.length - 1].appendChild(child);
        if (!selfClosing) stack.push(child);
        i += openMatch[0].length;
      }
    }
    setAttribute(name, value) {
      const v = String(value);
      this.attributes.set(name, v);
      if (name === 'id') {
        if (this.id && byId.get(this.id) === this) byId.delete(this.id);
        this.id = v;
        if (v && this.isConnected) byId.set(v, this);
      }
      if (name === 'class') this.className = v;
    }
    getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
    removeAttribute(name) {
      this.attributes.delete(name);
      if (name === 'id') {
        if (this.id && byId.get(this.id) === this) byId.delete(this.id);
        this.id = '';
      }
    }
    appendChild(child) {
      if (child.parentNode) child.parentNode.removeChild(child);
      child.parentNode = this;
      child.ownerDocument = this.ownerDocument || globalThis.document;
      child.isConnected = this.isConnected;
      this.children.push(child);
      if (child.id) byId.set(child.id, child);
      return child;
    }
    prepend(child) {
      if (child.parentNode) child.parentNode.removeChild(child);
      child.parentNode = this;
      child.ownerDocument = this.ownerDocument || globalThis.document;
      child.isConnected = this.isConnected;
      this.children.unshift(child);
      if (child.id) byId.set(child.id, child);
      return child;
    }
    append(...nodes) { nodes.forEach((n) => this.appendChild(n)); }
    removeChild(child) {
      const i = this.children.indexOf(child);
      if (i >= 0) this.children.splice(i, 1);
      child.parentNode = null;
      child.isConnected = false;
      if (child.id && byId.get(child.id) === child) byId.delete(child.id);
      const doc = this.ownerDocument || globalThis.document;
      if (doc && doc.activeElement === child) doc.activeElement = doc.body;
      return child;
    }
    addEventListener(type, fn) {
      if (!this._listeners.has(type)) this._listeners.set(type, []);
      this._listeners.get(type).push(fn);
    }
    removeEventListener(type, fn) {
      const list = this._listeners.get(type) || [];
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    }
    dispatchEvent(typeOrEv, maybeEv) {
      let type;
      let ev;
      if (typeof typeOrEv === 'string') {
        type = typeOrEv;
        ev = maybeEv || {};
      } else {
        type = typeOrEv.type;
        ev = typeOrEv;
      }
      const payload = {
        preventDefault() {},
        stopPropagation() {},
        ...ev,
        type,
        target: ev.target || this,
        currentTarget: this,
      };
      const list = this._listeners.get(type) || [];
      for (const fn of list) fn(payload);
      return true;
    }
    click() {
      this.dispatchEvent('click', { target: this });
    }
    contains(node) {
      for (let n = node; n; n = n.parentNode) if (n === this) return true;
      return false;
    }
    focus(opts) {
      void opts;
      document.activeElement = this;
    }
    blur() {
      if (document.activeElement === this) document.activeElement = document.body;
    }
    querySelectorAll(sel) {
      const out = [];
      const walk = (node) => {
        for (const c of node.children) {
          if (matchesComplex(c, sel)) out.push(c);
          walk(c);
        }
      };
      walk(this);
      return out;
    }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  }

  // Supports simple / compound / descendant selectors used by production UI modules.
  function matchesSimple(el, sel) {
    const s = String(sel || '').trim();
    if (!s) return false;
    if (s.includes(',')) return s.split(',').some((part) => matchesSimple(el, part.trim()));
    // Descendant: "a b" → match last simple only when any ancestor matches the prefix chain.
    const parts = s.split(/\s+/).filter(Boolean);
    if (parts.length > 1) {
      if (!matchesSimple(el, parts[parts.length - 1])) return false;
      let ancestor = el.parentNode;
      for (let i = parts.length - 2; i >= 0; i--) {
        let found = false;
        while (ancestor) {
          if (matchesSimple(ancestor, parts[i])) { found = true; break; }
          ancestor = ancestor.parentNode;
        }
        if (!found) return false;
        ancestor = ancestor.parentNode;
      }
      return true;
    }
    // Attribute / pseudo-ish fragments used by focusable queries.
    if (s === 'button' && el.tagName === 'BUTTON') return true;
    if (s === 'input' && el.tagName === 'INPUT') return true;
    if (s === 'select' && el.tagName === 'SELECT') return true;
    if (s === 'textarea' && el.tagName === 'TEXTAREA') return true;
    if (s === '[href]' && el.getAttribute('href')) return true;
    if (s.startsWith('[tabindex]') || s.includes('[tabindex]')) {
      const t = el.getAttribute('tabindex');
      if (t == null) return false;
      if (s.includes(':not([tabindex="-1"])') && t === '-1') return false;
      return true;
    }
    if (s.startsWith('#')) return el.id === s.slice(1);
    if (s.startsWith('.')) return el.classList.contains(s.slice(1));
    // tag.class or tag#id
    const tagClass = s.match(/^([a-zA-Z0-9]+)(\.[a-zA-Z0-9_-]+)+$/);
    if (tagClass) {
      if (el.tagName !== tagClass[1].toUpperCase()) return false;
      return s.split('.').slice(1).every((c) => el.classList.contains(c));
    }
    const tagId = s.match(/^([a-zA-Z0-9]+)#([a-zA-Z0-9_-]+)$/);
    if (tagId) return el.tagName === tagId[1].toUpperCase() && el.id === tagId[2];
    if (/^[a-zA-Z0-9]+$/.test(s)) return el.tagName === s.toUpperCase();
    return false;
  }

  function matchesComplex(el, sel) {
    return matchesSimple(el, sel);
  }

  const body = new FakeElement('body');
  const head = new FakeElement('head');
  const uiRoot = new FakeElement('div'); uiRoot.id = 'ui-root';
  const screens = new FakeElement('div'); screens.id = 'screens';
  const backdrop = new FakeElement('div'); backdrop.id = 'modal-backdrop';
  const hud = new FakeElement('div'); hud.id = 'hud';
  const toasts = new FakeElement('div'); toasts.id = 'toasts';
  const toastLive = new FakeElement('div'); toastLive.id = 'toast-live';
  toastLive.setAttribute('role', 'status');
  toastLive.setAttribute('aria-live', 'polite');
  body.appendChild(uiRoot);
  body.appendChild(screens);
  body.appendChild(backdrop);
  body.appendChild(hud);
  body.appendChild(toasts);
  body.appendChild(toastLive);
  byId.set('ui-root', uiRoot);
  byId.set('screens', screens);
  byId.set('modal-backdrop', backdrop);
  byId.set('hud', hud);
  byId.set('toasts', toasts);
  byId.set('toast-live', toastLive);

  let activeElement = body;
  const docListeners = new Map();
  const doc = {
    body,
    head,
    documentElement: body,
    get activeElement() { return activeElement; },
    set activeElement(v) { activeElement = v; },
    getElementById(id) { return byId.get(id) || null; },
    querySelector(sel) {
      if (typeof sel === 'string' && sel.startsWith('#')) {
        const space = sel.indexOf(' ');
        if (space < 0) {
          const id = sel.slice(1);
          const root = byId.get(id);
          if (root && matchesSimple(root, sel)) return root;
        } else {
          const id = sel.slice(1, space);
          const rest = sel.slice(space + 1).trim();
          const root = byId.get(id);
          if (root) return root.querySelector(rest);
        }
      }
      return body.querySelector(sel);
    },
    querySelectorAll(sel) { return body.querySelectorAll(sel); },
    createElement(tagName) {
      const el = new FakeElement(tagName);
      el.ownerDocument = doc;
      return el;
    },
    addEventListener(type, fn, opts) {
      void opts;
      if (!docListeners.has(type)) docListeners.set(type, []);
      docListeners.get(type).push(fn);
    },
    removeEventListener(type, fn) {
      const list = docListeners.get(type) || [];
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    },
  };
  body.ownerDocument = doc;
  head.ownerDocument = doc;
  for (const el of [uiRoot, screens, backdrop, hud, toasts, toastLive]) el.ownerDocument = doc;

  globalThis.document = doc;
  globalThis.window = {
    innerWidth: 1920,
    innerHeight: 1080,
    addEventListener() {},
    removeEventListener() {},
  };
  globalThis.requestAnimationFrame = (cb) => { cb(0); return 1; };
  globalThis.cancelAnimationFrame = () => {};

  let now = 1000;
  globalThis.performance = { now: () => now };

  return {
    body,
    screens,
    toasts,
    toastLive,
    byId,
    advance(ms) { now += ms; },
    restore() {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete globalThis[key];
        else globalThis[key] = value;
      }
    },
    setNow(v) { now = v; },
    button(id, label = id) {
      const b = document.createElement('button');
      b.id = id;
      b.textContent = label;
      body.appendChild(b);
      return b;
    },
  };
}
