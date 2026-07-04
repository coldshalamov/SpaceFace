import assert from 'node:assert/strict';
import { createHud } from '../src/ui/hud.js';
import { BINDINGS } from '../src/ui/bindings.js';
import { SEMANTIC_PALETTE } from '../src/ui/accessibility.js';

console.log('--- UI IDENTITY SPEC2/06 VERIFICATION ---');

// Mock DOM environment
globalThis.window = {
  devicePixelRatio: 1,
  addEventListener() {},
  removeEventListener() {}
};
const createdElements = [];
class MockElement {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.style = {
      display: '',
      setProperty(k, v) { this[k] = v; }
    };
    this.classList = {
      classes: new Set(),
      add(c) { this.classes.add(c); },
      remove(c) { this.classes.delete(c); },
      toggle(c, force) {
        if (force === undefined) {
          if (this.classes.has(c)) this.classes.delete(c);
          else this.classes.add(c);
        } else if (force) {
          this.classes.add(c);
        } else {
          this.classes.delete(c);
        }
      },
      contains(c) { return this.classes.has(c); }
    };
    this.attributes = {};
    this.listeners = {};
    this._textContent = '';
  }

  get textContent() { return this._textContent; }
  set textContent(v) { this._textContent = String(v); }

  get className() {
    return Array.from(this.classList.classes).join(' ');
  }
  set className(v) {
    this.classList.classes.clear();
    if (v) {
      v.split(/\s+/).forEach(c => this.classList.classes.add(c));
    }
  }

  get innerHTML() {
    return this._innerHTML || '';
  }
  set innerHTML(html) {
    this._innerHTML = html;
    if (html.includes('class="sf-arc-shield"')) {
      const c = new MockElement('circle');
      c.className = 'sf-arc-shield';
      this.appendChild(c);
    }
    if (html.includes('class="sf-arc-armor"')) {
      const c = new MockElement('circle');
      c.className = 'sf-arc-armor';
      this.appendChild(c);
    }
    if (html.includes('class="sf-arc-hull"')) {
      const c = new MockElement('circle');
      c.className = 'sf-arc-hull';
      this.appendChild(c);
    }
  }

  appendChild(el) {
    this.children.push(el);
    el.parentNode = this;
  }

  append(...els) {
    for (const el of els) this.appendChild(el);
  }

  setAttribute(k, v) { this.attributes[k] = String(v); }
  removeAttribute(k) { delete this.attributes[k]; }

  addEventListener(type, cb) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(cb);
  }

  click() {
    if (this.listeners['click']) {
      for (const cb of this.listeners['click']) cb();
    }
  }

  querySelector(sel) {
    // Simple mock query selectors for target panel and schematic
    if (sel.includes('.sf-bar--hull .sf-bar__fill')) return this._findClass('sf-bar--hull')?._findClass('sf-bar__fill') || new MockElement('div');
    if (sel.includes('.sf-bar--armor .sf-bar__fill')) return this._findClass('sf-bar--armor')?._findClass('sf-bar__fill') || new MockElement('div');
    if (sel.includes('.sf-bar--shield .sf-bar__fill')) return this._findClass('sf-bar--shield')?._findClass('sf-bar__fill') || new MockElement('div');
    if (sel.includes('.sf-target__name')) return this._findClass('sf-target__name') || new MockElement('span');
    if (sel.includes('.sf-target__faction')) return this._findClass('sf-target__faction') || new MockElement('span');
    if (sel.includes('.sf-target__dist')) return this._findClass('sf-target__dist') || new MockElement('span');
    if (sel.includes('.sf-target__closing')) return this._findClass('sf-target__closing') || new MockElement('span');
    if (sel.includes('.sf-target__gimmick')) return this._findClass('sf-target__gimmick') || new MockElement('div');
    if (sel.includes('.sf-arc-shield')) return this._findClass('sf-arc-shield') || new MockElement('circle');
    if (sel.includes('.sf-arc-armor')) return this._findClass('sf-arc-armor') || new MockElement('circle');
    if (sel.includes('.sf-arc-hull')) return this._findClass('sf-arc-hull') || new MockElement('circle');
    if (sel.includes('svg')) return this._findTag('SVG') || new MockElement('svg');
    return new MockElement('div');
  }

  querySelectorAll(sel) { return []; }

  closest(sel) {
    let curr = this;
    while (curr) {
      if (sel.startsWith('.') && curr.classList.contains(sel.slice(1))) return curr;
      if (sel.startsWith('#') && curr.id === sel.slice(1)) return curr;
      if (curr.tagName === sel.toUpperCase()) return curr;
      curr = curr.parentNode;
    }
    return new MockElement('div');
  }

  getBoundingClientRect() {
    return { width: 100, height: 100, top: 10, left: 10, right: 110, bottom: 110 };
  }

  getContext(type) {
    return {
      beginPath() {},
      moveTo() {},
      lineTo() {},
      arc() {},
      rect() {},
      stroke() {},
      fill() {},
      strokeText() {},
      fillText() {},
      measureText() { return { width: 10 }; },
      save() {},
      restore() {},
      setTransform() {},
      translate() {},
      rotate() {},
      scale() {},
      clearRect() {},
      drawImage() {},
      clip() {},
      closePath() {},
      setLineDash() {},
      fillRect() {},
      strokeRect() {},
      createRadialGradient() {
        return {
          addColorStop() {}
        };
      }
    };
  }

  _findClass(c) {
    if (this.classList.contains(c)) return this;
    for (const child of this.children) {
      const f = child._findClass(c);
      if (f) return f;
    }
    return null;
  }

  _findTag(t) {
    if (this.tagName === t.toUpperCase()) return this;
    for (const child of this.children) {
      const f = child._findTag(t);
      if (f) return f;
    }
    return null;
  }
}

