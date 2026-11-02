# Whole-game integration status

Updated 2026-11-02. This is the compact current outcome map for the Finish Program, not a game-complete claim. The lane boards own active work and acceptance criteria: [Lane 1](./LANE_1_MACHINE_AND_PICTURE.md), [Lane 2](./LANE_2_FIGHT_AND_SIM.md), and [Lane 3](./LANE_3_WORLD_GLASS_HOUSE.md). The [dated archive](../../archive/finish-integration/INTEGRATION_COVERAGE_2026-10-31.md) preserves the previous detailed receipts and failure history. Source coverage U001–U072 is recorded in [the coverage ledger](./SOURCE_COVERAGE_2026-10-29.md).

The controller owns all remaining working-tree changes, plans and open PRs under the user's
2026-11-01 direction. [PR integration](./PR_INTEGRATION.md) records current source reconciliation;
expired agent claims do not block finishing. The owner's latest unattended-session direction permits
closing Chrome and VLC and stopping competing tasks for profiling; the earlier keep-open request
is superseded.

## Product finishing checklist

This groups the existing work by player experience. It adds no review quotas or new shipment gates;
the lane boards and linked specifications still own the actual outcomes. Completed source reads
are reused, while current behavior, weak presentation and contradictory historical intent are
judged against the player's ordinary route.

- [x] Inventory source owners, identify orphaned systems, and reconcile the open PR backlog against
  current code. This is coverage and routing, not acceptance of every implementation.
- [ ] Complete the ordinary mode journeys: Adventure's working/mining/trading/upgrade loop,
  Foundry's first ten waves and boss, later Swarm specialists and Kraken, and the remaining
  physics/ability routes. Preserve canonical damage, physics and progression ownership.
- [ ] Finish connected world outcomes: Ceres toolkit and Asteroid Works, physical paid recovery
  and receiving, Compost's earned first growth, Last Shift and optional Tethys stealth, and
  visible traffic yield/resume. Rewards, custody, return feedback and persistence must agree.
- [ ] Make screens and controls work through normal, empty, disabled, error and recovery states,
  at supported sizes and inputs. Keep text, authored hulls, targets and combat tells readable;
  preserve accessible input, reduced motion and flash behavior.
- [ ] Inspect authored assets, units, VFX and audio in their real contexts; complete the remaining
  visible model/marking/hero and sound outcomes without substituting isolated asset previews for
  in-game placement or usable feedback.
- [ ] Meet the existing loading, crowded-simulation and frame targets; close actual GPU-resource
  errors and long-session retention. Functional recovery alone does not pass these targets.
- [ ] Check the final coherent build's save/Continue, defeat/recovery, Settings changes, packaging,
  browser/Electron and supported mobile paths at their relevant layer.
- [ ] Finish the final build-map leftovers, requested last-300-commit review, remaining PR outcomes
  and documentation cleanup. The five additional Pro jobs remain blocked on the intended provider.

The source baseline after the localization loader change passes17/17 checks in60,133ms within the
unchanged90,000ms budget. Earlier focused worker transport/HUD checks pass24/24. All417 render-package
plans were validated by the web build from `aba26d770eab`. Its2866 files total629,883,908 bytes;
the local receipt SHA256 is `6f4e2a15e4414fd8b16ad83bf859151999af6bf0baded3ddefc20cf2a97609e8`.
The matching Windows ASAR passes the actual default New Game/flight/worker startup smoke and cleanup.
This closes packaged startup for that bundle, not Settings return, retention or final performance.
Subsequent authority HUD, drill-demand, NPC and renderer repairs still need their changed bundle.
Both earlier47-A failures were caused by the deliberate measured-hull inertia change: restoring
only the former formula reproduced both prior hashes exactly. The envelopes retain those hashes
and trajectory differences. Legacy reload@600 and V3 reload@60/600 each pass five repeats;
original seed, input, tick, event-family and acceptance budgets remain enforced.

