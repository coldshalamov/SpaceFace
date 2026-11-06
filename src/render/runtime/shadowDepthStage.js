import * as THREE from 'three';
import { noteLaneFault, serviceFaultEpoch } from '../../core/warnDedup.js';
import { shadowCastAxisDistance, shadowCasterBand, shadowCasterPolicyDirtySeq } from '../shadowCasterPolicy.js';
import { noteShadowPolicyChanged } from '../shadowReceiverTally.js';
import { armCallbackAfterPresent as scheduleAfterPresent } from '../compilePresentSlice.js';
import { casterDepthMarkAnyCurrent, casterDepthMarkCurrent,
  closeShadowDepthStagingSession as closeStagingSession,
  collectUnstagedShadowCasters, collectUnstagedShadowCastersBulkSteps,
  collectUnstagedShadowCastersFlag, isUnstagedCollectOverCover,
  shadowCensusEpoch, withheldDepthCasterProvablyDead } from '../shadowDepthAdmission.js';
import { forcedFrameSpend, FORCED_FRAME_BUDGET_MS, noteForcedFrameSpend,
  notePacedFrameSpend, pacedFrameSpend, PACED_FRAME_BUDGET_MS } from '../decodeTaskBudget.js';
import { yieldToBrowser } from '../startupGpuResidency.js';

