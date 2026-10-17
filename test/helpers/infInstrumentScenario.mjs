import { createSimulation } from '../../src/core/sim.js';
import { createTargetPanel } from '../../src/ui/targetPanel.js';

export function instrumentScenario(systems = []) {
  const sim = createSimulation({ seed: 4242, systems });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_helios_prime';
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, hull: 100, hullMax: 100,
    data: { combat: {}, intent: {} },
  });
  state.playerId = player.id;
  return { sim, state, bus, player };
}

// Small DOM shim for the real target-card renderer. Markup is parsed so selectors address the
// shipped card's elements; absent elements fail rather than being invented by querySelector.
class CardNode {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.attributes = new Map();
    this.dataset = {};
    this.style = {};
    this.className = '';
    this._text = '';
    this.classList = {
      toggle: (name, active) => {
        const names = new Set(this.className.split(/\s+/).filter(Boolean));
        if (active) names.add(name); else names.delete(name);
        this.className = [...names].join(' ');
      },
    };
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === 'class') this.className = String(value);
    if (name === 'hidden') this.hidden = true;
  }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  addEventListener() {}
  get firstChild() { return this.children[0] || null; }
  get textContent() { return this._text + this.children.map((child) => child.textContent).join(''); }
  set textContent(value) { this._text = String(value); this.children = []; }
  set innerHTML(value) {
    this.children = [];
    this._text = '';
    const stack = [this];
    const markup = String(value).replace(/<!--[\s\S]*?-->/g, '');
    for (const token of markup.match(/<[^>]+>|[^<]+/g) || []) {
      if (token.startsWith('</')) { if (stack.length > 1) stack.pop(); continue; }
      if (!token.startsWith('<')) { stack.at(-1)._text += token; continue; }
      const match = token.match(/^<([\w:-]+)/);
      if (!match) continue;
      const child = new CardNode(match[1]);
      const attrs = token.slice(match[0].length, -1);
      for (const attr of attrs.matchAll(/([\w:-]+)(?:="([^"]*)")?/g)) {
        child.setAttribute(attr[1], attr[2] ?? '');
      }
      stack.at(-1).children.push(child);
      if (!token.endsWith('/>') && !['BR', 'HR', 'INPUT', 'IMG'].includes(child.tagName)) stack.push(child);
    }
  }
  querySelector(selector) {
    for (const child of this.children) {
      const matches = selector.startsWith('.')
        ? child.className.split(/\s+/).includes(selector.slice(1))
        : selector.startsWith('[') && child.attributes.has(selector.slice(1, -1));
      if (matches) return child;
      const nested = child.querySelector(selector);
      if (nested) return nested;
    }
    return null;
  }
}

export function mountInstrumentCard(ctx) {
  const previous = globalThis.document;
  globalThis.document = { createElement: (tag) => new CardNode(tag) };
  try { return createTargetPanel(ctx); }
  finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
}
