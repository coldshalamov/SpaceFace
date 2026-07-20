# 05 — Reviewer deliverable spec (what "done" looks like for your review)

> The user's goal, verbatim: *"my goal is to have a reviewer genius agent go over
> these plans and break them down into concrete steps and build plans that can be done
> alongside or folded into other plans in the repo that haven't been completed and
> make sure that the build plan has a coherent and thorough plan for executing the
> build optimally, and that most importantly when it comes out the final end the
> controls and designs and everything will be optimal, professional, beautiful, and
> fun."*
>
> This file defines the shape of the deliverable that satisfies that goal.

---

## 1. The deliverable, in one sentence

A **corrected, deduplicated, sequenced build plan** that maps every SF-XX outcome to
its existing repo home (roadmap packet, depth chunk, or atlas decision), states the
fate of the depth-program, and turns each remaining unit of work into a concrete,
optimal, beautiful-and-fun-oriented build step — produced as a set of markdown files
the user can paste into implementation threads.

## 2. Required outputs (the artifacts you must produce)

Produce these as files. Suggested location: a new sibling folder, e.g.
`design/sequential-build-plan/REVIEW/` (do not put them in `_PACKET/` — that's the
read-only prep packet).

### Output 1 — `REVIEWER_DECISIONS.md`
A short, opinionated decisions document. For each question in
`04_OPEN_QUESTIONS_FOR_THE_REVIEWER.md`, state your recommendation with a one-paragraph
defense. **Pick sides.** The user wants a genius reviewer's judgment, not a re-listing
of options. Cover at minimum:
- Q1 (fold/supersede/parallel) — your single recommendation.
- Q4 (depth-program fate) — tombstone / absorb / coexist.
- Q5 (G-mode replacement) — commit to one, retire, or A/B.
- Q11, Q12 (weapon/massline shipping sets).
- Q13 (canonical first-recomposition sector).
- Q16, Q17 (VFX and propulsion ownership).
- Q21 (orbit-assist tuning methodology).
- Q27 (the critical-path subset).

### Output 2 — `BUILD_PLAN_CORRECTED.md`
The main deliverable. A re-sequenced, deduplicated build plan. Structure:

- **Section A — Program authority resolution.** State which authority each SF-XX maps
  to. A table: `SF-XX | Existing ID (roadmap/depth/atlas) | Action (fold/supersede/
  new) | Live status | Notes`.
- **Section B — The corrected sequence.** The actual execution order, with:
  - Dependencies made explicit (not just the SF-00..SF-35 numeric order — re-order if
    the live state or the fold-in demands it).
  - Gates (what must be green before each step starts).
  - The single "next safe step" — matching the repo's `NOW.md` immediate-next.
- **Section C — Per-step build briefs.** For each unit of work (whether it keeps an
  SF-XX ID, maps to a roadmap/depth ID, or is newly assigned), produce a brief in the
  **user's requested format** (L1891–1895):
  - **Problem** (the gap)
  - **Consequence** (what it causes)
  - **Why it's bad** (why it matters)
  - **Proposed solution** (the direction)
  - **General direction of how** (named techniques, not "use advanced techniques")
  - **What it looks like** (the player-observable checkpoint, in concrete terms)
  - **Forbidden shortcuts** (at least 5, per depth 11 §13)
  - **Acceptance evidence** (which `npm run check:*` commands + what player-route proof)
  - **Authority/lease notes** (which single-writer/locked files it touches)
  - **Model routing** (backend/vision/no-vision per the SF matrix)
- **Section D — Folded-in cross-references.** For each existing roadmap/depth/atlas
  item the plan absorbs, note the absorption so nothing is orphaned.

### Output 3 — `COLLISION_RESOLUTIONS.md`
For each of the 16 flags in `03_COLLISION_AND_FLAG_MAP.md` §8, state the resolution.
For each row in the collision table (§2), state the action taken (folded / superseded /
kept-new / deferred-to-backlog).

### Output 4 — `CRITICAL_PATH.md`
The smallest subset of the plan that, done excellently, delivers the user's
"optimal, professional, beautiful, and fun" bar. Use this to prioritize when scope
pressure rises. Cross-reference Q27.

### Output 5 (optional) — `REVIEWER_PROMPT_v2.md`
If you produce substantial corrections, you may emit a refined version of
`06_THE_REVIEWER_PROMPT.md` for future review passes.

## 3. The bar each build step must clear

A corrected build step is **not** done when it correctly sequences the work. It is
done when each step, as written, would cause a competent implementer to produce work
that is:

- **Optimal** — the chosen technique is the right one for the problem (e.g. PD
  controller for orbit assist, not a kinematic animation; instanced particles not
  per-particle Mesh; physics-authority-routed impulse not direct velocity writes).
