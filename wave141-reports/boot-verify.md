# Wave 141 — boot-verify (cold-boot presented path re-audit)

- Audit lane: **boot-verify** (read-only; no code edits, no PRs, no app launch)
- Repo: `coldshalamov/SpaceFace`
- Pinned tip: `origin/devin/1791504143-perf-w120` = **`39e905b2d8e53f15cdb65cd6cb8686e773b5dab0`** (`39e905b2d`)
- Previous boot audit: `wave140-reports/boot-verify.md` (pin `1564773c4`); findings B1–B5 from that report are the landings verified here.
- Landed since last audit, in scope: `38faa79ca` (B1–B4 fetchpriority/station preloads), `5dfe99249` (stageHull F2 30Hz drift cap), `5ccffd537` + `fdf81bf4a` (B5 data deferral), `d5efd9fbb` (F-A `renderQuadPass`), heap-floor detach machinery, G2 cardEnv fields.

**Legend:** `MECHANISM_VERIFIED` = code inspection proves the mechanism correct; `PERFORMANCE_VERIFIED` = measured/compared on the pinned content; `UNVERIFIED` = stated but not provable from this lane.

---

## 1. B5 data-deferral correctness — `MECHANISM_VERIFIED` + `PERFORMANCE_VERIFIED`

Commits: `5ccffd537` (stub catalogs → deferredObject proxies + idle warm), `fdf81bf4a` (ruckus docs → text-parse).

### 1.1 Proxy traps — correct and spec-sound

`src/localization/pipeline.js:564-590` `deferredObject(build)`; `:593-613` `deferredArray(build)`; `:616-618` `deferredCatalog(locale) = deferredObject(() => buildTranslatedCatalog(locale))`.

- Traps implemented: `get`, `has`, `ownKeys`, `getOwnPropertyDescriptor`, `preventExtensions`, `set`, `deleteProperty`, `defineProperty` — the full surface a consumer can observe. Every trap forwards to `materialize()`, which builds once and caches (`state.real`).
- `getOwnPropertyDescriptor` returns `{ ...d, configurable: true }` for keys not yet installed on the target — required by the Proxy invariant when the target could later be non-extensible. Correct, not optional.
- `preventExtensions` (`:582-588`) copies all real own-property descriptors onto the target *before* `Object.preventExtensions(t)`. This keeps post-freeze `ownKeys`/`getOwnPropertyDescriptor` exact — the standard solution to frozen-proxy invariant traps.
- `deferredArray` additionally materializes by pushing real values into the target array itself (`:598-601`), so index descriptors, `length`, iteration, `Array.isArray`, `JSON.stringify`, spreads, and `.map`/`.some`/`.filter` all behave exactly like a real array — before *and* after any future freeze.

### 1.2 Warm-vs-access interleaving — safe

`pipeline.js:624-651`: `catalogWarmState` is a private in-progress accumulator; `state.out` is only `catalogCache.set(locale, state.out)` on **completion** (`:644-648`). A consumer arriving mid-warm goes through `deferredCatalog` → `buildTranslatedCatalog(locale)` (`:537-551`), which misses `catalogCache` and does a full synchronous build → identical output, and populates the cache. The next `warmStep` then hits `catalogCache.has(locale)` (`:628-632`), discards its partial `out`, and returns `true`. The partially-built object is never observable. Interleaving is correct in both directions (warm-first → cached; consumer-first → sync build, warm becomes no-op).

### 1.3 en-US.generated rewrite — `PERFORMANCE_VERIFIED`

Compared old literal-object export (pre-`5ccffd537`) vs new `JSON.parse` output at the pin: **8682 message keys and 8682 sources keys, same order, byte-identical values.** `inventoryDigest` unchanged: `796840511787bbf636bc0e937e5ceea03344e0d36ae0e1fa8c96a222618a6443` (`src/localization/catalogs/en-US.generated.js:6`). New shape:

