# PQ-021 Ship's Ledger wire-not-rebuild plan — controller revision

> **NON-AUTHORITATIVE · PLANNING-ONLY · NOT INTEGRATED**
>
> Historical handoff for controller review. This file changes no runtime, source, test, script, asset,
> manifest, save, registry, package, input, renderer, HUD, worldbuilding, or shared-program surface.
> Its maximum receipt state is `returned/planning_complete`. It must never be cited as evidence that
> PQ-021 is implemented, focused-green, route-accepted, visually accepted, or integrated.

## Packet identity and revision boundary

- Task: `SF-PORT-04` — `PQ-021`, **Wire the existing Ship's Ledger**.
- Exact audited base: `8f1c630f5ebf26f209052b8164f3cdf024ffd06f`.
- Requested/result branch: `agent/chatgpt-pq021-ledger-20260723`.
- Permitted repository output: this one historical handoff only.
- Controller-supplied coordination fact: **PQ-017 is in progress and not yet integrated.** No other
  present-tense PQ-017 fact is asserted here.
- PQ-018 and its media owner are explicit integration dependencies. Their final integrated paths,
  receipt schema, five-page catalog, admitted imagery, and route evidence must be re-read after landing.
- This revision supersedes the preceding result on the same branch. It corrects five controller-blocking
  defects: no in-flight review route; incomplete Cathedral story/media contract; an incorrect 512-record
  boundedness claim; unresolved revision conflicts; and insufficient modality/performance evidence.

Repository statements use these classes throughout:

- **VERIFIED** — inspected at the exact base and grounded in a path plus a symbol, field, or check.
- **INFERENCE** — bounded conclusion from verified evidence; not a runtime claim.
- **PROPOSAL** — future implementation choice requiring the relevant owners/controller.
- **UNKNOWN / STOP** — absent at the audited base or dependent on an unintegrated owner; implementation
  must stop rather than invent the missing contract.

The required authority sequence was followed: [CANONICAL_BUILD_MAP.md](../../../CANONICAL_BUILD_MAP.md),
[root AGENTS.md](../../../AGENTS.md), [NOW.md](../../../design/program/NOW.md),
[program-queue.json](../../../design/program/roadmap/program-queue.json), and
[00_EXECUTION_PROTOCOL.md](../../../design/program/roadmap/00_EXECUTION_PROTOCOL.md). Scoped rules were
read from [src/AGENTS.md](../../../src/AGENTS.md), [src/data/AGENTS.md](../../../src/data/AGENTS.md),
[src/systems/AGENTS.md](../../../src/systems/AGENTS.md), and
[src/ui/AGENTS.md](../../../src/ui/AGENTS.md).

---

## 1. Executive decision

**PROPOSAL — approve PQ-021 only as a two-host adapter over one projector and one upstream evidence
contract.** The minimum complete result after PQ-018 integration is:

1. PQ-018/site remains the sole writer of five independently earned Cathedral evidence receipts.
2. PQ-018/media owns the five-page catalog, short flight fragments, accepted images, prompt/source/license
   records, contact sheets, reject logs, asset IDs, and runtime admission.
3. `buildShipLedger()` remains a pure, deterministic, read-only projection over saved receipts plus the
   catalog. It adds no registry slot, subscriber, serializer, save field, or shadow archive.
4. `createShipLedgerPanel()` remains the single Ledger UI implementation. It gains host-safe IDs,
   bounded evidence detail, one-image-at-a-time rendering, and explicit focus entry/return.
5. The existing station shell mounts that panel through one lifecycle adapter and adds one destination.
6. The existing Codex mounts the same panel as a `Ledger` tab. This is the required normal in-flight
   review route: keyboard `K` or gamepad `Y/Triangle` opens the already registered, pausing Codex;
   the player selects `Ledger`; the screen manager freezes/resumes the same game path and restores focus.
7. Browser and Electron prove both hosts expose the same row IDs, selected revisions, page copy,
   provenance, and image asset IDs after natural earning and Continue.

**PROPOSAL — completion gate.** Text-only wiring can be an interim `implemented` or `focused_green`
candidate, but **PQ-021 may not be called complete, route-accepted, or integrated until all five
Cathedral pages have accepted imagery and are route-proven in both station and in-flight hosts in browser
and Electron.** Missing images must degrade accessibly, but a fallback is evidence of an incomplete media
dependency, not acceptance.

**PROPOSAL — explicit non-work.** Do not add a Ledger HUD overlay, a second Ledger screen registration,
a second data store, a Ledger registry system, a new input action, a save migration owned by PQ-021, a
second fragment queue, a station redesign, a common-style rewrite, an image manifest, a raw-URL loader,
or event-supplied prose. Do not modify `package.json`, `src/ui/input.js`, `src/systems/gamepad.js`,
`src/core/registry.js`, save-schema owners, renderer/assets/manifests, HUD files, or shared program ledgers.

---

## 2. Current-state inventory at the exact base

### 2.1 Queue and plan intent

**VERIFIED.** The `PQ-021` row in
[program-queue.json](../../../design/program/roadmap/program-queue.json) is `planned`, depends on
`PQ-018`, names `save-schema` and `hud-styles` mutexes, requires `public-route`, `save`, and
`accessibility` evidence, and says to make the existing Ledger reachable without rebuilding it or
inventing history.

**VERIFIED.** The same queue records PQ-018 as dependent on PQ-017 and describes the preserved source
candidate as not registered, placed, interactive, saved, or route-accepted. The historical source handoff
[2026-07-20-B-pq018-wreck-cathedral-source.yaml](../../../design/graphics-sprints/handoffs/2026-07-20-B-pq018-wreck-cathedral-source.yaml)
likewise says `runtime_wired: false`, `route_accepted: false`, and names later site/component, manifest,
placement, browser/Electron, and performance work. Those are exact-base historical facts, not a claim
about the concurrently owned PQ-018 result.

**VERIFIED.** The A2 section in
[design/depth-program/BUILD_PLAN.md](../../../design/depth-program/BUILD_PLAN.md) calls for a docked
Ledger, source-system read-only behavior, prose variants, cap/archive pagination, accessibility, and a
played-session screenshot. The first story package is more specific in
[06_STORY_LEDGER_AND_IMAGE_PIPELINE.md](../../../design/sequential-build-plan/ORIGINALS/spaceface_depth_playbook/06_STORY_LEDGER_AND_IMAGE_PIPELINE.md):
five Wreck Cathedral pages, 8–20-word/2–5-second flight fragments, 80–180-word stored pages, multiple
image forms, contact-sheet selection, prompt/source/license/asset-ID retention, and in-UI review.

### 2.2 Existing prose and projector

**VERIFIED.** [src/data/shipLedgerTemplates.js](../../../src/data/shipLedgerTemplates.js) exports eight
entry families — `loss`, `trade`, `rumor`, `bearing`, `unique`, `witness`, `title`, and `name` — with at
least four deterministic variants each. The narrow Cathedral summary can remain `type: 'witness'`; the
long evidence page belongs in an attached immutable detail model, not a ninth parallel log system.

