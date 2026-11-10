// PQ-172.01 — Steam Workshop publish/subscribe for the user content directory.
//
// The real UGC calls only exist in the Steam build (steamworks.js is an optional binding), so this
// test runs the bridge against a fake workshop namespace shaped exactly like client.workshop —
// the same evidentiary pattern test/pq-033-03-steam-adapter.test.mjs uses for achievements. The
// fake's "installed" folder is a real directory snapshot taken at updateItem time, so the sync
// mirror exercises real file I/O end to end: publish out of dir A, subscribe+sync into dir B,
// then prove the .00 scanner sees the pack identically on the other side.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createWorkshopBridge } = require('../electron/workshopMods.cjs');
const { createSteamworksAdapter } = require('../electron/steamworks.cjs');
const { scanUserContentDir, WORKSHOP_MARKER_NAME } = require('../scripts/lib/userContentStore.cjs');

const ITEM_ID_RE = /^[1-9][0-9]{0,19}$/;

function tempDir(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `sf-ws-${label}-`));
}

function writeMod(contentDir, dirName, { id, name, extraFiles = {} } = {}) {
  const modDir = path.join(contentDir, dirName);
  fs.mkdirSync(path.join(modDir, 'weapons'), { recursive: true });
  fs.writeFileSync(path.join(modDir, 'mod.json'), JSON.stringify({
    id, name, version: '1.0.0', description: `${name} description`,
  }, null, 2));
  fs.writeFileSync(path.join(modDir, 'weapons', `${id}.json`), JSON.stringify({
    id: `wpn_${id}_s`, name: `${name} Gun`, slotType: 'weapon', size: 'S', tier: 1,
    mass: 40, price: 500, dmg: 9, rof: 2, damageType: 'kinetic', energyCost: 2,
    projSpeed: 500, range: 400, tracking: 'fixed', mount: 'turret',
  }, null, 2));
  for (const [rel, body] of Object.entries(extraFiles)) {
    const target = path.join(modDir, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, body);
  }
  return modDir;
}

/** In-memory Steam UGC: publish snapshots contentPath into a hosted folder, installInfo serves it. */
function fakeWorkshop() {
  const hosted = tempDir('hosted');
  const items = new Map();      // itemId -> { update, folder }
  const subscribed = new Set(); // itemId strings
  let nextId = 900001;
  const calls = [];
  const snapshotDir = (sourceDir, destDir) => {
    fs.rmSync(destDir, { recursive: true, force: true });
    fs.mkdirSync(destDir, { recursive: true });
    for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
      const src = path.join(sourceDir, entry.name);
      const dest = path.join(destDir, entry.name);
      if (entry.isDirectory()) snapshotDir(src, dest);
      else if (entry.isFile()) fs.copyFileSync(src, dest);
    }
  };
  return {
    calls,
    items,
    hosted,
    async createItem() {
      const itemId = BigInt(nextId++);
      items.set(itemId, { update: null, folder: null });
      calls.push(['createItem', String(itemId)]);
      return { itemId, needsToAcceptAgreement: false };
    },
    async updateItem(itemId, update) {
      const item = items.get(itemId);
      assert.ok(item, `updateItem on unknown item ${itemId}`);
      item.update = update;
      item.folder = path.join(hosted, String(itemId));
      snapshotDir(update.contentPath, item.folder);
      calls.push(['updateItem', String(itemId), update.title]);
      return { itemId, needsToAcceptAgreement: false };
    },
    async subscribe(itemId) { subscribed.add(String(itemId)); calls.push(['subscribe', String(itemId)]); },
    async unsubscribe(itemId) { subscribed.delete(String(itemId)); calls.push(['unsubscribe', String(itemId)]); },
    async getSubscribedItems() { return [...subscribed].map((s) => BigInt(s)); },
    state(itemId) {
      const item = items.get(itemId);
      const subbed = subscribed.has(String(itemId));
      return (subbed ? 1 : 0) | (item && item.folder ? 4 : 0);
    },
    installInfo(itemId) {
      const item = items.get(itemId);
      return item && item.folder ? { folder: item.folder, sizeOnDisk: 1024n, timestamp: 1 } : null;
    },
    downloadInfo() { return null; },
    download() { return true; },
  };
}

