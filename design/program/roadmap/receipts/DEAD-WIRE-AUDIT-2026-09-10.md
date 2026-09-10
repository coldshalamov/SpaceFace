<!-- LIFETIME: RECEIPT -->
# Dead-wire audit — 2026-09-10

Author: GLM 5.3 via opencode, read-only, packet `.devshots/camp0909/audit3.md`.
Commissioned because this repo's own law says *"three of the biggest gaps in this game were
missing listeners, not missing systems"* — and four more were confirmed in a single session.

**Method (the part that makes it trustworthy):** 840 literal event names are emitted across
`src/`; 505 are literally subscribed. The 284-name gap was then re-checked by full-text search so
that name-list subscriptions — the frozen arrays in `eventTrace`, `stuntGrammar`,
`ui/kit/temperature`, the table-driven `bus.on(spec.sourceEvent)` in `minimalActionAudio`, and the
career FSMs — could not hide a live consumer. A finding below claims "dead" only where the bare
event name appears nowhere outside its emit line, and each states the exact grep used.

FINDING 1 — The combat action lifecycle narrates every tether-attack phase, completion,
cancel and rejection on the bus, and authors cue IDs for all of it in data — nothing listens
to any of it. Enemy tether-raid attacks (dash/attach/reel/sling/cut/burst) hit their lock
and release moments in total silence.
CLASS      B + D
PRODUCER   src/combat/actions.js:157,271,285,307 — emits combat:actionPhase (with authored
           cueId), combat:actionCompleted, combat:actionCancelled (with reason),
           combat:actionRejected (with reason); authored cue table at
           src/data/combatDefs.js:47-51,90-155 (combat.action.dash.active, reel.tick,
           sling.release, cut.snap, burst.fire, per-action end/cancel/reject cues)
CONSUMER   none — grepped `rg -n "'combat:action(Phase|Completed|Cancelled|Rejected)'" src/`
           (only the emit sites) and `rg -n "combat\.action\." src/` (only combatDefs.js and
           the trace rows in actions.js). presentationOrchestrator subscribes ONLY
           combat:actionStarted (src/systems/presentationOrchestrator.js:155, and just for one
           raider doctrine). No audio recipe references any combat.action.* cue.
COST       When a raider dashes in, locks a tether on you, and rips — or when your own action
           request is rejected — the beat the designers scored never plays and you never learn
           why an action failed.
FIX        Subscribe presentationOrchestrator (or the audio cue path) to the four lifecycle
           events and play/map the authored cueId strings; author the ~6 missing recipes.
SIZE       medium



FINDING 2 — The automation system computes a full offline-earnings receipt (income, upkeep,
repossession, trade pressure, cap hit) and stores it in state on every load — no UI ever
shows it, and the distress/repossession alerts it emits while you're away have no listener.
CLASS      B
PRODUCER   src/systems/automation.js:2271,2295,2319,2342,2553 — emits automation:offlineSummary
           (rich receipt) and stores meta.lastOfflineReceipt; also :1763 assetDistressed and
           :1788 assetRepossessed
CONSUMER   none — grepped `rg -n "'automation:(offlineSummary|assetDistressed|assetRepossessed|incomeCredited)'" src/`
           (only automation.js emit sites) and `rg -n "lastOfflineReceipt" src/ui/` (zero hits).
           automationPanel.js shows only the live rate bar; credits move via credits:changed
           with no explanation.
COST       You come back after days away: credits changed, an asset may be gone — the game
           never tells you what accrued, what upkeep cost, or what was repossessed. The
           passive-income fantasy's payoff moment doesn't exist.
FIX        On save:loaded, if meta.lastOfflineReceipt exists and is non-skipped, show a one-time
           summary card (station screen or toast chain); wire assetDistressed/Repossessed to a toast.
SIZE       small



FINDING 3 — The whole rich-seam lifecycle (a seam you discovered being opened, worked, or
lost to NPC miners, and help reservations against it) is emitted with full detail and heard
by nobody.
CLASS      B
PRODUCER   src/systems/fieldDepletion.js:457 (richSeamMissed), src/systems/traffic.js:7341
           (richSeamWorked), :7682 (richSeamOpened), :8517/:1527 (missed with owner_lost /
           owner_invalidated reasons), :7217 (traffic:richSeamHelpReserved), src/systems/mining.js:750
CONSUMER   none — grepped `rg -n "'field:richSeam(Opened|Worked|Missed)'|'traffic:richSeamHelpReserved'" src/`
           (only emit sites). The comms-radial HELP action exists (src/data/contactHail.js:182+)
           but only when you happen to hail the worker; nothing pushes at you.
COST       A seam you found gets claimed, worked out, or invalidated by NPC miners and you are
           never told — you fly back to a stripped rock.
FIX        Subscribe a bark/toast for richSeamOpened/Missed when the player is the discoverer
           (payload already carries the reason strings).
SIZE       small



FINDING 4 — Killing a boss reshapes the sector's hazard zones and announces each change on
the bus with reason and zone detail — no subscriber. Hazard zone enter/exit ARE consumed,
so the zone language channel exists and simply was never given this event.
CLASS      B
PRODUCER   src/systems/world.js:528 — emits hazard:changed { sectorId, poiId, reason:
           'boss_defeated', ...change } per hazard-zone mutation in the boss aftermath
CONSUMER   none — grepped `rg -n "'hazard:changed'" src/` (only world.js:528). Contrast:
           hazard:enter/hazard:exit are subscribed at src/data/hazardLanguage.js:129-130.
