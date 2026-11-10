# Ceres arrival: Kroll’s open shift

## Result

A bounded arrival and character scene connects the existing Ninth Mouth rescue to
ordinary Ceres life. This is a candidate on exact draft #945 parent
`f63a8765f1d25808b88bd1fddcb58a033a703b59`, tree
`fecd8b6fc29a8f6a6c9cb3a4e82cd4645329e139`. It is not completion of EC-S02.

The ordinary Helios Kessler card and the existing Ceres Refinery host each offer
an optional conversation and a map handoff. Their established names, other work,
rumors and choices remain. Kroll stays at her existing receiving mast; she is not
cloned into either bar. The map now has one selectable POI-style apron address,
even before the pocket has admitted its bodies. At Helios, the referral opens the
star chart with a visible Ceres sector node selected. It does not pretend that the
current Helios system chart can display the remote apron. Once in Ceres, the local
referral selects and frames Kroll's actual receiving apron on the system chart.
Opening either chart never plots, engages or jumps. Explicit Plot Course retains
a route to Ceres; the existing neighboring-sector primary remains Set Course &
Jump and is not described as plot-only. Inside Ceres, explicit Set Course uses the
actual global apron fix, while its chart camera and drawn point use sector-local
coordinates. Clicking the drawn apron retains its authored approach note.

At the cut, Kroll can explain why she will not close the boat’s shift, why the
refinery’s tonnage is not her priority, and how the existing Cathedral Vigil gives
that concern local meaning. The player may start with the original barge, start
with the first remaining unseated worklight, return to the work channel, or leave.
These choices select the existing guidance. They do not accept a mission or gate
physical work. The conversation remains readable without control instructions
being reinserted by telemetry refresh.

The original rescue receipt changes Kroll’s aftercare and both station responses.
Her distinction is concrete: the crew transfer is filed, while any remaining
worklights are separate work. A lost original without a receipt is not called a
rescue. A later loss does not erase a previously committed transfer. Conversation
and chosen approach survive the existing NPC-jobs save owner. A bounded worker
mirror makes that same saved record available to station and chart readers after
the flight offer has disappeared.

## Why this is the right existing route

Adventure begins in Helios through the existing New Game boot. Ceres is an
existing first-hop neighbor, not a new jump link. Its original authored arrival
has the Refinery Flare Rack and Inbound Weigh Pin. The refinery buys ore, offers
ordinary services and work, and keeps its own host. Second Measure remains a
separate paid yard job. The Cathedral Vigil and its worklight already belong to
Ceres lore. These facts were traced in `newGameBoot.js`, `sectors.js`, the ordinary
Bar controller and current contact data.

Before this increment, the rescue could be exercised locally, but these contacts
did not refer the player to it and the chart lacked its selectable receiving
apron. A plain map-open position would only pan the chart, not establish a
selectable target. The bounded map insertion repairs that connection without a
fake station, fake mission, duplicate POI entity or change to the world RNG.

## Scope and ownership

Five runtime paths:

- `src/story/ceresArrivalStory.js`: pure story/receipt/contact/chart reads.
- `src/ui/station/barContacts.js`: small ordinary choice and map handoff insertion.
- `src/ui/galaxyMap.js`: one authored chart address and exact referral selection.
- `src/systems/ceresNinthMouth.js`: optional story page, saved conversation and voice.
- `scripts/lib/simReadModel.mjs`: fixed eight-original receipt/conversation record.

Two new tests and this report complete the eight-file increment. Native body,
geometry, asset, mass, collision, Line, lamp Seat/Unbolt, crew receipt, economic
and mission authorities are unchanged. The new dialogue never awards credits or
completes a contract. There is no invented 9 IN / 8 OUT traffic census. Only the declared paths are included.

## Map handoff correction

The first candidate is withdrawn. Independent production-path review found that
its local referral put a global position into a sector-local camera, adding the
Ceres origin twice. Its Helios referral also tried to show a Ceres POI on the
current Helios system chart. Payload and read-model assertions passed while the
actual points were absent or offscreen. The corrected candidate uses the real
producer, onShow, camera adoption, canvas draw geometry, hit target, pointer-click
handler and world route owner. Direct SYSTEM clicks now retain sector, POI type,
local draw position and approach note. This is a bounded correction for the new
referral, not a general map/navigation rewrite.

