# Sprint Templates — paste-ready Antigravity prompts

**How to use:** copy the fenced block for the sprint type you're running, fill in the `<PLACEHOLDERS>`, paste into Antigravity (Gemini 3.5 Flash High or stronger). When Antigravity reports done, hand the output path to ZCode for the `VERIFICATION_RUBRIC.md` pass **before** using it downstream.

**Why these prompts are shaped differently from the prior five attempts:** prose constraints ("don't be lazy," "20 steps," "spend an hour") failed on Flash — it ignores them and collapses to a deliverable. These prompts don't fight that tendency; they **channel it** by making the deliverable *be* the exhaustive enumeration, and by pinning every claim to a fetchable source the verifier can re-check. The rigor comes from (a) a single concrete deliverable, (b) pinned sources, (c) the external verification gate — not from rhetoric.

**Critical instruction to include in EVERY sprint:** Antigravity must **write a small fetch/parse script when the game is open-source** to enumerate 100% of the named content from the actual data files. This is not a "cheat code" — it is how a studio analyst gets full coverage. The prior session wrongly refused this; do not refuse it. Parsing `data/ships.txt` is the *only* path to "all ships, not 10%."

---

## TEMPLATE A — Open-source game inventory (Endless Sky, Naev)

Use for: Sprint S1 (Endless Sky), S2 (Naev). These games publish their full content DB in parseable text/XML. The sprint fetches and parses it.

```
/goal Produce ONE verified content-inventory file for <GAME> at
C:/Users/93rob/Documents/GitHub/SpaceFace/design/depth-program/research/verified/<game>.md

Source of truth (use these, do not recall from memory):
- Repository: <REPO_URL>  (e.g. https://github.com/endless-sky/endless-sky for Endless Sky;
  https://codeberg.org/naev/naev for Naev)
- Data files live under: <DATA_PATH>  (Endless Sky: data/*.txt; Naev: dat/ssys/*.xml, dat/ships/*.xml, dat/outfits/*.xml)
- Wiki for lore not in the data files: <WIKI_URL>

THIS IS A DATA-EXTRACTION TASK, NOT A SUMMARY TASK. Do the following IN ORDER:

1. FETCH THE RAW DATA. Write a small Node.js or Python script under
   design/depth-program/research/_tools/extract_<game>.mjs (or .py) that:
   - Downloads (via raw URL fetch) the relevant data files from <REPO_URL>.
   - Parses them and emits a JSON roster of EVERY named entity in each category:
     Endless Sky categories: ships (data/ships.txt), outfits/weapons (data/outfits.txt),
       governments/factions (data/governments.txt), planets/systems (data/map.txt + data/planets).
     Naev categories: ships (dat/ships/*.xml), outfits (dat/outfits/*.xml),
       star systems (dat/ssys/*.xml), factions (dat/factions.xml or equivalent).
   - For each entity, capture at minimum: name, category, and 3-5 key attributes present in the data
     (e.g. for ships: category/class, hull, shield, mass, crew, whatever the file actually defines).
     DO NOT invent attributes not in the file.
   - The script must PRINT the total count per category when it finishes.
   - git add -N the script immediately. Run it. Debug until it runs clean.

2. CAPTURE THE COUNTS. The verified output must state the EXACT total per category as emitted
   by the script (e.g. "ships: 247", "factions: 14", "systems: 196"). These counts are the
   single most important deliverable — they are what proves you didn't sample 10%.

3. WRITE THE INVENTORY FILE to verified/<game>.md with these sections:
   ## Counts (from script)
   - ships: N | factions: N | systems: N | outfits: N | commodities: N (whatever applies)
   - the exact raw-data file(s) each count came from, with the raw URL
   ## Factions (all N)
   - one line per faction: name | alignment/personality (from data or wiki) | fleet doctrine | 1-sentence lore (cite wiki URL)
   ## Ships (all N, grouped by faction or class)
   - one line per ship: name | class/role | key stats FROM THE DATA FILE (hull/shield/mass — whatever the file defines) | 1-line visual/role note
   - DO NOT list ships from memory. If the script extracted N ships, the file lists N ships.
   ## Systems / Sectors (all N)
   - one line per system: name | owning faction | notable features (from the data)
   ## Wonders / Landmarks / Wreckage / Special content
   - enumerate whatever the game actually has in this category, with source citations
   ## Data architecture notes
   - how the game's data is structured (the file formats, key fields) — 1 paragraph
   - 2-3 specific design patterns the game uses that SpaceFace could learn from, each citing a data example

4. SOURCE DISCIPLINE. Every claim of fact must cite where it came from:
   - raw data file URL for stats/counts
   - wiki URL for lore
   - if a claim cannot be sourced, OMIT IT. Do not confabulate.
   - exact numeric stats MUST come from the parsed data, not memory. If uncertain, say "see data file" and link it.

5. STOP CRITERION. You are done when:
   - the script ran clean and printed counts
   - the inventory file lists every entity the script extracted (no sampling)
   - every line has a source citation or is omitted
   Do NOT write a SpaceFace-recommendations section — that comes later, in a separate sprint.
   Do NOT write a cross-game synthesis — that comes later.

Output the file, git add -N it, and print the counts and the file path.
```

