let meta = #{
    name: "model-polish-lanes",
    description: "Survey every 3D model family, lock the existing art direction, then optionally tune disjoint lanes in parallel",
    when_to_use: "Long-horizon graphics consistency. Survey is the default. args.act true adds light source-model tuning. Does not replace PQ-193, PQ-050, PQ-136, or PQ-049.05.",
    phases: [
        #{ title: "Survey", detail: "census, per-lane inspection, lock Lacquer and Starlight" },
        #{ title: "Classify", detail: "keep only safe tuning; heavy picture work stays on existing packets" },
        #{ title: "Polish", detail: "parallel lanes, source JSON only, off unless args.act is true" },
        #{ title: "Verify", detail: "reject silhouette changes and frozen files" },
        #{ title: "Report", detail: "write the map of what to tune, what to rebuild, and what landed" },
    ],
};

let census_schema = #{
    "type": "object",
    "required": ["contradictions", "notes"],
    "properties": #{
        "contradictions": #{
            "type": "array",
            "maxItems": 8,
            "items": #{ "type": "string" },
        },
        "notes": #{ "type": "string" },
    },
};

let finding_schema = #{
    "type": "object",
    "required": ["findings"],
    "properties": #{
        "findings": #{
            "type": "array",
            "maxItems": 12,
            "items": #{
                "type": "object",
                "required": ["path", "kind", "demoSafe", "summary", "packet"],
                "properties": #{
                    "path": #{ "type": "string" },
                    "kind": #{ "type": "string" },
                    "demoSafe": #{ "type": "boolean" },
                    "summary": #{ "type": "string" },
                    "packet": #{ "type": "string" },
                },
            },
        },
    },
};

let standard_schema = #{
    "type": "object",
    "required": ["direction", "allowed", "banned"],
    "properties": #{
        "direction": #{ "type": "string" },
        "allowed": #{
            "type": "array",
            "maxItems": 8,
            "items": #{ "type": "string" },
        },
        "banned": #{
            "type": "array",
            "maxItems": 8,
            "items": #{ "type": "string" },
        },
    },
};

let polish_schema = #{
    "type": "object",
    "required": ["edited", "skipped", "notes"],
    "properties": #{
        "edited": #{
            "type": "array",
            "maxItems": 24,
            "items": #{ "type": "string" },
        },
        "skipped": #{
            "type": "array",
            "maxItems": 24,
            "items": #{ "type": "string" },
        },
        "notes": #{ "type": "string" },
    },
};

let verdict_schema = #{
    "type": "object",
    "required": ["keep", "evidence"],
    "properties": #{
        "keep": #{ "type": "boolean" },
        "evidence": #{ "type": "string" },
    },
};

let land_schema = #{
    "type": "object",
    "required": ["committed", "summary"],
    "properties": #{
        "committed": #{ "type": "boolean" },
        "summary": #{ "type": "string" },
    },
};

fn as_text(value) {
    if value == () { return ""; }
    if type_of(value) == "string" { return value; }
    json_encode(value)
}

fn ends_with(text, suffix) {
    if type_of(text) != "string" || type_of(suffix) != "string" { return false; }
    let n = suffix.len();
    let m = text.len();
    if n == 0 || n > m { return false; }
    text.sub_string(m - n, n) == suffix
}

fn frozen_path(path) {
    if type_of(path) != "string" { return false; }
    if path.contains("kestrel") { return true; }
    if path.contains("hull_starter") { return true; }
    if path.contains("kestrel_borrowed_time") { return true; }
    false
}

fn lod_sibling(path) {
    if type_of(path) != "string" { return false; }
    path.contains("_lod1") || path.contains("_lod2")
}

fn banned_write(path) {
    if type_of(path) != "string" { return true; }
    if frozen_path(path) { return true; }
    if lod_sibling(path) { return true; }
    if path.contains("assets/ships/release/") { return true; }
    if path.contains("assets/ships/parts/textures/") { return true; }
    if path.contains("assets/ships/parts/blender/") { return true; }
    if path.contains("partsLibrary.js") { return true; }
    if path.contains("assetLoader.js") { return true; }
    if path.contains("illustratedSurface.js") { return true; }
    if path.contains("illustratedLivery.js") { return true; }
    if path.contains("bloom.js") { return true; }
    if path.contains("gameState.js") { return true; }
    if path.contains("registry.js") { return true; }
    if path.contains("NOW.md") { return true; }
    if path.contains("program-queue.json") { return true; }
    if ends_with(path, "/wasp.glb") { return true; }
    if ends_with(path, "/pelican.glb") { return true; }
    false
}

fn tuning_kind(kind) {
    kind == "consistency" || kind == "performance"
}

fn in_list(path, files) {
    if type_of(path) != "string" { return false; }
    for f in files {
        if path == f || ends_with(path, f) { return true; }
    }
    false
}

fn in_prefixes(path, prefixes) {
    if type_of(path) != "string" { return false; }
    if !ends_with(path, ".glb") { return false; }
    for p in prefixes {
        if path.contains(p) { return true; }
    }
    false
}

