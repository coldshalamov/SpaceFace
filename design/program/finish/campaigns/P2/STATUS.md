# P2 — parts that explain themselves — status

**2026-11-06, Lane 4 (SHIP). Re-reviewed and corrected after independent review.**

## Done

| Piece | Where |
|---|---|
| One reader for a part's player-facing facts: `role`, one plain `sentence`, `tier` as **Mk I/II/III**, `intent` (Fight / Survive / Move / Carry / Work / Sneak), `previewId` (null until a clip exists), `previewState` | `src/ui/ship/partFacts.js` |
| Coverage: every **purchasable** module, weapon and bomb has role, sentence, tier and intent — 166 ids (130 modules + 28 weapons + 8 bombs); the 206 figure is the module+weapon catalogue, not the purchasable total | `test/part-facts.test.mjs` |
| The catalogue's ordering: intent → Mk ladder → name (`sortIdsByIntent`), replacing slot-letter + price ordering in the fitter. This is intent-first **within one selected slot list**, not a cross-slot catalogue sort | `shipworks.js` chooser candidates |
| Intent headings with counts in the shop and the hold list (`FIGHT 10`, `WORK 2`), so a large Work bucket is a section, not a wall | `shipworks.js` `intentGroupedHtml` |
| Every fitter row reads `role · Mk` plus the part's full sentence from the one reader. The stat effect is the Ship Sheet's own tenths delta (`+1.9 Firepower`), not raw DPS/range/mass/draw chips | `shipworks.js` rows |
| The entity dossier for a module reads the same `partFacts` role/tier/sentence; Mass and Power draw are engineering readings behind its Details disclosure, not decision facts | `entityResolver.js`, `entityLinks.js` |
| Ordnance uses the same facts: `Tar bomb · Mk I`, its authored sentence, intent sort and intent headings; no bare `T2` or `Fuze/cooldown` engineering line | `shipworks.js` bomb chooser |
| The attack-rig family is read from `attackTraits.js`, not mistaken for bare utility: 17 rigs have specific roles (Piercing rig, Forked rig, Bank rig, Warhead core, Relay rig, Tether amp, Cryo rig, Spread rig, Storm rig, Mount rig) and all are **Fight** | `partFacts.js` attack-trait taxonomy |
| Live non-damaging weapons read Fight with a specific role: Vector Mine is a **Shove mine**, Mass Driver a **Slug driver**, and the Gravity Wellhead a **Gravity well** — never `Tool mount` / Work | `partFacts.js` weapon-role overrides |
| Engines read **Drive**, not "Manoeuvre kit": a neutral `turnMult/strafeMult/brakeMult` of 1 is the stock value, not a positive move. Mount rigs, warhead cores and heat sinks are Fight; Jump Drive is Move | `partFacts.js` role/intent maps |
| Six display names that repeated the tier token (`Jump Drive T2 M`, four `Mk2` names, `Shroud Cloak Mk1`) are cleaned through `PART_DISPLAY_NAMES`; the tier column carries the ladder | `partFacts.js` |
| The duplicate probe uses **exact** authored signatures: slot, size, mass, draw, tier plus mods for modules, authored weapon/ordnance fields for the rest, and the trait id for attack rigs. It never claims role+intent+tier is enough. A known true duplicate is found (`mod_ram_plate` / `mod_ram_plate_scarred`); a known false positive is rejected (Swing Drive M vs S differ by size/mass) | `partFacts.js` `partSignature` / `duplicateGroups` |
| The P2 test: all purchasable ids have role/sentence/tier/intent/preview state; sentence is not the name; no role bucket swallows the catalogue; attack rigs are Fight; engines are Drive; bombs read `unlockTier`; exact duplicates found and false positives rejected; intent ordering is contiguous; unknown ids fail closed | `test/part-facts.test.mjs` (new) |

## Words

- Tiers: `tier 1–2 → Mk I`, `3 → Mk II`, `4–5 → Mk III`; ordnance reads `unlockTier`.
- Intents: **Fight** (put damage on something), **Survive** (take a hit and stay in), **Move** (go
  faster, turn harder, break away), **Carry** (move cargo and salvage), **Work** (mine, tow, sweep,
  see), **Sneak** (not be seen, not be hit).