```
const MESSAGES_JSON = "...";
export const messages = deferredObject(() => Object.freeze(JSON.parse(MESSAGES_JSON)));
```

`scripts/lib/localizationInventory.mjs:96-108` (`renderGeneratedCatalog`) emits this same shape, so the extract-localization staleness check (rendered-text compare) is self-consistent — the generator and the checked-in file agree.

### 1.4 Source-regex pins — intact

`test/localization-reachability.test.mjs` pins on `gameLocalization.js` (`LANGUAGE_OPTIONS`, `startupLocale !== DEFAULT_LOCALE`, `installLocalizedDocumentBridge`, `setGameLocale`) and `next-wave-pro-02` (`languageOptionsFor\(IS_DEV\)`) all still match at the pin. `doesNotMatch` pin targets `domBridge.js` — untouched by the deferral.

### 1.5 SHIPPED_LANGUAGE_ROWS consumed identically

`gameLocalization.js:57-64` — `deferredArray(() => Object.freeze([...]))`. Consumers: `settings.js:885` `.map((o) => [o.id, o.label])`, `next-wave-pro-02` `ids()`/`.some`/`deepEqual`, `languageOptionsFor` spread (`:72-73`). All proxy-safe array patterns. `PERFORMANCE_VERIFIED`.

### 1.6 Claimed ~700ms — plausible, `PERFORMANCE_VERIFIED` order-of-magnitude

Measured at the pin (node, extracted tip files): es-ES full warm ≈ **166ms in 6 slices** (each 8–60ms); per-locale `localeReadiness` ≈ 12–16ms; `keyByEnglishMessage`-style `Object.entries` + `localeCompare` sort ≈ **86–90ms**; en-US `JSON.parse` + materialize ≈ 10–13ms. Total warm work ≈ **~800ms across ~24 post-eval tasks** — consistent with the ~700ms claimed off the eval task.

---

## 2. Boot-path regressions introduced by the deferrals — none found

Checked every consumer pattern that can diverge through a proxy:

- `Object.keys` / `Object.entries` / `for..in` / spread / `in` / `Object.prototype.hasOwnProperty.call` — all materialize and report the real surface (`runtime.js` catalog lookups use `hasOwnProperty.call` + `catalog[key]` — safe).
- `structuredClone` — no call sites touch the deferred exports (a Proxy is not cloneable; would throw `DataCloneError` — verified absent).
- `postMessage` of catalogs — absent (workers receive serializable payloads only).
- `fiveLocales.js` `catalogFor` calls `buildTranslatedCatalog` directly — bypasses proxies entirely, unaffected.
- `Object.isFrozen(proxy)` reports `false` for `SHIPPED_LANGUAGE_ROWS` where the old export was a frozen array → **minor shape divergence** (see Finding N6). No consumer checks this.
- Identity/`instanceof`/proto-sensitive reads — none on the deferred exports.

---

## 3. Ruckus lazy `template()` — `MECHANISM_VERIFIED`

`src/render/characters/ruckusModel.js`:

- `parsedDocs` memoizes `JSON.parse(entry.json)` per key (`:13`, `:21-23`); `entry.json` is only read inside `template()` — verified no other reader of `RUCKUS_MESH_DATA[k].json`.
- Only consumer of `template()`: `buildRuckusVisual` at `src/render/visualFactory.js:6020` — reached at RU-7 spawn, never during boot.
- `tools/ruckus/pack-model.mjs` emits the same `{json: <string>, binary: <b64>}` shape — generator consistent with checked-in `ruckusMeshData.js` (4 keys: `body0`, `body1`, `body2`, `core`; b64 ≈ 1.77MB/738KB/347KB/459KB).
- Warm loop (`:159-165`): `window`-guarded, `setTimeout`-chained, **one packed asset per task** (4 tasks), queued during module eval → strictly post-eval. `clearRuckusModelCache` clears `templates` but leaves `parsedDocs` (pure parsed data; deterministic; fine).
- **Cannot block the gate**: the gate (`Promise.all([ring.ready, artwork.ready])`) resolves *before* `yieldForBootPaint()` + `import('../main.js')`; warm timers queue inside the eval task and can only run after it — post-gate by construction.

