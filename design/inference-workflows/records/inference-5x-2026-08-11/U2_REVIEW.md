# Adversarial Review — U2 brawler-commit-doctrine

## Review identity
- Unit: brawler-commit-doctrine (WF-02, repair)
- Lenses: player, craft, integrator (see U2-player.md / U2-domain.md / U2-integrator.md)
- + sticky re-review + audio identity re-review after skeptic

## Intended player experience
Fight a Bruiser and feel a committed close fight, not another flyby.

## First-pass defects (REVISE)
1. DOCTRINE_FIRE_PHASES missing brawler_commit → mute guns
2. Choreography/contracts/audio not live for new id
3. Timed flyby twin (pass-geometry egress + flyby SFX aliases)

## Repairs
1. Fire table admits `brawler_commit: commit`; **live authorizeAIEngagement test** on commit vs engine_flare
2. combatChoreography **ring** silhouette (not wedge) + adapters
3. Sticky commit: no runHasPassed egress; ORBIT @ 140 faceTarget; ram in commit
4. **Distinct audio recipes** `sfx_doctrine_brawler_commit/break/withdraw` (not sfx_doctrine_flyby*)

## Route evidence
phase=commit maneuver=orbit range=140 face=true spawn=brawler_commit  
authorize(commit)=authorized; setup recipe=sfx_doctrine_brawler_commit

## Verdict
**KEEP** after sticky + distinct-audio revise. Triple lens KEEP in U2-*.md.

## Confidence
0.9
