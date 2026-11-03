# Whole-game integration status

Updated 2026-11-03. This is the compact current outcome map for the Finish Program, not a game-complete claim. The lane boards own active work and acceptance criteria: [Lane 1](./LANE_1_MACHINE_AND_PICTURE.md), [Lane 2](./LANE_2_FIGHT_AND_SIM.md), and [Lane 3](./LANE_3_WORLD_GLASS_HOUSE.md). The [dated archive](../../archive/finish-integration/INTEGRATION_COVERAGE_2026-10-31.md) preserves the previous detailed receipts and failure history. Source coverage U001–U072 is recorded in [the coverage ledger](./SOURCE_COVERAGE_2026-10-29.md).

The controller owns all remaining working-tree changes, plans and open PRs under the user's
2026-11-01 direction. [PR integration](./PR_INTEGRATION.md) records current source reconciliation;
expired agent claims do not block finishing. The owner's latest direction keeps Chrome and VLC
open; other tasks may be stopped when useful. The current creative production pass is described in
[STUDIO.md](./STUDIO.md): build coherent physical situations from existing systems and assets,
judge actual player experience, and iterate through short purposeful play rather than repeated
long survival checks. Implementation and focused checks remain separate from route acceptance.

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
  and documentation cleanup. Five separate Pro creation briefs remain blocked on the intended
  provider; the current Codex CLI factory workers are a distinct channel.

The coherent `d7ed4aa450f1` source baseline passes17/17 checks in63,635ms within the
unchanged90,000ms budget. Earlier focused worker transport/HUD checks pass24/24. All417 render-package
plans were validated by the web build from `aba26d770eab`. Its2866 files total629,883,908 bytes;
the local receipt SHA256 is `6f4e2a15e4414fd8b16ad83bf859151999af6bf0baded3ddefc20cf2a97609e8`.
The matching Windows ASAR passes the actual default New Game/flight/worker startup smoke and cleanup.
This closes packaged startup for that bundle, not Settings return, retention or final performance.
The authority HUD, drill-demand, adopted salvage/Continue and scene-target repairs are now bundled
from `d7ed4aa450f1`:2866 files /629,895,262 bytes, receipt SHA256
`62b69123b02425c333f9bebb1ec5f00d7d159cf0123585ce47ebb321d6d949f9`.
That newer bundle had no packaged ASAR result at this checkpoint. Its local retail route passed
native touch, public save/F5/Continue and recap dismissal, but the captured landscape lost the hull
and recorded12 GL program-query warnings before reload. Later D6/current-source WebKit results are
recorded below; neither this earlier local capture nor a later healthy frame erases the retained
failure.
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

The November 2 D6 render-owner diagnostic candidate is READY at
`https://spaceface-play-demo-e4lewik23-robin-gattis-projects.vercel.app` (`dpl_Yzv2CXP2pm5QmRcqwUmK2tdD4KoS`).
Its deployment Git SHA and release metadata both identify `d6ba5fbe79f7f86eb264cd66499ba161e17b3d6e`.
The remote release receipt reports 2,866 files /629,934,624 bytes and output digest
`c92cdb7fb3d9939fbfe6da6220184f93e1034c7a3cca01e479bef2ff7b4ac24b`; the unique-host index is
12,626 bytes with SHA256 `a0be6f9e864a806cf1f2f25993a841c213b51a7f9a59315d67bf8162945aa367`.
Vercel assigned generated branch/team aliases, but the public `spaceface-play-demo.vercel.app`
mapping was read back as C9 (`dpl_C9eZXk9gbHTttTY7rittWTMhX2Yq`). It is still a diagnostic
deployment, not the public alias or a local/remote bundle comparison. The D6 WebKit route showed
a black world after rotation. A later staged candidate, `dpl_23Cp5586RZbW6p6UkMVebDXfSn3g` at
`https://spaceface-play-demo-oaml3siaj-robin-gattis-projects.vercel.app`, uses source
`75f04f69676b032174883db54937b0ad3badc28b`; its remote receipt is
`a912e70559835f488497ccd631e7bd05eb805dacca963c4f56ce4a228324a546` (output digest
`0808006bb1bc6ef6a1630cb145cf738ed0afb63dfde6b47ab97943136ffe6ca5`). That WebKit run completed
public Save, reload and Continue, but its requested iPhone profile reports
`navigator.maxTouchPoints=0` on Windows. During original-document rotation, `orientationHold` and
`refillInFlight` remained true for about10s and the world showed a stretched retained portrait
image, not a black frame; fresh landscape drawing was unverified before F5. Public alias remains
C9 and physical iPhone14 remains UNKNOWN; no promotion or mobile acceptance is claimed.

