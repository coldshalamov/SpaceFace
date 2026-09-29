# PB-MIS-A — SF-136 real crusher in the yard tow-out (deep-dive 01)

**Row:** build_map.md §1C row 72 · **Lane:** missions · **Date:** 2026-09-29
**Status:** implemented / route-unproven (production + direct checks pass; the live tow-out route was not played at camera in this environment)

## Gap (player terms, reproduced at HEAD)

The "yard crusher" was a private invisible point owned by the encounter: it chased the
hauler across space at 4 WU/s (`src/data/encounters/346-yard-towout.js`, old tick lines
91-97), and at the 150 s deadline the runtime asserted a crush that never physically
happened — hauler anywhere in space, outcome `crushed`, wreck minted on the spot. That
fake-crush branch was pinned green by the owner suite at HEAD
(`test/b7-set-pieces.test.mjs:236-243`: deadline + no contact → `'crushed'` + wreck).
Deep-dive 01's forbidden shape, verbatim: "a body just outside the true throat cannot be
killed by a separate invisible radius" and "never assert damage that did not occur."

## Mechanism (through existing owners)

- **Real machine binding** — `fire()` resolves `killMachinesForSector(live.sectorId)` and
  binds the nearest authored kill machine within 1500 WU of the zone anchor by stable id
  (`machineId`); none reachable → `abort('no_machine')` (deep-dive: "no offer before its
  physical premise exists"). Measured on live data, three sectors qualify:
  helios_claim_cracker 528 WU inside zone_helios_core, fissure_cracker 1185, tethys_weigh_clamp 1478.
  Scheduler-level `gates.sectorIds: [helios_prime, haumea_rift, tethys_junction]` added to the
  trigger (the same gate shape `encounterDirector._gatesPass` reads at line 772) so
  machine-less civilian cores stop consuming beats.
- **Fixed jaw law** — the danger is the machine's own exported geometry
  (`pointInsideKillMachine`) and its authored `hazardRadius`; nothing moves. The private
  `mouth`/`startDist`/`crushHauler` clock is deleted.
- **Opposing action** — the disabled hauler's failing autopilot keeps a throttled
  collision course at the machine's anvil via the sanctioned passive-ship `data.intent`
  steer (claim-beacon idiom, encounterScripts `steerToward` semantics, 0.02 throttle);
  latching (`tether:attached` payload `targetId`, routed by
  `encounterDirector._routeToSelfRegistered`) zeroes the drift so the rope never fights
  the drive. The machine never chases; the hauler is the moving thing.
- **Success (real safe zone)** — hauler alive, outside the machine's field geometry AND
  beyond `hazardRadius + 80` WU of the root, held 2 director ticks, after real engagement
  (was in danger, or latched). Same reward chain as before: `grant 300 'yard:towout'`,
  `rep faction_mts +4`, skiff stands down, hauler stays in the world.
- **Recoverable loss** — the machinery's own law does the damage (field kernel forces all
  dynamic hulls, `fields.js _applyForces`; anvil contact pays through the terrain crumple
  law, `impulseKernel.js:358`). The runtime only reads the truth: a hauler whose last
  living position was inside the jaw resolves `crushed` and grants its load as debris at
  the true death position (`d.spawnWreck`, pool/label unchanged); a hull lost elsewhere is
  `hauler_lost` with no gift wreckage. No double wreck: the world's own death path
  (aftermath markers, scavenger ecology) already owns the rest.
- **Truthful expiry** — deadline without a physical crush resolves the new `withdrawn`
  outcome: skiff stands down, no grant, no wreck, the hauler truthfully still afloat for
  the director's standard 45 s straggler window.
- **Feedback** — shape-level receipts authored in-module (`live.shape.receipts` is read
  first by `resolve()`, `encounterDirector.js:1719`): towed / crushed / withdrawn lines;
  `hauler_lost` stays silent as before. Alert bark and scout approach cue unchanged.

## Files

