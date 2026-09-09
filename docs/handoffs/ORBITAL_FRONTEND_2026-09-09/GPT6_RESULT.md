# GPT6_RESULT — SpaceFace / Orbital frontend

## Delivery and provenance

**Delivered:** a repository-relative production source overlay with integrated assets, native-module
browser fixtures, reproducible checks, development captures and final evidence. **Not claimed:** a
completed whole-game frontend, successful live-game boot, full integration approval, PR, merge or push.

- Exact source snapshot: `bee6bbe19e822cb9f04bdf73af911ddf95f63038`.
- Starting point: the uploaded `SpaceFace-frontend-upload-20260909-v2.zip`, not a clone or remote checkout.
- Input ZIP SHA-256: `7187409e5b39a9fe4670ea35cf224d845427b9eaf01b62d055334b1e23c13c72`.
- Product candidate digest: `293a6a0b06e0f3244451287f390be3df3b48623e88c9dc605f753fa947da2e58` (definition recorded in `browser-final.json`).
- No repository connector, remote retrieval, npm install, dependency substitution or external asset download was used.
- This is an **overlay**, not a standalone game archive. Existing unchanged code and vendored fonts remain in the base.
- 35 product files are included, counting the unchanged scout image explicitly reused by the new title.
  The complete payload, hashes and before/after status are enumerated in `RESULT_MANIFEST.json`.

## What the product work accomplishes

**Identity and entry.** Orbital replaces the old command-deck observer-driven skin with explicit production
composition: a coal/metal operator's atlas, amber primary actions, mint safe-state ink and terracotta danger.
The authored orbital mark and transfer plate are integrated into real menu/station surfaces. The supplied
scout image anchors the title; menu actions remain native controls. Pause becomes a held-flight drawer with
a clear objective/save brief and a dominant Resume action. Boot copy and shared controls use the same identity.

**Station and trading.** The station separates identity, hull/fuel/cargo services, a keyboard-operable facility
rail, the active operation and communications/Undock. Market keeps its real commodity/filter/selection and
transaction owners, while rendering an explicit quote, history and receipt. The current mode has exactly one
commit target; the other control changes mode. The 720p receipt/action layout and the mobile scrolled commit
were rendered and repaired. Missing history is unavailable rather than a fabricated zero/flat signal.

**Shipworks and contracts.** Fleet selection, the spatial stage and operation controls have explicit,
non-overlapping regions. Original fitting/render/acquisition handlers remain after the frame. No substitute
3D preview was invented for the omitted renderer. Contracts have a structured route/reward/readiness dossier,
non-overlapping terms and an explicit accept/readiness boundary. Existing irreversible disposition review is
preserved. Bar, Industry and Factions receive shared frame/theme integration; their deeper facility-content
redesign and runtime verification are not represented as finished.

**Chart, progression and loss.** The native chart keeps its full-frame canvas coordinate system but gains
bounded opaque instruments. Plot and Engage remain separate guarded controls. A real pre-existing label crash
was reproduced and fixed: tacticalMapGrammar called canvasFont without importing it. Research now has filled
engineering-register nodes plus a native keyboard/screen-reader node selector, while its actual controller
retains prerequisites, resource checks and unlock-intent ownership. After-action layout is integrated through
the shared theme, and the actual controller's recovery-request, failure, Load and Ironman gates were exercised.

**System screens and flight.** The real settings controls retain input-preview/change-commit semantics and
idempotent toggles. Save dossiers expose their actions at 720p, but the storage controller was not mounted.
Flight uses canonical active-hull silhouettes, contained numeric gauges, explicit danger ink and throttled
accessible hull/shield labels. Native target markup and power-rail code remain separate from simulation.
The flight captures are disclosed instrument fixtures over an empty world, not gameplay screenshots.

**Interaction and performance discipline.** No new simulation owner, document-wide MutationObserver, per-frame
query sweep or independent gameplay animation loop was added. The old command-deck observer is no longer
loaded by index.html. New menu art is static and reuses an existing image. Settings range changes do not write
on initial paint. The station's new responsive orientation listener is disposed. CSS includes keyboard focus,
reduced-motion, reduced-flash, high-contrast/forced-color and narrow-screen treatment. These are implementation
facts, not a measured GPU/FPS improvement claim. Forced-colors and every live overlay combination were not
independently accepted in the full game.