The last measured main static closure is9,959,652 raw bytes; the6MB target remains
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
| Ordinary gameplay routes | Racing, Gauntlet, Pinball, Swarm round-three functionality, and the Adventure Ceres delivery/save/Continue route have scoped passes. | These do not establish full-game completion, broad performance, or all public-story routes. Foundry first-ten/boss and Last Shift story routes remain open. The ordinary mining round trip now works after `fb45385f9dd5`; the later `d942b962b0f4` route shows work, survey, finite cargo and flight return. Performance qualification remains open. |
| Veil Step starter | The headed ordinary starter route passes 8/8 checks: public pointer aim and Shift hold/release produce 234.3 WU of actual displacement, spend capacitor energy (200.0 to 128.9), and return the visible cue to ready after 1.30 simulation seconds. Authored player/world readiness and uncaught-error checks pass; cleanup completes. | The first failed actor log is preserved: it read an absent worker-mirror budget field and required exact post-event pose equality. The corrected route stops before the legacy smoke script's forced damage. This closes Veil use/cooldown only, not ten-wave progression or a performance target. |
| Ceres and RC458 | Native Ceres owner cases cover tow admission, salvage and intake. The latest 29 continuation reached the yard and accepted one scrap; one restricted classified item remained held, the job stayed active, and the worker died at376.25s after repeated station contacts. | The latest Sol candidate safely retains cargo on partial/refused intake and passes two native partial/refusal plus Continue cases, but the changed Ceres12 continuation has not been rerun and full custody/release is incomplete. This is not a public Ceres/Continue result. Preserve the earlier collision deaths; RC458 and public story routes remain separate. |
| Tethys stealth offer | Returning after casing now refreshes the standing capsule offer's case file and quiet approach from canonical observations. The focused regression preserves identity/terms, publishes one update, remains idempotent, and leaves accepted contracts unchanged. | Natural public Tethys stealth-route acceptance remains unverified. The existing compressed PQ-019 probe is a fixture route. |
| Foundry and Kraken | The immutable 0fc6007d run fought and paid for fortification, resolved waves1–8, and reached wave9 at the original45-minute cap (38 spawns,36 resolves, two remaining hostiles in the last snapshot). | Wave10 and the Iron Kraken were not reached; targeting, portrait, tells, and boss progression are not established. Host contention and diagnostic frame samples are not a performance pass. Any retry needs a material source/actor change, not the same cap unchanged. |
| Swarm specialists | `a6b5c8f76d91` integrates Warden finite guard links, Jackal mine salvos and Anchor displacement/recovery through existing damage, AI, mines and field owners, with counter briefs and authored assets. Focused behavior and worker/render transport checks pass. `0f502b00dc3f` also makes Greedy Tractor synthesis use obtainable Swarm stock. | Ordinary later-wave progression, readable tells and authored ship appearance remain open. Native checks and asset hashes do not establish these visual or player-route outcomes. |
| M8 recovery and stability | The corrected Save/Continue contract suite passes64/64, including semantic preservation and canonical restore-owner behavior. The retained-resource fix addresses a demonstrated retired-batch shadow reference. | The required30-minute soak with its post-context active tail has not run. These contract and focused retention checks do not qualify long-session memory or frame stability. |
| Renderer / recovery | Startup, shadow, preview, count-zero instance and census/proxy identity repairs are integrated. `532621b8f848` holds package geometry across the live exact-target async suffix; the real detach interleaving case and related owner suites pass73/73. The armed1ad public F2/Helios route recorded no resize failure. | This scoped route does not establish every transition or long-session resource safety. A startup-upload resize in c65 lacks per-object identity and requires the existing armed diagnostic if reproduced. Final packaged acceptance remains pending. |
| M10 shader ownership | GL issue and render-state restoration remain serialized; capable backends can settle four independent actual-program readiness sets outside that reservation. Timeout receipts retain ownership of unfinished work. Focused owner, cancellation, delayed-stamp and fallback checks pass. | No matched live speedup has been established. This repair and the loading-queue handoff do not establish loading or runtime performance acceptance. |
| M5 rigid batching | A current held-scene ABBA preserves exact source, settings, camera/projection and entity poses; real world submissions advance. Both compositor captures are nonblank and inspected. Five cohort roots produce46 instances in five batches; median draw calls122→119. Defaults restore and cleanup passes. | Median intervals remain16.67ms in every arm; no timing improvement is established in this starter scene. Host CPU busy varies27.5–41.9%. The older blank-image742/982draw result is not accepted. This does not establish active crowded-flight performance. |
| Runtime performance | B27's existing retail witness records **22.933 Hz / 0.9182 sim/wall** in the first tail. A separate launch after cleanup of a stalled fleet-capture job records 3,686 world draws over 120,027.765 ms: **30.7096 Hz / 0.99963 sim/wall**. Both tails follow actual public world/input recovery and finish with cleanup. A measured texture-serialization path now uses the canonical safe clone helper; 47 focused checks pass. | These launches are not a matched causal A/B. Retail averages do not establish scanout, frame percentiles or a 60 fps pass. The equal executed-frame/world-draw deltas in the later tail show no net active-loop cap skips; its effective cap/display calibration is unrecorded. Transmission's mismatched first-picture experiment is inconclusive; scale remains 1.0. The clone's live benefit and frame targets remain open. The earlier wave15 fixture averaged157.2entities and27.257ms per sim step (p95 39.208ms), so the simulation targets also remain open. |
| Fleet asset capture | The original 170 images are preserved. Cradle and all remaining 26 entries have visible native captures, with first blank/inconsistent frames retained. Last Argument and Storm Orchard positive captures recorded target GL draws. The preview rejects zero-draw output and now distinguishes published, prepared and failed authored states. | A later Kestrel house-marking preview exhausted its retries with zero draws; no image was accepted. Decal readability and combined HeroRig/plume appearance remain open. Isolated previews do not establish ordinary in-world placement or complete visual parity. |
| M9 loading | The d7 bundle validates417 render packages and measures9,959,652 raw main-static bytes. Retail English cold/reload requests no optional localization sidecars; selecting Spanish fetches the two inventories, and trusted es→en Settings controls relabel correctly. `3965cdfc54c8` makes the drill screen demand-only and removes its preload, with21 focused lifecycle checks. The first ordinary F2 request/open/close/W demand check now passes. `6e9b60f597bc` binds mining requests and persisted work to the actual asteroid. | The6MB, loading and runtime targets remain open. `fb45385f9dd5` fixes queued-input ownership and stale worker-mirror rejection; the ordinary F2/course/extraction/work/exit/W round trip passes. The `d942b962b0f4` visual route adds work and survey, with cargo increasing from zero to two units. ABA ASAR default startup passes; no full package/soak acceptance follows from that smoke. |
| Baseline | The coherent d7 integration baseline passes17/17 in63,635ms within90,000ms. Measured-hull legacy reload@600 and V3 reload@60/600 also pass five repeats each. | Changed physical trajectories alter legacy hit/cue counts and are documented. Original acceptance budgets remain enforced. This timing is not an isolated speedup measurement. |
| Responsive UI | The public8f5 route passes1280/960 F2 fitted-hull callouts, physical Helios docking,568x320 Market quantity and empty-Sell→Buy controls, and the actual Industry research lock. The responsive matrix helper now preserves per-cell failure reasons and alias-fixture provenance (`069c9178dc11`); Pause Resume text remains visible in forced colors (`136e21f5f315`, with a corrected capture). | These checks do not close the canonical151/160 matrix or its cost failures. The matrix-helper change is coverage correctness, not a product-route pass. Existing backend policy may block the secondary WebGL context; the actor distinguishes that policy from live-preview readiness. |
| Settings pointer and shadows | `614a9dfbd48f` stops pointer-origin focus scrolling a control between down and up. The changed public route has stable pointer targets, a real setting event, observed guarded depth admission, drained queue, advancing flight and an inspected enabled ship/world image. | The success probe does not serialize its page-error list, so no zero-error audit is claimed. This Settings-specific fix does not establish the cause of an intermittent contract hold failure; that is being checked separately. |
| Hull physics | `48c2d6b09bb9` derives native yaw inertia from measured hull area and radius. The real Rapier low-speed scrape falls from3.98 to0.614rad/s. `9a7324ac5ab1` also gives ordinary weapon hits authored momentum instead of multiplying it by target mass: a126 impulse now produces126/m velocity change across2/16/180/800-tonne native bodies. Both contact/splash paths and real collision blocking pass focused checks. | Native checks do not establish ordinary collision feel across the fleet. Legacy replay hit/cue counts change with the corrected trajectories. Force, Massline and field policies are unchanged; no asset mass/material distribution was guessed. |
| Asset processing | The catalog covers418 release assets/352 families; all418 actual GLB hashes match their release declarations. Triangle-surface contours keep the three flagged LOD families within4WU. Canonical activation `da05f99fdb4f` includes all417 fresh package bindings,13 shared KTX2 bodies,175 rebuilt semantic-pivot hierarchies and the Fin duplicate-texture fix. The same-source headed sidecar preserves authored Kestrel appearance and reduces measured asset responses25,659,595→20,668,078B; the separate Fin retail package saves1,174,532B. | The wreck/three payload readiness rows are offscreen runway contacts, correctly streamed on reveal; no opening blocker was found. These byte/hierarchy results and the deployed asset/control pass do not establish FPS or loading-time improvement, fleet-wide collision feel or complete hero/marking appearance. |
| Deployed mobile | Unpromoted 29 candidate `dpl_6Z1hm2YGUftoUvqPHwwuA7PwcMxs` passes the original rotation gate in9.082s. A same-frame canvas image is bright and advances; the adjacent WebKit page PNG is black. | The planned Windows native-window capture was stopped before any app input/capture. Visible-window output is UNKNOWN, as is physical iPhone14 behavior; the requested Windows profile reports `maxTouchPoints=0`. Public alias remains C9 and the candidate is not promoted. No mobile acceptance is claimed. |
| Story guidance and worker boot | Pelican25 on569ceb918d10 passes the first44-C contract through public accept, native aim/latch, sustained physical tow-in, canonical520CR payment and the same mission's receiving event after undock. Errors/warnings are empty and cleanup passes. The worker preview identifies the same latched buoy. All three introductory masses and old accepted-save restoration have native checks. | Later Pelican jobs retain focused native/save coverage only. Discovery placement's ordinary look, public earned Compost growth and later story routes remain open. This first-job route is not current packaged acceptance. |
| Living traffic | The Helios civic liner's native owner checks cover yield to an attached tug/load and resumption of its itinerary. | Ordinary visible liner/tug yield and return remains unverified; the native checks do not complete Lantern Ward or a memorial-specific mission route. |
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

