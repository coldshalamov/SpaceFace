# S5 scout: UI / mobile / localization cluster (read-and-run; nothing in the repo touched)

HEAD 0eba990d8a1. 31 files modified vs HEAD. Not landable as-is: 3 tests fail because of the diff,
the generated en-US catalog is stale, and two content defects sit in missions.js and visualOverrides.js.

## Verdict per file
| File | Intent | Verdict |
|---|---|---|
| src/ui/orrery/stationLayouts.js | CSS tweaks (signs hide, next-bead colour, command trigger) | LAND. Live via injectOrreryStation (stationTabsLayouts, station-contractsLayouts, station-factionsLayouts) |
| src/ui/orrery/marketLayouts.js | hover/active tick + tape colours | LAND. Live via injectOrreryMarket (station/screens/market.js) |
| src/ui/orrery/station-shipworksLayouts.js | row hover/press tick | LAND. Live via injectOrreryStationShipworks (station/screens/shipworks.js) |
| src/ui/orrery/hullSchematic.js | circular label 10px -> 12px | LAND |
| styles/station.css | vital ok text colour token | LAND |
| src/ui/dockArrival.js | crew roster tags (vet, morale, strike, demand) | LAND. crewVetRankLabel exists (data/crew.js:33); crew.loyalty is 0/1 (systems/crew.js:182), so `=== 1` is right |
| src/ui/screens/crucibleDraft.js | drops <=1500px verb abbreviation; adds door + refit layout injectors | LAND. Both injector files exist; no leftover railVerbDisplay/railCompact refs |
| src/ui/hud.js | firstElementChild chain -> querySelector | LAND |
| src/ui/travelVectorHud.js | arc is a fresh path, not a cloneNode of line | LAND |
| src/ui/loadingPresenter.js | NaN guard on progress | LAND |
| src/ui/screens/help.js | adds "Restart time trial" (F8) to 3 lists | LAND. BINDINGS.raceRestart exists (ui/bindings.js:59) |
| src/ui/shipLedgerPanel.js | board warning text amber -> dim ink | LAND. Judgment call: warnings read quieter (owner look call, low risk) |
| src/ui/station/screens/ledger.js | loss-only red, settle anim, empty-board copy, keys hide, page-turn resync | LAND. Symbols used (syncTape, keys, readFirst, normalizeStatusPlural) are defined. Ledger tests pass |
| src/main.js | loading stage copy rewritten | LAND with note: "Compiling shaders and render pipelines", "Uploading graphics resources", "Initializing flight physics" are engineer-speak on a player screen. Localization of these lines not checked |
| src/ui/uiRoot.js | cinematic intro: VHL-4471-T / Contract 47-A copy -> "Helios System · Frontier Sector", "Deep Space Flight Systems", "Beacon signal / HELIOS TRANSIT" | INCOMPLETE, owner call. Authored case-file voice is replaced with generic copy. The stranger-readable test was changed to match, so it may be intended. Not a code defect |
| src/systems/mobile/styles.js | ~160 lines CSS: colour-mix tokens, 12px floors, dock/guide/tabs restyle, masks | LAND on CSS. Live: view.js:3 imports MOBILE_CSS; touch.js -> mobile/bridge.js -> view.js. mobile-deck-instrument 15/15 |
| src/systems/mobile/view.js | readout side chosen by collision cost; ghost hides while tether held | FIX (F1). Breaks 8 tests |
| src/systems/mobile/instrument.js | BOOST label 8.5 -> 16.5 units | LAND. 16.5 x 0.74 px/unit = ~12.2px, matches comment |
| src/core/mainToSimEventSurface.js | +'ui:entityDrawer' in unforwarded set | LAND. Emitted at entityLinks.js:321/339/394 |
| src/render/visualOverrides.js | beacon props runaway_kiln / eighth_bell go whole-ship | FIX (F4). These ids are not defined as storyPropKind anywhere under src/, so the branch may never fire. No test run |
| src/systems/missions.js | 47-A "payment withheld" toast and CONCORD ADMIN comms rewritten to "delivered / arrival logged" | FIX (F2). Contradicts the code comment, the flag and the scenario; breaks 2 tests |
| src/localization/pipeline.js | 9 new PHRASES (es/fr/de/pt each); "No save found" reworded | LAND as text. localizedCoreCopy.js:11 uses the new label consistently. Needs catalog regen (F3) |
| src/localization/catalogs/en-US.generated.js | regenerated digest + sources | FIX (F3). Check mode fails: stale |

