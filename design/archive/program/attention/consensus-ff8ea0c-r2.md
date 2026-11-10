# Consensus review — packet ff8ea0c5b2 + fixup f671b95d40 (reviewer 2 of 3)

**Verdict: numbered actionable findings (2, both minor) — the r1 fixes landed clean and the
packet is close to optimal.**

Independent pass, fresh eyes: read the live files, both diffs, the emitters behind every
trigger, and the deed producers — not just the r1 report. Mechanics re-verified from source.

## Mechanics — re-verified clean

- **a2x wiring (8/8):** every file chains `a2.next → "a2x" → a2x.next → "p2"`, `p2` intact,
  one unique `a2x` per file, no other node retargeted. Verified by grep against live tree
  (clean — no foreign diff on the nine touched files).
- **Mail triggers all resolve against live vocabulary:** events `dock:docked`, `jump:arrive`,
  `law:fineAssessed`, `encounter:resolved`, `player:death` ∈ `MAIL_EVENT_NAMES`
  (src/data/mail.js:31–57) and every one is really emitted (combat.js:1071/1230,
  encounterDirector.js:2367/2418, lawSecurity.js x7, survivalArena.js:1507). Deeds `stunt`,
  `pod_rescued`, `hunter_outran`, `base_destroyed` ∈ `DEED_KINDS` (deedRecord.js:33–48).
  `missionsDone` is a real stat (gameState.js:144, incremented missions.js:5178).
- **r1 fixes are correct, not just applied:**
  - `hunter_outran` semantics confirmed at the emitter: `warrant:hunterEscaped` fires only on
    player sector-exit with a live hunter wave — `timesYouEscaped`, `lastOutcome:'outran'`
    (warrantHunterWaves.js:731–760; waves targeting non-players are skipped without
    emitting). "Outlasting" is the right verb now, and "the question remains open" is literal
    — an outran hunter survives.
  - Union rewrite clears `mail_job_insurance_01`'s slot: up-front paid photographing vs
    post-facto certification — different commodity, same blind-eye family, no longer the same
    pitch on two letterheads.
  - `crew_16` "the Tessera still carries her charts" restores the kind's conceit (fifteen
    letters keep the hull hers; verified against crew_01/04/09).
- **Ordering check (positive):** `senna_02`'s triggers are a strict superset of `senna_01`'s
  (adds DAY(9)), and `senna_01` precedes in authored order — the second Senna letter can
  never deliver first. Same design would fix finding 2 below.
- **Tests:** `node --test test/pulse-435-mail.test.mjs test/w2a-mail-calendar-save.test.mjs
  test/depth-program-encounter-loader.test.mjs` → 18/18 pass. `check-flavor-corpus` OK,
  `check:player-facing-labels` OK. 138 letters vs "130+" header claim — accurate.
- **Delivery semantics checked** (src/systems/mail.js): letters deliver exactly once;
  `deed` conjuncts read the durable Record (no event-log expiry risk — the 96-event cap only
  touches `event` conjuncts, and every event-gated new letter pairs it with a day/stat gate
  the letter can wait on).

## Findings

1. **`mail_slate_02` — "fly it like a dare" fires on a paperwork stunt too.**
   src/data/mail.js:863 → deedRecord.js:332–338. `DEED('stunt')` has **two** producers:
   `stunt:salvageRights` (a recognized flight trick — the intended fiction) and
   `wreckCourt:ruled` with a clean, non-fraud insurance ruling — forensic paperwork, not
   flight. A pilot whose only `stunt` deed came from filing a supported wreck-court claim
   gets "word is you fly it like a dare now" for a desk job. "Word is" hedges it (Slate
   trades in hearsay), so this is a soft mismatch, not a break — but the verb is doing the
   mismatching and one word closes it.
   **Fix:** "word is you fly it like a dare now" → "word is you treat it like a dare now"
   (covers flight and filings; keeps the dare image). Alternative: leave it — hearsay framing
   arguably absorbs it. Low severity.

2. **`mail_question_02` can deliver before `mail_question_01`** (minor, optional).
   src/data/mail.js:875 vs :207. question_01 gates at `DAY(9)`; question_02 carries no
   time/beat conjunct, so an early `hunter_outran` deed delivers the *second* Question letter
   first. The body survives standalone — "the last thing that asked" parses as the hunter
   itself — so this is lost resonance, not breakage ("It was evidence" and the shared
   "The question remains open" land as a callback only in order).
   **Fix:** add `DAY(9)` to question_02's triggers. question_01 precedes it in
   `MAIL_LETTERS`, so even a same-tick delivery sequences question_01 first — same guarantee
   `senna_02` already gets via its DAY gate. Cost: a pre-day-9 outran defers the letter to
   day 9, where it arrives right behind its predecessor.

## Noted, not flagged

- **555:105 vs 566:105 ghost-count device (r1 finding 4, optional):** concur — keep both.
  Strengthening r1's "deliberate rhyme" read: enumeration is the tranche's whole grammar
  (433 "praying by count", 448 "sold three times", 466 ledger/clocked-in, plus the work_line
  "count finishes" motif). The two *wrong-count* lines are inverted mirror images
  (one-too-many vs one-too-few) inside a counting grammar — they rhyme, they don't repeat.
- **`fan_16` and `fan_05` share the exact gate** `[DEED('pod_rescued'), DAY(4)]` — both land
  in the same batch. In-corpus: five letters already stack on unconditional `pod_rescued`;
  the chorus is the convention, and the senders differ (mining family vs relief watch).
- **`bill_16` + `bill_03` + `hale_01` on one `law:fineAssessed`** — three letters per fine.
  Deliberate compounding: hale_01's "generated a second filing" gag is literally cashed out
  by bill_16 arriving. The pile-on is the Concord joke.
- **`senna_02` "keeps refusing to stay written" after a single rescue** — Senna's bit is
  keeping a list of the almost-lost; one rescue is one wrong writing. Hyperbole is the
  character ("Two more hulls went on the wrong side of my list this month").
- **`job_union_01`'s `E('encounter:resolved')` conjunct is near-decorative** — by
  `missionsDone>=5` some encounter has resolved (survivalArena emits it too). The stat does
  the gating; the corpus does the same elsewhere (fan_06). The standing-offer fiction
  tolerates it.
- **New senders checked against the world:** "Salvage Assessors Local", "Concord Rest
  Registry", "Vigilance Mutual", "Notary of Transit" (echoes spam_12's "A Totally Real
  Notary"), "the relief watch", "a toll keeper's sister", "the navigator's apprentice" — all
  in-register; cast seconds reuse real senders (Slate, Senna, The Question).
- **a2x register, all eight:** narrator-voice ambient lines matching each file's own actor
  texture — 433's count-prayer rhymes with "the count finishes when it finishes"; 466's
  ghost-hand *explains* the empty station the premise rests on; 540's un-cut paint doubles
  the "not called it scrap" premise; 495's handwriting doubles as a hint for the puzzle the
  scene is about. No node reads wrong in any reachable state (ambient tier, all outcomes
  leave the line true).

**Files edited this pass:** none. (Two minor findings listed for the owner/next pass.)
