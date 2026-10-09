"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),{chromium}=require("playwright"),{evidenceDirectory}=require("./local-artifacts"),channels=require("../app/assets/timetable/import-client-channels");
const source="https://portal.example.invalid",beta=channels.CHANNELS.beta.pageOrigin,evidence=evidenceDirectory("popup-focus-origin"),baseline=process.env.ANYCLASS_BASELINE_APP;
(async()=>{
 const executablePath=[path.join(process.env.LOCALAPPDATA||"","Google/Chrome/Application/chrome.exe"),path.join(process.env["PROGRAMFILES(X86)"]||"","Microsoft/Edge/Application/msedge.exe")].find(fs.existsSync),browser=await chromium.launch({headless:true,executablePath,args:["--disable-background-networking"]});const records=[];
 try{
  for(const version of (baseline?["beta4","beta5"]:["beta5"]))for(const css of [false,true])for(const touch of [false,true]){
   const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:touch,colorScheme:"dark",serviceWorkers:"block"});
   await context.route("**/*",route=>new URL(route.request().url()).origin===source?route.fulfill({contentType:"text/html",body:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{height:3000px}'+(css?'button{box-shadow:0 0 0 2px #2563eb;text-shadow:0 0 1px blue}':'')+'</style><button id="opener">导入</button><select id="xnm"></select><select id="xqm"></select><table id="kbgrid_table_0"><td id="1-1"><div class="timetable_con">合成课</div></td></table>'}):route.fulfill({contentType:"text/html",body:"<!doctype html>Loading"}));
   const page=await context.newPage();await page.goto(source);if(touch)await page.locator("#opener").tap();else{await page.locator("#opener").focus();await page.keyboard.press("Space")}
   const app=version==="beta4"?baseline:path.join(__dirname,"../app"),code=channels.buildBookmarklet(fs.readFileSync(path.join(app,"assets/timetable/bookmarklet.txt"),"utf8"),"beta").slice(11);await page.evaluate(code);
   const close=page.locator("[data-anyclass-popup-close]"),measure=()=>close.evaluate(e=>{const c=getComputedStyle(e);return{focus:e===document.activeElement,visible:e.matches(":focus-visible"),outline:c.outlineWidth,style:c.outlineStyle,shadow:c.boxShadow,border:c.borderWidth}});
   const initial=await measure();await page.screenshot({path:path.join(evidence,`${version}-${css?"host-css":"clean"}-${touch?"touch":"keyboard"}-entry.png`)});
   if(version==="beta5"){assert(!initial.focus);assert.equal(initial.style,"none");assert.equal(initial.shadow,"none")}
   await page.keyboard.press("Tab");await close.focus();const keyboard=await measure();assert(keyboard.focus&&keyboard.visible);assert.equal(keyboard.outline,"3px");await page.screenshot({path:path.join(evidence,`${version}-${css?"host-css":"clean"}-${touch?"touch":"keyboard"}-focus.png`)});
   await close.click();assert.equal(await page.locator("#__ANYCLASS_IMPORT_POPUP__").count(),0);assert(await page.evaluate(()=>document.activeElement.id==="opener"));records.push({version,css,touch,initial,keyboard});await context.close();
  }
  fs.writeFileSync(path.join(evidence,"focus-metrics.json"),JSON.stringify(records,null,2));console.log(JSON.stringify({result:"POPUP_FOCUS_ORIGIN_PASS",cases:records.length,evidence,records}));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
