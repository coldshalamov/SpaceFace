# G — Bar `stationId` plumbing (wreck rumor path)

**Date:** 2026-07-17 · **Owner:** Grok · **Spine:** `SpaceFace-depth-actualization` @ `grok/depth-player-route-actualization`  
**Source residual:** `G_V2_D1_STATUS.md` — wreck_rumors Bar deliberate rumor/bearing blocked  
**Scope:** Few-line integration only. **No station shell redesign. No commit.**

## Verdict

**REAL gap closed (source contract).** Live `stationApp` now forwards `stationId` into screen `onShow`/`refresh` payloads (legacy hub already did for `createBarPanel`). Live Bar (`createBarScreen`) stores that id and uses it for contacts / `buildReply` / `uniqueWreckBarRumor`.

## Trace

| Seam | Before | After |
|---|---|---|
| `stationApp.navigate` / dock re-show / refresh | `onShow({ ...ctx, ...options })` — **no** `stationId` | `screenPayload(...)` always includes `stationId: dockedStationId` |
| Live Bar `createBarScreen` | `sid()` = only `state.ui.dockedStationId`; ignored onShow id | Prefers `onShow`/`refresh` `stationId`, falls back to docked id |
| Legacy `createBarPanel` | Already required `c.stationId` on onShow | Unchanged (hub still passes it; not live default) |
| Engine | `uniqueWreckBarRumor(state, stationId, 'rumors')` keyed by station | Unchanged; Helios barkeep → `wreck_mts_silver_draft` when stationId known |

Without a station id, deliberate bar wreck rumor returns `null` (bearing never granted). With Helios id, headless probe: 4 contacts, barkeep `rumors` choice, wreck id `wreck_mts_silver_draft`.

## Diff

| File | Change |
|---|---|
| `src/ui/station/stationApp.js` | `screenPayload()` + use on navigate / mission re-focus / refresh / app onShow |
| `src/ui/station/screens/bar.js` | Capture `c.stationId` on onShow/refresh; prefer in `sid()` |

## Gates

| Gate | Result |
|---|---|
| `npm run check:bar:narrative` | **GREEN** — 8 recurring NPCs / 32 stations |

## Residual

- **V2 Playwright capture** (`scripts/capture-depth-program-v2.mjs`) still queries **legacy** `.st-bar` and asserts zero contacts as a “protected defect”; live instrument is **`.sx-bar`**. Re-run / retarget selector + flip wreck_rumors reachability when capture is refreshed (not this residual).
- Capture/status prose still names `createBarPanel`; live path is `createBarScreen` via `stationApp`.
- Kimi Bar identity polish (task 10) untouched.

## Charter

```
LIVE AUDIT: G_V2_D1_STATUS wreck Bar stationId residual; stationApp onShow vs stationHub; createBarScreen vs createBarPanel; uniqueWreckBarRumor.
DIFF SUMMARY: stationApp screenPayload(stationId); createBarScreen onShow stationId → sid().
GATES: check:bar:narrative GREEN.
FAILURE CLASS: N/A — REAL plumbing gap closed at source.
PLAN DRIFT: none — no shell redesign; no commit.
RESIDUAL: V2 capture .st-bar selector + reachability relabel; Playwright recapture.
```
