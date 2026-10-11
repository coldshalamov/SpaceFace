# wave-143 heap-floor-verify — close-the-loop on the W142 residual + doc-pin check + end-to-end re-sweep

**audit_sha:** `9d752aa769f83f1544302be013c1cf4f4d3ac183` (tip of `origin/devin/1791504143-perf-w120`; verified `git rev-parse` after `git fetch`). Read-only audit via `git show`/`git grep` at the pinned tree — no code edits, no PRs, no app launch.

**Delta since W142's audited `cef2ba2c`:** 84 commits; machinery surface = **2 comment pins only** (`packageCpuDetach.js` +3, `partsLibrary.js` +4 — tip commit `9d752aa7` "docs(wave142): pin R7/R8 … doc-lines"). `renderer.js`, `startupGpuResidency.js`, `imageSourceDedupe.js`, `shipPreviewMount.js`, `asteroidRenderer3d.js`, `pipSpannerPreview.js`, `assetLoader.js` all byte-identical; pending-gate call-site census unchanged (same 5 files: openingGpuAdmission, renderer, asteroidRenderer3d, pipSpannerPreview, shipPreviewMount); the only machinery-adjacent change in the 142-file delta is `vfx.js` registering `_emergentPayloads.group` as an owner-root for residency collects (more coverage, no semantics change). W142's MECHANISM_VERIFIED rows stand wholesale.

**saturated: false** — the residual (a) verdict: **the early-out does NOT hold under inspection; the claimed set-equivalence is falsifiable. It is worth a small fix** (~8-line recollect-on-settle; ~15-line detach-serial for the full class), though a documented-accept close is defensible. One H1 finding below. Doc pins: R8 landed verbatim; R7 landed at the consumer site — the literal `assetLoader.js:1731` producer line was NOT added (intent covered, site nuance flagged).

---

## 1. Residual (a) — definitive verdict: NOT sound; worth fixing

**Claim under inspection:** "consult-A's pending set == what restore-B would collect, since `dropGeometryGpuResidencyLedger` already ran for B."

**The claim is false.** `dropGeometryGpuResidencyLedger(renderer)` (`packageCpuDetach.js:476-485`) clears `entry.uploadedOn` stamps — it *widens* restore-B's would-be pending set toward "every detached scene geometry" (post-drop every detached entry answers `recordsDied ∨ version-moved ∨ !uploadedOn` → true, `:542-550`), and the texture twin needs no ledger at all (three re-mints `properties`/`attributes` on every `onContextRestore → initGLContext`, `vendor/three.module.js:16647-16650,17308+` → `!props` → every detached versioned texture pending, `:587-592`). So:

```
S_B = {scene resources detached at B-time} = S_A ∪ {detached in (T0,B]} − {rehydrated in (T0,B]}
```

- **Rehydrated entries: safe.** `rehydrateManifest` refills CPU payloads (`:599-660`); context loss never touches CPU arrays — A's work survives loss#2 and post-B binds upload live bytes. Equivalent. ✓
- **In-window detaches in `wanted` manifests: healed free.** `rehydrateDetachedTextures`/`Geometries` (`:710-769`) rehydrate per-MANIFEST, and the refill loop reads `entry.detached` LIVE (`:604`, `:635`) — a detach landing before that manifest's loop runs is caught even though it was never collected.
- **The miss:** entries detached in-window in manifests with **zero pendings at T0** (all attached → excluded from S_A), or in `wanted` manifests **already processed** before the detach lands. They stay emptied; nothing re-collects.

**Concrete class-(iii) trigger (dominant):** global GPU reset while the works screen is open with mounted package subjects (authored rover etc. — `queueWorksPipelines` at `:3701` proves non-vacuous). Main restore handler runs `rehydrateDetachedPackages` FIRST (`renderer.js:10741`, `detachedManifestList` — manifest-global, refills M → attached) → works restore fires → dropLedger → consult-A collects (M attached → **excluded**) → main's paced re-admit `prepareStartupGpuResidency(ignoreResidentStamps:true)` (`renderer.js:10808`) re-detaches M mid-window → M emptied, never collected.

**The miss class is broader than the W142 framing.** No second restore is required: ANY post-collect detach in an uncovered manifest misses — the works lane's only re-check points are subject-admission (`:1440-1445`) and contextrestored (`:1404`), the sparsest boundary set of any lane (shipPreviewMount re-checks every renderNow while armed, `:1093-1116`; the main renderer re-checks per subject-admission and rehydrates ALL manifests unconditionally on restore). The `:1406` early-out is consistent with — not the cause of — the gap; the consult has no re-collect after collect anywhere. Same-screen detachers also exist (`markReadableFallbackLayer` resident-gated sweep, `partsLibrary.js:10185-10198`; source-GLB manifest detach, `packageCpuDetach.js:299,314`).

