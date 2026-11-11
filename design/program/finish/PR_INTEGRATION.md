> **HISTORY — not a source of work.** Superseded on 2026-11-11 by `design/program/fleet/QUEUE.md`
> (work) and `design/game/` (design). Read for background only; do not take tasks from this file.

# PR integration map

The 2026-11-01 GitHub snapshot contains 24 open PRs for `coldshalamov/SpaceFace`; it is not a live open-count claim. This is an integration queue, not a merge queue: compare each head with current code before porting anything. Source ports below are identified by commit; ordinary player looks remain separate where marked pending. Do not treat an open PR, its test count, or its mergeability label as evidence that its player outcome is missing or accepted.

## Subsequent integrated PRs

- **#825, Book4 worksites and current starter-work preview:** the prior port `5bd5919b5bf8`
  connects Barn Raising to Frontier's finite six-module worksite and canonical payout, and Spine
  Break to its original convoy, recoupling and station-custody owners. Native/worker checks pass;
  ordinary Book4 journeys remain open. The current PR head `62adf5d93259` adds one new task after
  the already-ported `d6fbe678a88e`: hull-specific first Helios work in the existing New Game rail.
  `df437c69ac0f` ports that preview using actual starter-job/module data and stale-fit fallbacks;
  seven preview and eleven existing lifecycle checks pass. Rendered preview acceptance is open.
  November5 head checks also confirm #837's task already matches the current one-file owner and
  #840 remains unchanged at the pin below; those completed integrations were not repeated.

- **#840, Lantern Ward:** pinned at `e4363226c1c9`, ported in `8398e7c8d2b1` through current world,
  NPC work, missions, physical attachments, law and presentation owners. Schema22→23 adds optional
  defaults without grants. Actual native service installs the finite original and pays180CR once;
  real repair purchase, Massline alternative, commuter trips, theft/loss and cold Continue checks pass.
  Current facts outrank remembered theft/delay in Hail and Story. Ordinary arrival/camera acceptance
  remains open. Two independent existing defects are already ported and repaired:
  `1220bfd9925f` preserves full Counterweight autosave capture, and `6794833bc886` prevents packaged
  beacon double scaling. Stronger local Import/Load/Continue and seed/scar fixes are retained.
  No broad old-branch replacement, reference-budget rebinding or binary asset port is involved.

- **#835/#838/#839, compact station and Help:** merged with `origin/master90beba0230f1` in
  `03b9e46336f7`. The scoped source/DOM/breakpoint review found the vitals row, footer rail and
  Ores reading selectors consistent. Integrated ordinary looks remain open. Both historical
  reference files retain their exact authentic October30 blobs; incoming hash-only rebindings
  were excluded.

- **#836, progressing slow-GL admission:** reviewed and corrected in the same merge. Its relative
  timers accepted a picture at105ms despite a20ms base plus20ms cap. The owner now captures time
  before work, uses an absolute hard deadline, accounts for delayed callbacks and refuses late
  success while preserving typed driver errors. The20 affected first-picture/recovery cases pass.
  This is bounded admission behavior, not physical iPhone or actual-picture acceptance.

- **#837, patrol arrival and wreck momentum:** integrated in `8d241e2be007`. The patrol stages at
  its valid jurisdiction arrival. The corrected native scenario observes the original death and
  admitted wreck rather than a nearby unrelated hull; clear-coast momentum retains100.9% after2s,
  while real populated-bay contacts may destroy the wreck. No runtime momentum injection,
  collision suppression or golden refresh was made. Publication and ordinary arrival look remain open.

- **#819, Forge and current trade integration:** selectively ported useful current source in `5a2e6e7fbd3e` and `a5610244d72d`; the old branch's broad deletions, duplicate documents and stale benchmark metadata were excluded. Forge's named berth, global Slate position, ordered handoff, truthful furnace settlement and finite native Maw/slag work now share the campaign owners. The worker carries the real Maw radius into its visual. Market confirmation uses one execution transport, exact intent/receipt identity and a same-ID unknown-result retry. Review reproduced a warm-ledger partial-fill explanation loss; the local receipt fix now preserves the real six-of-ten result before the ledger leaf arrives. Focused native/worker/story/trade checks pass; ordinary Forge/Maw/Market route acceptance remains open.

