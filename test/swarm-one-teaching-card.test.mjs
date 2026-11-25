// DEMO-SWARM-TUTOR-1 — one teaching card at a time in Swarm, and none on Again
// (owner demo 2026-11-23).
//
// A Swarm round's first frame of control used to show THREE teachers at once: the round brief
// top-left ("A rushing pack / Catch one Wasp on the Line…"), the first-sighting codex line top-right
// ("Wasp Swarmer: Light enough to throw…"), and the first-use power caption over the power bar
// ("Plow · 5 / Gathers rocks at your bow…"). Together they covered about a third of the arena at the
// exact moment control starts, and the round after Again showed all three again.
//
// The rule these tests pin: ONE teaching card at a time, on the lane's OWN left-margin seat —
// never the Stage's speaker slot, which the one-voice yield CSS hides under tells and danger while
// the read clock runs (XR-DEMO-SWARM-TUTOR-1); it retires when its mechanic is used or after ~6 s;
// a card the session already showed never shows again on Again. Only the round brief may repeat.
//
// Run: node --test test/swarm-one-teaching-card.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import {
  SWARM_TEACHING_LANE_ID,
  SWARM_TEACHING_TTL_MS,
  SWARM_TEACH_MECHANIC,
  mountSwarmTeaching,
  offerTeachingCard,
  markTeachingMechanicUsed,
  resetSwarmTeachingSession,
} from '../src/ui/swarmTeaching.js';
import { SWARM_TEACHING_TTL_S, SWARM_TEACH_MECHANIC_BY_ENEMY } from '../src/data/swarmTeaching.js';
import { STAGE_SLOTS } from '../src/ui/stage.js';
import { hintTextFor } from '../src/systems/survivalAnnounce.js';
import { ENEMY_TYPES } from '../src/data/enemies.js';

// A doc shaped for the lane's host: documentElement > body > #ui-root, the same parent
// index.html uses, so the lane host resolves to a real container.
function installDom() {
  class El {
    constructor(tag = 'div') {
      this.tagName = String(tag).toUpperCase();
      this.children = [];
      this.parentNode = null;
      this.id = '';
      this._className = '';
      this.textContent = '';
      this.attributes = new Map();
      this.listeners = new Map();
      this.nodeType = 1;
      this.dataset = {};
      this.hidden = false;
      this.style = { setProperty() {}, removeProperty() {} };
      const names = () => this._className.split(/\s+/).filter(Boolean);
      this.classList = {
        add: (...vs) => { const s = new Set(names()); vs.forEach((v) => v && s.add(v)); this._className = [...s].join(' '); },
        remove: (...vs) => { const d = new Set(vs); this._className = names().filter((n) => !d.has(n)).join(' '); },
        toggle: (v, force) => {
          const on = force === undefined ? !names().includes(v) : !!force;
          if (on) this.classList.add(v); else this.classList.remove(v);
          return on;
        },
        contains: (v) => names().includes(v),
      };
    }
    get className() { return this._className; }
    set className(v) { this._className = String(v); }
    get isConnected() {
      for (let n = this; n; n = n.parentNode) if (n === doc.documentElement) return true;
      return false;
    }
    setAttribute(k, v) { this.attributes.set(k, String(v)); }
    getAttribute(k) { return this.attributes.has(k) ? this.attributes.get(k) : null; }
    hasAttribute(k) { return this.attributes.has(k); }
    removeAttribute(k) { this.attributes.delete(k); }
    appendChild(child) {
      if (child.parentNode) child.parentNode.removeChild(child);
      child.parentNode = this;
      this.children.push(child);
      return child;
    }
    append(...nodes) { nodes.forEach((n) => this.appendChild(n)); }
    removeChild(child) {
      this.children = this.children.filter((c) => c !== child);
      child.parentNode = null;
      return child;
    }
    remove() { if (this.parentNode) this.parentNode.removeChild(this); }
    insertBefore(child, ref) {
      if (child.parentNode) child.parentNode.removeChild(child);
      child.parentNode = this;
      const at = ref ? this.children.indexOf(ref) : -1;
      if (at < 0) this.children.push(child); else this.children.splice(at, 0, child);
      return child;
    }
    addEventListener(type, fn) { (this.listeners.get(type) || this.listeners.set(type, []).get(type)).push(fn); }
    removeEventListener() {}
    contains(node) { for (let n = node; n; n = n.parentNode) if (n === this) return true; return false; }
    get firstElementChild() { return this.children[0] || null; }
    querySelector() { return null; }
    querySelectorAll() { return []; }
    getBoundingClientRect() { return { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 100, height: 20 }; }
  }
  const documentElement = new El('html');
  const body = new El('body');
  const uiRoot = new El('div'); uiRoot.id = 'ui-root';
  const hud = new El('div'); hud.id = 'hud';
  documentElement.appendChild(body);
  body.appendChild(uiRoot);
  uiRoot.appendChild(hud);
  const head = new El('head');
  documentElement.appendChild(head);
  const doc = {
    documentElement,
    body,
    head,
    createElement: (tag) => new El(tag),
    addEventListener() {},
    removeEventListener() {},
    getElementById: (id) => {
      const walk = (el) => {
        if (el.id === id) return el;
        for (const c of el.children) { const hit = walk(c); if (hit) return hit; }
        return null;
      };
      return walk(documentElement);
    },
  };
  const saved = {
    document: globalThis.document,
    raf: globalThis.requestAnimationFrame,
    caf: globalThis.cancelAnimationFrame,
  };
  globalThis.document = doc;
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  return {
    doc,
    restore() {
      if (saved.document === undefined) delete globalThis.document; else globalThis.document = saved.document;
      if (saved.raf === undefined) delete globalThis.requestAnimationFrame; else globalThis.requestAnimationFrame = saved.raf;
      if (saved.caf === undefined) delete globalThis.cancelAnimationFrame; else globalThis.cancelAnimationFrame = saved.caf;
    },
  };
}

