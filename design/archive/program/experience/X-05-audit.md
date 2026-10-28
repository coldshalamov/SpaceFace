# X-05 audit — law persists past the rail

Row: build_map §1P 563. Catalog agent dad3c54b; revised after gate reviewer 03b56769 rejected v1 and
re-audit ce60a2a0 pinned the residual. Recorded by devin-lanea 2026-10-24. **v2 — gate count restarted.**

## What exists (already true)

- `heat.js` is the sole `player.heat` writer; inputs are witnessed kill receipts, unprovoked-hit chips, contraband,
  customs bolts, faction aggro, theft/collision incidents (`heat.js:1-3,58,114,368-406`). Pirate kills → 0 heat is by
  design (`lawSecurity.js:2829-2842`).
- Helios is the lawful-inspection sector (`lawSecurity.js:209-217`); ≥1 lawful patrol in high-sec (`traffic.js:1936-1956`).
- **Organic post-rail crime opportunities exist:** 344's spilled manifest cargo → `payload_theft`
  (`lawSecurity.js:~2737`, `encounterDirector.js:2030-2148`); NPC claim-miner titled chips in Helios
  (`lawSecurity.js:2750-2776` `_reportTitledClaimChip`; `mining.js:1280,1490`; `trafficRoleOps.js:955-963`; pinned by
  `test/starter-world-titled-chip-theft.test.mjs`); jettisoned NPC pods (`world.js:3463-3617`,
  `trafficCausalChainOps.js:610-652,1178,1270,1534`) with collect/latch → `payload_theft` (`lawSecurity.js:356-357,2785-2819`);
  1207 stages owner-stamped pods with a witness cutter but is not guaranteed.
- Witnessed theft presents: "THEFT REPORTED — N witnesses…" receipt (`lawSecurity.js:2699-2701`), heat → persistent
  WANTED alert (`hud.js:4077-4093`), caption "You are wanted" (`captions.js:258`), witness bark (`barkDirector.js:1160-1178`).

## Residual gap — visibility, not existence

1. **Ownership is unreadable before the act.** Pods show `Owner: <name>` only on the target panel
   (`targetPanel.js:730-734`); brackets carry no owner (`targetBracket.js:6-18`). The magnet does not take them —
   pods are `payload` bodies collected by contact/latch (`lootShards.js:472-489`) and titled chips are exempt from the
   vacuum (`mining.js:1568-1573`) — so the silent pre-collection risk is the contact/latch act itself.
   (Wording corrected per reviewer 8970be31's non-blocking nit.)
2. **Titled chips carry no owner name** (`ownerName` never stamped, `trafficRoleOps.js:961-963`), so the Owner line
   never shows for them; unscanned chips have `ownerId == null` and are not theft at all (`lawSecurity.js:2757-2758`).
3. Unwitnessed theft gives no feedback (by design: "no eye, no charge", `lawSecurity.js:2750-2751`).

Risk for any plan: making defenders' auto-vacuum of a spill count as theft would punish the honest choice.

## Approvals

- v1 REJECT 03b56769; v2 approved by 8970be31, 197c0c6c, dd4e2b83 then wording nit folded (v2.1)
- v2.1: audit-gate reviewer 3aaa7f0f — APPROVE (2026-10-24)
- v2.1: audit-gate reviewer 25f5a1e1 — APPROVE (2026-10-24)
- v2.1: audit-gate reviewer 35424739 — APPROVE (2026-10-24) — audit✓3
