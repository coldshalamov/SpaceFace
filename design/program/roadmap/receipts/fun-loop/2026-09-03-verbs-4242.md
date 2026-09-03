# Fun measure — verbs — seed 4242 — 2026-09-03

Every FEEL_CONTRACT §B bar, evaluated once over the whole measurement set in this receipt (Fun Convergence Loop §3.2), then the per-run fun metrics. Values are player units. The fed-by column names the run each bar number comes from; each run section below lists only the bars that run feeds.

## Bars (FEEL_CONTRACT §B) — pooled over this receipt

| bar | value(s) | target | met | fed by |
|---|---|---|---|---|
| B1 Earned speed is kept | release speed kept 5 s after letting go, hands off (worst of 1 run(s)): 0.958194 fraction | ≥ 99 % of exit speed 10 s later, hands off and forward held | — | verbs/feel.rope_swing_release/s4242 |
| B2 Nimble regime | no feeding run in this measurement | rest→cruise ≤ 1.5 s; 180° velocity reversal ≤ 3.0 s; turn radius at cruise ≤ 1 screen depth | — | — |
| B3 The fight stays on screen | derived: 115 WU screen depth ÷ 195 WU/s measured cruise (worst case): 0.589744 s | ≥ 1.2 s to cross the visible depth at cruise | no | verbs/feel.stroke_speed/s4242 |
| B4 Shove magnitude | shove ΔV, fraction of light-hostile cruise (worst of 1 run(s)): 0.153846 fraction | shove ΔV ≥ 30 % of light-hostile cruise per hit (starter gun ≥ 5 %) | no | verbs/feel.shove_magnitude/s4242 |
| B5 Shove displacement | displacement 2 s after the shove, screen depths (worst of 1 run(s)): 0.521739 screen depths | ≥ 1 screen depth off the original line 2 s after the hit | no | verbs/feel.shove_magnitude/s4242 |
| B6 Terrain is lethal | light hostile dies at ≥ 75 % of cruise closing (ran at 0.76, 1 run(s)): 1 bool<br>hull lost at ≥ 50 % of cruise closing (worst of 1 run(s)): 1 fraction<br>helm lost at ≥ 50 % of cruise closing (1 run(s)): 1 bool | dies at ≥ 75 % cruise closing; ≥ 60 % hull + helm lost at ≥ 50 %; heavy ≤ 15 % | yes | verbs/feel.terrain_slam/s4242 |
| B7 The rope is a rope | peak line stretch (worst of 1 run(s)): 0.102717 fraction<br>tangential speed kept 5 s after release (worst of 1 run(s)): 0.958194 fraction | stretch < 10 %; release keeps ≥ 95 % of tangential speed at 5 s | no | verbs/feel.rope_swing_release/s4242 |
| B8 Draw-to-fly rips | mean speed along the stroke, fraction of cruise (worst of 1 run(s)): 0.95475 fraction<br>slowest point of the stroke, fraction of cruise (worst of 1 run(s)): 0.358974 fraction | mean stroke speed ≥ 70 % of cruise; slowest point ≥ 35 % | yes | verbs/feel.stroke_speed/s4242 |
| B9 Impacts answer | not reachable by this bench | hitstop + trauma at ΔV ≥ 8 WU/s; audio ≥ 1 octave and ≥ 12 dB apart; release snaps | — | — |
| B10 The world reacts | salvor arrives after the cargo spill (worst of 1 run(s)): 3.75 s | patrol chooses within 10 s; salvor arrives ≤ 30 s; civilians turn within 3 s | yes | verbs/world.cargo_spill/s4242 |
| B11 Hitstun law is universal | shove helm-loss duration, scenario constant (measured at only 15 % of cruise, below the ≥ 30 % ΔV regime): 1.5 s<br>terrain slam strips the helm (1 run(s)): 1 bool | one universal curve; lights ≥ 30 % ΔV stunned ≥ 1 s; heavies at gun-scale ΔV never | — | verbs/feel.shove_magnitude/s4242<br>verbs/feel.terrain_slam/s4242 |
| B12 The 60-second proof | not reachable by this bench | ≥ 9 of 11 beats in a deterministic scenario plus a headed capture at the shipping camera | — | — |
| B13 The player is never knocked around | contact knocks per minute on the player, verbs feel.knock_budget (worst of 1 run(s)): 2.3 events/min<br>largest single knock, fraction of cruise, verbs feel.knock_budget (worst of 1 run(s)): 0.177344 fraction<br>knock events that changed the player's heading (worst of 1 run(s); contract target zero): 0 events | ≤ 2 contact knocks per minute; largest ≤ 10 % of cruise; zero heading changes; no visible jitter | no | verbs/feel.knock_budget/s4242 |

