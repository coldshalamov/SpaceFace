"""Offline production-adapter diagnostic; NOT full-game or hardware-performance acceptance.

Runs the existing force-language lab without changing browser policies or adding a game renderer.
Writes source hashes, actual canvas sequences, shader errors, and bounded GIFs under .devshots.
For released ship models and normal HTTP loading, use capture-vfx-gameplay-demo.py instead.
"""
from __future__ import annotations
import argparse, base64, hashlib, json, os, shutil
from pathlib import Path
from playwright.sync_api import sync_playwright
from PIL import Image
from lib.vfx_browser_fixture import mount
ROOT=Path(__file__).resolve().parents[1]

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,default=ROOT/'.devshots/living-vfx')
    parser.add_argument('--kind',action='append',choices=['seed','well','repulsor','cone','sheet'])
    parser.add_argument('--fps',type=int,default=12)
    parser.add_argument('--seconds',type=float,default=5.4)
    args=parser.parse_args()
    if not 1<=args.fps<=30 or not 0<args.seconds<=8:parser.error('Use 1–30 fps and a positive duration <=8 seconds.')
    out=args.output.resolve();out.mkdir(parents=True,exist_ok=True)
    report={'scope':'production field adapter, diagnostic scene, bloom off; not shipping-game acceptance',
      'viewport':[1280,800],'fps':args.fps,'duration':args.seconds,'errors':[],'scenarios':{},'sources':{}}
    for pattern in ['src/render/vfx/*.js','src/render/forceLanguage/*.js','src/render/weapons/*.js',
                    'src/render/combat/explosionRupture.js','src/render/energy/energyMaterials.js','src/render/thruster/**/*.js']:
        for p in ROOT.glob(pattern):report['sources'][p.relative_to(ROOT).as_posix()]=hashlib.sha256(p.read_bytes()).hexdigest()
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,executable_path=shutil.which('chromium'),
            args=['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader'])
        try:
            page=browser.new_page(viewport={'width':1280,'height':800})
            page.on('pageerror',lambda e:report['errors'].append(str(e)))
            page.on('console',lambda m:report['errors'].append(m.text) if m.type=='error' else None)
            report['modules']=mount(page,ROOT)
            report['gpu']=page.evaluate("""()=>{const gl=__forceLab.renderer.getContext(),e=gl.getExtension('WEBGL_debug_renderer_info');
                return {version:gl.getParameter(gl.VERSION),renderer:e?gl.getParameter(e.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)}}""")
            for kind in args.kind or ['well','repulsor','cone','sheet','seed']:
                page.evaluate('(kind)=>__forceLab.select(kind)',kind)
                frames=[];hashes=[]
                for i in range(round(args.seconds*args.fps)+1):
                    page.evaluate('(t)=>__forceLab.sample(t)',i/args.fps)
                    data=base64.b64decode(page.evaluate('__forceLab.capture()').split(',',1)[1])
                    dest=out/f'{kind}-{i:04d}.png';dest.write_bytes(data)
                    with Image.open(dest) as image:frames.append(image.convert('RGB').resize((960,600)))
                    hashes.append(hashlib.sha256(data).hexdigest())
                frames[0].save(out/f'{kind}.gif',save_all=True,append_images=frames[1:],duration=round(1000/args.fps),loop=0,optimize=False)
                report['scenarios'][kind]={'frames':len(frames),'uniqueFrames':len(set(hashes)),'frameHashes':hashes}
                print(kind,report['scenarios'][kind]['uniqueFrames'],'unique frames',flush=True)
            # Compile/draw the changed non-field programs too, using their real owner factories.
            report['shaderProbe']=page.evaluate("""async()=>{
              const T=await import('sf:node_modules/three/build/three.module.js');
              const {createEnergyBoltPrecompileMesh}=await import('sf:src/render/weapons/energyBoltPool.js');
              const {ExplosionRupture}=await import('sf:src/render/combat/explosionRupture.js');
              const {createEnergyMaterial}=await import('sf:src/render/energy/energyMaterials.js');
              const {PlasmaStreamSystem}=await import('sf:src/render/thruster/systems/plasmaStream.js');
              const scene=new T.Scene(),camera=new T.PerspectiveCamera(55,1.6,.1,1000);camera.position.set(0,65,80);camera.lookAt(0,0,0);
              const bolt=createEnergyBoltPrecompileMesh();scene.add(bolt);
              const rupture=new ExplosionRupture(scene,{capacity:8});rupture.emitPhase('rupture',{sourceType:'ship',serial:17,x:10,z:0,radius:14});rupture.update(.2);
              const energy=new T.Mesh(new T.SphereGeometry(5,12,8),createEnergyMaterial());scene.add(energy);
              const stream=new PlasmaStreamSystem(T);stream.attach(scene);const sockets=[{x:-15,y:0,z:0,ax:1,ay:0,az:0}],owner={id:'probe'};
              for(let i=0;i<30;i++)stream.update(1/60,sockets,{drive:1,throttle:1,boost:.3,speed:100,speedDrive:.6},{reducedMotion:false},owner);
              await __forceLab.renderer.compileAsync(scene,camera);__forceLab.renderer.render(scene,camera);
              const result={programs:__forceLab.renderer.info.programs.length,drawCalls:__forceLab.renderer.info.render.calls};
              rupture.dispose();stream.dispose();energy.geometry.dispose();energy.material.dispose();bolt.geometry.dispose();bolt.material.dispose();return result;
            }""")
        finally:
            browser.close()
            (out/'temporal-results.json').write_text(json.dumps(report,indent=2))
    if report['errors']:raise SystemExit('Browser/shader errors; inspect temporal-results.json')
    if any(s['uniqueFrames']<3 for s in report['scenarios'].values()):raise SystemExit('Effect did not visibly animate')
if __name__=='__main__':main()