**VERIFIED.** [src/systems/shipLedger.js](../../../src/systems/shipLedger.js) is explicitly a pure
projector: it has no registry slot, `init()`, subscription, serializer, or source mutation.
`buildShipLedger()` returns a recursively frozen snapshot. `makeCandidate()` derives a stable row ID from
`hash32(seed, type, sourceId)`, and final ordering is descending `at`, then cycle, then ID.

**VERIFIED.** Existing fail-closed precedents are strong: `recoveredNames()` reads only
`story.recoveredNames`; `titleRecords()` reads only `story.titlesSeen`; comments reject similarly named
generic flags. Existing tests verify speculative flags cannot fabricate names, titles, or endgame quotes.

**VERIFIED — correction to the former report.** `SHIP_LEDGER_MAX_SOURCE_RECORDS = 512` is **not a
traversal bound**. In `collectCandidates()`, `observed` increments and `add()` stops admitting/constructing
rows after the threshold, but the surrounding source loops continue traversing. `titleRecords()` also
copies and sorts its complete source array before admission. The constants bound constructed/published
output, not worst-case source traversal. No performance or complexity claim may describe the current
projector as scanning at most 512 records.

### 2.3 Existing panel and the duplicate-ID defect

**VERIFIED.** [src/ui/screens/shipLedger.js](../../../src/ui/screens/shipLedger.js) exports
`createShipLedgerPanel(ctx)`. It renders one 12-row page with `replaceChildren(fragment)`, has Newer/Older
buttons, a polite atomic status, descriptive entry labels, and local page state only. It uses
`textContent`, not raw HTML, for runtime copy.

**VERIFIED.** The panel currently hard-codes `st-ledger-title`. Because ScreenManager caches mounted
screens, a station-hosted panel and Codex-hosted panel could coexist hidden/visible in the DOM and create
duplicate fixed IDs. This must be corrected before two hosts are mounted.

**VERIFIED.** The panel returns `destroy()`, while station child screens are disposed through
`dispose()`. This is an adapter mismatch, not permission to rebuild the panel.

**VERIFIED.** The current panel renders summaries only. It has no 80–180-word evidence detail, image,
caption, alt text, provenance block, contact-sheet identity, or image-failure state.

### 2.4 Active station route

**VERIFIED.** [src/ui/station/stationScreen.js](../../../src/ui/station/stationScreen.js) mounts the live
station through `createStationApp()`. The live route is therefore
[src/ui/station/stationApp.js](../../../src/ui/station/stationApp.js), not the legacy station hub.

**VERIFIED.** `DESTINATIONS` currently contains six IDs: `market`, `shipworks`, `industry`, `contracts`,
`factions`, and `bar`. `screenFor()` lazily creates/caches a child, calls `onShow()`/`refresh()`, and calls
`dispose()` on station teardown. No Ledger destination/import exists.

**VERIFIED.** [src/ui/station/dock.js](../../../src/ui/station/dock.js) already owns the keyboard model:
real tablist semantics, roving `tabindex`, Arrow keys, Home/End, native activation, focus-visible, and
reduced-motion behavior. [src/ui/input.js](../../../src/ui/input.js) generically discovers station tabs
with `[role="tab"][data-nav]`, cycles them through LB/RB, spatially moves controller focus, and activates
the focused native button. A Ledger-specific input route would duplicate this owner.

### 2.5 Existing in-flight affordance: Codex, not HUD

**VERIFIED.** [src/ui/uiRoot.js](../../../src/ui/uiRoot.js) already registers `codexScreen` through the
normal ScreenManager module list. No new screen registration is needed.

**VERIFIED.** [src/ui/screens/codex.js](../../../src/ui/screens/codex.js) is a read-only journal/archive
screen. It currently has `Story`, `Comms`, `Graffiti`, `Figures`, `Ship`, and `Archive` tabs, but no
`Ledger` tab. Its screen is cached, it already has a shared tab/search shell, and it has three existing
story/comms/graffiti subscriptions. PQ-021 must add no fourth subscriber and must prevent those existing
subscriptions from rebuilding a hidden/active Ledger detail unnecessarily.

**VERIFIED.** [src/ui/input.js](../../../src/ui/input.js) opens `codex` from the keyboard Codex binding
(`K` on the live default route) and from `gp.actions.codex`. [src/systems/gamepad.js](../../../src/systems/gamepad.js)
maps `codex` to Y/Triangle. The Pause screen also has a Codex button in
[src/ui/screens/pause.js](../../../src/ui/screens/pause.js). Thus the concrete ordinary routes are:

```text
keyboard: flight -> K -> Codex -> Ledger tab -> entry -> evidence page
controller: flight -> Y/Triangle -> Codex -> D-pad/stick to Ledger -> A/Cross -> page
secondary: flight -> Start/Esc -> Pause -> Codex -> Ledger
```

**VERIFIED.** [src/ui/screenManager.js](../../../src/ui/screenManager.js) includes `codex` in
`PAUSING_SCREENS`, owns the aggregate time-effect pause request, caches screens once, traps focus inside
the active modal, records the opener on push, and restores that opener or a deterministic fallback on
pop. The Ledger must reuse these semantics rather than manipulating `state.mode`, `timeScale`, focus
stacks, or HUD visibility itself.

### 2.6 Existing checks that will move

**VERIFIED.** [scripts/check-depth-program-a2.mjs](../../../scripts/check-depth-program-a2.mjs) validates
template breadth, rejects projector subscriptions/emits/serializers, and runs
[test/depth-program-a2-ship-ledger.test.mjs](../../../test/depth-program-a2-ship-ledger.test.mjs). The test
already covers deterministic immutable projection, same-tick trade identity, speculative-flag rejection,
Vols gating, pagination, semantic controls, and focus transfer.

**VERIFIED.** [scripts/check-station-shell.mjs](../../../scripts/check-station-shell.mjs) enumerates the
six station destinations and guards canonical station intents. It must add Ledger reachability without
weakening existing assertions.

**VERIFIED.** [scripts/check-station-tab-navigation-runtime.mjs](../../../scripts/check-station-tab-navigation-runtime.mjs)
uses the canonical New Game route, docks through the live event path, hard-codes the six destination
order, drives pointer/keyboard navigation, checks tab semantics, reduced motion, page errors, and station
interactions. A seventh destination requires a deliberate update and a fit/text-scale check.

**VERIFIED.** `node scripts/check-input-modalities.mjs` already guards K/M/Y-era input modality and
station controller tab parity. It should be rerun, not edited, because PQ-021 adds no input mapping.

---

## 3. Architecture and one-way event/data flow

### 3.1 Single truth stream

**PROPOSAL.** There is exactly one mutable story-evidence stream, owned upstream:

```text
physical Cathedral component/action
        |
        v
PQ-018/site owner validates action and state transition
        |
        +--> existing one-voice fragment presentation reads catalog.flightFragment
        |       (8-20 words, 2-5 seconds, nonblocking, no Ledger UI)
        |
        +--> writes/updates durable evidence receipt keyed by pageId
                    |
                    v
             save/Continue owner persists it
                    |
                    v
buildShipLedger(state) reads receipt + immutable catalog
        |
        +--> immutable witness summary + evidence detail
                    |
             +------+------+
             |             |
      station adapter   Codex Ledger tab
             |             |
             +------ same panel ------+
```