- **#817 and #820–#823, compact controls:** ported in `88f53902ab90` without stale reference metadata. Back controls retain their label/keycap typography, New Game rear names clear the ring, stake economics wrap, and compact Crucible mode choices remain together. Software-mounted New Game and Crucible views were opened at their affected desktop sizes; this does not establish ordinary mode play or mobile flight.

- **#818, phone maps:** reviewed and merged from `acebedaac0a1`. The Star Map stacks chart and inspector below560px, and the Local Map routes list clears its wrapped legend. The two reference JSONs refresh source identities; numerical budgets are unchanged. This scoped source review does not establish phone flight or a mounted map pass.

- **#816, phone Settings categories:** reviewed and merged from `290002828450`. The existing category rail wraps so Controls remains discoverable without a hidden horizontal scroll. Incoming metadata changes only source identities; numerical budgets are unchanged. Current phone-route appearance remains pending, and metadata refresh is not visual or performance acceptance.

- **#811, player-route boot retry:** incoming `308b9b961fba` was reviewed and fast-forwarded, then corrected in the same integration batch. Its blanket pre-play/NO-GL retry could hide a real route failure, and failed archival could erase the first attempt. The unsupported retry is removed; only the existing classified environment-loss path may retry, after successful preservation of the first attempt. Thirty-two focused orchestration/browser-loss/gate checks pass. No additional full-game run was needed for this harness repair.

- **#812–#815, incoming phone layouts:** reviewed and merged in `bc9dba8c2cdd`: narrow New Game Launch, short phone Save layout, objective-anchored speed tape where supported, and landscape Beacon clearance. The merge retains the broader local Pause panel and Motion Ask mobile width bound. Numerical UI budgets are unchanged; incoming source hashes do not qualify the merged build. CSS sidecars match their owners. The merged baseline passes17/17 in50,000ms; no new local visual or physical-phone pass is claimed.

