# COPY-SWEEP-2 — finish the plain-words sweep

**For:** a careful engineer. **Kind:** player-facing text and the tests that pin it. **One commit
per batch.**

## Where the first run stopped

`design/program/fleet/packets/COPY-SWEEP.md` is the full brief: read it first, it still applies.
Its first run landed four batches (commits df01ea648d, 8bc22b0484, 0f5a510731, c7aef99cfe) and then
died on an upstream API error. Keep each request small so that does not happen again: read files in
slices, never paste a whole large file back.

## Do, in this order

1. **Repair the tests that still pin the old wording.** The landed batches renamed "Massline" to
   "Line"/"line" in toasts, captions, module names and site names, and reworded a few prompts
   ("OFFICIAL DENIAL" → "STATION NOTICE: INCIDENT DENIED", "Eligibility Assessment" → "Story
   progress", "Branch standing" → "Faction trust", "Branch filed" → "Ending path", "Price pressure"
   → "Price swing", "Encounter pressure" → "Encounter risk", "AFTERMATH/FIELD RESPONSE" → "WRECK
   FOUND/CHOOSE A RESPONSE", "MASSLINE GLANCE" → "LINE GRAZED"). Find every test and script that
   asserts an old string (`git show --stat` on the four commits tells you which source files
   changed; grep `test/` and `scripts/` for the old strings), run each affected test file with
   `node --test <file>`, and update the assertions to the new wording. Do not revert the source
   wording. If a test fails for a reason other than wording, leave it and list it. Commit.
2. **Finish the batches the first run did not reach.** Run `npm run check:plain-words` if it exists
   (the first run was to create `scripts/check-plain-words.mjs`; if it does not exist yet, create
   it as the brief describes and add the npm script). Work through what it reports, plus the
   brief's remaining areas, a batch at a time: Adventure mission and contract text, station
   screens, the map and chart, tutorial and help lines, Swarm cards and results, achievements and
   statistics, error and denial toasts. Fix broken `${…}` templates and any prompt that can print
   "unbound", "undefined", "NaN" or an empty key.
3. **Units and leftovers the director saw on screen today:** the objective card and the map print
   distances as `419 u` / `BEACON 419 U` while the line below reads `457 m`; the minimap scale
   reads `200 u`. Every distance a player reads is `m` or `km`, every speed `m/s`. Sector subtitles
   on the galaxy chart print faction nicknames with no explanation ("Fulfillment", "Pitborn",
   "Archive", "Choir", "Understory"): give each a three-word plain description on hover or beside
   it (who they are), using the faction data.

## Prove

`npm run check:plain-words` passes. The tests you touched pass (`node --test` on each file; never
run the whole suite). List in the receipt: batches committed, tests repaired, tests left failing
and why, and the words you were unsure how to replace.

## Files

Player-facing strings anywhere under `src/` and their tests. Do not change behaviour, ids, save
keys or event names; text only. Other agents are editing `src/ui/galaxyMap.js`, `src/ui/radar.js`,
`src/ui/localmap.js` and the map folder this hour: for those files use
`bash scripts/fleet/own-commit.sh begin <file>` before editing and
`bash scripts/fleet/own-commit.sh commit "<message>" <files>` so only your lines land.
