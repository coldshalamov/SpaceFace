# Fun measure — crucible — seed 4242 — 2026-09-05

Every FEEL_CONTRACT §B bar, evaluated once over the whole measurement set in this receipt (Fun Convergence Loop §3.2), then the per-run fun metrics. Values are player units. The fed-by column names the run each bar number comes from; each run section below lists only the bars that run feeds.

## Bars (FEEL_CONTRACT §B) — pooled over this receipt

| bar | value(s) | target | met | fed by |
|---|---|---|---|---|
| B1 Earned speed is kept | no feeding run in this measurement | ≥ 99 % of exit speed 10 s later, hands off and forward held | — | — |
| B2 Nimble regime | no feeding run in this measurement | rest→cruise ≤ 1.5 s; 180° velocity reversal ≤ 3.0 s; turn radius at cruise ≤ 1 screen depth | — | — |
| B3 The fight stays on screen | no feeding run in this measurement | ≥ 1.2 s to cross the visible depth at cruise | — | — |
| B4 Shove magnitude | no feeding run in this measurement | shove ΔV ≥ 30 % of light-hostile cruise per hit (starter gun ≥ 5 %) | — | — |
| B5 Shove displacement | no feeding run in this measurement | ≥ 1 screen depth off the original line 2 s after the hit | — | — |
| B6 Terrain is lethal | no feeding run in this measurement | dies at ≥ 75 % cruise closing; ≥ 60 % hull + helm lost at ≥ 50 %; heavy ≤ 15 % | — | — |
| B7 The rope is a rope | no feeding run in this measurement | stretch < 10 %; release keeps ≥ 95 % of tangential speed at 5 s | — | — |
| B8 Draw-to-fly rips | no feeding run in this measurement | mean stroke speed ≥ 70 % of cruise; slowest point ≥ 35 % | — | — |
| B9 Impacts answer | not reachable by this bench | hitstop + trauma at ΔV ≥ 8 WU/s; audio ≥ 1 octave and ≥ 12 dB apart; release snaps | — | — |
| B10 The world reacts | no feeding run in this measurement | salvor arrives ≤ 30 s; patrol chooses within 10 s; civilians turn within 3 s | — | — |
| B11 Hitstun law is universal | no feeding run in this measurement | one universal curve; lights ≥ 30 % ΔV stunned ≥ 1 s; heavies at gun-scale ΔV never | — | — |
| B12 The 60-second proof | not reachable by this bench | ≥ 9 of 11 beats in a deterministic scenario plus a headed capture at the shipping camera | — | — |
| B13 The player is never knocked around | contact knocks per minute on the player, crucible (worst of 9 run(s)): 73.333333 events/min<br>largest single knock, fraction of cruise, crucible (worst of 9 run(s)): 0.080896 fraction<br>knock events that changed the player's heading, crucible (worst of 9 run(s)): 96 events | ≤ 2 contact knocks per minute; largest ≤ 10 % of cruise; zero heading changes; no visible jitter | no | crucible/helios_core/energy_baseline/s4242<br>crucible/helios_core/physics_toolkit/s4242<br>crucible/helios_core/massline_rig/s4242<br>crucible/lagrange_crucible/energy_baseline/s4242<br>crucible/lagrange_crucible/physics_toolkit/s4242<br>crucible/lagrange_crucible/massline_rig/s4242<br>crucible/cinder_sluice/energy_baseline/s4242<br>crucible/cinder_sluice/physics_toolkit/s4242<br>crucible/cinder_sluice/massline_rig/s4242 |

Notes — the full text behind the cells, never truncated:
- **B9 Impacts answer** — hitstop, camera trauma and audio are presentation-layer; the headless bench has no instrument for them. the bar is listed here for completeness; this bench cannot measure it.
- **B12 The 60-second proof** — needs the PQ-141 60-second proof scenario, which does not exist yet. the bar is listed here for completeness; this bench cannot measure it.
- **B13 The player is never knocked around** — visible jitter is unmeasured on this headless Crucible path; a full B13 pass is impossible. crucible knock counts come from short wave runs (~25 s of flight), not the contract's ten minutes of ordinary flight. the visible-jitter clause and the legible-deliberate-event clause are unbenched unless a headed capture sets jitterMeasured.

