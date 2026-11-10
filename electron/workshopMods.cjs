// electron/workshopMods.cjs — PQ-172.01 Steam Workshop bridge for the user content directory.
//
// Same contract as electron/steamworks.cjs: the steamworks.js binding is optional and absent
// outside the Steam build, so every operation degrades to {ok:false, available:false, reason}
// instead of throwing. The renderer sends only a manifest mod id — never a path — and this side
// resolves it under the mounted content directory.
//
// Two operations:
//   publishMod({modId}) — create (or update, when mod.json already carries workshopItemId) a UGC
//     item whose content is the pack's directory. First publish stamps workshopItemId back into
//     mod.json so later publishes update the same item.
//   syncSubscribed()    — mirror each subscribed item's installed folder into
//     <contentDir>/workshop-<itemId>/ (contract files only: mod.json + the four kind dirs of
//     JSON), stamp the .sf-workshop-item marker, and prune mirrors the player unsubscribed from.
//     The .00 loader then picks packs up through the ordinary scan — one directory contract for
//     local and Workshop content.
//
// Workshop items are data only. The loader's no-script-mods boundary is unchanged: mirrored JSON
// flows through the same validators as hand-dropped packs.

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  CONTENT_KINDS,
  MANIFEST_NAME,
  WORKSHOP_MARKER_NAME,
  readManifest,
  readWorkshopMarker,
} = require('../scripts/lib/userContentStore.cjs');

const WORKSHOP_STATUS_CHANNEL = 'spaceface:workshop-status';
const WORKSHOP_PUBLISH_CHANNEL = 'spaceface:workshop-publish';
const WORKSHOP_SYNC_CHANNEL = 'spaceface:workshop-sync';

const MOD_ID_RE = /^[a-z0-9][a-z0-9._-]{0,79}$/i;
const MIRROR_DIR_RE = /^workshop-([1-9][0-9]{0,19})$/;
const ITEM_ID_RE = /^[1-9][0-9]{0,19}$/;
// ISteamUGC EItemState bits (partner.steamgames.com/doc/api/ISteamUGC).
const ITEM_STATE_INSTALLED = 4;
const ITEM_STATE_NEEDS_UPDATE = 8;
const WORKSHOP_TAG = 'spaceface-content-pack';
const DOWNLOAD_POLL_MS = 500;
const DOWNLOAD_POLL_LIMIT = 60;          // 30 s of polling for a tiny JSON pack
const MIRROR_FILE_LIMIT = 2048;

