# 06 — Make Asteroid Works part of the same game
## Excavation as industrial authorship, not a detached mining screen

The rover contains one of SpaceFace's strongest potential differentiators. The design law makes excavation a choice between immediate yield and productive geometry: machines consume exposed faces, geology determines capabilities, tunnels become logistics routes, and intact rock participates in thermal behavior. That is a coherent spatial game. It is more interesting than holding a drill against progressively tougher tiles. [ROVERLAW]

The current implementation also contains meaningful recovery work: deterministic geological formations, separate random streams, a tap/hold cadence, a visible pre-paid bore bite, persistence records, production/logistics modules, and a remap-aware input adapter. Do not spend another task fixing the old 0.06-second movement constant or assume the whole minigame must be rebuilt from a blank canvas. [DRILL] [DRILLUI] [SITES]

## 6.1 The correct relationship between flight and the mine

Flight should answer **where, why, and what to do with the result**. The mine should answer **how to shape this particular resource into a useful operation**. Neither mode should be an arbitrary toll on the other.

A player who enjoys combat should be able to obtain necessary resources through viable alternatives. A player who enjoys industrial design should gain a distinctive advantage from a thoughtful site rather than being forced back into repetitive manual mining to sustain an allowance. The factory's output should become cargo, a fulfilled local need, a fabrication input, or a ship capability through the ordinary world economy.

Entering the mine must preserve context: the asteroid's identity, location, ownership, relevant cargo, and any meaningful exposure outside. Choose the time policy explicitly. If the flight world pauses or becomes abstract while the mine is open, teach that honestly. If it continues, threats need adequate warning and a usable exit path. This audit did not trace every live pause/remote-control path, so the report does not declare the current time policy broken.

The important integration event is not “rover session ended.” It is “this work created a persistent operation and an understandable consequence outside.” The existing site system and live/virtual job pattern provide the owners to connect. [SITES] [JOBS]

## 6.2 Preserve the four-law strategy, reduce auxiliary taxes

The four-law design should drive map generation and progression. An early seam should make the player decide which face to expose. A gas pocket should be a visible opportunity with a distinct handling constraint, not a surprise punishment hidden under a generic cell. Ice and structural rock should matter to a legible process. A tunnel should serve movement and future routing. [ROVERLAW]

Avoid stacking energy depletion, heat depletion, hidden geology, cargo limits, movement delay, upgrade tiers, survey gates, and periodic losses before the player understands the first spatial choice. Each constraint needs a distinct decision. Two bars that both merely require waiting are probably one bar too many.

The current drill has energy/heat recovery and a carefully structured move cadence. Keep those mechanisms only to the extent they create a worthwhile rhythm or choice. A heavy machine can feel precise and immediate: input acknowledgement should occur immediately even if drilling takes time. “Heavy” is not a justification for swallowing taps or delaying every visual response. [DRILL] [DRILLUI]

The existing bore bite pre-pays subsequent work rather than granting free extra yield on every key press. Preserve that anti-mashing property. A new input adapter that calls the drilling method repeatedly on browser auto-repeat could accidentally reintroduce an exploit the current code deliberately prevents. [DRILL]

## 6.3 Map design: distinct problems, not simply larger boards

Start with a compact geological arrangement that contains a clear sacrifice: cutting through a valuable face yields immediate cargo but weakens a future machine placement; routing around it costs time and space but preserves output. Nearby supporting materials should let the player understand one production relationship without inspecting a sprawling recipe graph.

A second arrangement can change the geometry rather than the numbers: a seam with several exposed edges but poor access, a valuable pocket behind an awkward corridor, or a productive site whose best export route crosses a competing use of space. Later maps can combine known relationships. Bigger fields and higher hardness are not sufficient progression.

Do not randomize away the ability to build a satisfying site. A generator should guarantee an entry, at least one viable initial opportunity, reachable supporting infrastructure where the intended stage needs it, and alternatives rather than a single required cut. Use generation tests for those structural properties, but review the actual decision space at the gameplay camera too.

The current formation generator already separates geology families and random streams and is shared with site reconstruction. Extend that common generator rather than building one layout for the rover and an unrelated approximation for off-screen production. [DRILL] [SITES]

## 6.4 Persistence: distinguish temporary excavation from owned infrastructure

The current drill recovery code explicitly bypasses tunnel recovery when the asteroid has a site association. The site system also freezes an anchored layout through its Massline Core mechanism. It would be inaccurate to diagnose the current game as simply healing anchored factories shut. [DRILL] [SITES]

The design issue is the transition into durability. An unanchored site's identity remains tied to an asteroid entity that can be rerolled, while a Core makes the site durable across visits. A technically explicit warning can still be an unpleasant investment rule: a new player may reasonably expect a machine they built to remain where they left it. [SITES]