fn in_scope(path, lane) {
    if lane.mode == "prefix" { return in_prefixes(path, lane.files); }
    if lane.mode == "read" { return in_list(path, lane.files) || in_prefixes(path, lane.files); }
    in_list(path, lane.files)
}

fn join_lines(items) {
    let text = "";
    let first = true;
    for item in items {
        if !first { text += "\n"; }
        first = false;
        text += item;
    }
    text
}

fn map_get(result, field) {
    if result == () { return (); }
    if result.success != true { return (); }
    if result.output == () { return (); }
    try {
        if field == "findings" { return result.output.findings; }
        if field == "contradictions" { return result.output.contradictions; }
        if field == "notes" { return result.output.notes; }
        if field == "direction" { return result.output.direction; }
        if field == "allowed" { return result.output.allowed; }
        if field == "banned" { return result.output.banned; }
        if field == "edited" { return result.output.edited; }
        if field == "skipped" { return result.output.skipped; }
        if field == "keep" { return result.output.keep; }
        if field == "evidence" { return result.output.evidence; }
        if field == "committed" { return result.output.committed; }
        if field == "summary" { return result.output.summary; }
    } catch (err) {
        return ();
    }
    ()
}

fn census_prompt() {
    let p = "";
    p += "You are surveying SpaceFace 3D models. Read only. Do not edit any file. Do not launch Blender. Do not create a git worktree.\n";
    p += "Read these and compare them to the current selectors in src/render/partsLibrary.js, src/render/assetLoader.js, and src/data/ships.js:\n";
    p += "- design/program/MODEL_STOCKTAKE_MANIFEST.md (dated 2026-09-09)\n";
    p += "- design/program/MODEL_STOCKTAKE_PLAN.md\n";
    p += "- tools/blender/helios_remaster/INVENTORY.md (dated 2026-09-19)\n";
    p += "- design/program/WORLD_VISUAL_CENSUS.md if it exists\n";
    p += "Use grep and read_file. You may run a short node or npm command only if it prints reachability or admission facts. Do not start a dev server.\n";
    p += "The two inventories disagree: the stocktake says the opening picture is still tubes and kitbashes; the Helios inventory says 68 families were accepted. contradictions must be concrete sentences about which claim the live selectors still support. An empty contradictions list is valid only after you have read both documents and the selectors.\n";
    p += "Do not recommend a new art direction. Do not recommend editing Hitch or Kestrel. notes is a short paragraph a non-coder can read.\n";
    p
}

fn standard_prompt() {
    let p = "";
    p += "Read docs/visual-assets/ILLUSTRATED_GRAPHICS_STANDARD.md, docs/visual-assets/VISUAL_ASSET_PRODUCTION_STANDARD.md (the cost and LOD sections), and design/program/MODEL_STOCKTAKE.md sections 2 and 8. Use read_file.\n";
    p += "Lock the existing direction. direction must name Lacquer and Starlight and describe it in a few sentences: painted working craft, shared light, materials that stay different substances. Do not invent a new palette or a new style.\n";
    p += "allowed: at most 8 short strings. Only light source-model tuning: joining static primitives that share a material, dropping unused texture slots, and a role extra only where the material name is generic.\n";
    p += "banned: at most 8 short strings. Include new geometry, booleans, decimation, Hitch edits, quality cuts, impostors, factory-remaster swaps, worktrees, and editing release packages or shared textures.\n";
    p += "Do not edit files.\n";
    p
}

fn inspect_prompt(lane) {
    let p = "";
    p += "You are inspecting one SpaceFace 3D lane: ";
    p += lane.id;
    p += ".\nRead only. Do not edit files. Do not launch Blender. Do not create a worktree, junction, or copy of any model. Do not write a script into the repo. A temp node one-liner outside the repo is fine.\n";
    p += "Before you grade anything, read docs/visual-assets/ILLUSTRATED_GRAPHICS_STANDARD.md (the picture and the Continue section) and design/program/MODEL_STOCKTAKE.md section 2. Hitch is the floor. A valid GLB is not accepted art.\n";
    p += "Scope for this lane:\n";
    p += join_lines(lane.files);
    p += "\n";
    p += lane.brief;
    p += "\nFor each GLB in scope, print material names, material count, mesh count, triangle count, image count, and whether extras include spacefaceMaterialRole or spacefaceRemasterGeometry. Parse the GLB JSON chunk. Do not decode textures.\n";
    p += "Return at most 12 findings, worst first. kind is exactly one of: consistency, performance, broken-picture, shelf, packet.\n";
    p += "The loader already turns material names into roles, then guesses hull for most ships and places. A missing spacefaceMaterialRole extra is not, by itself, a finding. demoSafe is true only for a static join of primitives that already share one material, an image slot nothing samples, or one material whose name matches no role word and would be painted as hull by mistake. Name that material.\n";
    p += "A measured pattern: some files use well over 50 primitives for only a few thousand triangles (wreck bows, cold locker, whistle, some Span kits). The trade hub is about 1.7 million triangles and is not a JSON join. Do not mark decimation demoSafe. Node names are not leftover Cube or Cylinder names, so do not call a file a tube from the name.\n";
    p += "demoSafe is false for new shapes, floating parts, LOD files, selector changes, Hitch, and anything that needs Blender.\n";
    p += "packet is PQ-193, PQ-050, PQ-136, PQ-049.05, later, or an empty string. Use PQ-050 for buyable hull form. Use PQ-193 for world objects that still read as primitives or kitbash. Use later for distant LOD work.\n";
    p += "path is a repo-relative path with forward slashes. Never report a kestrel path, hull_starter, or a file outside this lane.\n";
    p += "If you did not render the model, do not call it beautiful or ugly. broken-picture requires structural evidence (a single primitive, mesh names that are raw primitives, or no material roles on a live object). Otherwise use packet and say the picture is unproven.\n";
    p += "An empty findings list is valid only after you parsed the files in scope.\n";
    p
}

