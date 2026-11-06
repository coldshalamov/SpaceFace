<!-- LIFETIME: CAMPAIGN -->
# W1 — The Journey: diagnosis memo

**Campaign:** W1 (MASTER_PLAN Part 3). **Lane:** 5 WORLD. **Date:** 2026-11-06.

## 1. The player-visible problem, in plain words

A new player finishes the tutorial, undocks from Helios, and is handed a galaxy of 10 sectors,
370 encounters, 15 bar contacts, three endings hooks and 1,400+ voice files — with no answer to
"what is this game about, and what am I doing next?" There is no journey: no act structure, no
critical path, no escalating goal the pieces hang from. The world's content is a pile, not an
experience. The owner's report card grades Story/memory **Bronze+** with the diagnosis "deep
simulation, quiet surface": designed things the player never meets.

## 2. The measured cause chain (counts verified 2026-11-06 in this checkout)

| Claim (report card) | Verified today | Where |
|---|---|---|
| 10 sectors are "a name plus a hazard circle" | 10 sector defs (`sector_helios_prime` … `sector_veil_nebula`) | `src/data/sectors.js:53-…` |
| "211 lived vignettes from one template" | drifted **up**: 176 files named `lived-*`, **225 encounter files** instantiate the same `compileVignette` template | `src/data/encounters/393…406-lived-*.js`, `src/systems/vignetteInterpreter.js` |
| "12 of 15 contact counters never move" | 16 counter defs over 15 named contacts (`contact_maera_vols` … `contact_yune`) | `src/data/stationContacts.js` |
| "439 voice lines unused" | **1,429 voice WAVs** on disk under `assets/*/voice*`; wiring inventory pending (agent C) | `assets/audio/`, `src/data/contactHail.js`, `borrowedVoice.js` |
| "three heists, one door" | 1 authored heist type `heist_intercept` (PQ-019C Tethys capsule-run) + `heistFacilities.js` | `src/data/heistMission.js`, `heistFacilities.js` |
| Encounters | **370 files** in `src/data/encounters/` | inventory pending |
| Endings A–E exist | 11 modules in `src/story/endings/` (defs, eligibility, finale, world-after) | read directly below |
| A campaign spine exists | `src/story/campaign47a/storySpine.js` (961 ln) + ledger, facts, receipts, transitions | read directly below |
| "No single document says act 1 happens here" | no Journey doc exists anywhere in `design/` | this campaign's deliverable |

The cause is **arrangement, not absence**: every ingredient of a journey already exists (spine
beats, an act-verb structure implied by the spine, endings with eligibility conditions, a bar
roster, 370 encounters, 10 sectors with data files for identity). What is missing is (a) one
document that orders them into acts, and (b) a thin pacing layer that steers a player along that
order using what already fires (mission board recommendation, spine beat index, ledger).

## 3. The architecture question

Is the design the bottleneck? **No — the spine/ledger architecture is sound and is the road.**
`systems/story.js` is a registered overlay; `storySpine.js` is the single writer of
`campaign47a.flags.spine`; `storyFacts.js` is the single writer of facts (cap 64);
`missions.js` owns `beatIndex`/branch/chain; the mission board already has a recommendation
engine; endings eligibility is pure. A second quest system beside this spine would duplicate a
working single-writer design — forbidden by the lane prompt and by ARCHITECTURE's
single-writer contract. Building new lore would also fail the lane rule ("no new lore for its
own sake").

What replacement would cost: re-authoring 370 encounters' hooks and the save schema. What it
would buy: nothing the spine cannot already express. **Chosen road:** inventory → arrange into
3–4 acts in a Journey doc (owner-approved) → implement a small **pacing director** that reads
spine/facts/ledger state and steers (gating, board recommendations, act beats) reusing the
existing single writers → walk act 1 on the ordinary route.

## 4. Verify (owner-facing finish line for W1)

Per MASTER_PLAN W1: an agent plays a fresh save through act 1 on the ordinary route, beats happen
in order with no dead ends, and a "what do I do next?" check at ten random moments always has a
visible answer. W1's doc phase **stops for owner approval** before implementation.

## 5. Working files

- `inventory/ENCOUNTERS.md`, `inventory/SECTORS.md`, `inventory/CONTACTS_SYSTEMS.md` — agent-built
  inventories (raw material for the one table).
- `JOURNEY.md` — the deliverable this campaign stops on.
- `STATUS.md` — resume state.