- **#807, software-GL control probes:** merged as `ee3167a3408e`; `65c305dd682f` makes a performed same-input retry authoritative in player-control and round-start checks, while preserving both attempts in the trace. A dead retry can no longer pass because a sparse first attempt looked live. Focused CPU checks pass 44/44; no browser/player-route pass is claimed.
- **#803, Adventure openings and truthful Swarm:** the assigned22-path source/test port is committed as `de7b1c4b754b`. It connects current 47-A waypoint/readout truth, first-contact/handoff feedback, Kessler's exact current-board starter-work offer, and planner-backed Armory/Refit stock, wallet and forecast repaint. Focused owner/UI checks pass; the PR-wide stale deletions were not imported, including removal of carried-throw momentum and its regression. No ordinary player-route acceptance is claimed; see the [current port receipt](../../../.devshots/finish/integration-2026-11-02/pr803-current-port/RECEIPT.md).
- **#808 Pause, #809 Save/Records, #810 Motion Ask:** four source paths are ported in `c11f351bba01`. Pause keeps Resume visible in forced colors; Save/Records back typography survives the CSS reset; Motion Ask keeps its width ceiling. Source checks pass, but mounted looks have not run.
- **#806, compact station-standard layout:** merged from `origin/master` as `96db178286fa`. The net three changed paths are `src/ui/orrery/stationStandard.js` and the UI frame-reference budget/source-manifest JSONs. The new compact station rule was exercised in the browser at 960×461, 960×540, and 1100×640: tabs remain one row and reachable without overflow. This is bounded rule-shape evidence, not a complete ordinary station/docking route or branch-build acceptance.
- **#802, First Light route timing:** merged through `ebc3997c4ad2`. The cinematic actor now waits for a mounted First Light dialog to open or release its input fence and excludes the main menu from unrelated-modal detection. Review found that a replacement confirmation could be mistaken for completion; `07129ad5e4fb` preserves that replacement and stops further Space input. The focused suite passes20/20, including delayed opening and replacement cases. No new browser-route acceptance is claimed.
- **#800, short desktop Save/Load:** merged remote `67c9e951081f` after review of the six-line `saveLayouts.js` spacing band (non-phone, width≥791px, height461–560px) and two hash-only UI reference updates. Existing narrower and shorter bands remain separate; numerical budgets are unchanged. Its mounted 960×540 image was opened: title, filed-save details and controls have clear separation (`.devshots/finish/integration-2026-11-02/pr800-load-look/`). This is fixture composition, not live save/load or performance acceptance; reference hashes describe the remote snapshot.
- **#804, Achievements; #805, Save layout:** merged as `ae43a612b5eb18c7a9c4e764191f41536c8db723`. The net D6→remote change adds a phone-only Achievements promise-row layout (≤640px) and reduces Save action spacing only on non-mobile 1200–1279px by ≤560px. The two reference JSON changes update source digests only: parsed budgets and source-manifest objects differ only in source-hash fields; all numeric budgets and manifest paths are unchanged. This was a scoped CSS/source-metadata review, with no mounted regression capture or ordinary-route acceptance claimed.
- **Mounted layout follow-up, 2026-11-02:** Game Over, empty Statistics and empty Clips were mounted at 1920×1080 and 1200×700; all six images were opened. The compact Game Over loss cause painted into the dial's duration label despite a green geometry report. The compact desktop headline now respects its report column and uses the smaller display size; its new 1200×700 image has clear separation. Artifacts: `.devshots/finish/integration-2026-11-02/merged-menu-polish/` and `game-over-column-fix/`. This checks composition with fixture state, not live recovery, earned statistics, clip export or frame performance.
- **#797, Game Over; #798, Statistics; #799, Clips:** the reviewed net delta from `d7ed4aa450f1` through remote `fe82f15987f0` was merged in `8c02dbd3bebb4b90de7dc424756349c38ff58b04`. The five changed paths are `src/ui/orrery/gameOverLayouts.js`, `src/ui/orrery/statisticsLayouts.js`, `styles/ui.css`, and the two UI reference JSONs. Scoped CSS adjusts desktop Game Over card sizing/headline/action wrapping, short-frame Statistics title padding, and the empty Clips legend at widths of at least 641px and heights 461–640px. Numerical UI budgets are unchanged. The refreshed fingerprints are source provenance, not a new mounted-screen, ordinary-route, or performance pass; no new visual acceptance is claimed.
- **#794, Sandbox; #796, Automation:** merged from `origin/master` through `56336a66d140`. Beyond the earlier `91a0ae2ae973` ports, the net source change gives the 1080p Sandbox ladder room for its faded row and reflows the Automation summary at 521–760px. The merge also brings source fingerprints from the remote snapshot; those fingerprints do not describe the newer merged HUD and preload source and are not a current UI-matrix or performance pass. No new mounted or ordinary-route look is claimed for these net changes.
- **#787, Automation summary; #789, Crucible results; #791, Replay/Clips:** merged from `origin/master` through `149a9b407f75` after reviewing the five changed paths. The summary strip, result-column separator and1080p type scaling are CSS changes; numerical UI budgets are unchanged. Relevant mounted-screen looks are in progress.
- **#790, Automation1080p; #792/#794, Sandbox; #795, phone Station head:** the small CSS changes were ported to current owners in `91a0ae2ae973`, preserving the newer source and avoiding stale branch merges. The phone purse shares the palette-trigger row, and the vitals keep their own row. Actual screen looks and control clearance are being checked; this is not ordinary-route acceptance yet.
- **#784, Save layout:** merged through `1960ba9dc845`. The thirteen-line inset/hairline change and source fingerprints were reviewed; numerical UI budgets were unchanged. The current Save-screen look remains pending.
- **#785, Ledger eligibility:** merged through `82693956a0a7`. At1101–1440×461–720, the eligibility card spans the tape and purse, and its panel scrolls. Source review is complete; an ordinary populated Ledger look remains pending.
- **#788, Pause footer:** merged through `82693956a0a7`. At521–640px desktop height, the footer moves below the dial rim. Source review is complete; the corresponding ordinary Pause look remains pending.
- **#786, Station footer:** merged through `b8878dcc7167`. At901–1199px width, tab hit areas stay clear of Comms/Help/Undock; tighter narrow-desktop spacing retains the Market controls above the footer. The focused browser test passes across eleven viewports. This is mounted-screen coverage, not completion of every station journey.

