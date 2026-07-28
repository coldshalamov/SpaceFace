<!-- PROGRAM_EVIDENCE_RECEIPT
packetId: PQ-021
leafId: PQ-021.phase4-route
acceptance: focused_green
disposition: PASS
candidateCommit: 137ac3bc25104a26038c4bb9a5ffd1bc89ceb333
-->

# PQ-021 Phase 4 — natural earning, Continue, media, host parity

```yaml
packet: PQ-021
leaf: PQ-021.phase4-route
scope: Phase 4 (natural earning, cold Continue, host parity, media at crop, accessibility,
       hidden/reopen cleanup) plus write-set item 10 (route harness + broker manifest)
baseCommit: c6d83fe4
candidateCommit: 137ac3bc25104a26038c4bb9a5ffd1bc89ceb333
branch: claude/pq021-phase4-20260728
lifecycleClaim: implemented
acceptanceClaim: focused_green
disposition: PASS
```

The branch tip is the commit that adds this receipt; `candidateCommit` is the final code commit it
describes.

## Ruling that shapes everything below: where "natural" ends

The packet's L3 rule is natural earning, not state injection, and the mission preferred a live-UI
earning route "if achievable headlessly." **It is not**, and that is a finding rather than a
shortfall. Earning through the UI needs New Game → traverse to `sector_ceres_belt` → locate the site
at local (300, 2700) → hold the industrial beam through thresholds 48/24/20/28/36/30 at ~18 dps →
tow a 140-mass payload into the receiver. Inside a bounded headless run that is reachable only by
teleporting the player or inflating beam dps — which is precisely the state injection the rule
forbids. Faking the *route* to claim the *rule* would be worse than not claiming it.

So the split is: **earning is proven at the ordinary operation API; the live-UI route is scoped to
reading.** Both halves are built, and the reading half is now also *proven* — see claim 6. The
broker acceptance cell (`pq021-ledger-route`) remains lease-blocked and unrun; what runs is a
narrower non-broker check that drives the same two routes in the live game.

## Claims and commits

| # | Claim | Commit |
|---|---|---|
| 1 | Five pages EARNED through the ordinary operation path; fabrication fails closed; cold Continue preserves them | `8ab66c20` |
| 2 | Two-host DOM parity, media, focus, cleanup counters; evidence figure crop defect reproduced and fixed | `7c5464e1` |
| 3 | `pq021-ledger-route` harness + broker manifest, built and registered, never run | `1c10a12a` |
| 4 | Aborted-media-request classification (flake fix in my own check) | `dce11cef` |
| 5 | Figure-cap and lossless-crop guards, both proven by mutation | `5a15e10d` |
| 6 | Both ordinary read routes proven in the live game, headless; two harness defects found and fixed | `137ac3bc` |

### 1 — Natural earning

`test/pq021-cathedral-route-harness.mjs` drives the authored route through
`asteroidSites.applyWorldSiteBeamOperation(...)` — the exact API `src/systems/mining.js:287` calls
when the player's industrial beam is on a component. Nothing writes `evidenceReceiptsByPageId` or
`completedOperations`; the World Site owner mints every receipt as a side effect of completion.

Three traps closed, each of which would have produced a green-and-wrong driver:

- **`duplicate()` returns `ok: true`.** `worldSiteKernel.js` returns `{ ok: true, duplicate: true,
  receipt: null }` for a replayed request. A driver asserting only `result.ok` earns nothing and
  reports success. Every pass now asserts `duplicate === false` and `moved > 0` as well.
- **The route is SEVEN operations, not six.** `repair_marker_service_spine` carries no evidence page
  and is easy to omit, but it is both a `dependsOn` of the settlement *and* the only transition that
  moves the spine `offline → ready`, which is the settlement's `from` state.
- **Delivery is physical.** The released payload is towed by position only; `validDelivery`
  re-derives admissibility from live entity positions and the stage-scaled proxy radius.

One operation (`repair_emergency_relay_clock`, threshold 28) is driven in three partial passes
(10/10/8) so the run exercises `component.progress` accumulation and its collapse on completion,
rather than only single-shot applies.

**Non-vacuity is proven, not asserted.** A permanent guard drives the route to the clamp cut (four
pages), then shows the terminal page cannot be earned without the spine repair
(`operation-unavailable`) and cannot be earned with the payload left 1000 units away
(`payload-not-delivered`) — and that neither refusal mints anything. Only towing it in produces the
fifth page.

