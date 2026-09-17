<!-- LIFETIME: LIVING LEDGER. One row per tuning job; update status as jobs dispatch and land. -->
# Tuning jobs — small attention, big feel

Deep-research ledger (2026-09-16) of bounded tuning jobs at the player↔ship interaction point:
controls, flight, combat, feedback, animation-adjacent presentation. Built from the Feel Contract
audit (`design/FEEL_CONTRACT.md` — bars B1–B13 and the C experiment bands), the flow-risk manifest
(`GAMEPLAY_FLOW_RISKS.md`), and the camera manifest. Each job is self-contained enough to hand to
a terminal worker: the spot, the wonk, the tune, the bar it must move, and the guards.

House rules that bind every job here: fixed-seed printed numbers before/after (never captures);
a test that pins anti-vision behavior is a defect; never add drag; never clamp given momentum;
no content — tuning only; `implemented ≠ focused_green ≠ route_accepted ≠ integrated`.

**Dispatch hygiene (owner 2026-09-16 — no worktree litter):** every dispatched job runs in an
isolated worktree registered in the delegation ledger, and the ledger entry carries a CLEANUP
GATE: after review and a durable integration-or-rejection, remove the worktree, delete the
worker branch (named ref only, merged-or-evidenced), and delete the packet/session files. A job
is not done while its worktree is still registered. Pre-existing litter is triaged under
`design/program/WORKTREE_RECOVERY.md` (disposition first, delete only named safe refs) — never
bulk-pruned.