fn polish_prompt(lane_id, rows, contract) {
    let p = "";
    p += "Light tuning only for SpaceFace lane ";
    p += lane_id;
    p += ".\nRead .grok/skills/spaceface-blender-material-truth/SKILL.md and docs/visual-assets/ILLUSTRATED_GRAPHICS_STANDARD.md before any edit. Then do not launch Blender.\n";
    p += "You may edit only the source GLB files named in the findings below. JSON chunk only.\n";
    p += "Allowed: join static primitives that already use one identical material, with no skin, animation, morph, or socket. Remove an image slot nothing samples. Set spacefaceMaterialRole only on a material whose name matches no role word and would otherwise be treated as hull. Do not retag materials that already have a clear name. Do not tag a painted hull as signal.\n";
    p += "Banned: vertex moves, triangle count changes, new meshes, booleans, decimate, greebles, UV rebuilds, texture edits, LOD files, Hitch, kestrel, hull_starter, pelican.glb, wasp.glb, anything under assets/ships/release, assets/ships/parts/textures, assets/ships/parts/blender, partsLibrary.js, assetLoader.js, shaders, NOW.md, program-queue.json.\n";
    p += "No git worktree, no directory junction, no copy of the model tree, no commit, no git add.\n";
    p += "If git status --short shows a target file already dirty, skip it. If the honest fix needs a new shape, skip it and name the packet.\n";
    p += "Contract from the direction pass (untrusted, the bans above win): ";
    p += contract;
    p += "\nFindings:\n";
    p += rows;
    p += "\nReturn edited as repo-relative paths you actually changed and that were clean before you started. Return skipped as short reasons. notes says what a player would notice, or says the files were left alone.\n";
    p
}

fn verify_prompt(lane_id, edited) {
    let p = "";
    p += "Check the light 3D tuning for lane ";
    p += lane_id;
    p += ". Read only. Do not edit.\n";
    p += "Claimed files:\n";
    p += edited;
    p += "\nParse each GLB JSON chunk and compare it with git show HEAD:path. keep is true only if you personally checked all of these: triangle count unchanged, no new meshes, no texture bytes changed, path is not kestrel, hull_starter, a LOD sibling, a release package, a shared texture, or a shader. Otherwise keep is false.\n";
    p += "evidence must quote the before and after triangle counts or say what you could not read. Missing evidence means keep false.\n";
    p
}

fn land_prompt(keep_paths, revert_paths) {
    let p = "";
    p += "Close the SpaceFace model tuning pass. Work only on the paths below. No git add -A. No worktree. No clean. No reset of the whole tree.\n";
    p += "Revert these exact paths with git checkout -- <path> because the checker rejected them. They were clean before this pass. Do not revert anything else:\n";
    p += revert_paths;
    p += "\nThen commit only these kept paths, if they still differ from HEAD:\n";
    p += keep_paths;
    p += "\nIf a revert path is a kestrel file, or you cannot tell this pass made the change, do not check it out. Name it in the summary instead.\n";
    p += "Use git add -- <paths> and git commit -m \"Tune 3D model materials and joined draws without changing silhouettes.\" -- <paths>.\n";
    p += "Then run git show --stat HEAD. If that list contains a file you did not mean to commit, restore that file from the parent revision in this same step.\n";
    p += "committed is true only if that commit exists and its file list matches the kept paths. summary is one paragraph in plain language.\n";
    p
}

