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
3. **Bribe it with a body rather than a menu** — `_emitPodCustomsScan` now
   distinguishes a body still on a line (`podHasLiveAttachment`) from a body
   cut loose. Only inside the weir is an unattached contraband pod a
   **surrender**: it is impounded (`customsImpounded`, permanent
   `pickupEmbargoUntil` so the magnet cannot reclaim it) and the emit carries
   `surrendered: true`. `heat.js` skips the smuggling-bust raise and
   `factions.js` skips the strike-ledger increment on surrendered payloads —
   the loss of the goods is the payment. A field cone is not a gate: a pod
   ditched under a patrol's scan is still evidence, and a pod still on your
   line inside the weir is evidence in transit.
4. **No double read** — a live lawful-inspection case already owns the read;
   the weir waits while `activeLawfulInspection(state)` is set.

## Files

- `src/world/customsWeir.js` — `stationId`, `readDwellS`, `readSpeed`,
  `readText` on both defs.
- `src/systems/lawSecurity.js` — readT/readDone latch on the weir record,
  `_dwellWeirPlayer`, `podHasLiveAttachment`, surrendered semantics in
  `_emitPodCustomsScan`.
- `src/systems/heat.js` — surrendered bodies do not raise a bust.
- `src/systems/factions.js` — surrendered bodies do not mint strikes.
- `test/customs-weir.test.mjs` — 10 tests.

## Validation

- `node --test test/customs-weir.test.mjs` — **10/10**.
- Adjacent: `pq-148-02-smuggling-physics`, `pq048-lawful-cargo-inspection`,
  `docked-customs-post`, `law-security-escalation` — **53/53**.
- `audio-wanted-heat`, `living-poi-behaviors`, `pq-151-02-launder`,
  `sector-law-presentation` — **45/45**.

## Review history

- First adjacent sweep caught a real defect pre-review: the initial
  `surrendered` flag fired for *any* unattached pod, which broke
  `pq-148-02` (a pod ditched in a patrol field cone must still bust). Fixed by
  scoping surrender to `source === 'customs_weir'` — the weir is the gate;
  a field cone is evidence collection. See §Review.
- Adversarial reviewer: **PASS**.

## Residual

- `contraband:bribe` (credits) still exists as the menu-side path — the body
  path is the weir surrender; both coexist by design.
- The weir read emits `player:scannedByPatrol` with `source: 'customs_weir'` —
  presentation consumers that key on patrol presence see a gate read instead of
  a patrol read; no consumer breakage found.
- CR-BERTH remains the next CR spec block (one honest faction address).