The public8f5 route passes compact F2 at1280/960, physical Helios docking,568x320 Market controls
and the real Industry research-lock state, with no JS/GL/critical HTTP errors or resize failure.
The public Vercel alias now serves7195 with the activated shared-asset packages. Fresh native touch
flight and same-profile save/reload/Continue movement pass, with zero JS, GL or critical HTTP errors.
This candidate began Continue near rest, so its braking branch was not exercised. Actual iPhone14
hardware remains unverified; the visible Windows phone entries establish Bluetooth pairing,
not a USB/debug channel.

The last measured main static closure is9,959,415 raw bytes /144 JS outputs; the6MB target remains
open. The shadow-disabled cold profile reaches flight in37.7s versus37.3s in the preceding run:
there is no demonstrated wall-time improvement. Corrected shadow staging preserves the existing
`forceEnable` contract. The actual late-Settings enable route passes after fixing pointer-focus
scrolling that moved On62pixels before release: its guarded queue drains, simulation resumes,
and the enabled authored ship/world image is visible.

## Current outcome map

The fresh-pin Pelican22 route confirms that the new worker preview names the correct buoy and
native Space latches that same identity. It then records an owned `line_overclass_snap`: the
first contract's40t buoy exceeded a fresh Class I Line's20t limit. The introductory chain is now
calibrated to18/19/20t; global overload rules, positions, drift and520/760/960CR rewards remain
unchanged. Four native checks cover sustained attachment and old40/65/90t accepted saves restoring
the same bodies at the corrected masses. The narrowly identified persistent-entity restore path
also applies that calibration without losing pose, health, credits or mission progress. Public
tow delivery/payment now pass in Pelican25 on source569ceb918d10: the original line holds through
physical tow-in, the canonical mission completes and pays520CR, and after undock the same mission's
receiving event appears. The run has zero browser errors/warnings and complete cleanup. This closes
the first44-C job; later jobs retain native/save coverage only. Pelican23 stopped before acceptance because its actor read
the public reward counter during its roll from zero; it now waits for agreement with the posted
row within the existing bound. Pelican24 exposed a separate null-equality error in the actor's
selected-ID check; requiring the accepted ID corrected it before Pelican25. Neither observer error
is presented as a product regression.

Discovery notifications now use actual mobile instrument boxes and full-height free lanes rather
than obsolete desktop reservations. The native portrait view clears flight controls and fits the
wrapped discovery text. Shared cached HUD obstacles also seat Massline words and stunt callouts
without moving the world marker. A later mobile run exposed receipt CSS overriding measured inline
positions; `fa8e1bef2cce` removes that override from the second mobile sidecar, with40 focused checks
passing. The next ordinary mobile run on `91a0ae2ae973` clears the measured Massline/receipt collisions
in both orientations and moves14.286WU under native touch; the images were opened. Discovery and
stunt captions were absent in those samples, so their current visible interaction is unknown.
The earlier overlapping images remain retained. The authored player hull is difficult to judge in
the dark mobile world images and needs a visibility check. Twelve GL program-query warnings from
an earlier run have not reproduced in subsequent routes, but their cause remains unknown. The existing bounded query
trap remains armed in required route work; zero error-level logs do not dismiss those warnings.
The production cabinet attract recording was regenerated for the deliberately changed physics
with its original seed, quantization and frame bounds; all eleven cabinet checks pass. The absent
Hitch V7 candidate-only evidence test was retired; current retail asset validation is retained.

