<!-- LIFETIME: DURABLE -->
# Admission route — what must be true before reference-sector work is legal here

```yaml
preparedAt: 2026-08-09
auditBase: e776bf11
authority: none — this document proposes; the integrator admits
```

This is the "bind it together" half. The selection ledger says *what* to build; this says *how the
work becomes admissible* under the repository's own control plane. Every claim below was run, not
inferred.

---

## 1. The finding that reframes everything

**The R5 Ceres reference pocket and its five-minute acceptance harness are already on master, and
were never admitted.**

Twelve material R5 commits (`7fa9452b`, `8efbc4de`, `2785b131`, `e1b295c2`, `eef2f59a`, `7f8941d2`,
`78300365`, `be47da74`, `42d008cd`, `5a67a236`, `f050670b`, `0f44b94b`) added
`src/data/sectorActivityPockets.js`, ~425 lines to `src/systems/traffic.js`, changes to
`src/systems/world.js`, sandbox wiring, and a ~7,400-line acceptance harness. Against that:

| Control surface | R5 representation |
|---|---|
| `program-queue.json` `tasks[]` (44 rows) | **none** |
| `program-queue.json` `dispatchUnits[]` (101 units) | **none** — checked every unit's `paths`/`checks` for `sectorActivityPockets`, `ceres-five-minute`, `traffic.js`, `sandboxSetup` → 0 hits |
| `design/program/NOW.md` lease | **none** — only historical PQ-020 rows |
| `receipts/` | **none** |
| Active packet | governed by `PHYSICS_AS_SPECTACLE_PROGRAM.md`, which is **invisible to the validator** |

That last row is the subtle one. `PHYSICS_AS_SPECTACLE_PROGRAM.md` *does* govern R5 (20+ references)
and carries `lifecycle: claimed` — but `checkActivePackets()` filters to `/^PQ-\d{3}\.md$/`
(`scripts/check-program-docs.mjs:240`), so the file is never parsed. **The governing document for the
R5 → five-minute-gate → R8 dependency chain exists, and nothing in the repo can enforce or check it.**

So the correct first move is not to admit new work. It is to **retroactively admit what already
landed**, and give the dependency chain a machine-visible home. Building further reference-sector work
on unadmitted production code would make every downstream acceptance claim unadmitted evidence.

---

## 2. The three gates, with exact status

| Gate | Command | Result |
|---|---|---|
| Claim-ready Ceres unit exists | `node scripts/program-dispatch.mjs --next` | `PQ-022.refinery-reauthor-h1` — **no R5 unit exists**; `selectNextPacket` returns `null` |
| Control plane green | `node scripts/check-program-docs.mjs` | **FAIL, exit 1, 12 errors** |
| Ceres gate has evidence | `npm run check:ceres:five-minute` | **PENDING** — both machine blobs missing |
| Fast gate green | `npm run check:baseline` | **REPAIRED — 11/11 green.** It read FAIL, 8/11 when this section was written; see §2.1 |

> **STATUS, 2026-08-09.** This document was written as a *proposal*, and most of it has since been
> carried out. Read §5's status column, not the surrounding prose, for what is done: A0, A1, A3–A6
> A7 and A8 are performed; A2 is **partial** (a PQ-045 row was added to `NOW.md`; the board-wide refresh
> was not done); A9 remains open. The prose is preserved as the reasoning that produced them,
> not as a description of current state.

### 2.1 `check:baseline` WAS red on master, and it was not the dirty tree — repaired 2026-08-09

Three links fail: `sim`, `sim-v3`, `ui-screen-imports`.

This was **isolated, not assumed.** Using the repository's own documented method (`git archive HEAD`
into a scratch tree, `node_modules` junctioned in, junction removed with `rmdir` afterwards — never
`rm -rf`, per the known hazard), the pristine HEAD tree reproduces **the same failures**:

- 47-A authoritative hash `94f18fccf9554d2e9fe879d4e661bb2a9ff93947bd14a844953efb28421039a0`
  against expected `271605e7639ef3ec8519c42a9d8b227938fdac76aa72bd914a6c922f13588af1` — **identical
  in both trees**, so the drift is not caused by the uncommitted Ceres causality lane;
- `check-ui-screen-imports.mjs` fails identically at HEAD: *"flight HUD —
  dock/localmap/starmap/codex labels must read `src/ui/bindings.js`"* (41 ok, 1 fail).

The goldens were last re-recorded at `c8ec3cdf`. Sim-affecting work has landed since — including the
R5 Ceres commits themselves — without re-recording. **The repository's fast gate has been red on
master.**

`NOW.md` line 85 sets the standard for re-recording these files: reproduce the prior hash from an
exported tree and diff full snapshots field by field, not a reflexive overwrite. That standard applies
here.

> **Consequence for admission:** `PACKET_TEMPLATE.md` entry conditions require running
> `check:baseline` at the candidate base *"so a red at exit is attributable."* Right now every lane
> inherits three reds. Repairing or evidence-re-recording them is a **prerequisite to A3–A9** —
> otherwise no reference-sector packet can honestly claim its own exit state. Add it as **A0**.