The current measured point is the d7 main closure above. Earlier checkpoints, methodology, receipts, and non-comparable measurements remain in the [dated archive](../../archive/finish-integration/INTEGRATION_COVERAGE_2026-10-31.md). Do not infer total transfer or runtime smoothness from the static-closure number alone.

The d7 drill-demand graph reduces automatic UI closure19,010,057→18,555,629 raw bytes, leaving31
automatically registered screens and3,863,462 bytes beyond boot. These are static graph measurements.
The first ordinary F2 demand/open/close/W check now passes; that does not establish loading or performance acceptance. The later `fb45385f9dd5` ordinary work/exit/flight route passes; `d942b962b0f4` also records survey and finite cargo. The next measured Shipworks
opportunity is828,070 exclusive bytes, held for actual F2/cancellation integration.

A separate four-arm ABBA rejected a speculative fields priming shortcut: workloads matched, but
candidate mean step time was0.663ms worse and p95 was1.672ms worse in paired averages. Neither field
source nor its speculative test was retained. Keep that negative result; do not repeat it as an
untried optimization or infer an overall simulation speedup from unrelated runs.

The phone station fixture now keeps a live transaction receipt clear through Buy → Factions → Bar,
including scroll and390→430px resize. All footer controls remain hit-testable. A follow-up in the
canonical mobile layout keeps all seven navigation labels whole at12px; decorative glyphs give the
words room at narrow portrait sizes. The actual images were inspected. This closes the demonstrated
fixture defects, not ordinary docking or every station destination's gameplay.

