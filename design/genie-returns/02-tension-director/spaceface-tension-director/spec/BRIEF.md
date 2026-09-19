# The tension director — sessions with a shape

Our game has no sense of drama. We instrumented long sessions and the shape of play is
a flat line: hour one and hour eight are literally the same activities with the same rhythm.
Threats, opportunities and quiet arrive by accident, not intent. Nothing escalates. Nothing
breathes. Nothing ever saves a twist for the right moment. Two things make human-made games feel
authored: a world that remembers (separate project), and a director constantly deciding what the
next thirty minutes should feel like — tension, release, escalation, calm — so the player
unknowingly lives inside a story shape.

That director does not exist here. What does exist: an encounter director that commands spawns, a
difficulty table, and a rich event stream describing everything happening to this specific
player. Design and build the missing piece: the thing that reads the recent past and shapes the
immediate future, using only levers the simulation already has. It must be deterministic, bounded,
and inspectable. Ship it as a working module; we will measure it against our session-shape bars.

## What is in this packet

- repo/docs/program-compass/2026-09-ACTUAL-GAME.md — Measurement report: flat session shape, hour-1 = hour-8
- repo/src/core/eventBus.js — The event bus
- repo/src/core/registry.js — How systems register and run
- repo/src/core/activityScheduler.js — Existing activity scheduling
- repo/src/ai/director.js — The current encounter director
- repo/src/systems/encounterDirector.js — The encounter spawn pipeline
- repo/src/data/difficulty.js — Difficulty data

## Ground rules

Read CONVENTIONS.md first — architecture laws, deliverable contract, and how to spend
your hour. You may pull a few individual files from https://github.com/coldshalamov/SpaceFace (commit de9f3f1fc)
if a signature matters, but everything essential is here. We would rather have one
brilliant finished thing than a broad sketch: spend the budget creating.
