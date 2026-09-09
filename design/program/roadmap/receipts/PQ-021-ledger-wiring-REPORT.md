# PQ-021 leaf — Ship's Ledger host wiring and Cathedral evidence pages

```yaml
packet: PQ-021
leaf: PQ-021.ledger-wiring
scope: packet Phases 0-3 (characterize, five-page collector, host-safe panel, station + Codex adapters)
baseCommit: aea72551
candidateCommit: eebd91a9869f306b9f6fdebe51493dbb7271a1fb
integrationCommit: b266515a
lifecycleClaim: integrated
acceptanceClaim: focused_green
disposition: PASS
review:
  discovery: supervisor gate + controller diff review
  causalRereview: APPROVE
```

## What this leaf claims

The Ship's Ledger projector (`src/systems/shipLedger.js`) and panel (`src/ui/screens/shipLedger.js`)
existed with **zero production importers**. They are now reachable in two ordinary hosts — a station
destination and an in-flight Codex tab — and surface the five Wreck Cathedral evidence pages that
landed with PQ-018.

Together with PQ-018 this closes a complete player loop: **earn evidence at the Cathedral, then read
it in the Ledger.**

**Not claimed:** Phase 4. No natural earning through the physical route, no Browser/Electron parity,
no media-at-crop verification, no independent legibility review. Those need the broker route.

## Contract satisfied

The packet demanded a **direct property lookup** over five literal page IDs and forbade disguising an
unbounded traversal. Implemented as an iteration over the frozen five-element
`WRECK_CATHEDRAL_EVIDENCE_PAGE_IDS` with `map[pageId]` indexing — bounded at five, no scan or filter
over the receipt collection.

Stable row identity is keyed on `pageId` alone. A same-revision conflict **omits the page and records
a diagnostic**; it is never resolved by last-write, array order, display text, wall time, or host.

The projector stays pure and read-only: no writes to `evidenceReceiptsByPageId`, no site-record
mutation, no new save key, no serializer. The Ledger reads receipt and catalog; it writes neither.

## Controller repairs on top of the worker candidate

### 1. The aria-labelledby guard was vacuous — this was the real finding

The candidate's dual-host test contained:

```js
assert.notEqual(stationPanel.el.querySelector ? null : allIds(...).find(...),
  allIds(codexPanel.el, []).find((id) => id.endsWith('-title')));
```

`querySelector` is truthy, so the first operand is always `null` and the assertion reduces to
`assert.notEqual(null, 'st-ledger-codex-title')` — it **passed unconditionally**.

This mattered because the panel had **two** hard-coded id literals, not one: `heading.id` at line 32
*and* `root.setAttribute('aria-labelledby', 'st-ledger-title')` at line 29. A worker that suffixed
only `heading.id` would produce **zero duplicate DOM ids** while pointing one host's accessible name
at the other host's heading — invisible to a duplicate-id scan.

Replaced with an assertion that each root's `aria-labelledby` resolves to a heading **inside its own
subtree**, plus a cross-host inequality check. **Proven non-vacuous by mutation:** hard-coding line 50
back to the literal fails it with `station root must reference its own host-derived heading id`
(9 pass / 1 fail); reverting restores 10/10.

The implementation was already correct — `const titleId = idp('title')` feeds both attributes, so they
cannot diverge. The defect was in the guard, not the code. Without the repair the invariant had zero
regression protection.

### 2. The station adapter's `refresh(nextCtx)` ignored its parameter

The panel closes over the ctx it was built with and reads `ctx.state` live, so it cannot honour a
*different* ctx. Accepting one and discarding it would silently serve stale state if the station
contract ever passes a new ctx. The parameter was dropped and the reason documented at the seam.

## Gates — run by the controller on master at the integration revision

| Gate | Baseline | Result |
|---|---|---|
| Ledger + world-site + PQ-018 suite (8 files) | — | **81 pass / 0 fail** |
| `test/ship-ledger-evidence-host.test.mjs` (new) | — | 10 pass / 0 fail |
| `test/depth-program-a2-ship-ledger.test.mjs` | 8/0 | 8 pass / 0 fail |
| `npm run check:depth-program:a2` | ok, 8/8, pageSize 12 | **exit 0**, identical |
| `npm run check:station-shell` | green | **exit 0** |
| `npm run check:station-tabs` | green, 6 destinations | **exit 0**, 7 destinations |
| `npm run check:sim:compare` | ok, hashEqual true | **`deterministic: true`, `hashEqual: true`** |

**Trace-count movement: zero.** The full `check:sim:compare` JSON is byte-identical to the pre-change
baseline (same md5, distinct mtimes — a fresh run, not a stale file). This is a stronger claim than
`hashEqual` alone, and the reason is structural: the panel's three `audio:cue` emits live in
`onNavClick` / `onListClick` / `onDetailClick`, all DOM click handlers, and the headless scenario
never mounts a DOM panel.

## Scope

Nine paths. No write to `package.json`, `assets/**`, `input.js`, `gamepad.js`, `registry.js`,
`worldSiteKernel.js`, `worldSiteManifests.js`, `wreckCathedralEvidenceCatalog.js`, `uiRoot.js`,
renderer, or manifests. Codex keeps **exactly three** subscriptions; `TABS` goes 6 → 7. No new
ScreenManager registration, input action, gamepad mapping, or Pause source.

Two traps were avoided and are recorded because both would have passed every named gate:

- **`src/ui/screens/stationHub.js` was not touched.** It is vestigial, retained only for helper
  exports; the live app is `src/ui/station/`. Wiring the destination into the vestigial module would
  have been green and wrong.
- **`test/world-site-public-route-contract.test.mjs` was not touched.** Its line-240 regex uses bare
  `\n` and fails in a CRLF worktree; "fixing" it would have been a test-edit-to-work-around-CRLF.
  Its pre-existing red signature (67 tests / 66 pass / 1 fail) matched byte-for-byte before and after.

## Accepted with a flag

`src/ui/station/icons.js` gains **one glyph** for the new destination — a shared file the packet
discouraged touching. Accepted: it is purely additive, the consumer already falls back
(`RAW[name] || RAW.info`), and no check asserts the glyph. Reverting is one line and leaves the
destination functional with a generic icon.

## Residuals

- **Phase 4 entirely open**: no earning through the physical route, no Browser/Electron parity, no
  verification that the five accepted images load at intended crop and text scale, no independent
  legibility/provenance review. The packet is explicit that `route_accepted` requires all five images
  in both hosts in both runtimes.
- The Phase 0 duplicate-id reproduction was run after Phase 1 began. Phase 1 touched only
  `src/systems/shipLedger.js`, so the panel was still unmodified when the two `#st-ledger-title` nodes
  were captured — the reproduction is valid, but it was not captured strictly first.
- The evidence pages are reachable but, at the time of writing, only earnable through the Cathedral's
  operations; no route evidence exists that a player actually earned one and saw it in both hosts.

## Follow-ups (deliberately excluded)

1. Phase 4: broker route, both hosts, both runtimes, media at crop, legibility review.
2. Decide whether the station Ledger glyph should be bespoke or revert to the generic fallback.
3. PQ-021's packet also lists a shared Browser/Electron route harness and broker manifest; neither was
   built, since Phase 4 was out of scope for this leaf.
