#!/usr/bin/env python3
"""Supplementary fixed-camera motion checks using shipped default/max chase distances.
This is a production-renderer diagnostic, not a full-game camera/controller test.
Dependencies and browser setup: see capture-vfx-field-lifecycle.py.
"""
from pathlib import Path
import argparse, hashlib, json, re
from playwright.sync_api import sync_playwright
from lib.vfx_browser_fixture import mount

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--browser');p.add_argument('--output',type=Path,default=Path('build/vfx-play-distance.json'));a=p.parse_args()
 root=Path(__file__).resolve().parents[1];camera_source=(root/'src/render/camera.js').read_text()
 zoom=int(re.search(r'const DEFAULT_ZOOM = (\d+)',camera_source).group(1))
 maximum=int(re.search(r'CAMERA_ZOOM_MAX = (\d+)',camera_source).group(1))
 records=[];errors=[]
 with sync_playwright() as pw:
  options={'headless':True,'args':['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']}
  if a.browser:options['executable_path']=a.browser
  browser=pw.chromium.launch(**options);page=browser.new_page(viewport={'width':1280,'height':720},device_scale_factor=1)
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
  mount(page,root)
  for kind in ['seed','well','repulsor','cone','sheet']:
   for distance in [zoom,maximum]:
    row=page.evaluate('''([kind,d])=>{
      const l=window.__forceLab;l.settings({motion:false,flash:false,engaged:false});l.select(kind);
      l.camera.position.set(0,d*Math.sin(Math.PI/3),-d*Math.cos(Math.PI/3));l.camera.lookAt(0,0,0);l.camera.updateMatrixWorld(true);
      l.sample(2);const a=l.pixels();l.sample(2.35);const b=l.pixels();l.sample(2.35);const fixed=l.pixels();
      return {kind,distance:d,delta:l.compare(a,b),fixed:l.compare(b,fixed)};
    }''',[kind,distance]);records.append(row)
    assert row['delta']['changed']>150,(kind,distance,row)
    assert row['delta']['changedFraction']>.06,(kind,distance,row)
    assert row['fixed']['changed']==0,row
  browser.close()
 assert not errors,errors
 data={'scene':'fixed production-renderer diagnostic; no-target motion, fixed 50 degree FOV / 60 degree tilt; NOT full chase controller or full game',
       'cameraSourceSha256':hashlib.sha256(camera_source.encode()).hexdigest(),'defaultDistance':zoom,'maxManualDistance':maximum,'rows':records,'errors':errors}
 a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(json.dumps(data,indent=2)+'\n')
 print('PASS: all 10 no-target/default-and-max-distance motion comparisons; identical frozen-time controls.')

if __name__=='__main__':main()