## Actual checks and results

| Check | Actual result | Evidence |
|---|---|---|
| New focused Node checks | **31 passed, 0 failed** | `artifacts/frontend-orbital/orbital-unit-tests.log` |
| Changed/new JavaScript syntax | **33 of 33 passed** using node --check | `artifacts/frontend-orbital/syntax-checks.json` |
| Real native map label regression | Reproduced failure before import repair; **3 passed after repair** | `map-label-regression-before.log`, `map-label-regression-after.log` |
| Native-module browser matrix | **45 of 45** ready/nonblank/error/image/document-overflow checks passed | `browser-final.json`, `browser-final.log` |
| Scoped browser interactions | **10 of 10 passed**; scopes recorded per test | `browser-final.json` |
| Supplied aggregate test suite | **92 tests: 53 passed, 39 failed** after adding 31 tests. Input run: **61 tests: 22 passed, 39 failed**. Failing test names are identical. | `existing-tests.log`, `existing-tests-final.log`, `supplied-test-comparison.json` |
| Controller-source preservation | Market event tail; Shipworks post-frame logic; Contracts post-frame logic; Bar post-frame logic; exported settings screen are byte-identical to input | `source-preservation.json` |
| Normal game server | **Failed**: uploaded server requires omitted scripts/lib/gameServer.cjs | `server-attempt.log` |
| Normal HTTP browser navigation | **Blocked by administrator policy**; policy unchanged | `http-navigation-attempt.json` |

The 10 browser flows verify native settings preview/commit and idempotence; real station dock arrows/Home/End,
roving tabs, orientation and listener cleanup; actual research controller selection/locked reasons/unlock intent
without state mutation; actual after-action recovery intent versus success and Load navigation; Ironman recovery
gate; real market presentation's single commit/mode switch/empty search; mobile commit reachability; disabled
unavailable quote; contained flight values with textual/accessible danger; reduced motion and visible focus.
The Market interaction harness is **not** the economic controller. Research and after-action bus capture is
**not** proof that the simulation applied an unlock or respawn.

The remaining aggregate failures were not hidden or relaxed. Most are imports into paths omitted by the curated
upload. One retained radar source-regex assertion expects literal font-size strings while the unchanged radar
uses canvasFont; `src/ui/radar.js` is byte-identical to the input. No supplied test or golden was edited.

## Actual screenshots inspected

The final matrix covers **11 surfaces at 1280×720, 1920×1080 and 2560×1080**: title, pause, settings, saves,
Market/station, Shipworks, Contracts, navigation, Research, flight instruments and after-action. Additional 720p
captures cover empty title/save slots, unavailable quote, blocked contract, locked research, danger instruments,
Ironman, and reduced-motion title/Access. Three 390×844 captures cover title, settings and Market. This totals 45.

Final contact sheets: `artifacts/frontend-orbital/review-1280.jpg`, `review-1920.jpg`, `review-2560.jpg`.
Native-size PNGs and interaction captures are in that same directory. Full-size critical frames were inspected
during development; the three complete desktop sets were also reviewed as contact sheets. Mobile initial and
scrolled-commit screenshots were inspected. `QA.md` identifies the inspection scope per surface and records the
actual before/after mismatch ledger. It does not claim every image was read at full-size or that fixture samples
cover every runtime state.

## Known limits and uncovered work

**Full-game boot and integration remain unverified.** The curated upload intentionally does not include the
complete executable dependency graph. This return does not fabricate those dependencies or call a presentation
fixture a running game. Shipworks spatial attachments/hardpoints, active hull swaps, live targeting/radar,
weapons/tools, live Market transactions, manufacturing, reputation, save/load/delete/corrupt-save recovery,
route execution and live frame pacing require the actual full checkout.