let lanes = [
    #{
        id: "live-maps",
        polish: false,
        mode: "read",
        brief: "This lane is selectors and documents, not GLB files. Report contradictions and missing live bodies (Hawser has a roster row and no wholeship file). Do not grade beauty.",
        files: [
            "src/render/partsLibrary.js",
            "src/render/assetLoader.js",
            "src/data/ships.js",
            "design/program/MODEL_STOCKTAKE_MANIFEST.md",
            "design/program/MODEL_STOCKTAKE_PLAN.md",
            "tools/blender/helios_remaster/INVENTORY.md",
            "design/program/WORLD_VISUAL_CENSUS.md",
        ],
    },
    #{
        id: "helios-civilians",
        polish: true,
        mode: "list",
        brief: "Live Helios civilians and the liner. Do not open the *_production_v1 twins; those are another lane and must not be swapped in.",
        files: [
            "assets/ships/parts/wholeships/helios_lark.glb",
            "assets/ships/parts/wholeships/helios_cradle.glb",
            "assets/ships/parts/wholeships/helios_span.glb",
            "assets/ships/parts/wholeships/helios_arclight.glb",
            "assets/ships/parts/wholeships/survey_pin.glb",
            "assets/ships/parts/wholeships/ashline_rig.glb",
            "assets/ships/parts/wholeships/massline_express_liner_v1.glb",
            "assets/ships/parts/wholeships/massline_express_liner_v1_lod1.glb",
            "assets/ships/parts/wholeships/massline_express_liner_v1_lod2.glb",
        ],
    },
    #{
        id: "work-boats",
        polish: true,
        mode: "list",
        brief: "Live working boats. Tanker and inspection cutter are packaged bodies; say whether they are still kits. Do not open *_production_v1 twins.",
        files: [
            "assets/ships/parts/wholeships/apron_shuttle.glb",
            "assets/ships/parts/wholeships/ore_barge.glb",
            "assets/ships/parts/wholeships/prospector_skiff.glb",
            "assets/ships/parts/wholeships/repair_tender.glb",
            "assets/ships/parts/wholeships/rescue_lifter.glb",
            "assets/ships/parts/wholeships/salvage_cutter.glb",
            "assets/ships/parts/wholeships/scrap_sweeper.glb",
            "assets/ships/parts/wholeships/yard_tug.glb",
            "assets/ships/parts/wholeships/volatiles_tanker.glb",
            "assets/ships/parts/wholeships/inspection_cutter.glb",
        ],
    },
    #{
        id: "faction-kits",
        polish: true,
        mode: "list",
        brief: "Faction liveries. They must keep their own colors at distance. Do not fold them into the base Span or the base Wasp.",
        files: [
            "assets/ships/parts/wholeships/helios_span_dmc.glb",
            "assets/ships/parts/wholeships/helios_span_mts.glb",
            "assets/ships/parts/wholeships/helios_span_reach.glb",
            "assets/ships/parts/wholeships/wasp_free_militia.glb",
            "assets/ships/parts/wholeships/wasp_mts_escort.glb",
            "assets/ships/parts/wholeships/wasp_scn_patrol.glb",
        ],
    },
    #{
        id: "hostiles",
        polish: true,
        mode: "list",
        brief: "The selected hostile bodies, not the factory *_production_v1 twins of Dart, Lode, or Rig.",
        files: [
            "assets/ships/parts/wholeships/ashline_dart.glb",
            "assets/ships/parts/wholeships/ashline_lode.glb",
            "assets/ships/parts/wholeships/ashline_rig_corsair_blade.glb",
        ],
    },
    #{
        id: "flyable-roster",
        polish: true,
        mode: "list",
        brief: "Buyable hulls except Hitch. Form remasters belong to PQ-050, one ship at a time. This lane may only note form problems and mark JSON tuning as demoSafe. Include LOD siblings in the read, never as demoSafe. Hawser has no file here.",
        files: [
            "assets/ships/parts/wholeships/wasp_production_v1.glb",
            "assets/ships/parts/wholeships/wasp_production_v1_lod1.glb",
            "assets/ships/parts/wholeships/wasp_production_v1_lod2.glb",
            "assets/ships/parts/wholeships/hornet_production_v1.glb",
            "assets/ships/parts/wholeships/hornet_production_v1_lod1.glb",
            "assets/ships/parts/wholeships/hornet_production_v1_lod2.glb",
            "assets/ships/parts/wholeships/drifter_production_v1.glb",
            "assets/ships/parts/wholeships/drifter_production_v1_lod1.glb",
            "assets/ships/parts/wholeships/drifter_production_v1_lod2.glb",
            "assets/ships/parts/wholeships/bastion_production_v1.glb",
            "assets/ships/parts/wholeships/bastion_production_v1_lod1.glb",
            "assets/ships/parts/wholeships/bastion_production_v1_lod2.glb",
            "assets/ships/parts/wholeships/pelican_production_v1.glb",
            "assets/ships/parts/wholeships/pelican_production_v1_lod1.glb",
            "assets/ships/parts/wholeships/pelican_production_v1_lod2.glb",
            "assets/ships/parts/wholeships/mule_production_v1.glb",
            "assets/ships/parts/wholeships/mule_production_v1_lod1.glb",
            "assets/ships/parts/wholeships/mule_production_v1_lod2.glb",
            "assets/ships/parts/wholeships/atlas_production_v1.glb",
            "assets/ships/parts/wholeships/atlas_production_v1_lod1.glb",
            "assets/ships/parts/wholeships/atlas_production_v1_lod2.glb",
            "assets/ships/parts/wholeships/ranger_production_v1.glb",
            "assets/ships/parts/wholeships/ranger_production_v1_lod1.glb",
            "assets/ships/parts/wholeships/ranger_production_v1_lod2.glb",
            "assets/ships/parts/wholeships/ironback_production_v1.glb",
            "assets/ships/parts/wholeships/ironback_production_v1_lod1.glb",
            "assets/ships/parts/wholeships/ironback_production_v1_lod2.glb",
            "assets/ships/parts/wholeships/warden_production_v1.glb",
            "assets/ships/parts/wholeships/warden_production_v1_lod1.glb",
            "assets/ships/parts/wholeships/warden_production_v1_lod2.glb",
            "assets/ships/parts/wholeships/colossus_production_v1.glb",
            "assets/ships/parts/wholeships/colossus_production_v1_lod1.glb",
            "assets/ships/parts/wholeships/colossus_production_v1_lod2.glb",
            "assets/ships/parts/wholeships/leviathan_production_v1.glb",
            "assets/ships/parts/wholeships/leviathan_production_v1_lod1.glb",
            "assets/ships/parts/wholeships/leviathan_production_v1_lod2.glb",
        ],
    },
    #{
        id: "shelf-twins",
        polish: false,
        mode: "list",
        brief: "Factory duplicates and blocked shells. Verdict is shelf. demoSafe must be false. Do not recommend wiring these over the live file.",
        files: [
            "assets/ships/parts/wholeships/pelican.glb",
            "assets/ships/parts/wholeships/wasp.glb",
            "assets/ships/parts/wholeships/ashline_dart_production_v1.glb",
            "assets/ships/parts/wholeships/ashline_lode_production_v1.glb",
            "assets/ships/parts/wholeships/ashline_rig_production_v1.glb",
            "assets/ships/parts/wholeships/helios_lark_production_v1.glb",
            "assets/ships/parts/wholeships/helios_cradle_production_v1.glb",
            "assets/ships/parts/wholeships/helios_span_production_v1.glb",
            "assets/ships/parts/wholeships/ore_barge_production_v1.glb",
            "assets/ships/parts/wholeships/repair_tender_production_v1.glb",
            "assets/ships/parts/wholeships/salvage_cutter_production_v1.glb",
            "assets/ships/parts/wholeships/survey_pin_production_v1.glb",
        ],
    },
    #{
        id: "places-route",
        polish: true,
        mode: "list",
        brief: "Objects the opening routes put near the player. The old stocktake called several of these tubes. Re-prove that from the file, do not copy the old sentence.",
        files: [
            "assets/ships/parts/places/place_gate_jump_ring.glb",
            "assets/ships/parts/places/place_mining_drone.glb",
            "assets/ships/parts/places/place_47a_rescue_capsule.glb",
            "assets/ships/parts/places/place_nav_buoy.glb",
            "assets/ships/parts/places/place_lane_beacon.glb",
            "assets/ships/parts/places/place_lane_pin.glb",
            "assets/ships/parts/places/place_cargo_pod_standard.glb",
        ],
    },
    #{
        id: "places-stations",
        polish: true,
        mode: "list",
        brief: "Station bodies and the three trade-hub overlays. The trade hub was already compacted; do not recommend shrinking it again unless the JSON shows a real unused image or a duplicate material.",
        files: [
            "assets/ships/parts/places/place_station_trade_hub.glb",
            "assets/ships/parts/places/place_station_military.glb",
            "assets/ships/parts/places/place_station_billboard.glb",
            "assets/ships/parts/places/place_station_blackmarket.glb",
            "assets/ships/parts/places/place_station_fab.glb",
            "assets/ships/parts/places/place_station_mining.glb",
            "assets/ships/parts/places/place_station_refinery.glb",
            "assets/ships/parts/places/place_station_research.glb",
            "assets/ships/parts/places/var_station_trade_hub_scn_overlay_v01.glb",
            "assets/ships/parts/places/var_station_trade_hub_mts_overlay_v01.glb",
            "assets/ships/parts/places/var_station_trade_hub_free_overlay_v01.glb",
        ],
    },
    #{
        id: "places-navigation",
        polish: true,
        mode: "list",
        brief: "Lane furniture. Same construction language as the ships. No cube feet.",
        files: [
            "assets/ships/parts/places/place_tally_post.glb",
            "assets/ships/parts/places/place_claim_mark.glb",
            "assets/ships/parts/places/place_cold_locker.glb",
            "assets/ships/parts/places/place_ash_pin.glb",
            "assets/ships/parts/places/place_whistle.glb",
            "assets/ships/parts/places/place_memorial_array.glb",
            "assets/ships/parts/places/place_interdiction_buoy.glb",
            "assets/ships/parts/places/place_transponder_gate.glb",
            "assets/ships/parts/places/place_worklight_tower.glb",
            "assets/ships/parts/places/place_sensor_mast.glb",
        ],
    },
    #{
        id: "places-industry",
        polish: true,
        mode: "list",
        brief: "Docks, claim outposts, and yard hardware. Grade the live file, not the Blender source next door.",
        files: [
            "assets/ships/parts/places/place_breakaway_fork.glb",
            "assets/ships/parts/places/place_breakaway_sp07.glb",
            "assets/ships/parts/places/place_claim_outpost_base.glb",
            "assets/ships/parts/places/place_claim_outpost_bastion.glb",
            "assets/ships/parts/places/place_claim_outpost_catcher.glb",
            "assets/ships/parts/places/place_claim_outpost_fence.glb",
            "assets/ships/parts/places/place_claim_outpost_refinery.glb",
            "assets/ships/parts/places/place_claim_outpost_relay.glb",
            "assets/ships/parts/places/place_container_rack.glb",
            "assets/ships/parts/places/place_conveyor_barge.glb",
            "assets/ships/parts/places/place_conveyor_truss.glb",
            "assets/ships/parts/places/place_dock_interior.glb",
            "assets/ships/parts/places/place_dock_interior_grit.glb",
            "assets/ships/parts/places/place_dock_interior_military.glb",
            "assets/ships/parts/places/place_drill_platform.glb",
            "assets/ships/parts/places/place_extraction_mast.glb",
            "assets/ships/parts/places/place_freight_platform.glb",
            "assets/ships/parts/places/place_improvised_dock.glb",
            "assets/ships/parts/places/place_maintenance_gantry.glb",
            "assets/ships/parts/places/place_radiator_bank.glb",
            "assets/ships/parts/places/place_scrap_cage.glb",
            "assets/ships/parts/places/place_slurry_tank.glb",
            "assets/ships/parts/places/place_transfer_arm.glb",
        ],
    },
    #{
        id: "places-rocks",
        polish: true,
        mode: "prefix",
        brief: "Authored asteroid GLBs only. The five common rocks are code-built and belong to the procedural lane.",
        files: [
            "assets/ships/parts/places/place_asteroid_",
        ],
    },
    #{
        id: "places-wrecks",
        polish: true,
        mode: "list",
        brief: "Named wreck places. Paint, soot, glass, and torn metal should already be different materials. Do not cover them with one dirt shader.",
        files: [
            "assets/ships/parts/places/place_dead_hulk.glb",
            "assets/ships/parts/places/place_debris_chunk.glb",
            "assets/ships/parts/places/place_ceres_bait_wreck.glb",
            "assets/ships/parts/places/place_ceres_grave_shard.glb",
            "assets/ships/parts/places/place_landmark_wreck_cathedral.glb",
        ],
    },
    #{
        id: "pods",
        polish: true,
        mode: "prefix",
        brief: "Pods only. Cargo and the evidence spindle are player-visible. Utility and repair stay kit unless the JSON shows a cheap duplicate material.",
        files: [
            "assets/ships/parts/pods/",
        ],
    },
    #{
        id: "weapons",
        polish: true,
        mode: "prefix",
        brief: "The six authored weapon models. They should read as mechanisms, not as glowing bars.",
        files: [
            "assets/ships/parts/weapons/",
        ],
    },
    #{
        id: "kit-parts",
        polish: true,
        mode: "prefix",
        brief: "Modular kit. These are parts, not missing ships. Never touch hull_starter. demoSafe only for duplicate materials or missing roles.",
        files: [
            "assets/ships/parts/hulls/",
            "assets/ships/parts/cockpits/",
            "assets/ships/parts/engines/",
            "assets/ships/parts/fins/",
            "assets/ships/parts/gear/",
            "assets/ships/parts/greebles/",
        ],
    },
    #{
        id: "works",
        polish: true,
        mode: "prefix",
        brief: "Asteroid Works place models. Same material language as the stations. Do not invent a second works style.",
        files: [
            "assets/ships/parts/works/",
        ],
    },
    #{
        id: "wreck-pack",
        polish: true,
        mode: "prefix",
        brief: "Aftermath sources under the wreck pack. Do not edit the maps folder. Paint, soot, glass, and torn metal stay different materials.",
        files: [
            "assets/incubator/wreck_aftermath_pack/source/",
        ],
    },
    #{
        id: "procedural",
        polish: false,
        mode: "read",
        brief: "Code-built rocks and the shared surface shaders. Read only. Do not propose a new shader, a quality cut, or a second outline pass. Note if fake hull relief can still draw on top of a model that already has real panels.",
        files: [
            "src/render/visualFactory.js",
            "src/render/objectSpaceGeology.js",
            "src/render/illustratedHullLayout.js",
            "src/render/authoredMaterialProfiles.js",
            "src/render/industrialMaterialFamilies.js",
        ],
    },
];

