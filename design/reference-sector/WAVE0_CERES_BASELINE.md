<!-- LIFETIME: DURABLE -->
# Wave 0 — Ceres current-state baseline, and the four defects that no new art repairs

```yaml
preparedAt: 2026-08-09
auditBase: e776bf11
machineBaseline: BLOCKED — see §1
method: source trace of the full path from authored data to drawn entity, plus adversarial verification
```

Wave 0 of `REFERENCE_SECTOR_VALUE_HARVEST_PROMPT.md` (unmerged — lands with PR #91 into this
directory) asks for a baseline before content changes. This is that baseline, with an honest account of the part
that could not be measured.

---

## 1. The machine baseline could not be captured, and why

```bash
npm run check:ceres:five-minute
```

returns **`PENDING`** — `browser: machine=pending review=pending`, `electron: machine=pending
review=pending`, with both machine-evidence blobs missing. The gate has **never** produced evidence.

The preflight that would produce it refuses to run:

```bash
node scripts/check-ceres-five-minute.mjs --runtime=browser --preflight
# [ceres-five-minute] BLOCKED: CERES_PREFLIGHT_CANDIDATE_NOT_CLEAN
```

The working tree carries ~290 dirty paths across at least three concurrent lanes (a Ceres causality
lane in `traffic.js`/`npcJobs.js`, a PQ-019 lane in `assets/ships/m5_claim_outposts/`, and the wreck
pack). The harness fails closed against a dirty candidate, which is correct behavior.

**Consequence to record rather than work around:** the accepted machine baseline is unavailable until
the tree is clean or the work runs in a pinned worktree. An ad-hoc capture would not substitute —
`NOW.md` row 69 already establishes that headless dev shots "spend **no** ledgered H1/H3 Browser claim
and are **not** acceptance evidence."

What *was* measurable — the source trace below — turned out to be the more valuable half anyway,
because it explains why the route would read poorly even if it were captured today.

---

## 2. What actually exists and runs

`src/data/sectorActivityPockets.js` opens with `// canonical, inert activity choreography`. **That
header is wrong**, and this is good news. Five `src/` importers consume the module and the consumption
is real:

- `traffic.js` spawns **7 of the 8 pocket actors** as ordinary `makeShipEntitySpec` entities and
  assigns them real `npcJobs`;
- `factionPresence.js` spawns the **8th** (the refinery tender), unconditionally
  (`planFactionPresence` pushes the pitborn `yardTender` plan with no cap or budget filter);
- `npcJobsRuntime` writes their `data.intent`, so they physically fly;
- `world.js` materializes **all five object slots and both collision anchors**;
- there is **no feature flag and no test-only gate** anywhere on this path.

This is the opposite of the trap this repo has hit before (a job simulation that existed for years and
was never drawn). Ceres is drawn.

Single-writer discipline is clean and explicit: `traffic.js:1465-1476` yields movement entirely to
`npcJobsRuntime` for any hull carrying a `jobId`, "so there is exactly one intent writer per job hull
per tick."

### The cast, corrected

| Slot | Materializes? | Owner |
|---|---|---|
| `ceres_refinery_hauler`, `ceres_seam_miner`, `ceres_seam_surveyor`, `ceres_ambush_loaded_hauler`, `ceres_ambush_escort`, `ceres_cathedral_salvor`, `ceres_cathedral_patrol` | yes (7) | `traffic.js` |
| `ceres_refinery_tender` | yes (1) | `factionPresence.js` — filtered **out** of the traffic cast at `traffic.js:162-165` |
| `ceres_cinder_service_hauler` | yes, but **2258.65 WU** from the seam anchor | `traffic.js` world-site route |

Nine authored identities, **eight in-pocket**. This split is *declared design*, not an accident —
`sectorActivityPockets.js:420` sets `countsTowardPocketActorCensus: false`, and the acceptance gate
itself excludes the service slot from visibility (`ceresFiveMinuteAcceptance.mjs:179-185`) while still
requiring the ninth row to exist as an identity. Authored capacity is 2/3/2/2 per pocket, asserted
green by `test/ceres-active-pockets.test.mjs:130` (8/8 pass, 277 ms).

### Geometry that is already right

- **Pocket separation is excellent** — 2074 to 4540 WU apart. The four pockets are genuinely distinct
  places, not four labels on one region.
- **Every spawn offset is inside the immediate band** (43.91 – 55.03 WU), and every route mark is
  inside the moving band (102 / 116 WU), by construction — the module throws at import if not.
