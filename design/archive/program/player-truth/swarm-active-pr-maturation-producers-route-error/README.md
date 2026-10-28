# Interrupted Swarm active check

Captured candidate: `8fa91b1e7`. This attempt did not reach recorded preparation/spawn.
The actor waited for “Launch round 1” while an actual REARM screen offered an enabled
“Keep current loadout” control. The retained screenshot records that public screen.

The process then exhausted its Node heap during the final pre-play trace drain and exited 1.
It produced no active verdict, trace or contact sheet. The attached log and route image are
the original outputs; they are not a calculated gameplay verdict or proof of active Swarm.
The native ruleset of this interrupted attempt was not retained.

`561a1121e` handles enabled public preparation choices, requires the requested native ruleset
at active admission, begins serialized drains at reader installation, and bounds only recent
non-playing preparation frames while retaining active openings and events. A fresh mode check
supplies the resulting live verdict.
