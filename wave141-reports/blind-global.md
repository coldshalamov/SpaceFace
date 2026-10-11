# wave141 audit — blind-global

Lane: **blind-global** (fresh eyes on the whole presented path; no lane blinders).
Pin: `origin/devin/1791504143-perf-w120` = **`7c123f256354968dc704788f63461948b0e9f585`** (`7c123f256`).
Coverage: this pin is newer than all three sibling pins (`boot-verify`@`39e905b2d`, `render-verify`@`39e905b2d`, `secondary-surface`@`5cd02c8f3`) — `a0588a5a8` (lightSaleHull F4) and `7c123f256` (boot N1/N2/N3/N8 + replay-prelude) are covered **only** here.
Method: static trace at FETCH_HEAD (`git show`/`git grep`); read-only, no app launch.
Ledger preserved: PR #260 sim-worker (B3/B4), R2 forcers, R3/R4 texture edges, N5 station-CSSOM, N4 dev-only eager — not re-reported.

**Legend:** `MECHANISM_VERIFIED` — code inspection proves the claim; `PERFORMANCE_VERIFIED` — measured; `UNVERIFIED` — stated but not provable from this lane.

---

## Verdict

`saturated: false` — one real presented-path defect open (BG-1), plus four bounded residuals.

| id | severity | status | item |
|----|----------|--------|------|
| BG-1 | **material (correctness)** | MECHANISM_VERIFIED | Steps-twin `dirty.fill` runs *before* the mid-park churn gate → stale `copyRow` poses persist indefinitely for entities whose last write lands in the window |
| BG-2 | moderate | MECHANISM_VERIFIED | First warm task still monolithic ~60-80 ms (`SHIPPED_LANGUAGE_ROWS` materialize is unsliced) — inside the menu-mount window N3 claimed sub-frame |
| BG-3 | moderate | MECHANISM_VERIFIED | `keyByEnglishMessage()` ~86-90 ms lands in the first `localizeText` consumer's task (title status line) — the idle tail only wins if nothing localizes first |
| BG-4 | minor | MECHANISM_VERIFIED | `?locale=<shipped>` boot still pays ~140-170 ms catalog build inside the post-gate eval task + unsliced MutationObserver translations through every subsequent mount |
| BG-5 | minor | MECHANISM_VERIFIED | `_renderDistortion` producers still pay the full `renderer.render()` prelude per live producer per frame (graph :785 + bloom route :1637) |

---

## BG-1 — Steps-twin `dirty.fill` precedes the mid-park churn gate (REAL DEFECT) — `MECHANISM_VERIFIED`

`src/render/snapshotFence.js` — `packPresentationWorldToFenceSteps` fast leg:

```
635:    if (!bail) {
636:      dirty.fill(0, 0, scan);                       // mask dropped here …
637:      const postDiagnostics = typeof world.getDiagnostics === 'function'
638:        ? world.getDiagnostics() : null;
639:      if (postDiagnostics
640:        && (postDiagnostics.allocations | 0) === allocationsAtMint
641:        && (postDiagnostics.retirements | 0) === retirementsAtMint) {
642:        fence.commit();                             // … but commit is gated here
643:        fence.notePackMembership(postDiagnostics);
644:        return fastSnapshot.count;
645:      }
646:    }
647:    // Premise broke mid-pack: … falls through to the classic walk
```

The G1a fix (commit `5cd02c8f3`) moved the clear to after the *bail* check but left it **before** the post-mint counters check. Sequence that drops updates:

1. Fast pack parks mid-walk (`(slot % every) === 0` yields at :627, and the `_fencePackPending` driver at `renderer.js:28187-28199` also suspends on the 4 ms wall — either way the world keeps running while suspended).
2. A **retirement** lands in the window. Retirements never bail: `retireSlot` clears `packDirty[slot]` + `alive[slot]` (`presentationWorld.js:734`), so the loop just `continue`s past the dead slot (:629-630). (Allocations *do* bail — a minted slot has `slotRows[slot] < 0` or an entityId mismatch at :631-632 — so the counters-moved-no-bail path is effectively retirement-only, but retirements are routine: every despawn/kill during a parked pack.)
3. Loop completes `!bail` → **`dirty.fill(0, 0, scan)` clears the whole mask** (:636) → counters mismatch → discard `fastSnapshot`, fall through to the classic walk.
4. `packRow` (:662-680) consults `world.packDirty[slot] === 0` → `previousIndex.get(entityId)` hit + generation match → **`snapshot.copyRow(previous, previousRow)`** — copies the *last committed* pack's row, i.e. the pose from before the in-window write. The fresh values sitting in `world.x/.rot/.bank` are never read.

**Effect:** every entity whose pose write landed in the suspended window is presented at last commit's row. Continuously-moving entities re-dirty on their next sync write (self-heal ≤1 write cycle). Entities whose *last* write was in-window — a one-shot teleport, an entity that stops in-window (`PRESENTATION_WORLD_UNCHANGED_REFRESH_SKIP` suppresses re-dirty on unchanged poses, `presentationWorld.js:428`) — stay stale **indefinitely**: subsequent fast packs re-blit the same stale row while the membership stamp keeps matching.

Atomic twin is correct — `packPresentationWorldToFence` (`:504`) fills right before an unconditional commit and cannot observe mid-pack churn. The Steps twin is the live path: `renderer.js:28143-28199` drives `packPresentationWorldToFenceSteps` whenever a pack outlives one ~4 ms wallet leg — exactly the big-world/combat case the paced pack exists for.

**Fix:** move `dirty.fill(0, 0, scan)` inside the counters-match branch (after the `postDiagnostics` check passes, beside `fence.commit()`). Effort: trivial. Risk: none — the bail path already preserves the mask per G1a.

Dedupe: render-verify's G1a check (their line 43) verified only the **bail** path ("on bail every bit stays set") — the counters-mismatch fall-through was outside the claim they checked, so this is not a re-report.

---

## BG-2 — First warm task still monolithic (~60-80 ms) inside the menu-mount window — `MECHANISM_VERIFIED`

`src/localization/gameLocalization.js:208` — the first warm timer does `void SHIPPED_LANGUAGE_ROWS.length`, which materializes the `deferredArray` atomically: `honestLocaleLabel`×4 → `localeReadiness`×4 → 4× `Object.entries(englishMessages)` over ~8.7k entries (+ `isReviewedString` per entry) *plus* materializing `englishMessages` itself (`JSON.parse` of the generated catalog + merges). Boot-verify measured the same block at ~70-80 ms unsliced (their N3, wave141 `boot-verify.md:101`). `7c123f256`'s N3 sliced only `warmTranslatedCatalog` to 400 rows (:194) — `deferredArray` materialization is a single `materialize()` call and cannot interleave, so the "every warm task stays sub-frame" claim fails for task 0.

Impact: largest single warm task lands in the same window N3 was meant to protect. Options: pre-warm `localeReadiness` per locale across the `warmStep` chain before touching the rows, or split the label computation into its own stepped pass. Small effort; no quality trade.

## BG-3 — `keyByEnglishMessage()` (~86-90 ms) lands in the first consumer's task, not idle — `MECHANISM_VERIFIED`

