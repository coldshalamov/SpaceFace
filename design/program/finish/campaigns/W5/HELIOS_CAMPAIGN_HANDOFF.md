# Helios: the other book on Kessler's desk

## The player problem

The first Hitch shift already earned wages, produced loose iron, and let the pilot
sell that iron at Helios. Kessler's return offered another local cutting ticket.
That was valid local work, but it did not lead into the actual story.

The canonical next job is not immediately Scale 4. Contract 47-A is already active:
mine its marked sample in Helios Prime, encounter the Skim, return through the Helios
receiving desk. Only then does the sealed-alloy run to Tethys open. Scale 4 follows
the alloy handoff; the Furnace Detail at Ceres follows the variance reading.

## The connected scene

The paid-shift reply leaves a second file on the desk. The pilot can keep doing local
work or ask about 47-A. Kessler distinguishes wages from the unresolved recovery and
points to the existing marked source, not another generic iron face. **Track + open
Mission Log** sends the normal tracking intent for that exact active mission.

The player may ask Kessler to leave the old weight on their copy. This is a remembered
conversation choice, not a new cargo item, payment, disputed-weight filing, or progress
shortcut. The existing stationContacts owner remembers the real canonical Kessler
contact; later replies acknowledge that request after Save/load.

After actual B0 settlement, Kessler distinguishes the withheld freight payment from
ordinary cutting wages and presents the actual sealed-alloy posting: six units preloaded
on acceptance, Helios to Tethys, the posted reward and normal readiness/acceptance card.
The existing campaign also grants its 400-credit B0 story stipend. Nothing here grants,
withholds, or repays credits. Campaign-only players are not told they earned a first
iron wage they never earned.

An accepted alloy job becomes a tracking handoff instead of a second offer. If the pilot
returns to Helios after delivery, Kessler explains that the delivered alloys are gone:
Scale 4 weighs a fresh pod of the pilot's own freight. Its course action plots the actual
open ring without engaging autopilot. After an actual retained scale reading, he reads
plate and stamp separately, remembers the earlier request, and points to the existing
Furnace Detail. No paired numbers are invented for legacy records without them.

## Owners and boundaries

- `heliosCampaignHandoff.js` is a read-only presenter and intent adapter.
- `heliosFirstShiftConversation.js` adds the bridge invitation to the existing wage/sale reply.
- The normal Bar lists the choices and displays the existing acceptance surface.
- Missions still owns sampling, progression, offers, tracking, completion and payments.
- World owns plotted courses. StationContacts owns the remembered conversation. The
  existing save envelope owns persistence. No new system, registry entry, schema, asset,
  model, station, or physical actor was added.
- All candidate source comes from published draft #939 at `672ecbc`, over immutable base
  `f95de0eb`, with only this increment overlaid. Unrelated dirty checkout work is excluded.
- Restricted upload paths remain unchanged. No merge or deployment is part of this work.

## Defensive review

Actions bind to the current mission identity and sample phase, or the complete current
alloy posting. Changed terms, replaced/closed jobs, duplicate IDs, a changed sample source,
undock, restore, and stale hidden controls cannot accept or track a cached assignment.

Independent mounted review found and drove fixes for an old hidden Accept control,
accepted-status text surviving reload, and asynchronous acceptance overwriting a new
reply or repopulating a reopened desk. The retained tests exercise these cases through
the production Bar controller and real mission/contact/cargo owners.

## Verification

Focused and compatibility suites: **95/95 passed**, including the nine new domain tests,
eleven mounted UI regressions, previous first-shift and local-work conversations, authored
contact labels, the live campaign adapters and Scale 4 behavior. Existing extracted-function
tests receive the new presenter dependencies; their assertions were not weakened.

Native production evidence earned the first paid cut and sale, preserved an earned desk
checkpoint, then flew to the exact marked 47-A source with native input, mined the sample,
restored it through JSON Save/load, observed one canonical lane Skim, flew back to the
physical Helios berth, and used the actual dock intent boundary to open B1. The actual
sealed-alloy offer was accepted with six reserved units aboard; the active job, withheld
freight state and Kessler's remembered request survived another Save/load. The final
continuation passed in 37.86 seconds from the earned checkpoint, with 1,014.76 world
units of native-key flight over 2,879 flight-controller frames. Campaign state was not
fabricated. This is a separate passing native probe in addition to the 95 regressions.

The original native admission has two explicit placements: beside the live cutter and
at its offered shared cutting position. Subsequent movement is native flight. Node-safe
runtime omits uiRoot, so physical range is followed by the normal dock attempt/denial/
docked intent and dock-state commit, not a rendered dock-button click. The full retained
test is `test/helios-campaign-native.test.mjs`; its checkpoints are optional diagnostics.

An older `story-weakpoints-b0-b2-spine` source-fixture sample assertion fails identically
on the exact published parent. It was reproduced separately, not edited or counted as
passing. The actual source-recovery route above passes.

## Still open

This is an integrated desk-to-campaign handoff, not completion of the whole opening.
The existing Skim currently resolves through authored timing, logs and salvage wrecks;
this work does not claim an embodied black-Line interception. The native continuation
ends at B1 acceptance, not the full Tethys delivery, physical Scale 4 tow, or Ceres job.
Scale 4 continuation in the new domain test uses explicit event fixtures.

Rendered Bar geometry, audio, unassisted New Game discovery, persistent storage-slot and
title-screen Continue remain unverified. A local rendered bench was prepared, but Chromium
terminated before page load because local socket creation was denied and its crashpad
configuration was read-only. No screenshot or visual acceptance is claimed. No unchanged
browser retry or alternate computer was used.
