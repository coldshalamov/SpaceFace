# Mobile ordinary-flight HUD collision repair

2026-10-20 20:00 UTC. Owner: resume_mobile_hud_polish. SF-VISUALS and whole-game/mobile acceptance remain open.

## Reproduced evidence and cause

Actual Chromium PR472 portrait New Game frame `03-flight.png` (390px viewport) shows the radar over the tutorial/objective. Actual Chromium PR473 landscape Continue frame `08-continue-flight.png` (844x390 viewport) shows Overhead/View/Circuits over the radar compass and contacts. Both images were inspected, not inferred from test counts.

Two production sheets competed: touch styles anchored the portrait dock at y168 and landscape dock at y64; the HUD readability pass then forced a relative .75-scale radar and a 90px right inset. Portrait objectives began y186 underneath this dial; landscape compact controls began y68 in the same right lane. A fixed-position child and transformed ancestor were not a reliable reservation scheme.

## Bounded correction

- `src/ui/orrery/mobileFlightLayouts.js` now owns these responsive anchors. `hudStyles.js` imports it; obsolete competing placements were removed from `src/systems/mobile/styles.js` and the earlier HUD block.
- Ordinary portrait radar uses its 153px visual footprint from the unchanged 204px instrument at .75 scale, right-aligned within the existing card column, right12 and top196, including safe-area offsets. The objective retains its existing .75 edge fit and wraps within a width that reserves this column plus a gutter. It is not clipped or hidden.
- Short landscape compact camera/Circuits keys use a 180px top lane ending before the radar begins at y80, clear of vitals and Pause. Authored race map/readings and critical controls are untouched.
- Law/contact cards retain their original portrait min(236px,58vw) and landscape min(236px,32vw) widths and natural column flow. Active-card overlap remains to be measured in browser; card width is not reduced to force a pass. The column and enlarged radar keep overflow visible; no information is silently cropped to make a screenshot pass.
- The expanded tactical overlay retains its authored 358px envelope, .75 scale, 290px face, double-range and existing tap-to-close/target-course behavior. Removing the expanded class restores the compact width. Expanded portrait overlap is a separate legacy composition issue, explicitly NOT claimed corrected or accepted here.
- No camera, world resolution, palette, global LOOK, game state, deadline, probe gate, workflow or touch-action behavior changed.

## Checks and limits

Immutable proposed public source/test tree `19955bbb92d13ae7fd54c890c10a0133f68c7d90`, based solely on public PR473 head `3b3732beb3c7d9daad2c54b527b6621ee5f9d5a4`: 82/82 pass across mobile-deck-instrument (including the14 new collision contracts), j07-hud-contract, orrery-hud-adapter and mobile-flight. All 472 repository module/file read receipts match that tree's blob identities. The new tests live in mobile-deck-instrument.test.mjs, explicitly selected by the existing mobile-readiness.yml unit step; no workflow/package changes. New tests parse real production CSS and assert authored geometry contracts at390x664,390x844,320x568,360x640,844x390,667x375,568x320 and safe-area variants. These calculations are NOT browser box measurements or visual acceptance.

Local normal-sandbox Chromium attempt at19:55 UTC failed before page creation: default bundled executable absent; installed `/usr/bin/chromium`, with `chromiumSandbox:true`, failed process-singleton socket EPERM (and crashpad database error). No sandbox bypass or follow-on escalation was used. A partial-checkout j07 run also could not read absent `styles/ui.css`; the immutable-public run reads the actual public file and passes. One validation-adapter run lacked esbuild's named transform export; the test now uses its supported default export and the final immutable run passes.

Fresh remote check19:58 UTC: PR473 open/draft/unmerged at the above head; master `a8a9500ab87e1bcff91c407e96f744a52202a134`. Preserve these dependencies and recheck before publication.

## Next executable action / acceptance

Root review, then a new draft PR on verified public PR473 ancestry. Existing mobile CI must produce actual post-change portrait New Game and landscape Continue screenshots for inspection. Verify radar/objective and radar/camera controls separation, long tutorial wrapping, law incidents, expanded radar entry/exit and touch targets. Do not call authored geometry tests a live-game result. WebKit pre-menu crash, physical-device acceptance, dark/soft world legibility and expanded-overlay composition remain separate open work. No user action is requested for this bounded source increment.
