// PQ-195.02 — the capture fork tells the player what the machine is doing, in words.
//
// Proves the read model maps every kernel phase (plus too-fast and misaligned approach samples) to
// the §5 interface vocabulary, that the contextual instrument mounts only while the situation is
// live and fully unmounts when it is not, and that a fast approach produces the slow-down wording
// BEFORE any contact. Text carries the meaning — never a raw FSM id, never colour alone.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BREAKAWAY_SP07,
  BREAKAWAY_THIRD_SHIFT_VARIANT_ID,
  PQ019_HEIST_SECTOR_ID,
  heistLaunchVariant,
} from '../src/data/heistFacilities.js';
import {
  FORK_INSTRUMENT_COPY,
  FORK_INSTRUMENT_RANGE_WU,
  classifyForkInstrument,
  createForkInstrument,
  forkInstrumentModel,
  forkReceiverWorld,
} from '../src/ui/forkInstrument.js';

const RECEIVER = forkReceiverWorld(heistLaunchVariant(BREAKAWAY_THIRD_SHIFT_VARIANT_ID).fork);
const RAW_PHASE_IDS = /^(outside|braking|settling|ready)$/;

// ── minimal DOM (the survivalHud test fixture shape) ────────────────────────────────────────────

function installDom() {
  const previous = globalThis.document;
  class El {
    constructor(tag) {
      this.tagName = String(tag).toUpperCase();
      this.children = [];
      this.parentNode = null;
      this.attributes = new Map();
      this.className = '';
      this.hidden = false;
      this._text = '';
      this.style = {};
      this.id = '';
    }
    get textContent() {
      if (this.children.length) return this.children.map((c) => c.textContent).join(' ');
      return this._text;
    }
    set textContent(value) { this._text = String(value ?? ''); this.children = []; }
    setAttribute(name, value) { this.attributes.set(name, String(value)); if (name === 'id') this.id = String(value); }
    getAttribute(name) { return name === 'id' ? this.id : (this.attributes.has(name) ? this.attributes.get(name) : null); }
    appendChild(child) {
      if (child.parentNode && typeof child.parentNode.removeChild === 'function') child.parentNode.removeChild(child);
      child.parentNode = this;
      this.children.push(child);
      return child;
    }
    removeChild(child) {
      const i = this.children.indexOf(child);
      if (i >= 0) this.children.splice(i, 1);
      child.parentNode = null;
      return child;
    }
  }
  const head = new El('head');
  const body = new El('body');
  const host = new El('div');
  host.className = 'sf-leftcontext';
  body.appendChild(host);
  const walk = (node, pred) => {
    if (pred(node)) return node;
    for (const child of node.children) {
      const found = walk(child, pred);
      if (found) return found;
    }
    return null;
  };
  globalThis.document = {
    head,
    body,
    createElement(tag) { return new El(tag); },
    getElementById(id) { return walk(head, (n) => n.id === id) || walk(body, (n) => n.id === id); },
    querySelector(sel) {
      if (sel === '.sf-leftcontext') {
        return walk(body, (n) => String(n.className).split(/\s+/).includes('sf-leftcontext'));
      }
      return null;
    },
  };
  return {
    host,
    restore() {
      if (previous === undefined) delete globalThis.document;
      else globalThis.document = previous;
    },
  };
}

// ── state builder: a live capture-fork situation at a chosen approach condition ─────────────────

function liveState({
  phase = 'outside', speed = 0, lateral = 0, depth = -60, entryCount = 0,
  tethered = false, sector = PQ019_HEIST_SECTOR_ID,
} = {}) {
  const px = RECEIVER.x + RECEIVER.nx * depth - RECEIVER.nz * lateral;
  const pz = RECEIVER.z + RECEIVER.nz * depth + RECEIVER.nx * lateral;
  const load = {
    id: 42,
    type: 'payload',
    alive: true,
    radius: BREAKAWAY_SP07.radius,
    pos: { x: px, z: pz },
    vel: { x: RECEIVER.nx * speed, z: RECEIVER.nz * speed },
  };
  const player = { id: 7, alive: true, pos: { x: 0, z: 0 } };
  const entities = new Map([[42, load], [7, player]]);
  return {
    mode: 'flight',
    simTime: 12,
    playerId: 7,
    // Production mirror: tetherGameplay writes state.player.tether, not entity.tether.
    player: { tether: { active: tethered, targetId: tethered ? 42 : null } },
    settings: {},
    world: { currentSectorId: sector },
    entities,
    heistFacilities: {
      schedule: {
        scheduleId: 'pq195-02-test', status: 'launched',
        variantId: BREAKAWAY_THIRD_SHIFT_VARIANT_ID, capsuleEntityId: 42,
      },
      capture: {
        schema: 'breakaway.capture.v1', payloadId: BREAKAWAY_SP07.stableId, receiverId: RECEIVER.id,
        phase, lastTick: 6, entryTick: phase === 'outside' ? null : 1, settledTicks: 0,
        entryCount, readyAnnounced: false,
      },
    },
  };
}