function createWorkshopBridge({
  adapter = null,
  userContentDir = null,          // string | (() => string|null) — resolved lazily, Electron userData moves
  receipt = null,
} = {}) {
  const log = typeof receipt === 'function' ? receipt : () => {};
  const contentDir = typeof userContentDir === 'function' ? userContentDir : () => userContentDir;

  function workshopApi() {
    if (!adapter || typeof adapter.workshop !== 'function') return null;
    try {
      return adapter.workshop();
    } catch (_) {
      return null;
    }
  }

  function unavailableReason() {
    if (!adapter || typeof adapter.publicStatus !== 'function') return 'adapter-absent';
    const status = adapter.publicStatus();
    return status && status.available ? 'workshop-api-absent' : (status && status.reason) || 'unavailable';
  }

  function unavailable() {
    return { ok: false, available: false, reason: unavailableReason() };
  }

  /** modId → the pack dir under the mounted content root. Local packs only — mirrors refuse. */
  function resolveLocalModDir(modId) {
    const dir = contentDir();
    if (!dir) return { error: 'no content directory mounted' };
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (error) {
      return { error: `content dir unreadable: ${error.message}` };
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || MIRROR_DIR_RE.test(entry.name)) continue;
      const modDir = path.join(dir, entry.name);
      const { manifest } = readManifest(modDir);
      if (!manifest || manifest.id !== modId) continue;
      if (readWorkshopMarker(modDir) != null) {
        return { error: 'cannot publish a synced Workshop mirror' };
      }
      return { dir: modDir, manifest };
    }
    return { error: `no local content pack with id "${modId}"` };
  }

  /** Stamp the published item id into mod.json so a re-publish updates instead of duplicating. */
  function writeWorkshopItemId(modDir, itemId) {
    const filePath = path.join(modDir, MANIFEST_NAME);
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    parsed.workshopItemId = String(itemId);
    fs.writeFileSync(filePath, JSON.stringify(parsed, null, 2) + '\n', 'utf8');
  }

  async function status() {
    const ws = workshopApi();
    if (!ws) return { available: false, reason: unavailableReason(), distribution: adapter ? adapter.distribution : 'direct', items: [] };
    let ids;
    try {
      ids = await ws.getSubscribedItems();
    } catch (error) {
      log('workshop-status-failed', { message: String((error && error.message) || error).slice(0, 300) });
      return { available: true, reason: 'query-failed', distribution: adapter.distribution, items: [] };
    }
    const items = (Array.isArray(ids) ? ids : []).map((raw) => {
      const itemId = String(raw);
      let installed = false;
      try {
        if (typeof ws.installInfo === 'function') installed = !!ws.installInfo(BigInt(raw));
        else if (typeof ws.state === 'function') installed = (ws.state(BigInt(raw)) & ITEM_STATE_INSTALLED) !== 0;
      } catch (_) { /* leave installed false */ }
      return { itemId, installed };
    });
    return { available: true, reason: 'ok', distribution: adapter.distribution, items };
  }

  async function publishMod(payload) {
    const ws = workshopApi();
    if (!ws) return unavailable();
    const modId = payload && typeof payload.modId === 'string' ? payload.modId.trim() : '';
    if (!MOD_ID_RE.test(modId)) return { ok: false, available: true, error: 'modId must be a safe slug' };
    const found = resolveLocalModDir(modId);
    if (found.error) return { ok: false, available: true, error: found.error };
    const { dir: modDir, manifest } = found;
    try {
      let itemId = manifest.workshopItemId && ITEM_ID_RE.test(manifest.workshopItemId)
        ? BigInt(manifest.workshopItemId) : null;
      if (itemId == null) {
        const created = await ws.createItem();
        itemId = created && created.itemId;
        if (itemId == null) return { ok: false, available: true, error: 'createItem returned no item id' };
        writeWorkshopItemId(modDir, itemId);   // stamp before the agreement exit or retries leak items
        if (created.needsToAcceptAgreement) {
          return { ok: false, available: true, itemId: String(itemId), error: 'accept the Steam Workshop agreement in the Steam client, then publish again' };
        }
      }
      const update = {
        title: manifest.name,
        description: manifest.description || manifest.name,
        contentPath: modDir,
        tags: [WORKSHOP_TAG],
        changeNote: `SpaceFace ${manifest.version}`,
      };
      const result = await ws.updateItem(itemId, update);
      if (result && result.needsToAcceptAgreement) {
        return { ok: false, available: true, itemId: String(itemId), error: 'accept the Steam Workshop agreement in the Steam client, then publish again' };
      }
      log('workshop-published', { modId, itemId: String(itemId) });
      return { ok: true, available: true, modId, itemId: String(itemId) };
    } catch (error) {
      log('workshop-publish-failed', { modId, message: String((error && error.message) || error).slice(0, 300) });
      return { ok: false, available: true, modId, error: String((error && error.message) || error).slice(0, 300) };
    }
  }

  /**
   * Copy the loader's contract files (mod.json + <kind>/*.json) from an installed item folder into
   * <contentDir>/workshop-<itemId>/. Anything outside the contract is Steam's problem, not ours —
   * the loader never reads it.
   */
  function mirrorItemDir(sourceDir, destDir, itemId) {
    const staged = [{ rel: MANIFEST_NAME, src: path.join(sourceDir, MANIFEST_NAME) }];
    let fileCount = 0;
    for (const kind of CONTENT_KINDS) {
      const kindDir = path.join(sourceDir, kind);
      let files;
      try { files = fs.readdirSync(kindDir, { withFileTypes: true }); } catch (_) { continue; }
      for (const entry of files) {
        if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.json')) continue;
        staged.push({ rel: `${kind}/${entry.name}`, src: path.join(kindDir, entry.name) });
        if (++fileCount > MIRROR_FILE_LIMIT) throw new Error('workshop item exceeds file limit');
      }
    }
    if (!fs.existsSync(path.join(sourceDir, MANIFEST_NAME))) {
      throw new Error('workshop item has no mod.json');
    }
    fs.rmSync(destDir, { recursive: true, force: true });
    fs.mkdirSync(destDir, { recursive: true });
    for (const file of staged) {
      const dest = path.join(destDir, file.rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(file.src, dest);
    }
    fs.writeFileSync(path.join(destDir, WORKSHOP_MARKER_NAME), String(itemId) + '\n', 'utf8');
  }

  async function pollInstalled(ws, itemId) {
    for (let i = 0; i < DOWNLOAD_POLL_LIMIT; i++) {
      try {
        if (typeof ws.installInfo === 'function') {
          const info = ws.installInfo(itemId);
          if (info && info.folder) return info;
        } else if (typeof ws.state === 'function') {
          const flags = ws.state(itemId);
          if ((flags & ITEM_STATE_INSTALLED) !== 0 && (flags & ITEM_STATE_NEEDS_UPDATE) === 0) {
            return { folder: null, state: flags };
          }
        }
      } catch (_) { /* keep polling */ }
      await new Promise((resolve) => setTimeout(resolve, DOWNLOAD_POLL_MS));
    }
    return null;
  }

  let syncInFlight = null;
  async function syncSubscribed() {
    if (syncInFlight) return syncInFlight;   // a repeat click joins the running sync, never doubles it
    syncInFlight = syncSubscribedOnce().finally(() => { syncInFlight = null; });
    return syncInFlight;
  }

  async function syncSubscribedOnce() {
    const ws = workshopApi();
    if (!ws) return unavailable();
    const dir = contentDir();
    if (!dir) return { ok: false, available: true, error: 'no content directory mounted' };
    let ids;
    try {
      ids = await ws.getSubscribedItems();
    } catch (error) {
      log('workshop-sync-failed', { message: String((error && error.message) || error).slice(0, 300) });
      return { ok: false, available: true, error: 'subscribed item list failed' };
    }
    const subscribed = new Set((Array.isArray(ids) ? ids : []).map(String));
    const synced = [];
    const errors = [];
    for (const raw of subscribed) {
      const label = String(raw);
      let itemId;
      try {
        itemId = BigInt(raw);
      } catch (_) {
        errors.push({ itemId: label, error: 'binding returned a non-numeric item id' });
        continue;
      }
      try {
        if (typeof ws.state === 'function') {
          const flags = ws.state(itemId);
          if ((flags & ITEM_STATE_INSTALLED) === 0 || (flags & ITEM_STATE_NEEDS_UPDATE) !== 0) {
            if (typeof ws.download === 'function' && ws.download(itemId, false) !== true) {
              errors.push({ itemId: label, error: 'download did not start' });
              continue;
            }
          }
        } else if (typeof ws.download === 'function') {
          ws.download(itemId, false);
        }
        const info = await pollInstalled(ws, itemId);
        if (!info || !info.folder) {
          errors.push({ itemId: label, error: 'item did not finish downloading' });
          continue;
        }
        const dest = path.join(dir, `workshop-${label}`);
        if (path.dirname(path.resolve(dest)) !== path.resolve(dir)) {
          errors.push({ itemId: label, error: 'resolved mirror path escaped the content dir' });
          continue;
        }
        mirrorItemDir(info.folder, dest, label);
        synced.push(label);
      } catch (error) {
        errors.push({ itemId: label, error: String((error && error.message) || error).slice(0, 200) });
      }
    }
    // Prune mirrors for items no longer subscribed. Marker-gated: a hand-made workshop-* dir the
    // player created themselves is never touched.
    const removed = [];
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const match = MIRROR_DIR_RE.exec(entry.name);
        if (!match || subscribed.has(match[1])) continue;
        const mirrorDir = path.join(dir, entry.name);
        if (readWorkshopMarker(mirrorDir) == null) continue;
        fs.rmSync(mirrorDir, { recursive: true, force: true });
        removed.push(entry.name);
      }
    } catch (error) {
      errors.push({ itemId: null, error: `prune failed: ${String((error && error.message) || error).slice(0, 200)}` });
    }
    log('workshop-synced', { synced: synced.length, removed: removed.length, errors: errors.length });
    return { ok: errors.length === 0, available: true, synced, removed, errors };
  }

  return Object.freeze({ status, publishMod, syncSubscribed });
}

module.exports = {
  WORKSHOP_STATUS_CHANNEL,
  WORKSHOP_PUBLISH_CHANNEL,
  WORKSHOP_SYNC_CHANNEL,
  createWorkshopBridge,
};