---

## TEMPLATE B — Commercial game inventory (Freelancer, Starsector, NMS, etc.)

Use for: Sprint S3 (Starsector — partial source), S4 (Freelancer), S5 (modern comparator). These games are not fully open-source, but community databases, wikis, and (for Starsector) modding-exposed data files exist.

```
/goal Produce ONE verified content-inventory file for <GAME> at
C:/Users/93rob/Documents/GitHub/SpaceFace/design/depth-program/research/verified/<game>.md

<GAME> is a commercial game; its data is not in a single repo. Use these sources IN ORDER OF PREFERENCE:
1. Community-maintained databases / wikis: <WIKI_URLS>  (list 2-3 specific ones, e.g.
   https://starsector.fandom.com, https://freelancer.fandom.com, a community DB dump URL if known)
2. For Starsector specifically: the ship_data.csv and .faction files are extractable from the
   game install / modding community — fetch them if accessible and parse for counts.
3. For Freelancer: star/pda/shiparch database dumps exist in the modding community — cite them.

THIS IS AN ENUMERATION TASK, NOT A SUMMARY TASK. Do the following IN ORDER:

1. ESTABLISH COUNTS FIRST. Before writing prose, determine the total shipped count for each
   category by querying the most authoritative source (e.g. "how many ships are in <GAME>'s
   wiki category:Ships"). Record the count AND the source URL. These counts are the spine of
   the inventory — if you can't get a defensible count for a category, say so explicitly
   ("count unavailable — see <source>; estimate N ± M").

2. CATEGORIES TO ENUMERATE (all that apply to <GAME>):
   - Factions (every named one: alignment, territory, fleet doctrine, signature ships)
   - Ships (every chassis: name, faction, class/role, key specs IF published, source-cited)
   - Systems/Sectors (every one: name, owning faction, notable features/stations/wrecks)
   - Stations/Bases (types and count; notable named ones)
   - Wonders/Landmarks/Anomalies (every named special location)
   - Wreckage/Derelicts (named ones, their history, their loot)
   - Hazards (minefields, radiation, nebulae, asteroid fields — types and examples)
   For EACH category: state the count, then enumerate AT MINIMUM the top 80% by notability
   (you don't have to write a paragraph on all 300 minor planets, but you must LIST them or
   point at the canonical list with a count).

3. SOURCE DISCIPLINE — the part prior attempts failed:
   - Every named entity must have a source URL (wiki page, DB entry, or data file).
   - Every numeric stat must be sourced; if unsourced, OMIT.
   - DO NOT recall ship stats from memory — they are frequently wrong across game versions.
     If the wiki doesn't list a stat, write "specs not published" rather than guessing.
   - DO NOT write "Comprehensive Directory (40 hulls)" when the game has 200+ and call it
     comprehensive. If you list 40 of 200, TITLE IT "40 of ~200 (sampled)" and explain the sampling.

4. WRITE THE INVENTORY FILE to verified/<game>.md with these sections:
   ## Counts (with source URL per count)
   ## Factions (all N) — one sourced line each
   ## Ships (all or top-80%, each faction-grouped) — one sourced line each
   ## Systems/Sectors — sourced
   ## Stations, Wonders, Wreckage, Hazards — each with count + sourced examples
   ## Design patterns <GAME> uses to create depth-feeling — 3-5 patterns, each citing a concrete in-game example

5. STOP CRITERION. Done when every category has a defensible count with source, the enumeration
   matches the count (or is honestly labeled as a sample), and every line has a citation.
   Do NOT write SpaceFace recommendations or cross-game synthesis — those are separate sprints.

Output the file, git add -N it, print the counts with their source URLs and the file path.
```

---

## TEMPLATE C — Cross-game synthesis (run AFTER S1–S5 verified)

**Recommend ZCode run this, not Antigravity** — synthesis benefits from judgment about what matters. If you want Antigravity to draft it, use this prompt and ZCode will verify.

