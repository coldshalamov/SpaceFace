# Consensus review — packet ff8ea0c5b2 + fixups f671b95d40 / a2f6f5c81b (reviewer 3 of 3, FINAL)

**Verdict: OPTIMAL — no actionable improvement.**

Independent final pass, fresh eyes on the current tree: read all ten letters and all eight a2x
nodes in live context, re-verified every trigger against source (not against the r1/r2 reports),
ran the tests. Everything the first two rounds flagged is fixed and verified correct at the
producer; nothing new rises to the bar.

## Mechanics — re-verified clean

- **a2x wiring (8/8):** each file chains `a2.next → "a2x"`, `a2x.next → "p2"`, `p2` intact; exactly
  one `a2x` per file; no other node retargeted (grep-verified, 433/448/466/495/511/540/555/566).
  `depth-program-encounter-loader` 3/3 — every module compiles. A pre-existing `a2x` in 391 is the
  same earlier-tranche convention, not a collision.
- **Mail triggers all resolve (corpus-wide check, not just the new ten):** 138 letters, zero
  duplicate ids, every `event` conjunct ∈ `MAIL_EVENT_NAMES`, every `deed` conjunct ∈
  `DEED_KINDS`. Emitters confirmed at source: `player:death` (combat.js:1071/1230,
  world.js:6518), `dock:docked` (careerCohorts.js:526+), `law:fineAssessed`
  (lawSecurity.js:3455+), `jump:arrive` (world.js:5661), `encounter:resolved`
  (encounterDirector.js:2367/2418, survivalArena.js:1507). `missionsDone` real
  (gameState.js:144 → missions.js:5178).
- **`hunter_outran` emitter re-confirmed** (warrantHunterWaves.js:731–760): fires only on player
  sector-exit against a live boss-role hunter wave targeting the player (`timesYouEscaped`,
  `lastOutcome:'outran'`). Non-player-targeted waves are skipped before emit. "Outlasting" is
  the right verb and "the question remains open" is literal — the outran hunter lives.
- **r1/r2 fixes verified at the producer, not just the diff:**
  - `stunt` has two producers — `stunt:salvageRights` (deedRecord.js:598, trickId-gated) and
    `wreckCourt:ruled` non-fraud (:335). "treat it like a dare" covers flight and filings; the
    "word is" hedge is Slate's hearsay register.
  - `question_02` ordering is airtight: `DAY(9)` matches question_01's gate, and `_evaluate`
    (systems/mail.js:187) iterates `MAIL_LETTERS` in authored order — question_01 delivers first
    even on the same evaluation pass. Same guarantee senna_02 gets via its strict-superset
    `[DEED('pod_rescued'), DAY(9)]`.
  - Union rewrite is a different commodity: post-facto certification that a photograph existed
    vs insurance_01's paid photograph. Distinct premise slot, same blind-eye family.
  - `crew_16` "the Tessera still carries her charts" keeps the hull hers (verified against
    crew_01/04/09's conditional possessives).
- **Delivery semantics:** deeds read the durable `record.tallies` (survives DEED_CAP
  compaction — `compact()` drops deeds, never tallies); event conjuncts read the 96-cap witness
  log. Every event-gated new letter pairs the event with a recurring re-arm path or a durable
  conjunct (see noted).
- **Tests:** `node --test test/pulse-435-mail.test.mjs test/w2a-mail-calendar-save.test.mjs` →
  22/22 pass (7 + 15). `depth-program-encounter-loader` 3/3. `check-flavor-corpus` OK. Header
  claim "130+ authored letters" accurate at 138.

## Register / premise pass — all ten letters

- **slate_02** — welder's possessive signature; "Stop testing my signature" is the character.
  "I stamped your hull plate once" survives without a prior `service:completed` because plate
  stamping isn't exclusive to the paid-repair event in-fiction — same conceit every cast letter
  uses (senders know the hull).
- **senna_02** — "different drawer" is the right escalation of the list-keeper bit; one rescue
  still reads as the character's hyperbole ("keeps refusing to stay written" — she writes him
  lost every near-miss, not every deed).