- `src/data/encounters/346-yard-towout.js` — the mechanism (runtime rewrite, trigger gate, receipts).
- `src/data/environmentalMachinery.js` — additive `ALL_KILL_MACHINE_BY_ID` census export
  (the existing `KILL_MACHINE_BY_ID` maps the Ceres trio only; identity validation needs the
  full census).
- `test/b7-set-pieces.test.mjs` — owner suite: stale pre-existing pins fixed (346/347
  catalog `script` is `'selfRegistered'` at HEAD — failed before this unit), yard_towout
  branches rewritten to machine law with the counterexamples below.

## Counterexamples that fail under the old behavior

1. **Deadline without contact** — hauler afloat, untouched, offer expires → old code
   resolved `crushed` + minted a wreck; new law resolves `withdrawn`, zero wrecks, zero
   grants, hauler alive (b7 "THE COUNTEREXAMPLE" block).
2. **No chasing mouth** — `live.data.towout.mouth` must be `undefined` and the bound
   machine's `globalPos` constant across ticks; the old mouth point moved every tick.
3. **Location-truthful loss** — hull dies outside the geometry → `hauler_lost`, no wreck
   (old code could only ever mint crush wreckage on its clock).

## Checks (run in this session, real exit codes)

| Command | Result |
|---|---|
| `node --test test/b7-set-pieces.test.mjs` (at HEAD, before edits) | 4 tests: 3 pass, 1 fail (pre-existing stale catalog pin) — and the passing branch test pinned the fake crush (reproduction) |
| `node --test test/b7-set-pieces.test.mjs` (after edits) | 4 tests: 4 pass, 0 fail (exit 0) |
| `node --test test/environmental-machinery.test.mjs test/save-growth-dock-trade-flat.test.mjs` | 12 tests: 12 pass, 0 fail (exit 0) |
| `node --test test/depth-program-encounter-loader.test.mjs test/content-variety-append.test.mjs test/combat-ecology-roles.test.mjs` | 17 tests: 17 pass, 0 fail (exit 0) |
| `node --test test/b7-set-pieces.test.mjs test/environmental-machinery.test.mjs test/save-growth-dock-trade-flat.test.mjs` (the packet's named command, run against the integrated tree including concurrent foreign renumbering of `index.generated.js`) | see final run block in the TaskOutcome |

Not run (out of lane scope per row instructions): `check:baseline`, `check-ci-report` — the workflow gates on those after this row.

## Remaining uncertainty

- **Route-unproven at camera:** the packet's play-through bar (tow diagonal clear, tow the
  wrong side, release in danger, real contact, expiry) needs a live run at the shipping
  camera. The physics chain is verified by reading (field kernel applies to NPC hulls;
  crumple law pays anvil contacts; helios/tethys shells spawn via the adapter's
  `_ensureMachineMouth`), and every branch is proven on the director-semantics driver —
  but drift-throttle feel (0.02) and time-to-danger vs. player approach speed are
  feel-tuning the deep-dive reserves for a played pass.
- Concurrent foreign work was in flight on `src/data/encounters/index.generated.js`
  (module renumbering) during this unit; my paths are disjoint and the final proof run
  imports the integrated graph.

## Review fix (2026-09-29, fresh review of this row)

**Caught:** the towed receipt authored a `{pay}` placeholder
(`346-yard-towout.js`, old line 278: `…yard machine. {pay} cr.`, fed by
`vars: { pay: 300 }` on the resolve call) — but `resolve()` reads shape receipts
raw (`encounterDirector.js:1738-1739`); `fmt()`/vars interpolation only exists in
the `receiptTextWithFallback` fallback (`encounters.js:706-708,712-714`), which
never fires when a shape receipt exists, and no UI layer formats receipt text.
The success-path line would have shown `{pay} cr.` verbatim.

**Changed:** the receipt text now inlines the amount —
`'TOW CLEAR — the hauler rides out past the yard machine. 300 cr.'` (sibling
shape-receipt modules 220–320 inline their amounts; none use `{key}`), and the
dead `vars: { pay: 300 }` payload is removed from the towed resolve with a
comment naming the raw-render law. Mechanism demonstrated in node:
fallback path applies fmt, shape path renders the string verbatim.
