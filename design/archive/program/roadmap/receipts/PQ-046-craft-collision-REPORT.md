<!-- LIFETIME: EVIDENCE -->
# PQ-046 craft-collision consequence receipt

```yaml
packet: PQ-046
unit: PQ-046.craft-collision
candidateCommit: 02419f0cdd8f2815b2943a13cf49b484c79c08fd
lifecycleClaim: integrated
acceptanceClaim: focused_green
disposition: PASS
changedPaths:
  - src/combat/impulseKernel.js
  - src/systems/collisionConsequences.js
  - test/weapon-impulse-consequence.test.mjs
  - scripts/check-impulse-authority.mjs
focusedGates:
  - node --test test/weapon-impulse-consequence.test.mjs: 15/15 pass
  - node scripts/check-impulse-authority.mjs: pass
  - adjacent Massline, damage/death, presentation, and lifecycle tests: pass
  - npm run check:sim:v3:compare: deterministic and hash equal
routeEvidence: []
performanceEvidence:
  - no per-frame scan or allocation added; contact state is bounded by recent pairs and pending exact contacts
review:
  discovery: REVISE
  causalRereview: APPROVE
residuals:
  - player hull collision immunity intentionally retained by owner decision
followUps: []
```

## Result

Ordinary craft-on-craft impacts now route a 0.6 baseline damage consequence with causal actor
attribution when it exists. Ram Plate remains a multiplier. An exact same-tick Massline whip receipt
owns its solid contact and suppresses only the duplicate baseline packet; player contacts, glances,
repeats, and unmatched contacts retain their established behavior.

Discovery review found and repaired both provenance loss and broad Massline suppression. Causal
review then found and repaired the production new-run reset event. The final focused regressions cover
pushed A-to-B attribution, exact whip ownership, player immunity, glance/solid/repeat ordering,
deferred resolution, numeric-ID reuse, and canonical `game:started` reset.

The candidate is published on `origin/master` at the exact commit above. This receipt claims focused
owner acceptance; it does not claim a separate headed route campaign.
