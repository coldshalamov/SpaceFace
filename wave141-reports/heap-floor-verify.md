# wave-141 heap-floor-verify — adversarial re-audit of the wave-140 defect fixes

**audit_sha:** `39e905b2d8e53f15cdb65cd6cb8686e773b5dab0` (tip of `origin/devin/1791504143-perf-w120`; verified `git rev-parse FETCH_HEAD` after `git fetch origin devin/1791504143-perf-w120`). Read-only audit via `git show <sha>:<path>` / `git grep` at the pinned tree — no code edits, no PRs, no app launch. Test-run evidence: sparse worktree at the audit SHA (`src/`,`test/`,`vendor/` only) + junctioned `node_modules`; `node --test` on the three detach suites.

**Fixes audited:** `eff9869e0` (D1 post-draw ledger, G4 context-restore guards, D3 hygiene), `7e9580034` (D2 covered-only shared release), `39e905b2d` (R5 real digest-mismatch test), plus G3 `textureGpuResident` guard (`5cd02c8f3`) and prior campaign state (N1–N4/F2–F4).

**saturated: false** — the fixes are mechanically sound except G4's asteroid lane: the restore-consult latch never releases on the synchronous (empty-pendings) path, permanently suppressing the canvas's per-frame `bloom.render` and deadening every subsequent restore. One pre-existing gate gap (authored-swap never re-arms the audit) is newly surfaced in the same scope.

---

## 1. Contract-point verdicts