// A synchronous bus with the same on/emit contract the real one has.
function createBus() {
  const handlers = new Map();
  return {
    on(name, fn) {
      if (!handlers.has(name)) handlers.set(name, []);
      handlers.get(name).push(fn);
      return () => {
        const list = handlers.get(name);
        const at = list.indexOf(fn);
        if (at >= 0) list.splice(at, 1);
      };
    },
    emit(name, payload) { for (const fn of handlers.get(name) || []) fn(payload); },
  };
}

// A state carrying the entities the latch events name. `wasp` is a taught hull; `rock` is not.
function createState() {
  const entities = new Map();
  entities.set(9, { id: 9, type: 'ship', data: { lootTableId: 'wasp_swarmer' } });
  entities.set(10, { id: 10, type: 'asteroid', data: {} });
  entities.set(11, { id: 11, type: 'ship', data: { lootTableId: 'bruiser_brawler' } });
  return { entities: { get: (id) => entities.get(Number(id)) || null }, simTime: 0 };
}

// The three real cards, in the exact shape the three emitters offer them.
const BRIEF = Object.freeze({
  id: 'swarm:brief:1',
  mechanic: SWARM_TEACH_MECHANIC.line,
  kicker: 'ROUND 1',
  title: 'A rushing pack',
  line: 'Catch one Wasp on the Line and whip it through the pack',
  repeat: true,
});
const CODEX = Object.freeze({
  id: 'swarm:teach:wasp_swarmer',
  mechanic: SWARM_TEACH_MECHANIC.line,
  kicker: 'New contact',
  title: 'Wasp Swarmer',
  line: hintTextFor('wasp_swarmer').replace(/^Wasp Swarmer: /, ''),
});
const POWER = Object.freeze({
  id: 'swarm:power:plow',
  mechanic: SWARM_TEACH_MECHANIC.power('plow'),
  kicker: 'Plow',
  line: 'Gathers rocks at your bow. Press again to launch',
});

function withLane(run, { state = null } = {}) {
  resetSwarmTeachingSession();
  const env = installDom();
  const bus = createBus();
  const lane = mountSwarmTeaching({ bus, state: state || createState(), ttlMs: 50 });
  // A real round reaches the glass only after the boot veil lifts; the lane holds cards until then.
  bus.emit('ui:loadingHidden', { mode: 'flight' });
  try {
    run({ lane, bus, doc: env.doc });
  } finally {
    lane.destroy();
    resetSwarmTeachingSession();
    env.restore();
  }
}

