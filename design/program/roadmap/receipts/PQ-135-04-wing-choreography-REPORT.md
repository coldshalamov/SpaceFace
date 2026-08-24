<!-- LIFETIME: HISTORICAL -->
# PQ-135.04 — Interceptor-scissors wing receipt

- **packetId:** PQ-135
- **leafId:** PQ-135.04
- **candidateCommit:** (the commit carrying this receipt)
- **disposition:** PASS
- **acceptance:** focused_green

## What changed

A four-ship wing flies the scissors as one collective event: wedge ingress → fan telegraph → two
crossing striker lanes → extension without turn-back → merge-corridor reform. Built as
`src/ai/squadFrame.js` (virtual wing frame: position/heading/shape/spacing/integrity/command,
independent of any hull, seeded from the leader, never teleported) + `src/data/squadChoreography.js`
(wedge_4/fan_4 shape sockets, hull-clearance spacing) wired through the EXISTING intent/actuator
path (tacticalAI + the PQ-135.03 desired-state control). Tokens: 2 close-attack / 1 ranged /
1 reserve; lanes locked with hysteresis — the minimum of §21A.12 this recipe needs. Physics owns
motion; ordinary patrols are unchanged until they opt into the recipe (no campaign fork).

## The numbers (M6 was → now, controller re-run 11/11)

Clean extensions 0 → 2; lane conflicts 428 → 0 (ceiling 50 asserted); closest friendly gap
2.3 → 45.8 (bar 40); reform after a pass 5.4 s; simultaneous committed attackers ≤ 2 asserted.
Disruption (M8 shove + leader kill): morph aborts, integrity 0.61, intact ships reform 1.5 s,
the shoved ship rejoins 6.5 s — asymmetric recovery, no teleport-reset, shove physics preserved.

## Mutations

Strip the lane lock → conflicts 95, ceiling goes red. Grant four close-attack tokens → four
commit at once, the ≤2 gate goes red. Both restored.

## Goldens

Legacy and V3 hashes unchanged.

## Honest residuals

Strikers never actually FIRED in the lab run — the personal burst admission did not open inside
the strike window, so "target exposure before first shot" was unmeasured. Kinematic choreography
is complete; the fire-window admission is the named follow-up (belongs with .05/Crucible
integration, not a reason to hold the landed motion work).
