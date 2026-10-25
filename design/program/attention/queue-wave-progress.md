# Landed-review wave — progress log

One line per completed row, appended by the reviewing agent.
- R-acc83ab VERIFIED — bridge admits only staged wing (id+flag+player+active+!forceFlee, exits denied upstream at :137); squadId lane hold + onboarding_wing_ward + strayKills<=2; wingDone serializes via railRecord and blocks every respawn; x02-raid-wing 11/11 green
- R-667ff0b VERIFIED — coil scale reads live state.run ledger per call (no module copy); _overdrive clears via _break('run_over')/run:ended; liveSwarmRun rejects non-swarm/missing runs -> x1; _purchased re-minted per _openDraft enforces one-per-armory; 4/4 green
- R-96b52be MISS-CONFIRMED-AT-COMMIT / repair in-flight — from.nx*24 approach point did park the hull at the gate (distance*1.6 brake clamp); uncommitted foreign fix in src/ai/racingDriver.js now aims through the apex (releaseAheadWU onto outgoing leg); anchored >=0.8s holds helios_belt+tethys_tally, Veil still red -> tracked by R-2be2a71; test file carries half-finished foreign hunks (f.tickOnce crash) left untouched
