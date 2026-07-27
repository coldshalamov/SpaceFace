# SPACEFACE — STORY PIPELINE

*How narrative work enters the game. Read `CREATIVE-DIRECTION.md` first.*

---

## The stack (authority flows down)

```
1. WORLDBUILDING          what the world IS
   vibe/ · orgs/ · contracts/ · ATMOSPHERIC-ECONOMY · SECTOR-GRADIENT · sheets/

2. CONTEMPORARY HISTORY   what the world is DOING now
   story/CONTEMPORARY-HISTORY.md

3. STORYLINE              what HAPPENS (dual-thread novel + side weave)
   story/THE-STORYLINE.md   ← novel-format voice standard (read this)
   STORY-STRUCTURE · STORY-SPINE-NARRATIVE-OVERLAY · chapter-00..07
   ENDGAME-B7-REDESIGN · THE-WORLD-AFTER · SIDE-STORIES

4. MISSIONS               derived from storyline (never invented first)
   SIDE-STORIES mission slate · src/story/campaign47a/ · src/data/missions.js

5. CUTSCENES & ART        derived from storyline
   production/CUTSCENE-SCRIPTS.md · production/ART-PROMPTS.md

6. PLAYER-FACING TEXT     the last mile the player actually reads
   src/data/narrative.js · barks · flavor · endings · HUD · graffiti
```

A change enters at the highest layer it belongs to and flows down. Nobody patches a lower
layer that contradicts a higher one — fix the higher layer, or file the lower divergence as a bug.

---

## Pipeline health (tonight's audit)

| Seam | Status | Notes |
|---|---|---|
| Worldbuilding → History | **NEW** | CONTEMPORARY-HISTORY.md added; was the missing layer |
| History → Storyline | Strong | Chapters B0–B7 authored; dual-thread intact |
| Storyline → Side stories | **NEW** | SIDE-STORIES.md formalizes 8 threads + mission slate |
| Storyline → Missions (runtime) | **PARTIAL** | campaign47a wires B0–B7; many design beats DESIGN_ONLY |
| Storyline → Cutscenes/Art | **NEW** | production/ prompts ready for gen models |
| Canon prose → Player-facing | **DIVERGENT** | See CREATIVE-DIRECTION R14–R15; runtime vs prose gaps listed in audit |
| M5-STORY player route | **PARTIAL** | Endings A–E exist; some gates/text wrong; Choice C loop is law |

---

## How to add work

### New place / faction / character
1. Canon prose home first (story/ or orgs/).
2. Sheet in sheets/ with schema; INDEX row.
3. CONTEMPORARY-HISTORY one-liner if they act in the present.
4. Player-facing only after prose is stable.

### New mission
1. Name the chapter beat + side-story thread (SIDE-STORIES slate).
2. Spec artifacts in testimony form.
3. Implement in campaign47a / missions.js.
4. Do not gate critical path on optional threads.

### New cutscene / art
1. Confirm the beat exists in chapter prose.
2. Use production/ prompts; keep Vethari off-frame.
3. Protected lines: never paraphrase (LITERARY-AUDIT §I).

### Player-facing string change
1. Run AUDIT-PROTOCOL passes A–E.
2. Prefer ARTIFACT + dry COMMS; kill THESIS / MAXIM / SECOND_WRITER.
3. Comms ≤ ~12 words unless long-form surface.
4. No author surnames. No test/*.expected.json edits to "make it pass."

---

## Verification router (narrative)

| Changed | Minimum proof |
|---|---|
| Prose only (docs/worldbuilding) | Links resolve; `git diff --check -- docs/worldbuilding` |
| narrative.js / endings / barks / flavor | Parse JS; focused story/data tests if present; do not touch expected.json |
| story.js gates / triggers | Focused story system test + manual route note |
| Mission data | campaign/mission checks + play-route smoke |
| Broad integration | `npm run check` after focused green |

---

## Open wire debt (do not pretend done)

1. Runtime B0 dock destination vs canon Helios→Pit (R14) — mission-data change.
2. Runtime KAEL / prison-colony cold-start vs Wren canon (R15).
3. Kessler graffiti number in narrative.js → TWENTY-TWO MONTHS. LOOK IT UP.
4. endingEpilogue Choice C text → loop (Same bay. Same date.).
5. Vale "Good work. Keep it clean." on any Ashfall drive charge.
6. Endgame offer gate: net worth vs raw credits.
7. Wire choice-accept comms (esp. Choice E courier line).
8. KURTZ → ASHFALL WITNESS in player-facing labels (entity id stays).
9. postEndingReplayChains thesis strings → desk filings.
10. Splash marketing voice → registry lines.
11. Free Frontier sheet + factions-CANONICAL expansion (prose started in CONTEMPORARY-HISTORY).
12. New character sheets: Lien, Pell, Wex, Dree, Spence, Ivo.

---

## Team morning brief

1. Read `CREATIVE-DIRECTION.md` (voice, casting, R1–R15, kill list).
2. Read this pipeline.
3. Pick work from the open wire debt or the SIDE-STORIES mission slate.
4. Do not invent lore islands. Reweight B0–B7.
5. Fire the second writer on sight.

**The paperwork was correct, and the air is still gone.**
