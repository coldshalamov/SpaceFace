# G_NAV_HUD_SLICE — W3 NAV-HUD information hierarchy polish

**Owner:** Grok (parallel complementary slot; Kimi W3 NAV-HUD dispatch did not land)  
**Spine:** `C:\Users\93rob\Documents\GitHub\SpaceFace-depth-actualization`  
**Branch:** `grok/depth-player-route-actualization`  
**Date:** 2026-07-17  
**Scope:** SMALL presentation hierarchy polish. No commit.

## Intent

Make the flight HUD read **one objective, one immediate action, one threat** more clearly:

- Primary objective verb is visually dominant.
- Title eyebrow + distance/ETA meta stay quieter.
- Untracked “next action” guidance is softer than a live tracked/waypoint objective.
- Contact roster ranks threats without being removed.
- No station-shell redesign, no `input.js`, no thrusters/assets.

## What was already true (preserved)

Shipped one-surface law remains:

| Surface | Role |
|---|---|
| `.sf-mission-tracker` | Sole persistent command surface (active objective) |
| `.sf-objectives` multi-row stack | Hidden / cleared (`__active-objective-owns-attention__`) |
| `.sf-nav-readout` | Yields while objective owns attention |
| `#alerts` / one-voice floor | Top-center transient; `.sf-alert--floor { order:-1 }` |
| Contact roster / radar / target panel | Still mounted on the right dock |

## Changes in this slice

### 1. `src/ui/uiRoot.js` (CSS)

- Mission tracker hierarchy:
  - **Title** (secondary): 9px, opacity `.72`, quieter eyebrow.
  - **Objective** (primary): 14px / weight 700, hard text shadow for playfield legibility.
  - **Time/meta** (secondary): `--text-secondary`; urgent keeps amber emphasis.
- Soft mode (`.sf-mission-tracker--soft`): cyan edge, lower background, quieter verb for untracked next-action.
- **Fixed inverted narrow hierarchy:** mobile media query no longer makes `.sf-mt-obj` smaller than the title (was 9px obj vs 10px title).
- Spatial goal plate / nav readout remain subordinate cues.

### 2. `src/ui/hud.js` (light presentation markers)

- Tracker lines expose `data-hud-tier="secondary|primary|meta"` (presentation/CSS hooks; still one labelled `role=region` for AT).
- Mode classes:
  - `.sf-mission-tracker--primary` when tracked mission or live waypoint.
  - `.sf-mission-tracker--soft` when only “track a contract / choose story action” guidance is showing.
- Contact roster:
  - Hostiles get `.sf-overview-row--threat`.
  - First hostile in the sorted list gets `.sf-overview-row--lead-threat` (one visual lead threat).
- No roster removal, no radar/target panel changes beyond class hooks.

### 3. `styles/ui.css`

- Threat row tint + lead-threat weight (stronger left border, name weight).
- Non-lead threats slightly quieter than the lead row; selected/hover still work.

### 4. Contract check

- New: `scripts/check-nav-hud-hierarchy.mjs`
- npm: `check:nav-hud-hierarchy`
- Pins hierarchy declaration, attention de-dupe, tier markers, CSS size order, roster/threat classes, one-voice floor, station-shell fence.

## Verification

| Check | Result |
|---|---|
| `npm run check:nav-hud-hierarchy` | PASS (6 groups) |
| `npm run check:professional-first-hour-one-voice` | PASS (28 contracts) |
| `npm run check:ui-identity` | PASS (13/13) |

Not run (out of scope / heavier): full `npm run check`, live headed first-hour screenshots. Visual acceptance should capture idle + route-active + multi-hostile overview when a headed pass is available.

## Explicit non-goals / fences

- Did **not** edit `src/systems/input.js` or `src/ui/input.js` ownership for this task.
- Did **not** touch `assets/`, thrusters, or station shell redesign (`stationApp` / dock chrome).
- Did **not** remove contact roster, radar, station UI, or objective arrow.
- Did **not** bypass or rewire the one-voice arbiter; only presentation hierarchy around existing surfaces.
- Did **not** commit.

## Files touched

- `src/ui/hud.js`
- `src/ui/uiRoot.js` (injected HUD CSS block)
- `styles/ui.css`
- `scripts/check-nav-hud-hierarchy.mjs` (new)
- `package.json` (`check:nav-hud-hierarchy` only; concurrent script edits preserved)
- `docs/evidence/orchestration/returns/G_NAV_HUD_SLICE.md` (this return)

## Residual risk / follow-ons

- Headed before/after screenshots still valuable for taste sign-off (Kimi’s original acceptance asked for them).
- If a fuller “information hierarchy ruling” (Fable §5.3) lands later, this CSS/tier vocabulary is the intended presentation hook.
- Soft-mode cyan edge is a deliberate contrast to primary amber; a11y contrast already covered by existing WCAG gates for mono text on dark panels — re-check if palette tokens change.
