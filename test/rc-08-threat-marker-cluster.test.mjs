// RC-08 — an off-screen hostile's edge marker must sit BESIDE the ORRERY furniture, not over it.
//
// The live power rail is the bottom-left Cluster (hull rings, Speed Dial, ordnance crescent) —
// a 760x540 canvas anchored left:18 (8 under 1400px), bottom:24, scaled by --orr-cluster-scale
// (.85/.7/.6 at >1700/>1300/else) times --sf-hud-edge-fit (.85/.75/.62 under 1279w/719h,
// 1099w/659h, 959w/599h — hudStyles.js). The old reservation was a generic bottom-CENTRE rail
// box from the pre-ORRERY HUD: it covered none of the Cluster, so a lower-left shooter pinned
// its mark straight onto the dial and the BLAST key. These pins drive the real layout pass with
// fake DOM/window plumbing and assert the published marker box never enters the furniture rect.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createThreatHalo } from '../src/ui/threatHalo.js';

function mockDocument() {
  const elements = [];
  const fakeElement = (tag) => {
    const el = {
      tagName: String(tag || 'div').toUpperCase(),
      className: '',
      attributes: {},
      style: {},
      children: [],
      innerHTML: '',
      parentNode: null,
      setAttribute(k, v) { this.attributes[k] = String(v); },
      removeAttribute(k) { delete this.attributes[k]; },
      getAttribute(k) { return this.attributes[k]; },
      appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
      removeChild(child) {
        const idx = this.children.indexOf(child);
        if (idx >= 0) this.children.splice(idx, 1);
        child.parentNode = null;
      },
    };
    elements.push(el);
    return el;
  };
  return { elements, document: { createElement: fakeElement } };
}

function visibleArcs(mock) {
  return mock.elements.filter(
    (el) => String(el.className).includes('sf-threat-halo__slot--arc') && el.style.display === 'block');
}

/** The visor power-bar footprint the halo mirrors (1280×720, 1366×650, 1920×1080, 1024×640). */
function clusterRect(width, height) {
  const safeInsetX = Math.max(0, (width - height * 16 / 9) / 2);
  const safeFrameW = Math.max(320, width - 2 * safeInsetX);
  const visorWidth = width <= 760
    ? Math.max(280, width - 36)
    : (width <= 1200 ? Math.min(width * 0.54, safeFrameW * 0.56) : Math.min(width * 0.49, safeFrameW * 0.54, 792));
  const visorLeft = Math.max(12, Math.min(24, width * 0.01435)) + safeInsetX;
  const visorBottom = Math.max(24, Math.min(43, height * 0.0436));
  const visorHeight = width <= 1200 ? 182 : 244;
  return { x: 0, y: height - visorBottom - visorHeight, width: visorLeft + visorWidth, height: visorBottom + visorHeight };
}

function dockRect(width, height) {
  const safeInsetX = Math.max(0, (width - height * 16 / 9) / 2);
  const safeFrameW = Math.max(320, width - 2 * safeInsetX);
  const edge = Math.min(32, Math.max(16, height * 0.024));
  const edgeFit = (width <= 959 || height <= 599) ? 0.62
    : (width <= 1099 || height <= 659) ? 0.75
    : (width <= 1279 || height <= 719) ? 0.85 : 1;
  const chartW = Math.min(Math.max(216, Math.min(462, width * 0.2763)), safeFrameW * 0.30);
  const chartH = Math.max(112, Math.min(207, width * 0.1238)) + 64;
  const dockW = Math.max(chartW, (width <= 760 || height <= 620) ? 204 : ((width <= 900 || height <= 650) ? 220 : 256));
  const w = Math.max(edge + dockW * edgeFit, Math.max(12, Math.min(20, width * 0.012)) + chartW);
  const h = Math.min(Math.max((dockW + 110) * edgeFit + edge, chartH + Math.max(16, Math.min(34, height * 0.0362))), height * 0.5);
  return { x: width - safeInsetX - w, y: height - h, width: w, height: h };
}

