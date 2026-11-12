# Ceres: a berth for the next shift

## Direction and scope

Exact source parent: PR #945, `4795a25dbaef265f546fd7ad105f2534c23992b7`,
branch `experience-commissions/EC-S02-ceres-belt` (verified open draft).
This is a bounded narrative/navigation connection, not completion of Ceres.

The existing sequence is Helios Kessler → Ceres refinery → Kroll's original
Ironback rescue. Previously the return conversation could only point back to
remaining worklights. The next shift now leads optionally toward an existing,
substantial physical activity: Nessa Vale's Breakwater restoration.

After a native committed rescue, Kroll offers “Where could this work matter next?”
She distinguishes bringing this crew home from keeping a berth useful for another
shift. Her account reads Breakwater's actual project: failed/lost originals,
partial restoration, both seated, paid commissioning without charter, or an
operating cooperative/bonded berth. She never promises stock, wages, available
contracts, or a replacement original. The player may ignore the referral or return
to the existing work channel. Lamp work remains independent of the rescue.

Only the subsequent “Plot Breakwater approach · do not engage” action emits the
canonical `ui:setCourse`, with `autopilot:false`. It uses Breakwater's existing
open approach (site-local z+90), not the loading-frame center. This replaces any
previous course, as the ordinary world course owner does. Dialogue alone does
not plot, accept work, discover/admit Breakwater, move any body, or pay anything.

## Reusable scene/toolbox entries

- `src/story/ceresArrivalStory.js`: receipt-led optional aftercare. Added pure
  `krollNextWorkScene` and `krollNextWorkCourse`. Location and condition come from
  existing Breakwater authority rather than duplicated quest state.
- `src/systems/ceresNinthMouth.js`: existing eligible flight/receiver/life and
  current-offer guards wrap the optional story page and course action. Action-time
  rescue/page/topic checks also refuse a stale request after receipt loss.
- `src/features/breakwaterSpur/definition.js`: existing Nessa, structure,
  cartridges, coordinate and charter constants. Not modified.
- `src/features/breakwaterSpur/runtime.js`: existing course approach and real
  work loop remain authoritative. Not modified.
- `src/systems/world.js::_onSetCourse`: canonical explicit local course and
  inactive autopilot. Not modified.

No new assets are required for this connection. No model requests, duplicate
mission, economic writer, save schema or UI-shell change.

## Verification and limitations

Five focused tests cover: receipt-gated offer; inert dialogue; exact course;
no reward/body/project mutations; stale sector/dock/life/receipt requests;
current-project narrative; owner serialize/restore with original identity; and
actual production world course ingestion, inactive autopilot, no travel/jump,
old route cleared. Thirty-two existing arrival/contact/guidance/owner tests pass.
Final combined suite: **37/37 passed**. Independent focused rerun: **5/5 passed**.
Independent review requested corrections for partial originals, paid commissioning
and completed lamps; these are incorporated. All tests use exact-parent imports
through an overlay; the shared checkout was not edited.

This is owner-boundary fixture and production navigation evidence, **not visual
review**, not an earned uninterrupted rescue-to-Breakwater flight and not a
complete Breakwater restoration. Conversation is offered again after Continue
from the preserved rescue receipt; no separate referral completion flag is added.

## Open-goal continuity

- SF-WORLD-DIRECTION / SF-SECTOR-COHERENCE: bounded connection implemented in
  candidate, owner dot creative direction. Next: follow the plotted approach in
  an earned Ceres run and complete Nessa's initial survey/first original haul.
- SF-LIVING-WORLD: rescue and berth restoration now have distinct linked motives;
  still no offscreen crew simulation, new traffic census or economic consequence.
- SF-GAME: tests above; acceptance still needs rendered radio choices, navigation,
  human handling, uninterrupted sector journey, full save envelope and wider PR
  integration. Draft/conflicts are not solved by this note.
- SF-ASSETBANK / SF-ASSET-QUALITY: existing originals and loading-frame assets
  reused; visual review and full nine-mouth mountain remain open.

Publication, merging and acceptance are separate from this frozen candidate.
