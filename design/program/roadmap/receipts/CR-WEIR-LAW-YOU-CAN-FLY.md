# CR-WEIR — Law you can fly

**Date:** 2026-09-28
**Status:** DONE (review PASS)
**Unit:** finish the customs weir as a gate with verbs, not a rendered edge.

## Spec

> Customs is geography. A corridor, a cone, a gate of lights. You can run it,
> tow through it, bribe it with a body rather than a menu, or stay inside it and
> be seen. Escaping a number is homework. Escaping a volume you can see is a
> flight. Helios and the Tethys gate are enough, and they should not feel like
> the same disc.

Forbidden: a modal puzzle, a fine popup, a HUD ring that does not match where
the patrol actually looks.

## What already existed (prior lanes, audited)

- `src/world/customsWeir.js` — the corridor (Helios) and cone (Tethys)
  geometries, `pointInsideCustomsWeir`, renderable segments.
- `lawSecurity._updateCustomsWeir` — presence events + pod-dwell contraband
  scans inside the weir.
- `lawSecurity._updateCustomsScanCones` — patrol scan cones over pods with
  line-of-sight occlusion.
- `gateControlDirector` — physical gate scenes (toll, scan wings, wanted
  response).
- Durable lawful-inspection case machinery (offer/comply/escape/scan).
- `economy.runScan` — the whole bust contract: `player:scannedByPatrol`,
  evasion (per-faction `customsHotUntil` memory), fine, confiscation, rep hit,
  `bribeCost`.

## What this unit built (the missing verbs)

1. **Stay inside it and be seen** — `_dwellWeirPlayer` reads the player's hull.
   Each weir carries authored read numbers: Helios corridor holds a 1.6 s beam
   on hulls under 34 WU/s and attributes the read to `station_helios`; the
   Tethys cone pins a berth, needing only 1.1 s but on a hull under 22 WU/s,
   attributed to `station_customs`. Completion fires a law voice
   (`readText` per def) and calls `economy.runScan` once per visit, so a caught
   hold flows through the real fine/confiscation/rep/bribe contract.
2. **Run it** — the read only accumulates while the hull is inside *and* under
   the weir's `readSpeed`. A hull that crosses fast never gets read. A partial
   read pauses (not resets) under speed and resumes when the hull slows again.
   Leaving the weir resets both the dwell and the one-read latch, so every
   entry is a new chance to be seen — matching the per-faction customs-hot
   memory that already exists.
3. **Bribe it with a body rather than a menu** — `_emitPodCustomsScan` reads
   the pod's live attachment record (`livePodAttachment`). The gate seizes
   every contraband body it finishes reading (`customsImpounded`, permanent
   `pickupEmbargoUntil` so the magnet cannot reclaim it). Who pays depends on
   whose line the body sat on: cut loose inside the weir it is a **surrender**
   (emit carries `surrendered: true`; `heat.js` skips the bust raise and
   `factions.js` skips the strike ledger — the loss of the goods is the
   payment). On the player's line it is evidence in transit (`evidenceOwnerId`
   = player id; the real bust still files). On anyone else's line the gate
   seizes the body but the bust belongs to that owner — heat and factions skip
   it, and the prompt surface toasts a third-party seizure instead of a bust
   at the player. A field cone is not a gate: a pod ditched under a patrol's
   scan is still evidence and nothing there is impounded.
4. **No double read** — a live lawful-inspection case or a live patrolScan
   intercept already owns the read (`activeLawfulInspection` +
   `hasLivePatrolScan`); the weir waits. A docked hull belongs to the berth's
   own customs post; a dead hull is not read.
5. **Reachable surface** — the completed read leaves a `law:response`
   (`weir_read`) row the instruments consume, plus the authored `law:voice`
   line. `customsPrompt` excludes the weir source from the SUBMIT/BRIBE/RUN
   deck (the scan resolves in the same tick — the verbs would be dead) and
   reports an impound receipt rather than a bust for surrendered cargo.
6. **Per-visit latches only** — `readT`/`readDone` reset when the hull leaves
   the weir or the weir changes; `_resetWeirTransient` clears the record and
   both dwell maps on save restore, save loaded, newGame, and deserialize, so
   a half-finished read or a dead pod's dwell row can never leak into another
   session.

## Files

- `src/world/customsWeir.js` — `stationId`, `readDwellS`, `readSpeed`,
  `readText` on both defs.
- `src/systems/lawSecurity.js` — readT/readDone latch on the weir record,
  `_dwellWeirPlayer`, `livePodAttachment`, surrendered/evidenceOwnerId
  semantics + impound in `_emitPodCustomsScan`, `_resetWeirTransient` wired to
  save/newGame/deserialize, `weir_read` law-response row.
- `src/systems/heat.js` — surrendered and foreign-owner bodies do not raise a
  bust on the player.
- `src/systems/factions.js` — same for the strike ledger.
- `src/ui/customsPrompt.js` — weir scans never open the decision deck;
  surrendered → impound receipt; foreign-owner → third-party seizure; pod
  busts no longer print a phantom "— cr" fine.
- `test/customs-weir.test.mjs` — 14 tests.

## Validation

- `node --test test/customs-weir.test.mjs` — **14/14**.
- Adjacent law/customs/heat/faction batch (pq-148-02, pq048, docked-customs,
  law-security-escalation, audio-wanted-heat, living-poi-behaviors, launder,
  sector-law-presentation, inf-079, inf-077) — **101/101**.
- Prompt surface (economy-professional-anti-exploit, prompt-deck cluster,
  prompt-deck, impound-pay-prompt) — **27/27**.

## Review history

- Pre-review sweep caught a real defect: the first `surrendered` flag fired for
  any unattached pod, breaking pq-148-02 (a pod ditched in a patrol cone must
  still bust). Scoped to `source === 'customs_weir'`.
- Round 1 (two reviewers): **FAIL** — phantom decision deck + lying bust toast
  on the prompt surface; `law:voice` unreachable; read/dwell latches leaked
  across save/newGame; NPC-towed pod busted the player; weir id stamped into
  `patrolId`.
- Round 2: five fixes verified, one remaining — `evidenceOwnerId` unchecked on
  the prompt path (same lying-toast class). Fixed with the third-party
  seizure receipt.
- Round 3: **PASS**.

## Residual

- `contraband:bribe` (credits) still exists as the menu-side path — the body
  path is the weir surrender; both coexist by design.
- `customsImpounded` has no render consumer — an impounded pod reads as
  ordinary flotsam; the embargo is the enforcement.
- Pod busts still never carry `faction:repDelta` (inherited — strikes only).
- `_podConeDwell` keeps stale keys between boundary resets (pre-existing).
- CR-BERTH remains the next CR spec block.
