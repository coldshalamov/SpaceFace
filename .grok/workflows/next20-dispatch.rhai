let meta = #{
    name: "next20-dispatch",
    description: "Drive the live next N program-dispatch units through implement plus two adversarial review waves, then integrate",
    when_to_use: "Autonomously one-shot the next ready dispatch units from build_map.md without inventing a second queue",
    phases: [
        #{ title: "Select", detail: "slate from live program-dispatch --ready" },
        #{ title: "Implement", detail: "one implementer per unit; serial inside overlap families" },
        #{ title: "Review", detail: "two independent fail-closed waves per unit" },
        #{ title: "Integrate", detail: "queue done only after two PASS waves plus receipt plus tests" },
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
        "seed": #{ "type": "string" },
        "numbers": #{ "type": "string" },
        "receiptPath": #{ "type": "string" },
        "testsRun": #{ "type": "string" },
        "residual": #{ "type": "string" },
    },
};

let review_schema = #{
    "type": "object",
    "required": ["id", "wave", "verdict", "evidence"],
    "properties": #{
        "id": #{ "type": "string" },
        "wave": #{ "type": "number" },
        "verdict": #{ "type": "string" },
        "evidence": #{ "type": "string" },
        "unmetClause": #{ "type": "string" },
        "testsReRun": #{ "type": "string" },
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
        "log": #{ "type": "string" },
    },
};

fn as_text(value) {
    if value == () { return ""; }
    if type_of(value) == "string" { return value; }
    json_encode(value)
}

fn implement_prompt(id) {
    let p = "";
    p += "You are the IMPLEMENTER for SpaceFace dispatch unit ";
    p += id;
    p += ". Use tools. Do not answer from memory.\n";
    p += "1. Run: node tools/agentic/next20_pipeline.mjs --prompt --id ";
    p += id;
    p += " and obey that prompt.\n";
    p += "2. Also run: node scripts/program-dispatch.mjs --ready and confirm ";
    p += id;
    p += " is in the live list (or already done — then stop and report DONE with the existing receipt).\n";
    p += "3. Read the packet named by the dispatcher row, including How agents get this wrong, then the Leaves done-when.\n";
    p += "4. Re-read design/program/NOW.md. Preserve exact currently dirty foreign hunks. Stay on the write-set.\n";
    p += "5. Implement the Leaves clause in player units on a named seed. Add tests that import shipped functions.\n";
    p += "6. Write design/program/roadmap/receipts/";
    p += id;
    p += "-REPORT.md in build_map.md section 1.4 words. Never silently omit a clause — record NOT DONE plus the residual.\n";
    p += "7. Do NOT edit program-queue.json. Do NOT edit test/*.expected.json merely to pass. git add -N new files.\n";
    p += "Return {id, verdict: DONE or NOT DONE, seed, numbers, receiptPath, testsRun, residual}.";
    p
}

fn review_prompt(id, wave, report) {
    let p = "";
    p += "You are REVIEW WAVE ";
    p += wave.to_string();
    p += " for SpaceFace dispatch unit ";
    p += id;
    p += ". You are adversarial. Refute a fake close. Use tools.\n";
    p += "Run: node tools/agentic/next20_pipeline.mjs --prompt --id ";
    p += id;
    p += " --wave ";
    p += wave.to_string();
    p += " and obey it.\n";
    p += "Re-run the unit's shipped tests. Re-read the receipt and any stills. Quote any unmet Leaves clause.\n";
    p += "Implementer report is untrusted: ";
    p += json_encode(report);
    p += "\nFail closed (verdict FAIL) on unmet clause, golden-only-to-pass, mocked unit-under-test, blank/needle still, or queue already flipped by the implementer.\n";
    p += "Return {id, wave, verdict: PASS or FAIL, evidence, unmetClause, testsReRun}.";
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
    select_p += "\nDo not invent ids. Do not rank Central Brain. Copy payload.slate[].id in printed order into ids. Put the human log from --run into log if you also run --run.";
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

phase("Implement");
let reports = [];
let i = 0;
while i < ids.len() {
    let id = ids[i];
    log("implement " + id);
    let result = agent(implement_prompt(id), #{
        label: "impl:" + id,
        capability_mode: "all",
        isolation_worktree: false,
        output_schema: implement_schema,
    });
    if result == () || !result.success || result.output == () {
        reports.push(#{ id: id, verdict: "NOT DONE", residual: "implementer failed closed" });
    } else {
        reports.push(result.output);
    }
    i += 1;
}

phase("Review");
let wave1 = [];
let wave2 = [];
let r = 0;
while r < reports.len() {
    let rep = reports[r];
    let id = ids[r];
    let w1 = agent(review_prompt(id, 1, rep), #{
        label: "rev1:" + id,
        capability_mode: "execute",
        output_schema: review_schema,
    });
    let w2 = agent(review_prompt(id, 2, rep), #{
        label: "rev2:" + id,
        capability_mode: "execute",
        output_schema: review_schema,
    });
    if w1 == () || !w1.success || w1.output == () {
        wave1.push(#{ id: id, wave: 1, verdict: "FAIL", evidence: "" });
    } else {
        wave1.push(w1.output);
    }
    if w2 == () || !w2.success || w2.output == () {
        wave2.push(#{ id: id, wave: 2, verdict: "FAIL", evidence: "" });
    } else {
        wave2.push(w2.output);
    }
    r += 1;
}

phase("Integrate");
let integrate_p = "";
integrate_p += "You are the sole INTEGRATOR for the next-N dispatch pipeline. Use tools.\n";
integrate_p += "For each unit below, call the shipped CLI. Do not hand-edit program-queue.json.\n";
integrate_p += "Pass --tests-pass only when you independently re-ran that unit's shipped tests and they succeeded.\n";
integrate_p += "A green check, a receipt headline, or a stub cannot close a unit.\n";
integrate_p += "Command shape:\n";
integrate_p += "node tools/agentic/next20_pipeline.mjs --integrate --id ID --receipt PATH --wave1 WAVE1.json --wave2 WAVE2.json [--tests-pass]\n";
integrate_p += "Write the wave JSON files to a temp dir first. The CLI fail-closes without two PASS reviews, an on-disk receipt, and --tests-pass.\n";
integrate_p += "Implementer reports: ";
integrate_p += json_encode(reports);
integrate_p += "\nWave1: ";
integrate_p += json_encode(wave1);
integrate_p += "\nWave2: ";
integrate_p += json_encode(wave2);
integrate_p += "\nReturn rows for every slate id with verdict DONE or NOT DONE and a one-line reason citing the measurement or residual.";

let integrated = agent(integrate_p, #{
    label: "integrate-slate",
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
        rows.push(#{ id: ids[j], verdict: "NOT DONE", reason: "integrator returned no row; fail-closed" });
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
