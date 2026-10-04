# Package tools

Run `python tools/validate_package.py` from any directory to validate the local delivery. It uses Python's standard library and does not test the game.

To regenerate art, install numpy, Pillow and trimesh in a separate environment, then run `python tools/render_concept_art.py`. No network access is required after dependencies are installed. The generator uses a local DejaVu Sans by default; on other systems set `SF20_FONT` and `SF20_FONT_BOLD` to available local font files. No fonts are distributed.

The generated GLBs are non-shipping form blockouts and remain in raw author-space coordinates. Rebuild them through the repository's Forge process; do not import this standalone renderer into the game.
