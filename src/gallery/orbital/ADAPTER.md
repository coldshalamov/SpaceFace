# Orbital Gallery live integration

The browser imports `orbitalGallery` from `system.js`. It runs inside the existing production
runtime before `flightSlot`; Flight V3, actions/Massline, fields and Rapier retain their ownership.
The public route never imports the benchmark `session.js` or starts another runtime.

Methods: `start(scenarioId)`, `retry()`, `next()`, `leave()`, `status()`, `serialize()`,
`deserialize(ledger)`. Bus requests: `orbital-gallery:enter` with `{scenarioId}`, `:retry`, `:next`,
`:leave`. The `:started` and `:finished` events carry the same status the UI reads.

`status()` exposes title, instruction, remainingSeconds, result, world-space pockets, entity roles
and best score. Goal beacons remain non-contact geometry; existing authored payloads and physical
machinery use the ordinary renderer. Live controls are the player's raw axes and structured
Massline actions. Exhibits alone explicitly set `source: 'exhibit'` and may consume authored tapes.

Register `['orbitalGallery', orbitalGallery]` in both browser and Node factory tables, and add
`orbitalGallery` before `flightSlot` in production init/update and table-clock membership.
The pre-physics update judges the previous completed solve and queues only machinery impulses.

Persist `_callSerialize('orbitalGallery')` as `data.orbitalGalleryLedger`; restore with
`_callDeserialize('orbitalGallery', data.orbitalGalleryLedger)`. The normalized ledger records
scores and finished attempts. Never serialize `state.orbitalGallery` (it contains ephemeral roles
and the live combat kernel).

The shared venue membrane chooses a clear bounded court against campaign entities, asteroid rocks
and dressing rows. It relocates and returns the player through `world.relocatePlayerInSector`.
Exit/retry/sector/load remove only exact owned body identities, attachments and fields. Fixtures
without a world port remain caller-relative. `state.physicsVenue` marks the active court and its
campaign return position; campaign autosaves and encounters should remain suspended while active.

Verification: `node --test test/physical-venues-live.test.mjs`. The standalone catalog/proof APIs
remain in `index.js` for Node tooling; their exhibit wins do not certify the public route.