`MECHANISM_VERIFIED`; warm slicing is coarse-but-bounded (4 tasks, each full parse+decode+geometry — see Finding N3).

---

## 4. B1–B4 boot-network ordering — `MECHANISM_VERIFIED`

`index.html` at the pin (registry marker line 215–2054):

- **B1**: all **1,924** `modulepreload` links carry `fetchpriority="low"`; `src/ui/bootEntry.js` carries `fetchpriority="high"` (`index.html:66`). `scripts/sync-modulepreload.mjs` accepts optional fetchpriority in the `preloadedHrefs` regex (`:80`) and emits `fetchpriority="low"` (`:182`) — generator consistent.
- **B2**: `#boot-intro-video` = `fetchpriority="high" preload="none"` (`index.html:2072-2073`); `bootEntry.js` script tag `type="module"` (`:2092`). Video fetch wins the window; module graph rides low — the low hint only orders fetches, it does not delay already-arriving bytes.
- **B3**: latin-ext `material-symbols` preload removed; the `@font-face` block itself intact → lazy on-demand fetch only if a glyph outside latin is used. Dead preload eliminated.
- **B4**: five `as="style"` preloads (`index.html:70-74`) whose hrefs match `STATION_STYLES` (`src/ui/station/stationStyles.js:11-18`) exactly: `tokens.css`, `kit/fh.css`, `station-orbital.css`, `station.css`, `station-workbench.css` — all exist at the pin. `ensureStationStylesheet()` (`main.js:324`) later injects `<link>` with the same URLs → reuse from the preload cache → only CSSOM parse+recalc remains at injection time. URL match is byte-exact → `MECHANISM_VERIFIED`.

Gate-open sequence unchanged and still fully bounded: `bootEntry.js` → `mountBootRing` + `getBootVisualizer().start()` → `Promise.all([ring.ready, artwork.ready])` (2s ring handshake, 2.5s media deadline) → `yieldForBootPaint()` (50ms bound) → `import('../main.js')` (single eval task) → `boot()` → `ensureStationStylesheet` (`main.js:324`) → `startLoop` → `nextPaint` (250ms bound) → `loadingPresenter.hide()` (`main.js:401-402`). Contract fetch is kicked at boot top and raced against 15s (`main.js:113-120,153`).

---

## 5. Fresh-eyes findings (remaining material items in the boot window)