### crucible helios_core/energy_baseline seed 4242 (run e95bb2f5)

Bars this run feeds (FEEL_CONTRACT §B — pooled verdict for the whole receipt):

| bar | value(s) | target | met |
|---|---|---|---|
| B13 The player is never knocked around | contact knocks per minute on the player, crucible (worst of 9 run(s)): 73.333333 events/min<br>largest single knock, fraction of cruise, crucible (worst of 9 run(s)): 0.080896 fraction<br>knock events that changed the player's heading, crucible (worst of 9 run(s)): 96 events | ≤ 2 contact knocks per minute; largest ≤ 10 % of cruise; zero heading changes; no visible jitter | no |

Notes — the full text behind the cells, never truncated:
- **B13 The player is never knocked around** — visible jitter is unmeasured on this headless Crucible path; a full B13 pass is impossible. crucible knock counts come from short wave runs (~25 s of flight), not the contract's ten minutes of ordinary flight. the visible-jitter clause and the legible-deliberate-event clause are unbenched unless a headed capture sets jitterMeasured.

Fun metrics (law §3.2):
| metric | value | fun threshold | verdict |
|---|---|---|---|
| verbs per minute (distinct) | 1.903755 | >= 4 per minute | thin |
| consequences per player action | 1.922414 | >= 2 within 3 s | thin |
| time to first consequence | 1 s | <= 0.3 s | slow |
| moments per minute | 298.731501 | >= 1 per minute | alive |
| nothing-happened seconds | 0 s | none | clean |
| knock budget on the player | 0/min, max 0% of cruise, 0 heading changes | <= 2/min and <= 10% of cruise, never a heading change | not measured |
| deaths by cause | collision 10, weapon 3, brake 1, player 1 | informational | recorded |

Gaps: knockBudget: visible jitter is unmeasured (headless); full B13 cannot pass

### crucible helios_core/physics_toolkit seed 4242 (run a26a2916)

Bars this run feeds (FEEL_CONTRACT §B — pooled verdict for the whole receipt):

| bar | value(s) | target | met |
|---|---|---|---|
| B13 The player is never knocked around | contact knocks per minute on the player, crucible (worst of 9 run(s)): 73.333333 events/min<br>largest single knock, fraction of cruise, crucible (worst of 9 run(s)): 0.080896 fraction<br>knock events that changed the player's heading, crucible (worst of 9 run(s)): 96 events | ≤ 2 contact knocks per minute; largest ≤ 10 % of cruise; zero heading changes; no visible jitter | no |

Notes — the full text behind the cells, never truncated:
- **B13 The player is never knocked around** — visible jitter is unmeasured on this headless Crucible path; a full B13 pass is impossible. crucible knock counts come from short wave runs (~25 s of flight), not the contract's ten minutes of ordinary flight. the visible-jitter clause and the legible-deliberate-event clause are unbenched unless a headed capture sets jitterMeasured.

Fun metrics (law §3.2):
| metric | value | fun threshold | verdict |
|---|---|---|---|
| verbs per minute (distinct) | 2.666667 | >= 4 per minute | thin |
| consequences per player action | 7.2 | >= 2 within 3 s | fun |
| time to first consequence | 4.133333 s | <= 0.3 s | slow |
| moments per minute | 564.836795 | >= 1 per minute | alive |
| nothing-happened seconds | 0 s | none | clean |
| knock budget on the player | 0.666667/min, max 5.054076% of cruise, 1 heading change | <= 2/min and <= 10% of cruise, never a heading change | over budget |
| deaths by cause | collision 12, weapon 12, shove 2 | informational | recorded |

Gaps: none — every law metric was measurable for this run.

### crucible helios_core/massline_rig seed 4242 (run bd660786)

Bars this run feeds (FEEL_CONTRACT §B — pooled verdict for the whole receipt):

| bar | value(s) | target | met |
|---|---|---|---|
| B13 The player is never knocked around | contact knocks per minute on the player, crucible (worst of 9 run(s)): 73.333333 events/min<br>largest single knock, fraction of cruise, crucible (worst of 9 run(s)): 0.080896 fraction<br>knock events that changed the player's heading, crucible (worst of 9 run(s)): 96 events | ≤ 2 contact knocks per minute; largest ≤ 10 % of cruise; zero heading changes; no visible jitter | no |