These merges preserve the existing UI cost thresholds; updated source fingerprints are not performance acceptance.

**Current integrated snapshot, 2026-11-03:** `bc9dba8c2cdd` includes the responsive helpers (`069c9178dc11`), chart (`b85295f7d3ec`), mining (`6e9b60f597bc`), retention (`75f8eb113008`), orientation (`5ef5f1962889`), fields (`01045ba25211`), PR803 port (`de7b1c4b754b`), PR808/809/810 source ports, the reviewed incoming phone fixes through PR815, and the completed save/salvager/garden repairs listed above. The ordinary mining action and work/exit/flight route pass; later survey/cargo evidence is scoped. The latest mobile candidate passes its rotation gate but its page snapshot is black despite an advancing bright canvas; the visible window and physical iPhone remain unknown, and public C9 is unchanged. The latest Foundry run stopped at wave9, before the boss. M8 contracts pass64/64, but the30-minute soak is not run. No full-game or release acceptance is claimed.

The [current outcome map](./INTEGRATION_COVERAGE.md) and [lane boards](./LANE_1_MACHINE_AND_PICTURE.md) are authoritative for current route status. This ledger tracks only the GitHub PR backlog. Closed prerequisites #480 and #526 are already merged; open dependent branches still need retargeting/reconciliation where noted.

**Historical screenshot review, 2026-11-02:** these earlier armed ordinary-route captures
(`remote-ui-public/run-2026-11-01T22-48-07-253Z-19132`) expose a remaining My Ship defect:
at 1280×720, Cargo/Pulse Laser/Mining Laser callouts overlap the full hull description; the
960×540 stage is cramped as well. The #736/#733 ordinary-route looks are rejected pending a new
route check. Commit `0d3b1496bd82` moves the same live nameplate above a full compact-flight stage,
keeps callouts clear of the hull, and lets the main readings and controls scroll. The inspected
1280×720 and960×540 fixture images are clear, including the scrolled Save Fit/Range/Record controls;
the synthetic walk left three reset-dependent controls untried and is not a full-walk pass.
The Achievements category capture at 960×540 shows the medal name and status on separate readable
lines, supporting the narrow #723/#711 layout result. The 568×320 Market capture still has
overprinted header readings and little usable trade height, so #695 remains visually incomplete.
Opening a screen alone did not establish these visual outcomes.

## Current open PRs

