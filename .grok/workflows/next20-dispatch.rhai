let meta = #{
    name: "next20-dispatch",
    description: "Build the next ready dispatch units well, have a teammate look for unfinished work bugs and improvements, then close",
    when_to_use: "Autonomously take the next ready units from build_map.md without inventing a second queue",
    phases: [
        #{ title: "Select", detail: "slate from live program-dispatch --ready" },
        #{ title: "Build", detail: "one implementer per unit; care about how it plays" },
        #{ title: "Look", detail: "one teammate look per unit for unfinished work, bugs, and cheap bits" },
        #{ title: "Fix", detail: "implementer addresses what is real" },
        #{ title: "Close", detail: "queue done when checks passed and someone would ship it" },
    ],
};

let schedule_schema = #{
    "type": "object",
    "required": ["ids"],
    "properties": #{
        "ids": #{
            "type": "array",
            "minItems": 1,
            "maxItems": 20,
            "items": #{ "type": "string" },
        },
        "log": #{ "type": "string" },
    },
};

let implement_schema = #{
    "type": "object",
    "required": ["id", "verdict"],
    "properties": #{
        "id": #{ "type": "string" },
        "verdict": #{ "type": "string" },
        "notes": #{ "type": "string" },
    },
};

let review_schema = #{
    "type": "object",
    "required": ["id", "wouldShip"],
    "properties": #{
        "id": #{ "type": "string" },
        "wouldShip": #{ "type": "boolean" },
        "unfinished": #{ "type": "string" },
        "bugs": #{ "type": "string" },
        "improvements": #{ "type": "string" },
    },
};

let integrate_schema = #{
    "type": "object",
    "required": ["rows"],
    "properties": #{
        "rows": #{
            "type": "array",
            "items": #{
                "type": "object",
                "required": ["id", "verdict"],
                "properties": #{
                    "id": #{ "type": "string" },
                    "verdict": #{ "type": "string" },
                    "reason": #{ "type": "string" },
                },
            },
        },
    },
};

fn as_text(value) {
    if value == () { return ""; }
    if type_of(value) == "string" { return value; }
    json_encode(value)
}

fn implement_prompt(id) {
    let p = "";
    p += "You are building SpaceFace dispatch unit ";
    p += id;
    p += ". This is production. Care about how it plays.\n";
    p += "Run: node tools/agentic/next20_pipeline.mjs --prompt --id ";
    p += id;
    p += " and obey that prompt.\n";
    p += "Play the change. The first version that merely meets the bar is a draft. Look at it, find the cheap bits, and make it good.\n";
    p += "Do NOT edit program-queue.json. Do NOT store stills or write review files. Do NOT edit test/*.expected.json merely to pass.\n";
    p += "Preserve dirty foreign hunks. git add -N new files.\n";
    p += "Return {id, verdict: DONE or NOT DONE, notes}.";
    p
}

fn review_prompt(id, report) {
    let p = "";
    p += "Look at the work for SpaceFace unit ";
    p += id;
    p += ". You are a teammate, not a gate.\n";
    p += "Run: node tools/agentic/next20_pipeline.mjs --prompt --id ";
    p += id;
    p += " --wave 1 and obey it.\n";
    p += "Find what is unfinished, what is buggy, and what would make it better. Be specific. Catch a lazy first try with taste.\n";
    p += "Do not write review files as the product. Do not archive stills.\n";
    p += "Implementer notes (untrusted): ";
    p += json_encode(report);
    p += "\nwouldShip=true only if you would put this in front of the owner tonight.\n";
    p += "Return {id, wouldShip, unfinished, bugs, improvements}.";
    p
}

fn repair_prompt(id, review) {
    let p = "";
    p += "Fix the real findings for SpaceFace unit ";
    p += id;
    p += " then look at the work again. Do not produce review files.\n";
    p += "Findings: ";
    p += json_encode(review);
    p += "\nStay on the write-set. Preserve foreign hunks. Return {id, verdict: DONE or NOT DONE, notes}.";
    p
}

let count = 20;
let preset = [];
if args != () {
    if args.count != () { count = args.count; }
    if args.ids != () { preset = args.ids; }
}

phase("Select");
let ids = [];
if preset.len() > 0 {
    ids = preset;
    log("using args.ids (" + ids.len().to_string() + ")");
} else {
    let select_p = "";
    select_p += "Run this exact command in the SpaceFace repo root and return its slate ids in order:\n";
    select_p += "node tools/agentic/next20_pipeline.mjs --schedule --count ";
    select_p += count.to_string();
    select_p += "\nDo not invent ids. Copy payload.slate[].id in printed order into ids.";
    let selected = agent(select_p, #{
        label: "select-slate",
        capability_mode: "execute",
        output_schema: schedule_schema,
    });
    if selected == () || !selected.success || selected.output == () || selected.output.ids == () {
        pause("verification", "Selector did not return live dispatcher ids.");
    }
    ids = selected.output.ids;
}

