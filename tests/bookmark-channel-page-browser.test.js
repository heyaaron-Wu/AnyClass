"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {chromium}=require("playwright"),root=path.resolve(__dirname,"../app"),beta="https://beta.anyclass.heyaaron.asia",stable="https://anyclass.heyaaron.asia",source="https://portal.example.invalid";
const live=process.env.ANYCLASS_LIVE_CHANNEL_PAGES==="1";
const executablePath=[path.join(process.env.LOCALAPPDATA||"","Google","Chrome","Application","chrome.exe"),path.join(process.env["PROGRAMFILES(X86)"]||"","Microsoft","Edge","Application","msedge.exe")].find(fs.existsSync);
const teaching='<!doctype html><meta charset="utf-8"><select id="xnm"><option value="2026" selected>2026</option></select><select id="xqm"><option value="3" selected>1</option></select><table id="kbgrid_table_0"><tbody><tr><td id="1-1"><div class="timetable_con"><p class="title">Course A</p><p><span class="glyphicon-time"></span>1-2周（1-2节）</p><p><span class="glyphicon-user"></span>Teacher A</p><p><span class="glyphicon-map-marker"></span>Room A</p></div></td></tr></tbody></table>';
const serveApp=async route=>{
  const url=new URL(route.request().url());
  if(url.origin===source)return route.fulfill({status:200,contentType:"text/html",body:teaching});
  if(live&&(url.origin===beta||url.origin===stable))return route.continue();
  let name=decodeURIComponent(url.pathname);if(name.endsWith("/"))name+="index.html";
  const file=path.resolve(root,"."+name);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:"not found"});
  const type=file.endsWith(".js")?"application/javascript":file.endsWith(".css")?"text/css":file.endsWith(".json")?"application/json":file.endsWith(".txt")?"text/plain":"text/html";
  return route.fulfill({status:200,contentType:type,body:fs.readFileSync(file)});
};
const targetOf=text=>text.match(/const\s+TARGET_ORIGIN\s*=\s*"([^"]+)"/)?.[1]||null,channelOf=text=>text.match(/channel\s*:\s*"([^"]+)"/)?.[1]||null;
const shortcutUrl={beta:"https://www.icloud.com/shortcuts/2d1a3282109345918058db7cf1efd818",stable:"https://www.icloud.com/shortcuts/8b151aa3c24441c3b87c6f2b85fa5f37"};
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath,args:["--disable-background-networking"]}),context=await browser.newContext({serviceWorkers:"block"});
  let betaRequests=0,stableRequests=0;
  await context.route("**/*",async route=>{const origin=new URL(route.request().url()).origin;if(origin===beta)betaRequests++;if(origin===stable)stableRequests++;return serveApp(route)});
  await context.addInitScript(()=>Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:async text=>{window.__copiedBookmarklet=text}}}));
  try{
    const results={};
    for(const item of [{channel:"beta",origin:beta,other:stable},{channel:"stable",origin:stable,other:beta}]){
      const page=await context.newPage();await page.goto(item.origin+`/import/?method=desktop&channelAudit=${Date.now()}`);await page.locator("#copyBookmarklet").click();await page.waitForFunction(()=>typeof window.__copiedBookmarklet==="string");
      const text=await page.evaluate(()=>window.__copiedBookmarklet);assert.equal(targetOf(text),item.origin);if(!(live&&item.channel==="stable"&&channelOf(text)===null))assert.equal(channelOf(text),item.channel);assert(!text.includes(item.other));
      await page.goto(item.origin+`/import/?method=mobile&channelAudit=${Date.now()}`);
      assert.equal(await page.locator("#addImportShortcut").getAttribute("href"),shortcutUrl[item.channel]);
      assert.equal((await page.locator("#importShortcutTarget").innerText()).trim(),item.origin+"/import/?method=file");
      results[item.channel]={target:targetOf(text),channel:channelOf(text),status:"渠道与快捷指令目标正确",shortcutUrl:shortcutUrl[item.channel]};await page.close();
    }
    results.visualMatrix=[];
    for(const width of [390,430,768,1280])for(const theme of ["light","dark"]){
      const page=await context.newPage();await page.setViewportSize({width,height:900});await page.goto(beta+`/import/?method=mobile&theme=${theme}&channelAudit=${Date.now()}`);
      await page.evaluate(value=>localStorage.setItem("anyclass:theme",value),theme);await page.reload();await page.waitForLoadState("domcontentloaded");
      const metrics=await page.evaluate(()=>{const link=document.querySelector("#addImportShortcut"),target=document.querySelector("#importShortcutTarget");return{overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,linkVisible:!!link&&getComputedStyle(link).visibility!=="hidden"&&link.getBoundingClientRect().width>0,targetVisible:!!target&&getComputedStyle(target).visibility!=="hidden"&&target.getBoundingClientRect().width>0,href:link?.href,target:target?.textContent?.trim()}});
      assert.equal(metrics.overflow,false);assert.equal(metrics.linkVisible,true);assert.equal(metrics.targetVisible,true);assert.equal(metrics.href,shortcutUrl.beta);assert.equal(metrics.target,beta+"/import/?method=file");results.visualMatrix.push({width,theme,result:"PASS"});await page.close();
    }
    const before={beta:betaRequests,stable:stableRequests},sourcePage=await context.newPage();await sourcePage.goto(source+"/timetable");
    const betaPage=await context.newPage();await betaPage.goto(beta+`/import/?method=desktop&channelAudit=${Date.now()}`);await betaPage.locator("#copyBookmarklet").click();await betaPage.waitForFunction(()=>typeof window.__copiedBookmarklet==="string");
    const betaBookmarklet=await betaPage.evaluate(()=>window.__copiedBookmarklet);await betaPage.close();await sourcePage.evaluate(code=>(0,eval)(code.slice("javascript:".length)),betaBookmarklet);
    await sourcePage.waitForFunction(()=>document.querySelector("#__ANYCLASS_IMPORT_FRAME__")?.src.startsWith("https://beta.anyclass.heyaaron.asia/import/"));
    const receiverUrl=new URL(await sourcePage.locator("#__ANYCLASS_IMPORT_FRAME__").getAttribute("src"));
    assert.equal(receiverUrl.searchParams.get("sourceOrigin"),source,"generic public Bookmark must declare its exact source origin");
    await sourcePage.waitForFunction(()=>document.querySelector("#__ANYCLASS_IMPORT_STATUS__")?.textContent.includes("已识别 1 个课程安排"));
    assert.match(await sourcePage.locator("#__ANYCLASS_IMPORT_STATUS__").innerText(),/已识别 1 个课程安排/);
    await sourcePage.evaluate(code=>(0,eval)(code.slice("javascript:".length)),betaBookmarklet);
    await sourcePage.waitForFunction(()=>document.querySelectorAll("#__ANYCLASS_IMPORT_FRAME__").length===1&&typeof window.__ANYCLASS_IMPORT_CLEANUP__==="function");
    await sourcePage.waitForFunction(()=>document.querySelector("#__ANYCLASS_IMPORT_STATUS__")?.textContent.includes("已识别 1 个课程安排"));
    assert(betaRequests>before.beta,"Beta Bookmark must request the Beta receiver");assert.equal(stableRequests,before.stable,"Beta Bookmark must make zero Production requests");
    results.execution={betaRequests:betaRequests-before.beta,productionRequests:stableRequests-before.stable};console.log(JSON.stringify({result:"BOOKMARK_CHANNEL_PAGE_PASS",mode:live?"LIVE":"LOCAL",results},null,2));
  }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
