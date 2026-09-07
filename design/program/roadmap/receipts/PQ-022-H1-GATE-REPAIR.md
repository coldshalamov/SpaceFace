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
default zoom is **144**. A full 45 s wait with forced renders admitted neither. The reason is the
residency rule in `renderer.js` quoted above, which forbids admitting a far Helios — a policy
reading, not a network trace: this probe does not log asset requests, so the *fetch* was never
observed either way. `missing-mesh` + `presented: false` is the **correct** state on this route.

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

## Correction, 2026-09-06 later: "nothing needed rebuilding" was half right

The section above is correct that the **134 existing packages were sound** and that regenerating them
would have been churn. Two independent confirmations, worth keeping because they are cheap to re-run:

- all **134/134** manifest entries in `src/render/renderPackageManifest.js` match their committed
  package's `contentHash` *and* `runtimeHash`; the runtime accepts every one of them;
- `contentHash` folds in `provenance.sourceManifest.{sha256,bytes}`
  (`src/contracts/renderPackage.js`, `renderPackageContentIdentity`). So rebuilding a package after
  `pilots.json` has grown **necessarily** changes its hash with zero change to geometry or materials.
  The earlier session's "rebuilding changes the contentHash, therefore it is stale" reading was a
  tautology, not evidence. Package provenance legitimately records many different `pilots.json`
  sizes (76 590, 89 776, 91 874, …) because `--only=` incremental rebuilds are the designed workflow.

**But "nothing needed rebuilding" was wrong about assets that had no package at all.** No run had
reached the assertion that proves it: the Helios assertion aborted every run before 97c6f807, and the
provenance guard aborted every run after it. With both cleared, the probe failed here instead:

```
[assetLoader] assets/ships/release/parts/places/place_cold_locker.glb violates the authored-part
contract: released part has no render package, and the source route is development-only.
Run: node scripts/generate-render-package-pilots.mjs && node scripts/build-render-package-pilots.mjs
```

`place_cold_locker` is on the seed-47 route, the loader **fails closed** in release mode, and
**77 release assets had no package**. `npm run check:render-package-coverage` was red on master and
is not part of `check:baseline`, which is how the gap persisted silently.

### What was done

`generate-render-package-pilots.mjs` (appends only; existing entries preserved verbatim), then
`build-render-package-pilots.mjs --only=<the 77 new keys>` — **not** a full rebuild. Verified:

- `git status` shows **zero** modified files under `assets/ships/release/render-packages/`; the 134
  existing packages are byte-identical;
- `pilots.json` **+1155 / −0** and `renderPackageManifest.js` **+770 / −0** — purely additive;
- all **211/211** manifest entries now match their packages (134 pre-existing unchanged, 77 new);
- `check:render-package-coverage` red → **green**.

Three release GLBs remain unpackaged and are excluded from coverage because they declare no
`spacefaceAsset.assetId`, so no runtime identity can be bound: `pelican_production_v1.glb`,
`place_ash_pin.glb`, `place_tally_post.glb`. They need an authoring fix, not a build.

### The residual this receipt recorded is now closed

The probe now flies to the hub. After the ship gate it moves the player to a fixed standoff
(`HELIOS_APPROACH_STANDOFF_WU`, default 110) and requires `station_helios` to reach `authored` inside
the same 45 s budget, capturing `.devshots/authored-assets-live-helios-approach.jpg` as proof. The
pose write is the supported reposition under `rapier-dynamic`: `_maybeResyncBodyPose`
(`src/core/sg02DynamicBodyOwner.js`) re-seats the body from `entity.pos` when the two diverge.

Both spawn-side bars are kept, so this is strictly stronger than before: a far hub may be absent, but
may never be presented unauthored — and now the 89.7 MB package must also actually author when
approached, which nothing tested between 2026-08-21 and today.

The approach leg carries its own budget (`HELIOS_APPROACH_TIMEOUT_MS`, default 150 s,
`SF_ASSETS_LIVE_HELIOS_TIMEOUT_MS`) rather than the ships' 45 s. Measured both ways: quiet, Helios
reached `authored` inside 45 s and rendered; with four lanes building, the same route was still
`assetState: "loading"` at 45 s. `loading` is the streamer working on 89.7 MB — four times the next
largest package — not a defect. The budget is not an unbounded wait: a station the residency policy
never requests stays `missing-mesh` and still fails, at 110 WU as surely as at 1347.

One caution for whoever runs the four cells: a diagnostic bypass of the provenance guards
(`SF_PROBE_UNSAFE_SKIP_PROVENANCE`), used locally only while the gate still demanded a globally clean
tree, was swept onto master from an uncommitted working tree by a concurrent commit and removed in
071bf0e2. If a probe change ever seems to have committed itself, check for that pattern rather than
assuming the edit was intended.

## The gate is still red, and this is what is left

Packaging the 77 did **not** unblock the cells. With the provenance gate scoped and the assertion
retired, the probe now reaches the loader assertion and fails there:

```
[assetLoader] .../places/place_cold_locker.glb violates the authored-part contract:
released part has no render package, and the source route is development-only.
```

`place_cold_locker` is genuinely wired — `src/data/sectorAnchors.js` places it as `poi_helios_locker`
at (772, -302) in the seeded Helios sector, and `src/render/partsLibrary.js:196` declares it — so the
loader is right to fail closed. It is **not** among the 77, and no amount of regenerating will add it.

**Root cause, and it is not the authoring.** `generate-render-package-pilots.mjs` skips it with
"semantic node names must be non-empty and unique (unnamed)". Comparing the two GLBs:

| file | nodes | unnamed |
|---|---|---|
| `assets/ships/parts/places/place_cold_locker.glb` (source) | 100 | 0 |
| `assets/ships/release/parts/places/place_cold_locker.glb` (release) | 101 | **1** |

The authored source is clean. **The release export adds a node and leaves it unnamed**, and the
package compiler then refuses the asset. `fin_crystalline.glb` is skipped for the neighbouring
reason (a non-unique name, `fin_crystalline_Material_Accent_Merged`), so this is a narrow
release-pipeline defect, not a systemic authoring one.

Fixing it means fixing the export (`scripts/build-place-release-assets.mjs` is the likely owner), not
hand-patching a generated artifact — and it moves the release GLB's hash, which the release manifest
records, so it wants the asset lane rather than a drive-by.

**Until that node is named, `check:assets:live` cannot pass and the four H1 cells cannot record**,
independently of render packages, the Helios assertion, or worktree cleanliness.
