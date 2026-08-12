# Adversarial Review — U2 brawler-commit-doctrine

## Review identity
- Unit: brawler-commit-doctrine (WF-02, repair)
- Lenses: player, craft, integrator + sticky re-review

## Intended player experience
Fight a Bruiser and feel a committed close fight, not another flyby.

## First-pass defects (REVISE)
1. DOCTRINE_FIRE_PHASES missing brawler_commit → mute guns
2. Choreography/contracts/audio not live for new id
3. Timed flyby twin (pass-geometry egress)

## Repairs
1. Fire table admits `brawler_commit: commit`
2. combatChoreography grammar + adapters + audio map
3. Sticky commit: no runHasPassed egress; ORBIT @ 140 faceTarget; ram in commit; full MAX window

## Route evidence
phase=commit maneuver=orbit range=140 face=true spawn=brawler_commit

## Verdict
**KEEP** after sticky revise (fire + presentation + distinct commit maneuver).

## Confidence
0.88
