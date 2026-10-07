"use strict";
const assert = require("node:assert/strict");
const http = require("node:http"), fs = require("node:fs"), path = require("node:path");
const {chromium} = require("playwright");
const root = path.resolve(__dirname, "../app");
const diagnosticPath = path.join(require("./local-artifacts").evidenceDirectory("view-transition"), "view-transition-stress-diagnostic.json");
const stamp = () => new Date().toISOString();
function saveDiagnostic(payload) {
  fs.mkdirSync(path.dirname(diagnosticPath), {recursive:true});
  fs.writeFileSync(diagnosticPath, JSON.stringify(payload, null, 2));
  console.error(`View Transition diagnostic: ${diagnosticPath}`);
}
const exe = [path.join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe"), path.join(process.env["PROGRAMFILES(X86)"] || "", "Microsoft", "Edge", "Application", "msedge.exe")].find(fs.existsSync);
const server = http.createServer((req, res) => {
  let name = decodeURIComponent(new URL(req.url, "http://local").pathname);
  if (name.startsWith("/__vt/")) {
    const next = name.endsWith("a/") ? "b" : "a";
    res.writeHead(200,{"content-type":"text/html","cache-control":"no-store"});
    res.end(`<!doctype html><style>@view-transition { navigation: auto; }</style><a href="/__vt/${next}/">next</a><script>addEventListener('pagereveal',e=>console.log('VT_DIAG'+JSON.stringify({type:'pagereveal',url:location.pathname,vt:!!e.viewTransition})));addEventListener('pageswap',e=>console.log('VT_DIAG'+JSON.stringify({type:'pageswap',url:location.pathname,vt:!!e.viewTransition})))</script>`);
    return;
  }
  if (name.endsWith("/")) name += "index.html";
  const file = path.resolve(root, "." + name);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, {"content-type": file.endsWith(".js") ? "application/javascript" : file.endsWith(".css") ? "text/css" : "text/html", "cache-control": "no-store"});
  const content = fs.readFileSync(file);
  let body=content;
  if(["/timetable/index.html","/import/index.html"].includes(name)){
    if(process.env.VT_INLINE==="1")body=body.toString().replace("<head>","<head><style>@view-transition{navigation:auto}</style>");
    if(process.env.VT_EARLY_LINK==="1"){
      const html=body.toString(),match=html.match(/\s*<link rel="stylesheet" href="([^"]*product-shell\.css[^"]*)">/);
      if(match)body=html.replace(match[0],"").replace("<head>",`<head><link rel="stylesheet" href="${match[1]}">`);
    }
  }
  if(process.env.VT_NO_OPTIN==="1" && (name.endsWith("index.html") || name.endsWith("product-shell.css")))body=body.toString().replaceAll("navigation: auto", "navigation: none").replaceAll("navigation:auto", "navigation:none");
  res.end(body);
});
const pairs = [
  ["/today/", "/timetable/", '.shell-bottom-nav a[href="/timetable/"]'],
  ["/timetable/", "/settings/", '.shell-bottom-nav a[href="/settings/"]'],
  ["/settings/", "/local-status/", 'a[href="/local-status/"]'],
  ["/import/", "/", 'a[href="/"]'],
  ["/settings/", "/", ".shell-brand"],
  ["/", "/timetable/", '.shell-bottom-nav a[href="/timetable/"]']
];
(async () => {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({executablePath: exe, headless: true, args: ["--disable-background-networking", "--disable-features=OverlayScrollbar"]});
  const results = [];
  try {
    if(process.env.VT_ISOLATED==="1") {
      const records=[];
      try {
        for(let cycle=0;cycle<Number(process.env.VT_CYCLES||30);cycle++) {
          const context=await browser.newContext({viewport:{width:1024,height:900}});
          const page=await context.newPage(), events=[], diagnostics=[];
          try {
            await context.addInitScript(() => localStorage.setItem("anyclass.onboardingCompleted","1"));
            await page.addInitScript(() => {
              for(const eventName of ["pageswap","pagereveal"])addEventListener(eventName,event=>{
                console.log("VT_DIAG"+JSON.stringify({event:eventName,url:location.pathname,vt:!!event.viewTransition}));
                if(event.viewTransition)for(const phase of ["ready","finished"])event.viewTransition[phase].then(()=>console.log("VT_DIAG"+JSON.stringify({event:phase,url:location.pathname,result:"fulfilled"})),error=>console.log("VT_DIAG"+JSON.stringify({event:phase,url:location.pathname,result:"rejected",reason:error.message})));
              });
            });
            page.on("console",msg=>{const entry={category:"console",timestamp:stamp(),pageUrl:page.url(),type:msg.type(),message:msg.text(),location:msg.location()};if(msg.text().startsWith("VT_DIAG"))events.push({...JSON.parse(msg.text().slice(7)),timestamp:entry.timestamp});else diagnostics.push(entry)});
            page.on("pageerror",error=>diagnostics.push({category:"pageerror",timestamp:stamp(),pageUrl:page.url(),message:error.message,stack:error.stack}));
            page.on("requestfailed",request=>diagnostics.push({category:"requestfailed",timestamp:stamp(),pageUrl:page.url(),requestUrl:request.url(),reason:request.failure()?.errorText||null}));
            page.on("response",response=>{if(response.status()>=400)diagnostics.push({category:"http_error",timestamp:stamp(),pageUrl:page.url(),requestUrl:response.url(),status:response.status()})});
            await page.goto(base+"/import/");
            const startedAt=stamp(),eventAt=events.length,diagnosticAt=diagnostics.length;
            await page.evaluate(()=>{const link=document.createElement("a");link.href="/today/";link.textContent="测试导航";link.setAttribute("data-vt-diagnostic","today");document.body.append(link)});
            await page.locator('a[data-vt-diagnostic="today"]').click();
            await page.waitForURL(base+"/today/");
            await page.evaluate(async()=>{if(document.activeViewTransition)await document.activeViewTransition.finished.catch(()=>{});await new Promise(resolve=>requestAnimationFrame(resolve))});
            const navigationEvents=events.slice(eventAt),issues=diagnostics.slice(diagnosticAt);
            const record={cycle,sourceUrl:base+"/import/",destinationUrl:base+"/today/",startedAt,finishedAt:stamp(),finalUrl:page.url(),pageswap:navigationEvents.some(event=>event.event==="pageswap"&&event.vt),pagereveal:navigationEvents.some(event=>event.event==="pagereveal"&&event.vt),ready:navigationEvents.find(event=>event.event==="ready")?.result||null,finished:navigationEvents.find(event=>event.event==="finished")?.result||null,events:navigationEvents,diagnostics:issues};
            records.push(record);
            assert.equal(record.finalUrl,record.destinationUrl,`isolated cycle ${cycle}: destination`);
            assert.equal(record.pageswap,true,`isolated cycle ${cycle}: pageswap`);
            assert.equal(record.pagereveal,true,`isolated cycle ${cycle}: pagereveal`);
            assert.equal(record.ready,"fulfilled",`isolated cycle ${cycle}: ready`);
            assert.equal(record.finished,"fulfilled",`isolated cycle ${cycle}: finished`);
            assert.equal(issues.filter(item=>item.category!=="console"||["warning","error"].includes(item.type)).length,0,`isolated cycle ${cycle}: runtime/request errors`);
          } finally {await context.close()}
        }
        console.log(JSON.stringify({browser:browser.version(),isolated:true,cycles:records.length,records},null,2));
      } catch(error) {saveDiagnostic({browser:browser.version(),isolated:true,failure:{message:error.message,stack:error.stack},records});throw error}
      return;
    }
    if (process.env.VT_STRESS === "1") {
      const context = await browser.newContext({viewport:{width:1024,height:900},reducedMotion:process.env.VT_REDUCED === "1" ? "reduce" : "no-preference"});
      await context.addInitScript(() => localStorage.setItem("anyclass.onboardingCompleted","1"));
      const page = await context.newPage(), log = [], diagnostics = [], responses = [];
      page.on("console", msg => {
        const entry={timestamp:stamp(),pageUrl:page.url(),type:msg.type(),message:msg.text(),location:msg.location()};
        if(msg.text().startsWith("VT_DIAG"))log.push({...JSON.parse(msg.text().slice(7)),timestamp:entry.timestamp});
        else diagnostics.push({category:"console",...entry});
      });
      page.on("pageerror",e=>diagnostics.push({category:"pageerror",timestamp:stamp(),pageUrl:page.url(),message:e.message,stack:e.stack}));
      page.on("requestfailed",r=>diagnostics.push({category:"requestfailed",timestamp:stamp(),pageUrl:page.url(),requestUrl:r.url(),reason:r.failure()?.errorText||null}));
      page.on("response",r=>{
        if(r.status()>=400)diagnostics.push({category:"http_error",timestamp:stamp(),pageUrl:page.url(),requestUrl:r.url(),status:r.status()});
        if(new URL(r.url()).pathname==="/assets/timetable/product-shell.css")responses.push({url:page.url(),status:r.status(),type:r.headers()["content-type"]});
      });
      await page.addInitScript(() => {
        addEventListener("pageshow",e=>console.log("VT_DIAG"+JSON.stringify({event:"pageshow",url:location.pathname,persisted:e.persisted,visibility:document.visibilityState})));
        for(const type of ["pageswap","pagereveal"])addEventListener(type,e=>{
          const a=window.navigation?.activation;
          console.log("VT_DIAG"+JSON.stringify({event:type,url:location.pathname,vt:!!e.viewTransition,visibility:document.visibilityState,active:!!document.activeViewTransition,from:a?.from?.url||null,to:a?.entry?.url||null,navType:a?.navigationType||null}));
          if(e.viewTransition)for(const phase of ["ready","finished"])e.viewTransition[phase].then(()=>console.log("VT_DIAG"+JSON.stringify({event:phase,url:location.pathname,result:"fulfilled"})),err=>console.log("VT_DIAG"+JSON.stringify({event:phase,url:location.pathname,result:"rejected",reason:err.message})));
        });
      });
      await page.goto(base+"/today/");
      const dockOrigin=await page.locator(".shell-bottom-nav").evaluate(node=>node.getBoundingClientRect().x);
      const hops=[["/timetable/",'.shell-bottom-nav a[href="/timetable/"]'],["/settings/",'.shell-bottom-nav a[href="/settings/"]'],["/import/",'a[data-vt-diagnostic="import"]'],["/today/",'a[data-vt-diagnostic="today"]']];
      const records=[];
      const isolated=false;
      try {
      for(let cycle=0;cycle<Number(process.env.VT_CYCLES||20);cycle++)for(const [to,selector] of hops){
        const from=new URL(page.url()).pathname, logAt=log.length, diagnosticAt=diagnostics.length, responseAt=responses.length, startedAt=stamp();
        if(selector.includes("data-vt-diagnostic"))await page.evaluate(([href,selector])=>{const a=document.createElement("a");a.href=href;a.textContent="测试导航";a.setAttribute("data-vt-diagnostic",selector.includes("import")?"import":"today");a.style.cssText="position:fixed;top:20px;right:20px;z-index:9999";document.body.append(a)},[to,selector]);
        await page.locator(selector).click();await page.waitForURL(base+to);
        await page.evaluate(async()=>{if(document.activeViewTransition)await document.activeViewTransition.finished.catch(()=>{});await new Promise(resolve=>requestAnimationFrame(resolve))});
        const state=await page.evaluate(()=>({url:location.pathname,optIn:[...document.styleSheets].flatMap(s=>{try{return [...s.cssRules]}catch{return []}}).filter(r=>r.cssText.startsWith("@view-transition")).map(r=>r.cssText),active:!!document.activeViewTransition,direction:document.documentElement.dataset.crossPageDirection||null,dock:document.querySelector(".shell-bottom-nav")?.getBoundingClientRect().x,dockCount:document.querySelectorAll(".shell-bottom-nav").length,entryAnimation:getComputedStyle(document.querySelector("main")).animationName,rootAnimation:getComputedStyle(document.documentElement,"::view-transition-new(root)").animationName}));
        const events=log.slice(logAt),sw=events.filter(e=>e.event==="pageswap"&&e.url===from).at(-1),rev=events.filter(e=>e.event==="pagereveal"&&e.url===to).at(-1);
        records.push({cycle,from,to,startedAt,finishedAt:stamp(),pageswapFired:!!sw,pageswap:sw?.vt??null,pagerevealFired:!!rev,pagereveal:rev?.vt??null,ready:events.find(e=>e.event==="ready")?.result||null,finished:events.find(e=>e.event==="finished")?.result||null,events,diagnostics:diagnostics.slice(diagnosticAt),css:responses.slice(responseAt),state});
      }
      for(const record of records){
        assert.equal(record.state.url,record.to,`${record.from} -> ${record.to}: navigation`);
        assert.equal(record.diagnostics.filter(item=>item.category!=="console"||["warning","error"].includes(item.type)).length,0,`${record.from} -> ${record.to}: console/runtime/request errors`);
        assert(record.css.some(item=>item.status===200&&item.type?.startsWith("text/css")),`${record.to}: stylesheet response`);
        assert.equal(record.state.active,false,`${record.to}: stale active transition`);
        if(["/today/","/timetable/","/import/"].includes(record.to)){
          assert.equal(record.state.dockCount,1,`${record.to}: one Dock`);
          assert(Math.abs(record.state.dock-dockOrigin)<0.5,`${record.to}: stable Dock x`);
        }
        if(process.env.VT_NO_OPTIN==="1"){
          assert.equal(record.pagereveal,false,`${record.from} -> ${record.to}: disabled fallback`);
          assert(record.state.optIn.every(rule=>rule.includes("navigation: none")),`${record.to}: disabled rule`);
        }else{
          assert.equal(record.pageswap,true,`${record.from} -> ${record.to}: source transition`);
          assert.equal(record.pagereveal,true,`${record.from} -> ${record.to}: destination transition`);
          assert.equal(record.ready,"fulfilled",`${record.to}: transition.ready`);
          assert.equal(record.finished,"fulfilled",`${record.to}: transition.finished`);
          assert(record.state.optIn.some(rule=>rule.includes("navigation: auto")),`${record.to}: opt-in rule`);
        }
        if(process.env.VT_REDUCED==="1"){
          assert.equal(record.state.entryAnimation,"none",`${record.to}: reduced entry motion`);
          assert.equal(record.state.rootAnimation,"none",`${record.to}: reduced transition motion`);
        }
      }
      assert.equal(diagnostics.filter(item=>item.category!=="console"||["warning","error"].includes(item.type)).length,0,"all navigation runtime errors");
      console.log(JSON.stringify({browser:browser.version(),cycles:Number(process.env.VT_CYCLES||20),records,diagnostics},null,2));
      } catch(error) {
        saveDiagnostic({browser:browser.version(),isolated,cyclesRequested:Number(process.env.VT_CYCLES||20),failure:{message:error.message,stack:error.stack},records,diagnostics});
        throw error;
      }
      await context.close();
      return;
    }
    for (const [from, to, selector] of (process.env.VT_FAST === "1" ? pairs.slice(0,1) : pairs)) {
      const context = await browser.newContext({viewport: {width: 1024, height: 900}});
      await context.addInitScript(() => localStorage.setItem("anyclass.onboardingCompleted", "1"));
      const page = await context.newPage();
      const events = [], errors = [], css = [];
      page.on("console", msg => {if (msg.text().startsWith("VT_DIAG")) events.push(JSON.parse(msg.text().slice(7))); else if (msg.type() === "error") errors.push({kind:"console", text:msg.text()});});
      page.on("pageerror", error => errors.push({kind:"pageerror", text:error.message}));
      page.on("response", response => {if (new URL(response.url()).pathname === "/assets/timetable/product-shell.css") css.push({status:response.status(), type:response.headers()["content-type"]});});
      await page.addInitScript(() => {
        for (const type of ["pageswap", "pagereveal"]) addEventListener(type, event => {
          const activation = window.navigation?.activation;
          const data = {type, url:location.pathname, vt:!!event.viewTransition, visibility:document.visibilityState, from:activation?.from?.url || null, to:activation?.entry?.url || null, navType:activation?.navigationType || null};
          console.log("VT_DIAG" + JSON.stringify(data));
          if (event.viewTransition) for (const phase of ["ready", "finished"]) event.viewTransition[phase].then(() => console.log("VT_DIAG"+JSON.stringify({type:phase,url:location.pathname,result:"fulfilled"})), error => console.log("VT_DIAG"+JSON.stringify({type:phase,url:location.pathname,result:"rejected",reason:error.message})));
        });
      });
      await page.goto(base + from);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const before = await page.evaluate(() => ({rule:[...document.styleSheets].flatMap(s=>{try{return [...s.cssRules]}catch{return []}}).filter(r=>r.cssText.startsWith("@view-transition")).map(r=>r.cssText), activeSupport:"activeViewTransition" in document}));
      await page.locator(selector).first().click();
      await page.waitForURL(base + to);
      await page.waitForTimeout(500);
      const after = await page.evaluate(() => ({rule:[...document.styleSheets].flatMap(s=>{try{return [...s.cssRules]}catch{return []}}).filter(r=>r.cssText.startsWith("@view-transition")).map(r=>r.cssText), active:document.documentElement.dataset.crossPageTransition || null, activeSupport:"activeViewTransition" in document}));
      results.push({from,to,before,after,events,errors,css});
      await context.close();
    }
    if (process.env.VT_FAST !== "1") {
    const context = await browser.newContext({viewport: {width: 1024, height: 900}});
    await context.addInitScript(() => localStorage.setItem("anyclass.onboardingCompleted", "1"));
    const page = await context.newPage(), sequence = [], errors = [];
    page.on("pageerror", e => errors.push({url:page.url(),message:e.message}));
    await page.addInitScript(() => {
      for (const type of ["pageswap", "pagereveal"]) addEventListener(type, event => console.log("VT_DIAG"+JSON.stringify({type,url:location.pathname,vt:!!event.viewTransition})));
    });
    let transitionEvents = [];
    page.on("console", msg => {if(msg.text().startsWith("VT_DIAG"))transitionEvents.push(JSON.parse(msg.text().slice(7)));});
    await page.goto(base+"/today/");
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    for(const [to, selector] of [["/timetable/",'.shell-bottom-nav a[href="/timetable/"]'],["/settings/",'.shell-bottom-nav a[href="/settings/"]'],["/",'.shell-brand'],["/timetable/",'.shell-bottom-nav a[href="/timetable/"]']]) {
      const old=page.url(), fromIndex=transitionEvents.length;
      await page.locator(selector).click(); await page.waitForURL(base+to);
      await page.waitForTimeout(350);
      sequence.push({old,to,events:transitionEvents.slice(fromIndex),active:await page.evaluate(()=>document.documentElement.dataset.crossPageTransition||null)});
    }
    results.push({sequence,errors});
    await context.close();
    const minimal=[];
    for(let i=0;i<12;i++) {
      const c=await browser.newContext(), p=await c.newPage(), events=[], faults=[];
      p.on("console",m=>{if(m.text().startsWith("VT_DIAG"))events.push(JSON.parse(m.text().slice(7)))});
      p.on("pageerror",e=>faults.push(e.message));
      await p.goto(base+"/__vt/a/");
      await p.locator("a").click(); await p.waitForURL(base+"/__vt/b/");
      await p.waitForTimeout(400);
      minimal.push({events,faults}); await c.close();
    }
    results.push({minimal});
    }
    console.log(JSON.stringify({browser:browser.version(),results},null,2));
  } finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); }
})().catch(error => {console.error(error);process.exitCode=1});