The transient fragment and stored page are not independent facts. Both carry the same stable `pageId`
and resolve through the same catalog. PQ-021 neither emits the earning event nor records a second copy.

### 3.2 Upstream receipt contract

**PROPOSAL — preferred writer shape.** PQ-018 owns a direct-keyed, bounded saved map under its integrated
site record. The final path is intentionally unknown until PQ-018 lands; the semantic contract is:

```js
siteRecord.evidenceReceiptsByPageId = {
  'wreck_cathedral.missing_convoy': {
    receiptId: 'wreck_cathedral.missing_convoy',
    pageId: 'wreck_cathedral.missing_convoy',
    revision: 1,
    earnedAtS: 1842.5,
    earnedTick: 110550,
    siteRecordId: 'site_wreck_cathedral',
    componentId: 'component_navigation_record',
    operationId: 'resolve_route_record',
    stateFrom: 'sealed',
    stateTo: 'recovered',
    provenanceRef: 'site_wreck_cathedral/navigation_record/resolve_route_record',
    catalogRevision: 1
  }
}
```

Rules:

- The owner writes IDs and causal state only; no title/body/alt text/image URL is copied into save data.
- Primary behavior is update-in-place at the stable `pageId`; repeated callbacks are idempotent.
- Exactly the five approved page keys are read by direct property lookup. PQ-021 must not call
  `Object.values()` over an unbounded site evidence object.
- A defensive per-page revision list, if the integrated owner needs migration/history, is capped at four
  candidates. More than four is invalid and the page fails closed without iteration beyond the cap.
- Receipt time uses saved simulation time/tick from the owner, never wall clock.
- The site/save owner, not the Ledger, owns normalization and old-save defaults.

### 3.3 Catalog contract

**PROPOSAL.** PQ-018/media publishes one immutable catalog keyed by the same five page IDs. The Ledger
imports that one live catalog; it must not maintain a private copy.

```js
{
  id: 'wreck_cathedral.clock_stopped_first',
  threadId: 'wreck_cathedral.first_story_package',
  revision: 1,
  order: 3,
  title: 'The Clock Stopped First',
  deck: 'Recovered bridge telemetry',
  flightFragment: {
    id: 'wreck_cathedral.clock_stopped_first.fragment',
    text: 'BRIDGE CLOCK STOPPED BEFORE IMPACT. EMERGENCY POWER CONFIRMS THE GAP.',
    durationS: 3.5
  },
  body: ['...'],                 // validated total: 80-180 words
  map: { sectorId: '...', markerId: '...' },
  related: ['...'],
  evidence: ['...'],
  followUp: ['...'],
  provenance: {
    siteId: 'site_wreck_cathedral',
    componentId: '...',
    operationId: '...',
    sourceRefs: ['...']
  },
  image: {
    assetId: 'story.wreck_cathedral.clock_stopped_first.v1',
    kind: 'technical_scan',
    alt: '...',
    caption: '...',
    selectedSha256: '...',
    evidenceRef: '...'
  }
}
```

The catalog validator must reject missing title/deck/body bounds, absent provenance, fragment text outside
8–20 words, fragment duration outside 2–5 seconds, arbitrary image URLs, missing alt/caption, unknown
asset IDs, or mismatched page/catalog revision.

### 3.4 Projected row/detail contract

**PROPOSAL.** The projector reuses `type: 'witness'` for the terse list row and attaches an immutable
`evidencePage` object:

```js
{
  id: 'ledger_<hash>',                 // derived from stable pageId, not revision/copy
  type: 'witness',
  sourceId: 'cathedral:wreck_cathedral.clock_stopped_first',
  sourceKind: 'worldSite.evidenceReceipt',
  at: receipt.earnedAtS,
  text: '<existing witness-template summary>',
  evidencePage: {
    pageId,
    revision,
    title,
    deck,
    body,
    imageAssetId,
    imageAlt,
    imageCaption,
    provenance,
    map,
    related,
    evidence,
    followUp
  }
}
```

Stable public row identity is `pageId`-based. A higher accepted revision updates the same row; it never
creates a second entry. Display copy, image path, receipt order, and revision do not enter the row ID.

---

## 4. Full first Wreck Cathedral story package

**VERIFIED design source.** Section 12 of
[06_STORY_LEDGER_AND_IMAGE_PIPELINE.md](../../../design/sequential-build-plan/ORIGINALS/spaceface_depth_playbook/06_STORY_LEDGER_AND_IMAGE_PIPELINE.md)
requires this five-page thread. The table below makes the implementation gate explicit without claiming
that any trigger/content is live at the audited base.

| Stable page ID | Page/title and media form | Independently earned receipt — PQ-018 owner must bind exact live component/action | Short flight fragment contract | Stored page contract |
|---|---|---|---|---|
| `wreck_cathedral.missing_convoy` | **The Missing Convoy** — route/treasure map | Recover or resolve a physical navigation/route record at the site; rumor/proximity alone must not unlock it | Proposed 8–20 words, 2–5 s: `ROUTE RECORD: CONVOY DESTINATION OMITTED. FIVE TRANSPONDERS NEVER ARRIVED.` | 80–180 words; route provenance, known/unknown location fields, evidence list, map annotation, follow-up lead; accepted route-map image |
| `wreck_cathedral.capital_hull_located` | **Capital Hull Located** — cinematic exterior still | Complete the authoritative site-identity scan against the physical capital hull | `LONG-RANGE RETURN: CAPITAL HULL. NO ACTIVE REGISTRY.` | 80–180 words; hull/site identity, scan basis, location, related IDs; accepted exterior image showing the live silhouette language |
| `wreck_cathedral.clock_stopped_first` | **The Clock Stopped First** — technical bridge scan | Energize/stabilize the bridge/emergency relay and recover the clock telemetry | `BRIDGE CLOCK STOPPED BEFORE IMPACT. EMERGENCY POWER CONFIRMS THE GAP.` | 80–180 words; exact component/operation provenance, clock evidence, uncertainty stated; accepted technical scan |
| `wreck_cathedral.released_from_inside` | **Released From Inside** — cargo-clamp forensic evidence | Inspect and complete the canonical clamp/brace evidence state; ordinary cutting elsewhere cannot unlock it | `CARGO CLAMPS RELEASED FROM INSIDE. IMPACT CAME LATER.` | 80–180 words; clamp state, cut/release provenance, related cargo component; accepted forensic/security image |
| `wreck_cathedral.what_was_carried` | **What Was Carried** — recovered photograph or device image | Recover/deliver the canonical black box, device, or cargo evidence through its physical owner path | `FINAL TRANSMISSION ADDRESSED TO A SHIP THAT NEVER EXISTED.` | 80–180 words; recovered object provenance, known facts vs inference, related IDs/follow-up; accepted recovered-photo/device image |

The fragment text above is **PROPOSED copy derived from the existing story-pipeline examples**, not live
history. PQ-018/story ownership must approve or replace it in the shared catalog. PQ-021 must never infer
these claims from generic component names or manufacture copy when a catalog row is absent.

### 4.1 Independent earning rules

