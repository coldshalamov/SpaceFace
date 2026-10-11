# Wave 140 — Boot Lane Verification & Cold-Boot Waste Audit

**Audit lane:** read-only. **Pinned SHA:** `1564773c4e0c692f178ce8f1a4f685ecce850199`
(`origin/devin/1791504143-perf-w120` at audit time). Report branch: `devin/perf-wave-prompts`.

Verification levels: **MECHANISM_VERIFIED** = the code implementing the claimed mechanism exists
at the cited location and is wired into the boot path. **PERFORMANCE_VERIFIED** = the improvement
is measurable from the code alone (bounded count/complexity reduction). **UNVERIFIED** = plausible,
needs a trace or A/B to quantify.

---

## 1. Wave-139 boot fixes — verification

### V1. Unconditional `_saveStoreGeneration` recheck in `loadAsync` — MECHANISM_VERIFIED

`src/save/saveSystem.js`

- `:4984` — `const latchGen = _saveStoreGeneration;` latches the generation at window open,
  before the spec consult and raw read.
- `:5043` — `let primary = await primaryPromise;` ends the window (rollback capture +
  worker roundtrip both span real frames).
- `:5046` — `if (_saveStoreGeneration !== latchGen)` re-verifies on **every** path:
  specHit, specByteHit, and spec-miss alike. On mismatch the prepared verdict is discarded
  and re-prepared from a fresh `getItem` (`:5047-5051`).

The pre-wave-139 gap — a mid-load tracked write installing stale bytes on the spec-miss path —
is closed: the guard no longer depends on `spec.sig` (stale by construction for byte-hit arms),
it compares generation movement since the latch, which is the correct invariant for all three
lanes. Comment at `:5040-5045` documents the reasoning and matches the code.
Cost on the happy path: one integer compare — O(1), no regression. Correctness-class fix.

Commit `5e9efb499 perf(wave139): unconditional loadAsync gen recheck + boot-video fetch priority`
is in the audit tree.

### V2. `fetchpriority="high"` on `#boot-intro-video` — MECHANISM_VERIFIED

`index.html:2060` — `<video id="boot-intro-video" ... preload="none" fetchpriority="high"
poster="assets/cinematics/boot-visualizer.jpg" ...>`.

The fetch itself is kicked from `src/ui/bootMediaPlayback.js` `selectSource()` (`video.src =
source; video.preload = 'auto'; video.load()`) which runs inside `artwork.start()` —
synchronously in `bootEntry.js`'s `start()` before the gate is armed. So at t≈0 the media
fetch (~11.8MB `boot-visualizer.mp4`) is issued into the same window as ~1,927 modulepreload
fetches; `high` lifts it out of the early-hint band those sit in.

Why it matters mechanically: `artwork.ready` settles on `two-presented-media-frames`
(`acceptFrame`, proofFrames >= 2) or `startup-media-deadline` (2500ms). Every ms the video
starves behind module traffic pushes the gate toward the 2500ms bound. The hint converts
the common case from "gate rides deadline" to "gate opens at real media readiness."
The benefit is real but its magnitude is connection-dependent → UNVERIFIED quantitatively,
though the mechanism is confirmed end-to-end.

Note: `preload="none"` is deliberate — the quiet/normal variant pick is a JS-gated preference
(`flashReduced()`); the attribute only defers the fetch to `selectSource`, not to user action.

### V3. F1–F3 (waves 137–138) — no regression, all MECHANISM_VERIFIED

- **F1 worker session caps** — `src/save/saveWorker.js:9` `MAX_WORKER_SESSIONS = 4`;
  `capWorkerSessions` (`:10-12`) FIFO-evicts via Map insertion order; wired at `:403`
  (validationSessions) and `:428` (encodeSessions), plus the worker-side mirror at `:852-887`.
  Orphaned begin-without-finish sessions can no longer accrete save-sized graphs.
- **F2 decoded-envelope FIFO** — `src/save/saveSystem.js:5245-5247`
  `_decodedSaveEnvelopes` capped `while (decoded.size > 8)` FIFO; consults at `:5364`, `:5388`.
  Companion `_preparedEnvelopeCache` same bound at `:5337`. A miss re-runs the async lane —
  no correctness dependency on cache state.
- **F3 saveLoad screen deferral** — `src/ui/screens/saveLoad.js`:
  memo entries mint lazy (`raw: null, data: null`, `:786-795`, capped `_SLOT_DATA_MEMO_MAX = 6`
  `:773`); fills ride a 180ms trailing debounce (`_SLOT_DATA_FILL_MS :803`,
  `scheduleSlotDataFill :880-889`); `fillSlotDataLazy` (`:845`) prefers a covering spec arm's
  parked dispatch, else `peekSaveCardData` worker parse, else the byte-identical sync fallback.
  The multi-MB `getItem`+`JSON.parse` stays off the pick task — deferral intact.

