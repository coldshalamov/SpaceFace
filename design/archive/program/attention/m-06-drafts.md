# M-06 drafts — racing

## Drifter

Every track has the guy who swears the qualifying mark was soft. A contract written by
that guy — "the ledger clerk who timed your qualifier wants his cr back" — gives the
second belt run a grudge without inventing a rival model. Two laps, tighter purse,
title that sounds like a bet.

## Archivist

Vesper's mark already says "the belt mark is already posted." The callback contract
answers it: the person who *posted* the mark wants the rematch adjudicated. Same levelId
(level_textile_outbound), same course — the world remembers your lap because the ledger
remembered it.

## Skeptic

Race contracts are board offers: `racingOfferFor(contractId)` wraps the row. Adding a
contract adds one offer — no new mechanics, no camera changes (`steerLock: 'racing'`,
racingKind 'laps' already shipped). Poke-check: brief/summary/gridLine stay in the same
voice, id is unique, course is an existing level.

Review: drafts ✓3 — recorded.