**Whole-frontend completion is not claimed.** Missions/automation, the standalone Ship screen, Crucible,
mining/special modes, photo/help/archive/new-game flows and every rare overlay were not individually rebuilt
and visually accepted. Shared tokens, controls, material surfaces and relevant CSS now reach those surfaces,
but a shared style pass is not a substitute for screen-specific implementation/QA. Bar/Industry/Factions/Ledger
are specifically not certified as complete content rebuilds. This is the largest coherent implementation
returned here, with its stronger core surfaces and its remaining scope explicitly separated.

Observed missing server path: `scripts/lib/gameServer.cjs`.
Missing dependencies actually reported by the supplied test run:

- `scripts/check-type-floor.mjs`
- `scripts/lib/shipworksDockComposition.mjs`
- `scripts/lib/uiBudgets.mjs`
- `src/core/deepSpaceAddress.js`
- `src/core/devMode.js`
- `src/core/flight/propulsionKernel.js`
- `src/core/physicsAuthority.js`
- `src/core/presentationRunner.js`
- `src/core/rng.js`
- `src/core/simulationRunner.js`
- `src/core/spatialQuery.js`
- `src/core/timeEffects.js`
- `src/render/camera.js`
- `src/runtime/authoritativeSystemManifest.js`
- `src/save/checksum.js`
- `src/save/saveWorker.js`
- `src/systems/contractClauses.js`
- `src/systems/dockingCorridor.js`
- `src/systems/drawFlightInput.js`
- `src/systems/economyCycles.js`
- `src/systems/gamepad.js`
- `src/systems/masslineInputGrammar.js`
- `src/systems/regionalEcology.js`
- `src/systems/stationContacts.js`
- `src/testing/lab/saveLoadCompare.js`
- `three`

Other source paths found absent while tracing runtime imports included renderer/vendor dependencies and core
world/state/input owners. Those were not filled with stand-ins. The old unused menu background
`assets/cinematics/menu_hangar_bg.jpg` is absent; the new title uses the included scout and authored orbital
plate. Browser evidence uses the existing bundled fonts; no new font binaries are delivered.

## Exact next action

Apply this ZIP's repository-relative files over the complete checkout corresponding to the base SHA above,
without replacing that checkout with this smaller archive. Keep the original vendored fonts and dependency
installation. Launch the real game with its existing server/dependencies and verify this exact candidate in
live title → flight → target/danger → dock → Market transaction → Shipworks fitting → map Plot/Engage →
save/reload flows at 1280×720, 1920×1080 and ultrawide. Then complete and accept the explicitly uncovered
special/progression/facility screens in the same design language. No preparation branch or PR was created by
this session; the return is ready for the local workflow to apply, not evidence of a remote merge.

To reproduce the checks available from the scoped bundle:

```sh
node --test test/orbital-presentation.test.mjs test/orbital-map-labels.test.mjs
python test/frontend_orbital_browser.py --browser /path/to/existing/chromium
```

The Python path requires an already installed Playwright and Chromium; it installs nothing. The browser
fixture still reads the base files from the checkout. A report produced by that command is scoped exactly as
described above, even when all its checks pass.

## Product changed-file list