- Each page has one durable receipt. One receipt unlocks one page only.
- No New Game seeding, site proximity, catalog presence, asset presence, generic `visited` flag, or broad
  `cathedralComplete` flag unlocks a page.
- Reordering physical operations changes `earnedAtS` ordering but not identity or availability of peers.
- Destroying/extracting a component cannot arbitrarily erase unrelated pages; the integrated site owner
  must provide a physically plausible alternate receipt route or explicitly block PQ-018 acceptance.
- Flight fragments may be ignored. Objective/target state carries gameplay-critical instructions.
- The Ledger does not replay fragments on open, dock, Continue, page revision, or host switching.

### 4.2 Required image production/admission evidence per page

**PROPOSAL — PQ-018/media dependency, not a PQ-021-owned manifest.** Each of the five catalog rows must
point to an evidence packet containing all of the following before PQ-021 completion:

1. **Contact sheet** — at least four uniquely identified candidates at intended crop/aspect, with the
   contact-sheet file SHA-256 and candidate IDs/hashes.
2. **Reject ledger** — every nonselected candidate listed with a concrete rejection reason such as wrong
   scale, cartoon/pulp drift, invented text, impossible structure, identity mismatch, unreadable UI crop,
   anatomy defect, or provenance/licensing gap. Silence is not a reject record.
3. **Selected artifact** — stable asset ID, repository/runtime path supplied by the admitted media owner,
   SHA-256, dimensions, color profile, crop, compression, and selected candidate ID.
4. **Prompt/source record** — full positive prompt, negative controls, tool/model/version, seed/reference
   IDs where available, source/in-engine capture references, and the exact revision that produced the file.
5. **License/provenance** — generator/source terms or source license, creator/agent, creation date, permitted
   use, derivative/source references, and any restrictions. Unknown rights fail admission.
6. **Accessible semantics** — human-authored alt text and caption describing the evidence, not merely
   `image of wreck`; no gameplay-critical generated text baked into the image.
7. **Admission proof** — asset ID resolves through the live packaged path; no arbitrary URL, data URI,
   local absolute path, or silent placeholder.
8. **Actual-size review** — screenshot/contact proof in both Ledger hosts at supported text scale and
   viewport, plus browser and Electron `naturalWidth > 0`, HTTP/file load success, no fallback, and no
   crop that hides the evidence.
9. **Independent visual decision** — selected exact hash is accepted against the grounded cinematic/
   forensic/technical direction. A contact sheet, source image, or technically loaded file alone is not
   acceptance.

The image-generation direction from the source plan remains applicable: photoreal/industrial-documentary
or forensic/technical imagery; physically plausible materials, scale, lighting, and lenses; no comic,
pulp, painted-cover, toy, glowing-fantasy, generated-label, or intact-ship-rotated-as-wreck substitute.

### 4.3 Text-only boundary

A text-only implementation must:

- retain image alt/caption placeholders without showing a fake accepted asset;
- render an explicit accessible `Evidence image not admitted` state;
- pass no visual/media completion gate;
- remain at most `implemented`/`focused_green` depending on checks;
- block `route_accepted` and `integrated` until five accepted images pass browser/Electron in both hosts.

---

## 5. Deterministic revision, dedupe, and fail-closed selection

### 5.1 Primary writer rule

**PROPOSAL.** The PQ-018 owner updates one canonical receipt in place at
`evidenceReceiptsByPageId[pageId]`. Replaying the same causal event is idempotent and does not append.
A revision may increase only when the upstream owner changes the authoritative interpretation/catalog
revision while retaining the same `pageId`.

### 5.2 Defensive selection algorithm

The projector must defensively handle a bounded per-page revision list without depending on iteration
order:

```text
for each of the five literal page IDs:
  direct-read source[pageId]
  normalize to one candidate or a list of <= 4 candidates
  reject candidates with wrong pageId, invalid revision, unknown catalog revision,
    invalid receipt identity, non-finite saved time/tick, or provenance mismatch
  maxRevision = maximum valid revision
  winners = valid candidates at maxRevision
  canonicalize immutable causal fields and hash/compare them
  if winners are byte-equivalent: collapse to one
  if winners differ at the same max revision: omit this page and record conflict diagnostic
  resolve the matching catalog revision
  publish one row whose sourceId depends only on pageId
```

Lower valid revisions are superseded. A same-revision causal conflict is never resolved by array order,
last write, lexical display copy, or wall time. It fails closed: no page, no fragment replay, no fabricated
merger. The acceptance run must treat any conflict diagnostic as a hard failure.

### 5.3 Required deterministic tests

Add tests that:

- shuffle the same revision set through many permutations and produce byte-identical models/IDs;
- duplicate an identical winner at the same revision and collapse it exactly once;
- provide two different same-revision winners and produce no page plus one conflict diagnostic;
- provide lower and higher revisions in every order and select the highest valid revision;
- provide an invalid higher revision and select the highest remaining valid revision only if validation
  explicitly permits that behavior; otherwise fail the page closed — choose and pin one rule;
- serialize/parse the complete state and prove `buildShipLedger(before) === buildShipLedger(after)`;
- save, Continue, reopen station and Codex, and prove the same five row IDs, revisions, text, provenance,
  and image asset IDs;
- switch station/Codex hosts repeatedly and prove no duplicate row or second earning event appears.

---

## 6. Bounded traversal, selection fairness, and performance

### 6.1 New Cathedral family: hard bound by construction

**PROPOSAL.** The new family performs exactly five direct page-key lookups. It never enumerates the
container. Each optional per-page revision list is capped at four before iteration. Therefore the new
family examines at most 20 receipt candidates and constructs at most five rows, regardless of unrelated
properties in the site record.

If the integrated PQ-018 contract offers only an unbounded append-only array or requires a full-object
scan to locate the five receipts, PQ-021 stops and requests a direct-keyed/bounded adapter from the owner.
It must not disguise a new unbounded source behind the existing 512 admission constant.

### 6.2 Existing wider projector: truthful boundary

The current legacy collectors remain source-length-dependent. The future check must report separately:

- records traversed by each existing family where instrumentable;
- candidates admitted/constructed;
- rows retained/published;
- Cathedral direct lookups/revision candidates;
- projection timing and heap delta.

No report may call legacy traversal bounded unless the wider projector is actually repaired and its
writer-order assumptions are proven.

### 6.3 Contingent wider-projector repair

**PROPOSAL — only if profiling or starvation tests force it.** A wider repair stays inside
`src/systems/shipLedger.js` and the existing A2 test/check paths, but it must not use one fixed-order
512-admission loop. Stable cross-family selection would be:

1. Each source family produces a source-order-correct bounded newest-candidate list under an explicit
   writer/order contract. Do not guess head-vs-tail ordering.
2. Reserve a small deterministic floor for every nonempty family so early high-volume families cannot
   starve names, titles, or Cathedral evidence.
3. Fill the remaining global candidate budget by the existing global order key
   `(at desc, cycle desc, id asc)` across all family leftovers.
4. Apply the 240-entry publication cap after the fair merge, then page.
5. Pin pre-repair ordinary-state output where the old and new budgets do not bind; record deliberate
   output differences only for formerly starved/oversized cases.

