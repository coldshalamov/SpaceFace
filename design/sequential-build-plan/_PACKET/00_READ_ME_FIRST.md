# REVIEWER PREP PACKET — read this first

> You are the **reviewer genius agent**. This packet was assembled to give you everything
> you need to turn the SpaceFace sequential build plan into concrete, optimal, executable
> build steps — with **minimal tool calls and searching**.
>
> Read the files in `_PACKET/` in numbered order. Everything you need for the *review*
> is here. You should only need to read live repo files when you decide to *verify* a
> specific collision or write a specific corrected build step.
>
> The user's explicit instruction to the packet assembler: *"err on the side of verbosity
> and depth"* — so this packet is deliberately long. Nothing was summarized away. Where
> the same mechanic is described two slightly-different ways across source documents, both
> phrasings are preserved, because the nuance came from a long planning conversation and
> may matter.

---

## What this is

SpaceFace has accumulated a large "depth" build plan from a multi-turn planning
conversation between the user and a design agent. The plan was distilled into a
**36-prompt sequential execution system** (`SF-00` … `SF-35`), drawn from three
upstream design packages:

1. **Depth Playbook** (13 docs) — physics, controls, collision, interaction verbs,
   wrecks, industrial sites, sector archetypes, automation-as-narrative, story ledger,
   anti-slop prompting glossary.
2. **Gravity & Massline Expansion Package** (9 docs) — gravity-field kernel, Mass Seed,
   gravity weapons, alternative massline heads, slingshot routes, planetary activities,
   VFX technical direction.
3. **Universe Atlas & Physical Travel** (14 docs) — map, navigation, route execution,
   Travel Burn propulsion, VFX/RCS/environment, physical lanes, content pipeline.

Plus the **raw conversation thread** (`SpaceFace_Dev_Plans.txt`) containing the user's
own words and original ideas.

The user wants **you** (a top-tier reviewer) to:

- Go over these plans and break them down into **concrete steps and build plans**.
- Fold them into / alongside **other plans already in this repo that haven't been
  completed** (this is critical — see `03_COLLISION_AND_FLAG_MAP.md`).
- Make sure the build plan is **coherent and thorough** and executes **optimally**.
- Most importantly: ensure the final **controls, designs, and everything will be
  optimal, professional, beautiful, and fun.**

## The critical thing you must know up front (do not skip)

**This repo already runs THREE concurrent build programs**, and the 36-prompt sequence
is effectively a **fourth**. Before treating any SF-XX prompt as greenfield work, you
MUST reconcile it against:

- `design/program/roadmap/` — the **113-packet master work order** (F/G/T/A/W/R
  families). This is the live work-order authority. Many SF-XX prompts are **verbatim
  restatements** of already-planned roadmap packets (e.g. SF "Wreck Cathedral" =
  depth-program H1a AND collides with roadmap massline/asteroid work).
- `design/depth-program/` — a **31-chunk "Depth Program"** built 2026-07-12/14 that
  covers nearly the same scope as SF-00…SF-35. "Wreck Cathedral" (SF-20) is literally
  depth-program chunk H1a, currently TODO. "Ship's Ledger" (SF-30) is depth-program
  A2, currently in-progress with the screen file **already existing** but unwired.
- `design/program/atlas/` — a **2026-07-19 program** that just *inverted* the prior
  "build the Atlas then fix the map" plan into "the spatial foundation already exists;
  build one missing spine (route follower) and grow semantics." It explicitly states
  it **supersedes the sequencing proposed in the atlas prompt pack's README**.

This means a naive execution of SF-00…SF-35 would **duplicate or contradict live
authority** in roughly a dozen places. `03_COLLISION_AND_FLAG_MAP.md` maps every one.

The single most consequential decision you must drive: **is the SF-00…SF-35 sequence
(a) a re-statement that should reuse existing roadmap/depth-program packet IDs, (b) a
full supersession that tombstones `design/depth-program/BUILD_PLAN.md`, or (c) a
parallel track that must respect existing IDs for overlapping content?** The repo's
own `PLAN_REGISTRY.md` rule is: *"only `program/roadmap/**` owns packet work order."*
Running SF-XX as a parallel ID space violates that. You should produce a clear
recommendation, not leave it ambiguous.

