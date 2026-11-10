# GRAPHICS_3D unit 4 — chase review

Mining drone and conveyor barge at the live chase camera. Did not run the opening-route remaster mill.

## Live places

| Object | D=144 | D=58 | Read |
|---|---|---|---|
| Mining drone | speck (~66 px) | 5% width | parked cutter with hazard plate, hull, tool |
| Conveyor barge | 32% width | fills the frame | forked boom, three containers on deck, hazard rails, drive block |

These are already manufactured Helios places, not a diamond or a box stack. Chase looks down and still reads job and construction. Small drone manufacturing is judged at D=58, same as the nav buoy.

Disposition: **KEEP** the live place files. No same-slot replace.

## Flying drone cousin

Player and field mining drones still draw as a diamond body, stick arms, and a glow. That is a separate code-built object. Point it at the parked drone later. Do not hook it while hitch owns the render thread.

Chase cameras: `play_chase`, `play_chase_abeam`, `play_chase_close`.