**Fabrication fails closed at the Ledger, twice.** A forged receipt map is first shown to be
*well-formed enough to project* — five rows appear if it is fed straight to the projector — which
proves the guard cannot be the projector's own validation. `normalizeWorldSiteRecord` then empties
it and the Ledger shows zero rows. The stronger forgery is also covered: a fabricated
`completedOperations.settle_cathedral_black_box` with unmet dependencies is dropped by normalize, so
no page can be minted from a dependency-violating completion.

### 2 — Cold Continue

Mechanism, stated because it is the reason the claim holds: `normalizeWorldSiteRecord` (kernel
414–425) **rebuilds** `evidenceReceiptsByPageId` from `completedOperations` and never carries an
incoming map forward. Pages survive Continue because completions survive.

The round trip uses the same serializer the save system invokes — asserted as a source fact so the
test cannot be driving a lookalike: `saveSystem.js:225` (`_callSerialize('asteroidSites')`) and
`saveSystem.js:2089` (`_callDeserialize('asteroidSites', data.sites)`). A brand-new harness over
brand-new state loads the blob and reproduces all five rows with identical `id`, `type`, `sourceId`,
`sourceKind`, `at`, `cycle`, `cycleLabel`, `templateId`, `text`, and the whole frozen `evidencePage`
(title, fragment, body, provenance, mapRef, media assetId/path/alt). `at`/`cycle`/`cycleLabel`
derive from `earnedAtS`, so drift there would be a real persistence finding. A second save/load is a
fixed point.

### 3 — Host parity, media, accessibility, cleanup (real DOM)

`scripts/check-pq021-ledger-hosts.mjs` earns in node, persists through the ordinary serializer, then
mounts the ONE panel factory under both live host configurations — the station adapter, and the
`hostId: 'codex', headingLevel: 2` options `codex.js:406` passes — inside a real `#ui-root` so the
shipped cascade applies. The Codex *screen* is deliberately not booted: parity is a property of the
shared factory under those two hostIds, and booting the screen would prove the screen instead.

Measured:

