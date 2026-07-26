<!-- LIFETIME: ACTIVE_PACKET -->
# Validation pipeline — handoff

Written 2026-07-25 after taking PQ-018 through 21 live diagnostic runs. Everything here is grounded
in what that exposed. Read §2 if you are continuing PQ-018; read §3 onward if you are improving the
pipeline.

---

## 1. The short answer: how much is new build vs. practice?

**Roughly 20% new code, 80% discipline plus wiring things that already exist.** This is the
encouraging part — the hard parts are built, they are just not connected or not used.

| Item | New code? | Reality |
|---|---|---|
| Collect-all diagnostics | ~100 lines | Change one failure mode in the route driver |
| Physics soak/fuzz harness | ~300 lines | Genuinely new, but small and self-contained |
| Reusable route driver | **~0** | `WORLD_SITE_PUBLIC_ROUTE_DRIVER` already exists — extract and document it |
| Declarative scenarios | Medium | `spaceface.simScenario.v1` schema already exists — extend, don't invent |
| Smoke on master | ~50 lines | Mostly CI config |
| Evidence ladder enforcement | ~20 lines | One broker manifest field |
| Agent coordination | Small | Mostly convention plus a lease file format |

Nothing here is a rewrite. The single biggest win — collect-all — is an afternoon.

---

## 2. PQ-018 state (for whoever continues it)

Branch `claude/pq018-rebase-20260725`, pushed. Worktree `C:\Users\93rob\sf-claude-20260725`,
matched-baseline worktree `C:\Users\93rob\sf-claude-pq018-baseline`.

**Proven live across runs 12–21:** admission (15 site entities), authored cavity traversal (582 wu of
ordinary WASD flight through a 70 wu gate), all seven operations with evidence receipts, black box cut
free / tethered / hauled / settled, deliberate ram → hull failure → recovery, and save/Continue
restoring the record exactly.

**Not yet proven:** a single uninterrupted end-to-end pass; leave/return; history; independent visual
review; matched performance beyond the Ceres approach window.

**No acceptance launch has been spent.** Every run was `--diagnostic`, so the
`maxLaunchesPerCandidate: 1` budget is intact.

Two product bugs were found and fixed on the way (silent dependency-blocked beam refusals; the
receiver-service planner that had ten unit tests and no callers). Full detail, all sixteen route
defects, and the design findings are in `roadmap/receipts/PQ-018-wreck-cathedral-REPORT.md`.

**Before integration:** `master` has moved well past the pinned base `167f3690`, so re-pin
`PQ018_AUTHORIZED_BASE_SHA`, re-capture the matched baseline, and rebase. The contract test added in
`test/pq018-public-route-contract.test.mjs` will fail loudly if the pin is stale — that is deliberate.

---

## 3. The diagnosis

| | Lines |
|---|---|
| Test/probe harness (`scripts/`) | **75,430** |
| Game source (`src/`) | 60,515 |
| One packet's route harness (`pq017WorldSitePublicRoute.mjs`) | 11,576 |
| All declarative scenarios combined | 275 |

The harness is larger than the game, hand-written, imperative, and duplicated per packet.

**Where the defects actually were.** Of seventeen fixed in PQ-018:

- 6 collision / flight-path
- 3 tether and tow physics
- 3 operation dependency and recovery
- 4 harness diagnosability and evidence integrity
- **1** rendering / DOM / platform

Twelve of seventeen were pure simulation defects found through a ~15-minute browser probe, one per
run. `isNodeSafeSystemId` returns true for **all 96 production systems**, so every one of them could
have run headlessly in seconds.

**The compounding factor.** The route throws on the first assertion failure, so sixteen independent
defects cost sixteen full runs. Fail-fast is the correct default for a *gate* and the worst possible
strategy for *discovery*.

**Why it drifted this way.** Every false-green incident hurt visibly and triggered hardening — master
carries ten commits today alone about refusing unverified certifications. Slow loops hurt invisibly,
so nothing pushed back. The result is excellent anti-fraud infrastructure and a thin dev loop.

---

## 4. Work items, in leverage order

### 4.1 Collect-all diagnostics — highest leverage, lowest cost

**Problem.** One defect per 15-minute run.

**Do.** Add a failure-collection mode to the route driver. Recoverable assertions (state comparisons,
receipt checks, residency counts) record and continue; only genuinely unrecoverable conditions
(cannot boot, cannot reach the sector) abort. Report every failure at the end with phase, expected,
actual.

**Files.** `scripts/lib/pq017WorldSitePublicRoute.mjs` (driver), each `probe-*.mjs`.

**Acceptance.** Deliberately introduce three known-independent defects; one run reports all three.

**Effort.** Hours. **Expected saving.** ~21 runs → ~4 on a packet like PQ-018.

---

### 4.2 Physics soak / fuzz harness — best value per line

**Problem.** Six collision defects were each found individually, by a route that happened to fly a
particular path. Nothing systematically explores "what if the ship goes somewhere else".

**Do.** Seeded pseudo-random flight input against a site for N thousand ticks, asserting invariants
rather than outcomes:

- no component failure without a corresponding `physics:impact` above threshold
- `completedOperations` never loses an entry except via a declared failure trigger
- save → reload → compare never diverges
- no duplicate roots, payloads, listeners, or materials
- entity and WebGL counts bounded across the run

Run it in Node against the node-safe manifest. Seed it, print the seed, and make any failure replayable
from that seed alone.

**Files.** New `src/testing/lab/soak.js` plus `scripts/sf-lab.mjs` subcommand (`sf lab soak`).

