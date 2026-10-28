<!-- LIFETIME: ACTIVE_RECEIPT -->
# PQ-169.00 — Daily seed and local board

```text
DONE  PQ-169.00 — two machines on the same UTC day get the same daily run, and today's score stays on a local board when you come back.

WHAT I FOUND     The Crucible already remembered seeds and records, but each machine rolled its own number and nothing kept a day's best.

WHAT I CHANGED   Today's Daily now picks one seed from the UTC date, locks it on the door, and writes that day's score and wave onto the existing local record. Steam is still a named stub. Settlement consumes the daily stamp so a later free run cannot inherit today's board.

WHAT YOU WILL FEEL   Open Crucible, choose Daily, and the seed is today's — the same one everyone else has. Finish a run and Today on the door shows your score and wave; close the game and they are still there. Swarm and Gauntlet still let you pick a seed. There is no online board, no ghost, and no weekly twist yet.

THE NUMBERS      bar | before | after | target
                 same UTC day, two clocks (23:59:59Z and 00:00:00Z), two storages | no helper | both 1537801443 | identical uint32
                 next UTC day (2026-09-07T00:00:00Z) | untested | 1521023824 | different seed
                 daily board after settle + fresh load + second storage JSON | 0 rows | score 777, wave 12, seed 1537801443 | row persists
                 non-daily random seed writes today's board | n/a | 0 rows | 0
                 later non-daily settle after a daily settle | would inherit stamp | attempts stay 1, score stays 10 | stamp consumed

THE FRAMES       Not a camera leaf. The claim is a seed and a save bag, proven with an injected clock.

NEXT             PQ-169.01 Ghosts.
```

## Controller verification — 2026-09-07

Landed from `C:\sf-wt\pq169` onto primary after review. Consume-after-settle added so `queuedDailyDateKey` cannot write today's board onto a later free run. Focused tests on primary: `test/crucible-meta.test.mjs` + `test/crucible-record-band.test.mjs`. `npm run check:crucible:meta`. Headed `check:crucible:route` not re-run: Daily is a sibling control (`.sf-crd-daily`), not a third `.sf-crd-mode`, so the existing two-mode door assertion stays valid.