This contingent repair is not authorized merely because it looks cleaner. Trigger it only on a reproduced
performance/starvation defect and retain comparison evidence.

### 6.4 Required performance proof

`check-depth-program-a2` and the route probe must add these measurements:

- **Supported max-source projection:** 512 admitted legacy candidates plus all five Cathedral pages and
  the maximum four defensive revisions per page; warm then run at least 1,000 projections; record median,
  p95, maximum, and heap delta. Candidate p95 must be no worse than `max(5 ms, 1.25 × the same-state
  baseline without Cathedral)` and Cathedral incremental p95 must be <= 1 ms on the acceptance machine.
- **Large new-source adversary:** a Cathedral receipt object with very many unrelated keys must not change
  the five direct-lookup count or materially change projection time; an over-cap per-page revision list
  fails closed without walking beyond four candidates.
- **Host-open performance:** after image cache warm-up, 20 station and 20 Codex Ledger opens; p95 from
  activation to first composed Ledger frame <= 33.4 ms; no Long Task >= 50 ms attributable to Ledger.
- **Visible DOM bound:** at most 12 list rows, one detail page, and one `<img>` in the visible host.
  Hidden hosts retain no detail image source or expanded detail subtree.
- **Image/network bound:** only the opened evidence page requests an image; switching pages cancels/releases
  the prior element; hidden/reopened hosts do not refetch an unchanged accepted asset after cache warm-up.
- **Stable nodes/listeners:** after warm mount, repeated station/Codex cycles do not increase Ledger host,
  row, detail, image, DOM-listener, timer, RAF, MutationObserver, or bus-listener counts.
- **No hidden refresh:** while a Ledger host is hidden for 300 rendered frames and while station periodic
  status refresh runs, MutationObserver sees zero Ledger DOM changes and the route probe observes zero
  new image requests or projector-triggered visible work.

Performance failure is repaired through bounded work, caching, DOM reuse, and image lifecycle. Do not
reduce page count, omit accepted imagery, lower default quality, or hide evidence to pass.

---

## 7. Same-panel two-host UI design

### 7.1 Host-safe panel API

**PROPOSAL.** Extend the existing factory without forking it:

```js
createShipLedgerPanel(ctx, {
  hostId: 'station-ledger' | 'codex-ledger',
  headingLevel: 2,
  showIntro: true
})
```

- Production callers must pass a stable unique `hostId`.
- Every DOM ID derives from that host ID: title, status, list, archive nav, detail title, and image caption.
- The root carries `data-ledger-host` and `data-ledger-host-id`.
- Data identity (`pageId`, row ID) never uses host ID; both hosts show the same model.
- A DOM contract test mounts both hosts simultaneously and asserts every `[id]` value is unique.

### 7.2 Bounded list/detail behavior

- Keep the existing 12-row page and Newer/Older controls.
- Evidence rows expose one native `Open evidence` button; summaries remain terse.
- Opening detail replaces/occupies one bounded detail region inside the same panel, not a new modal.
- Detail renders title, deck, one accepted image, caption, alt semantics, 80–180-word body, provenance,
  location/map reference, evidence list, related IDs, and follow-up lead.
- `Back to entries` restores focus to the exact opener when connected; otherwise it focuses the first
  visible evidence row or page navigation deterministically.
- `onHide()` collapses detail, removes image `src`/detail subtree, and retains only bounded list/page state.
- Image `load`/`error` listeners are attached once per created image and removed with that image; no bus
  listener or global document listener is added.
- Image failure shows the catalog alt/caption plus an explicit nonaccepted state; it never silently swaps
  a generic picture.
- Panel-owned styling, if needed, is injected once under a unique style ID and scoped under
  `[data-ledger-host]`; no shared stylesheet path is required.

### 7.3 Station host

Add one adapter at `src/ui/station/screens/ledger.js`:

```text
create panel once with hostId='station-ledger'
return { el, onShow, onHide, refresh, dispose }
map panel.destroy() to dispose()
```

`stationApp.js` imports the adapter and adds one destination, proposed label `Ledger`, reusing an existing
icon name rather than editing the icon family. Add a HELP entry. The adapter forwards only explicit
station lifecycle calls; the existing station periodic refresh already avoids rebuilding child operation
screens and must remain so.

The seventh tile must be tested at the supported desktop viewport, the narrow station breakpoint, and
increased UI/text scale. If it clips or collapses, stop and request the station-style owner; PQ-021 does
not opportunistically rewrite protected styles.

### 7.4 In-flight Codex host

Add `Ledger` to the existing Codex tabs and mount the same panel once with `hostId='codex-ledger'`.

- No new ScreenManager entry and no Ledger HUD element.
- K and Y/Triangle continue to open `codex`; Pause -> Codex remains a secondary route.
- On `Ledger`, Codex hides its unrelated search/unlock-status chrome and appends the existing panel.
- Existing Codex story/comms/graffiti subscribers remain exactly the same count. Their callback must skip
  full Codex rerender while `Ledger` is active; the Ledger refreshes only on explicit `onShow`, host/tab
  activation, page navigation, or controller-approved refresh.
- Switching away calls panel `onHide()`; returning calls `onShow()` and obtains the latest saved model.
- The Codex close path remains `screenManager.popScreen()`.

### 7.5 Pause and focus semantics

No Pause source change is required. Required traces:

- **Direct keyboard:** focus starts outside modal; press K; Codex opens and sim pause request activates;
  Tab/Shift-Tab reaches Ledger; Enter activates; entry/detail controls are reachable; Escape closes;
  modal focus clears/restores appropriately and flight resumes exactly once.
- **Direct gamepad:** press Y/Triangle; use D-pad/stick to Ledger; A/Cross activates tab, entry, and Back;
  B/Circle closes Codex; flight resumes exactly once.
- **Pause route:** Esc/Start -> Pause -> focus Codex button -> open Codex -> Ledger; closing Codex restores
  focus to the Pause Codex opener; closing Pause restores flight.
- While Codex/Ledger is topmost, fixed-step tick/simTime does not advance; cosmetic transition timing may.
- The Ledger itself never writes `state.mode`, `timeScale`, screen stack, opener focus, or HUD state.

---

## 8. Exact future PQ-021 write set

**PROPOSAL — ten paths, after the dependencies and leases are explicit.** No other PQ-021 write is
pre-authorized.

| # | Exact path | Narrow responsibility |
|---|---|---|
| 1 | `src/systems/shipLedger.js` | Direct-keyed five-page collector; catalog resolution; bounded revision selector; conflict diagnostics; immutable evidence detail; truthful traversal diagnostics |
| 2 | `src/ui/screens/shipLedger.js` | Host-ID-safe single panel; bounded list/detail; one-image lifecycle; focus return; onHide cleanup; scoped one-time style if necessary |
| 3 | `src/ui/station/screens/ledger.js` **new** | Station lifecycle adapter only; no data or alternate UI logic |
| 4 | `src/ui/station/stationApp.js` | One Ledger destination/import/help row; reuse existing icon/input/station owners |
| 5 | `src/ui/screens/codex.js` | One Ledger tab mounting the same panel; no new subscriber; guard unrelated hidden refresh |
| 6 | `test/depth-program-a2-ship-ledger.test.mjs` | Five-page gating, fabricated/unearned negatives, revision/shuffle/conflict, Continue equivalence, two-host IDs/focus/DOM/image caps |
| 7 | `scripts/check-depth-program-a2.mjs` | Extend policy scan to new collector/panel/adapters; max-source and large-source projection measurement; no subscription/writer assertions |
| 8 | `scripts/check-station-shell.mjs` | Add Ledger destination/adapter contract while preserving all existing station-owner assertions |
| 9 | `scripts/check-station-tab-navigation-runtime.mjs` | Update authored order to seven destinations; station pointer/keyboard/gamepad fit and Ledger route assertions |
| 10 | `scripts/check-pq021-ledger-route.mjs` **new** | One shared browser/Electron harness: natural earn -> fragment -> save/Continue -> Codex/station parity; modality traces; focus/pause; asset loads; node/listener/perf evidence |

