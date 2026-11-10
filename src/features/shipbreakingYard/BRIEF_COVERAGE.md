# Shipbreaking Yard: player journey and acceptance evidence

This is an additive candidate for the exact SpaceFace base `34310c836bf80216b869331c54b777c231a637ee`. The feature owns its runtime, bounded ledger, physical adapter, browser presentation, transport/save adapters, and one ordinary encounter. The shared imports and encounter index regeneration are intentionally left to local integration under the commission's ownership rule. [INTEGRATION.md](./INTEGRATION.md) names those concrete seams.

## An ordinary first visit

In Adventure flight, approach Ceres station's western working apron, or scan selected Ceres station for the yard's receiving-scale marker. The runtime chooses an unoccupied apron outside the station's authored collision envelope, full world-site reservations, and both dormant and live asteroid colliders, then uses that same persistent position thereafter. Entering the nearby yard discovers it and offers its catalog. The civilian encounter `pro_shipbreaking_yard` provides another introduction in Ceres mining, refinery, or civilian zones. A remote introduction offers a receiving-scale course; the player chooses whether to follow it. Discovery does not charge credits. The encounter aborts if the yard owner or physical location is unavailable, rather than claiming that an inaccessible place was discovered.

Three actual assemblies exist as the inspection lots. Claiming one buys those exact originals. The player sees the claim price, current condition, likely remaining value, each named component's intact price, and the extraction strategy before paying. Leaving a catalog or inspection card spends nothing. A declined offer stays closed while the player remains nearby; a scan or another approach brings it back.

The beginner route is LARK's exposed stern engine. Aim at it with the existing pointer or stick, attach the existing MassLine, scan to inspect its one quick clamp, then use the deck's release action while holding the load. Fly the released component into the receiving ring and brake. This order creates the central moment: native tension has already moved both the component and the remaining assembly, and releasing the clamp preserves that motion. There is no invented kick at an ordinary release.

`MARK THIS ORIGINAL` points to the exact selected body. `MARK THE RECEIVING SCALE` provides a return course. Both use the world's existing waypoint owner with autopilot disabled, preserving the pilot's manual control of the load. The existing scanner reopens the selected or tethered original's ticket; when its normal scan result has no target ID, a nearby original is the fallback. Scanning Ceres station can introduce the yard or reopen directions. These are normal input routes; no QA command or new key listener is required after integration.

Work cards show the live, remapped MassLine and scan bindings. For stock keyboard controls this reads `Space/F` and `C`; a stock gamepad shows its complete scanner chord, `LB + D-Pad Up`. The hint starts with `Back to Flying`: dismissing the decision returns gamepad Accept to its flight function. Deck actions release a service fitting or authorize a handover. The player still steers, tows, reels, and brakes with the game's existing controls. A locked handover explains the exact problem: remaining connections, absent native player line, another line's custody, load outside the ring, excessive speed/spin, or pilot too far from the scale.

## The three authored problems

Posted values are ceilings at full condition. The actual catalog shows each seed/cycle's known condition and likely remaining return. New lots mirror their work side and vary condition deterministically; connection rules stay explicit.

| Lot | Claim | Full-condition value | Physical order and opportunity |
| --- | ---: | ---: | --- |
| LARK / postal tender | 80 cr | 575 cr | Four bodies. The 260 cr engine has one exposed quick clamp; mail cassette and docking saddle are separate, readable outer jobs. Recovering one piece is useful even if the remaining frame is damaged. |
| BELLWETHER / compact ore hauler | 250 cr | 1,475 cr | Six bodies. Release the outer cassette's saddle, then its cage crossbrace; tow that cassette physically clear of the governor lane. Free the reserve bottle before releasing the governor return. The 570 cr fragile flywheel governor needs both its service collar and return opened. Pulling the heavy keel can swing the connected cage into this valuable machinery. The outer drive offers a simpler partial return. |
| VESPER / quarantine power tender | 520 cr | 2,620 cr | Six bodies. The outer recorder and survey gimbal provide a safer partial route. For the 1,100 cr converter, use its service port to vent first, release and tow the coolant bottle clear, then dismantle the shield and converter supports. Tearing a live connection through native overload triggers one physical pressure event and damage to nearby machinery. Surviving originals remain payable. |

All three use existing authored cockpit, drive, cargo, spar, tank, machinery, and survey-gimbal assets through the packaged-prop visual path. Their recoverable pieces have stable yard/job/module identity and admitted native compound collision proxies. Connections use the game's combat attachment/native joint owner. The feature does not replace a released original with a visual duplicate, use arbitrary mesh cutting, or award a second generic salvage pool.

## Failure, persistence, and repeat work

Each accepted delivery pays separately through the economy owner and contributes its material to Ceres through the existing stock-pressure seam. The settlement records a unique receipt before reentrant credit/cut callbacks can repeat it. A destroyed or damaged component reduces the remaining return; completed deliveries stay paid. Park a claim to retain its surviving originals, leave the sector, and resume it later without paying again. Closing a claim is a separate confirmation that names the forfeited remainder and preserves receipts already earned. Finishing or relinquishing a lot exposes the next lot in that berth with new identity.

