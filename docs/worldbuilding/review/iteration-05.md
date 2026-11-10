**REVIEW ITERATION 05 — DOSTOYEVSKY LAYER + SHEET ARCHITECTURE + CANONICAL CHAPTERS**

*The build-out pass. After iterations 01–04 (continuity, foreshadowing, moral rot, tic-deduction),
this iteration adds (1) a Dostoyevsky thematic substrate layered into the existing cold le Carré /
Bacigalupi / McCarthy voice, (2) a sheet architecture giving every entity a structured home for
the first time, and (3) the canonical chapter build-out (B0–B7) that uses those sheets. Per owner
decision: Dosto as thematic layering (voice intact), in-game beat-script chapters (matching
chapter-01), new `sheets/` subdir.*

---

## I. What was built

### A. The Dosto layer (`DOSTOYEVSKY-LAYER.md`, ~2,800 words)
One scaffolding document — the only place Russian-author names appear. Canonicalizes six themes
for this world:

1. `guilt_as_physiology` — the Slow Gray as the moral weight metabolized as climate. The body
   keeps the score the system refuses to file.
2. `the_double` — the player meets themselves three times (Elroy at B2, the Kurtz figure at B7,
   themselves-as-Vale in Choice A). The double is the gradient, not a twist.
3. `crime_without_punishment_system_stolen` — the central bridge. The system files crime as lawful;
   the collapse that should come is administratively withheld. The absence is the wound.
4. `the_holy_fool` — Hale. Innocence as load-bearing structural element. Named, not invented.
5. `suffering_as_epistemology_redeemed_and_refused` — the load-bearing divergence from Dosto.
   Suffering reveals truth; truth does not redeem. Kessler saves anyway. Dignity in continuation.
6. `ressentiment_underground_man` — Quinn (rage register), Rook (calculation), Drift (denial).
   The Underground Man in three Pet-clerk registers.

Plus the element→entity map (table) and two deepened figures: **Hale → the holy fool** (named,
not changed) and **the Kurtz figure → the Grand Inquisitor variant** (the wrong mercy —
imprisoned the truth out of compassion for the people who'd have to act on it; discovered, across
eleven years, that knowing was the one thing that changed nothing).

### B. The sheet architecture (`sheets/`, 48 sheets + README + INDEX)
Five declared schemas (character / faction / world / commodity / chapter). Every sheet carries a
`dostoyevsky_layer` / `dostoyevsky_beat` field citing the theme doc by id, and a `canon_refs`
block pointing to the prose file where the voice lives. **Sheets are the structured index; prose
remains the voice.** The two never duplicate a sentence.

- **15 character sheets** — for the first time, Wren, Elroy, Lida, and the old crew have a
  structured, discoverable home. The 8 NPCs, Vale, Callum, and the Kurtz figure each get fields.
- **8 faction sheets** — fields lifted from the existing 7-field template + new `silt_role` +
  `dostoyevsky_layer`. Canon 8th faction = Helix Directorate (not "Free Frontier"); the playable
  `faction_free`/Free Frontier in `src/data/factions.js` has no canon sheet — flagged in INDEX.
- **11 world sheets** (S0 + 10 sectors) — own the *narrative* attributes + Dosto layer; cross-
  reference `design/world-identity/sectors/*.md` (render/palette/GLB) without duplicating.
- **6 commodity sheets** — adds the two rows (`atmo-credit`, `atmo-debt`) the prose table lacked.
- **8 chapter sheets** — the reverse-index cohesion mechanism.

### C. The 8 chapters (`story/chapter-00-cold-start.md` through `chapter-07-deep-reach.md`)
~11,266 words of new chapter prose. Each chapter:
- Implements the beat from `STORY-SPINE-NARRATIVE-OVERLAY.md` + Thread-B layer from
  `STORY-STRUCTURE.md`.
- Carries one Dosto beat-theme **enacted in the medium** (a HUD line that won't clear, a manifest
  that re-categorizes mid-transit, a graffiti line that knows about a kill the system logged as
  lawful) — never in confessional prose.
