"""Offline presentation QA against native modules, not a simulated full-game pass.

Requires Python Playwright and an existing Chromium executable. No package installation,
network navigation, external downloads or browser-policy modifications are performed.
Run from any directory: python test/frontend_orbital_browser.py --browser /usr/bin/chromium
"""
import argparse, asyncio, json, shutil, sys, traceback
from pathlib import Path
from datetime import datetime, timezone
from playwright.async_api import async_playwright
import frontend_orbital_transport as transport

ROOT = Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--browser', default=shutil.which('chromium') or shutil.which('google-chrome'))
parser.add_argument('--output', type=Path, default=ROOT/'artifacts/frontend-orbital')
parser.add_argument('--interactions-only', action='store_true')
args=parser.parse_args()
OUT=args.output; OUT.mkdir(parents=True,exist_ok=True)
if not args.browser: parser.error('An existing Chromium executable is required; pass --browser.')
results=[]; interactions=[]

async def load(browser, screen, edge='', width=1280, height=720, motion=None):
    page=await browser.new_page(viewport={'width':width,'height':height},device_scale_factor=1)
    page.set_default_timeout(3500)
    issues=[]
    page.on('pageerror',lambda e:issues.append(str(e)))
    page.on('console',lambda m:issues.append(m.text) if m.type=='error' else None)
    if motion: await page.emulate_media(reduced_motion=motion)
    await page.goto('about:blank')
    await page.set_content(transport.build(screen,edge))
    await page.wait_for_function('window.ORBITAL_QA?.ready || window.ORBITAL_QA?.error || window.OFFLINE_ERROR',timeout=12000)
    error=await page.evaluate('window.ORBITAL_QA?.error || window.OFFLINE_ERROR || null')
    if error: raise RuntimeError(error)
    await page.evaluate('document.fonts.ready')
    await page.wait_for_timeout(190)
    return page,issues

async def record(name, task):
    try:
        details=await task()
        interactions.append({'name':name,'pass':True,'details':details})
    except Exception as error:
        interactions.append({'name':name,'pass':False,'error':str(error),'trace':traceback.format_exc()})
    print(('PASS ' if interactions[-1]['pass'] else 'FAIL ')+name,flush=True)