## Coverage counts (2026-11-06, corrected)

- **166 purchasable ids**: 130 modules + 28 weapons + 8 bombs. The 206 catalogued figure counts
  modules + weapons only.
- Purchasable role buckets: largest 12 (`Line head`), then `Gun · M` 9, `Sensor` 8, `Gun · S` 7,
  `Manoeuvre kit` 6, `Hull burst` 6, `Drive` 5. No role bucket exceeds 30% of the purchasable set.
- **`Utility` is no longer a bucket at all: 0 of 166.** The 17 attack rigs that used to fall there
  now read their specific rig role and Fight.
- Purchasable intents: Work 54, Fight 54, Move 19, Survive 18, Sneak 14, Carry 7. Work is a
  section heading with a count, not an undifferentiated wall; it is no longer 74.
- Exact duplicate groups over the 166 purchasable ids: **166 signatures, no duplicates** (the old
  157-group probe was grouping same-field variants). The full module catalogue contains exactly one
  true pair, `mod_ram_plate` / `mod_ram_plate_scarred`; the probe finds it.

## Words the catalogue no longer prints

- No `T2`/`T3` digit on a part row; the ladder is Mk I/II/III.
- No `Utility` role for cloak, plating, point defence, sensors, line heads or attack rigs.
- No `Tar`/`Ballast` bomb filed as Sneak.
- No raw `DPS / RANGE / MASS / DRAW` chip on a chooser row; the row's numbers are the six-stat
  tenths delta.
- No `Different: +25 % shield flat` line on a unique module row; the sheet delta is the one
  statement of what a fit changes.
- No "Manoeuvre kit" engine and no "Utility" attack rig.

## Evidence (real runs, 2026-11-06)

- `node --test test/part-facts.test.mjs` — **10/10 pass**.
- `node --test test/ship-stats.test.mjs` — **20/20 pass**.
- `node scripts/check-ui-screen-imports.mjs` — **55 ok, 0 fail**.
- `node scripts/check-outfitting-buy-fit.mjs` — **OK** (the dead engineering presenter is no longer
  enforced by the check).
- `node scripts/ui-bench.mjs --shot=station-shipworks` — clean render; the focused chooser probe
  shows intent headings, role/Mk rows, sentences and stat deltas.

## Not done / open — stated plainly

1. **The 3–5 s preview of the part in action is not built.** There is no clip, no player, and no
   manifest entry. `PART_PREVIEW_MANIFEST` is empty and every part honestly reports
   `previewId: null`, `previewState: 'not-built'`; the P2 test asserts that, so a future rig can add
   manifest entries without changing a row. **No text preview was put in its place.**
2. **Near-duplicate merging is not done.** The exact-signature probe is the honest detector; the
   actual merge/retirement pass is content work. The detector does not claim role+intent+tier is
   enough (a claw anchor and a cargo scanner are not duplicates), and it now includes the fitting
   fields that caused the old Swing Drive false positive.
3. **The catalogue is not globally sorted across the whole fittable set.** A slot type is a fitting
   constraint, so the chooser passes one slot's compatible list to `sortIdsByIntent`; there is no
   cross-slot browse mode. The P2 wording and test state that truth.
4. **Deltas on the part card** are the Ship Sheet's own hover/paint deltas, not a per-part
   before/after printed in the row. The row now carries the tenths delta chips; a committed
   per-row "before/after" line remains open.
5. The **Swarm shop** and **Crucible Ship & Kit** are not wired to this reader; they live in the
   SWARM lane's files and were not edited here. The published interface is `partFacts(id)` for a
   shop card and `shipStatSheet` / `shipStatDelta` for the six stats.
6. **Starter content is minimally retuned, not re-authored.** Hitch now carries the shield liner so
   every starter pair differs by at least two whole bars and every rail label is unique; the
   authored blurbs and the wider starter fit ladder are still content work.