## Tests (one at a time, node --test)
PASS, changed by the cluster: pq-178-03-ledger 7/7; al-hud-1-stranger-readable-4242 7/7; fb-hit-confirmation-pip 6/6;
vignette-navigation 7/7; fb-spine-back-half 2/2; fb-faction-ranks 4/4; encounter-barks 1/1; inf50-al-hf-10 3/3.

PASS, related: help-flight-verbs 1/1; bomb-remap-help 3/3; al-hf-04-time-trial-restart-4242 8/8; crucible-draft 21/21;
crucible-draft-armory 12/12; dock-arrival-presenter 3/3; inf-berth-rumor-4242 2/2; infer-b-world-teach 19/19;
batch3-rescue-continuity 9/9; event-surface-optional-chain 1/1; ledger-tape-yield 3/3; loading-boot-resilience 3/3;
mobile-deck-instrument 15/15; localization-runtime 8/8; pq-166-02-five-catalogs 6/6; settings-controller-label-truth 1/1.

FAIL (each reproduced on a second run):
- mobile-control-lifecycle: 7 pass / 8 fail. First assertion: TypeError at view.js:225 "doc.querySelectorAll is not a function". The test fake doc (test lines 119-124) has no querySelectorAll.
- story-weakpoints-b0-b2-spine: 4 pass / 1 fail. Line 99 expects a /PAYMENT WITHHELD/ toast; the diff rewrote it.
- w533-books-0-2: fails at line 143 `pit.includes('PAYMENT WITHHELD')`. Probable same cause: the only src source of that text is missions.js:5155-5159, which the diff rewrote. Not separately proven.

## Gates
- check-ui-screen-imports: 56 OK, 0 fail.
- check-ui-glyphs: 35 glyphs OK (DOM + canvas).
- check-wcag-contrast: "AA contrast OK". (The list above that line is informational nebula samples.)
- extract-localization.mjs --check: FAIL "generated en-US catalog is stale; run --write". Writer not run (scout rule).
- check-localization-readiness: ok:false. Cause: extractionCoverage.catalogCurrent:false. All other en-US coverage reads 13514/13514 reviewed.
- check-localization-reachability: crashed. A Playwright click on [data-action="newGame"] timed out at 30s although the button resolved and is visible. Not diagnosed; not known to be caused by this diff.
- Not checked: check-station-glyphs, check:intent-glyphs, any UI screenshot (ui-bench), any lint pass beyond spot reads.

## Concrete defects to fix
F1. src/systems/mobile/view.js:225 calls doc.querySelectorAll(sel). Either guard it (`doc.querySelectorAll?.(sel) || []`) or add querySelectorAll to the fake doc at test/mobile-control-lifecycle.test.mjs:119-124. Production is fine (real document).
F2. src/systems/missions.js:5152-5162. The code comment says "payment withheld / 47-A remains PENDING". The flag at 5151 says withheld, and src/data/scenarios/47a.scenario.json:494 says pending_payment_withheld. The new toast ("delivered") and comms ("ARRIVAL LOGGED") say the opposite. Recommend restoring the canon text. If the owner wants the new wording, the flag, scenario and two tests must change together.
F3. src/localization/catalogs/en-US.generated.js is stale. Run `node scripts/extract-localization.mjs --write`, then `--check` must pass, then readiness. The catalog covers 1685 scanned files, so any other lane's edit makes it stale again: regenerate at landing time.
F4. src/render/visualOverrides.js (isWorldPlaceProp, first new lines) tests entity.data.storyPropKind === 'runaway_kiln' or 'eighth_bell'. Neither id is defined as a storyPropKind under src/ (only audio and music keys match). Confirm the producer or drop the branch.
F5. (owner) src/ui/uiRoot.js cinematic copy: confirm the generic intro is wanted.

## Other checks
- Debug leftovers in added lines (console/debugger/TODO/FIXME/XXX): none.
- Added font declarations below 12px in src and styles: none.
- Hard-coded English outside localization: ledger.js:395 "Nothing pinned yet — evidence rides in with the first receipts." ledger.js has zero t() calls, so the screen is already English-only; not a new bypass. main.js loading lines: not checked.
- Layout modules (stationLayouts, marketLayouts, station-shipworksLayouts) are not imported by path; they are injected via the inject* functions above. Live, not dead.
- index.html is unchanged. The catalog's source line numbers (index.html:2701) already match the current index.html.