- `assets/ui/hud/ship-condition-scout.png` — **reused unchanged asset**. Unmodified asset from the upload, now integrated as title key art; not used as an active-hull or 3D-fitting substitute.
- `assets/ui/orbital/brand.svg` — **new**. New authored orbital direction mark, integrated into favicon, title and station.
- `assets/ui/orbital/orbit-plate.svg` — **new**. New authored orbital-diagram title plate, integrated in the real menu.
- `index.html` — **modified**. Loads the production Orbital stylesheet and brand favicon; removes the old command-deck CSS/observer script from the entry point; updates boot identity without changing bootstrap ownership.
- `src/ui/galaxyMap.js` — **modified**. Imports native frame/CSS helpers; retains world projection, hit testing, navigation and route policy.
- `src/ui/hud.js` — **modified**. Imports native hull/gauge presentation and adds throttled accessible hull/shield labels at the existing slow-update cadence.
- `src/ui/map/tacticalMapGrammar.js` — **modified**. New coherent chart ink and a reproduced missing canvasFont import repair; existing tactical geometry preserved.
- `src/ui/screens/mainMenu.js` — **modified**. Uses authored title frame and real bundled assets; original save lookup, navigation, focus and action ownership retained.
- `src/ui/screens/pause.js` — **modified**. Uses new held-flight drawer presentation; existing menu actions and held-state behavior retained.
- `src/ui/screens/saveLoad.js` — **modified**. Uses the native save frame; original slots, confirmations, persistence and shared 3D stage remain in the controller.
- `src/ui/screens/settings.js` — **modified**. Imports the native control builder and reexports bindCommittedRange; exported screen implementation is byte-identical to the input.
- `src/ui/screens/techTree.js` — **modified**. Engineering-register canvas treatment and native accessible node selector; existing real layout/readiness/unlock intent logic retained. Removes a utility-only dependency on the unrelated comms simulation graph.
- `src/ui/station/dock.js` — **modified**. Facility iconography, escaped labels and responsive ARIA orientation; native roving tabs/Home/End/arrow behavior retained, new media listener disposed.
- `src/ui/station/screens/bar.js` — **modified**. Uses the real shared Bar frame; existing contact behavior retained. Shared theme integration, not a complete contact-content redesign.
- `src/ui/station/screens/contracts.js` — **modified**. Mounts native frame and dossier view; policy and event-handling tail byte-identical to input.
- `src/ui/station/screens/factions.js` — **modified**. Uses the real shared Factions frame. Shared theme integration, not validated reputation execution.
- `src/ui/station/screens/industry.js` — **modified**. Uses the real shared Industry frame. Shared theme integration, not validated manufacturing execution.
- `src/ui/station/screens/market.js` — **modified**. Passes existing economic read models into the production view helpers; event-handling tail byte-identical to input.
- `src/ui/station/screens/shipworks.js` — **modified**. Mounts native Shipworks frame; selection, renderer, fitting, acquisition and action logic after frame creation byte-identical to input.
- `src/ui/station/stationApp.js` — **modified**. Mounts the production station frame; existing service, panel, communications, launch and confirmation owners retained.
- `src/ui/targetPanel.js` — **modified**. Imports native target frame; targeting policy and update ownership remain in the controller.
- `src/ui/uiRoot.js` — **modified**. Imports existing HUD style injection rather than owning its 1,300-line literal; no duplicate frame or simulation owner.
- `src/ui/views/contractPresentation.js` — **new**. Production contract dossier and readiness/commit markup, preserving native trusted entity fragments and irreversible-action review copy.
- `src/ui/views/flightInstruments.js` — **new**. Canonical active-hull schematic and native gauge markup; no duplicate flight state or new frame loop.
- `src/ui/views/hudStyles.js` — **new**. Existing dynamically injected HUD stylesheet extracted from uiRoot, allowing genuine instrument rendering without importing unavailable simulation modules.
- `src/ui/views/identity.js` — **new**. Escaping and a consistent authored SVG icon vocabulary for actual facility/commodity controls.
- `src/ui/views/marketPresentation.js` — **new**. Production commodity register, quote chart, terms and transaction markup; single commit target, explicit missing history, escaped names and numeric read models.
- `src/ui/views/menuFrames.js` — **new**. Shared production title/pause DOM; real menu controllers import these constructors.
- `src/ui/views/navigationFrame.js` — **new**. Native chart chrome extracted intact, including separately guarded Plot and Engage controls.
- `src/ui/views/navigationStyles.js` — **new**. Existing native chart CSS extracted from galaxyMap; Orbital composition remains in the common stylesheet.
- `src/ui/views/saveFrame.js` — **new**. Native save dossier/portrait/action DOM shared by the actual save screen and isolated fixture; persistence and hull renderer remain in saveLoad.
- `src/ui/views/settingsControls.js` — **new**. Native settings controls moved without changing preview/commit or callback ownership; shared by production and browser QA.
- `src/ui/views/stationFrames.js` — **new**. Production station/facility DOM factories preserving IDs and native hooks; facility rail separated from comms/Undock.
- `src/ui/views/targetFrame.js` — **new**. Native target markup extracted intact; selected contact and engaged target remain distinct.
- `styles/orbital.css` — **new**. Complete shared visual language, explicit title/pause/station/market/shipworks/contracts/chart/research/save/after-action compositions, instrument materials, responsive rules, keyboard focus, disabled/danger/reduced-motion/contrast states.