COST       After a boss dies the sector gets safer or nastier and the game says nothing —
           you relearn it by flying into it.
FIX        Route hazard:changed through hazardLanguage's presenter like enter/exit.
SIZE       small



FINDING 5 — Volatile cargo corrodes hulls on contact, and the system emits a precise
attribution event (cargo class, pod, target, hull tick) — nothing consumes it, so the
damage arrives via the generic damage channel with its cause stripped.
CLASS      B
PRODUCER   src/systems/lootShards.js:649 — emits cargo:volatileCorrosive { class, podId,
           targetId, hullTick } after each corrosive tick (routed as shield-bypassing thermal
           damage with origin kind 'volatile_corrosive' at :292-312)
CONSUMER   none — grepped `rg -n "'cargo:volatileCorrosive'" src/` (only lootShards.js:649).
           The damage itself surfaces as generic combat damage; the volatile attribution never does.
COST       Your hull quietly erodes near floating volatile cargo and the game never names the
           cause — you can't learn to keep distance from that cargo class.
FIX        Subscribe a HUD warning/audio hiss on cargo:volatileCorrosive (payload already
           carries class and tick).
SIZE       small



FINDING 6 — The canonical inertial-shunt orchestrator in the combat library is dead code:
the live wiring in the weapons system is a hand-copied superset. Today's wrong-velocity
           defect lived on exactly this seam; two divergent implementations guarantee the
           next fix lands in the wrong one.
CLASS      A
PRODUCER   src/combat/inertialShunt.js:117 — tryApplyInertialShuntFromImpact (pair selection,
           cooldown, impulse fill/queue, delta-V receipt)
CONSUMER   none — grepped `rg -n "tryApplyInertialShuntFromImpact" .` repo-wide (definition
           only). The live path is a parallel implementation, applyInertialShuntFromImpact at
           src/systems/weapons.js:1973 (adds torque, provenance, hitstun, vfxCue), wired at
           weapons.js:217.
COST       None today — the live twin is richer — but the module that tests and docs point at
           is not the one that runs, so the next shunt fix has a 50% chance of being made in
           dead code.
FIX        Delete the combat/ orchestrator or reduce it to a thin re-export of the weapons one;
           repoint its tests.
SIZE       small



FINDING 7 — Station-contact records and relationship counters publish every change with the
full record; the bar screen renders contacts from state and no listener exists, so standing
shifts never produce a feedback moment or a live refresh.
CLASS      B (medium confidence — the bar screen may re-render on navigation often enough to
           mask it)
PRODUCER   src/systems/stationContacts.js:261,297,352,376 — stationContact:changed (full
           record); :221,393 — stationContact:counterChanged (counter values)
CONSUMER   none — grepped `rg -n "'stationContact:changed'|'stationContact:counterChanged'" src/`
           (only the emit sites in stationContacts.js). Contact UI lives in
           src/ui/station/bar.js / barContacts.js and reads state directly.
COST       Helping a contact moves invisible counters; nothing marks the moment a contact's
           standing genuinely shifts, and an open contact screen can show stale standing.
FIX        Subscribe the bar screen to both events for re-render, and toast on meaningful
           counter-tier transitions.
SIZE       small



FINDING 8 — The mine system is registered and live, and announces armed / triggered /
cap-reached / released plus the weapons-side armed/deployed/expired beats — zero
subscribers, so laying mines has no confirmation and hitting the owner cap is silent.
CLASS      B
PRODUCER   src/systems/mines.js:134 (armed), :192 (triggered), :53 (capReached), :227
           (released); src/systems/weapons.js:1124 (mineDeployed), :1159 (mineArmed), :1153
           (mineExpired). System is registered: src/core/registry.js:379.
CONSUMER   none — grepped `rg -n "'mines:(armed|triggered|capReached|released)'|'weapons:mine(Armed|Deployed|Expired)'" src/`
           (only emit sites). Detonation damage feedback exists via the normal damage path;
           the deploy/confirm/cap beats do not exist anywhere.
COST       You drop a mine and get no cue that it armed or that you've hit the cap — your
           next "deployment" silently does nothing.
FIX        Small audio/HUD cue on mines:armed and an explicit denial line on capReached.
SIZE       small


---

**The single highest-value wire: Finding 1, the combat action lifecycle.** It beats the others on every axis that matters here: it is the largest authored-and-dark surface (six actions × five authored cue points in `combatDefs.js`, four lifecycle events carrying phase, reason, and cueId), it sits on the default hostile route — every tether-control raider attack runs through this catalog — and its fix is a pure subscriber with zero simulation changes, so no determinism, save, or single-writer risk at all. Finding 2 (the offline receipt) is the best *player-delight-per-line* runner-up and I'd take it as the very next card: it is one screen reading state that already exists. But the action-lifecycle gap is combat feel — the core loop — and it is exactly the defect class you named: everything exists, everything is correct, and on the live route none of it ever runs.

Method note for confidence: 840 literal event names were emitted and 505 literally subscribed; the 284-name gap was then checked by full-text search so name-list subscriptions (frozen literal arrays in `eventTrace`, `stuntGrammar`, `temperature`, `minimalActionAudio`, career FSMs) and spec tables could not hide a consumer. Findings above only claim dead where the bare event name appears nowhere outside emit lines. Verification scratch lives in `.devshots/camp0909/scratch/`; nothing outside `.devshots/camp0909/scratch/` was written.
EXIT=0