The save adapter captures condition, native pose/velocity, released or broken couplings, pressure state, paid claim, and delivery receipts. Cold restoration reconnects only surviving connected fittings and does not restore delivered originals as payable sources. Restoration also handles a save taken inside the native-cut callback or inside the credit callback before the delivered body has finished retiring. Temporary cuts made while shelving a departing sector remain distinct from the player's permanent separations, including when a save occurs inside those lifecycle callbacks. Reset, sector departure, docking, and browser teardown clear the appropriate tickets, presentation, listeners, and bindings.

## Contextual presentation

The renderer consumes projected facts only. It draws readable-width flat ribbons for connections, a cross-bar at each fitting, an X for an unsafe connection, repeated bars for strain, diamonds around freed parts, selection brackets, and a sparse receiving ring. The ring's strokes stay inside the real 38 WU circular gate. Shapes carry the distinction as well as color. One bounded dynamic geometry carries these annotations; authored meshes remain the bodies. Live mesh positions are used when available, and global receiver/fallback positions pass through the canonical frame-coordinate membrane. The render hook runs after the main renderer's interpolation/prepare phase and before its draw.

The cues have no idle animation, flashing, camera shake, or particle burst, including under reduced-motion/reduced-flash settings. Audio maps discovery, strain, release, hazardous change, and receipt to existing mixer cues with bounded cooldowns. It does not create an AudioContext or a new playback owner.

## Exercised evidence

The focused suite is `test/pro-experiences-shipbreakingYard.test.mjs`. The detailed invocation is:

```sh
node --test --test-isolation=none test/pro-experiences-shipbreakingYard.test.mjs
```

At the final source-freeze check, all 28 cases passed using real existing simulation, Rapier physics, combat attachments, economy, scanner, MassLine, and save-entity owners. The coverage includes:

- Three distinct assemblies, deterministic conditions, native asset proxies and admitted joints; acceptance keeps the inspected object and refusal/cancel spend nothing.
- Native tension transmits player force into the assembly; release retains original identity and momentum. The normal cursor acquisition and tether input latch that original.
- Attachment, proximity, custody, speed, and receiver checks; reduced price after combat damage; surviving pieces pay; repeat delivery and credit-callback reentry are rejected.
- Ordinary encounter/proximity discovery, first Ceres-station scan, scanner pulse including its real null-target result, every catalog/module choice, and repeated disconnect verbs reaching the correct fitting. The actual world composition checks live and sleeping asteroid clearance, complete site reservations, idle native stability, and manual-flight waypoint handling.
- Complete recovery of all three layouts, partial hazard failure, leave/return, abandonment cancellation/confirmation, new-lot identity, cold JSON restore, synchronous native-cut save, sector-shelving callback saves, and a paid body captured by the real save owner before retirement.
- Prompt cleanup and semantic sound cooldown/reset, including claimed presentation drains across audio destroy/reinitialization. Real Three geometry is finite and bounded, does not mutate the simulation, stays stationary for unchanged input under reduced motion/flash, hides after docking/sector change, and disposes cleanly. Every receiving-ring stroke is inside the native circular threshold.
- A nonzero frame-origin regression checks every used annotation vertex, including an already frame-local Object3D, so global projection and double conversion are both exercised.

## Concrete limits for local acceptance

This source package omits binary assets, the large renderer source, and other files by design. A separate temporary browser fixture fetched only the seven original authored GLBs and Basis decoder WASM from this exact base; each git blob hash was verified. Native Three GLTF, meshopt and Basis loaders decoded the actual models. The fixture reproduced the packaged-prop max-axis fit and the native camera's 50° field of view, 60° tilt and 144 WU chase distance, with a declared neutral inspection light rig. Seven screenshots were opened and inspected: all three assembled lots, the receiving ring, released components, a 240 WU wider view, and a nonzero frame-origin view. The bodies remained distinct; selected, connected, unsafe and free shapes remained readable; the receiver cue matched its circular gate. Thin spars and the governor were comparatively dark under that fixture lighting. These observations establish isolated model fit and cue readability, not acceptance of production lighting or the whole game.

No full browser/Electron gameplay run, listening session, production-frame timing, or integrated HUD judgment is claimed. Several receiver/order tests position fixtures directly to isolate the native gates; separate real-line tests establish physical motion. Local acceptance should still fly the entire approach-to-handover route and judge stopping distance, production camera composition, material/lighting readability, HUD overlap, and pacing.

The shared registry/manifest, save, worker bridge, render hook, and generated encounter index are integration work expressly excluded from this candidate's editable scope. Without those additions the stock master registry does not initialize this occupation. The production feature and its concrete adapters are supplied; the integrated whole-game experience must be accepted in the local full-asset environment.