Notes — the full text behind the cells, never truncated:
- **B1 Earned speed is kept** — only the 5 s release-retention clause (≥ 95 %) was measured; that sentence belongs to the rope-release scenario, and the value row is kept for the receipt. B1's own clauses — ≥ 99 % of exit speed 10 s later, hands off and with forward held — are kernel-level (<repo file> §12c) and are not benched headlessly, so this bar cannot read met from this bench.
- **B3 The fight stays on screen** — this number is derived (screen depth ÷ measured cruise), not directly timed; the cruise speed is fed by verbs/feel.stroke_speed/s4242. The above-cap camera-open clause (2× cruise exit still shows ≥ 2 s) is not benched.
- **B4 Shove magnitude** — the verdict applies the contract's 0.30 threshold; the bench-internal barB4Met boolean uses a looser 0.15 and is ignored here. The starter-gun ≥ 5 % clause and the faster-along-its-motion clause are unbenched.
- **B5 Shove displacement** — the "has not fired" clause is not instrumented by the verb bench.
- **B6 Terrain is lethal** — the heavy-side clause (≤ 15 % hull lost, helm kept at the same speed) is unbenched.
- **B7 The rope is a rope** — the verb scenario swings at cruise (195 WU/s) on an 80 WU line, not the contract's 1.5× cruise on a 100 WU line around a heavy anchor. Line break is not instrumented (the bench detaches the tether by design at release).
- **B9 Impacts answer** — hitstop, camera trauma and audio are presentation-layer; the headless bench has no instrument for them. the bar is listed here for completeness; this bench cannot measure it.
- **B10 The world reacts** — the patrol stay-with-wreck/chase clause and the civilian course-change clause are unbenched.
- **B11 Hitstun law is universal** — measured below the ≥ 30 % ΔV regime; helm duration is the scenario constant, not a measured curve, and the ≥ 1 s helm clause cannot be evaluated from it. the universal-curve sweep (one helm-loss function of ΔV ÷ cruise and attacker ÷ victim mass across guns, throws, flings and collisions) is unbenched.
- **B12 The 60-second proof** — needs the PQ-141 60-second proof scenario, which does not exist yet. the bar is listed here for completeness; this bench cannot measure it.
- **B13 The player is never knocked around** — the visible-jitter clause and the legible-deliberate-event clause are unbenched.

### verbs feel.rope_swing_release seed 4242 (run 113e8520)

Bars this run feeds (FEEL_CONTRACT §B — pooled verdict for the whole receipt):

| bar | value(s) | target | met |
|---|---|---|---|
| B1 Earned speed is kept | release speed kept 5 s after letting go, hands off (worst of 1 run(s)): 0.958194 fraction | ≥ 99 % of exit speed 10 s later, hands off and forward held | — |
| B7 The rope is a rope | peak line stretch (worst of 1 run(s)): 0.102717 fraction<br>tangential speed kept 5 s after release (worst of 1 run(s)): 0.958194 fraction | stretch < 10 %; release keeps ≥ 95 % of tangential speed at 5 s | no |

Notes — the full text behind the cells, never truncated:
- **B1 Earned speed is kept** — only the 5 s release-retention clause (≥ 95 %) was measured; that sentence belongs to the rope-release scenario, and the value row is kept for the receipt. B1's own clauses — ≥ 99 % of exit speed 10 s later, hands off and with forward held — are kernel-level (<repo file> §12c) and are not benched headlessly, so this bar cannot read met from this bench.
- **B7 The rope is a rope** — the verb scenario swings at cruise (195 WU/s) on an 80 WU line, not the contract's 1.5× cruise on a 100 WU line around a heavy anchor. Line break is not instrumented (the bench detaches the tether by design at release).

Fun metrics (law §3.2):
| metric | value | fun threshold | verdict |
|---|---|---|---|
| verbs per minute (distinct) | — | >= 4 per minute | not measured |
| consequences per player action | — | >= 2 within 3 s | not measured |
| time to first consequence | — | <= 0.3 s | not measured |
| moments per minute | — | >= 1 per minute | not measured |
| nothing-happened seconds | — | none | not measured |
| knock budget on the player | — | <= 2/min and <= 10% of cruise, never a heading change | not measured |
| deaths by cause | — | informational | not measured |