| PR / head | Player outcome | Integration status and next action |
|---|---|---|
| [#783](https://github.com/coldshalamov/SpaceFace/pull/783) `ui-polish-285` | The fresh-save Records Wall reads as an empty ledger, with a quiet “Not yet” tag and aligned note/card width. | Open, non-draft, merge conflict reported. Ported in `3ccf035b5ed3` (`achievementsLayouts.js`) with source digests refreshed. The ordinary public route reached Records Wall through Pause at 960×540 and showed the fresh-save empty-state copy. |
| [#782](https://github.com/coldshalamov/SpaceFace/pull/782) `ui-polish-284` | Mission Log contract terms become one readable grouped block on desktop. | Open, non-draft. Ported in `3ccf035b5ed3` (`archiveCssSource.js` and generated CSS). The ordinary public route opened the live Mission Log at 1280×720. Populated receipt/term rendering remains fixture-scoped. |
| [#781](https://github.com/coldshalamov/SpaceFace/pull/781) `ui-polish-283` | Game Over recovery dock, cost, and cargo consequence are aligned in three readable cards. | Open, non-draft. Ported in `3ccf035b5ed3` (`gameOverLayouts.js`) and the phone title-wrap correction is in `d5acae4bf86b`; public reader/actions are unchanged. Desktop 1280×720 and phone 390×844 mounted fixtures were captured. Natural defeat/recovery remains unverified. |
| [#776](https://github.com/coldshalamov/SpaceFace/pull/776) `feat/swarm-enemy-ecology` | Warden, Jackal mine-layer, and Anchor specialists add telegraphed powers, authored bodies, and counterplay to later Swarm waves. | Ported in `a6b5c8f76d91` through canonical damage, mine, field, counterplay, worker presentation, and authored-asset owners. The combined owner check passed 78/78; `test/swarm-specialists.test.mjs` passed 4/4 after active-duration expiry coverage. The public later-wave progression and visible authored-body route remain unverified. |
| [#753](https://github.com/coldshalamov/SpaceFace/pull/753) `ui-polish-257` | Market quantity and Buy/Sell controls fit a 481–650px portrait station. | Open, non-draft, conflicts reported. Market layout work is in `89c2c6045509` and `3ccf035b5ed3`; the 960×540 ordinary Helios route reached the enabled quantity field and completed public Buy and Sell controls. 540×900 and 568×320 captures and a 390×844 mounted fixture exist; phone Buy/Sell reachability remains unverified. |
| [#752](https://github.com/coldshalamov/SpaceFace/pull/752) `ui-polish-256` | The station title and credits no longer collide at 481–650px. | Open, non-draft. Current `stationStandard.js` stacks the purse beneath the title through 650px. The ordinary 960×540 route recorded the title and purse without overlap; the 390×844 Market fixture was captured. No 481–650px public station route was completed. |
| [#751](https://github.com/coldshalamov/SpaceFace/pull/751) `ui-polish-255` | Phone Market quantity, Buy, and Sell remain reachable in the narrow trade column. | Open, non-draft. Existing Standard/Market rules are retained from `89c2c6045509`; the 390×844 mounted Market fixture was captured. Its controls were not walked individually, so phone Buy/Sell reachability remains unverified. |
| [#748](https://github.com/coldshalamov/SpaceFace/pull/748) `perf/prelift-program-warm` | Pre-lift compilation warms one observed hulk surface/depth shader key. | Open, non-draft. Evidence is from an older pooled GPU cohort, and files overlap active renderer/first-picture ownership. Defer until the current M8 result is closed; then compare the exact live key and use a current same-session check before any performance claim. |
| [#746](https://github.com/coldshalamov/SpaceFace/pull/746) `ui-polish-251` | The phone-width Asteroid Works palette is visible and does not cover Plan. | Open, non-draft. The ≤600px phone palette rail is in `3ccf035b5ed3`; the `drill-claimed` 390×844 mounted fixture was captured. Ordinary Rover/terrain appearance remains a separate gameplay route. |
| [#744](https://github.com/coldshalamov/SpaceFace/pull/744) `ui-polish-249` | Industry’s Fabricate action and its disabled reason fit at 1280×720. | Open, non-draft; the 1101px+ by 641–800px chain/foot lift is in `3ccf035b5ed3` (`stationTabsLayouts.js`). The public actor selects Industry and records the Fabricate state/reason at 1280×720 without activating it. |
| [#742](https://github.com/coldshalamov/SpaceFace/pull/742) `feat/iron-kraken-character` | Iron Kraken has authored articulation, attacks, sound, death/recovery, and recurring Swarm boss behavior. | Open, non-draft, conflicts reported. The feature is already represented in local commit `a4d85e9a` and current systems/assets. Do not duplicate or merge the PR; use [INTEGRATION_COVERAGE](./INTEGRATION_COVERAGE.md) for the remaining public wave/boss progression gap. |
| [#736](https://github.com/coldshalamov/SpaceFace/pull/736) `ui-polish-242` | At 1280×720 the Ship screen hull description stays beside the model, callouts clear readings, and fleet names fit. | Open, non-draft; the 1101–1500×≤800 blurb rule and fleet-name tracking are in `3ccf035b5ed3` (`shipLayouts.js`). The ordinary route opened F2 My Ship at 1280×720; screenshot review remains pending. |
| [#733](https://github.com/coldshalamov/SpaceFace/pull/733) `ui-polish-239` | At 960×540 the full Ship hull description stays left of hull beads and callouts. | Open, non-draft; the ≤1100×≤640 complete-blurb rule is in `3ccf035b5ed3` (`shipLayouts.js`). The ordinary route opened F2 My Ship at 960×540 and 1280×720; screenshot review remains pending. |
| [#724](https://github.com/coldshalamov/SpaceFace/pull/724) `dot/opening-reconciliation-20261031` | Connects post-Cinder work into a first real Compost feed, Buoy/47-A route outcomes, and Swarm preparation. | The PR's full branch remains stale; do not merge it wholesale. In addition to existing guide/route support, the new two-path first-feed delta (`src/systems/faction_understory.js`, `test/charon-compost-first-feed.test.mjs`) is integrated in `d87c999ea10d`. Its focused10/10 owner-component checks cover owner-only feed, regrowth and persisted partial feed state. The ordinary earned-cargo→Compost route, visible growth, and any reachable Save/Continue remain unverified; Buoy/47-A and Swarm routes are also open. |
| [#723](https://github.com/coldshalamov/SpaceFace/pull/723) `ui-polish-230` | Achievements medal name and state fit on one line at 960×540. | Open, non-draft, conflicts reported. Combined port and generated stylesheet are in `3ccf035b5ed3`. The ordinary title action opened Achievements at 960×540 and exercised category/medal selection; screenshot review remains pending. Coalesced with #711. |
| [#720](https://github.com/coldshalamov/SpaceFace/pull/720) `ui-polish-227` | Removes an obsolete Codex `:has()` selector; no visible change is claimed. | Open, non-draft. This is cleanup only: its own A/B is inconclusive and reports zero invalidations from the selector. Defer/close as low-impact cleanup; it is not a player-facing performance fix. |
| [#719](https://github.com/coldshalamov/SpaceFace/pull/719) `cw-fix-worker-tla` | Keeps localization catalog loading from blocking the simulation worker’s message handler. | Open, non-draft. Ported in `09bffde46774`: document imports still wait for English/bark catalogs, while the worker import settles and its `init` directive awaits census plus both catalogs before host initialization. Direct document-readiness/retry and real worker-entry checks pass (3/3); packaged or ordinary public boot verification remains queued. |
| [#711](https://github.com/coldshalamov/SpaceFace/pull/711) `ui-polish-219` | Achievements status phrases such as “not yet earned” do not split across lines. | Open, non-draft, conflicts reported. Combined markup/CSS/generated stylesheet are in `3ccf035b5ed3`; the ordinary category/medal interaction at 960×540 completed with #723. Screenshot review remains pending. |
| [#695](https://github.com/coldshalamov/SpaceFace/pull/695) `ui-polish-203` | Market landscape keeps commodity names, register, and Buy/Sell actions within the short viewport. | Open, non-draft. The ≤650×≤400 short-landscape fix is in `3ccf035b5ed3` (`marketLayouts.js`); the ordinary route captured 568×320 and the Market quantity check at 960×540. Screenshot review remains pending. |
| [#690](https://github.com/coldshalamov/SpaceFace/pull/690) `perf/barge-exact-touch` | Touches the mounted packaged wreck body on its exact target before the veil lifts. | Draft. Prior SwiftShader evidence is old; current `visualFactory.js`/renderer ownership has since changed. Reconcile with current packaged-body publication path after M8, then use a direct current-owner check; do not treat historical timing or a test pass as present-day speedup. |
| [#667](https://github.com/coldshalamov/SpaceFace/pull/667) `perf/veil-warm-step` | Warms bounded simulation steps and wreck shader variants behind the flight veil. | Open, non-draft, conflicts reported. Its renderer/presentation changes overlap later M8, shader, and first-picture repairs. Older smoke and warm-step numbers are not current evidence. Reassess only the still-open first-lift symptom after M8; do not reapply the old branch wholesale. |
| [#657](https://github.com/coldshalamov/SpaceFace/pull/657) `codex/coherent-flight-and-pilots` | Repairs close-flight stopping, pilot steering/arrival, worker job ownership, collision response, and contextual docking. | Draft, conflicts reported. The PR itself records public acceptance as incomplete; its many flight, AI, physics, input, and worker files overlap current fixes. Use it as a defect index, not a merge candidate. Reproduce a remaining named player symptom on current source and port only its canonical-owner fix. |
| [#531](https://github.com/coldshalamov/SpaceFace/pull/531) `dot/rhea-shift-radio-20261023` | Rhea gives a local shift recap using the existing broadcast and voice queue. | Already integrated in current source (`95aca47c66fb`); no remaining code port identified. The focused owner suite passes, including Save/Continue across return, replacement, and final loss with no casualty revival. The projection is read-only; ordinary public return/restore route and duplicate-reward behavior in a live route remain unverified. |
| [#486](https://github.com/coldshalamov/SpaceFace/pull/486) `dot/charon-colony-approach-20261022` | A real 750–500 WU approach reveals the existing Charon supply worker through a quiet Hail → SUPPLY ROUTE cue. | Already integrated in current source (`26f29b748d44`); no remaining code port identified. Focused owner tests pass for crossing/cooldown, unchanged custody, public Hail offer availability, and no approach-triggered stock mutation. Ordinary flight approach and completed public Hail interaction remain unverified. |

## Current follow-through

Use [INTEGRATION_COVERAGE](./INTEGRATION_COVERAGE.md), the three lane boards and [NOW](../NOW.md)
for current outcomes and exact writers. The PR entries above retain their source-port history;
the old numbered execution queue is superseded by the current Finish integration campaign.

- Source ports and corrected native/worker/save behavior are separate from ordinary route acceptance.
  The earned Cinderglass original return, exact450CR settlement and cold Continue now pass. Six actual
  Swarm rounds reached Kraken before the repaired frozen-clock failure; boss completion remains open.
- Current mobile source fixes radar input, Photo framing/capture/controls and compact layouts. Physical
  iPhone14 remains unknown. The old FCC stage reaches flight in desktop WebKit, then becomes unresponsive;
  the new immutablea704 stage responds through Powers/Pause/Resume with no first control failure.
  Touch capability mismatch and missing captured overlay controls remain open; the visual cause is
  being diagnosed separately from the earlier stall.
  No newer public-alias promotion is claimed.
- The current performance bars remain missed. Rejected native/AI/field/binding experiments stay rejected;
  aggregates confounded by host load do not establish a gain. Use a named changed candidate and matched
  observation rather than another unchanged timeout or endurance quota.
- Finish the remaining ordinary worksite/campaign/Circuit/boss journeys and actual audio/asset/UI looks.
  Incoming content is connected only with its canonical save, custody, event and player-facing readers;
  the new Weir repair also preserves captured ships. Six further authored rows are connected with canonical
  lifecycle, dock hand-in and actual Eris bar readers in494b; ordinary journeys remain open. Pro creation remains usage-locked and unsent.
- Run the requested final build-map and last300-commit review at the end, then the owner's three successive
  independent release reviews of a genuinely ready coherent candidate. Those reviews have not begun;
  source coverage and reviewer counts cannot independently establish completion or competitiveness.