test('the teaching lane is its own seat — never the Stage speaker slot the voices arbitrate', () => {
  assert.equal(SWARM_TEACHING_LANE_ID, 'sf-teach-lane');
  assert.ok(!Object.keys(STAGE_SLOTS).includes(SWARM_TEACHING_LANE_ID.replace(/^sf-teach-/, '')),
    'the lane is not a Stage slot — the speaker seat stays the cast\'s alone');
  assert.equal(SWARM_TEACHING_TTL_MS, SWARM_TEACHING_TTL_S * 1000);
  assert.equal(SWARM_TEACHING_TTL_S, 6, '~6 s (owner demo 2026-11-23)');
});

test('the lane never touches the speaker slot: a card up is not a voice and yields to nothing', () => {
  withLane(({ lane, doc }) => {
    lane.offer(BRIEF);
    const host = doc.getElementById(SWARM_TEACHING_LANE_ID);
    assert.ok(host, 'the lane draws in its own host element');
    assert.equal(host.parentNode.id, 'ui-root', 'the host seats under #ui-root');
    assert.equal(doc.getElementById('sf-stage-speaker'), null,
      'the speaker slot host is never built for a teaching card — one teaching card at a time, owner demo 2026-11-23');
  });
});

test('three teachers offered on the same frame put exactly ONE card on the glass', () => {
  withLane(({ lane }) => {
    // `survivalHud` offers the round brief, `survivalAnnounce` hands over the codex lesson and
    // `hudAdapter` offers the power card — all on the same first frame of control.
    assert.equal(lane.offer(BRIEF), 'shown');
    assert.equal(lane.offer(CODEX), 'shown');
    assert.equal(lane.offer(POWER), 'shown');

    assert.equal(lane.visibleId(), BRIEF.id, 'exactly ONE card is on the glass — the first one');
    assert.deepEqual(lane.queuedIds().sort(), [CODEX.id, POWER.id].sort(),
      'the other two wait in the lane, not on the glass');
  });
});

test('the next lesson takes the seat only after the one on the glass retires', () => {
  withLane(({ lane }) => {
    lane.offer(BRIEF);
    lane.offer(CODEX);
    lane.offer(POWER);
    assert.equal(lane.visibleId(), BRIEF.id);

    assert.equal(lane.retire(BRIEF.id), true);
    assert.equal(lane.visibleId(), CODEX.id, 'the lane promotes one card, not two');
    assert.deepEqual(lane.queuedIds(), [POWER.id]);

    assert.equal(lane.retire(CODEX.id), true);
    assert.equal(lane.visibleId(), POWER.id, 'still exactly one card');
  });
});

test('a card retires when a TAUGHT hull is caught on the Line — never for a rock or a stray hull', () => {
  withLane(({ lane, bus }) => {
    lane.offer(CODEX);
    assert.equal(lane.visibleId(), CODEX.id);

    // A rock on the line proves nothing about catching a Wasp (XR-DEMO-SWARM-TUTOR-1).
    bus.emit('tether:latched', { sourceId: 1, targetId: 10 });
    assert.equal(lane.visibleId(), CODEX.id, 'latching a rock leaves the card up');
    // A hull whose lesson is not the Line does not retire it either.
    bus.emit('tether:latched', { sourceId: 1, targetId: 11 });
    assert.equal(lane.visibleId(), CODEX.id, 'latching an untaught hull leaves the card up');

    // The player hooks a Wasp — the mechanic the card teaches, off the game's real event.
    bus.emit('tether:latched', { sourceId: 1, targetId: 9 });
    assert.equal(lane.visibleId(), null, 'the card retires the moment the Line takes a taught hull');
    assert.equal(lane.offer(CODEX), 'spent', 'and it is never offered again this session');
  });
});