## Current integration status and next work

Updated November 3 after the owner requested a bounded integration finish and a stop/report.
Save/recovery fixes are committed in `0a046adf1e09`, salvager refusal handling in `5ba03b01ca9f`,
and garden custody/progress in `d87c999ea10d`. The incoming UI work through PR815 is merged in
`bc9dba8c2cdd`, preserving the local Pause and Motion Ask mobile fixes. The merged baseline passes
17/17 in50,000ms against its unchanged90,000ms budget. No new long playtest or deployment was started.

- **Mining:** the ordinary F2/course/extraction/work/exit/W route passes; the later `d942b962b0f4`
  route records inspected rock art, survey/contact changes and cargo0→2. Its original work/survey
  observer overlapped the actions; the corrected item-level actor is prepared but has not run.
- **Save/restore:** the corrected seed47 quick contract passes1482 ticks with no failures or
  unhandled errors; the only permitted semantic delta is the validated free-ID list filtered by
  held entities/ledgers, with generation monotonicity preserved. The M8 repair is integrated in `0a046adf1e09`; the affected three-file suite passes64/64,
  and the final allocator-corruption regression passes. This is not the30-minute soak.
- **Ceres:** attempt12 reached the yard and partially accepted one scrap, retained one restricted
  classified item, and left the job active; the worker died after repeated station contacts. The
  integrated safe-hold fix passes native partial/refusal plus Continue cases. No full custody or
  changed-route replay is complete, and no public Ceres route is accepted.