async def main():
  async with async_playwright() as p:
    browser=await p.chromium.launch(executable_path=args.browser,headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    if not args.interactions_only:
      screens=['title','pause','settings','saves','market','shipworks','contracts','navigation','research','flight','gameover']
      matrix=[(s,'',w,h,None) for w,h in [(1280,720),(1920,1080),(2560,1080)] for s in screens]
      matrix += [(s,e,1280,720,None) for s,e in [('title','empty'),('saves','empty'),('market','unavailable'),('contracts','blocked'),('research','locked'),('flight','danger'),('gameover','ironman')]]
      matrix += [('title','',1280,720,'reduce'),('settings','access',1280,720,'reduce')]
      matrix += [(s,'',390,844,None) for s in ['title','settings','market']]
      for s,e,w,h,motion in matrix:
        key=f"final-{s}{'-'+e if e else ''}{'-reduced' if motion else ''}-{w}x{h}"
        page=None
        try:
          page,issues=await load(browser,s,e,w,h,motion)
          dom=await page.evaluate('''() => ({ready:!!window.ORBITAL_QA?.ready, title:document.title,
            bodyTextLength:document.body.innerText.length, scope:window.ORBITAL_QA?.scope,
            controller:window.ORBITAL_QA?.actualController||null,
            documentOverflow:document.documentElement.scrollWidth>innerWidth,
            imageFailures:[...document.images].filter(i=>!i.complete||!i.naturalWidth).map(i=>i.alt),
            nativeFont:document.fonts.check('500 14px "Instrument Sans"'),
            moduleError:!!document.querySelector('vite-error-overlay, nextjs-portal')})''')
          await page.screenshot(path=str(OUT/(key+'.png')))
          row={'case':key,'screen':s,'edge':e,'viewport':[w,h],'reducedMotion':bool(motion),'screenshot':key+'.png',**dom,'errors':issues}
          row['pass']=dom['ready'] and dom['bodyTextLength']>80 and not issues and not dom['documentOverflow'] and not dom['imageFailures'] and not dom['moduleError']
          results.append(row)
        except Exception as error:results.append({'case':key,'pass':False,'error':str(error)})
        finally:
          if page:await page.close()
        (OUT/'browser-captures-checkpoint.json').write_text(json.dumps(results,indent=2))
        print(('PASS ' if results[-1]['pass'] else 'FAIL ')+key,flush=True)

    async def settings():
      page,errors=await load(browser,'settings')
      try:
        assert await page.evaluate('ORBITAL_QA.events.length')==0,'Painting must not publish settings changes'
        r=page.get_by_label('Master volume',exact=True)
        await r.evaluate("e=>{e.value='81';e.dispatchEvent(new Event('input',{bubbles:true}));}")
        await r.evaluate("e=>e.dispatchEvent(new Event('change',{bubbles:true}))")
        payloads=await page.evaluate("ORBITAL_QA.events.map(e=>e.payload)")
        assert payloads==[{'key':'volume','value':81,'persist':False},{'key':'volume','value':81,'persist':True}],payloads
        await page.get_by_role('tab',name='Access',exact=True).click()
        row=page.locator('li.k-row').filter(has=page.get_by_text('Reduce motion',exact=True))
        await row.get_by_role('button',name='On',exact=True).click()
        before=await page.evaluate('ORBITAL_QA.events.length')
        await row.get_by_role('button',name='On',exact=True).click()
        assert await page.evaluate('ORBITAL_QA.events.length')==before,'Already-On must not emit again'
        assert await page.evaluate("document.documentElement.classList.contains('sf-reduce-motion')")
        await page.get_by_label('Contrast',exact=True).select_option('high')
        assert await page.evaluate('ORBITAL_QA.values.contrast')=='high'
        await page.screenshot(path=str(OUT/'interaction-settings-access-1280.png'))
        assert not errors,errors
        return {'scope':'Real paneBuilder controls; fixture state owner, not profile persistence','rangePublishes':payloads,'idempotentToggle':True,'selectChanges':True}
      finally:await page.close()
    await record('Native settings preview/commit, idempotent toggle, labelled select',settings)

    async def dock():
      page,errors=await load(browser,'market')
      try:
        group=page.get_by_role('tablist',name='Destinations',exact=True)
        assert await group.get_attribute('aria-orientation')=='vertical'
        await group.get_by_role('tab',name='Market',exact=True).focus()
        await page.keyboard.press('ArrowDown')
        assert await group.get_by_role('tab',name='Shipworks',exact=True).get_attribute('aria-selected')=='true'
        assert await page.locator('#sx-panel').get_attribute('aria-labelledby')=='sx-tab-shipworks'
        await page.keyboard.press('End')
        assert await page.evaluate('document.activeElement.dataset.nav')=='ledger'
        await page.keyboard.press('Home')
        assert await page.evaluate('document.activeElement.dataset.nav')=='market'
        assert await group.locator('[tabindex="0"]').count()==1
        await page.set_viewport_size({'width':800,'height':720});await page.wait_for_timeout(100)
        assert await group.get_attribute('aria-orientation')=='horizontal'
        await page.evaluate('ORBITAL_QA.dock.dispose()')
        await page.set_viewport_size({'width':1280,'height':720});await page.wait_for_timeout(100)
        assert await group.get_attribute('aria-orientation')=='horizontal','Disposed media listener should not fire'
        assert not errors,errors
        return {'scope':'Actual createCommandDock; panel mounting is presentation fixture','rovingTabs':True,'HomeEnd':True,'responsiveOrientation':True,'mediaListenerDisposal':True}
      finally:await page.close()
    await record('Native station dock keyboard, roving focus, orientation and cleanup',dock)

    async def research():
      page,errors=await load(browser,'research')
      try:
        original=await page.evaluate('JSON.stringify(ORBITAL_QA.state)')
        select=page.get_by_label('Research node',exact=True)
        options=await select.locator('option').evaluate_all('os=>os.map(o=>({id:o.value,name:o.textContent}))')
        root=next(o for o in options if o['name']=='Combat Basics')
        child=next(o for o in options if o['name']=='Beam Focusing')
        await select.select_option(child['id'])
        locked=page.locator('.tt-side button[aria-disabled="true"]')
        assert await locked.count()==1
        await locked.focus();await page.keyboard.press('Enter')
        assert await page.evaluate("ORBITAL_QA.events.filter(e=>e.type==='ui:unlockTech').length")==0
        assert 'Combat Basics' in await page.locator('.tt-side').inner_text()
        await select.select_option(root['id'])
        button=page.locator('.tt-side button[data-act="unlock"]')
        assert await button.is_enabled()
        rect=await button.bounding_box();assert 0<=rect['y'] and rect['y']+rect['height']<=720
        await button.click()
        event=await page.evaluate("ORBITAL_QA.events.filter(e=>e.type==='ui:unlockTech')")
        assert event==[{'type':'ui:unlockTech','payload':{'nodeId':root['id']}}],event
        assert await page.evaluate('JSON.stringify(ORBITAL_QA.state)')==original,'UI must not optimistically grant research or charge resources'
        await select.focus();await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter')
        assert await select.input_value()!=root['id'],'Native select supports keyboard selection'
        await page.screenshot(path=str(OUT/'interaction-research-selection-1280.png'))
        assert not errors,errors
        return {'scope':'Actual techTreeScreen mounted, shown and interacted; fake bus captures intents only','lockedGuard':True,'unlockIntent':event,'simulationStateUnchanged':True,'keyboardSelection':True}
      finally:await page.close()
    await record('Actual research controller selection, guards, unlock intent and state ownership',research)

    async def recovery():
      page,errors=await load(browser,'gameover')
      try:
        before=await page.evaluate('JSON.stringify(ORBITAL_QA.state)')
        await page.locator('.sf-go-retry').click()
        events=await page.evaluate('ORBITAL_QA.events')
        assert any(e['type']=='player:recoveryRequested' for e in events),events
        assert not any(e['type']=='ui:popScreen' for e in events),'An intent is not a successful respawn'
        assert await page.evaluate('JSON.stringify(ORBITAL_QA.state)')==before
        await page.evaluate("ORBITAL_QA.listeners.get('player:recoveryFailed')()")
        assert await page.locator('.sf-go-retry').is_enabled()
        await page.get_by_role('button',name='Load save instead of recovering this ship').click()
        assert await page.evaluate("ORBITAL_QA.events.some(e=>e.type==='ui:pushScreen'&&e.payload.id==='saveLoad')")
        assert not errors,errors
        return {'scope':'Actual gameOverScreen; recovery request, failure refresh and load navigation; no combat recovery execution','requestNotSuccess':True,'stateUnchanged':True,'loadIntent':True}
      finally:await page.close()
    await record('Actual after-action controller: recovery intent is not a successful respawn',recovery)

    async def ironman():
      page,errors=await load(browser,'gameover','ironman')
      try:
        assert await page.locator('.sf-go-retry').is_hidden() or await page.locator('.sf-go-retry').is_disabled()
        assert 'run over' in (await page.locator('#screens').inner_text()).lower()
        assert not errors,errors
        return {'scope':'Actual gameOverScreen','ironmanDoesNotOfferRecovery':True}
      finally:await page.close()
    await record('Actual after-action controller: Ironman recovery gate',ironman)

    async def market():
      page,errors=await load(browser,'market')
      try:
        commit=page.locator('[data-go]');assert await commit.count()==1
        rect=await commit.bounding_box();assert rect['y']+rect['height']<=720
        await page.locator('[data-mode="sell"]').click()
        assert await page.locator('[data-go]').get_attribute('data-mode')=='sell'
        assert await page.locator('[data-go]').count()==1
        await page.get_by_label('Find a commodity',exact=True).fill('xyz-no-commodity')
        assert await page.locator('.sx-mkt-browser__empty').is_visible()
        assert not errors,errors
        return {'scope':'Real market presentation + synthetic fixture interaction harness; does NOT validate economic execution','oneCommitControl':True,'commitWithin720p':True,'emptySearch':True}
      finally:await page.close()
    await record('Market presentation: visible commit, mode switch and empty search',market)

    async def narrow_market():
      page,errors=await load(browser,'market',width=390,height=844)
      try:
        control=page.locator('[data-go]')
        await control.scroll_into_view_if_needed()
        box=await control.bounding_box()
        footer=await page.locator('.sxb-ops').bounding_box()
        assert box and box['y']>=0 and box['y']+box['height']<=footer['y'],{'control':box,'footer':footer}
        await page.screenshot(path=str(OUT/'interaction-market-mobile-commit-390.png'))
        assert not errors,errors
        return {'scope':'Native market view in narrow presentation fixture; no economic execution','commitReachable':True,'controlBounds':box,'footerBounds':footer}
      finally:await page.close()
    await record('Narrow station scroll exposes its commit control above the footer',narrow_market)

    async def unavailable():
      page,errors=await load(browser,'market','unavailable')
      try:
        assert await page.locator('[data-go]').is_disabled()
        assert 'Live quote unavailable' in await page.locator('.sx-trade').inner_text()
        assert not errors,errors
        return {'scope':'Native disabled markup in isolated read model','unavailableNotFree':True}
      finally:await page.close()
    await record('Market unavailable quote disables the native commit button',unavailable)

    async def gauges():
      page,errors=await load(browser,'flight','danger')
      try:
        bounds=await page.evaluate('''() => {const p=document.querySelector('.sf-bars').getBoundingClientRect();return [...document.querySelectorAll('.sf-barrow__num')].map(e=>{let r=e.getBoundingClientRect();return {text:e.textContent,left:r.left,right:r.right,panelRight:p.right,contained:r.right<=p.right-4&&r.left>=p.left};});}''')
        assert all(b['contained'] for b in bounds),bounds
        assert '24 percent' in await page.locator('.sf-schematic').get_attribute('aria-label')
        assert 'Hull critical' in await page.locator('#alerts').inner_text()
        assert not errors,errors
        return {'scope':'Native instrument markup and CSS, synthetic values, no game loop','gaugeBounds':bounds,'dangerAlsoTextual':True}
      finally:await page.close()
    await record('Flight instruments contain numeric values and label danger non-visually',gauges)

    async def reduced():
      page,errors=await load(browser,'title',motion='reduce')
      try:
        await page.get_by_role('button',name='New Game',exact=True).focus()
        data=await page.evaluate('''() => {let s=getComputedStyle(document.activeElement);return {focusOutline:s.outlineStyle,outlineWidth:s.outlineWidth,transition:s.transitionDuration,media:matchMedia('(prefers-reduced-motion: reduce)').matches};}''')
        assert data['media'];assert all(float(x.strip().rstrip('s'))==0 for x in data['transition'].split(',')),data
        assert data['focusOutline']!='none' and data['outlineWidth']!='0px',data
        assert not errors,errors
        return {'scope':'Native button and production CSS under OS reduced motion','computed':data}
      finally:await page.close()
    await record('Reduced motion and visible keyboard focus',reduced)

    await browser.close()
  data={'timestamp':datetime.now(timezone.utc).isoformat(),'source':'uploaded bundle only','browserPlugin':'not available','browserExecutable':args.browser,'transport':'about:blank + page.set_content; native ES modules via Blob/import map; original production CSS/assets. HTTP navigation was blocked by managed browser policy; policy not modified.','runtimeScope':'No world renderer, live simulation, storage, transaction/fitting/navigation execution. Only explicitly named controllers/helpers are exercised.','captures':results,'interactions':interactions,'summary':{'captures':len(results),'capturePasses':sum(bool(r['pass']) for r in results),'interactions':len(interactions),'interactionPasses':sum(bool(r['pass']) for r in interactions)}}
  target='browser-interactions.json' if args.interactions_only else 'browser-final.json'
  (OUT/target).write_text(json.dumps(data,indent=2))
  (OUT/'offline-transport.json').write_text(json.dumps({'moduleCount':len(transport.modules),'modules':sorted(transport.modules),'missingAssets':sorted(transport.missing),'method':data['transport']},indent=2))
  print(json.dumps(data['summary']),flush=True)
  return not all(r['pass'] for r in results+interactions)
if __name__=='__main__':sys.exit(asyncio.run(main()))