test('the round brief shares the Line mechanic: one Wasp catch retires brief and codex together', () => {
  withLane(({ lane, bus }) => {
    lane.offer(BRIEF);
    lane.offer(CODEX);
    assert.equal(lane.visibleId(), BRIEF.id);
    bus.emit('tether:latched', { sourceId: 1, targetId: 9 });
    assert.equal(lane.visibleId(), null,
      'the catch retires whichever card was explaining the Line — both of them');
    assert.deepEqual(lane.liveIds(), []);
  });
});

test('the power lesson is spent by the FIRST press; a repeat press only clears the live card early', () => {
  withLane(({ lane }) => {
    // hudAdapter's flow: the first press offers the card and immediately spends the lesson,
    // because the press itself is the mechanic being used.
    assert.equal(lane.offer(POWER), 'shown');
    lane.spend(SWARM_TEACH_MECHANIC.power('plow'));
    assert.equal(lane.visibleId(), POWER.id);

    // A different power being used is not this card's mechanic.
    assert.equal(lane.used(SWARM_TEACH_MECHANIC.power('shove')), false);
    assert.equal(lane.visibleId(), POWER.id, 'the card stays while its own power is unpressed');
    // Its own power pressed again: the live card retires early.
    assert.equal(lane.used(SWARM_TEACH_MECHANIC.power('plow')), true);
    assert.equal(lane.visibleId(), null);
    assert.equal(lane.offer(POWER), 'spent', 'the lesson never re-teaches — press two was never owed');
  });
});

test('a power lesson stays spent even when its card timed out unread — no second press is required', () => {
  resetSwarmTeachingSession();
  try {
    // The offer-then-spend order is what lets the first press both show the card and spend it.
    assert.equal(offerTeachingCard(POWER), 'accept');
    assert.equal(markTeachingMechanicUsed(SWARM_TEACH_MECHANIC.power('plow')), true);
    // The card times out without any further press. The lesson is still spent: the player pressed
    // the power, so Again must not re-teach it (XR-DEMO-SWARM-TUTOR-1).
    assert.equal(offerTeachingCard(POWER), 'spent');
  } finally {
    resetSwarmTeachingSession();
  }
});

test('Again re-shows the round brief and nothing else (owner demo 2026-11-23)', () => {
  resetSwarmTeachingSession();
  try {
    // Round 1: the brief takes the seat, then the player latches a Wasp and presses Plow.
    assert.equal(offerTeachingCard(BRIEF), 'accept');
    assert.equal(offerTeachingCard(CODEX), 'accept');
    assert.equal(offerTeachingCard(POWER), 'accept');
    assert.equal(markTeachingMechanicUsed(SWARM_TEACH_MECHANIC.line), true);
    assert.equal(markTeachingMechanicUsed(SWARM_TEACH_MECHANIC.power('plow')), true);

    // Again is a NEW RUN — a fresh player bag, a fresh survivalAnnounce hint set — in the SAME page
    // session. The two lessons must stay spent; the brief names the new round, so it may show.
    assert.equal(offerTeachingCard(CODEX), 'spent', 'the codex card never repeats on Again');
    assert.equal(offerTeachingCard(POWER), 'spent', 'the power card never repeats on Again');
    assert.equal(offerTeachingCard({ ...BRIEF, id: 'swarm:brief:2' }), 'accept',
      'the round brief may show again — the one card that may');
  } finally {
    resetSwarmTeachingSession();
  }
});

test('a run boundary empties the seat but keeps what the session has already taught', () => {
  withLane(({ lane, bus }) => {
    lane.offer(CODEX);
    lane.offer(POWER);
    assert.equal(lane.visibleId(), CODEX.id);
    // Again: a new run starts. Whatever was on the glass must not sit over the new round...
    bus.emit('run:started', {});
    assert.equal(lane.visibleId(), null, 'the seat is emptied at the run boundary');
    // ...but the session memory stays, so the second round does not re-teach it.
    assert.equal(lane.offer(CODEX), 'spent');
    assert.equal(lane.offer(POWER), 'spent');
  });
});