// Shadow-depth staging methods operate on the existing renderer owner.
// Dependencies are bound once; queues, lifecycle and scene state stay on `this`.
export function createShadowDepthStageMethods({
  SHADOW_DEPTH_ARM_COLLECT_MS,
  SHADOW_DEPTH_ARM_MESH_CAP,
  SHADOW_DEPTH_ARM_RESTORE_MS,
  SHADOW_DEPTH_LEDGER_MAX_SKIPS,
  SHADOW_DEPTH_PASS_NODE_CAP,
  STAGE_COLLECT_EPOCH_KEY,
  STAGE_SELF_DIRTY_KEY,
  _depthStageEntriesScratch,
  armCallbackAfterPresent = scheduleAfterPresent,
  captureObjectHome,
  closeShadowDepthStagingSession = closeStagingSession,
  driveCompileShadowDepthPipelines,
  driveShadowPolicySteps,
  laneWarn,
  restoreObjectHome,
  shadowPolicyEntityOf,
  shadowPolicyRootOf,
}) {
  return {
  _queueShadowDepthStage(root, lodLevel = null, entity = null, preserved = null) {
    if (!root || !this._shadowDepthEnabled()) return;
    const pending = this._pendingDepthStageRoots
      || (this._pendingDepthStageRoots = new Map());
    // A re-queue while pending must keep the entry's escalation fields — a
    // fresh literal would discard depthNodeScale and re-pay the undersized
    // collect+abort arm it already earned. The parked record's scale rides
    // `preserved` for the same reason (a live pending entry's fresh fields win).
    pending.set(root, {
      ...(preserved || {}),
      ...(pending.get(root) || {}),
      lodLevel,
      entity,
    });
    if (this._depthStageScheduled === true) return;
    this._depthStageScheduled = true;
    this._armDepthStage();
  },

  // The stage runs one bounded arm per presented frame: an unbounded 50-caster
  // promotion burst's reparent + census render + shadow render + link + restore used
  // to land in a single background task that delayed the next rAF by its whole cost.
  // Incremental staging is already legal — marks cover only observed draws — so each
  // arm slices a few roots, stages them, restores their policies, and re-arms while
  // the queue holds more. Roots a slice never reaches keep their withheld cast flag.
  // Detached-root shedding for the depth-stage bookkeeping. Pending and
  // parked rows are only ever reaped here and in the teardown seams — every
  // other path that removes a root from the scene must not leave its rows
  // (and every withheld mesh ref they name) pinned until an unrelated root
  // re-arms the ceremony.
  _sweepDetachedDepthStageRoots(pending) {
    if (pending) {
      for (const [root] of pending) {
        if (!root || !root.parent) {
          pending.delete(root);
          if (root && root.userData) root.userData[STAGE_SELF_DIRTY_KEY] = false;
          if (root && this._withheldDepthCasters) this._withheldDepthCasters.delete(root);
          if (root && this._policyStepsParked) this._policyStepsParked.delete(root);
          if (root && this._policyRootFaults) this._policyRootFaults.delete(root);
        }
      }
    }
    if (this._parkedDepthStageRoots) {
      for (const [root] of this._parkedDepthStageRoots) {
        if (!root || !root.parent) {
          this._parkedDepthStageRoots.delete(root);
          if (root && root.userData) {
            root.userData[STAGE_SELF_DIRTY_KEY] = false;
            delete root.userData.sfDepthUndrawableCycles;
          }
          if (root && this._withheldDepthCasters) this._withheldDepthCasters.delete(root);
          if (root && this._policyStepsParked) this._policyStepsParked.delete(root);
          if (root && this._policyRootFaults) this._policyRootFaults.delete(root);
        }
      }
    }
  },

  _armDepthStage() {
    // idleBoundMs 48 — withheld casters stay dark while the queue waits; an unbounded
    // background-priority arm could starve the whole drain for seconds under load.
    armCallbackAfterPresent(() => {
      // The clock starts at the callback top — the pending sweep, nearest-first
      // sort, and cap splice below are part of this arm's paced spend too.
      const armStartedAt = (typeof performance !== 'undefined' && typeof performance.now === 'function')
        ? performance.now() : Date.now();
      const armNow = () => (typeof performance !== 'undefined' && typeof performance.now === 'function')
        ? performance.now() : Date.now();
      const pending = this._pendingDepthStageRoots;
      // The sweep runs before the empty-queue early return: a parked or
      // withheld root that detaches on an idle drain has no other reaper.
      // Cadence the non-empty path — during a degraded epoch the arm re-drives
      // ~1/s and the O(pending+parked) sweep is the only per-tick map walk
      // that isn't event-driven; once per second or on size change bounds the
      // bookkeeping staleness without paying it every retry tick. The empty
      // path still sweeps unconditionally (parked-map reaping is its job).
      const sweepNow = armNow();
      const pendingEmpty = !pending || pending.size === 0;
      const sweepSize = (pending ? pending.size : 0)
        + (this._parkedDepthStageRoots ? this._parkedDepthStageRoots.size : 0);
      if (pendingEmpty || this._depthStageSweepAt === undefined
          || sweepNow - this._depthStageSweepAt >= 1000
          || this._depthStageSweepSize !== sweepSize) {
        this._depthStageSweepAt = sweepNow;
        this._depthStageSweepSize = sweepSize;
        this._sweepDetachedDepthStageRoots(pending);
      }
      if (!pending || pending.size === 0) {
        this._pendingDepthStageRoots = null;
        this._depthStageScheduled = false;
        this._killDepthStageSession();
        return;
      }
      // The ceremony below is the largest paced-adjacent task in the machinery:
      // census traverse + session mint + a private shadow render + restore, all
      // landing adjacent to the next present. When this frame's JS budget is
      // already spent, defer a frame — withheld casters tolerate the delay (that
      // is the withhold contract). The aging cap mirrors the glTF compile drain's
      // so a permanently-busy frame stream can't starve the drain.
      const armPacedSpent = pacedFrameSpend() >= PACED_FRAME_BUDGET_MS;
      if (armPacedSpent
          && ((this._depthStageLedgerSkips | 0) < SHADOW_DEPTH_LEDGER_MAX_SKIPS
            || forcedFrameSpend() >= FORCED_FRAME_BUDGET_MS)) {
        this._depthStageLedgerSkips = Math.min(
          (this._depthStageLedgerSkips | 0) + 1, SHADOW_DEPTH_LEDGER_MAX_SKIPS);
        this._armDepthStage();
        return;
      }
      // Fault gate, sibling-lane shape (protected-first-flight/reconcile): a
      // fault stamps a ~1 s retry delay; three faults in one epoch parks the
      // arm — but first pays one forced-wallet sync-twin rescue that restores
      // real shadow policy on the pending set, so a transient burst can't
      // leave withheld casters dark for the whole sector enter. The retry
      // branch re-arms instead of returning: a bare return would strand the
      // queue until an unrelated enqueue.
      const armServiceEpoch = serviceFaultEpoch(this.state);
      const armFaultCount = this._depthStageArmFaultEpoch === armServiceEpoch
        ? (this._depthStageArmFaults | 0) : 0;
      if (armFaultCount > 0
          && (armFaultCount >= 3 || armNow() < (this._depthStageArmRetryAt || 0))) {
        if (armFaultCount < 3) {
          this._armDepthStage();
          return;
        }
        if (this._depthStageArmDegradedEpoch !== armServiceEpoch
            && forcedFrameSpend() < FORCED_FRAME_BUDGET_MS) {
          this._depthStageArmDegradedEpoch = armServiceEpoch;
          noteLaneFault(this.state, 'depthStageArm', true);
          const rescueStart = armNow();
          const rescueDeadline = rescueStart + 8;
          for (const [root, entry] of pending) {
            if (armNow() >= rescueDeadline) break;
            if (!root || !root.parent) {
              pending.delete(root);
              continue;
            }
            // A deferred stepped compile still owns this root's marks —
            // restoring now would un-withhold casters whose depth variant
            // never linked.
            if (this._deferredDepthStageRoots && this._deferredDepthStageRoots.has(root)) continue;
            // The carve-out above only covers the arm's own compile leg; a
            // FOREIGN in-flight compile (enable-stage/opening/admission sites
            // stamp no ownership set) can still be landing marks on this
            // root's withheld set. Prove mark currency per withheld mesh
            // against the live memo sig instead of tracking ownership —
            // anything not current stays withheld for its compile's settle.
            if (this._withheldDepthCasters) {
              const rescueWithheld = this._withheldDepthCasters.get(root);
              if (rescueWithheld && rescueWithheld.size > 0) {
                // The census memo deliberately serves the previous-epoch sig
                // while a stepped re-mint pends — conservative for
                // withholding, but a restore consult reads it in the
                // fail-OPEN direction: a mark minted under the stale sig
                // compares equal and releases a caster whose depth variant
                // was never staged under the live census (one cold link
                // inside the next shadow refresh per rescued root). Only a
                // live-epoch, fully-minted sig proves restore currency —
                // anything else keeps the row withheld (fail-closed; the
                // next arm re-evaluates).
                const rescueSig = this._shadowCensusForFrame();
                const rescueMemo = this._shadowCensusMemo;
                if (rescueSig == null
                  || !rescueMemo
                  || rescueMemo.epoch !== shadowCensusEpoch()
                  || rescueMemo.pendingIter) continue;
                const rescueCamera = this.cam && this.cam.obj;
                const pruneProbation = this._withheldDepthCasterProbation
                  || (this._withheldDepthCasterProbation = new WeakMap());
                const undrawnSeen = this._withheldDepthUndrawn || null;
                // Scalar generation ids for the probation/undrawn ledgers —
                // WeakMap VALUES stay numbers so a struck entry never pins the
                // withheld Set or its root past the generation's death (the
                // WeakMap<Set,gen>/<root,gen> keys die with their objects).
                const withheldGens = this._withheldDepthGens
                  || (this._withheldDepthGens = {
                    seq: 0,
                    roots: new WeakMap(),
                    sets: new WeakMap(),
                  });
                const genFor = (map, obj) => {
                  let gen = map.get(obj);
                  if (gen == null) { gen = ++withheldGens.seq; map.set(obj, gen); }
                  return gen;
                };
                let rescueAllCurrent = true;
                for (const rescueMesh of rescueWithheld) {
                  // A member that can never mint a current mark under this
                  // root — detached without an unbind, or structurally
                  // signature-incapable — vetoes the rescue for the whole
                  // sector-enter epoch otherwise: every eval re-checks the
                  // corpse, and the arm's deny verdict can't land either
                  // (legSet never contains it). Prune it; the next subtree
                  // collect union-adds it back if it regains capability. A
                  // live-but-unmarked member still vetoes — only the
                  // provably-dead leave the set.
                  // Two-strike: detach transit (rebuild-bridge parks,
                  // packaged re-grafts, pool adoption in flight) reads
                  // identically to death for one eval, and a member pruned
                  // mid-transit re-attaches still carrying castShadow=false
                  // from its last withhold stamp — the restore's subtree
                  // walk can't reach a detached node — and presents
                  // unshadowed until a collect re-covers it. Death must
                  // persist across an eval boundary before the member
                  // leaves; a re-attaching member keeps honest coverage.
                  // Drawability evidence reads dead the same way: a member
                  // offered to the staged ortho that never drew can never
                  // mint a mark under this census — recording it (in the
                  // leg's settle eval) stops a never-drawable member from
                  // vetoing its drawable siblings' release forever.
                  const undrawn = !!(undrawnSeen
                    && undrawnSeen.get(rescueMesh) != null
                    && undrawnSeen.get(rescueMesh) === withheldGens.sets.get(rescueWithheld));
                  if (undrawn || withheldDepthCasterProvablyDead(rescueMesh, root)) {
                    const strike = pruneProbation.get(rescueMesh);
                    // Probation keys (root, set-generation): a member struck
                    // under a withheld Set that was since re-minted carries
                    // no strike — it re-probates at strike-1 inside the new
                    // generation instead of inheriting the old boundary.
                    if (strike
                      && strike.rootGen === withheldGens.roots.get(root)
                      && strike.setGen === withheldGens.sets.get(rescueWithheld)) {
                      rescueWithheld.delete(rescueMesh);
                      pruneProbation.delete(rescueMesh);
                      if (undrawnSeen) undrawnSeen.delete(rescueMesh);
                      continue;
                    }
                    // Strike every newly-dead member per eval, not one — a
                    // set decaying K members otherwise takes K+1 evals to
                    // release, each rescanning the whole set.
                    pruneProbation.set(rescueMesh, {
                      rootGen: genFor(withheldGens.roots, root),
                      setGen: genFor(withheldGens.sets, rescueWithheld),
                    });
                    rescueAllCurrent = false;
                    continue;
                  }
                  if (pruneProbation.has(rescueMesh)) pruneProbation.delete(rescueMesh);
                  if (undrawnSeen) undrawnSeen.delete(rescueMesh);
                  if (!casterDepthMarkCurrent(rescueMesh, rescueSig, rescueCamera)) {
                    rescueAllCurrent = false;
                    break;
                  }
                }
                if (rescueWithheld.size === 0) this._withheldDepthCasters.delete(root);
                if (!rescueAllCurrent) continue;
              }
            }
            if (entry && entry.authoredCastShadow === true) {
              if (root.castShadow !== true) {
                root.castShadow = true;
                this._shadowMapDirty = true;
              }
            } else try {
              const rescueOut = { receiverDelta: 0 };
              // The rescue's own wall deadline bounds between roots — inside a
              // root the drive rides the same parked-iterator contract as the
              // restore leg: a sector-scale subtree yields mid-walk instead of
              // paying one uninterruptible traverse inside the fault gate.
              const rescueChanged = driveShadowPolicySteps(this, root, root,
                (entry && entry.lodLevel) || 'lod0', {
                  ...this._shadowPolicyOptions(entry && entry.entity, root),
                  out: rescueOut,
                }, () => armNow() >= rescueDeadline);
              if (rescueChanged === null) {
                // Mid-walk: flags half-applied — the parked iterator resumes
                // on the next policy drive; the root keeps its pending slot
                // and withheld casters exactly like the restore leg's row.
                // Re-stamp self-dirty so the sync lane drives the parked walk.
                this._shadowMapDirty = true;
                if (root.userData) {
                  root.userData[STAGE_SELF_DIRTY_KEY] = shadowCasterPolicyDirtySeq(root);
                  root.userData[STAGE_COLLECT_EPOCH_KEY] = shadowCensusEpoch();
                }
                continue;
              }
              if (rescueChanged) {
                this._shadowMapDirty = true;
                if (!noteShadowPolicyChanged(this._shadowReceiverTally, {
                  changed: true,
                  receiverDelta: rescueOut.receiverDelta,
                })) {
                  this._shadowReceiversDirty = true;
                }
              }
            } catch (rescueError) {
              laneWarn(this, 'depthStageArm',
                '[render] depth-stage rescue restore failed', rescueError);
              continue;
            }
            pending.delete(root);
            if (this._withheldDepthCasters) this._withheldDepthCasters.delete(root);
            if (root.userData) {
              delete root.userData.sfDepthUndrawableCycles;
              root.userData[STAGE_SELF_DIRTY_KEY] = shadowCasterPolicyDirtySeq(root);
              root.userData[STAGE_COLLECT_EPOCH_KEY] = shadowCensusEpoch();
            }
          }
          const rescueElapsed = armNow() - rescueStart;
          if (rescueElapsed > 0) noteForcedFrameSpend(rescueElapsed);
        }
        if (pending.size === 0) {
          this._pendingDepthStageRoots = null;
          this._depthStageScheduled = false;
          this._killDepthStageSession();
          return;
        }
        // Roots the fault gate couldn't drain (rescue deadline, deferred-owned
        // marks, a spent forced wallet) would sit dark until an unrelated
        // enqueue — keep the arm scheduled. Re-evals re-hit this gate cheaply;
        // once the service epoch flips the fault count clears and the ceremony
        // drains them, and a deferred leg's .finally re-queues into the same
        // armed queue.
        this._armDepthStage();
        return;
      }
      this._depthStageLedgerSkips = 0;
      const armForcedRun = armPacedSpent;
      let slice = null;
      let restoreIdx = -1;
      try {
      const renderer = this.renderer;
      const scene = this.scene;
      const camera = this.cam && this.cam.obj;
      // Slice by visible impact — nearest the shadow ortho's center stages first, so a
      // station arriving behind off-ortho stragglers does not wait frames for its shadow.
      const px = this._framePlayerLocalX || 0;
      const pz = this._framePlayerLocalZ || 0;
      const entries = _depthStageEntriesScratch;
      entries.length = 0;
      for (const [root, entry] of pending) {
        entries.push([root, entry]);
      }
      // The per-arm cost is the near-fixed ceremony — drain the remainder in one arm and
      // halve big bursts instead of paying ceil(N/8) ceremonies over that many frames.
      const cap = Math.min(32, Math.max(8, Math.ceil(entries.length / 2)));
      // The ordering only matters when a cap trims the slice — the common
      // small-pending case skips the O(pending·log pending) sort.
      if (entries.length > cap) {
        entries.sort((a, b) => (
          shadowCastAxisDistance(a[0].position, px, pz)
          - shadowCastAxisDistance(b[0].position, px, pz)
        ));
      }
      slice = [];
      for (const [root, entry] of entries) {
        if (slice.length >= cap) break;
        slice.push([root, entry]);
        pending.delete(root);
      }
      const sliceRoots = slice.map(([root]) => root);
      let legCapped = false;
      let legSet = null;
      let legDriveFailed = false;
      let lightSig = '';
      let unstagedByRoot = null;
      if (this._shadowDepthEnabled() && renderer && scene && camera && this._shadowDepthLight()
          && sliceRoots.length > 0) {
        try {
          // Coalesced promotions share one stage; roots whose signatures were already
          // marked (opening/admission staged them under the same light census) are
          // filtered so the ceremony only pays for genuinely unlinked depth variants.
          // Census via the {seq, scene, epoch}-keyed memo: mid-sequence light
          // mutations bump shadowCensusEpoch, so the memo's freshness envelope
          // is identical to a fresh mint while repeat arm fires under one census
          // share a single scene traverse. The held session keys on the sig.
          lightSig = this._depthCollectLightSig(scene);
          // Pair the epoch beside the mint: a census mutation landing between
          // here and the drive's first call must trip censusStale — minting the
          // epoch inside the drive would miss the gap and stage under a sig the
          // live census can never reproduce.
          const armSigEpoch = shadowCensusEpoch();
          // The sig the verdict/leftover compares must answer is the one the
          // marks actually keyed under. An arm armed inside an unsigned window
          // (lightSig null: routine on every sector enter — the served memo is
          // unsigned until the stepped mint lands) would compare marks against
          // `null` — mark.l is always a real string so every check misses: the
          // undrawable verdict would deny-park every root the leg just staged,
          // the unstaged re-prove would re-collect honest sets, and the leftover
          // eval would over-withhold. Mark compares take `markSig` instead, which
          // re-consults the live memo at use time — the stepped mint may have
          // landed between the arm's mint and the compare.
          const markSig = lightSig != null ? lightSig : this._shadowCensusForFrame();
          // Per-root collect under a wall-clock deadline AND a shared node budget:
          // one fat subtree's traverse + signature mints is atomic inside the arm,
          // so an unbounded root used to push the whole arm's task past budget. A
          // root the budget aborts requeues still-withheld (the arm needs the real
          // set — over-cover can't stage) and escalates its own budget scale so a
          // permanently-over-cap root can't starve; the deadline's skipped tail
          // requeues the same way, min-1 root keeps the drain honest.
          const collectDeadline = armStartedAt + SHADOW_DEPTH_ARM_COLLECT_MS;
          const unstaged = [];
          unstagedByRoot = new Map();
          let collected = 0;
          let abortedPark = null;
          const deferredRoots = this._deferredDepthStageRoots;
          // Bulk re-stage visits only pending roots reachable from the live scene,
          // pruning nested roots from the traversal while attributing their casters
          // to every pending ancestor under the identical signature verdict. Completed roots take
          // their unstaged set wholesale; roots the walk never finished (shared
          // budget, deferred compile, a root outside the scene) fall through to the
          // ordinary per-root path untouched.
          let bulkRestage = null;
          if (sliceRoots.length >= 4 && scene && typeof scene.traverse === 'function'
              && typeof collectUnstagedShadowCastersBulkSteps === 'function') {
            const bulkSet = new Set();
            for (const bulkRoot of sliceRoots) {
              if (deferredRoots && deferredRoots.has(bulkRoot)) continue;
              bulkSet.add(bulkRoot);
            }
            if (bulkSet.size >= 4) {
              const bulkSig = lightSig != null ? lightSig : this._depthCollectLightSig(scene);
              const bulkIter = bulkSig != null
                ? collectUnstagedShadowCastersBulkSteps([scene], bulkSet, renderer, bulkSig,
                  { remaining: SHADOW_DEPTH_PASS_NODE_CAP * 4 })
                : null;
              if (bulkIter) {
                let bulkStep = null;
                try {
                  while (armNow() < collectDeadline) {
                    bulkStep = bulkIter.next();
                    if (bulkStep.done) break;
                  }
                } catch (bulkError) {
                  laneWarn(this, 'shadowDepthArm',
                    '[render] bulk restage collect faulted; falling back to per-root collects', bulkError);
                  bulkStep = null;
                }
                if (bulkStep && bulkStep.done === true && bulkStep.value) {
                  bulkRestage = bulkStep.value;
                } else {
                  try { bulkIter.return(); } catch (_) { /* deadline/fault abandon */ }
                }
              }
            }
          }
          while (collected < sliceRoots.length) {
            const entry = slice[collected] && slice[collected][1];
            // A deferred stepped compile already owns this root's casters — offering
            // them to a second ceremony would duplicate it; the marks settle, the set
            // clears, and the next arm re-collects normally.
            if (deferredRoots && deferredRoots.has(sliceRoots[collected])) {
              collected += 1;
              continue;
            }
            // The bulk walk completed this root's subtree: its attributed unstaged set
            // is the whole-subtree proof the per-root collect would mint — same mesh
            // list, same cache mint, zero re-walk.
            if (bulkRestage && bulkRestage.completedRoots
                && bulkRestage.completedRoots.has(sliceRoots[collected])) {
              const bulkFound = bulkRestage.unstagedByRoot.get(sliceRoots[collected]) || [];
              if (entry) {
                entry.unstagedCache = bulkFound.length > 0
                  ? {
                    seq: shadowCasterPolicyDirtySeq(sliceRoots[collected]),
                    epoch: armSigEpoch,
                    meshes: bulkFound,
                  } : null;
              }
              if (bulkFound.length > 0) unstagedByRoot.set(sliceRoots[collected], bulkFound);
              for (const mesh of bulkFound) unstaged.push(mesh);
              collected += 1;
              if (collected < sliceRoots.length && armNow() >= collectDeadline) break;
              continue;
            }
            // A root requeued after a completed collect carries its unstaged
            // set keyed by the root's dirtySeq — a same-generation re-collect
            // only re-proves each mesh's mark (cheap) instead of re-walking
            // the whole subtree per arm. The census epoch is deliberately NOT
            // part of the key: the mesh *set* is stale only when the subtree
            // changed (dirtySeq covers that), and the sig-sensitive part is
            // each mesh's mark — which the consult below re-proves under the
            // live arm sig regardless. Keying epoch as well threw away every
            // valid collect on any light churn and paid the full O(subtree)
            // re-walk for roots that never moved.
            // The compare sig re-consults per root: the arm's markSig is a
            // mint-time snapshot but a suspended arm resumes across presents —
            // a census landing mid-arm must re-prove marks under the live
            // census, not the sig the arm pinned when it started. The consult
            // is the epoch-gated collect's memo read (never an atomic mint).
            const collectSig = lightSig != null ? lightSig : this._depthCollectLightSig(scene);
            // Dual-sig like the verdict/leftover evals: a mid-arm census flip
            // mints marks under the live census while the pinned sig goes
            // dead — comparing under only the pin reads live-marked casters
            // unstaged (re-offer storm) and dead-marked casters staged
            // (unlinked restore → cold link). Fresh-serve only: a pending
            // re-mint serves the dead epoch and adds no witness.
            const collectMemo = this._shadowCensusMemo;
            const collectLiveSig = (collectMemo
                && collectMemo.epoch === shadowCensusEpoch() && !collectMemo.pendingIter)
              ? this._shadowCensusForFrame() : null;
            const collectSigs = collectSig != null ? [collectSig] : [];
            if (collectLiveSig != null && collectLiveSig !== collectSig) collectSigs.push(collectLiveSig);
            // Witness width note: a THIRD live sig landing between the arm's
            // mint and this compare (a suspended arm across multiple flips)
            // still reads a live-marked caster unstaged — the miss is bounded
            // to extra arm work (re-offer → re-stage), fail-closed, and the
            // verdict eval's casterDepthMarkAnyCurrent backstop keeps deny
            // verdicts honest. Widening this tuple past two sigs buys a rare
            // avoided re-stage for a wider per-mesh compare — deliberately
            // not widened.
            const cache = entry && entry.unstagedCache;
            if (cache && cache.seq === shadowCasterPolicyDirtySeq(sliceRoots[collected])) {
              const still = [];
              const live = [];
              for (const mesh of cache.meshes) {
                // Membership re-prove: a subtree member detached without a
                // dirtySeq bump stays in the tracked set — offering it stages
                // a corpse and retains it for the entry's life. The ancestor
                // walk is the same shape withheldDepthCasterProvablyDead uses;
                // reachable meshes keep their slot regardless of mark state.
                let member = false;
                for (let p = mesh; p; p = p.parent) {
                  if (p === sliceRoots[collected]) { member = true; break; }
                }
                if (!member) continue;
                live.push(mesh);
                let collectMarked = false;
                for (const sig of collectSigs) {
                  if (casterDepthMarkCurrent(mesh, sig, camera)) { collectMarked = true; break; }
                }
                if (!collectMarked) still.push(mesh);
              }
              // The tracked set stays the full collect: marks minted under a
              // census sig that flips go stale together, and a mesh dropped
              // here would be invisible to the next consult — never
              // re-collected, drawing castShadow under the new light set with
              // variants only staged under the old. Shrinking to `still`
              // saved O(set) compares per consult; the re-prove is the cheap
              // part of this cache, the stranded caster was not. (Only
              // provably-detached members leave — the membership walk above.)
              cache.meshes = live;
              cache.epoch = armSigEpoch;
              if (still.length > 0) unstagedByRoot.set(sliceRoots[collected], still);
              for (const mesh of still) unstaged.push(mesh);
              collected += 1;
              if (collected < sliceRoots.length && collected >= 1 && armNow() >= collectDeadline) break;
              continue;
            }
            if (entry && entry.unstagedCache) entry.unstagedCache = null;
            // Per-root node budget keyed on THAT root's escalation — one shared
            // wallet spent by the prefix made a mid-slice fat root's own scale
            // apply only at head position, starving every root behind it. The
            // arm's wall-clock deadline still bounds the whole leg.
            // Unsigned window: the signature collect would mint an atomic
            // whole-scene lightCensusSignature per root call right here — up to
            // 32 traverses inside one arm under a deadline that can't interrupt
            // it. Defer every unvisited root to the next arm instead; the
            // skipped-tail splice below requeues them still-withheld.
            if (collectSig == null) break;
            const collectNodeBudget = {
              remaining: SHADOW_DEPTH_PASS_NODE_CAP * ((entry && entry.depthNodeScale) || 1),
            };
            const found = collectUnstagedShadowCasters(
              renderer, [sliceRoots[collected]], scene, collectSig, collectNodeBudget);
            if (isUnstagedCollectOverCover(found)) {
              if (entry && (entry.depthNodeScale | 0) >= 8) {
                // Still over the node cap at maximum scale: the subtree can
                // never stage, so park it like an undrawable leftover — the
                // withheld flags hold, and a dirtySeq/lightSig/ortho drift or
                // the backed-off recheck re-offers it — instead of paying a
                // max-size collect walk every arm.
                const abortedRoot = sliceRoots[collected];
                const parkedMap = this._parkedDepthStageRoots
                  || (this._parkedDepthStageRoots = new Map());
                this._parkedRecheckStamp = (this._parkedRecheckStamp | 0) + 1;
                const cycles = ((abortedRoot.userData && abortedRoot.userData.sfDepthUndrawableCycles) | 0) + 1;
                if (abortedRoot.userData) abortedRoot.userData.sfDepthUndrawableCycles = cycles;
                const parkedTarget = this._keyLight && this._keyLight.target
                  ? this._keyLight.target.position : null;
                const parkedCell = (this._shadowOrthoExtent || 1) / 2;
                // A root inside the ortho earns a faster recheck cadence — its
                // withheld casters are the ones the player can see.
                const abortedGlassAdj = abortedRoot.position
                  && shadowCastAxisDistance(abortedRoot.position,
                    this._framePlayerLocalX || 0, this._framePlayerLocalZ || 0) <= parkedCell;
                parkedMap.set(abortedRoot, {
                  lodLevel: entry.lodLevel,
                  entity: entry.entity,
                  seq: shadowCasterPolicyDirtySeq(abortedRoot),
                  recheck: Math.ceil((96 + (this._parkedRecheckStamp % 32))
                    * Math.min(8, 1 << (cycles - 1)) * (abortedGlassAdj ? 0.5 : 1)),
                  lightSig: markSig,
                  lightSigEpoch: lightSig != null ? armSigEpoch
                    : (this._shadowCensusMemo ? this._shadowCensusMemo.epoch : armSigEpoch),
                  oqX: parkedTarget ? Math.round(parkedTarget.x / parkedCell) : null,
                  oqZ: parkedTarget ? Math.round(parkedTarget.z / parkedCell) : null,
                  castBand: shadowCasterBand(abortedRoot),
                  // The earned node-budget scale rides the park — a permanently
                  // over-cap root would otherwise re-pay the 1→2→4→8 escalation
                  // ladder (four aborting collects) on every unpark cycle.
                  depthNodeScale: entry.depthNodeScale,
                  // Over-cap provenance: this park waits out recheck/dirty/drift
                  // terms — a denied-style release trigger would re-pay the
                  // escalation ladder on every boundary oscillation.
                  parkKind: 'overcap',
                });
                abortedPark = abortedRoot;
              } else if (entry) {
                entry.depthNodeScale = Math.min(8, (entry.depthNodeScale || 1) * 2);
              }
              break;
            }
            if (found.length > 0) {
              unstagedByRoot.set(sliceRoots[collected], found);
              if (entry) {
                entry.unstagedCache = {
                  seq: shadowCasterPolicyDirtySeq(sliceRoots[collected]),
                  epoch: armSigEpoch,
                  meshes: found,
                };
              }
            }
            for (const mesh of found) unstaged.push(mesh);
            collected += 1;
            if (collected < sliceRoots.length && collected >= 1 && armNow() >= collectDeadline) break;
          }
          if (collected < sliceRoots.length) {
            const skipped = slice.splice(collected);
            for (const [root, entry] of skipped) {
              // The root just parked at max scale must not rejoin pending — its
              // recheck/dirty machinery already owns the next re-offer.
              if (root === abortedPark) continue;
              pending.set(root, entry);
            }
            sliceRoots.length = collected;
          }
          if (unstaged.length > 0) {
            // Cap the leg by casters, not roots: one private render pays the whole
            // slice's caster count atomically — a fat station cohort would stack
            // thousands of draws inside one background task. Remainder meshes stay
            // withheld and their roots requeue below (a restore would un-withhold
            // them before their variant links).
            legCapped = unstaged.length > SHADOW_DEPTH_ARM_MESH_CAP;
            const leg = legCapped ? unstaged.slice(0, SHADOW_DEPTH_ARM_MESH_CAP) : unstaged;
            legSet = new Set(leg);
            // The leg always rides the stepped twin: session.slice's reparent +
            // private census render + shadow render + link has no internal yield,
            // so a cap-sized leg still landed atomically inside one
            // armCallbackAfterPresent task. driveCompileShadowDepthPipelines paces
            // the same ceremony across presents; marks land a few presents later,
            // the leftover audit below requeues (never parks) a deferred leg, and
            // its meshes stay withheld until the marks commit — the cold-link
            // contract is unchanged.
            const deferredMark = this._deferredDepthStageRoots
              || (this._deferredDepthStageRoots = new Set());
            for (const [deferRoot, deferMeshes] of unstagedByRoot) {
              for (const mesh of deferMeshes) {
                if (legSet.has(mesh)) { deferredMark.add(deferRoot); break; }
              }
            }
            let legResult = null;
            driveCompileShadowDepthPipelines({
              state: this.state,
              renderer,
              light: this._shadowDepthLight(),
              camera,
              subjects: leg,
              forceEnable: false,
              THREE,
              captureObjectHome,
              restoreObjectHome,
              lightingScene: scene,
              lightSigOverride: lightSig,
              lightSigEpoch: armSigEpoch,
              lightSigFor: () => this._depthCollectLightSig(scene),
              stagingName: 'SF_ShadowPromoteDepthAdmission',
            }, yieldToBrowser).then((value) => {
              legResult = value;
            }).catch((error) => {
              legDriveFailed = true;
              laneWarn(this, 'depthStageArm',
                '[render] shadow-promote depth stage fallback failed', error);
              this._noteDepthStageArmFault();
            }).finally(() => {
              if (this._deferredDepthStageRoots) {
                for (const [deferRoot] of unstagedByRoot) {
                  this._deferredDepthStageRoots.delete(deferRoot);
                }
              }
              // The undrawable verdict belongs here: the deferred leg's marks
              // have landed by now, so a root whose whole offered set is still
              // unmarked can never stage (geometry-less, unreadable layer,
              // material-invisible). Park it on the backed-off recheck cadence
              // instead of letting it spin collect→offer→requeue forever; a
              // failed or aborted drive (closed session, shadows disabled —
              // no marks could land) leaves its roots queued for the normal
              // retry rather than parking on a verdict it never evaluated.
              const legAborted = !!(legResult && legResult.aborted === true);
              // The verdict only means something under a real sig: an arm whose
              // mint served null could never prove unmarkedness (mark.l is never
              // literal null) — denying on that compare parked every root the
              // leg successfully staged. Roots stay queued for the next arm.
              const verdictSig = lightSig != null ? lightSig : this._shadowCensusForFrame();
              // The deny verdict is only sound when the compare sig is one the
              // leg's marks actually keyed under. Two drift shapes break a
              // single pinned compare: (a) the live census flipped mid-leg —
              // the drive re-mints via lightSigFor, marks land under the new
              // sig while the arm's pinned lightSig names the old; (b) the arm
              // was unsigned and this consult serves the previous epoch's memo
              // sig while the stepped re-mint pends. Rather than skipping the
              // verdict on epoch inequality (a position-only move bumps the
              // epoch without touching the sig — under per-frame light churn
              // the skip is a silent no-op that can defer a stage/deny verdict
              // indefinitely and counts nothing), compare each mesh against
              // BOTH witnessed sigs — the arm's pinned sig and the live memo's.
              // Marks under either prove staged; a mesh unmarked under both is
              // undrawable under either census, so the verdict stays sound
              // under any drift.
              const verdictLiveSig = this._shadowCensusForFrame();
              const verdictSigs = verdictSig != null ? [verdictSig] : [];
              if (verdictLiveSig != null && verdictLiveSig !== verdictSig) {
                verdictSigs.push(verdictLiveSig);
              }
              const verdictLiveEpoch = shadowCensusEpoch();
              const verdictStale = verdictSigs.length === 0
                || (lightSig == null
                  && !!this._shadowCensusMemo
                  && this._shadowCensusMemo.epoch !== verdictLiveEpoch);
              // Drawability evidence: the leg knows exactly which offered
              // casters drew in the staged ortho — an offered-but-undrawn
              // member can never mint a mark under this census, so record
              // it on the withheld set (keyed by Set instance: a re-minted
              // set re-proves fresh). The rescue consult above prunes
              // evidence-struck members instead of letting a never-drawable
              // member veto its drawable siblings' release every eval.
              if (legResult && Array.isArray(legResult.drawn) && unstagedByRoot) {
                const drawnSet = new Set(legResult.drawn);
                const undrawnLedger = this._withheldDepthUndrawn
                  || (this._withheldDepthUndrawn = new WeakMap());
                for (const [deferRoot, deferMeshes] of unstagedByRoot) {
                  const withheldSet = this._withheldDepthCasters
                    && this._withheldDepthCasters.get(deferRoot);
                  if (!withheldSet) continue;
                  for (const mesh of deferMeshes) {
                    if (drawnSet.has(mesh)) undrawnLedger.delete(mesh);
                    else if (legSet && legSet.has(mesh)) {
                      const gens = this._withheldDepthGens
                        || (this._withheldDepthGens = { seq: 0, roots: new WeakMap(), sets: new WeakMap() });
                      let setGen = gens.sets.get(withheldSet);
                      if (setGen == null) { setGen = ++gens.seq; gens.sets.set(withheldSet, setGen); }
                      undrawnLedger.set(mesh, setGen);
                    }
                  }
                }
              }
              if (legDriveFailed !== true && legAborted !== true && legSet && !verdictStale) {
                const entryByRoot = new Map(slice);
                for (const [deferRoot, deferMeshes] of unstagedByRoot) {
                  let allUnmarked = deferMeshes.length > 0;
                  for (const mesh of deferMeshes) {
                    if (!legSet.has(mesh)) {
                      allUnmarked = false;
                      break;
                    }
                    for (const sig of verdictSigs) {
                      if (casterDepthMarkCurrent(mesh, sig, camera)) {
                        allUnmarked = false;
                        break;
                      }
                    }
                    // A mark minted mid-leg under an intermediate census the
                    // witness set doesn't name (flip landing between the arm's
                    // pin and the served memo) still proves staged — its
                    // discriminant re-proves live state; counting it unmarked
                    // denied roots that were stageable all along.
                    if (allUnmarked && casterDepthMarkAnyCurrent(mesh, camera)) {
                      allUnmarked = false;
                    }
                    if (!allUnmarked) break;
                  }
                  if (!allUnmarked || !deferRoot || !deferRoot.parent) continue;
                  const entry = entryByRoot.get(deferRoot) || {};
                  pending.delete(deferRoot);
                  const parkedMap = this._parkedDepthStageRoots
                    || (this._parkedDepthStageRoots = new Map());
                  this._parkedRecheckStamp = (this._parkedRecheckStamp | 0) + 1;
                  const cycles = ((deferRoot.userData && deferRoot.userData.sfDepthUndrawableCycles) | 0) + 1;
                  if (deferRoot.userData) deferRoot.userData.sfDepthUndrawableCycles = cycles;
                  const parkedTarget = this._keyLight && this._keyLight.target
                    ? this._keyLight.target.position : null;
                  const parkedCell = (this._shadowOrthoExtent || 1) / 2;
                  const deferGlassAdj = deferRoot.position
                    && shadowCastAxisDistance(deferRoot.position,
                      this._framePlayerLocalX || 0, this._framePlayerLocalZ || 0) <= parkedCell;
                  parkedMap.set(deferRoot, {
                    lodLevel: entry.lodLevel,
                    entity: entry.entity,
                    seq: shadowCasterPolicyDirtySeq(deferRoot),
                    recheck: Math.ceil((96 + (this._parkedRecheckStamp % 32))
                      * Math.min(8, 1 << (cycles - 1)) * (deferGlassAdj ? 0.5 : 1)),
                    lightSig: verdictSig,
                    // Stamp the epoch the sig was actually minted under: while
                    // a stepped re-mint pends the served sig is the previous
                    // epoch's — pairing it with the live epoch would claim
                    // 'evaluated under E' with an E-1 sig and hide the very
                    // drift the parked-release prefilter compares against.
                    lightSigEpoch: lightSig != null ? armSigEpoch
                      : (this._shadowCensusMemo ? this._shadowCensusMemo.epoch : armSigEpoch),
                    oqX: parkedTarget ? Math.round(parkedTarget.x / parkedCell) : null,
                    oqZ: parkedTarget ? Math.round(parkedTarget.z / parkedCell) : null,
                    castBand: shadowCasterBand(deferRoot),
                    // The earned node-budget scale rides the park so the
                    // re-queue skips re-paying the escalation ladder.
                    depthNodeScale: entry.depthNodeScale,
                    // Denied parks (unlike over-cap parks) earn a live allowCast
                    // release trigger: a root that turns castable while census,
                    // cell, and dirtySeq stand still must not wait out the
                    // escalated recheck — up to ~16 s — for its shadow.
                    denied: true,
                    // Reaching the deny mint means the arm staged-offered this
                    // root — it was castable at mint. The stamp keeps the
                    // allowCast release clause from firing on every eval.
                    deniedAllowCast: true,
                    parkKind: 'denied',
                  });
                  // Only the proven-unmarkable set stays withheld — staged
                  // siblings' casts restore on the next sync.
                  if (this._withheldDepthCasters) {
                    this._withheldDepthCasters.set(deferRoot, new Set(deferMeshes));
                  }
                }
              }
            });
          }
        } catch (error) {
          laneWarn(this, 'depthStageArm',
            '[render] shadow-promote depth stage failed', error);
          this._noteDepthStageArmFault();
        }
      }
      // A leg leaves un-marked casters under the slice: the per-root collect
      // results recorded above tell which roots still own unstaged meshes — each
      // mesh's mark tuple re-proves its CURRENT discriminant (covers the just-staged
      // marks plus any mid-slice drift) with zero re-walks, so roots still holding
      // unmarked casters keep their queue slot instead of restoring casters whose
      // depth variant never linked. Uncapped legs run this too: a mesh the leg
      // offered but never marked (draw-throw, undrawable-forever) must not have
      // its cast flag restored unproven — restoring it links the depth variant
      // inside the next presented shadow refresh, the cold link this prevents.
      let leftoverByRoot = null;
      if (unstagedByRoot) {
        // Same dual-sig rule as the verdict above: marks minted mid-leg under
        // either the arm's pinned sig or the census sig that landed since
        // both prove staged. Comparing under only one reads honestly-staged
        // meshes as leftovers and requeues roots whose marks are live.
        const leftoverMemo = this._shadowCensusMemo;
        const leftoverLiveSig = (leftoverMemo
            && leftoverMemo.epoch === shadowCensusEpoch() && !leftoverMemo.pendingIter)
          ? this._shadowCensusForFrame() : null;
        // An unsigned arm must not witness the raw serve either — while pendingIter runs
        // the memo still serves the dead epoch, and a dead-sig match reads a never-staged
        // mesh as marked, skipping its requeue (cold link). AnyCurrent is deliberately NOT
        // consulted here: it re-proves discriminants under the mark's own stored sig, so a
        // consistent dead-sig mark would read "marked" and the restore would link a
        // live-census depth variant that was never staged.
        const leftoverSig = lightSig != null ? lightSig : leftoverLiveSig;
        const leftoverSigs = leftoverSig != null ? [leftoverSig] : [];
        if (leftoverLiveSig != null && leftoverLiveSig !== leftoverSig) {
          leftoverSigs.push(leftoverLiveSig);
        }
        for (const [root, meshes] of unstagedByRoot) {
          let set = null;
          for (const mesh of meshes) {
            let leftoverMarked = false;
            for (const sig of leftoverSigs) {
              if (casterDepthMarkCurrent(mesh, sig, camera)) {
                leftoverMarked = true;
                break;
              }
            }
            if (leftoverMarked) continue;
            (set || (set = [])).push(mesh);
          }
          if (set) (leftoverByRoot || (leftoverByRoot = new Map())).set(root, set);
        }
      }
      // Re-apply the live cast policy on the staged slice: promotions whose cast
      // flag was withheld pending this stage restore now — staged roots enter the
      // cast band on already-linked depth programs; if the stage was skipped the
      // restore lands the original promotion semantics rather than leaving the
      // root permanently shadowless.
      const restoreDeadline = armNow() + SHADOW_DEPTH_ARM_RESTORE_MS;
      let restored = 0;
      restoreIdx = -1;
      for (restoreIdx = 0; restoreIdx < slice.length; restoreIdx++) {
        const [root, entry] = slice[restoreIdx];
        if (!root || !root.parent) {
          // Detached mid-arm: nothing to restore — drop the bookkeeping a
          // remount must not inherit (the arm-start sweeps only cover pending
          // and parked, and slice members already left pending).
          if (root && root.userData) {
            root.userData[STAGE_SELF_DIRTY_KEY] = false;
            delete root.userData.sfDepthUndrawableCycles;
          }
          if (root && this._withheldDepthCasters) this._withheldDepthCasters.delete(root);
          if (root && this._policyStepsParked) this._policyStepsParked.delete(root);
          if (root && this._policyRootFaults) this._policyRootFaults.delete(root);
          continue;
        }
        const { lodLevel, entity } = entry;
        // Marks for this root are still landing inside a deferred compile — keep it
        // queued with flags withheld; restoring now would un-withhold casters whose
        // depth variant has not linked.
        if (this._deferredDepthStageRoots && this._deferredDepthStageRoots.has(root)) {
          pending.set(root, entry);
          continue;
        }
        const leftover = leftoverByRoot && leftoverByRoot.get(root);
        if (leftover) {
          // Still-unmarked casters requeue — a deferred leg's marks settle
          // presents later, so the undrawable-forever verdict is rendered in the
          // drive's .finally where the marks have actually landed.
          pending.set(root, entry);
          continue;
        }
        // The arm's own whole-slice collect covered every dirty to this instant —
        // stamp the live generation so the checked sync doesn't re-collect this
        // root every presented frame (writing false left stampedSeq=-1 forever).
        if (root.userData) {
          root.userData[STAGE_SELF_DIRTY_KEY] = shadowCasterPolicyDirtySeq(root);
          root.userData[STAGE_COLLECT_EPOCH_KEY] = shadowCensusEpoch();
        }
        if (this._withheldDepthCasters) {
          this._withheldDepthCasters.delete(root);
        }
        if (root.userData) delete root.userData.sfDepthUndrawableCycles;
        if (entry && entry.authoredCastShadow === true) {
          // Producer-managed authored mint (instanced pool chunks): the root sits
          // at scene origin — an ortho band grade can't grade instances spanning
          // the sector — so the restore lands the mint's authored verdict
          // directly instead of the policy traverse (which would also rewrite the
          // authored receiveShadow mint and band-flip castShadow).
          if (root.castShadow !== true) {
            root.castShadow = true;
            this._shadowMapDirty = true;
          }
        } else try {
          // The restore's own traverse measures its receiveShadow flips — feed
          // them to the incremental tally like the checked sync does, or subtree
          // churn between withhold and restore silently drifts the count (an
          // under-count reaching 0 freezes the shadow refresh until an unrelated
          // dirty triggers a recount).
          const restoreOut = { receiverDelta: 0 };
          const restoreChanged = driveShadowPolicySteps(this, root, root, lodLevel, {
            ...this._shadowPolicyOptions(entity, root),
            out: restoreOut,
          }, () => armNow() >= restoreDeadline);
          if (restoreChanged === null) {
            // Mid-walk: flags half-applied — the root stays withheld (its
            // casters never linked past the staged marks) and resumes the
            // restore on the next arm pass via the parked iterator.
            pending.set(root, entry);
            continue;
          }
          if (restoreChanged) {
            this._shadowMapDirty = true;
            if (!noteShadowPolicyChanged(this._shadowReceiverTally, {
              changed: true,
              receiverDelta: restoreOut.receiverDelta,
            })) {
              this._shadowReceiversDirty = true;
            }
          }
        } catch (_) { /* restore is best-effort */ }
        restored += 1;
        // Restores requeue under the same deadline rule as the collect: staged
        // roots left over stay withheld one more arm — never a cold link.
        if (restored >= 1 && restoreIdx + 1 < slice.length && armNow() >= restoreDeadline) {
          restoreIdx += 1;
          break;
        }
      }
      } catch (armErr) {
        // The (b)-inverse of the fault-park contract: a persistently faulting
        // ceremony used to throw→requeue→re-arm every ~48 ms idle arm forever
        // (every sibling lane got FaultRetries+park in W109; the arm's outer
        // try had none). Bound it the same way — ≥3 faults in one service
        // epoch parks the arm until the epoch flips.
        this._noteDepthStageArmFault();
        laneWarn(this, 'depthStageArm',
          '[render] depth-stage arm faulted; queued roots re-arm', armErr);
      } finally {
        // Requeue whatever the restore loop never reached — a throw mid-slice
        // can't orphan withheld members (the slice already dropped their pending
        // slots at build; without this they stay dark until an unrelated dirty).
        if (Array.isArray(slice)) {
          for (let i = Math.max(restoreIdx, 0); i < slice.length; i++) {
            const [root, entry] = slice[i];
            if (root && root.parent) {
              pending.set(root, entry);
            } else if (root) {
              if (root.userData) {
                root.userData[STAGE_SELF_DIRTY_KEY] = false;
                delete root.userData.sfDepthUndrawableCycles;
              }
              if (this._withheldDepthCasters) this._withheldDepthCasters.delete(root);
            }
          }
        }
        // The arm's whole cost lands adjacent to the next presented frame — debit
        // the shared paced ledger so the frame's slicers see the spend, throw or not.
        const armElapsed = armNow() - armStartedAt;
        notePacedFrameSpend(armElapsed);
        if (armForcedRun) noteForcedFrameSpend(armElapsed);
        // The re-arm lives in finally: a throw mid-slice must not leave
        // _depthStageScheduled === true with live pending entries — the queue
        // would wedge permanently and withheld casters stay dark forever.
        if (pending.size > 0) {
          this._armDepthStage();
        } else {
          // Clean drain: reset the fault counter so sparse faults hours apart
          // can't accumulate into a park — only a burst of ≥3 in one epoch
          // (with the retry spacing failing) parks.
          this._depthStageArmFaults = 0;
          this._pendingDepthStageRoots = null;
          this._depthStageScheduled = false;
          this._killDepthStageSession();
        }
      }
    }, { idleBoundMs: 48 });
  },

  // Session teardown: the held staging session parks cloned lights — close it
  // once the drain empties; the next arm remints under the live census.
  _killDepthStageSession() {
    closeShadowDepthStagingSession(this.renderer);
  },

  // Shared fault ledger for the depth-stage lane: the outer arm catch, the
  // leg-drive `.catch`, the synchronous leg-setup catch and the enable-stage
  // tail all count into the same ≥3/epoch park the arm head consults — a
  // persistently-faulting leg parks the lane for the epoch instead of
  // re-arming the ceremony every ~48 ms under it.
  _noteDepthStageArmFault() {
    const armFaultEpoch = serviceFaultEpoch(this.state);
    if (this._depthStageArmFaultEpoch !== armFaultEpoch) {
      this._depthStageArmFaultEpoch = armFaultEpoch;
      this._depthStageArmFaults = 0;
    }
    this._depthStageArmFaults = (this._depthStageArmFaults | 0) + 1;
    // Sibling-lane retry spacing: a transient fault re-arms ~1 s later instead
    // of losing the whole epoch.
    this._depthStageArmRetryAt = (typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now() : Date.now()) + 1000;
    noteLaneFault(this.state, 'depthStageArm', (this._depthStageArmFaults | 0) >= 3);
  },

  _stageShadowDepthOnSettingEnable() {
    // Cast promotions applied while the map was off could neither withhold nor stage
    // (both paths gate on the setting), so their depth signatures were never observed.
    // Stage the genuinely-unstaged ones inside this handler — before the map re-enables
    // — or the first presented shadow refresh links every one of them in-frame.
    const renderer = this.renderer;
    const scene = this.scene;
    const camera = this.cam && this.cam.obj;
    if (!renderer || !scene || !camera || !this._keyLight) return;
    try {
      // Flag-only collect inside the click task — the signature-bearing recollect
      // runs per-slice in the arms anyway, so paying per-material signature strings
      // + staged-set probes for the whole scene here is pure click latency. The
      // mark-check twin also keeps already-staged casters out of the withhold:
      // enabling the map used to drop every linked caster's shadow for the drain.
      const toggleBudget = { remaining: SHADOW_DEPTH_PASS_NODE_CAP };
      // The light census is unchanged by a shadowMap.enabled flip — discarding
      // the memo here minted an artificial unsigned window where every capable
      // caster read unstaged and withheld until the stepped re-mint landed.
      const census = this._shadowCensusForFrame();
      const toggleMemo = this._shadowCensusMemo;
      // A pending re-mint serves the dead epoch's sig — the per-mesh marks it
      // classifies are wrong both ways (false keep → cold link, false withhold
      // → pop-out). Queue every root whole-subtree and let the arm re-derive
      // under the live sig, exactly like the over-cover abort path.
      const serveLive = !!(toggleMemo
        && toggleMemo.epoch === shadowCensusEpoch() && !toggleMemo.pendingIter);
      // Walk top-level roots one at a time so the node-budget abort only blurs
      // the root it died inside: a completed root whose unstaged set is empty is
      // provably mark-current — light shells, pools, and parallax roots never
      // enqueue. Roots holding unstaged casters take the per-mesh withhold; the
      // in-flight root and every unvisited sibling queue whole-subtree.
      const unstaged = [];
      const queueOverCover = [];
      const children = scene.children || [];
      for (let i = 0; i < children.length; i += 1) {
        const child = children[i];
        if (!child || child.parent !== scene) continue;
        if (!serveLive) {
          queueOverCover.push(child);
          continue;
        }
        const collected = collectUnstagedShadowCastersFlag([child], census, toggleBudget, this.cam && this.cam.obj);
        if (isUnstagedCollectOverCover(collected)) {
          // The walk outran the click budget mid-root — a partial set can't be
          // trusted for per-mesh withhold. Queue this root and every unvisited
          // sibling so the arm's deadline-bounded per-root collects re-derive
          // the real unstaged sets (queued roots withhold at their next sync).
          queueOverCover.push(child);
          for (let j = i + 1; j < children.length; j += 1) {
            const later = children[j];
            if (later && later.parent === scene) queueOverCover.push(later);
          }
          break;
        }
        for (const mesh of collected) unstaged.push(mesh);
      }
      if (unstaged.length === 0 && queueOverCover.length === 0) return;
      // The whole-scene toggle used to pay one synchronous reparent+census+compile
      // inside the settings handler — an unbounded stall on a presented frame for a
      // busy sector. Route the same stage through the arm queue instead: bounded
      // root slices across presents, nearest-first, identical restore semantics.
      const pending = this._pendingDepthStageRoots
        || (this._pendingDepthStageRoots = new Map());
      for (const child of queueOverCover) {
        if (child && !pending.has(child)) {
          const lodLevel = (child.userData && child.userData.lod && child.userData.lod.level)
            || 'lod0';
          // No inline whole-subtree withhold here: one settings flip on a busy
          // sector queues most of the scene's children and this traverse cost
          // O(scene) inside the click task. The queue + stamp below route the
          // root into the checked-sync queued withhold branches — the very next
          // presented sync applies castShadow=false (cap-exempt) before the
          // shadow refresh draws, so withhold-before-present ordering holds.
          // The band-0 stamp keeps later syncs on the cheap queued early-out —
          // the same end state the over-cover branch produces.
          // Same invalidate+stamp the withheld path pays: a queued band-1 root
          // whose dirtySeq still equals its stamp must re-collect — the census
          // drifted while shadows were OFF so its marks describe a dead light set.
          this._invalidateShadowPolicy(child);
          child.userData[STAGE_SELF_DIRTY_KEY] = shadowCasterPolicyDirtySeq(child);
          child.userData[STAGE_COLLECT_EPOCH_KEY] = shadowCensusEpoch();
          // Same parked-scale carry the checked-sync feeders run — a queued root
          // whose park earned an oversized node-scale keeps it instead of
          // re-paying the collect+abort arm.
          const parkedEntry = this._parkedDepthStageRoots
            && this._parkedDepthStageRoots.get(child);
          if (parkedEntry) this._parkedDepthStageRoots.delete(child);
          pending.set(child, {
            ...(parkedEntry && parkedEntry.depthNodeScale
              ? { depthNodeScale: parkedEntry.depthNodeScale } : {}),
            lodLevel,
            entity: shadowPolicyEntityOf(child, this.state),
          });
        }
      }
      // Withhold like the promotion path — a queued caster that keeps castShadow=true
      // draws its unlinked depth variant on the first presented shadow refresh while
      // it waits for the arm. The arm's restore loop already clears every flag.
      const byRoot = new Map();
      for (const mesh of unstaged) {
        const root = shadowPolicyRootOf(mesh, scene);
        if (!root) continue;
        let set = byRoot.get(root);
        if (!set) {
          set = new Set();
          byRoot.set(root, set);
        }
        set.add(mesh);
      }
      for (const [root, meshes] of byRoot) {
        for (const mesh of meshes) mesh.castShadow = false;
        const cache = this._withheldDepthCasters
          || (this._withheldDepthCasters = new Map());
        const existing = cache.get(root);
        if (existing) {
          for (const mesh of meshes) existing.add(mesh);
        } else {
          cache.set(root, meshes);
        }
        this._invalidateShadowPolicy(root);
        root.userData[STAGE_SELF_DIRTY_KEY] = shadowCasterPolicyDirtySeq(root);
        root.userData[STAGE_COLLECT_EPOCH_KEY] = shadowCensusEpoch();
        // Resolve entity/lodLevel now — the arm's restore calls _shadowPolicyOptions
        // with whatever's queued, and a null entity forces allowCast=true (band-1
        // over-cast for a frame on every out-of-ortho root) plus lodLevel=null
        // (a forced traverse at the next sync). userData.lod is the same source
        // _shadowPolicyOptions reads for its own lodLevel.
        const lodLevel = (root.userData && root.userData.lod && root.userData.lod.level)
          || 'lod0';
        // pending∧parked coexistence is the hole the checked-sync chain can't
        // recover: a parked band-1 root queued here without deleting its park
        // record makes parkedRelease strip the cache this loop just minted, and
        // the chain then falls through to a live allowCast restore on still-
        // unstaged meshes. Delete the park and merge any live pending entry so
        // earned fields (depthNodeScale) survive the re-queue.
        const parkedEntry = this._parkedDepthStageRoots
          && this._parkedDepthStageRoots.get(root);
        if (parkedEntry) this._parkedDepthStageRoots.delete(root);
        pending.set(root, {
          ...(parkedEntry && parkedEntry.depthNodeScale
            ? { depthNodeScale: parkedEntry.depthNodeScale } : {}),
          ...(pending.get(root) || {}),
          lodLevel,
          entity: shadowPolicyEntityOf(root, this.state),
        });
      }
      if (pending.size > 0 && this._depthStageScheduled !== true) {
        this._depthStageScheduled = true;
        this._armDepthStage();
      }
    } catch (error) {
      laneWarn(this, 'depthStageArm',
        '[render] shadow-enable depth stage failed', error);
      this._noteDepthStageArmFault();
    }
  },

  };
}
