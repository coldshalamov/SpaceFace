# BP-10 — POLISH & UX

> **Extends** `SPEC3-F10` (UX/onboarding) + `SPEC3-F8` §33-34 (render/VFX). Objective #6 (light sells the
> fiction) + the accessibility/legibility foundation the game currently lacks.

## Goal
Make the game *look shipped* and *read* to a new player, and accessible to players with vision/motor needs.

## Scope
- [ ] **Graphics polish** (Wave-2 render lane owns the post stack): bloom (emissive glow), ACES tone-mapping,
      distance fog, dynamic point lights at muzzle/explosion/mining impact, **engine ribbon trails** (new
      `src/render/ribbonTrails.js`, replacing particle trails — ribbons carry info: direction/speed/boost/damage).
      Every effect ships with a **quality toggle** measured against the 30 fps floor before merge.
- [ ] **PBR on hero assets** (needs BP-08 maps): metalness/roughness, star-lit.
- [ ] **System-wide tooltips** — hover any stat/icon/commodity (new `src/ui/tooltips.js`).
- [ ] **Accessibility** — text-scale, colorblind-safe palette in Settings (extends `src/ui/accessibility.js`).
- [ ] **Drone logs** — rolling per-drone history (FTL/Rimworld texture) for the automation layer.
- [ ] **HUD contact identity** — faction · role · threat-tier · ship class/level badge on the target panel +
      radar (data already on `entity.data.ai`/`entity.factionId`/`entity.data.level`).

## Primary files
`src/render/` post/renderer + new `ribbonTrails.js`, new `src/ui/tooltips.js`, `src/ui/accessibility.js`,
`src/ui/settings` screen, target-panel/radar HUD elements, BP-08 PBR maps.

## Acceptance
`check:perf` stays within the 30 fps floor + draw-call budget with effects on; tooltips appear on hover across
map/trade/dock; colorblind palette + text-scale persist in save; contact badges render.

## Dependencies
BP-08 (PBR maps, HUD art); Wave-2 render lane; perf budget (`design/PERF_BUDGET.md`).