Notes — the full text behind the cells, never truncated:
- **B13 The player is never knocked around** — visible jitter is unmeasured on this headless Crucible path; a full B13 pass is impossible. crucible knock counts come from short wave runs (~25 s of flight), not the contract's ten minutes of ordinary flight. the visible-jitter clause and the legible-deliberate-event clause are unbenched unless a headed capture sets jitterMeasured.

Fun metrics (law §3.2):
| metric | value | fun threshold | verdict |
|---|---|---|---|
| verbs per minute (distinct) | 2.666667 | >= 4 per minute | thin |
| consequences per player action | 24.351064 | >= 2 within 3 s | fun |
| time to first consequence | 0.683333 s | <= 0.3 s | slow |
| moments per minute | 616 | >= 1 per minute | alive |
| nothing-happened seconds | 0 s | none | clean |
| knock budget on the player | 14/min, max 6.732995% of cruise, 20 heading changes | <= 2/min and <= 10% of cruise, never a heading change | over budget |
| deaths by cause | weapon 14, brake 1, collision 12 | informational | recorded |

Gaps: knockBudget: visible jitter is unmeasured (headless); full B13 cannot pass

### crucible lagrange_crucible/energy_baseline seed 4242 (run f2a2913d)

Bars this run feeds (FEEL_CONTRACT §B — pooled verdict for the whole receipt):

| bar | value(s) | target | met |
|---|---|---|---|
| B13 The player is never knocked around | contact knocks per minute on the player, crucible (worst of 9 run(s)): 73.333333 events/min<br>largest single knock, fraction of cruise, crucible (worst of 9 run(s)): 0.080896 fraction<br>knock events that changed the player's heading, crucible (worst of 9 run(s)): 96 events | ≤ 2 contact knocks per minute; largest ≤ 10 % of cruise; zero heading changes; no visible jitter | no |

Notes — the full text behind the cells, never truncated:
- **B13 The player is never knocked around** — visible jitter is unmeasured on this headless Crucible path; a full B13 pass is impossible. crucible knock counts come from short wave runs (~25 s of flight), not the contract's ten minutes of ordinary flight. the visible-jitter clause and the legible-deliberate-event clause are unbenched unless a headed capture sets jitterMeasured.

Fun metrics (law §3.2):
| metric | value | fun threshold | verdict |
|---|---|---|---|
| verbs per minute (distinct) | 1.333333 | >= 4 per minute | thin |
| consequences per player action | 3.482456 | >= 2 within 3 s | fun |
| time to first consequence | 2.4 s | <= 0.3 s | slow |
| moments per minute | 183.503244 | >= 1 per minute | alive |
| nothing-happened seconds | 0 s | none | clean |
| knock budget on the player | 4.666667/min, max 8.08964% of cruise, 6 heading changes | <= 2/min and <= 10% of cruise, never a heading change | over budget |
| deaths by cause | weapon 12, collision 3 | informational | recorded |

Gaps: knockBudget: visible jitter is unmeasured (headless); full B13 cannot pass

### crucible lagrange_crucible/physics_toolkit seed 4242 (run 648e2800)

Bars this run feeds (FEEL_CONTRACT §B — pooled verdict for the whole receipt):

| bar | value(s) | target | met |
|---|---|---|---|
| B13 The player is never knocked around | contact knocks per minute on the player, crucible (worst of 9 run(s)): 73.333333 events/min<br>largest single knock, fraction of cruise, crucible (worst of 9 run(s)): 0.080896 fraction<br>knock events that changed the player's heading, crucible (worst of 9 run(s)): 96 events | ≤ 2 contact knocks per minute; largest ≤ 10 % of cruise; zero heading changes; no visible jitter | no |

Notes — the full text behind the cells, never truncated:
- **B13 The player is never knocked around** — visible jitter is unmeasured on this headless Crucible path; a full B13 pass is impossible. crucible knock counts come from short wave runs (~25 s of flight), not the contract's ten minutes of ordinary flight. the visible-jitter clause and the legible-deliberate-event clause are unbenched unless a headed capture sets jitterMeasured.

