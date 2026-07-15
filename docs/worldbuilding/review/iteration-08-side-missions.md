# Iteration 08 — Side Mission Authoring & 3× Critique Trail

> Five literary side missions authored as depth-h encounters (320–324), each a
> distinct steal from the creator pantheon (Stanhope/Hedberg/Theo/Gilligan/Ritchie/
> Scorsese/Leonard/le Carré/Bacigalupi). Each was written, then diffed three times
> against the pantheon report + the LITERARY-AUDIT's protected canon + Leonard's
> "if it sounds like writing, rewrite it" test. This is the trail.

---

## Pass 1 — Initial draft (the steal)

| # | File | Steal | Core move |
|---|------|-------|-----------|
| 320 | the-botched-procedure | Gilligan | Competent plan, one lethal detail. Sealant rated for the gas being lost. |
| 321 | the-customs-logic-puzzle | Stanhope | Officer's evasion is a syllogism. The airtightness is the confession. |
| 322 | the-backwater-escort | Theo Von | Miner's analogy ("third drawer") is a window into hidden history. |
| 323 | the-wrong-laugh | Scorsese | Salvager laughs at a manifest. The laugh is the moral x-ray. |
| 324 | the-literalized-drawer | Hedberg | REF 44-C as a physical drawer. One angle, followed literally. |

**Pass 1 critique (against pantheon + audit):**

- **320:** strong, but the primaryLine explains the joke ("Sealant rated for non-reactive atmospheres only. Hull atmosphere is reactive"). Gilligan's version would show the consequence, not label the mismatch. The wreck's log should state the facts and let the player trip on the contradiction. → **Revise: state the sealant rating and the hull gas separately; don't connect them.**
- **321:** the primaryLine is good (Stanhope logic-chain). But the `press` receipt adds "So is the silence" — that's the author leaning in. Leonard: cut it. The syllogism is the confession; adding "silence" underlines it. → **Revise: end the officer's line at "The chain is unbroken."**
- **322:** the drawer analogy is good (Theo specificity). But the `ask` receipt says "You did not [laugh]" — that's telling the player how to feel. Theo's humor is the miner's, not the player's reaction labeled. → **Revise: cut "You did not"; let the coordinate+laugh juxtaposition do the work.**
- **323:** the `[laughing]` stage direction is a writerly tag. The laugh should be in the line itself, not bracketed. Also "the place the sound came from. You know that place. You've been there" in the `walk` receipt is the author moralizing at the player. Scorsese shows the laugh; he doesn't narrate what it means to the viewer. → **Revise: unbracket the laugh; cut the `walk` receipt's moralizing.**
- **324:** clean. The drawer is physical. The receipts are facts. No over-writing. → **Keep.**

---

## Pass 2 — Revisions applied