let act = false;
let only = [];
if args != () {
    if args.act == true { act = true; }
    if args.lanes != () { only = args.lanes; }
}

let active = [];
if only.len() == 0 {
    active = lanes;
} else {
    for lane in lanes {
        let wanted = false;
        for name in only {
            if name == lane.id { wanted = true; }
        }
        if wanted { active.push(lane); }
    }
}

if active.len() == 0 {
    pause("verification", "args.lanes matched no model lane.");
}

let spend = budget();
log("model lanes " + active.len().to_string() + ", act " + as_text(act) + ", budget " + spend.remaining.to_string());

phase("Survey");
let jobs = [];
jobs.push(#{
    prompt: census_prompt(),
    label: "census",
    capability_mode: "execute",
    output_schema: census_schema,
});
jobs.push(#{
    prompt: standard_prompt(),
    label: "direction",
    capability_mode: "read-only",
    output_schema: standard_schema,
});
for lane in active {
    jobs.push(#{
        prompt: inspect_prompt(lane),
        label: "inspect:" + lane.id,
        capability_mode: "execute",
        output_schema: finding_schema,
    });
}
let surveyed = parallel(jobs);

let census = ();
let direction = ();
if surveyed.len() > 0 { census = surveyed[0]; }
if surveyed.len() > 1 { direction = surveyed[1]; }

