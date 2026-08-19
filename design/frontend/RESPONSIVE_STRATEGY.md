<!-- LIFETIME: DURABLE -->
# Responsive Strategy

This document defines the responsive contract for flight HUD and full-screen instruments.

## Policy

- **Ultrawide (21:9+)**: anchored HUD instruments clamp to a centered safe frame instead of stretching to physical edges.
- **4K / high-DPI**: UI scales through `--ui-scale`; no new responsive rule may override player scale choices.
- **Small / handheld**: degrade by dropping content density, never by shrinking type below 12px.
- **Capture matrix**: every frontend capture run includes `2560x1080`, `1920x1080`, and `1280x720`.

## Token Contract

- `--sf-safe-inset-x`: ultrawide side inset computed from a 16:9 center frame.
- `--sf-stage-max`: max reading-column width for full-screen instruments (current value: `2200px`).

The safe inset applies to anchored HUD edges (left and right anchors) while centered lanes remain centered.

## Architecture Ruling

- **Anchored instruments inset**: left/right HUD anchors consume `--sf-safe-inset-x`.
- **Projection layer full viewport**: `#hud` is not inset; world-projected marks remain in full-viewport coordinates.
- **Screen backdrops full-bleed**: full-screen roots stay edge-to-edge.
- **Reading columns clamped**: instrument content columns center within `--sf-stage-max`.

## Current Clamp Targets

- Skeleton zones in `styles/ui.css` section 11 (`.sf-crest`, `.sf-stage`, `.sf-apron` under `.sf-instrument`).
- Ship screen stage host (`.sf-ship .sx-sw`).
- Galaxy map reading columns (`.gm-head`, `.gm-body-container`) while map background remains full-bleed.

## Handheld Law

- Keep 12px minimum type floor.
- At narrow tiers, remove secondary labels/counts before reducing typography.
- Preserve readable overlap-free anchors at the `1280x720` capture floor.

## J10+ Screen Requirement

New full-screen instruments must:

1. use `--sf-safe-inset-x` for anchored HUD edge placements,
2. keep projection overlays in full viewport coordinates,
3. clamp CREST/STAGE/APRON reading columns with `--sf-stage-max`,
4. ship captures at all three matrix sizes.
