<!-- LIFETIME: RECEIPT -->
# PQ-022 H1 — why the acceptance cells could not run, and what was repaired

```yaml
queueId: PQ-022.refinery-reauthor-h1, PQ-022.billboard-buoy-reauthor-h1
state: not_run
acceptance: blocked_then_gate_repaired
date: 2026-09-06
integratedCommits:
  - a2221237   # Helios gets its own admission budget, and the residency facts on failure
  - 071002f6   # the probe's boot wait can be set from the environment
  - 97c6f807   # retire the superseded assertion, keep a live bar
```

## Status in one line

Both H1 leaves are still **not run**. The gate that blocked them is repaired and the diagnosis is
below; what remains is a clean shared checkout, which is a scheduling problem, not a code one.

## The blocker

All four H1 manifests declare `npm run check:assets:live` as a **fast gate**
(`scripts/validation-manifests/pq022-*-reauthor-{browser,electron}.mjs`), so the broker runs it
before any capture. It failed on `place_station_trade_hub` for `station_helios` and `station_tethys`
with `assetState: "missing-mesh"`, `presented: false`.

**An earlier session recorded this as stale render packages. That was wrong**, and it is worth
stating plainly so nobody spends a day regenerating ~200 generated artifacts on a dead premise:

- the source GLB hashes to the `releaseSha256` in `pilots.json`
  (`9540c8fa…f0754a`, 79 051 580 bytes, byte-for-byte);
- the built package's `contentHash` **and** `runtimeHash` both match the `expected*` fields in
  `src/render/renderPackageManifest.js`.

The binding is sound. Nothing needed rebuilding.

## What was actually wrong

A perf decision superseded the assertion three weeks ago and the probe was never updated.

| date | commit | what it did |
|---|---|---|
| 2026-07-19 | `828db683` | added `assert` — "Helios must finish authored admission on the live route" |
| 2026-08-14 | `eae98414` | "draw and mesh only the table plus a short approach runway" — added `shouldKeepPersistentLandmarkResident` |
| 2026-08-21 | `a5b5f587` | "Eliminate first-picture render discovery hitches" — left this rule in `src/render/renderer.js`, **naming this station**: the loading path "no longer admits a far Helios place merely because it is the critical hub, so shell-first startup does not pay its detail decode before flight" |

The assertion was demanding precisely the work that commit deliberately removed.

**Measured, not argued.** On the seeded route the probe flies, the player spawns at the origin;
`station_helios` is **1347 WU** away and `station_tethys` **15855 WU**, against a table camera whose
default zoom is **144**. A full 45 s wait with forced renders admitted neither, because nothing ever
requested them. `missing-mesh` + `presented: false` is the **correct** state on this route.

A trap worth keeping: **`missing-mesh` is a default, not a diagnosis.** Every probe writes it
whenever `root.userData.authoredAssetState` is absent, so "policy never asked for it" and "the fetch
failed" are indistinguishable from that string. The probe now samples positions and distance from the
player so the two can be told apart.

## What replaces the assertion

Not a deletion. The guarantee that was actually about the player survives: **a critical hub may be
absent, but it may never stand on screen as a fallback box.** That also pins the residency rule from
the other side — a regression that starts eagerly admitting a far Helios reintroduces the startup
hitch and surfaces here as a presented station that has not finished authoring. The probe still fails
if the hubs leave the route entirely. Verified against the measured snapshot and three counterfactuals
(fallback box presented → fails; hubs removed → fails; authored and presented → passes).

**Explicitly no longer tested, rather than quietly dropped:** that Helios's own 89.7 MB package
authors correctly when a player approaches it. That needs a route that actually flies to the hub.

## A second, unrelated defect found on the way

The probe's boot wait was the only timeout in the file that could not be set from the environment — a
bare `15000` ms for the debug runtime to appear. This machine reaches `SF` ready at **15120 ms**
measured, so acceptance runs aborted **120 ms early**, before a single asset was examined, reporting
"timeout waiting for SpaceFace debug runtime" — which reads like a broken game rather than a slow
driver with no `KHR_parallel_shader_compile`. Now `SF_ASSETS_LIVE_BOOT_TIMEOUT_MS`; **the default is
unchanged**, so CI is byte-identical.

## What remains, and why it is not a code problem

The probe binds its evidence to an exact commit: it requires `HEAD == origin/master` **and a globally
clean worktree**, checked at launch and again at teardown. Both conditions are correct and must not
be relaxed — that gate is why a capture can be trusted as evidence of a specific tree.

Attempts on 2026-09-06 died on the worktree condition rather than on anything about the assets: one
run was killed mid-flight when the coordination board was rewritten under it, and later attempts
could not launch at all while the PQ-187.02 kit lane held `_uilab.html`, `styles/fonts/`,
`styles/kit.css` and `src/ui/kit/` dirty — paths named by a live `NOW.md` mutation row, so not
adoptable.

**The remaining requirement is a clean window on the shared checkout**, then, serially:

```text
pq022-refinery-reauthor-browser
pq022-refinery-reauthor-electron
pq022-billboard-buoy-reauthor-browser
pq022-billboard-buoy-reauthor-electron
```

each via `node scripts/validation-broker-cli.mjs --manifest <id>` with `SF_ASSETS_LIVE_REPORT` and
`SF_ASSETS_LIVE_LOG` set to durable paths beforehand, and on this machine
`SF_ASSETS_LIVE_BOOT_TIMEOUT_MS=60000`.

Diagnostic reports and logs from this session are under `.devshots/pq022/`.