function fakeAdapter(ws, { available = true } = {}) {
  return {
    workshop: () => (available ? ws : null),
    publicStatus: () => ({ available, reason: available ? 'ok' : 'steam-not-running' }),
    distribution: 'steam',
  };
}

test('workshop publish+subscribe round-trips a content pack between two content dirs', async () => {
  const ws = fakeWorkshop();
  const publisherDir = tempDir('pub');
  const subscriberDir = tempDir('sub');
  writeMod(publisherDir, 'helmet-axes', { id: 'helmet-axes', name: 'Helmet Axes' });

  const publisher = createWorkshopBridge({ adapter: fakeAdapter(ws), userContentDir: publisherDir });
  const published = await publisher.publishMod({ modId: 'helmet-axes' });
  assert.equal(published.ok, true, JSON.stringify(published));
  assert.ok(ITEM_ID_RE.test(published.itemId));

  // Publish stamped the item id into the manifest so a re-publish updates instead of duplicating.
  const manifest = JSON.parse(fs.readFileSync(path.join(publisherDir, 'helmet-axes', 'mod.json'), 'utf8'));
  assert.equal(manifest.workshopItemId, published.itemId);

  const subscriber = createWorkshopBridge({ adapter: fakeAdapter(ws), userContentDir: subscriberDir });
  await ws.subscribe(BigInt(published.itemId));
  const synced = await subscriber.syncSubscribed();
  assert.equal(synced.ok, true, JSON.stringify(synced));
  assert.deepEqual(synced.synced, [published.itemId]);

  // The .00 scanner sees the mirror as an ordinary pack — marker provenance, identical content.
  const payload = scanUserContentDir(subscriberDir);
  assert.equal(payload.mods.length, 1);
  const mod = payload.mods[0];
  assert.equal(mod.id, 'helmet-axes');
  assert.equal(mod.origin, 'workshop');
  assert.equal(mod.workshopItemId, published.itemId);
  assert.equal(mod.content.weapons.length, 1);
  assert.equal(mod.content.weapons[0].data.id, 'wpn_helmet-axes_s');

  const marker = fs.readFileSync(path.join(subscriberDir, `workshop-${published.itemId}`, WORKSHOP_MARKER_NAME), 'utf8').trim();
  assert.equal(marker, published.itemId);
});

test('re-publish updates the same Workshop item (no second createItem)', async () => {
  const ws = fakeWorkshop();
  const dir = tempDir('repub');
  writeMod(dir, 'belt-furnaces', { id: 'belt-furnaces', name: 'Belt Furnaces' });
  const bridge = createWorkshopBridge({ adapter: fakeAdapter(ws), userContentDir: dir });
  const first = await bridge.publishMod({ modId: 'belt-furnaces' });
  const second = await bridge.publishMod({ modId: 'belt-furnaces' });
  assert.equal(second.ok, true);
  assert.equal(second.itemId, first.itemId);
  assert.equal(ws.calls.filter((c) => c[0] === 'createItem').length, 1);
  assert.equal(ws.calls.filter((c) => c[0] === 'updateItem').length, 2);
});

test('unsubscribed mirrors are pruned; hand-made dirs are never touched', async () => {
  const ws = fakeWorkshop();
  const dir = tempDir('prune');
  writeMod(dir, 'yard-pins', { id: 'yard-pins', name: 'Yard Pins' });
  const bridge = createWorkshopBridge({ adapter: fakeAdapter(ws), userContentDir: dir });
  const pub = await bridge.publishMod({ modId: 'yard-pins' });
  await ws.subscribe(BigInt(pub.itemId));
  await bridge.syncSubscribed();
  const mirror = path.join(dir, `workshop-${pub.itemId}`);
  assert.ok(fs.existsSync(mirror));

  // A dir that only LOOKS like a mirror but lacks our marker is foreign — preserve it.
  const foreign = path.join(dir, 'workshop-777777');
  fs.mkdirSync(foreign, { recursive: true });

  await ws.unsubscribe(BigInt(pub.itemId));
  const res = await bridge.syncSubscribed();
  assert.equal(res.ok, true);
  assert.deepEqual(res.removed, [`workshop-${pub.itemId}`]);
  assert.ok(!fs.existsSync(mirror));
  assert.ok(fs.existsSync(foreign), 'unmarked workshop-* dir must survive pruning');
});