Fun metrics (law §3.2):
| metric | value | fun threshold | verdict |
|---|---|---|---|
| verbs per minute (distinct) | 2.666667 | >= 4 per minute | thin |
| consequences per player action | 3.637795 | >= 2 within 3 s | fun |
| time to first consequence | 5.2 s | <= 0.3 s | slow |
| moments per minute | 214.785992 | >= 1 per minute | alive |
| nothing-happened seconds | 0 s | none | clean |
| knock budget on the player | 2.666667/min, max 5.054076% of cruise, 3 heading changes | <= 2/min and <= 10% of cruise, never a heading change | over budget |
| deaths by cause | weapon 15, collision 1 | informational | recorded |

Gaps: knockBudget: visible jitter is unmeasured (headless); full B13 cannot pass

### crucible lagrange_crucible/massline_rig seed 4242 (run 3bd3b19f)

Bars this run feeds (FEEL_CONTRACT §B — pooled verdict for the whole receipt):

| bar | value(s) | target | met |
|---|---|---|---|
| B13 The player is never knocked around | contact knocks per minute on the player, crucible (worst of 9 run(s)): 73.333333 events/min<br>largest single knock, fraction of cruise, crucible (worst of 9 run(s)): 0.080896 fraction<br>knock events that changed the player's heading, crucible (worst of 9 run(s)): 96 events | ≤ 2 contact knocks per minute; largest ≤ 10 % of cruise; zero heading changes; no visible jitter | no |

Notes — the full text behind the cells, never truncated:
- **B13 The player is never knocked around** — visible jitter is unmeasured on this headless Crucible path; a full B13 pass is impossible. crucible knock counts come from short wave runs (~25 s of flight), not the contract's ten minutes of ordinary flight. the visible-jitter clause and the legible-deliberate-event clause are unbenched unless a headed capture sets jitterMeasured.

Fun metrics (law §3.2):
| metric | value | fun threshold | verdict |
|---|---|---|---|
| verbs per minute (distinct) | 3.333333 | >= 4 per minute | thin |
| consequences per player action | 14.333333 | >= 2 within 3 s | fun |
| time to first consequence | 1.1 s | <= 0.3 s | slow |
| moments per minute | 227.516779 | >= 1 per minute | alive |
| nothing-happened seconds | 0 s | none | clean |
| knock budget on the player | 36.666667/min, max 6.732995% of cruise, 38 heading changes | <= 2/min and <= 10% of cruise, never a heading change | over budget |
| deaths by cause | collision 1, brake 1, weapon 4 | informational | recorded |

Gaps: knockBudget: visible jitter is unmeasured (headless); full B13 cannot pass

### crucible cinder_sluice/energy_baseline seed 4242 (run d41f052f)

Bars this run feeds (FEEL_CONTRACT §B — pooled verdict for the whole receipt):

| bar | value(s) | target | met |
|---|---|---|---|
| B13 The player is never knocked around | contact knocks per minute on the player, crucible (worst of 9 run(s)): 73.333333 events/min<br>largest single knock, fraction of cruise, crucible (worst of 9 run(s)): 0.080896 fraction<br>knock events that changed the player's heading, crucible (worst of 9 run(s)): 96 events | ≤ 2 contact knocks per minute; largest ≤ 10 % of cruise; zero heading changes; no visible jitter | no |

Notes — the full text behind the cells, never truncated:
- **B13 The player is never knocked around** — visible jitter is unmeasured on this headless Crucible path; a full B13 pass is impossible. crucible knock counts come from short wave runs (~25 s of flight), not the contract's ten minutes of ordinary flight. the visible-jitter clause and the legible-deliberate-event clause are unbenched unless a headed capture sets jitterMeasured.