## How to use this packet — file reading order

| # | File | What it gives you | Read it to… |
|---|---|---|---|
| 0 | `00_READ_ME_FIRST.md` (this file) | Orientation, the critical "four programs" warning, reading order | Set your mental model before anything else |
| 1 | `01_THE_USERS_OWN_WORDS.md` | **Verbatim quotes** from the user's planning thread — the highest-fidelity source. Includes the decisive pushback that reversed the original plan, the physics-realism-vs-fun correction, the 3-signal targeting spec, the slingshot-chain fantasy, and 25+ distinct ideas the user personally proposed | Understand intent that summaries may have flattened; preserve nuance |
| 2 | `02_SOURCE_AND_PLAN_DIGEST.md` | A high-fidelity digest of every design package + the 36-prompt structure (phases P0–P5, dependency graph, model routing) — with all named systems, specific numbers, distinctive author voice, and wonky/underspecified flags per file | Get the whole plan in one read without re-reading 90+ source files |
| 3 | `03_COLLISION_AND_FLAG_MAP.md` | (a) Every SF-XX topic mapped to existing repo doc(s) with status; (b) the 113 roadmap packets and 31 depth-program chunks listed; (c) what's DONE and NEXT in the live repo right now; (d) the single-writer authorities the plan touches; (e) the npm check commands; (f) **16 explicit flags** of duplication/contradiction/wonkiness | Decide what to fold, supersede, or build fresh; know which authorities not to violate |
| 4 | `04_OPEN_QUESTIONS_FOR_THE_REVIEWER.md` | Concrete, decision-shaped questions the user wants you to answer — each with context, the conflicting signals, and what's at stake | Drive your review toward resolving real ambiguities rather than re-deriving them |
| 5 | `05_REVIEWER_DELIVERABLE_SPEC.md` | What "done" looks like for your review — the output shape, the build-plan template, the fold-in rules, the acceptance bar | Know exactly what to produce |
| 6 | `06_THE_REVIEWER_PROMPT.md` | A ready-to-paste prompt you can use to invoke yourself (or a fresh instance) in a clean thread with everything pre-loaded | Hand off or re-run cleanly |

## Where the actual plan files live

```
design/sequential-build-plan/
├── _PACKET/                          ← YOU ARE HERE — the review packet
├── PLANS/                            ← the canonical 36-prompt build plan (clean copy)
│   ├── README.md                     ← the system README (workflow, model routing)
│   ├── SEQUENCE_MATRIX.md            ← all 36 prompts in one table
│   ├── DEPENDENCY_GRAPH.md           ← mermaid of hard prerequisites (P0–P5)
│   ├── WORKFLOW_AND_REVIEW_PROTOCOL.md
│   ├── MODEL_ROUTING_SUMMARY.md      ← which prompts need a vision-capable agent
│   ├── LIVE_REPO_SNAPSHOT.md         ← the dated 2026-07-19 snapshot (NON-authoritative)
│   ├── SOURCE_MATERIAL_MAP.md        ← which reference docs each prompt should read
│   ├── MANIFEST.md, VALIDATION_REPORT.json
│   ├── machine/                      ← sequence.json + receipt.schema.json
│   ├── plans/                        ← SF-00.md … SF-35.md (the 36 prompts)
│   ├── review/                       ← REVIEWER_PROMPT.md + REVIEW_TEMPLATE.md (per-task)
│   └── receipts/                     ← where implementation receipts land
└── ORIGINALS/                        ← UNTOUCHED backups of ALL source material
    ├── SpaceFace_Dev_Plans.txt       ← the raw conversation thread (the user's words)
    ├── spaceface_depth_playbook/     ← all 13 depth-playbook docs + COMBINED
    ├── spaceface_gravity_massline_package/ ← all 9 gravity/massline docs + COMBINED
    ├── spaceface_universe_atlas_prompt_pack/ ← all 14 atlas docs + MASTER_PROMPT
    └── SpaceFace_Sequential_Agent_Prompt_System/ ← the full original prompt system incl. reference/
```

