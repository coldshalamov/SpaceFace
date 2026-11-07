# P2 — parts that explain themselves — status

**2026-11-06, Lane 4 (SHIP). Re-reviewed and corrected after independent review.**

## Done

| Piece | Where |
|---|---|
| One reader for a part's player-facing facts: `role`, one plain `sentence`, `tier` as **Mk I/II/III**, `intent` (Fight / Survive / Move / Carry / Work / Sneak), `previewId` (null until a clip exists), `previewState` | `src/ui/ship/partFacts.js` |
| Coverage: every **purchasable** module and weapon has role, sentence, tier and intent — 158 of 206 catalogued ids (130 modules + 28 weapons) | `test/part-facts.test.mjs` |
| The catalogue's ordering: intent → Mk ladder → name (`sortIdsByIntent`), replacing slot-letter + price ordering in the fitter. This is intent-first **within one selected slot list**, not a cross-slot catalogue sort | `shipworks.js` chooser candidates |
| Intent headings with counts in the shop and the hold list (`FIGHT 10`, `WORK 2`), so a large Work bucket is a section, not a wall | `shipworks.js` `intentGroupedHtml` |
| Every fitter row reads `role · Mk` plus the part's full sentence from the one reader. The stat effect is the Ship Sheet's own tenths delta (`+1.9 Firepower`), not raw DPS/range/mass/draw chips | `shipworks.js` rows |
| Ordnance uses the same facts: `Tar bomb · Mk I`, its authored sentence, intent sort and intent headings; no bare `T2` or `Fuze/cooldown` engineering line | `shipworks.js` bomb chooser |
| Roles and intents are authored, not one big fallback: cloak, armour/plating, point defence, sensors, line heads, tractor/tow and bomb families have specific roles; tractor/tow parts are Work and tar/ballast bombs are Fight | `partFacts.js` role/intent maps |
| Six display names that repeated the tier token (`Jump Drive T2 M`, four `Mk2` names, `Shroud Cloak Mk1`) are cleaned through `PART_DISPLAY_NAMES`; the tier column carries the ladder | `partFacts.js` |
| The duplicate probe uses exact authored signatures (mods for modules, authored weapon/ordnance fields for the rest), never role+intent+tier. It finds 157 groups and a largest group of 2 of 158; it does not claim a merge it cannot distinguish | `partFacts.js` `partSignature` / `duplicateGroups` |
| The P2 test: all purchasable ids have role/sentence/tier/intent/preview state; sentence is not the name; no role bucket swallows the catalogue; bombs read `unlockTier`; intent ordering is contiguous; unknown ids fail closed | `test/part-facts.test.mjs` (new) |

## Words

- Tiers: `tier 1–2 → Mk I`, `3 → Mk II`, `4–5 → Mk III`; ordnance reads `unlockTier`.
- Intents: **Fight** (put damage on something), **Survive** (take a hit and stay in), **Move** (go
  faster, turn harder, break away), **Carry** (move cargo and salvage), **Work** (mine, tow, sweep,
  see), **Sneak** (not be seen, not be hit).

## Coverage counts (2026-11-06)

- **206 catalogued** modules + weapons; **158 purchasable** (130 modules + 28 weapons).
- Purchasable role buckets: largest 12 (`Line head`), `Utility` 12 (7.6%), then `Manoeuvre kit` 11,
  `Gun · M` 9, `Sensor` 8. No role bucket exceeds 30% of the purchasable set.
- Purchasable intents: Work 74, Fight 29, Survive 18, Move 18, Sneak 12, Carry 7. Work is a section
  heading with a count, not an undifferentiated wall.
- Duplicate groups: 157, largest 2 (`mod_swing_drive_m` / `mod_swing_drive_s`).

## Words the catalogue no longer prints

- No `T2`/`T3` digit on a part row; the ladder is Mk I/II/III.
- No `Utility` role for cloak, plating, point defence, sensors or line heads.
- No `Tar`/`Ballast` bomb filed as Sneak.
- No raw `DPS / RANGE / MASS / DRAW` chip on a chooser row; the row's numbers are the six-stat
  tenths delta.

## Evidence (real runs, 2026-11-06)

- `node --test test/part-facts.test.mjs` — **9/9 pass**.
- `node --test test/ship-stats.test.mjs` — **16/16 pass**.
- `node scripts/check-ui-screen-imports.mjs` — **55 ok, 0 fail**.
- `node scripts/ui-bench.mjs --shot=station-shipworks` — clean render; the focused chooser probe
  shows intent headings, role/Mk rows, sentences and stat deltas.
- `node scripts/extract-localization.mjs --check` — OK after the generator write.

## Not done / open — stated plainly

1. **The 3–5 s preview of the part in action is not built.** There is no clip, no player, and no
   manifest entry. `PART_PREVIEW_MANIFEST` is empty and every part honestly reports
   `previewId: null`, `previewState: 'not-built'`; the P2 test asserts that, so a future rig can add
   manifest entries without changing a row. **No text preview was put in its place.**
2. **Near-duplicate merging is not done.** The exact-signature probe is the honest detector; the
   actual merge/retirement pass is content work. The detector does not claim role+intent+tier is
   enough (a claw anchor and a cargo scanner are not duplicates).
3. **The catalogue is not globally sorted across the whole fittable set.** A slot type is a fitting
   constraint, so the chooser passes one slot's compatible list to `sortIdsByIntent`; there is no
   cross-slot browse mode. The P2 wording and test state that truth.
4. **Deltas on the part card** are the Ship Sheet's own hover/paint deltas, not a per-part
   before/after printed in the row. The row now carries the tenths delta chips; a committed
   per-row "before/after" line remains open.
5. The **Swarm shop** and **Crucible Ship & Kit** are not wired to this reader; they live in the
   SWARM lane's files and were not edited here. The published interface is `partFacts(id)` for a
   shop card and `shipStatSheet` / `shipStatDelta` for the six stats.
