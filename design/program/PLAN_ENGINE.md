<!-- LIFETIME: ACTIVE_PROGRAM -->
# The plan engine — how agents keep SpaceFace's plan saturated

Owner direction, 2026-10-19: part of SpaceFace's premise is finding out how good a game agents can
build themselves, so the plan must refill itself. This file is the contract for that refill. The
vision it serves is [`build_map.md` §32](../../build_map.md#32-the-gold-game--the-directors-vision-and-the-engine-that-keeps-the-plan-full-2026-10-19).
The grades it maintains are [`REPORT_CARD.md`](./REPORT_CARD.md).

This file does **not** create a queue. Its only outputs are rows on the existing surfaces:
numbered `build_map.md` §1C rows assigned to seams, and OPEN lines in
[`INFERENCE_IDEAS.md`](./INFERENCE_IDEAS.md). An engine cycle is planning support work. It never
counts as a production unit, and it never builds what it mints.

## 1. When a cycle runs

Run the next cycle in the rotation (§3) when `program-dispatch --next` returns no defect, stale
`NOW.md` row, or landed review, **and** either of these holds:

- fewer than **25** counted BUILD/ART/FIX rows are OPEN on §1C (lanes and PARKED rows don't count);
- fewer than **30** INFERENCE lines are OPEN.

Above **120** open counted rows or **200** OPEN lines, run **C8 Prune** instead of any minting
cycle. The plan stays saturated, not bloated.

Row 455 (ENGINE-0) teaches `scripts/program-dispatch.mjs` to return the due cycle and
`scripts/check-plan-integrity.mjs` to report it. Until it lands, agents apply this section by hand.

## 2. The output law (every cycle)

- **Rows** go in `build_map.md` §1C §N. They take the next free numbers and are assigned to an
  existing seam, or to a new seam whose files are disjoint from every other seam. Each row carries
  a player-visible done-when (seed 4242 or a capture), the real owner paths, a refusal, and a
  milestone tag (M1–M6, §32.5) where one applies.
- **Lines** go in `INFERENCE_IDEAS.md` under a heading named for the cycle and date. Each line has
  the change, the paths, the done check, a don't, and evidence of absence (a grep or a read).
- **Every "missing" claim is verified in live code.** Grep the code before quoting any plan prose;
  plan prose drifts (§31.0).
- **Never re-mint what exists.** Read §23, §30, §31, §32 and the open rows first.
- **No new systems that duplicate owners**, and no edits to the architecture laws.
- **Update §1C's remaining-count table** and run `node scripts/board-chunks.mjs --check`,
  `node scripts/check-plan-integrity.mjs` and `node scripts/check-inference-control.mjs` before
  pushing.
- **Record the cycle** in §5 below (date, cycle, what it minted).

## 3. The rotation

C1 → C2 → C3 → C7 → C1 → C4 → C5 → C6, then repeat. C8 runs whenever the caps are exceeded.

### C1 — Report Card (grade, then mint)

- Take the system group with the oldest grade in `REPORT_CARD.md`.
- Run the brief [`plan-engine/REPORT_CARD_BRIEF.md`](./plan-engine/REPORT_CARD_BRIEF.md) for that
  group: read the code, look at current captures, and compare against named 2020s games.
- Update the group's grades, with evidence lines, in `REPORT_CARD.md`.
- **Mint** ≥4 rows that lift the lowest-graded system, ≥2 polish rows for the highest-graded one,
  and ≥8 catalog lines.

### C2 — Stranger Pass (play-capture, then list the cheap tells)

- Run the existing player-truth actor (`npm run player-truth -- --mode=<adventure|swarm|racing>`)
  or the ui-bench, for the current milestone's route.
- Open the contact sheet and the stills. Write every cheap tell a stranger would see (§31.5 lists
  the kinds).
- **Mint** a FIX row or a demo-ledger defect per tell, grouped by seam.

### C3 — Reference Diff (one game per cycle)

- Take the next unchecked game in §4.
- Inventory the mechanisms and the life details it uses that fit SpaceFace's pillars (§32.1).
  Diff that inventory against live code.
- **Mint** one line per real, pillar-fitting miss. Mint a row when a miss is campaign-sized.
- Check the game off in §4.

### C4 — Factory Tiering (raise the volume targets)

- For each PULSE factory (§31.6) whose current target is met, measure repetition on a 1-hour
  capture or a log replay.
- If content repeats sooner than the tier allows, raise the target one tier and mint the fill
  lines: Bronze 300 entries, Silver 1,000, Gold 3,000, or the equivalent hours of programming for
  radio.

### C5 — Dream (the creative director)

- Invent three new campaigns in the §23 register: a feeling, a borrowed thread, a mechanism and a
  refusal. Each must answer VISION's three questions and serve at least two pillars (§32.1).
- Write all three as a §32.x design note. The strongest becomes rows; the other two wait as notes.

### C6 — Integration Walk

- After every 20 landed §N rows, play the current milestone route end to end, or have the actor
  play it.
- **Mint** connective-tissue rows wherever two finished systems fail to meet: a fact one writes and
  the other never reads, or a screen that ignores what just happened.

### C7 — Harvest (built but unwired)

- Find dead seams: events emitted with no listener, data with no consumer, readers with no data
  (the `revisitNeed` pattern from §31.0), and screens nothing navigates to. Start from
  `docs/EVENT_ROUTING.md` and `docs/SYSTEM_REGISTRY.md`.
- **Mint** "wire the truth" lines. A dead seam with no player value is listed for deletion instead.

### C8 — Prune

- Merge duplicate rows and lines. Close rows that are already true, with the evidence. Retire rows
  the vision no longer wants, with one causal sentence each. Re-tag milestones.
- C8 never deletes an OPEN row without evidence or a reason.

## 4. Reference rotation (C3)

Check a game off when its diff lands; add games freely. Work in this order:

1. Everspace 2
2. Rebel Galaxy Outlaw
3. Elite Dangerous
4. X4: Foundations
5. Hades
6. Outer Wilds
7. Papers, Please
8. GTA V
9. Mass Effect Legendary Edition
10. FTL
11. Rocket League
12. Hardspace: Shipbreaker
13. No Man's Sky
14. Starfield
15. Vampire Survivors
16. Balatro
17. Return of the Obra Dinn
18. Shadows of Doubt
19. Disco Elysium
20. Red Dead Redemption 2
21. Death Stranding
22. Forza Horizon 5
23. Trackmania
24. Burnout Paradise Remastered
25. Just Cause 4
26. Subnautica
27. Starsector
28. Kenshi
29. Into the Breach
30. Monster Hunter: World
31. Shadow of the Colossus (2018)
32. Furi
33. Neon White
34. Cyberpunk 2077 (2.0)
35. The Witcher 3
36. Hollow Knight
37. Stardew Valley
38. Factorio
39. Opus Magnum
40. Sayonara Wild Hearts

## 5. Cycle log

| Date | Cycle | Scope | Minted |
|---|---|---|---|
| 2026-10-19 | C1 (first pass, all groups) | Whole game, seven system groups | `REPORT_CARD.md` first grades; §32 rows 444–455 and the §32.7 report-card rows |
