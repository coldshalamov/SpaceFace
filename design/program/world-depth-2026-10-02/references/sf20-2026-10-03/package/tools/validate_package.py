#!/usr/bin/env python3
"""Validate this design delivery, not SpaceFace runtime behavior. Standard library only."""
from __future__ import annotations
import base64
import json
import re
import struct
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from html.parser import HTMLParser

ROOT=Path(__file__).resolve().parents[1]

def require(ok: bool, message: str) -> None:
    if not ok:
        raise ValueError(message)

def load(path: str):
    return json.loads((ROOT/path).read_text(encoding='utf-8'))

def main() -> dict:
    concepts=load('data/concepts.json')['concepts']
    manifest=load('data/asset_manifest.json')['assets']
    taskdoc=load('data/agent_tasks.json');tasks=taskdoc['tasks']
    dialogue=load('data/dialogue.json')['lines']
    require(len(concepts)==20,'Expected exactly 20 concepts')
    require({c['number'] for c in concepts}==set(range(1,21)),'Concept numbers must be 1–20')
    ids={c['id'] for c in concepts}
    require(len(ids)==20,'Duplicate concept IDs')
    require(len(manifest)==20,'Expected one asset set per concept')
    require(len(dialogue)==100,'Expected 100 authored dialogue lines')
    require(len(tasks)==taskdoc['count']==125,'Expected 125 proposed work packets')
    images=0;glbs=0;svgs=0;words=0;geometry_meshes=0
    for c,a in zip(concepts,manifest):
        require(c['id']==a['concept_id'],'Asset order/id mismatch')
        require(len(c['parts'])>=4 and len(c['tests'])>=5,'Incomplete recipe/test set')
        require(len(c['animation'])>=4 and len(c['lines'])==5,'Incomplete motion/dialogue set')
        require(all(f'SF20-{d:02d}' in ids for d in c['deps']),'Unknown concept dependency')
        doc=ROOT/f"concepts/{c['number']:02d}_{c['slug']}.md"
        text=doc.read_text(encoding='utf-8');words+=len(text.split())
        for label in ['First encounter','Visual and model recipe','Animation recipe','AI / behavior','Save-state contract','Specific acceptance cases','Completion boundary']:
            require(label in text,f'Missing section {label} in {doc.name}')
        raw=(ROOT/a['plate']).read_bytes()
        require(raw.startswith(b'\x89PNG\r\n\x1a\n'),'Invalid PNG header')
        w,h=struct.unpack('>II',raw[16:24]);require((w,h)==(1600,1100),'Unexpected image dimensions');images+=1
        ET.parse(ROOT/a['blueprint']);svgs+=1
        raw=(ROOT/a['blockout']).read_bytes()
        magic,version,length=struct.unpack_from('<III',raw,0)
        require(magic==0x46546C67 and version==2 and length==len(raw),'Invalid GLB header')
        chunklen,chunktype=struct.unpack_from('<II',raw,12)
        require(chunktype==0x4E4F534A,'GLB missing JSON first chunk')
        g=json.loads(raw[20:20+chunklen].decode('utf-8'))
        require(len(g.get('meshes',[]))>0 and len(g.get('nodes',[]))>0,'Empty GLB')
        geometry_meshes+=len(g['meshes']);glbs+=1
    byid={t['id']:t for t in tasks}
    require(len(byid)==len(tasks),'Duplicate task IDs')
    colors={}
    def visit(i: str) -> None:
        require(i in byid,f'Missing dependency {i}')
        require(colors.get(i)!=1,f'Task graph cycle at {i}')
        if colors.get(i)==2:return
        colors[i]=1
        for dep in byid[i]['depends_on']:visit(dep)
        colors[i]=2
    for i in byid:visit(i)
    htmltext=(ROOT/'INDEX.html').read_text(encoding='utf-8')
    require(htmltext.count('data:image/png;base64,')==20,'Offline HTML needs twenty embedded images')
    for n in range(1,21):require(f'id="c{n}"' in htmltext,f'Missing HTML concept {n}')
    require('<script src=' not in htmltext,'External script dependency in offline document')
    for x in re.findall(r'data:image/png;base64,([^"\s]+)',htmltext):
        require(base64.b64decode(x).startswith(b'\x89PNG'),'Invalid embedded art')
    require((ROOT/'REPORT.pdf').read_bytes().startswith(b'%PDF-'),'Invalid PDF header')
    for name in ['REPO_AUDIT.md','ASSET_PIPELINE.md','INTEGRATION_MAP.md','ROADMAP.md','TEST_PLAN.md','SOURCES.md']:
        require((ROOT/'production'/name).is_file(),f'Missing shared document {name}')
    forbidden={'.ttf','.otf','.woff','.woff2'}
    require(not any(p.suffix.lower() in forbidden for p in ROOT.rglob('*')),'Font file must not be distributed')
    return {'status':'PASS','scope':'Design-package validation only; no gameplay or performance tests run',
            'concepts':len(concepts),'concept_dossier_words':words,'procedural_png_plates':images,
            'svg_plan_studies':svgs,'nonshipping_glb_blockouts':glbs,'glb_meshes_total':geometry_meshes,
            'authored_dialogue_lines':len(dialogue),'proposed_agent_packets':len(tasks),
            'task_graph':'acyclic, all dependencies resolve','offline_html_images':20,
            'fonts_distributed':0}

if __name__=='__main__':
    try:
        print(json.dumps(main(),indent=2))
    except (ValueError, OSError, KeyError, struct.error, ET.ParseError) as exc:
        print(f'PACKAGE VALIDATION FAILED: {exc}',file=sys.stderr)
        sys.exit(1)
