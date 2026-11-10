# Salvage Notes — what's usable from the prior Antigravity reports

**Honest reassessment (2026-07-12).** The banner on these files originally said "unverified, do not trust." That's accurate for *specific stats and counts*, but it's too blunt for the reports as a whole. Reading them carefully, three categories of content have different trust levels:

| Content type | Trust level | Why |
|---|---|---|
| **Exact numeric stats** (Hull 180, Shield 90, Mass 12) | **LOW — do not carry forward without re-verifying** | No source citation. Likely from Flash's training memory. Will be re-derived from the actual data files by the verified extraction agents. |
| **Counts** ("40 Hulls comprehensive", "11 factions") | **WRONG-as-claimed, but the underlying lists are useful seeds** | ES has 19 species dirs and ~895 ship lines; the "40 comprehensive" framing is mislabeled sampling. But the ~40 ship NAMES agy listed are real ES ships (Shuttle, Mule, Bactrian, Leviathan, Quarg Wardragon) — useful as a "names to verify against the data file" checklist. |
| **Architectural / conceptual patterns** | **GENERALLY RELIABLE** | These match ground truth I've now verified by cloning the repos: ES does parse tokenized text files in `data/`; the alpha-channel→collision-polygon trick in `Outline.cpp` is real; Naev does use XML+Lua with PHYSFS virtual filesystem; the data is partitioned by faction/species. The conceptual design observations (faction visual palettes, hazard tiers, the core→fringe→edge progression model) are sound genre analysis and largely correct. |

## What's genuinely worth carrying forward

### From `endless_sky_audit.md` — HIGH salvage value:
- **The data-architecture description (§1)** is accurate and matches the cloned repo: tokenized text files per species under `data/<species>/`, ships.txt format, the `images/ship/` sprite pipeline, `Outline.cpp` alpha-channel collision polygon generation. Verified correct.
- **The faction list (§2)** — the 11 factions named (Republic, Syndicate, Free Worlds, Hai, Unfettered Hai, Remnant, Wanderers, Korath Exiles, Korath Automata, Quarg, Pug) are real ES governments. The lore descriptions are broadly correct. **BUT**: ES actually has MORE than 11 (the data tree has 19 species dirs — avgi, bunrodea, coalition, gegno, incipias, kahet, rulei, sheragi, successors, vyrmeid are all missing from agy's list). So agy sampled the famous ones and missed ~8.
- **The ship aesthetic notes per faction** (Hai = organic turquoise beetle shapes, Korath = rusted disks, Quarg = gleaming white/gold, Wanderers = leaf-like blue/purple) are correct and useful for the faction-visual-identity pipeline (P3).
- **The Tier 1/2/3 alien tech progression model** is a real ES depth technique worth adopting.
- **The "Space Wonders" examples** (Quarg Ringworld, Pug Wormhole, Korath Exile Hulk Graveyard) — the *concept* of faction-signature megastructures is sound even if the specific examples should be verified against ES's data.

### From `naev_audit.md` — HIGH salvage value:
- **The XML+Lua+PHYSFS architecture description (§1)** is accurate and verified against the cloned repo.
- **The faction list** (Empire, FLF, Dvaered, Sirius, Za'lek, Thurion, Soromid, Frontier Alliance, Black Lotus, Proteron) is real — matches the `dat/factions/` dir. BUT again incomplete: naev also has collective, cultist, dreamer_clan, goddard, independent_mercenary, lost, marauder, mercenary, miner, nasin (verified by `ls`).
- **The "ships classified by size 1-6 and role"** is correct Naev schema.
- **The Soromid biological-ships concept and Thurion cybernetic-uploaded-minds concept** are real, distinctive, and exactly the kind of "faction identity through ship biology" that P3 should learn from.

### From `market_synthesis.md` — MEDIUM-HIGH salvage value (this is agy's best work):
- **The core→fringe→edge progression model (§1)** is sound genre analysis and matches how all the researched games structure danger/wealth. SpaceFace already has a version of this (tier 0-4 sectors); the synthesis frames it well.
- **The faction visual identity table (§2)** — the 5-archetype palette map (Lawful Military / Corporate / Scrappers / Mystics / Robotic) is genuinely useful as a *visual differentiation framework*. This is the kind of pattern observation that's hard to get wrong and directly applicable to P3 (Faction Kits).
- **The SpaceFace adaptation section (§3)** — the vertical-scale-on-XZ-plane observation (use Y-axis for landmarks/spires that the player flies under) is a smart, real design idea worth carrying into P1 (Landmarks). The dynamic-event-zone via distance-check is already how SpaceFace works (verified: `eventBus` + proximity).
- **The hazard-tier framework (nebulae block sensors, radiation DoT, debris collision)** is a clean taxonomy SpaceFace's hazard system could adopt.

## What's NOT worth carrying forward

- **Any exact stat number** — re-derive from data files.
- **Any "comprehensive" count claim** — re-derive via grep/wc.
- **The specific planet/system coordinates** (e.g. "Sol System pos 0 0", "New Rome pos -120 40") — unverified, likely partial. The verified extraction will pull real map data.

## How the verified extraction agents should use these

Each open-source extraction agent has been told to read the actual repo. As a secondary instruction, they should **cross-check their findings against the corresponding prior audit** and note where agy's report was accurate vs. incomplete vs. wrong. This:
1. Turns the prior work from "wasted" into "a hypothesis list to verify" — a real time-saver.
2. Produces an explicit accuracy audit of the prior reports (useful for trusting/distrusting future agy output).
3. Catches any real content agy found that the verified pass might miss (e.g. a named ship agy recalled that the parser might overlook due to formatting).

## Banner revision

The banners on the 7 prior files should be softened from "do not trust" to "partially verified — see SALVAGE_NOTES.md for what's usable." The conceptual/architectural content is largely sound; only the specific stats and counts need re-verification. That's a more honest framing and doesn't throw away agy's actual analytical work.
