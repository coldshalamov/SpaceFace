// PQ-159.03 — Photo mode: reachable from pause; HUD hidden, free camera, exposure, no filters
// by default; capture writes a PNG for the store page. Seed 15903.
import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  PHOTO_CAPTURE_LABEL,
  PHOTO_LABEL,
  PHOTO_STORE_KIND,
  STORE_PAGE_REL,
  STORE_PAGE_SCREENSHOT,
  capturePhotoPng,
  enterPhotoMode,
  exitPhotoMode,
  isPhotoModeActive,
  pauseScreen,
  photoCaptureFilename,
  photoModeFlags,
  publishStoreStill,
  storePagePath,
  storePageScreenshotPath,
  writePhotoCapture,
} from '../src/ui/screens/pause.js';
import {
  PHOTO_EXPOSURE_DEFAULT,
  PHOTO_FILTERS_DEFAULT,
  PHOTO_MODE_SEED,
  PHOTO_STORE_ZOOM_FACTOR,
  composePhotoStoreFrame,
  createChaseCamera,
  createPhotoModeState,
  stepPhotoFreeCamera,
} from '../src/render/camera.js';
import {
  CameraDirectorMode,
  createCameraDirector,
  photoModeHoldsDirector,
} from '../src/render/cameraDirector.js';
import {
  photoModeFeelPresentation,
  resolveCollisionFeel,
} from '../src/render/feel.js';

const SEED = PHOTO_MODE_SEED;
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function installMiniDom() {
  const previous = {
    document: globalThis.document,
    window: globalThis.window,
  };
  class Mini {
    constructor(tagName = 'div') {
      this.tagName = String(tagName).toUpperCase();
      this.children = [];
      this.parentElement = null;
      this.attributes = new Map();
      this._class = new Set();
      this._text = '';
      this.hidden = false;
      this.style = {
        _props: Object.create(null),
        setProperty(name, value) { this._props[name] = value; },
        removeProperty(name) { delete this._props[name]; },
      };
      const owner = this;
      this.classList = {
        add(...names) { for (const name of names) if (name) owner._class.add(name); },
        remove(...names) { for (const name of names) owner._class.delete(name); },
        contains(name) { return owner._class.has(name); },
      };
      this.dataset = new Proxy(Object.create(null), {
        set(target, key, value) {
          target[key] = value;
          owner.attributes.set('data-' + String(key), String(value));
          return true;
        },
      });
    }
    get className() { return [...this._class].join(' '); }
    set className(value) {
      this._class.clear();
      for (const part of String(value || '').split(/\s+/)) if (part) this._class.add(part);
    }
    get textContent() {
      if (this.children.length) return this.children.map((child) => child.textContent).join('');
      return this._text;
    }
    set textContent(value) {
      this._text = String(value ?? '');
      this.children = [];
    }
    set innerHTML(value) { if (value === '') this.textContent = ''; }
    getAttribute(name) {
      if (name === 'class') return this.className;
      return this.attributes.has(name) ? this.attributes.get(name) : null;
    }
    setAttribute(name, value) {
      this.attributes.set(name, String(value));
      if (name === 'class') this.className = value;
    }
    removeAttribute(name) { this.attributes.delete(name); }
    appendChild(child) {
      if (!child) return child;
      child.parentElement = this;
      this.children.push(child);
      return child;
    }
    append(...nodes) {
      for (const node of nodes) this.appendChild(node);
      return this;
    }
    querySelector(sel) {
      const all = this.querySelectorAll(sel);
      return all[0] || null;
    }
    querySelectorAll(sel) {
      const out = [];
      const walk = (node) => {
        if (!node) return;
        if (match(node, sel)) out.push(node);
        for (const child of node.children || []) walk(child);
      };
      for (const child of this.children) walk(child);
      return out;
    }
    addEventListener() {}
    removeEventListener() {}
    focus() {}
  }
  function match(node, sel) {
    if (sel.startsWith('.')) return node.classList.contains(sel.slice(1));
    if (sel.startsWith('#')) return node.getAttribute('id') === sel.slice(1);
    if (sel.startsWith('[')) {
      const m = sel.match(/\[([^=\]]+)(?:=["']?([^"'\]]+)["']?)?\]/);
      if (!m) return false;
      const val = node.getAttribute(m[1]);
      return m[2] ? val === m[2] : val != null;
    }
    return node.tagName === String(sel).toUpperCase();
  }
  const body = new Mini('body');
  const document = {
    body,
    documentElement: body,
    head: new Mini('head'),
    createElement: (tag) => new Mini(tag),
    getElementById: () => null,
  };
  globalThis.document = document;
  globalThis.window = {
    addEventListener() {},
    removeEventListener() {},
    innerWidth: 1600,
    innerHeight: 900,
  };
  globalThis.requestAnimationFrame = (fn) => { fn(0); return 1; };
  globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  return {
    restore() {
      globalThis.document = previous.document;
      globalThis.window = previous.window;
    },
  };
}

