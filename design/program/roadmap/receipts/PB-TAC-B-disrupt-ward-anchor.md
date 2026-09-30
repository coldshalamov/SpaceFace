# PB-TAC-B — SF-047+048+049: disrupt working interval, ward per-carrier custody, anchor arena telegraph+escape

Board row 88 · seams `src/ai/specialistCounterplay.js` (verbs), `src/ai/combatDoctrine.js` (custody), `src/systems/fields.js` (owner arming) · status **implemented** (focused checks green; ordinary-route playthrough not performed in this environment — see Uncertainty).

Provenance note: a prior sitting of this lane left the implementation uncommitted in the working tree and was interrupted before proof/receipt. This sitting adopted that diff per AGENTS.md §3 (inspected, preserved, completed the proof; no parallel implementation). One spot-check probe was re-run by this sitting; all checks below ran in this sitting.

## Gap, in player terms (before)

- **The quiet ghost's field collapse was an instant aura.** The moment its fire window opened
(`specialistCounterplay.js` HEAD, disrupt branch: phase + cooldown were the only gates), every
field near it simply died — no visible wind-up to punish, no way to protect the field by shooting
the ghost. Shooting it did nothing; the collapse had already happened.
- **The warden escort guarded whoever was nearest.** Its ward point floated between "nearest
friendly" and the threat, so it visibly hovered over a dry fighter while the actual hauler hung
unprotected — and once it chased you it never came back on its own.
- **The anchor's snare well was spawn-time furniture.** It armed itself once at deploy
(`fields.js` HEAD: `strength: tick >= activateTick ? strength : 0`, armed forever) and bit
anything that wandered in, with no wind-up you could see and no recovery between bites — the
whole arena was one permanent slow room.

## Mechanism (after)

**SF-047 — committed working interval** (`src/ai/specialistCounterplay.js:277-341`; plan tunables
in `src/ai/specialistPlans.js:33-38`: `disruptWorkTicks: 36, disruptHoldRadiusWu: 120`):

- **Acquire at the telegraph** (`charge_cue`): the ghost snapshots position + vitality
(hull+shield). No port is touched at acquire.
- **Work**: it must hold that spot unhit through the whole wind-up (36t spans the doctrine's own
clock: `charge_cue` 30t + first beats of the 18t fire window, `combatDoctrine.js:785-791`).
- **Interrupts** — any of: a real vitality drop since acquire (existing damage rules,
`specialistCounterplay.js:310`), displacement past the hold radius (a shove or massline throw,
`:316`), the window closing without landing (the doctrine's `closing_interrupt` retreat, `:280-285`).
Each burns the **full disrupt cooldown** (`interruptDisruptWork`, `:180-184`) — the ghost must fly
a whole new approach + charge telegraph to try again.
- **Landing = owner confirmation**: only in `fire_window`, only after the wind-up elapses, and the
verb claims success **only on the field owner's count** (`fields.disruptNear(...)` n > 0,
`:333-340`) — never on the intention alone.

**SF-048 — ward is per-carrier custody** (`src/ai/combatDoctrine.js:569-621, 650-655`):

- **Sticky bind**: `escortCustody` ranks live sensor contacts by cargo band
(`rich > valuable > light > empty`, `CARGO_BAND_RANK` `:175`) then nearest then stable id, and the
escort visibly stays on THAT hull — a nearer empty ally does not steal the ward (`:598-600`).
- **Revalidation every update**: carrier died → rebinds to the next actual carrier; load delivered
or transferred (band flattens) → the obligation ends and it rebinds; no carriers at all → fails
closed to the pre-SF-048 nearest-friendly ward (`escortWard`).
- **Leashed dart**: the breach chase (`shield_dart`) breaks off the moment it would drag the
screen beyond `ESCORT_DART_LEASH_WU = 420` wu of its custody carrier (`:650-655`) — the load
outranks the chase; previously the chase ran the full authored 36t dart clock regardless.
- Custody id is exposed on the frozen doctrine record for inspection surfaces (`frozenRecord`,
`:1725-1726`).

**SF-049 — arena telegraph + escape** (`src/systems/fields.js:940-1000` + verb
`specialistCounterplay.js:342-367`):

