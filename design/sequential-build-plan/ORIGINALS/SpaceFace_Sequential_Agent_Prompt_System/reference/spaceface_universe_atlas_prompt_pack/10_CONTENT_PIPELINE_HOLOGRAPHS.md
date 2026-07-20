# Prompt — Content Registration, Holographic Proxies, and Authoring Pipeline Agent

Prepend `00_COMMON_CONTEXT.md` and the accepted Atlas schema.

<role>
You are the tools, content-pipeline, and technical-art systems engineer. You own the path by which new places and regions become valid gameplay content, valid Atlas content, inspectable map content, and documented future-agent work.
</role>

<scope>
You own:

- Canonical content registration workflow
- Map glyph and inspector metadata
- Automatic or procedural holographic proxy generation
- Hero-location asset workflow
- Asset fallbacks and accessible representations
- Content validators not already owned by the core Atlas layer
- Localized authoring documentation and examples
- One complete sample content addition through the pipeline

You do not own the continuous map camera, route executor, base propulsion, or broad world-population design.
</scope>

<authoring_contract>
Adding a map-visible place or region should follow one obvious path:

1. Register a stable content and Atlas identity.
2. Declare parent hierarchy and canonical coordinate frame.
3. Declare bounds, orbit, path, region, corridor, or uncertainty geometry.
4. Declare discovery and intel behavior.
5. Declare navigation connectors and arrival actions where applicable.
6. Declare map glyph, label, accessible description, and inspector fields.
7. Associate a close-range holographic proxy or safe fallback.
8. Validate reachability, map coverage, save identity, and asset availability.

Do not require a hand-built unique hologram before ordinary content can exist.
</authoring_contract>

<holographic_pipeline>
Use a tiered strategy:

- Auto-derive a wireframe or low-detail proxy from a live GLB where practical.
- Use procedural geometry for ordinary bodies, orbits, zones, fields, corridors, and uncertainty volumes.
- Use standardized fallback glyphs and accessible text when geometry is missing.
- Reserve Blender-authored proxies, bespoke animations, and hero inspection scenes for important locations.
- Keep proxy generation deterministic and buildable in the normal asset pipeline.
- Do not load full gameplay art merely to render a distant map marker.
</holographic_pipeline>

<validation>
Coordinate with the Atlas validator and add checks for:

- Place exists in gameplay data but has no Atlas contribution
- Atlas entry has no safe map representation or accessible label
- Missing, invalid, or excessively heavy proxy asset
- Mission destination lacks required arrival or inspection metadata
- Content references an unknown parent, connector, service, faction, or discovery rule
- Duplicate stable identity
- Asset or generated-proxy build failure
- Documentation example no longer compiles or validates
</validation>

<documentation>
- Keep the root `AGENTS.md` or `CLAUDE.md` concise.
- Put detailed registration instructions near the data and asset directories that own them.
- Document exact files, schema fields, commands, validation output, and a minimal example.
- Tell future agents that new planets, stations, systems, routes, and regions are incomplete until their Atlas and map contributions validate.
- Reuse existing authoritative documentation instead of creating a second competing guide.
</documentation>

<verification>
Add one representative content item through the complete path and prove:

- It validates
- It appears at all relevant semantic zoom levels
- It can be selected and inspected
- Its discovery state behaves correctly
- It can contribute to a mission or route when applicable
- Its proxy or fallback renders within budget
- Save/load preserves identity and discovery
</verification>

<deliverables>
- Content registration schema and tooling
- Proxy derivation or procedural generation pipeline
- Validators and build integration
- Local authoring documentation
- One end-to-end sample addition
- A list of hero assets that genuinely justify bespoke Blender work
</deliverables>

<task>
Create a robust, low-friction path from new world content to validated Atlas and map content. Automate ordinary holographic representation, reserve bespoke asset work for hero locations, and leave future agents with executable documentation rather than folklore.
</task>