- Names every entity it touches by sheet id in a chapter footer (the cohesion mechanism).
- The existing `chapter-01-CANONICAL.md` got a footer wiring it to the new system; its content
  is preserved. `chapter-00-cold-start.md` is the prose-frame prequel (the pre-loaded cargo, the
  STABLE LOAD line that won't clear).

The beat → Dosto theme → chapter spine: B0 crime-before-the-criminal → B1 the-punishment-that-
doesnt-come → B2 crime-without-punishment-system-stolen (central) → B3 the-double-appears →
B4 grand-inquisitor-ui → B5 the-unpunished-man → B6 guilt-returns-as-physiology → B7 the-double-
met-mercy-refused.

---

## II. Diff-back verification (all green)

| Check | Method | Result |
|-------|--------|--------|
| Dosto name-drops in body prose | grep Russian authors across story/sheets/vibe/orgs/contracts (excluding `DOSTOYEVSKY-LAYER.md`) | **0 matches** — names stay in scaffolding |
| Tic regression (this-is-the-point, counters-change) | grep across story/sheets/vibe/orgs | **0 matches** — iteration-04 holds |
| Protected canon lines intact | grep the LITERARY-AUDIT §I protected lines in their prose homes | **all 5 verified** — "fit two children," "savings is the prayer," "priest does not look in the hold," "eats food that doesn't taste like an apology," "paranoia is free and evidence costs something" all in original locations, untouched |
| Sheet coverage | every entity cited in chapter footers has a sheet | **15 char / 8 faction / 11 world sheets all resolve** |
| Index finalized | INDEX.md ☐→✅ | **55 ✅, 1 ☐ (the legend line itself)** |

---

## III. Cohesion notes (decisions baked into the build)

1. **Dosto is layering, not substitution.** The corpus's voice is unchanged. The Dosto themes are
   expressed in the existing cold register — HUD lines, manifests, graffiti, physiology — never in
   confession. The one place the layer hard-diverges from its source (`suffering_as_epistemology_
   redeemed_and_refused`) is documented in `DOSTOYEVSKY-LAYER.md §I` as deliberate: redemption is
   structurally unavailable in SpaceFace, and the unavailability is the point.

2. **Sheets and prose are linked, not merged.** A sheet's `canon_refs` points to the prose file;
   the prose file is authoritative for meaning. If the two drift, fix the sheet, not the prose.
   This preserves the voice-first discipline the LITERARY-AUDIT demands.

3. **The boss reconciliation (iteration-04) is honored.** `chapter-07-deep-reach.md` stages the
   Iron Maw dreadnought as the gate, the Kurtz figure's derelict behind it. No game data was
   changed; the chapter's `world_ashfall` sheet records the staged sequence and points to the
   `STORY_SECTOR_MAP.md` reconciliation note.

4. **Helix vs Free Frontier.** The corpus canon (`orgs/factions-CANONICAL.md`) has Helix
   Directorate as the 8th faction. `src/data/factions.js` has `faction_free` (Free Frontier) as a
   playable faction. The sheets use canon (Helix). The INDEX flags the mismatch for resolution —
   either Free Frontier needs a canon faction sheet, or Helix needs a `factionId` in data. This is
   flagged, not silently resolved (it touches sim/spawn behavior).

5. **chapter-01's role.** The original `chapter-01-CANONICAL.md` is the B0 first-run HUD script.
   `chapter-00-cold-start.md` is the prose-frame prequel that dramatizes the pre-loaded cargo and
   the STABLE LOAD line. The two are complementary: chapter-00 is the frame, chapter-01 is the
   script inside it. The footer on chapter-01 records this relationship.

---

## IV. What this iteration did NOT do

- **Did not name any Russian author in body prose.** Only `DOSTOYEVSKY-LAYER.md` carries the
  names. Chapters cite the doc by theme id.
- **Did not invent Dosto-named characters.** Hale and the Kurtz figure are *promoted* into the
  Dosto roles they already structurally occupied. No new NPCs.
- **Did not duplicate `design/world-identity/sectors/*.md`.** World sheets cross-reference it.
- **Did not change game code or data.** Story/canon only. The Ashfall boss reconciliation from
  iteration-04 stands; chapters honor it.
- **Did not re-litigate the LITERARY-AUDIT structural fixes.** Verified intact, not redone.
- **Did not touch the protected canon lines.** All five verified in their original prose homes.

---

## V. Files added/modified this iteration

**New — Dosto layer + sheet system (50 files):**
- `docs/worldbuilding/DOSTOYEVSKY-LAYER.md`
- `docs/worldbuilding/sheets/README.md`, `INDEX.md`
- `docs/worldbuilding/sheets/characters/{wren,kessler,drift,voss,slate,mira,hale,quinn,rook,vale,callum,kurtz,elroy,lida,old-crew}.md` (15)
- `docs/worldbuilding/sheets/factions/{concord,mts,reach,drift,quiet,vael,helix,choir}.md` (8)
- `docs/worldbuilding/sheets/worlds/{s0-pit,s1-helios,s23-meridian,s23-tycho,s23-vesta,s45-hollow,s45-bourse,s67-cinder,s67-sker,s8-veil,s9-ashfall}.md` (11)
- `docs/worldbuilding/sheets/commodities/{raw-silt-ore,refined-slurry,spent-silt-chalk,atmo-token,atmo-credit,atmo-debt}.md` (6)
- `docs/worldbuilding/sheets/chapters/{B0,B1,B2,B3,B4,B5,B6,B7}.md` (8)

**New — chapters (8 files):**
- `docs/worldbuilding/story/chapter-{00-cold-start,01-honest-work,02-first-blood,03-bigger-boat,04-pick-a-side,05-proving-ground,06-empire-seed,07-deep-reach}.md`

**Modified — footer added (1 file):**
- `docs/worldbuilding/story/chapter-01-CANONICAL.md` (footer wiring it to the sheet system)

**Modified — index (1 file):**
- `docs/worldbuilding/sheets/INDEX.md` (☐ → ✅; build-status + usage notes)

**This log:**
- `docs/worldbuilding/review/iteration-05.md`

---

## VI. Total corpus state after this iteration

- **~60,000 words** of canon prose + sheets (48,207 pre-existing + ~11,266 new chapter prose +
  ~12,000 across the Dosto doc and 48 sheets).
- **48 structured sheets** + **9 chapter files** + **1 Dosto layer doc**, all cross-referenced
  via `INDEX.md`.
- The corpus is now novel-length in the playthrough-script sense (B0–B7), with every entity
  carrying a structured sheet that the chapters cite canonically.

The Dosto layer is the substrate; the sheets are the index; the chapters are the novel. The
voice is intact. The protected lines are untouched. The system files everything under the same
code.