- **Foundry:** the45-minute attempt resolved waves1–8 and ended during wave9. Wave10/Kraken was not
  reached. The host-contended frame samples are not a performance result.
- **Mobile:** candidate29 passes the rotation gate in9.082s and captures a bright advancing canvas,
  while its adjacent WebKit page image is black. The user's physical Escape stopped the planned
  visible-window capture before any app input or capture. Visible-window output and iPhone14 remain
  UNKNOWN; public C9 is unchanged and candidate29 is not promoted.
- **UI and authored visuals:** the six non-default matrix aliases and mounted chart-cost cell remain
  open. The #808–#815 layout changes are source-integrated but have no new local mounted looks. The
  in-world hero/plume/marking look is still open after a preserved zero-draw Kestrel result.
- **Story and traffic:** Last Shift, natural Tethys stealth, earned Compost growth, PQ024H1, visible
  liner/tug yield-resume and a changed Ceres continuation remain player-route work. The #724 garden
  source delta is integrated in `d87c999ea10d`, with10 owner-component cases passed but no earned public feed.
- **Performance/stability:** the6MB main-load, simulation/frame targets and30-minute context-loss
  soak are open. M5/CPU ABBA experiments without a material win remain closed; do not repeat them as
  unfinished opportunities.
- **Provider and closure:** five Pro briefs remain undispatched because the selected provider reports
  “Usage limit reached” through the Nov4 window. The final build-map and last-300-commit reviews
  belong at the end.

The executable sequence and direct-check boundaries are in [PR integration](./PR_INTEGRATION.md).
Source ports, native cases and fixture looks remain distinct from ordinary player routes, mobile
release and full-game acceptance.

## Integrated changes and measurement limits

This section is retained as an anchor for older links. The detailed change history, measured values, route artifacts, and failure chronology are in the [archive](../../archive/finish-integration/INTEGRATION_COVERAGE_2026-10-31.md). Read each result at its evidence layer: native behavior, UI fixture, ordinary public route, packaged smoke, and performance qualification are distinct claims.

## Source coverage

Source coverage U001–U072 and orphan classifications are complete as a source-coverage activity. That does not certify all systems, visual quality, ordinary routes, retention, or performance. See the [source coverage ledger](./SOURCE_COVERAGE_2026-10-29.md) and the [full historical integration record](../../archive/finish-integration/INTEGRATION_COVERAGE_2026-10-31.md).