test('publish refuses mirrors, unknown ids, and malformed payloads', async () => {
  const ws = fakeWorkshop();
  const dir = tempDir('guards');
  writeMod(dir, 'core-braces', { id: 'core-braces', name: 'Core Braces' });
  const bridge = createWorkshopBridge({ adapter: fakeAdapter(ws), userContentDir: dir });
  const pub = await bridge.publishMod({ modId: 'core-braces' });
  await ws.subscribe(BigInt(pub.itemId));
  await bridge.syncSubscribed();

  const mirror = await bridge.publishMod({ modId: `workshop-${pub.itemId}` });
  assert.equal(mirror.ok, false, 'a synced mirror dir must not be publishable');

  const missing = await bridge.publishMod({ modId: 'no-such-pack' });
  assert.equal(missing.ok, false);
  assert.match(missing.error, /no local content pack/);

  for (const bad of [null, {}, { modId: 42 }, { modId: '../escape' }, { modId: 'a'.repeat(90) }]) {
    const res = await bridge.publishMod(bad);
    assert.equal(res.ok, false, JSON.stringify(bad));
  }
});

test('non-Steam builds report unavailable and never touch the filesystem', async () => {
  const dir = tempDir('direct');
  writeMod(dir, 'dust-filters', { id: 'dust-filters', name: 'Dust Filters' });
  const bridge = createWorkshopBridge({ adapter: fakeAdapter(null, { available: false }), userContentDir: dir });
  const status = await bridge.status();
  assert.equal(status.available, false);
  assert.equal(status.reason, 'steam-not-running');
  assert.equal((await bridge.syncSubscribed()).available, false);
  assert.equal((await bridge.publishMod({ modId: 'dust-filters' })).available, false);
  assert.deepEqual(fs.readdirSync(dir), ['dust-filters'], 'no mirror dirs created');
});

test('adapter exposes workshop only when the live client carries the UGC surface', () => {
  const withUgc = { init: () => ({ achievement: { activate: () => true }, workshop: { createItem() {}, updateItem() {}, getSubscribedItems() {}, subscribe() {} } }) };
  const withoutUgc = { init: () => ({ achievement: { activate: () => true } }) };
  const a = createSteamworksAdapter({ env: { SPACEFACE_STEAM_APP_ID: '480' }, loadBinding: () => withUgc });
  assert.ok(a.workshop(), 'workshop namespace should surface when the client carries it');
  const b = createSteamworksAdapter({ env: { SPACEFACE_STEAM_APP_ID: '480' }, loadBinding: () => withoutUgc });
  assert.equal(b.workshop(), null, 'absent UGC surface must read as unavailable');
  const c = createSteamworksAdapter({ env: {}, loadBinding: () => null });
  assert.equal(c.workshop(), null, 'no binding → no workshop');
});

test('mirrored packs land in the loader payload like local packs', async () => {
  // The end-to-end contract the packet cares about: workshop content is indistinguishable from
  // hand-dropped packs once it is in the directory — one scan path, one validator set.
  const ws = fakeWorkshop();
  const pubDir = tempDir('e2e-pub');
  const subDir = tempDir('e2e-sub');
  writeMod(pubDir, 'signal-flares', {
    id: 'signal-flares', name: 'Signal Flares',
    extraFiles: { 'notes/readme.txt': 'not part of the content contract' },
  });
  const publisher = createWorkshopBridge({ adapter: fakeAdapter(ws), userContentDir: pubDir });
  const pub = await publisher.publishMod({ modId: 'signal-flares' });
  await ws.subscribe(BigInt(pub.itemId));
  const subscriber = createWorkshopBridge({ adapter: fakeAdapter(ws), userContentDir: subDir });
  await subscriber.syncSubscribed();

  const payload = scanUserContentDir(subDir);
  const mod = payload.mods[0];
  assert.equal(mod.id, 'signal-flares');
  // Non-contract files do not mirror: the content directory carries only what the loader reads.
  assert.ok(!fs.existsSync(path.join(subDir, `workshop-${pub.itemId}`, 'notes')));
  assert.equal(mod.parseErrors.length, 0);
});
