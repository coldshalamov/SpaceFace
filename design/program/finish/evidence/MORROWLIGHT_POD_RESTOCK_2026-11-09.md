# Morrowlight: pack your supplies into the original pod

## Playable loop
After claiming the tender, choose **Pack my supplies into an original pod** from
home, or **Rack / pack my supplies** from the ordinary nearby cargo page. Select one
of the three surviving original pods, then deliberately move one unsealed scrap,
salvage electronics or fuel cell from the ship's hold into its matching compartment.
An empty shell can now hold the pilot's supplies again. It never refills itself,
returns lost stock or spawns a replacement. Unload the same physical pod to use those
supplies again; the existing stage-three rack carries the actual pod.

The original per-commodity limits are unchanged: initial 6/3/2, outer 10/5/3 and deep
14/7/3. No price, resource creation or increased storage bound. Sealed freight is not
available to pack. Transfer requires the same living original, native admission,
flight, local sector and matched speed within 75 WU. Dock/save/changed-row and stale
occupant guards fail closed. Old empty saves remain empty until the pilot deposits
something; saved normalization and original capacities remain unchanged.

Home has at most eight choices; cargo remains at most nine. Rack actions moved into
the bounded Rack/Pack submenu instead of adding a tenth cargo action. Both exits and
all existing selective/bulk withdrawal actions remain reachable. No shared presenter
or input owner changed.

## Transactions and correction
The physical owner publishes destination manifest, durable record and native mass
before invoking the canonical cargo removal writer. Its event occurs after debit,
so callback saves see both sides committed. The state-scoped transfer lock covers
both directions and every adapter instance.

Independent review caught an initial reverse-direction gap: bulk unload did not
acquire that lock, allowing a second adapter's restock callback to replace the live
manifest while the first loop retained its old reference. That defective iteration
was not published. Corrected unloading acquires the same lock and reserves only the
exact whole units accepted by the canonical hold-volume rule. This also prevents a
partial-capacity callback save from dropping the unaccepted remainder. It calls the
canonical cargo writer directly, with no arbitrary injected transfer writer. It
revalidates original/pilot/row lifecycle between lines. Actual throwing event-listener
tests use the ordinary bus's isolation, not a promise to recover arbitrary corrupted
JavaScript objects or manually replaced cargo functions.

## Scope and verification
Four paths: `src/features/salvageTender/physical.js`, `runtime.js`,
`test/tender-pod-restock.test.mjs`, and this note. Prior hold, triage and selective
recovery changes are preserved; no cargo/economy/service/model/asset/render owner edits.

```
node --test test/tender-pod-restock.test.mjs test/tender-prepaid-hold.test.mjs test/tender-repair-triage.test.mjs test/tender-selective-recovery.test.mjs test/tender-live-repair-allocation.test.mjs test/pro-experiences-salvageTender.test.mjs
```

Final author **8/8 focused and 51/51 combined** pass.

Eight focused checks cover the actual prompt adapter, original compartment limits,
sealed freight, no cash, stale/same-ID identity, mode/dock/restoring interruption,
empty-shell reuse and real Rapier mass, both callback directions and fresh save-envelope
restore during each transfer. Throwing cargo listeners cannot duplicate stock or leave
the transfer guard stuck. Final combined log: `/tmp/tender-restock-final.log`.

The real starter-ship flight probe travels 75.08 WU in 4.9 simulated seconds, recovers
one electronics from the original pod and deliberately repacks it through the public
owner action. Hold plus pod totals stay fixed, and actual Rapier mass changes back.
It starts near a prepared, already-claimed stage-three tender: this is not the full
ownership/restoration journey or a complete relocation with a newly restocked rack.
No impact census or collision-free claim. Headless prompt checks are not rendered
browser/pointer/gamepad acceptance. Fresh SaveSystem envelopes are tested, not the
full disk/load-screen Continue path.

Initial test failures were fixtures attempting transfer before the real native mass
revision settled, and attempting the home card outside its range. Fixtures now wait
for normal owner steps and use the ordinary accessible card; no physical gate was
weakened.

Before snapshots: `/tmp/tender-{physical,runtime}.before-restock.js`.
Remote inspected `f95de0eb1ba7560839209936afba48c7b96fe41a`.
No publication performed.
