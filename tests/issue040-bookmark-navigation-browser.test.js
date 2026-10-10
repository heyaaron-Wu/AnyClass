"use strict";
// Synthetic Chromium contract acceptance, not physical Safari storage/popup acceptance.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),{chromium}=require("playwright");
const app=process.env.ANYCLASS_BASELINE_APP||path.resolve(__dirname,"../app"),channels=require("../app/assets/timetable/import-client-channels"),beta=channels.CHANNELS.beta.pageOrigin,source="https://portal.example.invalid";
const script=channels.buildBookmarklet(fs.readFileSync(path.join(app,"assets/timetable/bookmarklet.txt"),"utf8"),"beta").slice(11);
const evidence=process.env.ANYCLASS_EVIDENCE_DIR||require("./local-artifacts").evidenceDirectory("issue040-bookmark-navigation");
const html='<!doctype html><meta charset="utf-8"><style>body{height:3000px}</style><button id="opener">导入</button><select id="xnm"><option value="2026">2026</option></select><select id="xqm"><option value="3">1</option></select><table id="kbgrid_table_0"><tr><td id="1-1"><div class="timetable_con"><p class="title">Synthetic Navigation Course</p><p><span class="glyphicon-time"></span>1-16周（1-2节）</p></div></td></tr></table>';
(async()=>{
 fs.mkdirSync(evidence,{recursive:true});let assertions=0;const check=(value,label)=>{assert(value,label);assertions++};
 const executablePath=[path.join(process.env.LOCALAPPDATA||"","Google/Chrome/Application/chrome.exe"),path.join(process.env["PROGRAMFILES(X86)"]||"","Microsoft/Edge/Application/msedge.exe")].find(fs.existsSync);
 const browser=await chromium.launch({headless:true,executablePath,args:["--disable-background-networking","--disable-features=ThirdPartyStoragePartitioning"]});
 try{for(const mode of ["automatic","manual","blocked"]){
  const context=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:"block"});let foreign=0;
  await context.route("**/*",route=>{const u=new URL(route.request().url());if(u.origin===source)return route.fulfill({contentType:"text/html",body:html});if(u.origin!==beta){foreign++;return route.abort()}let name=u.pathname;if(name.endsWith("/"))name+="index.html";const file=path.resolve(app,"."+name);if(!file.startsWith(app+path.sep)||!fs.existsSync(file))return route.fulfill({status:404});return route.fulfill({contentType:file.endsWith(".js")?"application/javascript":file.endsWith(".css")?"text/css":"text/html",body:fs.readFileSync(file)})});
  await context.addInitScript(()=>{window.__messages=[];addEventListener("message",e=>{if(e.data?.protocol==="timetable-import-v1")window.__messages.push(e.data)})});
  const page=await context.newPage();await page.goto(source);await page.locator("#opener").focus();await page.evaluate(()=>scrollTo({top:900,behavior:"instant"}));await page.evaluate(script);
  const popup=page.locator("#__ANYCLASS_IMPORT_POPUP__"),f=page.frameLocator("#__ANYCLASS_IMPORT_FRAME__");await f.locator("#filePreview:not([hidden]),#prepareReceiverTarget:not([hidden])").first().waitFor();
  if(await f.locator("#prepareReceiverTarget").isVisible()){await f.locator("#prepareReceiverTarget").evaluate(()=>Object.defineProperty(document,"requestStorageAccess",{configurable:true,value:()=>Promise.resolve({indexedDB})}));await f.locator("#prepareReceiverTarget").click()}
  await f.locator("#filePreview:not([hidden])").waitFor();const receiver=page.frames().find(x=>x.url().startsWith(beta));
  // Even correctly-originated messages cannot close an unsaved preview; nonce must also match.
  const nonce=await page.evaluate(()=>window.__messages.find(x=>x.type==="READY").nonce);
  await receiver.evaluate(n=>parent.postMessage({protocol:"timetable-import-v1",type:"NAVIGATION_RESULT",status:"OPENED",nonce:n},"https://portal.example.invalid"),nonce);
  await page.waitForFunction(()=>window.__messages.some(x=>x.type==="NAVIGATION_RESULT"));
  check(await popup.isVisible(),"navigation result before verified save is ignored");
  await f.locator("#fileSchoolName").fill("Synthetic School");await f.locator("#fileSemesterStart").fill("2026-08-31");await f.locator("#fileSave").waitFor({state:"visible"});await page.waitForTimeout(400);
  await f.locator("#fileSave").click();await page.waitForFunction(()=>window.__messages.some(x=>x.type==="IMPORT_SAVED"),null,{timeout:10000});
  const before=await receiver.evaluate(()=>AnyClassTimetableRepository.readActiveBundle());check(before.model.courses.length===1,"canonical timetable was saved before navigation");
  if(process.env.ANYCLASS_BASELINE_APP){
   await receiver.waitForURL(beta+"/today/");await page.screenshot({path:path.join(evidence,"beta6-before-iframe-today.png")});
   check(page.url()===source+"/","baseline school top-level remains unchanged");check(receiver.url()===beta+"/today/","baseline countdown reproduces incorrect iframe navigation");
   console.log(JSON.stringify({result:"ISSUE040_BASELINE_FAILURE_REPRODUCED",assertions,receiver:receiver.url(),top:page.url(),savedCourses:before.model.courses.length}));await context.close();break;
  }
  if(mode!=="automatic")await receiver.evaluate(()=>{window.__realOpen=window.open;window.open=()=>null});
  const nextPage=context.waitForEvent("page",{timeout:10000});
  if(mode!=="automatic"){
   await page.waitForFunction(()=>window.__messages.some(x=>x.type==="NAVIGATION_RESULT"&&x.status==="BLOCKED"&&x.mode==="automatic"));
   check(await popup.isVisible(),"blocked auto open preserves saved result");check(receiver.url().includes("/import/"),"Receiver never navigates to Today");check(/浏览器未允许自动打开/.test(await f.locator("#fileSubmitMessage").innerText()),"actionable fallback shown");
   if(mode==="blocked"){
    await receiver.evaluate(()=>{window.open=()=>{throw Error("synthetic popup policy")}});await f.locator("#fileGoToday").click();check(await popup.isVisible(),"throwing popup policy preserves result");
   }
   await receiver.evaluate(()=>{window.open=window.__realOpen});await f.locator("#fileGoToday").click();
  }
  const today=await nextPage;await today.waitForURL(beta+"/today/");await today.locator("#app").waitFor({state:"visible"});await popup.waitFor({state:"detached"});
  check(context.pages().length===2,"exactly one standalone tab created");
  check(page.url()===source+"/","school top-level remains unchanged");check(await page.evaluate(()=>scrollY===900&&document.activeElement.id==="opener"),"source scroll and focus restored");
  check(await today.evaluate(()=>opener===null),"new tab has no opener");await today.screenshot({path:path.join(evidence,mode+"-today.png")});
  await today.goto(beta+"/import/?method=file");const after=await today.evaluate(()=>AnyClassTimetableRepository.readActiveBundle());check(after.table.timetableId===before.table.timetableId&&after.model.courses.length===1,"first-party readback uses saved canonical timetable");await today.reload();check((await today.evaluate(()=>AnyClassTimetableRepository.readActiveBundle())).model.courses.length===1,"reload persistence");
  check(foreign===0,"zero Production or foreign application requests");await context.close();
 }if(!process.env.ANYCLASS_BASELINE_APP)console.log(JSON.stringify({result:"ISSUE040_BOOKMARK_NAVIGATION_PASS",assertions,cases:["automatic real new tab","blocked automatic then real manual","throwing policy then real manual"],evidence,syntheticStorageAccess:true}));}finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