| # | Job | The spot → the wonk | The tune | Bar to move | Status |
|---|---|---|---|---|---|
| 1 | **Velocity-vectoring assist** (Feel Contract C band, "try first") | Below the speed cap, strafing does nothing to your velocity vector — the ship slides; turning at cruise needs the whole yaw arc. Two outside designers endorsed a lateral force that rotates the velocity vector toward the nose (~1.6 rad/s at low speed → 0.9 at cap, **zero above cap**), making "turn NOW" and "earned speed is kept" coexist. Never tried. | `src/core/flight/propulsionKernel.js` + player-only `flightV3.js` wiring (off under autopilot/tether; `settings.gameplay.velocityVectoring` opt-out). | **INTEGRATED `681f39795`** (fable-5.1 xhigh delegated run, controller-reviewed). Seed 4242: redirect90 1.333→0.950 s, twitch90 2.700→1.283 s, turn radius 1.145→1.075 screens; B1 1.000/1.000/1.002, B2 tick-identical, B13 unchanged. Also repaired the governor-integrity weave harness (fence contamination, now self-asserted) and re-recorded the 47-A v3 golden per §10d (player takes 5 fewer hits — the dodge effect). | **DONE** |
| 2 | Cruise chip-damage denial + stumble re-arm | `src/systems/cruise.js:23-26` — ANY damage drops the 3 s cruise charge and arms a 0.5 s 60%-yaw stumble, re-arming per hit. A plinking scout permanently denies fast travel. | Damage threshold (only meaningful hits drop) + stumble re-arm cooldown (~1.5 s). Keep drop-on-real-hit design intact. | Scripted 0.6 s-interval chip harasser: cruise-denied time ~100% → ~0; a ≥10% hull hit still drops + stumbles. | open |
| 3 | Combat juice involvement gate + duty budget | `src/render/feel.js:882-918` — shield-break/big-hit hitstop and FOV punch fire for ANY combatant anywhere, no rate limit. | Require player involvement or ≤~300 WU for hitstop/FOV; per-second juice budget; kill hitstop keeps priority. | Furball probe: timeScale-pinned fraction and FOV-envelope duty drop; player-own-fight juice unchanged. | open |
| 4 | Slow-time duty ledger + cap; input sampling floor | `flybyFocus.js` (75% legal slow-time duty, no refusal), `simulationRunner.js:46-52` (input sampling stretches ~2.9× under 0.35×). | Global slow-time duty cap (~40%/min) + accessibility/refusal option; measure inputToPhoton at 1× vs 0.35×; optional wall-clock sampling floor. | Printed duty ledger before/after; input latency histogram 1× vs slow-time. **Owner feel call on the cap number.** | open |
| 5 | AI doctrine target stickiness + signal bands | `combatDoctrine.js:97,356-357` + `aiPorts.js:1021,1415` + `squad.js:341-355` — confidence gate (same 0.55 enter/exit) resets attack states; 6 WU slack instant tow abort; squad focus argmax with no incumbent margin. Dueling enemies stutter and never commit; raiders lunge/grab/flee loop. | Incumbent margin in target selection + enter/exit bands + short dwell on the slack tag (the pattern squad tactics already use). | Fixed-seed circling-duel probe: doctrine/target/tow transitions per minute ~0; telegraph-cancel count → 0. | open |
| 6 | Dock/gate prompt hysteresis | `src/core/physics.js:792-834` — single thresholds; prompt strobes during final approach; overlapping stations flip target. | 1.15× exit bands + stickier target identity. | Approach probe: prompt toggles during one docking → 0. | open |
| 7 | Camera speed-opening recalibration | `src/render/camera.js` speed zoom — B3 says visible depth must grow ≥1.5× at 2× cruise and ≥2.5× at 3×; live ceiling is 1.55× ("wrong order of magnitude" per C band). Owner approved speed zoom-outs as good. | Open the exceptional-speed camera curve to the B3 targets, monotonic, reduced-motion-aware. | `feel.screen_crossing` scenario: depth at 2×/3× cruise vs bar; hull ≥4% frame width holds. | open |
| 8 | Hitstun curve unification (B11) | `src/combat/impulseKernel.js` — one law exists but per-source exceptions remain; re-trigger extends with no diminishing returns (NPC stunlock possible). | One T(ΔV/cruise, mass fraction) for guns/throws/flings/collisions; DR on re-trigger; no HP-scaling (adopted refusal); NPC thruster recovery 1.5–3 s. | `feel.hitstun_curve` scenario: same-fraction hits from different verbs yield the same T; retrigger chain bounded. | open |
| 9 | Shove displacement + kit balance (B5, PQ-137.05 owed) | Shove magnitude MET; the 2 s displacement clause and Crucible kit-balance clause are open. | Tune the remaining shove verbs to displace ≥1 screen depth in 2 s without firing; Crucible loadout check. | B5 scenario numbers at the shipping camera. | open |
| 10 | Trauma/shake per-second budget | `camera.js` additive trauma clamps at 1.0; sustained player-targeted fire reads as continuous max rattle. | Per-second trauma budget with decay priority so discrete impacts read. | Furball probe: time-above-0.8-trauma fraction bounded; single-hit peaks preserved. | open |
| 11 | Progression receipts | `ladderShared.js:38-45`, `ships.js:1935-1969`, `floatingText.js:204-208` — rank-up, module install, and faction tier crossings are silent. | Listeners only (the A12 pattern): toast/chime per receipt, importance-gated. | Assertion checklist: each crossing produced ≥1 receipt. | open |
| 12 | FloatingText pool under load | `src/ui/floatingText.js:90-115` — 56-node pool stolen mid-read in furballs; offscreen hits steal nodes. | Cull offscreen before steal; aggregate per target; raise pool or age-bucket. | Furball census: player-relevant numbers' visible lifetime ≥ their read time. | open |
| 13 | Impact audio weight + massline snap (B9, PQ-139) | Collision audio is one clamped sample; massline release lacks a time-domain snap. | Pitch/weight by exchanged momentum; release snap. | B9: ≥1 octave pitch and ≥12 dB spread scout-kiss vs freighter-broadside; release snap visible in the waveform probe. | open |
| 14 | World-reaction timing polish (B10) | PQ-138 listeners exist; reaction times need tuning to bar (10 s wreck choice, 30 s cargo attraction, 3 s civilian avoidance). | Tune reaction clocks to bar; verify on the default route. | `world.reaction_trio` scenario numbers. | open |
| 15 | Input edge-verb buffering | `src/systems/input.js` — verb presses landing on a tick where a screen just opened are dropped, not queued. | ~150 ms edge buffer for flight verbs across modal transitions. | Probe: press-during-open lost-input count → 0; no double-fires. | open |

Dispatch order rationale: 1 is the highest-leverage *handling* tune endorsed but never tried; 2-4
are the verified flow pains with the smallest blast radius; 5 is the biggest readability win in
combat; the rest follow severity-per-risk. Feel calls that stay with the owner: slow-time cap
number (4), cryo-lock depth, anchor-snare player cap, interdiction pre-read.