| fix | verdict | evidence |
|---|---|---|
| D1: `onAfterRender` fires only after `renderBufferDirect` | **MECHANISM_VERIFIED** | `vendor/three.module.js:18635` — `renderObject` calls `renderBufferDirect` (`:18621`/`:18625`/`:18631`, single + two-pass DoubleSide) then `object.onAfterRender`. `bindingStates.setup` (`:17435`) runs inside `renderBufferDirect` before draw early-returns, so attribute records exist when the hook fires. F-A `renderQuadObject` routes through `renderObject` (`:18660`/`:18671`) → hook fires on the quad path too. Shadow-map depth draws (`:9846`/`:9860`) bypass `onAfterRender` — a ledger *miss* is the conservative direction (pending → rehydrate), not blind. |
| D1: arming idempotent; re-admission re-arms | **MECHANISM_VERIFIED** | `packageCpuDetach.js:441` `residentLedgerArmedObjects` WeakSet dedupes (`:455`). The chained hook persists on the object, so re-admission needs no re-arm — `collectStartupGeometryDrawables` is re-run per admission and any *new* subtree objects arm fresh. |
| D1: draw on already-detached geometry keeps gate armed | **MECHANISM_VERIFIED** | `packageCpuDetach.js:458` — the hook skips `noteGeometryGpuResident` when `isPackageGeometryDetached(geometry)`; `uploadedOn` stays unset → `detachedGeometryUploadPending` (`:545-547`) keeps returning pending → the next consult rehydrates instead of stamping a blind resident. |
| D1: every ledger site covered | **MECHANISM_VERIFIED** | shipPreviewMount: `prepareForFirstDraw` arms `root` (`:938`; dock tree covered via `loadDockBackdrop`→`:803`), `show()` arms `mesh` (`:1360`), `onAuthoredAssetSwap` arms `current` (`:563`). pipSpanner arms scene post-compile (`:198`). asteroid arms every admitted subject via `collectStartupGeometryDrawables(subject)` (`:1468` — superset of the `leaves` the old blanket ledger used). Only other `uploadedOn` writers: `startupGpuResidency.js:808` (post-proxy-render proof) and `detachPackageGeometry(renderer)` (`:499`) — both post-real-upload. No false-positive ledger writer remains. |
| D1: `onAfterRender` conflicts | **VERIFIED — no conflict on armed objects** | Only other `src/` setters are `partsLibrary.js:11649/:12300/:12324` prototype resets — all run on **clone** trees, and `Object3D.copy` (`three.core.js:13271+`) never copies `onBeforeRender`/`onAfterRender`, so clones can't carry or strip a live chain. `previous` chaining in `armGeometryGpuResidentLedger` preserves any earlier own-property hook. See residual R6 for the `canPoolRenderPackageShipMesh` identity check. |
| D2: coverage predicate semantics | **MECHANISM_VERIFIED** | `packageTextureDetachCovers` (`packageCpuDetach.js:330-337`) = mark + `manifest.entries[mark.ordinal].texture === texture` identity. A clone carrying a JSON-copied `spacefaceCpuDetach` mark fails identity → uncovered. |
| D2: uncovered user holds `sourceReleased` off | **MECHANISM_VERIFIED** | `imageSourceDedupe.js:410-431` — uncovered resident users skip `user.mipmaps=[]`/`releasedUsers`; `uncoveredSharesSource` (`:418-420`) blocks canonical `source.data=null` whenever a live uncovered user points at `entry.source`. All 3 call sites pass `packageTextureDetachCovers` (`startupGpuResidency.js:902,919,950`); optional arg defaults `()=>true` for fixtures. |
| G4: listeners preventDefault + re-cover on restore; removed on dispose | **MECHANISM_VERIFIED (shipPreviewMount) / DEFECT (asteroid — see D5)** | shipPreviewMount `:845-857` — `dropGeometryGpuResidencyLedger` + `uploadAuditArmed=true; seq+=1; renderNow()` re-runs the gate before any draw (the seq bump keeps the audit armed across an in-flight rehydrate); listeners removed in `dispose()` (`:1472-1473`). asteroid `:1401-1422` adds the same shape but with the latch defect below; listeners removed in `finishDispose` (`:8842-8843`). |
| G4: pending gate actually re-runs before next draw | **VERIFIED (when the latch clears)** | asteroid `:8823` holds `bloom.render` while `contextRestoreConsult` is in flight; post-restore `renderer.properties` is fresh → `detachedTextureUploadPending` (`packageCpuDetach.js:535-540`) reads `__version === undefined` → pending for every detached texture; dropped `uploadedOn` → pending for every detached geometry. shipPreviewMount's `renderNow` (`:1088-1112`) consults before `renderer.render`. Main renderer rehydrates all detached manifests unconditionally pre-render (`renderer.js:10741`) — per-renderer ledger drops unnecessary there. |
| D3a: `released.length=0` placement | **MECHANISM_VERIFIED** | `packageCpuDetach.js:629` — after the refill loop consumed `{name,record}` pairs (`:613-620`) and the version-bump pass (`:622-626`), before `entry.detached=false` (`:630`). The fingerprint-mismatch `continue` (`:611`) preserves the list for retry — exactly correct. |
| D3b: shared-manifest asymmetry | **MECHANISM_VERIFIED** | `packageCpuDetach.js:291-299` — `detachOnMark` now honored against `existing.entries` (first-tree textures only) with the coverage-asymmetry comment. Flag remains dormant: `assetLoader.js:1731` reads `scene.userData.authoredReadableFallbackLayer`, only ever stamped post-compile on wrapper roots (`partsLibrary.js:10175,:10180`). See residual R7 for the latent no-residency-proof edge. |
| R5: real digest-mismatch rejection test | **MECHANISM_VERIFIED + TEST VERIFIED** | `test/source-glb-detach.test.mjs` — `sourceDetachRefFor` (newly exported, `assetLoader.js:2340`) mints the digest from original bytes; `redecode()` (`:2355-2368`) refetches via `force-cache`, `freshHash !== contentHash` → throws `changed under its recorded digest` before `parseAsync` (`parses === 0` asserted). Old test renamed to what it pins. Ran at SHA: **16/16 pass**. |
| G3: `textureGpuResident` guard in `markReadableFallbackLayer` | **MECHANISM_VERIFIED** | `partsLibrary.js:10196` — sweep detaches only `value.isTexture && textureGpuResident(value, renderer)` (upload-stamp `uploadVersions.get(texture) === texture.version`, `startupGpuResidency.js:92-95`). A never-uploaded payload keeps its array → first bind uploads live bytes. |

