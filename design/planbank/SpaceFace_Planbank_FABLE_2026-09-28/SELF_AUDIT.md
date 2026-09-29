# Self-audit — final pass, 2026-09-29

Run: `node design/planbank/SpaceFace_Planbank_FABLE_2026-09-28/tools/audit.mjs` (after `tools/generate.mjs`). The audit reads the **generated** markdown, not the data source, so it checks what an executing agent opens.

## Final output

```
packets: 142  lines: 141
packets per domain: 01-hand=8 02-massline=7 03-fight=9 04-crucible=7 05-world=17 06-law-factions=7 07-economy=7 08-industry=7 09-ship-identity=6 10-story-missions=10 11-vfx-picture=9 12-ear=8 13-camera-replay=4 14-machine=12 15-professional=20 16-teach=4
lines per group: PICTURE=18 VERB=17 WORLD=22 INSTRUMENT=18 FIGHT=10 ECON=7 STORY=7 LAW=9 MACH=9 PRO=15 TEACH=9
coverage: hands=16p/25l fight=17p/21l world=23p/42l longgame=24p/18l presentation=12p/7l machine=12p/9l professionalism=19p/15l parity=19p/4l
symbol index: 206668 identifiers, 11394 quoted events

PASS — no flags
```

## What the audit checks

1. **Paths.** Every backticked repo path in `INFERENCE_LINES.md`, `plans/**`, `INDEX.md`, `BOARD_ROWS.md` exists on disk; the only allowed exceptions are files the task creates, which must carry the `fb-`/`FB-` prefix (`test/fb-*.test.mjs`, `scripts/fb-*.mjs`, `test/fixtures/fb-*.json`). No path under `design/program/vm-drop/` may appear.
2. **Ids.** FB ids unique and sequential (FB-001…FB-142). Inference ids do not collide with the live `design/program/INFERENCE_IDEAS.md` and continue its numbering (live maxima: PIC-12, VERB-13, WORLD-20, INST-16; TOOL closed and untouched). New groups (FIGHT, ECON, STORY, LAW, MACH, PRO, TEACH) each have ≥5 lines.
3. **Format.** Every packet carries Kind/Lane/Routing (routing ∈ open / ORRERY lane / graphics lane / parked-expansion; lane ∈ the eight live finish lanes of `design/program/FINISH_LANES.md` §2, never the parked THE RELEASE; a THE INSTRUMENT packet routed open must name what it leaves to ORRERY), Seam tags, Write-set, The gap, Why this direction, Mechanism (or Reproduction gate for CHECK packets), Done when, Do not, Focus test starting points; every line has 1–3 paths and status OPEN; every Done is pinned to seed 4242 or a named focused test.
4. **Symbols and events.** Every backticked identifier piece (≥4 chars) and every backticked `domain:verb` event must appear somewhere under `src/`, `test/`, `tests/`, `scripts/`, `electron/`, `styles/`, `docs/`, `design/program/`. Convention: a backticked name starting with `+` is a **new** identifier the task creates and is skipped by this check (documented in `INDEX.md`).
5. **Near-duplicates.** Token-Jaccard ≥ 0.6 on packet titles, packet done-checks, line changes and line done-checks within the bank; and on titles against the SF-001…300 index, the next-wave NXB/NXI catalog (300 rows), the finish-expansion SFQ-B/SFQ-I catalog (336 rows), every open row of the demo defect ledger (`design/program/DEMO_READINESS_2026-09-20.md` §6) and the "what lands" column of every live `build_map.md` §1C row. Zero flags at the final run.
6. **Board rows.** Rows start at the live board's next free number (228; `build_map.md` §1C section I ends at 227) and are consecutive; every row references existing FB ids. The generator additionally asserts that every packet sits on exactly one row and names any ORRERY-routed packet in the row's status.
7. **Coverage (brief §5).** Each of the eight areas has ≥3 tasks and ≥1 packet (table below).

## Coverage per brief §5 area

