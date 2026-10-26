# Consensus review — packet ff8ea0c5b2 (reviewer 1 of 3)

**Verdict: numbered actionable findings (4) — close to optimal, not clean.**

Stance: senior narrative/world pass + mechanical verification. Read against the corpus bar
(mail.js §cast/job/spam/fan/hate/bill/crew conventions; the vignettes' own ambient registers).

## Mechanics — all verified clean

- `a2x` wiring: all eight files re-point `a2.next` → `a2x` → `p2`; one `a2x` per file, unique
  phase ids, no dangling targets (`compileVignette` throws on dangling `next`;
  `depth-program-encounter-loader` 3/3 proves every module compiles at import).
- Mail triggers: every name resolves — events `dock:docked`, `player:death`,
  `law:fineAssessed`, `jump:arrive`, `encounter:resolved` ∈ `MAIL_EVENT_NAMES`; deeds
  `stunt`, `pod_rescued`, `hunter_disabled`, `base_destroyed` ∈ `DEED_KINDS`
  (deedRecord.js:33–56); stat `missionsDone` is real (gameState.js:144, incremented
  missions.js:5178).
- No dead/duplicate ids; numbering continues each family sequence (spam_21/22, fan/hate/
  bill/crew_16, three cast second letters, new `mail_job_union_*` family).
- Tests: `pulse-435-mail` 7/7, `w2a-mail-calendar-save` 15/15, `depth-program-encounter-loader`
  3/3, `check-flavor-corpus` OK, `check:player-facing-labels` OK. Two reds in the wider run
  are **not this packet**: the ambient-scene count pin (24 vs 16, disclosed in the commit —
  `ambientScene` modules, untouched here) and the order-401 tow gate in
  `rc-vignettes-459-4242` (file 401 is foreign-dirty in the tree; the commit left 401–429
  untouched by design).
- `player:death` precedent confirmed (bill_06, bill_14) — the pod-insurance spam landing
  *because* you died is the joke, and recoverable deaths make it reachable.

## Findings

1. **`mail_job_union_01` duplicates the premise slot of `mail_job_insurance_01`.**
   src/data/mail.js:878–883 vs existing :361–365. Both sell the identical fantasy — get paid
   to *photograph* a wreck around the stripping ("honest salvage assessment, photographed
   and filed" / "pays for the photograph and looks away from the stripping"). The union's
   blind-eye wink changes the attitude, not the pitch; a player who gets both reads the same
   offer twice from two letterheads.
   **Fix:** move the union's commodity off the photograph — e.g., the Local certifies a
   *stripped* hulk legal after the fact ("a stamp that says the hulk was already empty"),
   which keeps the blind-eye joke on ground the insurance desk doesn't own.

2. **`mail_question_02` — "outlasting" mismatches `DEED('hunter_disabled')`.**
   src/data/mail.js:872–876. Disabling the hunter ends the asker; "outlasting it" describes
   `DEED('hunter_outran')` (deedRecord.js:48 — real, recorded from `warrant:hunterEscaped` =
   `timesYouEscaped`, currently unused by any letter). The swap is also better fiction: an
   outran hunter survives and may return, so "the question remains open" is literal rather
   than abstract.
   **Fix:** `triggers: [DEED('hunter_outran')]` — or keep the deed and reword "outlasting"
   → "silencing"/"ending." Recommend the deed swap.

3. **`mail_crew_16` — "your Tessera" breaks the crew conceit.**
   src/data/mail.js:914–919. Fifteen letters keep the Tessera *hers* — "If the Tessera
   still flies," "if the hull comes home"; even crew_04's nearest case stays conditional on
   "the hull," never "your Tessera." Naming her as the player's possession collapses the
   separation the whole kind is built on.
   **Fix:** "If the Tessera still carries her charts, page sixty-one is hers." (or "If the
   hull still has her charts aboard…").

4. **(Optional) One rhetorical device spent twice in the same tranche.**
   555:105 "The manifest counts eleven lamps in the convoy. The fog keeps count of twelve"
   and 566:105 "DISPATCH counts the hulks aloud, and skips the same one every time" — both
   play the count-that-won't-close trick (mirrored: one too many / one too few). Defensible
   as deliberate rhyme, but a repeat player can feel the template.
   **Fix if not intended:** keep 555 (it rhymes with its a0 "one empty slot") and re-shape
   566 — e.g., a roll call that never reaches the last name — same ghost, different grammar.

## Noted, not flagged

- `senna_02` restates `senna_01`'s premise closely ("keeps getting written and keeps being
  wrong" → "keeps refusing to stay written") — earns it via the "different drawer"
  escalation; a polish could open on the new beat, but the callback is the character.
- `spam_21` "unbilled calm" shares the billed-emotions gag with `spam_02` "unregistered
  calm" — different mechanism (leisure license vs wellness audit), in-family.
- `bill_16` + `bill_01` both fire on `law:fineAssessed` with bureaucracy-billing gags —
  reads as deliberate compounding (one fine generating two fees *is* the Concord joke).
- `question_02` also self-echoes `mail_fan_13` ("It is evidence") — The Question
  plagiarizing itself is in-character.
- Standouts: `spam_22` "covered for only half a rescue"; 555's twelfth lamp; `hate_16`
  "a job with no gate in it"; 495's handwriting line doubling as a diegetic hint for the
  puzzle the scene is actually about.
- No letter promises a consequence the systems can't deliver, and — finding 2 aside — every
  trigger fires in a state where the fiction reads right.

**Files edited this pass:** none (findings listed for owner/next pass; no mechanical
defects found that were safe to fix unilaterally).