test('pause lists Photo and presentation flags are HUD-off, free camera, no filters', () => {
  assert.equal(PHOTO_LABEL, 'Photo');
  assert.equal(PHOTO_CAPTURE_LABEL, 'Capture');
  assert.equal(PHOTO_FILTERS_DEFAULT, false);
  assert.equal(PHOTO_EXPOSURE_DEFAULT, 1);

  const pauseSrc = readFileSync(new URL('../src/ui/screens/pause.js', import.meta.url), 'utf8');
  assert.match(pauseSrc, /export const pauseScreen/);
  assert.match(pauseSrc, /PHOTO_LABEL/, 'pause must expose the Photo action');
  assert.match(pauseSrc, /enterPhoto/, 'pause must enter photo mode');

  const flags = photoModeFlags();
  assert.equal(flags.hideHud, true);
  assert.equal(flags.freeCamera, true);
  assert.equal(flags.filters, false);
  assert.equal(flags.exposure, 1);
  assert.equal(flags.kind, PHOTO_STORE_KIND);

  const state = {
    settings: { video: { bloom: true, fov: 50 } },
    camera: { zoom: 144, trauma: 0.4, focus: { x: 3, z: -2 } },
    render: {},
  };
  const photo = enterPhotoMode(state);
  assert.equal(isPhotoModeActive(state), true);
  assert.equal(photo.hideHud, true);
  assert.equal(photo.freeCamera, true);
  assert.equal(photo.filters, false);
  assert.equal(state.settings.video.bloom, false, 'filters off by default means bloom off');
  assert.equal(state.settings.video.exposure, 1);
  assert.ok(
    Math.abs(photo.zoom - 144 * PHOTO_STORE_ZOOM_FACTOR) < 1e-6,
    `store composition must open the frame (zoom=${photo.zoom})`,
  );
  assert.equal(state.camera.trauma, 0);
  exitPhotoMode(state);
  assert.equal(isPhotoModeActive(state), false);
  assert.equal(state.settings.video.bloom, true, 'exit restores the previous bloom setting');

  const dom = installMiniDom();
  try {
    const root = globalThis.document.createElement('div');
    const ctx = {
      state: {
        mode: 'paused',
        missions: { active: [] },
        nav: {},
        save: {},
        meta: {},
        ui: {},
        run: { phase: 'inactive' },
        settings: { video: { bloom: true } },
        camera: { zoom: 144, focus: { x: 0, z: 0 } },
        render: {},
      },
      bus: { emit() {}, on() { return () => {}; } },
      screenManager: { pushScreen() {}, popScreen() {}, hasScreen() { return true; } },
    };
    pauseScreen.mount(root, ctx);
    const buttons = root.querySelectorAll('button');
    const labels = buttons.map((b) => b.textContent);
    assert.ok(labels.includes('Photo'), `pause words must list Photo; got ${labels.join(', ')}`);
  } finally {
    dom.restore();
  }
  console.log(`SEED=${SEED} pausePhoto=1 flags=hideHud,freeCamera,filtersOff exposure=1`);
});