function overlaps(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x
    && a.y < b.y + b.height && a.y + a.height > b.y;
}

function markerBox(slot) {
  // Off-screen attacker chevron: 26x26px centred on the translate3d point.
  const m = /translate3d\((-?\d+(?:\.\d+)?)px,(-?\d+(?:\.\d+)?)px/.exec(slot.style.transform || '');
  assert.ok(m, 'the slot carries its edge transform');
  const halfW = 13;
  const halfH = 13;
  return { x: Number(m[1]) - halfW, y: Number(m[2]) - halfH, width: 26, height: 26 };
}

function boot(width, height) {
  const mock = mockDocument();
  const oldDoc = globalThis.document;
  const oldWin = globalThis.window;
  globalThis.document = mock.document;
  globalThis.window = { innerWidth: width, innerHeight: height };
  const halo = createThreatHalo(mock.document.createElement('div'));
  const player = { id: 1, type: 'ship', team: 0, alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  const shooter = {
    id: 7, type: 'ship', team: 1, alive: true,
    pos: { x: -400, z: 400 }, vel: { x: 0, z: 0 },
    data: { encounter: true, weapons: ['wpn_pulse'] },
  };
  const state = { tick: 10, simTime: 10 / 60, playerId: player.id, entityList: [player, shooter] };
  const restore = () => { globalThis.document = oldDoc; globalThis.window = oldWin; };
  return { mock, halo, player, shooter, state, restore };
}

const LOWER_LEFT = (sx, sy) => (world, out) => {
  out.x = sx; out.y = sy; out.onScreen = false; out.behind = false; return out;
};

test('RC-08: a lower-left off-screen hostile parks beside the visor power bar, never over it', () => {
  for (const [w, h, px, py] of [
    [1280, 720, -150, 820],
    [1366, 650, -160, 760],
    [1920, 1080, -200, 1260],
    [1024, 640, -120, 740],
  ]) {
    const f = boot(w, h);
    try {
      f.halo.update(f.player, f.state, LOWER_LEFT(px, py));
      const marks = visibleArcs(f.mock);
      assert.equal(marks.length, 1, `${w}x${h}: the shooter keeps its chevron — nothing hid it`);
      const box = markerBox(marks[0]);
      const cluster = clusterRect(w, h);
      assert.ok(!overlaps(box, cluster),
        `${w}x${h}: chevron ${JSON.stringify(box)} must not overlap the visor bar ${JSON.stringify(cluster)}`);
      assert.ok(!overlaps(box, dockRect(w, h)),
        `${w}x${h}: chevron must not ride under the right dock either`);
      const edge = marks[0].getAttribute('data-edge');
      assert.ok(edge === 'bottom' || edge === 'left', `${w}x${h}: a lower-left bearing stays low or left`);
      const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
      if (edge === 'bottom') assert.ok(Math.abs(cy - (h - 18)) < 0.2, 'pinned to the bottom edge band');
      else assert.ok(Math.abs(cx - 18) < 0.2, 'pinned to the left edge band');
      assert.ok(box.width >= 24 && box.height >= 24, 'chevron keeps full legible size');
    } finally {
      f.restore();
    }
  }
});

test('RC-08: a straight-down left-side hostile clears the left column and the visor bar', () => {
  const f = boot(1280, 720);
  try {
    f.halo.update(f.player, f.state, LOWER_LEFT(-300, 600));
    const marks = visibleArcs(f.mock);
    assert.equal(marks.length, 1, 'the chevron publishes between the two reservations');
    const box = markerBox(marks[0]);
    assert.ok(!overlaps(box, clusterRect(1280, 720)), 'clear of the visor bar');
    const edge = marks[0].getAttribute('data-edge');
    assert.equal(edge, 'left');
    const cx = box.x + box.width / 2;
    assert.ok(Math.abs(cx - 18) < 0.2, 'still pinned to the left edge band');
  } finally {
    f.restore();
  }
});
