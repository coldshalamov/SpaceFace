#!/usr/bin/env python3
"""Browser acceptance for the real SVG view and real createHud() with synthetic state.
Serve the repository, then run this script with --base-url http://localhost:8765.
--offline-preview/--offline-live accept self-contained HTML when localhost browsing is unavailable.
Requires Python Playwright and an installed Chromium browser. Never reads or writes a player save.
"""
from pathlib import Path
import argparse
import json
from playwright.sync_api import sync_playwright

parser=argparse.ArgumentParser()
parser.add_argument('--base-url',default='http://localhost:8765')
parser.add_argument('--chromium',default=None)
parser.add_argument('--offline-preview',type=Path)
parser.add_argument('--offline-live',type=Path)
parser.add_argument('--output',type=Path,default=Path('.devshots/lamina-integrity'))
args=parser.parse_args();args.output.mkdir(parents=True,exist_ok=True)
results=[]
def check(name,condition,detail=None):
    results.append({'name':name,'pass':bool(condition),'detail':detail})
    if not condition:raise AssertionError(name+': '+str(detail))

def load(page,filename,offline):
    if offline:page.set_content(offline.read_text(encoding='utf-8'),wait_until='load')
    else:page.goto(args.base_url.rstrip('/')+'/test/fixtures/'+filename,wait_until='load')

