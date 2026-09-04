# Fun measure — verbs — seed 4242 — 2026-09-04

Every FEEL_CONTRACT §B bar, evaluated once over the whole measurement set in this receipt (Fun Convergence Loop §3.2), then the per-run fun metrics. Values are player units. The fed-by column names the run each bar number comes from; each run section below lists only the bars that run feeds.

## Bars (FEEL_CONTRACT §B) — pooled over this receipt

| bar | value(s) | target | met | fed by |
|---|---|---|---|---|
| B1 Earned speed is kept | release speed kept 5 s after letting go, hands off (worst of 1 run(s)): 0.958194 fraction<br>speed kept 10 s after a 2x cruise exit, hands off: 1 fraction<br>speed kept 10 s after a 2x cruise exit, forward held: 1 fraction | ≥ 99 % of exit speed 10 s later, hands off and forward held | yes | verbs/feel.rope_swing_release/s4242<br>verbs/feel.earned_speed_kept/s4242 |
| B2 Nimble regime | rest to cruise, Hitch (starter): 3.05 s<br>full 180 deg velocity reversal, Hitch (starter): 4.483333 s<br>turn radius at cruise, Hitch (starter): 8.861397 screen depths<br>rest to cruise, Wasp: 2.116667 s<br>full 180 deg velocity reversal, Wasp: 3.966667 s<br>turn radius at cruise, Wasp: 5.357837 screen depths | rest→cruise ≤ 1.5 s; 180° velocity reversal ≤ 3.0 s; turn radius at cruise ≤ 1 screen depth | no | verbs/feel.reversal_course/s4242 |
| B3 The fight stays on screen | seconds to cross the visible depth at cruise, Hitch (starter): 0.585123 s<br>visible depth at 2x cruise, as a multiple of the at-cruise depth, Hitch (starter): 1.217963 x at-cruise depth<br>visible depth at 3x cruise, as a multiple of the at-cruise depth, Hitch (starter): 1.313559 x at-cruise depth<br>visible depth grows monotonically from cruise to 3x cruise, Hitch (starter): yes<br>smallest share of frame width the starter hull ever falls to, Hitch (starter): 10.508756 % of frame width | ≥ 1.2 s to cross the visible depth at cruise | no | verbs/feel.screen_crossing/s4242 |
| B4 Shove magnitude | shove ΔV, fraction of light-hostile cruise (worst of 1 run(s)): 0.125 fraction<br>starter gun delta-V, fraction of light-hostile cruise: 0.014536 fraction<br>light hostile at cruise shoved ALONG its motion gets faster (speed after / speed before): 1.528981 ratio | shove ΔV ≥ 30 % of light-hostile cruise per hit (starter gun ≥ 5 %) | no | verbs/feel.shove_magnitude/s4242 |
| B5 Shove displacement | displacement 2 s after the shove, screen depths (worst of 1 run(s)): 0.463347 screen depths<br>victim has not fired within 2 s of the shove-weapon hit: no | ≥ 1 screen depth off the original line 2 s after the hit | no | verbs/feel.shove_magnitude/s4242 |
| B6 Terrain is lethal | light hostile dies at ≥ 75 % of cruise closing (ran at 76 % of cruise, 1 run(s)): yes<br>hull lost at ≥ 50 % of cruise closing (worst of 1 run(s)): 1 fraction<br>helm lost at ≥ 50 % of cruise closing (1 run(s)): yes | dies at ≥ 75 % cruise closing; ≥ 60 % hull + helm lost at ≥ 50 %; heavy ≤ 15 % | yes | verbs/feel.terrain_slam/s4242 |
| B7 The rope is a rope | peak line stretch (worst of 1 run(s)): 0.102717 fraction<br>tangential speed kept 5 s after release (worst of 1 run(s)): 0.958194 fraction | stretch < 10 %; release keeps ≥ 95 % of tangential speed at 5 s | no | verbs/feel.rope_swing_release/s4242 |
| B8 Draw-to-fly rips | mean speed along the stroke, fraction of cruise (worst of 1 run(s)): 0.95475 fraction<br>slowest point of the stroke, fraction of cruise (worst of 1 run(s)): 0.358974 fraction | mean stroke speed ≥ 70 % of cruise; slowest point ≥ 35 % | yes | verbs/feel.stroke_speed/s4242 |
| B9 Impacts answer | collision audio pitch, scout-on-rock vs freighter-on-station: 1.08 octaves<br>collision audio loudness, same two cases: 18.4 dB<br>Massline razor release time-domain snap: 55 ms | hitstop + trauma at ΔV ≥ 8 WU/s; audio ≥ 1 octave and ≥ 12 dB apart; release snaps | yes | verbs/feel.impact_feedback/s4242 |
| B10 The world reacts | salvor arrives after the cargo spill (worst of 1 run(s)): 3.75 s<br>patrol decides stay-or-chase after a witnessed kill: 10 s<br>a live NPC reaches spilled cargo: 15 s<br>a civilian within 300 WU of gunfire changes course: 3 s | salvor arrives ≤ 30 s; patrol chooses within 10 s; civilians turn within 3 s | no | verbs/world.cargo_spill/s4242<br>verbs/world.reaction_trio/s4242 |
| B11 Hitstun law is universal | shove helm-loss duration, scenario constant (measured at only 13 % of cruise, below the ≥ 30 % ΔV regime): 0.483333 s<br>terrain slam strips the helm (1 run(s)): yes<br>light hull loses the helm >= 1 s at measured k >= 0.30 - gun: 0.483333 s<br>light hull loses the helm >= 1 s at measured k >= 0.30 - rope_throw: 4.133333 s<br>light hull loses the helm >= 1 s at measured k >= 0.30 - well_fling: 0 s<br>light hull loses the helm >= 1 s at measured k >= 0.30 - collision: 1.5 s<br>heavy hull at gun-scale delta-V never loses the helm (measured k <= 0.06, all sources): 1.5 s<br>one law: relative spread of helm-loss across the four sources at matched k (light hull, k ~ 0.30): 1 fraction<br>helm-loss is monotone non-decreasing in k (light hull, gun source): yes | one universal curve; lights ≥ 30 % ΔV stunned ≥ 1 s; heavies at gun-scale ΔV never | no | verbs/feel.shove_magnitude/s4242<br>verbs/feel.terrain_slam/s4242<br>verbs/feel.hitstun_curve/s4242 |
| B12 The 60-second proof | not reachable by this bench | ≥ 9 of 11 beats in a deterministic scenario plus a headed capture at the shipping camera | — | — |
| B13 The player is never knocked around | contact knocks per minute on the player, verbs feel.knock_budget (worst of 1 run(s)): 0 events/min<br>largest single knock, fraction of cruise, verbs feel.knock_budget (worst of 1 run(s)): 0 fraction<br>knock events that changed the player's heading (worst of 1 run(s); contract target zero): 0 events | ≤ 2 contact knocks per minute; largest ≤ 10 % of cruise; zero heading changes; no visible jitter | yes | verbs/feel.knock_budget/s4242 |