Gaps: verbsPerMinute: run metrics do not report verb usage; verbsUsed: run metrics do not report verb usage; consequencesPerAction: verb trace is scenario-specific, no player action count; timeToFirstConsequenceS: verb trace is scenario-specific, no player action count; momentsPerMinute: verb trace is scenario-specific, no per-tick collateral record; nothingHappenedSeconds: verb trace is scenario-specific, sampled not per-tick; deathsByCause: verb scenario records no deaths; knockBudget: verb scenario does not measure the knock budget

### verbs feel.shove_magnitude seed 4242 (run d70cfa8e)

Bars this run feeds (FEEL_CONTRACT §B — pooled verdict for the whole receipt):

| bar | value(s) | target | met |
|---|---|---|---|
| B4 Shove magnitude | shove ΔV, fraction of light-hostile cruise (worst of 1 run(s)): 0.153846 fraction | shove ΔV ≥ 30 % of light-hostile cruise per hit (starter gun ≥ 5 %) | no |
| B5 Shove displacement | displacement 2 s after the shove, screen depths (worst of 1 run(s)): 0.521739 screen depths | ≥ 1 screen depth off the original line 2 s after the hit | no |
| B11 Hitstun law is universal | shove helm-loss duration, scenario constant (measured at only 15 % of cruise, below the ≥ 30 % ΔV regime): 1.5 s<br>terrain slam strips the helm (1 run(s)): 1 bool | one universal curve; lights ≥ 30 % ΔV stunned ≥ 1 s; heavies at gun-scale ΔV never | — |

Notes — the full text behind the cells, never truncated:
- **B4 Shove magnitude** — the verdict applies the contract's 0.30 threshold; the bench-internal barB4Met boolean uses a looser 0.15 and is ignored here. The starter-gun ≥ 5 % clause and the faster-along-its-motion clause are unbenched.
- **B5 Shove displacement** — the "has not fired" clause is not instrumented by the verb bench.
- **B11 Hitstun law is universal** — measured below the ≥ 30 % ΔV regime; helm duration is the scenario constant, not a measured curve, and the ≥ 1 s helm clause cannot be evaluated from it. the universal-curve sweep (one helm-loss function of ΔV ÷ cruise and attacker ÷ victim mass across guns, throws, flings and collisions) is unbenched.

Fun metrics (law §3.2):
| metric | value | fun threshold | verdict |
|---|---|---|---|
| verbs per minute (distinct) | — | >= 4 per minute | not measured |
| consequences per player action | — | >= 2 within 3 s | not measured |
| time to first consequence | — | <= 0.3 s | not measured |
| moments per minute | — | >= 1 per minute | not measured |
| nothing-happened seconds | — | none | not measured |
| knock budget on the player | — | <= 2/min and <= 10% of cruise, never a heading change | not measured |
| deaths by cause | — | informational | not measured |

Gaps: verbsPerMinute: run metrics do not report verb usage; verbsUsed: run metrics do not report verb usage; consequencesPerAction: verb trace is scenario-specific, no player action count; timeToFirstConsequenceS: verb trace is scenario-specific, no player action count; momentsPerMinute: verb trace is scenario-specific, no per-tick collateral record; nothingHappenedSeconds: verb trace is scenario-specific, sampled not per-tick; deathsByCause: verb scenario records no deaths; knockBudget: verb scenario does not measure the knock budget

### verbs feel.gravity_well seed 4242 (run dd2a62de)

Bars this run feeds (FEEL_CONTRACT §B — pooled verdict for the whole receipt):

None — this run does not feed a FEEL_CONTRACT §B bar.

Fun metrics (law §3.2):
| metric | value | fun threshold | verdict |
|---|---|---|---|
| verbs per minute (distinct) | — | >= 4 per minute | not measured |
| consequences per player action | — | >= 2 within 3 s | not measured |
| time to first consequence | — | <= 0.3 s | not measured |
| moments per minute | — | >= 1 per minute | not measured |
| nothing-happened seconds | — | none | not measured |
| knock budget on the player | — | <= 2/min and <= 10% of cruise, never a heading change | not measured |
| deaths by cause | — | informational | not measured |

