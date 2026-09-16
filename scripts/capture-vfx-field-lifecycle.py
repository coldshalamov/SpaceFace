#!/usr/bin/env python3
"""Render and assert real VFX motion, rather than judging still images.

Requires Python >=3.10 and Playwright (python -m pip install playwright).
Install its Chromium with python -m playwright install chromium, or pass --browser PATH.
On a display-less Linux machine with software WebGL, run under xvfb-run -a.
Default fixture: actual local ES modules mounted in about:blank, no server or network required.
--url http://localhost:8765/scripts/vfx-force-language-lab.html exercises the ordinary HTTP lab.
--video requires ffmpeg. Captures are diagnostic scenes, not the full game's asset scene.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import math
from pathlib import Path
import shutil
import subprocess
import sys
from playwright.sync_api import sync_playwright
from lib.vfx_browser_fixture import mount

KINDS = ('seed', 'well', 'repulsor', 'cone', 'sheet')
ROOT = Path(__file__).resolve().parents[1]

# Only pixels from the WebGL canvas are compared, never the HTML clock/labels. Reference
# objects and camera remain fixed. A frozen-clock control MUST be identical.
TEMPORAL_PROBE = r'''kind => {
 const l=window.__forceLab;
 const changed=(a,b)=>l.compare(a,b);
 const clone=()=>l.pixels();
 const run=(settings)=>{
   l.settings({motion:false,flash:false,engaged:false,...settings});l.select(kind);
   l.sample(2.0);const a=clone(),v=l.fields.batch.attributes.map(x=>x.version);
   l.sample(2.35);const b=clone(),steadyVersions=l.fields.batch.attributes.map(x=>x.version);
   l.sample(2.35);const fixed=clone();
   return {motion:changed(a,b),frozenControl:changed(b,fixed),noDescriptorUploads:JSON.stringify(v)===JSON.stringify(steadyVersions)};
 };
 const empty=run({}),contact=run({engaged:true}),flash=run({flash:true}),reduced=run({motion:true});
 l.settings({motion:false,flash:false,engaged:false});l.select(kind);
 l.sample(0);const birth=clone();
 l.sample(.08);const early=clone();
 l.sample(.35);const build=clone();
 l.sample(1);const full=clone();
 l.sample(4.2);const release=clone();const releaseStats=l.fields.inspect();
 l.sample(4.42);const dissipate=clone();
 l.sample(5.3);const quiet=clone();const quietStats=l.fields.inspect();
 const counted = p => changed(p,quiet).changed;
 // Attributes at quiet retain their last retired values. Boundary disappearance is additionally
 // asserted by Node tests exactly at releaseAt; here we require all final instances gone.
 return {kind,empty,contact,flash,reduced,birthPixels:counted(birth),earlyPixels:counted(early),
   buildPixels:counted(build),sustainPixels:counted(full),releasePixels:counted(release),
   dissipatingPixels:counted(dissipate),releaseMotion:changed(release,dissipate),quietStats,
   releaseStats,shader:l.renderer.info.programs.map(p=>({name:p.name,runnable:p.diagnostics?.runnable??true})),
   api:l.fields.inspect().schema};
}'''

def check_row(row: dict) -> list[str]:
    failures=[]
    for route in ('empty','contact','flash'):
        r=row[route]
        if r['motion']['changed'] < 150 or r['motion']['changedFraction'] < 0.06:
            failures.append(f"{row['kind']} {route}: no clearly visible sustained motion")
        if r['frozenControl']['changed'] != 0:
            failures.append(f"{row['kind']} {route}: fixed-time control changed")
        if not r['noDescriptorUploads']:
            failures.append(f"{row['kind']} {route}: steady descriptors uploaded")
    if row['reduced']['motion']['changed'] != 0:
        failures.append(f"{row['kind']}: reduced-motion sustained silhouette moved")
    if row['birthPixels'] != 0:
        failures.append(f"{row['kind']}: instant full-size appearance at birth")
    if not 0 < row['earlyPixels'] < row['sustainPixels']:
        failures.append(f"{row['kind']}: birth did not grow into a fuller effect")
    if not 0 < row['dissipatingPixels'] < row['releasePixels']:
        failures.append(f"{row['kind']}: no visible, decaying release interval")
    if row['quietStats']['stats']['surfaces'] or row['quietStats']['instances']:
        failures.append(f"{row['kind']}: lingering instances after extinction")
    if any(not p['runnable'] for p in row['shader']):
        failures.append(f"{row['kind']}: shader program was not runnable")
    return failures

def main() -> int:
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo',type=Path,default=ROOT)
    parser.add_argument('--output',type=Path,default=Path('build/vfx-lifecycle-evidence'))
    parser.add_argument('--browser',help='Chromium executable; omit for Playwright bundled browser')
    parser.add_argument('--url',help='Ordinary HTTP lab URL; omit for network-free local modules')
    parser.add_argument('--video',action='store_true',help='Encode one full cycle per tool with ffmpeg')
    parser.add_argument('--fps',type=int,default=24)
    args=parser.parse_args()
    if not 12<=args.fps<=60:parser.error('--fps must be 12..60')
    out=args.output.resolve();out.mkdir(parents=True,exist_ok=True)
    if args.video and not shutil.which('ffmpeg'):parser.error('--video requires ffmpeg')
    owned=list((args.repo/'src/render/forceLanguage').glob('*.js'))+[
        args.repo/'src/render/vfx.js',args.repo/'scripts/vfx-force-language-lab.html',
        args.repo/'scripts/capture-vfx-field-lifecycle.py',args.repo/'scripts/lib/vfx_browser_fixture.py']
    hashes={f.relative_to(args.repo).as_posix():hashlib.sha256(f.read_bytes()).hexdigest() for f in owned}
    errors=[];rows=[];failures=[];videos=[]
    with sync_playwright() as p:
        launch={'headless':True,'args':['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']}
        if args.browser:launch['executable_path']=args.browser
        browser=p.chromium.launch(**launch)
        page=browser.new_page(viewport={'width':1280,'height':720},device_scale_factor=1)
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
        if args.url:
            page.goto(args.url,wait_until='networkidle');page.wait_for_function('!!window.__forceLab')
            page.evaluate('window.__forceLab.pause()');module_count=None
        else:module_count=mount(page,args.repo)
        for kind in KINDS:
            row=page.evaluate(TEMPORAL_PROBE,kind);rows.append(row)
            failures.extend(check_row(row))
            print(kind,json.dumps({k:row[k] for k in ('earlyPixels','sustainPixels','releasePixels','dissipatingPixels')}),flush=True)
            print('  idle hold:',row['empty']['motion'],'reduced:',row['reduced']['motion']['changed'],flush=True)
            page.evaluate("k=>{const l=window.__forceLab;l.settings({motion:false,flash:false,engaged:false});l.select(k);}",kind)
            for time,label in ((.08,'ignite'),(.30,'build'),(2.0,'sustain'),(2.35,'motion'),(4.2,'release'),(4.42,'dissipate'),(5.3,'quiet')):
                page.evaluate('t=>window.__forceLab.sample(t)',time)
                page.screenshot(path=str(out/f'{kind}-{label}.png'))
            if args.video:
                frames=out/f'{kind}-frames';frames.mkdir(exist_ok=True)
                page.evaluate('k=>window.__forceLab.select(k)',kind)
                total=math.ceil(5.6*args.fps)
                for index in range(total):
                    t=index/args.fps
                    # Stamp the exact authoritative release before the first post-release frame.
                    if index and (index-1)/args.fps < 4.2 <= t:page.evaluate('window.__forceLab.sample(4.2)')
                    page.evaluate('t=>window.__forceLab.sample(t)',t)
                    page.screenshot(path=str(frames/f'{index:04d}.png'))
                video=out/f'{kind}-lifecycle.mp4'
                subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-framerate',str(args.fps),'-i',str(frames/'%04d.png'),'-c:v','libx264','-preset','veryfast','-crf','19','-pix_fmt','yuv420p','-movflags','+faststart',str(video)],check=True)
                videos.append(video);shutil.rmtree(frames)
        renderer=page.evaluate('''()=>{const r=window.__forceLab.renderer,g=r.getContext(),e=g.getExtension('WEBGL_debug_renderer_info');return {threeRevision:window.__forceLab.threeRevision,version:g.getParameter(g.VERSION),renderer:e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER),maxAttributes:g.getParameter(g.MAX_VERTEX_ATTRIBS)};}''')
        browser_version=browser.version;browser.close()
    if videos:
        listing=out/'cycles-concat.txt';listing.write_text('\n'.join(f"file '{v.name}'" for v in videos)+'\n')
        subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',str(listing),'-c','copy','-movflags','+faststart',str(out/'all-field-lifecycles.mp4')],check=True)
    after={f.relative_to(args.repo).as_posix():hashlib.sha256(f.read_bytes()).hexdigest() for f in owned}
    if hashes != after:failures.append('Production/capture source changed while evidence was rendering; rerun on one stable candidate.')
    result={'schema':'spaceface.vfx.temporal-evidence.v2','scene':'fixed diagnostic scene through production vfx._updateFieldGeometry; NOT full game',
            'bloom':False,'browser':browser_version,'renderer':renderer,'fixture':'http' if args.url else 'local-es-modules','moduleCount':module_count,
            'comparisons':'WebGL canvas pixels only; fixed reference objects and camera; RGB threshold >8',
            'holdTimes':[2.0,2.35],'rows':rows,'consoleErrors':errors,'failures':failures,'sourceSha256':hashes}
    (out/'temporal-results.json').write_text(json.dumps(result,indent=2)+'\n')
    if errors or failures:
        print(json.dumps({'errors':errors,'failures':failures},indent=2),file=sys.stderr);return 1
    print('PASS: all five lifecycles, no-target/contact/reduced-flash motion, reduced-motion and pause controls, zero browser errors.',flush=True)
    return 0

if __name__=='__main__':
    raise SystemExit(main())