test('free camera pans from photo inputs without chasing the hull', () => {
  globalThis.window = { innerWidth: 1600, innerHeight: 900 };
  const player = {
    id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 7, mass: 20, maxSpeed: 120, flags: {}, data: {},
  };
  const state = {
    playerId: 1,
    mode: 'paused',
    entities: new Map([[1, player]]),
    settings: { video: { fov: 50, bloom: true, motionReduce: false } },
    camera: { zoom: 144, tilt: 60, lookAhead: 18, lerp: 6, trauma: 0, focus: { x: 0, z: 0 } },
    input: { aimWorld: null, axes: { x: 0, z: 0 } },
    player: {},
    ui: { screenStack: ['pause'], docked: false },
    render: {},
  };
  const camera = createChaseCamera(state);
  camera.snapToPlayer();
  const photo = createPhotoModeState(state);
  photo.inputX = 1;
  state.render.photoMode = photo;
  for (let i = 0; i < 30; i++) camera.follow(1 / 60);
  assert.ok(state.camera.focus.x > 10, `free camera must pan (focus.x=${state.camera.focus.x})`);
  player.pos.x = 80;
  const held = state.camera.focus.x;
  photo.inputX = 0;
  camera.follow(1 / 60);
  assert.ok(Math.abs(state.camera.focus.x - held) < 2, 'photo camera does not chase the hull');
  const stepped = stepPhotoFreeCamera({ ...photo, inputX: 0, inputZ: 1, focusX: 0, focusZ: 0 }, null, 1);
  assert.ok(stepped.focusZ > 0, 'WASD/step helper moves the free camera');
});

test('capture writes a PNG named for the store page (download or Electron file)', () => {
  const name = photoCaptureFilename('store', new Date('2026-09-11T12:00:00.000Z'));
  assert.match(name, /^spaceface-store-.*\.png$/);
  const canvas = { toDataURL: (type) => { assert.equal(type, 'image/png'); return PNG; } };
  const capture = capturePhotoPng(canvas, { kind: 'store' });
  assert.equal(capture.ok, true);
  assert.equal(capture.mime, 'image/png');
  assert.match(capture.filename, /^spaceface-store-.*\.png$/);
  assert.ok(capture.dataUrl.startsWith('data:image/png'));

  const downloads = [];
  const electron = [];
  const host = {
    sfDesktop: { savePhoto: (payload) => { electron.push(payload); return { ok: true }; } },
    document: {
      createElement(tag) {
        const node = { tagName: tag, click() { downloads.push(this); }, href: '', download: '', rel: '' };
        return node;
      },
    },
  };
  const written = writePhotoCapture(capture, host);
  assert.equal(written.ok, true);
  assert.equal(written.via, 'electron');
  assert.equal(electron.length, 1);
  assert.equal(electron[0].filename, capture.filename);

  const downloadHost = {
    document: {
      createElement(tag) {
        const node = { tagName: tag, click() { downloads.push({ href: node.href, download: node.download }); }, href: '', download: '', rel: '' };
        return node;
      },
    },
  };
  const viaDownload = writePhotoCapture(capture, downloadHost);
  assert.equal(viaDownload.ok, true);
  assert.equal(viaDownload.via, 'download');
  assert.equal(downloads[0].download, capture.filename);
  console.log(`SEED=${SEED} capture=${capture.filename} via=electron+download png=1`);
});

test('PQ-159.03 captures are published onto the store page', () => {
  const canvas = { toDataURL: () => PNG };
  const capture = capturePhotoPng(canvas, { kind: 'store' });
  const written = [];
  const published = publishStoreStill(capture, (rel, dataUrl) => {
    written.push({ rel, dataUrl });
  });
  assert.equal(published.ok, true);
  assert.equal(published.usedFor, 'store-page');
  assert.equal(published.slot, 'screenshot');
  assert.equal(published.path, storePageScreenshotPath());
  assert.equal(published.filename, STORE_PAGE_SCREENSHOT);
  assert.equal(written[0].rel, storePagePath(capture.filename));
  assert.equal(written[1].rel, storePageScreenshotPath());
  const host = {
    writeStorePage: (rel, dataUrl) => written.push({ rel, dataUrl }),
  };
  const via = writePhotoCapture(capture, host);
  assert.equal(via.ok, true);
  assert.equal(via.via, 'store-page');
  assert.equal(via.storePage.usedFor, 'store-page');
  assert.equal(via.storePage.path, storePageScreenshotPath());
  console.log(`SEED=${SEED} storePage=${published.path} archive=${published.archive}`);
  const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
  const live = path.join(root, STORE_PAGE_REL, STORE_PAGE_SCREENSHOT);
  assert.equal(existsSync(live), true, 'headed store still must live on the store page path');
  const buf = readFileSync(live);
  assert.ok(buf.length > 1000, 'store still is a real PNG, not a 1x1 stand-in');
  assert.equal(buf.toString('ascii', 1, 4), 'PNG');
});

