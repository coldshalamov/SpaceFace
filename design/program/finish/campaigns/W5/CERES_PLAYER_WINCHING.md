# Winch the original Long Plate

Local candidate, 10 November 2026. PR #945 was freshly verified at
`764834a327e05db35e4a19ea2d4d51cae03dadb0`, still draft and incomplete. This is an
attended winching increment on the existing Second Measure machinery, in the
commission's winching-first order. It is not the portable Winching tool, Ninth Mouth
geometry, or acceptance of the entire Ceres Tier A town.

## Playable change

Taking the original Long Plate no longer makes its existing receiver permanently
unusable. The pilot can line that same 1,800-tonne body up on the cradle's open apron,
bring its drift and spin nearly to rest, hold it on an ordinary Line, and wait for
the yard's ready call. Deliberately releasing that Line transfers it to the anchored
cradle winch. The native clamp reels at at most one world unit per second; the real
pads close when the original enters. Native contact, not a timer or distance receipt,
establishes retention.

The pilot stays 200 to 380 world units from the cradle. The accepted apron runs from
170 units in front of its center to its center, within four units laterally, .025
radians of alignment, .35 units/s total speed, .03 lateral speed, and .002 radians/s
spin. The breaker and cutter must be clear, the original and receiver must be live
and admitted, the pads must be open, and there must be no competing attachment.
These are physical receiver conditions, not a character level or hull-class lock.

The actionable ready call is immediate and once per actual Line, so a fresh retry
gets a fresh call rather than waiting behind routine yard chatter. The hearing area
includes the actual cradle apron. Disabling equipment or changing custody withdraws
readiness. Native pad obstruction pauses the winch. A quiet original that cannot
seat after native reeling stops gets explicit recovery guidance rather than a false
success. No pose correction, mass reduction, duplicate load, replacement model,
additional reward or mission state is introduced.

The pilot can reclaim the original. At the seated overlapping geometry, use target
cycling to select the Long Plate before latching the Line: direct cursor picking can
select the cradle instead. Either real claim releases the winch safely, but selecting
the plate is the direct way to take the plate. The radio instructions say this without
hard-coding a keyboard binding. Equipment disablement or foreign control stops work;
it is not falsely treated as a player claim.

## Native owners and bounded files

- `src/systems/ceresPlayerWinching.js`: new helper called by the existing workfleet
  owner. Observes a same-life player Line and deliberate cut, requests native clamp
  creation/reeling, and reads native pad contact. It does not write actor motion.
- `src/systems/ceresWorkfleet.js`: bounded dispatch, marker restore and stop cleanup.
- `src/systems/asteroidSites.js`: permits the existing canonical retention operation
  for the exact validated player-returned receiver, still requiring physical contact.
- `src/systems/npcJobsRuntime.js`: bounded Ceres serialization. A synchronous Save in
  the clamp-created callback records the actual committed attachment id, never a
  predicted id or an orphan receiving phase.
- `src/systems/ceresWorkfleetStagecraft.js`: truthful ready, holding, obstruction and
  recovery calls around the existing yard. It has no operational authority.
- `test/ceres-player-winching.test.mjs`: native behavior and full production Save tests.

Same-tick/in-flight guards prevent recursive event callbacks from accelerating the
winch. Each consequential callback checks job and body lifetime before continuing.
A cradle replaced during custody release cannot receive the old transaction's writes.
Continue does not turn a remembered offer into permission to seize an arriving load.

Existing original hull, breaker, cutter and cradle assets are reused. There is no
verified Ninth Mouth cave or portable quarry-winch model in this implementation;
those remain work for the model owners. Earlier dirty source, crew conversations,
paid-brace consequences, workers and unrelated gameplay are preserved.

## Evidence and limits

- **28 owned checks pass** in the final aggregate. They cover handover refusal,
  original identity/mass, physical pull/retention, mid-pull and retained Save,
  public input, recursive callbacks, callback Save/cut, explicit and Line custody,
  disability/foreign leases, obstruction, later physical disturbance, repeatable
  timely readiness and callback body replacement.
- **54/54 final aggregate checks pass** across the owned file, yard stagecraft,
  receiver handoff and crew return. The terminal player-recovery suite separately
  passes **30/30**, for **84 final checks** across those five suites.
- The centered native apron pull travels **161.499 world units in 9,794 ticks**
  (163.23 simulated seconds). The same five-collider original retains mass 1,800.
  A deliberately applied native lateral impulse can jam it honestly; reclaim works.
- The **221-system production factory** accepts raw F latch/cut through the input
  system, then its actual Save owner serializes and loads the complete envelope.
  The same receiver id, native rest length, original motion and receiving job survive
  with a fresh entity life. Starting position and prior site work are fixture setup,
  not evidence of flying the whole approach or earning the original work.
- Independent raw input with the real Line progression owner demonstrates the weight
  difference: **Class I snaps 470 ticks (7.833 seconds) after latch**, while Class IV
  survives the same ten-second load. Both move the original first. A weaker Line is
  not categorically incapable of moving it, and this change adds no artificial lock.
- Independent raw F at the apron secures the original; existing target cycling plus
  raw F reclaims the same seated plate and clears retention. Tight accepted drift and
  spin cases seat with maximum measured native speed below one world unit/s. Ready
  calls were observed at ticks 104 and 170 for two actual Line attempts in one visit.
- Independent review passed the 130-case native/neighbor set before the final three
  readback/lifetime regressions. The final boundary changes were independently
  rechecked with no material blocker. The evidence distinguishes public input tests
  from geometry-staged/native-owner fixtures and from full production execution.
- **Fast tier 39/39**, save schema v23/467 paths, player-facing labels, source syntax
  and scoped whitespace checks pass. No golden was changed.
- **47-A 720 ticks / reload at 600** has identical uninterrupted and continued hashes.
  The exact immediate-before source overlay has the same resulting hash
  `c7929d2c0447fd8f7d143ebce6bdc9cf947f2029640bc6ebb7bba0dec34a387f`
  and the same preexisting expected-golden mismatch. The historical expected hash is
  `ebbfe82a6bf1e87ac1912942751e661fe6cf4ba42e69a2ddce360c408385061b`.

No rendered browser/Electron journey, fresh screenshots, earned start-to-finish
hauling route, arrival pacing, audio mix, FPS or hardware acceptance is claimed.
The narrow alignment and roughly three-minute physical pull still need a hands-on
feel pass. The known browser restriction was not retried. The complete inhabited town,
portable tool, Ninth Mouth and first-arrival weight-gate acceptance remain open.

## Local delivery

The seven-file minimal increment (five runtime files, test, report), immediate
before-files, final source snapshots, hashes, exact before-source loader and logs are
under `/workspace/shared/ceres-player-winching/`. NOW contains coordination only.
The before-files preserve the shared dirty tree rather than assuming HEAD equals the
starting source. Port only the minimal increment after checking its dependencies
against the then-current commission branch. No commit, upload, publication, merge,
deployment, external execution thread or laptop work was performed.