- **question_02** — "the last thing that asked" parses standalone as the hunter; "It was
  evidence" repeats the Question's own signature move from fan_13 (same voice — self-echo is
  the epistemology, not plagiarism).
- **union_01** — the certification racket is a sharper joke than the first pass had room for:
  the union sells the stamp, not the work.
- **spam_21** — "return the minutes" / "order of despair" are peak Concord-bureaucracy voice;
  "unbilled calm" vs spam_02's "unregistered calm" is in-family variation, different mechanism.
- **spam_22** — post-death underinsurance upsell; "covered for only half a rescue" is the best
  line in the tranche and the trigger is the joke.
- **fan_16** — "The watch does not clap. The watch wrote this anyway." Restraint is right.
- **hate_16** — "a job with no gate in it" is devastating understatement; toll keepers are
  established (Crimson Reach Toll Desk, mail_vane_01/hate_10 tolls); "that gate"/"the cargo" is
  grief-accusation elasticity, same license hate_01's "a posting" takes.
- **bill_16** — countersignature-on-the-fine is the pile-on the Concord joke wants
  (bill_03 + hale_01 compounding is the point); Notary of Transit threads spam_12's notary.
- **crew_16** — conceit restored; the navigator's apprentice extends crew_05's Osei naturally.

## a2x pass — all eight, in context

Every line is narrator-voice ambient matching the file's own texture, true in every reachable
state (all fire pre-offer, outcome-independent), and the actor-attribution convention is kept —
descriptive third person without colon for scene assertions (566's "DISPATCH counts…" matches
a1's "DISPATCH tags loose mass"), `ACTOR:` prefix only for speech.

Enumeration is the tranche's grammar (433 "praying…by count," 448 "sold three times this hour,"
466 ledger/clocked-in, 495 marks, 555 eleven/twelve, 566 the skipped hulk, plus the work_line
"count finishes" motif) — the two wrong-count lines are inverted mirrors inside that grammar:
rhyme, not template. Concur with r2 over r1's optional flag.

Standouts: 466's ghost-hand explains the empty station the whole premise rests on; 495's
handwriting line is a genuine diegetic hint consistent with both resolution receipts ("one line
below it" / "same missing entry twice"); 540's un-cut paint doubles "not called it scrap";
555's twelfth lamp rhymes exactly with a0's "one empty slot."

## Noted, not flagged

- **slate_02 can deliver without slate_01** (stunt deed via wreckCourt and zero repairs → "The
  plate, again" arrives first): body-independent letters; "again" parses as Slate revisiting
  his own irritation, not a callback. Below the bar r2's question_02 fix set, where the body
  only landed in order.
- **Event-log expiry edge** shared with corpus: a pre-day-3 `player:death` could age out of the
  96-event witness log before spam_22's DAY(3) holds — identical shape to bill_14, re-arms on
  any later death. A system-level trait, not a packet defect.
- **union_01's `encounter:resolved` is near-decorative** — the stat gates; the corpus does the
  same (fan_06). Standing-offer fiction tolerates it.
- **fan_16 shares fan_05's exact gate** `[DEED('pod_rescued'), DAY(4)]` — same-batch chorus is
  the convention; senders differ (relief watch vs mining family).
- New senders all have world precedent: Salvage Assessors Local (Gantry Crew Local), Concord
  Rest Registry (Wellness Board / Bureau of Notifications), Vigilance Mutual (Concord Mutual /
  Insurance Desk), Notary of Transit (A Totally Real Notary), the relief watch (362's salvage
  watch), the navigator's apprentice (Tessera nav Osei, crew_05), a toll keeper's sister
  (Reach tolls).
- No letter promises a consequence the systems can't deliver; every trigger fires in a state
  where the fiction reads right; no premise slots collide post-fix.

**Files edited this pass:** this report only. No code changes — nothing actionable remained.
