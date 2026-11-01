import { freezeHiddenSubtreeMatricesSteps, unfreezeHiddenSubtreeMatricesSteps } from '../staticChildMatrices.js';
import { notePacedFrameSpend, pacedFrameSpend, PACED_FRAME_BUDGET_MS } from '../decodeTaskBudget.js';

// Culled-root subtree freeze mints drain this many roots per syncEntityViews
// pass (see _queueHiddenSubtreeFreeze) so a cull storm amortizes over frames.
const HIDDEN_FREEZE_MINT_ROOTS_PER_PASS = 6;
// Stale drops are bounded too: unbind/re-show waves can leave thousands of
// dead entries ahead of live ones, and a full-length scan inside one pass is
// itself the in-frame burst this queue exists to prevent.
const HIDDEN_FREEZE_SCAN_PER_PASS = 256;
// Dead drops (unbind-cleared flags) cost ~2 field reads — exempt them from the
// live-consult budget but still bound total pass length for a dead-entry storm.
const HIDDEN_FREEZE_VISIT_PER_PASS = 1024;
// The mint work inside each drain is node-bounded too: the Steps twins yield
// every ~1024 nodes, so a packaged-hull mint parks mid-subtree on its queue
// entry and resumes next pass instead of paying ~2x O(subtree) inside one
// presented beat.
const HIDDEN_FREEZE_MINT_YIELD_NODES = 1024;
const HIDDEN_FREEZE_NODE_BUDGET_PER_PASS = 4096;
// Boundary flap hysteresis: a mint+restore pair costs ~4 subtree visits vs ~1
// compose-visit/frame saved, so a hull re-shown within this many passes never
// mints — it keeps paying the unfrozen compose it always paid.
const HIDDEN_FREEZE_FLAP_DWELL = 3;
export function createHiddenSubtreeLifecycleMethods({ stormWarn }) {
  return {
  // Culled roots freeze their subtree matrices so the per-frame walk stops
  // recomposing them, but the freeze mint itself is O(subtree) — a cull storm
  // (the opening picture's syncEntityViews, a sector transition) sums it to
  // O(scene) inside one presented pass. The freeze is benefit-only, so mints
  // ride this queue drained a few roots per sync pass; an unfrozen culled
  // subtree keeps paying the compose it always paid.
  _queueHiddenSubtreeFreeze(mesh) {
    if (!mesh || mesh.matrixAutoUpdate !== true) return;
    const ud = mesh.userData || (mesh.userData = {});
    if (ud.sfHiddenFrozen === true || ud.sfHiddenFreezeQueued === true) {
      // The kept sfHiddenFrozen flag also marks the show->restore window: a
      // re-hide inside it cancels the pending restore outright, so a
      // sub-dwell cull->show->cull flap costs zero subtree walks. The drain's
      // abandon check would kill a parked restore iterator a pass later via
      // sfHiddenFreezeQueued anyway — stamp-killing it here is just earlier.
      // A bound (unbind-owed) restore cancels the same way: the freeze lane
      // re-owns the subtree's marks, so the owed restore is moot.
      delete ud.sfHiddenUnfreezeQueued;
      delete ud.sfHiddenUnfreezeQueuedSeq;
      delete ud.sfHiddenUnfreezeBound;
      const parkedUnfreeze = ud.sfHiddenUnfreezeIter || null;
      if (parkedUnfreeze) {
        try { parkedUnfreeze.return(); } catch (_) { /* discard proceeds */ }
        delete ud.sfHiddenUnfreezeIter;
      }
      return;
    }
    ud.sfHiddenFreezeQueued = true;
    // Queue age feeds the drain's flap dwell: a mint must only fire after the
    // root stays culled across the whole dwell window, or a first-cycle
    // cull->show flap pays the mint+restore pair for ~zero compose savings.
    ud.sfHiddenFreezeQueuedSeq = this._viewSyncSeq || 0;
    // Shared flap epoch: the unfreeze lane's own dwell only delays its stamp,
    // so a freeze queued after a cancelled unfreeze inherits the queue date of
    // a long-dead first request — this stamp is what the freezes dwell on.
    ud.sfHiddenFlapSeq = ud.sfHiddenFreezeQueuedSeq;
    if (!this._pendingHiddenFreeze) this._pendingHiddenFreeze = [];
    this._pendingHiddenFreeze.push(mesh);
  },

  _drainHiddenFreezeQueue() {
    const pending = this._pendingHiddenFreeze;
    if (!pending || pending.length === 0) return;
    // The drain rides every cook yield seam AND the per-pass sync call —
    // its per-call caps are per-INVOCATION, so an unclocked drain stacks
    // seams/frame × caps of invisible presented-frame work. Debit the wallet
    // honestly in flight and let a spent wallet park the tail after the
    // first row (progress is still guaranteed per call).
    const drainNow = () => (typeof performance !== 'undefined'
      && typeof performance.now === 'function' ? performance.now() : Date.now());
    const drainStarted = drainNow();
    const flightMode = this.state && this.state.mode === 'flight';
    try {
      const viewSeq = this._viewSyncSeq || 0;
      let minted = 0;
      let scanned = 0;
      let visited = 0;
      let nodesWorked = 0;
      let w = 0;
      const tornFreezeMints = [];
      for (let r = 0; r < pending.length; r += 1) {
        const mesh = pending[r];
        if (minted >= HIDDEN_FREEZE_MINT_ROOTS_PER_PASS || scanned >= HIDDEN_FREEZE_SCAN_PER_PASS
            || visited >= HIDDEN_FREEZE_VISIT_PER_PASS
            || nodesWorked >= HIDDEN_FREEZE_NODE_BUDGET_PER_PASS
            || (flightMode && visited > 0 && pacedFrameSpend() >= PACED_FRAME_BUDGET_MS)) {
          pending[w++] = mesh;
          continue;
        }
      visited += 1;
      const ud = mesh.userData || {};
      let iter = ud.sfHiddenFreezeIter || null;
      if (!iter) {
        // Unbind clears the flag precisely so its entry cannot mint: honor it
        // before any other check or a pooled reuse inherits a full subtree
        // freeze the world no longer owns. Dead drops are free — a mass-unbind
        // storm can't starve live entries behind its own garbage.
        if (ud.sfHiddenFreezeQueued !== true) continue;
        scanned += 1;
        // Boundary flap hysteresis: a root re-shown inside the dwell window
        // would pay ~4 subtree visits minting+restoring a freeze that saves ~1
        // compose-visit per hidden frame — defer the mint, never drop the entry.
        const lastShow = ud.sfHiddenFreezeLastShowSeq;
        // The dwell spans queue age as well as last-show: a freshly-queued entry
        // stays deferred until it has spent the full window culled — the first
        // cull->show cycle of a flap used to mint the same pass it queued.
        const dwellBase = Math.max(lastShow || 0, ud.sfHiddenFreezeQueuedSeq || 0,
          ud.sfHiddenFlapSeq || 0);
        if (viewSeq - dwellBase < HIDDEN_FREEZE_FLAP_DWELL) {
          pending[w++] = mesh;
          continue;
        }
        // A row re-shown, detached, or restored mid-queue drops out instead of
        // minting a freeze on a subtree that is live again — the queued flags
        // are consumed on the drop so a later cull window can re-queue.
        if (ud.sfHiddenFrozen === true || mesh.matrixAutoUpdate !== true
            || mesh.visible === true || !mesh.parent) {
          delete ud.sfHiddenFreezeQueued;
          delete ud.sfHiddenFreezeQueuedSeq;
          continue;
        }
        // Compose before freezing: writers skip the hook once the flag is true,
        // so the local matrix for the last pose exists only after this compose.
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        ud.sfHiddenFrozen = true;
        iter = freezeHiddenSubtreeMatricesSteps(mesh);
      } else {
        scanned += 1;
        // Abandon checks for a parked mint: the queued flag cleared (unbind),
        // the frozen flag cleared (a re-show queued the unfreeze lane, which
        // restores exactly the stamped prefix), a detached root (the stamped
        // prefix heals on re-show), or matrixAutoUpdate restored externally —
        // all kill the iterator and drop the row.
        if (ud.sfHiddenFreezeQueued !== true || ud.sfHiddenFrozen !== true
            || mesh.matrixAutoUpdate === true || mesh.visible === true || !mesh.parent) {
          try { iter.return(); } catch (_) { /* discard proceeds */ }
          delete ud.sfHiddenFreezeIter;
          delete ud.sfHiddenFreezeQueued;
          delete ud.sfHiddenFreezeQueuedSeq;
          continue;
        }
      }
      // Drive the mint under the per-pass node budget — a packaged-hull subtree
      // parks mid-walk on its own queue entry instead of landing the whole
      // freeze+mark pair inside one presented beat.
      let step = null;
      try {
        while (!(step = iter.next()).done) {
          nodesWorked += HIDDEN_FREEZE_MINT_YIELD_NODES;
          if (nodesWorked >= HIDDEN_FREEZE_NODE_BUDGET_PER_PASS) break;
        }
      } catch (_) {
        // A torn mint drops the row; sfHiddenFrozen stays true so the subtree
        // keeps the frozen prefix and a re-show restores it by stamp.
        if (tornFreezeMints.length < 4) tornFreezeMints.push(mesh && mesh.name || '?');
        step = { done: true };
      }
      if (!step || step.done !== true) {
        // The queued flag stays set while parked — unbind clearing it is how a
        // dead parked mint is detected on resume.
        ud.sfHiddenFreezeIter = iter;
        pending[w++] = mesh;
        continue;
      }
      delete ud.sfHiddenFreezeIter;
      delete ud.sfHiddenFreezeQueued;
      delete ud.sfHiddenFreezeQueuedSeq;
      minted += 1;
      }
      pending.length = w;
      if (tornFreezeMints.length > 0) {
        stormWarn('hidden-freeze-mints-torn-mid-walk-rows-dropped', '[render] hidden-freeze mints torn mid-walk; rows dropped:', tornFreezeMints.join(', '));
      }
    } finally {
      if (flightMode) notePacedFrameSpend(drainNow() - drainStarted);
    }
  },

  // The unfreeze rides the same bounded-drain shape as the freeze: a mass
  // re-show (sector re-entry, camera snap over a culled fleet, zoom-in across
  // the cull boundary) otherwise pays ~2x O(subtree) restore walks per root
  // inside one presented pass — the atomic O(scene) class relocated from the
  // cull edge to the un-cull edge. Deferral is correctness-safe: the root's
  // pose write sets matrixWorldNeedsUpdate, and the vendored updateMatrixWorld
  // descends marked subtrees under force, so the re-shown subtree keeps paying
  // the unfrozen compose it paid pre-W100 until its restore mints.
  _queueHiddenSubtreeUnfreeze(mesh) {
    if (!mesh) return;
    const ud = mesh.userData || {};
    if (ud.sfHiddenFrozen !== true || ud.sfHiddenUnfreezeQueued === true) return;
    ud.sfHiddenUnfreezeQueued = true;
    // Queue age feeds the drain's restore-side dwell: the mint must only run
    // after the root stays shown for the whole dwell window, or a first-cycle
    // cull->show flap pays the ~3-walk restore for ~zero hidden frames. The
    // queue stamp is the show epoch — sfHiddenFreezeLastShowSeq re-stamps on
    // every visible pass and so can never serve as a dwell base.
    ud.sfHiddenUnfreezeQueuedSeq = this._viewSyncSeq || 0;
    ud.sfHiddenFlapSeq = ud.sfHiddenUnfreezeQueuedSeq;
    (this._pendingHiddenUnfreeze || (this._pendingHiddenUnfreeze = [])).push(mesh);
  },

  _drainHiddenUnfreezeQueue() {
    const pending = this._pendingHiddenUnfreeze;
    if (!pending || pending.length === 0) return;
    // Twin of the freeze drain's metering: a mass re-show mints up to the
    // same caps inside the same seams, so it debits the flight wallet and
    // parks its tail on a spent wallet — first row still guaranteed per call.
    const drainNow = () => (typeof performance !== 'undefined'
      && typeof performance.now === 'function' ? performance.now() : Date.now());
    const drainStarted = drainNow();
    const flightMode = this.state && this.state.mode === 'flight';
    try {
    const viewSeq = this._viewSyncSeq || 0;
    let minted = 0;
    let scanned = 0;
    let visited = 0;
    let nodesWorked = 0;
    let w = 0;
    const tornUnfreezeMints = [];
    for (let r = 0; r < pending.length; r += 1) {
      const mesh = pending[r];
      if (minted >= HIDDEN_FREEZE_MINT_ROOTS_PER_PASS || scanned >= HIDDEN_FREEZE_SCAN_PER_PASS
          || visited >= HIDDEN_FREEZE_VISIT_PER_PASS
          || nodesWorked >= HIDDEN_FREEZE_NODE_BUDGET_PER_PASS
          || (flightMode && visited > 0 && pacedFrameSpend() >= PACED_FRAME_BUDGET_MS)) {
        pending[w++] = mesh;
        continue;
      }
      visited += 1;
      const ud = mesh.userData || {};
      let iter = ud.sfHiddenUnfreezeIter || null;
      if (!iter) {
        // Dead drops (flag cleared mid-queue — unbind also killed the iter
        // stamp) are free — same exemption as the freeze drain so an unbind
        // storm can't park live restores.
        if (ud.sfHiddenUnfreezeQueued !== true) continue;
        scanned += 1;
        // Restore-side flap dwell — the freeze mint's mirror image. The kept
        // sfHiddenFrozen flag early-outs the freeze queue on a sub-dwell
        // re-hide and this entry dead-drops at the flag check for zero walks;
        // a period>=4 flapper used to pay ~7 subtree walks per cycle for ~3
        // hidden frames of compose savings.
        // Dwell on the latest queue direction stamp, not this lane's own:
        // a cancel-then-refreeze flap would otherwise keep deferring the
        // freeze mint on the original queue date forever.
        if (viewSeq - Math.max(ud.sfHiddenUnfreezeQueuedSeq || 0, ud.sfHiddenFlapSeq || 0)
            < HIDDEN_FREEZE_FLAP_DWELL) {
          pending[w++] = mesh;
          continue;
        }
        delete ud.sfHiddenUnfreezeQueued;
        delete ud.sfHiddenUnfreezeQueuedSeq;
        // Re-culled rows dead-drop above (the kept flag's freeze-queue
        // early-out deleted this entry's flag); a detached or externally
        // re-frozen root drops here. sfHiddenFrozen is not a drop signal on
        // this path — it stays true until the mint below consumes it.
        // mesh.visible matters the same way it does on the freeze lane:
        // hide-in-place paths (submit-false/pose-fail) never touch the queue,
        // so a deferred-admission row sits invisible past the dwell — a mint
        // here would spend the restore on a mesh that draws nothing and
        // surrender the freeze's savings mid-pending.
        const boundRestore = ud.sfHiddenUnfreezeBound === true;
        if (ud.sfHiddenFreezeQueued === true
            || mesh.matrixAutoUpdate !== true
            || (boundRestore
              // Bound (unbind-owed) restores mint regardless of attach/visible
              // state — the row's next owner can't inherit frozen marks — but
              // a re-frozen row still drops: the freeze lane re-owns marks.
              ? ud.sfHiddenFrozen === true
              : (!mesh.parent || mesh.visible !== true))) {
          if (boundRestore) delete ud.sfHiddenUnfreezeBound;
          continue;
        }
        ud.sfHiddenFrozen = false;
        iter = unfreezeHiddenSubtreeMatricesSteps(mesh);
      } else {
        scanned += 1;
        // Abandon checks for a parked restore: re-culled (the freeze lane owns
        // the subtree's marks now — still-stamped nodes stay frozen for the
        // next restore), detached, hidden in place, or matrixAutoUpdate
        // re-frozen externally. An unbound row's iter stamp was already
        // deleted — it falls into the dead-entry gate above for free.
        const boundLive = ud.sfHiddenUnfreezeBound === true;
        if (ud.sfHiddenFrozen === true || ud.sfHiddenFreezeQueued === true
            || mesh.matrixAutoUpdate !== true
            || (!boundLive && (!mesh.parent || mesh.visible !== true))) {
          try { iter.return(); } catch (_) { /* discard proceeds */ }
          delete ud.sfHiddenUnfreezeIter;
          delete ud.sfHiddenUnfreezeBound;
          continue;
        }
      }
      let step = null;
      try {
        while (!(step = iter.next()).done) {
          nodesWorked += HIDDEN_FREEZE_MINT_YIELD_NODES;
          if (nodesWorked >= HIDDEN_FREEZE_NODE_BUDGET_PER_PASS) break;
        }
      } catch (_) {
        if (tornUnfreezeMints.length < 4) tornUnfreezeMints.push(mesh && mesh.name || '?');
        step = { done: true };
      }
      if (!step || step.done !== true) {
        ud.sfHiddenUnfreezeIter = iter;
        pending[w++] = mesh;
        continue;
      }
      delete ud.sfHiddenUnfreezeIter;
      delete ud.sfHiddenUnfreezeQueued;
      delete ud.sfHiddenUnfreezeBound;
      minted += 1;
    }
    pending.length = w;
    if (tornUnfreezeMints.length > 0) {
      stormWarn('hidden-unfreeze-mints-torn-mid-walk-rows-dropped', '[render] hidden-unfreeze mints torn mid-walk; rows dropped:', tornUnfreezeMints.join(', '));
    }
    } finally {
      if (flightMode) notePacedFrameSpend(drainNow() - drainStarted);
    }
  },

  };
}