- **The owner holds the arming law**: new `fields.setAnchorArmed(state, sourceId, armed, tick)`
(`fields.js:991-1004`) is the only handle that flips a well's `armed` gate; the strength update
exerts pull only when `armed !== false && spinup elapsed` (`fields.js:977-980`). Idempotent: an
already-armed well is NOT re-spun; a re-arm after disarm restarts the hull's authored spinup.
- **The verb drives the doctrine cycle**: armed only across the telegraphed commit
(`field_spool` → `anchor_hold`, `combatDoctrine.js:557-559`), disarmed on approach and recovery —
a recovery always stands between two bites, and every bite is preceded by a visible wind-up (the
hull's authored `spinupTicks`, 45t in the fixture) the player can simply fly out of.
- **Placement stays honest**: the well's center is the anchor HULL (existing fields owner), never
the player; radius, caps and lifetime stay the existing fields law (PQ-147 machinery untouched).

## Before/after proof (same geometry, same inputs)

Ghost with `disruptNear` stubbed to count=1, acquired at `charge_cue` tick 100, called in
`fire_window` at tick 110 (before the 36t wind-up elapses). Old verb extracted from `HEAD`
(`git show HEAD:src/ai/specialistCounterplay.js`, probe re-run by this sitting):

```
OLD verb (fire_window@110): {"verb":"disrupt_field","ok":true,"count":1}   ← instant aura
NEW verb (fire_window@110): null                                            ← wind-up not elapsed
NEW verb (fire_window@136): {"verb":"disrupt_field","ok":true,"count":1}   ← owner confirms after the work
```

The old snare verb (HEAD) never touched an owner at all — it returned
`{verb:'snare_field', ok:true, radius}` from a player-distance check while the well bit
permanently from spawn; the old ward had no custody concept (nearest friendly only).

## Files

| Path | Change |
|---|---|
| `src/ai/specialistPlans.js` | field_disruptor carries disruptWorkTicks / disruptHoldRadiusWu (SF-047) |
| `src/ai/specialistCounterplay.js` | disrupt = committed working interval with damage/displacement/window interrupts + owner-confirmed landing (SF-047); snare verb drives the owner arming cycle (SF-049). (File also carries PB-TAC-A's uncommitted SF-046/SF-052 work — same lane, landed separately.) |
| `src/ai/combatDoctrine.js` | escortCustody: sticky per-carrier bind from sensor cargo bands, revalidation (death/delivery/transfer), fail-closed; dart leash 420 wu; custodyTargetId on the frozen record (SF-048) |
| `src/systems/fields.js` | setAnchorArmed owner handle + armed/spinup strength gate, default-armed for hull-only fixtures and save rebuilds (SF-049). **Mixed dirty file**: also carries PB-ORD-C's uncommitted mine loose-body hunks (foreign, another row) — the SF-049 hunks are additive and disjoint. |
| `test/pb-tac-b-disrupt-ward-anchor.test.mjs` | new: 9 counterexample tests (4× SF-047 lifecycle/interrupts, 3× SF-048 custody/leash, 2× SF-049 owner arming/cycle) |
| `test/pq-140-02-specialists.test.mjs` | the shared specialist suite updated to the committed working interval (early fire-window tick touches nothing; collapse lands at 48 after the wind-up) |

Reachability (composition clause): the ghost is composed with the cutter in authored encounter
359 (PB-TAC-A); the anchor is authored at `src/data/encounters/333-field-anchor-controller.js`;
the escort is authored at `src/data/encounters/340-vael-warden-convoy.js` / 341 / 342. All three
roles reach the player through ordinary encounter spawning; no hidden flags.

## Checks (all run this sitting, real exit codes)

| Command | Exit | Result |
|---|---|---|
| `node --test test/pb-tac-b-disrupt-ward-anchor.test.mjs` | 0 | 9/9 |
| `node --test test/pq-140-02-specialists.test.mjs test/pb-tac-a-cutter-commit.test.mjs test/wave-b4-specialist-plans.test.mjs test/wf02-escort-screen-doctrine.test.mjs test/field-anchor-controller.test.mjs` | 0 | 28/28 |
| `node --test test/combat-doctrines.test.mjs test/fields-integration.test.mjs test/fields-kernel.test.mjs test/pq-147-02-field-counterplay.test.mjs test/inst-09-doctrine-cues.test.mjs` | 0 | 46/46 |
| `node --test test/pirate-predation-authority.test.mjs test/combat-ai-intentional-movement.test.mjs test/law-responder-doctrine.test.mjs test/ai-engagement-authority.test.mjs` (packets' named starting points) | 0 | 67/67 |
| old-vs-new probe (above) | 0 | HEAD's verb fires at fire_window@110; the new verb holds to the wind-up |

Total: 150 focused assertions across the row's file + adjacent doctrine/fields/authority suites,
0 failures. Determinism: all new clockwork is sim ticks on injected state — no `state.rng`
consumer, no wall time, no ambient randomness (the commit ledger is a WeakMap keyed on GameState,
tick-advanced only).

## Uncertainty

- **Ordinary route unproven**: no live playthrough of a doctrine-driven ghost working interval,
escort custody chase, or anchor arena cycle was performed in this environment (no headed
session). The doctrine clocks the intervals span (charge 30t / fire 18t; field_spool → anchor_hold
→ recover) were read from `combatDoctrine.js:557-559, 785-792`, not flown. SF-047's acceptance
("place the field behind a hull and at range limit") and SF-049's three-context acceptance (open
space / narrow corridor / neutral berth) remain open for a session-shape pass.
- The vitality-damage interrupt reads hull+shield drops; a shield-regen tick cannot false-trigger
it (only a decrease interrupts), but shield-tick combat tuning on the live route was not observed.
- `src/systems/fields.js` and `src/ai/combatDoctrine.js` are shared-dirty with other rows' work
(PB-ORD-C mines; PB-TAC-A counterplay); a pathspec commit of this row's files should name the
mixing per AGENTS.md §3. `fields.js` was NOT in the row's verified path list but is the field
owner the packets name ("the field owner must receive the actual disruption request"; "use the
existing field-anchor controller") — the owner seam is where the mechanism lives.