- **Professional** — the named techniques are specific enough that the result reads
  as a shipped game, not a prototype (e.g. "depth-aware soft particles + SDF ring +
  flow-field advection," not "nice VFX").
- **Beautiful** — visual steps name the art direction concretely (anti-cartoon
  photoreal production stills; Surveyor's Table aesthetic; three-scale readability;
  silhouette hierarchy) and the VFX technique list.
- **Fun** — the step preserves the user's declared fun sources: emergent play styles
  (L1688), physics-earned speed (L1656), GTA-in-space identity (L1704), expendable-
  swarm twitchy combat (L1706), setup-payoff combat (not HP sponges), and the
  massline-as-toy centrality.

If a step would technically satisfy the prompt but not clear these four bars, your
corrected version must add the specificity that gets it there (per the user's L603–604
diagnosis: vague prompts produce minimum-compliance slop).

## 4. What you must NOT do

- **Do not write code or edit live repo files.** This is a review/planning task. Your
  output is markdown build-plan documents, not source changes.
- **Do not edit `_PACKET/`** — it is the read-only prep packet.
- **Do not re-summarize the source packages** — the digest in `02_*` already does that.
- **Do not delete or tombstone `design/depth-program/` yourself** — if your
  recommendation is to tombstone, state it as a recommendation for the user/lead to
  execute. The repo's `PLAN_REGISTRY.md` and the AGENTS.md shared-tree-preservation
  rule govern actual file deletion.
- **Do not invent new roadmap packet IDs** — only the lead assigns those. Recommend;
  don't assign.
- **Do not collapse the status vocabulary** — `IMPLEMENTED`/`FOCUSED_GREEN`/`ROUTE_ACCEPTED`/
  `VISUALLY_ACCEPTED`/`INTEGRATED`/`ALREADY_SATISFIED`/`BLOCKED` remain distinct.
- **Do not promote any milestone based on prose** — only the lead/status integrator
  edits `design/program/NOW.md` or global completion claims (per AGENTS.md §4 and the
  SF-00 authority block).

## 5. How much to read (to minimize your own tool calls — the user asked for this)

You should be able to do the bulk of the review having read **only** the `_PACKET/`
files plus a small number of selective reads:

- **Read in full:** `00_READ_ME_FIRST.md`, `01_THE_USERS_OWN_WORDS.md`,
  `03_COLLISION_AND_FLAG_MAP.md`, `04_OPEN_QUESTIONS_FOR_THE_REVIEWER.md`, this file.
- **Read selectively:** `02_SOURCE_AND_PLAN_DIGEST.md` (long; use the table of
  contents to jump to sections relevant to the step you're correcting).
- **Read 3–4 SF prompts in full:** SF-00 (bootstrap, cleanest philosophy statement),
  one VISION-NO kernel (SF-02 or SF-05), one VISION-YES vertical slice (SF-14 or
  SF-20), and one integration prompt (SF-33). Skim the rest.
- **Read live repo files ONLY when:** (a) you're about to write a corrected build
  step that touches a specific authority file, (b) you need to verify a collision
  claim from `03_*` against current HEAD, or (c) a question in `04_*` requires a
  fact only the live tree has. Prefer the file references already cited in `03_*`
  over re-searching.
- **Do NOT re-read** the three upstream packages in `ORIGINALS/` — the digest covers
  them. Only go to `ORIGINALS/` for an exact verbatim quote when a digest statement
  feels insufficient or you suspect nuance loss.

## 6. Suggested working order

1. Read `00_READ_ME_FIRST.md` → `01_THE_USERS_OWN_WORDS.md` → `03_COLLISION_AND_FLAG_MAP.md`
   (in that order). Do not proceed to outputs until the "four programs" problem and
   the user's intent are internalized.
2. Skim `02_SOURCE_AND_PLAN_DIGEST.md` §A–§D for system vocabulary.
3. Read SF-00 in full, then SF-02, SF-14, SF-20, SF-33 as representatives.
4. Draft `REVIEWER_DECISIONS.md` first (it forces you to resolve the central
   fold/supersede question, which shapes everything else).
5. Then draft `COLLISION_RESOLUTIONS.md` (mechanical, follows from decisions).
6. Then draft `BUILD_PLAN_CORRECTED.md` (the big one — uses the decisions and
   resolutions).
7. Then `CRITICAL_PATH.md` (distillation of the build plan).
8. Final pass: confirm each build step clears the four bars in §3.

## 7. The acceptance criteria for YOUR review (the meta-level)

Your review is itself accepted when:

- Every question in `04_OPEN_QUESTIONS_FOR_THE_REVIEWER.md` has a concrete
  recommendation (not a re-listing).
- Every flag in `03_COLLISION_AND_FLAG_MAP.md` §8 has a resolution.
- Every SF-XX prompt has a declared fate (folded to X / superseded / new ID / deferred).
- The corrected sequence's first step matches the repo's live "immediate next" from
  `NOW.md` (or you explain why it diverges).
- A reader of `BUILD_PLAN_CORRECTED.md` alone could begin implementation without
  re-reading the source packages.
- The four bars (optimal/professional/beautiful/fun) are concretely addressed in
  each build brief, not asserted generically.

When you're done, report back to the user with: the location of the REVIEW/ folder,
the headline decisions (especially Q1 and Q4), the critical path, and any place you
believe the source plan was *wrong* (not just imprecise) and why.