with sync_playwright() as playwright:
    launch={'headless':True}
    if args.chromium:launch['executable_path']=args.chromium
    browser=playwright.chromium.launch(**launch)
    page=browser.new_page(viewport={'width':1440,'height':1050},device_scale_factor=1)
    errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
    load(page,'hull-integrity.html',args.offline_preview);page.wait_for_function('!!window.LAMINA_QA')
    check('production component mounts without script errors',not errors,errors)
    check('all thirteen canonical hulls are present',page.locator('#atlas .sf-integrity').count()==13)
    duplicates=page.evaluate('''()=>{const ids=[...document.querySelectorAll('[id]')].map(e=>e.id);return ids.filter((id,i)=>ids.indexOf(id)!==i);}''')
    check('all clip/gradient IDs are disjoint across eighteen simultaneous instruments',not duplicates,duplicates)
    for hull in page.evaluate('LAMINA_QA.ids'):
        page.select_option('#ship',hull)
        result=page.locator('#instrument').evaluate('''el=>({id:el.getAttribute('data-hull-id'), cells:el.querySelectorAll('.sf-integrity__lamina').length, clip:el.querySelector('clipPath').querySelectorAll('path').length})''')
        check('active hull geometry: '+hull,result['id']==hull and result['cells']==16 and result['clip']>0,result)
    page.select_option('#ship','ship_kestrel')
    snapshot=page.evaluate('''()=>{const q=LAMINA_QA;const cells=[...q.host.querySelectorAll('.sf-integrity__lamina')];q.player.hull=100;q.player.shield=100;q.paint(1);q.player.hull=18;q.player.shield=0;q.paint(0);return {h:q.host.querySelector('.sf-integrity__hull-readout').getAttribute('aria-valuenow'),s:q.host.querySelector('.sf-integrity__shield-readout').getAttribute('aria-valuenow'),status:q.host.getAttribute('data-hull'),identity:cells.every((n,i)=>n===q.host.querySelectorAll('.sf-integrity__lamina')[i]),echo:[...q.host.querySelectorAll('.sf-integrity__loss')].some(n=>Number(n.getAttribute('opacity'))>0)};}''')
    check('damage values are immediate, retain nodes and have a separate loss echo',snapshot=={'h':'18','s':'0','status':'critical','identity':True,'echo':True},snapshot)
    page.evaluate('()=>{for(let i=0;i<60;i++)LAMINA_QA.paint(1/60);}');
    check('damage echo sleeps completely after its bounded lifetime',page.locator('#instrument .sf-integrity__loss').evaluate_all('(nodes)=>nodes.every(e=>Number(e.getAttribute("opacity"))===0)'))
    safety=page.evaluate('''()=>{const q=LAMINA_QA;q.player.hull=20;q.paint(0);return q.host.querySelector('.sf-integrity__hull-state').textContent;}''')
    check('repair never suppresses the critical word',safety=='CRITICAL',safety)
    page.check('#reduce');page.evaluate('()=>{LAMINA_QA.player.hull=5;LAMINA_QA.paint(0);}')
    check('reduce-motion snaps the trail and hides the transient stroke',page.locator('#instrument .sf-integrity__loss').evaluate_all('(nodes)=>nodes.every(e=>Number(e.getAttribute("opacity"))===0)'))
    page.uncheck('#reduce');page.check('#flash');page.evaluate('()=>{LAMINA_QA.player.hull=3;LAMINA_QA.paint(0);}')
    check('flash reduction removes the impact independently',page.locator('#instrument .sf-integrity__impact').get_attribute('opacity')=='0')
    page.uncheck('#flash');page.evaluate('()=>{LAMINA_QA.player.hull=86;LAMINA_QA.player.shield=78;LAMINA_QA.paint(1);}')
    stable=page.evaluate('''()=>{const q=LAMINA_QA;const observer=new MutationObserver(()=>{});observer.observe(q.host,{attributes:true,childList:true,subtree:true,characterData:true});let queries=0;const one=q.host.querySelector,many=q.host.querySelectorAll;q.host.querySelector=function(...a){queries++;return one.apply(this,a)};q.host.querySelectorAll=function(...a){queries++;return many.apply(this,a)};q.updateShipCondition(q.host,q.player,1/60);observer.takeRecords();queries=0;const start=performance.now();for(let i=0;i<10000;i++)q.updateShipCondition(q.host,q.player,1/60);const elapsed=performance.now()-start;const mutations=observer.takeRecords().length;observer.disconnect();q.host.querySelector=one;q.host.querySelectorAll=many;return {mutations,queries,updates:10000,totalMs:elapsed};}''')
    check('10,000 real-browser steady updates: zero mutations and zero selectors',stable['mutations']==0 and stable['queries']==0,stable)
    textSizes=page.locator('#instrument .sf-integrity__heading,#instrument .sf-integrity__identity,#instrument .sf-integrity__label,#instrument .sf-integrity__hull-state,#instrument .sf-integrity__shield-label,#instrument .sf-integrity__shield-state').evaluate_all('(nodes)=>nodes.map(e=>parseFloat(getComputedStyle(e).fontSize))')
    check('all live textual labels meet the 12 CSS pixel floor',min(textSizes)>=12,textSizes)
    page.check('#contrast');page.locator('#instrument').screenshot(path=str(args.output/'high-contrast.png'));page.uncheck('#contrast')
    page.emulate_media(forced_colors='active');page.locator('#instrument').screenshot(path=str(args.output/'forced-colors.png'))
    forced=page.locator('#instrument').evaluate('(e)=>({background:getComputedStyle(e).backgroundImage,role:e.getAttribute("role"),labels:e.querySelectorAll("[role=meter]").length})')
    check('forced colours remove the decorative carrier but retain both meters',forced['background']=='none' and forced['labels']==2,forced)
    page.emulate_media(forced_colors='none',reduced_motion='reduce')
    page.evaluate('()=>{LAMINA_QA.player.hull=40;LAMINA_QA.paint(0);}')
    check('OS reduced motion is honoured',page.locator('#instrument').get_attribute('data-motion')=='false')
    page.emulate_media(reduced_motion='no-preference');page.evaluate('()=>{LAMINA_QA.player.hull=86;LAMINA_QA.player.shield=78;LAMINA_QA.paint(1);}')
    page.screenshot(path=str(args.output/'design-sheet.png'),full_page=True)
    page.locator('#instrument').screenshot(path=str(args.output/'lamina-healthy.png'))
    page.evaluate('()=>{LAMINA_QA.player.hull=18;LAMINA_QA.player.shield=0;LAMINA_QA.paint(1);}')
    page.locator('#instrument').screenshot(path=str(args.output/'lamina-critical.png'))
    labelRects=page.locator('#instrument').evaluate('''el=>{const a=el.querySelector('.sf-integrity__hull-state').getBoundingClientRect(),b=el.querySelector('.sf-integrity__shield-label').getBoundingClientRect();return {hullBottom:a.bottom,shieldTop:b.top};}''')
    check('critical wording does not overlap the shield label',labelRects['hullBottom']<=labelRects['shieldTop'],labelRects)
    page.set_viewport_size({'width':390,'height':844});page.screenshot(path=str(args.output/'component-phone.png'),full_page=True)
    check('standalone controls fit a 390 px viewport',page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
    page.close()
    live=browser.new_page(viewport={'width':1280,'height':720},device_scale_factor=1);liveErrors=[];live.on('pageerror',lambda error:liveErrors.append(str(error)))
    load(live,'hull-integrity-live.html',args.offline_live);live.wait_for_function('!!window.LAMINA_LIVE')
    check('real createHud mounts on the production CSS without script errors',not liveErrors,liveErrors)
    for width,height in [(1920,1080),(1280,720),(800,600)]:
        live.set_viewport_size({'width':width,'height':height});live.evaluate('LAMINA_LIVE.step(24)')
        rects=live.evaluate('''()=>{const r=sel=>{const e=document.querySelector(sel);if(!e)return null;const b=e.getBoundingClientRect();return {x:b.x,y:b.y,right:b.right,bottom:b.bottom,w:b.width,h:b.height};};const a=r('.sf-integrity');const overlap=b=>b&&a.x<b.right&&a.right>b.x&&a.y<b.bottom&&a.bottom>b.y;return {instrument:a,inside:a.x>=0&&a.y>=0&&a.right<=innerWidth&&a.bottom<=innerHeight,speed:overlap(r('.sf-speed')),powers:overlap(r('.sf-prail')),radar:overlap(r('.sf-rightdock'))};}''')
        check(f'live HUD {width}x{height}: indicator is on-screen and separate from speed/powers/radar',rects['inside'] and not rects['speed'] and not rects['powers'] and not rects['radar'],rects)
        live.screenshot(path=str(args.output/f'live-hud-{width}.png'))
    live.evaluate('()=>{const q=LAMINA_LIVE;q.player.hull=18;q.player.shield=0;q.step(1);}')
    check('live frame writer updates hull and shield, not just the standalone demo',live.locator('.sf-integrity__hull-readout').get_attribute('aria-valuenow')=='18' and live.locator('.sf-integrity__shield-readout').get_attribute('aria-valuenow')=='0')
    live.evaluate('()=>{LAMINA_LIVE.player.data.defId="ship_leviathan";LAMINA_LIVE.step(1);}')
    check('live hull swap follows the actual player entity',live.locator('.sf-integrity').get_attribute('data-hull-id')=='ship_leviathan')
    live.evaluate('()=>{LAMINA_LIVE.state.entities.delete("player");LAMINA_LIVE.step(1);}')
    check('live player disappearance clears stale health',live.locator('.sf-integrity__hull-state').text_content()=='NO DATA')
    check('no page errors during live state changes',not liveErrors,liveErrors)
    browser.close()
report={'passed':sum(x['pass']for x in results),'failed':sum(not x['pass']for x in results),'scope':'Real production SVG and createHud/production CSS with synthetic entity state; no 3D scene or GPU/game FPS claim.','cases':results}
(args.output/'browser-validation.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'passed':report['passed'],'failed':report['failed'],'output':str(args.output)},indent=2))