Gaps: verbsPerMinute: run metrics do not report verb usage; verbsUsed: run metrics do not report verb usage; consequencesPerAction: verb trace is scenario-specific, no player action count; timeToFirstConsequenceS: verb trace is scenario-specific, no player action count; momentsPerMinute: verb trace is scenario-specific, no per-tick collateral record; nothingHappenedSeconds: verb trace is scenario-specific, sampled not per-tick; deathsByCause: verb scenario records no deaths; knockBudget: verb scenario does not measure the knock budget

### verbs feel.stroke_speed seed 4242 (run e05f8372)

Bars this run feeds (FEEL_CONTRACT §B — pooled verdict for the whole receipt):

| bar | value(s) | target | met |
|---|---|---|---|
| B3 The fight stays on screen | derived: 115 WU screen depth ÷ 195 WU/s measured cruise (worst case): 0.589744 s | ≥ 1.2 s to cross the visible depth at cruise | no |
| B8 Draw-to-fly rips | mean speed along the stroke, fraction of cruise (worst of 1 run(s)): 0.95475 fraction<br>slowest point of the stroke, fraction of cruise (worst of 1 run(s)): 0.358974 fraction | mean stroke speed ≥ 70 % of cruise; slowest point ≥ 35 % | yes |

Notes — the full text behind the cells, never truncated:
- **B3 The fight stays on screen** — this number is derived (screen depth ÷ measured cruise), not directly timed; the cruise speed is fed by verbs/feel.stroke_speed/s4242. The above-cap camera-open clause (2× cruise exit still shows ≥ 2 s) is not benched.

Fun metrics (law §3.2):
| metric | value | fun threshold | verdict |
|---|---|---|---|
| verbs per minute (distinct) | — | >= 4 per minute | not measured |
| consequences per player action | — | >= 2 within 3 s | not measured |
| time to first consequence | — | <= 0.3 s | not measured |
| moments per minute | — | >= 1 per minute | not measured |
| nothing-happened seconds | — | none | not measured |
| knock budget on the player | — | <= 2/min and <= 10% of cruise, never a heading change | not measured |
| deaths by cause | — | informational | not measured |

Gaps: verbsPerMinute: run metrics do not report verb usage; verbsUsed: run metrics do not report verb usage; consequencesPerAction: verb trace is scenario-specific, no player action count; timeToFirstConsequenceS: verb trace is scenario-specific, no player action count; momentsPerMinute: verb trace is scenario-specific, no per-tick collateral record; nothingHappenedSeconds: verb trace is scenario-specific, sampled not per-tick; deathsByCause: verb scenario records no deaths; knockBudget: verb scenario does not measure the knock budget

### verbs feel.terrain_slam seed 4242 (run 804a8517)

Bars this run feeds (FEEL_CONTRACT §B — pooled verdict for the whole receipt):

| bar | value(s) | target | met |
|---|---|---|---|
| B6 Terrain is lethal | light hostile dies at ≥ 75 % of cruise closing (ran at 0.76, 1 run(s)): 1 bool<br>hull lost at ≥ 50 % of cruise closing (worst of 1 run(s)): 1 fraction<br>helm lost at ≥ 50 % of cruise closing (1 run(s)): 1 bool | dies at ≥ 75 % cruise closing; ≥ 60 % hull + helm lost at ≥ 50 %; heavy ≤ 15 % | yes |
| B11 Hitstun law is universal | shove helm-loss duration, scenario constant (measured at only 15 % of cruise, below the ≥ 30 % ΔV regime): 1.5 s<br>terrain slam strips the helm (1 run(s)): 1 bool | one universal curve; lights ≥ 30 % ΔV stunned ≥ 1 s; heavies at gun-scale ΔV never | — |

Notes — the full text behind the cells, never truncated:
- **B6 Terrain is lethal** — the heavy-side clause (≤ 15 % hull lost, helm kept at the same speed) is unbenched.
- **B11 Hitstun law is universal** — measured below the ≥ 30 % ΔV regime; helm duration is the scenario constant, not a measured curve, and the ≥ 1 s helm clause cannot be evaluated from it. the universal-curve sweep (one helm-loss function of ΔV ÷ cruise and attacker ÷ victim mass across guns, throws, flings and collisions) is unbenched.