test('a card on the glass for its whole read retires itself, and stays offered-spent afterwards', async () => {
  resetSwarmTeachingSession();
  const env = installDom();
  const bus = createBus();
  const lane = mountSwarmTeaching({ bus, state: createState(), ttlMs: 40 });
  try {
    bus.emit('ui:loadingHidden', { mode: 'flight' });
    assert.equal(lane.offer(CODEX), 'shown');
    assert.equal(lane.visibleId(), CODEX.id);
    await new Promise((resolve) => setTimeout(resolve, 260));
    assert.equal(lane.visibleId(), null, 'the ~6 s read clock retires it (40 ms here)');
    assert.deepEqual(lane.liveIds(), [], 'no card is left handed to the lane');
    assert.equal(lane.offer(CODEX), 'spent', 'a timed-out card is spent too, never re-taught');
  } finally {
    lane.destroy();
    resetSwarmTeachingSession();
    env.restore();
  }
});

test('a card still waiting when the first retires gets its whole read, not the remainder', async () => {
  resetSwarmTeachingSession();
  const env = installDom();
  const bus = createBus();
  const lane = mountSwarmTeaching({ bus, state: createState(), ttlMs: 100 });
  try {
    bus.emit('ui:loadingHidden', { mode: 'flight' });
    lane.offer(BRIEF);
    lane.offer(CODEX);
    assert.equal(lane.visibleId(), BRIEF.id);
    // The brief's clock runs out at 100 ms; the codex card promotes and must get its OWN full
    // read window (100 ms of its own) — not what the brief left over.
    await new Promise((resolve) => setTimeout(resolve, 160));
    assert.equal(lane.visibleId(), CODEX.id, 'the queued card promoted when the first timed out');
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(lane.visibleId(), CODEX.id, 'still inside its own read — the wait cost it nothing');
  } finally {
    lane.destroy();
    resetSwarmTeachingSession();
    env.restore();
  }
});

test('a re-mount (ui.init on a new game) re-seats the card still inside its read window', () => {
  resetSwarmTeachingSession();
  const env = installDom();
  const bus = createBus();
  const first = mountSwarmTeaching({ bus, state: createState(), ttlMs: 60_000 });
  try {
    bus.emit('ui:loadingHidden', { mode: 'flight' });
    assert.equal(first.offer(BRIEF), 'shown');
    assert.equal(first.visibleId(), BRIEF.id);
    // `ui.init()` again: a fresh lane over the same document, bound to the same bus.
    const second = mountSwarmTeaching({ bus, state: createState(), ttlMs: 60_000 });
    assert.equal(second.visibleId(), BRIEF.id,
      'the card is still on the glass after the rebuild');
    second.destroy();
  } finally {
    first.destroy();
    resetSwarmTeachingSession();
    env.restore();
  }
});

test('a card offered behind the loading veil waits for the veil to lift before it seats', async () => {
  resetSwarmTeachingSession();
  const env = installDom();
  // The veil is the boot overlay element itself: present and displayed means the arena is covered.
  const overlay = env.doc.createElement('div');
  overlay.id = 'boot-overlay';
  env.doc.body.appendChild(overlay);
  const bus = createBus();
  const lane = mountSwarmTeaching({ bus, state: createState(), ttlMs: 60_000 });
  try {
    // The round's brief and first-sighting card land while the arena is still cooking.
    assert.equal(lane.offer(BRIEF), 'shown');
    assert.equal(lane.offer(CODEX), 'shown');
    assert.equal(lane.visibleId(), null, 'nothing is drawn behind the loading veil');
    // The veil lifts (the overlay goes away): the oldest held card takes the seat on its own —
    // whichever route lifted it, because seating reads the overlay, not the event ordering.
    overlay.style.display = 'none';
    bus.emit('ui:loadingHidden', { mode: 'flight' });
    assert.equal(lane.visibleId(), BRIEF.id, 'the first held card takes the seat');
    assert.deepEqual(lane.queuedIds(), [CODEX.id], 'the rest wait their turn');
  } finally {
    lane.destroy();
    resetSwarmTeachingSession();
    env.restore();
  }
});