## New QA/reproduction files

- `test/orbital-map-labels.test.mjs` — Focused regression for real canvasFont label rendering and chart ink contrast.
- `test/orbital-presentation.test.mjs` — Native view hooks, escaping, chart edge cases, transaction identity, contract guards, settings commit semantics, research readiness and runtime wiring tests.
- `test/fixtures/orbital-interface.html` — Explicitly disclosed presentation fixture shell; not loaded by the game.
- `test/fixtures/orbital-interface.js` — Runs actual controllers where the upload permits (Research and after-action), otherwise exact production view modules against disclosed synthetic read models.
- `test/frontend_orbital_transport.py` — Portable in-memory native ESM/CSS transport reading this checkout; no mock simulation modules, remote downloads or browser-policy changes.
- `test/frontend_orbital_browser.py` — Reproducible Chromium capture/interaction matrix; correctly distinguishes native controller proof from fixture-only behavior.

## Evidence inventory

All files below are genuine session output, not supplied references relabelled as new captures. Earlier failures are retained as development evidence; `browser-final.json` is the final browser verdict.

- `artifacts/frontend-orbital/QA.md`
- `artifacts/frontend-orbital/browser-final.json`
- `artifacts/frontend-orbital/browser-final.log`
- `artifacts/frontend-orbital/browser-first-matrix.json`
- `artifacts/frontend-orbital/browser-interactions-intermediate.json`
- `artifacts/frontend-orbital/browser-interactions-intermediate.log`
- `artifacts/frontend-orbital/existing-tests-final.log`
- `artifacts/frontend-orbital/existing-tests.log`
- `artifacts/frontend-orbital/final-contracts-1280x720.png`
- `artifacts/frontend-orbital/final-contracts-1920x1080.png`
- `artifacts/frontend-orbital/final-contracts-2560x1080.png`
- `artifacts/frontend-orbital/final-contracts-blocked-1280x720.png`
- `artifacts/frontend-orbital/final-flight-1280x720.png`
- `artifacts/frontend-orbital/final-flight-1920x1080.png`
- `artifacts/frontend-orbital/final-flight-2560x1080.png`
- `artifacts/frontend-orbital/final-flight-danger-1280x720.png`
- `artifacts/frontend-orbital/final-gameover-1280x720.png`
- `artifacts/frontend-orbital/final-gameover-1920x1080.png`
- `artifacts/frontend-orbital/final-gameover-2560x1080.png`
- `artifacts/frontend-orbital/final-gameover-ironman-1280x720.png`
- `artifacts/frontend-orbital/final-market-1280x720.png`
- `artifacts/frontend-orbital/final-market-1920x1080.png`
- `artifacts/frontend-orbital/final-market-2560x1080.png`
- `artifacts/frontend-orbital/final-market-390x844.png`
- `artifacts/frontend-orbital/final-market-unavailable-1280x720.png`
- `artifacts/frontend-orbital/final-navigation-1280x720.png`
- `artifacts/frontend-orbital/final-navigation-1920x1080.png`
- `artifacts/frontend-orbital/final-navigation-2560x1080.png`
- `artifacts/frontend-orbital/final-pause-1280x720.png`
- `artifacts/frontend-orbital/final-pause-1920x1080.png`
- `artifacts/frontend-orbital/final-pause-2560x1080.png`
- `artifacts/frontend-orbital/final-research-1280x720.png`
- `artifacts/frontend-orbital/final-research-1920x1080.png`
- `artifacts/frontend-orbital/final-research-2560x1080.png`
- `artifacts/frontend-orbital/final-research-locked-1280x720.png`
- `artifacts/frontend-orbital/final-saves-1280x720.png`
- `artifacts/frontend-orbital/final-saves-1920x1080.png`
- `artifacts/frontend-orbital/final-saves-2560x1080.png`
- `artifacts/frontend-orbital/final-saves-empty-1280x720.png`
- `artifacts/frontend-orbital/final-settings-1280x720.png`
- `artifacts/frontend-orbital/final-settings-1920x1080.png`
- `artifacts/frontend-orbital/final-settings-2560x1080.png`
- `artifacts/frontend-orbital/final-settings-390x844.png`
- `artifacts/frontend-orbital/final-settings-access-reduced-1280x720.png`
- `artifacts/frontend-orbital/final-shipworks-1280x720.png`
- `artifacts/frontend-orbital/final-shipworks-1920x1080.png`
- `artifacts/frontend-orbital/final-shipworks-2560x1080.png`
- `artifacts/frontend-orbital/final-title-1280x720.png`
- `artifacts/frontend-orbital/final-title-1920x1080.png`
- `artifacts/frontend-orbital/final-title-2560x1080.png`
- `artifacts/frontend-orbital/final-title-390x844.png`
- `artifacts/frontend-orbital/final-title-empty-1280x720.png`
- `artifacts/frontend-orbital/final-title-reduced-1280x720.png`
- `artifacts/frontend-orbital/http-navigation-attempt.json`
- `artifacts/frontend-orbital/interaction-market-mobile-commit-390.png`
- `artifacts/frontend-orbital/interaction-research-selection-1280.png`
- `artifacts/frontend-orbital/interaction-settings-access-1280.png`
- `artifacts/frontend-orbital/map-label-regression-after.log`
- `artifacts/frontend-orbital/map-label-regression-before.log`
- `artifacts/frontend-orbital/offline-transport.json`
- `artifacts/frontend-orbital/orbital-unit-tests.log`
- `artifacts/frontend-orbital/pass1-browser.json`
- `artifacts/frontend-orbital/pass1-contracts-1280.png`
- `artifacts/frontend-orbital/pass1-gameover-1280.png`
- `artifacts/frontend-orbital/pass1-market-1280.png`
- `artifacts/frontend-orbital/pass1-pause-1280.png`
- `artifacts/frontend-orbital/pass1-settings-1280.png`
- `artifacts/frontend-orbital/pass1-shipworks-1280.png`
- `artifacts/frontend-orbital/pass1-title-1280.png`
- `artifacts/frontend-orbital/pass2-market-1280.png`
- `artifacts/frontend-orbital/pass2-shipworks-1280.png`
- `artifacts/frontend-orbital/pass3-browser.json`
- `artifacts/frontend-orbital/pass3-contracts-1280.png`
- `artifacts/frontend-orbital/pass3-flight-1280.png`
- `artifacts/frontend-orbital/pass3-gameover-1280.png`
- `artifacts/frontend-orbital/pass3-navigation-1280.png`
- `artifacts/frontend-orbital/pass3-research-1280.png`
- `artifacts/frontend-orbital/pass3-saves-1280.png`
- `artifacts/frontend-orbital/pass4-browser.json`
- `artifacts/frontend-orbital/pass4-contracts-1280.png`
- `artifacts/frontend-orbital/pass4-flight-1280.png`
- `artifacts/frontend-orbital/pass4-navigation-1280.png`
- `artifacts/frontend-orbital/pass4-research-1280.png`
- `artifacts/frontend-orbital/pass4-saves-1280.png`
- `artifacts/frontend-orbital/pass4-shipworks-1280.png`
- `artifacts/frontend-orbital/review-1280.jpg`
- `artifacts/frontend-orbital/review-1920.jpg`
- `artifacts/frontend-orbital/review-2560.jpg`
- `artifacts/frontend-orbital/server-attempt.log`
- `artifacts/frontend-orbital/source-preservation.json`
- `artifacts/frontend-orbital/supplied-test-comparison.json`
- `artifacts/frontend-orbital/syntax-checks.json`

`RESULT_MANIFEST.json` lists every delivered file with SHA-256, original SHA-256 when present, size and change status. It excludes its own hash to avoid a self-referential checksum.