---

## 2. Cold-boot path — what actually runs

1. **Parse**: 11 render-blocking stylesheets (~337KB total), 5 font preloads, ~1,927
   modulepreload hints (hand wave ~:64-201 + generated registry block :202-2041, emitted by
   `scripts/sync-modulepreload.mjs`), fetch-only hints for draco/basis/workers, poster img.
2. **bootEntry.js** (index.html:2079, module/deferred): `mountBootRing` (SVG+canvas+worker,
   2s handshake bound) + `getBootVisualizer().start()` → `selectSource` → video fetch kicks.
3. **Gate**: `Promise.all([ring.ready, artwork.ready])` — bounded on both legs
   (2s worker handshake timeout → SVG fallback; 2.5s media deadline → poster/fallback art).
4. `yieldForBootPaint()` — one rAF + task hop (50ms bound) so a real frame presents before eval.
5. `import('../main.js')` → **single blocking eval task** over the ~1,900-module static closure.
6. `boot()`: contract fetch kicked early (parallel, 15s bound) → `createGameState` →
   `bootstrapProfileSettingsBeforeRegistry` (one localStorage read+merge) → `createRegistry`
   → `registry.initAsync` (sliced, `budgetMs:10`, `yieldForBootPaint` per over-budget slice;
   render init = WebGL2 context + `THREE.WebGLRenderer`, pipeline precompile already deferred
   to first sector) → telemetry/achievements/accessibility → `ensureStationStylesheet()`
   (~230KB CSS links injected) → `startLoop` → `await nextPaint()` (double-rAF, 250ms bound)
   → `loadingPresenter.hide()`.

The gate is the critical path and it is bounded everywhere. Remaining waste is in what
competes with the gate's inputs (bandwidth) and what the post-gate window serializes (eval).

---

## 3. Findings — `saturated: false`

### B1 — Demote the modulepreload mass to `fetchpriority="low"` — MECHANISM_VERIFIED

**Evidence:** `index.html` ~1,927 modulepreloads; generated block emitted at
`scripts/sync-modulepreload.mjs` (the `wanted.map(...)` emit template, ~:183) +
hand-maintained wave `index.html:64-201`. `index.html:2060` already raises the video to `high`.

**Mechanism:** the mirror exists to warm fetches *inside* the media-gate window — every module
byte is strictly useless until the gate opens (eval is gated), while the video byte stream is
exactly what the gate waits on. Today the video shares the early-hint priority band with
~1,900 module fetches: `high` on the video competes evenly against modulepreloads' default
priority rather than dominating it. `fetchpriority="low"` on every `rel="modulepreload"` link
encodes the intended order directly: video/fonts/CSS above the warming tide. On HTTP/1.1-style
per-connection FIFO this also removes head-of-line queuing of the media fetch entirely; on
multiplexed transports it biases frame scheduling toward media completion.
Post-gate, unfetched modules continue at full bandwidth anyway — the demotion only reorders
*within* the media window, so the post-gate eval cascade cannot be made worse than it already
is on a cold cache.

**Implementation:**
- `scripts/sync-modulepreload.mjs`: add `fetchpriority="low"` to the emit line
  (`<link rel="modulepreload" fetchpriority="low" href="${href}" />`), and update the
  `preloadedHrefs`/`current` regexes (~:80, ~:138) which match the exact
  `<link rel="modulepreload" href="..." />` shape — they would silently stop matching.
- Hand wave `index.html:64-201`: add `fetchpriority="low"` per link (the
  `modulepreload:registry:begin/end` markers bound the generated span only).
- Regenerate + `--check`. Quality-preserving: identical bytes, only fetch order changes.

### B2 — `src/ui/bootEntry.js` itself is un-preloaded — MECHANISM_VERIFIED

**Evidence:** `<script type="module" src="./src/ui/bootEntry.js">` at `index.html:2079`;
`grep -c modulepreload.*bootEntry` = 0 while all three of its static imports
(`orrery/bootRing.js`, `core/bootScheduler.js`, `bootVisualizer.js` → `bootMediaPlayback.js`)
are hinted.

**Mechanism:** the entry's fetch starts only when the parser reaches line 2079 — after ~2,000
link-tag parses — and the *entire* sequence (video kick, ring arm, gate arm) waits on its
download+eval. One line in the head wave pulls its fetch forward into the parse window.
Small (one RTT-class), but it sits at the head of the whole critical chain, and on the
generated-block path it is one of the few links worth hand-maintaining.

**Implementation:** `<link rel="modulepreload" fetchpriority="high" href="./src/ui/bootEntry.js" />`
in the hand-maintained head wave — keep it `high` if B1 lands, since it gates the gate itself.