No `package.json` entry is required; the new route harness runs directly with `node` and supports
`--browser` and `--electron`. No input, gamepad, ScreenManager, uiRoot registration, save, schema,
registry, shared style, icon, HUD, asset, manifest, renderer, or program-ledger path belongs to PQ-021.

### 8.1 Explicit upstream dependency delivery — outside the PQ-021 write set

PQ-018/site and its media owner must already have integrated, reviewed paths for:

- the direct-keyed durable receipt collection and save/Continue behavior;
- the immutable five-page catalog with exact page/component/action/provenance IDs;
- the existing one-voice short-fragment presentation and exact-once behavior;
- all five accepted runtime images and their contact-sheet/reject/prompt/source/license/asset-ID packets;
- browser/Electron asset admission and player-route evidence.

If those owners request PQ-021 to author their receipts/catalog/media as a convenience, reject the scope
transfer and return an integration request. The Ledger cannot be the writer of the evidence it displays.

---

## 9. Mutex, dependency, and collision analysis

### 9.1 Dependencies

```text
PQ-017 integrated contract
        -> PQ-018 integrated site/component/receipt/media contract
                -> PQ-021 implementation
```

This packet repeats no unverified PQ-017 detail. PQ-021 implementation begins only after the controller
provides the integrated PQ-018 commit and exact owner paths.

### 9.2 Semantic mutexes

- **Site/save writer:** PQ-018/site/save owner only. PQ-021 reads.
- **Media admission:** PQ-018/media/asset owner only. PQ-021 resolves stable asset IDs.
- **Station shell:** one writer across `stationApp.js` and its route probes.
- **Codex/common modal UI:** one writer across `codex.js`; coordinate with active menu/UI work.
- **Browser/Electron evidence:** one route owner; no competing ports/profiles/GPU sessions.
- **Git index/commit:** integrator only in the implementation session.

The queue's `save-schema` and `hud-styles` mutexes remain coordination warnings, but the proposed PQ-021
diff does not write either domain. If the integrated dependency forces a schema or common-style change,
that owner lands it first; PQ-021 re-audits rather than crossing the mutex.

### 9.3 Path collisions

- `src/ui/station/stationApp.js` and `scripts/check-station-tab-navigation-runtime.mjs` are active station
  surfaces; any dirty/leased change is a stop.
- `src/ui/screens/codex.js` is a shared in-flight/menu journal; any concurrent Codex/archive owner is a
  stop or serialization request.
- `src/ui/screens/shipLedger.js` is currently unwired but is the one implementation; do not create
  `ledger2`, a station copy, or Codex-specific renderer.
- The new route harness must reuse existing Playwright server/Electron launch helpers, not own package or
  launcher policy.

### 9.4 Collision-safe simplifications

- Reuse `witness` summaries; no template taxonomy change.
- Reuse Codex registration and K/Y/Pause routes; no uiRoot/input/gamepad edit.
- Reuse station tab/gamepad behavior; no input edit.
- Reuse one panel and one projector; no host-specific data paths.
- Reuse an existing station icon; no icon/style family edit.
- Consume upstream media IDs; no image manifest or loader.

---

## 10. Determinism, single-writer, save, accessibility, and performance constraints

### 10.1 Determinism

- No `Math.random()`, `Date.now()`, locale-dependent identity, DOM order, request completion order, or
  host ID in receipt/page/row selection.
- Template selection remains seeded by saved game seed and stable source ID.
- Page revision selection is order-independent and conflict-fail-closed.
- Ordering remains saved `earnedAtS`, cycle, then stable row ID.
- Image load timing never changes which page is present or its identity.
- Run `npm run check:sim:compare`; expected goldens remain untouched.

### 10.2 Single writer

- PQ-018/site writes receipt state.
- Save owner persists/normalizes it.
- Media owner admits image assets/catalog.
- Existing one-voice presentation displays short fragments.
- Ledger projector reads and freezes.
- Panel reads and manages only local page/detail/focus state.
- Neither host emits gameplay, economy, cargo, reputation, site, save, or receipt mutations.

An `audio:cue` for native UI activation is presentation-only and must not become a Ledger event bus.

### 10.3 Save and Continue

- No PQ-021 save field or migration.
- Old saves without receipts produce zero Cathedral pages and no error.
- Integrated PQ-018 receipt defaults and bounds must survive normalization.
- Continue produces byte-equivalent selected pages and stable IDs.
- Higher catalog revision without a compatible saved receipt does not retroactively invent a page.
- A missing/unknown receipt or catalog row fails closed and is surfaced in test diagnostics, not player
  prose.

### 10.4 Accessibility and modality

- Native buttons for tabs, rows, Newer/Older, Open evidence, and Back.
- Unique `aria-labelledby`/`aria-describedby` IDs per host.
- Page status remains polite/atomic; image has human alt and visible caption.
- Provenance and status are text/non-color; no meaning depends only on image, hue, animation, or tiny type.
- Increased text/UI scale does not clip station tab, list, detail, provenance, or controls.
- Reduced motion preserves all information and removes nonessential host/page transitions.
- Keyboard and gamepad traces are captured, not inferred from source patterns.
- Focus enters the active modal/panel, remains trapped by ScreenManager, returns to detail opener/list,
  returns to Pause opener when nested, and leaves modal cleanly to flight.

### 10.5 UI/image performance

- No idle RAF, interval, timer, bus subscription, document listener, or background image preloader.
- One projector build on explicit host activation/refresh, not every render frame.
- One visible image maximum; hidden details release image source/subtree.
- Existing 12/24/240 row/page caps remain unless evidence proves a better bounded value.
- No visual/content deletion to pass a performance gate.

---

## 11. Adversarial failure modes and required negative tests

