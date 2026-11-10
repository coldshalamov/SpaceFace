# Fun measure — verbs — seed 4242 — 2026-09-05

Every FEEL_CONTRACT §B bar, evaluated once over the whole measurement set in this receipt (Fun Convergence Loop §3.2), then the per-run fun metrics. Values are player units. The fed-by column names the run each bar number comes from; each run section below lists only the bars that run feeds.

## Bars (FEEL_CONTRACT §B) — pooled over this receipt

| bar | value(s) | target | met | fed by |
|---|---|---|---|---|
| B1 Earned speed is kept | release speed kept 5 s after letting go, hands off (worst of 1 run(s)): 1.000059 fraction | ≥ 99 % of exit speed 10 s later, hands off and forward held | — | verbs/feel.rope_swing_release/s4242 |
| B2 Nimble regime | no feeding run in this measurement | rest→cruise ≤ 1.5 s; 180° velocity reversal ≤ 3.0 s; turn radius at cruise ≤ 1 screen depth | — | — |
| B3 The fight stays on screen | no feeding run in this measurement | ≥ 1.2 s to cross the visible depth at cruise | — | — |
| B4 Shove magnitude | no feeding run in this measurement | shove ΔV ≥ 30 % of light-hostile cruise per hit (starter gun ≥ 5 %) | — | — |
| B5 Shove displacement | no feeding run in this measurement | ≥ 1 screen depth off the original line 2 s after the hit | — | — |
| B6 Terrain is lethal | no feeding run in this measurement | dies at ≥ 75 % cruise closing; ≥ 60 % hull + helm lost at ≥ 50 %; heavy ≤ 15 % | — | — |
| B7 The rope is a rope | peak line stretch (worst of 1 run(s)): 0.050105 fraction<br>tangential speed kept 5 s after release (worst of 1 run(s)): 1.000059 fraction<br>peak stretch on a 100 WU line at 1.5x cruise: 0.050105 fraction<br>line held until commanded release: yes<br>tangential speed kept 5 s after release: 1.000059 fraction | stretch < 10 %; release keeps ≥ 95 % of tangential speed at 5 s | yes | verbs/feel.rope_swing_release/s4242 |
| B8 Draw-to-fly rips | no feeding run in this measurement | mean stroke speed ≥ 70 % of cruise; slowest point ≥ 35 % | — | — |
| B9 Impacts answer | not reachable by this bench | hitstop + trauma at ΔV ≥ 8 WU/s; audio ≥ 1 octave and ≥ 12 dB apart; release snaps | — | — |
| B10 The world reacts | no feeding run in this measurement | salvor arrives ≤ 30 s; patrol chooses within 10 s; civilians turn within 3 s | — | — |
| B11 Hitstun law is universal | no feeding run in this measurement | one universal curve; lights ≥ 30 % ΔV stunned ≥ 1 s; heavies at gun-scale ΔV never | — | — |
| B12 The 60-second proof | not reachable by this bench | ≥ 9 of 11 beats in a deterministic scenario plus a headed capture at the shipping camera | — | — |
| B13 The player is never knocked around | no feeding run in this measurement | ≤ 2 contact knocks per minute; largest ≤ 10 % of cruise; zero heading changes; no visible jitter | — | — |

Notes — the full text behind the cells, never truncated:
- **B1 Earned speed is kept** — only the 5 s release-retention clause (≥ 95 %) was measured; that sentence belongs to the rope-release scenario, and the value row is kept for the receipt. B1's own clauses — ≥ 99 % of exit speed 10 s later, hands off and with forward held — are kernel-level (<repo file> §12c) and are not benched headlessly, so this bar cannot read met from this bench.
- **B7 The rope is a rope** — authored 100 WU; peak line 105.011 WU before 136.33 WU/s; 5 s 136.33 WU/s
- **B9 Impacts answer** — hitstop, camera trauma and audio are presentation-layer; the headless bench has no instrument for them. the bar is listed here for completeness; this bench cannot measure it.
- **B12 The 60-second proof** — needs the PQ-141 60-second proof scenario, which does not exist yet. the bar is listed here for completeness; this bench cannot measure it.

### verbs feel.rope_swing_release seed 4242 (run 6a78d113)

Bars this run feeds (FEEL_CONTRACT §B — pooled verdict for the whole receipt):

| bar | value(s) | target | met |
|---|---|---|---|
| B1 Earned speed is kept | release speed kept 5 s after letting go, hands off (worst of 1 run(s)): 1.000059 fraction | ≥ 99 % of exit speed 10 s later, hands off and forward held | — |
| B7 The rope is a rope | peak line stretch (worst of 1 run(s)): 0.050105 fraction<br>tangential speed kept 5 s after release (worst of 1 run(s)): 1.000059 fraction<br>peak stretch on a 100 WU line at 1.5x cruise: 0.050105 fraction<br>line held until commanded release: yes<br>tangential speed kept 5 s after release: 1.000059 fraction | stretch < 10 %; release keeps ≥ 95 % of tangential speed at 5 s | yes |

Notes — the full text behind the cells, never truncated:
- **B1 Earned speed is kept** — only the 5 s release-retention clause (≥ 95 %) was measured; that sentence belongs to the rope-release scenario, and the value row is kept for the receipt. B1's own clauses — ≥ 99 % of exit speed 10 s later, hands off and with forward held — are kernel-level (<repo file> §12c) and are not benched headlessly, so this bar cannot read met from this bench.
- **B7 The rope is a rope** — authored 100 WU; peak line 105.011 WU before 136.33 WU/s; 5 s 136.33 WU/s

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
