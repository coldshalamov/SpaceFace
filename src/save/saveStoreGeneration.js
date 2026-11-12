// Canonical per-realm save-store generation. Importing this module does not touch storage.
const LS_PREFIX = 'sf.save.';
const RECOVERY_PREFIX = 'sf.recovery.';

// Save-store write generation: detecting slot changes used to mean walking + hashing every
// stored blob on EVERY listSlots call — multi-MB getItem copies plus an FNV-1a pass per
// character, synchronously inside the menu render path. A generation counter bumps on the
// same three write APIs the store uses (patched once so dynamically-bound call sites still
// route through it) and on the window 'storage' event for cross-tab writes. The rescan — with
// its full per-blob verification — then only runs when the generation moved; an unchanged
// generation proves the blobs identical for every API-mediated write. The one uncovered
// writer is a devtools-style `localStorage['sf.save.x'] = ...` property assignment, whose
// worst consequence is a stale slot card — never hidden corruption, because a real load
// re-validates every byte of the envelope.
export let saveStoreGeneration = 0;
// >0 while a boot-reconcile apply writes through the silenced facade: its own writes make
// storage match the merged map by construction, so they must not bump the generation the
// post-apply cache stamp compares. Foreign writes still bump — they arrive outside the flag.
let _saveStoreApplySilenced = 0;
let _saveStoreTrackedObject = null;
// Optional subscriber for save-store writes — the save system installs its speculative
// re-arm here so a mid-dwell write can refresh an armed generation instead of letting
// it go stale until the click.
let _onSaveStoreBump = null;

export function bumpSaveStoreGeneration(key, value) {
  if (_saveStoreApplySilenced > 0) return;
  if (key != null) {
    const k = String(key);
    // sf.settings.* rows ride the shared-store mirror too; an untracked settings write
    // inside a collect's generation bracket can ship a stale row in the materialized map.
    if (!k.startsWith(LS_PREFIX) && !k.startsWith(RECOVERY_PREFIX) && !k.startsWith('sf.settings.')) return;
  }
  saveStoreGeneration++;
  if (_onSaveStoreBump) {
    try { _onSaveStoreBump(key, value); } catch (err) { /* subscriber is best-effort */ }
  }
}

export function installSaveStoreWriteTracking() {
  if (typeof localStorage === 'undefined') return;
  if (_saveStoreTrackedObject === localStorage) return;
  _saveStoreTrackedObject = localStorage;
  // A swapped store object (test mocks, host replacement) cannot share the old generation's
  // signature — bump so the first signature after the swap always rescans.
  saveStoreGeneration++;
  const target = (typeof Storage === 'function' && localStorage instanceof Storage)
    ? Storage.prototype : localStorage;
  for (const name of ['setItem', 'removeItem', 'clear']) {
    const original = target[name];
    if (typeof original !== 'function' || original.spacefaceSaveTracking === true) continue;
    const wrapped = function (...args) {
      const result = original.apply(this, args);
      // 'clear' takes no key — treat it as a bump for every store, save-prefixed or not.
      // setItem forwards its value so a write to an armed slot's own key can re-arm the
      // speculation off the bytes in hand instead of reading them back in this task.
      bumpSaveStoreGeneration(name === 'clear' ? null : args[0], name === 'setItem' ? args[1] : undefined);
      return result;
    };
    wrapped.spacefaceSaveTracking = true;
    target[name] = wrapped;
  }
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('storage', (event) => {
      bumpSaveStoreGeneration(event && event.key, event && event.newValue);
    });
  }
}

export function beginSaveStoreApply() {
  _saveStoreApplySilenced++;
}

export function endSaveStoreApply() {
  _saveStoreApplySilenced--;
}

export function setSaveStoreBumpCallback(callback) {
  _onSaveStoreBump = callback;
}

export function saveStoreSignature() {
  installSaveStoreWriteTracking();
  return 'gen:' + saveStoreGeneration;
}