| Failure | Required fail-closed behavior/test |
|---|---|
| Catalog has five pages but no receipts | zero Cathedral rows; catalog presence never unlocks history |
| New Game generic `visitedCathedral`, `cathedralComplete`, or similarly named flag | zero Cathedral rows |
| Receipt has unknown page ID | omitted; diagnostic; no humanized invented page |
| Receipt page exists but exact catalog revision is missing | omitted; diagnostic; no stale body/image substitution |
| Image file exists but receipt is absent | no page and no image request |
| Receipt contains raw title/body/image URL | ignore display payload; resolve only catalog IDs |
| Receipt has nonfinite/negative time or wrong site/component/action provenance | omitted |
| Repeated same causal callback | one canonical receipt, one row, one fragment presentation |
| Identical same-revision duplicate | deterministic collapse to one |
| Different same-revision duplicate | page omitted; hard conflict failure |
| Higher revision in shuffled order | same selected model/ID in every permutation |
| More than four revisions for one page | fail that page before unbounded traversal |
| Huge unrelated evidence object | five literal lookups only; no enumeration/time growth attributable to key count |
| One early high-volume legacy family reaches admission cap | Cathedral/name/title starvation test exposes the current behavior; contingent fair merge required before acceptance if reproduced |
| Station and Codex both mounted | no duplicate DOM IDs; same data IDs; max two bounded host roots |
| Repeated station/Codex open/close | listener/node/image/timer/RAF counts stable |
| Hidden host during 300 frames/periodic station refresh | zero Ledger DOM mutation/image request |
| Image 404/decoder failure/browser-only path | accessible failure state; media acceptance fails; no generic fallback |
| Browser image loads, Electron fails | parity gate fails; no route acceptance |
| K/Y opens Codex while flight advances | pause gate fails |
| Closing nested Codex loses Pause opener or resumes sim early | focus/pause gate fails |
| Gamepad can open Codex but cannot reach page controls | modality gate fails |
| Text-only five pages | interim only; completion gate fails |
| Five accepted images exist but only one page is naturally earnable | completion gate fails |
| State injection is the only earning proof | public-route gate fails |
| Page body under 80 or over 180 words; fragment outside 8–20 words/2–5 s | catalog validation fails |
| Contact sheet has no reject log, prompt, source/license, selected hash, or asset ID | media dependency incomplete |

---

## 12. Phased implementation plan with stop conditions

### Phase 0 — dependency and path preflight

1. Confirm exact HEAD, clean/foreign diffs, branch/worktree, and active leases.
2. Read the integrated PQ-018 receipt/catalog/media owner paths and checks.
3. Verify five direct page IDs, durable saved receipts, exact triggers, fragment owner, image IDs, and
   complete media evidence packets.
4. Freeze the ten-path PQ-021 write set and browser/Electron evidence mutex.

**STOP** if PQ-018 is not integrated, fewer than five page contracts exist, any image lacks admission
provenance, the receipt source is unbounded/ambiguous, or an expected PQ-021 path is dirty/leased.

### Phase 1 — characterization and red tests

1. Pin current projector output for ordinary state.
2. Add failing tests for five earned pages, unearned/fabricated rejection, revision shuffle/conflict,
   Continue equivalence, dual-host IDs, and image/detail caps.
3. Add runtime red proving station has no Ledger destination and Codex has no Ledger tab.
4. Capture baseline projection/host-open metrics and listener/node counts.

**STOP** if a current route already satisfies the requirement through another live owner; reclassify rather
than duplicate it.

### Phase 2 — pure projection

1. Add five literal direct-key lookups and bounded revision selection.
2. Resolve catalog rows and publish immutable witness detail.
3. Add diagnostics without player-facing invented copy.
4. Run pure tests and max/large-source performance measurement.

**STOP** on same-revision conflict, catalog/receipt mismatch, regression of existing ordinary-state rows,
or performance threshold failure.

### Phase 3 — single panel hardening

1. Add host-safe IDs and two-host DOM contract.
2. Add bounded list/detail, one-image lifecycle, accessible fallback, and focus restoration.
3. Add explicit `onHide()` cleanup and one-time scoped style only if required.
4. Prove no subscriptions/writers/global listeners/idle work.

**STOP** if a separate station/Codex panel appears necessary; repair the adapter contract instead.

### Phase 4 — station adapter

1. Add `src/ui/station/screens/ledger.js`.
2. Add one station destination/help row.
3. Update station contract/runtime checks to seven destinations.
4. Verify pointer, keyboard, gamepad, reduced motion, text scale, viewport fit, and teardown.

**STOP** on station-style collision/clipping; return a measured shared-change request to the style owner.

### Phase 5 — Codex in-flight host

1. Add the Ledger tab and mount the same panel once.
2. Keep existing subscriber count; guard unrelated rerenders while Ledger is active.
3. Verify K, Y/Triangle, and Pause->Codex routes.
4. Verify aggregate pause/resume and focus entry/return.

**STOP** if the route requires uiRoot/input/gamepad/ScreenManager changes. Re-audit the live owner first.

### Phase 6 — natural five-page route, save, and media evidence

1. Through ordinary game inputs, earn page 1–5 independently; observe each short fragment exactly once.
2. Ignore fragments and continue gameplay to prove nonblocking behavior.
3. Save and Continue.
4. Open in-flight Codex Ledger and station Ledger; compare IDs/revisions/copy/provenance/image IDs.
5. Capture actual-size browser evidence and repeat the same route in Electron.
6. Run listener/node/hidden-refresh/image/network/performance probes.

**STOP** if any page needs state injection as primary evidence, any image falls back, hosts differ, Continue
differs, modality/focus fails, or performance/cleanup fails.

### Phase 7 — integration handoff

Return the bounded implementation commit(s), exact checks/artifacts, upstream dependency commit, remaining
failures, and no status promotion. The controller/integrator alone updates queue/acceptance/receipts.

---

## 13. Focused checks and exact player-route evidence

### 13.1 Required commands

```text
npm run check:depth-program:a2
npm run check:station-shell
npm run check:station-tabs
node scripts/check-input-modalities.mjs
node scripts/check-ui-screen-imports.mjs
npm run check:ui-a11y
npm run check:wcag-contrast
npm run check:ui:perf
npm run check:save-schema
npm run check:sim:compare
node scripts/check-pq021-ledger-route.mjs --browser
node scripts/check-pq021-ledger-route.mjs --electron
git diff --check
git status --short
```

Run the narrow A2/kernel checks first, then route and risk-triggered checks. A failed command remains in the
receipt with attribution; a later subset does not erase it.

### 13.2 Browser route — ordinary inputs, no hidden primary shortcut

```text
canonical root URL -> New Game -> Launch
-> obtain the integrated Cathedral rumor/bearing through the public owner route
-> travel/approach/scan the physical site
-> perform the five exact component/action conditions naturally
-> for each: observe one 8-20-word fragment for 2-5 s; do not click/read it; continue control
-> Save -> Continue
-> keyboard K -> Codex -> Ledger -> open all five evidence pages
-> verify accepted image, alt/caption, 80-180 words, provenance, IDs, page controls
-> close Codex; verify focus/modal cleanup and sim resumes once
-> gamepad Y/Triangle -> Codex -> Ledger -> A/Cross page/Back -> B/Circle close
-> dock through the ordinary prompt -> station Ledger via pointer, keyboard, and LB/RB+A
-> compare the five station models with the in-flight models
-> cycle both hosts 20 times and collect perf/listener/node/image evidence
```

A separate diagnostic seed may accelerate reproduction only after the natural route is captured and must
be labeled supporting evidence, not the public-route proof.

### 13.3 Electron route