Fun metrics (law §3.2):
| metric | value | fun threshold | verdict |
|---|---|---|---|
| verbs per minute (distinct) | — | >= 4 per minute | not measured |
| consequences per player action | — | >= 2 within 3 s | not measured |
| time to first consequence | — | <= 0.3 s | not measured |
| moments per minute | — | >= 1 per minute | not measured |
| nothing-happened seconds | — | none | not measured |
| knock budget on the player | — | <= 2/min and <= 10% of cruise, never a heading change | not measured |
| deaths by cause | — | informational | not measured |

Gaps: verbsPerMinute: run metrics do not report verb usage; verbsUsed: run metrics do not report verb usage; consequencesPerAction: verb trace is scenario-specific, no player action count; timeToFirstConsequenceS: verb trace is scenario-specific, no player action count; momentsPerMinute: verb trace is scenario-specific, no per-tick collateral record; nothingHappenedSeconds: verb trace is scenario-specific, sampled not per-tick; deathsByCause: verb scenario records no deaths; knockBudget: verb scenario does not measure the knock budget

### verbs world.cargo_spill seed 4242 (run 0601dc66)

Bars this run feeds (FEEL_CONTRACT §B — pooled verdict for the whole receipt):

| bar | value(s) | target | met |
|---|---|---|---|
| B10 The world reacts | salvor arrives after the cargo spill (worst of 1 run(s)): 3.75 s | patrol chooses within 10 s; salvor arrives ≤ 30 s; civilians turn within 3 s | yes |

Notes — the full text behind the cells, never truncated:
- **B10 The world reacts** — the patrol stay-with-wreck/chase clause and the civilian course-change clause are unbenched.

Fun metrics (law §3.2):
| metric | value | fun threshold | verdict |
|---|---|---|---|
| verbs per minute (distinct) | — | >= 4 per minute | not measured |
| consequences per player action | — | >= 2 within 3 s | not measured |
| time to first consequence | — | <= 0.3 s | not measured |
| moments per minute | — | >= 1 per minute | not measured |
| nothing-happened seconds | — | none | not measured |
| knock budget on the player | — | <= 2/min and <= 10% of cruise, never a heading change | not measured |
| deaths by cause | — | informational | not measured |

Gaps: verbsPerMinute: run metrics do not report verb usage; verbsUsed: run metrics do not report verb usage; consequencesPerAction: verb trace is scenario-specific, no player action count; timeToFirstConsequenceS: verb trace is scenario-specific, no player action count; momentsPerMinute: verb trace is scenario-specific, no per-tick collateral record; nothingHappenedSeconds: verb trace is scenario-specific, sampled not per-tick; deathsByCause: verb scenario records no deaths; knockBudget: verb scenario does not measure the knock budget

### verbs feel.knock_budget seed 4242 (run 2da51967)

Bars this run feeds (FEEL_CONTRACT §B — pooled verdict for the whole receipt):

| bar | value(s) | target | met |
|---|---|---|---|
| B13 The player is never knocked around | contact knocks per minute on the player, verbs feel.knock_budget (worst of 1 run(s)): 2.3 events/min<br>largest single knock, fraction of cruise, verbs feel.knock_budget (worst of 1 run(s)): 0.177344 fraction<br>knock events that changed the player's heading (worst of 1 run(s); contract target zero): 0 events | ≤ 2 contact knocks per minute; largest ≤ 10 % of cruise; zero heading changes; no visible jitter | no |

Notes — the full text behind the cells, never truncated:
- **B13 The player is never knocked around** — the visible-jitter clause and the legible-deliberate-event clause are unbenched.

Fun metrics (law §3.2):
| metric | value | fun threshold | verdict |
|---|---|---|---|
| verbs per minute (distinct) | — | >= 4 per minute | not measured |
| consequences per player action | — | >= 2 within 3 s | not measured |
| time to first consequence | — | <= 0.3 s | not measured |
| moments per minute | — | >= 1 per minute | not measured |
| nothing-happened seconds | — | none | not measured |
| knock budget on the player | 2.3/min, max 17.73441% of cruise, 0 heading changes | <= 2/min and <= 10% of cruise, never a heading change | over budget |
| deaths by cause | — | informational | not measured |

Gaps: verbsPerMinute: run metrics do not report verb usage; verbsUsed: run metrics do not report verb usage; consequencesPerAction: verb trace is scenario-specific, no player action count; timeToFirstConsequenceS: verb trace is scenario-specific, no player action count; momentsPerMinute: verb trace is scenario-specific, no per-tick collateral record; nothingHappenedSeconds: verb trace is scenario-specific, sampled not per-tick; deathsByCause: verb scenario records no deaths