**Note on deduplication:** The original Sequential prompt system shipped with a
`reference/` folder that re-copies the three upstream packages *and* the Dev Plans
thread (43 reference files, ~1.3 MB). I intentionally did **not** copy that `reference/`
subfolder into `PLANS/` — it is byte-for-byte identical to what's in `ORIGINALS/`.
If you need a reference doc, read it from `ORIGINALS/` once. Each `PLANS/plans/SF-XX.md`
prompt is self-contained (~24 KB / ~3,000 words each) and already carries its own
essential context, so you do **not** need to re-read the upstream packages to execute
or review a single prompt — only to deepen reasoning.

## How to minimize your own tool calls (the user asked for this explicitly)

- **Don't re-read the source packages.** `02_SOURCE_AND_PLAN_DIGEST.md` preserves
  their named systems, numbers, voice, and flags. Only go to `ORIGINALS/` for an
  exact verbatim quote when a digest feels insufficient.
- **Don't re-survey the repo.** `03_COLLISION_AND_FLAG_MAP.md` already maps every
  SF-XX topic to its existing repo home with status. Only open a repo file when you
  are about to *write* a corrected build step that touches it.
- **Don't re-derive the user's intent.** `01_THE_USERS_OWN_WORDS.md` quotes the
  load-bearing statements verbatim with line numbers.
- **Read the 36 prompts selectively.** They share a common scaffold (authority
  chain, anti-placeholder contract, receipt protocol — ~40% of each file is identical).
  Read SF-00 in full (it is the bootstrap and the cleanest statement of the system's
  philosophy), then skim 2–3 representative prompts (one `VISION-NO` kernel like
  SF-02 or SF-05, one `VISION-YES` vertical slice like SF-14 or SF-20, and one
  integration prompt like SF-33) to internalize the pattern, then read the rest
  only as you build their corrected steps.
- **Use the per-prompt word counts** in `02_SOURCE_AND_PLAN_DIGEST.md` §5 to budget.

## The user's bar for the final result (verbatim intent)

> *"my goal is to have a reviewer genius agent go over these plans and break them down
> into concrete steps and build plans that can be done alongside or folded into other
> plans in the repo that haven't been completed and make sure that the build plan has
> a coherent and thorough plan for executing the build optimally, and that most
> importantly when it comes out the final end the controls and designs and everything
> will be optimal, professional, beautiful, and fun."*

That bar — **optimal, professional, beautiful, and fun** — is the acceptance criterion
for your review, not just "the steps are correctly sequenced."

## One non-obvious thing about the source packages

The three upstream design packages were written by a **design agent** across two long
planning turns with the user. They are sophisticated and largely coherent, but they
occasionally describe the same mechanic two slightly different ways, and they
sometimes propose specific tuning numbers (PD controller gains, force magnitudes,
radii, durations) that are explicitly **illustrative, not balanced**. Where you see a
number in the digest, treat it as a placeholder for a value a playtesting loop must
set — not as a tuned constant. `02_SOURCE_AND_PLAN_DIGEST.md` flags these per file.

## If you only do five things

1. Read `01_THE_USERS_OWN_WORDS.md` — it will calibrate every judgment you make.
2. Read `03_COLLISION_AND_FLAG_MAP.md` §1 (the collision table) and §3 (depth-program
   relationship) — this is where the biggest "fold vs supersede vs parallel" decision lives.
3. Decide the fate of the depth-program (tombstone / absorb / coexist) and the SF-XX
   ID space (map into existing IDs / keep parallel).
4. Produce a corrected, deduplicated, sequenced build plan per `05_REVIEWER_DELIVERABLE_SPEC.md`.
5. Answer every question in `04_OPEN_QUESTIONS_FOR_THE_REVIEWER.md` with a concrete
   recommendation, not a re-statement of the options.