Fun metrics (law §3.2):
| metric | value | fun threshold | verdict |
|---|---|---|---|
| verbs per minute (distinct) | 1.333333 | >= 4 per minute | thin |
| consequences per player action | 1.511494 | >= 2 within 3 s | thin |
| time to first consequence | 2.033333 s | <= 0.3 s | slow |
| moments per minute | 320.963855 | >= 1 per minute | alive |
| nothing-happened seconds | 0 s | none | clean |
| knock budget on the player | 0.666667/min, max 1.861862% of cruise, 1 heading change | <= 2/min and <= 10% of cruise, never a heading change | over budget |
| deaths by cause | collision 5, weapon 11 | informational | recorded |

Gaps: knockBudget: visible jitter is unmeasured (headless); full B13 cannot pass

### crucible cinder_sluice/physics_toolkit seed 4242 (run 7f864087)

Bars this run feeds (FEEL_CONTRACT §B — pooled verdict for the whole receipt):

| bar | value(s) | target | met |
|---|---|---|---|
| B13 The player is never knocked around | contact knocks per minute on the player, crucible (worst of 9 run(s)): 73.333333 events/min<br>largest single knock, fraction of cruise, crucible (worst of 9 run(s)): 0.080896 fraction<br>knock events that changed the player's heading, crucible (worst of 9 run(s)): 96 events | ≤ 2 contact knocks per minute; largest ≤ 10 % of cruise; zero heading changes; no visible jitter | no |

Notes — the full text behind the cells, never truncated:
- **B13 The player is never knocked around** — visible jitter is unmeasured on this headless Crucible path; a full B13 pass is impossible. crucible knock counts come from short wave runs (~25 s of flight), not the contract's ten minutes of ordinary flight. the visible-jitter clause and the legible-deliberate-event clause are unbenched unless a headed capture sets jitterMeasured.

Fun metrics (law §3.2):
| metric | value | fun threshold | verdict |
|---|---|---|---|
| verbs per minute (distinct) | 3.333333 | >= 4 per minute | thin |
| consequences per player action | 4.830357 | >= 2 within 3 s | fun |
| time to first consequence | 1.566667 s | <= 0.3 s | slow |
| moments per minute | 300.334448 | >= 1 per minute | alive |
| nothing-happened seconds | 0 s | none | clean |
| knock budget on the player | 2/min, max 5.054076% of cruise, 0 heading changes | <= 2/min and <= 10% of cruise, never a heading change | not measured |
| deaths by cause | weapon 10, collision 4 | informational | recorded |

Gaps: knockBudget: visible jitter is unmeasured (headless); full B13 cannot pass

### crucible cinder_sluice/massline_rig seed 4242 (run 5adfc385)

Bars this run feeds (FEEL_CONTRACT §B — pooled verdict for the whole receipt):

| bar | value(s) | target | met |
|---|---|---|---|
| B13 The player is never knocked around | contact knocks per minute on the player, crucible (worst of 9 run(s)): 73.333333 events/min<br>largest single knock, fraction of cruise, crucible (worst of 9 run(s)): 0.080896 fraction<br>knock events that changed the player's heading, crucible (worst of 9 run(s)): 96 events | ≤ 2 contact knocks per minute; largest ≤ 10 % of cruise; zero heading changes; no visible jitter | no |

Notes — the full text behind the cells, never truncated:
- **B13 The player is never knocked around** — visible jitter is unmeasured on this headless Crucible path; a full B13 pass is impossible. crucible knock counts come from short wave runs (~25 s of flight), not the contract's ten minutes of ordinary flight. the visible-jitter clause and the legible-deliberate-event clause are unbenched unless a headed capture sets jitterMeasured.

Fun metrics (law §3.2):
| metric | value | fun threshold | verdict |
|---|---|---|---|
| verbs per minute (distinct) | 3.333333 | >= 4 per minute | thin |
| consequences per player action | 26.916667 | >= 2 within 3 s | fun |
| time to first consequence | 0.966667 s | <= 0.3 s | slow |
| moments per minute | 438.616071 | >= 1 per minute | alive |
| nothing-happened seconds | 0 s | none | clean |
| knock budget on the player | 73.333333/min, max 6.732995% of cruise, 96 heading changes | <= 2/min and <= 10% of cruise, never a heading change | over budget |
| deaths by cause | collision 4, weapon 8 | informational | recorded |

Gaps: knockBudget: visible jitter is unmeasured (headless); full B13 cannot pass
