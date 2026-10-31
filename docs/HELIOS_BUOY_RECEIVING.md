# Helios: truthful buoy receiving aftermath

After any of the three exact authored Pelican buoy tickets settles successfully,
its canonical receipt carries narrowly qualified physical-delivery provenance for
that step and completion method. The existing station side-event director can
answer each return with the same short repair-drone crawler/gantry visual. The
first scene retains its original event ID; later returns use their own receipt IDs.
No extra entity or reward is created, and this does not claim the whole lane has
been repaired.

The scene is a station-hull work visual, not the buoy being physically unloaded or
transformed at the berth. Its `contextLabel` is payload metadata with no visible
UI consumer; no new dialogue or announcement is implied. Physical custody,
delivery success and payout remain exclusively with the existing mission owners.

The projection requires a paid, current, successful matching step-1/2/3 receipt,
the live Helios station and that receipt's original 180-second simulation-time
window. The reader selects the newest valid `at_s` among the bounded ten recent
receipts, with a stable mission-ID tie-break. Docking, tutorial, visibility and
normal pacing gates remain. Failed/legacy/foreign receipts and Survival mode
cannot manufacture the scene. A bounded transient session list prevents a shown
mission from replaying when receipt order changes or a newer receipt becomes
invalid; a newer pending settlement supersedes an older queued one. Sector exit
can retry unseen work. Continue resets this transient list and may project only
the remaining original window; this adds no durable progression or payout.

## Integration repair

A queued-but-unseen scene previously consumed its session identity before firing.
Sector exit cleared the queue, permanently losing the still-valid aftermath.
The current candidate deduplicates pending entries and records presentation only
after the existing seam fires. A new regression demonstrated the failure before
the fix and passes afterward: leaving before presentation allows one retry;
leaving after presentation does not multiply the operation.

Owners: `src/missions/starterBuoyAftermath.js`, mission receipt construction and
`src/systems/stationSideEventDirector.js`. Existing VFX and infrastructure motion
consumers remain unchanged.

## Current-source verification (2026-10-31)

Candidate reconciled against `coldshalamov/SpaceFace` commit
`31a011002036e625c971d315f8da08a7a32687ee`. Existing files received the original
historical delta by three-way reconciliation, not replacement with archived files.
Newer mission acceptance, navigation identity and bar contact changes are retained.
Worker/registry, rescue collider, training-rock and asset owners are unchanged.
`index.html` retains current hints and adds only the newly required eager `verbSpeech.js` hint; historical preload lists are not restored.

The focused buoy-aftermath suite now passes 18/18 against current dependencies,
including all three qualifying settlements, recency/tie selection, supersession,
receipt invalidation/expiry, existing event-packet fields, crawler frames and the
named station gantry. Together with the actual three-step buoy-route, Adventure /
Swarm boundary and native worker-wire suites, the focused bundle passes 44/44.
These are not a full registry boot, physical input-driven return, berth unloading,
or rendered browser playthrough.
No visual/readability, performance, full Save/Continue route or deployment claim
follows from these tests. Run the normal dock → Bar → Kessler → Accept + Track →
physical work → settlement route in a fully built game before visual acceptance.
No new asset, reward writer, control owner or persistent progression key is added.