let contradictions = map_get(census, "contradictions");
if contradictions == () { contradictions = []; }
let census_notes = as_text(map_get(census, "notes"));
let direction_text = as_text(map_get(direction, "direction"));
if direction_text == "" {
    direction_text = "Lacquer and Starlight stays the direction: painted working craft, shared light, and materials that remain different substances. This pass does not invent a new look.";
}
let contract = json_encode(#{
    direction: direction_text,
    allowed: map_get(direction, "allowed"),
    banned: map_get(direction, "banned"),
});

phase("Classify");
let tuning = [];
let rebuilds = [];
let shelf_rows = [];
let looked = [];
let dropped = 0;
let seen = [];

let lane_index = 0;
for lane in active {
    let slot = lane_index + 2;
    lane_index += 1;
    if slot >= surveyed.len() {
        log("missing inspect result for " + lane.id);
    } else {
        let found = map_get(surveyed[slot], "findings");
        if found == () { found = []; }
        for f in found {
            let fpath = "";
            if f != () {
                try {
                    fpath = f.path;
                } catch (err) {
                    fpath = "";
                }
            }
            if type_of(fpath) != "string" || fpath == "" {
                dropped += 1;
            } else if frozen_path(fpath) || !in_scope(fpath, lane) {
                dropped += 1;
                log("dropped out of lane " + lane.id + ": " + fpath);
            } else {
                let dup = false;
                for prior in seen {
                    if prior == fpath { dup = true; }
                }
                if dup {
                    dropped += 1;
                } else {
                    seen.push(fpath);
                    let row = #{
                        lane: lane.id,
                        path: fpath,
                        kind: as_text(f.kind),
                        demoSafe: f.demoSafe == true,
                        summary: as_text(f.summary),
                        packet: as_text(f.packet),
                    };
                    if row.kind == "shelf" {
                        shelf_rows.push(row);
                    } else if lane.polish == true && row.demoSafe && tuning_kind(row.kind) && !banned_write(row.path) {
                        tuning.push(row);
                    } else if lane.polish != true {
                        looked.push(row);
                    } else {
                        rebuilds.push(row);
                    }
                }
            }
        }
    }
}