## 2. New defect introduced by this wave's fixes

### D5 — `contextRestoreConsult` never releases on the synchronous (empty-pendings) path → permanent `bloom.render` suppression + dead restores

**MECHANISM_VERIFIED defect** (`asteroidRenderer3d.js:1401-1422`, consumer `:8823`).

```js
contextRestoreConsult = (async () => {
  try {
    const pendingGeometries = collectStartupGeometries(scene).filter(...);
    const pendingUploads   = collectStartupTextures(scene).filter(...);
    if (pendingGeometries.length) await rehydrateDetachedGeometries(...);
    if (pendingUploads.length)    await rehydrateDetachedTextures(...);
  } catch (...) { ... } finally { contextRestoreConsult = null; }
})();
```

An async-function body runs synchronously until its first `await` evaluates. When **both** pending lists are empty — the common restore case (context loss does not require anything to be detached; restores also occur before/after any residency detach) — no `await` evaluates, so the whole body **including `finally { contextRestoreConsult = null }` completes inside the `()` invocation, before the assignment stores the resolved Promise**. `contextRestoreConsult` then stays a truthy resolved promise **forever**:

1. `if (!contextRestoreConsult) bloom.render(scene, camera)` (`:8823`) suppresses the canvas's per-frame draw permanently — the asteroid 3D backdrop freezes on its last presented frame until `finishDispose`.
2. `if (contextRestoreConsult) return;` (`:1406`) makes **every subsequent `webglcontextrestored`** skip the consult entirely — `dropGeometryGpuResidencyLedger` still runs (ledger cleared → gate reads pending) but the rehydrate that would refill the payloads never runs.

Reproduced the exact pattern in isolation: `finally` inside an immediately-invoked async body runs before the outer assignment when no await evaluates — the stored promise never clears.

**Fix shape (one-line class):** clear the latch on the assigned promise, not inside the body — e.g.
`contextRestoreConsult = (async () => { try { ...rehydrate... } catch (e) {...} })().finally(() => { contextRestoreConsult = null; })`
or assign the inner promise then `.finally(() => { contextRestoreConsult = null; })` without reassigning. Both run the clear on a microtask after assignment, so the latch releases on every path.

**Secondary draw-coverage residual (same region):** `captureScenePass` (`:2031`, diagnostic) and the works-proof mask render (`renderer.render`, `:2220`) bypass the `contextRestoreConsult` hold — a proof render during an in-flight consult can still bind emptied payloads. Narrow: explicit proof paths only, ms-scale window.

## 3. Residual risk / coverage notes (not new defects)

