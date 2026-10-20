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

## Actual PR475 browser evidence and portrait receipt follow-up — 20:16 UTC

Published draft https://github.com/coldshalamov/SpaceFace/pull/475 at verified head `6f1f5528bd5714a6e5d4e886dd179289d014a116`, tree `bbc85cbcbeae19fb3b64587c4edba336ac206e04`, sole public PR473 parent. Existing mobile-readiness run39489253349 is terminal failed overall: Chromium job118857679470 passed; WebKit job118857678743 failed in `waitForMenu` with `Page crashed`, before Continue. Both unit gates passed145/145, demonstrating the14 new geometry cases actually ran in CI. Chromium New Game/controls, capabilities, Continue, worker contract and renderer health passed; worldVisibility remains unverified. Continue measured29030ms. General check39489253387 still running at20:16: feel/sim/static3 pass, static1/2 fail, browser shards pending; no all-green claim.

Actual Chromium artifacts12294723678 (ZIP SHA256 `520c6d34aa81e5b80dc2b77c2c74d6c414b952e683a70aca5fd242b475ab66a7`) and WebKit12295236918 (`d9a40cb00c323b0c17b5c44d27bd2744fcb5e2c1bb107654f94d5082c8fd79d3`) downloaded and verified. Owner and root independently inspected portrait `03-flight.png` and landscape `08-continue-flight.png`:
- The original landscape camera/Circuits-to-radar overlap is visibly gone in the measured frame.
- The original portrait objective/tutorial-to-radar overlap is visibly gone in the measured frame.
- Portrait radar caption now overlaps the informational receipt line. This is NOT final HUD acceptance. The Powers handle also intersects the radar's right-edge region and requires further bounded composition work. Expanded/law-card states were not exercised.

Follow-up keeps portrait receipts in the left information lane for both handedness settings, reserving the radar caption's153px width plus13px gutter while preserving the existing cluster/bottom clearance. It adds no clipping, truncation, opacity or visibility behavior; critical receipts still wrap, and existing informational receipt announcements remain intact. Landscape receipts are unchanged. Selected mobile-deck unit suite30/30 and exact public four-suite83/83 pass on tested tree `f4a024018bb624ef1c41ec08af45809e1b76489f`. Actual post-follow-up images remain required.

Powers is not moved by this receipt correction: the existing110px handle plus16px extended hit region cannot fit the roughly110px free gap at390x664 or the roughly14px gap at320x568 between radar-caption and Gun. An offset-only change would create a new collision. Keep that visible interaction issue open rather than shrinking or hiding the control.


## Coherent portrait navigation successor — 20:23 UTC

The receipt-only check above is intermediate. The combined successor keeps the same Powers button, accessible name, tap/swipe selection, keyboard click, Escape close, expanded state and intentional side-edge gesture. Portrait places its full 56x44px target beside Pause in the top navigation lane. Only the decorative vertical arc and its old oversized pseudo hit extension are removed in portrait; the visible horizontal Powers label, existing font, bone/Hand treatment and focus outline remain. Landscape is unchanged.

Powers reserves the actual Pause width max(44px,52px times the UI scale). The status strip retains its labels/fonts and flexible meter bars; speed units can wrap at the narrow extreme rather than intrude into navigation. Authored contracts cover both handedness settings and .8/1/1.6 scales at320x568 and390x664/844, including16px side safe insets. The current touch view has literal English labels, no translation hook. The existing large-scale Pause/camera overlap is not corrected by this bounded change; Powers itself ends12px before the camera row. Expanded radar and visible cards remain outside this increment's acceptance claim.

Combined immutable public tested tree `27d53fb949a7d369ae8a86235054f5ab2e44aaa1`:85/85 across the same four suites; selected mobile-deck32/32. Three successor cases supplement the original14 layout cases, preserving all pre-existing cases. Module/file read identities were verified against the tested tree. These remain source/geometry/behavior contracts, not browser box measurements. Root review, durable recovery and one CAS successor on PR475 precede the next actual CI frame inspection. No workflow or deadline changes.