## Verification

Final author checks:

- Owned: **13/13**. Generated contacts, mounted ordinary Bar handlers, invalid
  receipts, unavailable callers, worker receipt/plan propagation and clearing,
  and the native physical/contact/Save/Continue route.
- Six map regressions cover Ceres and Helios at 1440×900, 900×600 and 390×844.
  They invoke the real contact reply, onShow, camera adoption, draw, point hit and
  canvas click handlers. Both targets are visible; opening leaves navigation
  untouched. The real world owner retains the explicit Ceres route without
  jumping/engaging, and the local waypoint has the correct global position.
  An unchanged independently authored production-map probe also passes all four
  desktop/narrow local/off-sector cases.
- Existing contact, guidance, owner, mirror, presentation, readout, Kessler return,
  Bar readability and map/gate neighbors: **66/66**.
- Player-facing labels, 12px type floor, save schema and map-frame check: pass.
- Final immutable fast tier: **39/39**, 199.2 seconds, against the frozen corrected
  code/test overlay. The pre-correction result is not used as final evidence.

Independent review:

- Corrected owned **13/13** and neighbor **66/66** suites passed independently.
- The unchanged production-map regression now passes local and off-sector
  onShow/camera/draw routes at desktop and narrow widths.
- Eight stale story-plan guards passed: close, dock, death, changed player life,
  receiver loss, sector exit, save restoring and New Game. Barge-first selection
  and older/malformed conversation-save defaults also passed.
- Consecutive-tick receipt/plan propagation, New Game clearing and null guidance
  during the story page passed. No remaining concrete code blocker in this scope.
- Exact final package/tree and code/test hash comparison are recorded separately
  in the review evidence; rendered acceptance remains blocked below.

The earlier local reviewer also found stale loose-lamp wording after partial
seating; corrected to location-neutral language. Stable story-page refresh keeps
guidance null. The mounted test's event model was corrected to bubble actual
delegated button callbacks, then isolated from native HUD updates.

## Evidence boundary

The native test uses the production runtime, seed 47 and a staged Pelican outside
the pocket. It flies into admission with raw keys. The production Prompt Deck and
Ceres adapter are mounted on an event-model DOM; their actual button callbacks
open Kroll’s scene, choose light-first, Seat the original lamp and read aftercare.
The scene remains open for 30 ticks without technical guidance overwriting it.
Coordinate-aware key/cursor automation then moves the same Lip worklight, releases
and catches it from behind, settles and seats it, and extracts the original barge
for one native receipt. Full Save/Continue and sector return retain all eight
originals, one seated light, the receipt and the remembered light-first approach.
Final arrival-to-Seat is 30.333 simulated seconds; arrival-to-receipt is 62.400.

This is **headless integrated evidence**, not a rendered player journey. The
map checks record production geometry and execute actual hit/click handlers on
an event-model canvas; they do not inspect browser pixels, CSS or human input.
The station approach/docking and outside-pocket start are fixtures. It does not prove
an uninterrupted ordinary Helios departure, earned hull progression, gate flight,
Ceres docking, or novice handling. The other two lamps and Unbolt are not newly
earned by this route. The legacy physical tests retain their own stated scope.

**Rendered acceptance is UNVERIFIED.** Chromium aborts before loading a page with
`process_singleton_posix.cc: socket() failed: Operation not permitted`. A reviewed
same-environment attempt failed at the same launch boundary. There are no new
screenshots, GPU, moving-camera, pointer/gamepad-layout or frame-cost claims.

The nine-mouth mountain, complete ordinary work choreography, Quarry Bell,
traffic census, full lamp-line experience, modeled lasting tag and the complete
EC-S02 commission remain open. This increment supplies a connected social and
navigation context for the already physical rescue; it does not declare the town
finished. No publication, merge or deployment was performed by this work.