`localizeText`/`coreText` pays `keyByEnglishMessage()` unconditionally (`gameLocalization.js:118` → `:34-40`). The map builds lazily on first call; the warm's `requestIdleCallback` tail (:201-204) only wins if nothing localizes first — but the first localized paint is the title frame's status line (`src/ui/views/menuFrames.js:57`, `localizeText(TITLE_STATUS_LINE)`), which mounts inside the ~800 ms warm window on a normal boot. So the ~86-90 ms `Object.entries`+`localeCompare` build (boot-verify measured) executes inside the menu-mount task on most boots anyway. Bounded, one-time, user-visible as menu-mount latency. Fix would be warming it *inside* the ordered warm chain (it's needed by every `localizeText`, not deferrable to idle), not leaving it consumer-triggered.

## BG-4 — `?locale=<shipped>` boot keeps ~140-170 ms of eval work + unsliced observer work — `MECHANISM_VERIFIED`

`gameLocalization.js:163-165`: a non-default `startupLocale` calls `applyDocumentLocale(startupLocale)` **at module eval** → `installLocalizedDocumentBridge` → `localizeDocumentTree(documentElement)` → first `localizeText` �� `deferredCatalog` materializes the whole catalog synchronously **inside the post-gate eval task** (~166 ms es-ES-equivalent per boot-verify's warm measurement) — the same task B5 was created to unblock. The installed `MutationObserver` then translates every subsequent boot mount's mutation batches inside the mounting tasks (unsliced; `domBridge.js:60-78`). Still an improvement on pre-B5 (all four stub catalogs built at eval, ~4×140 ms), but localized boots keep one full build + observer work on the blocking path. Bounded; affects only `?locale=` boots. `?locale=<non-shipped>` is worse-but-empty: no catalog exists, every `t()` falls to en-US, yet the bridge still installs (observer + canvas patches) for zero translated output (minor).

## BG-5 — Distortion producers still pay full `render()` prelude per live producer per frame — `MECHANISM_VERIFIED`

`spaceRenderGraph.js:785` (graph route) and `bloom.js:1637` (bloom route): `renderer.render(producer.scene, camera)` per live distortion producer per frame — full scene-graph prelude (renderStates/renderLists WeakMap get+init, projScreen+frustum, projectObject, shadowMap, setupLights on the producer scene's empty lightsArray) for what are small fixed scenes. Only while distortion is live and producers are few — bounded, UNVERIFIED magnitude. `renderQuadPass` doesn't fit (producers aren't single quads); a prelude-lite variant or a captured-list replay per producer is the shape of the lever.

---

## VERIFY answers (the five scope items)

**(1) deferredObject localization proxies on the hot path.**
- Presented-frame consumer materializing lazily inside a frame: none found on a normal en-US session — all `localizeText`/`t()` callers (bandRadio event lines `bandRadio.js:525,599`, menu mounts, HUD hint model `hud.js:729,739`, settings/pause rows) are event/mount-driven, and the warm chain materializes the proxies inside `setTimeout` tasks before the menu can mount. The materialize-in-frame risk is confined to the warm window: see BG-2/BG-3 (first-task materialize ~60-80 ms; `keyByEnglishMessage` ~86-90 ms consumer-race).
- Menu open → catalog materialize inside paint: `LANGUAGE_OPTIONS`/`SHIPPED_LANGUAGE_ROWS` is a `deferredArray` — iterated at Settings mount — but materialized in the first warm timer, long before mount. Only if warm timers were starved would a mount pay it; bounded, not reachable in practice post-N3.
- Non-boot locale switch mid-session: `setGameLocale` → `localizeDocumentTree` whole-DOM walk + possible full `buildTranslatedCatalog` (~166 ms) inside the click task if switched inside the warm window; post-warm it's the DOM walk only (UNVERIFIED magnitude, grows with mounted-screen DOM). **Verdict: bounded/acceptable** — one-time, user-initiated — with the note that the bridge then stays installed forever (per-mutation `localizeText` = map.get + ~4 proxy traps/node; cheap per node, unbounded count; `domBridge.js`).
- Per-draw proxy cost post-materialize: `t()` → `hasOwnProperty` + `catalog[key]` ≈ 2 proxy traps per lookup (+chain), sub-µs — verified fine.

**(2) renderQuadPass + capture shell + instanced drop + replay-prelude as a system — `MECHANISM_VERIFIED`.**
- `lights.state` on replay: `renderStates.get(scene, depth)` keys on the scene object — capture (depth-0 `render()`) and replay (`renderCapturedList` → same scene, same depth) share the **same** `WebGLRenderState`. `init` clears `lightsArray`/`shadowsArray`/`lightProbeGridArray` but leaves `state.lights` (the `WebGLLights` object — hash, uniform arrays, version stamp) untouched (`three.module.js:9177-9186`). Skipping `setupLights()` on replay therefore preserves pass-1's computed state and version — lit materials' `needsLights` early-out sees an identical stamp; a lit `allowOverride:false` straggler would still read valid pass-1 lights. `setupLightsView` still runs inside `renderScene` (:18448) on the empty array — a no-op loop, harmless.
- Per-frame graph cost now: 1 full-prelude capture render (necessary) + 1 replay (WeakMap get+init, O(items) pointer copies with per-item instanced `count<=0` drop, `shadowMap.render` early-out on empty shadowsArray, `background.render(scene)` — unchanged from the pre-capture second pass — then `renderObjects` draws) + ~8 `renderQuadPass` (3 AO + 4 bloom + 1 composite; +1 grade in photo mode). Frame mint correctly withheld on replay (`objects.update` dedup safe).
- `_sfCapturedShell` single-slot reuse is safe: capture→consume is synchronous same-turn (`spaceRenderGraph.js:427-432`); depth-1 gate prevents nested clobber (render-verify Q2).
- Residual: BG-5 (producer scenes).

**(3) pose-pipeline post-G1a `dirty.fill(0,0,scan)`:** bounds are exact (`scan = min(dirty.length, slotRows.length)` = capacity — never overruns the array or beyond-scan slots; the classic walk only runs after fall-through, so within one call no slot is double-consumed). The **ordering** defect is BG-1 — the specific Steps-twin path the prompt suspected exists: the fill drops slots the subsequent classic walk then reads as clean.

**(4) cross-lane deferredObject + postMessage/structuredClone:** no `structuredClone` of any catalog proxy anywhere (would materialize+deep-copy ~17k keys — none found). Canvas-text bridge patches `fillText/strokeText/measureText` globally on non-en-US locales → `localizeText` per canvas text draw (map.get + proxy traps; pre-existing machinery — B5 adds ~0 marginal cost, non-EN only). `simTransport`/`simWorkerHost` postMessage is not wired into `src/` on this branch (test-only references; ledger'd anyway). `stuntEvidence` clones are per-evidence-event. `glbPrepass`/`assetLoader` worker traffic is load-path. No per-frame clone/postMessage on the presented path.

**(5) HUNT new presented-thread work:** nothing new per-frame O(N) outside adjudicated machinery — `renderer.js` presented loop is untouched this wave. The new main-thread work is the localization warm chain (BG-2/BG-3 residuals). `lightSaleHull` (`a0588a5a8`) amortizes correctly — one bearing per rAF + setTimeout(160) fallback + per-slice staleness guards + in-task `turnYaw` restore + `onDone` waiters — still the largest aux per-frame cost while a sale sheet is up, kept on the live canvas by the byte-identical `drawImage` downscale constraint. `armGeometryGpuResidentLedger`'s `onAfterRender` chain is ~2 map reads/armed-draw/draw on aux surfaces only — negligible, never disarms (permanent hook — fine). `stageHull` 30 Hz: `pendingRad` accumulation preserves the exact angular rate; rAF still ticks every frame but the callback is ~5 field ops. `index.html` `fetchpriority=low` on station styles + draco trio — correct, boot window only.

## Carried / notes

- Replay `render()` still runs `background.render(scene)` into the normal target — identical to the pre-capture second pass (not new cost; flagging only so a future lane doesn't "find" it).
- `atomic` G1a leg (`packPresentationWorldToFence`, :504) is correct — the defect is Steps-twin-only, matching how the campaign's Steps-twin fidelity class keeps surfacing.
- No `PERFORMANCE_VERIFIED` verdicts: lane is read-only with no app launch; magnitudes cited are boot-verify's measured numbers at `39e905b2d` where applicable.

`saturated: false` — BG-1 is an open presented-path correctness defect; BG-2/BG-3 leave ~150-170 ms of unsliced warm work inside the menu-mount window the wave intended to keep sub-frame.
