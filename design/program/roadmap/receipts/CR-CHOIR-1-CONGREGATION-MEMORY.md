# CR-CHOIR-1 — Congregation-as-activity receipt

Build-map row 49: *"the Choir tend the hurt and remember what you did with their dead —
beyond one bar memory."*

## What already existed (commit `b9785d0b0`)

The physical scene was real before this pass: the Choir-Tender wreck at Helios is a fixed
site, and the surviving pair — attendant `LAST LIGHT` (`trafficRole: 'tender'`, ship_drifter)
and patient `MERCY` (medical shuttle, drive destroyed, power wounded) — are world-record
entities standing the site. The attendant flies a real `tender` npcJob: approach, hand-tool
`combat.repair` on the power plant, and — if the player hands the recovered Knitbots back —
restores the drive, after which both hulls fly a real route to the Helios medical berth,
publish a news line, and leave an evacuated-berth record the barkeeps at Helios and the
Coalition station remember by name.

What the scene could not see: **the player's own rope.** `latchRepair.js` already let a taut
line heal a hurt friendly and free its drive, and Mercy already qualified (team-2 civilian,
hurt or drive-disabled). The player could physically knit Mercy to full — and the berth record
would never notice, because `freeDrive` restored the component silently: the damage pipeline
emits `combat:subsystemEnabled` on restore, but the rope path bypassed the emit. The kill side
had the same gap in reverse: `attendantLost`/`patientLost` fed a barkeep line and nothing else,
so murdering the congregation cost no standing.

## What changed

- `src/combat/latchRepair.js` — `stepLatchRepair(state, dt, bus)` and the internal
  `applyRepair`/`freeDrive` thread the repairing owner and the bus through. `freeDrive` emits
  `combat:subsystemEnabled` (same field shape as the damage path, plus
  `source: 'latch_repair'` and `repairedBy`) — but only when a real `subsystem_drive`
  component was down and its `subsystem_power` dependency lives: driveless tether-anchor
  profiles carry `capabilities.drive: false` permanently, and a dead plant re-disables the
  drive on the next recompute, so announcing either would precede a flap. A `pendingTransition`
  armed the same tick is disarmed so a destroy can't re-fire after the enable. Every existing
  consumer of the event gates on `targetId`/`subsystemId`, so the new producer cannot
  misroute them — and a taut-line repair on a civilian-disabled recovery target now resolves
  that recovery record correctly as `drive_restored`.
- `src/systems/tetherGameplay.js` — passes `this.bus`; call is a one-line change.
- `src/systems/choirReliefBerth.js` — four edits:
  - `enabled(payload)` credits a player rope-repair: `driveRestored` set, `faction:repDelta`
    Choir `+6` once per site (durable `ropeRepairPaid` — re-knitting the same Mercy is not a
    rep pump), a named toast, then `sync()` recommissions both hulls home on real routes.
    Non-patient or non-drive restores are ignored; a restore credited to anyone but the
    player pays no rep.
  - `disabled(payload)` keeps `driveRestored` honest: a re-disabled Mercy reverts to the
    tending state — return job released, stale `jobId`/returning flags cleared — so a second
    repair is what gets her home, not a stale flag on a dead drive.
  - `killed(payload)` emits `faction:repDelta` Choir `−8` when `payload.killerId` is the
    player. Numeric ids recycle and the actors cache retains the dead ref, so the charge is
    guarded by the durable `role Lost` flag — one charge per death, no re-charge on a
    recycled id, and someone else's violence is not billed to the player.
  - Mercy's hull is stamped to 60% at init, so a taut line does seconds of real repair work —
    the same held-line effort the verb asks everywhere else — rather than a one-tick flag
    flip on an already-whole hull.
- `src/systems/uniqueWrecks.js` — `_listen('combat:subsystemEnabled'/'combat:subsystemDisabled', …)`
  routes both events to the berth beside the existing work/complete/killed hooks.

## Why this closes the row's wording

- **Tend the hurt** — already physical (tender job + hand repairs); now the player can join
  the tending with their own rope and the congregation reads the act.
- **A place to go back to** — unchanged by design: the wreck site, then the Helios medical
  berth the survivors physically fly to.
- **Remember what you did with their dead — beyond one bar** — the memory now stands in three
  places that are not a dialogue tree: the durable `choirRelief` record (attendant/patient lost
  means the site goes permanently quiet — the Choir do not send another crew to a place that
  eats them), the barkeep/berth lines, and the faction standing ledger that now charges the
  kill and pays the knitting.
- **Thin guards honored** — no shop, no dialogue tree, no new faction screen, no second
  loot table. depot3 stays a grunt-line pump, per the spec's own note.

## Validation

- `node --test test/choir-relief-latch.test.mjs` — 9/9 (taut-line emit once + fields, slack
  line heals nothing, driveless-profile and dead-dependency emits suppressed, same-tick
  destroy pending disarmed, berth credits rope-repair and sends both home, wrong-target/
  non-player restores ignored, kill charge once per death with recycled ids, re-disable
  reverts to tending and re-repair recommissions without a second rep payment).
- Adjacent suites green: `f17-latch-repair` (rope-repair contract), `choir-berth-memory`,
  `choir-contact-grammar`, `civilian-freighter-recovery`, `pq195-06/pq048` recovery and
  wreck suites, `depth-program-unique-wreck-*`, `chain-tether-share`, `pq146-tether-*`,
  `damage-death/massline` recovery — zero regressions.
- Adversarial review: first pass found five defects (phantom emit on driveless profiles,
  armed pending transition, non-idempotent kill charge, write-once driveRestored, rep pump);
  all fixed and re-reviewed to PASS.

## Residual

- `living-adventure-choir-runtime.test.mjs` (240 s production-runtime walk) still exercises the
  knitbots path end-to-end; the rope path is covered at the seam level above.
- The Choir have no second congregation site yet (Vesta `station_depot3` is explicitly out of
  scope for this campaign per the row spec).