const idleState = () => ({
  mode: 'flight', playerId: 7, entities: new Map(),
  world: { currentSectorId: PQ019_HEIST_SECTOR_ID },
  heistFacilities: { schedule: null },
});

// ── (a) vocabulary: each kernel phase + too-fast + misaligned maps to §5 words ───────────────────

test('each kernel phase maps to the §5 vocabulary, never a raw FSM id', () => {
  const cases = [
    ['outside', FORK_INSTRUMENT_COPY.transit],
    ['braking', FORK_INSTRUMENT_COPY.braking],
    ['settling', FORK_INSTRUMENT_COPY.settling],
    ['ready', FORK_INSTRUMENT_COPY.settling],
  ];
  for (const [phase, expected] of cases) {
    const cls = classifyForkInstrument({ phase, speed: 20, lateral: 0 });
    assert.equal(cls.statusWord, expected, `${phase} → ${expected}`);
    assert.ok(!RAW_PHASE_IDS.test(cls.statusWord), `phase ${phase} must not print the raw id`);
  }
  assert.equal(classifyForkInstrument({ phase: 'ready' }).statusWord, 'Verifying custody',
    'ready is a custody candidate, not a payday');
  assert.equal(classifyForkInstrument({ phase: 'braking' }).statusWord, 'Arresting load');
});

test('too-fast and misaligned samples map to the actionable §5 wording', () => {
  const fast = classifyForkInstrument({ phase: 'outside', speed: 155, speedLimit: 100, lateral: 0 });
  assert.equal(fast.statusWord, 'Approach at 100 WU/s or less');
  assert.equal(fast.statusKey, 'too_fast');
  assert.equal(fast.tooFast, true);
  assert.match(fast.guidanceWord, /slow/i, 'the fast state also says to slow down');

  const wide = classifyForkInstrument({ phase: 'outside', speed: 40, lateral: 40, halfWidth: 27, radius: 16 });
  assert.equal(wide.statusWord, 'Come through the open end');
  assert.equal(wide.statusKey, 'off_mouth');
  assert.equal(wide.aligned, false);

  const aligned = classifyForkInstrument({ phase: 'outside', speed: 40, lateral: 0, halfWidth: 27, radius: 16 });
  assert.equal(aligned.aligned, true);
  assert.equal(aligned.statusWord, FORK_INSTRUMENT_COPY.transit);

  const lost = classifyForkInstrument({ phase: 'outside', speed: 5, entryCount: 1 });
  assert.equal(lost.statusWord, 'Bring the assembly around again');

  const coupled = classifyForkInstrument({ phase: 'outside', speed: 5, tethered: true });
  assert.equal(coupled.statusWord, 'Load coupled');
});

test('the read model reports identity, speed vs limit, alignment and phase for a live state', () => {
  const braking = forkInstrumentModel(liveState({ phase: 'braking', speed: 42, lateral: 0, entryCount: 1 }));
  assert.ok(braking, 'a launched capture-fork load in the approach region is live');
  assert.equal(braking.identity, 'SP-07 flywheel assembly');
  assert.equal(braking.phase, 'braking');
  assert.equal(braking.statusWord, 'Arresting load');
  assert.equal(braking.speedText, '42 / 100 WU/s');
  assert.equal(braking.alignmentWord, 'In the fork bay');
  assert.equal(braking.statusKey, 'braking');
  assert.match(braking.ariaLabel, /SP-07 flywheel assembly/);
  assert.match(braking.ariaLabel, /Arresting load/);

  // Not live: no schedule, a capsule variant, another sector, or a load far outside the region.
  assert.equal(forkInstrumentModel(idleState()), null, 'no schedule → no instrument');
  const capsule = liveState();
  capsule.heistFacilities.schedule.variantId = null;
  assert.equal(forkInstrumentModel(capsule), null, 'the contact-custody capsule run never shows the fork');
  const away = liveState();
  away.world.currentSectorId = 'helios';
  assert.equal(forkInstrumentModel(away), null, 'another sector → no instrument');
  const far = liveState({ depth: -(FORK_INSTRUMENT_RANGE_WU + 80) });
  assert.equal(forkInstrumentModel(far), null, 'outside the approach region and not tethered → no instrument');
  const farTowed = liveState({ depth: -(FORK_INSTRUMENT_RANGE_WU + 80), tethered: true });
  assert.ok(forkInstrumentModel(farTowed), 'a tethered load stays instrumented at any distance');
});