| Area | Current outcome | Open work / boundary |
|---|---|---|
| Ordinary gameplay routes | Racing, Gauntlet, Pinball, Swarm round-three functionality, and the Adventure Ceres delivery/save/Continue route have scoped passes. | These do not establish full-game completion, broad performance, or all public-story routes. Foundry first-ten/boss and Last Shift story routes remain open. |
| Veil Step starter | The headed ordinary starter route passes 8/8 checks: public pointer aim and Shift hold/release produce 234.3 WU of actual displacement, spend capacitor energy (200.0 to 128.9), and return the visible cue to ready after 1.30 simulation seconds. Authored player/world readiness and uncaught-error checks pass; cleanup completes. | The first failed actor log is preserved: it read an absent worker-mirror budget field and required exact post-event pose equality. The corrected route stops before the legacy smoke script's forced damage. This closes Veil use/cooldown only, not ten-wave progression or a performance target. |
| Ceres and RC458 | Native Ceres ambush/lifecycle and selective RC458 checks pass. `dbda6842048f` fixes the physical station stall;47 focused cases pass and public berthing takes33.53 simulation seconds. The later public route reaches Working Seam and Throughline after the egress and sampled-input transport repairs. | The anchor subsequently disappeared without an observed exact impact; proximity is not a pass. The actor now waits at most six neutral ticks for a delayed exact-identity impact, within its original deadline, and retains the bounded destruction/impact trace. Five focused cases pass; the revised public route and PQ024 H1 remain open. Physical envelopes and route budgets are unchanged. |
| Tethys stealth offer | Returning after casing now refreshes the standing capsule offer's case file and quiet approach from canonical observations. The focused regression preserves identity/terms, publishes one update, remains idempotent, and leaves accepted contracts unchanged. | Natural public Tethys stealth-route acceptance remains unverified. The existing compressed PQ-019 probe is a fixture route. |
| Kraken | Candidate native combat, authored-art, and worker-cue checks pass. | Public Swarm wave-seven-plus progression, targeting/portrait, boss progression, and performance remain unrun or unverified. |
| Swarm specialists | `a6b5c8f76d91` integrates Warden finite guard links, Jackal mine salvos and Anchor displacement/recovery through existing damage, AI, mines and field owners, with counter briefs and authored assets. Focused behavior and worker/render transport checks pass. `0f502b00dc3f` also makes Greedy Tractor synthesis use obtainable Swarm stock. | Ordinary later-wave progression, readable tells and authored ship appearance remain open. Native checks and asset hashes do not establish these visual or player-route outcomes. |
| M8 recovery and stability | Fixed-save reload/economy routes preserve the quickslot. The latest warning diagnostic exposed compressed-texture clones with detached CPU mipmaps during restoration. `d1a656a34ac9` refills the actual upload subjects and holds their leases across restoration. The subsequent native context-loss run retains the authored mesh, advances pixels/frames and completes a120-second active tail without the upload exception; cleanup passes. | This recovery pass is not the final30-minute or retention qualification. The preceding diagnostic still failed frames (overall p95 83.355ms/p99 149.965ms). Typed empty retired-pool cancellation now has an explicit classification; actual occurrence on the new classifier remains unverified. Live/unknown owner failures retain warnings. No final soak acceptance is claimed. |
| Renderer / recovery | Startup, shadow, preview, count-zero instance and census/proxy identity repairs are integrated. `532621b8f848` holds package geometry across the live exact-target async suffix; the real detach interleaving case and related owner suites pass73/73. The armed1ad public F2/Helios route recorded no resize failure. | This scoped route does not establish every transition or long-session resource safety. A startup-upload resize in c65 lacks per-object identity and requires the existing armed diagnostic if reproduced. Final packaged acceptance remains pending. |
| M10 shader ownership | GL issue and render-state restoration remain serialized; capable backends can settle four independent actual-program readiness sets outside that reservation. Timeout receipts retain ownership of unfinished work. Focused owner, cancellation, delayed-stamp and fallback checks pass. | No matched live speedup has been established. This repair and the loading-queue handoff do not establish loading or runtime performance acceptance. |
| M5 rigid batching | A current held-scene ABBA preserves exact source, settings, camera/projection and entity poses; real world submissions advance. Both compositor captures are nonblank and inspected. Five cohort roots produce46 instances in five batches; median draw calls122→119. Defaults restore and cleanup passes. | Median intervals remain16.67ms in every arm; no timing improvement is established in this starter scene. Host CPU busy varies27.5–41.9%. The older blank-image742/982draw result is not accepted. This does not establish active crowded-flight performance. |
| Runtime performance | B27's existing retail witness records **22.933 Hz / 0.9182 sim/wall** in the first tail. A separate launch after cleanup of a stalled fleet-capture job records 3,686 world draws over 120,027.765 ms: **30.7096 Hz / 0.99963 sim/wall**. Both tails follow actual public world/input recovery and finish with cleanup. A measured texture-serialization path now uses the canonical safe clone helper; 47 focused checks pass. | These launches are not a matched causal A/B. Retail averages do not establish scanout, frame percentiles or a 60 fps pass. The equal executed-frame/world-draw deltas in the later tail show no net active-loop cap skips; its effective cap/display calibration is unrecorded. Transmission's mismatched first-picture experiment is inconclusive; scale remains 1.0. The clone's live benefit and frame targets remain open. The earlier wave15 fixture averaged157.2entities and27.257ms per sim step (p95 39.208ms), so the simulation targets also remain open. |
| Fleet asset capture | The original 170 images are preserved. Cradle and all remaining 26 entries have visible native captures, with first blank/inconsistent frames retained. Last Argument and Storm Orchard positive captures recorded target GL draws. The preview rejects zero-draw output and now distinguishes published, prepared and failed authored states. | A later Kestrel house-marking preview exhausted its retries with zero draws; no image was accepted. Decal readability and combined HeroRig/plume appearance remain open. Isolated previews do not establish ordinary in-world placement or complete visual parity. |
| M9 loading | The ABA bundle validates417 render packages and measures9,959,415 raw main-static bytes across144 JS outputs. Retail English cold/reload requests no optional localization sidecars; selecting Spanish fetches the two inventories, and trusted es→en Settings controls relabel correctly. `3965cdfc54c8` also makes the drill screen demand-only and removes its preload, with21 focused lifecycle checks. | The6MB, loading and runtime targets remain open. Drill ordinary approach and request deferral need the changed-bundle route. ABA ASAR default startup passes; no full package/soak acceptance follows from that smoke. |
| Baseline | The localization integration baseline passes17/17 in60,133ms within90,000ms. Measured-hull legacy reload@600 and V3 reload@60/600 also pass five repeats each. | Changed physical trajectories alter legacy hit/cue counts and are documented. Original acceptance budgets remain enforced. This timing is not an isolated speedup measurement. |
| Responsive UI | The public8f5 route passes1280/960 F2 fitted-hull callouts, physical Helios docking,568x320 Market quantity and empty-Sell→Buy controls, and the actual Industry research lock. Errors and armed resize failure are empty. | These public F2 images use the authored plate. Existing backend policy may block the secondary WebGL context; the actor now distinguishes that policy from live-preview readiness. The canonical151/160 matrix and cost failures remain open. |
| Settings pointer and shadows | `614a9dfbd48f` stops pointer-origin focus scrolling a control between down and up. The changed public route has stable pointer targets, a real setting event, observed guarded depth admission, drained queue, advancing flight and an inspected enabled ship/world image. | The success probe does not serialize its page-error list, so no zero-error audit is claimed. This Settings-specific fix does not establish the cause of an intermittent contract hold failure; that is being checked separately. |
| Hull physics | `48c2d6b09bb9` derives native yaw inertia from measured hull area and radius. The real Rapier low-speed scrape falls from3.98 to0.614rad/s. `9a7324ac5ab1` also gives ordinary weapon hits authored momentum instead of multiplying it by target mass: a126 impulse now produces126/m velocity change across2/16/180/800-tonne native bodies. Both contact/splash paths and real collision blocking pass focused checks. | Native checks do not establish ordinary collision feel across the fleet. Legacy replay hit/cue counts change with the corrected trajectories. Force, Massline and field policies are unchanged; no asset mass/material distribution was guessed. |
| Asset processing | The catalog covers418 release assets/352 families; all418 actual GLB hashes match their release declarations. Triangle-surface contours keep the three flagged LOD families within4WU. Canonical activation `da05f99fdb4f` includes all417 fresh package bindings,13 shared KTX2 bodies,175 rebuilt semantic-pivot hierarchies and the Fin duplicate-texture fix. The same-source headed sidecar preserves authored Kestrel appearance and reduces measured asset responses25,659,595→20,668,078B; the separate Fin retail package saves1,174,532B. | The wreck/three payload readiness rows are offscreen runway contacts, correctly streamed on reveal; no opening blocker was found. These byte/hierarchy results and the deployed asset/control pass do not establish FPS or loading-time improvement, fleet-wide collision feel or complete hero/marking appearance. |
| Deployed mobile | Public alias remains C9/7195. Unpromoted ABA candidate `dpl_HWhXSLw5RCpQEpPmA3LYV8aTPx2b` passes Chromium native touch New Game, public save/F5/Continue, recap dismissal and es→en controls, with zero JS/GL/critical HTTP errors. Its own remote receipt and all13 shared KTX2 hashes pass. | Authored hull/stars intermittently disappear after Powers/Pause/Resume in Chromium and WebKit, even without Settings. WebKit Continue also records a GLB fetch pageerror whose navigation generation is unknown; recorded200 responses do not establish a CDN CORS fault. `e93912ae3901` fixes a reproduced scene-target readiness mismatch (34 focused checks), awaiting changed native route. Actual iPhone14 remains UNKNOWN; candidate stays unpromoted. |
| Story guidance and worker boot | Pelican25 on569ceb918d10 passes the first44-C contract through public accept, native aim/latch, sustained physical tow-in, canonical520CR payment and the same mission's receiving event after undock. Errors/warnings are empty and cleanup passes. The worker preview identifies the same latched buoy. All three introductory masses and old accepted-save restoration have native checks. | Later Pelican jobs retain focused native/save coverage only. Discovery placement's ordinary look, public earned Compost growth and later story routes remain open. This first-job route is not current packaged acceptance. |
| Living traffic | `49b20a2b5f58` makes the existing Helios civic liner yield to an actual attached tug/load crossing its berth, then resume the same itinerary. Current endpoint identities, semantic attachment and live physics telemetry are required; seven focused owner checks pass. No actor or resource is added. | This is one bounded living-world slice, not completion of the whole Lantern Ward plan. Ordinary visible yield/resume remains unverified, and the tow is not a memorial-specific mission object. |
| Pro creation | Correct Pro dispatch count: 0. The Browser connects to ChatGPT Chat with Pro selected; the model menu reports “Usage limit reached.” | Five briefs remain queued for ChatGPT Pro. Work and alternate models are not authorized. See the [Pro portfolio](./PRO_CREATION_PORTFOLIO_2026-10-30.md). |

