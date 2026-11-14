# PRI-03 — An owned outpost is a place you supply, collect from and expand (#973, simulation half)

**Lane 2.** Read `design/program/fleet/PR-INTAKE.md` first, then the "#973" section of
`.devshots/pr-intake/reviews/grunt-ec-b.md`. The design intent is `design/game/17_THE_LADDER_AND_THE_LONG_GAME.md`
(the yard) and `13_JOBS_AND_HEISTS.md` (building your own yard): income is a **place**, not a number in a menu.

This packet lands the **simulation** half. The Automation screen (`src/ui/screens/automationPanel.js`)
is a frontend job the lead runs separately — **do not edit it**. The existing panel must keep working
against your changes: do not rename or remove any dispatcher action, event, or outpost field it reads
today (check with `grep -n "outpost" src/ui/screens/automationPanel.js`).

## Build — one commit
Three-way merge these from the PR (the review says they merge cleanly; verify, do not assume):
- `src/systems/outpostOperations.js` (new) — level/upgrade math, input stock, `outpostCommodity`,
  `outpostTransferAccess` (same sector, ≤ 450 wu), `normalizeOutpostOperation`, `outpostSaleExplanation`.
- `src/systems/economy.js` — `quoteAutomationIntake` gains outpost custody; `quoteOutpostIntake`,
  `executeOutpostIntake`.
- `src/systems/automation.js` — `inputStock`, `supplyOutpost`, `collectOutpost`, `recoverOutpostInputs`,
  `sellOutpost`, `toggleOutpostSales`, `routeOutpost`, `upgradeOutpost`, `resumeOutpost`,
  `_sellOutpost`, `_syncOutpostModules`, `_chargeOutpost`, offline settlement selling real output,
  arrears instead of liquidation, save normalisation.
- Tests: `test/automation-outpost-market-loop.test.mjs` (new) and the PR's changes to
  `test/automation-outpost-offline-chain.test.mjs`, `test/automation-outpost-presence.test.mjs`,
  `test/sf-129-outpost-charter.test.mjs`.

## Required corrections (the PR is the draft; these make it right)
1. **Nothing new per tick.** Find every caller of `_syncOutpostModules` and of the presence sync that
   calls it. If any runs on the per-tick update path, the "nothing changed" case must do no array
   allocation and no dressing/entity-list scan: compare the outpost's level and tracked ids against what
   is already placed and return early. Annex rows are created/removed only on sector enter, save load,
   purchase, upgrade and decommission. Say in the receipt which callers you found and what each costs now.
2. **New actions reach the simulation.** Each new dispatcher action the player can trigger from the
   screen must cross the worker boundary the same way the existing outpost actions do. Find how
   `buyOutpost`/`decommission` (or whatever the current action names are) travel from the panel to the
   automation system and make the eight new ones travel the same way (if that needs
   `src/core/mainToSimEventSurface.js`, regenerate it with `node scripts/lib/eventSurfaceCensus.mjs --forward-set`).
   Prove one of them end to end in a test through that real path.
3. **Short words.** Every toast and every `outpostSaleExplanation` string becomes one short plain
   sentence, at most about 60 characters, no second sentence. Examples of the tone wanted:
   `Buyer is full. Output stays here.` · `Supplied 12 units.` · `Hold is full.` · `No buyer here takes this.` ·
   `Expanded to level 2.` · `Not enough credits.` Tests that pin the old sentences follow the new ones.
4. **Old saves.** An outpost saved before this change (no `level`, `inputStock`, `saleSequence`,
   `lastSale`, `moduleEntityIds`) loads, normalises, and keeps producing and selling. Add that test with a
   literal old-shape record. Nothing is paid twice across save → Continue (cover the offline catch-up).
5. **Money has one writer.** Credits change only through economy (`grantCredits` / `economy:chargeCredits`);
   the pilot hold only through `cargo.js` (`addCargo` / `removeCargo`). If the port leaves any direct
   write to `state.player.credits` or `cargo.items`, replace it.

## Drop, do not port
`src/render/renderer.js`, `src/render/renderPackageManifest.js`, `assets/**`, `test/ashline-*.test.mjs`,
`src/ui/screens/automationPanel.js`, the PR's docs.

## Files you may edit
`src/systems/outpostOperations.js`, `src/systems/economy.js`, `src/systems/automation.js`,
`src/core/mainToSimEventSurface.js` (only via the regenerate command, only if correction 2 needs it),
the four test files above, plus existing tests that pin replaced sentences (list each with a reason).

## Checks
`node --test test/automation-outpost-market-loop.test.mjs test/automation-outpost-offline-chain.test.mjs test/automation-outpost-presence.test.mjs test/sf-129-outpost-charter.test.mjs`
then, in one call, every existing test that names automation or the economy intake:
`node --test $(grep -ln "systems/automation.js\|quoteAutomationIntake\|outpost" test/*.mjs | tr '\n' ' ')`
— report pass/fail counts; a test already failing on untouched master is reported, not "fixed".
`npm run check:src-imports`. No game or browser run.

Commit: `fleet(PRI-03): an owned outpost takes supplies, hands over output, sells for real and grows`.
