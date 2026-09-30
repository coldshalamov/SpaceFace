# NXB-004 — damaged loaded ship stays controllable

DONE  NXB-004 — a damaged loaded ship still answers the stick through the real drive.
WHAT I FOUND     Breaking the drive did not change how hard the ship could push. The damage flag that means "no movement" was also the wrong tool, because it would have frozen the helm.
WHAT I CHANGED   The main drive's remaining health now limits thrust and braking. The turn thrusters stay stronger than that hurt drive. A dead drive is weak, not stuck.
WHAT YOU WILL FEEL   After the drive takes a hit, the ship still turns and still pushes, but it builds speed more slowly and brakes with less authority. Fixing the drive at a station does not yank the ship to a new speed. A loaded hull is still heavier than a light one.
THE NUMBERS      forward force on a dead drive | full catalog thrust | main-drive fraction above a 0.22 floor, yaw fraction higher | ship still steers
THE FEEL         The hit is in the drive, not in the stick. Not played on the full flight route in this session.
NEXT             the next open board row whose files are free

Route: implemented / route-unproven. The live flight step was driven in the focused test with a seeded ship, a dead drive, and an outside shove. A headed play of adventure damage, tow, and dock repair was not run.

NXI-015 and NXI-016 are open. The parent does not cut a tow or redraw the repair gauge. Reading the drive again does not heal it, and a repair changes the next force only.
