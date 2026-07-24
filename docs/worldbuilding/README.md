# SpaceFace Worldbuilding Map

This folder is the narrative source library: the setting's voice, story intent, structured entity
sheets, and the review trail that produced them. It is **not** a second build-status system.

Global implementation status lives in [`design/program/README.md`](../../design/program/README.md).
The technical contract and live code/checks decide what is actually wired; prose here may describe
valuable future work that has not reached the game yet.

## Authority order inside this folder

1. [`vibe/vibe-CANONICAL.md`](vibe/vibe-CANONICAL.md) — current voice and tone.
2. [`story/STORY-STRUCTURE.md`](story/STORY-STRUCTURE.md) and
   [`story/STORY-SPINE-NARRATIVE-OVERLAY.md`](story/STORY-SPINE-NARRATIVE-OVERLAY.md) — story
   structure and B0-B7 narrative overlay.
3. [`story/PROTAGONIST.md`](story/PROTAGONIST.md),
   [`story/NPCs-CANONICAL.md`](story/NPCs-CANONICAL.md),
   [`orgs/factions-CANONICAL.md`](orgs/factions-CANONICAL.md), and
   [`contracts/CANONICAL.md`](contracts/CANONICAL.md) — named canon.
4. Chapter prose and focused story documents — detailed authored intent.
5. [`sheets/INDEX.md`](sheets/INDEX.md) — discovery and cross-reference layer. Sheets index the
   prose; they do not overrule its meaning.
6. `review/iteration-*.md` — historical critique receipts, never current canon or status authority.

Repository-wide authority remains `ARCHITECTURE.md` for technical contracts,
`design/GDD_2_0.md` for game design, and `design/program/README.md` for the unified execution
roll-up.

## Canon, future work, and history

| Area | Classification | Use |
|---|---|---|
| `vibe/vibe-CANONICAL.md` | **CANON** | House voice and tone. |
| `vibe/vibe-01.md`, `vibe-02.md`, `vibe-03.md` | **SUPERSEDED DRAFTS** | Provenance only; do not copy their retired voice back into new work. |
| `vibe/vibe-04-the-pit.md`, `vibe/SYMBOLISM-MOTIFS.md` | **CANON SUPPORT** | Place-specific texture and recurring motifs. |
| `story/chapter-00-cold-start.md` + `story/chapter-01-CANONICAL.md` | **CANON B0 PAIR** | The prose frame plus the legacy-named canonical first-run HUD script. |
| `story/chapter-01-honest-work.md` | **CANON B1** | The actual Honest Work / Tycho chapter. It is not the same run as the file above. |
| `story/chapter-02-*` through `chapter-07-*` | **AUTHORED CANON INTENT** | B2-B7 chapter designs; runtime coverage must be checked separately. |
| `story/chapter-05b-the-reunion.md` | **FUTURE OPTIONAL BRANCH** | Preserved authored expansion; not evidence that a B5b runtime route exists. |
| `DOSTOYEVSKY-LAYER.md`, `LECARRE-LAYER.md`, `LITERARY-AUDIT.md` | **CRAFT SCAFFOLDING** | Writing constraints and audit context, not in-world prose. |
| [`stylistic-influences/`](stylistic-influences/README.md) | **CRAFT SCAFFOLDING** | Goodreads/film Top 10 catalogs + agent audit protocol for influence-faithful rewrites. |
| [`CREATIVE-DIRECTION.md`](CREATIVE-DIRECTION.md) | **SHOWRUNNER BIBLE** | Voice synthesis, character casting, binding canon rulings R1–R15, kill list, expansion program. Read before any narrative work. |
| [`STORY-PIPELINE.md`](STORY-PIPELINE.md) | **PIPELINE** | Worldbuilding → history → storyline → missions → cutscenes/art → player-facing. |
| [`story/CONTEMPORARY-HISTORY.md`](story/CONTEMPORARY-HISTORY.md) | **CANON PRESENT TENSE** | What the universe is doing this cycle (the missing layer between setting and plot). |
| [`story/SIDE-STORIES.md`](story/SIDE-STORIES.md) | **CANON SIDE WEAVE** | Eight collision-engine threads + mission slate derived from the storyline. |
| [`story/THE-STORYLINE.md`](story/THE-STORYLINE.md) | **CANON NOVEL** | The campaign as a novel — Thread A + Thread B + side-story interludes. Voice standard for all downstream prose. |
| [`production/`](production/) | **PRODUCTION PROMPTS** | `CUTSCENE-SCRIPTS.md` (video-gen) + `ART-PROMPTS.md` (image-gen). |
| `AGY-PROMPTS-FOR-USER.md` | **AUTHORING TOOL** | Prompt history/tooling, not canon. |
| `review/` | **HISTORY** | Iteration receipts. Read only when tracing why canon changed. |

The `chapter-01-CANONICAL.md` filename is historical. Renaming it would break many citations, so
the map above resolves the numbering collision without moving content.

## Structured sheets

Start with [`sheets/README.md`](sheets/README.md) for schemas and
[`sheets/INDEX.md`](sheets/INDEX.md) for the full entity-to-prose map. The current corpus contains
67 entity sheets: 17 characters, 8 factions, 11 worlds, 6 commodities, 8 chapter beats, 2 groups,
4 gangs, 4 rivals, 4 crew, and 3 ships.

Two deliberate implementation gaps remain visible instead of being papered over:

- Narrative commodities use `com_*` concept IDs. The live economy catalog uses `cmdty_*` IDs in
  `src/data/commodities.js`; these concepts require an explicit mapping or implementation before
  they can be treated as runtime commodities.
- Live faction data exposes both `faction_helix` / Helix Directorate and `faction_free` / Free
  Frontier, but the narrative sheets cover Helix only. Free Frontier still needs a canon decision
  and sheet; preserve it as an explicit coverage gap rather than silently folding it into Helix.

## Design and implementation crosswalk

- Place identity and fixed geography: [`design/world-identity/README.md`](../../design/world-identity/README.md)
- Unified implementation status: [`design/program/README.md`](../../design/program/README.md)
- Story implementation: `src/story/campaign47a/`, `src/systems/story.js`, and
  `src/data/narrative.js`
- Mission implementation: `src/data/missions.js` and `src/systems/missions.js`
- Faction/commodity implementation: `src/data/factions/` and `src/data/commodities.js`

Do not infer implementation from the presence of prose. Confirm the normal player route and its
named check, then update the unified program status if that truth changes.