- **Collision anchors are placed for physics play** — `ceres_throughline_collision_anchor` at 80.0 WU,
  `ceres_ambush_collision_anchor` at 151.3 WU, both bound to real asteroid indices.
- The camera contract is current: `CAMERA_VISIBLE_BUBBLE.md` at HEAD gives **0–95 / 95–125 / 125–165
  WU**, and `CERES_ACTIVITY_BANDS` matches it exactly. (The "45–50 WU" figure still quoted in
  `NOW.md` row 70 is the **superseded pre-R1 baseline**; that doc's own §"Historical baseline" says so.)

---

## 3. The four defects that no new art repairs

These are the reason §6 of the ledger says *fix the choreography before spending the art*.

### D1 — `targetRef` is never consulted for steering. This is the decisive one.

Three route marks name a specific object and then stop short of it:

| Mark | Names | Stops short by |
|---|---|---|
| `refinery_cargo_approach` | `ceres_refinery_cargo_pod` | **40.50 WU** |
| `seam_miner_ore_face` | `ceres_seam_ore_clast` | **108.81 WU** |
| `cathedral_salvor_shard` | `ceres_cathedral_grave_shard` | **173.66 WU** |

The first diagnosis was "the resolver has no proximity term." True, but the mechanism is worse:
**`targetRef` has no movement consumer at all.** `npcJobsRuntime.js:582-591` `_targetWaypointPos(job)`
resolves purely from `job.route.find(w => w.id === desc.targetId).pos` — the authored anchor+offset —
and never touches `targetRef` or any resolved entity. `targetRef` is preserved through normalization
(`npcJobs.js:377-379`) and then goes nowhere. Every stationary phase (`commission`/`depart`/`approach`/
`work`/`load`/`unload`/`hold`) is a bare hold-position at `npcJobsRuntime.js:578`.

So the actor **provably** performs its work at the authored offset, and **no runtime path exists that
could close those gaps.** The signature VFX is emitted hull-local (`vfx.js:4468`, using only
`ent.pos`, `ent.radius`, `slot.frame`) with no linking geometry to the target, so nothing on screen
connects the worker to the thing it is working on.

This passes every test because `test/ceres-active-pockets.test.mjs:176` — a test aimed at exactly this
axis, titled "positions and inert routes use the named-anchor camera bands" — carries no proximity
term, and `test/ceres-visible-job-actions.test.mjs:580` enumerates what target resolution fails closed
on ("missing, dead, wrong-sector, wrong-kind, or mismatched") with proximity conspicuously absent.

*A test exists for this exact axis and omits proximity* is a stronger finding than *no test exists*.

### D2 — Half the choreography points at nothing

**8 of 16 route marks** use `activity:` targetRefs, which the resolver reduces to
`{ kind: 'activity', id: null }` (`traffic.js:2146`) — a bare position with no world object. The seam
surveyor, the cathedral patrol and the ambush loaded hauler have `activity:` at **both** ends, so
their entire visible loop is a lamp code shuttling between two empty points.

Worst instance: the tender's mark targets `activity:disabled-hull`
(`sectorActivityPockets.js:288`), and that string is the **only occurrence anywhere in `src/`** —
exhaustively confirmed. The hull the tender is servicing is never spawned by anything.

### D3 — The choreography is one template repeated eight times

Every actor uses the identical pair of distances — **102 and 116 WU** — on cardinal axes from its
anchor. Six of eight routes are **218.000 WU** colinear straight-line shuttles through the anchor
point; the remaining two are **154.467 WU** right-angle legs.

Four pockets with four different fictions — refine, mine, ambush, salvage — all read as the same
back-and-forth at the same radius. Pocket *separation* is excellent; pocket *behaviour* is identical.
This directly undercuts the propagation prompt's requirement that no two places share a traffic
topology, at the smallest possible scale: Ceres does not satisfy it against itself.

### D4 — Occupational silhouettes collapse in ordinary traffic

Four `TRAFFIC_ROLES` — `smuggler`, `rescue`, `surveyor`, `tender` — all resolve through
`partsLibrary.js:845/852` to **`hulls/hull_multirole.glb`**. All four carry nonzero ambient weight and
every role's base weight is seeded into the mix (`traffic.js:263`), so this is live in ordinary traffic
**in every sector**, not a Ceres artifact. Separately the Cathedral salvor maps
`salvor → ship_pelican → hulls/hull_miner.glb`: the one actor whose entire job is cutting a wreck
reads as a mining barge.

The pack's own audit already recorded this at `evidence/ROLE_MATRIX.md:19-24`. It is the strongest
single argument for the four NPC picks in the ledger.

---

## 4. Experience brief

> **Ceres is a hard-working industrial belt where ore becomes freight, freight becomes opportunity,
> law and predation contest the route, and the dead Cathedral proves what failure looks like.**

Against that sentence, the current slice delivers the *nouns* and not the *verbs*. The places are
distinct and well separated; the cast is present, physically flying, and single-writer clean; the
physics anchors are placed. What is missing is that **no actor is visibly connected to the thing it is
acting on** (D1), **half of them are acting on nothing** (D2), and **they all move the same way**
(D3).

That is a choreography problem with a small, bounded fix — and it is a much cheaper fix than art.

## 5. Ten-minute beat sheet (rhythm, not script)

| Minute | Pocket | Beat | Present today? |
|---|---|---|---|
| 0–1 | Refinery | Arrive; freight lane readable; cargo staged and *reached* | partial — lane exists, D1 breaks the reach |
| 1–2 | Refinery | Tender services a **visible** disabled hull | **no** — D2, hull never spawns |
| 2–3 | transit | Deliberate quiet; Cathedral silhouettes on the horizon | yes |
| 3–5 | Seam | Miner works a **named** clast; surveyor sweeps a real mark | partial — D1 (108.8 WU), D2 |
| 5–6 | Seam | Ore becomes cargo; barge departs toward refinery | partial — needs `ev_miner_calls_hauler` |
| 6–7 | Ambush Run | Loaded hauler crosses; escort visible; anchors invite interception | yes — best-formed pocket today |
| 7–8 | Ambush Run | Player interferes; heat/law responds; cargo spills | needs the causal chain |
| 8–9 | Cathedral | Salvor cuts a **named** shard; patrol perimeter | partial — D1 (173.7 WU) |
| 9–10 | Cathedral | Aftermath remains; return route | needs `ev_cutter_strips_wreck` |

Only two beats need genuinely new content. Seven need the choreography repaired.

---

## 6. The repair, ordered by value per unit of work

| # | Repair | Cost | Effect |
|---|---|---|---|
| R1 | Give `targetRef` a movement consumer: resolve the entity and steer to `entityPos ± standoff` instead of the authored offset | small — one function in `npcJobsRuntime` | closes all three gaps; makes every future prop placement self-correcting |
| R2 | Add a proximity assertion to `test/ceres-active-pockets.test.mjs` | trivial | prevents regression; the test already targets this axis |
| R3 | Replace the 8 `activity:` marks with real object refs, and spawn the tender's disabled hull | small–medium | half the cast stops miming |
| R4 | Give each pocket its own route topology (loop / face-and-return / crossing / perimeter arc) instead of one 218 WU shuttle | medium | four pockets stop reading identically |
| R5 | Wire the 4 NPC picks so salvor/surveyor/tender stop sharing `hull_multirole` | medium | occupational read at 125 WU |

**R1–R3 are worth more than every asset in the ledger.** They are also the only items that must
happen before art, because they determine where the art gets placed.

---

## 7. Exact follow-ups this baseline cannot close

1. **Machine baseline** — needs a clean candidate. Recommend a pinned worktree; note the junction
   hazard (`git worktree remove` follows a Windows junction into the primary's `node_modules`).
2. **Two broker-authorized launches** — the gate needs `browser-gpu` + `validation-broker`; no
   admitted unit reserves them.
3. **The human review** — `evaluateCeresHumanReview` (`ceresFiveMinuteAcceptance.mjs:697`) requires a
   named human, a timestamp, a `KEEP` verdict, and an explicit judgment on whether the longest
   zero-visible gap "reads as a brief intentional void." **This cannot be self-granted by any agent**,
   and it is the exact precondition the propagation pass is blocked on.

---

## 8. References

- [`BINDING_REVIEW_AND_SELECTION_LEDGER.md`](./BINDING_REVIEW_AND_SELECTION_LEDGER.md)
- [`ADMISSION_ROUTE.md`](./ADMISSION_ROUTE.md)
- [`CAMERA_VISIBLE_BUBBLE.md`](../graphics-sprints/CAMERA_VISIBLE_BUBBLE.md)
- `src/data/sectorActivityPockets.js` · `src/systems/traffic.js` · `src/systems/npcJobsRuntime.js` · `scripts/lib/ceresFiveMinuteAcceptance.mjs`