| Area | Packets | Lines |
|---|---|---|
| The hands | 16 | 25 |
| The fight | 17 | 21 |
| The world | 23 | 42 |
| The long game | 24 | 18 |
| Presentation | 12 | 7 |
| The machine | 12 | 9 |
| Professionalism | 19 | 15 |
| Mature-feature parity | 19 | 4 |

## Flags found and fixed across the runs

- First run: 55 flags. 40 were identifiers the task itself introduces (new settings keys, recipe ids, npm scripts); they now carry the `+` prefix and the audit documents the convention. 15 were real fiction or wrong paths, each verified against the tree before the fix: `player.sessionSinkLedger` → the real field `player.sessionSinks`; `presetFor(eventKind, severity)` → the real one-argument `presetFor(kind)`; `exportString` → does not exist (prose); `stationServices._startJob` → the real `enqueuePlayerJob`; `QuotaExceeded` → `QuotaExceededError`; `ui:sellShip` → only a comment mentions it (prose); `test/chronicler` → the real `tests/chronicler/chronicler.test.mjs` and `hardening.test.mjs`; two new scripts renamed to the `fb-` prefix; a fixtures folder replaced by `fb-`-prefixed fixture files; three "zero hits" search terms de-backticked; one TEACH done-check reworded (0.60 near-dup with another).
- Second run: 1 flag (an escaped-quote miss in the fix script), fixed by a regex edit. Third run: 1 flag (the index's own self-reference used a bank-relative path), fixed. Fourth run: PASS.
- Fifth pass (review, no audit flag): fifteen professionalism packets carried the lane THE RELEASE, which `FINISH_LANES.md` §12 parks (owner, 2026-09-27); a parked lane on open work is a contradiction a dispatcher would resolve by parking the packet. `tools/relane.mjs` moved each to the live lane whose bar it serves (save robustness, the desktop shell and focus loss → THE MACHINE; settings truth and the locale label → THE INSTRUMENT, routed open with the ORRERY boundary named; captions → THE EAR; the stuck tow → THE HAND; the fuel door → THE WORLD; career counters and Ironman → THE LONG GAME), and the audit now refuses any lane outside the eight live ones. The same pass corrected the batch preamble (batches do share seams; the shared seams are now derived and printed per batch), named ORRERY-routed packets in the board-row status, added the defect ledger and the live §1C rows to the near-duplicate sources, and added the one-row-per-packet assertion. Sixth run: PASS.
- Rewrites made during the dedupe pass against the two landed banks (before any audit flag): the dreadnought packet moved from hull-fraction phases to turret-loss phases because NXB-016 rules out health-bar phases; the localization packet was reframed from bulk authoring to an honest preview label plus a readiness gate because SFQ-B227 forbids inventing a localization project.

## Dedupe baseline used

`SpaceFace_Planbank_300` (300 packets, read via INDEX titles and the chosen-outcome line of the 30 closest), `design/program/next-wave-2026-09-28/catalog.json` (60 NXB + 240 NXI, every title and delta read), `design/finish-expansion-2026-09/catalog/task_catalog.json` (240 SFQ-B + 96 SFQ-I, every title and outcome read), `build_map.md` §1C sections G, H and I. 114 packets carry a **Neighbours** line naming the landed work they extend (`tools/bank/near.mjs`); the semantic pass is recorded in `tools/dedupe.mjs` (lexical) plus the near map.

## Re-running

```
node design/planbank/SpaceFace_Planbank_FABLE_2026-09-28/tools/generate.mjs   # regenerates plans/, INDEX, lines, overlap, board rows, batches, tools/coverage.json
node design/planbank/SpaceFace_Planbank_FABLE_2026-09-28/tools/audit.mjs      # ~90 s (indexes ~200k identifiers); exit 1 on any flag
```

Authoring lives in `tools/bank/*.mjs`; `tools/fixups.mjs` records the counted replacements made after the first audit and `tools/relane.mjs` the lane moves of the fifth pass (both idempotent); `tools/inspect.mjs` and `tools/inspect-output.md` are the dead-seam evidence.
