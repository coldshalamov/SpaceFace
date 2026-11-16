# INV-11 — Is the first Wasp waiting on unfinished links or on queueing? (READ-ONLY, one lock hold)

**You change no tracked file.** Files only under `.devshots/fleet/inv11/`. Output: RECEIPT.md. Reuse your INV-10 probe
(`.devshots/fleet/inv10/`) and route (headed `?swarmRound=1` → Armory → Launch round). One lock hold; never kill a
holder you did not start.

## Answer exactly these
1. **Who are the twelve?** For every hostile alive in the first 15 s: id, `type`, `team`, AI archetype, `defId`,
   and whether it belongs to the current wave's roster (the survival wave plan / `data` wave fields) or is sector
   traffic. INV-10 saw 3 `wasp_swarmer` + 9 distant `ship_kestrel`; round 1 is authored as ten Wasps, three first.
2. **Program readiness split, per on-glass Wasp:** at the moment its mesh is created, list each program key its
   meshes will use (from `renderer.properties.get(material).currentProgram` once set, or the material's
   expected key) and whether `program.isReady()` is already true. Log the time each flips to ready. Also log when
   that Wasp's compile was *issued* relative to the t≈961 dressing cohort (station, pickups, rocks, ships 630–665).
3. **Publish join:** INV-10 saw Wasp 577's compile resolve at 5.4 s but publish at 8.8 s together with 575. Is publish
   joined to the slowest sibling (same upgrade job / group)? Point to the code.
4. Count white stand-ins drawn for **wave-roster hostiles only**, per second, for 15 s.
## Receipt
A short table per question with `file:line` evidence, then which branch holds: (A) keys not ready at spawn because
the driver links in issue order behind the dressing cohort, or (B) keys ready but the body still waits in a queue.