### B3 — `archivo-var-latin-ext` font preload is unconditional dead weight on en-US boot — MECHANISM_VERIFIED

**Evidence:** `index.html:~162` preloads `archivo-var-latin-ext-standard-normal.woff2`
(86,240 B) at crossorigin high priority. `styles/fonts.css` declares that face under
`unicode-range: U+0100-02BA, U+1E00-1E9F, U+20A0+, ...` — Latin Extended + currency.
The boot overlay strings ("SPACEFACE · FLIGHT SYSTEMS", "Initializing systems…",
"Preparing your next departure", digits/`%`) contain no ext-range glyphs; `·` is U+00B7,
inside the *standard* face's range.

**Mechanism:** `preload` fetches unconditionally — the ext file arrives during the media
window and is never consulted unless an ext glyph paints. The @font-face already lazy-fetches
on first matching glyph, which is the designed deferral. Deleting the hint frees ~86KB of
high-priority fetch inside the video window at zero visual cost on the en-US path; a screen
that later shows ext glyphs pays one font fetch under `font-display:swap` (graceful FOUT,
same as any uncached face today).

**Implementation:** delete the latin-ext `<link rel="preload" as="font">` line only;
keep the @font-face declaration and all four other preloads.

### B4 — ~230KB station sheet set injected inside the title window — MECHANISM_VERIFIED

**Evidence:** `main.js` (boot body) calls `ensureStationStylesheet()` →
`src/ui/station/stationStyles.js:15-19` inserts 5 stylesheet links:
tokens.css (5.7KB) + fh.css (17KB) + station-orbital.css (72KB) + station.css (133KB) +
station-workbench.css (2.6KB) ≈ 230KB, for screens first reachable at dock.

**Mechanism:** insertion is synchronous in `boot()` before `nextPaint`; the fetches+CSSOM
parse land during the title window — bandwidth against module warming, and five style
recalcs on the main thread. The comment's rationale is cascade-order consistency
(pre/post-dock identity), which constrains *when* the links may appear, not *when the bytes
may be fetched*. Cheapest half-fix: `as="style"` preload hints in `<head>` so the bytes are
already warm when injected (keeps the cascade anchor and its ordering unchanged). The bigger
fix — deferring injection to menu-idle/first-dock — is only sound if the cascade-order
argument is re-verified; flag that as needing an owner decision, not a drive-by.

**Implementation (safe half):** five `<link rel="preload" as="style" href="...">` hints
matching `STATION_STYLES`' hrefs.

### B5 — ~5.8MB of data-heavy modules sit inside the post-gate eval task — MECHANISM_VERIFIED

**Evidence (all in the generated closure = evaluated in the single blocking post-gate task):**
- `src/render/characters/ruckusMeshData.js` — 3,393,166 B of numeric-literal mesh data,
  statically imported by `ruckusModel.js:7`.
- `src/localization/catalogs/en-US.generated.js` — 1,794,423 B; static chain
  `main.js → ui/accessibility.js:23 → localization/gameLocalization.js:1 → catalog`.
- `src/render/combat/gas/gasVolumeData.js` (359KB) + `densityVolumeData.js` (347KB),
  via `transientVfxMaterials.js:2`.

**Mechanism:** fetches are pre-warmed so the post-gate window is *eval*-bound, and these
three are the largest literal-construction costs in it — on the order of the game's own
biggest logic modules (renderer.js 1.74MB is code; the above are mostly data). Each is a
deferral candidate of a different shape: mesh/volume data → decode-on-first-use or binary
asset (fetch+decode off the eval path); catalog → dynamic import resolved before first
localized paint (menu mount is the earliest real consumer, seconds later). This is a design
task, not a drive-by — flagging as the largest single remaining presented-thread cost.

**Also noted, no finding:** `intro.css`+`boot-instrument.css`+`boot-visualizer.css` cover the
boot overlay classes, so ~120–185KB of the ~337KB render-blocking CSS (menu/asteroid-ops/
prompt-deck/crucible and likely part of kit/ui tokens) is technically deferrable past first
paint — but which sheets the boot classes resolve against needs a cascade pass before cutting;
the win is small on the packaged path and the menu lands close behind anyway.

---

## 4. Verdict

- Wave-139 boot fixes: **landed and correct** (V1, V2), F1–F3 **no regression** (V3).
- **`saturated: false`** — B1 (modulepreload `fetchpriority="low"`) is the headliner:
  zero-risk fetch-order fix with a real mechanism; B2/B3 are one-line frees; B4's safe half is
  one stanza of hints; B5 is the largest cost but is a design task.
- Not verified by this lane (by design): numeric ms deltas — needs a cold-cache trace run;
  B1/B3 are cheap enough to A/B directly, B5 wants an eval-profile first.