My recommendation is to make the first durable commitment unmistakable and cheap enough to experience early. Either claim the site as part of the first meaningful installation or require an explicit anchoring step before any permanent investment. Do not permit a player to invest extensively in an ephemeral record and then treat disappearance as their failure to understand the engine's identity lifecycle.

Preserve the saved geological seed, cut cells, placed machines, connected stores, power and lane topology, pending exports, and relevant operation states. Rematerializing a scene should reconstruct the same operation, not replay its rewards. Include migration tests for old unanchored saves and for restore order. The current site system already contains restore guards and idempotent wiring worth keeping. [SITES]

## 6.5 Information: no fog is not the same as no discovery

The owner-directed design law says material geology is visible from the first frame. The site system still contains a volatile claim-survey path advanced by scan pulses. These might refer to different information: seeing ore is not necessarily the same as identifying a claim formation. That distinction needs a complete consumer trace before calling it a runtime contradiction. [ROVERLAW] [SITES]

For the proposed version, material identity and the consequence of a cut should be legible without repeated scanning. Discovery can remain in the arrangement, the value of a productive adjacency, a distant visible exotic, or the operational possibilities of a site. Do not turn scanning into a compulsory button press that reveals information the main strategy already assumes the player has.

A placement preview should show what will work, what will be lost, and why. Use board-local highlights for touched faces, blocked lanes, thermal adjacency, and output direction. Put detailed numbers on demand. The fifteen-word default-view target expresses a good anti-clutter instinct, but a rigid count cannot override localization, accessibility, or a necessary irreversible-action warning. [ROVERLAW]

## 6.6 Input and presentation need one coherent clock contract

The current screen adapts remapped flight actions, preserves an owed tap through key release, and limits catch-up to at most one cell boundary per rendered frame. Those protections address real input problems. They also mean low presentation rates can affect how quickly held movement advances in wall-clock time. This is a deliberate coupling to characterize, not proof that the adapter is simply incorrect. [DRILLUI]

Measure tap acknowledgement, cell commitment, hold repeat, cancellation, blocked movement, and transition into drilling at several presentation rates. A visual interpolation can smooth movement between logical cells without letting a delayed frame execute a burst through hazards. A queued discrete action can preserve a tap without preserving an unwanted held cruise after release.

Any revised controller must handle modal interruption, focus loss, menu opening, mouse capture changes, and exit to flight. The most damaging input bug in a mode switch is not a slightly wrong animation speed; it is carrying a held action into the wrong mode.

Keep the flat screen-aligned grid **in full 3D**. The owner explicitly rejected a flattened tile replacement. Depth should come from solid blocks, cavities, authored equipment, contact and cast-shadow relationships, and lighting that makes the working face readable. The present request for more luminous stylization does not revoke that requirement. [ROVERLAW]

## 6.7 The operation must have an exterior consequence

Site output should enter an explicit buffer. A courier or export operation should move it to a destination. The receipt should explain quantity, destination, realized price, operating costs, and any loss. Near the player, show the event as a meaningful object or activity; far away, preserve the same custody and progress abstractly. [SITES] [JOBS]

Do not build an entire fleet-management interface to prove this. One site, one meaningful processing relation, one buffer, one destination, and one visible shipment are enough for the first integration slice. The site should have a clear reason to keep operating while the player flies elsewhere.

The design law leaves the role of danger around late-game compounding income open. Do not fill that gap by inventing periodic raids and maintenance punishment as the default balancing answer. First make the operation itself understandable and rewarding. Add chosen risk only when its rewards and counterplay are visible. [ROVERLAW]

## 6.8 Acceptance for the first integrated site

The player can enter from a recognizable asteroid, understand a valuable cut before making it, perform it with predictable controls, install a working relation, leave, and return to the same operation. Its output reaches the flight economy exactly once. A blocked operation has a visible local cause and a useful corrective action. The player can choose to leave it inactive without mysterious destruction or unbounded background punishment.

Test the route with save/reload before delivery, after delivery, during a blocked lane, and after a geometry change. Test excavation next to existing machines, split and merged storage networks, and capacity overflow without lost goods. Test what happens when the player exits immediately after issuing an action.

Only after that loop is compelling should the program expand recipes, map families, late-game exotics, or additional equipment art. A beautiful rover screenshot is not the integration milestone; a persistent useful operation is.

<!-- Source links are pinned to the audited commit. -->
[ROVERLAW]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/design/ASTEROID_WORKS_DESIGN_LAW.md#L1-L210
[DRILL]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/systems/drill.js
[DRILLUI]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/ui/screens/drill.js#L1-L165
[SITES]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/systems/asteroidSites.js#L1-L200
[JOBS]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/systems/npcJobsRuntime.js#L1-L195
