# CLAIM — camera-clearance-never-roof-exclude

Quiet `camera.follow` clearance residual after #63: undersized field rocks still
re-entered the structural floor walk every WU (pos-keyed cache miss → re-reject).
Sticky never-roof + structural exclude keeps them off the per-frame walk until
scale changes.

Primary KPI: portable microbench ≥1.5× (soft-GPU fps not claimed).