## M9 measured checkpoint history

`e934dd13aafb` separates English source copy from the full keyed localization entry. Cold source
and worker-entry checks request no localization sidecars, while the compatibility entry retains
all15,599 generated key results. Selected non-English locales are prepared before boot, Settings
commit and accepted Continue presentation; cancelled preparation cannot change the document locale.
The generated picker metadata uses the canonical inventory digest. The avoidable sidecars total
2,270,821 raw bytes. The ABA retail route confirms neither is fetched on cold English or English
reload, and both are fetched on Spanish selection; no matched loading-time improvement is claimed.

The fresh wave15 CPU profile measures600 ticks after600 warmup ticks, with seed4242 and an average
165.3 entities /35.2 hostiles. Total step mean is19.262ms, p95 33.050ms and p99 41.560ms. Physics
averages8.062ms (native Rapier step2.982ms nested within owner step5.621ms), tactical AI4.091ms and
fields1.502ms. Impact callbacks are profiled separately; listener microsecond reporting was corrected
from an erroneous1e6 conversion to1e3 without changing the underlying millisecond samples. This is
a current attribution point, not a matched before/after speedup, frame-rate result or8ms target pass.

The legacy opaque-pool path also has a completed held-scene ABBA on source `82693956a0a7`.
Its eleven batches consolidate twelve visible pool instances, reducing median world draw calls
from 185 to 173. All four arms retain about 16.67 ms median spacing and 33.34–33.37 ms p95;
the first enabled arm has a 66.715 ms maximum. Host CPU busy spans 14.1–31.7%. The authored
OFF/ON images were opened and inspected; simulation, entity transforms, settings and projection
remain matched, with camera matrix differences bounded at 1e-8 rather than claiming exact floating
equality during asymptotic smoothing. World submissions advance and defaults/cleanup restore.
No frame-time win is established, so this path remains disabled. This closes the starter-dock
experiment, not crowded-simulation or overall performance acceptance.

