"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), http = require("node:http");
const {chromium} = require("playwright");
const root = path.resolve(__dirname, "../app");
const browsers = [
  ["Edge", path.join(process.env["PROGRAMFILES(X86)"] || "", "Microsoft", "Edge", "Application", "msedge.exe")],
  ["Chrome", path.join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe")]
].filter(([, executable]) => fs.existsSync(executable));
const server = http.createServer((request, response) => {
  let name = new URL(request.url, "http://local").pathname;
  if (name.endsWith("/")) name += "index.html";
  const file = path.resolve(root, "." + decodeURIComponent(name));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { response.writeHead(404); response.end(); return; }
  response.writeHead(200, {"content-type": file.endsWith(".js") ? "application/javascript" : file.endsWith(".css") ? "text/css" : "text/html", "cache-control":"no-store"});
  response.end(fs.readFileSync(file));
});
const center = async locator => locator.evaluate(node => { const r=node.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}; });
const status = page => page.evaluate(() => ({url:location.pathname,visible:document.querySelector(".shell-nav-progress")?.dataset.visible,scale:document.querySelector(".shell-nav-progress")?.style.getPropertyValue("--nav-progress"),docks:document.querySelectorAll(".shell-bottom-nav").length,transition:document.documentElement.dataset.crossPageTransition,animation:getComputedStyle(document.documentElement,"::view-transition-new(root)").animationName}));
(async () => {
  assert(browsers.length, "Installed Chromium/Edge browser required");
  await new Promise(resolve => server.listen(0,"127.0.0.1",resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const results = [];
  try {
    for (const [browserName, executablePath] of browsers) {
      const browser = await chromium.launch({executablePath,headless:true,args:["--disable-background-networking"]});
      try {
        for (const width of [390,430,1024]) {
          const context = await browser.newContext({viewport:{width,height:900},isMobile:width<700,hasTouch:width<700});
          await context.addInitScript(() => localStorage.setItem("anyclass.onboardingCompleted","1"));
          const page = await context.newPage(), faults=[], progressEvents=[];
          page.on("pageerror",error=>faults.push(error.message));
          page.on("console",message=>{if(message.type()==="error")faults.push(message.text());if(message.text().startsWith("NAV_PROGRESS"))progressEvents.push(JSON.parse(message.text().slice(12)));});
          await page.goto(base+"/today/");
          await page.evaluate(() => document.addEventListener("click",event=>{if(event.target.closest("a"))console.log("NAV_PROGRESS"+JSON.stringify({visible:document.querySelector(".shell-nav-progress")?.dataset.visible,url:location.pathname}));}));
          const today = page.locator('.shell-bottom-nav a[href="/"]'), timetable = page.locator('.shell-bottom-nav a[href="/timetable/"]');
          const first = await center(today), second = await center(timetable);
          const cdp = width < 700 ? await context.newCDPSession(page) : null;
          const move = async (from,to) => {
            const transforms=[];
            for(let step=1;step<=5;step++){
              const x=from.x+(to.x-from.x)*step/5,y=from.y+(to.y-from.y)*step/5;
              if(cdp)await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x,y,id:1}]});
              else await page.mouse.move(x,y);
              transforms.push(await page.locator('.shell-bottom-nav').evaluate(node=>getComputedStyle(node,'::before').transform));
            }
            return transforms;
          };
          const down = async () => cdp ? cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:first.x,y:first.y,id:1}]}) : (await page.mouse.move(first.x,first.y),page.mouse.down());
          const up = async () => cdp ? cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]}) : page.mouse.up();
          await down();const positions=await move(first,second);
          assert(new Set(positions).size>=3,`${browserName}/${width}: pill follows continuous pointer position`);
          assert.equal(await timetable.getAttribute("data-preview"),"true",`${browserName}/${width}: pill follows scrub`);
          await move(second,first);await up();
          assert.equal(new URL(page.url()).pathname,"/today/",`${browserName}/${width}: return to active cancels`);
          assert.notEqual((await status(page)).visible,"true",`${browserName}/${width}: cancellation has no progress`);
          await down();await move(first,second);await up();
          await page.waitForURL(base+"/timetable/");
          assert(progressEvents.some(event=>event.visible==="true"),`${browserName}/${width}: progress begins on activation`);
          await page.evaluate(async()=>{if(document.activeViewTransition)await document.activeViewTransition.finished.catch(()=>{});});
          await page.locator('.shell-bottom-nav a[href="/"]').click();
          await page.waitForURL(base+"/");
          await page.evaluate(async()=>{if(document.activeViewTransition)await document.activeViewTransition.finished.catch(()=>{});});
          await page.locator('.shell-bottom-nav a[href="/timetable/"]').click();
          await page.waitForURL(base+"/timetable/");
          await page.waitForFunction(() => { const node=document.querySelector(".shell-nav-progress");return node?.dataset.visible === "false" && node.style.getPropertyValue("--nav-progress") === "0"; });
          const destination = await status(page);
          assert.equal(destination.docks,1);
          assert.equal(destination.transition,"true",`${browserName}/${width}: progressive transition`);
          assert.match(destination.animation,/shell-cross-page-in/);
          assert.equal(destination.scale,"0");
          assert.deepEqual(faults,[],`${browserName}/${width}: runtime errors`);
          results.push({browserName,width,dragCancel:"PASS",releaseNavigation:"PASS",rapidNavigation:"PASS",progressCleared:"PASS",transition:"PASS"});
          await context.close();
        }
        const context = await browser.newContext({viewport:{width:1024,height:900},reducedMotion:"reduce"}), page=await context.newPage();
        await context.addInitScript(() => localStorage.setItem("anyclass.onboardingCompleted","1"));
        await page.goto(base+"/today/");
        await page.locator('.shell-bottom-nav a[href="/timetable/"]').click();
        await page.waitForURL(base+"/timetable/");
        const reduced=await status(page);
        assert.equal(reduced.animation,"none");
        await page.waitForFunction(() => document.querySelector(".shell-nav-progress")?.dataset.visible === "false");
        results.push({browserName,reducedMotion:"PASS",essentialProgress:"PASS"});
        await context.close();
      } finally { await browser.close(); }
    }
    console.log(JSON.stringify({result:"PASS",results}));
  } finally { await new Promise(resolve=>server.close(resolve)); }
})().catch(error=>{console.error(error);process.exitCode=1;});