log("tuning " + tuning.len().to_string() + ", rebuilds " + rebuilds.len().to_string() + ", shelf " + shelf_rows.len().to_string() + ", looked " + looked.len().to_string() + ", dropped " + dropped.to_string());

phase("Polish");
let polish_lanes = [];
let polish_results = [];
if !act {
    log("Polish is off. The report lists tuning candidates. Pass act true to edit.");
} else if tuning.len() == 0 {
    log("No safe tuning rows. Models were not edited.");
} else {
    let polish_jobs = [];
    for lane in active {
        if lane.polish == true {
            let rows_text = "";
            let count = 0;
            for row in tuning {
                if row.lane == lane.id {
                    count += 1;
                    rows_text += row.path;
                    rows_text += " | ";
                    rows_text += row.kind;
                    rows_text += " | ";
                    rows_text += row.summary;
                    rows_text += "\n";
                }
            }
            if count > 0 {
                polish_lanes.push(lane.id);
                polish_jobs.push(#{
                    prompt: polish_prompt(lane.id, rows_text, contract),
                    label: "polish:" + lane.id,
                    capability_mode: "execute",
                    output_schema: polish_schema,
                });
            }
        }
    }
    if polish_jobs.len() > 0 {
        polish_results = parallel(polish_jobs);
    }
}

