<!-- LIFETIME: RECEIPT -->
# PQ-027.00 / .01 — controller review, 2026-09-10

Reviewer: independent Claude subagent, read-only, evidence reproduced locally.
Worker: cursor-agent `cursor-grok-4.6-xhigh` (campaign Lane A).
Verdict: **ACCEPT-WITH-FIX.**

## What is genuinely true (verified, not taken on the worker's word)

- **The machines kill by momentum, not by a damage tick.** `src/systems/environmentalMachinery.js`
  never touches hull; it registers force fields (`:452-472`) and a terrain anvil (`:502-513`). The
  kill lands in the slam law at `src/combat/impulseKernel.js:288` —
  `0.5 * crumple * crumple * massScale * surfaceDamageMultiplier`, where `crumple` is closing speed
  above a threshold. Kinetic energy, evaluated once at contact. The worker's claim holds.
- **The tests drive the real production route.** `bootRealPath({ profileId: 'production' })` →
  `createAuthoritativeRuntime`, real systems, `rapier-dynamic` backend. 9/9 pass; the reviewer
  reproduced the numbers independently (97.04 / 133.02 / 164.82 WU/s, hull 150 → 0, 1 slam each).
  These are measured from `entity.vel` and real `combat:collisionConsequence` bus receipts, not
  constants the test seeded.
- **It is reachable by a player.** `FIELD_FLAGS.enabled` is a Tier-B *determinism* gate
  (`src/data/fields.js:59`) — ON in the browser, OFF only under Node to keep the 47-A headless
  golden byte-identical. Systems are registered live (`src/core/registry.js:382-401`), and both
  sectors are default-route (`sector_ceres_belt` is tier 1, `charted: true`).
- **The packet was not weakened.** The whole `PQ-027.md` diff is one line — a repo-wide
  `CANONICAL_BUILD_MAP.md` → `build_map.md` rename, byte-identical in 63 sibling packets.
- **No honest NOT-DONE was overwritten.** Both prior receipts already read `STATUS DONE`
  (`809ce6610`, `586ad1032`).

## Why it is not a clean ACCEPT

1. **`.00` is stamped DONE with a listed clause of its done-when openly unmet.** The done-when reads
   *"A shoved light dies in each; **a capture per machine**."* The worker's own `UNPROVEN` line
   concedes no shipping-camera still was taken. A green `node --test` stood in for a named
   deliverable. That is the LAZY line in §1.6.
2. **Deleted honesty.** The reformat dropped disclosures the earlier receipts carried — the jaws sit
   on the working-seam slot at local 470,−700 tagged `place_crusher_module`, and the breech sits at
   900,−1100 rather than on the seam extraction mast at 458,−688. Those bear directly on the
   done-when's "legible danger volume" and must not vanish in a rewrite.
3. **Three test files per leaf** (`environmental-kill-machines`, `pq-027-00-kill-machines`,
   `pq-027-00-machines`) against a packet whose Agent-observable scenario says *"Each leaf names **a**
   deterministic scenario"* — singular.
4. **The "before" is manufactured.** With the gate off, the anvil and the reef do not exist at all,
   so "before" is *absence*, not the packet's stated gap ("system with dressing; nothing takes a
   hull"). There was no real before — prior agents had already closed it.
5. **4 of 5 `.00` tests pin the clock** (`freezeTime: true`). "Machines with no schedule" is a named
   rejection line; the schedule claim rests on a single free-clock test.

## The two findings that matter for the GAME, not the paperwork

- **The machinery can never kill the player.** `src/systems/collisionConsequences.js:160` returns
  early on `target.id === state.playerId`, confirmed deliberate in the kernel comment at
  `src/combat/impulseKernel.js:275`. You can fly a ship into the excavator jaws and live.
- **No proof anywhere shows the player shoving anything into a machine.** In every scenario the
  victim is spawned pre-placed and the *machine's own field* throws it; the player sits at a
  spectator pose. The packet's Outcome is *"Industrial machinery finishes what the player started."*
  Nothing player-started appears in any proof.

Together these mean the packet's premise — the environment as a weapon **you aim** and a hazard
**you can lose to** — is not demonstrated on either side, even though the machinery itself is real
and correct.

## Required fixes

1. `.00` returns to NOT-DONE pending the capture clause, **or** an integrator amends the done-when in
   writing. build_map §1.1 step 3 sanctions *adding* a missing number; it does not sanction dropping
   a listed deliverable, so this is an integrator decision and never a worker edit. Note that the
   current law (§1.3 rule 2) has since superseded stored captures: a still is analysed in-session by
   a vision-capable reviewer and then deleted, never committed.
2. Restore the deleted seat-mismatch disclosures from `809ce6610` / `586ad1032`.
3. Collapse three test files per leaf to the one named proof; re-add the fields-off "before is
   absence" caveat.
4. **Open a new unit** for player-initiated shove-into-machinery, and settle the player-exemption
   question as a product decision (see below).

`.01` closes on its done-when as written ("Mine pinball cascades in a scenario") — 5 cascaded,
8 mine-mine Rapier contact pairs, ~230 WU/s.
