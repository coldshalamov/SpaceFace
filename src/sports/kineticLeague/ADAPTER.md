# Kinetic League live integration

Import `createKineticLeague` from `system.js` and register `['kineticLeague', createKineticLeague()]`
in both factory tables. Add `kineticLeague` before `flightSlot` to production init/update/table
clock membership. The system reads completed authoritative poses and queues rival/friction impulses;
Flight V3, Rapier, the field owner and actions/Massline remain the single gameplay owners.

Methods: `beginMatch(eventId, {seed, practice})`, `enterMatch` (alias), `retry()`, `next()`, `leave()`,
`status()`, `serialize()`, `deserialize(raw)`. Requests: `kinetic-league:enter` with `{eventId}`,
`:retry`, `:leave`. `:started` and `:finished` emit status. Entry and retry create an unsolved live
match; they never call `runMatch`, `stepSession` or the private exhibit integrator.

`status()` exposes title, instruction, phase, remainingSeconds, progress, shots, target, arena,
world-space court center and durable league memory. Qualification opens by explicit venue-board
entry or BRACKET discovery. Higher career tiers require the prior tier; `practice:true` permits
learning any event without a purse. Winning events pay local scrip once and never change credits.

Persist `_callSerialize('kineticLeague')` as `data.kineticLeague`, and restore via
`_callDeserialize('kineticLeague', data.kineticLeague)`. Career memory is normalized. Genuine active
sessions carry an authoritative marker and resume by reconstructing owned physical entities on the
existing sim; old private exhibit sessions do not resume into live play.

Court bodies use ordinary authored payload visuals; rail proxies are real OBBs, goal beacons use the
non-contact material, and magnet courts register with the existing field owner. Actual physical
impacts and actual Massline attachment/cut events feed sport rules. Braking never secretly cuts a
rope. In containment, no-input passive placement cannot earn a live victory.

The shared venue membrane owns clear placement and safe return via `world.relocatePlayerInSector`.
`state.physicsVenue = {id,active,returnPosition,sectorId}` is ephemeral. Suspend campaign autosaves
and encounters while active, or project the campaign save to returnPosition and omit entities with
`data.physicsVenueId`. Normal explicit league serialization preserves career and match progress.

Existing BRACKET wiring may keep using `noteBracketDiscovery` / `maybeEnterLeague` from discover.js;
the live system also listens to BRACKET result/start events. The public venue board is an additional
reachable door, not a replacement for BRACKET.

Verification: `node --test test/physical-venues-live.test.mjs`. The twelve fixed-seed Euler exhibits
remain isolated regression tooling and cannot establish live gameplay acceptance.
