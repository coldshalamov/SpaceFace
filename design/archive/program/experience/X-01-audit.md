# X-01 audit — P2 first-hour life: deck, one real fight, loop closure

Row: build_map §1P 559. Catalog agent e08e669d; revised after gate reviewer 03b56769 rejected v1 and
re-audit ce60a2a0 pinned the residual. Recorded by devin-lanea 2026-10-24. **v2 — gate count restarted.**

## What exists (already true)

- **A real fight in hour 1 exists.** Encounter 344 `opening_hauler_raid` is a day-0 Helios guarantee,
  `earlyDelayS [60,170]`; authored guarantees bypass the tutorial/pacing blocks
  (`344-opening-hauler-raid.js:40-64`; `encounterDirector.js:1203,1226-1245`). A 3-ship raider squad: a
  `reaver_pirate` anchor plus ≥1 guaranteed `wasp_swarmer` — 1–2 reavers + 1–2 wasps (`344.js:377-388`,
  `encounterDirector.js:4086-4160`); reavers are armed (`enemies.js:155-156`). (v3: squad line corrected per
  reviewer dd4e2b83.)
- **The tier-0 deck is not empty:** 367 (day-1), 1207, 1209, 1210 combat shapes plus patrol_scan/bounty_hunter.
- **Kill → salvage → sell closes mechanically.** Production profile (`runtimeProfiles.js:25,36`: `combat.salvageBay`,
  `massline2.lootShards`) suppresses the authored contraband `d.loot` (`combat.js:1098,1137`) and rolls the heavy
  kill-reward burst (`killRewards.js:28-29,47-126,195-196`): scrap, electronics, alloys, munitions, hull plate.
  Shards auto-home into the salvage bay (`mining.js:77,1522-1525`; `cargo.js:498-600,774`); docking cashes it in with
  the toast "Salvage bay cashed in: N units for C cr." (`cargo.js:1219-1249`).

## Residual gaps

1. **The loop is invisible until it has already paid.** `salvage:changed` and `salvage:bayCashedIn` have zero
   consumers (`docs/EVENT_ROUTING.md:1036-1037`); `hud.js:31` imports `salvageBayReading` but never calls it. No
   first-hour line says the bay pays at the dock — the player learns it retroactively from one toast.
2. **Restricted remainder points nowhere reachable.** Munitions in the reaver burst trigger a warn toast pointing at a
   black market (`cargo.js:1225-1232`) that a first-hour player cannot reach.
3. **A passive player is never attacked by 344** (`344.js:243-254`); the fight is opt-in. (Teeth on the rail are
   X-02's job; X-01 keeps 344's defend/rob/fly-on choice.)

## Approvals

- v1 REJECT 03b56769; v2 REJECT dd4e2b83 (squad composition)
- v3: audit-gate reviewer 3aaa7f0f — APPROVE (2026-10-24)
- v3: audit-gate reviewer 25f5a1e1 — APPROVE (2026-10-24)
- v3: audit-gate reviewer 35424739 — APPROVE (2026-10-24) — audit✓3
