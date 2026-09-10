DONE  DEAD-WIRE-S — Tether-action lock, cancel, and deny now play their authored cues, and a stored offline receipt shows its real numbers once when you load.

WHAT I FOUND     Combat already emitted four action-lifecycle events with authored cue IDs, and automation already stored a full away-from-keyboard receipt, but nothing listened, so raider locks and passive-income payoffs were silent.

WHAT I CHANGED   I subscribed the existing presentation/audio path to those events, authored only the lock/release/snap/denial/dash/burst recipes, and showed the stored receipt plus distress/repossession as toasts.

WHAT YOU WILL FEEL   When a raider locks a line on you, you hear the lock; when your own action is refused, one short line names the rule. Coming back after time away, one summary tells you what was earned, what upkeep cost, and what was lost, then it does not come back on the next load. The producer still fires its shorter “while away” toast on the same load, so the feed can show both for a moment.

THE NUMBERS      bar | before | after | target
combat.action cue beats/s at peak | seed 47 tether-raider attach+cancel+reject | 0 | 3 | about 4 or below
authored lock/cancel/reject cues played | 0 | 3 (attach.lock, cancel, reject) | lock and denial audible
offline summary shows stored 1200/400/1 | 0 reads | 1 toast then 0 on reload | once
quiet on purpose | — | start, end, reel.tick | not a wall of noise

FILES
src/systems/presentationOrchestrator.js
src/data/audioRecipes.js
src/audio/minimalActionAudio.js
src/ui/toasts.js
src/ui/automationPanel.js
test/dead-wire-action-lifecycle.test.mjs
test/dead-wire-offline-receipt.test.mjs
design/program/roadmap/receipts/DEAD-WIRE-FIX-2026-09-10-REPORT.md

CHECKS
npm run check:baseline  ENTRY 12/15 (red: pq020-ceres-topology, sim-v3 hash cf864ee…, sim hash 371585f…)  EXIT same three reds, same hashes, list not longer
npm run check:combat  PASS (grammar 8/8 + sg03 save-reload)
node --test test/dead-wire-action-lifecycle.test.mjs test/dead-wire-offline-receipt.test.mjs  PASS 8/8
  peak 3 combat.action cue beats/s; played combat.action.attach.lock, combat.action.cancel, combat.action.reject

UNPROVEN
Live Web Audio playback of the new synth recipes (tests assert recipe IDs and audio:cue, not a speaker).
I did not open the running game. Automation’s own catchup toast still exists on save:loaded; I did not edit automation.js.
Sling release, cut snap, and burst fire recipes exist and will play when those actions happen; the seed-47 raider scenario did not fire them.
