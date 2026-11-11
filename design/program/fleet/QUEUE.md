# Fleet queue

States: `READY` (anyone of that tier may take it) · `TAKEN <who>` · `BUILT <hash>` (worker says
done) · `DONE` (lead reviewed) · `REDO <one sentence>` (back to READY with a note) · `HOLD` (waits
on another row). Tier: L = lead only, D = Devin SWE-2 Max or better, S = any worker.

Order follows `10_THE_GAME.md` §6: the floor, then Swarm finished, then the first hour, then the
five towns. Take rows top-down within your tier.

## Calibration (first run of each backend — sizes the rest of the queue)

| ID | Tier | Commission | Job | State |
|---|---|---|---|---|
| G19-01-class-up-moment | D | EC-G19 | The rope's class-up shows a plate and the cable changes | TAKEN devin1 |
| G08-01-enemies-wear-their-sheet | D | EC-G08 | Swarm enemies drawn at their sheet scale and hue | TAKEN devin2 |
| G17-01-swarm-start-at-round | D | EC-G17 | `?swarmRound=N` and `--start-round=N` | TAKEN devin3 |
| PL-08-applause | S | plants | Station lamps flash at a slingshot kill | TAKEN deepseek |
| PL-05-road-rage | S | plants | A twice-shoved civilian shoves back, then runs | TAKEN flash |
