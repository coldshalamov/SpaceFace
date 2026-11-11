import test from 'node:test';
import assert from 'node:assert/strict';
import { startBenchServer } from '../scripts/lib/benchServer.mjs';
import { loadPlaywright } from '../scripts/lib/load-playwright.mjs';

// Genuine phone and desktop cascades, production Bar/controller and authored Helios replies.
// Run on a browser-capable executor. A synthetic DOM pass is not this geometry acceptance.
// Run from the integrated candidate checkout: Node module loaders do not pin HTTP-served files.
// A frozen runtime overlay may be supplied, but its bench fixture must also match that revision.
test('compact Bar preserves complete replies, context and reachable choices', { timeout:180000 }, async () => {
  const server = await startBenchServer({ sourceOverlay:process.env.BAR_BROWSER_SOURCE_OVERLAY || null });
  const { chromium } = await loadPlaywright(); let browser;
  try {
    browser = await chromium.launch({ headless:true, args:['--disable-gpu', '--disable-webgl', '--mute-audio'] });
    const cases = [
      ...[{width:390,height:844}, {width:651,height:461}, {width:700,height:461}, {width:801,height:461}, {width:960,height:540}, {width:1920,height:1080}].map(viewport=>({viewport,phone:false})),
      ...[{width:390,height:844}, {width:844,height:390}].map(viewport=>({viewport,phone:true})),
    ];
    for (const { viewport, phone } of cases) {
      const page = await browser.newPage({ viewport, reducedMotion:'no-preference', ...(phone ? {isMobile:true,hasTouch:true,deviceScaleFactor:2} : {}) });
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      const frame = `${phone?'phone':'desktop'} ${viewport.width}x${viewport.height}`;
      try {
        await page.goto(`${server.baseUrl}tools/ui-bench.html?screen=station-bar&chrome=0${phone?'&phone=1':''}`, {waitUntil:'domcontentloaded'});
        await page.waitForFunction(()=>window.__BENCH_READY, null, {timeout:120000});
        assert.equal(await page.evaluate(()=>document.documentElement.dataset.sfMobile==='1'), phone, frame);
        const captain = page.locator('[data-contact="contact_maera_vols"]');
        await captain.scrollIntoViewIfNeeded(); if (phone) await captain.tap(); else await captain.click();
        const first = page.locator('.sx-talk__choices [data-choice]').first();
        // Capture the canonical full response before the click; no wait may mask a transient partial answer.
        const expected = await first.evaluate(async button => {
          const {generateContacts, buildReply} = await import('/src/ui/station/barContacts.js');
          const c = generateContacts('station_helios', BENCH.state).find(c=>c.id==='contact_maera_vols');
          return buildReply(c.role, button.dataset.choice, {state:BENCH.state,bus:BENCH.bus}, 'station_helios', c).text;
        });
        await first.scrollIntoViewIfNeeded(); if (phone) await first.tap(); else await first.click();
        const reply = page.locator('.sx-talk__reply.is-said');
        assert.equal(await reply.textContent(), expected, `${frame}: response is complete on activation`);
        await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
        assert.equal(await reply.textContent(), expected, `${frame}: animation cannot erase the response`);
        assert.ok((await page.locator('.sx-talk__memory').textContent()).length);
        for (const selector of ['.sx-talk__role', '.sx-talk__name', '.sx-talk__memory', '.sx-talk__reply.is-said']) {
          const reading = page.locator(selector);
          const measure = await reading.evaluate(element => {
            const style=getComputedStyle(element), box=element.getBoundingClientRect();
            const range=document.createRange(); range.selectNodeContents(element);
            return {visible:style.display!=='none'&&style.visibility!=='hidden'&&box.height>0,
              font:parseFloat(style.fontSize), clamp:style.webkitLineClamp,
              fits:[...range.getClientRects()].every(line=>line.left>=box.left-1&&line.right<=box.right+1&&line.top>=box.top-1&&line.bottom<=box.bottom+1)};
          });
          assert.equal(measure.visible,true,`${frame}: ${selector} is retained`);
          assert.equal(measure.fits,true,`${frame}: ${selector} lays out every line without clipping`);
          assert.ok(measure.font>=12); assert.ok(['none','unset',''].includes(measure.clamp));
        }
        const buttons=page.locator('.sx-talk__choices [data-choice]'); const count=await buttons.count(); assert.ok(count>=3);
        await buttons.first().focus();
        for (let i=0;i<count;i++) {
          if (i) await page.keyboard.press('ArrowDown');
          const current=buttons.nth(i);
          assert.equal(await current.evaluate(element=> {
            const box=element.getBoundingClientRect(), range=document.createRange(); range.selectNodeContents(element);
            const foot=document.querySelector('.sxb-ops').getBoundingClientRect();
            const hit=document.elementFromPoint(box.left+box.width/2,box.top+box.height/2);
            const minimumHeight = innerWidth<=960||innerHeight<=600 ? 44 : 28;
            if(document.activeElement!==element||box.width<=0||box.height<minimumHeight||box.top<0||box.bottom>Math.min(innerHeight,foot.top)+1||box.left<0||box.right>innerWidth) return false;
            for(let p=element.parentElement;p;p=p.parentElement) {
              const style=getComputedStyle(p), rect=p.getBoundingClientRect();
              if(['auto','scroll','hidden','clip'].includes(style.overflowY)&&(box.top<rect.top-1||box.bottom>rect.bottom+1)) return false;
            }
            return (hit===element||element.contains(hit))&&[...range.getClientRects()].every(line=>line.left>=box.left-1&&line.right<=box.right+1&&line.top>=box.top-1&&line.bottom<=box.bottom+1);
          }),true,`${frame}: keyboard reveals choice ${i+1}, with no footer or sibling occlusion`);
        }
        await page.keyboard.press('Home'); assert.equal(await buttons.first().evaluate(el=>document.activeElement===el),true);
        // Scroll the existing reading port to its last glyph. This proves a long answer is
        // inside its scroll extent, rather than present in DOM but clipped behind a fixed card.
        assert.equal(await reply.evaluate(element=> {
          const range=document.createRange(); const text=element.firstChild;
          range.setStart(text,Math.max(0,text.textContent.length-1)); range.setEnd(text,text.textContent.length);
          for(let p=element.parentElement;p;p=p.parentElement) {
            const style=getComputedStyle(p);
            if(!['auto','scroll'].includes(style.overflowY)) continue;
            const r=range.getBoundingClientRect(), box=p.getBoundingClientRect();
            if(r.bottom>box.bottom) p.scrollTop+=r.bottom-box.bottom+4;
            if(r.top<box.top) p.scrollTop-=box.top-r.top+4;
          }
          const last=range.getBoundingClientRect();
          if(last.top<0||last.left<0||last.right>innerWidth||last.bottom>Math.min(innerHeight,document.querySelector('.sxb-ops').getBoundingClientRect().top)+1) return false;
          for(let p=element;p;p=p.parentElement) {
            const style=getComputedStyle(p), box=p.getBoundingClientRect();
            if(['auto','scroll','hidden','clip'].includes(style.overflowY)&&(last.top<box.top-1||last.bottom>box.bottom+1)) return false;
            if(['auto','scroll','hidden','clip'].includes(style.overflowX)&&(last.left<box.left-1||last.right>box.right+1)) return false;
          }
          const hit=document.elementFromPoint((last.left+last.right)/2,(last.top+last.bottom)/2);
          return hit===element||element.contains(hit);
        }),true,`${frame}: the last word of the answer is scroll-reachable`);
        assert.deepEqual(errors,[],`${frame}: no runtime errors`);
      } finally { await page.close(); }
    }
  } finally { await browser?.close(); await server.close(); }
});
