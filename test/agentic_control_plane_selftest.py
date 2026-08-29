#!/usr/bin/env python3
from __future__ import annotations
import importlib.util, json, sys, tempfile
from pathlib import Path

THIS=Path(__file__).resolve(); ROOT=THIS.parents[1]

def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path)
    mod=importlib.util.module_from_spec(spec)
    sys.modules[name]=mod
    spec.loader.exec_module(mod)
    return mod
manager=load("manager_cycle",ROOT/"tools/agentic/manager_cycle.py")
analyzer=load("analyze_session",ROOT/"tools/agentic/analyze_session.py")

def check(cond,msg):
    if not cond: raise AssertionError(msg)

def main():
    ws=json.loads((ROOT/"design/program/AGENTIC_QUALITY_WORKSTREAMS.json").read_text())
    sc=json.loads((ROOT/"tools/agentic/scenarios.json").read_text())
    ids=[x["id"] for x in ws["workstreams"]]; check(len(ids)==len(set(ids)),"duplicate workstream ids")
    scenario_ids=[x["id"] for x in sc["scenarios"]]; check(len(scenario_ids)==len(set(scenario_ids)),"duplicate scenario ids")
    known=set(scenario_ids)
    for w in ws["workstreams"]:
        check(all(x in known for x in w.get("scenarios",[])),f"{w['id']} references missing scenario")

    queue={"dispatchUnits":[
        {"id":"PQ-900.impl","parentId":"PQ-900","priority":2,"title":"fix flight hitch","kind":"performance","state":"ready","dependsOn":[],"paths":["src/render/x.js"],"checks":[],"brief":"player flight freeze hitch"},
        {"id":"PQ-900.review","parentId":"PQ-900","priority":1,"title":"review docs","kind":"acceptance_review","state":"ready","dependsOn":[],"paths":[],"checks":[],"brief":"review polish"},
        {"id":"PQ-901.wait","parentId":"PQ-901","priority":3,"title":"wait","kind":"implementation","state":"ready","dependsOn":["PQ-901.dep"],"paths":[],"checks":[],"brief":"enemy"},
        {"id":"PQ-901.dep","parentId":"PQ-901","priority":4,"title":"dep","kind":"implementation","state":"claimed","dependsOn":[],"paths":[],"checks":[],"brief":"enemy"}
    ]}
    ready=[u["id"] for u in manager.ready_units(queue)]
    check("PQ-900.impl" in ready and "PQ-900.review" in ready,"ready units missing")
    check("PQ-901.wait" not in ready,"dependency gate failed")
    w,_=manager.choose_workstream(manager.tokenize(queue["dispatchUnits"][0]),ws["workstreams"])
    check(w["id"] in {"PF","FC"},"flight hitch should classify to performance/flight")

    records=[]
    for i,dt in enumerate([0.016,0.017,0.120,0.018]):
        records.append({"kind":"frame_perf","tick":i,"frameDt":dt})
    records += [
        {"kind":"state_sample","tick":1,"simTime":.1,"player":{"targetId":1,"pose":{"vel":{"x":1,"z":0},"angVel":1}}},
        {"kind":"state_sample","tick":2,"simTime":.2,"player":{"targetId":2,"pose":{"vel":{"x":2,"z":0},"angVel":-1}}},
        {"kind":"asset_exposure","tick":3,"exposure":{"required":"fallback"}}
    ]
    report=analyzer.reduce(records)
    check(report["performance"]["hitches100"]==1,"long-frame detector failed")
    codes={x["code"] for x in report["findings"]}
    check("PF_LONG_FRAME" in codes and "VX_ASSET_PUBLICATION" in codes,"expected findings absent")
    print("agentic control plane selftest: PASS")

if __name__=="__main__": main()