if ids.len() == 0 { pause("verification", "Slate is empty."); }
log("slate " + ids.len().to_string() + " units");

phase("Build");
let impl_jobs = [];
let i = 0;
while i < ids.len() {
    impl_jobs.push(#{
        prompt: implement_prompt(ids[i]),
        label: "impl:" + ids[i],
        capability_mode: "all",
        isolation_worktree: false,
        output_schema: implement_schema,
    });
    i += 1;
}
let impl_results = parallel(impl_jobs);

let reports = [];
let impl_ids = [];
i = 0;
while i < ids.len() {
    let result = impl_results[i];
    if result == () || !result.success || result.output == () {
        reports.push(#{ id: ids[i], verdict: "NOT DONE", notes: "implementer failed" });
        impl_ids.push("");
    } else {
        reports.push(result.output);
        impl_ids.push(result.agent_id);
    }
    i += 1;
}

phase("Look");
let rev_jobs = [];
i = 0;
while i < ids.len() {
    rev_jobs.push(#{
        prompt: review_prompt(ids[i], reports[i]),
        label: "look:" + ids[i],
        capability_mode: "execute",
        output_schema: review_schema,
    });
    i += 1;
}
let rev_results = parallel(rev_jobs);

let reviews = [];
i = 0;
while i < ids.len() {
    let result = rev_results[i];
    if result == () || !result.success || result.output == () {
        reviews.push(#{ id: ids[i], wouldShip: false, unfinished: "reviewer failed", bugs: "", improvements: "" });
    } else {
        reviews.push(result.output);
    }
    i += 1;
}

phase("Fix");
let fix_jobs = [];
let fix_index = [];
i = 0;
while i < ids.len() {
    let rev = reviews[i];
    if rev.wouldShip != true {
        let opts = #{
            prompt: repair_prompt(ids[i], rev),
            label: "fix:" + ids[i],
            capability_mode: "all",
            isolation_worktree: false,
            output_schema: implement_schema,
        };
        if impl_ids[i] != "" {
            opts.resume_from = impl_ids[i];
        }
        fix_jobs.push(opts);
        fix_index.push(i);
    }
    i += 1;
}
if fix_jobs.len() > 0 {
    log("repairing " + fix_jobs.len().to_string() + " units");
    let fix_results = parallel(fix_jobs);
    let f = 0;
    while f < fix_jobs.len() {
        let idx = fix_index[f];
        let result = fix_results[f];
        if result != () && result.success && result.output != () {
            reports[idx] = result.output;
            reviews[idx].wouldShip = true;
        }
        f += 1;
    }
}

phase("Close");
let integrate_p = "";
integrate_p += "You are the sole closer for this slate. Use tools. Do not hand-edit program-queue.json.\n";
integrate_p += "For each unit, if the implementer said DONE, the teammate would ship it, and you independently re-ran the checks that catch THAT change, run:\n";
integrate_p += "node tools/agentic/next20_pipeline.mjs --integrate --id ID --tests-pass\n";
integrate_p += "Pass --review only if you have a wouldShip object. Do not invent wave JSON. Do not store stills.\n";
integrate_p += "If the teammate would not ship it, leave it ready.\n";
integrate_p += "Implementer notes: ";
integrate_p += json_encode(reports);
integrate_p += "\nTeammate looks: ";
integrate_p += json_encode(reviews);
integrate_p += "\nReturn rows for every slate id with verdict DONE or NOT DONE and a one-line reason in player words.";

let integrated = agent(integrate_p, #{
    label: "close-slate",
    capability_mode: "all",
    isolation_worktree: false,
    output_schema: integrate_schema,
});

let rows = [];
if integrated != () && integrated.success && integrated.output != () && integrated.output.rows != () {
    rows = integrated.output.rows;
}
if rows.len() == 0 {
    let j = 0;
    while j < ids.len() {
        rows.push(#{ id: ids[j], verdict: "NOT DONE", reason: "closer returned no row" });
        j += 1;
    }
}

let report = "";
report += "# next20-dispatch\n\n";
let k = 0;
while k < rows.len() {
    let row = rows[k];
    report += "- ";
    report += as_text(row.id);
    report += " ";
    report += as_text(row.verdict);
    report += " ";
    report += as_text(row.reason);
    report += "\n";
    k += 1;
}
let report_path = write_scratch_file("next20-dispatch.md", report);
complete(#{ path: report_path, rows: rows, ids: ids });
