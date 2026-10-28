# S1 factions review: vael, helix, meridian, archive

Read-only scout. Nothing in the repo was changed. Diffs are against HEAD. Tests ran serially.

## Verdicts

| File | Verdict | Reason |
|---|---|---|
| src/systems/faction_vael.js | FIX | Transfer regression: a phantom-mass sweep strips the debt just moved (line 732). weight-vael-524 red (1 of 7), reproduced twice. |
| src/systems/faction_helix.js | LAND | Expansion 48/48, existing green, wired, serialized and restored. Docket reset is new-game only (checked). |
| src/systems/faction_meridian.js | INCOMPLETE | Expansion 37/37, existing 10/10, wired. No serialize or save capture: warrants, writs, contracts and ledger are lost on reload. |
| src/systems/faction_archive.js | INCOMPLETE | Expansion 30/30, existing 5/5, wired. No serialize or save capture for marks, errands or copied logs. |

## What each expansion adds

- vael: lien anchors become a paper book (invoices, writs, patrols, clauses, debtors).
- helix: bureau desks, notices, fines, audits, warrants, false-flag packs, lien drones.
- meridian: cargo spines, contracts, recovery claims, convoys with raiders, warrants, writs, account.
- archive: reading-room desk, folio buying, copied logs, errands, black-file marks, couriers, traffic.

## Tests (serial, node --test)

| Test | Result |
|---|---|
| faction-vael-expansion | 32/32 pass |
| faction-helix-expansion | 48/48 pass |
| faction-meridian-expansion | 37/37 pass |
| faction-archive-expansion | 30/30 pass |
| w-helix-526 | 7/7 pass |
| w-meridian-516 | 10/10 pass |
| weight-archive-527 | 5/5 pass |
| weight-vael-524 | 6/7 FAIL (twice, same test) |
| exp-01-helix-barks-4242 | 1/1 pass |
| exp-02-helix-grammar-4242 | 1/1 pass |
| faction-presence-service-wire | 2/2 pass |
| faction-identity-conduct | 7/7 pass |

Failure: test/weight-vael-524.test.mjs:133, "the debt is mass now". Expected 85 (30 + 55), actual 30.

## Defect 1 (vael, FIX): debt moved, then removed on the same tick

- src/systems/faction_vael.js:679-682 builds `riding` in the first pass from each anchor's pre-transfer hostId (the old host only).
- :719 `_transferLien` moves the anchor and its lien.mass onto the pirate (about :762).
- :728-732 is a "phantom mass" sweep: any entity with lienMass > 0 that is not in `riding` loses that mass. The pirate is not in `riding`, so its 55 t is removed again.
- Fix: rebuild `riding` from live anchors' hostId after the anchor loop, or at least `riding.add(body.id)` right after the :719 call.
- Cause: a code-trace conclusion, not a HEAD run. HEAD has no `riding` or phantom-sweep code, and the test file is unchanged since commit 04fe464f23c, so the dirty change caused it.
- Coverage gap: faction-vael-expansion has no transfer case (grep for transfer, thrown and LIEN TRANSFERRED finds nothing).

## Defect 2 (meridian, archive): no persistence

- src/save/saveSystem.js `_saveCapturePlan` (about lines 884-930) names helix (926) and vael (931) only. meridian and archive appear nowhere in src/save or src/core/gameState.js.
- state.meridian (faction_meridian.js:231) and state.archive (faction_archive.js:336) hold obligations. Neither system has serialize or deserialize.
- Pre-existing at HEAD (also no serialize, no save key). The expansion adds the obligations, so the gap now matters.
- Fix: add serialize/deserialize pairs, capture-plan entries, and restore calls near saveSystem.js lines 6826-6829.

## Helix reset check (game:started on load)

- game:started is emitted only at src/main.js:756, inside the new-game enterFlight() callback.
- game:newGame is emitted only in src/core/newGameBoot.js:167, inside runNewGameSimBoot, which only the new-game route calls (main.js:651).
- The continue/load route (main.js `transition: 'continue'`) emits neither, so a loaded docket is not wiped. A live load was not run.

## Wiring

- Registry: src/core/registry.js lines 152/153/159/160 (imports) and 664/665/671/672 (vaelLiens, archiveRedaction, faction_meridian, faction_helix).
- Manifest: src/runtime/authoritativeSystemManifest.js init at lines 44 and 62; update order at 139 (meridian, helix) and 143-144 (vael, archive). All four have update(dt, state). A live tick was not witnessed.

## Defect scan (four files)

- Math.random, Date.now, console, TODO, FIXME: none in code. Only header comments (vael:37, meridian:80).
- Self-recursion: none. bus.on calls sit inside init() with teardown in destroy() or _unsub().
- Caps: most growing lists are capped (vael log, invoices, writs, clauses, debtors; meridian ledger, contracts, claims, convoys, warrants, writs; archive copiedLogs and marks). Not verified: vael patrol post count, meridian convoy members, raiders and crew.
- Not checked: undefined variables (no lint run), and live runtime behaviour beyond the tests.

## Surprising

- The four expansion suites are green while weight-vael-524 is red, so none of them guards the lien transfer.
- Meridian's internal FACTION_ID 'faction_mts' is the data faction id, which is correct. The system key faction_meridian is separate.