| Counter | Result |
|---|---|
| Rows per host | 5, byte-identical across hosts (type, cycle, line, aria-label, pageId, button label) |
| Duplicate DOM ids across both hosts | 0; each root's `aria-labelledby` resolves inside its own subtree |
| Images in the document | 2 — exactly one bounded figure per host, never a gallery |
| Media opens → requests | 10 opens → **exactly 10 requests** (asserted `=== 10`), 5 distinct authored assets |
| Requests during 6 further opens across hidden hosts | 10 → 16 — asserted as an upper bound of 6, observed exactly 6, so **no hidden host refreshed** |
| DOM nodes across 3 host-switch cycles | 113 → 113 |
| Image elements across 3 cycles | 2 → 2 |
| Net listener balance across 3 cycles | 19 → 19 |
| Intervals / rAFs / MutationObservers armed by the panel | 0 / 0 / 0 (the 1 observer is Playwright's) |
| Focus | enters on `Back`, returns to the exact opener that was activated |

Every cycle asserts `onHide` collapses the detail, releases `src`, detaches both handlers, releases
`alt`, and that reopening restores exactly 5 rows and 1 figure. The failure state is driven by a
**real browser error event** on an unadmitted asset id (harness-only; product code untouched): the
figure goes to `failed`, the source is released rather than substituted, alt and caption both say
"not admitted or unavailable", and the page copy survives.

### The reproduced defect, and the one product edit

**No loaded stylesheet defines any `.st-ledger-*` rule in either host.** The panel's class family
belongs to `stationHub.js`'s `STATION_CSS`, whose `injectCss()` is reachable only from the vestigial
screen at `stationHub.js:1107` — the live app is `src/ui/station/`. `styles/station.css` and
`styles/ui.css` define none of them. Every authored image is 1920×1080, so the evidence figure
rendered **at 1920px inside a 700px column, in both hosts**, `object-fit: fill`, `max-width: none`.
There was no supported crop to verify.

Fixed with one lazily injected, `.st-ledger`-scoped style block in `src/ui/screens/shipLedger.js`
using the repo's own idiom (`wingmanRadial.js:186`): four rules covering the figure only. Scoped
under `.st-ledger` so it cannot reach `.st-ledger-list` / `.st-ledger-row`, which `market.js` reuses
under `.st-market-ledger`. Sizes in `em` so the figure tracks `--ui-scale` rather than pinning its
own. Injected from `createShipLedgerPanel`, never at import time, and guarded on `document.head`, so
a headless projector-only import stays DOM-free — which is why the existing `MiniDocument` shim tests
are unaffected.

Result: **1920×1080 → rendered 720×405 inside a 1000px column**, `object-fit: cover`.

Both halves of that claim are guarded against being vacuous, because both would otherwise pass
whether or not the rule existed:

- **The cap binds.** With both host columns at 700px, `width: 100%` alone produced a passing number
  and deleting `max-width` changed nothing. The station column is now 1000px, so the cap does the
  work; the codex column stays under it, so both regimes are measured. Mutation: dropping
  `max-width` fails with `figure is 1000px in a 1000px column — the cap is not binding`.
- **The crop is lossless.** `object-fit: cover` cuts the frame whenever source aspect and box aspect
  disagree. Every authored page is 16:9 today, but a future 4:3 page would be silently cropped while
  every other assertion still passed — it loads, decodes, is admitted, is under the width bound. The
  rendered aspect is now compared to the authored aspect on each of the ten opens. Mutation: a 4/3
  box fails with `rendered aspect 1.3333 differs from authored 1.7778 (1920x1080 -> 720x540)`. The
  packet forbids hiding evidence to pass, so this is the assertion that carries that rule.

This is the only product edit in Phase 4. It is a reproduced defect, not a testing convenience, and
the packet's Phase 2 explicitly sanctions panel-scoped styling.

### 4 — Route harness and broker manifest (built, NOT run)

Follows the professional-travel pattern: one shared route module with thin Browser and Electron
entries and one schema.

- `scripts/lib/pq021LedgerPublicRoute.mjs` — both ordinary read routes.
- `scripts/probe-pq021-ledger-route.mjs` — Browser probe; exits 2 unclaimed.
- `scripts/check-pq021-ledger-route-electron.mjs` — Electron entry; cross-checks the Browser receipt.
- `scripts/validation-manifests/pq021-ledger-route.mjs` — manifest, registered in the broker CLI.

The route drives the **ordinary controls**, not internal APIs: `page.keyboard.press('k')` (the
shipped `BINDINGS.codex`, `src/ui/bindings.js:24` → `src/ui/input.js:222`), the real
`[data-nav="ledger"]` dock tile, the real Codex `.sf-tab`. Earning inside the route uses the same
ordinary operation API with the same duplicate/moved guards; there is **no receipt-writing
fallback** — fewer than five pages fails the route. The one declared shortcut is travel, recorded in
the receipt body.

One command when the lease frees:

```
node scripts/validation-broker-cli.mjs --manifest pq021-ledger-route
```

`test/pq021-ledger-route-manifest.test.mjs` proves readiness without running anything: the manifest
is registered, every declared source path exists, the deterministic fast gates precede any claim,
the probe gates on `SF_BROKER_CLAIM` and exits 2, both entries share the route module, and the
K / Y-Triangle bindings the route depends on are the shipped ones.

### 6 — Both ordinary read routes, proven in the live game

`scripts/check-pq021-ledger-keyboard-route.mjs` boots a real run headlessly from New Game, earns the
five pages **inside the live runtime** through the ordinary operation API in the live registry, and
then reaches them both ways:

```
flight   K -> Codex -> Ledger tab            -> 5 evidence rows of 6
station  dock -> Ledger destination          -> 5 evidence rows of 6
live figure                                   1920x1080 -> 718x404
```

Rows are identical across the two routes, each host names itself from its own heading, exactly one
figure is mounted per host, and the live station figure is cropped and aspect-preserving.

This is **not** the broker cell: it issues no claim, writes no acceptance receipt, and consumes no
acceptance quota. `probe-pq021-ledger-route.mjs` is still unrun. Booting the game headlessly is
routine here — `check:station-tabs`, a required gate, does it on every run.

It was worth building because the route harness rested on live-game selectors and a live-registry
earning path that nothing had ever exercised, and it found **two defects that would have failed the
harness the moment the lease freed**, for reasons unrelated to the Ledger:

1. **Assigning `state.world.currentSectorId` does not move the player.** The world system owns that
   field (`src/systems/world.js:404`) and re-derives it every frame, so the assignment was reverted
   and the Ceres entities despawned — surfacing as the payload missing at settlement. Both the check
   and the route module now use the game's own intentional-jump entry point,
   `world.enterSector(sectorId, { fromJump: true })`.
2. **The released payload materializes on the owner's sync, not synchronously with the clamp cut**,
   so the tow must wait for it.

A third defect was in my own assertion: a real run also projects the other receipt families, so the
panel legitimately lists six rows. Both this check and `assertRouteContract` now require exactly
five **evidence** rows rather than five rows. Had the harness run first, that would have read as a
Ledger failure rather than a test bug.

## Gates

Baseline signatures were captured on `c6d83fe4` before any edit; all four node gates were green then
and are green now.

| Gate | Result |
|---|---|
| `npm run check:depth-program:a2` | **exit 0**, 8/8 focused, pageSize 12 — identical to baseline |
| `npm run check:station-shell` | **exit 0** |
| `npm run check:station-tabs` | **exit 0**, 7 destinations, pointer + keyboard, dock → undock |
| `npm run check:sim:compare` | **`hashEqual: true`**, `firstDivergentTick: null`, `diffs: []` |
| `npm run check:baseline` | **exit 0**, 10/10 green |
| `npm run check:ui-a11y` | **exit 0** |
| `npm run check:wcag-contrast` | **exit 0** |
| `npm run check:pq021-ledger` (new alias) | **exit 0** — 17 focused tests + two-host DOM check + live read-route check |
| `node --test test/pq021-ledger-route-manifest.test.mjs` | 9 pass / 0 fail |
| `node --test test/ship-ledger-evidence-host.test.mjs test/depth-program-a2-ship-ledger.test.mjs test/pq021-ledger-natural-earning.test.mjs` | 26 pass / 0 fail |
| `node --test test/validation-broker.test.mjs` (CLI was edited) | 33 pass / 0 fail |

Golden safety holds trivially and structurally: the only product edit injects a `<style>` element
from a DOM-guarded call inside `createShipLedgerPanel`, and the headless scenario never mounts a
panel.

`check:baseline` prints `BUDGET EXCEEDED` (93.8 s wall against a 90 s budget) while exiting 0. That
is a wall-clock note on a loaded machine, not a functional red, and it is not attributable to this
work — nothing here runs inside that budget.

Inherited reds not chased, per the mission: `check:economy:anti-exploit`,
`check:mission-cargo-loading`.

## Open rows

Blocked on the PQ-034 performance-evidence / validation-broker / browser-gpu leases:

1. **Headed Browser run of `pq021-ledger-route`.** Built, registered, never executed — the broker
   acceptance receipt does not exist. What *is* proven (claim 6) is the same two routes driven
   headlessly in the live game without the broker: K opens the Codex, the Ledger tab mounts the
   panel, the dock destination mounts the same panel, and both show the five earned pages. The gap
   is the headed run and the broker-issued acceptance receipt, not the route's existence.
2. **Electron parity.** `check-pq021-ledger-route-electron.mjs` exists and cross-checks the Browser
   receipt; the mission barred launching Electron. `route_accepted` requires both runtimes.
3. **Independent legibility / provenance / usefulness review.** A human judgement, not a gate.
4. **Physical controller pass.** The Y/Triangle → Codex mapping is asserted as a shipped config fact
   (`src/systems/gamepad.js` button 3, `src/ui/input.js:815`). Stubbing `navigator.getGamepads` and
   the poll loop would prove the stub, not the controller.

Findings recorded rather than fixed, because they sit outside this write surface:

5. **The station app ignores the shipped text scale.** `styles/station.css` `.sx-app { font-size:
   15px }` pins the entire Orbital Command app, so station text does not respond to `--ui-scale`
   (range 0.75–1.5). Measured: station strings stay at 15px/17.55px at 1.5×, while the same panel in
   the Codex host — which sits directly under `#ui-root` — scales correctly. That asymmetry *proves
   the Ledger panel declares no px sizes of its own*; the pinning is station-wide and pre-existing,
   affecting every station screen. Fixing it means changing the station design system.
6. **The rest of the `.st-ledger-*` family is still unstyled.** This leaf bounded the figure because
   that was the reproduced defect. The list, detail, and nav still render as default HTML in both
   hosts, inheriting only `color`/`font-family` from `ui.css`. Legible and unclipped — asserted at
   both text scales — but not designed. Whoever takes the styling pass owns the whole family, not
   four more rules bolted on here.

## Scope

Product edits: **one** — `src/ui/screens/shipLedger.js` (the injected figure crop). Everything else
is `test/pq021-*`, `scripts/*pq021*`, one broker-CLI registration line, and one `package.json` check
alias (`check:pq021-ledger`), all within the declared write surface.

Not touched: input/gamepad mappings, ScreenManager registration, save schema, registry, common
HUD/style/icon families, `worldSiteKernel.js`, `worldSiteManifests.js`,
`wreckCathedralEvidenceCatalog.js`, `assets/**`, `program-queue.json`, `NOW.md`.

## One flake, found and fixed rather than rerun

The two-host check intermittently reported `requestfailed` on `neutral_gameplay_distance.png`. It
was the panel working correctly: `openEvidence` and `closeDetail` both call `clearDetailImage()`,
and `removeAttribute('src')` cancels an image still in flight, which Playwright surfaces as
`net::ERR_ABORTED`. My assertion was too strict. Aborts are now counted and constrained to the
evidence media the panel itself released; the planted 404 remains the only permitted hard failure.
Observed 1 abort on one run and 0 on the next, same verdict both times.