phase("Verify");
let kept = [];
let revert = [];
let unsafe = [];
let verify_notes = [];
if polish_lanes.len() == 0 {
    log("Nothing to verify.");
} else {
    let verify_jobs = [];
    let v = 0;
    for lane_id in polish_lanes {
        let edited = [];
        if v < polish_results.len() {
            let claimed = map_get(polish_results[v], "edited");
            if claimed != () { edited = claimed; }
        }
        let safe_edited = [];
        for path in edited {
            if type_of(path) == "string" && !banned_write(path) {
                let owned = false;
                for lane in active {
                    if lane.id == lane_id && in_scope(path, lane) { owned = true; }
                }
                if owned { safe_edited.push(path); }
                else { dropped += 1; }
            } else {
                dropped += 1;
                log("rejected unsafe edit " + as_text(path));
            }
        }
        if safe_edited.len() == 0 {
            verify_jobs.push(#{
                prompt: "Lane " + lane_id + " edited nothing safe. Return keep false and evidence explaining that no file was checked because none was claimed.",
                label: "verify:" + lane_id,
                capability_mode: "read-only",
                output_schema: verdict_schema,
            });
        } else {
            verify_jobs.push(#{
                prompt: verify_prompt(lane_id, join_lines(safe_edited)),
                label: "verify:" + lane_id,
                capability_mode: "execute",
                output_schema: verdict_schema,
            });
        }
        v += 1;
    }
    let verdicts = parallel(verify_jobs);
    let vi = 0;
    for lane_id in polish_lanes {
        let edited = [];
        if vi < polish_results.len() {
            let claimed = map_get(polish_results[vi], "edited");
            if claimed != () { edited = claimed; }
        }
        let verdict = ();
        if vi < verdicts.len() { verdict = verdicts[vi]; }
        let keep = map_get(verdict, "keep") == true;
        let evidence = as_text(map_get(verdict, "evidence"));
        if evidence == "" { keep = false; }
        for path in edited {
            if type_of(path) != "string" || banned_write(path) {
                dropped += 1;
                if type_of(path) == "string" { unsafe.push(path); }
            } else if keep {
                kept.push(path);
            } else {
                revert.push(path);
            }
        }
        verify_notes.push(lane_id + ": " + as_text(keep) + " " + evidence);
        vi += 1;
    }
}

phase("Report");
let land_summary = "";
if act && (kept.len() > 0 || revert.len() > 0) {
    let landed = agent(land_prompt(join_lines(kept), join_lines(revert)), #{
        label: "land",
        capability_mode: "execute",
        output_schema: land_schema,
    });
    land_summary = as_text(map_get(landed, "summary"));
    if land_summary == "" { land_summary = "The closing step did not return a summary."; }
} else if act {
    land_summary = "No checked edit was ready to keep.";
} else {
    land_summary = "No models were edited. This was a survey.";
}

let report = "";
report += "# 3D model survey\n\n";
report += "Direction: ";
report += direction_text;
report += "\n\n";
report += "Lane map: .grok/workflows/model-polish-lanes.md\n\n";
report += "Heavy picture work stays on PQ-193, PQ-050, PQ-136, and PQ-049.05. Hitch was not in any lane.\n\n";
report += "## What the two old inventories still disagree about\n\n";
if contradictions.len() == 0 {
    report += census_notes;
    if census_notes == "" { report += "The census returned nothing. Do not treat either old inventory as settled."; }
    report += "\n";
} else {
    for line in contradictions {
        report += "- ";
        report += as_text(line);
        report += "\n";
    }
}
report += "\n## Safe tuning\n\n";
if tuning.len() == 0 {
    report += "None confirmed. That can mean the models are already tight, or the inspectors returned nothing usable.\n";
} else {
    for row in tuning {
        report += "- ";
        report += row.lane;
        report += " | ";
        report += row.path;
        report += " | ";
        report += row.summary;
        report += "\n";
    }
}
report += "\n## Rebuilds that stay on the existing packets\n\n";
if rebuilds.len() == 0 {
    report += "None reported.\n";
} else {
    for row in rebuilds {
        report += "- ";
        report += row.packet;
        report += " | ";
        report += row.lane;
        report += " | ";
        report += row.path;
        report += " | ";
        report += row.summary;
        report += "\n";
    }
}
report += "\n## Shelf, do not wire\n\n";
if shelf_rows.len() == 0 {
    report += "None reported.\n";
} else {
    let shown = 0;
    for row in shelf_rows {
        if shown < 40 {
            report += "- ";
            report += row.lane;
            report += " | ";
            report += row.path;
            report += " | ";
            report += row.summary;
            report += "\n";
            shown += 1;
        }
    }
    if shelf_rows.len() > 40 {
        report += "- Further shelf rows were omitted from this report.\n";
    }
}
report += "\n## Looked at, not tuned here\n\n";
if looked.len() == 0 {
    report += "None reported.\n";
} else {
    let shown_looked = 0;
    for row in looked {
        if shown_looked < 40 {
            report += "- ";
            report += row.lane;
            report += " | ";
            report += row.path;
            report += " | ";
            report += row.summary;
            report += "\n";
            shown_looked += 1;
        }
    }
    if looked.len() > 40 {
        report += "- Further notes were omitted from this report.\n";
    }
}
report += "\n## Unsafe edits left untouched\n\n";
if unsafe.len() == 0 {
    report += "None.\n";
} else {
    for path in unsafe {
        report += "- ";
        report += path;
        report += "\n";
    }
}
report += "\n## This run\n\n";
report += land_summary;
report += "\n";
if verify_notes.len() > 0 {
    report += "\nChecks:\n";
    for note in verify_notes {
        report += "- ";
        report += note;
        report += "\n";
    }
}
report += "\nDropped out-of-lane or unsafe rows: ";
report += dropped.to_string();
report += ".\n";

let report_path = write_scratch_file("model-polish-report.md", report);
log("report " + report_path);
complete(#{
    path: report_path,
    report: report,
    tuning: tuning.len(),
    rebuilds: rebuilds.len(),
    act: act,
});