// ── (b) mounts only while live, unmounts after ───────────────────────────────────────────────────

test('the instrument mounts into .sf-leftcontext only while live and fully unmounts after', () => {
  const dom = installDom();
  try {
    const instrument = createForkInstrument();
    instrument.mount(dom.host);
    assert.equal(instrument.mounted, false, 'not mounted before any update');

    const model = instrument.update(liveState({ phase: 'braking', speed: 30, entryCount: 1 }));
    assert.ok(model, 'live update returns a model');
    assert.equal(instrument.mounted, true, 'mounts while the situation is live');
    assert.equal(dom.host.children.length, 1, 'exactly one contextual entry — never stacks');
    const root = instrument.root;
    assert.ok(String(root.className).includes('sf-fork-inst'));
    assert.equal(root.parentNode, dom.host, 'inside the existing contextual column');
    assert.match(root.textContent, /SP-07 flywheel assembly/);
    assert.match(root.textContent, /Arresting load/);
    assert.match(root.textContent, /30 \/ 100 WU\/s/);

    assert.equal(instrument.update(idleState()), null);
    assert.equal(instrument.mounted, false, 'unmounts when the situation ends');
    assert.equal(dom.host.children.length, 0, 'the column collapses back to empty');
    assert.equal(root.parentNode, null, 'the subtree is detached, not merely hidden');

    // And it can come back without stacking a second entry.
    instrument.update(liveState({ phase: 'braking', speed: 30, entryCount: 1 }));
    assert.equal(dom.host.children.length, 1, 're-reveal does not add a second anchor');
    instrument.destroy();
    assert.equal(dom.host.children.length, 0);
  } finally {
    dom.restore();
  }
});

test('reduced-motion and reduced-flash settings are honored on the instrument', () => {
  const dom = installDom();
  try {
    const instrument = createForkInstrument();
    instrument.mount(dom.host);
    const calm = liveState({ phase: 'outside', speed: 20, tethered: true });
    instrument.update(calm);
    calm.settings = { video: { motionReduce: true }, accessibility: { flashReduce: true } };
    instrument.update(calm);
    const root = instrument.root;
    assert.match(String(root.className), /sf-fork-inst--reduced-motion/);
    assert.match(String(root.className), /sf-fork-inst--reduced-flash/);
    instrument.destroy();
  } finally {
    dom.restore();
  }
});

// ── (c) a fast approach is told to slow down BEFORE contact ──────────────────────────────────────

test('a too-fast approach yields the slow-down wording before any contact', () => {
  const dom = installDom();
  try {
    const instrument = createForkInstrument();
    instrument.mount(dom.host);
    const state = liveState({ phase: 'outside', speed: 155, lateral: 0, entryCount: 0 });
    const model = instrument.update(state);
    assert.ok(model, 'the fast approach is live while still outside');
    assert.equal(model.phase, 'outside', 'no contact yet — still outside the mouth');
    assert.equal(model.acquired, false);
    assert.equal(model.statusKey, 'too_fast');
    assert.equal(model.statusWord, 'Approach at 100 WU/s or less');
    assert.equal(model.speedText, '155 / 100 WU/s');
    const shown = instrument.root.textContent;
    assert.match(shown, /Approach at 100 WU\/s or less/);
    assert.match(shown, /slow/i, 'the surface tells the player to slow down, in words');
    assert.ok(!/credits|paid|custody confirmed/i.test(shown), 'it must not claim payment or custody');
    instrument.destroy();
  } finally {
    dom.restore();
  }
});