| # | Severity | Item |
|---|----------|------|
| N1 | minor | **B4 preloads lack fetchpriority.** The five `as="style"` preloads (`index.html:70-74`, ~230KB) join the video's default/high band inside the media window — B1's ordering intent argues `fetchpriority="low"` on them. |
| N2 | **material** | **Draco trio `as="fetch"` preload (~763KB) is dead weight on the shipped path** — `index.html:90-92` (`draco_wasm_wrapper.js` 58KB + `draco_decoder.js` 512KB + `draco_decoder.wasm` 192KB). The in-file comment concedes it's kept for future/user draco files; no shipped GLB decodes it, yet it competes in the media window at fetch priority. Same class as B3, ~9× larger. Options: `fetchpriority="low"` (stays warm by decode time) or drop (cold-fetch on first user draco). Basis trio (`:100-102`, ~654KB) is live on the KTX2 path — leave alone. |
| N3 | **material** | **Warm slices are still too coarse.** Post-eval window now contains ~800ms of main-thread warm work in ~24 tasks: first task ≈ 70–80ms unsliced (rows materialize → JSON.parse + 4× `localeReadiness`), slices 8–60ms at `sliceCount=1600` (`gameLocalization.js:184`), tail `keyByEnglishMessage()` ≈ 86–90ms unsliced (`:188`). None of it blocks gate-open (gate already resolved), but it stacks into the menu-mount window. `sliceCount≈400` (~15ms/task) and/or yielding the tail behind a `requestIdleCallback` keeps every task sub-frame. |
| N4 | minor | **Dev path re-eagerizes**: `LANGUAGE_OPTIONS = languageOptionsFor(IS_DEV)` (`gameLocalization.js:77`) — `IS_DEV=true` spreads `SHIPPED_LANGUAGE_ROWS` at eval → readiness+parse inside the eval task (~70ms measured) on dev/Electron only. Prod unaffected. |
| N5 | material, owner-decision | **`ensureStationStylesheet()` still synchronous in `boot()`** (`main.js:324`): B4 removed the fetch, but the ~230KB CSSOM parse+recalc still lands inside the title window. Carried forward from wave-140's flag — the bigger half is still open. |
| N6 | cosmetic | `SHIPPED_LANGUAGE_ROWS` proxy is no longer frozen-observable: `Object.isFrozen(rows)` → false, and `rows[i] = x` silently mutates the shared backing (old frozen array threw). No consumer mutates — note only. |
| N7 | cosmetic | `test/ui-frame-references/source-manifest.json` rows for `ruckusModel.js`/`ruckusMeshData.js` are stale post-`fdf81bf4a` — but `check-ui-budgets.mjs:102-118` uses the manifest diagnostically (names drifted inputs) only after a digest failure; not a gate. Regenerate at next baseline bump. |
| N8 | informational | `?locale=<non-shipped>` token → `WARM_LOCALES` (`gameLocalization.js:180`) warms a catalog no consumer will read (~5 wasted slices). Guard warm locales to the shipped set. |

---

## 6. Other landings reviewed (not boot-path; verified for regressions)

- **F2 stageHull 30Hz drift cap** (`5dfe99249`, `stageHull.js:140-168`): `pendingRad` accumulates `dt` and renders ≤30Hz — identical angular rate and picture, reduced-motion/visibility/release paths untouched. Post-gate presented-path saving. `MECHANISM_VERIFIED`.
- **F-A `renderQuadPass`** (`d5efd9fbb`, `vendor/three.module.js:18120+`): keeps all mutable bookkeeping verbatim (renderStates/renderLists push+restore — nested render can't satisfy the `renderListStack.length === 1` capture gate, so `_sfCapturedList` is safe; textureUnits, clipping, `info.render.frame` mint, output begin/end, bindingStates reset all preserved). Skipped branches are provably dead for flat unlit quad scenes (documented). Call sites feature-detect `renderer.renderQuadPass` and fall back to `render()` — mocks keep working. Byte-parity verified by `scripts/check-quad-pass-parity.mjs` on real WebGL/SwiftShader. Frame-path only, never boot-window. `MECHANISM_VERIFIED` as wired; runtime perf deferred to render lane.
- **Heap-floor detach machinery + G2 cardEnv fields**: residency/dirty-ledger and detach-allowance work — triggers on first draws / GPU residency, i.e. post-gate. The landed guards (D1 ledger blind spot, G3 `textureGpuResident` gate, D2 uncovered-user keep, G1a packDirty ordering, G2 portrait fields) are correctness fixes. No gate-window interaction. `MECHANISM_VERIFIED` (presence); perf deferred to residency lane.

---

## Verdict

```
saturated: false
```

Boot-path correctness landings (B5 deferral, B1–B4 ordering, F2, F-A, ruckus) all verify — no regressions introduced, ~700ms eval saving is real and the gate sequence is unchanged and fully bounded. Material open items remain in the window: **N2** (draco ~763KB dead-priority preload), **N3** (warm-slice granularity → menu-mount stalls), **N5** (station stylesheet parse still synchronous — owner decision), with N1/N4/N8 minor.