- **R2 post-admission forcers — unchanged.** `uploadAuditArmed` still disarms after one clean scan (`shipPreviewMount.js:1096`); dispose/`needsUpdate` paths on secondary contexts still consult no gate. Bounded as documented in wave-140.
- **R3 version-0 short-circuit — unchanged.** `detachedTextureUploadPending` (`packageCpuDetach.js:537` `!(texture.version > 0)`); every decoded GLB texture still carries version ≥ 1 in practice.
- **R4 uiStage chunked `initTexture` lane — unchanged** (no diff this wave).
- **R6 (newly noted): `onAuthoredAssetSwap` never re-arms the audit gate** (`shipPreviewMount.js:563-567`). The wave armed the *ledger* for the swapped subtree but `uploadAuditArmed`/`uploadAuditSeq` are untouched — pre-existing since N2 (`0a4fe0b9b` only armed at show/dock-add). If the audit already disarmed on a clean scan (steady state), the swap's own `renderNow()` draws the new authored subtree **before any consult** — detached-marked payloads inside it bind unguarded (texture `mipmaps[0]` throw / empty-VBO class). Bounded: needs an authored swap landing post-disarm carrying detached-marked resources. One-line-class fix beside the new arming loop.
- **R7 (newly noted): `detachOnMark` eager detach has no residency proof on either manifest path** (`packageCpuDetach.js:295,:310`). Dormant today (flag unreachable — see D3b), but if a future caller passes `detachOnMark` for an un-uploaded tree it reintroduces the exact G3 class the partsLibrary sweep just fixed. The function takes no renderer handle, so a `textureGpuResident` gate can't be expressed without a signature change — pin this in the comment or gate when the flag goes live.
- **R8 (newly noted): `canPoolRenderPackageShipMesh` excludes armed objects** (`partsLibrary.js:14368` — `source.onAfterRender !== THREE.Object3D.prototype.onAfterRender` → pool rejection). Self-consistent (an instanced object's per-object hook never fires anyway), and unreachable in practice today: preview/subject instances are clones and `Object3D.copy` doesn't carry hooks. If an armed source object ever reaches a pool probe, it silently loses instancing — a conditional perf note, not corruption.
- **`entry.users` strong Set:** pruned only via the wrapped `texture.dispose` — an undisposed (leaked) uncovered adopter strands the canonical `source.data` release indefinitely. Conservative direction (bytes stay live); pre-existing retention semantic.
- **Facade arming noise:** `collectStartupGeometryDrawables` emits `Object.create(object)` tier facades (`startupGpuResidency.js:221-228`); arming a facade is dead work (it never renders) but harmless — the real object's hook covers tier-swap geometries via the `geometry` arg. Cosmetic.
- **Prior D3 residuals stand:** shared-source released bytes still invisible to `manifest.freedPayloads`/diagnostics (no back-edge added — diagnostic-only); `sharedTextureReleased` kept-own-source false-positive unchanged (conservative, byte-identical outcome).

## 4. Test-as-contract review (ran, not just read)

`node --test` at the audit SHA (sparse worktree + junctioned `node_modules`):

| suite | result |
|---|---|
| `test/source-glb-detach.test.mjs` | **16/16 pass** — incl. new R5 rejection test + renamed pairing test |
| `test/shared-image-source-release.test.mjs` | **7/7 pass** — incl. new D2 uncovered-user coverage pins |
| `test/package-geometry-detach.test.mjs` | **4/4 pass** — source pins updated to `armGeometryGpuResidentLedger`/`dropGeometryGpuResidencyLedger` call shapes (`eff9869e0` updated the pins consistently) |

`node --check` clean on all edited files (`asteroidRenderer3d`, `packageCpuDetach`, `imageSourceDedupe`, `shipPreviewMount`, `pipSpannerPreview`, `partsLibrary`, `assetLoader`).

## 5. Coverage census — who can still bind emptied payloads

| renderer | gate state at `39e905b2d` |
|---|---|
| main (`renderer.js:10265`) | 4 reattach consults + admission twin + unconditional restore rehydrate (`:10741`) — covered |
| asteroid (`:1367`) | per-submission consult + armed ledger + G4 listeners — **D5 latch defect** on the restore lane |
| shipPreviewMount (`:500`) | audit gate + armed ledger + G4 listeners — covered; **R6 swap gap** residual |
| pipSpanner (`:114`) | gate + armed ledger; `webglcontextlost` → `view.dispose()` — deliberate teardown, no restore lane needed — exempt |
| graphicsLab (`:465`) | procedural-only content (prior-verified) — exempt, unchanged |

## 6. Verdict

**`saturated: false`.** D1, D2, D3, R5 and the G3 guard are verified correct, and the shipPreviewMount/main-renderer/pipSpanner context-loss stories are sound. The G4 asteroid lane shipped its own defect: `contextRestoreConsult` latches truthy on the empty-pendings restore — the most common one — freezing `bloom.render` and disabling every later restore's rehydrate. Plus the newly-surfaced R6 authored-swap audit gap in the same gate family. Both are one-line-class fixes; until the latch lands, the wave-140 G4 contract is only half-kept.
