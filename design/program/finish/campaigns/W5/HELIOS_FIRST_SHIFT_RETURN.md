# Helios first shift: two columns, two receipts

## Diagnosis and direction

The published first workday already has a genuine cutter, optional Hail directions,
shared physical mining and a homebound buyer mark. Its return to Kessler did not
distinguish cutting wages, held cargo and actual sales. The player could also follow
a named commodity handoff into Market and find a different cached/first-held lot selected.

A full production run supplied the missing pacing evidence: the cutter's first finite
face yielded one iron and one silicate, leaving a two-iron ticket half complete. The
pilot physically flew to another face and cut the remainder. Do not enlarge the first
rock, grant quota credit, or hold the worker forever to make the scene appear complete.

The architecture is sound: missions own cutting settlement, cargo owns collected
units, economy owns sales, and the station UI reads their receipts. The cheapest
finished increment is a return scene and an accurate handoff through those owners,
not another workday ledger or a new mission type.

## Player route

1. Accept Kessler's first iron ticket. Its briefing explains that the pay is for
   cutting, loose ore must be collected, and one small face may not fill the quota.
2. Select the seam cutter and Hail. Its working-position answer now includes the
   actual objective tally and the existing Mission Log route to another iron face.
   Ordinary extraction still pauses the worker's own beam; accepting advice does not.
3. Cut and collect real ore. The 2u quota pays once through the mission owner.
4. Return to Helios. Market buys free iron separately. The cutter's homebound
   answer points back to Kessler at the Bar after the sale.
5. Kessler's existing local-work choice becomes “About my first iron ticket.”
   His response distinguishes the exact paid receipt, current free/reserved cargo,
   and the latest strictly later Helios iron sale retained in the recent trade ledger.
   An empty hold alone is never called a delivery. The full accounting appears
   immediately instead of being concealed behind a long typewriter animation.
6. “Review iron at Market” opens the current iron listing in Sell mode; it does
   not trade. An explicit commodity now supersedes a cached or first-held different
   commodity. Any unresolved trade retains its own lot, side, quantity and intent.
7. After a real sale, ask Kessler again: he names the actual units and proceeds,
   then presents the exact next posted ticket through the existing Accept + track
   card. Leaving the Bar clears the old accounting, so returning from Market does
   not display the earlier cargo quantity as a current answer.

An expired, failed or abandoned first ticket gets an unpaid return, with any held
iron still belonging to its cargo owner and the same first-step repost when valid.
No wage, repair, delivery, reputation, discovery or story unlock is invented by dialogue.

## Ownership and scope

Six product files: a pure first-shift conversation adapter; bounded imports/rendering
and handoff in the existing Bar; explicit-commodity selection in Market; first-ticket
briefing and cutter advice. The original starter-work conversation and all mission,
mining, cargo, economy, world, claim and save writers are unchanged.

Three new tests cover the return branches, mounted Bar/controller handoff, and a
production physical/save/sale route. Two existing tests receive narrow maintenance:
the Bar extraction harness stubs its new presenter, and starter conversation tests
import real board/receipt exports instead of slicing source around moved helpers.

Taste: preserve Kessler's terse ledger language and the game's physical work. A
receipt must correspond to something the pilot did. A clue is optional, a buyer
button opens a decision, and neither is a reward. Reuse the existing station card,
button, focus and type styling; no added portrait, HUD, asset or compulsory popup.

## Verification and limits

- Final focused aggregate: 98/98, including 20 unchanged claim-opening cases,
  physical finite bonus/no-duplication behavior, contact lifetime/stale guidance,
  actual partial/full sales and expiry, original starter/buoy conversations, mounted
  Bar read-only/hidden/stale action checks, and Market selection ordering.
- Full production node-safe runtime: 1/1. Two physical faces earn 2 iron, 3 silicate
  and one 420cr ticket award. Real Save.serialize → JSON → Save.loadEnvelope keeps
  completed ticket, nonempty hold, credits and receipt. Raw flight keys reach the
  real Helios docking gate. A 2u iron sale pays 64cr; replay pays nothing. Another
  Save/load and physical redocking retain both receipts and the next posting.
- 47-A seed47, 720 ticks, reload600: equal hashes, no differences. Player-facing
  label, accessibility and 55 UI import checks pass. Independent bounded source/UI
  review found no remaining source blocker.
- The separate legacy NXB-053 test still contains a stale deferRefresh source regex;
  the same failure is reproduced on the exact published parent. It is not counted
  as a candidate pass or changed to hide the failure.

The production route starts directly in campaign flight and uses the board owner's
acceptance path. Two initial placements put the pilot beside the cutter and at its
offered working position. After the first face depleted, the cutter had left: a
read-only nearest-live-iron query selected the second face. All later movement uses
normalized raw keys; mining, pickups and payment are genuine, with danger intact.

The node-safe runtime lacks uiRoot, so the actual dock commit owner is invoked after
the physical range gate, and the sale uses the ordinary economy quote/execute owner.
The Bar proof mounts the production controller against a synthetic DOM; the Market
proof executes exact controller bodies with rendering dependencies stubbed. These
are not browser geometry or full rendered interaction claims. Save proof uses the
real envelope owner, not persistent browser slot storage or a title-screen Continue
click. Unassisted New Game discovery, uninterrupted rendered route, complete Market
input, visual readability/feel, and performance remain open.

Prepared on exact draft PR #939 parent 6e9f6a4bdcba2be356909c7090b0d868267bee58.
This note does not claim publication, merge, deployment or final game acceptance.