**Failure semantics:** next works bind → three's uploader reads emptied payloads → `mipmaps[0]` compressed / `getDimensions(null)` uncompressed → TypeError inside `bloom.render` (`:8825`), per-frame until heal. Fail-loud, no silent corruption; heals at the next `queueWorksPipelines` admission consult (user mounts another subject), the next works contextrestored, or a main-lane `rehydrateDetachedPackages` — NOT healed by main-lane admissions (the emptied entry isn't pending on main: its props/version still match post-upload-detach). Never the flight view.

**Fix recommendation (worth it — this is the exact class the consult exists to prevent):**
- *Minimal (~8 lines):* `let restoreRecollectPending = false;` set `true` on the `:1406` early-out; consumed in the `:1422` `.finally` by re-invoking the handler (dropLedger + re-collect — idempotent). Closes the double-restore corner exactly as W142 suggested.
- *Full class (~15 lines):* module-level detach serial bumped inside `detachPackageTexture`/`detachPackageGeometry`; consult captures it at collect and re-collects once if it moved by settle — covers non-restore detachers too. In-repo precedent: shipPreviewMount's `uploadAuditSeq` re-arm (`shipPreviewMount.js:1113-1117`).

If the campaign accepts a bounded, self-healing, secondary-canvas throw-loop, a doc-line closing it is defensible — but per the presented-frame bar the recollect is the right close.

## 2. Doc-pin status (W142 recommendations → landed?)

| rec | status | evidence |
|---|---|---|
| R7 — detachOnMark dormancy / no residency proof | **PINNED — relocated** | Landed at `packageCpuDetach.js:293-295` (inside `createSourceDetachManifest`, where `options.detachOnMark === true` is honored): "detachOnMark detaches eagerly with NO textureGpuResident proof — the flag is dormant today; if a caller ever marks an un-uploaded tree, add the same residency gate the partsLibrary sweep uses." The literal recommended site `assetLoader.js:1731` got NO new line — the N3 comment still reads only "may already be an authoredReadableFallbackLayer-stamped stand-in." Intent covered at the honoring site; flag the producer-site line as still-owed only if the orchestrator wants the warning where a future stamper would flip the flag. |
| R8 — `canPoolRenderPackageShipMesh` armed-object exclusion | **PINNED verbatim** | `partsLibrary.js:14367-14370`: arms/`onAfterRender` exclusion explained (instanced pools never fire per-object hooks; unreachable today; keep the guard). Exactly as recommended. |
| detachOnMark semantics comment | **PRESENT** | Pre-existing `:289-292` (cross-path semantics — "the flag means the same thing on both paths") + the R7 pin's dormancy/semantics wording. |

## 3. Carried items

- **Dev-only proof-path bypasses (b): unchanged** — `captureScenePass` calls `bloom.render` ungated (`:2033`), `renderWorksProofMask` calls `renderer.render` ungated (`:2222`), still behind the works-proof flag (`?worksProof=1`/`?dev=works-proof`), consumed only by `scripts/capture-works-*.mjs`. A mid-consult capture can still bind emptied payloads → throw inside the probe. Unshipped; same one-line `contextRestoreConsult` guard applies if ever promoted.
- **Never-settling redecode hold:** `manifest.redecode()` has no timeout — a hung fetch keeps the consult latch + bloom hold indefinitely (freeze, not corruption). Correct-by-design per W142; unchanged.
- **Facade arming noise:** `Object.create(object)` tier facades pushed into drawable collects (`startupGpuResidency.js:~224`) get armed pointlessly (WeakSet dedupe never hits, hook never fires on non-rendered facades) — dead work, harmless, W142 noted no-action.

## 4. Remaining risk surface (unchanged since W142)

- **Binds of emptied payloads:** every shipped render path is gated except §3's two dev paths and the H1 miss class above.
- **Unbounded per-frame cost:** none. Ledger hooks O(1)/draw; consults event-driven; collects run Steps twins / sync bounded.
- **Sticky latches:** none. `contextRestoreConsult` clears via `.finally` on the assigned promise (W141-D5 fix verified standing); `uploadAuditInFlight`/`manifest.rehydrating`/`rehydrating` all finally-cleared; `uploadedOn`/properties WeakMap-keyed.