Notes — the full text behind the cells, never truncated:
- **B1 Earned speed is kept** — only the 5 s release-retention clause (≥ 95 %) was measured; that sentence belongs to the rope-release scenario, and the value row is kept for the receipt. B1's own clauses — ≥ 99 % of exit speed 10 s later, hands off and with forward held — are kernel-level (<repo file> §12c) and are not benched headlessly, so this bar cannot read met from this bench. exit 389.99810791015625 WU/s from a physics impulse; cruise 194.99905395507812 WU/s exit 389.99810791015625 WU/s from a physics impulse; cruise 194.99905395507812 WU/s
- **B2 Nimble regime** — fed only by flight-reversal / flight-accel-brake — not in this evaluation input r = 1011.0711905401149 WU at cruise 194.99905395507812 WU/s; screen depth 114.0983960741242 WU read from the live chase camera r = 594.0637547719508 WU at cruise 209.9993438720703 WU/s; screen depth 110.87753595364437 WU read from the live chase camera
- **B3 The fight stays on screen** — superseded by the real-path feel.screen_crossing run; the stroke-derived estimate is not applied. screen depth 114.0983960741242 WU read from the live chase camera at cruise 194.99905395507812 WU/s; camera speed reference maxSpeed=172.0727272727273 reached 389.99810791015625 WU/s by a physics impulse (target 2x cruise = 389.99810791015625); depth 138.9675801782694 WU vs 114.0983960741242 WU at cruise reached 584.9971923828125 WU/s by a physics impulse (target 3x cruise = 584.9971618652344); depth 149.8750117922818 WU 61 samples of the live camera depth between 194.99905395507812 and 584.9971923828125 WU/s; largest backward step 0 WU hull 28 WU (2 x collisionRadius) against frame width = visible depth x 1.7777777777777777 (the camera's own default aspect); worst case at 519.9975026448567 WU/s
- **B4 Shove magnitude** — the verdict applies the contract's 0.30 threshold; the bench-internal barB4Met boolean uses a looser 0.15 and is ignored here. The starter-gun ≥ 5 % clause and the faster-along-its-motion clause are unbenched.
- **B5 Shove displacement** — the "has not fired" clause is not instrumented by the verb bench.
- **B6 Terrain is lethal** — the heavy-side clause (≤ 15 % hull lost, helm kept at the same speed) is unbenched. the ≥ 50 % band damage and helm clauses were exercised by the same slam run(s) as the lethality clause, not by a separate slower run.
- **B7 The rope is a rope** — the verb scenario swings at cruise (195 WU/s) on an 80 WU line, not the contract's 1.5× cruise on a 100 WU line around a heavy anchor. Line break is not instrumented (the bench detaches the tether by design at release).
- **B9 Impacts answer** — hitstop, camera trauma and audio are presentation-layer; the headless bench has no instrument for them. the bar is listed here for completeness; this bench cannot measure it. hard-coded 0 on all nine branches before PQ-139.00
- **B10 The world reacts** — the patrol stay-with-wreck/chase clause and the civilian course-change clause are unbenched. NEVER — no responder ever held with the wreck while another pursued salvor 325 arrived NEVER — the civilian flew straight through the firefight
- **B11 Hitstun law is universal** — measured below the ≥ 30 % ΔV regime; helm duration is the scenario constant, not a measured curve, and the ≥ 1 s helm clause cannot be evaluated from it. the universal-curve sweep (one helm-loss function of ΔV ÷ cruise and attacker ÷ victim mass across guns, throws, flings and collisions) is unbenched. gun 0.4833s, rope_throw 4.1333s, well_fling 0s, collision 1.5s
- **B12 The 60-second proof** — needs the PQ-141 60-second proof scenario, which does not exist yet. the bar is listed here for completeness; this bench cannot measure it.
- **B13 The player is never knocked around** — the visible-jitter clause and the legible-deliberate-event clause are unbenched.

### verbs feel.rope_swing_release seed 4242 (run 113e8520)

Bars this run feeds (FEEL_CONTRACT §B — pooled verdict for the whole receipt):

| bar | value(s) | target | met |
|---|---|---|---|
| B1 Earned speed is kept | release speed kept 5 s after letting go, hands off (worst of 1 run(s)): 0.958194 fraction<br>speed kept 10 s after a 2x cruise exit, hands off: 1 fraction<br>speed kept 10 s after a 2x cruise exit, forward held: 1 fraction | ≥ 99 % of exit speed 10 s later, hands off and forward held | yes |
| B7 The rope is a rope | peak line stretch (worst of 1 run(s)): 0.102717 fraction<br>tangential speed kept 5 s after release (worst of 1 run(s)): 0.958194 fraction | stretch < 10 %; release keeps ≥ 95 % of tangential speed at 5 s | no |

Notes — the full text behind the cells, never truncated:
- **B1 Earned speed is kept** — only the 5 s release-retention clause (≥ 95 %) was measured; that sentence belongs to the rope-release scenario, and the value row is kept for the receipt. B1's own clauses — ≥ 99 % of exit speed 10 s later, hands off and with forward held — are kernel-level (<repo file> §12c) and are not benched headlessly, so this bar cannot read met from this bench. exit 389.99810791015625 WU/s from a physics impulse; cruise 194.99905395507812 WU/s exit 389.99810791015625 WU/s from a physics impulse; cruise 194.99905395507812 WU/s
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

### verbs feel.shove_magnitude seed 4242 (run bd5493fc)

Bars this run feeds (FEEL_CONTRACT §B — pooled verdict for the whole receipt):

| bar | value(s) | target | met |
|---|---|---|---|
| B4 Shove magnitude | shove ΔV, fraction of light-hostile cruise (worst of 1 run(s)): 0.125 fraction<br>starter gun delta-V, fraction of light-hostile cruise: 0.014536 fraction<br>light hostile at cruise shoved ALONG its motion gets faster (speed after / speed before): 1.528981 ratio | shove ΔV ≥ 30 % of light-hostile cruise per hit (starter gun ≥ 5 %) | no |
| B5 Shove displacement | displacement 2 s after the shove, screen depths (worst of 1 run(s)): 0.463347 screen depths<br>victim has not fired within 2 s of the shove-weapon hit: no | ≥ 1 screen depth off the original line 2 s after the hit | no |
| B11 Hitstun law is universal | shove helm-loss duration, scenario constant (measured at only 13 % of cruise, below the ≥ 30 % ΔV regime): 0.483333 s<br>terrain slam strips the helm (1 run(s)): yes<br>light hull loses the helm >= 1 s at measured k >= 0.30 - gun: 0.483333 s<br>light hull loses the helm >= 1 s at measured k >= 0.30 - rope_throw: 4.133333 s<br>light hull loses the helm >= 1 s at measured k >= 0.30 - well_fling: 0 s<br>light hull loses the helm >= 1 s at measured k >= 0.30 - collision: 1.5 s<br>heavy hull at gun-scale delta-V never loses the helm (measured k <= 0.06, all sources): 1.5 s<br>one law: relative spread of helm-loss across the four sources at matched k (light hull, k ~ 0.30): 1 fraction<br>helm-loss is monotone non-decreasing in k (light hull, gun source): yes | one universal curve; lights ≥ 30 % ΔV stunned ≥ 1 s; heavies at gun-scale ΔV never | no |

Notes — the full text behind the cells, never truncated:
- **B4 Shove magnitude** — the verdict applies the contract's 0.30 threshold; the bench-internal barB4Met boolean uses a looser 0.15 and is ignored here. The starter-gun ≥ 5 % clause and the faster-along-its-motion clause are unbenched.
- **B5 Shove displacement** — the "has not fired" clause is not instrumented by the verb bench.
- **B11 Hitstun law is universal** — measured below the ≥ 30 % ΔV regime; helm duration is the scenario constant, not a measured curve, and the ≥ 1 s helm clause cannot be evaluated from it. the universal-curve sweep (one helm-loss function of ΔV ÷ cruise and attacker ÷ victim mass across guns, throws, flings and collisions) is unbenched. gun 0.4833s, rope_throw 4.1333s, well_fling 0s, collision 1.5s

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
| B8 Draw-to-fly rips | mean speed along the stroke, fraction of cruise (worst of 1 run(s)): 0.95475 fraction<br>slowest point of the stroke, fraction of cruise (worst of 1 run(s)): 0.358974 fraction | mean stroke speed ≥ 70 % of cruise; slowest point ≥ 35 % | yes |

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
| B6 Terrain is lethal | light hostile dies at ≥ 75 % of cruise closing (ran at 76 % of cruise, 1 run(s)): yes<br>hull lost at ≥ 50 % of cruise closing (worst of 1 run(s)): 1 fraction<br>helm lost at ≥ 50 % of cruise closing (1 run(s)): yes | dies at ≥ 75 % cruise closing; ≥ 60 % hull + helm lost at ≥ 50 %; heavy ≤ 15 % | yes |
| B11 Hitstun law is universal | shove helm-loss duration, scenario constant (measured at only 13 % of cruise, below the ≥ 30 % ΔV regime): 0.483333 s<br>terrain slam strips the helm (1 run(s)): yes<br>light hull loses the helm >= 1 s at measured k >= 0.30 - gun: 0.483333 s<br>light hull loses the helm >= 1 s at measured k >= 0.30 - rope_throw: 4.133333 s<br>light hull loses the helm >= 1 s at measured k >= 0.30 - well_fling: 0 s<br>light hull loses the helm >= 1 s at measured k >= 0.30 - collision: 1.5 s<br>heavy hull at gun-scale delta-V never loses the helm (measured k <= 0.06, all sources): 1.5 s<br>one law: relative spread of helm-loss across the four sources at matched k (light hull, k ~ 0.30): 1 fraction<br>helm-loss is monotone non-decreasing in k (light hull, gun source): yes | one universal curve; lights ≥ 30 % ΔV stunned ≥ 1 s; heavies at gun-scale ΔV never | no |

Notes — the full text behind the cells, never truncated:
- **B6 Terrain is lethal** — the heavy-side clause (≤ 15 % hull lost, helm kept at the same speed) is unbenched. the ≥ 50 % band damage and helm clauses were exercised by the same slam run(s) as the lethality clause, not by a separate slower run.
- **B11 Hitstun law is universal** — measured below the ≥ 30 % ΔV regime; helm duration is the scenario constant, not a measured curve, and the ≥ 1 s helm clause cannot be evaluated from it. the universal-curve sweep (one helm-loss function of ΔV ÷ cruise and attacker ÷ victim mass across guns, throws, flings and collisions) is unbenched. gun 0.4833s, rope_throw 4.1333s, well_fling 0s, collision 1.5s

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
| B10 The world reacts | salvor arrives after the cargo spill (worst of 1 run(s)): 3.75 s<br>patrol decides stay-or-chase after a witnessed kill: 10 s<br>a live NPC reaches spilled cargo: 15 s<br>a civilian within 300 WU of gunfire changes course: 3 s | salvor arrives ≤ 30 s; patrol chooses within 10 s; civilians turn within 3 s | no |

Notes — the full text behind the cells, never truncated:
- **B10 The world reacts** — the patrol stay-with-wreck/chase clause and the civilian course-change clause are unbenched. NEVER — no responder ever held with the wreck while another pursued salvor 325 arrived NEVER — the civilian flew straight through the firefight

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

### verbs feel.knock_budget seed 4242 (run 3fa40bc0)

Bars this run feeds (FEEL_CONTRACT §B — pooled verdict for the whole receipt):

| bar | value(s) | target | met |
|---|---|---|---|
| B13 The player is never knocked around | contact knocks per minute on the player, verbs feel.knock_budget (worst of 1 run(s)): 0 events/min<br>largest single knock, fraction of cruise, verbs feel.knock_budget (worst of 1 run(s)): 0 fraction<br>knock events that changed the player's heading (worst of 1 run(s); contract target zero): 0 events | ≤ 2 contact knocks per minute; largest ≤ 10 % of cruise; zero heading changes; no visible jitter | yes |

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
| knock budget on the player | 0/min, max 0% of cruise, 0 heading changes | <= 2/min and <= 10% of cruise, never a heading change | within budget |
| deaths by cause | — | informational | not measured |

Gaps: verbsPerMinute: run metrics do not report verb usage; verbsUsed: run metrics do not report verb usage; consequencesPerAction: verb trace is scenario-specific, no player action count; timeToFirstConsequenceS: verb trace is scenario-specific, no player action count; momentsPerMinute: verb trace is scenario-specific, no per-tick collateral record; nothingHappenedSeconds: verb trace is scenario-specific, sampled not per-tick; deathsByCause: verb scenario records no deaths

### verbs feel.earned_speed_kept seed 4242 (run 9c75c036)

Bars this run feeds (FEEL_CONTRACT §B — pooled verdict for the whole receipt):

| bar | value(s) | target | met |
|---|---|---|---|
| B1 Earned speed is kept | release speed kept 5 s after letting go, hands off (worst of 1 run(s)): 0.958194 fraction<br>speed kept 10 s after a 2x cruise exit, hands off: 1 fraction<br>speed kept 10 s after a 2x cruise exit, forward held: 1 fraction | ≥ 99 % of exit speed 10 s later, hands off and forward held | yes |

Notes — the full text behind the cells, never truncated:
- **B1 Earned speed is kept** — only the 5 s release-retention clause (≥ 95 %) was measured; that sentence belongs to the rope-release scenario, and the value row is kept for the receipt. B1's own clauses — ≥ 99 % of exit speed 10 s later, hands off and with forward held — are kernel-level (<repo file> §12c) and are not benched headlessly, so this bar cannot read met from this bench. exit 389.99810791015625 WU/s from a physics impulse; cruise 194.99905395507812 WU/s exit 389.99810791015625 WU/s from a physics impulse; cruise 194.99905395507812 WU/s

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

### verbs feel.hitstun_curve seed 4242 (run a23db5c7)

Bars this run feeds (FEEL_CONTRACT §B — pooled verdict for the whole receipt):

| bar | value(s) | target | met |
|---|---|---|---|
| B11 Hitstun law is universal | shove helm-loss duration, scenario constant (measured at only 13 % of cruise, below the ≥ 30 % ΔV regime): 0.483333 s<br>terrain slam strips the helm (1 run(s)): yes<br>light hull loses the helm >= 1 s at measured k >= 0.30 - gun: 0.483333 s<br>light hull loses the helm >= 1 s at measured k >= 0.30 - rope_throw: 4.133333 s<br>light hull loses the helm >= 1 s at measured k >= 0.30 - well_fling: 0 s<br>light hull loses the helm >= 1 s at measured k >= 0.30 - collision: 1.5 s<br>heavy hull at gun-scale delta-V never loses the helm (measured k <= 0.06, all sources): 1.5 s<br>one law: relative spread of helm-loss across the four sources at matched k (light hull, k ~ 0.30): 1 fraction<br>helm-loss is monotone non-decreasing in k (light hull, gun source): yes | one universal curve; lights ≥ 30 % ΔV stunned ≥ 1 s; heavies at gun-scale ΔV never | no |

Notes — the full text behind the cells, never truncated:
- **B11 Hitstun law is universal** — measured below the ≥ 30 % ΔV regime; helm duration is the scenario constant, not a measured curve, and the ≥ 1 s helm clause cannot be evaluated from it. the universal-curve sweep (one helm-loss function of ΔV ÷ cruise and attacker ÷ victim mass across guns, throws, flings and collisions) is unbenched. gun 0.4833s, rope_throw 4.1333s, well_fling 0s, collision 1.5s

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

### verbs feel.impact_feedback seed 4242 (run ad57c85f)

Bars this run feeds (FEEL_CONTRACT §B — pooled verdict for the whole receipt):

| bar | value(s) | target | met |
|---|---|---|---|
| B9 Impacts answer | collision audio pitch, scout-on-rock vs freighter-on-station: 1.08 octaves<br>collision audio loudness, same two cases: 18.4 dB<br>Massline razor release time-domain snap: 55 ms | hitstop + trauma at ΔV ≥ 8 WU/s; audio ≥ 1 octave and ≥ 12 dB apart; release snaps | yes |

Notes — the full text behind the cells, never truncated:
- **B9 Impacts answer** — hitstop, camera trauma and audio are presentation-layer; the headless bench has no instrument for them. the bar is listed here for completeness; this bench cannot measure it. hard-coded 0 on all nine branches before PQ-139.00

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

### verbs feel.knock_budget_10min seed 4242 (run ece5a6d9)

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

### verbs feel.reversal_course seed 4242 (run 0d37e634)

Bars this run feeds (FEEL_CONTRACT §B — pooled verdict for the whole receipt):

| bar | value(s) | target | met |
|---|---|---|---|
| B2 Nimble regime | rest to cruise, Hitch (starter): 3.05 s<br>full 180 deg velocity reversal, Hitch (starter): 4.483333 s<br>turn radius at cruise, Hitch (starter): 8.861397 screen depths<br>rest to cruise, Wasp: 2.116667 s<br>full 180 deg velocity reversal, Wasp: 3.966667 s<br>turn radius at cruise, Wasp: 5.357837 screen depths | rest→cruise ≤ 1.5 s; 180° velocity reversal ≤ 3.0 s; turn radius at cruise ≤ 1 screen depth | no |

Notes — the full text behind the cells, never truncated:
- **B2 Nimble regime** — fed only by flight-reversal / flight-accel-brake — not in this evaluation input r = 1011.0711905401149 WU at cruise 194.99905395507812 WU/s; screen depth 114.0983960741242 WU read from the live chase camera r = 594.0637547719508 WU at cruise 209.9993438720703 WU/s; screen depth 110.87753595364437 WU read from the live chase camera

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

### verbs feel.screen_crossing seed 4242 (run 61a5a4b8)

Bars this run feeds (FEEL_CONTRACT §B — pooled verdict for the whole receipt):

| bar | value(s) | target | met |
|---|---|---|---|
| B3 The fight stays on screen | seconds to cross the visible depth at cruise, Hitch (starter): 0.585123 s<br>visible depth at 2x cruise, as a multiple of the at-cruise depth, Hitch (starter): 1.217963 x at-cruise depth<br>visible depth at 3x cruise, as a multiple of the at-cruise depth, Hitch (starter): 1.313559 x at-cruise depth<br>visible depth grows monotonically from cruise to 3x cruise, Hitch (starter): yes<br>smallest share of frame width the starter hull ever falls to, Hitch (starter): 10.508756 % of frame width | ≥ 1.2 s to cross the visible depth at cruise | no |

Notes — the full text behind the cells, never truncated:
- **B3 The fight stays on screen** — superseded by the real-path feel.screen_crossing run; the stroke-derived estimate is not applied. screen depth 114.0983960741242 WU read from the live chase camera at cruise 194.99905395507812 WU/s; camera speed reference maxSpeed=172.0727272727273 reached 389.99810791015625 WU/s by a physics impulse (target 2x cruise = 389.99810791015625); depth 138.9675801782694 WU vs 114.0983960741242 WU at cruise reached 584.9971923828125 WU/s by a physics impulse (target 3x cruise = 584.9971618652344); depth 149.8750117922818 WU 61 samples of the live camera depth between 194.99905395507812 and 584.9971923828125 WU/s; largest backward step 0 WU hull 28 WU (2 x collisionRadius) against frame width = visible depth x 1.7777777777777777 (the camera's own default aspect); worst case at 519.9975026448567 WU/s

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

### verbs world.reaction_trio seed 4242 (run 6deddeeb)

Bars this run feeds (FEEL_CONTRACT §B — pooled verdict for the whole receipt):

| bar | value(s) | target | met |
|---|---|---|---|
| B10 The world reacts | salvor arrives after the cargo spill (worst of 1 run(s)): 3.75 s<br>patrol decides stay-or-chase after a witnessed kill: 10 s<br>a live NPC reaches spilled cargo: 15 s<br>a civilian within 300 WU of gunfire changes course: 3 s | salvor arrives ≤ 30 s; patrol chooses within 10 s; civilians turn within 3 s | no |

Notes — the full text behind the cells, never truncated:
- **B10 The world reacts** — the patrol stay-with-wreck/chase clause and the civilian course-change clause are unbenched. NEVER — no responder ever held with the wreck while another pursued salvor 325 arrived NEVER — the civilian flew straight through the firefight

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
