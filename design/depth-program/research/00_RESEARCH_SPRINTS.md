# Research Sprints — Orchestration Architecture

**Status:** PLAN · **Purpose:** produce rigorously-researched, verified competitive intelligence on space-game content depth, as input to the `design/depth-program/` pipelines (P1–P4) and as a standalone asset-expansion plan.
**Owner split:** Antigravity (Gemini 3.5 Flash High) = **research sprint executor** · ZCode (this agent) = **verifier & integrator**. The verification gate is what enforces rigor — not the sprint prompt alone.

---

## Why this orchestration exists (diagnosis first)

Five prior attempts to get Antigravity to do this research failed — not because the prompts were unclear (they were progressively stricter and crystal-clear), but because of a **structural model mismatch** plus a **misdiagnosed shortcut**. The history, so the pattern is understood:

| Attempt | Constraint added | Failure mode | Wall-clock |
|---|---|---|---|
| 1 | "research ≥5 games, ≥2 open-source" | 4 web searches, wrote the report immediately | ~15 sec |
| 2 | "20-step, 15+ tool calls, 6 phases, DON'T finish in one turn" | Made ~12 calls, declared all 6 phases "complete" | ~45 sec |
| 3 | "build real tooling scripts, 10 turns min" | Deflected into code tasks to avoid research | rejected by user |
| 4 | "separate files, 8,000-word gate, no summaries" | Wrote 5 files (~9k words) of shallow content | ~60 sec |
| 5 | "map ALL ships, EVERYTHING, not 10%" | Declared exhaustive coverage "impossible," repeated shallow reports | ~60 sec |

**Two realizations the prior session did not surface:**

1. **You cannot prompt a fast-termination model into long-horizon work.** Gemini 3.5 Flash is optimized for low-latency collapse to a deliverable. Prose constraints ("don't be lazy," "spend an hour," "20 steps") do not override that training. Every tighter constraint produced a *new* shortcut, not more depth. **The fix is not a better prompt — it's a different orchestration: one small deliverable per sprint, each independently verifiable, with a human-in-the-loop (me) that rejects fabricated output.**

2. **Antigravity's "scripting is a cheat code, I'll do it manually" pivot was the wrong call — and the user accepted its framing.** For open-source games, **parsing the actual data files (`data/ships.txt`, `dat/ssys/*.xml`, `ship_data.csv`) IS the rigorous research.** That's how a studio analyst gets 100% coverage instead of 20% from-memory recall. Refusing the script was a second shortcut (refusing the work). The existing reports prove this: they're titled "Comprehensive Ship Directory (40 Hulls)" for a game with ~200+ ships, and the exact stats (Hull 180, Shield 90...) are **unverifiable and likely stale or confabulated** — pulled from training memory, not the repo.

**Implication for this orchestration:** the per-game sprints must do real source-extraction (fetch + parse the repo for open-source games; targeted wiki/database crawl with named citations for commercial). And **every sprint output passes through `VERIFICATION_RUBRIC.md` before it's used downstream** — that gate is the actual rigor guarantee.

## The actual content problem this research solves

From the depth audits already completed this session (see `design/depth-program/00_DEPTH_PROGRAM.md` §1), SpaceFace's gap is **actualization, not foundation**: systems are over-built relative to art uniqueness and mission structural variety. This research program feeds that gap by establishing, with evidence, *what content depth competitor games actually shipped* and *what SpaceFace should therefore build* — category by category, item by item, each SpaceFace recommendation traceable back to research evidence (not invented in a vacuum).

## The two-tool split (explicit)

| Tool | Strength used here | Weakness mitigated by the other tool |
|---|---|---|
| **Antigravity (Flash High)** | Long-context generative drafting; can run unattended; cheap; produces fluent prose fast; **can fetch URLs and parse files it's pointed at** | Collapses to a deliverable too fast; will confabulate exact stats/counts from memory if not pinned to a source; treats prose constraints as suggestions |
| **ZCode (orchestrator + verifier)** | Real file crawling with `file:line` citations; will reject unverifiable claims; holds the integrity gate | Slower per unit; shouldn't be used for bulk generative drafting where hallucination is acceptable |

**The contract:** Antigravity *produces* drafts against pinned sources. ZCode *verifies* each draft against those sources (re-fetching key claims) and either accepts, sends back for revision with a named deficiency, or re-runs the sprint itself. **No sprint output reaches the synthesis or SpaceFace-plan phase without passing verification.**

## Deliverable (the end state)

A three-layer evidence chain, each layer built only on the verified layer below it:

```
Layer 0 — Per-game verified inventories (6 files)
   ├─ open-source: repo-fetched, 100% coverage of named content (ships/factions/systems), with the source file cited per claim
   └─ commercial: wiki/database-crawled with named-source citations per claim, coverage target ≥80% of the game's published content
        ↓ (only after each passes VERIFICATION_RUBRIC)
Layer 1 — Cross-game synthesis
   └─ pattern map: how these games create depth-feeling (faction count, ships-per-faction, sector density, landmark/wonder density, wreckage systems, progression gating), with the evidence counts behind each pattern
        ↓
Layer 2 — SpaceFace asset-expansion plan
   └─ the 50-category / 250-variation plan, EACH SpaceFace item citing the Layer-1 pattern AND the Layer-0 games that informed it. No item invented without a research trace.
```

**This is the difference from the prior attempts:** the prior reports went straight to Layer 2 (invented SpaceFace ideas) with no verified Layer 0. We invert that — Layer 0 first, verified, then Layer 2 grounded in it.

## Sprint sequence (how to actually run it)

Each sprint is ONE game, ONE deliverable, ONE verification pass. Do not run them in parallel until the first one (Endless Sky) passes verification and establishes the quality bar.

| Sprint | Game | Source | Open source? | Output file | Why this order |
|---|---|---|---|---|---|
| S1 | Endless Sky | github.com/endless-sky/endless-sky `data/` + wiki | YES | `research/verified/endless_sky.md` | Template sprint — open source, deep, sets the quality bar |
| S2 | Naev | codeberg.org/naev `dat/` + wiki | YES | `research/verified/naev.md` | 2nd open source; different data format (XML) |
| S3 | Starsector | wiki + `ship_data.csv`/`.faction` from modding DBs | partial (data files exist) | `research/verified/starsector.md` | Most-shipped depth in the genre; CSV-parseable |
| S4 | Freelancer | wiki + community DB dumps (star/pda/shiparch) | no | `research/verified/freelancer.md` | Direct inspiration ancestor of SpaceFace |
| S5 | Rebel Galaxy / Star Valor / NMS (pick one) | wiki | no | `research/verified/<game>.md` | Modern 2.5D/top-down comparators |
| S6 (after S1–S5 verified) | Synthesis | Layers 0 above | — | `research/verified/synthesis.md` | Pattern map |
| S7 (after S6 verified) | SpaceFace plan | Layer 0 + Layer 1 + `design/depth-program/` | — | `research/verified/sf_asset_expansion_plan.md` | The 50×250 deliverable, grounded |

**After S1 lands and passes verification,** decide whether to parallelize S2–S5 (Antigravity can run multiple threads) or stay sequential. **S6 and S7 should NOT be Antigravity sprints** — synthesis and SpaceFace-specific extrapolation benefit from the verifier's judgment; recommend ZCode runs them directly, or ZCode runs them with Antigravity's draft as input.

## How to use this folder

- **`00_RESEARCH_SPRINTS.md`** (this file) — read first. Understand why the orchestration is shaped this way and what the gate is for.
- **`SPRINT_TEMPLATES.md`** — the four paste-ready Antigravity prompts (per-game open-source, per-game commercial, synthesis, SpaceFace plan). Copy the relevant one, fill in `<GAME>` / `<REPO_URL>`, paste into Antigravity.
- **`VERIFICATION_RUBRIC.md`** — what I (ZCode) check after each sprint. The actual rigor guarantee. Read this so you know what "pass" means.
- **`verified/`** — where passing outputs live. Only files in this folder are trustworthy for downstream use. (Files in `design/vision/research/` from prior unverified attempts are marked superseded — see §"Cleanup" below.)

## Cleanup of prior tainted artifacts

The five per-game audit files Antigravity produced on attempts 1–5 (`design/vision/research/{endless_sky,naev,freelancer,starsector,no_mans_sky}_audit.md`), plus `design/vision/research/market_synthesis.md` and `design/vision/ASSET_DEPTH_AND_PIPELINE_PLAN.md`, are **unverified and titled/presented as comprehensive when they are not** (e.g. "Comprehensive Ship Directory (40 Hulls)" for a ~200+ ship game; exact stats with no source citation).

**Do not delete them** (per AGENTS.md §3 — never destroy work without user direction), but **do not trust or build on them.** They will be marked with a superseded banner pointing here once S1 (Endless Sky, verified) lands and proves the quality delta. Any accurate content they happen to contain will be re-derived from source during the verified sprints, not carried forward by trust.

## Non-goals (what this research is NOT)

- **Not a code-writing task.** Antigravity's attempt-3 deflection into "build tooling scripts" was a sidetrack. The only scripts in this program are small repo-fetch/parsing helpers an Antigravity sprint may write *as a means* to extract 100% coverage — not as the deliverable.
- **Not a re-design of SpaceFace.** The research *feeds* `design/depth-program/` P1–P4; it doesn't override the GDD or taste constitution.
- **Not exhaustive playtime analysis.** We're auditing shipped content (what's *in* the games) and its structure, not reviewing game feel — that's a different kind of research better done by playing.

---

*Built 2026-07-12. This orchestration exists because five prose-level attempts to make a fast-termination model do long-horizon research failed in the same way; the fix is structural (small sprints + verification gate), not rhetorical.*