Nearest claim-ready Ceres-sited work is **`PQ-018.cathedral-reauthor`** — a hero-site *authoring*
unit holding `blender` + `asset-manifest`, not a capture. Worth knowing, because it competes for the
same mutexes any Ceres art lane would need.

### The 12 control-plane errors

```
NOW.md: stale by 302 commits (expiry 25)
PQ-032.md: missing Verification budget / Review questions / Checkoff
PQ-033.md: missing Performance / Verification budget / Review questions / Stop conditions / Checkoff
PQ-032, PQ-033: queue state deferred requires packet retirement
PQ-037: queue state integrated requires packet retirement
```

`NOW.md` **cannot be repaired by widening the expiry** — the validator caps `expiresAfterCommits` at
100 and it is 302 past a 25 limit. The only legal fix is moving `baseCommit` to HEAD and revalidating
every lease row. That revalidation is not clerical: `NOW.md` currently asserts "the only active writer
is the `claude-graphics` modern-parity lane" and "no pre-2026-08-05 claim is a blocker," while **83
commits** have landed since 2026-08-07 across seven-plus production lanes. It also contains a
self-contradictory lease on the `blender` mutex — the same table cell says both "**ACTIVE WRITER —
holds `blender`**" and "COMPLETE AND RELEASED / released 2026-08-06". That is the one mutex a
reference-sector authoring lane most needs.

---

## 3. A blocking defect in the admission template itself — verified, one word

`scripts/check-program-docs.mjs:252` requires every active packet to match
`/^##\s+Verification budget\b/mi`.

`design/program/roadmap/active/PACKET_TEMPLATE.md:78` reads `## Verification`.

Every real packet uses the correct heading (`PQ-020.md:340`, `PQ-022.md:217`, `PQ-024.md:304`), so
**copying the template as instructed produces a packet that fails the validator on section 6 of 9.**
The defect is latent because `activePacketFiles()` filters to `/^PQ-\d{3}\.md$/`, so the template
itself is never section-checked.

This is the cheapest unblock available and it is applied in this pass — see §6.

---

## 4. R5 *is* admissible — the "ids are constrained" objection is wrong

An early reading held that R5 could not be represented because task ids must match `/^PQ-\d{3}$/`.
That regex (`scripts/lib/programControlPlane.mjs:219`) constrains **only the id token**. The same row
validator requires string arrays `canonical` and `aliases` (`:248`), and existing rows already carry
non-PQ identifiers there:

- `PQ-020` → `aliases: ['SF-21']`, `canonical: ['W07','W08','W09','W10']`
- `PQ-025` → `aliases: ['SF-33']`, `canonical: ['G17','G18','G20']`

So **R5 is admissible today as `PQ-045` with `aliases: ['R5']`** — the exact mechanism SF-21 and
SF-33 already use. There is no schema obstacle.

---

## 5. Admission — ten artifacts, in dependency order

The integrator alone may perform these (`design/program/AGENTS.md:13`;
`CANONICAL_BUILD_MAP.md:24-27`). Written as a proposal; the Status column records what has since been performed.

