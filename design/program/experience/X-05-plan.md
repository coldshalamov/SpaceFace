# X-05 plan — law past the rail: read the owner before the act

Row §1P 563. Audit v2.1 (`X-05-audit.md`). Coordinates with board row 462 (RC-CHASE). Tribunal judge, 2026-10-24.

## Scores

| draft | crit-path | authentic | specific | cost | non-redundant | total |
|---|---|---|---|---|---|---|
| Skeptic (victim as witness) | 4 | 4 | 5 | 3 | 3 | **19** |
| Accountant (guarantee 1207 on d2) | 3 | 3 | 4 | 5 | 3 | **18** |
| Drifter (new Kettle Nine encounter) | 3 | 5 | 4 | 2 | 3 | **17** |

All three answer v1 ("law never fires"), not the v2 residual (ownership invisible before the act). Skeptic's witness stamp targets 344/367 custody pods, which `freightCustodyPod` already excludes from theft (`lawSecurity.js:2789`), and risks the forbidden defender-vacuum crime. Drifter adds content where the gap is legibility. Accountant's 1207 scheduling is a follow-up, not this row.

## Evidence for the chosen lever

- The magnet already skips owned goods: crew cuts are exempt from the vacuum (`mining.js:1568-1573`); pods are `payload` bodies taken only by contact or latch (`lootShards.js:465-495`; `lawSecurity.js:2740-2748,2778-2783`). Gating it changes nothing, so the least-change lever is a **pure read**.
- Pods already carry `ownerName` (`world.js:3470`, `trafficCausalChainOps.js:1187,1279,1543`, `lootShards.js:238-242`). Titled chips get only `ownerId` (`trafficRoleOps.js:961-963`), so the target panel's `Owner:` fact (`targetPanel.js:730-734`) never prints for them.

## Design

1. **Stamp the chip's owner name at title time.**
   - Where: `trafficRoleOps.js:961-963`, inside the same `if` that sets `ownerId`.
   - Resolve the cutter: the first `state.traffic.freighters` entity whose `data.worldRecordId === source.minerWorldRecordId`.
   - Set `candidate.data.ownerName = cutter?.name || cutter?.data?.name || 'Claim crew'`.
   - This is presentation data on the existing `ownerName` field. No law, heat or cargo path reads it.
2. **One-time owner read before contact.**
   - Where: `src/systems/onboarding.js` `update()`, after the rail has finished, every 15 ticks (same cadence as `egressExit`).
   - What it does: visit `state.entityIndex.pickups` and `payloads` via `forEachJobInteractable` (`livingWorldViews.js:278`). Take the first body within 220 wu of the player that is owned by someone else. A body counts as owned when either:
     - `cargoPodOwnerId(e)` is set (a module-private pure read at `lawSecurity.js:6504` — export it; behaviour unchanged), `!e.data.freightCustodyPod`, and it is not the player's; or
     - it is a titled chip (`ownerId == npcMiningSource.minerWorldRecordId`).
   - Then it calls `_showHint('firstOwnedGoods', 'Someone owns that lot. Lift it in sight, you\'re wanted.', { entityId: e.id })`.
   - Once `hints.firstOwnedGoods` is set the scan stops for good, so it costs nothing after the first read.
3. **Anchor it on the body.** In `hudAttention.js` `firstUseAttachKind` (:495), add `firstOwnedGoods → 'rock'` so the line floats at the lot instead of turning into a toast. Add the copy to `FIRST_USE_LINE` (:385). Both edits are copy and mapping only, and ORRERY-consistent.

The text is "Someone owns that lot. Lift it in sight, you're wanted." It is 10 words with one imperative.

## Numbers

- **220 wu.** That is inside the 450 wu witness radius (`CLAIMED_WITNESS_OFFSET_WU` note, `onboarding.js:280`) and outside contact range. The read lands before the act.
- **15-tick scan.** Four scans per second, and the scan retires once the hint has spoken.

## Save / determinism

- `ownerName` rides an already-persistent pickup field; no RNG, physics or law path reads it. Only digests hashing whole chip `data` move — re-record `living-adventure-shift`/`d233-npc-spill-cap` only if they snapshot data ("chip ownerName stamp").
- The hint adds one `player.hints` boolean through the free-key bag.

## Tests to add — `test/x05-owner-read-before-act.test.mjs`

1. A barge titling a chip stamps `ownerId` **and** `ownerName` (the cutter's name, or `'Claim crew'` as fallback). The target-panel facts include `Owner: <name>`.
2. An owned pod within 220 wu after the rail produces exactly one `hud:firstUse` with `verbId 'firstOwnedGoods'` and `entityId` equal to the pod. A second pod produces none.
3. The player's own pod, a `freightCustodyPod`, or an untitled chip produces no hint.
4. With the rail active, no hint fires and the key is not set.
5. Magnet pin: a titled chip at magnet range is **not** vacuumed, and contact-collecting it in sight of a lawful witness still files one `payload_theft`. No behaviour change.
6. A defender auto-collecting ordinary 344 kill shards files no incident.

## Must stay green

- **Ownership and theft:** `starter-world-titled-chip-theft`, `d92-custody-pod-npc-contact`, `d233-npc-spill-cap`, `salvage-claim-theft`, `batch3-law-custody-identity`, `convoy-hauler-death-spill`.
- **Pickups and the opening raid:** `living-adventure-shift`, `arcade-loot`, `opening-hauler-raid-*`.
- **Law and witnesses:** `first-hour-law-read`, `heat-wanted-victim`, `inf-law-witness-first-response`.
- **Labels:** `check:player-facing-labels`.

## Non-goals

- No new witness, no heat retune, no new encounter.
- No magnet change, and the defender's vacuum is never a crime.
- No bracket redesign.
- 1207 scheduling (Accountant) is parked as a separate row candidate.

## Approvals

- plan-gate reviewer 4964e62b — APPROVE (2026-10-24)
- plan-gate reviewer fb54441e — APPROVE (2026-10-24)
- plan-gate reviewer 53f3e19e — APPROVE (2026-10-24) — plan✓3