globalThis.document = {
  getElementById(id) {
    const el = new MockElement('div');
    el.id = id;
    createdElements.push(el);
    return el;
  },
  createElement(tag) {
    const el = new MockElement(tag);
    createdElements.push(el);
    return el;
  }
};

globalThis.setTimeout = (fn, ms) => {
  fn();
  return 123;
};

globalThis.clearTimeout = () => {};

// Mock game state
const mockState = {
  playerId: 'p-1',
  simTime: 10,
  entities: new Map(),
  entityList: [],
  player: {
    targetId: null,
    cargo: { capVolume: 100 },
    weapons: []
  },
  settings: {
    ui: { overviewOpen: true }
  },
  ui: {
    radarRange: 4000
  }
};

const mockCtx = {
  state: mockState,
  bus: {
    listeners: {},
    on(event, cb) {
      if (!this.listeners[event]) this.listeners[event] = [];
      this.listeners[event].push(cb);
    },
    emit(event, data) {
      if (this.listeners[event]) {
        for (const cb of this.listeners[event]) cb(data);
      }
    }
  },
  helpers: {
    worldToScreen(pos) {
      return { x: 500 + pos.x, y: 300 + pos.z, onScreen: true };
    }
  }
};

const mockAlerts = {
  raise() {},
  clear() {},
  tick() {}
};

// Populate state
const playerEntity = {
  id: 'p-1',
  alive: true,
  type: 'ship',
  team: 1,
  pos: { x: 0, y: 0, z: 0 },
  vel: { x: 0, y: 0, z: 0 },
  rot: 0,
  boost: { max: 100 }
};
mockState.entities.set(playerEntity.id, playerEntity);

// Create HUD
const hud = createHud(mockCtx, mockAlerts);

// --- Assertions ---

// 1. Check three anchors are populated
console.log('Verifying HUD Anchors...');
const hudRoot = createdElements.find(el => el.id === 'hud');
assert.ok(hudRoot, 'HUD root element not found');

const targetArcs = createdElements.find(el => el.id === 'sf-target-arcs');
assert.ok(targetArcs, 'Target arcs element not found');

// 2. Check overview strip sorting and limits
console.log('Verifying Overview Strip Sorting...');
// Add 10 entities to scanner range
for (let i = 0; i < 10; i++) {
  const e = {
    id: `ent-${i}`,
    alive: true,
    type: 'ship',
    team: i < 4 ? 2 : (i < 7 ? 0 : 1), // 4 hostiles, 3 neutrals, 3 friendlies
    pos: { x: (i + 1) * 10, y: 0, z: 0 },
    vel: { x: 0, y: 0, z: 0 },
    rot: 0
  };
  mockState.entities.set(e.id, e);
  mockState.entityList.push(e);
}

// Run HUD ticks to update overview (5Hz cadence, runs every 12 frames)
for (let i = 0; i < 12; i++) {
  hud.frame(1 / 60);
}

// Check overview element children
const elOverview = createdElements.find(el => el.classList.contains('sf-overview'));
assert.ok(elOverview, 'Overview container not found');
assert.equal(elOverview.children.length, 9, 'Should show 8 rows + 1 "+N" footer');

const footer = elOverview.children[8];
assert.ok(footer.classList.contains('sf-overview-footer'), 'Footer not found');
assert.equal(footer.textContent, '+2 CONTACTS', 'Footer counts contacts above 8 limit');

// 3. Target arcs updates and extinction
console.log('Verifying Target Arcs tracking and extinction...');
const targetShip = mockState.entityList[0]; // Hostile at dist 10
mockState.player.targetId = targetShip.id;

targetShip.shield = 50; targetShip.shieldMax = 100;
targetShip.armorHp = 30; targetShip.armorMax = 100;
targetShip.hull = 80; targetShip.hullMax = 100;

hud.frame(1 / 60);

const cShield = targetArcs.querySelector('.sf-arc-shield');
const cArmor = targetArcs.querySelector('.sf-arc-armor');
const cHull = targetArcs.querySelector('.sf-arc-hull');

assert.ok(cShield.attributes['stroke-dasharray'].startsWith('5.2359'), 'Shield arc fraction mismatch'); // 0.5 * 2 * PI * 5
assert.ok(cArmor.attributes['stroke-dasharray'].startsWith('3.1415'), 'Armor arc fraction mismatch');  // 0.3 * 2 * PI * 5
assert.ok(cHull.attributes['stroke-dasharray'].startsWith('8.3775'), 'Hull arc fraction mismatch');   // 0.8 * 2 * PI * 5

// Kill target and verify extinction
targetShip.alive = false;
hud.frame(1 / 60);

assert.ok(!targetArcs.classList.contains('visible'), 'Target arcs did not clear visible class on target death');

console.log('ALL SPEC2/06 HUD VERIFICATIONS PASSED.');