| # | Artifact | Kind | Status | Why it is first |
|---|---|---|---|---|
| **A0** | **Repair or evidence-re-record the three `check:baseline` reds** (`sim`, `sim-v3`, `ui-screen-imports`) | repair | **DONE** | **prerequisite to everything below** — until it lands, no packet can attribute its own exit state (§2.1) |
| A1 | `PACKET_TEMPLATE.md` heading fix | repair | **DONE** | every later packet depends on it (§3) |
| A2 | `NOW.md` full refresh — `baseCommit` → HEAD, revalidate every lease, resolve the `blender` contradiction | repair | **PARTIAL** | nothing can claim a green control plane until this lands |
| A3 | `program-queue.json` — new `tasks[]` row **PQ-045**, `aliases:['R5']`, `canonical:['R5A']` | admission | **DONE** | gives R5 an id |
| A4 | `design/program/roadmap/active/PQ-045.md` from the repaired template | admission | **DONE** | 9 machine-required H2 sections |
| A5 | Retroactive receipt for the twelve material R5 commits (`7fa9452b` … `0f44b94b`) | evidence | **DONE** | makes the landed code admitted rather than orphaned |
| A6 | `dispatchUnits[]` leaves under PQ-045 (below) | admission | **DONE** | the actual claimable work |
| A7 | A queue unit for the **five-minute Ceres gate** reserving `browser-gpu` + `validation-broker` | admission | **DONE** | today nothing reserves them |
| A8 | R5 → gate → R8 chain expressed as `dependsOn` on the PQ-045 units | admission | **DONE** | moves the chain out of an unparsed file (§1) |
| A9 | `CANONICAL_BUILD_MAP.md` stable-route paragraph (PR #91's `CANONICAL_BUILD_MAP_INSERT.md`) | routing | **OPEN** | front door |

### Proposed leaf units under PQ-045

Ordered so the cheap, high-value repairs land before any art is promoted — the ordering the Wave 0
baseline argues for.

| Unit | Kind | Outcome | Mutexes |
|---|---|---|---|
| `PQ-045.choreography-repair` | implementation | R1–R3: give `targetRef` a movement consumer; add the proximity assertion; replace the 8 `activity:` marks and spawn the tender's hull | none |
| `PQ-045.route-topology` | implementation | R4: four distinct pocket topologies replacing one 218 WU shuttle ×8 | none |
| `PQ-045.causal-chain` | implementation | the 6 selected microevents; concurrency capped at 2; choreography-timer scope only | none |
| `PQ-045.npc-identity` | implementation | 4 NPC families wired; `ore_carrier` presentationRole + `TRAFFIC_ROLES` entry | `asset-manifest` |
| `PQ-045.prop-promotion` | implementation | 16 Everyday Space props re-authored to standard | `blender`, `asset-manifest` |
| `PQ-045.wreck-dressing` | implementation | 7 wreck/aftermath assets into the two anonymous slots | `blender`, `asset-manifest` |
| `PQ-045.vfx-recipes` | implementation | 5 recipes ported into `src/render/vfx.js`; **fix `lights.js` `.visible` first** | none |
| `PQ-045.five-minute-h1` | acceptance_capture | the two authorized launches | `browser-gpu`, `validation-broker` |
| `PQ-045.human-review` | evidence_review | the `KEEP`/`REVISE` verdict — **human only** | `evidence-review` |

Only the last two spend a ledgered claim. The first three need **no mutex at all** and carry the
highest value per unit of work.

---

## 6. What this pass changed, and what it deliberately did not

**Changed — one file, one word:** `PACKET_TEMPLATE.md:78` `## Verification` → `## Verification
budget`. Verified against `check-program-docs.mjs:252` and against three real packets. Zero behavior
change; it unblocks A4 and every future packet.

**Not changed, and why:**

- **`NOW.md`** — a refresh means revalidating ~40 lease rows against 302 commits, and it is currently
  dirty from another lane. It is A2 for the integrator, not an opportunistic edit.
- **`program-queue.json`** — admission is integrator-only by explicit rule.
- **Any `src/` path** — `traffic.js`, `npcJobs.js`, `sectorActivityPockets.js` and `src/vfxnext/**`
  all had a live writer during this audit (`e776bf11` landed mid-session). Corrections C10–C11 in the
  ledger touch `src/vfxnext/` and must be claimed.
- **PR #91** — not merged, per instruction. Its documents were read via
  `git show origin/agent/professional-reference-sector-program:<path>` and verified: **0 of 4 reported
  defects survive**; the package is adoptable essentially as-is, with one clause added to
  `PROMPT_AUDIT.md:247` naming `src/vfxnext`.

### Two internal defects in PR #91 worth fixing before merge

Neither blocks adoption; both would confuse a reviewer.

1. `REFERENCE_SECTOR_ACCEPTANCE_SCORECARD.md:5` says a candidate "cannot pass because its total score
   is high," but the document defines **no scale, weights, or point values anywhere** in 194 lines.
   The operative clause ("all critical rows must pass") is self-sufficient — so this is a dangling
   premise plus a naming defect. It is a **critical-gate checklist**, not a scorecard.
2. Split verdict vocabulary inside one document: Gate F row 9 (`:103`) requires
   **KEEP / REVISE / REVERT**; the Final disposition block (`:189-192`) defines
   **KEEP / REVISE / REPLACE / DEFER**. Three options vs four, `REVERT` vs `REPLACE`, no
   reconciliation. A reviewer cannot use one vocabulary for both gates.

---

## 7. Honest boundary

Nothing in this pass constitutes acceptance. Specifically **not** claimed: any route, performance,
G0–G7, promotion, or human verdict. No mutex was taken; no ledgered Browser/Electron claim was spent;
no queue state was promoted.

The one thing an agent structurally **cannot** deliver is the gate everything else waits on:
`evaluateCeresHumanReview` requires a named human reviewer and an explicit judgment on whether the
longest zero-visible-activity gap reads as a brief intentional void. That is the precondition the
propagation pass is blocked on, and it is correct that it cannot be self-granted.

## 8. References

- [`BINDING_REVIEW_AND_SELECTION_LEDGER.md`](./BINDING_REVIEW_AND_SELECTION_LEDGER.md)
- [`WAVE0_CERES_BASELINE.md`](./WAVE0_CERES_BASELINE.md)
- [`SECTOR_IDENTITY_SHEETS.md`](./SECTOR_IDENTITY_SHEETS.md)
- [`CANONICAL_BUILD_MAP.md`](../../CANONICAL_BUILD_MAP.md) · [`NOW.md`](../program/NOW.md) · [`PACKET_TEMPLATE.md`](../program/roadmap/active/PACKET_TEMPLATE.md)