test('director holds FOLLOW on a taut line while photo mode is live', () => {
  const player = {
    id: 1, type: 'ship', alive: true, team: 0,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 7,
  };
  const rock = {
    id: 2, type: 'asteroid', alive: true,
    pos: { x: 80, z: 0 }, vel: { x: 0, z: 0 }, radius: 12,
  };
  const state = {
    playerId: 1,
    entities: new Map([[1, player], [2, rock]]),
    player: { tether: { active: true, targetId: 2, phase: 'loaded', load: 0.55, restLength: 100 } },
    render: {
      photoMode: { active: true, focusX: 12, focusZ: -8, zoom: 170 },
    },
    camera: { zoom: 144, tilt: 60 },
    settings: { video: { fov: 50 } },
  };
  assert.equal(photoModeHoldsDirector(state), true);
  const director = createCameraDirector();
  const view = { followX: 0, followZ: 0, followZoom: 144, fov: 50, aspect: 16 / 9, tiltDeg: 60 };
  const out = director.step(1 / 60, state, player, view);
  assert.equal(out.mode, CameraDirectorMode.FOLLOW);
  assert.equal(out.focusX, 12);
  assert.equal(out.focusZ, -8);
  assert.equal(out.zoom, 170);
  state.render.photoMode.active = false;
  const live = director.step(1 / 60, state, player, view);
  assert.equal(live.mode, CameraDirectorMode.TWO_BODY);
  console.log(`SEED=${SEED} directorPhoto=FOLLOW directorLive=${live.mode}`);
});

test('feel punch is silent in photo mode so a store still is clean', () => {
  const flight = resolveCollisionFeel({ id: 'contact' }, {
    mode: 'flight', deltaV: 80, momentum: 2000, kickDirX: 1, kickDirZ: 0,
  });
  assert.ok(flight && flight.kickWu > 0, 'ordinary flight still gets a kick');

  const silenced = resolveCollisionFeel({ id: 'contact' }, {
    mode: 'flight', deltaV: 80, momentum: 2000, kickDirX: 1, kickDirZ: 0, photoMode: true,
  });
  assert.equal(silenced, null);

  const viaState = resolveCollisionFeel({ id: 'contact' }, {
    mode: 'flight', deltaV: 80, momentum: 2000,
    state: { render: { photoMode: { active: true } } },
  });
  assert.equal(viaState, null);

  const flags = photoModeFeelPresentation({ render: { photoMode: { active: true } } });
  assert.equal(flags.silencePunch, true);
  assert.equal(flags.hideVignette, true);
  assert.equal(flags.hideSpeedLines, true);

  const off = photoModeFeelPresentation({ render: { photoMode: { active: false } } });
  assert.equal(off.silencePunch, false);

  const state = {
    camera: { zoom: 144, trauma: 0.5 },
    render: {},
    settings: { video: { bloom: true, fov: 50 } },
  };
  const photo = createPhotoModeState(state);
  composePhotoStoreFrame(state, photo);
  assert.equal(photo.filters, false);
  assert.equal(state.camera.trauma, 0);
  const held = photo.zoom;
  composePhotoStoreFrame(state, photo);
  assert.equal(photo.zoom, held, 'store composition must not compound');
  console.log(`SEED=${SEED} feelPhoto=silent storeZoom=${held.toFixed(1)}`);
});