test('the three emitters all go through the one lane; nothing draws its own card in Swarm', () => {
  const hudAdapter = readFileSync(new URL('../src/ui/orrery/hudAdapter.js', import.meta.url), 'utf8');
  assert.match(hudAdapter, /getSwarmTeaching\(\)/,
    'the power hint takes the lane inside Swarm (one teaching card at a time, owner demo 2026-11-23)');
  assert.match(hudAdapter, /teaching\.spend\(mechanic\)/,
    'the first press spends the power lesson — the card never waits on a second press');
  const survivalHud = readFileSync(new URL('../src/ui/survivalHud.js', import.meta.url), 'utf8');
  assert.match(survivalHud, /isSwarmGlass\(this\.state\) \? getSwarmTeaching\(\) : null/,
    'the round brief takes the lane for Swarm glass ONLY — the Gauntlet keeps its cast strip');
  assert.match(survivalHud, /repeat: true/, 'the round brief is the one card allowed back on Again');
  assert.match(survivalHud, /mechanic: SWARM_TEACH_MECHANIC\.line/,
    'the brief and the first-sighting card share the Line mechanic one catch retires');

  const announce = readFileSync(new URL('../src/systems/survivalAnnounce.js', import.meta.url), 'utf8');
  assert.match(announce, /_swarmTeach\(/, 'a first sighting inside Swarm goes through the card seam');
  assert.match(announce, /bus\.emit\('swarm:teach'/, 'the lesson crosses the bus as swarm:teach');
  assert.match(announce, /run\.ruleset !== 'swarm'\) return false/,
    'the Gauntlet and endless non-Swarm runs keep the spoken tutorial line');

  // The old free-standing top-left cast strip must not draw in a Swarm run once the lane owns it.
  const hud = readFileSync(new URL('../src/ui/survivalHud.js', import.meta.url), 'utf8');
  assert.match(hud, /this\._cast = null;\s*\n\s*this\._castUntil = -1;/,
    'the HUD keeps no top-left cast card of its own once the lane owns the brief');

  // The lane must never seat on the Stage's speaker slot: that seat belongs to the cast's face
  // cards and the one-voice yield CSS hides it under every tell and danger line.
  const lane = readFileSync(new URL('../src/ui/swarmTeaching.js', import.meta.url), 'utf8');
  assert.doesNotMatch(lane, /getStage|stage\.show\(/,
    'the lane draws on its own seat — one teaching card at a time, owner demo 2026-11-23');
});

test('every hull the lane teaches on a mechanic exists in the roster and names a real token', () => {
  const ids = new Set(ENEMY_TYPES.map((def) => def.id));
  for (const [enemyId, mechanic] of Object.entries(SWARM_TEACH_MECHANIC_BY_ENEMY)) {
    assert.ok(ids.has(enemyId), `${enemyId} must be a real roster hull`);
    assert.match(mechanic, /^(line|power:.+)$/, `${enemyId}'s mechanic must name a verb the player can use`);
  }
});

test('the latch resolution reads the same hull id the announcer reads (data.lootTableId)', () => {
  withLane(({ lane, bus }) => {
    lane.offer(CODEX);
    // A latch whose target id resolves to nothing in the world teaches nothing.
    bus.emit('tether:latched', { sourceId: 1, targetId: 9999 });
    assert.equal(lane.visibleId(), CODEX.id);
    bus.emit('tether:latched', { sourceId: 1, targetId: null });
    assert.equal(lane.visibleId(), CODEX.id);
    // The detonator dart is a taught Line hull too: catching one counts the same as a Wasp.
    lane.retire(CODEX.id);
    resetSwarmTeachingSession();
  });
  resetSwarmTeachingSession();
  const env = installDom();
  const bus = createBus();
  const state = createState();
  state.entities = { get: (id) => (id === 21 ? { id: 21, type: 'ship', data: { lootTableId: 'detonator_dart' } } : null) };
  const lane = mountSwarmTeaching({ bus, state, ttlMs: 60_000 });
  try {
    bus.emit('ui:loadingHidden', { mode: 'flight' });
    lane.offer({ ...CODEX, id: 'swarm:teach:detonator_dart' });
    bus.emit('tether:latched', { sourceId: 1, targetId: 21 });
    assert.equal(lane.visibleId(), null, 'a taught hull on the Line retires the Line lesson');
  } finally {
    lane.destroy();
    resetSwarmTeachingSession();
    env.restore();
  }
});
