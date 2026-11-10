# Pallas: one physical escorted Sker run

## Outcome and limits

The existing Sker-run hauler waits for its original lawful patrol to come alongside,
then crosses its two authored marks and reaches the actual `station_smuggler`
(Smuggler Den, in the Hollow Hub pocket). The hauler holds if the escort falls behind.
Both hulls must be physically present, slow and near the endpoint before the run ends.
NPC jobs remain the only movement-intent owner; no pose or velocity is written here.
The other six Pallas workers retain their existing jobs. No new asset, pirate, commodity,
payment, mining result or whole-sector safety claim is created.

The old Pallas loop translated all eight live hulls directly and completed four
claimed handoffs even with zero actors. Independent baseline reproduction completed
that empty-world story in 120 seconds. Its legacy progress is deliberately discarded;
it is not a cargo receipt or earned reward.

## Player route

Visit the Sker-Run Ambush pocket in Pallas Drift. The existing hauler and patrol meet
without a mission acceptance. Target-panel work status and ordinary Hail STATUS explain
the rendezvous, protected run, hold, past arrival or loss. Hail ROUTE on the hauler names
Smuggler Den at Hollow Hub, matching the actual station. Patrol weapons authorization
still outranks the friendly work reply. Nearby radio announces phase changes once;
a distant player is not credited with protecting a run they never witnessed.

The player may accompany the pair, clear threats or interfere. Ordinary job threat/flee
and external control leases take priority. Missing/non-native actors pause progress;
a lost original cancels the run, and the survivor resumes its canonical work. No
replacement escort, fabricated shipment or restart reward is supplied.

## Ownership and Continue

- `src/data/pallasWorkShift.js`: versioned finite state, exact original identity and pure readout.
- `src/systems/pallasWorkLoop.js`: authenticated paired targets, native arrival/dwell, cancellation
  and ordinary-job handback. The native gate checks current body/world/colliders, enabled state,
  post-solve tick, finite motion and scalar/native agreement.
- Pallas-only joins in `traffic.js`: existing update/helper and explicit serialize/deserialize.
- Pallas-only joins in `npcJobsRuntime.js`: suspension of the ordinary itinerary and its existing
  physical worker steering; no second movement writer or generic salvor modification.
- `contactHail.js`, one preload and one scoped package command finish ordinary access/test wiring.

The save envelope retains the original finite run and actor identities. It does not retain
partial dwell; continuous physical evidence must be observed again. Missing/legacy saves replace
outgoing state, and duplicate simulation ticks cannot accumulate arrival dwell. Off-sector time
cannot certify arrival. Completed Continue keeps the result and does not restart the run.

## Evidence

`npm run check:sim:pallas-shift` runs the real-owner native route, ordinary native Continue,
identity/control/loss/native-gate cases, Hail interaction and retained Pallas roster/route tests.
The initial complete 13-case suite passed locally and against an immutable public-a8 source tree;
normal native arrival was 253.18 simulated seconds. Mid-run production `save.loadEnvelope`
restored the same `wr_convoy_282eb888` and `wr_convoy_94ba41c5`, reached the station, and survived a
second completed Continue. An added ordinary Hail check plus updated adversarial checks pass3/3.
Independent review additionally passed six adversarial checks and reproduced/fixed disabled-body
admission and a misleading missing-escort readout.

Native composition uses production flight, AI, physics, job and station producers. It excludes
unrelated world encounter ticks and is not a complete live browser/player-camera acceptance claim.
The existing sparse-asset/browser environment limit remains separate. No merge or deployment.
Final public proposal, source hashes and publication evidence are supplied by integration.