```
/goal Produce ONE synthesis file at
C:/Users/93rob/Documents/GitHub/SpaceFace/design/depth-program/research/verified/synthesis.md

INPUT: the 5 verified per-game inventories in research/verified/{endless_sky,naev,starsector,freelancer,<game5>}.md.
Do NOT introduce any new game-specific facts in this file — everything must trace to a verified inventory.

Produce a cross-game pattern map answering: HOW do these games create the feeling of world depth?
Organize as:

## Quantitative depth benchmarks (a table)
For each game: total factions | total ships | total systems | stations-per-system avg |
wreckage/landmark density | commodities | mission types. Cite the verified inventory per cell.
Add a SpaceFace column (from design/depth-program/00_DEPTH_PROGRAM.md and the audits) for contrast.

## Patterns that produce depth-feeling
One subsection per pattern. Each pattern: name it, explain the mechanic, cite ≥2 games that do it
(with a concrete example from each, traced to its verified inventory), and note whether SpaceFace
has it / lacks it / has it shallowly. Patterns to cover at minimum:
- Faction visual + doctrine differentiation
- Ship chassis breadth and the ships-per-faction ratio
- Sector/system identity (what makes a place feel like a place)
- Landmark / wonder / signature-asset density
- Wreckage and aftermath systems (combat-driven and scripted)
- Progression gating by sector/faction/tech
- Procedural vs hand-authored content split
- Economy depth (commodities, supply/demand, regional profiles)

## The "depth density" ratios
Which ratios (ships-per-faction, landmarks-per-sector, named-zones-per-sector) most correlate with
the feeling of depth in the genre? Back this with the counts from the verified inventories —
no hand-waving. Where SpaceFace is below the genre floor, flag it explicitly.

## What SpaceFace should NOT copy
Anti-patterns from the research — things these games do that don't fit SpaceFace's semi-3D top-down,
60Hz-sim, non-diegetic-HUD constraints. Be specific about why.

STOP CRITERION: every claim traces to a verified inventory line. No new game facts introduced.
Output, git add -N, print file path.
```

---

## TEMPLATE D — SpaceFace asset-expansion plan (run AFTER synthesis verified)

**Strongly recommend ZCode run this directly**, with Antigravity's draft (if any) as one input. This is the 50-category / 250-variation deliverable — the creative extrapolation layer — and it must stay grounded in the verified synthesis.

```
/goal Produce ONE SpaceFace asset-expansion plan at
C:/Users/93rob/Documents/GitHub/SpaceFace/design/depth-program/research/verified/sf_asset_expansion_plan.md

INPUTS (all must be read first, in order):
1. design/depth-program/00_DEPTH_PROGRAM.md and P1-P4 (the live pipelines this plan feeds)
2. research/verified/synthesis.md (the cross-game pattern map — the evidence base)
3. research/verified/*.md per-game inventories (for specific examples to cite)
4. The current SpaceFace audits: src/data/{factions,ships,sectors,sectorZones,frontierRegions/*},
   src/render/partsLibrary.js — so recommendations fit what exists

DELIVERABLE: exactly 50 distinct asset/content items SpaceFace should add, in 5 categories
(10 factions-expansions, 10 planets/celestial, 10 historical wreckages, 10 landmarks/wonders,
10 props/variants). For EACH of the 50 items, provide 5 detailed variations (250 total).

EACH of the 250 variations must include:
- Name (original, not lifted from another game)
- Background (1-2 sentences of lore, in SpaceFace's existing voice — read src/data/narrative.js
  and src/data/barks.js for register; no generic sci-fi filler)
- Location (which existing SpaceFace sector/zone from sectorZones.js or frontierRegions — cite the zone id)
- Aesthetic (materials/colors/mesh notes; MUST respect the non-diegetic-HUD taste constitution
  and the faction palettes in src/data/palettes.js — don't invent colors that clash)
- Gameplay interaction (scan/mine/salvage/hack/dock/fight — tied to existing systems:
  scanner, mining, tether, claimableBodies, aftermathWrecks, encounterDirector)

GROUNDING RULE — the part prior attempts failed:
- Every one of the 50 categories must open with a 2-3 sentence "WHY" citing the synthesis pattern
  and ≥2 verified-inventory examples from competitor games that informed it. Example:
  "Wreckage with embedded loot tables: Endless Sky derelict missions (verified/endless_sky.md §Wreckage),
   Freelancer hidden wrecks (verified/freelancer.md §Wreckage). SpaceFace has aftermathWrecks but
   no scripted loot-bearing derelicts — this category fills that gap."
- If you cannot ground a category in the synthesis, DROP IT and pick another. No untethered invention.

INTEGRATION RULE:
- For each of the 50 items, note which depth-program pipeline (P1 landmarks / P2 story-beats /
  P3 faction-kits / P4 mission-types) it would actualize through, OR name the new pipeline it implies.
- This plan is INPUT to the pipelines, not a replacement for them.

STOP CRITERION: 50 categories × 5 variations = 250 entries, each with all 5 fields, each category
grounded in synthesis + verified inventories, each item mapped to a pipeline. Output, git add -N,
print the category list and file path.
```

---

## Operator notes

- **S1 (Endless Sky) is the bar-setter.** Run it first, alone. When ZCode verifies it, that verified file defines what "good" looks like for S2–S5. If S1 fails verification twice, stop using Template A and have ZCode do the open-source extractions directly.
- **Parallelization:** after S1 passes, S2–S5 can run as parallel Antigravity threads (one game each). S6 and S7 must wait for all of S1–S5 to pass verification.
- **Model choice:** Gemini 3.5 Flash High is acceptable for Templates A and B (extraction + enumeration with pinned sources). For Templates C and D (synthesis + creative extrapolation), prefer Gemini Pro if available, or have ZCode run them — judgment matters there and Flash will flatten it.
- **The verification gate is not optional.** A sprint that "feels done" but can't be source-checked is the exact failure mode of attempts 1–5. Route every output through `VERIFICATION_RUBRIC.md` before trusting it.