**320 revised primaryLine:** `DERELICT LOG: Hull breach sealed with sealant compound. Sealant rated: non-reactive atmospheres. Hull atmosphere at breach: hydrogen-sulfide trace. Sealant holding.`
*(Now the player trips on "non-reactive" + "hydrogen-sulfide" themselves. The joke isn't labeled.)*

**321 revised `press` receipt:** `OFFICER PRESSED — "The weight is Logistics Oversight. Oversight is Vale. Vale is the seal. The seal is mine. The chain is unbroken."`
*(Silence cut. The syllogism ends on "unbroken." The unbrokenness IS the silence.)*

**322 revised `ask` receipt:** `MINER TALKED — the drawer had his sister's medical records. The records had a coordinate. The coordinate doesn't match any chart. He laughed about it.`
*(Player's reaction cut. The laugh is the miner's. The reader supplies the unease.)*

**323 revised primaryLine:** `SALVAGER: Sorry. Sorry. It's the manifest. Cargo line says RELIEF SUPPLIES. Fourteen tonnes. The wreck's been here six months. Nobody's looking for fourteen tonnes of relief. [He laughs. He stops.]`
*(Laugh is in the action, not bracketed as a stage direction. The "stops" is the Scorsese oscillation — funny, then appalling, in one beat.)*

**323 revised `walk` receipt:** `SALVAGE LEFT — the salvager stays. You go. The laugh does not come with you. The manifest does.`
*(Moralizing cut. Facts only: the salvager stays, the player goes, the cargo is the thing that follows.)*

**Pass 2 critique:**

- **320:** now clean. The hydrogen-sulfide detail is specific (Gilligan's "hydrofluoric acid won't eat through plastic" energy). The receipts don't explain. The graffiti ("THEY FIXED THE LEAK. THE FIX WAS THE LEAK.") is the one allowed thematic line — and it's testimony, not author-commentary (audit rule: graffiti = fact, not maxim). **Approve.**
- **321:** the syllogism lands. The appeal receipt ("The window has been open 14 years") connects to the Pit's atmo-debt without explaining the connection. **Approve.**
- **322:** the drawer analogy is now purely the miner's. The coordinate callback to Thread B (Lida) is planted without being explained. **Approve.** One concern: "I'm the cutlery" — is that too cute? Re-read. No — it's the miner's sincere self-undercut (Theo's "earnestness and stupidity"). The miner genuinely believes he's the good cutlery in the scary drawer. The earnestness is the joke. **Keep.**
- **323:** the `[He laughs. He stops.]` works. The `split` receipt ("Does not thank you. Does not stop counting") is Scorsese — the salvager's character revealed by what he doesn't do. **Approve.**
- **324:** still clean after re-read. The `file` choice ("your signature joins the column") implicates the player without narrating their feelings. **Approve.**

---

## Pass 3 — Final Leonard test ("does any line sound like writing?")

Applied to all 5 files, line by line. Findings:

- **320:** "Neither admits the other" (in `leave` receipt) — borderline writerly. But it's the receipt voice (the "house voice" that the ad-board and encounters.js already use), and the house voice IS allowed to be aphoristic (proof: "SURVIVOR BENEFITS REQUIRE A SURVIVOR"). The house voice is an institution, not an author. **Keep — consistent with existing receipt register.**
- **321:** clean. Every line is the officer or the institution.
- **322:** "The coordinate doesn't match any chart" — this is a fact, not a flourish. Clean.
- **323:** "The laugh does not come with you. The manifest does." — this is the receipt voice again. The parallelism is the institution's, not the author's. **Keep.**
- **324:** "The drawer does not judge the paper. The drawer is the only honest thing in the annex." — the second sentence is the one that sounds most like "writing." But the drawer-as-honest-narrator is a motif the corpus already established (graffiti is the only honest narrator; here the drawer is the graffiti's cousin — a physical object that holds truth the system won't). It's load-bearing, not decorative. **Keep — but flagged: if a future pass finds the drawer motif over-used, this is the first line to cut.**

**Pass 3 verdict:** all 5 approved. No line fails the Leonard test that isn't either (a) the established receipt/house voice, or (b) a flagged-and-defensible motif.

---

## Runtime architecture note

All 5 encounters reuse `E1_ENCOUNTER_RUNTIMES.h9` — a new generic literary handler added to `e1EncounterRuntime.js`. The handler:

- `fire()`: calls `begin()` (emits primaryLine, offers choices, starts 45s timeout)
- `tick()`: calls `timeoutChoice()` (auto-resolves on timeout)
- `choose()`: optionally emits graffiti (from the encounter's `graffitiOn[choiceId]` map), then calls `finish(d, live, state, choiceId)` — the choiceId becomes the outcome, which indexes the encounter's `receipts` map.

This means each encounter's `choices[].id` values must match its `receipts` keys exactly (the outcome = the choiceId). All 5 files honor this. No bespoke per-mission handler needed. Determinism preserved (no Math.random, no wall-clock; the only RNG is the existing graffiti-set selection in `authoredGraffiti`, which is seeded).

---

## What this iteration did NOT do

- **Did not add bespoke combat/prop spawning.** These are pure literary encounters (noCombat: true). The h9 handler spawns nothing. If a future pass wants a literary encounter with a prop (like h4's buoy), a bespoke handler or an extended h9 would be needed.
- **Did not wire encounters to Thread B / operation layer.** The 322 coordinate callback and the 321 REF 44-C appeal are planted as civilian-readable hooks. The operation second-reading is not authored for these (they're side missions, not spine). A future Le Carré pass could add operation readings.
- **Did not touch `test/*.expected.json`.** These are additive data files; the encounter index is regenerated, not the goldens.
- **Did not edit the protected canon.** No changes to the fenced lines in LITERARY-AUDIT §I.

---

## Verification checklist

- [x] All 5 files match the `NNN-name.js` naming convention
- [x] `encounterOrder` values (320–324) are unique and sequential
- [x] `trigger.id` matches the default export's `id` in each file
- [x] Each `choices[].id` has a matching `receipts` key
- [x] `timeoutChoice` is a valid choice id (or null)
- [x] h9 handler added to `E1_ENCOUNTER_RUNTIMES` export
- [ ] `npm run build:encounter-index` regenerated (next step)
- [ ] `npm run check:encounter-index` passes (next step)

---

> **Canon refs:** `LITERARY-AUDIT.md §I` (protected canon — untouched), `LITERARY-AUDIT.md §IV` (the Ritchie/McCarthy resolution — the missing strut these missions supply), `DOSTOYEVSKY-LAYER.md` (enacted, not named), `LECARRE-LAYER.md` (civilian readings only; operation readings deferred).
