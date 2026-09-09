# HUD Three-Anchor Reconciliation

**Date:** 2026-07-08
**Disposition:** DATED RECONCILIATION RECEIPT, not current layout law. It records why one HUD pass
collapsed duplicate surfaces. Current work follows `design/GDD_2_0.md`, the activated UX spec, and
player-facing evidence. Do not delete the contact roster, station UI, navigation, or tactical
information merely to preserve this anchor count.

## The layout used by that pass
The reconciled flight screen used four zones:
1. **Bottom-left** — ship schematic + vitals + persistent state ("who I am, where I'm going").
2. **Bottom-center** — action bar + status readouts + transient chips ("what I'm doing now").
3. **Bottom-right** — radar + overview + target panel, one tactical stack ("what's around me").
4. **Top-center** — the one-voice attention line ONLY (`#alerts`).

## Decision: Option A (fold commandBar into the anchors; retire it in flight)

The commandBar was a **fourth permanent anchor** pinned top-center, competing with the one-voice
channel and duplicating data the anchors already carry. We take **Option A**: retire it in flight.
Every fact it pinned is already present in an anchor or a contextual surface — verified pin-by-pin:

| commandBar cell | Where it lives now (already built) |
|---|---|
| Hull / Shield | Bottom-left `.sf-schematic` (hull tint + numeric, shield ring) |
| Energy / Heat | Bottom-left `.sf-bars` micro-bars (ENGY / HEAT) |
| Cargo | Bottom-center cluster contextual chip (`data-chip=cargo`, 4 s fade on `cargo:changed`) |
| Credits (+Δ) | Bottom-center cluster contextual chip (`data-chip=credits`, fade on `credits:changed`) |
| Class / role | Bottom-center cluster contextual chip (`data-chip=role`) |
| Sector | Jump-in `sectorPostcard` on `sector:enter` + the map |

This satisfies SPEC3-36's explicit ruling: *"credits/cargo deltas appear as chips on change then
fade (retiring the bottom text-strip)."* Nothing is lost; the top of the screen becomes one voice.

**Why not Option B (reuse commandBar as a shared screen header) now:** the shared header
(location · credits · time) is a *screen-layer* concern — SPEC3-36's separate "screen system polish"
work item. Doing it correctly means the header lives inside the `#screens` layer owned by
`screenManager` (a `#ui-root` element cannot cleanly stack above screens at z-index 100 without
breaking modal focus/lifecycle), and `stationHub` already ships its own check-pinned header + undock
control. Wiring a competing header across screens is out of scope for a *flight-HUD* task and would
put the risk squarely on "existing screens still mount." **Option B is deferred, not rejected:**
`commandBar.js` is kept intact and still imported, gated off in flight by `COMMAND_BAR_IN_FLIGHT`
(`uiRoot.js`), as the ready skeleton for that future screen-header pass.

**Known gap this leaves (scoped, not a miss):** ask #5's "credits/cargo in the shared header on
station/map screens" has no shared header to land in yet — on station, credits/cargo live in the
stationHub surfaces; the map defers to the screen-polish task above.

## Straggler relocation (SPEC3-36 anchor budget law)
Three contextual readouts sat outside the anchors (top-left / top-right / top-center). They are
**relocated by CSS into the bottom-left anchor** as a single contextual column above the schematic —
their update logic is untouched (WHERE they render changed, not WHETHER/WHEN; the latter is
SPEC3-40's attention-arbiter territory, deliberately not touched here):

| Straggler | Was | Now |
|---|---|---|
| `.sf-mission-tracker` | top-left `top:96px;left:22px` | bottom-left `.sf-leftstack` column |
| `.sf-objectives` (list) | top-right `right:22px;top:18px` | bottom-left `.sf-leftstack` column |
| `.sf-nav-readout` | top-center `top:60px;left:50%` | bottom-left `.sf-leftstack` column |

The off-screen objective **arrow** (`.sf-objarrow`) stays a root-level, screen-following overlay
(it is not a panel and must track the world edge). `.sf-bars` now nests inside `.sf-leftstack`
(context column on top, schematic + vitals below), so the whole left anchor is one flex column.

## Already-compliant (verified, unchanged)
- **Overview strip** (`.sf-overview`): 8-row cap + "+N CONTACTS" footer, hostiles→neutrals→friendlies
  sort, distance + closing/opening, click-to-target, 5 Hz cadence (`overviewTick % 12`), signature
  memoization, contextual reveal. Passes `check:ui-identity` §2.
- **Right-side tactical stack**: `.sf-rightdock` = `[targetPanel, overview, radar]`, right-aligned column.
- **Contextual chips**: cargo/credits/role via `chipShow(key, 4000)` in the bottom-center cluster.

## Acceptance
`check:ui-identity`, `check:radar:perf`, `check:ui:perf`, `check:wcag-contrast`; five-second
screenshots (idle flight, mining, combat, overview-full) into `.devshots/spec2/`.