The current measured point is the1ad main closure above. Earlier checkpoints, methodology, receipts, and non-comparable measurements remain in the [dated archive](../../archive/finish-integration/INTEGRATION_COVERAGE_2026-10-31.md). Do not infer total transfer or runtime smoothness from the static-closure number alone.

The phone station fixture now keeps a live transaction receipt clear through Buy → Factions → Bar,
including scroll and390→430px resize. All footer controls remain hit-testable. A follow-up in the
canonical mobile layout keeps all seven navigation labels whole at12px; decorative glyphs give the
words room at narrow portrait sizes. The actual images were inspected. This closes the demonstrated
fixture defects, not ordinary docking or every station destination's gameplay.

## Active failures and next acceptance work

- The real Ceres head census now observes tractor, whip and coupler within the unchanged window after observer-relative threat selection: the allied Reach neighbor no longer provokes permanent FLEE. The additional FLEE/resume regression exposed combat egress silently retiring the booked worker; `435768372c7e` preserves live job ownership (13 focused escape checks and the full Ceres native regression pass). Physical approach/extraction/custody and Continue target binding are being integrated separately; native checks do not establish the full public Ceres route.
- Recheck the repaired scene-target readiness on changed mobile bytes and classify the WebKit fetch error by navigation generation. ABA remains staged, not promoted, while its black-world defect is open.
- The latest Ceres public route recorded an impact and destruction but lacked participant metadata after mirror removal. Its original receipt cannot prove the authored impact retrospectively. Preserve native occupant generations and raw trace data in the corrected observer, then exercise the route again.
- Complete a qualifying M8 30-minute run with the required post-context observation. The bounded packaged recovery pass does not establish soak acceptance.
- Run the public Ceres toolkit route after the ready map/actor changes, preserving the native Ceres and RC458 passes as separate evidence.
- Run the public Foundry first-ten/boss route and verify Kraken wave-seven-plus progression through ordinary play.
- Finish the remaining public UI and story routes recorded on the lane boards. Do not turn fixture or owner checks into ordinary-route claims.
- Close the remaining performance and long-session stability work with a relevant matched measurement. Current source size, host contention, and focused test timing do not establish a performance verdict.
- Perform the final build-map review and requested last-300-commit review only at the end; neither has started.
- Resolve the five unsent Pro briefs only if the user’s intended provider becomes available; current correct dispatch remains zero.

### Current integration candidate — sector epoch, CSS and renderer ownership

The latest integrated changes and their exact receipts are preserved in the [dated archive](../../archive/finish-integration/INTEGRATION_COVERAGE_2026-10-31.md). Active ownership, dependencies, and next actions belong on the lane boards. No source, native, or fixture result by itself closes the public-route or final-soak items above.

## Integrated changes and measurement limits

This section is retained as an anchor for older links. The detailed change history, measured values, route artifacts, and failure chronology are in the [archive](../../archive/finish-integration/INTEGRATION_COVERAGE_2026-10-31.md). Read each result at its evidence layer: native behavior, UI fixture, ordinary public route, packaged smoke, and performance qualification are distinct claims.

## Source coverage

Source coverage U001–U072 and orphan classifications are complete as a source-coverage activity. That does not certify all systems, visual quality, ordinary routes, retention, or performance. See the [source coverage ledger](./SOURCE_COVERAGE_2026-10-29.md) and the [full historical integration record](../../archive/finish-integration/INTEGRATION_COVERAGE_2026-10-31.md).