Use the canonical Electron root with no query flags, following the existing Playwright Electron pattern in
[scripts/check-career-ladders-electron.mjs](../../../scripts/check-career-ladders-electron.mjs). Repeat the
same earning, Continue, K/Y Codex, station, image, focus, pause, and parity assertions. Record origin,
commit, asset responses, natural dimensions, page errors, console errors, screenshots, and metrics.

### 13.4 Evidence artifact shape

```text
.devshots/pq021-ledger/
  browser-route.json
  electron-route.json
  projection-performance.json
  listener-node-lifecycle.json
  01-fragment-missing-convoy.png
  02-fragment-capital-hull.png
  03-fragment-clock.png
  04-fragment-clamps.png
  05-fragment-carried.png
  browser-codex-five-pages.png
  browser-station-five-pages.png
  electron-codex-five-pages.png
  electron-station-five-pages.png
  page-01-detail-browser.png ... page-05-detail-browser.png
  page-01-detail-electron.png ... page-05-detail-electron.png
  save-continue-equivalence.json
```

These are future evidence paths, not artifacts produced by this planning packet.

---

## 14. Unresolved questions

1. **UNKNOWN / STOP:** exact integrated PQ-018 site-record path and receipt writer symbol.
2. **UNKNOWN / STOP:** exact catalog module/path, validator, and catalog revision policy.
3. **UNKNOWN / STOP:** exact live component/action IDs for the five page triggers.
4. **UNKNOWN / STOP:** exact one-voice fragment presentation owner and its duration/dedupe API.
5. **UNKNOWN / STOP:** final five image asset IDs, repository/runtime paths, selected hashes, licenses,
   contact sheets, reject logs, and independent visual decisions.
6. **UNKNOWN:** whether the media owner chooses recovered photo or device image for page five; either is
   allowed only with matching physical provenance.
7. **UNKNOWN:** whether lower invalid revisions are ignored or invalidate the whole page. Pick one
   fail-closed rule and pin it before implementation.
8. **UNKNOWN:** final station destination order/label after the seventh tile fit test. Preserve the live
   shell; do not assume a style change.
9. **UNKNOWN:** measured clean-base projection/host-open budgets on the acceptance hardware. The proposed
   thresholds must be recorded with the machine/runtime identity.
10. **UNKNOWN:** whether any integrated upstream image uses an in-engine capture rather than generated
    imagery. Both are valid only with source/provenance/license and actual-size acceptance.

---

## 15. Controller-ready acceptance checklist

### Dependency and ownership

- [ ] Exact PQ-018 integrated commit identified and inspected.
- [ ] PQ-017 statement remains limited to the controller-supplied `in progress / not integrated` fact.
- [ ] Site/save writer, fragment presenter, catalog owner, and media admission owner are explicit.
- [ ] All five page triggers, receipt keys, catalog rows, image IDs, and provenance records exist.
- [ ] Ten-path PQ-021 write set is leased and clean; no protected path is added.

### One data path and five-page package

- [ ] Physical action -> one durable receipt -> one short fragment -> one stored page uses the same page ID.
- [ ] All five pages are independently earnable through ordinary input.
- [ ] Fragment is 8–20 words and 2–5 seconds; page body is 80–180 words.
- [ ] No catalog/asset/generic flag/unearned state fabricates a page.
- [ ] Text-only state is labeled interim and cannot pass completion.
- [ ] Five accepted images have contact sheet, rejects, prompt/source, license, asset ID/hash, alt/caption,
      actual-size review, and browser/Electron admission.

### Projection, revisions, and save

- [ ] Projector remains unregistered, unsubscribed, serializer-free, and read-only.
- [ ] New family performs five direct lookups and <=20 defensive revision inspections.
- [ ] 512 is reported only as current admission/construction policy, not traversal bound.
- [ ] Same-revision conflicts fail closed; identical duplicates collapse; highest valid revision is order-independent.
- [ ] Stable row ID depends on page ID, not revision, host, order, copy, or image URL.
- [ ] Shuffled-order and Continue equivalence tests are green.
- [ ] Existing families and goldens remain intentional and explained.

### Station and in-flight routes

- [ ] Station adapter mounts the existing panel and maps lifecycle correctly.
- [ ] Codex Ledger tab mounts the same panel; no second ScreenManager entry or HUD overlay exists.
- [ ] Both host IDs produce unique DOM IDs while data IDs remain identical.
- [ ] Keyboard K and gamepad Y/Triangle route to Codex Ledger through normal ScreenManager behavior.
- [ ] Pause -> Codex -> Ledger route returns focus to the Pause opener.
- [ ] Codex pauses/resumes sim exactly once; Ledger writes no mode/time/focus/HUD state.
- [ ] Station pointer/keyboard/gamepad route is captured with seven-tab fit and text-scale evidence.

### Accessibility, images, and performance

- [ ] Native controls, unique labels, polite status, alt/caption, visible provenance, and non-color meaning pass.
- [ ] Reduced motion and increased text scale retain all information and operability.
- [ ] Visible host has <=12 rows, <=1 detail, <=1 image; hidden hosts release detail image/subtree.
- [ ] Max-source, large-source, host-open, Long Task, heap, and image-request metrics pass.
- [ ] Listener/node/timer/RAF/observer counts remain stable across repeated station/Codex cycles.
- [ ] Hidden hosts perform no DOM/image refresh work.
- [ ] Browser and Electron load the exact accepted image hashes without fallback or errors.

### Status honesty

- [ ] Focused checks are current at the result commit.
- [ ] Natural browser and Electron routes are current and hash/commit-bound.
- [ ] No injected-state-only, source-pattern-only, contact-sheet-only, or turntable-only evidence is promoted.
- [ ] Queue/acceptance/receipt updates are left to the controller/integrator.
- [ ] Highest claimed state matches evidence; no premature `implemented`, `focused_green`,
      `route_accepted`, or `integrated` language appears in the worker receipt.

---

## 16. Planning receipt

```yaml
taskId: SF-PORT-04
packet: PQ-021
title: "Ship's Ledger wire-not-rebuild plan"
state: returned/planning_complete
authority: non-authoritative
mode: planning-only
integration: not-integrated
baseCommit: 8f1c630f5ebf26f209052b8164f3cdf024ffd06f
requestedBranch: agent/chatgpt-pq021-ledger-20260723
changedFiles:
  - docs/handoffs/chatgpt-portfolio-20260723/PQ021_SHIPS_LEDGER_WIRING_PLAN.md
implementedClaim: false
focusedGreenClaim: false
routeAcceptedClaim: false
integratedClaim: false
pq017CurrentClaim: "Controller-supplied only: in progress and not yet integrated."
correctionsClosedInPlan:
  - normal in-flight Codex Ledger route using the same projector and panel
  - five independently earned Cathedral pages plus complete media evidence dependency
  - truthful 512 admission-vs-traversal boundary and bounded new-family lookups
  - deterministic revision/dedupe/conflict/Continue contract
  - Ledger-specific browser/Electron modality, focus, pause, asset, lifecycle, and performance proof
unresolvedRisks:
  - integrated PQ-018 receipt/catalog/media paths and exact trigger IDs are not yet known to this packet
  - five image hashes/licenses/admission decisions are upstream deliverables
  - station seventh-tile fit and clean-base performance thresholds require measured route evidence
```
