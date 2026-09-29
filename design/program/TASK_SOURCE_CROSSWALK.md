<!-- LIFETIME: VOLATILE -->
# Task-source crosswalk — one board, many banks

The owner is funneling several externally-produced task banks into the repo. This file is the
running record of **where each bank landed, which of their tasks overlap, and how every overlap was
resolved**. It is a triage record, not a queue: statuses live only in `build_map.md` §1C and
`INFERENCE_IDEAS.md`. No row here authorizes work by itself.

Updated: 2026-09-29 (first pass: SF, NXB, SFQ recorded; FB and AE pending).

## 1. Source inventory

| Bank | IDs | Where it lives | Landed | Notes |
|---|---|---|---|---|
| Planbank 300 | `SF-001…300` | `design/planbank/SpaceFace_Planbank_300/` | 2026-09-28, triaged `TRIAGE_2026-09-28.md`, dispatched as §1C group G PB rows | external workflow assessment; verdicts READY/CHECK/SATISFIED/HOLD per domain |
| Next Wave 300 | `NXB-001…060`, `NXI-001…240` | `design/program/next-wave-2026-09-28/` | 2026-09-29, commit `9acd2ebe3` — §1C section H rows 159–218 + 240 catalog lines | owner-delivered zip; baseline `9a30ffc00`; selector `scripts/next-wave-read.mjs` |
| Finish & Expansion Pack | `SFQ-B001…240`, `SFQ-I001…096` (+36 mission, 36 model, 32 vfx/audio briefs) | `design/finish-expansion-2026-09/` | 2026-09-29 — §1C section I rows 219–227 (first-wave lanes); the 96 SFQ-I enter the catalog one-by-one as dependencies land | loops-first finishing + alien/machine extension; 507-edge DAG; `tools/validate_pack.py` green |
| Fable task bank | `FB-…` (ids tentative) | `design/planbank/SpaceFace_Planbank_FABLE_2026-09-28/` | **pending** — run died at the account session limit; auto-resume scheduled ~04:30 | brief `AGENT_BRIEF.md`; must dedupe against SF **and** NXB **and** SFQ at integration |
| Alien ecology branch | `AE-000…349` | PR #170 (open) + plan merged in #168 | **pending** — cloud agent still building into the PR | no bank tasks may duplicate it; machine/ecology rows WAITING on its reconciliation |
| Native queue | `PQ-*` | `design/program/roadmap/` | drained (2026-09-27) | legacy dispatch retained; `--next` now points here and at the catalog |

## 2. Overlap dispositions (decided)

Method note: pairwise outcome-matching across machine-readable catalogs
(`next-wave-2026-09-28/catalog.json` × `finish-expansion-2026-09/catalog/task_catalog.json`,
title+delta vs title+outcome, stopworded token overlap). Real semantic overlap between NXB and SFQ
is low — the banks were designed to compose (NXB = operational completion of live systems; SFQ =
loop-finishing + extension briefs). Found and resolved:

| Pair | Shared outcome | Disposition |
|---|---|---|
| `NXB-020` ↔ `SFQ-B059` | shared challenge codes / seed+build sharing stay truthful | **NXB-020 owns it** (board-routed §1C H, carries tests and counterexamples). SFQ-B059 closes as duplicate-when-NXB-020-lands; cite, never rebuild |
| `NXB-043` ↔ `SFQ-B087` | one local shortage produces competing real jobs | **NXB-043 owns the sim behavior**; SFQ-B087 remains admissible only as a presentation/legibility follow-on after NXB-043 lands |
| `NXB-056` ↔ `SFQ-B208` | dense instrument text + accessibility coexist | **NXB-056 owns the board row** (ORRERY-consistent sim/text work); SFQ-B208 kept as depth follow-on (screen-reader/zoom framing), not a second fix of the same defect |
| `NXB-030` ↔ `SFQ-B091`, `NXB-059` ↔ `SFQ-B001` | keyword matches only | **not overlaps** — different mechanisms; recorded so the next pass does not re-litigate |

SF↔NXB and SF↔SFQ overlaps were adjudicated inside those packs' own triage/crosswalk documents
(NXB cites its `prior_refs` per packet; SFQ ships `integration/01_ADMISSION_AND_CROSSWALK.md`).
Executors still apply map-by-outcome at claim time; this file records what has already been decided.

## 3. How conflicts get resolved when two banks propose different mechanisms for one outcome

Arbitration order (the "funnest and best" rule, in priority):

1. **Vision test** (`design/VISION.md`): the mechanism that creates physical consequence inside a
   living world — more "holy shit, I did that", more world reaction, more failure-becomes-content —
   wins over the one that merely satisfies the acceptance line.
2. **Surface before invent**: the mechanism that runs through existing live owners (listeners,
   data, events already computing) beats a new subsystem, at equal player outcome.
3. **Measurability**: fixed-seed provable beats judgment-call.
4. The losing proposal is closed with a one-line pointer to the winner (never silently dropped,
   never merged half-and-half — one mechanism, cited rivals).

## 4. Parallel-lane map (how agents take work without colliding)

- **One board, kind-groups + sections**: §1C groups A–G (native), H (NXB), I (SFQ). Claim by row;
  NOW.md exact-path rows protect live hunks; seam tags serialize.
- **Serialization seams that now span banks** (union of all three packs' overlap maps):
  `missions.js`-family, `tetherGameplay.js`, `fields.js`/`fieldKernel`, `flightV3.js`,
  `renderer.js`, `audioSystem.js`, `saveSystem.js`, `bombs.js`, swarm planner family, AI
  decision/maneuver/engagement set, scan-side (`scanner.js`/`scanReveal.js`), `worldSiteRuntime.js`,
  `traffic.js`+custody, Forge manifests. Two agents never hold the same seam.
- **Branch-dependent work**: alien/machine rows (§1C I rows 224/227 and every SFQ program 13–17
  unit) wait on PR #170; all non-alien lanes are branch-free and proceed.
- **Presentation routing**: pure-UI → ORRERY lane; hull/asset authoring → graphics lane; pre-release
  → parked. Sim halves of UI features are always takeable.
- **Grunt vs strong**: `NXI-*` catalog lines and single-row §1C BUILD units are grunt-shaped;
  SFQ program-level rows and PB batch rows want a strong agent; §23 campaigns stay the
  open-invention door when everything directed is claimed or waiting.

## 5. Pending integration duties (standing)

1. **Fable bank lands** → run its own audit, then this crosswalk gains an FB column: dedupe
   FB↔(SF, NXB, SFQ), record dispositions, renumber its board rows past the current max, append its
   inference lines to the catalog.
2. **PR #170 merges** → flip §1C I row 224/227 WAITING to OPEN; re-run the SFQ alien-layer
   outcome-mapping against the landed AE code; absorb the alien brainstorm packet the owner said is
   coming (same treatment as this file's §2).
3. **Any future owner-delivered bank** → land (copy + validate + board section), crossmatch against
   all landed banks, record dispositions here, commit by pathspec. Never bypass the one-board law.