**Acceptance.** Running against `world_site_wreck_cathedral` at the pre-fix revision reproduces the
collision-class defects without a browser.

**Effort.** ~1 day. This is the piece that would most have changed today.

---

### 4.3 Extract and document the route driver — the reuse you asked about

**Problem.** `WORLD_SITE_PUBLIC_ROUTE_DRIVER` (line 11,561) already exports 14 reusable verbs —
`travelThroughOrdinaryGate`, `cycleToComponent`, `settleAtWorldRecord`, `flyToPoint`,
`towToPointUntilOperation`, `stageImpactRun`, `ramWorldRecord`, `startPerformanceWindow`… PQ-018
consumes them. **The reusable layer exists.** But it lives at the bottom of a packet-named
11.5k-line file, so each new packet copies patterns instead of importing them, and nobody knows the
verbs exist.

**Do.**

1. Move the driver to `scripts/lib/routeDriver/` as a first-class library, packet-neutral.
2. Leave `pq017WorldSitePublicRoute.mjs` re-exporting for compatibility; do not rewrite it.
3. Document every verb: what it guarantees, what it assumes, what it does *not* do.
4. Add the verbs PQ-018 had to invent, because the next site will need them too:
   `arcAroundSiteTo` (path around a hazard rather than through it), `withdrawToClearApproach`,
   `ensureComponentPrerequisite`, and a standoff derived from beam range rather than a magic number.

**Rule to adopt:** if a packet writes a navigation or interaction helper, it belongs in the driver, not
in the packet. PQ-018's route is 1,273 lines; most of that should have been driver verbs plus a
scenario.

**Effort.** ~2 days, mostly mechanical.

---

### 4.4 Declarative scenarios

**Problem.** Every packet hand-writes an imperative route. PQ-019 and PQ-020 will each cost another
~1,200 lines of the same shapes.

**Do.** Extend `src/contracts/simScenarioSchema.js` (`spaceface.simScenario.v1`) to express world-site
work: travel, approach, operate, latch, tow, deliver, ram, recover, save/continue, leave/return. A
packet then ships a JSON scenario; the shared driver executes it in Node (lab) or Playwright
(browser) from the same description.

**Acceptance.** PQ-018's route re-expressed as a scenario file reproduces the same phases.

**Effort.** ~1 week. Pays back on the first packet after.

---

### 4.5 Smoke on master

**Problem.** PQ-007 landed 2026-07-24 and broke PQ-017's payload latch. Nobody noticed for a day; it
surfaced only because PQ-018 shares the helper.

**Do.** One golden-path scenario per merge to master, in the lab, under 5 minutes: boot → travel →
interact with a site → latch and deliver a payload → save/reload → assert record equality.

**Effort.** ~1 day, mostly CI config. Would have caught the above within 30 minutes.

---

### 4.6 Make the evidence ladder structural

**Problem.** The ladder is advisory. `CANONICAL_BUILD_MAP.md` §7 already says focused deterministic
checks precede live probes — and I ignored it for 21 runs without anything stopping me.

**Do.** Add a `requiresScenario` field to broker manifests. The broker refuses to mint a claim unless
the named lab scenario passed at the current candidate digest. The broker already runs fast gates, so
this is a field plus a check.

**Effort.** Hours.

---

### 4.7 Multi-agent coordination

Observed problems, all real, all today:

- Another agent runs something like `git push --all`, publishing other agents' half-finished branches.
  **Fix:** agents push only their own branch, by name.
- `NOW.md` is prose and goes stale silently; its own 25-commit expiry tripped mid-session.
  **Fix:** a machine-readable `design/program/leases.json` (packet, branch, worktree, paths, PID,
  heartbeat) that tooling can validate, with NOW.md generated from it.
- Agents cannot tell whether a long-running peer is alive or stalled.
  **Fix:** heartbeat in the lease; a stale heartbeat is a reclaimable lease.

---

## 5. Documentation changes

1. **`src/testing/lab/AGENTS.md`** (new) — when to use `sf lab run` / `repeat` / `compare` / `soak` vs
   a browser probe; how to write a scenario; what each evidence class licenses you to claim; the
   circuit-breaker rules.
2. **Root `AGENTS.md`** — add a Validation section routing all testing questions to the lab, stating
   the ladder as a rule: *no browser probe until the sim scenario is green.*
3. **`CANONICAL_BUILD_MAP.md` §7** — make the tier ordering explicit and name the lab, so it is a
   procedure rather than a principle.
4. **`PACKET_TEMPLATE.md`** — add required fields: *lab scenario*, *soak invariants*, *what genuinely
   needs a browser*. Force the question at packet-authoring time.
5. **`design/lab/EVIDENCE_LADDER.md`** (new) — kernel → focused-fixture → production-fixture →
   soak → browser-parity → public-route, and what each supports.

---

## 6. Anti-goals

- **Do not add more certification machinery.** It is the strongest part of the system; marginal return
  is low compared to tier 2.
- **Do not try to make the browser fast.** It is correctly slow. Stop asking it questions the
  simulation can answer.
- **Do not rewrite `pq017WorldSitePublicRoute.mjs`.** Extract from it, re-export, leave it working.
- **Do not delete the bespoke routes** until a scenario reproduces their phases.

---

## 7. If you only do one thing

**§4.1, collect-all.** An afternoon, no new concepts, and it changes discovery from one-defect-per-run
to all-defects-per-run. Then §4.2, the soak harness, which would have found the entire collision class
in a single seeded run instead of six fifteen-minute ones.
