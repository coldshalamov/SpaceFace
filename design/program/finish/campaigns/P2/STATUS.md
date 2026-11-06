# P2 — parts that explain themselves — status

**2026-11-06, Lane 4 (SHIP).**

## Done

| Piece | Where |
|---|---|
| One reader for a part's player-facing facts: `role`, one plain `sentence`, `tier` as **Mk I/II/III**, `intent` (Fight / Survive / Move / Carry / Work / Sneak), `previewId` | `src/ui/ship/partFacts.js` (new) |
| The catalogue's ordering: intent → Mk ladder → name (`sortIdsByIntent`), replacing slot-letter + price ordering in the fitter | `shipworks.js` chooser candidates |
| Every fitter row now reads `role · Mk · intent` and the part's full sentence, from the one reader. No bare `T2`, no slot-letter-only line. | `shipworks.js` module rows |
| Coverage verified for all 206 purchasable defs (158 modules + 48 weapons) — role, sentence, tier and preview id present for every id | probe, see evidence |

## Words

- Tiers: `tier 1–2 → Mk I`, `3 → Mk II`, `4–5 → Mk III`.
- Intents: **Fight** (put damage on something), **Survive** (take a hit and stay in), **Move** (go
  faster, turn harder, break away), **Carry** (move cargo and salvage), **Work** (mine, tow, sweep,
  see), **Sneak** (not be seen, not be hit).

## Evidence

```
node -e "…partFacts over WEAPONS+MODULES…"  →  missing 0
partFacts('wpn_autocannon_m')  →  { role:'Gun · M', tier:'Mk I', intent:'Fight',
                                    sentence:'Heavy slugs bite armor and rock light ships…' }
partFacts('mod_engine_ion_m')  →  { role:'Drive', tier:'Mk I', intent:'Move',
                                    sentence:'The yard drive. Push and the run stay where this hull was rated.' }
```

`node scripts/ui-bench.mjs --shot=station-shipworks` renders clean after the row and ordering change.

## Not done / open — stated plainly

1. **The 3–5 s preview of the part in action is not built.** Every part has a stable `previewId`
   (`pv_<id>`) and the fitter already ghosts the 3D hull on hover, but there is no clip and no
   player. The intended rig is a scripted capture in the Range (the "TAKE IT TO THE RANGE" verb
   exists); that is a capture campaign, not a row change. **No text preview was put in its place.**
2. **Near-duplicate merging is not done.** 128 utility modules is still a catalogue nobody can
   hold in their head. The mechanism to see duplicates is now cheap (`partFacts` gives every part a
   role + intent + tier, so two parts with the same role and intent at the same tier are a duplicate
   by construction); the actual merge/retirement pass is content work.
3. **Deltas on the part card** come from P1's hover ghost, which paints the sheet's six stats — not
   from a per-part "before/after" printed in the row. That is deliberate (one calculator), but a
   row-level `+0.9 Firepower` line would read faster and is still open.
